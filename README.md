# tReader

tReader 是一个面向长文本和小说阅读的本地桌面阅读器。它支持导入 TXT、GZIP 压缩文本和 EPUB 文件，并提供书架管理、目录、书签、搜索、阅读进度和内容编辑等功能。

当前桌面版本基于 [Tauri 2](https://tauri.app/) 和 Rust 构建，前端使用原生 ES Module，不依赖 React、Vue 等前端框架。当前发布目标为 Windows NSIS 安装包。

## 功能

- 导入 `.txt`、`.txt.gz` 和 `.epub` 文件，也可以从本地文件夹刷新书籍。
- 书架搜索、排序、阅读进度保存和来源文件管理。
- 翻页和滚动两种阅读模式，支持自动滚动和跳转。
- 自动识别或手动配置目录，支持目录模板和正则表达式。
- 书签、全文搜索和搜索结果定位。
- 编辑正文并保存，支持将当前内容下载为 UTF-8 文本。
- 浅色、深色和跟随系统主题，支持字体、字号、行高和段落间距调整。
- 简繁中文转换、语言设置和自定义字体。
- 导出和导入迁移数据，可选择包含正文和原始文件。

## 文件格式

| 格式 | 说明 |
| --- | --- |
| `.txt` | 纯文本文件。建议使用 UTF-8 编码保存，以避免乱码。 |
| `.txt.gz` | 使用 GZIP 压缩的纯文本文件。 |
| `.epub` | 读取 EPUB 3 `nav`，没有有效 `nav` 时回退到 EPUB 2 NCX，并将正文转换为统一的文本阅读内容。 |

### EPUB 处理方式

tReader 的 EPUB 支持以“文本化阅读”为目标，不是原版 EPUB 页面渲染器。导入时会提取正文、目录和部分普通图片资源，再使用 tReader 的翻页或滚动阅读器显示。

因此，原 EPUB 的 XHTML 层级、CSS 样式、字体、精确排版、表格布局、背景图片和复杂媒体不会完整保留。编辑 EPUB 后保存时会生成一个最小化的 EPUB 3 文件，也不会恢复原书的排版和资源结构。需要保留原文件时，请在迁移数据中选择导出原文件。

## 开发

### 环境要求

- Node.js
- Rust 工具链
- Windows 上可用的 Tauri 开发环境

安装根目录依赖：

```powershell
npm install
```

启动开发版本：

```powershell
npm run tauri:dev
```

构建 Windows 安装包：

```powershell
npm run tauri:build
```

运行测试：

```powershell
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm test` 会运行 `scripts/` 目录下已注册的 Node.js 测试脚本；也可以单独运行某个测试，例如：

```powershell
npm run test:toc
```

## 项目结构

| 路径 | 说明 |
| --- | --- |
| `app_unpacked/src/` | 前端源码、阅读器界面、文本/EPUB 解析和 Worker。 |
| `src-tauri/src/` | Tauri/Rust 桌面壳、本地文件夹访问和静态资源服务。 |
| `src-tauri/tauri.conf.json` | Tauri 应用、打包和 Windows NSIS 配置。 |
| `scripts/` | 开发服务器和自动化测试脚本。 |
| `docs/` | 架构、存储、迁移、EPUB、测试和发布文档。 |
| `legacy/electron/` | 历史 Electron 参考实现，不参与当前 Tauri 构建。 |

## 文档

- [架构说明](docs/architecture.md)
- [EPUB 处理与限制](docs/epub.md)
- [存储与持久化](docs/storage-and-persistence.md)
- [迁移数据格式](docs/migration.md)
- [安全与运行时约束](docs/security-and-runtime.md)
- [测试说明](docs/testing.md)
- [发布说明](docs/release.md)
- [变更记录](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)

## 许可证

tReader 使用 [Mozilla Public License 2.0](LICENSE) 发布。仓库中的第三方组件和许可证说明见 [NOTICE](NOTICE) 及 `licenses/` 目录。
