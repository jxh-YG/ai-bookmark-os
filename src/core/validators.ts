// 数据写入前的格式校验，防止损坏或兼容版本不匹配的数据进入 storage
import { DEFAULT_SETTINGS, type Settings } from '../types';

/** 导出包的最低兼容版本 */
export const MIN_COMPATIBLE_EXPORT_VERSION = 1;
/** 导出包的最高兼容版本：拒绝未来不兼容 schema，避免其载荷被盲目写入本地 */
export const MAX_COMPATIBLE_EXPORT_VERSION = 1;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStringIdList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item) return null;
    ids.push(item);
  }
  return ids;
}

function normalizeImportedCategoryNode(value: unknown): unknown | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()) return null;
  const node: Record<string, unknown> = { name: value.name };
  if (value.bookmarkIds !== undefined) {
    const ids = normalizeStringIdList(value.bookmarkIds);
    if (!ids) return null;
    node.bookmarkIds = ids;
  }
  if (value.children !== undefined) {
    const children = normalizeImportedCategoryTree(value.children);
    if (!children) return null;
    node.children = children;
  }
  return node;
}

function normalizeImportedCategoryTree(value: unknown): unknown[] | null {
  if (!Array.isArray(value)) return null;
  const tree: unknown[] = [];
  for (const item of value) {
    const node = normalizeImportedCategoryNode(item);
    if (!node) return null;
    tree.push(node);
  }
  return tree;
}

/**
 * 校验并规范化导入的 classifyResult：只保留结构合法的字段。
 * 树/标签任一非法即返回 null（整体拒绝，不写入半损坏的方案）。
 */
export function normalizeImportedClassifyResult(value: unknown): unknown | null {
  if (!isRecord(value)) return null;
  const tree = normalizeImportedCategoryTree(value.tree);
  if (!tree) return null;
  const labels = normalizeImportedLabelCache(value.labels);
  if (labels === null) return null;
  const result: Record<string, unknown> = {
    tree,
    labels,
    createdAt: Number.isFinite(value.createdAt) ? Number(value.createdAt) : Date.now(),
  };
  if (value.excludedBookmarkIds !== undefined) {
    const excluded = normalizeStringIdList(value.excludedBookmarkIds);
    if (!excluded) return null;
    result.excludedBookmarkIds = excluded;
  }
  if (typeof value.draftId === 'string' && value.draftId) result.draftId = value.draftId;
  if (Number.isFinite(value.updatedAt)) result.updatedAt = Number(value.updatedAt);
  return result;
}

/**
 * 校验并规范化标签缓存/标签表：每个值必须是 { summary: string, tags: string[] }。
 * 非对象整体拒绝返回 null；单个非法条目跳过，保证只并入合法项。
 */
export function normalizeImportedLabelCache(value: unknown): Record<string, { summary: string; tags: string[] }> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const out: Record<string, { summary: string; tags: string[] }> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue;
    if (typeof entry.summary !== 'string') continue;
    if (!Array.isArray(entry.tags) || !entry.tags.every((tag) => typeof tag === 'string')) continue;
    out[key] = { summary: entry.summary, tags: entry.tags as string[] };
  }
  return out;
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
  if (!Number.isFinite(version) || version < MIN_COMPATIBLE_EXPORT_VERSION || version > MAX_COMPATIBLE_EXPORT_VERSION) {
    throw new Error(`INCOMPATIBLE_VERSION:${b.version}`);
  }
  const exportedAt = Number(b.exportedAt);
  if (!Number.isFinite(exportedAt)) {
    throw new Error('INVALID_BUNDLE');
  }

  return { app: String(b.app), version, exportedAt };
}
