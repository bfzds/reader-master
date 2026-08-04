# 存储与持久化

## 1. IndexedDB

renderer 使用数据库 `reader`，当前版本为 `2`：

| Store | Key | 内容 |
| --- | --- | --- |
| `list` | `id`，自增 | 书籍元数据、阅读位置、来源名称、`sourceFolderId` 等。 |
| `content` | 书籍 id | 正文，或正文与 EPUB 资源。 |
| `index` | `id` | 目录、书签和阅读索引。 |
| `config` | 配置名 | 应用配置。 |
| `source` | 书籍 id | 原始 `File` 或 `Blob`。 |

页面不应直接操作 IndexedDB；通过 `app_unpacked/src/js/data/storage.js`、`config.js` 和 `file.js` 访问。

`storage.js` 的 transaction 只有在 `complete` 后才算成功；request 成功后若 transaction 随后 abort，调用方仍会收到失败。open error、blocked、versionchange、transaction error/abort 都必须进入可观察的失败路径。`versionchange` 和窗口卸载时会关闭数据库连接。

`storage.files.updateBook()` 用于把正文、书籍元数据、目录/书签和可选原文件放入一次 readwrite transaction。编辑保存、迁移和恢复流程应优先使用该入口，而不是对多个 store 做无关的独立写入。

## 2. 配置写入

`data/config.js` 是配置 facade：

- `get` 读取失败时可以使用调用方提供的默认值；
- 同一个配置 key 的 `set` 按调用顺序串行化；
- 只有底层存储成功后才清理 expert cache 并通知 listener；
- listener 使用快照并隔离单个 listener 的异常；
- 这不是跨 key 的全局事务。

增加配置项时，应同时补默认值、校验、迁移和失败回退。

## 3. Origin 不变量

开发和发布前端都使用 `http://127.0.0.1:2333`。浏览器按 origin 隔离 IndexedDB/localStorage，因此改为 `localhost`、其他 IP 或其他端口会表现为新的存储空间，不会自动复制旧书架。端口冲突时应修复占用进程，而不是任意改端口规避启动失败。

## 4. Native app-data

### `app-config.json`

由 Tauri 保存窗口尺寸和最大化状态。它不属于 IndexedDB，也不参与迁移文件。

### `import-folders.json`

由 Tauri 保存当前设备的 folder registry：随机 opaque `folderId` → canonical 本地目录，以及当前选中的 ID。它是本机授权状态，不是可移植用户数据；ID 不是文件系统路径，也不应手工编辑或跨设备迁移。

启动时 registry 会重新检查目录存在性、目录类型和 canonical path；失效记录会被清理，用户需重新通过系统 picker 选择目录。

## 5. 文件夹与来源文件

Tauri renderer 只传递 `folderId`、文件名和数据，不以任意 raw path 建立 native 授权。native 操作会重新从 registry 解析目录，并检查：

- 目录仍存在、是目录，并与注册 canonical path 一致；
- 文件名经过 Windows 非法字符和控制字符清洗；
- 目标在授权根目录内，已识别的符号链接目标被拒绝；
- 扫描只接受 `.txt`、`.gz`、`.epub`；
- 单个读写文件上限为 `128 MiB`。

`sourceFolderId` 只是书籍来源与当前设备 registry 的关联。历史 `sourceFolderPath` 可作为旧迁移元数据保留，但不能直接重新授权；没有可信 `sourceFolderId` 时，删除书籍不会回退删除当前导入目录中的同名文件。

非 Tauri 环境可使用浏览器 File System Access API。该分支由浏览器的用户授权 handle 约束，不能与 native folder registry 混为一谈。

迁移导出的 JSON 可能包含正文和 Base64 原文件，属于显式数据导出，不是 IndexedDB 的原子快照；详见 [迁移数据](migration.md)。