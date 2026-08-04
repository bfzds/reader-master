export const createMigrationEntry = async function (
  baseEntry,
  content,
  source,
  { includeContent = false, includeSource = false, serializeSource = null } = {},
) {
  const entry = { ...baseEntry };
  if (includeContent && content != null) entry.content = content;
  if (includeSource && source && typeof serializeSource === 'function') {
    const serializedSource = await serializeSource(source);
    if (serializedSource) entry.source = serializedSource;
  }
  return entry;
};

export const createMigrationSavePayload = function (json) {
  return { content: String(json) };
};

export const reportMigrationProgress = async function (onProgress, progress) {
  if (typeof onProgress !== 'function') return;
  await onProgress(progress);
  if (shouldYieldMigrationProgress(progress)) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

export const shouldYieldMigrationProgress = function ({ current } = {}) {
  return current === 0 || (Number.isInteger(current) && current > 0 && current % 10 === 0);
};
