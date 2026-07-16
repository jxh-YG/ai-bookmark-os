import type {
  CategoryNode,
  ClassificationApplication,
  ClassificationPlanArchive,
  ClassificationPlanVersion,
  ClassificationPlanVersionOrigin,
  ClassificationScope,
  ClassificationSource,
  ClassifyResult,
} from '../types';

export const CLASSIFICATION_PLAN_ARCHIVE_STORAGE_KEY = 'classificationPlanArchive';
export const MAX_CLASSIFICATION_PLAN_VERSIONS = 10;

export interface ArchiveClassificationPlanOptions {
  /** Defaults to the archive time so callers normally do not need to provide it. */
  archivedAt?: number;
  /** A normal draft replacement uses `replaced`; drafts without an id are marked as legacy. */
  origin?: ClassificationPlanVersionOrigin;
}

type UnknownRecord = Record<string, unknown>;
type PlanLike = Pick<
  ClassifyResult,
  'tree' | 'excludedBookmarkIds' | 'createdAt' | 'draftId' | 'updatedAt' | 'source' | 'application' | 'scope'
>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizedTimestamp(value: number): number {
  return Math.max(0, Math.floor(value));
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

function normalizeBookmarkIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids: string[] = [];
  for (const item of value) {
    const id = nonEmptyString(item);
    if (!id) return null;
    ids.push(id);
  }
  return ids;
}

function normalizeCategoryNode(value: unknown): CategoryNode | null {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()) return null;
  const node: CategoryNode = { name: value.name };
  if (value.bookmarkIds !== undefined) {
    const bookmarkIds = normalizeBookmarkIds(value.bookmarkIds);
    if (!bookmarkIds) return null;
    node.bookmarkIds = bookmarkIds;
  }
  if (value.children !== undefined) {
    const children = normalizeCategoryTree(value.children);
    if (!children) return null;
    node.children = children;
  }
  return node;
}

function normalizeCategoryTree(value: unknown): CategoryNode[] | null {
  if (!Array.isArray(value)) return null;
  const tree: CategoryNode[] = [];
  for (const item of value) {
    const node = normalizeCategoryNode(item);
    if (!node) return null;
    tree.push(node);
  }
  return tree;
}

function normalizeExcludedBookmarkIds(value: unknown): string[] | null {
  if (value === undefined) return [];
  return normalizeBookmarkIds(value);
}

function normalizeSource(value: unknown): ClassificationSource | null {
  if (!isRecord(value)) return null;
  const fingerprint = nonEmptyString(value.fingerprint);
  if (
    value.version !== 1
    || !fingerprint
    || !isFiniteNumber(value.capturedAt)
    || !isFiniteNumber(value.bookmarkCount)
    || !isFiniteNumber(value.nodeCount)
  ) return null;
  return {
    version: 1,
    fingerprint,
    capturedAt: normalizedTimestamp(value.capturedAt),
    bookmarkCount: Math.max(0, Math.floor(value.bookmarkCount)),
    nodeCount: Math.max(0, Math.floor(value.nodeCount)),
  };
}

function normalizeApplication(value: unknown): ClassificationApplication | null {
  if (!isRecord(value)) return null;
  const fingerprint = nonEmptyString(value.fingerprint);
  if (!fingerprint || !isFiniteNumber(value.appliedAt)) return null;
  const rootFolderId = value.rootFolderId === undefined ? undefined : nonEmptyString(value.rootFolderId);
  const changeSetId = value.changeSetId === undefined ? undefined : nonEmptyString(value.changeSetId);
  if ((value.rootFolderId !== undefined && !rootFolderId) || (value.changeSetId !== undefined && !changeSetId)) {
    return null;
  }
  return {
    appliedAt: normalizedTimestamp(value.appliedAt),
    fingerprint,
    ...(rootFolderId ? { rootFolderId } : {}),
    ...(changeSetId ? { changeSetId } : {}),
  };
}

function normalizeOrigin(value: unknown, draftId?: string): ClassificationPlanVersionOrigin {
  if (value === 'replaced' || value === 'legacy') return value;
  return draftId ? 'replaced' : 'legacy';
}

