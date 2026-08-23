# Post Graph Diagnostics and Harvest Parity Review

## Purpose

This document reviews the implementation committed at:

`bb7759882e60a057876f260ca58ace7d638d2b47`

Commit message:

`Add graph completeness metrics, value iteration diagnostics, expected-cost reconciliation, and cumulative CoE parity`

It also incorporates the newest cumulative Craft of Exile simulation snapshot supplied after that commit.

This is the source of truth for the next implementation pass.

Do **not** redo completed work from earlier phases.

---

# Executive Summary

The latest pass added several important diagnostics and exposed two real correctness blockers that should now be addressed before adding Scour, restart, shared Exalt, or generic Fracturing.

The strongest positives are:

- Craft A remains stable at 1.16% analytical-vs-Monte-Carlo difference.
- Craft C remains provisionally stable at 3.65% analytical-vs-Monte-Carlo difference.
- unknown currency lookup no longer silently becomes 1 chaos;
- price provenance is substantially clearer;
- the generic solver now reports graph truncation instead of hiding it;
- Bellman iteration reports numerical convergence;
- expected currency usage now includes Augmentation;
- the external Craft of Exile data is being preserved as a permanent benchmark.

However, two major findings now matter more than expanding the action set.

## Finding 1 — The external Harvest parity report is currently a false positive

The report marks the compound Harvest benchmark as `ALIGNED`, but the current engine value is statistically inconsistent with the external Craft of Exile result.

Latest external cumulative observation:

- Harvest Reforge Defence attempts: **2,601,014**
- successful compound states: **3,187**
- observed probability: **0.122529%**
- approximately **1 / 816.13**
- approximate 95% Wilson interval: **0.11835% – 0.12685%**

Current parity report engine analytical value:

- **0.1460%**
- approximately **1 / 684.9**

The engine result is outside the external 95% confidence interval by a wide margin.

Relative to the external observation, the current analytical probability is roughly **19% too high**.

Under a simple binomial comparison using the current engine probability as the null expectation, the latest external observation is roughly **9.9 standard deviations lower** than the engine expectation.

This is not an `ALIGNED` result.

It should be:

`INVESTIGATING — STATISTICALLY SIGNIFICANT MECHANICS MISMATCH`

Do **not** tune a constant to 0.122529%.

The next pass must determine which mechanics assumption produces the discrepancy.

## Finding 2 — The generic Bellman policy is numerically converged on a truncated graph, not proven globally optimal

The latest clean-base diagnostic reports:

- canonical states expanded: **5,000**
- configured hard limit: **5,000**
- graph truncated: **YES**
- unique queued/unexpanded states: **41,505**
- transitions to unexpanded states: **86,560**
- terminal states discovered: **121**
- Bellman iteration converged: **YES**
- iterations: **331**
- final residual: **9.8646e-6**
- policy proper: **NO**
- unresolved selected-policy transitions reported: **4,862**
- expected-visit solver converged: **NO**
- expected-cost reconciliation: **FLAGGED**

The Bellman numbers are therefore converged for the **currently materialized/truncated approximation**, not proven for the complete action graph.

The current T1 Intelligence policy may be correct, but the engine cannot yet call it a proven global optimum.

---

# Latest Craft of Exile Snapshot

The following values come from the newest screenshot from the same cumulative long-running Craft of Exile simulation.

Do **not** add these counts to earlier snapshots from this run. They supersede the older cumulative values.

## Step 1 — Alteration -> T1 Intelligence

Latest long-run snapshot:

- attempts: **8,257**
- passes: **121**
- observed: **1.4654%**
- approximately **1 / 68.24**

The permanent dedicated Alteration benchmark is still stronger:

- 209,862 attempts
- 3,193 hits
- 1.5215%
- approximately 1 / 65.7

Keep the larger dedicated benchmark as the primary Alteration parity fixture.

## Step 4 — Fracturing Orb -> desired T1 Intelligence fracture

Latest long-run snapshot:

- attempts: **121**
- passes: **32**
- observed: **26.446%**
- approximately **1 / 3.78**

The permanent 1,000-attempt fracture benchmark remains stronger:

- 1,000 attempts
- 250 passes
- exactly 25.000%

Keep the 1,000-attempt benchmark as the primary Fracturing fixture.

## Step 5 — Compound Harvest Defence success

