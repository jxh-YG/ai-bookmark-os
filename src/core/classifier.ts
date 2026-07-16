// 两阶段 Map-Reduce 分类编排
import type {
  BookmarkLabel,
  CategoryNode,
  ClassificationScope,
  ClassifyProgress,
  ClassifyResult,
  FlatBookmark,
  Settings,
} from '../types';
import { chat, extractJson } from './llm';
import { resolveClassifyPrompts } from '../types';
import { hashUrl, loadCache, saveCache, type CachedPageContext } from './cache';

/** 调用 LLM 并解析 JSON；失败时追加“只输出 JSON”修复提示重试一次 */
async function chatJson<T>(
  settings: Settings,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: {
    signal: AbortSignal;
    maxTokens?: number;
    onRetry?: (info: { attempt: number; maxRetries: number; delayMs: number; reason: string }) => void;
  },
): Promise<{ data: T; content: string }> {
  const content = await chat(settings, messages, opts);
  try {
    return { data: extractJson<T>(content), content };
  } catch (firstErr) {
    const repair = await chat(
      settings,
      [
        ...messages,
        { role: 'assistant', content: content.slice(0, 6000) },
        {
          role: 'user',
          content:
            '你刚才的回复无法被解析为 JSON。请严格只输出合法 JSON（不要 markdown 代码块、不要解释文字）。' +
            '若应输出数组请以 [ 开头、以 ] 结尾。',
        },
      ],
      { ...opts, maxTokens: opts.maxTokens ?? 4096 },
    );
    try {
      return { data: extractJson<T>(repair), content: repair };
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }
}


const BATCH_SIZE = 40;
const CONCURRENCY = 2;
const ASSIGN_BATCH_SIZE = 60;

/** 从 settings 读取批次大小和并发数（带安全范围夹拢） */
function batchSize(settings: Settings): number {
  const v = Number((settings as any).labelBatchSize ?? BATCH_SIZE);
  return Number.isFinite(v) ? Math.min(80, Math.max(10, Math.floor(v))) : BATCH_SIZE;
}
function concurrency(settings: Settings): number {
  const v = Number((settings as any).labelConcurrency ?? CONCURRENCY);
  return Number.isFinite(v) ? Math.min(5, Math.max(1, Math.floor(v))) : CONCURRENCY;
}
function assignBatchSize(settings: Settings): number {
  const v = Number((settings as any).assignBatchSize ?? ASSIGN_BATCH_SIZE);
  return Number.isFinite(v) ? Math.min(100, Math.max(10, Math.floor(v))) : ASSIGN_BATCH_SIZE;
}
type ProgressFn = (p: ClassifyProgress) => void;

/** Callers that need to archive the old draft first can defer the legacy storage write. */
export interface ClassifyRunOptions {
  persist?: boolean;
}

const FULL_RESULT_STORAGE_KEY = 'classifyResult';
const PARTIAL_RESULT_STORAGE_PREFIX = 'partialClassifyResult:';
const MAX_PARTIAL_SAVED_RESULTS = 5;
const MAX_SAVED_RESULT_BYTES = 8 * 1024 * 1024;

function resultStorageKey(scope?: ClassificationScope): string {
  if (scope?.mode !== 'partial') return FULL_RESULT_STORAGE_KEY;
  const targetDirectoryId = scope.targetDirectoryId.trim();
  if (!targetDirectoryId) throw new Error('局部分类必须指定目标目录。');
  return `${PARTIAL_RESULT_STORAGE_PREFIX}${targetDirectoryId}`;
}

function resultCreatedAt(value: unknown): number {
  if (!value || typeof value !== 'object' || !('createdAt' in value)) return 0;
  const createdAt = (value as { createdAt?: unknown }).createdAt;
  return typeof createdAt === 'number' ? createdAt : 0;
}

async function prunePartialResults(currentKey: string): Promise<void> {
  const data = await chrome.storage.local.get(null);
  const partialEntries = Object.entries(data)
    .filter(([key]) => key.startsWith(PARTIAL_RESULT_STORAGE_PREFIX));
  const removableCount = Math.max(
    0,
    partialEntries.length + (data[currentKey] === undefined ? 1 : 0) - MAX_PARTIAL_SAVED_RESULTS,
  );
  const staleKeys = partialEntries
    .filter(([key]) => key !== currentKey)
    .sort(([, left], [, right]) => resultCreatedAt(left) - resultCreatedAt(right))
    .slice(0, removableCount)
    .map(([key]) => key);
  if (staleKeys.length) await chrome.storage.local.remove(staleKeys);
}

export async function saveClassifyResult(result: ClassifyResult): Promise<void> {
  const key = resultStorageKey(result.scope);
  if (result.scope?.mode === 'partial') await prunePartialResults(key);
  // Persist the usable plan, not unbounded raw model transcripts.
  const persisted: ClassifyResult = { ...result };
  delete persisted.aiResponses;
  const bytes = new TextEncoder().encode(JSON.stringify(persisted)).length;
  if (bytes > MAX_SAVED_RESULT_BYTES) {
    throw new Error('分类草稿过大，无法安全保存；请缩小分类范围后重试。');
  }
  await chrome.storage.local.set({ [key]: persisted });
}

function retryMessage(attempt: number, maxRetries: number, delayMs: number): string {
  return `AI 连接失败，${Math.ceil(delayMs / 1000)} 秒后重连（${attempt}/${maxRetries}）`;
}

/** 是否参照原有书签夹（默认开启） */
function respectFolders(settings: Settings): boolean {
  return settings.respectExistingFolders !== false;
}

/** 是否把上一次 AI 分类树作为建树参考（默认关闭，避免旧树压过用户提示词） */
function reusePreviousTree(settings: Settings): boolean {
  return settings.reusePreviousAiTree === true;
}

/** 是否使用 URL 标签缓存（默认开启，关闭后每次重新打标） */
function useClassificationCache(settings: Settings): boolean {
  return settings.useClassificationCache !== false;
}

/** 是否抓取页面 meta 补充语义（默认开启） */
function usePageMetadata(settings: Settings): boolean {
  return settings.usePageMetadata !== false;
}

/** 是否追加内置分类保护规则（默认开启） */
function useBuiltInClassificationRules(settings: Settings): boolean {
  return settings.useBuiltInClassificationRules !== false;
}

function originalFolderInstruction(settings: Settings): string {
  if (!respectFolders(settings)) {
    return '\n\n原书签文件夹不会提供，也不得作为分类依据。请根据书签标题、URL 路径、站点信息、页面描述和正文摘录判断实际用途。';
  }
  return '\n\n原书签文件夹会作为参考信号提供。它可帮助识别公司、项目、业务系统或长期使用场景，但不要机械复制原目录；当标题、URL 和页面内容明显指向更合适的用途时，以语义用途为准。';
}

function builtInRuleInstruction(settings: Settings): string {
  if (!useBuiltInClassificationRules(settings)) return '';
  return '\n\n内置分类保护规则：与企业办公、客户/供应商、项目协作、CRM、ERP、工单、文档、邮箱、招聘、财务、人事、合同、报销等相关的书签，应优先识别公司、团队、项目或业务系统名称；同一公司或同一办公场景的多个链接尽量聚合，不要仅按页面功能分散到多个无关分类。';
}

const ROOT_FOLDER_ALIASES = new Set([
  '书签栏',
  '书签菜单',
  '其他书签',
  '移动设备书签',
  'bookmarks bar',
  'bookmarks menu',
  'other bookmarks',
  'mobile bookmarks',
  '收藏夹栏',
  '其他收藏夹',
]);

/** 规范化原文件夹路径：去掉浏览器根目录名，可限制最大层级 */
function normalizeFolderParts(folderPath: string, maxDepth = 3): string[] {
  const parts = String(folderPath || '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !ROOT_FOLDER_ALIASES.has(p.toLowerCase()) && !ROOT_FOLDER_ALIASES.has(p));
  return Number.isFinite(maxDepth) ? parts.slice(0, maxDepth) : parts;
}

function fullFolderKey(folderPath: string): string {
  return normalizeFolderParts(folderPath, Number.POSITIVE_INFINITY).join('/');
}

function preservedFolderSet(settings: Settings): Set<string> {
  if (!respectFolders(settings)) return new Set();
  return new Set((settings.preservedFolderPaths ?? []).map((p) => fullFolderKey(p)).filter(Boolean));
}

/** 保留文件夹的 Chrome ID 集合（当路径匹配失效时的备用） */
function preservedFolderIdSet(settings: Settings): Set<string> {
  if (!respectFolders(settings)) return new Set();
  return new Set((settings.preservedFolderIds ?? []).filter(Boolean));
}

function preservedFolderPathFor(bookmark: FlatBookmark, paths: Set<string>): string | null {
  const key = fullFolderKey(bookmark.folderPath);
  if (!key) return null;
  return [...paths]
    .filter((p) => key === p || key.startsWith(p + '/'))
    .sort((a, b) => a.split('/').length - b.split('/').length)[0] ?? null;
}

/**
 * 判断书签是否位于保留文件夹中。
 * 优先通过路径字符串匹配；若路径集合为空（用户重命名了保留文件夹等），
 * 则尝试通过 Chrome folderPath 中各级目录 ID 反查保留 ID 集合。
 * 注意：此处的 ID 反查依赖 folderPath 中存储了目录 ID 的扩展方案，
 * 但标准 FlatBookmark 只有字符串 folderPath，因此 ID 匹配需要在
 * 调用层（classify 入口）将 preservedFolderIds 转换为对应的路径后传入。
 */
function isInPreservedFolder(
  bookmark: FlatBookmark,
  paths: Set<string>,
  _preservedIds?: Set<string>,
): boolean {
  return preservedFolderPathFor(bookmark, paths) !== null;
}

/** 把用户选择保持原样的原书签夹转成含书签 id 的分类树 */
function buildPreservedTree(bookmarks: FlatBookmark[], paths: Set<string>): CategoryNode[] {
  if (!paths.size) return [];
  type Mutable = { name: string; children: Map<string, Mutable>; bookmarkIds: string[] };
  const root = new Map<string, Mutable>();

  for (const bookmark of bookmarks) {
    const selectedPath = preservedFolderPathFor(bookmark, paths);
    if (!selectedPath) continue;
    const parts = normalizeFolderParts(bookmark.folderPath, Number.POSITIVE_INFINITY);
    const selectedParts = selectedPath.split('/');
    const visibleParts = parts.slice(selectedParts.length - 1);
    if (!visibleParts.length) continue;
    let level = root;
    let node: Mutable | undefined;
    for (const name of visibleParts) {
      node = level.get(name);
      if (!node) {
        node = { name, children: new Map(), bookmarkIds: [] };
        level.set(name, node);
      }
      level = node.children;
    }
    node?.bookmarkIds.push(bookmark.id);
  }

  const toNodes = (nodes: Map<string, Mutable>): CategoryNode[] =>
    [...nodes.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      .map((node) => {
        const children = toNodes(node.children);
        return {
          name: node.name,
          ...(children.length ? { children } : {}),
          ...(node.bookmarkIds.length ? { bookmarkIds: node.bookmarkIds } : {}),
        };
      });

  return toNodes(root);
}

function mergeTrees(...trees: CategoryNode[][]): CategoryNode[] {
  const clone = (node: CategoryNode): CategoryNode => ({
    name: node.name,
    ...(node.children ? { children: node.children.map(clone) } : {}),
    ...(node.bookmarkIds ? { bookmarkIds: [...node.bookmarkIds] } : {}),
  });
  const mergeInto = (target: CategoryNode[], source: CategoryNode[]) => {
    for (const node of source) {
      const existing = target.find((candidate) => candidate.name === node.name);
      if (!existing) {
        target.push(clone(node));
        continue;
      }
      if (node.bookmarkIds?.length) {
        existing.bookmarkIds = [...(existing.bookmarkIds ?? []), ...node.bookmarkIds];
      }
      if (node.children?.length) {
        existing.children ??= [];
        mergeInto(existing.children, node.children);
      }
    }
  };

  const merged: CategoryNode[] = [];
  for (const tree of trees) mergeInto(merged, tree);
  return merged;
}

/** 只保留模型返回的有效分类节点，避免无效 JSON 让后续分配只剩兜底分类。 */
function normalizeCategoryTree(value: unknown, depth = 1): CategoryNode[] {
  if (!Array.isArray(value) || depth > 3) return [];
  const names = new Set<string>();
  const nodes: CategoryNode[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = (item as { name?: unknown }).name;
    const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
    if (!name || names.has(name)) continue;
    names.add(name);
    const children = normalizeCategoryTree((item as { children?: unknown }).children, depth + 1);
    nodes.push({ name, ...(children.length ? { children } : {}) });
  }
  return nodes;
}

type PageContext = CachedPageContext;

const META_CONCURRENCY = 4;

function normalizedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.slice(0, 500);
  }
}

function normalizeCacheText(value: string): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function classificationCacheKey(bookmark: FlatBookmark, settings?: Settings): string {
  const includeFolderPath = settings ? respectFolders(settings) : true;
  const prompts = settings ? resolveClassifyPrompts(settings) : undefined;
  const folderRulesVersion = `${includeFolderPath ? 'folders-v2' : 'folders-off'}:${settings?.useBuiltInClassificationRules !== false ? 'builtin-v1' : 'builtin-off'}`;
  const promptVersion = hashUrl(JSON.stringify({
    label: prompts?.label ?? '',
    provider: settings?.provider ?? '',
    baseUrl: settings?.baseUrl ?? '',
    model: settings?.model ?? '',
    customApiStyle: settings?.customApiStyle ?? '',
    customFullUrl: !!settings?.customFullUrl,
  }));
  // v4: folderPath 不再作为缓存键的一部分——书签移动后应复用已有标签结果，
  //     folderPath 仅作为 LLM 的参考信号，不影响缓存命中。
  const signature = [
    'content-context-v4',
    normalizedUrl(bookmark.url),
    normalizeCacheText(bookmark.title),
    folderRulesVersion,
    promptVersion,
  ];
  return hashUrl(JSON.stringify(signature));
}

function bookmarkSignalLine(
  bookmark: FlatBookmark,
  options: {
    settings: Settings;
    context?: PageContext;
    label?: BookmarkLabel;
    includeId?: boolean;
  },
): string {
  const parts = [
    options.includeId === false ? '' : `id:${bookmark.id}`,
    `书签标题:${bookmark.title.slice(0, 160)}`,
    `URL:${normalizedUrl(bookmark.url)}`,
    respectFolders(options.settings) && bookmark.folderPath
      ? `原文件夹:${normalizeFolderParts(bookmark.folderPath, Number.POSITIVE_INFINITY).join('/') || bookmark.folderPath}`
      : '',
    options.context?.siteName ? `站点:${options.context.siteName}` : '',
    options.context?.title ? `页面标题:${options.context.title}` : '',
    options.context?.description ? `页面描述:${options.context.description}` : '',
    options.context?.excerpt ? `正文摘录:${options.context.excerpt}` : '',
    options.label?.summary ? `摘要:${options.label.summary}` : '',
    options.label?.tags?.length ? `tags:${options.label.tags.join(',')}` : '',
  ];
  return `- ${parts.filter(Boolean).join(' | ')}`;
}

/** Fetch contextual signals for every uncached bookmark once and reuse them across AI stages. */
async function enrichBookmarks(
  bookmarks: FlatBookmark[],
): Promise<Map<string, PageContext>> {
  const enriched = new Map<string, PageContext>();
  try {
    const granted = await chrome.permissions.contains({ origins: ['<all_urls>'] });
    if (!granted) return enriched;
  } catch {
    return enriched;
  }
  let idx = 0;
  const workers = Array.from({ length: META_CONCURRENCY }, async () => {
    while (idx < bookmarks.length) {
      const b = bookmarks[idx++];
      try {
        const context = (await chrome.runtime.sendMessage({ type: 'fetchPageContext', url: b.url })) as
          | PageContext
          | null;
        if (context) enriched.set(b.id, context);
      } catch {
        /* Page access errors should not block classification. */
      }
    }
  });
  await Promise.all(workers);
  return enriched;
}

/** 阶段一：批量打标（带缓存） */
async function labelBookmarks(
  settings: Settings,
  bookmarks: FlatBookmark[],
  onProgress: ProgressFn,
  signal: AbortSignal,
): Promise<{ labels: Record<string, BookmarkLabel>; responses: string[]; contexts: Map<string, PageContext> }> {
  const cacheEnabled = useClassificationCache(settings);
  const cache = cacheEnabled ? await loadCache() : {};
  const labels: Record<string, BookmarkLabel> = {};
  const responses: string[] = [];
  const pending: FlatBookmark[] = [];
  const contexts = new Map<string, PageContext>();
  const contextPending: FlatBookmark[] = [];

  for (const b of bookmarks) {
    const cached = cache[classificationCacheKey(b, settings)];
    if (cacheEnabled && cached && cached.sourceUrl === normalizedUrl(b.url)) {
      labels[b.id] = { id: b.id, summary: cached.summary, tags: cached.tags };
      if (cached.pageContext) contexts.set(b.id, cached.pageContext);
      else contextPending.push(b);
    } else {
      pending.push(b);
      contextPending.push(b);
    }
  }

  const total = bookmarks.length;
  let done = total - pending.length;
  onProgress({ phase: 'labeling', done, total });

  // A complete cache hit reuses both the AI label and its source context.
  if (usePageMetadata(settings) && contextPending.length) {
    const fetchedContexts = await enrichBookmarks(contextPending);
    let cacheChanged = false;
    for (const [id, context] of fetchedContexts) contexts.set(id, context);
    if (cacheEnabled) {
      for (const bookmark of contextPending) {
        const context = fetchedContexts.get(bookmark.id);
        const cached = cache[classificationCacheKey(bookmark, settings)];
        if (context && cached) {
          cached.pageContext = context;
          cacheChanged = true;
        }
      }
      if (cacheChanged) await saveCache(cache);
    }
  }

  const batches: FlatBookmark[][] = [];
  const bs = batchSize(settings);
  for (let i = 0; i < pending.length; i += bs) {
    batches.push(pending.slice(i, i + bs));
  }

  /** 对单个批次调用 LLM 并解析标签结果；返回解析后的标签数组 */
  const labelOneBatch = async (batch: FlatBookmark[]): Promise<BookmarkLabel[]> => {
    const list = batch
      .map((b) => bookmarkSignalLine(b, { settings, context: contexts.get(b.id) }))
      .join('\n');
    const response = await chatJson<BookmarkLabel[]>(
      settings,
      [
        {
          role: 'system',
          content:
            resolveClassifyPrompts(settings).label +
            originalFolderInstruction(settings) +
            builtInRuleInstruction(settings) +
            '\n\n重要：你的整段回复必须是一个 JSON 数组，不要输出任何解释、标题或 markdown 代码围栏。',
        },
        {
          role: 'user',
          content: `分析以下书签，并只返回 JSON 数组：\n${list}`,
        },
      ],
      {
        signal,
        maxTokens: 8192,
        onRetry: (info) =>
          onProgress({
            phase: 'labeling',
            done,
            total,
            message: retryMessage(info.attempt, info.maxRetries, info.delayMs),
          }),
      },
    );
    responses.push(response.content);
    return response.data;
  };

  /**
   * 批次运行：若 LLM 返回结果不完整，自动拆成两个半批次重试（最多拆分一次）。
   * 这样避免因单次 token 截断直接 fatal，同时保持大批次的效率优势。
   */
  const runBatch = async (batch: FlatBookmark[]) => {
    const byId = new Map(batch.map((b) => [b.id, b]));
    let parsed: BookmarkLabel[];
    try {
      parsed = await labelOneBatch(batch);
    } catch (err) {
      // 非不完整结果的错误直接上浮
      if (!(err instanceof Error) || !err.message.includes('不完整')) throw err;
      parsed = [];
    }

    const returnedIds = new Set(parsed.map((item) => String(item.id)));
    const isComplete = returnedIds.size === batch.length && batch.every((b) => returnedIds.has(b.id));

    if (!isComplete && batch.length > 10) {
      // 降级：拆成两半分别重试
      const half = Math.ceil(batch.length / 2);
      const [firstHalf, secondHalf] = [batch.slice(0, half), batch.slice(half)];
      const [parsedA, parsedB] = await Promise.all([
        labelOneBatch(firstHalf),
        labelOneBatch(secondHalf),
      ]);
      parsed = [...parsedA, ...parsedB];
    } else if (!isComplete) {
      throw new Error('AI 标签结果不完整，已取消本次分类，未写入书签分类结果。');
    }

    for (const item of parsed) {
      const bm = byId.get(String(item.id));
      if (!bm) continue;
      const label: BookmarkLabel = {
        id: bm.id,
        summary: String(item.summary ?? '').slice(0, 50),
        tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 3) : [],
      };
      labels[bm.id] = label;
      if (cacheEnabled) {
        cache[classificationCacheKey(bm, settings)] = {
          sourceUrl: normalizedUrl(bm.url),
          summary: label.summary,
          tags: label.tags,
          cachedAt: Date.now(),
          ...(contexts.get(bm.id) ? { pageContext: contexts.get(bm.id) } : {}),
        };
      }
    }
    done += batch.length;
    if (cacheEnabled) await saveCache(cache);
    onProgress({ phase: 'labeling', done, total, message: undefined });
  };

  // 并发池（从 settings 读取并发数）
  let idx = 0;
  const workers = Array.from({ length: concurrency(settings) }, async () => {
    while (idx < batches.length) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError');
      const batch = batches[idx++];
      await runBatch(batch);
    }
  });
  await Promise.all(workers);
  return { labels, responses, contexts };
}

