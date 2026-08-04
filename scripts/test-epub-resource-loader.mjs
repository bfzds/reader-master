import assert from 'node:assert/strict';
import test from 'node:test';
import { createEpubResourceLoader } from '../app_unpacked/src/js/text/epub.js';
import { createResourceUrlTracker, createZipFactory } from './test-fixtures.mjs';

const withLoader = async function (files, options, action) {
  const previousWindow = globalThis.window;
  const previousUrl = globalThis.URL;
  const urls = createResourceUrlTracker();
  globalThis.window = { JSZip: createZipFactory(files) };
  globalThis.URL = urls;
  try {
    await action(createEpubResourceLoader({ arrayBuffer: async () => new ArrayBuffer(0) }, options), urls);
  } finally {
    globalThis.window = previousWindow;
    globalThis.URL = previousUrl;
  }
};

test('concurrent acquire shares one pending resource load and preserves URLs until every lease releases', async () => {
  let reads = 0;
  const files = {
    'cover.png': () => {
      reads++;
      return new Uint8Array([1, 2, 3]).buffer;
    },
  };
  await withLoader(files, {}, async (loader, urls) => {
    const [first, second] = await Promise.all([
      loader.acquire({ path: 'cover.png', mime: 'image/png' }),
      loader.acquire({ path: 'cover.png', mime: 'image/png' }),
    ]);

    assert.equal(reads, 1);
    assert.equal(first.url, second.url);
    first.release();
    assert.deepEqual(urls.revoked, []);
    second.release();
    assert.deepEqual(urls.revoked, []);
  });
});

test('resource leases ignore repeated release calls', async () => {
  await withLoader({ 'cover.png': new Uint8Array([1]).buffer }, { maxIdleEntries: 0 }, async (loader, urls) => {
    const lease = await loader.acquire({ path: 'cover.png', mime: 'image/png' });
    lease.release();
    lease.release();

    assert.deepEqual(urls.revoked, [lease.url]);
  });
});

test('failed resources are removed so a later acquire can retry', async t => {
  const files = { 'cover.png': new Error('missing') };
  t.mock.method(console, 'warn', () => {});
  await withLoader(files, {}, async loader => {
    assert.equal(await loader.acquire({ path: 'cover.png', mime: 'image/png' }), null);
    files['cover.png'] = new Uint8Array([1]).buffer;

    const lease = await loader.acquire({ path: 'cover.png', mime: 'image/png' });
    assert.ok(lease?.url.startsWith('blob:'));
    lease.release();
  });
});

test('idle eviction only removes unreferenced completed entries', async () => {
  await withLoader({
    'first.png': new Uint8Array([1]).buffer,
    'second.png': new Uint8Array([2]).buffer,
  }, { maxIdleEntries: 1 }, async (loader, urls) => {
    const first = await loader.acquire({ path: 'first.png', mime: 'image/png' });
    first.release();
    const second = await loader.acquire({ path: 'second.png', mime: 'image/png' });
    second.release();

    assert.deepEqual(urls.revoked, [first.url]);
  });
});

test('destroy blocks new acquires and releases idle Blob URLs', async () => {
  await withLoader({ 'cover.png': new Uint8Array([1]).buffer }, {}, async (loader, urls) => {
    const lease = await loader.acquire({ path: 'cover.png', mime: 'image/png' });
    lease.release();
    loader.destroy();

    assert.deepEqual(urls.revoked, [lease.url]);
    assert.equal(await loader.acquire({ path: 'cover.png', mime: 'image/png' }), null);
  });
});
