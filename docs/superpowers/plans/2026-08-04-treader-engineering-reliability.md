# tReader 工程治理与运行时可靠性修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 `127.0.0.1:2333` 固定 origin 和现有阅读数据的前提下，建立可回滚基线，修复预缓存、IPC、窗口尺寸、数据存储和发布升级链路。

**Architecture:** 保留当前 `Tauri 2 + Rust + 原生 ES Module + IndexedDB` 架构，不引入 bundler 重构。先完成 Git/测试前置检查，再处理低风险源码清理；窗口状态、Service Worker、存储迁移、自动更新分别独立验收。

**Tech Stack:** Node.js `node:test`、npm/package-lock、Rust/Cargo、Tauri 2、IndexedDB、GitHub Actions（仅在托管平台确认后使用）。

**Current Baseline:** 当前 `main` 已包含首个源码基线 commit；本次执行不重复初始化仓库、不执行 `git commit`，只在现有工作区继续修复并展示 diff。

**Execution Status:** Task 1、Task 3、Task 4 的自动化部分和 Task 5 的静态 CSP 部分已完成；Task 2 未删除语音占位文件，Task 5/6 的真实 Tauri 手工回归尚未执行；Task 7 等待真实 HTTPS endpoint、updater 公钥和 CI secret。

## Global Constraints

- 活跃前端源码以 `app_unpacked/src/` 为准，桌面壳源码以 `src-tauri/src/` 为准。
- 保留 `http://127.0.0.1:2333`，不改成动态端口；IndexedDB/localStorage origin 不能变化。
- 不把 `app_unpacked/node_modules/`、`app_unpacked/dist/`、`src-tauri/target*/`、`artifacts/` 纳入源码基线。
- 删除现有语音文件前必须获得用户确认；计划阶段不删除任何用户文件。
- 不自动执行 `git commit`；每阶段完成后先展示 diff 和测试结果，由用户决定是否提交。

---

### Task 1: 先确认 Git 环境，再建立基线和测试入口

**Files:**
- Modify: `.gitignore`
- Modify: `package.json:4`
- Modify: `scripts/test-all.mjs`（已存在，核对扫描规则并仅在需要时修正）
- Conditional Create: `.github/workflows/verify.yml`（仅确认 GitHub 托管后创建）
- Modify: `docs/testing.md:1`

**Interfaces:**
- `scripts/test-all.mjs` 枚举 `scripts/test-*.{mjs,cjs}`，串行调用 Node `--test` 并传播失败状态。必须包含 `.cjs`，否则会漏掉唯一注册的 `test-toc.cjs`。
- `npm test` 成为统一 JavaScript 测试入口。
- CI 文件不在托管平台未确认前创建，避免提交无效的 GitHub 工作流。
- 当前仓库已存在有效的 baseline commit、统一测试入口和 `/src-tauri/target-*/` 忽略规则，本任务不重复创建这些内容。

- [ ] **Step 1: 核验现有 Git 基线和提交身份**

Run: `git rev-parse --is-inside-work-tree; git config --global user.name; git config --global user.email; git config --local user.name; git config --local user.email`

Expected: 确认当前仓库已有 baseline commit；若仓库已有提交，不执行 `git init` 或重复首 commit。只有在确需新提交且身份缺失时才要求用户补充姓名和邮箱。

- [ ] **Step 2: 确认远程托管平台**

检查用户要使用 GitHub、GitLab、Gitea 还是仅本地 Git。只有确认 GitHub 后才创建 `.github/workflows/verify.yml`；其他平台使用相同命令，但放入对应 CI 配置。

- [ ] **Step 3: 核对已存在 baseline commit 的边界**

确认当前 baseline commit 使用：`chore: establish source baseline with known mojibake and retired speech remnants`，并明确它仍含已知乱码和语音残留。若当前 HEAD 已符合该边界，只记录结果，不重写历史。

- [ ] **Step 4: 补充构建产物忽略规则**

确认 `.gitignore` 已包含 `/src-tauri/target-*/`，保留已有 `/src-tauri/target/`、`/artifacts/` 和 `node_modules` 规则；缺失时才补充。

**Step 4 之后只做非破坏性预览**：使用 `git status --short`、`git diff --stat` 和明确的允许文件列表核对，不执行 `git add -A`，避免把当前工作区的压缩包、截图或其他用户文件加入暂存区。

