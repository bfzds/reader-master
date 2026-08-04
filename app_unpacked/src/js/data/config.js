/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import storage from './storage.js';
import { parseExpertConfig } from './config-expert.js';
import { enqueueKeyed } from './keyed-queue.js';
import { reportError } from './errors.js';

const config = {};

export default config;

const EXPERT_CONFIG_NAME = 'expert';
config.EXPERT_CONFIG_NAME = EXPERT_CONFIG_NAME;

/** @type {{ name: string; listener: (newValue: any) => void }[]} */
const listenerList = [];
let expertCacheText = null;
let expertCache = null;
const getExpertEntries = function (expert) {
  const text = typeof expert === 'string' ? expert : '';
  if (text === expertCacheText && expertCache) return expertCache;
  expertCacheText = text;
  expertCache = parseExpertConfig(text);
  return expertCache;
};

/** @template {ConfigType} @type {(name: string, defaultValue: ConfigType) => Promise<ConfigType>} */
config.get = async (name, defaultValue) => {
  try {
    let value = await storage.config.getItem(name);
    return value ?? defaultValue;
  } catch (error) {
    reportError(`config.get(${name})`, error, 'warn');
    return defaultValue;
  }
};

/** @template {ConfigType} @type {(name: string, value: ConfigType) => Promise<ConfigType>} */
config.set = async (name, value) => {
  return enqueueKeyed(`config:${name}`, async () => {
    await storage.config.setItem(value, name);
    if (name === EXPERT_CONFIG_NAME) {
      expertCacheText = null;
      expertCache = null;
    }
    listenerList.slice().forEach(i => {
      if (i.name !== name) return;
      try { i.listener(value); } catch (error) { reportError(`config listener["${name}"]`, error); }
    });
    return value;
  });
};

/**
 * @param {string} key
 * @param {'number'|'string'|'boolean'|'*'} type
 * @param {T} defaultValue
 * @param {{ normalize: () => any, validator: () => any }} details
 * @returns {T}
 * @template T
 */
config.expert = async (key, type, defaultValue, { normalize, validator } = {}) => {
  /** @type {string} */
  const expert = (await config.get(config.EXPERT_CONFIG_NAME)) || '';
  const text = getExpertEntries(expert).get(key);
  let value = text == null ? defaultValue : text;
  try {
    value = JSON.parse(value);
  } catch (e) {
    // Use its string value as fallback
  }
  let result = defaultValue;
  try {
    let valid = true;
    if (type === 'number') {
      valid = typeof value === 'number' && (validator ? validator(value) : !Number.isNaN(value));
    } else if (type === 'string') {
      valid = typeof value === 'string' && (!validator || validator(value));
    } else if (type === 'boolean') {
      valid = typeof value === 'boolean' && (!validator || validator(value));
    } else {
      valid = !validator || validator(value);
    }
    if (!valid) return defaultValue;
    result = normalize ? normalize(value, defaultValue) : value;
  } catch (e) {
    // use default
  }
  return result;
};

const findListener = (name, listener) => {
  return listenerList.findIndex(i => i.name === name && i.listener === listener);
};

/** @type {(name: string, listener: (newValue: any) => void) => void} */
config.addListener = (name, listener) => {
  const pos = findListener(name, listener);
  if (pos === -1) listenerList.push({ name, listener });
};

/** @type {(name: string, listener: (newValue: any) => void) => void} */
config.removeListener = (name, listener) => {
  const pos = findListener(name, listener);
  if (pos !== -1) listenerList.splice(pos, 1);
};
