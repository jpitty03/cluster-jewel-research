# Post-Phase 2V Field Review and Phase 2W Plan

## Phase 2W — Canonical Policy Binding, Objective-Aware Selection, Cluster-to-Optimizer Handoff, and Autonomous Release QA

Baseline reviewed: `cd066d48752a752f76338efa119ba2321fd3adf8` on `main`.

Phase 2V remains **CLOSED / PASS** for the behavior it targeted: Replay scroll ownership, clean/self-fracture Constellation chronology, single terminal presentation, and generic repeatable Harvest reroll closure.

This phase is driven by new real-user field evidence rather than a planned architecture expansion.

Primary field evidence:

```text
Eldritch InspirationLow Tolerance.pdf
test1.pdf
test2.pdf
test3.pdf
```

Also preserve the newer user-added snapshot commit:

```text
cd066d48752a752f76338efa119ba2321fd3adf8
src/data/allflame/cluster-jewels.json
```

No unit tests are to be added or run unless the user explicitly changes the standing project constraint.

---

# 1. Executive Review Verdict

Phase 2V successfully fixed the original Harvest resolution and scroll bugs, but the new field tests exposed **two release-blocking result-selection defects** and one high-value workflow feature.

## Blocking defect A — selected-route data can come from different policies

For the real Medium Cluster Jewel target:

```text
Medium Cluster Jewel
12% increased Chaos Damage over Time
ilvl 84
6 passives
Eldritch Inspiration + Low Tolerance
Cheapest objective
```

one result simultaneously reports:

```text
Acquisition graph clean-route U:  ~599.48c
Pareto cheapest route:             ~599.48c
Craft Recommendation expected:    7243.718c
Expected-material downstream:     7233.718c
Full-route reconciliation error:  6644.235c
```

That is not a proof-budget ambiguity. It is a **canonical-result identity failure**: the selected route and the policy/action-usage used to construct the public result are not the same policy.

The same PDF also shows a clean selected route while the normal craft plan includes a Fracturing Orb in the acquisition step. That is another symptom of the same source-binding problem.

A recommendation with a reconciliation difference of thousands of chaos must never be renderable as a valid result.

## Blocking defect B — non-cheapest objectives do not select the best resolved eligible policy

The exact Armour + Evasion field tests use:

```text
Large Cluster Jewel
10% increased Attack Damage
ilvl 84
12 passives
Any rarity
extra affixes allowed
T1 Armour + T1 Evasion
```

The independently solved policies are approximately:

```text
Open / cheapest policy
  175.363c
  1161 actions
  464.2s

Conventional policy under action/time objective
  347.753c
  742 actions
  296.9s

Harvest Reforge Defences
  576.580c
  208 actions
  413.7s
```

Yet both:

```text
FEWEST_ACTIONS_WITHIN_COST @ 600c
FASTEST_WITHIN_COST @ 600c
```

return the 175.363c Open policy as the top recommendation and label it Cheapest / Fewest Actions / Fastest.

This is objectively inconsistent with the independently resolved method-family evidence.

Expected current winners from the resolved policies are:

```text
CHEAPEST
  Open policy (~175.36c)

FEWEST_ACTIONS_WITHIN_COST @ 600c
  Harvest (~208 actions, ~576.58c)

FASTEST_WITHIN_COST @ 600c
  Conventional (~296.9s, ~347.75c)

FEWEST_ACTIONS_WITHIN_COST @ 500c
  Conventional, because Harvest exceeds the ceiling

FASTEST_WITHIN_COST @ 500c
  Conventional, because Harvest exceeds the ceiling
```

Do not hardcode these winners. They are frozen-fixture expectations derived from the currently resolved policy vectors and must continue to emerge from the generic objective selector.

## High-value feature — Cluster Jewels → Craft Optimizer

The user wants to select a cluster or notable combination in the **Cluster Jewels** tab and immediately populate the **Craft Optimizer** with that base, enchantment, passive count, targets, league, and relevant market context.

This is especially useful because the supplied external trade link for Eldritch Inspiration + Low Tolerance filters **4–5 passive** Medium Cluster Jewels, while the manually configured optimizer PDF uses **6 passives**. The quoted 1329c market result and the 6-passive optimizer result are therefore not the same market SKU.

A first-class handoff should make these mismatches harder to create accidentally.

---

# 2. Confirmed Architectural Causes to Audit

The implementation agent must verify these against live `main` before changing code, but the current service structure strongly indicates the following causes.

## 2.1 Ambient `result` is used after a different route was selected

The service can choose a `recommended` route from a direct clean/fracture candidate, while later result construction still uses the ambient portfolio `result` for:

- expected action usage;
- policy explanations;
- expected materials;
- metrics;
- craft-plan source;
- full-route reconstruction.

In particular, `buildFullRouteUsageSummary(...)` currently receives:

```text
downstreamActionUsage: result.expectedActionUsage
```

