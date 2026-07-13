import { useState } from 'react';
import type { BookmarkLabel, CategoryNode, FlatBookmark } from '../types';

function faviconUrl(pageUrl: string): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', '16');
  return url.toString();
}

function countBookmarks(node: CategoryNode, exists: Map<string, FlatBookmark>): number {
  let n = node.bookmarkIds?.filter((id) => exists.has(id)).length ?? 0;
  for (const c of node.children ?? []) n += countBookmarks(c, exists);
  return n;
}

export interface TreeEditHandlers {
  onRename: (path: number[], newName: string) => void;
  onDelete: (path: number[]) => void;
  onMoveBookmark: (bookmarkId: string, toPath: number[], toIndex?: number) => void;
  onMoveFolder: (fromPath: number[], toParentPath: number[], toIndex: number) => void;
  deleteConfirmText: (name: string) => string;
}

const FOLDER_DRAG_TYPE = 'application/x-ai-bookmark-folder-path';
const BOOKMARK_DRAG_TYPE = 'text/bookmark-id';
type FolderDropIntent = 'before' | 'inside' | 'after';

function isSameOrDescendantPath(fromPath: number[], targetPath: number[]): boolean {
  return targetPath.length >= fromPath.length && fromPath.every((part, index) => targetPath[index] === part);
}

interface TreeProps {
  nodes: CategoryNode[];
  bookmarkById: Map<string, FlatBookmark>;
  labels: Record<string, BookmarkLabel>;
  /** 提供则启用编辑模式（重命名/删除/拖拽） */
  edit?: TreeEditHandlers;
}

export function Tree({ nodes, bookmarkById, labels, edit }: TreeProps) {
  const [rootDragOver, setRootDragOver] = useState(false);

  const readFolderPath = (event: React.DragEvent<HTMLDivElement>): number[] | null => {
    const rawPath = event.dataTransfer.getData(FOLDER_DRAG_TYPE);
    if (!rawPath) return null;
    try {
      const path = JSON.parse(rawPath);
      return Array.isArray(path) && path.every(Number.isInteger) ? path : null;
    } catch {
      return null;
    }
  };

  return (
    <div className="tree-list">
      {nodes.map((n, i) => (
        <Folder
          key={`${n.name}-${i}`}
          node={n}
          path={[i]}
          bookmarkById={bookmarkById}
          labels={labels}
          edit={edit}
        />
      ))}
      {edit && (
        <div
          className={`tree-root-dropzone ${rootDragOver ? 'drag-over' : ''}`}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(FOLDER_DRAG_TYPE)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setRootDragOver(true);
          }}
          onDragLeave={() => setRootDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setRootDragOver(false);
            const fromPath = readFolderPath(event);
            if (fromPath) edit.onMoveFolder(fromPath, [], nodes.length);
          }}
        >
          Move folder to top level
        </div>
      )}
    </div>
  );
}

