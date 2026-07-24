const backBtn = document.getElementById('backBtn');
const workspaceBtn = document.getElementById('workspaceBtn');
const aiClassifyBtn = document.getElementById('aiClassifyBtn');
const bookmarkNavBtn = document.getElementById('bookmarkNavBtn');
const checkerBtn = document.getElementById('checkerBtn');
const graphBtn = document.getElementById('graphBtn');
const settingsBtn = document.getElementById('settingsBtn');
const startCheckBtn = document.getElementById('startCheckBtn');
const stopCheckBtn = document.getElementById('stopCheckBtn');
const selectConfirmedBtn = document.getElementById('selectConfirmedBtn');
const selectReviewBtn = document.getElementById('selectReviewBtn');
const recheckSelectedBtn = document.getElementById('recheckSelectedBtn');
const recheckSelectionCount = document.getElementById('recheckSelectionCount');
const clearSelectionBtn = document.getElementById('clearSelectionBtn');
const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
const selectionCount = document.getElementById('selectionCount');
const summaryBar = document.getElementById('summaryBar');
const totalChecked = document.getElementById('totalChecked');
const totalOk = document.getElementById('totalOk');
const totalBroken = document.getElementById('totalBroken');
const totalWarning = document.getElementById('totalWarning');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const resultList = document.getElementById('resultList');
const toastContainer = document.getElementById('toastContainer');
const checkerLiveStatus = document.getElementById('checkerLiveStatus');
const deleteConfirmOverlay = document.getElementById('deleteConfirmOverlay');
const deleteConfirmDialog = document.getElementById('deleteConfirmDialog');
const deleteConfirmSummary = document.getElementById('deleteConfirmSummary');
const manualConfirmRow = document.getElementById('manualConfirmRow');
const manualConfirmCheckbox = document.getElementById('manualConfirmCheckbox');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

const RESULT_VERSION = 2;
const BATCH_RECHECK_CONCURRENCY = 2;
const CANONICAL_STATES = new Set([
  'reachable',
  'confirmed_missing',
  'content_suspect',
  'access_limited',
  'transient_failure',
  'unsupported',
]);
const REASON_I18N_KEYS = {
  'http-success': 'checkerReasonHttpSuccess',
  'non-html-resource': 'checkerReasonNonHtml',
  'anonymous-not-found': 'checkerReasonAnonymousNotFound',
  'authenticated-not-found': 'checkerReasonAuthenticatedNotFound',
  'session-and-rendered-missing': 'checkerReasonConfirmedMissing',
  'session-render-inconclusive': 'checkerReasonSessionInconclusive',
  'session-challenge-or-waf': 'checkerReasonSessionChallenge',
  'session-recheck-failed': 'checkerReasonSessionRecheckFailed',
  'login-redirect': 'checkerReasonLoginRedirect',
  'redirect-home': 'checkerReasonRedirectHome',
  'title-missing': 'checkerReasonTitleMissing',
  'access-restricted': 'checkerReasonAccessRestricted',
  'request-timeout': 'checkerReasonTimeout',
  'rate-limited': 'checkerReasonRateLimited',
  'server-error': 'checkerReasonServerError',
  'network-error': 'checkerReasonNetworkError',
  timeout: 'checkerReasonTimeout',
  aborted: 'checkerReasonAborted',
  'http-client-error': 'checkerReasonClientError',
  'invalid-response': 'checkerReasonInvalidResponse',
  'invalid-url': 'checkerReasonInvalidUrl',
  'unsupported-scheme': 'checkerReasonUnsupportedScheme',
  'legacy-ok': 'checkerReasonLegacyOk',
  'legacy-unverified': 'checkerReasonLegacyUnverified',
  'permission-required': 'checkerReasonPermissionRequired',
};

