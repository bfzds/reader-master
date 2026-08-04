# 迁移冲突复用选择 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户将一个冲突候选编号应用到本次导入剩余的冲突，减少重复选择。

**Architecture:** 新增一个不依赖 DOM 的冲突选择器，负责保存本次导入的复用编号并决定何时需要再次询问。设置页保留对话框渲染职责：显示候选书籍、返回一次性选择或复用选择。迁移导入完成后，该选择器随闭包销毁。

**Tech Stack:** 原生 ES Module、浏览器 `dialog`/表单控件、Node 内置 `node:test`、Tauri 前端。

## Global Constraints

- 只修改 `app_unpacked/src/` 的前端源码和 `scripts/` 测试；不改 `asar_extracted/`、`node_modules/` 或构建产物。
- 所有文案使用中文，复用状态只存在于一次导入过程中。
- 不使用 Codex 内置浏览器验证本地项目。
- 当前 `.git` 目录为空，不能执行提交步骤。

---

### Task 1: 可测试的冲突选择器

**Files:**
- Create: `app_unpacked/src/js/data/migration-conflict.js`
- Create: `scripts/test-migration-conflict.mjs`

**Interfaces:**
- Consumes: `choose(context)`，异步返回 `{ index: number, applyToRemaining: boolean }` 或 `null`。
- Produces: `createMigrationConflictResolver(choose)`，返回可传给 `file.importMigration()` 的 `resolveConflict(context)` 函数；解析结果为候选书籍对象或 `null`。

- [x] **Step 1: 写入失败测试，描述首次开启复用后自动选择相同编号**

```js
test('复用选择会自动使用后续候选列表中的相同编号', async () => {
  let prompts = 0;
  const resolveConflict = createMigrationConflictResolver(async () => {
    prompts++;
    return { index: 1, applyToRemaining: true };
  });
  const first = await resolveConflict({ candidates: [{ id: 'a' }, { id: 'b' }] });
  const second = await resolveConflict({ candidates: [{ id: 'c' }, { id: 'd' }] });
  assert.equal(first.id, 'b');
  assert.equal(second.id, 'd');
  assert.equal(prompts, 1);
});
```

- [x] **Step 2: 运行测试，确认因模块不存在而失败**

Run: `node --test --test-concurrency=1 scripts/test-migration-conflict.mjs`

Expected: FAIL，提示无法导入 `migration-conflict.js`。

- [x] **Step 3: 再写一个失败测试，描述缓存编号越界时重新询问**

```js
test('复用编号超过候选数量时会重新询问', async () => {
  const answers = [
    { index: 2, applyToRemaining: true },
    { index: 0, applyToRemaining: false },
  ];
  let prompts = 0;
  const resolveConflict = createMigrationConflictResolver(async () => {
    prompts++;
    return answers.shift();
  });
  await resolveConflict({ candidates: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
  const second = await resolveConflict({ candidates: [{ id: 'd' }] });
  assert.equal(second.id, 'd');
  assert.equal(prompts, 2);
});
```

- [x] **Step 4: 再写一个失败测试，描述一次性选择会清除复用状态**

```js
test('一次性选择不会继续复用旧编号', async () => {
  const answers = [
    { index: 1, applyToRemaining: true },
    { index: 0, applyToRemaining: false },
    { index: 1, applyToRemaining: false },
  ];
  let prompts = 0;
  const resolveConflict = createMigrationConflictResolver(async () => {
    prompts++;
    return answers.shift();
  });
  await resolveConflict({ candidates: [{ id: 'a' }, { id: 'b' }] });
  await resolveConflict({ candidates: [{ id: 'c' }] });
  await resolveConflict({ candidates: [{ id: 'd' }, { id: 'e' }] });
  assert.equal(prompts, 3);
});
```

- [x] **Step 5: 再次运行测试，确认新增用例同样因模块不存在而失败**

Run: `node --test --test-concurrency=1 scripts/test-migration-conflict.mjs`

Expected: FAIL，提示无法导入 `migration-conflict.js`。

- [x] **Step 6: 实现最小选择器**

```js
export const createMigrationConflictResolver = function (choose) {
  let reusableIndex = null;
  return async function resolveMigrationConflict(context) {
    const candidates = Array.isArray(context?.candidates) ? context.candidates : [];
    if (Number.isInteger(reusableIndex) && candidates[reusableIndex]) {
      return candidates[reusableIndex];
    }
    const selection = await choose(context);
    if (!selection || !Number.isInteger(selection.index) || !candidates[selection.index]) return null;
    reusableIndex = selection.applyToRemaining ? selection.index : null;
    return candidates[selection.index];
  };
};
```

