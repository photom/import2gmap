---
name: react
description: React usage guidelines for the import2gmap popup UI (WXT + @wxt-dev/module-react). Use when writing or reviewing popup components, hooks, or state wiring under entrypoints/popup/.
---

# React for the Popup UI (`react`)

Normative choice: [ADR-0007](../../../docs/explanation/adr/0007-wxt-react-popup-ui-framework.md) (WXT + React, popup-only). UI flow: [extension-ui-design](../../../docs/explanation/extension-ui-design.md), [UI spec](../../../docs/reference/extension-ui-specifications.md).

## Scope

- React is used **only** in `entrypoints/popup/` (via `@wxt-dev/module-react`, configured through `modules: ['@wxt-dev/module-react']` in `wxt.config.ts`).
- Content scripts (`tabelog.content.ts`, `mymaps.content.ts`) and the background service worker stay plain TypeScript — no React there.
- Do not introduce a state-management library (Redux, Zustand, etc.); popup state is driven by `src/application/ui-state-store.ts` and the session/messaging protocol.

## Component model

- Functional components + hooks only. No class components.
- One component (or small component group) per `uiStep`: `ready`, `wrong_tab` / `wrong_tabelog_page`, `extracting`, `extract_complete`, `confirm`, `import_starting`, `error`. Render by switching on `uiStep`, not by conditionally hiding many components at once.
- Components are **presentation-only**: they read a `UiState` value and emit intents (`EXTRACT_START`, `NEXT`, `BACK`, `IMPORT_START`, `MAP_NAME_SET`, …). All business logic, validation, and messaging stays in `src/application` / `src/domain` per the `ddd-architecture` skill — never fetch, parse, or validate inside a component body.
- Prop and state types come from the shared domain/application types (`UiStep`, `StoredExtractResult`, error codes) — do not redeclare parallel shapes in the UI layer.

## Hooks

- `useState` only for local, non-domain UI concerns (e.g. a controlled input's transient value before commit).
- Prefer a single custom hook (e.g. `usePopupState()`) that wraps messaging to the background worker and exposes `{ state, dispatch }`; keep `App.tsx` a thin composition root over that hook plus the per-step components.
- Avoid `useEffect` for anything expressible as a direct message call in response to a user action; when needed (e.g. requesting initial `GET_UI_STATE` on mount), keep effects small and single-purpose.

## Styling & assets

- Keep CSS scoped per-file (`App.css`, `style.css`) as scaffolded; no CSS-in-JS library.
- Popup surface is small — avoid heavy component libraries; plain semantic HTML + minimal CSS is sufficient for the stepped flow.

## Typing

- `tsconfig.json` already sets `"jsx": "react-jsx"` — no manual `React` import needed for JSX (only import `React` when using a named export like `React.StrictMode`).
- No `any` props; strict TypeScript per `typescript-webextension` skill.
- Type message payloads sent from components against the shared `ExtensionMessage` union — never construct ad hoc objects inline for `sendMessage`.

## Testing

- Test popup components with Vitest + `@testing-library/react` (add as a dev dependency when component tests are introduced) and jsdom, per `tdd-webextension`.
- Test each `uiStep` render + the intents it emits (e.g. `confirm` step calls `dispatch({ type: 'IMPORT_START' })` on button click) rather than snapshotting full markup.
- Do not test React components for DOM-extraction or KML logic — those stay in pure domain unit tests under `test/domain/`.

## Forbidden

- Business logic, `chrome.*` / `wxt/browser` calls, or storage reads directly inside components — go through the application layer.
- Global/ambient state outside the `UiState` derived from the worker.
- Adding React (or any UI framework) to content scripts or the background worker.
