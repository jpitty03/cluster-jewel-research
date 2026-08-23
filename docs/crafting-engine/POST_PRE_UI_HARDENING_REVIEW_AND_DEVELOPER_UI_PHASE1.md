# Post Pre-UI Hardening Review and Developer UI Phase 1 Plan

## Review Scope

This review covers `main` at:

- `646a37a75fa2355ec9175c4de2ac5e41c7bbd183` — `feat: finish pre-ui search hardening`

Primary implementation/output reviewed:

- `crafting-engine/src/domain/ItemState.ts`
- `crafting-engine/src/domain/TargetDefinition.ts`
- `crafting-engine/src/rules/actionDiscovery.ts`
- `crafting-engine/src/rules/actionRegistry.ts`
- `crafting-engine/src/rules/harvestCrafts.ts`
- `crafting-engine/src/solver/genericSearch.ts`
- `crafting-engine/src/solver/strategyDiscovery.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/scripts/preUiHardeningDiagnostic.ts`
- `output-pre-ui-hardening.txt`
- `output-craft-a-review.txt`
- `output-craft-c-review.txt`

This document is the source of truth for the next implementation pass.

---

# Executive Verdict

## Backend architecture gate

**PASS to begin thin Developer UI Phase 1.**

This does **not** mean the optimizer is production-complete or globally optimal for arbitrary targets.

The pre-UI hardening phase successfully closed the major backend architecture gates from the previous plan:

- mechanics-relevant state flags now participate in identity;
- fracture representation is normalized with `RolledMod.isFractured` authoritative;
- target requirements have a shared flattening helper;
- acquisition/reacquisition is represented as Bellman actions;
- multiple acquisition methods can share one physical downstream state;
- Harvest is now a shared executable action family;
- search budgets and proof-aware lazy expansion exist;
- a real full-pool two-mod target produces a fully resolved, proper, absorbing, cost-reconciled selected policy;
- the optimizer has a serializable service result;
- Craft A and Craft C remain stable.

The next phase should therefore **start the UI**, but it must begin with a small integration-hardening layer because the current service is not yet browser-runtime-ready and its policy/result presentation is not rich enough for a useful UI.

The correct next milestone is:

> **Developer UI Phase 1 — worker-backed optimizer integration with proof-honest result rendering.**

---

# What Passed From the Pre-UI Hardening Phase

## 1. State identity and fracture normalization

The runtime diagnostic now proves:

```text
influenced key differs from ordinary: YES
synthesised key differs from ordinary: YES
Fracturing legality ordinary/influenced/synthesised: true/false/false
physical signature respects influenced flag: YES
contradictory fracture input normalized: authoritative flag=YES
```

This materially improves Bellman state-equivalence safety.

Keep `RolledMod.isFractured` authoritative.

Do not reintroduce dual fracture semantics.

## 2. Acquisition portfolio

The solver can now expose more than one acquisition method/destination through Bellman actions and reuse a shared physical state where methods converge.

This is the correct direction for failure/restart economics.

## 3. Shared Harvest

Harvest now has:

- shared legality;
- price provenance;
- analytical transitions;
- seeded sampled transitions;
- fractured-mod preservation;
- Bellman-searchable mechanics;
- explicit `APPROXIMATE / EXTERNALLY CLOSE` mechanics confidence.

The known external compound-Harvest difference remains non-blocking:

```text
Craft of Exile: ~0.122529% (~1 / 816.1)
Current engine approximation: ~0.146% (~1 / 685)
```

Do not tune the shared mechanic to the external observation without identifying the actual game rule.

## 4. Full-pool two-mod smoke test

The real 72-mod pool now produces a valid selected policy for:

```text
Rare T1 Intelligence + T1 Maximum Energy Shield
```

Current diagnostic:

