export const MAX_DEBUG_LOG_ENTRIES = 500;

export const formatDebugArgument = function (value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch (_error) {
    return String(value);
  }
};

export const formatDebugMessage = function (args) {
  return args.map(formatDebugArgument).join(' ');
};

export const appendDebugEntry = function (entries, entry, limit = MAX_DEBUG_LOG_ENTRIES) {
  const maxEntries = Number.isInteger(limit) && limit > 0 ? limit : MAX_DEBUG_LOG_ENTRIES;
  return entries.concat(entry).slice(-maxEntries);
};

export const normalizeDebugLoggerPosition = function (value) {
  if (!value || !Number.isFinite(value.left) || !Number.isFinite(value.top)) return null;
  return { left: value.left, top: value.top };
};

export const clampDebugLoggerPosition = function ({
  left,
  top,
  width,
  height,
  viewportWidth,
  viewportHeight,
  margin = 10,
}) {
  const maxLeft = Math.max(margin, viewportWidth - width - margin);
  const maxTop = Math.max(margin, viewportHeight - height - margin);
  return {
    left: Math.min(Math.max(margin, left), maxLeft),
    top: Math.min(Math.max(margin, top), maxTop),
  };
};
