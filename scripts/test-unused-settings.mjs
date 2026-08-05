import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolve } from 'node:path';

const optionsPath = resolve(import.meta.dirname, '..', 'app_unpacked', 'src', 'js', 'data', 'options.js');
const helpDirectory = resolve(import.meta.dirname, '..', 'app_unpacked', 'src', 'help');
const serviceWorkerPath = resolve(import.meta.dirname, '..', 'app_unpacked', 'src', 'sw.js');

test('settings registry omits unused install and all help entries', async () => {
  const source = await readFile(optionsPath, 'utf8');

  assert.doesNotMatch(source, /id: 'app_install'/);
  assert.doesNotMatch(source, /configHelpGroupTitle/);
  assert.doesNotMatch(source, /configHelpCredits/);
  assert.doesNotMatch(source, /configHelpPrivacy/);
  assert.doesNotMatch(source, /configHelpAbout/);
});

test('does not ship obsolete help pages or cache them offline', async () => {
  const serviceWorkerSource = await readFile(serviceWorkerPath, 'utf8');

  await assert.rejects(access(helpDirectory), { code: 'ENOENT' });
  assert.doesNotMatch(serviceWorkerSource, /'\.\/help\//);
});
