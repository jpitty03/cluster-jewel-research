# Cluster Jewel Crafting Optimizer — Implementation Plan

## Goal

Build a standalone crafting-analysis engine that can determine the most efficient expected-cost path to craft profitable cluster jewels.

The engine must:

- work independently from the existing application UI and business logic;
- consume the existing scraped modifier and Horticrafting data;
- support Large, Medium, and Small Cluster Jewels;
- support both notable-focused jewels and explicit-mod-focused jewels;
- evaluate multiple possible starting states, including clean bases, purchased fractured bases, and self-fractured bases;
- model crafting steps, failure states, recovery actions, and expected cost;
- compare alternate step ordering instead of assuming one human-supplied recipe is optimal;
- support league-specific crafting mechanics as removable plug-ins;
- calculate expected crafting cost and expected profit using market prices;
- produce a human-readable recommended crafting path with probabilities and expected attempts;
- be testable without the UI.

The first validation craft will be the 12-passive ilvl 84 Large Cluster Jewel described below. The second validation craft will be a normal 8-passive three-notable Cold Damage Large Cluster Jewel.

---

# Reference Craft A — 12-Passive Shield Cluster

Target base:

- Large Cluster Jewel
- 12 passives
- item level 84
- Small Passives grant 12% increased Attack Damage while holding a Shield

Desired explicit mods:

### Prefixes

- Added Small Passive Skills also grant +(10–12) Maximum Energy Shield — T1
- Added Small Passive Skills have 35% increased Effect — T1

### Suffixes

- Added Small Passive Skills also grant +(6–8) Intelligence — T1
- one premium fourth suffix:
  - +4 to All Attributes → ~85 div final jewel value
  - 3% Attack Speed → ~39 div final jewel value
  - All Elemental Resistance → ~7 div final jewel value

Important clarification:

- T1 Intelligence does **not** need to naturally roll exactly +8 during crafting.
- Any T1 roll of +6, +7, or +8 is acceptable as the correct modifier.
- A Divine Orb can later reroll the numeric range until +8 is obtained.
- The optimizer should therefore model the expected Divine Orb finishing cost rather than reducing the T1 Intelligence hit probability by 1/3.

For a uniformly distributed integer roll from +6 to +8, expected Divine Orb uses to obtain exactly +8 from an arbitrary current T1 value should be modeled explicitly. Do not hard-code this specific range; implement generic range reroll logic.

Current example prices supplied for development/testing:

- Divine Orb: 200 chaos
- Fracturing Orb: 359 chaos
- Orb of Annulment: 9 chaos
- Exalted Orb: 1.2 chaos
- Yellow Lifeforce: 1/13 chaos each
- Blue Lifeforce: 1/26 chaos each
- Red Lifeforce: 1/48 chaos each
- clean 12-passive ilvl 84 base: 10 chaos
- fractured +6–8 Intelligence base: 8 div
- fractured 35% increased Effect base: 13 div

Fracturing Orb model:

- requires exactly four valid explicit modifiers for the baseline strategy;
- randomly fractures one valid explicit modifier;
- target probability = 1 / number of valid fracture candidates;
- fractured modifiers are permanent and cannot be removed or rerolled;
- Annulment, Scouring, Harvest rerolls, etc. cannot remove the fractured modifier.

Human baseline strategy to compare against:

1. Start from fractured T1 Intelligence.
2. Harvest Reforge Defence until T1 Maximum ES appears.
3. Clean unwanted mods while preserving fractured Intelligence and T1 ES.
4. Exalt/Allflame for 35% increased Effect.
5. Exalt/Allflame for premium final suffix.
6. If a slam misses, evaluate Annul recovery versus restart/rebuild.
7. Divine T1 Intelligence to +8 only if necessary at the end.

The engine must independently verify whether this is optimal versus:

- purchasing fractured 35% Effect;
- self-fracturing T1 Intelligence;
- self-fracturing 35% Effect;
- starting from an unfractured base;
- alternate ordering of 35% Effect and final suffix;
- alternate cleanup/recovery strategies.

---

