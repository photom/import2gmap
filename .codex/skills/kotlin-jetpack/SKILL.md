---
name: kotlin-jetpack
description: Modern Kotlin and Jetpack Compose practices including Coroutines, Flow, Navigation Compose, ViewModel, and Dependency Injection.
---

# Modern Kotlin & Jetpack Skill (`kotlin-jetpack`)

This skill provides code style, structural guidelines, and best practices for developing modern Android apps with **Kotlin** and **Jetpack Compose**.

## Core Stack & Standards

- **Kotlin Idioms**: Sealed interfaces/classes for UI States, value classes for type-safe IDs, extension functions, coroutines, `Flow` / `StateFlow`.
- **Jetpack Compose**:
  - Declarative UI components with stateless design.
  - State hoisting: Pass state down, events up.
  - Unidirectional Data Flow (UDF).
  - Material 3 theme design tokens, dark mode support, fluid layout responsiveness.
- **Asynchronous & Reactive**:
  - `viewModelScope` for coroutine lifecycle bound tasks.
  - `collectAsStateWithLifecycle()` in Compose screens for lifecycle-aware state consumption.
  - Structured concurrency using `coroutineScope`, `withContext`.
- **Dependency Injection**:
  - Hilt or Koin for dependency inversion and scoping (`@Singleton`, `@ViewModelScoped`).

## Architecture & Code Rules
- **State Definition**: Represent UI State as immutable sealed interfaces (`Sealed Interface UiState`).
- **Side Effects**: Use `LaunchedEffect`, `SideEffect`, or `DisposableEffect` explicitly and safely without leaking states.
- **Compose Performance**: Avoid heavy computations inside Recomposition scope; delegate to `derivedStateOf` or `ViewModel`.
