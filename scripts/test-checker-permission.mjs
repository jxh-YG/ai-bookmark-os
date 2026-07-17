import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const checker = readFileSync('src/timeline/pages/checker/checker.js', 'utf8');

assert.match(checker, /async function requestCheckerPermission\(\)/);
assert.match(checker, /chrome\.permissions\.contains\(\{ origins \}\)/);
assert.match(checker, /chrome\.permissions\.request\(\{ origins \}\)/);
assert.match(checker, /不会携带登录态/);
assert.match(checker, /requestProbe\('checkUrl'/);
assert.match(checker, /type:\s*'cancelLinkCheckRun'/);
assert.match(checker, /async function startCheck\(\)[\s\S]{0,700}await requestCheckerPermission\(\)/);

console.log('checker optional permission regression checks passed');
