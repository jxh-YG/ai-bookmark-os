// background/feed-fetcher.js
// alarms 驱动的定时拉取调度
// - ETag / Last-Modified 增量请求
// - 失败退避（failCount 递增，由调度层跳过过频拉取）
// - 直连失败时可选回退到 rss2json 公共代理（解决国内访问部分源超时）
// - 解析后写入 FeedStore，返回新增条目供通知层使用
//
// 依赖：FeedStore, RssParser (通过 importScripts 注入)

(function (global) {
  'use strict';

  const RSS_ALARM_NAME = 'rss_poll';
  const FETCH_TIMEOUT_MS = 20000;
  const FAVICON_TIMEOUT_MS = 8000;
  // 失败退避：failCount 达到阈值时跳过该 feed 几轮
  const FAIL_SKIP_THRESHOLD = 3;

  // 抓取站点 favicon：先试 /favicon.ico，失败再解析首页 HTML 的 <link rel="icon">
  // best-effort：任何失败都返回空字符串，不阻塞主流程
  async function fetchFavicon(siteUrl) {
    if (!siteUrl) return '';
    let host;
    try {
      host = new URL(siteUrl).hostname;
    } catch { return ''; }
    if (!host) return '';

    // 1) 直接尝试 /favicon.ico
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
      const resp = await fetch(`https://${host}/favicon.ico`, {
        signal: controller.signal,
        redirect: 'follow',
        credentials: 'omit'
      });
      clearTimeout(tid);
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (resp.ok && (ct.includes('image') || ct.includes('octet-stream'))) {
        return `https://${host}/favicon.ico`;
      }
    } catch { /* 继续尝试首页解析 */ }

    // 2) 解析首页 HTML 里的 <link rel="icon" / shortcut icon / apple-touch-icon>
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
      const resp = await fetch(`https://${host}/`, {
        signal: controller.signal,
        redirect: 'follow',
        credentials: 'omit',
        headers: { 'Accept': 'text/html, */*' }
      });
      clearTimeout(tid);
      if (!resp.ok) return '';
      const html = await resp.text();
      const linkRe = /<link\s[^>]*>/gi;
      let m;
      while ((m = linkRe.exec(html)) !== null) {
        const tag = m[0];
        const relMatch = tag.match(/rel\s*=\s*["']([^"']+)["']/i);
        if (!relMatch) continue;
        const rel = relMatch[1].toLowerCase().trim();
        if (rel !== 'icon' && rel !== 'shortcut icon' && rel !== 'apple-touch-icon') continue;
        const hrefMatch = tag.match(/href\s*=\s*["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1]) {
          try {
            return new URL(hrefMatch[1], `https://${host}/`).href;
          } catch { /* ignore invalid href */ }
        }
      }
    } catch { /* ignore */ }

    return '';
  }

  function _isTransient(err) {
    if (!err) return false;
    if (err.name === 'AbortError') return true;
    const msg = (err.message || '').toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('err_name') ||
      msg.includes('err_internet') ||
      msg.includes('err_connection') ||
      msg.includes('err_timed_out') ||
      msg.includes('net::') ||
      msg.includes('timeout')
    );
  }

  // 将 HTTP URL 升级为 HTTPS（部分站点 HTTP 会 302 到 HTTPS）
  function _upgradeUrl(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:') {
        u.protocol = 'https:';
        return u.href;
      }
    } catch { /* ignore */ }
    return null;
  }

  // GitHub raw 镜像回退：raw.githubusercontent.com 在国内常无法访问
  // 使用 raw.gitmirror.com 镜像（仅替换 hostname，路径不变）
  function _githubMirrorUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'raw.githubusercontent.com') {
        u.hostname = 'raw.gitmirror.com';
        return u.href;
      }
    } catch { /* ignore */ }
    return null;
  }

  // ===== 公共代理回退（直连失败时使用）=====
  // 代理服务器代抓源站，不受扩展 host 权限/CORS/混合内容限制
  // 适用于国内直连超时的源（如 Cloudflare 托管站点）
  // 支持两种代理类型，按响应内容自动识别：
  //   - rss2json 类型（返回 JSON，含 status/items 字段）
  //   - raw 类型（返回原始 RSS/Atom XML，复用 RssParser 解析）
  // 代理 URL 模板用 {url} 作占位符，替换为 encodeURIComponent 编码后的源 URL

  // 将 rss2json 返回的 JSON 转换为 RssParser 的输出结构
  // 字段对齐 shared/rss-parser.js 的 { title, siteUrl, description, items[] }
  function _convertRss2Json(json, fallbackUrl) {
    if (!json || json.status !== 'ok' || !Array.isArray(json.items)) return null;
    const feed = json.feed || {};
    const items = (json.items || []).map(it => {
      const link = it.link || it.guid || '';
      const pub = RssParser.parseDate(it.pubDate || it.pubdate || it.isoDate);
      // rss2json 的 content/description/thumbnail 已抽取好，直接用
      const summary = RssParser.stripTags(it.description || it.content || '').slice(0, 500);
      const contentSnippet = RssParser.stripTags(it.content || it.description || '').slice(0, 1000);
      return {
        guid: it.guid || link || it.title || String(Math.random()),
        title: RssParser.stripTags(it.title || ''),
        link,
        author: it.author || '',
        publishedAt: pub,
        summary,
        contentSnippet,
        imageUrl: it.thumbnail || (it.enclosure && it.enclosure.link) || ''
      };
    }).filter(it => it.title || it.link);
    return {
      title: RssParser.stripTags(feed.title || ''),
      siteUrl: feed.link || fallbackUrl || '',
      description: RssParser.stripTags(feed.description || ''),
      items
    };
  }

  // 通过代理抓取并解析。成功返回 { text, parsed, finalUrl, via:'proxy' }
  // 失败抛错。注意：代理模式不返回 ETag/Last-Modified（代理通常不透传这些头）
  async function _fetchViaProxy(feedUrl, proxyTemplate, options) {
    if (!proxyTemplate || typeof proxyTemplate !== 'string' || !proxyTemplate.includes('{url}')) {
      throw new Error('proxy_template_invalid');
    }
    const proxyUrl = proxyTemplate.replace('{url}', encodeURIComponent(feedUrl));
    const controller = options.signal ? null : new AbortController();
    const tid = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
    try {
      const resp = await fetch(proxyUrl, {
        signal: controller ? controller.signal : options.signal,
        redirect: 'follow',
        credentials: 'omit'
      });
      if (!resp.ok) throw new Error('proxy HTTP ' + resp.status);
      const text = await resp.text();
      if (!text) throw new Error('proxy_empty_response');

      // 自动识别 JSON（rss2json 类型）还是 XML（raw 类型）
      let parsed = null;
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const json = JSON.parse(trimmed);
          parsed = _convertRss2Json(json, feedUrl);
        } catch { /* 不是有效 JSON，降级当 XML 处理 */ }
      }
      if (!parsed) {
        // 当作原始 RSS/Atom XML 解析（适用于 allorigins/corsproxy 等 raw 代理）
        const ct = resp.headers.get('content-type') || '';
        parsed = RssParser.parseFeed(text, ct);
      }
      if (!parsed) throw new Error('proxy_parse_failed');
      if (!parsed.items || parsed.items.length === 0) throw new Error('empty_feed');
      // text 设为空字符串表示无需二次解析
      return { text: '', parsed, finalUrl: feedUrl, via: 'proxy' };
    } finally {
      if (tid) clearTimeout(tid);
    }
  }

  // 带重试的 fetch：原始 URL → HTTPS 升级 → GitHub raw 镜像
  // 注意：本函数只做"直连"层面的回退；rss2json 代理回退由调用方按设置决定
  async function _fetchWithRetry(url, options) {
    try {
      const resp = await fetch(url, options);
      return { resp, finalUrl: url };
    } catch (firstErr) {
      // 如果原始 URL 是 HTTP，尝试 HTTPS
      const httpsUrl = _upgradeUrl(url);
      if (httpsUrl) {
        try {
          const resp = await fetch(httpsUrl, options);
          return { resp, finalUrl: httpsUrl };
        } catch {
          // HTTPS 也失败，继续尝试镜像
        }
      }
      // 如果是 GitHub raw，尝试镜像
      const mirrorUrl = _githubMirrorUrl(httpsUrl || url);
      if (mirrorUrl) {
        try {
          const resp = await fetch(mirrorUrl, options);
          return { resp, finalUrl: mirrorUrl };
        } catch {
          // 镜像也失败，抛出原始错误
        }
      }
      throw firstErr;
    }
  }

  // 拉取单个 feed。返回 { feedId, added, error?, failCount }
  // 流程：直连（含 HTTPS 升级/GitHub 镜像回退）→ 直连失败且开启代理时走 rss2json 代理
  async function fetchOne(feed) {
    const settings = await FeedStore.getSettings();
    const allowProxy = settings.proxyFallback !== false; // 默认开启
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const headers = {
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, */*'
    };
    if (feed.etag) headers['If-None-Match'] = feed.etag;
    if (feed.lastModified) headers['If-Modified-Since'] = feed.lastModified;

    let directErr = null;
    try {
      const { resp, finalUrl } = await _fetchWithRetry(feed.url, {
        headers,
        signal: controller.signal,
        redirect: 'follow',
        credentials: 'omit'
      });
      clearTimeout(tid);

      if (resp.status === 304) {
        await FeedStore.updateFeed(feed.id, { lastFetched: Date.now(), failCount: 0 });
        return { feedId: feed.id, added: [], notModified: true };
      }
      if (!resp.ok) {
        throw new Error('HTTP ' + resp.status);
      }

      const text = await resp.text();
      const ct = resp.headers.get('content-type') || '';
      const parsed = RssParser.parseFeed(text, ct);
      if (!parsed || !Array.isArray(parsed.items)) {
        throw new Error('parse_failed');
      }
      if (parsed.items.length === 0) {
        throw new Error('empty_feed');
      }

      // 更新 feed 元信息（用户未自定义标题时用 feed 自带标题）
      const patch = {
        lastFetched: Date.now(),
        etag: resp.headers.get('etag') || null,
        lastModified: resp.headers.get('last-modified') || null,
        failCount: 0
      };
      // 如果发生重定向，更新 feed URL 为最终 URL
      if (finalUrl !== feed.url) {
        patch.url = finalUrl;
      }
      if (!feed.title || feed.title === feed.url) {
        patch.title = parsed.title || feed.title;
      }
      if (parsed.siteUrl && !feed.siteUrl) patch.siteUrl = parsed.siteUrl;
      // feed.favicon 为空时尝试抓取并持久化
      if (!feed.favicon) {
        try {
          const fav = await fetchFavicon(parsed.siteUrl || feed.url);
          if (fav) patch.favicon = fav;
        } catch { /* ignore */ }
      }
      await FeedStore.updateFeed(feed.id, patch);

      const added = await FeedStore.upsertItems(feed.id, parsed.items, settings.maxItemsPerFeed);
      return { feedId: feed.id, added, feedTitle: feed.title, feed };
    } catch (err) {
      clearTimeout(tid);
      directErr = err;
    }

    // ===== 直连失败，尝试代理回退 =====
    if (allowProxy) {
      try {
        const proxied = await _fetchViaProxy(feed.url, settings.proxyUrl, { signal: null });
        // 代理成功：写回元信息（代理不返回 ETag/Last-Modified，置空避免下次条件请求误判）
        const patch = {
          lastFetched: Date.now(),
          etag: null,
          lastModified: null,
          failCount: 0
        };
        if (!feed.title || feed.title === feed.url) {
          patch.title = proxied.parsed.title || feed.title;
        }
        if (proxied.parsed.siteUrl && !feed.siteUrl) patch.siteUrl = proxied.parsed.siteUrl;
        if (!feed.favicon) {
          try {
            const fav = await fetchFavicon(proxied.parsed.siteUrl || feed.url);
            if (fav) patch.favicon = fav;
          } catch { /* ignore */ }
        }
        await FeedStore.updateFeed(feed.id, patch);
        const added = await FeedStore.upsertItems(feed.id, proxied.parsed.items, settings.maxItemsPerFeed);
        console.info('[RSS] fetched via proxy:', feed.url);
        return { feedId: feed.id, added, feedTitle: feed.title, feed, via: 'proxy' };
      } catch (proxyErr) {
        console.warn('[RSS] proxy also failed:', feed.url, proxyErr.message);
      }
    }

    // 直连和代理都失败，记录失败计数
    const failCount = (feed.failCount || 0) + 1;
    await FeedStore.updateFeed(feed.id, { failCount, lastFetched: Date.now() });
    const isTimeout = directErr.name === 'AbortError' || _isTransient(directErr);
    const errMsg = isTimeout ? `timeout after ${FETCH_TIMEOUT_MS / 1000}s` : directErr.message;
    console.warn('[RSS] fetch failed:', feed.url, errMsg);
    return { feedId: feed.id, added: [], error: errMsg, failCount, feed };
  }

  // 拉取所有 feed。跳过连续失败且未到退避窗口的 feed。
  async function pollAll() {
    const feeds = await FeedStore.getAllFeeds();
    if (feeds.length === 0) return [];

    const now = Date.now();
    const settings = await FeedStore.getSettings();
    const intervalMs = (settings.pollIntervalMin || 30) * 60 * 1000;
    const results = [];

    for (const feed of feeds) {
      // 失败退避：failCount 越高，跳过越多轮
      if (feed.failCount >= FAIL_SKIP_THRESHOLD) {
        const skipMs = intervalMs * Math.min(feed.failCount - FAIL_SKIP_THRESHOLD + 1, 8);
        if (feed.lastFetched && (now - feed.lastFetched) < skipMs) {
          continue; // 跳过本轮
        }
      }
      const r = await fetchOne(feed);
      results.push(r);

      // 自动书签：feed.autoBookmark 为 true 时，将新增文章自动存为书签
      if (feed.autoBookmark && r.added && r.added.length > 0 && typeof self.saveRssArticleAsBookmark === 'function') {
        for (const item of r.added) {
          try {
            await self.saveRssArticleAsBookmark(item, feed, settings);
          } catch (e) {
            console.warn('[RSS] auto-bookmark failed for', item.link, e.message);
          }
        }
      }
    }

    // 通知上层（feed-notifier 会监听）
    if (typeof global.onFeedPollComplete === 'function') {
      try { global.onFeedPollComplete(results); } catch { /* ignore */ }
    }
    // 广播数据变化
    FeedStore._broadcast('rssDataChanged', { results });
    return results;
  }

  // 手动刷新单个 feed
  async function refreshFeed(feedId) {
    const feed = await FeedStore.getFeed(feedId);
    if (!feed) return { error: 'not_found' };
    const r = await fetchOne(feed);
    FeedStore._broadcast('rssDataChanged', { results: [r] });
    return r;
  }

  // 手动刷新全部
  async function refreshAll() {
    return pollAll();
  }

  // 首次添加 feed 时立即拉取一次，返回 feed 元信息
  // 流程：直连 → 直连失败且开启代理时走 rss2json 代理
  async function fetchAndInit(feedUrl) {
    const settings = await FeedStore.getSettings();
    const allowProxy = settings.proxyFallback !== false; // 默认开启
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let directErr = null;
    try {
      const { resp, finalUrl } = await _fetchWithRetry(feedUrl, {
        signal: controller.signal,
        redirect: 'follow',
        credentials: 'omit',
        headers: { 'Accept': 'application/rss+xml, application/atom+xml, application/xml, application/json, text/xml, */*' }
      });
      clearTimeout(tid);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const text = await resp.text();
      const ct = resp.headers.get('content-type') || '';
      const parsed = RssParser.parseFeed(text, ct);
      if (!parsed) throw new Error('parse_failed');
      // favicon 异步获取，不阻塞订阅响应
      let favicon = '';
      // 不 await，先返回空 favicon，后续通过 rssUpdateFeed 补上
      const faviconPromise = fetchFavicon(parsed.siteUrl || finalUrl).then(f => f).catch(() => '');
      return {
        success: true,
        title: parsed.title || '',
        siteUrl: parsed.siteUrl || '',
        favicon,
        description: parsed.description || '',
        etag: resp.headers.get('etag') || null,
        lastModified: resp.headers.get('last-modified') || null,
        itemCount: (parsed.items || []).length,
        finalUrl,
        _parsed: parsed,
        _faviconPromise: faviconPromise
      };
    } catch (err) {
      clearTimeout(tid);
      directErr = err;
    }

    // ===== 直连失败，尝试代理回退 =====
    if (allowProxy) {
      try {
        const proxied = await _fetchViaProxy(feedUrl, settings.proxyUrl, { signal: null });
        const faviconPromise = fetchFavicon(proxied.parsed.siteUrl || feedUrl).then(f => f).catch(() => '');
        console.info('[RSS] fetchAndInit via proxy:', feedUrl);
        return {
          success: true,
          title: proxied.parsed.title || '',
          siteUrl: proxied.parsed.siteUrl || '',
          favicon: '',
          description: proxied.parsed.description || '',
          // 代理不透传 ETag/Last-Modified
          etag: null,
          lastModified: null,
          itemCount: proxied.parsed.items.length,
          finalUrl: proxied.finalUrl,
          _parsed: proxied.parsed,
          _faviconPromise: faviconPromise,
          via: 'proxy'
        };
      } catch (proxyErr) {
        console.warn('[RSS] fetchAndInit proxy also failed:', feedUrl, proxyErr.message);
      }
    }

    // 直连和代理都失败
    let error = directErr.message;
    if (directErr.name === 'AbortError' || _isTransient(directErr)) {
      error = 'network_timeout';
    } else if (error.includes('HTTP ')) {
      error = 'http_' + error.replace('HTTP ', '');
    }
    return { success: false, error };
  }

  async function scheduleAlarm() {
    const settings = await FeedStore.getSettings();
    const period = Math.max(1, settings.pollIntervalMin || 30);
    // delayInMinutes 设 1，避免安装后立即拉取风暴
    await chrome.alarms.create(RSS_ALARM_NAME, { periodInMinutes: period, delayInMinutes: 1 });
  }

  async function reschedule() {
    await chrome.alarms.clear(RSS_ALARM_NAME);
    await scheduleAlarm();
  }

  async function init() {
    await scheduleAlarm();
  }

  global.RSS_ALARM_NAME = RSS_ALARM_NAME;
  global.FeedFetcher = {
    fetchOne, pollAll, refreshFeed, refreshAll,
    fetchAndInit, fetchFavicon, scheduleAlarm, reschedule, init,
    testProxy: _fetchViaProxy
  };
})(typeof self !== 'undefined' ? self : this);
