// 分类树编辑操作（纯函数，返回新树）
import type { CategoryNode } from '../types';

const FALLBACK = '其他';

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

/** 重命名节点 */
export function renameNode(tree: CategoryNode[], path: number[], newName: string): CategoryNode[] {
  const next = cloneTree(tree);
  const node = nodeAt(next, path);
  if (node && newName.trim()) node.name = newName.trim();
  return next;
}

/** 删除节点：其中的书签（含子层）移入顶层「其他」 */
export function deleteNode(tree: CategoryNode[], path: number[]): CategoryNode[] {
  const next = cloneTree(tree);
  const node = nodeAt(next, path);
  if (!node) return next;

  // 收集被删节点下全部书签
  const ids: string[] = [];
  const collect = (n: CategoryNode) => {
    ids.push(...(n.bookmarkIds ?? []));
    n.children?.forEach(collect);
  };
  collect(node);

  // 从父级移除
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];
  const siblings = parentPath.length ? (nodeAt(next, parentPath)?.children ?? []) : next;
  siblings.splice(idx, 1);

  // 书签归入顶层「其他」
  if (ids.length) {
    let fallback = next.find((n) => n.name === FALLBACK);
    if (!fallback) {
      fallback = { name: FALLBACK, bookmarkIds: [] };
      next.push(fallback);
    }
    (fallback.bookmarkIds ??= []).push(...ids);
  }
  return next;
}

/** 把一条书签从一个节点移到另一个节点 */
export function moveBookmark(
  tree: CategoryNode[],
  bookmarkId: string,
  toPath: number[],
  toIndex?: number,
): CategoryNode[] {
  const next = cloneTree(tree);
  let sourceIds: string[] | undefined;
  let sourceIndex = -1;
  let removed = false;
  // 从原位置移除
  const removeFrom = (nodes: CategoryNode[]): boolean => {
    for (const n of nodes) {
      const i = n.bookmarkIds?.indexOf(bookmarkId) ?? -1;
      if (i >= 0) {
        sourceIds = n.bookmarkIds;
        sourceIndex = i;
        n.bookmarkIds!.splice(i, 1);
        removed = true;
        return true;
      }
      if (n.children && removeFrom(n.children)) return true;
    }
    return false;
  };
  const target = nodeAt(next, toPath);
  if (!target) return tree;
  removeFrom(next);
  if (!removed) return tree;
  const targetIds = target.bookmarkIds ??= [];
  const requestedIndex = toIndex ?? targetIds.length;
  if (requestedIndex < 0 || requestedIndex > targetIds.length + (sourceIds === targetIds ? 1 : 0)) return tree;
  const adjustedIndex = sourceIds === targetIds && sourceIndex < requestedIndex
    ? requestedIndex - 1
    : requestedIndex;
  targetIds.splice(Math.min(adjustedIndex, targetIds.length), 0, bookmarkId);
  return next;
}

/** 鎶婁竴涓垎绫昏妭鐐硅繛鍚屽叾鎵€鏈夊瓙鍒嗙被鍜屼功绛剧Щ鍏ュ彟涓€涓垎绫昏妭鐐广€?*/
// Moves the folder as one unit, preserving its complete subtree.
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
    nodes.filter((n) => {
      if (n.children) n.children = prune(n.children);
      return (n.bookmarkIds?.length ?? 0) > 0 || (n.children?.length ?? 0) > 0;
    });
  return prune(next);
}
