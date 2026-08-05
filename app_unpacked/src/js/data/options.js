/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import config from './config.js';
import i18n from '../i18n/i18n.js';
import template from '../ui/util/template.js';
import wakelock from '../ui/util/wakelock.js';
import file from './file.js';
import {
  createMigrationConflictResolver,
  getMigrationConflictDialogResult,
} from './migration-conflict.js';
import { createMigrationSavePayload } from './migration-export.js';
import { getMigrationSourceSaveRequest } from './migration-source.js';
import importFolder from '../platform/import-folder.js';
import text from '../text/text.js';
import modal from '../ui/component/modal.js';

const showAlert = message => modal.alert(message, {
  title: i18n.getMessage('modalTitle'),
  closeText: i18n.getMessage('modalClose'),
}).catch(error => console.warn('Options notification failed:', error));

class ConfigOption {
  /** @param {{ name: string, description: string?, title: string }} config */
  constructor(config) {
    this.title = config.title;
    this.description = config.description ?? '';
    if (config.name != null) {
      this.name = config.name;
      this.default = null;
      this.initialized = false;
    } else {
      this.name = null;
    }
    this.rendered = false;
    if (!ConfigOption.globalIndex) {
      ConfigOption.globalIndex = 0;
    }
    this.index = ConfigOption.globalIndex++;
  }
  /** @returns {string} */
  get type() { throw Error('Unimplementated'); }
  get subPageType() { return this.type; }
  setConfig(value) {
    if (this.name == null) return (void 0);
    return config.set(this.name, value);
  }
  getConfig(value) {
    if (this.name == null) return (void 0);
    return config.get(this.name, value);
  }
  /**
   * @param {HTMLElement} container
   */
  render(container) {
    const itemElement = container.appendChild(document.createElement('div'));
    itemElement.classList.add('config-item');
    const titleElement = itemElement.appendChild(document.createElement('div'));
    titleElement.classList.add('config-item-title');
    titleElement.textContent = this.title;
    this.container = itemElement;
    this.titleElement = titleElement;
    this.rendered = true;
    this.titleElement.id = 'config_item_' + this.index;
  }
  renderValue(value) { }
  isValidValue(value) { return true; }
  async normalizeConfig() {
    let value = null;
    try {
      value = await config.get(this.name);
    } catch (e) {
      // use default
    }
    const isValid = await this.isValidValue(value);
    if (!isValid || value === null) {
      await config.set(this.name, this.default);
      if (this.rendered) this.renderValue(this.default);
    }
  }
  async setup(container) {
    if (this.initialized) return;
    this.initialized = true;
    this.render(container);
    if (this.name != null) {
      await this.normalizeConfig();
      await config.get(this.name).then(value => {
        this.renderValue(value);
        config.addListener(this.name, value => {
          this.renderValue(value);
        });
      });
    }
  }
  detailIcon() {
    const detailIcon = template.icon('detail');
    detailIcon.classList.add('config-item-detail');
    detailIcon.setAttribute('aria-label', i18n.getMessage('configWithDetail'));
    return detailIcon;
  }
}

class SelectConfigOption extends ConfigOption {
  /** @param {{ name: string, title: string, select: { value: string, text: string }[], default: string, description: string }} config */
  constructor(config) {
    super(config);
    this.select = config.select;
    this.default = config.default;
  }
  get type() { return 'select'; }
  isValidValue(value) {
    return this.select.find(item => item.value === value) != null;
  }
  render(container) {
    super.render(container);
    const itemElement = container.firstChild;
    this.resultElement = itemElement.appendChild(document.createElement('span'));
    this.resultElement.classList.add('config-item-value');
    itemElement.appendChild(this.detailIcon());
    this.resultElement.id = 'config_item_value_' + this.index;
    this.resultElement.setAttribute('aria-labelledby', this.titleElement.id);
    this.titleElement.setAttribute('aria-labelledby', this.resultElement.id);
  }
  renderValue(value) {
    this.resultElement.textContent = this.select.find(i => i.value === value).text;
  }
}

