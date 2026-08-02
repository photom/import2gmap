# ADR-0007: WXT + React for Popup UI

- **Status**: Accepted
- **Date**: 2026-07-31
- **Authors**: User & Agent
- **Related**: [ADR-0004](0004-extension-implementation-baseline.md), [ADR-0006](0006-wxt-framework-adoption.md), [extension-ui-design](../extension-ui-design.md), [UI spec](../../reference/extension-ui-specifications.md)

## Context & Problem Statement

ADR-0006 adopted WXT as the extension development and testing framework but did not fix a UI library for the popup surface (steps: `ready` → `extracting` → `extract_complete` → `confirm` → `import_starting`, per the [UI spec](../../reference/extension-ui-specifications.md)). The popup needs declarative state-driven rendering across these steps, and WXT ships a first-party React module (`@wxt-dev/module-react`) that wires React + Vite + HMR into the entrypoint build with no extra config.

## Decision Drivers & Constraints

- Popup UI is a step-driven state machine (`UiStateReducer`, Module 4 of the [Phase 1 test plan](../../reference/test-plan-phase1.md)); a component model that re-renders from state is a better fit than manual DOM manipulation.
- Minimize custom build wiring by using WXT's official module system (`modules: ['@wxt-dev/module-react']` in `wxt.config.ts`) rather than a hand-rolled Vite React setup.
- Keep the popup a thin presentation layer: it must consume `src/application/ui-state-reducer.ts` and domain types without embedding business logic in components (per `ddd-architecture` skill).
- Avoid introducing a heavier framework (Vue, Svelte) with no other justification in this codebase.

## Considered Options

1. **WXT + React** (`@wxt-dev/module-react`): Official WXT module, TypeScript + JSX, familiar component/hooks model, first-party HMR support.
2. **Vanilla TypeScript + DOM APIs**: No framework dependency, smaller bundle, but manual re-rendering for every UI-state transition adds boilerplate and risks inconsistent DOM updates across the 7 popup steps.
3. **Vue or Svelte via WXT modules**: Also officially supported by WXT, but no existing project familiarity or requirement; would add an unnecessary second UI paradigm to learn.

## Decision Outcome

- **Chosen Option**: WXT + React (`@wxt-dev/module-react`).
- **Rationale**: React is already wired into the project scaffold (`wxt.config.ts` → `modules: ['@wxt-dev/module-react']`, `entrypoints/popup/App.tsx`, `main.tsx`) and is a first-party WXT integration, so it needs no additional build configuration. Its component/hooks model maps directly onto the popup's discrete `uiStep` states and keeps rendering declarative.
- **Scope**: React is used for the **popup UI only** (`entrypoints/popup/`). Content scripts (`tabelog.content.ts`, `mymaps.content.ts`) and the background service worker remain plain TypeScript with no UI framework, per the Clean Architecture layering in [wxt-architecture-design](../wxt-architecture-design.md).

## Consequences

- **Positive**: Zero extra build wiring (module handles Vite/JSX/HMR); popup components can subscribe directly to `ui-state-reducer.ts` output and re-render per step; consistent with WXT-recommended project conventions.
- **Trade-offs**: Adds `react` / `react-dom` as popup-only runtime dependencies and a small bundle-size cost versus vanilla DOM; popup components must still delegate all business logic to `src/application` / `src/domain` and stay presentation-only to preserve the Clean Architecture boundary.
