// ===== AI Bookmark OS Standalone Window =====
// 独立窗口核心逻辑：文件夹树、多视图、拖拽排序、搜索、CRUD

// ===== DOM 引用 =====
const $ = (id) => document.getElementById(id);
const saBookmarkCount = $('saBookmarkCount');
const saSidebar = $('saSidebar');
const saSidebarToggle = $('saSidebarToggle');
const saSidebarResize = $('saSidebarResize');
const saFolderTree = $('saFolderTree');
const saTagFilter = $('saTagFilter');
const saTagAllCount = $('saTagAllCount');
const saContent = $('saContent');
const saTimelineView = $('saTimelineView');
const saGridView = $('saGridView');
const saListView = $('saListView');
const saLoading = $('saLoading');
const saEmpty = $('saEmpty');
const saSearchEmpty = $('saSearchEmpty');
const saSearchInput = $('saSearchInput');
const saSearchClear = $('saSearchClear');
const saSyncBtn = $('saSyncBtn');
const saSortBtn = $('saSortBtn');
const saSortDropdown = $('saSortDropdown');
const saPaletteBtn = $('saPaletteBtn');
const saToastContainer = $('saToastContainer');
const saStatusText = $('saStatusText');
const saStatusFolder = $('saStatusFolder');

// 侧栏 Tab 切换 DOM
const saSidebarTabs = $('saSidebarTabs');
const saSidebarBookmarks = $('saSidebarBookmarks');
const saSidebarRss = $('saSidebarRss');
const saRssUnreadCount = $('saRssUnreadCount');

// 编辑弹窗
const saEditModal = $('saEditModal');
const saEditTitle = $('saEditTitle');
const saEditUrl = $('saEditUrl');
const saEditTagsList = $('saEditTagsList');
const saEditTagInput = $('saEditTagInput');
const saEditTagSuggestions = $('saEditTagSuggestions');
const saEditFolderSelector = $('saEditFolderSelector');
const saEditFolderPath = $('saEditFolderPath');
const saEditFolderTree = $('saEditFolderTree');
const saEditFolderTreeInner = $('saEditFolderTreeInner');
const saEditSave = $('saEditSave');
const saEditCancel = $('saEditCancel');
const saEditModalClose = $('saEditModalClose');

// 命令面板
const saPaletteModal = $('saPaletteModal');
const saPaletteInput = $('saPaletteInput');
const saPaletteResults = $('saPaletteResults');

// 批量打标签
const saBulkTagModal = $('saBulkTagModal');
const saBulkTagInput = $('saBulkTagInput');
const saBulkTagAdd = $('saBulkTagAdd');
const saBulkTagCancel = $('saBulkTagCancel');
const saBulkTagClose = $('saBulkTagClose');
const saBulkTagSuggestions = $('saBulkTagSuggestions');

// ===== 状态 =====
let allBookmarks = [];
let currentFilter = '';
let selectedTags = new Set();
let allTags = new Map();
let sortMode = 'newest';
let currentViewMode = 'timeline';
let selectedFolderId = null;
let folderTreeData = null;
let folderIdSet = new Set();
let expandedFolderIds = new Set(); // 记录已展开的文件夹 ID
let duplicateIds = new Set();
let bulkMode = false;
let selectedIds = new Set();
let dragState = null;
let currentTab = 'bookmarks'; // 'bookmarks' | 'rss'

// MDI 多窗口
let mdiManager = null;
let mdiWindowEnabled = false;

// 分页
const PAGE_SIZE = 80;
let renderQueue = [];
let renderedCount = 0;
let isLoadingMore = false;
let currentGroupLabel = '';
let currentHighlightRanges = null;

// 命令面板
let paletteOpen = false;
let paletteSelectedIdx = 0;
let paletteItems = [];

// 编辑状态
let editingBookmarkId = null;
let editingTags = [];
let editingFolderId = null;

// ===== SVG 图标 =====
const SVG_OPEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const SVG_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const SVG_DELETE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const SVG_PIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const SVG_PIN_FILL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const SVG_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const SVG_MORE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';
const SVG_FOLDER = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
const SVG_FOLDER_OPEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1"/><path d="M5 19h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2z"/></svg>';
const SVG_CHEVRON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
const SVG_WINDOW = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';

const DEFAULT_FAVICON = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%239aa0a6%22><path d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z%22/></svg>';

const FAVICON_FALLBACKS = [
  (hostname) => `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
  (hostname) => `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
];

// ===== Toast =====
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `sa-toast sa-toast--${type}`;
  toast.textContent = message;
  saToastContainer.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 2500);
}

// ===== 工具函数 =====
function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const tracking = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref', 'ref_src'];
    tracking.forEach(p => u.searchParams.delete(p));
    return (u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '')).toLowerCase();
  } catch { return url.toLowerCase(); }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function handleFaviconError(img) {
  const hostname = img.dataset.hostname;
  const idx = parseInt(img.dataset.fallbackIdx || '0', 10);
  if (idx < FAVICON_FALLBACKS.length) {
    img.dataset.fallbackIdx = String(idx + 1);
    img.src = FAVICON_FALLBACKS[idx](hostname);
  } else {
    img.onerror = null;
    img.src = DEFAULT_FAVICON;
  }
}

function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return i18n('justNow');
  if (minutes < 60) return i18n('minutesAgo', [String(minutes)]);
  if (hours < 24) return i18n('hoursAgo', [String(hours)]);
  if (days < 7) return i18n('daysAgo', [String(days)]);

  const d = new Date(timestamp);
  const monthLabel = i18n('month' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]);
  const day = d.getDate();
  const year = d.getFullYear();
  const currentYear = new Date().getFullYear();
  const hours24 = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');

  if (year === currentYear) return i18n('dateSameYear', [monthLabel, String(day)]) + ` ${hours24}:${mins}`;
  return i18n('dateWithYear', [monthLabel, String(day), String(year)]) + ` ${hours24}:${mins}`;
}

function getDateGroupLabel(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today - target) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return i18n('today');
  if (diffDays === 1) return i18n('yesterday');
  if (diffDays < 7) return i18n('daysAgo', [String(diffDays)]);

  const year = date.getFullYear();
  const monthLabel = i18n('month' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getMonth()]);
  const day = date.getDate();
  if (year === now.getFullYear()) return i18n('dateSameYear', [monthLabel, String(day)]);
  return i18n('dateWithYear', [monthLabel, String(day), String(year)]);
}