# Reference Craft B — 8-Passive Three-Notable Cold Cluster

Target example:

```text
Large Cluster Jewel
Item Level: 83
Adds 8 Passive Skills
2 Added Passive Skills are Jewel Sockets
Added Small Passive Skills grant: 12% increased Cold Damage

1 Added Passive Skill is Blanketed Snow
1 Added Passive Skill is Prismatic Heart
1 Added Passive Skill is Widespread Destruction
```

Example sale value: ~6 div.

This craft validates that the same optimizer can handle notable combinations rather than only regular explicit mods.

The optimizer must use the cluster-type-specific notable pool from the existing data and respect:

- generation type;
- notable weights;
- item-level requirements;
- prefix/suffix limits;
- mutually exclusive mod families/groups where applicable;
- two jewel socket enchantments being part of the base/enchantment definition, not rolled explicit mods.

Do not build a separate "three notable algorithm." The same state/action/search framework should support both Reference Craft A and Reference Craft B.

---

# Required Architecture

Create the crafting engine outside the current main application source.

Recommended top-level structure:

```text
crafting-engine/
  README.md
  package.json                 # only if isolation requires it; otherwise reuse root tooling
  src/
    domain/
      ItemState.ts
      Mod.ts
      ModPool.ts
      CraftAction.ts
      CraftResult.ts
      TargetDefinition.ts
      PriceBook.ts
    data/
      loadClusterMods.ts
      loadHorticrafting.ts
      loadPrices.ts
    rules/
      affixRules.ts
      modEligibility.ts
      modGroups.ts
      rangeRolls.ts
      rarityRules.ts
    actions/
      exalt.ts
      annul.ts
      scour.ts
      divine.ts
      fracture.ts
      harvestReforge.ts
    plugins/
      Plugin.ts
      registry.ts
      allflame/
        index.ts
    probability/
      weightedRoll.ts
      exact.ts
      distributions.ts
    solver/
      stateKey.ts
      transitions.ts
      expectedCost.ts
      policySearch.ts
      evaluator.ts
    reporting/
      explainPath.ts
      formatCosts.ts
  test/
    fixtures/
    unit/
    integration/
    regression/
```

If a slightly different structure better matches the repository, preserve the key constraint: **the crafting engine must remain logically isolated from `src/`, `server/`, and the current UI.**

The UI may consume the engine later, but the engine must not depend on React.

---

# Core Design Principle: Crafting as a State Graph

Do not implement the optimizer as a collection of hard-coded recipes.

Represent crafting as a graph / Markov decision process.

## Item state

A state should contain enough information to uniquely determine legal future actions and probabilities.

At minimum:

```ts
interface ItemState {
  baseType: 'Large Cluster Jewel' | 'Medium Cluster Jewel' | 'Small Cluster Jewel'
  clusterType: string
  itemLevel: number
  passiveCount?: number
  rarity: 'normal' | 'magic' | 'rare'
  prefixes: RolledMod[]
  suffixes: RolledMod[]
  fracturedModIds: string[]
  metadata?: Record<string, unknown>
}
```

Each rolled modifier should distinguish:

- mod ID;
- mod family/group;
- generation type;
- tier;
- rolled numeric values;
- fractured status.

## Target state

A target must support more than exact item equality.

Example:

```ts
interface TargetDefinition {
  requiredMods: ModRequirement[]
  acceptableAnyOf?: ModRequirement[][]
  finalRollRequirements?: NumericRollRequirement[]
  minimumSaleValue?: number
}
```

Reference Craft A should express:

- required T1 ES;
- required 35% Effect;
- required T1 Intelligence;
- any one premium fourth suffix;
- +8 Intelligence as a final numeric-roll requirement that can be solved through Divine Orbs.

Reference Craft B should express three required notables.

---

# Action Model

Every crafting mechanic should implement a common interface.

Example:

```ts
interface CraftAction {
  id: string
  name: string
  isAvailable(state: ItemState, context: SolverContext): boolean
  cost(state: ItemState, context: SolverContext): CurrencyCost
  outcomes(state: ItemState, context: SolverContext): CraftOutcome[]
}

interface CraftOutcome {
  probability: number
  state: ItemState
  description: string
}
```

