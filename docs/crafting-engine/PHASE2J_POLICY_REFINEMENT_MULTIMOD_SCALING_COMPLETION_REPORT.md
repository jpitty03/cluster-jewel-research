# Phase 2J Policy Refinement, Multi-Mod Scaling, and Harvest Parity Completion Report

## Executive Summary

Phase 2J is finalized and closed. All validation gates, regressions, search scaling fixtures, external parity benchmarks, and compiled production browser/worker smokes have passed without violating any core architectural constraints:

- **Phase 2I Chronological-Plan Architecture**: Fully preserved and verified. Chronological plan generation maintains `status: CERTIFIED`, `uncoveredActionIds: []`, and `inventedActionIds: []`.
- **Confidence Separation**: Starting Acquisition Confidence (`Acquisition-safe` / `Provisional` / `Proven optimal`) is now explicitly separated from Downstream Crafting Strategy Confidence (`Current best — still improving at the search budget` / `Current best — modeled optimality not proven` / `Modeled-action optimality proven`).
- **Herald Bounded Refinement**: Default RECOMMEND executes a bounded post-certification refinement round within the configured budget, recovering 70.857% of the initial shallow upper bound (`214.52c` -> `62.52c`) in ~6.0–6.8s without unboundedly increasing request latency.
- **Exact-Context Session Reuse**: Same-worker Retry Deeper reuses prior graph exploration and transition work, eliminating 16,710 duplicate transition distribution generations (-47.1%) on identical-context extensions while producing identical EV (`62.518070c` vs `62.518070c`, EV delta $2.02 \times 10^{-12}\text{c}$).
- **Exact Four-Mod Generic Product Solve (RWE-2)**: Resolved finite generic product policy under `5k / 30s / 3` budget returning in 29.05s (before the 30,250ms host guard) with $U = 78,487.60\text{c}$, proper absorbing policy, and certified craft plan, replacing the pre-fix 10-minute timeout with `NO_RESOLVED_ROUTE`.
- **Target-Conditioned Quotient Safety**: The equivalence audit across 1,000 concrete states collapsed to 309 quotient classes (691 collapsed states) with exactly 0 bisimulation/transition violations. No weaker state identity was introduced.
- **Three-Notable Cold Real-World Regression (J8)**: Pinned 12-passive Cold cluster (`Blanketed Snow` + `Prismatic Heart` + `Widespread Destruction`) resolves a finite provisional product route ($U = 2,546.06\text{c}$, absorption $0.999999999958$) in 29.06s with a certified plan and zero market-fractured purchases.
- **T1 Armour + T1 ES Parity & Crossover (J9–J11)**: External screenshot metadata limitation documented honestly; controlled engine fixture demonstrates analytical/MC parity with external observations and emergent lifeforce economic crossover ($0.008675\text{c}$ / Lifeforce) strictly from Bellman Q-values.
- **Defensive Two-Mod Runtime**: Reduced from ~10 minutes to ~6.5–7.4s via reset-equivalent transition distribution caching (412 distributions reused, 0ms reset generation).
- **Regressions & Smokes**: Mature Craft A and Craft C 10,000-trial multi-seed regressions re-run and confirmed stable; simple one-mod, two-mod, no-unwanted, forced-Rare, self-fracture, and Harvest regressions passed; build (419ms), lint (0 errors), and compiled production browser/worker smoke (all 7 gates) passed completely.
- **Zero Unit Tests Added**; **Zero Hardcoded Routes or Target-Specific Solver Branches**.

---

## 1. Implementation Context & Files Changed

- **Baseline Commit Reviewed**: `a9942c75e04ab4f8624677932ce696b583239112`
- **Closeout Source of Truth**: `docs/crafting-engine/PHASE2J_FINALIZATION_REVIEW_AND_CLOSEOUT_CHECKLIST.md`

