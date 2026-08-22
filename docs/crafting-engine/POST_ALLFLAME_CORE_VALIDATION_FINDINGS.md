# Post-Allflame Core Validation Findings

## Scope

This document records the review findings from the first Craft A and Craft C runs after Allflame was deferred and the reference crafts were switched to normal crafting methods.

Source outputs reviewed:

- `output-craft-a-review.txt`
- `output-craft-c-review.txt`

Allflame is intentionally out of scope for this pass. The goal is to make the core crafting optimizer correct and generic before revisiting any league-specific Allflame mechanics.

No unit tests should be added as part of this work. Continue validating with end-to-end reference-craft runs, diagnostics, representative state audits, and analytical-vs-Monte-Carlo comparison.

---

# Executive Summary

The output split is working and the new review files are readable. The runs are useful because they expose several concrete defects in the current analytical solver and reporting layer.

The most important conclusion is:

> Do not add another reference craft, broaden Craft B, or reintroduce Allflame yet. Fix the generic analytical-policy and reporting layer first.

Both Craft A and Craft C currently resolve Monte Carlo policy states with zero missing states and zero fallback actions. This is encouraging: state reachability and simulator coverage appear substantially healthier than before.

However, analytical expectations do not agree closely enough with Monte Carlo, and Craft C demonstrates that significant Craft-A-specific assumptions still exist inside the supposedly generic solver/reporting path.

---

# Craft A Findings

## Current headline result

The current analytical Craft A result is approximately:

- Expected total cost: `7082.6c` / `35.41d`
- Expected sale EV: `7380.1c` / `36.90d`
- Expected profit: `297.5c` / `1.49d`
- ROI: `4.20%`

These values are provisional.

The large shift from the old Allflame result is expected because the active policy is now using normal Exalted Orbs instead of repeated best-of-four Allflame rolls.

## Validation mismatch

Craft A currently reports:

- Total cost difference: **15.43%**
- Harvest count difference: **19.91%**
- Annul count difference: **19.57%**
- Exalt count difference: **17.92%**
- Missing policy states: **0**
- Fallback actions: **0**

This is not close enough to consider the analytical policy model validated.

Because missing states and fallback actions are both zero, priority should shift toward the analytical transition equations, continuation-value equations, state probabilities, and terminal-branch calculations rather than state coverage.

## Terminal outcome distribution mismatch

The analytical final outcome distribution currently differs materially from Monte Carlo:

| Outcome | Analytical | Monte Carlo |
| --- | ---: | ---: |
| +4 All Attributes | 28.63% | 35.80% |
| 3% Attack Speed | 23.65% | 29.65% |
| +4% All Elemental Resistance | 47.72% | 34.55% |

This difference is too large to dismiss as 2,000-trial Monte Carlo noise.

As a result, the current analytical sale EV is also not yet trustworthy.

The terminal branch probabilities should be derived from exactly the same legal-state transitions and stop/sell policy used by the main Bellman solver.

## Stale Allflame text remains

The report still contains explanatory text such as completing prefixes through Allflame Exalts and references to old best-of-four hit rates, even though Allflame is disabled for the reference run.

This is a reporting bug.

When Allflame is disabled, the active Craft A/C report should contain no Allflame-specific strategy explanation except, optionally, a single explicit status line such as:

`Allflame: disabled / deferred`

All action labels and explanatory prose should be generated from the active action set rather than canned route-specific text.

## Acquisition model is conflating route cost and market cost

Craft A reports values equivalent to:

- Buy fractured base: `1533.4c`
- Self-fracture base: `1533.4c`

The first value is not a real market purchase price. It is being inherited from a starting state's `baseCostChaos`, which in this case represented a self-fracture acquisition estimate.

This confirms that `baseCostChaos` is currently overloaded with multiple meanings.

The acquisition model should explicitly represent acquisition method and price instead of inferring semantics from a number.

Recommended shape:

```ts
interface AcquisitionOption {
  type: 'market' | 'self-fracture' | 'clean-base';
  costChaos: number;
  confidence: 'deterministic' | 'approximate';
  description?: string;
}
```

A self-fracture starting state must never be reinterpreted as a deterministic market price.

---

# Craft C Findings

## Current validation is not usable

Craft C currently reports approximately:

- Total cost difference: **464.20%**
- Harvest count difference: **581.85%**
- Annul count difference: **668.39%**
- Exalt count difference: **677.28%**
- Missing policy states: **0**
- Fallback actions: **0**

The current Craft C economics must therefore be treated as invalid.

