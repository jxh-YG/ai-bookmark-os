import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checker = readFileSync('src/timeline/pages/checker/checker.js', 'utf8');
assert.match(checker, /let activeRunId = '';/);
assert.match(checker, /function scheduleResultsRender\(\)[\s\S]{0,700}requestAnimationFrame/);
assert.match(checker, /runId !== activeRunId/);
assert.match(checker, /function stopCheck\(\)[\s\S]{0,350}activeRunId = ''/);
assert.match(checker, /status:\s*['"]cancelled['"]/);
assert.match(checker, /checkerLastResult[\s\S]{0,900}results:/);

const checkerHtml = readFileSync('src/timeline/pages/checker/checker.html', 'utf8');
assert.match(checker, /function updateResultItem\(item\)/);
assert.match(checker, /确认删除此书签/);
assert.match(checker, /checkerLiveStatus\.textContent/);
assert.match(checkerHtml, /role="progressbar"/);
assert.match(checkerHtml, /aria-live="polite"/);

const navPage = readFileSync('src/bookmark-nav/BookmarkNavPage.tsx', 'utf8');
const bookmarkCard = readFileSync('src/bookmark-nav/BookmarkCard.tsx', 'utf8');
assert.match(navPage, /const META_REQUESTS = new Map/);
assert.match(navPage, /META_FAILURE_TTL_MS/);
assert.match(navPage, /event\.key !== 'Escape'/);
assert.match(navPage, /role="menuitemcheckbox"/);
assert.match(bookmarkCard, /onKeyDown=\{\(event\) => \{\s*event\.stopPropagation\(\);/);
const app = readFileSync('src/sidepanel/App.tsx', 'utf8');
assert.match(app, /function useDialogAccessibility\(/);
assert.match(app, /const applyDialogRef = useDialogAccessibility/);
assert.match(app, /const estimateDialogRef = useDialogAccessibility/);
assert.match(app, /const whatsNewDialogRef = useDialogAccessibility/);
assert.match(app, /role="dialog" aria-modal="true" aria-labelledby="applyDialogTitle"/);
assert.match(app, /role="dialog" aria-modal="true" aria-labelledby="estimateDialogTitle"/);
assert.match(app, /role="dialog" aria-modal="true" aria-labelledby="whatsNewDialogTitle"/);

const audit = readFileSync('scripts/audit-project.mjs', 'utf8');
assert.match(audit, /README_REQUIRED_SECTIONS/);
assert.doesNotMatch(audit, /README[^\n]{0,100}安装方法/);

console.log('checker and accessibility regression checks passed');
