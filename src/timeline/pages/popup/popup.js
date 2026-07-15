// ===== DOM 引用 =====
const $ = (id) => document.getElementById(id);
const bookmarkCount = $('bookmarkCount');
const timelineLoading = $('timelineLoading');
const timelineEmpty = $('timelineEmpty');
const timelineContent = $('timelineContent');
const searchEmpty = $('searchEmpty');
const syncBtn = $('syncBtn');
const clearBtn = $('clearBtn');
const quickBookmarkBtn = $('quickBookmarkBtn');

const paletteBtn = $('paletteBtn');
const searchInput = $('searchInput');
const searchClear = $('searchClear');
const searchSuggest = $('searchSuggest');
const toastContainer = $('toastContainer');
const editModal = $('editModal');
const editTitle = $('editTitle');
const editUrl = $('editUrl');
const editSave = $('editSave');
const editCancel = $('editCancel');
const editModalClose = $('editModalClose');
const tagBar = $('tagBar');
const tagBarScroll = tagBar.querySelector('.tag-bar-scroll');
const tagAllCount = $('tagAllCount');
const editTagsList = $('editTagsList');
const editTagInput = $('editTagInput');
const editTagSuggestions = $('editTagSuggestions');
const editFolderSelector = $('editFolderSelector');
const editFolderPath = $('editFolderPath');
const editFolderTree = $('editFolderTree');
const editFolderTreeInner = $('editFolderTreeInner');
const sortBtn = $('sortBtn');
const sortIcon = $('sortIcon');
const sortDropdown = $('sortDropdown');
const paletteModal = $('paletteModal');
const paletteInput = $('paletteInput');
const paletteResults = $('paletteResults');
const bulkActionBar = $('bulkActionBar');
const bulkCountEl = $('bulkCount');
const bulkToggleBtn = $('bulkToggleBtn');
const bulkSelectAll = $('bulkSelectAll');
const bulkPinBtn = $('bulkPinBtn');
const bulkTagBtn = $('bulkTagBtn');
const bulkDeleteBtn = $('bulkDeleteBtn');
const bulkCancelBtn = $('bulkCancelBtn');
const bulkTagModal = $('bulkTagModal');
const bulkTagInput = $('bulkTagInput');
const bulkTagAdd = $('bulkTagAdd');
const bulkTagCancel = $('bulkTagCancel');
const bulkTagClose = $('bulkTagClose');
const bulkTagSuggestions = $('bulkTagSuggestions');

// ===== 状态 =====
let allBookmarks = [];
let currentFilter = '';
let selectedTags = new Set();
let allTags = new Map();
let sortMode = 'newest';        // newest | oldest | hottest | coldest
let currentView = 'all';        // all | pinned | duplicates
let bulkMode = false;
let selectedIds = new Set();
let duplicateIds = new Set();   // 缓存重复书签的 id 集合
let paletteOpen = false;
let paletteSelectedIdx = 0;
let paletteItems = [];

// ===== Toast 提示 =====
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.remove();
  }, 2500);
}

// ===== 工具函数 =====
function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// URL 归一化：用于重复检测
function normalizeUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    // 去掉 hash、常见追踪参数、末尾斜杠
    const tracking = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref', 'ref_src'];
    tracking.forEach(p => u.searchParams.delete(p));
    let s = u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '');
    return s.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

const DEFAULT_FAVICON = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%239aa0a6%22><path d=%22M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z%22/></svg>';

const FAVICON_FALLBACKS = [
  (hostname) => `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
  (hostname) => `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`,
];

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

// 相对时间显示
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
  const secs = String(d.getSeconds()).padStart(2, '0');

  if (year === currentYear) {
    return i18n('dateSameYear', [monthLabel, String(day)]) + ` ${hours24}:${mins}:${secs}`;
  }
  return i18n('dateWithYear', [monthLabel, String(day), String(year)]) + ` ${hours24}:${mins}:${secs}`;
}

// 日期分组标题
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

  if (year === now.getFullYear()) {
    return i18n('dateSameYear', [monthLabel, String(day)]);
  }
  return i18n('dateWithYear', [monthLabel, String(day), String(year)]);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== 热力颜色系统（暖橙渐变） =====
function getHeatColor(clickCount) {
  const c = clickCount || 0;
  if (c === 0) return null; // 无背景
  // HSL 渐变: 从极浅橙到深橙
  // saturation: 65% → 95%, lightness: 96% → 42%
  const t = Math.min(c / 100, 1); // 0~1, 100次以后饱和
  const h = 30 - t * 5;           // 30 → 25
  const s = 65 + t * 30;          // 65 → 95
  const l = 96 - t * 54;          // 96 → 42
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
  const colors = ['', '#fda55a', '#f58a3a', '#e06d20', '#c4550f', '#a83c00'];
  return colors[level] || '';
}

function getHeatLabelKey(level) {
  const keys = ['', 'heatLevel1', 'heatLevel2', 'heatLevel3', 'heatLevel4', 'heatLevel5'];
  return keys[level] || '';
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getFaviconUrl(url) {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?sz=32&domain=${u.hostname}`;
  } catch {
    return '';
  }
}

// 转义正则
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ===== 模糊匹配（subsequence）+ 评分 =====
function fuzzyMatch(query, text) {
  if (!query) return { score: 1, matched: false, ranges: [] };
  const q = query.toLowerCase();
  const t = (text || '').toLowerCase();
  if (t.includes(q)) {
    // 完整子串：高分
    return { score: 100 + (q.length / t.length) * 10, matched: true, ranges: [[t.indexOf(q), t.indexOf(q) + q.length]] };
  }
  // 子序列匹配
  let qi = 0;
  const ranges = [];
  let rangeStart = -1;
  let score = 0;
  let lastMatchIdx = -2;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (i === lastMatchIdx + 1) {
        // 连续匹配加分
        score += 5;
        if (rangeStart >= 0) ranges[ranges.length - 1][1] = i + 1;
      } else {
        score += 1;
        rangeStart = i;
        ranges.push([i, i + 1]);
      }
      // 词首匹配更高
      if (i === 0 || t[i - 1] === ' ' || t[i - 1] === '/' || t[i - 1] === '.') score += 3;
      lastMatchIdx = i;
      qi++;
    }
  }
  if (qi < q.length) return { score: 0, matched: false, ranges: [] };
  return { score, matched: true, ranges };
}

// 高亮匹配的字符
function highlightText(text, ranges) {
  if (!text || !ranges || ranges.length === 0) return escapeHtml(text);
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let html = '';
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start < cursor) continue; // 重叠
    if (cursor < start) html += escapeHtml(text.slice(cursor, start));
    html += `<mark class="hl">${escapeHtml(text.slice(start, end))}</mark>`;
    cursor = end;
  }
  if (cursor < text.length) html += escapeHtml(text.slice(cursor));
  return html;
}

