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

const storage = {
  classifyResult: { tree: [], labels: {}, createdAt: 10, updatedAt: 40, draftId: 'full' },
  'partialClassifyResult:work': {
    tree: [], labels: {}, createdAt: 30, updatedAt: 80, draftId: 'work',
    scope: { mode: 'partial', targetDirectoryId: 'work', targetDirectoryTitle: '工作', bookmarkCount: 2 },
  },
  'partialClassifyResult:study': {
    tree: [], labels: {}, createdAt: 50, draftId: 'study',
    scope: { mode: 'partial', targetDirectoryId: 'study', targetDirectoryTitle: '学习', bookmarkCount: 1 },
  },
  'partialClassifyResult:broken': { invalid: true },
};

globalThis.chrome = {
  storage: {
    local: {
      get: async (key) => key === null
        ? structuredClone(storage)
        : { [key]: structuredClone(storage[key]) },
      set: async () => {},
      remove: async () => {},
    },
  },
};

const { listSavedClassifyResults } = await importTypeScript('src/core/classifier.ts');
const drafts = await listSavedClassifyResults();

assert.deepEqual(
  drafts.map((item) => [item.storageKey, item.result.draftId]),
  [
    ['partialClassifyResult:work', 'work'],
    ['partialClassifyResult:study', 'study'],
    ['classifyResult', 'full'],
  ],
);

console.log('saved draft list checks passed');
