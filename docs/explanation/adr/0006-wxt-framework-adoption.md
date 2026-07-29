# ADR-0006: WXT Framework Adoption for Extension Development & Testing

- **Status**: Accepted
- **Date**: 2026-07-30
- **Authors**: User & Agent
- **Related**: [ADR-0003](0003-chrome-extension-my-maps-web-import.md), [ADR-0004](0004-extension-implementation-baseline.md), [decision checklist](../chrome-extension-decision-checklist.md)

## Context & Problem Statement

ADR-0004 selected npm + Vite + Vitest for the extension toolchain. As the project enters implementation and Canon TDD, entrypoint configuration (popup, background service worker, content scripts) and Web Extension API typing/bundling require standardized project conventions to prevent boilerplate drift and simplify test setup.

## Decision Drivers & Constraints

- Next-gen Web Extension development framework (WXT - `wxt.dev`).
- Native TypeScript, Vite, and Manifest V3 integration out of the box.
- Seamless Vitest integration with JSDOM / Happy-DOM for unit and parser tests.
- Support thin entrypoints under `entrypoints/` delegating domain logic to pure TypeScript modules under `src/`.

## Decision Outcome

- **Framework**: Use **WXT** (`wxt.dev`) as the core extension development, bundling, and testing framework for all development and testing phases.
- **Entrypoints**: Organise entrypoints using WXT conventions (`entrypoints/popup/`, `entrypoints/background.ts`, `entrypoints/tabelog.content.ts`, `entrypoints/mymaps.content.ts`).
- **Toolchain**: npm + WXT + Vite + Vitest.
- **DOM Test Environment**: JSDOM / Happy-DOM for Vitest unit testing of pure domain modules and parser functions using sanitized HTML fixtures.

## Consequences

- **Positive**: Standardized entrypoint structure, built-in MV3 bundling, automatic manifest generation, simplified Vitest setup with WXT mocks.
- **Trade-offs**: WXT conventions must be followed for project layout (`wxt.config.ts`, `entrypoints/`).
