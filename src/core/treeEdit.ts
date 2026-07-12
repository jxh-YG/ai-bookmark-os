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
): CategoryNode[] {
  const next = cloneTree(tree);
  // 从原位置移除
  const removeFrom = (nodes: CategoryNode[]): boolean => {
    for (const n of nodes) {
      const i = n.bookmarkIds?.indexOf(bookmarkId) ?? -1;
      if (i >= 0) {
        n.bookmarkIds!.splice(i, 1);
        return true;
      }
      if (n.children && removeFrom(n.children)) return true;
    }
    return false;
  };
  removeFrom(next);
  const target = nodeAt(next, toPath);
  if (target) (target.bookmarkIds ??= []).push(bookmarkId);
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
