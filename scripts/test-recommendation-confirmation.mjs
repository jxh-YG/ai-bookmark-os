import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/timeline/background/background.js', 'utf8');
const start = source.indexOf('async function saveConfirmedBookmark(');
const end = source.indexOf('async function injectBookmarkConfirmPanel(', start);
assert.ok(start >= 0 && end > start, 'quick bookmark confirmation helper should be present');

let snapshots = [];
let folderOptions = [];
let existingBookmark = null;
let storedBookmarks = [];
const pendingQuickBookmarks = new Map();
const context = {
  Array,
  Date,
  Map,
  Set,
  String,
  chrome: {
    bookmarks: {
      get: async () => [],
      move: async (id, options) => ({ id, parentId: options.parentId, title: 'Moved bookmark' }),
      search: async () => [],
    },
  },
  ensureRecommendationStore: async () => ({ snapshots }),
  findExistingBookmarkByUrl: async () => existingBookmark,
  getBookmarkFolderInfo: async () => ({ id: '', title: 'Existing folder', path: 'Saved/Existing folder' }),
  extractDomain: value => {
    try { return new URL(value).hostname; } catch { return ''; }
  },
  isSafeExternalUrl: value => {
    try { return /^(https?|ftp):$/.test(new URL(value).protocol); } catch { return false; }
  },
  loadBookmarkFolderOptions: async () => folderOptions,
  matchBookmarkFolderOption: (folders, path) => folders.find(folder => folder.path === path) || null,
  markProgrammaticBookmarkMove: () => {},
  mutateLegacyDynamicRules: async mutator => mutator({ seenDomains: [] }),
  mutateStoredBookmarks: async mutator => {
    storedBookmarks = await mutator(storedBookmarks);
    return storedBookmarks;
  },
  normalizeBookmarkFolderPath: value => String(value || '').split('/').map(part => part.trim()).filter(Boolean).join('/'),
  normalizeTagList: values => Array.from(values || [], String),
  pendingQuickBookmarks,
  programmaticBookmarkMoves: new Set(),
  recommendationUrlFingerprint: value => `fingerprint:${value}`,
  self: { BookmarkRecommendationCore: null },
};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}; this.saveConfirmedBookmark = saveConfirmedBookmark;`, context);

assert.deepEqual(
  { ...await context.saveConfirmedBookmark({ url: 'javascript:alert(1)' }) },
  { success: false, error: 'invalid_url' },
);

assert.deepEqual(
  { ...await context.saveConfirmedBookmark({ url: 'https://example.test/page', recommendationId: 'missing' }) },
  { success: false, error: 'recommendation_not_found' },
);

snapshots = [{ recommendationId: 'rec-1', urlFingerprint: 'fingerprint:https://other.test/page' }];
assert.deepEqual(
  { ...await context.saveConfirmedBookmark({ url: 'https://example.test/page', recommendationId: 'rec-1' }) },
  { success: false, error: 'recommendation_url_mismatch' },
);

snapshots = [];
existingBookmark = { id: 'existing-bookmark', url: 'https://example.test/page' };
assert.deepEqual(
  { ...await context.saveConfirmedBookmark({ url: 'https://example.test/page' }) },
  {
    success: false,
    duplicated: true,
    bookmarkId: 'existing-bookmark',
    existingFolderName: 'Existing folder',
    existingFolderPath: 'Saved/Existing folder',
    error: 'already_exists',
  },
);
existingBookmark = null;
folderOptions = [{ id: 'folder-1', title: '开发', path: '工作/开发' }];
assert.deepEqual(
  { ...await context.saveConfirmedBookmark({
    url: 'https://example.test/page',
    folderMode: 'existing',
    folderId: 'folder-1',
    folderPath: '工作/设计',
  }) },
  { success: false, error: 'folder_selection_mismatch' },
);
assert.deepEqual(
  { ...await context.saveConfirmedBookmark({
    url: 'https://example.test/page',
    folderMode: 'existing',
    folderId: 'missing-folder',
    folderPath: '工作/开发',
  }) },
  { success: false, error: 'folder_not_found' },
);

existingBookmark = {
  id: 'existing-bookmark',
  url: 'https://example.test/page',
  parentId: 'old-folder',
};
storedBookmarks = [{
  id: 'existing-bookmark',
  url: 'https://example.test/page',
  parentId: 'old-folder',
  contentText: 'old body',
}];
const moved = await context.saveConfirmedBookmark({
  url: 'https://example.test/page',
  title: 'Updated title',
  duplicateAction: 'move',
  folderMode: 'existing',
  folderId: 'folder-1',
  folderPath: '工作/开发',
  folderName: '开发',
  tags: ['开发'],
  contentText: 'complete extracted page body',
  contentTitle: 'Extracted page title',
  excerpt: 'Extracted summary',
  metaDesc: 'Extracted meta description',
  metaKeywords: ['api', 'relay'],
  headings: ['Overview', 'API relay'],
  structuredTypes: ['Article'],
  contentFetchedAt: 123456,
  contentStatus: 'success',
  contentFailureReason: '',
  contentSource: 'active-tab',
});
assert.equal(moved.success, true);
assert.equal(moved.moved, true);
assert.equal(storedBookmarks[0].parentId, 'folder-1');
assert.equal(storedBookmarks[0].contentText, 'complete extracted page body');
assert.equal(storedBookmarks[0].contentTitle, 'Extracted page title');
assert.equal(storedBookmarks[0].contentExcerpt, 'Extracted summary');
assert.equal(storedBookmarks[0].contentMetaDesc, 'Extracted meta description');
assert.deepEqual(Array.from(storedBookmarks[0].contentMetaKeywords), ['api', 'relay']);
assert.deepEqual(Array.from(storedBookmarks[0].contentHeadings), ['Overview', 'API relay']);
assert.deepEqual(Array.from(storedBookmarks[0].contentStructuredTypes), ['Article']);
assert.equal(storedBookmarks[0].contentFetchedAt, 123456);
assert.equal(storedBookmarks[0].contentStatus, 'success');
assert.equal(storedBookmarks[0].contentSource, 'active-tab');
assert.equal(pendingQuickBookmarks.has('https://example.test/page'), false);

console.log('recommendation confirmation validation tests passed');
