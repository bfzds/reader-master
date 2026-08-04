import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExpertConfig } from '../app_unpacked/src/js/data/config-expert.js';

test('parses sectioned Expert configuration and ignores comments', () => {
  const entries = parseExpertConfig(`
    # comment
    root = 1
    [reader]
    fontSize = 18
    ; ignored = true
  `);

  assert.equal(entries.get('root'), '1');
  assert.equal(entries.get('reader.fontSize'), '18');
  assert.equal(entries.has('reader.ignored'), false);
});

test('queues asynchronous operations per key in order', async () => {
  const { enqueueKeyed } = await import('../app_unpacked/src/js/data/keyed-queue.js');
  const order = [];

  const first = enqueueKeyed('book-1', async () => {
    order.push('first-start');
    await new Promise(resolve => setTimeout(resolve, 5));
    order.push('first-end');
  });
  const second = enqueueKeyed('book-1', async () => order.push('second'));
  const other = enqueueKeyed('book-2', async () => order.push('other'));

  await Promise.all([first, second, other]);
  assert.deepEqual(order, ['first-start', 'other', 'first-end', 'second']);
});
