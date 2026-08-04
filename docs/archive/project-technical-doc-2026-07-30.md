# tReader 技术文档

> 面向后续开发者与 AI。先读本文件，再定位源码。只记录项目相关内容。

## 1. 项目目标

tReader 是桌面阅读器，支持 TXT、GZ、EPUB 导入、目录/书签/进度保存、阅读模式切换和迁移数据导入导出。

核心迁移需求：

- 旧环境导出应用配置、书籍元数据、正文、目录、书签、阅读进度和书架顺序。
- 新环境已有相同书籍文件，但没有旧环境阅读数据。
- 导入后按书籍身份匹配新环境书籍，恢复旧环境阅读数据。
- 不能只生成“书架记录/文件位置”占位项。

当前入口：设置页只提供“导出迁移数据”和“导入迁移数据”。旧配置格式的读写函数仍保留在数据层，用于兼容历史文件，不再作为设置页入口。

## 2. 当前实现范围

已存在功能：

- 单本导入：TXT/GZ/EPUB 解析、文本预处理、正文保存、原始文件保存。
- 书架：搜索、排序、刷新导入文件夹、批量删除。
- 阅读：翻页/滚动、目录、书签、搜索、跳转、编辑、语音、EPUB 图片资源。
- 配置：主题、字体、排版、预处理、自动目录、导入文件夹、专家配置。
- 调试控制台：实时查看 `log`、`info`、`debug`、`warn`、`error` 日志，支持清空和暂停自动滚动。
- 迁移数据导出/导入：应用配置、书架元数据、目录、书签、进度、书架顺序，并可选导出正文和原文件。
- 完整备份/恢复：正文、索引、元数据、原始文件。
- 桌面壳：仅保留 Tauri，共用同一套前端。Electron 代码目录暂作为历史兼容资料保留，不再参与构建。
- 窗口状态：尺寸、最小尺寸、最大化状态持久化。

## 3. 技术路线

### 3.1 前端

- 原生 ES Module。
- 无 React/Vue；模块直接绑定 `index.html` DOM。
- Hash 路由：`#!/`、`#!/read/<id>`、`#!/config`。
- 数据访问集中在 `data/file.js`，页面不直接操作 IndexedDB。

### 3.2 本地存储

使用 IndexedDB：

- 数据库：`reader`
- 版本：`2`
- Store：`list`、`content`、`index`、`config`、`source`

数据关系：

```text
list(id)    书籍元数据、cursor、title、sourceName、sourceFolderPath
content(id) 正文：string 或 { text, resources }
index(id)   目录、书签
source(id)  原始 File/Blob
config(key) 应用配置
```

### 3.3 桌面壳

当前只使用 Tauri：

- 开发环境由 `scripts/serve.cjs` 提供 `127.0.0.1:2333` 静态服务。
- 发布环境由 `src-tauri/src/shell.rs` 提供静态服务。
- 固定 Origin，避免 IndexedDB 因端口变化而“丢书架”。
- 前端通过 `platform/` 抽象层访问窗口和文件夹能力，不在页面中区分桌面壳。

## 4. 架构图
```text
Tauri shell
src-tauri/src/main.rs
        │
        └────────── 本地 HTTP :2333 ──────────┘
                           │
                 app_unpacked/src/index.html
                           │
                    js/main.js
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
    ListPage            ReadPage           ConfigPage
       │                   │                   │
       └────────────── data/file.js ──────────┘
                           │
                    data/storage.js
                           │
                       IndexedDB
```

## 5. 关键目录与文件

