// 单条链接探测逻辑（在 background service worker 中执行，避免 sidepanel CSP 噪音）

export interface ProbeResult {
  kind: 'ok' | 'dead' | 'suspect';
  detail: string;
}

const DEAD_CHECK_TIMEOUT = 10_000;

/** 软 404 / 失效内容关键词（标题或正文命中即疑似） */
const SOFT_DEAD_PATTERNS: RegExp[] = [
  // 中文
  /页面不存在|页面未找到|找不到(该|此|你要的)?页面|页面已删除|内容(不存在|已删除|已下架|已失效)/,
  /商品(不存在|已下架|已失效|已删除)|宝贝(不存在|已下架)|店铺不存在/,
  /(文章|视频|帖子|资源)(不存在|已删除|已下架|已失效)/,
  /(请|需要?)登录后(查看|访问|继续)|登录(后)?才能(查看|访问)/,
  // 英文
  /page not found|404 not found|content (not found|unavailable|removed)/i,
  /(item|product|listing) (no longer available|not available|removed|unavailable)/i,
  /(sign|log) ?in (required|to (view|continue|see))/i,
  /this (page|video|post|account) (isn'?t|is not|is no longer) available/i,
];

const CONFIRMED_MISSING_PATTERNS = SOFT_DEAD_PATTERNS.filter(
  (_pattern, index) => index !== 3 && index !== 6,
);

/** 登录页 URL 特征 */
const LOGIN_URL_PATTERN = /\/(login|signin|sign-in|passport|auth|account\/login)\b/i;

/**
 * 判断是否为 JS 渲染型页面（SPA 壳）：
 * 初始 HTML 几乎无内容、靠脚本运行时渲染，静态分析无法代表真实页面。
 */
function isJsRenderedShell(html: string): boolean {
  const hasScript = /<script[\s>]/i.test(html);
  if (!hasScript) return false;
  return (
    /<div[^>]+id=["'](root|app|__next|__nuxt|main)["']/i.test(html) ||
    /data-reactroot|data-v-app|ng-version|__NEXT_DATA__|window\.__INITIAL_STATE__/i.test(html) ||
    (html.match(/<script/gi)?.length ?? 0) >= 3
  );
}

/** 内容层启发式：200 响应进一步判断是否为软 404 / 登录墙 / 跳首页 */
function inspectContent(originalUrl: string, finalUrl: string, html: string): ProbeResult {
  // 1) 重定向漂移：原 URL 有深路径，最终却落在首页或登录页
  try {
    const orig = new URL(originalUrl);
    const final = new URL(finalUrl);
    const origHasPath = orig.pathname.length > 1 || orig.search.length > 0;
    if (LOGIN_URL_PATTERN.test(final.pathname)) {
      return { kind: 'suspect', detail: 'login-wall' };
    }
    if (origHasPath && final.hostname === orig.hostname && final.pathname === '/' && !final.search) {
      return { kind: 'suspect', detail: 'redirect-home' };
    }
  } catch {
    /* URL 解析失败则跳过该项检查 */
  }

  const jsShell = isJsRenderedShell(html);
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title = titleMatch?.[1] ?? '';

  // 2) 软 404 / 失效关键词：SPA 壳只信 <title>；静态页面检查 title + 正文前 4KB
  const snippet = jsShell ? '' : html.slice(0, 4096);
  for (const p of SOFT_DEAD_PATTERNS) {
    if (p.test(title) || (snippet && p.test(snippet))) {
      return { kind: 'suspect', detail: 'soft-404' };
    }
  }

  // 3) 空页面：仅对非 JS 渲染的静态页面生效
  if (!jsShell) {
    const text = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, '')
      .trim();
    if (html.length > 0 && text.length < 80) {
      return { kind: 'suspect', detail: 'empty-page' };
    }
  }

  return { kind: 'ok', detail: '' };
}

async function inspectMissingResponse(originalUrl: string, resp: Response): Promise<ProbeResult> {
  const ct = resp.headers.get('content-type') ?? '';
  if (!ct.includes('text/html')) return { kind: 'suspect', detail: `HTTP ${resp.status} non-HTML response` };
  const html = (await resp.text()).slice(0, 65536);
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
  const sample = isJsRenderedShell(html)
    ? title
    : html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ').slice(0, 65536);
  if (CONFIRMED_MISSING_PATTERNS.some((pattern) => pattern.test(sample))) {
    return { kind: 'dead', detail: `HTTP ${resp.status} missing-page-content` };
  }
  const contentResult = inspectContent(originalUrl, resp.url, html);
  return { kind: 'suspect', detail: contentResult.kind === 'ok' ? `HTTP ${resp.status} usable-or-inconclusive-page` : contentResult.detail };
}

/** 抓取页面 meta（用于低信息量标题的分类增强）；失败返回 null */
export async function fetchPageMeta(
  url: string,
): Promise<{ title: string; description: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6_000);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
      credentials: 'omit',
    });
    const ct = resp.headers.get('content-type') ?? '';
    if (!resp.ok || !ct.includes('text/html')) return null;
    const html = (await resp.text()).slice(0, 32768);
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
    const description =
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html)?.[1]?.trim() ??
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html)?.[1]?.trim() ??
      '';
    if (!title && !description) return null;
    return { title, description };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 探测单条链接：协议层 + 内容层两级判定
 *  优化：先发 HEAD 请求，仅当 HEAD 返回 200 且 Content-Type 为 text/html 时才发 GET。
 *  这样对绝大多数非 HTML 资源（图片、PDF、下载文件等）节省完整响应体下载。
 */
