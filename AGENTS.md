# Agent Behavior & Project Guidelines (`AGENTS.md`)

This document defines the core guidelines and operational instructions for Cursor agents working on the **import2gmap Chrome Extension** codebase.

---

## 1. Canon TDD & Implementation Phase Test Plan Maintenance

- **Canon TDD Adoption**: All feature development MUST follow **Canon TDD**.
- **Timing of Test Plan**:
  - Test Plans (Test Lists) are **NOT required during requirements analysis, domain modeling discussion, or architectural design**.
  - When entering the **code implementation phase**, the agent MUST create and maintain a **Test Plan (Test List)** right before writing test code and production code.
- **Cycle Steps**:
  1. Create/Update **Test Plan** right before writing code for the feature.
  2. Write 1 failing test (**Red**).
  3. Write minimal implementation to pass (**Green**).
  4. Refactor code and update Test Plan (**Refactor**).

---

## 2. Skill Utilization Across Development Phases

- **Phase-Driven Skill Activation**: During each development phase, proactively consult and adhere to the corresponding custom skills defined under `.cursor/skills/`:
  - **Canon TDD (`tdd-webextension`)**: Apply prior to coding in the implementation phase for Test Plan maintenance and the Red-Green-Refactor cycle.
  - **DDD Architecture (`ddd-architecture`)**: Apply when designing entities, value objects, use cases, and layer boundaries.
  - **Chrome Extension (`typescript-webextension` / `chrome-extension-development`)**: Apply when implementing Manifest V3, TypeScript, service workers, content scripts, and extension UI.
  - **Google My Maps Web Import (`google-my-maps-web-import`)**: Apply when implementing My Maps Web UI automation (with `gis-kml-conversion`).
  - **ADR Documentation (`adr-documentation`)**: Apply when documenting major architectural decisions, technical trade-offs, and design rationales under `docs/explanation/adr/`.

---

## 3. Implementation Baseline (ADR-0003 / ADR-0004)

Agents MUST follow accepted ADRs and the decision checklist:

- [ADR-0003](docs/explanation/adr/0003-chrome-extension-my-maps-web-import.md) — MV3 extension, extract fields, My Maps Web UI import, privacy, explicit failure.
- [ADR-0004](docs/explanation/adr/0004-extension-implementation-baseline.md) — permissions/injection, stepped UX, npm+Vite+Vitest, `chrome.storage.session` handoff, My Maps spike gate, extension-only repo.
- [ADR-0005](docs/explanation/adr/0005-extract-collections-for-future-pin-styling.md) — extract collections/labels now; pin colors deferred.
- [Decision checklist](docs/explanation/chrome-extension-decision-checklist.md) — status table for accepted vs deferred items.

Do not reintroduce Android/Gradle app code, Drive API/OAuth token flows, or always-on broad host access unless a new ADR supersedes these decisions.

---

## 4. Code Simplicity & Clarity (KISS Principle)

- **Prioritize Simplicity**: Strive for **concise, straightforward, and readable** code implementations. Avoid over-engineering, unnecessary abstractions, or overly clever trickery.
- **Clear Intent & Naming**: Use self-explanatory naming for domain models, state variables, and functions so that the codebase remains easy to follow and maintain.
- **Focused Responsibilities**: Keep functions, domain classes, and extension UI components short, modular, and focused on a single responsibility.