function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function normalizePlanLike(value: PlanLike): {
  tree: CategoryNode[];
  scope: ClassificationScope;
  excludedBookmarkIds: string[];
  createdAt: number;
  draftId?: string;
  updatedAt?: number;
  source?: ClassificationSource;
  application?: ClassificationApplication;
} {
  const tree = normalizeCategoryTree(value.tree);
  const excludedBookmarkIds = normalizeExcludedBookmarkIds(value.excludedBookmarkIds);
  if (!tree || !excludedBookmarkIds || !isFiniteNumber(value.createdAt)) {
    throw new Error('分类方案无效，无法归档。');
  }
  const scope: ClassificationScope | null = value.scope === undefined ? { mode: 'full' } : normalizeScope(value.scope);
  if (!scope) throw new Error('分类方案范围无效，无法归档。');
  const draftIdValue = value.draftId === undefined ? undefined : nonEmptyString(value.draftId);
  if (value.draftId !== undefined && !draftIdValue) throw new Error('分类方案草稿标识无效，无法归档。');
  const draftId = draftIdValue ?? undefined;
  const updatedAt = value.updatedAt === undefined ? undefined : value.updatedAt;
  if (updatedAt !== undefined && !isFiniteNumber(updatedAt)) throw new Error('分类方案更新时间无效，无法归档。');
  const source = value.source === undefined ? undefined : normalizeSource(value.source);
  if (value.source !== undefined && !source) throw new Error('分类方案来源信息无效，无法归档。');
  const application = value.application === undefined ? undefined : normalizeApplication(value.application);
  if (value.application !== undefined && !application) throw new Error('分类方案应用信息无效，无法归档。');
  return {
    tree,
    scope,
    excludedBookmarkIds,
    createdAt: normalizedTimestamp(value.createdAt),
    ...(draftId ? { draftId } : {}),
    ...(updatedAt === undefined ? {} : { updatedAt: normalizedTimestamp(updatedAt) }),
    ...(source ? { source } : {}),
    ...(application ? { application } : {}),
  };
}

/** Returns the draft id when available, otherwise a deterministic id for a legacy plan. */
export function getClassificationPlanVersionId(plan: PlanLike): string {
  const normalized = normalizePlanLike(plan);
  if (normalized.draftId) return normalized.draftId;
  return `legacy-${stableHash(JSON.stringify({
    tree: normalized.tree,
    scope: normalized.scope,
    excludedBookmarkIds: normalized.excludedBookmarkIds,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt ?? null,
  }))}`;
}

function createPlanVersion(
  plan: PlanLike,
  options: ArchiveClassificationPlanOptions = {},
): ClassificationPlanVersion {
  const normalized = normalizePlanLike(plan);
  const archivedAt = options.archivedAt ?? Date.now();
  if (!isFiniteNumber(archivedAt)) throw new Error('归档时间无效。');
  return {
    version: 1,
    versionId: getClassificationPlanVersionId(plan),
    origin: options.origin ?? normalizeOrigin(undefined, normalized.draftId),
    tree: normalized.tree,
    scope: normalized.scope,
    excludedBookmarkIds: normalized.excludedBookmarkIds,
    createdAt: normalized.createdAt,
    archivedAt: normalizedTimestamp(archivedAt),
    ...(normalized.draftId ? { draftId: normalized.draftId } : {}),
    ...(normalized.updatedAt === undefined ? {} : { updatedAt: normalized.updatedAt }),
    ...(normalized.source ? { source: normalized.source } : {}),
    ...(normalized.application ? { application: normalized.application } : {}),
  };
}

function normalizePlanVersion(value: unknown): ClassificationPlanVersion | null {
  if (!isRecord(value) || (value.version !== undefined && value.version !== 1)) return null;
  const tree = normalizeCategoryTree(value.tree);
  const excludedBookmarkIds = normalizeExcludedBookmarkIds(value.excludedBookmarkIds);
  if (!tree || !excludedBookmarkIds || !isFiniteNumber(value.createdAt)) return null;
  const scope: ClassificationScope | null = value.scope === undefined ? { mode: 'full' } : normalizeScope(value.scope);
  if (!scope) return null;
  const draftIdValue = value.draftId === undefined ? undefined : nonEmptyString(value.draftId);
  if (value.draftId !== undefined && !draftIdValue) return null;
  const draftId = draftIdValue ?? undefined;
  const updatedAt = value.updatedAt === undefined ? undefined : value.updatedAt;
  if (updatedAt !== undefined && !isFiniteNumber(updatedAt)) return null;
  const source = value.source === undefined ? undefined : normalizeSource(value.source);
  if (value.source !== undefined && !source) return null;
  const application = value.application === undefined ? undefined : normalizeApplication(value.application);
  if (value.application !== undefined && !application) return null;
  const fallbackPlan: PlanLike = {
    tree,
    excludedBookmarkIds,
    createdAt: normalizedTimestamp(value.createdAt),
    ...(draftId ? { draftId } : {}),
    ...(updatedAt === undefined ? {} : { updatedAt: normalizedTimestamp(updatedAt) }),
    ...(scope.mode === 'full' ? {} : { scope }),
    ...(source ? { source } : {}),
    ...(application ? { application } : {}),
  };
  const versionId = nonEmptyString(value.versionId) ?? getClassificationPlanVersionId(fallbackPlan);
  const archivedAt = isFiniteNumber(value.archivedAt)
    ? normalizedTimestamp(value.archivedAt)
    : normalizedTimestamp(updatedAt ?? value.createdAt);
  return {
    version: 1,
    versionId,
    origin: normalizeOrigin(value.origin, draftId),
    tree,
    scope,
    excludedBookmarkIds,
    createdAt: normalizedTimestamp(value.createdAt),
    archivedAt,
    ...(draftId ? { draftId } : {}),
    ...(updatedAt === undefined ? {} : { updatedAt: normalizedTimestamp(updatedAt) }),
    ...(source ? { source } : {}),
    ...(application ? { application } : {}),
    ...(value.pinned === true ? { pinned: true } : {}),
  };
}

