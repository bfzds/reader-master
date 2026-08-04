import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = async path => readFile(resolve(root, path), 'utf8');

test('EPUB import accumulates chapters without repeated full-text concatenation', async () => {
  const epub = await source('app_unpacked/src/js/text/epub.js');
  assert.match(epub, /const contentChunks = \[\];/);
  assert.match(epub, /let contentLength = 0;/);
  assert.match(epub, /const cursor = contentLength;/);
  assert.match(epub, /contentChunks\.push\(text\);/);
  assert.match(epub, /contentLength \+= text\.length;/);
  assert.match(epub, /text: contentChunks\.join\(''\)/);
  assert.doesNotMatch(epub, /content \+= text;/);
});

test('read and settings pages load on demand', async () => {
  const main = await source('app_unpacked/src/js/main.js');
  assert.doesNotMatch(main, /import ReadPage from/);
  assert.doesNotMatch(main, /import ConfigPage from/);
  assert.match(main, /import\('\.\/page\/read\/readpage\.js'\)/);
  assert.match(main, /import\('\.\/page\/config\/configpage\.js'\)/);

  const router = await source('app_unpacked/src/js/page/router.js');
  assert.match(router, /async getPage\(route\)/);
  assert.match(router, /route\.loading = Promise\.resolve\(route\.load\(\)\)/);
  assert.match(router, /const target = await this\.getPage\(route\);/);
});

test('bookshelf caches metadata and batches folder duplicate checks', async () => {
  const list = await source('app_unpacked/src/js/page/list/listpage.js');
  assert.match(list, /this\.fileMetaCache = null;/);
  assert.match(list, /async getFileMetaList\(\{ force = false \} = \{\}\)/);
  assert.match(list, /return this\.enqueueImport\(\(\) => this\.refreshFolderBooksNow\(\)\);/);
  assert.match(list, /checkDuplicate: false,/);
  assert.match(list, /\}, 150\);/);
});

test('reader reflow and EPUB resources are deferred and deduplicated', async () => {
  const read = await source('app_unpacked/src/js/page/read/readpage.js');
  assert.match(read, /scheduleTextReflow\(\)/);
  assert.match(read, /if \(resized\) this\.scheduleTextReflow\(\);/);
  assert.doesNotMatch(read, /requestAnimationFrame\(\(\) => \{\s*this\.onResize\(\);/);
  assert.match(read, /async ensureResourceLoader\(\)/);
  assert.match(read, /scheduleEpubResourceWarmup\(\)/);
  assert.match(read, /if \(this\.loadImages\) this\.scheduleEpubResourceWarmup\(\);/);

  const epub = await source('app_unpacked/src/js/text/epub.js');
  assert.match(epub, /async warmup\(\)/);
  assert.match(epub, /return await getZip\(\);/);
});

test('search reuses its compiled line regular expression', async () => {
  const search = await source('app_unpacked/src/js/page/read/index/searchpage.js');
  assert.equal((search.match(/const lineReg = new RegExp\(reg\.source,/g) || []).length, 1);
  assert.match(search, /lineReg\.lastIndex = 0;/);
});

test('EPUB image URLs use scoped leases and release only disposed renders', async () => {
  const epub = await source('app_unpacked/src/js/text/epub.js');
  assert.match(epub, /async acquire\(resource\)/);
  assert.match(epub, /refs: 0,/);
  assert.match(epub, /maxIdleEntries = 64/);
  assert.match(epub, /if \(entry\.refs \|\| entry\.pending\) continue;/);

  const read = await source('app_unpacked/src/js/page/read/readpage.js');
  assert.match(read, /async acquireResourceLease\(key\)/);
  assert.match(read, /resourceLoader\?\.acquire\(resource\)/);

  const text = await source('app_unpacked/src/js/page/read/text/textpage.js');
  assert.match(text, /createResourceScope\(\)/);
  assert.match(text, /releaseResourceScope\(scope\)/);
  assert.match(text, /acquireResourceLease\(resourceKey\)/);
  assert.match(text, /scope\.leases\.set\(resourceKey, lease\)/);

  const flip = await source('app_unpacked/src/js/page/read/text/fliptextpage.js');
  assert.match(flip, /this\.releaseResourceScope\(page\.resourceScope\);/);
  assert.match(flip, /return \{ container, cursor, nextCursor, resourceScope \};/);

  const scroll = await source('app_unpacked/src/js/page/read/text/scrolltextpage.js');
  assert.match(scroll, /this\.releaseResourceScope\(trunk\.resourceScope\);/);
  assert.match(scroll, /resourceScope: this\.createResourceScope\(\)/);
});
