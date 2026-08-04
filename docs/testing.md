# 测试说明

## 1. 自动测试

根 `package.json` 已提供通用 `npm test` 入口；当前没有独立 lint script。可执行入口如下：

```powershell
npm.cmd test
cargo test --manifest-path src-tauri/Cargo.toml
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

Rust 当前单元测试覆盖窗口创建策略和基本路径包含判断，不等于完整的文件系统安全测试。`node --check` 只验证语法，不验证浏览器 API、IndexedDB、Tauri IPC 或真实 DOM 行为；修改活跃 JS、Worker 或 `scripts/*.cjs|mjs` 时应检查受影响文件。

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

- TXT、GZ、EPUB 导入与文件夹刷新。
- EPUB 3 `nav` 优先、无有效 `nav` 时 EPUB 2 NCX 回退、导航页排除和 spine 顺序。
- EPUB 图片占位符、懒加载、关闭图片和资源失败时的 alt/`[image]` 降级；CSS background、SVG、表格、横线与原版布局不应被误判为当前文本重排的保真能力。
- 翻页、滚动、目录、书签、搜索、跳转和编辑保存。
- 编辑内容为空时保存、关闭、重新打开；编辑 EPUB 后仅生成最小 EPUB 3，原 CSS、布局、目录层级和图片资源不可恢复。
- 普通下载/分享是 UTF-8 TXT，不是 EPUB round-trip；迁移测试需区分正文导出和原文件导出。
- 配置页快速连续修改和 Wake Lock 生命周期。

## 3. 测试限制

当前没有完整自动化 UI/e2e、跨平台文件系统权限矩阵或性能基准。现有测试和人工回归不等于安全审计，也不能覆盖所有 OS 文件系统竞态。
