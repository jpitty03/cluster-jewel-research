# Post-Generalization Validation Findings

Reviewed against `main` after commit `09450896a3481e719a91650f7ad28c7456ff8fe4` (`feat(crafting-engine): generalize core optimizer with mechanical Markov solver and target-driven diagnostics`).

This review focuses on the latest compact outputs:

- `output-craft-a-review.txt`
- `output-craft-c-review.txt`

Allflame remains deferred and must stay disabled for this phase.

## Executive Summary

The latest pass is a substantial improvement. Craft C, which previously showed catastrophic analytical-vs-Monte-Carlo disagreement, is now much closer and its diagnostics are finally target-driven. The representative-state recommendations now consistently select the lowest displayed continuation EV, target-specific Harvest labels are correct, and stale Craft A-specific terminology has largely been removed from Craft C.

However, neither Craft A nor Craft C is ready to be considered validated.

Current validation state:

| Craft | Cost diff | Harvest diff | Annul diff | Exalt diff | Missing states | Fallbacks |
|---|---:|---:|---:|---:|---:|---:|
| Craft A | 6.93% | 17.72% | 36.66% | 20.91% | 0 | 0 |
| Craft C | 11.85% | 14.13% | 5.30% | 6.58% | 0 | 0 |

The most important remaining work is therefore no longer basic generalization. It is reconciliation of the analytical Markov expectations with the Monte Carlo implementation, plus cleanup of acquisition semantics and reporting consistency.

Do not move to Craft B expansion or reintroduce Allflame yet.

---

## What Improved

### 1. Craft C is now genuinely much closer to the intended generalized model

Previously Craft C had approximately:

- 464% total-cost disagreement
- 582% Harvest disagreement
- 668% Annul disagreement
- 677% Exalt disagreement

The new result is:

- 11.85% total-cost disagreement
- 14.13% Harvest disagreement
- 5.30% Annul disagreement
- 6.58% Exalt disagreement

That is a major structural improvement.

### 2. Target-specific diagnostics are working

Craft C now correctly reports:

- Harvest Reforge Life
- `Sanguine` as the target Harvest mod
- `of the Meteor` and `of Eviction` as the required target suffixes
- the correct target-specific suffix pool states

The previous leakage of T1 ES, Intelligence, Attack Speed, and elemental resistance into Craft C diagnostics has been removed from the primary path report.

### 3. Representative policy decisions are mechanically consistent

The new representative-state audit shows the selected action has the lowest displayed continuation EV in the sampled states.

Examples from Craft C:

- Clean target-prefix state:
  - Harvest: 41275.2c
  - Exalt: 41201.7c
  - selected: Exalt
- One junk suffix:
  - Harvest: 41275.2c
  - Annul: 41242.0c
  - selected: Annul

Craft A likewise selects the lower displayed EV in the representative states.

The new `isMinEvVerified` / runtime verification direction is good and should remain permanently.

### 4. Harvest census generalization is substantially improved

Craft A now reports `Glowing` and Craft C reports `Sanguine` instead of a hardcoded T1 ES census.

This is exactly the direction needed for a target-driven engine.

### 5. Policy coverage remains strong

Both reference crafts report:

- `Missing policy states: 0`
- `Fallback actions used: 0`

This is important because it narrows the remaining discrepancy to analytical mechanics / transition accounting rather than state reachability.

---

# Remaining Findings

## P0 — Analytical and Monte Carlo action counts still disagree materially

This is now the highest-priority correctness problem.

### Craft A

Current differences:

- total cost: 6.93%
- Harvests: 17.72%
- Annuls: 36.66%
- Exalts: 20.91%

The Annul mismatch is especially large.

Because missing/fallback states are both zero, this suggests the analytical transition equations are not accounting for the same recovery/retry behavior that Monte Carlo actually executes.

Do not tune constants to make the percentages line up.

Audit the exact expected transition accounting for:

- Harvest success state distribution
- one-junk and two-junk cleanup paths
- target suffixes generated incidentally during Harvest
- Annul destructive branches
- recovery back to Harvest
- Exalt miss branches
- Annul-after-Exalt recovery
- target-preservation states
- any loops that return to an earlier state

For every analytical state, the expected count equations for Harvest / Annul / Exalt should be derived from the same transition graph used to compute expected cost.

### Craft C

Current differences:

