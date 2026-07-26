# Agent Behavior & Project Guidelines (`AGENT.md`)

This document defines the core guidelines and operational instructions for Antigravity agents working on the **import2gmap Android App** codebase.

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

- **Phase-Driven Skill Activation**: During each development phase, proactively consult and adhere to the corresponding custom skills defined under `.gemini/skills/`:
  - **Canon TDD (`tdd-android`)**: Apply prior to coding in the implementation phase for Test Plan maintenance and the Red-Green-Refactor cycle.
  - **DDD Architecture (`ddd-architecture`)**: Apply when designing entities, value objects, use cases, and layer boundaries.
  - **Kotlin & Jetpack (`kotlin-jetpack` / `android-app-development`)**: Apply when implementing modern Kotlin code, Coroutines, Flow, and Jetpack Compose UIs.
  - **ADR Documentation (`adr-documentation`)**: Apply when documenting major architectural decisions, technical trade-offs, and design rationales under `docs/explanation/adr/`.

---

## 3. Code Simplicity & Clarity (KISS Principle)

- **Prioritize Simplicity**: Strive for **concise, straightforward, and readable** code implementations. Avoid over-engineering, unnecessary abstractions, or overly clever trickery.
- **Clear Intent & Naming**: Use self-explanatory naming for domain models, state variables, and functions so that the codebase remains easy to follow and maintain.
- **Focused Responsibilities**: Keep functions, domain classes, and Compose composables short, modular, and focused on a single responsibility.
