/*
 * Parse the line-oriented Expert configuration without coupling it to storage.
 */
export const parseExpertConfig = function (expert) {
  const entries = new Map();
  let section = '';
  const text = typeof expert === 'string' ? expert : '';
  text.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (/^\[.*\]$/.test(trimmed)) {
      section = trimmed.slice(1, -1).trim();
      return;
    }
    if (!trimmed || /^[;#]/.test(trimmed) || !line.includes('=')) return;
    const separator = line.indexOf('=');
    const name = line.slice(0, separator).trim();
    if (!name) return;
    entries.set(section ? `${section}.${name}` : name, line.slice(separator + 1).trim());
  });
  return entries;
};
