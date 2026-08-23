# Post Value-Iteration and External-Parity Review

## Review Scope

This review covers the implementation currently on `main` at:

- implementation commit: `aa6daf11ec6803c46b560ddc76d173ac64ee39c4`
- prior findings source: `docs/crafting-engine/POST_GENERIC_SEARCH_INTEGRATION_REVIEW.md`
- current generated outputs, including `output.txt`, `output-craft-a-review.txt`, and `output-craft-c-review.txt`
- the latest user-provided Craft of Exile cumulative simulation snapshot

The previous pass made an important architectural improvement: the generic search is no longer a hand-written `cost / p` Alteration shortcut. It now builds a canonical reachable-state graph, calculates per-action Q-values, and performs stochastic shortest-path value iteration over registered mechanics that expose executable transitions.

That is the correct direction for the eventual product goal:

```text
User selects base + ilvl + passives + 1-4 target mods
    ->
automatic physical starting states
    ->
legal mechanically modeled actions
    ->
state-transition graph
    ->
minimum-expected-cost policy
    ->
route/economics/risk report
```

However, the current implementation should **not yet be described as an exact/global Bellman optimum**, because the diagnostic reveals that the reachable graph is hitting its hard state cap exactly. Search-completeness and convergence evidence are now the highest-priority issues.

---

# Executive Findings

## What improved materially

1. `GenericSearchEngine` now evaluates competing action Q-values rather than always scripting Alteration.
2. The clean-base T1 Intelligence diagnostic demonstrates real state-dependent action competition.
3. Augmentation correctly beats Alteration on at least some one-prefix magic miss states under the current modeled mechanics/prices.
4. The optimizer now reports representative per-state candidate Q-values.
5. Transmutation and Augmentation use their own price keys instead of deriving cost from Alteration.
6. Price provenance has begun to distinguish custom vs research-default sources.
7. Craft A remains stable at 1.16% analytical-vs-Monte-Carlo difference.
8. Craft C remains provisionally stable at 3.65% analytical-vs-Monte-Carlo difference.
9. The latest external Craft of Exile run now gives strong compound-Harvest and Annul evidence, and the final Exalt sample has matured enough to be directionally useful.

## Highest-priority concerns

1. The generic state graph reports **exactly 5,000 reachable canonical states**, which is also the default hard `maxStates` cap.
2. Any transition whose successor is outside the truncated graph is evaluated using the dead-end penalty, so the current Q-values may be cap-dependent.
3. The result currently says the stochastic shortest-path solver derived the optimal policy without reporting whether graph construction was truncated or value iteration actually converged.
4. Price provenance is still semantically inconsistent: research-default rates are labeled with `source: research-default` but `confidence: known`, so production fallback filtering does not actually exclude them.
5. `PriceBook.getRate()` / `toChaos()` can still treat a completely unknown currency as `1c` through the legacy fallback path.
6. The generated “crafting plan” mixes immediate action cost with continuation EV and reads like a deterministic sequence even though the Bellman result is a branching policy.
7. Expected currency reporting should explicitly include every selected action type, especially Augmentation, and reconcile back to total expected crafting cost.
8. The latest Craft of Exile cumulative observations should replace the older interim cumulative snapshot rather than be appended as an independent sample.

---

# 1. Generic Search Is Now a Real Policy Solver, But Search Completeness Is Not Yet Proven

The current implementation builds a canonical state graph, aggregates successor states by canonical key, and solves:

```text
Q(s,a) = immediate_cost(a) + sum P(s'|s,a) * V(s')
V(s)   = min_a Q(s,a)
```

This is the correct mathematical shape.

The clean-base diagnostic now shows meaningful competition such as:

```text
Magic one-prefix miss state:

Augmentation Q ~= 6.04c
Alteration Q   ~= 6.13c
Regal Q        ~= 148339c

Selected: Augmentation
```

This is exactly the type of state-dependent decision the final optimizer needs.

### Important qualification

The same output reports:

```text
Reachable Canonical States Discovered: 5000
```

and the implementation default is:

```text
maxStates = 5000
```

Therefore the graph appears to be **truncated at the configured cap**.

Until proven otherwise, do not label this result:

```text
exact minimum expected cost
optimal policy
fully solved stochastic shortest path
```