/** 阶段二 a：根据全部标签汇总生成金字塔分类树（不含书签分配） */
async function buildTree(
  settings: Settings,
  bookmarks: FlatBookmark[],
  labels: Record<string, BookmarkLabel>,
  contexts: Map<string, PageContext>,
  signal: AbortSignal,
  onProgress: ProgressFn,
  existingTree?: CategoryNode[],
): Promise<{ tree: CategoryNode[]; response: string }> {
  // 统计 tag 频次作为输入，控制 token
  const tagCount = new Map<string, number>();
  for (const l of Object.values(labels)) {
    for (const t of l.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  }
  const tagSummary = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `${t}(${c})`)
    .join(', ');

  const previousOutline = existingTree?.length
    ? existingTree
        .map((n) => (n.children?.length ? `${n.name}: ${n.children.map((c) => c.name).join('、')}` : n.name))
        .join('\n')
    : '';

  const tagRank = new Map([...tagCount.entries()].sort((a, b) => b[1] - a[1]).map(([tag], index) => [tag, index]));
  const scoredBookmarks = bookmarks
    .map((bookmark, index) => {
      const label = labels[bookmark.id];
      const context = contexts.get(bookmark.id);
      const tagScore = Math.min(...(label?.tags ?? []).map((tag) => tagRank.get(tag) ?? 999), 999);
      return {
        bookmark,
        index,
        score: (context ? 0 : 1000) + tagScore,
      };
    })
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, 220)
    .sort((a, b) => a.index - b.index);
  const bookmarkSummary = scoredBookmarks
    .map(({ bookmark }) =>
      bookmarkSignalLine(bookmark, {
        settings,
        context: contexts.get(bookmark.id),
        label: labels[bookmark.id],
      }),
    )
    .join('\n');

  const response = await chatJson<CategoryNode[]>(
        settings,
        [
          {
            role: 'system',
            content:
              resolveClassifyPrompts(settings).buildTree +
              originalFolderInstruction(settings) +
              builtInRuleInstruction(settings) +
              (previousOutline
                ? '\n用户已开启「沿用上一次 AI 分类树」。以下旧分类树也可作为参考；若与当前提示词冲突，以当前提示词为准：\n' +
                  previousOutline +
                  '\n'
                : '') +
              '\n\n重要：整段回复必须是 JSON 数组，不要 markdown 代码围栏或解释文字。',
          },
          {
            role: 'user',
            content:
              `根据以下书签信号生成分类树，只返回 JSON 数组。\n` +
              `总书签数：${bookmarks.length}\n` +
              `标签统计：${tagSummary || '无'}\n` +
              `书签样本${scoredBookmarks.length < bookmarks.length ? `（已抽取 ${scoredBookmarks.length} 条代表项）` : ''}：\n${bookmarkSummary}`,
          },
        ],
        {
          signal,
          maxTokens: 4096,
          onRetry: (info) =>
            onProgress({
              phase: 'building',
              done: 0,
              total: 1,
              message: retryMessage(info.attempt, info.maxRetries, info.delayMs),
            }),
        },
      );
  const tree = normalizeCategoryTree(response.data);
  if (!tree.length) throw new Error('AI 返回的分类树为空或格式无效，已取消本次分类，未写入书签分类结果。');
  onProgress({ phase: 'building', done: 1, total: 1, message: undefined });
  return { tree, response: response.content };
}

