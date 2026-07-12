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
  onMoveBookmark: (bookmarkId: string, toPath: number[]) => void;
  deleteConfirmText: (name: string) => string;
}

interface TreeProps {
  nodes: CategoryNode[];
  bookmarkById: Map<string, FlatBookmark>;
  labels: Record<string, BookmarkLabel>;
  /** 提供则启用编辑模式（重命名/删除/拖拽） */
  edit?: TreeEditHandlers;
}

export function Tree({ nodes, bookmarkById, labels, edit }: TreeProps) {
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
  const [dragOver, setDragOver] = useState(false);

  const commitRename = () => {
    setRenaming(false);
    if (nameDraft.trim() && nameDraft.trim() !== node.name) {
      edit?.onRename(path, nameDraft);
    } else {
      setNameDraft(node.name);
    }
  };

  return (
    <div className="folder-block">
      <div
        className={`folder-row ${dragOver ? 'drag-over' : ''}`}
        onClick={() => !renaming && setOpen(!open)}
        onDragOver={(e) => {
          if (!edit) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!edit) return;
          e.preventDefault();
          setDragOver(false);
          const id = e.dataTransfer.getData('text/bookmark-id');
          if (id) edit.onMoveBookmark(id, path);
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
              <div
                key={id}
                className="bookmark-row"
                title={`${b.url}\n${labels[id]?.summary ?? ''}`}
                draggable={!!edit}
                onDragStart={(e) => e.dataTransfer.setData('text/bookmark-id', id)}
                onClick={() => chrome.tabs.create({ url: b.url })}
              >
                <img src={faviconUrl(b.url)} alt="" />
                <span className="bm-title">{b.title}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
