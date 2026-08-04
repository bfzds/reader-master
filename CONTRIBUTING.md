# 参与维护

## 修改范围

- 前端代码位于 `app_unpacked/src/`。
- Tauri 代码位于 `src-tauri/src/`。
- Electron 目录位于 `legacy/electron/`，仅用于历史参考，不能作为当前构建目标。
- `artifacts/`、`asar_extracted/`、`node_modules/` 与 `src-tauri/target/` 是生成、运行或参考内容，通常不应修改。

## 开发流程

1. 先阅读 `CLAUDE.md` 和与修改内容对应的 `docs/` 文档。
2. 保持原生 ES Module、直接操作 DOM、局部修改的既有风格。
3. 修改 DOM 时，同时检查 `app_unpacked/src/index.html` 与相关页面模块。
4. 修改桌面能力时，同时检查 Tauri 壳与 `app_unpacked/src/js/platform/` 抽象层。
5. 修改 host/port、CSP、静态服务、native command、folder registry、IndexedDB 或迁移格式时，同步更新对应 `docs/`、测试和发布检查。
6. 运行受影响的自动测试，并完成对应的人工回归。

## 常用验证

```powershell
npm run test:toc
node --test scripts/test-settings-migration.mjs
node --test scripts/test-migration-export-options.mjs
node --test scripts/test-migration-source.mjs
node --test scripts/test-migration-conflict.mjs
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
```

详细测试范围见 [测试说明](docs/testing.md)。
