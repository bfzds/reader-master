# Remove Unused Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the unused install and auxiliary help entries from the settings page.

**Architecture:** The settings page is rendered from `options.js`, so removing the matching option groups removes their UI and click handlers. Static help files and Service Worker cache entries remain unchanged.

**Tech Stack:** Native ES modules, Node `node:test`.

## Global Constraints

- Remove only the requested settings entries.
- Keep `app_unpacked/src/help/` files and `sw.js` resources.
- Do not add dependencies or change application data formats.

---

### Task 1: Remove the settings entries

**Files:**
- Create: `scripts/test-unused-config-options.mjs`
- Modify: `app_unpacked/src/js/data/options.js`

- [ ] Write a failing test that rejects the install group and the three auxiliary help pages in the option registry.
- [ ] Run `node --test scripts/test-unused-config-options.mjs` and confirm it fails against the current registry.
- [ ] Remove the `app_install` group and the Credits, Privacy, and About `WebpageConfigOption` entries.
- [ ] Run `node --test scripts/test-unused-config-options.mjs` and confirm it passes.
- [ ] Run `npm run check:syntax` and `npm test`.