let results = [];
let selectedResultIds = new Set();
let recheckingResultIds = new Set();
let isChecking = false;
// 同步再入锁：从点击到 isChecking 置位之间存在 await 窗口（权限申请 / 加载书签），
// 该标志在同步阶段立即置位，避免双击启动两轮扫描互相覆盖 activeRunId / results。
let checkStarting = false;
let activeRunId = '';
let checkedCount = 0;
let totalCount = 0;
let currentFilter = 'all';
let resultStats = { ok: 0, broken: 0, warning: 0 };
let resultsRenderTimer = null;
let resultsRenderFrame = null;
let lastResultStatus = 'completed';
let lastResultSource = 'manual';
let pendingDeleteItems = [];
let deleteDialogReturnFocus = null;
let isDeleting = false;

function openExtensionPage(path) {
  return window.AIBookmarkPageRouter?.openOrFocusExtensionPage(path)
    ?? chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

async function openAiClassifyPanel() {
  const router = window.AIBookmarkPageRouter;
  if (router?.openAiClassificationPanel) return router.openAiClassificationPanel();
  return openExtensionPage('ai/sidepanel.html');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function applyTheme(theme) {
  document.body.classList.remove('theme-light', 'theme-dark');
  if (theme === 'light') document.body.classList.add('theme-light');
  else if (theme === 'dark') document.body.classList.add('theme-dark');
}

async function loadTheme() {
  const stored = await chrome.storage.local.get('theme');
  applyTheme(stored.theme || 'system');
}

function escapeHtml(value) {
  const node = document.createElement('div');
  node.textContent = String(value || '');
  return node.innerHTML;
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function normalizeSettings(raw) {
  const timeoutMs = boundedNumber(raw?.checkerTimeout, 10_000, 1, 120_000);
  return {
    checkerTimeout: timeoutMs,
    checkerConcurrency: boundedNumber(raw?.checkerConcurrency, 5, 1, 5),
    checkerRetries: boundedNumber(raw?.checkerRetries, 2, 0, 10),
    checkerBackoffBase: boundedNumber(raw?.checkerBackoffBase, 800, 0, 30_000),
    checkerBackoffMax: boundedNumber(raw?.checkerBackoffMax, 3_000, 0, 60_000),
  };
}

async function getCheckSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getCheckerSettings' });
    return normalizeSettings(response?.settings);
  } catch (_) {
    return normalizeSettings(null);
  }
}

function probeOptions(settings) {
  return {
    timeoutMs: settings.checkerTimeout,
    perAttemptMs: Math.min(settings.checkerTimeout, Math.max(1, Math.floor(settings.checkerTimeout / 2))),
    retries: settings.checkerRetries,
    baseDelayMs: settings.checkerBackoffBase,
    maxDelayMs: settings.checkerBackoffMax,
  };
}

function fallbackResult(url, reason) {
  return {
    state: 'transient_failure',
    reason,
    statusCode: null,
    finalUrl: url,
    checkedAt: Date.now(),
    probeMode: 'anonymous',
  };
}

function normalizeResult(raw, url) {
  if (!raw || typeof raw !== 'object' || !CANONICAL_STATES.has(raw.state)) return fallbackResult(url, 'invalid-response');
  const statusCode = raw.statusCode == null ? null : Number(raw.statusCode);
  return {
    state: raw.state,
    reason: typeof raw.reason === 'string' && raw.reason ? raw.reason : 'invalid-response',
    statusCode: Number.isFinite(statusCode) ? statusCode : null,
    finalUrl: typeof raw.finalUrl === 'string' && raw.finalUrl ? raw.finalUrl : url,
    checkedAt: Number.isFinite(Number(raw.checkedAt)) ? Number(raw.checkedAt) : Date.now(),
    probeMode: raw.probeMode === 'authenticated' || raw.probeMode === 'rendered-tab' ? raw.probeMode : 'anonymous',
  };
}

function migrateLegacyResult(raw, url, checkedAt) {
  if (CANONICAL_STATES.has(raw?.state)) return normalizeResult(raw, url);
  if (raw?.status === 'ok') {
    return { state: 'reachable', reason: 'legacy-ok', statusCode: null, finalUrl: url, checkedAt, probeMode: 'anonymous' };
  }
  if (raw?.status === 'broken' || raw?.status === 'warning') {
    return { state: 'content_suspect', reason: 'legacy-unverified', statusCode: null, finalUrl: url, checkedAt, probeMode: 'anonymous' };
  }
  return null;
}

function migrateStoredItem(item, timestamp) {
  if (!item?.bookmark?.id || !item?.bookmark?.url) return null;
  const raw = item.checkResult || (item.status ? { status: item.status } : null);
  const checkResult = migrateLegacyResult(raw, item.bookmark.url, timestamp);
  return checkResult ? { bookmark: item.bookmark, checkResult } : null;
}

function summaryStatus(state) {
  if (state === 'reachable') return 'ok';
  if (state === 'confirmed_missing') return 'broken';
  return CANONICAL_STATES.has(state) ? 'warning' : 'checking';
}

function isSelectable(item) {
  return CANONICAL_STATES.has(item?.checkResult?.state) && item.checkResult.state !== 'reachable';
}

function isReviewItem(item) {
  return isSelectable(item) && summaryStatus(item.checkResult.state) === 'warning';
}

function getReasonText(result) {
  if (result.state === 'checking') return i18n('checkerStatusChecking');
  const key = REASON_I18N_KEYS[result.reason] || 'checkerReasonUnknown';
  const detail = i18n(key);
  const mode = result.probeMode === 'rendered-tab'
    ? i18n('checkerProbeRenderedTab')
    : result.probeMode === 'authenticated' ? i18n('checkerProbeAuthenticated') : '';
  const suffix = [result.statusCode == null ? '' : `HTTP ${result.statusCode}`, mode].filter(Boolean).join(' | ');
  return suffix ? `${detail} | ${suffix}` : detail;
}

function getStateText(state) {
  const keys = {
    reachable: 'checkerStateReachable',
    confirmed_missing: 'checkerStateConfirmedMissing',
    content_suspect: 'checkerStateContentSuspect',
    access_limited: 'checkerStateAccessLimited',
    transient_failure: 'checkerStateTransientFailure',
    unsupported: 'checkerStateUnsupported',
  };
  return i18n(keys[state] || 'checkerReasonUnknown');
}

async function requestProbe(type, url, settings, runId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type,
      url,
      runId,
      options: probeOptions(settings),
    });
    if (!response?.success || !response.result) return fallbackResult(url, 'invalid-response');
    return normalizeResult(response.result, url);
  } catch (_) {
    return fallbackResult(url, 'network-error');
  }
}

