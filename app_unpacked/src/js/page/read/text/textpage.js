/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import ReadPage from '../readpage.js';
import config from '../../../data/config.js';
import dom from '../../../ui/util/dom.js';
import { setViewHidden } from '../../../ui/util/view.js';
import onResize from '../../../ui/util/onresize.js';
import { imagePlaceholderRegExp } from '../../../text/epub.js';

export default class TextPage {
  /**
   * @param {ReadPage} readPage
   */
  constructor(readPage) {
    this.readPage = readPage;
    this.isCurrent = false;
    this.keyboardEvents = this.keyboardEvents.bind(this);
    this.wheelEvents = this.wheelEvents.bind(this);
    this.mouseEvents = this.mouseEvents.bind(this);
    this.onResize = this.onResize.bind(this);
  }
  async onActivate({ id }) {
    this.isCurrent = true;

    this.container = this.createContainer();
    await this.updateStyleConfig();
    this.readPage.container.prepend(this.container);

    // EXPERT_CONFIG Use 4th / 5th button for paging
    this.useMouseClickPaging = await config.expert('appearance.mouse_paging', 'boolean', false);
    this.minStep = 100;

    document.addEventListener('keydown', this.keyboardEvents);
    document.addEventListener('wheel', this.wheelEvents);
    this.container.addEventListener('mousedown', this.mouseEvents);
  }
  createContainer() {
    return document.createElement('div');
  }
  async onInactivate() {
    this.isCurrent = false;
    this._resourceScopes?.forEach(scope => this.releaseResourceScope(scope));
    this._resourceScopes = null;

    if (this._blobUrlCache) {
      this._blobUrlCache.forEach(url => URL.revokeObjectURL(url));
      this._blobUrlCache = null;
    }
    this.resetResourceImageObserver();

    document.removeEventListener('keydown', this.keyboardEvents);
    document.removeEventListener('wheel', this.wheelEvents);
    this.container?.removeEventListener('mousedown', this.mouseEvents);

    this.removeContainer(this.container);
    this.container = null;
    this.stepCache = null;

    onResize.removeListener(this.onResize);
  }
  removeContainer(container) {
    container?.remove();
  }
  initUpdatePage() {
    onResize.addListener(this.onResize);
  }
  show() {
    const container = this.container;
    if (container) {
      setViewHidden(container, false, 'read-text-hidden');
      dom.enableKeyboardFocus(container);
    }
  }
  hide() {
    const container = this.container;
    if (container) {
      setViewHidden(container, true, 'read-text-hidden');
      dom.disableKeyboardFocus(container);
    }
  }
  isInPage(cursor) {
    return false;
  }
  onResize() {
    this.stepCache = null;
  }
  forceUpdate() { }
  keyboardEvents(event) { }
  wheelEvents(event) { }
  mouseEvents(event) { }
  clearHighlight() { }
  highlightChars(start, length, textHighlight = false) { return false; }
  cursorChange(cursor, config) { }
  getRenderCursor() {
    // I know this could be weird. This acturlly assumed we only need to ignore spaces.
    // But I didn't find out any better approach. As render text page requires the table
    // of contexts ready, while render the table of contexts requires text page been
    // rendered, which is a circular. So, this would be the best I can do here.
    // Hopefully it works.
    return this.ignoreSpaces(this.readPage.getRawCursor());
  }
  async updateStyleConfig() {
    this.customFont = document.querySelector('#custom_font');
    this.customStyle = document.querySelector('#custom_style');

    /** @typedef {'light_text' | 'light_background' | 'dark_text' | 'dark_background' |
      'font_size' | 'font_family' | 'font_list' |
      'line_height' | 'paragraph_spacing'} ReadConfigKey */
    /** @type {{[key in ReadConfigKey]: string }} */
    const keys = {
      light_text: 'rgb(220,223,225)',
      light_background: 'rgb(60,63,68)',
      dark_text: 'rgb(220,223,225)',
      dark_background: 'rgb(60,63,68)',
      font_size: '18',
      font_family: null,
      font_list: '',
      line_height: '1.3',
      paragraph_spacing: '0.5',
    };
    /** @type {{ [key in ReadConfigKey]?: string }} */
    const configs = Object.fromEntries(await Promise.all(Object.keys(keys).map(async key => [key, await config.get(key, keys[key])])));

    const font = configs.font_family && Array.isArray(configs.font_list) &&
      configs.font_list.find(font => font?.id === configs.font_family)?.content || null;
    if (!this.customFont || !this.customStyle) return;
    this.customFont.textContent = [
      font ? `@font-face { font-family: "CustomFont"; src: url("${font}"); }` : '',
    ].join('\n');
    const styles = {
      '--read-dark-text-color': configs.dark_text,
      '--read-dark-background-color': configs.dark_background,
      '--read-light-text-color': configs.light_text,
      '--read-light-background-color': configs.light_background,
      '--read-font-size': configs.font_size + 'px',
      '--read-line-height': configs.line_height,
      '--read-paragraph-margin': configs.paragraph_spacing * configs.line_height * configs.font_size + 'px',
      '--read-font-family': font ? 'CustomFont' : 'auto',
    };
    const style = Object.keys(styles).map(prop => `${prop}: ${styles[prop]};`).join('\n');
    this.customStyle.textContent = `:root {\n${style}\n}`;

    this.configs = configs;
    try {
      await document.fonts.load(`${configs.font_size}px CustomFont`);
    } catch (e) {
      // ignore
    }
  }
  ignoreSpaces(cursor) {
    if (this.ignoreSpacesMemorizeStart === cursor) {
      return this.ignoreSpacesMemorizeEnd;
    }
    this.ignoreSpacesMemorizeStart = cursor;
    const content = this.readPage.getContent(), length = content.length;
    let lineBreak = cursor - 1;
    for (; /\s/.test(content[cursor]); cursor++) {
      if (content[cursor] === '\n') lineBreak = cursor;
    }
    const result = cursor >= length ? length : lineBreak + 1;
    this.ignoreSpacesMemorizeEnd = result;
    return result;
  }
  ignoreSpacesBackward(cursor) {
    const content = this.readPage.getContent();
    while (/\s/.test(content[cursor - 1])) cursor--;
    return cursor;
  }
  step() {
    if (this.stepCache) return this.stepCache;
    const [width, height] = onResize.currentSize();
    const area = width * height;
    const textArea = (this.configs?.font_size || 18) ** 2;
    this.stepCache = Math.floor(area / textArea);
    return Math.max(this.stepCache, this.minStep);
  }
  createResourceScope() {
    const scope = { released: false, leases: new Map() };
    if (!this._resourceScopes) this._resourceScopes = new Set();
    this._resourceScopes.add(scope);
    return scope;
  }
  releaseResourceScope(scope) {
    if (!scope || scope.released) return;
    scope.released = true;
    scope.leases.forEach(lease => lease.release());
    scope.leases.clear();
    this._resourceScopes?.delete(scope);
  }
  /**
   * Render inline text that may include epub image placeholders.
   * @param {HTMLElement} container
   * @param {string} text
   * @param {{ released: boolean, leases: Map<string, { url: string, release: () => void }> }} scope
   */
  loadResourceImage(img, resourceKey, scope) {
    this.readPage.acquireResourceLease(resourceKey).then(lease => {
      if (!lease) return;
      if (!this.isCurrent || scope?.released) {
        lease.release();
        return;
      }
      const currentLease = scope.leases.get(resourceKey);
      if (currentLease) {
        lease.release();
        img.src = currentLease.url;
        return;
      }
      scope.leases.set(resourceKey, lease);
      img.src = lease.url;
    });
  }
  resetResourceImageObserver() {
    this._imageObserver?.disconnect();
    this._imageObserver = null;
    this._imageRequests = null;
  }
  observeResourceImage(img, resourceKey, scope) {
    if (typeof IntersectionObserver !== 'function') {
      this.loadResourceImage(img, resourceKey, scope);
      return;
    }
    if (!this._imageObserver) {
      this._imageRequests = new WeakMap();
      this._imageObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const image = entry.target;
          this._imageObserver?.unobserve(image);
          const request = this._imageRequests?.get(image);
          this._imageRequests?.delete(image);
          if (request) this.loadResourceImage(image, request.key, request.scope);
        });
      }, { rootMargin: '800px 0px' });
    }
    this._imageRequests.set(img, { key: resourceKey, scope });
    this._imageObserver.observe(img);
  }
  renderInlineContent(container, text, scope = this.createResourceScope()) {
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    const loadImages = this.readPage.loadImages !== false;
    text.replace(imagePlaceholderRegExp, (match, _id, offset) => {
      if (offset > lastIndex) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, offset)));
      }
      const resource = this.readPage.getResource(match);
      if (loadImages && resource) {
        const wrapper = document.createElement('span');
        wrapper.classList.add('read-inline-image');
        wrapper.dataset.readContentLength = String(match.length);
        const img = document.createElement('img');
        if (resource.bytes) {
          if (!this._blobUrlCache) this._blobUrlCache = new Map();
          let url = this._blobUrlCache.get(match);
          if (!url) {
            url = URL.createObjectURL(new Blob([resource.bytes], { type: resource.mime }));
            this._blobUrlCache.set(match, url);
          }
          img.src = url;
        } else if (resource.src) {
          img.src = resource.src;
        } else if (resource.path) {
          this.observeResourceImage(img, match, scope);
        }
        img.alt = resource.alt || '';
        img.loading = 'lazy';
        wrapper.appendChild(img);
        fragment.appendChild(wrapper);
      } else {
        const wrapper = document.createElement('span');
        wrapper.classList.add('read-inline-image');
        wrapper.dataset.readContentLength = String(match.length);
        wrapper.textContent = resource?.alt || '[image]';
        fragment.appendChild(wrapper);
      }
      lastIndex = offset + match.length;
      return match;
    });
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    container.appendChild(fragment);
  }
  clearSearchTextHighlight() {
    this.container?.querySelectorAll('.read-search-highlight').forEach(mark => {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      mark.remove();
      parent.normalize();
    });
  }
  /**
   * Map a source-content offset to a rendered text node. Inline EPUB images
   * occupy source characters but do not contribute text nodes to the DOM.
   * @param {HTMLElement} container
   * @param {number} offset
   * @param {boolean} end
   * @returns {{ node: Text, offset: number } | null}
   */
  getTextBoundary(container, offset, end = false) {
    if (!container) return null;
    const segments = [];
    let sourceOffset = 0;
    const visit = node => {
      if (node.nodeType === Node.ELEMENT_NODE && node.dataset.readContentLength != null) {
        const length = Number(node.dataset.readContentLength);
        if (Number.isFinite(length)) sourceOffset += length;
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.nodeValue.length;
        segments.push({ node, start: sourceOffset, end: sourceOffset + length });
        sourceOffset += length;
        return;
      }
      node.childNodes.forEach(visit);
    };
    visit(container);
    if (!segments.length) return null;
    const exact = segments.find(segment =>
      offset < segment.end || (end && offset === segment.end)
    );
    if (exact) {
      return {
        node: exact.node,
        offset: Math.max(0, Math.min(exact.node.nodeValue.length, offset - exact.start)),
      };
    }
    const next = segments.find(segment => segment.start >= offset);
    if (next) return { node: next.node, offset: 0 };
    const last = segments[segments.length - 1];
    return { node: last.node, offset: last.node.nodeValue.length };
  }
  getTextRange(container, start, length) {
    if (!container || length <= 0) return null;
    const range = document.createRange();
    const startBoundary = this.getTextBoundary(container, start);
    const endBoundary = this.getTextBoundary(container, start + length, true);
    if (!startBoundary || !endBoundary) return null;
    range.setStart(startBoundary.node, startBoundary.offset);
    range.setEnd(endBoundary.node, endBoundary.offset);
    return range.collapsed ? null : range;
  }
  markTextHighlight(container, start, length) {
    const range = this.getTextRange(container, start, length);
    if (!range) return null;
    const mark = document.createElement('mark');
    mark.classList.add('read-search-highlight');
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
    return mark;
  }
  createGlobalSearchRegExp(reg) {
    if (!reg) return null;
    const flags = Array.from(new Set((reg.flags.replace('y', '') + 'g').split(''))).join('');
    try {
      return new RegExp(reg.source, flags);
    } catch (e) {
      return null;
    }
  }
  markSearchMatches(container, text, reg, visibleStart = 0, visibleEnd = text.length) {
    const searchReg = this.createGlobalSearchRegExp(reg);
    if (!searchReg) return [];
    const ranges = [];
    let match;
    while ((match = searchReg.exec(text))) {
      const start = match.index;
      const length = match[0].length;
      if (length > 0 && start < visibleEnd && start + length > visibleStart) {
        ranges.push({ start, length });
      }
      if (length === 0) searchReg.lastIndex++;
    }
    return ranges.reverse().map(range => this.markTextHighlight(container, range.start, range.length)).filter(Boolean);
  }
  highlightSearchMatches(reg, start, length) {
    return this.highlightChars(start, length, true);
  }
}