Exact success condition for this long policy must remain identical to the Craft of Exile recipe.

Latest cumulative observation:

- attempts: **2,601,014**
- passes: **3,187**
- observed: **0.122529%**
- approximately **1 / 816.13**
- approximate 95% Wilson interval: **0.11835% – 0.12685%**

This is now an extremely strong external mechanics benchmark.

Current engine parity value:

- analytical: **0.1460%**
- approximately **1 / 684.9**

Current engine Monte Carlo value printed by the parity harness:

- **0.1440%**
- approximately **1 / 694.4**

The external result does not agree with these values.

This is the most important external-mechanics issue currently known.

## Step 6 — Post-Harvest Annul pass

Latest cumulative observation:

- attempts: **4,019**
- passes: **863**
- observed: **21.4730%**
- approximately **1 / 4.657**
- approximate 95% Wilson interval: **20.231% – 22.769%**

Current engine comparison value:

- approximately **22.0%**

The engine expectation remains comfortably inside the external confidence interval.

Status:

`ALIGNED / NO CURRENT MECHANICS CHANGE JUSTIFIED`

## Step 7 — Final Exalted Orb

Success condition:

- +4 All Attributes
- OR 3% Attack Speed

Latest cumulative observation:

- attempts: **863**
- passes: **31**
- observed: **3.5921%**
- approximately **1 / 27.84**
- approximate 95% Wilson interval: **2.542% – 5.054%**

Current engine pool-derived expectation:

- desired weight = 300 + 250 = 550
- eligible suffix weight = 14,450
- expected probability = **3.8062%**
- approximately **1 / 26.27**

The current engine expectation is comfortably inside the external confidence interval.

Status:

`ALIGNED / NO CURRENT EXALT CHANGE JUSTIFIED`

---

# 1. Fix External Parity Status Logic

This is the highest-priority reporting/correctness fix.

The current parity implementation uses a fixed absolute percentage-point threshold to decide whether observations are aligned.

That is inappropriate for rare events.

For example:

```text
External Harvest: 0.1225%
Engine Harvest:   0.1460%
Absolute diff:    0.0235 percentage points
```

An absolute threshold such as 0.25 percentage points calls this aligned even though the difference is approximately 19% relative and is far outside the external confidence interval.

Replace the current rule with statistics that respect sample size and event rarity.

Recommended minimum fields:

```ts
interface ParityComparisonResult {
    externalObservedProbability: number;
    externalAttempts: number;
    externalSuccesses: number;
    externalCi95: [number, number];

    analyticalProbability: number;
    internalMcProbability: number;
    internalMcAttempts: number;

    absoluteDifference: number;
    relativeDifference: number;
    analyticalInsideExternalCi95: boolean;

    status:
        | 'ALIGNED'
        | 'INVESTIGATING'
        | 'INSUFFICIENT_EXTERNAL_SAMPLE';
}
```

Equivalent design is acceptable.

For sufficiently large external samples, if the analytical probability is clearly outside the external 95% interval, do not report `ALIGNED`.

Do not use one fixed absolute percentage-point threshold for all mechanics.

---

# 2. Remove Hardcoded Engine Results from External Parity

The parity framework is intended to be independent validation, but several current comparison values are still hardcoded rather than calculated from the mechanics implementation being validated.

Examples currently present include values equivalent to:

```ts
const harvestDefenceProb = 0.00146;
const annulPassProb = 0.2200;
const mcExaltProb = 0.0381;
```

The Fracturing comparison is also directly inserted as 25% rather than being produced by an executable Fracturing mechanic.

The Exalt analytical denominator is currently effectively fixed to 14,450 in the parity code rather than derived from the exact current state through shared eligibility logic.

This defeats the purpose of parity testing.

The parity harness must ask the engine:

> What probability does the actual current mechanics implementation produce for this exact benchmark state and success condition?

Then Monte Carlo must sample the same shared transition definition.

No benchmark-specific engine probability constants.

No copied expected values.

No copied Monte Carlo percentages.

Craft of Exile observations may be stored as data.

Engine answers must be generated.

---

# 3. Build a Real Fixed-Policy Parity Runner

The next parity milestone should be an exact fixed-policy evaluator for the user's Craft of Exile recipe.

This must remain separate from the optimizer.

Its purpose is not to find a better craft.

Its purpose is:

> Force our engine to follow the same policy and compare mechanics step-by-step.

