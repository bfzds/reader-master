import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const cssPath = new URL('../app_unpacked/src/css/page/readpage.css', import.meta.url);

test('desktop reading controls use the legacy left and right sidebars', async () => {
  const css = await readFile(cssPath, 'utf8');

  assert.match(css, /@media\s*\(min-width:\s*768px\)/);
  assert.match(css, /\.read-control\s+\.header-line\s*\{[\s\S]*?transform:\s*rotate\(90deg\)/);
  assert.match(css, /\.read-control\s+\.footer-line\s*\{[\s\S]*?transform:\s*rotate\(-90deg\)/);
  assert.match(css, /\.read-control\s+\.header-mid\s*\{[\s\S]*?width:\s*0/);
  assert.match(css, /\.read-control\s+\.footer-line\s+\.icon-line\s*\{[\s\S]*?flex-direction:\s*row-reverse/);
});