| 位置 | 责任 |
|---|---|
| `app_unpacked/src/index.html` | DOM 骨架、模板、页面容器 |
| `app_unpacked/src/js/main.js` | 前端启动、路由注册 |
| `app_unpacked/src/js/page/router.js` | Hash 路由、页面生命周期、最后路径保存 |
| `app_unpacked/src/js/page/list/listpage.js` | 书架、导入、刷新文件夹、备份恢复 |
| `app_unpacked/src/js/page/read/readpage.js` | 阅读会话、正文加载、进度保存、编辑保存 |
| `app_unpacked/src/js/page/config/configpage.js` | 配置页面 |
| `app_unpacked/src/js/data/file.js` | 书籍领域数据访问、备份格式、匹配/恢复 |
| `app_unpacked/src/js/data/storage.js` | IndexedDB schema 与 CRUD |
| `app_unpacked/src/js/data/config.js` | 配置 facade、监听器、专家配置 |
| `app_unpacked/src/js/data/settings-migration.js` | 判断设置是否允许跨环境迁移 |
| `app_unpacked/src/js/data/options.js` | 配置项定义、迁移数据导入导出入口 |
| `app_unpacked/src/js/ui/util/debug-logger.js` | 调试开关、控制台拦截、实时日志面板 |
| `app_unpacked/src/js/ui/util/debug-logger-core.js` | 日志参数格式化、日志数量上限 |
| `app_unpacked/src/css/common/debug-logger.css` | 调试日志面板样式 |
| `app_unpacked/src/js/text/text.js` | TXT/GZ/EPUB 读取、编码、预处理、目录生成 |
| `app_unpacked/src/js/text/epub.js` | EPUB 解包、资源读取、EPUB 导出 |
| `app_unpacked/src/js/platform/runtime.js` | 运行时识别 |
| `app_unpacked/src/js/platform/window.js` | 窗口能力抽象 |
| `app_unpacked/src/js/platform/import-folder.js` | 导入文件夹能力抽象 |
| `src-tauri/src/main.rs` | Tauri 命令、文件对话框、窗口状态、权限校验 |
| `src-tauri/src/shell.rs` | Tauri 静态 HTTP 服务 |

## 6. 书籍导入数据流

```text
File
  │
  ├─ text.readBook()
  │    ├─ TXT：编码解码、换行/空行/中文预处理
  │    ├─ GZ：pako 解压后按编码解码
  │    └─ EPUB：解包正文与资源
  │
  ├─ file.add()
  │    └─ 写入 list/content/index/source
  │
  ├─ file.setIndex() 或 text.guessContent()
  │    └─ 保存 EPUB/显式目录，或 Worker 自动生成目录
  │
  └─ file.restorePlaceholder()
       └─ 用真实导入书籍替换同 sourceName 的占位记录
```

书籍身份当前主要使用：

1. `sourceName`
2. 唯一 `title`
3. 无可靠匹配时创建 `configOnly` 占位记录

## 7. 当前导出/导入格式

### 7.1 旧配置格式兼容：`treader-config` v1

数据层入口：`data/file.js`。设置页不再显示该格式的导入或导出按钮。

```json
{
  "format": "treader-config",
  "version": 1,
  "exportedAt": "ISO-8601",
  "config": {},
  "books": [
    {
      "order": 0,
      "title": "书名",
      "sourceName": "book.txt",
      "sourceFolderPath": "...",
      "createTime": "...",
      "lastAccessTime": "...",
      "cursor": 0,
      "length": 100,
      "configOnly": false,
      "index": {
        "content": { "template": "", "items": [] },
        "bookmarks": []
      }
    }
  ]
}
```

不包含：

- `content` 正文。
- `source` 原始文件。

导入行为：

- 按 `sourceName` 匹配。
- 无 `sourceName` 时，只有唯一同名书才匹配。
- 匹配成功：恢复 `cursor`、时间、目录、书签。
- 导出配置额外保存书架中的 `order`；导入时优先按 `order` 恢复“最近阅读”顺序，兼容没有 `order` 的旧 v1 文件。匹配失败创建的占位记录也保存 `importOrder`，真实书籍替换占位记录时继续传递该顺序。导入时间使用固定基准并按秒间隔生成，避免导入耗时破坏旧排序逻辑。
- 匹配失败：创建 `configOnly=true` 占位记录。
- 占位记录不能阅读，需重新导入原文件；真实书导入时由 `restorePlaceholder()` 合并。

### 7.2 完整备份：旧数组格式

入口：书架备份/恢复。

每本书包含：

- `meta`
- `content`
- `index`
- 序列化后的 `source`