```text
states expanded:                    3000
cumulative expansion work:          6000
elapsed:                             ~5.7s
on-policy states:                    107
on-policy unresolved probability:   0%
terminal absorption:                 ~100%
Bellman convergence:                 YES
occupancy convergence:               YES
EV reconciliation:                   <0.001c
selected policy:                     FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED
proof:                               BEST FULLY RESOLVED POLICY FOUND
GLOBAL OPTIMALITY:                   NOT YET PROVEN
competitive unresolved candidates:  39
```

This is enough to support a developer-facing UI as long as the proof limitation is displayed prominently.

## 5. Craft B fails honestly

The real-pool Craft B search does not manufacture a cost when no fully resolved route is found inside the search budget.

Current result:

```text
NO FULLY RESOLVED POLICY FOUND
unresolved on-policy probability: 100%
GLOBAL OPTIMALITY: NOT YET PROVEN
```

That is correct behavior.

The UI must preserve this distinction instead of converting it into an error or fake recommendation.

## 6. A/C regressions remain healthy

Current references remain:

### Craft A

```text
Analytical: 7623.7c
Pooled MC:  7568.1c
Difference: ~-0.73%
Completion: 100%
Timeouts: 0
Fallbacks: 0
Missing states: 0
```

### Craft C

```text
Analytical: 42814.4c
Pooled MC:  42483.5c
Difference: ~-0.77%
Completion: ~99.95–100%
Timeouts: 1 / 10,000
Fallbacks: 0
Missing states: 0
```

Preserve these as regression fixtures.

---

# Findings Before Wiring React Directly To The Optimizer

# Finding 1 — The Optimizer Service Is Serializable, But Not Yet Browser-Runtime-Safe

## Severity

**HIGH — first UI integration task**

`OptimizerService` constructs or imports `ClusterModRepository` from:

```text
crafting-engine/src/data/loadClusterMods.ts
```

That module imports:

```ts
node:fs
node:path
node:url
```

and its default constructor reads:

```text
/data/poedb-cluster-mods.json
```

The repository's root `/data/` directory is intentionally ignored working state.

The browser application instead bundles the committed snapshot:

```text
src/data/poedb-cluster-mods.json
```

The current root build passing does **not** prove that importing `OptimizerService` into the browser bundle works, because the React application does not import the optimizer service yet.

## Required fix

Split data representation from Node-only loading.

Preferred shape:

```text
Browser-safe ClusterModRepository
    accepts RawClusterData

Node-only loader/factory
    reads working data with node:fs

Browser factory
    imports src/data/poedb-cluster-mods.json
    creates ClusterModRepository(rawData)
```

Do not make React components know how to interpret raw PoEDB structures.

One authoritative repository/parser implementation should serve both environments.

Also make Node diagnostics fall back to the committed snapshot when root `/data/` is absent, or otherwise fail with a clear message.

A fresh clone should not require invisible untracked files merely to instantiate the engine against committed data.

---

# Finding 2 — `optimize()` Is Synchronous And Must Not Run On The React Main Thread

## Severity

**HIGH — UI responsiveness**

Current measured full-pool solves are already long enough to freeze a browser UI:

```text
two-mod smoke: ~5.7 seconds
Craft B budgeted run: ~8.2 seconds
service default wall budget: up to 30 seconds
```

`OptimizerService.optimize()` is synchronous.

Calling it from a React click handler would block:

- input rendering;
- spinner animation;
- cancellation;
- scrolling;
- browser responsiveness.

## Required architecture

Run the optimizer in a **Web Worker**.

Suggested message contract:

```ts
type OptimizerWorkerRequest = {
  requestId: string;
  input: OptimizeCraftInput;
};

type OptimizerWorkerResponse =
  | { requestId: string; type: 'result'; result: OptimizeCraftResult }
  | { requestId: string; type: 'error'; message: string };
```

Use Vite's worker support.

The worker should:

- initialize the browser-safe repository once;
- reuse repository/mod-pool caches across requests where safe;
- receive only serializable input;
- return only serializable output.