This run is still valuable because it clearly exposes where the analytical policy/reporting layer remains shaped around Craft A.

## Craft A concepts are leaking into Craft C

Craft C's target is:

- T1 Maximum Life
- 35% increased Effect
- +4 All Attributes
- +5% Chaos Resistance

However, Craft C diagnostics still discuss concepts including:

- T1 ES
- T1 Intelligence
- Premium Suffix
- Frac 35 + T1 ES
- 3% Attack Speed
- All Resistance

This means generic diagnostics are still being produced from Craft-A-specific assumptions rather than `TargetDefinition` plus the current item state.

The following must all be parameterized from the active target and active route:

- representative states
- Harvest census
- suffix/prefix pool diagnostics
- target labels
- continuation-action labels
- terminal-state labels
- strategy descriptions

## Strategy comparison contradicts itself

Craft C currently reports approximately:

- Strategy A: `6785.0c`
- Strategy B: `3940.8c`
- Strategy C: `6785.0c`

but then recommends Strategy C and describes Strategy B as more expensive.

Those statements cannot all be correct.

Either Strategy B's cost calculation is invalid or recommendation/reporting is still using old hardcoded logic.

The recommended strategy must be selected mechanically from the candidate expected costs, not through route-specific prose or a separate stale decision rule.

## Candidate continuation values contradict chosen actions

Several Craft C representative states explicitly recommend the more expensive candidate.

Examples from the current output include patterns equivalent to:

```text
Exalt continuation EV:   5455.2c
Harvest continuation EV: 5257.4c
Recommended: Exalt
```

and:

```text
Annul continuation EV:   5362.4c
Harvest continuation EV: 5257.4c
Recommended: Annul
```

and:

```text
Annul continuation EV:   5260.0c
Harvest continuation EV: 5257.4c
Recommended: Annul
```

For a minimum-expected-cost solver, the recommendation must match the minimum legal continuation EV unless another objective is explicitly active.

This is a high-priority correctness defect.

Recommendation selection and displayed continuation values must come from the same underlying candidate-evaluation structure.

Do not calculate the displayed EVs in one place and the chosen action in another route-specific branch.

## Impossible-looking zero continuation values

Craft C includes nonterminal actions with continuation EV values of `0.0c`, for example stale Craft-A-style states where another Exalt is still required.

A nonterminal paid action should not have zero expected continuation cost unless there is an explicit zero-cost transition, which is not the case here.

Audit for default-zero values, missing map entries, uninitialized branch-specific continuation values, or stale Craft-A fields being reused for Craft C.

## Harvest census is hardcoded to T1 ES

Craft C uses Harvest Reforge Life, but the census still reports:

`T1 ES Hit Rate: 0.00%`

This is expected under the current stale reporting because Craft C is not rolling Defence.

The census must instead track the active Harvest target selected by the policy engine, e.g. T1 Life for this route.

The Harvest diagnostic layer should be driven by:

- `harvestTag`
- `harvestModGroup`
- `harvestModName`
- actual target hit predicate

not by hardcoded T1 ES concepts.

## Step 1 cost is internally inconsistent

Craft C can recommend a self-fracture option at roughly `1527.4c`, but the generated Base Acquisition step can then use `1533.4c`.

That indicates route selection and step-plan rendering are using different acquisition values.

There should be a single canonical selected acquisition option object that is reused for:

- recommendation
- total EV
- step plan
- Monte Carlo start cost
- report output

---

# Architectural Findings

## The analytical policy engine is still too craft-shaped

Craft C has successfully demonstrated that the current policy layer does not yet behave like a fully generic target solver.

The next refactor should reduce concepts like:

- `vFracLife*`
- `vInt`
- `vAttr`
- `vAS`
- `vRes`
- "non-Int target means Attributes + Resistance"
- "fractured non-35 prefix means next prefix is 35%"

and replace them with target-derived state construction.

A state should fundamentally be evaluated from:

1. which required mod groups are present;
2. which required mod groups are missing;
3. current prefix/suffix capacity;
4. fractured/protected mods;
5. currently blocked mod groups;
6. eligible mod pool and dynamic weights;
7. legal actions;
8. expected continuation value for each legal action.

Do not encode Craft A or Craft C as special policies.

## Recommended generic decision rule

At a state `s`, the policy should conceptually be:

```ts
const candidates = legalActions(s).map(action => ({
  action,
  expectedCost: immediateCost(action) + expectedContinuationCost(action, s),
}));

const best = minBy(candidates, x => x.expectedCost);
```