`file.importBackup()` 当前遇到相同 `sourceName` 或 `title` 会跳过，不会把备份中的阅读数据写入新环境已有书籍。

## 8. 用户需求对应问题与解决方案

### 历史问题根因

当前有两种语义混在一起：

- “配置导入”恢复配置和阅读元数据，不带正文。
- “完整恢复”恢复完整书籍，但把已有书籍视为重复并跳过。

所以旧配置导入在新环境虽有书籍本体时，不能把旧 `cursor/index/bookmarks` 合并到本体；现在由迁移 v2 的合并导入流程处理。

### 8.1 迁移/合并导入导出：`treader-migration` v2

已新增独立的 `treader-migration v2` 流程，不复用完整备份的“重复即跳过”逻辑：

```text
file.exportMigration()
file.importMigration(backup, options)
file.matchBook(importedBook, currentBooks)
file.mergeBookState(target, importedBook)
```

设置页的导出按钮会先询问两个独立选项：

- `导出正文`：保存应用已解析的正文；导入时会在新环境默认导入文件夹生成 UTF-8 `.txt` 副本，并同时保存到 IndexedDB。
- `导出原文件`：保存原始文件的完整字节，适合保留 EPUB 的原始排版、图片、样式和其他资源。

两个选项默认不勾选。取消对话框不会生成迁移文件。正文和原文件同时导出时会重复保存内容，迁移 JSON 体积会明显增加；只需要跨环境阅读时建议只导出正文，需要保留 EPUB 原始资源时才导出原文件。

迁移包示例：

```json
{
  "format": "treader-migration",
  "version": 2,
  "config": {},
  "books": [
    {
      "order": 0,
      "identity": {
        "sourceName": "book.txt",
        "sourceFolderPath": "旧环境书籍目录",
        "title": "书名",
        "contentLength": 100,
        "contentHash": "SHA-256",
        "sourceHash": "可选 SHA-256"
      },
      "meta": {
        "cursor": 0,
        "createTime": "ISO-8601",
        "lastAccessTime": "ISO-8601",
        "migrationOrder": 0
      },
      "index": { "content": {}, "bookmarks": [] },
      "content": "可选，默认不导出",
      "source": "可选序列化原文件"
    }
  ]
}
```

其中 `sourceFolderPath` 只作为迁移时的来源提示，不直接恢复为新环境的授权路径；`source` 若存在，使用 `{name,type,lastModified,base64}` 序列化，导入仍兼容旧的 `bytes` 数组。`content` 和 `source` 是否写入由导出选项决定。只有正文没有原文件时，导入会根据 `sourceName` 生成 `.txt` 文件名；`.epub` 和 `.gz` 后缀会改为 `.txt`，避免生成格式错误的伪原文件。

Tauri 保存迁移文件时直接传递 JSON 字符串，不再把完整 JSON 转成 JavaScript 字节数组，避免大迁移包触发 `Invalid array length`。

### 8.2 迁移匹配与合并规则

1. 优先使用保存路径中的 `sourceFolderPath` 和 `sourceName` 读取旧环境原文件。
2. 读取成功后通过 `text.readBook()` 解析 TXT/GZ/EPUB，并重新计算正文长度和 SHA-256。
3. 之后按原始 source 哈希、正文哈希+长度、来源文件名、书名逐级匹配。
4. 多候选、哈希不兼容或同一目标被多条记录匹配时，不自动合并，写入冲突报告。
5. 找到新环境书籍本体后保留新环境 ID 和正文，只恢复旧 `cursor`、目录、书签及时间。
6. 目标正文为空或为 `configOnly` 占位时，可按迁移选项补全正文/source；默认不覆盖已有正文。
7. 完全找不到本体时，迁移包有正文则创建完整书籍，否则创建 `configOnly` 占位。
8. 进度、目录项游标和书签游标会按目标正文长度进行边界限制。

### 8.3 进度与书架顺序

