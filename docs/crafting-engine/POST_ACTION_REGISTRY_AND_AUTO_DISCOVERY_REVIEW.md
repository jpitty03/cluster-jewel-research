# Post Action Registry & Automatic Discovery Review

Reviewed `main` at implementation commit `8c51a7a2bffd2a4f0d6d56efd5fdf8d776f306ee`.

Primary evidence reviewed:

- `output-craft-a-review.txt`
- `output-craft-c-review.txt`
- `crafting-engine/src/index.ts`
- `crafting-engine/src/probability/multiSeed.ts`
- `crafting-engine/src/rules/actionDiscovery.ts`
- `crafting-engine/src/rules/actionRegistry.ts`
- `crafting-engine/src/rules/harvestCrafts.ts`
- `crafting-engine/src/solver/strategyDiscovery.ts`
- implementation diff for `8c51a7a2bffd2a4f0d6d56efd5fdf8d776f306ee`

## Executive summary

This is another strong architecture step toward the end goal: a frontend where the user selects a base plus any 1–4 target mods and the backend discovers the least-expensive supported crafting route.

The most important successes in this pass are:

1. pooled multi-seed action metrics now show that Craft C's prior per-seed Annul disagreement was mostly high-variance behavior rather than a clear systematic analytical mismatch;
2. canonical state keys now preserve mod-group identity and context scope, fixing the unsafe junk-collapse issue identified in the prior review;
3. Harvest metadata has been moved into an explicit data-driven table;
4. legal-action discovery now routes through a registry instead of independently hardcoding most legality/cost logic;
5. automatic starting strategy generation is now actually wired into `CraftingOptimizer` when no manual starting states are supplied.

However, several production-readiness issues remain before automatic discovery should be trusted for arbitrary 1–4-mod targets.

The highest-priority findings are:

- the new `multiSeed.ts` claims a solve-once / validate-many architecture, but still calls `optimizer.optimizeCraft()` once per seed and therefore still resolves the strategy repeatedly;
- the canonical state key's roll-sensitive encoding is incomplete: it records that a roll requirement exists, but not whether the current roll passes/fails or what roll bucket the state is in;
- the automatically generated `Clean Base` is represented as an empty **rare** item rather than a normal/white clean base, which can expose the wrong legal action set;
- the new action registry is currently authoritative only for legality and pricing, not for transition mechanics, so analytical and Monte Carlo implementations can still drift;
- research fallback currency prices are still silently used by automatic discovery and one fallback (`Chaos Orb`) is even labeled `known` when price data is absent;
- the newly wired automatic starting-state path is not actually exercised by Craft A/C because those demos still pass manual `startingStates`, so the production discovery path needs its own diagnostic run before it can be considered validated.

## 1. Craft A remains an excellent regression fixture

Analytical expected total:

- `7623.7c` (~38.12 div)

Five-seed total-cost summary remains strong:

- min MC mean: `7466.6c`
- max MC mean: `7651.1c`
- mean of seed means: `7568.1c`
- aggregate mean difference vs analytical: about `-0.73%`
- point diff range: `0.24%–2.06%`
- completion: `100%` for every seed
- timeouts: `0`

New pooled action metrics across 10,000 trials:

| Action | Analytical EV | Pooled MC mean | Pooled diff | Between-seed SD |
|---|---:|---:|---:|---:|
| Harvest | 2545.60 | 2525.07 | 0.81% | 33.28 |
| Annul | 219.22 | 216.75 | 1.13% | 2.75 |
| Exalt | 116.53 | 115.45 | 0.92% | 1.32 |

### Assessment

Craft A remains **multi-seed stable and validated for the currently implemented mechanics**.

The pooled action metrics are a better regression signal than enforcing a rigid per-seed threshold.

Do not tune Craft A further unless a real mechanics correction requires it.

## 2. Craft C aggregate action counts now look healthy

Analytical expected total:

- `42814.4c` (~214.07 div)

Five-seed total-cost summary:

