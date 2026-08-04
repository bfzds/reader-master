import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';
import {
  createControlledClock,
  createControlledWorkerFactory,
  createResourceUrlTracker,
  createTestDatabase,
  createZipFactory,
} from './test-fixtures.mjs';
import { waitForRequest, waitForTransaction } from './test-test-helpers.mjs';

test('test database helper creates isolated databases and removes them during cleanup', async () => {
  const first = await createTestDatabase(indexedDB, {
    version: 1,
    upgrade(database) {
      database.createObjectStore('items');
    },
  });
  const second = await createTestDatabase(indexedDB, { version: 1 });

  assert.notEqual(first.name, second.name);
  assert.ok(first.db.objectStoreNames.contains('items'));

  await first.cleanup();
  await second.cleanup();
});

test('controlled worker factory exposes message, error, and no-response states', () => {
  const workers = createControlledWorkerFactory();
  const worker = new workers.Worker('worker.js');
  let received = null;
  let errors = 0;

  worker.addEventListener('message', event => { received = event.data; });
  worker.addEventListener('error', () => { errors++; });
  worker.postMessage({ input: 'value' });
  worker.emitMessage({ output: 'value' });
  worker.emitError(new Error('failed'));

  assert.deepEqual(worker.messages, [{ input: 'value' }]);
  assert.deepEqual(received, { output: 'value' });
  assert.equal(errors, 1);
  assert.equal(workers.created.length, 1);
});

test('controlled clock runs due callbacks once and ignores cleared timers', () => {
  const clock = createControlledClock();
  const calls = [];
  const cancelled = clock.setTimeout(() => calls.push('cancelled'), 10);
  clock.setTimeout(() => calls.push('due'), 5);
  clock.clearTimeout(cancelled);

  clock.advance(5);
  clock.advance(5);

  assert.deepEqual(calls, ['due']);
});

test('resource URL tracker records creation and revoke calls', () => {
  const urls = createResourceUrlTracker();
  const first = urls.createObjectURL({ name: 'first' });
  const second = urls.createObjectURL({ name: 'second' });

  urls.revokeObjectURL(first);

  assert.deepEqual(urls.created, [first, second]);
  assert.deepEqual(urls.revoked, [first]);
});

test('zip factory supplies files with controllable async payloads', async () => {
  const JSZip = createZipFactory({
    'chapter.xhtml': '<p>chapter</p>',
  });
  const zip = await JSZip.loadAsync(new Uint8Array([1]));

  assert.equal(await zip.file('chapter.xhtml').async('text'), '<p>chapter</p>');
  assert.equal(zip.file('missing.xhtml'), null);
});

test('IndexedDB event helpers expose request results and transaction completion', async () => {
  const request = new EventTarget();
  request.result = { id: 7 };
  const transaction = new EventTarget();

  const result = waitForRequest(request);
  request.dispatchEvent(new Event('success'));
  assert.deepEqual(await result, { id: 7 });

  const completed = waitForTransaction(transaction);
  transaction.dispatchEvent(new Event('complete'));
  await completed;
});