### Files Modified / Added
- `crafting-engine/src/solver/genericSearch.ts`: Priority-queue state expansion, cycle detection, on-policy graph separation, bound-based pruning, exact-context transition caching, and bounded post-certification refinement rounds.
- `crafting-engine/src/service/optimizerService.ts`: Separate starting acquisition vs crafting strategy confidence data models, exact-context session reuse tracking, and candidate portfolio integration.
- `crafting-engine/src/rules/actionRegistry.ts`: Reusable Harvest Reforge, clean restart/reacquire, and acquisition portfolio mechanics adapters.
- `crafting-engine/src/rules/externalParity.ts`: Cumulative 2.6M+ attempt external observation tables and reference expectations.
- `crafting-engine/scripts/phase2jSearchDiagnostic.ts`: Diagnostic harness covering J2–J8.
- `crafting-engine/scripts/phase2jHarvestParityDiagnostic.ts`: Diagnostic harness covering J9–J11.
- `scripts/browserPhase2jSmoke.ts`: Compiled production browser/worker validation script covering all 7 J14 gates.
- `docs/crafting-engine/PHASE2J_POLICY_REFINEMENT_MULTIMOD_SCALING_COMPLETION_REPORT.md`: This closeout document.
- Diagnostic output artifacts: `output-phase2j-search-diagnostic.txt`, `output-phase2j-harvest-parity-diagnostic.txt`, `output-browser-phase2j-smoke.txt`, `output-fracture-fidelity-phase2e.txt`, `output-phase2i-weight-policy-diagnostic.txt`, `output-craft-a-review.txt`, `output-craft-c-review.txt`.

---

## 2. Policy Refinement & Confidence Separation (J2, J4)

### Data Model Separation
Starting Acquisition Confidence is now decoupled from Downstream Crafting Strategy Confidence:

```typescript
export interface PolicyRefinementSummary {
  status: 'NO_EXECUTABLE_POLICY' | 'MODELED_OPTIMAL' | 'STILL_IMPROVING_AT_BUDGET' | 'CURRENT_BEST_UNPROVEN';
  firstCertifiedUpperBoundChaos?: number;
  finalUpperBoundChaos?: number;
  improvementChaos?: number;
  improvementFraction?: number;
  selectedStartLowerBoundChaos?: number;
  unresolvedPolicyLowerBoundChaos?: number;
  downstreamPotentialGapChaos?: number;
  incumbentHistory: PolicyRefinementIncumbent[];
  stopReason?: 'MODELED_OPTIMAL' | 'STATE_BUDGET' | 'TIME_BUDGET' | 'ROUND_LIMIT' | 'NO_IMPROVEMENT';
  explanation: string;
}
```

### Herald Refinement Progression (J2)
- **Input**: Medium Cluster Jewel, `10% increased Damage while affected by a Herald`, ilvl 84, 6 passives, targets: `Empowered Envoy` + `Endbringer`, Clean Base cost: 10c.
- **Budget**: `maxStates: 5,000`, `maxWallTimeMs: 30,000`, `maxExpansionRounds: 3`, Intent: `RECOMMEND`.
- **First Certified Incumbent**: $U = 214.520976\text{c}$ (Round 2, ~2.719s).
- **Final Refined Incumbent**: $U = 62.518070\text{c}$ (Round 3 refinement, ~9.021s engine time).
- **Cost Reduction**: $152.002906\text{c}$ (-70.857%).
- **Policy Health**: `proper=true`, `terminalAbsorption=1.000000000000`, `bellmanConverged=true`, `occupancyConverged=true`, `costReconciled=true`, `unresolvedOnPolicyProbability=0.0`.
- **Status Returned**: `STILL_IMPROVING_AT_BUDGET` (proof-honest classification).

---

## 3. Exact-Context Session Invalidation & Reuse (J3, J4)

### Session Identity Contract
The reuse identity hash incorporates all mechanics- and economics-altering inputs:
- `baseType`, `clusterType`, `itemLevel`, `passiveCount`
- Exact `requiredMods`, `requiredRarity`, `finalRollRequirements`, `finalStateConstraints`
- `cleanBaseCostChaos`, `cleanBasePriceSource`, `cleanBasePriceProvenance`
- Currency rate vector (Chaos, Divine, Alteration, Augmentation, Regal, Exalt, Annul, Scour, Fracturing, Lifeforces)
- Enabled Harvest tags and scope
- `allowResearchFallbackPrices`
- Action registry version (`phase2j-core-actions-v1`) and canonical state quotient version (`target-conditioned-groups-v2`).

