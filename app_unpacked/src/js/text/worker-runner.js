export const WORKER_TIMEOUT = 10000;

const defaultWorkerFactory = typeof globalThis.Worker === 'function'
  ? url => new globalThis.Worker(url)
  : null;

export const runWorker = function ({
  url,
  message,
  fallback,
  timeoutMs = WORKER_TIMEOUT,
  workerFactory = defaultWorkerFactory,
  timers = globalThis,
  onFallback = null,
}) {
  return new Promise(resolve => {
    let worker = null;
    let settled = false;
    let timeoutId = null;
    const settle = value => {
      if (settled) return;
      settled = true;
      if (timeoutId != null) timers.clearTimeout(timeoutId);
      try {
        worker?.terminate();
      } catch (_ignore) {
        // A failed termination must not change the already settled result.
      }
      resolve(value);
    };
    const settleFallback = error => {
      try {
        onFallback?.(error);
      } catch (_ignore) {
        // Logging must not alter the fallback result.
      }
      settle(fallback);
    };
    if (typeof workerFactory !== 'function') {
      settleFallback(new Error('Worker is unavailable'));
      return;
    }
    try {
      worker = workerFactory(url);
      worker.addEventListener('message', event => settle(event.data));
      worker.addEventListener('error', event => settleFallback(event.error || new Error('Worker failed')));
      worker.addEventListener('messageerror', event => settleFallback(event.error || new Error('Worker message failed')));
      timeoutId = timers.setTimeout(() => settleFallback(new Error(`Worker timed out after ${timeoutMs}ms`)), timeoutMs);
      worker.postMessage(message);
    } catch (error) {
      settleFallback(error);
    }
  });
};