Use a status such as:

```text
SEARCH MODEL: VALUE ITERATION IMPLEMENTED
GRAPH COMPLETENESS: TRUNCATED / NOT YET PROVEN
POLICY OPTIMALITY OVER FULL REACHABLE GRAPH: NOT YET PROVEN
```

---

# 2. Add Explicit Graph-Completeness Diagnostics Before Expanding Mechanics

This is the highest-priority next change.

`buildGraph(...)` should return graph-build metadata, not only the node map.

Suggested shape:

```ts
interface GraphBuildResult {
    nodes: Map<string, CanonicalGraphNode>;
    maxStates: number;
    hitStateLimit: boolean;
    queuedButUnexpandedStates: number;
    transitionsToUnexpandedStates: number;
    transitionProbabilityMassToUnexpandedStates: number;
    terminalStatesFound: number;
}
```

Equivalent design is fine.

The report must make it impossible to mistake a capped graph for a complete graph.

### Required behavior

If `hitStateLimit === true`:

- do not claim exact optimality;
- mark the search result incomplete;
- report how many states remained queued/unexpanded;
- report whether selected-policy transitions depend on missing successor values;
- do not silently convert missing successors into a huge dead-end value and then call the resulting action choice optimal.

The current `DEAD_END_PENALTY` is acceptable as a temporary safety mechanism, but missing nodes caused by graph truncation are **not true dead ends**.

Those two cases must be distinguished.

---

# 3. Add Value-Iteration Convergence Diagnostics

The current solver runs up to a fixed number of iterations and stops when `maxDelta < epsilon`, but the output does not make convergence status visible.

Return and print:

```text
Value Iteration Iterations:
Converged: YES / NO
Final Max Bellman Residual / Delta:
Configured Epsilon:
Max Iterations:
```

If the solver reaches `maxIterations` without satisfying epsilon:

```text
CONVERGENCE: NOT PROVEN
```

and do not describe the policy as exact.

Because this is an undiscounted stochastic shortest-path problem with cycles, convergence evidence matters.

Later, policy iteration or solving the linear system for a fixed policy may be useful, but do not change algorithms merely for sophistication. First make the current value-iteration behavior observable and correct.

---

# 4. Add Policy Properness / Reachability Diagnostics

A positive-cost crafting policy can still be invalid if it can enter a recurrent non-terminal class and never reach the target with probability 1.

For the selected policy, report at least:

```text
Target reachability from start: YES / NO / UNKNOWN
Selected-policy terminal absorption probability: ~X%
States with no modeled legal action:
States with selected transition to unresolved/unexpanded successor:
```

For the simple T1 Intelligence fixture, the selected policy should be a proper policy with eventual target absorption probability approaching 1.

Do not use `isTargetSatisfied: true` to mean merely “the search found some target states.” Distinguish:

- starting item already satisfies target;
- target is reachable;
- selected policy is proper/absorbing;
- graph is complete;
- Bellman values converged.

These are different concepts.

---

# 5. Correct the Price-Provenance Semantics

The new price source field is a good start, but the current implementation has this semantic conflict:

```text
source = research-default
confidence = known
```

That means:

```text
allowResearchFallbackPrices = false
```

will still admit default research prices, because generic search filters on `confidence`.

That defeats the intended production policy.

### Required model

Prefer something structurally unambiguous, for example:

```ts
type PriceSource =
  | 'user-supplied'
  | 'market-feed'
  | 'research-default'
  | 'unavailable';

type PriceConfidence =
  | 'known'
  | 'research-fallback'
  | 'unavailable';
```

Then:

```text
User/market supplied -> known
Research default     -> research-fallback
Missing              -> unavailable
```

Do not label a research default as `known` merely because the value is present in `DEFAULT_CURRENCY_RATES`.

### Production behavior

When fallback prices are disabled:

- research-default actions must not participate in a definitive cheapest-route calculation;
- or the entire result must be labeled economics-incomplete.

Research mode may continue to allow them.

---

# 6. Remove the Legacy Unknown-Currency = 1c Behavior From Generic Economics

`PriceBook.getRate()` still falls back to `1` when the currency key is completely unknown, and `toChaos()` can still route through that behavior.