- `file.importMigration()` 支持 `onProgress` 回调，每处理一条记录报告 `{current,total,title,phase}`。
- `file.exportMigration()` 同样支持 `onProgress` 回调；进度遮罩节点位于页面根部，因此设置页和书架页都可见。设置页在逐本导出、整理 JSON 和保存文件期间显示遮罩，导出完成或异常后隐藏。
- 设置页导入使用已有 `#import_tip` 遮罩，显示“正在迁移 x/y：书名”，完成或异常后隐藏。
- 导出时记录每本书的 `order`；导入时保存 `migrationOrder`，并通过固定基准时间调整 `lastAccessTime` 让默认“最近阅读”排序保持旧环境顺序。
- 原始迁移时间保存在 `migrationLastAccessTime`，不因顺序恢复而丢失。

### 8.4 导入报告

导入完成返回并显示：

- 匹配/恢复数量；
- 路径找到、路径不存在、路径读取失败数量；
- 新增完整书籍和占位数量；
- 冲突和失败数量。
- 多候选匹配时通过迁移对话框逐本选择目标；取消选择则保留冲突，不自动合并。

### 8.5 兼容规则

- 保留 `Array.isArray()` 旧完整备份导入。
- 保留 `treader-config` v1 导入及其占位记录语义，但不再提供新的设置页入口。
- 新增格式独立识别，不破坏旧文件。
- 不迁移文件夹句柄、环境授权或旧绝对路径权限。

## 9. 已遇到问题与处理

### Origin 变化导致数据看似丢失

IndexedDB 按 Origin 隔离。Tauri 开发与发布环境都固定使用 `127.0.0.1:2333`，避免端口变化造成新数据库。

### 文件夹访问权限

- Tauri：`ImportFolderState` 保存授权路径，命令执行前 canonicalize 并校验路径。
- Renderer 不直接访问任意本地路径。
- 读取和删除文件会再次 canonicalize 并校验目标仍在授权目录内；写入时拒绝符号链接目标。
- 删除书籍来源文件优先使用该书保存的 `sourceFolderPath`；文件已经不存在时按幂等成功处理，再删除书架记录。

### 导入配置后最近阅读排序异常

书架排序必须先把 `Date` 或 ISO 字符串统一转换为时间戳；直接对 ISO 字符串做减法会得到 `NaN`，导致浏览器保留数据库原始顺序。迁移导入后优先使用 `migrationOrder/importOrder`，书籍再次打开时由 `file.setMeta()` 清除该临时顺序并恢复按实际阅读时间排序。

### 迁移后来源路径丢失

迁移导入必须把 `meta.sourceFolderPath` 写回匹配到的书籍和新建书籍。否则下一次导出虽然仍有 `contentHash`，但没有正文、原始文件和可用路径，只能在新环境生成占位记录。

### 窗口状态丢失

窗口尺寸与最大化状态保存到桌面壳的 `app-config.json`，不放入 IndexedDB。

### 占位书与真实书重复

`file.restorePlaceholder()` 按 `sourceName`，无来源名时按标题，将占位记录中的进度、时间、索引迁移到真实书，再删除占位记录。

### 重复书籍误判

当前按标题匹配可能误判同名书。迁移功能应增加内容哈希或文件指纹，并对多候选要求用户确认。

### 导入大备份阻塞 UI

迁移导入通过 `onProgress` 更新 `#import_tip`，每处理 10 项让出一次事件循环；迁移导出在开始时报告 `0/总数`，之后每处理 10 项让出一次事件循环，避免大量文件导出时界面长时间无响应，同时不为每条记录增加定时器开销。旧数组备份仍使用原有批处理逻辑。

### 实时调试控制台

高级设置中的“显示调试控制台”开关控制悬浮日志面板。面板拦截五类原生控制台调用，但继续调用原始 `console` 方法，因此不会改变开发者工具中的日志行为。日志显示时间、级别和格式化参数，最多保留最近 500 条；“清空”删除当前面板日志，“暂停滚动”只停止自动滚动，不停止日志采集。拖动标题栏可以移动面板，位置会限制在窗口范围内。关闭开关会移除面板并清空当前会话日志。

