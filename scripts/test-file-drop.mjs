import test from 'node:test';
import assert from 'node:assert/strict';
import { getDropFile, getSupportedDropPath, isSupportedImportFile } from '../app_unpacked/src/js/page/list/file-drop.mjs';

test('accepts supported book extensions when Windows reports a generic MIME type', () => {
  assert.equal(isSupportedImportFile({ name: 'book.txt', type: 'application/octet-stream' }), true);
  assert.equal(isSupportedImportFile({ name: 'book.gz', type: '' }), true);
  assert.equal(isSupportedImportFile({ name: 'book.epub', type: '' }), true);
});

test('gets the dropped file from the data transfer item', () => {
  const file = { name: 'book.txt', type: '' };
  const dataTransfer = {
    items: [{ kind: 'file', type: '', getAsFile: () => file }],
    files: [],
  };
  assert.equal(getDropFile(dataTransfer), file);
});

test('finds a supported file from Tauri native drop paths', () => {
  assert.equal(getSupportedDropPath(['C:/books/cover.jpg', 'C:/books/book.txt']), 'C:/books/book.txt');
  assert.equal(getSupportedDropPath(['C:/books/cover.jpg']), null);
});
