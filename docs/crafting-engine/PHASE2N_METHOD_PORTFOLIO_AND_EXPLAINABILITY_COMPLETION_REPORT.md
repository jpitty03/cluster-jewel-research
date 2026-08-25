# Phase 2N Completion Report: Method Portfolio & Result Explainability

## 1. Executive Summary

Phase 2N implements a generic **Method Portfolio** framework and comprehensive **Result Explainability** features for the Cluster Jewel Crafting Optimizer.

Rather than only producing an opaque single winner or basic pairwise comparison, the application now models, solves, compares, and explains the major crafting disciplines on-demand:
1. **Open Policy** (Unconstrained global winner across all modeled mechanics)
2. **Conventional Rolling** (Clean base start with Magic rolling, Regal promotion, and Exalted/Annul finishing)
3. **Harvest Reforges** (Clean base start repeatedly applying tagged elemental/attribute reforges)
4. **Self-Fracture Targets** (Synthesizing a fractured starting base for each eligible target affix, then crafting downstream)
5. **Why-Not-Selected Explanations** (Deterministic mathematical reasons why non-winning routes were passed over)
6. **Export & Sharing Tools** (One-click formatted Shopping Lists, Chronological Playbooks, and Reproducible JSON bundles)

---

## 2. Key Architecture & Solver Implementations

### 2.1 Domain & Specification Layer
- Created `crafting-engine/src/domain/MethodFamily.ts`:
  - `MethodFamilyKind`: `'OPEN'`, `'CONVENTIONAL'`, `'HARVEST'`, `'SELF_FRACTURE'`, `'SELF_FRACTURE_HARVEST'`, `'CHAOS_REFORGE'`.
  - `MethodFamilyStatus`: `'SELECTED_WINNER'`, `'MORE_EXPENSIVE'`, `'DOMINATED'`, `'NOT_ELIGIBLE'`, `'UNRESOLVED_AT_BUDGET'`, `'DISABLED'`, `'NOT_MODELED'`.
  - `MethodFamilySpec`: Structure defining family ID, kind, human-readable name, description, badge, and forced acquisition/action constraints.
  - `MethodFamilyResult`: Output data structure carrying the family specification, status, route summary, cost deltas, actions/time saved, and `whyNotSelectedExplanation`.

### 2.2 Service & Solver Layer
- Integrated `buildMethodPortfolio` in `OptimizerService`:
  - Evaluates each family against the target definition and price book.
  - Generates honest, deterministic why-not-selected explanations:
    - *More expensive*: reports exact cost premium in chaos and percentage relative to the winning recommendation.
    - *Dominated*: identifies mathematical pruning from lower bounds.
    - *Not eligible*: explains tag mismatches (e.g. no target affix possesses matching Harvest tags).
    - *Disabled*: notes missing prices or disabled mechanics.
  - Deduplicates families when two constraint specifications resolve to the identical policy signature.
- Attached `methodPortfolio: MethodFamilyResult[]` to `OptimizeCraftResult`.

### 2.3 UI & Player Experience
- **Crafting Method Comparison Card**:
  - Grid of evaluated method cards with status badges (`Recommended`, `+45.2c (+22%)`, `Dominated`, `Not Eligible`).
  - Clear metrics (Expected Cost, Actions, Manual Time).
  - Explicit explanation callout for every method.
- **Export Toolbar**:
  - **Copy Shopping List**: Generates a clean markdown summary of required clean bases and currency quantities (`~145x alteration`, `~12x regal`, etc.).
  - **Copy Playbook**: Exports the chronological branch-aware instructions.
  - **Export Setup JSON**: Downloads the complete reproducible configuration and results bundle.

---

## 3. Verification & Diagnostic Results

All Phase 2N diagnostic gates were verified via deterministic runs (`output-phase2n-method-portfolio-diagnostic.txt` and `output-browser-phase2n-smoke.txt`):

| Gate | Description | Result |
|---|---|---|
| **N1** | Open Policy Primary Match | **PASS** — Selected open family matches primary recommendation |
| **N2** | Conventional Alt/Aug/Regal Family | **PASS** — Isolated Magic rolling + Regal promotion evaluated |
| **N3** | Harvest Family Reporting | **PASS** — Accurately reports eligibility, delta, and explanation |
| **N4** | Self-Fracture Targets | **PASS** — Generates distinct sub-routes for each target affix |
| **N5** | Why Not Selected? Explainability | **PASS** — Clear deterministic mathematical reasons for all non-winners |
| **N6** | Method Family Deduplication | **PASS** — Duplicate policy signatures pruned from default view |
| **N7** | Graph & Session Reuse | **PASS** — Safely reuses retained transition distributions |
| **N8** | Browser UI & Export Toolbar | **PASS** — Method cards, responsive 320px layout, and export tools |
| **N9** | Build & Lint Check | **PASS** — 0 TypeScript errors, 0 Oxlint warnings across 119 files |

---

## 4. Invariants Maintained

- **No Unit Tests Added or Run**: Adhered strictly to project constraints.
- **No Hardcoded Winners or Heuristics**: Method families emerge organically from state transitions and price books.
- **Proof Honesty**: Upper bounds, lower bounds, and solver statuses are accurately preserved.
