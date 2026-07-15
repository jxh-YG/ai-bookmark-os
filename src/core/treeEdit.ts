// 分类树编辑操作（纯函数，返回新树）
import type { CategoryNode } from '../types';

export interface FolderDeletionCheck {
  canDelete: boolean;
  bookmarkCount: number;
  folderName: string;
}

/** 深拷贝树 */
function cloneTree(tree: CategoryNode[]): CategoryNode[] {
  return JSON.parse(JSON.stringify(tree));
}

/** 按索引路径取节点；path 为各层 children 下标 */
function nodeAt(tree: CategoryNode[], path: number[]): CategoryNode | null {
  let nodes = tree;
  let node: CategoryNode | null = null;
  for (const i of path) {
    node = nodes[i] ?? null;
    if (!node) return null;
    nodes = node.children ?? [];
  }
  return node;
}

function countNodeBookmarks(node: CategoryNode): number {
  let count = node.bookmarkIds?.length ?? 0;
  for (const child of node.children ?? []) count += countNodeBookmarks(child);
  return count;
}

/** 检查目录及其子目录是否可安全从分类方案中删除。 */
export function checkFolderDeletion(
  tree: CategoryNode[],
  path: number[],
): FolderDeletionCheck {
  const node = nodeAt(tree, path);
  if (!node) return { canDelete: false, bookmarkCount: 0, folderName: '' };

  const bookmarkCount = countNodeBookmarks(node);
  return {
    canDelete: bookmarkCount === 0,
    bookmarkCount,
    folderName: node.name,
  };
}

/** 重命名节点 */
export function renameNode(tree: CategoryNode[], path: number[], newName: string): CategoryNode[] {
  const next = cloneTree(tree);
  const node = nodeAt(next, path);
  if (node && newName.trim()) node.name = newName.trim();
  return next;
}

/**
 * 仅删除完全为空的分类目录。
 * 书签（包括子目录中的书签）必须先由用户移动到其他分类，不能被自动归入“其他”。
 */
export function deleteEmptyFolder(tree: CategoryNode[], path: number[]): CategoryNode[] {
  if (!path.length || !checkFolderDeletion(tree, path).canDelete) return tree;

  const next = cloneTree(tree);
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1];
  const siblings = parentPath.length ? nodeAt(next, parentPath)?.children : next;
  if (!siblings?.[index]) return tree;
  siblings.splice(index, 1);
  return next;
}

/**
 * 兼容旧调用入口：现在同样只允许删除空目录。
 * @deprecated 请改用 deleteEmptyFolder，并先调用 checkFolderDeletion 展示提示。
 */
export function deleteNode(tree: CategoryNode[], path: number[]): CategoryNode[] {
  return deleteEmptyFolder(tree, path);
}

/**
 * 把多条书签移到目标分类。移动后保持书签在原方案树中的相对顺序。
 */
export function moveBookmarks(
  tree: CategoryNode[],
  bookmarkIds: string[],
  toPath: number[],
  toIndex?: number,
): CategoryNode[] {
  const selected = new Set(bookmarkIds);
  if (!selected.size) return tree;

  const next = cloneTree(tree);
  const target = nodeAt(next, toPath);
  if (!target) return tree;

  const originalTargetIds = [...(target.bookmarkIds ?? [])];
  const requestedIndex = toIndex ?? originalTargetIds.length;
  if (!Number.isInteger(requestedIndex) || requestedIndex < 0 || requestedIndex > originalTargetIds.length) {
    return tree;
  }

  const movedIds: string[] = [];
  const seen = new Set<string>();
  const removeSelected = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      const ids = node.bookmarkIds;
      if (ids?.length) {
        const remaining: string[] = [];
        for (const id of ids) {
          if (!selected.has(id)) {
            remaining.push(id);
          } else if (!seen.has(id)) {
            movedIds.push(id);
            seen.add(id);
          }
        }
        if (remaining.length !== ids.length) node.bookmarkIds = remaining;
      }
      if (node.children) removeSelected(node.children);
    }
  };
  removeSelected(next);

  if (!movedIds.length) return tree;

  const targetIds = target.bookmarkIds ??= [];
  const removedBeforeTargetIndex = originalTargetIds
    .slice(0, requestedIndex)
    .filter((id) => selected.has(id)).length;
  const insertionIndex = toIndex === undefined
    ? targetIds.length
    : Math.min(Math.max(requestedIndex - removedBeforeTargetIndex, 0), targetIds.length);
  targetIds.splice(insertionIndex, 0, ...movedIds);
  return next;
}

