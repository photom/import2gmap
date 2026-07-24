---
name: tdd-android
description: Guidelines and best practices for Test-Driven Development (TDD) in Android application development using Kotlin, JUnit, MockK, Kotest, and Compose Test.
---

# Test-Driven Development (TDD) Skill (`tdd-android`)

This skill outlines the workflow and practices for applying **Test-Driven Development (TDD)** to Kotlin and Android application development.

## The TDD Cycle (Red - Green - Refactor)

1. **Red**: Write a small, failing unit test that describes the expected behavior/contract before writing production code.
2. **Green**: Write the minimal production code necessary to make the test pass.
3. **Refactor**: Clean up and optimize the code (structure, naming, duplication) while ensuring all tests remain green.

## Testing Strategy & Frameworks

### 1. Domain & Use Case Testing (Pure Kotlin Unit Tests)
- **Frameworks**: JUnit 5 / JUnit 4, Kotest / AssertJ, MockK / Fakes.
- **Rules**:
  - Fast execution (milliseconds). No Android dependency, runs directly on JVM.
  - Test pure logic, edge cases, domain validations, state transitions.
  - Prefer **Fake implementations** over heavy mock objects for repository contracts.

### 2. ViewModel & Presentation Testing
- **Frameworks**: `kotlinx-coroutines-test` (`StandardTestDispatcher`, `runTest`), `Turbine` for testing `StateFlow` / `Flow`.
- Test UI state emissions, user intent handlers, error mapping.

### 3. UI / Compose Integration Testing
- **Frameworks**: `androidx.compose.ui.test` (`createComposeRule`, `onNodeWithText`, `performClick`).
- Test user interaction flows, component rendering states (Loading, Success, Error).

## TDD Best Practices for Android
- **Name tests descriptively**: e.g., `givenInvalidUrl_whenParseRestaurant_thenThrowsInvalidUrlException`.
- **Single Responsibility**: Test one specific behavior or assertion per test case.
- **AAA Pattern**: Structure tests into clear `Given` (Arrange), `When` (Act), and `Then` (Assert) sections.
