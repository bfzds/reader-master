# UI Phase 1 Design

**Date:** 2026-08-05  
**Scope:** P0-1 through P0-3 from `docs/superpowers/plans/2026-08-05-ui-optimization-plan.md`

## Goal

Unify renderer feedback, translate Phase 1 user-facing text, and make bookshelf and reader colors consistent across themes. Preserve reading, import, migration, backup/restore, persistence, fixed runtime origin, and Tauri shell behavior.

## Constraints

- Active frontend remains `app_unpacked/src/`.
- Preserve MPL license headers.
- Use plain ES modules and direct DOM manipulation.
- Keep `127.0.0.1:2333` unchanged.
- Do not modify `artifacts/`, `asar_extracted/`, `node_modules/`, or `src-tauri/`.
- Modal/Toast styles live in `main.css`; do not inject a runtime `<style>`, so the fixed-origin CSP remains valid in browser and Tauri modes.
- Replace user-facing native `alert()` and `confirm()` calls in active frontend paths.
- Keep diagnostics through existing `console.error` / `console.warn` paths.
- Accessibility is out of scope. Do not add dedicated ARIA, screen-reader, focus-management, keyboard-navigation, or accessibility acceptance work.

## Non-goals

- Do not change reading data, `file.getMeta()` / `file.setMeta()`, reading-progress persistence, or reader templates.
- Do not alter Service Worker update reload behavior in `js/main.js`.
- Do not modify `index.html`; generic notification hosts are created at runtime.
- Do not modify `js/page/read/index/indexpage.js`.
- Do not replace `#import_tip`; it remains long-running task progress UI.

## Design

### Modal and toast

Add `app_unpacked/src/js/ui/component/modal.js` as notification entry point. It creates and reuses one Modal host and one Toast host under `document.body`; no static host is needed in `index.html`.

It exposes:

- `alert(message, options)`: informational Modal; returns `Promise<void>` after user closes it.
- `confirm(message, options)`: consequential-action Modal; returns `Promise<boolean>`. Confirm resolves `true`; cancel, close, or overlay click resolve `false`.
- `toast(message, options)`: short non-blocking status message. Do not use for results requiring user acknowledgement before continuing.

The component uses page DOM and buttons, never browser-global `alert()` or `confirm()`. This phase does not define ARIA, focus, Escape, keyboard, or screen-reader behavior.

Modal requests use one small FIFO queue because one host cannot display multiple requests at once and storage/import flows can report while another notification is still pending. Show only queue head; after it settles, remove it and show next request. Every `alert()` or `confirm()` Promise settles once only. Toasts stack in arrival order and expire independently; a Toast never blocks a Modal or another Toast.

`modal.js` must not synchronously fail when `document.body` is unavailable. Delay host creation until body exists or DOM is ready. `storage.js` keeps its current `dbPromise` rejection behavior: storage open failure must reject immediately even if notification display fails or waits for DOM readiness. Trigger `modal.alert()` in protected fire-and-forget form so notification failure never hides storage failure.

Notification failure never changes completed business work. For non-destructive informational feedback, catch Modal/Toast creation or display failure, log `console.warn`, then continue required post-success work. A failed batch-delete confirmation is equivalent to cancellation: log a warning and return before reading selected IDs or deleting files. A failed migration-summary Modal is logged, then `location.reload()` still runs because migration already succeeded.

`options.js` custom dialogs `chooseMigrationExportOptions()` and `showMigrationConflictDialog()` remain independent. They provide export options and conflict choices that generic alert/confirm cannot represent. Their visible text is still localized.

### Call-site behavior

Migrate native dialog calls in `listpage.js`, `options.js`, `configpage.js`, and `storage.js` to the shared component. Resolve user-facing text with `i18n.getMessage()` before calling it.

`#import_tip` remains long-task progress overlay for single-file import, folder refresh, migration export, and migration import. Keep existing show, update, hide, and default-text restoration timing. It is not a generic Toast replacement.

#### Batch deletion

Keep existing selection and deletion semantics. Batch UI labels, counts, confirmation text, and result messages are localized.

`batchDelete()` must wait for confirmation before reading selected IDs or deleting anything:

```js
const confirmed = await modal.confirm(...);
if (!confirmed) return;
```

Cancel, close, or overlay click must not delete bookshelf records or imported source files and must preserve current batch state. On confirmation, retain current per-book behavior: try imported source-file deletion first; if it fails, skip that book and continue; then remove successful books from bookshelf storage; finally exit batch mode and refresh list. Keep existing zero-selection disabled deletion behavior. Do not add accessibility behavior.

#### Migration completion

Keep existing migration export/import progress overlay and custom choice dialogs. Migration import success must run in this order:

1. Finish import and hide `#import_tip`.
2. `await modal.alert(i18n.getMessage(...migration summary...))`.
3. Call `location.reload()` only after summary Modal closes.

