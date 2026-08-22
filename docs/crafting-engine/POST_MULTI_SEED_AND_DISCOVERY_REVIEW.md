# Post Multi-Seed Validation & Discovery Architecture Review

Reviewed `main` at implementation commit `108a45e686549a328de3ac4b55108fb617d76a56`.

Primary evidence reviewed:

- `output-craft-a-review.txt`
- `output-craft-c-review.txt`
- `crafting-engine/src/probability/multiSeed.ts`
- `crafting-engine/src/rules/actionDiscovery.ts`
- implementation diff for `108a45e686549a328de3ac4b55108fb617d76a56`

## Executive summary

The project is moving in the correct direction for the end goal: a user selects any 1–4 desired mods and the engine discovers the least-expensive modeled crafting route.

The reference-craft solver is now stable enough that Craft A and Craft C should increasingly be treated as regression fixtures rather than the product architecture itself.

The new multi-seed harness is a meaningful improvement. Craft A is now very stable across all five deterministic seeds. Craft C's total expected cost is also much more stable than a single Monte Carlo run suggested, although action-count variance remains high enough that Craft C should stay provisional.

The most important finding in this review is architectural: `actionDiscovery.ts` is useful scaffolding, but it is not yet safe to become the optimizer's canonical state/action layer without additional work. In particular, the current canonical-state junk collapsing can merge states that are not actually equivalent because mod-group blocking is not preserved.

## 1. Craft A multi-seed validation is strong

Analytical expected total:

- `7623.7c` (~38.12 div)

Five-seed results:

| Seed | MC mean | Cost diff | Harvest diff | Annul diff | Exalt diff | Completion | Timeouts |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 42 | 7535.6c | 1.16% | 1.24% | 1.83% | 1.82% | 100% | 0 |
| 1337 | 7545.6c | 1.02% | 1.06% | 1.72% | 1.46% | 100% | 0 |
| 2026 | 7651.1c | 0.36% | 0.58% | 0.19% | 0.42% | 100% | 0 |
| 9001 | 7466.6c | 2.06% | 2.64% | 2.50% | 1.94% | 100% | 0 |
| 123456 | 7641.7c | 0.24% | 0.33% | 0.23% | 0.18% | 100% | 0 |

Aggregate:

- Mean of seed means: `7568.1c`
- Difference vs analytical: about `-0.73%`
- Point-estimate range: `0.24%–2.06%`
- Zero timeouts across every seed
- All primary action counts comfortably inside 10%

### Assessment

Craft A is an excellent regression fixture now.

Do not tune the model to force seed 9001 from 2.06% to below 2%. The five-seed aggregate evidence is much stronger than one arbitrary point estimate.

For future validation labels, prefer a multi-seed stability conclusion over a hard single-run 2.00% boundary.

## 2. Craft C multi-seed evidence is materially better than a single run

Analytical expected total:

- `42814.4c` (~214.07 div)

Five-seed results:

| Seed | MC mean | Cost diff | Harvest diff | Annul diff | Exalt diff | Completion | Timeouts |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 42 | 41249.6c | 3.65% | 5.80% | 3.88% | 2.50% | 99.95% | 1 |
| 1337 | 41343.1c | 3.44% | 5.61% | 4.23% | 2.81% | 100% | 0 |
| 2026 | 44064.6c | 2.92% | 0.89% | 11.17% | 9.69% | 100% | 0 |
| 9001 | 42043.5c | 1.80% | 3.97% | 6.14% | 4.78% | 100% | 0 |
| 123456 | 43716.9c | 2.11% | 0.06% | 10.29% | 8.88% | 100% | 0 |

Aggregate:

- Mean of seed means: `42483.5c`
- Difference vs analytical: about `-0.77%`
- Point-estimate range: `1.80%–3.65%`
- Only one timeout across 10,000 requested simulations

### Assessment

The total-cost model looks substantially healthier than any single Craft C run suggested.

However, Craft C should remain **provisional** because the Annul count exceeds 10% for seeds 2026 and 123456. That may be ordinary heavy-tail sample variance, but it should be quantified before relaxing the action-count gate.

The current `isStable` implementation correctly marks Craft C as caution/provisional because it requires all action-count differences <=10% and completion >=99%.

### Recommended next statistical improvement

Instead of only comparing each seed independently, aggregate action counts across all seeds/trials and report:

- pooled Harvest mean/count difference;
- pooled Annul mean/count difference;
- pooled Exalt mean/count difference;
- between-seed standard deviation of each metric.

That will distinguish a true systematic count mismatch from a high-variance estimator.

## 3. Censoring-aware uncertainty reporting is the correct design

The new uncertainty model distinguishes:

- normal completed-sample CI when no timeout exists;
- completed-trial-only CI when censoring exists;
- explicit censoring status and timeout count.

Preserve this.

Do not use a completed-trial CI as proof of an uncensored population mean when a timeout occurred.

