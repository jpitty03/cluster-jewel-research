# Cluster Jewel Crafting Optimizer Engine

A standalone, deterministic crafting analysis and expected-cost optimization engine for Path of Exile cluster jewels.

## Architecture & Isolation

The crafting engine is strictly isolated from `src/`, `server/`, and React UI components. It is configured in `tsconfig.crafting.json` with pure ES2023 types (no React or DOM APIs).

### Directory Structure

```text
crafting-engine/
  README.md
  KNOWN_MECHANICS.md
  src/
    domain/
      ItemState.ts           # Core item representation (prefixes, suffixes, fractured, rarity, ilvl)
      Mod.ts                 # Normalized mod representation (base mod or notable)
      ModPool.ts             # Pool resolution combining baseMods + clusterType notables
      CraftAction.ts         # Common interface for crafting mechanics (Exalt, Annul, Reforge, etc.)
      CraftResult.ts         # Probability distributions of next states
      TargetDefinition.ts    # Target goals (required mods, acceptable alternatives, roll thresholds)
      PriceBook.ts           # Currency rates and base item market valuations
    data/
      loadClusterMods.ts     # Canonical loader for data/poedb-cluster-mods.json
      loadHorticrafting.ts   # Canonical loader for data/poedb-horticrafting.json
      loadPrices.ts          # PriceBook loader combining exchange rates and sale valuations
    rules/
      affixRules.ts          # Max prefixes/suffixes by rarity (rare: 3/3, magic: 1/1)
      modEligibility.ts      # Filtering eligible mods by ilvl, slot capacity, blocked groups
      modGroups.ts           # Family exclusion & uniqueness enforcement
      rangeRolls.ts          # Exact uniform discrete range reroll expected cost (Divines)
      rarityRules.ts         # State transitions between magic, rare, normal
    actions/
      exalt.ts               # Exalted Orb action
      annul.ts               # Orb of Annulment action
      scour.ts               # Orb of Scouring action
      divine.ts              # Divine Orb numeric finishing action
      fracture.ts            # Fracturing Orb action
      harvestReforge.ts      # Horticrafting Reforge action
    plugins/
      Plugin.ts              # Removable league mechanic interface
      registry.ts            # Active plugin registry
      allflame/              # Necropolis Allflame Ember simulation plugin
        index.ts
    probability/
      weightedRoll.ts        # Recalculated dynamic pool probability distributions
      exact.ts               # Closed-form geometric loop solutions
      distributions.ts       # Discrete outcome utilities
    solver/
      stateKey.ts            # Order-independent canonical state key generation
      transitions.ts         # Transition graph exploration
      expectedCost.ts        # Dynamic programming / value iteration solver
      policySearch.ts        # Branching evaluation and recovery policy
      evaluator.ts           # ROI, profit, and opportunity evaluation
    reporting/
      explainPath.ts         # Human-readable step-by-step craft recipe generation
      formatCosts.ts         # Currency breakdown formatting
  test/
    fixtures/                # Sample item states, synthetic pools, reference craft fixtures
    unit/                    # Rules, domain, individual action tests
    integration/             # Multi-step craft policies & solver verification
    regression/              # Reference Craft A & Reference Craft B regression benchmarks
```

## Canonical Data Dependencies & Price Reconnaissance

1. **Cluster Jewel Mod Pools (`data/poedb-cluster-mods.json`)**:
   - Canonical source for `baseMods` (generic small passive explicit mods across jewel sizes) and `bases` (enchantment pools with cluster-type-specific notables and specific small passive tiers).
   - Note: The UI bundle in `src/data/` mirrors this file; the engine reads exclusively from `data/`.
2. **Horticrafting Bench (`data/poedb-horticrafting.json`)**:
   - Canonical source for Harvest bench crafts (Reforge, Add/Remove, cost in Lifeforce).
   - Lifeforce types in data are `Wild` (Yellow), `Vivid` (Blue), and `Primal` (Red).
   - `Reforge Attribute` requires 200 Vivid Lifeforce + 2 Crystallised Rancour.
3. **PriceBook (`PriceBook.ts` & `data/loadPrices.ts`)**:
   - Ingestion of currency rates (Divine, Fracturing, Annul, Exalt, Lifeforces, Rancour) from supplied development configuration or poe.ninja exchange endpoint.
   - Finished item sale valuation index: `src/data/allflame/trade-prices.json` (keyed `Base||clusterType||notables` joined with `" + "`, with `{ low, mid: { type, amount, currency }, listed, sampled, passivesMin, passivesMax }`). Applicable for Reference Craft B; Craft A valuations are supplied via explicit trade queries / target configs.

## Scraper Gaps & Follow-Up Requirements

1. **Jewel Sockets Explicit Mod**:
   - "Added Passive Skills are Jewel Sockets" is an explicit prefix rolled on cluster jewels (up to 2 sockets on Large, 1 on Medium). It is currently absent from `poedb-cluster-mods.json` and must be ingested with `statValues`/`tier` for full Reference Craft B explicit simulation in Phase 7.
