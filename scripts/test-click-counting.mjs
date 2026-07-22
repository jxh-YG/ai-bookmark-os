import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const backgroundSource = readFileSync('src/timeline/background/background.js', 'utf8');
const popupSource = readFileSync('src/timeline/pages/popup/popup.js', 'utf8');
const standaloneSource = readFileSync('src/timeline/pages/standalone/standalone.js', 'utf8');
const start = backgroundSource.indexOf('async function enrichClickCounts(');
const end = backgroundSource.indexOf('// ===== RSS 文章', start);
assert.ok(start >= 0 && end > start, 'click count helpers should be present');

let storedBookmarks = [];
let visitsByUrl = new Map();
let historyCalls = 0;
let releaseHistory = null;
const context = {
  Array,
  Map,
  Math,
  Number,
  Object,
  Promise,
  chrome: {
    history: {
      async getVisits({ url }) {
        historyCalls += 1;
        if (releaseHistory) await new Promise(resolve => { releaseHistory = resolve; });
        return visitsByUrl.get(url) || [];
      },
    },
  },
  getStoredBookmarks: async () => storedBookmarks,
  mutateStoredBookmarks: async (mutator) => {
    storedBookmarks = await mutator(storedBookmarks);
    return storedBookmarks;
  },
  runWithConcurrency: async (items, _limit, worker) => Promise.all(items.map(worker)),
};
vm.createContext(context);
vm.runInContext(`${backgroundSource.slice(start, end)}; this.helpers = {
  enrichClickCounts,
  applyClickCountUpdates,
  refreshStoredClickCounts
};`, context);

const { enrichClickCounts, applyClickCountUpdates, refreshStoredClickCounts } = context.helpers;
visitsByUrl = new Map([
  ['https://example.test/a', [{ visitTime: 100 }, { visitTime: 200 }]],
  ['https://example.test/b', []],
]);
const sourceBookmarks = [
  { id: 'a', url: 'https://example.test/a', clickCount: 99, lastClickedAt: 999 },
  { id: 'b', url: 'https://example.test/b', clickCount: 0, lastClickedAt: 500 },
];
const updates = await enrichClickCounts(sourceBookmarks, 2);
assert.deepEqual(Array.from(updates, item => ({ ...item })), [
  { id: 'a', url: 'https://example.test/a', clickCount: 2, lastClickedAt: 200 },
  { id: 'b', url: 'https://example.test/b', clickCount: 0, lastClickedAt: null },
]);
applyClickCountUpdates(sourceBookmarks, updates);
assert.equal(sourceBookmarks[0].clickCount, 2, '刷新必须使用 History 绝对值，不能在旧值上累加');
assert.equal(sourceBookmarks[0].lastClickedAt, 200);
assert.equal(sourceBookmarks[1].lastClickedAt, null);

storedBookmarks = [{ id: 'a', url: 'https://example.test/a', clickCount: 0, lastClickedAt: null }];
historyCalls = 0;
releaseHistory = true;
const firstRefresh = refreshStoredClickCounts();
const secondRefresh = refreshStoredClickCounts();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(historyCalls, 1, '弹窗与独立工作台并发刷新时后台只能遍历一次 History');
releaseHistory();
await Promise.all([firstRefresh, secondRefresh]);
releaseHistory = null;
assert.equal(storedBookmarks[0].clickCount, 2);

const recordClickStart = backgroundSource.indexOf("case 'recordClick':");
const recordClickEnd = backgroundSource.indexOf("case 'refreshClickCounts':", recordClickStart);
const recordClickBlock = backgroundSource.slice(recordClickStart, recordClickEnd);
assert.match(recordClickBlock, /deprecated: true/);
assert.doesNotMatch(recordClickBlock, /clickCount|mutateStoredBookmarks|\+\s*1/, '兼容 recordClick 接口不得再累加');
assert.doesNotMatch(popupSource, /recordClick/);
assert.doesNotMatch(standaloneSource, /recordClick/);

const tabUpdatedListeners = backgroundSource.match(/chrome\.tabs\.onUpdated\.addListener/g) || [];
assert.equal(tabUpdatedListeners.length, 1, '全局导航监听不得再维护点击计数');
const renderedFetchStart = backgroundSource.indexOf('async function fetchRenderedPageContent(');
const renderedFetchEnd = backgroundSource.indexOf('async function fetchBookmarkContent(', renderedFetchStart);
assert.match(backgroundSource.slice(renderedFetchStart, renderedFetchEnd), /chrome\.tabs\.onUpdated\.addListener/, '保留的监听只能用于显式渲染抓取');

const historyListenerStart = backgroundSource.indexOf('chrome.history.onVisited.addListener');
const historyListenerEnd = backgroundSource.indexOf('chrome.runtime.onStartup.addListener', historyListenerStart);
const historyListener = backgroundSource.slice(historyListenerStart, historyListenerEnd);
assert.match(historyListener, /historyItem\.visitCount/);
assert.match(historyListener, /historyItem\.lastVisitTime/);
assert.doesNotMatch(historyListener, /clickCount\s*\+|\+\s*1/, 'History 监听必须回写绝对值');

const syncStart = backgroundSource.indexOf('async function syncAllBookmarksOnce()');
const syncEnd = backgroundSource.indexOf('let syncAllInFlight', syncStart);
const syncSource = backgroundSource.slice(syncStart, syncEnd);
assert.match(syncSource, /const clickCountUpdates = await enrichClickCounts\(merged, 10\)/);
assert.match(syncSource, /applyClickCountUpdates\(merged, clickCountUpdates\)/, '全量同步必须真正应用 History 结果');

console.log('click counting tests passed');
