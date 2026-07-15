import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/sidepanel/App.tsx', 'utf8');
const tree = fs.readFileSync('src/sidepanel/Tree.tsx', 'utf8');

assert.match(app, /captureBookmarkSnapshot/, 'workspace must capture the live bookmark tree');
assert.match(app, /isBookmarkSnapshotCurrent/, 'workspace must mark drafts stale against their live baseline');
assert.match(app, /onChildrenReordered/, 'live tree must refresh after native folder reorder events');
assert.match(app, /workspaceView/, 'workspace must distinguish live tree, AI drafts, and history');
assert.match(app, /checkFolderDeletion/, 'folder deletion must be blocked when descendants still contain bookmarks');
assert.match(app, /deleteEmptyFolder/, 'only empty draft folders may be deleted');
assert.doesNotMatch(app, /const pruneId =/, 'native bookmark deletion must not mutate persisted AI drafts');
assert.match(app, /const \[draftStatuses, setDraftStatuses\]/, 'every saved draft must retain its own freshness state');
assert.match(app, /refreshDraftStatuses/, 'bookmark events must refresh the status of every saved draft');
assert.match(app, /draftStatusLabel\(draftStatuses\[draft\.storageKey\]\)/, 'the saved draft picker must visibly label each draft state');
assert.match(app, /const storageKey = activeDraftKeyRef[\s\S]{0,700}draftsRef\.current = nextDrafts[\s\S]{0,120}setDrafts\(nextDrafts\)/, 'editing the active draft must update its in-memory saved draft entry');
assert.match(app, /`\$\{activeDraftKey\}:\$\{viewedResult\.updatedAt \?\? viewedResult\.createdAt\}`/, 'switching or editing a current draft must reset index-based batch selection state');
assert.match(app, /refreshAfterBookmarkOperation/, 'apply and undo failures must reconcile the live bookmark tree after bookmark events are suppressed');
assert.match(app, /excludedBookmarkIds/, 'bookmarks removed from a draft must remain visibly tracked as excluded');
assert.match(tree, /onCreateCategory/, 'batch editing must support moving selected bookmarks into a new category');
assert.match(app, /liveRefreshRequestRef/, 'concurrent live-tree reads must not let an older response overwrite a newer tree');
assert.match(app, /bookmarkEventsDuringApplyRef/, 'bookmark events suppressed during apply must be reconciled afterwards');
assert.match(app, /draftSaveLockRef/, 'draft edits must be serialized with persisted storage writes');
assert.match(app, /chromeApplyCommitted/, 'a completed Chrome write must be handled separately from post-apply history persistence');
assert.match(app, /const currentSnapshot = await captureBookmarkSnapshot\(activeScope\)/, 'a newly generated draft must be checked against a fresh post-AI snapshot');
assert.match(app, /if \(draftSaveLockRef\.current\) return/, 'an unavailable or stale draft must not be optimistically overwritten during a pending save');
assert.match(app, /className="draft-apply-action"/, 'the draft page must always expose its bookmark-apply action');
assert.match(app, /needsCompatibilityCheck[\s\S]{0,900}checkCompatibilityAndApply/, 'stale and legacy drafts must enter compatibility checking instead of applying directly');
assert.match(app, /className="pending-apply-banner"/, 'the live tree must point users to a ready draft that is waiting to be applied');

console.log('classification workspace UI contract checks passed');
