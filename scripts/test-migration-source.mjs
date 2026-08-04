import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getImportedBookSource,
  getMigrationSourceForExport,
  getMigrationSourceBytes,
  getMigrationSourceSaveRequest,
  serializeMigrationSource,
  shouldResolveMigrationSource,
} from '../app_unpacked/src/js/data/migration-source.js';

test('文本导入在解析器未返回 source 时保留原文件对象', () => {
  const sourceFile = {};
  assert.equal(getImportedBookSource({}, sourceFile), sourceFile);
});

test('解析器返回 source 时优先使用解析后的原文件对象', () => {
  const sourceFile = {};
  const parsedSource = {};
  assert.equal(getImportedBookSource({ source: parsedSource }, sourceFile), parsedSource);
});

test('导出原文件时可从来源路径补读未缓存的原文件', async () => {
  const sourceFile = {};
  const meta = { sourceFolderPath: 'source-folder', sourceName: 'source-file' };
  let resolverCalls = 0;
  const result = await getMigrationSourceForExport(meta, null, async value => {
    resolverCalls++;
    assert.equal(value, meta);
    return sourceFile;
  });
  assert.equal(result, sourceFile);
  assert.equal(resolverCalls, 1);
});

test('导出时已有原文件副本则不重复读取来源路径', async () => {
  const sourceFile = {};
  let resolverCalls = 0;
  const result = await getMigrationSourceForExport({}, sourceFile, async () => {
    resolverCalls++;
    return null;
  });
  assert.equal(result, sourceFile);
  assert.equal(resolverCalls, 0);
});

test('迁移条目已有正文时不再查找旧来源路径', () => {
  assert.equal(shouldResolveMigrationSource({
    content: { text: 'content' },
    meta: { sourceFolderPath: 'source-folder', sourceName: 'source-file' },
  }), false);
});

test('迁移条目缺少正文和原文件时才查找旧来源路径', () => {
  assert.equal(shouldResolveMigrationSource({
    meta: { sourceFolderId: 'source-folder', sourceName: 'source-file' },
  }), true);
});

test('迁移条目包含原文件时生成默认文件夹保存请求', () => {
  assert.deepEqual(getMigrationSourceSaveRequest({
    source: { name: 'source.epub', bytes: [1, 2, 3] },
    meta: { sourceName: 'fallback.epub' },
  }), { name: 'source.epub', bytes: [1, 2, 3] });
});

test('缺少原文件内容时不生成保存请求', () => {
  assert.equal(getMigrationSourceSaveRequest({ meta: { sourceName: 'source.epub' } }), null);
  assert.equal(getMigrationSourceSaveRequest({ source: { name: 'source.epub', bytes: [] } }), null);
});

test('原文件没有名称时使用迁移元数据中的来源名称', () => {
  assert.deepEqual(getMigrationSourceSaveRequest({
    source: { bytes: [4, 5] },
    meta: { sourceName: 'fallback.txt' },
  }), { name: 'fallback.txt', bytes: [4, 5] });
});

test('只有迁移正文时生成 TXT 保存请求', () => {
  const request = getMigrationSourceSaveRequest({
    content: { text: 'content text' },
    meta: { sourceName: 'source.epub' },
  });
  assert.deepEqual(request, {
    name: 'source.txt',
    bytes: Array.from(new TextEncoder().encode('content text')),
  });
});

test('只有字符串正文时也生成 TXT 保存请求', () => {
  const request = getMigrationSourceSaveRequest({
    content: 'content text',
    meta: { sourceName: 'source.gz' },
  });
  assert.deepEqual(request, {
    name: 'source.txt',
    bytes: Array.from(new TextEncoder().encode('content text')),
  });
});

test('迁移原文件使用 Base64 字段恢复字节', () => {
  assert.deepEqual(getMigrationSourceBytes({ base64: 'AQID' }), [1, 2, 3]);
});

test('迁移原文件序列化为 Base64 而不是超大字节数组', async () => {
  const serialized = await serializeMigrationSource({
    name: 'source.bin',
    type: 'application/octet-stream',
    lastModified: 123,
    arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
  });
  assert.deepEqual(serialized, {
    name: 'source.bin',
    type: 'application/octet-stream',
    lastModified: 123,
    base64: 'AQID',
  });
});
