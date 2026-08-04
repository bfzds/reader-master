# Electron 历史参考

本目录保存旧 Electron 壳与其前端适配代码，供追溯实现细节时参考。

- 当前开发与发布只使用 `src-tauri/` 和 `app_unpacked/src/`。
- 本目录不参与 `npm run tauri:dev` 或 `npm run tauri:build`。
- 不要在此目录中新增功能；需要桌面能力时，应在 Tauri 壳与前端 `platform/` 抽象层中实现。

原始目录结构已保留在 `app_unpacked/` 下，避免历史文件的相对引用失效。
