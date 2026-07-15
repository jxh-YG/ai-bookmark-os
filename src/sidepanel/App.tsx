import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BookmarkTreeSnapshot,
  BookmarkTreeChange,
  CategoryNode,
  ClassificationPlanVersion,
  ClassificationScope,
  ClassificationWorkspaceState,
  ClassifyProgress,
  ClassifyResult,
  FlatBookmark,
  PlanCompatibilityReport,
} from '../types';
import {
  classify,
  estimateClassify,
  expandDuplicateBookmarks,
  loadSavedResult,
  listSavedClassifyResults,
  saveClassifyResult,
  type ClassifyEstimate,
  type SavedClassifyResult,
} from '../core/classifier';
import {
  applyPartialToBookmarks,
  applyToBookmarks,
  backupBookmarks,
  backupToHtml,
  dedupeByUrl,
  getLatestApplyRecord,
  getBookmarkFolders,
  getBackup,
  getFlatBookmarks,
  getFolderClassificationScope,
  inspectClassificationPlanCompatibility,
  planApply,
  undoLatestApply,
  type ApplyResult,
  type BookmarkFolderOption,
} from '../core/bookmarks';
import {
  checkFolderDeletion,
  createCategoryWithBookmarks,
  deleteEmptyFolder,
  moveBookmark,
  moveBookmarks,
  moveNode,
  removeBookmarksFromPlan,
  renameNode,
} from '../core/treeEdit';
import { loadSettings } from '../core/settings';
import { DEFAULT_SETTINGS, fontCss, type Settings } from '../types';
import { applyColorMode, t } from '../core/i18n';
import { Tree, type TreeEditHandlers } from './Tree';
import { entriesSince, type ChangelogEntry } from '../core/changelog';
import { resolveLang } from '../core/i18n';
import { openOrFocusExtensionPage } from '../core/pageRouter';
import { ChevronDown, FolderTree } from 'lucide-react';
import {
  captureBookmarkSnapshot,
  diffBookmarkSnapshots,
  getBookmarkSnapshotPath,
  isBookmarkSnapshotCurrent,
} from '../core/bookmarkSnapshot';
import {
  addClassificationChangeSet,
  clearActiveFullClassification,
  loadClassificationWorkspace,
  setActiveFullClassification,
} from '../core/classificationWorkspace';
import { LiveBookmarkTree } from './LiveBookmarkTree';
import {
  archiveClassificationPlan,
  getClassificationPlanVersionId,
  listClassificationPlanVersions,
} from '../core/classificationPlanArchive';

/** 应用外观设置到根元素 CSS 变量 + 颜色模式 */
function applyAppearance(s: Settings) {
  const root = document.documentElement;
  root.style.setProperty('--accent', s.themeColor);
  root.style.setProperty('--app-font', fontCss(s.fontFamily));
  root.style.setProperty('--app-font-size', `${s.fontSize}px`);
  applyColorMode(s.colorMode);
}

type PendingEstimate = ClassifyEstimate & { scope: ClassificationScope };
type WorkspaceView = 'live' | 'draft' | 'history';
type DraftStatus = 'none' | 'ready' | 'applied' | 'stale' | 'legacy' | 'unavailable';
type PendingReuse = {
  plan: ClassifyResult;
  report: PlanCompatibilityReport;
  planVersionId: string;
  versionCreatedAt: number;
};
type CompatibilityIssue = {
  planVersionId: string;
  messages: string[];
};

const FULL_CLASSIFICATION_SCOPE: ClassificationScope = { mode: 'full' };

function newDraftId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sourceFromSnapshot(snapshot: BookmarkTreeSnapshot) {
  return {
    version: 1 as const,
    fingerprint: snapshot.fingerprint,
    capturedAt: snapshot.capturedAt,
    bookmarkCount: Object.values(snapshot.nodes).filter((node) => node.kind === 'bookmark').length,
    nodeCount: Object.keys(snapshot.nodes).length,
  };
}

function draftStorageKey(scope: ClassificationScope): string {
  return scope.mode === 'partial'
    ? `partialClassifyResult:${scope.targetDirectoryId}`
    : 'classifyResult';
}

function sameClassificationScope(left: ClassificationScope, right: ClassificationScope): boolean {
  return left.mode === right.mode && (
    left.mode === 'full'
    || (right.mode === 'partial' && left.targetDirectoryId === right.targetDirectoryId)
  );
}

function draftStatusLabel(status: DraftStatus | undefined): string {
  switch (status) {
    case 'ready': return '草稿待应用';
    case 'applied': return '已应用且同步';
    case 'stale': return '已过期';
    case 'legacy': return '旧版方案';
    case 'unavailable': return '目标目录不可用';
    default: return '状态检查中';
  }
}

function changeDetail(change: BookmarkTreeChange): string {
  const before = change.before?.title || change.before?.url || '新建';
  const after = change.after?.title || change.after?.url || '已删除';
  if (change.kind === 'renamed') return `名称：${before} → ${after}`;
  if (change.kind === 'urlChanged') return `网址：${change.before?.url ?? '无'} → ${change.after?.url ?? '无'}`;
  return `${before} → ${after}`;
}

function historicalVersionToResult(version: ClassificationPlanVersion): ClassifyResult {
  return {
    tree: version.tree,
    labels: {},
    excludedBookmarkIds: version.excludedBookmarkIds,
    createdAt: version.createdAt,
    ...(version.draftId ? { draftId: version.draftId } : {}),
    ...(version.updatedAt === undefined ? {} : { updatedAt: version.updatedAt }),
    ...(version.scope.mode === 'full' ? {} : { scope: version.scope }),
    ...(version.source ? { source: version.source } : {}),
    ...(version.application ? { application: version.application } : {}),
  };
}

function cloneCategoryTree(tree: CategoryNode[]): CategoryNode[] {
  return JSON.parse(JSON.stringify(tree)) as CategoryNode[];
}

function forkClassificationPlan(
  plan: ClassifyResult,
  snapshot: BookmarkTreeSnapshot,
): ClassifyResult {
  const now = Date.now();
  return {
    tree: cloneCategoryTree(plan.tree),
    labels: JSON.parse(JSON.stringify(plan.labels)) as ClassifyResult['labels'],
    excludedBookmarkIds: [...(plan.excludedBookmarkIds ?? [])],
    createdAt: now,
    draftId: newDraftId(),
    updatedAt: now,
    source: sourceFromSnapshot(snapshot),
    ...(snapshot.scope.mode === 'full' ? {} : { scope: snapshot.scope }),
  };
}

function classificationScopeLabel(scope: ClassificationScope): string {
  return scope.mode === 'partial' ? `局部 · ${scope.targetDirectoryTitle}` : '全量分类';
}

function historyVersionOriginLabel(version: ClassificationPlanVersion): string {
  return version.origin === 'legacy' || !version.source ? '旧格式' : '重新分类前归档';
}

function compatibilityIssueMessages(report: PlanCompatibilityReport): string[] {
  const messages: string[] = [];
  if (report.duplicateBookmarkIds.length > 0) {
    messages.push(`方案中有 ${report.duplicateBookmarkIds.length} 条重复书签 ID：${report.duplicateBookmarkIds.slice(0, 5).join('、')}`);
  }
  if (report.missingBookmarkIds.length > 0) {
    messages.push(`方案中的 ${report.missingBookmarkIds.length} 条书签已不存在：${report.missingBookmarkIds.slice(0, 5).join('、')}`);
  }
  if (report.outsideScopeBookmarkIds.length > 0) {
    messages.push(`方案中的 ${report.outsideScopeBookmarkIds.length} 条书签已移出目标目录范围：${report.outsideScopeBookmarkIds.slice(0, 5).join('、')}`);
  }
  return messages;
}


