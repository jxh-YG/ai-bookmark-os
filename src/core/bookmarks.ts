// 书签读取、拍平、备份与回写
import type {
  ApplyRecord,
  BookmarkBackup,
  CategoryNode,
  ClassificationScope,
  FlatBookmark,
  PlanCompatibilityReport,
  RemovedSourceFolder,
} from '../types';
import { captureBookmarkSnapshot } from './bookmarkSnapshot';

const APPLY_FOLDER_TITLE = '✨ AI 整理';
const BACKUP_KEY = 'bookmarkBackup';
const APPLY_RECORD_KEY = 'applyRecord';
const PARTIAL_APPLY_RECORDS_KEY = 'partialApplyRecords';
const FULL_REPLACEMENT_TRANSACTION_KEY = 'fullReplacementTransaction';

type FullReplacementPhase = 'staging' | 'swapping' | 'rollback-pending' | 'committed';

/**
 * 全量重分类的短生命周期事务。旧 applyRecord 会始终保留在原 storage 键中，
 * 直到新根目录已安全切换到原位置，避免中断时丢失撤销能力。
 */
interface FullReplacementTransaction {
  version: 1;
  phase: FullReplacementPhase;
  previousRootFolderId: string;
  previousRecordCreatedAt: number;
  stagingRootFolderId: string;
  finalParentId: string;
  finalIndex: number;
  finalTitle: string;
  nextRecord: ApplyRecord;
  pendingFolder?: {
    parentId: string;
    finalTitle: string;
    temporaryTitle: string;
  };
}

type PartialApplyRecord = ApplyRecord & {
  targetDirectoryId: string;
  createdFolderIds: string[];
  status: 'applying' | 'complete' | 'rollback-pending';
};
/* Legacy corrupted text retained only to avoid a source-encoding rewrite. It is not executed.
const BROWSER_BOOKMARK_ROOT_TITLES = new Set([
  '涔︾鏍?, '鍏朵粬涔︾', '绉诲姩璁惧涔︾',
  'Bookmarks bar', 'Other bookmarks', 'Mobile bookmarks',
]);
*/
const BROWSER_BOOKMARK_ROOT_TITLES = new Set([
  String.fromCharCode(0x4e66, 0x7b7e, 0x680f),
  String.fromCharCode(0x5176, 0x4ed6, 0x4e66, 0x7b7e),
  String.fromCharCode(0x79fb, 0x52a8, 0x8bbe, 0x5907, 0x4e66, 0x7b7e),
  'Bookmarks bar', 'Other bookmarks', 'Mobile bookmarks',
]);

function isBrowserBookmarkRoot(title: string | undefined): boolean {
  return BROWSER_BOOKMARK_ROOT_TITLES.has((title ?? '').trim());
}

/** 读取并拍平整棵书签树（只保留有 url 的项，过滤无效协议） */
export async function getFlatBookmarks(): Promise<FlatBookmark[]> {
  const tree = await chrome.bookmarks.getTree();
  const result: FlatBookmark[] = [];

  const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.url) {
        if (/^(https?|ftp):/.test(node.url)) {
          result.push({
            id: node.id,
            title: node.title || node.url,
            url: node.url,
            folderPath: path.join('/'),
          });
        }
      } else if (node.children) {
        walk(node.children, node.title && !isBrowserBookmarkRoot(node.title) ? [...path, node.title] : path);
      }
    }
  };
  walk(tree, []);
  return result;
}

export interface BookmarkFolderOption {
  id: string;
  title: string;
  path: string;
}

export type FolderClassificationScope = Extract<ClassificationScope, { mode: 'partial' }> & {
  title: string;
  bookmarks: FlatBookmark[];
};

/** 列出可选目录，包含浏览器真实根目录但排除虚拟根节点。 */
export async function getBookmarkFolders(): Promise<BookmarkFolderOption[]> {
  let tree: chrome.bookmarks.BookmarkTreeNode[];
  try {
    tree = await chrome.bookmarks.getTree();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/permission|denied|权限/i.test(message)) {
      throw new Error('无法读取书签目录：权限不足。');
    }
    throw new Error('无法读取书签目录。');
  }
  const folders: BookmarkFolderOption[] = [];

  const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.url) continue;
      const title = node.title?.trim() ?? '';
      const isVirtualRoot = node.id === '0';
      const nextPath = title && !isVirtualRoot ? [...path, title] : path;
      if (title && !isVirtualRoot) {
        folders.push({ id: node.id, title, path: nextPath.join(' / ') });
      }
      if (node.children) walk(node.children, nextPath);
    }
  };

  walk(tree, []);
  return folders;
}

/** 仅读取所选目录子树，并拍平其中可分类的书签。 */
export async function getFolderClassificationScope(folderId: string): Promise<FolderClassificationScope> {
  if (!folderId?.trim()) {
    throw new Error('请选择需要分类的目录。');
  }

  let subtree: chrome.bookmarks.BookmarkTreeNode[];
  try {
    subtree = await chrome.bookmarks.getSubTree(folderId);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/permission|denied|权限/i.test(message)) {
      throw new Error('无法读取所选目录：权限不足。');
    }
    throw new Error('所选目录不存在、已被删除或无法访问。');
  }

  const root = subtree[0];
  if (!root) {
    throw new Error('所选目录不存在或无法访问。');
  }
  if (root.id === '0') {
    throw new Error('请选择一个书签根目录或父级目录。');
  }
  if (root.url) {
    throw new Error('所选目标不是目录。');
  }
  if (!root.children?.length) {
    throw new Error('所选目录为空，暂无可分类的书签。');
  }

  const bookmarks: FlatBookmark[] = [];
  const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[], path: string[]) => {
    for (const node of nodes) {
      if (node.url) {
        if (/^(https?|ftp):/.test(node.url)) {
          bookmarks.push({
            id: node.id,
            title: node.title || node.url,
            url: node.url,
            folderPath: path.join('/'),
          });
        }
      } else if (node.children) {
        walk(node.children, node.title ? [...path, node.title] : path);
      }
    }
  };
  walk(root.children, root.title ? [root.title] : []);

  if (!bookmarks.length) {
    throw new Error('所选目录下没有可分类的书签。');
  }

  return {
    mode: 'partial',
    targetDirectoryId: root.id,
    targetDirectoryTitle: root.title || '未命名目录',
    bookmarkCount: bookmarks.length,
    title: root.title || '未命名目录',
    bookmarks,
  };
}

/** 去重：同一 URL 只保留第一条（用于送 LLM 的列表；回写时全部书签都会移动） */
export function dedupeByUrl(bookmarks: FlatBookmark[]): FlatBookmark[] {
  const seen = new Set<string>();
  return bookmarks.filter((b) => {
    if (seen.has(b.url)) return false;
    seen.add(b.url);
    return true;
  });
}

/** 备份当前书签树到 storage.local */
export async function backupBookmarks(): Promise<void> {
  const tree = await chrome.bookmarks.getTree();
  const backup: BookmarkBackup = { createdAt: Date.now(), tree };
  await chrome.storage.local.set({ [BACKUP_KEY]: backup });
}

export async function getBackup(): Promise<BookmarkBackup | null> {
  const data = await chrome.storage.local.get(BACKUP_KEY);
  return data[BACKUP_KEY] ?? null;
}

/** 把书签树备份导出为 Netscape HTML 字符串（可导入回浏览器） */
export function backupToHtml(backup: BookmarkBackup): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];
  const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[], indent: string) => {
    for (const node of nodes) {
      if (node.url) {
        lines.push(`${indent}<DT><A HREF="${esc(node.url)}">${esc(node.title)}</A>`);
      } else if (node.children) {
        if (node.title) {
          lines.push(`${indent}<DT><H3>${esc(node.title)}</H3>`);
          lines.push(`${indent}<DL><p>`);
          walk(node.children, indent + '    ');
          lines.push(`${indent}</DL><p>`);
        } else {
          walk(node.children, indent);
        }
      }
    }
  };
  walk(backup.tree, '    ');
  lines.push('</DL><p>');
  return lines.join('\n');
}

export interface ApplyPlan {
  folderCount: number;
  moveCount: number;
}

export interface ApplyResult {
  moveCount: number;
  cleanedFolderCount: number;
  /** True when excluded content keeps the previous full root in place. */
  preservedPreviousRoot?: boolean;
}

