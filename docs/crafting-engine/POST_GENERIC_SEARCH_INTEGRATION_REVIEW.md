# Post Generic Search Integration Review

## Scope

This review covers the implementation currently on `main` at:

`579774857bf58924a4c93b6aeae46b14302155fd`

Commit message:

`Integrate SolverCraftActionAdapter and GenericSearchEngine for clean-base Bellman search`

This pass was reviewed against:

- `docs/crafting-engine/NEXT_GENERIC_SEARCH_INTEGRATION_PLAN.md`
- the current Craft A output
- the current Craft C output
- the external Craft of Exile parity diagnostics
- the updated long-running Craft of Exile simulation supplied externally

The implementation is moving in the correct direction, but the current `GenericSearchEngine` should not yet be treated as a fully generic Bellman optimizer.

---

# Executive Summary

## What improved

The latest implementation successfully added several important pieces:

- a `SolverCraftActionAdapter` that bridges `CraftMechanic` into solver-compatible action behavior;
- a `GenericSearchEngine` entry point;
- a clean-normal-base T1 Intelligence search diagnostic;
- explicit base-prep currency rates in `PriceBook`;
- `getKnownRate()` and `evaluateRate()` price APIs;
- the first end-to-end route from a normal base through Transmutation and Alteration;
- preserved Craft A/C regression behavior.

The clean-base diagnostic currently derives:

- analytical T1 Intelligence Alteration probability: ~1.438%;
- expected Alterations: ~69.6;
- external Craft of Exile observation: ~1.521%;
- internal Monte Carlo: ~1.475%.

This is encouraging external parity.

## Main architectural issue

Despite the name and output wording, `GenericSearchEngine` is **not yet performing a general Bellman minimum-cost search over every legal registered action**.

The current implementation explicitly computes an Alteration hit probability and then derives a closed-form Alteration-spam EV:

```text
V(magic miss) = AlterationCost / P(target hit)
```

For a normal base it then constructs:

```text
Transmutation -> Alteration spam
```

The engine does not yet recursively or iteratively evaluate all available state/action alternatives.

In particular:

- Augmentation is discovered but its continuation EV is not compared against Alteration;
- Regal is not considered as a competing continuation action by `GenericSearchEngine`;
- there is no general `V(state) = min_a Q(state,a)` solution over the reachable state graph;
- clean-base generic search is currently limited to a special one-required-mod branch in `ExpectedCostSolver`.

Therefore the current clean-base result proves that the generic mechanics plumbing works, but it does **not yet prove cheapest-route discovery**.

---

# 1. Correct the Generic Search Architecture

The next major implementation pass should replace the current hand-derived Alteration policy with a real stochastic shortest-path / Bellman solver.

The target formulation is:

```text
Q(s, a) = Cost(a) + SUM[P(s' | s,a) * V(s')]

V(s) = min over legal actions a of Q(s,a)
```

Target-satisfied states should have:

```text
V(target) = 0
```

The policy should be derived from the minimum-Q action at every reachable canonical state.

## Why this matters

Consider a magic item with one non-target prefix and an open suffix.

A state-aware optimizer should compare at least:

```text
Alteration
- rerolls the whole magic item

Augmentation
- preserves the prefix
- adds one suffix
- may directly hit T1 Intelligence
```

The correct choice depends on:

- action cost;
- eligible suffix weight;
- continuation value after a miss;
- whether preserving the existing prefix is beneficial or harmful.

The current implementation always routes through the Alteration-spam formula and therefore cannot prove that Alteration is cheaper than Augmentation from this state.

This is the key architectural correction before adding more mechanics.

---

# 2. Use an Explicit Reachable State Graph

Do not implement the generic optimizer as naive recursive memoization only.

The crafting graph naturally contains cycles:

```text
Alteration miss -> another magic miss
Scour -> earlier clean state
Restart -> acquisition/preparation state
Annul miss/recovery -> previous crafting state
```

A safer architecture is:

1. start from the physical starting state;
2. enumerate legal mechanically-complete actions;
3. obtain analytical transition distributions from `CraftMechanic.getTransitions()`;
4. canonicalize successor states;
5. aggregate transitions that collapse to the same canonical state;
6. continue graph expansion until the reachable frontier is exhausted or deliberately bounded;
7. solve the value function over the graph;
8. extract the minimum-cost policy.

Recommended first solver approach:

- value iteration for simplicity;
- policy iteration later if performance demands it.