2. **Notable Mod Metadata (`modId`, `modGroup`)**:
   - Scraped notable entries currently expose `name`, `weight`, `ilvl`, `genType`, and `tags`. Notables are grouped by name, and tiered small passives inside notable pools are normalized by stripped name pattern and ranked by ilvl into tiers.
3. **Reforge Attribute Tag Parsing & Rancour**:
   - `tagClasses` is empty for "Reforge Attribute", but `modTag` is `"Attribute"`. Normalization maps this to `craftTags: ["attribute"]`.
   - Crystallised Rancour price is configured in PriceBook.
4. **Passive Count Constraints**:
   - Max notables supported: Large (3), Medium (2), Small (1).

## Running Tests & Diagnostics

```bash
# Run unit & regression test suites
npm test

# Run diagnostic mod-pool & blocked-group report for Reference Crafts A & B
npx tsx crafting-engine/scripts/diagnosticReport.ts

# Run single-action debug inspector (e.g. Exalted Orb probability distribution)
npx tsx crafting-engine/scripts/debugAction.ts

# Run end-to-end Crafting Optimizer demonstration
npx tsx crafting-engine/scripts/optimizeCraftDemo.ts

# Typecheck the engine
npx tsc -b
```

## Validation Findings & Implementation Gaps (from First End-to-End Run)

Detailed findings and benchmark reporting standards are documented in [`docs/crafting-engine/VALIDATION_FINDINGS_AND_REPORTING_FORMAT.md`](../docs/crafting-engine/VALIDATION_FINDINGS_AND_REPORTING_FORMAT.md).

### Key Findings & Required Engine Fixes

1. **Finding 1 — True Self-Fracture Modeling**:
   - Initial prototypes labeled an empty rare base as "Clean 12-Passive Base (Self-Fracture Route)" without executing a Fracturing Orb or accounting for preparation costs.
   - A valid self-fracture starting strategy must model:
     1. Clean base acquisition;
     2. Rolling candidate target modifier (e.g. T1 Int);
     3. Preparing exactly four eligible explicit modifiers;
     4. Fracturing Orb use (25% success rate on 4-mod rare cluster);
     5. Handling failure outcomes and repeated preparation loops.
   - *Economic baseline*: At 359c per Fracturing Orb and 10c per clean base, the theoretical floor before preparation is $4 \times (359\text{c} + 10\text{c}) = 1476\text{c} = 7.38\text{ div}$. With purchased fractured Int bases at 8 div (1600c), self-fracture preparation headroom is only $\approx 31\text{c}$ per attempt.

2. **Finding 2 — Dynamic PriceBook vs Hard-Coded Constants**:
   - Prototype scripts must not use stale inline prices. All currency exchange rates and base market valuations must be injected dynamically via `PriceBook` and trade fixtures.

3. **Finding 3 — State-Transition Graph & Recovery Loops**:
   - The solver must not sum independent requirement costs or use static heuristics (e.g. `expectedAnnuls = expectedSlams * 0.8`).
   - It must evaluate concrete Markov decision transitions $V(s) = \min_A \left[ \text{cost}(A) + \sum P(s'|s, A) V(s') \right]$ with exact failure recovery (e.g. Annul removing T1 ES with probability $1/3$ returning to Step 2).

4. **Finding 4 — Joint Divine Orb Numeric Finishing**:
   - Divine Orbs reroll all non-fractured explicit numeric values simultaneously. Reroll expectations across multiple target numeric values must be calculated using joint probability distributions rather than summing independent expectations.

5. **Finding 5 — Multi-Tier Outcome Valuation & Profit Optimization**:
   - For Step 5 suffix slamming on Craft A, acceptable outcomes have differing market valuations (+4 All Attributes $\approx 85\text{ div}$, 3% Attack Speed $\approx 39\text{ div}$, All Elemental Res $\approx 7\text{ div}$).
   - The policy must decide whether to accept/sell or annul/retry based on continuation value.

6. **Finding 6 — Standardized 6-Step Crafting Plan Reporting**:
   - Output must follow the step-by-step reporting format:
     - **Step 1**: Starting Base Acquisition (Buy Fractured vs Self-Fracture comparison).
     - **Step 2**: Harvest Reforge for primary prefix (e.g. Reforge Defence for T1 ES).
     - **Step 3**: Cleanup of non-target modifiers with exact Annul risk.
     - **Step 4**: Exalt / Allflame for secondary prefix (35% Effect).
     - **Step 5**: Exalt / Allflame for premium suffix (+4 Attributes / 3% AS / All Res).
     - **Step 6**: Divine numeric finishing.
     - **Financial Summary**: Expected total cost, outcome value distribution, net profit, and ROI comparison against alternate starting routes.
