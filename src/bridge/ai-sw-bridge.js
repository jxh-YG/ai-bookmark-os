// AI Bookmark OS bridge — loaded by AI Bookmark OS service worker
// Provides AI helpers without replacing AI Bookmark OS runtime.

(function initAiBookmarkBridge() {
  const SOFT_DEAD_PATTERNS = [
    /页面不存在|页面未找到|找不到(该|此|你要的)?页面|页面已删除|内容(不存在|已删除|已下架|已失效)/,
    /商品(不存在|已下架|已失效|已删除)|宝贝(不存在|已下架)|店铺不存在/,
    /(文章|视频|帖子|资源)(不存在|已删除|已下架|已失效)/,
    /(请|需要?)登录后(查看|访问|继续)|登录(后)?才能(查看|访问)/,
    /page not found|404 not found|content (not found|unavailable|removed)/i,
    /(item|product|listing) (no longer available|not available|removed|unavailable)/i,
    /(sign|log) ?in (required|to (view|continue|see))/i,
    /this (page|video|post|account) (isn'?t|is not|is no longer) available/i,
  ];
  const LOGIN_URL_PATTERN = /\/(login|signin|sign-in|passport|auth|account\/login)\b/i;

  function isJsRenderedShell(html) {
    const hasScript = /<script[\s>]/i.test(html);
    if (!hasScript) return false;
    return (
      /<div[^>]+id=["'](root|app|__next|__nuxt|main)["']/i.test(html) ||
      /data-reactroot|data-v-app|ng-version|__NEXT_DATA__|window\.__INITIAL_STATE__/i.test(html) ||
      ((html.match(/<script/gi) || []).length >= 3)
    );
  }

  function analyzeHtml(originalUrl, finalUrl, html) {
    try {
      const o = new URL(originalUrl);
      const f = new URL(finalUrl);
      const hadPath = o.pathname.length > 1 || o.search.length > 0;
      if (LOGIN_URL_PATTERN.test(f.pathname)) return { kind: 'suspect', detail: 'login-wall' };
      if (hadPath && f.hostname === o.hostname && f.pathname === '/' && !f.search) {
        return { kind: 'suspect', detail: 'redirect-home' };
      }
    } catch (_) {}

    const shell = isJsRenderedShell(html);
    const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    const title = (titleMatch && titleMatch[1]) || '';
    const sample = shell ? '' : html.slice(0, 4096);
    for (const re of SOFT_DEAD_PATTERNS) {
      if (re.test(title) || (sample && re.test(sample))) return { kind: 'suspect', detail: 'soft-404' };
    }
    if (!shell) {
      const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, '').trim();
      if (html.length > 0 && text.length < 80) return { kind: 'suspect', detail: 'empty-page' };
    }
    return { kind: 'ok', detail: '' };
  }

  async function probeUrl(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        credentials: 'include',
      });
      if (res.status === 404 || res.status === 410) return { kind: 'dead', detail: 'HTTP ' + res.status };
      if (res.status === 401 || res.status === 403) return { kind: 'suspect', detail: 'HTTP ' + res.status };
      if (res.status >= 500) return { kind: 'suspect', detail: 'HTTP ' + res.status };
      if (res.status >= 400) return { kind: 'dead', detail: 'HTTP ' + res.status };
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        const html = (await res.text()).slice(0, 65536);
        return analyzeHtml(url, res.url, html);
      }
      return { kind: 'ok', detail: '' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { kind: 'suspect', detail: 'timeout' };
      return { kind: 'dead', detail: 'unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchPageMeta(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        credentials: 'include',
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('text/html')) return null;
      const html = (await res.text()).slice(0, 32768);
      const readMeta = (name) =>
        (
          (new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i').exec(html) || [])[1] ||
          (new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${name}["']`, 'i').exec(html) || [])[1] ||
          ''
        ).trim();
      const title = (readMeta('og:title') || readMeta('twitter:title') || ((/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '')).trim();
      const desc = readMeta('description') || readMeta('og:description') || readMeta('twitter:description');
      if (!title && !desc) return null;
      return { title, description: desc };
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  const PENDING_KEY = 'pendingNewBookmarks';
  async function getPending() {
    const data = await chrome.storage.local.get(PENDING_KEY);
    return data[PENDING_KEY] || [];
  }
  async function setPending(ids) {
    await chrome.storage.local.set({ [PENDING_KEY]: ids });
    try {
      await chrome.action.setBadgeText({ text: ids.length ? String(ids.length) : '' });
      if (ids.length) await chrome.action.setBadgeBackgroundColor({ color: '#0A84FF' });
    } catch (_) {}
  }

  try {
    chrome.sidePanel &&
      chrome.sidePanel.setPanelBehavior &&
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  } catch (_) {}

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'probeUrl' && typeof msg.url === 'string') {
      probeUrl(msg.url).then(sendResponse);
      return true;
    }
    if (msg.type === 'fetchMeta' && typeof msg.url === 'string') {
      fetchPageMeta(msg.url).then(sendResponse);
      return true;
    }
    if (msg.type === 'openSidePanel' || msg.action === 'openAiSidePanel') {
      chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        const open = () => {
          if (tab && tab.windowId != null && chrome.sidePanel && chrome.sidePanel.open) {
            chrome.sidePanel.open({ windowId: tab.windowId });
          }
        };
        if (chrome.sidePanel && chrome.sidePanel.setOptions) {
          chrome.sidePanel
            .setOptions({ path: 'ai/sidepanel.html', enabled: true })
            .then(open)
            .catch(open);
        } else {
          open();
        }
      });
      sendResponse({ ok: true });
      return false;
    }
  });

  chrome.bookmarks.onCreated.addListener(async (id, node) => {
    if (!node.url || !/^https?:/.test(node.url)) return;
    const data = await chrome.storage.local.get('classifyResult');
    if (!data.classifyResult) return;
    const pending = await getPending();
    if (!pending.includes(id)) {
      pending.push(id);
      await setPending(pending);
    }
  });

  chrome.bookmarks.onRemoved.addListener(async (id) => {
    const pending = await getPending();
    const next = pending.filter((p) => p !== id);
    if (next.length !== pending.length) await setPending(next);
  });

  // Extra command for AI side panel without overriding AI Bookmark OS commands
  if (chrome.commands && chrome.commands.onCommand) {
    chrome.commands.onCommand.addListener((command) => {
      if (command === 'open-ai-sidepanel') {
        chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          if (tab && tab.windowId != null && chrome.sidePanel && chrome.sidePanel.open) {
            chrome.sidePanel.open({ windowId: tab.windowId });
          }
        });
      }
    });
  }


  // After extension update, sidepanel can show changelog
  try {
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'update' && details.previousVersion) {
        const current = chrome.runtime.getManifest().version;
        if (details.previousVersion !== current) {
          chrome.storage.local.set({
            pendingWhatsNew: { from: details.previousVersion, to: current, at: Date.now() },
          });
        }
      }
    });
  } catch (_) {}

  getPending().then((ids) => {
    try {
      chrome.action.setBadgeText({ text: ids.length ? String(ids.length) : '' });
    } catch (_) {}
  });
})();