async function loadAllBookmarks() {
  const response = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
  return response?.success && Array.isArray(response.bookmarks) ? response.bookmarks : [];
}

function refreshStats() {
  resultStats = { ok: 0, broken: 0, warning: 0 };
  checkedCount = 0;
  for (const item of results) {
    const status = summaryStatus(item.checkResult.state);
    if (status === 'ok' || status === 'broken' || status === 'warning') {
      resultStats[status] += 1;
      checkedCount += 1;
    }
  }
  totalCount = results.length;
}

function selectedItems() {
  return results.filter((item) => selectedResultIds.has(String(item.bookmark.id)) && isSelectable(item));
}

function selectedReviewItems() {
  return results.filter((item) => selectedResultIds.has(String(item.bookmark.id)) && isReviewItem(item));
}

function updateSummary() {
  totalChecked.textContent = String(checkedCount);
  totalOk.textContent = String(resultStats.ok);
  totalBroken.textContent = String(resultStats.broken);
  totalWarning.textContent = String(resultStats.warning);
  selectionCount.textContent = String(selectedItems().length);
  const reviewCount = results.filter(isReviewItem).length;
  const selectedReviewCount = selectedReviewItems().length;
  const hasNonNormal = results.some(isSelectable);
  const isBusy = isChecking || recheckingResultIds.size > 0;
  selectConfirmedBtn.style.display = resultStats.broken ? 'inline-flex' : 'none';
  selectReviewBtn.style.display = reviewCount ? 'inline-flex' : 'none';
  recheckSelectedBtn.style.display = selectedReviewCount ? 'inline-flex' : 'none';
  clearSelectionBtn.style.display = selectedResultIds.size ? 'inline-flex' : 'none';
  deleteSelectedBtn.style.display = hasNonNormal ? 'inline-flex' : 'none';
  recheckSelectionCount.textContent = String(selectedReviewCount);
  selectConfirmedBtn.disabled = isBusy || resultStats.broken === 0;
  selectReviewBtn.disabled = isBusy || reviewCount === 0;
  recheckSelectedBtn.disabled = isBusy || selectedReviewCount === 0;
  clearSelectionBtn.disabled = isBusy || selectedResultIds.size === 0;
  deleteSelectedBtn.disabled = isBusy || selectedItems().length === 0;
}

