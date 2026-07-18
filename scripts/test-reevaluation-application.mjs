import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/timeline/pages/settings/settings.js', 'utf8');
const start = source.indexOf('function mergeReevaluationTags(');
const end = source.indexOf('async function applySelectedReevaluations(', start);
assert.ok(start >= 0 && end > start, 'reevaluation application helpers should be present');

const messages = [];
const moves = [];
const context = {
  Array,
  Error,
  Object,
  Set,
  String,
  chrome: {
    bookmarks: {
      move: async (id, destination) => {
        moves.push({ id, destination });
        return { id, parentId: destination.parentId };
      },
    },
    runtime: {
      sendMessage: async (message) => {
        messages.push(message);
        return { success: true };
      },
    },
  },
  makeSettingsOperationId: () => 'reevaluate-op',
};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '; this.canApply = canApplyReevaluation; this.applyItem = applyReevaluationItem;', context);

const tagOnly = {
  id: 'bookmark-tag',
  parentId: 'folder-old',
  folderPath: '\u5de5\u4f5c/\u6536\u4ef6\u7bb1',
  tags: ['\u624b\u52a8'],
  tagsAuto: [],
  recommendation: {
    recommendationId: 'rec-tag',
    folders: [],
    tags: [{ tag: 'API', confidence: 'high' }],
  },
};
assert.equal(context.canApply(tagOnly), true, 'high-confidence tags must be applicable without a folder recommendation');
assert.deepEqual({ ...await context.applyItem(tagOnly) }, { success: true });
assert.equal(moves.length, 0, 'tag-only reevaluation must not move the bookmark');
const tagUpdate = messages.find(message => message.action === 'updateBookmark');
assert.deepEqual(Array.from(tagUpdate.tags), ['\u624b\u52a8', 'API'], 'reevaluation must preserve manual tags');
assert.deepEqual(Array.from(tagUpdate.tagsAuto), ['API'], 'only the recommended tag should be recorded as automatic');
const tagFeedback = messages.find(message => message.action === 'submitBookmarkRecommendationFeedback');
assert.equal(tagFeedback.selection.folderPath, '\u5de5\u4f5c/\u6536\u4ef6\u7bb1');
assert.deepEqual(Array.from(tagFeedback.selection.tags), ['\u624b\u52a8', 'API']);

messages.length = 0;
moves.length = 0;
const folderOnly = {
  id: 'bookmark-folder',
  parentId: 'folder-old',
  folderPath: '\u5de5\u4f5c/\u65e7\u76ee\u5f55',
  tags: ['\u624b\u52a8'],
  tagsAuto: [],
  recommendation: {
    recommendationId: 'rec-folder',
    folders: [{ id: 'folder-new', folderPath: '\u5de5\u4f5c/\u65b0\u76ee\u5f55', exists: true, confidence: 'high' }],
    tags: [],
  },
};
assert.equal(context.canApply(folderOnly), true, 'folder-only reevaluation must remain applicable');
assert.deepEqual({ ...await context.applyItem(folderOnly) }, { success: true });
assert.equal(moves[0].destination.parentId, 'folder-new');
assert.equal(messages.some(message => message.action === 'updateBookmark'), false);

assert.equal(context.canApply({
  ...tagOnly,
  tags: ['\u624b\u52a8', 'API'],
}), false, 'unchanged tag-only recommendations must not be offered again');

console.log('reevaluation application tests passed');
