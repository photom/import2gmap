# Agent Behavior & Project Guidelines (`AGENT.md`)

This document defines the core guidelines and operational instructions for Antigravity agents working on the **Tabelog to Google Maps Android App** codebase.

---

## 1. Skill Utilization Across Development Phases

- **Phase-Driven Skill Activation**: During each development phase (e.g., domain modeling, unit testing, Compose UI building, web parsing, or security check), proactively consult and adhere to the corresponding custom skills defined under `.gemini/skills/`:
  - **DDD Architecture (`ddd-architecture`)**: Apply when designing entities, value objects, use cases, and layer boundaries.
  - **TDD Android (`tdd-android`)**: Apply during the Red-Green-Refactor testing cycle, writing unit tests and UI integration tests.
  - **Kotlin & Jetpack (`kotlin-jetpack` / `android-app-development`)**: Apply when implementing modern Kotlin code, Coroutines, Flow, and Jetpack Compose UIs.
- Check and update relevant skills whenever structural decisions or patterns evolve.

---

## 2. Code Simplicity & Clarity (KISS Principle)

- **Prioritize Simplicity**: Strive for **concise, straightforward, and readable** code implementations. Avoid over-engineering, unnecessary abstractions, or overly clever trickery.
- **Clear Intent & Naming**: Use self-explanatory naming for domain models, state variables, and functions so that the codebase remains easy to follow and maintain.
- **Focused Responsibilities**: Keep functions, domain classes, and Compose composables short, modular, and focused on a single responsibility.