/** 收集树的全部叶子路径 */
function leafPaths(tree: CategoryNode[]): string[] {
  const paths: string[] = [];
  const walk = (nodes: CategoryNode[], prefix: string[]) => {
    for (const n of nodes) {
      const p = [...prefix, n.name];
      if (n.children?.length) walk(n.children, p);
      else paths.push(p.join('/'));
    }
  };
  walk(tree, []);
  return paths;
}

/** 阶段二 b：把每个书签映射到叶子分类 */
async function assignBookmarks(
  settings: Settings,
  tree: CategoryNode[],
  bookmarks: FlatBookmark[],
  labels: Record<string, BookmarkLabel>,
  contexts: Map<string, PageContext>,
  onProgress: ProgressFn,
  signal: AbortSignal,
): Promise<string[]> {
  const paths = leafPaths(tree);

  // 建立 path → node 索引
  const nodeByPath = new Map<string, CategoryNode>();
  const walk = (nodes: CategoryNode[], prefix: string[]) => {
    for (const n of nodes) {
      const p = [...prefix, n.name];
      if (n.children?.length) walk(n.children, p);
      else nodeByPath.set(p.join('/'), n);
    }
  };
  walk(tree, []);

  // 确保兜底分类存在
  const FALLBACK = '其他';
  if (!nodeByPath.has(FALLBACK) && ![...nodeByPath.keys()].some((p) => p.startsWith(FALLBACK))) {
    const fallbackNode: CategoryNode = { name: FALLBACK };
    tree.push(fallbackNode);
    nodeByPath.set(FALLBACK, fallbackNode);
    paths.push(FALLBACK);
  }
  const pathList = paths.map((p, i) => `${i}. ${p}`).join('\n');

  const total = bookmarks.length;
  let done = 0;
  const responses: string[] = [];

  /** 对单个批次调用 LLM 并返回分配结果 */
  const assignOneBatch = async (
    batch: FlatBookmark[],
  ): Promise<{ id: string; cat: number }[]> => {
    const aiList = batch
      .map((b) => bookmarkSignalLine(b, { settings, context: contexts.get(b.id), label: labels[b.id] }))
      .join('\n');
    const response = await chatJson<{ id: string; cat: number }[]>(
      settings,
      [
        {
          role: 'system',
          content:
            `以下是分类目录（编号. 路径）：\n${pathList}\n\n` +
            resolveClassifyPrompts(settings).assign +
            originalFolderInstruction(settings) +
            builtInRuleInstruction(settings) +
            '\n\n重要：整段回复必须是 JSON 数组，例如 [{"id":"1","cat":0}]，不要其他文字。',
        },
        { role: 'user', content: `分配以下书签，只返回 JSON 数组：\n${aiList}` },
      ],
      {
        signal,
        maxTokens: 8192,
        onRetry: (info) =>
          onProgress({
            phase: 'assigning',
            done,
            total,
            message: retryMessage(info.attempt, info.maxRetries, info.delayMs),
          }),
      },
    );
    responses.push(response.content);
    return response.data;
  };

  for (let i = 0; i < bookmarks.length; i += assignBatchSize(settings)) {
    if (signal.aborted) throw new DOMException('已取消', 'AbortError');
    const batch = bookmarks.slice(i, i + assignBatchSize(settings));
    const assignments: { id: string; cat: number }[] = [];

    let aiAssignments: { id: string; cat: number }[];
    try {
      aiAssignments = await assignOneBatch(batch);
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('不完整')) throw err;
      aiAssignments = [];
    }

    // 如果结果不完整且批次足够大，降级到半批次重试
    const assignmentById = new Map<string, number>();
    for (const a of aiAssignments) {
      const idStr = String(a.id);
      if (!assignmentById.has(idStr) && Number.isInteger(a.cat) && paths[a.cat]) {
        assignmentById.set(idStr, a.cat);
      }
    }
    const isComplete = assignmentById.size === batch.length && batch.every((b) => assignmentById.has(b.id));

    if (!isComplete && batch.length > 10) {
      // 降级：拆成两半分别重试
      const half = Math.ceil(batch.length / 2);
      const [firstHalf, secondHalf] = [batch.slice(0, half), batch.slice(half)];
      const [assignedA, assignedB] = await Promise.all([
        assignOneBatch(firstHalf),
        assignOneBatch(secondHalf),
      ]);
      for (const a of [...assignedA, ...assignedB]) {
        const idStr = String(a.id);
        if (!assignmentById.has(idStr) && Number.isInteger(a.cat) && paths[a.cat]) {
          assignmentById.set(idStr, a.cat);
        }
      }
    } else if (!isComplete) {
      throw new Error('AI 分配结果不完整，已取消本次分类，未写入书签分类结果。');
    }

    for (const [id, cat] of assignmentById) assignments.push({ id, cat });

    const assignedIds = new Set<string>();
    for (const a of assignments) {
      const idStr = String(a.id);
      if (!assignedIds.has(idStr)) {
        const target = nodeByPath.get(paths[a.cat])!;
        (target.bookmarkIds ??= []).push(idStr);
        assignedIds.add(idStr);
      }
    }
    done += batch.length;
    onProgress({ phase: 'assigning', done, total, message: undefined });
  }

  // 清理空分类
  const prune = (nodes: CategoryNode[]): CategoryNode[] =>
    nodes.filter((n) => {
      if (n.children) n.children = prune(n.children);
      return (n.bookmarkIds?.length ?? 0) > 0 || (n.children?.length ?? 0) > 0;
    });
  const pruned = prune(tree);
  tree.length = 0;
  tree.push(...pruned);
  return responses;
}

