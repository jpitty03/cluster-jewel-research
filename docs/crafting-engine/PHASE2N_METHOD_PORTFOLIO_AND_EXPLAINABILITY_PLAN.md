# Phase 2N: Method Portfolio, On-Demand Family Solving & Result Explainability

## 1. Problem Statement & Context

Currently, the optimizer produces a single primary recommended policy along with basic Harvest comparison and Pareto alternative summaries. However, players frequently ask:
- *"What is the best way to craft this purely using Alterations and Regals?"*
- *"What is the best way to craft this if I use Harvest reforges?"*
- *"What if I self-fracture mod X vs mod Y?"*
- *"Why was Harvest not recommended over Alterations?"*
- *"Can I export the exact shopping list and step-by-step instructions?"*

Phase 2N implements a formal **Method Portfolio** framework that models, solves, compares, and explains the major crafting methodologies on-demand while reusing the solver's retained transition graphs to keep response times fast.

---

## 2. Proposed Architecture & Changes

### 2.1 Domain & Specification Layer
#### [NEW] `crafting-engine/src/domain/MethodFamily.ts`
- Define `MethodFamilyKind`:
  - `'OPEN'` (All modeled actions compete)
  - `'CONVENTIONAL'` (Clean start; Transmute/Alt/Aug/Regal/Exalt/Annul/Scour)
  - `'HARVEST'` (Clean start with mandatory Harvest reforge downstream)
  - `'SELF_FRACTURE'` (Synthesized self-fracture start for a specific target mod + conventional downstream)
  - `'SELF_FRACTURE_HARVEST'` (Synthesized self-fracture start + Harvest downstream)
  - `'CHAOS_REFORGE'` (Chaos orb rerolling where applicable)
- Define `MethodFamilySpec`:
  - `id`: string
  - `name`: string
  - `description`: string
  - `allowedActionIds`: string[] | null (null = unconstrained)
  - `requiredActionIds`: string[] | null
  - `forcedAcquisitionType`: 'CLEAN' | 'SELF_FRACTURE' | 'OPEN'
  - `targetFractureModId`?: string
- Define `MethodFamilyResult`:
  - `spec`: `MethodFamilySpec`
  - `status`: `'SELECTED_WINNER'` | `'MORE_EXPENSIVE'` | `'DOMINATED'` | `'NOT_ELIGIBLE'` | `'UNRESOLVED_AT_BUDGET'` | `'NOT_MODELED'`
  - `route`?: `RouteSummary`
  - `craftPlan`?: `CraftPlanSummary`
  - `materialsSummary`?: Record<string, number>
  - `whyNotSelectedExplanation`?: string

---

### 2.2 Solver & Service Layer
#### [MODIFY] `crafting-engine/src/service/optimizerService.ts`
- Add `solveMethodPortfolio(input: OptimizeCraftInput, familySpecs?: MethodFamilySpec[])`:
  - Evaluates each method family by applying action constraints to the search space.
  - Reuses transition distributions from the primary search pass to minimize computation.
  - Automatically identifies feasible self-fracture targets from `target.requiredMods`.
  - Determines Harvest eligibility from target mod tags and price book availability.
  - Generates deterministic `whyNotSelectedExplanation` for non-winning families (e.g. `+142c more expensive than Alteration route`, `Requires Caster tag which no target mod possesses`, `Dominated across both currency and physical actions`).
  - Deduplicates families if two constraint sets resolve to the identical policy signature.
- Attach `methodPortfolio: MethodFamilyResult[]` to `OptimizeCraftResult`.

---

### 2.3 UI & Player Experience
#### [MODIFY] `src/CraftOptimizer.tsx`
- **Method Portfolio Card**:
  - Grid of executable method cards:
    1. *Recommended Winner* (highlighted)
    2. *Conventional Alt/Regal Route*
    3. *Harvest Reforge Route* (if eligible)
    4. *Self-Fracture Routes* (one card per target mod)
    5. *Mixed Fracture + Harvest* (if eligible)
  - Each card displays:
    - Status badge (`Recommended`, `+45c (+22%)`, `Dominated`, `Not Eligible`)
    - Cost, physical actions, manual time, and proof confidence
    - "Why not selected?" explanation
    - Button to expand detailed step-by-step craft plan for that specific method
- **Export & Guide Tools**:
  - **Copy Shopping List**: Formatted currency/material requirements (e.g. `~145 Alterations, ~12 Regals, ~2 Exalts, 1 Clean Base`).
  - **Copy Craft Guide**: Markdown/Plain-text branch-aware instruction steps.
  - **Export JSON**: Complete setup + snapshot bundle for 100% reproducible sharing.

#### [MODIFY] `src/App.css`
- Styling for method portfolio grid, family status tags, why-not-selected callouts, and export toolbar.

---

## 3. Verification Plan

### Automated Diagnostics (Deterministic & Clean)
- `scripts/developerUiPhase2nDiagnostic.ts`:
  - **N1**: Open policy matches Phase 2M recommendation.
  - **N2**: Conventional family correctly excludes Harvest and fracture.
  - **N3**: Harvest family enforces on-policy Harvest actions and correctly reports tags used.
  - **N4**: Self-fracture family generates distinct sub-routes for each eligible required modifier.
  - **N5**: "Why not selected?" strings are deterministic and mathematically honest.
  - **N6**: Method deduplication removes duplicate policy signatures.
  - **N7**: Graph and transition reuse verified across on-demand family solves.
- `scripts/browserPhase2nSmoke.ts`:
  - Browser verification of method cards, tab/plan switching, and copy/export functionality.
- `npm run lint` and `npm run build`: Zero errors/warnings.
