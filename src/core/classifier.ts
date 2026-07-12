// 两阶段 Map-Reduce 分类编排
import type {
  BookmarkLabel,
  CategoryNode,
  ClassifyProgress,
  ClassifyResult,
  FlatBookmark,
  Settings,
} from '../types';
import { chat, extractJson, getAiRetryCount } from './llm';
import { resolveClassifyPrompts } from '../types';
import { hashUrl, loadCache, saveCache } from './cache';

/** 调用 LLM 并解析 JSON；失败时追加“只输出 JSON”修复提示重试一次 */
async function chatJson<T>(
  settings: Settings,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  opts: {
    signal: AbortSignal;
    maxTokens?: number;
    onRetry?: (info: { attempt: number; maxRetries: number; delayMs: number; reason: string }) => void;
  },
): Promise<T> {
  const content = await chat(settings, messages, opts);
  try {
    return extractJson<T>(content);
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
      return extractJson<T>(repair);
    } catch {
      throw firstErr instanceof Error ? firstErr : new Error(String(firstErr));
    }
  }
}


const BATCH_SIZE = 40;
const CONCURRENCY = 2;
const ASSIGN_BATCH_SIZE = 60;
const BATCH_RECOVERY_DELAY_MS = 5000;


type ProgressFn = (p: ClassifyProgress) => void;

function retryMessage(attempt: number, maxRetries: number, delayMs: number): string {
  return `AI 连接失败，${Math.ceil(delayMs / 1000)} 秒后重连（${attempt}/${maxRetries}）`;
}

const delay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('已取消', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('已取消', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });

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

