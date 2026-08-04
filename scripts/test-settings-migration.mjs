import test from 'node:test';
import assert from 'node:assert/strict';
import { isMigratableSettingKey } from '../app_unpacked/src/js/data/settings-migration.js';

test('调试控制台开关不参与迁移', () => {
  assert.equal(isMigratableSettingKey('debug.show_console'), false);
});

test('环境相关设置不参与迁移', () => {
  assert.equal(isMigratableSettingKey('import_save_folder_handle'), false);
  assert.equal(isMigratableSettingKey('import_save_folder_name'), false);
  assert.equal(isMigratableSettingKey('import_save_folder_path'), false);
});

test('普通阅读设置仍参与迁移', () => {
  assert.equal(isMigratableSettingKey('view_mode'), true);
});