The runner should propagate the actual state distribution through the policy.

This is important because later conditional rates depend on the mixture of states produced by earlier steps.

Do not compare Annul or final Exalt using one hand-constructed representative state if Craft of Exile is reaching those steps from a distribution of states.

Recommended architecture:

```text
Initial state distribution
    -> Alteration-until condition
    -> Regal
    -> fill / Exalt as specified
    -> Fracturing
    -> restart on wrong fracture
    -> Scour
    -> Harvest-until exact compound condition
    -> Annul and conditional retry
    -> final Exalt
```

For each step report:

```text
External Craft of Exile
Analytical fixed-policy engine
Internal seeded Monte Carlo
Absolute difference
Relative difference
External confidence interval
Status
```

The analytical and MC results must come from actual shared mechanics.

Do not use optimizer decisions inside this runner.

---

# 4. Harvest Mechanics Is Now a Real Investigation, Not an Assumption Note

The compound Harvest difference is no longer too small to interpret.

External evidence now contains more than 2.6 million attempts.

The current engine appears to overestimate the desired compound Harvest state.

The next pass should trace the discrepancy mechanically.

Do not change one probability constant to make the output match.

Audit at least:

- how many total explicit modifiers a Harvest Reforge can produce;
- distribution of resulting prefix/suffix counts;
- how the existing fractured suffix occupies an affix slot;
- guaranteed Defence-tag modifier selection;
- T1 ES weight and eligible Defence pool;
- 35% Effect eligibility after T1 ES is generated;
- mod-group exclusion behavior;
- affix-cap behavior;
- ordering of guaranteed modifier vs other generated affixes;
- the current one-extra/two-extra-affix assumption;
- any 3/4/5/6-mod rare-generation mechanics that are being approximated away.

The current shared assumption that successful Harvest states contain a 50/50 split between one and two additional affixes must no longer be treated as harmless merely because analytical and internal Monte Carlo agree.

Both internal systems share that assumption.

The external benchmark now gives us evidence capable of falsifying it.

---

# 5. Use Both Harvest Benchmarks to Localize the Error

There are now two useful external Harvest fixtures.

## Single-target fixture

Fractured T1 Intelligence -> Harvest Defence -> T1 Maximum ES

External:

- 2,907 attempts
- 250 successes
- **8.599%**
- approximately 1 / 11.63

## Compound fixture

Fractured T1 Intelligence -> Harvest Defence -> T1 Maximum ES + 35% Effect

Latest external:

- 2,601,014 attempts
- 3,187 successes
- **0.122529%**
- approximately 1 / 816.13

Calculate both from the actual engine.

This comparison can localize the problem:

### If T1 ES single-target probability matches, but ES + 35 does not

Likely investigate:

- additional-affix count distribution;
- prefix-slot availability;
- ordering of extra modifier generation;
- 35% Effect eligibility/blocking after ES;
- rare affix-count mechanics.

### If T1 ES itself does not match

Likely investigate:

- guaranteed Defence-tag selection;
- Defence pool weighting;
- item-level filtering;
- mod-group filtering;
- Harvest guaranteed-mod behavior.

Print both diagnostics explicitly.

---

# 6. The Generic Graph Is Still Truncated

Latest clean-base T1 Intelligence diagnostic:

```text
Expanded states:              5,000
Hard maxStates:               5,000
Hit state limit:              YES
Queued unique states:         41,505
Unexpanded transition edges:  86,560
Terminal states found:        121
```

This is useful instrumentation.

It confirms the state-space issue is real rather than hypothetical.

Do not solve it by simply changing 5,000 to a much larger arbitrary number.

First understand which actions create the explosion.

---

# 7. Add State-Expansion Attribution by Action

The current state-count breakdown shows:

```text
Normal states: 1
Magic states:  1,359
Rare states:   3,640
```

The fact that thousands of rare states appear in a one-mod T1 Intelligence problem strongly suggests off-policy branches such as Regal and subsequent rare-state actions are dominating graph expansion.

Add graph diagnostics grouped by the action that first discovered each new canonical state.

For example:

```text
New unique states generated by:
Transmutation: X
Alteration:    X
Augmentation:  X
Regal:         X
Annul:         X
...
```

Also report:

- queue contribution by action;
- terminal states found by action;
- unresolved successor edges by action;
- whether states are reachable under the selected policy from the start;
- whether states exist only in off-policy candidate branches.

