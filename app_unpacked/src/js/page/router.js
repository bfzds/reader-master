/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import i18n from '../i18n/i18n.js';
import Page from './page.js';
import config from '../data/config.js';

export default class Router {
  constructor(pages, fallback) {
    /** @type {{[id: string]: { matchUrl: (url: string) => unknown, getUrl: (param?: unknown) => string, load: () => Promise<Page>, page?: Page, loading?: Promise<Page> }}} */
    this.pages = pages;
    this.fallback = fallback;
    window.addEventListener('hashchange', event => {
      this.update();
    });
    document.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a');
      if (!link) return;
      const hash = link.hash;
      const url = new URL(location.hash, link.href);
      if (url.href === location.href && hash) {
        this.hashTo(hash);
        event.preventDefault();
      }
    });
    this.initial();
  }
  go(id, param) {
    const url = this.pages[id].getUrl(param);
    return this.hashTo('#!' + url);
  }
  async getPage(route) {
    if (route.page) return route.page;
    if (!route.loading) {
      route.loading = Promise.resolve(route.load()).then(page => {
        page.setRouter(this);
        route.page = page;
        return page;
      });
    }
    return route.loading;
  }
  async initial() {
    this.setTitle();
    const path = await config.get('path', '#!' + this.fallback);
    this.hashTo(path);
  }
  /** @returns {Page} */
  async update() {
    // Hash changes can arrive while a page is still activating. Serialize
    // transitions so an old activation cannot outlive its page lifecycle.
    const update = this.updateQueue = (this.updateQueue || Promise.resolve()).then(
      () => this.updateCurrent()
    );
    return update;
  }
  async updateCurrent() {
    this.page = null;
    const hash = location.hash;
    if (!hash.startsWith('#!')) {
      window.history.replaceState(null, null, '#!' + this.fallback);
      return this.updateCurrent();
    }
    const url = hash.slice(2);
    const routes = [...Object.values(this.pages)];
    const route = routes.find(route => route.matchUrl(url));
    if (!route) {
      window.history.replaceState(null, null, '#!' + this.fallback);
      return this.updateCurrent();
    }
    const target = await this.getPage(route);
    for (const currentRoute of routes) {
      const page = currentRoute.page;
      if (page?.isActive() && page !== target) await page.inactivate();
    }
    await target.activate(route.matchUrl(url));
    this.page = target;
    return target;
  }
  goFallback() {
    const hash = '#!' + this.fallback;
    window.history.replaceState(null, null, hash);
    return this.update();
  }
  async hashTo(hash) {
    window.history.replaceState(null, null, hash);
    const page = await this.update();
    if (page.isPreserve()) {
      await config.set('path', hash);
    }
    return page;
  }
  setTitle(text, lang) {
    if (!text) {
      document.title = i18n.getMessage('title');
    } else {
      document.title = i18n.getMessage('titleWithName', text);
    }
    const title = document.head.querySelector('title');
    title.lang = lang ?? i18n.getMessage('locale');
  }
  getCurrentPage() {
    return this.page;
  }
}