// ===== 智能搜索（多字段 + 评分排序） =====
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
          if (!bestField || s > bestField.score) {
            bestField = { ...r, score: s, key: f.key };
          }
        }
      }
      if (!bestField) { allMatched = false; break; }
      totalScore += bestField.score;
      ranges[bestField.key].push(...bestField.ranges);
    }

    if (allMatched && totalScore > 0) {
      results.push({ item, score: totalScore, ranges });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// ===== 重复检测 =====
function computeDuplicates(list) {
  const groups = new Map(); // normalizedUrl -> [ids]
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

// 刷新书签数据：先刷新历史点击次数，再拉 storage → 重建 allTags → 渲染标签栏与时间线
async function refreshBookmarkData({ keepFilter = true } = {}) {
  // 从 Chrome 历史记录同步最新的点击次数
  await chrome.runtime.sendMessage({ action: 'refreshClickCounts' }).catch(() => {});
  const res = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
  if (res && res.success) {
    allBookmarks = res.bookmarks || res.data || [];
    await collectAllTags();
    renderTagBar();
    if (keepFilter) {
      filterBookmarks(searchInput.value);
    }
  }
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

function renderTagBar() {
  const allBtn = tagBarScroll.querySelector('[data-tag="__all__"]');
  tagBarScroll.innerHTML = '';
  tagBarScroll.appendChild(allBtn);

  tagAllCount.textContent = allBookmarks.length;

  const sortedTags = Array.from(allTags.entries()).sort((a, b) => b[1].count - a[1].count);
  for (const [tagName, { count, color }] of sortedTags) {
    const chip = document.createElement('button');
    chip.className = 'tag-chip';
    chip.dataset.tag = tagName;
    if (selectedTags.has(tagName)) chip.classList.add('active');
    chip.innerHTML = `
      <span class="tag-chip-color" style="background: ${color}"></span>
      <span class="tag-chip-label">${escapeHtml(tagName)}</span>
      <span class="tag-chip-count">${count}</span>
    `;
    tagBarScroll.appendChild(chip);
  }
}

function handleTagClick(e) {
  const chip = e.target.closest('.tag-chip');
  if (!chip) return;
  const tag = chip.dataset.tag;
  if (tag === '__all__') {
    selectedTags.clear();
  } else {
    if (selectedTags.has(tag)) selectedTags.delete(tag);
    else selectedTags.add(tag);
  }
  renderTagBar();
  filterBookmarks(searchInput.value);
}

tagBarScroll.addEventListener('click', handleTagClick);

function filterByTags(bookmarks) {
  if (selectedTags.size === 0) return bookmarks;
  return bookmarks.filter(item => {
    if (!item.tags || item.tags.length === 0) return false;
    return item.tags.some(tag => selectedTags.has(tag));
  });
}

// ===== 分页渲染状态 =====
const PAGE_SIZE = 50;
let renderQueue = [];
let renderedCount = 0;
let isLoadingMore = false;
let currentGroupLabel = '';
let currentHighlightRanges = null; // 用于搜索高亮

// SVG 图标常量
const SVG_OPEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
const SVG_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const SVG_DELETE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const SVG_PIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const SVG_PIN_FILL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
const SVG_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const SVG_MORE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';

// 渲染时间轴
function renderTimeline(bookmarks) {
  renderQueue = [];
  renderedCount = 0;
  currentGroupLabel = '';
  currentHighlightRanges = null;

  if (!bookmarks || bookmarks.length === 0) {
    timelineContent.style.display = 'none';
    timelineEmpty.style.display = 'flex';
    searchEmpty.style.display = 'none';
    bookmarkCount.textContent = '0';
    return;
  }

  timelineEmpty.style.display = 'none';
  timelineContent.style.display = 'block';
  searchEmpty.style.display = 'none';
  bookmarkCount.textContent = bookmarks.length;

  // 判断是否为热度排序模式（扁平列表，无时间轴）
  const isHeatMode = sortMode === 'hottest' || sortMode === 'coldest';

  if (currentHighlightRanges) {
    // 搜索模式：扁平展示
    for (const item of bookmarks) {
      const ranges = currentHighlightRanges.get(item.id) || null;
      renderQueue.push({ type: 'item', data: item, ranges });
    }
  } else if (isHeatMode) {
    // 热度排序模式：扁平列表，无日期分组，无时间轴竖线
    timelineContent.classList.add('timeline--flat');
    const sorted = [...bookmarks].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      const ca = a.clickCount || 0;
      const cb = b.clickCount || 0;
      return sortMode === 'hottest' ? cb - ca : ca - cb;
    });
    for (const item of sorted) {
      renderQueue.push({ type: 'item', data: item });
    }
  } else {
    // 时间轴模式（最新/最旧）
    timelineContent.classList.remove('timeline--flat');
    const sorted = [...bookmarks].sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return sortMode === 'newest' ? b.dateAdded - a.dateAdded : a.dateAdded - b.dateAdded;
    });

    const groups = new Map();
    for (const item of sorted) {
      const label = getDateGroupLabel(item.dateAdded);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    }

    // 置顶分组置顶显示
    const pinnedItems = sorted.filter(i => i.pinned);
    if (pinnedItems.length > 0) {
      renderQueue.push({ type: 'header', label: i18n('pinnedGroup'), count: pinnedItems.length, pinnedGroup: true });
      for (const item of pinnedItems) renderQueue.push({ type: 'item', data: item });
    }

    for (const [label, items] of groups) {
      const nonPinned = items.filter(i => !i.pinned);
      if (nonPinned.length === 0) continue;
      renderQueue.push({ type: 'header', label, count: nonPinned.length });
      for (const item of nonPinned) renderQueue.push({ type: 'item', data: item });
    }
  }

  timelineContent.innerHTML = '';
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
      groupDiv.className = 'date-group' + (entry.pinnedGroup ? ' date-group--pinned' : '');
      groupDiv.dataset.label = entry.label;
      const icon = entry.pinnedGroup ? SVG_PIN_FILL : '';
      groupDiv.innerHTML = `<div class="date-header"><span class="date-label">${icon}${escapeHtml(entry.label)}</span><span class="date-count">${i18n('bookmarkCount', [String(entry.count)])}</span></div>`;
      fragment.appendChild(groupDiv);
    } else {
      const item = entry.data;
      const el = createBookmarkElement(item, currentGroupLabel, entry.ranges);
      if (groupDiv) {
        groupDiv.appendChild(el);
      } else {
        // 扁平模式（热度排序）：直接追加到 fragment
        fragment.appendChild(el);
      }
    }
  }

  renderedCount = end;

  const oldSentinel = timelineContent.querySelector('.load-more-sentinel');
  if (oldSentinel) oldSentinel.remove();

  if (renderedCount < renderQueue.length) {
    const sentinel = document.createElement('div');
    sentinel.className = 'load-more-sentinel';
    sentinel.innerHTML = `<div class="loading-dots"><span></span><span></span><span></span></div>`;
    fragment.appendChild(sentinel);
  }

  timelineContent.appendChild(fragment);

  // 扁平模式不计算时间轴竖线位置
  if (!timelineContent.classList.contains('timeline--flat') && renderedCount <= PAGE_SIZE) {
    const firstHeader = timelineContent.querySelector('.date-header');
    if (firstHeader) {
      const group = firstHeader.closest('.date-group');
      const circleTop = (group ? group.offsetTop : 0) + firstHeader.offsetTop + firstHeader.offsetHeight / 2;
      timelineContent.style.setProperty('--line-top', circleTop + 'px');
    }
  }

  isLoadingMore = false;
}

