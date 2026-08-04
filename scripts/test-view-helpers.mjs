import test from 'node:test';
import assert from 'node:assert/strict';
import { setViewHidden } from '../app_unpacked/src/js/ui/util/view.js';

const createElement = () => {
  const classes = new Set();
  const attributes = new Map();
  return {
    classList: {
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
    },
    setAttribute(name, value) { attributes.set(name, value); },
    removeAttribute(name) { attributes.delete(name); },
    hasClass(name) { return classes.has(name); },
    getAttribute(name) { return attributes.get(name); },
  };
};

test('sets hidden class and aria-hidden state together', () => {
  const element = createElement();
  setViewHidden(element, true, 'page-hidden');
  assert.equal(element.hasClass('page-hidden'), true);
  assert.equal(element.getAttribute('aria-hidden'), 'true');

  setViewHidden(element, false, 'page-hidden');
  assert.equal(element.hasClass('page-hidden'), false);
  assert.equal(element.getAttribute('aria-hidden'), undefined);
});