rather than action usage explicitly bound to the selected `recommended` route.

That permits:

```text
selected route A
+
policy usage from route B
```

and explains the 599c vs 7243c field result.

## 2.2 The primary acquisition-portfolio search does not consistently receive the objective

Audit every `new GenericSearchEngine(...)` call in the service.

The current `runDownstreamSearch(...)` path does not visibly carry the same:

```text
objective: input.objective
effortProfile: input.effortProfile
```

contract used by independently constrained method-family solves.

This can leave the main Open/acquisition search effectively cost-driven while the UI labels the result as Fewest Actions or Estimated Fastest.

## 2.3 Acquisition dominance is still chaos-incumbent-centric

For the 600c Fewest/Fastest field runs, the self-fracture candidates are marked dominated because their chaos lower bound (~359.8c) is above the 175.4c cheapest incumbent.

That is valid for **CHEAPEST_CHAOS**.

It is not sufficient for:

```text
FEWEST_ACTIONS_WITHIN_COST @ 600c
FASTEST_WITHIN_COST @ 600c
```

A 359.8c lower bound is still below the 600c eligibility ceiling, so the route cannot be removed merely for costing more than the current 175c candidate. It may still use fewer actions or less time.

## 2.4 Method-family policies are built after the main Pareto set and recommendation

The current result builds the initial Pareto alternatives and objective proof before `buildMethodPortfolio(...)` finishes independent Conventional/Harvest/etc. solves.

Therefore a route can exist in Method Comparison and still be absent from:

- the main objective selector;
- the main Pareto frontier;
- the Selected Goal badge;
- the top Craft Recommendation;
- the main Constellation/craft plan.

Phase 2W must make independently resolved policy families first-class selectable policies, not display-only appendices.

---

# 3. Track A — Canonical Selected Policy Bundle

## 3.1 Introduce one atomic selected-policy representation

Create a service-internal structure conceptually like:

```typescript
interface ResolvedPolicyBundle {
  id: string;
  source:
    | 'OPEN'
    | 'CLEAN_DIRECT'
    | 'SELF_FRACTURE'
    | 'CONVENTIONAL'
    | 'HARVEST'
    | 'SELF_FRACTURE_HARVEST'
    | 'OTHER';

  route: RouteSummary;
  acquisitionCandidateId?: string;
  acquisitionMethodId?: string;
  acquisitionSynthesis?: AcquisitionSynthesisSummary;

  solverResult: GenericSearchResult;
  downstreamActionUsage: ExpectedActionUsage[];
  fullRouteUsage: FullRouteUsageSummary;
  metrics: RouteMetricVector;

  craftPlan: CraftPlanSummary;
  policyRules: PolicyRule[];
  policyExplanation: PolicyExplanationRule[];

  policyHealth: ...;
  proof: ...;
  actionEvidence: string[];
}
```

Exact naming is implementation-defined.

The invariant is not:

```text
route + whichever result object is currently in scope
```

It is:

```text
route + exact solver policy that produced that route
```

## 3.2 Build all public selected-route fields from that bundle

Once a bundle is selected, these must all derive from it:

- `recommended`;
- `expectedCostChaos`;
- `expectedCurrencies`;
- `expectedActionUsage`;
- `fullRouteUsage`;
- selected policy rules;
- policy explanation;
- craft plan;
- Constellation;
- route metrics;
- objective score;
- expected materials;
- shopping list;
- selected policy health;
- selected mechanics/price evidence;
- progress terminal U;
- export/share/bug-report selected route.

Do not reconstruct selected-route usage from a non-selected ambient search result.

## 3.3 Canonical consistency invariant

For any executable selected policy:

```text
recommended.expectedTotalCostChaos
≈ result.expectedCostChaos
≈ fullRouteUsage.fullRouteCostChaos
≈ sum(fullRouteUsage.combinedActions.expectedCostChaos)
≈ selectedBundle.metrics.expectedChaosCost
≈ final Search Activity selected U
≈ export selected route cost
≈ visible Craft Recommendation cost
```

Use a strict declared numeric tolerance, e.g. `0.05c` maximum for presentation reconciliation and much tighter internal floating-point checks where appropriate.

## 3.4 Fail closed on large mismatch

The current UI displayed:

```text
reconciliation difference 6644.235c
```

A mismatch of this kind must become an internal consistency failure rather than a player recommendation.

Required behavior:

```text
if selected-route canonical reconciliation exceeds tolerance:
  do not label search complete successfully
  do not show a normal expected craft cost
  return structured INTERNAL_RESULT_MISMATCH evidence
  preserve request + candidate IDs + source policy IDs for diagnostics
```

The Quality Lab must make this a release-blocking invariant.

## 3.5 Progress terminal snapshot binding

The final `PROGRESS: COMPLETE` selected U and selected route must be built from the same final canonical bundle as `RESULT`.

