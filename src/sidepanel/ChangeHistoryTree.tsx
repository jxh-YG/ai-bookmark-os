import { Bookmark, ChevronRight, Folder } from 'lucide-react';
import type { BookmarkTreeChange } from '../types';
import {
  buildChangeHistoryTree,
  changeItemTitle,
  changeKindLabel,
  changeOriginLabel,
  type ChangeHistoryTreeNode,
} from './changeHistory';

function ChangeItems({ changes }: { changes: BookmarkTreeChange[] }) {
  return changes.map((change) => (
    <div className="change-history-tree__item" key={`${change.kind}-${change.id}`}>
      <Bookmark size={14} strokeWidth={2} aria-hidden="true" />
      <span className={`change-history-tree__kind change-history-tree__kind--${change.kind}`}>
        {changeKindLabel(change.kind)}
      </span>
      <span className="change-history-tree__title" title={changeItemTitle(change)}>{changeItemTitle(change)}</span>
      <span className="change-history-tree__origin" title={changeOriginLabel(change)}>{changeOriginLabel(change)}</span>
    </div>
  ));
}

function ChangeHistoryBranch({ node, depth }: { node: ChangeHistoryTreeNode; depth: number }) {
  return (
    <details className="change-history-tree__branch" open={depth < 2}>
      <summary>
        <ChevronRight className="change-history-tree__chevron" size={15} strokeWidth={2} aria-hidden="true" />
        <Folder className="change-history-tree__folder" size={16} strokeWidth={2} aria-hidden="true" />
        <span className="change-history-tree__folder-name" title={node.path}>{node.name}</span>
        <span className="change-history-tree__count">{node.count}</span>
      </summary>
      <div className="change-history-tree__children">
        <ChangeItems changes={node.changes} />
        {node.children.map((child) => <ChangeHistoryBranch key={child.path} node={child} depth={depth + 1} />)}
      </div>
    </details>
  );
}

export function ChangeHistoryTree({ changes }: { changes: BookmarkTreeChange[] }) {
  const tree = buildChangeHistoryTree(changes);
  return (
    <div className="change-history-tree" aria-label="书签变更目录树">
      <ChangeItems changes={tree.changes} />
      {tree.children.map((node) => <ChangeHistoryBranch key={node.path} node={node} depth={0} />)}
    </div>
  );
}