That is unsafe for an automatic optimizer.

A typo or unsupported currency must not silently become a valid 1-chaos price.

Move generic search and newly migrated mechanics entirely onto explicit APIs such as:

```text
getKnownRate(...)
evaluateRate(...)
```

Then either deprecate the permissive fallback path or restrict it to old compatibility code that cannot affect production route ranking.

Add a runtime diagnostic:

```text
Unknown currency key -> UNAVAILABLE, never 1c
```

No unit test is required.

---

# 7. Keep Direct Currency Keys for Transmutation / Augmentation / Regal

The previous bug where Transmutation and Augmentation were priced as a fraction of Alteration has been corrected.

Preserve this.

Each mechanic should use its own price key:

```text
transmutation
augmentation
alteration
regal
```

Do not derive one currency's cost from another unless that conversion itself is an explicit market model.

---

# 8. Fix Generic Policy Reporting: It Is a Branching Policy, Not a Four-Step Recipe

The current report says:

```text
DISCOVERED CRAFTING PLAN (4 steps)
```

and then prints:

```text
Acquire Clean Base
Orb of Transmutation
Orb of Augmentation
Orb of Alteration
```

But the Bellman result is state-dependent:

- some Transmutation outcomes immediately hit the target;
- some miss with a one-prefix item where Augmentation is preferred;
- other misses should Alteration;
- different states can choose different actions.

Therefore this should be reported as something like:

```text
OPTIMAL POLICY SUMMARY
```

with representative decisions:

```text
IF normal -> Transmutation
IF one-prefix magic miss -> Augmentation
IF two-affix magic miss -> Alteration
...
```

Do not imply that every successful item executes all displayed lines sequentially.

---

# 9. Separate Immediate Action Cost From Continuation EV in the Report

The Q-value audit correctly distinguishes:

```text
Immediate cost
Expected continuation
Q(s,a)
```

But the stepwise report currently renders a Transmutation policy decision as roughly `+6.0c`, even though the actual Transmutation itself costs about `0.03c` and ~6c is the entire continuation value from that state.

Fix the policy report so each state decision prints:

```text
Action immediate cost: 0.03c
Continuation EV after action: 6.02c
Total Q-value: 6.05c
```

Never label continuation EV as the raw cost of the orb/action.

---

# 10. Reconcile Expected Currency Counts Back to Expected Cost

The policy now selects Augmentation on some one-prefix miss states, but the compact economics section prominently prints only Transmutation and Alteration counts.

Report all action usage with non-zero expected visits, including:

```text
Transmutation
Alteration
Augmentation
Regal
Annul
...future actions
```

Then add a reconciliation check:

```text
sum(expected_action_count * immediate_action_cost)
~= reported downstream expected crafting EV
```

Allow for acquisition costs to be separate.

If the values do not reconcile within a small numerical tolerance, flag the report.

Also report whether the expected-visit fixed point converged and how many occupancy iterations were required.

---

# 11. Do Not Compare the 48.84 Expected Alterations Directly to the Craft of Exile Alteration-Spam Ratio

The current Bellman policy uses Augmentation on some one-prefix magic misses.

Therefore:

```text
Expected Alterations under optimal policy ~= 48.84
```

is **not supposed to equal** the external fixed-policy Alteration-spam benchmark of roughly 1 / 65-70.

The correct parity comparison remains:

```text
One Alteration roll -> probability T1 Int appears
```

Current internal/external evidence:

```text
Craft of Exile large combined benchmark: ~1.521%
Engine analytical:                   ~1.438%
Engine seeded MC:                    ~1.475%
```

This remains encouraging.

The optimizer is then free to use Augmentation to reduce expected Alteration consumption.

---

# 12. Latest Craft of Exile Cumulative Simulation Snapshot

The newly supplied screenshot is a later cumulative snapshot of the same long-running fixed-policy simulation. It should replace the older interim cumulative values in the external-parity fixture rather than be added as a separate independent run.

## Current cumulative snapshot

### Step 1 — Alteration -> T1 Intelligence

```text
6,767 actions
96 passes
1.4186%
~1 / 70.49
```

This smaller in-chain observation is consistent with both the previous large external benchmark and the engine's ~1.438% analytical result.