- total cost: 11.85%
- Harvests: 14.13%
- Annuls: 5.30%
- Exalts: 6.58%

Annul and Exalt are now reasonably close, but Harvest remains outside the provisional threshold and dominates the cost difference.

The stepwise comparison makes this especially clear:

- analytical Harvest step: ~32641.9c
- Monte Carlo Harvest step: ~28030.6c
- difference: ~4611.3c

So the next Craft C investigation should focus primarily on expected Harvest rebuild loops.

## P0 — Monte Carlo completion rate for Craft C is below the current validation requirement

Craft C completed:

- 1,959 / 2,000 trials
- 97.95% completion
- 41 timed-out trials

The optimizer currently requires at least 98% completion before `isValidated` can be true.

This is only slightly below the threshold, but the timed-out trials are likely biased toward expensive paths. Excluding them can bias the Monte Carlo mean downward.

Do not simply increase the timeout again without understanding the distribution.

Recommended diagnostic additions:

- report average steps for completed trials
- report max steps for completed trials
- report how many trials crossed 5k / 10k / 20k steps
- report partial cost accumulated by timed-out trials
- optionally rerun the same policy at a larger step cap and compare the mean

If the completion rate becomes >99% with a higher cap and the MC mean rises noticeably, then timeout censoring is materially affecting validation.

## P0 — Acquisition semantics are still incorrect / overloaded

The requested acquisition-model cleanup is not fully implemented.

`OptimizeCraftRequest.startingStates` still exposes only:

```ts
{
  name: string;
  state: ItemState;
  baseCostChaos: number;
}
```

There is still no explicit acquisition type or confidence metadata at the optimizer API boundary.

This continues to create incorrect reporting.

### Craft A example

The selected starting strategy is:

`Self-Fracture 35% Effect (Clean 12p Base)`

with `baseCostChaos = 1533.4`.

But the report then creates a "Direct market purchase of fractured Powerful base" at exactly the same 1533.4c and labels it:

`High (Deterministic Market Purchase)`.

That is not the supplied market price. The known Craft A purchased fractured-35% input in the demo is 2600c.

### Craft C example

The report similarly invents a deterministic market purchase at 1533.4c even though no market purchase price was supplied for that fractured base.

This must be fixed before acquisition recommendations can be trusted.

Recommended API direction:

```ts
interface StartingCraftOption {
  name: string;
  state: ItemState;
  acquisition: {
    type: 'market' | 'self-fracture' | 'clean-base';
    costChaos: number;
    confidence: 'deterministic' | 'approximate';
  };
}
```

Or equivalent.

Rules:

1. Never infer market cost from a self-fracture cost.
2. Never invent a market option if no market price was supplied.
3. Carry the selected acquisition object unchanged into:
   - strategy comparison
   - plan step 1
   - Monte Carlo base cost
   - reporting
4. If market price is unavailable, explicitly print `Market purchase: not supplied`.

## P1 — Strategy comparison sale values are inconsistent for Craft C

Craft C's Harvest strategy comparison reports:

- Expected Sale Value: `0.0c`
- Expected Profit: negative full craft cost
- ROI: `-100%`

for Strategies A/B/C.

Later in the same report, the correct configured sale value is shown:

- Expected Sale Value: 32000c / 160d
- Expected Profit: -10814.4c
- ROI: -25.26%

The strategy comparison therefore is not receiving or applying the exact-target `saleValueChaos`.

This is a reporting/economic-model bug, even if the strategy cost ranking itself is correct.

Fix so that all strategy comparison rows use the same terminal sale-value semantics as the final recommended-strategy report.

For an exact target with one sale value, every successful terminal strategy should use that same sale value.

## P1 — Craft A still fails provisional validation by action counts

Craft A total cost is now much closer at 6.93%, but all three primary action counts are still outside the desired 10% threshold, especially Annuls at 36.66%.

This means Craft A should remain `INVESTIGATION REQUIRED` even if total cost later falls under 5% unless the action-count reconciliation is also fixed.

The action-count gate is valuable because total cost can accidentally look close while opposing count errors cancel financially.

Keep the gate.

## P1 — Craft C full economics currently show the craft is not profitable under the modeled normal-currency route

Current analytical result:

- expected cost: ~214.07d
- sale value: 160d
- expected profit: ~-54.07d
- ROI: -25.26%