`debug.show_console` 是本机调试状态，不属于迁移设置：`file.exportSettings()` 不导出它，`file.importSettings()` 也不会用迁移文件覆盖它。这样在新环境导入迁移数据时，调试控制台是否显示仍由新环境自己的设置决定。

## 10. AI 快速上手

### 修改前必读

1. `CLAUDE.md`
2. `app_unpacked/src/js/data/file.js`
3. `app_unpacked/src/js/data/storage.js`
4. 对应页面文件
5. `app_unpacked/src/index.html`（若改 DOM）

### 修改原则

- 以前端源码 `app_unpacked/src/` 为准。
- Tauri 源码 `src-tauri/src/` 为准。
- Electron 历史目录不参与构建；桌面能力以 `src-tauri/src/` 和 `app_unpacked/src/js/platform/` 为准。
- 不修改 `asar_extracted/`、打包产物、提交的 `node_modules`，除非任务明确要求。
- 保留 JS/HTML 顶部 MPL license header。
- 保持原生 ES Module、直接 DOM 操作、局部修改风格。
- 数据库 schema、Origin、storage key 修改前先检查兼容性。
- 不把桌面壳分支散落到业务页面；使用 `platform/` 抽象层。

### 常用命令

```bash
npm install
npm --prefix app_unpacked install
npm run tauri:dev
npm run tauri:build
cargo test --manifest-path src-tauri/Cargo.toml
```

仓库没有 npm test/lint script。Node 测试使用串行命令 `node --test --test-concurrency=1 scripts/test-*.mjs`；前端仍需通过 `npm run tauri:dev` 手动验证，Rust 使用 Cargo test。

### 迁移功能验证清单

- 新环境已有 TXT/GZ/EPUB 本体，导入后书籍 ID 可变化但阅读位置不变。
- 目录、书签、编辑后的正文状态正确。
- 导入过程中实时显示 `x/y` 和当前书名，完成/失败后遮罩隐藏。
- 导出并恢复 `order` 后，默认“最近阅读”排序与旧环境一致。
- 优先从 `sourceFolderPath/sourceName` 读取文件；路径无效时安全回退并报告。
- 同名不同书不会自动误合并。
- 缺本体时生成可识别占位记录。
- 缺正文时可按选项补全。
- 重复导入不会覆盖本地正文，除非用户明确选择覆盖。
- 迁移导出对正文、原文件未选中、只选正文、只选原文件、同时选中四种情况的字段行为正确。
- 调试开关打开后，五类控制台日志实时显示；对象、错误和循环对象不会导致面板报错。
- 调试面板达到 500 条后只保留最新日志；清空和暂停滚动不影响原生控制台输出。
- 调试面板可拖动且不会移出窗口；迁移导入导出不会改变 `debug.show_console`。
- 旧 `treader-config` v1 与旧数组备份仍可通过兼容代码导入。
- Tauri 开发环境与发布环境行为一致。

## 11. 迁移文件落盘说明

迁移导出中的“导出正文”和“导出原文件”是两个独立选项：

- 只导出正文时，目标环境会把已解析正文保存到 IndexedDB，并在默认导入文件夹生成对应的 UTF-8 `.txt` 副本；书籍可以直接阅读，但不会保留 EPUB 的原始排版、图片和资源。
- 导出原文件时，迁移包才包含原始文件字节。导入时会优先尝试读取 `sourceFolderPath` 指向的旧路径；旧路径不可用时，再尝试将原文件保存到当前环境已配置的默认导入文件夹，并同时保存一份 IndexedDB 副本。
- TXT/GZ 导入也会保存原文件对象；旧版本已经存在的记录如果没有原文件副本，导出原文件时会按记录中的 `sourceFolderPath/sourceName` 补读一次。
- 默认导入文件夹、授权状态和旧环境绝对路径不参与配置迁移。新环境需要先在设置页重新选择默认导入文件夹；未选择文件夹或没有写入权限时，原文件只能保存在 IndexedDB，导入报告会显示保存失败数量。
- 因此，导入前必须设置当前环境的默认导入文件夹。想保留 EPUB 原始排版、图片和资源时，还要在导出时勾选“导出原文件”；只导出正文会生成可阅读的 `.txt` 副本。

