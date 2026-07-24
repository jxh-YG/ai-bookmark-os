// 打包产物由 package-extension 注入本地桥接器；源码直接加载时使用源路径。
if (!self.AiProbeCore) {
  importScripts('../../bridge/probe-core.js');
  importScripts('../../bridge/ai-sw-bridge.js');
}

// 引入 AI 增强层（需在 smart-tagger.js 之前加载，供其调用 classifyWithAI）
importScripts('../shared/recommendation-core.js');
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
  await mutateStorageResource(PAGE_CONTENT_CACHE_KEY, (current) => {
    const cache = { ...(current && typeof current === 'object' ? current : {}), [url]: makeContentResult(url, data) };
    let entries = Object.entries(cache).filter(([, value]) => Date.now() - (value.fetchedAt || 0) <= PAGE_CONTENT_CACHE_TTL);
    if (entries.length > PAGE_CONTENT_CACHE_MAX) {
      entries.sort((a, b) => (b[1].fetchedAt || 0) - (a[1].fetchedAt || 0));
      entries = entries.slice(0, PAGE_CONTENT_CACHE_MAX);
    }
    return Object.fromEntries(entries);
  });
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
    const result = await extractRenderedTabContent(tabId, url);
    if (result.status === 'success') return result;
  } catch (err) {
    console.warn('Content extraction failed:', err);
  }
  try {
    const cached = await getCachedContent(url);
    if (cached && cached.status === 'success') return cached;
  } catch {}
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
const STORAGE_KEY_OPERATION_RESULTS = 'destructive_operation_results';
const STORAGE_KEY_HEALTH_UNDO = 'healthRemovedBookmarksUndo';
const RECOMMENDATION_STORE_KEY = 'bookmark_recommendation_store_v2';
const RECOMMENDATION_STORE_VERSION = 2;
const RECOMMENDATION_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECOMMENDATION_FEEDBACK_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const RECOMMENDATION_MAX_SNAPSHOTS = 200;
const RECOMMENDATION_MAX_FEEDBACK = 5000;
const RECOMMENDATION_MAX_REVIEWS = 200;
const programmaticBookmarkMoves = new Map();
// 导入期间由 upsertImportedBookmark 负责写入镜像。批量导入若走 onCreated → addSingleBookmark，
// 会对 N 条书签各触发一次网络抓正文 / 推荐 / 增量入队的扇出。用深度计数在导入期间关闭该扇出，
// onCreated 直接跳过（镜像写入由 upsertImportedBookmark 负责）。用计数而非布尔以兼容并发/重入导入。
// 注意：id 级标记会与 onCreated 竞态（事件可能早于 create() 的 Promise resolve），故用全局开关。
let programmaticImportDepth = 0;
function beginProgrammaticImport() { programmaticImportDepth += 1; }
function endProgrammaticImport() { programmaticImportDepth = Math.max(0, programmaticImportDepth - 1); }
function isProgrammaticImportActive() { return programmaticImportDepth > 0; }
const LABEL_CACHE_KEY = 'labelCache';
const LABEL_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LABEL_CACHE_MAX_ENTRIES = 1000;
const LABEL_CACHE_MAX_BYTES = 5 * 1024 * 1024;
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
    if (value === undefined) await chrome.storage.local.remove(key);
    else await chrome.storage.local.set({ [key]: value });
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

