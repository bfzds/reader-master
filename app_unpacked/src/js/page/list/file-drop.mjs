const importFileTypeSet = new Set([
  'text/plain',
  'application/gzip',
  'application/x-gzip',
  'application/epub+zip',
]);

const importFileExtensionReg = /\.(txt|gz|epub)$/i;

const mimeByExtension = {
  txt: 'text/plain',
  gz: 'application/gzip',
  epub: 'application/epub+zip',
};

export const isSupportedImportFile = function (file) {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  if (importFileTypeSet.has(type)) return true;
  return importFileExtensionReg.test(String(file.name || ''));
};

export const getDropFile = function (dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  const item = items.find(value => value?.kind === 'file');
  const itemFile = item?.getAsFile?.();
  if (itemFile) return itemFile;
  return Array.from(dataTransfer?.files || [])[0] || null;
};

export const getSupportedDropPath = function (paths) {
  return Array.from(paths || []).find(path => importFileExtensionReg.test(String(path || ''))) || null;
};

export const fileFromNativeEntry = function (entry) {
  const name = String(entry?.name || 'book.txt');
  const extension = /\.([^.]+)$/.exec(name.toLowerCase())?.[1] || 'txt';
  const bytes = Array.isArray(entry?.bytes) ? Uint8Array.from(entry.bytes) : new Uint8Array();
  return new File([bytes], name, {
    type: mimeByExtension[extension] || '',
    lastModified: Number(entry?.lastModified || Date.now()),
  });
};

export const hasFileDrop = function (dataTransfer) {
  return Array.from(dataTransfer?.items || []).some(value => value?.kind === 'file')
    || Boolean(dataTransfer?.files?.length);
};
