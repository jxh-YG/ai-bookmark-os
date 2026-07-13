import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CategoryNode,
  ClassifyProgress,
  ClassifyResult,
  FlatBookmark,
} from '../types';
import {
  classify,
  classifyIncremental,
  estimateClassify,
  expandDuplicateBookmarks,
  loadSavedResult,
  type ClassifyEstimate,
} from '../core/classifier';
import {
  applyToBookmarks,
  backupBookmarks,
  backupToHtml,
  dedupeByUrl,
  getApplyRecord,
  getBackup,
  getFlatBookmarks,
  planApply,
  undoApply,
} from '../core/bookmarks';
import { deleteNode, moveBookmark, moveNode, renameNode } from '../core/treeEdit';
import { loadSettings } from '../core/settings';
import { DEFAULT_SETTINGS, fontCss, type Settings } from '../types';
import { applyColorMode, t } from '../core/i18n';
import { Tree, type TreeEditHandlers } from './Tree';
import { entriesSince, type ChangelogEntry } from '../core/changelog';
import { resolveLang } from '../core/i18n';

/** 应用外观设置到根元素 CSS 变量 + 颜色模式 */
function applyAppearance(s: Settings) {
  const root = document.documentElement;
  root.style.setProperty('--accent', s.themeColor);
  root.style.setProperty('--app-font', fontCss(s.fontFamily));
  root.style.setProperty('--app-font-size', `${s.fontSize}px`);
  applyColorMode(s.colorMode);
}