class SwitchConfigOption extends ConfigOption {
  /** @param {{ name: string, title: string, default: string, onValue?: string, offValue?: string }} config */
  constructor(config) {
    super(config);
    this.default = config.default;
    this.onValue = config.onValue ?? 'enable';
    this.offValue = config.offValue ?? 'disable';
  }
  get type() { return 'switch'; }
  get subPageType() { return null; }
  isValidValue(value) {
    return value === this.onValue || value === this.offValue;
  }
  render(container) {
    super.render(container);
    const itemElement = this.container;
    this.switchElement = itemElement.appendChild(document.createElement('div'));
    this.switchElement.classList.add('config-item-switch');
    const track = this.switchElement.appendChild(document.createElement('div'));
    track.classList.add('config-item-switch-track');
    track.appendChild(document.createElement('div')).classList.add('config-item-switch-thumb');
    this.switchElement.addEventListener('click', event => {
      this.toggle();
      event.stopPropagation();
      event.preventDefault();
    });
  }
  renderValue(value) {
    if (this.switchElement) {
      this.switchElement.classList.toggle('config-item-switch-on', value === this.onValue);
    }
  }
  async toggle() {
    const value = await this.getConfig(this.default);
    const newValue = value === this.onValue ? this.offValue : this.onValue;
    await this.setConfig(newValue);
  }
}

class DirectoryConfigOption extends ConfigOption {
  /** @param {{ name: string, title: string, default: string?, unsetText: string, handleKey: string }} config */
  constructor(config) {
    super(config);
    this.default = config.default ?? null;
    this.unsetText = config.unsetText;
    this.handleKey = config.handleKey;
    this.onClick = this.pickDirectory.bind(this);
  }
  get type() { return 'directory'; }
  get subPageType() { return null; }
  isValidValue(value) {
    return value == null || typeof value === 'string';
  }
  render(container) {
    super.render(container);
    const itemElement = this.container;
    this.resultElement = itemElement.appendChild(document.createElement('span'));
    this.resultElement.classList.add('config-item-value');
    itemElement.appendChild(this.detailIcon());
    this.resultElement.id = 'config_item_value_' + this.index;
    this.resultElement.setAttribute('aria-labelledby', this.titleElement.id);
    this.titleElement.setAttribute('aria-labelledby', this.resultElement.id);
  }
  renderValue(value) {
    this.resultElement.textContent = value || this.unsetText;
  }
  async pickDirectory() {
    if (!importFolder.supported()) {
      void showAlert(i18n.getMessage('configImportSaveFolderNotSupported'));
      return;
    }
    try {
      const result = await importFolder.pick(this.handleKey);
      if (!result) return;
      await this.setConfig(result.name || null);
    } catch (e) {
      console.error('选择导入文件保存文件夹失败:', e);
      void showAlert(i18n.getMessage('listRefreshFailed', e?.message || e));
    }
  }
}

/** @typedef {string} Color */
const normalizeColor = function (value, fallback = '#dcdfe1') {
  if (typeof value !== 'string') return fallback;
  const hex = value.trim().match(/^#?([a-f\d]{3}|[a-f\d]{6})$/i);
  if (hex) {
    const value = hex[1].toLowerCase();
    return '#' + (value.length === 3 ? value.split('').map(char => char + char).join('') : value);
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)$/i);
  if (rgb && rgb.slice(1, 4).every(item => Number(item) <= 255)) {
    return '#' + rgb.slice(1, 4).map(item => Number(item).toString(16).padStart(2, '0')).join('');
  }
  return fallback;
};

class ColorConfigOption extends ConfigOption {
  /** @param {{ name: string, title: string, default: Color }} config */
  constructor(config) {
    super(config);
    this.default = normalizeColor(config.default);
  }
  get type() { return 'color'; }
  isValidValue(value) {
    return /^#[a-f0-9]{6}$/i.test(normalizeColor(value, ''));
  }
  async normalizeConfig() {
    const value = normalizeColor(await config.get(this.name), this.default);
    if (value !== await config.get(this.name)) await config.set(this.name, value);
    if (this.rendered) this.renderValue(value);
  }
  render(container) {
    super.render(container);
    const itemElement = container.firstChild;
    this.resultElement = itemElement.appendChild(document.createElement('span'));
    this.resultElement.classList.add('config-item-value', 'config-item-color-value');
    itemElement.appendChild(this.detailIcon());
    this.resultElement.id = 'config_item_value_' + this.index;
    this.resultElement.setAttribute('aria-labelledby', this.titleElement.id);
    this.titleElement.setAttribute('aria-labelledby', this.resultElement.id);
  }
  renderValue(value) {
    this.resultElement.style.backgroundColor = value;
    this.resultElement.setAttribute('aria-label', value);
  }
}

