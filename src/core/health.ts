// 书签健康检查：重复检测（本地）+ 死链检测（需可选 host 权限）
// 死链探测在 background service worker 中执行（src/core/probe.ts），
// 避免 sidepanel 文档上下文触发被测站点的 preload/CSP 报错噪音。
import type { FlatBookmark, HealthIssue, HealthProgress } from '../types';
import type { ProbeResult } from './probe';

const DEAD_CHECK_CONCURRENCY = 8;

/** 纯跟踪参数（不影响页面内容），规范化时剔除 */
const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|dclid|msclkid|igshid|spm|scm|from|ref|refer|referrer|share_source|share_medium|vd_source|_ga|mc_cid|mc_eid)$/i;

/**
 * URL 规范化：协议统一 https、域名小写去 www、去 #锚点、
 * 剔除跟踪参数、参数按名排序、去尾部斜杠。
 */
function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    url.protocol = 'https:';
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const kept = [...url.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    url.search = kept.length ? '?' + kept.map(([k, v]) => `${k}=${v}`).join('&') : '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    // 解析失败退回轻量处理
    return u.replace(/#.*$/, '').replace(/\/+$/, '').replace(/^http:/, 'https:');
  }
}

/** 重复检测：同一规范化 URL 出现多次，第一条视为保留项 */
export function findDuplicates(bookmarks: FlatBookmark[]): HealthIssue[] {
  const seen = new Map<string, FlatBookmark>();
  const issues: HealthIssue[] = [];
  for (const b of bookmarks) {
    const key = normalizeUrl(b.url);
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
    // SW 未唤醒等异常，保守归为疑似
    return { kind: 'suspect', detail: 'timeout' };
  }
}

/** 重新检测单条链接（登录后复查疑似项） */
export async function recheckUrl(url: string): Promise<ProbeResult> {
  return probe(url);
}

/** 死链检测：并发探测全部书签，返回死链与疑似失效项 */
export async function findDeadLinks(
  bookmarks: FlatBookmark[],
  onProgress: (p: HealthProgress) => void,
  signal: AbortSignal,
): Promise<HealthIssue[]> {
  const issues: HealthIssue[] = [];
  const total = bookmarks.length;
  let done = 0;
  let idx = 0;
  onProgress({ phase: 'checking', done, total });

  const workers = Array.from({ length: DEAD_CHECK_CONCURRENCY }, async () => {
    while (idx < bookmarks.length) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError');
      const b = bookmarks[idx++];
      const r = await probe(b.url);
      if (r.kind !== 'ok') issues.push({ bookmark: b, kind: r.kind, detail: r.detail });
      done++;
      onProgress({ phase: 'checking', done, total });
    }
  });
  await Promise.all(workers);
  onProgress({ phase: 'done', done, total });
  return issues;
}

/** 批量删除书签 */
export async function removeBookmarks(ids: string[]): Promise<number> {
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
