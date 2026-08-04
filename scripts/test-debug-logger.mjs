import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DEBUG_LOG_ENTRIES,
  appendDebugEntry,
  clampDebugLoggerPosition,
  formatDebugArgument,
  formatDebugMessage,
  normalizeDebugLoggerPosition,
} from '../app_unpacked/src/js/ui/util/debug-logger-core.js';

test('格式化常见日志参数', () => {
  assert.equal(formatDebugArgument('ready'), 'ready');
  assert.equal(formatDebugArgument({ count: 2 }), '{"count":2}');
  assert.match(formatDebugArgument(new Error('failure')), /failure/);
  assert.equal(formatDebugMessage(['ready', { count: 2 }]), 'ready {"count":2}');
});

test('循环对象格式化时不会抛出异常', () => {
  const circular = {};
  circular.self = circular;
  assert.match(formatDebugArgument(circular), /\[object Object\]/);
});

test('追加日志不会修改原数组并限制数量', () => {
  const entries = Array.from({ length: MAX_DEBUG_LOG_ENTRIES }, (_, index) => ({ index }));
  const nextEntries = appendDebugEntry(entries, { index: MAX_DEBUG_LOG_ENTRIES });
  assert.equal(entries.length, MAX_DEBUG_LOG_ENTRIES);
  assert.equal(nextEntries.length, MAX_DEBUG_LOG_ENTRIES);
  assert.equal(nextEntries[0].index, 1);
  assert.equal(nextEntries.at(-1).index, MAX_DEBUG_LOG_ENTRIES);
});

test('支持自定义日志数量上限', () => {
  const entries = appendDebugEntry([{ index: 1 }], { index: 2 }, 1);
  assert.deepEqual(entries, [{ index: 2 }]);
});

test('调试面板拖动位置限制在窗口范围内', () => {
  assert.deepEqual(clampDebugLoggerPosition({
    left: -20,
    top: 900,
    width: 300,
    height: 200,
    viewportWidth: 1000,
    viewportHeight: 800,
  }), { left: 10, top: 590 });
});

test('只接受包含有限 left 和 top 的控制台坐标', () => {
  assert.deepEqual(normalizeDebugLoggerPosition({ left: 36, top: 88 }), { left: 36, top: 88 });
  assert.equal(normalizeDebugLoggerPosition({ left: '36', top: 88 }), null);
  assert.equal(normalizeDebugLoggerPosition({ left: Infinity, top: 88 }), null);
  assert.equal(normalizeDebugLoggerPosition(null), null);
});
