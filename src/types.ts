// Shared types for AI Bookmark OS

/** Flattened bookmark item */
export interface FlatBookmark {
  id: string;
  title: string;
  url: string;
  /** Original folder path, e.g. "Bookmarks Bar/Dev/Frontend" */
  folderPath: string;
}

/** 分类运行范围；full 保持向后兼容的默认行为。 */
export type ClassificationScope =
  | { mode: 'full' }
  | {
      mode: 'partial';
      targetDirectoryId: string;
      targetDirectoryTitle: string;
      bookmarkCount: number;
    };

/** A normalized node captured from the live Chrome bookmark tree. */
export interface BookmarkSnapshotNode {
  id: string;
  kind: 'folder' | 'bookmark';
  parentId?: string;
  index: number;
  title: string;
  url?: string;
}

/** Immutable live-tree baseline used to prevent stale drafts from being applied. */
export interface BookmarkTreeSnapshot {
  version: 1;
  scope: ClassificationScope;
  rootId: string;
  capturedAt: number;
  fingerprint: string;
  nodes: Record<string, BookmarkSnapshotNode>;
}

export type BookmarkTreeChangeKind =
  | 'added'
  | 'removed'
  | 'moved'
  | 'renamed'
  | 'reordered'
  | 'urlChanged';

/** A single live-tree change, with paths resolved against the relevant snapshot. */
export interface BookmarkTreeChange {
  kind: BookmarkTreeChangeKind;
  id: string;
  nodeKind: BookmarkSnapshotNode['kind'];
  before?: BookmarkSnapshotNode;
  after?: BookmarkSnapshotNode;
  beforePath?: string;
  afterPath?: string;
}

export type ClassificationChangeSummary = Record<BookmarkTreeChangeKind, number>;

/** Persisted before/after comparison for one successful classification application. */
export interface ClassificationChangeSet {
  id: string;
  scope: ClassificationScope;
  createdAt: number;
  /** Stable plan version used for this application when available. */
  planVersionId?: string;
  beforeFingerprint: string;
  afterFingerprint: string;
  summary: ClassificationChangeSummary;
  changes: BookmarkTreeChange[];
  /** Detail is clipped for storage quota safety; summary remains complete. */
  truncated?: boolean;
}

/** Baseline information captured before an AI classification draft is generated. */
export interface ClassificationSource {
  version: 1;
  fingerprint: string;
  capturedAt: number;
  bookmarkCount: number;
  nodeCount: number;
}

/** Metadata written after a draft is successfully applied to Chrome bookmarks. */
export interface ClassificationApplication {
  appliedAt: number;
  fingerprint: string;
  rootFolderId?: string;
  changeSetId?: string;
}

/** Small workspace index; detailed drafts keep using their existing storage keys. */
export interface ClassificationWorkspaceState {
  version: 1;
  activeFull?: {
    rootFolderId: string;
    draftId: string;
    appliedAt: number;
    fingerprint: string;
  };
  comparisons: ClassificationChangeSet[];
}

/** LLM label result (Map stage) */
export interface BookmarkLabel {
  id: string;
  summary: string;
  tags: string[];
}

/** Pyramid category tree node (Reduce output) */
export interface CategoryNode {
  name: string;
  children?: CategoryNode[];
  /** Bookmark ids directly contained by this node; nodes may also have children. */
  bookmarkIds?: string[];
}

/** Full classify result */
export interface ClassifyResult {
  tree: CategoryNode[];
  labels: Record<string, BookmarkLabel>;
  /** Bookmarks deliberately left out of this draft; applying the draft must not move them. */
  excludedBookmarkIds?: string[];
  createdAt: number;
  /** Stable identifier for workspace selection; absent on legacy saved results. */
  draftId?: string;
  /** Last local edit time; absent on legacy saved results. */
  updatedAt?: number;
  /** Live bookmark baseline used to determine whether this draft is stale. */
  source?: ClassificationSource;
  /** Last successful application metadata. */
  application?: ClassificationApplication;
  /** 旧结果没有该字段时按全量分类处理。 */
  scope?: ClassificationScope;
  /** 本次分类中通过校验的 AI 原始响应，供排查与审计。 */
  aiResponses?: {
    labels: string[];
    tree?: string;
    assignments: string[];
  };
  /** 增量分类后，新增书签占全树书签比例 ≥30%，建议执行全量重分类。 */
  incrementalImbalanceWarning?: boolean;
}

