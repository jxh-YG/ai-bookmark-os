import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const feedStoreSource = readFileSync('src/timeline/shared/feed-store.js', 'utf8');
const feedFetcherSource = readFileSync('src/timeline/background/feed-fetcher.js', 'utf8');

function createStorage(initial = {}) {
  const values = new Map(Object.entries(structuredClone(initial)));
  return {
    values,
    async get(keys) {
      if (keys == null) return Object.fromEntries(values);
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.filter((key) => values.has(key)).map((key) => [key, structuredClone(values.get(key))]));
    },
    async set(patch) {
      for (const [key, value] of Object.entries(patch)) values.set(key, structuredClone(value));
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) values.delete(key);
    },
  };
}

function createHarness(initial) {
  const storage = createStorage(initial);
  let active = 0;
  let maxActive = 0;
  const requestedUrls = [];
  const fetchMock = async (url) => {
    requestedUrls.push(String(url));
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 8));
    active -= 1;
    if (String(url).includes('/failed')) throw new Error('connection refused');
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => name === 'content-type' ? 'application/rss+xml' : null },
      text: async () => String(url),
    };
  };
  const context = {
    AbortController,
    Date,
    JSON,
    Map,
    Math,
    Promise,
    Set,
    URL,
    clearTimeout,
    console: { info() {}, warn() {} },
    fetch: fetchMock,
    setTimeout,
    structuredClone,
    chrome: {
      storage: { local: storage },
      runtime: { sendMessage: async () => undefined },
      alarms: { create: async () => undefined, clear: async () => true },
    },
    RssParser: {
      parseDate: () => Date.now(),
      stripTags: (value) => String(value || ''),
      parseFeed: (text) => ({
        title: text,
        siteUrl: '',
        items: [{ guid: `guid:${text}`, title: text, link: text, publishedAt: Date.now() }],
      }),
    },
  };
  context.self = context;
  vm.createContext(context);
  vm.runInContext(feedStoreSource, context);
  vm.runInContext(feedFetcherSource, context);
  return { context, storage, requestedUrls, getMaxActive: () => maxActive };
}

function makeFeed(id, patch = {}) {
  return {
    id,
    url: `https://feeds.example/${id}`,
    title: id,
    favicon: 'https://feeds.example/favicon.ico',
    failCount: 0,
    lastFetched: 0,
    autoBookmark: false,
    ...patch,
  };
}

const firstFeeds = [makeFeed('one'), makeFeed('two'), makeFeed('failed'), makeFeed('four'), makeFeed('five')];
const first = createHarness({ rss_feeds: firstFeeds });
const firstResult = await first.context.FeedFetcher.pollAll();
assert.deepEqual(JSON.parse(JSON.stringify(firstResult.summary)), {
  total: 5,
  succeeded: 4,
  failed: 1,
  skipped: 0,
  added: 4,
});
assert.ok(first.getMaxActive() > 1, 'polling should run feeds concurrently');
assert.ok(first.getMaxActive() <= 3, 'polling must use at most three workers');
assert.equal(first.requestedUrls.some((url) => url.includes('rss2json')), false, 'proxy must stay disabled by default');
assert.equal(first.storage.values.has('rss_poll_checkpoint'), false, 'completed polling should clear its checkpoint');

const now = Date.now();
const resumeFeeds = [
  makeFeed('resume-one'),
  makeFeed('resume-skip', { failCount: 3, lastFetched: now }),
  makeFeed('resume-two'),
];
await first.context.FeedStore.mutateStorage('rss_feeds', () => resumeFeeds);
await first.context.chrome.storage.local.set({
  rss_poll_checkpoint: {
    version: 1,
    startedAt: now,
    updatedAt: now,
    pendingFeedIds: resumeFeeds.map((feed) => feed.id),
    summary: { total: 2, succeeded: 1, failed: 1, skipped: 0, added: 3 },
  },
});
const resumed = await first.context.FeedFetcher.pollAll();
assert.deepEqual(JSON.parse(JSON.stringify(resumed.summary)), {
  total: 5,
  succeeded: 3,
  failed: 1,
  skipped: 1,
  added: 5,
});

const settingsSource = readFileSync('src/timeline/pages/settings/settings.js', 'utf8');
const i18nSource = readFileSync('src/timeline/shared/i18n.js', 'utf8');
assert.match(settingsSource, /confirm\(i18n\('rssProxyConsent'\)/);
assert.match(i18nSource, /rssProxyConsent:\s*"[^"]*subscription URLs[^"]*feed content[^"]*proxy/i);
assert.match(i18nSource, /rssProxyConsent:\s*"[^"]*订阅 URL[^"]*订阅内容[^"]*代理/);

console.log('RSS resilience regression checks passed');