- [ ] **Step 5: 编写并验证统一 Node 测试入口**

`scripts/test-all.mjs` 使用 `readdir` 找到 `scripts/test-*.{mjs,cjs}`，按文件名排序，用 `spawnSync(process.execPath, ['--test', file])` 执行；任一失败时返回非零退出码。`.cjs` 和 `.mjs` 都必须包含，不能只扫 `.mjs`。

先单独验证 `node --test scripts/test-toc.cjs` 能否独立通过——`.cjs` 在 `node --test` 下的行为需实测确认，若该脚本依赖 `process.exit` 等自退出约定，确认 runner 不会吞掉其判定再并入 test-all。

Run: `node scripts/test-all.mjs`

Expected: 当前 12 个测试文件（11 个 `.mjs` + `test-toc.cjs`，不把 runner 自身计入）都被执行，并显示失败文件名。

- [ ] **Step 6: 注册 `npm test`，再按托管平台补 CI**

确认 `package.json` 已注册 `"test": "node scripts/test-all.mjs"`；缺失时才补充。GitHub 场景下，工作流依次运行 `npm ci`、`npm test`、`cargo test --manifest-path src-tauri/Cargo.toml` 和 JS `node --check`；当前 `origin` 已指向 GitHub。

- [ ] **Step 7: 更新文档并验证基线**

Run: `npm.cmd test; cargo test --manifest-path src-tauri/Cargo.toml`

Expected: Node 和 Rust 测试通过；`docs/testing.md` 不再声称没有通用 `npm test`，并记录现有 baseline 的已知问题。

---

### Task 2: 清理乱码注释与语音残留

**Files:**
- Modify: `app_unpacked/src/js/text/text.js:68`
- Modify: `app_unpacked/src/js/text/text.js:123`
- Modify: `app_unpacked/src/js/text/text.js:135`
- Modify: `app_unpacked/src/js/text/epub.js:262`
- Modify: `app_unpacked/src/sw.js:105`
- Modify: `README.md:1`
- Modify: `docs/testing.md:1`
- Review before deletion: `app_unpacked/src/js/text/speech.js`
- Review before deletion: `app_unpacked/src/js/page/read/speech/readspeech.js`
- Modify: `app_unpacked/src/js/page/config/configpage.js:343`
- Modify: `app_unpacked/src/js/i18n/locale/en.js:121`
- Modify: `app_unpacked/src/js/i18n/locale/zh_cn.js:121`
- Modify: `app_unpacked/src/js/i18n/locale/zh_tw.js:122`

**Interfaces:**
- 只改注释、文档和确认已移除的语音残留，不改解析、导入和阅读逻辑。
- 删除语音占位模块前，`rg -n "speech|readspeech|configSpeech|buttonSpeech" app_unpacked/src` 不得再发现真实运行时 import；帮助页、隐私说明和历史 CSS 是否清理，单独按文件清单验收，不把普通历史说明误判成运行时依赖。
- `sw.js:105` 的唯一改动是**该行注释乱码**；同一区域 105-111 的 `epub.min.js`/`epubtextpage.js` 兼容分支**不在这里删除**，统一留到 Task 3 Step 5，避免两个任务在同一文件相邻行各自 commit 冲突。本任务只修注释，不碰 hack 逻辑。

- [ ] **Step 1: 保存乱码和语音残留扫描结果**

Run: `rg -n -i "speech|voice|朗读|语音" app_unpacked/src CHANGELOG.md; rg -n "璇|绾|鏂|�" app_unpacked/src README.md docs`

- [ ] **Step 2: 修复源码和维护文档编码**

只修正文档和注释中的乱码，不修改字符串常量、正则表达式、许可证头和业务分支。

- [ ] **Step 3: 用户确认后处理语音文件**

用户确认删除后，再删除两个占位文件；如果仍需兼容旧缓存，则保留空模块，并把兼容原因写进文件头。

- [ ] **Step 4: 同步删除配置页注释块和语言包语音键**

与语音模块同一变更中完成，避免出现代码已删但 UI 仍引用语音文案的中间状态。

- [ ] **Step 5: 运行语法和残留验证**

