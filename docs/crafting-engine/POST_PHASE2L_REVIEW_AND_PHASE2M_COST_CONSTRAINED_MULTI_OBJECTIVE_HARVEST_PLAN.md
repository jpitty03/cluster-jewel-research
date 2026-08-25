# Post-Phase 2L Review and Phase 2M Plan

## Phase 2M — Cost-Constrained Multi-Objective Crafting, Harvest Transparency, and Full-Route Effort Accounting

Baseline reviewed: `b2ca00f60d97dbd32dbe35b47a4cfae098631586` on `main`.

Phase 2L is CLOSED / PASS. It added admissible acquisition/downstream/full-route bounds, retained candidate-stage proof sessions, incumbent-directed DEEPEN scheduling, proof-honest portfolio status, terminal proof telemetry, and the requested Search Activity and modifier-selector hardening.

The exact four-mod portfolio still ends `BEST_RESOLVED_UNPROVEN` within interactive budgets because valid generic lower bounds remain much weaker than the executable incumbent. That known proof-efficiency limitation is preserved; it is not a correctness failure and is not silently reclassified by Phase 2M.

No unit tests are to be added or run.

---

# 1. Why Phase 2M Is Next

The optimizer currently answers one question:

> Which modeled policy has the lowest expected currency cost, expressed in chaos?

That is correct for a **Cheapest** recommendation, but it does not answer:

- Which route requires the fewest physical crafting operations?
- Which route is fastest for a player to execute?
- Is Harvest more expensive but substantially less tedious?
- Is a faster route worth a user-selected currency premium?

A user-observed T1 Armour + T1 Evasion conventional policy used approximately:

```text
1,298 Alterations
68 Regals
68 Exalts
67 Scours
67 Transmutations
```

That is approximately `1,568` currency applications before counting inspection effort, acquisition work, or any restart/reacquisition interaction. Under the then-current price vector it was approximately `326.9c`.

Harvest may legitimately cost more chaos while requiring far fewer repeated operations. The current solver should not be forced to select Harvest under the Cheapest objective, but the product should be able to expose a faster or lower-interaction alternative when the user accepts the additional cost.

---

# 2. Critical Gotcha: Pure “Fastest” or “Fewest Actions” Can Produce Perverse Results

A pure action-count or time objective can select self-fracture for a cheap craft even when the fracture route is dramatically more expensive in currency.

That is not necessarily a mathematical error. If currency is assigned zero importance, spending several Fracturing Orbs to avoid hundreds of Alterations may truly minimize actions or estimated time.

It becomes a product error when the UI presents that result as a normal recommendation without its monetary tradeoff.

There is an additional implementation trap:

> A self-fracture acquisition must never be counted as one virtual `acquire_*` action.

The full-route effort calculation must include the acquisition synthesis policy:

- Transmutations;
- Alterations;
- Augmentations;
- Regals;
- Exalts;
- Chaos Orbs where selected;
- Fracturing Orbs;
- Scours;
- wrong-fracture restart/reacquisition;
- expected repeated base preparation;
- every downstream action after the reusable fractured state is acquired.

The virtual acquisition-menu transition is a solver abstraction and contributes **zero** physical crafting actions. Its selected acquisition policy contributes the actual expected usage vector.

Phase 2M must explicitly diagnose and prevent the “self-fracture equals one action” accounting bug.

---

# 3. Product Objective Contract

## 3.1 Default objective remains Cheapest

The default and primary recommendation remains:

```text
CHEAPEST_CHAOS
minimize expected chaos cost
```

With the same mechanics, prices, target, and search budget, this objective must reproduce the existing Phase 2L policy/economics/proof behavior within numerical tolerance.

No existing user should receive a different route merely because multi-objective support exists.

## 3.2 Practical Fewest Actions

```text
FEWEST_ACTIONS_WITHIN_COST
minimize expected physical crafting actions
subject to an explicit maximum expected chaos cost
```

The user supplies the cost constraint as either:

- an absolute expected-chaos budget; or
- a visible premium over the resolved Cheapest policy, expressed as chaos and/or percentage.

The normalized request must contain the final absolute ceiling. There must be no hidden cost premium.

## 3.3 Practical Fastest

```text
FASTEST_WITHIN_COST
minimize estimated manual execution time
subject to an explicit maximum expected chaos cost
```

The result must be labeled **Estimated fastest**, not objectively fastest in the real world, unless the timing profile is user-supplied and complete.

## 3.4 Balanced

```text
BALANCED_VALUE_OF_TIME
minimize expectedChaos + estimatedMinutes × chaosValuePerMinute
```

