import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/timeline/background/background.js', 'utf8');
const start = source.indexOf('const MAX_FOLDER_MATCH_SAMPLES = 10;');
const end = source.indexOf('function tokenizeFolderEvidence(', start);
assert.ok(start >= 0 && end > start, 'folder content backfill helpers should be present');

let cache = {};
let queue = [];
let storedBookmarks = [];
let alarmCalls = [];
let concurrencyLimits = [];
let staticFetches = [];

const context = {
  Array,
  Date,
  Map,
  Math,
  Number,
  Object,
  Promise,
  Set,
  String,
  chrome: {
    alarms: {
      create(name, options) {
        alarmCalls.push({ name, options });
      },
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: queue };
        },
      },
    },
  },
  fetchStaticPageContent: async (url) => {
    staticFetches.push(url);
    return {
      status: 'success',
      textContent: `Static content for ${url}`.padEnd(100, '.'),
      title: `Title ${url}`,
      excerpt: `Excerpt ${url}`,
      metaDesc: 'Static description',
      metaKeywords: ['static'],
      headings: ['Static heading'],
      structuredTypes: ['Article'],
      fetchedAt: Date.now(),
      source: 'static',
    };
  },
  getPageContentCache: async () => cache,
  isContentUrl: url => /^https?:\/\//.test(String(url || '')),
  mutateStorageResource: async (_key, mutator) => {
    queue = await mutator(queue);
    return queue;
  },
  mutateStoredBookmarks: async (mutator) => {
    storedBookmarks = await mutator(storedBookmarks);
    return storedBookmarks;
  },
  normalizeBookmarkFolderPath: value => String(value || '').split('/').map(part => part.trim()).filter(Boolean).join('/'),
  runWithConcurrency: async (items, limit, worker) => {
    concurrencyLimits.push(limit);
    return Promise.all(items.map(worker));
  },
};

vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}; this.helpers = {
  sampleFolderBookmarks,
  hasStoredPageContent,
  hydrateFolderSamplesFromContentCache,
  enqueueFolderSampleContentBackfill,
  processFolderSampleContentBackfill
};`, context);

const {
  hydrateFolderSamplesFromContentCache,
  enqueueFolderSampleContentBackfill,
  processFolderSampleContentBackfill,
} = context.helpers;

cache = {
  'https://cached.test': {
    status: 'success',
    textContent: 'Cached body '.repeat(10),
    title: 'Cached title',
    excerpt: 'Cached excerpt',
    fetchedAt: Date.now(),
    source: 'static',
  },
};
const hydrated = await hydrateFolderSamplesFromContentCache([
  { id: 'cached', url: 'https://cached.test', folderPath: 'Docs' },
  { id: 'uncached', url: 'https://uncached.test', folderPath: 'Docs' },
]);
assert.match(hydrated[0].contentText, /Cached body/);
assert.equal(hydrated[0].contentSource, 'static');
assert.equal(hydrated[1].contentText, undefined);

cache = {};
queue = [];
alarmCalls = [];
const missing = Array.from({ length: 14 }, (_, index) => ({
  id: `missing-${index}`,
  url: `https://missing-${index}.test`,
  folderPath: index < 3 ? 'Preferred' : 'Other',
}));
const queuedCount = await enqueueFolderSampleContentBackfill(missing, ['Preferred']);
assert.equal(queuedCount, 10, '每次推荐全局最多补齐 10 条');
assert.equal(queue.length, 10);
assert.deepEqual(Array.from(queue.slice(0, 3), item => item.id), ['missing-0', 'missing-1', 'missing-2']);
assert.equal(alarmCalls.at(-1)?.name, 'folder-content-backfill');

storedBookmarks = missing.map(item => ({ ...item }));
concurrencyLimits = [];
staticFetches = [];
await processFolderSampleContentBackfill();
assert.deepEqual(concurrencyLimits, [2], '渐进补齐并发数必须固定为 2');
assert.equal(staticFetches.length, 10);
assert.equal(queue.length, 0);
assert.equal(storedBookmarks.filter(item => item.contentStatus === 'success').length, 10);
assert.ok(storedBookmarks.filter(item => item.contentStatus === 'success').every(item => item.contentSource === 'static'));

const now = Date.now();
cache = {
  'https://recent-failure.test': { status: 'failed', fetchedAt: now - 60 * 60 * 1000 },
  'https://old-failure.test': { status: 'failed', fetchedAt: now - 25 * 60 * 60 * 1000 },
};
queue = [];
const cooldownCount = await enqueueFolderSampleContentBackfill([
  { id: 'recent', url: 'https://recent-failure.test', folderPath: 'Docs', contentStatus: 'failed', contentFetchedAt: now - 60 * 60 * 1000 },
  { id: 'old', url: 'https://old-failure.test', folderPath: 'Docs', contentStatus: 'failed', contentFetchedAt: now - 25 * 60 * 60 * 1000 },
]);
assert.equal(cooldownCount, 1, '最近 24 小时失败过的 URL 不得重复请求');
assert.equal(queue[0]?.id, 'old');

const backfillSource = source.slice(
  source.indexOf('async function processFolderSampleContentBackfill()'),
  source.indexOf('function tokenizeFolderEvidence(', start),
);
assert.match(backfillSource, /fetchStaticPageContent/);
assert.doesNotMatch(backfillSource, /chrome\.tabs\.create|fetchRenderedPageContent/, '自动补齐不得创建隐藏标签页');

console.log('folder content backfill tests passed');