This should tell us exactly why the one-mod graph exceeds 5,000 states.

---

# 8. Fix the "Missing Probability Mass" Metric

The current graph builder calculates a value described as:

`transitionProbabilityMassToUnexpandedStates`

by summing probabilities on unresolved edges and dividing by the number of transition edges.

That is not a meaningful probability that the process exits the expanded graph.

Each action has its own probability distribution that sums to one.

Probabilities from unrelated actions/states cannot be globally summed and divided by edge count to produce process probability mass.

Replace this metric.

Useful graph-level metrics include:

- unresolved edge count;
- actions with at least one unresolved successor;
- maximum unresolved successor probability within any action;
- unresolved probability mass per state/action;
- selected-policy unresolved probability mass from start, weighted by on-policy occupancy when available.

Do not present a globally averaged edge probability as process escape probability.

---

# 9. Separate Full Candidate Graph Completeness from Selected-Policy Completeness

The current properness output says:

```text
Policy Proper & Absorbing: NO
Terminal Absorption Probability: 100.0%
Unresolved Selected Policy Transitions: 4,862
```

These values are not mutually useful as currently defined.

If selected-policy transitions are unresolved, a definitive 100% absorption probability cannot be claimed unless unresolved mass is proven unreachable from the start.

The current unresolved-selected-transition count also appears to inspect the selected action for every state in the policy map, not only states that are reachable under the selected policy from the starting state.

Separate the concepts.

## Candidate graph

All states/actions explored because they might compete for optimality.

## On-policy graph

Only states reachable from the initial state when following the selected action at each state.

Report:

```text
On-policy reachable states
On-policy terminal states
On-policy unresolved edges
On-policy unresolved probability mass
Terminal absorption lower bound
Unknown/unexpanded probability mass
Dead-end probability mass
```

If unresolved mass exists, report terminal absorption as a lower bound / unresolved result rather than an unconditional 100%.

---

# 10. Do Not Use a Fixed Dead-End Penalty to Prove Action Dominance

The generic solver currently uses a finite constant equivalent to:

```ts
DEAD_END_PENALTY = 150000;
```

and uses that value for missing/unexpanded successor states.

This can distort Q-values.

For example, Regal currently appears with continuation values around 148k chaos largely because unresolved successors are being assigned this fixed penalty.

That is not proof that Regal is economically worse.

It is a consequence of truncation.

A finite placeholder must not be allowed to turn an unresolved action into a supposedly proven dominated action.

Move toward an explicit status for candidate actions:

```text
COMPLETE
UNRESOLVED
IMPROPER / NO TERMINAL PATH
```

An unresolved candidate should not be labeled more expensive based solely on a placeholder penalty.

If not all competing actions are resolved or safely bounded, report:

`BEST KNOWN POLICY — OPTIMALITY NOT YET PROVEN`

---

# 11. Introduce Bounded / Lazy Expansion Rather Than Blind Full Expansion

The eventual 1–4-mod optimizer cannot eagerly enumerate every state under every legal action indefinitely.

The current 5,000-state result demonstrates why.

The next architecture should support progressive expansion of only the candidate branches needed to establish the best policy.

A reasonable direction is:

1. obtain a feasible incumbent policy and an upper bound on its expected cost;
2. evaluate competing actions with admissible lower bounds;
3. expand unresolved successors only when that action could still beat the incumbent;
4. stop expanding a candidate once its lower bound is already >= the incumbent upper bound;
5. never prune merely because a heuristic says the action looks bad.

Equivalent branch-and-bound / bounded stochastic-shortest-path approaches are acceptable.

Correctness comes before aggressive pruning.

Do not collapse states unless the existing strict transition-equivalence contract proves the collapse safe.

---

# 12. Fix Properness Before Calling the Policy Optimal

A policy used for crafting must eventually reach a target with probability 1, or explicitly contain a restart/reacquisition path that does so.

For the current generic search, report a policy as proven only when:

- all on-policy successors are resolved;
- no on-policy nonterminal dead ends exist;
- terminal absorption is numerically ~1;
- any cycles are proper/recurrent toward terminal states;
- no unresolved sink mass exists.

Until then:

`GLOBAL OPTIMALITY: NOT YET PROVEN`

must remain.

---

