# UI 优化计划

日期：2026-08-05
适用源码：`app_unpacked/src/`（前端渲染层，Tauri `src-tauri/` 为外壳）

本文是对前端 UI 的现状分析与优化路线。所有改动遵循仓库约定：纯 ES 模块、直接 DOM 操作、保留 MPL 头部、`npm run tauri:dev` 手工验证。

---

## 一、现状概览

架构清晰、结构规整：CSS 变量主题化程度高（`css/theme/`）、组件化良好（`ui/component/`）、DOM 骨架集中在 `index.html` 的 `<template>`。主要问题集中在三类：

1. **整体偏手机 PWA 手感**，桌面窗口（Tauri/WebView2）体验未专门打磨。
2. **大量原生 `alert()`/`confirm()` 与硬编码中文字符串**，与页面内嵌 UI 风格割裂，且绕过 i18n。
3. **CSS 魔数与 hack 布局**（旋转 header、vh 分页）使代码重复且脆弱。

---

## 二、问题与优化项清单

### P0 · 体验一致性与正确性（建议先做）

| # | 问题 | 现状位置 | 建议 |
|---|------|----------|------|
| 0-1 | **原生弹窗割裂** | `listpage.js`、`options.js`、`configpage.js`、`storage.js` 中实际 26 处 `alert()`/`confirm()` | 抽统一的页面内 Modal/Toast 组件（`ui/component/modal.js`），替代全部原生弹窗；确认类等待显式确认结果 |
| 0-2 | **硬编码中文绕过 i18n** | `listpage.js:` `刷新文件夹`/`多选删除`/`请先设置导入文件夹`/`正在导入`/`刷新完成`/`全选`/`删除`/`已选 N 项`、`options.js` 迁移文案；`configpage.js` 仅复用 `readFontFail` | 补入 `i18n/locale/{zh_cn,zh_tw,en}.js`，统一走 `i18n.getMessage`。这是全局一致问题，需一整轮梳理 |
| 0-3 | **主题变量未贯穿（暗色下突兀）** | `listpage.css` `#333/#888/#e55/white`、`rgba(218,175,80,.15)`；`flipreadpage.css` 与 `scrollreadpage.css` `.read-meta` 硬编码 `#808080` | 新增 CSS 变量（如 `--batch-bar-background`、`--danger-color`、`--reader-meta-color`），并入 `light/dark` 主题，移除硬编码色 |
| 0-4 | **阅读侧边索引 tab 的初始状态** | `index.html:81-83` 是目录/书签/搜索三个阅读索引 tab，`aria-selected="false"` 是初始状态，由 `indexpage.js` 激活时更新，不属于批量选择问题 | 按项目开发约束暂不实施；无障碍不属于当前项目范围 |

### P1 · 阅读页与布局技术债

| # | 问题 | 现状位置 | 建议 |
|---|------|----------|------|
| 1-1 | **桌面侧边控制栏 hack：旋转布局在两处重复** | `readpage.css:584-671`（`.read-page-wide`）与 `readpage.css:680-737`（`@media >=768px`）几乎相同 | 合并为单一规则集，消除重复；评估改为 flex/网格的横向布局而非 `rotate(90deg)` |
| 1-2 | **章分页用 `margin-top:100vh` hack** | `flipreadpage.css:107` | 重构为按 `page-height` 分块定位章节，避免视口高度耦合 |
| 1-3 | **进度只显示 `%.2f` 数字** | `listpage.js:433` `(cursor/length*100).toFixed(2)+'%'` | 加简洁进度条（色块/细线），百分比用整数显示 |
| 1-4 | **书架无内容预览/摘要** | `index.html` `file_list_item` 模板仅标题+日期+百分比 | 显示首段摘要（必要时）或章节标题，增强识别度 |
| 1-5 | **搜索仅匹配标题** | `listpage.js:662` `item.title.includes(search)` | 扩展可选匹配：作者/首章等，做去抖与高亮 |
| 1-6 | **书签/目录项点击热区过小、无 hover 回退** | `itemlist.js` 依赖 JS 加 `.hover` | 补充纯 CSS `:hover` 兜底，桌面端响应更顺滑 |