class FontConfigOption extends ConfigOption {
  /** @param {{ name: string, title: string, default: Color }} config */
  constructor(config) {
    super(config);
    this.default = config.default;
  }
  get type() { return 'font'; }
  async isValidValue(value) {
    if (value == null || value === 0) return value === 0 || value == null;
    const allFonts = await config.get('font_list');
    if (!Array.isArray(allFonts)) return false;
    return Boolean(allFonts.find(font => font?.id === value));
  }
  async normalizeConfig() {
    const value = await config.get(this.name, this.default);
    const valid = await this.isValidValue(value);
    const normalized = valid ? value : this.default;
    if (!valid) await config.set(this.name, normalized);
    if (this.rendered) this.renderValue(normalized);
  }
  render(container) {
    super.render(container);
    const itemElement = container.firstChild;
    this.resultElement = itemElement.appendChild(document.createElement('span'));
    this.resultElement.classList.add('config-item-value');
    itemElement.appendChild(this.detailIcon());
    this.resultElement.id = 'config_item_value_' + this.index;
    this.resultElement.setAttribute('aria-labelledby', this.titleElement.id);
    this.titleElement.setAttribute('aria-labelledby', this.resultElement.id);
  }
  renderValue(value) {
    const id = value ? 'configTextFontFamilyCustom' : 'configTextFontFamilyDefault';
    const text = i18n.getMessage(id);
    this.resultElement.textContent = text;
  }
}

class TextConfigOption extends ConfigOption {
  /** @param {{ name: string, title: string, default: string, description: string }} config */
  constructor(config) {
    super(config);
    this.default = config.default;
    this.label = config.label;
  }
  get type() { return 'text'; }
  isValidValue(value) { return typeof value === 'string'; }
  render(container) {
    super.render(container);
    const itemElement = container.firstChild;
    this.resultElement = itemElement.appendChild(document.createElement('span'));
    this.resultElement.classList.add('config-item-value');
    itemElement.appendChild(this.detailIcon());
    this.resultElement.id = 'config_item_value_' + this.index;
    this.resultElement.setAttribute('aria-labelledby', this.titleElement.id);
    this.titleElement.setAttribute('aria-labelledby', this.resultElement.id);
  }
  renderValue(value) {
    this.resultElement.textContent = value;
  }
}

class StubConfigOption extends ConfigOption {
  constructor(config) { super(config); }
  setConfig(value) { }
  getConfig(value) { }
  renderValue(value) { }
  isValidValue(value) { return true; }
  async normalizeConfig() { }
  async setup(container) {
    if (this.initialized) return;
    this.initialized = true;
    this.render(container);
  }
}

class ValueConfigOption extends ConfigOption {
  /** @param {{ name: string, title: string, default: any, validator?: (any) => boolean, normalize: (any) => any }} config */
  constructor(config) {
    super(config);
    this.isValidValue = config.validator ?? (() => true);
    this.normalizeConfig = config.normalize ?? (value => value);
  }
  get type() { return 'value'; }
  async setConfig(value) {
    const setValue = this.normalizeConfig(this.isValidValue(value) ? value : null);
    await config.set(this.name, setValue);
  }
  async getConfig(defaultValue) {
    const value = await config.get(this.name, defaultValue);
    return this.normalizeConfig(value);
  }
}

class ExpertConfigOption extends ConfigOption {
  /** @param {{ name: string, title: string, default: string, description: string }} config */
  constructor(config) {
    super(config);
    this.default = config.default;
    this.label = config.label;
  }
  get type() { return 'expert'; }
  isValidValue(value) { return typeof value === 'string'; }
  render(container) {
    super.render(container);
    const itemElement = container.firstChild;
    itemElement.appendChild(this.detailIcon());
  }
  renderValue(value) {
  }
}

