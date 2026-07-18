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
const context = {
  Array,
  Map,
  Set,
  String,
  chrome: {
    bookmarks: {
      search: async () => [],
    },
  },
  ensureRecommendationStore: async () => ({ snapshots }),
  findExistingBookmarkByUrl: async () => existingBookmark,
  getBookmarkFolderInfo: async () => ({ id: '', title: 'Existing folder', path: 'Saved/Existing folder' }),
  isSafeExternalUrl: value => {
    try { return /^(https?|ftp):$/.test(new URL(value).protocol); } catch { return false; }
  },
  loadBookmarkFolderOptions: async () => folderOptions,
  matchBookmarkFolderOption: (folders, path) => folders.find(folder => folder.path === path) || null,
  normalizeBookmarkFolderPath: value => String(value || '').split('/').map(part => part.trim()).filter(Boolean).join('/'),
  normalizeTagList: values => Array.from(values || [], String),
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

console.log('recommendation confirmation validation tests passed');