/** Why an immutable AI plan version was added to the local archive. */
export type ClassificationPlanVersionOrigin = 'replaced' | 'legacy';

/** Compact, reusable snapshot of an AI classification plan. It intentionally excludes labels and raw AI responses. */
export interface ClassificationPlanVersion {
  version: 1;
  /** Stable archive key. Uses the draft id when available and a deterministic legacy id otherwise. */
  versionId: string;
  /** The original draft id, when the source draft was created by the current workspace. */
  draftId?: string;
  origin: ClassificationPlanVersionOrigin;
  tree: CategoryNode[];
  /** Legacy results without a scope are normalized to the full scope before they are archived. */
  scope: ClassificationScope;
  /** Bookmarks intentionally excluded from this plan must remain untouched when it is reused. */
  excludedBookmarkIds: string[];
  createdAt: number;
  updatedAt?: number;
  /** Time this version was preserved, used to retain the ten most recently replaced plans. */
  archivedAt: number;
  source?: ClassificationSource;
  application?: ClassificationApplication;
  /**
   * 星标保护：设为 true 后该版本不参与自动轮换淘汰，只能手动删除。
   * 普通版本最多保留 MAX_CLASSIFICATION_PLAN_VERSIONS 条；星标版本单独保留，不占此配额。
   */
  pinned?: boolean;
}

/** Bounded local history of reusable AI classification plans. */
export interface ClassificationPlanArchive {
  version: 1;
  versions: ClassificationPlanVersion[];
}

/** Live-bookmark compatibility result for applying a current or archived classification plan. */
export interface PlanCompatibilityReport {
  scope: ClassificationScope;
  fingerprint: string;
  plannedBookmarkIds: string[];
  duplicateBookmarkIds: string[];
  missingBookmarkIds: string[];
  outsideScopeBookmarkIds: string[];
  unplannedBookmarkIds: string[];
  canApply: boolean;
}

/** Classify progress */
export interface ClassifyProgress {
  phase: 'idle' | 'labeling' | 'building' | 'assigning' | 'done' | 'error';
  done: number;
  total: number;
  message?: string;
}

/** API protocol style */
export type ApiStyle = 'openai' | 'anthropic' | 'gemini';

/** Model provider preset */
export interface Provider {
  id: string;
  label: string;
  apiStyle: ApiStyle;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  keyUrl: string;
  homeUrl: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: 'agnes',
    label: 'Agnes AI',
    apiStyle: 'openai',
    baseUrl: 'https://apihub.agnes-ai.com/v1',
    defaultModel: 'agnes-2.0-flash',
    models: ['agnes-2.0-flash', 'agnes-1.5-flash'],
    keyUrl: 'https://platform.agnes-ai.com/settings/apiKeys',
    homeUrl: 'https://agnes-ai.com',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    apiStyle: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-haiku', 'google/gemini-2.0-flash-001', 'deepseek/deepseek-chat'],
    keyUrl: 'https://openrouter.ai/settings/keys',
    homeUrl: 'https://openrouter.ai',
  },
  {
    id: 'openai',
    label: 'OpenAI (Codex)',
    apiStyle: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
    keyUrl: 'https://platform.openai.com/api-keys',
    homeUrl: 'https://platform.openai.com',
  },
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    apiStyle: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-latest',
    models: ['claude-3-5-haiku-latest', 'claude-sonnet-4-20250514'],
    keyUrl: 'https://console.anthropic.com/settings/keys',
    homeUrl: 'https://www.anthropic.com',
  },
  {
    id: 'gemini',
    label: 'Gemini (Google)',
    apiStyle: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    keyUrl: 'https://aistudio.google.com/apikey',
    homeUrl: 'https://ai.google.dev',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    apiStyle: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    homeUrl: 'https://www.deepseek.com',
  },
  {
    id: 'custom',
    label: '自定义',
    apiStyle: 'openai',
    baseUrl: '',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'deepseek-chat'],
    keyUrl: '',
    homeUrl: '',
  },
];