Do not claim global optimality outside the actually supported action frontier.

---

# 3. Remove the One-Mod Special-Case Search Path

`ExpectedCostSolver` currently invokes `GenericSearchEngine` only for a clean/unfractured state when:

```text
requiredMods.length === 1
and
no outcome branches
```

Otherwise the old placeholder path remains.

That is acceptable as a temporary integration bridge, but it must not become the production architecture.

The final optimizer must use the same generic search system for:

```text
1 target mod
2 target mods
3 target mods
4 target mods
```

There should not be separate 1/2/3/4-mod algorithms.

The target definition determines state completion; the solver remains the same.

---

# 4. Make Solver Output Match the Actual Generic Policy

The current clean-base branch can return a generic route while populating solver fields from legacy action plumbing.

For example, the returned `bestAction` may not actually be the first action selected by the generic policy.

This is unsafe for:

- Monte Carlo validation;
- reporting;
- future UI rendering;
- policy replay;
- debugging.

The resolved result should carry the exact state-dependent policy produced by generic search.

Recommended structure:

```ts
interface ResolvedCraftSolution {
    startingState: ItemState;
    acquisition: AcquisitionOption;
    target: TargetDefinition;
    solverContext: SolverContext;
    policy: Map<StateKey, ResolvedPolicyAction>;
    analyticalExpectedCraftingCostChaos: number;
    totalExpectedCostChaos: number;
    expectedCurrencies: Record<string, number>;
    validationMetadata: ...;
}
```

Equivalent architecture is acceptable.

The important invariant is:

> Reporting and Monte Carlo execute the exact policy that produced the analytical EV.

Do not reconstruct or approximate the winning policy afterward.

---

# 5. Price Provenance Still Needs a Structural Fix

The latest `PriceBook` changes are progress, but pricing provenance is still not safe enough for automatic cheapest-route claims.

Current defaults include values such as:

```text
alteration:   0.11c
transmutation: 0.03c
augmentation: 0.03c
regal:        0.20c
```

These defaults are merged directly into `rates`.

After construction, they are therefore indistinguishable from genuinely supplied/current market prices.

This means `getKnownRate()` may label a research/default price as though it were authoritative.

## Required architecture

Track price source explicitly.

For example:

```ts
interface CurrencyPrice {
    chaos: number;
    source: 'market' | 'user' | 'research-default';
    confidence: 'known' | 'research-fallback';
}
```

Equivalent design is fine.

Production search must distinguish:

```text
KNOWN / CURRENT PRICE
RESEARCH FALLBACK
UNAVAILABLE
```

A fallback value must never silently become `known` simply because it was inserted into a default rate table.

---

# 6. Remove the Unknown-Currency = 1c Behavior From Generic Search

`PriceBook.getRate()` still falls back to `1` for a completely unknown currency.

That behavior is dangerous for generic optimization.

An unknown price must not be treated as a real 1-chaos price.

Preferred behavior for production-facing APIs:

```text
unknown -> undefined / unavailable
```

Legacy compatibility may remain temporarily where required, but generic route search must use explicit price evaluation rather than permissive `getRate()` behavior.

---

# 7. Use Each Currency's Own Price

Transmutation and Augmentation currently derive costs indirectly from the Alteration price in parts of the shared mechanic implementation.

Now that the price model has explicit rates for:

- Transmutation;
- Alteration;
- Augmentation;
- Regal;

those mechanics should use their own currency entries.

Do not assume a permanent fixed ratio such as:

```text
Transmutation = Alteration * 0.25
Augmentation = Alteration * 0.25
```

unless such a ratio is explicitly being used as a research fallback and labeled accordingly.

---

# 8. Enforce `allowResearchFallbackPrices` Inside Generic Search

The action-discovery layer already understands:

```text
allowResearchFallbackPrices
```

However, `GenericSearchEngine` currently constructs adapters directly from mechanically complete registry entries.

The actual route-search frontier must enforce price policy too.

Expected behavior:

## Research mode

```text
allowResearchFallbackPrices = true
```

Fallback-priced actions may participate, but the selected route must disclose that it relies on approximate economics.

## Production / future UI mode

```text
allowResearchFallbackPrices = false
```

Actions with unavailable/research-only prices should either:

- be excluded from definitive cost ranking;
- or cause the route to be labeled economically incomplete.

Do not report a route as the cheapest market craft when its ranking depends on hidden research prices.

---

