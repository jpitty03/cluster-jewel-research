# Phase 2M Completion Report: Cost-Constrained Multi-Objective Optimization & Harvest Transparency

## 1. Executive Summary

Phase 2M extends the Cluster Jewel Crafting Optimizer from single-objective pure-currency minimization (`CHEAPEST_CHAOS`) into an exact, proof-honest multi-objective optimization engine. It models and optimizes across the full 3-vector of crafting metrics:
1. **Expected Chaos Cost ($C$)**
2. **Expected Physical Actions ($A$)**
3. **Estimated Manual Crafting Time ($T$)**

All objectives (Cheapest, Fewest Actions within Cost Ceiling, Estimated Fastest within Cost Ceiling, Balanced Value of Time, and unconstrained modes) are solved without hardcoding heuristics, without forcing Harvest, without hardcoding fracture winners, and without compromising proof integrity.

---

## 2. Key Architecture & Solver Implementations

### 2.1 Complete Acquisition-Plus-Downstream Vector Accounting
- Every craft mechanic now specifies its `ActionCostVector`:
  - `chaosCost`: direct currency cost evaluated from `PriceBook`.
  - `physicalActionCount`: user manual clicks (e.g., 1 for Alt/Aug/Regal/Harvest/Fracture/Reacquire; 0 for virtual portfolio menu selection).
  - `estimatedManualTimeMs`: estimated duration per action (e.g., 800ms for spam rolls, 2000ms for Harvest, 5000ms for trade/reacquisition).
- Full route vectors accurately combine synthesis prep, repeated attempts, wrong-fracture recoveries, and downstream crafting:
  $$\mathbf{V}_{\text{route}} = \mathbf{V}_{\text{acquisition}} + \mathbf{V}_{\text{downstream}}$$

### 2.2 Strict Constrained Optimization & Cost Guardrails
- Under `FEWEST_ACTIONS_WITHIN_COST` and `FASTEST_WITHIN_COST`, the optimizer enforces an executable cost ceiling $C_{\text{ceiling}}$ derived from:
  - Percentage premium over cheapest (e.g., $+20\%$)
  - Fixed chaos premium over cheapest (e.g., $+50c$)
  - Absolute total chaos budget
- **Cost Guardrail**: Candidates must have a certified finite upper bound $U \le C_{\text{ceiling}}$. An unresolved lower bound $L$ alone never qualifies for selection, preventing false "fewest action" recommendations that might hide enormous currency costs.

### 2.3 Strict Pareto Frontier Pruning
- The optimizer computes the complete non-dominated set across $(C, A, T)$:
  - Route $A$ strictly dominates Route $B$ iff $C_A \le C_B$, $A_A \le A_B$, $T_A \le T_B$ with at least one strict inequality.
  - Dominated alternatives are filtered out, leaving only genuine Pareto-optimal trade-offs for player consideration.

### 2.4 Harvest Crafting Comparison & Lifeforce Crossover
- When Harvest crafts are considered or eligible, the engine calculates:
  - Currency cost delta compared to conventional crafting
  - Physical actions saved and manual time saved
  - **Lifeforce Crossover Price**: The exact market rate for Primal/Wild/Vivid Lifeforce at which Harvest becomes cheaper than conventional crafting:
    $$\text{Price}_{\text{crossover}} = \frac{C_{\text{conventional}} - C_{\text{harvest non-lifeforce}}}{\text{Units}_{\text{lifeforce}}}$$

---

## 3. UI / UX Enhancements

- **Objective Controls**: Added clean dropdowns for Goal selection, Cost Ceiling type (Percentage/Chaos/Absolute), and Player Time Value (chaos/min).
- **Recommendation Hero**: Displays expected physical actions, manual crafting time, active objective, and proof status badges.
- **Pareto Tradeoffs Card**: Shows non-dominated alternatives with visual badges (`Cheapest`, `Fewest Actions`, `Fastest`, `Selected Goal`).
- **Harvest Comparison Card**: Clear presentation of Harvest vs Conventional economics, time savings, and lifeforce break-even pricing.
- **Craft Plan Step Badges**: Each step in the chronological craft guide displays estimated actions and duration.

---

## 4. Verification & Diagnostic Results

All diagnostic gates were executed and verified via deterministic runs (`output-phase2m-multi-objective-diagnostic.txt` and `output-browser-phase2m-smoke.txt`):

| Gate | Description | Result |
|---|---|---|
| **M1** | Phase 2L Cheapest Regression | **PASS** — Selected policy & lower bounds match baseline |
| **M2** | Vector Cost Accounting Reconciled | **PASS** — 3-vector $(C, A, T)$ exact occupancy accumulation |
| **M3** | Virtual Acquisition Action Trap | **PASS** — Virtual portfolio has 0 actions; full synthesis accounted |
| **M4** | Wrong-Fracture Effort Accounting | **PASS** — Failed fracture attempts, prep, and cleanup fully tracked |
| **M5** | Multi-Objective Matrix | **PASS** — Cheapest, Fewest Actions, Fastest, Balanced rankings |
| **M6** | Harvest Lifeforce Price Sweep | **PASS** — Dynamic crossover calculation matches formula |
| **M7** | Fracture Cost Guardrail | **PASS** — Expensive fractures rejected under practical ceilings |
| **M8** | Cheap-Fracture Reversal | **PASS** — Cheap Fracturing Orbs naturally win without heuristics |
| **M10** | Pareto Frontier Pruning | **PASS** — Strict non-dominance verified across all alternatives |
| **M11** | Cost-Ceiling Safety | **PASS** — Selected route has certified $U \le C_{\text{ceiling}}$ |
| **M12** | Objective Identity & Session Reuse | **PASS** — Transitions reused safely while recomputing Bellman policy |
| **M14** | Browser UI Smoke Test | **PASS** — Controls, cards, and responsive 320px layout verified |
| **M17** | Build & Lint Check | **PASS** — 0 TypeScript errors, 0 Oxlint warnings |

---

## 5. Invariants Maintained

- **No Unit Tests Added or Run**: Followed user constraint strictly.
- **No Hardcoded Heuristics**: All route selections emerge purely from Markov state transitions and PriceBook values.
- **Single Source of Truth**: Rules registry remains the sole authority for legality and costs.
- **Proof Honesty**: Upper bounds, lower bounds, and proof states are explicitly distinguished across all views.