For Phase 1, cancellation may be implemented by terminating/recreating the worker.

Do not build a complicated cooperative cancellation system unless it is actually needed.

A simple:

```text
Optimize
Cancel
```

flow is sufficient.

---

# Finding 3 — `policyRules` Does Not Yet Represent The Actual Branching Policy

## Severity

**HIGH — result correctness/presentation**

The service currently builds:

```ts
policyRules = result.steps.map(...)
```

But `GenericSearchResult.steps` is still a small representative diagnostic containing only examples such as:

- start state;
- one-prefix magic state;
- two-affix magic state.

It is **not the complete on-policy policy**.

For a real multi-stage route this omits potentially important rules involving:

- Regal;
- Scour;
- Harvest;
- Annul;
- Exalt;
- Fracturing;
- restart/reacquisition;
- rare-state recovery branches.

The UI cannot truthfully show "Crafting steps" from the current `policyRules` field.

## Required fix

Create a serializable **on-policy rule summary** derived from the actual selected policy graph.

Do not expose the raw internal `Map`.

A useful rule shape is:

```ts
interface PolicyRule {
  stateDescription: string;
  selectedAction: string;
  selectedActionId: string;
  expectedVisits?: number;
  totalCostChaos: number | null;
  candidates: SerializableCandidateQValue[];
}
```

Prefer ordering by expected visit mass/frequency so the UI shows the most important rules first.

If the complete on-policy graph has many states, group mechanically equivalent presentation rules rather than dumping hundreds of nearly identical rows.

Keep the current representative diagnostic `steps` if useful for console output, but do not use it as the UI policy contract.

---

# Finding 4 — `recommended` Must Not Be Presented As "Cheapest" When Better Unresolved Routes May Exist

## Severity

**HIGH — user-facing truthfulness**

The full-pool two-mod result currently selects:

```text
self-fractured T1 Energy Shield
~1540.159c
```

as the best fully resolved route.

But the same result also reports:

```text
39 competitive unresolved candidates
clean-base acquisition: UNRESOLVED
clean-base lower bound: 10c
GLOBAL OPTIMALITY: NOT YET PROVEN
```

Therefore the result is **not proven to be the globally cheapest modeled route**.

The service may still return a `recommended` route because its selected policy is fully resolved.

That is acceptable internally, but the UI must distinguish:

```text
PROVEN OPTIMAL
```

from:

```text
BEST RESOLVED ROUTE FOUND
UNRESOLVED ROUTES MAY BE CHEAPER
```

## Required service improvement

Add an explicit recommendation status, for example:

```ts
type RecommendationStatus =
  | 'PROVEN_OPTIMAL'
  | 'BEST_RESOLVED'
  | 'NO_RESOLVED_ROUTE';
```

The existing `recommended` field may remain for compatibility, but UI copy must derive from this status/proof object.

Never display "Cheapest route" unless the corresponding action/state scope was actually proven optimal.

---

# Finding 5 — Self-Fracture Acquisition Is Still An Approximate Shortcut

## Severity

**MEDIUM-HIGH — result interpretation**

`generateStartingStateCandidates()` still calculates a self-fracture acquisition cost using an approximate preparation formula and then transitions directly to the post-Scour fractured physical state.

That route is labeled approximate/research-fallback, which is good.

But shared Transmute/Alteration/Augmentation/Regal/Exalt/Fracturing/Scour/restart mechanics now exist, so this approximate acquisition should not be confused with a fully mechanics-derived crafting policy.

This matters because the current full-pool best resolved route is one of these approximate self-fracture acquisitions.

## Phase 1 requirement

Do **not** block the UI on replacing this model.

Instead:

- preserve the approximate acquisition method;
- expose its model confidence clearly;
- label it `Approximate self-fracture acquisition estimate` in the UI;
- do not fabricate detailed prep steps for it;
- keep it distinct from a Bellman-discovered self-fracture route.