// 热力颜色
function getHeatColor(clickCount) {
  const c = clickCount || 0;
  if (c === 0) return null;
  const t = Math.min(c / 100, 1);
  const h = 30 - t * 5;
  const s = 65 + t * 30;
  const l = 96 - t * 54;
  return `hsl(${h}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

function getHeatLevel(clickCount) {
  const c = clickCount || 0;
  if (c === 0) return 0;
  if (c <= 3) return 1;
  if (c <= 10) return 2;
  if (c <= 25) return 3;
  if (c <= 50) return 4;
  return 5;
}

function getHeatDotColor(level) {
  return ['', '#fda55a', '#f58a3a', '#e06d20', '#c4550f', '#a83c00'][level] || '';
}

// ===== 搜索 =====
function fuzzyMatch(query, text) {
  if (!query) return { score: 1, matched: false, ranges: [] };
  const q = query.toLowerCase();
  const t = (text || '').toLowerCase();
  if (t.includes(q)) {
    return { score: 100 + (q.length / t.length) * 10, matched: true, ranges: [[t.indexOf(q), t.indexOf(q) + q.length]] };
  }
  let qi = 0;
  const ranges = [];
  let rangeStart = -1;
  let score = 0;
  let lastMatchIdx = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (i === lastMatchIdx + 1) {
        score += 5;
        if (rangeStart >= 0) ranges[ranges.length - 1][1] = i + 1;
      } else {
        score += 1;
        rangeStart = i;
        ranges.push([i, i + 1]);
      }
      if (i === 0 || t[i - 1] === ' ' || t[i - 1] === '/' || t[i - 1] === '.') score += 3;
      lastMatchIdx = i;
      qi++;
    }
  }
  if (qi < q.length) return { score: 0, matched: false, ranges: [] };
  return { score, matched: true, ranges };
}

function highlightText(text, ranges) {
  if (!text || !ranges || ranges.length === 0) return escapeHtml(text);
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let html = '';
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start < cursor) continue;
    if (cursor < start) html += escapeHtml(text.slice(cursor, start));
    html += `<mark class="sa-hl">${escapeHtml(text.slice(start, end))}</mark>`;
    cursor = end;
  }
  if (cursor < text.length) html += escapeHtml(text.slice(cursor));
  return html;
}

function smartSearch(query, list) {
  if (!query) return list.map(item => ({ item, ranges: {} }));
  const q = query.trim();
  if (!q) return list.map(item => ({ item, ranges: {} }));
  const tokens = q.split(/\s+/).filter(Boolean);
  const results = [];
  for (const item of list) {
    const fields = [
      { text: item.title || '', weight: 100, key: 'title' },
      { text: item.url || '', weight: 40, key: 'url' },
      { text: item.domain || '', weight: 30, key: 'domain' },
      { text: item.folderPath || item.folderName || '', weight: 20, key: 'folder' },
      { text: (item.tags || []).join(' '), weight: 60, key: 'tags' }
    ];
    let totalScore = 0;
    let allMatched = true;
    const ranges = { title: [], url: [], domain: [], folder: [], tags: [] };
    for (const tok of tokens) {
      let bestField = null;
      for (const f of fields) {
        const r = fuzzyMatch(tok, f.text);
        if (r.matched) {
          const s = r.score * f.weight;
          if (!bestField || s > bestField.score) bestField = { ...r, score: s, key: f.key };
        }
      }
      if (!bestField) { allMatched = false; break; }
      totalScore += bestField.score;
      ranges[bestField.key].push(...bestField.ranges);
    }
    if (allMatched && totalScore > 0) results.push({ item, score: totalScore, ranges });
  }
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ===== 重复检测 =====
function computeDuplicates(list) {
  const groups = new Map();
  for (const item of list) {
    if (!item.url) continue;
    const key = normalizeUrl(item.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item.id);
  }
  const dupIds = new Set();
  for (const ids of groups.values()) {
    if (ids.length > 1) ids.forEach(id => dupIds.add(id));
  }
  return dupIds;
}

// ===== 数据通信 =====
async function fetchBookmarks() {
  const res = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
  if (res && res.success) return res.bookmarks || res.data || [];
  return [];
}

async function refreshBookmarkData({ keepFilter = true } = {}) {
  await chrome.runtime.sendMessage({ action: 'refreshClickCounts' }).catch(() => {});
  const bookmarks = await fetchBookmarks();
  allBookmarks = bookmarks;
  duplicateIds = computeDuplicates(allBookmarks);
  await collectAllTags();
  renderTagFilter();
  filterBookmarks(saSearchInput.value);
}

async function syncAll() {
  saSyncBtn.classList.add('spinning');
  try {
    const res = await chrome.runtime.sendMessage({ action: 'syncAll' });
    if (res && res.success) {
      const count = res.added || 0;
      const total = res.total || 0;
      showToast(count > 0 ? i18n('syncSuccessNew', [String(count)]) : i18n('syncSuccessTotal', [String(total)]), 'success');
      await refreshBookmarkData({ keepFilter: true });
    } else {
      showToast(i18n('syncFailed'), 'error');
    }
  } catch (e) {
    showToast(i18n('syncFailedRetry'), 'error');
  } finally {
    saSyncBtn.classList.remove('spinning');
  }
}

async function deleteBookmark(id, url) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'deleteBookmark', id, url });
    if (res && res.success) {
      showToast(i18n('deleted'), 'success');
      await refreshBookmarkData();
    } else {
      showToast(i18n('deleteFailed'), 'error');
    }
  } catch { showToast(i18n('deleteFailed'), 'error'); }
}

async function togglePin(id) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'togglePin', id });
    if (res && res.success) {
      showToast(i18n('toggledPin'), 'success');
      await refreshBookmarkData();
    } else {
      showToast(i18n('saveFailed'), 'error');
    }
  } catch { showToast(i18n('saveFailed'), 'error'); }
}

async function updateBookmark(id, changes) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'updateBookmark', id, ...changes });
    if (res && res.success) {
      await refreshBookmarkData();
      return true;
    } else {
      showToast(i18n('editFailed'), 'error');
      return false;
    }
  } catch {
    showToast(i18n('editFailed'), 'error');
    return false;
  }
}

// ===== 标签系统 =====
async function getTagColor(tag) {
  if (typeof SmartTagger !== 'undefined' && SmartTagger.getTagColor) {
    return SmartTagger.getTagColor(tag);
  }
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

async function collectAllTags() {
  allTags.clear();
  for (const item of allBookmarks) {
    if (item.tags && item.tags.length > 0) {
      for (const tag of item.tags) {
        if (!allTags.has(tag)) {
          const color = await getTagColor(tag);
          allTags.set(tag, { count: 0, color });
        }
        allTags.get(tag).count++;
      }
    }
  }
}

function renderTagFilter() {
  const allBtn = saTagFilter.querySelector('[data-tag="__all__"]');
  saTagFilter.innerHTML = '';
  saTagFilter.appendChild(allBtn);
  saTagAllCount.textContent = allBookmarks.length;

  const sortedTags = Array.from(allTags.entries()).sort((a, b) => b[1].count - a[1].count);
  for (const [tagName, { count, color }] of sortedTags) {
    const chip = document.createElement('button');
    chip.className = 'sa-tag-chip';
    chip.dataset.tag = tagName;
    if (selectedTags.has(tagName)) chip.classList.add('active');
    chip.innerHTML = `
      <span class="sa-tag-chip-color" style="background: ${color}"></span>
      <span class="sa-tag-chip-label">${escapeHtml(tagName)}</span>
      <span class="sa-tag-chip-count">${count}</span>
    `;
    saTagFilter.appendChild(chip);
  }
}

function filterByTags(bookmarks) {
  if (selectedTags.size === 0) return bookmarks;
  return bookmarks.filter(item => {
    if (!item.tags || item.tags.length === 0) return false;
    return item.tags.some(tag => selectedTags.has(tag));
  });
}

saTagFilter.addEventListener('click', (e) => {
  const chip = e.target.closest('.sa-tag-chip');
  if (!chip) return;
  const tag = chip.dataset.tag;
  if (tag === '__all__') {
    selectedTags.clear();
  } else {
    if (selectedTags.has(tag)) selectedTags.delete(tag);
    else selectedTags.add(tag);
  }
  renderTagFilter();
  filterBookmarks(saSearchInput.value);
});

// ===== 文件夹树 =====
async function loadFolderTree() {
  try {
    const tree = await chrome.bookmarks.getTree();
    folderTreeData = tree[0];
    collectFolderIds(folderTreeData);
    renderFolderTree();
  } catch (e) {
    console.error('Failed to load folder tree:', e);
  }
}

function collectFolderIds(node) {
  if (node.children) {
    for (const child of node.children) {
      if (child.url === undefined) { // folder
        folderIdSet.add(child.id);
        collectFolderIds(child);
      }
    }
  }
}

function countBookmarksInFolder(node) {
  let count = 0;
  if (node.children) {
    for (const child of node.children) {
      if (child.url) count++;
      else count += countBookmarksInFolder(child);
    }
  }
  return count;
}

function getDescendentFolderIds(node, targetId) {
  const ids = new Set();
  function find(n) {
    if (n.id === targetId) {
      ids.add(n.id);
      if (n.children) collectFolderIds(n, ids);
      return true;
    }
    if (n.children) {
      for (const child of n.children) {
        if (find(child)) return true;
      }
    }
    return false;
  }
  function collectFolderIds(n, set) {
    set.add(n.id);
    if (n.children) {
      for (const child of n.children) {
        if (child.url === undefined) collectFolderIds(child, set);
      }
    }
  }
  find(node);
  return ids;
}

function filterByFolder(bookmarks) {
  if (!selectedFolderId) return bookmarks;
  const descendentIds = getDescendentFolderIds(folderTreeData, selectedFolderId);
  return bookmarks.filter(b => descendentIds.has(b.parentId));
}

function renderFolderTree() {
  if (!folderTreeData) return;

  // 首次渲染时默认展开第一层子文件夹
  if (expandedFolderIds.size === 0 && folderTreeData.children) {
    for (const child of folderTreeData.children) {
      if (child.url === undefined && child.children?.some(c => c.url === undefined)) {
        expandedFolderIds.add(child.id);
      }
    }
  }

  saFolderTree.innerHTML = '';

  // "全部书签" 节点
  const allNode = document.createElement('div');
  allNode.className = 'sa-tree-node' + (!selectedFolderId ? ' active' : '');
  allNode.dataset.folderId = '';
  allNode.innerHTML = `
    <span class="sa-tree-toggle sa-tree-toggle--hidden">${SVG_CHEVRON}</span>
    <span class="sa-tree-folder-icon">${SVG_FOLDER}</span>
    <span class="sa-tree-node-label">${escapeHtml(i18n('allFolders'))}</span>
    <span class="sa-tree-node-count">${allBookmarks.length}</span>
  `;
  saFolderTree.appendChild(allNode);

  // 递归渲染
  if (folderTreeData.children) {
    for (const child of folderTreeData.children) {
      if (child.url === undefined) {
        renderTreeNode(child, 0);
      }
    }
  }
}

function renderTreeNode(node, depth) {
  const count = countBookmarksInFolder(node);
  const div = document.createElement('div');
  div.className = 'sa-tree-node' + (selectedFolderId === node.id ? ' active' : '');
  div.dataset.folderId = node.id;
  div.style.paddingLeft = `calc(8px + ${depth * 16}px)`;
  div.draggable = false;

  const hasChildren = node.children && node.children.some(c => c.url === undefined);
  const isExpanded = expandedFolderIds.has(node.id);

  div.innerHTML = `
    <span class="sa-tree-toggle${hasChildren ? (isExpanded ? ' expanded' : '') : ' sa-tree-toggle--hidden'}">${SVG_CHEVRON}</span>
    <span class="sa-tree-folder-icon">${SVG_FOLDER}</span>
    <span class="sa-tree-node-label">${escapeHtml(node.title || i18n('rootFolder'))}</span>
    <span class="sa-tree-node-count">${count}</span>
  `;

  saFolderTree.appendChild(div);

  // 子节点
  if (hasChildren && isExpanded) {
    for (const child of node.children) {
      if (child.url === undefined) {
        renderTreeNode(child, depth + 1);
      }
    }
  }
}

// 文件夹树事件
saFolderTree.addEventListener('click', (e) => {
  const node = e.target.closest('.sa-tree-node');
  if (!node) return;
  const folderId = node.dataset.folderId;
  const toggle = node.querySelector('.sa-tree-toggle');

  // 如果点击了展开/折叠箭头
  if (e.target.closest('.sa-tree-toggle') && !toggle.classList.contains('sa-tree-toggle--hidden')) {
    if (expandedFolderIds.has(folderId)) {
      expandedFolderIds.delete(folderId);
    } else {
      expandedFolderIds.add(folderId);
    }
    renderFolderTree();
    return;
  }

  // 选中文件夹
  selectedFolderId = folderId || null;
  // 如果当前在 RSS 视图，点击书签文件夹则切回书签视图
  if (currentTab === 'rss') {
    switchSidebarTab('bookmarks');
  }
  renderFolderTree();
  filterBookmarks(saSearchInput.value);
  updateStatusBar();
});

// 展开/折叠全部
$('saCollapseAllBtn').addEventListener('click', () => {
  expandedFolderIds.clear();
  renderFolderTree();
});

$('saExpandAllBtn').addEventListener('click', () => {
  // 收集所有有子文件夹的文件夹 ID
  function collectExpandableIds(node) {
    if (node.children?.some(c => c.url === undefined)) {
      expandedFolderIds.add(node.id);
      for (const child of node.children) {
        if (child.url === undefined) collectExpandableIds(child);
      }
    }
  }
  if (folderTreeData) collectExpandableIds(folderTreeData);
  renderFolderTree();
});

// ===== 过滤与渲染 =====
function filterBookmarks(query) {
  currentFilter = query || '';
  let filtered = [...allBookmarks];

  // 文件夹过滤
  filtered = filterByFolder(filtered);

  // 标签过滤
  filtered = filterByTags(filtered);

  // 搜索
  let searchResults = null;
  if (currentFilter) {
    searchResults = smartSearch(currentFilter, filtered);
    filtered = searchResults.map(r => r.item);
    currentHighlightRanges = new Map();
    for (const r of searchResults) {
      currentHighlightRanges.set(r.item.id, r.ranges);
    }
  } else {
    currentHighlightRanges = null;
  }

  renderCurrentView(filtered);
  updateStatusBar();
}

function getFilteredBookmarks() {
  let filtered = [...allBookmarks];
  filtered = filterByFolder(filtered);
  filtered = filterByTags(filtered);
  if (currentFilter) {
    const results = smartSearch(currentFilter, filtered);
    filtered = results.map(r => r.item);
  }
  return filtered;
}

function renderCurrentView(bookmarks) {
  if (!bookmarks || bookmarks.length === 0) {
    saTimelineView.innerHTML = '';
    saGridView.innerHTML = '';
    saListView.innerHTML = '';
    saTimelineView.style.display = 'none';
    saGridView.style.display = 'none';
    saListView.style.display = 'none';
    saLoading.style.display = 'none';
    if (currentFilter) {
      saSearchEmpty.style.display = 'flex';
      saEmpty.style.display = 'none';
    } else {
      saEmpty.style.display = 'flex';
      saSearchEmpty.style.display = 'none';
    }
    saBookmarkCount.textContent = '0';
    return;
  }

  saLoading.style.display = 'none';
  saEmpty.style.display = 'none';
  saSearchEmpty.style.display = 'none';
  saBookmarkCount.textContent = bookmarks.length;

  if (currentViewMode === 'timeline') {
    renderTimelineView(bookmarks);
    saTimelineView.style.display = 'block';
    saGridView.style.display = 'none';
    saListView.style.display = 'none';
  } else if (currentViewMode === 'grid') {
    renderGridView(bookmarks);
    saTimelineView.style.display = 'none';
    saGridView.style.display = 'grid';
    saListView.style.display = 'none';
  } else if (currentViewMode === 'list') {
    renderListView(bookmarks);
    saTimelineView.style.display = 'none';
    saGridView.style.display = 'none';
    saListView.style.display = 'block';
  }
}

// ===== 时间线视图 =====
function renderTimelineView(bookmarks) {
  renderQueue = [];
  renderedCount = 0;
  currentGroupLabel = '';

  const isHeatMode = sortMode === 'hottest' || sortMode === 'coldest';

  if (currentHighlightRanges) {
    for (const item of bookmarks) {
      const ranges = currentHighlightRanges.get(item.id) || null;
      renderQueue.push({ type: 'item', data: item, ranges });
    }
  } else if (isHeatMode) {
    const sorted = [...bookmarks].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return sortMode === 'hottest' ? (b.clickCount || 0) - (a.clickCount || 0) : (a.clickCount || 0) - (b.clickCount || 0);
    });
    for (const item of sorted) renderQueue.push({ type: 'item', data: item });
  } else {
    const sorted = [...bookmarks].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return sortMode === 'newest' ? b.dateAdded - a.dateAdded : a.dateAdded - b.dateAdded;
    });

    const pinnedItems = sorted.filter(i => i.pinned);
    if (pinnedItems.length > 0) {
      renderQueue.push({ type: 'header', label: i18n('pinnedGroup'), count: pinnedItems.length, pinnedGroup: true });
      for (const item of pinnedItems) renderQueue.push({ type: 'item', data: item });
    }

    const groups = new Map();
    for (const item of sorted.filter(i => !i.pinned)) {
      const label = getDateGroupLabel(item.dateAdded);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    }
    for (const [label, items] of groups) {
      renderQueue.push({ type: 'header', label, count: items.length });
      for (const item of items) renderQueue.push({ type: 'item', data: item });
    }
  }

  saTimelineView.innerHTML = '';
  if (isHeatMode) saTimelineView.classList.add('sa-timeline--flat');
  else saTimelineView.classList.remove('sa-timeline--flat');
  currentGroupLabel = '';
  renderNextPage();
}

function renderNextPage() {
  if (renderedCount >= renderQueue.length) return;
  isLoadingMore = true;
  const end = Math.min(renderedCount + PAGE_SIZE, renderQueue.length);
  const fragment = document.createDocumentFragment();
  let groupDiv = null;

  for (let i = renderedCount; i < end; i++) {
    const entry = renderQueue[i];
    if (entry.type === 'header') {
      currentGroupLabel = entry.label;
      groupDiv = document.createElement('div');
      groupDiv.className = 'sa-date-group' + (entry.pinnedGroup ? ' sa-date-group--pinned' : '');
      groupDiv.dataset.label = entry.label;
      const icon = entry.pinnedGroup ? SVG_PIN_FILL : '';
      groupDiv.innerHTML = `<div class="sa-date-header"><span class="sa-date-label">${icon}${escapeHtml(entry.label)}</span><span class="sa-date-count">${i18n('bookmarkCount', [String(entry.count)])}</span></div>`;
      fragment.appendChild(groupDiv);
    } else {
      const item = entry.data;
      const el = createTimelineBookmarkElement(item, currentGroupLabel, entry.ranges);
      if (groupDiv) groupDiv.appendChild(el);
      else fragment.appendChild(el);
    }
  }

  renderedCount = end;
  const oldSentinel = saTimelineView.querySelector('.sa-load-more-sentinel');
  if (oldSentinel) oldSentinel.remove();

  if (renderedCount < renderQueue.length) {
    const sentinel = document.createElement('div');
    sentinel.className = 'sa-load-more-sentinel';
    sentinel.innerHTML = `<div class="sa-loading-dots"><span></span><span></span><span></span></div>`;
    fragment.appendChild(sentinel);
  }

  saTimelineView.appendChild(fragment);
  isLoadingMore = false;
}

function createTimelineBookmarkElement(item, groupLabel, highlightRanges) {
  let favicon, hostname;
  try { const u = new URL(item.url); favicon = `${u.origin}/favicon.ico`; hostname = u.hostname; } catch { favicon = ''; hostname = ''; }
  const domain = hostname.replace(/^www\./, '');
  const time = formatRelativeTime(item.dateAdded);
  const untitledText = i18n('untitled');

  const clickCount = item.clickCount || 0;
  const heatColor = getHeatColor(clickCount);
  const heatLevel = getHeatLevel(clickCount);
  const heatDotColor = getHeatDotColor(heatLevel);

  const div = document.createElement('div');
  div.className = 'sa-bookmark-item' + (item.pinned ? ' sa-bookmark-item--pinned' : '');
  if (heatColor) div.classList.add('sa-bookmark-item--heat');
  if (duplicateIds.has(item.id)) div.classList.add('sa-bookmark-item--dup');
  if (heatColor) div.style.background = `linear-gradient(to right, ${heatColor}, transparent 120%)`;

  if (clickCount > 0) {
    const t = Math.min(clickCount / 60, 1);
    const titleR = Math.round(0x20 - (0x20 - 0x1a) * t);
    const titleG = Math.round(0x21 - (0x21 - 0x0e) * t);
    const titleB = Math.round(0x24 - (0x24 - 0x00) * t);
    const domainR = Math.round(0x80 - (0x80 - 0x4a) * t);
    const domainG = Math.round(0x86 - (0x86 - 0x2a) * t);
    const domainB = Math.round(0x8b - (0x8b - 0x10) * t);
    const timeR = Math.round(0x9a - (0x9a - 0x6a) * t);
    const timeG = Math.round(0xa0 - (0xa0 - 0x4a) * t);
    const timeB = Math.round(0xa6 - (0xa6 - 0x2a) * t);
    div.style.setProperty('--heat-title-color', `rgb(${titleR},${titleG},${titleB})`);
    div.style.setProperty('--heat-meta-color', `rgb(${domainR},${domainG},${domainB})`);
    div.style.setProperty('--heat-time-color', `rgb(${timeR},${timeG},${timeB})`);
    div.style.setProperty('--heat-count-color', `rgb(${domainR},${domainG},${domainB})`);
  }

  div.dataset.id = item.id;
  div.dataset.url = item.url;
  div.dataset.title = item.title;
  div.draggable = true;

  const titleHtml = highlightRanges?.title?.length
    ? highlightText(item.title, highlightRanges.title)
    : escapeHtml(item.title) || `<span style="color:var(--text-disabled)">${escapeHtml(untitledText)}</span>`;
  const urlHtml = highlightRanges?.url?.length ? highlightText(item.url, highlightRanges.url) : escapeHtml(domain);

  let tagsHtml = '';
  if (item.tags && item.tags.length > 0) {
    const tagChips = item.tags.slice(0, 3).map(tag => {
      const color = allTags.get(tag)?.color || '#9aa0a6';
      return `<span class="sa-bookmark-tag" style="background:${color}20;color:${color}"><span class="sa-bookmark-tag-dot" style="background:${color}"></span>${escapeHtml(tag)}</span>`;
    }).join('');
    const extra = item.tags.length > 3 ? `<span class="sa-bookmark-tag" style="background:#9aa0a620;color:#9aa0a6">+${item.tags.length - 3}</span>` : '';
    tagsHtml = `<div class="sa-bookmark-tags">${tagChips}${extra}</div>`;
  }

  let heatInfoHtml = '';
  if (clickCount > 0) heatInfoHtml = `<span class="sa-bookmark-heat-info"><span class="sa-bookmark-heat-dot" style="background:${heatDotColor}"></span>${clickCount}</span>`;
  const dupBadge = duplicateIds.has(item.id) ? `<span class="sa-dup-badge">${i18n('dupBadge')}</span>` : '';

  div.innerHTML = `
    <img class="sa-bookmark-favicon" src="${favicon}" alt="" loading="lazy" data-hostname="${hostname}" data-fallback-idx="0">
    <div class="sa-bookmark-info">
      <div class="sa-bookmark-title" title="${escapeHtml(item.title)}"><span class="sa-bookmark-title-text">${titleHtml}</span>${dupBadge}</div>
      <div class="sa-bookmark-meta">
        <div class="sa-bookmark-meta-row">
          <span class="sa-bookmark-domain">${urlHtml}</span>
          ${heatInfoHtml}
        </div>
        ${tagsHtml}
        <span class="sa-bookmark-time">${time}</span>
      </div>
    </div>
    <div class="sa-bookmark-actions">
      <button class="sa-action-btn sa-action-btn--more" title="${i18n('moreActions')}" data-action="more">${SVG_MORE}</button>
    </div>
  `;

  return div;
}

// ===== 网格视图 =====
function renderGridView(bookmarks) {
  const sorted = sortBookmarks(bookmarks);
  saGridView.innerHTML = '';

  for (const item of sorted) {
    const card = document.createElement('div');
    card.className = 'sa-grid-card' + (item.pinned ? ' sa-grid-card--pinned' : '');
    card.dataset.id = item.id;
    card.dataset.url = item.url;
    card.dataset.title = item.title;
    card.draggable = true;

    let favicon, hostname;
    try { const u = new URL(item.url); favicon = `${u.origin}/favicon.ico`; hostname = u.hostname; } catch { favicon = ''; hostname = ''; }
    const domain = hostname.replace(/^www\./, '');
    const time = formatRelativeTime(item.dateAdded);

    let tagsHtml = '';
    if (item.tags && item.tags.length > 0) {
      const tagChips = item.tags.slice(0, 2).map(tag => {
        const color = allTags.get(tag)?.color || '#9aa0a6';
        return `<span class="sa-bookmark-tag" style="background:${color}20;color:${color}"><span class="sa-bookmark-tag-dot" style="background:${color}"></span>${escapeHtml(tag)}</span>`;
      }).join('');
      tagsHtml = `<div class="sa-grid-card-tags">${tagChips}</div>`;
    }

    const dupBadge = duplicateIds.has(item.id) ? `<span class="sa-dup-badge">${i18n('dupBadge')}</span>` : '';

    card.innerHTML = `
      <div class="sa-grid-card-header">
        <img class="sa-grid-card-favicon" src="${favicon}" alt="" loading="lazy" data-hostname="${hostname}" data-fallback-idx="0">
        <span class="sa-grid-card-title">${escapeHtml(item.title) || i18n('untitled')}${dupBadge}</span>
      </div>
      <span class="sa-grid-card-domain">${escapeHtml(domain)}</span>
      ${tagsHtml}
      <div class="sa-grid-card-meta"><span>${time}</span></div>
    `;

    saGridView.appendChild(card);
  }
}

// ===== 列表视图 =====
function renderListView(bookmarks) {
  const sorted = sortBookmarks(bookmarks);
  saListView.innerHTML = '';

  // 表头
  const header = document.createElement('div');
  header.className = 'sa-list-header';
  header.innerHTML = `
    <span></span>
    <span>${i18n('editTitle')}</span>
    <span>${i18n('editUrl')}</span>
    <span>${i18n('timelineMode')}</span>
    <span></span>
  `;
  saListView.appendChild(header);

  for (const item of sorted) {
    const row = document.createElement('div');
    row.className = 'sa-list-item' + (item.pinned ? ' sa-list-item--pinned' : '');
    row.dataset.id = item.id;
    row.dataset.url = item.url;
    row.dataset.title = item.title;
    row.draggable = true;

    let favicon, hostname;
    try { const u = new URL(item.url); favicon = `${u.origin}/favicon.ico`; hostname = u.hostname; } catch { favicon = ''; hostname = ''; }
    const domain = hostname.replace(/^www\./, '');
    const time = formatRelativeTime(item.dateAdded);

    row.innerHTML = `
      <img class="sa-list-item-favicon" src="${favicon}" alt="" loading="lazy" data-hostname="${hostname}" data-fallback-idx="0">
      <span class="sa-list-item-title">${escapeHtml(item.title) || i18n('untitled')}</span>
      <span class="sa-list-item-domain">${escapeHtml(domain)}</span>
      <span class="sa-list-item-time">${time}</span>
      <div class="sa-list-item-actions">
        <button class="sa-action-btn" data-action="more">${SVG_MORE}</button>
      </div>
    `;

    saListView.appendChild(row);
  }
}

// ===== 排序 =====
function sortBookmarks(bookmarks) {
  return [...bookmarks].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    switch (sortMode) {
      case 'newest': return b.dateAdded - a.dateAdded;
      case 'oldest': return a.dateAdded - b.dateAdded;
      case 'hottest': return (b.clickCount || 0) - (a.clickCount || 0);
      case 'coldest': return (a.clickCount || 0) - (b.clickCount || 0);
      default: return b.dateAdded - a.dateAdded;
    }
  });
}

// ===== 视图切换 =====
document.querySelectorAll('.sa-view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.sa-view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentViewMode = btn.dataset.view;
    // 切换书签视图时，如果当前在 RSS 视图则切回
    if (currentTab === 'rss') {
      switchSidebarTab('bookmarks');
    }
    filterBookmarks(saSearchInput.value);
  });
});

// ===== 搜索 =====
let searchDebounce = null;
function applySearchValue(value, { debounce = false, focus = false } = {}) {
  clearTimeout(searchDebounce);
  searchDebounce = null;
  saSearchInput.value = value;
  saSearchClear.style.display = value ? 'flex' : 'none';
  if (debounce) {
    searchDebounce = setTimeout(() => filterBookmarks(value), 200);
  } else {
    filterBookmarks(value);
  }
  if (focus) saSearchInput.focus();
}
saSearchInput.addEventListener('input', () => {
  applySearchValue(saSearchInput.value, { debounce: true });
});

saSearchClear.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  applySearchValue('', { focus: true });
});

// ===== 排序下拉 =====
saSortBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  saSortBtn.parentElement.classList.toggle('sa-sort-dropdown--open');
});

document.querySelectorAll('.sa-sort-dropdown-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    sortMode = item.dataset.sort;
    document.querySelectorAll('.sa-sort-dropdown-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    saSortBtn.parentElement.classList.remove('sa-sort-dropdown--open');
    filterBookmarks(saSearchInput.value);
  });
});

document.addEventListener('click', () => {
  saSortBtn.parentElement.classList.remove('sa-sort-dropdown--open');
});

// ===== 同步 =====
saSyncBtn.addEventListener('click', syncAll);

// ===== 书签点击与上下文菜单 =====
let bookmarkMenuEl = null;
let bookmarkMenuTargetBtn = null;

function ensureBookmarkMenu() {
  if (bookmarkMenuEl) return bookmarkMenuEl;
  const el = document.createElement('div');
  el.className = 'sa-bookmark-menu';
  el.setAttribute('role', 'menu');
  document.body.appendChild(el);
  bookmarkMenuEl = el;
  return el;
}

function openBookmarkMenu(btn, id, url, title) {
  const el = ensureBookmarkMenu();
  const bookmark = allBookmarks.find(b => b.id === id);
  const isPinned = !!bookmark?.pinned;
  const pinText = isPinned ? i18n('unpinBookmark') : i18n('pinBookmark');

  el.innerHTML = `
    <button class="sa-bookmark-menu-item" data-action="open">${SVG_OPEN}<span>${escapeHtml(i18n('openLink'))}</span></button>
    <button class="sa-bookmark-menu-item" data-action="openInWindow">${SVG_WINDOW}<span>${escapeHtml(i18n('openInWindow'))}</span></button>
    <button class="sa-bookmark-menu-item" data-action="pin">${isPinned ? SVG_PIN_FILL : SVG_PIN}<span>${escapeHtml(pinText)}</span></button>
    <button class="sa-bookmark-menu-item" data-action="edit">${SVG_EDIT}<span>${escapeHtml(i18n('edit'))}</span></button>
    <div class="sa-bookmark-menu-sep"></div>
    <button class="sa-bookmark-menu-item sa-bookmark-menu-item--danger" data-action="delete">${SVG_DELETE}<span>${escapeHtml(i18n('delete'))}</span></button>
  `;

  el._context = { id, url, title };

  const rect = btn.getBoundingClientRect();
  el.style.visibility = 'hidden';
  el.classList.add('sa-bookmark-menu--open');
  const menuW = el.offsetWidth || 180;
  const menuH = el.offsetHeight || 200;
  let left = rect.right - menuW;
  let top = rect.bottom + 6;
  if (left < 4) left = 4;
  if (top + menuH > window.innerHeight - 4) top = rect.top - menuH - 6;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.visibility = 'visible';

  if (bookmarkMenuTargetBtn) bookmarkMenuTargetBtn.classList.remove('sa-action-btn--active');
  bookmarkMenuTargetBtn = btn;
  btn.classList.add('sa-action-btn--active');
}

function closeBookmarkMenu() {
  if (!bookmarkMenuEl) return;
  bookmarkMenuEl.classList.remove('sa-bookmark-menu--open');
  if (bookmarkMenuTargetBtn) {
    bookmarkMenuTargetBtn.classList.remove('sa-action-btn--active');
    bookmarkMenuTargetBtn = null;
  }
}

document.addEventListener('click', (e) => {
  const menuItem = e.target.closest('.sa-bookmark-menu-item');
  if (menuItem) {
    const action = menuItem.dataset.action;
    closeBookmarkMenu();
    if (bookmarkMenuEl?._context) {
      const { id, url, title } = bookmarkMenuEl._context;
      if (action === 'open') {
        chrome.tabs.create({ url });
        chrome.runtime.sendMessage({ action: 'recordClick', url }).catch(() => {});
      } else if (action === 'openInWindow') {
        if (!openBookmarkInWindow(url, title)) {
          chrome.tabs.create({ url });
          chrome.runtime.sendMessage({ action: 'recordClick', url }).catch(() => {});
        }
      } else if (action === 'edit') {
        const bookmark = allBookmarks.find(b => b.id === id);
        openEditModal(id, title, url, bookmark?.tags || [], bookmark);
      } else if (action === 'delete') {
        deleteBookmark(id, url);
      } else if (action === 'pin') {
        togglePin(id);
      }
    }
    return;
  }
  if (bookmarkMenuEl?.classList.contains('sa-bookmark-menu--open')) {
    if (!e.target.closest('.sa-bookmark-menu')) closeBookmarkMenu();
  }
});

// 内容区点击事件委托
saContent.addEventListener('click', (e) => {
  const itemEl = e.target.closest('[data-id]');
  if (!itemEl) return;

  const actionBtn = e.target.closest('.sa-action-btn');
  const id = itemEl.dataset.id;
  const url = itemEl.dataset.url;
  const title = itemEl.dataset.title;

  if (actionBtn) {
    e.stopPropagation();
    if (actionBtn.dataset.action === 'more') {
      openBookmarkMenu(actionBtn, id, url, title);
    }
    return;
  }

  closeBookmarkMenu();

  // Ctrl/Cmd+Click: 在新标签页打开
  if (e.ctrlKey || e.metaKey) {
    chrome.tabs.create({ url });
    chrome.runtime.sendMessage({ action: 'recordClick', url }).catch(() => {});
    return;
  }

  // 尝试在 MDI 子窗口中打开
  if (openBookmarkInWindow(url, title)) return;

  // MDI 未启用，在新标签页打开
  chrome.tabs.create({ url });
  chrome.runtime.sendMessage({ action: 'recordClick', url }).catch(() => {});
});

// 中键点击：始终在新标签页打开
saContent.addEventListener('auxclick', (e) => {
  if (e.button !== 1) return;
  const itemEl = e.target.closest('[data-id]');
  if (!itemEl) return;
  e.preventDefault();
  chrome.tabs.create({ url: itemEl.dataset.url });
  chrome.runtime.sendMessage({ action: 'recordClick', url: itemEl.dataset.url }).catch(() => {});
});

// Favicon 错误处理
saContent.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG' && e.target.classList.contains('sa-bookmark-favicon') || e.target.classList.contains('sa-grid-card-favicon') || e.target.classList.contains('sa-list-item-favicon')) {
    handleFaviconError(e.target);
  }
}, true);

// ===== 拖拽排序 =====
saContent.addEventListener('dragstart', (e) => {
  const item = e.target.closest('[data-id]');
  if (!item) return;
  dragState = { bookmarkId: item.dataset.id, sourceView: currentViewMode };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', item.dataset.id);
  item.classList.add('dragging');
});

saContent.addEventListener('dragend', (e) => {
  const item = e.target.closest('[data-id]');
  if (item) item.classList.remove('dragging');
  saSidebar.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over'));
  dragState = null;
});

saSidebar.addEventListener('dragover', (e) => {
  const node = e.target.closest('.sa-tree-node');
  if (!node || !dragState) return;
  const folderId = node.dataset.folderId;
  if (!folderId) return; // "全部书签"不可作为目标
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  saSidebar.querySelectorAll('.drag-over').forEach(n => n.classList.remove('drag-over'));
  node.classList.add('drag-over');
});

saSidebar.addEventListener('dragleave', (e) => {
  const node = e.target.closest('.sa-tree-node');
  if (node) node.classList.remove('drag-over');
});

saSidebar.addEventListener('drop', async (e) => {
  e.preventDefault();
  const node = e.target.closest('.sa-tree-node');
  if (!node || !dragState) return;
  node.classList.remove('drag-over');
  const targetFolderId = node.dataset.folderId;
  if (!targetFolderId) return;
  const bookmarkId = dragState.bookmarkId;
  try {
    await chrome.bookmarks.move(bookmarkId, { parentId: targetFolderId });
    showToast(i18n('movedToFolder'), 'success');
    await refreshBookmarkData();
    await loadFolderTree();
  } catch (err) {
    showToast(i18n('moveFailed'), 'error');
  }
  dragState = null;
});

// ===== 侧边栏折叠/展开 =====
saSidebarToggle.addEventListener('click', () => {
  saSidebar.classList.toggle('collapsed');
});

// ===== 侧边栏宽度拖拽 =====
function initSidebarResize() {
  let startX, startWidth;

  saSidebarResize.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startWidth = saSidebar.offsetWidth;
    saSidebarResize.classList.add('active');
    document.addEventListener('mousemove', onResize);
    document.addEventListener('mouseup', stopResize);
    e.preventDefault();
  });

  function onResize(e) {
    const delta = e.clientX - startX;
    const newWidth = Math.max(150, Math.min(400, startWidth + delta));
    saSidebar.style.width = newWidth + 'px';
    saSidebar.style.minWidth = newWidth + 'px';
  }

  function stopResize() {
    saSidebarResize.classList.remove('active');
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
  }
}

// ===== 编辑弹窗 =====
function openEditModal(id, title, url, tags, bookmark) {
  editingBookmarkId = id;
  editingTags = [...(tags || [])];
  editingFolderId = bookmark?.parentId || null;

  saEditTitle.value = title || '';
  saEditUrl.value = url || '';
  saEditFolderPath.textContent = '';
  renderEditTags();
  renderEditFolderPath(editingFolderId);

  saEditFolderTree.style.display = 'none';
  saEditModal.style.display = 'flex';
  saEditTitle.focus();
}

function closeEditModal() {
  saEditModal.style.display = 'none';
  editingBookmarkId = null;
  editingTags = [];
}

function renderEditTags() {
  saEditTagsList.innerHTML = '';
  for (const tag of editingTags) {
    const chip = document.createElement('span');
    chip.className = 'sa-edit-tag-chip';
    chip.innerHTML = `${escapeHtml(tag)}<button class="sa-edit-tag-remove" data-tag="${escapeHtml(tag)}">&times;</button>`;
    saEditTagsList.appendChild(chip);
  }
}

async function renderEditFolderPath(folderId) {
  if (!folderId) { saEditFolderPath.textContent = i18n('rootFolder'); return; }
  try {
    const path = [];
    let currentId = folderId;
    while (currentId) {
      const nodes = await chrome.bookmarks.get(currentId);
      if (!nodes || nodes.length === 0) break;
      const node = nodes[0];
      path.unshift(node.title || i18n('rootFolder'));
      currentId = node.parentId;
    }
    saEditFolderPath.textContent = path.join(' / ');
  } catch {
    saEditFolderPath.textContent = i18n('rootFolder');
  }
}

saEditTagsList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.sa-edit-tag-remove');
  if (!removeBtn) return;
  const tag = removeBtn.dataset.tag;
  editingTags = editingTags.filter(t => t !== tag);
  renderEditTags();
});

saEditTagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const tag = saEditTagInput.value.trim();
    if (tag && !editingTags.includes(tag)) {
      editingTags.push(tag);
      renderEditTags();
      saEditTagInput.value = '';
    }
  }
});

saEditFolderSelector.addEventListener('click', () => {
  const isVisible = saEditFolderTree.style.display !== 'none';
  saEditFolderTree.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) renderEditFolderTree();
});

function renderEditFolderTree() {
  if (!folderTreeData) return;
  saEditFolderTreeInner.innerHTML = '';
  renderEditFolderTreeNode(folderTreeData, 0);
}

function renderEditFolderTreeNode(node, depth) {
  const item = document.createElement('div');
  item.className = 'sa-folder-tree-item' + (editingFolderId === node.id ? ' sa-folder-tree-item--selected' : '');
  item.dataset.folderId = node.id;
  item.style.paddingLeft = (10 + depth * 16) + 'px';
  item.innerHTML = `${SVG_FOLDER}<span class="folder-name">${escapeHtml(node.title || i18n('rootFolder'))}</span>`;
  saEditFolderTreeInner.appendChild(item);

  if (node.children) {
    for (const child of node.children) {
      if (child.url === undefined) renderEditFolderTreeNode(child, depth + 1);
    }
  }
}

saEditFolderTreeInner.addEventListener('click', (e) => {
  const item = e.target.closest('.sa-folder-tree-item');
  if (!item) return;
  editingFolderId = item.dataset.folderId;
  renderEditFolderTree();
  renderEditFolderPath(editingFolderId);
});

saEditSave.addEventListener('click', async () => {
  if (!editingBookmarkId) return;
  const bookmarkId = editingBookmarkId;
  const targetFolderId = editingFolderId;
  const title = saEditTitle.value.trim();
  const url = saEditUrl.value.trim();
  const changes = { title, url, tags: [...editingTags] };
  const bookmark = allBookmarks.find(b => b.id === bookmarkId);
  const oldFolderId = bookmark?.parentId;
  const updated = await updateBookmark(bookmarkId, changes);
  if (!updated) return;
  if (targetFolderId && targetFolderId !== oldFolderId) {
    try {
      await chrome.bookmarks.move(bookmarkId, { parentId: targetFolderId });
      showToast(i18n('editAndMoveSuccess'), 'success');
      await refreshBookmarkData();
      await loadFolderTree();
    } catch {
      showToast(i18n('editSuccess'), 'success');
      showToast(i18n('moveFailed'), 'error');
    }
  } else {
    showToast(i18n('editSuccess'), 'success');
  }
  closeEditModal();
});

saEditCancel.addEventListener('click', closeEditModal);
saEditModalClose.addEventListener('click', closeEditModal);

saEditModal.addEventListener('click', (e) => {
  if (e.target === saEditModal) closeEditModal();
});

// ===== 命令面板 =====
saPaletteBtn.addEventListener('click', openPalette);

function openPalette() {
  paletteOpen = true;
  paletteSelectedIdx = 0;
  saPaletteInput.value = '';
  saPaletteModal.style.display = 'flex';
  renderPalette('');
  saPaletteInput.focus();
}

function closePalette() {
  paletteOpen = false;
  saPaletteModal.style.display = 'none';
}

function renderPalette(query) {
  const filtered = query ? smartSearch(query, allBookmarks).map(r => r.item) : allBookmarks.slice(0, 50);
  paletteItems = filtered;
  paletteSelectedIdx = Math.min(paletteSelectedIdx, paletteItems.length - 1);
  if (paletteSelectedIdx < 0) paletteSelectedIdx = 0;

  saPaletteResults.innerHTML = '';
  if (filtered.length === 0) {
    saPaletteResults.innerHTML = `<div class="sa-palette-empty">${escapeHtml(i18n('searchEmptyTitle'))}</div>`;
    return;
  }

  for (let i = 0; i < filtered.length; i++) {
    const item = filtered[i];
    const el = document.createElement('div');
    el.className = 'sa-palette-item' + (i === paletteSelectedIdx ? ' selected' : '') + (item.pinned ? ' sa-palette-item--pinned' : '');
    el.dataset.index = i;

    let favicon = '';
    let hostname = '';
    try { const u = new URL(item.url); favicon = `${u.origin}/favicon.ico`; hostname = u.hostname; } catch {}

    el.innerHTML = `
      <img class="sa-palette-favicon" src="${favicon}" alt="" loading="lazy" data-hostname="${hostname}" data-fallback-idx="0">
      <div class="sa-palette-item-info">
        <div class="sa-palette-item-title">${escapeHtml(item.title) || i18n('untitled')}</div>
        <div class="sa-palette-item-url">${escapeHtml(hostname)}</div>
      </div>
      ${item.pinned ? `<span class="sa-palette-pin">${SVG_PIN_FILL}</span>` : ''}
    `;

    saPaletteResults.appendChild(el);
  }
}

saPaletteInput.addEventListener('input', () => {
  paletteSelectedIdx = 0;
  renderPalette(saPaletteInput.value);
});

saPaletteInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    paletteSelectedIdx = Math.min(paletteSelectedIdx + 1, paletteItems.length - 1);
    renderPalette(saPaletteInput.value);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    paletteSelectedIdx = Math.max(paletteSelectedIdx - 1, 0);
    renderPalette(saPaletteInput.value);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (paletteItems[paletteSelectedIdx]) {
      const item = paletteItems[paletteSelectedIdx];
      if (e.ctrlKey || e.metaKey) {
        chrome.tabs.create({ url: item.url });
      } else {
        openBookmarkInWindow(item.url, item.title);
      }
      closePalette();
    }
  } else if (e.key === 'Escape') {
    closePalette();
  }
});

saPaletteResults.addEventListener('click', (e) => {
  const item = e.target.closest('.sa-palette-item');
  if (!item) return;
  const idx = parseInt(item.dataset.index, 10);
  if (paletteItems[idx]) {
    const entry = paletteItems[idx];
    openBookmarkInWindow(entry.url, entry.title);
    closePalette();
  }
});

saPaletteModal.addEventListener('click', (e) => {
  if (e.target === saPaletteModal) closePalette();
});

// ===== 键盘快捷键 =====
document.addEventListener('keydown', (e) => {
  // Ctrl+Shift+E 打开命令面板
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
    e.preventDefault();
    if (paletteOpen) closePalette();
    else openPalette();
    return;
  }
  if (e.key === 'Escape') {
    if (paletteOpen) closePalette();
    else if (saEditModal.style.display !== 'none') closeEditModal();
    else if (bookmarkMenuEl?.classList.contains('sa-bookmark-menu--open')) closeBookmarkMenu();
  }
});

// ===== 状态栏 =====
function updateStatusBar() {
  const filtered = getFilteredBookmarks();
  const parts = [i18n('bookmarkCount', [String(filtered.length)])];
  if (selectedFolderId) {
    const folderName = getFolderNameById(selectedFolderId);
    parts.push(i18n('currentFolder', [folderName]));
  }
  saStatusFolder.textContent = parts.join(' | ');
}

function getFolderNameById(id) {
  function find(node) {
    if (node.id === id) return node.title;
    if (node.children) {
      for (const child of node.children) {
        const result = find(child);
        if (result) return result;
      }
    }
    return null;
  }
  return find(folderTreeData) || id;
}

// ===== 主题 =====
let currentTheme = 'system';

function loadTheme() {
  chrome.storage.local.get('theme', (data) => {
    let theme = data.theme || 'light';
    // 如果存储的是 'system'（旧版），根据系统偏好决定
    if (theme === 'system') {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    applyTheme(theme);
  });
}

function applyTheme(theme) {
  currentTheme = theme;
  document.body.classList.remove('theme-light', 'theme-dark');
  if (theme === 'light') document.body.classList.add('theme-light');
  else if (theme === 'dark') document.body.classList.add('theme-dark');
  updateThemeButtonIcon();
}

function updateThemeButtonIcon() {
  // CSS handles icon visibility based on theme class
  // This function can be extended for animation if needed
}

function toggleTheme() {
  // 仅在 light ↔ dark 之间切换
  let next;
  if (currentTheme === 'dark') next = 'light';
  else next = 'dark';
  chrome.storage.local.set({ theme: next });
  applyTheme(next);
}

// ===== 监听后台消息 =====
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'bookmarkAdded' || msg.action === 'bookmarksDeleted' || msg.action === 'bookmarksUpdated' || msg.action === 'tagsUpdated') {
    refreshBookmarkData({ keepFilter: true });
  }
});

// 监听存储变化（主题/语言/预览/MDI）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.theme) {
    applyTheme(changes.theme.newValue || 'system');
  }
  if (changes.previewEnabled) {
    previewEnabled = changes.previewEnabled.newValue !== false;
    if (!previewEnabled) hidePreviewCard();
  }
  if (changes.mdiWindowEnabled) {
    mdiWindowEnabled = changes.mdiWindowEnabled.newValue === true;
  }
});

// ===== 滚动加载更多 =====
saContent.addEventListener('scroll', () => {
  if (currentViewMode !== 'timeline' || isLoadingMore) return;
  const sentinel = saTimelineView.querySelector('.sa-load-more-sentinel');
  if (!sentinel) return;
  const rect = sentinel.getBoundingClientRect();
  if (rect.top < window.innerHeight + 100) {
    renderNextPage();
  }
});

// ===== Hover 预览卡片 (Mozilla Readability) =====
const PREVIEW_HOVER_DELAY = 200;
const PREVIEW_HIDE_DELAY = 120;

let previewCardEl = null;
let previewHoverItem = null;
let previewShowTimer = null;
let previewHideTimer = null;
let previewFetchSeq = 0;
let previewEnabled = true;
const previewSessionCache = new Map();

// 预构建的 DOM 引用（避免每次 innerHTML 重建）
let previewMediaEl = null;
let previewImgEl = null;
let previewPlaceholderEl = null;
let previewPlaceholderInitialEl = null;
let previewPlaceholderHostEl = null;
let previewBodyEl = null;
let previewTitleEl = null;
let previewDescEl = null;
let previewSiteEl = null;
let previewEmptyMsgEl = null;

function buildPreviewCardDOM() {
  // 一次性构建完整 DOM 结构，之后只更新文本/属性
  const el = document.createElement('div');
  el.id = 'saPreviewCard';
  el.className = 'sa-preview-card';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="preview-media" style="display:none;">
      <img class="preview-img" alt="" referrerpolicy="no-referrer">
      <div class="preview-placeholder" style="display:none;">
        <div class="preview-placeholder-initial"></div>
        <div class="preview-placeholder-host"></div>
      </div>
    </div>
    <div class="preview-body">
      <div class="preview-title"></div>
      <div class="preview-desc"></div>
      <div class="preview-site"></div>
    </div>
    <div class="preview-empty-msg" style="display:none;"></div>
  `;
  document.body.appendChild(el);

  // 缓存引用
  previewMediaEl = el.querySelector('.preview-media');
  previewImgEl = el.querySelector('.preview-img');
  previewPlaceholderEl = el.querySelector('.preview-placeholder');
  previewPlaceholderInitialEl = el.querySelector('.preview-placeholder-initial');
  previewPlaceholderHostEl = el.querySelector('.preview-placeholder-host');
  previewBodyEl = el.querySelector('.preview-body');
  previewTitleEl = el.querySelector('.preview-title');
  previewDescEl = el.querySelector('.preview-desc');
  previewSiteEl = el.querySelector('.preview-site');
  previewEmptyMsgEl = el.querySelector('.preview-empty-msg');

  // 鼠标在卡片上时取消隐藏
  el.addEventListener('mouseenter', () => {
    if (previewHideTimer) { clearTimeout(previewHideTimer); previewHideTimer = null; }
  });
  el.addEventListener('mouseleave', () => {
    scheduleHidePreview();
  });

  // 图片错误处理（事件委托，一次性绑定）
  previewImgEl.addEventListener('error', () => {
    handlePreviewImgError(previewImgEl);
  });

  return el;
}

