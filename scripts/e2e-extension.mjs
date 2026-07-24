import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const extensionSourcePath = resolve('dist');
const extensionTempPath = mkdtempSync(join(tmpdir(), 'ai-bookmark-os-e2e-extension-'));
const extensionPath = join(extensionTempPath, 'extension');

function copyDirectory(source, destination) {
  mkdirSync(destination, { recursive: true });
  for (const name of readdirSync(source)) {
    const sourcePath = join(source, name);
    const destinationPath = join(destination, name);
    if (statSync(sourcePath).isDirectory()) copyDirectory(sourcePath, destinationPath);
    else copyFileSync(sourcePath, destinationPath);
  }
}

copyDirectory(extensionSourcePath, extensionPath);
const e2eManifestPath = join(extensionPath, 'manifest.json');
const e2eManifest = JSON.parse(readFileSync(e2eManifestPath, 'utf8'));
e2eManifest.host_permissions = Array.from(new Set([
  ...(e2eManifest.host_permissions || []),
  '<all_urls>',
]));
e2eManifest.optional_host_permissions = (e2eManifest.optional_host_permissions || [])
  .filter((origin) => origin !== '<all_urls>');
writeFileSync(e2eManifestPath, JSON.stringify(e2eManifest, null, 2));
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

const requests = { ai: 0, rss: 0, checker: 0 };
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
  if (request.url === '/health-check') {
    requests.checker += 1;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(request.method === 'HEAD' ? '' : '<title>Available bookmark</title><main>Healthy fixture</main>');
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
    await chrome.bookmarks.create({ parentId: folder.id, title: 'Synthetic Healthy Link', url: `http://127.0.0.1:${fixturePort}/health-check` });
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
    const taggedBookmarkIndex = bookmarks.findIndex((bookmark) => bookmark.title === 'Synthetic React');
    if (taggedBookmarkIndex < 0) throw new Error('synthetic tag fixture was not mirrored');
    bookmarks[taggedBookmarkIndex] = {
      ...bookmarks[taggedBookmarkIndex],
      tags: ['E2E Unified Tag'],
      tagsAuto: ['E2E Unified Tag'],
      contentText: 'private cached body',
      contentExcerpt: 'private summary',
      contentHeadings: ['Private heading'],
    };
    const now = Date.now();
    await chrome.storage.local.set({
      bookmark_timeline_data: bookmarks,
      tag_colors: { 'E2E Unified Tag': '#123456' },
      classificationWorkspace: {
        version: 1,
        comparisons: [{
          id: 'e2e-change-history',
          scope: { mode: 'full' },
          createdAt: now,
          beforeFingerprint: 'before-e2e',
          afterFingerprint: 'after-e2e',
          summary: { added: 0, removed: 1, moved: 2, renamed: 1, reordered: 0, urlChanged: 0 },
          changes: [
            {
              kind: 'moved', id: 'history-react', nodeKind: 'bookmark',
              before: { id: 'history-react', kind: 'bookmark', index: 0, title: 'Synthetic React' },
              after: { id: 'history-react', kind: 'bookmark', index: 0, title: 'Synthetic React' },
              beforePath: 'Bookmarks Bar / Inbox / Synthetic React',
              afterPath: 'Bookmarks Bar / AI Organize / Development / Synthetic React',
            },
            {
              kind: 'moved', id: 'history-design', nodeKind: 'bookmark',
              before: { id: 'history-design', kind: 'bookmark', index: 1, title: 'Synthetic Design' },
              after: { id: 'history-design', kind: 'bookmark', index: 0, title: 'Synthetic Design' },
              beforePath: 'Bookmarks Bar / Inbox / Synthetic Design',
              afterPath: 'Bookmarks Bar / AI Organize / Design / Synthetic Design',
            },
            {
              kind: 'removed', id: 'history-old', nodeKind: 'bookmark',
              before: { id: 'history-old', kind: 'bookmark', index: 2, title: 'Old bookmark' },
              beforePath: 'Bookmarks Bar / Inbox / Old bookmark',
            },
            {
              kind: 'renamed', id: 'history-folder', nodeKind: 'folder',
              before: { id: 'history-folder', kind: 'folder', index: 0, title: 'Old category' },
              after: { id: 'history-folder', kind: 'folder', index: 0, title: 'New category' },
              beforePath: 'Bookmarks Bar / AI Organize / Old category',
              afterPath: 'Bookmarks Bar / AI Organize / New category',
            },
          ],
        }],
      },
      bookmark_recommendation_store_v2: {
        version: 2,
        migratedAt: now,
        rules: [],
        stopWords: [],
        snapshots: [],
        reviewQueue: [],
        feedback: [
          {
            id: 'feedback-e2e-rejected',
            operationId: 'feedback-e2e-rejected',
            recommendationId: 'recommendation-e2e-rejected',
            urlFingerprint: 'fingerprint-rejected',
            outcome: 'rejected',
            changedFields: [],
            selection: { folderPath: '', tags: [] },
            snapshot: { domain: 'rejected.example' },
            createdAt: now - 1000,
          },
          {
            id: 'feedback-e2e-cancelled',
            operationId: 'feedback-e2e-cancelled',
            recommendationId: 'recommendation-e2e-cancelled',
            urlFingerprint: 'fingerprint-cancelled',
            outcome: 'cancelled',
            changedFields: [],
            selection: { folderPath: '', tags: [] },
            snapshot: { domain: 'cancelled.example' },
            createdAt: now,
          },
        ],
        stats: { total: 2, accepted: 0, modified: 0, rejected: 1, cancelled: 1, lastFeedbackAt: now },
        history: [],
      },
    });
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
    return state.ai_classifier_config?.allowPageContentForAi === false
      && state.ai_tag_cache === undefined
      && state.page_content_cache?.['https://example.test/react']?.textContent === 'private cached body';
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
  await settings.locator('#viewLearningRecordsBtn').click();
  assert.equal(await settings.locator('#learningFeedbackList .learning-feedback-item').count(), 2);
  const learningFeedbackText = await settings.locator('#learningFeedbackList').innerText();
  assert.match(learningFeedbackText, /rejected\.example[\s\S]*(拒绝|Rejected)/i);
  assert.match(learningFeedbackText, /cancelled\.example[\s\S]*(取消|Cancelled)/i);
  assert.doesNotMatch(learningFeedbackText, /https?:\/\//i, 'learning feedback details must not expose original URLs');
  await settings.locator('#reevaluateBookmarksBtn').click();
  await settings.locator('#reevaluationResults').filter({ hasText: /评估完成|Evaluation complete/i }).waitFor({ timeout: 15000 });
  await settings.locator('.review-item--recommendation').first().waitFor({ state: 'visible', timeout: 10000 });
  assert.equal(await settings.locator('#reevaluationResults .reevaluation-select input').count(), 0, 'medium-confidence reevaluation items must not be preselected');
  const recommendationCandidates = await settings.locator('.review-item--recommendation [aria-label="标签候选"]').allInnerTexts();
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
    if (label === 'bookmark navigation') {
      await worker.evaluate(async () => {
        const state = await chrome.storage.local.get('bookmark_timeline_data');
        const bookmarks = state.bookmark_timeline_data || [];
        const bookmark = bookmarks.find((item) => item.title === 'Synthetic React');
        if (!bookmark) throw new Error('unified tag fixture was not found');
        bookmark.tags = ['E2E Unified Tag'];
        bookmark.tagsAuto = ['E2E Unified Tag'];
        await chrome.storage.local.set({
          bookmark_timeline_data: bookmarks,
          tag_colors: { 'E2E Unified Tag': '#123456' },
        });
      });
    }
    if (label === 'health checker') {
      await worker.evaluate(async () => {
        const state = await chrome.storage.local.get('bookmark_timeline_data');
        const healthyBookmark = (state.bookmark_timeline_data || [])
          .find((bookmark) => bookmark.title === 'Synthetic Healthy Link');
        if (!healthyBookmark) throw new Error('healthy checker fixture was not found');
        await chrome.storage.local.set({
          bookmark_timeline_data: [healthyBookmark],
          checkerTimeout: 4000,
          checkerConcurrency: 1,
          checkerRetries: 0,
          checkerBackoffBase: 0,
          checkerBackoffMax: 0,
        });
      });
    }
    let page;
    if (label === 'graph') {
      const popup = await openExtensionPage(context, extensionId, 'pages/popup/popup.html', pageErrors);
      await popup.locator('#footerMenuBtn').click();
      const graphPagePromise = context.waitForEvent('page');
      await popup.locator('#menuGraphBtn').click();
      page = await graphPagePromise;
      page.on('pageerror', (error) => pageErrors.push(`${path}: ${error.message}`));
      await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0);
    } else {
      page = await openExtensionPage(context, extensionId, path, pageErrors);
    }
    await page.locator('body').filter({ hasText: textPattern }).waitFor({ timeout: 10000 });
    await assertNoHorizontalOverflow(page, label);
    if (label === 'graph') {
      await page.locator('#graphLoading').waitFor({ state: 'hidden', timeout: 10000 });
      const graphCanvas = page.locator('#cy canvas').first();
      await graphCanvas.waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(1000);
      const zoomBefore = Number.parseFloat(await page.locator('#zoomLevel').innerText());
      const graphBox = await graphCanvas.boundingBox();
      assert.ok(graphBox, 'graph canvas has no interactive bounds');
      await page.mouse.move(graphBox.x + graphBox.width / 2, graphBox.y + graphBox.height / 2);
      for (let index = 0; index < 20; index += 1) {
        await page.mouse.wheel(0, -100);
      }
      await page.waitForFunction(
        (previousZoom) => Number.parseFloat(document.querySelector('#zoomLevel')?.textContent || '') > previousZoom,
        zoomBefore,
      );
      const zoomAfter = Number.parseFloat(await page.locator('#zoomLevel').innerText());
      const wheelZoomRatio = zoomAfter / zoomBefore;
      assert.ok(
        wheelZoomRatio >= 1.25 && wheelZoomRatio <= 1.8,
        `graph wheel zoom must be responsive without jumping: ${zoomBefore}% -> ${zoomAfter}%`,
      );
    }
    if (label === 'health checker') {
      const checkerRequestsBefore = requests.checker;
      await page.locator('#startCheckBtn').click();
      await page.waitForFunction(() => {
        const match = /^(\d+)\/(\d+)/.exec(document.querySelector('#progressText')?.textContent || '');
        return match && Number(match[2]) > 0 && Number(match[1]) === Number(match[2]);
      }, undefined, { timeout: 30000 });
      assert.ok(requests.checker > checkerRequestsBefore, 'link checker did not request the bookmarked URL');
      assert.ok(await page.locator('.result-item--ok').count() >= 1, 'reachable bookmark was not classified as reachable');
      const resultDetails = await page.locator('.result-status-text').allInnerTexts();
      assert.doesNotMatch(resultDetails.join('\n'), /检测响应无效|Invalid check response/i);
    }
    if (label === 'bookmark navigation') {
      const unifiedTag = page.locator('.bookmark-card__tag', { hasText: 'E2E Unified Tag' });
      await unifiedTag.waitFor({ timeout: 10000 });
      assert.equal(await unifiedTag.evaluate((element) => getComputedStyle(element).color), 'rgb(18, 52, 86)');
      await worker.evaluate(async () => {
        const state = await chrome.storage.local.get('bookmark_timeline_data');
        const bookmarks = state.bookmark_timeline_data || [];
        const bookmark = bookmarks.find((item) => item.tags?.includes('E2E Unified Tag'));
        if (!bookmark) throw new Error('unified tag fixture was not found');
        bookmark.tags = ['E2E Synced Tag'];
        bookmark.tagsAuto = ['E2E Synced Tag'];
        await chrome.storage.local.set({
          bookmark_timeline_data: bookmarks,
          tag_colors: { 'E2E Synced Tag': '#654321' },
        });
      });
      const syncedTag = page.locator('.bookmark-card__tag', { hasText: 'E2E Synced Tag' });
      await syncedTag.waitFor({ timeout: 10000 });
      assert.equal(await syncedTag.evaluate((element) => getComputedStyle(element).color), 'rgb(101, 67, 33)');
      assert.equal(await page.getByText('E2E Unified Tag', { exact: true }).count(), 0, 'bookmark navigation did not refresh its shared tags');
    }
    if (label === 'AI classification') {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('.workspace-tabs [role="tab"]').nth(2).click();
      await page.locator('.comparison-record > summary').click();
      const historyTree = page.locator('.change-history-tree');
      await historyTree.waitFor({ state: 'visible', timeout: 10000 });
      assert.equal(await historyTree.locator('.change-history-tree__branch').count() > 0, true, 'change history did not render a folder tree');
      await historyTree.getByText('Development', { exact: true }).click();
      assert.match(await historyTree.innerText(), /Synthetic React[\s\S]*来自 Bookmarks Bar \/ Inbox/, 'change history lost the compact move origin');
      await page.screenshot({ path: join(artifactsPath, 'classification-history-desktop.png'), fullPage: true });
      await assertNoHorizontalOverflow(page, 'classification history desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: join(artifactsPath, 'classification-history-narrow.png'), fullPage: true });
      await assertNoHorizontalOverflow(page, 'classification history narrow');
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
  rmSync(extensionTempPath, { recursive: true, force: true });
}