export function App() {
  const [bookmarks, setBookmarks] = useState<FlatBookmark[]>([]);
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const [drafts, setDrafts] = useState<SavedClassifyResult[]>([]);
  const [historicalVersions, setHistoricalVersions] = useState<ClassificationPlanVersion[]>([]);
  const [activeDraftKey, setActiveDraftKey] = useState('');
  const [selectedHistoryVersionId, setSelectedHistoryVersionId] = useState('');
  const [liveSnapshot, setLiveSnapshot] = useState<BookmarkTreeSnapshot | null>(null);
  const [workspace, setWorkspace] = useState<ClassificationWorkspaceState>({ version: 1, comparisons: [] });
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>('live');
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('none');
  const [draftStatuses, setDraftStatuses] = useState<Record<string, DraftStatus>>({});
  const [selectedLiveFolderId, setSelectedLiveFolderId] = useState('');
  const [progress, setProgress] = useState<ClassifyProgress>({ phase: 'idle', done: 0, total: 0 });
  const [classificationPending, setClassificationPending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [pendingReuse, setPendingReuse] = useState<PendingReuse | null>(null);
  const [compatibilityIssue, setCompatibilityIssue] = useState<CompatibilityIssue | null>(null);
  const [checkingCompatibility, setCheckingCompatibility] = useState(false);
  const [applying, setApplying] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [notice, setNotice] = useState('');
  const [estimate, setEstimate] = useState<PendingEstimate | null>(null);
  const [showPartialModal, setShowPartialModal] = useState(false);
  const [folders, setFolders] = useState<BookmarkFolderOption[]>([]);
  const [selectedDirectoryId, setSelectedDirectoryId] = useState('');
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [preparingPartial, setPreparingPartial] = useState(false);
  const [partialError, setPartialError] = useState('');
  const [whatsNew, setWhatsNew] = useState<{ to: string; entries: ChangelogEntry[] } | null>(null);
  const [uiSettings, setUiSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const abortRef = useRef<AbortController | null>(null);
  const classificationLockRef = useRef(false);
  const liveRefreshTimerRef = useRef<number | null>(null);
  const liveRefreshRequestRef = useRef(0);
  const liveSnapshotRef = useRef<BookmarkTreeSnapshot | null>(null);
  const applyingRef = useRef(false);
  const bookmarkEventsDuringApplyRef = useRef(false);
  const resultRef = useRef<ClassifyResult | null>(null);
  const activeDraftKeyRef = useRef('');
  const draftsRef = useRef<SavedClassifyResult[]>([]);
  const draftStatusRequestRef = useRef(0);
  const draftSaveLockRef = useRef(false);
  const d = t(uiSettings.language);
  const partialText = resolveLang(uiSettings.language) === 'zh'
    ? {
        action: '小范围分类',
        selectorTitle: '选择分类范围',
        selectorLabel: '目标目录',
        selectorHint: '本次仅会分类所选目录内的书签，不影响其他目录。',
        selectorConfirm: '继续',
        selectionRequired: '请选择一个目标目录。',
        selectorLoading: '正在读取目录…',
        noFolders: '未找到可选择的书签目录。',
        estimateTitle: '确认小范围分类',
        range: (title: string) => `分类范围：${title}`,
        count: (count: number) => `${count} 条书签`,
        estimateNote: (count: number) => `本次仅会分类所选目录内的 ${count} 条书签，不影响其他目录。`,
        applyTitle: '应用小范围分类？',
        applyDescription: (title: string) => `分类目录将仅创建在“${title}”内：`,
        applyNote: '本次会重新归类所选目录内的书签，并清理因本次移动而变空的旧目录；不影响目标根目录、范围外目录、原本为空的目录或仍用于撤销的目录。',
        done: (title: string, count: number) => `已生成“${title}”的小范围分类方案，共包含 ${count} 条书签。`,
        applied: (title: string, count: number, cleanedFolderCount: number) => `已覆盖“${title}”内 ${count} 条书签的分类，并清理 ${cleanedFolderCount} 个本次产生的空目录；全量分类未受影响。`,
        fullApplied: (count: number, cleanedFolderCount: number) => `已完成全量分类，处理 ${count} 条书签，并清理 ${cleanedFolderCount} 个本次产生的空目录。`,
        undoConfirm: '本次仅撤销最近一次小范围分类，恢复所选目录内书签及本次清理的旧目录结构到上一次分类位置，不影响此前全量分类。是否继续？',
        undoDone: (count: number) => `已撤销最近一次小范围分类，恢复 ${count} 条书签。`,
      }
    : {
        action: 'Classify folder',
        selectorTitle: 'Choose classification scope',
        selectorLabel: 'Target folder',
        selectorHint: 'Only bookmarks in the selected folder will be classified.',
        selectorConfirm: 'Continue',
        selectionRequired: 'Choose a target folder.',
        selectorLoading: 'Loading folders…',
        noFolders: 'No bookmark folders are available.',
        estimateTitle: 'Confirm folder classification',
        range: (title: string) => `Scope: ${title}`,
        count: (count: number) => `${count} bookmarks`,
        estimateNote: (count: number) => `Only ${count} bookmarks in the selected folder will be classified.`,
        applyTitle: 'Apply folder classification?',
        applyDescription: (title: string) => `Categories will be created only in "${title}":`,
        applyNote: 'Only bookmarks in the selected folder will be regrouped. Empty source folders caused by this move are cleaned up; the selected root, outside folders, pre-existing empty folders, and folders needed for undo stay intact.',
        done: (title: string, count: number) => `Generated a classification plan for "${title}" (${count} bookmarks).`,
        applied: (title: string, count: number, cleanedFolderCount: number) => `Updated ${count} bookmarks in "${title}" and cleaned ${cleanedFolderCount} empty source folder(s); the full classification is unchanged.`,
        fullApplied: (count: number, cleanedFolderCount: number) => `Completed the full classification for ${count} bookmark(s) and cleaned ${cleanedFolderCount} empty source folder(s).`,
        undoConfirm: 'Only the most recent folder classification will be undone, including its cleaned empty source folders. Earlier full classification will remain. Continue?',
        undoDone: (count: number) => `Undid the most recent folder classification and restored ${count} bookmarks.`,
      };
  const openExtensionPage = useCallback((path: string) => {
    void openOrFocusExtensionPage(path);
  }, []);

  const acquireClassificationLock = useCallback(() => {
    if (classificationLockRef.current) return false;
    classificationLockRef.current = true;
    setClassificationPending(true);
    return true;
  }, []);

  const releaseClassificationLock = useCallback(() => {
    classificationLockRef.current = false;
    setClassificationPending(false);
  }, []);

  const refreshLiveTree = useCallback(async (): Promise<BookmarkTreeSnapshot> => {
    const request = ++liveRefreshRequestRef.current;
    const [snapshot, nextBookmarks] = await Promise.all([
      captureBookmarkSnapshot(FULL_CLASSIFICATION_SCOPE),
      getFlatBookmarks(),
    ]);
    if (request !== liveRefreshRequestRef.current) return liveSnapshotRef.current ?? snapshot;
    liveSnapshotRef.current = snapshot;
    setLiveSnapshot(snapshot);
    setSelectedLiveFolderId((current) => (
      current && snapshot.nodes[current]?.kind !== 'folder' ? '' : current
    ));
    setBookmarks(nextBookmarks);
    return snapshot;
  }, []);

  const resolveDraftStatus = useCallback(async (
    draft: ClassifyResult | null,
    currentSnapshot?: BookmarkTreeSnapshot,
  ): Promise<DraftStatus> => {
    if (!draft) return 'none';
    if (!draft.source) return 'legacy';
    try {
      const scope = draft.scope ?? FULL_CLASSIFICATION_SCOPE;
      const current = currentSnapshot && sameClassificationScope(scope, currentSnapshot.scope)
        ? currentSnapshot.fingerprint === draft.source.fingerprint
        : await isBookmarkSnapshotCurrent({
          version: 1,
          scope,
          rootId: scope.mode === 'partial' ? scope.targetDirectoryId : '0',
          capturedAt: draft.source.capturedAt,
          fingerprint: draft.source.fingerprint,
          nodes: {},
        });
      if (!current) return 'stale';
      return draft.application?.fingerprint === draft.source.fingerprint ? 'applied' : 'ready';
    } catch {
      return 'unavailable';
    }
  }, []);

  const updateDraftStatus = useCallback(async (
    draft: ClassifyResult | null,
    currentSnapshot?: BookmarkTreeSnapshot,
    storageKey?: string,
  ) => {
    resultRef.current = draft;
    const status = await resolveDraftStatus(draft, currentSnapshot);
    const key = storageKey ?? (draft ? draftStorageKey(draft.scope ?? FULL_CLASSIFICATION_SCOPE) : '');
    if (key) {
      setDraftStatuses((previous) => ({ ...previous, [key]: status }));
    }
    if (!key || activeDraftKeyRef.current === key) setDraftStatus(status);
    return status;
  }, [resolveDraftStatus]);

  const refreshDraftStatuses = useCallback(async (
    savedDrafts: SavedClassifyResult[],
    currentSnapshot?: BookmarkTreeSnapshot,
  ) => {
    const request = ++draftStatusRequestRef.current;
    const statuses = Object.fromEntries(await Promise.all(savedDrafts.map(async (draft) => [
      draft.storageKey,
      await resolveDraftStatus(draft.result, currentSnapshot),
    ] as const))) as Record<string, DraftStatus>;
    if (request !== draftStatusRequestRef.current) return statuses;
    setDraftStatuses(statuses);
    const activeKey = activeDraftKeyRef.current;
    if (activeKey) setDraftStatus(statuses[activeKey] ?? 'none');
    return statuses;
  }, [resolveDraftStatus]);

  const refreshDraftList = useCallback(async (): Promise<SavedClassifyResult[]> => {
    const nextDrafts = await listSavedClassifyResults();
    draftsRef.current = nextDrafts;
    setDrafts(nextDrafts);
    return nextDrafts;
  }, []);

  const refreshHistoricalVersions = useCallback(async (): Promise<ClassificationPlanVersion[]> => {
    const nextVersions = await listClassificationPlanVersions();
    setHistoricalVersions(nextVersions);
    setSelectedHistoryVersionId((current) => (
      current && !nextVersions.some((version) => version.versionId === current) ? '' : current
    ));
    return nextVersions;
  }, []);

  const refreshAfterBookmarkOperation = useCallback(async () => {
    try {
      const snapshot = await refreshLiveTree();
      bookmarkEventsDuringApplyRef.current = false;
      await refreshDraftStatuses(draftsRef.current, snapshot);
    } catch {
      setDraftStatus('unavailable');
    }
  }, [refreshDraftStatuses, refreshLiveTree]);

  useEffect(() => {
    let disposed = false;
    const loadWorkspace = async () => {
      try {
        const [snapshot, nextDrafts, , nextWorkspace, backup, record] = await Promise.all([
          refreshLiveTree(),
          refreshDraftList(),
          refreshHistoricalVersions(),
          loadClassificationWorkspace(),
          getBackup(),
          getLatestApplyRecord(),
        ]);
        if (disposed) return;
        setWorkspace(nextWorkspace);
        setHasBackup(!!backup);
        setCanUndo(!!record);
        const initial = nextDrafts.find((draft) => draft.storageKey === 'classifyResult')?.result
          ?? nextDrafts[0]?.result
          ?? null;
        const initialKey = nextDrafts.find((draft) => draft.result === initial)?.storageKey ?? '';
        setResult(initial);
        setActiveDraftKey(initialKey);
        activeDraftKeyRef.current = initialKey;
        await refreshDraftStatuses(nextDrafts, snapshot);
      } catch (e) {
        if (!disposed) setError(`无法读取当前书签树： ${(e as Error).message}`);
      }
    };
    void loadWorkspace();

    // 自动更新后首次打开：展示「新版本内容」弹窗（跨多版本更新会累积展示）
    chrome.storage.local.get('pendingWhatsNew').then((data) => {
      const p = data.pendingWhatsNew as { from: string; to: string } | undefined;
      if (!p) return;
      const entries = entriesSince(p.from, p.to);
      if (entries.length > 0) setWhatsNew({ to: p.to, entries });
      else chrome.storage.local.remove('pendingWhatsNew');
    });
    loadSettings().then((settings) => {
      if (disposed) return;
      setUiSettings(settings);
      applyAppearance(settings);
    });

    const refreshAfterBookmarkChange = () => {
      if (applyingRef.current) {
        bookmarkEventsDuringApplyRef.current = true;
        return;
      }
      if (liveRefreshTimerRef.current !== null) window.clearTimeout(liveRefreshTimerRef.current);
      liveRefreshTimerRef.current = window.setTimeout(() => {
        liveRefreshTimerRef.current = null;
        void refreshLiveTree()
          .then((snapshot) => refreshDraftStatuses(draftsRef.current, snapshot))
          .catch(() => setDraftStatus('unavailable'));
      }, 180);
    };
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (changes.settings?.newValue) {
        const settings = changes.settings.newValue as Settings;
        setUiSettings(settings);
        applyAppearance(settings);
      }
      if (changes.classificationWorkspace?.newValue) {
        void loadClassificationWorkspace().then(setWorkspace);
      }
      if (changes.classificationPlanArchive) {
        void refreshHistoricalVersions().catch(() => setError('无法读取历史分类版本。'));
      }
      if (changes.classifyResult || Object.keys(changes).some((key) => key.startsWith('partialClassifyResult:'))) {
        void (async () => {
          const nextDrafts = await refreshDraftList();
          await refreshDraftStatuses(nextDrafts);
          if (draftSaveLockRef.current) return;
          const activeKey = activeDraftKeyRef.current;
          const activeDraft = nextDrafts.find((draft) => draft.storageKey === activeKey);
          if (activeDraft) {
            resultRef.current = activeDraft.result;
            setResult(activeDraft.result);
            await updateDraftStatus(activeDraft.result, undefined, activeKey);
          } else if (activeKey) {
            resultRef.current = null;
            setResult(null);
            setDraftStatus('none');
          }
        })().catch(() => setDraftStatus('unavailable'));
      }
    };
    chrome.storage.onChanged.addListener(onChanged);
    chrome.bookmarks.onRemoved.addListener(refreshAfterBookmarkChange);
    chrome.bookmarks.onChanged.addListener(refreshAfterBookmarkChange);
    chrome.bookmarks.onCreated.addListener(refreshAfterBookmarkChange);
    chrome.bookmarks.onMoved.addListener(refreshAfterBookmarkChange);
    chrome.bookmarks.onChildrenReordered.addListener(refreshAfterBookmarkChange);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => loadSettings().then((settings) => applyColorMode(settings.colorMode));
    mq.addEventListener('change', onScheme);
    return () => {
      disposed = true;
      if (liveRefreshTimerRef.current !== null) window.clearTimeout(liveRefreshTimerRef.current);
      chrome.storage.onChanged.removeListener(onChanged);
      chrome.bookmarks.onRemoved.removeListener(refreshAfterBookmarkChange);
      chrome.bookmarks.onChanged.removeListener(refreshAfterBookmarkChange);
      chrome.bookmarks.onCreated.removeListener(refreshAfterBookmarkChange);
      chrome.bookmarks.onMoved.removeListener(refreshAfterBookmarkChange);
      chrome.bookmarks.onChildrenReordered.removeListener(refreshAfterBookmarkChange);
      mq.removeEventListener('change', onScheme);
    };
  }, [refreshDraftList, refreshDraftStatuses, refreshHistoricalVersions, refreshLiveTree, updateDraftStatus]);

  useEffect(() => {
    resultRef.current = result;
    activeDraftKeyRef.current = activeDraftKey;
  }, [activeDraftKey, result]);

  const running = progress.phase === 'labeling' || progress.phase === 'building' || progress.phase === 'assigning';
  const operationBusy = running || classificationPending || checkingCompatibility || applying || undoing || savingDraft;

  const openAiClassificationSettings = useCallback(() => {
    setError('请先完成 AI 金字塔分类供应商设置，正在打开 AI 辅助分类设置。');
    void openOrFocusExtensionPage('pages/settings/settings.html#ai');
  }, []);

  /** 执行分类；limit 限制条数（试分类） */
  const runClassify = useCallback(async (
    scope: ClassificationScope = FULL_CLASSIFICATION_SCOPE,
    limit?: number,
  ) => {
    if (!acquireClassificationLock()) return;
    setError('');
    setNotice('');
    setEstimate(null);
    let ctrl: AbortController | null = null;
    try {
      const settings = await loadSettings();
      if (!settings.apiKey) {
        openAiClassificationSettings();
        return;
      }
      ctrl = new AbortController();
      abortRef.current = ctrl;
      const partialScope = scope.mode === 'partial'
        ? await getFolderClassificationScope(scope.targetDirectoryId)
        : null;
      const activeScope = partialScope ?? FULL_CLASSIFICATION_SCOPE;
      const replaced = await loadSavedResult(activeScope);
      if (replaced) await archiveClassificationPlan(replaced);
      const sourceSnapshot = await captureBookmarkSnapshot(activeScope);
      const sourceBookmarks = partialScope?.bookmarks ?? await getFlatBookmarks();
      let unique = dedupeByUrl(sourceBookmarks);
      if (limit) unique = unique.slice(0, limit);
      const r = await classify(settings, unique, setProgress, ctrl.signal, activeScope, { persist: false });
      const expanded: ClassifyResult = {
        ...expandDuplicateBookmarks(r, sourceBookmarks),
        draftId: newDraftId(),
        updatedAt: Date.now(),
        source: sourceFromSnapshot(sourceSnapshot),
        application: undefined,
      };
      await saveClassifyResult(expanded);
      setResult(expanded);
      setSelectedHistoryVersionId('');
      setPendingReuse(null);
      setCompatibilityIssue(null);
      const storageKey = draftStorageKey(activeScope);
      setActiveDraftKey(storageKey);
      activeDraftKeyRef.current = storageKey;
      setWorkspaceView('draft');
      const savedDrafts = await refreshDraftList();
      await refreshHistoricalVersions();
      const currentSnapshot = await captureBookmarkSnapshot(activeScope).catch(() => undefined);
      await refreshDraftStatuses(savedDrafts, currentSnapshot);
      if (limit) setNotice(d.trialNotice(unique.length));
      else if (partialScope) setNotice(partialText.done(partialScope.title, sourceBookmarks.length));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(`${d.classifyFailed}: ${(e as Error).message}`);
        setProgress({ phase: 'error', done: 0, total: 0 });
      } else {
        setProgress({ phase: 'idle', done: 0, total: 0 });
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      releaseClassificationLock();
    }
  }, [
    acquireClassificationLock,
    d,
    openAiClassificationSettings,
    partialText,
    refreshDraftList,
    refreshDraftStatuses,
    refreshHistoricalVersions,
    releaseClassificationLock,
  ]);

  /** 点击分类：先出成本预估确认 */
  const startClassify = useCallback(async () => {
    if (!acquireClassificationLock()) return;
    setError('');
    try {
      const settings = await loadSettings();
      if (!settings.apiKey) {
        openAiClassificationSettings();
        return;
      }
      const all = await getFlatBookmarks();
      setEstimate({
        ...(await estimateClassify(dedupeByUrl(all), settings)),
        scope: FULL_CLASSIFICATION_SCOPE,
      });
    } catch (e) {
      setError(`${d.classifyFailed}: ${(e as Error).message}`);
    } finally {
      releaseClassificationLock();
    }
  }, [acquireClassificationLock, d, openAiClassificationSettings, releaseClassificationLock]);

  const openPartialClassify = useCallback(async () => {
    setError('');
    setNotice('');
    setPartialError('');
    setSelectedDirectoryId('');
    setFolders([]);
    setShowPartialModal(true);
    setLoadingFolders(true);
    try {
      const availableFolders = await getBookmarkFolders();
      setFolders(availableFolders);
      if (!availableFolders.length) setPartialError(partialText.noFolders);
    } catch (e) {
      setPartialError((e as Error).message || partialText.noFolders);
    } finally {
      setLoadingFolders(false);
    }
  }, [partialText]);

  const preparePartialClassify = useCallback(async () => {
    if (!selectedDirectoryId) {
      setPartialError(partialText.selectionRequired);
      return;
    }
    if (!acquireClassificationLock()) return;
    setPartialError('');
    setPreparingPartial(true);
    try {
      const settings = await loadSettings();
      if (!settings.apiKey) {
        openAiClassificationSettings();
        return;
      }
      const scope = await getFolderClassificationScope(selectedDirectoryId);
      const nextEstimate = await estimateClassify(dedupeByUrl(scope.bookmarks), settings);
      setEstimate({ ...nextEstimate, scope });
      setShowPartialModal(false);
    } catch (e) {
      setPartialError((e as Error).message);
    } finally {
      setPreparingPartial(false);
      releaseClassificationLock();
    }
  }, [acquireClassificationLock, openAiClassificationSettings, partialText.selectionRequired, releaseClassificationLock, selectedDirectoryId]);

  const cancelClassify = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedDirectoryId) ?? null,
    [folders, selectedDirectoryId],
  );

  const selectedLiveFolder = liveSnapshot?.nodes[selectedLiveFolderId];
  const selectedLiveFolderPath = useMemo(() => (
    liveSnapshot && selectedLiveFolder?.kind === 'folder'
      ? getBookmarkSnapshotPath(liveSnapshot, selectedLiveFolder.id)
      : ''
  ), [liveSnapshot, selectedLiveFolder]);

  const selectedHistoricalVersion = useMemo(
    () => historicalVersions.find((version) => version.versionId === selectedHistoryVersionId) ?? null,
    [historicalVersions, selectedHistoryVersionId],
  );
  const isHistoricalVersion = !!selectedHistoricalVersion;
  const viewedResult = useMemo(
    () => selectedHistoricalVersion ? historicalVersionToResult(selectedHistoricalVersion) : result,
    [result, selectedHistoricalVersion],
  );
  const modalResult = pendingReuse?.plan ?? result;
  const applyPlan = useMemo(() => (modalResult ? planApply(modalResult.tree) : null), [modalResult]);
  const selectedPlanValue = selectedHistoricalVersion
    ? `history:${selectedHistoricalVersion.versionId}`
    : activeDraftKey ? `current:${activeDraftKey}` : '';

  const selectDraft = useCallback(async (storageKey: string) => {
    const selected = drafts.find((draft) => draft.storageKey === storageKey);
    if (!selected) return;
    setSelectedHistoryVersionId('');
    setPendingReuse(null);
    setCompatibilityIssue(null);
    setResult(selected.result);
    resultRef.current = selected.result;
    setActiveDraftKey(storageKey);
    activeDraftKeyRef.current = storageKey;
    setWorkspaceView('draft');
    await updateDraftStatus(selected.result, liveSnapshot ?? undefined, storageKey);
  }, [drafts, liveSnapshot, updateDraftStatus]);

  const selectPlan = useCallback(async (value: string) => {
    if (value.startsWith('history:')) {
      const versionId = value.slice('history:'.length);
      if (!historicalVersions.some((version) => version.versionId === versionId)) return;
      setSelectedHistoryVersionId(versionId);
      setPendingReuse(null);
      setCompatibilityIssue(null);
      setWorkspaceView('draft');
      setShowApplyModal(false);
      return;
    }
    if (value.startsWith('current:')) await selectDraft(value.slice('current:'.length));
  }, [historicalVersions, selectDraft]);

  const prepareFolderClassify = useCallback(async (folderId: string) => {
    if (!acquireClassificationLock()) return;
    setError('');
    try {
      const settings = await loadSettings();
      if (!settings.apiKey) {
        openAiClassificationSettings();
        return;
      }
      const scope = await getFolderClassificationScope(folderId);
      setEstimate({
        ...(await estimateClassify(dedupeByUrl(scope.bookmarks), settings)),
        scope,
      });
    } catch (e) {
      setError(`${d.classifyFailed}: ${(e as Error).message}`);
    } finally {
      releaseClassificationLock();
    }
  }, [
    acquireClassificationLock,
    d.classifyFailed,
    openAiClassificationSettings,
    releaseClassificationLock,
  ]);

  const startSelectedLiveFolderClassify = useCallback(() => {
    if (!selectedLiveFolder || selectedLiveFolder.kind !== 'folder') {
      void openPartialClassify();
      return;
    }
    void prepareFolderClassify(selectedLiveFolder.id);
  }, [openPartialClassify, prepareFolderClassify, selectedLiveFolder]);

  const checkCompatibilityAndApply = useCallback(async () => {
    if (!viewedResult) return;
    const plan = viewedResult;
    const scope = plan.scope ?? FULL_CLASSIFICATION_SCOPE;
    const planVersionId = selectedHistoricalVersion?.versionId ?? getClassificationPlanVersionId(plan);
    setCheckingCompatibility(true);
    setError('');
    setNotice('');
    setPendingReuse(null);
    setCompatibilityIssue(null);
    try {
      const snapshot = await captureBookmarkSnapshot(scope);
      const report = await inspectClassificationPlanCompatibility(
        plan.tree,
        scope,
        plan.excludedBookmarkIds,
      );
      if (snapshot.fingerprint !== report.fingerprint) {
        throw new Error('检查期间书签树发生了变化，请重新检查兼容性。');
      }
      if (!report.canApply) {
        setCompatibilityIssue({
          planVersionId,
          messages: compatibilityIssueMessages(report),
        });
        return;
      }

      const fork = forkClassificationPlan(plan, snapshot);
      const storageKey = draftStorageKey(snapshot.scope);
      const replaced = await loadSavedResult(snapshot.scope);
      if (replaced) await archiveClassificationPlan(replaced);
      draftSaveLockRef.current = true;
      try {
        await saveClassifyResult(fork);
      } finally {
        draftSaveLockRef.current = false;
      }

      setResult(fork);
      resultRef.current = fork;
      setActiveDraftKey(storageKey);
      activeDraftKeyRef.current = storageKey;
      setSelectedHistoryVersionId('');
      setWorkspaceView('draft');
      const nextDrafts = await refreshDraftList();
      await refreshHistoricalVersions();
      await refreshDraftStatuses(nextDrafts, snapshot);
      setPendingReuse({
        plan: fork,
        report,
        planVersionId,
        versionCreatedAt: selectedHistoricalVersion?.createdAt ?? plan.updatedAt ?? plan.createdAt,
      });
      setNotice('兼容性检查通过，已创建新的当前草稿副本。');
      setShowApplyModal(true);
    } catch (e) {
      setCompatibilityIssue({
        planVersionId,
        messages: [(e as Error).message || '无法检查该方案与当前书签的兼容性。'],
      });
    } finally {
      setCheckingCompatibility(false);
    }
  }, [
    refreshDraftList,
    refreshDraftStatuses,
    refreshHistoricalVersions,
    selectedHistoricalVersion,
    viewedResult,
  ]);

  const reclassifyViewedPlan = useCallback(() => {
    if (!viewedResult) return;
    setCompatibilityIssue(null);
    const scope = viewedResult.scope ?? FULL_CLASSIFICATION_SCOPE;
    if (scope.mode === 'partial') {
      void prepareFolderClassify(scope.targetDirectoryId);
      return;
    }
    void startClassify();
  }, [prepareFolderClassify, startClassify, viewedResult]);

  const doApply = useCallback(async (
    draftToApply: ClassifyResult | null = result,
    requestedPlanVersionId?: string,
  ) => {
    if (!draftToApply) return;
    const plan = draftToApply;
    const appliedPlanVersionId = requestedPlanVersionId ?? getClassificationPlanVersionId(plan);
    setApplying(true);
    applyingRef.current = true;
    setError('');
    let chromeApplyCommitted = false;
    try {
      if (!plan.source) {
        throw new Error('这是旧版分类方案，无法确认书签是否已变化。请基于当前书签重新生成方案后再应用。');
      }
      const scope = plan.scope ?? FULL_CLASSIFICATION_SCOPE;
      const beforeSnapshot = await captureBookmarkSnapshot(scope);
      if (beforeSnapshot.fingerprint !== plan.source.fingerprint) {
        await updateDraftStatus(plan, beforeSnapshot, activeDraftKeyRef.current);
        setShowApplyModal(false);
        throw new Error('分类方案生成后书签已变化，请基于最新书签重新生成方案。');
      }
      if (scope.mode === 'partial') {
        const applied = await applyPartialToBookmarks(plan.tree, scope.targetDirectoryId);
        chromeApplyCommitted = true;
        const scopeLabel = scope.targetDirectoryTitle || applied.title;
        setNotice(partialText.applied(scopeLabel, applied.moveCount, applied.cleanedFolderCount));
      } else {
        await backupBookmarks();
        setHasBackup(true);
        let applied: ApplyResult = { moveCount: 0, cleanedFolderCount: 0 };
        await applyToBookmarks(plan.tree, undefined, (nextApplied) => {
          applied = nextApplied;
        });
        chromeApplyCommitted = true;
        const preservedNotice = applied.preservedPreviousRoot
          ? (resolveLang(uiSettings.language) === 'zh'
            ? ' 未纳入方案的内容已保留在原 AI 目录，新分类方案紧随其后。'
            : ' Unplanned content remains in the previous AI folder; the new plan follows it.')
          : '';
        setNotice(`${partialText.fullApplied(applied.moveCount, applied.cleanedFolderCount)}${preservedNotice}`);
      }
      setShowApplyModal(false);
      setCanUndo(true);
      const afterSnapshot = await captureBookmarkSnapshot(scope);
      const changeSet = {
        ...diffBookmarkSnapshots(beforeSnapshot, afterSnapshot),
        planVersionId: appliedPlanVersionId,
      };
      const nextResult: ClassifyResult = {
        ...plan,
        updatedAt: Date.now(),
        source: sourceFromSnapshot(afterSnapshot),
        application: {
          appliedAt: Date.now(),
          fingerprint: afterSnapshot.fingerprint,
          ...(scope.mode === 'full' ? { rootFolderId: (await getLatestApplyRecord())?.rootFolderId } : {}),
          changeSetId: changeSet.id,
        },
      };
      await saveClassifyResult(nextResult);
      setResult(nextResult);
      resultRef.current = nextResult;
      const savedDrafts = await refreshDraftList();
      await refreshDraftStatuses(savedDrafts, scope.mode === 'full' ? afterSnapshot : undefined);
      const nextWorkspace = await addClassificationChangeSet(changeSet);
      setWorkspace(nextWorkspace);
      if (scope.mode === 'full') {
        const record = await getLatestApplyRecord();
        if (record && !record.targetDirectoryId) {
          const updatedWorkspace = await setActiveFullClassification({
            rootFolderId: record.rootFolderId,
            draftId: nextResult.draftId ?? `legacy-${nextResult.createdAt}`,
            appliedAt: nextResult.application!.appliedAt,
            fingerprint: afterSnapshot.fingerprint,
          });
          setWorkspace(updatedWorkspace);
        }
      }
      setPendingReuse(null);
      setCompatibilityIssue(null);
    } catch (e) {
      if (chromeApplyCommitted) {
        setShowApplyModal(false);
        setCanUndo(!!(await getLatestApplyRecord().catch(() => null)));
        setError(`书签已应用，但无法完成方案记录：${(e as Error).message}`);
      } else {
        setPendingReuse(null);
        setError(`${d.applyFailed}: ${(e as Error).message}`);
        setCanUndo(!!(await getLatestApplyRecord().catch(() => null)));
      }
    } finally {
      applyingRef.current = false;
      await refreshAfterBookmarkOperation();
      setApplying(false);
    }
  }, [
    d,
    partialText,
    refreshAfterBookmarkOperation,
    refreshDraftList,
    refreshDraftStatuses,
    result,
    uiSettings.language,
    updateDraftStatus,
  ]);

  const doUndo = useCallback(async () => {
    let record;
    try {
      record = await getLatestApplyRecord();
    } catch (e) {
      setError(`${d.applyFailed}: ${(e as Error).message}`);
      return;
    }
    if (!record) {
      setCanUndo(false);
      return;
    }
    const isPartial = !!record.targetDirectoryId;
    if (!confirm(isPartial ? partialText.undoConfirm : d.undoConfirm)) return;
    setUndoing(true);
    applyingRef.current = true;
    setError('');
    setNotice('');
    try {
      const n = await undoLatestApply();
      setCanUndo(!!(await getLatestApplyRecord()));
      setNotice(isPartial ? partialText.undoDone(n) : d.undoDone(n));
      if (!isPartial) {
        const nextWorkspace = await clearActiveFullClassification();
        setWorkspace(nextWorkspace);
      }
    } catch (e) {
      setError(`${d.applyFailed}: ${(e as Error).message}`);
    } finally {
      applyingRef.current = false;
      await refreshAfterBookmarkOperation();
      setUndoing(false);
    }
  }, [d, partialText, refreshAfterBookmarkOperation]);

  const persistDraftEdit = useCallback(async (next: ClassifyResult) => {
    if (draftSaveLockRef.current) return;
    setPendingReuse(null);
    setCompatibilityIssue(null);
    draftSaveLockRef.current = true;
    setSavingDraft(true);
    const storageKey = activeDraftKeyRef.current || draftStorageKey(next.scope ?? FULL_CLASSIFICATION_SCOPE);
    try {
      await saveClassifyResult(next);
      const status = await resolveDraftStatus(next);
      const updatedDrafts = draftsRef.current.map((draft) => (
        draft.storageKey === storageKey ? { ...draft, result: next } : draft
      ));
      const nextDrafts = updatedDrafts.some((draft) => draft.storageKey === storageKey)
        ? updatedDrafts
        : [...updatedDrafts, { storageKey, result: next }];
      resultRef.current = next;
      draftsRef.current = nextDrafts;
      setResult(next);
      setDrafts(nextDrafts);
      setDraftStatuses((previous) => ({ ...previous, [storageKey]: status }));
      if (activeDraftKeyRef.current === storageKey) setDraftStatus(status);
    } catch (e) {
      setError(`保存分类方案失败：${(e as Error).message}`);
    } finally {
      draftSaveLockRef.current = false;
      setSavingDraft(false);
    }
  }, [resolveDraftStatus]);

  /** 树编辑：更新 state 并持久化 */
  const updateTree = useCallback((mutate: (tree: CategoryNode[]) => CategoryNode[]) => {
    if (draftSaveLockRef.current) return;
    const current = resultRef.current;
    if (!current) return;
    void persistDraftEdit({
      ...current,
      tree: mutate(current.tree),
      updatedAt: Math.max(Date.now(), (current.updatedAt ?? current.createdAt) + 1),
      application: undefined,
    });
  }, [persistDraftEdit]);

  const removeBookmarksFromDraft = useCallback((bookmarkIds: string[]) => {
    if (draftSaveLockRef.current) return;
    const current = resultRef.current;
    if (!current || !bookmarkIds.length) return;
    void persistDraftEdit({
      ...current,
      tree: removeBookmarksFromPlan(current.tree, bookmarkIds),
      excludedBookmarkIds: [...new Set([...(current.excludedBookmarkIds ?? []), ...bookmarkIds])],
      updatedAt: Math.max(Date.now(), (current.updatedAt ?? current.createdAt) + 1),
      application: undefined,
    });
  }, [persistDraftEdit]);

  const editHandlers: TreeEditHandlers = useMemo(
    () => ({
      onRename: (path, name) => updateTree((tree) => renameNode(tree, path, name)),
      onDelete: (path) => updateTree((tree) => (
        checkFolderDeletion(tree, path).canDelete ? deleteEmptyFolder(tree, path) : tree
      )),
      onMoveBookmark: (id, toPath, toIndex) => updateTree((tree) => moveBookmark(tree, id, toPath, toIndex)),
      onMoveBookmarks: (ids, toPath, toIndex) => updateTree((tree) => moveBookmarks(tree, ids, toPath, toIndex)),
      onCreateCategory: (name, ids) => updateTree((tree) => createCategoryWithBookmarks(tree, name, ids)),
      onRemoveBookmarksFromPlan: removeBookmarksFromDraft,
      onMoveFolder: (fromPath, toParentPath, toIndex) => updateTree(
        (tree) => moveNode(tree, fromPath, toParentPath, toIndex),
      ),
      deleteConfirmText: d.deleteFolderConfirm,
      deleteEmptyConfirmText: (name: string) => `确认删除空分类“${name}”？`,
      deleteBlockedText: (name: string, bookmarkCount: number) => (
        `“${name}”及其子目录包含 ${bookmarkCount} 条书签。请先将书签移动到其他书签夹后再删除该目录。`
      ),
      renameLabel: resolveLang(uiSettings.language) === 'zh' ? '重命名' : 'Rename',
      deleteLabel: resolveLang(uiSettings.language) === 'zh' ? '删除' : 'Delete',
      moveToRootLabel: resolveLang(uiSettings.language) === 'zh' ? '移到顶层' : 'Move folder to top level',
      selectedCountText: (count: number) => `已选择 ${count} 条书签`,
      batchTargetPlaceholder: '选择目标分类',
      moveSelectedLabel: '移动所选书签',
      newCategoryPlaceholder: '新分类名称',
      createCategoryLabel: '新建分类并移动',
      removeSelectedLabel: '从方案移除',
      clearSelectionLabel: '取消选择',
      moveBookmarksNeededLabel: '去移动书签',
    }),
    [updateTree, removeBookmarksFromDraft, d, uiSettings.language],
  );


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
  const excludedBookmarks = useMemo(() => (
    (viewedResult?.excludedBookmarkIds ?? []).map((id) => bookmarkById.get(id) ?? { id, title: id })
  ), [bookmarkById, viewedResult?.excludedBookmarkIds]);

  // 搜索过滤：保留含命中书签的分类
  const filteredTree = useMemo((): CategoryNode[] | null => {
    if (!viewedResult) return null;
    if (!search.trim()) return viewedResult.tree;
    const q = search.trim().toLowerCase();
    const match = (id: string) => {
      const b = bookmarkById.get(id);
      const l = viewedResult.labels[id];
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
    return filter(viewedResult.tree);
  }, [viewedResult, search, bookmarkById]);

  const viewedPlanVersionId = selectedHistoricalVersion?.versionId
    ?? (viewedResult ? getClassificationPlanVersionId(viewedResult) : '');
  const selectedCompatibilityIssue = compatibilityIssue?.planVersionId === viewedPlanVersionId
    ? compatibilityIssue
    : null;
  const needsCompatibilityCheck = isHistoricalVersion
    || draftStatus === 'stale'
    || draftStatus === 'legacy'
    || draftStatus === 'unavailable';
  const pendingReusePreservedCount = pendingReuse
    ? pendingReuse.report.unplannedBookmarkIds.length
      + (pendingReuse.plan.excludedBookmarkIds ?? []).filter((id) => bookmarkById.has(id)).length
    : 0;

  const draftStatusMessage = useMemo(() => {
    if (draftStatus === 'ready') return '草稿与当前书签树同步，尚未应用；可继续编辑或应用。';
    if (draftStatus === 'applied') return '该方案已应用，且仍与当前书签树同步。编辑后会重新变为待应用草稿。';
    if (draftStatus === 'stale') return '书签已在方案生成后发生变化；兼容性检查通过后仍可回用。';
    if (draftStatus === 'legacy') return '这是缺少来源快照的旧格式方案；兼容性检查通过后仍可回用。';
    if (draftStatus === 'unavailable') return '暂时无法确认方案范围；请检查兼容性以获得具体原因。';
    return '';
  }, [draftStatus]);

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
              <button type="button" className="topbar-nav-btn" onClick={() => openExtensionPage('pages/standalone/standalone.html')}>工作台</button>
              <button type="button" className="topbar-nav-btn is-active" aria-current="page">AI 分类</button>
              <button type="button" className="topbar-nav-btn" onClick={() => openExtensionPage('ai/bookmark-nav.html')}>书签导航</button>
              <button type="button" className="topbar-nav-btn" onClick={() => openExtensionPage('pages/checker/checker.html')}>失效检查</button>
              <button type="button" className="topbar-nav-btn" onClick={() => openExtensionPage('pages/graph/graph.html')}>图谱</button>
              <button
                type="button"
                className="icon-btn"
                title="AI 设置"
                aria-label="AI 设置"
                onClick={() => openExtensionPage('pages/settings/settings.html#ai')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          </header>

          <div className="workspace-tabs" role="tablist" aria-label="AI 分类工作区">
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === 'live'}
              className={workspaceView === 'live' ? 'is-active' : ''}
              onClick={() => setWorkspaceView('live')}
            >
              当前书签树
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === 'draft'}
              className={workspaceView === 'draft' ? 'is-active' : ''}
              onClick={() => setWorkspaceView('draft')}
            >
              AI 分类方案{drafts.length ? ` (${drafts.length})` : ''}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceView === 'history'}
              className={workspaceView === 'history' ? 'is-active' : ''}
              onClick={() => setWorkspaceView('history')}
            >
              变更记录{workspace.comparisons.length ? ` (${workspace.comparisons.length})` : ''}
            </button>
          </div>

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
                <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label={resolveLang(uiSettings.language) === "zh" ? "清空" : "Clear"}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              ) : null}
            </div>
            <div className="search-actions">
              {workspaceView === 'live' ? (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={operationBusy}
                    onClick={() => {
                      void refreshLiveTree()
                        .then((snapshot) => updateDraftStatus(resultRef.current, snapshot))
                        .catch((e) => setError(`无法刷新当前书签树： ${(e as Error).message}`));
                    }}
                  >
                    刷新当前树
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={startClassify} disabled={operationBusy}>
                    {result ? '重新全量分类' : d.classify}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void startSelectedLiveFolderClassify()}
                    disabled={operationBusy}
                  >
                    <FolderTree size={14} aria-hidden="true" />
                    {selectedLiveFolder?.kind === 'folder' ? '对所选目录分类' : partialText.action}
                  </button>
                </>
              ) : running ? (
                <button type="button" className="btn btn-danger btn-sm" onClick={cancelClassify}>{d.cancel}</button>
              ) : workspaceView === 'draft' ? (
                <>
                  <button type="button" className="btn btn-primary btn-sm" onClick={startClassify} disabled={operationBusy}>
                    {result ? d.reclassify : d.classify}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void openPartialClassify()}
                    title={partialText.action}
                    disabled={operationBusy}
                  >
                    <FolderTree size={14} aria-hidden="true" />
                    {partialText.action}
                  </button>
                </>
              ) : null}
            </div>
          </div>


          {(progress.phase === "done" || progress.phase === "error") && !running && (
            <div className={`status-bar ${progress.phase === "error" ? "status-bar--error" : "status-bar--ok"}`}>
              {progress.phase === "done" && d.phaseDone}
              {progress.phase === "error" && d.phaseError}
            </div>
          )}

          {error && <div className="error-msg">{error}</div>}
          {notice && <div className="status-bar">{notice}</div>}
          {workspaceView === 'live' && result && draftStatus === 'ready' && (
            <div className="pending-apply-banner" role="status">
              <span>AI 分类方案已生成，尚未应用到书签。</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowApplyModal(true)}>
                {d.applyToBookmarks}
              </button>
            </div>
          )}
          {workspaceView === 'live' && selectedLiveFolder?.kind === 'folder' && (
            <div className="scope-banner">
              已选择目录：{selectedLiveFolderPath || selectedLiveFolder.title || '未命名目录'} · 可执行小范围分类
            </div>
          )}
          {workspaceView === 'draft' && (drafts.length > 0 || historicalVersions.length > 0) && (
            <div className="draft-selector">
              <label htmlFor="savedDraft">方案版本</label>
              <div className="draft-select-control">
                <select
                  id="savedDraft"
                  value={selectedPlanValue}
                  onChange={(event) => void selectPlan(event.target.value)}
                  disabled={operationBusy}
                >
                  <option value="" disabled>选择方案版本</option>
                  <optgroup label="当前草稿">
                    {drafts.map((draft) => (
                      <option key={draft.storageKey} value={`current:${draft.storageKey}`}>
                        {classificationScopeLabel(draft.result.scope ?? FULL_CLASSIFICATION_SCOPE)} · {new Date(draft.result.updatedAt ?? draft.result.createdAt).toLocaleString()} · {draftStatusLabel(draftStatuses[draft.storageKey])}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="历史版本">
                    {historicalVersions.map((version) => (
                      <option key={version.versionId} value={`history:${version.versionId}`}>
                        {classificationScopeLabel(version.scope)} · {new Date(version.createdAt).toLocaleString()} · {historyVersionOriginLabel(version)} · {version.application ? '已应用' : '兼容后可应用'}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown className="draft-select-chevron" size={16} strokeWidth={2} aria-hidden="true" />
              </div>
            </div>
          )}
          {workspaceView === 'draft' && !isHistoricalVersion && draftStatusMessage && (
            <div className={`draft-status draft-status--${draftStatus}`} role="status">{draftStatusMessage}</div>
          )}
          {workspaceView === 'draft' && viewedResult && (
            <div className="draft-apply-action" role="group" aria-label="应用分类方案">
              <div>
                <strong>{isHistoricalVersion
                  ? `历史版本 · ${selectedHistoricalVersion?.application ? '已应用' : '兼容后可应用'}${selectedHistoricalVersion?.source ? '' : ' · 旧格式'}`
                  : draftStatus === 'ready' ? '可直接应用' : draftStatusLabel(draftStatus)}</strong>
                <span>{isHistoricalVersion
                  ? '历史版本为只读；兼容性检查通过后会创建新的当前草稿副本。'
                  : draftStatus === 'ready' ? '确认后将按方案更新当前 Chrome 书签树。' : (draftStatusMessage || '正在检查该方案是否仍可应用。')}</span>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={needsCompatibilityCheck
                  ? () => void checkCompatibilityAndApply()
                  : () => setShowApplyModal(true)}
                disabled={operationBusy || (!needsCompatibilityCheck && draftStatus !== 'ready')}
                title={needsCompatibilityCheck ? '检查方案与当前书签是否兼容' : '应用当前分类方案到书签树'}
              >
                {checkingCompatibility
                  ? '正在检查兼容性…'
                  : needsCompatibilityCheck ? '检查兼容性并应用'
                    : draftStatus === 'applied' ? '已应用到书签' : d.applyToBookmarks}
              </button>
            </div>
          )}
          {workspaceView === 'draft' && selectedCompatibilityIssue && (
            <div className="draft-status draft-status--incompatible" role="alert">
              <strong>不兼容，未对 Chrome 书签执行任何写入。</strong>
              <ul>
                {selectedCompatibilityIssue.messages.map((message) => <li key={message}>{message}</li>)}
              </ul>
              <button type="button" className="btn btn-primary btn-sm" onClick={reclassifyViewedPlan} disabled={operationBusy}>
                基于当前书签重新分类
              </button>
            </div>
          )}
          {workspaceView === 'draft' && viewedResult?.scope?.mode === 'partial' && (
            <div className="scope-banner">
              {partialText.range(viewedResult.scope.targetDirectoryTitle)} · {partialText.count(viewedResult.scope.bookmarkCount)}
            </div>
          )}
          {workspaceView === 'draft' && excludedBookmarks.length > 0 && (
            <div className="excluded-bookmarks" role="status">
              <strong>未纳入本次方案：{excludedBookmarks.length} 条书签</strong>
              <span>应用后这些书签会保留在当前 Chrome 位置，不会被删除或移动。</span>
              <small>{excludedBookmarks.slice(0, 5).map((bookmark) => bookmark.title).join(' · ')}{excludedBookmarks.length > 5 ? ' · …' : ''}</small>
            </div>
          )}

          {workspaceView === 'draft' && viewedResult && !isHistoricalVersion && !running && !search.trim() && (
            <div className="edit-hint">{d.editHint}</div>
          )}

          <div className={`tree ${running ? "running" : ""}`}>
            {workspaceView === 'live' && liveSnapshot ? (
              <LiveBookmarkTree
                snapshot={liveSnapshot}
                selectedFolderId={selectedLiveFolderId}
                onSelectFolder={(folder) => setSelectedLiveFolderId((current) => current === folder.id ? '' : folder.id)}
              />
            ) : workspaceView === 'draft' && filteredTree && viewedResult ? (
              <Tree
                key={isHistoricalVersion
                  ? `history:${selectedHistoryVersionId}`
                  : `${activeDraftKey}:${viewedResult.updatedAt ?? viewedResult.createdAt}`}
                nodes={filteredTree}
                bookmarkById={bookmarkById}
                labels={viewedResult.labels}
                edit={isHistoricalVersion || search.trim() || operationBusy ? undefined : editHandlers}
              />
            ) : workspaceView === 'history' ? (
              <div className="comparison-history">
                {workspace.comparisons.length ? workspace.comparisons.map((changeSet) => (
                  <details key={changeSet.id} className="comparison-record">
                    <summary>
                      {changeSet.scope.mode === 'partial'
                        ? `局部 · ${changeSet.scope.targetDirectoryTitle}`
                        : '全量分类'} · {new Date(changeSet.createdAt).toLocaleString()}
                    </summary>
                    <div className="comparison-summary">
                      新增 {changeSet.summary.added} · 删除 {changeSet.summary.removed} · 移动 {changeSet.summary.moved} · 改名 {changeSet.summary.renamed} · 排序 {changeSet.summary.reordered} · 网址 {changeSet.summary.urlChanged}
                    </div>
                    <ul>
                      {changeSet.changes.map((change) => (
                        <li key={`${change.kind}-${change.id}`}>
                          {change.kind}：{change.beforePath ?? '新建'} → {change.afterPath ?? '已删除'}（{changeDetail(change)}）
                        </li>
                      ))}
                    </ul>
                    {changeSet.truncated && <small>详情已截断，摘要统计完整。</small>}
                  </details>
                )) : <p className="empty-sub">暂无分类应用记录。</p>}
              </div>
            ) : !running ? (
              <div className="empty state-view">
                <div className="empty-illustration" aria-hidden="true">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
                    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
                  </svg>
                </div>
                <p>{workspaceView === 'live' ? '当前书签树加载中…' : d.emptyLine1(bookmarks.length)}</p>
                <p className="empty-sub">{workspaceView === 'live' ? '请稍后重试刷新。' : d.emptyLine2}</p>
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
                <button type="button" className="btn btn-danger btn-sm" onClick={doUndo} disabled={operationBusy}>
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

          {showPartialModal && (
            <div className="modal-backdrop" onClick={() => !preparingPartial && setShowPartialModal(false)}>
              <div className="modal scope-modal" role="dialog" aria-modal="true" aria-labelledby="partialScopeTitle" onClick={(e) => e.stopPropagation()}>
                <h3 id="partialScopeTitle">{partialText.selectorTitle}</h3>
                <div className="modal-body">
                  <label className="scope-field" htmlFor="partialScopeFolder">
                    <span>{partialText.selectorLabel}</span>
                    <select
                      id="partialScopeFolder"
                      className="scope-select"
                      value={selectedDirectoryId}
                      disabled={loadingFolders || preparingPartial}
                      onChange={(e) => {
                        setSelectedDirectoryId(e.target.value);
                        setPartialError('');
                      }}
                    >
                      <option value="">{loadingFolders ? partialText.selectorLoading : partialText.selectorLabel}</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>{folder.path}</option>
                      ))}
                    </select>
                  </label>
                  {selectedFolder && <div className="scope-selection">{partialText.range(selectedFolder.path)}</div>}
                  <small>{partialText.selectorHint}</small>
                  {partialError && <p className="modal-error" role="alert">{partialError}</p>}
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={() => setShowPartialModal(false)} disabled={preparingPartial}>{d.cancel}</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void preparePartialClassify()}
                    disabled={!selectedDirectoryId || loadingFolders || preparingPartial}
                  >
                    {preparingPartial ? partialText.selectorLoading : partialText.selectorConfirm}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showApplyModal && applyPlan && modalResult && (
            <div className="modal-backdrop" onClick={() => !applying && setShowApplyModal(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>{modalResult.scope?.mode === 'partial' ? partialText.applyTitle : d.applyModalTitle}</h3>
                <div className="modal-body">
                  {modalResult.scope?.mode === 'partial'
                    ? partialText.applyDescription(modalResult.scope.targetDirectoryTitle)
                    : d.applyModalDesc}
                  <ul>
                    {pendingReuse && <li>版本时间：{new Date(pendingReuse.versionCreatedAt).toLocaleString()}</li>}
                    {pendingReuse && <li>方案范围：{classificationScopeLabel(pendingReuse.report.scope)}</li>}
                    <li>{d.applyFolders(applyPlan.folderCount)}</li>
                    <li>{d.applyMoves(applyPlan.moveCount)}</li>
                    {pendingReuse
                      ? <li>新增或未纳入方案并保留原位：{pendingReusePreservedCount} 条书签</li>
                      : excludedBookmarks.length > 0 && <li>保留原位置：{excludedBookmarks.length} 条未纳入方案的书签</li>}
                  </ul>
                  {pendingReuse && <strong className="reuse-no-ai">本次不调用 AI，只复用已保存的分类方案。</strong>}
                  <small>{modalResult.scope?.mode === 'partial' ? partialText.applyNote : d.applyNote} 应用完成后会在“变更记录”中保存实际前后对比。</small>
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={() => setShowApplyModal(false)} disabled={applying}>{d.cancel}</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void doApply(modalResult, pendingReuse?.planVersionId)}
                    disabled={applying}
                  >
                    {applying ? d.applying : d.confirmApply}
                  </button>
                </div>
              </div>
            </div>
          )}

          {estimate && (
            <div className="modal-backdrop" onClick={() => setEstimate(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>{estimate.scope.mode === 'partial' ? partialText.estimateTitle : d.estimateTitle}</h3>
                <div className="modal-body">
                  <ul>
                    {estimate.scope.mode === 'partial' && (
                      <li>{partialText.range(estimate.scope.targetDirectoryTitle)}</li>
                    )}
                    <li>{d.estimateTotal(estimate.total)}</li>
                    {estimate.cached > 0 && <li>{d.estimateCached(estimate.cached)}</li>}
                    <li>{d.estimateRequests(estimate.requests)}</li>
                  </ul>
                  <small>
                    {estimate.scope.mode === 'partial'
                      ? partialText.estimateNote(estimate.scope.bookmarkCount)
                      : d.estimateNote}
                  </small>
                </div>
                <div className="actions">
                  <button type="button" className="btn" onClick={() => setEstimate(null)} disabled={classificationPending}>{d.cancel}</button>
                  <button type="button" className="btn btn-primary" onClick={() => runClassify(estimate.scope)} disabled={classificationPending}>{d.startNow}</button>
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
