# 安全与运行时约束

本文面向维护者和代码审查者，描述当前 Tauri 桌面壳的运行时边界、文件访问规则和已知限制。它不是隐私政策，也不是用户操作手册。

## 1. 威胁模型与非目标

当前应用仅将本地 HTTP 服务绑定到 `127.0.0.1:2333`，不监听局域网地址。loopback 限制了网络暴露范围，但不提供应用级认证：同机其他进程仍可能连接该端口。因此，静态资源可信性、固定端口启动失败策略和 Tauri command 参数校验必须同时成立。

当前实现不提供以下保证：

- OS 级 sandbox、跨用户隔离或多用户权限模型；
- IndexedDB、native app-data、迁移 JSON 或调试日志的默认加密；
- 完整的文件系统竞态（TOCTOU）消除；
- 完整的 UI/e2e 测试或安全审计。

不要将 `folderId`、loopback 或 CSP 描述为上述能力的替代品。

## 2. 运行时拓扑

### 开发模式

`npm run tauri:dev` 通过 `src-tauri/tauri.conf.json` 的 `beforeDevCommand` 启动 `scripts/serve.cjs`，从 `app_unpacked/src/` 提供资源：

```text
tauri dev
  └─ scripts/serve.cjs
       └─ http://127.0.0.1:2333
            └─ app_unpacked/src/
```

### 发布模式

Tauri setup 解析 bundled `treader-frontend/`，由 `src-tauri/src/shell.rs` 启动 Rust 静态服务：

```text
Tauri setup
  └─ src-tauri/src/shell.rs
       └─ http://127.0.0.1:2333
            └─ bundled treader-frontend/
```

两个服务都使用固定 origin。端口被占用或静态根不可用时应启动失败，不能自动切换端口或连接未知服务。修改 host/port 必须同时检查 `tauri.conf.json`、`main.rs`、`shell.rs`、`scripts/serve.cjs` 和存储迁移策略。

## 3. 静态服务边界

两个静态服务均只允许 `GET` 和 `HEAD`，并设置 `Cache-Control: no-cache, no-store, must-revalidate`、`X-Content-Type-Options: nosniff` 和 CSP。

请求目标必须通过路径组件检查、canonical/real path 检查并位于静态资源根目录内；已识别的父目录、绝对路径、Windows prefix、根目录外目标和符号链接路径会被拒绝。目录请求的 `index.html` 也必须经过边界检查。

CSP 的公共维护位置是 `config/csp-dev.txt` 和 `config/csp-prod.txt`；
`tauri.conf.json` 保留 Tauri 所需的生产字符串副本，并由测试防止漂移。

历史上 CSP 维护位置有三处：

- `src-tauri/tauri.conf.json`；
- `src-tauri/src/shell.rs`；
- `scripts/serve.cjs`。

发布 CSP 的 `connect-src` 额外允许 `http://ipc.localhost` 以兼容 Tauri IPC；开发 Node 服务只允许自身连接。修改任一处时必须检查另外两处以及动态脚本、Worker、字体、图片和 Blob/data URL 的实际依赖。

当前仍启用 `withGlobalTauri` 以兼容既有 renderer runtime。单实例插件在第二实例启动时转发参数事件并聚焦已有主窗口；固定端口仍是额外保护。窗口配置保存逻辑尺寸，resize 写入使用约 250ms 防抖，关闭事件会取消挂起任务并立即落盘。

## 4. 导入目录与 native command

Tauri 端通过 `import-folders.json` 保存随机 opaque `folderId` 到 canonical 目录的映射，并保存当前选中的 ID。picker 是建立或更新该 registry 的入口；renderer 只持有 ID 和显示名称，不应以任意 raw path 重新授权。

native list/read/write/delete 的共同规则：

- ID 必须存在于 native registry；目录必须仍存在、仍是目录，canonical path 必须与注册值一致；
- 文件名经过 Windows 非法字符和控制字符清洗；
- 目标必须位于授权根目录内；已识别的符号链接目标会被拒绝；
- 只扫描 `.txt`、`.gz`、`.epub`；单个读写文件上限为 `128 MiB`；
- 目录失效、权限不足、链接或越界路径会返回失败，前端应提示重新选择或重试。

`save_config_file` 是另一条用户主动选择系统保存路径的 command，不使用导入目录 registry，不能把所有 native 写入都描述成受同一授权根限制。

浏览器 fallback 使用 File System Access API 的用户授权 handle；不能把“前端不接受 raw path”误写成“前端完全没有文件 API”。

## 5. 数据与隐私边界

- IndexedDB `reader`：书籍正文、EPUB 资源、索引、书签、配置和原始来源；
- native `app-config.json`：窗口大小和最大化状态；
- native `import-folders.json`：当前设备的目录 registry；
- 迁移 JSON：根据导出选项可能包含配置、正文和 Base64 原文件；
- 调试日志：可能包含错误或诊断上下文。

这些数据默认不加密。`folderId` 只对当前设备的 native registry 有效，不是可跨设备迁移的文件系统权限。`sourceFolderPath` 如仍存在，只能作为历史来源元数据或匹配线索，不能直接成为 native 授权依据。

## 6. 常见失败与排查

- **端口占用**：关闭占用 `2333` 的进程后重试，不改成动态端口规避 origin 问题。
- **静态资源缺失**：检查 `app_unpacked/src/` 或 bundled `treader-frontend/` 是否完整。
- **目录失效**：重新通过 picker 选择目录；不要手工编辑 ID 或路径来恢复授权。
- **文件过大/链接/越界**：符合拒绝规则，检查文件类型、大小和目录位置。
- **IndexedDB 打开失败或升级阻塞**：关闭其他 tReader 窗口并重试；不要把默认配置回退误认为数据已持久化。
- **迁移冲突或版本不匹配**：检查 `docs/migration.md` 中的格式和冲突规则。

## 7. 维护不变量

修改下列任何内容时，必须同步更新文档和回归测试：host/port、CSP、静态路径校验、Tauri command 参数、folder registry 格式、IndexedDB store/版本、migration format/version、本地状态迁移规则、文件大小限制或 Worker 协议。