function getPreviewCardEl() {
  if (previewCardEl && previewMediaEl) return previewCardEl;
  // 如果 HTML 中已有空壳元素，先移除，由 buildPreviewCardDOM 重新构建
  const existing = document.getElementById('saPreviewCard');
  if (existing) existing.remove();
  previewCardEl = buildPreviewCardDOM();
  return previewCardEl;
}

// ---- 位置计算（纯计算，不触发读写混合） ----
let _lastCardRect = null;

function calcPreviewPosition(itemEl) {
  const rect = itemEl.getBoundingClientRect();
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 用缓存尺寸，首次用保守估计
  const cardW = _lastCardRect ? _lastCardRect.width : 380;
  const cardH = _lastCardRect ? _lastCardRect.height : 140;

  // 水平定位：优先居中于书签，但不超出视口
  const itemCenterX = rect.left + rect.width / 2;
  let left = Math.round(itemCenterX - cardW / 2);
  if (left < 4) left = 4;
  if (left + cardW > vw - 4) left = Math.max(4, vw - cardW - 4);

  // 垂直定位：优先在书签上方，不够则放下方，再不够则吸底
  let top = Math.round(rect.top - cardH - margin);
  if (top < 4) top = Math.round(rect.bottom + margin);
  if (top + cardH > vh - 4) top = Math.max(4, vh - cardH - 4);

  return { left, top };
}

