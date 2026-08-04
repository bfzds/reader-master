import assert from 'node:assert/strict';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import test from 'node:test';
import {
  CHUNK_SIZE_BYTES,
  createChunkDescriptor,
  joinText,
  splitText,
  upgradeContentSchema,
} from '../app_unpacked/src/js/data/storage-chunks.js';

test('splitText and joinText preserve Unicode text under a byte limit', () => {
  const text = 'a中😀b'.repeat(20);
  const chunks = splitText(text, 16);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => new TextEncoder().encode(chunk).byteLength <= 16));
  assert.equal(joinText(chunks), text);
});

test('chunk descriptor records UTF-8 size and structured resources', () => {
  const content = { text: '大书'.repeat(10), resources: { cover: { path: 'cover.png' } } };
  const chunks = splitText(content.text, 8);
  assert.deepEqual(createChunkDescriptor(content, chunks), {
    storage: 'chunks',
    chunkCount: chunks.length,
    textBytes: new TextEncoder().encode(content.text).byteLength,
    resources: content.resources,
  });
  assert.equal(CHUNK_SIZE_BYTES, 1024 * 1024);
});

test('v3 schema creates contentChunks with a compound key', async () => {
  const name = `storage-chunks-${Date.now()}`;
  const request = indexedDB.open(name, 3);
  request.addEventListener('upgradeneeded', () => upgradeContentSchema(request.result));
  const db = await new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () => reject(request.error));
  });
  assert.ok(db.objectStoreNames.contains('contentChunks'));
  const transaction = db.transaction('contentChunks', 'readwrite');
  transaction.objectStore('contentChunks').put({ bookId: 7, chunkIndex: 0, text: 'chunk' });
  await new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve);
    transaction.addEventListener('error', () => reject(transaction.error));
    transaction.addEventListener('abort', () => reject(transaction.error));
  });
  const readTransaction = db.transaction('contentChunks', 'readonly');
  const readRequest = readTransaction.objectStore('contentChunks').get([7, 0]);
  const row = await new Promise((resolve, reject) => {
    readRequest.addEventListener('success', () => resolve(readRequest.result));
    readRequest.addEventListener('error', () => reject(readRequest.error));
  });
  assert.deepEqual(row, { bookId: 7, chunkIndex: 0, text: 'chunk' });
  db.close();
  void IDBKeyRange;
});
