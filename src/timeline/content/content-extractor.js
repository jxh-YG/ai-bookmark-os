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
      const doc = cloneReadableDocument();
      const article = typeof Readability === 'function' ? new Readability(doc).parse() : null;
      const articleText = textFromArticleHtml(article?.content || '');
      const fallbackText = normalizeText(document.querySelector('article, main, [role="main"]')?.innerText || document.body?.innerText || '');
      const textContent = normalizeText(articleText || article?.textContent || fallbackText);
      const title = article?.title || document.querySelector('meta[property="og:title"]')?.content || document.title || '';
      const excerpt = article?.excerpt || metaDesc || textContent.slice(0, 240);
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
