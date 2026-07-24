import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/timeline/pages/settings/settings.js', 'utf8');
const start = source.indexOf('function treeTestRetryDelayMs(');
const end = source.indexOf('async function testTreeConnection(', start);
assert.ok(start >= 0 && end > start, 'tree connection retry helpers should be present');

const timerDelays = [];
let proxyFetchImpl = async () => { throw new Error('proxy mock not configured'); };
const proxyRequests = [];
const context = {
  Error,
  Math,
  Number,
  Promise,
  String,
  TypeError,
  DEFAULT_TREE_SETTINGS: { aiRetryCount: 5, aiRequestTimeoutSeconds: 90 },
  clampTreeNumber(value, fallback, min, max) {
    const number = Number(value);
    return Math.min(max, Math.max(min, Math.round(Number.isFinite(number) ? number : fallback)));
  },
  chrome: {
    runtime: {
      sendMessage: (message) => {
        proxyRequests.push(message);
        return proxyFetchImpl(message);
      },
    },
  },
  setTimeout(callback, delay, ...args) {
    timerDelays.push(Number(delay));
    return setTimeout(callback, Math.min(Number(delay) || 0, 2), ...args);
  },
};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}; this.helpers = { fetchTreeTestWithRetry };`, context);

const { fetchTreeTestWithRetry } = context.helpers;
const req = { url: 'https://api.test/chat', headers: {}, body: { message: 'OK' } };

let calls = 0;
proxyFetchImpl = async () => {
  calls += 1;
  if (calls < 3) return { success: true, status: 500, ok: false, text: 'temporary' };
  return { success: true, status: 200, ok: true, text: 'OK' };
};
const retries = [];
const result = await fetchTreeTestWithRetry(
  req,
  { aiRetryCount: 2, aiRequestTimeoutSeconds: 37 },
  info => retries.push(info),
);
assert.equal(result.text, 'OK');
assert.equal(calls, 3, '测试连接配置 2 次重连时应执行首次请求加 2 次重连');
assert.deepEqual(retries.map(item => [item.attempt, item.maxRetries, item.delayMs]), [
  [1, 2, 1500],
  [2, 2, 3000],
]);
assert.equal(proxyRequests.length, 3);
assert.ok(proxyRequests.every((message) => (
  message.action === 'aiProxyFetch'
  && message.request.timeoutMs === 37000
  && message.request.url === req.url
  && message.request.body === JSON.stringify(req.body)
)), '测试连接必须通过 SW 代理，并传递每次尝试的超时设置');

calls = 0;
proxyFetchImpl = async () => {
  calls += 1;
  return { success: true, status: 401, ok: false, text: 'unauthorized' };
};
const unauthorized = await fetchTreeTestWithRetry(req, { aiRetryCount: 5, aiRequestTimeoutSeconds: 12 });
assert.equal(unauthorized.status, 401);
assert.equal(calls, 1, '不可恢复的 4xx 错误不得重连');

timerDelays.length = 0;
calls = 0;
proxyFetchImpl = async () => {
  calls += 1;
  return { success: false, error: 'API 请求超时（7 秒）' };
};
await assert.rejects(
  () => fetchTreeTestWithRetry(req, { aiRetryCount: 0, aiRequestTimeoutSeconds: 7 }),
  /7 秒|timeout/i,
);
assert.equal(calls, 1);
assert.equal(proxyRequests.at(-1).request.timeoutMs, 7000, '测试连接应把单次超时交给 SW 代理执行');

console.log('tree connection retry tests passed');
