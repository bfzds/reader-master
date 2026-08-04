# 发布说明

## 构建

```powershell
npm install
npm run tauri:build
```

开发和构建前会先运行 `node scripts/update-sw-version.mjs`。只有 `app_unpacked/src/sw.js` 的预缓存清单发生变化时，版本 hash 才会变化。

当前发布目标仅为 Tauri/Windows NSIS。`src-tauri/tauri.conf.json` 将 `app_unpacked/src/` 打包为 `treader-frontend/` 资源；发布运行时由 `src-tauri/src/shell.rs` 在固定 loopback origin 提供该目录。`legacy/electron/` 不参与构建。

## 发布前检查

1. 运行 [测试说明](testing.md) 中的 `npm run test:toc`、Node tests 和 `cargo test --manifest-path src-tauri/Cargo.toml`。
2. 核对 `src-tauri/tauri.conf.json`、`src-tauri/src/shell.rs` 与 `scripts/serve.cjs` 的 host/port、CSP 和静态资源策略；发布 CSP 对 Tauri IPC 的 `connect-src` 例外必须保留。
3. 完成人工回归：导入/刷新/删除、空书阅读、迁移、窗口状态、目录 registry 恢复、端口占用、Worker/字体/EPUB 资源。
4. 验证发布资源根、路径遍历/符号链接拒绝、`nosniff`/no-store/CSP 响应头和 128 MiB 文件限制。
5. 确认 migration format、IndexedDB schema、folder registry 或 native command 变更已同步到文档和测试。
6. 确认版本号、变更记录和许可证文件与发布内容一致。
7. updater 发布仍需真实 HTTPS endpoint、Tauri updater 公钥和 CI 私钥 secret；这些值未配置前只做 NSIS/staging 构建，不发布自动更新元数据。

`artifacts/` 只用于保存可分发文件或运行产物，不应反过来成为源码输入，也不应提交生成的运行时依赖。