### Step 4 — Fracturing Orb -> desired T1 Intelligence fracture

```text
96 attempts
21 successes
21.875%
~1 / 4.57
```

This sample is still small and is statistically compatible with the expected 25% mechanic.

Keep the separate 1,000-attempt / 250-success benchmark as the stronger fracture reference.

### Step 5 — Harvest Reforge Defence compound success

Current cumulative result:

```text
1,452,952 attempts
1,764 passes
0.1214%
~1 / 823.7
```

Approximate 95% interval:

```text
0.1157% - 0.1271%
```

This is now an extremely strong external empirical benchmark.

It should replace the previous cumulative snapshot:

```text
809 / 695,513
```

for this same live simulation.

### Step 6 — Annul pass after successful compound Harvest state

Current cumulative result:

```text
2,236 attempts
492 passes
22.0036%
~1 / 4.54
```

Approximate 95% interval:

```text
20.29% - 23.72%
```

This is now a useful external benchmark for the combined Harvest-state-distribution + Annul-preservation behavior.

Replace the older cumulative snapshot:

```text
227 / 1,031
```

for this same run.

### Step 7 — Final Exalt: +4 All Attributes OR 3% Attack Speed

Current cumulative result:

```text
492 attempts
20 successes
4.065%
~1 / 24.6
```

Approximate 95% interval:

```text
2.32% - 5.81%
```

The current engine pool audit predicts approximately:

```text
(300 + 250) / 14,450
= 3.806%
~1 / 26.3
```

The external observed 4.065% is now very close to the engine expectation and comfortably statistically compatible.

This is no longer showing evidence of an Exalt mismatch.

Do **not** tune Exalt probability to the observed 4.065%.

Use the engine's eligible weighted pool mechanically and treat the external result as supportive parity evidence.

---

# 13. Update the External-Parity Fixture With the Latest Cumulative Snapshot

Update the same live benchmark records rather than appending duplicates.

Recommended latest observations:

```text
compound_harvest_frac_int_to_es35:
  attempts: 1,452,952
  successes: 1,764

annul_after_compound_harvest:
  attempts: 2,236
  successes: 492

final_exalt_attr_or_attack_speed:
  attempts: 492
  successes: 20
```

Keep notes clearly indicating that these are cumulative snapshots from the same Craft of Exile run.

If the simulation continues and a later snapshot arrives, replace these values again.

Do not sum cumulative snapshots together.

---

# 14. Build the Exact Fixed-Policy Craft of Exile Parity Runner Next

The external data is now mature enough that we should stop validating only isolated observations and implement a fixed-policy internal benchmark matching the Craft of Exile sequence.

This runner must be separate from the optimizer.

Its purpose is:

> Given the exact same recipe/policy, do our mechanics reproduce approximately the same per-step conditional probabilities and action counts?

It must **not** be used as the optimizer's strategy source.

Model the fixed policy approximately as:

```text
1. Magic base: Alteration until T1 Intelligence
2. Regal
3. Exalt/fill as required for a four-mod rare
4. Fracturing Orb; restart if T1 Int is not fractured
5. Continue from fractured T1 Int base
6. Harvest Reforge Defence until the exact compound Step-5 success condition
7. Annul; if target state is no longer valid, return according to the fixed recipe
8. Exalt final suffix; success if +4 All Attributes OR 3% Attack Speed
```

Use the exact current benchmark success conditions from the Craft of Exile recipe, not Craft A's separate sale-outcome target definition.

### Required parity output

```text
Step                          Craft of Exile   Analytical   Internal MC   Difference
Alteration -> T1 Int          ...              ...          ...           ...
Fracture desired Int          ...              ...          ...           ...
Compound Harvest success      0.1214%          ...          ...           ...
Annul pass                    22.0036%          ...          ...           ...
Final Exalt Attr/AS           4.065%           ...          ...           ...
```

For each line report sample size and statistical uncertainty.

If a mismatch appears, investigate mechanics/state definitions before tuning constants.

---

# 15. Harvest Is Now the Highest-Value External Mechanics Check

The external compound-Harvest observation has over 1.45 million attempts and is far more statistically precise than the Exalt or fracture samples.

Therefore the first full parity investigation should focus on whether our Harvest model reproduces:

