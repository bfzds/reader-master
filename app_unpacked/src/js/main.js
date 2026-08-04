/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import config from './data/config.js';
import i18n from './i18n/i18n.js';
import Router from './page/router.js';
import ListPage from './page/list/listpage.js';
import { init as initDebugLogger } from './ui/util/debug-logger.js';
import './page/common.js';

const showFatalError = function (error) {
  const detail = error?.stack || error?.message || String(error);
  const message = `tReader 閸氼垰濮╂径杈Е\n\n${detail}`;
  const pre = document.createElement('pre');
  pre.textContent = message;
  pre.style.whiteSpace = 'pre-wrap';
  pre.style.padding = '16px';
  pre.style.margin = '0';
  pre.style.fontFamily = 'Consolas, monospace';
  document.body.innerHTML = '';
  document.body.appendChild(pre);
};

const router = (async function () {
  try {
    initDebugLogger();
    const locale = await config.get('locale', 'auto');
    if (locale !== 'auto') i18n.setLocale(locale);
    Array.from(document.querySelectorAll('[data-i18n]')).forEach(element => {
      element.textContent = i18n.getMessage(element.dataset.i18n, ...element.children);
    });
    document.documentElement.lang = i18n.getMessage('locale');
  } catch (error) {
    showFatalError(error);
    throw error;
  }
}()).then(() => {
  const router = new Router({
    list: {
      matchUrl: url => url === '/',
      getUrl: () => '/',
      load: async () => new ListPage(),
    },
    read: {
      matchUrl: url => {
        if (!/\/read\/\d+/.test(url)) return null;
        const id = +url.split('/').pop();
        return id ? { id } : null;
      },
      getUrl: ({ id }) => '/read/' + id,
      load: async () => {
        const { default: ReadPage } = await import('./page/read/readpage.js');
        return new ReadPage();
      },
    },
    config: {
      matchUrl: url => /^\/settings(\/.*)?$/.test(url),
      getUrl: item => item ? `/settings/${item}` : '/settings',
      load: async () => {
        const { default: ConfigPage } = await import('./page/config/configpage.js');
        return new ConfigPage();
      },
    },
  }, '/');
  return router;
}).catch(error => {
  console.error('tReader init failed:', error);
  showFatalError(error);
  return {
    async go() { return null; },
  };
});

window.addEventListener('load', () => {
  ; (async function () {
    if (!('serviceWorker' in navigator)) return;
    const isLocalDebug = ['localhost', '127.0.0.1'].includes(location.hostname);
    if (isLocalDebug) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
      if (navigator.serviceWorker.controller) location.reload();
      return;
    }
    if (navigator.onLine === false) return;
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.register('./sw.js');
      reg.update();
    }
  }()).catch(() => {
    // Service Worker may be rejected due to not supported, privacy setting, ect.
  });
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', async event => {
    if (event.data.action === 'import') {
      /** @type {ListPage} */
      const page = await (await router).go('list');
      await page.importFile(event.data.file);
    }
  });
}
