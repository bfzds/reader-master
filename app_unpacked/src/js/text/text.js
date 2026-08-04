/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import config from '../data/config.js';
import file from '../data/file.js';
import { createEpub, readEpub } from './epub.js';
import { runWorker } from './worker-runner.js';

const text = {};

export default text;

/** @type {Promise<boolean>} */
let compressConfigPromise = null;
const defaultEncodingList = ['utf-8', 'gbk', 'big5', 'utf-16le', 'utf-16be', 'utf-8'];
const convertTablePromiseMap = new Map();

const extractTextContent = content => typeof content === 'string' ? content : content?.text;

/**
 * 读取纯文本文件（含 gzip 压缩）。
 * @param {File} file
 * @returns {Promise<string>}
 */
const readTextFile = async function (file) {
  const loadContent = new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', async () => {
      resolve(reader.result);
    });
    reader.addEventListener('error', () => {
      reject(reader.error);
    });
    reader.readAsArrayBuffer(file);
  });
  // EXPERT_CONFIG Text encoding when try to decode, use comma split multiple encodings
  const encodingListConfigPromise = config.expert('text.encoding', 'string', '');
  const isCompress = ['application/gzip', 'application/x-gzip'].includes(file.type);
  if (isCompress) {
    compressConfigPromise = compressConfigPromise ?? new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './js/lib/pako@2.1.0/pako_inflate.min.js';
      script.addEventListener('error', () => {
        script.remove();
        reject(new Error('failed to load gzip decoder'));
      });
      script.addEventListener('load', () => { resolve(); });
      document.body.appendChild(script);
    }).catch(error => {
      compressConfigPromise = null;
      throw error;
    });
  }
  const [content, encodingListConfig] =
    await Promise.all([loadContent, encodingListConfigPromise, compressConfigPromise]);
  return new Promise((resolve, reject) => {
    let data = content;
    if (isCompress) data = window.pako.inflate(content);
    const encodingList = encodingListConfig.split(',')
      .map(encoding => encoding.trim()).filter(encoding => encoding);
    const text = [...encodingList, ...defaultEncodingList].reduce((text, encoding, index, fullList) => {
      if (text != null) return text;
      const fatal = ![encodingList.length - 1, fullList.length - 1].includes(index);
      const decoder = new TextDecoder(encoding, { fatal });
      try {
        return decoder.decode(data);
      } catch (_ignore) {
        return null;
      }
    }, null);
    if (text != null) resolve(text);
    else reject(new Error('failed to decode text file'));
  });
};

/**
 * 保持兼容的读取接口：只返回文本。
 * @param {File} file
 * @returns {Promise<string>}
 */
text.readFile = async function (file) {
  return readTextFile(file);
};

const isEpubFile = function (file) {
  return file?.type === 'application/epub+zip' || /\.epub$/i.test(file?.name || '');
};

/**
 * 读取 txt、gzip 或 epub 书籍，返回内容、标题和目录。
 * @param {File} file
 * @returns {Promise<{ title: string, content: string, index?: { template: string, items: { title: string, cursor: number }[] } }>}
 */
text.readBook = async function (file) {
  const preprocessOptions = await (async () => {
    const [maxEmptyLines, chineseConvertSetting] = await Promise.all([
      config.get('max_empty_lines', 'disable'),
      config.get('chinese_convert', 'disable'),
    ]);
    return { maxEmptyLines, chineseConvertSetting };
  })();
  if (isEpubFile(file)) {
    const book = await readEpub(file, {
      preprocessText: value => text.preprocess(value, preprocessOptions),
    });
    const title = await text.preprocess(book.title || text.parseFilename(file.name), preprocessOptions);
    const processedText = book.content?.text || '';
    const resources = book.content?.resources || {};
    return {
      ...book,
      title,
      content: { text: processedText, resources },
      source: file,
    };
  }
  const rawContent = await readTextFile(file);
  const content = await text.preprocess(rawContent, preprocessOptions);
  const rawTitle = text.parseFilename(file.name);
  const title = await text.preprocess(rawTitle, preprocessOptions);
  return { title, content };
};

text.parseFilename = function (filename) {
  return filename.replace(/\.[^.]+(?:\.gz)?$/, '');
};

text.createEditedBookFile = async function ({ title, content, sourceName }) {
  const isEpub = /\.epub$/i.test(sourceName || '');
  const filename = sourceName || `${title || 'book'}${isEpub ? '.epub' : '.txt'}`;
  if (isEpub) {
    const epub = await createEpub({ title, content });
    return new File([epub], filename, { type: 'application/epub+zip' });
  }
  const normalized = String(content || '').replace(/\r\n|\r|\n/g, '\r\n');
  return new File(['\ufeff' + normalized], filename, { type: 'text/plain;charset=utf-8' });
};

/**
 * @param {string} text
 * @returns {RegExp}
 */