/** 用实际尺寸修正位置（读取 offsetWidth/offsetHeight 后调用） */
function repositionPreviewCard(itemEl) {
  if (!previewCardEl || previewCardEl.style.visibility !== 'visible') return;
  const actualW = previewCardEl.offsetWidth;
  const actualH = previewCardEl.offsetHeight;
  _lastCardRect = { width: actualW, height: actualH };
  const pos = calcPreviewPosition(itemEl);
  applyPreviewPosition(pos);
}

function applyPreviewPosition(pos) {
  if (!previewCardEl) return;
  const t = `translate3d(${pos.left}px, ${pos.top}px, 0)`;
  previewCardEl.style.transform = t;
  previewCardEl.style.setProperty('--sa-preview-pos', t);
}

// ---- 显示 / 隐藏 ----

function isOverPreviewCard() {
  return previewCardEl && previewCardEl.style.visibility === 'visible' && previewCardEl.matches(':hover');
}

function scheduleHidePreview() {
  if (previewHideTimer) clearTimeout(previewHideTimer);
  previewHideTimer = setTimeout(() => {
    previewHideTimer = null;
    if (isOverPreviewCard()) return;
    hidePreviewCard();
  }, PREVIEW_HIDE_DELAY);
}

function showPreviewCardEl(itemEl) {
  const el = getPreviewCardEl();
  const pos = calcPreviewPosition(itemEl);
  el.style.transition = 'none';
  el.style.transform = `translate3d(${pos.left}px, ${pos.top}px, 0) scale(0.96)`;
  el.style.setProperty('--sa-preview-pos', `translate3d(${pos.left}px, ${pos.top}px, 0)`);
  el.style.visibility = 'visible';
  el.style.opacity = '0';
  el.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    el.style.transition = '';
    el.style.opacity = '1';
    el.style.transform = `translate3d(${pos.left}px, ${pos.top}px, 0) scale(1)`;
    // 用实际尺寸修正位置
    repositionPreviewCard(itemEl);
  });
}

