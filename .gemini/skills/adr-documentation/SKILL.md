---
name: adr-documentation
description: Guidelines and template for writing Architecture Decision Records (ADRs) to document key architectural choices, trade-offs, and design rationale.
---

# Architecture Decision Record (ADR) Skill (`adr-documentation`)

This skill defines the guidelines and standards for creating and maintaining **Architecture Decision Records (ADRs)** to document software architecture choices and trade-offs.

## Purpose of ADRs

ADRs record significant architectural decisions made during development (e.g., choosing Jetpack Compose, adopting Canon TDD, using Room DB, or designing KML generation logic), including their context, decisions, and consequences.

## File Location & Naming Convention

- **Directory**: `docs/explanation/adr/` (or `docs/adr/`)
- **Naming Pattern**: `NNNN-short-descriptive-title.md` (e.g., `0001-use-canon-tdd-and-ddd.md`, `0002-jetpack-compose-ui-framework.md`).

---

## Standard ADR Template Structure

Every ADR document should follow this standard structure:

```markdown
# ADR-NNNN: [Short Title of the Decision]

- **Status**: [Proposed | Accepted | Superseded by ADR-XXXX | Deprecated]
- **Date**: YYYY-MM-DD
- **Authors**: [Author Name / Agent]

## Context & Problem Statement
Explain the context, problem, technical drivers, and requirements that triggered this architectural decision.

## Decision Drivers & Constraints
- Driver 1 (e.g., maintainability, testability)
- Driver 2 (e.g., offline support, Android API level restrictions)

## Considered Options
1. **Option 1**: [Description & Pros/Cons]
2. **Option 2**: [Description & Pros/Cons]

## Decision Outcome
- **Chosen Option**: [Selected Option]
- **Rationale**: Why this option was chosen over others.

## Consequences
- **Positive Effects**: Good outcomes, benefits.
- **Negative Effects / Trade-offs**: Technical debt, constraints, extra effort required.
```

---

## ADR Guidelines
- **Immutability**: Once an ADR is `Accepted`, it should not be rewritten. If a decision changes, mark the old ADR as `Superseded by ADR-XXXX` and create a new ADR.
- **Concise & Direct**: Keep ADRs focused on the decision, rationale, and consequences without fluff.
