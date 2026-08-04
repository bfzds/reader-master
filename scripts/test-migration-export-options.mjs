import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMigrationEntry,
  createMigrationSavePayload,
  reportMigrationProgress,
  shouldYieldMigrationProgress,
} from '../app_unpacked/src/js/data/migration-export.js';

const baseEntry = { identity: { contentHash: 'hash' }, order: 0, index: {} };
const content = { text: '正文', resources: {} };
const source = { name: 'source.epub', type: 'application/epub+zip', bytes: [1, 2, 3] };
const serializeSource = async value => ({ ...value, serialized: true });

test('默认不导出正文和原文件', async () => {
  const entry = await createMigrationEntry(baseEntry, content, source, { serializeSource });
  assert.equal(Object.hasOwn(entry, 'content'), false);
  assert.equal(Object.hasOwn(entry, 'source'), false);
});

test('选择导出正文时只包含正文', async () => {
  const entry = await createMigrationEntry(baseEntry, content, source, {
    includeContent: true,
    serializeSource,
  });
  assert.deepEqual(entry.content, content);
  assert.equal(Object.hasOwn(entry, 'source'), false);
});

test('选择导出原文件时只包含原文件', async () => {
  const entry = await createMigrationEntry(baseEntry, content, source, {
    includeSource: true,
    serializeSource,
  });
  assert.equal(Object.hasOwn(entry, 'content'), false);
  assert.deepEqual(entry.source, { ...source, serialized: true });
});

test('同时选择时同时包含正文和原文件', async () => {
  const entry = await createMigrationEntry(baseEntry, content, source, {
    includeContent: true,
    includeSource: true,
    serializeSource,
  });
  assert.deepEqual(entry.content, content);
  assert.deepEqual(entry.source, { ...source, serialized: true });
});

test('导出进度回调收到当前进度', async () => {
  const progress = [];
  await reportMigrationProgress(value => progress.push(value), { current: 2, total: 5 });
  assert.deepEqual(progress, [{ current: 2, total: 5 }]);
});

test('导出只在准备阶段和每十条记录后让出事件循环', () => {
  assert.equal(shouldYieldMigrationProgress({ current: 0 }), true);
  assert.equal(shouldYieldMigrationProgress({ current: 1 }), false);
  assert.equal(shouldYieldMigrationProgress({ current: 10 }), true);
  assert.equal(shouldYieldMigrationProgress({ current: 11 }), false);
});

test('迁移文件保存使用 JSON 字符串而不是超大字节数组', () => {
  assert.deepEqual(createMigrationSavePayload('{"format":"treader-migration"}'), {
    content: '{"format":"treader-migration"}',
  });
});
