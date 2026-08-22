# Post-Seeded Monte Carlo and Discovery Review Findings

Reviewed `main` after implementation commit `df30c29f96e5d23124a7af4efb7b6fe4fd1f3f73` (`Fix mixed-outcome risk metrics, add MC uncertainty metrics, PRNG, and discovery scaffolding`) and the regenerated Craft A / Craft C review outputs.

## Executive Summary

The direction remains correct for the long-term goal of a UI where the user chooses any 1–4 target mods and the optimizer discovers the least-expensive craft.

The latest pass made several important improvements:

- seeded Monte Carlo is now available and reference runs use `seed: 42`;
- random sampling has been centralized behind a `RandomSource` abstraction instead of direct `Math.random()` in the simulator;
- mixed-outcome profit calculations now use per-trial realized branch profit rather than pretending all Craft A outcomes share one sale value;
- Monte Carlo uncertainty metrics were added;
- Craft A remains strongly reconciled;
- Craft C remains inside the provisional point-estimate gate;
- discovery-oriented scaffolding has started without replacing the validated reference fixtures.

The core Bellman/policy work should remain stable. The next work should focus on statistical correctness around censored/heavy-tail simulations and turning the discovery scaffolding into a truly generic production path.

---

## 1. Craft A remains validated and improved

Latest Craft A result:

- analytical expected total: `7623.7c` (~38.12d)
- analytical expected sale EV: `8790.7c` (~43.95d)
- analytical expected profit: `1167.0c` (~5.83d)
- ROI: `15.31%`
- analytical vs Monte Carlo total difference: **1.16%**
- missing policy states: `0`
- fallback actions: `0`

This is an improvement from the previous 1.78% seeded/unseeded review point and remains comfortably inside the <=2% validated target.

The representative state decisions continue to choose the displayed minimum continuation EV. The target-driven terminology and acquisition reporting are also preserved.

### Recommendation

Do not broadly change Craft A's policy equations or transition graph. Treat it as the primary regression fixture while discovery work expands.

---

## 2. Craft C remains provisionally validated, but one timeout matters

Latest Craft C result:

- analytical expected total: `42814.4c` (~214.07d)
- Monte Carlo mean: `41249.6c` (~206.25d)
- total difference: **3.65%**
- Harvest count difference: **5.80%**
- Annul difference: **3.88%**
- Exalt difference: **2.50%**
- completed: `1999 / 2000`
- timed out: `1`
- completion: `99.95%`
- missing policy states: `0`
- fallback actions: `0`

By the current provisional gates, this still passes. However, Craft C is very heavy-tailed, so the single timeout cannot be treated as completely irrelevant.

A timed-out path is likely to be one of the expensive right-tail observations. Excluding it from the completed-cost sample can bias the Monte Carlo mean downward.

### Recommendation

Keep Craft C provisionally validated, but add an explicit distinction between:

- `completed-trial mean / CI`, and
- `censored validation status`.

If any timed-out trials exist, the report should not say or imply that the confidence interval fully captures simulation uncertainty around the uncensored population mean.

---

## 3. Seeded RNG abstraction is the correct architecture

The new `RandomSource` abstraction is a good change.

Reference demos now use a fixed seed, while production/default behavior can still use normal random sampling. This gives reproducible regression diagnostics without making runtime crafting behavior deterministic.

Keep this pattern:

```ts
interface RandomSource {
  next(): number;
}
```

with both:

- seeded deterministic validation source;
- default nondeterministic source.

### Next step

Do not rely on only one seed for statistical validation.

Add an optional validation harness that can run a small deterministic seed set, for example:

```text
[42, 1337, 2026, 9001, 123456]
```

and report:

- per-seed mean;
- pooled/aggregate mean if statistically appropriate;
- range of point-estimate differences;
- whether conclusions are stable across seeds.

This should be a diagnostic/reference workflow, not unit tests.

---

## 4. Confidence interval implementation needs censoring-aware reporting

The current implementation computes:

- sample standard deviation;
- standard error;
- normal-approximation 95% CI;
- whether analytical EV lies inside that CI.