- min MC mean: `41249.6c`
- max MC mean: `44064.6c`
- mean of seed means: `42483.5c`
- aggregate mean difference vs analytical: about `-0.77%`
- individual point diff range: `1.80%–3.65%`
- only one timeout across 10,000 requested trials

New pooled action metrics:

| Action | Analytical EV | Pooled MC mean | Pooled diff | Between-seed SD |
|---|---:|---:|---:|---:|
| Harvest | 5657.92 | 5494.70 | 2.88% | 179.01 |
| Annul | 910.37 | 975.40 | 7.14% | 30.98 |
| Exalt | 371.51 | 392.80 | 5.73% | 12.52 |

### Assessment

This is a meaningful improvement in interpretation.

The prior individual seeds with Annul differences above 10% did not translate into a pooled systematic mismatch above the current 10% action-count gate.

Therefore Craft C can now reasonably be labeled:

**MULTI-SEED STABLE FOR THE CURRENT IMPLEMENTED POLICY MODEL**

while still keeping:

- `GAME-MECHANICS FIDELITY: PARTIAL`
- `GLOBAL OPTIMALITY: NOT YET PROVEN`

because those are separate claims.

Do not confuse aggregate internal consistency with proof of real-game mechanics.

## 3. Canonical state equivalence is much safer now

The prior unsafe implementation collapsed non-target junk by craft tags and could merge states that blocked different mod groups.

The new key preserves:

- `modGroup` or `modId`;
- tier;
- craft tags;
- fractured status;
- prefix/suffix side;
- rarity;
- base type;
- cluster type;
- item level;
- passive count.

That addresses the largest correctness risk from the previous review.

The explicit state-equivalence contract is also the correct principle:

> two states may share a Bellman key only when modeled legal actions, immediate costs, and transition distributions are equivalent.

Preserve this contract.

## 4. Critical remaining canonical-key bug: roll-sensitive states are not actually distinguished

The new code attempts to preserve roll-sensitive target information by appending a string such as:

```text
:roll(statKey>=minValue)
```

when the target has a `finalRollRequirements` entry.

However, that suffix is identical regardless of the mod's actual current roll.

For example, if a future target requires:

```text
Intelligence >= 8
```

then a +6 Intelligence state and a +8 Intelligence state could still generate the same group/tier/roll-requirement string:

```text
AfflictionJewelSmallPassivesGrantInt:t1:...:roll(Intelligence>=8)
```

unless some other state field happens to distinguish them.

That violates the state-equivalence contract because one state satisfies the target roll and the other does not.

### Required fix

Encode the **actual target-relevant roll bucket**, not merely the existence of a requirement.

For threshold-style requirements, something as simple as:

```text
roll(Intelligence:PASS)
roll(Intelligence:FAIL)
```

can be sufficient if all future mechanics are invariant within the pass/fail bucket.

If exact values affect future actions such as Divine outcomes, preserve the exact value or a mechanically valid bucket.

Do not include irrelevant numeric rolls, but do distinguish any roll that changes:

- target completion;
- legal actions;
- transition probabilities;
- continuation EV.

## 5. Automatic starting strategy generation is now wired into the optimizer

`CraftingOptimizer` now calls `generateStartingStrategies(...)` when the caller does not provide `startingStates`.

This is exactly the production direction needed for the final UI.

The user-facing request can eventually be reduced toward:

- base type;
- cluster type;
- item level;
- passive count;
- TargetDefinition;
- price context.

The engine can then generate:

- clean base;
- fractured required mod A;
- fractured required mod B;
- etc.;
- self-fracture acquisition;
- market acquisition when supplied.

This is a major architectural milestone.

## 6. Critical: generated `Clean Base` is modeled as an empty rare item

`generateStartingStateCandidates()` currently creates the clean physical state as:

```ts
rarity: 'rare',
prefixes: [],
suffixes: []
```

That is not the same thing as an ordinary clean/white base.

This matters because legal actions depend on rarity.

With the current action registry:

- Alteration is legal only on `magic`;
- Augmentation is legal only on `magic`;
- Regal is legal only on `magic`;
- Chaos is legal on `rare`.