A candidate card may retain its own allocated-depth U, but the top-level:

```text
BEST EXECUTABLE (U)
Selected route
Craft Recommendation
```

must agree.

---

# 4. Track B — Objective-Aware Search, Pruning, and Proof

## 4.1 Propagate the objective through every relevant search path

Audit every search constructor and continuation identity.

The following must receive compatible objective/effort context whenever they participate in the requested optimization:

- fast clean certification;
- open acquisition portfolio search;
- clean downstream;
- fracture downstream;
- method-family search;
- resumed DEEPEN search;
- objective-specific value/occupancy solve.

Transition distributions may be reused across objectives when mechanics identity is unchanged, but Bellman values/policies/occupancy must be objective-specific.

## 4.2 Objective-aware acquisition pruning

### Cheapest

A candidate can be cost-dominated when:

```text
candidate admissible full-route chaos L >= incumbent executable chaos U
```

### Fewest actions within cost

A candidate can be rejected by cost only when:

```text
candidate executable/minimum-safe chaos evidence > user cost ceiling
```

or an admissible lower bound itself already exceeds the ceiling.

Do not prune merely because its chaos L is above the currently selected route's cost.

If an admissible action-count lower bound exists and cannot beat the action incumbent, it may also be dominated.

If no safe action lower bound exists, retain the candidate as unresolved rather than inventing proof.

### Fastest within cost

Same rule, using an admissible time lower bound only if one actually exists.

### Balanced

Use the declared scalar objective lower bound only when safely derivable.

### Unconstrained action/time modes

Raw chaos cost must not prune unless the objective explicitly includes cost.

## 4.3 Cost ceiling qualification uses executable cost U

A practical candidate qualifies only when:

```text
resolved full-route expected chaos U <= normalized cost ceiling
```

An unresolved lower bound below the ceiling does not make it selectable.

## 4.4 Do not call cost-dominated when the real status is over-ceiling

Add clear lifecycle language:

```text
RESOLVED_ELIGIBLE
OVER_COST_CEILING
OBJECTIVE_DOMINATED
UNRESOLVED_COULD_QUALIFY
UNRESOLVED_COST_INELIGIBLE_BY_BOUND
```

Exact enums may differ.

The UI should tell the user whether a fracture route was rejected because it is definitely too expensive for their ceiling versus merely more expensive than the cheapest route.

---

# 5. Track C — Unified Policy Candidate Set and Pareto Selection

## 5.1 Independent method-family results become selectable

After method comparison resolves a policy, create a `ResolvedPolicyBundle` for it.

Candidate sources should include all actually resolved executable policies that are relevant to the requested objective:

```text
Open policy
Direct clean candidate
Resolved self-fracture candidates
Independent Conventional
Independent Harvest
Independent self-fracture + Harvest
future modeled families
```

Do not add a route unless it has a real policy, full-route accounting, and required-action evidence.

## 5.2 Recompute the Pareto frontier after family solves

The public Pareto set must be computed from the final resolved bundle collection, not from the earlier acquisition-route list alone.

Dominance dimensions:

```text
expected chaos
expected physical actions
estimated manual time
```

Only resolved policies with complete comparable metrics enter the default frontier.

## 5.3 Select the top recommendation from the unified set

Generic selection rules:

```text
CHEAPEST_CHAOS
  min fullRouteChaos

FEWEST_ACTIONS_WITHIN_COST
  filter U <= ceiling
  min fullRouteActions
  deterministic tie break: lower chaos, then lower time

FASTEST_WITHIN_COST
  filter U <= ceiling
  min estimatedManualTime
  deterministic tie break: lower chaos, then lower actions

BALANCED_VALUE_OF_TIME
  min declared objective score
```

Do not select by family name.

## 5.4 Do not automatically run every expensive family for Cheapest

Preserve product responsiveness.

Suggested behavior:

### Cheapest

Use the normal Open search first. Independent family comparison remains on demand unless proof/business logic requires it.

### Fewest/Fastest/Balanced

The service must obtain enough resolved candidates to make the requested objective meaningful.

At minimum, run/continue relevant families that:

- are mechanically eligible;
- are not safely over the cost ceiling;
- can plausibly improve the requested objective;
- have retained work available.

Use transition graph reuse aggressively.

The result may return `BEST_RESOLVED_WITHIN_COST` while deeper eligible families remain unresolved. Do not overclaim optimality.

## 5.5 Objective proof semantics

The field tests currently say:

```text
CONSTRAINED_OPTIMAL_PROVEN
```

while a resolved eligible policy visibly beats the selected route in the requested metric.

That must be impossible.

`CONSTRAINED_OPTIMAL_PROVEN` is allowed only when the proof covers the candidate space used by the product contract, including all mechanically relevant unresolved families that could satisfy the cost ceiling and improve the objective.

Otherwise use:

```text
BEST_RESOLVED_WITHIN_COST
```

or another explicitly provisional status.

A UI badge may say:

```text
Best resolved route under your 600c ceiling
```

without claiming global constrained optimality.

---

# 6. Frozen Armour + Evasion Objective Matrix

Use the exact same frozen prices and target for every row.

## W-AE1 Cheapest

Expected current behavior:

```text
Selected: Open
~175.36c
~1161 actions
~464.2s
```

Harvest must still resolve in Compare Methods at approximately:

```text
~576.58c
~208 actions
~413.7s
p ≈ 0.484366%
E[Harvest] ≈ 206.456
```

## W-AE2 Fewest actions @ 600c

Resolved-policy winner should currently emerge as:

```text
Harvest
~576.58c <= 600c
~208 actions
```

The top recommendation, Selected Goal badge, Pareto card, craft plan, expected materials, and export must all switch to the Harvest bundle.

## W-AE3 Fastest @ 600c

Current resolved-policy winner should emerge as:

```text
Conventional
~347.75c <= 600c
~296.9s
```

Harvest is fewer actions but slower under the current effort profile.

## W-AE4 Fewest actions @ 500c

Harvest is over ceiling.

Current resolved-policy winner should be Conventional if its exact policy remains the lowest-action eligible route.

## W-AE5 Fastest @ 500c

Harvest is over ceiling.

Current resolved-policy winner should be Conventional if its exact policy remains the fastest eligible route.

## W-AE6 Tight ceiling around Conventional

Test at least:

```text
ceiling just below Conventional U
ceiling exactly/just above Conventional U
```

Selection must switch naturally from the next eligible policy to Conventional.

## W-AE7 Lifeforce price sweep

Retain the Phase 2J/2V low-near-high Lifeforce price sweep.

If Harvest becomes cost-competitive, the same unified candidate selection must handle it without a special branch.

---

# 7. Track D — Eldritch Inspiration + Low Tolerance Canonical Regression

## 7.1 Freeze the exact observed 6-passive bug fixture

```text
Medium Cluster Jewel
12% increased Chaos Damage over Time
ilvl 84
6 passives
Any rarity
extra affixes allowed
Eldritch Inspiration
Low Tolerance
Cheapest
```

Before the fix, the browser evidence contains:

```text
candidate clean U ≈ 599.483c
public recommendation = 7243.718c
reconciliation difference = 6644.235c
```

After the fix, one exact selected policy must own every field.

Do not require the selected cost to remain exactly 599.483c if legitimate search changes produce a better result. Require internal identity and reconciliation.

## 7.2 Cross-surface equality gate

For this fixture compare:

- final Worker RESULT selected route/cost;
- final PROGRESS COMPLETE U;
- acquisition candidate U;
- Craft Recommendation cost;
- Multi-Objective selected card;
- selected method card if present;
- expected materials sum;
- full-route merged total;
- shopping list;
- copied playbook metadata;
- export JSON;
- share/reload result.

Every selected-route semantic value must agree.

## 7.3 Selected action evidence gate

If the selected acquisition is Clean Base:

```text
Fracturing Orb expected usage on selected full route = 0
selected craft plan may not list Fracturing Orb
selected Constellation may not contain selected fracture edge/node
```

If self-fracture wins naturally, require the opposite exact evidence.

## 7.4 Reconciliation gate

Release-blocking:

```text
full-route reconciliation difference <= declared tolerance
```

No warning-only escape hatch for a large mismatch.

---

# 8. Market Comparison Note for the User-Supplied 1329c Trade Result

The user-supplied trade URL for Eldritch Inspiration + Low Tolerance filters Medium Cluster Jewels with **4–5 passive skills**.

The supplied optimizer PDF uses **6 passives**.

Therefore:

```text
1329c market quote
vs
6-passive optimizer craft EV
```

is not an exact apples-to-apples profitability comparison.

Do not encode 1329c as the expected sale value for the 6-passive fixture.

This mismatch motivates the Cluster Jewels → Optimizer handoff below.

---

# 9. Track E — Cluster Jewels → Craft Optimizer Handoff

## 9.1 User experience

Add a visible action on the Cluster Jewels tab:

```text
Optimize Craft
```

Preferred placements:

- on a notable-combination row/card: **Optimize this combo**;
- optionally on the collapsed base/enchantment group: **Open in Optimizer** with no target mods selected.

Clicking it switches to the Craft Optimizer tab and prefills the relevant fields.

## 9.2 App-level handoff contract

`App.tsx` currently renders:

```text
<ClusterJewels />
<CraftOptimizer />
```

with no shared craft-selection state.

Introduce a typed handoff contract, conceptually:

```typescript
interface OptimizerSeed {
  source: 'CLUSTER_JEWELS';
  league: string;
  baseType: BaseType;
  clusterType: string;
  passiveCount?: number;
  passiveRange?: { min: number; max: number };
  itemLevel?: number;
  targetModIds: string[];
  sourceComboLabel?: string;
  sourceMarketValueChaos?: number;
  sourceMarketValueProvenance?: string;
}
```

