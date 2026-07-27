---
name: tdd-webextension
description: Canon TDD for Chrome extension domain, content-script, and popup behavior.
---

# Canon TDD for Chrome Extensions

- Create and maintain a Test Plan immediately before implementation.
- Work Red, Green, Refactor one behavior at a time.
- Use pure TypeScript unit tests (Vitest) for KML and state; use sanitized HTML fixtures under `test/fixtures/tabelog/` ([html-fixture-policy](../../../docs/reference/html-fixture-policy.md)); test popup/content-script boundaries separately.
- Follow [ADR-0004](../../../docs/explanation/adr/0004-extension-implementation-baseline.md) toolchain defaults (npm + Vite + Vitest).
