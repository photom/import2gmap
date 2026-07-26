---
name: tdd-android
description: Guidelines and best practices for Canon TDD (Test-Driven Development) in Android development, emphasizing Test Plan maintenance prior to coding, Red-Green-Refactor cycles, JUnit, MockK, and Compose Test.
---

# Canon Test-Driven Development (Canon TDD) Skill (`tdd-android`)

This skill outlines the workflow and practices for applying **Canon TDD** (as defined by Kent Beck) to Kotlin and Android application development.

## Core Principle: Canon TDD & Timing of Test Plan Maintenance

In Canon TDD, **maintaining a Test Plan (Test List) right before writing code (implementation phase) is a critical step.**
- **Note**: A Test Plan is **NOT required during requirements gathering, architecture design, or specification discussions**.
- It is created and maintained when transitioning into the **actual implementation phase** for a specific component or feature.

### Step-by-Step Canon TDD Workflow

1. **Step 0: Test Plan Maintenance (Right Before Implementation)**
   - Prior to writing test cases or production code for a feature, create and maintain a explicit **Test List (Test Plan)** covering expected behaviors, happy paths, edge cases, and error states.
   - Continuously update this list throughout coding (check off completed items, add newly discovered edge cases).

2. **Step 1: Red**
   - Pick **one** item from the Test Plan.
   - Write a small, clear, failing test that specifies the expected contract.
   - Confirm that the test fails for the right reason.

3. **Step 2: Green**
   - Write the simplest, minimal production code needed to make the test pass.
   - Do not write extra un-tested functionality.

4. **Step 3: Refactor**
   - Clean up code structure, duplication, and naming while keeping all tests passing.
   - Update the Test Plan (mark the item done, append any newly discovered scenarios).

---

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
