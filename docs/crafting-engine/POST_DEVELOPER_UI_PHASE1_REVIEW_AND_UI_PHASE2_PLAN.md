# Post Developer UI Phase 1 Review and Developer UI Phase 2 Plan

## Review Scope

This review covers current `main` at:

- `2b3a131f1c2e75d46f33ebdf9ae9fe5e3fe1cbc6` — `feat: add developer craft optimizer worker UI`

It also considers the immediately preceding cleanup commit:

- `0ee7d01ccb885a4323a6ad630663a8bbf0a20a4e` — `refactor: remove deprecated configuration and unused utility modules`

Primary implementation and diagnostics reviewed:

- `src/CraftOptimizer.tsx`
- `src/crafting/browserEngine.ts`
- `src/crafting/optimizer.worker.ts`
- `src/crafting/optimizerWorkerClient.ts`
- `src/crafting/optimizerWorkerEngine.ts`
- `src/crafting/optimizerWorkerProtocol.ts`
- `crafting-engine/src/data/clusterModRepository.ts`
- `crafting-engine/src/data/loadClusterMods.ts`
- `crafting-engine/src/service/craftingCatalog.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/src/solver/genericSearch.ts`
- `crafting-engine/src/rules/actionRegistry.ts`
- `crafting-engine/KNOWN_MECHANICS.md`
- `output-developer-ui-phase1.txt`
- `output-browser-phase1-smoke.txt`
- `output-pre-ui-hardening.txt`
- Craft A/C review outputs

This document is the source of truth for the next implementation pass.

---

# Executive Verdict

## Developer UI Phase 1

**PASS.**

The UI phase is now real rather than scaffolding.

The implementation successfully established:

- a browser-safe mod repository/parser;
- a Node-only loader with committed-snapshot fallback;
- a Web Worker boundary around synchronous Bellman search;
- terminate/recreate cancellation;
- typed serializable worker messages;
- a browser-safe catalog for base/enchantment/passive/mod selection;
- 1–4 exact-mod target input;
- proof-honest UI statuses;
- complete on-policy rule serialization instead of representative-only steps;
- expected action usage;
- selected-policy vs broader-search confidence scopes;
- explicit fallback-price control;
- clean handling of search-budget exhaustion;
- a full-pool case in which shared Harvest is selected by the generic solver;
- preserved Craft A and Craft C regressions.

The next phase should **not** add exotic crafting mechanics.

The highest-value work is now to turn the developer UI into a trustworthy economics and target-definition tool while correcting two issues exposed by the browser integration.

## Recommended next phase

> **Developer UI Phase 2 — Production Economics, Target Correctness, and Search Usability**

The UI should remain proof-honest. Do not hide unresolved competitors merely to make the interface look finished.

---

# What Is Working Well

## 1. Browser/runtime separation is correct

The browser imports the environment-neutral `clusterModRepository.ts` and committed PoEDB JSON directly, while Node scripts retain their own filesystem loader.

The production worker bundle inspection found no `node:fs`, `node:path`, `node:url`, or `readFileSync` leakage.

Preserve this separation.

## 2. Web Worker execution is the right architecture

The full-pool two-mod worker-path diagnostic takes several seconds, so moving the synchronous solver off the React main thread was necessary.

The current cancellation strategy is appropriate for Phase 1:

```text
Cancel
-> terminate active worker
-> reject outstanding request as AbortError
-> create fresh worker
```

The browser smoke confirms the page remains responsive afterward.

Do not move Bellman search back onto the React thread.

## 3. Proof-honest result rendering is strong

The three user-facing states are appropriate:

```text
PROVEN_OPTIMAL
BEST_RESOLVED
NO_RESOLVED_ROUTE
```

The current full-pool two-mod route is correctly displayed as `BEST_RESOLVED`, not as proven cheapest, because unresolved alternatives may still be cheaper.

Keep this language.

## 4. `policyRules` now represents the actual on-policy graph

The service no longer serializes only the old representative `steps` collection.

It now exposes actual on-policy decisions ordered by expected visits, which is much more suitable for explanation and later route summarization.