Run: `node --check app_unpacked/src/js/text/text.js; node --check app_unpacked/src/js/text/epub.js; node --check app_unpacked/src/sw.js; npm.cmd test`

Expected: 语法和现有测试通过；运行时代码不再 import 语音模块，未纳入本任务的帮助页说明和历史样式命中单独记录。

---

### Task 3: 修复 Service Worker 清单并自动管理缓存版本

**Files:**
- Modify: `app_unpacked/src/sw.js:10`
- Modify: `app_unpacked/src/sw.js:12`
- Create: `scripts/test-sw-resources.mjs`
- Create: `scripts/update-sw-version.mjs`
- Modify: `src-tauri/tauri.conf.json:7`
- Modify: `src-tauri/tauri.conf.json:10`
- Modify: `docs/testing.md:14`

**Interfaces:**
- `resourceList` 每个路径必须存在于 `app_unpacked/src/`。
- 运行时依赖的 `platform`、migration、debug-logger 模块必须进入预缓存清单。
- `sw.js:10` 使用 `YYYYMMDD-<resource-hash>` 格式；日期表示最近一次 resourceList 变化的日期，hash 未变化时必须完整保留当前版本字符串，不能因跨天运行而 bump。
- `scripts/update-sw-version.mjs` 在开发启动和生产构建前运行，避免依靠手工改版本。

- [ ] **Step 1: 写清单和版本失败测试**

测试解析 `resourceList`，检查文件存在、必需模块在清单中，并计算规范化清单的 SHA-256 前缀与 `version` 后缀一致。

- [ ] **Step 2: 运行测试确认当前问题**

Run: `node --test scripts/test-sw-resources.mjs`

Expected: 当前测试列出缺失的预缓存模块、已不存在的 EPUB hack 路径或版本 hash 不匹配。

- [ ] **Step 3: 实现版本更新脚本**

脚本读取 `sw.js` 的 `resourceList`，计算规范清单的 SHA-256 前缀，只更新 `/* VERSION */.../* VERSION */` 标记之间的值；只有 hash 与当前版本后缀不一致时，才使用当天日期生成新版本，hash 一致时保留旧日期和旧版本。

关键约束，避免自我循环与工作树 churn：
- hash 只计算 `resourceList`，**绝不包含 sw.js 自身**（否则改写版本又改 hash → 无限循环）。
- 日期仅作为“资源清单发生变化”的发布记录，**不参与 hash**；跨天但 resourceList 未变时保留旧日期，不得 bump 版本。
- 若计算出的版本串与当前文件内一致，**跳过写入**，不产生 mtime 或无谓 diff。

- [ ] **Step 4: 接入开发和构建前置命令**

将 `beforeDevCommand` 改为先执行 `node scripts/update-sw-version.mjs` 再启动 `scripts/serve.cjs`；将 `beforeBuildCommand` 改为执行同一脚本。

- [ ] **Step 5: 更新清单并清理过时 hack**

加入实际运行模块；检查 `legacy/`、旧构建目录和源码引用后，再删除不存在 `epub.min.js`/`epubtextpage.js` 的兼容分支。

- [ ] **Step 6: 运行清单、版本和全量测试**

Run: `node --test scripts/test-sw-resources.mjs; npm.cmd test; cargo test --manifest-path src-tauri/Cargo.toml`

Expected: 清单存在性、版本 hash、Node 测试和 Rust 测试全部通过。

---

### Task 4: 用 Rust 单测修复窗口防抖、DPI 和关闭刷新

**Files:**
- Modify: `src-tauri/Cargo.toml:13`
- Create: `src-tauri/src/window_state.rs`
- Modify: `src-tauri/src/main.rs:398`
- Modify: `src-tauri/src/main.rs:417`
- Modify: `src-tauri/src/main.rs:506`
- Modify: `src-tauri/src/main.rs:524`
- Modify: `docs/security-and-runtime.md:88`

**Interfaces:**
- 防抖逻辑在 Rust async runtime 内实现，测试放入现有 `src-tauri/src/main.rs` 的 `#[cfg(test)] mod tests`，不使用 JS 伪测试替代 Rust 行为测试。
- `window_state.rs` 提供无 Tauri 依赖的可测试状态转换函数；Tauri 事件回调只负责采集事件、取消任务和调用写入函数。
- 配置文件统一保存逻辑尺寸；`persist_window_state()` 从物理尺寸读取后，使用 `scale_factor()` 转换为逻辑尺寸。
- `Resized` 事件延迟约 250ms 合并写入；`CloseRequested` 必须取消/刷新挂起任务并立即写最后尺寸。
- `set_window_size()` 继续使用逻辑尺寸，避免 DPI 下启动尺寸逐次漂移。

