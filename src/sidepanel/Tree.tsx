import { useState } from 'react';
import type { BookmarkLabel, CategoryNode, FlatBookmark } from '../types';
import { checkFolderDeletion, type FolderDeletionCheck } from '../core/treeEdit';

function faviconUrl(pageUrl: string): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', pageUrl);
  url.searchParams.set('size', '16');
  return url.toString();
}

function countBookmarks(node: CategoryNode, exists: Map<string, FlatBookmark>): number {
  let count = node.bookmarkIds?.filter((id) => exists.has(id)).length ?? 0;
  for (const child of node.children ?? []) count += countBookmarks(child, exists);
  return count;
}

function collectNodeBookmarkIds(node: CategoryNode): string[] {
  const ids = [...(node.bookmarkIds ?? [])];
  for (const child of node.children ?? []) ids.push(...collectNodeBookmarkIds(child));
  return ids;
}

interface FolderOption {
  path: number[];
  label: string;
}

function getFolderOptions(nodes: CategoryNode[], parentPath: number[] = [], parentLabel = ''): FolderOption[] {
  return nodes.flatMap((node, index) => {
    const path = [...parentPath, index];
    const label = parentLabel ? `${parentLabel} / ${node.name}` : node.name;
    return [
      { path, label },
      ...getFolderOptions(node.children ?? [], path, label),
    ];
  });
}

export interface TreeEditHandlers {
  onRename: (path: number[], newName: string) => void;
  /** 仅在 Tree 已确认目录为空时调用。 */
  onDelete: (path: number[]) => void;
  onMoveBookmark: (bookmarkId: string, toPath: number[], toIndex?: number) => void;
  /** 批量移动由上层一次性持久化，避免逐条更新时覆盖方案状态。 */
  onMoveBookmarks?: (bookmarkIds: string[], toPath: number[], toIndex?: number) => void;
  /** 仅从 AI 分类方案移除，真实 Chrome 书签由上层保留在原位置。 */
  onRemoveBookmarksFromPlan?: (bookmarkIds: string[]) => void;
  onCreateCategory?: (name: string, bookmarkIds: string[]) => void;
  onMoveFolder: (fromPath: number[], toParentPath: number[], toIndex: number) => void;
  deleteConfirmText: (name: string) => string;
  deleteEmptyConfirmText?: (name: string) => string;
  deleteBlockedText?: (name: string, bookmarkCount: number) => string;
  renameLabel?: string;
  deleteLabel?: string;
  moveToRootLabel?: string;
  selectedCountText?: (count: number) => string;
  batchTargetPlaceholder?: string;
  moveSelectedLabel?: string;
  newCategoryPlaceholder?: string;
  createCategoryLabel?: string;
  removeSelectedLabel?: string;
  clearSelectionLabel?: string;
  moveBookmarksNeededLabel?: string;
}

const FOLDER_DRAG_TYPE = 'application/x-ai-bookmark-folder-path';
const BOOKMARK_DRAG_TYPE = 'text/bookmark-id';
const BOOKMARK_IDS_DRAG_TYPE = 'application/x-ai-bookmark-ids';
type FolderDropIntent = 'before' | 'inside' | 'after';

function isSameOrDescendantPath(fromPath: number[], targetPath: number[]): boolean {
  return targetPath.length >= fromPath.length && fromPath.every((part, index) => targetPath[index] === part);
}

function readBookmarkIds(event: React.DragEvent<HTMLDivElement>): string[] {
  const rawIds = event.dataTransfer.getData(BOOKMARK_IDS_DRAG_TYPE);
  if (rawIds) {
    try {
      const ids = JSON.parse(rawIds);
      if (Array.isArray(ids) && ids.every((id) => typeof id === 'string')) {
        return [...new Set(ids)];
      }
    } catch {
      // Fall through to the legacy single-bookmark drag payload.
    }
  }

  const id = event.dataTransfer.getData(BOOKMARK_DRAG_TYPE);
  return id ? [id] : [];
}