function createBookmarkElement(item, groupLabel, highlightRanges) {
  let favicon, hostname;
  try {
    const u = new URL(item.url);
    favicon = `${u.origin}/favicon.ico`;
    hostname = u.hostname;
  } catch {
    favicon = '';
    hostname = '';
  }
  const domain = hostname.replace(/^www\./, '');
  const time = formatRelativeTime(item.dateAdded);
  const untitledText = i18n('untitled');

  // 热力数据
  const clickCount = item.clickCount || 0;
  const heatColor = getHeatColor(clickCount);
  const heatLevel = getHeatLevel(clickCount);
  const heatDotColor = getHeatDotColor(heatLevel);

  const div = document.createElement('div');
  div.className = 'bookmark-item' + (item.pinned ? ' bookmark-item--pinned' : '');
  if (heatColor) div.classList.add('bookmark-item--heat');
  if (duplicateIds.has(item.id)) div.classList.add('bookmark-item--dup');
  if (bulkMode) div.classList.add('bookmark-item--bulk');
  if (selectedIds.has(item.id)) div.classList.add('bookmark-item--selected');
  if (heatColor) {
    div.style.background = `linear-gradient(to right, ${heatColor}, transparent 120%)`;
  }
  // 热力背景下的文字对比度：按点击次数渐变加深
  if (clickCount > 0) {
    const t = Math.min(clickCount / 60, 1);
    // 标题：从 #202124 向 #1a0e00 渐变
    const titleR = Math.round(0x20 - (0x20 - 0x1a) * t);
    const titleG = Math.round(0x21 - (0x21 - 0x0e) * t);
    const titleB = Math.round(0x24 - (0x24 - 0x00) * t);
    // 域名：从 #80868b 向 #4a2a10 渐变
    const domainR = Math.round(0x80 - (0x80 - 0x4a) * t);
    const domainG = Math.round(0x86 - (0x86 - 0x2a) * t);
    const domainB = Math.round(0x8b - (0x8b - 0x10) * t);
    // 时间：从 #9aa0a6 向 #6a4a2a 渐变
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
  div.dataset.group = groupLabel;

  // 标题高亮
  const titleHtml = highlightRanges?.title?.length
    ? highlightText(item.title, highlightRanges.title)
    : escapeHtml(item.title) || `<span style="color:var(--text-disabled)">${escapeHtml(untitledText)}</span>`;

  // URL 高亮
  const urlHtml = highlightRanges?.url?.length
    ? highlightText(item.url, highlightRanges.url)
    : escapeHtml(domain);

  // 标签
  let tagsHtml = '';
  if (item.tags && item.tags.length > 0) {
    const tagChips = item.tags.slice(0, 2).map(tag => {
      const color = allTags.get(tag)?.color || '#9aa0a6';
      return `<span class="bookmark-tag" style="background:${color}20;color:${color}"><span class="bookmark-tag-dot" style="background:${color}"></span>${escapeHtml(tag)}</span>`;
    }).join('');
    const extra = item.tags.length > 2 ? `<span class="bookmark-tag" style="background:#9aa0a620;color:#9aa0a6">+${item.tags.length - 2}</span>` : '';
    tagsHtml = `<div class="bookmark-tags">${tagChips}${extra}</div>`;
  }

  // 点击次数显示
  let heatInfoHtml = '';
  if (clickCount > 0) {
    heatInfoHtml = `<span class="bookmark-heat-info"><span class="bookmark-heat-dot" style="background:${heatDotColor}"></span>${clickCount}</span>`;
  }

  const dupBadge = duplicateIds.has(item.id) ? `<span class="dup-badge" title="${i18n('duplicate')}">${i18n('dupBadge')}</span>` : '';
  const checkboxHtml = bulkMode
    ? `<span class="bookmark-checkbox">${selectedIds.has(item.id) ? SVG_CHECK : ''}</span>`
    : '';

  div.innerHTML = `
    ${checkboxHtml}
    <img class="bookmark-favicon" src="${favicon}" alt="" loading="lazy" data-hostname="${hostname}" data-fallback-idx="0">
    <div class="bookmark-info">
      <div class="bookmark-title" title="${escapeHtml(item.title)}"><span class="bookmark-title-text">${titleHtml}</span>${dupBadge}</div>
      <div class="bookmark-meta">
        <div class="bookmark-meta-row">
          <span class="bookmark-domain">${urlHtml}</span>
          ${heatInfoHtml}
          ${tagsHtml}
        </div>
        <span class="bookmark-time">${time}</span>
      </div>
    </div>
    <div class="bookmark-actions">
      <button class="action-btn action-btn--more" title="${i18n('moreActions')}" data-action="more">${SVG_MORE}</button>
    </div>
  `;

  return div;
}

// ===== 事件委托 =====
// 事件委托：favicon 加载失败时回退（Manifest V3 CSP 禁止内联 onerror）
timelineContent.addEventListener('error', (e) => {
  if (e.target.classList.contains('bookmark-favicon')) {
    handleFaviconError(e.target);
  }
}, true); // capture 阶段捕获，error 事件不冒泡

timelineContent.addEventListener('click', (e) => {
  const item = e.target.closest('.bookmark-item');
  if (!item) return;

  const actionBtn = e.target.closest('.action-btn');
  const id = item.dataset.id;
  const url = item.dataset.url;
  const title = item.dataset.title;

  if (actionBtn) {
    e.stopPropagation();
    if (actionBtn.dataset.action === 'more') {
      openBookmarkMenu(actionBtn, id, url, title);
    }
    return;
  }

  if (bulkMode) {
    e.stopPropagation();
    toggleSelect(id, item);
    return;
  }

  closeBookmarkMenu();
  chrome.tabs.create({ url });
  // 异步记录点击（无需等待结果）
  chrome.runtime.sendMessage({ action: 'recordClick', url }).catch(() => {});
});

// ===== 单本操作菜单（极简三点弹出） =====
let bookmarkMenuEl = null;
let bookmarkMenuTargetBtn = null;

function ensureBookmarkMenu() {
  if (bookmarkMenuEl) return bookmarkMenuEl;
  const el = document.createElement('div');
  el.className = 'bookmark-menu';
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
    <button class="bookmark-menu-item" role="menuitem" data-action="open">${SVG_OPEN}<span>${escapeHtml(i18n('openLink'))}</span></button>
    <button class="bookmark-menu-item" role="menuitem" data-action="pin">${isPinned ? SVG_PIN_FILL : SVG_PIN}<span>${escapeHtml(pinText)}</span></button>
    <button class="bookmark-menu-item" role="menuitem" data-action="edit">${SVG_EDIT}<span>${escapeHtml(i18n('edit'))}</span></button>
    <div class="bookmark-menu-sep" role="separator"></div>
    <button class="bookmark-menu-item bookmark-menu-item--danger" role="menuitem" data-action="delete">${SVG_DELETE}<span>${escapeHtml(i18n('delete'))}</span></button>
  `;

  el._context = { id, url, title };

  // 定位：默认在按钮下方，右对齐
  const rect = btn.getBoundingClientRect();
  el.style.visibility = 'hidden';
  el.classList.add('bookmark-menu--open');
  const menuW = el.offsetWidth || 180;
  const menuH = el.offsetHeight || 200;
  const margin = 6;
  let left = rect.right - menuW;
  let top = rect.bottom + margin;
  // 防止溢出右边界
  if (left < 4) left = 4;
  // 防止溢出下边界，翻到上方
  if (top + menuH > window.innerHeight - 4) {
    top = rect.top - menuH - margin;
    if (top < 4) top = 4;
  }
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.visibility = 'visible';

  // 标记当前按钮为激活态，方便用户识别
  if (bookmarkMenuTargetBtn) bookmarkMenuTargetBtn.classList.remove('action-btn--active');
  bookmarkMenuTargetBtn = btn;
  btn.classList.add('action-btn--active');
}

function closeBookmarkMenu() {
  if (!bookmarkMenuEl) return;
  bookmarkMenuEl.classList.remove('bookmark-menu--open');
  if (bookmarkMenuTargetBtn) {
    bookmarkMenuTargetBtn.classList.remove('action-btn--active');
    bookmarkMenuTargetBtn = null;
  }
}

function isBookmarkMenuOpen() {
  return bookmarkMenuEl && bookmarkMenuEl.classList.contains('bookmark-menu--open');
}

document.addEventListener('click', (e) => {
  if (!isBookmarkMenuOpen()) return;
  if (e.target.closest('.bookmark-menu')) return;
  if (e.target.closest('.action-btn--more')) return;
  closeBookmarkMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isBookmarkMenuOpen()) {
    closeBookmarkMenu();
  }
});

document.addEventListener('scroll', (e) => {
  if (!isBookmarkMenuOpen()) return;
  // 仅在弹窗内滚动时关闭，window 滚动忽略
  if (e.target === document || e.target === document.documentElement) return;
  closeBookmarkMenu();
}, true);

function handleBookmarkMenuItemClick(action) {
  if (!bookmarkMenuEl || !bookmarkMenuEl._context) return;
  const { id, url, title } = bookmarkMenuEl._context;
  const itemEl = document.querySelector(`.bookmark-item[data-id="${CSS.escape(id)}"]`);
  if (action === 'open') {
    chrome.tabs.create({ url });
    chrome.runtime.sendMessage({ action: 'recordClick', url }).catch(() => {});
  } else if (action === 'edit') {
    const bookmark = allBookmarks.find(b => b.id === id);
    openEditModal(id, title, url, bookmark?.tags || [], bookmark);
  } else if (action === 'delete') {
    deleteBookmark(id, url, itemEl);
  } else if (action === 'pin') {
    togglePin(id, itemEl);
  }
}

document.addEventListener('click', (e) => {
  const menuItem = e.target.closest('.bookmark-menu-item');
  if (!menuItem) return;
  const action = menuItem.dataset.action;
  closeBookmarkMenu();
  handleBookmarkMenuItemClick(action);
});

// ===== Hover 预览卡片 (Mozilla Readability) =====
const PREVIEW_HOVER_DELAY = 200;   // 鼠标停留多久后展示
const PREVIEW_HIDE_DELAY = 120;    // 鼠标移出后多久关闭（给移到卡片上的窗口）

let previewCardEl = null;
let previewHoverItem = null;
let previewShowTimer = null;
let previewHideTimer = null;
let previewFetchSeq = 0;
let previewEnabled = true;
const previewSessionCache = new Map(); // url -> { type: 'ok'|'empty'|'disabled'|'error', data? }

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
  el.id = 'previewCard';
  el.className = 'preview-card';
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
  const existing = document.getElementById('previewCard');
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
  const cardW = _lastCardRect ? _lastCardRect.width : 280;
  const cardH = _lastCardRect ? _lastCardRect.height : 100;

  const itemCenterX = rect.left + rect.width / 2;
  let left = Math.round(itemCenterX - cardW / 2);
  if (left < 4) left = 4;
  if (left + cardW > vw - 4) left = Math.max(4, vw - cardW - 4);

  let top = Math.round(rect.top - cardH - margin);
  if (top < 4) top = Math.round(rect.bottom + margin);
  if (top + cardH > vh - 4) top = Math.max(4, vh - cardH - 4);

  return { left, top };
}

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
  previewCardEl.style.transform = `translate3d(${pos.left}px, ${pos.top}px, 0)`;
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
  el.style.visibility = 'visible';
  el.style.opacity = '0';
  el.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => {
    el.style.transition = '';
    el.style.opacity = '1';
    el.style.transform = `translate3d(${pos.left}px, ${pos.top}px, 0) scale(1)`;
    repositionPreviewCard(itemEl);
  });
}

function hidePreviewCard() {
  if (previewShowTimer) { clearTimeout(previewShowTimer); previewShowTimer = null; }
  if (previewHideTimer) { clearTimeout(previewHideTimer); previewHideTimer = null; }
  if (!previewCardEl) return;

  previewCardEl.style.opacity = '0';
  previewCardEl.setAttribute('aria-hidden', 'true');

  const cleanup = () => {
    previewCardEl.removeEventListener('transitionend', cleanup);
    if (previewCardEl.style.opacity === '0') {
      previewCardEl.style.visibility = 'hidden';
      resetPreviewContent();
    }
  };
  previewCardEl.addEventListener('transitionend', cleanup);
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
  try { host = new URL(url).host; } catch (e) { host = url; }

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

    const checkImgSize = () => {
      const nw = previewImgEl.naturalWidth, nh = previewImgEl.naturalHeight;
      if (!nw || !nh) return;
      const MIN_W = 60, MAX_W = 120, MIN_H = 60, MAX_H = 100;
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
        if (previewHoverItem) {
          requestAnimationFrame(() => {
            if (previewHoverItem) repositionPreviewCard(previewHoverItem);
          });
        }
      }, { once: true });
    }
  } else {
    previewMediaEl.style.display = '';
    previewImgEl.style.display = 'none';
    previewPlaceholderEl.style.display = '';
    previewPlaceholderInitialEl.textContent = getSiteInitial(siteName, data.url || '');
    previewPlaceholderHostEl.textContent = siteName;
    previewMediaEl.style.width = '80px';
    previewMediaEl.style.height = '80px';
  }

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
    img.style.display = 'none';
    previewPlaceholderEl.style.display = '';
    previewPlaceholderInitialEl.textContent = initial;
    previewPlaceholderHostEl.textContent = host;
  } catch (e) {
    img.style.display = 'none';
    previewPlaceholderEl.style.display = '';
  }
};

function escapePreviewAttr(s) {
  return (s == null ? '' : String(s))
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ===== Readability 解析辅助 =====

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

function getHostOfUrl(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function getSiteInitial(siteName, url) {
  const s = (siteName || getHostOfUrl(url) || '?').trim();
  return (s[0] || '?').toUpperCase();
}

// 多级 fallback 取缩略图（Readability 自身不返回 image）
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
  if (article && article.excerpt && article.excerpt.length >= 30) {
    return article.excerpt;
  }
  const og = pickMetaContent(doc, [
    'meta[property="og:description"]',
    'meta[name="og:description"]'
  ]);
  if (og) return og;
  const meta = pickMetaContent(doc, ['meta[name="description"]']);
  if (meta) return meta;
  const tw = pickMetaContent(doc, [
    'meta[name="twitter:description"]',
    'meta[property="twitter:description"]'
  ]);
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
    try {
      doc.baseURI = new URL(baseHref, url).href;
    } catch {
      try { doc.baseURI = url; } catch {}
    }
    const docClone = doc.cloneNode(true);
    const reader = new Readability(docClone, {
      charThreshold: 200,
      keepClasses: false
    });
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
    console.warn('[Preview] Readability \u63d0\u53d6\u5931\u8d25:', url, e);
    return null;
  }
}

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
  if (entry.type === 'ok') {
    showPreviewContent(entry.data);
  } else if (entry.type === 'empty') {
    showPreviewMessage(i18n('previewEmpty') || '暂无可用预览');
  } else if (entry.type === 'disabled') {
    showPreviewMessage(i18n('previewDisabled') || '网页预览未启用');
  } else {
    showPreviewMessage(i18n('previewError') || '预览加载失败');
  }
  requestAnimationFrame(() => {
    if (previewHoverItem) repositionPreviewCard(previewHoverItem);
  });
}

function showPreviewForItem(itemEl) {
  if (!previewEnabled) {
    return;
  }
  const url = itemEl.dataset.url;
  if (!url) {
    return;
  }
  if (previewHoverItem === itemEl) return;
  previewHoverItem = itemEl;
  if (previewHideTimer) { clearTimeout(previewHideTimer); previewHideTimer = null; }
  if (previewShowTimer) clearTimeout(previewShowTimer);
  // 确保 DOM 已构建，再显示占位内容
  getPreviewCardEl();
  showPlaceholderContent(itemEl.dataset.title, url);
  showPreviewCardEl(itemEl);
  // 然后延迟抓取完整预览
  previewShowTimer = setTimeout(() => {
    previewShowTimer = null;
    if (itemEl !== previewHoverItem) return;
    fetchAndRenderPreview(itemEl, url);
  }, PREVIEW_HOVER_DELAY);
}

// 委托：mouseover/mouseout 改为用 closest 找到 .bookmark-item 后再做匹配
timelineContent.addEventListener('mouseover', (e) => {
  const item = e.target.closest('.bookmark-item');
  if (!item) return;
  if (previewHoverItem === item) return;
  showPreviewForItem(item);
});

timelineContent.addEventListener('mouseout', (e) => {
  const item = e.target.closest('.bookmark-item');
  if (!item || item !== previewHoverItem) return;
  const related = e.relatedTarget;
  if (related) {
    if (item.contains(related)) return;
    if (previewCardEl && previewCardEl.contains(related)) return;
  }
  scheduleHidePreview();
});

// 滚动、视图切换、ESC 关闭
document.querySelector('.main').addEventListener('scroll', () => {
  if (previewCardEl && previewCardEl.style.visibility === 'visible') hidePreviewCard();
}, true);

document.querySelector('.view-tabs')?.addEventListener('click', () => {
  hidePreviewCard();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && previewCardEl && previewCardEl.style.visibility === 'visible') {
    hidePreviewCard();
  }
});

// 点击书签（即将打开）后隐藏
timelineContent.addEventListener('click', (e) => {
  const item = e.target.closest('.bookmark-item');
  if (!item) return;
  if (previewCardEl && previewCardEl.style.visibility === 'visible') hidePreviewCard();
}, true);

async function loadPreviewEnabled() {
  try {
    const result = await chrome.storage.local.get('previewEnabled');
    previewEnabled = result.previewEnabled !== false;
  } catch (e) {
    previewEnabled = true;
  }
}

// 监听开关变化（用户在设置页改了后立即生效）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.previewEnabled) {
    previewEnabled = changes.previewEnabled.newValue !== false;
    if (!previewEnabled) hidePreviewCard();
  }
});

document.querySelector('.main').addEventListener('scroll', function () {
  if (isLoadingMore) return;
  if (renderedCount >= renderQueue.length) return;
  if (this.scrollTop + this.clientHeight >= this.scrollHeight - 100) {
    renderNextPage();
  }
});

// ===== 编辑弹窗 =====
let editingBookmarkId = null;
let editingTags = [];
let editingFolderId = null;     // 当前书签所在文件夹 ID
let editingSelectedFolderId = null; // 用户在树中选择的文件夹 ID
let allFolderTree = [];         // 缓存所有文件夹列表

function openEditModal(id, title, url, tags = [], bookmarkData = null) {
  editingBookmarkId = id;
  editingTags = [...tags];
  editingFolderId = null;
  editingSelectedFolderId = null;
  editTitle.value = title || '';
  editUrl.value = url || '';
  renderEditTags();
  editFolderTree.style.display = 'none';
  editFolderPath.textContent = i18n('loading');
  editModal.style.display = 'flex';

  // 异步加载文件夹树
  loadFolderTree(id);

  // 异步加载智能目录建议
  loadFolderSuggestion(url, title);
}

// 加载智能目录建议
async function loadFolderSuggestion(url, title) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'suggestFolder', url, title });
    if (res && res.success && res.folder) {
      showFolderSuggestion(res.folder);
    }
  } catch (e) {
    // 静默处理
  }
}

function showFolderSuggestion(folder) {
  // 移除已有建议
  const existing = document.getElementById('folderSuggestion');
  if (existing) existing.remove();

  if (!folder || !folder.path) return;

  const suggestion = document.createElement('div');
  suggestion.id = 'folderSuggestion';
  suggestion.className = 'folder-suggestion';
  suggestion.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
    <span class="folder-suggestion-text">${i18n('suggestedFolder') || '建议目录'}: <strong>${escapeHtml(folder.path)}</strong></span>
    <button class="folder-suggestion-apply">${i18n('apply') || '应用'}</button>
    <button class="folder-suggestion-dismiss">×</button>
  `;

  suggestion.querySelector('.folder-suggestion-apply').addEventListener('click', async () => {
    if (folder.id) {
      editingSelectedFolderId = folder.id;
      renderFolderPath(folder.id);
      renderFolderTree(folder.id);
      editFolderTree.style.display = 'none';
      showToast(`${i18n('editLocation')}: ${folder.path}`, 'success');
    }
    suggestion.remove();
  });

  suggestion.querySelector('.folder-suggestion-dismiss').addEventListener('click', () => {
    suggestion.remove();
  });

  // 插入到文件夹选择器之前
  editFolderSelector.parentNode.insertBefore(suggestion, editFolderSelector);
}

function closeEditModal() {
  editModal.style.display = 'none';
  editingBookmarkId = null;
  editingTags = [];
  editingFolderId = null;
  editingSelectedFolderId = null;
  editTagInput.value = '';
  editTagSuggestions.classList.remove('show');
  editFolderTree.style.display = 'none';
  // 清除目录建议
  const suggestion = document.getElementById('folderSuggestion');
  if (suggestion) suggestion.remove();
}

// ===== 文件夹树加载与渲染 =====
async function loadFolderTree(bookmarkId) {
  try {
    // 获取当前书签所在文件夹
    const nodes = await chrome.bookmarks.get(bookmarkId);
    const currentNode = nodes && nodes[0];
    const currentParentId = currentNode ? currentNode.parentId : null;
    editingFolderId = currentParentId;
    editingSelectedFolderId = currentParentId;

    // 获取完整书签树
    const tree = await chrome.bookmarks.getTree();
    allFolderTree = [];
    flattenFolderTree(tree, '');

    renderFolderPath(currentParentId);
    renderFolderTree(currentParentId);
  } catch (err) {
    console.error('加载文件夹树失败:', err);
    editFolderPath.textContent = i18n('loadFailed');
  }
}

function flattenFolderTree(nodes, parentPath) {
  for (const node of nodes) {
    if (!node.children) continue; // 跳过叶子节点（书签）
    const currentPath = parentPath ? `${parentPath} / ${node.title}` : node.title;
    allFolderTree.push({ id: node.id, title: node.title, path: currentPath });
    if (node.children && node.children.length > 0) {
      flattenFolderTree(node.children, currentPath);
    }
  }
}

function renderFolderPath(folderId) {
  const folder = allFolderTree.find(f => f.id === folderId);
  editFolderPath.textContent = folder ? folder.path : i18n('rootFolder');
}

function renderFolderTree(selectedId) {
  editFolderTreeInner.innerHTML = '';
  for (const folder of allFolderTree) {
    const item = document.createElement('div');
    item.className = 'folder-tree-item' + (folder.id === selectedId ? ' folder-tree-item--selected' : '');
    item.dataset.id = folder.id;
    item.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
      </svg>
      <span class="folder-name">${escapeHtml(folder.title)}</span>
    `;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      editingSelectedFolderId = folder.id;
      renderFolderPath(folder.id);
      renderFolderTree(folder.id);
      editFolderTree.style.display = 'none';
    });
    editFolderTreeInner.appendChild(item);
  }
}

// 切换文件夹树显示
editFolderSelector.addEventListener('click', () => {
  const isHidden = editFolderTree.style.display === 'none';
  editFolderTree.style.display = isHidden ? 'block' : 'none';
  if (isHidden && allFolderTree.length > 0) {
    renderFolderTree(editingSelectedFolderId || editingFolderId);
  }
});

// ===== 编辑保存 =====
async function handleEditSave() {
  if (!editingBookmarkId) return;
  const title = editTitle.value.trim();
  const url = editUrl.value.trim();
  if (!url) { showToast(i18n('editFailed'), 'error'); return; }
  try {
    const targetFolderId = editingSelectedFolderId || editingFolderId;
    const result = await chrome.runtime.sendMessage({
      action: 'updateBookmark',
      id: editingBookmarkId,
      title, url, tags: editingTags
    });
    if (!result || !result.success) {
      showToast(i18n('editFailed'), 'error');
      return;
    }

    if (targetFolderId && targetFolderId !== editingFolderId) {
      try {
        await chrome.bookmarks.move(editingBookmarkId, { parentId: targetFolderId });
        showToast(i18n('editAndMoveSuccess'), 'success');
      } catch (moveErr) {
        console.error('移动文件夹失败:', moveErr);
        showToast(i18n('editSuccess'), 'success');
        showToast(i18n('moveFailed'), 'error');
      }
    } else {
      showToast(i18n('editSuccess'), 'success');
    }
    closeEditModal();
    loadBookmarks();
  } catch (err) {
    console.error('更新失败:', err);
    showToast(i18n('editFailed'), 'error');
  }
}

// ===== 标签编辑辅助函数 =====
function renderEditTags() {
  editTagsList.innerHTML = '';
  editingTags.forEach((tag, index) => {
    const chip = document.createElement('span');
    chip.className = 'edit-tag-chip';
    const color = allTags.get(tag)?.color || '#9aa0a6';
    chip.style.background = `${color}20`;
    chip.style.color = color;
    chip.innerHTML = `
      ${escapeHtml(tag)}
      <button class="edit-tag-remove" data-index="${index}">×</button>
    `;
    editTagsList.appendChild(chip);
  });
}

function addTag(tagName) {
  const trimmed = tagName.trim();
  if (!trimmed) return;
  if (editingTags.includes(trimmed)) {
    showToast(i18n('tagAlreadyExists'), 'warning');
    return;
  }
  editingTags.push(trimmed);
  renderEditTags();
  editTagInput.value = '';
  editTagSuggestions.classList.remove('show');
}

function removeTag(index) {
  editingTags.splice(index, 1);
  renderEditTags();
}

function showTagSuggestions(query) {
  const q = query.trim().toLowerCase();
  if (!q) { editTagSuggestions.classList.remove('show'); return; }
  const matches = Array.from(allTags.keys())
    .filter(tag => tag.toLowerCase().includes(q) && !editingTags.includes(tag))
    .slice(0, 5);
  if (matches.length === 0) { editTagSuggestions.classList.remove('show'); return; }
  editTagSuggestions.innerHTML = '';
  matches.forEach(tag => {
    const div = document.createElement('div');
    div.className = 'edit-tag-suggestion';
    div.textContent = tag;
    div.addEventListener('click', () => addTag(tag));
    editTagSuggestions.appendChild(div);
  });
  editTagSuggestions.classList.add('show');
}

editTagsList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('.edit-tag-remove');
  if (removeBtn) {
    const index = parseInt(removeBtn.dataset.index);
    removeTag(index);
  }
});

editTagInput.addEventListener('input', (e) => showTagSuggestions(e.target.value));
editTagInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addTag(editTagInput.value); }
  else if (e.key === 'Escape') { editTagInput.value = ''; editTagSuggestions.classList.remove('show'); }
});

editSave.addEventListener('click', handleEditSave);
editCancel.addEventListener('click', closeEditModal);
editModalClose.addEventListener('click', closeEditModal);
editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

// ===== 搜索过滤（智能 + 多字段） =====
function filterBookmarks(query) {
  currentFilter = query.trim();

  let filtered = allBookmarks;
  filtered = filterByTags(filtered);

  // 视图筛选
  if (currentView === 'pinned') {
    filtered = filtered.filter(b => b.pinned);
  } else if (currentView === 'duplicates') {
    filtered = filtered.filter(b => duplicateIds.has(b.id));
  }

  if (currentFilter) {
    const results = smartSearch(currentFilter, filtered);
    filtered = results.map(r => r.item);
    currentHighlightRanges = new Map();
    for (const r of results) currentHighlightRanges.set(r.item.id, r.ranges);
  } else {
    currentHighlightRanges = null;
  }

  if (filtered.length === 0) {
    timelineContent.style.display = 'none';
    const hasActiveFilter = !!currentFilter || selectedTags.size > 0 || currentView !== 'all';
    timelineEmpty.style.display = allBookmarks.length === 0 && !hasActiveFilter ? 'flex' : 'none';
    searchEmpty.style.display = allBookmarks.length === 0 && !hasActiveFilter ? 'none' : 'flex';
    bookmarkCount.textContent = '0';
  } else {
    renderTimeline(filtered);
  }
}

// ===== 加载书签数据 =====
async function loadBookmarks() {
  timelineLoading.style.display = 'flex';
  timelineContent.style.display = 'none';
  timelineEmpty.style.display = 'none';
  searchEmpty.style.display = 'none';

  try {
    const result = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
    if (result && result.success) {
      allBookmarks = (result.bookmarks || []).map(b => ({
        ...b,
        pinned: !!b.pinned
      }));
      duplicateIds = computeDuplicates(allBookmarks);
      await collectAllTags();
      renderTagBar();
      // 防御性：包一层 try/catch，避免 createBookmarkElement 等内部异常导致 renderQueue 为空
      try {
        filterBookmarks(searchInput.value);
      } catch (innerErr) {
        console.error('filterBookmarks 失败，回退到 renderTimeline:', innerErr);
        renderTimeline(allBookmarks);
      }
    } else {
      showToast(i18n('loadFailed'), 'error');
    }
  } catch (err) {
    console.error('加载书签失败:', err);
    showToast(i18n('loadFailedRetry'), 'error');
  } finally {
    timelineLoading.style.display = 'none';
  }
}

// ===== 同步 =====
async function handleSync() {
  syncBtn.classList.add('spinning');
  syncBtn.disabled = true;
  try {
    const result = await chrome.runtime.sendMessage({ action: 'syncAll' });
    if (result && result.success) {
      const msg = result.added > 0
        ? i18n('syncSuccessNew', [String(result.added)])
        : i18n('syncSuccessTotal', [String(result.total)]);
      showToast(msg, 'success');
      const bookmarksResult = await chrome.runtime.sendMessage({ action: 'getBookmarks' });
      if (bookmarksResult?.success) {
        allBookmarks = (bookmarksResult.bookmarks || []).map(b => ({ ...b, pinned: !!b.pinned }));
        duplicateIds = computeDuplicates(allBookmarks);
        await collectAllTags();
        renderTagBar();
        filterBookmarks(searchInput.value);
      }
    } else {
      showToast(i18n('syncFailed'), 'error');
    }
  } catch (err) {
    console.error('同步失败:', err);
    showToast(i18n('syncFailedRetry'), 'error');
  } finally {
    syncBtn.classList.remove('spinning');
    syncBtn.disabled = false;
  }
}


function formatQuickBookmarkError(codeOrMessage) {
  const raw = String(codeOrMessage || "").trim();
  const map = {
    unsupported_page: i18n("quickBookmarkUnsupported") || "当前页面不支持快捷收藏（如浏览器内部页）",
    error_page: i18n("quickBookmarkErrorPage") || "当前标签页是错误页，请先打开可访问的网页再收藏",
    restricted_page: i18n("quickBookmarkRestricted") || "当前页面受浏览器限制，无法注入收藏建议面板",
    tab_unavailable: i18n("quickBookmarkTabUnavailable") || "当前标签页不可用，请切换到普通网页后重试",
    timeout: i18n("quickBookmarkTimeout") || "生成收藏建议超时，请稍后重试",
    quick_bookmark_failed: i18n("quickBookmarkFailed") || "无法为当前页面创建收藏建议",
  };
  if (map[raw]) return map[raw];
  const lower = raw.toLowerCase();
  if (lower.includes("frame with id") && lower.includes("error page")) return map.error_page;
  if (lower.includes("cannot access") || lower.includes("cannot be scripted")) return map.restricted_page;
  // Avoid showing raw English chrome errors
  if (/^[A-Za-z][A-Za-z0-9 ,.'":;_()\[\]#/-]{8,}$/.test(raw) && !/[\u4e00-\u9fff]/.test(raw)) {
    return map.quick_bookmark_failed + "（" + (i18n("quickBookmarkTechDetail") || "技术详情已隐藏") + "）";
  }
  return raw;
}

async function handleQuickBookmarkClick() {
  if (!quickBookmarkBtn) return;
  quickBookmarkBtn.disabled = true;
  quickBookmarkBtn.classList.add('spinning');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'quickBookmark' });
    if (result?.pending) {
      showToast(i18n('quickBookmarkOpened') || '已打开 AI 分类建议，请在当前页面确认收藏', 'success');
      window.close();
      return;
    }
    if (result?.duplicated) {
      showToast(i18n('quickBookmarkDuplicated') || '该页面已经在书签中', 'info');
      return;
    }
    showToast(result?.error ? `${i18n('quickBookmarkSuggestFailed') || '收藏建议失败'}：${formatQuickBookmarkError(result.error)}` : (i18n('quickBookmarkFailed') || '无法为当前页面创建收藏建议'), 'error');
  } catch (err) {
    console.error('快捷收藏失败:', err);
    showToast(i18n('quickBookmarkFailed') || '快捷收藏失败', 'error');
  } finally {
    quickBookmarkBtn.classList.remove('spinning');
    quickBookmarkBtn.disabled = false;
  }
}

// ===== 单个删除 =====
async function deleteBookmark(id, url, element) {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'deleteBookmark', id, url });
    if (result && result.success) {
      element.style.transition = 'all 200ms ease';
      element.style.opacity = '0';
      element.style.transform = 'translateX(-20px)';
      setTimeout(async () => {
        element.remove();
        allBookmarks = allBookmarks.filter((b) => b.id !== id);
        duplicateIds = computeDuplicates(allBookmarks);
        await collectAllTags();
        renderTagBar();
        renderTimeline(allBookmarks);
      }, 200);
      showToast(i18n('deleted'), 'success');
    } else {
      showToast(i18n('deleteFailed'), 'error');
    }
  } catch (err) {
    console.error('删除失败:', err);
    showToast(i18n('deleteFailed'), 'error');
  }
}

// ===== 清空 =====
async function handleClear() {
  const count = allBookmarks.length;
  if (count === 0) { showToast(i18n('nothingToClear'), 'info'); return; }
  if (!confirm(i18n('confirmClear', [String(count)]))) return;
  try {
    const result = await chrome.runtime.sendMessage({ action: 'clearAll' });
    if (result && result.success) {
      selectedIds.clear();
      await loadBookmarks();
      showToast(i18n('allCleared'), 'success');
    } else if (result?.removed) {
      selectedIds.clear();
      await loadBookmarks();
      showToast(i18n('clearFailed'), 'error');
    } else {
      showToast(i18n('clearFailed'), 'error');
    }
  } catch (err) {
    console.error('清空失败:', err);
    showToast(i18n('clearFailed'), 'error');
  }
}

// ===== 置顶切换 =====
async function togglePin(id, element) {
  try {
    const result = await chrome.runtime.sendMessage({ action: 'togglePin', id });
    if (result?.success) {
      // 更新本地数据
      const item = allBookmarks.find(b => b.id === id);
      if (item) item.pinned = result.pinned;
      // 重渲染
      filterBookmarks(searchInput.value);
      showToast(result.pinned ? i18n('pinned') : i18n('unpinned'), 'success');
    } else {
      showToast(i18n('saveFailed'), 'error');
    }
  } catch (err) {
    console.error('置顶失败:', err);
    showToast(i18n('saveFailed'), 'error');
  }
}

// ===== 视图切换 =====
function setupViewTabs() {
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentView = tab.dataset.view;
      filterBookmarks(searchInput.value);
    });
  });
}

// ===== 批量选择模式 =====
function toggleBulkMode(force) {
  bulkMode = force !== undefined ? force : !bulkMode;
  bulkToggleBtn.dataset.active = String(bulkMode);
  bulkToggleBtn.classList.toggle('active', bulkMode);
  bulkActionBar.style.display = bulkMode ? 'block' : 'none';
  if (!bulkMode) {
    selectedIds.clear();
  }
  // 重新渲染（不重建数据）
  filterBookmarks(searchInput.value);
  updateBulkCount();
}

function toggleSelect(id, element) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
    element.classList.remove('bookmark-item--selected');
    element.querySelector('.bookmark-checkbox').innerHTML = '';
  } else {
    selectedIds.add(id);
    element.classList.add('bookmark-item--selected');
    element.querySelector('.bookmark-checkbox').innerHTML = SVG_CHECK;
  }
  updateBulkCount();
}

function updateBulkCount() {
  bulkCountEl.textContent = selectedIds.size;
}

function setupBulkActions() {
  bulkToggleBtn.addEventListener('click', () => toggleBulkMode());

  bulkCancelBtn.addEventListener('click', () => toggleBulkMode(false));

  bulkSelectAll.addEventListener('click', () => {
    const visible = timelineContent.querySelectorAll('.bookmark-item');
    const allSelected = visible.length > 0 && Array.from(visible).every(el => selectedIds.has(el.dataset.id));
    visible.forEach(el => {
      const id = el.dataset.id;
      if (allSelected) {
        selectedIds.delete(id);
        el.classList.remove('bookmark-item--selected');
        el.querySelector('.bookmark-checkbox').innerHTML = '';
      } else {
        selectedIds.add(id);
        el.classList.add('bookmark-item--selected');
        el.querySelector('.bookmark-checkbox').innerHTML = SVG_CHECK;
      }
    });
    updateBulkCount();
  });

  bulkPinBtn.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'bulkUpdate', ids: [...selectedIds], mode: 'pin'
      });
      if (result?.success) {
        showToast(i18n('pinnedCount', [String(result.updated)]), 'success');
        await loadBookmarks();
        // 保持选中
        selectedIds = new Set([...selectedIds].filter(id => allBookmarks.find(b => b.id === id && b.pinned)));
        updateBulkCount();
      }
    } catch (err) { console.error(err); }
  });

  bulkDeleteBtn.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(i18n('confirmBulkDelete', [String(selectedIds.size)]))) return;
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'bulkDelete', ids: [...selectedIds]
      });
      if (result?.success) {
        showToast(i18n('deletedCount', [String(result.removed)]), 'success');
        selectedIds.clear();
        await loadBookmarks();
        toggleBulkMode(false);
      } else if (result?.removed) {
        showToast(i18n('deleteFailed'), 'error');
        selectedIds.clear();
        await loadBookmarks();
        toggleBulkMode(false);
      } else {
        showToast(i18n('deleteFailed'), 'error');
      }
    } catch (err) { console.error(err); }
  });

  bulkTagBtn.addEventListener('click', () => {
    if (selectedIds.size === 0) return;
    bulkTagInput.value = '';
    bulkTagModal.style.display = 'flex';
    setTimeout(() => bulkTagInput.focus(), 50);
  });

  bulkTagClose.addEventListener('click', () => bulkTagModal.style.display = 'none');
  bulkTagCancel.addEventListener('click', () => bulkTagModal.style.display = 'none');
  bulkTagModal.addEventListener('click', (e) => { if (e.target === bulkTagModal) bulkTagModal.style.display = 'none'; });

  bulkTagAdd.addEventListener('click', async () => {
    const tags = bulkTagInput.value.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    if (tags.length === 0) { showToast(i18n('tagEmpty'), 'warning'); return; }
    try {
      const result = await chrome.runtime.sendMessage({
        action: 'bulkUpdate', ids: [...selectedIds], addTags: tags, mode: 'addTag'
      });
      if (result?.success) {
        showToast(i18n('taggedCount', [String(result.updated), String(tags.length)]), 'success');
        bulkTagModal.style.display = 'none';
        await loadBookmarks();
      }
    } catch (err) { console.error(err); }
  });
}

// ===== 命令面板 =====
function openCommandPalette() {
  paletteOpen = true;
  paletteModal.style.display = 'flex';
  paletteInput.value = '';
  paletteSelectedIdx = 0;
  renderPalette('');
  setTimeout(() => paletteInput.focus(), 30);
}

function closeCommandPalette() {
  paletteOpen = false;
  paletteModal.style.display = 'none';
  paletteInput.blur();
}

function renderPalette(query) {
  const q = query.trim();
  const results = q ? smartSearch(q, allBookmarks).slice(0, 30) : allBookmarks.slice(0, 30).map(item => ({ item, ranges: {} }));
  paletteItems = results.map(r => r.item);

  if (results.length === 0) {
    paletteResults.innerHTML = `<div class="palette-empty">${i18n('searchEmptyHint')}</div>`;
    return;
  }

  paletteResults.innerHTML = '';
  results.forEach((r, idx) => {
    const item = r.item;
    const ranges = r.ranges;
    let favicon, hostname;
    try {
      const u = new URL(item.url);
      favicon = `${u.origin}/favicon.ico`;
      hostname = u.hostname;
    } catch { favicon = ''; hostname = ''; }
    const domain = hostname.replace(/^www\./, '');

    const titleHtml = ranges.title?.length ? highlightText(item.title, ranges.title) : escapeHtml(item.title) || `<span style="color:var(--text-disabled)">${escapeHtml(i18n('untitled'))}</span>`;
    const urlHtml = ranges.url?.length ? highlightText(item.url, ranges.url) : escapeHtml(domain);

    const el = document.createElement('div');
    el.className = 'palette-item' + (idx === 0 ? ' selected' : '') + (item.pinned ? ' palette-item--pinned' : '');
    el.dataset.idx = String(idx);
    el.innerHTML = `
      <img class="palette-favicon" src="${favicon}">
      <div class="palette-item-info">
        <div class="palette-item-title">${titleHtml}</div>
        <div class="palette-item-url">${urlHtml}</div>
      </div>
      ${item.pinned ? '<span class="palette-pin">' + SVG_PIN_FILL + '</span>' : ''}
    `;
    // Manifest V3 CSP 禁止内联 onerror，用 addEventListener 绑定
    const paletteImg = el.querySelector('.palette-favicon');
    if (paletteImg) {
      paletteImg.addEventListener('error', function() { this.src = DEFAULT_FAVICON; }, { once: true });
    }
    el.addEventListener('click', () => selectPaletteItem(idx));
    el.addEventListener('mouseenter', () => {
      paletteSelectedIdx = idx;
      updatePaletteSelection();
    });
    paletteResults.appendChild(el);
  });
}

function updatePaletteSelection() {
  const items = paletteResults.querySelectorAll('.palette-item');
  items.forEach((el, idx) => {
    el.classList.toggle('selected', idx === paletteSelectedIdx);
  });
  // 滚动到可见
  const selected = items[paletteSelectedIdx];
  if (selected) selected.scrollIntoView({ block: 'nearest' });
}

function selectPaletteItem(idx) {
  const item = paletteItems[idx];
  if (!item) return;
  chrome.tabs.create({ url: item.url });
  chrome.runtime.sendMessage({ action: 'recordClick', url: item.url }).catch(() => {});
  closeCommandPalette();
}

function setupCommandPalette() {
  paletteBtn.addEventListener('click', openCommandPalette);

  paletteInput.addEventListener('input', () => {
    paletteSelectedIdx = 0;
    renderPalette(paletteInput.value);
  });

  paletteInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      paletteSelectedIdx = Math.min(paletteSelectedIdx + 1, paletteItems.length - 1);
      updatePaletteSelection();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      paletteSelectedIdx = Math.max(paletteSelectedIdx - 1, 0);
      updatePaletteSelection();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectPaletteItem(paletteSelectedIdx);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeCommandPalette();
    }
  });

  paletteModal.addEventListener('click', (e) => {
    if (e.target === paletteModal) closeCommandPalette();
  });
}

// ===== 导入/导出 =====
function exportToJSON() {
  const data = JSON.stringify({
    version: 1,
    exportedAt: Date.now(),
    bookmarks: allBookmarks.map(b => ({
      title: b.title, url: b.url, dateAdded: b.dateAdded, folderPath: b.folderPath, tags: b.tags, pinned: b.pinned
    }))
  }, null, 2);
  downloadFile('ai-bookmark-os-bookmarks.json', data, 'application/json');
}

function exportToHTML() {
  const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const body = allBookmarks.map(b => `<a href="${esc(b.url)}" add_date="${Math.floor((b.dateAdded || Date.now()) / 1000)}">${esc(b.title)}</a>`).join('\n');
  const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${body}
</DL><p>`;
  downloadFile('ai-bookmark-os-bookmarks.html', html, 'text/html');
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}

function parseImportedHTML(text) {
  const results = [];
  const re = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const url = m[1];
    const title = m[2] || url;
    if (!url || url.startsWith('javascript:') || url.startsWith('data:')) continue;
    results.push({
      id: 'imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      title, url,
      domain: extractDomain(url),
      dateAdded: Date.now(),
      tags: [], pinned: false
    });
  }
  return results;
}

function parseImportedJSON(text) {
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : (data.bookmarks || []);
    return list.filter(b => b && b.url).map(b => ({
      id: 'imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      title: b.title || b.url,
      url: b.url,
      domain: extractDomain(b.url),
      dateAdded: b.dateAdded || Date.now(),
      tags: Array.isArray(b.tags) ? b.tags : [],
      pinned: !!b.pinned
    }));
  } catch (e) {
    return null;
  }
}

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    const text = e.target.result;
    let items = null;
    if (file.name.endsWith('.json')) items = parseImportedJSON(text);
    else items = parseImportedHTML(text);
    if (!items || items.length === 0) { showToast(i18n('importEmpty'), 'error'); return; }
    try {
      const result = await chrome.runtime.sendMessage({ action: 'importData', bookmarks: items, mode: 'merge' });
      if (result?.success) {
        showToast(i18n('importedCount', [String(result.added)]), 'success');
        await loadBookmarks();
      }
    } catch (err) { console.error(err); showToast(i18n('importFailed'), 'error'); }
  };
  reader.readAsText(file);
}

