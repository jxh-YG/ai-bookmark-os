import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const tests = readdirSync('scripts')
  .filter((name) => /^test-.*\.mjs$/.test(name))
  .sort();
const failed = [];

for (const test of tests) {
  console.log(`\n> ${test}`);
  const result = spawnSync(process.execPath, [`scripts/${test}`], { stdio: 'inherit' });
  if (result.status !== 0) failed.push(test);
}

if (failed.length) {
  console.error(`\n${failed.length}/${tests.length} test files failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\nAll ${tests.length} test files passed.`);
