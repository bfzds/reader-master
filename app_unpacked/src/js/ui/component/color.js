/*!
 * @license MPL-2.0-no-copyleft-exception
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 * This Source Code Form is "Incompatible With Secondary Licenses", as
 * defined by the Mozilla Public License, v. 2.0.
 */

import RangeInput from './range.js';
import i18n from '../../i18n/i18n.js';

class Color {
  constructor(/** @type {number} */r, /** @type {number} */g, /** @type {number} */b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
  set(/** @type {number} */r, /** @type {number} */g, /** @type {number} */b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
  get() {
    return { r: this.r, g: this.g, b: this.b };
  }
  toHex() {
    return '#' + [...'rgb'].map(c => (
      Math.round(this[c] * 255).toString(16).padStart(2, 0)
    )).join('');
  }
  static fromHex(/** @type {string} */hex) {
    const hexVal = hex.replace(/^#/, '');
    const hexVal6 = hexVal.length === 3 ? hexVal.replace(/./g, '$&$&') : hexVal;
    const [r, g, b] = hexVal6.match(/../g).map(c => Number.parseInt(c, 16) / 255);
    return new Color(r, g, b);
  }
}

export default class ColorPicker {
  /**
   * @param {HTMLElement} container
   */
  constructor(container) {
    this.container = container;

    /** @type {((value: number) => any)[]} */
    this.onValueChange = [];

    this.container.classList.add('color-picker');
    this.result = this.container.appendChild(document.createElement('div'));
    this.result.classList.add('color-picker-result');

    this.redBar = this.container.appendChild(document.createElement('div'));
    this.redBar.classList.add('color-picker-red');
    this.redRange = new RangeInput(this.redBar, { min: 0, max: 255, step: 1 });
    this.redRange.onChange(red => { this.setRGB({ red }); });
    this.redBar.setAttribute('aria-label', i18n.getMessage('colorRedRange'));

    this.greenBar = this.container.appendChild(document.createElement('div'));
    this.greenBar.classList.add('color-picker-green');
    this.greenRange = new RangeInput(this.greenBar, { min: 0, max: 255, step: 1 });
    this.greenRange.onChange(green => { this.setRGB({ green }); });
    this.greenBar.setAttribute('aria-label', i18n.getMessage('colorGreenRange'));

    this.blueBar = this.container.appendChild(document.createElement('div'));
    this.blueBar.classList.add('color-picker-blue');
    this.blueRange = new RangeInput(this.blueBar, { min: 0, max: 255, step: 1 });
    this.blueRange.onChange(blue => { this.setRGB({ blue }); });
    this.blueBar.setAttribute('aria-label', i18n.getMessage('colorBlueRange'));

    this.candidateList = this.container.appendChild(document.createElement('ul'));
    this.candidateList.classList.add('color-picker-candidate-list');

    this.setRGB({ red: 0, green: 0, blue: 0 });

    this.candidateList.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const li = target.closest('li');
      if (!li) return;
      this.setColor(li.dataset.color);
    });
  }
  renderColor() {
    this.color = new Color(this.red / 255, this.green / 255, this.blue / 255);
    this.container.style.setProperty('--color-picker-color', this.color.toHex());
    this.result.setAttribute('aria-label', this.color.toHex());

    this.minRedColor = new Color(0, this.green / 255, this.blue / 255);
    this.maxRedColor = new Color(1, this.green / 255, this.blue / 255);
    this.container.style.setProperty('--color-picker-min-red', this.minRedColor.toHex());
    this.container.style.setProperty('--color-picker-max-red', this.maxRedColor.toHex());

    this.minGreenColor = new Color(this.red / 255, 0, this.blue / 255);
    this.maxGreenColor = new Color(this.red / 255, 1, this.blue / 255);
    this.container.style.setProperty('--color-picker-min-green', this.minGreenColor.toHex());
    this.container.style.setProperty('--color-picker-max-green', this.maxGreenColor.toHex());

    this.minBlueColor = new Color(this.red / 255, this.green / 255, 0);
    this.maxBlueColor = new Color(this.red / 255, this.green / 255, 1);
    this.container.style.setProperty('--color-picker-min-blue', this.minBlueColor.toHex());
    this.container.style.setProperty('--color-picker-max-blue', this.maxBlueColor.toHex());
  }
  setRGB({ red, green, blue }) {
    if (red != null) this.setRed(red);
    if (green != null) this.setGreen(green);
    if (blue != null) this.setBlue(blue);
    this.renderColor();
    this.triggerCallback();
  }
  normalizeValue(value, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    else return Math.min(max, Math.max(0, number));
  }
  setRed(red) {
    this.red = this.normalizeValue(red, 255);
    this.redRange.setValue(this.red);
  }
  setGreen(green) {
    this.green = this.normalizeValue(green, 255);
    this.greenRange.setValue(this.green);
  }
  setBlue(blue) {
    this.blue = this.normalizeValue(blue, 255);
    this.blueRange.setValue(this.blue);
  }
  /** @param {(value: string) => any} callback */
  onChange(callback) {
    this.onValueChange.push(callback);
  }
  setColor(color) {
    const setColor = Color.fromHex(color);
    if (setColor.toHex() === this.color.toHex()) return;
    const { r, g, b } = setColor;
    this.setRGB({ red: r * 255, green: g * 255, blue: b * 255 });
  }
  triggerCallback() {
    if (this.hexColor === this.color.toHex()) return;
    this.hexColor = this.color.toHex();
    this.onValueChange.forEach(callback => {
      callback(this.hexColor);
    });
  }
  setCandidateList(colors) {
    this.candidateList.innerHTML = '';
    colors.forEach(color => {
      const item = this.candidateList.appendChild(document.createElement('li'));
      const button = item.appendChild(document.createElement('button'));
      button.type = 'button';
      button.title = color;
      item.dataset.color = color;
      button.style.background = color;
    });
  }
  dispatch() {
    this.redRange.dispatch();
    this.greenRange.dispatch();
    this.blueRange.dispatch();
    this.container.innerHTML = '';
  }
}

