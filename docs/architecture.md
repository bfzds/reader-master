# 架构说明

## 范围与源码真相

tReader 当前由 **Tauri 桌面壳** 与原生 ES Module 前端组成；不使用 React、Vue 或打包式前端框架。`legacy/electron/` 仅是历史参考，不参与当前构建；`app_unpacked/electron/` 不是活跃源码路径。

- 活跃前端：`app_unpacked/src/`
- 活跃 native 壳：`src-tauri/src/`
- 开发/测试脚本：`scripts/`
- 发布配置：`src-tauri/tauri.conf.json`
- 生成或参考内容：`artifacts/`、`node_modules/`、`src-tauri/target/`

## 运行时拓扑

```text
app_unpacked/src/index.html
        │
     js/main.js
        │
ListPage / ReadPage / ConfigPage
        │
 data/file.js + data/config.js
        │
      data/storage.js
        │
 IndexedDB: reader (v2)

platform/runtime.js + platform/import-folder.js
        │
   Tauri native commands
        │
main.rs / shell.rs / native app-data
```

前端资源始终从 `http://127.0.0.1:2333` 加载。开发时由 `scripts/serve.cjs` 提供 `app_unpacked/src/`；发布时由 `src-tauri/src/shell.rs` 提供 bundled `treader-frontend/`。固定 origin 是 IndexedDB/localStorage 数据身份的一部分：改为其他 host 或 port 会看到另一份本地存储，而不会自动迁移书架。

详细的启动、安全头、静态路径和端口约束见 [安全与运行时约束](security-and-runtime.md)。

## 前端层次

| 路径 | 职责 |
| --- | --- |
| `js/main.js` | 初始化 i18n、调试能力和顶层路由。 |
| `js/page/router.js` | Hash 路由、上次访问路径与页面生命周期串行化。 |
| `js/page/list/` | 书架、导入、文件夹刷新、删除和批量操作。 |
| `js/page/read/` | 阅读会话、翻页/滚动、目录、搜索、书签、编辑和 EPUB 资源生命周期。 |
| `js/page/config/` | 设置页及异步配置编辑。 |
| `js/data/storage.js` | IndexedDB 打开和事务边界。 |
| `js/data/config.js` | 配置默认值、写入顺序和监听器。 |
| `js/data/file.js` | 书籍领域对象、原文件、备份和迁移。 |
| `js/text/`、`worker/` | TXT/GZ/EPUB 解析、编码转换、目录生成与 Worker 协议。 |
| `js/platform/` | renderer 对 Tauri 与浏览器文件系统能力的抽象。 |

Worker、空正文、空目录和失效字体配置都是有效的运行时输入，调用方必须处理失败、超时和空值，不能将其直接当作存储损坏。

## EPUB 阅读管线

EPUB 不采用独立的原生排版阅读模式。`readEpub()` 解析 ZIP/OPF，按 spine 顺序把 XHTML 转为纯文本；EPUB 3 优先使用 `nav`，缺失或无有效条目时回退 EPUB 2 NCX，并排除导航页。图片以 `￼imgN￼` 占位符关联 ZIP 路径与 MIME，阅读时按需生成 Blob URL。

导入后的 EPUB 与 TXT/GZ 共用 flip/scroll 文本阅读器，只由 `view_mode` 选择视图。仓库未集成 `epub.js`；与原 XHTML/CSS rendition 和 CFI 定位方案相比，当前实现优先统一文本编辑、搜索、目录、书签与分页模型，因此不是原始 EPUB 布局保真实现。详见 [EPUB 处理与限制](epub.md)。

## Native 边界

页面代码应只调用 `js/platform/` 抽象，不能在业务页散落 Tauri 判断或 native 路径字符串。新增 native 能力的改动顺序：

1. 在 `src-tauri/src/main.rs` 实现并校验 command；
2. 在 `js/platform/` 提供最小 renderer API；
3. 让页面调用该 API；
4. 更新运行时、安全、测试和发布文档。

导入目录使用 native folder registry 中的 opaque `folderId`，不是 renderer 提供的路径。`sourceFolderId` 可关联书籍的外部原文件；缺少可信 ID 时，删除书籍不得回退删除当前目录的同名文件。

## 持久化与更新路径

`storage.files.updateBook()` 将正文、元数据、目录/书签和可选原文件放在一个 IndexedDB transaction 中更新。编辑保存和迁移路径应优先复用它，避免跨 store 的半完成状态。

窗口状态和目录 registry 位于 native app-data，与 IndexedDB 分离。完整模型见 [存储与持久化](storage-and-persistence.md)；迁移语义见 [迁移数据](migration.md)。

## 修改检查清单

- 修改 DOM/template：同时检查 `index.html`、对应页面和组件选择器。
- 修改 host、port、CSP、静态服务或 Tauri command：同时检查开发 Node 服务、发布 Rust 服务、`tauri.conf.json` 与安全回归。
- 修改 IndexedDB store、版本、书籍元数据或 migration payload：同时检查 storage/file、迁移格式、兼容路径与测试。
- 修改导入文件夹：同时检查 native registry、`platform/import-folder.js`、书架来源追踪和浏览器 File System Access fallback。