A later backend pass can replace the shortcut with a fully searched acquisition policy once full-pool search scalability improves.

---

# Finding 6 — Confidence Warnings Need Selected-Policy Scope

## Severity

**MEDIUM — UI clarity**

Current confidence output can include warnings for actions or acquisition alternatives that were considered but not selected.

For example, the full-pool two-mod run reports the Harvest approximation warning even though:

```text
generic Harvest on-policy selections: 0
```

That is useful search-space information, but it is not the same as saying the selected route itself uses approximate Harvest mechanics.

Similarly, portfolio warnings can include unselected acquisition methods.

## Required refinement

Expose confidence in two scopes:

```text
Selected policy / selected acquisition confidence
Considered search-space / alternative confidence
```

At minimum, the UI must be able to answer:

```text
Does my selected route itself depend on approximate mechanics/prices?
```

separately from:

```text
Were approximate alternatives considered?
```

Do not remove the broader warnings; classify them.

---

# Finding 7 — Expected Action Reporting Should Be More Detailed Than `reacquisition`

## Severity

**MEDIUM**

Expected currency counts currently collapse every acquisition portfolio action into:

```text
reacquisition
```

That is sufficient for EV reconciliation, but not for explaining a branching strategy.

A future policy could sometimes:

- reacquire clean;
- sometimes buy a fractured Int base;
- sometimes restart to another physical state.

The UI needs to know which actions are expected, not only the generic count `reacquisition`.

## Required refinement

Add a serializable expected-action summary such as:

```ts
interface ExpectedActionUsage {
  actionId: string;
  actionName: string;
  expectedCount: number;
  expectedCostChaos: number;
}
```

Keep `expectedCurrencies` as a convenience summary.

Use expected action usage to build the route/crafting summary.

---

# Finding 8 — Full-Pool Search Scalability Remains An Open Backend Problem, But It No Longer Blocks Developer UI

## Severity

**ONGOING**

The current lazy search is proof-aware and significantly safer than full blind enumeration.

However, the diagnostic still shows large branching:

### Two-mod target

```text
3,000 final states
6,000 cumulative expansion work
~11.1 million unresolved graph edges reported
39 competitive unresolved candidates
```

### Craft B

```text
3,000 states
~8.2 seconds
~12.0 million unresolved graph edges reported
no resolved incumbent
```

The current expansion rounds rebuild the graph with a larger/prioritized budget rather than incrementally extending one persistent graph.

That is acceptable for now, but it duplicates work.

## UI implication

Developer UI should become the real performance harness.

It must show:

- elapsed search time;
- state budget;
- round budget;
- proof level;
- unresolved competitor count;
- budget exhaustion.

A "no resolved route within budget" result is valid and must render cleanly.

Do not add Craft-B-specific shortcuts.

Do not hide the fact that the search budget ended.

Persistent incremental graph extension can be a later optimization after UI measurements identify where it is worth the complexity.

---

# Finding 9 — Shared Harvest Still Needs One Full-Pool On-Policy Proof Fixture

## Severity

**MEDIUM**

Shared Harvest is executable and included in the full-pool action set.

But the current full-pool two-mod smoke test reports:

```text
Harvest on-policy selections: 0
```

The dedicated Harvest transition diagnostic is useful, but it does not yet prove that a production-sized full pool can select Harvest as part of a generic Bellman policy.

## Required validation

Add one **full real pool** representative search/state diagnostic where Harvest is expected to be competitive.

This does not need to start from a clean base if that makes the graph unnecessarily huge.

A representative fractured/rare state is acceptable.

Prove that the generic solver can compare:

```text
Harvest
vs
Exalt
vs
Annul
vs
Scour
vs
reacquisition
```

and select Harvest when its EV is lowest.

Do not create a Craft-specific solver branch.

---

# Finding 10 — Production Price Policy Should Be Explicit In The Service Contract

## Severity

**MEDIUM**

