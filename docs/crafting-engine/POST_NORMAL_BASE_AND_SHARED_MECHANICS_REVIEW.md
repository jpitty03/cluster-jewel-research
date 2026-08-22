# Post Normal-Base, Solve-Once & Shared-Mechanics Review

Reviewed `main` at implementation commit `c4c2ea16f9d4eaccfbfb920e4a0852560b54af05`.

Primary evidence reviewed:

- `output-craft-a-review.txt`
- `output-craft-c-review.txt`
- implementation diff for `c4c2ea16f9d4eaccfbfb920e4a0852560b54af05`
- `crafting-engine/src/domain/ItemState.ts`
- `crafting-engine/src/domain/Mod.ts`
- `crafting-engine/src/rules/actionDiscovery.ts`
- `crafting-engine/src/rules/actionRegistry.ts`
- `crafting-engine/src/solver/strategyDiscovery.ts`
- `crafting-engine/src/probability/multiSeed.ts`

## Executive summary

This is another meaningful architectural step toward the final product. The engine now has explicit `normal` rarity, the automatically generated clean-base state is physically represented as normal, action types live in the registry instead of being mapped with a silent Chaos default, production action discovery can reject fallback prices, an Annul mechanic now exposes analytical/sample transition hooks, and the multi-seed validator can invoke Monte Carlo directly instead of calling the full optimizer once per seed.

Craft A and Craft C remain numerically stable in the new outputs. The pooled multi-seed metrics remain excellent for Craft A and acceptable for Craft C.

However, there is one critical correctness problem in the new canonical roll-key implementation: it reads properties that do not exist on `RolledMod`. As a result, the intended roll-sensitive PASS/FAIL protection is not actually encoded in the runtime state key. There is also a related state-equivalence gap because the key preserves only `modGroup`, not the full `modGroups` exclusion set.

The next pass should fix canonical state identity first, then make the automatic clean-base path genuinely executable through shared transition mechanics. The new normal state is structurally correct, but the optimizer still cannot yet discover and execute a complete `normal -> magic -> rare` route because most registry actions are descriptors without transitions.

## 1. Craft A remains a strong regression fixture

The latest review output still reports:

- Analytical expected total: `7623.7c`
- Five-seed mean of means: `7568.1c`
- Aggregate difference vs analytical: about `-0.73%`
- Point diff range: `0.24%–2.06%`
- Zero timeouts across the five seeds

Pooled action counts across 10,000 trials:

| Action | Analytical | Pooled MC | Difference |
|---|---:|---:|---:|
| Harvest | 2545.60 | 2525.07 | 0.81% |
| Annul | 219.22 | 216.75 | 1.13% |
| Exalt | 116.53 | 115.45 | 0.92% |

Assessment: **multi-seed stable and validated for the current implemented policy mechanics**.

Do not rewrite the existing A policy math while the production action system is being generalized.

## 2. Craft C pooled validation is now healthy enough to be a heavy-tail regression fixture

The latest review output still reports:

- Analytical expected total: `42814.4c`
- Five-seed mean of means: `42483.5c`
- Aggregate difference vs analytical: about `-0.77%`
- Point diff range: `1.80%–3.65%`
- One timeout across 10,000 requested simulations

Pooled action counts:

| Action | Analytical | Pooled MC | Difference |
|---|---:|---:|---:|
| Harvest | 5657.92 | 5494.70 | 2.88% |
| Annul | 910.37 | 975.40 | 7.14% |
| Exalt | 371.51 | 392.80 | 5.73% |

Assessment: **multi-seed stable for the current implemented policy model**, while game-mechanics fidelity remains partial.

The pooled statistics are much more persuasive than individual heavy-tail seeds that occasionally exceed a 10% action-count difference.

## 3. Critical: the roll-sensitive canonical-key fix does not currently read actual rolled values

`getCanonicalStateKey()` now tries to add a PASS/FAIL/actual-value component using logic equivalent to:

```ts
if (m.stats?.[statKey] !== undefined) {
  const actualVal = m.stats[statKey];
  const passStatus = actualVal >= minVal ? 'PASS' : 'FAIL';
  rollSuffix += `:roll(${statKey}:${passStatus}:${actualVal})`;
}
```

But `RolledMod` does **not** contain a `stats` property.

