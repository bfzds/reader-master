# UI Phase 1 Design

**Date:** 2026-08-05  
**Scope:** P0-1 through P0-3 from `docs/superpowers/plans/2026-08-05-ui-optimization-plan.md`

## Goal

Improve the renderer's visual and interaction consistency without changing reading behavior or the Tauri shell.

## Constraints

- Keep the active frontend in `app_unpacked/src/`.
- Preserve the existing MPL license headers.
- Keep plain ES modules and direct DOM manipulation.
- Keep the fixed `127.0.0.1:2333` runtime origin unchanged.
- Do not modify `artifacts/`, `asar_extracted/`, `node_modules/`, or `src-tauri/`.
- Replace user-facing native `alert()` and `confirm()` calls in the active frontend.
- Accessibility is out of scope. Do not add dedicated ARIA, screen-reader, keyboard-navigation, or accessibility acceptance requirements.

## Design

### Modal and toast

Add `app_unpacked/src/js/ui/component/modal.js` as the single UI notification entry point.

It exposes:

- `alert(message, options)` for blocking informational messages.
- `confirm(message, options)` returning `Promise<boolean>` for destructive or consequential actions.
- `toast(message, options)` for short non-blocking success and status messages.

The component creates one reusable modal host and one toast host under `document.body`. The modal uses an accessible `<dialog>` with a title, message, confirm/cancel buttons, `aria-modal`, Escape handling, and focus restoration. The toast host uses `role="status"` and `aria-live="polite"`. Existing migration-specific dialogs in `options.js` remain separate because they have custom multi-choice content.

Call sites in `listpage.js`, `options.js`, `configpage.js`, and `storage.js` import this component. User-facing strings are resolved before calling the component; errors are still logged with `console.error` or `console.warn` for diagnostics.

### Localization

Add all Phase 1 user-facing messages to `en.js`, `zh_cn.js`, and `zh_tw.js`. Use existing `i18n.getMessage(name, ...placeholders)` semantics. Dynamic messages use `{0}` placeholders or locale functions so counts and error details remain localized.

The new keys cover list refresh/import status, batch actions and confirmation, backup/restore results, migration messages, configuration errors, and modal button labels. No new UI-facing literal Chinese or English strings are added to page/data modules.

### Theme variables

Add matching variables to `light.css` and `dark.css` for:

- modal surface and text;
- batch action bar surface and text;
- secondary batch button border;
- danger action color;
- selected list item background;
- reader metadata text.

Update `listpage.css` and any affected reader CSS to consume variables. Remove the current batch-bar hard-coded colors and correct the existing `--alert-color` reference to the defined theme text variable.

### Batch action behavior

Keep the existing batch selection behavior. The batch action bar uses localized visible labels and disables deletion when no items are selected. Do not add accessibility-specific behavior as part of this phase.

## Files

Modify:

- `app_unpacked/src/index.html`
- `app_unpacked/src/js/page/list/listpage.js`
- `app_unpacked/src/js/data/options.js`
- `app_unpacked/src/js/page/config/configpage.js`
- `app_unpacked/src/js/data/storage.js`
- `app_unpacked/src/js/i18n/locale/en.js`
- `app_unpacked/src/js/i18n/locale/zh_cn.js`
- `app_unpacked/src/js/i18n/locale/zh_tw.js`
- `app_unpacked/src/css/theme/light.css`
- `app_unpacked/src/css/theme/dark.css`
- `app_unpacked/src/css/page/listpage.css`
- `app_unpacked/src/css/page/flipreadpage.css` if the reader metadata variable is defined there

Create:

- `app_unpacked/src/js/ui/component/modal.js`
- `scripts/test-ui-phase1.mjs`

## Testing

The focused Node test checks that all locale objects contain the same Phase 1 keys, dynamic messages format counts and errors, and active frontend modules contain no native `alert()` or `confirm()` calls. The modal behavior and visual states are verified manually in Tauri dev mode.

Manual regression covers bookshelf import, folder refresh, batch deletion, backup/restore, migration/config errors, and light/dark themes.