This mode is enabled only when the user explicitly provides or selects a visible value-of-time assumption. The value must be part of request identity and result provenance.

## 3.5 Unconstrained objectives are Advanced-only

The engine may compute:

- `UNCONSTRAINED_FEWEST_ACTIONS`;
- `UNCONSTRAINED_FASTEST`.

These are useful for diagnostics and Pareto-frontier generation, but they must not be presented as normal recommendations without an explicit warning such as:

> This route ignores currency cost and may be substantially more expensive.

For a cheap one-mod craft, it is acceptable for an unconstrained objective to choose self-fracture. It is not acceptable for that route to be silently labeled “Best” or “Fastest practical.”

---

# 4. Full-Route Cost Vector

Each modeled action must expose or derive a vector:

```text
chaosCost
physicalActionCount
estimatedManualTimeMs
```

The transition probabilities remain unchanged.

## 4.1 Physical action count

`physicalActionCount` represents actual expected crafting/recovery operations, not solver graph transitions.

Examples:

- one Orb of Alteration application: `1`;
- one Harvest reforge application: `1`;
- one Fracturing Orb application: `1`;
- one Scour: `1`;
- one restart/reacquire operation: configurable but non-zero in the practical-effort model;
- virtual acquisition-menu selection: `0`;
- terminal success: `0`.

Inspection may be included in each action’s time estimate rather than represented as a separate graph action.

## 4.2 Estimated time profile

Add a data-driven `ActionEffortProfile` rather than embedding timing constants into solver branches.

It should support:

- per-action seconds or effort units;
- restart/reacquisition overhead;
- Harvest station/navigation overhead;
- optional user overrides;
- provenance/confidence (`USER_SUPPLIED`, `DEFAULT_APPROXIMATE`, `UNAVAILABLE`).

Do not publish minute-level precision when inputs are approximate. Round and label appropriately.

## 4.3 Acquisition + downstream merge

For a self-fracture route:

```text
fullRouteMetrics = acquisitionMetrics + downstreamMetrics
```

For a clean route:

```text
fullRouteMetrics = initial clean acquisition metrics + downstreamMetrics
```

The selected acquisition synthesis `expectedActionUsage`, expected restarts, and downstream occupancy must reconcile into one full-route vector. The first acquisition is counted once; restart/reacquire costs are counted according to the actual policy.

## 4.4 Multi-metric reconciliation

For every returned policy, record and reconcile:

```text
Σ expectedVisits(action) × chaosCost(action)
Σ expectedVisits(action) × physicalActionCount(action)
Σ expectedVisits(action) × estimatedTime(action)
```

The scalar Bellman objective and each reported user-facing metric are separate fields. A policy optimized for time still reports its exact expected chaos usage.

---

# 5. Search Architecture

## 5.1 Generic objective cost model

Introduce a generic objective evaluator rather than duplicating mechanics:

```text
ObjectiveCostModel
  score(actionCostVector, objectiveSpec) -> scalar immediate objective cost
```

All existing transition distributions, eligibility, weights, fracture semantics, Harvest semantics, state identity, and restart behavior stay authoritative and unchanged.

## 5.2 Independent Bellman policy per objective

Do not take the Cheapest policy and merely sort it by action count.

Different objectives can change:

- which Magic states are kept;
- whether Regal or Alteration is preferred;
- whether Harvest is selected;
- which target is rolled first;
- whether self-fracture is worthwhile;
- when Scour/restart is selected.

Each objective therefore requires its own Bellman solve and occupancy reconciliation.

## 5.3 Cost-constrained candidate generation

An exact constrained stochastic-shortest-path proof is more complex than a single scalar Bellman solve. Phase 2M must remain proof-honest.

Use an adaptive scalarization portfolio:

1. solve pure Cheapest;
2. solve pure actions and/or pure estimated time;
3. solve balanced objectives with adaptive monetary penalty values between those extremes;
4. retain unique executable policies;
5. evaluate every policy’s exact chaos/actions/time vector;
6. remove strictly dominated policies;
7. choose the best resolved policy satisfying the user’s explicit cost ceiling.

The adaptive sweep should refine near the requested cost boundary rather than use a fixed Craft-specific set of weights.

Result status must distinguish:

- `CONSTRAINED_OPTIMAL_PROVEN` only if completeness is genuinely proven;
- `BEST_RESOLVED_WITHIN_COST`;
- `NO_RESOLVED_ROUTE_WITHIN_COST`;
- `CHEAPEST_ROUTE_UNRESOLVED` when a reliable ceiling cannot be established.

Do not call the sampled Pareto set globally complete unless the implementation proves that claim.