This makes temporary league mechanics removable.

For example, Allflame must **not** be embedded into Exalted Orb logic.

Instead:

```text
Base action:
  Exalted Orb → perform one Exalt result

Allflame plug-in:
  transform eligible action into four independent simulated outcomes
  player chooses the best resulting copy according to solver continuation value
```

When the league ends, removing/disabling the Allflame plug-in must restore normal crafting behavior without modifying the core Exalt implementation.

---

# Important Probability Rules

## Weighted modifier selection

Never use the precomputed display `pct` value as the final probability for arbitrary crafting states.

Probability must be recalculated from the **currently eligible pool** after considering:

- item level;
- prefix/suffix capacity;
- already occupied mod groups/families;
- fractured modifiers;
- existing modifiers that block their family;
- crafting tags / Harvest targeting;
- action-specific restrictions.

Use the underlying `weight` values from `baseMods` and notable pools.

## Affix slots

Rare cluster jewels can have a maximum of:

- 3 prefixes;
- 3 suffixes.

Implement this as a rule, not scattered constants.

## Mod family exclusion

If any modifier from a family/group is already present, other modifiers from the same family are ineligible.

Example:

- T1 Maximum ES blocks lower ES tiers;
- fractured T1 Intelligence blocks all other Intelligence tiers;
- 35% Effect blocks 25% Effect.

## Numeric ranges and Divine Orbs

Separate:

1. probability of hitting the correct modifier/tier;
2. probability/cost of obtaining the desired numeric value inside the modifier.

Implement a reusable exact expected-cost function for Divine rerolls.

Example concept:

```ts
expectedDivinesToReach(
  possibleRolls,
  acceptedRolls,
  currentRoll,
): number
```

Do not assume integer ranges are always uniformly distributed unless confirmed by the data/rule model. For the initial implementation, document a uniform-roll assumption where required and isolate it behind a rule so it can be replaced later.

## Annulment Orb

Annulment:

- selects one removable explicit modifier uniformly from the eligible removable explicit modifiers;
- fractured modifiers are excluded;
- success/failure must branch into separate states;
- the solver must decide whether Annul recovery has lower expected continuation cost than abandoning/restarting.

## Fracturing Orb

Fracturing:

- randomly chooses among valid explicit modifiers;
- fractured modifiers cannot subsequently be altered;
- initial implementation should support the known four-mod strategy;
- do not hard-code 25%; calculate `1 / candidateCount`.

## Harvest Reforge

Use `data/poedb-horticrafting.json` / corresponding source data.

Current scraper data states that Reforge:

- rerolls a rare item;
- guarantees at least one modifier matching the requested mod tag;
- has a 50% chance to roll 3–6 modifiers.

Do **not** pretend exact Harvest distribution logic is known where it is not yet modeled.

Build the action abstraction first, then validate the exact generation algorithm before relying on it for profitability results.

Any approximation must be explicitly labeled in solver output.

---

# Solver Objective

The initial primary objective is:

```text
minimize expected chaos cost to reach target
```

Then calculate:

```text
expected profit = sale value - expected crafting cost
ROI = expected profit / expected crafting cost
```

Later the solver may support alternative objectives:

- maximize expected profit;
- maximize profit per attempt;
- maximize profit per unit time;
- minimize variance/risk;
- cap required starting bankroll.

Do not optimize for those in v1 unless needed to resolve a design issue.

---

# Search Strategy

The state space can become enormous. Do not brute-force every possible complete item blindly.

Implement in increasing sophistication.

Potential final approach:

- memoized expected-cost dynamic programming for tractable subgraphs;
- Dijkstra/A*-style search where deterministic/expected edge cost permits it;
- Bellman/value iteration for stochastic branches;
- state canonicalization to merge equivalent item states;
- pruning dominated states/actions.

A useful recurrence is conceptually:

```text
V(state) = min over legal actions A of:
  cost(A) + Σ P(outcome | state, A) * V(outcome)
```

Terminal target state:

```text
V(target) = finishing numeric-roll cost
```

Be careful with loops such as:

```text
Exalt → bad mod → Annul → return to prior state
```

The implementation must solve expected loop cost mathematically or via convergent value iteration rather than recursing forever.

---

# Phase 0 — Repository Reconnaissance and Specification

## Work

Before writing engine code:

1. Inspect the existing repo structure and build/test setup.
2. Confirm exact locations and schemas of:
   - `poedb-cluster-mods.json`;
   - `poedb-horticrafting.json`;
   - existing market price data;
   - sale-price data already used by the application.
3. Document known/unknown mechanics.
4. Identify whether notable crafting and base explicit crafting share the same explicit slot system in the available data representation.
5. Identify missing information required for exact simulation.

## Deliverable

Create:

```text
crafting-engine/README.md
crafting-engine/KNOWN_MECHANICS.md
```

`KNOWN_MECHANICS.md` must distinguish:

- confirmed rule;
- data-derived assumption;
- unverified assumption;
- unsupported mechanic.

## Gate / Evaluation

Stop before Phase 1 and report:

- proposed final engine folder structure;
- data dependencies;
- mechanics that are still uncertain;
- any schema changes required to the scraper.

Do not proceed if exact mod eligibility cannot be derived from the current scraped data.

---

# Phase 1 — Domain Model and Mod Eligibility Engine

## Work

Implement:

- `ItemState`;
- `RolledMod`;
- `TargetDefinition`;
- mod-pool loading;
- prefix/suffix slot rules;
- item-level filtering;
- mod-group/family exclusion;
- canonical state key generation.

Support both:

- regular `baseMods`;
- cluster-type notable pools.

## Tests

Unit tests must prove:

1. ilvl 83 cannot roll ilvl 84 mods.
2. ilvl 84 can roll 35% Effect.
3. T1 ES blocks T2/T3 ES.
4. T1 Intelligence blocks lower Intelligence tiers.
5. 35% Effect blocks 25% Effect.
6. a full prefix side cannot accept another prefix.
7. a full suffix side cannot accept another suffix.
8. fractured mods remain present when constructing derived states.
9. Cold Damage cluster notable pool contains and correctly identifies:
   - Blanketed Snow;
   - Prismatic Heart;
   - Widespread Destruction.
10. item states with the same mechanically relevant mods canonicalize to the same state key regardless of insertion order.

## Gate / Evaluation

Generate a diagnostic report for both reference crafts showing:

- eligible initial prefix pool;
- eligible initial suffix pool;
- eligible notable pool;
- total weights;
- target weights;
- blocked groups after each target mod is added.

Manually compare those numbers to the raw JSON before proceeding.

---

# Phase 2 — Exact Basic Currency Actions

## Work

Implement exact action simulators for:

- Exalted Orb;
- Orb of Annulment;
- Divine Orb;
- Fracturing Orb;
- Scouring Orb if useful for supported states.

Do not implement Harvest or Allflame yet.

### Exalted Orb

Must:

- select from currently legal generation-side/mod pools using weights;
- reject use when no affix slot is available;
- block existing mod families;
- return a complete probability distribution of distinct next states.

### Annulment Orb

Must:

- uniformly remove one removable explicit mod;
- never remove fractured mods.

### Divine Orb

Must:

- reroll numeric values without changing modifier identity;
- support expected-cost-to-target calculations.

### Fracturing Orb

Must:

- choose uniformly between valid existing explicit modifiers;
- mark exactly one result fractured.

## Tests

Add deterministic seeded/analytical tests.

Required tests:

1. four valid mods → target fracture probability exactly 25%.
2. fractured mod cannot be annulled.
3. Exalt never rolls another member of an occupied mod family.
4. Exalt probability mass sums to 1.0.
5. Annul probability mass sums to 1.0.
6. Divine does not change mod identity.
7. T1 Intelligence +6/+7/+8 finishing logic produces the analytically expected Divine cost.
8. Exalting from T1 ES + fractured T1 Intelligence produces the expected recalculated chance for 35% Effect from the live eligible pool.