interface TreeProps {
  nodes: CategoryNode[];
  bookmarkById: Map<string, FlatBookmark>;
  labels: Record<string, BookmarkLabel>;
  /** 提供则启用编辑模式（重命名、删除、拖拽）。 */
  edit?: TreeEditHandlers;
}

export function Tree({ nodes, bookmarkById, labels, edit }: TreeProps) {
  const [rootDragOver, setRootDragOver] = useState(false);
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(() => new Set());
  const [batchTargetPath, setBatchTargetPath] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const folderOptions = getFolderOptions(nodes);
  const selectedIds = [...selectedBookmarkIds];
  const selectionEnabled = Boolean(edit?.onMoveBookmarks || edit?.onRemoveBookmarksFromPlan || edit?.onCreateCategory);

  const toggleBookmarkSelection = (bookmarkId: string) => {
    setSelectedBookmarkIds((previous) => {
      const next = new Set(previous);
      if (next.has(bookmarkId)) next.delete(bookmarkId);
      else next.add(bookmarkId);
      return next;
    });
    setBatchTargetPath('');
  };

  const moveBookmarks = (bookmarkIds: string[], toPath: number[], toIndex?: number) => {
    if (!bookmarkIds.length || !edit) return;
    if (bookmarkIds.length > 1 && edit.onMoveBookmarks) {
      edit.onMoveBookmarks(bookmarkIds, toPath, toIndex);
    } else {
      bookmarkIds.forEach((bookmarkId) => edit.onMoveBookmark(bookmarkId, toPath, toIndex));
    }
    setSelectedBookmarkIds((previous) => {
      const next = new Set(previous);
      bookmarkIds.forEach((bookmarkId) => next.delete(bookmarkId));
      return next;
    });
  };

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

  const moveSelectedToBatchTarget = () => {
    if (!batchTargetPath || !selectedIds.length) return;
    try {
      const path = JSON.parse(batchTargetPath);
      if (Array.isArray(path) && path.every(Number.isInteger)) moveBookmarks(selectedIds, path);
    } catch {
      // A stale select value is ignored; the next render rebuilds paths from the current tree.
    }
  };

  return (
    <div className="tree-list">
      {edit && selectionEnabled && selectedIds.length > 0 && (
        <div className="tree-batch-actions" role="group" aria-label="Bookmark batch actions">
          <span>{edit.selectedCountText?.(selectedIds.length) ?? `已选择 ${selectedIds.length} 条书签`}</span>
          {edit.onMoveBookmarks && (
            <>
              <select
                value={batchTargetPath}
                aria-label={edit.batchTargetPlaceholder ?? '选择目标分类'}
                onChange={(event) => setBatchTargetPath(event.target.value)}
              >
                <option value="">{edit.batchTargetPlaceholder ?? '选择目标分类'}</option>
                {folderOptions.map((option) => (
                  <option key={JSON.stringify(option.path)} value={JSON.stringify(option.path)}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!batchTargetPath}
                onClick={moveSelectedToBatchTarget}
              >
                {edit.moveSelectedLabel ?? '移动所选书签'}
              </button>
            </>
          )}
          {edit.onCreateCategory && (
            <>
              <input
                value={newCategoryName}
                aria-label={edit.newCategoryPlaceholder ?? '新分类名称'}
                placeholder={edit.newCategoryPlaceholder ?? '新分类名称'}
                onChange={(event) => setNewCategoryName(event.target.value)}
              />
              <button
                type="button"
                disabled={!newCategoryName.trim()}
                onClick={() => {
                  const name = newCategoryName.trim();
                  if (!name) return;
                  edit.onCreateCategory?.(name, selectedIds);
                  setNewCategoryName('');
                  setSelectedBookmarkIds(new Set());
                  setBatchTargetPath('');
                }}
              >
                {edit.createCategoryLabel ?? '新建分类并移动'}
              </button>
            </>
          )}
          {edit.onRemoveBookmarksFromPlan && (
            <button
              type="button"
              onClick={() => {
                edit.onRemoveBookmarksFromPlan?.(selectedIds);
                setSelectedBookmarkIds(new Set());
              }}
            >
              {edit.removeSelectedLabel ?? '从方案移除'}
            </button>
          )}
          <button type="button" onClick={() => setSelectedBookmarkIds(new Set())}>
            {edit.clearSelectionLabel ?? '取消选择'}
          </button>
        </div>
      )}
      {nodes.map((node, index) => (
        <Folder
          key={`${node.name}-${index}`}
          tree={nodes}
          node={node}
          path={[index]}
          bookmarkById={bookmarkById}
          labels={labels}
          edit={edit}
          selectionEnabled={selectionEnabled}
          selectedBookmarkIds={selectedBookmarkIds}
          onToggleBookmarkSelection={toggleBookmarkSelection}
          onMoveBookmarks={moveBookmarks}
          onSelectBookmarks={(bookmarkIds) => setSelectedBookmarkIds(new Set(bookmarkIds))}
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
          {edit.moveToRootLabel || 'Move folder to top level'}
        </div>
      )}
    </div>
  );
}

function Folder({
  tree,
  node,
  path,
  bookmarkById,
  labels,
  edit,
  selectionEnabled,
  selectedBookmarkIds,
  onToggleBookmarkSelection,
  onMoveBookmarks,
  onSelectBookmarks,
}: {
  tree: CategoryNode[];
  node: CategoryNode;
  path: number[];
  bookmarkById: Map<string, FlatBookmark>;
  labels: Record<string, BookmarkLabel>;
  edit?: TreeEditHandlers;
  selectionEnabled: boolean;
  selectedBookmarkIds: ReadonlySet<string>;
  onToggleBookmarkSelection: (bookmarkId: string) => void;
  onMoveBookmarks: (bookmarkIds: string[], toPath: number[], toIndex?: number) => void;
  onSelectBookmarks: (bookmarkIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(node.name);
  const [folderDropIntent, setFolderDropIntent] = useState<FolderDropIntent | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<FolderDeletionCheck | null>(null);

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

  const requestDelete = () => {
    if (!edit) return;
    const check = checkFolderDeletion(tree, path);
    if (!check.canDelete) {
      setDeleteWarning(check);
      return;
    }
    const confirmText = edit.deleteEmptyConfirmText?.(node.name) ?? edit.deleteConfirmText(node.name);
    if (confirm(confirmText)) edit.onDelete(path);
  };

  return (
    <div className="folder-block">
      <div
        className={`folder-row ${folderDropIntent ? `drag-${folderDropIntent}` : ''}`}
        draggable={!!edit && !renaming}
        onClick={() => !renaming && setOpen(!open)}
        onDragStart={(event) => {
          if (!edit || renaming) return;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(FOLDER_DRAG_TYPE, JSON.stringify(path));
        }}
        onDragEnd={() => setFolderDropIntent(null)}
        onDragOver={(event) => {
          if (!edit) return;
          const folderDrag = event.dataTransfer.types.includes(FOLDER_DRAG_TYPE);
          const bookmarkDrag = event.dataTransfer.types.includes(BOOKMARK_DRAG_TYPE);
          if (!folderDrag && !bookmarkDrag) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setFolderDropIntent(folderDrag ? getDropIntent(event) : 'inside');
        }}
        onDragLeave={() => setFolderDropIntent(null)}
        onDrop={(event) => {
          if (!edit) return;
          event.preventDefault();
          const intent = getDropIntent(event);
          setFolderDropIntent(null);
          const bookmarkIds = readBookmarkIds(event);
          if (bookmarkIds.length) {
            onMoveBookmarks(bookmarkIds, path, node.bookmarkIds?.length ?? 0);
            return;
          }
          const fromPath = readFolderPath(event);
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
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename();
              if (event.key === 'Escape') {
                setNameDraft(node.name);
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span
            className="name"
            onDoubleClick={(event) => {
              if (!edit) return;
              event.stopPropagation();
              setNameDraft(node.name);
              setRenaming(true);
            }}
          >
            {node.name}
          </span>
        )}
        <span className="count">{countBookmarks(node, bookmarkById)}</span>
        {edit && !renaming && (
          <span className="folder-actions" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="icon-btn"
              title={edit.renameLabel || 'Rename'}
              aria-label={edit.renameLabel || 'Rename'}
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
              title={edit.deleteLabel || 'Delete'}
              aria-label={edit.deleteLabel || 'Delete'}
              onClick={requestDelete}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </span>
        )}
      </div>
      {deleteWarning && (
        <div className="folder-delete-warning" role="alert">
          <span>
            {edit?.deleteBlockedText?.(deleteWarning.folderName, deleteWarning.bookmarkCount)
              ?? `「${deleteWarning.folderName}」及其子目录包含 ${deleteWarning.bookmarkCount} 条书签。请先将书签移动到其他书签夹后再删除该目录。`}
          </span>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              if (selectionEnabled) onSelectBookmarks(collectNodeBookmarkIds(node));
              setDeleteWarning(null);
            }}
          >
            {edit?.moveBookmarksNeededLabel ?? '去移动书签'}
          </button>
        </div>
      )}
      {open && (
        <div className="folder-children">
          {node.children?.map((child, index) => (
            <Folder
              key={`${child.name}-${index}`}
              tree={tree}
              node={child}
              path={[...path, index]}
              bookmarkById={bookmarkById}
              labels={labels}
              edit={edit}
              selectionEnabled={selectionEnabled}
              selectedBookmarkIds={selectedBookmarkIds}
              onToggleBookmarkSelection={onToggleBookmarkSelection}
              onMoveBookmarks={onMoveBookmarks}
              onSelectBookmarks={onSelectBookmarks}
            />
          ))}
          {node.bookmarkIds?.map((id, index) => {
            const bookmark = bookmarkById.get(id);
            if (!bookmark) return null;
            return (
              <BookmarkItem
                key={id}
                bookmark={bookmark}
                summary={labels[id]?.summary}
                parentPath={path}
                index={index}
                edit={edit}
                selectionEnabled={selectionEnabled}
                selected={selectedBookmarkIds.has(id)}
                selectedBookmarkIds={selectedBookmarkIds}
                onToggleSelection={onToggleBookmarkSelection}
                onMoveBookmarks={onMoveBookmarks}
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
  selectionEnabled,
  selected,
  selectedBookmarkIds,
  onToggleSelection,
  onMoveBookmarks,
}: {
  bookmark: FlatBookmark;
  summary?: string;
  parentPath: number[];
  index: number;
  edit?: TreeEditHandlers;
  selectionEnabled: boolean;
  selected: boolean;
  selectedBookmarkIds: ReadonlySet<string>;
  onToggleSelection: (bookmarkId: string) => void;
  onMoveBookmarks: (bookmarkIds: string[], toPath: number[], toIndex?: number) => void;
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
        const draggedIds = selectionEnabled && selected ? [...selectedBookmarkIds] : [bookmark.id];
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(BOOKMARK_DRAG_TYPE, bookmark.id);
        event.dataTransfer.setData(BOOKMARK_IDS_DRAG_TYPE, JSON.stringify(draggedIds));
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
        const intent = getDropIntent(event);
        setDropIntent(null);
        const bookmarkIds = readBookmarkIds(event).filter((id) => id !== bookmark.id);
        if (bookmarkIds.length) onMoveBookmarks(bookmarkIds, parentPath, intent === 'before' ? index : index + 1);
      }}
      onClick={() => chrome.tabs.create({ url: bookmark.url })}
    >
      {selectionEnabled && (
        <input
          type="checkbox"
          checked={selected}
          aria-label={`选择书签：${bookmark.title}`}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onToggleSelection(bookmark.id)}
        />
      )}
      <img src={faviconUrl(bookmark.url)} alt="" />
      <span className="bm-title">{bookmark.title}</span>
    </div>
  );
}
