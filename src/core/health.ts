// 书签健康检查：重复检测（本地）+ 死链检测（需可选 host 权限）
// 死链探测在 background service worker 中执行（src/core/probe.ts），
// 避免 sidepanel 文档上下文触发被测站点的 preload/CSP 报错噪音。
import type { FlatBookmark, HealthIssue, HealthProgress } from '../types';
import type { ProbeResult } from './probe';

const DEAD_CHECK_CONCURRENCY = 8;
/** 同一根域名最大并发探测数，避免触发目标站限流 */
const PER_DOMAIN_CONCURRENCY = 2;
/** 探测结果缓存 key */
const PROBE_CACHE_KEY = 'healthProbeCache';
/** 探测结果缓存 TTL：24 小时 */
const PROBE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface ProbeCacheEntry {
  result: ProbeResult;
  cachedAt: number;
}

/** 提取根域名（用于限流分组） */
function rootDomain(url: string): string {
  try {
    const { hostname } = new URL(url);
    const parts = hostname.split('.');
    return parts.slice(-2).join('.');
  } catch {
    return url;
  }
}

/** 从 storage 加载探测缓存（过期条目自动清除） */
async function loadProbeCache(): Promise<Map<string, ProbeCacheEntry>> {
  try {
    const data = await chrome.storage.local.get(PROBE_CACHE_KEY);
    const raw = data[PROBE_CACHE_KEY] as Record<string, ProbeCacheEntry> | undefined;
    if (!raw || typeof raw !== 'object') return new Map();
    const now = Date.now();
    const valid = new Map<string, ProbeCacheEntry>();
    for (const [url, entry] of Object.entries(raw)) {
      if (entry && now - entry.cachedAt < PROBE_CACHE_TTL_MS) valid.set(url, entry);
    }
    return valid;
  } catch {
    return new Map();
  }
}

/** 将探测结果批量写入缓存 */
async function saveProbeCache(cache: Map<string, ProbeCacheEntry>): Promise<void> {
  try {
    const obj: Record<string, ProbeCacheEntry> = {};
    for (const [url, entry] of cache) obj[url] = entry;
    await chrome.storage.local.set({ [PROBE_CACHE_KEY]: obj });
  } catch {
    /* storage 写入失败不阻断流程 */
  }
}

/** 已删除书签的撤销记录 key */
const REMOVED_BOOKMARKS_UNDO_KEY = 'healthRemovedBookmarksUndo';

interface RemovedBookmarkRecord {
  id: string;
  title: string;
  url: string;
  parentId: string;
  index: number;
  removedAt: number;
}

/** 保存被删书签的恢复信息到 storage（TTL 24h） */
async function saveRemovedBookmarksForUndo(records: RemovedBookmarkRecord[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [REMOVED_BOOKMARKS_UNDO_KEY]: records });
  } catch {
    /* 非阻断性 */
  }
}

/**
 * 默认只对完全相同的 URL 判定重复。协议、www、锚点和查询参数可能携带
 * 真实业务语义，归一化后的近似匹配只能作为后续人工建议，不能自动清理。
 */