Flow:

```text
ClusterJewels
  onOptimize(seed)
        ↓
App state
        ↓
setTab('optimizer')
        ↓
CraftOptimizer applies seed exactly once
```

Do not use an untyped global event or DOM query.

## 9.3 Exact notable resolution

For a notable combo:

1. preserve the exact `Group.base`;
2. preserve exact `Group.clusterType`;
3. resolve each notable name to an exact eligible catalog mod ID;
4. require unique resolution;
5. if ambiguous or unavailable, show a handoff error instead of picking an arbitrary modifier.

No string-to-ID guess may alter target identity silently.

## 9.4 Passive-count handling

The Cluster Jewels combo can represent a range such as:

```text
4–5 passives
```

while the optimizer requires one exact passive count.

If the source range has one value, populate it directly.

If it spans multiple values, do not silently choose a different SKU. Use a compact handoff choice:

```text
Optimize Eldritch Inspiration + Low Tolerance
Passive count: [4] [5]
Item level: [84 editable]
```

Default selection may follow an existing documented `pinnedPassives(...)` rule only when the UI clearly shows the selected value before launching.

## 9.5 Item-level handling

Do not infer an exact market item level if the source combo does not contain one.

Options in preference order:

1. if the source data identifies one exact observed item level for the selected row, use it;
2. if multiple observed item levels exist, present the value visibly and editable;
3. otherwise use the optimizer's normal default (currently 84) with a notice:

```text
Item level defaulted to 84; edit before searching if you are targeting a different base.
```

## 9.6 Pricing league

Populate the optimizer pricing league from the Cluster Jewels tab's active league when supported.

If unsupported, preserve the optimizer's current league and show a non-blocking warning rather than silently changing price context.

## 9.7 Optional expected-sale-value handoff

When the exact combo row has a valid current `PriceEntry` and rate conversion, allow the handoff to prefill:

```text
Expected sale value
```

using the same quote the user clicked.

Requirements:

- preserve low/median provenance;
- preserve timestamp;
- indicate if the quote spans a passive range;
- never treat a range quote as an exact single-passive market value without disclosure;
- never use unknown/unpriced value as zero;
- market value affects profit display only, not crafting mechanics.

## 9.8 Preserve user's optimizer state intentionally

When launching from Cluster Jewels, target/base fields should be replaced by the new seed.

Do not unexpectedly retain old target modifiers from a prior optimizer session.

Preserve only explicit user preferences that are not part of the craft identity, such as preferred objective/Advanced visibility, if safe.

## 9.9 Back navigation / source context

Show a small source banner after handoff:

```text
Loaded from Cluster Jewels
Eldritch Inspiration + Low Tolerance · Medium Chaos DoT · 5 passives
[Back to Cluster Jewels]
```

No automatic search is required on handoff; populate first, let the user review, then run.

---

# 10. Track F — Trade/Optimizer Profit Workflow

Once the handoff exists, add a small market-vs-craft summary when both values are trustworthy:

```text
Completed market low: 1329c
Expected craft EV:     599c
Gross EV spread:       +730c
```

Only show it when:

- the market quote matches the selected base/enchantment/passive filter contract;
- the optimizer result is executable;
- price provenance is available.

Always label:

```text
expected value, not guaranteed profit
```

Do not calculate a spread across mismatched passive ranges without a warning.

---

# 11. Track G — Signed Tradeoff Explanations

The field objective runs show a UX issue where a negative time saving can collapse to:

```text
MANUAL TIME SAVED 0s
```

Example under the current Fewest-Actions objective:

```text
Conventional ~296.9s
Harvest      ~413.7s
```

Harvest saves actions but is slower.

Use signed labels:

```text
Actions saved: 534
Time difference: +116.8s slower
```

or:

```text
Time saved: 187s
```

as appropriate.

Never clamp a meaningful negative tradeoff to zero without explaining the direction.

---

# 12. Autonomous Overnight Execution Protocol

The implementation LLM is authorized to work through this phase with minimal supervision.

It should not stop after the first code change or first passing focused test.

## 12.1 Start-of-run protocol

1. `git fetch origin`.
2. Pull/rebase current `main` without discarding unrelated user commits.
3. Confirm latest baseline, including `cd066d4...` or any newer user changes.
4. Read this document completely.
5. Read the Phase 2V completion report and `PATH_TO_SUCCESS.md` where relevant.
6. Run a clean baseline build/lint/diff and focused reproduction before editing.
7. Preserve copies of pre-fix browser evidence for the field bugs.

## 12.2 Reproduce before fixing

Create real Playwright fixtures for:

- Eldritch Inspiration + Low Tolerance canonical mismatch;
- Armour + Evasion Cheapest;
- Armour + Evasion Fewest @600;
- Armour + Evasion Fastest @600;
- 500c ceiling behavior;
- Cluster Jewels → Optimizer handoff.

A fix is not complete unless the previously failing assertions are observed failing before the implementation or otherwise demonstrated from immutable supplied evidence.

## 12.3 Iterative repair loop

Repeat until all completion gates pass:

```text
inspect failing evidence
→ identify root cause
→ add/strengthen deterministic diagnostic or real-browser assertion
→ make the smallest generic implementation fix
→ run focused gate
→ inspect DOM + Worker + screenshot/result differential
→ run related mature regressions
→ review diff for accidental scope expansion
→ continue to next failure
```

Do not merely update screenshots or expected values to match broken behavior.

## 12.4 Autonomous bug fixing within scope

If Playwright, diagnostics, screenshot inspection, console output, Worker events, or code review reveal another clear bug in:

- selected-route consistency;
- objective selection;
- method-family integration;
- cost ceilings;
- result presentation;
- Cluster Jewels handoff;
- share/import/export;
- Constellation selected-route semantics;
- accessibility/responsive behavior;
- release harness correctness;

fix it during the same run and add a regression gate.

Record every unplanned bug and fix in the completion report.

## 12.5 Do not autonomously invent mechanics

Stop and document a blocker rather than guessing if a discovered issue requires:

- a new Path of Exile mechanic assumption;
- changing probability formulas without source evidence;
- unsupported Crafting Bench behavior;
- new market-fractured ranking;
- weakening exact state identity;
- fabricating missing market prices.

The LLM may continue all other independent work before stopping for that blocker.

## 12.6 Do not game the harness

Forbidden shortcuts:

- raising budgets solely until a test happens to pass;
- loosening numeric tolerances without evidence;
- removing a failing browser gate;
- changing fixture targets to an easier craft;
- hiding reconciliation errors;
- converting errors to warnings just to deploy;
- hardcoding the known expected winner;
- special-casing `Eldritch Inspiration`, `Low Tolerance`, `Armour`, or `Evasion` in solver logic.

## 12.7 Checkpoint commits

For a long overnight run, checkpoint after coherent milestones:

```text
1. canonical policy binding + regression
2. objective-aware selection + objective matrix
3. Cluster Jewels handoff
4. autonomous bug sweep / release evidence
5. completion report
```

Before each push:

- fetch latest `origin/main`;
- preserve unrelated newer commits;
- resolve conflicts without discarding user data snapshots;
- run the focused gates for the affected milestone.

Do not force-push over unrelated main changes.

## 12.8 Final self-review

Before declaring completion:

1. inspect the entire Phase 2W diff;
2. run static search for prohibited target-specific branches;
3. inspect all new/changed assertions for false positives;
4. inspect representative screenshots visually;
5. compare Worker RESULT vs visible DOM vs export for every frozen Phase 2W fixture;
6. run the full local release matrix;
7. run a second review pass after tests pass;
8. fix issues found in review and repeat affected gates;
9. verify clean worktree and `origin/main` agreement;
10. write the completion report only after final evidence exists.

---

# 13. Quality Lab Expansion — Dynamic Bug Discovery

Keep the harness outside production project source as already established under `quality-lab/`.

## 13.1 Add canonical-result oracle

For every executable browser result, automatically compare:

```text
Worker recommended route
Worker expected cost
Worker full-route usage
PROGRESS COMPLETE U
DOM Craft Recommendation
DOM selected Pareto card
DOM selected Method card
Expected-material summed cost
Export JSON
Share/reload result
```

Any material disagreement fails the scenario.

This should have caught the 599c/7243c bug automatically.

## 13.2 Add objective oracle

Given a set of resolved method-policy vectors and a normalized objective:

- independently calculate the eligible winner in the Quality Lab;
- compare to the app's selected recommendation;
- do not import the app's selector implementation as the oracle.

For cost-ceiling objectives, independently reject `U > ceiling`.

## 13.3 Boundary-generated ceilings

For each resolved method set, dynamically test ceilings around route costs:

```text
U - epsilon
U
U + epsilon
```

This discovers off-by-one/tolerance and eligibility bugs without fixture-specific hardcoded winners.

## 13.4 Cluster-data-generated UI scenarios

Use the committed league snapshot to generate real UI handoff tests:

1. choose several groups across Small/Medium/Large;
2. choose popular notable combos;
3. click Optimize this combo;
4. verify base, cluster type, passive choice, target IDs, and league;
5. run at least a bounded cheap smoke where practical;
6. share/export/reload and verify identity.

Bias selection toward:

- 1 notable;
- 2 notables;
- 3 notables;
- passive ranges rather than exact count;
- notable names that could collide;
- unpriced combos;
- stale-priced combos.

## 13.5 Generated target-order metamorphic test

For a fixed exact target set, permute input order.

