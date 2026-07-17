import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const helperSource = readFileSync('src/timeline/background/bookmark-data.js', 'utf8');
const context = { Array, Date, Map, Object, Set, String, URL };
vm.createContext(context);
vm.runInContext(`${helperSource}; this.helpers = globalThis.BookmarkData;`, context);

const {
  buildImportPlan,
  buildRestoredBookmark,
  buildCheckerSummary,
} = context.helpers;
const plain = value => JSON.parse(JSON.stringify(value));

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
    { title: 'Specification', url: 'https://example.com/specification', folderPath: 'Docs' },
    { title: 'Unsupported', url: 'file:///private/notes.html' },
  ],
  existing: [{
    id: '1',
    url: 'https://example.com/react?a=1&b=2',
    folderPath: 'AI Bookmark OS 导入/2026-07-16/Development/Frontend',
  }],
  rootTitle: 'AI Bookmark OS 导入',
  rootDate: '2026-07-16',
  duplicateStrategy: 'skip',
});

assert.deepEqual(plain(importPlan.folders), [
  { key: 'AI Bookmark OS 导入', parentKey: '', title: 'AI Bookmark OS 导入' },
  { key: 'AI Bookmark OS 导入/2026-07-16', parentKey: 'AI Bookmark OS 导入', title: '2026-07-16' },
  { key: 'AI Bookmark OS 导入/2026-07-16/Docs', parentKey: 'AI Bookmark OS 导入/2026-07-16', title: 'Docs' },
]);
assert.equal(importPlan.create.length, 1);
assert.equal(importPlan.skipped.length, 2);
assert.equal(importPlan.invalid.length, 1);

const createPlan = buildImportPlan({
  incoming: [{ title: 'Spec', url: 'https://example.com/spec', folderPath: 'Docs', tags: ['work'], pinned: true }],
  existing: [],
  rootTitle: 'AI Bookmark OS 导入',
  rootDate: '2026-07-16',
});
assert.equal(createPlan.create.length, 1);
assert.equal(createPlan.create[0].folderKey, 'AI Bookmark OS 导入/2026-07-16/Docs');
assert.deepEqual(plain(createPlan.create[0].metadata.tags), ['work']);

const emptyFolderPlan = buildImportPlan({
  incoming: [],
  existing: [],
  folders: ['Empty/Nested'],
  rootTitle: 'Imported',
  rootDate: '2026-07-17',
});
assert.equal(emptyFolderPlan.create.length, 0);
assert.deepEqual(plain(emptyFolderPlan.folders), [
  { key: 'Imported', parentKey: '', title: 'Imported' },
  { key: 'Imported/2026-07-17', parentKey: 'Imported', title: '2026-07-17' },
  { key: 'Imported/2026-07-17/Empty', parentKey: 'Imported/2026-07-17', title: 'Empty' },
  { key: 'Imported/2026-07-17/Empty/Nested', parentKey: 'Imported/2026-07-17/Empty', title: 'Nested' },
]);

const duplicateAndMetadataPlan = buildImportPlan({
  incoming: [
    { title: 'First', url: 'https://example.com/item', folderPath: 'Docs', dateAdded: 1_700_000_000_000, contentExcerpt: 'summary' },
    { title: 'Second', url: 'https://example.com/item#fragment', folderPath: 'Docs' },
  ],
  existing: [],
  rootTitle: 'Imported',
  rootDate: '2026-07-17',
});
assert.equal(duplicateAndMetadataPlan.create.length, 1);
assert.equal(duplicateAndMetadataPlan.skipped.length, 1);
assert.equal(duplicateAndMetadataPlan.create[0].metadata.dateAdded, 1_700_000_000_000);
assert.equal(duplicateAndMetadataPlan.create[0].metadata.contentExcerpt, 'summary');

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
assert.deepEqual(plain(restored.create), {
  parentId: 'folder-a',
  index: 3,
  title: 'Pinned bookmark',
  url: 'https://example.com/pinned',
});
assert.equal(restored.restoredToFallback, false);
assert.deepEqual(plain(restored.metadata.tags), ['work']);
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
assert.match(backgroundSource, /operation\.request\?\.rootTitle/);
assert.match(backgroundSource, /for \(const key of \['created', 'createdFolders', 'skipped', 'merged', 'invalid', 'failed'\]\)/);
assert.match(backgroundSource, /operation\.failed\.length \|\| operation\.invalid\.length \? 'partial' : 'completed'/);
assert.match(backgroundSource, /message\.requestId,[\s\S]{0,160}retryImportOperation\(message\.operationId\)/);

const settingsSource = readFileSync('src/timeline/pages/settings/settings.js', 'utf8');
assert.match(settingsSource, /version:\s*2,[\s\S]{0,120}roots:/);
assert.match(settingsSource, /<!DOCTYPE NETSCAPE-Bookmark-file-1>/);
assert.match(settingsSource, /new DOMParser\(\)\.parseFromString\(text, 'text\/html'\)/);
assert.match(settingsSource, /node\.type === 'folder'/);
assert.doesNotMatch(settingsSource, /function buildBookmarksPage\(/);

console.log('data safety regression checks passed');
