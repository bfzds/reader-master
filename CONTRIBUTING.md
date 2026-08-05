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
7. Node 测试文件必须放在 `scripts/`，并命名为 `test-*.mjs` 或 `test-*.cjs`。`npm test` 会自动发现这两类文件；不要维护手工测试清单。

新增测试必须沿用 `scripts/test-all.mjs` 的发现规则：只会自动运行 `scripts/test-*.mjs` 和 `scripts/test-*.cjs`，测试夹具、辅助模块和普通脚本不能使用 `test-` 前缀。`scripts/test-test-discovery.mjs` 会保护这套规则，禁止为单个测试目录再维护一套平行发现器。

## 常用验证

```powershell
npm run test:toc
node --test scripts/test-settings-migration.mjs
node --test scripts/test-migration-export-options.mjs
node --test scripts/test-migration-source.mjs
node --test scripts/test-migration-conflict.mjs
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:dev
npm test
npm run test:toc
npm run test:performance
npm run check:syntax
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

`npm test` 是快速 Node 回归套件；`npm run check:syntax` 只检查活跃前端 `.js` 和 `.mjs` 的语法，不等价于 DOM、IPC 或桌面 E2E 验证。桌面 E2E、覆盖率和运行时 benchmark 只有在对应工具实际验证并落地后才会加入命令。

详细测试范围、基线和人工回归边界见 [测试说明](docs/testing.md)。
