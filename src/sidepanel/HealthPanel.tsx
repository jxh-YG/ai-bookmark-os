import { useRef, useState } from 'react';
import type { FlatBookmark, HealthIssue, HealthProgress } from '../types';
import {
  findDeadLinks,
  findDuplicates,
  hasAllUrlsPermission,
  recheckUrlWithSession,
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
  const runningRef = useRef(false);
  const mutatingRef = useRef(false);
  const [mutating, setMutating] = useState(false);

  const checking = progress.phase === 'checking';

  const runDup = () => {
    setMsg('');
    setDups(findDuplicates(bookmarks));
  };

  const runDead = async () => {
    // runningRef 是同步守卫：checking 由 progress.phase 派生，置位滞后于本函数的首个 await，
    // 仅靠按钮 disabled 无法拦住连点，故在此同步兜底，避免启动两轮扫描并互相覆盖 abortRef。
    if (runningRef.current) return;
    runningRef.current = true;
    setMsg('');
    try {
      const ok = (await hasAllUrlsPermission()) || (await requestAllUrlsPermission());
      if (!ok) {
        setMsg(d.healthPermDenied);
        return;
      }
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setDead(await findDeadLinks(bookmarks, setProgress, ctrl.signal));
    } catch (err) {
      setProgress({ phase: 'idle', done: 0, total: 0 });
      // 用户主动取消（AbortError）无需提示；真实失败（网络/权限/运行时）必须给出反馈，
      // 否则界面会悄无声息地退回扫描前状态，让人误以为“没有失效链接”。
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setMsg(d.healthScanFailed);
      }
    } finally {
      runningRef.current = false;
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /** 使用当前登录会话重新探测：可访问则移除，否则更新结果与分组。 */
  const recheckOne = async (issue: HealthIssue) => {
    if (issue.kind !== 'link') return;
    const id = issue.bookmark.id;
    setRechecking((prev) => new Set(prev).add(id));
    try {
      const result = await recheckUrlWithSession(issue.bookmark.url);
      setDead((prev) => {
        if (!prev) return prev;
        if (result.state === 'reachable') {
          return prev.filter((i) => i.bookmark.id !== id);
        }
        return prev.map((i) =>
          i.bookmark.id === id && i.kind === 'link'
            ? { ...i, detail: result.reason, result }
            : i,
        );
      });
      if (result.state === 'reachable') {
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

  const hardDead = dead?.filter(
    (i) => i.kind === 'link' && i.result.state === 'confirmed_missing',
  ) ?? [];
  const pendingReview = dead?.filter(
    (i) => i.kind === 'link' && i.result.state !== 'confirmed_missing',
  ) ?? [];

  const selectAll = () => setSelected(new Set(issues.map((i) => i.bookmark.id)));
  /** 只选高置信项：重复 + 已确认不存在，不含任何待复核结果。 */
  const selectSafe = () =>
    setSelected(new Set([...(dups ?? []), ...hardDead].map((i) => i.bookmark.id)));

  const deleteSelected = async () => {
    if (mutatingRef.current) return;
    if (!window.confirm(`${d.deleteSelected(selected.size)}?`)) return;
    mutatingRef.current = true;
    setMutating(true);
    try {
      const result = await removeBookmarks([...selected]);
      const removedIds = new Set(result.items.filter((item) => item.status === 'succeeded').map((item) => item.id));
      setMsg(result.failed || result.conflicts
        ? `${d.deletedOk(result.succeeded)} (${result.succeeded}/${result.total})`
        : d.deletedOk(result.succeeded));
      setCanUndo(result.succeeded > 0);
      setDups((prev) => prev?.filter((i) => !removedIds.has(i.bookmark.id)) ?? null);
      setDead((prev) => prev?.filter((i) => !removedIds.has(i.bookmark.id)) ?? null);
      setSelected((prev) => new Set([...prev].filter((id) => !removedIds.has(id))));
      if (result.succeeded > 0) onBookmarksChanged();
    } finally {
      mutatingRef.current = false;
      setMutating(false);
    }
  };

  const handleUndoDelete = async () => {
    if (mutatingRef.current) return;
    mutatingRef.current = true;
    setMutating(true);
    try {
      const result = await undoRemoveBookmarks();
      if (result.succeeded > 0) {
        setMsg(result.failed || result.conflicts
          ? `${d.undoDeleteOk(result.succeeded)} (${result.succeeded}/${result.total})`
          : d.undoDeleteOk(result.succeeded));
        setCanUndo(result.failed + result.conflicts > 0);
        onBookmarksChanged();
      } else {
        setMsg(d.undoDeleteFail);
        setCanUndo(result.failed + result.conflicts > 0);
      }
    } finally {
      mutatingRef.current = false;
      setMutating(false);
    }
  };

  const reasonText = (i: HealthIssue): string => {
    if (i.kind === 'duplicate') return '♻️';
    const { reason, state, statusCode } = i.result;
    const normalized = reason.trim().toLowerCase().replace(/_/g, '-');
    let label: string;
    if (normalized.includes('login') || normalized.includes('auth-required')) {
      label = d.reasonLoginWall;
    } else if (normalized.includes('redirect-home') || normalized.includes('homepage')) {
      label = d.reasonRedirectHome;
    } else if (normalized.includes('soft-404') || normalized.includes('title-missing')) {
      label = d.reasonSoft404;
    } else if (normalized.includes('empty-page') || normalized.includes('content-empty')) {
      label = d.reasonEmptyPage;
    } else if (normalized.includes('timeout')) {
      label = d.reasonTimeout;
    } else if (normalized.includes('network') || normalized.includes('unreachable')) {
      label = d.reasonUnreachable;
    } else if (
      state === 'access_limited' ||
      normalized.includes('access-restricted') ||
      normalized.includes('challenge') ||
      normalized.includes('waf')
    ) {
      label = d.reasonAccessLimited;
    } else {
      switch (state) {
        case 'confirmed_missing': label = d.reasonConfirmedMissing; break;
        case 'content_suspect': label = d.reasonContentSuspect; break;
        case 'transient_failure': label = d.reasonTransientFailure; break;
        case 'unsupported': label = d.reasonUnsupported; break;
        default: label = reason;
      }
    }
    return statusCode == null ? label : `HTTP ${statusCode} · ${label}`;
  };

  const renderSection = (title: string, items: HealthIssue[], reviewable?: boolean) => (
    <div className="health-section">
      <div className="health-section-title">{title}</div>
      {reviewable && <div className="health-section-hint">{d.suspectHint}</div>}
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
          <span className={`health-detail ${reviewable ? 'suspect' : ''}`}>{reasonText(i)}</span>
          {reviewable && i.kind === 'link' && (
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
                  {pendingReview.length > 0 &&
                    renderSection(d.healthSuspectSection(pendingReview.length), pendingReview, true)}
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
          <button className="danger" disabled={selected.size === 0 || mutating} onClick={deleteSelected}>
            {d.deleteSelected(selected.size)}
          </button>
          {canUndo && (
            <button disabled={mutating} onClick={handleUndoDelete}>{d.undoDelete}</button>
          )}
        </div>
      )}
    </div>
  );
}
