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

function contentContextV5Key(bookmark, settings) {
  const includeFolderPath = settings.respectExistingFolders !== false;
  const folderRulesVersion = `${includeFolderPath ? 'folders-v2' : 'folders-off'}:${settings.useBuiltInClassificationRules !== false ? 'builtin-v1' : 'builtin-off'}`;
  const promptVersion = hashUrl(JSON.stringify({
    label: settings.classifyPrompts?.label ?? '',
    provider: settings.provider ?? '',
    baseUrl: settings.baseUrl ?? '',
    model: settings.model ?? '',
    customApiStyle: settings.customApiStyle ?? '',
    customFullUrl: !!settings.customFullUrl,
  }));
  const signature = [
    'content-context-v5',
    normalizeUrl(bookmark.url),
    normalizeText(bookmark.title),
    folderRulesVersion,
    settings.usePageMetadata !== false ? 'metadata-on' : 'metadata-off',
    settings.allowPageContentForAi !== false ? 'content-sharing-on' : 'content-sharing-off',
    promptVersion,
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

function createChrome(storage, extra = {}) {
  return {
    storage: { local: storage.local },
    runtime: {
      async sendMessage(message) {
        if (message.action === 'labelCacheGet') {
          return { success: true, cache: structuredClone(storage.values.labelCache ?? {}) };
        }
        if (message.action === 'labelCacheMerge') {
          storage.values.labelCache = {
            ...(storage.values.labelCache ?? {}),
            ...Object.fromEntries(structuredClone(message.cacheEntries ?? [])),
          };
          return { success: true, cache: structuredClone(storage.values.labelCache) };
        }
        if (message.action === 'labelCacheClear') {
          delete storage.values.labelCache;
          return { success: true };
        }
        return { success: true };
      },
    },
    ...extra,
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
  allowPageContentForAi: true,
  useBuiltInClassificationRules: false,
  classifyPrompts: { label: 'test label prompt', buildTree: '', assign: '' },
  aiRetryCount: 0,
  aiRequestTimeoutSeconds: 5,
};

const bookmark = {
  id: 'bookmark-1',
  title: '  React   Hooks Guide  ',
  url: 'https://example.test/react/hooks?utm_source=test#installation',
  folderPath: 'Bookmarks Bar/Development/React',
};

function cacheEntry(summary = 'React hooks') {
  return { summary, tags: ['frontend'], sourceUrl: normalizeUrl(bookmark.url) };
}

async function testEstimateUsesContentContextV5() {
  const storage = createStorage({
    labelCache: {
      [contentContextV5Key(bookmark, baseSettings)]: cacheEntry(),
    },
  });
  globalThis.chrome = createChrome(storage);
  const { estimateClassify } = await importTypeScript('src/core/classifier.ts');

  const hit = await estimateClassify([bookmark], baseSettings);
  assert.equal(hit.cached, 1, '规范化 URL、标题和设置相同的输入应命中 v5 缓存');

  const renamed = await estimateClassify([{ ...bookmark, title: 'Vue Hooks Guide' }], baseSettings);
  assert.equal(renamed.cached, 0, '标题变化后不得复用旧标签');

  const moved = await estimateClassify([{ ...bookmark, folderPath: 'Bookmarks Bar/Work/React' }], baseSettings);
  const modelChanged = await estimateClassify([bookmark], { ...baseSettings, model: 'next-model' });
  assert.equal(modelChanged.cached, 0, '模型配置变化后不得复用旧标签');
  assert.equal(moved.cached, 1, '目录变化不应使语义相同的标签缓存失效');

  const metadataChanged = await estimateClassify([bookmark], { ...baseSettings, usePageMetadata: true });
  assert.equal(metadataChanged.cached, 0, '页面元数据开关变化后不得复用旧标签');

  const contentPermissionChanged = await estimateClassify([bookmark], { ...baseSettings, allowPageContentForAi: false });
  assert.equal(contentPermissionChanged.cached, 0, '页面内容发送授权变化后不得复用旧标签');

  storage.values.labelCache[contentContextV5Key(bookmark, baseSettings)].sourceUrl = 'https://wrong.example.test/';
  const wrongSource = await estimateClassify([bookmark], baseSettings);
  assert.equal(wrongSource.cached, 0, '缓存来源 URL 不匹配时成本估算不得计为命中');
}

async function testEstimateIgnoresFolderWhenDisabledAndMissesV1() {
  const storage = createStorage({
    labelCache: {
      [contentContextV5Key(bookmark, { ...baseSettings, respectExistingFolders: false })]: cacheEntry(),
    },
  });
  globalThis.chrome = createChrome(storage);
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
  assert.equal(oldVersion.cached, 0, '旧版本 URL 缓存必须自然失效');
}

async function testLabelingUsesTheSameSignatureAsEstimate() {
  const storage = createStorage({
    labelCache: {
      [contentContextV5Key(bookmark, baseSettings)]: cacheEntry(),
    },
  });
  globalThis.chrome = createChrome(storage, {
    permissions: { contains: async () => false },
  });

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

await testEstimateUsesContentContextV5();
await testEstimateIgnoresFolderWhenDisabledAndMissesV1();
await testLabelingUsesTheSameSignatureAsEstimate();

console.log('classification cache regression checks passed');
