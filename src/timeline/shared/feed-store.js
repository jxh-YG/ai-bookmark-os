// shared/feed-store.js
// RSS 订阅存储层：feeds / items / settings 的 CRUD
// items 按 feedId 分片存储（rss_items_<feedId>），避免单 key 过大
//
// 依赖：chrome.storage.local

(function (global) {
  'use strict';

  const FEEDS_KEY = 'rss_feeds';
  const SETTINGS_KEY = 'rss_settings';
  const ITEMS_KEY_PREFIX = 'rss_items_'; // rss_items_<feedId>

  const DEFAULT_SETTINGS = {
    pollIntervalMin: 30,        // 拉取间隔（分钟）：15 / 30 / 60
    autoDiscover: true,         // 自动嗅探当前页 RSS
    notifyNew: true,            // 新文章桌面通知
    maxItemsPerFeed: 100,       // 单 feed 最多保留条数
    defaultFolderId: null,      // 新订阅默认挂载的书签文件夹
    proxyFallback: false,       // 仅在用户明确同意后才将订阅 URL 发送给公共代理
    // 代理 URL 模板，{url} 为源 URL 占位符（经 encodeURIComponent 编码）
    // rss2json 类型（返回 JSON）与 raw 类型（返回原始 XML）均可，自动识别
    proxyUrl: 'https://api.rss2json.com/v1/api.json?rss_url={url}'
  };

  // chrome.storage 不提供 compare-and-swap；同一 key 的读改写必须顺序执行。
  const mutationQueues = new Map();
  function mutateStorage(key, updater) {
    const previous = mutationQueues.get(key) || Promise.resolve();
    const mutation = previous.catch(() => {}).then(async () => {
      const stored = await chrome.storage.local.get(key);
      const next = await updater(stored[key]);
      if (next !== undefined) await chrome.storage.local.set({ [key]: next });
      return next;
    });
    mutationQueues.set(key, mutation);
    mutation.finally(() => { if (mutationQueues.get(key) === mutation) mutationQueues.delete(key); }).catch(() => {});
    return mutation;
  }
  function isValidProxyTemplate(template) {
    if (typeof template !== 'string' || template.length > 2048 || (template.match(/\{url\}/g) || []).length !== 1) return false;
    try { const url = new URL(template.replace('{url}', 'https%3A%2F%2Fexample.invalid%2Ffeed.xml')); return url.protocol === 'https:' && !!url.hostname; } catch { return false; }
  }

  // ===== Settings =====
  async function getSettings() {
    const r = await chrome.storage.local.get(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(r[SETTINGS_KEY] || {}) };
  }

  async function setSettings(patch) {
    return mutateStorage(SETTINGS_KEY, (stored) => {
      const next = { ...DEFAULT_SETTINGS, ...(stored || {}), ...patch };
      if (next.proxyFallback && !isValidProxyTemplate(next.proxyUrl)) throw new Error('proxy_template_invalid');
      return next;
    });
  }

  // ===== Feeds =====
  async function getAllFeeds() {
    const r = await chrome.storage.local.get(FEEDS_KEY);
    return r[FEEDS_KEY] || [];
  }

  async function getFeed(id) {
    const feeds = await getAllFeeds();
    return feeds.find(f => f.id === id) || null;
  }

  async function getFeedByUrl(url) {
    const feeds = await getAllFeeds();
    const norm = (url || '').trim();
    return feeds.find(f => f.url === norm) || null;
  }

  async function addFeed(data) {
    let outcome;
    await mutateStorage(FEEDS_KEY, (stored) => {
      const feeds = stored || [];
      if (feeds.some(f => f.url === data.url)) { outcome = { success: false, error: 'duplicate' }; return feeds; }
      const feed = { id: 'feed_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), url: data.url, title: data.title || data.url, siteUrl: data.siteUrl || '', favicon: data.favicon || '', folderId: data.folderId || null, autoBookmark: !!data.autoBookmark, notify: data.notify !== false, lastFetched: 0, etag: null, lastModified: null, failCount: 0, lastStatus: 'pending', lastError: '', nextRetryAt: 0, createdAt: Date.now() };
      outcome = { success: true, feed };
      return [...feeds, feed];
    });
    return outcome;
  }

  async function updateFeed(id, patch) {
    let outcome;
    await mutateStorage(FEEDS_KEY, (stored) => {
      const feeds = stored || []; const index = feeds.findIndex(f => f.id === id);
      if (index < 0) { outcome = { success: false, error: 'not_found' }; return feeds; }
      const next = feeds.slice(); next[index] = { ...next[index], ...patch }; outcome = { success: true, feed: next[index] }; return next;
    });
    return outcome;
  }

  async function removeFeed(id) {
    await mutateStorage(FEEDS_KEY, (stored) => (stored || []).filter(f => f.id !== id));
    await mutateStorage(ITEMS_KEY_PREFIX + id, () => []);
    return { success: true };
  }

  // 按给定 id 序列重排订阅源顺序（数组顺序即持久化顺序）
  // 未出现在 orderedIds 中的 feed 追加到末尾，保持原有相对顺序
  async function reorderFeeds(orderedIds) {
    let next;
    await mutateStorage(FEEDS_KEY, (stored) => {
      const feeds = stored || []; const idSet = new Set(orderedIds || []); const idxMap = new Map((orderedIds || []).map((id, i) => [id, i]));
      const present = feeds.filter(f => idSet.has(f.id)); const rest = feeds.filter(f => !idSet.has(f.id));
      present.sort((a, b) => (idxMap.get(a.id) ?? 0) - (idxMap.get(b.id) ?? 0)); next = [...present, ...rest]; return next;
    });
    return { success: true, feeds: next };
  }

  // ===== Items =====
  async function getItems(feedId) {
    const r = await chrome.storage.local.get(ITEMS_KEY_PREFIX + feedId);
    return r[ITEMS_KEY_PREFIX + feedId] || [];
  }

  async function getAllItems() {
    const feeds = await getAllFeeds();
    if (feeds.length === 0) return [];
    const keys = feeds.map(f => ITEMS_KEY_PREFIX + f.id);
    const r = await chrome.storage.local.get(keys);
    const all = [];
    for (const f of feeds) {
      const items = r[ITEMS_KEY_PREFIX + f.id] || [];
      for (const it of items) {
        all.push({ ...it, feedTitle: f.title, feedFavicon: f.favicon });
      }
    }
    return all;
  }

  // 增量写入：按 guid 去重，返回新增的条目数组
  async function upsertItems(feedId, newItems, maxItems) {
    let added;
    await mutateStorage(ITEMS_KEY_PREFIX + feedId, (stored) => {
      const existing = (stored || []).slice(); const guidSet = new Set(existing.map(i => i.guid)); added = [];
      for (const it of newItems) {
        if (!it.guid || guidSet.has(it.guid)) continue;
        const item = { id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8), feedId, guid: it.guid, title: it.title || '', link: it.link || '', author: it.author || '', publishedAt: it.publishedAt || 0, summary: it.summary || '', contentSnippet: it.contentSnippet || '', imageUrl: it.imageUrl || '', read: false, starred: false, bookmarkId: null, savedAt: null, fetchedAt: Date.now() };
        existing.push(item); guidSet.add(it.guid); added.push(item);
      }
      existing.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
      const limit = maxItems || 100; if (existing.length > limit) existing.length = limit;
      return existing;
    });
    return added;
  }

  async function _patchItem(feedId, itemId, patch) {
    let outcome;
    await mutateStorage(ITEMS_KEY_PREFIX + feedId, (stored) => {
      const items = (stored || []).slice(); const index = items.findIndex(i => i.id === itemId);
      if (index < 0) { outcome = { success: false, error: 'not_found' }; return items; }
      const item = { ...items[index], ...patch }; items[index] = item; outcome = { success: true, item }; return items;
    });
    return outcome;
  }

  async function setItemRead(itemId, feedId, read) {
    return _patchItem(feedId, itemId, { read: !!read });
  }

  async function markAllRead(feedId) {
    await mutateStorage(ITEMS_KEY_PREFIX + feedId, (stored) => (stored || []).map(item => ({ ...item, read: true })));
    return { success: true };
  }

  async function markAllFeedsRead() {
    const feeds = await getAllFeeds();
    for (const f of feeds) {
      await markAllRead(f.id);
    }
    return { success: true };
  }

  async function setItemStarred(itemId, feedId, starred) {
    return _patchItem(feedId, itemId, { starred: !!starred });
  }

  async function setItemBookmark(itemId, feedId, bookmarkId) {
    return _patchItem(feedId, itemId, {
      bookmarkId: bookmarkId || null,
      savedAt: bookmarkId ? Date.now() : null
    });
  }

  async function getUnreadCount(feedId) {
    const items = await getItems(feedId);
    return items.filter(i => !i.read).length;
  }

  async function getTotalUnreadCount() {
    const feeds = await getAllFeeds();
    if (feeds.length === 0) return 0;
    const keys = feeds.map(f => ITEMS_KEY_PREFIX + f.id);
    const r = await chrome.storage.local.get(keys);
    let total = 0;
    for (const f of feeds) {
      const items = r[ITEMS_KEY_PREFIX + f.id] || [];
      for (const it of items) if (!it.read) total++;
    }
    return total;
  }

  // 广播数据变化（供 UI 刷新）
  function _broadcast(action, payload) {
    try {
      chrome.runtime.sendMessage({ action, ...payload }).catch(() => {});
    } catch { /* 静默 */ }
  }

  global.FeedStore = {
    KEYS: { FEEDS_KEY, SETTINGS_KEY, ITEMS_KEY_PREFIX },
    DEFAULT_SETTINGS, mutateStorage, isValidProxyTemplate,
    getSettings, setSettings,
    getAllFeeds, getFeed, getFeedByUrl, addFeed, updateFeed, removeFeed, reorderFeeds,
    getItems, getAllItems, upsertItems,
    setItemRead, markAllRead, markAllFeedsRead,
    setItemStarred, setItemBookmark,
    getUnreadCount, getTotalUnreadCount,
    _broadcast
  };
})(typeof self !== 'undefined' ? self : this);