export function getProvider(id: string): Provider {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

/** Customizable classify prompts (defaults provided, user can replace) */
export interface ClassifyPrompts {
  /** Stage 1: labeling */
  label: string;
  /** Stage 2: build pyramid tree */
  buildTree: string;
  /** Stage 3: assign bookmarks */
  assign: string;
}

export const DEFAULT_CLASSIFY_PROMPTS: ClassifyPrompts = {
  label: `你是书签分析助手。请根据每条书签提供的「标题」「域名」「原文件夹」三类信息，推断该网页最可能的用途，并为每条书签生成结构化结果。

处理要求：
1. 逐条分析书签，不遗漏、不合并、不新增书签。
2. 优先根据标题判断用途；标题信息不足时，结合域名和原文件夹推断。
3. summary 必须用中文概括网页用途，控制在 15 个汉字以内，表达具体、清晰，例如“查看前端文档”“管理项目任务”“下载设计素材”。
4. tags 必须为 1-3 个中文通用领域词，避免过细、过长或重复。
5. tags 可参考但不限于：前端开发、后端开发、设计资源、新闻资讯、学习教程、效率工具、开发工具、数据分析、云服务、产品运营、娱乐、购物、社交媒体、文档资料。
6. 如果无法准确判断用途，请根据最可能的领域给出保守推断，不要使用“未知”“其他”等空泛标签。
7. 输出必须是合法 JSON 数组，不要包含 Markdown、代码块、解释说明或任何额外文字。

输出格式必须严格如下：
[
  {
    "id": "原id",
    "summary": "一句话用途",
    "tags": ["标签1", "标签2"]
  }
]`,
  buildTree: `你是“书签信息架构与分类体系设计专家”。请根据输入的书签数据，为这些书签设计一个清晰、稳定、可扩展、便于查找的金字塔式分类树。

输入数据可能包含以下信息：
- 书签标题
- URL 链接
- 原有书签路径/分类
- 页面内容摘要
- 页面正文片段
- 站点名称、产品名、公司名、项目名或工具名等可识别信息

你的任务不是给每条书签分配分类，而是仅输出适用于整批书签的分类树结构。

分类树设计要求：
1. 分类树最多包含 3 层：一级大类 → 二级子类 → 三级子类。
2. 一级大类数量不超过 10 个。
3. 任意一级分类或二级分类下的直接子类数量不超过 10 个。
4. 分类名称必须简洁、明确、可复用，通常控制在 2-8 个中文字符或简短中文短语内。
5. 分类名称应体现内容主题、使用场景、业务领域或主要用途，不要仅机械按照网站类型划分。
6. 不要使用含义过宽、边界模糊或重复交叉的名称，例如“常用网站”“资料”“工具”“内容”“平台”等，除非上下文确实需要。
7. 对主题相近、数量较少或使用场景一致的书签，应合并到同一分类中。
8. 不要为了单个零散书签创建过细分类；只有当其属于明确的公司、项目、产品、工具、业务系统或高频主题时，才可以单独成类。
9. 无法明确归入主要类别、数量较少且缺乏共同主题的内容，可归入“其他”。
10. 若多个书签属于同一公司、团队、办公系统或业务协作场景，应优先按公司、团队或办公场景合并，而不是按页面类型拆分。
11. 同一平台的不同页面，应根据实际用途判断是否合并；如果用途差异明显，可以拆分到不同主题分类中。
12. 分类层级应尽量均衡，避免某个一级大类包含过多内容，也避免大量分类只有极少内容。
13. 一级大类应覆盖整批书签的主要主题；二级和三级分类用于细化高频或内容较多的主题。
14. 如果某个分类已经足够清晰，不需要强行补全到三级。
15. 不要输出书签明细、分类依据、推理过程、统计信息或任何解释。

输出格式要求：
1. 只输出合法 JSON 数组。
2. JSON 根节点必须是数组。
3. 数组元素必须是分类对象。
4. 每个分类对象必须包含 "name" 字段。
5. 有子分类时才添加 "children" 字段；没有子分类时省略 "children" 字段。
6. "children" 字段的值必须是分类对象数组。
7. 分类层级最多 3 层，三级分类对象不得再包含 "children" 字段。
8. 不要输出 JSON 以外的任何文字、注释、解释、Markdown 代码块或多余标点。
9. 输出必须严格符合以下结构示例：

[
  {
    "name": "一级大类名",
    "children": [
      {
        "name": "二级子类名",
        "children": [
          {
            "name": "三级子类名"
          }
        ]
      }
    ]
  }
]`,
  assign:
    '根据我提供的书签列表和分类编号说明，将每个书签分配到语义最匹配的一个分类编号。判断依据按优先级依次为：书签标题、URL 域名与路径、描述/摘要、标签或备注；若信息不足，则根据可识别的关键词、网站类型或内容主题进行合理归类。每个书签必须且只能分配一个分类编号，不要遗漏、重复或新增书签 id；分类编号必须来自我提供的分类列表，不得自创编号。最终只输出合法 JSON 数组，格式严格为：[{"id":"书签id","cat":分类编号}]。不要输出任何解释、Markdown、代码块或其他文字。',
};

/** Extension settings */
export interface Settings {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  fontFamily: string;
  fontSize: number;
  themeColor: string;
  language: 'auto' | 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es' | 'pt' | 'ru';
  colorMode: 'system' | 'light' | 'dark';
  /** Custom provider API style */
  customApiStyle?: ApiStyle;
  /** custom endpoint is full request URL (no path append) */
  customFullUrl?: boolean;
  /** Classify prompts (override defaults) */
  classifyPrompts?: ClassifyPrompts;
  /** 参照浏览器原有书签夹结构进行分类（公司/业务夹优先保留） */
  respectExistingFolders?: boolean;
  /** 选中的原书签夹路径会直接按原结构展示，不参与 AI 优化 */
  preservedFolderPaths?: string[];
  /**
   * 保留文件夹的 Chrome 书签 ID（与 preservedFolderPaths 互为备份）。
   * 文件夹重命名后可通过 ID 继续识别，避免路径匹配失效。
   */
  preservedFolderIds?: string[];
  /** 重分类时沿用上一次 AI 分类树作为结构参考 */
  reusePreviousAiTree?: boolean;
  /** 使用 URL 标签缓存，避免重复请求 AI */
  useClassificationCache?: boolean;
  /** 对标题信息不足的书签抓取页面 meta 作为补充语义 */
  usePageMetadata?: boolean;
  /** 新增书签进入待处理队列，并在分类工作台打开时增量归类。 */
  incrementalClassificationEnabled?: boolean;
  /** 注入系统内置分类规则增强；关闭后主要按用户提示词执行 */
  useBuiltInClassificationRules?: boolean;
  /** AI 请求失败后的重连次数（不含首次请求） */
  aiRetryCount?: number;
  /** 单次 AI 请求超时时间（秒） */
  aiRequestTimeoutSeconds?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'agnes',
  apiKey: '',
  baseUrl: 'https://apihub.agnes-ai.com/v1',
  model: 'agnes-2.0-flash',
  fontFamily: 'system',
  fontSize: 14,
  themeColor: '#0A84FF',
  language: 'auto',
  colorMode: 'system',
  customApiStyle: 'openai',
  customFullUrl: false,
  classifyPrompts: { ...DEFAULT_CLASSIFY_PROMPTS },
  respectExistingFolders: true,
  preservedFolderPaths: [],
  preservedFolderIds: [],
  reusePreviousAiTree: false,
  useClassificationCache: true,
  usePageMetadata: true,
  incrementalClassificationEnabled: false,
  useBuiltInClassificationRules: true,
  aiRetryCount: 5,
  aiRequestTimeoutSeconds: 90,
};

/** Resolve runtime provider (custom may override apiStyle) */
export function resolveProvider(settings: Settings): Provider {
  const base = getProvider(settings.provider);
  if (settings.provider === 'custom') {
    return {
      ...base,
      apiStyle: settings.customApiStyle ?? 'openai',
      baseUrl: settings.baseUrl || base.baseUrl,
      defaultModel: settings.model || base.defaultModel,
    };
  }
  return base;
}


/** Normalize/resolve final chat request URL (align with AI assist custom endpoint UX). */
export function resolveRequestUrl(settings: Settings): string {
  const provider = resolveProvider(settings);
  const style = provider.apiStyle;
  const raw = String(settings.baseUrl || provider.baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return '';

  // Built-in providers always use known path rules.
  if (settings.provider !== 'custom') {
    if (style === 'openai') {
      if (/\/chat\/completions$/i.test(raw)) return raw;
      return `${raw}/chat/completions`;
    }
    if (style === 'anthropic') {
      if (/\/messages$/i.test(raw)) return raw;
      return `${raw}/messages`;
    }
    return raw;
  }

  // Custom provider: optional full URL mode.
  if (settings.customFullUrl) return raw;
  if (style === 'openai') {
    if (/\/chat\/completions$/i.test(raw)) return raw;
    return `${raw}/chat/completions`;
  }
  if (style === 'anthropic') {
    if (/\/v1\/messages$/i.test(raw) || /\/messages$/i.test(raw)) return raw;
    return `${raw}/v1/messages`;
  }
  return raw;
}

export function resolveClassifyPrompts(settings: Settings): ClassifyPrompts {
  const p = settings.classifyPrompts;
  return {
    label: (p?.label && p.label.trim()) || DEFAULT_CLASSIFY_PROMPTS.label,
    buildTree: (p?.buildTree && p.buildTree.trim()) || DEFAULT_CLASSIFY_PROMPTS.buildTree,
    assign: (p?.assign && p.assign.trim()) || DEFAULT_CLASSIFY_PROMPTS.assign,
  };
}

/** Font options */
export const FONT_OPTIONS: { value: string; label: string; css: string }[] = [
  { value: 'system', label: '\u7cfb\u7edf\u9ed8\u8ba4', css: "-apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif" },
  { value: 'yahei', label: '\u5fae\u8f6f\u96c5\u9ed1', css: "'Microsoft YaHei', sans-serif" },
  { value: 'songti', label: '\u5b8b\u4f53', css: 'SimSun, serif' },
  { value: 'kaiti', label: '\u6977\u4f53', css: 'KaiTi, serif' },
  { value: 'mono', label: '\u7b49\u5bbd\u5b57\u4f53', css: "Consolas, 'Cascadia Mono', monospace" },
];

export function fontCss(value: string): string {
  return FONT_OPTIONS.find((f) => f.value === value)?.css ?? FONT_OPTIONS[0].css;
}

/** Bookmark tree backup */
export interface BookmarkBackup {
  createdAt: number;
  tree: chrome.bookmarks.BookmarkTreeNode[];
}

/** Apply record for undo */
export interface RemovedSourceFolder {
  /** 删除前的目录 ID；撤销时映射到新建目录 ID。 */
  sourceFolderId: string;
  title: string;
  oldParentId: string;
  oldIndex: number;
  depth: number;
  /** pending 覆盖“已记录、尚未确认删除”的恢复窗口。 */
  removalStatus: 'pending' | 'removed';
  /** 撤销时重建出的目录 ID，供失败重试复用。 */
  restoredFolderId?: string;
}

export interface ApplyRecord {
  createdAt: number;
  rootFolderId: string;
  moves: { id: string; oldParentId: string; oldIndex: number }[];
  /** 仅局部应用设置；撤销时删除这些新建目录。 */
  createdFolderIds?: string[];
  targetDirectoryId?: string;
  /** 仅局部应用设置；用于阻止未完成回滚后的后续覆盖。 */
  status?: 'applying' | 'complete' | 'rollback-pending';
  /** 本次应用后被安全清理的原始空目录，供撤销时重建。 */
  removedSourceFolders?: RemovedSourceFolder[];
}

/** Unified result of one link probe. */
export type LinkCheckState =
  | 'reachable'
  | 'confirmed_missing'
  | 'content_suspect'
  | 'access_limited'
  | 'transient_failure'
  | 'unsupported';

export interface LinkCheckResult {
  state: LinkCheckState;
  reason: string;
  statusCode: number | null;
  finalUrl: string;
  checkedAt: number;
  probeMode: 'anonymous' | 'authenticated' | 'rendered-tab';
}

/** Health issue. */
export type HealthIssue =
  | {
      bookmark: FlatBookmark;
      kind: 'duplicate';
      detail: string;
    }
  | {
      bookmark: FlatBookmark;
      kind: 'link';
      detail: string;
      result: LinkCheckResult;
    };

/** Health progress */
export interface HealthProgress {
  phase: 'idle' | 'checking' | 'done';
  done: number;
  total: number;
}