Acceptance:

- target identity unchanged;
- eligible action set unchanged;
- selected objective economics equivalent within tolerance;
- no route-name/order artifact changes winner incorrectly.

## 13.6 Objective-change reuse test

A → B → A objective changes:

```text
Cheapest → Fewest @ ceiling → Cheapest
```

may reuse mechanics transition distributions but must recover objective-specific Bellman/policy state correctly.

Assert:

- no stale policy selected from previous objective;
- returned A result is equivalent to prior A;
- objective-specific selected route/plan changes when expected.

## 13.7 Randomized but reproducible seed

Nightly/local extended QA may generate a bounded random matrix from committed catalog/snapshot data.

Always record:

```text
seed
app commit
fixture inputs
prices
objective
budgets
browser version
```

A failure must be replayable exactly.

---

# 14. Required Phase 2W Diagnostics and Gates

## W1 — Phase 2V preservation

Run all mature diagnostics and Phase 2T/2U/2V gates.

No regression in:

- repeatable Harvest quotient;
- scroll ownership;
- player labels;
- Constellation chronology;
- full-route accounting;
- self-fracture mechanics;
- Worker protocol.

## W2 — Eldritch canonical mismatch reproduction/fix

Before/after evidence for the exact 6-passive fixture.

Final acceptance:

```text
selected route identity agrees across every public/Worker/export surface
full-route reconciliation <= tolerance
```

## W3 — Selected-policy action evidence

For the Eldritch clean-route result, assert no selected Fracturing Orb usage or fracture instruction unless self-fracture truly wins in that final run.

## W4 — Final Progress/Result differential

`PROGRESS: COMPLETE` and `RESULT` agree on selected route, U, objective, and policy source.

## W5 — Armour + Evasion Cheapest

Preserve the cost-minimizing behavior and resolved Harvest comparison.

## W6 — Armour + Evasion Fewest @600

App top recommendation equals independent eligible min-action policy.

Current expected winner: Harvest.

## W7 — Armour + Evasion Fastest @600

App top recommendation equals independent eligible min-time policy.

Current expected winner: Conventional.

## W8 — 500c ceiling

Harvest cannot be selected above ceiling.

Current expected action/time winner: Conventional if the resolved vectors remain equivalent.

## W9 — Dynamic ceiling boundaries

Run generated just-below/at/just-above ceilings for at least Open, Conventional, and Harvest.

## W10 — Objective proof truthfulness

Never emit `CONSTRAINED_OPTIMAL_PROVEN` while a resolved eligible policy beats the selected route in the requested objective.

## W11 — Objective-aware acquisition pruning

Construct a controlled fixture where a route is more expensive than the cheapest incumbent but below the cost ceiling and better in actions/time.

It must not be pruned by raw chaos comparison.

## W12 — Unified Pareto set

Every default-visible resolved policy is non-dominated across the final unified candidate set.

Method-family policies must participate.

## W13 — Signed tradeoff copy

Verify slower/faster and more/fewer directions rather than zero-clamped misleading deltas.

## W14 — Cluster group handoff

From Cluster Jewels group-level action:

- switches tab;
- base/enchantment exact;
- targets empty unless chosen;
- league carried;
- no automatic search.

## W15 — Cluster notable-combo handoff

For at least three real snapshot combos:

- exact target IDs resolve;
- correct base/enchantment;
- passive count/range handled visibly;
- item-level default/provenance visible;
- old optimizer targets cleared.

## W16 — Eldritch market SKU handoff

Use the Cluster Jewels representation of Eldritch Inspiration + Low Tolerance when present.

Acceptance:

- if combo is 4–5 passive, user must choose 4 or 5 before exact optimizer search;
- it must not silently become 6 passives;
- market quote provenance survives handoff.

## W17 — Optional sale-value economics

Where an exact compatible market quote exists:

- expected sale value populated with provenance;
- profit/spread math reconciles;
- stale/range warnings visible;
- no unknown price invented.

## W18 — Share/import after handoff

Handoff → export/share → reload retains exact base, enchantment, passives, targets, objective, price context, and expected-sale provenance as supported by schema.

## W19 — Responsive/accessibility

Real Playwright at 390px and desktop:

- Optimize this combo button keyboard accessible;
- passive-range chooser keyboard accessible;
- focus lands intentionally after tab switch without scrolling unexpectedly;
- no horizontal overflow;
- no raw mod IDs exposed publicly.

## W20 — Autonomous generated QA

Run a reproducible bounded generated matrix from the current committed cluster snapshot.

Any discovered real bug in Phase 2W scope must be fixed and converted into a regression gate before completion.

## W21 — Performance

Measure:

- Cheapest default latency before/after;
- Fewest/Fastest family-resolution latency;
- transition reuse across objective changes;
- handoff render latency;
- Worker/session memory.

Do not make Cheapest materially slower merely to precompute comparison families the user did not request.