function normalizeExactUrl(value: string): string {
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

/** 重复检测：同一规范化 URL 出现多次，第一条视为保留项 */
export function findDuplicates(bookmarks: FlatBookmark[]): HealthIssue[] {
  const seen = new Map<string, FlatBookmark>();
  const issues: HealthIssue[] = [];
  for (const b of bookmarks) {
    const key = normalizeExactUrl(b.url);
    const first = seen.get(key);
    if (first) {
      issues.push({ bookmark: b, kind: 'duplicate', detail: first.id });
    } else {
      seen.set(key, b);
    }
  }
  return issues;
}

/** 申请 <all_urls> 可选权限（死链检测需要） */
export async function requestAllUrlsPermission(): Promise<boolean> {
  return chrome.permissions.request({ origins: ['<all_urls>'] });
}

export async function hasAllUrlsPermission(): Promise<boolean> {
  return chrome.permissions.contains({ origins: ['<all_urls>'] });
}

/** 委托 background 探测单条链接 */
async function probe(url: string): Promise<ProbeResult> {
  try {
    const r = (await chrome.runtime.sendMessage({ type: 'probeUrl', url })) as
      | ProbeResult
      | undefined;
    return r ?? { kind: 'suspect', detail: 'timeout' };
  } catch {
    return { kind: 'suspect', detail: 'timeout' };
  }
}

/** 重新检测单条链接（登录后复查疑似项） */
export async function recheckUrl(url: string): Promise<ProbeResult> {
  return probe(url);
}

/**
 * 死链检测：并发探测全部书签。
 * - 结果缓存 24h，避免重复扫描
 * - 同域并发限制 ≤ PER_DOMAIN_CONCURRENCY，避免触发目标站限流
 */
export async function findDeadLinks(
  bookmarks: FlatBookmark[],
  onProgress: (p: HealthProgress) => void,
  signal: AbortSignal,
): Promise<HealthIssue[]> {
  const probeCache = await loadProbeCache();
  const issues: HealthIssue[] = [];
  const total = bookmarks.length;
  let done = 0;
  let idx = 0;
  onProgress({ phase: 'checking', done, total });

  // 同域并发计数器
  const domainSlots = new Map<string, number>();
  const domainQueues = new Map<string, Array<() => void>>();

  function acquireDomainSlot(domain: string): Promise<void> {
    const current = domainSlots.get(domain) ?? 0;
    if (current < PER_DOMAIN_CONCURRENCY) {
      domainSlots.set(domain, current + 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const q = domainQueues.get(domain) ?? [];
      q.push(resolve);
      domainQueues.set(domain, q);
    });
  }

  function releaseDomainSlot(domain: string): void {
    const q = domainQueues.get(domain);
    if (q?.length) {
      const next = q.shift()!;
      next();
    } else {
      const current = domainSlots.get(domain) ?? 1;
      domainSlots.set(domain, current - 1);
    }
  }

  const newCacheEntries = new Map<string, ProbeCacheEntry>();

  const workers = Array.from({ length: DEAD_CHECK_CONCURRENCY }, async () => {
    while (idx < bookmarks.length) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError');
      const b = bookmarks[idx++];

      // 命中缓存直接复用
      const cached = probeCache.get(b.url);
      let r: ProbeResult;
      if (cached) {
        r = cached.result;
      } else {
        const domain = rootDomain(b.url);
        await acquireDomainSlot(domain);
        try {
          r = await probe(b.url);
          newCacheEntries.set(b.url, { result: r, cachedAt: Date.now() });
        } finally {
          releaseDomainSlot(domain);
        }
      }

      if (r.kind !== 'ok') issues.push({ bookmark: b, kind: r.kind, detail: r.detail });
      done++;
      onProgress({ phase: 'checking', done, total });
    }
  });

  await Promise.all(workers);

  // 合并新探测结果到缓存并持久化
  if (newCacheEntries.size > 0) {
    for (const [url, entry] of newCacheEntries) probeCache.set(url, entry);
    await saveProbeCache(probeCache);
  }

  onProgress({ phase: 'done', done, total });
  return issues;
}

/**
 * 批量删除书签，删除前保存恢复信息到 storage，支持撤销。
 * 返回实际删除数量。
 */
export async function removeBookmarks(ids: string[]): Promise<number> {
  // 收集恢复信息
  const records: RemovedBookmarkRecord[] = [];
  for (const id of ids) {
    try {
      const [node] = await chrome.bookmarks.get(id);
      if (node?.url && node.parentId != null) {
        records.push({
          id: node.id,
          title: node.title ?? '',
          url: node.url,
          parentId: node.parentId,
          index: node.index ?? 0,
          removedAt: Date.now(),
        });
      }
    } catch {
      // 已不存在，跳过
    }
  }
  await saveRemovedBookmarksForUndo(records);

  let removed = 0;
  for (const id of ids) {
    try {
      await chrome.bookmarks.remove(id);
      removed++;
    } catch {
      // 已被删除则跳过
    }
  }
  return removed;
}

/**
 * 撤销最近一次 removeBookmarks 操作：
 * 从 storage 读取恢复记录，将书签重建到原位置。
 * 返回成功恢复的数量。
 */
export async function undoRemoveBookmarks(): Promise<number> {
  let records: RemovedBookmarkRecord[] = [];
  try {
    const data = await chrome.storage.local.get(REMOVED_BOOKMARKS_UNDO_KEY);
    const raw = data[REMOVED_BOOKMARKS_UNDO_KEY];
    records = Array.isArray(raw) ? raw : [];
  } catch {
    return 0;
  }

  // TTL 过滤（24h）
  const now = Date.now();
  const valid = records.filter((r) => now - r.removedAt < PROBE_CACHE_TTL_MS);
  if (!valid.length) return 0;

  // 按 index 升序恢复，保持原位置顺序
  valid.sort((a, b) => a.index - b.index);
  let restored = 0;
  for (const r of valid) {
    try {
      await chrome.bookmarks.create({
        parentId: r.parentId,
        title: r.title,
        url: r.url,
        index: r.index,
      });
      restored++;
    } catch {
      // 父文件夹已被删除等情况，跳过
    }
  }

  // 清除已恢复的记录
  await chrome.storage.local.remove(REMOVED_BOOKMARKS_UNDO_KEY);
  return restored;
}

