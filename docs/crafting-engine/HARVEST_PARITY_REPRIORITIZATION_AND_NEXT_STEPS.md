# Harvest Parity Reprioritization and Next Steps

## Purpose

This document supersedes the Harvest-severity framing in `POST_GRAPH_DIAGNOSTICS_AND_HARVEST_PARITY_REVIEW.md`.

The latest Craft of Exile benchmark does show a statistically real difference between the engine's current compound Harvest probability and the external simulator. However, the absolute mechanics agreement is still reasonably close for a multi-affix Harvest event, and this discrepancy should **not** block progress on the generic route-search architecture.

The next implementation pass should therefore prioritize **generic solver correctness and search completeness first**, while keeping Harvest fidelity as a tracked, explicitly labeled approximation to investigate in parallel.

Do not interpret this document as permission to hardcode Craft of Exile probabilities into the engine.

---

# 1. Current External Parity Picture

The external Craft of Exile data is broadly encouraging.

## Alteration -> T1 Intelligence

Primary permanent benchmark:

- Attempts: 209,862
- Successes: 3,193
- Observed probability: ~1.5215%
- Approximate ratio: 1 / 65.7

Current engine analytical probability:

- ~1.4377%
- Approximate ratio: 1 / 69.6

Assessment:

**VERY CLOSE / ACCEPTABLE EXTERNAL PARITY**

Do not tune Alteration mechanics to the external number.

---

## Fracturing Orb on a 4-mod Rare

Primary permanent benchmark:

- Attempts: 1,000
- Desired fractures: 250
- Observed probability: 25.000%

Expected mechanic:

- 25.000%

Assessment:

**ALIGNED**

---

## Compound Harvest Reforge Defence

Starting condition:

- Fractured T1 Intelligence

Success condition:

- T1 Maximum Energy Shield
- AND 35% Increased Effect

Latest cumulative Craft of Exile snapshot:

- Attempts: 2,601,014
- Successes: 3,187
- Observed probability: ~0.122529%
- Approximate ratio: 1 / 816.1

Current engine estimate:

- ~0.1460%
- Approximate ratio: 1 / 684.9

Difference:

- Absolute difference: ~0.0235 percentage points
- Relative difference: engine is roughly 19% more optimistic

Assessment:

**CLOSE, WITH A SYSTEMATIC OPTIMISTIC BIAS**

This is statistically real because the external sample is very large, but it is not evidence that the Harvest implementation is fundamentally broken.

The engine is in the correct order of magnitude and fairly close for a compound multi-affix event.

This should be tracked as:

`EXTERNAL HARVEST FIDELITY: CLOSE / APPROXIMATE — ENGINE ~19% OPTIMISTIC ON THIS COMPOUND EVENT`

Do **not** treat this as a hard blocker for Scour/restart/Fracturing work once the generic solver itself is trustworthy.

---

## Post-Harvest Annul

Latest cumulative snapshot:

- Attempts: 4,019
- Passes: 863
- Observed probability: ~21.473%
- Approximate ratio: 1 / 4.657

Current engine neighborhood:

- ~22%

Assessment:

**VERY CLOSE / ALIGNED**

---

## Final Exalt: +4 All Attributes OR 3% Attack Speed

Latest cumulative snapshot:

- Attempts: 863
- Successes: 31
- Observed probability: ~3.592%
- Approximate ratio: 1 / 27.84

Current pool-derived engine expectation:

- Desired weight: 300 + 250 = 550
- Eligible suffix weight after T1 Int: 14,450
- Probability: 550 / 14,450 = ~3.8062%
- Approximate ratio: 1 / 26.27

Assessment:

**ALIGNED**

Do not modify Exalt weighting based on the external data.

---

# 2. Revised Interpretation of the Harvest Difference

The prior review correctly identified that the Harvest difference is statistically significant, but overstated its architectural severity.

The correct interpretation is:

- the difference is real;
- the engine is somewhat optimistic;
- the likely cause is an approximation in compound outcome generation;
- the discrepancy can materially affect expected repeated-Harvest cost;
- but the overall mechanics model is already in a useful neighborhood;
- it should not prevent the generic solver architecture from advancing.