function updateProgress() {
  const percent = totalCount ? Math.round((checkedCount / totalCount) * 100) : 0;
  progressFill.style.width = `${percent}%`;
  progressText.textContent = `${checkedCount}/${totalCount} (${percent}%)`;
  progressBar.setAttribute('aria-valuenow', String(percent));
  checkerLiveStatus.textContent = i18n('checkerProgressStatus', [String(checkedCount), String(totalCount)]);
}

const STATUS_ICONS = {
  ok: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  broken: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  checking: `<svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
};

function createResultItem(item) {
  const { bookmark, checkResult } = item;
  const status = summaryStatus(checkResult.state);
  const id = String(bookmark.id);
  const selectable = isSelectable(item);
  const row = document.createElement('div');
  row.className = `result-item result-item--${status}${selectedResultIds.has(id) ? ' result-item--selected' : ''}`;
  row.dataset.id = id;
  row.dataset.status = status;
  if (selectable) row.setAttribute('aria-selected', String(selectedResultIds.has(id)));
  row.innerHTML = `
    ${selectable ? `<input class="result-checkbox" type="checkbox" data-action="select" aria-label="${escapeHtml(i18n('checkerSelectBookmark', [bookmark.title || bookmark.url]))}">` : ''}
    <div class="result-status-icon">${STATUS_ICONS[status]}</div>
    <div class="result-info">
      <div class="result-title" title="${escapeHtml(bookmark.title)}">${escapeHtml(bookmark.title || i18n('untitled'))}</div>
      <div class="result-url" title="${escapeHtml(bookmark.url)}">${escapeHtml(bookmark.url)}</div>
      <div class="result-detail"><span class="result-badge result-badge--${status}">${escapeHtml(getStateText(checkResult.state))}</span><span class="result-status-text">${escapeHtml(getReasonText(checkResult))}</span></div>
    </div>
    <div class="result-actions">
      <button class="result-action-btn" type="button" data-action="open" title="${escapeHtml(i18n('openLink'))}" aria-label="${escapeHtml(i18n('openLink'))}"><span aria-hidden="true">&#8599;</span></button>
      ${selectable ? `<button class="result-action-btn" type="button" data-action="recheck" title="${escapeHtml(i18n('checkerRecheck'))}" aria-label="${escapeHtml(i18n('checkerRecheck'))}" ${recheckingResultIds.has(id) || isChecking ? 'disabled' : ''}><span aria-hidden="true">${recheckingResultIds.has(id) ? '...' : '&#8635;'}</span></button>` : ''}
      ${CANONICAL_STATES.has(checkResult.state) ? `<button class="result-action-btn result-action-btn--delete" type="button" data-action="delete" title="${escapeHtml(i18n('delete'))}" aria-label="${escapeHtml(i18n('delete'))}"><span aria-hidden="true">&#128465;</span></button>` : ''}
    </div>`;
  const checkbox = row.querySelector('[data-action="select"]');
  if (checkbox) {
    checkbox.checked = selectedResultIds.has(id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedResultIds.add(id); else selectedResultIds.delete(id);
      row.setAttribute('aria-selected', String(checkbox.checked));
      renderResults();
      updateSummary();
    });
  }
  row.querySelector('[data-action="open"]')?.addEventListener('click', () => chrome.tabs.create({ url: bookmark.url }));
  row.querySelector('[data-action="recheck"]')?.addEventListener('click', () => void recheckItem(item));
  row.querySelector('[data-action="delete"]')?.addEventListener('click', (event) => {
    void deleteSingleBookmark(item, event.currentTarget);
  });
  return row;
}

function renderResults() {
  const filtered = currentFilter === 'all'
    ? results
    : results.filter((item) => summaryStatus(item.checkResult.state) === currentFilter);
  resultList.replaceChildren();
  if (!filtered.length && results.length) {
    const empty = document.createElement('div');
    empty.className = 'state-view';
    empty.textContent = i18n('checkerNoResults');
    resultList.appendChild(empty);
    return;
  }
  filtered.forEach((item) => resultList.appendChild(createResultItem(item)));
}

function scheduleResultsRender() {
  if (resultsRenderTimer !== null || resultsRenderFrame !== null) return;
  resultsRenderTimer = setTimeout(() => {
    resultsRenderTimer = null;
    const flush = () => {
      resultsRenderFrame = null;
      renderResults();
    };
    if (typeof requestAnimationFrame === 'function') {
      resultsRenderFrame = requestAnimationFrame(flush);
    } else {
      resultsRenderFrame = setTimeout(flush, 0);
    }
  }, 100);
}

function updateResultItem(item) {
  const status = summaryStatus(item.checkResult.state);
  if (currentFilter !== 'all' && currentFilter !== status) {
    scheduleResultsRender();
    return;
  }
  const existing = resultList.querySelector(`.result-item[data-id="${CSS.escape(String(item.bookmark.id))}"]`);
  if (existing) existing.replaceWith(createResultItem(item));
  else scheduleResultsRender();
}

async function recheckItem(item) {
  const id = String(item.bookmark.id);
  if (recheckingResultIds.has(id)) return;
  recheckingResultIds.add(id);
  startCheckBtn.disabled = true;
  updateSummary();
  renderResults();
  try {
    const settings = await getCheckSettings();
    const result = await requestProbe('recheckUrlWithSession', item.bookmark.url, settings, Date.now());
    item.checkResult = result;
    if (result.state === 'reachable') selectedResultIds.delete(id);
    refreshStats();
    updateProgress();
    updateSummary();
    renderResults();
    await saveCheckResults({ status: lastResultStatus, source: lastResultSource });
    const toastKey = result.state === 'reachable'
      ? 'checkerRecheckReachable'
      : result.state === 'confirmed_missing' ? 'checkerRecheckMissing' : 'checkerRecheckReview';
    showToast(i18n(toastKey), result.state === 'reachable' ? 'success' : 'info');
  } finally {
    recheckingResultIds.delete(id);
    startCheckBtn.disabled = recheckingResultIds.size > 0;
    updateSummary();
    renderResults();
  }
}

async function recheckSelectedItems() {
  const items = selectedReviewItems();
  if (!items.length || isChecking || checkStarting || recheckingResultIds.size > 0) return;
  checkStarting = true;
  let settings;
  try {
    if (!await requestCheckerPermission()) {
      showToast(i18n('checkerPermissionRequired'), 'info');
      return;
    }
    settings = await getCheckSettings();
  } finally {
    checkStarting = false;
  }

  const runId = `checker-recheck-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let next = 0;
  let completed = 0;
  activeRunId = runId;
  isChecking = true;
  startCheckBtn.style.display = 'none';
  stopCheckBtn.style.display = 'inline-flex';
  updateSummary();
  renderResults();

  const workers = Array.from({ length: Math.min(BATCH_RECHECK_CONCURRENCY, items.length) }, async () => {
    while (isChecking && activeRunId === runId && next < items.length) {
      const item = items[next++];
      const id = String(item.bookmark.id);
      recheckingResultIds.add(id);
      updateResultItem(item);
      try {
        const result = await requestProbe('recheckUrlWithSession', item.bookmark.url, settings, runId);
        if (!isChecking || activeRunId !== runId) return;
        item.checkResult = result;
        completed += 1;
        if (result.state === 'reachable') selectedResultIds.delete(id);
        refreshStats();
        updateProgress();
        updateSummary();
        updateResultItem(item);
      } finally {
        recheckingResultIds.delete(id);
        if (isChecking && activeRunId === runId) {
          updateSummary();
          updateResultItem(item);
        }
      }
    }
  });

  await Promise.all(workers);
  if (!isChecking || activeRunId !== runId) return;
  isChecking = false;
  activeRunId = '';
  startCheckBtn.style.display = 'inline-flex';
  stopCheckBtn.style.display = 'none';
  updateSummary();
  renderResults();
  await saveCheckResults({ status: lastResultStatus, source: lastResultSource });
  showToast(i18n('checkerRecheckSelectedDone', [String(completed)]), 'info');
}