## 12. 当前状态摘要

```text
已完成：桌面阅读器主体、书架、阅读、配置、Tauri 壳、IndexedDB、基础备份。
已完成：treader-migration v2、正文/来源指纹匹配、保存路径优先查找、阅读数据合并、导入进度显示、书架顺序恢复。
已完成：实时调试控制台、五级日志显示、清空/暂停滚动和 500 条日志上限。
已保留：treader-config v1 与旧数组完整备份兼容代码；设置页只保留迁移数据入口。
已完成：Tauri-only 壳层切换、文件访问边界加固、Electron 历史目录归档和冲突条目交互选择。
待验证：浏览器 IndexedDB 自动化测试和本轮人工回归。
```

## 13. 本轮对话总结（2026-07-30）

### 13.1 结论

- 设置页只保留迁移数据导入导出；旧配置格式仅保留数据层兼容。
- “导出正文”和“导出原文件”分开选择，默认不勾选。
- 只跨环境阅读时导出正文；需要保留 EPUB 资源时再导出原文件。
- 默认导入文件夹和调试控制台开关属于新环境本机设置，不参与迁移。
- 本轮不打包，人工测试使用 `npm run tauri:dev`。

### 13.2 已修复问题

- TXT/GZ/EPUB 导入保存原文件对象；缺少原文件时用正文生成 UTF-8 `.txt`。
- 原文件导入优先读取旧路径，失败后写入新环境默认文件夹，并保存 IndexedDB 副本。
- 导出保存 `order`，导入使用 `migrationOrder`，恢复默认“最近阅读”顺序。
- 原文件改用 Base64；Tauri 直接写入 JSON 字符串，避免超大数组导致 `Invalid array length`。
- 同时导出正文和原文件会重复保存内容，因此迁移文件会明显变大。
- 导出、导入每批让出事件循环，并显示进度，降低大量文件处理时的卡顿。

### 13.3 涉及文件

- `app_unpacked/src/js/page/list/listpage.js`：保留导入文件对象。
- `app_unpacked/src/js/data/migration-source.js`：正文落盘、Base64 和旧格式兼容。
- `app_unpacked/src/js/data/file.js`：迁移匹配、合并、落盘和来源路径回写。
- `app_unpacked/src/js/data/options.js`、`migration-export.js`：导出入口、进度和 JSON 保存。
- `src-tauri/src/main.rs`：接收并写入 JSON 字符串。
- `PROJECT-TECHNICAL-DOC.md`：补充迁移规则和验证说明。

### 13.4 验证命令

```powershell
node --test --test-concurrency=1 scripts/test-*.mjs
cargo test --manifest-path src-tauri/Cargo.toml
```

当前自动测试结果：Node 29 项通过，Rust 3 项通过。人工测试顺序：先设置默认导入文件夹，再测试“只导出正文”“只导出原文件”“同时导出”三种情况；最后检查顺序、进度、重复导入和调试控制台状态。

### 13.5 阅读页布局调整

- 原版阅读页在桌面端点击正文后，使用左右黑色侧栏；当前版本原先使用上下工具栏。
- 已只修改小说阅读页控制面板：窗口宽度 `>= 768px` 时，左侧显示返回、更多，右侧纵向显示目录、书签、搜索、跳转等操作；`< 768px` 时保留原有上下工具栏。
- 改动位于 `app_unpacked/src/css/page/readpage.css`，复用已有 `.read-page-wide` 侧栏样式；未修改阅读数据、书架、设置和交互逻辑。

### 13.6 本次阅读页验证

```powershell
node --test scripts\test-migration-export-options.mjs scripts\test-migration-source.mjs scripts\test-settings-migration.mjs scripts\test-debug-logger.mjs scripts\test-read-control-layout.mjs
cargo test --manifest-path src-tauri\Cargo.toml
```

- Node 测试 30 项通过，Rust 测试 3 项通过。
- 新增 `scripts/test-read-control-layout.mjs`，检查宽屏侧栏和窄屏工具栏的 CSS 回归。
- 根目录 `tReader.exe` 是已打包版本，不会自动读取 `app_unpacked/src` 的源码改动；查看效果需运行 Tauri 调试版本或重新打包。

