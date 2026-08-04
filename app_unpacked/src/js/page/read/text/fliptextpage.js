/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import onResize from '../../../ui/util/onresize.js';
import config from '../../../data/config.js';
import TextPage from './textpage.js';
import ReadPage from '../readpage.js';
import i18n from '../../../i18n/i18n.js';
import template from '../../../ui/util/template.js';
import { TouchGestureListener } from '../../../ui/util/touch.js';

/**
 * @typedef {Object} PageRender
 * @property {HTMLElement} container
 * @property {number} cursor
 * @property {number} nextCursor
 */
/**
 * @typedef {Object} PageRenderCollection
 * @property {PageRender} prev
 * @property {PageRender} current
 * @property {PageRender} next
 */

export default class FlipTextPage extends TextPage {
  /**
   * @param {ReadPage} readPage
   */
  constructor(readPage) {
    super(readPage);
  }
  async onActivate({ id }) {
    await super.onActivate({ id });

    // EXPERT_CONFIG When to use two column page
    this.screenWidthTwoColumn = await config.expert('appearance.screen_width_two_column', 'number', 960);
    // EXPERT_CONFIG When to use two column page when side index active
    this.screenWidthTwoColumnIndex = await config.expert('appearance.screen_width_two_column_index', 'number', 1260);
    // EXPERT_CONFIG Max length of content
    this.maxContentLength = await config.expert('text.content_max_length', 'number', 100);
    // EXPERT_CONFIG Action for touch different area when read using flip page mode
    this.flipTouchAction = await config.expert('reader.flip_touch_action', 'string', 'prev,menu,next', {
      validator: value => /^\s*(?:(?:prev|next|menu|noop)\s*(?=,(?!$)|$),?){3}$/.test(value),
    });

    /** @type {PageRenderCollection} */
    this.pages = {};
    this.initPrevCursor();
  }
  async onInactivate() {
    this.isCurrent = false;
    await super.onInactivate();
    this.pages = null;
    this.clearPrevCursor();
  }
  initUpdatePage() {
    super.initUpdatePage();
    this.updatePages({ resetRender: false });
  }
  clearPrevCursor() {
    this.prevCursorCache = null;
  }
  initPrevCursor() {
    /** @type {[Map<number, number>, Map<number, number>]} */
    this.prevCursorCache = [new Map(), new Map()];
  }
  getPrevCursor(nextCursor) {
    return this.prevCursorCache.reduce((result, cache) => {
      if (result != null) return result;
      if (cache.has(nextCursor)) return cache.get(nextCursor);
      return null;
    }, null);
  }
  setPrevCursor(cursor, nextCursor) {
    if (this.prevCursorCache[0].size >= 1000) {
      this.prevCursorCache.pop();
      this.prevCursorCache.unshift(new Map());
    }
    this.prevCursorCache[0].set(nextCursor, cursor);
  }
  createContainer() {
    const container = template.create('read_text_flip');
    this.pagesContainer = container.get('pages');

    const listener = new TouchGestureListener(this.pagesContainer, {
      yRadian: Math.PI / 5,
      minDistanceY: 60,
      clickGridX: 3,
    });
    const wos = (f, g) => (...p) => {
      if (this.isAnythingSelected()) {
        if (g) g(...p);
      } else {
        f(...p);
      }
    };

    const cancelX = () => { this.slidePage('cancel'); };
    listener.onMoveX(wos((distance, { touch }) => {
      if (touch) this.slidePage('move', distance);
      else cancelX();
    }, cancelX));
    listener.onSlideLeft(wos(({ touch }) => {
      if (touch) this.slidePage('left');
    }, cancelX));
    listener.onSlideRight(wos(({ touch }) => {
      if (touch) this.slidePage('right');
    }, cancelX));
    listener.onCancelX(cancelX);

    const cancelY = () => { this.readPage.slideIndexPage('cancel'); };
    listener.onMoveY(wos((distance, { touch }) => {
      if (touch) this.readPage.slideIndexPage('move', distance);
      else cancelY();
    }, cancelY));
    listener.onSlideUp(wos(({ touch }) => {
      if (!touch) return;
      if (this.readPage.isIndexActive()) {
        this.readPage.slideIndexPage('hide');
      } else {
        this.readPage.showControlPage();
      }
    }, cancelY));
    listener.onSlideDown(wos(({ touch }) => {
      if (touch) this.readPage.slideIndexPage('show');
    }, cancelY));
    listener.onCancelY(cancelY);

    listener.onTouch(wos(({ grid }) => {
      const action = this.flipTouchAction.split(',').map(a => a.trim())[grid.x];
      const apply = action;
      if (apply === 'prev') {
        this.prevPage({ resetRender: false });
      } else if (apply === 'next') {
        this.nextPage({ resetRender: false });
      } else if (apply === 'menu') {
        this.readPage.showControlPage();
      }
    }));

    this.pagesContainer.addEventListener('contextmenu', event => {
      if (this.isAnythingSelected()) return;
      event.preventDefault();
      this.readPage.toggleControlPage();
    }, false);

    /** @type {HTMLButtonElement} */
    this.prevButton = container.get('prev');
    this.prevButton.title = i18n.getMessage('readPagePrevious');
    this.prevButton.addEventListener('click', () => {
      this.prevPage({ resetRender: false });
    });
    /** @type {HTMLButtonElement} */
    this.nextButton = container.get('next');
    this.nextButton.title = i18n.getMessage('readPageNext');
    this.nextButton.addEventListener('click', () => {
      this.nextPage({ resetRender: false });
    });

    return container.get('root');
  }
  removeContainer(container) {
    this.pagesContainer = null;
    this.prevButton = null;
    this.nextButton = null;
    container.remove();
  }
  isAnythingSelected() {
    const selection = document.getSelection();
    const container = this.pages.current.container;
    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      if (range.startContainer === range.endContainer && range.startOffset === range.endOffset) continue;
      if (!container.contains(range.startContainer)) continue;
      return true;
    }
    return false;
  }
  /**
   * @param {KeyboardEvent} event
   */
  keyboardEvents(event) {
    super.keyboardEvents(event);
    if (!this.readPage.isTextPageOnTop()) return;
    if (['PageUp', 'ArrowLeft'].includes(event.code)) {
      this.prevPage({ resetRender: false });
    } else if (['PageDown', 'ArrowRight'].includes(event.code)) {
      this.nextPage({ resetRender: false });
    } else if (['ArrowUp'].includes(event.code)) {
      this.readPage.showControlPage();
    } else if (['ArrowDown'].includes(event.code)) {
      this.readPage.slideIndexPage('show');
    }
  }
  /**
   * @param {WheelEvent} event
   */
  wheelEvents(event) {
    super.wheelEvents(event);
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.read-text-pages')) return;
    if (this.wheelBusy) return;
    const deltaY = event.deltaY;
    if (!deltaY) return;
    if (deltaY > 0) this.nextPage({ resetRender: false });
    else if (deltaY < 0) this.prevPage({ resetRender: false });
    // Wait when flip page ends
    setTimeout(() => { this.wheelBusy = false; }, 250);
    this.wheelBusy = true;
  }
  /**
   * @param {MouseEvent} event
   */
  mouseEvents(event) {
    if (this.useMouseClickPaging && event.buttons === 8) {
      this.prevPage({ resetRender: false });
    } else if (this.useMouseClickPaging && event.buttons === 16) {
      this.nextPage({ resetRender: false });
    } else {
      return;
    }
    event.preventDefault();
  }
  /**
   * @param {'move'|'left'|'right'|'cancel'} action
   * @param {number} offset
   */
  slidePage(action, offset) {
    if (action === 'move') {
      let move = offset;
      if (offset < 0 && !this.pages.next) {
        move = Math.max(-100, offset / 2);
      } else if (offset > 0 && !this.pages.prev) {
        move = Math.min(100, offset / 2);
      }
      const [width, height] = onResize.currentSize();
      move = Math.max(-width, Math.min(width, move));
      this.pagesContainer.style.setProperty('--slide-x', move + 'px');
      this.pagesContainer.classList.add('read-text-pages-slide');
    } else {
      this.pagesContainer.style.setProperty('--slide-x', '0px');
      this.pagesContainer.classList.remove('read-text-pages-slide');
    }
    if (action === 'left' || action === 'right') {
      // We are about to flip pages
      this.updatePageBusy = true;
      window.requestAnimationFrame(() => {
        if (!this.isCurrent) return;
        if (action === 'left') this.nextPage({ resetRender: false });
        if (action === 'right') this.prevPage({ resetRender: false });
      });
    }
  }
  slideCancel() {
    this.slidePage('cancel');
    this.readPage.slideIndexPage('cancel');
  }
  nextPage(config) {
    if (!this.pages.next) return;
    this.disposePage(this.pages.prev);
    this.pages.prev = this.pages.current;
    this.pages.current = this.pages.next;
    this.pages.next = null;
    this.updatePages(config);
  }
  prevPage(config) {
    if (!this.pages.prev) return;
    this.disposePage(this.pages.next);
    this.pages.next = this.pages.current;
    this.pages.current = this.pages.prev;
    this.pages.prev = null;
    this.updatePages(config);
  }
  resetPage(config) {
    this.resetResourceImageObserver();
    this.slideCancel();
    this.initPrevCursor();
    this.disposePages();
    this.updatePages(config);
  }
  updatePages(config) {
    this.updatePageBusy = true;
    const content = this.readPage.getContent() || '';
    const cursor = Math.min(Math.max(this.readPage.getRawCursor() || 0, 0), content.length);
    const start = this.ignoreSpaces(cursor);
    const pages = this.pages;
    // Current Page
    if (!pages.current) {
      if (start < content.length) {
        const current = this.layoutPageStartsWith(cursor);
        // Cursor corrupted
        if (!current) {
          this.readPage.setCursor(0, config);
          return;
        }
        pages.current = current;
      } else {
        const current = this.layoutPageEndsWith(content.length);
        pages.current = current;
      }
    }
    const currentArticles = Array.from(pages.current.container.querySelectorAll('.read-body'));
    currentArticles.forEach(article => {
      const parent = article.parentNode;
      const placeholder = document.createElement('span');
      parent.replaceChild(placeholder, article);
      parent.replaceChild(article, placeholder);
      article.setAttribute('aria-live', 'polite');
    });
    // Previous Page
    if (!pages.prev && pages.current.cursor > 0) {
      if (this.getPrevCursor(pages.current.cursor) !== null) {
        const prevCursor = this.getPrevCursor(pages.current.cursor);
        pages.prev = this.layoutPageStartsWith(prevCursor);
      } else {
        this.initPrevCursor();
        pages.prev = this.layoutPageEndsWith(pages.current.cursor);
      }
    }
    this.prevButton.disabled = !pages.prev;
    // Next Page
    if (!pages.next && pages.current.nextCursor < content.length) {
      pages.next = this.layoutPageStartsWith(pages.current.nextCursor);
      this.setPrevCursor(pages.current.cursor, pages.next.cursor);
    }
    this.nextButton.disabled = !pages.next;
    /** @type {('prev'|'current'|'next')[]} */
    const pageNames = ['prev', 'current', 'next'];
    pageNames.forEach(name => {
      const page = pages[name];
      if (!page) return;
      const container = page.container;
      container.classList.remove('read-text-page-prev');
      container.classList.remove('read-text-page-current');
      container.classList.remove('read-text-page-next');
      container.classList.add({
        prev: 'read-text-page-prev',
        current: 'read-text-page-current',
        next: 'read-text-page-next',
      }[name]);
      container.setAttribute('aria-hidden', name === 'current' ? 'false' : 'true');
      this.addRenderedPage(page);
    });
    window.requestAnimationFrame(() => {
      if (!this.isCurrent || !this.pages?.current) return;
      this.readPage.setCursor(this.pages.current.cursor, config);
    });
    this.updatePageBusy = false;
  }
  /** @param {PageRender} page */
  disposePage(page) {
    if (!page) return;
    page.container.remove();
    this.releaseResourceScope(page.resourceScope);
  }
  disposePages() {
    this.disposePage(this.pages.prev);
    this.disposePage(this.pages.current);
    this.disposePage(this.pages.next);
    this.pages.prev = null;
    this.pages.current = null;
    this.pages.next = null;
  }
  /** @param {PageRender} page */
  addRenderedPage(page) {
    if (page.container.isConnected) return;
    this.pagesContainer.appendChild(page.container);
  }
  isTwoColumn() {
    const [width, height] = onResize.currentSize();
    if (width < this.screenWidthTwoColumn) return false;
    if (width < this.screenWidthTwoColumnIndex && this.readPage.isSideIndexActive()) return false;
    if (width < height * 1.2) return false;
    return true;
  }
  /**
   * @typedef {Object} PageRenderContext
   * @property {HTMLParagraphElement} paragraph
   * @property {HTMLElement} before
   * @property {number} start
   * @property {number} end
   * @property {number} cursor
   * @property {string} previous
   * @property {boolean} error
   * @property {number} nextSection
   */
  /**
   * @param {HTMLElement} body
   * @param {PageRenderContext} context
   */
  renderContent(body, context) {
    const content = this.readPage.content;
    const readIndex = this.readPage.readIndex;
    const step = this.step();
    if (context.cursor == null) context.cursor = context.start;
    if (context.previous == null) {
      const text = content.slice(Math.max(0, context.cursor - this.maxContentLength), context.cursor);
      context.previous = text.slice(text.lastIndexOf('\n') + 1);
    }
    let pos = context.cursor;
    if (context.end == null) {
      context.cursor = Math.min(context.cursor + step, content.length);
    } else {
      context.cursor = Math.min(context.end, content.length);
    }
    if (readIndex.getContentsList().length && context.nextSection == null) {
      const contents = readIndex.getContentsList();
      const ref = pos - context.previous.length - 1;
      const nextSection = Math.max(readIndex.getIndexOfContentsByCursor(ref), 0) + 1;
      if (nextSection >= contents.length) context.nextSection = 0;
      else context.nextSection = nextSection;
    }
    const trunk = content.slice(pos, context.cursor);
    if (!trunk) {
      context.error = true;
      return context;
    }
    trunk.split(/(\n)/).forEach(line => {
      if (!context.paragraph && line) {
        const paragraph = context.paragraph = document.createElement('p');
        paragraph.classList.add('text');
        paragraph.dataset.start = pos;
        if (pos === 0 || content[pos - 1] !== '\n') {
          paragraph.classList.add('text-truncated-start');
        }
        if (context.nextSection) {
          const contents = readIndex.getContentsList();
          const contentsItem = contents[context.nextSection];
          if (contentsItem.cursor === pos - context.previous.length) {
            paragraph.setAttribute('role', 'heading');
            paragraph.setAttribute('aria-level', '3');
            paragraph.classList.add('text-heading');
            context.nextSection = (context.nextSection + 1) % contents.length;
          }
        }
        body.insertBefore(paragraph, context.before);
      }
      const activeParagraph = context.paragraph;
      if (line === '\n') {
        context.paragraph = null;
        context.previous = '';
      } else if (line) {
        this.renderInlineContent(activeParagraph, line, context.resourceScope);
        context.previous += line;
      }
      pos += line.length;
      if (activeParagraph) {
        activeParagraph.dataset.end = pos;
      }
    });
    return context;
  }
  /**
   * @param {number} cursor
   * @param {HTMLElement} body
   * @returns {number}
   */
  layoutPageColumn(cursor, body, resourceScope) {
    const [pageWidth, pageHeight] = onResize.currentSize();
    const content = this.readPage.content;
    body.innerHTML = '';
    body.setAttribute('aria-setsize', content.length);
    body.setAttribute('aria-posinset', cursor);
    // 2. fill texts until it overflow the content
    let isOverflow = false;
    /** @type {PageRenderContext} */
    const context = {
      start: this.ignoreSpaces(cursor),
      resourceScope,
    };
    let loopSafety = 0;
    while (!context.error) {
      if (++loopSafety > 5000) {
        console.error('FlipTextPage render loop limit exceeded');
        context.error = true;
        break;
      }
      this.renderContent(body, context);
      if (body.clientHeight !== body.scrollHeight) {
        this.renderContent(body, context);
        isOverflow = true;
        break;
      } else if (body.clientHeight > pageHeight * 4) {
        context.error = true;
      }
    }
    const paragraphs = Array.from(body.querySelectorAll('p[data-start]'));
    let nextCursor;
    if (!paragraphs.length) return cursor;
    if (isOverflow) {
      // 3. find out where the overflow happened
      const rect = body.getBoundingClientRect();
      const firstOut = paragraphs.slice(0).reverse().find(p => {
        return p.getBoundingClientRect().top < rect.bottom;
      }) ?? paragraphs[0];
      const startPos = Number(firstOut.dataset.start);
      const paragraphEnd = Number(firstOut.dataset.end ?? startPos);
      const length = paragraphEnd - startPos;
      const walker = document.createTreeWalker(firstOut, NodeFilter.SHOW_TEXT);
      let textNode = walker.nextNode();
      let low = 0;
      let high = textNode ? textNode.textContent.length - 1 : -1;
      const range = document.createRange();
      while (textNode && low <= high) {
        const mid = Math.floor((low + high) / 2);
        range.setStart(textNode, mid);
        range.setEnd(textNode, mid + 1);
        if (range.getBoundingClientRect().bottom > rect.bottom) {
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }
      let targetHeight = null;
      if (high < 0) {
        const bound = firstOut.getBoundingClientRect();
        targetHeight = Math.min(bound.bottom - rect.top, rect.height);
        nextCursor = Math.max(startPos + 1, paragraphEnd);
      } else {
        range.setStart(textNode, low - 1);
        range.setEnd(textNode, low);
        targetHeight = range.getBoundingClientRect().bottom - rect.top;
        nextCursor = startPos + low;
      }
      // 4. Hide overflow content
      body.style.height = targetHeight + 'px';
      body.style.bottom = 'auto';
    } else {
      nextCursor = context.cursor;
    }
    // 5. Mark following contents hidden
    paragraphs.forEach(paragraph => {
      const start = Number(paragraph.dataset.start);
      const end = Number(paragraph.dataset.end ?? (start + paragraph.textContent.length));
      if (start >= nextCursor) {
        paragraph.remove();
      } else if (end > nextCursor) {
        const pos = nextCursor - start;
        const before = content.slice(start, nextCursor);
        const after = content.slice(nextCursor, end);
        paragraph.textContent = '';
        this.renderInlineContent(paragraph, before, context.resourceScope);
        if (after) {
          const afterSpan = document.createElement('span');
          afterSpan.setAttribute('aria-hidden', 'true');
          this.renderInlineContent(afterSpan, after, context.resourceScope);
          paragraph.appendChild(afterSpan);
        }
        paragraph.classList.add('text-truncated-end');
        paragraph.dataset.end = nextCursor;
      }
    });

    return nextCursor;
  }
  /**
   * @param {number} cursor
   * @param {boolean} live
   * @returns {PageRender}
   */
  layoutPageStartsWith(cursor) {
    const content = this.readPage.getContent() || '';
    const readIndex = this.readPage.readIndex;
    const start = this.ignoreSpaces(cursor);
    if (start >= content.length && content.length > 0) {
      return null;
    }
    const ref = template.create('read_text_flip_page');
    const container = ref.get('root');
    const title = ref.get('title');
    const progress = ref.get('progress');
    title.textContent = this.readPage.meta.title;
    container.dataset.title = this.readPage.meta.title;
    const contentsIndex = readIndex.getIndexOfContentsByCursor(start);
    if (contentsIndex !== -1) {
      container.dataset.section = contentsIndex;
      const contents = readIndex.getContentsByIndex(contentsIndex);
      if (contents?.title != null) title.textContent = contents.title;
    }
    progress.textContent = (start / content.length * 100).toFixed(2) + '%';
    container.lang = this.readPage.getLang();
    // 1. insert container into dom, so styles would applied to it
    this.pagesContainer.appendChild(container);

    let nextCursor;
    const resourceScope = this.createResourceScope();
    const body = ref.get('body');
    const left = ref.get('left');
    const right = ref.get('right');

    if (this.isTwoColumn()) {
      body.remove();
      container.classList.add('read-text-two-column');
      const rightCursor = this.layoutPageColumn(cursor, left, resourceScope);
      nextCursor = this.layoutPageColumn(rightCursor, right, resourceScope);
    } else {
      left.remove();
      right.remove();
      container.classList.add('read-text-one-column');
      nextCursor = this.layoutPageColumn(cursor, body, resourceScope);
    }

    // 6. Everything done
    this.pagesContainer.removeChild(container);
    container.classList.remove('read-text-page-processing');

    return { container, cursor, nextCursor, resourceScope };
  }
  /**
   * @param {number} nextCursor
   * @param {boolean} live
   * @returns {PageRender}
   */
  layoutPageEndsWith(nextCursor) {

    if (!nextCursor && nextCursor !== 0) {
      return null;
    }
    const ref = template.create('read_text_flip_page');
    const container = ref.get('root');
    const resourceScope = this.createResourceScope();
    this.pagesContainer.appendChild(container);
    const step = this.step();
    const content = this.readPage.getContent() || '';
    container.lang = this.readPage.getLang();

    /**
     * @param {number} nextCursor
     * @param {HTMLElement} body
     */
    const findColumnStartByEndsWith = (nextCursor, body) => {
      const [pageWidth, pageHeight] = onResize.currentSize();
      const end = this.ignoreSpacesBackward(nextCursor);
      // Try to fill some contents until it got overflowed or reach the start of text
      let low = Math.max(end - step, 0), high = end;
      while (true) {
        const context = {
          start: this.ignoreSpaces(low),
          end: high,
          before: body.firstChild,
          resourceScope,
        };
        this.renderContent(body, context);
        if (low === 0) break;
        if (body.clientHeight !== body.scrollHeight) break;
        if (body.scrollHeight > pageHeight * 4) break;
        if (body.firstChild) {
          body.firstChild.remove();
        }
        if (body.firstChild) {
          high = Number(body.firstChild.dataset.start);
        }
        low = Math.max(low - step, 0);
      }
      if (body.clientHeight === body.scrollHeight) {
        return low;
      }
      // Find out first paragraph which is overflowed the container
      let boundary = body.getBoundingClientRect().top + body.scrollHeight - body.clientHeight;
      const paragraphs = Array.from(body.querySelectorAll('p[data-start]'));
      let firstOut = paragraphs.find(p => p.getBoundingClientRect().bottom > boundary);
      if (!firstOut) return low;
      if (firstOut === body.firstChild) {
        const ref = firstOut.nextSibling;
        firstOut.remove();
        const context = {
          start: this.ignoreSpaces(Math.max(low - step, 0)),
          end: ref ? Number(ref.dataset.start) : end,
          before: ref,
          resourceScope,
        };
        this.renderContent(body, context);
        firstOut = ref ? ref.previousSibling : body.lastChild;
        boundary = body.getBoundingClientRect().top + body.scrollHeight - body.clientHeight;
      }
      const firstOutStart = Number(firstOut.dataset.start);
      // Find out first character which is overflowed the container in paragraph
      const textNode = firstOut.firstChild;
      low = 0;
      high = textNode ? textNode.length - 1 : -1;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const range = document.createRange();
        range.setStart(textNode, mid);
        range.setEnd(textNode, mid + 1);
        // When Safari break some line earlier in order to handle line breaking rules, the extra
        // space introduced is considered a part of the next character. In which case,
        // getClientRects() may returns length 2 array while the first element has a zero width.
        // We should ignore it so we would not voilate the line breaking rules.
        const rects = Array.from(range.getClientRects());
        const rect = rects.find(rect => rect.width * rect.height) || rects[0];
        if (!rect) {
          low = mid + 1;
          continue;
        }
        const rectTop = rect.top;
        if (rectTop < boundary) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return this.ignoreSpaces(firstOutStart + low);
    };

    let cursor;
    if (this.isTwoColumn()) {
      const midCursor = findColumnStartByEndsWith(nextCursor, ref.get('right'));
      cursor = findColumnStartByEndsWith(midCursor, ref.get('left'));
    } else {
      cursor = findColumnStartByEndsWith(nextCursor, ref.get('body'));
    }
    this.pagesContainer.removeChild(container);
    this.releaseResourceScope(resourceScope);

    // Finally, we reuse starts with to render the page
    return this.layoutPageStartsWith(cursor);
  }
  clearHighlight() {
    Array.from(document.querySelectorAll('.read-highlight')).forEach(container => {
      container.innerHTML = '';
    });
    this.clearSearchTextHighlight();
    this.lastHighlightStart = null;
    this.lastHighlightLength = null;
    this.lastHighlightTextMode = null;
  }
  highlightChars(start, length, textHighlight = false, depth = 0) {
    if (this.updatePageBusy) {
      return null;
    }
    if (this.lastHighlightStart === start) {
      if (this.lastHighlightLength === length && this.lastHighlightTextMode === textHighlight) {
        return null;
      }
    }
    this.clearHighlight();
    if (depth > 3) return null;

    if (!this.pages.current) {
      this.readPage.setCursor(start, { resetRender: true });
      return this.highlightChars(start, length, textHighlight, depth + 1);
    }

    const prevNext = this.pages.prev?.nextCursor;
    const currentPage = this.pages.current.cursor;
    const currentNext = this.pages.current.nextCursor;
    const nextPage = this.pages.next?.cursor;
    const nextNext = this.pages.next?.nextCursor;

    if (start + length < Math.min(currentPage, prevNext ?? 0)) {
      // Maybe something went wrong
      this.readPage.setCursor(start, { resetRender: false });
      return this.highlightChars(start, length, textHighlight, depth + 1);
    }

    if (start >= nextPage) {
      if (start < nextNext) {
        this.nextPage({ resetRender: false });
      } else {
        this.readPage.setCursor(start, { resetRender: false });
      }
      return this.highlightChars(start, length, textHighlight, depth + 1);
    }

    this.lastHighlightStart = start;
    this.lastHighlightLength = length;
    this.lastHighlightTextMode = textHighlight;

    if (start > currentNext || length === 0) {
      return [];
    }

    /** @type {HTMLElement} */
    const container = this.pages.current.container;
    const paragraphs = Array.from(container.querySelectorAll('p[data-start]'));
    const paragraph = paragraphs.reverse().find(p => p.dataset.start <= start);
    if (!paragraph) return false;
    const paragraphStart = Number(paragraph.dataset.start);
    const startPos = start - paragraphStart;
    const contentLength = Number(paragraph.dataset.end) - paragraphStart;
    if (startPos >= contentLength) {
      return startPos === contentLength;
    }
    const endPos = Math.min(startPos + length, contentLength);
    const range = this.getTextRange(paragraph, startPos, endPos - startPos);
    if (!range) return false;
    if (textHighlight) {
      const mark = document.createElement('mark');
      mark.classList.add('read-search-highlight');
      mark.appendChild(range.extractContents());
      range.insertNode(mark);
      return mark;
    }
    const highlight = container.querySelector('.read-highlight');
    const containerRect = container.getBoundingClientRect();
    const rects = Array.from(range.getClientRects()).filter(rect => rect.width * rect.height);
    const lineHeight = Number.parseFloat(window.getComputedStyle(range.startContainer.parentNode).lineHeight);
    const [pageWidth, pageHeight] = onResize.currentSize();
    const highlightSpanList = rects.map(rect => {
      if (rect.top > pageHeight) return null;
      if (rect.left > pageWidth) return null;
      const height = Math.min(rect.height, lineHeight - 1);
      const span = document.createElement('span');
      span.style.left = (rect.left - containerRect.left) + 'px';
      span.style.width = rect.width + 'px';
      span.style.top = ((rect.top + rect.bottom - height) / 2 - containerRect.top) + 'px';
      span.style.height = height + 'px';
      highlight.appendChild(span);
      return span;
    });
    return highlightSpanList.filter(x => x != null).length > 0;
  }
  forceUpdate() {
    this.resetPage({ resetRender: true });
  }
  highlightSearchMatches(reg, start, length, depth = 0) {
    const result = this.highlightChars(start, length, true, depth);
    if (result == null) return null;
    this.clearSearchTextHighlight();
    const page = this.pages.current;
    if (!page) return result;
    const paragraphs = Array.from(page.container.querySelectorAll('p[data-start]'));
    const marks = [];
    paragraphs.forEach(paragraph => {
      const paragraphStart = Number(paragraph.dataset.start);
      const paragraphEnd = Number(paragraph.dataset.end ?? (paragraphStart + paragraph.textContent.length));
      const text = paragraph.textContent;
      marks.push(...this.markSearchMatches(paragraph, text, reg, 0, paragraphEnd - paragraphStart));
    });
    return marks.length ? marks : result;
  }
  isInPage(cursor) {
    const current = this.pages.current;
    if (!current) return false;
    const prev = this.pages.prev;
    const prevNext = prev ? prev.nextCursor : Infinity;
    const currentCursor = current.cursor;
    if (cursor < Math.min(prevNext, currentCursor)) return false;
    const next = this.pages.next;
    const nextCursor = next ? next.cursor : 0;
    const currentNext = current.nextCursor;
    if (cursor >= Math.max(currentNext, nextCursor)) return false;
    return true;
  }
  cursorChange(cursor, config) {
    const current = this.pages.current;
    if (!current || current.cursor !== cursor) {
      this.resetPage(config);
    }
  }
  onResize() {
    super.onResize();
    this.resetPage({ resetRender: true });
  }
}