# 9. Preserve the Current External Alteration Parity Result

Current external comparison:

```text
Craft of Exile:
1.521% T1 Intelligence
~1 / 65.7
N = 209,862 Alterations

Analytical engine:
1.438%
~1 / 69.6

Internal seeded MC:
1.475%
~1 / 67.8
```

The difference between the analytical model and external observation is ~0.084 percentage points.

This is encouraging.

Do not tune weights or affix-count assumptions simply to force an exact match.

Keep Craft of Exile as independent evidence.

---

# 10. Updated External Craft of Exile Long-Run Evidence

A longer external Craft of Exile simulation is still running.

Current snapshot supplied after the latest implementation:

## Alteration -> T1 Intelligence

```text
Actions: 2456
Passed: 31
Observed: 1.262%
Displayed ratio: 1 / 80
```

This run is small compared with the permanent 209,862-attempt Alteration benchmark and should not replace the larger aggregate observation.

## Fracturing Orb -> desired fractured T1 Intelligence

```text
Attempts: 31
Successes: 6
Observed: 19.354%
Displayed ratio: 1 / 6
```

This sample is far too small to supersede the prior 1,000-attempt result of exactly 25.000%.

Keep the permanent fracture benchmark at:

```text
250 / 1000 = 25.000%
```

## Compound Harvest Defence target

Starting from fractured T1 Intelligence, the Harvest step is looking for the compound state used by the external recipe.

Current long-run observation:

```text
Harvest actions: 695,513
Passed: 809
Observed: ~0.1163%
Displayed ratio: 1 / 860
```

This is now strong external evidence.

Approximate 95% binomial interval:

```text
~0.1086% to ~0.1246%
```

This observation should be added to the permanent external-parity dataset as a separate benchmark once the run is considered final.

Do not conflate it with the simpler earlier benchmark:

```text
Harvest Defence -> T1 ES only from fractured Int
250 / 2907 = 8.599%
```

They test different success conditions.

## Annul pass after compound Harvest state

Current observation:

```text
Annul actions: 1031
Passed: 227
Observed: 22.017%
Displayed ratio: 1 / 5
```

Approximate 95% interval:

```text
~19.6% to ~24.6%
```

This is becoming useful external evidence.

Importantly, this benchmark validates more than the Annul Orb itself.

The pass rate depends on the composition of item states entering the Annul step, so it indirectly tests:

- Harvest-generated affix counts;
- junk/target composition;
- fractured-mod protection;
- the pass condition used by the recipe.

Therefore it should eventually be modeled as a fixed-policy/state-distribution parity benchmark, not merely `1 / number of removable mods`.

## Final Exalt

Current observation:

```text
Exalt attempts: 227
Successes: 5
Observed: 2.202%
Displayed ratio: 1 / 46
```

This sample is still too small to establish a mechanics mismatch.

Current engine suffix-pool expectation for:

```text
+4 All Attributes
OR
3% Attack Speed
```

after fractured T1 Intelligence is approximately:

```text
(300 + 250) / 14,450
= 3.806%
~1 / 26.3
```

For 5 successes out of 227 attempts, an approximate 95% interval remains wide enough to include the engine expectation.

Do not tune Exalted Orb mechanics to the current 5/227 observation.

Continue collecting data.

---

# 11. Add the New External Benchmarks as Data, Not Mechanics

Once the long-running Craft of Exile simulation is considered complete, add separate external observations for:

```text
compound_harvest_frac_int_to_es35
annul_after_compound_harvest
final_exalt_attr_or_attack_speed
```

Suggested benchmark metadata:

```ts
interface ExternalParityObservation {
    benchmarkId: string;
    source: 'craft-of-exile';
    exactStartingCondition: ...;
    actionOrPolicyStep: string;
    exactSuccessCondition: ...;
    attempts: number;
    successes: number;
    observedProbability: number;
    notes: string;
}
```

Do not store only prose descriptions if the starting/success conditions can be represented structurally.

The eventual parity system should support:

```text
External observed probability
vs
Analytical engine probability
vs
Internal Monte Carlo probability
```

for each benchmark.

External observations must never become hardcoded solver probabilities.

---

# 12. Do Not Change Harvest or Exalt Mechanics Yet

The new Harvest benchmark is statistically strong enough to warrant investigation, but the correct next step is **measurement**, not tuning.

Before changing Harvest mechanics, build an exact internal parity diagnostic matching the same external recipe state and success condition.

Then compare:

```text
Craft of Exile observed compound Harvest probability
Analytical engine compound Harvest probability
Internal Monte Carlo compound Harvest probability
```

If both internal models disagree with external evidence, investigate shared mechanics assumptions.

Likely audit areas include:

- guaranteed Defence modifier selection;
- number of total explicit modifiers generated by Harvest reforge;
- additional-affix count distribution;
- prefix/suffix occupancy;
- mod-group exclusion handling;
- eligible weighted pool construction.

Do not modify the model solely because the external result is different.

First identify the mechanics root cause.

---

# 13. Keep Magic Affix-Count Generation Marked Partial

The shared Transmutation/Alteration model currently assumes a magic affix-count distribution equivalent to:

```text
25% prefix only
25% suffix only
50% prefix + suffix
```

or:

```text
50% one-affix magic
50% two-affix magic
```

The strong T1 Intelligence parity is encouraging, but it does not independently prove this entire distribution.

Continue labeling this as a mechanics assumption until independently verified.

Do not adjust it simply to close the remaining ~0.084 percentage-point Alteration gap.

---

# 14. Next Mechanics After True Generic Bellman Search

Do not add a large set of actions before the state/value solver is genuinely generic.

Recommended order after the Bellman rewrite:

1. Scouring Orb / reset semantics
2. restart / reacquire semantics
3. shared Exalted Orb transition mechanic
4. generic Fracturing Orb
5. Chaos Orb
6. bench/filler actions needed for fracture preparation

Each mechanic should provide:

- legality;
- price + price provenance;
- analytical transition distribution;
- seeded sampled transition;
- canonical successor states.

The generic solver then evaluates it automatically.

---

# 15. Scour and Restart Must Be First-Class State Transitions

A real crafting optimizer needs explicit recovery loops.

Examples:

```text
wrong magic roll
-> Alteration again

wrong fracture
-> restart/reacquire/prep

post-fracture rare item
-> Scour
-> continue from fractured clean state

bad rare craft
-> Scour/restart
```

Do not encode these only in reporting text.

Their expected future cost must be part of Bellman continuation EV.

---

# 16. Generic Fracturing Must Operate on the Actual State

Do not hardcode generic Fracturing Orb success as 25%.

A correct mechanic should:

- inspect the actual explicit modifiers on the current item;
- determine legal fracture candidates;
- select according to real game mechanics;
- mark the selected modifier fractured;
- preserve the remaining physical state;
- allow wrong-fracture outcomes to flow through restart/recovery policy.

The external 25% benchmark should emerge naturally for an exactly four-mod item where one of the four eligible mods is desired.

---

# 17. Preserve Craft A Regression

Current Craft A remains healthy:

```text
Analytical total: 7623.7c
~38.12 div
Analytical vs MC difference: 1.16%
Missing policy states: 0
Fallback actions: 0
```

Do not regress this fixture without a verified mechanics correction.

Craft A remains the stable fractured-route regression fixture.

---

# 18. Preserve Craft C Regression

Current Craft C remains provisionally healthy:

```text
Analytical total: 42814.4c
~214.07 div
Analytical vs MC difference: 3.65%
Completion: 1999 / 2000
Timeouts: 1
Missing states: 0
Fallback actions: 0
```

Current primary action differences remain within the provisional 10% gate.

Craft C remains the heavy-tail/generalization regression fixture.

Do not tune it to individual Monte Carlo seeds.

---

# 19. Global Optimality Still Not Proven

Keep:

```text
GLOBAL OPTIMALITY: NOT YET PROVEN
```

The current generic search is not yet a general minimum-EV solver over all registered legal actions, and the supported action frontier remains incomplete.

This label should remain until:

- generic Bellman search truly evaluates all mechanically complete legal actions at each state;
- important reset/restart actions are represented;
- normal -> magic -> rare -> fracture -> recovery paths are searchable;
- the supported action frontier is explicitly documented.

---

# 20. Game-Mechanics Fidelity Remains Partial

Keep:

```text
GAME-MECHANICS FIDELITY: PARTIAL
```

Known unresolved or partially validated areas include:

- magic affix-count distribution;
- Harvest generated-affix distribution;
- exact external compound Harvest parity;
- self-fracture preparation model;
- incomplete shared-mechanics migration;
- price provenance;
- Allflame intentionally deferred.

Analytical/MC agreement only proves internal consistency when both systems share the same mechanics assumptions.

---