The generic solver supports excluding research-fallback prices, but `OptimizeCraftInput` does not currently expose that choice.

The service therefore defaults to allowing fallback prices.

That is useful for a developer UI because otherwise many current routes would be unavailable.

But it should be explicit.

## Required change

Add a service input such as:

```ts
allowResearchFallbackPrices?: boolean
```

Developer UI Phase 1 may default this to `true`, but must display fallback warnings.

Future production UI can choose a stricter default when real market/currency price feeds cover the required action set.

---

# Next Phase

## Phase Name

**Developer UI Phase 1 — Worker-Backed Optimizer Integration**

This phase should build a thin functional UI over the generic service.

It is intentionally a developer/operator UI, not the final polished product.

The purpose is to:

1. prove the engine can run safely in the browser;
2. make arbitrary 1–4-mod requests without editing scripts;
3. surface proof/confidence/search limitations honestly;
4. turn real interactive usage into the next source of optimizer-performance feedback.

---

# Phase Implementation Order

## Step 1 — Make the engine browser-safe

Split Node-only file loading from the browser-safe mod repository/parser.

Use the committed:

```text
src/data/poedb-cluster-mods.json
```

for browser execution.

Requirements:

- no `node:fs`, `node:path`, or `node:url` dependency in browser-executed optimizer code;
- one parser/repository implementation shared between Node and browser;
- Node diagnostics continue working;
- fresh-clone committed-data fallback works;
- `npm run build` passes after the actual React app imports the optimizer integration.

This last point matters: build validation must include the real browser integration, not merely compile an unused service file.

## Step 2 — Add worker execution

Add a Vite Web Worker wrapper for `OptimizerService`.

Requirements:

- typed request/result protocol;
- request IDs;
- Optimize button;
- Cancel button;
- no synchronous optimizer work on the React main thread;
- clean worker recreation after cancellation/error;
- result/error state returned to React.

Progress callbacks are optional in Phase 1.

A spinner/status line plus elapsed time is enough.

## Step 3 — Finish the service contract for UI semantics

Before rendering results, add:

- explicit `RecommendationStatus`;
- real on-policy policy summaries rather than `result.steps` only;
- expected action usage;
- selected-policy vs considered-search-space confidence scopes;
- `allowResearchFallbackPrices` input;
- clear approximate acquisition confidence.

Keep all output JSON-serializable.

No raw `Map` fields.

## Step 4 — Add a browser-safe crafting catalog

React should not manually reverse-engineer raw PoEDB JSON.

Expose catalog helpers/service for:

```text
base types
cluster types/enchantments
valid passive counts
eligible mods for selected base/cluster/ilvl
mod display name
tier
gen type
mod id/group
```

The target selector should produce exact `modId`-based requirements where practical.

For Phase 1, support **1–4 exact desired mods**.

Do not expose final roll-range editing yet unless the existing target semantics are explicitly validated for it.

## Step 5 — Add a separate Craft Optimizer tab

Preserve the existing:

```text
Cluster Jewels
Characters
```

views.

Add a third thin tab such as:

```text
Craft Optimizer
```

Suggested initial form:

```text
Base Type        [ Large Cluster Jewel      v ]
Cluster Type     [ ...                      v ]
Item Level       [ 84                         ]
Passive Count    [ 12                         ]

Desired Mods
1. [ Search/select exact mod                 ]
2. [ Search/select exact mod                 ]
3. [ Search/select exact mod                 ]
4. [ Search/select exact mod                 ]

[ Optimize ] [ Cancel ]
```

Only display mod slots the user adds; do not force all four.

Validate:

- at least one mod;
- no duplicate exact mod;
- mod ilvl compatibility;
- base/cluster compatibility.

Do not put crafting logic in React components.

## Step 6 — Render proof-honest result cards

The primary result header must use one of these concepts:

### Proven

```text
Optimal over modeled action/state space
```

### Best resolved

```text
Best resolved route found
Unresolved routes may still be cheaper
```