/** 统计应用计划（用于 diff 预览） */
export function planApply(tree: CategoryNode[]): ApplyPlan {
  let folderCount = 0;
  let moveCount = 0;
  const walk = (nodes: CategoryNode[]) => {
    for (const n of nodes) {
      folderCount++;
      moveCount += n.bookmarkIds?.length ?? 0;
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  return { folderCount, moveCount };
}

/** 收集分类方案中的唯一书签 ID，并保留方案中的首次出现顺序。 */
export function collectPlannedBookmarkIds(tree: CategoryNode[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      for (const id of node.bookmarkIds ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(tree);
  return ids;
}

function collectDuplicatePlannedBookmarkIds(tree: CategoryNode[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const walk = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      for (const id of node.bookmarkIds ?? []) {
        if (seen.has(id)) duplicates.add(id);
        else seen.add(id);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(tree);
  return [...duplicates];
}

function assertNoDuplicatePlannedBookmarkIds(tree: CategoryNode[], message: string): void {
  if (collectDuplicatePlannedBookmarkIds(tree).length > 0) throw new Error(message);
}

function isBookmarkNode(node: chrome.bookmarks.BookmarkTreeNode | undefined): boolean {
  return typeof node?.url === 'string';
}

const FULL_PLAN_CHANGED_ERROR = '分类方案中的书签已变化，请基于当前书签重新生成全量分类方案。';
const PARTIAL_PLAN_CHANGED_ERROR = '所选目录中的书签已变化，请重新执行分类。';
export interface ClassificationApplySource {
  scope: ClassificationScope;
  fingerprint: string;
}

async function assertClassificationSourceCurrent(
  source: ClassificationApplySource | undefined,
  expectedScope: ClassificationScope,
  errorMessage: string,
): Promise<void> {
  // Legacy callers have no snapshot baseline. The current UI always supplies one;
  // retain this compatibility path for older stored integrations while validating
  // every versioned plan before any Chrome bookmark write.
  if (!source) return;
  if (source.fingerprint.length === 0 || source.scope.mode !== expectedScope.mode) {
    throw new Error(errorMessage);
  }
  if (expectedScope.mode === 'partial' && (
    source.scope.mode !== 'partial' || source.scope.targetDirectoryId !== expectedScope.targetDirectoryId
  )) {
    throw new Error(errorMessage);
  }
  const current = await captureBookmarkSnapshot(expectedScope);
  if (current.fingerprint !== source.fingerprint) throw new Error(errorMessage);
}

async function assertFullPlannedBookmarksExist(bookmarkIds: string[]): Promise<void> {
  for (const id of bookmarkIds) {
    try {
      const [node] = await chrome.bookmarks.get(id);
      if (!isBookmarkNode(node)) throw new Error('invalid planned bookmark');
    } catch {
      throw new Error(FULL_PLAN_CHANGED_ERROR);
    }
  }
}

async function assertPartialPlannedBookmarksInScope(
  bookmarkIds: string[],
  targetDirectoryId: string,
): Promise<void> {
  for (const id of bookmarkIds) {
    try {
      const [node] = await chrome.bookmarks.get(id);
      if (!isBookmarkNode(node) || !(await isNodeInsideDirectory(node, targetDirectoryId))) {
        throw new Error('invalid scoped planned bookmark');
      }
    } catch {
      throw new Error(PARTIAL_PLAN_CHANGED_ERROR);
    }
  }
}

function hasSameBookmarkIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}

/**
 * 检查当前或历史分类方案能否复用，不修改 Chrome 书签。
 * 历史方案允许标题、URL、排序及全量目录位置变化；只阻止缺失或局部越界的计划书签。
 */
export async function inspectClassificationPlanCompatibility(
  tree: CategoryNode[],
  scope: ClassificationScope,
  excludedBookmarkIds: string[] = [],
): Promise<PlanCompatibilityReport> {
  const snapshot = await captureBookmarkSnapshot(scope);
  const plannedBookmarkIds = collectPlannedBookmarkIds(tree);
  const duplicateBookmarkIds = collectDuplicatePlannedBookmarkIds(tree);
  const missingBookmarkIds: string[] = [];
  const outsideScopeBookmarkIds: string[] = [];

  for (const id of plannedBookmarkIds) {
    if (snapshot.nodes[id]?.kind === 'bookmark') continue;
    if (snapshot.scope.mode === 'partial') {
      try {
        const [node] = await chrome.bookmarks.get(id);
        if (isBookmarkNode(node) && !(await isNodeInsideDirectory(node, snapshot.scope.targetDirectoryId))) {
          outsideScopeBookmarkIds.push(id);
          continue;
        }
      } catch {
        // A missing or inaccessible ID is reported as missing below.
      }
    }
    missingBookmarkIds.push(id);
  }

  const plannedIds = new Set(plannedBookmarkIds);
  const excludedIds = new Set(excludedBookmarkIds);
  const unplannedBookmarkIds = Object.values(snapshot.nodes)
    .filter((node) => node.kind === 'bookmark')
    .map((node) => node.id)
    .filter((id) => !plannedIds.has(id) && !excludedIds.has(id));

  return {
    scope: snapshot.scope,
    fingerprint: snapshot.fingerprint,
    plannedBookmarkIds,
    duplicateBookmarkIds,
    missingBookmarkIds,
    outsideScopeBookmarkIds,
    unplannedBookmarkIds,
    canApply: duplicateBookmarkIds.length === 0
      && missingBookmarkIds.length === 0
      && outsideScopeBookmarkIds.length === 0,
  };
}

/**
 * 应用分类树到书签：
 * 在书签栏下创建「✨ AI 整理」根文件夹，按树结构建文件夹并移动书签。
 * 调用前必须先 backupBookmarks()。同时记录每条书签原位置供撤销。
 */
export async function applyToBookmarks(
  tree: CategoryNode[],
  onProgress?: (done: number, total: number) => void,
  onComplete?: (result: ApplyResult) => void,
  source?: ClassificationApplySource,
): Promise<void> {
  assertNoDuplicatePlannedBookmarkIds(tree, '分类方案包含重复书签 ID，请重新生成全量分类方案。');
  await assertClassificationSourceCurrent(source, { mode: 'full' }, FULL_PLAN_CHANGED_ERROR);
  await recoverPendingFullReplacement();
  const [applyRecord, partialRecords] = await Promise.all([
    getApplyRecord(),
    getPartialApplyRecords(),
  ]);
  if (partialRecords.length > 0) {
    throw new Error('请先撤销最近一次小范围分类，再执行新的全量分类。');
  }
  await assertFullPlannedBookmarksExist(collectPlannedBookmarkIds(tree));
  if (applyRecord) {
    if (!isReplaceableFullApplyRecord(applyRecord)) {
      throw new Error('当前全量分类尚未完成或无法安全恢复，请先处理现有撤销记录后再重新分类。');
    }
    await replaceFullApply(tree, applyRecord, onProgress, onComplete);
    return;
  }
  await applyFirstFullClassification(tree, onProgress, onComplete);
}

function isReplaceableFullApplyRecord(record: ApplyRecord): boolean {
  return !record.targetDirectoryId && (record.status === undefined || record.status === 'complete');
}

async function applyFirstFullClassification(
  tree: CategoryNode[],
  onProgress?: (done: number, total: number) => void,
  onComplete?: (result: ApplyResult) => void,
): Promise<void> {
  const [applyRecord, partialRecords] = await Promise.all([
    getApplyRecord(),
    getPartialApplyRecords(),
  ]);
  if (applyRecord || partialRecords.length > 0) {
    throw new Error('请先撤销上一次应用，再执行新的分类应用。');
  }

  const { moveCount } = planApply(tree);
  let done = 0;

  // 书签栏 id：取根节点第一个子节点（"1" 在 Chrome 中是书签栏，但不要硬编码假设）
  const roots = await chrome.bookmarks.getTree();
  const bar = roots[0].children?.[0];
  const browserRootIds = new Set(['0', ...(roots[0].children?.map((node) => node.id) ?? [])]);
  const collectSourceFolders = createSourceFolderCandidateCollector(browserRootIds);
  const sourceFoldersByBookmark = new Map<string, SourceFolderCandidate[]>();
  if (!bar) throw new Error('未找到书签栏');

  // 若已存在同名整理文件夹，加时间戳避免混淆
  const existing = (await chrome.bookmarks.getChildren(bar.id)).find(
    (n) => !n.url && n.title === APPLY_FOLDER_TITLE,
  );
  const rootTitle = existing
    ? `${APPLY_FOLDER_TITLE} ${new Date().toLocaleString('zh-CN')}`
    : APPLY_FOLDER_TITLE;
  await assertFullPlannedBookmarksExist(collectPlannedBookmarkIds(tree));
  const rootFolder = await chrome.bookmarks.create({ parentId: bar.id, title: rootTitle });

  const record: ApplyRecord = {
    createdAt: Date.now(),
    rootFolderId: rootFolder.id,
    moves: [],
    createdFolderIds: [rootFolder.id],
    status: 'applying',
    removedSourceFolders: [],
  };
  const recoverableIds = new Set<string>();
  const bookmarkIds = collectPlannedBookmarkIds(tree);

  for (const id of bookmarkIds) {
    try {
      const [node] = await chrome.bookmarks.get(id);
      if (!isBookmarkNode(node)) throw new Error('invalid planned bookmark');
      record.moves.push({
        id,
        oldParentId: node.parentId ?? bar.id,
        oldIndex: node.index ?? 0,
      });
      sourceFoldersByBookmark.set(id, await collectSourceFolders(node.parentId));
      recoverableIds.add(id);
    } catch {
      try {
        await chrome.bookmarks.remove(rootFolder.id);
      } catch {
        // The preflight has not persisted an undo record yet; surface the original plan error.
      }
      throw new Error(FULL_PLAN_CHANGED_ERROR);
    }
  }

  try {
    await chrome.storage.local.set({ [APPLY_RECORD_KEY]: record });
  } catch (error) {
    try {
      await chrome.bookmarks.remove(rootFolder.id);
    } catch {
      // 清理失败时保留空目录，避免掩盖原始错误
    }
    throw error;
  }

  const movedIds = new Set<string>();
  const createLevel = async (nodes: CategoryNode[], parentId: string) => {
    for (const n of nodes) {
      const folder = await chrome.bookmarks.create({ parentId, title: n.name });
      record.createdFolderIds!.push(folder.id);
      await chrome.storage.local.set({ [APPLY_RECORD_KEY]: record });
      if (n.children) await createLevel(n.children, folder.id);
      for (const id of n.bookmarkIds ?? []) {
        if (!recoverableIds.has(id)) continue;
        await chrome.bookmarks.move(id, { parentId: folder.id });
        movedIds.add(id);
        done++;
        onProgress?.(done, moveCount);
      }
    }
  };

  try {
    await createLevel(tree, rootFolder.id);
    record.status = 'complete';
    await chrome.storage.local.set({ [APPLY_RECORD_KEY]: record });
    const cleanedFolderCount = await cleanupEmptySourceFolders(
      record,
      collectSourceFolderCandidates(sourceFoldersByBookmark, movedIds, browserRootIds),
      async () => chrome.storage.local.set({ [APPLY_RECORD_KEY]: record }),
    );
    onComplete?.({ moveCount: movedIds.size, cleanedFolderCount });
  } catch (error) {
    const movedRecord: ApplyRecord = {
      ...record,
      moves: record.moves.filter((move) => movedIds.has(move.id)),
    };
    let restoredFolderIds = new Map<string, string>();
    let restoredFolders = true;
    try {
      restoredFolderIds = await restoreRemovedSourceFolders(
        movedRecord,
        async () => chrome.storage.local.set({ [APPLY_RECORD_KEY]: movedRecord }),
      );
    } catch {
      restoredFolders = false;
    }
    const { remainingMoves } = restoredFolders
      ? await restoreBookmarkMoves(movedRecord, undefined, restoredFolderIds)
      : { remainingMoves: movedRecord.moves };
    const rollbackComplete = restoredFolders
      && remainingMoves.length === 0
      && await removeOwnedCreatedFolders(record);
    if (rollbackComplete) {
      await chrome.storage.local.remove(APPLY_RECORD_KEY);
    } else {
      record.moves = remainingMoves;
      record.status = 'rollback-pending';
      await chrome.storage.local.set({ [APPLY_RECORD_KEY]: record });
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      rollbackComplete
        ? `全量分类应用失败，已恢复原书签：${message}`
        : `全量分类应用失败，部分书签或临时目录未能恢复，已保留撤销记录：${message}`,
    );
  }
}

async function getStagingRootTitle(parentId: string): Promise<string> {
  const baseTitle = `${APPLY_FOLDER_TITLE}（更新中）`;
  const existingTitles = new Set((await chrome.bookmarks.getChildren(parentId))
    .filter((node) => !node.url)
    .map((node) => node.title));
  if (!existingTitles.has(baseTitle)) return baseTitle;
  let serial = 2;
  while (existingTitles.has(`${baseTitle} ${serial}`)) serial++;
  return `${baseTitle} ${serial}`;
}

async function getPreservedContentReplacementTitle(parentId: string, originalTitle: string): Promise<string> {
  const baseTitle = `${originalTitle}（重新分类）`;
  const existingTitles = new Set((await chrome.bookmarks.getChildren(parentId))
    .filter((node) => !node.url)
    .map((node) => node.title));
  if (!existingTitles.has(baseTitle)) return baseTitle;
  let serial = 2;
  while (existingTitles.has(`${baseTitle} ${serial}`)) serial++;
  return `${baseTitle} ${serial}`;
}

async function addOwnedFolderCandidates(
  candidates: Map<string, SourceFolderCandidate>,
  record: ApplyRecord,
  scopeRootId?: string,
): Promise<void> {
  const ids = new Set([record.rootFolderId, ...(record.createdFolderIds ?? [])]);
  for (const id of ids) {
    if (candidates.has(id)) continue;
    try {
      const [folder] = await chrome.bookmarks.get(id);
      if (!folder || folder.url || !folder.parentId) continue;
      if (scopeRootId && id !== scopeRootId && !(await isNodeInsideDirectory(folder, scopeRootId))) {
        continue;
      }
      candidates.set(id, {
        sourceFolderId: folder.id,
        title: folder.title,
        oldParentId: folder.parentId,
        oldIndex: folder.index ?? 0,
        depth: 0,
      });
    } catch {
      // The folder may have been removed by a concurrent user action.
    }
  }
}

async function saveFullReplacementTransaction(transaction: FullReplacementTransaction): Promise<void> {
  await chrome.storage.local.set({ [FULL_REPLACEMENT_TRANSACTION_KEY]: transaction });
}

function asFullReplacementTransaction(value: unknown): FullReplacementTransaction | null {
  if (!value || typeof value !== 'object') return null;
  const transaction = value as Partial<FullReplacementTransaction>;
  if (
    transaction.version !== 1
    || !transaction.previousRootFolderId
    || !transaction.stagingRootFolderId
    || !transaction.finalParentId
    || typeof transaction.finalIndex !== 'number'
    || typeof transaction.finalTitle !== 'string'
    || !transaction.nextRecord
    || !Array.isArray(transaction.nextRecord.moves)
  ) return null;
  if (!['staging', 'swapping', 'rollback-pending', 'committed'].includes(transaction.phase ?? '')) return null;
  return transaction as FullReplacementTransaction;
}

async function getFullReplacementTransaction(): Promise<FullReplacementTransaction | null> {
  const data = await chrome.storage.local.get(FULL_REPLACEMENT_TRANSACTION_KEY);
  return asFullReplacementTransaction(data[FULL_REPLACEMENT_TRANSACTION_KEY]);
}

function stagingFolderMarker(): string {
  const token = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `\u2063AI-staging-${token}`;
}

/**
 * Persist a creation intent before Chrome creates a staging child folder. The temporary,
 * unique title lets crash recovery distinguish an unrecorded empty folder from user data.
 */
async function createStagingFolder(
  transaction: FullReplacementTransaction,
  parentId: string,
  finalTitle: string,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const pendingFolder = {
    parentId,
    finalTitle,
    temporaryTitle: stagingFolderMarker(),
  };
  transaction.pendingFolder = pendingFolder;
  await saveFullReplacementTransaction(transaction);
  let folder: chrome.bookmarks.BookmarkTreeNode;
  try {
    folder = await chrome.bookmarks.create({ parentId, title: pendingFolder.temporaryTitle });
  } catch (error) {
    delete transaction.pendingFolder;
    await saveFullReplacementTransaction(transaction);
    throw error;
  }
  transaction.nextRecord.createdFolderIds!.push(folder.id);
  await saveFullReplacementTransaction(transaction);
  await chrome.bookmarks.update(folder.id, { title: finalTitle });
  delete transaction.pendingFolder;
  await saveFullReplacementTransaction(transaction);
  return folder;
}

/** Reconcile a folder created after its intent was saved but before its ID was recorded. */
async function reconcilePendingStagingFolder(transaction: FullReplacementTransaction): Promise<boolean> {
  const pendingFolder = transaction.pendingFolder;
  if (!pendingFolder) return true;
  let matchingFolder: chrome.bookmarks.BookmarkTreeNode | undefined;
  try {
    matchingFolder = (await chrome.bookmarks.getChildren(pendingFolder.parentId)).find((node) => (
      !node.url && node.title === pendingFolder.temporaryTitle
    ));
  } catch {
    return false;
  }

  if (!matchingFolder) {
    delete transaction.pendingFolder;
    await saveFullReplacementTransaction(transaction);
    return true;
  }
  if (transaction.nextRecord.createdFolderIds?.includes(matchingFolder.id)) {
    delete transaction.pendingFolder;
    await saveFullReplacementTransaction(transaction);
    return true;
  }
  try {
    if ((await chrome.bookmarks.getChildren(matchingFolder.id)).length > 0) return false;
    await chrome.bookmarks.remove(matchingFolder.id);
    delete transaction.pendingFolder;
    await saveFullReplacementTransaction(transaction);
    return true;
  } catch {
    return false;
  }
}

async function replaceFullApply(
  tree: CategoryNode[],
  previousRecord: ApplyRecord,
  onProgress?: (done: number, total: number) => void,
  onComplete?: (result: ApplyResult) => void,
): Promise<void> {
  let previousRoot: chrome.bookmarks.BookmarkTreeNode;
  try {
    const [root] = await chrome.bookmarks.get(previousRecord.rootFolderId);
    if (!root || root.url || !root.parentId || root.parentId === '0') throw new Error('invalid full root');
    previousRoot = root;
  } catch {
    throw new Error('未找到可替换的原全量分类目录，请先恢复或清理现有撤销记录。');
  }

  const roots = await chrome.bookmarks.getTree();
  const browserRootIds = new Set(['0', ...(roots[0]?.children?.map((node) => node.id) ?? [])]);
  const collectSourceFolders = createSourceFolderCandidateCollector(browserRootIds);
  const sourceFoldersByBookmark = new Map<string, SourceFolderCandidate[]>();
  const moves: BookmarkMove[] = [];
  for (const id of collectPlannedBookmarkIds(tree)) {
    try {
      const [node] = await chrome.bookmarks.get(id);
      if (!node?.url) throw new Error('missing bookmark');
      moves.push({ id, oldParentId: node.parentId ?? previousRoot.parentId!, oldIndex: node.index ?? 0 });
      sourceFoldersByBookmark.set(id, await collectSourceFolders(node.parentId));
    } catch {
      throw new Error('书签已变化，请基于当前书签重新生成全量分类方案。');
    }
  }

  const stagingRoot = await chrome.bookmarks.create({
    parentId: previousRoot.parentId!,
    title: await getStagingRootTitle(previousRoot.parentId!),
  });
  const transaction: FullReplacementTransaction = {
    version: 1,
    phase: 'staging',
    previousRootFolderId: previousRecord.rootFolderId,
    previousRecordCreatedAt: previousRecord.createdAt,
    stagingRootFolderId: stagingRoot.id,
    finalParentId: previousRoot.parentId!,
    finalIndex: previousRoot.index ?? 0,
    finalTitle: previousRoot.title,
    nextRecord: {
      createdAt: Date.now(),
      rootFolderId: stagingRoot.id,
      moves,
      createdFolderIds: [stagingRoot.id],
      status: 'applying',
      removedSourceFolders: [],
    },
  };
  try {
    await saveFullReplacementTransaction(transaction);
  } catch (error) {
    try {
      await chrome.bookmarks.remove(stagingRoot.id);
    } catch {
      // A storage failure must not trigger a recursive delete.
    }
    throw error;
  }

  const plannedMoveById = new Map(moves.map((move) => [move.id, move]));
  const movedIds = new Set<string>();
  const { moveCount } = planApply(tree);
  let done = 0;
  let committed = false;
  try {
    const createLevel = async (nodes: CategoryNode[], parentId: string): Promise<void> => {
      for (const node of nodes) {
        const folder = await createStagingFolder(transaction, parentId, node.name);
        if (node.children) await createLevel(node.children, folder.id);
        for (const id of node.bookmarkIds ?? []) {
          const original = plannedMoveById.get(id);
          if (!original) continue;
          const [current] = await chrome.bookmarks.get(id);
          if (!current?.url || current.parentId !== original.oldParentId) {
            throw new Error('书签在应用过程中已变化');
          }
          await chrome.bookmarks.move(id, { parentId: folder.id });
          movedIds.add(id);
          done++;
          onProgress?.(done, moveCount);
        }
      }
    };

    await createLevel(tree, stagingRoot.id);
    transaction.nextRecord.status = 'complete';
    await saveFullReplacementTransaction(transaction);
    const candidates = collectSourceFolderCandidates(sourceFoldersByBookmark, movedIds, browserRootIds);
    await addOwnedFolderCandidates(candidates, previousRecord, previousRecord.rootFolderId);
    const cleanedFolderCount = await cleanupEmptySourceFolders(
      transaction.nextRecord,
      candidates,
      async () => saveFullReplacementTransaction(transaction),
    );
    let preservedPreviousRoot = false;
    if (await folderExists(previousRecord.rootFolderId)) {
      const [remainingRoot] = await chrome.bookmarks.get(previousRecord.rootFolderId);
      if (!remainingRoot || remainingRoot.url || remainingRoot.parentId !== transaction.finalParentId) {
        throw new Error('原全量分类目录在替换过程中已变化，无法安全保留未纳入方案的内容。');
      }
      // Excluded bookmarks must stay where they are. Keep their old root and place
      // the new staging tree immediately after it instead of deleting user content.
      transaction.finalIndex = (remainingRoot.index ?? transaction.finalIndex) + 1;
      transaction.finalTitle = await getPreservedContentReplacementTitle(
        transaction.finalParentId,
        transaction.finalTitle,
      );
      preservedPreviousRoot = true;
    }

    transaction.phase = 'swapping';
    await saveFullReplacementTransaction(transaction);
    await chrome.bookmarks.update(stagingRoot.id, { title: transaction.finalTitle });
    await chrome.bookmarks.move(stagingRoot.id, {
      parentId: transaction.finalParentId,
      index: transaction.finalIndex,
    });
    transaction.phase = 'committed';
    await chrome.storage.local.set({
      [APPLY_RECORD_KEY]: transaction.nextRecord,
      [FULL_REPLACEMENT_TRANSACTION_KEY]: transaction,
    });
    committed = true;
    try {
      await chrome.storage.local.remove(FULL_REPLACEMENT_TRANSACTION_KEY);
    } catch {
      // A committed transaction is cleaned at the next apply/undo entry.
    }
    onComplete?.({ moveCount: movedIds.size, cleanedFolderCount, ...(preservedPreviousRoot ? { preservedPreviousRoot: true } : {}) });
  } catch (error) {
    if (committed) throw error;
    const fullyRolledBack = await rollbackFullReplacement(transaction);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      fullyRolledBack
        ? `全量分类替换失败，已恢复原全量分类：${message}`
        : `全量分类替换失败，部分书签或临时目录未能恢复，已保留恢复事务：${message}`,
    );
  }
}

function restrictTreeToScope(tree: CategoryNode[], allowedIds: Set<string>): CategoryNode[] {
  const usedIds = new Set<string>();
  const walk = (nodes: CategoryNode[]): CategoryNode[] =>
    nodes
      .map((node) => {
        const children = node.children ? walk(node.children) : undefined;
        const bookmarkIds = (node.bookmarkIds ?? []).filter((id) => {
          if (!allowedIds.has(id) || usedIds.has(id)) return false;
          usedIds.add(id);
          return true;
        });
        return {
          name: node.name,
          ...(children?.length ? { children } : {}),
          ...(bookmarkIds.length ? { bookmarkIds } : {}),
        };
      })
      .filter((node) => (node.bookmarkIds?.length ?? 0) > 0 || (node.children?.length ?? 0) > 0);
  return walk(tree);
}

type BookmarkMove = ApplyRecord['moves'][number];
type SourceFolderCandidate = Omit<RemovedSourceFolder, 'removalStatus' | 'restoredFolderId'>;
type RecordPersister = () => Promise<void>;

/**
 * Restore lower indexes first. After several bookmarks leave one folder, the
 * remaining children are compacted; restoring in reverse order would insert a
 * later bookmark behind that compacted remainder and corrupt the old order.
 */
function movesInRestoreOrder(moves: BookmarkMove[]): BookmarkMove[] {
  return moves
    .map((move, order) => ({ move, order }))
    .sort((a, b) => (
      a.move.oldParentId.localeCompare(b.move.oldParentId)
      || a.move.oldIndex - b.move.oldIndex
      || a.order - b.order
    ))
    .map(({ move }) => move);
}

/** Update a persisted undo record after Chrome recreates removed source folders with new IDs. */
function remapApplyRecordFolderReferences(
  record: ApplyRecord,
  restoredFolderIds: Map<string, string>,
): ApplyRecord {
  if (restoredFolderIds.size === 0) return record;
  const remap = (folderId: string) => restoredFolderIds.get(folderId) ?? folderId;
  return {
    ...record,
    rootFolderId: remap(record.rootFolderId),
    moves: record.moves.map((move) => ({ ...move, oldParentId: remap(move.oldParentId) })),
    ...(record.createdFolderIds ? { createdFolderIds: record.createdFolderIds.map(remap) } : {}),
    ...(record.targetDirectoryId ? { targetDirectoryId: remap(record.targetDirectoryId) } : {}),
    ...(record.removedSourceFolders ? {
      removedSourceFolders: record.removedSourceFolders.map((folder) => ({
        ...folder,
        oldParentId: remap(folder.oldParentId),
        ...(folder.restoredFolderId ? { restoredFolderId: remap(folder.restoredFolderId) } : {}),
      })),
    } : {}),
  };
}

function createSourceFolderCandidateCollector(protectedFolderIds: Set<string>) {
  const folderCache = new Map<string, Promise<chrome.bookmarks.BookmarkTreeNode | null>>();
  const chainCache = new Map<string, Promise<SourceFolderCandidate[]>>();

  const getFolder = (folderId: string) => {
    const cached = folderCache.get(folderId);
    if (cached) return cached;
    const request = (async () => {
      try {
        const [folder] = await chrome.bookmarks.get(folderId);
        return folder && !folder.url ? folder : null;
      } catch {
        return null;
      }
    })();
    folderCache.set(folderId, request);
    return request;
  };

  return async (startParentId: string | undefined): Promise<SourceFolderCandidate[]> => {
    if (!startParentId || protectedFolderIds.has(startParentId)) return [];
    const cached = chainCache.get(startParentId);
    if (cached) return cached;

    const request = (async () => {
      const chain: SourceFolderCandidate[] = [];
      const visited = new Set<string>();
      let folderId: string | undefined = startParentId;
      while (folderId && !protectedFolderIds.has(folderId) && !visited.has(folderId)) {
        visited.add(folderId);
        const folder = await getFolder(folderId);
        if (!folder || !folder.parentId) break;
        chain.push({
          sourceFolderId: folder.id,
          title: folder.title,
          oldParentId: folder.parentId,
          oldIndex: folder.index ?? 0,
          depth: chain.length + 1,
        });
        folderId = folder.parentId;
      }
      return chain;
    })();
    chainCache.set(startParentId, request);
    return request;
  };
}

function collectSourceFolderCandidates(
  sourceFoldersByBookmark: Map<string, SourceFolderCandidate[]>,
  movedIds: Set<string>,
  protectedFolderIds: Set<string>,
): Map<string, SourceFolderCandidate> {
  const candidates = new Map<string, SourceFolderCandidate>();
  for (const bookmarkId of movedIds) {
    for (const folder of sourceFoldersByBookmark.get(bookmarkId) ?? []) {
      if (protectedFolderIds.has(folder.sourceFolderId)) continue;
      const existing = candidates.get(folder.sourceFolderId);
      if (!existing || folder.depth > existing.depth) candidates.set(folder.sourceFolderId, folder);
    }
  }
  return candidates;
}

function addApplyRecordFolderReferences(folderIds: Set<string>, record: ApplyRecord): void {
  folderIds.add(record.rootFolderId);
  if (record.targetDirectoryId) folderIds.add(record.targetDirectoryId);
  for (const move of record.moves) folderIds.add(move.oldParentId);
  for (const folder of record.removedSourceFolders ?? []) {
    folderIds.add(folder.sourceFolderId);
    folderIds.add(folder.oldParentId);
    if (folder.restoredFolderId) folderIds.add(folder.restoredFolderId);
  }
}

async function cleanupEmptySourceFolders(
  record: ApplyRecord,
  candidates: Map<string, SourceFolderCandidate>,
  persistRecord: RecordPersister,
  canRemove?: (folderId: string) => Promise<boolean>,
): Promise<number> {
  const protectedFolderIds = new Set([record.rootFolderId, ...(record.createdFolderIds ?? [])]);
  for (const folderId of protectedFolderIds) candidates.delete(folderId);
  const blockedFolderIds = new Set<string>();
  let cleanedFolderCount = 0;

  while (candidates.size > 0) {
    let removedAny = false;
    for (const [folderId, folder] of [...candidates]) {
      if (blockedFolderIds.has(folderId)) continue;
      const hasCandidateChild = [...candidates.values()].some((child) => (
        child.sourceFolderId !== folderId && child.oldParentId === folderId
      ));
      if (hasCandidateChild) continue;

      try {
        if (canRemove && !(await canRemove(folderId))) {
          blockedFolderIds.add(folderId);
          continue;
        }
        if ((await chrome.bookmarks.getChildren(folderId)).length > 0) {
          blockedFolderIds.add(folderId);
          continue;
        }
        const removedFolders = record.removedSourceFolders ?? (record.removedSourceFolders = []);
        const snapshot: RemovedSourceFolder = { ...folder, removalStatus: 'pending' };
        removedFolders.push(snapshot);
        try {
          await persistRecord();
        } catch {
          removedFolders.pop();
          blockedFolderIds.add(folderId);
          continue;
        }

        try {
          await chrome.bookmarks.remove(folderId);
        } catch {
          record.removedSourceFolders = removedFolders.filter((item) => item !== snapshot);
          try {
            await persistRecord();
          } catch {
            // A stale pending record is reconciled safely during undo.
          }
          blockedFolderIds.add(folderId);
          continue;
        }

        snapshot.removalStatus = 'removed';
        try {
          await persistRecord();
        } catch {
          // The persisted pending entry is enough to reconstruct after an interruption.
        }
        candidates.delete(folderId);
        cleanedFolderCount++;
        removedAny = true;
      } catch {
        // A directory that changed concurrently is intentionally left untouched.
        blockedFolderIds.add(folderId);
      }
    }
    if (!removedAny) break;
  }
  return cleanedFolderCount;
}

async function folderExists(folderId: string): Promise<boolean> {
  try {
    const [folder] = await chrome.bookmarks.get(folderId);
    return !!folder && !folder.url;
  } catch {
    return false;
  }
}

async function restoreRemovedSourceFolders(
  record: ApplyRecord,
  persistRecord: RecordPersister,
): Promise<Map<string, string>> {
  const folders = record.removedSourceFolders ?? [];
  if (folders.length === 0) return new Map();

  let changed = false;
  const restoredFolderIds = new Map<string, string>();
  const remainingFolders: RemovedSourceFolder[] = [];

  for (const folder of folders) {
    if (folder.removalStatus === 'pending' && await folderExists(folder.sourceFolderId)) {
      restoredFolderIds.set(folder.sourceFolderId, folder.sourceFolderId);
      continue;
    }
    if (folder.removalStatus === 'pending') {
      folder.removalStatus = 'removed';
      changed = true;
    }
    if (folder.restoredFolderId && await folderExists(folder.restoredFolderId)) {
      restoredFolderIds.set(folder.sourceFolderId, folder.restoredFolderId);
    } else if (await folderExists(folder.sourceFolderId)) {
      restoredFolderIds.set(folder.sourceFolderId, folder.sourceFolderId);
    } else {
      if (folder.restoredFolderId) {
        delete folder.restoredFolderId;
        changed = true;
      }
      remainingFolders.push(folder);
    }
  }
  if (remainingFolders.length !== folders.length) {
    record.removedSourceFolders = folders.filter((folder) => (
      remainingFolders.includes(folder) || restoredFolderIds.has(folder.sourceFolderId)
    ));
    changed = true;
  }
  if (changed) await persistRecord();

  const unresolvedFolderIds = new Set(remainingFolders.map((folder) => folder.sourceFolderId));
  const blockedFolderIds = new Set<string>();
  while (remainingFolders.length > 0) {
    const readyFolders = remainingFolders
      .filter((folder) => (
        !blockedFolderIds.has(folder.oldParentId)
        && (!unresolvedFolderIds.has(folder.oldParentId) || restoredFolderIds.has(folder.oldParentId))
      ))
      .sort((left, right) => (
        left.oldParentId.localeCompare(right.oldParentId)
        || left.oldIndex - right.oldIndex
        || left.sourceFolderId.localeCompare(right.sourceFolderId)
      ));
    if (readyFolders.length === 0) break;
    let restoredAny = false;
    for (const folder of readyFolders) {
      if (!remainingFolders.includes(folder)) continue;
      let restored: chrome.bookmarks.BookmarkTreeNode;
      try {
        const parentId = restoredFolderIds.get(folder.oldParentId) ?? folder.oldParentId;
        restored = await chrome.bookmarks.create({
          parentId,
          title: folder.title,
          index: folder.oldIndex,
        });
      } catch {
        blockedFolderIds.add(folder.sourceFolderId);
        continue;
      }
      folder.restoredFolderId = restored.id;
      restoredFolderIds.set(folder.sourceFolderId, restored.id);
      unresolvedFolderIds.delete(folder.sourceFolderId);
      remainingFolders.splice(remainingFolders.indexOf(folder), 1);
      await persistRecord();
      restoredAny = true;
    }
    if (!restoredAny) break;
  }
  return restoredFolderIds;
}

async function isNodeInsideDirectory(
  node: chrome.bookmarks.BookmarkTreeNode,
  targetDirectoryId: string,
): Promise<boolean> {
  if (node.id === targetDirectoryId) return true;
  let parentId = node.parentId;
  const visited = new Set<string>();
  while (parentId) {
    if (parentId === targetDirectoryId) return true;
    if (visited.has(parentId)) return false;
    visited.add(parentId);
    try {
      const [parent] = await chrome.bookmarks.get(parentId);
      if (!parent || parent.url) return false;
      parentId = parent.parentId;
    } catch {
      return false;
    }
  }
  return false;
}

function isSafeToRemoveCreatedFolder(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  rootFolderId: string,
  createdFolderIds: Set<string>,
): boolean {
  return nodes.every((node) => {
    if (node.url) return false;
    if (node.id !== rootFolderId && !createdFolderIds.has(node.id)) return false;
    return isSafeToRemoveCreatedFolder(node.children ?? [], rootFolderId, createdFolderIds);
  });
}

async function removePartialCreatedFolders(record: ApplyRecord): Promise<void> {
  if (!record.targetDirectoryId) return;
  const createdFolderIds = new Set(record.createdFolderIds ?? []);
  for (const folderId of [...createdFolderIds].reverse()) {
    try {
      const subtree = await chrome.bookmarks.getSubTree(folderId);
      const root = subtree[0];
      if (
        root
        && folderId !== record.targetDirectoryId
        && await isNodeInsideDirectory(root, record.targetDirectoryId)
        && isSafeToRemoveCreatedFolder(subtree, folderId, createdFolderIds)
      ) {
        await chrome.bookmarks.remove(folderId);
      }
    } catch {
      // 不能证明目录仍在目标范围内且完全由本次操作创建时，保留目录。
    }
  }
}

/** Remove only folders recorded as created by this operation, never recursively. */
async function removeOwnedCreatedFolders(record: ApplyRecord): Promise<boolean> {
  const createdFolderIds = [...new Set(record.createdFolderIds ?? [])];
  if (createdFolderIds.length === 0) return false;
  let allRemoved = true;
  const ownedIds = new Set(createdFolderIds);
  for (const folderId of [...createdFolderIds].reverse()) {
    try {
      const subtree = await chrome.bookmarks.getSubTree(folderId);
      const root = subtree[0];
      if (!root || root.url || !isSafeToRemoveCreatedFolder(subtree, folderId, ownedIds)) {
        allRemoved = false;
        continue;
      }
      if ((await chrome.bookmarks.getChildren(folderId)).length > 0) {
        allRemoved = false;
        continue;
      }
      await chrome.bookmarks.remove(folderId);
    } catch {
      if (await folderExists(folderId)) allRemoved = false;
    }
  }
  for (const folderId of createdFolderIds) {
    if (await folderExists(folderId)) return false;
  }
  return allRemoved;
}

async function rollbackFullReplacement(transaction: FullReplacementTransaction): Promise<boolean> {
  const persist = async () => saveFullReplacementTransaction(transaction);
  if (!(await reconcilePendingStagingFolder(transaction))) {
    transaction.phase = 'rollback-pending';
    try {
      await persist();
    } catch {
      // The pending creation intent remains the safe recovery record.
    }
    return false;
  }
  let restoredFolderIds: Map<string, string>;
  try {
    restoredFolderIds = await restoreRemovedSourceFolders(transaction.nextRecord, persist);
  } catch {
    transaction.phase = 'rollback-pending';
    try {
      await persist();
    } catch {
      // The existing transaction remains the recovery point when a retry cannot be persisted.
    }
    return false;
  }

  try {
    const previousRecord = await getApplyRecord();
    if (!previousRecord || previousRecord.createdAt !== transaction.previousRecordCreatedAt) {
      throw new Error('previous apply record changed during replacement rollback');
    }
    const remappedPreviousRecord = remapApplyRecordFolderReferences(previousRecord, restoredFolderIds);
    const nextTransaction: FullReplacementTransaction = {
      ...transaction,
      previousRootFolderId: remappedPreviousRecord.rootFolderId,
    };
    await chrome.storage.local.set({
      [APPLY_RECORD_KEY]: remappedPreviousRecord,
      [FULL_REPLACEMENT_TRANSACTION_KEY]: nextTransaction,
    });
    transaction.previousRootFolderId = nextTransaction.previousRootFolderId;
  } catch {
    transaction.phase = 'rollback-pending';
    try {
      await persist();
    } catch {
      // Keep the last consistent transaction so startup recovery can retry the remap.
    }
    return false;
  }

  const failedMoveIds = new Set<string>();
  for (const move of movesInRestoreOrder(transaction.nextRecord.moves)) {
    try {
      const [current] = await chrome.bookmarks.get(move.id);
      // Only move bookmarks still provably inside staging. A later manual move wins.
      if (!current?.url || !(await isNodeInsideDirectory(current, transaction.stagingRootFolderId))) continue;
      await chrome.bookmarks.move(move.id, {
        parentId: restoredFolderIds.get(move.oldParentId) ?? move.oldParentId,
        index: move.oldIndex,
      });
    } catch {
      failedMoveIds.add(move.id);
    }
  }
  if (failedMoveIds.size > 0) {
    transaction.nextRecord.moves = transaction.nextRecord.moves.filter((move) => failedMoveIds.has(move.id));
    transaction.phase = 'rollback-pending';
    try {
      await persist();
    } catch {
      // Keep the previously persisted transaction for a future recovery attempt.
    }
    return false;
  }

  if (!(await removeOwnedCreatedFolders(transaction.nextRecord))) {
    transaction.phase = 'rollback-pending';
    try {
      await persist();
    } catch {
      // The transaction must remain discoverable even if this update fails.
    }
    return false;
  }
  try {
    await chrome.storage.local.remove(FULL_REPLACEMENT_TRANSACTION_KEY);
    return true;
  } catch {
    transaction.phase = 'rollback-pending';
    try {
      await persist();
    } catch {
      // A committed rollback can be retried safely; no apply record was replaced.
    }
    return false;
  }
}

async function recoverPendingFullReplacement(): Promise<void> {
  const transaction = await getFullReplacementTransaction();
  if (!transaction) return;
  const record = await getApplyRecord();
  if (
    transaction.phase === 'committed'
    && record?.rootFolderId === transaction.nextRecord.rootFolderId
  ) {
    await chrome.storage.local.remove(FULL_REPLACEMENT_TRANSACTION_KEY);
    return;
  }
  if (
    !record
    || record.rootFolderId !== transaction.previousRootFolderId
    || record.createdAt !== transaction.previousRecordCreatedAt
  ) {
    throw new Error('检测到未完成的全量分类替换，撤销记录不一致，无法安全继续。');
  }
  if (!(await rollbackFullReplacement(transaction))) {
    throw new Error('检测到未完成的全量分类替换，自动恢复未完成，请稍后重试。');
  }
}

async function getPartialApplyRecords(): Promise<PartialApplyRecord[]> {
  const data = await chrome.storage.local.get(PARTIAL_APPLY_RECORDS_KEY);
  const storedRecords = data[PARTIAL_APPLY_RECORDS_KEY];
  if (!Array.isArray(storedRecords)) return [];

  const records: PartialApplyRecord[] = [];
  for (const storedRecord of storedRecords) {
    if (!storedRecord || typeof storedRecord !== 'object') continue;
    const record = storedRecord as ApplyRecord;
    const targetDirectoryId = record.targetDirectoryId?.trim();
    if (!targetDirectoryId) continue;
    records.push({
      ...record,
      targetDirectoryId,
      createdFolderIds: Array.isArray(record.createdFolderIds) ? record.createdFolderIds : [],
      status: record.status === 'applying' || record.status === 'rollback-pending'
        ? record.status
        : 'complete',
    });
  }
  return records;
}

async function savePartialApplyRecords(records: PartialApplyRecord[]): Promise<void> {
  if (records.length === 0) {
    await chrome.storage.local.remove(PARTIAL_APPLY_RECORDS_KEY);
    return;
  }
  await chrome.storage.local.set({ [PARTIAL_APPLY_RECORDS_KEY]: records });
}

async function updateLatestPartialApplyRecord(
  records: PartialApplyRecord[],
  record: PartialApplyRecord,
): Promise<void> {
  if (records.length === 0) {
    throw new Error('未找到小范围分类的撤销记录。');
  }
  records[records.length - 1] = record;
  await savePartialApplyRecords(records);
}

async function rollbackPartialApply(
  record: PartialApplyRecord,
  movedIds: Set<string>,
  partialRecords: PartialApplyRecord[],
): Promise<boolean> {
  const failedIds = new Set<string>();
  const movesToRestore = record.moves.filter((move) => movedIds.has(move.id));
  for (const move of movesInRestoreOrder(movesToRestore)) {
    try {
      await chrome.bookmarks.move(move.id, { parentId: move.oldParentId, index: move.oldIndex });
    } catch {
      failedIds.add(move.id);
    }
  }

  if (failedIds.size > 0) {
    record.moves = record.moves.filter((move) => failedIds.has(move.id));
    record.status = 'rollback-pending';
    try {
      await updateLatestPartialApplyRecord(partialRecords, record);
    } catch {
      // Keep the in-memory record intact; callers can still surface the failed rollback.
    }
    return false;
  }

  await removePartialCreatedFolders(record);
  try {
    partialRecords.pop();
    await savePartialApplyRecords(partialRecords);
  } catch {
    // All moved bookmarks have been restored; a stale record cannot remove data.
  }
  return true;
}

/**
 * 严格在一个目录内部应用分类。
 * 写入前重新读取目标子树，避免过期或范围外的 ID 被移动。
 */
export async function applyPartialToBookmarks(
  tree: CategoryNode[],
  targetDirectoryId: string,
  onProgress?: (done: number, total: number) => void,
  source?: ClassificationApplySource,
): Promise<ApplyResult & { title: string }> {
  assertNoDuplicatePlannedBookmarkIds(tree, '分类方案包含重复书签 ID，请重新执行局部分类。');
  await assertClassificationSourceCurrent(source, {
    mode: 'partial', targetDirectoryId, targetDirectoryTitle: '', bookmarkCount: 0,
  }, PARTIAL_PLAN_CHANGED_ERROR);
  await recoverPendingFullReplacement();
  const [legacyRecord, partialRecords] = await Promise.all([
    getApplyRecord(),
    getPartialApplyRecords(),
  ]);
  if (legacyRecord?.targetDirectoryId || partialRecords.some((record) => record.status !== 'complete')) {
    throw new Error('请先撤销未完成的小范围分类，再执行新的分类应用。');
  }

  const scopeSnapshot = await captureBookmarkSnapshot({
    mode: 'partial',
    targetDirectoryId,
    targetDirectoryTitle: '',
    bookmarkCount: 0,
  });
  if (scopeSnapshot.scope.mode !== 'partial') throw new Error(PARTIAL_PLAN_CHANGED_ERROR);
  const scope = {
    ...scopeSnapshot.scope,
    title: scopeSnapshot.scope.targetDirectoryTitle,
  };
  const scopeRootIds = new Set(['0', scope.targetDirectoryId]);
  if (legacyRecord) addApplyRecordFolderReferences(scopeRootIds, legacyRecord);
  for (const partialRecord of partialRecords) addApplyRecordFolderReferences(scopeRootIds, partialRecord);
  const collectSourceFolders = createSourceFolderCandidateCollector(scopeRootIds);
  const sourceFoldersByBookmark = new Map<string, SourceFolderCandidate[]>();
  const plannedBookmarkIds = collectPlannedBookmarkIds(tree);
  await assertPartialPlannedBookmarksInScope(plannedBookmarkIds, scope.targetDirectoryId);
  const liveScopeBookmarkIds = new Set(Object.values(scopeSnapshot.nodes)
    .filter((node) => node.kind === 'bookmark')
    .map((node) => node.id));
  const scopedTree = restrictTreeToScope(tree, liveScopeBookmarkIds);
  const scopedBookmarkIds = collectPlannedBookmarkIds(scopedTree);
  if (!hasSameBookmarkIds(plannedBookmarkIds, scopedBookmarkIds)) {
    throw new Error(PARTIAL_PLAN_CHANGED_ERROR);
  }
  await assertPartialPlannedBookmarksInScope(scopedBookmarkIds, scope.targetDirectoryId);
  const { moveCount } = planApply(scopedTree);
  if (!moveCount) {
    throw new Error('所选目录中没有可应用的分类结果。');
  }

  const record: PartialApplyRecord = {
    createdAt: Date.now(),
    rootFolderId: scope.targetDirectoryId,
    moves: [],
    createdFolderIds: [],
    targetDirectoryId: scope.targetDirectoryId,
    status: 'applying',
    removedSourceFolders: [],
  };
  const originalMoves = new Map<string, BookmarkMove>();
  const bookmarkIds = scopedBookmarkIds;

  for (const id of bookmarkIds) {
    try {
      const [node] = await chrome.bookmarks.get(id);
      if (!node?.url || !(await isNodeInsideDirectory(node, scope.targetDirectoryId))) {
        throw new Error('所选目录中的书签已变化，请重新执行分类。');
      }
      originalMoves.set(id, {
        id,
        oldParentId: node.parentId ?? scope.targetDirectoryId,
        oldIndex: node.index ?? 0,
      });
      sourceFoldersByBookmark.set(id, await collectSourceFolders(node.parentId));
    } catch (error) {
      if (error instanceof Error && error.message.includes('书签已变化')) throw error;
      throw new Error('所选目录中的书签已变化，请重新执行分类。');
    }
  }
  if (!originalMoves.size) {
    throw new Error('所选目录中的书签已变化，请重新执行分类。');
  }

  partialRecords.push(record);
  await savePartialApplyRecords(partialRecords);

  let done = 0;
  const movedIds = new Set<string>();
  const createLevel = async (nodes: CategoryNode[], parentId: string): Promise<void> => {
    for (const node of nodes) {
      const folder = await chrome.bookmarks.create({ parentId, title: node.name });
      record.createdFolderIds!.push(folder.id);
      await updateLatestPartialApplyRecord(partialRecords, record);
      if (node.children) await createLevel(node.children, folder.id);
      for (const id of node.bookmarkIds ?? []) {
        const originalMove = originalMoves.get(id);
        if (!originalMove) throw new Error('所选目录中的书签已变化，请重新执行分类。');
        const [current] = await chrome.bookmarks.get(id);
        if (!current?.url || !(await isNodeInsideDirectory(current, scope.targetDirectoryId))) {
          throw new Error('书签已离开所选目录，已取消本次应用。');
        }
        record.moves.push(originalMove);
        await updateLatestPartialApplyRecord(partialRecords, record);
        await chrome.bookmarks.move(id, { parentId: folder.id });
        movedIds.add(id);
        done++;
        onProgress?.(done, moveCount);
      }
    }
  };

  try {
    await createLevel(scopedTree, scope.targetDirectoryId);
    record.status = 'complete';
    await updateLatestPartialApplyRecord(partialRecords, record);
    const cleanedFolderCount = await cleanupEmptySourceFolders(
      record,
      collectSourceFolderCandidates(sourceFoldersByBookmark, movedIds, scopeRootIds),
      async () => updateLatestPartialApplyRecord(partialRecords, record),
      async (folderId) => {
        try {
          const [folder] = await chrome.bookmarks.get(folderId);
          return !!folder && !folder.url && await isNodeInsideDirectory(folder, scope.targetDirectoryId);
        } catch {
          return false;
        }
      },
    );
    return { title: scope.title, moveCount: movedIds.size, cleanedFolderCount };
  } catch (error) {
    const fullyRolledBack = await rollbackPartialApply(record, movedIds, partialRecords);
    const message = error instanceof Error ? error.message : String(error);
    const rollbackMessage = fullyRolledBack
      ? '已撤销本次变更'
      : '部分书签未能恢复，已保留撤销记录，请稍后重试撤销';
    throw new Error(`局部分类应用失败，${rollbackMessage}：${message}`);
  }
}

export async function getApplyRecord(): Promise<ApplyRecord | null> {
  const data = await chrome.storage.local.get(APPLY_RECORD_KEY);
  return data[APPLY_RECORD_KEY] ?? null;
}

/** 返回最近可撤销的局部应用；没有局部应用时保持原全量记录语义。 */
export async function getLatestApplyRecord(): Promise<ApplyRecord | null> {
  const partialRecords = await getPartialApplyRecords();
  return partialRecords[partialRecords.length - 1] ?? await getApplyRecord();
}

async function restoreBookmarkMoves(
  record: ApplyRecord,
  onProgress?: (done: number, total: number) => void,
  restoredFolderIds: Map<string, string> = new Map(),
): Promise<{ restored: number; remainingMoves: BookmarkMove[] }> {
  let restored = 0;
  const failedIds = new Set<string>();
  const moves = movesInRestoreOrder(record.moves);
  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    try {
      await chrome.bookmarks.move(move.id, {
        parentId: restoredFolderIds.get(move.oldParentId) ?? move.oldParentId,
        index: move.oldIndex,
      });
      restored++;
    } catch {
      failedIds.add(move.id);
    }
    onProgress?.(i + 1, moves.length);
  }
  return {
    restored,
    remainingMoves: record.moves.filter((move) => failedIds.has(move.id)),
  };
}

async function updateEarlierPartialFolderReferences(
  partialRecords: PartialApplyRecord[],
  restoredFolderIds: Map<string, string>,
): Promise<void> {
  if (restoredFolderIds.size === 0) return;
  let changed = false;
  for (const record of partialRecords.slice(0, -1)) {
    const remap = (folderId: string) => restoredFolderIds.get(folderId) ?? folderId;
    const nextRootFolderId = remap(record.rootFolderId);
    const nextTargetDirectoryId = remap(record.targetDirectoryId);
    const nextCreatedFolderIds = record.createdFolderIds.map(remap);
    const nextMoves = record.moves.map((move) => ({ ...move, oldParentId: remap(move.oldParentId) }));
    const nextRemovedFolders = record.removedSourceFolders?.map((folder) => ({
      ...folder,
      oldParentId: remap(folder.oldParentId),
      ...(folder.restoredFolderId ? { restoredFolderId: remap(folder.restoredFolderId) } : {}),
    }));
    if (
      nextRootFolderId !== record.rootFolderId
      || nextTargetDirectoryId !== record.targetDirectoryId
      || nextCreatedFolderIds.some((folderId, index) => folderId !== record.createdFolderIds[index])
      || nextMoves.some((move, index) => move.oldParentId !== record.moves[index].oldParentId)
      || nextRemovedFolders?.some((folder, index) => (
        folder.oldParentId !== record.removedSourceFolders![index].oldParentId
        || folder.restoredFolderId !== record.removedSourceFolders![index].restoredFolderId
      ))
    ) {
      record.rootFolderId = nextRootFolderId;
      record.targetDirectoryId = nextTargetDirectoryId;
      record.createdFolderIds = nextCreatedFolderIds;
      record.moves = nextMoves;
      record.removedSourceFolders = nextRemovedFolders;
      changed = true;
    }
  }
  if (changed) await savePartialApplyRecords(partialRecords);
}

async function undoPartialApplyRecord(
  record: PartialApplyRecord,
  partialRecords: PartialApplyRecord[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const restoredFolderIds = await restoreRemovedSourceFolders(
    record,
    async () => updateLatestPartialApplyRecord(partialRecords, record),
  );
  await updateEarlierPartialFolderReferences(partialRecords, restoredFolderIds);
  const { restored, remainingMoves } = await restoreBookmarkMoves(record, onProgress, restoredFolderIds);
  if (remainingMoves.length > 0) {
    await updateLatestPartialApplyRecord(partialRecords, {
      ...record,
      moves: remainingMoves,
      status: 'rollback-pending',
    });
    throw new Error('部分书签未能恢复，已保留撤销记录，请稍后重试。');
  }

  await removePartialCreatedFolders(record);
  partialRecords.pop();
  await savePartialApplyRecords(partialRecords);
  return restored;
}

async function undoLegacyPartialApply(
  record: ApplyRecord,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const restoredFolderIds = await restoreRemovedSourceFolders(
    record,
    async () => chrome.storage.local.set({ [APPLY_RECORD_KEY]: record }),
  );
  const { restored, remainingMoves } = await restoreBookmarkMoves(record, onProgress, restoredFolderIds);
  if (remainingMoves.length > 0) {
    await chrome.storage.local.set({
      [APPLY_RECORD_KEY]: { ...record, moves: remainingMoves },
    });
    return restored;
  }

  await removePartialCreatedFolders(record);
  await chrome.storage.local.remove(APPLY_RECORD_KEY);
  return restored;
}

async function undoFullApply(
  record: ApplyRecord,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const restoredFolderIds = await restoreRemovedSourceFolders(
    record,
    async () => chrome.storage.local.set({ [APPLY_RECORD_KEY]: record }),
  );
  const { restored, remainingMoves } = await restoreBookmarkMoves(record, onProgress, restoredFolderIds);
  if (remainingMoves.length > 0) {
    await chrome.storage.local.set({
      [APPLY_RECORD_KEY]: { ...record, moves: remainingMoves },
    });
    return restored;
  }

  // New full applies record every created folder. Never removeTree here: a user may
  // have added bookmarks or folders under the AI root after the classification ran.
  if (Array.isArray(record.createdFolderIds)) {
    if (!(await removeOwnedCreatedFolders(record))) {
      await chrome.storage.local.set({
        [APPLY_RECORD_KEY]: { ...record, moves: [] },
      });
      return restored;
    }
    await chrome.storage.local.remove(APPLY_RECORD_KEY);
    return restored;
  }

  // Legacy records do not prove ownership of child folders. Only remove an
  // actually empty root with the non-recursive API; otherwise keep the record.
  try {
    if ((await chrome.bookmarks.getChildren(record.rootFolderId)).length > 0) {
      await chrome.storage.local.set({ [APPLY_RECORD_KEY]: { ...record, moves: [] } });
      return restored;
    }
    await chrome.bookmarks.remove(record.rootFolderId);
  } catch {
    await chrome.storage.local.set({ [APPLY_RECORD_KEY]: { ...record, moves: [] } });
    return restored;
  }
  await chrome.storage.local.remove(APPLY_RECORD_KEY);
  return restored;
}

/**
 * 保持原全量撤销接口：存在局部操作时必须先按最近一次局部操作撤销。
 */
export async function undoApply(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  await recoverPendingFullReplacement();
  if ((await getPartialApplyRecords()).length > 0) {
    throw new Error('请先撤销最近一次小范围分类，再撤销全量分类。');
  }
  const record = await getApplyRecord();
  if (!record) return 0;
  if (record.targetDirectoryId) {
    return undoLegacyPartialApply(record, onProgress);
  }
  return undoFullApply(record, onProgress);
}

/** 撤销用户最后一次应用；局部操作优先于全量操作。 */
export async function undoLatestApply(
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  await recoverPendingFullReplacement();
  const partialRecords = await getPartialApplyRecords();
  const record = partialRecords[partialRecords.length - 1];
  if (record) {
    return undoPartialApplyRecord(record, partialRecords, onProgress);
  }
  return undoApply(onProgress);
}
