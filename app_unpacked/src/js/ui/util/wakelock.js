/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

const wakelock = {};
export default wakelock;

wakelock.isSupport = function () {
  if (!('wakeLock' in navigator)) return false;
  // WakeLock support on iOS standalone mode is buggy before iOS 18.4
  // https://webkit.org/b/254545#c65
  const isIos = ['iPhone', 'iPad'].includes(navigator.platform);
  const isStandalone = window.navigator.standalone;
  const version = navigator.appVersion.split('OS')[1]?.match(/\d+/g)?.map(x => +x);
  const isOldVersion = version && (version[0] < 18 || version[0] === 18 && version[1] < 4);
  if (isIos && isStandalone && isOldVersion) return false;
  return true;
};

/** @type {WakeLockSentinel} */
let wakelockSentinel = null;
let requestToken = 0;
let requestPromise = null;
const onVisibilityChange = async function () {
  if (wakelockSentinel === null || document.visibilityState !== 'visible') return;
  const token = requestToken;
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    if (token !== requestToken || wakelockSentinel === null) {
      await sentinel.release().catch(() => {});
      return;
    }
    wakelockSentinel = sentinel;
  } catch (_error) {
    // Wake lock may be rejected while the document is transitioning.
  }
};
wakelock.request = function () {
  if (!wakelock.isSupport()) return Promise.resolve(null);
  if (requestPromise) return requestPromise;
  const token = ++requestToken;
  requestPromise = navigator.wakeLock.request('screen').then(sentinel => {
    if (token !== requestToken) {
      return sentinel.release().catch(() => false).then(() => null);
    }
    wakelockSentinel = sentinel;
    document.addEventListener('visibilitychange', onVisibilityChange);
    return true;
  }).catch(() => null).finally(() => {
    requestPromise = null;
  });
  return requestPromise;
};
wakelock.release = async function () {
  ++requestToken;
  const sentinel = wakelockSentinel;
  wakelockSentinel = null;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (!sentinel) return false;
  try {
    await sentinel.release();
  } catch (_error) {
    // Sentinel can already be released by the browser.
  }
  return true;
};
