import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

const read = relative => fs.readFile(path.join(root, relative), 'utf8');

const BUTTON_TOKENS = [
  '--button-background',
  '--button-color',
  '--button-hover-background',
  '--button-active-background',
  '--button-disabled-background',
  '--button-disabled-color',
  '--button-primary-background',
  '--button-primary-color',
  '--option-background',
  '--option-color',
  '--option-hover-background',
  '--option-active-background',
  '--option-selected-background',
  '--option-selected-color',
  '--option-divider-color',
  '--switch-off-background',
  '--switch-on-background',
  '--switch-thumb-background',
];

const FORBIDDEN_MIGRATION_STYLES = [
  'dialog.style.width',
  'dialog.style.padding',
  'label.style.display',
  'label.style.margin',
  'fieldset.style.border',
  'fieldset.style.margin',
  'fieldset.style.padding',
  'actions.style.display',
  'actions.style.flexWrap',
  'actions.style.justifyContent',
  'actions.style.gap',
  'actions.style.marginTop',
  'button.style.minWidth',
];

test('both themes define every button and option token', async () => {
  const [light, dark] = await Promise.all([
    read('app_unpacked/src/css/theme/light.css'),
    read('app_unpacked/src/css/theme/dark.css'),
  ]);

  for (const token of BUTTON_TOKENS) {
    assert.match(light, new RegExp(`${token}\\s*:`), `light theme is missing ${token}`);
    assert.match(dark, new RegExp(`${token}\\s*:`), `dark theme is missing ${token}`);
  }
  assert.doesNotMatch(light, /--menu-background\s*:/);
  assert.doesNotMatch(light, /--menu-color\s*:/);
  assert.doesNotMatch(dark, /--menu-background\s*:/);
  assert.doesNotMatch(dark, /--menu-color\s*:/);
});

test('button CSS keeps reset-safe selectors and state specificity', async () => {
  const [input, main] = await Promise.all([
    read('app_unpacked/src/css/common/input.css'),
    read('app_unpacked/src/css/common/main.css'),
  ]);
  const css = `${input}\n${main}`;

  for (const selector of [
    'button.ui-button',
    'button.ui-icon-button',
    'button.ui-option-button',
    'button.ui-button.ui-button-primary:hover:not(:disabled)',
    'button.ui-button.ui-button-primary:active:not(:disabled)',
    'button.ui-button.ui-button-primary:disabled',
    'li.list-item-selected > button.ui-option-button:hover:not(:disabled)',
    'li.list-item-selected > button.ui-option-button:active:not(:disabled)',
    'li.list-item-selected > button.ui-option-button:disabled',
    'button.screen-option-item.ui-option-button:not(:last-child)',
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `missing selector ${selector}`);
  }

  assert.doesNotMatch(css, /button\.ui-icon-button:hover\s*\{/,
    'icon buttons must not receive a global background hover rule');
  assert.doesNotMatch(css, /button\.ui-button:disabled\s*,\s*button\.ui-icon-button:disabled/,
    'disabled icon buttons must not inherit filled button backgrounds');
  assert.match(css, /button\.ui-icon-button:disabled\s*\{\s*opacity:\s*0\.45;/,
    'disabled icon buttons should use opacity feedback');
});

test('templates and config pages attach option classes to actual controls', async () => {
  const [index, configPage, itemList, configCss] = await Promise.all([
    read('app_unpacked/src/index.html'),
    read('app_unpacked/src/js/page/config/configpage.js'),
    read('app_unpacked/src/js/ui/component/itemlist.js'),
    read('app_unpacked/src/css/page/configpage.css'),
  ]);

  assert.match(index, /<template id="icon_button">\s*<button type="button" class="ui-icon-button">/);
  assert.match(index, /<button type="button" class="screen-option-item ui-option-button">/);
  assert.match(configPage, /closest\('\.list-item-container'\)/);
  assert.match(configPage, /ui-option-button/);
  assert.match(itemList, /li\.classList\.add\('list-item-selected'\)/);
  assert.doesNotMatch(configPage, /ui-option-button-selected/);
  assert.match(configCss, /button\.ui-option-button \.config-item/);
  assert.match(configCss, /background:\s*var\(--switch-off-background\)/);
  assert.match(configCss, /background:\s*var\(--switch-on-background\)/);
  assert.match(configCss, /background:\s*var\(--switch-thumb-background\)/);
  assert.match(configCss, /overflow-wrap:\s*anywhere/);

  const listCss = await read('app_unpacked/src/css/page/listpage.css');
  assert.match(listCss, /\.list-filter-clear \.button-wrap[\s\S]*?color:\s*inherit/,
    'clear-search icon color must follow the button state');
});

test('migration dialogs use themed classes instead of layout inline styles', async () => {
  const [options, main] = await Promise.all([
    read('app_unpacked/src/js/data/options.js'),
    read('app_unpacked/src/css/common/main.css'),
  ]);
  const start = options.indexOf('const chooseMigrationExportOptions');
  const end = start + options.slice(start).search(/\/\*\*\r?\n \* @typedef \{Object\} ConfigGroup/);
  assert.notEqual(start, -1, 'export dialog function was not found');
  assert.notEqual(end, start - 1, 'migration dialog section boundary was not found');
  const dialogs = options.slice(start, end);

  for (const className of [
    'migration-dialog',
    'migration-dialog-export',
    'migration-dialog-conflict',
    'migration-dialog-form',
    'migration-dialog-option',
    'migration-dialog-choices',
    'migration-dialog-actions',
  ]) {
    assert.match(dialogs, new RegExp(className), `missing migration class ${className}`);
    assert.match(main, new RegExp(className), `missing migration CSS ${className}`);
  }
  for (const styleProperty of FORBIDDEN_MIGRATION_STYLES) {
    assert.doesNotMatch(dialogs, new RegExp(styleProperty.replace('.', '\\.'), 'g'),
      `migration dialog still uses ${styleProperty}`);
  }
  assert.match(main, /dialog\.migration-dialog[\s\S]*?background:\s*var\(--modal-background\)/);
  assert.match(main, /dialog\.migration-dialog[\s\S]*?color:\s*var\(--modal-color\)/);
  assert.match(main, /dialog\.migration-dialog[\s\S]*?border:\s*1px solid var\(--border-color\)/);
  assert.match(options, /includeContent:\s*contentInput\.checked[\s\S]*?includeSource:\s*sourceInput\.checked/);
  assert.match(dialogs, /cancelButton\.className = 'ui-button ui-button-secondary'/);
  assert.match(dialogs, /exportButton\.className = 'ui-button ui-button-primary'/);
  assert.match(dialogs, /value === 'once'[\s\S]*?ui-button-primary/);
  assert.doesNotMatch(dialogs, /migrationExportIncludeSettings/);
});

test('button refactor preserves existing business call paths', async () => {
  const [listPage, options, configPage] = await Promise.all([
    read('app_unpacked/src/js/page/list/listpage.js'),
    read('app_unpacked/src/js/data/options.js'),
    read('app_unpacked/src/js/page/config/configpage.js'),
  ]);

  assert.match(listPage, /batch-select-all ui-button ui-button-secondary/);
  assert.match(listPage, /batch-delete ui-button ui-button-danger/);
  assert.match(options, /includeContent:\s*contentInput\.checked[\s\S]*?includeSource:\s*sourceInput\.checked/);
  assert.match(configPage, /setValue\(item\.value\)/);
  assert.doesNotMatch(configPage, /ui-option-button-selected/);
});
