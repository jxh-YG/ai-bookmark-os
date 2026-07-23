// 分类数据导出/导入：分类结果 + 标签缓存 + 设置（不含 API Key）
import type { ClassifyResult, Settings } from '../types';
import { loadSettings, saveSettings } from './settings';

const EXPORT_VERSION = 1;
const APP_ID = 'ai-bookmark-os';

export interface ExportBundle {
  app: string;
  version: number;
  exportedAt: number;
  classifyResult: ClassifyResult | null;
  labelCache: Record<string, { summary: string; tags: string[] }>;
  /** 设置（已剔除 apiKey） */
  settings: Omit<Settings, 'apiKey'>;
}

/** 汇总当前数据为导出包 */
export async function buildExport(): Promise<ExportBundle> {
  const data = await chrome.storage.local.get(['classifyResult', 'labelCache']);
  const settings = await loadSettings();
  const { apiKey: _omit, ...safeSettings } = settings;
  return {
    app: APP_ID,
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    classifyResult: data.classifyResult ?? null,
    labelCache: data.labelCache ?? {},
    settings: safeSettings,
  };
}

/** 触发导出：优先系统保存对话框，不支持时回退直接下载 */
export async function downloadExport(): Promise<void> {
  const bundle = await buildExport();
  const json = JSON.stringify(bundle, null, 2);
  const filename = `ai-bookmark-os-data-${new Date().toISOString().slice(0, 10)}.json`;

  const picker = (
    window as unknown as {
      showSaveFilePicker?: (opts: {
        suggestedName?: string;
        types?: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<{
        createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>;
      }>;
    }
  ).showSaveFilePicker;

  if (picker) {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  cacheEntries: number;
  hasResult: boolean;
}

/** 校验并导入数据包；缓存合并（导入项优先），分类结果整体覆盖 */
export async function importBundle(json: string): Promise<ImportResult> {
  let bundle: ExportBundle;
  try {
    bundle = JSON.parse(json);
  } catch {
    throw new Error('INVALID_JSON');
  }
  // 使用 validator 做严格格式和版本校验，防止损坏数据包覆盖本地数据
  const { validateExportBundle, normalizeImportedClassifyResult, normalizeImportedLabelCache } = await import('./validators');
  validateExportBundle(bundle);

  // 载荷同样不可信：分类结果树/标签缓存都要在写入前规范化，非法条目丢弃，
  // 整体非法则拒绝，避免损坏或手改的数据包污染本地 storage。
  const normalizedCache = normalizeImportedLabelCache(bundle.labelCache);
  if (normalizedCache === null) throw new Error('INVALID_BUNDLE');
  const normalizedResult = normalizeImportedClassifyResult(bundle.classifyResult);

  const existing = await chrome.storage.local.get(['labelCache']);
  const mergedCache = { ...(existing.labelCache ?? {}), ...normalizedCache };

  const writes: Record<string, unknown> = { labelCache: mergedCache };
  if (normalizedResult) writes.classifyResult = normalizedResult;
  await chrome.storage.local.set(writes);

  // 设置合并：仅接受对象类型，保留本机 apiKey；validateSettings 做范围/枚举校验
  if (bundle.settings && typeof bundle.settings === 'object' && !Array.isArray(bundle.settings)) {
    const { validateSettings } = await import('./validators');
    const current = await loadSettings();
    const safe = validateSettings({ ...current, ...bundle.settings, apiKey: current.apiKey });
    await saveSettings(safe);
  }

  return {
    cacheEntries: Object.keys(normalizedCache).length,
    hasResult: !!normalizedResult,
  };
}