### P1 · 桌面端（Tauri/WebView2）体验

| # | 问题 | 建议 |
|---|------|------|
| 1-7 | 无专门的桌面窗口打磨（字体 20px、行高、DPI） | 增加 `@media (pointer:fine)` 或窗口宽度断点下的紧凑样式；验证高分屏缩放 |
| 1-8 | 页面切换 `.page` 直接 `display:none↔block`，无过渡 | 加轻量淡入/滑入过渡（注意不影响 `read_index` 现有 slide 动画） |
| 1-9 | 空书架仅一行文字，无引导 | 空状态加图标+「导入书籍」按钮，引导首次使用 |

### P1 · i18n 与帮助页

| # | 问题 | 建议 |
|---|------|------|
| 1-10 | 帮助页 `help/zh_cn.html` 等为静态 HTML | 与主题/骨架统一，或改为被页内 iframe 加载的模板 |

### P2 · 性能与视觉增强（长期）

| # | 问题 | 建议 |
|---|------|------|
| 2-1 | **长书全量载入渲染** | `scrolltextpage.js`（1372 行）逐段渲染；评估分块/虚拟化以降低大书 DOM 与 IndexedDB 读写压力 |
| 2-2 | **iconfont woff，`font-display:block`** | 评估引入内联 SVG 图标或为关键图标提供 SVG 回退，避免字体缺失白屏与发虚 |
| 2-3 | 只 light/dark 两档 | 增加「护眼/sepia」阅读主题预设（复用现有 CSS 变量体系，成本低） |
| 2-4 | 阅读底色纯黑/纯白，无纸张感 | 提供纸张类背景预设 + 夜间减亮档 |
| 2-5 | 颜色选择器只有 RGB 滑杆 | 增加 HEX 输入框与常用色板（已有 `color-picker-candidate-list` 基础） |
| 2-6 | expert 配置是裸 textarea | 增加 JSON/语法校验提示与格式化按钮（提示而非高亮，控制成本） |

---

## 三、分期路线

**Phase 1（一致性，低风险，先落地）**
- P0-1 ~ P0-3：Modal/Toast 组件替换原生弹窗、i18n 补全、主题变量贯穿。
- P0-4 按项目开发约束暂不实施；不引入无障碍专属改动或验收。
- 产出即提升所有中文字符串可翻译性与暗色观感，回归面可控。

**Phase 2（阅读页与桌面，中风险）**
- P1-1 ~ P1-6、P1-7 ~ P1-9：合并旋转布局、进度条、预览、hover、桌面紧凑样式、页面过渡、空状态引导。

**Phase 3（性能与视觉增强，长尾）**
- P2-1 ~ P2-6：渲染性能、图标方案、护眼主题、色板、expert 校验。

---

## 四、验证方式（遵循 CLAUDE.md）

UI 无自动化 e2e，按受影响流程在 `npm run tauri:dev` 下手工回归：

- 书架导入/刷新/多选删除/备份恢复
- 阅读 flip 与 scroll 两种模式、侧边索引（宽/窄窗口切换）
- 暗色/亮色主题与字体/字号/行距调整
- 窗口尺寸变化（严格同步 `read-page-wide/thin`）、高分屏
- 三语言切换（zh_cn / zh_tw / en）

---

## 五、改动约束提醒

- 保留 `index.html` 中 MPL 头部；新增/删改 `<template>` 需同步对应 `querySelector`/模板使用点。
- 桌面与浏览器（`scripts/serve.cjs`）双运行模式都要验证 host/port、CSP、主题。
- Modal/Toast 不注入运行时 `<style>`，全部样式放在预缓存 CSS 中；双运行模式都要确认固定 origin 的 CSP 不阻止组件渲染。
- Tauri 侧若涉及窗口能力（标题栏、托盘、快捷键）另立 task 走 `src-tauri/src/main.rs` 与 `platform/**` 双层对齐。
