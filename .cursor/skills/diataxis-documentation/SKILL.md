---
name: diataxis-documentation
description: Guidelines for structuring and writing software project documentation based on the Diátaxis framework (Tutorials, How-To, Reference, Explanation).
---

# Diátaxis Documentation Skill (`diataxis-documentation`)

This skill establishes the documentation architecture for this project, adhering to the **Diátaxis** framework.

## The 4 Diátaxis Quadrants

```
                    LEARNING-ORIENTED
                          │
         Tutorials        │       Explanation
   (Learning by doing)    │   (Understanding concepts)
                          │
──────────────────────────┼──────────────────────────
                          │
       How-To Guides      │        Reference
   (Goal-oriented tasks)  │   (Information-oriented)
                          │
                    PROBLEM-ORIENTED
```

### 1. Tutorials (Learning-Oriented)
- **Goal**: Help beginners get started successfully.
- **Tone**: Encouraging, step-by-step, non-distracting.
- **Example File**: `docs/tutorials/quick-start.md` (Load the unpacked extension for the first time).

### 2. How-To Guides (Goal-Oriented)
- **Goal**: Guide users through completing a specific task.
- **Tone**: Direct, sequence of practical steps.
- **Example Files**:
  - `docs/how-to/extract-tabelog-bookmarks.md`
  - `docs/how-to/import-kml-via-my-maps-web.md`

### 3. Reference (Information-Oriented)
- **Goal**: Describe the machinery accurately and completely.
- **Tone**: Neutral, factual, structured.
- **Example Files**:
  - `docs/reference/extension-ui-specifications.md`
  - `docs/reference/tabelog-content-script-selectors.md`
  - `docs/reference/kml-data-schema.md`
  - `docs/reference/architecture-diagrams.md`

### 4. Explanation (Understanding-Oriented)
- **Goal**: Explain background, context, architectural decisions, and design choices.
- **Tone**: Discursive, analytical.
- **Example Files**:
  - `docs/explanation/adr/0003-chrome-extension-my-maps-web-import.md`
  - `docs/explanation/security-privacy-model.md`