## 5.4 Pareto frontier

A policy is dominated when another resolved policy has:

```text
chaos <= chaos
and actions <= actions
and time <= time
```

with at least one strict improvement.

Display only non-dominated user-facing alternatives by default. Keep the full research set in Advanced diagnostics.

## 5.5 Objective-safe graph reuse

Mechanics transition graphs may be reused when target/mechanics identity is unchanged.

Bellman values, selected actions, occupancy, objective lower bounds, and policy proof cannot be reused across incompatible objective specifications.

Search identity must include at least:

- objective kind;
- normalized cost ceiling;
- action-effort profile/version;
- user timing overrides;
- value-of-time setting;
- scalarization coefficient where relevant.

A changed objective may reuse transition distributions but must recompute objective-specific value/policy state.

---

# 6. Cost Guardrails for Fracture Routes

## 6.1 Executable U, not optimistic L

A route satisfies the user’s cost ceiling only when its executable expected chaos **upper bound** is at or below the ceiling.

An unresolved lower bound below the ceiling is not sufficient.

## 6.2 Cheap-craft control

Add a simple one-mod or easy two-mod fixture where:

- Cheapest is a low-cost clean route;
- unconstrained Fewest Actions may prefer self-fracture;
- self-fracture is far above a modest explicit cost ceiling.

Acceptance:

- Advanced unconstrained output may show fracture;
- `FEWEST_ACTIONS_WITHIN_COST` and `FASTEST_WITHIN_COST` must not select it when its executable chaos U exceeds the ceiling;
- the UI explains how much more the unconstrained route costs.

## 6.3 Cheap-fracture counter-fixture

Repeat with a deliberately cheap Fracturing Orb.

If self-fracture becomes both cost-eligible and lower-action/faster, the practical objective should be allowed to select it. No clean-route preference may be hardcoded.

## 6.4 Acquisition-accounting audit

For every selected self-fracture policy, diagnostics must show:

- expected preparation actions;
- expected Fracturing Orbs;
- expected wrong-fracture restarts;
- expected base reacquisitions;
- cleanup actions;
- downstream actions;
- full total.

Assert that the physical-action total is not equal to the single virtual acquisition transition unless the actual expected physical usage genuinely equals one.

---

# 7. Harvest Transparency and Primary Real-World Fixture

## 7.1 T1 Armour + T1 Evasion fixture

Pin a controlled exact fixture only after verifying catalog eligibility. Record, do not infer:

- base type;
- cluster enchantment;
- item level;
- passive count;
- final rarity;
- extra-affix policy;
- exact T1 Armour mod ID;
- exact T1 Evasion mod ID;
- frozen currency vector;
- clean-base price.

The known target IDs in the committed pool are expected to be:

```text
AfflictionJewelSmallPassivesGrantArmour3_
AfflictionJewelSmallPassivesGrantEvasion3
```

The diagnostic must verify those IDs and their eligibility rather than trusting this text blindly.

Both targets carry the defence tag, so `Harvest Reforge Defences` should be in the considered action scope when eligible.

## 7.2 Reference economics

Record the user-observed conventional policy as reference evidence, not a hardcoded expected answer:

```text
1,298 Alterations
68 Regals
68 Exalts
67 Scours
67 Transmutations
≈ 1,568 applications
≈ 326.9c under the observed price vector
```

Also record:

- Primal Lifeforce price;
- Harvest cost per application (`75 × price`);
- analytical/seeded target success behavior;
- expected Harvest attempts;
- expected Harvest chaos/actions/time;
- conventional chaos/actions/time.

The engine must calculate the winner.

## 7.3 Required objective behavior

The fixture should demonstrate one of these proof-honest outcomes:

```text
Cheapest = conventional
Fewest actions within user ceiling = Harvest
```

or, if actual calculated metrics do not support that:

```text
Harvest considered, but no resolved Harvest policy beats the practical objective
```

Do not force the expected reversal.

## 7.4 Why Harvest was not selected

Add a user-facing explanation when Harvest is enabled but absent from the selected recommendation:

- considered Harvest action(s);
- whether a resolved Harvest-using policy was found;
- expected Harvest route chaos/actions/time if resolved;
- selected route chaos/actions/time;
- cost premium and action/time savings;
- Lifeforce crossover estimate where derivable;
- unresolved/search-budget explanation where applicable.

The UI must distinguish:

```text
Harvest was considered and was more expensive
```

from:

```text
Harvest was enabled but no executable Harvest policy resolved under this budget
```

and from:

```text
Harvest was not eligible/enabled for these targets
```

---

# 8. Service Contract

Add a serializable objective request model, conceptually:

