// ===== DOM 引用 =====
const backBtn = document.getElementById('backBtn');
const workspaceBtn = document.getElementById('workspaceBtn');
const aiClassifyBtn = document.getElementById('aiClassifyBtn');
const bookmarkNavBtn = document.getElementById('bookmarkNavBtn');
const checkerBtn = document.getElementById('checkerBtn');
const graphBtn = document.getElementById('graphBtn');
const settingsBtn = document.getElementById('settingsBtn');
const startCheckBtn = document.getElementById('startCheckBtn');
const stopCheckBtn = document.getElementById('stopCheckBtn');
const deleteAllBrokenBtn = document.getElementById('deleteAllBrokenBtn');
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

// ===== 状态 =====
let results = [];
let isChecking = false;
let abortController = null;
let currentFilter = 'all';
let checkQueue = [];
let checkedCount = 0;
let totalCount = 0;

function openExtensionPage(path) {
  return window.AIBookmarkPageRouter?.openOrFocusExtensionPage(path)
    ?? chrome.tabs.create({ url: chrome.runtime.getURL(path) });
}

async function openAiClassifyPanel() {
  try {
    if (chrome.sidePanel?.setOptions) {
      await chrome.sidePanel.setOptions({ path: 'ai/sidepanel.html', enabled: true });
    }
    const win = await chrome.windows.getCurrent();
    if (chrome.sidePanel?.open && win?.id != null) {
      await chrome.sidePanel.open({ windowId: win.id });
      return;
    }
  } catch (err) {
    console.warn('sidePanel open failed, fallback', err);
  }
  await openExtensionPage('ai/sidepanel.html');
}

// ===== Toast =====
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 2500);
}

// ===== 主题 =====
function applyTheme(theme) {
  document.body.classList.remove('theme-light', 'theme-dark');
  if (theme === 'light') document.body.classList.add('theme-light');
  else if (theme === 'dark') document.body.classList.add('theme-dark');
}

async function loadTheme() {
  const result = await chrome.storage.local.get('theme');
  applyTheme(result.theme || 'system');
}

// ===== 工具函数 =====
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function extractDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// ===== 状态图标 SVG =====
const STATUS_ICONS = {
  ok: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  broken: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  checking: `<svg class="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`
};

// ===== 链接检测核心逻辑 - 通过 background 绕过 CORS =====
async function checkUrl(url, timeoutMs) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'checkUrl',
      url,
      timeout: timeoutMs
    });

    if (response && response.success && response.result) {
      const result = response.result;
      // 将后台英文消息转换为国际化消息
      return localizeCheckResult(result);
    }

    return { status: 'warning', statusCode: 0, message: i18n('checkerErrNetwork') };
  } catch (err) {
    return { status: 'warning', statusCode: 0, message: i18n('checkerErrNetwork') };
  }
}

function localizeCheckResult(result) {
  const msg = result.message || '';
  const statusCode = Number(result.statusCode) || 0;

  if (result.status === 'ok') {
    return { ...result, message: i18n('checkerMsgOk') };
  }

  if (result.status === 'broken') {
    if (statusCode === 404 || statusCode === 410 || msg.includes('Not Found')) {
      return { ...result, message: i18n('checkerErr404') };
    }
    return { ...result, message: i18n('checkerErrNetwork') };
  }

  if (result.status === 'warning') {
    if (msg.includes('Unconfirmed HTTP') || msg.includes('usable or inconclusive')) {
      return { ...result, message: i18n('checkerUnconfirmed') || '页面可访问或内容无法确认，请手动核实。' };
    }
    if (msg.includes('Timeout')) {
      return { ...result, message: i18n('checkerErrTimeout') };
    }
    if (msg.includes('Access Restricted')) {
      return { ...result, message: i18n('checkerClientError') };
    }
    if (msg.includes('Server Error')) {
      return { ...result, message: i18n('checkerServerError') };
    }
    return { ...result, message: i18n('checkerErrNetwork') };
  }

  return result;
}

// ===== 加载设置 =====
async function getCheckSettings() {
  const defaults = {
    checkerTimeout: 10000,
    checkerFrequency: 'never',
    checkerConcurrency: 5
  };
  const result = await chrome.storage.local.get(Object.keys(defaults));
  return { ...defaults, ...result };
}

// ===== 加载书签 =====
async function loadAllBookmarks() {
  const result = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
  if (result && result.success) {
    return result.bookmarks || [];
  }
  return [];
}

// ===== 更新摘要 =====
function updateSummary() {
  const okCount = results.filter(r => r.checkResult.status === 'ok').length;
  const brokenCount = results.filter(r => r.checkResult.status === 'broken').length;
  const warningCount = results.filter(r => r.checkResult.status === 'warning').length;

  totalChecked.textContent = results.length;
  totalOk.textContent = okCount;
  totalBroken.textContent = brokenCount;
  totalWarning.textContent = warningCount;

  // 显示/隐藏一键删除按钮
  deleteAllBrokenBtn.style.display = brokenCount > 0 ? 'inline-flex' : 'none';
}