// ===== 全局快捷键（在 popup 内） =====
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Shift + E：命令面板
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      if (paletteOpen) closeCommandPalette();
      else openCommandPalette();
    }
    // Esc：关闭面板
    else if (e.key === 'Escape' && paletteOpen) {
      e.preventDefault();
      closeCommandPalette();
    }
    // Ctrl/Cmd + A：批量全选
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A') && bulkMode && document.activeElement === document.body) {
      e.preventDefault();
      bulkSelectAll.click();
    }
  });
}

// ===== 事件绑定 =====
syncBtn.addEventListener('click', handleSync);
if (quickBookmarkBtn) quickBookmarkBtn.addEventListener('click', handleQuickBookmarkClick);
if (clearBtn) clearBtn.addEventListener('click', handleClear);

// 底部栏：设置按钮
const footerSettingsBtn = $('footerSettingsBtn');
const footerMenuBtn = $('footerMenuBtn');
const footerMenu = $('footerMenu');
const menuCheckerBtn = $('menuCheckerBtn');
const menuPanelBtn = $('menuPanelBtn');
const menuGraphBtn = $('menuGraphBtn');
const menuStatsBtn = $('menuStatsBtn');
const versionLabel = $('versionLabel');

// 读取版本号
try {
  const manifest = chrome.runtime.getManifest();
  versionLabel.textContent = 'v' + manifest.version;
} catch (e) {}


