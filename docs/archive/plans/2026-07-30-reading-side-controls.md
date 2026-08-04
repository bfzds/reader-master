# 阅读页侧栏控制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 768px 及以上窗口中，将激活的阅读控制面板显示为旧版左右侧栏。

**Architecture:** 保持 `ControlPage` 的 DOM、事件和按钮顺序不变，仅在 `readpage.css` 末尾增加桌面断点覆盖规则。新增一个 Node 脚本验证关键 CSS 规则，避免左右栏布局被后续样式改回上下栏。

**Tech Stack:** 原生 CSS、ESM Node.js 测试、Tauri 前端静态资源。

## Global Constraints

- 只改小说阅读控制面板布局。
- 768px 以下保持现有上下工具栏。
- 不使用 Codex 内置浏览器验证本地页面。

---

### Task 1: 侧栏布局回归检查

**Files:**
- Create: `scripts/test-read-control-layout.mjs`
- Modify: `app_unpacked/src/css/page/readpage.css`

- [ ] **Step 1: 写入会失败的 CSS 回归检查**

检查 768px 断点内包含左侧头部栏、右侧底部栏、隐藏书名和纵向图标栏四项规则。

- [ ] **Step 2: 运行检查并确认失败**

Run: `node --test scripts/test-read-control-layout.mjs`

Expected: 失败，因为当前 CSS 没有 768px 阅读侧栏断点。

- [ ] **Step 3: 添加最小 CSS 覆盖规则**

在 `readpage.css` 的宽屏规则之后，复用现有旋转侧栏布局，使其在 768px 及以上生效。

- [ ] **Step 4: 运行检查并确认通过**

Run: `node --test scripts/test-read-control-layout.mjs`

Expected: 通过。

- [ ] **Step 5: 执行静态验证**

Run: `node --check app_unpacked/src/js/page/read/control/controlpage.js; node --test scripts/test-read-control-layout.mjs; node --test scripts/test-debug-logger.mjs`

Expected: 所有命令退出码为 0。
