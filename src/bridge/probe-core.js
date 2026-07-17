// 书签链接探测共享核心，由扩展 Service Worker 直接加载。

(function initAiProbeCore() {
  const DEFAULT_TIMEOUT_MS = 10_000;
  const DEFAULT_PER_ATTEMPT_MS = 5_000;
  const DEFAULT_RETRIES = 2;
  const DEFAULT_BASE_DELAY_MS = 800;
  const DEFAULT_MAX_DELAY_MS = 3_000;
  const MAX_HTML_BYTES = 65_536;

  const ACCESS_LIMITED_STATUSES = new Set([401, 403, 407, 451]);
  const MISSING_STATUSES = new Set([404, 410]);
  const LOGIN_URL_PATTERN = /\/(login|signin|sign-in|passport|auth|account\/login)\b/i;

  // 仅供“HTTP 缺失 + 渲染页面信号”组合确认使用，不用于扫描普通 2xx 正文。
  const CONFIRMED_MISSING_PATTERNS = [
    /页面不存在|页面未找到|找不到(该|此|你要的)?页面|页面已删除|内容(不存在|已删除|已下架|已失效)/,
    /商品(不存在|已下架|已失效|已删除)|宝贝(不存在|已下架)|店铺不存在/,
    /(文章|视频|帖子|资源)(不存在|已删除|已下架|已失效)/,
    /page not found|404 not found|content (not found|unavailable|removed)/i,
    /(item|product|listing) (no longer available|not available|removed|unavailable)/i,
    /this (page|video|post|account) (isn'?t|is not|is no longer) available/i,
  ];

  // 普通 2xx 页面只检查标题，并要求标题整体呈现缺失页含义。
  const STRONG_MISSING_TITLE_PATTERNS = [
    /^(?:(?:error\s*)?404(?:\s*(?:error|not found))?|page not found|not found|content (?:not found|unavailable|removed)|this (?:page|video|post|account) (?:isn'?t|is not|is no longer) available)(?:\s*[-|:\u00b7\u2014]\s*[^|]{1,100})?$/i,
    /^(?:页面不存在|页面未找到|找不到(?:该|此|你要的)?页面|页面已删除|内容(?:不存在|已删除|已下架|已失效)|商品(?:不存在|已下架|已失效|已删除)|宝贝(?:不存在|已下架)|店铺不存在|(?:文章|视频|帖子|资源)(?:不存在|已删除|已下架|已失效))(?:\s*[-|\u00b7\u2014:\uff1a\uff5c]\s*[^|]{1,100})?$/i,
  ];

  function boundedNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }

  function normalizeOptions(options) {
    const source = options && typeof options === 'object' ? options : {};
    return {
      probeMode: source.probeMode === 'authenticated' ? 'authenticated' : 'anonymous',
      timeoutMs: boundedNumber(source.timeoutMs, DEFAULT_TIMEOUT_MS, 1, 120_000),
      perAttemptMs: boundedNumber(source.perAttemptMs, DEFAULT_PER_ATTEMPT_MS, 1, 60_000),
      retries: boundedNumber(source.retries, DEFAULT_RETRIES, 0, 10),
      baseDelayMs: boundedNumber(source.baseDelayMs, DEFAULT_BASE_DELAY_MS, 0, 30_000),
      maxDelayMs: boundedNumber(source.maxDelayMs, DEFAULT_MAX_DELAY_MS, 0, 60_000),
      signal: source.signal,
    };
  }

  function makeResult(state, reason, statusCode, finalUrl, probeMode) {
    return {
      state,
      reason,
      statusCode: Number.isInteger(statusCode) ? statusCode : null,
      finalUrl: typeof finalUrl === 'string' ? finalUrl : '',
      checkedAt: Date.now(),
      probeMode,
    };
  }

  function isHtmlContentType(contentType) {
    const normalized = String(contentType || '').toLowerCase();
    return normalized.includes('text/html') || normalized.includes('application/xhtml+xml');
  }

  function isRetryableStatus(status) {
    return status === 408 || status === 425 || status === 429 || (status >= 500 && status < 600);
  }

  function isConfirmedMissingText(text) {
    const sample = String(text || '').replace(/\s+/g, ' ').trim();
    return sample.length > 0 && CONFIRMED_MISSING_PATTERNS.some((pattern) => pattern.test(sample));
  }

  function getConfirmedMissingPatterns() {
    return CONFIRMED_MISSING_PATTERNS.map((pattern) => ({
      source: pattern.source,
      flags: pattern.flags,
    }));
  }

  function decodeTitle(text) {
    return String(text || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, String.fromCharCode(34))
      .replace(/&#39;/gi, String.fromCharCode(39))
      .replace(/\s+/g, ' ')
      .trim();
  }

  function readTitle(html) {
    const documentMarkup = String(html || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(documentMarkup);
    return decodeTitle(match ? match[1] : '');
  }

  function inspectSuccessfulHtml(originalUrl, finalUrl, html) {
    try {
      const original = new URL(originalUrl);
      const final = new URL(finalUrl || originalUrl);
      const originalIsDeepLink = original.pathname.length > 1 || Boolean(original.search);
      if (LOGIN_URL_PATTERN.test(final.pathname)) return 'login-redirect';
      if (
        originalIsDeepLink &&
        final.origin === original.origin &&
        final.pathname === '/' &&
        !final.search
      ) {
        return 'redirect-home';
      }
    } catch (_) {
      // URL 已在入口校验；响应 URL 异常时不据此制造疑似结果。
    }

    const title = readTitle(html);
    return STRONG_MISSING_TITLE_PATTERNS.some((pattern) => pattern.test(title))
      ? 'title-missing'
      : '';
  }

  function responseUrl(response, fallback) {
    return response && typeof response.url === 'string' && response.url ? response.url : fallback;
  }

  async function fetchOnce(url, method, settings, deadline) {
    if (settings.signal && settings.signal.aborted) return { ok: false, failure: 'aborted' };
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { ok: false, failure: 'timeout' };

    const controller = new AbortController();
    let timedOut = false;
    const timeoutMs = Math.min(settings.perAttemptMs, remaining);
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortFromCaller = () => controller.abort();
    if (settings.signal && typeof settings.signal.addEventListener === 'function') {
      settings.signal.addEventListener('abort', abortFromCaller, { once: true });
    }

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        redirect: 'follow',
        credentials: settings.probeMode === 'authenticated' ? 'include' : 'omit',
        cache: 'no-store',
      });
      return { ok: true, response };
    } catch (error) {
      if (settings.signal && settings.signal.aborted) return { ok: false, failure: 'aborted', error };
      if (timedOut || Date.now() >= deadline) return { ok: false, failure: 'timeout', error };
      return { ok: false, failure: 'network-error', error };
    } finally {
      clearTimeout(timeoutId);
      if (settings.signal && typeof settings.signal.removeEventListener === 'function') {
        settings.signal.removeEventListener('abort', abortFromCaller);
      }
    }
  }

  async function waitBeforeRetry(attempt, settings, deadline) {
    const delay = Math.min(settings.maxDelayMs, settings.baseDelayMs * Math.pow(2, attempt));
    if (delay <= 0) return settings.signal && settings.signal.aborted ? 'aborted' : '';
    if (Date.now() + delay >= deadline) return 'timeout';

    return new Promise((resolve) => {
      const cleanup = () => {
        if (settings.signal && typeof settings.signal.removeEventListener === 'function') {
          settings.signal.removeEventListener('abort', abort);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve('');
      }, delay);
      const abort = () => {
        clearTimeout(timer);
        cleanup();
        resolve('aborted');
      };
      if (settings.signal && typeof settings.signal.addEventListener === 'function') {
        settings.signal.addEventListener('abort', abort, { once: true });
      }
    });
  }

  function transientReasonForStatus(status) {
    if (status === 408 || status === 425) return 'request-timeout';
    if (status === 429) return 'rate-limited';
    return 'server-error';
  }

  /** 检测单条 URL；默认匿名，options.probeMode 可设为 authenticated。 */
  async function checkUrl(url, options) {
    const settings = normalizeOptions(options);
    let normalizedUrl;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return makeResult('unsupported', 'unsupported-scheme', null, String(url || ''), settings.probeMode);
      }
      normalizedUrl = parsed.href;
    } catch (_) {
      return makeResult('unsupported', 'invalid-url', null, String(url || ''), settings.probeMode);
    }

    if (settings.signal && settings.signal.aborted) {
      return makeResult('transient_failure', 'aborted', null, normalizedUrl, settings.probeMode);
    }

    const deadline = Date.now() + settings.timeoutMs;

    // HEAD 只作匿名扫描的正向优化；登录态复检必须先使用 credentials: include 的 GET。
    const head = settings.probeMode === 'anonymous'
      ? await fetchOnce(normalizedUrl, 'HEAD', settings, deadline)
      : { ok: false, failure: null };
    if (head.ok) {
      const status = head.response.status;
      const contentType = head.response.headers.get('content-type') || '';
      if (status >= 200 && status < 300 && contentType && !isHtmlContentType(contentType)) {
        return makeResult(
          'reachable',
          'non-html-resource',
          status,
          responseUrl(head.response, normalizedUrl),
          settings.probeMode,
        );
      }
    } else if (head.failure === 'aborted') {
      return makeResult('transient_failure', 'aborted', null, normalizedUrl, settings.probeMode);
    }

    let lastFailure = head.ok ? null : head.failure;
    let lastStatus = null;
    let lastFinalUrl = normalizedUrl;

    for (let attempt = 0; attempt <= settings.retries; attempt++) {
      if (attempt > 0) {
        const waitFailure = await waitBeforeRetry(attempt - 1, settings, deadline);
        if (waitFailure) {
          return makeResult('transient_failure', waitFailure, lastStatus, lastFinalUrl, settings.probeMode);
        }
      }

      const get = await fetchOnce(normalizedUrl, 'GET', settings, deadline);
      if (!get.ok) {
        lastFailure = get.failure;
        if (get.failure === 'aborted') {
          return makeResult('transient_failure', 'aborted', null, lastFinalUrl, settings.probeMode);
        }
        if (attempt < settings.retries) continue;
        return makeResult(
          'transient_failure',
          get.failure === 'timeout' ? 'timeout' : 'network-error',
          null,
          lastFinalUrl,
          settings.probeMode,
        );
      }

      const response = get.response;
      const status = response.status;
      const finalUrl = responseUrl(response, normalizedUrl);
      lastStatus = status;
      lastFinalUrl = finalUrl;

      if (MISSING_STATUSES.has(status)) {
        return makeResult(
          'content_suspect',
          settings.probeMode === 'anonymous' ? 'anonymous-not-found' : 'authenticated-not-found',
          status,
          finalUrl,
          settings.probeMode,
        );
      }

      if (ACCESS_LIMITED_STATUSES.has(status)) {
        return makeResult('access_limited', 'access-restricted', status, finalUrl, settings.probeMode);
      }

      if (isRetryableStatus(status)) {
        lastFailure = transientReasonForStatus(status);
        if (attempt < settings.retries) continue;
        return makeResult('transient_failure', lastFailure, status, finalUrl, settings.probeMode);
      }

      if (status >= 400 && status < 500) {
        return makeResult('content_suspect', 'http-client-error', status, finalUrl, settings.probeMode);
      }

      if (status < 200 || status >= 600) {
        return makeResult('transient_failure', 'invalid-response', status, finalUrl, settings.probeMode);
      }

      const contentType = response.headers.get('content-type') || '';
      if (isHtmlContentType(contentType)) {
        let html;
        try {
          html = (await response.text()).slice(0, MAX_HTML_BYTES);
        } catch (_) {
          lastFailure = 'network-error';
          if (attempt < settings.retries) continue;
          return makeResult('transient_failure', 'network-error', status, finalUrl, settings.probeMode);
        }
        const contentReason = inspectSuccessfulHtml(normalizedUrl, finalUrl, html);
        if (contentReason === 'login-redirect') {
          return makeResult('reachable', contentReason, status, finalUrl, settings.probeMode);
        }
        if (contentReason) {
          return makeResult('content_suspect', contentReason, status, finalUrl, settings.probeMode);
        }
      }

      return makeResult('reachable', 'http-success', status, finalUrl, settings.probeMode);
    }

    return makeResult(
      'transient_failure',
      lastFailure === 'timeout' ? 'timeout' : 'network-error',
      lastStatus,
      lastFinalUrl,
      settings.probeMode,
    );
  }

  function legacyDetail(result) {
    if (result.reason === 'login-redirect') return 'login-wall';
    if (result.reason === 'title-missing') return 'soft-404';
    if (result.statusCode != null) return `HTTP ${result.statusCode} ${result.reason}`;
    return result.reason;
  }

  /** 兼容旧 sidepanel 协议；匿名扫描永远不会产生 dead。 */
  async function probeUrl(url, options) {
    const result = await checkUrl(url, options);
    if (result.state === 'reachable') return { kind: 'ok', detail: '' };
    if (result.state === 'confirmed_missing') return { kind: 'dead', detail: legacyDetail(result) };
    return { kind: 'suspect', detail: legacyDetail(result) };
  }

  function readMetaContent(html, name) {
    const quote = '[\\x22\\x27]';
    const byName = new RegExp(
      '<meta[^>]+(?:name|property)=' + quote + name + quote + '[^>]+content=' + quote + '([^\\x22\\x27]*)' + quote,
      'i',
    );
    const byContent = new RegExp(
      '<meta[^>]+content=' + quote + '([^\\x22\\x27]*)' + quote + '[^>]+(?:name|property)=' + quote + name + quote,
      'i',
    );
    return ((byName.exec(html) || [])[1] || (byContent.exec(html) || [])[1] || '').trim();
  }

  /** 抓取页面元数据（title + description），用于低信息量标题的分类增强 */
  async function fetchPageMeta(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        credentials: 'omit',
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !isHtmlContentType(contentType)) return null;
      const html = (await res.text()).slice(0, 32768);
      const title = (
        readMetaContent(html, 'og:title') ||
        readMetaContent(html, 'twitter:title') ||
        readTitle(html)
      ).trim();
      const description =
        readMetaContent(html, 'description') ||
        readMetaContent(html, 'og:description') ||
        readMetaContent(html, 'twitter:description');
      if (!title && !description) return null;
      return { title, description };
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 抓取页面上下文（site name + title + description + excerpt），用于书签分类 */
  async function fetchPageContext(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        credentials: 'omit',
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !isHtmlContentType(contentType)) return null;
      const html = (await res.text()).slice(0, MAX_HTML_BYTES);
      const clean = (text, limit) => decodeTitle(text).slice(0, limit);
      const title = clean(
        readMetaContent(html, 'og:title') ||
        readMetaContent(html, 'twitter:title') ||
        readTitle(html),
        180,
      );
      const description = clean(
        readMetaContent(html, 'description') ||
        readMetaContent(html, 'og:description') ||
        readMetaContent(html, 'twitter:description'),
        320,
      );
      const siteName = clean(readMetaContent(html, 'og:site_name'), 100);
      const excerpt = clean(
        html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' '),
        700,
      );
      if (!title && !description && !excerpt) return null;
      return { siteName, title, description, excerpt };
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 合并登录态 GET 与临时标签页的最小渲染信号。除“认证 404/410 + 明确缺失页”外，
   * 一律保留为待复核，绝不据此生成删除候选。
   */
  function resolveSessionRecheck(sessionResult, rendered) {
    const base = sessionResult && typeof sessionResult === 'object'
      ? sessionResult
      : makeResult('content_suspect', 'session-recheck-failed', null, '', 'authenticated');
    const finalUrl = typeof rendered?.url === 'string' && rendered.url ? rendered.url : base.finalUrl;
    if (
      base.probeMode === 'authenticated' &&
      base.state === 'content_suspect' &&
      base.reason === 'authenticated-not-found' &&
      MISSING_STATUSES.has(base.statusCode) &&
      rendered?.missingSignal === true &&
      rendered?.challengeSignal !== true
    ) {
      return makeResult('confirmed_missing', 'session-and-rendered-missing', base.statusCode, finalUrl, 'rendered-tab');
    }
    return makeResult(
      'content_suspect',
      rendered?.challengeSignal ? 'session-challenge-or-waf' : 'session-render-inconclusive',
      base.statusCode,
      finalUrl,
      'rendered-tab',
    );
  }

  self.AiProbeCore = {
    checkUrl,
    resolveSessionRecheck,
    probeUrl,
    isConfirmedMissingText,
    getConfirmedMissingPatterns,
    fetchPageMeta,
    fetchPageContext,
  };
})();