```text
Fractured T1 Int
-> Harvest Reforge Defence
-> T1 ES + 35% Effect success state

Observed ~= 0.1214%
```

This is especially important because our analytical and internal MC Harvest systems currently share assumptions such as the additional-affix distribution.

Internal analytical/MC agreement cannot validate a shared wrong assumption.

Do not change the 50/50 additional-affix model unless the fixed-policy parity runner or authoritative mechanics evidence identifies it as the cause of a mismatch.

---

# 16. Craft A and Craft C Remain Healthy Regression Fixtures

## Craft A

Current output remains:

```text
Analytical vs Monte Carlo total difference: 1.16%
Missing policy states: 0
Fallback actions: 0
```

Do not regress this while modifying generic clean-base search.

## Craft C

Current output remains:

```text
Analytical vs Monte Carlo total difference: 3.65%
Completed: 1,999 / 2,000
Timed out: 1
Missing policy states: 0
Fallback actions: 0
```

Keep it provisional and heavy-tail-aware.

The generic search changes should not silently alter these mature fractured-route fixtures unless a deliberate shared-mechanics migration affects them.

---

# 17. Do Not Expand to Scour / Restart / Fracturing Until Generic Search Status Is Honest

The previous roadmap correctly identified Scour, restart, shared Exalt, and Fracturing as the next ordinary mechanics.

But before increasing the state/action frontier, fix:

1. graph truncation visibility;
2. value-iteration convergence visibility;
3. policy properness/reachability;
4. expected-visit convergence;
5. price fallback enforcement;
6. policy reporting.

Adding more actions before these are fixed will make the state graph larger and the current 5,000-state truncation more severe.

Once those diagnostics are trustworthy, proceed incrementally:

```text
Scour/reset
-> restart/reacquire
-> shared Exalt
-> generic Fracturing Orb
```

Rerun the clean T1 Int fixture and Craft A/C after each structural change.

---

# 18. The Current 5,000-State Explosion Needs Controlled State-Space Work

Do not simply raise `maxStates` indefinitely.

First measure why the simple one-mod target produces at least 5,000 canonical states.

Report state counts grouped by:

```text
rarity
prefix count
suffix count
target present / absent
selected action
```

Then inspect whether mechanically equivalent non-target states can be safely aggregated further under the existing strict state-equivalence contract.

Any new collapse must preserve:

- full relevant exclusion groups;
- target roll pass/fail information;
- legality of every modeled action;
- transition distributions into equivalent successors.

Correctness remains more important than search speed.

A simple T1 Intelligence target is the ideal fixture for measuring state-space reduction safely.

---

# 19. Consider Target-Relevance Abstraction Only With a Proof of Transition Equivalence

Many junk prefix identities may be irrelevant for a target that only needs a suffix, but do not assume that.

Two junk prefixes can only collapse if they have identical effects on:

```text
eligible suffix/prefix pools
mod-group blocking
legal actions
transition probabilities
future target satisfaction
```

If full mod-group identity differs, keep them separate unless a mechanically proven higher-level equivalence class exists.

The current canonical-key safety work should not be undone merely to get below the 5,000-state cap.

---

# 20. Global Optimality and Game Fidelity Labels

Continue using:

```text
GAME-MECHANICS FIDELITY: PARTIAL
GLOBAL OPTIMALITY: NOT YET PROVEN
```

For the new generic search, add separate status dimensions such as:

```text
SEARCH GRAPH COMPLETE: YES / NO
VALUE SOLVER CONVERGED: YES / NO
SELECTED POLICY PROPER: YES / NO / UNKNOWN
PRICE COVERAGE COMPLETE: YES / NO
```

This avoids conflating:

- algorithm implementation;
- search-space completeness;
- numerical convergence;
- price completeness;
- real-game mechanics correctness;
- global action-frontier completeness.

---

# 21. No Unit Tests

Do not add or expand unit tests.

Continue validating with:

- runtime graph-completeness diagnostics;
- value-iteration residual diagnostics;
- expected-visit/currency reconciliation diagnostics;
- fixed-policy Craft of Exile parity runner;
- shared-mechanic seeded diagnostics;
- clean-base T1 Intelligence search fixture;
- Craft A/C regressions;
- multi-seed Monte Carlo.

