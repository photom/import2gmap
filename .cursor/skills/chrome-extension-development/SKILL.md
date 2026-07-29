---
name: chrome-extension-development
description: Normative baseline and guidelines for Manifest V3 Chrome Extension development using WXT framework, TypeScript, and Vitest.
---

# Chrome Extension Development Guidelines

This skill provides guidelines and decision criteria for developing the Manifest V3 extension with **WXT** (`wxt.dev`), TypeScript, and Vitest.

---

## 1. Core Principles

- **Manifest V3 Architecture**: Background Service Worker (`entrypoints/background.ts`), Popup UI (`entrypoints/popup/`), and Content Scripts (`entrypoints/*.content.ts`).
- **WXT Framework (`wxt.dev`)**: Standardized entrypoint structure, automatic MV3 bundling, and `wxt/storage` / `wxt/browser` integration.
- **Minimal Permissions**: Use `storage`, `activeTab`, `scripting`, and `optional_host_permissions` requested on user action. No `cookies`, no broad `<all_urls>`, no remote code.
- **Privacy & Security**: Zero credential/cookie scraping; user-initiated actions only; sanitize all extracted DOM strings.
- **Explicit Failure**: Selector mismatch, structure drift, or count discrepancies must trigger explicit error codes (no fake partial success).

---

## 2. UX & Data Flow (v1)

- **Entry Point**: Action popup only (no in-page Floating UI / injected buttons on Tabelog).
- **Stepped Flow**: `ready` → `extracting` → `extract_complete` → (Next) `confirm` → `import_starting`.
- **Confirm Screen**: Unique shop count + unique collection catalog count + user-editable map name (default `食べログ保存リスト YYYY-MM-DD`).
- **Data Handoff**: `chrome.storage.session` via WXT `storage` API (`session:import2gmap`).
- **KML Generation**: In-memory OGC KML 2.2 string/Blob generation at import time; no disk export UI in v1.
- **Progress & Cancel**: Supports progress updates and cancellation during pager crawl; supports explicit error code displays and step retries.

---

## 3. Implementation Baselines (ADRs)

- [ADR-0003](file:///home/sthin/work/import2gmap/docs/explanation/adr/0003-chrome-extension-my-maps-web-import.md): MV3 desktop extension, extract fields, in-memory KML, My Maps Web UI import, privacy first.
- [ADR-0004](file:///home/sthin/work/import2gmap/docs/explanation/adr/0004-extension-implementation-baseline.md): Minimal permissions, stepped UX, WXT + Vitest toolchain, session storage, My Maps feasibility gate.
- [ADR-0005](file:///home/sthin/work/import2gmap/docs/explanation/adr/0005-extract-collections-for-future-pin-styling.md): Extract collections/labels now into structured model; pin colors deferred.
- [ADR-0006](file:///home/sthin/work/import2gmap/docs/explanation/adr/0006-wxt-framework-adoption.md): WXT framework adoption for development, bundling, and testing.
