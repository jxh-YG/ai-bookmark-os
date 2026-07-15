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
  const CONFIRMED_MISSING_PATTERNS = SOFT_DEAD_PATTERNS.filter((_, index) => index !== 3 && index !== 6);

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

  async function analyzeMissingResponse(originalUrl, res) {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return { kind: 'suspect', detail: 'HTTP ' + res.status + ' non-HTML response' };
    const html = (await res.text()).slice(0, 65536);
    const title = ((/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '');
    // SPA HTML can contain fallback metadata even though the client renders the route successfully.
    const sample = isJsRenderedShell(html)
      ? title
      : html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').slice(0, 65536);
    if (CONFIRMED_MISSING_PATTERNS.some((re) => re.test(sample))) {
      return { kind: 'dead', detail: 'HTTP ' + res.status + ' missing-page-content' };
    }
    const contentResult = analyzeHtml(originalUrl, res.url, html);
    return { kind: 'suspect', detail: contentResult.kind === 'ok' ? 'HTTP ' + res.status + ' usable-or-inconclusive-page' : contentResult.detail };
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
      if (res.status === 404 || res.status === 410) {
        const firstResult = await analyzeMissingResponse(url, res);
        if (firstResult.kind !== 'dead') return firstResult;
        const confirmation = await fetch(url, {
          method: 'GET',
          signal: ctrl.signal,
          redirect: 'follow',
          credentials: 'include',
          cache: 'no-store',
        });
        if (confirmation.status !== 404 && confirmation.status !== 410) {
          return { kind: 'suspect', detail: 'unconfirmed HTTP ' + res.status };
        }
        const confirmationResult = await analyzeMissingResponse(url, confirmation);
        return confirmationResult.kind === 'dead'
          ? confirmationResult
          : { kind: 'suspect', detail: 'unconfirmed HTTP ' + res.status };
      }
      if (res.status === 401 || res.status === 403) return { kind: 'suspect', detail: 'HTTP ' + res.status };
      if (res.status >= 500) return { kind: 'suspect', detail: 'HTTP ' + res.status };
      if (res.status >= 400) return { kind: 'suspect', detail: 'HTTP ' + res.status };
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('text/html')) {
        const html = (await res.text()).slice(0, 65536);
        return analyzeHtml(url, res.url, html);
      }
      return { kind: 'ok', detail: '' };
    } catch (e) {
      if (e && e.name === 'AbortError') return { kind: 'suspect', detail: 'timeout' };
      return { kind: 'suspect', detail: 'unreachable' };
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

  async function fetchPageContext(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        credentials: 'include',
      });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('text/html')) return null;
      const html = (await res.text()).slice(0, 65536);
      const readMeta = (name) =>
        (
          (new RegExp('<meta[^>]+(?:name|property)=["\\\']' + name + '["\\\'][^>]+content=["\\\']([^"\\\']*)["\\\']', 'i').exec(html) || [])[1] ||
          (new RegExp('<meta[^>]+content=["\\\']([^"\\\']*)["\\\'][^>]+(?:name|property)=["\\\']' + name + '["\\\']', 'i').exec(html) || [])[1] ||
          ''
        ).trim();
      const decode = (text) => String(text || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
      const clean = (text, limit) => decode(text)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, limit);
      const title = clean(readMeta('og:title') || readMeta('twitter:title') || ((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || ''), 180);
      const description = clean(readMeta('description') || readMeta('og:description') || readMeta('twitter:description'), 320);
      const siteName = clean(readMeta('og:site_name') || '', 100);
      const text = clean(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
          .replace(/<[^>]+>/g, ' '),
        700,
      );
      if (!title && !description && !text) return null;
      return { siteName, title, description, excerpt: text };
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
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
    if (msg.type === 'fetchPageContext' && typeof msg.url === 'string') {
      fetchPageContext(msg.url).then(sendResponse);
      return true;
    }
    if (msg.type === 'openSidePanel' || msg.action === 'openAiSidePanel') {
      (async () => {
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (chrome.sidePanel && chrome.sidePanel.setOptions) {
            await chrome.sidePanel.setOptions({ path: 'ai/sidepanel.html', enabled: true });
          }
          if (tab && tab.windowId != null && chrome.sidePanel && chrome.sidePanel.open) {
            await chrome.sidePanel.open({ windowId: tab.windowId });
            sendResponse({ ok: true });
            return;
          }
          sendResponse({ ok: false, error: 'sidePanel unavailable' });
        } catch (err) {
          sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
        }
      })();
      return true;
    }
  });


  // Extra command for AI side panel without overriding AI Bookmark OS commands
  if (chrome.commands && chrome.commands.onCommand) {
    chrome.commands.onCommand.addListener((command) => {
      if (command === 'open-ai-sidepanel') {
        chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
          const openFallback = () => chrome.tabs.create({ url: chrome.runtime.getURL('ai/sidepanel.html') });
          const open = () => {
            if (tab && tab.windowId != null && chrome.sidePanel && chrome.sidePanel.open) {
              return chrome.sidePanel.open({ windowId: tab.windowId }).catch(openFallback);
            }
            return openFallback();
          };
          if (chrome.sidePanel && chrome.sidePanel.setOptions) {
            chrome.sidePanel
              .setOptions({ path: 'ai/sidepanel.html', enabled: true })
              .catch(() => undefined)
              .then(open);
          } else {
            void open();
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

  // Clear legacy pending-pyramid-classify queue. AI assist tagging already handles new bookmarks.
  chrome.storage.local.remove('pendingNewBookmarks').then(() => {
    chrome.action.getBadgeText({}).then((text) => {
      if (text && /^\d+$/.test(text)) chrome.action.setBadgeText({ text: '' }).catch(() => {});
    }).catch(() => {});
  }).catch(() => {});
})();