## W22 — Build/release hygiene

Required local final commands:

```text
npm run build
npm run lint
git diff --check
npm run diagnostic:mature
npm run lab:no-fallback-probe
npm run lab:release
npm run diagnostic:phase2t
npm run diagnostic:phase2u
npm run diagnostic:phase2v
npm run diagnostic:phase2w
```

Keep the hosted Pages path lean unless the user changes that policy.

Add/update the committed-evidence audit for Phase 2W.

Unit tests added/run: **NO**.

---

# 15. Completion Gates

Phase 2W closes only when:

- Phase 2V remains passing;
- no selected route can be paired with another policy's action usage;
- Eldritch 599-vs-7243 class of mismatch is impossible by invariant;
- large reconciliation mismatch fails closed;
- final Progress, Worker Result, DOM, expected materials, Pareto, method card, share/export all agree;
- main Open/acquisition searches honor the requested objective;
- cost-only dominance is not used incorrectly for action/time objectives;
- independently resolved method-family policies participate in final objective selection;
- Fewest @600 selects the true resolved eligible fewest-action policy;
- Fastest @600 selects the true resolved eligible fastest policy;
- cost ceilings are enforced using executable U;
- proof language does not overclaim constrained optimality;
- public Pareto badges agree with the final candidate set;
- signed tradeoff copy is directionally correct;
- Cluster Jewels can hand a base/combo to the Craft Optimizer;
- passive-range ambiguity is explicit rather than silently changed;
- optional market sale value keeps provenance and does not affect mechanics;
- generated Playwright cluster/objective scenarios pass;
- autonomous self-review finds no unresolved P0/P1 issue within this scope;
- build/lint/diff/no-fallback/full local release gates pass;
- no mechanics probabilities changed without evidence;
- no exact state identity weakened;
- no pre-fractured market ranking restored;
- no target-specific route winner hardcoded;
- no unit tests added or run.

---

# 16. Required Completion Report

Create:

```text
docs/crafting-engine/PHASE2W_CANONICAL_SELECTION_OBJECTIVE_INTEGRATION_CLUSTER_HANDOFF_COMPLETION_REPORT.md
```

Include at minimum:

1. final implementation commit(s);
2. all files changed;
3. any newer user commits merged/preserved;
4. Phase 2V preservation matrix;
5. Eldritch bug root cause;
6. before/after Eldritch cross-surface values;
7. canonical selected-policy bundle contract;
8. fail-closed reconciliation contract;
9. every search path audited for objective propagation;
10. objective-aware acquisition pruning rules;
11. final unified candidate/Pareto architecture;
12. objective proof semantics;
13. Armour + Evasion Cheapest result;
14. Armour + Evasion Fewest @600 result;
15. Armour + Evasion Fastest @600 result;
16. 500c result;
17. dynamic ceiling-boundary matrix;
18. Lifeforce crossover preservation;
19. signed tradeoff examples;
20. Cluster Jewels handoff type/API;
21. group-level handoff evidence;
22. notable-combo handoff evidence;
23. passive-range selection evidence;
24. exact target-ID resolution evidence;
25. market sale-value provenance behavior;
26. share/import handoff round trip;
27. generated cluster-data QA seed and results;
28. unexpected bugs found autonomously and fixes made;
29. Quality Lab canonical-result oracle evidence;
30. Quality Lab objective oracle evidence;
31. desktop/mobile/accessibility evidence;
32. performance before/after;
33. memory/session/reuse evidence;
34. local full release command results;
35. hosted lean evidence/deploy result;
36. final release label/version;
37. worktree/origin status;
38. unit tests added/run: expected NO;
39. mechanics probabilities changed: expected NO unless separately documented and externally justified;
40. hardcoded winner/target branch added: expected NO;
41. remaining known limitations.

---

# 17. Overnight Stop Conditions

The LLM should continue without asking for routine confirmation until all feasible Phase 2W work is complete.

It may stop for user input only when one of these is true:

1. a required mechanic is genuinely unknown and would require inventing game behavior;
2. credentials or an external service unavailable to the agent are required;
3. a destructive repository/data operation is necessary and not already authorized;
4. live `main` has conflicting concurrent changes that cannot be safely reconciled without choosing which user's work to discard;
5. all implementation, QA, review, documentation, commit, push, and deployment work is complete.

A failing Playwright gate, lint error, build error, unexpected screenshot, incorrect objective winner, or newly found ordinary application bug is **not** a reason to stop. Diagnose it, fix it generically, add evidence, and keep going.

---

# Final Phase 2W Principle

> **A recommendation is one policy, not a route name stitched to whichever solver result happens to be in scope. Every cost, action count, instruction, proof claim, Pareto badge, and visualization must belong to that same policy. Once multiple policies are resolved, the user's chosen objective—not the cheapest-policy shortcut—decides which one is recommended.**