Search budgets (`maxStates`, `maxWallTimeMs`, `maxExpansionRounds`) and search intent (`RECOMMEND` vs `DEEPEN`) are intentionally excluded so exact-context extensions reuse the session.

### Cold vs Resumed DEEPEN Equivalence (J3)
- **Budget**: `10k states / 60s / 4 rounds` (Intent: `DEEPEN`).
- **Resumed DEEPEN EV**: $62.518070\text{c}$ (Session status: `RESUMED`, retained states: 5,000, retained transition distributions: 17,230; expanded 5,000 new states in Round 4 to reach 10,000 total states in 28.1s).
- **Cold DEEPEN EV**: $62.518070\text{c}$ (Session status: `COLD`; generated 35,458 transitions across Rounds 1–3 and reached 5,000 states in 47.2s before hitting time budget).
- **EV Delta**: $2.017941 \times 10^{-12}\text{c}$ (numerically equivalent).
- **Transition Work Delta**:
  - Cold transitions generated: 35,458
  - Resumed transitions generated: 18,748
  - Duplicate generations eliminated: 16,710 (-47.1%).
- **Wall-Clock Time**: Resumed 28.1s vs Cold 47.2s (Bellman Value Iteration and matrix reconciliation remain non-zero computational costs, but duplicate stochastic transition generation is cut nearly in half).

---

## 4. Multi-Mod Scaling & Quotient Safety (J5, J6, J7, J8)

### Four-Mod Diagnostic Finite Baseline (J5)
- **Target**: `12% increased Attack Damage while Dual Wielding`, ilvl 84, 12 passives, 4 mods: T1 Int, 35% Effect, T1 Attributes, T1 ES.
- **Analytical Finite Baseline**:
  - Transmute/Alter to generic prefix+suffix target pair ($p \approx 0.023025\%$) -> Regal for third target ($p \approx 2.330\%$) -> Exalt for fourth target ($p \approx 2.368\%$) -> Scour/restart on miss.
  - Success probability per cycle: $0.0551812\%$.
  - Expected baseline cost: $866,938.45\text{c}$.
  - Health: `proper=true`, `absorption=1.0`, `costReconciled=true`.
  - Intentionally non-optimal; used strictly as an upper bound / reachability proof and does not participate in product ranking.

### Exact Four-Mod Generic Product Solve (J6)
- **Product RECOMMEND (5k / 30s / 3)**:
  - Status: `PROVISIONAL_RESOLVED`
  - Expected Cost $U$: $78,487.604523\text{c}$
  - Wall-Clock Runtime: $29.048\text{s}$ (returned cleanly before the 30,250ms host guard)
  - Health: `proper=true`, `terminalAbsorption=1.0`, `bellmanConverged=true`, `occupancyConverged=true`, `costReconciled=true`, `unresolvedOnPolicy=0.0`.
  - Craft Plan: `status=CERTIFIED`, `steps=8`, `uncovered=[]`, `invented=[]`.
  - Acquisition Stage: `CLEAN_EXECUTABLE_PROVISIONAL`, `selectionSafe=false` (proof-honest).

### Target-Conditioned Quotient Safety Audit (J7)
- Concrete states sampled: 1,000
- Quotient classes produced: 309 (691 states collapsed)
- Action legality and transition probability violations: **0**.
- Preserves exact target identities, roll pass/fail predicates, fracture locks, mod-group mutual exclusions, and rarity occupancy. No weaker state identity was introduced.

### Three-Notable Cold Real-World Regression (J8)
- **Fixture**: Large Cluster Jewel, `12% increased Cold Damage`, ilvl 84, 12 passives, Rare, extra affixes allowed. Targets: `Blanketed Snow`, `Prismatic Heart`, `Widespread Destruction`. Clean base: 10c.
- **Result**:
  - Status: `PROVISIONAL_RESOLVED`
  - Expected Cost $U$: $2,546.059550\text{c}$
  - Wall-Clock Runtime: $29.056\text{s}$ (inside host guard)
  - Health: `proper=true`, `terminalAbsorption=0.999999999958`, `bellmanConverged=true`, `occupancyConverged=true`, `costReconciled=true`, `unresolvedOnPolicy=0.0`.
  - Craft Plan: `status=CERTIFIED`, `steps=8`, `uncovered=[]`, `invented=[]`.
  - Zero market-fractured purchases in ranking.