# 13. Fix Expected-Visit Convergence / Cost Reconciliation

Current diagnostics:

```text
Expected-visit solver converged: NO
Iterations:                     300
Residual:                       ~9.39e-5
Expected action cost sum:       5.991c
Reported downstream EV:         6.050c
Difference:                     0.0585c
Status:                         FLAGGED
```

The diagnostic correctly exposes the mismatch.

Now fix it before using expected currency counts as production results.

The expected state-occupancy system is solving a linear fixed point of the form:

```text
visits = initialMass + P_policy^T * visits
```

Possible approaches:

- more appropriate convergent Gauss-Seidel iteration;
- sparse linear-system solution;
- improved convergence tolerance/iteration strategy;
- SCC-aware policy evaluation.

Do not merely increase iteration count without measuring convergence behavior.

After graph/policy completeness is established, require:

- occupancy solver converged;
- expected action-cost sum reconciles with Bellman EV within a tight numerical tolerance.

Suggested target:

```text
absolute difference <= 1e-3 chaos
```

or a justified equivalent numerical threshold.

---

# 14. Preserve the Good Price-Provenance Changes

The latest pass fixed the dangerous unknown-currency behavior.

Current diagnostic correctly shows:

```text
unknown currency
-> source: unavailable
-> confidence: unavailable
-> cost: 0c
```

Preserve this.

Research defaults should remain distinguishable from user/market supplied prices.

However, add an explicit search diagnostic proving:

```text
allowResearchFallbackPrices = false
```

actually excludes actions whose only price source is `research-default`.

Then run the same diagnostic with explicit user/market prices and prove the actions become available.

This matters for the eventual frontend.

---

# 15. Craft A and Craft C Remain Healthy Regression Fixtures

Do not broadly rewrite their current mature policy implementation during this pass.

## Craft A

Current status remains:

- analytical-vs-MC difference: **1.16%**
- missing policy states: **0**
- fallback actions: **0**

Keep it validated for current implemented mechanics.

## Craft C

Current status remains:

- analytical-vs-MC difference: **3.65%**
- completed trials: **1,999 / 2,000**
- timeouts: **1**
- missing policy states: **0**
- fallback actions: **0**

Keep it provisionally validated.

Do not tune either craft to individual Monte Carlo seeds.

---

# 16. Do Not Add More Ordinary Mechanics Yet

Do **not** add the next mechanics in this pass:

- Scour
- restart/reacquire
- shared Exalt migration
- generic Fracturing

First close the two current correctness gaps:

1. external parity must actually calculate mechanics and correctly classify the Harvest mismatch;
2. generic-search completeness/properness/reconciliation must become trustworthy.

After those gates pass, resume expansion in this order:

```text
Scour/reset
-> restart/reacquire
-> shared Exalt
-> generic Fracturing Orb
```

---

# 17. Do Not Reintroduce Allflame

Allflame remains deferred.

Do not work on Intangibility mechanics in this pass.

---

# 18. Do Not Build the Frontend Yet

The project is close to a developer UI, but this pass is still backend correctness work.

The UI should begin after:

- generic search can distinguish proven vs unresolved policies correctly;
- Harvest parity is understood/corrected;
- the next core recovery mechanics are added.

The frontend must remain a thin consumer of a resolved optimizer result.

Do not put crafting logic in frontend code.

---

# 19. No Unit Tests

Do not add or expand unit tests.

Continue validation through:

- external fixed-policy parity diagnostics;
- runtime mechanics diagnostics;
- graph-completeness diagnostics;
- Bellman residuals;
- policy properness diagnostics;
- expected-cost reconciliation;
- Craft A/C end-to-end regressions;
- seeded Monte Carlo;
- compact output artifacts.

---

# Recommended Implementation Order

## Phase 1 — Repair external parity correctness

1. Replace absolute percentage-point parity threshold with sample-aware statistical classification.
2. Update the live cumulative external data to the latest snapshot.
3. Remove hardcoded Harvest/Annul/Exalt/Fracture engine probabilities from parity reporting.
4. Build exact shared-mechanics calculations for the stored benchmarks.
5. Build/finish the fixed-policy Craft of Exile runner.
6. Derive state-conditioned Annul and Exalt probabilities from the propagated prior-step state distribution.
7. Mark compound Harvest `INVESTIGATING` unless the newly derived engine probability genuinely agrees.