class ButtonConfigOption extends StubConfigOption {
  /** @param {{ onClick: () => void }} config */
  constructor(config) {
    super(config);
    this.onClick = config.onClick;
  }
  get type() { return 'button'; }
  get subPageType() { return null; }
  renderValue() {

  }
}

const chooseMigrationExportOptions = function () {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    if (typeof dialog.showModal !== 'function' || !document.body) {
      resolve(null);
      return;
    }
    dialog.className = 'migration-dialog migration-dialog-export';

    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'migration-dialog-form';
    const title = document.createElement('h3');
    title.textContent = i18n.getMessage('migrationExportOptionsTitle');
    const description = document.createElement('p');
    description.textContent = i18n.getMessage('migrationExportPreparing');
    const contentInput = document.createElement('input');
    contentInput.type = 'checkbox';
    const contentLabel = document.createElement('label');
    contentLabel.className = 'migration-dialog-option';
    contentLabel.append(contentInput, ` ${i18n.getMessage('migrationExportIncludeBooks')}`);
    const sourceInput = document.createElement('input');
    sourceInput.type = 'checkbox';
    const sourceLabel = document.createElement('label');
    sourceLabel.className = 'migration-dialog-option';
    sourceLabel.append(sourceInput, ` ${i18n.getMessage('migrationExportIncludeSources')}`);
    const actions = document.createElement('div');
    actions.className = 'migration-dialog-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'submit';
    cancelButton.value = 'cancel';
    cancelButton.textContent = i18n.getMessage('migrationExportCancel');
    const exportButton = document.createElement('button');
    exportButton.type = 'submit';
    exportButton.value = 'export';
    exportButton.textContent = i18n.getMessage('migrationExportConfirm');
    cancelButton.className = 'ui-button ui-button-secondary';
    exportButton.className = 'ui-button ui-button-primary';
    actions.append(cancelButton, exportButton);
    form.append(title, description, contentLabel, sourceLabel, actions);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      const result = dialog.returnValue === 'export'
        ? { includeContent: contentInput.checked, includeSource: sourceInput.checked }
        : null;
      dialog.remove();
      resolve(result);
    }, { once: true });
    dialog.showModal();
  });
};

const showMigrationConflictDialog = function ({ entry, method, candidates }) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    if (typeof dialog.showModal !== 'function' || !document.body) {
      resolve(null);
      return;
    }
    dialog.className = 'migration-dialog migration-dialog-conflict';

    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'migration-dialog-form';
    const title = document.createElement('h3');
    title.textContent = i18n.getMessage('migrationConflictTitle', entry.meta?.title || '', method);
    const description = document.createElement('p');
    description.textContent = i18n.getMessage('migrationConflictDescription');
    const choices = document.createElement('fieldset');
    choices.className = 'migration-dialog-choices';
    candidates.forEach((candidate, index) => {
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'migration-conflict';
      input.value = String(index);
      input.checked = index === 0;
      const label = document.createElement('label');
      label.className = 'migration-dialog-option';
      const sourceName = candidate.sourceName ? `，文件：${candidate.sourceName}` : '';
      label.append(input, ` ${index + 1}. ${candidate.title || '未命名'}${sourceName}`);
      choices.append(label);
    });
    const actions = document.createElement('div');
    actions.className = 'migration-dialog-actions';
    for (const [value, text] of [
      ['once', i18n.getMessage('migrationConflictConfirm')],
      ['apply', i18n.getMessage('migrationConflictUseExisting')],
      ['cancel', i18n.getMessage('migrationConflictCancel')],
    ]) {
      const button = document.createElement('button');
      button.type = 'submit';
      button.value = value;
      button.textContent = text;
      button.className = value === 'once'
        ? 'ui-button ui-button-primary'
        : 'ui-button ui-button-secondary';
      actions.append(button);
    }
    form.append(title, description, choices, actions);
    dialog.append(form);
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      const selected = form.querySelector('input[name="migration-conflict"]:checked');
      const index = Number.parseInt(selected?.value || '', 10);
      const result = getMigrationConflictDialogResult(dialog.returnValue, index, candidates.length);
      dialog.remove();
      resolve(result);
    }, { once: true });
    dialog.showModal();
  });
};

/**
 * @typedef {Object} ConfigGroup
 * @property {string} title
 * @property {ConfigOption[]} items
 */