## 14. 目录识别与目录布局（2026-07-30）

### 14.1 导入后的目录生成

TXT/GZ 导入完成后，`text.guessContent()` 会把正文交给 `worker/toc.js`。EPUB 已有导航目录时直接保存 EPUB 目录，不再重新猜测。

Worker 按以下顺序生成 TXT/GZ 目录：

1. 运行原有的评分识别器。它综合标题长度、标题重复率、编号连续性和章节正文长度选择最可信的模板。
2. 评分识别失败时，依次尝试内置的中文章节、中文卷、中文特殊章节、英文 Chapter/Part/Book/Volume 和数字标题正则。
3. 所有正则都没有至少两个不同标题时，生成自动分段目录。`FALLBACK_PARAGRAPHS` 默认是 80，`FALLBACK_MAX_CHARS` 默认是 40,000；优先在换行或句末切分，必要时在 40,000 字处切分。

自动分段从第二段开始命名为“第 2 段”“第 3 段”。目录首项仍是书名，因此短文本也会至少显示一个可跳转的目录项。自动分段不代表真实章节，用户可在目录页用模板或正则重新生成。

### 14.2 正则与目录数据的保存位置

- 内置正则：`app_unpacked/src/worker/toc.js` 的 `fallbackTemplateList`。它随应用代码发布，不写入用户设置。
- 某本书命中的正则：保存在该书的 `index.content.template`，并通过 `file.setIndex()` 写入 IndexedDB 的 `index` store。
- 用户手动输入过的正则：保存在 IndexedDB `config` store 的 `contents_history` 键中，最多保留最近的历史模板。
- 自动分段：同样保存目录项，但 `index.content.template` 为空字符串，表示目录不能由一个正则重新计算。

相关文件：

| 文件 | 职责 |
|---|---|
| `app_unpacked/src/worker/toc.js` | 自动识别、内置正则和分段兜底 |
| `app_unpacked/src/js/text/text.js` | 导入后启动目录 Worker，并写入索引 |
| `app_unpacked/src/js/page/read/index/readindex.js` | 保存目录模板和目录项 |
| `app_unpacked/src/js/page/read/index/contentspage.js` | 目录模板编辑和历史记录 |
| `app_unpacked/src/js/data/file.js` | `index` store 的领域访问接口 |
| `app_unpacked/src/js/data/storage.js` | IndexedDB `index` 与 `config` store 的底层读写 |

### 14.3 目录界面的响应式布局

参考的上游源码包为 `<USER_HOME>\Downloads\reader-master.zip`。它没有把目录做成始终并排的窗口：窄屏时目录以全屏抽屉形式显示，正文会暂时隐藏；宽度达到阈值后才改为左侧栏，并把正文整体右移。

当前项目沿用同一规则：

- `app_unpacked/src/js/page/read/readpage.js` 读取专家配置 `appearance.screen_width_side_index`，默认值为 `960`。
- 窗口内容宽度小于 `960px` 时使用覆盖式目录。这是上游既有行为，不是目录模板页单独造成的问题。
- 宽度达到阈值时添加 `read-page-wide` 和 `read-show-index`，`app_unpacked/src/css/page/readpage.css` 会为目录保留左侧宽度，并把正文层向右移动。
- 目录模板编辑页 `#read_index_contents_config` 在窄屏占满页面；在宽屏受侧栏宽度约束，因此不会遮挡正文。

如需让桌面端更早使用并排目录，可在专家配置中把 `appearance.screen_width_side_index` 调低，例如 `900`。不建议在手机或更窄的窗口强制侧栏，否则正文可用宽度会过小。

### 14.4 本轮验证

```powershell
npm run test:toc
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

- `test:toc` 覆盖两章英文标题、中文特殊章节、40,000 字强制分段和 80 段分段。
- Cargo 测试通过 3 项。
- Tauri 构建成功，并生成 `src-tauri/target/release/bundle/nsis/tReader_1.0.0_x64-setup.exe`。