/** 主入口：跑完整分类流程 */
export async function classify(
  settings: Settings,
  bookmarks: FlatBookmark[],
  onProgress: ProgressFn,
  signal: AbortSignal,
  scope: ClassificationScope = { mode: 'full' },
  options: ClassifyRunOptions = {},
): Promise<ClassifyResult> {
  if (scope.mode === 'partial' && !scope.targetDirectoryId.trim()) {
    throw new Error('局部分类必须指定目标目录。');
  }
  // 基础路径集合（用户配置的路径字符串）
  const preservedPaths = preservedFolderSet(settings);

  // 补充：通过 preservedFolderIds 将 ID 解析为路径（兼容文件夹重命名后路径失效的情况）
  const preservedIds = preservedFolderIdSet(settings);
  if (preservedIds.size > 0) {
    try {
      const { getBookmarkFolders } = await import('./bookmarks');
      const folders = await getBookmarkFolders();
      for (const folder of folders) {
        if (preservedIds.has(folder.id)) {
          const key = fullFolderKey(folder.path.replace(/ \/ /g, '/'));
          if (key) preservedPaths.add(key);
        }
      }
    } catch {
      // 解析失败不阻断分类流程，仅依赖路径匹配
    }
  }

  const preservedTree = buildPreservedTree(bookmarks, preservedPaths);
  const flexibleBookmarks = bookmarks.filter((bookmark) => !isInPreservedFolder(bookmark, preservedPaths));
  const labeled = await labelBookmarks(settings, flexibleBookmarks, onProgress, signal);
  const labels = labeled.labels;

  onProgress({ phase: 'building', done: 0, total: 1 });
  const saved = await loadSavedResult(scope);
  const previousTree = reusePreviousTree(settings) ? saved?.tree : undefined;
  const built = flexibleBookmarks.length
    ? await buildTree(settings, flexibleBookmarks, labels, labeled.contexts, signal, onProgress, previousTree)
    : undefined;
  const aiTree = built?.tree ?? [];
  const assignments = flexibleBookmarks.length
    ? await assignBookmarks(settings, aiTree, flexibleBookmarks, labels, labeled.contexts, onProgress, signal)
    : [];
  const tree = mergeTrees(preservedTree, aiTree);

  const result: ClassifyResult = {
    tree,
    labels,
    createdAt: Date.now(),
    ...(scope.mode === 'partial' ? { scope } : {}),
    aiResponses: { labels: labeled.responses, ...(built?.response ? { tree: built.response } : {}), assignments },
  };
  if (options.persist !== false) await saveClassifyResult(result);
  onProgress({ phase: 'done', done: bookmarks.length, total: bookmarks.length });
  return result;
}

