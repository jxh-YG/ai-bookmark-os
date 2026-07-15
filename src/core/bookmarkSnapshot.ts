import type {
  BookmarkSnapshotNode,
  BookmarkTreeChange,
  BookmarkTreeChangeKind,
  BookmarkTreeSnapshot,
  ClassificationChangeSet,
  ClassificationChangeSummary,
  ClassificationScope,
} from '../types';

export interface SnapshotCreateOptions {
  capturedAt?: number;
}

export interface ChangeSetCreateOptions {
  id?: string;
  createdAt?: number;
  /** Store a bounded detail list while preserving the complete summary. */
  maxChanges?: number;
}

const DEFAULT_MAX_CHANGE_DETAILS = 500;
let changeSetSequence = 0;

function cloneScope(scope: ClassificationScope): ClassificationScope {
  if (scope.mode === 'full') return { mode: 'full' };
  return {
    mode: 'partial',
    targetDirectoryId: scope.targetDirectoryId,
    targetDirectoryTitle: scope.targetDirectoryTitle,
    bookmarkCount: scope.bookmarkCount,
  };
}

function cloneSnapshotNode(node: BookmarkSnapshotNode): BookmarkSnapshotNode {
  return {
    id: node.id,
    kind: node.kind,
    ...(node.parentId ? { parentId: node.parentId } : {}),
    index: node.index,
    title: node.title,
    ...(node.url ? { url: node.url } : {}),
  };
}

function emptySummary(): ClassificationChangeSummary {
  return {
    added: 0,
    removed: 0,
    moved: 0,
    renamed: 0,
    reordered: 0,
    urlChanged: 0,
  };
}

function normalizeError(error: unknown, scope: ClassificationScope): Error {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/permission|denied|unauthori[sz]ed|not allowed/i.test(message)) {
    return new Error(scope.mode === 'partial'
      ? '无法读取所选目录：权限不足。'
      : '无法读取书签：权限不足。');
  }
  return new Error(scope.mode === 'partial'
    ? '所选目录不存在、已被删除或无法访问。'
    : '无法读取当前书签树。');
}

function snapshotNodeTitle(node: BookmarkSnapshotNode): string {
  return node.title || node.url || '';
}

function canonicalSnapshotContent(
  rootId: string,
  scope: ClassificationScope,
  nodes: Record<string, BookmarkSnapshotNode>,
): string {
  const normalizedNodes = Object.values(nodes)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((node) => ({
      id: node.id,
      kind: node.kind,
      parentId: node.parentId ?? null,
      index: node.index,
      title: node.title,
      url: node.url ?? null,
    }));
  return JSON.stringify({
    version: 1,
    rootId,
    scope: scope.mode === 'partial'
      ? { mode: scope.mode, targetDirectoryId: scope.targetDirectoryId }
      : { mode: scope.mode },
    nodes: normalizedNodes,
  });
}

async function sha256(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('当前环境不支持书签快照指纹。');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function flattenBookmarkTree(
  roots: chrome.bookmarks.BookmarkTreeNode[],
): Record<string, BookmarkSnapshotNode> {
  const nodes: Record<string, BookmarkSnapshotNode> = {};
  const walk = (
    siblings: chrome.bookmarks.BookmarkTreeNode[],
    parentId?: string,
  ) => {
    siblings.forEach((node, index) => {
      if (!node?.id || typeof node.id !== 'string') {
        throw new Error('书签树中存在无效节点。');
      }
      if (nodes[node.id]) throw new Error('书签树中存在重复节点 ID。');
      const isBookmark = typeof node.url === 'string';
      nodes[node.id] = {
        id: node.id,
        kind: isBookmark ? 'bookmark' : 'folder',
        ...(parentId ? { parentId } : {}),
        index,
        title: node.title ?? '',
        ...(isBookmark ? { url: node.url } : {}),
      };
      if (!isBookmark && node.children?.length) walk(node.children, node.id);
    });
  };
  walk(roots);
  return nodes;
}

function resolvedScope(
  scope: ClassificationScope,
  root: chrome.bookmarks.BookmarkTreeNode,
  nodes: Record<string, BookmarkSnapshotNode>,
): ClassificationScope {
  if (scope.mode === 'full') return { mode: 'full' };
  if (!scope.targetDirectoryId.trim()) throw new Error('局部分类必须指定目标目录。');
  if (root.id !== scope.targetDirectoryId || root.url) {
    throw new Error('所选目标不是可访问的书签目录。');
  }
  const bookmarkCount = Object.values(nodes).filter((node) => node.kind === 'bookmark').length;
  return {
    mode: 'partial',
    targetDirectoryId: root.id,
    targetDirectoryTitle: root.title || scope.targetDirectoryTitle || '未命名目录',
    bookmarkCount,
  };
}

/**
 * Build a normalized snapshot from Chrome bookmark nodes. Exposed for deterministic tests
 * and for callers that have already read a live bookmark tree.
 */
export async function createBookmarkSnapshotFromTree(
  tree: chrome.bookmarks.BookmarkTreeNode[],
  scope: ClassificationScope,
  options: SnapshotCreateOptions = {},
): Promise<BookmarkTreeSnapshot> {
  const root = tree[0];
  if (!root?.id) {
    throw new Error(scope.mode === 'partial'
      ? '所选目录不存在、已被删除或无法访问。'
      : '当前书签树为空或无法访问。');
  }
  const nodes = flattenBookmarkTree(tree);
  const effectiveScope = resolvedScope(scope, root, nodes);
  const rootId = root.id;
  const fingerprint = await sha256(canonicalSnapshotContent(rootId, effectiveScope, nodes));
  return {
    version: 1,
    scope: effectiveScope,
    rootId,
    capturedAt: options.capturedAt ?? Date.now(),
    fingerprint,
    nodes,
  };
}

/** Capture exactly the full tree or selected directory subtree from the Chrome bookmark API. */
export async function captureBookmarkSnapshot(
  scope: ClassificationScope = { mode: 'full' },
): Promise<BookmarkTreeSnapshot> {
  let tree: chrome.bookmarks.BookmarkTreeNode[];
  try {
    tree = scope.mode === 'partial'
      ? await chrome.bookmarks.getSubTree(scope.targetDirectoryId)
      : await chrome.bookmarks.getTree();
  } catch (error) {
    throw normalizeError(error, scope);
  }
  try {
    return await createBookmarkSnapshotFromTree(tree, scope);
  } catch (error) {
    if (error instanceof Error) throw error;
    throw normalizeError(error, scope);
  }
}

/** Returns a human-readable path from the captured root to a node. */
export function getBookmarkSnapshotPath(snapshot: BookmarkTreeSnapshot, nodeId: string): string {
  const titles: string[] = [];
  const visited = new Set<string>();
  let current: BookmarkSnapshotNode | undefined = snapshot.nodes[nodeId];
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const title = snapshotNodeTitle(current);
    if (title) titles.push(title);
    current = current.parentId ? snapshot.nodes[current.parentId] : undefined;
  }
  return titles.reverse().join(' / ');
}