// ===== AI Bookmark OS: open AI classify side panel =====
async function openAiClassifyPanel() {
  const router = window.AIBookmarkPageRouter;
  if (router?.openAiClassificationPanel) {
    await router.openAiClassificationPanel();
  } else {
    await openExtensionPage('ai/sidepanel.html');
  }
  try { window.close(); } catch (_) {}
}

function openAiSettingsPage() {
  openExtensionPage('pages/settings/settings.html#ai');
}

function openBookmarkNavPage() {
  openExtensionPage('ai/bookmark-nav.html', { closePopup: true });
}

function openWorkspacePage() {
  openExtensionPage('pages/standalone/standalone.html', { closePopup: true });
}

function openExtensionPage(path, options = {}) {
  const opened = window.AIBookmarkPageRouter?.openOrFocusExtensionPage(path)
    ?? chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  if (options.closePopup) Promise.resolve(opened).finally(() => { try { window.close(); } catch (_) {} });
  return opened;
}



footerSettingsBtn.addEventListener('click', () => {
  openExtensionPage('pages/settings/settings.html');
});

// 三点菜单
footerMenuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  footerMenu.classList.toggle('footer-menu--open');
});

document.addEventListener('click', (e) => {
  if (!footerMenu.contains(e.target) && e.target !== footerMenuBtn) {
    footerMenu.classList.remove('footer-menu--open');
  }
});

menuCheckerBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  openExtensionPage('pages/checker/checker.html', { closePopup: true });
});

menuGraphBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  openExtensionPage('pages/graph/graph.html', { closePopup: true });
});

menuPanelBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  openWorkspacePage();
});

menuStatsBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  openExtensionPage('pages/settings/settings.html#stats', { closePopup: true });
});
// AI classify entries
const aiClassifyBtn = $('aiClassifyBtn');
const bookmarkNavBtn = $('bookmarkNavBtn');
const workspaceBtn = $('workspaceBtn');
const aiEntryBannerBtn = $('aiEntryBannerBtn');
const menuAiClassifyBtn = $('menuAiClassifyBtn');
const menuBookmarkNavBtn = $('menuBookmarkNavBtn');
const menuAiSettingsBtn = $('menuAiSettingsBtn');
if (aiClassifyBtn) aiClassifyBtn.addEventListener('click', openAiClassifyPanel);
if (bookmarkNavBtn) bookmarkNavBtn.addEventListener('click', openBookmarkNavPage);
if (workspaceBtn) workspaceBtn.addEventListener('click', openWorkspacePage);
if (aiEntryBannerBtn) aiEntryBannerBtn.addEventListener('click', openAiClassifyPanel);
if (menuAiClassifyBtn) menuAiClassifyBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  openAiClassifyPanel();
});
if (menuBookmarkNavBtn) menuBookmarkNavBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  openBookmarkNavPage();
});
if (menuAiSettingsBtn) menuAiSettingsBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  openAiSettingsPage();
});
const menuClearBtn = $('menuClearBtn');
if (menuClearBtn) menuClearBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  handleClear();
});


