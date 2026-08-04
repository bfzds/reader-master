# EPUB 处理与限制

本文描述当前 tReader 的 EPUB 技术路线。它解释“原 EPUB 版权页、表格或图文排版为何在阅读器中变成统一文本样式”，不是 EPUB 规范兼容性承诺。

## 结论

tReader 当前采用**文本化 EPUB + 统一重排**模型，不采用独立的原版 XHTML/CSS EPUB renderer：

```text
EPUB XHTML/CSS
  → 提取正文文本与有限图片资源引用
  → content.text
  → tReader flip / scroll 文本阅读器
```

EPUB、TXT、GZ 最终进入同一阅读流程，只能通过 `view_mode` 选择 `flip` 或 `scroll`。应用的主题、字体、字号、行高、段距和分页规则会接管显示；它们不是原 EPUB 的 CSS。

## 导入流水线

`app_unpacked/src/js/text/text.js` 调用 `readEpub()`，其流程位于 `app_unpacked/src/js/text/epub.js`：

```text
EPUB File
  → JSZip 解包
  → META-INF/container.xml
  → OPF rootfile
  → manifest / spine
  → EPUB 3 nav，或 EPUB 2 NCX fallback
  → 逐个 spine XHTML
  → DOMParser + collectText()
  → content.text + resources
```

EPUB 3 的 `nav` 优先；没有有效 `nav` 时使用 EPUB 2 NCX。导航文档不会作为正文加入。每个 spine 文档的文本按顺序拼接，并将目录标题映射到文本 cursor。

`collectText()` 保留正文文本节点、`BR` 和粗粒度块元素换行；连续空行会归一化。它不保留原 XHTML DOM。

## 图片与资源

ZIP 内可解析的普通 `<img src>` 不直接进入 `content.text`，而是转换为 `￼imgN￼` 占位符，并记录原 ZIP 内的 `path`、MIME 与 alt 文本。

阅读时 `ReadPage` 和 `TextPage` 从原始 EPUB source ZIP 按需读取资源，创建 Blob URL；可视区附近的图片通过懒加载和资源 lease/cache 管理。资源不存在、关闭图片或加载失败时，会降级为 alt 文本或 `[image]`。

这不是通用媒体或版式保真机制。当前不会完整保留：

- CSS `background-image`、伪元素和图片定位；
- SVG 图形、`video`、`audio`、`object`、`canvas`；
- 图片宽高、浮动、裁剪、滤镜和响应式资源；
- 资源在原 XHTML/CSS 中的布局关系。

## 导入期保留与丢失

| 类别 | 当前结果 |
| --- | --- |
| 正文字符、spine 顺序 | 保留。 |
| `BR` 与部分块元素换行 | 归一化为文本换行。 |
| nav/NCX 目录 | 保留为标题到文本 cursor 的索引。 |
| ZIP 内常规 `<img>` | 保留资源引用和 alt，阅读时尽力懒加载。 |
| XHTML 标签、class、id、inline style | 导入期丢失。 |
| `<link>`、`<style>`、书内 CSS、字体 | 导入期丢失，不执行。 |
| 标题等级、`hr`、列表、表格、引用、链接语义 | 大多扁平为普通文本或换行。 |
| 背景、颜色、边距、对齐、固定版式、原分页、书写方向 | 导入期丢失。 |
| SVG/复杂媒体/脚本 | 不作为原版页面执行。 |

因此，原书的白底版权页、细横线、居中标题、字体和精确留白，导入后可能显示为应用暗色主题下的大字号普通文字。这是当前模型的预期限制，不是某个 EPUB CSS 文件偶发加载失败。

## 阅读与定位

当前翻页和滚动 renderer 位于 `app_unpacked/src/js/page/read/text/`，它们根据 `content.text` 和应用样式创建段落、分页和高亮。位置、目录、书签和搜索以文本 cursor 为基础；当前未使用 EPUB CFI 作为阅读位置模型。

当前模型的收益是 TXT/GZ/EPUB 共用搜索、主题、简繁转换、编辑、目录和分页逻辑。代价是 EPUB 导入需要依次读取 spine 文档，且不能原样重建出版布局。

## 编辑、下载与迁移

编辑器操作的是已文本化内容。若原来源名为 `.epub`，编辑保存会调用 `createEpub()` 重新生成最小 EPUB 3，只包含基础 OPF、`nav.xhtml` 和单一 `text.xhtml`。

该过程不会恢复原 OPF、spine、XHTML 层级、CSS、字体、目录层级或嵌入媒体；资源映射会清空。因此它是**不可逆的文本化转换**，不是原 EPUB 的无损编辑。

普通下载/分享导出的是 UTF-8 TXT，不是 EPUB round-trip。需要保留原 EPUB 的图片、CSS 与资源时，应保留原始 source，并在迁移时选择“导出原文件”；只导出正文不包含 EPUB ZIP 资源。正文和原文件同时导出会产生重复数据。

## 与 Flow 的路线对比

本次分析的 `flow_backup_20260731.zip` 是数据备份，不是 Flow 源码。Flow 上游仓库采用 React/Next.js/TypeScript、Dexie 和 vendored `epub.js`；其 reader 将 EPUB ArrayBuffer 交给 `epub.js`，以原 XHTML/CSS rendition 渲染，并用 EPUB CFI 记录位置和标注。

这与 tReader 的文本化模型不同：

| Flow/epub.js 类路线 | 当前 tReader |
| --- | --- |
| 保留 XHTML/CSS，章节 DOM rendition | XHTML 提取为 `content.text`。 |
| CFI 定位、DOM range 标注 | 文本 cursor 定位。 |
| 更适合原书排版、表格、版权页和图文书 | 更适合统一小说式重排、文本编辑和跨格式阅读。 |
| 通常按章节/当前位置渲染 | 导入时顺序读取所有 spine 文档。 |

此对比仅用于说明设计取舍；tReader 当前**没有集成** Flow、`epub.js` 或原版 EPUB 排版模式。

## 潜在方向

以下是未承诺的设计方向，不表示已实现或已有排期：

1. **结构 token**：保留标题、横线、列表、图注等有限语义，改善文本重排显示。
2. **Block/AST 重排**：保存 EPUB block 结构，支持标题、引用、表格、链接和图片等白名单节点，同时继续使用应用主题。
3. **原版只读模式**：独立使用 iframe/Shadow DOM 渲染原 XHTML/CSS，结合资源 URL 重写、CSS 隔离、sandbox、CFI、搜索和标注；文本编辑与原版保真必须分开设计。

任何原版模式都需要单独评估 EPUB 内脚本、外链、字体、资源 URL、CSS 隔离和跨文档位置模型，不能仅把原 CSS 注入现有文本页面。