- [ ] **Step 1: 在 Rust 现有测试模块补充失败测试**

覆盖连续 resize 只写最后一次、物理尺寸按 scale factor 转逻辑尺寸、关闭事件立即刷新、最大化状态保留上次非最大化尺寸。

- [ ] **Step 2: 运行 Rust 测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`

Expected: 新增窗口状态测试在实现前失败，现有 3 个测试仍保持通过。

- [ ] **Step 3: 实现 Rust 窗口状态防抖器**

使用单个可取消的 `tokio::time::sleep(Duration::from_millis(250))` 任务；连续事件只替换待写入的逻辑尺寸，计时器到期后调用现有 `write_app_config()`。防抖器本身的“保留最后值/close 立即 flush/最大化保留旧尺寸”由 `window_state.rs` 的纯函数覆盖。

- [ ] **Step 4: 修正 DPI 单位**

在 `persist_window_state()` 中读取 `inner_size()` 后调用窗口 scale factor 转换为逻辑宽高，再写入 `app-config.json`；保持 `set_window_size()` 和窗口创建使用同一单位。

- [ ] **Step 5: 保留关闭时立即落盘**

`CloseRequested` 不等待 250ms，直接读取当前逻辑尺寸并写入配置；如果存在挂起任务，先取消它，避免关闭后的延迟写覆盖最终值。

- [ ] **Step 6: 加入单实例保护**

加入与 Tauri 2 匹配的单实例机制；第二实例把启动请求转发给已有窗口并聚焦它，不再创建第二个静态服务器。固定端口继续保留作为额外保护。

- [ ] **Step 7: 运行 Rust、Node 和构建验证**

Run: `cargo test --manifest-path src-tauri/Cargo.toml; npm.cmd test; npm.cmd run tauri:build`

Expected: Rust 单测、Node 测试和 Tauri 构建通过，DPI 与关闭刷新行为有明确测试覆盖。

---

### Task 5: 统一 CSP 配置并验证开发 IPC 真实可用

**Files:**
- Create: `config/csp-dev.txt`
- Create: `config/csp-prod.txt`
- Modify: `scripts/serve.cjs:8`
- Modify: `src-tauri/src/shell.rs:14`
- Modify: `src-tauri/tauri.conf.json:14`
- Create: `scripts/test-csp-config.mjs`
- Modify: `docs/security-and-runtime.md:50`
- Modify: `docs/testing.md:33`

**Interfaces:**
- `config/csp-dev.txt` 和 `config/csp-prod.txt` 是 Node/Rust 的公共配置源；`tauri.conf.json` 因 Tauri 配置格式要求保留生产字符串，并由测试断言一致。这里是“公共源 + 受测试保护的副本”，不是三处独立手工维护。
- 开发 CSP 是否需要 `http://ipc.localhost` 不凭文档猜测，以真实 Tauri dev 命令验证为准；最终配置必须保证 `window.__TAURI__.core.invoke` 可用。

- [ ] **Step 1: 写 CSP 配置一致性测试**

断言三处配置的基础指令一致，单独检查 `connect-src` 的开发/生产值，并确认 `tauri.conf.json` 与生产公共配置一致。

测试必须同时支持重构前后的两种读取来源：Step 3 之前，`serve.cjs`/`shell.rs` 的 CSP 是内嵌字符串，测试直接解析源码；Step 3 之后改为读取 `config/csp-*.txt` 公共文件。测试用"先取内嵌值、失败则退回公共文件"的双路径读取，保证重构中途测试不先红。

- [ ] **Step 2: 运行静态 CSP 测试**

Run: `node --test scripts/test-csp-config.mjs`

Expected: 当前开发和生产差异被明确报告，而不是被无条件当作字符串错误。

- [ ] **Step 3: 统一公共配置读取路径**