// ===== 更新进度 =====
function updateProgress() {
  if (totalCount === 0) return;
  const pct = Math.round((checkedCount / totalCount) * 100);
  progressFill.style.width = pct + '%';
  progressText.textContent = `${checkedCount}/${totalCount} (${pct}%)`;
}

// ===== 渲染单个结果项 =====
function createResultItem(item) {
  const { bookmark, checkResult } = item;
  const statusClass = checkResult.status;
  const domain = extractDomain(bookmark.url);

  const div = document.createElement('div');
  div.className = `result-item result-item--${statusClass}`;
  div.dataset.id = bookmark.id;
  div.dataset.status = statusClass;

  div.innerHTML = `
    <div class="result-status-icon">${STATUS_ICONS[statusClass]}</div>
    <div class="result-info">
      <div class="result-title" title="${escapeHtml(bookmark.title)}">${escapeHtml(bookmark.title) || '<span style="color:var(--text-disabled)">' + escapeHtml(i18n('untitled')) + '</span>'}</div>
      <div class="result-url" title="${escapeHtml(bookmark.url)}">${escapeHtml(bookmark.url)}</div>
      <div class="result-detail">
        <span class="result-badge result-badge--${statusClass}">${getStatusLabel(statusClass)}</span>
        <span class="result-status-text">${escapeHtml(checkResult.message)}</span>
      </div>
    </div>
    <div class="result-actions">
      <button class="result-action-btn" title="${escapeHtml(i18n('openLink'))}" data-action="open">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
      <button class="result-action-btn result-action-btn--delete" title="${escapeHtml(i18n('delete'))}" data-action="delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  `;

  // 绑定事件
  const openBtn = div.querySelector('[data-action="open"]');
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.tabs.create({ url: bookmark.url });
  });

  const deleteBtn = div.querySelector('[data-action="delete"]');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteSingleBookmark(bookmark.id, bookmark.url, div);
  });

  return div;
}

function getStatusLabel(status) {
  switch (status) {
    case 'ok': return i18n('checkerStatusOk');
    case 'broken': return i18n('checkerStatusBroken');
    case 'warning': return i18n('checkerStatusWarning');
    case 'checking': return i18n('checkerStatusChecking');
    default: return status;
  }
}

// ===== 渲染结果列表 =====
function renderResults() {
  const filtered = currentFilter === 'all'
    ? results
    : results.filter(r => r.checkResult.status === currentFilter);

  resultList.innerHTML = '';

  if (filtered.length === 0 && results.length > 0) {
    resultList.innerHTML = `
      <div class="state-view" style="padding:40px;">
        <p class="state-title">${i18n('checkerNoResults')}</p>
      </div>
    `;
    return;
  }

  for (const item of filtered) {
    resultList.appendChild(createResultItem(item));
  }
}

// ===== 开始检测 =====
async function startCheck() {
  if (isChecking) return;

  isChecking = true;
  abortController = new AbortController();
  results = [];
  checkedCount = 0;

  startCheckBtn.style.display = 'none';
  stopCheckBtn.style.display = 'inline-flex';
  emptyState.style.display = 'none';
  loadingState.style.display = 'flex';
  resultList.style.display = 'none';
  summaryBar.style.display = 'flex';
  progressBar.style.display = 'block';
  deleteAllBrokenBtn.style.display = 'none';

  // 加载书签
  const bookmarks = await loadAllBookmarks();
  totalCount = bookmarks.length;

  if (totalCount === 0) {
    isChecking = false;
    startCheckBtn.style.display = 'inline-flex';
    stopCheckBtn.style.display = 'none';
    loadingState.style.display = 'none';
    emptyState.style.display = 'flex';
    progressBar.style.display = 'none';
    showToast(i18n('checkerNoBookmarks'), 'error');
    return;
  }

  loadingState.style.display = 'none';
  resultList.style.display = 'block';

  // 加载设置
  const settings = await getCheckSettings();
  const concurrency = settings.checkerConcurrency || 5;
  const timeout = settings.checkerTimeout || 10000;

  // 初始化结果列表（checking 状态）
  for (const bm of bookmarks) {
    results.push({
      bookmark: bm,
      checkResult: { status: 'checking', statusCode: 0, message: i18n('checkerStatusChecking') }
    });
  }
  renderResults();
  updateProgress();

  // 并发检测
  let index = 0;

  async function processNext() {
    while (index < results.length && isChecking) {
      const currentIndex = index++;
      const item = results[currentIndex];

      try {
        const checkResult = await checkUrl(item.bookmark.url, timeout);
        item.checkResult = checkResult;
      } catch (err) {
        item.checkResult = { status: 'warning', statusCode: 0, message: i18n('checkerErrNetwork') };
      }

      checkedCount++;
      updateProgress();
      updateSummary();

      // 更新单个项的显示
      renderResults();
    }
  }

  // 启动并发工作线程
  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(processNext());
  }

  await Promise.all(workers);

  isChecking = false;
  startCheckBtn.style.display = 'inline-flex';
  stopCheckBtn.style.display = 'none';

  const brokenCount = results.filter(r => r.checkResult.status === 'broken').length;
  if (brokenCount > 0) {
    showToast(i18n('checkerDoneBroken', [String(brokenCount)]), 'error');
  } else {
    showToast(i18n('checkerDoneAllOk'), 'success');
  }

  // 保存检测结果
  await saveCheckResults();
}