Migration failure hides progress UI, reports localized failure, and does not reload. If summary notification fails after a completed import, log a warning and reload instead of entering migration-failure handling. Do not modify unrelated Service Worker `location.reload()` behavior in `js/main.js`.

### Localization

Add the same explicit Phase 1 key set to:

- `app_unpacked/src/js/i18n/locale/en.js`
- `app_unpacked/src/js/i18n/locale/zh_cn.js`
- `app_unpacked/src/js/i18n/locale/zh_tw.js`

Use existing `i18n.getMessage(name, ...placeholders)` behavior. Dynamic counts, filenames, source types, errors, and migration summaries use `{0}` placeholders or locale functions. Call sites must not concatenate new user-facing sentences.

Key groups cover:

- Modal title and button text.
- Bookshelf import, refresh, folder setup, empty result, source-file failure, and placeholder-book messages.
- Batch mode, selection count, select-all, delete confirmation, deletion result, and failure messages.
- Backup and restore results.
- Configuration and font errors.
- Migration export/import phases, result summaries, error details, export options, and conflict dialog text.

Existing appropriate keys such as `readFontFail`, `configInstallIosGuide`, and `configImportSaveFolderNotSupported` are reused. Diagnostic log strings do not need conversion because they are not UI copy.

#### Required Phase 1 keys

The implementation and focused test use this complete key list. Existing keys are marked reuse; every other key is added explicitly to all three locale objects.

- Modal: `modalTitle`, `modalConfirm`, `modalCancel`, `modalClose`.
- Bookshelf header and refresh: `listRefreshFolder`, `listBatchModeEnter`, `listBatchModeExit`, `listRefreshFolderUnset`, `listRefreshScanning`, `listRefreshImporting`, `listRefreshPreparing`, `listRefreshEmpty`, `listRefreshComplete`, `listRefreshFailed`.
- Bookshelf source and placeholder feedback: `listConfigOnlyBook`, `listConfigOnlyBookWithFolder`, `listImportDeleteNoPermission` (reuse), `listImportDeleteIsDirectory` (reuse), `listImportDeleteFail` (reuse), `listImportSaveFail` (reuse).
- Batch actions: `listBatchSelectAll`, `listBatchSelectedCount`, `listBatchDelete`, `listBatchDeleteConfirm`, `listBatchDeleteFailed`.
- Backup and restore: `listBackupEmpty`, `listBackupFailed`, `listRestoreComplete`, `listRestoreFailed`, `listRestoreInvalidFormat`.
- Configuration: `readFontFail` (reuse), `configInstallIosGuide` (reuse), `configImportSaveFolderNotSupported` (reuse).
- Migration group and actions: `migrationGroupTitle`, `migrationExportButton`, `migrationImportButton`, `migrationExportPreparing`, `migrationExportProgress`, `migrationExportFinalizing`, `migrationExportComplete`, `migrationExportFailed`, `migrationImportProgress`, `migrationImportComplete`, `migrationImportFailed`, `migrationInvalidFile`.
- Migration export options: `migrationExportOptionsTitle`, `migrationExportIncludeBooks`, `migrationExportIncludeSettings`, `migrationExportIncludeSources`, `migrationExportConfirm`, `migrationExportCancel`.
- Migration conflicts: `migrationConflictTitle`, `migrationConflictDescription`, `migrationConflictUseExisting`, `migrationConflictUseIncoming`, `migrationConflictCreatePlaceholder`, `migrationConflictConfirm`, `migrationConflictCancel`.

Locale function or placeholder contracts: `listConfigOnlyBook` receives source type; `listConfigOnlyBookWithFolder` receives source type; `listRefreshImporting`, `listBatchSelectedCount`, `listBatchDeleteConfirm`, `listRestoreComplete`, and `migrationExportProgress` receive counts; failure keys receive error details; `migrationImportProgress` receives current, total, and title; `migrationImportComplete` receives restored, path-resolved, path-not-found, source-saved, source-save-failed, added, placeholders, ambiguous, and errors counts. Names may use camelCase exactly as listed; no alias key names are permitted.

### Theme variables

Define matching variables in `light.css` and `dark.css` for:

- Modal overlay, surface, and text.
- Toast surface and text.
- Batch action-bar surface and text.
- Batch ordinary-button border and danger-action color.
- Batch-selected list-item background.
- Reader metadata text.

Use those variables from:

- `css/common/main.css` for generic Modal and Toast structure, layers, and buttons.
- `css/page/listpage.css` for `#import_tip`, batch selection, batch bar, and batch buttons.
- `css/page/flipreadpage.css` and `css/page/scrollreadpage.css` for `.read-meta`.

Remove Phase 1 hard-coded batch values (`#333`, `white`, `#888`, `#e55`, and selected-item RGBA) from `listpage.css`. Replace its undefined `var(--alert-color)` with existing defined `var(--alert-text)`.

