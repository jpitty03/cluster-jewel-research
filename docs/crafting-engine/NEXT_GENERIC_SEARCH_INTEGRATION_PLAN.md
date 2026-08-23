# Next Generic Search Integration Plan

## Purpose

This document defines the next implementation pass after completion of:

- `docs/crafting-engine/CRAFT_OF_EXILE_PARITY_AND_BASE_PREP_WORK_PLAN.md`
- implementation commit `70b7a133fbd2dba8de7a255c4c4f5c5e7c28fd08`

The prior pass already implemented the Craft of Exile parity fixture, `ResolvedCraftSolution`, and shared mechanics for Transmutation, Alteration, Augmentation, and Regal. Do **not** redo that work.

The next milestone is to make those mechanics part of the **actual optimizer search graph**, so the engine can discover a clean-base route rather than only simulate or diagnose individual mechanics.

The long-term product goal remains:

```text
User selects:
- cluster/base
- item level
- passive count
- 1-4 desired mods

TargetDefinition
    ->
automatic starting-state discovery
    ->
generic legal-action discovery
    ->
shared mechanics transitions
    ->
Bellman / expected-cost search
    ->
least-expensive supported crafting route
```

Craft A and Craft C remain regression fixtures, not special-case solver architectures.

---

## Current External Craft of Exile Evidence

Permanent external observations already captured in the repo:

### Alteration -> T1 Intelligence

Combined prior runs:

- 209,862 Alterations
- 3,193 T1 Intelligence hits
- observed probability ~1.521%
- approximately 1 / 65.7

This is an external validation reference only. Do not hardcode or tune the optimizer to this probability.

### Fracturing Orb -> T1 Intelligence

- 1,000 fracture attempts
- 250 successful T1 Intelligence fractures
- 25.000%

This strongly supports the expected 1-in-4 result on an exactly four-mod rare item.

### Harvest Defence -> T1 ES from fractured T1 Int

- 2,907 attempts
- 250 hits
- 8.599%
- approximately 1 / 11.63

This is also an external observation only.

### Longer external simulation currently running

Interim results from the running Craft of Exile recipe:

- Alteration -> T1 Int: 12 / 783 = 1.532%
- Fracturing Orb -> T1 Int: 3 / 12 = 25.000% (sample too small to add new evidence beyond prior 1,000-attempt run)
- Harvest Defence -> required T1 ES + 35% state with fractured T1 Int: 505 / 423,533 = 0.1192%, ~1 / 839
- Annul pass: 144 / 647 = 22.256%
- Final Exalt success: 2 / 144 = 1.388%

The final Exalt sample is still too small to use as mechanics evidence. Do not tune Exalt behavior to it.

Do not change Harvest/Annul/Exalt mechanics based on the interim long-run values in this implementation pass. The completed external simulation will be reviewed separately.

---

# Primary Objective

## Make the completed shared mechanics Bellman-searchable

The repository now contains shared mechanics definitions for base preparation, but the production evaluator still builds the main expected-cost search around the mature Exalt / Annul / Harvest action set.

The next pass must bridge the shared `CraftMechanic` registry into `ExpectedCostSolver` without reimplementing the same mechanics in another parallel hierarchy.

The goal is to make this executable by the actual optimizer:

```text
normal base
    ->
Transmutation
    ->
magic state
    ->
Alteration / Augmentation
    ->
Regal
    ->
rare state
```

The optimizer, not a scripted recipe, must choose the route.

---

# 1. Add a CraftMechanic -> Solver Adapter

Prefer an adapter such as:

```text
CraftMechanic
    -> SolverCraftActionAdapter
    -> ExpectedCostSolver
```

Equivalent naming/design is acceptable.

The adapter should delegate to the mechanic's existing:

- `isLegal(...)`
- `getCost(...)`
- `getTransitions(...)`

Do not duplicate transition math.

The central invariant should be:

> A mechanically complete action has one analytical transition definition, and every solver path uses it.

Only mechanics with executable transition behavior should be admitted to the generic search frontier.

Do not add a registry entry merely because it has metadata.

---

# 2. Preserve Mature Craft A/C Behavior During Migration

The current Craft A/C policy model has strong analytical-vs-Monte-Carlo agreement.

