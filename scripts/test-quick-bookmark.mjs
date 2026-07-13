import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/timeline/background/background.js', 'utf8');
const start = source.indexOf('const BROWSER_BOOKMARK_ROOT_TITLES = new Set([');
const end = source.indexOf('async function prepareBookmarkSuggestion(');

assert.ok(start >= 0 && end > start, 'bookmark suggestion helpers should be present');

const context = { Set, String, Array, Object, Date, extractDomain: url => new URL(url).hostname };
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}; this.helpers = {
  normalizeTagList,
  normalizeBookmarkFolderPath,
  matchBookmarkFolderOption,
  buildLocalBookmarkSuggestion
};`, context);

const { normalizeTagList, normalizeBookmarkFolderPath, matchBookmarkFolderOption, buildLocalBookmarkSuggestion } = context.helpers;

assert.deepEqual([...normalizeTagList([' docs ', { tag: 'docs' }, { tag: 'AI' }])], ['docs', 'AI']);
assert.equal(normalizeBookmarkFolderPath('Bookmarks bar/Work / Project'), 'Work/Project');
assert.equal(normalizeBookmarkFolderPath('Other bookmarks/Work/Project'), 'Work/Project');
assert.deepEqual(
  { ...matchBookmarkFolderOption([{ id: '42', path: 'Work/Project' }], 'Bookmarks bar/Work/Project') },
  { id: '42', path: 'Work/Project' },
);

const draft = buildLocalBookmarkSuggestion(
  { title: 'Example', url: 'https://example.test', domain: 'example.test' },
  [{ tag: 'Rules' }],
  { id: 'folder-1', title: 'Local', path: 'Local' },
  { tags: [{ tag: 'AI' }], folderPath: 'AI/Research', summary: 'AI summary', reason: 'AI reason' },
  '',
);
assert.deepEqual([...draft.tags], ['AI']);
assert.equal(draft.folderPath, 'Local');
assert.equal(draft.summary, 'AI summary');

for (const needle of [
  'draft.duplicate = true;',
  "existingFolderPath: existingFolder.path || ''",
  "['move', 'copy'].includes(draft.duplicateAction)",
  'data-act="copy"',
  'data-act="move"',
  "const exactExistingOption = getExistingFolderOptions().find(opt =>",
  "folderMode = selectedExisting ? 'existing' : 'new'",
  "root.querySelector('#abFolderSearch')",
  "root.querySelector('#abTitleInput')",
  "root.querySelector('#abTagsInput')",
  'id="abFolderToggle"',
  'class="ab-folder-results"',
  "setFolderDropdownOpen(true, !folderSearch.dataset.userSearching)",
  'setFolderDropdownOpen(nextOpen, true)',
  "folderSearch.addEventListener('keydown'",
  "event.key === 'ArrowDown'",
  "event.key === 'Escape'",
  "folderResults.addEventListener('click'",
]) {
  assert.ok(source.includes(needle), `quick bookmark duplicate flow missing: ${needle}`);
}

assert.ok(!source.includes('.slice(0, 500)'), 'folder picker must include the complete browser folder list');

console.log('quick bookmark suggestion regression checks passed');