text.useRegExpForContent = function (template) {
  const literal = template.match(/^\/((?:\\.|[^/])*)\/([a-zA-Z]*)$/);
  if (literal) {
    const [_, reg, flags] = literal;
    try {
      return new RegExp(reg, flags);
    } catch (e) {
      return null;
    }
  }
  if (!/[\\^$+.[\]{}()|]/.test(template)) return null;
  try {
    return new RegExp(template, 'u');
  } catch (e) {
    return null;
  }
};

text.useWildcardForContent = function (template) {
  const escape = template.replace(/./g, c => {
    if (c === ' ') return '\\s+';
    if (c === '*') return '.*';
    if (c === '?') return '.';
    return c.replace(/[-[\]{}()*+?.,\\^$|#\s]/g,
      c => `\\u${c.charCodeAt().toString(16).padStart(4, '0')}`);
  });
  return new RegExp(`^\\s*(?:${escape})`, 'u');
};

text.matchContentLine = function (matchReg, line) {
  matchReg.lastIndex = 0;
  if (matchReg.test(line)) return true;
  const trimLine = line.trimStart();
  if (trimLine === line) return false;
  matchReg.lastIndex = 0;
  return matchReg.test(trimLine);
};

/**
 * @param {string} article
 * @param {string} template
 * @param {{ maxLength: number, limit: number }} details
 */
text.generateContent = function (article, template, { maxLength, limit }) {
  let matchReg = text.useRegExpForContent(template);
  if (!matchReg) {
    matchReg = text.useWildcardForContent(template);
  }
  /** @type {{ title: string, cursor: number }[]} */
  const content = [];
  let cursor = 0;
  const limitExceed = article.split('\n').some(line => {
    let match = false;
    if (line.length <= maxLength) {
      if (text.matchContentLine(matchReg, line)) {
        if (content.length > limit) {
          return true;
        }
        content.push({
          title: line.trim(),
          cursor,
        });
      }
    }
    cursor += line.length + 1;
    return false;
  });
  if (limitExceed) return null;
  return content;
};

const convertLineEnding = function (text) {
  if (!text.includes('\r')) return text;
  return text.replace(/\r\n|\r/g, '\n');
};

const maxEmptyLine = function (text, setting) {
  if (setting === 'disable') return text;
  if (!text.includes('\n\n')) return text;
  const max = Number(setting);
  return text.replace(new RegExp(`(?:\\n\\s*){${max},}\\n`, 'g'), '\n'.repeat(max + 1));
};

const CHINESE_CONVERT_WORKER_SMALL = 5000;

const chineseConvert = async function (text, setting) {
  if (setting === 'disable') return text;
  const convertFile = setting === 's2t' ? '/data/han/s2t.json' : '/data/han/t2s.json';
  if (!convertTablePromiseMap.has(convertFile)) {
    convertTablePromiseMap.set(convertFile, fetch(convertFile).then(r => {
      if (!r.ok) {
        throw Error(`failed to load chinese convert table: ${convertFile}`);
      }
      return r.json();
    }));
  }
  const table = await convertTablePromiseMap.get(convertFile).catch(() => null);
  if (!table || !Array.isArray(table) || !table.length) return text;

  if (text.length < CHINESE_CONVERT_WORKER_SMALL) {
    return convertSync(text, table);
  }

  const data = await runWorker({
    url: './worker/convert.js',
    message: { text, table },
    fallback: text,
    onFallback: error => console.warn('Chinese conversion worker fallback:', error),
  });
  return data?.result ?? text;
};

const convertSync = function (text, table) {
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

text.preprocess = async function (text, options = null) {
  const settings = options ?? await (async () => {
    const [maxEmptyLines, chineseConvertSetting] = await Promise.all([
      config.get('max_empty_lines', 'disable'),
      config.get('chinese_convert', 'disable'),
    ]);
    return { maxEmptyLines, chineseConvertSetting };
  })();
  let output = convertLineEnding(text);
  output = maxEmptyLine(output, settings.maxEmptyLines);
  output = await chineseConvert(output, settings.chineseConvertSetting);
  return output;
};

text.guessContent = async function (content, { id, title }) {
  const textContent = extractTextContent(content);
  if (!textContent) return;
  const enabledAutoToc = await config.get('auto_toc', 'enable');
  if (enabledAutoToc !== 'enable') return;
  return runWorker({
    url: './worker/toc.js',
    message: textContent,
    fallback: undefined,
    onFallback: error => console.warn('Automatic TOC worker fallback:', error),
  }).then(content => {
    if (content?.items && Array.isArray(content.items)) {
      content.items.unshift({ title, cursor: 0 });
      Promise.resolve(file.getIndex(id)).then(currentIndex => file.setIndex({
        id,
        content,
        bookmarks: Array.isArray(currentIndex?.bookmarks) ? currentIndex.bookmarks : [],
      })).catch(error => {
        console.warn('自动目录保存失败:', error);
      });
    }
    return undefined;
  });
};
