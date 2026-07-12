// ===== 网页预览提取 - 基于 Mozilla Readability =====
// 拆分：
//   - 本文件：负责缓存、网络抓取、settings；不解析 HTML（Service Worker 没有 DOMParser）
//   - popup 页面：拿到 HTML 后用 DOMParser + Readability 解析
// 流程：
//   popup → getPreview(url) → 返回 { preview, html, url, disabled, error }
//   popup 解析完 → setPreviewCache(url, preview) → 写入 storage

const STORAGE_KEY_PREVIEW_CACHE = 'preview_cache';
const PREVIEW_FETCH_TIMEOUT = 8000;

const PREVIEW_DEFAULTS = {
  previewEnabled: true,
  previewCacheTTL: 30,        // 天
  previewMaxCacheEntries: 500,
  mdiWindowEnabled: false
};

// 简易 fetch with timeout，支持额外 fetch options（如 headers）
async function fetchWithTimeout(url, timeoutMs, extraOptions = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      ...extraOptions
    });
  } finally {
    clearTimeout(timer);
  }
}

function extractHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// 仅抓取 HTML（不解析）—— 给 popup 端解析用
async function fetchPageHtml(url) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  let res;
  try {
    // 部分站点（尤其国内政府/企业站）拒绝无 UA 的请求，补充合理 UA
    res = await fetchWithTimeout(url, PREVIEW_FETCH_TIMEOUT, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
  } catch (e) {
    return null;
  }
  if (!res.ok) return null;
  // 部分站点返回非文本内容（如 PDF），跳过
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct && !ct.includes('text/html') && !ct.includes('application/xhtml') && !ct.includes('text/plain')) {
    return null;
  }
  try {
    return await res.text();
  } catch {
    return null;
  }
}

// ============ 缓存 ============
async function getPreviewCache() {
  const result = await chrome.storage.local.get(STORAGE_KEY_PREVIEW_CACHE);
  return result[STORAGE_KEY_PREVIEW_CACHE] || {};
}

async function getCachedPreview(url) {
  const cache = await getPreviewCache();
  const hit = cache[url];
  if (!hit) return null;
  const settings = await getPreviewSettings();
  const ttl = settings.previewCacheTTL * 24 * 3600 * 1000;
  if (Date.now() - hit.fetchedAt > ttl) return null;
  return hit;
}

async function savePreviewToCache(preview) {
  if (!preview || !preview.url) return;
  const settings = await getPreviewSettings();
  const cache = await getPreviewCache();
  cache[preview.url] = preview;

  // 清理过期 + 超出上限
  const ttl = settings.previewCacheTTL * 24 * 3600 * 1000;
  const now = Date.now();
  let entries = Object.entries(cache).filter(([_, v]) => now - v.fetchedAt < ttl);
  if (entries.length > settings.previewMaxCacheEntries) {
    entries.sort((a, b) => b[1].fetchedAt - a[1].fetchedAt);
    entries = entries.slice(0, settings.previewMaxCacheEntries);
  }
  await chrome.storage.local.set({ [STORAGE_KEY_PREVIEW_CACHE]: Object.fromEntries(entries) });
}

async function clearPreviewCache() {
  await chrome.storage.local.remove(STORAGE_KEY_PREVIEW_CACHE);
}

// ============ 设置 ============
async function getPreviewSettings() {
  const result = await chrome.storage.local.get(Object.keys(PREVIEW_DEFAULTS));
  return { ...PREVIEW_DEFAULTS, ...result };
}

async function setPreviewSettings(patch) {
  const current = await getPreviewSettings();
  const merged = { ...current, ...patch };
  // 仅持久化 PREVIEW_DEFAULTS 中声明的 key，避免污染
  const toSave = {};
  for (const k of Object.keys(PREVIEW_DEFAULTS)) {
    toSave[k] = merged[k];
  }
  await chrome.storage.local.set(toSave);
  return merged;
}

// ============ 公共 API ============
// popup 调 getPreview(url) → 返回 { preview, html, url, disabled, error }
//   preview: 缓存命中时直接返回
//   html:    未命中时返回原始 HTML，popup 端用 Readability 解析
//   url:     始终带回原 URL，方便 popup 端建立 baseURI
//   disabled / error: 状态标识
async function getPreview(url, { forceRefresh = false } = {}) {
  if (!url) return { error: 'no url' };
  const settings = await getPreviewSettings();
  if (!settings.previewEnabled) return { disabled: true };

  if (!forceRefresh) {
    const cached = await getCachedPreview(url);
    if (cached) return { preview: cached, html: null, url };
  }

  // SW 无 DOMParser，抓 HTML 后交给 popup 解析
  const html = await fetchPageHtml(url);
  if (html == null) {
    return { preview: null, html: null, url, error: 'fetch failed' };
  }
  return { preview: null, html, url };
}

// popup 解析完成后回写到缓存
async function setPreviewCache(url, preview) {
  if (!url || !preview) return false;
  return savePreviewToCache({ ...preview, url });
}

async function getPreviewCacheStats() {
  const cache = await getPreviewCache();
  const entries = Object.values(cache);
  const totalChars = entries.reduce((sum, e) => sum + (e.lengthChars || 0), 0);
  return {
    count: entries.length,
    totalChars,
    oldestFetchedAt: entries.reduce((min, e) => Math.min(min, e.fetchedAt), Date.now())
  };
}