export function App() {
  const [bookmarks, setBookmarks] = useState<FlatBookmark[]>([]);
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [progress, setProgress] = useState<ClassifyProgress>({ phase: 'idle', done: 0, total: 0 });
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applying, setApplying] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [estimate, setEstimate] = useState<ClassifyEstimate | null>(null);
  const [whatsNew, setWhatsNew] = useState<{ to: string; entries: ChangelogEntry[] } | null>(null);
  const [uiSettings, setUiSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const abortRef = useRef<AbortController | null>(null);
  const d = t(uiSettings.language);

  useEffect(() => {
    getFlatBookmarks().then(setBookmarks);
    loadSavedResult().then(setResult);
    getBackup().then((b) => setHasBackup(!!b));
    getApplyRecord().then((r) => setCanUndo(!!r));
    chrome.storage.local
      .get('pendingNewBookmarks')
      .then((data) => setPendingIds(data.pendingNewBookmarks ?? []));
    // 自动更新后首次打开：展示「新版本内容」弹窗（跨多版本更新会累积展示）
    chrome.storage.local.get('pendingWhatsNew').then((data) => {
      const p = data.pendingWhatsNew as { from: string; to: string } | undefined;
      if (!p) return;
      const entries = entriesSince(p.from, p.to);
      if (entries.length > 0) setWhatsNew({ to: p.to, entries });
      else chrome.storage.local.remove('pendingWhatsNew');
    });
    // 外观 + 语言：初始应用 + 监听设置变更实时生效
    loadSettings().then((s) => {
      setUiSettings(s);
      applyAppearance(s);
    });
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.settings?.newValue) {
        const s = changes.settings.newValue as Settings;
        setUiSettings(s);
        applyAppearance(s);
      }
      if (area === 'local' && changes.pendingNewBookmarks) {
        setPendingIds(changes.pendingNewBookmarks.newValue ?? []);
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    // 浏览器中删除/修改书签时，同步刷新侧边栏
    const onBmRemoved = (id: string) => {
      getFlatBookmarks().then(setBookmarks);
      // 从分类树和标签中剔除该书签并持久化
      setResult((prev) => {
        if (!prev) return prev;
        const pruneId = (nodes: CategoryNode[]): boolean => {
          let changed = false;
          for (const n of nodes) {
            const i = n.bookmarkIds?.indexOf(id) ?? -1;
            if (i >= 0) {
              n.bookmarkIds!.splice(i, 1);
              changed = true;
            }
            if (n.children && pruneId(n.children)) changed = true;
          }
          return changed;
        };
        const tree: CategoryNode[] = JSON.parse(JSON.stringify(prev.tree));
        if (!pruneId(tree) && !prev.labels[id]) return prev;
        const labels = { ...prev.labels };
        delete labels[id];
        const next = { ...prev, tree, labels };
        chrome.storage.local.set({ classifyResult: next });
        return next;
      });
    };
    const onBmChanged = () => getFlatBookmarks().then(setBookmarks);
    chrome.bookmarks.onRemoved.addListener(onBmRemoved);
    chrome.bookmarks.onChanged.addListener(onBmChanged);
    // 系统深浅色变化时重新应用（system 模式）
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => loadSettings().then((s) => applyColorMode(s.colorMode));
    mq.addEventListener('change', onScheme);
    return () => {
      chrome.storage.onChanged.removeListener(onChanged);
      chrome.bookmarks.onRemoved.removeListener(onBmRemoved);
      chrome.bookmarks.onChanged.removeListener(onBmChanged);
      mq.removeEventListener('change', onScheme);
    };
  }, []);

  const running = progress.phase === 'labeling' || progress.phase === 'building' || progress.phase === 'assigning';

  const openAiClassificationSettings = useCallback(() => {
    setError('请先完成 AI 金字塔分类供应商设置，正在打开 AI 辅助分类设置。');
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings/settings.html#ai') });
  }, []);

  /** 执行分类；limit 限制条数（试分类） */
  const runClassify = useCallback(async (limit?: number) => {
    setError('');
    setNotice('');
    setEstimate(null);
    const settings = await loadSettings();
    if (!settings.apiKey) {
      openAiClassificationSettings();
      return;
    }
    const all = await getFlatBookmarks();
    setBookmarks(all);
    let unique = dedupeByUrl(all);
    if (limit) unique = unique.slice(0, limit);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await classify(settings, unique, setProgress, ctrl.signal);
      const expanded = expandDuplicateBookmarks(r, all);
      await chrome.storage.local.set({ classifyResult: expanded });
      setResult(expanded);
      if (limit) setNotice(d.trialNotice(unique.length));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(`${d.classifyFailed}: ${(e as Error).message}`);
        setProgress({ phase: 'error', done: 0, total: 0 });
      } else {
        setProgress({ phase: 'idle', done: 0, total: 0 });
      }
    }
  }, [d, openAiClassificationSettings]);

  /** 点击分类：先出成本预估确认 */
  const startClassify = useCallback(async () => {
    setError('');
    const settings = await loadSettings();
    if (!settings.apiKey) {
      openAiClassificationSettings();
      return;
    }
    const all = await getFlatBookmarks();
    setBookmarks(all);
    setEstimate(await estimateClassify(dedupeByUrl(all), settings));
  }, [d, openAiClassificationSettings]);

  const cancelClassify = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const applyPlan = useMemo(() => (result ? planApply(result.tree) : null), [result]);

  const doApply = useCallback(async () => {
    if (!result) return;
    setApplying(true);
    setError('');
    try {
      await backupBookmarks();
      setHasBackup(true);
      await applyToBookmarks(result.tree);
      setCanUndo(true);
      setShowApplyModal(false);
      // 应用后书签 id 不变，但树结构变了，刷新列表
      setBookmarks(await getFlatBookmarks());
    } catch (e) {
      setError(`${d.applyFailed}: ${(e as Error).message}`);
    } finally {
      setApplying(false);
    }
  }, [result]);

  const doUndo = useCallback(async () => {
    if (!confirm(d.undoConfirm)) return;
    setUndoing(true);
    setError('');
    try {
      const n = await undoApply();
      setCanUndo(false);
      setNotice(d.undoDone(n));
      setBookmarks(await getFlatBookmarks());
    } catch (e) {
      setError(`${d.applyFailed}: ${(e as Error).message}`);
    } finally {
      setUndoing(false);
    }
  }, [d]);

  /** 树编辑：更新 state 并持久化 */
  const updateTree = useCallback((mutate: (tree: CategoryNode[]) => CategoryNode[]) => {
    setResult((prev) => {
      if (!prev) return prev;
      const next = { ...prev, tree: mutate(prev.tree) };
      chrome.storage.local.set({ classifyResult: next });
      return next;
    });
  }, []);

  const editHandlers: TreeEditHandlers = useMemo(
    () => ({
      onRename: (path, name) => updateTree((tree) => renameNode(tree, path, name)),
      onDelete: (path) => updateTree((tree) => deleteNode(tree, path)),
      onMoveBookmark: (id, toPath, toIndex) => updateTree((tree) => moveBookmark(tree, id, toPath, toIndex)),
      onMoveFolder: (fromPath, toParentPath, toIndex) => updateTree(
        (tree) => moveNode(tree, fromPath, toParentPath, toIndex),
      ),
      deleteConfirmText: d.deleteFolderConfirm,
    }),
    [updateTree, d],
  );

  /** 增量归类新书签 */
  const classifyPending = useCallback(async () => {
    if (!result || pendingIds.length === 0) return;
    setError('');
    const settings = await loadSettings();
    if (!settings.apiKey) {
      openAiClassificationSettings();
      return;
    }
    const all = await getFlatBookmarks();
    setBookmarks(all);
    const byId = new Map(all.map((b) => [b.id, b]));
    const fresh = pendingIds.map((id) => byId.get(id)).filter((b): b is NonNullable<typeof b> => !!b);
    if (fresh.length === 0) {
      await chrome.storage.local.set({ pendingNewBookmarks: [] });
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await classifyIncremental(settings, fresh, result, setProgress, ctrl.signal);
      const expanded = expandDuplicateBookmarks(r, all);
      await chrome.storage.local.set({ classifyResult: expanded });
      setResult(expanded);
      await chrome.storage.local.set({ pendingNewBookmarks: [] });
      chrome.action.setBadgeText({ text: '' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(`${d.classifyFailed}: ${(e as Error).message}`);
        setProgress({ phase: 'error', done: 0, total: 0 });
      } else {
        setProgress({ phase: 'idle', done: 0, total: 0 });
      }
    }
  }, [result, pendingIds, d, openAiClassificationSettings]);

  const dismissPending = useCallback(async () => {
    await chrome.storage.local.set({ pendingNewBookmarks: [] });
    chrome.action.setBadgeText({ text: '' });
  }, []);

  const downloadBackup = useCallback(async () => {
    const backup = await getBackup();
    if (!backup) return;
    const html = backupToHtml(backup);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmarks-backup-${new Date(backup.createdAt).toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const bookmarkById = useMemo(() => new Map(bookmarks.map((b) => [b.id, b])), [bookmarks]);

  // 搜索过滤：保留含命中书签的分类
  const filteredTree = useMemo((): CategoryNode[] | null => {
    if (!result) return null;
    if (!search.trim()) return result.tree;
    const q = search.trim().toLowerCase();
    const match = (id: string) => {
      const b = bookmarkById.get(id);
      const l = result.labels[id];
      return (
        b?.title.toLowerCase().includes(q) ||
        b?.url.toLowerCase().includes(q) ||
        l?.summary.toLowerCase().includes(q) ||
        l?.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    };
    const filter = (nodes: CategoryNode[]): CategoryNode[] =>
      nodes
        .map((n) => ({
          ...n,
          children: n.children ? filter(n.children) : undefined,
          bookmarkIds: n.bookmarkIds?.filter(match),
        }))
        .filter((n) => (n.bookmarkIds?.length ?? 0) > 0 || (n.children?.length ?? 0) > 0);
    return filter(result.tree);
  }, [result, search, bookmarkById]);

  return (
    <div className="app app-desktop">
      <>
          <header className="topbar">
            <div className="topbar-left">
              <svg className="logo-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
                <path d="M12 12l8-4.5" />
                <path d="M12 12v9" />
                <path d="M12 12L4 7.5" />
              </svg>
              <span className="app-name">AI 金字塔分类</span>
              <span className="count-chip">{bookmarks.length}</span>
            </div>
            <div className="topbar-actions">
              <button
                type="button"
                className="icon-btn"
                title="AI 设置"
                aria-label="AI 设置"
                onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings/settings.html#ai') })}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          </header>

          <div className="search-bar">
            <div className="search-field">
              <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="search-input"
                placeholder={d.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search.trim() ? (
                <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="Clear">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              ) : null}
            </div>
            <div className="search-actions">
              {running ? (
                <button type="button" className="btn btn-danger btn-sm" onClick={cancelClassify}>{d.cancel}</button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={startClassify}>
                  {result ? d.reclassify : d.classify}
                </button>
              )}
              {result && !running && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowApplyModal(true)}>
                  {d.applyToBookmarks}
                </button>
              )}
            </div>
          </div>

          {pendingIds.length > 0 && result && !running && (
            <div className="pending-banner">
              <span>{d.pendingBanner(pendingIds.length)}</span>
              <div className="pending-banner__actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={classifyPending}>{d.classifyPending}</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={dismissPending}>{d.dismissPending}</button>
              </div>
            </div>
          )}

          {(progress.phase === "done" || progress.phase === "error") && !running && (
            <div className={`status-bar ${progress.phase === "error" ? "status-bar--error" : "status-bar--ok"}`}>
              {progress.phase === "done" && d.phaseDone}
              {progress.phase === "error" && d.phaseError}
            </div>
          )}

          {error && <div className="error-msg">{error}</div>}
          {notice && <div className="status-bar">{notice}</div>}

          {result && !running && !search.trim() && (
            <div className="edit-hint">{d.editHint}</div>
          )}

          <div className={`tree ${running ? "running" : ""}`}>
            {filteredTree ? (
              <Tree
                nodes={filteredTree}
                bookmarkById={bookmarkById}
                labels={result!.labels}
                edit={search.trim() || running ? undefined : editHandlers}
              />
            ) : !running ? (
              <div className="empty state-view">
                <div className="empty-illustration" aria-hidden="true">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
                    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
                  </svg>
                </div>
                <p>{d.emptyLine1(bookmarks.length)}</p>
                <p className="empty-sub">{d.emptyLine2}</p>
              </div>
            ) : null}
            {running && (
              <div className="classify-hero">
                <div className="ch-steps">
                  {(["labeling", "building", "assigning"] as const).map((ph, i) => {
                    const order = { labeling: 0, building: 1, assigning: 2 } as const;
                    const cur = order[progress.phase as keyof typeof order] ?? 0;
                    const state = i < cur ? "past" : i === cur ? "now" : "next";
                    return (
                      <span key={ph} className={`ch-step ${state}`}>
                        {i < cur ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </span>
                    );
                  })}
                </div>
                <div className="ch-phase">
                  {progress.phase === "labeling" && d.phaseLabeling}
                  {progress.phase === "building" && d.phaseBuilding}
                  {progress.phase === "assigning" && d.phaseAssigning}
                </div>
                {progress.message && <div className="ch-message">{progress.message}</div>}
                <div className="ch-percent">
                  {progress.total > 0
                    ? `${Math.round((progress.done / progress.total) * 100)}%`
                    : "—"}
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
            )}
          </div>

          {(hasBackup || canUndo) && (
            <div className="footer-bar">
              {canUndo && (
                <button type="button" className="btn btn-danger btn-sm" onClick={doUndo} disabled={undoing}>
                  {undoing ? d.undoing : d.undoApply}
                </button>
              )}
              {hasBackup && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={downloadBackup}>
                  {d.downloadBackup}
                </button>
              )}
            </div>
          )}

          {showApplyModal && applyPlan && (
            <div className="modal-backdrop" onClick={() => !applying && setShowApplyModal(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>{d.applyModalTitle}</h3>
                <div className="modal-body">
                  {d.applyModalDesc}
                  <ul>
                    <li>{d.applyFolders(applyPlan.folderCount)}</li>
                    <li>{d.applyMoves(applyPlan.moveCount)}</li>
                  </ul>
                  <small>{d.applyNote}</small>
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={() => setShowApplyModal(false)} disabled={applying}>{d.cancel}</button>
                  <button type="button" className="btn btn-primary" onClick={doApply} disabled={applying}>
                    {applying ? d.applying : d.confirmApply}
                  </button>
                </div>
              </div>
            </div>
          )}

          {estimate && (
            <div className="modal-backdrop" onClick={() => setEstimate(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>{d.estimateTitle}</h3>
                <div className="modal-body">
                  <ul>
                    <li>{d.estimateTotal(estimate.total)}</li>
                    {estimate.cached > 0 && <li>{d.estimateCached(estimate.cached)}</li>}
                    <li>{d.estimateRequests(estimate.requests)}</li>
                  </ul>
                  <small>{d.estimateNote}</small>
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={() => setEstimate(null)}>{d.cancel}</button>
                  <button type="button" className="btn btn-primary" onClick={() => runClassify()}>{d.startNow}</button>
                </div>
              </div>
            </div>
          )}
      </>

      {whatsNew && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setWhatsNew(null);
            chrome.storage.local.remove("pendingWhatsNew");
          }}
        >
          <div className="modal whatsnew" onClick={(e) => e.stopPropagation()}>
            <h3>{d.whatsNewTitle(whatsNew.to)}</h3>
            <div className="wn-body">
              {whatsNew.entries.map((entry) => (
                <div key={entry.version} className="wn-version">
                  {whatsNew.entries.length > 1 && (
                    <div className="wn-version-tag">v{entry.version}</div>
                  )}
                  <ul>
                    {(resolveLang(uiSettings.language) === "zh" ? entry.zh : entry.en).map(
                      (line, i) => (
                        <li key={i}>{line}</li>
                      ),
                    )}
                  </ul>
                </div>
              ))}
            </div>
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setWhatsNew(null);
                  chrome.storage.local.remove("pendingWhatsNew");
                }}
              >
                {d.whatsNewOk}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
