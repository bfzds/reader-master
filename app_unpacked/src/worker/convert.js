/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

self.addEventListener('message', async (event) => {
  const { text, table } = event.data;
  try {
    const result = convert(text, table);
    self.postMessage({ result });
  } catch (e) {
    self.postMessage({ error: e.message });
  }
});

const convert = function (text, table) {
  if (!table || !Array.isArray(table) || !table.length) return text;
  let output = '';
  let state = 0;
  const hasOwnProperty = Object.prototype.hasOwnProperty;
  for (const char of text) {
    while (true) {
      const current = table[state];
      const hasMatch = hasOwnProperty.call(current, char);
      if (!hasMatch && state === 0) {
        output += char;
        break;
      }
      if (hasMatch) {
        const [adding, next] = current[char];
        if (adding) output += adding;
        state = next;
        break;
      }
      const [adding, next] = current[''];
      if (adding) output += adding;
      state = next;
    }
  }
  while (state !== 0) {
    const current = table[state];
    const [adding, next] = current[''];
    if (adding) output += adding;
    state = next;
  }
  return output;
};