让 `scripts/serve.cjs` 读取 `config/csp-dev.txt`，Rust 使用 `include_str!` 读取 `config/csp-prod.txt`；`tauri.conf.json` 继续保留生产字符串，由测试防止漂移。

- [ ] **Step 4: 做真实 Tauri dev IPC 验证**

Run: `npm.cmd run tauri:dev`

在 Tauri 窗口内验证：选择导入目录、读取目录文件、保存迁移文件、删除文件。重点确认 `pick_import_folder`、`read_file_in_folder`、`save_file_to_folder` 等 `invoke` 调用没有 CSP 或 IPC endpoint 错误；不使用 Codex 内置浏览器。

- [ ] **Step 5: 若 dev IPC 被 CSP 拦截，补充 endpoint 并回归**

把 `http://ipc.localhost` 加入开发 CSP 后重复上述操作，直到 dev 和 prod 两种模式的 Tauri command 都可用。

- [ ] **Step 6: 运行最终配置验证**

Run: `node --test scripts/test-csp-config.mjs; cargo test --manifest-path src-tauri/Cargo.toml; npm.cmd test`

Expected: 静态配置测试通过，真实 dev IPC 操作可用。

---

### Task 6: 为大书增加 IndexedDB 分块和惰性迁移

**Files:**
- Create: `app_unpacked/src/js/data/storage-chunks.js`
- Modify: `app_unpacked/src/js/data/storage.js:40`
- Modify: `app_unpacked/src/js/data/file.js:49`
- Create: `scripts/test-storage-chunks.mjs`
- Modify: `package.json:12`
- Modify: `docs/storage-and-persistence.md:1`

**Interfaces:**
- IndexedDB 从 v2 升到 v3，新增 `contentChunks` object store，键为 `[bookId, chunkIndex]`。
- `1 MiB` 按正文 UTF-8 编码后的字节数计算；小于或等于阈值的正文保留原路径，超过阈值的正文拆成每块最多 `1 MiB` 的 UTF-8 安全分块，`content` store 保存 `{ storage: 'chunks', chunkCount, textBytes, resources }` 描述信息。
- 读取接口继续返回现有字符串或 `{ text, resources }` 结构。
- 读取旧 v2 正文时先正常返回，再安排一次惰性重写；成功后改为 v3 分块格式，避免永久维护两套写入路径。
- Node 纯函数测试覆盖切分/合并；schema 和事务测试使用 `fake-indexeddb`，真实 Tauri 再做一次手工验证。
- `splitText(text, maxBytes = 1024 * 1024)` 返回 `string[]`，每块重新编码后不超过 `maxBytes`，不拆开 Unicode code point；`joinText(chunks)` 必须恢复原字符串。

- [ ] **Step 1: 写纯函数和 schema 的失败测试**

覆盖空文本、单块、跨块、Unicode、资源元数据、旧格式读取、惰性迁移和删除分块。

- [ ] **Step 2: 安装并审查 `fake-indexeddb`**

使用可信镜像安装为 devDependency；安装前后检查包内容和安装脚本，不执行混淆或提权内容。

- [ ] **Step 3: 运行测试确认当前实现失败**

Run: `node --test scripts/test-storage-chunks.mjs`

Expected: 明确指出分块 API、v3 schema 或惰性迁移尚未实现。

- [ ] **Step 4: 实现分块纯函数和 v3 schema**

先实现 `splitText()`、`joinText()`，再创建 `contentChunks` object store；不破坏现有 v2 object store。

- [ ] **Step 5: 接入新增、读取、更新和删除事务**

新增/更新时在同一事务内删除旧分块、写入新分块和描述；删除书籍时同步删除所有分块。

- [ ] **Step 6: 实现旧数据惰性迁移**

读取到旧整串正文后先返回兼容结构，再排队进行一次分块重写；迁移失败不影响本次阅读，但下次仍可重试。

- [ ] **Step 7: 运行自动和手工验证**

Run: `node --test scripts/test-storage-chunks.mjs; npm.cmd test; npm.cmd run tauri:dev`

Expected: fake IndexedDB schema/事务测试通过；真实 Tauri 中旧书可打开，新大书可保存、关闭、重启并恢复阅读位置。

---

### Task 7: 先接入 updater 通道，再独立处理签名