## Phase 2 — Root-cause Harvest

8. Calculate actual engine T1 ES-only probability from fractured Int.
9. Compare to external 8.599% fixture.
10. Calculate actual engine ES + 35 compound probability.
11. Compare to external 0.122529% fixture.
12. Print Harvest affix-count and prefix/suffix distribution.
13. Audit current 50/50 additional-affix assumption and other Harvest generation rules.
14. Correct mechanics only when a specific discrepancy is identified.
15. Rerun Craft A/C after any Harvest mechanics change.

## Phase 3 — Make generic-search proof diagnostics trustworthy

16. Add state expansion attribution by originating action.
17. Replace the invalid global missing-probability-mass metric.
18. Compute selected-policy reachability from the actual starting state.
19. Track unresolved selected-policy probability explicitly.
20. Stop treating unexpanded successors as a finite 150000c proof of dominance.
21. Mark unresolved candidate Q-values as unresolved or bounded.
22. Introduce lazy/bounded expansion so off-policy action branches do not require blind full enumeration.
23. Fix expected-visit convergence and EV reconciliation.
24. Only call a policy proven optimal when all relevant competitor bounds and selected-policy properness gates pass.

## Phase 4 — Regression gate

25. Rerun clean-base T1 Int search.
26. Rerun Craft A.
27. Rerun Craft C.
28. Regenerate output artifacts.
29. Decide whether the engine is ready for Scour/restart expansion.

---

# Required Reporting After This Pass

When implementation is complete, report:

## External parity

- latest external observations used;
- exact engine-derived analytical probability for T1 Int Alteration;
- exact engine-derived analytical probability for desired Fracture;
- exact engine-derived T1 ES-only Harvest probability;
- exact engine-derived ES + 35 compound Harvest probability;
- exact state-conditioned Annul pass probability;
- exact state-conditioned final Exalt probability;
- internal seeded Monte Carlo for each;
- external confidence intervals;
- parity classification for each;
- identified Harvest root cause, if found.

## Generic search

- total expanded canonical states;
- whether hard cap was reached;
- queued unique states;
- state generation counts by action;
- unresolved actions/edges;
- on-policy reachable state count;
- on-policy unresolved probability mass;
- terminal absorption/properness status;
- Bellman iterations and residual;
- expected-visit iterations and residual;
- expected-action-cost sum;
- Bellman expected cost;
- reconciliation difference;
- whether optimality is `PROVEN`, `BEST KNOWN`, or `UNRESOLVED`.

## Regression

- Craft A analytical-vs-MC result;
- Craft A missing/fallback states;
- Craft C analytical-vs-MC result;
- Craft C completion/timeouts;
- any changes in expected Craft A/C cost caused by a verified Harvest mechanics correction.

---

# Completion Gate Before Adding Scour / Restart

Proceed to Scour/restart only when all of the following are true:

```text
[ ] External parity uses engine-derived mechanics, not copied probabilities
[ ] Compound Harvest is correctly classified
[ ] Harvest mismatch is understood or explicitly isolated
[ ] Selected-policy reachable graph has no unresolved transitions
[ ] Candidate actions are not declared dominated because of a fixed truncation penalty
[ ] Policy properness / absorption result is trustworthy
[ ] Expected visits converge
[ ] Expected action-cost sum reconciles with Bellman EV
[ ] Craft A regression remains healthy
[ ] Craft C regression remains healthy
```

Then resume:

```text
Scour
-> restart/reacquire
-> shared Exalt
-> generic Fracturing
-> Craft B clean-base discovery fixture
-> developer UI phase
```

---

# Current Overall Assessment

The latest implementation is moving in the correct direction.

The most valuable outcome of the latest pass is not that the clean-base diagnostic passed — it now correctly **fails** its full verification gate and tells us why.

That is good engineering progress.

At the same time, the external Craft of Exile run has now become statistically strong enough to identify the first convincing shared-mechanics discrepancy: the compound Harvest result.

The next phase should therefore focus on **truthfulness of validation**:

- parity results must be computed rather than inserted;
- statistically significant mismatches must not be labeled aligned;
- truncated graph actions must not be treated as proven expensive;
- absorption and expected-cost accounting must not claim more certainty than the expanded graph supports.

Once those are fixed, the project will be in a much stronger position to add the remaining recovery mechanics and move toward the developer UI.
