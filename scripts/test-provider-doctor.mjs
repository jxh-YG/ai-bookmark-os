import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

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

const { diagnoseProvider } = await importTypeScript('src/core/llm.ts');

function baseSettings(extra = {}) {
  return {
    provider: 'custom',
    customApiStyle: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.example.test/v1',
    model: 'test-model',
    customFullUrl: false,
    aiRetryCount: 0,
    aiRequestTimeoutSeconds: 5,
    ...extra,
  };
}

// 无 chrome.runtime → chat() 回退直连；用 fetch mock 控制连通性
globalThis.chrome = undefined;

// 1) 缺失字段：应在第一环节失败并短路，不做网络请求
let fetchCalled = false;
globalThis.fetch = async () => { fetchCalled = true; throw new Error('should not fetch'); };
const missing = await diagnoseProvider(baseSettings({ apiKey: '', model: '' }));
assert.equal(missing[0].step, '配置完整性', '第一环节应为配置完整性');
assert.equal(missing[0].ok, false, '缺失字段应判为不通过');
assert.match(missing[0].detail, /API Key/, '应指出缺少 API Key');
assert.equal(missing.length, 1, '配置不完整应短路，不进行后续环节');
assert.equal(fetchCalled, false, '配置不完整不得发起网络请求');

// 2) 完整配置 + 连通成功
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  async text() { return JSON.stringify({ choices: [{ message: { content: 'OK' } }] }); },
});
const good = await diagnoseProvider(baseSettings());
assert.equal(good.length, 3, '完整配置应跑完三个环节');
assert.ok(good.every((r) => r.ok), '全部环节应通过');
assert.equal(good[2].step, '连通性', '第三环节应为连通性');
assert.match(good[2].detail, /连接成功/, '连通成功应有明确提示');

// 3) 完整配置 + 连通失败（401）
globalThis.fetch = async () => ({
  ok: false,
  status: 401,
  async text() { return JSON.stringify({ error: { message: 'invalid key' } }); },
});
const authFail = await diagnoseProvider(baseSettings());
assert.equal(authFail.length, 3, '前两环节通过后应到达连通性环节');
assert.equal(authFail[0].ok, true, '配置完整性应通过');
assert.equal(authFail[1].ok, true, '请求地址应通过');
assert.equal(authFail[2].ok, false, '401 连通性应判为失败');
assert.match(authFail[2].detail, /401/, '失败详情应含状态码');

console.log('provider doctor tests passed');
