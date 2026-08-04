const asError = (value, message) => value instanceof Error ? value : new Error(message);

export const waitForRequest = request => new Promise((resolve, reject) => {
  request.addEventListener('success', () => resolve(request.result), { once: true });
  request.addEventListener('error', () => reject(asError(request.error, 'IndexedDB request failed')), { once: true });
});

export const waitForTransaction = transaction => new Promise((resolve, reject) => {
  transaction.addEventListener('complete', resolve, { once: true });
  transaction.addEventListener('error', () => reject(asError(transaction.error, 'IndexedDB transaction failed')), { once: true });
  transaction.addEventListener('abort', () => reject(asError(transaction.error, 'IndexedDB transaction aborted')), { once: true });
});
