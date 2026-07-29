# WXT Entrypoints & Configuration Specification

Reference for WXT configuration, entrypoints, permissions, and build/test commands for the **import2gmap Chrome Extension**.

Related: [wxt-architecture-design](../explanation/wxt-architecture-design.md), [ADR-0006](../explanation/adr/0006-wxt-framework-adoption.md).

---

## 1. WXT Project Configuration (`wxt.config.ts`)

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  // Manifest V3 definitions
  manifest: {
    name: 'import2gmap',
    description: '食べログの保存リストをGoogleマイマップへ自動インポートするChrome拡張機能',
    version: '1.0.0',
    manifest_version: 3,
    permissions: ['storage', 'activeTab', 'scripting'],
    optional_host_permissions: [
      'https://tabelog.com/*',
      'https://www.google.com/maps/*',
    ],
    action: {
      default_popup: 'entrypoints/popup/index.html',
      default_title: '保存リストを取り込む',
    },
  },
  
  // WXT Extension runner options (for local development)
  runner: {
    disabled: false,
    startUrls: ['https://tabelog.com/'],
  },
});
```

---

## 2. WXT Entrypoints Detail

| Entrypoint File | WXT Type | Role / Responsibility |
| :--- | :--- | :--- |
| `entrypoints/popup/index.html` | Popup HTML | Host markup for Chrome toolbar popup UI |
| `entrypoints/popup/main.ts` | Popup Script | Mount UI, attach event listeners, send/receive messages to background |
| `entrypoints/background.ts` | Service Worker | Orchestrate extract/import jobs, manage WXT session storage, request permissions |
| `entrypoints/tabelog.content.ts` | Content Script | Run DOM extraction on Tabelog PC saved-list pages (`tabelog.com`) |
| `entrypoints/mymaps.content.ts` | Content Script | Run Web UI automation on Google My Maps pages (`google.com/maps`) |

---

## 3. Storage Key Specifications (`wxt/storage`)

WXT storage keys follow the `area:key` naming convention:

| Key Name | Storage Area | Content |
| :--- | :--- | :--- |
| `session:import2gmap` | `chrome.storage.session` | Root session object (`SessionRoot`): `schemaVersion`, `uiStep`, `mapName`, `activeJob`, `extractResult`, `lastError` |

---

## 4. Development & Build Commands

```bash
# Development dev-server with auto-reload
npm run dev

# Run Vitest unit tests (Canon TDD)
npm test

# Build production bundle under .output/
npm run build
```
