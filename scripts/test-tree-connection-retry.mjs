import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/timeline/pages/settings/settings.js', 'utf8');
const start = source.indexOf('function treeTestRetryDelayMs(');
const end = source.indexOf('async function testTreeConnection(', start);
assert.ok(start >= 0 && end > start, 'tree connection retry helpers should be present');

const timerDelays = [];
let fetchImpl = async () => { throw new Error('fetch mock not configured'); };
const context = {
  AbortController,
  DOMException,
  Error,
  JSON,
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
  clearTimeout,
  fetch: (...args) => fetchImpl(...args),
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
fetchImpl = async () => {
  calls += 1;
  if (calls < 3) return { status: 500, ok: false, text: async () => 'temporary' };
  return { status: 200, ok: true, text: async () => 'OK' };
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
assert.equal(timerDelays.filter(delay => delay === 37000).length, 3, '测试连接每次尝试都应使用配置超时');

calls = 0;
fetchImpl = async () => {
  calls += 1;
  return { status: 401, ok: false, text: async () => 'unauthorized' };
};
const unauthorized = await fetchTreeTestWithRetry(req, { aiRetryCount: 5, aiRequestTimeoutSeconds: 12 });
assert.equal(unauthorized.response.status, 401);
assert.equal(calls, 1, '不可恢复的 4xx 错误不得重连');

timerDelays.length = 0;
calls = 0;
fetchImpl = async (_url, options) => {
  calls += 1;
  return {
    status: 200,
    ok: true,
    text: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('body aborted', 'AbortError')), { once: true });
    }),
  };
};
await assert.rejects(
  () => fetchTreeTestWithRetry(req, { aiRetryCount: 0, aiRequestTimeoutSeconds: 7 }),
  /7 秒|timeout/i,
);
assert.equal(calls, 1);
assert.ok(timerDelays.includes(7000), '测试连接读取响应正文时仍应受配置超时限制');

console.log('tree connection retry tests passed');