Do not replace all mature Exalt/Harvest behavior in one pass.

Integrate base-prep mechanics incrementally.

After each structural search change, rerun:

- Craft A
- Craft C

Unexpected regressions must be explained before continuing.

Do not tune Craft A/C formulas merely to preserve a previous number if a verified mechanics correction legitimately changes the result.

---

# 3. Create a Real End-to-End Clean-Base Search Diagnostic

Add a diagnostic/reference workflow that starts from a real normal cluster jewel and invokes the **actual optimizer**.

Recommended first target:

```text
Base:
12-passive ilvl 84 Large Cluster Jewel
Attack Damage while holding a Shield

Target:
T1 Intelligence
```

Do not script the action sequence.

The optimizer must discover its cheapest supported route from the normal starting state.

The diagnostic should print:

- starting physical state;
- legal actions considered at each selected state;
- selected action sequence;
- analytical continuation EV per selected action;
- expected currency counts;
- total expected cost;
- whether any research-fallback prices were required;
- canonical state count;
- missing/unresolved state count;
- selected terminal state.

The expected architecture is something in the family of:

```text
normal
-> Transmutation
-> magic
-> Alteration
-> target
```

but the diagnostic must not require that exact route. If another modeled route is cheaper, the optimizer should be allowed to choose it.

This is a diagnostic, **not a unit test**.

---

# 4. Use ResolvedCraftSolution as the Stable Validation Artifact

The prior pass introduced `ResolvedCraftSolution`.

Strengthen the abstraction so validation/reporting does not reconstruct important state from the original request.

A resolved solution should carry, directly or through one stable nested object:

- selected physical starting `ItemState`;
- selected acquisition option;
- `TargetDefinition`;
- immutable solver context;
- resolved policy/action map;
- analytical expected crafting cost;
- total expected cost;
- expected currency usage;
- sale/profit data when applicable;
- enough information for Monte Carlo to execute the exact resolved policy.

Core validation fields should become non-optional where practical.

The Monte Carlo validator should consume the resolved solution instead of reverse-engineering the winner from `startingStates` or other request fields.

This also becomes the eventual backend contract for the frontend.

---

# 5. Fix PriceBook Missing-Rate Semantics Before Base-Prep Search Affects Rankings

Current permissive price behavior is unsafe for production route discovery.

An unknown currency must not silently become a legitimate `1c` price.

Introduce an explicit lookup API such as:

```ts
getKnownRate(currency): number | undefined
```

or equivalent.

The generic search layer must distinguish:

```text
KNOWN
RESEARCH_FALLBACK
UNAVAILABLE
```

A missing price and a 1-chaos price are not the same thing.

Preserve existing compatibility where necessary, but do not let generic route search silently optimize with fabricated prices.

---

# 6. Enforce Research-Fallback Pricing Policy in Search

Continue using an explicit option such as:

```text
allowResearchFallbackPrices
```

Expected behavior:

### Research / diagnostic mode

`true`

Fallback prices may be used, but the winning route must clearly report that it depends on research estimates.

### Production / future frontend mode

`false`

The optimizer must not claim a route is cheapest if required currency prices are unknown or only research fallbacks.

Either:

- exclude that route/action; or
- mark the economics incomplete and refuse a definitive cheapest-route claim.

Do not hide this distinction in reporting.

---

# 7. Apply the Same Price-Confidence Model to Acquisition Discovery

Automatic self-fracture acquisition still contains approximate economics.

That is acceptable while explicitly labeled approximate, but acquisition ranking should use the same confidence framework as ordinary actions.

The eventual route result should be capable of saying:

```text
Route A: 38d, KNOWN prices
Route B: 34d, uses RESEARCH_FALLBACK acquisition assumptions
```

A lower approximate number should not silently outrank a fully priced production route without disclosure.

Do not manufacture missing market fracture prices.

---

# 8. Stop Re-Solving the Same Physical Starting State for Different Acquisition Methods

The correct conceptual model is already present:

```ts
StartingStateCandidate {
    state,
    acquisitions[]
}
```

Keep that model through evaluation rather than flattening too early.

For example:

```text
Physical state:
fractured 35% Effect

Acquisition A:
self-fracture

Acquisition B:
market purchase
```

The downstream Bellman value is identical.

Solve:

```text
DownstreamEV(fractured 35 state)
```

once.

Then compute:

```text
Self route total   = self acquisition + downstream EV
Market route total = market acquisition + downstream EV
```

This will become increasingly important as generic search becomes more expensive.

---

# 9. Preserve and Extend External Craft of Exile Parity Reporting

The external parity framework is now permanent and should remain separate from optimizer strategy logic.

The desired comparison model is:

```text
External Craft of Exile observation
vs
Analytical mechanics result
vs
Our seeded Monte Carlo result
```

Do not feed Craft of Exile probabilities into solver mechanics.

Do not tune constants to make the table green.

The observation should remain external evidence.

The final architecture should support a benchmark definition containing:

- benchmark id;
- exact starting state definition;
- action;
- success condition;
- external attempts;
- external successes;
- external probability;
- analytical probability;
- internal MC probability;
- confidence/statistical comparison;
- parity status.

Do not finalize the current long-running Harvest/Annul/Exalt observations until the simulation finishes.

---

# 10. Audit the Magic Affix-Count Assumption, But Do Not Tune It Yet

Current base-prep transition logic models magic rolling using a one-affix/two-affix distribution.

Keep that assumption explicitly documented as partially validated mechanics.

Matching the aggregate T1 Intelligence probability is encouraging, but it does not prove the entire generated magic-state distribution is correct.

Do not alter the distribution solely to better fit the observed T1 Intelligence frequency.

Eventually validate independently:

- one-affix probability;
- two-affix probability;
- prefix-only probability;
- suffix-only probability;
- prefix+suffix probability.

Until then:

```text
GAME-MECHANICS FIDELITY: PARTIAL
```

must remain.

---

# 11. Next Shared Mechanics After Clean-Base Search Works

Once Transmutation/Alteration/Augmentation/Regal are genuinely traversable by Bellman search, implement the remaining ordinary actions incrementally.

Recommended order:

1. Scouring Orb / reset semantics
2. Exalted Orb migration into shared mechanics
3. Chaos Orb
4. generic Fracturing Orb
5. restart/reacquire action semantics
6. bench/filler actions needed for fracture preparation

For every migrated mechanic:

- legality and transitions come from one shared mechanic;
- analytical distribution sums to 1;
- seeded sampling agrees with analytical transitions;
- canonical successor states are correct;
- Craft A/C regression is rerun when relevant.

Do not migrate every action in one large change.

---

# 12. Scour and Restart Are Required Before Full Self-Fracture Discovery

A production optimizer cannot discover the known Craft of Exile-style preparation/recovery route without reset behavior.

Eventually the search must be able to reason about paths like:

```text
magic attempt misses target
-> Alteration again
```

and:

```text
fracturing attempt misses desired mod
-> restart from acquisition/prep state
```

and:

```text
post-fracture item
-> Scour
-> continue crafting
```

Restart must be a real transition/action with correct expected future cost, not an ad-hoc report instruction.

---

# 13. Fracturing Orb Must Eventually Operate on the Real Prepared Item State

The current external evidence strongly supports 25% success when the item has exactly four explicit modifiers and one desired target mod.

The eventual shared Fracturing mechanic should:

- require the correct legal item state;
- choose among eligible explicit modifiers according to actual game mechanics;
- mark the selected modifier fractured;
- preserve the physical item state;
- make wrong fractures recover/restart through normal search transitions.

Do not hardcode `25% target success` as a generic mechanic.

It should naturally be 25% when there are exactly four equally eligible explicit modifiers.

---

# 14. Bring Craft B Back Only After Clean -> Magic -> Rare Search Is Real

Craft B should not be implemented with its own recipe logic.

Use it later as the next major generalization fixture after:

- Transmutation is searchable;
- Alteration is searchable;
- Augmentation is searchable;
- Regal is searchable;
- Scour/reset is modeled;
- restart semantics exist.

Its purpose is to answer:

> Can the generic optimizer discover a sensible clean-base notable-cluster route without being given the recipe?

Do not create a Craft-B-specific solver.

---

# 15. Keep Craft A and Craft C as Regression Fixtures

## Craft A

Continue monitoring:

- analytical vs Monte Carlo total cost;
- pooled Harvest/Annul/Exalt action counts;
- terminal branch distribution;
- missing policy states;
- fallback actions;
- timeout/censoring behavior.