function Folder({
  node,
  path,
  bookmarkById,
  labels,
  edit,
}: {
  node: CategoryNode;
  path: number[];
  bookmarkById: Map<string, FlatBookmark>;
  labels: Record<string, BookmarkLabel>;
  edit?: TreeEditHandlers;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(node.name);
  const [folderDropIntent, setFolderDropIntent] = useState<FolderDropIntent | null>(null);

  const commitRename = () => {
    setRenaming(false);
    if (nameDraft.trim() && nameDraft.trim() !== node.name) {
      edit?.onRename(path, nameDraft);
    } else {
      setNameDraft(node.name);
    }
  };

  const readFolderPath = (event: React.DragEvent<HTMLDivElement>): number[] | null => {
    const folderPath = event.dataTransfer.getData(FOLDER_DRAG_TYPE);
    if (!folderPath) return null;
    try {
      const parsedPath = JSON.parse(folderPath);
      return Array.isArray(parsedPath) && parsedPath.every(Number.isInteger) ? parsedPath : null;
    } catch {
      return null;
    }
  };

  const getDropIntent = (event: React.DragEvent<HTMLDivElement>): FolderDropIntent => {
    const { top, height } = event.currentTarget.getBoundingClientRect();
    const offset = event.clientY - top;
    if (offset < height * 0.25) return 'before';
    if (offset > height * 0.75) return 'after';
    return 'inside';
  };

  const folderDropDestination = (intent: FolderDropIntent) => {
    const siblingPath = path.slice(0, -1);
    const index = path[path.length - 1];
    if (intent === 'before') return { parentPath: siblingPath, index };
    if (intent === 'after') return { parentPath: siblingPath, index: index + 1 };
    return { parentPath: path, index: node.children?.length ?? 0 };
  };

  return (
    <div className="folder-block">
      <div
        className={`folder-row ${folderDropIntent ? `drag-${folderDropIntent}` : ''}`}
        draggable={!!edit && !renaming}
        onClick={() => !renaming && setOpen(!open)}
        onDragStart={(e) => {
          if (!edit || renaming) return;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData(FOLDER_DRAG_TYPE, JSON.stringify(path));
        }}
        onDragEnd={() => setFolderDropIntent(null)}
        onDragOver={(e) => {
          if (!edit) return;
          const folderDrag = e.dataTransfer.types.includes(FOLDER_DRAG_TYPE);
          const bookmarkDrag = e.dataTransfer.types.includes(BOOKMARK_DRAG_TYPE);
          if (!folderDrag && !bookmarkDrag) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setFolderDropIntent(folderDrag ? getDropIntent(e) : 'inside');
        }}
        onDragLeave={() => setFolderDropIntent(null)}
        onDrop={(e) => {
          if (!edit) return;
          e.preventDefault();
          const intent = getDropIntent(e);
          setFolderDropIntent(null);
          const id = e.dataTransfer.getData(BOOKMARK_DRAG_TYPE);
          if (id) {
            edit.onMoveBookmark(id, path, node.bookmarkIds?.length ?? 0);
            return;
          }
          const fromPath = readFolderPath(e);
          if (!fromPath || isSameOrDescendantPath(fromPath, path)) return;
          const destination = folderDropDestination(intent);
          if (intent === 'inside') setOpen(true);
          edit.onMoveFolder(fromPath, destination.parentPath, destination.index);
        }}
      >
        <span className={`chevron ${open ? 'open' : ''}`} aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        <span className="folder-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        {renaming ? (
          <input
            className="rename-input"
            value={nameDraft}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setNameDraft(node.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span
            className="name"
            onDoubleClick={(e) => {
              if (!edit) return;
              e.stopPropagation();
              setNameDraft(node.name);
              setRenaming(true);
            }}
          >
            {node.name}
          </span>
        )}
        <span className="count">{countBookmarks(node, bookmarkById)}</span>
        {edit && !renaming && (
          <span className="folder-actions" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="icon-btn"
              title="Rename"
              aria-label="Rename"
              onClick={() => {
                setNameDraft(node.name);
                setRenaming(true);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--subtle"
              title="Delete"
              aria-label="Delete"
              onClick={() => {
                if (confirm(edit.deleteConfirmText(node.name))) edit.onDelete(path);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </span>
        )}
      </div>
      {open && (
        <div className="folder-children">
          {node.children?.map((c, i) => (
            <Folder
              key={`${c.name}-${i}`}
              node={c}
              path={[...path, i]}
              bookmarkById={bookmarkById}
              labels={labels}
              edit={edit}
            />
          ))}
          {node.bookmarkIds?.map((id) => {
            const b = bookmarkById.get(id);
            if (!b) return null;
            return (
              <BookmarkItem
                key={id}
                bookmark={b}
                summary={labels[id]?.summary}
                parentPath={path}
                index={node.bookmarkIds?.indexOf(id) ?? 0}
                edit={edit}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function BookmarkItem({
  bookmark,
  summary,
  parentPath,
  index,
  edit,
}: {
  bookmark: FlatBookmark;
  summary?: string;
  parentPath: number[];
  index: number;
  edit?: TreeEditHandlers;
}) {
  const [dropIntent, setDropIntent] = useState<'before' | 'after' | null>(null);

  const getDropIntent = (event: React.DragEvent<HTMLDivElement>) => {
    const { top, height } = event.currentTarget.getBoundingClientRect();
    return event.clientY - top < height / 2 ? 'before' : 'after';
  };

  return (
    <div
      className={`bookmark-row ${dropIntent ? `drag-${dropIntent}` : ''}`}
      title={`${bookmark.url}\n${summary ?? ''}`}
      draggable={!!edit}
      onDragStart={(event) => {
        if (!edit) return;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(BOOKMARK_DRAG_TYPE, bookmark.id);
      }}
      onDragOver={(event) => {
        if (!edit || !event.dataTransfer.types.includes(BOOKMARK_DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        setDropIntent(getDropIntent(event));
      }}
      onDragLeave={() => setDropIntent(null)}
      onDrop={(event) => {
        if (!edit) return;
        event.preventDefault();
        event.stopPropagation();
        const id = event.dataTransfer.getData(BOOKMARK_DRAG_TYPE);
        const intent = getDropIntent(event);
        setDropIntent(null);
        if (id && id !== bookmark.id) edit.onMoveBookmark(id, parentPath, intent === 'before' ? index : index + 1);
      }}
      onClick={() => chrome.tabs.create({ url: bookmark.url })}
    >
      <img src={faviconUrl(bookmark.url)} alt="" />
      <span className="bm-title">{bookmark.title}</span>
    </div>
  );
}
