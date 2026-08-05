# 测试说明

## 1. 自动测试

根 `package.json` 提供快速 Node 回归、TXT 目录专项和活跃前端语法检查入口。语法检查只调用 Node 的 `--check`，不验证 DOM、IndexedDB、Tauri IPC 或桌面窗口行为。可执行入口如下：

```powershell
npm.cmd test
npm.cmd run test:toc
npm.cmd run test:performance
npm.cmd run check:syntax
cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

`npm.cmd test` 会按文件名串行运行 `scripts/test-*.mjs` 和 `scripts/test-*.cjs`，其中包含 `test-toc.cjs`。单独运行 `npm run test:toc` 仍可只验证 TXT 目录识别和自动分段。

测试文件只能使用 `test-*.mjs` 或 `test-*.cjs` 命名，避免被自动发现规则遗漏。不要新增手工维护的测试清单。通用 Node 夹具位于 `scripts/test-fixtures.mjs` 和 `scripts/test-test-helpers.mjs`：前者提供独立 fake IndexedDB、可控 Worker、时钟、JSZip 和 Blob URL 记录器，后者提供 IndexedDB request/transaction 等待器。夹具行为由 `node --test scripts/test-test-fixtures.mjs` 覆盖。

其中还包括 Service Worker 清单/hash、CSP 三处配置一致性和 IndexedDB v3 分块 schema 测试。

需要定位单个测试时，可显式运行：

```powershell
node --test scripts/test-settings-migration.mjs
node --test scripts/test-migration-export-options.mjs
node --test scripts/test-migration-source.mjs
node --test scripts/test-migration-conflict.mjs
node --test scripts/test-debug-logger.mjs
node --test scripts/test-read-control-layout.mjs
```

部分 shell 支持 `node --test scripts/test-*.mjs`，但 Windows shell 对 glob 展开行为不同；跨环境验证时优先使用上面的明确文件名。

### P0 基线（2026-08-05）

本次基线在 Windows 10 专业版 `10.0.19045`、Node `v24.14.0`、npm `11.9.0`、Rust `1.97.1`、Cargo `1.97.1` 上运行。机器为 AMD Ryzen 7 3700X、15.9 GiB 内存；工作区当时包含未跟踪的计划文档和启动脚本，因此这里记录的是当前可复现基线，不宣称工作树干净。

| 命令 | 结果 | 观测耗时 | 备注 |
| --- | --- | ---: | --- |
| `npm test` | 通过 | 约 7.8 s | 23 个测试文件通过 |
| `npm run test:toc` | 通过 | 约 0.8 s | TXT 目录与自动分段 |
| `npm run test:performance` | 通过 | 约 1.0 s | 源码结构性能护栏 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 通过 | 约 1.5 s | 7 个 Rust 测试通过 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | 未通过 | 约 0.3 s | 现有 `src-tauri` 文件存在 rustfmt 差异，作为独立存量问题记录 |
| `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings` | 通过 | 约 3.2 s | 无 warning |

基线失败项不能被测试基础设施改动掩盖；如果后续需要修复格式，应单独提交并重新运行完整基线。

Rust 当前单元测试覆盖窗口创建策略和基本路径包含判断，不等于完整的文件系统安全测试。`node --check` 只验证语法，不验证浏览器 API、IndexedDB、Tauri IPC 或真实 DOM 行为；修改活跃 JS、Worker 或 `scripts/*.cjs|mjs` 时应检查受影响文件。`npm run check:syntax` 会递归检查 `app_unpacked/src/` 下的 `.js` 与 `.mjs`，不扫描历史 Electron 代码、构建产物或测试脚本。

后续阶段命令边界：`npm run test:e2e:poc` 只用于验证 Tauri 驱动是否可行；只有 PoC 在本机和 Windows runner 都能稳定启动、定位、隔离数据并保留失败诊断，才启用 `npm run test:e2e`。`npm run test:coverage` 只报告 Node 可驱动生产模块的覆盖率，不设置阻塞 PR 的全局门槛；`npm run test:benchmark` 只输出运行时诊断，不替代 `npm run test:performance`。

## 2. 人工回归矩阵

### 启动与静态服务

- `npm run tauri:dev` 加载 `http://127.0.0.1:2333`。
- `npm run tauri:build` 后发布包由 Rust 静态服务加载 bundled `treader-frontend/`。
- 预占 2333 后启动失败并给出错误，不加载未知服务。
- `GET`/`HEAD` 正常；`POST` 等方法被拒绝。
- `..`、绝对路径、编码路径、静态 root 外路径和 symlink 资源被拒绝。
- 检查 CSP、`X-Content-Type-Options: nosniff` 和 no-store 响应头。

### 存储与初始化

- 空数据库首次启动、IndexedDB v2 升级和升级阻塞。
- 连续设置同一个配置 key，确认最终顺序和 listener 行为。
- 空 TXT/GZ、空正文翻页与滚动阅读不崩溃。
- Worker 成功、错误、超时和 Worker 不可用时都能结束流程。
- 失效字体 ID、主题颜色、EPUB 图片和资源加载。
- 窗口尺寸与最大化状态恢复。

### 导入目录

- native picker 后列出、读取、写入和删除 `.txt`、`.gz`、`.epub`。
- 重启后 folder registry 恢复；目录被移动、删除、替换或权限失效后要求重新选择。
- 旧 raw path 或伪造 folderId 不能获得 native 目录权限。
- 访问授权目录外文件、symlink 文件/目录、非支持扩展名和超过 `128 MiB` 的文件均被拒绝。
- 书籍来源带 `sourceFolderId` 时只删除对应 registry 目录中的文件；只有旧 `sourceFolderPath` 的记录不应回退删除当前目录同名文件。
- 非 Tauri 环境验证浏览器 File System Access API 的权限与 `Uint8Array` 写入。

### 迁移

- 仅配置、仅正文、仅原文件以及正文与原文件同时导出。
- source hash、content hash+length、文件名和书名匹配。
- 多候选冲突、同一目标重复命中和冲突取消。
- 空字符串正文与缺正文 `configOnly` 占位。
- v1 配置格式和旧数组备份。
- 默认目录缺失、source 保存失败、已有同名文件和不可写目录。

### 阅读功能

- 已自动化覆盖：启动、导入小型 UTF-8 TXT、书库出现、打开阅读页并确认正文存在（`npm run test:e2e`）。
- 仍需人工或后续 E2E：翻页边界、滚动切换后的异步状态、目录跳转、进度恢复、书签、主题持久化、EPUB 打开与资源失败降级。
- TXT、GZ、EPUB 导入与文件夹刷新。
- EPUB 3 `nav` 优先、无有效 `nav` 时 EPUB 2 NCX 回退、导航页排除和 spine 顺序。
- EPUB 图片占位符、懒加载、关闭图片和资源失败时的 alt/`[image]` 降级；CSS background、SVG、表格、横线与原版布局不应被误判为当前文本重排的保真能力。
- 翻页、滚动、目录、书签、搜索、跳转和编辑保存。
- 编辑内容为空时保存、关闭、重新打开；编辑 EPUB 后仅生成最小 EPUB 3，原 CSS、布局、目录层级和图片资源不可恢复。
- 普通下载/分享是 UTF-8 TXT，不是 EPUB round-trip；迁移测试需区分正文导出和原文件导出。
- 配置页快速连续修改和 Wake Lock 生命周期。

## P1 automated verification

Use these commands after the P0 baseline:

```powershell
npm.cmd run test:e2e:poc
npm.cmd run test:e2e
npm.cmd run test:coverage
npm.cmd run tauri:build
```

`test:e2e:poc` only verifies the Tauri WebDriver route, fixed origin, stable selectors and test-data isolation. `test:e2e` adds the smallest user-visible flow: import a temporary UTF-8 TXT file, confirm it appears in the bookshelf, open it and verify the text body.

The E2E runner copies `app_unpacked/src` into a dedicated temporary directory and injects the WDIO guest script there. It never modifies the formal frontend entry point. The Tauri capability that grants `wdio-webdriver:default` is supplied inline through a PoC-only build config, so normal builds do not gain WebDriver permissions.

E2E diagnostics remain in `artifacts/e2e-poc/diagnostics` and `logs/` after failures. Cleanup is restricted to the runner's dedicated temporary root and is refused for any path outside that root.

`test:coverage` uses `c8` and reports only Node-runnable production modules under `app_unpacked/src/js/data`, `app_unpacked/src/js/text` and `app_unpacked/src/js/platform`. It emits text and LCOV reports under `artifacts/coverage`; the initial result is recorded in `docs/testing/coverage-baseline.json` and is informational rather than a blocking threshold.

`test:benchmark` is intentionally separate from structural performance regression tests. It measures deterministic 100 KiB, 5 MiB and 50 MiB text inputs through the production chunk split/join path, and prints p50/p95 time plus peak RSS, heap and external memory. The benchmark is diagnostic only; compare results on the same machine, Node version and input before treating a 20% p95 increase as a regression candidate.

## 3. 测试限制

当前已完成桌面 E2E PoC、最小 TXT 导入 E2E、Node 覆盖率报告和 TXT 分块运行时基准；Windows runner 的实际执行、跨平台文件系统权限矩阵以及完整阅读器回归仍需后续验证。现有测试和人工回归不等于安全审计，也不能覆盖所有 OS 文件系统竞态。`docs/testing.md` 是唯一人工回归矩阵；自动化稳定覆盖的项目会在后续阶段从“必做人工检查”移到自动化说明，暂不适合稳定自动化的风险仍保留在本矩阵中。
