const queues = new Map();

/** Serialize asynchronous work for one key while allowing different keys to run concurrently. */
export const enqueueKeyed = function (key, operation) {
  const previous = queues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  const settled = current.finally(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  queues.set(key, settled);
  return settled;
};
