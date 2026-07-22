// Content script: extract readable article text using Readability.
// Injected programmatically from the service worker when a bookmark is created.
(function () {
  'use strict';

  const NOISE_SELECTOR = [
    'script', 'style', 'noscript', 'template', 'iframe', 'svg', 'canvas',
    'nav', 'header', 'footer', 'aside', 'form', 'button',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
    '.nav', '.navbar', '.menu', '.sidebar', '.footer', '.header',
    '.advertisement', '.ads', '.ad', '.recommend', '.related', '.share', '.comment'
  ].join(',');

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function bodyTextLength() {
    return normalizeText(document.body?.innerText || '').length;
  }

  async function waitForReadableContent(maxWaitMs) {
    const started = Date.now();
    while (document.readyState === 'loading' && Date.now() - started < maxWaitMs) {
      await sleep(120);
    }

    while (Date.now() - started < maxWaitMs) {
      if (document.querySelector('article, main, [role="main"], .post, .article, .content, .markdown-body')) return;
      if (bodyTextLength() >= 500) return;
      await sleep(250);
    }
  }

  function cloneReadableDocument() {
    const doc = document.cloneNode(true);
    doc.querySelectorAll(NOISE_SELECTOR).forEach(node => node.remove());
    return doc;
  }

  function textFromArticleHtml(html) {
    if (!html) return '';
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll(NOISE_SELECTOR).forEach(node => node.remove());
    const blocks = [...tpl.content.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,td')]
      .map(node => normalizeText(node.innerText || node.textContent || ''))
      .filter(text => text.length >= 2);
    return normalizeText(blocks.length ? blocks.join('\n\n') : tpl.content.textContent || '');
  }

  function readMetaValues(selector) {
    return [...document.querySelectorAll(selector)]
      .map(node => normalizeText(node.content || ''))
      .filter(Boolean);
  }

  function extractLeadExcerpt(root) {
    const container = root || document.body;
    const blocks = [...(container?.querySelectorAll?.('h1,h2,h3,p') || [])]
      .map(node => ({ tag: node.tagName?.toLowerCase() || '', text: normalizeText(node.innerText || '') }))
      .filter(item => item.text.length >= 2);
    const firstHeading = blocks.findIndex(item => /^h[1-3]$/.test(item.tag));
    const candidates = firstHeading >= 0 ? blocks.slice(firstHeading + 1) : blocks;
    const paragraph = candidates.find(item => item.tag === 'p' && item.text.length >= 20 && item.text.length <= 500);
    return paragraph?.text || '';
  }

  function extractStructuredTypes() {
    const types = [];
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const payload = JSON.parse(node.textContent || 'null');
        const entries = Array.isArray(payload) ? payload : [payload, ...(payload?.['@graph'] || [])];
        for (const entry of entries) {
          const value = entry?.['@type'];
          for (const type of (Array.isArray(value) ? value : [value])) {
            if (typeof type === 'string' && type) types.push(type);
          }
        }
      } catch (_) {
        // Malformed JSON-LD is common enough that it must not fail extraction.
      }
    }
    return [...new Set(types)].slice(0, 12);
  }

  async function extractContent(options = {}) {
    const maxWaitMs = Number(options.maxWaitMs || 3500);
    const startedAt = Date.now();
    try {
      await waitForReadableContent(maxWaitMs);

      const metaDesc =
        document.querySelector('meta[name="description"]')?.content ||
        document.querySelector('meta[property="og:description"]')?.content ||
        document.querySelector('meta[name="twitter:description"]')?.content ||
        '';
      const metaKeywords = readMetaValues('meta[name="keywords"], meta[property="article:tag"]')
        .flatMap(value => value.split(/[,\uFF0C]/))
        .map(value => normalizeText(value))
        .filter(Boolean)
        .slice(0, 20);
      const contentRoot = document.querySelector('article, main, [role="main"]') || document.body;
      const headings = [...(contentRoot?.querySelectorAll('h1,h2,h3') || [])]
        .map(node => normalizeText(node.innerText || node.textContent || ''))
        .filter(text => text.length >= 2)
        .slice(0, 20);
      const leadExcerpt = extractLeadExcerpt(contentRoot);
      const structuredTypes = extractStructuredTypes();
      const doc = cloneReadableDocument();
      const article = typeof Readability === 'function' ? new Readability(doc).parse() : null;
      const articleText = textFromArticleHtml(article?.content || '');
      const fallbackText = normalizeText(document.querySelector('article, main, [role="main"]')?.innerText || document.body?.innerText || '');
      const textContent = normalizeText(articleText || article?.textContent || fallbackText);
      const title = article?.title || document.querySelector('meta[property="og:title"]')?.content || document.title || '';
      const excerpt = leadExcerpt || article?.excerpt || metaDesc || textContent.slice(0, 240);
      const status = textContent.length >= 80 ? 'success' : (bodyTextLength() > 0 ? 'empty' : 'failed');
      const failureReason = status === 'success'
        ? ''
        : status === 'empty'
          ? 'readable_content_empty'
          : 'document_body_empty';

      return {
        status,
        failureReason,
        title,
        originalUrl: options.originalUrl || location.href,
        finalUrl: location.href,
        textContent,
        excerpt,
        metaDesc,
        metaKeywords,
        headings,
        structuredTypes,
        lengthChars: textContent.length,
        fetchedAt: Date.now(),
        elapsedMs: Date.now() - startedAt,
        source: 'rendered-page'
      };
    } catch (err) {
      return {
        status: 'failed',
        failureReason: err?.message || 'extract_exception',
        title: document.title || '',
        originalUrl: options.originalUrl || location.href,
        finalUrl: location.href,
        textContent: '',
        excerpt: '',
        metaDesc: '',
        metaKeywords: [],
        headings: [],
        structuredTypes: [],
        lengthChars: 0,
        fetchedAt: Date.now(),
        elapsedMs: Date.now() - startedAt,
        source: 'rendered-page'
      };
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.action === 'extractContent') {
      extractContent(message.options || {}).then(sendResponse);
      return true;
    }
  });
})();