For a geometric event:

- engine: about 685 attempts per success;
- external: about 816 attempts per success.

That is meaningful economically, but not a catastrophic mechanics failure.

Harvest should remain labeled approximate until the cause is understood.

---

# 3. Two Separate Quality Gates

From this point forward, distinguish two independent validation categories.

## A. Solver / Search Correctness

This category **can block architecture expansion**.

Examples:

- graph truncation;
- unresolved on-policy transitions;
- false dominance caused by placeholder penalties;
- Bellman non-convergence;
- improper/non-absorbing selected policy;
- expected-visit non-convergence;
- expected-action-cost not reconciling with Bellman EV;
- incorrect canonical-state equivalence;
- price provenance allowing invalid routes.

These must be trustworthy before significantly expanding the action frontier.

## B. Game-Mechanics Fidelity

This category may remain explicitly approximate while development continues, provided the approximation is visible and understood.

Examples:

- Harvest compound-affix distribution;
- self-fracture preparation approximations;
- exact magic-affix count distribution;
- incomplete market-price coverage;
- future seasonal mechanics.

Do not confuse internal solver correctness with real-game mechanics fidelity.

---

# 4. Highest Priority: Fix Generic Search Completeness

The latest T1 Intelligence clean-base diagnostic reports:

- expanded states: 5,000;
- max state cap: 5,000;
- state cap hit: YES;
- queued but unexpanded states: 41,505;
- terminal states found: 121;
- value iteration converged over the truncated graph;
- selected policy properness reported NO;
- expected-visit solver not converged;
- expected-action-cost reconciliation still flagged.

This is now more important than narrowing Harvest from ~1/685 to ~1/816.

A Bellman solution can only be called exact for the graph actually solved. If important competing actions lead into unexpanded states, a converged value iteration on that truncated graph does not establish global optimality.

---

# 5. Next Solver Work

## 5.1 Build an on-policy reachable graph view

The full candidate graph may be huge.

Separate:

- full candidate graph;
- selected-policy reachable graph from the actual starting state.

Report:

- on-policy reachable states;
- terminal states;
- unresolved selected transitions;
- on-policy unresolved probability mass;
- dead-end probability;
- terminal absorption probability;
- unknown/unexpanded probability.

Do not report 100% terminal absorption while unresolved selected transitions still exist.

---

## 5.2 Do not use a finite placeholder penalty as proof of dominance

Unexpanded states currently receive a large finite penalty.

That can make an unresolved action appear obviously worse when its true continuation value is unknown.

Examples include huge Regal Q-values caused by unresolved successors.

Introduce explicit candidate status such as:

- COMPLETE
- UNRESOLVED
- IMPROPER

An unresolved action should not be declared dominated merely because a placeholder penalty made its Q-value huge.

Preferred future direction:

- maintain a known feasible incumbent upper bound;
- compute safe lower bounds for unresolved competitors;
- expand unresolved competitors while they can still beat the incumbent;
- prune only when mathematically justified.

A fully generic implementation can evolve toward lazy / bounded state expansion rather than indiscriminately enumerating every possible state.

---

## 5.3 Measure where state explosion comes from

For the one-mod T1 Int target, report state creation by action:

- Transmutation;
- Alteration;
- Augmentation;
- Regal;
- Annul;
- future actions.

Also report:

- unique successor states by action;
- selected-policy states by action;
- off-policy-only states by action;
- unresolved edges by action;
- terminal states reached by action.

The goal is to determine whether the huge graph is mechanically necessary or whether the generic search is exploring large obviously irrelevant rare-item subspaces.

Do not collapse states unless transition equivalence is proven.

---

## 5.4 Finish expected-visit / cost reconciliation

The expected-currency occupancy calculation should converge against the selected policy.

Target invariant:

`sum(expected action count * immediate action cost) ~= Bellman downstream EV`

The difference should be numerically tiny once the policy graph is complete enough.

