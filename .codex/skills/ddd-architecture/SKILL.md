---
name: ddd-architecture
description: Guidelines and architectural design patterns for Domain-Driven Design (DDD) and Clean Architecture in TypeScript Chrome extension development.
---

# Domain-Driven Design (DDD) & Clean Architecture Skill (`ddd-architecture`)

This skill outlines the core principles and design guidelines for implementing **Domain-Driven Design (DDD)** combined with **Clean Architecture** in application development.

## Layer Structure & Boundary Principles

1. **Domain Layer (Pure Core)**
   - **Entities & Value Objects**: Pure TypeScript representing the business concepts, attributes, and invariants.
   - **Domain Events / Service**: Encapsulates business logic that spans multiple entities or doesn't belong to a single entity.
   - **Repository Interfaces**: Abstract interface definitions defining data access contracts needed by domain logic.
   - **Rule**: Absolutely zero dependencies on Chrome extension APIs, DOM, UI frameworks, storage backends, or third-party frameworks.

2. **Use Case / Application Layer**
   - Orchestrates domain objects to execute specific business workflows.
   - Inputs/Outputs: Uses DTOs or Domain Models to communicate across layers.
   - Pure business orchestrations without UI or browser details.

3. **Infrastructure Layer**
   - Implements Repository Interfaces (e.g., `chrome.storage`, KML builders, content-script DOM adapters, messaging bridges).
   - Maps raw storage / DOM / message payloads into Domain Entities.

4. **UI / Presentation Layer**
   - Consumes Use Cases / Domain States.
   - Converts Domain Entities into popup / options / content-script UI state.

## Key Implementation Guidelines
- **Ubiquitous Language**: Standardize term definitions across domain code, tests, and task descriptions.
- **Immutability**: Prefer immutable domain entities (`readonly` fields, frozen objects, or copy helpers).
- **Fail Fast / Validation**: Enforce invariant validation inside Value Objects / Entities (e.g., throw on invalid construction).