The displayed candidate EVs, selected action, Monte Carlo policy lookup, and explanation should all reference this same evaluation result.

This eliminates the current class of contradictions where the report shows Harvest cheaper but recommends Annul or Exalt.

---

# Required Next Changes

## Priority 1 — Make policy choice mechanical

For every state:

- enumerate legal actions;
- compute expected continuation cost;
- choose the minimum expected-cost action;
- ensure the report displays the exact same candidate objects used for selection.

Add a runtime diagnostic assertion for the reference scripts:

```text
recommended EV == min(candidate EVs)
```

Within a small floating-point tolerance.

Do not add a unit test suite; emit diagnostic failures in the reference run instead.

## Priority 2 — Parameterize diagnostics and reporting

Remove Craft-A-specific wording from generic reporting.

Derive:

- Harvest target name
- target mod groups
- target suffix/prefix labels
- representative state descriptions
- terminal branch labels
- action names
- pool diagnostics

from the current `TargetDefinition`, `ItemState`, and active action set.

## Priority 3 — Fix acquisition semantics

Do not overload `baseCostChaos` with both market price and self-fracture expected cost.

Introduce explicit acquisition metadata and carry the selected option through the entire result object.

If no real market price is supplied, say:

`Market purchase: unavailable / not supplied`

Do not invent one from the self-fracture price.

## Priority 4 — Reconcile Craft A analytical transition math

Investigate why Craft A's analytical vs Monte Carlo counts differ by roughly 18–20% despite zero policy misses/fallbacks.

Prioritize:

- Harvest transition probabilities
- cleanup/rebuild loops
- Exalt miss + Annul recovery loops
- target-hit state transitions
- restart probabilities
- cumulative action counts

## Priority 5 — Fix analytical terminal outcome distribution

Craft A's final outcome branch distribution must converge toward Monte Carlo before using analytical expected sale value/profit.

The final branch distribution should be derived from the actual state-aware stopping policy rather than a separate hand-derived formula if those formulas are currently diverging.

## Priority 6 — Parameterize Harvest census

Craft A should census T1 ES when Defence is active.

Craft C should census T1 Life when Life is active.

The same diagnostic implementation should support either without craft-specific branches.

## Priority 7 — Remove stale Allflame text

With `enableAllflame: false`, active Craft A/C reports should not mention Allflame hit rates or Allflame completion logic.

Allflame remains deferred and isolated as a plugin for future work.

---

# Validation Gate After Fixes

After the next implementation pass, rerun Craft A and Craft C and regenerate the compact review outputs.

Minimum provisional acceptance criteria:

- total analytical-vs-Monte-Carlo cost difference <= 5%;
- primary action counts <= 10% difference;
- missing policy states = 0;
- fallback actions = 0;
- no state where recommended action has higher displayed EV than another legal candidate;
- no stale target terminology from another craft;
- no impossible zero-cost nonterminal candidate actions;
- consistent acquisition value throughout recommendation, step plan, and Monte Carlo start state.

Target for declaring the policy-cost model validated:

- total cost difference <= 2%;
- terminal branch distribution reasonably aligned with Monte Carlo;
- mechanics assumptions explicitly labeled separately from analytical/Monte-Carlo consistency.

---

# What Not To Do Yet

Do not:

- reintroduce Allflame;
- add new league mechanics;
- expand Craft B as the next major target;
- add another reference craft;
- add unit tests;
- add `if (CraftA)`, `if (CraftC)`, `if (Minion)`, or equivalent solver branches to make the reference crafts pass;
- preserve old analytical equations merely to retain previous cost numbers.

Craft C should be used as a pressure test for generic solver behavior, not as a reason to add another specialized route.

---

# Current Assessment

| Area | Status |
| --- | --- |
| Allflame isolation | PASS |
| Separate review outputs | PASS |
| Monte Carlo missing states | PASS (0) |
| Monte Carlo fallback actions | PASS (0) |
| Craft A analytical consistency | FAIL / investigation required |
| Craft A terminal distribution | FAIL / investigation required |
| Craft C analytical consistency | FAIL |
| Generic target reporting | FAIL |
| Mechanical min-EV action selection | FAIL in representative Craft C states |
| Acquisition semantics | NEEDS REFACTOR |
| Harvest diagnostics generalization | NEEDS REFACTOR |
| Ready for Craft B expansion | NO |
| Ready to reintroduce Allflame | NO |

The next milestone should be a generic core solver/reporting pass where Craft A and Craft C both validate from the same target-driven logic.