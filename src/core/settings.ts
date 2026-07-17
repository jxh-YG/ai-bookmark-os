// 设置读写：storage.local 为主（含 apiKey）；非敏感字段镜像到 storage.sync 跨设备漫游
import { DEFAULT_CLASSIFY_PROMPTS, DEFAULT_SETTINGS, type ClassifyPrompts, type Settings } from '../types';
import { validateSettings } from './validators';

const LEGACY_CLASSIFY_PROMPTS: ClassifyPrompts = {
  label:
    '你是书签分析助手。根据书签的标题、域名和原文件夹，推断每个网页的用途。只输出 JSON 数组，不要任何其他文字。每项格式：{"id":"原id","summary":"一句话用途(15字内)","tags":["标签1","标签2"]}。tags 用 1-3 个中文通用领域词（如：前端开发、设计资源、新闻资讯、学习教程、工具、娱乐）。',
  buildTree:
    '你是信息架构专家。根据标签及其出现次数，设计一个金字塔式书签分类树。要求：顶层大类不超过 8 个；最多 2 层（大类→子类）；子类每层不超过 10 个；数量少的标签合并进相近大类或"其他"。只输出 JSON 数组，格式：[{"name":"大类名","children":[{"name":"子类名"}]}]，没有子类的大类可省略 children。不要其他文字。',
  assign: '把每个书签分配到最合适的分类编号。只输出 JSON 数组：[{"id":"书签id","cat":分类编号}]。不要其他文字。',
};

const LOCAL_ONLY_SYNC_FIELDS = ['apiKey', 'baseUrl', 'classifyPrompts', 'preservedFolderIds', 'preservedFolderPaths'] as const;
const SETTINGS_MIGRATION_DIAGNOSTIC_KEY = 'settingsMigrationDiagnostic';

type SyncSettings = Omit<Settings, (typeof LOCAL_ONLY_SYNC_FIELDS)[number]>;

function syncSettingsProjection(settings: Settings): SyncSettings {
  const {
    apiKey: _apiKey,
    baseUrl: _baseUrl,
    classifyPrompts: _classifyPrompts,
    preservedFolderIds: _preservedFolderIds,
    preservedFolderPaths: _preservedFolderPaths,
    ...safe
  } = settings;
  return safe;
}

async function cleanLegacySyncSettings(settings: Settings): Promise<void> {
  try {
    const synced = await chrome.storage.sync.get('settings');
    const legacy = synced.settings;
    if (!legacy || !LOCAL_ONLY_SYNC_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(legacy, field))) return;
    await chrome.storage.sync.set({ settings: syncSettingsProjection(settings) });
  } catch (error) {
    await chrome.storage.local.set({
      [SETTINGS_MIGRATION_DIAGNOSTIC_KEY]: {
        code: 'sync_cleanup_failed',
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      },
    }).catch(() => undefined);
  }
}

function migrateDefaultPrompts(prompts?: Partial<ClassifyPrompts>): ClassifyPrompts {
  const merged = { ...DEFAULT_CLASSIFY_PROMPTS, ...(prompts || {}) };
  return {
    label: merged.label === LEGACY_CLASSIFY_PROMPTS.label ? DEFAULT_CLASSIFY_PROMPTS.label : merged.label,
    buildTree: merged.buildTree === LEGACY_CLASSIFY_PROMPTS.buildTree ? DEFAULT_CLASSIFY_PROMPTS.buildTree : merged.buildTree,
    assign: merged.assign === LEGACY_CLASSIFY_PROMPTS.assign ? DEFAULT_CLASSIFY_PROMPTS.assign : merged.assign,
  };
}

export async function loadSettings(): Promise<Settings> {
  const data = await chrome.storage.local.get('settings');
  if (data.settings) {
    const merged = { ...DEFAULT_SETTINGS, ...data.settings } as Settings;
    merged.classifyPrompts = migrateDefaultPrompts(data.settings.classifyPrompts || {});
    await cleanLegacySyncSettings(merged);
    return merged;
  }
  // 本机无设置（新装/重装）：尝试从 sync 恢复外观与供应商偏好
  try {
    const synced = await chrome.storage.sync.get('settings');
    if (synced.settings) {
      const restored = {
        ...DEFAULT_SETTINGS,
        ...synced.settings,
        apiKey: '',
        classifyPrompts: { ...DEFAULT_CLASSIFY_PROMPTS },
        preservedFolderIds: [],
      } as Settings;
      await chrome.storage.local.set({ settings: restored });
      await cleanLegacySyncSettings(restored);
      return restored;
    }
  } catch {
    /* sync 不可用则忽略 */
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: Settings): Promise<void> {
  // 写入前校验，防止损坏配置扩散到 sync
  const validated = validateSettings(settings);
  await chrome.storage.local.set({ settings: validated });
  // 镜像到 sync（剔除 apiKey，安全 + 避开 sync 8KB 单项限制风险）
  try {
    await chrome.storage.sync.set({ settings: syncSettingsProjection(validated) });
  } catch {
    /* 配额超限或未登录账号时忽略 */
  }
}