---

# Recommended Next Implementation Order

1. Add graph-build completeness metadata and hard-cap detection.
2. Stop claiming optimality when the graph is truncated.
3. Add value-iteration iteration/residual/convergence reporting.
4. Add selected-policy target absorption/properness diagnostics.
5. Add expected-visit convergence diagnostics.
6. Fix research-default price confidence so fallback filtering actually works.
7. Remove unknown-currency `1c` semantics from generic search paths.
8. Fix policy reporting to distinguish immediate cost, continuation EV, and Q-value.
9. Report all expected action counts and reconcile them to expected crafting EV.
10. Update the cumulative Craft of Exile parity observations to the latest snapshot.
11. Build the exact fixed-policy Craft of Exile parity runner.
12. Compare compound Harvest, Annul, and Exalt mechanics against the external run.
13. Investigate any statistically meaningful parity mismatch without tuning constants.
14. Measure the source of the 5,000-state graph explosion.
15. Add only mechanically safe state-space reductions if needed.
16. Rerun clean T1 Int, Craft A, and Craft C.
17. Only then add Scour/reset.
18. Then restart/reacquire semantics.
19. Then shared Exalt.
20. Then generic Fracturing Orb.
21. Bring Craft B back only after these ordinary clean-base transitions are truly searchable.
22. Keep Allflame and frontend deferred.

---

# Validation Gates for the Next Pass

## Generic search correctness

Require the report to state explicitly:

```text
Graph hit state cap: YES/NO
Unexpanded queued states:
Missing-successor transition mass:
Value iteration converged: YES/NO
Final Bellman residual:
Selected-policy terminal absorption probability:
Expected-visit calculation converged: YES/NO
Price coverage complete: YES/NO
```

Do not call the result optimal unless the relevant correctness gates pass.

## Clean-base T1 Int fixture

Must continue to show:

- Transmutation considered from normal;
- state-dependent Alteration/Augmentation competition;
- target derived from pool weights, not external probability constants;
- external one-roll Alteration parity reported separately;
- all nonzero expected currencies shown;
- expected-currency cost reconciliation.

## Craft A

Preserve:

- analytical/MC total near current validated range;
- zero missing policy states;
- zero fallbacks;
- current terminal behavior unless a verified mechanics correction changes it.

## Craft C

Preserve:

- provisional analytical/MC agreement;
- pooled action differences within existing thresholds;
- completion >=99%;
- explicit censoring;
- zero missing policy states;
- zero fallbacks.

## External parity

Use latest cumulative live-run snapshot:

```text
Harvest compound: 1764 / 1,452,952 ~= 0.1214%
Annul pass:         492 / 2,236      ~= 22.0036%
Final Exalt:         20 / 492        ~= 4.0650%
```

Do not sum these with older cumulative snapshots from the same run.

---

# Completion Report Required From the Implementing LLM

When this pass is complete, commit code and regenerated diagnostics to `main` and report:

1. commit SHA;
2. files changed;
3. whether the clean-base graph still hits `maxStates`;
4. number of reachable states and unexpanded queued states;
5. value-iteration iteration count and final residual;
6. whether the selected policy is proper/absorbing;
7. expected-visit convergence result;
8. complete expected currency usage and EV reconciliation;
9. price-provenance/fallback behavior;
10. updated external parity fixture values;
11. fixed-policy Craft of Exile parity results for Harvest/Annul/Exalt;
12. whether any mechanics mismatch was found;
13. Craft A regression result;
14. Craft C regression result;
15. remaining generic mechanics not yet searchable;
16. whether it is now safe to proceed to Scour/restart.

---

# Bottom Line

The latest implementation is a meaningful step forward: the engine now has real state-dependent Q-value competition and an actual value-iteration framework.

The next phase should **not** broaden the action set immediately.

First prove that the generic solver is solving the graph it thinks it is solving.

The current `5000 / maxStates=5000` result means graph completeness is not yet established. Fix that status/diagnostic problem, correct price provenance, and use the now-large Craft of Exile dataset to build a fixed-policy external parity runner.

After those gates are clean, Scour/restart/shared Exalt/Fracturing can be added with much greater confidence.