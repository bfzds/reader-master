import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const entries = await readdir(scriptDirectory, { withFileTypes: true });
const supportModules = new Set(['test-fixtures.mjs', 'test-test-helpers.mjs']);
const testFiles = entries
  .filter(entry => entry.isFile()
    && entry.name !== 'test-all.mjs'
    && !supportModules.has(entry.name)
    && /^test-.*\.(?:mjs|cjs)$/.test(entry.name))
  .map(entry => entry.name)
  .sort();

let failed = 0;
for (const testFile of testFiles) {
  const result = spawnSync(process.execPath, ['--test', join(scriptDirectory, testFile)], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) failed++;
}

if (failed) {
  console.error(`Failed test files: ${failed}`);
  process.exitCode = 1;
} else {
  console.log(`Passed test files: ${testFiles.length}`);
}
