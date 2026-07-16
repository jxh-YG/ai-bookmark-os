export const INCREMENTAL_QUEUE_KEY = 'incrementalClassificationQueue';
const MAX_INCREMENTAL_QUEUE_ENTRIES = 500;
/** 当队列条数超过此阈值时触发警告回调 */
const INCREMENTAL_QUEUE_WARN_THRESHOLD = 450;

export interface IncrementalQueueEntry {
  id: string;
  createdAt: number;
  attempts: number;
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
    ...(typeof source.lastError === 'string' && source.lastError ? { lastError: source.lastError } : {}),
  };
}

export async function loadIncrementalQueue(): Promise<IncrementalQueueEntry[]> {
  const data = await chrome.storage.local.get(INCREMENTAL_QUEUE_KEY);
  const raw = Array.isArray(data[INCREMENTAL_QUEUE_KEY]) ? data[INCREMENTAL_QUEUE_KEY] : [];
  const entries = raw.map(normalizeEntry).filter((entry): entry is IncrementalQueueEntry => !!entry);
  const deduped = [...new Map(entries.map((entry) => [entry.id, entry])).values()]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-MAX_INCREMENTAL_QUEUE_ENTRIES);
  if (JSON.stringify(raw) !== JSON.stringify(deduped)) {
    await chrome.storage.local.set({ [INCREMENTAL_QUEUE_KEY]: deduped });
  }
  return deduped;
}

/** 返回队列是否接近上限（≥ INCREMENTAL_QUEUE_WARN_THRESHOLD 条） */
export function isIncrementalQueueNearLimit(queue: IncrementalQueueEntry[]): boolean {
  return queue.length >= INCREMENTAL_QUEUE_WARN_THRESHOLD;
}

export async function enqueueIncrementalBookmarks(entries: Array<Pick<IncrementalQueueEntry, 'id' | 'createdAt'>>): Promise<void> {
  const current = await loadIncrementalQueue();
  const next = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of entries) {
    if (!entry.id || next.has(entry.id)) continue;
    next.set(entry.id, { id: entry.id, createdAt: entry.createdAt || Date.now(), attempts: 0 });
  }
  await chrome.storage.local.set({
    [INCREMENTAL_QUEUE_KEY]: [...next.values()]
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(-MAX_INCREMENTAL_QUEUE_ENTRIES),
  });
}

export async function markIncrementalQueueFailed(ids: string[], error: string): Promise<void> {
  const affected = new Set(ids);
  const current = await loadIncrementalQueue();
  await chrome.storage.local.set({
    [INCREMENTAL_QUEUE_KEY]: current.map((entry) => affected.has(entry.id)
      ? { ...entry, attempts: entry.attempts + 1, lastError: error.slice(0, 240) }
      : entry),
  });
}

export async function completeIncrementalQueue(ids: string[]): Promise<void> {
  const completed = new Set(ids);
  const current = await loadIncrementalQueue();
  await chrome.storage.local.set({ [INCREMENTAL_QUEUE_KEY]: current.filter((entry) => !completed.has(entry.id)) });
}