function hidePreviewCard() {
  if (previewShowTimer) { clearTimeout(previewShowTimer); previewShowTimer = null; }
  if (previewHideTimer) { clearTimeout(previewHideTimer); previewHideTimer = null; }
  if (!previewCardEl) return;

  previewCardEl.style.opacity = '0';
  previewCardEl.setAttribute('aria-hidden', 'true');

  // 过渡完成后隐藏
  const cleanup = () => {
    previewCardEl.removeEventListener('transitionend', cleanup);
    if (previewCardEl.style.opacity === '0') {
      previewCardEl.style.visibility = 'hidden';
      resetPreviewContent();
    }
  };
  previewCardEl.addEventListener('transitionend', cleanup);
  // 兜底
  setTimeout(() => {
    if (previewCardEl && previewCardEl.style.opacity === '0') {
      previewCardEl.style.visibility = 'hidden';
      resetPreviewContent();
    }
  }, 250);

  previewHoverItem = null;
}

// ---- 内容更新（零 innerHTML，只改 textContent / 属性） ----

function resetPreviewContent() {
  // 轻量重置，不销毁 DOM
  if (!previewMediaEl) return;
  previewMediaEl.style.display = 'none';
  previewBodyEl.style.display = 'none';
  previewEmptyMsgEl.style.display = 'none';
  previewImgEl.removeAttribute('src');
  previewImgEl.setAttribute('data-retry', '0');
  previewTitleEl.textContent = '';
  previewDescEl.textContent = '';
  previewSiteEl.textContent = '';
  previewEmptyMsgEl.textContent = '';
  previewImgEl.style.display = '';
  previewPlaceholderEl.style.display = 'none';
}

