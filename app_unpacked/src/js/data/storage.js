/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import i18n from '../i18n/i18n.js';
import {
  CHUNK_SIZE_BYTES,
  createChunkDescriptor,
  getContentText,
  isChunkDescriptor,
  restoreChunkedContent,
  splitText,
  textByteLength,
  upgradeContentSchema,
} from './storage-chunks.js';
import { reportError } from './errors.js';
import modal from '../ui/component/modal.js';

const storage = {};

export default storage;

/** @type {Promise<IDBDatabase>} */
const DB_VERSION = 3;

const storageError = (message, cause = null) => {
  const error = cause instanceof Error ? cause : new Error(message);
  if (cause && !(cause instanceof Error)) error.cause = cause;
  return error;
};

const dbPromise = new Promise((resolve, reject) => {
  let settled = false;
  const fail = (message, cause) => {
    if (settled) return;
    settled = true;
    void modal.alert(i18n.getMessage('storageOpenFail'), {
      title: i18n.getMessage('modalTitle'),
      closeText: i18n.getMessage('modalClose'),
    }).catch(error => console.warn('Storage notification failed:', error));
    reject(storageError(message, cause));
  };
  let request;
  try {
    request = indexedDB.open('reader', DB_VERSION);
  } catch (error) {
    fail('Unable to open storage', error);
    return;
  }
  request.addEventListener('upgradeneeded', () => {
    const db = request.result;
    if (!db.objectStoreNames.contains('content')) db.createObjectStore('content');
    if (!db.objectStoreNames.contains('index')) db.createObjectStore('index', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
    if (!db.objectStoreNames.contains('list')) db.createObjectStore('list', { keyPath: 'id', autoIncrement: true });
    if (!db.objectStoreNames.contains('source')) db.createObjectStore('source');
    upgradeContentSchema(db);
  });
  request.addEventListener('success', () => {
    if (settled) {
      request.result?.close();
      return;
    }
    settled = true;
    const db = request.result;
    db.addEventListener('versionchange', () => db.close());
    resolve(db);
  });
  request.addEventListener('blocked', () => fail('Storage upgrade is blocked'));
  request.addEventListener('error', () => fail('Unable to open storage', request.error));
});

// Keep a failed open from becoming an unhandled rejection while preserving the
// same rejection for every operation that awaits dbPromise.
dbPromise.catch(() => {});
dbPromise.then(db => {
  window.addEventListener('beforeunload', () => db.close());
}).catch(() => {});

const getDatabase = async () => {
  const db = await dbPromise;
  if (!db) throw new Error('Storage unavailable');
  return db;
};

const transactionFailure = transaction => transaction.error || new Error('IndexedDB transaction failed');

/**
 * Run a transaction and settle only after commit. Requests can succeed before
 * the transaction later aborts, so callers must never resolve on request success.
 */
export const runTransactionWithDatabase = function (db, stores, mode, action) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(stores, mode);
    } catch (error) {
      reject(error);
      return;
    }
    let result;
    let settled = false;
    const rejectTransaction = error => {
      if (settled) return;
      settled = true;
      reject(error || transactionFailure(transaction));
    };
    transaction.addEventListener('error', () => rejectTransaction(transactionFailure(transaction)));
    transaction.addEventListener('abort', () => rejectTransaction(transactionFailure(transaction)));
    transaction.addEventListener('complete', () => {
      if (settled) return;
      settled = true;
      resolve(result && Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : result);
    });
    try {
      result = action(transaction);
    } catch (error) {
      try { transaction.abort(); } catch (_ignore) { }
      rejectTransaction(error);
    }
  });
};

const runTransaction = async function (stores, mode, action) {
  return runTransactionWithDatabase(await getDatabase(), stores, mode, action);
};

const requestResult = request => {
  request.addEventListener('success', () => {});
  request.addEventListener('error', () => {});
  return request;
};

const chunkRange = id => IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);

const clearContentChunks = (transaction, id) => {
  // Updates can shrink a book, so remove every old chunk before writing the new shape.
  const request = transaction.objectStore('contentChunks').openCursor(chunkRange(id));
  request.addEventListener('success', () => {
    const cursor = request.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  });
  requestResult(request);
};

const writeContent = (transaction, id, content) => {
  clearContentChunks(transaction, id);
  const text = getContentText(content);
  const contentStore = transaction.objectStore('content');
  if (textByteLength(text) <= CHUNK_SIZE_BYTES) {
    contentStore.put(content, id);
    return;
  }
  const chunks = splitText(text);
  contentStore.put(createChunkDescriptor(content, chunks), id);
  const chunkStore = transaction.objectStore('contentChunks');
  chunks.forEach((chunk, chunkIndex) => {
    chunkStore.put({ bookId: id, chunkIndex, text: chunk });
  });
};