**Execution Gate:** 没有真实 HTTPS endpoint、公钥和 CI secret 时，停止在 updater 插件/发布工作流接入前，不生成占位配置，不创建会发布无效元数据的 workflow；先完成 `docs/update-signing.md`，待发布信息明确后再继续。

**Files:**
- Modify: `src-tauri/Cargo.toml:13`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src-tauri/tauri.conf.json:22`
- Modify: `src-tauri/capabilities/main.json`
- Create: `.github/workflows/release.yml`（仅确认 GitHub 托管后创建）
- Modify: `app_unpacked/src/js/page/config/configpage.js`
- Modify: `app_unpacked/src/js/i18n/locale/en.js`
- Modify: `app_unpacked/src/js/i18n/locale/zh_cn.js`
- Modify: `app_unpacked/src/js/i18n/locale/zh_tw.js`
- Modify: `docs/release.md:1`
- Create: `docs/update-signing.md`

**Interfaces:**
- updater 插件配置、更新 endpoint 和发布工作流先独立完成，不被 Windows 代码签名证书阻塞；endpoint 必须使用 HTTPS。
- updater 包签名和 Windows Authenticode 是两条不同链路，分别配置、分别验收。
- NSIS 安装包继续保留，作为首次安装和手动升级 fallback。
- 前端必须有"检查更新"入口（设置页新增菜单项，调用 `check()`/`downloadAndInstall()`），否则插件配置完也无法被用户触发。

- [ ] **Step 1: 接入 updater 插件和权限配置**

添加与 Tauri 2 匹配的 updater 插件，配置更新 endpoint、公开配置和 Tauri capabilities 里的 update 权限；不把私钥写入仓库。

同一变更中加前端"检查更新"入口：在 `configpage.js` 设置页新增菜单项（含"发现新版本 / 已是最新 / 下载失败"等 i18n 文案），调用 `check()` + `downloadAndInstall()`；三个 locale 文件补相应 key。避免插件配好却无 UI 触发。

- [ ] **Step 2: 创建 staging 发布工作流**

工作流执行测试和 `tauri build`，上传 NSIS 产物和 staging 元数据；未配置签名密钥时只允许 staging，不发布生产更新。

- [ ] **Step 3: 生成 updater 签名密钥**

使用 `tauri signer generate` 生成 updater 私钥/公钥；公钥进入应用配置，私钥进入 CI secret，私钥文件不得进入仓库。

- [ ] **Step 4: 接入 updater 签名发布**

配置 CI 使用 updater 私钥签名更新包，校验 endpoint 元数据和公钥匹配；补充断网、版本回退和签名不匹配的失败行为说明。

- [ ] **Step 5: 单独评估 Windows 代码签名**

如果有 Authenticode 证书，再配置 NSIS 签名和证书 secret；没有证书时明确记录 SmartScreen 警告风险，但不阻塞 updater 通道开发。

- [ ] **Step 6: 发布前检查密钥泄漏和构建结果**

Run: `rg -n -i "BEGIN (RSA |OPENSSH )?PRIVATE KEY|TAURI_SIGNING_PRIVATE_KEY=.{20,}|\.pfx|\.p12" src-tauri docs .github; npm.cmd test; cargo test --manifest-path src-tauri/Cargo.toml`

Expected: 仓库只含公钥、变量名和操作说明，不含私钥或代码签名证书。

---

## 验收顺序

1. Task 1 先确认 Git 身份和托管平台，再决定是否初始化、首 commit 和 CI 文件。
2. Task 2 清理乱码和语音残留；首 commit 必须明确记录这些已知问题，不能假装是干净基线。
3. Task 3 处理 Service Worker 清单和自动版本 hash。
4. Task 4 先用 Rust 单测修复防抖、DPI 和关闭刷新，再处理 CSP。
5. Task 5 必须做真实 Tauri dev IPC 验证，不能只看字符串配置。
6. Task 6 涉及 IndexedDB v3 和惰性迁移，单独验收，不与清理任务混合上线。
7. Task 7 先建立 updater 通道，再分别处理 updater 签名和 Windows 代码签名。

统一回归命令：`npm.cmd test`、`cargo test --manifest-path src-tauri/Cargo.toml`；涉及桌面行为时追加 `npm.cmd run tauri:dev`，涉及发布时追加 `npm.cmd run tauri:build`。
