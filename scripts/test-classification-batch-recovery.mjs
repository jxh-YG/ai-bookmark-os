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

const { classify } = await importTypeScript('src/core/classifier.ts');

const storage = {};
function makeChrome() {
  return {
    storage: {
      local: {
        async get(keys) {
          if (keys === null) return structuredClone(storage);
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names.filter((n) => n in storage).map((n) => [n, structuredClone(storage[n])]));
        },
        async set(values) { Object.assign(storage, structuredClone(values)); },
        async remove(keys) { for (const k of Array.isArray(keys) ? keys : [keys]) delete storage[k]; },
      },
    },
    runtime: {
      async sendMessage(message) {
        if (message.action === 'labelCacheGet') return { success: true, cache: {} };
        if (message.action === 'labelCacheMerge') return { success: true, cache: {} };
        return { success: true };
      },
    },
    permissions: { async contains() { return false; } },
  };
}

const settings = {
  provider: 'custom',
  apiKey: 'test-key',
  baseUrl: 'https://api.example.test/v1',
  model: 'test-model',
  fontFamily: 'system',
  fontSize: 14,
  themeColor: '#0A84FF',
  language: 'zh',
  colorMode: 'light',
  customApiStyle: 'openai',
  customFullUrl: false,
  respectExistingFolders: false,
  useClassificationCache: false,
  usePageMetadata: false,
  allowPageContentForAi: false,
  useBuiltInClassificationRules: false,
  classifyPrompts: { label: 'L', buildTree: 'B', assign: 'A' },
  aiRetryCount: 0,
  aiRequestTimeoutSeconds: 5,
  labelBatchSize: 40,
  labelConcurrency: 1,
  assignBatchSize: 60,
};

function jsonResponse(payload) {
  const body = JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] });
  return { ok: true, status: 200, async json() { return JSON.parse(body); }, async text() { return body; } };
}

// 12 条书签，单批（labelBatchSize=40）。首次打标只返回前 10 条，
// 缺失的 2 条应通过“精准补偿”只重跑缺失项，而非整批 12 条重跑。
const bookmarks = Array.from({ length: 12 }, (_, i) => ({
  id: `bm-${i}`,
  title: `Bookmark ${i}`,
  url: `https://example.test/${i}`,
  folderPath: 'Inbox',
}));

let labelCallCount = 0;
const labelBatchSizes = [];

globalThis.chrome = makeChrome();
globalThis.fetch = async (_url, options) => {
  const body = JSON.parse(options.body);
  const userMsg = body.messages.find((m) => m.role === 'user')?.content ?? '';
  const ids = [...new Set([...userMsg.matchAll(/bm-\d+/g)].map((m) => m[0]))];
  // 按请求类型区分：打标/建树/分配的 user 消息前缀各不相同。
  // 注意建树请求也含书签样本行（带 bm- id），故必须先按前缀判定，不能只看是否含 bm-。
  if (userMsg.includes('分析以下书签')) {
    // 打标请求
    labelCallCount += 1;
    labelBatchSizes.push(ids.length);
    const returned = labelCallCount === 1 ? ids.slice(0, ids.length - 2) : ids;
    return jsonResponse(returned.map((id) => ({ id, summary: 's', tags: ['t'] })));
  }
  if (userMsg.includes('生成分类树')) {
    return jsonResponse([{ name: 'General' }]);
  }
  // 分配请求：把每条书签分到 cat 0
  if (userMsg.includes('分配以下书签')) {
    return jsonResponse(ids.map((id) => ({ id, cat: 0 })));
  }
  return jsonResponse([]);
};

const result = await classify(settings, bookmarks, () => {}, new AbortController().signal, { mode: 'full' }, { persist: false });

assert.ok(labelCallCount >= 2, `缺失项必须触发至少一次补偿重试，实际打标请求 ${labelCallCount} 次`);
// 第二次打标请求应只含缺失的 2 条（精准补偿），而非整批 12 条
assert.ok(labelBatchSizes[1] <= 2, `补偿批次应只含缺失项，实际 ${labelBatchSizes[1]} 条`);
assert.equal(Object.keys(result.labels).length, 12, '最终 12 条书签都必须有标签');

console.log('classification batch recovery tests passed');
