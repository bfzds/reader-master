import assert from 'node:assert/strict';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

test('test runner discovers mjs and cjs test files without running other scripts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'treader-test-discovery-'));
  try {
    await copyFile(join(import.meta.dirname, 'test-all.mjs'), join(directory, 'test-all.mjs'));
    await writeFile(join(directory, 'test-discovered.mjs'), "import test from 'node:test'; test('mjs fixture', () => {});\n");
    await writeFile(join(directory, 'test-discovered.cjs'), "const test = require('node:test'); test('cjs fixture', () => {});\n");
    await writeFile(join(directory, 'test-fixtures.mjs'), "throw new Error('The runner executed a test support module');\n");
    await writeFile(join(directory, 'test-test-helpers.mjs'), "throw new Error('The runner executed a test support module');\n");
    await writeFile(join(directory, 'not-a-test.mjs'), "throw new Error('The runner executed a non-test file');\n");

    const result = spawnSync(process.execPath, [join(directory, 'test-all.mjs')], {
      encoding: 'utf8',
      windowsHide: true,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Passed test files: 2/);
    assert.doesNotMatch(result.stderr, /support module|non-test file/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
