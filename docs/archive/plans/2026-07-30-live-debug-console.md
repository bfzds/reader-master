# 实时调试控制台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有调试开关扩展为可实时查看五类控制台日志的轻量悬浮面板。

**Architecture:** 将日志格式化、数量上限和日志存储抽到无 DOM 的核心模块，便于 Node 测试。浏览器模块负责拦截原生 `console`、创建面板、渲染日志和处理清空/暂停操作；样式使用独立 CSS，保持主题适配和页面布局不变。

**Tech Stack:** 原生 JavaScript ES modules、Node.js `node:test`、现有 CSS 变量和 Tauri WebView。

## Global Constraints

- 不读取或输出任何书籍名称。
- 不改变原生 `console` 的输出行为。
- 不新增第三方依赖，不增加网络日志上报。
- 最多保留最近 500 条日志，日志面板不阻止阅读区域操作。
- 不运行打包命令。

---

### Task 1: 建立日志核心能力

**Files:**
- Create: `app_unpacked/src/js/ui/util/debug-logger-core.js`
- Create: `scripts/test-debug-logger.mjs`

**Interfaces:**
- `formatDebugArgument(value)` 返回单个参数的可读文本。
- `formatDebugMessage(args)` 返回一条日志的文本。
- `appendDebugEntry(entries, entry, limit)` 返回追加并限制长度的新数组。

- [ ] **Step 1: Write the failing test**

  测试字符串、对象、错误对象的格式化，500 条上限，以及追加日志不修改原数组。

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test scripts/test-debug-logger.mjs`
  Expected: FAIL because `debug-logger-core.js` 不存在。

- [ ] **Step 3: Write minimal implementation**

  实现安全格式化和不可变追加；循环对象或不可序列化对象回退到 `String(value)`。

- [ ] **Step 4: Run test to verify it passes**

  Run: `node --test scripts/test-debug-logger.mjs`
  Expected: PASS。

### Task 2: 实时控制台面板

**Files:**
- Modify: `app_unpacked/src/js/ui/util/debug-logger.js`
- Create: `app_unpacked/src/css/common/debug-logger.css`
- Modify: `app_unpacked/src/css/index.css`

**Interfaces:**
- `init()` 继续由 `main.js` 调用。
- `console.log/info/debug/warn/error` 保持原输出，并同步进入面板。

- [ ] **Step 1: Add panel state and controls**

  开关打开时创建面板、工具栏、清空按钮、暂停自动滚动开关和日志列表；关闭时移除面板并清空当前会话日志。

- [ ] **Step 2: Capture and render all levels**

  所有五类日志统一格式化，显示时间和级别；新增日志默认滚动到底部，暂停后保持当前滚动位置。

- [ ] **Step 3: Add theme-aware styles**

  使用现有主题变量，固定在右上角，日志区域可滚动，日志正文不拦截阅读页面点击，工具栏按钮可操作。

### Task 3: 文档和回归验证

**Files:**
- Modify: `PROJECT-TECHNICAL-DOC.md`

- [ ] **Step 1: Document debug console behavior**

  记录开关、日志级别、500 条上限、清空和暂停行为，以及调试控制台只在本地界面显示。

- [ ] **Step 2: Run source checks**

  Run: `node --check app_unpacked/src/js/ui/util/debug-logger-core.js; node --check app_unpacked/src/js/ui/util/debug-logger.js; node --test scripts/test-debug-logger.mjs; cargo test --manifest-path src-tauri/Cargo.toml`
  Expected: JavaScript 语法检查通过，Node 测试通过，Rust 测试通过；不执行 `tauri:build`。
