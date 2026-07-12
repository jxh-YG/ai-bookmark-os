// 分类数据导出/导入：分类结果 + 标签缓存 + 设置（不含 API Key）
import type { ClassifyResult, Settings } from '../types';
import { loadSettings, saveSettings } from './settings';

const EXPORT_VERSION = 1;
const APP_ID = 'ai-bookmark-os';
/** 兼容从参考实现导出的旧数据包 */
const COMPAT_APP_IDS = new Set([APP_ID, 'bookmark-pilot', 'markline']);

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
  if (!COMPAT_APP_IDS.has(String(bundle?.app)) || typeof bundle.version !== 'number') {
    throw new Error('INVALID_BUNDLE');
  }

  const existing = await chrome.storage.local.get(['labelCache']);
  const mergedCache = { ...(existing.labelCache ?? {}), ...(bundle.labelCache ?? {}) };

  const writes: Record<string, unknown> = { labelCache: mergedCache };
  if (bundle.classifyResult) writes.classifyResult = bundle.classifyResult;
  await chrome.storage.local.set(writes);

  // 设置合并：保留本机 apiKey
  if (bundle.settings) {
    const current = await loadSettings();
    await saveSettings({ ...current, ...bundle.settings, apiKey: current.apiKey });
  }

  return {
    cacheEntries: Object.keys(bundle.labelCache ?? {}).length,
    hasResult: !!bundle.classifyResult,
  };
}
