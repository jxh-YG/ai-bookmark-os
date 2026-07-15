import { useMemo, useState } from 'react';
import type { BookmarkSnapshotNode, BookmarkTreeSnapshot } from '../types';

interface LiveBookmarkTreeProps {
  snapshot: BookmarkTreeSnapshot;
  selectedFolderId: string;
  onSelectFolder: (folder: BookmarkSnapshotNode) => void;
}

function faviconUrl(pageUrl: string): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', '16');
  return url.toString();
}

function childIndex(snapshot: BookmarkTreeSnapshot): Map<string, BookmarkSnapshotNode[]> {
  const children = new Map<string, BookmarkSnapshotNode[]>();
  for (const node of Object.values(snapshot.nodes)) {
    if (!node.parentId) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((left, right) => left.index - right.index);
  return children;
}

/** Build descendant bookmark counts once per snapshot instead of once per rendered folder. */
export function buildBookmarkCountByFolder(snapshot: BookmarkTreeSnapshot): Map<string, number> {
  const children = childIndex(snapshot);
  const counts = new Map<string, number>();
  const visit = (folderId: string): number => {
    const existing = counts.get(folderId);
    if (existing !== undefined) return existing;
    let count = 0;
    for (const child of children.get(folderId) ?? []) {
      count += child.kind === 'bookmark' ? 1 : visit(child.id);
    }
    counts.set(folderId, count);
    return count;
  };
  visit(snapshot.rootId);
  return counts;
}

export function LiveBookmarkTree({ snapshot, selectedFolderId, onSelectFolder }: LiveBookmarkTreeProps) {
  const children = useMemo(() => childIndex(snapshot), [snapshot]);
  const bookmarkCounts = useMemo(() => buildBookmarkCountByFolder(snapshot), [snapshot]);
  const folderIds = useMemo(() => Object.values(snapshot.nodes)
    .filter((node) => node.kind === 'folder' && node.id !== snapshot.rootId)
    .map((node) => node.id), [snapshot]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());
  const roots = children.get(snapshot.rootId) ?? [];
  const hasCollapsedFolder = folderIds.some((id) => !expandedFolderIds.has(id));
  const hasExpandedFolder = folderIds.some((id) => expandedFolderIds.has(id));

  const toggleFolder = (folderId: string) => {
    setExpandedFolderIds((previous) => {
      const next = new Set(previous);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  return (
    <div className="live-tree">
      <div className="live-tree-toolbar" role="group" aria-label="书签树展开控制">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!hasCollapsedFolder}
          onClick={() => setExpandedFolderIds(new Set(folderIds))}
        >
          全部展开
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!hasExpandedFolder}
          onClick={() => setExpandedFolderIds(new Set())}
        >
          全部收起
        </button>
      </div>
      <div className="live-tree-list" aria-label="当前书签树">
        {roots.map((node) => (
          <LiveTreeNode
            key={node.id}
            node={node}
            children={children}
            bookmarkCounts={bookmarkCounts}
            expandedFolderIds={expandedFolderIds}
            selectedFolderId={selectedFolderId}
            onSelectFolder={onSelectFolder}
            onToggleFolder={toggleFolder}
          />
        ))}
      </div>
    </div>
  );
}

function LiveTreeNode({
  node,
  children,
  bookmarkCounts,
  expandedFolderIds,
  selectedFolderId,
  onSelectFolder,
  onToggleFolder,
}: {
  node: BookmarkSnapshotNode;
  children: Map<string, BookmarkSnapshotNode[]>;
  bookmarkCounts: Map<string, number>;
  expandedFolderIds: ReadonlySet<string>;
  selectedFolderId: string;
  onSelectFolder: (folder: BookmarkSnapshotNode) => void;
  onToggleFolder: (folderId: string) => void;
}) {
  if (node.kind === 'bookmark') {
    return (
      <div className="live-bookmark-row" title={node.url ?? ''}>
        {node.url && <img src={faviconUrl(node.url)} alt="" />}
        <span>{node.title || node.url}</span>
      </div>
    );
  }

  const descendants = children.get(node.id) ?? [];
  const count = bookmarkCounts.get(node.id) ?? 0;
  const open = expandedFolderIds.has(node.id);
  const selected = selectedFolderId === node.id;
  return (
    <div className="live-folder-block">
      <div className="live-folder-header">
        <button
          type="button"
          className="live-folder-toggle"
          onClick={() => onToggleFolder(node.id)}
          aria-label={open ? '收起目录' : '展开目录'}
          aria-expanded={open}
        >
          <span className={`chevron ${open ? 'open' : ''}`} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </span>
        </button>
        <button
          type="button"
          className={`live-folder-row ${selected ? 'is-selected' : ''}`}
          onClick={() => onSelectFolder(node)}
          aria-pressed={selected}
        >
          <span className="folder-icon" aria-hidden="true">📁</span>
          <span className="name">{node.title || '未命名目录'}</span>
          <span className="count">{count}</span>
        </button>
      </div>
      {open && descendants.length > 0 && (
        <div className="folder-children">
          {descendants.map((child) => (
            <LiveTreeNode
              key={child.id}
              node={child}
              children={children}
              bookmarkCounts={bookmarkCounts}
              expandedFolderIds={expandedFolderIds}
              selectedFolderId={selectedFolderId}
              onSelectFolder={onSelectFolder}
              onToggleFolder={onToggleFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