/** 是否注入内置分类规则增强（默认开启） */
function useBuiltInRules(settings: Settings): boolean {
  return settings.useBuiltInClassificationRules !== false;
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

function folderKey(folderPath: string): string {
  return normalizeFolderParts(folderPath).join('/');
}

function fullFolderKey(folderPath: string): string {
  return normalizeFolderParts(folderPath, Number.POSITIVE_INFINITY).join('/');
}

function preservedFolderSet(settings: Settings): Set<string> {
  if (!respectFolders(settings)) return new Set();
  return new Set((settings.preservedFolderPaths ?? []).map((p) => fullFolderKey(p)).filter(Boolean));
}

function isInPreservedFolder(bookmark: FlatBookmark, paths: Set<string>): boolean {
  const key = fullFolderKey(bookmark.folderPath);
  if (!key) return false;
  for (const p of paths) {
    if (key === p || key.startsWith(p + '/')) return true;
  }
  return false;
}

/** 从当前浏览器书签夹结构推导分类树骨架（不含书签 id） */
function deriveTreeFromFolders(bookmarks: FlatBookmark[], maxDepth = 3): CategoryNode[] {
  type Mutable = { name: string; children: Map<string, Mutable> };
  const root = new Map<string, Mutable>();

  for (const b of bookmarks) {
    const parts = normalizeFolderParts(b.folderPath, maxDepth);
    if (!parts.length) continue;
    let level = root;
    for (const name of parts) {
      let node = level.get(name);
      if (!node) {
        node = { name, children: new Map() };
        level.set(name, node);
      }
      level = node.children;
    }
  }

  const toNodes = (map: Map<string, Mutable>): CategoryNode[] =>
    [...map.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      .map((n) => {
        const children = toNodes(n.children);
        return children.length ? { name: n.name, children } : { name: n.name };
      });

  return toNodes(root);
}

/** 把用户选择保持原样的原书签夹转成含书签 id 的分类树 */
function buildPreservedTree(bookmarks: FlatBookmark[], paths: Set<string>): CategoryNode[] {
  if (!paths.size) return [];
  type Mutable = { name: string; children: Map<string, Mutable>; bookmarkIds: string[] };
  const root = new Map<string, Mutable>();

  for (const b of bookmarks) {
    if (!isInPreservedFolder(b, paths)) continue;
    const parts = normalizeFolderParts(b.folderPath, Number.POSITIVE_INFINITY);
    if (!parts.length) continue;
    let level = root;
    let node: Mutable | null = null;
    for (const name of parts) {
      node = level.get(name) ?? { name, children: new Map(), bookmarkIds: [] };
      level.set(name, node);
      level = node.children;
    }
    node?.bookmarkIds.push(b.id);
  }

  const toNodes = (map: Map<string, Mutable>): CategoryNode[] =>
    [...map.values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      .map((n) => {
        const children = toNodes(n.children);
        return {
          name: n.name,
          ...(children.length ? { children } : {}),
          ...(n.bookmarkIds.length ? { bookmarkIds: n.bookmarkIds } : {}),
        };
      });

  return toNodes(root);
}

function mergeTrees(...groups: CategoryNode[][]): CategoryNode[] {
  const clone = (node: CategoryNode): CategoryNode => ({
    name: node.name,
    ...(node.children ? { children: node.children.map(clone) } : {}),
    ...(node.bookmarkIds ? { bookmarkIds: [...node.bookmarkIds] } : {}),
  });
  const mergeInto = (target: CategoryNode[], source: CategoryNode[]) => {
    for (const node of source) {
      const existing = target.find((n) => n.name === node.name);
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
  for (const group of groups) mergeInto(merged, group);
  return merged;
}

function pickLabels(
  labels: Record<string, BookmarkLabel>,
  bookmarks: FlatBookmark[],
): Record<string, BookmarkLabel> {
  const picked: Record<string, BookmarkLabel> = {};
  for (const b of bookmarks) {
    if (labels[b.id]) picked[b.id] = labels[b.id];
  }
  return picked;
}

/** 原书签夹统计摘要（供 prompt） */
function folderStatsSummary(bookmarks: FlatBookmark[], limit = 80): string {
  const count = new Map<string, number>();
  for (const b of bookmarks) {
    const key = folderKey(b.folderPath) || '未分类';
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([path, n]) => `${path} (${n})`)
    .join('\n');
}

/** 标题信息量不足（过短/无意义/即域名），值得抓 meta 增强 */
function isLowInfoTitle(b: FlatBookmark): boolean {
  const t = b.title.trim();
  if (!t || t.length < 5) return true;
  if (/^(untitled|无标题|新标签页|new tab)$/i.test(t)) return true;
  try {
    const host = new URL(b.url).hostname;
    if (t === host || t === b.url || t === host.replace(/^www\./, '')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

const META_FETCH_LIMIT = 40;
const META_CONCURRENCY = 4;

/** 对低信息量标题的书签抓取页面 meta（需 <all_urls> 权限，未授权则跳过） */
async function enrichLowInfoBookmarks(
  bookmarks: FlatBookmark[],
): Promise<Map<string, string>> {
  const enriched = new Map<string, string>();
  try {
    const granted = await chrome.permissions.contains({ origins: ['<all_urls>'] });
    if (!granted) return enriched;
  } catch {
    return enriched;
  }
  const targets = bookmarks.filter(isLowInfoTitle).slice(0, META_FETCH_LIMIT);
  let idx = 0;
  const workers = Array.from({ length: META_CONCURRENCY }, async () => {
    while (idx < targets.length) {
      const b = targets[idx++];
      try {
        const meta = (await chrome.runtime.sendMessage({ type: 'fetchMeta', url: b.url })) as
          | { title: string; description: string }
          | null;
        if (meta) {
          const text = [meta.title, meta.description].filter(Boolean).join(' — ').slice(0, 120);
          if (text) enriched.set(b.id, text);
        }
      } catch {
        /* SW 异常则跳过 */
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
): Promise<Record<string, BookmarkLabel>> {
  const cacheEnabled = useClassificationCache(settings);
  const cache = cacheEnabled ? await loadCache() : {};
  const labels: Record<string, BookmarkLabel> = {};
  const pending: FlatBookmark[] = [];

  for (const b of bookmarks) {
    const cached = cache[hashUrl(b.url)];
    if (cacheEnabled && cached) {
      labels[b.id] = { id: b.id, ...cached };
    } else {
      pending.push(b);
    }
  }

  const total = bookmarks.length;
  let done = total - pending.length;
  onProgress({ phase: 'labeling', done, total });

  // 对标题无意义的书签抓页面 meta 补充语义（未授权则自动跳过）
  const enriched = usePageMetadata(settings) ? await enrichLowInfoBookmarks(pending) : new Map<string, string>();

  const batches: FlatBookmark[][] = [];
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    batches.push(pending.slice(i, i + BATCH_SIZE));
  }

  const runBatch = async (batch: FlatBookmark[]) => {
    const list = batch
      .map((b) => {
        let host = '';
        try {
          host = new URL(b.url).hostname;
        } catch {
          /* ignore */
        }
        const extra = enriched.get(b.id);
        return (
          `- id:${b.id} | 标题:${b.title.slice(0, 80)} | 域名:${host}` +
          (respectFolders(settings) ? ` | 原文件夹:${b.folderPath || '无'}` : '') +
          (extra ? ` | 页面描述:${extra}` : '')
        );
      })
      .join('\n');

    const respect = respectFolders(settings);
    const respectHint = useBuiltInRules(settings)
      ? respect
        ? '\n\n参照原有书签夹规则：1) 原文件夹字段是重要分类信号，优先保留公司/项目/业务维度；2) 同一公司或同一原文件夹下的书签 tags 应尽量统一；3) 不要仅因域名相似拆散已有公司分类。'
        : '\n\n本次不提供原文件夹字段，也不强制沿用原文件夹；请主要依据标题与域名重新归纳。'
      : '';
    let parsed: BookmarkLabel[] = [];
    let lastErr: unknown;
    const maxRecoveryRetries = getAiRetryCount(settings);
    for (let attempt = 0; attempt <= maxRecoveryRetries; attempt++) {
      try {
        parsed = await chatJson<BookmarkLabel[]>(
          settings,
          [
            {
              role: 'system',
              content:
                resolveClassifyPrompts(settings).label +
                respectHint +
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
        lastErr = undefined;
        break;
      } catch (e) {
        if (signal.aborted) throw e;
        lastErr = e;
        if (attempt < maxRecoveryRetries) {
          const delayMs = BATCH_RECOVERY_DELAY_MS * (attempt + 1);
          onProgress({
            phase: 'labeling',
            done,
            total,
            message: retryMessage(attempt + 1, maxRecoveryRetries, delayMs),
          });
          await delay(delayMs, signal);
        }
      }
    }
    if (lastErr) {
      console.warn('Label batch failed after reconnect attempts; fallback labels will be used.', lastErr);
    }
    const byId = new Map(batch.map((b) => [b.id, b]));
    for (const item of parsed) {
      const bm = byId.get(String(item.id));
      if (!bm) continue;
      const label: BookmarkLabel = {
        id: bm.id,
        summary: String(item.summary ?? '').slice(0, 50),
        tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 3) : [],
      };
      labels[bm.id] = label;
      if (cacheEnabled) cache[hashUrl(bm.url)] = { summary: label.summary, tags: label.tags };
    }
    // 未被 LLM 返回的书签给兜底标签
    for (const bm of batch) {
      if (!labels[bm.id]) {
        labels[bm.id] = { id: bm.id, summary: bm.title.slice(0, 30), tags: ['未分类'] };
      }
    }
    done += batch.length;
    if (cacheEnabled) await saveCache(cache);
    onProgress({ phase: 'labeling', done, total, message: undefined });
  };

  // 简单并发池
  let idx = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (idx < batches.length) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError');
      const batch = batches[idx++];
      await runBatch(batch);
    }
  });
  await Promise.all(workers);
  return labels;
}

/** 阶段二 a：根据全部标签汇总生成金字塔分类树（不含书签分配） */
async function buildTree(
  settings: Settings,
  labels: Record<string, BookmarkLabel>,
  signal: AbortSignal,
  bookmarks: FlatBookmark[],
  onProgress: ProgressFn,
  existingTree?: CategoryNode[],
): Promise<CategoryNode[]> {
  // 统计 tag 频次作为输入，控制 token
  const tagCount = new Map<string, number>();
  for (const l of Object.values(labels)) {
    for (const t of l.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  }
  const tagSummary = [...tagCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, c]) => `${t}(${c})`)
    .join(', ');

  const respect = respectFolders(settings);
  const folderTree = respect ? deriveTreeFromFolders(bookmarks) : [];
  const folderSummary = respect ? folderStatsSummary(bookmarks) : '';

  const folderOutline = folderTree.length
    ? folderTree
        .map((n) => (n.children?.length ? `${n.name}: ${n.children.map((c) => c.name).join('、')}` : n.name))
        .join('\n')
    : '';
  const previousOutline = existingTree?.length
    ? existingTree
        .map((n) => (n.children?.length ? `${n.name}: ${n.children.map((c) => c.name).join('、')}` : n.name))
        .join('\n')
    : '';

  const respectSystem = useBuiltInRules(settings)
    ? respect
      ? '\n\n原有书签夹只是参考信号，不是最终分类标准。请在理解原有公司/项目/业务分组的基础上优化分类树：可合并过碎类目、补充缺失类目、调整不合理层级，但不要无依据拆散明显属于同一公司或项目的书签。'
      : '\n\n本次不强制沿用原书签夹，请主要依据标签语义重建金字塔分类。'
    : '';
  const userInstruction = respect
    ? '请结合标签统计，并参考原有书签夹信号，生成优化后的分类树，只返回 JSON 数组：\n'
    : '根据标签统计生成分类树，只返回 JSON 数组：\n';

  let lastErr: unknown;
  const maxRecoveryRetries = getAiRetryCount(settings);
  for (let attempt = 0; attempt <= maxRecoveryRetries; attempt++) {
    try {
      const aiTree = await chatJson<CategoryNode[]>(
        settings,
        [
          {
            role: 'system',
            content:
              resolveClassifyPrompts(settings).buildTree +
              respectSystem +
              (folderOutline
                ? '\n\n原有书签夹结构参考（只作为优化参考，不要求照抄）：\n' +
                  folderOutline +
                  '\n'
                : '') +
              (previousOutline
                ? '\n用户已开启「沿用上一次 AI 分类树」。以下旧分类树也可作为参考；若与当前提示词冲突，以当前提示词为准：\n' +
                  previousOutline +
                  '\n'
                : '') +
              (folderSummary
                ? '\n原有书签夹统计（路径与数量，权重很高）：\n' + folderSummary + '\n'
                : '') +
              '\n\n重要：整段回复必须是 JSON 数组，不要 markdown 代码围栏或解释文字。',
          },
          {
            role: 'user',
            content:
              userInstruction + `标签统计：${tagSummary}`,
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
      if (Array.isArray(aiTree) && aiTree.length) {
        onProgress({ phase: 'building', done: 1, total: 1, message: undefined });
        return aiTree;
      }
      lastErr = new Error('AI 返回空分类树');
    } catch (e) {
      if (signal.aborted) throw e;
      lastErr = e;
    }
    if (attempt < maxRecoveryRetries) {
      const delayMs = BATCH_RECOVERY_DELAY_MS * (attempt + 1);
      onProgress({
        phase: 'building',
        done: 0,
        total: 1,
        message: retryMessage(attempt + 1, maxRecoveryRetries, delayMs),
      });
      await delay(delayMs, signal);
    }
  }

  if (lastErr) {
    console.warn('Build tree failed after reconnect attempts; fallback tree will be used.', lastErr);
  }

  // AI 失败时不把“参照原夹”硬当最终标准，优先回退旧 AI 树，否则给最小兜底树。
  if (existingTree?.length) return existingTree;
  return [{ name: '其他' }];
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
  onProgress: ProgressFn,
  signal: AbortSignal,
): Promise<void> {
  const paths = leafPaths(tree);
  const pathList = paths.map((p, i) => `${i}. ${p}`).join('\n');

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

  const total = bookmarks.length;
  let done = 0;
  onProgress({ phase: 'assigning', done, total });

  for (let i = 0; i < bookmarks.length; i += ASSIGN_BATCH_SIZE) {
    if (signal.aborted) throw new DOMException('已取消', 'AbortError');
    const batch = bookmarks.slice(i, i + ASSIGN_BATCH_SIZE);
    const respect = respectFolders(settings);

    const needAi = batch;
    const assignments: { id: string; cat: number }[] = [];

    if (needAi.length) {
      const aiList = needAi
        .map((b) => {
          const l = labels[b.id];
          const folder = folderKey(b.folderPath) || '无';
          return (
            `- id:${b.id} | ${b.title.slice(0, 60)} | ${l?.summary ?? ''} | 标签:${l?.tags.join(',') ?? ''}` +
            (respect ? ` | 原文件夹:${folder}` : '')
          );
        })
        .join('\n');
      let lastErr: unknown;
      const maxRecoveryRetries = getAiRetryCount(settings);
      for (let attempt = 0; attempt <= maxRecoveryRetries; attempt++) {
        try {
          const aiAssignments = await chatJson<{ id: string; cat: number }[]>(
            settings,
            [
              {
                role: 'system',
                content:
                  `以下是分类目录（编号. 路径）：\n${pathList}\n\n` +
                  resolveClassifyPrompts(settings).assign +
                  (useBuiltInRules(settings)
                    ? respect
                      ? '\n\n参照原有书签夹：若「原文件夹」能对应某个分类路径/公司名，必须优先选该编号；' +
                        '同一公司书签不得拆到无关类；仅当完全无法对应时再选其他类。'
                      : '\n\n本次主要依据标题、摘要与标签语义分配。'
                    : '') +
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
          if (Array.isArray(aiAssignments)) {
            for (const a of aiAssignments) {
              const idStr = String(a.id);
              if (needAi.some((b) => b.id === idStr)) {
                assignments.push({ id: idStr, cat: a.cat });
              }
            }
          }
          lastErr = undefined;
          break;
        } catch (e) {
          if (signal.aborted) throw e;
          lastErr = e;
          if (attempt < maxRecoveryRetries) {
            const delayMs = BATCH_RECOVERY_DELAY_MS * (attempt + 1);
            onProgress({
              phase: 'assigning',
              done,
              total,
              message: retryMessage(attempt + 1, maxRecoveryRetries, delayMs),
            });
            await delay(delayMs, signal);
          }
        }
      }
      if (lastErr) {
        console.warn('Assign batch failed after reconnect attempts; fallback category will be used.', lastErr);
      }
    }

    const assignedIds = new Set<string>();
    for (const a of assignments) {
      const path = paths[a.cat];
      const node = path ? nodeByPath.get(path) : undefined;
      const target = node ?? nodeByPath.get(FALLBACK)!;
      const idStr = String(a.id);
      if (batch.some((b) => b.id === idStr)) {
        (target.bookmarkIds ??= []).push(idStr);
        assignedIds.add(idStr);
      }
    }
    for (const b of batch) {
      if (!assignedIds.has(b.id)) {
        (nodeByPath.get(FALLBACK)!.bookmarkIds ??= []).push(b.id);
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
}

/** 主入口：跑完整分类流程 */
export async function classify(
  settings: Settings,
  bookmarks: FlatBookmark[],
  onProgress: ProgressFn,
  signal: AbortSignal,
): Promise<ClassifyResult> {
  const labels = await labelBookmarks(settings, bookmarks, onProgress, signal);
  const preservedPaths = preservedFolderSet(settings);
  const preservedTree = buildPreservedTree(bookmarks, preservedPaths);
  const flexibleBookmarks = bookmarks.filter((b) => !isInPreservedFolder(b, preservedPaths));
  const flexibleLabels = pickLabels(labels, flexibleBookmarks);

  onProgress({ phase: 'building', done: 0, total: 1 });
  const saved = await loadSavedResult();
  const previousTree = reusePreviousTree(settings) ? saved?.tree : undefined;
  const aiTree = flexibleBookmarks.length
    ? await buildTree(settings, flexibleLabels, signal, flexibleBookmarks, onProgress, previousTree)
    : [];

  if (flexibleBookmarks.length) {
    await assignBookmarks(settings, aiTree, flexibleBookmarks, flexibleLabels, onProgress, signal);
  } else {
    onProgress({ phase: 'assigning', done: bookmarks.length, total: bookmarks.length });
  }

  const tree = mergeTrees(preservedTree, aiTree);

  const result: ClassifyResult = { tree, labels, createdAt: Date.now() };
  await chrome.storage.local.set({ classifyResult: result });
  onProgress({ phase: 'done', done: bookmarks.length, total: bookmarks.length });
  return result;
}

export async function loadSavedResult(): Promise<ClassifyResult | null> {
  const data = await chrome.storage.local.get('classifyResult');
  return data.classifyResult ?? null;
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
  const cached = cacheEnabled ? bookmarks.filter((b) => cache[hashUrl(b.url)]).length : 0;
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
): Promise<ClassifyResult> {
  const labels = await labelBookmarks(settings, newBookmarks, onProgress, signal);
  const tree: CategoryNode[] = JSON.parse(JSON.stringify(existing.tree));
  const preservedPaths = preservedFolderSet(settings);
  const preservedTree = buildPreservedTree(newBookmarks, preservedPaths);
  const flexibleBookmarks = newBookmarks.filter((b) => !isInPreservedFolder(b, preservedPaths));
  const flexibleLabels = pickLabels(labels, flexibleBookmarks);
  if (preservedTree.length) {
    const merged = mergeTrees(tree, preservedTree);
    tree.length = 0;
    tree.push(...merged);
  }
  if (flexibleBookmarks.length) {
    await assignBookmarks(settings, tree, flexibleBookmarks, flexibleLabels, onProgress, signal);
  } else {
    onProgress({ phase: 'assigning', done: newBookmarks.length, total: newBookmarks.length });
  }
  const result: ClassifyResult = {
    tree,
    labels: { ...existing.labels, ...labels },
    createdAt: Date.now(),
  };
  await chrome.storage.local.set({ classifyResult: result });
  onProgress({ phase: 'done', done: newBookmarks.length, total: newBookmarks.length });
  return result;
}
