# tReader

tReader 是一个桌面阅读器，支持导入 TXT、GZ 和 EPUB，提供书架、目录、书签、搜索、阅读进度与迁移数据导入导出功能。

## 快速开始

安装根目录依赖后，可使用以下命令：

```powershell
npm install
npm run test:toc
npm run tauri:dev
npm run tauri:build
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run tauri:dev` 会启动 Tauri 开发环境，并由 `scripts/serve.cjs` 在 `127.0.0.1:2333` 提供前端静态文件；发布包由 Tauri Rust 静态服务提供同一 origin。这个固定地址不能随意修改，否则浏览器的本地书架数据会被视为另一份数据；端口被占用时应修复占用进程，不要临时改端口。

## 目录说明

| 目录或文件 | 用途 |
| --- | --- |
| `app_unpacked/src/` | 活跃前端源码（原生 ES Module） |
| `src-tauri/` | 活跃 Tauri/Rust 桌面壳 |
| `scripts/` | 本地开发和自动化测试脚本 |
| `docs/` | 当前维护文档与历史记录 |
| `legacy/electron/` | 旧 Electron 参考实现，不参与 Tauri 构建 |
| `artifacts/` | 本地构建与运行产物，不参与版本控制 |

## 文档导航

- [架构说明](docs/architecture.md)
- [EPUB 处理与限制](docs/epub.md)
- [安全与运行时约束](docs/security-and-runtime.md)
- [存储与持久化](docs/storage-and-persistence.md)
- [迁移数据格式](docs/migration.md)
- [测试说明](docs/testing.md)
- [发布说明](docs/release.md)
- [变更记录](CHANGELOG.md)

## 维护约定

- 业务代码只修改 `app_unpacked/src/` 与 `src-tauri/src/`。
- 不修改 `artifacts/`、`asar_extracted/`、`node_modules/` 等生成或参考内容，除非任务明确要求。
- 前端 JS、HTML、CSS 文件保留原有 MPL-2.0 头部。