async function requestCheckerPermission() {
  const origins = ['<all_urls>'];
  try {
    if (await chrome.permissions.contains({ origins })) return true;
    // 批量检查不会携带登录态；这里只申请用户主动开始扫描所需的站点访问权限。
    return await chrome.permissions.request({ origins });
  } catch (_) {
    return false;
  }
}

async function startCheck() {
  // checkStarting 是同步守卫：覆盖权限申请与数据加载的 await 窗口，避免连点启动两轮扫描。
  if (isChecking || checkStarting || recheckingResultIds.size > 0) return;
  checkStarting = true;
  let settings;
  let bookmarks;
  try {
    if (!await requestCheckerPermission()) {
      showToast(i18n('checkerPermissionRequired'), 'info');
      return;
    }
    try {
      [settings, bookmarks] = await Promise.all([getCheckSettings(), loadAllBookmarks()]);
    } catch (_) {
      showToast(i18n('checkerReasonNetworkError'), 'error');
      return;
    }
    if (!bookmarks.length) {
      showToast(i18n('checkerNoBookmarks'), 'info');
      return;
    }
  } finally {
    checkStarting = false;
  }

  const runId = `checker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  activeRunId = runId;
  isChecking = true;
  lastResultStatus = 'completed';
  lastResultSource = 'manual';
  results = bookmarks.map((bookmark) => ({ bookmark, checkResult: { state: 'checking' } }));
  selectedResultIds = new Set();
  checkedCount = 0;
  totalCount = results.length;
  resultStats = { ok: 0, broken: 0, warning: 0 };
  startCheckBtn.style.display = 'none';
  stopCheckBtn.style.display = 'inline-flex';
  emptyState.style.display = 'none';
  loadingState.style.display = 'none';
  summaryBar.style.display = 'flex';
  progressBar.style.display = 'block';
  resultList.style.display = 'block';
  renderResults();
  updateProgress();
  updateSummary();

  let next = 0;
  const domainSlots = new Map();
  const domainQueues = new Map();
  const domainFor = (url) => {
    try {
      const parts = new URL(url).hostname.split('.');
      return parts.slice(-2).join('.');
    } catch (_) {
      return url;
    }
  };
  const acquireDomainSlot = (domain) => {
    const current = domainSlots.get(domain) || 0;
    if (current < 2) {
      domainSlots.set(domain, current + 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const queue = domainQueues.get(domain) || [];
      queue.push(resolve);
      domainQueues.set(domain, queue);
    });
  };
  const releaseDomainSlot = (domain) => {
    const queue = domainQueues.get(domain);
    if (queue?.length) {
      queue.shift()();
      return;
    }
    domainSlots.set(domain, Math.max(0, (domainSlots.get(domain) || 1) - 1));
  };
  const workers = Array.from({ length: settings.checkerConcurrency }, async () => {
    while (isChecking && runId === activeRunId && next < results.length) {
      const item = results[next++];
      const domain = domainFor(item.bookmark.url);
      await acquireDomainSlot(domain);
      if (!isChecking || runId !== activeRunId) {
        releaseDomainSlot(domain);
        return;
      }
      let result;
      try {
        result = await requestProbe('checkUrl', item.bookmark.url, settings, runId);
      } finally {
        releaseDomainSlot(domain);
      }
      if (!isChecking || runId !== activeRunId) return;
      item.checkResult = result;
      refreshStats();
      updateProgress();
      updateSummary();
      updateResultItem(item);
    }
  });
  await Promise.all(workers);
  if (!isChecking || runId !== activeRunId) return;
  isChecking = false;
  startCheckBtn.style.display = 'inline-flex';
  stopCheckBtn.style.display = 'none';
  updateSummary();
  renderResults();
  await saveCheckResults({ status: 'completed', source: 'manual' });
  if (resultStats.warning) showToast(i18n('checkerDoneReview', [String(resultStats.warning)]), 'info');
  else if (resultStats.broken) showToast(i18n('checkerDoneBroken', [String(resultStats.broken)]), 'error');
  else showToast(i18n('checkerDoneAllOk'), 'success');
}

function stopCheck() {
  if (!isChecking) return;
  const runId = activeRunId;
  activeRunId = '';
  isChecking = false;
  chrome.runtime.sendMessage({ type: 'cancelLinkCheckRun', runId }).catch(() => {});
  for (const item of results) {
    if (item.checkResult.state === 'checking') item.checkResult = fallbackResult(item.bookmark.url, 'aborted');
  }
  refreshStats();
  updateProgress();
  updateSummary();
  scheduleResultsRender();
  startCheckBtn.style.display = 'inline-flex';
  stopCheckBtn.style.display = 'none';
  void saveCheckResults({ status: 'cancelled', source: 'manual' });
  showToast(i18n('checkerStopped'), 'info');
}

function openDeleteConfirmation(items = selectedItems(), trigger = document.activeElement) {
  pendingDeleteItems = items.filter(isSelectable);
  const confirmed = pendingDeleteItems.filter((item) => item.checkResult.state === 'confirmed_missing').length;
  const pending = pendingDeleteItems.length - confirmed;
  if (!pendingDeleteItems.length) return;
  deleteConfirmSummary.textContent = i18n('checkerDeleteSummary', [String(confirmed), String(pending)]);
  manualConfirmRow.hidden = pending === 0;
  manualConfirmCheckbox.checked = false;
  confirmDeleteBtn.disabled = pending > 0;
  deleteDialogReturnFocus = trigger instanceof HTMLElement ? trigger : null;
  deleteConfirmOverlay.hidden = false;
  deleteConfirmDialog.focus();
}

function closeDeleteConfirmation() {
  if (isDeleting) return;
  deleteConfirmOverlay.hidden = true;
  pendingDeleteItems = [];
  deleteDialogReturnFocus?.focus();
  deleteDialogReturnFocus = null;
}

async function deleteSingleBookmark(item, trigger) {
  if (isSelectable(item)) {
    selectedResultIds = new Set([String(item.bookmark.id)]);
    renderResults();
    updateSummary();
    openDeleteConfirmation([item], trigger);
    return;
  }
  if (!confirm(i18n('checkerConfirmDeleteSingle') || '确认删除此书签？删除后可在“最近删除”中恢复。')) return;
  await deleteBookmarkItems([item]);
}

async function deleteSelected() {
  const selected = [...pendingDeleteItems];
  const pending = selected.filter((item) => item.checkResult.state !== 'confirmed_missing').length;
  if (pending && !manualConfirmCheckbox.checked) return;
  isDeleting = true;
  confirmDeleteBtn.disabled = true;
  try {
    await deleteBookmarkItems(selected);
  } finally {
    isDeleting = false;
    closeDeleteConfirmation();
  }
}

async function deleteBookmarkItems(items) {
  const ids = new Set();
  for (const item of items) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'deleteBookmark', id: item.bookmark.id, url: item.bookmark.url });
      if (response?.success) ids.add(String(item.bookmark.id));
    } catch (_) {}
  }
  results = results.filter((item) => !ids.has(String(item.bookmark.id)));
  selectedResultIds = new Set();
  refreshStats();
  renderResults();
  updateProgress();
  updateSummary();
  await saveCheckResults({ status: lastResultStatus, source: lastResultSource });
  showToast(
    ids.size ? i18n('checkerDeletedCount', [String(ids.size)]) : i18n('deleteFailed'),
    ids.size ? 'success' : 'error',
  );
}

async function saveCheckResults({ status = lastResultStatus, source = lastResultSource } = {}) {
  const completed = resultStats.ok + resultStats.broken + resultStats.warning;
  lastResultStatus = status;
  lastResultSource = source;
  await chrome.storage.local.set({
    checkerLastResult: {
      version: RESULT_VERSION,
      timestamp: Date.now(),
      source,
      status,
      counts: {
        total: results.length,
        completed,
        pending: Math.max(0, results.length - completed),
        normal: resultStats.ok,
        confirmedMissing: resultStats.broken,
        needsReview: resultStats.warning,
      },
      results: results.map(({ bookmark, checkResult }) => ({
        bookmark: { ...bookmark },
        checkResult: { ...checkResult },
      })),
    },
  });
}

async function loadLastResults() {
  const data = await chrome.storage.local.get('checkerLastResult');
  const last = data.checkerLastResult;
  if (!last || !Array.isArray(last.results) || last.results.length === 0) return;
  const checkedAt = Number.isFinite(Number(last.timestamp)) ? Number(last.timestamp) : Date.now();
  results = last.results
    .map((item) => migrateStoredItem(item, checkedAt))
    .filter(Boolean);
  if (!results.length) return;
  lastResultStatus = typeof last.status === 'string' ? last.status : 'completed';
  lastResultSource = typeof last.source === 'string' ? last.source : 'legacy';
  refreshStats();
  summaryBar.style.display = 'flex';
  progressBar.style.display = 'block';
  resultList.style.display = 'block';
  emptyState.style.display = 'none';
  updateProgress();
  updateSummary();
  renderResults();
  if (last.version !== RESULT_VERSION || !last.counts || !last.source) {
    await saveCheckResults({ status: lastResultStatus, source: lastResultSource });
  }
}

document.querySelectorAll('.filter-btn').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    currentFilter = button.dataset.filter || 'all';
    renderResults();
  });
});

selectConfirmedBtn.addEventListener('click', () => {
  selectedResultIds = new Set(results.filter((item) => item.checkResult.state === 'confirmed_missing').map((item) => String(item.bookmark.id)));
  renderResults();
  updateSummary();
});
selectReviewBtn.addEventListener('click', () => {
  selectedResultIds = new Set(results.filter(isReviewItem).map((item) => String(item.bookmark.id)));
  renderResults();
  updateSummary();
});
recheckSelectedBtn.addEventListener('click', () => void recheckSelectedItems());
clearSelectionBtn.addEventListener('click', () => {
  selectedResultIds = new Set();
  renderResults();
  updateSummary();
});
deleteSelectedBtn.addEventListener('click', () => openDeleteConfirmation());
cancelDeleteBtn.addEventListener('click', closeDeleteConfirmation);
manualConfirmCheckbox.addEventListener('change', () => {
  const pending = pendingDeleteItems.some((item) => item.checkResult.state !== 'confirmed_missing');
  confirmDeleteBtn.disabled = pending && !manualConfirmCheckbox.checked;
});
confirmDeleteBtn.addEventListener('click', () => void deleteSelected());
deleteConfirmOverlay.addEventListener('click', (event) => {
  if (event.target === deleteConfirmOverlay) closeDeleteConfirmation();
});
deleteConfirmDialog.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDeleteConfirmation();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...deleteConfirmDialog.querySelectorAll('button:not([disabled]), input:not([disabled]):not([hidden])')]
    .filter((element) => !element.closest('[hidden]'));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || document.activeElement === deleteConfirmDialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
startCheckBtn.addEventListener('click', startCheck);
stopCheckBtn.addEventListener('click', stopCheck);
backBtn.addEventListener('click', () => window.history.length > 1 ? history.back() : openExtensionPage('pages/standalone/standalone.html'));
workspaceBtn?.addEventListener('click', () => openExtensionPage('pages/standalone/standalone.html'));
aiClassifyBtn?.addEventListener('click', openAiClassifyPanel);
bookmarkNavBtn?.addEventListener('click', () => openExtensionPage('ai/bookmark-nav.html'));
checkerBtn?.addEventListener('click', () => {});
graphBtn?.addEventListener('click', () => openExtensionPage('pages/graph/graph.html'));
settingsBtn?.addEventListener('click', () => openExtensionPage('pages/settings/settings.html'));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.theme) applyTheme(changes.theme.newValue || 'system');
  if (area === 'local' && changes.language && results.length) setTimeout(renderResults, 0);
});

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([initI18n(), loadTheme()]);
  await loadLastResults();
});