/** @type {(ConfigGroup & { list?: boolean })[]} */
const options = (factory => {
  let cache = null;
  return () => {
    if (cache) return cache;
    cache = factory();
    factory = null;
    return cache;
  };
})(() => [{
  title: i18n.getMessage('configModeGroupTitle'),
  items: [new SelectConfigOption({
    name: 'view_mode',
    title: i18n.getMessage('configMode'),
    select: [
      { value: 'flip', text: i18n.getMessage('configModeFlip') },
      { value: 'scroll', text: i18n.getMessage('configModeScroll') },
    ],
    default: 'flip',
  })],
}, {
  title: i18n.getMessage('configThemeGroupTitle'),
  items: [new SelectConfigOption({
    name: 'theme',
    title: i18n.getMessage('configTheme'),
    select: [
      { value: 'auto', text: i18n.getMessage('configThemeAuto') },
      { value: 'light', text: i18n.getMessage('configThemeLight') },
      { value: 'dark', text: i18n.getMessage('configThemeDark') },
    ],
    default: 'auto',
  })],
}, {
  title: i18n.getMessage('configDarkThemeGroupTitle'),
  items: [new ColorConfigOption({
    name: 'dark_text',
    title: i18n.getMessage('configDarkThemeColor'),
    default: '#dcdfe1',
  }), new ColorConfigOption({
    name: 'dark_background',
    title: i18n.getMessage('configDarkThemeBackground'),
    default: '#3c3f44',
  })],
}, {
  title: i18n.getMessage('configLightThemeGroupTitle'),
  items: [new ColorConfigOption({
    name: 'light_text',
    title: i18n.getMessage('configLightThemeColor'),
    default: '#dcdfe1',
  }), new ColorConfigOption({
    name: 'light_background',
    title: i18n.getMessage('configLightThemeBackground'),
    default: '#3c3f44',
  })],
}, {
  title: i18n.getMessage('configTextGroupTitle'),
  items: [new FontConfigOption({
    name: 'font_family',
    title: i18n.getMessage('configTextFontFamily'),
    default: null,
  }), new SelectConfigOption({
    name: 'font_size',
    title: i18n.getMessage('configTextFontSize'),
    select: [10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 48, 56, 64].map(n => ({
      value: String(n),
      text: i18n.getMessage('configTextFontSizeNum', n),
    })),
    default: '18',
  }), new SelectConfigOption({
    name: 'line_height',
    title: i18n.getMessage('configTextLineHeight'),
    select: [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0, 2.2, 2.5, 3.0, 4.0].map(n => ({
      value: String(n),
      text: i18n.getMessage('configTextLineHeightNum', n),
    })),
    default: '1.3',
  }), new SelectConfigOption({
    name: 'paragraph_spacing',
    title: i18n.getMessage('configTextParagraphSpacing'),
    select: [0, 0.2, 0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4].map(n => ({
      value: String(n),
      text: i18n.getMessage('configTextParagraphSpacingNum', n),
    })),
    default: '0.5',
  }), new SwitchConfigOption({
    name: 'epub_image_loading',
    title: i18n.getMessage('configEpubImageLoading'),
    default: 'enable',
  }), new TextConfigOption({
    name: 'cjk_lang_tag',
    title: i18n.getMessage('configTextLangTag'),
    label: i18n.getMessage('configTextLangTagTitle'),
    // We use user language setting on browser as fallback
    // As this could be the best guess for what text file user may import
    default: navigator.language || 'und',
    description: i18n.getMessage('configTextLangTagDescription'),
  })],
}, {
  title: i18n.getMessage('configImportGroupTitle'),
  items: [new DirectoryConfigOption({
    name: 'import_save_folder_name',
    title: i18n.getMessage('configImportSaveFolder'),
    default: null,
    unsetText: i18n.getMessage('configImportSaveFolderUnset'),
    handleKey: 'import_save_folder_handle',
  })],
}, {
  title: i18n.getMessage('configPreprocessGroupTitle'),
  items: [new SelectConfigOption({
    name: 'max_empty_lines',
    title: i18n.getMessage('configPreprocessMultipleNewLine'),
    select: [
      { value: 'disable', text: i18n.getMessage('configPreprocessMultipleNewLineDisable') },
      ...[0, 1, 2, 3, 4].map(n => ({
        value: String(n),
        text: i18n.getMessage('configPreprocessMultipleNewLineNum', n),
      })),
    ],
    default: 'disable',
  }), new SelectConfigOption({
    name: 'chinese_convert',
    title: i18n.getMessage('configPreprocessChineseConvert'),
    select: [
      { value: 'disable', text: i18n.getMessage('configPreprocessChineseConvertDisabled') },
      { value: 's2t', text: i18n.getMessage('configPreprocessChineseConvertS2T') },
      { value: 't2s', text: i18n.getMessage('configPreprocessChineseConvertT2S') },
    ],
    default: 'disable',
  }), new SwitchConfigOption({
    name: 'auto_toc',
    title: i18n.getMessage('configAutoTocDetect'),
    default: 'enable',
  })],
}, ...(wakelock.isSupport() ? [{
  title: i18n.getMessage('configScreenGroupTitle'),
  items: [new SelectConfigOption({
    name: 'auto_lock',
    title: i18n.getMessage('configAutoLock'),
    select: [
      { value: 'normal', text: i18n.getMessage('configAutoLockNormal') },
      { value: 'disable', text: i18n.getMessage('configAutoLockDisable') },
    ],
    default: 'normal',
  })],
}] : []), {
  title: i18n.getMessage('configSystemGroupTitle'),
  items: [new SelectConfigOption({
    name: 'locale',
    title: i18n.getMessage('configLocale'),
    select: [
      { value: 'auto', text: i18n.getMessage('configLocaleAuto') },
      ...i18n.listLocales().map(locale => ({
        value: locale.id,
        text: locale.name,
        render: text => {
          text.lang = locale.id;
        },
      })),
    ],
    default: 'auto',
    description: i18n.getMessage('configLocaleDescription'),
  })],
}, {
  title: i18n.getMessage('migrationGroupTitle'),
  items: [new ButtonConfigOption({
    title: i18n.getMessage('migrationExportButton'),
    onClick: async () => {
      let importTip = null;
      try {
        const exportOptions = await chooseMigrationExportOptions();
        if (!exportOptions) return;
        importTip = document.querySelector('#import_tip');
        const importTipText = importTip?.querySelector('.tip-content span');
        if (importTip) importTip.style.display = 'block';
        if (importTipText) importTipText.textContent = i18n.getMessage('migrationExportPreparing');
          const backup = await file.exportMigration(await file.exportSettings(), {
            ...exportOptions,
            resolveSource: async meta => {
              const folderId = meta.sourceFolderId;
              const name = meta.sourceName;
              if (!folderId || !name) return null;
              return importFolder.readFile({ name, folderId });
            },
            onProgress: ({ current, total }) => {
            if (importTipText) importTipText.textContent = i18n.getMessage('migrationExportProgress', current, total);
          },
        });
        if (importTipText) importTipText.textContent = i18n.getMessage('migrationExportFinalizing');
        const json = JSON.stringify(backup);
        const filename = 'tReader-migration-' + new Date().toISOString().slice(0, 10) + '.json';
        const bytes = new TextEncoder().encode(json);
        if (typeof window.treaderImportFolder?.saveConfig === 'function') {
          const saved = await window.treaderImportFolder.saveConfig(filename, bytes);
          if (!saved) return;
        } else {
          const invoke = typeof window.__TAURI__?.core?.invoke === 'function'
            ? window.__TAURI__.core.invoke
            : null;
          if (invoke) {
            const saved = await invoke('save_config_file', {
              name: filename,
              ...createMigrationSavePayload(json),
            });
            if (!saved) return;
          } else {
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
          }
        }
        modal.toast(i18n.getMessage('migrationExportComplete'));
      } catch (error) {
        console.error('Migration export failed:', error);
        void showAlert(i18n.getMessage('migrationExportFailed', error.message));
      } finally {
        if (importTip) importTip.style.display = 'none';
      }
    },
  }), new ButtonConfigOption({
    title: i18n.getMessage('migrationImportButton'),
    onClick: () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.addEventListener('change', async () => {
        try {
          const selected = input.files?.[0];
          if (!selected) return;
          const backup = JSON.parse(await selected.text());
          if (!backup || backup.format !== 'treader-migration' || backup.version !== 2 || !Array.isArray(backup.books)) {
            throw new Error(i18n.getMessage('migrationInvalidFile'));
          }
          await file.importSettings(backup.config || {});
          const importTip = document.querySelector('#import_tip');
          const importTipText = importTip?.querySelector('.tip-content span');
          if (importTip) importTip.style.display = 'block';
          const resolveConflict = createMigrationConflictResolver(showMigrationConflictDialog);
          const result = await file.importMigration(backup, {
            onProgress: ({ current, total, title }) => {
              if (importTipText) importTipText.textContent = i18n.getMessage('migrationImportProgress', current, total, title || '');
            },
            resolveConflict,
            resolveSource: async entry => {
              const folderId = entry.meta?.sourceFolderId;
              const name = entry.meta?.sourceName;
              if (!folderId || !name) return null;
              const source = await importFolder.readFile({ name, folderId });
              if (!source) return null;
              const book = await text.readBook(source);
              const contentText = typeof book.content === 'string' ? book.content : book.content?.text || '';
              const contentHash = globalThis.crypto?.subtle?.digest
                ? Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(contentText))), value => value.toString(16).padStart(2, '0')).join('')
                : null;
              return {
                content: book.content,
                source: book.source || source,
                identity: {
                  contentLength: contentText.length,
                  contentHash,
                  sourceName: source.name || name,
                  title: book.title || entry.identity?.title || entry.meta?.title,
                },
              };
            },
            saveSource: async entry => {
              const request = getMigrationSourceSaveRequest(entry);
              if (!request) return { saved: false };
              const saved = await importFolder.saveFile(request);
              if (!saved) return { saved: false };
              const selection = await importFolder.getSelection();
              return {
                saved: true,
                sourceName: request.name,
                source: {
                  name: request.name,
                  type: entry.source?.type || 'text/plain',
                  lastModified: Number(entry.source?.lastModified) || Date.now(),
                  bytes: request.bytes,
                },
                sourceFolderId: selection.folderId || null,
              };
            },
          });
          if (importTip) importTip.style.display = 'none';
          const summary = i18n.getMessage('migrationImportComplete', result.restored, result.pathResolved, result.pathNotFound, result.sourceSaved, result.sourceSaveFailed, result.added, result.placeholders, result.ambiguous, result.errors);
          try {
            await modal.alert(summary, {
              title: i18n.getMessage('modalTitle'),
              closeText: i18n.getMessage('modalClose'),
            });
          } catch (notificationError) {
            console.warn('Migration summary notification failed:', notificationError);
          }
          location.reload();
        } catch (error) {
          const importTip = document.querySelector('#import_tip');
          if (importTip) importTip.style.display = 'none';
          console.error('Migration import failed:', error);
          void showAlert(i18n.getMessage('migrationImportFailed', error.message));
        }
      });
      input.click();
    },
  })],
}, {
  title: i18n.getMessage('configExpertGroupTitle'),
  items: [new SwitchConfigOption({
    name: 'debug.show_console',
    title: i18n.getMessage('configDebugConsole'),
    default: false,
    onValue: true,
    offValue: false,
  }), new ExpertConfigOption({
    name: config.EXPERT_CONFIG_NAME,
    default: '',
    title: i18n.getMessage('configExpert'),
    description: i18n.getMessage('configExpertDescription'),
  })],
}, {
  list: false,
  items: [new ValueConfigOption({
    name: 'contents_history',
    default: [],
    description: i18n.getMessage('readContentsTemplateDescription'),
    validator: value => Array.isArray(value) &&
      value.every(item => typeof item === 'string'),
    normalize: value => Array.isArray(value) ?
      value.filter((item, index) => (
        typeof item === 'string' && item &&
        value.indexOf(item) === index
      )).slice(0, 10) : [],
  })],
}]);

/** @type {ConfigGroup[]} */
export const optionList = () => options().filter(group => group.list !== false);
export const optionSet = () => new Set(options().flatMap(group => group.items));
export const optionMap = () => new Map(options().flatMap(group => group.items.map(item => [item.name, item])));
