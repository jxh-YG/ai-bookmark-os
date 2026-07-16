import { useRef, useState } from 'react';
import type { FlatBookmark, HealthIssue, HealthProgress } from '../types';
import {
  findDeadLinks,
  findDuplicates,
  hasAllUrlsPermission,
  recheckUrl,
  removeBookmarks,
  requestAllUrlsPermission,
  undoRemoveBookmarks,
} from '../core/health';
import type { Dict } from '../core/i18n';

interface HealthPanelProps {
  d: Dict;
  bookmarks: FlatBookmark[];
  onBack: () => void;
  onBookmarksChanged: () => void;
}

export function HealthPanel({ d, bookmarks, onBack, onBookmarksChanged }: HealthPanelProps) {
  const [dups, setDups] = useState<HealthIssue[] | null>(null);
  const [dead, setDead] = useState<HealthIssue[] | null>(null);
  const [progress, setProgress] = useState<HealthProgress>({ phase: 'idle', done: 0, total: 0 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [rechecking, setRechecking] = useState<Set<string>>(new Set());
  const [canUndo, setCanUndo] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const checking = progress.phase === 'checking';

  const runDup = () => {
    setMsg('');
    setDups(findDuplicates(bookmarks));
  };

  const runDead = async () => {
    setMsg('');
    const ok = (await hasAllUrlsPermission()) || (await requestAllUrlsPermission());
    if (!ok) {
      setMsg(d.healthPermDenied);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      setDead(await findDeadLinks(bookmarks, setProgress, ctrl.signal));
    } catch {
      setProgress({ phase: 'idle', done: 0, total: 0 });
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /** 重检单条（登录后复查）：变为 ok 则从列表移除，否则更新原因 */
  const recheckOne = async (issue: HealthIssue) => {
    const id = issue.bookmark.id;
    setRechecking((prev) => new Set(prev).add(id));
    try {
      const r = await recheckUrl(issue.bookmark.url);
      setDead((prev) => {
        if (!prev) return prev;
        if (r.kind === 'ok') {
          return prev.filter((i) => i.bookmark.id !== id);
        }
        const kind = r.kind; // 'dead' | 'suspect'
        return prev.map((i) =>
          i.bookmark.id === id ? { ...i, kind, detail: r.detail } : i,
        );
      });
      if (r.kind === 'ok') {
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        setMsg(d.recheckOk(issue.bookmark.title));
      }
    } finally {
      setRechecking((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const issues = [...(dups ?? []), ...(dead ?? [])];

  const hardDead = dead?.filter((i) => i.kind === 'dead') ?? [];
  const suspects = dead?.filter((i) => i.kind === 'suspect') ?? [];

  const selectAll = () => setSelected(new Set(issues.map((i) => i.bookmark.id)));
  /** 只选高置信项：重复 + 确定死链，不含疑似 */
  const selectSafe = () =>
    setSelected(new Set([...(dups ?? []), ...hardDead].map((i) => i.bookmark.id)));

  const deleteSelected = async () => {
    const n = await removeBookmarks([...selected]);
    setMsg(d.deletedOk(n));
    setCanUndo(n > 0);
    setDups((prev) => prev?.filter((i) => !selected.has(i.bookmark.id)) ?? null);
    setDead((prev) => prev?.filter((i) => !selected.has(i.bookmark.id)) ?? null);
    setSelected(new Set());
    onBookmarksChanged();
  };

  const handleUndoDelete = async () => {
    const n = await undoRemoveBookmarks();
    if (n > 0) {
      setMsg(d.undoDeleteOk(n));
      setCanUndo(false);
      onBookmarksChanged();
    } else {
      setMsg(d.undoDeleteFail);
      setCanUndo(false);
    }
  };

  const reasonText = (i: HealthIssue): string => {
    if (i.kind === 'duplicate') return '♻️';
    switch (i.detail) {
      case 'login-wall': return d.reasonLoginWall;
      case 'redirect-home': return d.reasonRedirectHome;
      case 'soft-404': return d.reasonSoft404;
      case 'empty-page': return d.reasonEmptyPage;
      case 'timeout': return d.reasonTimeout;
      case 'unreachable': return d.reasonUnreachable;
      default: return i.detail; // HTTP 状态码
    }
  };

  const renderSection = (title: string, items: HealthIssue[], suspect?: boolean) => (
    <div className="health-section">
      <div className="health-section-title">{title}</div>
      {suspect && <div className="health-section-hint">{d.suspectHint}</div>}
      {items.map((i) => (
        <label key={i.bookmark.id} className="health-row">
          <input
            type="checkbox"
            checked={selected.has(i.bookmark.id)}
            onChange={() => toggle(i.bookmark.id)}
          />
          <span className="bm-title" title={i.bookmark.url}>
            {i.bookmark.title}
          </span>
          <span className={`health-detail ${suspect ? 'suspect' : ''}`}>{reasonText(i)}</span>
          {suspect && (
            <>
              <button
                className="icon-btn"
                title={d.recheckTip}
                disabled={rechecking.has(i.bookmark.id)}
                onClick={(e) => {
                  e.preventDefault();
                  recheckOne(i);
                }}
              >
                {rechecking.has(i.bookmark.id) ? '⏳' : '🔄'}
              </button>
              <button
                className="icon-btn"
                title={i.bookmark.url}
                onClick={(e) => {
                  e.preventDefault();
                  chrome.tabs.create({ url: i.bookmark.url });
                }}
              >
                ↗
              </button>
            </>
          )}
        </label>
      ))}
    </div>
  );

  return (
    <div className="health-panel">
      <div className="toolbar">
        <button onClick={onBack}>{d.backToTree}</button>
        <button onClick={runDup} disabled={checking}>{d.healthCheckDup}</button>
        <button onClick={runDead} disabled={checking}>{d.healthCheckDead}</button>
        {checking && (
          <button className="danger" onClick={() => abortRef.current?.abort()}>{d.cancel}</button>
        )}
      </div>
      <p className="hint">{d.healthDesc}</p>
      <p className="hint">{d.healthPermNote}</p>
      {msg && <div className="status-bar">{msg}</div>}

      <div className={`tree ${checking ? 'running' : ''}`}>
        {checking ? (
          <div className="classify-hero">
            <div className="ch-phase">{d.healthCheckDead}</div>
            <div className="ch-percent">
              {progress.total > 0
                ? `${Math.round((progress.done / progress.total) * 100)}%`
                : '…'}
            </div>
            <div className="ch-track">
              <div
                className="ch-fill"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 8}%` }}
              />
            </div>
            {progress.total > 0 && (
              <div className="ch-count">{progress.done} / {progress.total}</div>
            )}
          </div>
        ) : (
          <>
            {dups !== null && dups.length === 0 && dead === null && (
              <div className="empty">{d.healthNoIssues}</div>
            )}
            {dups !== null && dups.length > 0 && renderSection(d.healthDupSection(dups.length), dups)}
            {dead !== null &&
              (dead.length > 0 ? (
                <>
                  {hardDead.length > 0 && renderSection(d.healthDeadSection(hardDead.length), hardDead)}
                  {suspects.length > 0 &&
                    renderSection(d.healthSuspectSection(suspects.length), suspects, true)}
                </>
              ) : (
                <div className="empty">{d.healthNoIssues}</div>
              ))}
          </>
        )}
      </div>

      {issues.length > 0 && (
        <div className="toolbar">
          <button onClick={selectSafe}>{d.selectSafe}</button>
          <button onClick={selectAll}>{d.selectAll}</button>
          <button className="danger" disabled={selected.size === 0} onClick={deleteSelected}>
            {d.deleteSelected(selected.size)}
          </button>
          {canUndo && (
            <button onClick={handleUndoDelete}>{d.undoDelete}</button>
          )}
        </div>
      )}
    </div>
  );
}
