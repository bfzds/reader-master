# 调试控制台位置持久化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让调试控制台在关闭、重新打开和重启 tReader 后恢复到上一次拖动的位置。

**Architecture:** 将保存值的格式校验放入无 DOM 的 `debug-logger-core.js`，由 Node 测试直接覆盖。浏览器日志模块只在面板插入 DOM 后读取保存位置、按视口限制位置，并在指针释放时通过现有 `config` 层保存坐标。

**Tech Stack:** 原生 ES modules、IndexedDB 配置层、Node.js `node:test`、Tauri WebView。

## Global Constraints

- 使用内部配置键 `debug.logger_position`，格式为 `{ left, top }`。
- 只在拖动结束时保存，不在拖动过程中写入配置。
- 无效、缺失和越界配置不能阻止控制台显示；越界坐标必须限制在当前视口内。
- 不新增依赖，不修改调试日志采集、日志上限或设置开关。
- 不修改迁移设置白名单，因此不迁移设备相关的控制台坐标。
- 当前目录不是可用 Git 仓库，跳过提交步骤。

---

### Task 1: 坐标配置校验

**Files:**
- Modify: `app_unpacked/src/js/ui/util/debug-logger-core.js`
- Modify: `scripts/test-debug-logger.mjs`

**Interfaces:**
- Produces: `normalizeDebugLoggerPosition(value): { left: number, top: number } | null`。
- Consumes: 保存于 IndexedDB 的任意配置值。

- [ ] **Step 1: 写入失败测试**

```js
test('只接受包含有限 left 和 top 的控制台坐标', () => {
  assert.deepEqual(normalizeDebugLoggerPosition({ left: 36, top: 88 }), { left: 36, top: 88 });
  assert.equal(normalizeDebugLoggerPosition({ left: '36', top: 88 }), null);
  assert.equal(normalizeDebugLoggerPosition({ left: Infinity, top: 88 }), null);
  assert.equal(normalizeDebugLoggerPosition(null), null);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/test-debug-logger.mjs`

Expected: 因未导出 `normalizeDebugLoggerPosition` 而失败。

- [ ] **Step 3: 实现最小校验函数**

```js
export const normalizeDebugLoggerPosition = function (value) {
  if (!value || !Number.isFinite(value.left) || !Number.isFinite(value.top)) return null;
  return { left: value.left, top: value.top };
};
```

- [ ] **Step 4: 再次运行测试确认通过**

Run: `node --test scripts/test-debug-logger.mjs`

Expected: 所有日志模块测试通过。

### Task 2: 面板读取和保存位置

**Files:**
- Modify: `app_unpacked/src/js/ui/util/debug-logger.js`

**Interfaces:**
- Consumes: `config.get('debug.logger_position', null)`、`config.set('debug.logger_position', { left, top })` 和 `normalizeDebugLoggerPosition(value)`。
- Produces: 面板创建时恢复已保存坐标；拖动的 `pointerup` 事件结束时保存当前位置。

- [ ] **Step 1: 在创建面板后恢复保存坐标**

```js
const applySavedLoggerPosition = async panel => {
  const saved = normalizeDebugLoggerPosition(await config.get('debug.logger_position', null));
  if (!saved || loggerDiv !== panel) return;
  const rect = panel.getBoundingClientRect();
  const position = clampDebugLoggerPosition({
    ...saved,
    width: rect.width,
    height: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });
  panel.style.left = `${position.left}px`;
  panel.style.top = `${position.top}px`;
  panel.style.right = 'auto';
};
```

- [ ] **Step 2: 在指针释放时保存位置**

```js
const saveLoggerPosition = () => {
  if (!loggerDiv) return;
  const rect = loggerDiv.getBoundingClientRect();
  void config.set('debug.logger_position', { left: rect.left, top: rect.top });
};

const onUp = () => {
  saveLoggerPosition();
  stopDragging();
};
```

- [ ] **Step 3: 执行完整回归检查**

Run: `node --check app_unpacked/src/js/ui/util/debug-logger-core.js; node --check app_unpacked/src/js/ui/util/debug-logger.js; node --test scripts/test-debug-logger.mjs; cargo test --manifest-path src-tauri/Cargo.toml`

Expected: 两个 JavaScript 文件无语法错误，Node 测试通过，Rust 测试通过。
