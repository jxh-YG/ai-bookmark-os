import type {
  BookmarkSnapshotNode,
  BookmarkTreeChange,
  BookmarkTreeChangeKind,
  ClassificationChangeSet,
  ClassificationChangeSummary,
  ClassificationScope,
  ClassificationWorkspaceState,
} from '../types';

export const CLASSIFICATION_WORKSPACE_STORAGE_KEY = 'classificationWorkspace';
export const MAX_CLASSIFICATION_COMPARISONS = 10;

const CHANGE_KINDS: BookmarkTreeChangeKind[] = [
  'added',
  'removed',
  'moved',
  'renamed',
  'reordered',
  'urlChanged',
];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeScope(value: unknown): ClassificationScope | null {
  if (!isRecord(value)) return null;
  if (value.mode === 'full') return { mode: 'full' };
  const targetDirectoryId = nonEmptyString(value.targetDirectoryId);
  if (
    value.mode !== 'partial'
    || !targetDirectoryId
    || typeof value.targetDirectoryTitle !== 'string'
    || !isFiniteNumber(value.bookmarkCount)
  ) return null;
  return {
    mode: 'partial',
    targetDirectoryId,
    targetDirectoryTitle: value.targetDirectoryTitle,
    bookmarkCount: Math.max(0, Math.floor(value.bookmarkCount)),
  };
}

function normalizeSnapshotNode(value: unknown): BookmarkSnapshotNode | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  if (
    !id
    || (value.kind !== 'folder' && value.kind !== 'bookmark')
    || !isFiniteNumber(value.index)
    || typeof value.title !== 'string'
  ) return null;
  if (value.parentId !== undefined && typeof value.parentId !== 'string') return null;
  if (value.url !== undefined && typeof value.url !== 'string') return null;
  return {
    id,
    kind: value.kind,
    ...(typeof value.parentId === 'string' && value.parentId ? { parentId: value.parentId } : {}),
    index: Math.max(0, Math.floor(value.index)),
    title: value.title,
    ...(typeof value.url === 'string' ? { url: value.url } : {}),
  };
}

function normalizeChange(value: unknown): BookmarkTreeChange | null {
  if (!isRecord(value) || !CHANGE_KINDS.includes(value.kind as BookmarkTreeChangeKind)) return null;
  const id = nonEmptyString(value.id);
  if (!id || (value.nodeKind !== 'folder' && value.nodeKind !== 'bookmark')) return null;
  const before = value.before === undefined ? undefined : normalizeSnapshotNode(value.before);
  const after = value.after === undefined ? undefined : normalizeSnapshotNode(value.after);
  if ((value.before !== undefined && !before) || (value.after !== undefined && !after) || (!before && !after)) {
    return null;
  }
  if (value.beforePath !== undefined && typeof value.beforePath !== 'string') return null;
  if (value.afterPath !== undefined && typeof value.afterPath !== 'string') return null;
  return {
    kind: value.kind as BookmarkTreeChangeKind,
    id,
    nodeKind: value.nodeKind,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(typeof value.beforePath === 'string' ? { beforePath: value.beforePath } : {}),
    ...(typeof value.afterPath === 'string' ? { afterPath: value.afterPath } : {}),
  };
}

function normalizeSummary(value: unknown): ClassificationChangeSummary {
  const source = isRecord(value) ? value : {};
  return CHANGE_KINDS.reduce<ClassificationChangeSummary>((summary, kind) => {
    const count = source[kind];
    summary[kind] = isFiniteNumber(count) ? Math.max(0, Math.floor(count)) : 0;
    return summary;
  }, {
    added: 0,
    removed: 0,
    moved: 0,
    renamed: 0,
    reordered: 0,
    urlChanged: 0,
  });
}

