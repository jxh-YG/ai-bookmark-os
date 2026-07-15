import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checker = readFileSync('src/timeline/pages/checker/checker.js', 'utf8');
assert.match(checker, /let activeRunId = 0;/);
assert.match(checker, /function scheduleResultsRender\(\)[\s\S]{0,700}requestAnimationFrame/);
assert.match(checker, /runId !== activeRunId/);
assert.match(checker, /function stopCheck\(\)[\s\S]{0,350}activeRunId \+= 1/);
assert.match(checker, /status:\s*['"]cancelled['"]/);
assert.match(checker, /checkerLastResult[\s\S]{0,900}results:/);

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
