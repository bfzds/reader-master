import assert from 'node:assert/strict';
import test from 'node:test';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { CHUNK_SIZE_BYTES, upgradeContentSchema } from '../app_unpacked/src/js/data/storage-chunks.js';
import { createTestDatabase } from './test-fixtures.mjs';
import { waitForRequest, waitForTransaction } from './test-test-helpers.mjs';

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.window = new EventTarget();

const { default: storage, runTransactionWithDatabase } = await import('../app_unpacked/src/js/data/storage.js');

const createTransaction = () => {
  const transaction = new EventTarget();
  transaction.abortCount = 0;
  transaction.abort = () => { transaction.abortCount++; };
  return transaction;
};

test('transaction rejects when a request succeeds before the transaction aborts', async () => {
  const transaction = createTransaction();
  const database = { transaction: () => transaction };
  const request = new EventTarget();
  let requestSucceeded = false;
  request.addEventListener('success', () => {
    requestSucceeded = true;
    transaction.error = new Error('later abort');
    transaction.dispatchEvent(new Event('abort'));
  });

  const result = runTransactionWithDatabase(database, ['config'], 'readwrite', () => {
    queueMicrotask(() => request.dispatchEvent(new Event('success')));
    return { value: 'request result' };
  });

  await assert.rejects(result, /later abort/);
  assert.equal(requestSucceeded, true);
});

test('transaction error and abort reject with recognizable errors', async () => {
  for (const type of ['error', 'abort']) {
    const transaction = createTransaction();
    const database = { transaction: () => transaction };
    const expected = new Error(`transaction ${type}`);
    const result = runTransactionWithDatabase(database, ['config'], 'readwrite', () => {
      queueMicrotask(() => {
        transaction.error = expected;
        transaction.dispatchEvent(new Event(type));
      });
    });

    await assert.rejects(result, error => error === expected);
  }
});

test('synchronous action throws abort the transaction and reject the caller', async () => {
  const transaction = createTransaction();
  const database = { transaction: () => transaction };
  const expected = new Error('action failed');

  await assert.rejects(
    runTransactionWithDatabase(database, ['config'], 'readwrite', () => { throw expected; }),
    error => error === expected,
  );
  assert.equal(transaction.abortCount, 1);
});

test('fake IndexedDB rolls back a large content update after an aborted transaction', async () => {
  const database = await createTestDatabase(indexedDB, {
    version: 1,
    upgrade(db) {
      db.createObjectStore('content');
      upgradeContentSchema(db);
    },
  });
  try {
    const setup = database.db.transaction(['content'], 'readwrite');
    setup.objectStore('content').put('old content', 1);
    await waitForTransaction(setup);

    const transaction = database.db.transaction(['content', 'contentChunks'], 'readwrite');
    const contentRequest = transaction.objectStore('content').put({
      storage: 'chunks',
      chunkCount: 2,
      textBytes: CHUNK_SIZE_BYTES + 1,
      resources: null,
    }, 1);
    contentRequest.addEventListener('success', () => transaction.abort(), { once: true });
    transaction.objectStore('contentChunks').put({ bookId: 1, chunkIndex: 0, text: 'new chunk' });

    await assert.rejects(waitForTransaction(transaction), error => error instanceof Error);

    const read = database.db.transaction(['content', 'contentChunks'], 'readonly');
    const content = await waitForRequest(read.objectStore('content').get(1));
    const chunks = await waitForRequest(read.objectStore('contentChunks').getAll(IDBKeyRange.bound([1, 0], [1, Number.MAX_SAFE_INTEGER])));
    await waitForTransaction(read);

    assert.equal(content, 'old content');
    assert.deepEqual(chunks, []);
  } finally {
    await database.cleanup();
  }
});

test('storage request errors reject the caller instead of reporting false success', async () => {
  const first = { title: 'first book' };
  await storage.files.add(first, 'first content');

  await assert.rejects(
    storage.files.add({ id: first.id, title: 'duplicate book' }, 'second content'),
    error => error instanceof Error,
  );
});

test('storage writes small, large, and empty content while clearing old chunks', async () => {
  const meta = { title: 'content transitions' };
  await storage.files.add(meta, 'initial');
  const id = meta.id;
  const large = 'text'.repeat(Math.ceil((CHUNK_SIZE_BYTES + 1) / 4));

  await storage.files.setContent('small', id);
  assert.equal(await storage.files.getContent(id), 'small');

  await storage.files.setContent(large, id);
  assert.equal(await storage.files.getContent(id), large);

  await storage.files.setContent('', id);
  assert.equal(await storage.files.getContent(id), '');

  const request = indexedDB.open('reader');
  const db = await waitForRequest(request);
  try {
    const transaction = db.transaction('contentChunks', 'readonly');
    const chunks = await waitForRequest(transaction.objectStore('contentChunks').getAll(
      IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
    ));
    await waitForTransaction(transaction);
    assert.deepEqual(chunks, []);
  } finally {
    db.close();
  }
});