const files = {};
storage.files = files;

files.add = async function (meta, content, source = null) {
  return runTransaction(['content', 'contentChunks', 'list', 'index', 'source'], 'readwrite', transaction => {
    const listRequest = requestResult(transaction.objectStore('list').add(meta));
    listRequest.addEventListener('success', () => {
      const id = meta.id = listRequest.result;
      writeContent(transaction, id, content);
      transaction.objectStore('index').add({ id });
      if (source != null) transaction.objectStore('source').add(source, id);
    });
    return meta;
  });
};

files.remove = async function (id) {
  await runTransaction(['content', 'contentChunks', 'list', 'index', 'source'], 'readwrite', transaction => {
    transaction.objectStore('list').delete(id);
    transaction.objectStore('content').delete(id);
    clearContentChunks(transaction, id);
    transaction.objectStore('index').delete(id);
    transaction.objectStore('source').delete(id);
  });
};

const createStoreOperation = function (type, actionType) {
  const action = {
    get: (store, id) => store.get(id),
    put: (store, ...param) => store.put(...param),
    getAll: store => store.getAll(),
  }[actionType];
  const mode = actionType === 'put' ? 'readwrite' : 'readonly';
  return async function (...param) {
    return runTransaction([type], mode, transaction => {
      const holder = { value: undefined };
      const request = requestResult(action(transaction.objectStore(type), ...param));
      request.addEventListener('success', () => {
        holder.value = request.result;
      });
      return holder;
    });
  };
};

files.list = createStoreOperation('list', 'getAll');
files.getContent = async function (id) {
  const content = await runTransaction(['content', 'contentChunks'], 'readonly', transaction => {
    const holder = { value: undefined };
    const contentRequest = requestResult(transaction.objectStore('content').get(id));
    contentRequest.addEventListener('success', () => {
      if (!isChunkDescriptor(contentRequest.result)) {
        holder.value = contentRequest.result;
        return;
      }
      const chunksRequest = requestResult(transaction.objectStore('contentChunks').getAll(chunkRange(id)));
      chunksRequest.addEventListener('success', () => {
        holder.value = restoreChunkedContent(
          contentRequest.result,
          chunksRequest.result.sort((a, b) => a.chunkIndex - b.chunkIndex).map(chunk => chunk.text),
        );
      });
    });
    return holder;
  });
  if (!isChunkDescriptor(content) && textByteLength(getContentText(content)) > CHUNK_SIZE_BYTES) {
    // Preserve the first read of a v2 book; a failed rewrite can be retried next time.
    queueMicrotask(() => files.setContent(id, content).catch(error => {
      reportError(`content migration(${id})`, error, 'warn');
    }));
  }
  return content;
};
files.setContent = async function (content, id) {
  await runTransaction(['content', 'contentChunks'], 'readwrite', transaction => {
    writeContent(transaction, id, content);
  });
};
files.getMeta = createStoreOperation('list', 'get');
files.setMeta = createStoreOperation('list', 'put');
files.getIndex = createStoreOperation('index', 'get');
files.setIndex = createStoreOperation('index', 'put');
files.getSource = createStoreOperation('source', 'get');
files.setSource = createStoreOperation('source', 'put');

/** Update all book records atomically, including optional content/source. */
files.updateBook = async function (id, content, meta, index, source) {
  await runTransaction(['content', 'contentChunks', 'list', 'index', 'source'], 'readwrite', transaction => {
    writeContent(transaction, id, content);
    transaction.objectStore('list').put({ ...meta, id });
    transaction.objectStore('index').put({ ...index, id });
    if (source !== undefined) transaction.objectStore('source').put(source, id);
  });
};

files.updateState = async function (id, meta, index) {
  await runTransaction(['list', 'index'], 'readwrite', transaction => {
    transaction.objectStore('list').put({ ...meta, id });
    transaction.objectStore('index').put({ ...index, id });
  });
};

const config = {};
storage.config = config;
config.getItem = createStoreOperation('config', 'get');
config.setItem = createStoreOperation('config', 'put');
config.getAllEntries = async function () {
  return runTransaction(['config'], 'readonly', transaction => {
    const store = transaction.objectStore('config');
    const keysRequest = requestResult(store.getAllKeys());
    const valuesRequest = requestResult(store.getAll());
    const holder = { value: [] };
    let keys = null;
    let values = null;
    const finish = () => {
      if (keys && values) holder.value = keys.map((key, index) => [key, values[index]]);
    };
    keysRequest.addEventListener('success', () => { keys = keysRequest.result; finish(); });
    valuesRequest.addEventListener('success', () => { values = valuesRequest.result; finish(); });
    return holder;
  });
};
