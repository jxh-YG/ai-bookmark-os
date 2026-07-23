export const INCREMENTAL_QUEUE_KEY = 'incrementalClassificationQueue';
const MAX_INCREMENTAL_QUEUE_ENTRIES = 500;
/** 当队列条数超过此阈值时触发警告回调 */
const INCREMENTAL_QUEUE_WARN_THRESHOLD = 450;
const INCREMENTAL_QUEUE_PORT_PREFIX = 'incremental-classification:';
const INCREMENTAL_QUEUE_HEARTBEAT_MS = 15_000;

export interface IncrementalQueueEntry {
  id: string;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'running' | 'retryable' | 'failed' | 'succeeded';
  nextAttemptAt: number;
  lastAttemptAt?: number;
  completedAt?: number;
  lastError?: string;
  ownerId?: string;
  leaseUpdatedAt?: number;
}

function normalizeEntry(value: unknown): IncrementalQueueEntry | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<IncrementalQueueEntry>;
  if (typeof source.id !== 'string' || !source.id) return null;
  return {
    id: source.id,
    createdAt: Number.isFinite(source.createdAt) ? Number(source.createdAt) : Date.now(),
    attempts: Number.isFinite(source.attempts) ? Math.max(0, Number(source.attempts)) : 0,
    status: ['pending', 'running', 'retryable', 'failed', 'succeeded'].includes(String(source.status))
      ? source.status as IncrementalQueueEntry['status']
      : 'pending',
    nextAttemptAt: Number.isFinite(source.nextAttemptAt) ? Number(source.nextAttemptAt) : 0,
    ...(Number.isFinite(source.lastAttemptAt) ? { lastAttemptAt: Number(source.lastAttemptAt) } : {}),
    ...(Number.isFinite(source.completedAt) ? { completedAt: Number(source.completedAt) } : {}),
    ...(typeof source.lastError === 'string' && source.lastError ? { lastError: source.lastError } : {}),
    ...(typeof source.ownerId === 'string' && source.ownerId ? { ownerId: source.ownerId } : {}),
    ...(Number.isFinite(source.leaseUpdatedAt) ? { leaseUpdatedAt: Number(source.leaseUpdatedAt) } : {}),
  };
}

function normalizeQueue(raw: unknown[]): IncrementalQueueEntry[] {
  const entries = raw.map(normalizeEntry).filter((entry): entry is IncrementalQueueEntry => !!entry);
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-MAX_INCREMENTAL_QUEUE_ENTRIES);
}

async function queueMessage(action: string, payload: Record<string, unknown> = {}): Promise<IncrementalQueueEntry[]> {
  const response = await chrome.runtime.sendMessage({ action, ...payload }) as { success?: boolean; queue?: unknown[]; error?: string };
  if (!response?.success || !Array.isArray(response.queue)) throw new Error(response?.error || 'incremental_queue_unavailable');
  return normalizeQueue(response.queue);
}

export async function loadIncrementalQueue(): Promise<IncrementalQueueEntry[]> {
  return queueMessage('incrementalQueueGet');
}

export interface IncrementalQueueLease {
  ownerId: string;
  claim(): Promise<IncrementalQueueEntry[]>;
  fail(ids: string[], error: string): Promise<IncrementalQueueEntry[]>;
  complete(ids: string[]): Promise<IncrementalQueueEntry[]>;
  release(ids: string[]): Promise<IncrementalQueueEntry[]>;
  close(): void;
}

export function openIncrementalQueueLease(onDisconnect?: () => void): IncrementalQueueLease {
  const ownerId = crypto.randomUUID();
  const port = chrome.runtime.connect({ name: `${INCREMENTAL_QUEUE_PORT_PREFIX}${ownerId}` });
  let sequence = 0;
  let connected = true;
  let closedByClient = false;
  const pending = new Map<string, {
    resolve: (queue: IncrementalQueueEntry[]) => void;
    reject: (error: Error) => void;
  }>();

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  const handleDisconnect = (unexpected: boolean) => {
    if (!connected) return;
    connected = false;
    globalThis.clearInterval(heartbeatTimer);
    rejectPending(new Error('incremental_queue_lease_disconnected'));
    if (unexpected && !closedByClient) {
      void chrome.runtime.sendMessage({ action: 'incrementalQueueReleaseOwner', ownerId }).catch(() => undefined);
      onDisconnect?.();
    }
  };
  const request = (action: 'claim' | 'fail' | 'complete' | 'release', payload: Record<string, unknown> = {}) => {
    if (!connected) return Promise.reject(new Error('incremental_queue_lease_disconnected'));
    const requestId = `${ownerId}:${++sequence}`;
    return new Promise<IncrementalQueueEntry[]>((resolve, reject) => {
      pending.set(requestId, { resolve, reject });
      try {
        port.postMessage({ action, requestId, ...payload });
      } catch {
        pending.delete(requestId);
        const error = new Error('incremental_queue_lease_disconnected');
        reject(error);
        handleDisconnect(true);
      }
    });
  };

  port.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const response = message as { requestId?: unknown; success?: boolean; queue?: unknown[]; error?: string };
    if (typeof response.requestId !== 'string') return;
    const waiting = pending.get(response.requestId);
    if (!waiting) return;
    pending.delete(response.requestId);
    if (!response.success || !Array.isArray(response.queue)) {
      waiting.reject(new Error(response.error || 'incremental_queue_unavailable'));
      return;
    }
    waiting.resolve(normalizeQueue(response.queue));
  });
  port.onDisconnect.addListener(() => handleDisconnect(true));
  const heartbeatTimer = globalThis.setInterval(() => {
    if (!connected) return;
    try {
      port.postMessage({ action: 'heartbeat' });
    } catch {
      handleDisconnect(true);
    }
  }, INCREMENTAL_QUEUE_HEARTBEAT_MS);

  return {
    ownerId,
    claim: () => request('claim'),
    fail: (ids, error) => request('fail', { ids, error: error.slice(0, 240) }),
    complete: (ids) => request('complete', { ids }),
    release: (ids) => request('release', { ids }),
    close: () => {
      if (!connected) return;
      closedByClient = true;
      handleDisconnect(false);
      port.disconnect();
    },
  };
}

/** 返回队列是否接近上限（≥ INCREMENTAL_QUEUE_WARN_THRESHOLD 条） */
export function isIncrementalQueueNearLimit(queue: IncrementalQueueEntry[]): boolean {
  return queue.filter((entry) => entry.status !== 'succeeded').length >= INCREMENTAL_QUEUE_WARN_THRESHOLD;
}

export async function enqueueIncrementalBookmarks(entries: Array<Pick<IncrementalQueueEntry, 'id' | 'createdAt'>>): Promise<void> {
  await chrome.runtime.sendMessage({ action: 'incrementalQueueEnqueue', entries });
}

export async function markIncrementalQueueFailed(ids: string[], error: string): Promise<IncrementalQueueEntry[]> {
  return queueMessage('incrementalQueueFail', { ids, error: error.slice(0, 240) });
}

export async function completeIncrementalQueue(ids: string[]): Promise<IncrementalQueueEntry[]> {
  return queueMessage('incrementalQueueComplete', { ids });
}

export async function retryIncrementalQueue(ids: string[]): Promise<void> {
  await queueMessage('incrementalQueueRetry', { ids });
}

export async function releaseIncrementalQueue(ids: string[]): Promise<void> {
  await queueMessage('incrementalQueueRelease', { ids });
}

export async function abandonIncrementalQueue(ids: string[]): Promise<void> {
  await queueMessage('incrementalQueueAbandon', { ids });
}
