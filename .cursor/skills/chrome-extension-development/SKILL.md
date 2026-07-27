---
name: chrome-extension-development
description: Build desktop Chrome extensions with Manifest V3 and TypeScript (service worker, content scripts, popup/options, permissions, messaging). Use when implementing or scaffolding the extension, editing manifest.json, wiring entries, or choosing host permissions.
---

# Chrome Extension Development (MV3 + TypeScript) (`chrome-extension-development`)

Develop the extension in **TypeScript**, bundle to JS, and run as a **Manifest V3** desktop Chrome extension. Apply `typescript-webextension` for language/typing rules.

**Normative defaults**: [ADR-0004](../../../docs/explanation/adr/0004-extension-implementation-baseline.md) and the [decision checklist](../../../docs/explanation/chrome-extension-decision-checklist.md).

## Manifest V3 essentials

- `manifest_version: 3`
- Background: **service worker** (`background.service_worker`)
- v1: **no** always-on `content_scripts`; inject with `chrome.scripting.executeScript` after user action
- Permissions: `storage`, `activeTab`, `scripting`
- `optional_host_permissions`: narrow Tabelog + Google Maps / My Maps hosts (request at flow start)
- All executable code is **packaged**; no remote code

Example shape (paths are build outputs):

```json
{
  "manifest_version": 3,
  "name": "import2gmap",
  "version": "0.1.0",
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup.html" },
  "permissions": ["storage", "activeTab", "scripting"],
  "optional_host_permissions": [
    "https://tabelog.com/*",
    "https://www.google.com/maps/*"
  ]
}
```

## TypeScript project layout (suggested)

```text
src/
  background/     # service worker entry
  content/        # site adapters (Tabelog extract, My Maps import)
  popup/          # stepped UI: extract → confirm → import
  domain/         # pure TS (shops, sanitizers, KML) — no chrome/DOM
  messaging/      # shared message union + guards
dist/             # bundled outputs referenced by manifest
manifest.json
```

- Toolchain: **npm + Vite + Vitest** (ADR-0004).
- One bundler entry per context (worker, each content script, popup).
- Domain code is imported by content/background but never imports them.

## UX & data (v1)

- Popup-only entry (no in-page extract chrome). See `docs/reference/extension-ui-specifications.md`.
- Flow: ready → extracting → **extract_complete** → (Next) confirm → Import start.
- Confirm: shop count + collection count + editable map name (default `食べログ保存リスト YYYY-MM-DD`).
- Extract results in `chrome.storage.session`; KML built in memory at import.
- Progress + cancel during pager crawl; explicit error codes + retry.

## Context responsibilities

| Context | Does | Does not |
| :--- | :--- | :--- |
| Service worker | Orchestrate flows, session storage, tab targeting, message hub | Touch page DOM |
| Content script | DOM read/write on allowed hosts after injection | Hold long-lived secrets |
| Popup | User intent, confirm, status | Assume tab DOM without messaging |

## Messaging & errors

- Typed message union (`typescript-webextension`): start / progress / result / error / cancel.
- Selector/UI mismatch → typed error; no silent partial success for a “full list” import.
- Bounded waits/timeouts; My Maps import blocked until spike pass criteria in ADR-0004.

## Security

- Sanitize extracted strings before KML/UI.
- Validate URLs with allowlists.
- No `cookies` API; no `<all_urls>`.

## Local dev loop

1. `npm run build` (or watch) → `dist/`
2. `chrome://extensions` → Load unpacked → folder with `manifest.json`
3. Reload extension after rebuild; re-inject / refresh target tabs as needed

## Related skills

- `typescript-webextension` — TS/strict typing/messages
- `tdd-webextension` — Canon TDD
- `web-scraping-dom-parsing` — Tabelog PC list extract
- `google-my-maps-web-import` — My Maps Web UI import
- `gis-kml-conversion` — KML generation