## Gate / Evaluation

Build a CLI/debug script that accepts an ItemState fixture and prints:

```text
Action: Exalted Orb
Eligible mods: N
Total eligible weight: X
Target mod probability: Y%
Top outcomes: ...
```

Validate Reference Craft A's basic Exalt math by hand before Phase 3.

---

# Phase 3 — Harvest Reforge Model

## Work

Implement Harvest as a separate action module driven by Horticrafting data.

Start with only the Reforge actions required for cluster jewel crafting.

Priority:

1. Reforge Defence;
2. Reforge Attribute;
3. Reforge Attack/Speed/etc. only as required by later test cases.

The implementation must derive candidate tagged mods from scraped mod tags, not a hard-coded list of ES mods.

### Critical research task

Before declaring this phase complete, establish the exact algorithm needed to generate:

- number of affixes;
- guaranteed tagged mod selection;
- remaining normal rolls;
- prefix/suffix allocation;
- duplicate-family exclusions.

If exact mechanics cannot be verified, create two implementations:

```text
ExactHarvestReforge (disabled until verified)
ApproximateHarvestReforge (explicitly labeled)
```

The solver must expose whether a result uses approximate probabilities.

## Tests

1. Reforge Defence always produces at least one legal Defence-tagged modifier.
2. T1 ES probability uses weights among legal Defence outcomes rather than generic prefix percentage.
3. fractured suffix survives every Reforge Defence outcome.
4. fractured prefix survives every Reforge outcome.
5. no result violates max prefix/suffix counts.
6. no result contains duplicate mod families.
7. probabilities sum to 1.0 or simulation frequencies converge within tolerance if Monte Carlo is temporarily used.

## Gate / Evaluation

Run 100k+ simulated Harvest Defence crafts from the Reference Craft A fractured-Int starting state and compare empirical rates to the analytical model.

Produce a short report containing:

- probability of T1 ES per Harvest;
- expected Harvest attempts;
- expected Lifeforce cost;
- distribution of junk affix counts on successful T1 ES outcomes.

Do not proceed until this looks mechanically plausible.

---

# Phase 4 — Recovery Logic and Expected-Cost Solver

## Work

Implement the first actual optimizer.

Supported actions:

- Exalt;
- Annul;
- Divine finishing;
- Harvest Defence;
- restart from chosen starting base.

Use state-value evaluation rather than predetermined recipes.

The solver must be able to discover loops such as:

```text
state with desired mods + one open slot
  → Exalt
    → success: continue
    → failure:
       compare Annul versus restart
```

It must calculate expected cost including the possibility that Annul removes a valuable non-fractured mod.

## Dominance pruning

At minimum, prune a state when another state has:

- the same immutable/fractured mods;
- a superset of desired mods;
- no more occupied harmful affix slots;
- lower or equal accumulated expected acquisition cost.

Be conservative. Correctness is more important than aggressive pruning.

## Tests

Create tiny synthetic mod pools where the mathematically optimal answer is known.

Required scenarios:

1. always restart after failed slam is optimal.
2. Annul recovery is optimal.
3. Annul recovery is not optimal because it risks destroying an expensive setup mod.
4. action order A→B is cheaper than B→A.
5. reverse ordering is cheaper in a different synthetic pool.
6. solver terminates when a loop returns to the same state.
7. solver returns the known closed-form expected cost for a geometric retry process.

## Gate / Evaluation

Run Reference Craft A **without Allflame**.

Compare at least:

```text
A. purchased fractured Int
B. purchased fractured 35% Effect
```

Output:

- recommended route;
- expected total cost;
- expected number of each currency;
- expected Harvest attempts;
- expected Exalts;
- expected Annuls;
- expected Divines;
- major failure/recovery branches.

The expected result is that the solver should strongly prefer the fractured Intelligence base at the currently supplied prices, but the test must assert the computed result rather than hard-code the preferred route.

---

# Phase 5 — League Mechanic Plug-in Framework

## Work

Create a generic plug-in system.

Example interface:

```ts
interface CraftingPlugin {
  id: string
  enabled: boolean
  transformActions?(actions: CraftAction[], context: SolverContext): CraftAction[]
  transformOutcomes?(
    action: CraftAction,
    state: ItemState,
    outcomes: CraftOutcome[],
    context: SolverContext,
  ): CraftOutcome[]
}
```

Implement Allflame as the first plug-in.

Known behavior supplied for this project:

- take the currency action that would normally produce one result;
- simulate four independent results;
- the player may choose one of those four results.

The choice cannot simply mean "choose target mod if present." The correct choice is:

> choose the outcome with the lowest expected continuation cost / highest solver value.

This matters when multiple partially useful outcomes occur.

For a simple binary target, the probability can be verified against:

```text
P(at least one success) = 1 - (1 - p)^4
```

But the implementation should evaluate four-outcome combinations through continuation value rather than collapse everything to a binary formula.

## Tests

1. binary success probability matches `1 - (1-p)^4`.
2. four failures behave like the normal failed action state.
3. if two different desirable outcomes appear, the solver selects the one with lower continuation cost.
4. disabling the plug-in produces exactly the Phase 4 normal-currency results.
5. deleting the plug-in folder does not require changes to core Exalt/Annul logic.

## Gate / Evaluation

Re-run Reference Craft A with Allflame enabled.

Compare:

- normal crafting;
- Allflame crafting;
- fractured Int start;
- fractured 35% start.

Report how much Allflame reduces expected finishing cost and whether it changes the optimal starting fracture.

---

# Phase 6 — Starting-Base Optimizer and Self-Fracturing

## Work

Treat starting base acquisition as part of the search.

Supported source strategies:

```text
Purchase clean base
Purchase fractured target base
Create target fracture yourself
```

For self-fracturing, model all preparation cost necessary to create a four-mod item containing the desired fracture candidate.

Do not reduce self-fracturing to:

```text
4 × Fracturing Orb price
```

That ignores the cost of repeatedly preparing valid four-mod candidates.

The optimizer should determine expected total fracture acquisition cost:

```text
Expected self-fracture cost
= expected preparation costs
+ expected Fracturing Orbs
+ expected base replacements / cleanup / retries
```

Compare against direct market purchase of fractured bases.

## Tests

Synthetic tests:

1. cheap fractured market base beats self-fracturing.
2. expensive fractured market base makes self-fracturing optimal.
3. 4-candidate fracture gives 25% target chance.
4. expected cost includes failed fracture preparation loss.

Reference Craft A test:

Compare:

- 8 div fractured Intelligence;
- 13 div fractured 35% Effect;
- self-fractured Intelligence;
- self-fractured 35% Effect;
- clean base route.

## Gate / Evaluation

Produce a break-even table:

```text
Fractured Int market price at which self-fracturing becomes cheaper
Fractured 35% market price at which self-fracturing becomes cheaper
```

This is an important solver feature because market prices change continuously.

---

# Phase 7 — Three-Notable Cluster Support

## Work

Apply the same engine to Reference Craft B.

Target:

```text
Blanketed Snow
Prismatic Heart
Widespread Destruction
```

on:

```text
Large Cluster Jewel
8 passives
12% increased Cold Damage
ilvl 83
```

The optimizer should examine the legal crafting methods currently implemented and determine the cheapest available route.

Potential supported methods may include:

- Alteration/Augmentation/Regal if added;
- Chaos-style rerolls if added;
- Harvest reforges;
- Exalt/Annul cleanup;
- fractured notable bases if market data exists.

Do not fake an answer if the required currency actions have not been implemented yet. Instead, the solver should report:

```text
No supported route found with currently enabled crafting actions.
```

Then add the missing generic actions in separate subphases.

## Tests

1. all three notables are individually legal at ilvl 83.
2. target combination obeys prefix/suffix limitations.
3. probabilities use the Cold Damage notable pool only.
4. mod weights update after one notable is present.
5. duplicate/excluded families cannot occur.
6. optimizer reaches the target in a synthetic reduced pool.

## Gate / Evaluation

Use the ~6 div sale value and produce:

- expected crafting cost;
- expected profit;
- expected ROI;
- recommended method;
- whether crafting is profitable at current supplied prices.

Then verify that the recommendation changes appropriately if sale price or currency prices are modified.

---

# Phase 8 — Profit Evaluation Across Cluster Jewels

## Work

Once pathfinding is reliable, integrate the repo's existing sale-price data.

For each candidate target jewel:

```text
expected profit
= estimated sale price
- optimal expected crafting cost
```

Initial ranking fields:

```ts
interface CraftOpportunity {
  target: TargetDefinition
  salePriceChaos: number
  expectedCraftCostChaos: number
  expectedProfitChaos: number
  roi: number
  recommendedStart: string
  recommendedPath: CraftPlan
  confidence: 'exact' | 'partially-approximate' | 'approximate'
}
```

Do not mix trade-price retrieval into the solver. Pass prices through `PriceBook` / context.

## Tests

1. doubling sale price changes profit but not crafting probabilities.
2. changing Exalt price can change optimal route.
3. changing fractured-base price can change optimal start.
4. changing Lifeforce prices can change Harvest-vs-other-route preference.
5. negative-profit crafts are retained but clearly marked unprofitable.

## Gate / Evaluation

Run the optimizer over a small curated set of known cluster jewels and manually inspect the top 10 ranked opportunities.

Look specifically for nonsensical exploits caused by missing mechanics.

---

# Phase 9 — Monte Carlo Cross-Validation

Analytical expected-cost logic should be the primary method where possible.

Monte Carlo should be used as a validator.

## Work

Create a simulator that executes the solver's recommended policy over many complete craft attempts.

For each reference craft run at least:

- 100,000 trials for normal/high-frequency paths;
- more if rare-tail behavior produces unstable estimates.

Compare simulated:

- mean cost;
- median cost;
- p75/p90/p95 cost;
- success/failure frequencies;
- currency consumption;

against analytical expected values.

## Acceptance tolerance

For stable distributions, simulated mean should be within approximately 1–2% of analytical expectation.

If not, investigate rather than widening tolerance immediately.

## Gate / Evaluation

Create regression snapshots for Reference Craft A and B so future rule changes show exactly how expected cost changed.

---

# Phase 10 — Reporting / Explainability

A mathematically optimal answer is not useful if the user cannot understand the craft.

## Output format

Example:

```text
Recommended Start
-----------------
Buy fractured +(6–8) Intelligence base
Cost: 1,600c

Step 1 — Harvest Reforge Defence
Target: T1 Maximum Energy Shield
Chance per attempt: X%
Expected attempts: Y
Expected cost: Zc

Step 2 — Clean item
Recommended action: Annul ...
Success chance: ...
Failure handling: ...

Step 3 — Allflame Exalt
Target: 35% increased Effect
Success chance: ...
On failure: Annul if [condition], otherwise restart from [state]

Step 4 — Allflame Exalt
Acceptable outcomes:
  +4 All Attributes    → 85d sale tier
  3% Attack Speed      → 39d sale tier
  All Elemental Res    → 7d sale tier

Step 5 — Divine Intelligence if needed
Current mod range: +(6–8)
Desired value: +8
Expected Divine cost: ...

Expected Total Cost: ...
Expected Sale Value: ...
Expected Profit: ...
```

Also expose alternate routes:

```text
#2 fractured 35% start — +Xc more expensive
#3 self-fractured Intelligence — +Yc more expensive
```

## Tests

Snapshot-test explanations so optimizer output remains understandable after refactors.

---

# Phase 11 — UI Integration Only After Engine Validation

Do **not** couple the engine to the existing React application before the mathematical engine has passed the previous gates.

Once validated, expose a narrow API such as:

```ts
optimizeCraft(request: CraftOptimizationRequest): CraftOptimizationResult
```

The UI can then provide:

- base selector;
- passive count;
- item level;
- target mod/notable selector;
- optional fracture choices;
- sale value;
- currency prices;
- enabled league mechanics;
- Optimize button;
- detailed recommended path.

No solver logic should live in React components.

---

# Data / Scraper Follow-Up Requirements