```typescript
interface OptimizationObjectiveSpec {
  kind:
    | 'CHEAPEST_CHAOS'
    | 'FEWEST_ACTIONS_WITHIN_COST'
    | 'FASTEST_WITHIN_COST'
    | 'BALANCED_VALUE_OF_TIME'
    | 'UNCONSTRAINED_FEWEST_ACTIONS'
    | 'UNCONSTRAINED_FASTEST';

  maxExpectedCostChaos?: number;
  maxPremiumChaos?: number;
  maxPremiumFraction?: number;
  chaosValuePerMinute?: number;
  effortProfile?: ActionEffortProfileInput;
}
```

Normalize all cost-premium inputs to an explicit absolute ceiling in the validated request/result.

Each route summary should expose:

```typescript
interface RouteMetricVector {
  expectedChaosCost: number;
  expectedPhysicalActions: number;
  estimatedManualTimeMs?: number;
  objectiveScore: number;
  effortConfidence: 'USER_SUPPLIED' | 'DEFAULT_APPROXIMATE' | 'UNAVAILABLE';
}
```

The result should include:

- Cheapest route;
- selected requested-objective route;
- Pareto alternatives;
- objective proof/status;
- cost ceiling and margin;
- full acquisition/downstream metric breakdown;
- Harvest comparison evidence;
- existing acquisition/policy/global proof evidence.

No raw Maps may cross the service/Worker boundary.

---

# 9. UI Plan

## 9.1 Objective selector

Keep Cheapest as the default.

Add explicit choices:

- Cheapest;
- Fewer actions within budget;
- Estimated fastest within budget;
- Balanced.

Advanced may expose unconstrained actions/time.

## 9.2 Visible cost tolerance

For practical action/time modes, require a visible control such as:

```text
Maximum expected cost
or
Maximum premium over Cheapest
```

Display both absolute and percentage premium in the result.

Do not silently use an internal tolerance.

## 9.3 Comparison cards

Show, at minimum:

```text
Cheapest
Expected chaos
Expected actions
Estimated time
Acquisition method
Proof status

Requested objective
Expected chaos
Premium vs Cheapest
Expected actions saved
Estimated time saved
Acquisition method
Proof status
```

If the requested objective selects self-fracture on a cheap craft, show the fracture acquisition cost/actions separately and prominently.

## 9.4 Search Activity

The existing Search Activity visualizer should show the active objective and cost ceiling.

Do not mix units:

- chaos L/U for monetary proof;
- action/time objective score and bounds in their own labeled fields;
- cost-constraint eligibility separately.

## 9.5 Avoid false precision

Expected actions may be shown with reasonable decimals because they are occupancy expectations.

Estimated time must be rounded according to effort-confidence level and accompanied by the profile/assumption source.

---

# 10. Required Phase 2M Diagnostics

## M1 — Phase 2L Cheapest regression

Run the existing Phase 2L fixtures under `CHEAPEST_CHAOS`.

Acceptance:

- selected policies/economics/proof remain equivalent within numerical tolerance;
- no mechanics transition or probability changes;
- exact four-mod proof status remains honest.

## M2 — Vector cost accounting

For representative clean, Harvest, and self-fracture policies, reconcile chaos/actions/time independently from expected visits.

Zero unexplained deltas beyond declared tolerances.

## M3 — Virtual acquisition action trap

Demonstrate that `acquire_self_fracture_*` is not counted as one physical action. Compare the full total to acquisition synthesis usage + downstream usage.

## M4 — Wrong-fracture effort accounting

Verify wrong-fracture expected visits, reacquisitions, preparation repetitions, and cleanup are included exactly once.

## M5 — T1 Armour + T1 Evasion objective matrix

Record for the exact frozen fixture:

- Cheapest;
- unconstrained fewest actions;
- unconstrained estimated fastest;
- practical fewest actions at one or more explicit ceilings;
- practical fastest at the same ceilings;
- balanced values across at least three user time valuations;
- Harvest consideration and selected-action evidence.

## M6 — Harvest Lifeforce price sweep

Low / near-crossover / high Primal Lifeforce prices must change the route economics naturally. No hardcoded Harvest winner.

## M7 — Fracture cost guardrail

On an easy craft with normal expensive Fracturing Orbs:

- unconstrained action/time may select fracture;
- practical objectives reject it when over ceiling.

## M8 — Cheap-fracture reversal

With cheap Fracturing Orbs, fracture may enter or win the cost-eligible Pareto set.

## M9 — Objective-specific policy reversal

Use a controlled weight/price fixture where changing objective changes a keep/reroll or action choice, proving the implementation is not merely re-ranking the Cheapest policy.

