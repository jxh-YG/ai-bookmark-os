import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const helperSource = readFileSync('src/timeline/background/bookmark-data.js', 'utf8');
const context = { Array, Date, Map, Object, Set, String, URL };
vm.createContext(context);
vm.runInContext(`${helperSource}; this.helpers = BookmarkData;`, context);

const {
  buildImportPlan,
  buildRestoredBookmark,
  buildCheckerSummary,
} = context.helpers;

const importPlan = buildImportPlan({
  incoming: [
    {
      title: 'React guide',
      url: 'https://example.com/react?b=2&a=1',
      folderPath: 'Development/Frontend',
      tags: ['react', 'guide'],
      pinned: true,
    },
    {
      title: 'Duplicate',
      url: 'https://example.com/react?a=1&b=2',
      folderPath: 'Development/Frontend',
      tags: ['duplicate'],
    },
    { title: 'Unsupported', url: 'file:///private/notes.html' },
  ],
  existing: [{ id: '1', url: 'https://example.com/react?a=1&b=2', parentId: 'folder-frontend' }],
  rootTitle: 'AI Bookmark OS 导入',
  rootDate: '2026-07-16',
  duplicateStrategy: 'skip',
});

assert.deepEqual([...importPlan.folders], [
  { key: 'AI Bookmark OS 导入/2026-07-16', title: 'AI Bookmark OS 导入' },
  { key: 'AI Bookmark OS 导入/2026-07-16/Development', title: 'Development' },
  { key: 'AI Bookmark OS 导入/2026-07-16/Development/Frontend', title: 'Frontend' },
]);
assert.equal(importPlan.create.length, 0);
assert.equal(importPlan.skipped.length, 1);
assert.equal(importPlan.invalid.length, 1);

const createPlan = buildImportPlan({
  incoming: [{ title: 'Spec', url: 'https://example.com/spec', folderPath: 'Docs', tags: ['work'], pinned: true }],
  existing: [],
  rootTitle: 'AI Bookmark OS 导入',
  rootDate: '2026-07-16',
});
assert.equal(createPlan.create.length, 1);
assert.equal(createPlan.create[0].folderKey, 'AI Bookmark OS 导入/2026-07-16/Docs');
assert.deepEqual([...createPlan.create[0].metadata.tags], ['work']);

const restored = buildRestoredBookmark({
  id: 'old-id',
  title: 'Pinned bookmark',
  url: 'https://example.com/pinned',
  parentId: 'folder-a',
  index: 3,
  tags: ['work'],
  pinned: true,
  contentText: 'cached content',
}, new Set(['folder-a']));
assert.deepEqual({ ...restored.create }, {
  parentId: 'folder-a',
  index: 3,
  title: 'Pinned bookmark',
  url: 'https://example.com/pinned',
});
assert.equal(restored.restoredToFallback, false);
assert.deepEqual([...restored.metadata.tags], ['work']);
assert.equal(restored.metadata.pinned, true);

const fallbackRestore = buildRestoredBookmark({ title: 'Lost folder', url: 'https://example.com/lost', parentId: 'missing' }, new Set());
assert.equal(fallbackRestore.restoredToFallback, true);
assert.equal(fallbackRestore.create.parentId, '');

const checkerSummary = buildCheckerSummary([
  { bookmark: { id: 'a', title: 'Broken', url: 'https://broken.example' }, status: 'broken', message: '404 confirmed' },
]);
assert.equal(checkerSummary.pendingCleanup.length, 1);
assert.equal(checkerSummary.autoDeleted, undefined);

const backgroundSource = readFileSync('src/timeline/background/background.js', 'utf8');
assert.match(backgroundSource, /importScripts\('bookmark-data\.js'\)/);
assert.doesNotMatch(backgroundSource, /checkerAutoDelete[\s\S]{0,800}chrome\.bookmarks\.remove/);

console.log('data safety regression checks passed');
