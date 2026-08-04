const nonMigratableSettingKeys = new Set([
  'import_save_folder_handle',
  'import_save_folder_handle_path',
  'import_save_folder_handle_name',
  'import_save_folder_path',
  'import_save_folder_name',
  'debug.show_console',
]);

export const isMigratableSettingKey = function (key) {
  return typeof key === 'string' && !nonMigratableSettingKeys.has(key);
};
