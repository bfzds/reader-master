export const getImportedBookSource = function (book, sourceFile) {
  return book?.source || sourceFile || null;
};

export const getMigrationSourceForExport = async function (meta, source, resolveSource) {
  if (source || typeof resolveSource !== 'function') return source || null;
  return resolveSource(meta) || null;
};

export const shouldResolveMigrationSource = function (entry) {
  const content = entry?.content;
  const hasContent = typeof content === 'string'
    ? content.length > 0
    : typeof content?.text === 'string' && content.text.length > 0;
  if (hasContent || entry?.source) return false;
  return Boolean(entry?.meta?.sourceFolderId && entry?.meta?.sourceName);
};

const bytesToBase64 = function (bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

export const getMigrationSourceBytes = function (source) {
  if (Array.isArray(source?.bytes)) return source.bytes;
  if (typeof source?.base64 !== 'string') return null;
  const binary = atob(source.base64);
  return Array.from(binary, character => character.charCodeAt(0));
};

export const serializeMigrationSource = async function (source) {
  if (!source?.arrayBuffer) return null;
  const bytes = new Uint8Array(await source.arrayBuffer());
  return {
    name: source.name || null,
    type: source.type || 'application/octet-stream',
    lastModified: Number(source.lastModified) || 0,
    base64: bytesToBase64(bytes),
  };
};

const getMigrationContentText = function (content) {
  if (typeof content === 'string') return content;
  return typeof content?.text === 'string' ? content.text : '';
};

const getMigrationTextFileName = function (name) {
  if (/\.txt$/i.test(name)) return name;
  return name.replace(/\.(?:gz|epub)$/i, '') + '.txt';
};

export const getMigrationSourceSaveRequest = function (entry) {
  const bytes = getMigrationSourceBytes(entry?.source);
  if (Array.isArray(bytes) && bytes.length > 0) {
    const name = typeof entry.source.name === 'string' && entry.source.name
      ? entry.source.name
      : entry.meta?.sourceName;
    if (typeof name !== 'string' || !name) return null;
    return { name, bytes };
  }
  const content = getMigrationContentText(entry?.content);
  const sourceName = typeof entry?.meta?.sourceName === 'string' && entry.meta.sourceName
    ? entry.meta.sourceName
    : entry?.identity?.sourceName;
  if (!content || typeof sourceName !== 'string' || !sourceName) return null;
  return {
    name: getMigrationTextFileName(sourceName),
    bytes: Array.from(new TextEncoder().encode(content)),
  };
};
