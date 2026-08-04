import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.window = new EventTarget();

const { default: storage } = await import('../app_unpacked/src/js/data/storage.js');
const { default: file } = await import('../app_unpacked/src/js/data/file.js');

test('setIndex snapshots each write so a later mutation cannot replace an earlier queued value', async () => {
  const original = storage.files.setIndex;
  const calls = [];
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  storage.files.setIndex = async index => {
    calls.push(index);
    if (calls.length === 1) await firstGate;
  };
  try {
    const first = { id: 'queue-index', content: { items: [{ title: 'first' }] }, bookmarks: [] };
    const firstSave = file.setIndex(first);
    first.content.items[0].title = 'mutated';
    first.bookmarks.push({ cursor: 1 });
    const secondSave = file.setIndex({ id: 'queue-index', content: { items: [{ title: 'second' }] }, bookmarks: [] });
    releaseFirst();
    await Promise.all([firstSave, secondSave]);

    assert.equal(calls[0].content.items[0].title, 'first');
    assert.deepEqual(calls[0].bookmarks, []);
    assert.equal(calls[1].content.items[0].title, 'second');
  } finally {
    storage.files.setIndex = original;
  }
});

test('setMeta rejects the failed save but continues with the next save for the same book', async () => {
  const original = storage.files.setMeta;
  const calls = [];
  storage.files.setMeta = async meta => {
    calls.push(meta.title);
    if (meta.title === 'first') throw new Error('first failed');
  };
  try {
    const first = file.setMeta({ id: 'queue-meta', title: 'first' }, { updateLastAccessTime: false });
    const second = file.setMeta({ id: 'queue-meta', title: 'second' }, { updateLastAccessTime: false });

    await assert.rejects(first, /first failed/);
    await second;
    assert.deepEqual(calls, ['first', 'second']);
  } finally {
    storage.files.setMeta = original;
  }
});
