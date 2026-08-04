import assert from 'node:assert/strict';
import test from 'node:test';

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.classList = { add() {} };
    this.style = { setProperty() {} };
    this.clientWidth = 100;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute() {}
  remove() {}
  contains(element) { return element === this; }
  getClientRects() { return { item: () => ({ x: 0 }) }; }
}

globalThis.document = new (class extends EventTarget {
  constructor() {
    super();
    this.activeElement = null;
    this.documentElement = { clientWidth: 1000, clientHeight: 800 };
  }

  createElement() { return new FakeElement(); }
})();
globalThis.window = new (class extends EventTarget {
  requestAnimationFrame(callback) { queueMicrotask(callback); }
})();

const { default: RangeInput } = await import('../app_unpacked/src/js/ui/component/range.js');

test('dragging to the right edge preserves a maximum that is not step-aligned', async () => {
  const range = new RangeInput(new FakeElement(), { min: 0, max: 10, step: 3, value: 0 });
  const changes = [];
  range.onChange(value => changes.push(value));

  range.listener.triggerCallback('start', { position: [100, 0], touch: false });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(range.value, 10);
  assert.deepEqual(changes, [10]);
});
