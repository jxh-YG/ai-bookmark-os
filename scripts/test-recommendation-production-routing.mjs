import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const background = readFileSync('src/timeline/background/background.js', 'utf8');
const settings = readFileSync('src/timeline/pages/settings/settings.js', 'utf8');
const popup = readFileSync('src/timeline/pages/popup/popup.js', 'utf8');
const evidenceStart = background.indexOf('function recommendationEvidenceFromTagResult(');
const evidenceEnd = background.indexOf('function recommendationEvidenceFromFolderCandidate(', evidenceStart);
const evidenceContext = { Array, String };
vm.createContext(evidenceContext);
vm.runInContext(
  background.slice(evidenceStart, evidenceEnd) + '; this.mapRecommendationEvidence = recommendationEvidenceFromTagResult;',
  evidenceContext,
);
assert.deepEqual(
  Array.from(evidenceContext.mapRecommendationEvidence({ signals: ['domain', 'learned-domain'] }), item => item.family),
  ['learned_rule'],
  'a learned domain must not count twice as independent evidence',
);

const syncStart = background.indexOf('async function syncAllBookmarksOnce(');
const syncEnd = background.indexOf('let syncAllInFlight', syncStart);
const syncSource = background.slice(syncStart, syncEnd);
assert.match(syncSource, /autoTagBookmarks\s*\(needsTag,\s*10,\s*\{\s*skipAI:\s*true\s*\}\)/, 'history sync must locally tag without AI');
assert.match(syncSource, /shouldRefreshLocalTags\(\s*item\.tags,\s*item\.tagsAuto,/, 'sync must revisit generic and automatically generated tags without overwriting manual tags');
assert.match(syncSource, /collectOfficeSystemUrlKeys\(merged\)/, 'same-address enterprise systems must be re-evaluated together');
assert.match(syncSource, /applyLocalAutoTags\(current\.tags, current\.tagsAuto, item\.tagsAuto\)/, 'a replacement must not merge stale automatic tags back in');

const tagHelpersStart = background.indexOf('function normalizeTagList(');
const tagHelpersEnd = background.indexOf('function normalizeBookmarkFolderPath(', tagHelpersStart);
const tagHelpersContext = { Array, Map, Set, String };
vm.createContext(tagHelpersContext);
vm.runInContext(
  background.slice(tagHelpersStart, tagHelpersEnd) + '; this.tagHelpers = { isNumericOnlyTag, isGenericTag, shouldRefreshLocalTags, applyLocalAutoTags, collectOfficeSystemUrlKeys };',
  tagHelpersContext,
);
assert.equal(tagHelpersContext.tagHelpers.shouldRefreshLocalTags([]), true);
assert.equal(tagHelpersContext.tagHelpers.shouldRefreshLocalTags(['其他', 'unknown']), true);
assert.equal(tagHelpersContext.tagHelpers.shouldRefreshLocalTags(['其他', '开发']), false);
assert.equal(tagHelpersContext.tagHelpers.shouldRefreshLocalTags(['开发'], ['开发']), true);
assert.equal(tagHelpersContext.tagHelpers.shouldRefreshLocalTags(['开发'], []), false);
assert.equal(tagHelpersContext.tagHelpers.isNumericOnlyTag('24'), true);
assert.equal(tagHelpersContext.tagHelpers.isNumericOnlyTag('企业协同'), false);
assert.deepEqual(
  Array.from(tagHelpersContext.tagHelpers.applyLocalAutoTags(['手动标签', '开发'], ['开发'], ['办公']).tags),
  ['手动标签', '办公'],
);
assert.deepEqual(
  Array.from(tagHelpersContext.tagHelpers.collectOfficeSystemUrlKeys([
    { url: 'http://192.168.101.3/oa', title: '综合办公管理平台' },
    { url: 'http://192.168.101.3/oa', title: '国投测试系统' },
  ])),
  ['url:http://192.168.101.3/oa'],
);

const addEventStart = background.indexOf('chrome.bookmarks.onCreated.addListener');
const addEventEnd = background.indexOf('chrome.bookmarks.onChanged.addListener', addEventStart);
const addEventSource = background.slice(addEventStart, addEventEnd);
assert.match(addEventSource, /Promise\.resolve\(result\.contentTask \|\| result\.item\)/, 'recommendations must wait for locally extracted page content when available');
assert.match(addEventSource, /queueNewBookmarkRecommendation\(bookmarkWithContent\)/);
assert.match(addEventSource, /if \(!result\.hadPending\)/, 'confirmed quick/RSS saves must not be queued twice');
assert.match(addEventSource, /enqueueIncrementalClassification\(id, bookmark\)/, 'incremental tree workbench remains available');

const addSingleStart = background.indexOf('async function addSingleBookmark(');
const addSingleEnd = background.indexOf('async function updateBookmark(', addSingleStart);
const addSingleSource = background.slice(addSingleStart, addSingleEnd);
assert.match(addSingleSource, /await autoTagBookmark\(item,\s*\{\s*skipAI:\s*true\s*\}\)/, 'ordinary new bookmarks must receive local tags immediately');
assert.match(addSingleSource, /item\.tagsAuto\s*=\s*localTags/, 'ordinary new bookmark auto tags must retain their source');
assert.match(addSingleSource, /let contentTask = Promise\.resolve\(item\)/, 'ordinary new bookmarks must extract local page content');
assert.match(addSingleSource, /await autoTagBookmark\(\{ \.\.\.item, \.\.\.contentPatch \}, \{ skipAI: true \}\)/, 'ordinary bookmarks must recompute local tags after page content is extracted');
assert.match(addSingleSource, /applyLocalAutoTags\(stored\.tags, stored\.tagsAuto, refreshedLocalTags\)/, 'content-based recomputation must preserve manual tags');
assert.match(addSingleSource, /action: 'tagsUpdated', bookmarkId: item\.id/, 'content-enriched tags must refresh open bookmark views');
assert.doesNotMatch(addSingleSource, /allowPageContentForAi/, 'local page extraction must not depend on the AI content-sharing setting');

const recommendationStart = background.indexOf('async function buildBookmarkRecommendation(');
const recommendationEnd = background.indexOf('async function reevaluateBookmarkRecommendations(', recommendationStart);
const recommendationSource = background.slice(recommendationStart, recommendationEnd);
assert.match(recommendationSource, /await autoTagBookmark\(bookmark, \{ skipAI: true \}\)/);
assert.match(recommendationSource, /const folderMatchBookmarks = sampleFolderBookmarks\(storedBookmarks\)/, 'each recommendation must sample existing bookmarks per folder');
assert.match(recommendationSource, /scoreFolderProfileCandidates\(folderMatchBookmarks,/, 'folder profiles must use the bounded sample');
assert.doesNotMatch(recommendationSource, /autoTagBookmarkSync\s*\(/);
assert.match(recommendationSource, /async function queueNewBookmarkRecommendation/);

const rssStart = background.indexOf('async function saveRssArticleAsBookmark(');
const rssEnd = background.indexOf('self.saveRssArticleAsBookmark', rssStart);
assert.match(background.slice(rssStart, rssEnd), /await recommendTagsForBookmarks\(\[tempItem\], 1\)/);
assert.match(background, /topTag\?\.confidence === 'high'/, 'RSS may only apply the high-confidence first tag');
assert.doesNotMatch(background, /function maybeBackfillAIForItem\s*\(/, 'legacy AI tag overwrite path must stay removed');

const movedStart = background.indexOf('chrome.bookmarks.onMoved.addListener');
const movedEnd = background.indexOf('chrome.bookmarks.onRemoved.addListener', movedStart);
const movedSource = background.slice(movedStart, movedEnd);
assert.match(movedSource, /queueBookmarkMoveObservation/);
assert.doesNotMatch(movedSource, /recordRecommendationRuleEvidence|onUserConfirmTag/);

const legacyReviewStart = background.indexOf("case 'confirmTagReview':");
const legacyReviewEnd = background.indexOf("case 'getLearningStats':", legacyReviewStart);
const legacyReviewSource = background.slice(legacyReviewStart, legacyReviewEnd);
assert.match(legacyReviewSource, /submitLegacyTagReviewFeedback/);
assert.doesNotMatch(legacyReviewSource, /onUserConfirmTag/, 'legacy review must not update the old learning corpus');

assert.match(background, /case 'resolveRecommendationReview':/);
assert.match(settings, /action: 'resolveRecommendationReview'/);
assert.match(settings, /reviewId,/);
assert.match(popup, /bookmarkId: editingBookmarkId/);
assert.match(background, /tagsAuto/, 'tag updates must support automatic tag provenance');
assert.match(background, /value === 'curated-domain'\) family = 'curated_domain'/, 'curated domain signals must retain their confidence family');
assert.match(background, /value === 'learned-domain'\) family = 'learned_rule'/, 'learned domain signals must not be promoted to curated rules');
assert.match(background, /color: color \|\| '#607d8b', source: 'user'/, 'manually added domain rules must retain their source');

console.log('recommendation production routing tests passed');