function normalizeChangeSet(value: unknown): ClassificationChangeSet | null {
  if (!isRecord(value)) return null;
  const id = nonEmptyString(value.id);
  const scope = normalizeScope(value.scope);
  const beforeFingerprint = nonEmptyString(value.beforeFingerprint);
  const afterFingerprint = nonEmptyString(value.afterFingerprint);
  const planVersionId = value.planVersionId === undefined ? undefined : nonEmptyString(value.planVersionId);
  if (!id || !scope || !beforeFingerprint || !afterFingerprint || !isFiniteNumber(value.createdAt)) {
    return null;
  }
  if (value.planVersionId !== undefined && !planVersionId) return null;
  const changes = Array.isArray(value.changes)
    ? value.changes.map(normalizeChange).filter((change): change is BookmarkTreeChange => !!change)
    : [];
  return {
    id,
    scope,
    createdAt: value.createdAt,
    beforeFingerprint,
    afterFingerprint,
    ...(planVersionId ? { planVersionId } : {}),
    summary: normalizeSummary(value.summary),
    changes,
    ...(value.truncated === true ? { truncated: true } : {}),
  };
}

function normalizeActiveFull(
  value: unknown,
): ClassificationWorkspaceState['activeFull'] | undefined {
  if (!isRecord(value)) return undefined;
  const rootFolderId = nonEmptyString(value.rootFolderId);
  const draftId = nonEmptyString(value.draftId);
  const fingerprint = nonEmptyString(value.fingerprint);
  if (!rootFolderId || !draftId || !fingerprint || !isFiniteNumber(value.appliedAt)) return undefined;
  return { rootFolderId, draftId, appliedAt: value.appliedAt, fingerprint };
}

function normalizeWorkspace(value: unknown): ClassificationWorkspaceState {
  const source = isRecord(value) ? value : {};
  const comparisonById = new Map<string, ClassificationChangeSet>();
  if (Array.isArray(source.comparisons)) {
    for (const candidate of source.comparisons) {
      const changeSet = normalizeChangeSet(candidate);
      if (!changeSet || comparisonById.has(changeSet.id)) continue;
      comparisonById.set(changeSet.id, changeSet);
    }
  }
  const comparisons = [...comparisonById.values()]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_CLASSIFICATION_COMPARISONS);
  return {
    version: 1,
    ...(normalizeActiveFull(source.activeFull) ? { activeFull: normalizeActiveFull(source.activeFull) } : {}),
    comparisons,
  };
}

/** Reads a best-effort workspace index. Missing or legacy data becomes a safe empty state. */
export async function loadClassificationWorkspace(): Promise<ClassificationWorkspaceState> {
  const data = await chrome.storage.local.get(CLASSIFICATION_WORKSPACE_STORAGE_KEY);
  return normalizeWorkspace(data[CLASSIFICATION_WORKSPACE_STORAGE_KEY]);
}

/** Writes the normalized workspace shape without touching legacy full/partial draft keys. */
export async function saveClassificationWorkspace(
  state: ClassificationWorkspaceState,
): Promise<ClassificationWorkspaceState> {
  const normalized = normalizeWorkspace(state);
  await chrome.storage.local.set({ [CLASSIFICATION_WORKSPACE_STORAGE_KEY]: normalized });
  return normalized;
}

export async function setActiveFullClassification(
  activeFull: NonNullable<ClassificationWorkspaceState['activeFull']>,
): Promise<ClassificationWorkspaceState> {
  const state = await loadClassificationWorkspace();
  return saveClassificationWorkspace({ ...state, activeFull });
}

export async function clearActiveFullClassification(): Promise<ClassificationWorkspaceState> {
  const state = await loadClassificationWorkspace();
  return saveClassificationWorkspace({ version: 1, comparisons: state.comparisons });
}

/** Adds an actual application comparison, retaining the ten newest records only. */
export async function addClassificationChangeSet(
  changeSet: ClassificationChangeSet,
): Promise<ClassificationWorkspaceState> {
  const normalizedChangeSet = normalizeChangeSet(changeSet);
  if (!normalizedChangeSet) throw new Error('分类变更记录无效。');
  const state = await loadClassificationWorkspace();
  return saveClassificationWorkspace({
    ...state,
    comparisons: [
      normalizedChangeSet,
      ...state.comparisons.filter((item) => item.id !== normalizedChangeSet.id),
    ],
  });
}
