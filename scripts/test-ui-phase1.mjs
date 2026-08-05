import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import en from '../app_unpacked/src/js/i18n/locale/en.js';
import zhCN from '../app_unpacked/src/js/i18n/locale/zh_cn.js';
import zhTW from '../app_unpacked/src/js/i18n/locale/zh_tw.js';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const readProjectFile = path => readFile(join(projectRoot, path), 'utf8');

const locales = { en, zhCN, zhTW };

const PHASE1_KEYS = [
  'modalTitle', 'modalConfirm', 'modalCancel', 'modalClose',
  'listRefreshFolder', 'listBatchModeEnter', 'listBatchModeExit',
  'listRefreshFolderUnset', 'listRefreshScanning', 'listRefreshImporting',
  'listRefreshPreparing', 'listRefreshEmpty', 'listRefreshComplete',
  'listRefreshFailed', 'listConfigOnlyBook', 'listConfigOnlyBookWithFolder',
  'listImportDeleteNoPermission', 'listImportDeleteIsDirectory',
  'listImportDeleteFail', 'listImportSaveFail', 'listBatchSelectAll',
  'listBatchSelectedCount', 'listBatchDelete', 'listBatchDeleteConfirm',
  'listBatchDeleteFailed', 'listBackupEmpty', 'listBackupFailed',
  'listRestoreComplete', 'listRestoreFailed', 'listRestoreInvalidFormat',
  'readFontFail', 'configInstallIosGuide',
  'configImportSaveFolderNotSupported', 'migrationGroupTitle',
  'migrationExportButton', 'migrationImportButton', 'migrationExportPreparing',
  'migrationExportProgress', 'migrationExportFinalizing',
  'migrationExportComplete', 'migrationExportFailed', 'migrationImportProgress',
  'migrationImportComplete', 'migrationImportFailed', 'migrationInvalidFile',
  'migrationExportOptionsTitle', 'migrationExportIncludeBooks',
  'migrationExportIncludeSettings', 'migrationExportIncludeSources',
  'migrationExportConfirm', 'migrationExportCancel', 'migrationConflictTitle',
  'migrationConflictDescription', 'migrationConflictUseExisting',
  'migrationConflictUseIncoming', 'migrationConflictCreatePlaceholder',
  'migrationConflictConfirm', 'migrationConflictCancel',
];

const formatLocaleValue = (locale, key, ...args) => {
  const value = locale[key];
  assert.ok(typeof value === 'string' || typeof value === 'function', `${key} must be a string or function`);
  return typeof value === 'function'
    ? String(value(...args))
    : value.replace(/\{(\d+)\}/g, (_, index) => String(args[Number(index)]));
};

test('all Phase 1 locale objects expose the same own keys', () => {
  const expected = new Set(PHASE1_KEYS);
  for (const [name, locale] of Object.entries(locales)) {
    const actual = new Set(Object.keys(locale));
    for (const key of expected) {
      assert.ok(Object.prototype.hasOwnProperty.call(locale, key), `${name} is missing ${key}`);
    }
    assert.deepEqual(actual, new Set(Object.keys(en)), `${name} key set differs from English`);
  }
});

