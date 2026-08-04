import config from '../data/config.js';
import runtime from './runtime.js';

const importFolder = {};

export default importFolder;

const getIdKey = handleKey => `${handleKey}_id`;
const getNameKey = handleKey => `${handleKey}_name`;

const mimeByExt = {
  '.txt': 'text/plain',
  '.gz': 'application/gzip',
  '.epub': 'application/epub+zip',
};

const extname = function (name) {
  const matched = /\.[^.]+$/.exec(String(name || '').toLowerCase());
  return matched ? matched[0] : '';
};

const guessMimeType = function (name, fallback = '') {
  return mimeByExt[extname(name)] || fallback || '';
};

const toUint8Array = async function (bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) {
    return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  if (Array.isArray(bytes)) return Uint8Array.from(bytes);
  if (bytes?.arrayBuffer) return new Uint8Array(await bytes.arrayBuffer());
  return new Uint8Array();
};

const toSerializableBytes = async function (bytes) {
  return Array.from(await toUint8Array(bytes));
};

const ensurePermission = async function (handle, mode = 'readwrite') {
  let permission = 'granted';
  if (handle?.queryPermission) permission = await handle.queryPermission({ mode });
  if (permission !== 'granted' && handle?.requestPermission) {
    permission = await handle.requestPermission({ mode });
  }
  return permission === 'granted';
};

const createFileFromEntry = async function (entry) {
  if (entry instanceof File) return entry;
  const bytes = await toUint8Array(entry?.bytes);
  const name = String(entry?.name || 'book.txt');
  const type = guessMimeType(name, entry?.type || '');
  const lastModified = Number(entry?.lastModified || entry?.modified || Date.now());
  return new File([bytes], name, { type, lastModified });
};

importFolder.supported = function () {
  return runtime.supportTauri() || 'showDirectoryPicker' in window;
};

importFolder.getSelection = async function (handleKey = 'import_save_folder_handle') {
  const invoke = runtime.getTauriInvoker();
  if (invoke) {
    const result = await invoke('get_import_folder_selection');
    if (!result) return { handle: null, folderId: null };
    await config.set(getIdKey(handleKey), result.id || null);
    await config.set(getNameKey(handleKey), result.name || null);
    return { handle: null, folderId: result.id || null };
  }
  const [handle, folderId] = await Promise.all([
    config.get(handleKey, null),
    config.get(getIdKey(handleKey), null),
  ]);
  return { handle, folderId };
};

importFolder.pick = async function (handleKey = 'import_save_folder_handle') {
  const invoke = runtime.getTauriInvoker();
  if (invoke) {
    const result = await invoke('pick_import_folder');
    if (!result) return null;
    await config.set(handleKey, null);
    await config.set(getIdKey(handleKey), result.id || null);
    await config.set(getNameKey(handleKey), result.name || null);
    return {
      handle: null,
      folderId: result.id || null,
      name: result.name || null,
    };
  }
  if (!('showDirectoryPicker' in window)) return null;
  const handle = await window.showDirectoryPicker();
  if (!handle) return null;
  await config.set(handleKey, handle);
  await config.set(getIdKey(handleKey), null);
  await config.set(getNameKey(handleKey), handle.name || null);
  return { handle, folderId: null, name: handle.name || null };
};

importFolder.saveFile = async function ({ name, bytes, handleKey = 'import_save_folder_handle' }) {
  const { handle, folderId } = await importFolder.getSelection(handleKey);
  const invoke = runtime.getTauriInvoker();
  if (folderId && invoke) {
    return Boolean(await invoke('save_file_to_folder', {
      folderId,
      name,
      bytes: await toSerializableBytes(bytes),
    }));
  }
  if (!handle || typeof handle.getFileHandle !== 'function') return false;
  if (!await ensurePermission(handle, 'readwrite')) return false;
  const fileHandle = await handle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(await toUint8Array(bytes));
  await writable.close();
  return true;
};

importFolder.listFiles = async function (handleKey = 'import_save_folder_handle') {
  const { handle, folderId } = await importFolder.getSelection(handleKey);
  const invoke = runtime.getTauriInvoker();
  if (folderId && invoke) return invoke('list_import_folder_books', { folderId });
  if (!handle || typeof handle.values !== 'function') return [];
  const files = [];
  for await (const entry of handle.values()) {
    if (entry.kind === 'file') files.push(await entry.getFile());
  }
  return files;
};

importFolder.readFile = async function ({ name, handleKey = 'import_save_folder_handle', folderId: requestedFolderId = undefined }) {
  const selection = await importFolder.getSelection(handleKey);
  const folderId = requestedFolderId || selection.folderId;
  const handle = requestedFolderId ? null : selection.handle;
  const invoke = runtime.getTauriInvoker();
  if (folderId && invoke) {
    return createFileFromEntry(await invoke('read_file_in_folder', { folderId, name }));
  }
  if (!handle || typeof handle.getFileHandle !== 'function') return null;
  const fileHandle = await handle.getFileHandle(name);
  return fileHandle.getFile();
};

importFolder.deleteFile = async function ({ name, handleKey = 'import_save_folder_handle', folderId: requestedFolderId = undefined }) {
  if (!name) return false;
  const selection = await importFolder.getSelection(handleKey);
  const folderId = requestedFolderId || selection.folderId;
  const handle = requestedFolderId ? null : selection.handle;
  const invoke = runtime.getTauriInvoker();
  if (folderId && invoke) return Boolean(await invoke('delete_file_in_folder', { folderId, name }));
  if (!handle || typeof handle.removeEntry !== 'function') return false;
  if (!await ensurePermission(handle, 'readwrite')) return false;
  await handle.removeEntry(name, { recursive: false });
  return true;
};
