import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sharedRouterSource = fs.readFileSync('src/timeline/shared/page-router.js', 'utf8');

function loadSharedRouter({ direct = 'success', bridgeResponse = { ok: false } } = {}) {
  const calls = [];
  const chrome = {
    runtime: {
      getURL: (path = '') => `chrome-extension://test/${path}`,
      sendMessage: async (message) => {
        calls.push(['sendMessage', message]);
        return bridgeResponse;
      },
    },
    windows: {
      getCurrent: async () => {
        calls.push(['getCurrent']);
        return { id: 7 };
      },
      update: async () => {},
    },
    tabs: {
      query: async () => {
        calls.push(['queryTabs']);
        return [];
      },
      create: async (options) => {
        calls.push(['createTab', options]);
        return { id: 8, ...options };
      },
      update: async () => {},
    },
  };
  if (direct !== 'unavailable') {
    chrome.sidePanel = {
      setOptions: async (options) => {
        calls.push(['setOptions', options]);
        if (direct === 'fail') throw new Error('side panel unavailable');
      },
      open: async (options) => {
        calls.push(['openSidePanel', options]);
      },
    };
  }

  const context = {
    chrome,
    window: { location: { href: '' } },
    console: { warn: () => {} },
  };
  vm.runInNewContext(sharedRouterSource, context, { filename: 'page-router.js' });
  return { calls, router: context.window.AIBookmarkPageRouter };
}

async function testSharedRouterUsesTheSameFallbackChain() {
  const direct = loadSharedRouter();
  assert.equal(await direct.router.openAiClassificationPanel(), 'side-panel');
  assert.deepEqual(JSON.parse(JSON.stringify(direct.calls)), [
    ['setOptions', { path: 'ai/sidepanel.html', enabled: true }],
    ['getCurrent'],
    ['openSidePanel', { windowId: 7 }],
  ]);

  const bridged = loadSharedRouter({ direct: 'fail', bridgeResponse: { ok: true } });
  assert.equal(await bridged.router.openAiClassificationPanel(), 'side-panel');
  assert.equal(bridged.calls.some(([name]) => name === 'sendMessage'), true);
  assert.equal(bridged.calls.some(([name]) => name === 'createTab'), false);

  const fallback = loadSharedRouter({ direct: 'unavailable', bridgeResponse: { ok: false } });
  assert.equal(await fallback.router.openAiClassificationPanel(), 'tab');
  assert.deepEqual(JSON.parse(JSON.stringify(fallback.calls.at(-1))), [
    'createTab',
    { url: 'chrome-extension://test/ai/sidepanel.html' },
  ]);
}

function testEveryMenuDelegatesToTheSharedOpener() {
  const coreRouter = fs.readFileSync('src/core/pageRouter.ts', 'utf8');
  const bookmarkNav = fs.readFileSync('src/bookmark-nav/BookmarkNavPage.tsx', 'utf8');
  const bridge = fs.readFileSync('src/bridge/ai-sw-bridge.js', 'utf8');
  const launcher = fs.readFileSync('scripts/package-extension.mjs', 'utf8');

  assert.match(coreRouter, /export async function openAiClassificationPanel/);
  assert.match(coreRouter, /response\?\.ok/);
  assert.match(bookmarkNav, /void openAiClassificationPanel\(\)/);
  assert.doesNotMatch(bookmarkNav, /openExtensionPage\('ai\/sidepanel\.html'\)/);
  assert.match(launcher, /launchAiClassifyBtn/);
  assert.match(launcher, /router\?\.openAiClassificationPanel\?\.\(\)/);
  const shortcutStart = bridge.indexOf("command === 'open-ai-sidepanel'");
  const shortcutEnd = bridge.indexOf('\n      }', shortcutStart);
  assert.ok(shortcutStart >= 0 && shortcutEnd > shortcutStart, '必须能定位 AI 分类快捷键入口');
  assert.match(bridge.slice(shortcutStart, shortcutEnd), /openFallback[\s\S]*chrome\.tabs\.create/,
    'AI 分类快捷键在侧边栏不可用时必须回退到分类页面');

  for (const page of [
    'src/timeline/pages/standalone/standalone.js',
    'src/timeline/pages/popup/popup.js',
    'src/timeline/pages/settings/settings.js',
    'src/timeline/pages/checker/checker.js',
    'src/timeline/pages/graph/graph.js',
  ]) {
    const source = fs.readFileSync(page, 'utf8');
    assert.match(source, /router\?\.openAiClassificationPanel/,
      `${page} 必须委托共享 AI 分类打开器`);
  }
}

await testSharedRouterUsesTheSameFallbackChain();
testEveryMenuDelegatesToTheSharedOpener();

console.log('AI classification entry routing checks passed');
