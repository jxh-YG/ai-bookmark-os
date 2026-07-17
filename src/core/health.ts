// 书签健康检查：重复检测（本地）+ 链接检测（需可选 host 权限）
// 链接探测统一委托 background service worker 执行。
import type {
  FlatBookmark,
  HealthIssue,
  HealthProgress,
  LinkCheckResult,
  LinkCheckState,
} from '../types';

const DEAD_CHECK_CONCURRENCY = 5;
/** 同一根域名最大并发探测数，避免触发目标站限流 */
const PER_DOMAIN_CONCURRENCY = 2;

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

export interface HealthBatchItem {
  id: string;
  restoredId?: string;
  status: 'succeeded' | 'failed' | 'conflict';
  reason?: string;
}

export interface HealthBatchResult {
  success: boolean;
  operationId: string;
  total: number;
  succeeded: number;
  failed: number;
  conflicts: number;
  items: HealthBatchItem[];
}

function healthOperationId(type: string): string {
  return `health-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyBatchResult(operationId: string): HealthBatchResult {
  return { success: false, operationId, total: 0, succeeded: 0, failed: 0, conflicts: 0, items: [] };
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

const LINK_CHECK_STATES = new Set<LinkCheckState>([
  'reachable',
  'confirmed_missing',
  'content_suspect',
  'access_limited',
  'transient_failure',
  'unsupported',
]);

const PROBE_MODES = new Set<LinkCheckResult['probeMode']>([
  'anonymous',
  'authenticated',
  'rendered-tab',
]);

function failedCheck(
  url: string,
  probeMode: LinkCheckResult['probeMode'],
  reason: string,
): LinkCheckResult {
  return {
    state: 'transient_failure',
    reason,
    statusCode: null,
    finalUrl: url,
    checkedAt: Date.now(),
    probeMode,
  };
}

function normalizeLinkCheckResult(
  value: unknown,
  url: string,
  fallbackMode: LinkCheckResult['probeMode'],
): LinkCheckResult | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<LinkCheckResult>;
  if (!LINK_CHECK_STATES.has(raw.state as LinkCheckState)) return null;

  const numericStatus = raw.statusCode == null ? null : Number(raw.statusCode);
  const numericCheckedAt = Number(raw.checkedAt);
  return {
    state: raw.state as LinkCheckState,
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    statusCode: numericStatus != null && Number.isFinite(numericStatus) ? numericStatus : null,
    finalUrl: typeof raw.finalUrl === 'string' && raw.finalUrl ? raw.finalUrl : url,
    checkedAt: Number.isFinite(numericCheckedAt) ? numericCheckedAt : Date.now(),
    probeMode: PROBE_MODES.has(raw.probeMode as LinkCheckResult['probeMode'])
      ? raw.probeMode as LinkCheckResult['probeMode']
      : fallbackMode,
  };
}

/** 委托 background 重新探测单条链接。 */
async function probe(
  url: string,
  type: 'checkUrl' | 'recheckUrlWithSession',
  runId?: string,
  options?: Record<string, number>,
): Promise<LinkCheckResult> {
  const fallbackMode = type === 'checkUrl' ? 'anonymous' : 'authenticated';
  try {
    const response = await chrome.runtime.sendMessage({ type, url, runId, options }) as unknown;
    const wrapped = response && typeof response === 'object' && 'result' in response
      ? (response as { result?: unknown }).result
      : response;
    return normalizeLinkCheckResult(wrapped, url, fallbackMode)
      ?? failedCheck(url, fallbackMode, 'invalid-probe-response');
  } catch {
    return failedCheck(url, fallbackMode, 'runtime-message-failed');
  }
}

/** 重新检测单条链接（登录后复查疑似项） */
export async function recheckUrlWithSession(url: string): Promise<LinkCheckResult> {
  return probe(url, 'recheckUrlWithSession', undefined, await loadCheckerProbeOptions());
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

async function loadCheckerProbeOptions(): Promise<Record<string, number>> {
  const data = await chrome.storage.local.get([
    'checkerTimeout',
    'checkerRetries',
    'checkerBackoffBase',
    'checkerBackoffMax',
  ]);
  const timeoutMs = boundedNumber(data.checkerTimeout, 10_000, 1, 120_000);
  return {
    timeoutMs,
    perAttemptMs: Math.min(timeoutMs, Math.max(1, Math.floor(timeoutMs / 2))),
    retries: boundedNumber(data.checkerRetries, 2, 0, 10),
    baseDelayMs: boundedNumber(data.checkerBackoffBase, 800, 0, 30_000),
    maxDelayMs: boundedNumber(data.checkerBackoffMax, 3_000, 0, 60_000),
  };
}

/**
 * 链接检测：并发重新探测全部书签。
 * - 同域并发限制 ≤ PER_DOMAIN_CONCURRENCY，避免触发目标站限流
 */
export async function findDeadLinks(
  bookmarks: FlatBookmark[],
  onProgress: (p: HealthProgress) => void,
  signal: AbortSignal,
): Promise<HealthIssue[]> {
  const issues: HealthIssue[] = [];
  const runId = `health-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const options = await loadCheckerProbeOptions();
  const cancel = () => {
    chrome.runtime.sendMessage({ type: 'cancelLinkCheckRun', runId }).catch(() => {});
  };
  signal.addEventListener('abort', cancel, { once: true });
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

  const workers = Array.from({ length: DEAD_CHECK_CONCURRENCY }, async () => {
    while (idx < bookmarks.length) {
      if (signal.aborted) throw new DOMException('已取消', 'AbortError');
      const b = bookmarks[idx++];

      const domain = rootDomain(b.url);
      await acquireDomainSlot(domain);
      if (signal.aborted) {
        releaseDomainSlot(domain);
        throw new DOMException('已取消', 'AbortError');
      }
      let result: LinkCheckResult;
      try {
        result = await probe(b.url, 'checkUrl', runId, options);
      } finally {
        releaseDomainSlot(domain);
      }

      if (result.state !== 'reachable') {
        issues.push({ bookmark: b, kind: 'link', detail: result.reason, result });
      }
      done++;
      onProgress({ phase: 'checking', done, total });
    }
  });

  try {
    await Promise.all(workers);
  } finally {
    signal.removeEventListener('abort', cancel);
  }

  onProgress({ phase: 'done', done, total });
  return issues;
}

/**
 * 批量删除由后台单写者执行，只为实际删除成功的书签保存撤销记录。
 */
export async function removeBookmarks(ids: string[]): Promise<HealthBatchResult> {
  const operationId = healthOperationId('delete');
  if (!ids.length) return emptyBatchResult(operationId);
  try {
    const result = await chrome.runtime.sendMessage({
      action: 'healthDeleteBookmarks',
      operationId,
      ids,
    }) as HealthBatchResult;
    return result?.items ? result : emptyBatchResult(operationId);
  } catch {
    return {
      ...emptyBatchResult(operationId),
      total: ids.length,
      failed: ids.length,
      items: ids.map((id) => ({ id, status: 'failed', reason: 'runtime-message-failed' })),
    };
  }
}

/**
 * 撤销最近一次健康删除；失败或冲突项会保留在后台供再次重试。
 */
export async function undoRemoveBookmarks(): Promise<HealthBatchResult> {
  const operationId = healthOperationId('undo');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'healthUndoDelete', operationId }) as HealthBatchResult;
    return result?.items ? result : emptyBatchResult(operationId);
  } catch {
    return emptyBatchResult(operationId);
  }
}