/**
 * 分类请求会按 URL 去重以节省调用次数；在展示和应用前把同 URL 的书签恢复到
 * 同一分类，并复用代表书签的标签。这样重复书签不会在应用分类时被遗漏。
 */
export function expandDuplicateBookmarks(
  result: ClassifyResult,
  bookmarks: FlatBookmark[],
): ClassifyResult {
  const idsByUrl = new Map<string, string[]>();
  const urlById = new Map<string, string>();
  for (const bookmark of bookmarks) {
    urlById.set(bookmark.id, bookmark.url);
    const ids = idsByUrl.get(bookmark.url) ?? [];
    ids.push(bookmark.id);
    idsByUrl.set(bookmark.url, ids);
  }

  const tree: CategoryNode[] = JSON.parse(JSON.stringify(result.tree));
  const labels = { ...result.labels };
  const assignedUrls = new Set<string>();
  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      const expandedIds: string[] = [];
      for (const id of node.bookmarkIds ?? []) {
        const url = urlById.get(id);
        if (!url || assignedUrls.has(url)) continue;
        assignedUrls.add(url);
        const duplicateIds = idsByUrl.get(url) ?? [id];
        for (const duplicateId of duplicateIds) {
          expandedIds.push(duplicateId);
          if (!labels[duplicateId] && labels[id]) labels[duplicateId] = labels[id];
        }
      }
      if (node.bookmarkIds) node.bookmarkIds = expandedIds;
      if (node.children) walk(node.children);
    }
  };
  walk(tree);

  return { ...result, tree, labels };
}