That is useful, but for Craft C the completed sample excludes one timed-out path.

Therefore:

```text
95% CI of completed trials
```

is not necessarily the same thing as:

```text
95% CI for the uncensored craft-cost distribution
```

For zero-timeout cases like Craft A, the distinction is not material.

For any nonzero timeout count, explicitly label the CI as completed-trials-only and mark the validation as censored.

### Suggested reporting

```text
MC Mean (completed trials): ...
Sample SD: ...
Standard Error: ...
95% CI (completed trials): [..., ...]
Timed out: 1 / 2000
Censoring status: PRESENT
Analytical inside completed-trial CI: YES/NO
```

Do not use `analyticalInsideCi95` as a hard validation pass when censoring is present.

---

## 5. Normal-approximation CI is helpful but should not become the sole heavy-tail gate

Craft C is strongly right-skewed. A normal 1.96×SE interval for the sample mean is reasonable as a first diagnostic at ~2000 observations, but it should not be the only evidence used for heavy-tail stability.

Add one of these later:

- multi-seed stability comparison; or
- bootstrap CI over completed costs; or
- both.

Do not replace the analytical-vs-MC/action-count gates with only a confidence-interval gate.

A good validation decision should consider:

1. total point-estimate difference;
2. action-count differences;
3. completion / censoring;
4. seed stability / CI;
5. zero missing states / fallbacks;
6. mechanics fidelity separately.

---

## 6. Mixed-outcome risk reporting is now conceptually correct

The prior Craft A bug was that cost percentiles were converted into profit using the first outcome branch's `17000c` value.

The latest implementation instead records per-trial realized profit from the actual terminal branch and stores profit-distribution statistics.

That is the correct model.

### Remaining reporting guidance

For branch-specific crafts like Craft A, present:

```text
Sale model: Branch-specific
Probability realized profit >= 0
Mean realized profit
Median realized profit
P25 realized profit
P10 realized profit
P5 realized profit
```

Keep cost percentiles as a separate section.

Do not label P75/P90/P95 profit as if higher profit percentiles represented downside risk. For downside-focused presentation, P25/P10/P5 profit is easier for users to interpret.

For fixed-value Craft C, cost percentiles plus `sale - cost` are mathematically valid, but using the same realized-profit distribution machinery across all crafts is cleaner.

---

## 7. Discovery scaffolding is the right next architectural direction

The long-term target remains:

```text
User chooses base + ilvl + 1–4 mods
        ↓
TargetDefinition
        ↓
automatic starting candidate generation
        ↓
generic legal-action discovery
        ↓
state-transition / Bellman search
        ↓
minimum expected cost policy
```

The manually supplied Craft A/C starting states should remain as regression fixtures, but they should not be the production API forever.

The next meaningful implementation milestone should expose a clean production-facing abstraction such as:

```ts
generateStartingStrategies(target, context)
```

that can derive candidates from the selected target rather than from demo code.

At minimum it should be able to generate:

- clean base;
- self-fracture each fracture-eligible required mod;
- market version of a required fractured mod only when a market price is actually supplied;
- equivalent acquisition methods grouped under the same physical starting state.

Do not add Craft-A/C conditionals.

---

## 8. Starting-strategy generation must separate state generation from pricing

For the future UI, avoid coupling candidate existence to known market price.

These are separate concepts:

```text
Physical candidate state:
  fractured 35% Effect

Acquisition methods:
  self-fracture EV
  market purchase price (optional)
```

A useful model is:

```ts
interface StartingStateCandidate {
  state: ItemState;
  label: string;
  acquisitions: AcquisitionOption[];
}
```

Then the evaluator can compare:

```text
same downstream state + different acquisition costs
```

without duplicate route logic.

This aligns directly with the eventual frontend, where market data may be available for some fractures and unavailable for others.

---

## 9. Generic legal-action discovery should now become the major engine milestone

The next major engine abstraction should be something like:

```ts
getLegalActions(state, target, context): CraftAction[]
```

It should answer only:

> What actions are legal and modeled from this state?

The Bellman layer should then evaluate those actions.

Initial ordinary action coverage should prioritize:

