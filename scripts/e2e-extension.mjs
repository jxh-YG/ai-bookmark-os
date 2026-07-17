import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const extensionPath = resolve('dist');
const artifactsPath = resolve('tmp-ui-shots');
mkdirSync(artifactsPath, { recursive: true });

function listen(server) {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolveListen(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

function waitForStorage(page, predicate, timeoutMs = 8000) {
  return page.waitForFunction(predicate, undefined, { timeout: timeoutMs });
}

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${label} has horizontal overflow: ${JSON.stringify(dimensions)}`);
}

async function openExtensionPage(context, extensionId, path, errors) {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(`${path}: ${error.message}`));
  await page.goto(`chrome-extension://${extensionId}/${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0);
  return page;
}

const requests = { ai: 0, rss: 0 };
const mockServer = createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Headers', '*');
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.url === '/feed.xml') {
    requests.rss += 1;
    response.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    response.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>Mock Feed</title><link>https://example.test</link><item><guid>mock-1</guid><title>Mock article</title><link>https://example.test/article</link><pubDate>Fri, 17 Jul 2026 08:00:00 GMT</pubDate><description>Local RSS fixture</description></item></channel></rss>`);
    return;
  }
  if (request.url === '/v1/chat/completions') {
    requests.ai += 1;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({
      model: 'mock-model',
      choices: [{ message: { content: JSON.stringify({ tags: [{ tag: '前端开发', confidence: 0.96 }] }) } }],
    }));
    return;
  }
  response.writeHead(404);
  response.end('not found');
});