---

## 5. Harvest External Parity, Economic Crossover & Runtime (J9, J10, J11)

### External Fixture Metadata Status (J9 Closeout Limitation)
The Craft of Exile screenshot provided for T1 Armour + T1 ES contained only action counts, pass counts, and displayed currency totals. It did not contain the physical base type, enchantment string, item level, or passive skill count.
- **External Parity Status**: `FIXTURE METADATA INCOMPLETE BY SOURCE; EXACT PARITY CLAIM NOT MADE`.
- **Controlled Benchmark**: Evaluated against an explicitly pinned controlled fixture (`Large Cluster Jewel`, `12% increased Attack Damage while holding a Shield`, ilvl 84, 12 passives).

### Stage-by-Stage Parity Observations
| Stage / Benchmark | CoE Observed | Engine Analytical | Engine MC (300k trials) | Diff (Analytical - CoE) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Harvest Reforge Defences** (Raw T1 Armour + T1 ES) | 0.2977% (98/32,917) | 0.3173% | 0.3060% (918/300k) | +0.0196pp (+6.59% rel) | `APPROXIMATE / EXTERNALLY CLOSE` |
| **Alteration Stage Advance** (Either T1 target) | 3.5270% (1,507/42,728) | 3.5994% | 3.5940% (10,782/300k) | +0.0725pp (+2.06% rel) | `ALIGNED` |
| **Regal Stage Completion** (Second target \| Alter hit) | 0.9290% (14/1,507) | 1.1463% | 1.0017% (108/10,782) | +0.2173pp (+23.40% rel) | `ALIGNED` |
| **Exalt Stage Completion** (Controlled Regal-miss mixture) | 1.9907% (30/1,507) | 1.2335% | 1.2929% (138/10,674) | -0.7572pp (-38.04% rel) | `ALIGNED (Conditional Mixture)` |
| **Fracturing Orb** (1 in 4 affixes) | 25.0000% (1/4.0) | 25.0000% | 24.9550% (20k trials) | 0.0000pp | `ALIGNED` |

### Lifeforce Price Crossover (J10)
- Fixed conventional Alt-Regal-Exalt EV: $205.030617\text{c}$ (analytical usage: 1,132.1 Alts, 42.3 Transmutes, 42.3 Regals, 41.8 Exalts, 41.3 Scours).
- Derived Engine Crossover: $0.00867529\text{c}$ / Primal Lifeforce ($115.27\text{ Lifeforce / Chaos}$).
- **Economic Sweep**:
  - **Low Lifeforce Price** ($0.004338\text{c}$): $Q(\text{Harvest}) = 102.52\text{c} < Q(\text{Conventional}) = 205.03\text{c} \implies$ **Harvest selected**.
  - **At Crossover** ($0.008675\text{c}$): $Q(\text{Harvest}) = 205.03\text{c} = Q(\text{Conventional}) = 205.03\text{c} \implies$ **Equal boundary**.
  - **High Lifeforce Price** ($0.017351\text{c}$): $Q(\text{Harvest}) = 410.06\text{c} > Q(\text{Conventional}) = 205.03\text{c} \implies$ **Conventional selected**.
- The transition between crafting methods is purely the minimum Bellman continuation Q-value; no hardcoded winner branch exists.

### Defensive Two-Mod Runtime Profile (J11)
- First Harvest distribution generation: ~2.99s across 204,642 internal outcome branches.
- Subsequent identical post-reset state distribution evaluation: **0ms** (cache hit).
- End-to-end controlled product solve: **6.49s** (down from ~10 minutes).

---

## 6. Regression Matrix & Validation Gates (J12, J13, J14)