/** 把一条书签从一个节点移到另一个节点。 */
export function moveBookmark(
  tree: CategoryNode[],
  bookmarkId: string,
  toPath: number[],
  toIndex?: number,
): CategoryNode[] {
  return moveBookmarks(tree, [bookmarkId], toPath, toIndex);
}

/** Create a top-level AI category and move the selected plan bookmarks into it atomically. */
export function createCategoryWithBookmarks(
  tree: CategoryNode[],
  name: string,
  bookmarkIds: string[],
): CategoryNode[] {
  const trimmedName = name.trim();
  if (!trimmedName) return tree;
  const next = cloneTree(tree);
  next.push({ name: trimmedName, bookmarkIds: [] });
  return moveBookmarks(next, bookmarkIds, [next.length - 1]);
}

/**
 * 从当前 AI 分类方案移除指定书签。
 * 此函数只修改方案树；真实 Chrome 书签保留在原位置，由上层应用逻辑决定如何处理。
 */
export function removeBookmarksFromPlan(
  tree: CategoryNode[],
  bookmarkIds: string[],
): CategoryNode[] {
  const selected = new Set(bookmarkIds);
  if (!selected.size) return tree;

  const next = cloneTree(tree);
  const removeSelected = (nodes: CategoryNode[]) => {
    for (const node of nodes) {
      if (node.bookmarkIds?.length) {
        node.bookmarkIds = node.bookmarkIds.filter((id) => !selected.has(id));
      }
      if (node.children) removeSelected(node.children);
    }
  };
  removeSelected(next);
  return next;
}

/**
 * 把一个分类节点连同其所有子分类和书签移入另一个分类节点。
 * Moves the folder as one unit, preserving its complete subtree.
 */
export function moveNode(
  tree: CategoryNode[],
  fromPath: number[],
  toParentPath: number[],
  toIndex: number,
): CategoryNode[] {
  if (!fromPath.length || toIndex < 0) return tree;
  // A folder cannot contain itself or any of its descendants.
  if (
    toParentPath.length >= fromPath.length
    && fromPath.every((part, index) => toParentPath[index] === part)
  ) {
    return tree;
  }

  const next = cloneTree(tree);
  const sourceParentPath = fromPath.slice(0, -1);
  const sourceIndex = fromPath[fromPath.length - 1];
  const sourceSiblings = sourceParentPath.length ? nodeAt(next, sourceParentPath)?.children : next;
  if (!sourceSiblings) return next;
  const moved = sourceSiblings[sourceIndex];
  if (!moved) return next;

  // Paths are index-based. Resolve the target parent before removing the source,
  // then find that same object again after indexes have shifted.
  const targetParent = toParentPath.length ? nodeAt(next, toParentPath) : null;
  if (toParentPath.length && !targetParent) return tree;
  const targetSiblingsBeforeMove = targetParent ? (targetParent.children ??= []) : next;
  if (toIndex > targetSiblingsBeforeMove.length) return tree;

  sourceSiblings.splice(sourceIndex, 1);
  const targetSiblings = targetParent ? (targetParent.children ??= []) : next;
  const sameParent = sourceSiblings === targetSiblings;
  const adjustedIndex = sameParent && sourceIndex < toIndex ? toIndex - 1 : toIndex;
  targetSiblings.splice(Math.min(adjustedIndex, targetSiblings.length), 0, moved);
  return next;
}

/** 移除空分类（编辑后清理） */
export function pruneEmpty(tree: CategoryNode[]): CategoryNode[] {
  const next = cloneTree(tree);
  const prune = (nodes: CategoryNode[]): CategoryNode[] =>
    nodes.filter((node) => {
      if (node.children) node.children = prune(node.children);
      return (node.bookmarkIds?.length ?? 0) > 0 || (node.children?.length ?? 0) > 0;
    });
  return prune(next);
}
