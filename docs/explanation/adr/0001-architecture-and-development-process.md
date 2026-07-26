# ADR-0001: Adoption of Canon TDD, DDD, and Clean Architecture with Jetpack Compose

- **Status**: Accepted
- **Date**: 2026-07-25
- **Authors**: Antigravity Agent & User Pair

## Context & Problem Statement

We are developing an Android application ("import2gmap") that extracts favorite restaurant data from Tabelog via WebView, converts it into KML format, and passes it to Google Maps via Android Intents.

To ensure high code quality, testability, maintainability, and clear separation of concerns, we need to select and establish standard architectural and development methodologies.

## Decision Drivers & Constraints

1. **Testability & Reliability**: Web scraping, DOM parsing, and KML generation require robust validation to prevent regressions when target HTML structures change.
2. **Domain Isolation**: Pure business logic (restaurant models, KML generation, validation) must not be tightly coupled with Android UI frameworks or WebViews.
3. **Simplicity & Maintainability**: Code should follow the KISS principle (Keep It Simple, Stupid) with self-documenting naming and minimal over-engineering.

## Considered Options

1. **Option 1: Traditional Monolithic Android App (Activity/Fragment + Direct Parsing)**
   - *Pros*: Quick initial prototype setup.
   - *Cons*: Difficult to unit test, high coupling between WebView JS injection and UI layer, hard to maintain.

2. **Option 2: Canon TDD + DDD + Clean Architecture + Jetpack Compose (CHOSEN)**
   - *Pros*:
     - **Canon TDD**: Requires maintaining a explicit Test Plan before any test or code execution, resulting in comprehensive test coverage and clear feature scope.
     - **DDD & Clean Architecture**: Separates pure Kotlin Domain logic from Infrastructure (WebView, File System) and Presentation (Jetpack Compose).
     - **Jetpack Compose**: Modern declarative UI framework providing unidirectional data flow (UDF) and reactive UI state management.
   - *Cons*: Slightly higher upfront setup effort for layer interfaces and Test Plan documentation.

## Decision Outcome

**Chosen Option**: **Option 2 (Canon TDD + DDD + Clean Architecture + Jetpack Compose)**

### Key Architectural Guidelines Accepted:

1. **Development Process (Canon TDD)**:
   - Always maintain and update a **Test Plan (Test List)** before writing tests or implementation code.
   - Strictly follow the **Red -> Green -> Refactor** cycle for each Test Plan item.

2. **Layer Responsibilities (DDD / Clean Architecture)**:
   - **Domain Layer**: Pure Kotlin models (`Restaurant`, `KmlDocument`, `TabelogUrl`), Value Objects, and Repository Contracts. No Android framework dependencies.
   - **Use Case / Application Layer**: Pure business workflows (e.g., `ParseTabelogBookmarkUseCase`, `ExportKmlUseCase`).
   - **Infrastructure Layer**: WebView JS injection, KML XML serializing, FileProvider storage implementations.
   - **Presentation Layer**: Jetpack Compose UI components consuming state from `ViewModel` via `StateFlow`.

3. **Code Style**:
   - Concise, readable Kotlin following modern idioms (sealed interfaces, immutability, coroutines, Flow).

## Consequences

- **Positive Effects**:
  - Domain and business logic can be tested 100% on local JVM in milliseconds without needing Android Emulators.
  - High confidence during refactoring due to mandatory Test Plan coverage.
  - Clear boundaries between UI controls, WebView logic, and KML file exports.
- **Negative Effects / Trade-offs**:
  - Requires disciplined Test Plan maintenance before initiating any new sub-feature.