Both reader modes replace `.read-meta` hard-coded `#808080` with one `--reader-meta-color` token. This changes presentation only; it does not change metadata fields, reading state, persistence, or HTML templates.

### Service Worker cache

Add `./js/ui/component/modal.js` to `app_unpacked/src/sw.js` `resourceList`. After resource-list changes, run `node scripts/update-sw-version.mjs` to update the `/* VERSION */` resource-list hash. Do not hand-write a mismatched hash.

## Files

### Modify during implementation

- `app_unpacked/src/js/page/list/listpage.js`
- `app_unpacked/src/js/data/options.js`
- `app_unpacked/src/js/page/config/configpage.js`
- `app_unpacked/src/js/data/storage.js`
- `app_unpacked/src/js/i18n/locale/en.js`
- `app_unpacked/src/js/i18n/locale/zh_cn.js`
- `app_unpacked/src/js/i18n/locale/zh_tw.js`
- `app_unpacked/src/css/common/main.css`
- `app_unpacked/src/css/theme/light.css`
- `app_unpacked/src/css/theme/dark.css`
- `app_unpacked/src/css/page/listpage.css`
- `app_unpacked/src/css/page/flipreadpage.css`
- `app_unpacked/src/css/page/scrollreadpage.css`
- `app_unpacked/src/sw.js`

### Create during implementation

- `app_unpacked/src/js/ui/component/modal.js`
- `scripts/test-ui-phase1.mjs`

### Keep unchanged

- `app_unpacked/src/index.html`: runtime-created Modal/Toast hosts; existing `#import_tip` remains.
- `app_unpacked/src/js/page/read/index/indexpage.js`: tab behavior is outside scope.
- `app_unpacked/src/js/main.js`: Service Worker update reload remains unchanged.
- `src-tauri/`, `artifacts/`, `asar_extracted/`, `node_modules/`, `package.json`, and `scripts/test-all.mjs`.

## Testing

### Automated

Create `scripts/test-ui-phase1.mjs`. Its `test-*.mjs` name is auto-discovered by `scripts/test-all.mjs`; no package script change is required.

The focused test must:

1. Import raw locale objects from `en.js`, `zh_cn.js`, and `zh_tw.js`. Assert every Phase 1 key is an own property in all three files, key sets match, and values are strings or functions. Do not use the i18n facade to prove key presence: its English fallback masks missing localized keys.
2. Exercise dynamic messages with representative counts, errors, files, source types, and migration statistics. Output must include supplied values and contain no unresolved `{N}` placeholder or `undefined`.
3. Inspect `listpage.js`, `options.js`, `configpage.js`, and `storage.js`: each imports the shared component and no longer directly invokes unqualified browser-global `alert(...)` or `confirm(...)`. Allow `modal.alert(...)` and `modal.confirm(...)`.
4. Verify the DOM-free queue FIFO behavior in Node. DOM rendering, button events, overlay dismissal, and independent Toast timers are manual Tauri checks; do not pretend these are covered by `node --test` without a DOM implementation.
5. Verify batch deletion awaits `modal.confirm(...)`, exits before deletion on false or notification failure, and migration completion awaits `modal.alert(...)` before `location.reload()`. Verify summary notification failure is caught, logged, and still reloads rather than entering migration-failure handling.
6. Verify `#import_tip` remains in list refresh/import and migration long-task paths.
7. Verify both themes define every new token; list, flip reader, and scroll reader CSS consume intended tokens; `listpage.css` no longer references `--alert-color` or Phase 1 replaced hard-coded colors.
8. Verify `./js/ui/component/modal.js` exists in Service Worker `resourceList`.

Run:

```bash
node --test scripts/test-ui-phase1.mjs
npm test
```

After `sw.js` changes, run:

```bash
node scripts/update-sw-version.mjs
npm test
```

Existing Service Worker resource tests must accept both resource presence and version hash.

### Manual regression

In `npm run tauri:dev`, verify:

- English, Simplified Chinese, and Traditional Chinese display localized Phase 1 text.
- Single import, folder refresh, migration import, and migration export retain `#import_tip` progress behavior and clean up after completion/failure.
- Batch deletion: zero selection stays disabled; cancel does not delete source files or bookshelf records; confirm preserves existing physical-file-first semantics and refreshes bookshelf.
- Backup/restore, configuration/font errors, migration export/import, and migration conflicts retain prior behavior with localized feedback.
- Migration success shows complete summary before reload; failure hides progress UI and does not reload.
- IndexedDB open failure still rejects storage operations and never becomes a synchronous error because notification host is unavailable.
- Light/dark themes render Modal, Toast, progress overlay, batch UI, selection state, danger action, flip metadata, and scroll metadata with defined theme colors.