### Unresolved

```text
No fully resolved route found within this search budget
```

Do not use one generic "Recommended / Cheapest" label for all three.

Show:

- acquisition method;
- expected total cost;
- expected action/currency counts;
- representative/on-policy policy rules;
- alternative acquisition routes;
- proof level;
- search-budget usage;
- price confidence;
- mechanics confidence;
- warnings.

Approximate self-fracture acquisition must visibly say it is approximate.

## Step 7 — Handle budget exhaustion as a normal UI state

When a search ends with unresolved competitors, show:

```text
Search budget exhausted
Best resolved route shown
39 unresolved competitors may still be cheaper
```

When no resolved route exists, show:

```text
No fully resolved route found within current budget
```

Do not treat these as crashes.

For the developer UI, expose the three budget controls under an Advanced section:

```text
maxStates
maxWallTimeMs
maxExpansionRounds
```

Use the service defaults initially.

Do not invent unexplained "fast/accurate" presets yet.

## Step 8 — Add the full-pool Harvest-selected diagnostic

Use the complete real mod pool.

Show one state/target where shared Harvest participates on policy and report:

- Harvest tag;
- candidate Q-values;
- selected action;
- mechanics confidence;
- on-policy state count;
- EV reconciliation.

Keep the external ~19% compound-Harvest bias warning non-blocking.

## Step 9 — Browser integration validation

Run:

```text
npm run build
```

Then manually validate the built/dev browser flow for at least:

1. a one-mod target that resolves quickly;
2. the full-pool two-mod T1 Int + T1 ES target;
3. a target that exhausts budget / has unresolved competitors;
4. cancellation while a longer search is running;
5. a result with fallback price warnings;
6. a result with mechanics-confidence warnings.

Record a concise UI-phase runtime diagnostic/output file.

## Step 10 — Re-run A/C regressions

The UI/browser refactor must not change the mature backend regressions.

Keep current A/C guardrails.

---

# Developer UI Phase 1 Non-Goals

Do not implement in this phase:

- polished final visual design;
- mobile-first redesign;
- Allflame mechanics;
- fossils;
- essences;
- metamods;
- every Harvest craft family beyond what is already modeled;
- production market-price automation for every currency/base;
- Craft-B-specific search hacks;
- separate 1/2/3/4-mod solvers;
- unit tests.

The UI should be intentionally thin and diagnostic-friendly.

---

# UX Rules For Phase 1

## 1. Never overstate proof

If:

```text
GLOBAL OPTIMALITY: NOT YET PROVEN
```

then the visible UI must not say:

```text
Cheapest possible craft
```

Use:

```text
Best resolved route found
```

## 2. Keep confidence visible

A route using research prices or approximate mechanics should not look identical to a fully known route.

Simple text/badges are enough.

## 3. Keep search status visible

Display:

- running/cancel state;
- elapsed time;
- states expanded;
- budget exhausted or not;
- proof level.

## 4. Do not dump the entire graph

The result UI should expose useful policy rules, not millions of graph edges.

## 5. Preserve existing site functionality

The existing Cluster Jewel and Character views should continue working.

---

# Service Contract Follow-Up Details

## Recommendation status

Add something equivalent to:

```ts
recommendationStatus:
  | 'PROVEN_OPTIMAL'
  | 'BEST_RESOLVED'
  | 'NO_RESOLVED_ROUTE'
```

## Expected action usage

Add something equivalent to:

```ts
expectedActions: Array<{
  actionId: string;
  actionName: string;
  expectedCount: number;
  expectedCostChaos: number;
}>
```

## Policy rules

The UI policy contract should be derived from the actual on-policy graph.

It may be compressed/grouped for display, but must not silently substitute three hand-picked representative states for the full strategy.

## Confidence scopes

Expose selected-route confidence separately from broader search-space warnings.

## Search scope

If Harvest action discovery remains restricted to target-inferred tags for performance, expose that action scope in the result/search summary.

