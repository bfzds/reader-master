import assert from 'node:assert/strict';
import test from 'node:test';
import { WORKER_TIMEOUT, runWorker } from '../app_unpacked/src/js/text/worker-runner.js';
import { createControlledClock, createControlledWorkerFactory } from './test-fixtures.mjs';

test('worker runner resolves the first message and terminates the worker', async () => {
  const workers = createControlledWorkerFactory();
  const result = runWorker({
    url: 'worker.js',
    message: { input: 'value' },
    fallback: null,
    workerFactory: url => new workers.Worker(url),
  });
  const worker = workers.created[0];

  worker.emitMessage({ output: 'value' });

  assert.deepEqual(await result, { output: 'value' });
  assert.deepEqual(worker.messages, [{ input: 'value' }]);
  assert.equal(worker.terminated, true);
});

test('worker runner returns fallback and terminates after worker errors', async () => {
  const workers = createControlledWorkerFactory();
  const warnings = [];
  const result = runWorker({
    url: 'worker.js',
    message: 'input',
    fallback: 'fallback',
    workerFactory: url => new workers.Worker(url),
    onFallback: error => warnings.push(error),
  });
  const worker = workers.created[0];
  const expected = new Error('worker failed');

  worker.emitError(expected);

  assert.equal(await result, 'fallback');
  assert.equal(worker.terminated, true);
  assert.deepEqual(warnings, [expected]);
});

test('worker runner returns fallback immediately when Worker is unavailable', async () => {
  const result = await runWorker({
    url: 'worker.js',
    message: 'input',
    fallback: 'fallback',
    workerFactory: null,
  });

  assert.equal(result, 'fallback');
});

test('worker runner uses the 10 second default timeout and clears it after settling', async () => {
  const workers = createControlledWorkerFactory();
  const clock = createControlledClock();
  const result = runWorker({
    url: 'worker.js',
    message: 'input',
    fallback: 'fallback',
    workerFactory: url => new workers.Worker(url),
    timers: clock,
  });
  const worker = workers.created[0];
  let settled = false;
  result.then(() => { settled = true; });

  clock.advance(WORKER_TIMEOUT - 1);
  await Promise.resolve();
  assert.equal(settled, false);

  clock.advance(1);
  assert.equal(await result, 'fallback');
  assert.equal(worker.terminated, true);
});

test('late worker messages after timeout cannot replace the fallback result', async () => {
  const workers = createControlledWorkerFactory();
  const clock = createControlledClock();
  const result = runWorker({
    url: 'worker.js',
    message: 'input',
    fallback: 'fallback',
    timeoutMs: 5,
    workerFactory: url => new workers.Worker(url),
    timers: clock,
  });
  const worker = workers.created[0];

  clock.advance(5);
  worker.emitMessage('late value');
  worker.emitError();

  assert.equal(await result, 'fallback');
  assert.equal(worker.terminated, true);
});
