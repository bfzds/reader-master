/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import IndexPage from './index/indexpage.js';
import ReadIndex from './index/readindex.js';
import JumpPage from './jump/jumppage.js';
import ControlPage from './control/controlpage.js';
import FlipTextPage from './text/fliptextpage.js';
import ScrollTextPage from './text/scrolltextpage.js';
import Page from '../page.js';
import file from '../../data/file.js';
import config from '../../data/config.js';
import onResize from '../../ui/util/onresize.js';
import i18n from '../../i18n/i18n.js';
import wakelock from '../../ui/util/wakelock.js';
import { createEpubResourceLoader } from '../../text/epub.js';
import text from '../../text/text.js';
import importFolder from '../../platform/import-folder.js';

export default class ReadPage extends Page {
  constructor() {
    super(document.querySelector('#read_page'));

    /** @type {boolean} */
    this.useSideIndex = null;
    this.onResize = this.onResize.bind(this);
    this.keyboardEvents = this.keyboardEvents.bind(this);
    this.onConfigChange = this.onConfigChange.bind(this);
    // Keep backward compatibility with cached/older call sites.
    this.updateDebugLoggerState = this.updateDebugLoggerState.bind(this);
    this.onDebugConsoleChange = this.onDebugConsoleChange.bind(this);
    this.flushMetaSave = this.flushMetaSave.bind(this);
    this.metaSaveQueue = Promise.resolve();
    this.metaSaveTimer = null;
    this.pendingMetaSave = null;
    this.sourceLoadPromise = null;
    this.textReflowFrame = 0;
    this.epubWarmupTimer = null;
    this.editSaveQueue = Promise.resolve();
    this.readSession = 0;
  }
  updateDebugLoggerState(_enabled) { }
  onDebugConsoleChange(_value) { }
  matchUrl(url) {
    if (!/\/read\/\d+/.test(url)) return null;
    const id = +url.split('/').pop();
    if (!id) return null;
    return { id };
  }
  getUrl({ id }) { return '/read/' + id; }
  async onFirstActivate() {
    this.container = document.querySelector('#read_page');

    this.controlPageElement = this.container.querySelector('.read-control');
    this.controlPage = new ControlPage(this.controlPageElement, this);

    this.indexPageElement = this.container.querySelector('.read-index');
    this.indexPage = new IndexPage(this.indexPageElement, this);

    this.jumpPageElement = this.container.querySelector('.read-jump');
    this.jumpPage = new JumpPage(this.jumpPageElement, this);

    this.subPages = [this.controlPage, this.indexPage, this.jumpPage];
    this.subPages.forEach(page => { page.onFirstActivate(); });

    this.container.addEventListener('scroll', event => {
      this.container.scrollTop = 0;
      this.container.scrollLeft = 0;
      event.preventDefault();
    });

    const mayShare = this.canShareFile();
    this.shareFile = this.shareFile.bind(this);
    if (mayShare) {
      this.controlPage.registerMoreMenu(i18n.getMessage('readMenuShare'), this.shareFile);
    }
    this.downloadFile = this.downloadFile.bind(this);
    const maybeNeedDownload = !mayShare ||
      (navigator.userAgentData?.mobile !== true && !['iPhone', 'iPad'].includes(navigator.platform));
    if (maybeNeedDownload) {
      this.controlPage.registerMoreMenu(i18n.getMessage('readMenuDownload'), this.downloadFile);
    }
    this.openEditor = this.openEditor.bind(this);
    this.controlPage.registerMoreMenu(i18n.getMessage('readMenuEdit'), this.openEditor);
    this.createEditor();
  }
  /**
   * @param {{ id: number }} config
   */
  async onActivate({ id }) {
    const session = ++this.readSession;
    const [langTag, renderStyle, autoLockConfig, imageLoading, screenWidthSideIndex] = await Promise.all([
      config.get('cjk_lang_tag', 'und'),
      config.get('view_mode', 'flip'),
      config.get('auto_lock', 'normal'),
      config.get('epub_image_loading', 'enable'),
      // EXPERT_CONFIG when index page show as side bar
      config.expert('appearance.screen_width_side_index', 'number', 960),
    ]);
    /** @type {string} */
    this.langTag = langTag;
    /** @type {'flip' | 'scroll'} */
    this.renderStyle = renderStyle;
    /** @type {'normal' | 'disable'} */
    this.autoLockConfig = autoLockConfig === 'disable' ? 'disable' : 'normal';
    /** @type {boolean} */
    this.loadImages = imageLoading !== 'disable';
    this.screenWidthSideIndex = screenWidthSideIndex;

    this.articleId = id;
    console.log('Loading book content for ID:', id);
    const [meta, index, content] = await Promise.all([
      file.getMeta(id),
      file.getIndex(id),
      file.content(id),
    ]);
    if (session !== this.readSession) return;

    if (this.autoLockConfig === 'disable') {
      wakelock.request();
    }

    this.meta = meta;
    this.source = null;
    this.resources = typeof content === 'object' && content !== null ? (content.resources || {}) : {};
    this.content = typeof content === 'string' ? content : content?.text ?? '';
    this.index = index;
    if (!this.meta || this.content == null) {
      this.gotoList();
      return;
    }
    this.resourceLoader = null;
    await file.setMeta(this.meta);

    this.readIndex = new ReadIndex(this);
    if (this.renderStyle === 'flip') {
      this.textPage = new FlipTextPage(this);
      this.container.classList.add('read-page-flip');
    } else {
      this.textPage = new ScrollTextPage(this);
      this.container.classList.add('read-page-scroll');
    }
    await this.textPage.onActivate({ id });

    document.addEventListener('keydown', this.keyboardEvents);
    this.router.setTitle(this.meta.title, this.getLang());

    this.subPages.forEach(page => { page.onActivate(); });
    this.updateSideIndex();
    if (this.loadImages) this.scheduleEpubResourceWarmup();

    config.addListener('epub_image_loading', this.onConfigChange);
  }
  onConfigChange(value) {
    this.loadImages = value !== 'disable';
    if (this.loadImages) {
      this.scheduleEpubResourceWarmup();
    } else if (this.epubWarmupTimer) {
      clearTimeout(this.epubWarmupTimer);
      this.epubWarmupTimer = null;
    }
    this.textPage?.resetPage?.({ resetRender: true });
  }
  async onUpdate({ id }) {
    await this.onInactivate();
    await this.onActivate({ id });
  }
  async onInactivate() {
    await this.flushEditorSave();
    await this.editSaveQueue;
    // Invalidate pending resource work before clearing the active book state.
    ++this.readSession;
    await this.flushMetaSave();
    config.removeListener('epub_image_loading', this.onConfigChange);

    if (this.autoLockConfig === 'disable') {
      wakelock.release();
    }
    this.meta = null;
    this.source = null;
    this.sourceLoadPromise = null;
    this.index = null;
    this.content = null;
    this.resources = null;
    this.pages = null;
    this.readIndex = null;
    this.useSideIndex = null;
    document.removeEventListener('keydown', this.keyboardEvents);
    this.subPages.forEach(page => { page.onInactivate(); });
    const textPage = this.textPage;
    this.textPage = null;
    if (textPage) await textPage.onInactivate();
    this.resourceLoader?.destroy();
    this.resourceLoader = null;
    if (this.textReflowFrame) cancelAnimationFrame(this.textReflowFrame);
    this.textReflowFrame = 0;
    if (this.epubWarmupTimer) clearTimeout(this.epubWarmupTimer);
    this.epubWarmupTimer = null;
    await this.closeEditor();
    this.container.classList.remove('read-page-scroll', 'read-page-flip');
    this.router.setTitle();
  }
  gotoList() {
    this.router.go('list');
  }
  show() {
    super.show();
    // Some text page render requires rendered dom to meansure its element size
    // So we have to put it after show().
    this.textPage.initUpdatePage();
    this.indexPage.initUpdatePage();
    onResize.addListener(this.onResize);
  }
  hide() {
    super.hide();
    onResize.removeListener(this.onResize);
  }
  onResize() {
    this.updateSideIndex();
    this.subPages.forEach(page => { page.onResize(); });
  }
  scheduleTextReflow() {
    if (this.textReflowFrame) return;
    const session = this.readSession;
    const textPage = this.textPage;
    this.textReflowFrame = requestAnimationFrame(() => {
      this.textReflowFrame = 0;
      if (!this.active || session !== this.readSession || textPage !== this.textPage) return;
      textPage.onResize();
    });
  }
  keyboardEvents(event) {
    if (event.code === 'Escape') {
      const current = this.activedSubpage();
      if (current) current.hide();
      else if (this.controlPage.hasFocus) this.controlPage.hide();
      else this.controlPage.focus();
    }
  }
  updateIndexRender(resized = this.useSideIndex) {
    const active = this.isIndexActive();
    if (active) {
      this.container.classList.add('read-show-index');
    } else {
      this.container.classList.remove('read-show-index');
    }
    if (active && !this.useSideIndex) {
      this.controlPage.disable();
      this.textPage.hide();
    } else {
      this.controlPage.enable();
      this.textPage.show();
    }
    if (resized) this.scheduleTextReflow();
  }
  updateSideIndex() {
    const [pageWidth, pageHeight] = onResize.currentSize();
    const sideIndex = pageWidth >= this.screenWidthSideIndex;
    if (sideIndex === this.useSideIndex) return;
    this.useSideIndex = sideIndex;
    if (sideIndex) {
      this.container.classList.add('read-page-wide');
      this.container.classList.remove('read-page-thin');
    } else {
      this.container.classList.remove('read-page-wide');
      this.container.classList.add('read-page-thin');
    }
    if (this.isIndexActive()) {
      this.updateIndexRender(true);
    }
  }
  isIndexActive() {
    return this.indexPage?.isCurrent;
  }
  isSideIndexActive() {
    return this.useSideIndex && this.indexPage.isCurrent;
  }
  slideIndexPage(action, offset) {
    this.indexPage.slideShow(action, offset);
  }
  toggleIndexPage(page) {
    if (this.isIndexActive() && this.indexPage.isSubPageCurrent(page)) {
      this.indexPage.hide();
    } else {
      this.indexPage.show(page);
    }
  }
  isControlActive() {
    return this.controlPage.isShow;
  }
  disableControlPage() {
    this.controlPage.hide();
    this.controlPage.disable();
  }
  enableControlPage() {
    this.controlPage.enable();
  }
  showControlPage(focus) {
    if (focus) {
      this.controlPage.focus();
    } else {
      this.controlPage.show();
    }
  }
  hideControlPage() {
    this.controlPage.hide();
  }
  toggleControlPage() {
    if (this.controlPage.isShow) this.controlPage.hide();
    else this.controlPage.show();
  }
  isJumpActive() {
    return this.jumpPage.isCurrent;
  }
  showJumpPage() {
    return this.jumpPage.show();
  }
  activedSubpage() {
    if (this.isIndexActive()) return this.indexPage;
    if (this.isControlActive()) return this.controlPage;
    if (this.isJumpActive()) return this.jumpPage;
    return null;
  }
  isTextPageOnTop() {
    if (this.isControlActive() || this.isJumpActive()) return false;
    if (this.isIndexActive()) return this.isSideIndexActive();
    return true;
  }
  /**
   * @returns The text position where user had read
   */
  getRawCursor() {
    return this.meta.cursor;
  }
  /**
   * @returns The text position where current page rendered
   */
  getRenderCursor() {
    return this.textPage.getRenderCursor();
  }
  /**
   * @typedef {Object} CursorChangeConfig
   * @property {boolean} resetRender
   */
  /**
   * @param {number} cursor
   * @param {CursorChangeConfig} config
   */
  setCursor(cursor, config) {
    if (this.meta.cursor === cursor) return;
    this.meta.cursor = cursor;
    this.pendingMetaSave = { ...this.meta };
    clearTimeout(this.metaSaveTimer);
    this.metaSaveTimer = setTimeout(this.flushMetaSave, 350);
    this.textPage.cursorChange(cursor, config);
    this.subPages.forEach(page => page.cursorChange(cursor, config));
  }
  queueMetaSave(meta) {
    this.metaSaveQueue = this.metaSaveQueue.then(() => file.setMeta(meta)).catch(error => {
      console.warn('Reading metadata save failed:', error);
    });
    return this.metaSaveQueue;
  }
  async flushMetaSave() {
    clearTimeout(this.metaSaveTimer);
    this.metaSaveTimer = null;
    const pending = this.pendingMetaSave;
    this.pendingMetaSave = null;
    if (!pending) return this.metaSaveQueue;
    return this.queueMetaSave(pending);
  }
  getContent() { return this.content; }
  getMeta() { return this.meta; }
  getResources() { return this.resources || {}; }
  getResource(key) { return this.getResources()[key] || null; }
  hasPathResources() {
    return Object.values(this.getResources()).some(resource => resource?.path);
  }
  async ensureResourceLoader() {
    if (this.resourceLoader) return this.resourceLoader;
    if (!this.sourceLoadPromise) {
      const session = this.readSession;
      const articleId = this.articleId;
      const loadPromise = file.source(articleId).then(source => {
        if (session !== this.readSession || articleId !== this.articleId || !source) return null;
        this.source = source;
        this.resourceLoader = createEpubResourceLoader(source);
        return this.resourceLoader;
      }).catch(error => {
        console.warn('EPUB source load failed:', error);
        return null;
      }).finally(() => {
        if (this.sourceLoadPromise === loadPromise) this.sourceLoadPromise = null;
      });
      this.sourceLoadPromise = loadPromise;
    }
    return this.sourceLoadPromise;
  }
  scheduleEpubResourceWarmup() {
    if (!this.hasPathResources() || this.epubWarmupTimer) return;
    const session = this.readSession;
    this.epubWarmupTimer = setTimeout(async () => {
      this.epubWarmupTimer = null;
      if (!this.active || session !== this.readSession) return;
      const loader = await this.ensureResourceLoader();
      if (!this.active || session !== this.readSession) return;
      await loader?.warmup();
    }, 0);
  }
  async acquireResourceLease(key) {
    const resource = this.getResource(key);
    if (!resource) return null;
    if (resource.src) return { url: resource.src, release() { } };
    if (!resource.path) return null;
    const resourceLoader = await this.ensureResourceLoader();
    return resourceLoader?.acquire(resource) || null;
  }
  async getResourceUrl(key) {
    const lease = await this.acquireResourceLease(key);
    if (!lease) return null;
    lease.release();
    return lease.url;
  }
  getLang() { return this.langTag; }
  getBookmarks() { return this.index.bookmarks; }
  getContents() { return this.index.content; }
  canShareFile() {
    try {
      if (!navigator.share) return false;
      if (!navigator.canShare) return false;
      const testFile = new File([''], 'file.txt', { type: 'text/plain' });
      return navigator.canShare({ files: [testFile] });
    } catch (_ignore) {
      return false;
    }
  }
  downloadContent() {
    const text = '\ufeff' + this.content.replace(/\r\n|\r|\n/g, '\r\n');
    return new TextEncoder().encode(text).buffer;
  }
  shareFile() {
    const file = new File([this.downloadContent()], this.meta.title + '.txt', { type: 'text/plain' });
    return navigator.share({ files: [file] });
  }
  downloadFile() {
    const blob = new Blob([this.downloadContent()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = this.meta.title + '.txt';
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => { URL.revokeObjectURL(url); }, 10e3);
  }
  createEditor() {
    this.editSaveQueue = Promise.resolve();
    this.editorElement = document.createElement('section');
    this.editorElement.className = 'read-editor';
    this.editorElement.hidden = true;
    this.editorElement.setAttribute('aria-label', i18n.getMessage('readEditTitle'));

    const header = document.createElement('div');
    header.className = 'read-editor-header';
    const title = document.createElement('h2');
    title.textContent = i18n.getMessage('readEditTitle');
    const actions = document.createElement('div');
    actions.className = 'read-editor-actions';
    this.editorCloseButton = document.createElement('button');
    this.editorCloseButton.type = 'button';
    this.editorCloseButton.textContent = i18n.getMessage('readEditClose');
    this.editorSaveButton = document.createElement('button');
    this.editorSaveButton.type = 'button';
    this.editorSaveButton.textContent = i18n.getMessage('readEditSave');
    actions.append(this.editorCloseButton, this.editorSaveButton);
    header.append(title, actions);

    this.editorTextarea = document.createElement('textarea');
    this.editorTextarea.className = 'read-editor-textarea';
    this.editorTextarea.spellcheck = false;
    this.editorStatus = document.createElement('div');
    this.editorStatus.className = 'read-editor-status';
    this.editorStatus.setAttribute('role', 'status');
    this.editorElement.append(header, this.editorTextarea, this.editorStatus);
    this.container.appendChild(this.editorElement);

    this.editorTextarea.addEventListener('input', () => this.scheduleEditorSave());
    this.editorSaveButton.addEventListener('click', async () => {
      await this.saveEditorContent(this.editorTextarea.value);
      this.closeEditor();
    });
    this.editorCloseButton.addEventListener('click', () => this.closeEditor());
    this.editorElement.addEventListener('keydown', event => {
      if (event.code === 'Escape') {
        event.preventDefault();
        this.closeEditor();
      }
    });
  }
  openEditor() {
    if (!this.meta || this.editorElement.hidden === false) return;
    this.controlPage.hide();
    this.editorTextarea.value = this.content;
    this.editorLastSavedContent = this.content;
    this.editorElement.hidden = false;
    this.editorTextarea.focus();
  }
  async closeEditor() {
    if (!this.editorElement || this.editorElement.hidden) return;
    await this.flushEditorSave();
    this.editorElement.hidden = true;
    this.editorTextarea.value = '';
  }
  scheduleEditorSave() {
    clearTimeout(this.editorSaveTimer);
    this.editorStatus.textContent = '';
    this.editorSaveTimer = setTimeout(() => {
      this.editorSaveTimer = null;
      this.saveEditorContent(this.editorTextarea.value);
    }, 800);
  }
  async flushEditorSave() {
    if (!this.editorElement || this.editorElement.hidden) return this.editSaveQueue;
    clearTimeout(this.editorSaveTimer);
    this.editorSaveTimer = null;
    if (this.editorTextarea.value !== this.editorLastSavedContent) {
      await this.saveEditorContent(this.editorTextarea.value);
    }
    return this.editSaveQueue;
  }
  async saveEditorContent(content) {
    if (content === this.editorLastSavedContent) return true;
    const nextContent = String(content);
    const session = this.readSession;
    const articleId = this.articleId;
    const meta = { ...this.meta };
    const index = {
      ...this.index,
      content: {
        ...(this.index?.content || {}),
        items: [],
      },
      bookmarks: Array.isArray(this.index?.bookmarks)
        ? this.index.bookmarks.map(bookmark => ({
          ...bookmark,
          cursor: Math.min(Math.max(Number(bookmark.cursor) || 0, 0), nextContent.length),
        }))
        : [],
    };
    const indexTemplate = index.content.template;
    const indexConfig = this.readIndex?.config;
    if (indexTemplate && indexConfig) {
      const items = text.generateContent(nextContent, indexTemplate, indexConfig);
      index.content.items = items || [];
      if (index.content.items.length) {
        index.content.items.unshift({ title: meta.title, cursor: 0 });
      }
    }
    const sourceName = meta.sourceName || `${meta.title}.txt`;
    this.editorLastSavedContent = nextContent;
    this.editorStatus.textContent = i18n.getMessage('readEditSaving');
    this.editSaveQueue = this.editSaveQueue.then(async () => {
      if (session !== this.readSession || articleId !== this.articleId) return false;
      const editedFile = await text.createEditedBookFile({
        title: meta.title,
        content: nextContent,
        sourceName,
      });
      meta.length = nextContent.length;
      meta.cursor = Math.min(meta.cursor || 0, nextContent.length);
      await file.updateBook(articleId, /\.epub$/i.test(sourceName)
        ? { text: nextContent, resources: {} }
        : nextContent, meta, { id: articleId, ...index }, editedFile);
      if (session !== this.readSession || articleId !== this.articleId) return false;
      this.content = nextContent;
      this.resources = {};
      this.meta = meta;
      Object.assign(this.index, { id: articleId, ...index });
      if (this.readIndex) this.readIndex.content = nextContent;
      this.source = editedFile;
      this.resourceLoader?.destroy();
      this.resourceLoader = null;
      this.textPage.resetPage({ resetRender: true });
      const synchronized = await this.syncEditedFile(editedFile);
      if (!this.editorElement.hidden) {
        this.editorStatus.textContent = i18n.getMessage(
          synchronized ? 'readEditSaved' : 'readEditFolderUnset'
        );
      }
      return true;
    }).catch(error => {
      console.error('Edited book save failed:', error);
      this.editorLastSavedContent = null;
      if (!this.editorElement.hidden) {
        this.editorStatus.textContent = i18n.getMessage('readEditSaveFail');
      }
      throw error;
    });
    return this.editSaveQueue;
  }
  async syncEditedFile(editedFile) {
    const saved = await importFolder.saveFile({
      name: editedFile.name,
      bytes: editedFile,
    });
    if (!saved) return false;
    return true;
  }
}