export async function probeUrl(url: string): Promise<ProbeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEAD_CHECK_TIMEOUT);
  try {
    // ── 第一步：HEAD 快速探测 ──
    let headStatus = 0;
    let headContentType = '';
    try {
      const headResp = await fetch(url, {
        method: 'HEAD',
        signal: ctrl.signal,
        redirect: 'follow',
        credentials: 'omit',
      });
      headStatus = headResp.status;
      headContentType = headResp.headers.get('content-type') ?? '';
    } catch {
      // HEAD 不支持或超时，退回到 GET
      headStatus = 0;
    }

    // HEAD 明确死亡状态，进一步通过 GET + 内容确认
    if (headStatus === 404 || headStatus === 410) {
      const resp = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        credentials: 'omit',
      });
      const firstResult = await inspectMissingResponse(url, resp);
      if (firstResult.kind !== 'dead') return firstResult;
      // 双确认
      const confirmation = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        credentials: 'omit',
        cache: 'no-store',
      });
      if (confirmation.status !== 404 && confirmation.status !== 410) {
        return { kind: 'suspect', detail: `unconfirmed HTTP ${headStatus}` };
      }
      const confirmResult = await inspectMissingResponse(url, confirmation);
      return confirmResult.kind === 'dead'
        ? confirmResult
        : { kind: 'suspect', detail: `unconfirmed HTTP ${headStatus}` };
    }
    if (headStatus === 403 || headStatus === 401) return { kind: 'suspect', detail: `HTTP ${headStatus}` };
    if (headStatus >= 500) return { kind: 'suspect', detail: `HTTP ${headStatus}` };
    if (headStatus >= 400) return { kind: 'suspect', detail: `HTTP ${headStatus}` };

    // HEAD 返回 200，但不是 HTML：不需要下载内容，直接判定为正常
    if (headStatus === 200 && headContentType && !headContentType.includes('text/html')) {
      return { kind: 'ok', detail: '' };
    }

    // ── 第二步：GET 内容层检测（仅 HTML 或 HEAD 不可用时） ──
    const resp = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
      credentials: 'omit',
    });

    // —— 协议层 ——
    if (resp.status === 404 || resp.status === 410) {
      const firstResult = await inspectMissingResponse(url, resp);
      if (firstResult.kind !== 'dead') return firstResult;
      const confirmation = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        redirect: 'follow',
        credentials: 'omit',
        cache: 'no-store',
      });
      if (confirmation.status !== 404 && confirmation.status !== 410) {
        return { kind: 'suspect', detail: `unconfirmed HTTP ${resp.status}` };
      }
      const confirmationResult = await inspectMissingResponse(url, confirmation);
      return confirmationResult.kind === 'dead'
        ? confirmationResult
        : { kind: 'suspect', detail: `unconfirmed HTTP ${resp.status}` };
    }
    if (resp.status === 403 || resp.status === 401) {
      return { kind: 'suspect', detail: `HTTP ${resp.status}` };
    }
    if (resp.status >= 500) {
      return { kind: 'suspect', detail: `HTTP ${resp.status}` };
    }
    if (resp.status >= 400) {
      return { kind: 'suspect', detail: `HTTP ${resp.status}` };
    }

    // —— 内容层（仅 HTML 响应）——
    const ct = resp.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) {
      const html = (await resp.text()).slice(0, 65536);
      return inspectContent(url, resp.url, html);
    }
    return { kind: 'ok', detail: '' };
  } catch (e) {
    if ((e as Error).name === 'AbortError') return { kind: 'suspect', detail: 'timeout' };
    return { kind: 'suspect', detail: 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}