function showPlaceholderContent(title, url) {
  let host = '';
  try { host = new URL(url).host; } catch { host = url; }

  previewMediaEl.style.display = 'none';
  previewEmptyMsgEl.style.display = 'none';
  previewBodyEl.style.display = '';
  previewTitleEl.textContent = title || '';
  previewDescEl.textContent = i18n('previewLoading') || '正在加载…';
  previewDescEl.className = 'preview-desc preview-desc--loading';
  previewSiteEl.textContent = host;
}

function showPreviewContent(data) {
  const siteName = data.siteName || getHostOfUrl(data.url || '') || '';

  // 图片 / 占位
  if (data.image) {
    previewMediaEl.style.display = '';
    previewImgEl.style.display = '';
    previewPlaceholderEl.style.display = 'none';
    previewImgEl.setAttribute('data-initial', getSiteInitial(siteName, data.url || ''));
    previewImgEl.setAttribute('data-host', siteName);
    previewImgEl.setAttribute('data-host-url', data.url || '');
    previewImgEl.setAttribute('data-retry', '0');
    previewImgEl.referrerPolicy = 'no-referrer';
    previewImgEl.src = data.image;

    // 图片加载完后调整容器尺寸（延迟到下一帧，不阻塞入场动画）
    const checkImgSize = () => {
      const nw = previewImgEl.naturalWidth, nh = previewImgEl.naturalHeight;
      if (!nw || !nh) return;
      const MIN_W = 80, MAX_W = 160, MIN_H = 80, MAX_H = 140;
      const ratio = nw / nh;
      let w, h;
      if (ratio >= 1) {
        w = MAX_W; h = Math.round(w / ratio);
        if (h < MIN_H) { h = MIN_H; w = Math.min(MAX_W, Math.round(h * ratio)); }
        if (h > MAX_H) { h = MAX_H; w = Math.min(MAX_W, Math.round(h * ratio)); }
      } else {
        h = MAX_H; w = Math.round(h * ratio);
        if (w < MIN_W) { w = MIN_W; h = Math.min(MAX_H, Math.round(w / ratio)); }
        if (w > MAX_W) { w = MAX_W; h = Math.min(MAX_H, Math.round(w * ratio)); }
      }
      previewMediaEl.style.width = w + 'px';
      previewMediaEl.style.height = h + 'px';
    };

    if (previewImgEl.complete && previewImgEl.naturalWidth > 0) {
      checkImgSize();
    } else if (previewImgEl.complete && previewImgEl.naturalWidth === 0) {
      handlePreviewImgError(previewImgEl);
    } else {
      previewImgEl.addEventListener('load', () => {
        checkImgSize();
        // 图片加载后重新定位
        if (previewHoverItem) {
          requestAnimationFrame(() => {
            if (previewHoverItem) repositionPreviewCard(previewHoverItem);
          });
        }
      }, { once: true });
    }
  } else {
    // 无图：显示首字母占位
    previewMediaEl.style.display = '';
    previewImgEl.style.display = 'none';
    previewPlaceholderEl.style.display = '';
    previewPlaceholderInitialEl.textContent = getSiteInitial(siteName, data.url || '');
    previewPlaceholderHostEl.textContent = siteName;
    previewMediaEl.style.width = '120px';
    previewMediaEl.style.height = '110px';
  }

  // 文字
  previewEmptyMsgEl.style.display = 'none';
  previewBodyEl.style.display = '';
  previewTitleEl.textContent = data.title || '';
  previewDescEl.textContent = data.description || data.excerpt || '';
  previewDescEl.className = 'preview-desc';
  previewSiteEl.textContent = siteName;
}