const port = await listen(mockServer);
const profilePath = mkdtempSync(join(tmpdir(), 'ai-bookmark-os-e2e-'));
let context;
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--disable-default-apps',
    ],
  });

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  assert.ok(extensionId, 'extension service worker did not expose an extension id');

  await worker.evaluate(async ({ port: fixturePort }) => {
    const tree = await chrome.bookmarks.getTree();
    const bar = tree[0]?.children?.[0];
    if (!bar) throw new Error('bookmark bar unavailable');
    const folder = await chrome.bookmarks.create({ parentId: bar.id, title: 'E2E Synthetic' });
    await chrome.bookmarks.create({ parentId: folder.id, title: 'Synthetic React', url: 'https://example.test/react' });
    await chrome.bookmarks.create({ parentId: folder.id, title: 'Synthetic Design', url: 'https://example.test/design' });
    await chrome.bookmarks.create({ parentId: folder.id, title: 'Synthetic Operations', url: 'https://example.test/ops' });
    await chrome.storage.local.set({
      ai_classifier_config: {
        enabled: true,
        assistClassificationEnabled: true,
        provider: 'custom',
        apiKey: 'e2e-local-key',
        model: 'mock-model',
        timeout: 5,
        customFormat: 'openai',
        customEndpoint: `http://127.0.0.1:${fixturePort}/v1`,
        customFullUrl: false,
        allowPageContentForAi: true,
      },
      ai_tag_cache: { version: 2, entries: { old: { tags: ['cached'] } } },
      page_content_cache: { 'https://example.test/react': { textContent: 'private cached body' } },
      rss_settings: { pollIntervalMin: 30, maxItemsPerFeed: 100, proxyFallback: false },
      rss_feeds: [{
        id: 'e2e-feed',
        url: `http://127.0.0.1:${fixturePort}/feed.xml`,
        title: 'Mock Feed',
        favicon: 'data:image/png;base64,iVBORw0KGgo=',
        failCount: 0,
        lastFetched: 0,
        autoBookmark: false,
        notify: false,
      }],
    });
    await syncAllBookmarks();
    await syncAllBookmarks();
    const timeline = await chrome.storage.local.get('bookmark_timeline_data');
    const bookmarks = timeline.bookmark_timeline_data || [];
    if (!bookmarks.length) throw new Error('synthetic bookmarks were not mirrored');
    bookmarks[0] = {
      ...bookmarks[0],
      contentText: 'private cached body',
      contentExcerpt: 'private summary',
      contentHeadings: ['Private heading'],
    };
    await chrome.storage.local.set({ bookmark_timeline_data: bookmarks });
  }, { port });

  const pageErrors = [];
  const settings = await openExtensionPage(context, extensionId, 'pages/settings/settings.html', pageErrors);
  await settings.locator('[data-panel="ai"]').click();
  await settings.locator('#panel-ai').waitFor({ state: 'visible' });
  assert.equal(await settings.locator('#aiPageContentToggle').isChecked(), true);
  assert.match(await settings.locator('[data-i18n="aiPrivacyNotice"]').innerText(), /AI|服务商|provider/i);

  const aiRequestsBeforeConnectionTest = requests.ai;
  await settings.locator('#aiTestBtn').click();
  await settings.locator('.toast').filter({ hasText: /连接成功|Connection successful/i }).waitFor({ timeout: 10000 });
  assert.equal(requests.ai, aiRequestsBeforeConnectionTest + 1, 'AI connection test did not reach the local mock service exactly once');

  await settings.locator('#aiPageContentToggle').evaluate((element) => element.click());
  await waitForStorage(settings, async () => {
    const state = await chrome.storage.local.get(['ai_classifier_config', 'ai_tag_cache', 'page_content_cache', 'bookmark_timeline_data']);
    const mirror = state.bookmark_timeline_data?.[0] || {};
    return state.ai_classifier_config?.allowPageContentForAi === false
      && state.ai_tag_cache === undefined
      && state.page_content_cache === undefined
      && mirror.contentText === undefined
      && mirror.contentExcerpt === undefined
      && mirror.contentHeadings === undefined;
  });
  await settings.locator('#aiPageContentToggle').evaluate((element) => element.click());
  await waitForStorage(settings, async () => (await chrome.storage.local.get('ai_classifier_config')).ai_classifier_config?.allowPageContentForAi === true);

  await settings.locator('[data-panel="rss"]').click();
  await settings.locator('#panel-rss').waitFor({ state: 'visible' });
  assert.equal(await settings.getByRole('checkbox', { name: /代理回退|Proxy fallback/i }).count(), 1);
  settings.once('dialog', async (dialog) => {
    assert.match(dialog.message(), /订阅 URL|subscription URL/i);
    await dialog.dismiss();
  });
  await settings.locator('#rssProxyFallbackToggle').evaluate((element) => element.click());
  assert.equal(await settings.locator('#rssProxyFallbackToggle').isChecked(), false);

  await settings.locator('#rssRefreshAllBtn').click();
  await settings.locator('.toast').filter({ hasText: /成功 1|Succeeded 1/i }).waitFor({ timeout: 10000 });
  assert.equal(requests.rss, 1, 'RSS refresh did not reach the local mock service');
  const rssItems = await worker.evaluate(async () => (await chrome.storage.local.get('rss_items_e2e-feed'))['rss_items_e2e-feed'] || []);
  assert.equal(rssItems.length, 1);

  await settings.locator('[data-panel="ai"]').click();
  await settings.waitForFunction(() => !document.querySelector('.toast'), undefined, { timeout: 8000 });
  await settings.screenshot({ path: join(artifactsPath, 'settings-desktop.png'), fullPage: true });
  await assertNoHorizontalOverflow(settings, 'settings desktop');
  await settings.keyboard.press('Home');
  await settings.keyboard.press('Tab');
  assert.equal(await settings.evaluate(() => document.activeElement?.matches('button, input, select, textarea, a[href]')), true, 'keyboard focus did not reach an interactive control');

  await settings.locator('[data-panel="activelearning"]').click();
  await settings.locator('#panel-activelearning').waitFor({ state: 'visible' });
  assert.equal(await settings.locator('#recommendationRuleTabs [role="tab"]').count(), 4);
  await settings.locator('#reevaluateBookmarksBtn').click();
  await settings.locator('#reevaluationResults').filter({ hasText: /评估完成|Evaluation complete/i }).waitFor({ timeout: 15000 });
  await settings.locator('.review-item--recommendation').first().waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await settings.locator('#reevaluationResults .reevaluation-select input').count(), 0, 'medium-confidence reevaluation items must not be preselected');
  const recommendationCandidates = await settings.locator('.review-item--recommendation .review-candidates').allInnerTexts();
  assert.doesNotMatch(recommendationCandidates.join('\n'), /E2E Synthetic/, 'folder names must not leak into tag candidates');
  await settings.screenshot({ path: join(artifactsPath, 'learning-desktop.png'), fullPage: true });
  await assertNoHorizontalOverflow(settings, 'learning desktop');

  await settings.setViewportSize({ width: 390, height: 844 });
  await settings.screenshot({ path: join(artifactsPath, 'learning-narrow.png'), fullPage: true });
  await assertNoHorizontalOverflow(settings, 'learning narrow');
  await settings.locator('[data-panel="ai"]').click();
  await settings.locator('#panel-ai').waitFor({ state: 'visible' });
  await settings.screenshot({ path: join(artifactsPath, 'settings-narrow.png') });
  await assertNoHorizontalOverflow(settings, 'settings narrow');
  const compressedRows = await settings.locator('#panel-ai .setting-row:visible .setting-main').evaluateAll((elements) => elements
    .filter((element) => element.textContent.trim().length > 6 && element.getBoundingClientRect().width < 120)
    .map((element) => ({ text: element.textContent.trim().slice(0, 60), width: element.getBoundingClientRect().width })));
  assert.deepEqual(compressedRows, [], `narrow settings text is compressed: ${JSON.stringify(compressedRows)}`);
  assert.equal(await settings.getByRole('checkbox', { name: /发送页面内容|Share page content/i }).count(), 1);

  const pages = [
    ['workspace', 'pages/standalone/standalone.html', /Synthetic|书签|Bookmark/i],
    ['bookmark navigation', 'ai/bookmark-nav.html', /Synthetic React/i],
    ['AI classification', 'ai/sidepanel.html', /AI|分类/i],
    ['health checker', 'pages/checker/checker.html', /检查|Check|书签|Bookmark/i],
    ['graph', 'pages/graph/graph.html', /图谱|Graph/i],
  ];
  for (const [label, path, textPattern] of pages) {
    const page = await openExtensionPage(context, extensionId, path, pageErrors);
    await page.locator('body').filter({ hasText: textPattern }).waitFor({ timeout: 10000 });
    await assertNoHorizontalOverflow(page, label);
    if (label === 'graph') {
      await page.locator('#graphLoading').waitFor({ state: 'hidden', timeout: 10000 });
      assert.ok(await page.locator('#cy canvas').count() > 0, 'graph rendered no canvas');
    }
    await page.close();
  }

  const mdiSource = await settings.evaluate(async () => (await fetch('../standalone/mdi-manager.js')).text());
  assert.match(mdiSource, /sandbox/);
  assert.match(mdiSource, /iframeLoadTimeout/);
  assert.match(mdiSource, /mdi-window-fallback--visible/);
  assert.match(mdiSource, /chrome\.tabs\.create/);

  assert.deepEqual(pageErrors, [], `extension pages emitted errors:\n${pageErrors.join('\n')}`);
  console.log(`Extension E2E passed; screenshots: ${artifactsPath}`);
} finally {
  if (context) await context.close();
  await closeServer(mockServer);
  rmSync(profilePath, { recursive: true, force: true });
}