- Alteration;
- Augmentation;
- Regal;
- Scour;
- Exalt;
- Annul;
- Harvest reforges;
- Fracturing;
- bench/filler actions;
- restart.

Do not reintroduce Allflame yet.

The important architectural rule is that the target should not preselect a scripted route family.

---

## 10. State-space growth needs to be designed for now

Once generic legal-action discovery is enabled, state explosion becomes the next likely problem.

Before adding many more mechanics, preserve or add abstractions for:

- canonical state keys;
- memoized continuation values;
- equivalent-state collapsing;
- dominance pruning;
- action pruning;
- probability aggregation;
- target-aware roll normalization.

For example, if a numeric roll is irrelevant to the selected target, states differing only by that irrelevant roll should not remain distinct unless it affects legal transitions.

This is essential for supporting arbitrary 1–4-mod targets interactively in a future UI.

---

## 11. Display-name work should stay data-driven

The latest display names are easier to understand, but some formatting remains implemented through known Affliction-jewel group/name handling.

Do not expand this into a giant dictionary of every modifier.

The long-term display layer should derive from scraped data:

- `statText`;
- `statValues`;
- `tier`;
- affix/mod name;
- `modGroup`.

Internal names can remain in brackets for auditability.

This becomes important once the UI exposes arbitrary selectable mods.

---

## 12. Mechanics fidelity remains the largest correctness risk

Do not upgrade `GAME-MECHANICS FIDELITY: PARTIAL` yet.

Shared assumptions still include:

- Harvest additional-affix generation modeled as 50% one extra / 50% two extra;
- self-fracture Alteration/Augmentation/Regal/bench preparation is approximate;
- ordinary action coverage is incomplete;
- market prices are only available when explicitly supplied;
- Allflame remains deferred.

Analytical vs Monte Carlo agreement proves internal model consistency, not game-mechanics correctness.

---

## 13. Recommended next implementation order

1. Make MC uncertainty reporting explicitly censoring-aware.
2. Add deterministic multi-seed validation diagnostics.
3. Keep Craft A as a locked regression fixture.
4. Keep Craft C provisional and heavy-tail-aware.
5. Formalize `StartingStateCandidate` / automatic starting-strategy generation.
6. Begin generic `getLegalActions(...)` discovery for ordinary currency actions.
7. Add state-space pruning/normalization as action coverage grows.
8. Revalidate Craft A/C after each structural step.
9. Only then expand to Craft B as a proof that clean/magic/rare progression is discovered generically.
10. Keep Allflame and frontend deferred.

---

## 14. Validation gates going forward

### Craft A

Keep:

- total analytical vs MC <=2% target;
- action counts <=10%, preferably <=5%;
- terminal branch distribution aligned;
- completion 100% or effectively uncensored;
- missing states = 0;
- fallbacks = 0;
- no min-EV violations.

### Craft C

Keep provisional requirements:

- total point-estimate difference <=5%;
- action counts <=10%;
- completion >=99%;
- missing states = 0;
- fallbacks = 0;
- no min-EV violations.

Additionally:

- explicitly flag any timeout censoring;
- report completed-trial CI separately from uncensored claims;
- use multiple deterministic seeds before drawing conclusions from small movements in the point estimate.

---

## 15. Do not do these yet

Do not:

- add unit tests;
- reintroduce Allflame;
- build the frontend;
- tune Craft C to become profitable;
- claim global optimality;
- add separate 1/2/3/4-mod algorithms;
- introduce Craft-specific route branches;
- replace expected-value optimization with median optimization;
- add many new crafting mechanics before generic legal-action discovery and state pruning are ready.

---

## Bottom Line

The project is on the correct path for the eventual arbitrary 1–4-mod optimizer UI.

Craft A is now a strong validated reference model, while Craft C remains a useful heavy-tail provisional reference. The seeded RNG and per-trial profit changes improve the validation framework substantially.

The next architectural threshold is no longer another Craft A/C formula pass. It is converting the validated engine from manually seeded strategy candidates into:

```text
target-driven candidate generation + generic legal-action discovery
```

while keeping the current reference crafts as regression checks.
