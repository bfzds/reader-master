export const CHUNK_SIZE_BYTES = 1024 * 1024;

const textEncoder = new TextEncoder();

export const getContentText = content => (
  typeof content === 'string' ? content : (typeof content?.text === 'string' ? content.text : '')
);

export const getContentResources = content => (
  content && typeof content === 'object' && content.resources && typeof content.resources === 'object'
    ? content.resources
    : null
);

export const textByteLength = text => textEncoder.encode(text).byteLength;

export const splitText = function (text, maxBytes = CHUNK_SIZE_BYTES) {
  if (!Number.isInteger(maxBytes) || maxBytes <= 0) throw new RangeError('maxBytes must be a positive integer');
  if (text === '') return [''];
  const chunks = [];
  let current = '';
  let currentBytes = 0;
  for (const character of text) {
    const characterBytes = textByteLength(character);
    if (characterBytes > maxBytes) throw new RangeError('maxBytes is smaller than one Unicode code point');
    if (current && currentBytes + characterBytes > maxBytes) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }
  if (current) chunks.push(current);
  return chunks;
};

export const joinText = chunks => chunks.join('');

export const createChunkDescriptor = (content, chunks) => ({
  storage: 'chunks',
  chunkCount: chunks.length,
  textBytes: textByteLength(getContentText(content)),
  resources: getContentResources(content),
});

export const isChunkDescriptor = content => content?.storage === 'chunks' && Number.isInteger(content.chunkCount);

export const restoreChunkedContent = (descriptor, chunks) => {
  const text = joinText(chunks);
  return descriptor.resources == null ? text : { text, resources: descriptor.resources };
};

export const upgradeContentSchema = db => {
  if (!db.objectStoreNames.contains('contentChunks')) {
    db.createObjectStore('contentChunks', { keyPath: ['bookId', 'chunkIndex'] });
  }
};
