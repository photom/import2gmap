---
name: wxt-webextension
description: Guidelines and best practices for Chrome Manifest V3 extension development using the WXT framework, Vite, TypeScript, and Vitest.
---

# WXT Web Extension Development Guidelines

This skill provides guidelines for developing, structuring, and testing Chrome Manifest V3 extensions using **WXT** (Next-gen Web Extension Framework).

---

## 1. Core Principles

- **WXT Framework**: Use WXT (`wxt.dev`) for building, bundling, entrypoint management, and dev server.
- **TypeScript First**: Strict TypeScript for all entrypoints, domain logic, and typed messaging.
- **Manifest V3**: Declare permissions, background service worker, host permissions, and UI entrypoints in `wxt.config.ts` or entrypoint define functions.
- **Canon TDD with Vitest**: Test pure domain logic, parsers, and reducers with Vitest using sanitized HTML fixtures before wiring WXT entrypoints.

---

## 2. Directory & Entrypoint Conventions

WXT uses directory-based entrypoints under `entrypoints/` or explicit config:

```text
entrypoints/
├── popup/
│   ├── index.html
│   └── main.ts
├── background.ts (or background/index.ts)
├── tabelog.content.ts (Content script for Tabelog saved list)
└── mymaps.content.ts (Content script for My Maps Web UI)
```

- Use `defineUnlistedScript`, `defineContentScript`, or `defineBackground` helper functions provided by `wxt/sandbox`.
- Keep entrypoints thin: delegate business logic, DOM parsing, storage access, and messaging handling to pure TypeScript modules under `src/` or `lib/`.

---

## 3. Configuration (`wxt.config.ts`)

Configure permissions, Vite plugins, and Vitest integration in `wxt.config.ts`:

```ts
import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'import2gmap',
    description: 'Import Tabelog saved lists into Google My Maps',
    version: '1.0.0',
    permissions: ['storage', 'activeTab', 'scripting'],
    optional_host_permissions: [
      'https://tabelog.com/*',
      'https://www.google.com/maps/*',
    ],
  },
  vite: () => ({
    // Vite configuration if needed
  }),
});
```

---

## 4. Testing with Vitest & WXT

- Test pure modules (parsers, KML builders, UI state reducers) in Vitest with JSDOM / Happy-DOM.
- Mock `chrome.*` / `browser.*` APIs at module boundaries when testing handlers.
- Keep fixtures sanitized under `test/fixtures/`.
