# 迁移数据导出选项 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除配置导入导出入口，并为迁移数据导出增加正文和原文件选项。

**Architecture:** 设置页通过原生 `dialog` 收集两个导出选项，数据层继续使用现有 `treader-migration v2` 格式。新增一个无副作用的迁移条目构造函数，统一控制可选正文和原文件字段，便于在没有 IndexedDB 的情况下测试字段行为。

**Tech Stack:** 原生 JavaScript ES modules、HTML dialog、Node.js `node:test`、Tauri 现有前端。

## Global Constraints

- 不读取或输出任何书籍名称。
- 不删除内部旧配置兼容函数。
- 不改变现有迁移导入、书架顺序和阅读界面行为。
- 不执行打包命令。

---

### Task 1: 固定可选迁移字段行为

**Files:**
- Create: `app_unpacked/src/js/data/migration-export.js`
- Create: `scripts/test-migration-export-options.mjs`
- Modify: `app_unpacked/src/js/data/file.js:228-260`

**Interfaces:**
- `createMigrationEntry(baseEntry, content, source, options)` 返回迁移条目；`options.includeContent` 和 `options.includeSource` 分别控制 `content` 与 `source` 字段。

- [ ] **Step 1: Write the failing test**

  在测试中构造不含书籍名称的基础条目、正文和伪原文件，断言四种选项组合分别产生无字段、只有正文、只有原文件、两个字段。

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test scripts/test-migration-export-options.mjs`
  Expected: FAIL because `migration-export.js` 不存在。

- [ ] **Step 3: Write minimal implementation**

  新增纯函数，只在对应选项为 `true` 且数据存在时写入字段；`file.exportMigration()` 调用该函数，继续使用已有 `serializeSource()`。

- [ ] **Step 4: Run test to verify it passes**

  Run: `node --test scripts/test-migration-export-options.mjs`
  Expected: PASS，四个测试全部通过。

### Task 2: 更新设置页导出入口

**Files:**
- Modify: `app_unpacked/src/js/data/options.js:565-735`

**Interfaces:**
- 设置页只保留迁移数据按钮。
- 导出对话框返回 `{ includeContent, includeSource }` 或 `null`。

- [ ] **Step 1: Add native export option dialog**

  使用原生 `dialog`、两个 checkbox 和取消/导出按钮；不支持 `showModal()` 时安全回退为取消，避免静默导出大文件。

- [ ] **Step 2: Pass options to migration export**

  将对话框结果传给 `file.exportMigration(await file.exportSettings(), options)`。

- [ ] **Step 3: Remove configuration buttons**

  删除设置页配置导出和配置导入按钮，但保留 `file.js` 中的内部兼容函数。

### Task 3: 完善技术文档并验证

**Files:**
- Modify: `PROJECT-TECHNICAL-DOC.md`

- [ ] **Step 1: Document new entry points and options**

  更新目标、功能范围、格式说明、兼容规则和验证清单，明确正文/原文件的区别、体积取舍和 EPUB 建议。

- [ ] **Step 2: Run source checks**

  Run: `node --check app_unpacked/src/js/data/file.js; node --check app_unpacked/src/js/data/options.js; node --check app_unpacked/src/js/data/migration-export.js; node --test scripts/test-migration-export-options.mjs; cargo test --manifest-path src-tauri/Cargo.toml`
  Expected: JavaScript 检查通过，Node 测试通过，Rust 测试通过；不运行 `tauri:build`。
