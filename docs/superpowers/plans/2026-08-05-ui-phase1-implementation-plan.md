# UI Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace active renderer native dialogs with localized Modal/Toast feedback and complete the Phase 1 theme-token cleanup without changing reader, storage, migration, or Tauri behavior.

**Architecture:** Add one DOM-backed `modal.js` component with a small exported FIFO queue helper that has no DOM dependency. Modal requests serialize through one host; Toasts render independently in a stacked host. Call sites resolve localized messages before invoking the component, and all notification failures are isolated from the business operation that triggered them.

**Tech Stack:** Plain ES modules, direct DOM manipulation, CSS variables, Node `node:test`, existing Tauri/WebView2 runtime, Service Worker precache.

## Global Constraints

- Active frontend remains `app_unpacked/src/`.
- Preserve MPL license headers.
- Use plain ES modules and direct DOM manipulation.
- Keep `127.0.0.1:2333` unchanged.
- Do not modify `artifacts/`, `asar_extracted/`, `node_modules/`, or `src-tauri/`.
- Accessibility is out of scope. Do not add dedicated ARIA, screen-reader, focus-management, keyboard-navigation, or accessibility acceptance work.
- Use `--reader-meta-color` as the only reader metadata color token name.
- Keep `#import_tip` as the long-running progress overlay; it is not replaced by Toast.
- Use existing external CSS files. Do not inject a runtime `<style>` element for the new component.

---

### Task 1: Add failing Phase 1 regression tests

**Files:**
- Create: `scripts/test-ui-phase1.mjs`
- Read: `app_unpacked/src/js/i18n/locale/{en,zh_cn,zh_tw}.js`
- Read: `app_unpacked/src/js/page/list/listpage.js`
- Read: `app_unpacked/src/js/data/options.js`
- Read: `app_unpacked/src/js/page/config/configpage.js`
- Read: `app_unpacked/src/js/data/storage.js`
- Read: `app_unpacked/src/css/theme/{light,dark}.css`
- Read: `app_unpacked/src/css/page/{listpage,flipreadpage,scrollreadpage}.css`
- Read: `app_unpacked/src/sw.js`

**Interfaces:**
- Consumes: locale objects and source files as text.
- Produces: a test contract for `createNotificationQueue(processor)` exported by `modal.js`.

- [ ] **Step 1: Write the failing tests**

Create a `PHASE1_KEYS` array containing exactly the key names listed in the design document, including reused keys. Import locale modules directly and assert all three own the same keys; assert dynamic locale functions include supplied counts, titles, source types, and error details without unresolved placeholders.

Add a queue test using this future API:

```js
const queue = createNotificationQueue(async request => {
  started.push(request.id);
  await request.release;
  return request.id;
});
const first = queue.enqueue({ id: 'first', release: firstRelease });
const second = queue.enqueue({ id: 'second', release: secondRelease });
assert.deepEqual(started, ['first']);
firstRelease();
assert.equal(await first, 'first');
assert.deepEqual(started, ['first', 'second']);
secondRelease();
assert.equal(await second, 'second');
```

Add static assertions that:

- the four call-site modules import `modal.js` and contain no unqualified browser-global `alert(...)` or `confirm(...)` calls;
- `batchDelete()` awaits `modal.confirm()` and returns before reading selected IDs when confirmation is false;
- migration success awaits the summary notification and reloads after it, while notification failure is caught without entering the migration failure branch;
- `#import_tip` remains in list refresh/import and migration paths;
- both themes define the new modal, toast, batch, danger, selection, and `--reader-meta-color` tokens;
- `listpage.css` no longer contains `--alert-color` or the replaced hard-coded batch colors;
- both reader CSS files use `var(--reader-meta-color)` instead of `#808080`;
- `./js/ui/component/modal.js` is present in `sw.js` `resourceList`.