So the automatically generated clean base starts in a state where the engine may immediately consider rare-item actions while being unable to naturally enter the expected normal -> magic -> rare base-prep route.

### Required fix

Model actual item rarity/state progression explicitly.

At minimum, the starting clean candidate should reflect the real game's clean base state, likely:

```text
normal / white
```

and the action registry should include the legal transformation step into magic rarity.

If the domain currently lacks `normal`, add it before relying on automatic base-prep discovery.

Do not fake a white base as an empty rare item solely to fit existing solver assumptions.

This will become especially important when Craft B is reintroduced to validate clean -> magic -> rare route discovery.

## 7. The automatic starting-state path is not yet regression validated

Craft A and Craft C still supply explicit manual `startingStates` in the demo.

Therefore their excellent outputs prove that the established manual-reference path still works, but they do **not** prove that:

```text
no startingStates supplied
    -> generateStartingStrategies(...)
    -> evaluate generated candidates
```

works correctly.

Before calling automatic starting discovery production-ready, add a diagnostic/demo mode that runs the same target with manually supplied starts removed and prints:

- generated physical candidates;
- acquisition methods per candidate;
- selected best route;
- downstream EV per unique state;
- comparison against the known manual fixture candidate set.

Do this as a diagnostic/reference run, not a unit test.

## 8. Starting-state discovery still duplicates identical downstream solves by acquisition method

The design type is good:

```ts
StartingStateCandidate {
  state,
  label,
  acquisitions[]
}
```

But `generateStartingStrategies()` immediately flattens this into multiple `StartingCraftOption`s, one per acquisition.

Then `CraftingOptimizer` evaluates every flattened option independently.

That means the same physical fractured state can still be solved once for self-fracture and again for market purchase even though the downstream Bellman value is identical.

### Better production architecture

Keep candidate evaluation grouped:

```text
Physical state
    -> solve downstream EV once
    -> add each acquisition cost
    -> rank acquisition variants
```

This will save substantial work once automatic search becomes expensive.

It also better matches the conceptual separation already established between physical state and acquisition.

## 9. `multiSeed.ts` does not actually implement solve-once / validate-many yet

The new comments state:

> Implements solve-once, validate-many architecture to avoid repeated Bellman solving.

The function does solve a `baseResponse` once with Monte Carlo disabled.

However, inside the seed loop it still does:

```ts
const simResponse = optimizer.optimizeCraft(simReq);
```

for every seed.

That still invokes the optimizer and deterministic strategy evaluation once per seed.

Therefore the implementation is **not yet solve-once / validate-many**, despite the comment.

There is also an imported `MonteCarloSimulator` that is not being used for the intended direct policy replay.

### Required fix

Expose enough resolved solution/context data from the initial solve to construct Monte Carlo directly for each seed, conceptually:

```ts
const solution = optimizer.solve(requestWithoutMc);

for (const seed of seeds) {
    validateResolvedPolicy(solution, seed);
}
```

or equivalent.

Do not rerun route discovery/Bellman resolution merely to change the RNG seed.

This matters increasingly as the production action space expands.

## 10. The action registry is a good abstraction, but it is not yet an authoritative mechanics registry

`CRAFT_MECHANICS` currently owns:

- id;
- name;
- category;
- legality;
- price derivation.

That is useful progress.

However, it does **not** yet own:

- analytical transition distribution;
- Monte Carlo sampling implementation.

Therefore the same craft mechanic can still be implemented separately in:

- policy/expected-cost logic;
- Monte Carlo simulation.

That is the exact drift risk we eventually want to remove.

### Next target interface

Move toward something like:

```ts
interface CraftMechanic {
    id: string;
    isLegal(...): boolean;
    getCost(...): CraftCost;
    getTransitions(...): TransitionDistribution;
    sampleTransition(..., rng): CraftResult;
}
```

Ideally `sampleTransition()` should sample from the same transition model used by `getTransitions()` rather than implementing unrelated mechanics.

Do this incrementally.

