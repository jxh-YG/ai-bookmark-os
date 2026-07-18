import type { BookmarkTreeChange, BookmarkTreeChangeKind } from '../types';

export type ChangeHistoryTreeNode = {
  name: string;
  path: string;
  changes: BookmarkTreeChange[];
  children: ChangeHistoryTreeNode[];
  count: number;
};

type MutableChangeHistoryTreeNode = Omit<ChangeHistoryTreeNode, 'children' | 'count'> & {
  children: Map<string, MutableChangeHistoryTreeNode>;
};

function splitPath(path: string | undefined): string[] {
  return (path ?? '').split(' / ').map((part) => part.trim()).filter(Boolean);
}

function parentPath(path: string | undefined): string {
  const parts = splitPath(path);
  return parts.slice(0, -1).slice(-2).join(' / ');
}

function changeFolderPath(change: BookmarkTreeChange): string[] {
  const parts = splitPath(change.afterPath ?? change.beforePath);
  return change.nodeKind === 'bookmark' ? parts.slice(0, -1) : parts;
}

function finalizeNode(node: MutableChangeHistoryTreeNode): ChangeHistoryTreeNode {
  const children = [...node.children.values()]
    .map(finalizeNode)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-CN'));
  return {
    name: node.name,
    path: node.path,
    changes: node.changes,
    children,
    count: node.changes.length + children.reduce((total, child) => total + child.count, 0),
  };
}

/** Groups individual bookmark changes by their destination folder for a compact tree view. */
export function buildChangeHistoryTree(changes: BookmarkTreeChange[]): ChangeHistoryTreeNode {
  const root: MutableChangeHistoryTreeNode = {
    name: '',
    path: '',
    changes: [],
    children: new Map(),
  };

  for (const change of changes) {
    const parts = changeFolderPath(change);
    let node = root;
    for (const part of parts) {
      const path = node.path ? `${node.path} / ${part}` : part;
      let child = node.children.get(part);
      if (!child) {
        child = { name: part, path, changes: [], children: new Map() };
        node.children.set(part, child);
      }
      node = child;
    }
    node.changes.push(change);
  }

  return finalizeNode(root);
}

export function changeKindLabel(kind: BookmarkTreeChangeKind): string {
  const labels: Record<BookmarkTreeChangeKind, string> = {
    added: '新增',
    removed: '移除',
    moved: '移动',
    renamed: '改名',
    reordered: '排序',
    urlChanged: '网址',
  };
  return labels[kind];
}

export function changeItemTitle(change: BookmarkTreeChange): string {
  const node = change.after ?? change.before;
  return node?.title || node?.url || '未命名书签';
}

export function changeOriginLabel(change: BookmarkTreeChange): string {
  if (change.kind === 'moved') {
    const origin = parentPath(change.beforePath);
    return origin ? `来自 ${origin}` : '来自原位置';
  }
  if (change.kind === 'removed') return '已从书签树移除';
  if (change.kind === 'added') return '新建目录或书签';
  if (change.kind === 'renamed') return `${change.before?.title || '未命名'} -> ${change.after?.title || '未命名'}`;
  if (change.kind === 'urlChanged') return '网址已更新';
  return '顺序已调整';
}
