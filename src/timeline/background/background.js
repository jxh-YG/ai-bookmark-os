// 引入 AI 增强层（需在 smart-tagger.js 之前加载，供其调用 classifyWithAI）
importScripts('../shared/ai-tagger.js');
importScripts('bookmark-data.js');
// 引入 AI 辅助分类日志
importScripts('../shared/ai-logger.js');
// 引入智能分类引擎
importScripts('../shared/smart-tagger.js');
// 引入网页预览提取 (Mozilla Readability)
importScripts('vendor/Readability.js');
importScripts('preview-extractor.js');
// 引入 RSS 订阅模块（解析层 / 存储层 / 拉取调度 / 通知 / 自动发现）
importScripts('../shared/rss-parser.js');
importScripts('../shared/feed-store.js');
importScripts('feed-fetcher.js');
importScripts('feed-notifier.js');
importScripts('feed-discover.js');

// ===== 正文内容提取 =====
const PAGE_CONTENT_CACHE_KEY = 'page_content_cache';
const PAGE_CONTENT_CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const PAGE_CONTENT_CACHE_MAX = 500;
const PAGE_CONTENT_FETCH_TIMEOUT = 12000;
const PAGE_CONTENT_FETCH_RETRIES = 2;

function isContentUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

function normalizeExtractedText(text) {
  return String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeHtmlEntities(text) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(text || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity) => {
    const key = String(entity).toLowerCase();
    if (key[0] === '#') {
      const code = key[1] === 'x' ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    }
    return Object.prototype.hasOwnProperty.call(named, key) ? named[key] : '';
  });
}

function getMetaContent(html, name) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i')
  ];
  for (const re of patterns) {
    const match = re.exec(html);
    if (match?.[1]) return decodeHtmlEntities(match[1]).trim();
  }
  return '';
}

function extractTitleFromHtml(html) {
  const ogTitle = getMetaContent(html, 'og:title') || getMetaContent(html, 'twitter:title');
  if (ogTitle) return ogTitle;
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1] ? decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim() : '';
}

function extractHeadingsFromHtml(html) {
  const headings = [];
  const pattern = /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let match;
  while ((match = pattern.exec(String(html || ''))) && headings.length < 20) {
    const heading = normalizeExtractedText(decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ' ')));
    if (heading.length >= 2) headings.push(heading);
  }
  return [...new Set(headings)];
}

function extractStructuredTypesFromHtml(html) {
  const types = new Set();
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = pattern.exec(String(html || ''))) && types.size < 12) {
    try {
      const payload = JSON.parse(match[1]);
      const entries = Array.isArray(payload) ? payload : [payload, ...(payload?.['@graph'] || [])];
      for (const entry of entries) {
        for (const type of (Array.isArray(entry?.['@type']) ? entry['@type'] : [entry?.['@type']])) {
          if (typeof type === 'string' && type) types.add(type);
        }
      }
    } catch (_) {}
  }
  return [...types];
}

function extractReadableTextFromHtml(html) {
  const source = String(html || '');
  const mainMatch = /<(article|main)[^>]*>([\s\S]*?)<\/\1>/i.exec(source);
  const selected = mainMatch?.[2] || source;
  const cleaned = selected
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form|button)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(h[1-6]|p|li|blockquote|pre|tr|div|section|br)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return normalizeExtractedText(decodeHtmlEntities(cleaned));
}

function makeContentResult(url, patch) {
  const textContent = normalizeExtractedText(patch?.textContent || '');
  const status = patch?.status || (textContent.length >= 80 ? 'success' : 'empty');
  const failureReason = status === 'success' ? '' : (patch?.failureReason || 'readable_content_empty');
  return {
    status,
    failureReason,
    title: patch?.title || '',
    originalUrl: patch?.originalUrl || url,
    finalUrl: patch?.finalUrl || url,
    textContent,
    excerpt: normalizeExtractedText(patch?.excerpt || patch?.metaDesc || textContent.slice(0, 240)),
    metaDesc: normalizeExtractedText(patch?.metaDesc || ''),
    metaKeywords: Array.isArray(patch?.metaKeywords) ? patch.metaKeywords.map(normalizeExtractedText).filter(Boolean).slice(0, 20) : [],
    headings: Array.isArray(patch?.headings) ? patch.headings.map(normalizeExtractedText).filter(Boolean).slice(0, 20) : [],
    structuredTypes: Array.isArray(patch?.structuredTypes) ? patch.structuredTypes.map(value => String(value).trim()).filter(Boolean).slice(0, 12) : [],
    lengthChars: textContent.length,
    fetchedAt: patch?.fetchedAt || Date.now(),
    elapsedMs: patch?.elapsedMs || 0,
    source: patch?.source || 'unknown'
  };
}

async function getPageContentCache() {
  const result = await chrome.storage.local.get(PAGE_CONTENT_CACHE_KEY);
  return result[PAGE_CONTENT_CACHE_KEY] || {};
}

async function getCachedContent(url) {
  const cache = await getPageContentCache();
  const hit = cache[url];
  if (!hit) return null;
  if (Date.now() - (hit.fetchedAt || 0) > PAGE_CONTENT_CACHE_TTL) return null;
  return hit;
}

async function setCachedContent(url, data) {
  if (!url || !data) return;
  const cache = await getPageContentCache();
  cache[url] = makeContentResult(url, data);
  let entries = Object.entries(cache).filter(([, value]) => Date.now() - (value.fetchedAt || 0) <= PAGE_CONTENT_CACHE_TTL);
  if (entries.length > PAGE_CONTENT_CACHE_MAX) {
    entries.sort((a, b) => (b[1].fetchedAt || 0) - (a[1].fetchedAt || 0));
    entries = entries.slice(0, PAGE_CONTENT_CACHE_MAX);
  }
  await chrome.storage.local.set({ [PAGE_CONTENT_CACHE_KEY]: Object.fromEntries(entries) });
}

async function fetchContentWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchStaticPageContent(url) {
  const startedAt = Date.now();
  if (!isContentUrl(url)) {
    return makeContentResult(url, { status: 'failed', failureReason: 'unsupported_scheme', source: 'network-fetch' });
  }

  let lastReason = 'fetch_failed';
  for (let attempt = 0; attempt <= PAGE_CONTENT_FETCH_RETRIES; attempt++) {
    try {
      const res = await fetchContentWithTimeout(url, PAGE_CONTENT_FETCH_TIMEOUT);
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok) {
        lastReason = `http_${res.status}`;
      } else if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml') && !contentType.includes('text/plain')) {
        lastReason = `unsupported_content_type:${contentType.split(';')[0]}`;
      } else {
        const html = await res.text();
        const metaDesc = getMetaContent(html, 'description') || getMetaContent(html, 'og:description') || getMetaContent(html, 'twitter:description');
        const metaKeywords = getMetaContent(html, 'keywords').split(/[,\uFF0C]/).map(value => value.trim()).filter(Boolean);
        const textContent = extractReadableTextFromHtml(html);
        const result = makeContentResult(url, {
          status: textContent.length >= 80 ? 'success' : 'empty',
          failureReason: textContent.length >= 80 ? '' : 'readable_content_empty',
          title: extractTitleFromHtml(html),
          originalUrl: url,
          finalUrl: res.url || url,
          textContent,
          excerpt: metaDesc || textContent.slice(0, 240),
          metaDesc,
          metaKeywords,
          headings: extractHeadingsFromHtml(html),
          structuredTypes: extractStructuredTypesFromHtml(html),
          fetchedAt: Date.now(),
          elapsedMs: Date.now() - startedAt,
          source: 'network-fetch'
        });
        await setCachedContent(url, result);
        return result;
      }
    } catch (err) {
      lastReason = err?.name === 'AbortError' ? 'timeout' : (err?.message || 'network_error');
    }
    if (attempt < PAGE_CONTENT_FETCH_RETRIES) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }

  const result = makeContentResult(url, {
    status: 'failed',
    failureReason: lastReason,
    originalUrl: url,
    finalUrl: url,
    fetchedAt: Date.now(),
    elapsedMs: Date.now() - startedAt,
    source: 'network-fetch'
  });
  await setCachedContent(url, result);
  return result;
}

async function fetchRenderedPageContent(url) {
  if (!isContentUrl(url)) {
    return makeContentResult(url, { status: 'failed', failureReason: 'unsupported_scheme', source: 'temporary-rendered-tab' });
  }
  let tab = null;
  const startedAt = Date.now();
  try {
    tab = await chrome.tabs.create({ url, active: false });
    await new Promise((resolve) => {
      let timeout;
      const listener = (tabId, changeInfo) => {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 12000);
      chrome.tabs.onUpdated.addListener(listener);
    });
    await new Promise(resolve => setTimeout(resolve, 1200));
    const result = await extractRenderedTabContent(tab.id, url);
    return makeContentResult(url, {
      ...result,
      source: result?.source === 'rendered-page' ? 'temporary-rendered-tab' : result?.source,
      elapsedMs: Date.now() - startedAt
    });
  } catch (err) {
    const result = makeContentResult(url, {
      status: 'failed',
      failureReason: err?.message || 'temporary_tab_failed',
      originalUrl: url,
      finalUrl: url,
      fetchedAt: Date.now(),
      elapsedMs: Date.now() - startedAt,
      source: 'temporary-rendered-tab'
    });
    await setCachedContent(url, result);
    return result;
  } finally {
    if (tab?.id) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function extractRenderedTabContent(tabId, url) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['background/vendor/Readability.js', 'content/content-extractor.js'],
    world: 'ISOLATED'
  });
  const data = await chrome.tabs.sendMessage(tabId, { action: 'extractContent', options: { originalUrl: url, maxWaitMs: 4500 } });
  const result = makeContentResult(url, data || { status: 'failed', failureReason: 'content_script_no_response', source: 'rendered-page' });
  await setCachedContent(url, result);
  return result;
}

async function extractActiveTabContent(tabId, url) {
  if (!tabId || !url) return null;
  if (!isContentUrl(url)) return makeContentResult(url, { status: 'failed', failureReason: 'unsupported_scheme', source: 'rendered-page' });

  try {
    const cached = await getCachedContent(url);
    if (cached && cached.status === 'success') return cached;
  } catch {}

  try {
    const result = await extractRenderedTabContent(tabId, url);
    if (result.status === 'success') return result;
  } catch (err) {
    console.warn('Content extraction failed:', err);
  }
  return fetchStaticPageContent(url);
}

async function fetchBookmarkContent(url, options = {}) {
  if (!options.forceRefresh) {
    const cached = await getCachedContent(url).catch(() => null);
    if (cached && (cached.status === 'success' || options.allowCachedFailure)) return cached;
  }
  if (options.tabId) return extractActiveTabContent(options.tabId, url);
  const staticResult = await fetchStaticPageContent(url);
  if (staticResult.status === 'success' || options.renderFallback === false) return staticResult;
  return fetchRenderedPageContent(url);
}

async function fetchBookmarkContents(urls, options = {}) {
  const list = Array.from(new Set((urls || []).filter(Boolean)));
  const limit = Math.max(1, Math.min(5, Number(options.concurrency || 3)));
  const results = await runWithConcurrency(list, limit, (url) => fetchBookmarkContent(url, { forceRefresh: !!options.forceRefresh, renderFallback: options.renderFallback !== false }));
  const summary = results.reduce((acc, item) => {
    const key = item.status === 'success' ? 'success' : item.status === 'empty' ? 'empty' : 'failed';
    acc[key]++;
    if (item.failureReason) acc.reasons[item.failureReason] = (acc.reasons[item.failureReason] || 0) + 1;
    return acc;
  }, { total: results.length, success: 0, empty: 0, failed: 0, reasons: {} });
  return { results, summary };
}

// ===== 数据管理 =====
const STORAGE_KEY = 'bookmark_timeline_data';
const STORAGE_KEY_TOMBSTONES = 'bookmark_tombstones';
const STORAGE_KEY_SETTINGS = 'app_settings';
const STORAGE_KEY_IMPORT_OPERATIONS = 'bookmark_import_operations';
const DEFAULT_TOMBSTONE_RETENTION_DAYS = 30;
const TOMBSTONE_RETENTION_OPTIONS = [7, 15, 30, 60];

// storage.local has no compare-and-swap. Serialize each logical resource so
// concurrent bookmark events cannot commit stale arrays over user mutations.
const storageMutationQueues = new Map();
function mutateStorageResource(key, mutation) {
  const previous = storageMutationQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const data = await chrome.storage.local.get(key);
    const value = await mutation(data[key]);
    await chrome.storage.local.set({ [key]: value });
    return value;
  });
  storageMutationQueues.set(key, next);
  return next.finally(() => {
    if (storageMutationQueues.get(key) === next) storageMutationQueues.delete(key);
  });
}

async function mutateStoredBookmarks(mutation) {
  return mutateStorageResource(STORAGE_KEY, (current) => mutation(Array.isArray(current) ? current : []));
}

async function mutateTombstones(mutation) {
  return mutateStorageResource(STORAGE_KEY_TOMBSTONES, (current) => mutation(Array.isArray(current) ? current : []));
}
function isSafeExternalUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return false;
  try {
    return /^(https?|ftp):$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

function hasValidStringList(value, maxItems = 50, maxLength = 120) {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= maxLength);
}

function validateRuntimeMessage(message) {
  if (message.action !== undefined && typeof message.action !== 'string') return 'invalid_action';
  if (message.id !== undefined && (typeof message.id !== 'string' || message.id.length > 256)) return 'invalid_id';
  if (message.feedId !== undefined && (typeof message.feedId !== 'string' || message.feedId.length > 256)) return 'invalid_feed_id';
  if (message.title !== undefined && (typeof message.title !== 'string' || message.title.length > 512)) return 'invalid_title';
  if (message.url !== undefined && !isSafeExternalUrl(message.url)) return 'invalid_url';
  if (message.ids !== undefined && !hasValidStringList(message.ids, 500, 256)) return 'invalid_ids';
  for (const key of ['tags', 'addTags', 'removeTags', 'urls', 'orderedIds']) {
    if (message[key] !== undefined && !hasValidStringList(message[key], key === 'urls' ? 50 : 500, key === 'urls' ? 4096 : 120)) return `invalid_${key}`;
  }
  if (Array.isArray(message.urls) && !message.urls.every(isSafeExternalUrl)) return 'invalid_urls';
  return null;
}
async function getStoredBookmarks() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function setStoredBookmarks(bookmarks) {
  await mutateStorageResource(STORAGE_KEY, () => bookmarks);
}

async function getTombstones() {
  const result = await chrome.storage.local.get(STORAGE_KEY_TOMBSTONES);
  return result[STORAGE_KEY_TOMBSTONES] || [];
}

async function setTombstones(tombstones) {
  await mutateStorageResource(STORAGE_KEY_TOMBSTONES, () => tombstones);
}

async function getImportOperations() {
  const result = await chrome.storage.local.get(STORAGE_KEY_IMPORT_OPERATIONS);
  return Array.isArray(result[STORAGE_KEY_IMPORT_OPERATIONS]) ? result[STORAGE_KEY_IMPORT_OPERATIONS] : [];
}

async function saveImportOperation(operation) {
  await mutateStorageResource(STORAGE_KEY_IMPORT_OPERATIONS, (current) => {
    const operations = Array.isArray(current) ? current : [];
    return [operation, ...operations.filter(item => item.id !== operation.id)].slice(0, 10);
  });
}

async function getAppSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEY_SETTINGS);
  return { tombstoneRetentionDays: DEFAULT_TOMBSTONE_RETENTION_DAYS, ...(result[STORAGE_KEY_SETTINGS] || {}) };
}

async function setAppSettings(patch) {
  const current = await getAppSettings();
  await chrome.storage.local.set({ [STORAGE_KEY_SETTINGS]: { ...current, ...patch } });
}

async function pruneTombstones(tombstones, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  return tombstones.filter(t => (t.deletedAt || 0) >= cutoff);
}

// ===== 健康度评分收藏 =====
const HEALTH_SCORE_FAVORITES_KEY = 'health_score_favorites';

async function getHealthScoreFavorites() {
  const result = await chrome.storage.local.get(HEALTH_SCORE_FAVORITES_KEY);
  return result[HEALTH_SCORE_FAVORITES_KEY] || [];
}

async function saveHealthScoreFavorite(record) {
  const favorites = await getHealthScoreFavorites();
  const item = {
    id: record.id || 'hsf_' + Date.now(),
    score: record.score,
    level: record.level,
    details: record.details || [],
    range: record.range || null,
    note: record.note || '',
    createdAt: record.createdAt || Date.now()
  };
  // 去重：同一天同一分数不重复收藏
  const sameDay = favorites.find(f => {
    const sameDate = new Date(f.createdAt).toDateString() === new Date(item.createdAt).toDateString();
    return sameDate && f.score === item.score;
  });
  if (sameDay) return { success: false, error: 'already_exists' };
  favorites.unshift(item);
  // 最多保留 50 条
  if (favorites.length > 50) favorites.length = 50;
  await chrome.storage.local.set({ [HEALTH_SCORE_FAVORITES_KEY]: favorites });
  return { success: true, favorite: item };
}

async function deleteHealthScoreFavorite(id) {
  const favorites = await getHealthScoreFavorites();
  const filtered = favorites.filter(f => f.id !== id);
  await chrome.storage.local.set({ [HEALTH_SCORE_FAVORITES_KEY]: filtered });
  return { success: true };
}

async function getEffectiveRetentionDays() {
  const settings = await getAppSettings();
  return TOMBSTONE_RETENTION_OPTIONS.includes(settings.tombstoneRetentionDays)
    ? settings.tombstoneRetentionDays
    : DEFAULT_TOMBSTONE_RETENTION_DAYS;
}

async function addTombstone(item) {
  if (!item || !item.url) return;
  const retentionDays = await getEffectiveRetentionDays();
  await mutateTombstones(async (current) => {
    const tombstones = await pruneTombstones(current, retentionDays);
    const key = item.url + '_' + item.dateAdded;
    if (tombstones.some(t => (t.url + '_' + t.dateAdded) === key)) return tombstones;
    return [...tombstones, { ...item, deletedAt: Date.now(), deletedFrom: item.deletedFrom || 'manual' }];
  });
}

// ===== 工具函数 =====
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// 并发池：限制同时运行的任务数量，避免瞬时大量 IO
async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

// ===== 书签处理 =====
const BROWSER_BOOKMARK_ROOT_TITLES = new Set([
  String.fromCharCode(0x4e66, 0x7b7e, 0x680f),
  String.fromCharCode(0x5176, 0x4ed6, 0x4e66, 0x7b7e),
  String.fromCharCode(0x79fb, 0x52a8, 0x8bbe, 0x5907, 0x4e66, 0x7b7e),
  'Bookmarks bar', 'Other bookmarks', 'Mobile bookmarks',
]);

function isBrowserBookmarkRoot(title) {
  return BROWSER_BOOKMARK_ROOT_TITLES.has(String(title || '').trim());
}

function joinBookmarkFolderPath(path, title) {
  const name = String(title || '').trim();
  if (!name || isBrowserBookmarkRoot(name)) return normalizeBookmarkFolderPath(path);
  return normalizeBookmarkFolderPath(path ? `${path}/${name}` : name);
}

function bookmarkToItem(bookmark, folderName, folderPath) {
  return {
    id: bookmark.id,
    parentId: bookmark.parentId || '',
    index: Number.isInteger(bookmark.index) ? bookmark.index : 0,
    title: bookmark.title || '',
    url: bookmark.url || '',
    domain: extractDomain(bookmark.url || ''),
    dateAdded: bookmark.dateAdded || Date.now(),
    formattedTime: formatTime(bookmark.dateAdded || Date.now()),
    syncedAt: Date.now(),
    folderName: folderName || '',
    folderPath: folderPath || '',
    tags: [],
    tagsAuto: [],
    contentText: '',
    contentTitle: '',
    contentExcerpt: '',
    contentMetaDesc: '',
    contentMetaKeywords: [],
    contentHeadings: [],
    contentStructuredTypes: [],
    contentFetchedAt: null,
    contentStatus: 'pending',
    contentFailureReason: '',
    contentSource: '',
    pinned: false,
    pinnedAt: null,
    clickCount: 0,
    lastClickedAt: null
  };
}

// 递归遍历所有书签（带文件夹信息）
async function collectAllBookmarks(nodes, folderPath = '', folderName = '') {
  let results = [];
  for (const node of nodes) {
    const currentPath = joinBookmarkFolderPath(folderPath, node.title);
    const currentFolderName = isBrowserBookmarkRoot(node.title) ? folderName : (node.title || folderName);
    if (node.url) {
      results.push(bookmarkToItem(node, folderName, folderPath));
    }
    if (node.children) {
      results = results.concat(await collectAllBookmarks(node.children, currentPath, currentFolderName));
    }
  }
  return results;
}

// 增量合并（去重，保留已有标签）
function mergeBookmarks(existing, incoming) {
  const urlMap = new Map();
  
  // 索引已有的（保留用户手动标签）
  for (const item of existing) {
    const key = item.url + '_' + item.dateAdded;
    urlMap.set(key, item);
  }
  
  // 合并新的（如果已有则保留原有标签）
  let added = 0;
  for (const item of incoming) {
    const key = item.url + '_' + item.dateAdded;
    if (!urlMap.has(key)) {
      urlMap.set(key, item);
      added++;
    }
    // 已有的保留原有 tags，不覆盖
  }
  
  return { merged: Array.from(urlMap.values()), added };
}