Its roll-bearing fields are:

```ts
statText: string;
statValues: StatValueRange[];
currentRoll?: number[];
```

Therefore the new `m.stats?.[...]` check is undefined at runtime and the roll suffix is never added.

This means two rolled instances of the same tier/group can still share the same canonical key even when one meets a user roll threshold and the other does not.

### Required fix

Create one authoritative way to evaluate a `finalRollRequirements` entry against a `RolledMod`.

Do not invent a second hidden `stats` representation only for cache keys.

Prefer a helper shared with target matching, for example conceptually:

```ts
getRolledStatValue(mod, requirement)
```

or a normalized stat-id/value map populated when `RolledMod` is created.

Then the canonical key should preserve at least:

- PASS vs FAIL when only threshold satisfaction matters;
- actual roll/bucket when future mechanics such as Divine can change continuation value.

Add a runtime diagnostic creating two otherwise-identical rolled mods where one passes and one fails the same threshold and prove their canonical keys differ.

This is a diagnostic, not a unit test.

## 4. Canonical keys should preserve the full exclusion-group set, not only the primary `modGroup`

The key currently uses roughly:

```ts
const groupOrId = m.modGroup ?? m.modId;
```

But `RolledMod` also carries:

```ts
modGroups: string[]
```

If crafting eligibility/blocking checks use any additional groups from `modGroups`, two mods sharing a primary group but differing in secondary exclusion groups may not be transition-equivalent.

A safer canonical representation should include the sorted full group set, for example conceptually:

```text
groups(primary|secondary|...)
```

Only omit an exclusion dimension after proving it cannot change any modeled transition.

The strict equivalence contract added previously is good; the key implementation should now fully satisfy it.

## 5. `craftTags` are also not present on `RolledMod`

The canonical key still computes:

```ts
const craftTags = (m.craftTags ?? []).slice().sort().join(',');
```

But `RolledMod` has no `craftTags` property.

Today this silently becomes an empty tag list at runtime.

Decide which of these designs is correct:

1. crafting-relevant tags belong on `RolledMod` and should be copied from `Mod` in `toRolledMod()`; or
2. tags are derivable from the mod repository by `modId`, so the canonical-key helper should explicitly look them up from context; or
3. tags are not needed for state equivalence once full group identity is preserved, in which case remove the misleading field from the key.

Do not leave a property in the canonical-state design that is always empty.

## 6. Normal rarity support is the correct move

`ItemRarity` now supports:

```ts
'normal' | 'magic' | 'rare'
```

and automatically generated clean bases are now created as:

```ts
rarity: 'normal'
prefixes: []
suffixes: []
```

This fixes the previous conceptual error where an empty clean base was represented as rare.

Preserve this.

The next challenge is no longer state representation; it is making the legal transformation chain executable by the generic solver.

## 7. Transmutation exists in discovery, but the clean-base route is not yet a complete executable policy path

The action registry now exposes `Orb of Transmutation` for normal states.

That is good scaffolding.

However, Transmutation currently has legality/cost metadata only. It does not yet define analytical or sampled transitions.

Likewise Alteration, Augmentation, Regal, Scour, Chaos, Exalt and Fracturing still mostly do not own transitions in the new registry.

Therefore:

> `getLegalActions(normalState)` returning Transmutation does not yet mean Bellman search can actually traverse `normal -> magic` generically.

Do not treat the new automatic-start diagnostic as proof of full clean-base route discovery until those discovered actions feed the production state-transition graph.

## 8. Annul is the first useful shared-mechanics migration

Annul now has both:

```ts
getTransitions(...)
sampleTransition(...)
```

in the registry.

This is the right architectural direction because analytical and Monte Carlo behavior can converge on one action definition.

Keep this incremental migration strategy.

Before moving several more actions, add a runtime transition-consistency diagnostic for Annul:

- enumerate analytical outcomes/probabilities;
- sample the same state many times with deterministic RNG;
- compare empirical removed-mod frequencies to analytical probabilities;
- confirm fractured mods are never included in removable outcomes.

Again, diagnostic only; no unit tests.

## 9. Do not call the action registry fully authoritative yet

The comment currently describes the registry as the authoritative craft-mechanics source, but only Annul currently contains transition behavior.