// ===== 停止检测 =====
function stopCheck() {
  isChecking = false;
  startCheckBtn.style.display = 'inline-flex';
  stopCheckBtn.style.display = 'none';
  showToast(i18n('checkerStopped'), 'info');
}

// ===== 删除单个书签 =====
async function deleteSingleBookmark(id, url, element) {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'deleteBookmark', id, url });
    if (result && result.success) {
      element.style.transition = 'all 200ms ease';
      element.style.opacity = '0';
      element.style.transform = 'translateX(-20px)';
      setTimeout(() => {
        results = results.filter(r => r.bookmark.id !== id || r.bookmark.url !== url);
        element.remove();
        updateSummary();
        if (results.length === 0) {
          resultList.style.display = 'none';
          emptyState.style.display = 'flex';
        }
      }, 200);
      showToast(i18n('deleted'), 'success');
    } else {
      showToast(i18n('deleteFailed'), 'error');
    }
  } catch (err) {
    showToast(i18n('deleteFailed'), 'error');
  }
}

// ===== 一键删除所有失效书签 =====
async function deleteAllBroken() {
  const brokenItems = results.filter(r => r.checkResult.status === 'broken');
  if (brokenItems.length === 0) return;

  if (!confirm(i18n('checkerConfirmDeleteAll', [String(brokenItems.length)]))) return;

  let deleted = 0;
  const deletedIds = new Set();
  for (const item of brokenItems) {
    try {
      const result = await chrome.runtime.sendMessage({ action: 'deleteBookmark', id: item.bookmark.id, url: item.bookmark.url });
      if (result?.success) {
        deleted++;
        deletedIds.add(item.bookmark.id);
      }
    } catch (err) {
      console.error('删除失败:', item.bookmark.url, err);
    }
  }

  results = results.filter(r => r.checkResult.status !== 'broken' || !deletedIds.has(r.bookmark.id));
  renderResults();
  updateSummary();

  showToast(i18n('checkerDeletedCount', [String(deleted)]), 'success');

  if (results.length === 0) {
    resultList.style.display = 'none';
    emptyState.style.display = 'flex';
    summaryBar.style.display = 'none';
    progressBar.style.display = 'none';
  }
}

// ===== 保存检测结果 =====
async function saveCheckResults() {
  const summary = {
    timestamp: Date.now(),
    total: results.length,
    ok: results.filter(r => r.checkResult.status === 'ok').length,
    broken: results.filter(r => r.checkResult.status === 'broken').length,
    warning: results.filter(r => r.checkResult.status === 'warning').length,
    brokenUrls: results.filter(r => r.checkResult.status === 'broken').map(r => ({
      id: r.bookmark.id,
      title: r.bookmark.title,
      url: r.bookmark.url,
      message: r.checkResult.message
    }))
  };
  await chrome.storage.local.set({ checkerLastResult: summary });
}

// ===== 加载上次检测结果 =====
async function loadLastResults() {
  const data = await chrome.storage.local.get('checkerLastResult');
  if (data.checkerLastResult) {
    // 显示上次结果的摘要信息（不恢复完整列表）
    const last = data.checkerLastResult;
    if (last.brokenUrls && last.brokenUrls.length > 0) {
      // 可以在这里显示提示
    }
  }
}

// ===== 筛选 =====
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    if (results.length > 0) renderResults();
  });
});

// ===== 事件绑定 =====
backBtn.addEventListener('click', () => {
  if (window.history.length > 1) history.back();
  else openExtensionPage('pages/standalone/standalone.html');
});

workspaceBtn?.addEventListener('click', () => openExtensionPage('pages/standalone/standalone.html'));
aiClassifyBtn?.addEventListener('click', openAiClassifyPanel);
bookmarkNavBtn?.addEventListener('click', () => openExtensionPage('ai/bookmark-nav.html'));
checkerBtn?.addEventListener('click', () => {});
graphBtn?.addEventListener('click', () => openExtensionPage('pages/graph/graph.html'));
settingsBtn?.addEventListener('click', () => openExtensionPage('pages/settings/settings.html'));

startCheckBtn.addEventListener('click', startCheck);
stopCheckBtn.addEventListener('click', stopCheck);
deleteAllBrokenBtn.addEventListener('click', deleteAllBroken);

// ===== 监听存储变化 =====
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.theme) {
    applyTheme(changes.theme.newValue || 'system');
  }
});

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  initI18n();
  loadTheme();
  loadLastResults();
});