export async function loadSavedResult(scope: ClassificationScope = { mode: 'full' }): Promise<ClassifyResult | null> {
  const key = resultStorageKey(scope);
  const data = await chrome.storage.local.get(key);
  return data[key] ?? null;
}

export interface SavedClassifyResult {
  storageKey: string;
  result: ClassifyResult;
}

function isSavedClassifyResult(value: unknown): value is ClassifyResult {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ClassifyResult>;
  return Array.isArray(candidate.tree)
    && !!candidate.labels
    && typeof candidate.labels === 'object'
    && typeof candidate.createdAt === 'number';
}

function savedDraftTimestamp(result: ClassifyResult): number {
  return typeof result.updatedAt === 'number' && Number.isFinite(result.updatedAt)
    ? result.updatedAt
    : result.createdAt;
}

/** 列出全量草稿与仍在存储上限内的局部草稿，供工作区切换。 */
export async function listSavedClassifyResults(): Promise<SavedClassifyResult[]> {
  const data = await chrome.storage.local.get(null);
  const full = data[FULL_RESULT_STORAGE_KEY];
  const results: SavedClassifyResult[] = [];
  if (isSavedClassifyResult(full)) {
    results.push({ storageKey: FULL_RESULT_STORAGE_KEY, result: full });
  }
  const partialResults = Object.entries(data)
    .filter(([key, value]) => key.startsWith(PARTIAL_RESULT_STORAGE_PREFIX)
      && isSavedClassifyResult(value)
      && value.scope?.mode === 'partial')
    .map(([storageKey, result]) => ({ storageKey, result: result as ClassifyResult }));
  return [...results, ...partialResults].sort((left, right) => (
    savedDraftTimestamp(right.result) - savedDraftTimestamp(left.result)
    || left.storageKey.localeCompare(right.storageKey)
  ));
}

