/** Convert arbitrary rejected values into a useful Error for logging and UI boundaries. */
export const normalizeError = function (value, fallbackMessage = 'Unknown error') {
  if (value instanceof Error) return value;
  if (typeof value === 'string' && value.trim()) return new Error(value);
  return new Error(fallbackMessage);
};

export const reportError = function (scope, value, level = 'error') {
  const error = normalizeError(value, `${scope} failed`);
  const logger = typeof console[level] === 'function' ? console[level] : console.error;
  logger.call(console, `${scope}:`, error);
  return error;
};