The multi-seed results now show that the single Craft C timeout at seed 42 is unusual rather than pervasive, which is exactly why this harness is useful.

## 4. Multi-seed validation currently reruns the entire optimizer

`runMultiSeedValidation()` calls `optimizer.optimizeCraft()` for every seed.

That is functionally correct, but potentially expensive as automatic discovery grows.

Once policy discovery becomes expensive, separate:

1. deterministic analytical policy construction/evaluation;
2. stochastic Monte Carlo validation of that already-computed policy.

Conceptually:

```ts
const solution = optimizer.solve(requestWithoutMc);
const validation = validatePolicyAcrossSeeds(solution, request, seeds);
```

This avoids rebuilding an identical deterministic Bellman solution five times solely to change RNG seeds.

Do not optimize this prematurely if current runtime is acceptable, but establish this boundary before the production state space becomes much larger.

## 5. Automatic legal-action discovery is the correct next architecture

`getLegalActions(state, target, context)` is the right abstraction for the eventual UI-driven optimizer.

This is the correct direction:

```text
User selects 1–4 mods
    -> TargetDefinition
    -> candidate starting states
    -> legal action discovery
    -> transition generation
    -> Bellman / policy search
    -> cheapest expected route
```

The frontend should not supply a recipe.

The current action discovery recognizes/scaffolds:

- Alteration
- Augmentation
- Regal
- Scour for magic states
- Harvest reforges
- Chaos
- Annul
- Exalt
- Fracturing

This is useful progress.

However, the discovered action list is still **descriptive scaffolding**, not yet a full production action system. A discovered action must ultimately map to one authoritative transition implementation shared by analytical solving and Monte Carlo.

Avoid a future architecture where:

- `getLegalActions()` says an action is legal;
- analytical code implements mechanics separately;
- Monte Carlo implements mechanics a third way.

Prefer one action definition with:

```ts
isLegal(state, context)
getCost(context)
getTransitions(state, context) // analytical distribution
sampleTransition(state, rng, context) // MC using same mechanics definition
```

or equivalent.

## 6. Critical: current canonical junk collapsing is not safe enough

`getCanonicalStateKey()` currently collapses non-target junk primarily to:

```text
JUNK:<sorted craftTags>
```

Prefix/suffix side is implicitly preserved because prefixes and suffixes are keyed separately, but **mod-group identity is discarded**.

That can merge states that are not equivalent.

Two junk suffixes can have the same or similar craft tags while belonging to different mod groups. Those groups can block different future modifiers and therefore change:

- eligible Exalt pool;
- Harvest outcomes;
- legal future target hits;
- continuation EV.

If those states are memoized as identical, the solver can return an incorrect policy or expected cost.

### Required rule

Only collapse two mods/states when they are provably transition-equivalent for the modeled action set.

At minimum, a junk-mod abstraction needs to preserve all properties that can affect future transitions, including:

- prefix/suffix location;
- mod group / exclusion groups;
- tags used by crafting mechanics;
- fractured/protected status;
- anything affecting target matching;
- anything affecting legal action eligibility.

A safer first optimization is to keep the actual mod group in the canonical junk key and only collapse numeric rolls that do not affect the target or mechanics.

Correctness is more important than state-count reduction here.

## 7. Canonical state key needs an explicit scope contract

The current key contains rarity and affix state, but does not encode fields such as:

- base type;
- cluster type;
- item level;
- passive count.

This can be safe **only if** memoization caches are guaranteed to be scoped to one fixed base/context/item-level search.

Make that invariant explicit.

Either:

- include context identity in the key; or
- make caches solver-instance-local and document/assert that base/pool/ilvl are immutable for the instance.

Do not allow a future shared/global cache to accidentally reuse values across different cluster pools.

## 8. Roll normalization must respect roll-sensitive targets

The long-term UI may eventually let a user request exact roll thresholds, not just mod group/tier.

The canonical state key currently represents target mods by group/tier, which is fine for current Craft A because T1 Intelligence +6–8 is intentionally treated as equivalent.

But if `finalRollRequirements` or future user targets distinguish rolls, the state key must preserve the roll dimensions that affect target satisfaction or continuation value.

Rule:

> Collapse numeric rolls only when the target and all modeled mechanics are invariant to those rolls.

## 9. Legal action coverage is not yet ready to prove global optimality

The discovery layer is growing, but several issues remain before the engine can claim it searched the complete modeled route space.

Examples from the current file:

- `TERMINAL` exists in the discovered-action type but is not emitted by `getLegalActions()`;
- `TRANSFORMATION_ORB` is declared but not currently emitted;
- `DIVINE_ORB` is declared but not emitted;
- Scour is currently exposed in the magic-state branch but not as a generic rare-state action;
- bench/filler actions and restart are not part of this discovery function;
- discovered descriptors are not yet the same objects that generate solver transitions.

Some of those actions may intentionally be irrelevant for a given target, which is fine. The issue is architectural completeness, not that every action must always be offered.

