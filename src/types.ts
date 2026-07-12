// Shared types for AI Bookmark OS

/** Flattened bookmark item */
export interface FlatBookmark {
  id: string;
  title: string;
  url: string;
  /** Original folder path, e.g. "Bookmarks Bar/Dev/Frontend" */
  folderPath: string;
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
  /** Leaf node bookmark ids */
  bookmarkIds?: string[];
}

/** Full classify result */
export interface ClassifyResult {
  tree: CategoryNode[];
  labels: Record<string, BookmarkLabel>;
  createdAt: number;
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
  buildTree: `你是“书签信息架构与分类体系设计专家”。请根据输入的书签数据（包括书签标题、URL 链接、已有书签路径/分类，以及可获取到的页面内容摘要或正文），为这些书签设计一个清晰、稳定、可扩展的金字塔式分类树。

分类目标与范围：
1. 仅设计分类树结构，不需要逐条输出书签归属。
2. 分类树最多包含 3 层：一级大类 → 二级子类 → 三级子类。
3. 一级大类数量不超过 10 个。
4. 任意一级或二级分类下的直接子类数量不超过 10 个。
5. 分类名称应简洁、明确、可复用，避免使用过于宽泛或重复的名称。
6. 对数量较少、主题相近的分类进行合并；无法明确归入主要类别的，可归入“其他”。
7. 不要为单个零散书签创建过细分类，除非它属于明确的公司、项目、工具或高频主题。

办公/公司相关书签的特殊分类规则：
1. 与办公、企业内部系统、客户/供应商/合作方、项目协作、管理后台、文档平台、工单系统、CRM、ERP、邮箱、会议、招聘、财务、人事、合同、报销等相关的书签，应优先根据“公司名称”或“组织名称”进行归类。
2. 同一公司的多个链接必须尽量归入同一个公司分类下，不要因为页面功能不同而分散到多个无关分类中。
3. 判断公司名称时，优先参考以下信息：
   - 已有书签文件夹/路径中的公司名称；
   - 书签标题中的公司名称、品牌名、系统名；
   - URL 域名、子域名或页面内容中出现的组织名称。
4. 如果原有书签分类中已经存在某个公司文件夹，并且多个该公司相关书签已被放在该文件夹下，则应沿用该公司分类名称作为分类依据。
5. 公司类分类可作为一级大类下的子类，例如“办公 / 公司 / 项目”相关大类下按公司名称划分；如果公司类书签数量较多，也可以将“公司与办公”作为一级大类。

分类设计原则：
1. 优先保证分类对用户查找书签有帮助，而不是机械按网站类型拆分。
2. 对明显属于同一使用场景的内容进行合并，例如开发工具、AI 工具、设计资源、学习资料、购物消费、娱乐媒体、生活服务等。
3. 对同一平台的不同页面，应根据实际用途决定是否合并；若属于同一公司办公场景，优先按公司合并。
4. 分类层级应尽量均衡，避免某个大类过度庞大或某些分类只有极少内容。
5. 不要输出解释、推理过程、统计信息或书签明细。

输出格式要求：
1. 只输出 JSON 数组。
2. JSON 格式必须严格符合以下结构：
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
]
3. 没有子类的分类可以省略 children 字段。
4. children 字段只能包含同样结构的分类对象。
5. 不要输出 JSON 以外的任何文字、注释、Markdown 代码块或说明。`,
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
  /** 重分类时沿用上一次 AI 分类树作为结构参考 */
  reusePreviousAiTree?: boolean;
  /** 使用 URL 标签缓存，避免重复请求 AI */
  useClassificationCache?: boolean;
  /** 对标题信息不足的书签抓取页面 meta 作为补充语义 */
  usePageMetadata?: boolean;
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
  reusePreviousAiTree: false,
  useClassificationCache: true,
  usePageMetadata: true,
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
export interface ApplyRecord {
  createdAt: number;
  rootFolderId: string;
  moves: { id: string; oldParentId: string; oldIndex: number }[];
}

/** Health issue */
export interface HealthIssue {
  bookmark: FlatBookmark;
  kind: 'duplicate' | 'dead' | 'suspect';
  detail: string;
}

/** Health progress */
export interface HealthProgress {
  phase: 'idle' | 'checking' | 'done';
  done: number;
  total: number;
}