Current Monte Carlo mean:

- ~188.70d

Even the MC mean is above the 160d sale price.

This is not itself a solver bug. It may simply mean this target is not profitably crafted by the currently available normal-currency action set and starting-cost assumptions.

Do not distort the solver to make this craft profitable.

Instead, once validation converges, treat this result as a useful signal that the optimizer may need additional legitimate core crafting actions to discover a better path.

But do not add those actions until the present analytical/MC model is reconciled.

## P1 — Craft C comparison of all four fractured starting states should be explicit in the review output

The optimizer does evaluate each supplied starting state and sorts them by total expected cost, but the compact review output makes it difficult to audit the complete four-way comparison.

For Craft C, explicitly print a compact table such as:

```text
Starting Fracture                 Acquisition   Downstream EV   Total EV
35% Effect                       ...           ...             ...
T1 Life                          ...           ...             ...
+4 Attributes                    ...           ...             ...
+5 Chaos Resistance              ...           ...             ...
```

This is important because one of Craft C's main purposes is to prove the optimizer does not assume which mod should be fractured.

Do the same for Craft A's competing fractured-35 vs fractured-Int routes.

## P2 — Mod display names in reports are mechanically correct but not user-friendly

Examples:

- `Powerful` for 35% increased Effect
- `Glowing` for T1 Maximum ES
- `Sanguine` for T1 Maximum Life
- `of the Prodigy` for T1 Intelligence
- `of the Meteor` for +4 Attributes
- `of Eviction` for +5 Chaos Resistance

These are internal affix names and are useful for data debugging, but the final craft report should preferably show the user-facing stat text, with the internal name optionally in parentheses.

For example:

`+10 Maximum Life [Sanguine]`

This is not a correctness blocker.

## P2 — Minor representative-state reason-value discrepancy

In Craft A and Craft C, the displayed candidate Harvest EV sometimes differs slightly from the value repeated in the reason text.

Example pattern:

- candidate table: Harvest = 6693.9c
- reason text: compare against 6697.0c

The recommended action is still correct, but the reason should reuse the exact candidate object rather than recompute or pull a nearby cached value.

The displayed candidate values, min-EV verification, and explanation string should all come from one shared evaluation result.

---

# Recommended Next Implementation Pass

Do not broaden scope.

The next pass should focus on four things only:

1. **Reconcile analytical transition/count equations with Monte Carlo**, starting with Craft A Annuls and Craft C Harvest rebuilds.
2. **Finish explicit acquisition modeling** so market and self-fracture costs cannot be conflated.
3. **Fix exact-target sale-value propagation** into the Strategy A/B/C comparison.
4. **Improve audit output** with complete per-starting-fracture totals and timeout diagnostics.

Do not work on Craft B yet.

Do not reintroduce Allflame yet.

Do not add unit tests.

---

# Validation Gates for the Next Run

## Minimum provisional acceptance

For each reference craft:

- total analytical vs MC difference <= 5%
- Harvest / Annul / Exalt count differences <= 10%
- missing policy states = 0
- fallback actions = 0
- completion rate >= 98%
- no min-EV recommendation violations
- no invented acquisition options/prices
- exact-target sale values consistent everywhere

## Validated policy-cost model goal

- total cost difference <= 2%
- action counts <= 10%
- preferably action counts <= 5%
- completion rate >= 99%
- terminal outcome distribution aligned
- mechanics assumptions separately labeled from analytical-vs-MC consistency

---

# Mechanics Assumptions Still Not Independently Validated

These remain separate from analytical/Monte-Carlo consistency and should remain explicitly labeled:

1. Harvest additional-affix distribution currently modeled as 50% one additional affix / 50% two additional affixes.
2. Self-fracture preparation cost / Alteration-Augs-Regal model remains approximate.
3. Any unsupplied market fracture price must remain unavailable rather than inferred.
4. Allflame mechanics remain deferred and disabled.

---

# Current Overall Assessment

The latest refactor is a meaningful success in generalization: Craft C is no longer catastrophically broken, diagnostics are target-aware, and min-EV action selection is behaving consistently in representative states.

The core engine is now at the stage where further progress should come from **mathematical reconciliation and model hygiene**, not from adding more craft-specific branches.

Craft A and Craft C should remain reference regression scenarios until both clear the validation gates above.
