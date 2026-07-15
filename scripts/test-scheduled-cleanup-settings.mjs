import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settings = readFileSync('src/timeline/pages/settings/settings.js', 'utf8');

assert.match(settings, /checkerAutoDeleteRow\.classList\.add\('hidden-row'\)/);
assert.match(settings, /checkerAutoDeleteToggle\.disabled = true/);
assert.doesNotMatch(settings, /checkerAutoDeleteRow\.classList\.toggle\('hidden-row', !show\)/);

console.log('scheduled cleanup settings regression checks passed');