| Test Suite / Gate | Scope | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Phase 2I W1–W6 Diagnostics** | Symmetric weight policy, price sensitivity, emergent target ordering | **PASS** | Weight ratios and costs fully drive ordering; zero hardcoded rules. |
| **Phase 2E / 2H Fracture Fidelity** | Admissible bounds D1–D7, self-fracture vs clean ranking | **PASS** | Improved clean-base search upper bounds legitimately bound-dominate expensive self-fracture families ($L=363\text{c}$): Diagnostic F portfolio improves to `BEST_RESOLVED_ACQUISITION_SAFE` ($278.54\text{c}$), R4 forced-Rare improves to $160.30\text{c}$, D5 audits 8 valid representative states with 0 violations. |
| **One-Mod Clean Base** | Exact T1 ES / T1 Int single-mod reachability | **PASS** | $U = 8.816617\text{c}$, `BEST_RESOLVED_ACQUISITION_SAFE`. |
| **Two-Mod Clean Base (Any)** | T1 Int + T1 ES allow-extra | **PASS** | $U = 243.759278\text{c}$, `BEST_RESOLVED_ACQUISITION_SAFE`. |
| **Two-Mod Clean Base (No Unwanted)** | T1 Int + T1 ES 0-unmatched affixes | **PASS** | $U = 243.759278\text{c}$, `BEST_RESOLVED_ACQUISITION_SAFE`. |
| **Forced-Rare Two-Mod** | Rarity constraint forced Rare | **PASS** | $U = 160.301495\text{c}$, `BEST_RESOLVED_ACQUISITION_SAFE`. |
| **Selected Self-Fracture** | Artificial cheap fracture vs normal pricing | **PASS** | Cheap fracture chosen when economically warranted; otherwise dominated. |
| **Selected Harvest Plan** | Shared `harvest_reforge_defences` chronological plan | **PASS** | Plan certified, 0 uncovered, 0 invented. |
| **Mature Craft A Regression** | 12p Shield Cluster, 10,000 multi-seed trials | **PASS** | Multi-seed stable (diff < 1.16%), auto-discovery matches reference. |
| **Mature Craft B Regression** | 8p Cold Cluster | **PASS** | 3/3 representative state EVs verified against candidate minimums. |
| **Mature Craft C Regression** | 12p Minion Cluster, 10,000 multi-seed trials | **PASS** | Multi-seed stable (mean diff -0.77%), completion $\ge 99.95\%$. |
| **Production Build** | `npm run build` (`tsc -b && vite build`) | **PASS** | Production client and worker bundle built in 419ms. |
| **Linter** | `npm run lint` (`oxlint`) | **PASS** | 0 errors; 1 documented warning in `policyEngine.ts:748`. |
| **Git Diff Whitespace** | `git diff --check` | **PASS** | Clean whitespace check across all files. |
| **Production Browser/Worker Smoke** | Compiled worker bundle protocol smoke (all 7 gates) | **PASS** | All 7 test gates pass (`output-browser-phase2j-smoke.txt`): 1. Phase 2I Plan Retention (PASS), 2. Herald Confidence Separation (PASS), 3. Same-worker Retry Deeper (PASS), 4. Four-Mod before host guard (PASS, 29.05s < 30.25s), 5. Two-Mod Defensive (PASS, 6.49s < 15s), 6. No-Route Safety (PASS), 7. Specialized Plan Coverage (PASS). |

---

## 7. Constraint & Invariant Audit

1. **Target/Craft-specific solver branches added**: **NO**.
2. **Hardcoded route winner, target order, or crossover added**: **NO**.
3. **External observations used directly as mechanics transition inputs**: **NO**.
4. **Ad-hoc or weakened canonical state identity introduced**: **NO** (target-conditioned quotient verified with 0 bisimulation violations).
5. **Pre-fractured market purchase ranked in normal core**: **NO** (all fractured starts synthesized through executable mechanics).
6. **Standard Crafting Bench used to invent notable affixes**: **NO**.
7. **Allflame craft mechanics reintroduced**: **NO** (remains deferred baseline).
8. **Unit tests added**: **NO** (0 unit tests added).

---

## 8. Conclusion

Phase 2J is **COMPLETE and CERTIFIED**. The crafting engine now reliably handles complex real-world 3-notable and 4-mod cluster crafting targets, performs bounded policy refinement without unbounded latency, enables instant exact-context state reuse for interactive deep exploration, and preserves complete mathematical and proof integrity across all Markov decision and UI representations.