// ===== 最近删除视图 =====

const menuDeletedBtn = $('menuDeletedBtn');
const deletedView = $('deletedView');
const deletedList = $('deletedList');
const deletedEmpty = $('deletedEmpty');
const deletedBackBtn = $('deletedBackBtn');
const deletedClearAllBtn = $('deletedClearAllBtn');
const deletedRetentionHint = $('deletedRetentionHint');
let currentDeletedList = [];

function setPopupChromeVisible(visible) {
  const chrome = document.querySelector('.popup-chrome');
  const searchBar = document.querySelector('.search-bar');
  const viewToolbar = document.querySelector('.view-toolbar');
  const tagBar = document.querySelector('.tag-bar');
  const display = visible ? '' : 'none';
  if (chrome) chrome.style.display = display;
  if (searchBar) searchBar.style.display = display;
  if (viewToolbar) viewToolbar.style.display = display;
  if (tagBar) tagBar.style.display = display;
}

function showDeletedView() {
  setPopupChromeVisible(false);
  document.getElementById('timelineLoading').style.display = 'none';
  document.getElementById('timelineEmpty').style.display = 'none';
  document.getElementById('timelineContent').style.display = 'none';
  document.getElementById('searchEmpty').style.display = 'none';
  deletedView.style.display = 'flex';
  loadDeletedList();
}

function hideDeletedView() {
  deletedView.style.display = 'none';
  setPopupChromeVisible(true);
  // 返回时强制重新加载并渲染主页，避免与 deleted 视图状态不一致
  loadBookmarks();
}

function relativeDeletedTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  const d = Math.floor(h / 24);
  if (d < 30) return d + ' 天前';
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function renderDeletedList(items, retentionDays) {
  currentDeletedList = items;
  deletedRetentionHint.textContent = retentionDays ? `保留 ${retentionDays} 天` : '';
  if (!items.length) {
    deletedList.innerHTML = '';
    deletedEmpty.style.display = 'flex';
    return;
  }
  deletedEmpty.style.display = 'none';
  deletedList.innerHTML = items.map((t, i) => {
    const favicon = t.url ? `<img class="bookmark-favicon deleted-favicon" src="${escapeAttr(getFaviconUrl(t.url))}">` : '';
    const domain = escapeHtml(t.domain || (t.url ? (() => { try { return new URL(t.url).hostname; } catch { return t.url; } })() : ''));
    const title = escapeHtml(t.title || t.url || '(无标题)');
    return `
      <div class="deleted-item" data-idx="${i}">
        ${favicon}
        <div class="deleted-item-info">
          <div class="deleted-item-title" title="${escapeAttr(t.url || '')}">${title}</div>
          <div class="deleted-item-meta">
            <span>${domain}</span>
            <span>·</span>
            <span>${relativeDeletedTime(t.deletedAt || 0)}</span>
          </div>
        </div>
        <div class="deleted-item-actions">
          <button class="deleted-action-btn deleted-action-btn--restore" data-action="restore" data-idx="${i}">恢复</button>
          <button class="deleted-action-btn deleted-action-btn--purge" data-action="purge" data-idx="${i}">彻底删除</button>
        </div>
      </div>
    `;
  }).join('');
}

async function loadDeletedList() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'getTombstones' });
    if (res && res.success) {
      renderDeletedList(res.tombstones || [], res.retentionDays);
    }
  } catch (e) {
    renderDeletedList([], 0);
  }
}

menuDeletedBtn.addEventListener('click', () => {
  footerMenu.classList.remove('footer-menu--open');
  showDeletedView();
});

deletedBackBtn.addEventListener('click', () => {
  hideDeletedView();
});

// 事件委托：删除列表 favicon 加载失败时隐藏（Manifest V3 CSP 禁止内联 onerror）
deletedList.addEventListener('error', (e) => {
  if (e.target.classList.contains('deleted-favicon')) {
    e.target.style.visibility = 'hidden';
  }
}, true);

deletedList.addEventListener('click', async (e) => {
  const btn = e.target.closest('.deleted-action-btn');
  if (!btn) return;
  const idx = Number(btn.dataset.idx);
  const item = currentDeletedList[idx];
  if (!item) return;
  const action = btn.dataset.action;
  if (action === 'restore') {
    btn.disabled = true;
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'restoreTombstone',
        url: item.url,
        dateAdded: item.dateAdded
      });
      if (res && res.success) {
        showToast(i18n('restoreSuccess') || '已恢复', 'success');
        hideDeletedView();
      } else {
        showToast('恢复失败: ' + (res && res.error || '未知错误'), 'error');
        btn.disabled = false;
      }
    } catch (err) {
      showToast('恢复失败: ' + err.message, 'error');
      btn.disabled = false;
    }
  } else if (action === 'purge') {
    if (!confirm(i18n('confirmPurgeDeleted') || '确定要彻底删除该记录吗？此操作不可撤销。')) return;
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'purgeTombstone',
        url: item.url,
        dateAdded: item.dateAdded
      });
      if (res && res.success) {
        await loadDeletedList();
        await refreshBookmarkData();
      }
    } catch (err) {
      showToast('删除失败: ' + err.message, 'error');
    }
  }
});

deletedClearAllBtn.addEventListener('click', async () => {
  if (!currentDeletedList.length) return;
  if (!confirm((i18n('confirmClearAllDeleted') || '确定要清空全部 $1 条最近删除记录吗？').replace('$1', String(currentDeletedList.length)))) return;
  try {
    const res = await chrome.runtime.sendMessage({ action: 'clearTombstones' });
    if (res && res.success) {
      await loadDeletedList();
      renderTagBar();
    }
  } catch (err) {
    showToast('清空失败: ' + err.message, 'error');
  }
});

// ===== 排序下拉 =====
const SORT_ICONS = {
  newest: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="5 12 12 5 19 12"/></svg>`,
  oldest: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
  hottest: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  coldest: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="12" y1="3" x2="12" y2="5"/><line x1="10" y1="4" x2="11" y2="6"/><line x1="14" y1="4" x2="13" y2="6"/></svg>`
};
const SORT_TITLE_KEY = {
  newest: 'sortNewest',
  oldest: 'sortOldest',
  hottest: 'sortHottest',
  coldest: 'sortColdest'
};

function updateSortUI() {
  sortIcon.innerHTML = SORT_ICONS[sortMode] || SORT_ICONS.newest;
  sortBtn.setAttribute('data-i18n-title', SORT_TITLE_KEY[sortMode] || 'sortNewest');
  // 更新下拉项的高亮
  sortDropdown.querySelectorAll('.sort-dropdown-item').forEach(item => {
    item.classList.toggle('active', item.dataset.sort === sortMode);
  });
  applyI18n();
}

// 切换排序下拉展开/收起
sortBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  sortBtn.parentElement.classList.toggle('sort-dropdown--open');
});

// 点击下拉选项
sortDropdown.addEventListener('click', (e) => {
  const item = e.target.closest('.sort-dropdown-item');
  if (!item) return;
  const newMode = item.dataset.sort;
  if (newMode && newMode !== sortMode) {
    sortMode = newMode;
    updateSortUI();
    filterBookmarks(searchInput.value);
  }
  sortBtn.parentElement.classList.remove('sort-dropdown--open');
});

// 点击外部关闭下拉
document.addEventListener('click', (e) => {
  if (!e.target.closest('.sort-dropdown')) {
    sortBtn.parentElement.classList.remove('sort-dropdown--open');
  }
});

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

// ===== 搜索历史与联想 =====
// 历史记录最大条数
const SEARCH_HISTORY_MAX = 10;
// 联想词最大显示数
const SUGGEST_LIMIT = 8;
const SEARCH_HISTORY_KEY = 'searchHistory';
// 联想状态
let searchHistory = [];
let suggestItems = [];        // 当前候选 [{text, type, meta}]
let suggestActiveIdx = -1;    // 当前高亮索引
let suggestOpen = false;

// SVG 图标
const SVG_HISTORY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/><polyline points="12 7 12 12 15 14"/></svg>';
const SVG_TAG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
const SVG_BOOKMARK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

async function loadSearchHistory() {
  try {
    const res = await chrome.storage.local.get(SEARCH_HISTORY_KEY);
    const list = res[SEARCH_HISTORY_KEY];
    searchHistory = Array.isArray(list) ? list : [];
  } catch {
    searchHistory = [];
  }
}