Keep DOM-dependent assertions out of this Node test. The real DOM rendering and button/overlay interaction is a manual Tauri check.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
node --test scripts/test-ui-phase1.mjs
```

Expected: FAIL because the new locale keys, modal module, call-site imports, CSS tokens, and Service Worker resource are not implemented yet. The failure must identify missing expected behavior, not a syntax error in the test.

- [ ] **Step 3: Commit the test contract**

```powershell
git add -- scripts/test-ui-phase1.mjs
git commit -m "test: define UI phase 1 contracts"
```

### Task 2: Implement the Modal/Toast component and theme surface

**Files:**
- Create: `app_unpacked/src/js/ui/component/modal.js`
- Modify: `app_unpacked/src/css/common/main.css`
- Modify: `app_unpacked/src/css/theme/light.css`
- Modify: `app_unpacked/src/css/theme/dark.css`

**Interfaces:**
- Consumes: `createNotificationQueue(processor)` from this component and localized `options` supplied by call sites.
- Produces: `modal.alert(message, options) -> Promise<void>`, `modal.confirm(message, options) -> Promise<boolean>`, `modal.toast(message, options) -> void`.

- [ ] **Step 1: Implement the DOM-free queue helper**

Export `createNotificationQueue(processor)`. It owns an array of pending requests and one `draining` flag. `enqueue(request)` returns a Promise, starts the drain if idle, processes one request at a time, and settles each request exactly once. A processor rejection rejects only that request and allows the next request to run.

- [ ] **Step 2: Run the queue test to verify GREEN**

Run:

```powershell
node --test scripts/test-ui-phase1.mjs --test-name-pattern "FIFO"
```

Expected: the queue behavior passes while the remaining static checks stay red.

- [ ] **Step 3: Implement runtime host creation**

Create `.modal-host` and `.toast-host` lazily under `document.body`. If the body is not ready, wait for `DOMContentLoaded`; if notification rendering fails, reject that notification Promise without throwing synchronously from the caller. Do not reference `document.body` at module evaluation time.

Render Modal requests with regular `div` and `button` elements. A Modal has a message, a close/confirm action, and for confirmation a cancel action. Overlay click resolves confirmation as `false`. Guard each request with a local `settled` boolean before removing DOM and resolving/rejecting.

Render Toasts as independent children in arrival order. Schedule one expiry timer per Toast and remove only that Toast when its timer fires. Use no inline `<style>`; all visual rules are in `main.css`.

- [ ] **Step 4: Add theme tokens and component CSS**

Add matching light/dark values for:

```css
--modal-overlay-background
--modal-background
--modal-color
--toast-background
--toast-color
--batch-bar-background
--batch-bar-color
--batch-button-border-color
--danger-color
--batch-selected-background
--reader-meta-color
```

Use `z-index: 200` for the Modal host and `z-index: 210` for the Toast host so they stay above the existing batch bar at `z-index: 100` and import overlay at `z-index: 10`.

- [ ] **Step 5: Run the focused test**

Run:

```powershell
node --test scripts/test-ui-phase1.mjs
```

Expected: queue, component CSS, theme-token, and Modal module checks pass; locale and call-site checks remain red.

- [ ] **Step 6: Commit the component**

```powershell
git add -- app_unpacked/src/js/ui/component/modal.js app_unpacked/src/css/common/main.css app_unpacked/src/css/theme/light.css app_unpacked/src/css/theme/dark.css
git commit -m "feat: add localized modal and toast surfaces"
```

### Task 3: Add the complete Phase 1 locale contract

**Files:**
- Modify: `app_unpacked/src/js/i18n/locale/en.js`
- Modify: `app_unpacked/src/js/i18n/locale/zh_cn.js`
- Modify: `app_unpacked/src/js/i18n/locale/zh_tw.js`

**Interfaces:**
- Consumes: existing `i18n.getMessage(name, ...placeholders)` behavior.
- Produces: exact shared Phase 1 keys and locale function contracts used by call sites.

- [ ] **Step 1: Add modal, list, batch, backup/restore, migration, and custom-dialog keys**

Add every key from the design document's required list, including `modalTitle`, `modalConfirm`, `modalCancel`, `modalClose`, list refresh/batch keys, migration keys, export-option keys, and conflict-dialog keys. Reuse existing `readFontFail`, `configInstallIosGuide`, `configImportSaveFolderNotSupported`, and existing delete/save error keys instead of duplicating them.

- [ ] **Step 2: Implement dynamic locale functions**

Use locale functions for `listConfigOnlyBook`, `listConfigOnlyBookWithFolder`, `listRefreshImporting`, `listBatchSelectedCount`, `listBatchDeleteConfirm`, `listRestoreComplete`, `migrationExportProgress`, `migrationImportProgress`, and `migrationImportComplete`. Use `{0}` placeholders where a string is sufficient. Every function must include all supplied values and never emit `undefined`.

- [ ] **Step 3: Run the locale tests**

Run:

```powershell
node --test scripts/test-ui-phase1.mjs --test-name-pattern "locale|dynamic"
```

Expected: all three locale objects have matching own-key sets and dynamic messages pass; call-site checks remain red.

- [ ] **Step 4: Commit locale changes**

```powershell
git add -- app_unpacked/src/js/i18n/locale/en.js app_unpacked/src/js/i18n/locale/zh_cn.js app_unpacked/src/js/i18n/locale/zh_tw.js
git commit -m "feat: localize UI phase 1 feedback"
```

### Task 4: Migrate renderer call sites

**Files:**
- Modify: `app_unpacked/src/js/page/list/listpage.js`
- Modify: `app_unpacked/src/js/data/options.js`
- Modify: `app_unpacked/src/js/page/config/configpage.js`
- Modify: `app_unpacked/src/js/data/storage.js`

**Interfaces:**
- Consumes: `modal.alert`, `modal.confirm`, and `modal.toast`; Phase 1 locale keys.
- Produces: no unqualified native `alert()` or `confirm()` calls in active frontend paths.

- [ ] **Step 1: Import the shared component**

Use `../../ui/component/modal.js` in `listpage.js` and `configpage.js`, `../ui/component/modal.js` in `options.js` and `storage.js`.

- [ ] **Step 2: Migrate list-page messages**

Replace import errors, folder setup/empty/failure messages, placeholder-book feedback, save/delete errors, backup/restore feedback, and batch confirmation. Use `await modal.confirm(...).catch(() => false)` for batch deletion; read selected IDs only after confirmation succeeds. Preserve source-file-first deletion and batch state on cancellation. Use protected `modal.alert` calls so notification failures do not enter unrelated import/restore failure branches.

Use Toast for completed refresh, backup, restore, and other non-blocking success messages; use Modal for errors, placeholder instructions, and batch confirmation.

- [ ] **Step 3: Migrate options/config/storage messages**

Replace options/config alerts with protected Modal or Toast calls. Localize the migration export options and conflict dialog visible strings. For migration import, hide `#import_tip`, await the summary Modal, catch and warn on notification failure, then reload regardless because the import already succeeded. Keep the failure branch from reloading. In `storage.js`, trigger the storage-open Modal in protected fire-and-forget form and immediately reject `dbPromise` as before.