- [x] **Step 7: 运行新增测试，确认通过**

Run: `node --test --test-concurrency=1 scripts/test-migration-conflict.mjs`

Expected: PASS，5 个测试通过。

- [x] **Step 8: 提交本任务**

当前工作区 `.git` 目录为空，记录该限制，不执行提交。

### Task 2: 迁移对话框和导入接入

**Files:**
- Modify: `app_unpacked/src/js/data/options.js:15-18, 362-418, 703-718`
- Test: `scripts/test-migration-conflict.mjs`
- Test: `scripts/test-migration-export-options.mjs`
- Test: `scripts/test-migration-source.mjs`
- Test: `scripts/test-settings-migration.mjs`

**Interfaces:**
- Consumes: `createMigrationConflictResolver(choose)`。
- Produces: `getMigrationConflictDialogResult(returnValue, selectedIndex, candidateCount)` 和 `showMigrationConflictDialog(context)`；后者返回 `{ index, applyToRemaining }` 或 `null`。

- [x] **Step 1: 为对话框结果解析写入失败测试**

```js
test('对话框的复用按钮返回当前编号和复用标记', () => {
  assert.deepEqual(getMigrationConflictDialogResult('apply', 1, 2), {
    index: 1,
    applyToRemaining: true,
  });
});

test('取消和越界编号不会返回候选选择', () => {
  assert.equal(getMigrationConflictDialogResult('cancel', 0, 1), null);
  assert.equal(getMigrationConflictDialogResult('once', 2, 2), null);
});
```

- [x] **Step 2: 运行测试，确认函数尚未导出而失败**

Run: `node --test --test-concurrency=1 scripts/test-migration-conflict.mjs`

Expected: FAIL，提示 `getMigrationConflictDialogResult` 不是导出函数。

- [x] **Step 3: 实现并验证对话框结果解析函数**

```js
export const getMigrationConflictDialogResult = function (returnValue, index, candidateCount) {
  if (!Number.isInteger(index) || index < 0 || index >= candidateCount) return null;
  if (returnValue === 'once') return { index, applyToRemaining: false };
  if (returnValue === 'apply') return { index, applyToRemaining: true };
  return null;
};
```

Run: `node --test --test-concurrency=1 scripts/test-migration-conflict.mjs`

Expected: PASS，3 个测试通过。

- [x] **Step 4: 在 `options.js` 添加自定义冲突对话框**

```js
const showMigrationConflictDialog = function ({ entry, method, candidates }) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    const form = document.createElement('form');
    const title = document.createElement('h3');
    title.textContent = `迁移书籍“${entry.meta?.title || ''}”存在多个匹配项（${method}）`;
    form.method = 'dialog';
    candidates.forEach((candidate, index) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'migration-conflict';
      input.value = String(index);
      input.checked = index === 0;
      label.append(input, `${index + 1}. ${candidate.title || '未命名'}，文件：${candidate.sourceName || '无'}`);
      form.append(label);
    });
    for (const [value, text] of [['once', '确定'], ['apply', '确定并应用到后续冲突'], ['cancel', '取消']]) {
      const button = document.createElement('button');
      button.type = 'submit';
      button.value = value;
      button.textContent = text;
      form.append(button);
    }
    dialog.append(title, form);
    dialog.addEventListener('close', () => {
      const selected = form.querySelector('input[name="migration-conflict"]:checked');
      const index = Number.parseInt(selected?.value || '', 10);
      resolve(getMigrationConflictDialogResult(dialog.returnValue, index, candidates.length));
      dialog.remove();
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
};
```

对话框标题显示迁移书名和匹配方式，按钮文案为“确定”“确定并应用到后续冲突”“取消”。候选项显示书名和来源文件名。对话框关闭后移除自身。

- [x] **Step 5: 用选择器替换现有 `window.prompt()` 回调**

```js
const resolveConflict = createMigrationConflictResolver(showMigrationConflictDialog);
const result = await file.importMigration(backup, {
  resolveConflict,
  // 保留已有 onProgress、resolveSource 和 saveSource。
});
```

在导入按钮的 `change` 回调中创建 `resolveConflict`，确保每次重新选择迁移文件都会清空上次的复用编号。

- [x] **Step 6: 运行完整前端迁移测试集**

Run: `node --test --test-concurrency=1 scripts/test-migration-conflict.mjs scripts/test-migration-export-options.mjs scripts/test-migration-source.mjs scripts/test-settings-migration.mjs`

Expected: PASS，所有测试通过，且没有失败用例。

- [x] **Step 7: 提交本任务**

当前工作区 `.git` 目录为空，记录该限制，不执行提交。