During implementation, verify whether the current `poedb-cluster-mods.json` contains enough information for exact crafting.

Known useful fields already present in `baseMods` include:

- `modId`;
- `genType`;
- `weight`;
- `ilvl`;
- `modGroup` / `modGroups`;
- `tags`;
- `craftTags`;
- `spawnTags`;
- `statText`;
- `statValues`;
- `tier`.

Potential issue to investigate:

- notable-pool entries currently expose name, weight, ilvl, and generation type, but may not expose all mod family/tag metadata needed for every crafting mechanic.

If notable crafting needs additional tags/family information, update the scraper rather than hard-coding those values in the optimizer.

---

# Testing Philosophy

Every phase must contain three types of tests where applicable.

## 1. Rule tests

Small exact mechanical tests.

Examples:

- occupied family blocks another tier;
- fractured mods cannot be removed;
- item-level gating works.

## 2. Probability tests

Use synthetic pools with known analytical answers.

Examples:

```text
A weight 300
B weight 700

P(A) must equal 30%
```

Never validate probability code only against the live PoE dataset.

## 3. Reference-craft regression tests

The two real reference crafts serve as end-to-end regression cases.

Do not assert exact expected-chaos totals until the corresponding game mechanics have been verified. During earlier phases assert directional/structural behavior instead.

Examples:

```text
fractured Intelligence route < fractured Effect route
```

Once mechanics are confirmed, snapshot exact expected values with documented tolerances.

---

# Solver Correctness Rules

The LLM implementing this plan must follow these constraints:

1. **Never hard-code the answer to a reference craft.**
2. **Never hard-code target-mod probabilities from hand calculations.** Recalculate from eligible weights.
3. **Never treat modifier display percentages as invariant probabilities.**
4. **Never silently approximate a mechanic.** Mark approximations in results.
5. **Never put temporary league mechanics into core currency actions.**
6. **Never optimize only the happy path.** Failure recovery cost is part of expected cost.
7. **Never assume buying a fractured base is better than self-fracturing.** Compare them.
8. **Never assume a higher-value fractured modifier is the better starting fracture.** Compare downstream expected cost.
9. **Never treat numeric roll ranges as extra mod-hit rarity when Divine Orbs can repair them.** Model finishing cost separately.
10. **Never build separate one-off algorithms for notable jewels and explicit-mod jewels.** Extend the shared state/action framework.

---

# Recommended Development Order Summary

```text
Phase 0  Repo/data audit
   ↓ TEST / REVIEW
Phase 1  State + mod eligibility
   ↓ TEST / REVIEW
Phase 2  Exalt / Annul / Divine / Fracture
   ↓ TEST / REVIEW
Phase 3  Harvest
   ↓ TEST / REVIEW
Phase 4  Expected-cost solver + recovery loops
   ↓ TEST / REVIEW
Phase 5  Allflame plug-in
   ↓ TEST / REVIEW
Phase 6  Starting-base / self-fracture optimizer
   ↓ TEST / REVIEW
Phase 7  Three-notable cluster support
   ↓ TEST / REVIEW
Phase 8  Profit ranking
   ↓ TEST / REVIEW
Phase 9  Monte Carlo cross-validation
   ↓ TEST / REVIEW
Phase 10 Explainable output
   ↓ TEST / REVIEW
Phase 11 UI integration
```

---

# First Implementation Milestone

The first milestone is **not** "build the entire optimizer."

It is:

> Given a fixed ItemState and an Exalted Orb, produce the exact legal weighted outcome distribution using the real Large Cluster Jewel mod data.

The first LLM working on this should stop after Phase 0 and Phase 1 review before attempting the full optimizer.

That checkpoint should answer:

1. Can the current scraped data determine every legal mod for an arbitrary cluster state?
2. Are mod groups sufficient to enforce exclusivity?
3. What information is still missing for notable crafting?
4. Is Harvest exact-generation behavior sufficiently known?
5. Does the proposed state representation capture everything needed for fractures and numeric ranges?

Only after those answers are satisfactory should implementation proceed into currency simulation and optimization.
