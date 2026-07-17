import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const background = readFileSync('src/timeline/background/background.js', 'utf8');
const settings = readFileSync('src/timeline/pages/settings/settings.js', 'utf8');
const popup = readFileSync('src/timeline/pages/popup/popup.js', 'utf8');

const syncStart = background.indexOf('async function syncAllBookmarksOnce(');
const syncEnd = background.indexOf('let syncAllInFlight', syncStart);
const syncSource = background.slice(syncStart, syncEnd);
assert.doesNotMatch(syncSource, /autoTagBookmarks\s*\(/, 'history sync must not classify existing bookmarks');

const addEventStart = background.indexOf('chrome.bookmarks.onCreated.addListener');
const addEventEnd = background.indexOf('chrome.bookmarks.onChanged.addListener', addEventStart);
const addEventSource = background.slice(addEventStart, addEventEnd);
assert.match(addEventSource, /queueNewBookmarkRecommendation\(result\.item\)/);
assert.match(addEventSource, /if \(!result\.hadPending\)/, 'confirmed quick/RSS saves must not be queued twice');
assert.match(addEventSource, /enqueueIncrementalClassification\(id, bookmark\)/, 'incremental tree workbench remains available');

const recommendationStart = background.indexOf('async function buildBookmarkRecommendation(');
const recommendationEnd = background.indexOf('async function reevaluateBookmarkRecommendations(', recommendationStart);
const recommendationSource = background.slice(recommendationStart, recommendationEnd);
assert.match(recommendationSource, /await autoTagBookmark\(bookmark, \{ skipAI: true \}\)/);
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

console.log('recommendation production routing tests passed');
