# 项目目录与文档整理实施记录

**目标：** 将活跃源码、当前文档、历史资料和构建运行产物分层，减少根目录噪音。

## 已完成

- [x] 新增根目录 `README.md`、`CHANGELOG.md`、`CONTRIBUTING.md`、`LICENSE`、`NOTICE` 与 `.gitignore`。
- [x] 将原技术文档和更新日志迁入 `docs/archive/`，并按架构、存储、迁移、测试、发布拆分当前维护文档。
- [x] 将历史设计稿和计划从 `docs/superpowers/` 移至 `docs/archive/`。
- [x] 将 `legacy-electron-archive/` 迁为 `legacy/electron/`，保留其内部相对目录。
- [x] 将 Electron、Chromium 许可证移至 `licenses/`，并补充项目 MPL-2.0 文本与第三方 NOTICE。
- [x] 将 Windows 运行包、解包参考和诊断文件迁入 `artifacts/`，不删除任何内容。

## 保留项

`find-skills/`、`npx` 和未归类的截图未移动，因为无法可靠判断它们是否为用户独立资产。它们不影响构建，但如需进一步清理，应先确认用途。