function makeImportOperationId() {
  return `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getImportFolderDate() {
  return new Date().toISOString().slice(0, 10);
}

async function getNativeBookmarksForImport() {
  const tree = await chrome.bookmarks.getTree();
  return collectAllBookmarks(tree);
}

async function upsertImportedBookmark(createdBookmark, metadata) {
  const imported = bookmarkToItem(createdBookmark, metadata.folderName, metadata.folderPath);
  imported.tags = BookmarkData.normalizeTags(metadata.tags);
  imported.tagsAuto = [...imported.tags];
  imported.pinned = !!metadata.pinned;
  imported.pinnedAt = imported.pinned ? (metadata.pinnedAt || Date.now()) : null;
  imported.contentText = metadata.contentText || '';
  imported.contentTitle = metadata.contentTitle || '';
  imported.contentExcerpt = metadata.contentExcerpt || metadata.excerpt || metadata.summary || '';
  imported.contentMetaDesc = metadata.contentMetaDesc || metadata.metaDesc || '';
  imported.contentMetaKeywords = Array.isArray(metadata.contentMetaKeywords || metadata.metaKeywords) ? (metadata.contentMetaKeywords || metadata.metaKeywords) : [];
  imported.contentHeadings = Array.isArray(metadata.contentHeadings || metadata.headings) ? (metadata.contentHeadings || metadata.headings) : [];
  imported.contentStructuredTypes = Array.isArray(metadata.contentStructuredTypes || metadata.structuredTypes) ? (metadata.contentStructuredTypes || metadata.structuredTypes) : [];
  imported.contentFetchedAt = metadata.contentFetchedAt || null;
  imported.contentStatus = metadata.contentStatus || (imported.contentText ? 'success' : 'pending');
  imported.contentFailureReason = metadata.contentFailureReason || '';
  imported.contentSource = metadata.contentSource || '';
  imported.importedAt = Date.now();

  const stored = await getStoredBookmarks();
  const position = stored.findIndex(item => item.id === imported.id);
  if (position >= 0) {
    const previous = stored[position];
    imported.tags = BookmarkData.normalizeTags([...(previous.tags || []), ...imported.tags]);
    imported.tagsAuto = BookmarkData.normalizeTags([...(previous.tagsAuto || []), ...imported.tagsAuto]);
    imported.pinned = previous.pinned || imported.pinned;
    imported.pinnedAt = imported.pinned ? (previous.pinnedAt || imported.pinnedAt || Date.now()) : null;
    stored[position] = { ...previous, ...imported };
  } else {
    stored.unshift(imported);
  }
  await setStoredBookmarks(stored);
  return imported;
}

async function mergeImportedMetadata(existingId, metadata) {
  let stored = await getStoredBookmarks();
  let target = stored.find(item => item.id === existingId);
  if (!target) {
    const nodes = await chrome.bookmarks.get(existingId);
    const node = nodes && nodes[0];
    if (!node || !node.url) return false;
    const folder = await getBookmarkFolderInfo(node);
    target = await upsertImportedBookmark(node, {
      ...metadata,
      folderName: folder.title || metadata.folderName,
      folderPath: folder.path || metadata.folderPath,
    });
    stored = await getStoredBookmarks();
  }
  const position = stored.findIndex(item => item.id === existingId);
  if (position < 0) return false;
  stored[position].tags = BookmarkData.normalizeTags([...(stored[position].tags || []), ...(metadata.tags || [])]);
  stored[position].tagsAuto = BookmarkData.normalizeTags([...(stored[position].tagsAuto || []), ...(metadata.tags || [])]);
  stored[position].pinned = stored[position].pinned || !!metadata.pinned;
  if (stored[position].pinned && !stored[position].pinnedAt) stored[position].pinnedAt = Date.now();
  await setStoredBookmarks(stored);
  return true;
}

async function importBookmarksV2(message) {
  const incoming = Array.isArray(message.bookmarks) ? message.bookmarks : [];
  if (incoming.length === 0) return { success: false, error: 'no_bookmarks_to_import' };

  const operation = {
    id: makeImportOperationId(),
    startedAt: Date.now(),
    version: 2,
    status: 'running',
    request: {
      bookmarks: incoming,
      rootTitle: message.rootTitle || 'AI Bookmark OS 导入',
      rootDate: message.rootDate || getImportFolderDate(),
      duplicateStrategy: message.duplicateStrategy || 'merge',
    },
    created: [],
    skipped: [],
    merged: [],
    invalid: [],
    failed: [],
  };
  await saveImportOperation(operation);

  try {
    const nativeBookmarks = await getNativeBookmarksForImport();
    const plan = BookmarkData.buildImportPlan({
      incoming,
      existing: nativeBookmarks,
      rootTitle: message.rootTitle || 'AI Bookmark OS 导入',
      rootDate: message.rootDate || getImportFolderDate(),
      duplicateStrategy: message.duplicateStrategy || 'merge',
    });
    operation.skipped = plan.skipped;
    operation.invalid = plan.invalid;

    const folders = new Map();
    for (const folder of plan.folders) {
      try {
        const createdFolder = await findOrCreateFolderPath(folder.key);
        if (!createdFolder || !createdFolder.id) throw new Error('folder_create_failed');
        folders.set(folder.key, createdFolder);
      } catch (error) {
        operation.failed.push({ folderKey: folder.key, error: error.message || 'folder_create_failed' });
      }
    }

    for (const entry of plan.create) {
      const folder = folders.get(entry.folderKey);
      if (!folder) {
        operation.failed.push({ title: entry.metadata.title, url: entry.metadata.url, error: 'destination_folder_unavailable' });
        continue;
      }
      try {
        const created = await chrome.bookmarks.create({
          parentId: folder.id,
          title: entry.metadata.title,
          url: entry.metadata.url,
        });
        const metadata = { ...entry.metadata, folderName: folder.title || entry.metadata.folderName, folderPath: entry.folderKey };
        await upsertImportedBookmark(created, metadata);
        operation.created.push({ id: created.id, title: created.title || metadata.title, url: created.url || metadata.url });
      } catch (error) {
        operation.failed.push({ title: entry.metadata.title, url: entry.metadata.url, error: error.message || 'bookmark_create_failed' });
      }
      await saveImportOperation(operation);
    }

    for (const entry of plan.merge) {
      try {
        if (await mergeImportedMetadata(entry.existingId, entry.metadata)) {
          operation.merged.push({ id: entry.existingId, url: entry.metadata.url });
        } else {
          operation.failed.push({ url: entry.metadata.url, error: 'duplicate_target_not_found' });
        }
      } catch (error) {
        operation.failed.push({ url: entry.metadata.url, error: error.message || 'metadata_merge_failed' });
      }
    }

    operation.status = operation.failed.length ? 'partial' : 'completed';
    operation.completedAt = Date.now();
    await saveImportOperation(operation);
    return {
      success: operation.failed.length === 0,
      operationId: operation.id,
      created: operation.created,
      skipped: operation.skipped,
      merged: operation.merged,
      invalid: operation.invalid,
      failed: operation.failed,
      total: operation.created.length,
      added: operation.created.length,
    };
  } catch (error) {
    operation.status = 'partial';
    operation.completedAt = Date.now();
    operation.failed.push({ error: error.message || 'import_failed' });
    await saveImportOperation(operation);
    return { success: false, operationId: operation.id, error: error.message || 'import_failed', failed: operation.failed };
  }
}

async function retryImportOperation(operationId) {
  const operation = (await getImportOperations()).find((item) => item.id === operationId);
  if (!operation?.request?.bookmarks?.length) return { success: false, error: 'import_operation_not_retryable' };
  return importBookmarksV2({ ...operation.request, retryOf: operationId });
}

async function rollbackImportOperation(operationId) {
  const operation = (await getImportOperations()).find((item) => item.id === operationId);
  if (!operation) return { success: false, error: 'import_operation_not_found' };
  const failed = [];
  let removed = 0;
  for (const created of operation.created || []) {
    try {
      const [node] = await chrome.bookmarks.get(created.id);
      if (!node?.url || node.url !== created.url || node.title !== created.title) {
        failed.push({ id: created.id, error: 'bookmark_changed_after_import' });
        continue;
      }
      await chrome.bookmarks.remove(created.id);
      removed++;
    } catch {
      // Already removed is a successful rollback outcome.
    }
  }
  await mutateStoredBookmarks((bookmarks) => bookmarks.filter((item) => !(operation.created || []).some((created) => created.id === item.id)));
  operation.rollback = { attemptedAt: Date.now(), removed, failed };
  operation.status = failed.length ? 'rollback_partial' : 'rolled_back';
  await saveImportOperation(operation);
  return { success: failed.length === 0, removed, failed };
}
// ===== 同步操作 =====
async function syncAllBookmarksOnce() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const allBookmarks = await collectAllBookmarks(tree);
    const existing = await getStoredBookmarks();

    // 原生 ID 是主键；旧镜像才回退到 URL + 创建时间兼容匹配。
    const existingById = new Map();
    const existingByKey = new Map();
    for (const item of existing) {
      if (item.id) existingById.set(item.id, item);
      const key = item.url + '_' + item.dateAdded;
      existingByKey.set(key, item);
    }

    // 合并：保留已有 pinned 状态和手动标签
    let added = 0;
    const merged = [];
    const currentKeys = new Set();
    const currentIds = new Set();
    for (const item of allBookmarks) {
      const key = item.url + '_' + item.dateAdded;
      const prev = existingById.get(item.id) || existingByKey.get(key);
      currentKeys.add(key);
      currentIds.add(item.id);
      if (prev) {
        item.pinned = !!prev.pinned;
        item.pinnedAt = prev.pinnedAt || null;
        item.clickCount = prev.clickCount || 0;
        item.lastClickedAt = prev.lastClickedAt || null;
        item.contentText = prev.contentText || '';
        item.contentTitle = prev.contentTitle || '';
        item.contentExcerpt = prev.contentExcerpt || '';
        item.contentMetaDesc = prev.contentMetaDesc || '';
        item.contentMetaKeywords = prev.contentMetaKeywords || [];
        item.contentHeadings = prev.contentHeadings || [];
        item.contentStructuredTypes = prev.contentStructuredTypes || [];
        item.contentFetchedAt = prev.contentFetchedAt || null;
        item.contentStatus = prev.contentStatus || item.contentStatus;
        item.contentFailureReason = prev.contentFailureReason || '';
        item.contentSource = prev.contentSource || '';
        if (prev.tags && prev.tags.length > 0) {
          // 合并：用户手动标签优先
          const auto = new Set(item.tags || []);
          const manual = new Set(prev.tags);
          item.tags = Array.from(new Set([...manual, ...auto]));
        }
      } else {
        added++;
      }
      merged.push(item);
    }

    // 检测删除：existing 中存在但 currentKeys 中不存在的项写入 tombstones
    const settings = await getAppSettings();
    const retentionDays = TOMBSTONE_RETENTION_OPTIONS.includes(settings.tombstoneRetentionDays)
      ? settings.tombstoneRetentionDays
      : DEFAULT_TOMBSTONE_RETENTION_DAYS;
    const prevTombstones = await pruneTombstones(await getTombstones(), retentionDays);
    const existingTombstoneKeys = new Set(prevTombstones.map(t => t.url + '_' + t.dateAdded));
    const newTombstones = [...prevTombstones];
    for (const item of existing) {
      const key = item.url + '_' + item.dateAdded;
      if (!currentIds.has(item.id) && !currentKeys.has(key) && !existingTombstoneKeys.has(key) && item.url) {
        newTombstones.push({ ...item, deletedAt: Date.now() });
      }
    }
    if (newTombstones.length !== prevTombstones.length) {
      await setTombstones(newTombstones);
    }

    // 为没有标签的书签自动打标签（并发池，仅更新通用文档频率，避免污染标签语料）
    const needsTag = merged.filter(item => !item.tags || item.tags.length === 0);
    const taggedResults = await autoTagBookmarks(needsTag, 10);
    let taggedCount = 0;
    taggedResults.forEach((res, i) => {
      const tags = res.tags || [];
      needsTag[i].tags = tags;
      needsTag[i].tagsAuto = tags;
      taggedCount++;
    });

    // 从 Chrome 历史记录获取真实点击次数
    await enrichClickCounts(merged, 10);

    // 排序：置顶在前，再按时间倒序
    merged.sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return b.dateAdded - a.dateAdded;
    });

    await mutateStoredBookmarks((latest) => {
      const latestById = new Map(latest.map((item) => [item.id, item]));
      const latestByKey = new Map(latest.map((item) => [item.url + '_' + item.dateAdded, item]));
      return merged.map((item) => {
        const current = latestById.get(item.id) || latestByKey.get(item.url + '_' + item.dateAdded);
        if (!current) return item;
        return {
          ...item,
          pinned: !!current.pinned,
          pinnedAt: current.pinnedAt || null,
          clickCount: current.clickCount || 0,
          lastClickedAt: current.lastClickedAt || null,
          tags: current.tags?.length ? Array.from(new Set([...(current.tags || []), ...(item.tags || [])])) : item.tags,
          contentText: current.contentText || item.contentText,
          contentTitle: current.contentTitle || item.contentTitle,
          contentExcerpt: current.contentExcerpt || item.contentExcerpt,
          contentMetaDesc: current.contentMetaDesc || item.contentMetaDesc,
          contentMetaKeywords: current.contentMetaKeywords || item.contentMetaKeywords,
          contentHeadings: current.contentHeadings || item.contentHeadings,
          contentStructuredTypes: current.contentStructuredTypes || item.contentStructuredTypes,
          contentFetchedAt: current.contentFetchedAt || item.contentFetchedAt,
          contentStatus: current.contentStatus || item.contentStatus,
          contentFailureReason: current.contentFailureReason || item.contentFailureReason,
          contentSource: current.contentSource || item.contentSource,
        };
      });
    });
    return { total: merged.length, added, tagged: taggedCount };
  } catch (err) {
    console.error('全量同步失败:', err);
    throw err;
  }
}

let syncAllInFlight = null;
async function syncAllBookmarks() {
  if (!syncAllInFlight) {
    syncAllInFlight = syncAllBookmarksOnce().finally(() => { syncAllInFlight = null; });
  }
  return syncAllInFlight;
}
// 暂存一键收藏的标签/文件夹信息，供 onCreated → addSingleBookmark 消费
// key: url, value: { tags, folderName, folderPath }
const pendingQuickBookmarks = new Map();
const INCREMENTAL_CLASSIFY_QUEUE_KEY = 'incrementalClassificationQueue';

async function enqueueIncrementalClassification(id, bookmark) {
  const data = await chrome.storage.local.get(['settings', INCREMENTAL_CLASSIFY_QUEUE_KEY]);
  const settings = data.settings || {};
  if (settings.incrementalClassificationEnabled !== true || !settings.apiKey || !bookmark?.url) return;
  const current = Array.isArray(data[INCREMENTAL_CLASSIFY_QUEUE_KEY]) ? data[INCREMENTAL_CLASSIFY_QUEUE_KEY] : [];
  const byId = new Map(current.filter(item => item && item.id).map(item => [item.id, item]));
  if (!byId.has(id)) {
    byId.set(id, { id, createdAt: bookmark.dateAdded || Date.now(), attempts: 0 });
    const queue = [...byId.values()]
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(-500);
    await chrome.storage.local.set({ [INCREMENTAL_CLASSIFY_QUEUE_KEY]: queue });
  }
}

function normalizeTagList(tags) {
  const normalized = new Map();
  for (const item of tags || []) {
    const tag = String(typeof item === 'string' ? item : item?.tag || '')
      .replace(/^#+/, '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24);
    if (tag && !normalized.has(tag.toLowerCase())) normalized.set(tag.toLowerCase(), tag);
  }
  return [...normalized.values()].slice(0, 8);
}

function normalizeBookmarkFolderPath(path) {
  const parts = String(path || '')
    .split('/')
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => !isBrowserBookmarkRoot(part));
  return parts.join('/');
}

function matchBookmarkFolderOption(folderOptions, path) {
  const normalized = normalizeBookmarkFolderPath(path);
  if (!normalized) return null;
  const options = Array.isArray(folderOptions) ? folderOptions : [];
  return options.find(folder => normalizeBookmarkFolderPath(folder.path) === normalized) || null;
}

const FOLDER_EVIDENCE_STOP_WORDS = new Set([
  'bookmark', 'bookmarks', 'folder', 'folders', 'other', 'misc', 'new', 'work', 'personal',
  '书签', '收藏', '文件夹', '其他', '杂项', '资料', '归档', '临时'
]);

function tokenizeFolderEvidence(value) {
  const text = String(value || '').toLowerCase();
  const tokens = text
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .map(part => part.trim())
    .filter(part => part.length >= 2);
  const chinese = text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  return [...new Set([...tokens, ...chinese])];
}

function escapeFolderEvidenceRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBookmarkFolderEvidenceText(bookmark, aiSuggestion) {
  return [
    bookmark?.title,
    bookmark?.url,
    bookmark?.domain,
    bookmark?.metaDesc,
    bookmark?.excerpt,
    bookmark?.contentTitle,
    bookmark?.contentText,
    bookmark?.ogDescription,
    aiSuggestion?.summary,
    aiSuggestion?.reason,
    ...(Array.isArray(bookmark?.headings) ? bookmark.headings : []),
    ...(Array.isArray(bookmark?.contentHeadings) ? bookmark.contentHeadings : []),
    ...(Array.isArray(bookmark?.metaKeywords) ? bookmark.metaKeywords : []),
    ...(Array.isArray(bookmark?.contentMetaKeywords) ? bookmark.contentMetaKeywords : []),
    ...(Array.isArray(bookmark?.structuredTypes) ? bookmark.structuredTypes : []),
    ...(Array.isArray(bookmark?.contentStructuredTypes) ? bookmark.contentStructuredTypes : []),
    ...(Array.isArray(aiSuggestion?.evidence) ? aiSuggestion.evidence : []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function folderEvidenceTokenMatchesText(token, evidenceText) {
  const normalized = String(token || '').toLowerCase().trim();
  if (normalized.length < 2 || FOLDER_EVIDENCE_STOP_WORDS.has(normalized)) return false;
  if (/[\u4e00-\u9fa5]/.test(normalized)) return evidenceText.includes(normalized);
  const re = new RegExp(`(^|[^a-z0-9])${escapeFolderEvidenceRegExp(normalized)}([^a-z0-9]|$)`, 'i');
  return re.test(evidenceText);
}

function getFolderPathTokens(folderPath) {
  return normalizeBookmarkFolderPath(folderPath).split('/').flatMap(tokenizeFolderEvidence);
}

function getTagTokens(tags) {
  return new Set(normalizeTagList(tags).flatMap(tokenizeFolderEvidence));
}

function addWeightedToken(target, token, weight) {
  const normalized = String(token || '').toLowerCase().trim();
  if (!normalized || FOLDER_EVIDENCE_STOP_WORDS.has(normalized)) return;
  target.set(normalized, (target.get(normalized) || 0) + weight);
}

function getUrlPathEvidence(url) {
  const raw = String(url || '');
  try {
    const parsed = new URL(raw);
    return [parsed.pathname, parsed.search, parsed.hash].filter(Boolean).join(' ');
  } catch {
    return raw.replace(/^[a-z]+:\/\/[^/]+/i, '');
  }
}

function collectBookmarkTokenWeights(bookmark, tags = [], aiSuggestion = null) {
  const strong = new Map();
  const weak = new Map();
  const addText = (target, value, weight) => {
    const text = String(value || '').slice(0, 4000);
    for (const token of tokenizeFolderEvidence(text)) addWeightedToken(target, token, weight);
  };
  addText(strong, bookmark?.title, 5);
  addText(strong, getUrlPathEvidence(bookmark?.url), 4);
  addText(strong, bookmark?.metaDesc, 3);
  addText(strong, bookmark?.excerpt, 3);
  addText(strong, bookmark?.contentTitle, 4);
  addText(strong, bookmark?.contentText, 2);
  addText(strong, bookmark?.ogDescription, 3);
  addText(strong, aiSuggestion?.summary, 3);
  addText(strong, aiSuggestion?.reason, 4);
  for (const value of Array.isArray(bookmark?.headings) ? bookmark.headings : []) addText(strong, value, 3);
  for (const value of Array.isArray(bookmark?.metaKeywords) ? bookmark.metaKeywords : []) addText(strong, value, 3);
  for (const value of Array.isArray(aiSuggestion?.evidence) ? aiSuggestion.evidence : []) addText(strong, value, 3);
  for (const tag of normalizeTagList(tags)) addText(weak, tag, 3);
  for (const tag of normalizeTagList(aiSuggestion?.tags)) addText(weak, tag, 2);
  return { strong, weak, domain: String(bookmark?.domain || extractDomain(bookmark?.url || '') || '').toLowerCase() };
}

function weightedTokenOverlap(left, right) {
  let score = 0;
  let count = 0;
  for (const [token, leftWeight] of left) {
    const rightWeight = right.get(token) || 0;
    if (rightWeight <= 0) continue;
    score += Math.min(leftWeight, rightWeight);
    count += 1;
  }
  return { score, count };
}

function buildFolderProfiles(storedBookmarks, folderOptions = []) {
  const profiles = new Map();
  for (const item of storedBookmarks || []) {
    const normalizedPath = normalizeBookmarkFolderPath(item?.folderPath);
    if (!normalizedPath) continue;
    const matchedFolder = folderOptions.length > 0 ? matchBookmarkFolderOption(folderOptions, normalizedPath) : { path: normalizedPath, id: '', title: item.folderName || '' };
    if (!matchedFolder) continue;
    const path = matchedFolder.path;
    if (!profiles.has(path)) {
      profiles.set(path, {
        id: matchedFolder.id || '',
        title: matchedFolder.title || item.folderName || path.split('/').filter(Boolean).slice(-1)[0] || '',
        folderName: matchedFolder.title || item.folderName || path.split('/').filter(Boolean).slice(-1)[0] || '',
        folderPath: path,
        strong: new Map(),
        weak: new Map(),
        domains: new Map(),
        count: 0
      });
    }
    const profile = profiles.get(path);
    const tokens = collectBookmarkTokenWeights(item, item.tags || []);
    for (const [token, weight] of tokens.strong) addWeightedToken(profile.strong, token, Math.min(weight, 6));
    for (const [token, weight] of tokens.weak) addWeightedToken(profile.weak, token, Math.min(weight, 3));
    if (tokens.domain) profile.domains.set(tokens.domain, (profile.domains.get(tokens.domain) || 0) + 1);
    profile.count += 1;
  }
  return profiles;
}

function scoreFolderProfileCandidates(storedBookmarks, folderOptions, bookmark, suggestedTags, aiSuggestion) {
  const bookmarkTokens = collectBookmarkTokenWeights(bookmark, suggestedTags, aiSuggestion);
  const candidates = [];
  for (const profile of buildFolderProfiles(storedBookmarks, folderOptions).values()) {
    const strongOverlap = weightedTokenOverlap(profile.strong, bookmarkTokens.strong);
    const weakOverlap = weightedTokenOverlap(profile.weak, bookmarkTokens.weak);
    const tagToContentOverlap = weightedTokenOverlap(profile.weak, bookmarkTokens.strong);
    const sameDomainCount = bookmarkTokens.domain ? (profile.domains.get(bookmarkTokens.domain) || 0) : 0;
    const hasReliableSimilarity = sameDomainCount > 0 || strongOverlap.count >= 2;
    if (!hasReliableSimilarity) continue;
    const score = sameDomainCount * 45 + strongOverlap.score * 8 + weakOverlap.score * 4 + tagToContentOverlap.score * 3 + Math.min(profile.count, 8);
    if (score <= 0) continue;
    candidates.push({
      id: profile.id,
      title: profile.title,
      folderName: profile.folderName,
      path: profile.folderPath,
      folderPath: profile.folderPath,
      exists: true,
      score,
      count: profile.count,
      reasons: [
        ...(sameDomainCount > 0 ? [`domain-history:${bookmarkTokens.domain}`] : []),
        ...(strongOverlap.count > 0 ? [`profile-content:${strongOverlap.count}`] : []),
        ...(weakOverlap.count > 0 ? [`profile-tag:${weakOverlap.count}`] : [])
      ]
    });
  }
  return candidates.sort((a, b) => b.score - a.score || b.count - a.count || a.folderPath.localeCompare(b.folderPath, 'zh'));
}

function folderTokenMatchesTag(token, tagTokens) {
  const normalized = String(token || '').toLowerCase().trim();
  if (!normalized || FOLDER_EVIDENCE_STOP_WORDS.has(normalized)) return false;
  return tagTokens.has(normalized);
}

function scoreFolderPathEvidence(folderPath, bookmark, ruleTags, aiSuggestion) {
  const normalized = normalizeBookmarkFolderPath(folderPath);
  if (!normalized) return { score: 0, reasons: [] };
  const evidenceText = getBookmarkFolderEvidenceText(bookmark, aiSuggestion);
  const localTagTokens = getTagTokens(ruleTags);
  const aiTagTokens = getTagTokens(aiSuggestion?.tags);
  const reasons = [];
  let score = 0;

  const tokens = getFolderPathTokens(normalized).filter(token => !FOLDER_EVIDENCE_STOP_WORDS.has(token));
  const parts = normalized.split('/').filter(Boolean);
  const leafTokens = new Set(tokenizeFolderEvidence(parts[parts.length - 1] || '').filter(token => !FOLDER_EVIDENCE_STOP_WORDS.has(token)));
  let leafMatched = leafTokens.size === 0;
  for (const token of tokens) {
    let matched = false;
    if (folderTokenMatchesTag(token, localTagTokens)) {
      score += 18;
      reasons.push(`local-tag:${token}`);
      matched = true;
    }
    if (folderTokenMatchesTag(token, aiTagTokens)) {
      score += 12;
      reasons.push(`ai-tag:${token}`);
      matched = true;
    }
    if (folderEvidenceTokenMatchesText(token, evidenceText)) {
      score += 30;
      reasons.push(`content:${token}`);
      matched = true;
    }
    if (matched && leafTokens.has(token)) leafMatched = true;
  }
  if (parts.length > 1 && !leafMatched) return { score: 0, reasons: [] };
  if (tokens.length > 1 && score > 0) score += 6;

  return { score, reasons: [...new Set(reasons)] };
}

function scoreHistoricalFolderCandidates(storedBookmarks, suggestedTags, bookmark, aiSuggestion, folderOptions = []) {
  const tags = normalizeTagList(suggestedTags);
  if (tags.length === 0) return [];
  const tagSet = new Set(tags);
  const folderScore = new Map();
  for (const item of storedBookmarks || []) {
    if (!item?.folderPath) continue;
    const normalizedPath = normalizeBookmarkFolderPath(item.folderPath);
    if (!normalizedPath) continue;
    const matchedFolder = folderOptions.length > 0 ? matchBookmarkFolderOption(folderOptions, normalizedPath) : { path: normalizedPath, id: '', title: item.folderName || '' };
    if (!matchedFolder) continue;
    const overlap = normalizeTagList(item.tags).filter(tag => tagSet.has(tag)).length;
    if (overlap <= 0) continue;
    const evidence = scoreFolderPathEvidence(matchedFolder.path, bookmark, tags, aiSuggestion);
    if (evidence.score <= 0) continue;
    const key = matchedFolder.path;
    if (!key) continue;
    if (!folderScore.has(key)) {
      const folderName = matchedFolder.title || item.folderName || key.split('/').filter(Boolean).slice(-1)[0] || '';
      folderScore.set(key, { count: 0, score: 0, folderName, folderPath: key, reasons: new Set() });
    }
    const candidate = folderScore.get(key);
    candidate.count += overlap;
    candidate.score = Math.max(candidate.score, evidence.score + overlap * 10);
    for (const reason of evidence.reasons) candidate.reasons.add(reason);
  }
  return [...folderScore.values()]
    .map(item => ({ ...item, reasons: [...item.reasons] }))
    .sort((a, b) => b.score - a.score || b.count - a.count || a.folderPath.localeCompare(b.folderPath, 'zh'));
}

function scoreExistingFolderCandidates(folderOptions, suggestedTags, bookmark, aiSuggestion) {
  const tags = normalizeTagList(suggestedTags);
  const candidates = [];
  const seen = new Set();
  for (const folder of Array.isArray(folderOptions) ? folderOptions : []) {
    const path = normalizeBookmarkFolderPath(folder?.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const evidence = scoreFolderPathEvidence(path, bookmark, tags, aiSuggestion);
    if (evidence.score <= 0) continue;
    candidates.push({
      id: folder.id || '',
      title: folder.title || path.split('/').filter(Boolean).slice(-1)[0] || '',
      folderName: folder.title || path.split('/').filter(Boolean).slice(-1)[0] || '',
      path,
      folderPath: path,
      exists: true,
      score: evidence.score,
      count: 0,
      reasons: evidence.reasons
    });
  }
  return candidates.sort((a, b) => b.score - a.score || a.folderPath.localeCompare(b.folderPath, 'zh'));
}

function chooseBestBookmarkFolderCandidate(candidates) {
  const byPath = new Map();
  for (const item of Array.isArray(candidates) ? candidates : []) {
    const path = normalizeBookmarkFolderPath(item?.folderPath || item?.path);
    if (!path) continue;
    const itemScore = Number(item.score || 0);
    if (itemScore <= 0) continue;
    const current = byPath.get(path) || { ...item, folderPath: path, path, score: 0, count: 0, reasons: new Set(), exists: !!item.exists };
    current.score = Math.max(current.score, itemScore);
    current.count += Number(item.count || 0);
    current.exists = current.exists || !!item.exists;
    current.id = current.id || item.id || '';
    current.title = current.title || item.title || item.folderName || '';
    current.folderName = current.folderName || item.folderName || item.title || '';
    for (const reason of item.reasons || []) current.reasons.add(reason);
    byPath.set(path, current);
  }
  const list = [...byPath.values()].map(item => ({ ...item, reasons: [...item.reasons] }));
  if (list.length === 0) return null;
  return list.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (!!b.exists !== !!a.exists) return b.exists ? 1 : -1;
    return (a.folderPath || a.path || '').localeCompare(b.folderPath || b.path || '', 'zh');
  })[0] || null;
}


function chooseAISuggestedFolder(aiFolderPath, folderOptions, bookmark, ruleTags, aiSuggestion) {
  const normalized = normalizeBookmarkFolderPath(aiFolderPath);
  if (!normalized) return null;
  const matched = matchBookmarkFolderOption(folderOptions, normalized);
  if (!matched) return null;
  const evidence = scoreFolderPathEvidence(matched.path, bookmark, ruleTags, aiSuggestion);
  if (evidence.score <= 0) return null;
  return { path: matched.path, id: matched.id || '', exists: true, score: evidence.score, reasons: evidence.reasons };
}

async function loadBookmarkFolderOptions() {
  const tree = await chrome.bookmarks.getTree();
  const options = [];
  const walk = (nodes, path = '', displayPath = '') => {
    for (const node of nodes || []) {
      if (node.url) continue;
      const nextPath = joinBookmarkFolderPath(path, node.title);
      const nextDisplayPath = node.title
        ? (displayPath ? `${displayPath}/${node.title}` : node.title)
        : displayPath;
      if (node.id !== '0' && nextPath && !isBrowserBookmarkRoot(node.title)) {
        options.push({ id: node.id, title: node.title || '', path: nextPath, displayPath: nextDisplayPath });
      }
      if (node.children) walk(node.children, nextPath, nextDisplayPath);
    }
  };
  walk(tree);
  return options.sort((a, b) => a.displayPath.localeCompare(b.displayPath, 'zh'));
}

async function findExistingFolderByExactPath(path) {
  const options = await loadBookmarkFolderOptions();
  const matched = matchBookmarkFolderOption(options, path);
  return matched ? { id: matched.id, title: matched.title, path: matched.path } : null;
}

async function getBookmarkFolderInfo(bookmark) {
  if (!bookmark?.parentId) return { id: '', path: '', title: '' };
  const folders = await loadBookmarkFolderOptions();
  const folder = folders.find(item => item.id === bookmark.parentId);
  return folder || { id: bookmark.parentId, path: '', title: '' };
}

function buildLocalBookmarkSuggestion(tempItem, ruleTags, suggestedFolder, aiSuggestion, aiError) {
  const ruleTagNames = normalizeTagList(ruleTags);
  const aiTagNames = normalizeTagList(aiSuggestion?.tags);
  const mergedTags = aiTagNames.length > 0 && typeof mergeAITags === 'function'
    ? mergeAITags(ruleTags, aiSuggestion.tags, 3)
    : ruleTags;
  const finalTags = normalizeTagList(mergedTags).slice(0, 3);
  return {
    title: tempItem.title || tempItem.url,
    url: tempItem.url,
    domain: tempItem.domain || extractDomain(tempItem.url),
    tags: finalTags,
    folderName: suggestedFolder?.title || '',
    folderPath: suggestedFolder?.path || '',
    folderId: suggestedFolder?.id || '',
    summary: aiSuggestion?.summary || tempItem.excerpt || tempItem.metaDesc || '',
    reason: aiSuggestion?.reason || (aiError ? 'AI 建议生成失败，可手动选择分类后继续收藏。' : '根据标题、域名、页面内容与本地规则生成建议。'),
    evidence: aiSuggestion?.evidence || [],
    aiAvailable: !!aiSuggestion,
    aiError: aiError || '',
    ruleTags: ruleTagNames,
    contentText: tempItem.contentText || '',
    contentTitle: tempItem.contentTitle || '',
    metaKeywords: tempItem.metaKeywords || [],
    headings: tempItem.headings || [],
    structuredTypes: tempItem.structuredTypes || [],
    contentFetchedAt: tempItem.contentFetchedAt || null,
    contentStatus: tempItem.contentStatus || (tempItem.contentText ? 'success' : 'failed'),
    contentFailureReason: tempItem.contentFailureReason || '',
    contentSource: tempItem.contentSource || '',
    metaDesc: tempItem.metaDesc || '',
    excerpt: tempItem.excerpt || tempItem.metaDesc || '',
    createdAt: Date.now()
  };
}

async function prepareBookmarkSuggestion(tab) {
  const contentData = (tab.id && tab.url) ? await extractActiveTabContent(tab.id, tab.url) : null;
  const tempItem = {
    url: tab.url,
    title: tab.title || tab.url,
    domain: extractDomain(tab.url),
    contentText: contentData?.textContent || '',
    contentTitle: contentData?.title || '',
    metaKeywords: contentData?.metaKeywords || [],
    headings: contentData?.headings || [],
    structuredTypes: contentData?.structuredTypes || [],
    contentFetchedAt: contentData?.fetchedAt || null,
    contentStatus: contentData?.status || 'failed',
    contentFailureReason: contentData?.failureReason || (!contentData ? 'extract_failed' : ''),
    contentSource: contentData?.source || '',
    metaDesc: contentData?.metaDesc || '',
    excerpt: contentData?.excerpt || contentData?.metaDesc || ''
  };

  const ruleTags = typeof autoTagBookmarkSync === 'function' ? autoTagBookmarkSync(tempItem) : [];
  const tagNames = normalizeTagList(ruleTags);
  const folderOptions = await loadBookmarkFolderOptions().catch(() => []);
  const suggestedFolder = await suggestBookmarkFolderReadOnly(tab.url, tab.title, tagNames, tempItem);
  let aiSuggestion = null;
  let aiError = '';
  try {
    if (typeof suggestBookmarkWithAI === 'function') {
      aiSuggestion = await suggestBookmarkWithAI(tempItem, ruleTags, { folderOptions });
    }
  } catch (err) {
    aiError = err?.message || String(err || 'AI request failed');
  }

  const draft = buildLocalBookmarkSuggestion(tempItem, ruleTags, suggestedFolder, aiSuggestion, aiError);
  const storedBookmarks = await getStoredBookmarks().catch(() => []);
  const aiFolderPath = normalizeBookmarkFolderPath(aiSuggestion?.folderPath);
  const acceptedAiFolder = chooseAISuggestedFolder(aiFolderPath, folderOptions, tempItem, ruleTags, aiSuggestion);
  const localFolder = suggestedFolder ? {
    id: suggestedFolder.id || '',
    title: suggestedFolder.title || '',
    folderName: suggestedFolder.title || '',
    path: suggestedFolder.path || '',
    folderPath: suggestedFolder.path || '',
    exists: !!suggestedFolder.id,
    score: scoreFolderPathEvidence(suggestedFolder.path, tempItem, ruleTags, aiSuggestion).score,
    reasons: []
  } : null;
  const folderScoringTags = draft.tags.length ? draft.tags : tagNames;
  const historyCandidates = scoreHistoricalFolderCandidates(storedBookmarks, folderScoringTags, tempItem, aiSuggestion, folderOptions);
  const existingCandidates = scoreExistingFolderCandidates(folderOptions, folderScoringTags, tempItem, aiSuggestion);
  const profileCandidates = scoreFolderProfileCandidates(storedBookmarks, folderOptions, tempItem, folderScoringTags, aiSuggestion);
  const bestFolder = chooseBestBookmarkFolderCandidate([localFolder, acceptedAiFolder, ...historyCandidates, ...existingCandidates, ...profileCandidates]);
  if (bestFolder) {
    draft.folderPath = bestFolder.folderPath || bestFolder.path || '';
    draft.folderId = bestFolder.id || '';
    draft.folderName = draft.folderPath.split('/').filter(Boolean).slice(-1)[0] || bestFolder.folderName || bestFolder.title || draft.folderName;
    draft.recommendedFolderPath = draft.folderPath;
    draft.recommendedFolderExists = !!bestFolder.exists;
  } else {
    draft.recommendedFolderPath = '';
    draft.recommendedFolderExists = false;
  }
  draft.folderOptions = folderOptions;
  if (!draft.folderPath && draft.tags.length) {
    const fallbackFolder = await suggestBookmarkFolderReadOnly(tab.url, tab.title, draft.tags, tempItem);
    if (fallbackFolder) {
      draft.folderId = fallbackFolder.id || '';
      draft.folderName = fallbackFolder.title || draft.folderName;
      draft.folderPath = fallbackFolder.path || '';
      draft.recommendedFolderPath = normalizeBookmarkFolderPath(fallbackFolder.path || draft.recommendedFolderPath);
      draft.recommendedFolderExists = !!fallbackFolder.id;
    }
  }
  const existing = await chrome.bookmarks.search({ url: tempItem.url });
  const duplicate = existing[0];
  if (duplicate) {
    const existingFolder = await getBookmarkFolderInfo(duplicate);
    draft.duplicate = true;
    draft.bookmarkId = duplicate.id;
    draft.existingFolderName = existingFolder.title || '';
    draft.existingFolderPath = existingFolder.path || '';
  }
  return draft;
}

async function saveConfirmedBookmark(draft) {
  if (!draft || !draft.url) return { success: false, error: 'missing_url' };

  const existing = await chrome.bookmarks.search({ url: draft.url });
  const duplicate = existing[0];
  if (duplicate && !['move', 'copy'].includes(draft.duplicateAction)) {
    const existingFolder = await getBookmarkFolderInfo(duplicate);
    return {
      success: false,
      duplicated: true,
      bookmarkId: duplicate.id,
      existingFolderName: existingFolder.title || '',
      existingFolderPath: existingFolder.path || '',
      error: 'already_exists'
    };
  }

  const finalTags = normalizeTagList(draft.tags);
  let parentId = draft.folderId || '';
  let folderName = draft.folderName || '';
  let folderPath = normalizeBookmarkFolderPath(draft.folderPath || '');

  // The editable path is authoritative. Never keep a stale folder id after the
  // user changes the recommendation in the confirmation drawer.
  if (draft.folderMode === 'new') parentId = '';

  if (draft.folderMode === 'new' && folderPath) {
    const folder = await findOrCreateFolderPath(folderPath);
    if (folder) {
      parentId = folder.id;
      folderPath = folder.path || folderPath;
      folderName = folder.title || folderName || folderPath.split('/').filter(Boolean).slice(-1)[0] || '';
    }
    if (!parentId) return { success: false, error: 'folder_create_failed' };
  } else if (!parentId && folderPath) {
    const folder = await findExistingFolderByExactPath(folderPath);
    if (folder) {
      parentId = folder.id;
      folderPath = folder.path || folderPath;
      folderName = folder.title || folderName || folderPath.split('/').filter(Boolean).slice(-1)[0] || '';
    }
    if (!parentId) return { success: false, error: 'folder_not_found' };
  }
  if (!parentId && !folderPath && folderName) {
    folderName = '';
  }
  if (parentId && !folderName) {
    try {
      const parent = await chrome.bookmarks.get(parentId);
      folderName = parent?.[0]?.title || '';
    } catch {}
  }

  pendingQuickBookmarks.set(draft.url, {
    tags: finalTags,
    folderName,
    folderPath,
    ruleTags: finalTags.map(tag => ({ tag, score: 100, signals: ['user-confirmed'] })),
    contentText: draft.contentText || '',
    contentTitle: draft.contentTitle || '',
    metaKeywords: draft.metaKeywords || [],
    headings: draft.headings || [],
    structuredTypes: draft.structuredTypes || [],
    contentFetchedAt: draft.contentFetchedAt || null,
    contentStatus: draft.contentStatus || (draft.contentText ? 'success' : 'failed'),
    contentFailureReason: draft.contentFailureReason || '',
    contentSource: draft.contentSource || '',
    metaDesc: draft.metaDesc || '',
    excerpt: draft.excerpt || draft.summary || '',
    aiSuggestion: {
      tags: finalTags,
      summary: draft.summary || '',
      reason: draft.reason || '',
      evidence: Array.isArray(draft.evidence) ? draft.evidence : []
    },
    finalConfirmed: true
  });

  const createOpts = {
    title: draft.title || draft.url,
    url: draft.url
  };
  if (parentId) createOpts.parentId = parentId;
  let createdBookmark;
  if (duplicate && draft.duplicateAction === 'move') {
    createdBookmark = await chrome.bookmarks.move(duplicate.id, parentId ? { parentId } : {});
    pendingQuickBookmarks.delete(draft.url);

    // Moving does not emit onCreated, so update the mirrored record ourselves.
    const stored = await getStoredBookmarks();
    const moved = stored.find(item => item.id === createdBookmark.id);
    if (moved) {
      moved.parentId = createdBookmark.parentId || parentId || moved.parentId;
      moved.title = createdBookmark.title || draft.title || moved.title;
      moved.folderName = folderName;
      moved.folderPath = folderPath;
      moved.tags = finalTags;
      moved.tagsAuto = finalTags;
      moved.contentText = draft.contentText || moved.contentText || '';
      moved.contentExcerpt = draft.excerpt || draft.summary || moved.contentExcerpt || '';
      moved.aiSuggestion = {
        tags: finalTags,
        summary: draft.summary || '',
        reason: draft.reason || '',
        evidence: Array.isArray(draft.evidence) ? draft.evidence : []
      };
      await setStoredBookmarks(stored);
    }
  } else {
    createdBookmark = await chrome.bookmarks.create(createOpts);
  }

  const dfText = `${draft.title || ''} ${(draft.contentText || '').slice(0, 1000)} ${draft.url || ''}`;
  if (typeof updateDocFrequency === 'function') {
    updateDocFrequency(dfText, draft.url);
  }
  if (typeof markDomainSeen === 'function' && draft.domain) {
    markDomainSeen(draft.domain).catch(() => {});
  }

  return { success: true, bookmarkId: createdBookmark.id, tags: finalTags, folderName, folderPath, moved: !!duplicate && draft.duplicateAction === 'move', copied: !!duplicate && draft.duplicateAction === 'copy' };
}

async function injectBookmarkConfirmPanel(tabId, state) {
  const { language = 'system' } = await chrome.storage.local.get('language');
  const browserLanguage = chrome.i18n?.getUILanguage?.() || 'en';
  state.panelLanguage = language === 'system' ? browserLanguage : language;
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [state],
    func: (panelState) => {
      const ROOT_ID = 'ai-bookmark-os-confirm-root';
      const old = document.getElementById(ROOT_ID);
      if (old) old.remove();

      const esc = (value) => String(value || '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
      const root = document.createElement('div');
      root.id = ROOT_ID;
      const tags = Array.isArray(panelState.tags) ? panelState.tags : [];
      const folderOptions = Array.isArray(panelState.folderOptions) ? panelState.folderOptions : [];
      const isChinese = String(panelState.panelLanguage || '').toLowerCase().startsWith('zh');
      const copy = isChinese ? {
        title: '收藏前确认 AI 分类建议', analyzingPage: '正在分析当前页面', loading: '正在理解页面并生成分类建议...', cancel: '取消', titleLabel: '标题', aiCategory: 'AI 推荐分类', existingCategory: '匹配已有分类', newCategory: '推荐新建分类', newPrefix: '新建：', newCategoryLabel: '新建分类', searchCategory: '搜索已有分类，例如 公司 / 项目 / 文档', matchingCategories: '匹配的已有分类', selectCategory: '选择书签分类', useExisting: '沿用已有：', selectExisting: '选择已有分类...', manualPath: '手动输入路径...', pathExample: '例如：工作/公司/项目', categoryHint: '选择已有分类会直接收藏进去；选择新建分类会自动创建对应文件夹后收藏。', tags: '标签', tagHint: '用逗号分隔', recommendedPath: '推荐路径', summary: '摘要说明', summaryHint: '可手动补充摘要', reason: '归类理由', reasonHint: '可手动补充归类理由', aiReady: 'AI 已生成建议，你可以直接确认，也可以修改分类、标签和说明后再收藏。', localReady: '当前使用本地规则作为兜底建议，你仍可手动修改后继续收藏。', retry: '重试 AI', confirm: '确认收藏', duplicateTitle: '该页面已收藏', duplicateNote: '该页面已收藏在“$1”（$2）。请选择将它移动到当前目标，或在当前目标保留一份副本。', copy: '保留副本', move: '移动到此处', saving: '正在收藏...', saved: '已收藏', duplicateError: '该页面已经在书签中。', saveFailed: '收藏失败：', unknown: '未知错误', searchMatches: '匹配 $1 个已有分类，可点击结果或按 Enter 选中', searchHint: '可直接下拉选择，也可搜索 $1 个已有分类'
      } : {
        title: 'Review AI bookmark suggestion', analyzingPage: 'Analyzing the current page', loading: 'Understanding the page and preparing a suggestion...', cancel: 'Cancel', titleLabel: 'Title', aiCategory: 'AI suggested folder', existingCategory: 'Existing folder found', newCategory: 'New folder suggested', newPrefix: 'Create: ', newCategoryLabel: 'Create new folder', searchCategory: 'Search folders, e.g. Work / Projects / Docs', matchingCategories: 'Matching folders', selectCategory: 'Choose bookmark folder', useExisting: 'Use existing: ', selectExisting: 'Choose an existing folder...', manualPath: 'Enter a path manually...', pathExample: 'Example: Work/Company/Project', categoryHint: 'An existing folder is used directly. A new path creates its folders before saving.', tags: 'Tags', tagHint: 'Separate with commas', recommendedPath: 'Suggested path', summary: 'Summary', summaryHint: 'Add a summary', reason: 'Why this folder', reasonHint: 'Add a reason', aiReady: 'AI has prepared a suggestion. You can confirm it or edit the folder, tags, and details first.', localReady: 'A local-rule suggestion is being used. You can edit it before saving.', retry: 'Retry AI', confirm: 'Save bookmark', duplicateTitle: 'This page is already bookmarked', duplicateNote: 'This page is already in “$1” ($2). Move it to the current destination or keep a copy there.', copy: 'Keep a copy', move: 'Move here', saving: 'Saving...', saved: 'Saved', duplicateError: 'This page is already bookmarked.', saveFailed: 'Could not save: ', unknown: 'Unknown error', searchMatches: '$1 matching folders. Click a result or press Enter to select it.', searchHint: 'Choose from the list or search $1 existing folders'
      };
      const format = (text, ...values) => values.reduce((result, value, index) => result.replace(`$${index + 1}`, value), text);
      const localizeRootPath = (path) => {
        if (isChinese) return String(path || '');
        const rootNames = {
          [String.fromCharCode(0x4e66, 0x7b7e, 0x680f)]: 'Bookmarks bar',
          [String.fromCharCode(0x5176, 0x4ed6, 0x4e66, 0x7b7e)]: 'Other bookmarks',
          [String.fromCharCode(0x79fb, 0x52a8, 0x8bbe, 0x5907, 0x4e66, 0x7b7e)]: 'Mobile bookmarks'
        };
        return String(path || '').split('/').map(part => rootNames[part] || part).join('/');
      };
      panelState.existingFolderPath = localizeRootPath(panelState.existingFolderPath);
      const recommendedPath = panelState.recommendedFolderPath || panelState.folderPath || '';
      const recommendedExists = !!panelState.recommendedFolderExists || !!panelState.folderId;
      const selectedPath = panelState.folderPath || recommendedPath || '';
      const folderOptionHtml = folderOptions.map(folder => {
        const selected = folder.path === selectedPath ? ' selected' : '';
        const displayPath = localizeRootPath(folder.displayPath || folder.path);
        return `<option value="${esc(folder.path)}" data-id="${esc(folder.id)}" data-display-path="${esc(displayPath)}"${selected}>${esc(displayPath)}</option>`;
      }).join('');
      const newOptionLabel = recommendedPath ? `${copy.newPrefix}${recommendedPath}` : copy.newCategoryLabel;
      root.innerHTML = `
        <style>
          #${ROOT_ID}{position:fixed;inset:0;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;color:#1d1d1f;pointer-events:none;display:flex;align-items:stretch;justify-content:flex-end;box-sizing:border-box}
          #${ROOT_ID} *{box-sizing:border-box;letter-spacing:0}
          #${ROOT_ID} .ab-card{pointer-events:auto;width:min(440px,100vw);height:100vh;overflow:auto;background:rgba(255,255,255,.98);border-left:1px solid rgba(0,0,0,.1);box-shadow:-18px 0 48px rgba(0,0,0,.18);padding:22px}
          #${ROOT_ID} .ab-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}
          #${ROOT_ID} .ab-head-copy{min-width:0;flex:1}
          #${ROOT_ID} .ab-close{width:32px;min-width:32px;height:32px;min-height:32px;padding:0;border-radius:8px;background:transparent;color:#6e6e73;font-size:24px;font-weight:400;line-height:1}
          #${ROOT_ID} .ab-close:hover{background:rgba(0,0,0,.07);color:#1d1d1f;transform:none}
          #${ROOT_ID} .ab-icon{width:34px;height:34px;border-radius:12px;background:#0a84ff;color:white;display:flex;align-items:center;justify-content:center;flex:0 0 auto;font-weight:700}
          #${ROOT_ID} h2{font-size:18px;line-height:1.25;margin:0;color:#1d1d1f;font-weight:700}
          #${ROOT_ID} .ab-sub{font-size:12px;line-height:1.45;color:#6e6e73;margin-top:4px;word-break:break-all}
          #${ROOT_ID} .ab-loading{display:flex;gap:8px;align-items:center;padding:18px 0;color:#6e6e73;font-size:13px}
          #${ROOT_ID} .ab-dot{width:7px;height:7px;border-radius:50%;background:#0a84ff;animation:abPulse 1s infinite ease-in-out}
          #${ROOT_ID} .ab-dot:nth-child(2){animation-delay:.12s} #${ROOT_ID} .ab-dot:nth-child(3){animation-delay:.24s}
          @keyframes abPulse{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}
          #${ROOT_ID} label{display:block;font-size:12px;color:#6e6e73;font-weight:600;margin:12px 0 6px}
          #${ROOT_ID} input,#${ROOT_ID} textarea,#${ROOT_ID} select{width:100%;border:1px solid rgba(0,0,0,.12);background:rgba(247,247,250,.88);border-radius:12px;padding:10px 12px;font:inherit;font-size:13px;color:#1d1d1f;outline:none;transition:.16s border,.16s box-shadow,.16s background}
          #${ROOT_ID} input:focus,#${ROOT_ID} textarea:focus,#${ROOT_ID} select:focus{border-color:#0a84ff;box-shadow:0 0 0 4px rgba(10,132,255,.14);background:#fff}
          #${ROOT_ID} textarea{min-height:68px;resize:vertical;line-height:1.45}
          #${ROOT_ID} .ab-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
          #${ROOT_ID} .ab-folder-card{margin-top:12px;padding:12px;border-radius:8px;background:rgba(247,247,250,.72);border:1px solid rgba(0,0,0,.08)}
          #${ROOT_ID} .ab-folder-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}
          #${ROOT_ID} .ab-folder-title{font-size:12px;font-weight:700;color:#1d1d1f}
          #${ROOT_ID} .ab-folder-badge{font-size:11px;color:${recommendedExists ? '#188038' : '#0756a8'};background:${recommendedExists ? 'rgba(52,199,89,.13)' : 'rgba(10,132,255,.12)'};padding:3px 8px;border-radius:999px;white-space:nowrap}
          #${ROOT_ID} .ab-folder-row{display:grid;grid-template-columns:1fr;gap:8px}
          #${ROOT_ID} .ab-folder-search-row{position:relative}
          #${ROOT_ID} .ab-folder-combobox{position:relative}
          #${ROOT_ID} .ab-folder-search{padding-right:42px}
          #${ROOT_ID} .ab-folder-toggle{position:absolute;right:5px;top:50%;transform:translateY(-50%);width:32px;min-width:32px;height:32px;min-height:32px;padding:0;border-radius:8px;background:transparent;color:#48484a;font-size:18px;line-height:1;box-shadow:none;display:flex;align-items:center;justify-content:center}
          #${ROOT_ID} .ab-folder-toggle::before{content:"";width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:translateY(-2px) rotate(45deg)}
          #${ROOT_ID} .ab-folder-toggle:hover{background:rgba(0,0,0,.06);color:#1d1d1f;transform:translateY(-50%)}
          #${ROOT_ID} .ab-folder-results{display:none;position:absolute;z-index:2;top:calc(100% + 5px);left:0;right:0;max-height:240px;overflow:auto;border:1px solid rgba(0,0,0,.12);border-radius:8px;background:rgba(255,255,255,.98);box-shadow:0 12px 30px rgba(0,0,0,.16);padding:4px}
          #${ROOT_ID} .ab-folder-results.is-open{display:block}
          #${ROOT_ID} .ab-folder-result{width:100%;min-height:40px;border-radius:6px;padding:7px 9px;background:transparent;color:#1d1d1f;text-align:left;box-shadow:none;display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12px;font-weight:600}
          #${ROOT_ID} .ab-folder-result:hover,#${ROOT_ID} .ab-folder-result.is-active{background:rgba(10,132,255,.1);color:#0756a8;transform:none}
          #${ROOT_ID} .ab-folder-result-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
          #${ROOT_ID} .ab-folder-result small{max-width:56%;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:#8e8e93;font-weight:500;white-space:nowrap}
          #${ROOT_ID} .ab-folder-search-status{font-size:11px;color:#8e8e93;margin-top:-2px;min-height:16px}
          #${ROOT_ID} .ab-folder-hint{font-size:11px;color:#6e6e73;line-height:1.4;margin-top:6px}
          #${ROOT_ID} .ab-destination{display:grid;gap:3px;margin-top:10px;padding:9px 10px;border-left:3px solid #0a84ff;background:rgba(10,132,255,.07);font-size:12px;line-height:1.4}
          #${ROOT_ID} .ab-destination-label{font-weight:700;color:#0756a8}
          #${ROOT_ID} .ab-destination-path{color:#1d1d1f;word-break:break-word}
          #${ROOT_ID} .ab-new-folder{display:${recommendedExists ? 'none' : 'block'};margin-top:8px}
          #${ROOT_ID} .ab-note{margin-top:12px;padding:10px 12px;border-radius:14px;background:${panelState.aiError ? 'rgba(255,59,48,.1)' : 'rgba(10,132,255,.1)'};color:${panelState.aiError ? '#c42b1c' : '#0756a8'};font-size:12px;line-height:1.45}
          #${ROOT_ID} .ab-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
          #${ROOT_ID} button{border:0;border-radius:999px;padding:9px 16px;font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:.16s transform,.16s background,.16s opacity;min-height:36px}
          #${ROOT_ID} button:active{transform:scale(.98)} #${ROOT_ID} button:disabled{opacity:.55;cursor:not-allowed;transform:none}
          #${ROOT_ID} .ab-secondary{background:rgba(118,118,128,.12);color:#1d1d1f}
          #${ROOT_ID} .ab-primary{background:#0a84ff;color:white;box-shadow:0 8px 20px rgba(10,132,255,.28)}
          #${ROOT_ID} .ab-error{background:rgba(255,59,48,.1);color:#c42b1c}
          @media(max-width:560px){#${ROOT_ID} .ab-card{width:100vw;padding:16px}#${ROOT_ID} .ab-grid{grid-template-columns:1fr}#${ROOT_ID} .ab-actions{flex-wrap:wrap}#${ROOT_ID} button{flex:1}}
        </style>
        <section class="ab-card" role="dialog" aria-modal="false" aria-labelledby="abTitle">
          <div class="ab-head"><div class="ab-icon">AI</div><div class="ab-head-copy"><h2 id="abTitle">${copy.title}</h2><div class="ab-sub">${esc(panelState.title || copy.analyzingPage)}<br>${esc(panelState.url || '')}</div></div><button class="ab-close" data-act="cancel" aria-label="${isChinese ? String.fromCharCode(0x5173, 0x95ed) : 'Close'}" title="${isChinese ? String.fromCharCode(0x5173, 0x95ed) : 'Close'}">&times;</button></div>
          ${panelState.status === 'loading' ? `
            <div class="ab-loading"><span class="ab-dot"></span><span class="ab-dot"></span><span class="ab-dot"></span><span>${copy.loading}</span></div>
            <div class="ab-actions"><button class="ab-secondary" data-act="cancel">${copy.cancel}</button></div>
          ` : `
            <label>${copy.titleLabel}</label><input id="abTitleInput" value="${esc(panelState.title)}">
            <div class="ab-folder-card">
              <div class="ab-folder-head"><div class="ab-folder-title">${copy.aiCategory}</div><div class="ab-folder-badge">${recommendedExists ? copy.existingCategory : copy.newCategory}</div></div>
              <div class="ab-folder-row">
                <div class="ab-folder-search-row ab-folder-combobox">
                  <input id="abFolderSearch" class="ab-folder-search" value="" placeholder="${copy.searchCategory}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="abFolderResults">
                  <button type="button" id="abFolderToggle" class="ab-folder-toggle" aria-label="${copy.selectCategory}" title="${copy.selectCategory}" aria-expanded="false"></button>
                  <div id="abFolderResults" class="ab-folder-results" role="listbox" aria-label="${copy.matchingCategories}"></div>
                </div>
                <select id="abFolderSelect" aria-label="${copy.selectCategory}">
                  ${recommendedExists && recommendedPath ? `<option value="${esc(recommendedPath)}" data-id="${esc(panelState.folderId || '')}" selected>${copy.useExisting}${esc(recommendedPath)}</option>` : ''}
                  ${!recommendedExists && recommendedPath ? `<option value="__new__" selected>${esc(newOptionLabel)}</option>` : ''}
                  <option value="__existing__" disabled>${copy.selectExisting}</option>
                  ${folderOptionHtml}
                  <option value="__manual__">${copy.manualPath}</option>
                </select>
                <div id="abFolderSearchStatus" class="ab-folder-search-status"></div>
                <input id="abNewFolderInput" class="ab-new-folder" value="${esc(recommendedPath)}" placeholder="${copy.pathExample}">
              </div>
              <div class="ab-folder-hint">${copy.categoryHint}</div>
              <div id="abDestination" class="ab-destination" aria-live="polite"></div>
            </div>
            <div class="ab-grid"><div><label>${copy.tags}</label><input id="abTagsInput" value="${esc(tags.join(', '))}" placeholder="${copy.tagHint}"></div><div><label>${copy.recommendedPath}</label><input value="${esc(recommendedPath)}" disabled></div></div>
            <label>${copy.summary}</label><textarea id="abSummaryInput" placeholder="${copy.summaryHint}">${esc(panelState.summary || '')}</textarea>
            <label>${copy.reason}</label><textarea id="abReasonInput" placeholder="${copy.reasonHint}">${esc(panelState.reason || '')}</textarea>
            <div class="ab-note">${esc(panelState.aiError || (panelState.aiAvailable ? copy.aiReady : copy.localReady))}</div>
            <div class="ab-actions"><button class="ab-secondary" data-act="retry">${copy.retry}</button><button class="ab-secondary" data-act="cancel">${copy.cancel}</button><button class="ab-primary" data-act="confirm">${copy.confirm}</button></div>
          `}
        </section>`;
      document.documentElement.appendChild(root);

      // The native-like combobox is editable for new paths. The hidden select is
      // retained as the backing source for Chrome bookmark-folder ids.
      const pathSearch = root.querySelector('#abFolderSearch');
      if (pathSearch) pathSearch.value = recommendedPath;
      const pathSelect = root.querySelector('#abFolderSelect');
      if (pathSelect) pathSelect.style.display = 'none';
      const newPathInput = root.querySelector('#abNewFolderInput');
      if (newPathInput) newPathInput.style.display = 'none';
      const duplicatePathField = root.querySelector('.ab-grid > div:nth-child(2)');
      if (duplicatePathField) duplicatePathField.style.display = 'none';
      if (panelState.duplicate) {
        const title = root.querySelector('#abTitle');
        if (title) title.textContent = copy.duplicateTitle;
        const note = root.querySelector('.ab-note');
        if (note) note.textContent = format(copy.duplicateNote, panelState.existingFolderName || (isChinese ? '未命名文件夹' : 'Untitled folder'), panelState.existingFolderPath || (isChinese ? '书签栏' : 'Bookmarks bar'));
        const actions = root.querySelector('.ab-actions');
        if (actions) actions.innerHTML = `<button class="ab-secondary" data-act="cancel">${copy.cancel}</button><button class="ab-secondary" data-act="copy">${copy.copy}</button><button class="ab-primary" data-act="move">${copy.move}</button>`;
      }

      const folderSelect = root.querySelector('#abFolderSelect');
      const newFolderInput = root.querySelector('#abNewFolderInput');
      const folderSearch = root.querySelector('#abFolderSearch');
      const folderResults = root.querySelector('#abFolderResults');
      const folderSearchStatus = root.querySelector('#abFolderSearchStatus');
      const destination = root.querySelector('#abDestination');
      const folderToggle = root.querySelector('#abFolderToggle');
      const getExistingFolderOptions = () => Array.from(folderSelect?.options || [])
        .filter(opt => opt.value && !opt.value.startsWith('__') && !opt.disabled);
      let selectedExistingFolder = recommendedExists && recommendedPath
        ? { id: panelState.folderId || '', path: recommendedPath, displayPath: recommendedPath }
        : null;
      let activeFolderResult = 0;
      let folderDropdownOpen = false;
      let folderBlurTimer = null;
      const updateDestination = () => {
        if (!destination || !folderSearch) return;
        const enteredPath = folderSearch.value.trim();
        const exactOption = getExistingFolderOptions().find(opt =>
          (opt.dataset?.displayPath || opt.value) === enteredPath || opt.value === enteredPath
        );
        const chinese = {
          defaultRoot: String.fromCharCode(0x4e66, 0x7b7e, 0x680f),
          existing: String.fromCharCode(0x5c06, 0x4f7f, 0x7528, 0x5df2, 0x6709, 0x6587, 0x4ef6, 0x5939),
          created: String.fromCharCode(0x5c06, 0x65b0, 0x5efa, 0x6587, 0x4ef6, 0x5939),
          label: String.fromCharCode(0x6700, 0x7ec8, 0x6536, 0x85cf, 0x4f4d, 0x7f6e)
        };
        const path = exactOption?.dataset?.displayPath || enteredPath || (isChinese ? chinese.defaultRoot : 'Bookmarks bar');
        const action = exactOption
          ? (isChinese ? chinese.existing : 'Existing folder')
          : (isChinese ? chinese.created : 'New folder to create');
        const label = isChinese ? chinese.label : 'Save destination';
        destination.innerHTML = `<span class="ab-destination-label">${esc(label)}: ${esc(action)}</span><span class="ab-destination-path">${esc(path)}</span>`;
      };
      const folderMatches = (showAll = false) => {
        const q = folderSearch?.value.trim().toLowerCase() || '';
        const tokens = q.split(/\s+/).filter(Boolean);
        return getExistingFolderOptions()
          .map(opt => {
            const value = opt.value || '';
          const text = `${value} ${opt.textContent || ''}`.toLowerCase();
            const matched = showAll || tokens.length === 0 || tokens.every(token => text.includes(token));
            let score = 0;
            if (q) {
              const lowerValue = value.toLowerCase();
              if (lowerValue === q) score += 1000;
              if (lowerValue.startsWith(q)) score += 500;
              if (lowerValue.includes(q)) score += 200;
              score -= Math.min(value.length, 200);
            }
          return { opt, matched, score };
          })
          .filter(item => item.matched)
          .sort((a, b) => b.score - a.score || a.opt.value.localeCompare(b.opt.value, 'zh'));
      };
      const selectExistingFolder = (opt) => {
        if (!opt || !folderSelect) return;
        selectedExistingFolder = {
          id: opt.dataset?.id || '',
          path: opt.value,
          displayPath: opt.dataset?.displayPath || opt.value
        };
        folderSelect.value = opt.value;
        folderSelect.dispatchEvent(new Event('change'));
        if (folderSearch) folderSearch.value = opt.dataset?.displayPath || opt.value;
        if (folderSearch) folderSearch.dataset.userSearching = '';
        folderDropdownOpen = false;
        if (folderResults) {
          folderResults.classList.remove('is-open');
          folderResults.innerHTML = '';
        }
        updateDestination();
      };
      const setFolderDropdownOpen = (open, showAll = false) => {
        folderDropdownOpen = open;
        if (folderSearch) folderSearch.dataset.showAll = showAll ? 'true' : '';
        folderSearch?.setAttribute('aria-expanded', String(open));
        folderToggle?.setAttribute('aria-expanded', String(open));
        renderFolderResults();
      };
      const renderFolderResults = () => {
        if (!folderResults || !folderSearch) return;
        if (!folderDropdownOpen) {
          folderResults.classList.remove('is-open');
          folderResults.innerHTML = '';
          return;
        }
        const showAll = folderSearch.dataset.showAll === 'true' && !folderSearch.dataset.userSearching;
        const matches = folderMatches(showAll);
        activeFolderResult = Math.min(activeFolderResult, Math.max(matches.length - 1, 0));
        folderResults.innerHTML = matches.map((item, index) => {
          const path = item.opt.value;
          const displayPath = item.opt.dataset?.displayPath || path;
          const parts = displayPath.split('/').filter(Boolean);
          const leaf = parts.slice(-1)[0] || displayPath;
          const parent = parts.slice(0, -1).join('/');
          return `<button type="button" class="ab-folder-result${index === activeFolderResult ? ' is-active' : ''}" data-path="${esc(path)}" role="option" aria-selected="${index === activeFolderResult}"><span class="ab-folder-result-title">${esc(leaf)}</span>${parent ? `<small>${esc(parent)}</small>` : `<small>${esc(displayPath)}</small>`}</button>`;
        }).join('');
        folderResults.classList.toggle('is-open', matches.length > 0);
      };
      const filterFolderOptions = () => {
        if (!folderSelect || !folderSearch) return;
        const q = folderSearch.value.trim().toLowerCase();
        let count = 0;
        const matchedOptions = new Set(folderMatches().map(item => item.opt));
        for (const opt of getExistingFolderOptions()) {
          const matched = !q || matchedOptions.has(opt);
          opt.hidden = !matched;
          opt.style.display = matched ? '' : 'none';
          if (matched) count++;
        }
        renderFolderResults();
        if (folderSearchStatus) {
          folderSearchStatus.textContent = q
            ? format(copy.searchMatches, count)
            : format(copy.searchHint, folderOptions.length);
        }
      };
      const updateFolderInput = () => {
        if (!folderSelect || !newFolderInput) return;
        const value = folderSelect.value;
        newFolderInput.style.display = (value === '__new__' || value === '__manual__') ? 'block' : 'none';
        if (value && !value.startsWith('__')) {
          newFolderInput.value = value;
          if (folderSearch) folderSearch.value = folderSelect.selectedOptions[0]?.dataset?.displayPath || value;
        }
      };
      if (folderSelect) folderSelect.addEventListener('change', updateFolderInput);
      if (folderResults) {
        folderResults.addEventListener('click', (event) => {
          const item = event.target.closest('.ab-folder-result');
          if (!item) return;
          const opt = getExistingFolderOptions().find(option => option.value === item.dataset.path);
          selectExistingFolder(opt);
        });
      }
      if (folderSearch) {
        folderSearch.addEventListener('focus', () => {
          if (folderBlurTimer) clearTimeout(folderBlurTimer);
          activeFolderResult = 0;
          setFolderDropdownOpen(true, !folderSearch.dataset.userSearching);
        });
        folderSearch.addEventListener('input', () => {
          // Any manual edit switches back to create-or-reuse-path mode. A stale
          // folder id must never send the bookmark to a previously selected folder.
          if (selectedExistingFolder?.displayPath !== folderSearch.value.trim()) {
            selectedExistingFolder = null;
          }
          folderSearch.dataset.userSearching = folderSearch.value.trim() ? 'true' : '';
          activeFolderResult = 0;
          filterFolderOptions();
          setFolderDropdownOpen(true, false);
          updateDestination();
        });
        folderSearch.addEventListener('blur', () => {
          folderBlurTimer = setTimeout(() => setFolderDropdownOpen(false), 150);
        });
        folderSearch.addEventListener('keydown', (event) => {
          if (!folderSelect) return;
          const showAll = folderSearch.dataset.showAll === 'true' && !folderSearch.dataset.userSearching;
          const matches = folderMatches(showAll);
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!folderDropdownOpen) setFolderDropdownOpen(true, true);
            activeFolderResult = Math.min(activeFolderResult + 1, Math.max(matches.length - 1, 0));
            renderFolderResults();
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            activeFolderResult = Math.max(activeFolderResult - 1, 0);
            renderFolderResults();
            return;
          }
          if (event.key === 'Escape') {
            setFolderDropdownOpen(false);
            return;
          }
          if (event.key !== 'Enter') return;
          const selected = matches[activeFolderResult] || matches[0];
          if (!selected) return;
          event.preventDefault();
          selectExistingFolder(selected.opt);
        });
      }
      if (folderToggle) {
        folderToggle.addEventListener('mousedown', event => event.preventDefault());
        folderToggle.addEventListener('click', () => {
          if (folderBlurTimer) clearTimeout(folderBlurTimer);
          const nextOpen = !folderDropdownOpen;
          activeFolderResult = 0;
          setFolderDropdownOpen(nextOpen, true);
          if (nextOpen) folderSearch?.focus();
        });
      }
      updateFolderInput();
      filterFolderOptions();
      updateDestination();

      const close = () => root.remove();
      root.addEventListener('click', async (event) => {
        if (event.target === root) return;
        const btn = event.target.closest('button[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'cancel') {
          chrome.runtime.sendMessage({ action: 'cancelQuickBookmarkSuggestion', url: panelState.url }).catch(() => {});
          close();
          return;
        }
        if (act === 'retry') {
          close();
          chrome.runtime.sendMessage({ action: 'quickBookmark' }).catch(() => {});
          return;
        }
        if (act === 'confirm' || act === 'move' || act === 'copy') {
          const actions = root.querySelector('.ab-actions');
          const buttons = actions ? actions.querySelectorAll('button') : [];
          buttons.forEach(b => b.disabled = true);
          const actionLabel = btn.textContent;
          btn.textContent = copy.saving;
          const folderSearchValue = root.querySelector('#abFolderSearch')?.value?.trim() || '';
          const exactExistingOption = getExistingFolderOptions().find(opt =>
            (opt.dataset?.displayPath || opt.value) === folderSearchValue || opt.value === folderSearchValue
          );
          const selectedExisting = selectedExistingFolder?.displayPath === folderSearchValue
            ? selectedExistingFolder
            : (exactExistingOption ? {
              id: exactExistingOption.dataset?.id || '',
              path: exactExistingOption.value,
              displayPath: exactExistingOption.dataset?.displayPath || exactExistingOption.value
            } : null);
          const folderMode = selectedExisting ? 'existing' : 'new';
          const folderPath = selectedExisting?.path || folderSearchValue || panelState.folderPath;
          const draft = {
            ...panelState,
            title: root.querySelector('#abTitleInput')?.value?.trim() || panelState.title,
            folderMode,
            folderId: folderMode === 'existing' ? selectedExisting.id : '',
            folderPath,
            folderName: folderPath ? folderPath.split('/').filter(Boolean).slice(-1)[0] : panelState.folderName,
            tags: (root.querySelector('#abTagsInput')?.value || '').split(/[,，]/).map(s => s.trim()).filter(Boolean),
            summary: root.querySelector('#abSummaryInput')?.value?.trim() || '',
            reason: root.querySelector('#abReasonInput')?.value?.trim() || '',
            duplicateAction: act === 'move' || act === 'copy' ? act : ''
          };
          const resp = await chrome.runtime.sendMessage({ action: 'confirmQuickBookmarkSuggestion', draft }).catch(err => ({ success:false, error: err?.message || String(err) }));
          if (resp && resp.success) {
            btn.textContent = copy.saved;
            setTimeout(close, 450);
          } else {
            buttons.forEach(b => b.disabled = false);
            btn.textContent = actionLabel;
            if (resp?.duplicated) {
              panelState.duplicate = true;
              panelState.bookmarkId = resp.bookmarkId || panelState.bookmarkId;
              panelState.existingFolderName = resp.existingFolderName || panelState.existingFolderName;
              panelState.existingFolderPath = localizeRootPath(resp.existingFolderPath || panelState.existingFolderPath);
              const title = root.querySelector('#abTitle');
              if (title) title.textContent = copy.duplicateTitle;
              const actions = root.querySelector('.ab-actions');
              if (actions) actions.innerHTML = `<button class="ab-secondary" data-act="cancel">${copy.cancel}</button><button class="ab-secondary" data-act="copy">${copy.copy}</button><button class="ab-primary" data-act="move">${copy.move}</button>`;
            }
            const note = root.querySelector('.ab-note');
            if (note) {
              note.className = 'ab-note';
              note.style.background = 'rgba(255,59,48,.1)';
              note.style.color = '#c42b1c';
              note.textContent = resp?.duplicated ? copy.duplicateError : (copy.saveFailed + (resp?.error || copy.unknown));
            }
          }
        }
      });
    }
  });
}

async function addSingleBookmark(id) {
  try {
    const bookmark = await chrome.bookmarks.get(id);
    if (!bookmark || !bookmark[0] || !bookmark[0].url) return null;

    const b = bookmark[0];
    // 消费 pending 的快速收藏信息（标签 + 文件夹）
    const pending = pendingQuickBookmarks.get(b.url);
    if (pending) {
      pendingQuickBookmarks.delete(b.url);
    }

    const item = bookmarkToItem(b, pending?.folderName, pending?.folderPath);
    if (pending?.tags && pending.tags.length > 0) {
      item.tags = pending.tags;
      item.tagsAuto = pending.tags;
    }
    if (pending) {
      item.contentText = pending.contentText || '';
      item.contentTitle = pending.contentTitle || pending.title || '';
      item.contentExcerpt = pending.excerpt || '';
      item.contentMetaDesc = pending.metaDesc || '';
      item.contentMetaKeywords = pending.metaKeywords || [];
      item.contentHeadings = pending.headings || [];
      item.contentStructuredTypes = pending.structuredTypes || [];
      item.contentFetchedAt = pending.contentFetchedAt || null;
      item.contentStatus = pending.contentStatus || (pending.contentText ? 'success' : 'pending');
      item.contentFailureReason = pending.contentFailureReason || '';
      item.contentSource = pending.contentSource || '';
    }

    const existing = await getStoredBookmarks();

    // 查重
    const duplicate = existing.some(
      (bm) => bm.url === item.url && bm.dateAdded === item.dateAdded
    );
    if (duplicate) return null;

    existing.unshift(item);
    await setStoredBookmarks(existing);

    if (!pending?.contentText && item.url) {
      fetchBookmarkContent(item.url, { forceRefresh: false }).then(async (content) => {
        const bookmarks = await getStoredBookmarks();
        const stored = bookmarks.find(bm => bm.id === item.id || (bm.url === item.url && bm.dateAdded === item.dateAdded));
        if (!stored) return;
        stored.contentText = content.textContent || '';
        stored.contentTitle = content.title || stored.contentTitle || '';
        stored.contentExcerpt = content.excerpt || '';
        stored.contentMetaDesc = content.metaDesc || '';
        stored.contentMetaKeywords = content.metaKeywords || [];
        stored.contentHeadings = content.headings || [];
        stored.contentStructuredTypes = content.structuredTypes || [];
        stored.contentFetchedAt = content.fetchedAt || Date.now();
        stored.contentStatus = content.status || 'failed';
        stored.contentFailureReason = content.failureReason || '';
        stored.contentSource = content.source || '';
        await setStoredBookmarks(bookmarks);
      }).catch(err => console.warn('Bookmark content backfill failed:', err));
    }

    // AI 异步回填：对规则引擎不确定的快速收藏书签，在保存后调用云端 AI
    if (pending && !pending.finalConfirmed && typeof getAIConfig === 'function' && typeof classifyWithAI === 'function') {
      maybeBackfillAIForItem(item, pending).catch(() => {});
    }

    // 桌面通知：一键收藏成功后，根据用户设置弹出系统通知
    if (pending) {
      const settings = await chrome.storage.local.get(['notificationEnabled']);
      if (settings.notificationEnabled) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: item.title || 'Bookmark Saved',
          message: (item.tags && item.tags.length > 0)
            ? `已保存，标签：${item.tags.join(', ')}`
            : '已保存'
        }).catch(() => {});
      }
    }

    return item;
  } catch (err) {
    console.error('增量同步失败:', err);
    return null;
  }
}

// ===== AI 异步回填 =====
// 在书签已保存后，对低置信样本调用云端 AI，将结果与规则标签融合并更新存储
async function maybeBackfillAIForItem(item, context) {
  const startTime = Date.now();
  _logIfReady({
    type: 'backfill_start',
    provider: 'unknown',
    url: item?.url,
    success: true,
    details: { title: item?.title }
  });
  try {
    const config = await getAIConfig();
    if (!config.enabled || !config.apiKey) return;

    const bookmark = {
      title: item.title,
      url: item.url,
      domain: item.domain,
      contentText: context?.contentText || '',
      metaDesc: context?.metaDesc || '',
      excerpt: context?.excerpt || ''
    };

    const ruleTags = context?.ruleTags || [];
    const candidateTags = ruleTags.slice(0, 5).map(t => ({
      tag: t.tag,
      score: t.score,
      signals: t.signals || []
    }));
    const signals = {};
    for (const t of ruleTags) {
      signals[t.tag] = t.signals || [];
    }

    const aiTags = await classifyWithAI(bookmark, candidateTags, signals, {});
    if (!aiTags || aiTags.length === 0) {
      _logIfReady({
        type: 'backfill_skip',
        provider: config.provider,
        url: item.url,
        duration: Date.now() - startTime,
        success: true,
        details: { reason: 'no_ai_result' }
      });
      return;
    }

    const merged = mergeAITags(ruleTags, aiTags, 3).map(t => t.tag);
    if (JSON.stringify(merged) === JSON.stringify(item.tags || [])) {
      _logIfReady({
        type: 'backfill_skip',
        provider: config.provider,
        url: item.url,
        duration: Date.now() - startTime,
        success: true,
        details: { reason: 'no_change' }
      });
      return;
    }

    const bookmarks = await getStoredBookmarks();
    const stored = bookmarks.find(b => b.id === item.id || (b.url === item.url && b.dateAdded === item.dateAdded));
    if (!stored) {
      _logIfReady({
        type: 'backfill_fail',
        provider: config.provider,
        url: item.url,
        duration: Date.now() - startTime,
        success: false,
        error: 'Stored bookmark not found'
      });
      return;
    }

    stored.tags = merged;
    stored.tagsAuto = merged;
    await setStoredBookmarks(bookmarks);

    _logIfReady({
      type: 'backfill_success',
      provider: config.provider,
      url: item.url,
      duration: Date.now() - startTime,
      success: true,
      details: {
        beforeTags: item.tags || [],
        afterTags: merged,
        aiTags: aiTags.map(t => t.tag)
      }
    });

    // 将 AI 辅助分类结果加入主动学习待确认队列
    // 由于 handleQuickBookmark 可能已提前把低置信度规则项加入队列，
    // 这里强制移除同 URL 的规则项，确保 AI 项覆盖旧项。
    if (typeof loadReviewQueue === 'function' && typeof saveReviewQueue === 'function') {
      const avgConfidence = aiTags.length > 0
        ? aiTags.reduce((sum, t) => sum + (t.confidence || 0), 0) / aiTags.length
        : 0.7;
      const avgScore = aiTags.length > 0
        ? (aiTags.reduce((sum, t) => sum + (t.confidence || 0), 0) / aiTags.length) * 100
        : 70;
      const queue = await loadReviewQueue();
      const filtered = queue.filter(q => q.url !== item.url);
      filtered.unshift({
        id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        url: item.url,
        title: item.title,
        domain: item.domain,
        suggestedTags: merged,
        confidence: avgConfidence,
        score: avgScore,
        reason: 'ai_assisted',
        source: 'ai',
        excerpt: context?.excerpt || item.excerpt || '',
        createdAt: Date.now()
      });
      if (filtered.length > 50) filtered.pop();
      await saveReviewQueue(filtered);
    }

    chrome.runtime.sendMessage({
      action: 'tagsUpdated',
      bookmarkId: stored.id,
      tags: merged
    }).catch(() => {});
  } catch (err) {
    console.warn('AI backfill failed:', err);
    _logIfReady({
      type: 'backfill_fail',
      url: item?.url,
      duration: Date.now() - startTime,
      success: false,
      error: err.message || 'Unknown error'
    });
  }
}

async function updateBookmark(id, changes) {
  try {
    const existing = await getStoredBookmarks();
    const index = existing.findIndex((b) => b.id === id);
    if (index === -1) {
      // 可能是 id 变了，通过 url 匹配
      const bookmark = await chrome.bookmarks.get(id).catch(() => null);
      if (!bookmark || !bookmark[0]) return;
      const item = bookmarkToItem(bookmark[0]);
      const idx = existing.findIndex((b) => b.url === item.url);
      if (idx !== -1) {
        existing[idx] = { ...existing[idx], ...item };
      }
    } else {
      existing[index] = {
        ...existing[index],
        title: changes.title || existing[index].title,
        url: changes.url || existing[index].url,
        domain: changes.url ? extractDomain(changes.url) : existing[index].domain
      };
    }
    await setStoredBookmarks(existing);
  } catch (err) {
    console.error('更新书签失败:', err);
  }
}

// ===== 从 Chrome 历史记录获取真实点击次数 =====
async function enrichClickCounts(bookmarks, concurrency = 5) {
  const updated = [];
  await runWithConcurrency(bookmarks, concurrency, async (item) => {
    if (!item.url) return;
    try {
      const visits = await chrome.history.getVisits({ url: item.url });
      const count = visits ? visits.length : 0;
      if (count !== (item.clickCount || 0)) {
        item.clickCount = count;
        item.lastClickedAt = count > 0 ? Date.now() : item.lastClickedAt;
        updated.push(item);
      }
    } catch (e) {
      // 某些 URL（如 chrome://）不支持 history API，静默忽略
    }
  });
  return updated;
}

// ===== RSS 文章 → 书签 互通 =====
// 将一篇 RSS 文章保存为书签，自动应用智能标签规则。
// 供 rssSaveItemAsBookmark 消息处理器和 feed-fetcher 的自动书签功能共用。
//
// 参数：
//   item   - FeedStore 中的文章对象（含 title, link, summary, contentSnippet 等）
//   feed   - FeedStore 中的订阅源对象（含 folderId, autoBookmark 等）
//   settings - FeedStore.getSettings() 返回的设置对象
// 返回：{ success, bookmarkId?, error? }
async function saveRssArticleAsBookmark(item, feed, settings) {
  try {
    if (!item || !item.link) return { success: false, error: 'no_url' };

    // 1. 查重：同一 URL 已存在书签则跳过
    try {
      const existing = await chrome.bookmarks.search({ url: item.link });
      if (existing && existing.length > 0) {
        // 已存在书签，仅更新 item 的 bookmarkId 引用
        if (feed) {
          await FeedStore.setItemBookmark(item.id, feed.id, existing[0].id);
        }
        return { success: true, bookmarkId: existing[0].id, duplicated: true };
      }
    } catch { /* search 失败不阻塞，继续创建 */ }

    // 2. 确定目标文件夹
    let parentId = (feed && feed.folderId) || (settings && settings.defaultFolderId);
    let folderName = '';
    let folderPath = '';
    if (!parentId) {
      // 兜底：在书签栏创建 "RSS 收藏" 文件夹
      const folder = await findOrCreateFolder('RSS 收藏');
      if (folder) {
        parentId = folder.id;
        folderName = 'RSS 收藏';
        folderPath = folder.path || '';
      } else {
        return { success: false, error: 'no_folder' };
      }
    } else {
      // 读取文件夹名供智能标签使用
      try {
        const parent = await chrome.bookmarks.get(parentId);
        if (parent && parent[0]) folderName = parent[0].title || '';
      } catch { /* 忽略 */ }
    }

    // 3. 智能标签：构建临时 item 调用 autoTagBookmarkSync
    let tagNames = [];
    if (typeof autoTagBookmarkSync === 'function') {
      const tempItem = {
        url: item.link,
        title: item.title || '',
        domain: extractDomain(item.link),
        folderName,
        folderPath,
        contentText: item.contentSnippet || item.summary || '',
        metaDesc: item.summary || '',
        excerpt: item.summary || ''
      };
      try {
        const tags = autoTagBookmarkSync(tempItem);
        tagNames = (tags || []).map(t => t.tag).filter(Boolean);
      } catch { /* 标签失败不阻塞保存 */ }
    }

    // 4. 通过 pendingQuickBookmarks 将标签和文件夹信息传递给 onCreated → addSingleBookmark
    pendingQuickBookmarks.set(item.link, {
      tags: tagNames,
      folderName,
      folderPath,
      ruleTags: tagNames,
      contentText: item.contentSnippet || item.summary || '',
      metaDesc: item.summary || '',
      excerpt: item.summary || ''
    });

    // 5. 创建书签（触发 onCreated → addSingleBookmark 消费 pending）
    const bm = await chrome.bookmarks.create({
      parentId,
      title: item.title || item.link,
      url: item.link
    });

    // 6. 更新文章的 bookmarkId 引用
    if (feed) {
      await FeedStore.setItemBookmark(item.id, feed.id, bm.id);
    }

    return { success: true, bookmarkId: bm.id, tags: tagNames };
  } catch (err) {
    console.error('[RSS] saveRssArticleAsBookmark failed:', err);
    return { success: false, error: err.message };
  }
}
// 暴露到全局，供 feed-fetcher.js 自动书签功能调用
self.saveRssArticleAsBookmark = saveRssArticleAsBookmark;

// ===== 消息监听 =====
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || (sender?.id && sender.id !== chrome.runtime.id)) {
    sendResponse({ success: false, error: 'invalid_message_sender' });
    return false;
  }
  const validationError = validateRuntimeMessage(message);
  if (validationError) {
    sendResponse({ success: false, error: validationError });
    return false;
  }
  switch (message.action) {
    case 'syncAll':
      syncAllBookmarks().then((result) => {
        sendResponse({ success: true, ...result });
      }).catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
      return true; // 保持通道打开

    case 'getBookmarks':
      (async () => {
        let bookmarks = await getStoredBookmarks();
        // 尝试从历史记录刷新点击次数（不阻塞返回）
        enrichClickCounts(bookmarks, 5).then(updated => {
          if (updated.length > 0) setStoredBookmarks(bookmarks);
        }).catch(() => {});
        sendResponse({ success: true, bookmarks });
      })();
      return true;

    case 'deleteBookmark':
      (async () => {
        // 从 Chrome 书签中真正删除
        const bookmarks = await getStoredBookmarks();
        const target = bookmarks.find((b) => b.id === message.id || (message.url && b.url === message.url));
        if (!target || !message.id) {
          sendResponse({ success: false, error: 'Bookmark not found' });
          return;
        }
        try {
          await chrome.bookmarks.remove(message.id);
        } catch (err) {
          sendResponse({ success: false, error: err.message || 'bookmark_delete_failed' });
          return;
        }
        /*
        if (message.id) {
          try {
            await chrome.bookmarks.remove(message.id);
          } catch (err) {
            console.warn('删除 Chrome 书签失败:', err.message);
          }
        }
        */
        const filtered = bookmarks.filter((b) => b.id !== message.id);
        if (filtered.length !== bookmarks.length) {
          await setStoredBookmarks(filtered);
        }
        await addTombstone(target);
        sendResponse({ success: true, total: filtered.length });
      })();
      return true;

    case 'clearAll':
      (async () => {
        // 从 Chrome 书签中真正删除所有
        const bookmarks = await getStoredBookmarks();
        const removedIds = new Set();
        const failedIds = [];
        for (const b of bookmarks) {
          if (!b.id) {
            failedIds.push(b.url || 'unknown');
            continue;
          }
          try {
            await chrome.bookmarks.remove(b.id);
            removedIds.add(b.id);
          } catch (err) {
            failedIds.push(b.id);
          }
        }
        const existingTombstones = await pruneTombstones(await getTombstones(), await getEffectiveRetentionDays());
        const merged = [...existingTombstones];
        const keys = new Set(merged.map(t => t.url + '_' + t.dateAdded));
        for (const item of bookmarks) {
          if (removedIds.has(item.id) && item.url) {
            const key = item.url + '_' + item.dateAdded;
            if (!keys.has(key)) {
              merged.push({ ...item, deletedAt: Date.now() });
              keys.add(key);
            }
          }
        }
        await setTombstones(merged);
        const remaining = bookmarks.filter((item) => !removedIds.has(item.id));
        await setStoredBookmarks(remaining);
        sendResponse({
          success: failedIds.length === 0,
          removed: removedIds.size,
          failed: failedIds.length,
          total: remaining.length,
          error: failedIds.length ? 'some_bookmarks_could_not_be_deleted' : undefined,
        });
      })();
      return true;

    case 'updateBookmark':
      (async () => {
        const { id, title, url, tags } = message;
        // 更新 Chrome 书签
        if (id) {
          try {
            const changes = {};
            if (title !== undefined) changes.title = title;
            if (url !== undefined) changes.url = url;
            await chrome.bookmarks.update(id, changes);
          } catch (err) {
            console.error('更新 Chrome 书签失败:', err);
            sendResponse({ success: false, error: err.message });
            return;
          }
        }
        // 更新本地存储
        const bookmarks = await getStoredBookmarks();
        const item = bookmarks.find((b) => b.id === id);
        if (item) {
          if (title !== undefined) item.title = title;
          if (url !== undefined) {
            item.url = url;
            item.domain = extractDomain(url);
          }
          // 更新标签
          if (tags !== undefined) {
            item.tags = tags;
          }
          await setStoredBookmarks(bookmarks);
        }
        sendResponse({ success: true });
      })();
      return true;

    case 'scheduleChecker':
      scheduleCheckerAlarm().then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'checkUrl':
      (async () => {
        const { url, timeout } = message;
        const result = await checkUrlFromBackground(url, timeout || 10000);
        sendResponse({ success: true, result });
      })();
      return true;

    case 'togglePin':
      (async () => {
        let pinned = null;
        await mutateStoredBookmarks((bookmarks) => {
          const item = bookmarks.find((candidate) => candidate.id === message.id);
          if (!item) return bookmarks;
          item.pinned = !item.pinned;
          item.pinnedAt = item.pinned ? (item.pinnedAt || Date.now()) : null;
          pinned = item.pinned;
          return bookmarks;
        });
        sendResponse(pinned === null
          ? { success: false, error: 'bookmark_not_found' }
          : { success: true, pinned });
      })().catch((err) => sendResponse({ success: false, error: err?.message || 'toggle_pin_failed' }));
      return true;

    case 'bulkUpdate':
      (async () => {
        // mode is the bulk operation (pin/addTag/...). Keep action as routing key only.
        const { ids, tags, addTags, removeTags, mode } = message;
        if (!Array.isArray(ids) || ids.length === 0) {
          sendResponse({ success: false, error: 'No IDs provided' });
          return;
        }
        const bookmarks = await getStoredBookmarks();
        const idSet = new Set(ids);
        let updated = 0;
        for (const item of bookmarks) {
          if (!idSet.has(item.id)) continue;
          if (mode === 'addTag' && addTags) {
            item.tags = Array.from(new Set([...(item.tags || []), ...addTags]));
            updated++;
          } else if (mode === 'removeTag' && removeTags) {
            item.tags = (item.tags || []).filter(t => !removeTags.includes(t));
            updated++;
          } else if (mode === 'setTags' && tags) {
            item.tags = [...tags];
            updated++;
          } else if (mode === 'pin') {
            item.pinned = true;
            item.pinnedAt = Date.now();
            updated++;
          } else if (mode === 'unpin') {
            item.pinned = false;
            item.pinnedAt = null;
            updated++;
          }
        }
        await setStoredBookmarks(bookmarks);
        sendResponse({ success: true, updated });
      })();
      return true;

    case 'bulkDelete':
      (async () => {
        const { ids } = message;
        if (!Array.isArray(ids) || ids.length === 0) {
          sendResponse({ success: false, error: 'No IDs provided' });
          return;
        }
        const removedIds = new Set();
        const failedIds = [];
        for (const id of ids) {
          try {
            await chrome.bookmarks.remove(id);
            removedIds.add(id);
          } catch (err) {
            failedIds.push(id);
          }
        }
        const bookmarks = await getStoredBookmarks();
        const removed = bookmarks.filter((b) => removedIds.has(b.id));
        const remaining = bookmarks.filter((b) => !removedIds.has(b.id));
        await Promise.all(removed.map((bookmark) => addTombstone(bookmark)));
        await setStoredBookmarks(remaining);
        sendResponse({
          success: failedIds.length === 0,
          removed: removedIds.size,
          failed: failedIds.length,
          total: remaining.length,
          error: failedIds.length ? 'some_bookmarks_could_not_be_deleted' : undefined,
        });
      })();
      return true;

    case 'exportData':
      (async () => {
        const bookmarks = await getStoredBookmarks();
        sendResponse({ success: true, bookmarks });
      })();
      return true;

    case 'importData':
    case 'importBookmarksV2':
      (async () => {
        sendResponse(await importBookmarksV2(message));
      })();
      return true;

    case 'getImportOperations':
      (async () => {
        sendResponse({ success: true, operations: await getImportOperations() });
      })();
      return true;

    case 'retryImportOperation':
      (async () => {
        sendResponse(await retryImportOperation(message.operationId));
      })();
      return true;

    case 'rollbackImportOperation':
      (async () => {
        sendResponse(await rollbackImportOperation(message.operationId));
      })();
      return true;
    case 'getTombstones':
      (async () => {
        const retentionDays = await getEffectiveRetentionDays();
        const tombstones = await pruneTombstones(await getTombstones(), retentionDays);
        await setTombstones(tombstones);
        const settings = await getAppSettings();
        sendResponse({ success: true, tombstones, retentionDays, retentionOptions: TOMBSTONE_RETENTION_OPTIONS });
      })();
      return true;

    case 'restoreTombstone':
      (async () => {
        const tombstones = await getTombstones();
        const idx = tombstones.findIndex(t => t.url === message.url && t.dateAdded === message.dateAdded);
        if (idx < 0) {
          sendResponse({ success: false, error: 'Tombstone not found' });
          return;
        }
        const item = tombstones[idx];
        try {
          const validParentIds = new Set();
          if (item.parentId) {
            try {
              const parent = await chrome.bookmarks.get(item.parentId);
              if (parent && parent[0] && !parent[0].url) validParentIds.add(item.parentId);
            } catch {}
          }
          const restore = BookmarkData.buildRestoredBookmark(item, validParentIds);
          let fallbackFolder = null;
          if (restore.restoredToFallback) {
            fallbackFolder = await findOrCreateFolderPath('已恢复书签');
            if (!fallbackFolder || !fallbackFolder.id) throw new Error('restore_folder_unavailable');
            restore.create.parentId = fallbackFolder.id;
          }
          const created = await chrome.bookmarks.create(restore.create);
          const restored = await upsertImportedBookmark(created, {
            ...restore.metadata,
            folderName: restore.restoredToFallback ? fallbackFolder.title : item.folderName,
            folderPath: restore.restoredToFallback ? fallbackFolder.path : item.folderPath,
            restoredAt: Date.now(),
            restoredToFallback: restore.restoredToFallback,
          });
          restored.index = Number.isInteger(created.index) ? created.index : (restore.create.index ?? 0);
          const stored = await getStoredBookmarks();
          const storedItem = stored.find(bookmark => bookmark.id === restored.id);
          if (storedItem) {
            storedItem.index = restored.index;
            await setStoredBookmarks(stored);
          }
          tombstones.splice(idx, 1);
          await setTombstones(tombstones);
          sendResponse({ success: true, bookmarkId: created.id, restoredToFallback: restore.restoredToFallback });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;

    case 'purgeTombstone':
      (async () => {
        const tombstones = await getTombstones();
        const next = tombstones.filter(t => !(t.url === message.url && t.dateAdded === message.dateAdded));
        await setTombstones(next);
        sendResponse({ success: true, total: next.length });
      })();
      return true;

    case 'clearTombstones':
      (async () => {
        await setTombstones([]);
        sendResponse({ success: true });
      })();
      return true;

    case 'getAppSettings':
      (async () => {
        const settings = await getAppSettings();
        sendResponse({ success: true, settings, retentionOptions: TOMBSTONE_RETENTION_OPTIONS });
      })();
      return true;

    case 'updateAppSettings':
      (async () => {
        const { patch } = message;
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'tombstoneRetentionDays')) {
          const days = Number(patch.tombstoneRetentionDays);
          if (!TOMBSTONE_RETENTION_OPTIONS.includes(days)) {
            sendResponse({ success: false, error: 'Invalid retention days' });
            return;
          }
          await setAppSettings({ tombstoneRetentionDays: days });
          // 立即裁剪过期 tombstone
          const tombstones = await getTombstones();
          const pruned = await pruneTombstones(tombstones, days);
          if (pruned.length !== tombstones.length) {
            await setTombstones(pruned);
          }
        } else {
          await setAppSettings(patch || {});
        }
        sendResponse({ success: true });
      })();
      return true;

    case 'getPreview': {
      (async () => {
        const { url, forceRefresh } = message;
        try {
          const result = await getPreview(url, { forceRefresh: !!forceRefresh });
          sendResponse({ success: true, result });
        } catch (e) {
          sendResponse({ success: false, error: String(e && e.message || e) });
        }
      })();
      return true;
    }

    case 'fetchBookmarkContent': {
      (async () => {
        const { url, tabId, forceRefresh, renderFallback } = message || {};
        try {
          const result = await fetchBookmarkContent(url, {
            tabId,
            forceRefresh: !!forceRefresh,
            allowCachedFailure: true,
            renderFallback: renderFallback !== false
          });
          sendResponse({ success: true, result });
        } catch (e) {
          sendResponse({ success: false, error: String(e && e.message || e) });
        }
      })();
      return true;
    }

    case 'fetchBookmarkContents': {
      (async () => {
        const { urls, forceRefresh, concurrency, renderFallback } = message || {};
        try {
          const result = await fetchBookmarkContents(urls || [], { forceRefresh: !!forceRefresh, concurrency, renderFallback: renderFallback !== false });
          sendResponse({ success: true, ...result });
        } catch (e) {
          sendResponse({ success: false, error: String(e && e.message || e) });
        }
      })();
      return true;
    }

    case 'setPreviewCache': {
      (async () => {
        const { url, preview } = message;
        try {
          await setPreviewCache(url, preview);
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: String(e && e.message || e) });
        }
      })();
      return true;
    }

    case 'getPreviewSettings': {
      (async () => {
        const settings = await getPreviewSettings();
        sendResponse({ success: true, settings });
      })();
      return true;
    }

    case 'updatePreviewSettings': {
      (async () => {
        const { patch } = message || {};
        const settings = await setPreviewSettings(patch || {});
        sendResponse({ success: true, settings });
      })();
      return true;
    }

    case 'clearPreviewCache': {
      (async () => {
        await clearPreviewCache();
        sendResponse({ success: true });
      })();
      return true;
    }

    case 'getPreviewCacheStats': {
      (async () => {
        const stats = await getPreviewCacheStats();
        sendResponse({ success: true, stats });
      })();
      return true;
    }

    // ===== AI 增强设置 =====
    case 'getAIConfig': {
      (async () => {
        try {
          const config = await getAIConfig();
          sendResponse({ success: true, config });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'setAIConfig': {
      (async () => {
        try {
          const config = await setAIConfig(message.config || {});
          sendResponse({ success: true, config });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'testAIConnection': {
      (async () => {
        try {
          const result = await testAIConnection(message.config || {});
          sendResponse({ success: true, ...result });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'getAIStats': {
      (async () => {
        try {
          const stats = await getAIStats();
          sendResponse({ success: true, stats });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'clearAICache': {
      (async () => {
        try {
          await clearAICache();
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'getAILogs': {
      (async () => {
        try {
          const logs = await getAILogs(message.limit || 50);
          const stats = await getAILogStats();
          sendResponse({ success: true, logs, stats });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'clearAILogs': {
      (async () => {
        try {
          await clearAILogs();
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'recordClick': {
      (async () => {
        const { url } = message;
        if (!url) { sendResponse({ success: false, error: 'No URL' }); return; }
        const bookmarks = await getStoredBookmarks();
        const normalizedUrl = url.replace(/\/+$/, '');
        let found = false;
        for (const item of bookmarks) {
          if (item.url && item.url.replace(/\/+$/, '') === normalizedUrl) {
            item.clickCount = (item.clickCount || 0) + 1;
            item.lastClickedAt = Date.now();
            found = true;
            break;
          }
        }
        if (found) {
          await setStoredBookmarks(bookmarks);
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: 'Bookmark not found' });
        }
      })();
      return true;
    }

    case 'refreshClickCounts': {
      (async () => {
        const bookmarks = await getStoredBookmarks();
        const updated = await enrichClickCounts(bookmarks, 10);
        if (updated.length > 0) {
          await setStoredBookmarks(bookmarks);
        }
        sendResponse({ success: true, updated: updated.length });
      })();
      return true;
    }

    case 'suggestFolder': {
      (async () => {
        const { url, title } = message;
        const tempItem = { url: url || '', title: title || '', domain: extractDomain(url || '') };
        const tagResults = autoTagBookmarkSync(tempItem);
        const tags = tagResults.map(t => t.tag);
        const result = await suggestBookmarkFolder(url, title, tags, tempItem);
        sendResponse({ success: true, folder: result });
      })();
      return true;
    }

    case 'quickBookmark': {
      (async () => {
        const result = await handleQuickBookmark();
        sendResponse(result || { success: true });
      })();
      return true;
    }

    case 'confirmQuickBookmarkSuggestion': {
      (async () => {
        try {
          const result = await saveConfirmedBookmark(message.draft || {});
          sendResponse(result);
        } catch (err) {
          sendResponse({ success: false, error: err?.message || String(err) });
        }
      })();
      return true;
    }

    case 'cancelQuickBookmarkSuggestion': {
      (async () => {
        sendResponse({ success: true, cancelled: true });
      })();
      return true;
    }

    case 'getCommands': {
      (async () => {
        try {
          const commands = await chrome.commands.getAll();
          sendResponse({ success: true, commands });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    // ===== 动态规则管理（供 popup 设置页调用） =====
    case 'getDynamicRules': {
      (async () => {
        try {
          const rules = typeof getDynamicRules === 'function'
            ? await getDynamicRules()
            : { domainRules: [], urlPathRules: [], keywordRules: {}, stopWords: [], learnedDomainTag: {} };
          sendResponse({ success: true, rules });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'addDynamicDomainRule': {
      (async () => {
        try {
          const { domains, tag, color } = message;
          if (typeof addDynamicDomainRule === 'function') {
            await addDynamicDomainRule(domains, tag, color);
          }
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'addDynamicKeyword': {
      (async () => {
        try {
          const { tag, keyword } = message;
          if (typeof addDynamicKeyword === 'function') {
            await addDynamicKeyword(tag, keyword);
          }
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'addDynamicStopWord': {
      (async () => {
        try {
          const { word } = message;
          if (typeof addDynamicStopWord === 'function') {
            await addDynamicStopWord(word);
          }
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'removeDynamicDomainRule': {
      (async () => {
        try {
          const { tag } = message;
          if (typeof removeDynamicDomainRule === 'function') {
            await removeDynamicDomainRule(tag);
          }
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'clearLearnedDomainTags': {
      (async () => {
        try {
          if (typeof clearLearnedDomainTags === 'function') {
            await clearLearnedDomainTags();
          }
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'saveDynamicRules': {
      (async () => {
        try {
          const { rules } = message;
          if (typeof saveDynamicRules === 'function') {
            await saveDynamicRules(rules);
          }
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    // ===== 主动学习（Active Learning）消息处理 =====
    case 'getReviewQueue': {
      (async () => {
        try {
          const queue = typeof getReviewQueue === 'function'
            ? await getReviewQueue()
            : [];
          sendResponse({ success: true, queue });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'confirmTagReview': {
      (async () => {
        try {
          const { queueItem, confirmedTags, reviewAction } = message;
          if (typeof onUserConfirmTag === 'function') {
            await onUserConfirmTag(queueItem, confirmedTags, reviewAction);
          }

          // 同步更新已保存书签的 tags，确保插件主页显示最新标签
          if (queueItem && queueItem.url && confirmedTags && confirmedTags.length > 0) {
            try {
              const stored = await getStoredBookmarks();
              let updated = false;
              for (const item of stored) {
                if (item.url && item.url === queueItem.url) {
                  item.tags = [...confirmedTags];
                  item.tagsAuto = [...confirmedTags];
                  updated = true;
                }
              }
              if (updated) {
                await setStoredBookmarks(stored);
                chrome.runtime.sendMessage({
                  action: 'bookmarksUpdated',
                  bookmarks: stored
                }).catch(() => {});
              }
            } catch (e) {
              // 静默失败，不影响确认流程
            }
          }

          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'ignoreTagReview': {
      (async () => {
        try {
          const { queueItem } = message;
          if (typeof onUserConfirmTag === 'function') {
            await onUserConfirmTag(queueItem, [], 'ignored');
          }
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'getLearningStats': {
      (async () => {
        try {
          const stats = typeof getLearningStats === 'function'
            ? await getLearningStats()
            : { totalReviewed: 0, totalAccepted: 0, totalModified: 0, totalIgnored: 0 };
          sendResponse({ success: true, stats });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'getLearningTrend': {
      (async () => {
        try {
          const trend = typeof getLearningTrend === 'function'
            ? await getLearningTrend(message.days || 30)
            : [];
          sendResponse({ success: true, trend });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'getHealthScoreFavorites': {
      (async () => {
        try {
          const favorites = await getHealthScoreFavorites();
          sendResponse({ success: true, favorites });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'saveHealthScoreFavorite': {
      (async () => {
        try {
          const result = await saveHealthScoreFavorite(message.record);
          sendResponse(result);
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'deleteHealthScoreFavorite': {
      (async () => {
        try {
          const result = await deleteHealthScoreFavorite(message.id);
          sendResponse(result);
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'clearReviewQueue': {
      (async () => {
        try {
          if (typeof clearReviewQueue === 'function') {
            await clearReviewQueue();
          }
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    // ===== RSS 订阅 =====
    case 'rssGetFeeds': {
      (async () => {
        const feeds = await FeedStore.getAllFeeds();
        sendResponse({ success: true, feeds });
      })();
      return true;
    }

    case 'rssGetFeedsWithUnread': {
      (async () => {
        const feeds = await FeedStore.getAllFeeds();
        if (feeds.length === 0) {
          sendResponse({ success: true, feeds: [], unreadCounts: {} });
          return;
        }
        // 批量读取所有 items，避免 N+1 查询
        const keys = feeds.map(f => FeedStore.KEYS.ITEMS_KEY_PREFIX + f.id);
        const r = await chrome.storage.local.get(keys);
        const unreadCounts = {};
        for (const f of feeds) {
          const items = r[FeedStore.KEYS.ITEMS_KEY_PREFIX + f.id] || [];
          unreadCounts[f.id] = items.filter(i => !i.read).length;
        }
        sendResponse({ success: true, feeds, unreadCounts });
      })();
      return true;
    }

    case 'rssAddFeed': {
      (async () => {
        const { url, title, siteUrl, folderId, autoBookmark, notify } = message;
        // 先抓取验证，避免存入无效源
        const init = await FeedFetcher.fetchAndInit(url);
        if (!init.success) {
          sendResponse({ success: false, error: init.error });
          return;
        }
        // 如果发生重定向，使用最终 URL 作为订阅地址（避免每次都走重定向）
        const feedUrl = init.finalUrl || url;
        const addResult = await FeedStore.addFeed({
          url: feedUrl,
          title: title || init.title || url,
          siteUrl: siteUrl || init.siteUrl,
          favicon: init.favicon || '',
          folderId: folderId || null,
          autoBookmark: !!autoBookmark,
          notify: notify !== false
        });
        if (!addResult.success) {
          sendResponse(addResult);
          return;
        }
        // 直接写入首批条目，避免二次拉取
        if (init._parsed && init._parsed.items) {
          const settings = await FeedStore.getSettings();
          await FeedStore.upsertItems(addResult.feed.id, init._parsed.items, settings.maxItemsPerFeed);
          await FeedStore.updateFeed(addResult.feed.id, {
            lastFetched: Date.now(),
            etag: init.etag,
            lastModified: init.lastModified
          });
        }
        FeedNotifier.updateBadge();
        // 先响应前端，不等 favicon
        const feedResult = addResult.feed;
        sendResponse({ success: true, feed: feedResult, itemCount: init.itemCount || 0 });
        // favicon 异步补上（不阻塞订阅响应）
        if (init._faviconPromise) {
          init._faviconPromise.then(async (favicon) => {
            if (favicon) {
              await FeedStore.updateFeed(addResult.feed.id, { favicon });
            }
          }).catch(() => {});
        }
      })();
      return true;
    }

    case 'rssRemoveFeed': {
      (async () => {
        const result = await FeedStore.removeFeed(message.feedId);
        FeedNotifier.updateBadge();
        sendResponse(result);
      })();
      return true;
    }

    case 'rssUpdateFeed': {
      (async () => {
        const result = await FeedStore.updateFeed(message.feedId, message.patch || {});
        sendResponse(result);
      })();
      return true;
    }

    case 'rssReorderFeeds': {
      (async () => {
        const result = await FeedStore.reorderFeeds(message.orderedIds || []);
        sendResponse(result);
      })();
      return true;
    }

    case 'rssRefreshFeed': {
      (async () => {
        const result = await FeedFetcher.refreshFeed(message.feedId);
        FeedNotifier.updateBadge();
        sendResponse(result || { success: true });
      })();
      return true;
    }

    case 'rssRefreshAll': {
      (async () => {
        const result = await FeedFetcher.refreshAll();
        sendResponse({ success: true, result });
      })();
      return true;
    }

    case 'rssGetItems': {
      (async () => {
        const items = message.feedId
          ? await FeedStore.getItems(message.feedId)
          : await FeedStore.getAllItems();
        sendResponse({ success: true, items });
      })();
      return true;
    }

    case 'rssSetItemRead': {
      (async () => {
        const result = await FeedStore.setItemRead(message.itemId, message.feedId, message.read);
        FeedNotifier.updateBadge();
        sendResponse(result);
      })();
      return true;
    }

    case 'rssMarkAllRead': {
      (async () => {
        const result = await FeedStore.markAllRead(message.feedId);
        FeedNotifier.updateBadge();
        sendResponse(result);
      })();
      return true;
    }

    case 'rssMarkAllFeedsRead': {
      (async () => {
        const result = await FeedStore.markAllFeedsRead();
        FeedNotifier.updateBadge();
        sendResponse(result);
      })();
      return true;
    }

    case 'rssSetItemStarred': {
      (async () => {
        const result = await FeedStore.setItemStarred(message.itemId, message.feedId, message.starred);
        sendResponse(result);
      })();
      return true;
    }

    case 'rssGetSettings': {
      (async () => {
        const settings = await FeedStore.getSettings();
        sendResponse({ success: true, settings });
      })();
      return true;
    }

    case 'rssSetSettings': {
      (async () => {
        await FeedStore.setSettings(message.patch || {});
        // 轮询周期可能变更，重新调度
        await FeedFetcher.reschedule();
        sendResponse({ success: true });
      })();
      return true;
    }

    case 'rssTestProxy': {
      // 测试代理可用性：用指定源 URL（默认阮一峰博客）经代理抓取，返回抓取结果摘要
      (async () => {
        const testUrl = message.testUrl || 'http://www.ruanyifeng.com/blog/atom.xml';
        const proxyUrl = message.proxyUrl;
        if (!proxyUrl || !proxyUrl.includes('{url}')) {
          sendResponse({ success: false, error: 'proxy_template_invalid' });
          return;
        }
        try {
          const r = await FeedFetcher.testProxy(testUrl, proxyUrl, { signal: null });
          sendResponse({
            success: true,
            itemCount: r.parsed.items.length,
            feedTitle: r.parsed.title || ''
          });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }

    case 'rssDiscoverActive': {
      (async () => {
        const feeds = await FeedDiscover.discoverForActiveTab();
        sendResponse({ success: true, feeds });
      })();
      return true;
    }

    case 'rssSaveItemAsBookmark': {
      (async () => {
        const { itemId, feedId } = message;
        const items = await FeedStore.getItems(feedId);
        const item = items.find((i) => i.id === itemId);
        if (!item) {
          sendResponse({ success: false, error: 'item_not_found' });
          return;
        }
        const feed = await FeedStore.getFeed(feedId);
        const settings = await FeedStore.getSettings();
        const result = await saveRssArticleAsBookmark(item, feed, settings);
        sendResponse(result);
      })();
      return true;
    }
  }
});

// ===== 书签事件监听 =====
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  if (bookmark.url) {
    addSingleBookmark(id).then((item) => {
      if (item) {
        chrome.runtime.sendMessage({
          action: 'bookmarkAdded',
          bookmark: item
        }).catch(() => {}); // popup 可能未打开
        enqueueIncrementalClassification(id, bookmark).catch(() => {});
      }
    });
  }
});

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  updateBookmark(id, changeInfo);
});

let bookmarkMoveUpdateQueue = Promise.resolve();

// 监听书签移动：同步本地镜像，并学习"域名→目录名(标签)"映射
chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  bookmarkMoveUpdateQueue = bookmarkMoveUpdateQueue.then(async () => {
    try {
      const bookmark = await chrome.bookmarks.get(id);
      if (!bookmark || !bookmark[0] || !bookmark[0].url) return;
      const b = bookmark[0];
      const parent = await chrome.bookmarks.get(moveInfo.parentId);
      if (!parent || !parent[0]) return;
      const parentTitle = parent[0].title || '';
      const folderName = isBrowserBookmarkRoot(parentTitle) ? '' : parentTitle;
      const folderOptions = await loadBookmarkFolderOptions();
      const folderPath = folderOptions.find((folder) => folder.id === moveInfo.parentId)?.path || '';

      const bookmarks = await getStoredBookmarks();
      const stored = bookmarks.find((item) => item.id === id);
      if (stored) {
        stored.parentId = moveInfo.parentId;
        stored.folderName = folderName;
        stored.folderPath = folderPath;
        await setStoredBookmarks(bookmarks);
        chrome.runtime.sendMessage({
          action: 'bookmarksUpdated',
          ids: [id],
        }).catch(() => {});
      }

      const domain = extractDomain(b.url);
      if (folderName && domain && typeof learnDomainTag === 'function') {
        await learnDomainTag(domain, folderName);
      }
    } catch (e) {
      // 静默失败，不影响书签移动
    }
  }).catch(() => {});
});

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  // 从存储中移除并写入 tombstone
  getStoredBookmarks().then(async (bookmarks) => {
    const target = bookmarks.find((b) => b.id === id);
    const filtered = bookmarks.filter((b) => b.id !== id);
    if (filtered.length !== bookmarks.length) {
      await setStoredBookmarks(filtered);
      if (target) await addTombstone(target);
    } else if (removeInfo && removeInfo.node && removeInfo.node.url && target) {
      // 已经被过滤了也要写 tombstone
      await addTombstone(target);
    }
    chrome.runtime.sendMessage({
      action: 'bookmarksDeleted',
      ids: [id],
      urls: removeInfo?.node?.url ? [removeInfo.node.url] : [],
    }).catch(() => {});
  });
});

// ===== 定时检测失效书签 =====
const CHECKER_ALARM_PREFIX = 'bookmark_checker_';

// ===== 失效检测 - 后台绕过 CORS =====
//
// 检测策略：
//   1) 总超时预算（timeoutMs）控制单 URL 总耗时，避免拖慢整批。
//   2) 先 HEAD 探测：2xx/3xx 立即返回；4xx/5xx 也降级 GET（部分服务器 HEAD 405/501）。
//   3) 404/410 必须先读取 HTML：仅当页面明确表示资源不存在，且两次独立 GET 均如此时才判定 broken。
//      SPA 应用壳、登录页、访问限制页和无法确认的页面均保留为 warning，避免误删可打开书签。
//   4) 指数退避 + 抖动（full jitter），防雪崩。
//   5) 单次请求也受 perAttemptMs 上限约束，绝不超过剩余预算。
//
// 旧调用方式 `checkUrlFromBackground(url, timeoutMs)` 仍可用（timeoutMs 作为总预算）。

// 判定是否为可重试的瞬时错误
function isTransientError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true; // 超时
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('err_name') ||           // DNS 解析失败
    msg.includes('err_internet') ||       // 离线
    msg.includes('err_connection') ||      // 连接被重置/拒绝
    msg.includes('err_timed_out') ||
    msg.includes('err_ssl') ||            // TLS 握手失败
    msg.includes('err_aborted') ||
    msg.includes('net::')                 // 旧 Chromium 错误前缀
  );
}

// HTTP 状态码是否值得重试：0=无响应、5xx、429/408/425
function isRetryableHttpStatus(status) {
  if (!status) return true;
  if (status === 408 || status === 425 || status === 429) return true;
  return status >= 500 && status < 600;
}

// 业务错误（4xx）：不重试，直接判定
function isBusinessError(status) {
  return status >= 400 && status < 500;
}

// 指数退避 + 抖动（full jitter）
function backoffMs(attempt, baseMs, maxMs) {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
  return Math.floor(Math.random() * (exp + 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 发起单次请求；受 deadline + perAttempt 双重约束
async function fetchOnce(url, method, deadlineMs, perAttemptMs) {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) {
    const e = new Error('deadline exceeded');
    e.name = 'AbortError';
    return { ok: false, error: e };
  }
  const controller = new AbortController();
  const timeout = Math.min(perAttemptMs, remaining);
  const tid = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: 'follow',
      // Health checks must not send a browser login session to arbitrary URLs.
      credentials: 'omit',
      cache: 'no-store'
    });
    clearTimeout(tid);
    return { ok: true, response };
  } catch (err) {
    clearTimeout(tid);
    return { ok: false, error: err };
  }
}

// HTTP 状态码 → 检测结果。
// 只有资源明确不存在时才允许标记为 broken 并出现在批量清理中；
// 认证、权限、限流和服务器故障都可能在浏览器标签页中正常打开，因此保留为 warning。
function classifyByStatus(status) {
  if (status >= 200 && status < 400) {
    return { status: 'ok', statusCode: status, message: `HTTP ${status}` };
  }
  if (status === 404 || status === 410) {
    return { status: 'broken', statusCode: status, message: `HTTP ${status} - Not Found` };
  }
  if (status >= 400 && status < 500) {
    return { status: 'warning', statusCode: status, message: `HTTP ${status} - Access Restricted` };
  }
  if (status >= 500) {
    return { status: 'warning', statusCode: status, message: `HTTP ${status} - Server Error` };
  }
  return { status: 'warning', statusCode: status, message: `HTTP ${status} - Unknown Response` };
}

/**
 * 检测单个 URL 是否失效
 * @param {string} url
 * @param {number|object} [timeoutOrOptions] - 兼容旧调用：直接传总超时（ms）
 *   options: {
 *     timeoutMs,      // 总预算（默认 10000）
 *     perAttemptMs,   // 单次请求上限（默认 5000）
 *     retries,        // GET 失败时额外重试次数（默认 2）
 *     baseDelayMs,    // 退避基准（默认 800）
 *     maxDelayMs      // 退避上限（默认 3000）
 *   }
 */
async function checkUrlFromBackground(url, timeoutOrOptions) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { status: 'warning', statusCode: 0, message: 'Unsupported URL Scheme' };
    }
  } catch {
    return { status: 'warning', statusCode: 0, message: 'Invalid URL' };
  }

  const opts = (typeof timeoutOrOptions === 'object' && timeoutOrOptions !== null)
    ? timeoutOrOptions
    : { timeoutMs: timeoutOrOptions };
  const {
    timeoutMs = 10000,
    perAttemptMs = 5000,
    retries = 2,
    baseDelayMs = 800,
    maxDelayMs = 3000,
  } = opts;

  const deadline = Date.now() + timeoutMs;

  // ---- 1) HEAD 探测 ----
  const head = await fetchOnce(url, 'HEAD', deadline, perAttemptMs);
  if (head.ok) {
    const headStatus = head.response.status;
    if (headStatus >= 400) {
      // 4xx/5xx：降级到 GET 重试链做进一步判断
    } else {
      // 2xx/3xx HEAD 成功：检查 Content-Type。
      // 非 HTML 资源（图片、PDF 等）直接判定正常；HTML 需走 GET 内容层检测。
      const ct = head.response.headers.get('content-type') || '';
      if (!ct.includes('text/html')) return classifyByStatus(headStatus);
      // HTML 资源：落入 GET 重试链做内容层检测（登录墙、跳首页、软404）
    }
  } else if (!isTransientError(head.error)) {
    // 非瞬时错误（如 TypeError 编程错误）：再尝试一次 GET
  }
  // 其余情况（HEAD 瞬时错误 / HEAD 4xx-5xx / HEAD 200 HTML）→ 走 GET 重试链

  // ---- 2) GET 重试链 ----
  let attempts = 0;
  let lastError = null; // { type: 'http'|'network', status?, error? }
  let confirmedMissingResponses = 0;

  while (true) {
    // 预算已耗尽
    if (Date.now() >= deadline) {
      return { status: 'warning', statusCode: 0, message: 'Total timeout' };
    }

    if (attempts > 0) {
      const wait = backoffMs(attempts - 1, baseDelayMs, maxDelayMs);
      const remaining = deadline - Date.now();
      if (wait >= remaining) {
        return { status: 'warning', statusCode: 0, message: 'Total timeout' };
      }
      await sleep(wait);
    }

    const get = await fetchOnce(url, 'GET', deadline, perAttemptMs);
    if (get.ok) {
      const { response } = get;
      const { status } = response;
      // 2xx/3xx：需进一步检查内容层（登录墙、跳首页、软404）
      if (status >= 200 && status < 400) {
        const ct = (response.headers.get('content-type') || '');
        if (ct.includes('text/html')) {
          try {
            const html = (await response.text()).slice(0, 65536);
            const contentDetail = inspectContentDetail(url, response.url, html);
            if (contentDetail === 'login-wall') {
              return { status: 'warning', statusCode: status, message: 'Login Required', detail: 'login-wall' };
            }
            if (contentDetail === 'redirect-home') {
              return { status: 'warning', statusCode: status, message: 'Redirected to homepage', detail: 'redirect-home' };
            }
            if (contentDetail === 'soft-404') {
              return { status: 'warning', statusCode: status, message: 'Page not found (soft 404)', detail: 'soft-404' };
            }
            if (contentDetail === 'empty-page') {
              return { status: 'warning', statusCode: status, message: 'Empty page', detail: 'empty-page' };
            }
          } catch (_) {}
        }
        return classifyByStatus(status);
      }
      // 非 Not Found 的业务状态：直接判定
      if (isBusinessError(status) && status !== 404 && status !== 410) {
        return classifyByStatus(status);
      }
      if (status === 404 || status === 410) {
        const inspection = await inspectMissingResponse(response);
        if (!inspection.confirmed) {
          return { status: 'warning', statusCode: status, message: `HTTP ${status} - ${inspection.reason}`, detail: inspection.detail };
        }
        confirmedMissingResponses++;
        if (confirmedMissingResponses >= 2) return classifyByStatus(status);
      }
      // 404/410 等待二次确认；5xx 也继续重试。
      lastError = { type: 'http', status };
    } else {
      const err = get.error;
      // 整体超时（被 deadline 截断的 AbortError）
      if (err.name === 'AbortError' && Date.now() >= deadline) {
        return { status: 'warning', statusCode: 0, message: 'Total timeout' };
      }
      // 非瞬时错误：直接返回 warning，不重试
      if (!isTransientError(err)) {
        return { status: 'warning', statusCode: 0, message: 'Network Error' };
      }
      // 瞬时错误 → 可重试
      lastError = { type: 'network', error: err };
    }

    attempts++;
    if (attempts > retries) break;
  }

  // ---- 3) 重试耗尽：返回最终结果 ----
  if (lastError && lastError.type === 'http') {
    if (lastError.status === 404 || lastError.status === 410) {
      return { status: 'warning', statusCode: lastError.status, message: `Unconfirmed HTTP ${lastError.status}` };
    }
    return classifyByStatus(lastError.status);
  }

  // Browser fetches can fail because of TLS, proxy, VPN, privacy rules, or
  // temporary DNS trouble. None proves that a bookmark is dead.
  return { status: 'warning', statusCode: 0, message: 'Network Error' };
}

const CONFIRMED_MISSING_PATTERNS = [
  /页面不存在|页面未找到|找不到(该|此|你要的)?页面|页面已删除|内容(不存在|已删除|已下架|已失效)/,
  /商品(不存在|已下架|已失效|已删除)|宝贝(不存在|已下架)|店铺不存在/,
  /(文章|视频|帖子|资源)(不存在|已删除|已下架|已失效)/,
  /page not found|404 not found|content (not found|unavailable|removed)/i,
  /(item|product|listing) (no longer available|not available|removed|unavailable)/i,
  /this (page|video|post|account) (isn'?t|is not|is no longer) available/i,
];

/** 登录页 URL 特征（与 probe.ts 保持一致） */
const LOGIN_URL_PATTERN = /\/(login|signin|sign-in|passport|auth|account\/login)\b/i;

function containsConfirmedMissingPattern(text) {
  return CONFIRMED_MISSING_PATTERNS.some((pattern) => pattern.test(text));
}

function plainPageText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isJsRenderedShell(html) {
  return /<script[\s>]/i.test(html) && (
    /<div[^>]+id=["'](root|app|__next|__nuxt|main)["']/i.test(html) ||
    /data-reactroot|data-v-app|ng-version|__NEXT_DATA__|window\.__INITIAL_STATE__/i.test(html) ||
    (html.match(/<script/gi) || []).length >= 3
  );
}

/**
 * 检查 200 响应是否为软 404 / 登录墙 / 跳首页（与 probe.ts inspectContent 对齐）。
 * 返回 detail 字符串（'ok'|'login-wall'|'redirect-home'|'soft-404'|'empty-page'）。
 */
function inspectContentDetail(originalUrl, finalUrl, html) {
  // 1) 重定向漂移检测
  try {
    const orig = new URL(originalUrl);
    const final = new URL(finalUrl);
    const origHasPath = orig.pathname.length > 1 || orig.search.length > 0;
    if (LOGIN_URL_PATTERN.test(final.pathname)) return 'login-wall';
    if (origHasPath && final.hostname === orig.hostname && final.pathname === '/' && !final.search) {
      return 'redirect-home';
    }
  } catch (_) {}

  const jsShell = isJsRenderedShell(html);
  const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '';
  const snippet = jsShell ? '' : html.slice(0, 4096);

  // 2) 软 404 关键词（SPA 壳只检查标题）
  for (const p of CONFIRMED_MISSING_PATTERNS) {
    if (p.test(title) || (snippet && p.test(snippet))) return 'soft-404';
  }

  // 3) 空页面（仅静态页）
  if (!jsShell) {
    const text = plainPageText(html);
    if (html.length > 0 && text.length < 80) return 'empty-page';
  }
  return 'ok';
}

async function inspectMissingResponse(response) {
  const status = response.status;
  if (!(response.headers.get('content-type') || '').includes('text/html')) {
    return { confirmed: false, status, detail: 'non-html', reason: 'non-HTML response' };
  }
  try {
    const html = (await response.text()).slice(0, 65536);
    const title = (/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '';
    const jsShell = isJsRenderedShell(html);
    const text = jsShell ? '' : plainPageText(html);

    // 修复1&2：移除 text.length<=1200 的错误限制，改为 title OR body 任一命中即确认
    // 旧逻辑要求 title AND body 同时命中且正文 ≤1200 字符，导致大量含完整页面的404被漏判。
    const titleConfirms = containsConfirmedMissingPattern(title);
    const bodyConfirms = !jsShell && containsConfirmedMissingPattern(text);
    const confirmed = titleConfirms || bodyConfirms;

    return {
      confirmed,
      status,
      detail: confirmed ? 'missing-page-content' : 'inconclusive',
      reason: confirmed ? 'missing page content' : 'page content is usable or inconclusive',
    };
  } catch {
    return { confirmed: false, status, detail: 'read-error', reason: 'could not read page content' };
  }
}

async function getCheckSettings() {
  const defaults = {
    checkerTimeout: 10000,
    checkerFrequency: 'never',
    checkerConcurrency: 5,
    checkerTime: '03:00',
    checkerAutoDelete: false,
    checkerRetries: 2,
    checkerBackoffBase: 800,
    checkerBackoffMax: 3000
  };
  const result = await chrome.storage.local.get(Object.keys(defaults));
  const migratedAutoDelete = result.checkerAutoDelete === true;
  if (migratedAutoDelete) {
    // Older releases allowed an irreversible scheduled deletion. Preserve the
    // user's check schedule, but require an explicit manual deletion instead.
    await chrome.storage.local.set({ checkerAutoDelete: false, checkerAutoDeleteMigratedAt: Date.now() });
  }
  return { ...defaults, ...result, checkerAutoDelete: false, migratedAutoDelete };
}

async function scheduleCheckerAlarm() {
  // 清除所有现有检测闹钟
  const existingAlarms = await chrome.alarms.getAll();
  for (const alarm of existingAlarms) {
    if (alarm.name.startsWith(CHECKER_ALARM_PREFIX)) {
      await chrome.alarms.clear(alarm.name);
    }
  }

  const settings = await getCheckSettings();
  const frequency = settings.checkerFrequency;

  if (frequency === 'never') return;

  // 解析用户设定的检测时间，默认 03:00
  const checkTime = settings.checkerTime || '03:00';
  const [hours, minutes] = checkTime.split(':').map(Number);

  // 计算距离下次目标时间的分钟数
  const now = new Date();
  const target = new Date();
  target.setHours(hours, minutes, 0, 0);

  if (frequency === 'daily') {
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
  } else if (frequency === 'weekly') {
    const dayOfWeek = Number(settings.checkerDayOfWeek ?? 1);
    const currentDay = target.getDay();
    const diff = (dayOfWeek - currentDay + 7) % 7;
    target.setDate(target.getDate() + diff);
    if (target <= now) {
      target.setDate(target.getDate() + 7);
    }
  } else if (frequency === 'monthly') {
    const dayOfMonth = Math.max(1, Number(settings.checkerDayOfMonth ?? 1));
    const daysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(dayOfMonth, daysInMonth));
    if (target <= now) {
      target.setMonth(target.getMonth() + 1);
      const nextDaysInMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      target.setDate(Math.min(dayOfMonth, nextDaysInMonth));
    }
  }

  let periodInMinutes;
  switch (frequency) {
    case 'daily': periodInMinutes = 24 * 60; break;
    case 'weekly': periodInMinutes = 7 * 24 * 60; break;
    case 'monthly': periodInMinutes = 30 * 24 * 60; break;
    default: return;
  }

  const delayInMinutes = Math.max(1, Math.round((target - now) / 60000));

  await chrome.alarms.create(CHECKER_ALARM_PREFIX + frequency, {
    delayInMinutes: delayInMinutes,
    periodInMinutes: periodInMinutes
  });
}

// 闹钟触发时执行后台检测
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // RSS 订阅定时拉取
  if (alarm.name === RSS_ALARM_NAME) {
    try {
      await FeedFetcher.pollAll();
    } catch (err) {
      console.warn('RSS poll failed:', err);
    }
    return;
  }

  if (!alarm.name.startsWith(CHECKER_ALARM_PREFIX)) return;

  const settings = await getCheckSettings();
  const timeout = settings.checkerTimeout || 10000;
  const concurrency = settings.checkerConcurrency || 5;

  const bookmarks = await getStoredBookmarks();
  if (bookmarks.length === 0) return;

  let index = 0;
  const results = [];

  // 共享检测配置：总预算来自用户设置，perAttempt 限制为预算的一半避免单次吃光
  const checkOptions = {
    timeoutMs: timeout,
    perAttemptMs: Math.max(2000, Math.floor(timeout / 2)),
    retries: settings.checkerRetries ?? 2,
    baseDelayMs: settings.checkerBackoffBase ?? 800,
    maxDelayMs: settings.checkerBackoffMax ?? 3000
  };

  async function processNext() {
    while (index < bookmarks.length) {
      const currentIndex = index++;
      const bm = bookmarks[currentIndex];
      const checkResult = await checkUrlFromBackground(bm.url, checkOptions);
      results.push({ bookmark: bm, status: checkResult.status, message: checkResult.message });
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(processNext());
  }
  await Promise.all(workers);

  // 保存检测结果
  const summary = BookmarkData.buildCheckerSummary(results);
  summary.status = 'completed';
  summary.pendingCleanupCount = summary.pendingCleanup.length;
  summary.autoDeleteMigrated = !!settings.migratedAutoDelete;
  await chrome.storage.local.set({ checkerLastResult: summary });

  if (summary.broken > 0) {
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: '../icons/icon48.png',
      title: 'AI Bookmark OS',
      message: `检测到 ${summary.broken} 个确认失效书签，已加入待清理列表`
    });
  }
});

// ===== 关闭所有独立窗口 =====
function closeStandaloneWindows() {
  const standaloneUrl = chrome.runtime.getURL('pages/standalone/standalone.html');
  chrome.windows.getAll({ populate: true }, (windows) => {
    for (const win of windows) {
      if (win.type === 'popup' && win.tabs) {
        for (const tab of win.tabs) {
          if (tab.url && tab.url.startsWith(standaloneUrl)) {
            chrome.windows.remove(win.id);
            break;
          }
        }
      }
    }
  });
}

// ===== 扩展安装/启动时自动同步 =====
chrome.runtime.onInstalled.addListener(() => {
  // 关闭所有已打开的独立窗口（插件重载后旧窗口上下文已失效）
  closeStandaloneWindows();

  syncAllBookmarks();
  scheduleCheckerAlarm();
  // 预加载智能标签缓存（使 autoTagBookmarkSync 可同步运行）
  if (typeof preloadSmartTaggerCaches === 'function') {
    preloadSmartTaggerCaches();
  }

  // 初始化 RSS 订阅：调度定时拉取闹钟 + 刷新未读徽标
  if (typeof FeedFetcher !== 'undefined' && FeedFetcher.init) {
    FeedFetcher.init().catch((err) => console.warn('FeedFetcher init failed:', err));
  }
  if (typeof FeedNotifier !== 'undefined' && FeedNotifier.updateBadge) {
    FeedNotifier.updateBadge();
  }

  // 创建右键菜单
  chrome.contextMenus.create({
    id: 'bookmark-this-page',
    title: '为当前页面添加书签',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'remove-bookmark-this-page',
    title: '移除当前页面书签',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'subscribe-this-page',
    title: '订阅此页面 (RSS)',
    contexts: ['page']
  });
});

// 右键菜单点击处理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // 订阅此页面：嗅探当前页 RSS 源并自动订阅
  if (info.menuItemId === 'subscribe-this-page' && tab && tab.id) {
    try {
      const discovered = await FeedDiscover.discoverInTab(tab.id);
      if (!discovered || discovered.length === 0) {
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: '../icons/icon48.png',
          title: 'AI Bookmark OS',
          message: '未发现可订阅的 RSS 源'
        });
        return;
      }
      const feedUrl = discovered[0].url;
      const existing = await FeedStore.getFeedByUrl(feedUrl);
      if (existing) {
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: '../icons/icon48.png',
          title: 'AI Bookmark OS',
          message: '已订阅过该源'
        });
        return;
      }
      const init = await FeedFetcher.fetchAndInit(feedUrl);
      if (!init.success) {
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: '../icons/icon48.png',
          title: 'AI Bookmark OS',
          message: '订阅失败: ' + init.error
        });
        return;
      }
      const addResult = await FeedStore.addFeed({
        url: feedUrl,
        title: init.title || feedUrl,
        siteUrl: init.siteUrl
      });
      if (addResult.success && init._parsed && init._parsed.items) {
        const settings = await FeedStore.getSettings();
        await FeedStore.upsertItems(addResult.feed.id, init._parsed.items, settings.maxItemsPerFeed);
        await FeedStore.updateFeed(addResult.feed.id, {
          lastFetched: Date.now(),
          etag: init.etag,
          lastModified: init.lastModified
        });
      }
      FeedNotifier.updateBadge();
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: '../icons/icon48.png',
        title: 'AI Bookmark OS',
        message: `订阅成功: ${init.title || feedUrl}（${init.itemCount || 0} 篇）`
      });
    } catch (err) {
      console.error('右键订阅失败:', err);
    }
    return;
  }

  if (info.menuItemId === 'bookmark-this-page' && tab && tab.url) {
    // 复用一键收藏的智能标签 + 目录建议逻辑
    await handleQuickBookmark(tab);
    return;
  }
  
  // 处理移除书签
  if (info.menuItemId === 'remove-bookmark-this-page' && tab && tab.url) {
    try {
      // 查找当前页面的书签
      const existing = await chrome.bookmarks.search({ url: tab.url });
      
      if (existing.length === 0) {
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: '../icons/icon48.png',
          title: 'AI Bookmark OS',
          message: '该页面未在书签中'
        });
        return;
      }

      // 删除所有匹配的书签（可能有重复）
      for (const bookmark of existing) {
        await chrome.bookmarks.remove(bookmark.id);
      }

      // 从时间轴存储中删除
      const stored = await getStoredBookmarks();
      const filtered = stored.filter(b => b.url !== tab.url);
      await setStoredBookmarks(filtered);

      // 通知 popup 刷新
      chrome.runtime.sendMessage({
        action: 'bookmarksDeleted',
        urls: [tab.url]
      }).catch(() => {});

      // 显示成功通知
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: '../icons/icon48.png',
        title: 'AI Bookmark OS',
        message: `已移除: ${tab.title || tab.url}`
      });
    } catch (err) {
      console.error('右键移除书签失败:', err);
    }
  }
});

// ===== 点击计数追踪：监听标签页导航 =====
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome-extension://')) {
    const normalizedUrl = tab.url.replace(/\/+$/, '');
    getStoredBookmarks().then(bookmarks => {
      for (const item of bookmarks) {
        if (item.url && item.url.replace(/\/+$/, '') === normalizedUrl) {
          item.clickCount = (item.clickCount || 0) + 1;
          item.lastClickedAt = Date.now();
          setStoredBookmarks(bookmarks).catch(() => {});
          break;
        }
      }
    }).catch(() => {});
  }
});

chrome.runtime.onStartup.addListener(() => {
  syncAllBookmarks();
  scheduleCheckerAlarm();
  // 预加载智能标签缓存（使 autoTagBookmarkSync 可同步运行）
  if (typeof preloadSmartTaggerCaches === 'function') {
    preloadSmartTaggerCaches();
  }
  // 初始化 RSS 订阅：恢复定时拉取闹钟 + 刷新未读徽标
  if (typeof FeedFetcher !== 'undefined' && FeedFetcher.init) {
    FeedFetcher.init().catch((err) => console.warn('FeedFetcher init failed:', err));
  }
  if (typeof FeedNotifier !== 'undefined' && FeedNotifier.updateBadge) {
    FeedNotifier.updateBadge();
  }
});

// ===== 全局快捷键：打开命令面板 / 弹窗 / 一键收藏 =====
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-command-palette') {
    // 命令面板：打开或聚焦 popup
    try {
      await chrome.action.openPopup();
    } catch (e) {
      // openPopup 不可用时回退
      chrome.tabs.create({ url: chrome.runtime.getURL('pages/popup/popup.html') });
    }
    // 通知 popup 打开命令面板
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'openCommandPalette' }).catch(() => {});
    }, 50);
  } else if (command === 'open-popup') {
    try {
      await chrome.action.openPopup();
    } catch (e) {
      chrome.tabs.create({ url: chrome.runtime.getURL('pages/popup/popup.html') });
    }
  } else if (command === 'quick-bookmark') {
    await handleQuickBookmark();
  }
});

// ===== 一键收藏：自动建议目录 =====
// activeTab: 可选，由调用方（如右键菜单）传入已知的 tab，避免重复查询

// Map Chrome / scripting errors to stable codes or Chinese messages for UI.
function localizeQuickBookmarkError(err) {
  const raw = String(err?.message || err || "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return "quick_bookmark_failed";
  if (raw === "unsupported_page" || lower.includes("unsupported")) return "unsupported_page";
  if (lower.includes("frame with id") && lower.includes("error page")) return "error_page";
  if (lower.includes("cannot access contents of the page") || lower.includes("cannot access a chrome")) return "restricted_page";
  if (lower.includes("extensions gallery") || lower.includes("chrome web store")) return "restricted_page";
  if (lower.includes("the extensions gallery cannot be scripted")) return "restricted_page";
  if (lower.includes("no tab with id") || lower.includes("no window with id")) return "tab_unavailable";
  if (lower.includes("the tab was closed") || lower.includes("tabs cannot be edited")) return "tab_unavailable";
  if (lower.includes("missing host permission") || lower.includes("cannot be scripted")) return "restricted_page";
  if (lower.includes("timeout") || lower.includes("timed out")) return "timeout";
  // Prefer not to leak raw English chrome messages to users.
  if (/^[A-Za-z][A-Za-z0-9 ,.'":;_()\[\]#/-]{8,}$/.test(raw) && !/[\u4e00-\u9fff]/.test(raw)) {
    return "quick_bookmark_failed";
  }
  return raw;
}

async function handleQuickBookmark(activeTab) {
  try {
    const tab = activeTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return { success: false, error: 'unsupported_page' };
    }

    if (tab.id) {
      await injectBookmarkConfirmPanel(tab.id, {
        status: 'loading',
        title: tab.title || tab.url,
        url: tab.url
      });
    }

    const draft = await prepareBookmarkSuggestion(tab);
    if (tab.id) {
      await injectBookmarkConfirmPanel(tab.id, { status: 'ready', ...draft });
    }
    return { success: true, pending: true, draft };
  } catch (err) {
    console.error('快捷收藏建议失败:', err);
    return { success: false, error: localizeQuickBookmarkError(err) };
  }
}

// suggestedTags: 已由调用方通过 autoTagBookmarkSync 计算好的标签数组
async function suggestBookmarkFolder(url, title, suggestedTags, bookmarkContext = null) {
  try {
    const bookmarkEvidence = bookmarkContext || { url: url || '', title: title || '', domain: extractDomain(url || '') };
    const folderOptions = await loadBookmarkFolderOptions().catch(() => []);
    const existingCandidates = scoreExistingFolderCandidates(folderOptions, suggestedTags, bookmarkEvidence);
    const stored = await getStoredBookmarks();
    const historyCandidates = scoreHistoricalFolderCandidates(stored, suggestedTags, bookmarkEvidence, null, folderOptions);
    const profileCandidates = scoreFolderProfileCandidates(stored, folderOptions, bookmarkEvidence, suggestedTags, null);

    const best = chooseBestBookmarkFolderCandidate([...historyCandidates, ...existingCandidates, ...profileCandidates]);
    if (best) return { id: best.id || await findFolderIdByPath(best.folderPath), title: best.folderName || best.title, path: best.folderPath || best.path };

    return null;
  } catch (err) {
    console.error('建议目录失败:', err);
    return null;
  }
}

// 在整棵书签树中递归查找指定名称的文件夹，返回 { node, path }
async function suggestBookmarkFolderReadOnly(url, title, suggestedTags, bookmarkContext = null) {
  try {
    const bookmarkEvidence = bookmarkContext || { url: url || '', title: title || '', domain: extractDomain(url || '') };
    const folderOptions = await loadBookmarkFolderOptions().catch(() => []);
    const existingCandidates = scoreExistingFolderCandidates(folderOptions, suggestedTags, bookmarkEvidence);

    const stored = await getStoredBookmarks();
    const historyCandidates = scoreHistoricalFolderCandidates(stored, suggestedTags, bookmarkEvidence, null, folderOptions);
    const profileCandidates = scoreFolderProfileCandidates(stored, folderOptions, bookmarkEvidence, suggestedTags, null);
    const best = chooseBestBookmarkFolderCandidate([...historyCandidates, ...existingCandidates, ...profileCandidates]);
    if (best) return { id: best.id || await findFolderIdByPath(best.folderPath), title: best.folderName || best.title, path: best.folderPath || best.path };

    return null;
  } catch (err) {
    console.error('只读目录建议失败:', err);
    return null;
  }
}

function findFolderInTree(nodes, name, path = '') {
  if (!nodes) return null;
  for (const node of nodes) {
    const currentPath = joinBookmarkFolderPath(path, node.title);
    if (node.title === name && !node.url && !isBrowserBookmarkRoot(node.title)) {
      return { node, path: currentPath };
    }
    if (node.children) {
      const found = findFolderInTree(node.children, name, currentPath);
      if (found) return found;
    }
  }
  return null;
}

// 根据路径查找 Chrome 书签文件夹 ID
async function findFolderIdByPath(path) {
  try {
    const matchingFolder = await findExistingFolderByExactPath(path);
    if (matchingFolder) return matchingFolder.id;
    const tree = await chrome.bookmarks.getTree();
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return null;

    // 1. 先尝试精确路径匹配（从根节点逐层向下）
    let nodes = tree[0].children || [];
    let result = null;
    for (const part of parts) {
      const found = nodes.find(n => n.title === part && n.children);
      if (!found) { result = null; break; }
      nodes = found.children || [];
      if (part === parts[parts.length - 1]) result = found;
    }
    if (result) return result.id;

    // 2. 精确匹配失败，按最后一层目录名在整棵树中递归查找
    //    （兼容仅含文件夹名的相对路径，如 "AI"）
    const lastName = parts[parts.length - 1];
    const found = findFolderInTree(tree, lastName);
    return found ? found.node.id : null;
  } catch {
    return null;
  }
}

async function findOrCreateFolderPath(path) {
  try {
    const normalized = normalizeBookmarkFolderPath(path);
    if (!normalized) return null;
    const existing = await findExistingFolderByExactPath(normalized);
    if (existing) {
      return existing;
    }

    const tree = await chrome.bookmarks.getTree();
    const bookmarkBar = tree[0].children?.[0];
    if (!bookmarkBar) return null;
    const parts = normalized.split('/').filter(Boolean);

    let parent = bookmarkBar;
    const actualParts = [];
    for (const part of parts) {
      const children = await chrome.bookmarks.getChildren(parent.id);
      let next = children.find(node => !node.url && node.title === part);
      if (!next) next = await chrome.bookmarks.create({ parentId: parent.id, title: part });
      parent = next;
      actualParts.push(part);
    }
    return { id: parent.id, title: parent.title, path: actualParts.join('/') };
  } catch {
    return null;
  }
}

// 查找或创建一级子目录（优先在整棵书签树中查找同名文件夹）
async function findOrCreateFolder(name) {
  try {
    const tree = await chrome.bookmarks.getTree();

    // 1. 在整棵书签树中递归查找已有同名文件夹（书签栏 / 其他书签等均覆盖）
    const existing = findFolderInTree(tree, name);
    if (existing) {
      return { id: existing.node.id, path: existing.path };
    }

    // 2. 未找到，在书签栏下创建新文件夹
    const bookmarkBar = tree[0].children?.[0]; // 书签栏
    if (!bookmarkBar) return null;

    const folder = await chrome.bookmarks.create({
      parentId: bookmarkBar.id,
      title: name
    });
    return { id: folder.id, path: name };
  } catch {
    return null;
  }
}

// ===== 地址栏 Omni 搜索 =====
chrome.omnibox.onInputStarted.addListener(() => {
  chrome.omnibox.setDefaultSuggestion({
    description: '搜索书签...'
  });
});

chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  if (!text || !text.trim()) {
    suggest([]);
    return;
  }

  getStoredBookmarks().then(bookmarks => {
    const query = text.trim().toLowerCase();
    const results = [];

    for (const item of bookmarks) {
      const titleMatch = (item.title || '').toLowerCase().includes(query);
      const urlMatch = (item.url || '').toLowerCase().includes(query);
      const domainMatch = (item.domain || '').toLowerCase().includes(query);
      const tagMatch = (item.tags || []).some(t => t.toLowerCase().includes(query));

      if (titleMatch || urlMatch || domainMatch || tagMatch) {
        // 评分：标题 > 标签 > 域名 > URL
        let score = 0;
        if (titleMatch) score += 100;
        if (tagMatch) score += 60;
        if (domainMatch) score += 30;
        if (urlMatch) score += 20;

        results.push({ item, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, 6);

    suggest(top.map(({ item }) => ({
      content: item.url,
      description: `<url>${escapeXml(item.domain)}</url> · <match>${escapeXml(item.title || item.url)}</match>${item.tags && item.tags.length ? ' · ' + item.tags.slice(0, 3).map(t => '#' + escapeXml(t)).join(' ') : ''}`
    })));
  }).catch(() => suggest([]));
});

chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  // text 可能是选中的建议 URL，也可能是用户直接输入的搜索词
  const url = text.startsWith('http') ? text : `https://www.google.com/search?q=${encodeURIComponent(text)}`;

  switch (disposition) {
    case 'currentTab':
      chrome.tabs.update({ url });
      break;
    case 'newForegroundTab':
      chrome.tabs.create({ url });
      break;
    case 'newBackgroundTab':
      chrome.tabs.create({ url, active: false });
      break;
  }
});

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
