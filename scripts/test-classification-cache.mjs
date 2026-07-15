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

function hashUrl(value) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function normalizeUrl(url) {
  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function contentContextV2Key(bookmark, respectExistingFolders = true) {
  const signature = [
    'content-context-v2',
    normalizeUrl(bookmark.url),
    normalizeText(bookmark.title),
    respectExistingFolders ? normalizeText(bookmark.folderPath) : '',
  ];
  return hashUrl(JSON.stringify(signature));
}

function createStorage(initial = {}) {
  const values = structuredClone(initial);
  return {
    values,
    local: {
      async get(keys) {
        if (keys === null) return structuredClone(values);
        const names = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(
          names.filter((name) => Object.prototype.hasOwnProperty.call(values, name))
            .map((name) => [name, structuredClone(values[name])]),
        );
      },
      async set(next) {
        Object.assign(values, structuredClone(next));
      },
      async remove(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
      },
    },
  };
}

const baseSettings = {
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
  respectExistingFolders: true,
  useClassificationCache: true,
  usePageMetadata: false,
  useBuiltInClassificationRules: false,
  aiRetryCount: 0,
  aiRequestTimeoutSeconds: 5,
};

const bookmark = {
  id: 'bookmark-1',
  title: '  React   Hooks Guide  ',
  url: 'https://example.test/react/hooks?utm_source=test#installation',
  folderPath: 'Bookmarks Bar/Development/React',
};

async function testEstimateUsesContentContextV2() {
  const storage = createStorage({
    labelCache: {
      [contentContextV2Key(bookmark)]: { summary: 'React hooks', tags: ['frontend'] },
    },
  });
  globalThis.chrome = { storage: { local: storage.local } };
  const { estimateClassify } = await importTypeScript('src/core/classifier.ts');

  const hit = await estimateClassify([bookmark], baseSettings);
  assert.equal(hit.cached, 1, '规范化 URL、标题和目录相同的输入应命中 v2 缓存');

  const renamed = await estimateClassify([{ ...bookmark, title: 'Vue Hooks Guide' }], baseSettings);
  assert.equal(renamed.cached, 0, '标题变化后不得复用旧标签');

  const moved = await estimateClassify([{ ...bookmark, folderPath: 'Bookmarks Bar/Work/React' }], baseSettings);
  assert.equal(moved.cached, 0, '尊重原目录时，目录变化后不得复用旧标签');
}

async function testEstimateIgnoresFolderWhenDisabledAndMissesV1() {
  const storage = createStorage({
    labelCache: {
      [contentContextV2Key(bookmark, false)]: { summary: 'React hooks', tags: ['frontend'] },
    },
  });
  globalThis.chrome = { storage: { local: storage.local } };
  const { estimateClassify } = await importTypeScript('src/core/classifier.ts');

  const moved = await estimateClassify(
    [{ ...bookmark, folderPath: 'Bookmarks Bar/Work/React' }],
    { ...baseSettings, respectExistingFolders: false },
  );
  assert.equal(moved.cached, 1, '不尊重原目录时，目录变化仍应复用同一输入缓存');

  storage.values.labelCache = {
    [hashUrl(`content-context-v1:${bookmark.url}`)]: { summary: 'old', tags: ['old'] },
  };
  const oldVersion = await estimateClassify([bookmark], baseSettings);
  assert.equal(oldVersion.cached, 0, '旧 v1 URL 缓存必须自然失效');
}

async function testLabelingUsesTheSameSignatureAsEstimate() {
  const storage = createStorage({
    labelCache: {
      [contentContextV2Key(bookmark)]: { summary: 'React hooks', tags: ['frontend'] },
    },
  });
  globalThis.chrome = {
    storage: { local: storage.local },
    permissions: { contains: async () => false },
  };

  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    if (request.max_tokens === 8192 && requests.length === 1) {
      throw new Error('标签缓存未命中：labelBookmarks 与 estimateClassify 未使用同一输入签名');
    }
    const content = request.max_tokens === 4096
      ? JSON.stringify([{ name: '前端' }])
      : JSON.stringify([{ id: bookmark.id, cat: 0 }]);
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => '',
    };
  };

  const { classify } = await importTypeScript('src/core/classifier.ts');
  const result = await classify(baseSettings, [bookmark], () => {}, new AbortController().signal);
  assert.deepEqual(result.labels[bookmark.id], {
    id: bookmark.id,
    summary: 'React hooks',
    tags: ['frontend'],
  });
  assert.equal(requests.length, 2, '缓存命中时仅应请求建树和分配两个 AI 阶段');
  assert.equal(requests[0].max_tokens, 4096, '首个 AI 请求必须是建树，而不是重新打标签');
}

await testEstimateUsesContentContextV2();
await testEstimateIgnoresFolderWhenDisabledAndMissesV1();
await testLabelingUsesTheSameSignatureAsEstimate();

console.log('classification cache regression checks passed');