/** Re-reads the snapshot's own scope and checks whether the live tree is unchanged. */
export async function isBookmarkSnapshotCurrent(snapshot: BookmarkTreeSnapshot): Promise<boolean> {
  const current = await captureBookmarkSnapshot(snapshot.scope);
  return current.fingerprint === snapshot.fingerprint;
}

function makeChange(
  kind: BookmarkTreeChangeKind,
  before: BookmarkSnapshotNode | undefined,
  after: BookmarkSnapshotNode | undefined,
  beforeSnapshot: BookmarkTreeSnapshot,
  afterSnapshot: BookmarkTreeSnapshot,
): BookmarkTreeChange {
  const node = after ?? before;
  if (!node) throw new Error('无法创建没有书签节点的变更记录。');
  return {
    kind,
    id: node.id,
    nodeKind: node.kind,
    ...(before ? {
      before: cloneSnapshotNode(before),
      beforePath: getBookmarkSnapshotPath(beforeSnapshot, before.id),
    } : {}),
    ...(after ? {
      after: cloneSnapshotNode(after),
      afterPath: getBookmarkSnapshotPath(afterSnapshot, after.id),
    } : {}),
  };
}

function sameParent(left: BookmarkSnapshotNode, right: BookmarkSnapshotNode): boolean {
  return (left.parentId ?? null) === (right.parentId ?? null);
}

/**
 * Calculate an actual before/after live-bookmark change set. A moved node is not also
 * counted as reordered: its new parent already conveys the relevant placement change.
 */
export function diffBookmarkSnapshots(
  before: BookmarkTreeSnapshot,
  after: BookmarkTreeSnapshot,
  options: ChangeSetCreateOptions = {},
): ClassificationChangeSet {
  const summary = emptySummary();
  const allChanges: BookmarkTreeChange[] = [];
  const ids = [...new Set([...Object.keys(before.nodes), ...Object.keys(after.nodes)])]
    .sort((left, right) => left.localeCompare(right));
  const addChange = (
    kind: BookmarkTreeChangeKind,
    beforeNode: BookmarkSnapshotNode | undefined,
    afterNode: BookmarkSnapshotNode | undefined,
  ) => {
    summary[kind] += 1;
    allChanges.push(makeChange(kind, beforeNode, afterNode, before, after));
  };

  for (const id of ids) {
    const beforeNode = before.nodes[id];
    const afterNode = after.nodes[id];
    if (!beforeNode && afterNode) {
      addChange('added', undefined, afterNode);
      continue;
    }
    if (beforeNode && !afterNode) {
      addChange('removed', beforeNode, undefined);
      continue;
    }
    if (!beforeNode || !afterNode) continue;
    if (!sameParent(beforeNode, afterNode)) addChange('moved', beforeNode, afterNode);
    if (beforeNode.title !== afterNode.title) addChange('renamed', beforeNode, afterNode);
    if (sameParent(beforeNode, afterNode) && beforeNode.index !== afterNode.index) {
      addChange('reordered', beforeNode, afterNode);
    }
    if ((beforeNode.url ?? null) !== (afterNode.url ?? null)) {
      addChange('urlChanged', beforeNode, afterNode);
    }
  }

  const maxChanges = Math.max(0, Math.floor(options.maxChanges ?? DEFAULT_MAX_CHANGE_DETAILS));
  const truncated = allChanges.length > maxChanges;
  const createdAt = options.createdAt ?? Date.now();
  changeSetSequence += 1;
  return {
    id: options.id ?? `bookmark-change-${createdAt}-${changeSetSequence}`,
    scope: cloneScope(after.scope),
    createdAt,
    beforeFingerprint: before.fingerprint,
    afterFingerprint: after.fingerprint,
    summary,
    changes: truncated ? allChanges.slice(0, maxChanges) : allChanges,
    ...(truncated ? { truncated: true } : {}),
  };
}