Do not rewrite the validated A/C solver all at once.

## 11. Action discovery still uses silent research fallback prices

The registry now marks most fallback prices as `research-fallback`, which is better than silently pretending they are authoritative.

However, automatic route discovery still returns them as usable actions.

Examples include:

- Alteration `0.11c`;
- Augmentation derived from Alt or `0.03c`;
- Regal `0.2c`;
- Scour `0.5c`;
- Annul `9c`;
- Exalt `1.2c`;
- Fracture `359c`.

That means a production optimizer can still choose a route using stale research prices if live price data is absent.

### Required behavior

Add an optimization-price policy such as:

```text
allowResearchFallbackPrices: true/false
```

For production/default UI behavior, prefer `false`.

When false:

- exclude actions whose price confidence is `unavailable` or `research-fallback`;
- or mark the overall route as economically incomplete and do not claim it is cheapest.

Research/demo runs can explicitly allow fallbacks.

## 12. Concrete pricing-confidence bug: Chaos fallback is labeled `known`

The Chaos Orb mechanic currently does roughly:

```ts
const cost = priceBook.toChaos(1, 'chaos');
return {
    costChaos: cost || 1.0,
    confidence: 'known',
};
```

If `cost` is missing/zero, the code falls back to `1.0c` but still reports confidence `known`.

That violates the new confidence model.

Fix it to behave like the other actions:

```text
known when real price exists
research-fallback when fallback is used
unavailable when no permitted fallback exists
```

Audit every registered mechanic for this same issue.

## 13. Self-fracture discovery still bypasses the new pricing-confidence system

`strategyDiscovery.ts` still calculates preparation roughly using:

```text
expectedAlts * 0.11 + 10.0
```

and fracture cost falls back to `359`.

This means automatic starting-state acquisition economics do not yet use the same explicit confidence/price policy as `actionRegistry.ts`.

This remains acceptable as an **approximate research model**, but production route ranking must not silently present it as current market truth.

Keep self-fracture acquisition marked approximate and eventually derive its currency costs from the same price context.

## 14. Harvest metadata is cleaner, but still needs mechanics verification

Moving Harvest craft metadata into `HARVEST_CRAFT_DEFINITIONS` is the right architectural change.

The table now explicitly defines:

- craft id;
- name;
- tag;
- lifeforce type;
- amount.

That is much better than the old broad fallback mapping.

However, calling this data `authoritative` in comments is stronger than the current validation evidence supports.

The project still labels game-mechanics fidelity partial, so Harvest definitions should be treated as configured mechanics data pending independent verification.

Also, legality currently appears broadly defined as rare-item applicability plus existence of a tagged mod in the pool.

As more Harvest mechanics are modeled, keep craft-specific legality restrictions in this same data/mechanics layer rather than scattered conditionals.

## 15. Action type mapping should become registry-native

`getLegalActions()` currently maps registry mechanic ids back into `DiscoveredActionType` through a chain of `if / else if` checks.

That is manageable now but becomes fragile as the action registry grows.

Prefer storing the discovered action type directly on each mechanic definition, or replacing the duplicate enum/identifier layers with one canonical action id/type system.

Avoid a future failure mode where a new registered mechanic silently falls through to the default `CHAOS_ORB` action type.

The current code initializes:

```ts
let actionType: DiscoveredActionType = 'CHAOS_ORB';
```

so an unknown/unmapped mechanic id would be mislabeled as Chaos rather than failing loudly.

Change this to an exhaustive mapping or registry-owned type.

## 16. Clean/base progression should be the next real production reference path

Craft A and Craft C validate fractured-rare downstream crafting well.

The next major gap for the final UI is early item progression:

```text
clean base
-> normal/magic state
-> Alteration/Augmentation
-> Regal
-> rare cleanup/fill
-> fracture or continue crafting
```

Once the rarity/domain issue is corrected, Craft B becomes valuable again as the next architecture fixture because it can prove the engine discovers a non-fracture, clean-base path through generic actions.

Do not special-case Craft B.

Use it only after:

- normal rarity exists;
- transformation/action transitions exist;
- registry transitions are shared enough to be trustworthy.

## 17. `GLOBAL OPTIMALITY: NOT YET PROVEN` must remain

The system is moving toward automatic discovery, but the search frontier is still incomplete.

Not yet fully modeled through one generic action/transition system:

- transformation to magic;
- full Alteration/Augmentation transition mechanics;
- Regal transition mechanics;
- Scour reset semantics across rarities;
- Chaos reroll transitions;
- Fracturing transition mechanics in generic search;
- bench/filler actions;
- restart;
- some finishing mechanics;
- Allflame intentionally deferred.

Therefore keep:

`GLOBAL OPTIMALITY: NOT YET PROVEN`

until the supported mechanics frontier is explicitly defined and searched.

## 18. Recommended next implementation order

1. Fix roll-sensitive canonical key bucketing.
2. Add/represent normal rarity correctly.
3. Fix the auto-generated clean starting state.
4. Add a no-manual-start diagnostic that exercises automatic candidate generation end-to-end.
5. Fix `multiSeed.ts` so it truly solves once and validates the same resolved policy across seeds.
6. Add pooled total-cost uncertainty if useful, while preserving censoring awareness.
7. Fix price-confidence handling, especially Chaos Orb.
8. Add a production policy to disallow research fallback prices.
9. Unify action id/type mapping so unmapped registry actions cannot silently become Chaos.
10. Extend `CraftMechanic` toward shared analytical/MC transitions.
11. Migrate one simple mechanic (e.g. Annul or Exalt) through the shared transition path first.
12. Re-run Craft A/C after each transition migration.
13. Validate automatic required-mod fracture generation against the known A/C manual candidate sets.
14. Implement clean -> magic -> rare action transitions.
15. Bring Craft B back as the next generic route-discovery fixture.
16. Keep frontend and Allflame deferred.

## 19. Validation gates going forward

### Craft A

Keep:

- pooled total-cost agreement near analytical;
- pooled Harvest/Annul/Exalt differences comfortably below 10%;
- zero missing states;
- zero fallbacks in the validated policy path;
- zero normal-seed timeouts;
- stable outcome branches.

### Craft C

Now use pooled evidence as the primary internal-consistency gate:

- pooled Harvest diff <=10%;
- pooled Annul diff <=10%;
- pooled Exalt diff <=10%;
- aggregate mean near analytical;
- completion >=99%;
- censoring rare and explicit;
- zero missing policy states;
- zero policy fallbacks.

Current pooled Craft C action metrics pass this gate.

### Automatic discovery path

Add a separate validation section for:

- generated candidate set;
- duplicate physical-state count;
- acquisition methods attached per state;
- legal actions from clean/magic/rare states;
- unavailable/fallback-price handling;
- selected route;
- whether reference manual candidate set is reproduced where expected.

Do not claim the generic production path is validated solely because the manual A/C fixtures remain stable.

## 20. No unit tests

Continue honoring the project constraint: do not add unit tests.

Use:

- end-to-end reference craft runs;
- automatic-discovery diagnostics;
- multi-seed Monte Carlo;
- canonical-state diagnostics;
- action-registry diagnostics;
- transition consistency checks;
- compact output artifacts.

## Bottom line

The project is now clearly moving from a hand-fed reference optimizer toward the intended production architecture.

The canonical state fix and pooled multi-seed metrics are genuine improvements, and Craft C's aggregate internal consistency is now strong enough to stop treating individual >10% Annul seeds as an obvious model defect.

The next priority should **not** be more Craft A/C numerical tuning.

It should be making the newly wired automatic discovery path mechanically valid:

```text
real clean base state
    -> generic legal actions
    -> shared transition mechanics
    -> automatically generated starts
    -> one downstream solve per physical state
    -> least-expensive supported route
```

The largest near-term correctness risks are the clean-base rarity model, incomplete roll-sensitive canonical keys, repeated solving in the supposed solve-once harness, and research fallback prices leaking into production route ranking.