function stableRecommendationId(prefix, value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(36)}`;
}

function makeRecommendationId(prefix = 'rec') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRecommendationUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|spm$|ref$|ref_src$)/i.test(key)) parsed.searchParams.delete(key);
    }
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.hostname.startsWith('www.')) parsed.hostname = parsed.hostname.slice(4);
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) {
      parsed.port = '';
    }
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    const parameters = [...parsed.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyComparison = leftKey.localeCompare(rightKey);
      return keyComparison || leftValue.localeCompare(rightValue);
    });
    parsed.search = '';
    for (const [key, value] of parameters) parsed.searchParams.append(key, value);
    return parsed.toString();
  } catch {
    return String(url || '').trim();
  }
}

function recommendationUrlFingerprint(url) {
  return stableRecommendationId('url', normalizeRecommendationUrl(url));
}

async function findExistingBookmarkByUrl(url) {
  const rawUrl = String(url || '').trim();
  if (!rawUrl) return null;

  const exactMatches = await chrome.bookmarks.search({ url: rawUrl }).catch(() => []);
  const exact = (Array.isArray(exactMatches) ? exactMatches : []).find(item => item?.url === rawUrl);
  if (exact) return exact;

  const normalizedUrl = normalizeRecommendationUrl(rawUrl);
  if (!normalizedUrl) return null;
  const tree = await chrome.bookmarks.getTree().catch(() => []);
  let matched = null;
  const walk = (nodes) => {
    for (const node of nodes || []) {
      if (node?.url && normalizeRecommendationUrl(node.url) === normalizedUrl) {
        matched = node;
        return true;
      }
      if (node?.children && walk(node.children)) return true;
    }
    return false;
  };
  walk(tree);
  return matched;
}

function markProgrammaticBookmarkMove(bookmarkId, parentId) {
  programmaticBookmarkMoves.set(String(bookmarkId), {
    parentId: String(parentId || ''),
    expiresAt: Date.now() + 30 * 1000,
  });
}

function consumeProgrammaticBookmarkMove(bookmarkId, parentId) {
  const key = String(bookmarkId);
  const entry = programmaticBookmarkMoves.get(key);
  if (!entry) return false;
  programmaticBookmarkMoves.delete(key);
  return entry.expiresAt >= Date.now() && entry.parentId === String(parentId || '');
}

function emptyRecommendationStore(now = Date.now()) {
  return {
    version: RECOMMENDATION_STORE_VERSION,
    migratedAt: now,
    rules: [],
    stopWords: [],
    feedback: [],
    snapshots: [],
    reviewQueue: [],
    stats: {
      total: 0,
      accepted: 0,
      modified: 0,
      rejected: 0,
      cancelled: 0,
      lastFeedbackAt: 0,
    },
    history: [],
  };
}

function normalizeRecommendationRule(rule, now = Date.now()) {
  if (!rule || typeof rule !== 'object') return null;
  const kind = String(rule.kind || '').trim();
  const pattern = String(rule.pattern || '').trim().toLowerCase();
  const target = String(rule.target || '').trim();
  if (!kind || !pattern || !target) return null;
  const source = ['user', 'learned', 'legacy'].includes(rule.source) ? rule.source : 'learned';
  const state = ['candidate', 'active', 'conflicted', 'disabled', 'deleted'].includes(rule.state)
    ? rule.state
    : (source === 'user' ? 'active' : 'candidate');
  return {
    id: String(rule.id || stableRecommendationId('rule', `${kind}|${pattern}|${target}|${source}`)),
    kind,
    pattern,
    target,
    source,
    state,
    positiveFingerprints: [...new Set((rule.positiveFingerprints || []).map(String))].slice(-100),
    negativeFingerprints: [...new Set((rule.negativeFingerprints || []).map(String))].slice(-100),
    legacyCount: Math.max(0, Number(rule.legacyCount) || 0),
    createdAt: Number(rule.createdAt) || now,
    updatedAt: Number(rule.updatedAt) || now,
    disabledAt: Number(rule.disabledAt) || 0,
  };
}

function normalizeRecommendationReviewItem(item, now = Date.now()) {
  if (!item || typeof item !== 'object') return null;
  if (item.legacy) return { ...item, legacy: true };
  const type = ['bookmark_recommendation', 'move_observation'].includes(item.type) ? item.type : '';
  const id = String(item.id || '').trim();
  const bookmarkId = String(item.bookmarkId || '').trim();
  const recommendationId = String(item.recommendationId || '').trim();
  const createdAt = Number(item.createdAt) || now;
  if (!type || !id || !bookmarkId || !recommendationId) return null;
  if (now - createdAt > RECOMMENDATION_SNAPSHOT_TTL_MS) return null;
  return {
    id,
    type,
    bookmarkId,
    recommendationId,
    title: String(item.title || '').slice(0, 512),
    urlFingerprint: String(item.urlFingerprint || ''),
    fromFolderPath: normalizeBookmarkFolderPath(item.fromFolderPath || ''),
    toFolderId: String(item.toFolderId || ''),
    toFolderPath: normalizeBookmarkFolderPath(item.toFolderPath || ''),
    sourceParentId: String(item.sourceParentId || ''),
    sourceTags: normalizeTagList(item.sourceTags || []),
    confidence: ['high', 'medium', 'low', 'none'].includes(item.confidence) ? item.confidence : 'none',
    aiTriggered: item.aiTriggered === true,
    createdAt,
    updatedAt: Number(item.updatedAt) || createdAt,
  };
}

function normalizeRecommendationStore(raw, now = Date.now()) {
  const base = emptyRecommendationStore(now);
  if (!raw || raw.version !== RECOMMENDATION_STORE_VERSION) return base;
  const cutoffSnapshots = now - RECOMMENDATION_SNAPSHOT_TTL_MS;
  const cutoffFeedback = now - RECOMMENDATION_FEEDBACK_TTL_MS;
  return {
    ...base,
    ...raw,
    version: RECOMMENDATION_STORE_VERSION,
    rules: (raw.rules || []).map(rule => normalizeRecommendationRule(rule, now)).filter(Boolean),
    stopWords: [...new Set((raw.stopWords || []).map(word => String(word || '').trim()).filter(Boolean))].slice(0, 500),
    feedback: (raw.feedback || []).filter(item => item && Number(item.createdAt) >= cutoffFeedback).slice(-RECOMMENDATION_MAX_FEEDBACK),
    snapshots: (raw.snapshots || []).filter(item => item && Number(item.createdAt) >= cutoffSnapshots).slice(-RECOMMENDATION_MAX_SNAPSHOTS),
    reviewQueue: (raw.reviewQueue || [])
      .map(item => normalizeRecommendationReviewItem(item, now))
      .filter(Boolean)
      .slice(-RECOMMENDATION_MAX_REVIEWS),
    stats: { ...base.stats, ...(raw.stats || {}) },
    history: Array.isArray(raw.history) ? raw.history.slice(-200) : [],
  };
}

function migrateLegacyRecommendationStore(dynamicRules, reviewQueue, learningStats, now = Date.now()) {
  const store = emptyRecommendationStore(now);
  const dynamic = dynamicRules && typeof dynamicRules === 'object' ? dynamicRules : {};
  for (const rule of dynamic.domainRules || []) {
    for (const rawDomain of rule?.domains || []) {
      const domain = String(rawDomain || '').trim().toLowerCase();
      if (!domain) continue;
      const slashIndex = domain.indexOf('/');
      if (slashIndex > 0) {
        const hostname = domain.slice(0, slashIndex).replace(/^www\./, '');
        const path = `/${domain.slice(slashIndex + 1).replace(/^\/+|\/+$/g, '')}`;
        if (self.BookmarkRecommendationCore?.isValidDomainPattern(hostname) && path.length > 1) {
          store.rules.push(normalizeRecommendationRule({
            kind: 'domain_path_tag', pattern: `${hostname}${path}`, target: rule.tag,
            source: 'user', state: 'active', createdAt: now,
          }, now));
        }
        continue;
      }
      store.rules.push(normalizeRecommendationRule({
        kind: 'domain_tag', pattern: domain, target: rule.tag, source: 'user', state: 'active', createdAt: now,
      }, now));
    }
  }
  for (const rule of dynamic.urlPathRules || []) {
    for (const rawPattern of rule?.patterns || []) {
      const pattern = String(rawPattern || '').trim().toLowerCase();
      if (!pattern || !pattern.includes('/')) continue;
      store.rules.push(normalizeRecommendationRule({
        kind: 'path_tag', pattern, target: rule.tag, source: 'user', state: 'active', createdAt: now,
      }, now));
    }
  }
  for (const [tag, keywords] of Object.entries(dynamic.keywordRules || {})) {
    for (const rawKeyword of keywords || []) {
      const keyword = String(rawKeyword || '').trim().toLowerCase();
      if (!keyword) continue;
      store.rules.push(normalizeRecommendationRule({
        kind: 'keyword_tag', pattern: keyword, target: tag, source: 'user', state: 'active', createdAt: now,
      }, now));
    }
  }
  for (const [domain, info] of Object.entries(dynamic.learnedDomainTag || {})) {
    const target = typeof info === 'object' ? info?.tag : info;
    if (!domain || !target) continue;
    store.rules.push(normalizeRecommendationRule({
      kind: 'domain_tag', pattern: domain, target, source: 'legacy', state: 'candidate',
      legacyCount: typeof info === 'object' ? info?.count : 1, createdAt: now,
    }, now));
  }
  store.stopWords = [...new Set((dynamic.stopWords || []).map(String).filter(Boolean))].slice(0, 500);
  store.reviewQueue = (Array.isArray(reviewQueue) ? reviewQueue : []).slice(0, 200).map(item => ({ ...item, legacy: true }));
  if (learningStats && typeof learningStats === 'object') {
    store.stats.total = Number(learningStats.totalReviewed) || 0;
    store.stats.accepted = Number(learningStats.totalAccepted) || 0;
    store.stats.modified = Number(learningStats.totalModified) || 0;
    store.stats.rejected = Number(learningStats.totalIgnored) || 0;
  }
  store.rules = store.rules.filter(Boolean);
  return normalizeRecommendationStore(store, now);
}

async function ensureRecommendationStore() {
  return mutateStorageResource(RECOMMENDATION_STORE_KEY, async (current) => {
    if (current?.version === RECOMMENDATION_STORE_VERSION) return normalizeRecommendationStore(current);
    const legacy = await chrome.storage.local.get(['tag_dynamic_rules', 'tag_review_queue', 'tag_learning_stats']);
    return migrateLegacyRecommendationStore(
      legacy.tag_dynamic_rules,
      legacy.tag_review_queue,
      legacy.tag_learning_stats,
    );
  });
}

function recomputeLearnedRuleStates(rules, kind, pattern, now = Date.now()) {
  const group = rules.filter(rule => rule.source !== 'user'
    && rule.kind === kind
    && rule.pattern === pattern
    && !['disabled', 'deleted'].includes(rule.state));
  const supportedTargets = group.filter(rule => rule.positiveFingerprints.length > 0);
  const hasCompetition = new Set(supportedTargets.map(rule => rule.target.toLowerCase())).size > 1;
  for (const rule of group) {
    if (hasCompetition) rule.state = 'conflicted';
    else if (rule.positiveFingerprints.length >= 2) rule.state = 'active';
    else rule.state = 'candidate';
    rule.updatedAt = now;
  }
}

function recordRecommendationRuleEvidence(store, descriptor, fingerprint, direction, now = Date.now()) {
  if (!descriptor?.kind || !descriptor?.pattern || !descriptor?.target || !fingerprint) return;
  const kind = String(descriptor.kind);
  const pattern = String(descriptor.pattern).trim().toLowerCase();
  const target = String(descriptor.target).trim();
  if (!pattern || !target) return;
  let rule = store.rules.find(item => item.source === 'learned'
    && item.kind === kind && item.pattern === pattern && item.target.toLowerCase() === target.toLowerCase());
  if (!rule) {
    rule = normalizeRecommendationRule({ kind, pattern, target, source: 'learned', state: 'candidate', createdAt: now }, now);
    store.rules.push(rule);
  }
  if (direction === 'negative') {
    if (rule.state === 'active') rule.positiveFingerprints = [];
    if (!rule.negativeFingerprints.includes(fingerprint)) rule.negativeFingerprints.push(fingerprint);
    rule.positiveFingerprints = rule.positiveFingerprints.filter(item => item !== fingerprint);
  } else {
    if (!rule.positiveFingerprints.includes(fingerprint)) rule.positiveFingerprints.push(fingerprint);
    rule.negativeFingerprints = rule.negativeFingerprints.filter(item => item !== fingerprint);
  }
  rule.positiveFingerprints = rule.positiveFingerprints.slice(-100);
  rule.negativeFingerprints = rule.negativeFingerprints.slice(-100);
  recomputeLearnedRuleStates(store.rules, kind, pattern, now);
}

function recommendationDescriptors(snapshot, selection) {
  const domain = String(snapshot?.domain || '').trim().toLowerCase();
  if (!domain) return [];
  const descriptors = [];
  const folderPath = normalizeBookmarkFolderPath(selection?.folderPath || '');
  if (folderPath) descriptors.push({ kind: 'domain_folder', pattern: domain, target: folderPath });
  for (const tag of normalizeTagList(selection?.tags || [])) {
    descriptors.push({ kind: 'domain_tag', pattern: domain, target: tag });
  }
  return descriptors;
}

function applyRecommendationFeedbackToStore(store, feedback, snapshot) {
  if (feedback.outcome === 'cancelled') return;
  const original = {
    folderPath: snapshot?.selectedFolderPath
      || snapshot?.folders?.find(item => item.confidence === 'high')?.folderPath
      || '',
    tags: Array.isArray(snapshot?.selectedTags)
      ? snapshot.selectedTags
      : (snapshot?.tags || []).filter(item => item.confidence === 'high').slice(0, 1).map(item => item.tag).filter(Boolean),
  };
  const finalSelection = feedback.selection || {};
  const changedFields = new Set(feedback.changedFields || []);
  if (feedback.outcome === 'rejected') {
    for (const descriptor of recommendationDescriptors(snapshot, original)) {
      recordRecommendationRuleEvidence(store, descriptor, feedback.urlFingerprint, 'negative', feedback.createdAt);
    }
    return;
  }
  if (feedback.outcome === 'modified') {
    const originalForChangedFields = {
      folderPath: changedFields.has('folder') ? original.folderPath : '',
      tags: changedFields.has('tags') ? original.tags : [],
    };
    for (const descriptor of recommendationDescriptors(snapshot, originalForChangedFields)) {
      recordRecommendationRuleEvidence(store, descriptor, feedback.urlFingerprint, 'negative', feedback.createdAt);
    }
  }
  for (const descriptor of recommendationDescriptors(snapshot, finalSelection)) {
    recordRecommendationRuleEvidence(store, descriptor, feedback.urlFingerprint, 'positive', feedback.createdAt);
  }
}

function rebuildRecommendationRulesFromFeedback(store) {
  store.rules = store.rules.filter(rule => rule.source !== 'learned');
  for (const feedback of store.feedback.filter(item => !item.undone).sort((a, b) => a.createdAt - b.createdAt)) {
    const snapshot = store.snapshots.find(item => item.recommendationId === feedback.recommendationId) || feedback.snapshot;
    if (snapshot) applyRecommendationFeedbackToStore(store, feedback, snapshot);
  }
  return store;
}

async function persistRecommendationSnapshot(recommendation, bookmark) {
  const now = Date.now();
  const url = normalizeRecommendationUrl(bookmark?.url || '');
  let pathSegments = [];
  try {
    pathSegments = new URL(url).pathname.split('/').map(segment => segment.trim().toLowerCase()).filter(Boolean).slice(0, 8);
  } catch {}
  const snapshot = {
    recommendationId: recommendation.recommendationId,
    ruleVersion: recommendation.ruleVersion,
    urlFingerprint: recommendationUrlFingerprint(url),
    domain: String(bookmark?.domain || extractDomain(url) || '').toLowerCase(),
    pathSegments,
    tags: (recommendation.tags || []).map(item => ({ tag: item.tag, support: item.support, confidence: item.confidence })),
    folders: (recommendation.folders || []).map(item => ({
      id: item.id || item.folderId || '', folderPath: item.folderPath || item.path || '', existing: !!item.exists,
      support: item.support, confidence: item.confidence,
      localEvidence: item.localEvidence ? {
        pageContentUsed: item.localEvidence.pageContentUsed === true,
        pageFields: (item.localEvidence.pageFields || []).slice(0, 12),
        matchedTerms: (item.localEvidence.matchedTerms || []).slice(0, 8),
        sampledCount: Number(item.localEvidence.sampledCount) || 0,
        contentSampleCount: Number(item.localEvidence.contentSampleCount) || 0,
        matchedSampleCount: Number(item.localEvidence.matchedSampleCount) || 0,
        matchedSampleTitles: (item.localEvidence.matchedSampleTitles || []).slice(0, 3),
        folderNameMatched: item.localEvidence.folderNameMatched === true,
      } : undefined,
    })),
    selectedTags: normalizeTagList(recommendation.selectedTags || (
      recommendation.tags?.[0]?.confidence === 'high' ? [recommendation.tags[0].tag] : []
    )),
    selectedFolderPath: normalizeBookmarkFolderPath(recommendation.selectedFolderPath || ''),
    createdAt: now,
  };
  await mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
    const store = normalizeRecommendationStore(current, now);
    store.snapshots = [...store.snapshots.filter(item => item.recommendationId !== snapshot.recommendationId), snapshot]
      .slice(-RECOMMENDATION_MAX_SNAPSHOTS);
    return store;
  });
  return snapshot;
}

async function submitRecommendationFeedback(payload = {}) {
  const operationId = String(payload.operationId || '').trim();
  if (!operationId) return { success: false, error: 'missing_operation_id' };
  let removedReviews = 0;
  return runIdempotentOperation('recommendation_feedback', operationId, () => mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
    const now = Date.now();
    const store = normalizeRecommendationStore(current, now);
    const existing = store.feedback.find(item => item.operationId === operationId);
    if (existing) return store;
    const snapshot = store.snapshots.find(item => item.recommendationId === payload.recommendationId);
    if (!snapshot) return store;
    const outcome = ['accepted', 'modified', 'rejected', 'cancelled'].includes(payload.outcome)
      ? payload.outcome
      : 'cancelled';
    const feedback = {
      id: makeRecommendationId('feedback'),
      operationId,
      recommendationId: snapshot.recommendationId,
      urlFingerprint: snapshot.urlFingerprint,
      outcome,
      changedFields: [...new Set((payload.changedFields || []).filter(field => field === 'folder' || field === 'tags'))],
      selection: {
        folderPath: normalizeBookmarkFolderPath(payload.selection?.folderPath || ''),
        tags: normalizeTagList(payload.selection?.tags || []),
      },
      snapshot,
      createdAt: now,
    };
    const bookmarkId = String(payload.bookmarkId || '').trim();
    if (bookmarkId) {
      const remaining = store.reviewQueue.filter(item => item.bookmarkId !== bookmarkId);
      removedReviews = store.reviewQueue.length - remaining.length;
      store.reviewQueue = remaining;
    }
    store.feedback.push(feedback);
    store.feedback = store.feedback.slice(-RECOMMENDATION_MAX_FEEDBACK);
    store.stats.total += 1;
    store.stats[outcome] = (store.stats[outcome] || 0) + 1;
    store.stats.lastFeedbackAt = now;
    applyRecommendationFeedbackToStore(store, feedback, snapshot);
    store.history.push({ id: feedback.id, type: 'feedback', outcome, createdAt: now });
    store.history = store.history.slice(-200);
    return store;
  }).then((store) => {
    if (removedReviews > 0) {
      chrome.runtime.sendMessage({ action: 'recommendationReviewQueueChanged', count: store.reviewQueue.length }).catch(() => {});
    }
    const found = store.feedback.find(item => item.operationId === operationId);
    return found ? { success: true, feedbackId: found.id, outcome: found.outcome } : { success: false, error: 'recommendation_not_found' };
  }));
}

async function submitLegacyTagReviewFeedback(queueItem, confirmedTags, reviewAction, operationId) {
  if (!queueItem || (!queueItem.id && !queueItem.url)) return { success: false, error: 'review_item_not_found' };
  const recommendationId = stableRecommendationId('legacy_review', queueItem.id || queueItem.url);
  const suggestedTags = normalizeTagList(queueItem.suggestedTags || []);
  const selectedTags = normalizeTagList(confirmedTags || []);
  const recommendation = {
    version: 2,
    recommendationId,
    ruleVersion: self.BookmarkRecommendationCore?.RULE_VERSION || 'bookmark-recommendation-v3',
    tags: suggestedTags.map((tag, index) => ({
      tag,
      support: Math.max(0.35, Number(queueItem.confidence) || 0.35),
      confidence: queueItem.confidence >= 0.78 ? 'high' : (queueItem.confidence >= 0.58 ? 'medium' : 'low'),
      rank: index + 1,
    })),
    folders: [],
  };
  await persistRecommendationSnapshot(recommendation, {
    url: queueItem.url || '',
    domain: queueItem.domain || extractDomain(queueItem.url || ''),
  });
  const sameTags = suggestedTags.map(tag => tag.toLowerCase()).join('\u0000')
    === selectedTags.map(tag => tag.toLowerCase()).join('\u0000');
  const outcome = reviewAction === 'ignored'
    ? 'rejected'
    : (reviewAction === 'accepted' && sameTags ? 'accepted' : 'modified');
  const result = await submitRecommendationFeedback({
    operationId,
    recommendationId,
    outcome,
    changedFields: outcome === 'modified' ? ['tags'] : [],
    selection: { tags: selectedTags },
  });
  if (result.success && queueItem.id) await discardRecommendationReviewItem(queueItem.id);
  return result;
}

async function getRecommendationLearningState() {
  const store = await ensureRecommendationStore();
  const snapshots = new Map(store.snapshots.map(item => [item.recommendationId, item]));
  return {
    version: store.version,
    rules: store.rules.filter(rule => rule.state !== 'deleted'),
    stats: store.stats,
    reviewQueue: store.reviewQueue.map((item) => {
      if (item.legacy) return item;
      const snapshot = snapshots.get(item.recommendationId);
      return {
        ...item,
        recommendation: snapshot ? {
          recommendationId: snapshot.recommendationId,
          ruleVersion: snapshot.ruleVersion,
          tags: snapshot.tags || [],
          folders: snapshot.folders || [],
          selectedTags: snapshot.selectedTags || [],
          selectedFolderPath: snapshot.selectedFolderPath || '',
        } : null,
      };
    }),
    recentFeedback: store.feedback.slice(-100).reverse().map(item => ({
      id: item.id,
      operationId: item.operationId,
      recommendationId: item.recommendationId,
      urlFingerprint: item.urlFingerprint,
      domain: String(item.snapshot?.domain || ''),
      outcome: item.outcome,
      changedFields: item.changedFields || [],
      selection: item.selection || { folderPath: '', tags: [] },
      createdAt: item.createdAt,
      undone: item.undone === true,
    })),
  };
}

async function enqueueRecommendationReviewItem(item) {
  const now = Date.now();
  let review = null;
  const store = await mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
    const next = normalizeRecommendationStore(current, now);
    review = normalizeRecommendationReviewItem({ ...item, createdAt: item.createdAt || now, updatedAt: now }, now);
    if (!review) return next;
    next.reviewQueue = next.reviewQueue.filter(existing => existing.id !== review.id
      && !(existing.type === review.type && existing.bookmarkId === review.bookmarkId));
    next.reviewQueue.push(review);
    next.reviewQueue = next.reviewQueue.slice(-RECOMMENDATION_MAX_REVIEWS);
    return next;
  });
  if (review) {
    chrome.runtime.sendMessage({ action: 'recommendationReviewQueueChanged', count: store.reviewQueue.length }).catch(() => {});
  }
  return review;
}

async function discardRecommendationReviewItem(reviewId) {
  const id = String(reviewId || '').trim();
  if (!id) return false;
  let removed = false;
  const store = await mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
    const next = normalizeRecommendationStore(current);
    const remaining = next.reviewQueue.filter(item => item.id !== id);
    removed = remaining.length !== next.reviewQueue.length;
    next.reviewQueue = remaining;
    return next;
  });
  if (removed) {
    chrome.runtime.sendMessage({ action: 'recommendationReviewQueueChanged', count: store.reviewQueue.length }).catch(() => {});
  }
  return removed;
}

async function clearRecommendationReviewQueue(operationId) {
  const id = String(operationId || '').trim() || makeRecommendationId('clear_reviews');
  return runIdempotentOperation('recommendation_review_clear', id, async () => {
    await mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
      const store = normalizeRecommendationStore(current);
      store.reviewQueue = [];
      return store;
    });
    chrome.runtime.sendMessage({ action: 'recommendationReviewQueueChanged', count: 0 }).catch(() => {});
    return { success: true };
  });
}

async function clearRecommendationLearning(operationId) {
  const id = String(operationId || '').trim();
  if (!id) return { success: false, error: 'missing_operation_id' };
  return runIdempotentOperation('recommendation_learning_clear', id, () => mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
    const now = Date.now();
    const store = normalizeRecommendationStore(current, now);
    const feedbackCount = store.feedback.length;
    const learnedRuleCount = store.rules.filter(rule => rule.source === 'learned').length;
    store.feedback = [];
    store.rules = store.rules.filter(rule => rule.source !== 'learned');
    store.stats = { ...emptyRecommendationStore(now).stats };
    store.history = store.history.filter(item => !['feedback', 'undo', 'rebuild'].includes(item.type));
    if (!store.history.some(item => item.id === id)) {
      store.history.push({ id, type: 'clear_learning', feedbackCount, learnedRuleCount, createdAt: now });
    }
    store.history = store.history.slice(-200);
    return store;
  }).then((store) => {
    chrome.runtime.sendMessage({ action: 'recommendationLearningChanged' }).catch(() => {});
    return {
      success: true,
      stats: store.stats,
      feedbackCount: store.feedback.length,
      learnedRuleCount: store.rules.filter(rule => rule.source === 'learned').length,
    };
  }));
}

async function resolveRecommendationReview(payload = {}) {
  const operationId = String(payload.operationId || '').trim();
  const reviewId = String(payload.reviewId || '').trim();
  const decision = String(payload.decision || '').trim();
  if (!operationId) return { success: false, error: 'missing_operation_id' };
  if (!reviewId || !['accept', 'reject', 'ignore'].includes(decision)) {
    return { success: false, error: 'invalid_review_resolution' };
  }
  return runIdempotentOperation('recommendation_review', operationId, async () => {
    const store = await ensureRecommendationStore();
    const review = store.reviewQueue.find(item => item.id === reviewId && !item.legacy);
    if (!review) return { success: false, error: 'review_item_not_found' };
    const snapshot = store.snapshots.find(item => item.recommendationId === review.recommendationId);

    if (decision === 'ignore') {
      await discardRecommendationReviewItem(review.id);
      return { success: true, decision };
    }
    if (!snapshot) return { success: false, error: 'recommendation_not_found' };

    if (review.type === 'move_observation') {
      if (decision !== 'accept') {
        await discardRecommendationReviewItem(review.id);
        return { success: true, decision: 'ignore' };
      }
      const feedback = await submitRecommendationFeedback({
        operationId: `${operationId}:feedback`,
        recommendationId: review.recommendationId,
        bookmarkId: review.bookmarkId,
        outcome: 'accepted',
        changedFields: [],
        selection: { folderPath: review.toFolderPath, tags: [] },
      });
      return feedback.success ? { success: true, decision } : feedback;
    }

    const [nativeBookmark] = await chrome.bookmarks.get(review.bookmarkId).catch(() => []);
    if (!nativeBookmark?.url || recommendationUrlFingerprint(nativeBookmark.url) !== snapshot.urlFingerprint) {
      return { success: false, error: 'bookmark_changed' };
    }

    if (decision === 'reject') {
      const feedback = await submitRecommendationFeedback({
        operationId: `${operationId}:feedback`,
        recommendationId: review.recommendationId,
        bookmarkId: review.bookmarkId,
        outcome: 'rejected',
        changedFields: [],
        selection: {},
      });
      return feedback.success ? { success: true, decision } : feedback;
    }

    const storedBookmarks = await getStoredBookmarks();
    const storedBookmark = storedBookmarks.find(item => item.id === review.bookmarkId);
    if (!storedBookmark) return { success: false, error: 'bookmark_not_found' };
    const currentTags = normalizeTagList(storedBookmark.tags || []);
    const sourceTags = normalizeTagList(review.sourceTags || []);
    if ((review.sourceParentId && nativeBookmark.parentId !== review.sourceParentId)
      || currentTags.join('\u0000').toLowerCase() !== sourceTags.join('\u0000').toLowerCase()) {
      return { success: false, error: 'bookmark_changed' };
    }

    const folderCandidate = snapshot.folders?.[0];
    const tagCandidate = snapshot.tags?.[0];
    let targetFolder = null;
    if (folderCandidate?.existing && folderCandidate.id) {
      const folderOptions = await loadBookmarkFolderOptions().catch(() => []);
      targetFolder = folderOptions.find(item => item.id === folderCandidate.id) || null;
      if (!targetFolder || normalizeBookmarkFolderPath(targetFolder.path) !== normalizeBookmarkFolderPath(folderCandidate.folderPath)) {
        return { success: false, error: 'folder_selection_mismatch' };
      }
    }
    const recommendedTags = normalizeTagList(tagCandidate?.tag ? [tagCandidate.tag] : []);
    const finalTags = normalizeTagList([...(storedBookmark.tags || []), ...recommendedTags]);
    if (!targetFolder && recommendedTags.length === 0) return { success: false, error: 'no_applicable_candidate' };

    let moved = false;
    try {
      if (targetFolder && nativeBookmark.parentId !== targetFolder.id) {
        markProgrammaticBookmarkMove(review.bookmarkId, targetFolder.id);
        await chrome.bookmarks.move(review.bookmarkId, { parentId: targetFolder.id });
        moved = true;
      }
      await mutateStoredBookmarks((bookmarks) => bookmarks.map(item => item.id !== review.bookmarkId ? item : {
        ...item,
        parentId: targetFolder?.id || item.parentId,
        folderName: targetFolder?.title || item.folderName,
        folderPath: targetFolder?.path || item.folderPath,
        tags: finalTags,
        tagsAuto: finalTags,
      }));

      const finalFolderPath = targetFolder?.path || normalizeBookmarkFolderPath(storedBookmark.folderPath || '');
      const originalFolderPath = normalizeBookmarkFolderPath(snapshot.selectedFolderPath || '');
      const originalTags = normalizeTagList(snapshot.selectedTags || []);
      const changedFields = [];
      if (originalFolderPath !== finalFolderPath) changedFields.push('folder');
      if (originalTags.join('\u0000').toLowerCase() !== finalTags.join('\u0000').toLowerCase()) changedFields.push('tags');
      const feedback = await submitRecommendationFeedback({
        operationId: `${operationId}:feedback`,
        recommendationId: review.recommendationId,
        bookmarkId: review.bookmarkId,
        outcome: changedFields.length > 0 ? 'modified' : 'accepted',
        changedFields,
        selection: { folderPath: finalFolderPath, tags: finalTags },
      });
      if (!feedback.success) throw new Error(feedback.error || 'feedback_failed');
      chrome.runtime.sendMessage({ action: 'bookmarksUpdated', ids: [review.bookmarkId] }).catch(() => {});
      return { success: true, decision, moved, tags: finalTags, folderPath: finalFolderPath };
    } catch (error) {
      programmaticBookmarkMoves.delete(review.bookmarkId);
      if (moved && nativeBookmark.parentId) {
        markProgrammaticBookmarkMove(review.bookmarkId, nativeBookmark.parentId);
        await chrome.bookmarks.move(review.bookmarkId, { parentId: nativeBookmark.parentId }).catch(() => {});
      }
      await mutateStoredBookmarks((bookmarks) => bookmarks.map(item => item.id !== review.bookmarkId ? item : storedBookmark)).catch(() => {});
      return { success: false, error: error?.message || 'review_apply_failed' };
    }
  });
}

async function mutateRecommendationRule(payload = {}) {
  const operationId = String(payload.operationId || '').trim();
  if (!operationId) return { success: false, error: 'missing_operation_id' };
  return runIdempotentOperation('recommendation_rule', operationId, () => mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
    const now = Date.now();
    const store = normalizeRecommendationStore(current, now);
    if (store.history.some(item => item.id === operationId)) return store;
    if (payload.mutation === 'undo_last') {
      const feedback = [...store.feedback].reverse().find(item => !item.undone && item.outcome !== 'cancelled');
      if (feedback) {
        feedback.undone = true;
        store.stats.total = Math.max(0, (store.stats.total || 0) - 1);
        store.stats[feedback.outcome] = Math.max(0, (store.stats[feedback.outcome] || 0) - 1);
        store.stats.lastFeedbackAt = Math.max(0, ...store.feedback
          .filter(item => !item.undone)
          .map(item => Number(item.createdAt) || 0));
      }
      rebuildRecommendationRulesFromFeedback(store);
      store.history.push({ id: operationId, type: 'undo', feedbackId: feedback?.id || '', createdAt: now });
      return store;
    }
    const rule = store.rules.find(item => item.id === payload.ruleId);
    if (!rule) return store;
    if (payload.mutation === 'disable') {
      rule.state = 'disabled';
      rule.disabledAt = now;
    } else if (payload.mutation === 'restore') {
      rule.disabledAt = 0;
      recomputeLearnedRuleStates(store.rules, rule.kind, rule.pattern, now);
      if (rule.source === 'user') rule.state = 'active';
    } else if (payload.mutation === 'delete') {
      rule.state = 'deleted';
    }
    rule.updatedAt = now;
    store.history.push({ id: operationId, type: 'rule_mutation', ruleId: rule.id, mutation: payload.mutation, createdAt: now });
    return store;
  }).then(store => ({ success: true, rules: store.rules.filter(rule => rule.state !== 'deleted') })));
}

async function rebuildRecommendationLearning(operationId) {
  const id = String(operationId || '').trim();
  if (!id) return { success: false, error: 'missing_operation_id' };
  return runIdempotentOperation('recommendation_rebuild', id, () => mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
    const store = normalizeRecommendationStore(current);
    if (store.history.some(item => item.id === id)) return store;
    rebuildRecommendationRulesFromFeedback(store);
    store.history.push({ id, type: 'rebuild', createdAt: Date.now() });
    return store;
  }).then(store => ({ success: true, rules: store.rules.filter(rule => rule.state !== 'deleted') })));
}

function normalizeLegacyDynamicRules(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    ...value,
    domainRules: Array.isArray(value.domainRules) ? value.domainRules : [],
    urlPathRules: Array.isArray(value.urlPathRules) ? value.urlPathRules : [],
    keywordRules: value.keywordRules && typeof value.keywordRules === 'object' ? value.keywordRules : {},
    stopWords: Array.isArray(value.stopWords) ? value.stopWords : [],
    learnedDomainTag: value.learnedDomainTag && typeof value.learnedDomainTag === 'object' ? value.learnedDomainTag : {},
    seenDomains: Array.isArray(value.seenDomains) ? value.seenDomains : [],
  };
}

async function mutateLegacyDynamicRules(mutation) {
  const next = await mutateStorageResource('tag_dynamic_rules', (current) => mutation(normalizeLegacyDynamicRules(current)));
  if (typeof setDynamicRulesSnapshot === 'function') setDynamicRulesSnapshot(next);
  return next;
}

async function addRecommendationUserRule(kind, pattern, target) {
  return mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
    const store = normalizeRecommendationStore(current);
    const rule = normalizeRecommendationRule({ kind, pattern, target, source: 'user', state: 'active' });
    const existing = store.rules.find(item => item.source === 'user'
      && item.kind === rule.kind && item.pattern === rule.pattern && item.target.toLowerCase() === rule.target.toLowerCase());
    if (!existing) store.rules.push(rule);
    else existing.state = 'active';
    return store;
  });
}

async function deleteRecommendationUserRules(predicate) {
  return mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
    const store = normalizeRecommendationStore(current);
    for (const rule of store.rules) {
      if (rule.source === 'user' && predicate(rule)) rule.state = 'deleted';
    }
    return store;
  });
}

async function syncRecommendationUserRulesFromLegacy(rawRules) {
  const dynamic = normalizeLegacyDynamicRules(rawRules);
  return mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
    const store = normalizeRecommendationStore(current);
    store.rules = store.rules.filter(rule => rule.source !== 'user');
    const migrated = migrateLegacyRecommendationStore(dynamic, [], null);
    store.rules.push(...migrated.rules.filter(rule => rule.source === 'user'));
    store.stopWords = [...dynamic.stopWords];
    return store;
  });
}

const inFlightOperations = new Map();
const operationDomainQueues = new Map();
function runSerializedOperationDomain(domain, operation) {
  const previous = operationDomainQueues.get(domain) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  operationDomainQueues.set(domain, next);
  return next.finally(() => {
    if (operationDomainQueues.get(domain) === next) operationDomainQueues.delete(domain);
  });
}

async function runIdempotentOperation(type, operationId, operation) {
  const id = String(operationId || '').trim();
  if (!id) return operation();
  const key = `${type}:${id}`;
  const stored = await chrome.storage.local.get(STORAGE_KEY_OPERATION_RESULTS);
  const previous = Array.isArray(stored[STORAGE_KEY_OPERATION_RESULTS])
    ? stored[STORAGE_KEY_OPERATION_RESULTS].find((item) => item.key === key)
    : null;
  if (previous) return previous.result;
  if (inFlightOperations.has(key)) return inFlightOperations.get(key);
  const pending = Promise.resolve().then(operation).then(async (result) => {
    await mutateStorageResource(STORAGE_KEY_OPERATION_RESULTS, (current) => [
      { key, completedAt: Date.now(), result },
      ...(Array.isArray(current) ? current.filter((item) => item.key !== key) : []),
    ].slice(0, 50));
    return result;
  }).finally(() => inFlightOperations.delete(key));
  inFlightOperations.set(key, pending);
  return pending;
}

function makeBatchResult(items) {
  const succeeded = items.filter((item) => item.status === 'succeeded').length;
  const conflicts = items.filter((item) => item.status === 'conflict').length;
  const failed = items.length - succeeded - conflicts;
  return { total: items.length, succeeded, failed, conflicts, items };
}

function normalizeLabelCache(raw, now = Date.now()) {
  const entries = Object.entries(raw && typeof raw === 'object' ? raw : {})
    .filter(([, value]) => value && typeof value.summary === 'string' && Array.isArray(value.tags))
    .map(([key, value]) => [key, {
      ...value,
      cachedAt: Number.isFinite(Number(value.cachedAt)) ? Number(value.cachedAt) : now,
    }])
    .filter(([, value]) => now - value.cachedAt <= LABEL_CACHE_TTL_MS)
    .sort(([, left], [, right]) => right.cachedAt - left.cachedAt);
  const cache = {};
  let bytes = 0;
  for (const [key, value] of entries) {
    if (Object.keys(cache).length >= LABEL_CACHE_MAX_ENTRIES) break;
    const entryBytes = new TextEncoder().encode(JSON.stringify({ [key]: value })).length;
    if (bytes + entryBytes > LABEL_CACHE_MAX_BYTES) continue;
    cache[key] = value;
    bytes += entryBytes;
  }
  return cache;
}

async function getLabelCache() {
  return mutateStorageResource(LABEL_CACHE_KEY, (current) => normalizeLabelCache(current));
}

async function mergeLabelCache(entries) {
  return mutateStorageResource(LABEL_CACHE_KEY, (current) => normalizeLabelCache({
    ...(current && typeof current === 'object' ? current : {}),
    ...Object.fromEntries(entries || []),
  }));
}
function isSafeExternalUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096) return false;
  try {
    return /^(https?|ftp):$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * 在 Service Worker 中代理执行 AI 请求。SW 拥有 host 权限，跨域请求不触发浏览器
 * CORS 预检（OPTIONS），从根本上消除扩展页面直接 fetch 的"慢/报错"问题。
 * 仅接受 https/http 的 POST；返回 { ok, status, text }，解析仍由调用方负责。
 */
async function aiProxyFetch(request) {
  if (!request || typeof request !== 'object') throw new Error('invalid_ai_request');
  const url = typeof request.url === 'string' ? request.url : '';
  if (!isSafeExternalUrl(url) || !/^https?:$/.test(new URL(url).protocol)) {
    throw new Error('invalid_ai_request_url');
  }
  const headers = (request.headers && typeof request.headers === 'object') ? request.headers : {};
  const body = typeof request.body === 'string' ? request.body : '';
  const timeoutMs = Math.min(600000, Math.max(1000, Number(request.timeoutMs) || 90000));

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
      signal: controller.signal,
    });
    const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
    const rawText = await resp.text();
    // 流式（SSE）响应：把各家的增量 delta 聚合成完整文本，让上层解析与非流式一致。
    // 触发条件：Content-Type 为 event-stream，或响应体本身是 SSE 帧（data: 前缀）。
    const looksLikeSse = contentType.includes('text/event-stream')
      || /^\s*data:\s/.test(rawText);
    const text = (resp.ok && looksLikeSse) ? aggregateSseText(rawText) : rawText;
    return { ok: resp.ok, status: resp.status, text };
  } catch (err) {
    if (timedOut) {
      const e = new Error(`API 请求超时（${Math.round(timeoutMs / 1000)} 秒）`);
      e.name = 'TimeoutError';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 聚合 SSE 流式响应为完整文本。兼容三种主流增量格式：
 *  - OpenAI: data:{choices:[{delta:{content}}]}，以 data:[DONE] 结束
 *  - Anthropic: event: content_block_delta，data:{delta:{text}}
 *  - Gemini streamGenerateContent: data:{candidates:[{content:{parts:[{text}]}}]}
 * 返回拼接后的纯文本；分类侧的 extractJson 可像非流式一样从中提取 JSON。
 */
function aggregateSseText(rawText) {
  let output = '';
  const consumeChunk = (dataStr) => {
    const trimmed = dataStr.trim();
    if (!trimmed || trimmed === '[DONE]') return;
    let json;
    try { json = JSON.parse(trimmed); } catch { return; }
    // OpenAI 兼容
    const openaiDelta = json?.choices?.[0]?.delta?.content
      ?? json?.choices?.[0]?.delta?.reasoning_content
      ?? json?.choices?.[0]?.message?.content;
    if (typeof openaiDelta === 'string') { output += openaiDelta; return; }
    // Anthropic
    const anthropicDelta = json?.delta?.text ?? (json?.type === 'content_block_delta' ? json?.delta?.text : undefined);
    if (typeof anthropicDelta === 'string') { output += anthropicDelta; return; }
    // Gemini
    const geminiParts = json?.candidates?.[0]?.content?.parts;
    if (Array.isArray(geminiParts)) {
      for (const part of geminiParts) if (typeof part?.text === 'string') output += part.text;
    }
  };
  // aiProxyFetch 已 await resp.text() 拿到完整响应体，这里按 SSE 行解析 data: 帧即可。
  for (const line of String(rawText || '').split(/\r?\n/)) {
    const m = /^data:\s?(.*)$/.exec(line.trim());
    if (m) consumeChunk(m[1]);
  }
  return output;
}

function hasValidStringList(value, maxItems = 50, maxLength = 120) {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= maxLength);
}

function validateRuntimeMessage(message) {
  if (message.action !== undefined && typeof message.action !== 'string') return 'invalid_action';
  if (message.ownerId !== undefined && (
    typeof message.ownerId !== 'string'
    || message.ownerId.length < 16
    || message.ownerId.length > 128
    || !/^[a-zA-Z0-9-]+$/.test(message.ownerId)
  )) return 'invalid_owner_id';
  if (message.id !== undefined && (typeof message.id !== 'string' || message.id.length > 256)) return 'invalid_id';
  if (message.bookmarkId !== undefined && (typeof message.bookmarkId !== 'string' || message.bookmarkId.length > 256)) return 'invalid_bookmark_id';
  if (message.reviewId !== undefined && (typeof message.reviewId !== 'string' || message.reviewId.length > 256)) return 'invalid_review_id';
  if (message.decision !== undefined && !['accept', 'reject', 'ignore'].includes(message.decision)) return 'invalid_review_decision';
  if (message.feedId !== undefined && (typeof message.feedId !== 'string' || message.feedId.length > 256)) return 'invalid_feed_id';
  if (message.operationId !== undefined && (typeof message.operationId !== 'string' || message.operationId.length > 256)) return 'invalid_operation_id';
  if (message.requestId !== undefined && (typeof message.requestId !== 'string' || message.requestId.length > 256)) return 'invalid_request_id';
  if (message.title !== undefined && (typeof message.title !== 'string' || message.title.length > 512)) return 'invalid_title';
  if (message.error !== undefined && (typeof message.error !== 'string' || message.error.length > 512)) return 'invalid_error';
  if (message.url !== undefined && !isSafeExternalUrl(message.url)) return 'invalid_url';
  if (message.request !== undefined) {
    const r = message.request;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return 'invalid_request';
    if (!isSafeExternalUrl(r.url)) return 'invalid_request';
    if (r.method !== undefined && !['GET', 'POST'].includes(r.method)) return 'invalid_request';
    if (r.headers !== undefined && (typeof r.headers !== 'object' || r.headers === null || Array.isArray(r.headers) || Object.keys(r.headers).length > 40)) return 'invalid_request';
    const bodyStr = typeof r.body === 'string' ? r.body : (r.body !== undefined ? JSON.stringify(r.body) : '');
    if (bodyStr.length > 5 * 1024 * 1024) return 'invalid_request';
  }
  if (message.ids !== undefined && !hasValidStringList(message.ids, 500, 256)) return 'invalid_ids';
  if (message.entries !== undefined && (
    !Array.isArray(message.entries)
    || message.entries.length > 500
    || !message.entries.every((entry) => entry
      && typeof entry.id === 'string'
      && entry.id.length > 0
      && entry.id.length <= 256
      && Number.isFinite(Number(entry.createdAt)))
  )) return 'invalid_entries';
  if (message.cacheEntries !== undefined) {
    if (!Array.isArray(message.cacheEntries) || message.cacheEntries.length > LABEL_CACHE_MAX_ENTRIES) return 'invalid_cache_entries';
    if (!message.cacheEntries.every((entry) => Array.isArray(entry)
      && entry.length === 2
      && typeof entry[0] === 'string'
      && entry[0].length > 0
      && entry[0].length <= 256
      && entry[1]
      && typeof entry[1] === 'object')) return 'invalid_cache_entries';
    if (new TextEncoder().encode(JSON.stringify(message.cacheEntries)).length > LABEL_CACHE_MAX_BYTES) return 'invalid_cache_entries';
  }
  for (const key of ['tags', 'addTags', 'removeTags', 'urls', 'orderedIds', 'folderPaths']) {
    if (message[key] !== undefined && !hasValidStringList(message[key], key === 'urls' ? 50 : 500, key === 'urls' ? 4096 : 120)) return `invalid_${key}`;
  }
  if (Array.isArray(message.urls) && !message.urls.every(isSafeExternalUrl)) return 'invalid_urls';
  return null;
}
async function getStoredBookmarks() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function getTombstones() {
  const result = await chrome.storage.local.get(STORAGE_KEY_TOMBSTONES);
  return result[STORAGE_KEY_TOMBSTONES] || [];
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
  await mutateStorageResource(STORAGE_KEY_SETTINGS, (current) => ({
    tombstoneRetentionDays: DEFAULT_TOMBSTONE_RETENTION_DAYS,
    ...(current || {}),
    ...patch,
  }));
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
  const item = {
    id: record.id || 'hsf_' + Date.now(),
    score: record.score,
    level: record.level,
    details: record.details || [],
    range: record.range || null,
    note: record.note || '',
    createdAt: record.createdAt || Date.now()
  };
  let saved = false;
  await mutateStorageResource(HEALTH_SCORE_FAVORITES_KEY, (current) => {
    const favorites = Array.isArray(current) ? current : [];
    const sameDay = favorites.some(f => (
      new Date(f.createdAt).toDateString() === new Date(item.createdAt).toDateString()
      && f.score === item.score
    ));
    if (sameDay) return favorites;
    saved = true;
    return [item, ...favorites].slice(0, 50);
  });
  return saved ? { success: true, favorite: item } : { success: false, error: 'already_exists' };
}

async function deleteHealthScoreFavorite(id) {
  await mutateStorageResource(HEALTH_SCORE_FAVORITES_KEY, (current) => (
    (Array.isArray(current) ? current : []).filter(f => f.id !== id)
  ));
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

async function deleteHealthBookmarks(ids, operationId) {
  return runIdempotentOperation('health-delete', operationId, () => runSerializedOperationDomain('health', async () => {
    const requestedIds = [...new Set((ids || []).filter(Boolean))];
    const mirror = await getStoredBookmarks();
    const mirrorById = new Map(mirror.map((item) => [item.id, item]));
    const records = [];
    const items = [];
    for (const id of requestedIds) {
      try {
        const [node] = await chrome.bookmarks.get(id);
        if (!node?.url || node.parentId == null) throw new Error('bookmark_not_found');
        const duplicates = await chrome.bookmarks.search({ url: node.url }).catch(() => []);
        const record = {
          ...(mirrorById.get(id) || {}),
          id: node.id,
          title: node.title || '',
          url: node.url,
          parentId: node.parentId,
          index: Number.isInteger(node.index) ? node.index : 0,
          removedAt: Date.now(),
          existingDuplicateIds: duplicates.filter((item) => item.id !== id).map((item) => item.id),
        };
        await chrome.bookmarks.remove(id);
        records.push(record);
        items.push({ id, status: 'succeeded' });
        await addTombstone({ ...record, deletedFrom: 'health-check' });
      } catch (error) {
        items.push({ id, status: 'failed', reason: error?.message || 'bookmark_delete_failed' });
      }
    }
    if (records.length) {
      await mutateStorageResource(STORAGE_KEY_HEALTH_UNDO, () => records);
      const removedIds = new Set(records.map((record) => record.id));
      await mutateStoredBookmarks((bookmarks) => bookmarks.filter((item) => !removedIds.has(item.id)));
    }
    return { success: items.every((item) => item.status === 'succeeded'), operationId, ...makeBatchResult(items) };
  }));
}

async function undoHealthBookmarks(operationId) {
  return runIdempotentOperation('health-undo', operationId, () => runSerializedOperationDomain('health', async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY_HEALTH_UNDO);
    const records = Array.isArray(stored[STORAGE_KEY_HEALTH_UNDO]) ? stored[STORAGE_KEY_HEALTH_UNDO] : [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const pending = [];
    const items = [];
    for (const record of records.slice().sort((left, right) => (left.index || 0) - (right.index || 0))) {
      if ((record.removedAt || 0) < cutoff) {
        items.push({ id: record.id, status: 'failed', reason: 'undo_record_expired' });
        continue;
      }
      try {
        const currentDuplicates = await chrome.bookmarks.search({ url: record.url }).catch(() => []);
        const knownIds = new Set(record.existingDuplicateIds || []);
        const newDuplicate = currentDuplicates.find((item) => !knownIds.has(item.id));
        if (newDuplicate) {
          pending.push(record);
          items.push({ id: record.id, status: 'conflict', reason: 'bookmark_recreated_after_delete' });
          continue;
        }
        const [parent] = await chrome.bookmarks.get(record.parentId);
        if (!parent || parent.url) throw new Error('original_parent_unavailable');
        const created = await chrome.bookmarks.create({
          parentId: record.parentId,
          title: record.title,
          url: record.url,
          index: Number.isInteger(record.index) ? record.index : undefined,
        });
        await upsertImportedBookmark(created, record);
        items.push({ id: record.id, restoredId: created.id, status: 'succeeded' });
      } catch (error) {
        pending.push(record);
        items.push({ id: record.id, status: 'failed', reason: error?.message || 'bookmark_restore_failed' });
      }
    }
    await mutateStorageResource(STORAGE_KEY_HEALTH_UNDO, () => pending.length ? pending : undefined);
    return { success: pending.length === 0, operationId, ...makeBatchResult(items) };
  }));
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

async function buildBookmarkExportTree() {
  const [tree, stored] = await Promise.all([chrome.bookmarks.getTree(), getStoredBookmarks()]);
  const metadataById = new Map(stored.map((item) => [item.id, item]));
  const mapNode = (node, folderPath = '') => {
    if (node.url) {
      const metadata = metadataById.get(node.id) || {};
      return {
        type: 'bookmark',
        title: node.title || node.url,
        url: node.url,
        dateAdded: metadata.dateAdded || node.dateAdded || Date.now(),
        folderPath: metadata.folderPath || normalizeBookmarkFolderPath(folderPath),
        metadata: {
          tags: BookmarkData.normalizeTags(metadata.tags),
          pinned: !!metadata.pinned,
          pinnedAt: metadata.pinnedAt || null,
          contentText: metadata.contentText || '',
          contentTitle: metadata.contentTitle || '',
          contentExcerpt: metadata.contentExcerpt || '',
          contentMetaDesc: metadata.contentMetaDesc || '',
          contentMetaKeywords: Array.isArray(metadata.contentMetaKeywords) ? metadata.contentMetaKeywords : [],
          contentHeadings: Array.isArray(metadata.contentHeadings) ? metadata.contentHeadings : [],
          contentStructuredTypes: Array.isArray(metadata.contentStructuredTypes) ? metadata.contentStructuredTypes : [],
          contentFetchedAt: metadata.contentFetchedAt || null,
          contentStatus: metadata.contentStatus || 'pending',
          contentFailureReason: metadata.contentFailureReason || '',
          contentSource: metadata.contentSource || '',
        },
      };
    }
    const nextPath = joinBookmarkFolderPath(folderPath, node.title);
    return {
      type: 'folder',
      title: node.title || '',
      dateAdded: node.dateAdded || null,
      children: (node.children || []).map((child) => mapNode(child, nextPath)),
    };
  };
  return (tree[0]?.children || []).map((node) => mapNode(node, ''));
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
  const importedDateAdded = Number(metadata.dateAdded);
  if (Number.isFinite(importedDateAdded) && importedDateAdded > 0) imported.dateAdded = importedDateAdded;
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

  let saved = imported;
  await mutateStoredBookmarks((stored) => {
    const position = stored.findIndex(item => item.id === imported.id);
    const next = stored.slice();
    if (position >= 0) {
      const previous = stored[position];
      saved = {
        ...previous,
        ...imported,
        tags: BookmarkData.normalizeTags([...(previous.tags || []), ...imported.tags]),
        tagsAuto: BookmarkData.normalizeTags([...(previous.tagsAuto || []), ...imported.tagsAuto]),
        pinned: previous.pinned || imported.pinned,
      };
      saved.pinnedAt = saved.pinned ? (previous.pinnedAt || imported.pinnedAt || Date.now()) : null;
      next[position] = saved;
    } else {
      next.unshift(imported);
    }
    return next;
  });
  return saved;
}

async function mergeImportedMetadata(existingId, metadata) {
  let target = (await getStoredBookmarks()).find(item => item.id === existingId);
  if (!target) {
    const nodes = await chrome.bookmarks.get(existingId);
    const node = nodes && nodes[0];
    if (!node || !node.url) return false;
    const folder = await getBookmarkFolderInfo(node);
    target = await upsertImportedBookmark(node, {
      ...metadata,
      tags: [],
      pinned: false,
      contentText: '',
      contentTitle: '',
      contentExcerpt: '',
      contentMetaDesc: '',
      contentMetaKeywords: [],
      contentHeadings: [],
      contentStructuredTypes: [],
      folderName: folder.title || metadata.folderName,
      folderPath: folder.path || metadata.folderPath,
    });
  }
  let journal = null;
  await mutateStoredBookmarks((stored) => {
    const position = stored.findIndex(item => item.id === existingId);
    if (position < 0) return stored;
    const next = stored.slice();
    const current = stored[position];
    const before = {
      tags: [...(current.tags || [])],
      tagsAuto: [...(current.tagsAuto || [])],
      pinned: !!current.pinned,
      pinnedAt: current.pinnedAt || null,
    };
    const updated = {
      ...current,
      tags: BookmarkData.normalizeTags([...(current.tags || []), ...(metadata.tags || [])]),
      tagsAuto: BookmarkData.normalizeTags([...(current.tagsAuto || []), ...(metadata.tags || [])]),
      pinned: current.pinned || !!metadata.pinned,
    };
    updated.pinnedAt = updated.pinned ? (current.pinnedAt || Date.now()) : null;
    const after = {
      tags: [...updated.tags],
      tagsAuto: [...updated.tagsAuto],
      pinned: updated.pinned,
      pinnedAt: updated.pinnedAt,
    };
    next[position] = updated;
    journal = { id: existingId, url: metadata.url, before, after };
    return next;
  });
  return journal || false;
}

async function importBookmarksV2(message) {
  const operationId = message.operationId || makeImportOperationId();
  const interrupted = (await getImportOperations()).find((item) => item.id === operationId && item.status === 'running');
  const incoming = Array.isArray(message.bookmarks)
    ? message.bookmarks
    : (Array.isArray(interrupted?.request?.bookmarks) ? interrupted.request.bookmarks : []);
  const folderPaths = Array.isArray(message.folderPaths)
    ? message.folderPaths
    : (Array.isArray(interrupted?.request?.folderPaths) ? interrupted.request.folderPaths : []);
  if (incoming.length === 0 && folderPaths.length === 0) return { success: false, error: 'no_bookmarks_to_import' };

  const operation = interrupted || {
    id: operationId,
    startedAt: Date.now(),
    version: 2,
    status: 'running',
    request: {
      bookmarks: incoming,
      folderPaths,
      rootTitle: message.rootTitle || 'AI Bookmark OS 导入',
      rootDate: message.rootDate || getImportFolderDate(),
      duplicateStrategy: message.duplicateStrategy || 'merge',
    },
    created: [],
    createdFolders: [],
    skipped: [],
    merged: [],
    invalid: [],
    failed: [],
  };
  operation.request = {
    bookmarks: incoming,
    folderPaths,
    rootTitle: operation.request?.rootTitle || message.rootTitle || 'AI Bookmark OS 导入',
    rootDate: operation.request?.rootDate || message.rootDate || getImportFolderDate(),
    duplicateStrategy: operation.request?.duplicateStrategy || message.duplicateStrategy || 'merge',
  };
  for (const key of ['created', 'createdFolders', 'skipped', 'merged', 'invalid', 'failed']) {
    if (!Array.isArray(operation[key])) operation[key] = [];
  }
  operation.status = 'running';
  await saveImportOperation(operation);

  try {
    const nativeBookmarks = await getNativeBookmarksForImport();
    const plan = BookmarkData.buildImportPlan({
      incoming: operation.request.bookmarks,
      existing: nativeBookmarks,
      folders: operation.request.folderPaths,
      rootTitle: operation.request.rootTitle,
      rootDate: operation.request.rootDate,
      duplicateStrategy: operation.request.duplicateStrategy,
    });
    operation.skipped = plan.skipped;
    operation.invalid = plan.invalid;

    const folders = new Map();
    // 关闭 onCreated 扇出：导入自己负责写镜像与元数据，无需再逐条抓正文/推荐/增量入队。
    beginProgrammaticImport();
    try {
      for (const folder of plan.folders) {
        try {
          const createdFolder = await findOrCreateFolderPath(folder.key, operation.createdFolders);
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
          operation.created.push({
            id: created.id,
            parentId: created.parentId,
            title: created.title || metadata.title,
            url: created.url || metadata.url,
          });
        } catch (error) {
          operation.failed.push({ title: entry.metadata.title, url: entry.metadata.url, error: error.message || 'bookmark_create_failed' });
        }
        await saveImportOperation(operation);
      }
    } finally {
      endProgrammaticImport();
    }

    const alreadyCreatedIds = new Set(operation.created.map((item) => item.id));
    const alreadyMergedIds = new Set(operation.merged.map((item) => item.id));
    for (const entry of plan.merge) {
      if (alreadyCreatedIds.has(entry.existingId) || alreadyMergedIds.has(entry.existingId)) continue;
      try {
        const merged = await mergeImportedMetadata(entry.existingId, entry.metadata);
        if (merged) {
          operation.merged.push(merged);
        } else {
          operation.failed.push({ url: entry.metadata.url, error: 'duplicate_target_not_found' });
        }
      } catch (error) {
        operation.failed.push({ url: entry.metadata.url, error: error.message || 'metadata_merge_failed' });
      }
    }

    operation.status = operation.failed.length || operation.invalid.length ? 'partial' : 'completed';
    operation.completedAt = Date.now();
    await saveImportOperation(operation);
    const items = [
      ...(operation.created || []).map((item) => ({ id: item.id, status: 'succeeded', reason: 'bookmark_created' })),
      ...(operation.createdFolders || []).map((item) => ({ id: item.id, status: 'succeeded', reason: 'folder_created' })),
      ...(operation.merged || []).map((item) => ({ id: item.id, status: 'succeeded', reason: 'metadata_merged' })),
      ...(operation.skipped || []).map((item) => ({ id: item.existingId || item.item?.url || '', status: 'skipped', reason: item.reason || 'duplicate' })),
      ...(operation.invalid || []).map((item) => ({ id: item.item?.url || '', status: 'failed', reason: item.reason || 'invalid_record' })),
      ...(operation.failed || []).map((item) => ({ id: item.id || item.url || item.folderKey || '', status: 'failed', reason: item.error || 'import_failed' })),
    ];
    const failedCount = (operation.invalid || []).length + (operation.failed || []).length;
    const succeededCount = (operation.created || []).length + (operation.createdFolders || []).length + (operation.merged || []).length;
    return {
      success: operation.failed.length === 0 && operation.invalid.length === 0,
      status: operation.status,
      operationId: operation.id,
      created: operation.created,
      createdFolders: operation.createdFolders,
      skipped: operation.skipped,
      merged: operation.merged,
      invalid: operation.invalid,
      failures: operation.failed,
      total: items.length,
      succeeded: succeededCount,
      failed: failedCount,
      conflicts: 0,
      items,
      added: operation.created.length,
    };
  } catch (error) {
    operation.status = operation.created.length || operation.merged.length ? 'partial' : 'failed';
    operation.completedAt = Date.now();
    operation.failed.push({ error: error.message || 'import_failed' });
    await saveImportOperation(operation);
    const items = operation.failed.map((item) => ({ id: item.id || item.url || item.folderKey || '', status: 'failed', reason: item.error || 'import_failed' }));
    return {
      success: false,
      status: operation.status,
      operationId: operation.id,
      error: error.message || 'import_failed',
      total: items.length,
      succeeded: 0,
      failed: items.length,
      conflicts: 0,
      items,
      failures: operation.failed,
    };
  }
}

async function retryImportOperation(operationId) {
  const operation = (await getImportOperations()).find((item) => item.id === operationId);
  const hasBookmarks = Array.isArray(operation?.request?.bookmarks) && operation.request.bookmarks.length > 0;
  const hasFolders = Array.isArray(operation?.request?.folderPaths) && operation.request.folderPaths.length > 0;
  if (!hasBookmarks && !hasFolders) return { success: false, error: 'import_operation_not_retryable' };
  return importBookmarksV2({
    ...operation.request,
    ...(operation.status === 'running' ? { operationId } : { retryOf: operationId }),
  });
}

async function rollbackImportOperation(operationId) {
  const operation = (await getImportOperations()).find((item) => item.id === operationId);
  if (!operation) return { success: false, error: 'import_operation_not_found' };
  operation.status = 'undoing';
  await saveImportOperation(operation);
  const items = [];
  const revertedIds = new Set();
  const previouslySucceeded = new Map((operation.rollback?.items || [])
    .filter((item) => item.status === 'succeeded')
    .map((item) => [item.id, item]));
  for (const created of operation.created || []) {
    if (previouslySucceeded.has(created.id)) {
      items.push(previouslySucceeded.get(created.id));
      continue;
    }
    try {
      const [node] = await chrome.bookmarks.get(created.id);
      if (!node?.url || node.url !== created.url || node.title !== created.title) {
        items.push({ id: created.id, status: 'conflict', reason: 'bookmark_changed_after_import' });
        continue;
      }
      await chrome.bookmarks.remove(created.id);
      revertedIds.add(created.id);
      items.push({ id: created.id, status: 'succeeded' });
    } catch {
      revertedIds.add(created.id);
      items.push({ id: created.id, status: 'succeeded', reason: 'already_missing' });
    }
  }
  if (revertedIds.size) {
    await mutateStoredBookmarks((bookmarks) => bookmarks.filter((item) => !revertedIds.has(item.id)));
  }

  for (const merged of operation.merged || []) {
    if (previouslySucceeded.has(merged.id)) {
      items.push(previouslySucceeded.get(merged.id));
      continue;
    }
    if (!merged.before || !merged.after) {
      items.push({ id: merged.id, status: 'conflict', reason: 'legacy_metadata_journal_unavailable' });
      continue;
    }
    let outcome = { id: merged.id, status: 'failed', reason: 'metadata_target_not_found' };
    await mutateStoredBookmarks((bookmarks) => {
      const index = bookmarks.findIndex((item) => item.id === merged.id);
      if (index < 0) return bookmarks;
      const current = bookmarks[index];
      const snapshot = {
        tags: [...(current.tags || [])],
        tagsAuto: [...(current.tagsAuto || [])],
        pinned: !!current.pinned,
        pinnedAt: current.pinnedAt || null,
      };
      if (JSON.stringify(snapshot) !== JSON.stringify(merged.after)) {
        outcome = { id: merged.id, status: 'conflict', reason: 'metadata_changed_after_import' };
        return bookmarks;
      }
      const next = bookmarks.slice();
      next[index] = { ...current, ...merged.before };
      outcome = { id: merged.id, status: 'succeeded' };
      return next;
    });
    items.push(outcome);
  }

  for (const folder of [...(operation.createdFolders || [])].reverse()) {
    if (previouslySucceeded.has(folder.id)) {
      items.push(previouslySucceeded.get(folder.id));
      continue;
    }
    try {
      const children = await chrome.bookmarks.getChildren(folder.id);
      if (children.length) {
        items.push({ id: folder.id, status: 'conflict', reason: 'import_folder_not_empty' });
        continue;
      }
      await chrome.bookmarks.remove(folder.id);
      items.push({ id: folder.id, status: 'succeeded' });
    } catch {
      items.push({ id: folder.id, status: 'succeeded', reason: 'already_missing' });
    }
  }

  const result = makeBatchResult(items);
  operation.rollback = { attemptedAt: Date.now(), ...result };
  operation.status = result.failed || result.conflicts ? 'undo_partial' : 'undone';
  await saveImportOperation(operation);
  return { success: operation.status === 'undone', operationId, status: operation.status, ...result };
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
        item.tagsAuto = Array.isArray(prev.tagsAuto) ? [...prev.tagsAuto] : [];
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
        item.tags = normalizeTagList([...(prev.tags || []), ...(item.tags || [])]);
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
    await mutateTombstones(async (current) => {
      const tombstones = await pruneTombstones(current, retentionDays);
      const existingTombstoneKeys = new Set(tombstones.map(t => t.url + '_' + t.dateAdded));
      const next = [...tombstones];
      for (const item of existing) {
        const key = item.url + '_' + item.dateAdded;
        if (!currentIds.has(item.id) && !currentKeys.has(key) && !existingTombstoneKeys.has(key) && item.url) {
          next.push({ ...item, deletedAt: Date.now() });
          existingTombstoneKeys.add(key);
        }
      }
      return next;
    });

    // 重评空/泛化标签，以及完全由系统自动生成的旧标签；手动标签始终保留。
    const officeSystemUrlKeys = collectOfficeSystemUrlKeys(merged);
    const needsTag = merged.filter(item => shouldRefreshLocalTags(
      item.tags,
      item.tagsAuto,
      officeSystemUrlKeys.has(localTagGroupKey(item)),
    ));
    const refreshedTagKeys = new Set();
    const itemKey = item => item.id || `${item.url}_${item.dateAdded}`;
    let taggedCount = 0;
    if (needsTag.length > 0 && typeof autoTagBookmarks === 'function') {
      const tagged = await autoTagBookmarks(needsTag, 10, { skipAI: true });
      const stableAutoTags = selectStableAutoTags(needsTag, tagged);
      for (let index = 0; index < needsTag.length; index++) {
        const localTags = stableAutoTags.get(localTagGroupKey(needsTag[index])) || [];
        const refreshed = applyLocalAutoTags(
          needsTag[index].tags,
          needsTag[index].tagsAuto,
          localTags,
        );
        needsTag[index].tags = refreshed.tags;
        needsTag[index].tagsAuto = refreshed.tagsAuto;
        refreshedTagKeys.add(itemKey(needsTag[index]));
        if (localTags.length > 0) taggedCount++;
      }
    }

    // 从 Chrome 历史记录获取真实访问次数，并应用到本次同步快照。
    const clickCountUpdates = await enrichClickCounts(merged, 10);
    applyClickCountUpdates(merged, clickCountUpdates);

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
        const refreshedAutoTags = refreshedTagKeys.has(itemKey(item));
        const refreshed = refreshedAutoTags
          ? applyLocalAutoTags(current.tags, current.tagsAuto, item.tagsAuto)
          : null;
        const tags = refreshed
          ? refreshed.tags
          : normalizeTagList([...(current.tags || []), ...(item.tags || [])]);
        const tagsAuto = refreshed
          ? refreshed.tagsAuto
          : normalizeTagList([...(current.tagsAuto || []), ...(item.tagsAuto || [])])
            .filter(tag => (tags || []).some(candidate => candidate.toLowerCase() === tag.toLowerCase()));
        return {
          ...item,
          pinned: !!current.pinned,
          pinnedAt: current.pinnedAt || null,
          clickCount: item.clickCount || 0,
          lastClickedAt: item.lastClickedAt || null,
          tags,
          tagsAuto,
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
const INCREMENTAL_MAX_ATTEMPTS = 3;
const INCREMENTAL_RETRY_BASE_MS = 30 * 1000;
const INCREMENTAL_CLASSIFY_PORT_PREFIX = 'incremental-classification:';
const activeIncrementalClassificationOwners = new Set();

function getIncrementalClassificationPortOwner(port) {
  if (port.sender?.id && port.sender.id !== chrome.runtime.id) return '';
  if (typeof port.name !== 'string' || !port.name.startsWith(INCREMENTAL_CLASSIFY_PORT_PREFIX)) return '';
  const ownerId = port.name.slice(INCREMENTAL_CLASSIFY_PORT_PREFIX.length);
  return ownerId.length >= 16 && ownerId.length <= 128 && /^[a-zA-Z0-9-]+$/.test(ownerId) ? ownerId : '';
}

function clearIncrementalQueueLease(item, updates = {}) {
  const { ownerId: _ownerId, leaseUpdatedAt: _leaseUpdatedAt, ...rest } = item;
  return { ...rest, ...updates };
}

function normalizeIncrementalQueue(raw, now = Date.now()) {
  const queue = Array.isArray(raw) ? raw : [];
  const normalized = queue.filter((item) => item && typeof item.id === 'string' && item.id).map((item) => {
    const attempts = Math.max(0, Number(item.attempts) || 0);
    const ownerId = typeof item.ownerId === 'string' ? item.ownerId : '';
    const leaseUpdatedAt = Number(item.leaseUpdatedAt) || 0;
    let status = ['pending', 'running', 'retryable', 'failed', 'succeeded'].includes(item.status)
      ? item.status
      : (item.lastError ? (attempts >= INCREMENTAL_MAX_ATTEMPTS ? 'failed' : 'retryable') : 'pending');
    if (status === 'running' && (!ownerId || !activeIncrementalClassificationOwners.has(ownerId))) status = 'pending';
    const normalizedItem = {
      id: item.id,
      createdAt: Number(item.createdAt) || now,
      attempts,
      status,
      nextAttemptAt: status === 'pending' && item.status === 'running' ? 0 : (Number(item.nextAttemptAt) || 0),
      ...(item.lastAttemptAt ? { lastAttemptAt: Number(item.lastAttemptAt) } : {}),
      ...(item.completedAt ? { completedAt: Number(item.completedAt) } : {}),
      ...(item.lastError ? { lastError: String(item.lastError).slice(0, 240) } : {}),
    };
    return status === 'running'
      ? { ...normalizedItem, ownerId, leaseUpdatedAt: leaseUpdatedAt || now }
      : normalizedItem;
  }).filter((item) => item.status !== 'succeeded' || now - (item.completedAt || now) < 24 * 60 * 60 * 1000);
  return [...new Map(normalized.map((item) => [item.id, item])).values()]
    .sort((left, right) => left.createdAt - right.createdAt)
    .slice(-500);
}

async function getIncrementalClassificationQueue() {
  let queue = [];
  await mutateStorageResource(INCREMENTAL_CLASSIFY_QUEUE_KEY, (current) => {
    queue = normalizeIncrementalQueue(current);
    return queue;
  });
  return queue;
}

async function mutateIncrementalClassificationQueue(updater) {
  return mutateStorageResource(INCREMENTAL_CLASSIFY_QUEUE_KEY, (current) => updater(normalizeIncrementalQueue(current)));
}

async function claimIncrementalClassificationQueue(ownerId) {
  const claimed = [];
  const now = Date.now();
  await mutateIncrementalClassificationQueue((queue) => queue.map((item) => {
    if (!['pending', 'retryable'].includes(item.status) || item.nextAttemptAt > now) return item;
    claimed.push({ ...item, status: 'running', lastAttemptAt: now, ownerId, leaseUpdatedAt: now });
    return claimed[claimed.length - 1];
  }));
  return claimed;
}

async function heartbeatIncrementalClassificationQueue(ownerId) {
  const now = Date.now();
  return mutateIncrementalClassificationQueue((queue) => queue.map((item) => item.status === 'running' && item.ownerId === ownerId
    ? { ...item, leaseUpdatedAt: now }
    : item));
}

async function failIncrementalClassificationQueue(ids, error, ownerId) {
  const affected = new Set(ids || []);
  const now = Date.now();
  return mutateIncrementalClassificationQueue((queue) => queue.map((item) => {
    if (!affected.has(item.id) || item.status !== 'running' || item.ownerId !== ownerId) return item;
    const attempts = item.attempts + 1;
    const failed = attempts >= INCREMENTAL_MAX_ATTEMPTS;
    return clearIncrementalQueueLease(item, {
      attempts,
      status: failed ? 'failed' : 'retryable',
      lastError: String(error || 'incremental_classification_failed').slice(0, 240),
      nextAttemptAt: failed ? 0 : now + INCREMENTAL_RETRY_BASE_MS * (2 ** (attempts - 1)),
    });
  }));
}

async function completeIncrementalClassificationQueue(ids, ownerId) {
  const affected = new Set(ids || []);
  return mutateIncrementalClassificationQueue((queue) => queue.map((item) => {
    if (!affected.has(item.id)) return item;
    if (ownerId && (item.status !== 'running' || item.ownerId !== ownerId)) return item;
    return clearIncrementalQueueLease(item, {
      status: 'succeeded', completedAt: Date.now(), nextAttemptAt: 0, lastError: '',
    });
  }));
}

async function retryIncrementalClassificationQueue(ids) {
  const affected = new Set(ids || []);
  return mutateIncrementalClassificationQueue((queue) => queue.map((item) => affected.has(item.id)
    ? clearIncrementalQueueLease(item, { status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: '' })
    : item));
}

async function releaseIncrementalClassificationQueue(ids, ownerId) {
  const affected = new Set(ids || []);
  return mutateIncrementalClassificationQueue((queue) => queue.map((item) => affected.has(item.id)
    && item.status === 'running'
    && item.ownerId === ownerId
    ? clearIncrementalQueueLease(item, { status: 'pending', nextAttemptAt: 0 })
    : item));
}

async function releaseIncrementalClassificationOwner(ownerId) {
  return mutateIncrementalClassificationQueue((queue) => queue.map((item) => item.status === 'running' && item.ownerId === ownerId
    ? clearIncrementalQueueLease(item, { status: 'pending', nextAttemptAt: 0 })
    : item));
}

async function abandonIncrementalClassificationQueue(ids) {
  const affected = new Set(ids || []);
  return mutateIncrementalClassificationQueue((queue) => queue.filter((item) => !affected.has(item.id)));
}

async function enqueueIncrementalClassification(id, bookmark) {
  const data = await chrome.storage.local.get('settings');
  const settings = data.settings || {};
  if (settings.incrementalClassificationEnabled !== true || !settings.apiKey || !bookmark?.url) return;
  await mutateIncrementalClassificationQueue((queue) => {
    const byId = new Map(queue.filter(item => item && item.id).map(item => [item.id, item]));
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        createdAt: bookmark.dateAdded || Date.now(),
        attempts: 0,
        status: 'pending',
        nextAttemptAt: 0,
      });
    }
    return [...byId.values()]
      .sort((left, right) => left.createdAt - right.createdAt)
      .slice(-500);
  });
}

async function enqueueIncrementalClassificationEntries(entries) {
  const incoming = Array.isArray(entries) ? entries.slice(0, 500) : [];
  return mutateIncrementalClassificationQueue((queue) => {
    const byId = new Map(queue.map((item) => [item.id, item]));
    for (const entry of incoming) {
      if (!entry || typeof entry.id !== 'string' || !entry.id || byId.has(entry.id)) continue;
      byId.set(entry.id, {
        id: entry.id,
        createdAt: Number(entry.createdAt) || Date.now(),
        attempts: 0,
        status: 'pending',
        nextAttemptAt: 0,
      });
    }
    return [...byId.values()].sort((left, right) => left.createdAt - right.createdAt).slice(-500);
  });
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
    if (tag && !isNumericOnlyTag(tag) && !normalized.has(tag.toLowerCase())) normalized.set(tag.toLowerCase(), tag);
  }
  return [...normalized.values()].slice(0, 8);
}

function isNumericOnlyTag(tag) {
  return /^\d+(?:[._:/-]\d+)*$/.test(String(tag || '').trim());
}

const GENERIC_TAG_VALUES = new Set([
  '其他', '其它', '未知', '未分类', '无', '无标签',
  'other', 'others', 'unknown', 'uncategorized', 'misc', 'none', 'n/a'
]);

function isGenericTag(tag) {
  return GENERIC_TAG_VALUES.has(String(tag || '').trim().toLowerCase());
}

function tagKey(tag) {
  return String(tag || '').trim().toLowerCase();
}

function getManualTags(tags, tagsAuto) {
  const automatic = new Set(normalizeTagList(tagsAuto).map(tagKey));
  return normalizeTagList(tags).filter(tag => !isGenericTag(tag) && !automatic.has(tagKey(tag)));
}

function shouldRefreshLocalTags(tags, tagsAuto = [], forceRefresh = false) {
  if (forceRefresh) return true;
  const normalized = normalizeTagList(tags);
  if (normalized.length === 0 || normalized.every(isGenericTag)) return true;
  const automatic = new Set(normalizeTagList(tagsAuto).map(tagKey));
  return automatic.size > 0 && normalized.every(tag => isGenericTag(tag) || automatic.has(tagKey(tag)));
}

function applyLocalAutoTags(existingTags, existingAutoTags, localTags) {
  const tagsAuto = normalizeTagList(localTags).filter(tag => !isGenericTag(tag));
  return {
    tags: normalizeTagList([...getManualTags(existingTags, existingAutoTags), ...tagsAuto]),
    tagsAuto,
  };
}

function localTagGroupKey(item) {
  const url = String(item?.url || '').trim();
  return url ? `url:${url}` : `id:${item?.id || ''}`;
}

function collectOfficeSystemUrlKeys(bookmarks) {
  const officeSystemTitle = /(?:协同|办公|\boa\b|审批|报销|企业管理|综合管理|移动管理|项目管理|管理平台|审核系统|wps|(?:国投|集团|股份|公司|企业).{0,8}(?:测试|业务|管理|办公).{0,6}(?:系统|平台))/i;
  return new Set((bookmarks || [])
    .filter(item => officeSystemTitle.test(`${item?.title || ''} ${item?.folderName || ''} ${item?.folderPath || ''}`))
    .map(localTagGroupKey));
}

function selectStableAutoTags(bookmarks, tagged) {
  const chosen = new Map();
  for (let index = 0; index < bookmarks.length; index++) {
    const bookmark = bookmarks[index];
    const tags = normalizeTagList(tagged[index]?.tags || []).filter(tag => !isGenericTag(tag));
    const rank = [
      tags.length === 0 ? '1' : '0',
      tags.join('\u0000'),
      String(bookmark?.title || ''),
      String(bookmark?.id || ''),
    ].join('\u0000');
    const key = localTagGroupKey(bookmark);
    const existing = chosen.get(key);
    if (!existing || rank < existing.rank) chosen.set(key, { rank, tags });
  }
  return new Map([...chosen].map(([key, value]) => [key, value.tags]));
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
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'our', 'home', 'page',
  'http', 'https', 'www', 'com', 'org', 'net', 'io', 'app', 'dev', 'test',
  '书签', '收藏', '文件夹', '其他', '杂项', '资料', '归档', '临时', '页面', '网站',
  '的是', '一个', '以及', '可以', '用于', '提供', '相关', '内容', '平台', '工具'
]);
const MAX_FOLDER_MATCH_SAMPLES = 10;
const FOLDER_SAMPLE_MATCH_THRESHOLD = 0.015;
const FOLDER_CONTENT_BACKFILL_LIMIT = 10;
const FOLDER_CONTENT_BACKFILL_CONCURRENCY = 2;
const FOLDER_CONTENT_FAILURE_COOLDOWN = 24 * 60 * 60 * 1000;
const FOLDER_CONTENT_BACKFILL_QUEUE_KEY = 'folder_content_backfill_queue';
const FOLDER_CONTENT_BACKFILL_ALARM = 'folder-content-backfill';

function sampleFolderBookmarks(storedBookmarks, random = Math.random) {
  const grouped = new Map();
  for (const item of storedBookmarks || []) {
    const path = normalizeBookmarkFolderPath(item?.folderPath);
    if (!path) continue;
    if (!grouped.has(path)) grouped.set(path, []);
    grouped.get(path).push(item);
  }

  const sampled = [];
  for (const items of grouped.values()) {
    if (items.length <= MAX_FOLDER_MATCH_SAMPLES) {
      sampled.push(...items);
      continue;
    }
    const pool = [...items];
    for (let index = pool.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.max(0, Math.min(0.999999999999, Number(random()) || 0)) * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    sampled.push(...pool.slice(0, MAX_FOLDER_MATCH_SAMPLES));
  }
  return sampled;
}

function hasStoredPageContent(item) {
  return String(item?.contentText || '').trim().length >= 80
    || !!String(item?.contentExcerpt || item?.contentMetaDesc || '').trim()
    || (Array.isArray(item?.contentMetaKeywords) && item.contentMetaKeywords.length > 0)
    || (Array.isArray(item?.contentHeadings) && item.contentHeadings.length > 0)
    || (Array.isArray(item?.contentStructuredTypes) && item.contentStructuredTypes.length > 0);
}

function contentPatchFromResult(content, fallback = {}) {
  return {
    contentText: content?.textContent || fallback.contentText || '',
    contentTitle: content?.title || fallback.contentTitle || '',
    contentExcerpt: content?.excerpt || fallback.contentExcerpt || '',
    contentMetaDesc: content?.metaDesc || fallback.contentMetaDesc || '',
    contentMetaKeywords: content?.metaKeywords || fallback.contentMetaKeywords || [],
    contentHeadings: content?.headings || fallback.contentHeadings || [],
    contentStructuredTypes: content?.structuredTypes || fallback.contentStructuredTypes || [],
    contentFetchedAt: content?.fetchedAt || fallback.contentFetchedAt || Date.now(),
    contentStatus: content?.status || fallback.contentStatus || 'failed',
    contentFailureReason: content?.failureReason || '',
    contentSource: content?.source || fallback.contentSource || '',
  };
}

async function hydrateFolderSamplesFromContentCache(samples) {
  const cache = await getPageContentCache().catch(() => ({}));
  return (samples || []).map((item) => {
    if (hasStoredPageContent(item)) return item;
    const cached = cache[item?.url];
    if (!cached || cached.status !== 'success') return item;
    return { ...item, ...contentPatchFromResult(cached, item) };
  });
}

async function enqueueFolderSampleContentBackfill(samples, preferredFolderPaths = []) {
  const preferred = new Set((preferredFolderPaths || []).map(normalizeBookmarkFolderPath).filter(Boolean));
  const cache = await getPageContentCache().catch(() => ({}));
  const now = Date.now();
  const candidates = (samples || [])
    .filter(item => item?.id && item?.url && isContentUrl(item.url) && !hasStoredPageContent(item))
    .filter((item) => {
      const failedAt = Number(cache[item.url]?.fetchedAt || item.contentFetchedAt) || 0;
      const failed = cache[item.url]?.status === 'failed' || item.contentStatus === 'failed';
      return !failed || now - failedAt >= FOLDER_CONTENT_FAILURE_COOLDOWN;
    })
    .sort((left, right) => {
      const leftPreferred = preferred.has(normalizeBookmarkFolderPath(left.folderPath)) ? 1 : 0;
      const rightPreferred = preferred.has(normalizeBookmarkFolderPath(right.folderPath)) ? 1 : 0;
      return rightPreferred - leftPreferred || String(left.id).localeCompare(String(right.id));
    })
    .slice(0, FOLDER_CONTENT_BACKFILL_LIMIT)
    .map(item => ({ id: item.id, url: item.url, folderPath: normalizeBookmarkFolderPath(item.folderPath), queuedAt: now }));
  if (candidates.length === 0) return 0;
  await mutateStorageResource(FOLDER_CONTENT_BACKFILL_QUEUE_KEY, (current) => {
    const byId = new Map((Array.isArray(current) ? current : []).filter(item => item?.id).map(item => [item.id, item]));
    for (const item of candidates) if (!byId.has(item.id)) byId.set(item.id, item);
    return [...byId.values()].sort((left, right) => left.queuedAt - right.queuedAt).slice(0, 100);
  });
  chrome.alarms.create(FOLDER_CONTENT_BACKFILL_ALARM, { when: Date.now() + 1000 });
  return candidates.length;
}

async function processFolderSampleContentBackfill() {
  let claimed = [];
  await mutateStorageResource(FOLDER_CONTENT_BACKFILL_QUEUE_KEY, (current) => {
    const queue = Array.isArray(current) ? current : [];
    claimed = queue.slice(0, FOLDER_CONTENT_BACKFILL_LIMIT);
    return queue.slice(claimed.length);
  });
  if (claimed.length === 0) return;

  const results = await runWithConcurrency(claimed, FOLDER_CONTENT_BACKFILL_CONCURRENCY, async (entry) => ({
    entry,
    content: await fetchStaticPageContent(entry.url),
  }));
  const patches = new Map(results.map(({ entry, content }) => [entry.id, {
    url: entry.url,
    patch: contentPatchFromResult(content),
  }]));
  await mutateStoredBookmarks((bookmarks) => bookmarks.map((item) => {
    const update = patches.get(item.id);
    if (!update || update.url !== item.url) return item;
    return { ...item, ...update.patch };
  }));

  const remaining = await chrome.storage.local.get(FOLDER_CONTENT_BACKFILL_QUEUE_KEY);
  if ((remaining[FOLDER_CONTENT_BACKFILL_QUEUE_KEY] || []).length > 0) {
    chrome.alarms.create(FOLDER_CONTENT_BACKFILL_ALARM, { when: Date.now() + 60 * 1000 });
  }
}

function tokenizeFolderEvidence(value) {
  const text = String(value || '').toLowerCase();
  const tokens = text
    .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
    .map(part => part.trim())
    .filter(part => part.length >= 2);
  const chinese = [];
  for (const phrase of text.match(/[\u4e00-\u9fa5]{2,}/g) || []) {
    chinese.push(phrase);
    for (let index = 0; index + 1 < phrase.length; index++) {
      chinese.push(phrase.slice(index, index + 2));
    }
    for (let index = 0; index + 2 < phrase.length; index++) {
      chinese.push(phrase.slice(index, index + 3));
    }
  }
  return [...new Set([...tokens, ...chinese])];
}

function escapeFolderEvidenceRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBookmarkFolderEvidenceText(bookmark) {
  return [
    bookmark?.title,
    bookmark?.url,
    bookmark?.domain,
    bookmark?.metaDesc,
    bookmark?.excerpt,
    bookmark?.contentExcerpt,
    bookmark?.contentTitle,
    bookmark?.contentText,
    bookmark?.contentMetaDesc,
    bookmark?.ogDescription,
    ...(Array.isArray(bookmark?.headings) ? bookmark.headings : []),
    ...(Array.isArray(bookmark?.contentHeadings) ? bookmark.contentHeadings : []),
    ...(Array.isArray(bookmark?.metaKeywords) ? bookmark.metaKeywords : []),
    ...(Array.isArray(bookmark?.contentMetaKeywords) ? bookmark.contentMetaKeywords : []),
    ...(Array.isArray(bookmark?.structuredTypes) ? bookmark.structuredTypes : []),
    ...(Array.isArray(bookmark?.contentStructuredTypes) ? bookmark.contentStructuredTypes : []),
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
  return getFolderPathTokenEntries(folderPath).map(item => item.token);
}

function getFolderPathTokenEntries(folderPath) {
  const parts = normalizeBookmarkFolderPath(folderPath).split('/').filter(Boolean);
  return parts.flatMap((part, index) => {
    const normalizedPart = String(part || '').toLowerCase().trim();
    return tokenizeFolderEvidence(part).map(token => ({
      token,
      isLeaf: index === parts.length - 1,
      isWholeSegment: token === normalizedPart,
    }));
  });
}

function getTagTokens(tags) {
  return new Set(normalizeTagList(tags).flatMap(tokenizeFolderEvidence));
}

function addWeightedToken(target, token, weight) {
  const normalized = String(token || '').toLowerCase().trim();
  if (!normalized || FOLDER_EVIDENCE_STOP_WORDS.has(normalized)) return;
  target.set(normalized, Math.max(target.get(normalized) || 0, weight));
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

function collectBookmarkTokenWeights(bookmark, tags = []) {
  const tokens = new Map();
  const bodyTokens = new Map();
  const leadTokens = new Map();
  const tokenSources = new Map();
  const pageFields = new Set();
  const addText = (value, weight, source, maxChars = 1200) => {
    const text = String(value || '').trim().slice(0, maxChars);
    if (!text) return;
    if (source.startsWith('page_')) pageFields.add(source);
    for (const token of tokenizeFolderEvidence(text).slice(0, 800)) {
      if (FOLDER_EVIDENCE_STOP_WORDS.has(token)) continue;
      addWeightedToken(tokens, token, weight);
      if (!tokenSources.has(token)) tokenSources.set(token, new Set());
      tokenSources.get(token).add(source);
    }
  };
  const addLeadText = (value, weight) => {
    for (const token of tokenizeFolderEvidence(String(value || '').slice(0, 1200)).slice(0, 500)) {
      if (FOLDER_EVIDENCE_STOP_WORDS.has(token)) continue;
      addWeightedToken(leadTokens, token, weight);
    }
  };
  const headings = [...new Set([
    ...(Array.isArray(bookmark?.headings) ? bookmark.headings : []),
    ...(Array.isArray(bookmark?.contentHeadings) ? bookmark.contentHeadings : []),
  ].map(value => String(value || '').trim()).filter(Boolean))];
  addText(bookmark?.contentTitle, 1, 'page_content_title');
  headings.forEach((value, index) => addText(value, index === 0 ? 1 : (index === 1 ? 0.9 : 0.65), 'page_headings'));
  for (const value of Array.isArray(bookmark?.metaKeywords) ? bookmark.metaKeywords : []) addText(value, 1, 'page_meta_keywords');
  for (const value of Array.isArray(bookmark?.contentMetaKeywords) ? bookmark.contentMetaKeywords : []) addText(value, 1, 'page_meta_keywords');
  addText(bookmark?.metaDesc, 0.9, 'page_meta_description');
  addText(bookmark?.contentMetaDesc, 0.9, 'page_meta_description');
  addText(bookmark?.excerpt, 0.9, 'page_excerpt');
  addText(bookmark?.contentExcerpt, 0.9, 'page_excerpt');
  addText(bookmark?.ogDescription, 0.9, 'page_meta_description');
  const bodyText = String(bookmark?.contentText || '').slice(0, 4000);
  addText(bodyText.slice(0, 1000), 0.8, 'page_body');
  addText(bodyText.slice(1000), 0.45, 'page_body_tail', 3000);
  for (const token of tokenizeFolderEvidence(bodyText.slice(0, 1000)).slice(0, 500)) {
    addWeightedToken(bodyTokens, token, 0.8);
  }
  for (const token of tokenizeFolderEvidence(bodyText.slice(1000)).slice(0, 500)) {
    addWeightedToken(bodyTokens, token, 0.45);
  }
  addLeadText(bookmark?.contentTitle, 1);
  addLeadText(headings[0], 1);
  addLeadText(headings[1], 0.9);
  addLeadText(bookmark?.excerpt || bookmark?.contentExcerpt || bookmark?.metaDesc || bookmark?.contentMetaDesc, 0.95);
  addText(bookmark?.title, 0.75, 'bookmark_title');
  addText(getUrlPathEvidence(bookmark?.url), 0.55, 'url_path');
  addText(bookmark?.domain || extractDomain(bookmark?.url || ''), 0.55, 'domain');
  for (const value of Array.isArray(bookmark?.structuredTypes) ? bookmark.structuredTypes : []) addText(value, 0.55, 'page_structured_type');
  for (const value of Array.isArray(bookmark?.contentStructuredTypes) ? bookmark.contentStructuredTypes : []) addText(value, 0.55, 'page_structured_type');
  for (const tag of normalizeTagList(tags)) addText(tag, 0.4, 'tag');
  return {
    tokens,
    bodyTokens,
    leadTokens,
    tokenSources,
    pageFields: [...pageFields],
    pageContentUsed: bodyTokens.size >= 2,
    bodyText,
    domain: String(bookmark?.domain || extractDomain(bookmark?.url || '') || '').toLowerCase(),
  };
}

function weightedTokenJaccard(left, right, idf = new Map()) {
  const allTokens = new Set([...left.keys(), ...right.keys()]);
  const matches = [];
  let intersection = 0;
  let union = 0;
  for (const token of allTokens) {
    const leftWeight = left.get(token) || 0;
    const rightWeight = right.get(token) || 0;
    const importance = idf.get(token) || 1;
    const overlap = Math.min(leftWeight, rightWeight) * importance;
    intersection += overlap;
    union += Math.max(leftWeight, rightWeight) * importance;
    if (overlap > 0) matches.push({ token, contribution: overlap });
  }
  matches.sort((a, b) => b.contribution - a.contribution || a.token.localeCompare(b.token, 'zh'));
  return {
    similarity: union > 0 ? intersection / union : 0,
    matchedTerms: matches.map(item => item.token),
  };
}

function getPageBodyFolderLeafMatches(folderPath, bookmarkFeatures) {
  if (!bookmarkFeatures?.pageContentUsed) return [];
  const leaf = normalizeBookmarkFolderPath(folderPath).split('/').filter(Boolean).slice(-1)[0] || '';
  const compactLeaf = leaf.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '');
  const bodyText = String(bookmarkFeatures.bodyText || '').toLowerCase();
  const segments = bodyText.split(/[\n\r\u3002\uff01\uff1f\uff0c\uff1b.!?,;]+/).filter(Boolean);
  if (compactLeaf.length >= 2 && segments.some(segment => (
    segment.replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '').includes(compactLeaf)
  ))) return [leaf];

  const leafTokens = [...new Set(tokenizeFolderEvidence(leaf)
    .filter(token => !FOLDER_EVIDENCE_STOP_WORDS.has(token)))];
  if (leafTokens.length < 2) return [];
  let best = [];
  for (const segment of segments) {
    const matches = leafTokens.filter(token => folderEvidenceTokenMatchesText(token, segment));
    if (matches.length > best.length) best = matches;
  }
  return best.length >= 2 ? best : [];
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
        samples: [],
        domains: new Map(),
        count: 0
      });
    }
    const profile = profiles.get(path);
    const features = collectBookmarkTokenWeights(item, item.tags || []);
    profile.samples.push({ item, features });
    if (features.domain) profile.domains.set(features.domain, (profile.domains.get(features.domain) || 0) + 1);
    profile.count += 1;
  }
  return profiles;
}

function buildFolderTokenIdf(profiles) {
  const folderFrequency = new Map();
  for (const profile of profiles) {
    const folderTokens = new Set(profile.samples.flatMap(sample => [...sample.features.tokens.keys()]));
    for (const token of folderTokens) folderFrequency.set(token, (folderFrequency.get(token) || 0) + 1);
  }
  const totalFolders = Math.max(1, profiles.length);
  return new Map([...folderFrequency].map(([token, count]) => {
    const idf = 1 + Math.log((totalFolders + 1) / (count + 1));
    return [token, count / totalFolders >= 0.8 ? idf * 0.2 : idf];
  }));
}

function mergeMatchedTerms(matches) {
  const weighted = new Map();
  for (const match of matches) {
    const rankWeight = Math.max(0.1, match.similarity);
    for (const term of match.matchedTerms.slice(0, 12)) {
      weighted.set(term, (weighted.get(term) || 0) + rankWeight);
    }
  }
  return [...weighted]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh'))
    .slice(0, 8)
    .map(([term]) => term);
}

function scoreFolderProfileCandidates(storedBookmarks, folderOptions, bookmark, suggestedTags) {
  const bookmarkFeatures = collectBookmarkTokenWeights(bookmark, suggestedTags);
  const candidates = [];
  const profiles = [...buildFolderProfiles(storedBookmarks, folderOptions).values()];
  const idf = buildFolderTokenIdf(profiles);
  const domainFolderCount = bookmarkFeatures.domain
    ? profiles.filter(profile => (profile.domains.get(bookmarkFeatures.domain) || 0) > 0).length
    : 0;
  for (const profile of profiles) {
    const similarities = profile.samples.map((sample) => {
      const fullSimilarity = weightedTokenJaccard(bookmarkFeatures.tokens, sample.features.tokens, idf);
      const leadSimilarity = weightedTokenJaccard(bookmarkFeatures.leadTokens, sample.features.tokens, idf);
      const bodySimilarity = weightedTokenJaccard(bookmarkFeatures.bodyTokens, sample.features.tokens, idf);
      const similarity = bookmarkFeatures.leadTokens.size >= 2
        ? fullSimilarity.similarity * 0.45 + leadSimilarity.similarity * 0.55
        : fullSimilarity.similarity;
      return {
        similarity,
        matchedTerms: [...new Set([...leadSimilarity.matchedTerms, ...fullSimilarity.matchedTerms])],
        leadSimilarity: leadSimilarity.similarity,
        bodySimilarity: bodySimilarity.similarity,
        bodyMatchedTerms: bodySimilarity.matchedTerms,
        item: sample.item,
      };
    }).sort((left, right) => right.similarity - left.similarity);
    const matchedSamples = similarities.filter(item => item.similarity >= FOLDER_SAMPLE_MATCH_THRESHOLD && item.matchedTerms.length >= 2);
    const topMatches = matchedSamples.slice(0, 3);
    const bodyMatchedSamples = similarities
      .filter(item => item.bodySimilarity >= FOLDER_SAMPLE_MATCH_THRESHOLD && item.bodyMatchedTerms.length >= 2)
      .sort((left, right) => right.bodySimilarity - left.bodySimilarity);
    const bestSimilarity = topMatches[0]?.similarity || 0;
    const topAverage = topMatches.length > 0
      ? topMatches.reduce((sum, item) => sum + item.similarity, 0) / topMatches.length
      : 0;
    const aggregateSimilarity = bestSimilarity * 0.6 + topAverage * 0.4;
    const sameDomainCount = bookmarkFeatures.domain ? (profile.domains.get(bookmarkFeatures.domain) || 0) : 0;
    const hasReliableSimilarity = sameDomainCount > 0 || matchedSamples.length > 0;
    if (!hasReliableSimilarity) continue;
    const ambiguityDamp = domainFolderCount > 1 ? 1 / domainFolderCount : 1;
    const domainScore = sameDomainCount > 0 ? Math.min(30, Math.log2(sameDomainCount + 1) * 20) * ambiguityDamp : 0;
    const contentScore = Math.min(85, aggregateSimilarity * 1200);
    const score = Math.min(100, domainScore + contentScore);
    if (score <= 0) continue;
    const pathEvidence = scoreFolderPathEvidence(profile.folderPath, bookmark, suggestedTags, bookmarkFeatures);
    const contentSampleCount = profile.samples.filter(sample => sample.features.pageContentUsed).length;
    const matchedTerms = mergeMatchedTerms(topMatches.length > 0
      ? topMatches
      : bodyMatchedSamples.map(item => ({ ...item, similarity: item.bodySimilarity, matchedTerms: item.bodyMatchedTerms })).slice(0, 3));
    const bodyLeafMatches = getPageBodyFolderLeafMatches(profile.folderPath, bookmarkFeatures);
    const folderNameMatched = bodyLeafMatches.length > 0;
    candidates.push({
      id: profile.id,
      title: profile.title,
      folderName: profile.folderName,
      path: profile.folderPath,
      folderPath: profile.folderPath,
      exists: true,
      score,
      count: profile.count,
      leafTagMatches: pathEvidence.leafTagMatches || 0,
      leafContentMatches: pathEvidence.leafContentMatches || 0,
      leafExactContentMatches: pathEvidence.leafExactContentMatches || 0,
      reasons: [
        ...(sameDomainCount > 0 ? [`domain-history:${bookmarkFeatures.domain}`] : []),
        ...(matchedSamples.length > 0 ? [`profile-content:${matchedSamples.length}`] : []),
        ...pathEvidence.reasons,
      ],
      localEvidence: {
        pageContentUsed: bookmarkFeatures.pageContentUsed,
        pageFields: bookmarkFeatures.pageFields,
        matchedTerms,
        sampledCount: profile.samples.length,
        contentSampleCount,
        matchedSampleCount: matchedSamples.length,
        matchedSampleTitles: matchedSamples.map(item => item.item?.title || item.item?.url || '').filter(Boolean).slice(0, 3),
        folderNameMatched,
      },
    });
  }
  return candidates.sort((a, b) => b.score - a.score || b.count - a.count || a.folderPath.localeCompare(b.folderPath, 'zh'));
}

function folderTokenMatchesTag(token, tagTokens) {
  const normalized = String(token || '').toLowerCase().trim();
  if (!normalized || FOLDER_EVIDENCE_STOP_WORDS.has(normalized)) return false;
  return tagTokens.has(normalized);
}

function scoreFolderPathEvidence(folderPath, bookmark, ruleTags, bookmarkFeatures = null) {
  const normalized = normalizeBookmarkFolderPath(folderPath);
  if (!normalized) return { score: 0, reasons: [] };
  const evidenceText = getBookmarkFolderEvidenceText(bookmark);
  const bodyLeafTokens = new Set(getPageBodyFolderLeafMatches(normalized, bookmarkFeatures || collectBookmarkTokenWeights(bookmark, ruleTags))
    .flatMap(tokenizeFolderEvidence));
  const localTagTokens = getTagTokens(ruleTags);
  const reasons = [];
  let score = 0;

  const tokens = getFolderPathTokenEntries(normalized).filter(item => !FOLDER_EVIDENCE_STOP_WORDS.has(item.token));
  const parts = normalized.split('/').filter(Boolean);
  const leafTokens = new Set(tokenizeFolderEvidence(parts[parts.length - 1] || '').filter(token => !FOLDER_EVIDENCE_STOP_WORDS.has(token)));
  let leafMatched = leafTokens.size === 0;
  const leafTagMatches = new Set();
  const leafContentMatches = new Set();
  const leafExactContentMatches = new Set();
  for (const { token, isLeaf, isWholeSegment } of tokens) {
    let matched = false;
    if (folderTokenMatchesTag(token, localTagTokens)) {
      score += isLeaf ? 24 : 4;
      reasons.push(`local-tag:${token}`);
      matched = true;
      if (isLeaf) leafTagMatches.add(token);
    }
    if (folderEvidenceTokenMatchesText(token, evidenceText)) {
      score += isLeaf ? 36 : 8;
      reasons.push(`content:${token}`);
      matched = true;
      if (isLeaf) {
        if (bodyLeafTokens.has(token)) leafContentMatches.add(token);
        if (isWholeSegment && bodyLeafTokens.has(token)) leafExactContentMatches.add(token);
      }
    }
    if (matched && leafTokens.has(token)) leafMatched = true;
  }
  if (parts.length > 1 && !leafMatched) return { score: 0, reasons: [] };
  if (tokens.length > 1 && score > 0) score += 6;

  return {
    score,
    reasons: [...new Set(reasons)],
    leafTagMatches: leafTagMatches.size,
    leafContentMatches: leafContentMatches.size,
    leafExactContentMatches: leafExactContentMatches.size,
  };
}

function scoreHistoricalFolderCandidates(storedBookmarks, suggestedTags, bookmark, aiSuggestion, folderOptions = []) {
  const tags = normalizeTagList(suggestedTags);
  if (tags.length === 0) return [];
  const tagSet = new Set(tags);
  const folderScore = new Map();
  const bookmarkFeatures = collectBookmarkTokenWeights(bookmark, suggestedTags);
  const sampleStats = new Map();
  for (const item of storedBookmarks || []) {
    const path = normalizeBookmarkFolderPath(item?.folderPath);
    if (!path) continue;
    const stats = sampleStats.get(path) || { sampledCount: 0, contentSampleCount: 0 };
    stats.sampledCount += 1;
    if (collectBookmarkTokenWeights(item, item.tags || []).pageContentUsed) stats.contentSampleCount += 1;
    sampleStats.set(path, stats);
  }
  for (const item of storedBookmarks || []) {
    if (!item?.folderPath) continue;
    const normalizedPath = normalizeBookmarkFolderPath(item.folderPath);
    if (!normalizedPath) continue;
    const matchedFolder = folderOptions.length > 0 ? matchBookmarkFolderOption(folderOptions, normalizedPath) : { path: normalizedPath, id: '', title: item.folderName || '' };
    if (!matchedFolder) continue;
    const overlap = normalizeTagList(item.tags).filter(tag => tagSet.has(tag)).length;
    if (overlap <= 0) continue;
    const evidence = scoreFolderPathEvidence(matchedFolder.path, bookmark, tags, bookmarkFeatures);
    if (evidence.score <= 0) continue;
    const key = matchedFolder.path;
    if (!key) continue;
    if (!folderScore.has(key)) {
      const folderName = matchedFolder.title || item.folderName || key.split('/').filter(Boolean).slice(-1)[0] || '';
      folderScore.set(key, {
        count: 0,
        score: 0,
        folderName,
        folderPath: key,
        reasons: new Set(),
        leafTagMatches: 0,
        leafContentMatches: 0,
        leafExactContentMatches: 0,
        matchedSampleTitles: new Set(),
      });
    }
    const candidate = folderScore.get(key);
    candidate.count += overlap;
    candidate.score = Math.max(candidate.score, evidence.score + overlap * 10);
    candidate.leafTagMatches = Math.max(candidate.leafTagMatches, evidence.leafTagMatches || 0);
    candidate.leafContentMatches = Math.max(candidate.leafContentMatches, evidence.leafContentMatches || 0);
    candidate.leafExactContentMatches = Math.max(candidate.leafExactContentMatches, evidence.leafExactContentMatches || 0);
    candidate.matchedSampleTitles.add(item.title || item.url || '');
    for (const reason of evidence.reasons) candidate.reasons.add(reason);
  }
  return [...folderScore.values()]
    .map(item => {
      const stats = sampleStats.get(item.folderPath) || { sampledCount: 0, contentSampleCount: 0 };
      const bodyLeafMatches = getPageBodyFolderLeafMatches(item.folderPath, bookmarkFeatures);
      return {
        ...item,
        reasons: [...item.reasons],
        localEvidence: {
          pageContentUsed: bookmarkFeatures.pageContentUsed,
          pageFields: bookmarkFeatures.pageFields,
          matchedTerms: bodyLeafMatches,
          sampledCount: stats.sampledCount,
          contentSampleCount: stats.contentSampleCount,
          matchedSampleCount: 0,
          matchedSampleTitles: [],
          folderNameMatched: bodyLeafMatches.length > 0,
        },
      };
    })
    .sort((a, b) => b.score - a.score || b.count - a.count || a.folderPath.localeCompare(b.folderPath, 'zh'));
}

function scoreExistingFolderCandidates(folderOptions, suggestedTags, bookmark) {
  const tags = normalizeTagList(suggestedTags);
  const bookmarkFeatures = collectBookmarkTokenWeights(bookmark, suggestedTags);
  const candidates = [];
  const seen = new Set();
  for (const folder of Array.isArray(folderOptions) ? folderOptions : []) {
    const path = normalizeBookmarkFolderPath(folder?.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const evidence = scoreFolderPathEvidence(path, bookmark, tags, bookmarkFeatures);
    if (evidence.score <= 0) continue;
    const bodyLeafMatches = getPageBodyFolderLeafMatches(path, bookmarkFeatures);
    candidates.push({
      id: folder.id || '',
      title: folder.title || path.split('/').filter(Boolean).slice(-1)[0] || '',
      folderName: folder.title || path.split('/').filter(Boolean).slice(-1)[0] || '',
      path,
      folderPath: path,
      exists: true,
      score: evidence.score,
      count: 0,
      reasons: evidence.reasons,
      leafTagMatches: evidence.leafTagMatches || 0,
      leafContentMatches: evidence.leafContentMatches || 0,
      leafExactContentMatches: evidence.leafExactContentMatches || 0,
      localEvidence: {
        pageContentUsed: bookmarkFeatures.pageContentUsed,
        pageFields: bookmarkFeatures.pageFields,
        matchedTerms: bodyLeafMatches,
        sampledCount: 0,
        contentSampleCount: 0,
        matchedSampleCount: 0,
        matchedSampleTitles: [],
        folderNameMatched: bodyLeafMatches.length > 0,
      },
    });
  }
  return candidates.sort((a, b) => b.score - a.score || a.folderPath.localeCompare(b.folderPath, 'zh'));
}

function mergeLocalFolderEvidence(left, right) {
  if (!left && !right) return null;
  const values = [left, right].filter(Boolean);
  return {
    pageContentUsed: values.some(item => item.pageContentUsed === true),
    pageFields: [...new Set(values.flatMap(item => item.pageFields || []))],
    matchedTerms: [...new Set(values.flatMap(item => item.matchedTerms || []))].slice(0, 8),
    sampledCount: Math.max(0, ...values.map(item => Number(item.sampledCount) || 0)),
    contentSampleCount: Math.max(0, ...values.map(item => Number(item.contentSampleCount) || 0)),
    matchedSampleCount: Math.max(0, ...values.map(item => Number(item.matchedSampleCount) || 0)),
    matchedSampleTitles: [...new Set(values.flatMap(item => item.matchedSampleTitles || []))].filter(Boolean).slice(0, 3),
    folderNameMatched: values.some(item => item.folderNameMatched === true),
  };
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
    current.localEvidence = mergeLocalFolderEvidence(current.localEvidence, item.localEvidence);
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


function chooseAISuggestedFolder(aiFolderPath, folderOptions, bookmark, ruleTags) {
  const normalized = normalizeBookmarkFolderPath(aiFolderPath);
  if (!normalized) return null;
  const matched = matchBookmarkFolderOption(folderOptions, normalized);
  if (!matched) return null;
  const evidence = scoreFolderPathEvidence(matched.path, bookmark, ruleTags);
  if (evidence.score <= 0) return null;
  return { path: matched.path, id: matched.id || '', exists: true, score: evidence.score, reasons: evidence.reasons };
}

function recommendationEvidenceFromTagResult(result) {
  const evidence = [];
  const signals = Array.from(result?.signals || []);
  const hasLearnedDomain = signals.some(signal => String(signal || '') === 'learned-domain');
  for (const signal of signals) {
    const value = String(signal || '');
    if (value === 'domain' && hasLearnedDomain) continue;
    let family = 'title_metadata';
    if (value.startsWith('user-override')) family = 'user_rule';
    else if (value === 'folder' || value.startsWith('sibling-') || value.startsWith('temporal-') || value.startsWith('domain-cooccurrence')) family = 'history_profile';
    else if (value === 'domain+path' || value.startsWith('url-path') || value === 'extension' || value === 'query-param') family = 'domain_path';
    else if (value === 'curated-domain') family = 'curated_domain';
    else if (value === 'learned-domain') family = 'learned_rule';
    else if (value === 'domain' || value === 'subdomain') family = 'domain';
    else if (value.startsWith('ai:')) family = 'ai';
    else if (value.startsWith('content-lead-keyword:')) family = 'page_content';
    else if (value.startsWith('content-') || value.startsWith('prototype-') || value.startsWith('tfidf:') || value.startsWith('bayesian:')) family = 'content_semantic';
    evidence.push({ family, strength: 1, reason: value, source: 'local-rule' });
  }
  return evidence;
}

function recommendationEvidenceFromFolderCandidate(candidate, source) {
  const evidence = [];
  const normalizedScore = Math.min(1, Math.max(0.35, Number(candidate?.score || 0) / 100));
  const localEvidence = candidate?.localEvidence;
  if (source === 'profile' && Number(localEvidence?.matchedSampleCount || 0) > 0) {
    evidence.push({ family: 'folder_sample', strength: normalizedScore, reason: `folder-sample:${localEvidence.matchedSampleCount}`, source });
  } else if (source === 'history') {
    evidence.push({ family: 'history_profile', strength: normalizedScore, reason: 'confirmed-folder-history', source });
  }
  if (localEvidence?.pageContentUsed && (localEvidence.matchedTerms || []).length > 0) {
    evidence.push({ family: 'page_content', strength: normalizedScore, reason: `page-content:${localEvidence.matchedTerms.slice(0, 3).join(',')}`, source });
  }
  if (localEvidence?.folderNameMatched) {
    evidence.push({ family: 'folder_name', strength: normalizedScore, reason: 'folder-name-match', source });
  }
  if (Number(candidate?.leafExactContentMatches || 0) > 0 || Number(candidate?.leafContentMatches || 0) >= 2) {
    evidence.push({
      family: 'folder_leaf',
      strength: 1,
      reason: Number(candidate?.leafExactContentMatches || 0) > 0 ? 'folder-leaf-exact-match' : 'folder-leaf-content-match',
      source,
    });
  }
  for (const reason of candidate?.reasons || []) {
    const value = String(reason || '');
    if (value.startsWith('domain-history:')) {
      evidence.push({ family: 'history_profile', strength: 1, reason: value, source });
    } else if (value.startsWith('profile-content:')) {
      if (!evidence.some(item => item.family === 'folder_sample')) {
        evidence.push({ family: 'folder_sample', strength: normalizedScore, reason: value, source });
      }
    } else if (value.startsWith('content:')) {
      evidence.push({ family: 'content_semantic', strength: normalizedScore, reason: value, source });
    } else if (value.startsWith('local-tag:') || value.startsWith('profile-tag:')) {
      evidence.push({ family: 'title_metadata', strength: normalizedScore, reason: value, source });
    } else if (value.startsWith('ai-tag:')) {
      evidence.push({ family: 'ai', strength: normalizedScore, reason: value, source });
    }
  }
  if (evidence.length === 0) evidence.push({ family: 'title_metadata', strength: normalizedScore, reason: source, source });
  return evidence;
}

function withRecommendationEvidence(candidate, source) {
  return {
    ...candidate,
    kind: 'folder',
    source,
    evidence: recommendationEvidenceFromFolderCandidate(candidate, source),
  };
}

function categoryTermMatchesFolderPath(folderPath, tag) {
  const canonical = canonicalizeTagName(tag);
  if (!canonical) return false;
  const terms = typeof getCanonicalCategoryTerms === 'function'
    ? getCanonicalCategoryTerms(canonical)
    : [canonical];
  const segments = normalizeBookmarkFolderPath(folderPath).split('/').filter(Boolean);
  return terms.some((term) => {
    const normalized = String(term || '').toLowerCase().trim();
    if (normalized.length < 2) return false;
    if (/^[a-z0-9]+$/i.test(normalized)) {
      const pattern = new RegExp(`(^|[^a-z0-9])${escapeFolderEvidenceRegExp(normalized)}([^a-z0-9]|$)`, 'i');
      return segments.some(segment => pattern.test(segment));
    }
    return segments.some(segment => segment.toLowerCase().includes(normalized));
  });
}

function addReliableFolderProfileTagEvidence(tagCandidates, folderCandidates, core) {
  const reliableFolders = core.rankCandidates(folderCandidates).filter(candidate => {
    if (!candidate.exists || candidate.support < core.CONFIDENCE_THRESHOLDS.medium) return false;
    return candidate.evidence.some((evidence) => {
      const reason = String(evidence.reason || '');
      return evidence.family === 'user_rule'
        || evidence.family === 'learned_rule'
        || reason.startsWith('domain-history:')
        || reason.startsWith('profile-content:');
    });
  });
  if (reliableFolders.length === 0) return;

  const tags = [...new Set(tagCandidates.map(candidate => canonicalizeTagName(candidate.tag || candidate.label)).filter(Boolean))];
  for (const tag of tags) {
    const folder = reliableFolders.find(candidate => categoryTermMatchesFolderPath(candidate.folderPath || candidate.path, tag));
    if (!folder) continue;
    tagCandidates.push({
      kind: 'tag',
      tag,
      label: tag,
      source: 'folder-profile',
      evidence: [{
        family: 'history_profile',
        strength: 1,
        reason: `folder-profile-tag:${tag}`,
        source: 'folder-profile',
      }],
    });
  }
}

function activeRecommendationRuleCandidates(store, bookmark, folderOptions) {
  const core = self.BookmarkRecommendationCore;
  const hostname = String(bookmark?.domain || extractDomain(bookmark?.url || '') || '').toLowerCase();
  let pathname = '';
  try { pathname = new URL(bookmark?.url || '').pathname.toLowerCase(); } catch {}
  const searchableText = [bookmark?.title, bookmark?.url, bookmark?.metaDesc, bookmark?.excerpt]
    .filter(Boolean).join(' ').toLowerCase();
  const tagCandidates = [];
  const folderCandidates = [];
  for (const rule of store?.rules || []) {
    if (rule.state !== 'active') continue;
    const domainRule = rule.kind === 'domain_tag' || rule.kind === 'domain_folder';
    const domainPathRule = rule.kind === 'domain_path_tag';
    const pathRule = rule.kind === 'path_tag';
    const keywordRule = rule.kind === 'keyword_tag';
    if (!domainRule && !domainPathRule && !pathRule && !keywordRule) continue;
    if (domainRule && !core?.hostnameMatchesRule(hostname, rule.pattern)) continue;
    if (domainPathRule) {
      const slashIndex = rule.pattern.indexOf('/');
      const ruleDomain = slashIndex > 0 ? rule.pattern.slice(0, slashIndex) : '';
      const rulePath = slashIndex > 0 ? `/${rule.pattern.slice(slashIndex + 1).replace(/^\/+|\/+$/g, '')}` : '';
      if (!ruleDomain || !rulePath || !core?.hostnameMatchesRule(hostname, ruleDomain)
        || !(pathname === rulePath || pathname.startsWith(`${rulePath}/`))) continue;
    }
    if (pathRule) {
      const rulePath = `/${rule.pattern.replace(/^\/+|\/+$/g, '')}`;
      if (!rulePath || !(pathname === rulePath || pathname.startsWith(`${rulePath}/`) || pathname.includes(`${rulePath}/`))) continue;
    }
    if (keywordRule) {
      const matched = typeof keywordMatchesWhole === 'function'
        ? keywordMatchesWhole(rule.pattern, searchableText)
        : searchableText.includes(rule.pattern);
      if (!matched) continue;
    }
    const family = rule.source === 'user' ? 'user_rule' : 'learned_rule';
    const evidence = [{ family, strength: 1, reason: `${rule.kind}:${rule.pattern}`, source: rule.source }];
    if (rule.kind === 'domain_tag' || rule.kind === 'domain_path_tag' || rule.kind === 'path_tag' || rule.kind === 'keyword_tag') {
      tagCandidates.push({ kind: 'tag', tag: rule.target, label: rule.target, evidence, source: rule.source });
      continue;
    }
    const existing = matchBookmarkFolderOption(folderOptions, rule.target);
    folderCandidates.push({
      kind: 'folder', id: existing?.id || '', folderId: existing?.id || '',
      title: existing?.title || rule.target.split('/').slice(-1)[0] || '',
      folderName: existing?.title || rule.target.split('/').slice(-1)[0] || '',
      path: existing?.path || rule.target, folderPath: existing?.path || rule.target,
      exists: !!existing, evidence, source: rule.source,
    });
  }
  return { tagCandidates, folderCandidates };
}

async function buildBookmarkRecommendation(bookmark, options = {}) {
  const core = self.BookmarkRecommendationCore;
  if (!core) throw new Error('recommendation_core_unavailable');
  const store = options.store || await ensureRecommendationStore();
  if (options.preloaded !== true && typeof preloadSmartTaggerCaches === 'function') await preloadSmartTaggerCaches();
  const folderOptions = options.folderOptions || await loadBookmarkFolderOptions().catch(() => []);
  const storedBookmarks = options.storedBookmarks || await getStoredBookmarks().catch(() => []);
  const samplePool = storedBookmarks.filter(item => !bookmark?.id || item.id !== bookmark.id);
  const folderMatchBookmarks = await hydrateFolderSamplesFromContentCache(sampleFolderBookmarks(samplePool));
  const ruleTags = typeof autoTagBookmark === 'function'
    ? await autoTagBookmark(bookmark, { skipAI: true })
    : [];

  const tagCandidates = ruleTags
    .filter(item => item?.tag
      && item.tag !== '其他'
      && (typeof isCanonicalCategoryTag !== 'function'
        || isCanonicalCategoryTag(item.tag)
        || item.signals?.some(signal => String(signal).startsWith('user-override'))))
    .map(item => ({
      kind: 'tag', tag: canonicalizeTagName(item.tag), label: canonicalizeTagName(item.tag), source: 'local-rule',
      evidence: recommendationEvidenceFromTagResult(item),
    }));
  const learned = activeRecommendationRuleCandidates(store, bookmark, folderOptions);
  tagCandidates.push(...learned.tagCandidates);
  const initialLocalTags = core.rankCandidates(tagCandidates);
  const tagNames = initialLocalTags.map(item => item.tag);

  const historyCandidates = scoreHistoricalFolderCandidates(folderMatchBookmarks, tagNames, bookmark, null, folderOptions)
    .map(item => withRecommendationEvidence(item, 'history'));
  const existingCandidates = scoreExistingFolderCandidates(folderOptions, tagNames, bookmark, null)
    .map(item => withRecommendationEvidence(item, 'existing'));
  const profileCandidates = scoreFolderProfileCandidates(folderMatchBookmarks, folderOptions, bookmark, tagNames, null)
    .map(item => withRecommendationEvidence(item, 'profile'));
  let folderCandidates = [...learned.folderCandidates, ...historyCandidates, ...existingCandidates, ...profileCandidates];
  addReliableFolderProfileTagEvidence(tagCandidates, folderCandidates, core);
  const localTags = core.rankCandidates(tagCandidates);
  const aiCandidateTags = localTags.map(item => ({
    tag: item.tag,
    score: Math.round(item.support * 100),
    confidence: item.support,
    signals: item.reasons || [],
  }));
  let summary = core.summarizeRecommendation(tagCandidates, folderCandidates);
  const signalConflict = summary.tags.length > 1 && summary.tags[0].margin < core.CONFIDENCE_THRESHOLDS.mediumMargin;
  const needsNewFolder = !summary.folders.some(item => item.support >= core.CONFIDENCE_THRESHOLDS.medium) && summary.tags.length > 0;
  const gate = core.shouldTriggerAI(summary, { signalConflict, needsNewFolder });
  let aiSuggestion = null;
  let aiError = '';
  let aiAttempted = false;
  const preferredFolderPaths = [
    ...summary.folders,
    ...[...folderCandidates].sort((left, right) => Number(right?.score || 0) - Number(left?.score || 0)),
  ].map(item => normalizeBookmarkFolderPath(item?.folderPath || item?.path))
    .filter((path, index, paths) => path && paths.indexOf(path) === index);

  let aiEnabled = false;
  if (options.allowAI !== false && gate.trigger && typeof getAIConfig === 'function') {
    const config = await getAIConfig().catch(() => null);
    aiEnabled = !!(config?.enabled && config?.apiKey && config?.assistClassificationEnabled !== false);
  }
  if (aiEnabled && typeof suggestBookmarkWithAI === 'function') {
    aiAttempted = true;
    try {
      aiSuggestion = await suggestBookmarkWithAI(bookmark, aiCandidateTags, { folderOptions, preferredFolderPaths });
    } catch (error) {
      aiError = error?.message || String(error || 'AI request failed');
    }
  }

  if (aiSuggestion) {
    for (const item of aiSuggestion.tags || []) {
      if (!item?.tag || item.tag === '其他') continue;
      tagCandidates.push({
        kind: 'tag', tag: item.tag, label: item.tag, source: 'ai',
        evidence: [{ family: 'ai', strength: item.confidence ?? 1, reason: `ai-tag:${item.tag}`, source: 'ai' }],
      });
    }
    const aiPath = normalizeBookmarkFolderPath(aiSuggestion.folderPath);
    if (aiPath) {
      const matched = matchBookmarkFolderOption(folderOptions, aiPath);
      const pageFeatures = collectBookmarkTokenWeights(bookmark, aiCandidateTags);
      const pathEvidence = scoreFolderPathEvidence(aiPath, bookmark, aiCandidateTags, pageFeatures);
      const bodyLeafMatches = getPageBodyFolderLeafMatches(aiPath, pageFeatures);
      const localEvidence = {
        pageContentUsed: pageFeatures.pageContentUsed,
        pageFields: pageFeatures.pageFields,
        matchedTerms: bodyLeafMatches,
        sampledCount: 0,
        contentSampleCount: 0,
        matchedSampleCount: 0,
        matchedSampleTitles: [],
        folderNameMatched: bodyLeafMatches.length > 0,
      };
      const evidence = [{ family: 'ai', strength: 1, reason: 'ai-folder', source: 'ai' }];
      if (pathEvidence.reasons.some(reason => reason.startsWith('local-tag:'))) {
        evidence.push({ family: 'title_metadata', strength: 1, reason: 'local-tag-folder-alignment', source: 'local-rule' });
      }
      if (bodyLeafMatches.length > 0) {
        evidence.push({ family: 'page_content', strength: 1, reason: 'page-content-folder-alignment', source: 'local-rule' });
      }
      if (matched) {
        folderCandidates.push({
          kind: 'folder', id: matched.id || '', folderId: matched.id || '', title: matched.title || '',
          folderName: matched.title || '', path: matched.path, folderPath: matched.path,
          exists: true, evidence, localEvidence, source: 'ai',
        });
      } else {
        const validation = core.validateNewFolderPath(aiPath, folderOptions);
        if (validation.valid) {
          folderCandidates.push({
            kind: 'folder', id: '', folderId: '', title: aiPath.split('/').slice(-1)[0] || '',
            folderName: aiPath.split('/').slice(-1)[0] || '', path: aiPath, folderPath: aiPath,
            exists: false, evidence, localEvidence, source: 'ai',
          });
        }
      }
    }
    summary = core.summarizeRecommendation(tagCandidates, folderCandidates);
  }

  summary.folders = summary.folders.filter((candidate) => candidate.exists || (
    candidate.confidence === 'high'
    && candidate.positiveFamilies?.includes('ai')
    && candidate.positiveFamilies.some(family => family !== 'ai')
  ));
  const top = summary.folders[0] || summary.tags[0] || null;
  summary.confidence = top?.confidence || 'none';
  summary.abstained = !top || top.confidence === 'none';
  summary.selectedFolderPath = summary.folders[0]?.confidence === 'high'
    ? (summary.folders[0].folderPath || summary.folders[0].path || '')
    : '';

  const recommendation = {
    version: 2,
    recommendationId: makeRecommendationId(),
    ruleVersion: core.RULE_VERSION,
    createdAt: Date.now(),
    tags: summary.tags,
    folders: summary.folders,
    confidence: summary.confidence,
    abstained: summary.abstained,
    selectedFolderPath: summary.selectedFolderPath,
    ai: {
      triggered: aiAttempted,
      reason: gate.reason,
      status: aiSuggestion ? 'succeeded' : (aiAttempted ? (aiError ? 'failed' : 'unavailable') : (gate.trigger ? 'disabled' : 'skipped')),
      error: aiError,
    },
    ruleTags: aiCandidateTags,
    aiSuggestion,
  };
  await enqueueFolderSampleContentBackfill(
    folderMatchBookmarks,
    summary.folders.map(item => item.folderPath || item.path || ''),
  ).catch(() => {});
  if (options.persist !== false) await persistRecommendationSnapshot(recommendation, bookmark);
  return recommendation;
}

async function queueNewBookmarkRecommendation(bookmark) {
  const recommendation = await buildBookmarkRecommendation(bookmark);
  if ((recommendation.tags || []).length === 0 && (recommendation.folders || []).length === 0) return null;
  return enqueueRecommendationReviewItem({
    id: makeRecommendationId('review'),
    type: 'bookmark_recommendation',
    bookmarkId: bookmark.id,
    recommendationId: recommendation.recommendationId,
    title: bookmark.title || bookmark.url || '',
    urlFingerprint: recommendationUrlFingerprint(bookmark.url),
    confidence: recommendation.confidence,
    aiTriggered: recommendation.ai?.triggered === true,
    sourceParentId: bookmark.parentId || '',
    sourceTags: bookmark.tags || [],
  });
}

async function queueBookmarkMoveObservation(bookmark, fromFolderPath, toFolderId, toFolderPath) {
  const normalizedTarget = normalizeBookmarkFolderPath(toFolderPath);
  if (!bookmark?.id || !bookmark?.url || !normalizedTarget) return null;
  const recommendation = {
    version: 2,
    recommendationId: makeRecommendationId('move_observation'),
    ruleVersion: self.BookmarkRecommendationCore?.RULE_VERSION || 'bookmark-recommendation-v3',
    tags: [],
    folders: [{
      id: String(toFolderId || ''),
      folderId: String(toFolderId || ''),
      folderPath: normalizedTarget,
      path: normalizedTarget,
      exists: true,
      support: 1,
      confidence: 'high',
    }],
    selectedTags: [],
    selectedFolderPath: normalizedTarget,
  };
  await persistRecommendationSnapshot(recommendation, bookmark);
  return enqueueRecommendationReviewItem({
    id: makeRecommendationId('move_review'),
    type: 'move_observation',
    bookmarkId: bookmark.id,
    recommendationId: recommendation.recommendationId,
    title: bookmark.title || bookmark.url || '',
    urlFingerprint: recommendationUrlFingerprint(bookmark.url),
    fromFolderPath,
    toFolderId,
    toFolderPath: normalizedTarget,
    confidence: 'high',
  });
}

async function reevaluateBookmarkRecommendations(ids, options = {}) {
  const requestedIds = new Set((Array.isArray(ids) ? ids : []).slice(0, 100));
  const storedBookmarks = await getStoredBookmarks();
  const targets = requestedIds.size > 0
    ? storedBookmarks.filter(item => requestedIds.has(item.id))
    : storedBookmarks.slice(0, Math.min(100, Math.max(1, Number(options.limit) || 50)));
  const folderOptions = await loadBookmarkFolderOptions().catch(() => []);
  const items = [];
  for (const bookmark of targets) {
    try {
      const recommendation = await buildBookmarkRecommendation(bookmark, {
        folderOptions,
        storedBookmarks,
        allowAI: options.allowAI === true,
      });
      items.push({ id: bookmark.id, status: 'succeeded', recommendation });
    } catch (error) {
      items.push({ id: bookmark.id, status: 'failed', reason: error?.message || 'recommendation_failed' });
    }
  }
  return makeBatchResult(items);
}

async function recommendTagsForBookmarks(bookmarks, concurrency = 3) {
  const items = Array.isArray(bookmarks) ? bookmarks : [];
  if (items.length === 0) return [];
  if (typeof preloadSmartTaggerCaches === 'function') await preloadSmartTaggerCaches();
  const [folderOptions, storedBookmarks, store] = await Promise.all([
    loadBookmarkFolderOptions().catch(() => []),
    getStoredBookmarks().catch(() => []),
    ensureRecommendationStore(),
  ]);
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      const bookmark = items[index];
      try {
        const recommendation = await buildBookmarkRecommendation(bookmark, {
          folderOptions,
          storedBookmarks,
          store,
          preloaded: true,
          persist: false,
        });
        const topTag = recommendation.tags?.[0];
        const tags = !recommendation.abstained && topTag?.confidence === 'high' && topTag.tag
          ? [topTag.tag]
          : [];
        results[index] = { ...bookmark, tags, tagsAuto: tags };
      } catch {
        results[index] = { ...bookmark, tags: [], tagsAuto: [] };
      }
    }
  });
  await Promise.all(runners);
  return results;
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

function splitLocalSummarySentences(text) {
  const normalized = normalizeExtractedText(text);
  if (!normalized) return [];
  const sentences = [];
  for (const paragraph of normalized.split(/\n+/)) {
    const chunks = paragraph.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [paragraph];
    for (const chunk of chunks) {
      const sentence = normalizeExtractedText(chunk);
      if (sentence.length >= 12) sentences.push(sentence);
    }
  }
  return sentences.slice(0, 80);
}

function buildLocalPageSummary(tempItem) {
  const bodyText = normalizeExtractedText(tempItem?.contentText || '');
  const compactBodyText = bodyText.replace(/\s+/g, ' ');
  const leadExcerpt = [tempItem?.excerpt, tempItem?.contentExcerpt]
    .map(value => normalizeExtractedText(value).replace(/\s+/g, ' '))
    .find(value => value.length >= 20 && compactBodyText.includes(value));
  if (leadExcerpt) return leadExcerpt.slice(0, 240);
  const sentences = splitLocalSummarySentences(bodyText);
  if (sentences.length > 0) {
    const referenceTokens = new Set(tokenizeFolderEvidence([
      tempItem?.contentTitle,
      tempItem?.title,
      ...(Array.isArray(tempItem?.headings) ? tempItem.headings : []),
      ...(Array.isArray(tempItem?.contentHeadings) ? tempItem.contentHeadings : []),
    ].filter(Boolean).join(' ')).filter(token => !FOLDER_EVIDENCE_STOP_WORDS.has(token)));
    const frequency = new Map();
    const candidates = sentences.map((sentence, index) => {
      const tokens = [...new Set(tokenizeFolderEvidence(sentence)
        .filter(token => !FOLDER_EVIDENCE_STOP_WORDS.has(token)))];
      for (const token of tokens) frequency.set(token, (frequency.get(token) || 0) + 1);
      return { sentence, index, tokens };
    });
    for (const candidate of candidates) {
      const referenceMatches = candidate.tokens.filter(token => referenceTokens.has(token)).length;
      const topicWeight = candidate.tokens.reduce((sum, token) => sum + Math.log1p(frequency.get(token) || 0), 0);
      const density = (referenceMatches * 4 + topicWeight) / Math.sqrt(Math.max(1, candidate.tokens.length));
      const readableLength = candidate.sentence.length >= 20 && candidate.sentence.length <= 180 ? 1 : 0;
      candidate.score = density + readableLength + 1 / (candidate.index + 1);
    }
    const selected = candidates
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 2)
      .sort((left, right) => left.index - right.index)
      .map(item => item.sentence);
    const summary = normalizeExtractedText(selected.join(' '));
    if (summary) return summary.slice(0, 240);
  }
  if (bodyText) return bodyText.slice(0, 240);
  return normalizeExtractedText(
    tempItem?.excerpt
    || tempItem?.metaDesc
    || tempItem?.contentExcerpt
    || tempItem?.contentMetaDesc
    || '',
  ).slice(0, 240);
}

function buildLocalClassificationReason(candidate, language = 'zh', fallbackEvidence = null, pageSummary = '') {
  const evidence = candidate?.localEvidence || fallbackEvidence || {};
  const chinese = String(language).toLowerCase().startsWith('zh');
  const parts = [];
  const terms = (evidence.matchedTerms || []).filter(Boolean).slice(0, 5);
  const sampledCount = Number(evidence.sampledCount) || 0;
  const matchedSampleCount = Number(evidence.matchedSampleCount) || 0;
  const folderName = candidate?.folderName
    || candidate?.title
    || normalizeBookmarkFolderPath(candidate?.folderPath || candidate?.path || '').split('/').filter(Boolean).slice(-1)[0]
    || '';

  const summary = normalizeExtractedText(pageSummary).slice(0, 160);
  if (evidence.pageContentUsed && summary) {
    parts.push(chinese ? `正文概要：“${summary}”` : `Content summary: “${summary}”`);
  }
  if (evidence.pageContentUsed && terms.length > 0) {
    parts.push(chinese
      ? `页面正文命中 ${terms.join('、')}`
      : `Page content matched ${terms.join(', ')}`);
  } else if (evidence.pageContentUsed && !summary) {
    parts.push(chinese ? '页面正文已参与本地分类' : 'Page content was used for local classification');
  }
  if (sampledCount > 0) {
    parts.push(chinese
      ? `与该目录随机抽取的 ${sampledCount} 条书签中 ${matchedSampleCount} 条形成正文相似匹配`
      : `Content matched ${matchedSampleCount} of ${sampledCount} randomly sampled bookmarks in this folder`);
  }
  if (evidence.folderNameMatched && folderName) {
    parts.push(chinese
      ? `目录叶子名称命中 ${folderName}`
      : `The folder leaf name matched ${folderName}`);
  }
  const reliableRule = (candidate?.positiveFamilies || []).some(family => ['user_rule', 'curated_domain', 'learned_rule'].includes(family));
  if (reliableRule) {
    parts.push(chinese
      ? '命中用户确认、人工配置或高可靠学习规则'
      : 'Matched a user-confirmed, curated, or reliable learned rule');
  }
  if (parts.length > 0) {
    const hasClassificationEvidence = terms.length > 0 || matchedSampleCount > 0 || evidence.folderNameMatched || reliableRule;
    if (!hasClassificationEvidence) {
      parts.push(candidate
        ? (chinese ? '该目录候选仍需手动确认' : 'This folder candidate still needs manual confirmation')
        : (chinese ? '正文与目录候选之间的交叉证据不足，请手动确认分类' : 'Cross-evidence between the content and folder candidates is insufficient; confirm the folder manually'));
    }
    return `${parts.join(chinese ? '；' : '; ')}${chinese ? '。' : '.'}`;
  }
  if (evidence.pageContentUsed) {
    return chinese
      ? '已读取页面正文，但正文与目录名称或目录样本之间的交叉证据不足，请手动确认分类。'
      : 'Page content was read, but it did not have enough cross-evidence with the folder name or samples. Confirm the folder manually.';
  }
  return chinese
    ? '未读取到可用正文，本次仅使用目录名称、标题、URL 与现有本地规则判断。'
    : 'No usable page content was read; this result uses the folder name, title, URL, and existing local rules.';
}

function buildLocalBookmarkSuggestion(tempItem, ruleTags, suggestedFolder, aiSuggestion, aiError) {
  const ruleTagNames = normalizeTagList(ruleTags);
  const aiTagNames = normalizeTagList(aiSuggestion?.tags);
  const mergedTags = aiTagNames.length > 0 && typeof mergeAITags === 'function'
    ? mergeAITags(ruleTags, aiSuggestion.tags, 3)
    : ruleTags;
  const finalTags = normalizeTagList(mergedTags).slice(0, 3);
  const localPageSummary = buildLocalPageSummary(tempItem);
  const pageFeatures = suggestedFolder?.localEvidence ? null : collectBookmarkTokenWeights(tempItem);
  const localEvidence = suggestedFolder?.localEvidence || {
    pageContentUsed: pageFeatures.pageContentUsed,
    pageFields: pageFeatures.pageFields,
    matchedTerms: [],
    sampledCount: 0,
    contentSampleCount: 0,
    matchedSampleCount: 0,
    matchedSampleTitles: [],
    folderNameMatched: false,
  };
  const localReason = buildLocalClassificationReason(suggestedFolder, 'zh', localEvidence, localPageSummary);
  const localReasonEn = buildLocalClassificationReason(suggestedFolder, 'en', localEvidence, localPageSummary);
  return {
    title: tempItem.title || tempItem.url,
    url: tempItem.url,
    domain: tempItem.domain || extractDomain(tempItem.url),
    tags: finalTags,
    folderName: suggestedFolder?.title || '',
    folderPath: suggestedFolder?.path || '',
    folderId: suggestedFolder?.id || '',
    summary: aiSuggestion?.summary || localPageSummary,
    localPageSummary,
    reason: aiSuggestion?.reason || (aiError && !suggestedFolder ? 'AI 建议生成失败，当前本地证据不足，请手动选择分类。' : localReason),
    reasonEn: aiSuggestion?.reasonEn || (aiError && !suggestedFolder ? 'The AI suggestion failed and local evidence is insufficient. Choose a folder manually.' : localReasonEn),
    evidence: (aiSuggestion?.evidence?.length ? aiSuggestion.evidence : suggestedFolder?.evidence) || [],
    localEvidence,
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
  const duplicate = await findExistingBookmarkByUrl(tab.url);
  // Local rules always use page content. The AI privacy setting only controls
  // whether this already-extracted content can be included in AI prompts.
  const contentData = tab.id && tab.url
    ? await extractActiveTabContent(tab.id, tab.url)
    : null;
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

  const folderOptions = await loadBookmarkFolderOptions().catch(() => []);
  const storedBookmarks = await getStoredBookmarks().catch(() => []);
  const recommendation = await buildBookmarkRecommendation(tempItem, { folderOptions, storedBookmarks });
  const selectedFolder = recommendation.folders[0]?.confidence === 'high' ? recommendation.folders[0] : null;
  const aiSuggestion = recommendation.aiSuggestion;
  const draft = buildLocalBookmarkSuggestion(
    tempItem,
    recommendation.ruleTags,
    selectedFolder,
    aiSuggestion,
    recommendation.ai.error,
  );
  draft.tags = recommendation.tags[0]?.confidence === 'high'
    ? [recommendation.tags[0].tag]
    : [];
  draft.recommendationId = recommendation.recommendationId;
  draft.ruleVersion = recommendation.ruleVersion;
  draft.recommendationConfidence = recommendation.confidence;
  draft.abstained = recommendation.abstained;
  draft.tagCandidates = recommendation.tags;
  draft.folderCandidates = recommendation.folders;
  draft.ai = recommendation.ai;
  draft.aiAvailable = recommendation.ai.status === 'succeeded';
  draft.aiTriggered = recommendation.ai.triggered;
  draft.recommendedFolderPath = selectedFolder?.folderPath || selectedFolder?.path || '';
  draft.recommendedFolderExists = !!selectedFolder?.exists;
  draft.folderPath = draft.recommendedFolderPath;
  draft.folderId = selectedFolder?.id || selectedFolder?.folderId || '';
  draft.folderName = selectedFolder?.folderName || selectedFolder?.title || draft.folderName;
  draft.localEvidence = selectedFolder?.localEvidence || draft.localEvidence || null;
  if (!aiSuggestion) {
    draft.reason = buildLocalClassificationReason(selectedFolder, 'zh', draft.localEvidence, draft.localPageSummary);
    draft.reasonEn = buildLocalClassificationReason(selectedFolder, 'en', draft.localEvidence, draft.localPageSummary);
  }
  draft.folderOptions = folderOptions;
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
  if (!isSafeExternalUrl(draft.url)) return { success: false, error: 'invalid_url' };

  let feedbackSnapshot = null;
  if (draft.recommendationId) {
    const store = await ensureRecommendationStore();
    feedbackSnapshot = store.snapshots.find(item => item.recommendationId === draft.recommendationId) || null;
    if (!feedbackSnapshot) return { success: false, error: 'recommendation_not_found' };
    if (feedbackSnapshot.urlFingerprint !== recommendationUrlFingerprint(draft.url)) {
      return { success: false, error: 'recommendation_url_mismatch' };
    }
  }

  const duplicate = await findExistingBookmarkByUrl(draft.url);
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
  const folderOptions = await loadBookmarkFolderOptions().catch(() => []);

  // The editable path is authoritative. Never keep a stale folder id after the
  // user changes the recommendation in the confirmation drawer.
  if (draft.folderMode === 'new') parentId = '';

  if (draft.folderMode === 'new' && folderPath) {
    const exactFolder = matchBookmarkFolderOption(folderOptions, folderPath);
    if (exactFolder) {
      parentId = exactFolder.id || '';
      folderPath = exactFolder.path || folderPath;
      folderName = exactFolder.title || folderName;
    } else {
      const validation = self.BookmarkRecommendationCore?.validateNewFolderPath(folderPath, folderOptions);
      if (validation && !validation.valid) {
        return { success: false, error: `invalid_folder_path:${validation.reason}` };
      }
    }
  }

  if (parentId && draft.folderMode !== 'new') {
    const selectedFolder = folderOptions.find(folder => folder.id === parentId);
    if (!selectedFolder) return { success: false, error: 'folder_not_found' };
    if (folderPath && normalizeBookmarkFolderPath(selectedFolder.path) !== folderPath) {
      return { success: false, error: 'folder_selection_mismatch' };
    }
    folderPath = selectedFolder.path;
    folderName = selectedFolder.title || folderName;
  }

  if (draft.folderMode === 'new' && folderPath && !parentId) {
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
    title: String(draft.title || draft.url).slice(0, 512),
    url: draft.url
  };
  if (parentId) createOpts.parentId = parentId;
  let createdBookmark;
  if (duplicate && draft.duplicateAction === 'move') {
    markProgrammaticBookmarkMove(duplicate.id, parentId || duplicate.parentId || '');
    try {
      createdBookmark = await chrome.bookmarks.move(duplicate.id, parentId ? { parentId } : {});
    } catch (error) {
      programmaticBookmarkMoves.delete(duplicate.id);
      throw error;
    }
    pendingQuickBookmarks.delete(draft.url);

    // Moving does not emit onCreated, so update the mirrored record ourselves.
    await mutateStoredBookmarks((stored) => stored.map((item) => item.id !== createdBookmark.id ? item : {
      ...item,
      parentId: createdBookmark.parentId || parentId || item.parentId,
      title: createdBookmark.title || draft.title || item.title,
      folderName,
      folderPath,
      tags: finalTags,
      tagsAuto: finalTags,
      contentText: draft.contentText || item.contentText || '',
      contentTitle: draft.contentTitle || item.contentTitle || '',
      contentExcerpt: draft.excerpt || draft.summary || item.contentExcerpt || '',
      contentMetaDesc: draft.metaDesc || item.contentMetaDesc || '',
      contentMetaKeywords: Array.isArray(draft.metaKeywords) && draft.metaKeywords.length > 0
        ? draft.metaKeywords
        : (item.contentMetaKeywords || []),
      contentHeadings: Array.isArray(draft.headings) && draft.headings.length > 0
        ? draft.headings
        : (item.contentHeadings || []),
      contentStructuredTypes: Array.isArray(draft.structuredTypes) && draft.structuredTypes.length > 0
        ? draft.structuredTypes
        : (item.contentStructuredTypes || []),
      contentFetchedAt: draft.contentFetchedAt || item.contentFetchedAt || null,
      contentStatus: draft.contentStatus || item.contentStatus || (draft.contentText ? 'success' : 'failed'),
      contentFailureReason: draft.contentFailureReason || '',
      contentSource: draft.contentSource || item.contentSource || '',
      aiSuggestion: {
        tags: finalTags,
        summary: draft.summary || '',
        reason: draft.reason || '',
        evidence: Array.isArray(draft.evidence) ? draft.evidence : []
      }
    }));
  } else {
    createdBookmark = await chrome.bookmarks.create(createOpts);
  }

  const dfText = `${draft.title || ''} ${(draft.contentText || '').slice(0, 1000)} ${draft.url || ''}`;
  if (typeof updateDocFrequency === 'function') {
    await runSerializedOperationDomain('legacy_recommendation_corpus', () => updateDocFrequency(dfText, draft.url)).catch(() => {});
  }
  if (draft.url) {
    const domain = String(extractDomain(draft.url) || '').trim().toLowerCase();
    if (domain) {
      await mutateLegacyDynamicRules((rules) => ({
        ...rules,
        seenDomains: [...new Set([...(rules.seenDomains || []), domain])],
      })).catch(() => {});
    }
  }

  let feedback = null;
  if (draft.recommendationId && feedbackSnapshot) {
      const originalFolder = normalizeBookmarkFolderPath(feedbackSnapshot.selectedFolderPath || '');
      const originalTags = normalizeTagList(feedbackSnapshot.selectedTags || []);
      const changedFields = [];
      if (originalFolder !== folderPath) changedFields.push('folder');
      if (originalTags.join('\u0000').toLowerCase() !== finalTags.join('\u0000').toLowerCase()) changedFields.push('tags');
      feedback = await submitRecommendationFeedback({
        operationId: draft.operationId || makeRecommendationId('save'),
        recommendationId: draft.recommendationId,
        bookmarkId: createdBookmark.id,
        outcome: changedFields.length > 0 ? 'modified' : 'accepted',
        changedFields,
        selection: { folderPath, tags: finalTags },
      });
  }

  return {
    success: true,
    bookmarkId: createdBookmark.id,
    tags: finalTags,
    folderName,
    folderPath,
    moved: !!duplicate && draft.duplicateAction === 'move',
    copied: !!duplicate && draft.duplicateAction === 'copy',
    feedback,
  };
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
      const tagCandidates = Array.isArray(panelState.tagCandidates) ? panelState.tagCandidates.slice(0, 3) : [];
      const folderOptions = Array.isArray(panelState.folderOptions) ? panelState.folderOptions : [];
      const folderCandidates = Array.isArray(panelState.folderCandidates) ? panelState.folderCandidates.slice(0, 3) : [];
      const isChinese = String(panelState.panelLanguage || '').toLowerCase().startsWith('zh');
      const copy = isChinese ? {
        title: '智能分类建议', analyzingPage: '正在分析当前页面', loading: '正在分析页面并生成分类建议...', cancel: '取消收藏', titleLabel: '标题', aiCategory: '目录候选', existingCategory: '已有目录', newCategory: '新目录候选', newPrefix: '新建：', newCategoryLabel: '新建分类', searchCategory: '搜索已有分类，例如 公司 / 项目 / 文档', matchingCategories: '匹配的已有分类', selectCategory: '选择书签分类', useExisting: '沿用已有：', selectExisting: '选择已有分类...', manualPath: '手动输入路径...', pathExample: '例如：工作/公司/项目', categoryHint: '仅高置信建议会预选；也可以搜索已有目录或输入新路径。', tags: '标签', tagHint: '用逗号分隔', recommendedPath: '推荐路径', summary: '摘要说明', summaryHint: '可手动补充摘要', reason: '归类理由', reasonHint: '可手动补充归类理由', contentReady: '已读取页面正文（$1 字）并用于本地分类。', contentFallback: '未读取到可用正文，本次使用标题、URL 与目录画像判断。', aiReady: 'AI 已在低置信或冲突时参与校验，你可以继续确认或修改。', localReady: '当前建议由本地规则与目录画像生成。', noRecommendation: '当前证据不足，暂不预选分类。', retry: '重新分析', reject: '不采用建议', rejected: '已记录拒绝，请手动选择分类或直接收藏。', high: '高置信', medium: '中置信', low: '低置信', confirm: '确认收藏', duplicateTitle: '该页面已收藏', duplicateNote: '该页面已收藏在“$1”（$2）。请选择将它移动到当前目标，或在当前目标保留一份副本。', copy: '保留副本', move: '移动到此处', saving: '正在收藏...', saved: '已收藏', duplicateError: '该页面已经在书签中。', saveFailed: '收藏失败：', unknown: '未知错误', searchMatches: '匹配 $1 个已有分类，可点击结果或按 Enter 选中', searchHint: '可直接下拉选择，也可搜索 $1 个已有分类'
      } : {
        title: 'Smart folder suggestion', analyzingPage: 'Analyzing the current page', loading: 'Analyzing the page and preparing suggestions...', cancel: 'Cancel bookmark', titleLabel: 'Title', aiCategory: 'Folder candidates', existingCategory: 'Existing folder', newCategory: 'New folder candidate', newPrefix: 'Create: ', newCategoryLabel: 'Create new folder', searchCategory: 'Search folders, e.g. Work / Projects / Docs', matchingCategories: 'Matching folders', selectCategory: 'Choose bookmark folder', useExisting: 'Use existing: ', selectExisting: 'Choose an existing folder...', manualPath: 'Enter a path manually...', pathExample: 'Example: Work/Company/Project', categoryHint: 'Only high-confidence suggestions are preselected. You can search or enter another path.', tags: 'Tags', tagHint: 'Separate with commas', recommendedPath: 'Suggested path', summary: 'Summary', summaryHint: 'Add a summary', reason: 'Why this folder', reasonHint: 'Add a reason', contentReady: 'Page content was read ($1 characters) and used for local classification.', contentFallback: 'No usable page content was read; this result uses the title, URL, and folder profiles.', aiReady: 'AI was used to verify a low-confidence or conflicting result.', localReady: 'Suggestions are based on local rules and folder profiles.', noRecommendation: 'Evidence is insufficient, so no folder was preselected.', retry: 'Analyze again', reject: 'Reject suggestion', rejected: 'Rejection recorded. Choose a folder manually or save without one.', high: 'High', medium: 'Medium', low: 'Low', confirm: 'Save bookmark', duplicateTitle: 'This page is already bookmarked', duplicateNote: 'This page is already in “$1” ($2). Move it to the current destination or keep a copy there.', copy: 'Keep a copy', move: 'Move here', saving: 'Saving...', saved: 'Saved', duplicateError: 'This page is already bookmarked.', saveFailed: 'Could not save: ', unknown: 'Unknown error', searchMatches: '$1 matching folders. Click a result or press Enter to select it.', searchHint: 'Choose from the list or search $1 existing folders'
      };
      const format = (text, ...values) => values.reduce((result, value, index) => result.replace(`$${index + 1}`, value), text);
      const contentLength = String(panelState.contentText || '').trim().length;
      const contentStatusText = panelState.localEvidence?.pageContentUsed === true && contentLength > 0
        ? format(copy.contentReady, contentLength)
        : copy.contentFallback;
      const candidateEvidenceText = (candidate) => {
        const evidence = candidate?.localEvidence || {};
        const terms = (evidence.matchedTerms || []).filter(Boolean).slice(0, 3);
        const details = [];
        if (evidence.pageContentUsed && terms.length > 0) {
          details.push(isChinese ? `正文命中：${terms.join('、')}` : `Content: ${terms.join(', ')}`);
        }
        if (Number(evidence.sampledCount) > 0) {
          details.push(isChinese
            ? `样本 ${Number(evidence.matchedSampleCount) || 0}/${Number(evidence.sampledCount)}`
            : `Samples ${Number(evidence.matchedSampleCount) || 0}/${Number(evidence.sampledCount)}`);
        }
        if (evidence.folderNameMatched) details.push(isChinese ? '目录叶子命中' : 'Folder leaf matched');
        if (details.length === 0 && (candidate?.positiveFamilies || []).some(family => ['user_rule', 'curated_domain', 'learned_rule'].includes(family))) {
          details.push(isChinese ? '命中已确认的本地规则' : 'Confirmed local rule matched');
        }
        return details.join(' · ');
      };
      const candidateClassificationReason = (candidate) => {
        const evidence = candidate?.localEvidence || {};
        const details = [];
        const localSummary = String(panelState.localPageSummary || (!panelState.aiAvailable ? panelState.summary : '') || '').trim().slice(0, 160);
        const pageContentUsed = evidence.pageContentUsed === true || panelState.localEvidence?.pageContentUsed === true;
        const terms = (evidence.matchedTerms || []).filter(Boolean).slice(0, 5);
        const sampledCount = Number(evidence.sampledCount) || 0;
        const matchedSampleCount = Number(evidence.matchedSampleCount) || 0;
        const folderPath = String(candidate?.folderPath || candidate?.path || '');
        const folderName = candidate?.folderName || candidate?.title || folderPath.split('/').filter(Boolean).slice(-1)[0] || '';
        if (pageContentUsed && localSummary) {
          details.push(isChinese ? `正文概要：“${localSummary}”` : `Content summary: “${localSummary}”`);
        }
        if (pageContentUsed && terms.length > 0) {
          details.push(isChinese ? `页面正文命中 ${terms.join('、')}` : `Page content matched ${terms.join(', ')}`);
        }
        if (sampledCount > 0) {
          details.push(isChinese
            ? `与随机抽取的 ${sampledCount} 条目录书签中 ${matchedSampleCount} 条形成正文相似匹配`
            : `Content matched ${matchedSampleCount} of ${sampledCount} randomly sampled folder bookmarks`);
        }
        if (evidence.folderNameMatched && folderName) {
          details.push(isChinese ? `目录叶子名称命中 ${folderName}` : `The folder leaf name matched ${folderName}`);
        }
        const reliableRule = (candidate?.positiveFamilies || []).some(family => ['user_rule', 'curated_domain', 'learned_rule'].includes(family));
        if (reliableRule) {
          details.push(isChinese ? '命中已确认的本地规则' : 'Matched a confirmed local rule');
        }
        if (terms.length === 0 && matchedSampleCount === 0 && !evidence.folderNameMatched && !reliableRule) {
          details.push(isChinese ? '该目录候选仍需手动确认' : 'This folder candidate still needs manual confirmation');
        }
        return details.join(isChinese ? '；' : '; ') + (details.length > 0 ? (isChinese ? '。' : '.') : '');
      };
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
      const confidenceText = value => copy[value] || copy.low;
      const candidateHtml = folderCandidates.length > 0
        ? folderCandidates.map((candidate, candidateIndex) => {
          const path = localizeRootPath(candidate.folderPath || candidate.path || '');
          const reasons = candidateEvidenceText(candidate);
          return `<button type="button" class="ab-candidate${path === recommendedPath ? ' is-selected' : ''}" data-candidate-index="${candidateIndex}" data-candidate-path="${esc(path)}" data-candidate-id="${esc(candidate.id || candidate.folderId || '')}" data-candidate-existing="${candidate.exists ? 'true' : 'false'}"><span><strong>${esc(path)}</strong>${reasons ? `<small>${esc(reasons)}</small>` : ''}</span><em class="is-${esc(candidate.confidence || 'low')}">${esc(confidenceText(candidate.confidence))}</em></button>`;
        }).join('')
        : `<div class="ab-abstain">${copy.noRecommendation}</div>`;
      const selectedTagSet = new Set(tags.map(tag => String(tag).toLowerCase()));
      const tagCandidateHtml = tagCandidates.map(candidate => {
        const tag = String(candidate.tag || '');
        const selected = selectedTagSet.has(tag.toLowerCase());
        return `<button type="button" class="ab-tag-candidate${selected ? ' is-selected' : ''}" data-tag="${esc(tag)}" aria-pressed="${selected}"><span>#${esc(tag)}</span><em class="is-${esc(candidate.confidence || 'low')}">${esc(confidenceText(candidate.confidence))}</em></button>`;
      }).join('');
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
          #${ROOT_ID} .ab-candidates{display:grid;gap:6px;margin-bottom:10px}
          #${ROOT_ID} .ab-candidate{width:100%;min-height:50px;padding:8px 9px;border:1px solid rgba(0,0,0,.08);border-radius:7px;background:#fff;color:#1d1d1f;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;box-shadow:none}
          #${ROOT_ID} .ab-candidate:hover,#${ROOT_ID} .ab-candidate.is-selected{border-color:#0a84ff;background:rgba(10,132,255,.07);transform:none}
          #${ROOT_ID} .ab-candidate span{min-width:0;display:grid;gap:3px}
          #${ROOT_ID} .ab-candidate strong{font-size:12px;overflow-wrap:anywhere}
          #${ROOT_ID} .ab-candidate small{font-size:10px;color:#6e6e73;overflow-wrap:anywhere}
          #${ROOT_ID} .ab-candidate em{flex:0 0 auto;font-size:10px;font-style:normal;font-weight:700;color:#6e6e73}
          #${ROOT_ID} .ab-candidate em.is-high{color:#188038} #${ROOT_ID} .ab-candidate em.is-medium{color:#9a6700}
          #${ROOT_ID} .ab-tag-candidates{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
          #${ROOT_ID} .ab-tag-candidate{min-height:30px;padding:5px 9px;border:1px solid rgba(0,0,0,.1);border-radius:7px;background:#fff;color:#1d1d1f;display:inline-flex;align-items:center;gap:7px;box-shadow:none}
          #${ROOT_ID} .ab-tag-candidate:hover,#${ROOT_ID} .ab-tag-candidate.is-selected{border-color:#0a84ff;background:rgba(10,132,255,.07);transform:none}
          #${ROOT_ID} .ab-tag-candidate span{font-size:11px;font-weight:650}
          #${ROOT_ID} .ab-tag-candidate em{font-size:10px;font-style:normal;color:#6e6e73}
          #${ROOT_ID} .ab-tag-candidate em.is-high{color:#188038} #${ROOT_ID} .ab-tag-candidate em.is-medium{color:#9a6700}
          #${ROOT_ID} .ab-abstain{padding:9px 10px;border-left:3px solid #8e8e93;background:rgba(118,118,128,.08);font-size:11px;color:#6e6e73}
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
          #${ROOT_ID} .ab-content-status{margin-top:12px;font-size:11px;line-height:1.45;color:${contentLength >= 80 ? '#188038' : '#9a6700'}}
          #${ROOT_ID} .ab-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
          #${ROOT_ID} button{border:0;border-radius:999px;padding:9px 16px;font:inherit;font-size:13px;font-weight:650;cursor:pointer;transition:.16s transform,.16s background,.16s opacity;min-height:36px}
          #${ROOT_ID} button:active{transform:scale(.98)} #${ROOT_ID} button:disabled{opacity:.55;cursor:not-allowed;transform:none}
          #${ROOT_ID} .ab-secondary{background:rgba(118,118,128,.12);color:#1d1d1f}
          #${ROOT_ID} .ab-primary{background:#0a84ff;color:white;box-shadow:0 8px 20px rgba(10,132,255,.28)}
          #${ROOT_ID} .ab-error{background:rgba(255,59,48,.1);color:#c42b1c}
          @media(max-width:560px){#${ROOT_ID} .ab-card{width:100vw;padding:16px}#${ROOT_ID} .ab-grid{grid-template-columns:1fr}#${ROOT_ID} .ab-actions{flex-wrap:wrap}#${ROOT_ID} button{flex:1}}
        </style>
        <section class="ab-card" role="dialog" aria-modal="false" aria-labelledby="abTitle">
          <div class="ab-head"><div class="ab-icon">${panelState.aiTriggered ? 'AI' : 'A'}</div><div class="ab-head-copy"><h2 id="abTitle">${copy.title}</h2><div class="ab-sub">${esc(panelState.title || copy.analyzingPage)}<br>${esc(panelState.url || '')}</div></div><button class="ab-close" data-act="cancel" aria-label="${isChinese ? String.fromCharCode(0x5173, 0x95ed) : 'Close'}" title="${isChinese ? String.fromCharCode(0x5173, 0x95ed) : 'Close'}">&times;</button></div>
          ${panelState.status === 'loading' ? `
            <div class="ab-loading"><span class="ab-dot"></span><span class="ab-dot"></span><span class="ab-dot"></span><span>${copy.loading}</span></div>
            <div class="ab-actions"><button class="ab-secondary" data-act="cancel">${copy.cancel}</button></div>
          ` : `
            <label>${copy.titleLabel}</label><input id="abTitleInput" value="${esc(panelState.title)}">
            <div class="ab-folder-card">
              <div class="ab-folder-head"><div class="ab-folder-title">${copy.aiCategory}</div><div class="ab-folder-badge">${recommendedExists ? copy.existingCategory : copy.newCategory}</div></div>
              <div class="ab-candidates" role="listbox" aria-label="${copy.aiCategory}">${candidateHtml}</div>
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
            <div class="ab-grid"><div><label>${copy.tags}</label><input id="abTagsInput" value="${esc(tags.join(', '))}" placeholder="${copy.tagHint}">${tagCandidateHtml ? `<div class="ab-tag-candidates" role="group" aria-label="${copy.tags}">${tagCandidateHtml}</div>` : ''}</div><div><label>${copy.recommendedPath}</label><input value="${esc(recommendedPath)}" disabled></div></div>
            <label>${copy.summary}</label><textarea id="abSummaryInput" placeholder="${copy.summaryHint}">${esc(panelState.summary || '')}</textarea>
            <label>${copy.reason}</label><textarea id="abReasonInput" placeholder="${copy.reasonHint}">${esc((isChinese ? panelState.reason : panelState.reasonEn) || panelState.reason || '')}</textarea>
            <div class="ab-content-status">${esc(contentStatusText)}</div>
            <div class="ab-note">${esc(panelState.aiError || (panelState.aiAvailable ? copy.aiReady : (panelState.abstained ? copy.noRecommendation : copy.localReady)))}</div>
            <div class="ab-actions"><button class="ab-secondary" data-act="retry">${copy.retry}</button><button class="ab-secondary" data-act="reject">${copy.reject}</button><button class="ab-secondary" data-act="cancel">${copy.cancel}</button><button class="ab-primary" data-act="confirm">${copy.confirm}</button></div>
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
      const reasonInput = root.querySelector('#abReasonInput');
      const getExistingFolderOptions = () => Array.from(folderSelect?.options || [])
        .filter(opt => opt.value && !opt.value.startsWith('__') && !opt.disabled);
      let selectedExistingFolder = recommendedExists && recommendedPath
        ? { id: panelState.folderId || '', path: recommendedPath, displayPath: recommendedPath }
        : null;
      let activeFolderResult = 0;
      let folderDropdownOpen = false;
      let folderBlurTimer = null;
      const makeOperationId = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
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
        const matchedCandidate = folderCandidates.find(candidate => (candidate.folderPath || candidate.path || '') === opt.value);
        if (matchedCandidate && reasonInput) reasonInput.value = candidateClassificationReason(matchedCandidate);
        updateDestination();
      };
      root.querySelectorAll('.ab-candidate').forEach(candidateButton => {
        candidateButton.addEventListener('click', () => {
          const path = candidateButton.dataset.candidatePath || '';
          const selectedCandidate = folderCandidates[Number(candidateButton.dataset.candidateIndex)] || null;
          const option = getExistingFolderOptions().find(item =>
            (item.dataset?.displayPath || item.value) === path || item.value === path
          );
          root.querySelectorAll('.ab-candidate').forEach(item => item.classList.toggle('is-selected', item === candidateButton));
          if (selectedCandidate && reasonInput) reasonInput.value = candidateClassificationReason(selectedCandidate);
          if (option) {
            selectExistingFolder(option);
          } else if (folderSearch) {
            selectedExistingFolder = null;
            folderSearch.value = path;
            folderSearch.dataset.userSearching = path ? 'true' : '';
            filterFolderOptions();
            updateDestination();
          }
        });
      });
      const tagsInput = root.querySelector('#abTagsInput');
      const syncTagCandidateSelection = () => {
        const selected = new Set((tagsInput?.value || '').split(/[,，]/).map(value => value.trim().toLowerCase()).filter(Boolean));
        root.querySelectorAll('.ab-tag-candidate').forEach((button) => {
          const active = selected.has(String(button.dataset.tag || '').toLowerCase());
          button.classList.toggle('is-selected', active);
          button.setAttribute('aria-pressed', String(active));
        });
      };
      root.querySelectorAll('.ab-tag-candidate').forEach(button => button.addEventListener('click', () => {
        if (!tagsInput) return;
        const candidateTag = String(button.dataset.tag || '').trim();
        const values = tagsInput.value.split(/[,，]/).map(value => value.trim()).filter(Boolean);
        const index = values.findIndex(value => value.toLowerCase() === candidateTag.toLowerCase());
        if (index >= 0) values.splice(index, 1);
        else if (candidateTag) values.push(candidateTag);
        tagsInput.value = values.join(', ');
        syncTagCandidateSelection();
      }));
      tagsInput?.addEventListener('input', syncTagCandidateSelection);
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
          chrome.runtime.sendMessage({
            action: 'cancelQuickBookmarkSuggestion',
            url: panelState.url,
            recommendationId: panelState.recommendationId || '',
            operationId: makeOperationId('cancel')
          }).catch(() => {});
          close();
          return;
        }
        if (act === 'reject') {
          if (panelState.recommendationId) {
            await chrome.runtime.sendMessage({
              action: 'submitBookmarkRecommendationFeedback',
              recommendationId: panelState.recommendationId,
              operationId: makeOperationId('reject'),
              outcome: 'rejected',
              changedFields: [],
              selection: {}
            }).catch(() => null);
          }
          panelState.recommendationId = '';
          selectedExistingFolder = null;
          if (folderSearch) folderSearch.value = '';
          if (tagsInput) tagsInput.value = '';
          root.querySelectorAll('.ab-candidate, .ab-tag-candidate').forEach(item => {
            item.classList.remove('is-selected');
            if (item.classList.contains('ab-tag-candidate')) item.setAttribute('aria-pressed', 'false');
          });
          const note = root.querySelector('.ab-note');
          if (note) note.textContent = copy.rejected;
          updateDestination();
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
            operationId: makeOperationId('save'),
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
          const resp = await chrome.runtime.sendMessage({
            action: 'confirmQuickBookmarkSuggestion',
            operationId: draft.operationId,
            recommendationId: panelState.recommendationId || '',
            selection: { folderId: draft.folderId, folderPath: draft.folderPath, folderMode: draft.folderMode, tags: draft.tags },
            draft
          }).catch(err => ({ success:false, error: err?.message || String(err) }));
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
    if (item.tags.length === 0 && typeof autoTagBookmark === 'function') {
      try {
        const localTags = normalizeTagList(
          (await autoTagBookmark(item, { skipAI: true })).map(tag => tag.tag),
        );
        item.tags = localTags;
        item.tagsAuto = localTags;
      } catch (error) {
        console.warn('Local bookmark tagging failed:', error);
      }
    }

    let duplicate = false;
    await mutateStoredBookmarks((existing) => {
      duplicate = existing.some((bm) => bm.id === item.id || (bm.url === item.url && bm.dateAdded === item.dateAdded));
      return duplicate ? existing : [item, ...existing];
    });
    if (duplicate) return null;

    let contentTask = Promise.resolve(item);
    if (!pending?.contentText && item.url) {
      contentTask = fetchBookmarkContent(item.url, { forceRefresh: false, renderFallback: false }).then(async (content) => {
        const contentPatch = {
          contentText: content.textContent || '',
          contentTitle: content.title || item.contentTitle || '',
          contentExcerpt: content.excerpt || '',
          contentMetaDesc: content.metaDesc || '',
          contentMetaKeywords: content.metaKeywords || [],
          contentHeadings: content.headings || [],
          contentStructuredTypes: content.structuredTypes || [],
          contentFetchedAt: content.fetchedAt || Date.now(),
          contentStatus: content.status || 'failed',
          contentFailureReason: content.failureReason || '',
          contentSource: content.source || '',
        };
        let refreshedLocalTags = null;
        const hasExtractedPageSignals = contentPatch.contentText.length >= 80
          || !!contentPatch.contentMetaDesc
          || !!contentPatch.contentExcerpt
          || contentPatch.contentMetaKeywords.length > 0
          || contentPatch.contentHeadings.length > 0
          || contentPatch.contentStructuredTypes.length > 0;
        if (!pending && hasExtractedPageSignals && typeof autoTagBookmark === 'function') {
          try {
            refreshedLocalTags = normalizeTagList(
              (await autoTagBookmark({ ...item, ...contentPatch }, { skipAI: true })).map(tag => tag.tag),
            );
          } catch (error) {
            console.warn('Content-enriched local bookmark tagging failed:', error);
          }
        }
        let enrichedItem = item;
        await mutateStoredBookmarks((bookmarks) => bookmarks.map((stored) => {
          if (stored.id !== item.id && (stored.url !== item.url || stored.dateAdded !== item.dateAdded)) return stored;
          enrichedItem = {
            ...stored,
            ...contentPatch,
            contentTitle: contentPatch.contentTitle || stored.contentTitle || '',
          };
          if (refreshedLocalTags) {
            Object.assign(enrichedItem, applyLocalAutoTags(stored.tags, stored.tagsAuto, refreshedLocalTags));
          }
          return enrichedItem;
        }));
        if (refreshedLocalTags) {
          chrome.runtime.sendMessage({ action: 'tagsUpdated', bookmarkId: item.id }).catch(() => {});
        }
        return enrichedItem;
      }).catch(err => {
        console.warn('Bookmark content backfill failed:', err);
        return item;
      });
    }

    // 桌面通知：一键收藏成功后，根据用户设置弹出系统通知
    if (pending) {
      const settings = await chrome.storage.local.get(['notificationEnabled']);
      if (settings.notificationEnabled) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '../icons/icon128.png',
          title: item.title || 'Bookmark Saved',
          message: (item.tags && item.tags.length > 0)
            ? `已保存，标签：${item.tags.join(', ')}`
            : '已保存'
        }).catch(() => {});
      }
    }

    return { item, hadPending: !!pending, contentTask };
  } catch (err) {
    console.error('增量同步失败:', err);
    return null;
  }
}

async function updateBookmark(id, changes) {
  try {
    const native = await chrome.bookmarks.get(id).catch(() => null);
    await mutateStoredBookmarks((existing) => {
      let index = existing.findIndex((item) => item.id === id);
      if (index < 0 && native?.[0]?.url) index = existing.findIndex((item) => item.url === native[0].url);
      if (index < 0) return existing;
      const next = existing.slice();
      next[index] = {
        ...existing[index],
        id,
        title: changes.title !== undefined ? changes.title : existing[index].title,
        url: changes.url !== undefined ? changes.url : existing[index].url,
        domain: changes.url !== undefined ? extractDomain(changes.url) : existing[index].domain,
      };
      return next;
    });
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
      const lastClickedAt = count > 0
        ? Math.max(...visits.map((visit) => Number(visit.visitTime) || 0))
        : null;
      if (count !== (item.clickCount || 0) || lastClickedAt !== (item.lastClickedAt || null)) {
        updated.push({ id: item.id, url: item.url, clickCount: count, lastClickedAt });
      }
    } catch (e) {
      // 某些 URL（如 chrome://）不支持 history API，静默忽略
    }
  });
  return updated;
}

function applyClickCountUpdates(bookmarks, updates) {
  const byId = new Map((updates || []).filter(item => item.id).map(item => [item.id, item]));
  const byUrl = new Map((updates || []).filter(item => item.url).map(item => [item.url, item]));
  for (const item of bookmarks || []) {
    const update = byId.get(item.id) || byUrl.get(item.url);
    if (!update || update.url !== item.url) continue;
    item.clickCount = update.clickCount;
    item.lastClickedAt = update.lastClickedAt;
  }
  return bookmarks;
}

let clickCountRefreshInFlight = null;
async function refreshStoredClickCounts() {
  if (!clickCountRefreshInFlight) {
    clickCountRefreshInFlight = (async () => {
      const bookmarks = await getStoredBookmarks();
      const updated = await enrichClickCounts(bookmarks, 10);
      if (updated.length > 0) {
        const updatesById = new Map(updated.filter(item => item.id).map(item => [item.id, item]));
        const updatesByUrl = new Map(updated.filter(item => item.url).map(item => [item.url, item]));
        await mutateStoredBookmarks((current) => current.map((item) => {
          const update = updatesById.get(item.id) || updatesByUrl.get(item.url);
          if (!update || update.url !== item.url) return item;
          return { ...item, clickCount: update.clickCount, lastClickedAt: update.lastClickedAt };
        }));
      }
      return { updated: updated.length };
    })().finally(() => { clickCountRefreshInFlight = null; });
  }
  return clickCountRefreshInFlight;
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

    // 3. 智能标签：复用统一异步推荐内核，证据不足时允许不打标签。
    let tagNames = [];
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
      const [recommended] = await recommendTagsForBookmarks([tempItem], 1);
      tagNames = recommended?.tags || [];
    } catch { /* 标签失败不阻塞保存 */ }

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
chrome.runtime.onConnect.addListener((port) => {
  const ownerId = getIncrementalClassificationPortOwner(port);
  if (!ownerId) {
    port.disconnect();
    return;
  }

  let disconnected = false;
  let operation = Promise.resolve();
  activeIncrementalClassificationOwners.add(ownerId);

  const respond = (payload) => {
    if (disconnected) return;
    try { port.postMessage(payload); } catch { /* the disconnect handler owns cleanup */ }
  };
  port.onMessage.addListener((message) => {
    if (disconnected || !message || typeof message !== 'object') return;
    const action = message.action;
    const requestId = message.requestId;
    const validationError = validateRuntimeMessage(message);
    const supported = ['claim', 'heartbeat', 'fail', 'complete', 'release'].includes(action);
    const needsIds = ['fail', 'complete', 'release'].includes(action);
    const requestError = validationError
      || (!supported ? 'invalid_action' : '')
      || (action !== 'heartbeat' && typeof requestId !== 'string' ? 'invalid_request_id' : '')
      || (needsIds && !Array.isArray(message.ids) ? 'invalid_ids' : '')
      || (action === 'fail' && typeof message.error !== 'string' ? 'invalid_error' : '');
    if (requestError) {
      if (typeof requestId === 'string') respond({ requestId, success: false, error: requestError });
      return;
    }

    if (action === 'heartbeat') {
      operation = operation
        .then(() => heartbeatIncrementalClassificationQueue(ownerId))
        .catch((error) => console.warn('增量分类租约心跳失败:', error));
      return;
    }

    operation = operation.then(async () => {
      let queue;
      if (action === 'claim') queue = await claimIncrementalClassificationQueue(ownerId);
      else if (action === 'fail') queue = await failIncrementalClassificationQueue(message.ids, message.error, ownerId);
      else if (action === 'complete') queue = await completeIncrementalClassificationQueue(message.ids, ownerId);
      else queue = await releaseIncrementalClassificationQueue(message.ids, ownerId);
      respond({ requestId, success: true, queue });
    }).catch((error) => {
      respond({ requestId, success: false, error: String(error?.message || error || 'incremental_queue_unavailable').slice(0, 240) });
    });
  });

  port.onDisconnect.addListener(() => {
    if (disconnected) return;
    disconnected = true;
    activeIncrementalClassificationOwners.delete(ownerId);
    operation = operation
      .catch(() => undefined)
      .then(() => releaseIncrementalClassificationOwner(ownerId))
      .catch((error) => console.warn('增量分类租约断线释放失败:', error));
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || (sender?.id && sender.id !== chrome.runtime.id)) {
    sendResponse({ success: false, error: 'invalid_message_sender' });
    return false;
  }
  // 桥接器与主后台共享同一 Service Worker；桥接器负责的消息不能被通用 action 分发抢先回包。
  if (self.AIBookmarkBridge?.ownsRuntimeMessage?.(message)) return false;
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
        sendResponse({ success: true, bookmarks: await getStoredBookmarks() });
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
        let total = bookmarks.length;
        await mutateStoredBookmarks((current) => {
          const filtered = current.filter((item) => item.id !== message.id);
          total = filtered.length;
          return filtered;
        });
        await addTombstone(target);
        sendResponse({ success: true, total });
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
        const retentionDays = await getEffectiveRetentionDays();
        await mutateTombstones(async (current) => {
          const merged = [...await pruneTombstones(current, retentionDays)];
          const keys = new Set(merged.map(t => t.url + '_' + t.dateAdded));
          for (const item of bookmarks) {
            if (!removedIds.has(item.id) || !item.url) continue;
            const key = item.url + '_' + item.dateAdded;
            if (!keys.has(key)) {
              merged.push({ ...item, deletedAt: Date.now() });
              keys.add(key);
            }
          }
          return merged;
        });
        let remainingCount = 0;
        await mutateStoredBookmarks((current) => {
          const remaining = current.filter((item) => !removedIds.has(item.id));
          remainingCount = remaining.length;
          return remaining;
        });
        sendResponse({
          success: failedIds.length === 0,
          removed: removedIds.size,
          failed: failedIds.length,
          total: remainingCount,
          error: failedIds.length ? 'some_bookmarks_could_not_be_deleted' : undefined,
        });
      })();
      return true;

    case 'updateBookmark':
      (async () => {
        const { id, title, url, tags, tagsAuto } = message;
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
        await mutateStoredBookmarks((bookmarks) => bookmarks.map((item) => {
          if (item.id !== id) return item;
          const nextTags = tags !== undefined ? normalizeTagList(tags) : item.tags;
          const requestedAutoTags = tagsAuto !== undefined ? tagsAuto : item.tagsAuto;
          const nextTagsAuto = normalizeTagList(requestedAutoTags)
            .filter(tag => (nextTags || []).some(candidate => candidate.toLowerCase() === tag.toLowerCase()));
          return {
            ...item,
            ...(title !== undefined ? { title } : {}),
            ...(url !== undefined ? { url, domain: extractDomain(url) } : {}),
            ...(tags !== undefined ? { tags: nextTags } : {}),
            ...(tagsAuto !== undefined || tags !== undefined ? { tagsAuto: nextTagsAuto } : {}),
          };
        }));
        sendResponse({ success: true });
      })();
      return true;

    case 'scheduleChecker':
      scheduleCheckerAlarm().then(() => {
        sendResponse({ success: true });
      }).catch((err) => {
        sendResponse({ success: false, error: err?.message || 'schedule_checker_failed' });
      });
      return true;

    case 'getCheckerSettings':
      getCheckSettings().then((settings) => {
        sendResponse({ success: true, settings });
      }).catch((err) => {
        sendResponse({ success: false, error: err?.message || 'get_checker_settings_failed' });
      });
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
        const idSet = new Set(ids);
        let updated = 0;
        await mutateStoredBookmarks((bookmarks) => bookmarks.map((item) => {
          if (!idSet.has(item.id)) return item;
          updated++;
          if (mode === 'addTag' && addTags) return { ...item, tags: Array.from(new Set([...(item.tags || []), ...addTags])) };
          if (mode === 'removeTag' && removeTags) return { ...item, tags: (item.tags || []).filter(t => !removeTags.includes(t)) };
          if (mode === 'setTags' && tags) return { ...item, tags: [...tags] };
          if (mode === 'pin') return { ...item, pinned: true, pinnedAt: Date.now() };
          if (mode === 'unpin') return { ...item, pinned: false, pinnedAt: null };
          updated--;
          return item;
        }));
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
        await Promise.all(removed.map((bookmark) => addTombstone(bookmark)));
        let remainingCount = 0;
        await mutateStoredBookmarks((current) => {
          const remaining = current.filter((item) => !removedIds.has(item.id));
          remainingCount = remaining.length;
          return remaining;
        });
        sendResponse({
          success: failedIds.length === 0,
          removed: removedIds.size,
          failed: failedIds.length,
          total: remainingCount,
          error: failedIds.length ? 'some_bookmarks_could_not_be_deleted' : undefined,
        });
      })();
      return true;

    case 'healthDeleteBookmarks':
      (async () => {
        sendResponse(await deleteHealthBookmarks(message.ids || [], message.operationId));
      })();
      return true;

    case 'healthUndoDelete':
      (async () => {
        sendResponse(await undoHealthBookmarks(message.operationId));
      })();
      return true;

    case 'exportData':
      (async () => {
        const [bookmarks, tree] = await Promise.all([getStoredBookmarks(), buildBookmarkExportTree()]);
        sendResponse({ success: true, version: 2, exportedAt: Date.now(), bookmarks, tree });
      })();
      return true;

    case 'importData':
    case 'importBookmarksV2':
      (async () => {
        sendResponse(await runIdempotentOperation(
          'bookmark-import',
          message.operationId,
          () => runSerializedOperationDomain('bookmark-import', () => importBookmarksV2(message)),
        ));
      })();
      return true;

    case 'getImportOperations':
      (async () => {
        sendResponse({ success: true, operations: await getImportOperations() });
      })();
      return true;

    case 'retryImportOperation':
      (async () => {
        sendResponse(await runIdempotentOperation(
          'bookmark-import-retry',
          message.requestId,
          () => runSerializedOperationDomain('bookmark-import', () => retryImportOperation(message.operationId)),
        ));
      })();
      return true;

    case 'rollbackImportOperation':
      (async () => {
        sendResponse(await runIdempotentOperation(
          'bookmark-import-rollback',
          message.requestId,
          () => runSerializedOperationDomain('bookmark-import', () => rollbackImportOperation(message.operationId)),
        ));
      })();
      return true;

    case 'incrementalQueueGet':
      (async () => sendResponse({ success: true, queue: await getIncrementalClassificationQueue() }))();
      return true;

    case 'labelCacheGet':
      (async () => sendResponse({ success: true, cache: await getLabelCache() }))();
      return true;

    case 'labelCacheMerge':
      (async () => sendResponse({ success: true, cache: await mergeLabelCache(message.cacheEntries || []) }))();
      return true;

    case 'labelCacheClear':
      (async () => {
        await mutateStorageResource(LABEL_CACHE_KEY, () => undefined);
        sendResponse({ success: true });
      })();
      return true;

    case 'incrementalQueueEnqueue':
      (async () => sendResponse({ success: true, queue: await enqueueIncrementalClassificationEntries(message.entries) }))();
      return true;

    case 'incrementalQueueFail':
      (async () => {
        const queue = await failIncrementalClassificationQueue(message.ids || [], message.error);
        sendResponse({ success: true, queue });
      })();
      return true;

    case 'incrementalQueueComplete':
      (async () => {
        const queue = await completeIncrementalClassificationQueue(message.ids || []);
        sendResponse({ success: true, queue });
      })();
      return true;

    case 'incrementalQueueRetry':
      (async () => {
        const queue = await retryIncrementalClassificationQueue(message.ids || []);
        sendResponse({ success: true, queue });
      })();
      return true;

    case 'incrementalQueueRelease':
      (async () => {
        const queue = await releaseIncrementalClassificationQueue(message.ids || []);
        sendResponse({ success: true, queue });
      })();
      return true;

    case 'incrementalQueueAbandon':
      (async () => {
        const queue = await abandonIncrementalClassificationQueue(message.ids || []);
        sendResponse({ success: true, queue });
      })();
      return true;

    case 'incrementalQueueReleaseOwner':
      // 客户端在端口意外断开时补发的显式释放；正常情况下端口 onDisconnect 已释放，
      // 此处作为兜底，把该 owner 仍占用的 running 项退回 pending。
      (async () => {
        const queue = await releaseIncrementalClassificationOwner(message.ownerId);
        sendResponse({ success: true, queue });
      })();
      return true;

    case 'getTombstones':
      (async () => {
        const retentionDays = await getEffectiveRetentionDays();
        const tombstones = await mutateTombstones((current) => pruneTombstones(current, retentionDays));
        const settings = await getAppSettings();
        sendResponse({ success: true, tombstones, retentionDays, retentionOptions: TOMBSTONE_RETENTION_OPTIONS });
      })();
      return true;

    case 'restoreTombstone':
      (async () => {
        sendResponse(await runSerializedOperationDomain('tombstones', async () => {
          const tombstones = await getTombstones();
          const item = tombstones.find(t => t.url === message.url && t.dateAdded === message.dateAdded);
          if (!item) return { success: false, error: 'Tombstone not found' };
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
          await mutateStoredBookmarks((stored) => stored.map((bookmark) => bookmark.id === restored.id
            ? { ...bookmark, index: restored.index }
            : bookmark));
            await mutateTombstones((current) => current.filter(t => !(t.url === item.url && t.dateAdded === item.dateAdded)));
            return { success: true, bookmarkId: created.id, restoredToFallback: restore.restoredToFallback };
          } catch (err) {
            return { success: false, error: err.message };
          }
        }));
      })();
      return true;

    case 'purgeTombstone':
      (async () => {
        const next = await mutateTombstones((current) => current.filter(t => !(t.url === message.url && t.dateAdded === message.dateAdded)));
        sendResponse({ success: true, total: next.length });
      })();
      return true;

    case 'clearTombstones':
      (async () => {
        await mutateTombstones(() => []);
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
          await mutateTombstones((current) => pruneTombstones(current, days));
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

    // ===== AI 请求代理：在 SW 内执行网络 I/O，规避扩展页面的 CORS 预检开销 =====
    // 页面（sidepanel/settings）把已构造好的请求交给 SW 发出；SW 具备 host 权限，
    // 对已授权源不触发浏览器 OPTIONS 预检，从而消除“配置页比 AI 工具慢/报错”的主要来源。
    // 仅代理网络传输，分类的批次编排/降级/解析仍留在页面。
    case 'aiProxyFetch': {
      (async () => {
        try {
          const result = await aiProxyFetch(message.request || {});
          sendResponse({ success: true, ...result });
        } catch (e) {
          sendResponse({ success: false, error: e && e.message ? e.message : String(e) });
        }
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
          const previous = await getAIConfig();
          const config = await setAIConfig(message.config || {});
          if (previous.allowPageContentForAi !== config.allowPageContentForAi) {
            await clearAICache();
          }
          sendResponse({ success: true, config });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'getAIConnectionEndpoint': {
      const resolved = resolveProvider(message.config || {});
      if (!resolved?.endpoint) {
        sendResponse({ success: false, error: 'invalid_ai_provider_config' });
      } else {
        sendResponse({ success: true, endpoint: resolved.endpoint });
      }
      return false;
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
      // 兼容旧页面：访问次数统一由 Chrome History 提供，不能在这里再次累加。
      sendResponse({ success: true, deprecated: true, source: 'chrome_history' });
      return false;
    }

    case 'refreshClickCounts': {
      refreshStoredClickCounts()
        .then(result => sendResponse({ success: true, ...result }))
        .catch(error => sendResponse({ success: false, error: error?.message || 'history_refresh_failed' }));
      return true;
    }

    case 'suggestFolder': {
      (async () => {
        const { url, title } = message;
        const tempItem = { url: url || '', title: title || '', domain: extractDomain(url || '') };
        const result = await buildBookmarkRecommendation(tempItem);
        const folder = result.folders[0]?.confidence === 'high' ? result.folders[0] : null;
        sendResponse({
          success: true,
          folder: folder ? { id: folder.id || folder.folderId || '', title: folder.title || folder.folderName || '', path: folder.folderPath || folder.path || '' } : null,
          folders: result.folders,
          tags: result.tags,
          recommendationId: result.recommendationId,
          confidence: result.confidence,
          abstained: result.abstained,
          ai: result.ai,
        });
      })();
      return true;
    }

    case 'getBookmarkRecommendation': {
      (async () => {
        try {
          const bookmark = message.bookmark && typeof message.bookmark === 'object'
            ? message.bookmark
            : { id: message.id || '', url: message.url || '', title: message.title || '' };
          if (!isSafeExternalUrl(bookmark.url)) {
            sendResponse({ success: false, error: 'invalid_url' });
            return;
          }
          const recommendation = await buildBookmarkRecommendation({
            ...bookmark,
            domain: bookmark.domain || extractDomain(bookmark.url),
          }, { allowAI: message.allowAI !== false });
          sendResponse({ success: true, recommendation });
        } catch (error) {
          sendResponse({ success: false, error: error?.message || 'recommendation_failed' });
        }
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
          const draft = { ...(message.draft || {}) };
          draft.operationId = message.operationId || draft.operationId || makeRecommendationId('save');
          draft.recommendationId = message.recommendationId || draft.recommendationId || '';
          if (message.selection && typeof message.selection === 'object') {
            draft.folderId = message.selection.folderId || draft.folderId || '';
            draft.folderPath = message.selection.folderPath ?? draft.folderPath;
            draft.folderMode = message.selection.folderMode || draft.folderMode;
            draft.tags = message.selection.tags || draft.tags;
          }
          const result = await runIdempotentOperation(
            'confirm_quick_bookmark',
            draft.operationId,
            () => saveConfirmedBookmark(draft),
          );
          sendResponse(result);
        } catch (err) {
          sendResponse({ success: false, error: err?.message || String(err) });
        }
      })();
      return true;
    }

    case 'cancelQuickBookmarkSuggestion': {
      (async () => {
        const recommendationId = String(message.recommendationId || '').trim();
        if (recommendationId) {
          await submitRecommendationFeedback({
            operationId: message.operationId || makeRecommendationId('cancel'),
            recommendationId,
            outcome: 'cancelled',
            changedFields: [],
            selection: {},
          });
        }
        sendResponse({ success: true, cancelled: true });
      })();
      return true;
    }

    case 'submitBookmarkRecommendationFeedback': {
      (async () => {
        try {
          const result = await submitRecommendationFeedback({
            operationId: message.operationId,
            recommendationId: message.recommendationId,
            bookmarkId: message.bookmarkId,
            outcome: message.outcome,
            changedFields: message.changedFields,
            selection: message.selection,
          });
          sendResponse(result);
        } catch (error) {
          sendResponse({ success: false, error: error?.message || 'feedback_failed' });
        }
      })();
      return true;
    }

    case 'getRecommendationLearningState': {
      getRecommendationLearningState()
        .then(state => sendResponse({ success: true, state }))
        .catch(error => sendResponse({ success: false, error: error?.message || 'learning_state_failed' }));
      return true;
    }

    case 'clearRecommendationLearning': {
      clearRecommendationLearning(message.operationId)
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error?.message || 'learning_clear_failed' }));
      return true;
    }

    case 'mutateRecommendationRule': {
      mutateRecommendationRule(message)
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error?.message || 'rule_mutation_failed' }));
      return true;
    }

    case 'rebuildRecommendationLearning': {
      rebuildRecommendationLearning(message.operationId)
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error?.message || 'learning_rebuild_failed' }));
      return true;
    }

    case 'reevaluateBookmarks': {
      reevaluateBookmarkRecommendations(message.ids, { limit: message.limit, allowAI: message.allowAI === true })
        .then(result => sendResponse({ success: true, ...result }))
        .catch(error => sendResponse({ success: false, error: error?.message || 'reevaluate_failed' }));
      return true;
    }

    case 'resolveRecommendationReview': {
      resolveRecommendationReview(message)
        .then(sendResponse)
        .catch(error => sendResponse({ success: false, error: error?.message || 'review_resolution_failed' }));
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
          const normalizedDomains = [...new Set((domains || []).map(domain => String(domain || '').trim().toLowerCase()).filter(Boolean))];
          if (!tag || normalizedDomains.length === 0 || normalizedDomains.some(domain => !self.BookmarkRecommendationCore?.isValidDomainPattern(domain))) {
            sendResponse({ success: false, error: 'invalid_domain_rule' });
            return;
          }
          await runSerializedOperationDomain('recommendation_rule_compat', async () => {
            await mutateLegacyDynamicRules((rules) => ({
              ...rules,
              domainRules: [...rules.domainRules, { domains: normalizedDomains, tag: String(tag).trim(), color: color || '#607d8b', source: 'user' }],
            }));
            for (const domain of normalizedDomains) await addRecommendationUserRule('domain_tag', domain, String(tag).trim());
          });
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
          const normalizedTag = String(tag || '').trim();
          const normalizedKeyword = String(keyword || '').trim().toLowerCase();
          if (!normalizedTag || !normalizedKeyword) throw new Error('invalid_keyword_rule');
          await runSerializedOperationDomain('recommendation_rule_compat', async () => {
            await mutateLegacyDynamicRules((rules) => ({
              ...rules,
              keywordRules: {
                ...rules.keywordRules,
                [normalizedTag]: [...new Set([...(rules.keywordRules[normalizedTag] || []), normalizedKeyword])],
              },
            }));
            await addRecommendationUserRule('keyword_tag', normalizedKeyword, normalizedTag);
          });
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
          const normalizedWord = String(word || '').trim().toLowerCase();
          if (!normalizedWord) throw new Error('invalid_stop_word');
          await runSerializedOperationDomain('recommendation_rule_compat', async () => {
            await mutateLegacyDynamicRules((rules) => ({ ...rules, stopWords: [...new Set([...rules.stopWords, normalizedWord])] }));
            await mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
              const store = normalizeRecommendationStore(current);
              store.stopWords = [...new Set([...store.stopWords, normalizedWord])];
              return store;
            });
          });
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
          await runSerializedOperationDomain('recommendation_rule_compat', async () => {
            await mutateLegacyDynamicRules((rules) => ({
              ...rules,
              domainRules: rules.domainRules.filter(rule => rule.tag !== tag),
            }));
            await deleteRecommendationUserRules(rule => rule.kind === 'domain_tag' && rule.target === tag);
          });
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
          await runSerializedOperationDomain('recommendation_rule_compat', async () => {
            await mutateLegacyDynamicRules((rules) => ({ ...rules, learnedDomainTag: {} }));
            await mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
              const store = normalizeRecommendationStore(current);
              store.rules = store.rules.filter(rule => rule.source !== 'legacy');
              return store;
            });
          });
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
          const rules = normalizeLegacyDynamicRules(message.rules);
          await runSerializedOperationDomain('recommendation_rule_compat', async () => {
            await mutateLegacyDynamicRules(() => rules);
            await syncRecommendationUserRulesFromLegacy(rules);
          });
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    case 'removeDynamicStopWord': {
      (async () => {
        try {
          const word = String(message.word || '').trim().toLowerCase();
          await runSerializedOperationDomain('recommendation_rule_compat', async () => {
            await mutateLegacyDynamicRules((rules) => ({ ...rules, stopWords: rules.stopWords.filter(item => item !== word) }));
            await mutateStorageResource(RECOMMENDATION_STORE_KEY, (current) => {
              const store = normalizeRecommendationStore(current);
              store.stopWords = store.stopWords.filter(item => item !== word);
              return store;
            });
          });
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error?.message || 'remove_stop_word_failed' });
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
          const operationId = message.operationId || stableRecommendationId(
            'legacy_review',
            `${queueItem?.id || queueItem?.url || ''}|${reviewAction || ''}|${normalizeTagList(confirmedTags).join('|')}`,
          );
          const result = await runIdempotentOperation('legacy_tag_review', operationId, () => runSerializedOperationDomain(
            'legacy_recommendation_learning',
            async () => {
              await submitLegacyTagReviewFeedback(queueItem, confirmedTags, reviewAction, operationId);
              if (typeof updateLearningStats === 'function') {
                await updateLearningStats(queueItem?.suggestedTags || [], confirmedTags || [], reviewAction);
              }
              if (typeof removeFromReviewQueue === 'function') await removeFromReviewQueue(queueItem?.id);
              if (queueItem?.url && confirmedTags?.length > 0) {
                let updated = false;
                const stored = await mutateStoredBookmarks((bookmarks) => bookmarks.map((item) => {
                  if (!item.url || item.url !== queueItem.url) return item;
                  updated = true;
                  return { ...item, tags: [...confirmedTags], tagsAuto: [...confirmedTags] };
                }));
                if (updated) chrome.runtime.sendMessage({ action: 'bookmarksUpdated', bookmarks: stored }).catch(() => {});
              }
              return { success: true };
            },
          ));
          sendResponse(result);
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
          const operationId = message.operationId || stableRecommendationId('legacy_ignore', queueItem?.id || queueItem?.url || '');
          const result = await runIdempotentOperation('legacy_tag_review', operationId, () => runSerializedOperationDomain(
            'legacy_recommendation_learning',
            async () => {
              await submitLegacyTagReviewFeedback(queueItem, [], 'ignored', operationId);
              if (typeof updateLearningStats === 'function') {
                await updateLearningStats(queueItem?.suggestedTags || [], [], 'ignored');
              }
              if (typeof removeFromReviewQueue === 'function') await removeFromReviewQueue(queueItem?.id);
              return { success: true };
            },
          ));
          sendResponse(result);
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
            await runSerializedOperationDomain('legacy_recommendation_learning', () => clearReviewQueue());
          }
          sendResponse(await clearRecommendationReviewQueue(message.operationId));
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

    default:
      // 未识别的 action：立即回执错误，避免通道悬挂导致调用方 await 永久挂起
      // 或以 undefined 决议（读取 resp.success 时抛错）。
      sendResponse({ success: false, error: 'unknown_action' });
      return false;
  }
});

// ===== 书签事件监听 =====
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  // 导入进行中：镜像与元数据由 importBookmarksV2 负责，跳过逐条抓正文/推荐/增量入队的扇出。
  if (isProgrammaticImportActive()) return;
  if (bookmark.url) {
    addSingleBookmark(id).then((result) => {
      if (result?.item) {
        chrome.runtime.sendMessage({
          action: 'bookmarkAdded',
          bookmark: result.item
        }).catch(() => {}); // popup 可能未打开
        if (!result.hadPending) {
          Promise.resolve(result.contentTask || result.item)
            .then((bookmarkWithContent) => queueNewBookmarkRecommendation(bookmarkWithContent))
            .catch(() => {});
          enqueueIncrementalClassification(id, bookmark).catch(() => {});
        }
      }
    });
  }
});

chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  updateBookmark(id, changeInfo);
});

let bookmarkMoveUpdateQueue = Promise.resolve();

// 单个书签移动：更新镜像的 parentId/folderName/folderPath；来源不可信的移动进入待复核观察。
async function handleSingleBookmarkMoved(id, node, moveInfo) {
  const parent = await chrome.bookmarks.get(moveInfo.parentId);
  if (!parent || !parent[0]) return;
  const parentTitle = parent[0].title || '';
  const folderName = isBrowserBookmarkRoot(parentTitle) ? '' : parentTitle;
  const folderOptions = await loadBookmarkFolderOptions();
  const folderPath = folderOptions.find((folder) => folder.id === moveInfo.parentId)?.path || '';

  let updated = false;
  let previousFolderPath = '';
  await mutateStoredBookmarks((bookmarks) => bookmarks.map((item) => {
    if (item.id !== id) return item;
    updated = true;
    previousFolderPath = item.folderPath || '';
    return { ...item, parentId: moveInfo.parentId, folderName, folderPath };
  }));
  if (updated) {
    chrome.runtime.sendMessage({ action: 'bookmarksUpdated', ids: [id] }).catch(() => {});
  }

  if (updated && !consumeProgrammaticBookmarkMove(id, moveInfo.parentId)
    && normalizeBookmarkFolderPath(previousFolderPath) !== normalizeBookmarkFolderPath(folderPath)) {
    await queueBookmarkMoveObservation({ ...node, id }, previousFolderPath, moveInfo.parentId, folderPath);
  }
}

// 文件夹移动：Chrome 只对该文件夹节点触发一次 onMoved，其下所有书签的 folderName/folderPath
// 都要按新位置重算，否则镜像会长期保留旧目录（仅在下次全量同步时才纠正）。
async function handleFolderMoved(folderId) {
  const subtree = await chrome.bookmarks.getSubTree(folderId).catch(() => null);
  if (!subtree || !subtree[0]) return;
  const folderOptions = await loadBookmarkFolderOptions();
  const pathById = new Map(folderOptions.map((folder) => [folder.id, folder.path]));
  const infoById = new Map();
  const walk = (folderNode) => {
    for (const child of folderNode.children || []) {
      if (child.url) {
        const parentTitle = folderNode.title || '';
        infoById.set(child.id, {
          parentId: folderNode.id,
          folderName: isBrowserBookmarkRoot(parentTitle) ? '' : parentTitle,
          folderPath: pathById.get(folderNode.id) || '',
        });
      } else {
        walk(child);
      }
    }
  };
  walk(subtree[0]);
  if (!infoById.size) return;

  const updatedIds = [];
  await mutateStoredBookmarks((bookmarks) => bookmarks.map((item) => {
    const info = infoById.get(item.id);
    if (!info) return item;
    if (item.parentId === info.parentId && item.folderName === info.folderName && item.folderPath === info.folderPath) {
      return item;
    }
    updatedIds.push(item.id);
    return { ...item, parentId: info.parentId, folderName: info.folderName, folderPath: info.folderPath };
  }));
  if (updatedIds.length) {
    chrome.runtime.sendMessage({ action: 'bookmarksUpdated', ids: updatedIds }).catch(() => {});
  }
}

// 监听书签移动：单个书签与文件夹分别处理。
chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  bookmarkMoveUpdateQueue = bookmarkMoveUpdateQueue.then(async () => {
    try {
      const bookmark = await chrome.bookmarks.get(id);
      if (!bookmark || !bookmark[0]) return;
      if (bookmark[0].url) {
        await handleSingleBookmarkMoved(id, bookmark[0], moveInfo);
      } else {
        await handleFolderMoved(id);
      }
    } catch (e) {
      // 静默失败，不影响书签移动
    }
  }).catch(() => {});
});

// 从被删节点收集其下所有含 url 的书签（含被删文件夹的整棵子树）。
function collectRemovedBookmarkNodes(node) {
  const results = [];
  const walk = (current) => {
    if (!current) return;
    if (current.url) { results.push(current); return; }
    for (const child of current.children || []) walk(child);
  };
  walk(node);
  return results;
}

chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  // 从存储中移除并写入 tombstone。删除文件夹时 Chrome 只触发一次 onRemoved，
  // removeInfo.node 携带整棵子树，需据此把其下所有书签一并下线并生成 tombstone。
  (async () => {
    const removedNodes = collectRemovedBookmarkNodes(removeInfo?.node);
    const removedIds = removedNodes.length ? removedNodes.map((node) => node.id) : [id];
    const removedIdSet = new Set(removedIds);
    let targets = [];
    await mutateStoredBookmarks((bookmarks) => {
      targets = bookmarks.filter((item) => removedIdSet.has(item.id));
      return targets.length ? bookmarks.filter((item) => !removedIdSet.has(item.id)) : bookmarks;
    });
    for (const target of targets) await addTombstone(target);
    chrome.runtime.sendMessage({
      action: 'bookmarksDeleted',
      ids: removedIds,
      urls: removedNodes.filter((node) => node.url).map((node) => node.url),
    }).catch(() => {});
  })().catch(() => {});
});

// ===== 定时检测失效书签 =====
const CHECKER_ALARM_PREFIX = 'bookmark_checker_';

// ===== Link checking =====
// Network probing is implemented only by bridge/probe-core.js.
async function checkUrlFromBackground(url, timeoutOrOptions) {
  const options = typeof timeoutOrOptions === 'object' && timeoutOrOptions !== null
    ? timeoutOrOptions
    : { timeoutMs: timeoutOrOptions };
  const probeCore = self.AiProbeCore;
  if (probeCore && typeof probeCore.checkUrl === 'function') {
    return probeCore.checkUrl(url, { ...options, probeMode: 'anonymous' });
  }
  return {
    state: 'transient_failure',
    reason: 'probe-core-not-loaded',
    statusCode: null,
    finalUrl: typeof url === 'string' ? url : '',
    checkedAt: Date.now(),
    probeMode: 'anonymous',
  };
}

function checkerNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

async function getCheckSettings() {
  const defaults = {
    checkerTimeout: 10000,
    checkerFrequency: 'never',
    checkerConcurrency: 5,
    checkerTime: '03:00',
    checkerDayOfWeek: 1,
    checkerDayOfMonth: 1,
    checkerAutoDelete: false,
    checkerRetries: 2,
    checkerBackoffBase: 800,
    checkerBackoffMax: 3000
  };
  const result = await chrome.storage.local.get(Object.keys(defaults));
  const frequency = ['never', 'daily', 'weekly', 'monthly'].includes(result.checkerFrequency)
    ? result.checkerFrequency
    : defaults.checkerFrequency;
  const settings = {
    checkerTimeout: checkerNumber(result.checkerTimeout, defaults.checkerTimeout, 1, 120000),
    checkerFrequency: frequency,
    checkerConcurrency: checkerNumber(result.checkerConcurrency, defaults.checkerConcurrency, 1, 5),
    checkerTime: typeof result.checkerTime === 'string' && /^\d{2}:\d{2}$/.test(result.checkerTime)
      ? result.checkerTime
      : defaults.checkerTime,
    checkerDayOfWeek: checkerNumber(result.checkerDayOfWeek, defaults.checkerDayOfWeek, 0, 6),
    checkerDayOfMonth: checkerNumber(result.checkerDayOfMonth, defaults.checkerDayOfMonth, 1, 31),
    checkerRetries: checkerNumber(result.checkerRetries, defaults.checkerRetries, 0, 10),
    checkerBackoffBase: checkerNumber(result.checkerBackoffBase, defaults.checkerBackoffBase, 0, 30000),
    checkerBackoffMax: checkerNumber(result.checkerBackoffMax, defaults.checkerBackoffMax, 0, 60000),
    checkerAutoDelete: false,
    migratedAutoDelete: result.checkerAutoDelete === true,
  };
  const migration = {};
  for (const [key, value] of Object.entries(settings)) {
    if (key !== 'migratedAutoDelete' && result[key] !== value) migration[key] = value;
  }
  if (settings.migratedAutoDelete) migration.checkerAutoDeleteMigratedAt = Date.now();
  if (Object.keys(migration).length) await chrome.storage.local.set(migration);
  return settings;
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
  if (alarm.name === FOLDER_CONTENT_BACKFILL_ALARM) {
    await processFolderSampleContentBackfill().catch(err => console.warn('Folder sample content backfill failed:', err));
    return;
  }

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

  if (!await chrome.permissions.contains({ origins: ['<all_urls>'] })) {
    await chrome.storage.local.set({
      checkerLastResult: {
        version: 2,
        timestamp: Date.now(),
        source: 'scheduled',
        status: 'permission_required',
        counts: {
          total: 0,
          completed: 0,
          pending: 0,
          normal: 0,
          confirmedMissing: 0,
          needsReview: 0,
        },
        results: [],
        reason: 'permission-required',
      },
    });
    return;
  }

  const settings = await getCheckSettings();
  const timeout = settings.checkerTimeout || 10000;
  const concurrency = settings.checkerConcurrency || 5;

  const bookmarks = await getStoredBookmarks();
  if (bookmarks.length === 0) return;

  let index = 0;
  const results = [];
  const domainSlots = new Map();
  const domainQueues = new Map();
  const rootDomain = (url) => {
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

  // 共享检测配置：总预算来自用户设置，perAttempt 限制为预算的一半避免单次吃光
  const checkOptions = {
    timeoutMs: timeout,
    perAttemptMs: Math.min(timeout, Math.max(1, Math.floor(timeout / 2))),
    retries: settings.checkerRetries ?? 2,
    baseDelayMs: settings.checkerBackoffBase ?? 800,
    maxDelayMs: settings.checkerBackoffMax ?? 3000
  };

  async function processNext() {
    while (index < bookmarks.length) {
      const currentIndex = index++;
      const bm = bookmarks[currentIndex];
      const domain = rootDomain(bm.url);
      await acquireDomainSlot(domain);
      let checkResult;
      try {
        checkResult = await checkUrlFromBackground(bm.url, checkOptions);
      } finally {
        releaseDomainSlot(domain);
      }
      results.push({ bookmark: bm, checkResult });
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(processNext());
  }
  await Promise.all(workers);

  // 保存检测结果
  const reachable = results.filter(({ checkResult }) => checkResult.state === 'reachable').length;
  const confirmedMissing = results.filter(({ checkResult }) => checkResult.state === 'confirmed_missing').length;
  const summary = {
    version: 2,
    timestamp: Date.now(),
    source: 'scheduled',
    status: 'completed',
    counts: {
      total: results.length,
      completed: results.length,
      pending: 0,
      normal: reachable,
      confirmedMissing,
      needsReview: results.length - reachable - confirmedMissing,
    },
    results,
  };
  await chrome.storage.local.set({ checkerLastResult: summary });

  if (confirmedMissing > 0) {
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: '../icons/icon48.png',
      title: 'AI Bookmark OS',
      message: `Detected ${confirmedMissing} confirmed missing bookmarks; manual cleanup is required.`,
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
      await mutateStoredBookmarks((stored) => stored.filter(b => b.url !== tab.url));

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

// Chrome History 是访问次数的唯一来源；写入绝对值，避免一次导航被重复累加。
chrome.history.onVisited.addListener((historyItem) => {
  if (!historyItem?.url || !Number.isFinite(Number(historyItem.visitCount))) return;
  const normalizedUrl = historyItem.url.replace(/\/+$/, '');
  const visitCount = Math.max(0, Number(historyItem.visitCount) || 0);
  const lastClickedAt = Number(historyItem.lastVisitTime) || null;
  mutateStoredBookmarks((bookmarks) => bookmarks.map((item) => {
    if (!item.url || item.url.replace(/\/+$/, '') !== normalizedUrl) return item;
    if ((item.clickCount || 0) === visitCount && (item.lastClickedAt || null) === lastClickedAt) return item;
    return { ...item, clickCount: visitCount, lastClickedAt };
  })).catch(() => {});
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
    const folderMatchBookmarks = sampleFolderBookmarks(stored);
    const historyCandidates = scoreHistoricalFolderCandidates(folderMatchBookmarks, suggestedTags, bookmarkEvidence, null, folderOptions);
    const profileCandidates = scoreFolderProfileCandidates(folderMatchBookmarks, folderOptions, bookmarkEvidence, suggestedTags, null);

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
    const folderMatchBookmarks = sampleFolderBookmarks(stored);
    const historyCandidates = scoreHistoricalFolderCandidates(folderMatchBookmarks, suggestedTags, bookmarkEvidence, null, folderOptions);
    const profileCandidates = scoreFolderProfileCandidates(folderMatchBookmarks, folderOptions, bookmarkEvidence, suggestedTags, null);
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

async function findOrCreateFolderPath(path, createdFolders) {
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
      if (!next) {
        next = await chrome.bookmarks.create({ parentId: parent.id, title: part });
        if (Array.isArray(createdFolders) && !createdFolders.some((folder) => folder.id === next.id)) {
          createdFolders.push({ id: next.id, parentId: next.parentId, title: next.title, path: [...actualParts, part].join('/') });
        }
      }
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
