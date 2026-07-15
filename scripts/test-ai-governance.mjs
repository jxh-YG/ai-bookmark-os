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
globalThis.chrome = {
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

const classifier = readFileSync('src/core/classifier.ts', 'utf8');
assert.match(classifier, /promptVersion/);
assert.match(classifier, /classifyIncremental[\s\S]{0,700}options:\s*ClassifyRunOptions/);
assert.match(classifier, /if\s*\(options\.persist\s*!==\s*false\)\s*await saveClassifyResult/);

const queue = await importTypeScript('src/core/incrementalQueue.ts');
await queue.enqueueIncrementalBookmarks([{ id: 'new-1', createdAt: 1 }]);
assert.equal((await queue.loadIncrementalQueue()).length, 1);
await queue.markIncrementalQueueFailed(['new-1'], 'network_error');
assert.equal((await queue.loadIncrementalQueue())[0].lastError, 'network_error');
await queue.completeIncrementalQueue(['new-1']);
assert.deepEqual(await queue.loadIncrementalQueue(), []);

console.log('AI governance regression checks passed');