## M10 — Pareto pruning

Assert no default-visible alternative is strictly dominated in chaos, actions, and time.

## M11 — Cost-ceiling safety

Every practical selected route has executable monetary U at or below the normalized ceiling. An unresolved L alone never qualifies.

## M12 — Objective identity and reuse

- same mechanics/target, different objective: transition distributions may reuse;
- Bellman/policy/occupancy must recompute;
- changed effort profile/value-of-time/cost ceiling invalidates objective values safely;
- returning A -> B -> A may recover exact prior objective sessions.

## M13 — Worker / serialization / telemetry

Validate objective requests/results/progress through the actual compiled Worker boundary, including cancel, host guard, stale progress, and terminal COMPLETE -> RESULT.

## M14 — UI browser smoke

Cover:

- objective switching;
- visible cost ceiling;
- fracture premium warning;
- Harvest considered explanation;
- comparison cards;
- narrow viewport;
- keyboard/accessibility regressions from Phase 2L.

## M15 — Performance

Measure:

- Cheapest unchanged latency;
- on-demand objective comparison latency;
- graph/transition reuse benefit;
- memory/session bounds.

Do not run every objective automatically on every Cheapest request if it causes unacceptable latency. Additional comparisons may be explicitly on-demand.

## M16 — Mature regressions

Run Phase 2E, 2I, 2J, 2K.1, and 2L diagnostics. Run Craft A/C deterministic and multi-seed checks if shared search/value semantics are modified.

## M17 — Build hygiene

Require:

```text
npm run build
npm run lint
git diff --check
production browser + Worker smoke
```

No unit tests.

---

# 11. Phase 2M Completion Gates

Phase 2M closes only when:

- Cheapest reproduces Phase 2L behavior;
- action/time metrics include the complete acquisition + downstream route;
- virtual acquisition actions cannot undercount self-fracture effort;
- practical action/time modes enforce an explicit executable-chaos ceiling;
- unconstrained modes are clearly separated and warned;
- objective-specific Bellman policies are actually solved;
- T1 Armour + T1 Evasion records Harvest vs conventional chaos/actions/time evidence;
- Harvest considered/not-selected reasoning is visible and accurate;
- fracture price/cost-ceiling counter-fixtures behave economically without hardcoded winners;
- Pareto alternatives are non-dominated;
- objective proof and existing acquisition/policy/global proof remain separate;
- objective identity/reuse is safe;
- actual Worker/UI/telemetry smokes pass;
- Phase 2E through Phase 2L regressions remain healthy;
- build/lint/diff pass;
- unit tests added/run: NO;
- target/Craft-specific branches: NO;
- hardcoded Harvest or fracture winner: NO;
- pre-fractured market ranking: NO;
- Allflame crafting mechanic enabled: NO.

---

# 12. Required Completion Report

Create:

```text
docs/crafting-engine/PHASE2M_COST_CONSTRAINED_MULTI_OBJECTIVE_HARVEST_COMPLETION_REPORT.md
```

Include at minimum:

1. implementation commit;
2. files changed;
3. Phase 2L regression status;
4. objective model and cost-vector contract;
5. physical action-count definition;
6. time/effort profile and confidence model;
7. acquisition + downstream merge method;
8. multi-metric reconciliation evidence;
9. scalarization/Pareto generation method;
10. constrained-objective proof status semantics;
11. exact T1 Armour + T1 Evasion fixture;
12. conventional route chaos/actions/time;
13. Harvest route chaos/actions/time;
14. Harvest price crossover sweep;
15. practical cost ceilings and selected routes;
16. unconstrained fracture gotcha result;
17. cost-guardrail result;
18. cheap-fracture counter-result;
19. full self-fracture action breakdown;
20. wrong-fracture/reacquisition accounting;
21. objective-specific policy reversal;
22. Pareto table;
23. objective identity/reuse evidence;
24. Search Activity and UI screenshots/smoke evidence;
25. Worker protocol/serialization evidence;
26. latency/memory measurements;
27. Phase 2E–2L regression matrix;
28. build/lint/diff;
29. unit tests added/run: expected NO;
30. target/Craft-specific branches added: expected NO;
31. hardcoded route winner added: expected NO;
32. remaining blockers before pricing/release phases.

---

# Final Phase 2M Principle

> **“Fewest actions” and “fastest” are not automatically practical recommendations. They become useful only when the full acquisition policy is counted and the user’s currency tolerance is explicit.**

Phase 2M should make Harvest and other low-interaction routes discoverable without turning an expensive self-fracture shortcut into the default answer for every cheap craft.