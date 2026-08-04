/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import IndexSubPage from './indexsubpage.js';
import IndexPage from './indexpage.js';
import ReadPage from '../readpage.js';
import i18n from '../../../i18n/i18n.js';
import template from '../../../ui/util/template.js';
import config from '../../../data/config.js';

export default class IndexSearchPage extends IndexSubPage {
  /**
   * @param {HTMLElement} container
   * @param {HTMLElement} tabItem
   * @param {number} index
   * @param {IndexPage} indexPage
   * @param {ReadPage} readPage
   */
  constructor(container, tabItem, index, indexPage, readPage) {
    super(container, tabItem, index, indexPage, readPage);
  }
  createPageButton() {
    return template.iconButton('remove', i18n.getMessage('buttonSearchClear'));
  }
  onFirstActivate() {
    super.onFirstActivate();

    this.searchLines = null;
    this.searchLineOffsets = null;
    this.searchContent = null;
    this.highlightToken = 0;
    this.focusFrame = null;
    this.focusTimer = null;
    this.searchForm = this.container.querySelector('.search-box form');
    this.searchInput = this.searchForm.querySelector('input');
    this.searchPlaceholder = this.container.querySelector('.search-box-placehodler');

    this.searchInput.placeholder = i18n.getMessage('readSearchPlaceholder');

    this.searchButton = template.iconButton('go', i18n.getMessage('buttonSearchSubmit'));
    this.searchForm.appendChild(this.searchButton);
    this.searchButton.classList.add('submit-button');
    this.searchButton.type = 'submit';

    this.searchForm.addEventListener('submit', event => {
      const text = this.searchInput.value;
      if (text) this.searchText(text);
      else this.clearSearch();
      event.preventDefault();
      this.searchPlaceholder.focus();
    });

    this.disablePageButton();
    this.searchResultList = [];
  }
  onActivate() {
    super.onActivate();
    this.searchInput.value = '';
    this.searchLines = null;
    this.searchLineOffsets = null;
    this.searchContent = null;
    this.highlightToken++;
    this.clearSearch();
  }
  cancelFocus() {
    if (this.focusFrame != null) {
      cancelAnimationFrame(this.focusFrame);
      this.focusFrame = null;
    }
    if (this.focusTimer != null) {
      clearTimeout(this.focusTimer);
      this.focusTimer = null;
    }
  }
  unsetCurrent() {
    this.cancelFocus();
    super.unsetCurrent();
  }
  onInactivate() {
    this.cancelFocus();
    super.onInactivate();
  }
  setCurrent() {
    super.setCurrent();
    this.cancelFocus();
    const cursorOnTab = this.indexPage.tabGroup === document.activeElement;
    const emptySearch = this.itemList.isListEmpty();
    if (emptySearch && !cursorOnTab) {
      const pageReady = () => {
        if (this.isCurrent && this.isShow && this.indexPage.isCurrent) {
          this.searchInput.focus();
        }
        this.cancelFocus();
      };
      const waitPageReady = () => {
        if (!this.isCurrent || !this.isShow || !this.indexPage.isCurrent) {
          this.cancelFocus();
          return;
        }
        const rect = this.container.getBoundingClientRect();
        if (!rect) {
          this.cancelFocus();
          return;
        }
        if (!rect.x && !rect.y) pageReady();
        else {
          this.focusFrame = requestAnimationFrame(waitPageReady);
        }
      };
      this.focusTimer = setTimeout(() => {
        this.focusTimer = null;
        this.cancelFocus();
      }, 10e3);
      this.focusFrame = requestAnimationFrame(waitPageReady);
    }
  }
  async searchText(searchTerm) {
    if (searchTerm) {
      this.clearSearch();
      this.emptyListSpan.textContent = i18n.getMessage('readSearchEmpty', searchTerm);
      this.lastSearchText = searchTerm;
      this.lastSearchCursor = 0;
      this.lastSearchLine = 0;
      this.totalSearchHit = 0;
    }

    const currentSearchTerm = this.lastSearchText;
    const searchToken = this.searchToken = (this.searchToken || 0) + 1;
    const [mode, flags] = await Promise.all([
      config.expert('text.search_mode', 'string', 'text'),
      config.expert('text.search_flags', 'string', 'iu'),
    ]);
    // Line-level matching needs a stable index; global/sticky flags make
    // String#match omit the index or depend on mutable lastIndex.
    if (searchToken !== this.searchToken || currentSearchTerm !== this.lastSearchText) return;
    const lineFlags = flags.replace(/[gy]/g, '');
    let reg = /(?!)/;
    if (mode === 'regex') {
      try {
        reg = new RegExp(currentSearchTerm, lineFlags);
      } catch (e1) { /* ignore */ }
    } else if (mode === 'wildcard') {
      try {
        const escaped = currentSearchTerm.replace(/[-[\]{}()*+?.,\\^$|#]|\s+/g,
          c => /\s+/.test(c) ? '\\s+' : c === '*' ? '.*?' : `\\u${c.charCodeAt().toString(16).padStart(4, 0)}`);
        reg = new RegExp('(' + escaped + ')', lineFlags);
      } catch (e2) { /* ignore */ }
    } else {
      try {
        const escaped = currentSearchTerm.replace(/[-[\]{}()*+?.,\\^$|#\s]/g,
          c => `\\u${c.charCodeAt().toString(16).padStart(4, 0)}`);
        reg = new RegExp('(' + escaped + ')', lineFlags);
      } catch (e3) { /* ignore */ }
    }
    this.lastSearchReg = reg;
    const content = this.readPage.content || '';
    if (this.searchContent !== content) {
      this.searchContent = content;
      this.searchLines = content.split('\n');
      this.searchLineOffsets = new Array(this.searchLines.length);
      let offset = 0;
      this.searchLines.forEach((line, index) => {
        this.searchLineOffsets[index] = offset;
        offset += line.length + 1;
      });
    }
    const lines = this.searchLines;
    const lineOffsets = this.searchLineOffsets;
    const linum = lines.length;

    const searchResult = this.searchResultList;
    if (searchResult.length && searchResult[searchResult.length - 1] == null) {
      this.itemList.removeItem(searchResult.length - 1);
      searchResult.pop();
    }
    const lastSearchResultSize = searchResult.length;
    const searchLimit = 1000;
    let searchHit = 0;
    const lineReg = new RegExp(reg.source, `${reg.flags.replace(/[gy]/g, '')}g`);
    let cursor = this.lastSearchCursor, i = this.lastSearchLine;
    for (; i < linum; i++) {
      if (searchHit === searchLimit) {
        searchResult.push(null);
        break;
      }
      const line = lines[i];
      lineReg.lastIndex = 0;
      let match;
      while ((match = lineReg.exec(line))) {
        cursor = lineOffsets[i];
        searchResult.push({
          cursor,
          line,
          matchIndex: match.index,
          matchLength: match[0].length,
        });
        searchHit++;
        if (searchHit === searchLimit) break;
        if (match[0].length === 0) lineReg.lastIndex++;
      }
      cursor = lineOffsets[i] + line.length + 1;
    }
    this.lastSearchLine = i;
    this.lastSearchCursor = i < linum ? cursor : (linum ? lineOffsets[linum - 1] + lines[linum - 1].length + 1 : 0);
    this.totalSearchHit += searchHit;
    this.itemList.appendList(searchResult.slice(lastSearchResultSize));
    this.enablePageButton();
    this.listUpdated();
  }
  clearSearch() {
    this.searchToken = (this.searchToken || 0) + 1;
    this.highlightToken++;
    this.searchResultList = [];
    this.itemList.setList([]);
    this.disablePageButton();
    this.emptyListSpan.textContent = i18n.getMessage('readSearchInitial');
  }
  pageButtonAction() {
    this.clearSearch();
    this.searchInput.value = '';
  }
  emptyListRender(container) {
    const span = container.appendChild(document.createElement('span'));
    span.textContent = i18n.getMessage('readSearchInitial');
    this.emptyListSpan = span;
  }
  listItemRender(container, item) {
    if (item) {
      const element = container.appendChild(document.createElement('div'));
      element.classList.add('index-search-item');
      element.lang = this.readPage.langTag;
      const line = item.line;
      const index = item.matchIndex;
      const size = item.matchLength;
      const left = Math.max(index - 10, 0);
      const right = Math.min(left + 200, line.length);
      const cursor = item.cursor;
      const leftText = line.slice(left, index).trimStart();
      const matchText = line.slice(index, index + size);
      const rightText = line.slice(index + size, right).trimRight();
      element.appendChild(document.createTextNode(leftText));
      element.appendChild(document.createElement('mark')).textContent = matchText;
      element.appendChild(document.createTextNode(rightText));
      element.dataset.cursor = cursor;
    } else {
      const text = container.appendChild(document.createElement('div'));
      text.classList.add('index-search-item', 'index-search-item-more');
      text.textContent = i18n.getMessage('readSearchTooMany', this.totalSearchHit);
    }
  }
  getListItems() {
    return this.searchResultList;
  }
  getCurrentIndex() {
    return super.getCurrentIndex();
  }
  onItemClick(searchResult) {
    if (!searchResult) {
      this.searchText();
    } else {
      if (this.searchContent !== this.readPage.content) {
        this.clearSearch();
        return;
      }
      super.onItemClick(searchResult);
      const start = searchResult.cursor + searchResult.matchIndex;
      const length = searchResult.matchLength;
      const token = ++this.highlightToken;
      const searchReg = this.lastSearchReg;
      const targetVisible = () => this.readPage.textPage?.isInPage(start) || this.readPage.textPage?.isInPage(searchResult.cursor);
      const highlight = retries => {
        if (token !== this.highlightToken) return;
        if (!targetVisible() && retries > 0) {
          setTimeout(() => highlight(retries - 1), 50);
          return;
        }
        const result = this.readPage.textPage?.highlightSearchMatches(searchReg, start, length);
        if (result == null && retries > 0) {
          setTimeout(() => highlight(retries - 1), 50);
        }
      };
      requestAnimationFrame(() => highlight(40));
    }
  }
}