test('dynamic Phase 1 locale messages include supplied values', () => {
  const cases = [
    ['listConfigOnlyBook', ['EPUB']],
    ['listConfigOnlyBookWithFolder', ['TXT']],
    ['listRefreshImporting', [2, 5]],
    ['listBatchSelectedCount', [3]],
    ['listBatchDeleteConfirm', [3]],
    ['listRestoreComplete', [4]],
    ['migrationExportProgress', [2, 5]],
    ['migrationImportProgress', [2, 5, 'Book Title']],
    ['migrationImportComplete', [1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ['listRefreshFailed', ['permission denied']],
    ['migrationExportFailed', ['disk full']],
  ];
  for (const [key, args] of cases) {
    for (const locale of Object.values(locales)) {
      const text = formatLocaleValue(locale, key, ...args);
      assert.doesNotMatch(text, /\{\d+\}/, `${key} left an unresolved placeholder`);
      assert.doesNotMatch(text, /undefined/, `${key} emitted undefined`);
      for (const value of args) assert.ok(text.includes(String(value)), `${key} omitted ${value}`);
    }
  }
});

test('Modal queue processes requests in FIFO order', async () => {
  const { createNotificationQueue } = await import('../app_unpacked/src/js/ui/component/modal.js');
  const started = [];
  let releaseFirst;
  let releaseSecond;
  const firstRelease = new Promise(resolve => { releaseFirst = resolve; });
  const secondRelease = new Promise(resolve => { releaseSecond = resolve; });
  const queue = createNotificationQueue(async request => {
    started.push(request.id);
    await request.release;
    return request.id;
  });

  const first = queue.enqueue({ id: 'first', release: firstRelease });
  const second = queue.enqueue({ id: 'second', release: secondRelease });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(started, ['first']);
  releaseFirst();
  assert.equal(await first, 'first');
  assert.deepEqual(started, ['first', 'second']);
  releaseSecond();
  assert.equal(await second, 'second');
});

test('renderer call sites use the shared notification component', async () => {
  const files = {
    list: 'app_unpacked/src/js/page/list/listpage.js',
    options: 'app_unpacked/src/js/data/options.js',
    config: 'app_unpacked/src/js/page/config/configpage.js',
    storage: 'app_unpacked/src/js/data/storage.js',
  };
  for (const [name, path] of Object.entries(files)) {
    const source = await readProjectFile(path);
    assert.match(source, /ui\/component\/modal\.js/, `${name} does not import modal.js`);
    assert.doesNotMatch(source, /(?<![\w.])(?:alert|confirm)\s*\(/, `${name} still calls a browser-global dialog`);
  }
});

test('batch deletion waits for confirmation before reading selected IDs', async () => {
  const source = await readProjectFile('app_unpacked/src/js/page/list/listpage.js');
  const start = source.indexOf('async batchDelete()');
  assert.notEqual(start, -1, 'batchDelete method is missing');
  const end = source.indexOf('\n  }', start);
  const method = source.slice(start, end === -1 ? undefined : end);
  const confirmIndex = method.indexOf('await modal.confirm');
  const idsIndex = method.indexOf('const ids = [...this.batchSelected]');
  assert.ok(confirmIndex >= 0, 'batchDelete must await modal.confirm');
  assert.ok(idsIndex > confirmIndex, 'selected IDs must be read after confirmation');
  assert.match(method, /if \(!confirmed\) return;/);
});

test('migration summary notification is isolated from reload ordering', async () => {
  const source = await readProjectFile('app_unpacked/src/js/data/options.js');
  const importStart = source.indexOf('const result = await file.importMigration');
  const reloadIndex = source.indexOf('location.reload()', importStart);
  const summaryIndex = source.indexOf('await modal.alert', importStart);
  assert.ok(importStart >= 0, 'migration import flow is missing');
  assert.ok(summaryIndex > importStart, 'migration import must await its summary notification');
  assert.ok(reloadIndex > summaryIndex, 'migration must reload after summary notification');
  const afterSummary = source.slice(summaryIndex, reloadIndex);
  assert.match(afterSummary, /catch/);
  assert.match(afterSummary, /console\.warn/);
});

test('long-running import and migration progress overlays remain in place', async () => {
  const list = await readProjectFile('app_unpacked/src/js/page/list/listpage.js');
  const options = await readProjectFile('app_unpacked/src/js/data/options.js');
  assert.match(list, /#import_tip|this\.importTip/);
  assert.match(options, /#import_tip/);
  assert.match(list, /this\.importTip\.style\.display = 'block'/);
  assert.match(list, /this\.importTip\.style\.display = 'none'/);
  assert.match(options, /importTip\.style\.display = 'block'/);
  assert.match(options, /importTip\.style\.display = 'none'/);
});

test('Phase 1 theme tokens replace hard-coded UI colors', async () => {
  const light = await readProjectFile('app_unpacked/src/css/theme/light.css');
  const dark = await readProjectFile('app_unpacked/src/css/theme/dark.css');
  const list = await readProjectFile('app_unpacked/src/css/page/listpage.css');
  const flip = await readProjectFile('app_unpacked/src/css/page/flipreadpage.css');
  const scroll = await readProjectFile('app_unpacked/src/css/page/scrollreadpage.css');
  const tokens = [
    '--modal-overlay-background', '--modal-background', '--modal-color',
    '--toast-background', '--toast-color', '--batch-bar-background',
    '--batch-bar-color', '--batch-button-border-color', '--danger-color',
    '--batch-selected-background', '--reader-meta-color',
  ];
  for (const token of tokens) {
    assert.match(light, new RegExp(`${token}:`), `light theme is missing ${token}`);
    assert.match(dark, new RegExp(`${token}:`), `dark theme is missing ${token}`);
  }
  assert.doesNotMatch(list, /var\(--alert-color\)/);
  for (const value of ['background: #333', 'color: white', 'border: 1px solid #888', 'border-color: #e55', 'color: #e55', 'rgba(218, 175, 80, 0.15)']) {
    assert.doesNotMatch(list, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(flip, /color: var\(--reader-meta-color\)/);
  assert.match(scroll, /color: var\(--reader-meta-color\)/);
  assert.doesNotMatch(flip, /color: #808080/);
  assert.doesNotMatch(scroll, /color: #808080/);
});

test('Modal module is precached by the Service Worker', async () => {
  const source = await readProjectFile('app_unpacked/src/sw.js');
  assert.match(source, /['"]\.\/js\/ui\/component\/modal\.js['"]/);
});