For most actions it is currently authoritative only for:

- id/action type;
- display name;
- category;
- legality predicate;
- cost/confidence.

The actual mechanics still live elsewhere.

Prefer wording such as:

`authoritative action metadata registry`

until each migrated action owns or delegates to a single shared transition model.

This is important because the project should not accidentally imply analytical/MC mechanics are unified before they are.

## 10. Action-type mapping fix is good

`actionType` now lives directly on `CraftMechanic`.

This removes the dangerous prior pattern where an unknown registry id could silently default to `CHAOS_ORB`.

Preserve registry-native action types.

If a future mechanic lacks a recognized type, fail visibly rather than silently coercing it.

## 11. Price confidence is better, but production safety is not complete

`getLegalActions()` now supports:

```ts
allowResearchFallbackPrices?: boolean
```

and can exclude actions whose price confidence is not `known`.

That is the right design.

However, it currently defaults to:

```ts
true
```

For research scripts this is fine.

For the future frontend/product path, the default should be false or explicitly supplied by the caller so production behavior cannot silently depend on stale research prices.

Also ensure generated starting strategies use the same price-confidence policy. Right now self-fracture acquisition still includes hardcoded research assumptions independently of `getLegalActions()`.

## 12. Chaos price confidence is corrected

The previous Chaos-specific confidence bug has been fixed: a fallback `1.0c` is now labeled `research-fallback` rather than `known`.

Preserve this behavior across all currency actions.

## 13. The self-fracture discovery path still bypasses the new price-confidence architecture

`strategyDiscovery.ts` still contains values/logic such as:

```ts
const fractureCost = priceBook.getRate('fracturing') || 359;
const prepCostPerAttempt = expectedAlts * 0.11 + 10.0;
```

The acquisition itself is correctly labeled `approximate`, which is good.

But automatic route ranking can still use these fallback numbers even when the generic action-discovery layer would reject fallback prices.

Add acquisition-level pricing policy/confidence:

- live/known prices;
- research fallback permitted;
- unavailable.

The production optimizer should not claim `least expensive` if a winning acquisition route depends on hidden fallback economics.

## 14. The multi-seed harness is closer to true solve-once/validate-many

The new implementation first computes a base analytical response, then invokes `MonteCarloSimulator` directly for each seed rather than calling `optimizer.optimizeCraft()` inside the seed loop.

That is a real improvement.

For current Craft A/C requests with explicit manual starting states, this is a reasonable solve-once validation path.

### Important remaining edge case

The validator chooses its start with:

```ts
const startingStates = baseRequest.startingStates ?? [];
const bestStart = ...;
```

If `startingStates` are omitted — exactly the future production auto-discovery case — it falls back to an empty synthetic rare state.

That would validate the resolved automatic policy from the wrong physical starting state.

Fix this before using multi-seed validation on automatic-start requests.

The resolved optimizer response should expose the actual selected physical starting state/acquisition directly, and the validator should consume that.

Do not reconstruct the selected state from the original request.

## 15. The selected resolved strategy should carry all information required for validation

The solve-once validator currently reaches into:

- `baseRequest.startingStates`;
- `recommended.policyEngine`;
- `recommended.pool` or optimizer internals;
- optimizer private/default context through `as any` fallbacks.

This is a sign that the resolved solution object is not yet a clean validation artifact.

Move toward a stable object conceptually containing:

```ts
ResolvedCraftPolicy {
  startingState;
  acquisition;
  target;
  solverContext;
  policy;
  analyticalExpectedCost;
  expectedCurrencies;
}
```

Then Monte Carlo can validate that object directly without knowing how the request originally supplied or discovered the start.

This will also help frontend/service boundaries later.

## 16. Automatic starting-state diagnostics are useful, but their PASS rule is too weak

The new diagnostic compares only the **best total EV** between automatic discovery and the manual fixture, with a `<1%` tolerance.

That can pass even if:

- the generated candidate set is missing expected physical starts;
- an extra invalid start is present but loses;
- acquisition methods are attached incorrectly;
- two different routes coincidentally have similar total EV.

Expand the diagnostic to compare candidate structure, not just winner cost.

For each expected reference target mod, report/check:

- expected physical fractured state generated: YES/NO;
- correct mod group/mod id;
- correct prefix/suffix side;
- correct rarity;
- expected acquisition modes attached;
- duplicate physical states;
- downstream EV reused vs recomputed.

Keep total-EV/winner consistency as one check, not the only check.

## 17. Physical-state deduplication is still not implemented in evaluation

The discovery layer correctly models:

```ts
StartingStateCandidate {
  state,
  acquisitions[]
}
```

but `generateStartingStrategies()` still flattens acquisitions into separate `StartingCraftOption`s before evaluation.

So identical downstream physical states can still be solved repeatedly for market vs self-fracture acquisition.

This should be the next performance/architecture cleanup before the search space expands substantially.

Preferred flow:

```text
physical candidate
    -> one downstream Bellman solve
    -> many acquisition totals
    -> rank full routes
```

Do not sacrifice clarity to optimize prematurely, but the current abstraction already contains enough information to implement this cleanly.

## 18. The next major product milestone is shared transitions for normal -> magic -> rare

The engine now has the pieces needed to start the most important generic discovery milestone.

Recommended migration order:

1. Transmutation
2. Alteration
3. Augmentation
4. Regal
5. Scour/reset
6. Exalt
7. Chaos
8. Fracturing

For each action:

- legality from registry;
- known/fallback price policy;
- analytical transition distribution;
- sampled transition using same mechanics source;
- canonical successor states;
- diagnostic comparison analytical vs sampled transition frequencies.

After each small migration, rerun Craft A/C.

## 19. Bring Craft B back only when those base-prep transitions are actually searchable

Craft B should become the next proof fixture when the generic engine can truly traverse:

```text
normal base
-> Transmutation
-> Alteration/Augmentation loops
-> Regal
-> recovery/reset
-> target rare item
```

Do not manually pre-script this route for Craft B.

The purpose of Craft B is to prove route discovery, not add another bespoke craft.

## 20. Game-mechanics fidelity remains partial

Do not change this label yet.

Still unresolved or approximate:

- Harvest additional-affix generation 50/50 assumption;
- self-fracture Alt/Aug/Regal/bench model;
- many generic action transitions;
- exact pricing coverage;
- Harvest metadata external validation;
- Allflame deferred.

Analytical-vs-Monte-Carlo agreement only proves consistency of the mechanics both systems currently share.

## 21. No unit tests

Continue respecting the project constraint: do not add or expand unit tests.

Use runtime/reference diagnostics instead:

- canonical PASS/FAIL roll-key check;
- full `modGroups` canonical-key check;
- Annul analytical-vs-sampled transition check;
- automatic candidate-set audit;
- multi-seed Monte Carlo;
- Craft A/C end-to-end outputs.

## Recommended next implementation order

1. Fix canonical roll extraction to use real `RolledMod` data.
2. Include full `modGroups` in canonical state identity.
3. Decide/remove/fix nonexistent `craftTags` usage on `RolledMod`.
4. Add canonical-state runtime diagnostics.
5. Fix multi-seed auto-discovered-start validation.
6. Introduce a clean resolved-policy artifact for Monte Carlo validation.
7. Expand auto-discovery diagnostic from winner-only to candidate-set verification.
8. Apply production-safe fallback-price policy to acquisition generation too.
9. Keep Annul as the first shared transition mechanic and validate it empirically.
10. Implement Transmutation transition.
11. Implement Alteration transition.
12. Implement Augmentation transition.
13. Implement Regal transition.
14. Rerun A/C after each structural migration.
15. Deduplicate downstream solves by physical state.
16. Bring Craft B back only once clean -> magic -> rare is truly solver-discoverable.
17. Keep Allflame and frontend deferred.

## Bottom line

This implementation moves the project closer to the intended arbitrary 1–4-mod optimizer, particularly through normal rarity, registry-native action types, direct Monte Carlo validation, and transition hooks.

The immediate blocker is now very specific: **the canonical-key roll fix is not connected to the actual `RolledMod` representation**, and the key still does not preserve every exclusion group that may affect future transitions.

Fixing state identity before expanding Bellman search is essential. Once that is corrected, the next major milestone should be making the newly legitimate normal clean state actually traversable through shared Transmutation/Alteration/Augmentation/Regal mechanics rather than merely discoverable as action descriptors.
