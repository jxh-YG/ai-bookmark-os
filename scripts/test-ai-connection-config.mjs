import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function importTypeScript(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}

const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const timerDelays = [];
globalThis.setTimeout = (callback, delay, ...args) => {
  timerDelays.push(Number(delay));
  return nativeSetTimeout(callback, Math.min(Number(delay) || 0, 2), ...args);
};
globalThis.clearTimeout = (timer) => nativeClearTimeout(timer);

try {
  const { chat, getAiRequestTimeoutMs, getAiRetryCount } = await importTypeScript('src/core/llm.ts');
  const settings = {
    provider: 'custom',
    customApiStyle: 'openai',
    customFullUrl: true,
    baseUrl: 'https://api.test/chat',
    apiKey: 'test-key',
    model: 'test-model',
    aiRetryCount: 2,
    aiRequestTimeoutSeconds: 37,
  };

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) return { status: 500, ok: false, text: async () => 'temporary' };
    return {
      status: 200,
      ok: true,
      text: async () => JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
    };
  };
  const retries = [];
  assert.equal(await chat(settings, [{ role: 'user', content: 'test' }], { onRetry: info => retries.push(info) }), 'OK');
  assert.equal(calls, 3, '配置 2 次重连时应执行首次请求加 2 次重连');
  assert.deepEqual(retries.map(item => [item.attempt, item.maxRetries, item.delayMs]), [
    [1, 2, 1500],
    [2, 2, 3000],
  ]);
  assert.equal(timerDelays.filter(delay => delay === 37000).length, 3, '每次连接尝试都应使用配置的单次超时');

  timerDelays.length = 0;
  calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { status: 500, ok: false, text: async () => 'temporary' };
  };
  await assert.rejects(
    () => chat({ ...settings, aiRetryCount: 6 }, [{ role: 'user', content: 'test' }]),
    /API 500/,
  );
  assert.equal(calls, 7, '配置 6 次重连时应严格执行首次请求加 6 次重连');
  assert.deepEqual(
    timerDelays.filter(delay => delay <= 30000),
    [1500, 3000, 6000, 12000, 24000, 30000],
    '指数退避应在 30 秒封顶，避免高重试配置产生数天等待',
  );

  timerDelays.length = 0;
  calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
  };
  await assert.rejects(
    () => chat({ ...settings, aiRetryCount: 0, aiRequestTimeoutSeconds: 7 }, [{ role: 'user', content: 'test' }]),
    /7 秒|timeout/i,
  );
  assert.equal(calls, 1, '配置 0 次重连时超时后不得再次连接');
  assert.ok(timerDelays.includes(7000), '超时计时器应使用配置的 7 秒');

  timerDelays.length = 0;
  calls = 0;
  globalThis.fetch = async (_url, options) => {
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
    () => chat({ ...settings, aiRetryCount: 0, aiRequestTimeoutSeconds: 9 }, [{ role: 'user', content: 'test' }]),
    /9 秒|timeout/i,
  );
  assert.equal(calls, 1, '响应头已返回但正文挂起时也必须受单次超时限制');
  assert.ok(timerDelays.includes(9000), '正文读取阶段必须继续使用配置的超时计时器');
  assert.equal(getAiRetryCount({ ...settings, aiRetryCount: 2.6 }), 3, '运行时归一化应与设置页显示一致');
  assert.equal(getAiRequestTimeoutMs({ ...settings, aiRequestTimeoutSeconds: 7.6 }), 8000);
} finally {
  globalThis.setTimeout = nativeSetTimeout;
  globalThis.clearTimeout = nativeClearTimeout;
}

console.log('AI connection config tests passed');