## 5. Expected action usage is useful

The two-mod diagnostic now reports concrete expected usage such as:

```text
Approximate self-fracture acquisition: 1.0
Alterations: ~51.17
Augmentation: ~1.0
Regal: ~1.0
```

This is the right data source for user-facing craft summaries.

## 6. Harvest is genuinely reachable from generic search

The full-pool Harvest diagnostic selects `Harvest Reforge Critical` over resolved Exalt and Annul alternatives while still warning that Scour remains unresolved.

That is a meaningful integration proof.

Keep Harvest mechanics confidence:

```text
APPROXIMATE / EXTERNALLY CLOSE
```

until the model is independently improved.

## 7. A/C regressions remain healthy

Current reported references remain:

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
One timeout / 10,000
Fallbacks: 0
Missing states: 0
```

Preserve these as regression fixtures.

---

# Findings For Phase 2

# Finding 1 — Shared Harvest Affix-Count Logic Is Only Correct For The Current One-Fracture Approximation

## Severity

**HIGH — generic Harvest correctness**

The new shared Harvest transition currently does this:

```text
preserve fractured modifiers
+ guaranteed tagged modifier
+ 50% one extra modifier
+ 50% two extra modifiers
```

That reproduces the historical approximation reasonably for the main externally tested state containing **one fractured modifier**:

```text
1 fracture + 1 guaranteed + 1 extra = 3 total
1 fracture + 1 guaranteed + 2 extras = 4 total
```

However, Harvest is now generic and Bellman-searchable from **unfractured rare items** too.

For an unfractured state the same implementation produces:

```text
0 fracture + 1 guaranteed + 1 extra = 2 total
0 fracture + 1 guaranteed + 2 extras = 3 total
```

That conflicts with the project's own current documented cluster-jewel approximation in `KNOWN_MECHANICS.md`, which says the reforge model should produce a 3-or-4-affix cluster result.

This issue was not exposed by the Harvest-selected Phase 1 fixture because that fixture deliberately starts with a fractured modifier.

## Required fix

Make the approximation describe **desired total explicit count**, not a fixed number of extras.

Conceptually under the current project assumption:

```text
desired total explicit count = 3 or 4
preserved fractured count = F
guaranteed tagged count = 1
extras to roll = desiredTotal - F - 1
```

Respect prefix/suffix capacity and mod-group exclusions while filling those extras.

Do the same in analytical transitions and seeded sampling.

Do **not** tune the model to the Craft of Exile compound probability.

The purpose is internal consistency for generic unfractured and fractured states.

## Required diagnostics

Show analytical and seeded distributions for at least:

```text
A. unfractured rare reforge
B. one-fracture rare reforge
```

Print total explicit-count distributions for both.

The one-fracture external parity benchmark should remain close to its current behavior unless a real mechanics reason changes it.

---

# Finding 2 — The Direct Two-Mod Diagnostic And The Actual React UI Do Not Define Exactly The Same Target

## Severity

**HIGH — validation fidelity**

The direct worker diagnostic for T1 Intelligence + T1 ES explicitly uses:

```ts
requiredRarity: 'rare'
```

The actual React `CraftOptimizer` currently creates:

```ts
target: {
  requiredMods: [...]
}
```

with no required rarity.

Therefore the direct worker benchmark and the user-facing browser path are not necessarily solving the same problem.

The headless browser smoke checks that a result renders and remains responsive, but it does not currently assert the same target definition/cost as the direct service diagnostic.

## Required fix

Expose finished rarity in the UI, preferably:

```text
Final rarity
[Any / Magic / Rare]
```

For 3–4 selected explicit modifiers, automatically require Rare or prevent an impossible choice.

For 1–2 modifiers, allow the user to decide whether a magic item is acceptable.

Also render a compact **Target Summary** in results so the user can see exactly what was solved.

## Validation

Add one browser smoke where the UI selects:

```text
Rare
T1 Intelligence
T1 Maximum Energy Shield
```

and verify the serialized worker request/result corresponds to that exact target.

Do not use a direct-service test as a substitute for the actual browser input path.

---

# Finding 3 — Input Validation Belongs In The Service Boundary, Not Only React

## Severity

**HIGH before broader target UX**

The current React form correctly checks:

- 1–4 modifiers;
- duplicate exact IDs;
- item level;
- base/enchantment/passive compatibility.

But the service itself does not own the full validation contract, and the UI can still express structurally impossible targets such as:

- two tiers from the same mod family;
- more than two required Prefixes;
- more than two required Suffixes;
- too many notables for the selected base size;
- a required rarity incompatible with the selected number of affixes.

Those inputs can waste a large search budget only to return no route.

## Required architecture

Add a browser-safe/service-safe validation helper, for example:

```ts
validateOptimizeCraftInput(input, catalog/repository)
```

Return structured validation errors/warnings.

Use the same validator from:

- React before sending the worker request;
- `OptimizerService.optimize()` before search;
- diagnostics.

At minimum validate:

```text
base type
cluster type
passive count
item level
1–4 target mods
mod eligibility
exact-ID uniqueness
mod-group conflicts
prefix capacity
suffix capacity
notable capacity
required rarity feasibility
```

Do not duplicate crafting-rule logic inside React.

---

# Finding 4 — Phase 1 Economics Are Still Mostly Research Defaults

## Severity

**HIGH — user usefulness**

The UI currently exposes only a clean-base price field and otherwise relies heavily on research-default currency rates and approximate self-fracture acquisition.

The repository already contains league-specific `trade-prices.json` snapshots with:

- currency rates;
- base prices;
- timestamps;
- finished notable-combo prices.

Those are currently used by the Cluster Jewels UI but not by the Craft Optimizer.

## Important provenance issue

`CraftOptimizer` initializes:

```text
Clean base price = 10c
```

and sends that numeric value on every search.

The service then classifies any supplied clean-base value as a known/user-supplied price.

A pre-populated development default should not silently become equivalent to current market evidence.

## Required Phase 2 pricing architecture

Create a browser-safe optimizer market-price adapter/provider.

It should expose:

```text
league
snapshot timestamp
currency-rate timestamp
clean-base market observation if available
source/provenance
staleness
```

Use existing committed `src/data/<league>/trade-prices.json` snapshots where possible.

### Currency rates

Map trade/economy currency IDs to engine currency keys explicitly.

Do not assume names are identical.

Engine keys currently include values such as:

```text
chaos
divine
fracturing
annul
exalt
scour
alteration
transmutation
augmentation
regal
wildLifeforce
vividLifeforce
primalLifeforce
```

Missing mappings must remain fallback/unavailable rather than silently becoming a different currency.

### Clean base

Attempt to resolve a market base price for:

```text
base type
cluster enchantment
passive count
item level
league
```

If no matching cached quote exists:

- leave market price unavailable;
- allow a manual override;
- or use research fallback only when the user allows it.

Do not label the current hard-coded `10c` starter value as market-known.

### Price freshness

Show the market snapshot date/time in the UI.

A stale market price is still usable as evidence, but its age must be visible.

---

# Finding 5 — Market Fractured-Base Pricing Exists In The Service Contract But Is Not Exposed In The UI

## Severity

**HIGH for acquisition comparisons**

`OptimizerService` already accepts:

```ts
marketFracturedPricesChaos
```

but the Phase 1 UI does not provide these values.

As a result, self-fracture research estimates dominate the available fracture acquisition portfolio.

## Phase 2 requirement

At minimum expose optional manual market prices for each target fracture candidate generated from the selected target.

Example:

```text
Market fractured T1 Intelligence: [     ] c
Market fractured T1 ES:           [     ] c
```

Leave blank when unknown.

Do not invent a market price.

### Optional extension

If the existing trade-query/stat infrastructure can reliably build an exact fractured-base query for arbitrary supported target mods, extend the publish-time price cache.

But do not rush this by matching display text heuristically without a verified trade-stat mapping.

A manual explicit price is better than a silently wrong automated price.

---

# Finding 6 — Harvest Scope Reporting Includes Tags That Do Not Correspond To An Enabled Harvest Craft

## Severity

**MEDIUM — reporting correctness**

Current examples report scopes such as:

```text
TARGET_INFERRED [defences, energy_shield]
TARGET_INFERRED [attribute, defences, energy_shield]
```

but only tags present in `HARVEST_CRAFT_DEFINITIONS` actually create executable Harvest actions.

The search itself is not necessarily wrong, because the factory ignores unsupported tags, but the UI/report can imply a broader Harvest action set than was truly enabled.

## Required fix

Separate:

```text
raw target-derived tags
```

from:

```text
actual enabled Harvest craft IDs/tags
```

The UI should report the latter as the active action scope.

---

# Finding 7 — Warning Scope Is Better, But The Top-Level Warning List Still Mixes Selected And Merely Considered Approximation Warnings

## Severity

**MEDIUM — user interpretation**

The service now correctly exposes:

```text
selectedPolicy
consideredSearchSpace
```

for both price and mechanics confidence.

However, top-level `warnings` still includes the broader mechanics/search warnings.

The browser smoke demonstrates the consequence:

```text
one-mod selected mechanics warnings: 0
one-mod browser mechanics warning visible: YES
```

The selected route itself may not use approximate Harvest, yet a prominent generic warning can still make it look that way.

## Required refinement

Create explicit warning scopes/types, for example:

```text
SELECTED_ROUTE
PROOF_SEARCH
CONSIDERED_ALTERNATIVE
DATA_FRESHNESS
```

Prominently display:

- selected-route confidence warnings;
- proof/search limitations;
- stale/missing market data.

Put considered-alternative warnings in a secondary/collapsible section.

Do not hide them; classify them.

---

# Finding 8 — The Quick One-Mod Diagnostic Is An Integration Smoke, Not A Product Recommendation Benchmark

## Severity

**MEDIUM**

The current quick one-mod T1 ES diagnostic uses only:

```text
300 states
1 expansion round
```

and returns the approximately `1534.3c` self-fracture acquisition as the best resolved route.

That is acceptable as a low-budget integration smoke because the UI correctly labels it `BEST_RESOLVED` rather than proven cheapest.

It is **not** a meaningful benchmark for whether the optimizer can find the obvious cheap clean-base strategy for a simple one-mod target.

## Required Phase 2 sanity fixture

Add a separate default-budget/full-pool one-mod diagnostic using the actual UI/service defaults.

For a simple T1 one-mod target, report:

- clean-base route status;
- fractured route status;
- selected route;
- unresolved competitor count;
- expected cost;
- proof status;
- runtime.

The goal is to ensure the normal product defaults produce a useful result for the simplest target class.

If the clean-base route remains unresolved under normal UI budgets, treat search scalability as a product issue rather than hiding it behind a self-fracture recommendation.

---

# Finding 9 — Search UX Needs A Better Retry/Progress Story, But Not A New Solver Architecture Yet

## Severity

**MEDIUM**

The worker keeps the UI responsive, which solves the Phase 1 blocker.

The next usability step is to make long searches understandable.

## Phase 2 recommendation

Add:

- elapsed-time indicator while searching;
- current configured state/time/round budget;
- clear cancelled state;
- a `Retry deeper` action when result is `BEST_RESOLVED` or `NO_RESOLVED_ROUTE` because the search budget exhausted.

A simple retry can increase budgets and restart the search.

Do not implement persistent graph continuation merely for UI polish unless measurements show it is needed.

If coarse worker progress can be exposed cleanly at expansion-round boundaries, add it. Avoid invasive callbacks through every inner Bellman loop for this phase.

---

# Finding 10 — Historical Crafting Review Docs Were Removed In The Cleanup Commit

## Severity

**REPOSITORY CONTINUITY / LOW RUNTIME RISK**

Commit `0ee7d01...` removed the accumulated historical files under `docs/crafting-engine/`, leaving only the newest phase document.

The code is unaffected, but this project deliberately uses review documents as architecture and validation history across implementation passes.

## Required repository hygiene

Do not delete future phase-review documents as "unused" source files.

Prefer one of:

```text
docs/crafting-engine/current/
docs/crafting-engine/archive/
```

or a clear index identifying the latest source-of-truth document while retaining prior findings.

For this phase, restore the deleted review documents into an `archive/` folder if practical from Git history, or at minimum restore the most important architecture/parity history and add a short README/index explaining that archived plans are historical rather than current instructions.

Do not allow an automated cleanup pass to remove review/history docs again.

---

# Phase 2 Implementation Order

## Step 1 — Correct generic Harvest total-affix generation

Make analytical and seeded Harvest use a total-result-affix model that works consistently with zero or one fractured explicit.

Preserve the current external-parity framing.

Do not tune to Craft of Exile.

## Step 2 — Add service-owned target validation and final-rarity support

Implement one shared validator.

Add final rarity to the developer UI and echo the exact target in result output.

Make browser and direct diagnostics use identical target definitions when they are intended to compare.

## Step 3 — Add league-aware market-price input

Build a browser-safe price provider over committed `trade-prices.json` snapshots.

Feed known currency rates and clean-base evidence into `OptimizerService` with explicit provenance.

Show timestamp/staleness.

Keep research fallback optional.

## Step 4 — Expose fractured-base market overrides

Provide optional per-target fracture purchase prices.

Feed them to `marketFracturedPricesChaos`.

Keep self-fracture estimates clearly approximate.

## Step 5 — Improve warning/proof hierarchy

Keep proof status at the top.

Separate selected-route warnings from considered-space warnings.

Show data freshness separately.

## Step 6 — Improve target selection usability

The current native selects are acceptable for Phase 1 but become awkward as the catalog grows.

Without adding crafting logic to React, improve selection with:

- searchable/filterable mod selection;
- Prefix/Suffix grouping;
- tier display;
- notable indication;
- already-selected/conflicting options disabled or explained using service/catalog validation data.

Do not add a heavy UI dependency unless it materially helps.

## Step 7 — Improve result usability

Add a compact summary containing:

```text
Target
League / pricing timestamp
Recommendation status
Selected acquisition
Expected craft cost
Optional sale value / expected profit
Major expected actions
Selected-route confidence
Unresolved competitor count
Search runtime/budget
```

The detailed policy table can remain collapsible.

Expose optional expected sale value input because `OptimizerService` already supports it.

Do not fabricate sale value from unrelated combo prices.

## Step 8 — Add retry-deeper/search feedback

Keep cancellation.

Add elapsed search feedback and a simple larger-budget retry path.

## Step 9 — Restore documentation continuity

Archive deleted historical review docs or restore the key architecture/parity history with an index.

Do not change the new Phase 2 source-of-truth status.

## Step 10 — Run full diagnostics and regressions

Run build, lint, browser smoke, engine diagnostics, and A/C regressions.

No unit tests.

---

# Required Diagnostics

## 1. Build and lint

Run:

```text
npm run build
npm run lint
```

No unit tests are required.

## 2. Harvest affix-count diagnostic

For an unfractured and a one-fracture rare state, print:

```text
analytical total-affix distribution
seeded sampled total-affix distribution
probability sum
fractured-mod preservation
mechanics-confidence label
```

## 3. UI target identity diagnostic

Through the actual browser UI select:

```text
Large Cluster Jewel
Shield Attack Damage enchant
12 passives
ilvl 84
Rare
T1 Intelligence
T1 Maximum Energy Shield
```

Verify the worker received/solved that exact target.

## 4. Default-budget one-mod product sanity

Run one full-pool one-mod target using actual UI default budgets.

Do not use the 300-state quick smoke as the only evidence.

Report whether clean-base search resolves and whether it beats approximate self-fracture.

## 5. Full-pool two-mod browser smoke

Repeat the rare T1 Int + T1 ES UI path and report:

```text
recommendation status
cost
selected acquisition
runtime
states
on-policy states
absorption
Bellman convergence
occupancy convergence
reconciliation
unresolved competitors
budget exhaustion
selected-route price confidence
selected-route mechanics confidence
```

## 6. Market-price diagnostic

For at least one selected league/base combination print:

```text
league
price snapshot timestamp
currency rate timestamp
resolved clean-base quote
quote age
engine currency mappings used
missing engine currency mappings
fallbacks used
```

## 7. Fallback disabled with market data

With known market rates/base price supplied and research fallback disabled, prove that known-priced actions remain eligible while true research-only actions are excluded.

The expected result should not be `NO_RESOLVED_ROUTE` merely because no market rates were wired into the browser.

If a required currency remains unavailable, report that explicitly.

## 8. Browser warning-scope smoke

Show a selected route that does not use Harvest while Harvest was considered.

Verify:

```text
selected-route Harvest warning: NO
considered-alternative Harvest warning: YES
```

## 9. Craft A/C regressions

Preserve existing regression quality.

If the state-dependent Harvest correction changes A/C, explain exactly why. Since their mature path commonly operates from a fractured state, large changes would deserve investigation.

---

# Phase 2 Completion Gates

Developer UI Phase 2 is complete when:

- [ ] `npm run build` passes;
- [ ] `npm run lint` passes or only explicitly documented pre-existing warnings remain;
- [ ] unfractured Harvest no longer uses the one-fracture-only affix-count shape;
- [ ] analytical and sampled Harvest agree for zero- and one-fracture states;
- [ ] target validation is service-owned;
- [ ] final rarity is represented in the UI request;
- [ ] browser smoke and direct diagnostics solve the same declared target when compared;
- [ ] market snapshot currency/base pricing can feed the optimizer with provenance;
- [ ] the default 10c development value is not silently called current market-known evidence;
- [ ] market fractured-price overrides are available;
- [ ] selected-route warnings are distinct from considered-search warnings;
- [ ] actual enabled Harvest crafts are reported rather than raw unsupported inferred tags;
- [ ] a default-budget one-mod full-pool sanity run is useful/proof-honest;
- [ ] the two-mod browser run remains proof-honest and responsive;
- [ ] cancellation still works;
- [ ] A/C regressions remain healthy;
- [ ] historical review-document continuity is preserved.

---

# Out Of Scope For This Phase

Do not add:

- Allflame/intangibility;
- fossils;
- essences;
- beastcrafting;
- veiled crafting;
- a Craft-B-specific solver;
- separate 1/2/3/4-mod solvers;
- a large frontend framework/state-management dependency without need;
- unit-test work.

Do not attempt to force every target to `PROVEN_OPTIMAL` before the UI can be useful.

The proof system is already designed to represent incomplete search honestly.

---

# Required Completion Report

When finished, commit implementation and regenerated outputs to `main` and report:

1. commit SHA;
2. files changed;
3. build result;
4. lint result;
5. Harvest zero-fracture analytical/sample affix-count distribution;
6. Harvest one-fracture analytical/sample affix-count distribution;
7. whether compound Harvest external parity materially changed;
8. target validator behavior;
9. final-rarity UI behavior;
10. browser/direct target-identity parity;
11. league/market price-provider architecture;
12. currency mappings and missing rates;
13. clean-base market-price source/timestamp;
14. manual fractured-market-price behavior;
15. fallback-disabled behavior with market data;
16. warning-scope behavior;
17. actual enabled Harvest scope reporting;
18. default-budget one-mod result;
19. full two-mod browser result;
20. search retry/progress behavior;
21. Craft A regression;
22. Craft C regression;
23. documentation archive/history status;
24. recommended focus for Phase 3.

---

# Bottom Line

Developer UI Phase 1 is successful.

The project no longer needs another architecture-only backend phase before useful frontend work can continue.

The next pass should make the UI's answers **economically grounded and target-exact**:

```text
consistent generic Harvest
+
service-owned target validation
+
final-rarity semantics
+
league-aware market prices
+
fractured-base price inputs
+
clear warning scope
+
useful default-budget search behavior
+
result usability
```

Keep `GAME-MECHANICS FIDELITY: PARTIAL` while Harvest remains approximate.

Keep `GLOBAL OPTIMALITY: NOT YET PROVEN` unless the specific modeled search actually proves otherwise.