/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import Page from '../page.js';
import file from '../../data/file.js';
import text from '../../text/text.js';
import i18n from '../../i18n/i18n.js';
import config from '../../data/config.js';
import template from '../../ui/util/template.js';
import dom from '../../ui/util/dom.js';
import ItemList from '../../ui/component/itemlist.js';
import Menu from '../../ui/component/menu.js';
import modal from '../../ui/component/modal.js';
import importFolder from '../../platform/import-folder.js';
import runtime from '../../platform/runtime.js';
import { getImportedBookSource } from '../../data/migration-source.js';
import { fileFromNativeEntry, getDropFile, getSupportedDropPath, hasFileDrop, isSupportedImportFile } from './file-drop.mjs';

const showAlert = message => modal.alert(message, {
  title: i18n.getMessage('modalTitle'),
  closeText: i18n.getMessage('modalClose'),
}).catch(error => console.warn('List notification failed:', error));

const importFileTypeSet = new Set([
  'text/plain',
  'application/gzip',
  'application/x-gzip',
  'application/epub+zip',
]);

const getDateTimestamp = function (value) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export default class ListPage extends Page {
  constructor() {
    super(document.querySelector('#list_page'));
    this.saveImportQueue = Promise.resolve();
    this.importQueue = Promise.resolve();
    this.scrollToListRaf = 0;
    this.searchTimer = null;
    this.fileMetaCache = null;
    this.fileMetaLoadPromise = null;
    this.batchMode = false;
    this.batchSelected = new Set();
  }
  matchUrl(url) { return url === '/'; }
  getUrl(param) { return '/'; }
  async onFirstActivate() {
    const headerRef = template.create('header');
    this.element.insertBefore(headerRef.get('root'), this.element.firstChild);
    this.addButton = template.iconButton('add', i18n.getMessage('buttonAdd'));
    this.refreshButton = template.iconButton('refresh', '刷新文件夹');
    this.batchButton = template.iconButton('select', '多选删除');
    this.configButton = template.iconButton('settings', i18n.getMessage('buttonSettings'));
    headerRef.get('left').appendChild(this.addButton);
    headerRef.get('left').appendChild(this.refreshButton);
    headerRef.get('left').appendChild(this.batchButton);
    headerRef.get('right').appendChild(this.configButton);

    /** @type {HTMLInputElement} */
    this.fileButton = document.querySelector('#file');

    this.fileListContainer = document.querySelector('#file_list_container');
    this.fileListElement = document.querySelector('#file_list');
    this.fileListSensor = document.querySelector('#file_list_sensor');
    this.fileListTop = document.querySelector('#file_list_top');
    this.fileDropArea = document.querySelector('#drop_area');
    this.searchContainer = this.fileListContainer.querySelector('.list-filter');
    this.searchInput = this.searchContainer.querySelector('.list-filter input');
    this.searchClearButton = template.iconButton('remove', i18n.getMessage('listFilterClear'));
    this.sortButton = this.fileListContainer.querySelector('.list-sort button');
    this.sortContent = this.fileListContainer.querySelector('.list-sort-content');
    this.importTip = document.querySelector('#import_tip');

    this.searchInput.placeholder = i18n.getMessage('listSearchPlaceholder');
    this.searchClearButton.classList.add('list-filter-clear');
    this.searchClearButton.disabled = true;
    this.searchContainer.appendChild(this.searchClearButton);
    this.sortKey = {
      dateread: i18n.getMessage('listSortByDateRead'),
      dateadd: i18n.getMessage('listSortByDateAdd'),
      title: i18n.getMessage('listSortByTitle'),
    };
    this.sortMenu = new Menu({
      groups: [['dateread', 'dateadd', 'title'].map(value => ({
        title: this.sortKey[value],
        value,
      })), [{
        title: i18n.getMessage('listSortCancel'),
      }]],
    });
    this.initialListener();
    this.options = { sortBy: 'dateread', search: '' };
  }
  async onActivate() {
    this.updateSort();
    this.langTag = await config.get('cjk_lang_tag', navigator.language || 'und');
    await this.updateList({ force: true });
  }
  show() {
    super.show();
    this.scrollToList();
  }
  async onInactivate() {
    if (this.scrollToListRaf) cancelAnimationFrame(this.scrollToListRaf);
    this.scrollToListRaf = 0;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = null;
    this.clearList();
  }
  invalidateFileMetaCache() {
    this.fileMetaCache = null;
  }
  async getFileMetaList({ force = false } = {}) {
    if (force) this.invalidateFileMetaCache();
    if (this.fileMetaCache) return this.fileMetaCache;
    if (!this.fileMetaLoadPromise) {
      this.fileMetaLoadPromise = file.list().then(files => {
        this.fileMetaCache = files;
        return files;
      }).finally(() => {
        this.fileMetaLoadPromise = null;
      });
    }
    return this.fileMetaLoadPromise;
  }
  initialListener() {
    this.addButton.addEventListener('click', event => {
      this.fileButton.click();
    });
    this.refreshButton.addEventListener('click', event => {
      this.refreshFolderBooks();
    });
    this.batchButton.addEventListener('click', () => {
      this.toggleBatchMode();
    });
    this.fileButton.addEventListener('change', async event => {
      const files = this.fileButton.files;
      if (files.length === 1) {
        await this.importFile(files.item(0));
      }
      this.fileButton.value = null;
    });
    this.configButton.addEventListener('click', event => {
      this.router.go('config');
    });
    this.searchInput.addEventListener('focus', event => {
      this.fileListContainer.scrollTop = 0;
    });
    this.searchInput.addEventListener('input', event => {
      this.updateSearch();
    });
    this.searchClearButton.addEventListener('click', event => {
      this.clearSearch();
    });

    /** @param {DragEvent} event */
    const isValidFlieDragEvent = event => {
      if (!hasFileDrop(event.dataTransfer)) return false;
      const file = getDropFile(event.dataTransfer);
      // WebView2 may hide the file object during dragover; validate again on drop.
      return !file || isSupportedImportFile(file);
    };
    this.fileListElement.addEventListener('dragover', event => {
      if (isValidFlieDragEvent(event)) {
        this.fileListElement.classList.add('file-drag-over');
      } else {
        this.fileListElement.classList.remove('file-drag-over');
      }
      event.preventDefault();
    });
    this.fileDropArea.addEventListener('dragleave', event => {
      this.fileListElement.classList.remove('file-drag-over');
      event.preventDefault();
    });
    this.fileListElement.addEventListener('drop', event => {
      this.fileListElement.classList.remove('file-drag-over');
      event.preventDefault();
      const file = getDropFile(event.dataTransfer);
      if (!isSupportedImportFile(file)) return;
      this.importFile(file);
    });

    const listen = runtime.getTauriEventListener();
    const invoke = runtime.getTauriInvoker();
    if (listen && invoke) {
      const clearNativeDragState = () => {
        this.fileListElement.classList.remove('file-drag-over');
      };
      Promise.all([
        listen('tauri://drag-enter', event => {
          if (getSupportedDropPath(event.payload?.paths)) {
            this.fileListElement.classList.add('file-drag-over');
          }
        }),
        listen('tauri://drag-over', () => {
          if (this.fileListElement.classList.contains('file-drag-over')) return;
        }),
        listen('tauri://drag-leave', clearNativeDragState),
        listen('tauri://drag-drop', async event => {
          clearNativeDragState();
          const path = getSupportedDropPath(event.payload?.paths);
          if (!path) return;
          try {
            const entry = await invoke('read_dropped_file', { path });
            await this.importFile(fileFromNativeEntry(entry));
          } catch (error) {
            console.warn('native file drop import failed:', error);
            void showAlert(i18n.getMessage('listImportFail'));
          }
        }),
      ]).catch(error => console.warn('native drag-drop listener setup failed:', error));
    }
    this.sortMenu.bind(this.sortButton, sortBy => {
      if (!sortBy) return;
      this.options.sortBy = sortBy;
      this.updateSort();
      this.updateList();
    });
  }
  async enqueueImport(work) {
    const result = this.importQueue.then(work, work);
    this.importQueue = result.catch(() => null);
    return result;
  }
  /** @param {File} item */
  async importFile(item, options = {}) {
    return this.enqueueImport(() => this.importFileNow(item, options));
  }
  async importFileNow(item, { refreshUI = true, saveImportedFile = true, manageImportTip = true, showErrorAlert = true, waitForFileSave = false, checkDuplicate = true, sourceFolderId = undefined } = {}) {
    let result = null;
    try {
      if (sourceFolderId === undefined) {
        try {
          sourceFolderId = (await importFolder.getSelection()).folderId || null;
        } catch (_error) {
          sourceFolderId = null;
        }
      }
      if (manageImportTip) {
        this.importTip.style.display = 'block';
      }
      const book = await text.readBook(item);
      result = await file.add(
        {
          title: book.title,
          content: book.content,
          sourceName: item.name || null,
          sourceFolderId: sourceFolderId || null,
          source: getImportedBookSource(book, item),
        },
        { checkDuplicate }
      );
      if (book.index?.items?.length) {
        await file.setIndex({ id: result.id, ...book.index });
      } else {
        Promise.resolve().then(async () => {
          await text.guessContent(book.content, result);
        }).catch(e => {
          console.warn('自动目录生成失败:', e);
        });
      }
      await file.restorePlaceholder(result);
      this.invalidateFileMetaCache();
      if (saveImportedFile) {
        const saving = this.scheduleImportFileSave(item, { showErrorAlert });
        if (waitForFileSave) {
          await saving;
        }
      }
    } catch (e) {
      if (e.message && e.message.includes('已存在')) {
        console.warn('跳过重复书籍:', e.message);
      } else if (showErrorAlert) {
        void showAlert(i18n.getMessage('listImportFail'));
      }
    } finally {
      if (manageImportTip) {
        this.importTip.style.display = 'none';
      }
      if (refreshUI) {
        this.clearSearch();
        this.updateList();
        this.scrollToList();
      }
    }
    return result;
  }
  async refreshFolderBooks() {
    return this.enqueueImport(() => this.refreshFolderBooksNow());
  }
  async refreshFolderBooksNow() {
    const selection = await importFolder.getSelection();
    if (!selection.handle && !selection.folderId) {
      void showAlert(i18n.getMessage('listRefreshFolderUnset'));
      return;
    }

    try {
      this.importTip.style.display = 'block';
      this.importTip.querySelector('.tip-content span').textContent = i18n.getMessage('listRefreshScanning');
      console.log('开始刷新文件夹书籍...');

      const files = await importFolder.listFiles();
      const bookFiles = files.filter(fileObj =>
        importFileTypeSet.has(fileObj.type || '') || /\.(txt|gz|epub)$/i.test(fileObj.name || '')
      );

      console.log(`共找到 ${bookFiles.length} 个书籍文件`);

      if (bookFiles.length === 0) {
        void showAlert(i18n.getMessage('listRefreshEmpty'));
        return;
      }

      const existingFiles = await file.list();
      const activeFiles = existingFiles.filter(meta => !meta.configOnly);
      const existingSourceNames = new Set(activeFiles.map(meta => meta.sourceName).filter(Boolean));
      const existingTitles = new Set(activeFiles.map(meta => meta.title));
      const importedSourceNames = new Set(existingSourceNames);
      const importedTitles = new Set(existingTitles);
      let importedCount = 0;
      let failedCount = 0;
      for (let fileIndex = 0; fileIndex < bookFiles.length; fileIndex++) {
        const bookFile = bookFiles[fileIndex];
        try {
          this.importTip.querySelector('.tip-content span').textContent = i18n.getMessage('listRefreshImporting', fileIndex + 1, bookFiles.length);
          const bookTitle = text.parseFilename(bookFile.name);
          if (importedSourceNames.has(bookFile.name) || importedTitles.has(bookTitle)) {
            console.log(`跳过已存在的书籍: ${bookFile.name}`);
            continue;
          }
          const sourceFile = bookFile instanceof File ? bookFile : await importFolder.readFile({
            name: bookFile.name,
            folderId: selection.folderId,
          });
          if (!sourceFile) throw new Error('无法读取书籍文件');
          const result = await this.importFileNow(sourceFile, {
            refreshUI: false,
            saveImportedFile: false,
            manageImportTip: false,
            showErrorAlert: false,
            waitForFileSave: false,
            checkDuplicate: false,
            sourceFolderId: selection.folderId || null,
          });
          if (result) {
            importedTitles.add(result.title);
            if (result.sourceName) importedSourceNames.add(result.sourceName);
            importedCount++;
            console.log(`已导入: ${bookFile.name}`);
          }
        } catch (e) {
          failedCount++;
          console.error(`导入失败 ${bookFile.name}:`, e);
        }
        if ((fileIndex + 1) % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));
      }

      this.clearSearch();
      this.updateList();
      this.scrollToList();
      modal.toast(i18n.getMessage('listRefreshComplete', importedCount, failedCount));
    } catch (e) {
      console.error('刷新文件夹失败:', e);
      void showAlert(i18n.getMessage('listRefreshFailed', e?.message || e));
    } finally {
      this.importTip.style.display = 'none';
      this.importTip.querySelector('.tip-content span').textContent = i18n.getMessage('listImportTip');
    }
  }
  scheduleImportFileSave(item, { showErrorAlert = false } = {}) {
    this.saveImportQueue = this.saveImportQueue
      .then(() => this.saveImportFileToFolder(item, { showErrorAlert }))
      .catch(() => null);
    return this.saveImportQueue;
  }
  async saveImportFileToFolder(item, { showErrorAlert = true } = {}) {
    try {
      const saved = await importFolder.saveFile({
        name: item.name,
        bytes: item,
      });
      if (!saved && showErrorAlert) {
        void showAlert(i18n.getMessage('listImportSaveFail'));
      }
    } catch (e) {
      console.warn('save imported file failed:', e);
      if (showErrorAlert) {
        void showAlert(i18n.getMessage('listImportSaveFail'));
      }
    }
  }
  scrollToList() {
    if (!this.active) return;
    if (this.scrollToListRaf) cancelAnimationFrame(this.scrollToListRaf);
    const update = () => {
      this.scrollToListRaf = 0;
      if (!this.active) return;
      if (this.fileListSensor.clientHeight) {
        this.fileListContainer.scrollTop = this.fileListTop.clientHeight + 1;
      } else {
        this.scrollToListRaf = requestAnimationFrame(update);
      }
    };
    this.scrollToListRaf = requestAnimationFrame(update);
  }
  async updateList({ force = false } = {}) {
    const token = this.lastToken = {};
    const files = this.searchFiles([...(await this.getFileMetaList({ force }))]);
    this.sortFiles(files);
    if (token !== this.lastToken) return;

    this.clearList();

    /**
     * @param {HTMLElement} container
     * @param {import('./storage.js').ReaderFileMeta} file
     */
    const render = (container, file) => {
      if (container.firstChild) return;
      const ref = template.create('fileListItem');
      const title = ref.get('title');
      title.textContent = file.title;
      title.lang = this.langTag;
      const dateLang = i18n.getMessage('locale');
      const date = file.lastAccessTime.toLocaleDateString(dateLang);
      ref.get('date').textContent = date;
      ref.get('date').lang = dateLang;
      ref.get('date').setAttribute('datetime', file.lastAccessTime.toISOString());
      const percent = file.cursor ?
        (file.cursor / file.length * 100).toFixed(2) + '%' :
        i18n.getMessage('listNotYetRead');
      ref.get('detail').textContent = percent;
      container.appendChild(ref.get('root'));
    };
    const onItemClick = item => {
      if (this.batchMode) {
        this.toggleSelectItem(item.id);
      } else if (item.configOnly) {
        const sourceName = item.sourceName || '';
        const sourceType = /\.epub$/i.test(sourceName)
          ? 'EPUB'
          : /\.gz$/i.test(sourceName)
            ? 'GZ'
            : /\.txt$/i.test(sourceName)
              ? 'TXT'
              : 'TXT/GZ/EPUB';
        const location = item.sourceFolderId ? '\n可重新选择保存原文件的导入目录后恢复。' : '';
        const message = location
          ? i18n.getMessage('listConfigOnlyBookWithFolder', sourceType, location)
          : i18n.getMessage('listConfigOnlyBook', sourceType);
        void showAlert(message);
      } else {
        this.router.go('read', { id: item.id });
      }
    };
    const onRemove = async (item, index) => {
      const deleted = await this.deleteImportFileFromFolder(item);
      if (!deleted) return;
      await file.remove(item.id);
      this.invalidateFileMetaCache();
      this.fileList.removeItem(index);
    };
    const emptyListRender = container => {
      const text = container.appendChild(document.createElement('div'));
      if (this.options.search) {
        text.textContent = i18n.getMessage('listEmptySearchTip');
      } else {
        text.textContent = i18n.getMessage('listEmptyTip');
      }
    };
    this.fileList = new ItemList(this.fileListElement, {
      list: files,
      render,
      onItemClick,
      onRemove,
      emptyListRender,
    });
  }
  async deleteImportFileFromFolder(item) {
    const name = item?.sourceName;
    if (!name) {
      console.log('No sourceName found for item:', item?.title);
      return true;
    }
    // A legacy source path is not a native authorization. Without a persisted
    // folder ID, remove only the bookshelf record.
    if (!item?.sourceFolderId) {
      console.log('Skip deleting untrusted same-name folder file:', name);
      return true;
    }

    try {
      const deleted = await importFolder.deleteFile({ name, folderId: item.sourceFolderId });
      if (!deleted) {
        console.log('File not deleted from import folder:', name);
      }
      return deleted;
    } catch (e) {
      if (e?.name === 'NotFoundError') {
        console.log('File already deleted:', name);
        return true;
      }
      if (e?.name === 'NotAllowedError') {
        void showAlert(i18n.getMessage('listImportDeleteNoPermission'));
        return false;
      }
      if (e?.name === 'InvalidModificationError') {
        void showAlert(i18n.getMessage('listImportDeleteIsDirectory'));
        return false;
      }
      console.error('Failed to delete file:', name, e);
      void showAlert(i18n.getMessage('listImportDeleteFail'));
      return false;
    }
  }

  toggleBatchMode() {
    this.batchMode = !this.batchMode;
    this.batchSelected.clear();
    this.batchButton.setAttribute('aria-label', this.batchMode ? '退出多选' : '多选删除');
    this.batchButton.classList.toggle('list-batch-active', this.batchMode);
    if (this.batchMode) { this.showBatchBar(); } else { this.hideBatchBar(); }
    this.updateList();
  }
  exitBatchMode() {
    this.batchMode = false;
    this.batchSelected.clear();
    this.hideBatchBar();
    this.updateList();
  }
  toggleSelectItem(id) {
    if (this.batchSelected.has(id)) { this.batchSelected.delete(id); } else { this.batchSelected.add(id); }
    this.updateBatchBar();
    this.updateSelectUI();
  }
  updateSelectUI() {
    const items = this.fileList.list;
    for (let i = 0; i < items.length; i++) {
      const el = this.fileList.getItemElement(i);
      if (!el) continue;
      const li = el.closest('.list-item');
      if (!li) continue;
      if (this.batchSelected.has(items[i].id)) { li.classList.add('list-item-batch-selected'); }
      else { li.classList.remove('list-item-batch-selected'); }
    }
  }
  async selectAll() {
    const items = this.fileList.list;
    if (this.batchSelected.size === items.length) { this.batchSelected.clear(); }
    else { items.forEach(f => this.batchSelected.add(f.id)); }
    this.updateBatchBar();
    this.updateSelectUI();
  }
  async batchDelete() {
    if (this.batchSelected.size === 0) return;
    const confirmed = await modal.confirm(i18n.getMessage('listBatchDeleteConfirm', this.batchSelected.size), {
      title: i18n.getMessage('modalTitle'),
      confirmText: i18n.getMessage('modalConfirm'),
      cancelText: i18n.getMessage('modalCancel'),
    }).catch(error => {
      console.warn('Batch delete confirmation failed:', error);
      return false;
    });
    if (!confirmed) return;
    const ids = [...this.batchSelected];
    for (const id of ids) {
      const items = this.fileList.list;
      const item = items.find(f => f.id === id);
      if (item) {
        let deleted = false;
        try { deleted = await this.deleteImportFileFromFolder(item); } catch (e) { console.warn('delete file fail:', e); }
        if (!deleted) continue;
        try {
          await file.remove(item.id);
          this.invalidateFileMetaCache();
        } catch (e) { console.warn('remove db fail:', e); }
      }
    }
    this.exitBatchMode();
  }
  showBatchBar() {
    if (this.batchBar) return;
    this.batchBar = document.createElement('div');
    this.batchBar.className = 'batch-action-bar';
    this.batchBar.innerHTML = '<button class="batch-select-all">' + i18n.getMessage('listBatchSelectAll') + '</button><span class="batch-count"></span><button class="batch-delete">' + i18n.getMessage('listBatchDelete') + '</button>';
    this.batchBar.querySelector('.batch-select-all').addEventListener('click', () => this.selectAll());
    this.batchBar.querySelector('.batch-delete').addEventListener('click', () => this.batchDelete());
    this.element.appendChild(this.batchBar);
  }
  hideBatchBar() { if (this.batchBar) { this.batchBar.remove(); this.batchBar = null; } }
  updateBatchBar() {
    if (!this.batchBar) return;
    const count = this.batchSelected.size;
    this.batchBar.querySelector('.batch-count').textContent = i18n.getMessage('listBatchSelectedCount', count);
    this.batchBar.querySelector('.batch-delete').disabled = count === 0;
  }
  async requestFolderPermission(handle) {
    if (!handle) return false;
    let permission = 'granted';
    try {
      if (typeof handle.queryPermission === 'function') { permission = await handle.queryPermission({ mode: 'readwrite' }); }
      if (permission !== 'granted' && typeof handle.requestPermission === 'function') { permission = await handle.requestPermission({ mode: 'readwrite' }); }
      return permission === 'granted';
    } catch (e) { console.warn('folder permission error:', e); return typeof handle.removeEntry === 'function'; }
  }
  async backupBooks() {
    try {
      const backup = await file.exportAll();
      if (backup.length === 0) { void showAlert(i18n.getMessage('listBackupEmpty')); return; }
      const json = JSON.stringify(backup);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tReader-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error('Backup failed:', e); void showAlert(i18n.getMessage('listBackupFailed', e.message)); }
  }
  async restoreBooks() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async () => {
      try {
        const f = input.files[0];
        if (!f) return;
        const txt = await f.text();
        const backup = JSON.parse(txt);
        if (!Array.isArray(backup)) { void showAlert(i18n.getMessage('listRestoreInvalidFormat')); return; }
        const count = await file.importBackup(backup);
        this.invalidateFileMetaCache();
        await this.updateList();
        modal.toast(i18n.getMessage('listRestoreComplete', count));
      } catch (e) { console.error('Restore failed:', e); void showAlert(i18n.getMessage('listRestoreFailed', e.message)); }
    });
    input.click();
  }
  clearList() {
    if (this.fileList) {
      this.fileList.dispatch();
      this.fileList = null;
    }
  }
  updateSearch({ immediate = false } = {}) {
    const search = this.searchInput.value.trim();
    this.options.search = search;
    this.searchClearButton.disabled = !search;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = null;
    if (immediate) return this.updateList();
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      if (this.active) this.updateList();
    }, 150);
    return Promise.resolve();
  }
  clearSearch() {
    this.searchInput.value = '';
    return this.updateSearch({ immediate: true });
  }
  updateSort() {
    this.sortContent.querySelector('span').textContent = this.sortKey[this.options.sortBy];
  }
  searchFiles(/** @type {import('../../data/storage.js').ReaderFileMeta[]} */files) {
    const search = this.options.search;
    if (!search) return files;
    return files.filter(item => item.title.includes(search));
  }
  sortFiles(/** @type {import('../../data/storage.js').ReaderFileMeta[]} */files) {
    if (files.length <= 1) return files;
    const sortBy = this.options.sortBy;
    const cmp = {
      dateread: (a, b) => {
        const aOrder = Number.isFinite(Number(a.migrationOrder))
          ? Number(a.migrationOrder)
          : Number(a.importOrder);
        const bOrder = Number.isFinite(Number(b.migrationOrder))
          ? Number(b.migrationOrder)
          : Number(b.importOrder);
        if (Number.isFinite(aOrder) && Number.isFinite(bOrder) && aOrder !== bOrder) {
          return aOrder - bOrder;
        }
        return getDateTimestamp(b.lastAccessTime) - getDateTimestamp(a.lastAccessTime)
          || Number(b.id) - Number(a.id);
      },
      dateadd: (a, b) => getDateTimestamp(b.createTime) - getDateTimestamp(a.createTime)
        || Number(b.id) - Number(a.id),
      title: (a, b) => a.title.localeCompare(b.title, this.langTag || navigator.language),
    }[sortBy];
    return files.sort(cmp);
  }
}