function showPreviewMessage(message) {
  previewMediaEl.style.display = 'none';
  previewBodyEl.style.display = 'none';
  previewEmptyMsgEl.style.display = '';
  previewEmptyMsgEl.textContent = message;
}

function handlePreviewImgError(img) {
  try {
    const initial = img.getAttribute('data-initial') || '?';
    const host = img.getAttribute('data-host') || '';
    const retry = parseInt(img.getAttribute('data-retry') || '0', 10);

    if (retry === 0) {
      img.setAttribute('data-retry', '1');
      img.referrerPolicy = 'origin';
      const currentSrc = img.src;
      img.src = '';
      img.src = currentSrc;
      return;
    }
    if (host) {
      const ddgSrc = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`;
      if (img.src !== ddgSrc) {
        img.setAttribute('data-retry', '2');
        img.referrerPolicy = 'no-referrer';
        img.src = ddgSrc;
        return;
      }
      const googleSrc = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
      if (img.src !== googleSrc) {
        img.setAttribute('data-retry', '3');
        img.src = googleSrc;
        return;
      }
    }
    // 所有回退失败 → 显示占位符
    img.style.display = 'none';
    previewPlaceholderEl.style.display = '';
    previewPlaceholderInitialEl.textContent = initial;
    previewPlaceholderHostEl.textContent = host;
  } catch (e) {
    img.style.display = 'none';
    previewPlaceholderEl.style.display = '';
  }
}

// ---- Readability helpers ----

function escapeAttr(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getHostOfUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function getSiteInitial(siteName, url) {
  const s = (siteName || getHostOfUrl(url) || '?').trim();
  return (s[0] || '?').toUpperCase();
}

function pickMetaContent(doc, selectors) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el) {
      const v = (el.getAttribute('content') || el.getAttribute('href') || '').trim();
      if (v) return v;
    }
  }
  return '';
}

function absolutizeUrl(u, base) {
  if (!u) return '';
  if (/^data:/i.test(u)) return u;
  try { return new URL(u, base).href; } catch { return ''; }
}

function isTrackingPixel(img) {
  const w = parseInt(img.getAttribute('width') || '0', 10);
  const h = parseInt(img.getAttribute('height') || '0', 10);
  if ((w > 0 && w <= 2) || (h > 0 && h <= 2)) return true;
  const cls = (img.getAttribute('class') || '').toLowerCase();
  const id = (img.getAttribute('id') || '').toLowerCase();
  const trackingHints = ['pixel', 'track', 'beacon', 'spacer', 'blank', '1x1'];
  for (const hint of trackingHints) {
    if (cls.includes(hint) || id.includes(hint)) return true;
  }
  return false;
}

function extractImage(doc, article, pageUrl) {
  const og = pickMetaContent(doc, [
    'meta[property="og:image:secure_url"]',
    'meta[property="og:image:url"]',
    'meta[property="og:image"]'
  ]);
  if (og) return absolutizeUrl(og, pageUrl);
  const tw = pickMetaContent(doc, [
    'meta[name="twitter:image:src"]',
    'meta[property="twitter:image:src"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]'
  ]);
  if (tw) return absolutizeUrl(tw, pageUrl);
  if (article && article.content) {
    const tmp = document.createElement('div');
    tmp.innerHTML = article.content;
    const imgs = tmp.querySelectorAll('img[src]');
    for (const img of imgs) {
      const src = img.getAttribute('src') || '';
      if (!src) continue;
      if (isTrackingPixel(img)) continue;
      return absolutizeUrl(src, pageUrl);
    }
  }
  const videoPoster = doc.querySelector('video[poster]');
  if (videoPoster) {
    const poster = videoPoster.getAttribute('poster') || '';
    if (poster) return absolutizeUrl(poster, pageUrl);
  }
  const allImgs = doc.querySelectorAll('img[src]');
  for (const img of allImgs) {
    const src = img.getAttribute('src') || '';
    if (!src) continue;
    if (isTrackingPixel(img)) continue;
    if (src.startsWith('data:') && src.length < 500) continue;
    return absolutizeUrl(src, pageUrl);
  }
  const icon = pickMetaContent(doc, [
    'link[rel="apple-touch-icon-precomposed"]',
    'link[rel="apple-touch-icon"]',
    'link[rel="icon"]'
  ]);
  if (icon) return absolutizeUrl(icon, pageUrl);
  return '';
}

function extractTitle(doc, article) {
  if (article && article.title && article.title.trim()) return article.title.trim();
  const og = pickMetaContent(doc, ['meta[property="og:title"]', 'meta[name="og:title"]']);
  if (og) return og;
  const tw = pickMetaContent(doc, ['meta[name="twitter:title"]', 'meta[property="twitter:title"]']);
  if (tw) return tw;
  const t = doc.querySelector('title');
  if (t) return (t.textContent || '').trim();
  return '';
}

function extractDescription(doc, article) {
  if (article && article.excerpt && article.excerpt.length >= 30) return article.excerpt;
  const og = pickMetaContent(doc, ['meta[property="og:description"]', 'meta[name="og:description"]']);
  if (og) return og;
  const meta = pickMetaContent(doc, ['meta[name="description"]']);
  if (meta) return meta;
  const tw = pickMetaContent(doc, ['meta[name="twitter:description"]', 'meta[property="twitter:description"]']);
  if (tw) return tw;
  if (article && article.textContent) {
    return (article.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  }
  return '';
}

function extractSiteName(doc, article, pageUrl) {
  if (article && article.siteName && article.siteName.trim()) return article.siteName.trim();
  const og = pickMetaContent(doc, [
    'meta[property="og:site_name"]',
    'meta[name="application-name"]',
    'meta[name="application-name"][content]'
  ]);
  if (og) return og;
  return getHostOfUrl(pageUrl);
}

function buildPreviewFromHtml(url, html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    if (!doc.querySelector('base[href]')) {
      const baseTag = doc.createElement('base');
      baseTag.href = url;
      (doc.head || doc.documentElement).insertBefore(baseTag, (doc.head || doc.documentElement).firstChild);
    }
    const baseEl = doc.querySelector('base[href]');
    const baseHref = baseEl ? baseEl.getAttribute('href') : url;
    try { doc.baseURI = new URL(baseHref, url).href; } catch { try { doc.baseURI = url; } catch {} }

    const docClone = doc.cloneNode(true);
    const reader = new Readability(docClone, { charThreshold: 200, keepClasses: false });
    const article = reader.parse();

    const title = (extractTitle(doc, article) || '').slice(0, 200);
    const description = (extractDescription(doc, article) || '').slice(0, 500);
    const siteName = extractSiteName(doc, article, url) || getHostOfUrl(url);
    const image = extractImage(doc, article, url);

    if (!title && !description && !image) return null;

    return {
      url,
      title: title || siteName,
      description,
      excerpt: (article && article.excerpt) || description.slice(0, 200),
      byline: (article && article.byline) || '',
      siteName,
      image,
      lengthChars: (article && article.lengthChars) || description.length,
      fetchedAt: Date.now(),
      provider: 'readability'
    };
  } catch (e) {
    console.warn('[Standalone Preview] Readability \u63d0\u53d6\u5931\u8d25:', url, e);
    return null;
  }
}

// ---- 数据获取 ----

async function fetchAndRenderPreview(itemEl, url) {
  const seq = ++previewFetchSeq;
  if (previewSessionCache.has(url)) {
    const cached = previewSessionCache.get(url);
    if (itemEl !== previewHoverItem) return;
    drawPreviewFromCache(cached, itemEl);
    return;
  }
  if (itemEl !== previewHoverItem) return;

  let response;
  try {
    response = await chrome.runtime.sendMessage({ action: 'getPreview', url });
  } catch (e) {
    response = null;
  }
  if (seq !== previewFetchSeq || itemEl !== previewHoverItem) return;
  if (!response || !response.success) {
    previewSessionCache.set(url, { type: 'error' });
    showPreviewMessage(i18n('previewError') || '预览加载失败');
    return;
  }
  const result = response.result || {};
  if (result.disabled) {
    previewEnabled = false;
    previewSessionCache.set(url, { type: 'disabled' });
    showPreviewMessage(i18n('previewDisabled') || '网页预览未启用');
    return;
  }
  if (result.error) {
    previewSessionCache.set(url, { type: 'error' });
    showPreviewMessage(i18n('previewError') || '预览加载失败');
    return;
  }
  if (result.preview && (result.preview.title || result.preview.image)) {
    const entry = { type: 'ok', data: result.preview };
    previewSessionCache.set(url, entry);
    drawPreviewFromCache(entry, itemEl);
    return;
  }
  if (result.html) {
    let data = buildPreviewFromHtml(url, result.html);
    if (seq !== previewFetchSeq || itemEl !== previewHoverItem) return;
    if (!data) {
      const host = getHostOfUrl(url) || '';
      data = {
        url,
        title: itemEl.dataset.title || host,
        description: '', excerpt: '', byline: '',
        siteName: host, image: '',
        lengthChars: 0, fetchedAt: Date.now(),
        provider: 'bookmark-fallback'
      };
    }
    chrome.runtime.sendMessage({ action: 'setPreviewCache', url, preview: data }).catch(() => {});
    const entry = { type: 'ok', data };
    previewSessionCache.set(url, entry);
    drawPreviewFromCache(entry, itemEl);
    return;
  }
  const host = getHostOfUrl(url) || '';
  const fallbackData = {
    url,
    title: itemEl.dataset.title || host,
    description: '', excerpt: '', byline: '',
    siteName: host, image: '',
    lengthChars: 0, fetchedAt: Date.now(),
    provider: 'bookmark-fallback'
  };
  const entry = { type: 'ok', data: fallbackData };
  previewSessionCache.set(url, entry);
  drawPreviewFromCache(entry, itemEl);
}

function drawPreviewFromCache(entry, itemEl) {
  if (itemEl !== previewHoverItem) return;
  getPreviewCardEl();
  // 直接更新内容（零 innerHTML，零 DOM 销毁）
  if (entry.type === 'ok') {
    showPreviewContent(entry.data);
  } else if (entry.type === 'empty') {
    showPreviewMessage(i18n('previewEmpty') || '暂无可用预览');
  } else if (entry.type === 'disabled') {
    showPreviewMessage(i18n('previewDisabled') || '网页预览未启用');
  } else {
    showPreviewMessage(i18n('previewError') || '预览加载失败');
  }
  // 内容变化后用实际尺寸重新定位
  requestAnimationFrame(() => {
    if (previewHoverItem) repositionPreviewCard(previewHoverItem);
  });
}

function showPreviewForItem(itemEl) {
  if (!previewEnabled) return;
  const url = itemEl.dataset.url;
  if (!url) return;
  if (previewHoverItem === itemEl) return;
  previewHoverItem = itemEl;
  if (previewHideTimer) { clearTimeout(previewHideTimer); previewHideTimer = null; }
  if (previewShowTimer) clearTimeout(previewShowTimer);

  // 1. 确保 DOM 已构建，再显示占位内容
  getPreviewCardEl();
  showPlaceholderContent(itemEl.dataset.title, url);
  showPreviewCardEl(itemEl);

  // 2. 延迟获取完整预览
  previewShowTimer = setTimeout(() => {
    previewShowTimer = null;
    if (itemEl !== previewHoverItem) return;
    fetchAndRenderPreview(itemEl, url);
  }, PREVIEW_HOVER_DELAY);
}

// ---- 预览事件委托 ----
saContent.addEventListener('mouseover', (e) => {
  const item = e.target.closest('[data-id]');
  if (!item) return;
  if (previewHoverItem === item) return;
  showPreviewForItem(item);
});

saContent.addEventListener('mouseout', (e) => {
  const item = e.target.closest('[data-id]');
  if (!item || item !== previewHoverItem) return;
  const related = e.relatedTarget;
  if (related) {
    if (item.contains(related)) return;
    if (previewCardEl && previewCardEl.contains(related)) return;
  }
  scheduleHidePreview();
});

// 滚动、点击、ESC 关闭预览
saContent.addEventListener('scroll', () => {
  if (previewCardEl && previewCardEl.style.visibility === 'visible') hidePreviewCard();
}, true);

saContent.addEventListener('click', () => {
  if (previewCardEl && previewCardEl.style.visibility === 'visible') hidePreviewCard();
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && previewCardEl && previewCardEl.style.visibility === 'visible') {
    hidePreviewCard();
  }
});

async function loadPreviewEnabled() {
  try {
    const result = await chrome.storage.local.get('previewEnabled');
    previewEnabled = result.previewEnabled !== false;
  } catch (e) {
    previewEnabled = true;
  }
}

async function loadMdiWindowEnabled() {
  try {
    const result = await chrome.storage.local.get('mdiWindowEnabled');
    mdiWindowEnabled = result.mdiWindowEnabled === true;
  } catch (e) {
    mdiWindowEnabled = false;
  }
}

// ===== MDI 多窗口辅助 =====

function openBookmarkInWindow(url, title) {
  if (!mdiManager || !mdiWindowEnabled) return false;
  let faviconUrl = '';
  try { faviconUrl = new URL(url).origin + '/favicon.ico'; } catch {}
  mdiManager.openWindow(url, title || url, faviconUrl);
  chrome.runtime.sendMessage({ action: 'recordClick', url }).catch(() => {});
  return true;
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  if (typeof initI18n === 'function') {
    initI18n().then(() => {
      if (typeof applyI18n === 'function') applyI18n();
      startApp();
    });
  } else {
    startApp();
  }
});

// ===== 侧栏 Tab 切换 =====
function switchSidebarTab(tabName) {
  if (currentTab === tabName) return;
  currentTab = tabName;

  // 更新 Tab 按钮状态
  if (saSidebarTabs) {
    saSidebarTabs.querySelectorAll('.sa-sidebar-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
  }

  // 切换侧栏面板
  if (saSidebarBookmarks) saSidebarBookmarks.style.display = tabName === 'bookmarks' ? '' : 'none';
  if (saSidebarRss) saSidebarRss.style.display = tabName === 'rss' ? '' : 'none';

  // 切换主区域内容
  if (tabName === 'bookmarks') {
    // 切回书签：隐藏 RSS 视图，恢复书签视图
    if (window.FeedView && window.FeedView.isVisible()) {
      const feedViewEl = document.getElementById('saFeedView');
      if (feedViewEl) feedViewEl.style.display = 'none';
    }
    // 恢复书签视图
    showBookmarkViews();
    // 恢复工具栏书签专用元素
    const viewSwitch = document.querySelector('.sa-view-switch');
    if (viewSwitch) viewSwitch.style.display = '';
    const sortBtn = document.getElementById('saSortBtn');
    if (sortBtn) sortBtn.style.display = '';
    const searchWrap = document.querySelector('.sa-search-wrap');
    if (searchWrap) searchWrap.style.display = '';
    if (saSyncBtn) saSyncBtn.style.display = '';
    if (saPaletteBtn) saPaletteBtn.style.display = '';
  } else {
    // 切到 RSS：隐藏书签视图
    hideBookmarkViews();
    // 隐藏工具栏书签专用元素
    const viewSwitch = document.querySelector('.sa-view-switch');
    if (viewSwitch) viewSwitch.style.display = 'none';
    const sortBtn = document.getElementById('saSortBtn');
    if (sortBtn) sortBtn.style.display = 'none';
    const searchWrap = document.querySelector('.sa-search-wrap');
    if (searchWrap) searchWrap.style.display = 'none';
    if (saSyncBtn) saSyncBtn.style.display = 'none';
    if (saPaletteBtn) saPaletteBtn.style.display = 'none';
    // 显示 RSS 视图
    if (window.FeedView) {
      window.FeedView.show('all');
    }
  }
}

// 隐藏所有书签视图容器
function hideBookmarkViews() {
  if (saTimelineView) saTimelineView.style.display = 'none';
  if (saGridView) saGridView.style.display = 'none';
  if (saListView) saListView.style.display = 'none';
  if (saLoading) saLoading.style.display = 'none';
  if (saEmpty) saEmpty.style.display = 'none';
  if (saSearchEmpty) saSearchEmpty.style.display = 'none';
}

// 恢复书签视图（按当前视图模式）
function showBookmarkViews() {
  const target = currentViewMode === 'grid' ? saGridView
    : currentViewMode === 'list' ? saListView
    : saTimelineView;
  if (target) target.style.display = '';
}

async function startApp() {
  loadTheme();
  await loadPreviewEnabled();
  await loadMdiWindowEnabled();
  initSidebarResize();

  // 侧栏 Tab 切换事件
  if (saSidebarTabs) {
    saSidebarTabs.querySelectorAll('.sa-sidebar-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchSidebarTab(btn.dataset.tab);
      });
    });
  }

  // MDI 多窗口管理器初始化
  const mdiDesktopArea = document.getElementById('saMdiDesktopArea');
  const mdiTaskbar = document.getElementById('saMdiTaskbar');
  if (mdiDesktopArea && mdiTaskbar && typeof MDIWindowManager !== 'undefined') {
    mdiManager = new MDIWindowManager(mdiDesktopArea, mdiTaskbar, { maxWindows: 8 });
  }

  // 主题切换按钮
  const themeBtn = document.getElementById('saThemeBtn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  saLoading.style.display = 'flex';
  saEmpty.style.display = 'none';
  saSearchEmpty.style.display = 'none';

  try {
    await loadFolderTree();
    await refreshBookmarkData({ keepFilter: false });
  } catch (e) {
    console.error('Failed to initialize:', e);
    showToast(i18n('loadFailedRetry'), 'error');
  }

  // 初始化 RSS 订阅视图
  if (window.FeedView && typeof window.FeedView.init === 'function') {
    window.FeedView.init().catch((e) => console.warn('FeedView init failed:', e));
  }

  // 处理 URL 参数：?view=feeds 直接打开订阅视图（来自通知点击）
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('view') === 'feeds' && window.FeedView) {
      switchSidebarTab('rss');
    }
  } catch {}

  updateStatusBar();
}

// AI Bookmark OS entry
(function bindAiClassifyEntry() {
  const btn = document.getElementById('saAiClassifyBtn');
  if (btn) btn.addEventListener("click", () => { void openAiClassifyPanel(); });
})();

(function bindWorkspaceEntries() {
  const openTab = (path) => window.AIBookmarkPageRouter?.openOrFocusExtensionPage(path)
    ?? chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  const bookmarkNavBtn = document.getElementById('saBookmarkNavBtn');
  const checkerBtn = document.getElementById('saCheckerBtn');
  const graphBtn = document.getElementById('saGraphBtn');
  const settingsBtn = document.getElementById('saSettingsBtn');
  if (bookmarkNavBtn) bookmarkNavBtn.addEventListener('click', () => openTab('ai/bookmark-nav.html'));
  if (checkerBtn) checkerBtn.addEventListener('click', () => openTab('pages/checker/checker.html'));
  if (graphBtn) graphBtn.addEventListener('click', () => openTab('pages/graph/graph.html'));
  if (settingsBtn) settingsBtn.addEventListener('click', () => openTab('pages/settings/settings.html'));
})();


async function openAiClassifyPanel() {
  const router = window.AIBookmarkPageRouter;
  if (router?.openAiClassificationPanel) {
    await router.openAiClassificationPanel();
    return;
  }
  await (router?.openOrFocusExtensionPage('ai/sidepanel.html')
    ?? chrome.tabs.create({ url: chrome.runtime.getURL('ai/sidepanel.html') }));
}

function openAiSettingsPage() {
  window.AIBookmarkPageRouter?.openOrFocusExtensionPage('pages/settings/settings.html#ai')
    ?? chrome.tabs.create({ url: chrome.runtime.getURL('pages/settings/settings.html#ai') });
}
