---
name: ddd-architecture
description: Guidelines and architectural design patterns for Domain-Driven Design (DDD) and Clean Architecture in modern software / Android development.
---

# Domain-Driven Design (DDD) & Clean Architecture Skill (`ddd-architecture`)

This skill outlines the core principles and design guidelines for implementing **Domain-Driven Design (DDD)** combined with **Clean Architecture** in application development.

## Layer Structure & Boundary Principles

1. **Domain Layer (Pure Core)**
   - **Entities & Value Objects**: Pure Kotlin code representing the business concepts, attributes, and invariants.
   - **Domain Events / Service**: Encapsulates business logic that spans multiple entities or doesn't belong to a single entity.
   - **Repository Interfaces**: Abstract interface definitions defining data access contracts needed by domain logic.
   - **Rule**: Absolutely zero dependencies on UI frameworks (Android, Jetpack Compose), databases (Room, SQLite), or third-party frameworks.

2. **Use Case / Application Layer**
   - Orchestrates domain objects to execute specific business workflows.
   - Inputs/Outputs: Uses DTOs or Domain Models to communicate across layers.
   - Pure business orchestrations without UI details.

3. **Infrastructure Layer**
   - Implements Repository Interfaces (e.g., Room DB, Retrofit API client, KML parser, SharedPreferences).
   - Maps raw database entities / HTTP response models into Domain Entities.

4. **UI / Presentation Layer**
   - Consumes Use Cases / Domain States.
   - Converts Domain Entities into UI State models (StateFlow, Compose State).

## Key Implementation Guidelines
- **Ubiquitous Language**: Standardize term definitions across domain code, tests, and task descriptions.
- **Immutability**: Prefer immutable domain entities (`data class` with `val`) and copy operations.
- **Fail Fast / Validation**: Enforce invariant validation inside Value Objects / Entities (e.g., `require` block in `init`).