- [ ] **Step 4: Run call-site tests**

Run:

```powershell
node --test scripts/test-ui-phase1.mjs --test-name-pattern "call-site|batch|migration|import_tip"
```

Expected: all call-site static checks pass.

- [ ] **Step 5: Commit call-site changes**

```powershell
git add -- app_unpacked/src/js/page/list/listpage.js app_unpacked/src/js/data/options.js app_unpacked/src/js/page/config/configpage.js app_unpacked/src/js/data/storage.js
git commit -m "feat: replace native renderer dialogs"
```

### Task 5: Finish theme cleanup and Service Worker precache

**Files:**
- Modify: `app_unpacked/src/css/page/listpage.css`
- Modify: `app_unpacked/src/css/page/flipreadpage.css`
- Modify: `app_unpacked/src/css/page/scrollreadpage.css`
- Modify: `app_unpacked/src/sw.js`

**Interfaces:**
- Consumes: theme tokens from Task 2 and `modal.js` from Task 2.
- Produces: theme-consistent batch/progress/reader metadata styling and a precached Modal module.

- [ ] **Step 1: Replace list-page hard-coded values**

Change `#import_tip` from `var(--alert-color)` to `var(--alert-text)`. Replace batch bar `#333`, `white`, `#888`, `#e55`, and `rgba(218,175,80,.15)` with the matching theme tokens.

- [ ] **Step 2: Replace reader metadata color**

In both reader CSS files, replace `.read-meta` `#808080` with `var(--reader-meta-color)`.

- [ ] **Step 3: Add the Modal module to the Service Worker resource list**

Insert `./js/ui/component/modal.js` beside the other UI components. If the implementation adds any new static imports, add those imported files too. Run:

```powershell
node scripts/update-sw-version.mjs
```

Expected: the script updates only the Service Worker version to the hash of the sorted resource list.

- [ ] **Step 4: Run focused and Service Worker tests**

Run:

```powershell
node --test scripts/test-ui-phase1.mjs
node --test scripts/test-sw-resources.mjs
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit CSS and Service Worker changes**

```powershell
git add -- app_unpacked/src/css/page/listpage.css app_unpacked/src/css/page/flipreadpage.css app_unpacked/src/css/page/scrollreadpage.css app_unpacked/src/sw.js
git commit -m "refactor: finish phase 1 UI theme tokens"
```

### Task 6: Full verification and manual Tauri regression

**Files:**
- Verify all files changed by Tasks 1-5.
- Keep unchanged: `app_unpacked/src/index.html`, `app_unpacked/src/js/main.js`, `app_unpacked/src/js/page/read/index/indexpage.js`, `src-tauri/`, `artifacts/`, `asar_extracted/`, `node_modules/`, `package.json`, and `scripts/test-all.mjs`.

- [ ] **Step 1: Run the full JavaScript test suite**

```powershell
npm test
npm run test:toc
```

- [ ] **Step 2: Run Rust tests**

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 3: Run the Tauri development app for manual regression**

```powershell
npm run tauri:dev
```

Check English, Simplified Chinese, Traditional Chinese, single import, folder refresh, batch cancel/confirm, backup/restore, configuration/font errors, migration export/import/conflicts, `#import_tip` cleanup, migration summary-before-reload, storage failure handling, light/dark Modal/Toast colors, batch colors, and flip/scroll metadata colors. Do not use the Codex in-app browser for local verification.

- [ ] **Step 4: Review the final diff**

```powershell
git diff --check HEAD~5..HEAD
git status --short
```

Confirm the user's untracked `docs/superpowers/plans/2026-08-05-ui-optimization-plan.md`, `start-dev-hidden.vbs`, and `start-dev.bat` are still present and are not staged by the implementation commits.