function orderVersions(versions: ClassificationPlanVersion[]): ClassificationPlanVersion[] {
  return [...versions].sort((left, right) => (
    right.archivedAt - left.archivedAt
    || (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
    || right.createdAt - left.createdAt
  ));
}

function normalizeArchive(value: unknown): ClassificationPlanArchive {
  const source = isRecord(value) && value.version === 1 ? value : null;
  const latestById = new Map<string, ClassificationPlanVersion>();
  if (source && Array.isArray(source.versions)) {
    for (const candidate of source.versions) {
      const version = normalizePlanVersion(candidate);
      if (!version) continue;
      const existing = latestById.get(version.versionId);
      if (!existing || version.archivedAt >= existing.archivedAt) latestById.set(version.versionId, version);
    }
  }
  const all = orderVersions([...latestById.values()]);
  // 星标版本不参与轮换，独立保留；非星标按时间取最新 MAX 条
  const pinned = all.filter((v) => v.pinned);
  const unpinned = all.filter((v) => !v.pinned).slice(0, MAX_CLASSIFICATION_PLAN_VERSIONS);
  // 合并后去重（避免 pinned 中也含重复 id）
  const combined = orderVersions([...new Map([...pinned, ...unpinned].map((v) => [v.versionId, v])).values()]);
  return { version: 1, versions: combined };
}

/** Reads a best-effort archive. Missing, malformed, or legacy storage is safely treated as an empty archive. */
export async function loadClassificationPlanArchive(): Promise<ClassificationPlanArchive> {
  const data = await chrome.storage.local.get(CLASSIFICATION_PLAN_ARCHIVE_STORAGE_KEY);
  return normalizeArchive(data[CLASSIFICATION_PLAN_ARCHIVE_STORAGE_KEY]);
}

/** Lists immutable historical plans from newest to oldest. */
export async function listClassificationPlanVersions(): Promise<ClassificationPlanVersion[]> {
  return (await loadClassificationPlanArchive()).versions;
}

/** Finds an immutable historical plan by its stable version id. */
export async function findClassificationPlanVersion(
  versionId: string,
): Promise<ClassificationPlanVersion | null> {
  const normalizedId = nonEmptyString(versionId);
  if (!normalizedId) return null;
  return (await loadClassificationPlanArchive()).versions.find((version) => version.versionId === normalizedId) ?? null;
}

/**
 * Archives a compact copy before a current full/partial draft is replaced.
 * Storage write failures deliberately propagate so the caller never overwrites a draft that was not preserved.
 */
export async function archiveClassificationPlan(
  plan: ClassifyResult,
  options: ArchiveClassificationPlanOptions = {},
): Promise<ClassificationPlanVersion> {
  const version = createPlanVersion(plan, options);
  const archive = await loadClassificationPlanArchive();
  // 使用 normalizeArchive 的星标保护逻辑：星标版本不受轮换影响
  const next = normalizeArchive({
    version: 1,
    versions: [version, ...archive.versions.filter((item) => item.versionId !== version.versionId)],
  });
  await chrome.storage.local.set({ [CLASSIFICATION_PLAN_ARCHIVE_STORAGE_KEY]: next });
  return version;
}

/**
 * 切换一个历史计划版本的星标状态。
 * 星标版本不参与自动轮换淘汰，只能手动删除。
 */
export async function toggleClassificationPlanVersionPin(versionId: string): Promise<boolean> {
  const normalizedId = nonEmptyString(versionId);
  if (!normalizedId) throw new Error('版本 ID 无效');
  const archive = await loadClassificationPlanArchive();
  const target = archive.versions.find((v) => v.versionId === normalizedId);
  if (!target) throw new Error(`未找到版本：${normalizedId}`);
  const nextPinned = !target.pinned;
  const next = normalizeArchive({
    version: 1,
    versions: archive.versions.map((v) =>
      v.versionId === normalizedId ? { ...v, pinned: nextPinned } : v,
    ),
  });
  await chrome.storage.local.set({ [CLASSIFICATION_PLAN_ARCHIVE_STORAGE_KEY]: next });
  return nextPinned;
}

/**
 * 删除一个历史计划版本（星标版本也可手动删除）。
 */
export async function deleteClassificationPlanVersion(versionId: string): Promise<void> {
  const normalizedId = nonEmptyString(versionId);
  if (!normalizedId) throw new Error('版本 ID 无效');
  const archive = await loadClassificationPlanArchive();
  const next: ClassificationPlanArchive = {
    version: 1,
    versions: archive.versions.filter((v) => v.versionId !== normalizedId),
  };
  await chrome.storage.local.set({ [CLASSIFICATION_PLAN_ARCHIVE_STORAGE_KEY]: next });
}