# 21. Do Not Reintroduce Allflame

Allflame remains disabled.

Do not spend the next pass on Intangibility or best-of-four degradation mechanics.

Ordinary state-search correctness remains the priority.

---

# 22. Do Not Build the Frontend Yet

The final frontend remains intentionally thin:

```text
User selects:
- cluster/base
- item level
- passive count
- 1-4 target mods

UI creates TargetDefinition
    ->
backend optimizer
    ->
route + economics + risk
```

Do not put recipe logic into frontend code.

The backend should first be capable of genuine multi-action state-dependent route discovery.

---

# 23. No Unit Tests

Do not add or expand unit tests.

Continue validation with:

- external Craft of Exile parity diagnostics;
- shared-mechanic seeded diagnostics;
- canonical-state diagnostics;
- generic Bellman route diagnostics;
- Craft A end-to-end regression;
- Craft C end-to-end regression;
- multi-seed Monte Carlo;
- compact output artifacts.

---

# Recommended Next Implementation Order

1. Replace the hand-derived `GenericSearchEngine` Alteration policy with a real state/value Bellman solver.
2. Build the reachable canonical state graph from mechanically complete registry actions.
3. Use value iteration or policy iteration to solve cyclic crafting states.
4. Return the exact state-dependent policy in `ResolvedCraftSolution`.
5. Remove the one-required-mod-only architectural dependency from the generic path.
6. Fix price provenance so supplied/current prices are distinguishable from research defaults.
7. Remove unknown-currency = 1c behavior from generic search.
8. Use dedicated Transmutation/Augmentation/Regal prices rather than Alteration-derived ratios.
9. Enforce `allowResearchFallbackPrices` inside the actual generic search frontier.
10. Re-run the clean-base T1 Intelligence diagnostic and print Q-values for competing actions.
11. Specifically verify whether Augmentation is cheaper than Alteration from any prefix-only magic miss states.
12. Rerun Craft A and Craft C regressions.
13. Add exact compound-Harvest parity diagnostic matching the long-running Craft of Exile recipe.
14. Add Scour/reset mechanics.
15. Add restart/reacquire semantics.
16. Migrate Exalt into the shared mechanics registry.
17. Implement generic Fracturing transitions.
18. Build a fixed-policy parity runner for the full Craft of Exile recipe.
19. Bring Craft B back only after clean -> magic -> rare -> reset search works generically.
20. Keep Allflame/frontend deferred.

---

# Validation Requirements for the Next Pass

## Generic solver

Must demonstrate that selected actions are chosen by actual minimum continuation EV rather than by a scripted route.

For representative states, print:

```text
State
Legal action A -> Q value
Legal action B -> Q value
Legal action C -> Q value
Selected minimum
```

At minimum verify:

- normal clean state;
- prefix-only magic miss;
- suffix-only magic miss;
- two-affix magic miss.

## External Alteration parity

Continue reporting:

```text
Craft of Exile
Analytical
Internal MC
Difference
```

Do not tune to exact parity.

## Craft A

Preserve:

- analytical-vs-MC stability;
- missing states = 0;
- fallback actions = 0;
- no unexplained timeout regression.

## Craft C

Preserve:

- pooled action counts within provisional limits;
- completion >= 99%;
- missing states = 0;
- fallback actions = 0;
- censoring explicitly reported.

---

# Completion Report Required From the Next Implementation Pass

When the next implementation is committed, report:

- commit SHA;
- files changed;
- generic Bellman/value-solver design;
- how cycles are solved;
- number of reachable canonical states in the T1 Intelligence reference search;
- Q-values for competing actions in representative magic states;
- whether Augmentation ever beats Alteration;
- exact clean-base discovered route/policy;
- price-provenance changes;
- fallback-price enforcement behavior;
- external Alteration parity result;
- exact internal compound-Harvest parity result if implemented;
- Craft A regression status;
- Craft C regression status;
- remaining mechanics not yet searchable;
- whether `GLOBAL OPTIMALITY` remains unproven.

---

# Bottom Line

The latest implementation is a successful integration bridge, but it should not yet be described as a fully generic Bellman route optimizer.

The next milestone is to make the action registry supply the transition graph while a true state/value solver chooses the minimum-EV action at every reachable state.

That is the architectural step that directly unlocks the long-term product goal:

```text
User chooses any 1-4 mods
    ->
optimizer discovers the cheapest supported crafting policy
```

without manually scripting the recipe family.
