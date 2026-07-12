// URL → 打标结果缓存（避免重复请求 LLM）
import type { BookmarkLabel } from '../types';

const CACHE_KEY = 'labelCache';

/** 简单字符串 hash（djb2），用作缓存键 */
export function hashUrl(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h + url.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

type CacheMap = Record<string, Omit<BookmarkLabel, 'id'>>;

export async function loadCache(): Promise<CacheMap> {
  const data = await chrome.storage.local.get(CACHE_KEY);
  return data[CACHE_KEY] ?? {};
}

export async function saveCache(cache: CacheMap): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

export async function clearCache(): Promise<void> {
  await chrome.storage.local.remove(CACHE_KEY);
}