It should remain the stable fractured-route regression fixture.

## Craft C

Continue monitoring:

- aggregate multi-seed total cost;
- pooled Harvest <= 10%;
- pooled Annul <= 10%;
- pooled Exalt <= 10%;
- completion >= 99%;
- rare censoring explicitly reported;
- missing states = 0;
- policy fallbacks = 0.

Do not tune individual random seeds.

---

# 16. Global Optimality Must Still Remain Unproven

Do not change:

```text
GLOBAL OPTIMALITY: NOT YET PROVEN
```

The action frontier is still incomplete.

At minimum, the following remain incomplete or not fully search-integrated:

- base-prep actions in production Bellman search;
- Scour/reset;
- shared Exalt transitions;
- Chaos;
- Fracturing;
- restart/reacquire;
- bench/filler actions;
- broader finishing mechanics;
- Allflame intentionally deferred.

The optimizer can only be globally optimal over the mechanics it actually knows how to traverse.

---

# 17. Do Not Reintroduce Allflame Yet

Allflame remains disabled.

Do not spend this pass implementing Intangibility state or Allflame transition mechanics.

Ordinary crafting search must become mature first.

---

# 18. Do Not Build the Frontend Yet

The future UI remains thin:

```text
User selects:
- base
- ilvl
- passive count
- 1-4 mods

UI builds TargetDefinition
    ->
backend optimizer
    ->
route/economics/risk result
```

Do not put crafting recipes or strategy logic in frontend code.

Wait until generic route discovery is working from a clean base.

---

# 19. No Unit Tests

Do not add or expand unit tests.

Continue validation using:

- shared-mechanic seeded diagnostics;
- external Craft of Exile parity diagnostics;
- canonical-state diagnostics;
- clean-base end-to-end search diagnostic;
- Craft A end-to-end regression;
- Craft C end-to-end regression;
- multi-seed Monte Carlo;
- compact output files.

---

# Recommended Implementation Order

1. Add `CraftMechanic -> ExpectedCostSolver` adapter.
2. Admit only mechanically complete registry actions to generic search.
3. Add simple clean-base T1 Intelligence Bellman-search diagnostic.
4. Strengthen `ResolvedCraftSolution` as the validation contract.
5. Fix `PriceBook` missing-rate semantics.
6. Enforce `allowResearchFallbackPrices` in generic route search.
7. Apply price-confidence semantics to acquisition discovery.
8. Preserve physical starting-state candidates through evaluation and solve downstream once per physical state.
9. Rerun Craft A/C.
10. Add Scour/reset shared mechanics.
11. Add restart/reacquire semantics.
12. Migrate Exalt to the shared transition registry.
13. Add generic Fracturing Orb mechanics.
14. Build a fracture-prep end-to-end discovery diagnostic.
15. Rerun external parity and A/C regressions.
16. Bring Craft B back only after clean-base traversal is genuinely searchable.
17. Keep Allflame and frontend deferred.

---

# Completion Requirements

When this implementation pass is complete, commit code and regenerated diagnostics to `main` and report:

- commit SHA;
- files changed;
- `CraftMechanic -> solver` integration design;
- which mechanics are now actually Bellman-searchable;
- clean-base T1 Intelligence discovered route;
- analytical expected action counts/cost for that route;
- Alteration parity vs Craft of Exile;
- `ResolvedCraftSolution` changes;
- PriceBook missing-rate changes;
- fallback-price policy behavior;
- physical-state solve deduplication status;
- Craft A regression results;
- Craft C regression results;
- remaining mechanics not yet searchable;
- remaining external-parity assumptions.

Do not use the still-running Craft of Exile final Exalt sample to modify Exalt mechanics in this pass.

---

# Key Principle

The project has already implemented several individual base-prep mechanics.

The next milestone is **not** to implement them again.

The next milestone is to make the actual optimizer traverse them:

```text
real physical state
    ->
legal shared mechanic
    ->
weighted successor states
    ->
Bellman continuation values
    ->
cheapest supported route
```

That is the architectural step that moves the engine toward the final goal of allowing a user to select any 1-4 target mods and having the backend discover the least-expensive crafting strategy automatically.
