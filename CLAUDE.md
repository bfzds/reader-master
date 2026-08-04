# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development commands

- Install root dependencies for the Tauri shell: `npm install`
- Run the app in Tauri dev mode: `npm run tauri:dev`
- Build the Tauri desktop bundle: `npm run tauri:build`
- Run the root TXT directory test: `npm run test:toc`
- Run Rust tests for the Tauri shell: `cargo test --manifest-path src-tauri/Cargo.toml`
- Run a single Rust test when one exists: `cargo test --manifest-path src-tauri/Cargo.toml <test_name>`

## Testing reality in this repo

- `npm run test:toc` is the only JS test registered in the root package; additional Node tests exist under `scripts/test-*.mjs` but are run directly.
- There is no repository-level lint script or complete UI/e2e test suite.
- Most renderer changes are verified manually by running `npm run tauri:dev` and exercising the affected flow.
- If you only change Tauri Rust code, `cargo test --manifest-path src-tauri/Cargo.toml` is the available automated entry point.

## Source of truth

- Treat `app_unpacked/src/` as the live frontend source served by the current Tauri runtime.
- Treat `src-tauri/src/` as the only active desktop shell source.
- Treat `legacy/electron/` as historical reference only; it is not a current build target.
- Do **not** assume `asar_extracted/`, the top-level DLL/exe files, or the committed `node_modules/` tree are the primary place to make feature changes. Those are bundled/runtime artifacts or extracted references unless a task is explicitly about patching the packaged app.

## High-level architecture

### App shape

This repo is a desktop-packaged snapshot of tReader, not a minimal source-only web app. The active runtime is:

- **Tauri shell**: `src-tauri/src/main.rs`, `src-tauri/src/shell.rs`
- **Shared frontend**: `app_unpacked/src/index.html` + `app_unpacked/src/js/**`
- **Historical Electron**: `legacy/electron/`, reference only

开发时 `scripts/serve.cjs`、发布时 Tauri Rust shell 都在 `127.0.0.1:2333` 提供前端。固定 origin 对 IndexedDB/localStorage 很重要；host/port、CSP、静态路径校验或 Tauri command 修改时须同步检查两种运行模式和文档。

### Frontend structure

- `app_unpacked/src/index.html` contains the full DOM skeleton and `<template>` blocks for the app. This codebase does not use React/Vue/etc.; modules bind directly to existing DOM nodes.
- `app_unpacked/src/js/main.js` is the renderer bootstrap. It initializes i18n, then creates the top-level router with three pages:
  - `list`
  - `read`
  - `config`
- `app_unpacked/src/js/page/router.js` drives hash routing with `#!/...` URLs and persists the last visited route through config storage.
- `app_unpacked/src/js/page/**` contains page classes and reading subpages. The biggest entry points are:
  - `page/list/listpage.js` for bookshelf/import flows
  - `page/read/readpage.js` for the reading session orchestration
  - `page/config/configpage.js` for settings UI

When changing UI structure, update `index.html` and the corresponding `querySelector` / template usage in page or component modules in the same change.

### Persistence model

There are two separate persistence layers:

1. **Renderer data in IndexedDB** via `app_unpacked/src/js/data/storage.js`
   - database name: `reader`
   - stores: `content`, `index`, `config`, `list`, `source`
2. **Native app-data**
   - `app-config.json`: Tauri window size and maximized state
   - `import-folders.json`: native `folderId` to canonical import-directory registry

The domain wrapper for bookshelf data is `app_unpacked/src/js/data/file.js`. It handles book metadata, stored content, TOC/index data, source-file persistence, config export/import, and placeholder restoration.

`app_unpacked/src/js/data/config.js` is the config facade used across the UI. It supports async get/set, change listeners, and “expert config” parsing from a text blob.

### Text and EPUB pipeline

`app_unpacked/src/js/text/text.js` is the central book-ingestion pipeline. It is responsible for:

- detecting txt / gzip / epub inputs
- decoding text with multiple encoding fallbacks
- normalizing line endings and empty lines
- optional Chinese conversion
- TOC generation via worker
- exporting edited content back to `.txt` or simplified `.epub`

`app_unpacked/src/js/text/epub.js` converts EPUB content into plain text plus a resource map for embedded images. Edited EPUB export is intentionally lossy: it rebuilds a minimal EPUB from the current text content rather than preserving the original EPUB structure/layout.

### Platform abstraction boundary

Renderer code should not branch on native/browser details everywhere. The abstraction layer already exists in:

- `app_unpacked/src/js/platform/runtime.js`
- `app_unpacked/src/js/platform/window.js`
- `app_unpacked/src/js/platform/import-folder.js`

If you add or change a native capability, keep both layers aligned:

1. Tauri command implementation and validation in `src-tauri/src/main.rs`
2. renderer abstraction in `app_unpacked/src/js/platform/**`

For import folders, native commands must accept opaque `folderId` values rather than renderer-provided paths; update `import-folders.json` handling, source metadata and browser File System Access fallback together.

Window resizing and import-folder access already follow this pattern.

### Reading flow

`app_unpacked/src/js/page/read/readpage.js` is the coordinator for the active reading session. It loads the selected book, chooses flip vs scroll rendering, manages control/index/jump overlays, wires speech, and owns EPUB resource-loader lifecycle.

The read experience is split into smaller modules under `app_unpacked/src/js/page/read/`:

- `text/` for actual page rendering modes
- `index/` for TOC/bookmarks/search
- `speech/` for text-to-speech
- `control/` and `jump/` for overlays and navigation controls

## Repo-specific conventions

- Preserve the existing MPL license header blocks at the top of frontend JS/HTML files when editing them.
- Match the existing style: plain ES modules, direct DOM manipulation, minimal abstraction, and localized targeted changes.
- This repo includes a domestic mirror in the root Tauri scripts via `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR_TEMPLATE`; keep that intact unless the task is specifically about changing download strategy.
- Be careful with changes to the local server host/port, service worker behavior, or storage keys; those can affect persistence and startup behavior across the whole app.

## Manual verification targets

When there is no automated coverage for a change, verify the affected path in `npm run tauri:dev`, especially for changes involving:

- importing `.txt`, `.gz`, or `.epub`
- bookshelf refresh/import-folder flows
- reading modes (flip vs scroll)
- EPUB image/resource loading
- window size persistence
- config import/export or bookshelf restore behavior
