export const INCREMENTAL_QUEUE_KEY = 'incrementalClassificationQueue';
const MAX_INCREMENTAL_QUEUE_ENTRIES = 500;
/** 当队列条数超过此阈值时触发警告回调 */
const INCREMENTAL_QUEUE_WARN_THRESHOLD = 450;

export interface IncrementalQueueEntry {
  id: string;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'running' | 'retryable' | 'failed' | 'succeeded';
  nextAttemptAt: number;
  lastAttemptAt?: number;
  completedAt?: number;
  lastError?: string;
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
  };
}

async function queueMessage(action: string, payload: Record<string, unknown> = {}): Promise<IncrementalQueueEntry[]> {
  const response = await chrome.runtime.sendMessage({ action, ...payload }) as { success?: boolean; queue?: unknown[]; error?: string };
  if (!response?.success || !Array.isArray(response.queue)) throw new Error(response?.error || 'incremental_queue_unavailable');
  const raw = response.queue;
  const entries = raw.map(normalizeEntry).filter((entry): entry is IncrementalQueueEntry => !!entry);
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-MAX_INCREMENTAL_QUEUE_ENTRIES);
}

export async function loadIncrementalQueue(): Promise<IncrementalQueueEntry[]> {
  return queueMessage('incrementalQueueGet');
}

export async function claimIncrementalQueue(): Promise<IncrementalQueueEntry[]> {
  return queueMessage('incrementalQueueClaim');
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
