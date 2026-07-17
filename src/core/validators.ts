// 数据写入前的格式校验，防止损坏或兼容版本不匹配的数据进入 storage
import { DEFAULT_SETTINGS, type Settings } from '../types';

/** 导出包的最低兼容版本 */
export const MIN_COMPATIBLE_EXPORT_VERSION = 1;

/** 校验 settings 对象的关键字段并返回合并了 DEFAULT_SETTINGS 后的安全值 */
export function validateSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('settings 格式无效：不是对象');
  }
  const s = raw as Record<string, unknown>;

  // 数值范围校验
  if (s.aiRetryCount !== undefined) {
    const v = Number(s.aiRetryCount);
    if (!Number.isFinite(v) || v < 0 || v > 20) {
      throw new Error(`aiRetryCount 超出范围 [0, 20]，当前值：${s.aiRetryCount}`);
    }
  }
  if (s.aiRequestTimeoutSeconds !== undefined) {
    const v = Number(s.aiRequestTimeoutSeconds);
    if (!Number.isFinite(v) || v < 5 || v > 600) {
      throw new Error(`aiRequestTimeoutSeconds 超出范围 [5, 600]，当前值：${s.aiRequestTimeoutSeconds}`);
    }
  }
  if (s.fontSize !== undefined) {
    const v = Number(s.fontSize);
    if (!Number.isFinite(v) || v < 8 || v > 32) {
      throw new Error(`fontSize 超出范围 [8, 32]，当前值：${s.fontSize}`);
    }
  }
  const boundedBatchFields: Array<[string, number, number]> = [
    ['labelBatchSize', 10, 80],
    ['labelConcurrency', 1, 5],
    ['assignBatchSize', 10, 100],
  ];
  for (const [field, min, max] of boundedBatchFields) {
    if (s[field] === undefined) continue;
    const value = Number(s[field]);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${field} 超出范围 [${min}, ${max}]，当前值：${s[field]}`);
    }
  }
  if (s.allowPageContentForAi !== undefined && typeof s.allowPageContentForAi !== 'boolean') {
    throw new Error('allowPageContentForAi 必须为布尔值');
  }

  // 枚举值校验
  const validProviders = new Set(['agnes', 'openrouter', 'openai', 'claude', 'gemini', 'deepseek', 'custom']);
  if (s.provider !== undefined && !validProviders.has(String(s.provider))) {
    throw new Error(`provider 值无效：${s.provider}`);
  }
  const validColorModes = new Set(['system', 'light', 'dark']);
  if (s.colorMode !== undefined && !validColorModes.has(String(s.colorMode))) {
    throw new Error(`colorMode 值无效：${s.colorMode}`);
  }

  // 字符串字段防御
  if (s.apiKey !== undefined && typeof s.apiKey !== 'string') {
    throw new Error('apiKey 必须为字符串');
  }

  // 合并 DEFAULT_SETTINGS 保证所有字段都存在
  return { ...DEFAULT_SETTINGS, ...s } as Settings;
}

export interface ExportBundleHeader {
  app: string;
  version: number;
  exportedAt: number;
}

/** 校验导出包头部：检查 app 标识和最低版本号 */
export function validateExportBundle(raw: unknown): ExportBundleHeader {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('INVALID_BUNDLE');
  }
  const b = raw as Record<string, unknown>;

  const validApps = new Set(['ai-bookmark-os', 'bookmark-pilot', 'markline']);
  if (!validApps.has(String(b.app ?? ''))) {
    throw new Error('INVALID_BUNDLE');
  }
  const version = Number(b.version);
  if (!Number.isFinite(version) || version < MIN_COMPATIBLE_EXPORT_VERSION) {
    throw new Error(`INCOMPATIBLE_VERSION:${b.version}`);
  }
  if (typeof b.exportedAt !== 'number') {
    throw new Error('INVALID_BUNDLE');
  }

  return { app: String(b.app), version, exportedAt: b.exportedAt };
}