Keep:

`GLOBAL OPTIMALITY: NOT YET PROVEN`

until the action registry/search frontier is explicitly defined and complete for the supported mechanics set.

## 10. Do not hardcode currency fallbacks into production action discovery

`actionDiscovery.ts` currently contains fallbacks such as:

- Alteration `0.11c`
- Augmentation `0.03c`
- Regal `0.2c`
- Scour `0.5c`
- Annul `9c`
- Exalt `1.2c`
- Fracture `359c`

These are convenient for research/demo operation but dangerous for the eventual frontend optimizer because a missing price silently becomes a fabricated market assumption.

Production behavior should distinguish:

- known live/user-supplied price;
- configured research fallback;
- price unavailable.

A route using unavailable price data should either be excluded or clearly marked incomplete—not silently optimized using an old fallback.

This follows the same principle already adopted for fractured-base market prices.

## 11. Harvest tag -> lifeforce pricing mapping needs to be data/config driven

The current discovery code maps:

- life -> wild;
- chaos -> vivid;
- everything else -> primal.

That is too broad to become a production rule without explicit mechanics validation.

Move Harvest craft definitions into data/config where each craft has:

- action id;
- tag;
- required lifeforce type;
- lifeforce amount;
- legality restrictions;
- transition mechanics.

Do not infer all non-life/non-chaos Harvest crafts as primal by default.

## 12. Automatic starting-state generation is still the next major milestone

The reference demos still manually enumerate their starting fractured states.

That is fine for regression fixtures, but the production-facing path should automatically generate them from `TargetDefinition`.

For an arbitrary 1–4-mod target:

1. generate clean base candidate;
2. generate each legally fractureable required-mod starting state;
3. attach self-fracture acquisition if modeled;
4. attach market acquisition only when price data exists;
5. evaluate downstream policy from each unique physical state;
6. rank full-route EV.

Keep physical state separate from acquisition method.

The same physical fractured state should not require solving the downstream craft separately for market vs self-fracture acquisition; only the acquisition cost changes.

This will become important for performance.

## 13. Keep Craft A/C as fixtures while route discovery expands

Craft A and Craft C are now useful guardrails.

After each structural change to action discovery/state abstraction:

### Craft A expected guardrail

- multi-seed mean remains near analytical;
- primary action counts remain stable;
- zero missing/fallback states;
- zero timeout/censoring across normal validation seeds;
- terminal sale-branch distribution remains aligned.

### Craft C expected guardrail

- multi-seed mean remains near analytical;
- action-count aggregate remains reasonable;
- timeout/censoring remains rare and explicit;
- no missing/fallback states.

Do not require every individual heavy-tail seed to fit an arbitrary narrow point threshold if aggregate evidence is healthy.

## 14. Game-mechanics fidelity is still partial

Do not upgrade this label yet.

Remaining important assumptions include:

- Harvest additional-affix generation is still modeled as 50% one extra / 50% two extra;
- self-fracture Alteration/Augmentation/Regal/bench preparation remains approximate;
- legal-action discovery is incomplete;
- discovered actions do not yet all use one shared authoritative transition implementation;
- Allflame remains deferred.

Analytical-vs-MC agreement validates implementation consistency, not real-game correctness.

## Recommended implementation order

1. Fix canonical-state equivalence correctness before relying on aggressive junk collapsing.
2. Make cache/context scope explicit.
3. Aggregate multi-seed action-count diagnostics, not just per-seed pass/fail.
4. Separate solve-once policy construction from validate-many-seeds Monte Carlo when useful.
5. Formalize an action registry where legality + analytical transitions + MC sampling share one mechanics source.
6. Move currency/lifeforce pricing metadata out of hardcoded action-discovery fallbacks.
7. Implement production `StartingStateCandidate` generation from arbitrary TargetDefinition.
8. Evaluate one downstream policy per unique physical start, then attach acquisition alternatives.
9. Expand ordinary action registry deliberately.
10. Re-run Craft A/C after each state/action architecture change.
11. Use Craft B later to prove clean -> magic -> rare route discovery.
12. Keep Allflame and frontend deferred until generic route discovery is mature.

## Validation status after this review

### Craft A

**VALIDATED FOR CURRENT IMPLEMENTED MECHANICS / MULTI-SEED STABLE**

The five-seed evidence is strong enough that Craft A should now be considered a stable regression fixture.

### Craft C

**PROVISIONALLY VALIDATED FOR CURRENT IMPLEMENTED MECHANICS / MULTI-SEED CAUTION**

Total-cost consistency looks good in aggregate, but action-count variation—especially Annulments—warrants continued observation. One timeout occurred across the five-seed harness.

### Architecture

**CORRECT DIRECTION, NOT YET PRODUCTION-GENERIC**

The new discovery abstractions are exactly the right direction for the eventual 1–4-mod UI, but canonical-state equivalence and shared action-transition mechanics should be corrected/formalized before aggressively expanding the search space.