Do not imply "all Harvest crafts were considered" if only target-relevant tags were enabled.

---

# Search/Performance Follow-Up

Do not attempt a major solver rewrite during UI Phase 1.

The UI will provide much better evidence about where search time is actually going.

Continue recording:

```text
states expanded
cumulative expansion work
elapsed time
queued/unexpanded states
competitive unresolved count
proof level
```

After the UI is usable, evaluate whether to replace round-by-round graph rebuilding with persistent incremental expansion.

That optimization should be evidence-driven.

---

# Self-Fracture Follow-Up

The current approximate self-fracture acquisition model may remain during Developer UI Phase 1.

The UI must describe it as an estimate.

Do not claim that its acquisition preparation steps were discovered by the generic Bellman solver.

Longer-term target architecture remains:

```text
clean base
-> actual prep actions
-> four-mod rare
-> Fracturing Orb
-> wrong fracture recovery/restart
-> successful fractured physical state
```

with the acquisition policy discovered from shared mechanics rather than a precomputed shortcut.

Do not attempt this full-pool migration if it destabilizes the UI integration phase.

---

# Validation Requirements

## Build

Run:

```text
npm run build
```

after the React app actually imports/uses the browser optimizer worker.

No unit tests.

## Browser-safe data

Prove:

```text
worker can create the optimizer from committed browser data
no node:fs dependency is executed in browser code
fresh-clone committed data path works
```

## Worker

Prove:

```text
long solve does not freeze UI
Cancel terminates the active search
new search works after cancellation
errors return cleanly to UI
```

## Result semantics

Prove all three result states render:

```text
PROVEN_OPTIMAL
BEST_RESOLVED
NO_RESOLVED_ROUTE
```

If a convenient current fixture cannot produce the first status, keep the UI branch implemented and document that the browser smoke covered the statuses available from current fixtures.

## Full-pool smoke

Re-run the 72-mod two-mod target through the same service/worker path used by the UI.

Compare against the current backend reference:

```text
expected selected resolved route: fractured T1 ES acquisition family
expected cost neighborhood: ~1540c under current approximate acquisition/prices
selected policy proper/absorbing/reconciled
GLOBAL OPTIMALITY: NOT YET PROVEN
```

Do not assert the exact cost is invariant if pricing or a mechanics fix legitimately changes it.

## Regressions

Re-run Craft A and Craft C.

Do not add unit tests.

---

# Required Completion Report

When this phase is complete, commit implementation and regenerated diagnostics to `main` and report:

1. commit SHA;
2. files changed;
3. `npm run build` result;
4. browser-safe data-loading architecture;
5. whether browser bundle contains/executes Node-only imports;
6. worker protocol and cancellation behavior;
7. optimizer tab/component files;
8. crafting catalog architecture;
9. exact 1–4 mod target input representation;
10. recommendation-status contract;
11. on-policy policy-rule contract;
12. expected-action usage contract;
13. selected-policy vs search-space confidence behavior;
14. research-fallback toggle behavior;
15. one-mod UI smoke result;
16. full-pool two-mod UI/worker result;
17. budget-exhaustion UI result;
18. full-pool Harvest-selected diagnostic result;
19. Craft A regression;
20. Craft C regression;
21. worker/runtime timings;
22. known UI limitations;
23. whether the project is ready for UI Phase 2 / polish and richer price integration.

---

# Bottom Line

The pre-UI hardening phase succeeded.

The project should **begin Developer UI Phase 1 now**.

The first work in that phase is not visual polish. It is making the already-created optimizer service safely consumable by a browser:

```text
browser-safe data boundary
+
Web Worker execution
+
proof-honest service semantics
+
complete on-policy result summaries
+
thin React form/result view
```

The engine does not need to prove global optimality for every target before the developer UI exists.

The UI does need to make the distinction between:

```text
proven optimal
best resolved
unresolved within budget
```

impossible to miss.
