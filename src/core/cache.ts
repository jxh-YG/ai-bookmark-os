// URL → 打标结果缓存（避免重复请求 LLM）
import type { BookmarkLabel } from '../types';

const CACHE_KEY = 'labelCache';
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 1000;
export const CACHE_MAX_BYTES = 5 * 1024 * 1024;

/** 简单字符串 hash（djb2），用作缓存键 */
export function hashUrl(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h + url.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export interface CachedPageContext {
  siteName: string;
  title: string;
  description: string;
  excerpt: string;
}

export interface CachedLabel extends Omit<BookmarkLabel, 'id'> {
  /** Context used for this label, retained so a cache hit skips page fetching too. */
  pageContext?: CachedPageContext;
  /** Written at classification time; legacy entries are timestamped on first read. */
  cachedAt?: number;
}

type CacheMap = Record<string, CachedLabel>;

function byteLength(value: unknown): number {
  const json = JSON.stringify(value);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(json).length;
  return json.length * 2;
}

function normalizeCache(cache: CacheMap, now = Date.now()): CacheMap {
  const entries = Object.entries(cache)
    .filter(([, value]) => !!value && typeof value.summary === 'string' && Array.isArray(value.tags))
    .map(([key, value]) => [key, {
      ...value,
      cachedAt: Number.isFinite(value.cachedAt) ? Number(value.cachedAt) : now,
    }] as const)
    .filter(([, value]) => now - value.cachedAt <= CACHE_TTL_MS)
    .sort(([, left], [, right]) => right.cachedAt - left.cachedAt);

  const next: CacheMap = {};
  let bytes = 0;
  for (const [key, value] of entries) {
    if (Object.keys(next).length >= CACHE_MAX_ENTRIES) break;
    const entryBytes = byteLength({ [key]: value });
    if (bytes + entryBytes > CACHE_MAX_BYTES) continue;
    next[key] = value;
    bytes += entryBytes;
  }
  return next;
}

export async function loadCache(): Promise<CacheMap> {
  const data = await chrome.storage.local.get(CACHE_KEY);
  const raw = data[CACHE_KEY] as CacheMap | undefined;
  const cache = normalizeCache(raw ?? {});
  if (JSON.stringify(cache) !== JSON.stringify(raw ?? {})) {
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  }
  return cache;
}

export async function saveCache(cache: CacheMap): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: normalizeCache(cache) });
}

export async function clearCache(): Promise<void> {
  await chrome.storage.local.remove(CACHE_KEY);
}
