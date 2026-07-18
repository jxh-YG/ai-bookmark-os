import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const storage = {};
let incrementalQueue = [];
function normalizeMockLabelCache(cache) {
  const now = Date.now();
  return Object.fromEntries(Object.entries(cache || {})
    .filter(([, value]) => value && typeof value.summary === 'string' && Array.isArray(value.tags))
    .map(([key, value]) => [key, { ...value, cachedAt: Number(value.cachedAt) || now }])
    .filter(([, value]) => now - value.cachedAt <= 30 * 24 * 60 * 60 * 1000)
    .sort(([, left], [, right]) => right.cachedAt - left.cachedAt)
    .slice(0, 1000));
}
globalThis.chrome = {
  runtime: {
    async sendMessage(message) {
      if (message.action === 'labelCacheGet') {
        storage.labelCache = normalizeMockLabelCache(storage.labelCache);
        return { success: true, cache: structuredClone(storage.labelCache) };
      } else if (message.action === 'labelCacheMerge') {
        storage.labelCache = normalizeMockLabelCache({
          ...(storage.labelCache || {}),
          ...Object.fromEntries(structuredClone(message.cacheEntries || [])),
        });
        return { success: true, cache: structuredClone(storage.labelCache) };
      } else if (message.action === 'labelCacheClear') {
        delete storage.labelCache;
        return { success: true };
      } else if (message.action === 'incrementalQueueEnqueue') {
        for (const entry of message.entries || []) {
          if (!incrementalQueue.some((item) => item.id === entry.id)) {
            incrementalQueue.push({ ...entry, attempts: 0, status: 'pending', nextAttemptAt: 0 });
          }
        }
      } else if (message.action === 'incrementalQueueFail') {
        incrementalQueue = incrementalQueue.map((item) => message.ids.includes(item.id)
          ? { ...item, attempts: item.attempts + 1, status: 'retryable', lastError: message.error, nextAttemptAt: Date.now() + 1000 }
          : item);
      } else if (message.action === 'incrementalQueueComplete') {
        incrementalQueue = incrementalQueue.map((item) => message.ids.includes(item.id)
          ? { ...item, status: 'succeeded', completedAt: Date.now(), lastError: '', nextAttemptAt: 0 }
          : item);
      }
      return { success: true, queue: structuredClone(incrementalQueue) };
    },
  },
  storage: {
    local: {
      async get(key) {
        if (key === null) return structuredClone(storage);
        const keys = Array.isArray(key) ? key : [key];
        return Object.fromEntries(keys.filter((name) => name in storage).map((name) => [name, structuredClone(storage[name])]));
      },
      async set(values) {
        Object.assign(storage, structuredClone(values));
      },
      async remove(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
      },
    },
  },
};

const { CACHE_MAX_ENTRIES, CACHE_TTL_MS, loadCache, saveCache } = await importTypeScript('src/core/cache.ts');
storage.labelCache = {
  expired: { summary: 'old', tags: ['old'], cachedAt: Date.now() - CACHE_TTL_MS - 1 },
};
assert.deepEqual(await loadCache(), {});

const oversized = Object.fromEntries(Array.from({ length: CACHE_MAX_ENTRIES + 10 }, (_, index) => [
  `key-${index}`,
  { summary: `label-${index}`, tags: ['tag'], cachedAt: Date.now() - index },
]));
await saveCache(oversized);
assert.equal(Object.keys(storage.labelCache).length, CACHE_MAX_ENTRIES);
assert.ok(Object.values(storage.labelCache).every((entry) => Number.isFinite(entry.cachedAt)));

storage.labelCache = {};
await saveCache({ left: { summary: 'left', tags: ['left'], cachedAt: Date.now() } });
await saveCache({ right: { summary: 'right', tags: ['right'], cachedAt: Date.now() } });
assert.deepEqual(Object.keys(storage.labelCache).sort(), ['left', 'right']);

const bridge = readFileSync('src/bridge/ai-sw-bridge.js', 'utf8');
assert.doesNotMatch(bridge, /credentials:\s*['"]include['"]/);
assert.match(bridge, /credentials:\s*['"]omit['"]/);

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
assert.ok(!('host_permissions' in manifest), '不应在安装时请求所有站点权限');
assert.deepEqual(manifest.optional_host_permissions, ['<all_urls>']);

const packageScript = readFileSync('scripts/package-extension.mjs', 'utf8');
assert.match(packageScript, /optional_host_permissions:\s*\['<all_urls>'\]/);

const background = readFileSync('src/timeline/background/background.js', 'utf8');
assert.match(background, /enqueueIncrementalClassification\(id, bookmark\)/);
assert.match(background, /incrementalClassificationEnabled/);
assert.match(background, /if \(!pending\?\.contentText && item\.url\)/);
assert.match(background, /mutateStorageResource\(PAGE_CONTENT_CACHE_KEY,/);
assert.doesNotMatch(background, /chrome\.storage\.local\.remove\(PAGE_CONTENT_CACHE_KEY\)/);
assert.doesNotMatch(background, /if \(config\.allowPageContentForAi === false\)[\s\S]{0,900}PAGE_CONTENT_CACHE_KEY/);
assert.match(background, /case ['"]labelCacheGet['"]:/);
assert.match(background, /case ['"]labelCacheMerge['"]:/);
assert.match(background, /case ['"]labelCacheClear['"]:/);

const labelCacheSource = readFileSync('src/core/cache.ts', 'utf8');
assert.doesNotMatch(labelCacheSource, /chrome\.storage\.local\.(?:set|remove)\s*\(/);
assert.match(labelCacheSource, /action:\s*['"]labelCacheGet['"]/);
assert.match(labelCacheSource, /action:\s*['"]labelCacheMerge['"]/);
assert.match(labelCacheSource, /action:\s*['"]labelCacheClear['"]/);

const i18nSource = readFileSync('src/timeline/shared/i18n.js', 'utf8');
assert.match(i18nSource, /aiPageContent:\s*"Share page content"/);
assert.match(i18nSource, /aiPageContent:\s*"发送页面内容"/);
assert.doesNotMatch(i18nSource, /Page content is not sent|不发送正文/);

const classifier = readFileSync('src/core/classifier.ts', 'utf8');
assert.match(classifier, /promptVersion/);
assert.match(classifier, /usePageMetadata !== false && settings\.allowPageContentForAi !== false/);
assert.match(classifier, /content-sharing-on/);
assert.match(classifier, /classifyIncremental[\s\S]{0,700}options:\s*ClassifyRunOptions/);
assert.match(classifier, /if\s*\(options\.persist\s*!==\s*false\)\s*await saveClassifyResult/);

const queue = await importTypeScript('src/core/incrementalQueue.ts');
await queue.enqueueIncrementalBookmarks([{ id: 'new-1', createdAt: 1 }]);
assert.equal((await queue.loadIncrementalQueue()).length, 1);
await queue.markIncrementalQueueFailed(['new-1'], 'network_error');
assert.equal((await queue.loadIncrementalQueue())[0].lastError, 'network_error');
await queue.completeIncrementalQueue(['new-1']);
assert.equal((await queue.loadIncrementalQueue())[0].status, 'succeeded');

console.log('AI governance regression checks passed');