Do not merely raise iteration limits without understanding the convergence behavior.

Potential approaches include:

- Gauss-Seidel iteration;
- SCC-aware evaluation;
- sparse linear solve for the fixed selected policy;
- another mathematically justified method.

---

# 6. Harvest Fidelity Work Should Continue, But It Is Not a Hard Blocker

Keep both Harvest benchmarks.

## Benchmark A: T1 ES only

Fractured T1 Int -> Harvest Reforge Defence -> T1 Maximum ES

External:

- 2,907 attempts;
- 250 successes;
- 8.599%;
- ~1 / 11.63.

## Benchmark B: T1 ES + 35% Effect

External:

- 2,601,014 attempts;
- 3,187 successes;
- ~0.122529%;
- ~1 / 816.1.

Use the actual engine mechanics to derive both probabilities.

Do not use benchmark-specific constants.

If ES-only is close but ES+35 remains optimistic, likely investigation areas include:

- additional-affix count distribution;
- affix-generation ordering;
- prefix-slot distribution;
- guaranteed Defence-mod behavior;
- 35% Effect eligibility after the guaranteed mod;
- current 50/50 one-extra/two-extra approximation;
- rare-item 3–6 modifier generation details.

However, once solver correctness gates pass, Harvest may remain:

`MECHANICS FIDELITY: APPROXIMATE / EXTERNALLY CLOSE`

while work proceeds to additional core actions.

---

# 7. External Parity Framework Requirements

Keep improving the parity framework so engine values are calculated rather than inserted.

For each benchmark, report:

- external attempts;
- external successes;
- external observed probability;
- external 95% confidence interval;
- analytical engine probability derived from mechanics;
- internal seeded Monte Carlo probability using the same mechanics;
- absolute difference;
- relative difference;
- whether the engine value lies inside the external CI;
- qualitative status.

Useful statuses:

- ALIGNED
- CLOSE / APPROXIMATE
- INVESTIGATING
- INSUFFICIENT EXTERNAL SAMPLE

Do not use one universal percentage-point threshold for all event probabilities.

Do not hardcode external benchmark probabilities into game mechanics.

---

# 8. When to Resume Action Expansion

The engine does **not** need perfect Harvest parity before moving forward.

Resume core-action expansion once these solver gates are met:

- selected-policy graph has no unresolved transitions, or unresolved probability is safely bounded and explicitly reported;
- no unresolved competitor is declared dominated solely from a placeholder penalty;
- Bellman solution converges;
- selected policy is proper / absorbing with trustworthy metrics;
- expected visits converge;
- expected action-cost reconciliation is tight;
- price confidence/fallback behavior is correct;
- Craft A regression remains healthy;
- Craft C regression remains healthy.

Then proceed in this order:

1. Scour/reset
2. Restart/reacquire
3. Shared Exalt transition migration
4. Generic Fracturing Orb
5. Revalidate Craft of Exile fixed policy
6. Bring Craft B back
7. Developer UI Phase 1

Harvest fidelity investigation can continue in parallel.

---

# 9. Scour / Restart Design Expectations

When solver gates pass, Scour and restart are especially important because they unlock real recovery loops.

## Scour

Must correctly:

- remove removable explicit modifiers;
- preserve fractured modifiers;
- produce the correct resulting rarity/state;
- respect any mechanics-specific restrictions.

Analytical and sampled transitions should use the same shared mechanic definition.

## Restart / Reacquire

Restart should be represented as a real transition back to an acquisition/start state with an explicit economic cost.

Do not encode restart only as a reporting instruction.

The solver needs to compare:

- continue current item;
- Scour current item;
- Annul current item;
- abandon/restart;

based on continuation EV.

---

# 10. Preserve Craft A / Craft C Regression Fixtures

## Craft A

Current known-good state remains approximately:

- analytical vs Monte Carlo total difference: 1.16%;
- missing policy states: 0;
- fallback actions: 0.

## Craft C

Current known-good state remains approximately:

- analytical vs Monte Carlo total difference: 3.65%;
- completed: 1,999 / 2,000;
- timeout: 1;
- missing policy states: 0;
- fallback actions: 0.

Do not force these totals to stay numerically identical if a verified mechanics correction changes them.

If Harvest mechanics are corrected later, expected costs may legitimately move.

The regression requirement is that the analytical model and Monte Carlo remain internally consistent and mechanically explainable.

---

# 11. Labels to Preserve

Keep:

`GAME-MECHANICS FIDELITY: PARTIAL`

Keep:

`GLOBAL OPTIMALITY: NOT YET PROVEN`

For Harvest specifically, a useful additional label is:

`HARVEST EXTERNAL PARITY: CLOSE / APPROXIMATE — COMPOUND EVENT CURRENTLY ~19% OPTIMISTIC`

Do not represent this as a catastrophic failure.

---

# 12. Do Not Do Yet

Do not:

- reintroduce Allflame;
- build polished frontend UI;
- add unit tests;
- hardcode Craft of Exile probabilities;
- tune Harvest solely to make the benchmark match;
- broadly rewrite Craft A/C;
- claim global optimality while generic search remains incomplete.

---

# 13. No Unit Tests

Continue validating with:

- runtime diagnostics;
- seeded shared-mechanic simulations;
- external Craft of Exile parity;
- generic Bellman diagnostics;
- selected-policy reachability diagnostics;
- expected-cost reconciliation;
- Craft A/C end-to-end regression outputs.

Do not add unit tests unless explicitly requested later.

---

# 14. Recommended Implementation Order

1. Refine full-graph vs on-policy graph diagnostics.
2. Remove misleading absorption/properness conclusions when unresolved transitions exist.
3. Replace placeholder-penalty dominance with explicit COMPLETE / UNRESOLVED / IMPROPER action status.
4. Add state-generation attribution by action.
5. Determine why the one-mod target explodes beyond 5,000 states.
6. Make selected-policy expected-visit evaluation converge.
7. Tighten expected-cost reconciliation.
8. Preserve and improve engine-derived external parity.
9. Keep Harvest compound mismatch labeled CLOSE / APPROXIMATE rather than blocking architecture.
10. Re-run Craft A/C.
11. If solver correctness gates pass, begin Scour/reset.
12. Add restart/reacquire.
13. Migrate shared Exalt.
14. Add generic Fracturing Orb.
15. Run the exact Craft of Exile policy as an external integration benchmark.
16. Bring Craft B back.
17. Move to developer UI Phase 1.

---

# 15. Completion Report Required

When this pass is complete, commit implementation and regenerated outputs to `main` and report:

- commit SHA;
- files changed;
- full candidate graph state count;
- whether a hard state cap was hit;
- state generation counts by action;
- on-policy reachable state count;
- on-policy unresolved transition count;
- on-policy unresolved probability mass;
- terminal absorption/properness status;
- Bellman convergence/residual;
- policy-evaluation / expected-visit convergence;
- expected action-count cost vs Bellman EV reconciliation;
- candidate actions marked COMPLETE / UNRESOLVED / IMPROPER;
- latest engine-derived Alteration parity;
- latest engine-derived Harvest ES-only parity;
- latest engine-derived compound Harvest parity;
- latest Annul parity;
- latest Exalt parity;
- Craft A regression result;
- Craft C regression result;
- whether solver correctness gates are sufficient to proceed to Scour/restart;
- remaining mechanics approximations.

---

# Bottom Line

The external Craft of Exile data is overall encouraging.

The compound Harvest event shows a real but moderate optimistic bias in the current engine, not a fundamental mechanics failure.

The immediate blocker to broader route discovery is the **generic solver's graph completeness / unresolved-policy / policy-evaluation correctness**, not the difference between approximately 1/685 and 1/816 on one compound Harvest event.

Fix the generic search correctness gates first. Continue tracking Harvest fidelity in parallel. Once the solver is trustworthy, proceed to Scour -> restart -> shared Exalt -> Fracturing, then move toward the developer UI phase.