async function saveSearchHistory() {
  try {
    await chrome.storage.local.set({ [SEARCH_HISTORY_KEY]: searchHistory });
  } catch (e) {
    console.error('保存搜索历史失败:', e);
  }
}

function recordSearchHistory(query) {
  const q = (query || '').trim();
  if (!q) return;
  // 去重（不区分大小写）
  searchHistory = searchHistory.filter(item => item.text.toLowerCase() !== q.toLowerCase());
  searchHistory.unshift({ text: q, time: Date.now() });
  if (searchHistory.length > SEARCH_HISTORY_MAX) {
    searchHistory = searchHistory.slice(0, SEARCH_HISTORY_MAX);
  }
  saveSearchHistory();
}

async function clearSearchHistory() {
  searchHistory = [];
  await saveSearchHistory();
  renderSuggestions(searchInput.value);
}

// 高亮匹配字符
function highlightSuggestion(text, ranges) {
  if (!text) return '';
  if (!ranges || ranges.length === 0) return escapeHtml(text);
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let html = '';
  let cursor = 0;
  for (const [start, end] of sorted) {
    if (start < cursor) continue;
    if (cursor < start) html += escapeHtml(text.slice(cursor, start));
    html += `<mark>${escapeHtml(text.slice(start, end))}</mark>`;
    cursor = end;
  }
  if (cursor < text.length) html += escapeHtml(text.slice(cursor));
  return html;
}

// 从书签中提取候选关键词：标题分词、域名、标签
function buildKeywordCandidates() {
  const map = new Map(); // text -> {type, weight, count, sample}
  const add = (text, type, weight) => {
    const t = (text || '').trim();
    if (!t) return;
    if (t.length < 2) return; // 忽略过短词
    const key = t.toLowerCase();
    if (map.has(key)) {
      const cur = map.get(key);
      cur.count += 1;
      cur.weight = Math.max(cur.weight, weight);
    } else {
      map.set(key, { text: t, type, weight, count: 1 });
    }
  };

  for (const b of allBookmarks) {
    // 标签（权重高）
    if (b.tags && b.tags.length) {
      b.tags.forEach(t => add(t, 'tag', 80));
    }
    // 域名
    if (b.domain) {
      add(b.domain.replace(/^www\./, ''), 'domain', 40);
    }
    // 标题分词（按空格、中文标点切分）
    if (b.title) {
      const tokens = b.title
        .split(/[\s,，。、;；:：|/\\()()【】\[\]<>《》!?？·]+/)
        .map(s => s.trim())
        .filter(s => s.length >= 2 && s.length <= 20);
      tokens.forEach(t => add(t, 'title', 60));
    }
  }
  return Array.from(map.values());
}

// 提取模糊匹配区间（不区分大小写、子序列）
function findMatchRanges(query, text) {
  if (!query || !text) return [];
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // 优先子串
  const idx = t.indexOf(q);
  if (idx >= 0) return [[idx, idx + q.length]];
  // 子序列
  let qi = 0;
  const ranges = [];
  let rangeStart = -1;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      if (rangeStart < 0) {
        rangeStart = i;
        ranges.push([i, i + 1]);
      } else {
        ranges[ranges.length - 1][1] = i + 1;
      }
      qi++;
    }
  }
  return qi < q.length ? [] : ranges;
}

function computeSuggestions(query) {
  const q = (query || '').trim();
  const candidates = buildKeywordCandidates();
  let pool = candidates;

  if (q) {
    // 输入了查询：按子串/子序列匹配 + 评分
    pool = candidates.map(c => {
      const ranges = findMatchRanges(q, c.text);
      if (ranges.length === 0) return null;
      // 评分：前缀匹配 > 子串 > 子序列；类型权重；频次
      let s = 0;
      const t = c.text.toLowerCase();
      if (t.startsWith(q)) s += 50;
      else if (t.includes(q)) s += 30;
      else s += 10; // 子序列
      s += c.weight;
      s += Math.min(c.count, 10);
      return { ...c, ranges, score: s };
    }).filter(Boolean);
    pool.sort((a, b) => b.score - a.score);
  } else {
    // 空查询：先显示历史，再按权重/频次补充
    pool = candidates
      .sort((a, b) => (b.weight + b.count) - (a.weight + a.count))
      .slice(0, 6)
      .map(c => ({ ...c, ranges: [] }));
  }

  // 合并搜索历史（空查询时置顶）
  const result = [];
  if (!q) {
    for (const h of searchHistory.slice(0, 5)) {
      result.push({ text: h.text, type: 'history', weight: 100, count: 1, ranges: [] });
    }
  }
  for (const c of pool) {
    if (result.length >= SUGGEST_LIMIT) break;
    // 去重（不区分大小写，且避免与历史重复）
    const key = c.text.toLowerCase();
    if (result.some(r => r.text.toLowerCase() === key)) continue;
    result.push(c);
  }
  return result;
}

function renderSuggestions(query) {
  suggestItems = computeSuggestions(query);

  if (suggestItems.length === 0 && searchHistory.length === 0) {
    searchSuggest.style.display = 'none';
    suggestOpen = false;
    return;
  }

  const parts = [];
  const hasHistory = !query && searchHistory.length > 0;

  if (hasHistory) {
    parts.push(`<div class="search-suggest-group">${escapeHtml(i18n('suggestHistoryGroup'))}</div>`);
  } else if (query) {
    parts.push(`<div class="search-suggest-group">${escapeHtml(i18n('suggestKeywordGroup'))}</div>`);
  }

  suggestItems.forEach((item, idx) => {
    const iconMap = { history: SVG_HISTORY, tag: SVG_TAG, title: SVG_BOOKMARK, domain: SVG_BOOKMARK };
    const icon = iconMap[item.type] || SVG_BOOKMARK;
    const textHtml = highlightSuggestion(item.text, item.ranges);
    parts.push(
      `<div class="search-suggest-item" role="option" data-idx="${idx}" data-text="${escapeAttr(item.text)}">
        <span class="search-suggest-icon">${icon}</span>
        <span class="search-suggest-text">${textHtml}</span>
      </div>`
    );
  });

  if (hasHistory) {
    parts.push(
      `<button class="search-suggest-clear" id="searchSuggestClear">${escapeHtml(i18n('suggestClearHistory'))}</button>`
    );
  }

  searchSuggest.innerHTML = parts.join('');
  searchSuggest.style.display = 'block';
  suggestOpen = true;
  suggestActiveIdx = -1;

  // 绑定点击
  searchSuggest.querySelectorAll('.search-suggest-item').forEach(el => {
    el.addEventListener('mousedown', (e) => {
      // 用 mousedown 防止 input blur 先触发
      e.preventDefault();
      const text = el.dataset.text;
      if (text) {
        searchInput.value = text;
        hideSuggestions();
        filterBookmarks(text);
      }
    });
    el.addEventListener('mouseenter', () => {
      const idx = parseInt(el.dataset.idx, 10);
      setSuggestActive(idx);
    });
  });
  const clearBtn = $('searchSuggestClear');
  if (clearBtn) {
    clearBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      clearSearchHistory();
    });
  }
}

function setSuggestActive(idx) {
  const items = searchSuggest.querySelectorAll('.search-suggest-item');
  if (items.length === 0) {
    suggestActiveIdx = -1;
    return;
  }
  if (idx < 0) idx = items.length - 1;
  if (idx >= items.length) idx = 0;
  suggestActiveIdx = idx;
  items.forEach((el, i) => {
    el.classList.toggle('active', i === suggestActiveIdx);
  });
  const sel = items[suggestActiveIdx];
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function hideSuggestions() {
  searchSuggest.style.display = 'none';
  suggestOpen = false;
  suggestActiveIdx = -1;
  suggestItems = [];
}

function applySuggestActive() {
  if (suggestActiveIdx < 0) return false;
  const item = suggestItems[suggestActiveIdx];
  if (!item) return false;
  searchInput.value = item.text;
  hideSuggestions();
  filterBookmarks(item.text);
  return true;
}

// ===== 搜索事件 =====
let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const value = searchInput.value;
  searchClear.style.display = value ? 'flex' : 'none';
  // 立即渲染联想（轻量），防抖执行真实过滤
  renderSuggestions(value);
  searchTimeout = setTimeout(() => filterBookmarks(value), 120);
});

searchInput.addEventListener('focus', () => {
  // 聚焦时显示历史/联想
  if (allBookmarks.length > 0) {
    renderSuggestions(searchInput.value);
  }
});

searchInput.addEventListener('blur', () => {
  // 失焦时记录搜索历史（如有实际内容）
  const v = searchInput.value.trim();
  if (v) recordSearchHistory(v);
  // 延迟关闭，让 mousedown 能先触发
  setTimeout(() => hideSuggestions(), 120);
});

searchInput.addEventListener('keydown', (e) => {
  if (!suggestOpen) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setSuggestActive(suggestActiveIdx + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setSuggestActive(suggestActiveIdx - 1);
  } else if (e.key === 'Enter') {
    if (suggestActiveIdx >= 0) {
      e.preventDefault();
      applySuggestActive();
    } else {
      // 没有高亮项：记录历史后执行搜索
      clearTimeout(searchTimeout);
      hideSuggestions();
      recordSearchHistory(searchInput.value);
      filterBookmarks(searchInput.value);
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    hideSuggestions();
  }
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  hideSuggestions();
  filterBookmarks('');
  searchInput.focus();
});

// 滚动主内容时关闭联想面板
document.querySelector('.main').addEventListener('scroll', () => {
  if (suggestOpen) hideSuggestions();
});

// 点击外部关闭联想
document.addEventListener('mousedown', (e) => {
  if (!suggestOpen) return;
  if (e.target.closest('.search-suggest')) return;
  if (e.target === searchInput) return;
  hideSuggestions();
});

// ===== 监听后台消息 =====
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'bookmarkAdded' || message.action === 'bookmarksDeleted') {
    loadBookmarks();
    if (message.action === 'bookmarkAdded') {
      showToast(i18n('newBookmarkDetected'), 'success');
    }
  } else if (message.action === 'tagsUpdated') {
    loadBookmarks();
  } else if (message.action === 'openCommandPalette') {
    openCommandPalette();
  }
});

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  initI18n().then(() => {
    applyI18n();
    loadTheme();
    updateSortUI();
    setupViewTabs();
    setupBulkActions();
    setupCommandPalette();
    setupKeyboardShortcuts();
    loadSearchHistory();
    loadBookmarks();
    loadPreviewEnabled();
  });
});