export interface ClassifyEstimate {
  /** 总书签数 */
  total: number;
  /** 缓存命中数（无需请求） */
  cached: number;
  /** 预计 API 请求次数 */
  requests: number;
}

/** 分类前成本预估（纯本地，基于缓存命中率） */
export async function estimateClassify(
  bookmarks: FlatBookmark[],
  settings?: Settings,
): Promise<ClassifyEstimate> {
  const cacheEnabled = settings ? useClassificationCache(settings) : true;
  const cache = cacheEnabled ? await loadCache() : {};
  const cached = cacheEnabled ? bookmarks.filter((b) => cache[classificationCacheKey(b, settings)]).length : 0;
  const pending = bookmarks.length - cached;
  const requests =
    Math.ceil(pending / BATCH_SIZE) + 1 + Math.ceil(bookmarks.length / ASSIGN_BATCH_SIZE);
  return { total: bookmarks.length, cached, requests };
}

/**
 * 增量归类：把若干新书签打标后归入现有分类树（不重建树）。
 * 返回更新后的 ClassifyResult（已持久化）。
 */
export async function classifyIncremental(
  settings: Settings,
  newBookmarks: FlatBookmark[],
  existing: ClassifyResult,
  onProgress: ProgressFn,
  signal: AbortSignal,
  options: ClassifyRunOptions = {},
): Promise<ClassifyResult> {
  // 路径 + ID 双模式匹配（与 classify 保持一致）
  const preservedPaths = preservedFolderSet(settings);
  const preservedIds = preservedFolderIdSet(settings);
  if (preservedIds.size > 0) {
    try {
      const { getBookmarkFolders } = await import('./bookmarks');
      const folders = await getBookmarkFolders();
      for (const folder of folders) {
        if (preservedIds.has(folder.id)) {
          const key = fullFolderKey(folder.path.replace(/ \/ /g, '/'));
          if (key) preservedPaths.add(key);
        }
      }
    } catch {
      // 解析失败不阻断流程
    }
  }
  const preservedTree = buildPreservedTree(newBookmarks, preservedPaths);
  const flexibleBookmarks = newBookmarks.filter((bookmark) => !isInPreservedFolder(bookmark, preservedPaths));
  const labeled = await labelBookmarks(settings, flexibleBookmarks, onProgress, signal);
  const labels = labeled.labels;
  const tree: CategoryNode[] = JSON.parse(JSON.stringify(existing.tree));
  const merged = mergeTrees(tree, preservedTree);
  tree.length = 0;
  tree.push(...merged);
  if (flexibleBookmarks.length) {
    await assignBookmarks(settings, tree, flexibleBookmarks, labels, labeled.contexts, onProgress, signal);
  } else {
    onProgress({ phase: 'assigning', done: newBookmarks.length, total: newBookmarks.length });
  }

  // ── 增量树失衡检测 ──
  // 计算全树书签总数
  const countTreeBookmarks = (nodes: CategoryNode[]): number =>
    nodes.reduce((sum, n) => sum + (n.bookmarkIds?.length ?? 0) + countTreeBookmarks(n.children ?? []), 0);
  const totalInTree = countTreeBookmarks(tree);
  // 当增量书签占比 ≥ 30%，认为树已失衡，建议全量重分类
  const IMBALANCE_THRESHOLD = 0.3;
  const incrementalImbalanceWarning = totalInTree > 0
    && (flexibleBookmarks.length / totalInTree) >= IMBALANCE_THRESHOLD;

  const result: ClassifyResult = {
    ...existing,
    tree,
    labels: { ...existing.labels, ...labels },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...(incrementalImbalanceWarning ? { incrementalImbalanceWarning: true } : {}),
  };
  if (options.persist !== false) await saveClassifyResult(result);
  onProgress({ phase: 'done', done: newBookmarks.length, total: newBookmarks.length });
  return result;
}
