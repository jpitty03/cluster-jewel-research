# Post Developer UI Phase 1 Review and Developer UI Phase 2 Plan

## Status

This document is the current source of truth for the next implementation pass.

It reviews the Developer UI Phase 1 implementation at:

- `2b3a131f1c2e75d46f33ebdf9ae9fe5e3fe1cbc6` — `feat: add developer craft optimizer worker UI`

It also incorporates **live manual browser testing performed after the original Phase 2 review**. Those field tests materially change the priority order below.

The Phase 1 architecture still passes. The new browser tests do **not** invalidate the Web Worker, service boundary, proof-honest UI, or A/C regressions. They do expose two product-level blockers that must be fixed before pricing polish becomes the main focus.

---

# Executive Verdict

## Developer UI Phase 1

**PASS architecturally.**

Working pieces to preserve:

- browser-safe repository/parser;
- Node-only data loader with committed-snapshot fallback;
- Web Worker execution;
- terminate/recreate cancellation;
- serializable request/result protocol;
- 1–4 exact-mod selection;
- `PROVEN_OPTIMAL` / `BEST_RESOLVED` / `NO_RESOLVED_ROUTE` rendering;
- real on-policy rule serialization;
- expected action usage;
- selected-policy vs considered-search confidence scopes;
- fallback-price toggle;
- budget exhaustion as a normal result;
- generic Harvest action integration;
- Craft A/C stability.

## Revised Phase 2 priority

The next pass is now:

> **Developer UI Phase 2A — Simple-Craft Correctness and Hard Runtime Control**

Only after those gates pass should the work continue into:

> **Developer UI Phase 2B — Target UX, market pricing, result usability, and polish**

The highest priority is no longer market-price integration. A simple live craft currently produces a clearly non-useful strategy, and a two-mod UI solve can run for minutes despite a 30-second configured search budget.

---

# New Live Browser Findings — Highest Priority

# Finding A — Default-Budget One-Mod T1 ES Produces A Non-Useful Strategy

## Severity

**CRITICAL PRODUCT CORRECTNESS**

A manual browser run used the real UI defaults with:

```text
Base:        Large Cluster Jewel
Enchant:     12% increased Attack Damage while holding a Shield
Item level:  84
Passives:    12
Target:      Glowing (T1) / T1 Maximum Energy Shield
```

The UI returned:

```text
Recommendation: BEST_RESOLVED
Selected acquisition: Approximate self-fracture: Glowing (T1)
Expected total: 1534.300c

Alternative acquisition:
Clean Base: 1544.300c

On-policy states: 2
Terminal absorption: 100%
Expected action usage:
  Restart/Reacquire: Approximate self-fracture: Glowing (T1) = 1.000

Search:
  states expanded: 1667
  expansion rounds: 1 / 3
  engine elapsed: ~213 ms
  worker round trip: ~215 ms
  budget exhausted: NO
```

This is materially different from the earlier 300-state smoke-test concern.

The **real default UI search** still recommends acquiring an already-fractured T1 ES item for ~1534c instead of discovering the ordinary clean-base Transmutation/Alteration/Augmentation path to a single target affix.

The clean-base alternative being exactly ~10c more than the selected ~1534.3c route strongly suggests that the downstream clean-base policy is not representing the obvious cheap rolling route. The implementation must print and inspect the actual clean-base downstream decision before assuming the exact root cause.

Do **not** fix this with a one-mod special case.

The generic solver must be able to solve the simplest target correctly using the same action/state architecture used for larger crafts.

## Required investigation

Add a dedicated production-pool diagnostic for this exact case using the real UI/service defaults.

At minimum print:

```text
virtual acquisition-menu decision
clean-base acquisition Q / status
self-fracture acquisition Q / status
clean-base downstream state key
all legal actions at clean normal state
Transmutation Q / status
all Transmutation successor target probability
representative magic miss state
Alteration Q / status
Augmentation Q / status where legal
whether any clean-path descendant is unresolved/improper
why clean-base total becomes ~1544.3c
```

Trace the selected policy beginning specifically from the **clean-base destination**, even if it is not the global selected acquisition.

Determine whether the issue is caused by one or more of:

- starting-route acquisition/restart semantics;
- target satisfaction/rarity semantics;
- graph reachability;
- transition caching;
- action resolution classification;
- search prioritization;
- Bellman values on magic states;
- clean-base path incorrectly abandoning into self-fracture;
- another generic solver defect.

Do not assume the answer before printing the route.

## Required correctness gate

For an ordinary one-mod target such as T1 ES, with plausible low currency prices and a 10c clean base, the engine must discover and compare the ordinary rolling route.

A result whose only practical plan is:

```text
acquire target already fractured
```

is not sufficient for this fixture.

Expected behavior is conceptually of the family:

```text
Clean Base
-> Transmutation
-> Alteration / Augmentation as state-appropriate
-> target hit
```

The exact EV must come from real pool weights and prices. Do not hardcode an expected cost.

The regression should assert semantic properties, not a magic number:

- clean-base ordinary crafting route exists and is fully explainable;
- its policy contains actual crafting actions;
- target absorption is proper;
- EV reconciles;
- it is compared fairly against fractured acquisition;
- no one-mod-specific solver branch is added.

---

# Finding B — UI `maxWallTimeMs` Is Not A Hard Runtime Ceiling

## Severity

**CRITICAL UI RELIABILITY**

The manual two-mod browser benchmark was started with the normal UI defaults:

```text
maxStates:          5000
maxWallTimeMs:      30000
maxExpansionRounds: 3
```

Target:

```text
T1 Intelligence
T1 Maximum Energy Shield
```

The browser worker continued running for **more than five minutes**.

The user cancelled it manually.

That is not acceptable behavior for a UI that advertises a 30-second wall-time budget.

## Why the current deadline is soft

`GenericSearchEngine.search()` creates a deadline and checks it around major loops.

However, expensive synchronous work inside a loop — especially transition generation/aggregation for one state/action — can execute for a long time without another deadline check.

Therefore `maxWallTimeMs` currently behaves as a cooperative/soft solver budget rather than a guaranteed browser-runtime ceiling.

The Worker architecture is still correct: terminating the worker is an effective cancellation mechanism. Preserve it.

## Required runtime design

Implement **two layers** of timeout protection.

### Layer 1 — hard browser/worker guard

The client/worker boundary must guarantee that a configured UI wall-time budget cannot leave the page searching for minutes.

A simple acceptable Phase 2A implementation is:

```text
start worker request
start host timer = requested wall budget + small documented grace
if worker has not returned:
    terminate worker
    recreate worker
    surface a typed timeout outcome
```

Do not surface this as a mysterious generic exception.

Use a distinct outcome/reason such as:

```text
SEARCH_WALL_TIME_EXCEEDED
```

or an equivalent typed status.

The UI should say clearly that the search was stopped at the configured runtime budget and offer `Retry deeper`.

### Layer 2 — improve cooperative engine checks

Also thread deadline awareness into expensive transition-generation paths where practical.

Do not rely solely on a timer outside the worker forever, because preserving the latest fully completed search round/partial proof is preferable to killing work blindly.

Audit especially:

- large analytical transition generation;
- Harvest distributions;
- Regal/Exalt/Fracture successor enumeration;
- aggregation of large distributions;
- rebuild/lazy-expansion rounds.

If a transition generator cannot be safely interrupted yet, document that and let Layer 1 enforce the hard user-facing ceiling.

## Required runtime gates

Browser smoke must prove:

```text
configured 5s search -> returns/terminates near 5s, not minutes
configured 30s search -> returns/terminates near 30s plus documented grace
page remains responsive afterward
subsequent search works on recreated worker
```

Do not write a test that waits five minutes.

---

# Finding C — The Manual One-Mod Test Confirms Warning Scoping Is Working

The screenshot correctly shows:

```text
Selected mechanics: 0 approximation warnings
Broader mechanics: 1 approximation warning
```

while the broader warning is Harvest-related.

That distinction is good and should be preserved.

However, the bottom-level warning list still visually mixes selected-route warnings, proof warnings, and merely considered mechanics warnings. Keep the prior Phase 2 requirement to classify warning scopes in the UI.

---

# Phase 2A — Required Implementation Order

## 1. Reproduce the exact one-mod UI failure in a deterministic diagnostic

Use:

```text
Large Cluster Jewel
12% increased Attack Damage while holding a Shield
ilvl 84
12 passives
Glowing (T1)
UI/service default budgets
clean base = 10c fixture
```

Print the clean-route internals described above.

Do not proceed directly to a patch without identifying the route that yields ~1544.3c.

## 2. Fix the generic search/acquisition defect

The fix must apply generally.

No:

```text
if targetCount === 1
if target === T1 ES
if craftName === ...
```

The solver should naturally prefer cheap ordinary crafting when its expected cost is lower.

## 3. Add semantic one-mod product sanity diagnostics

Run at least:

```text
T1 ES
T1 Intelligence
one representative notable
```

Use real full pools.

For each report:

- selected acquisition;
- expected cost;
- policy actions;
- on-policy states;
- absorption;
- Bellman convergence;
- occupancy convergence;
- reconciliation;
- unresolved competitors;
- runtime.

The goal is to prove the generic engine can solve simple real crafts before relying on it for multi-mod UI recommendations.

## 4. Enforce a hard browser-runtime ceiling

Implement the worker/client guard and add deadline checks inside expensive engine paths where reasonable.

## 5. Re-run the two-mod UI benchmark

Only after the hard-runtime guard exists.

Use the same target as before.

The pass condition is not necessarily that it resolves within 30 seconds.

A valid result may be:

```text
BEST_RESOLVED
NO_RESOLVED_ROUTE
SEARCH_WALL_TIME_EXCEEDED / partial search limit
```

depending on what was proven.

The requirement is that the UI stops on time and remains proof-honest.

## 6. Re-run Craft A and Craft C

Preserve the mature regression paths.

Current reference neighborhood:

### Craft A

```text
Analytical: ~7623.7c
Pooled MC:  ~7568.1c
Difference: ~-0.73%
```

### Craft C

```text
Analytical: ~42814.4c
Pooled MC:  ~42483.5c
Difference: ~-0.77%
```

Do not tune back to old values if a legitimate generic fix changes them. Explain any movement.

---

# Phase 2B — Continue After Phase 2A Gates Pass

The following requirements from the original Phase 2 plan remain valid.

# 1. Fix Generic Harvest Total-Affix Modeling

The current approximation is effectively:

```text
preserve fractures
+ guaranteed tagged mod
+ 50% one extra / 50% two extras
```

That gives 3/4 total affixes with one preserved fracture, but only 2/3 total affixes with no fracture.

Under the project's current documented approximation, express the model in terms of desired **total explicit count**, e.g. 3 or 4, then subtract preserved fractures and the guaranteed mod to determine extras.

Keep Harvest:

```text
APPROXIMATE / EXTERNALLY CLOSE
```

Do not tune to the external 0.122529% observation.

Validate analytical and seeded distributions for:

- unfractured rare;
- one-fracture rare.

# 2. Make UI And Diagnostics Solve The Same Target

The direct two-mod diagnostic currently explicitly requires Rare while the current React UI only sends exact mod requirements.

Add:

```text
Final rarity: Any / Magic / Rare
```

For 3–4 explicit requirements, enforce Rare automatically or reject impossible input.

Render a Target Summary with the exact target sent to the worker.

Browser smoke must exercise the exact same target as the service benchmark.

# 3. Move Validation Into The Service Boundary

Add one shared validator used by React, `OptimizerService`, worker diagnostics, and scripts.

Validate:

- base type;
- enchantment;
- passive count;
- item level;
- 1–4 mods;
- exact-ID uniqueness;
- mod eligibility;
- mod-group conflicts;
- prefix/suffix capacity;
- notable capacity;
- rarity feasibility.

React should render validation results, not independently duplicate crafting rules.

# 4. Production Economics / League-Aware Pricing

The repository already has league-specific `trade-prices.json` snapshots and currency rates.

Build a browser-safe optimizer pricing adapter that can provide:

- league;
- snapshot timestamp;
- currency-rate timestamp;
- clean-base market quote when available;
- provenance/staleness;
- explicit engine-currency mappings.

Do not silently treat the current prefilled `10c` UI value as market-known evidence.

If a quote is unavailable, show that honestly and allow manual override/fallback according to user settings.

# 5. Expose Fractured-Base Market Inputs

`OptimizerService` already supports `marketFracturedPricesChaos`.

Expose optional manual fields for target fracture candidates.

Do not invent prices.

Automated fractured pricing should only be added when exact trade-stat mapping is trustworthy.

# 6. Report Actual Enabled Harvest Crafts

Separate:

```text
raw inferred mod tags
```

from:

```text
actual executable Harvest crafts enabled
```

The UI should show the latter.

# 7. Improve Warning Scope

Use explicit categories such as:

```text
SELECTED_ROUTE
PROOF_SEARCH
CONSIDERED_ALTERNATIVE
DATA_FRESHNESS
```

Selected-route and proof warnings should be prominent.

Considered-alternative approximation warnings should be secondary/collapsible.

# 8. Improve Target-Mod Selection UX

The exact-ID selector is correct but will not scale well.

Add search/grouping by:

- mod/stat name;
- tier;
- Prefix/Suffix;
- notable vs ordinary explicit.

Keep exact `modId` as the submitted identity.

# 9. Add Compact Result Summary

Before the deep policy tables, show:

```text
Target
Recommendation status
Selected acquisition
Expected cost
Expected profit if sale value supplied
Proof level
Runtime
Important selected-route warnings
```

Keep detailed policy/debug data available below.

# 10. Add Sale Value / Profit And Retry-Deeper UX

The service already supports sale value.

Expose it in the UI.

When a search is unresolved or times out, offer a convenient `Retry deeper` action that increases explicit budgets rather than hiding them.

Do not automatically launch unbounded searches.

# 11. Preserve Project History

A prior cleanup commit removed many historical crafting-engine review documents.

Do not continue deleting phase/review documentation merely because it is not imported by runtime code.

Documentation is project history, not dead TypeScript.

If historical docs need consolidation, archive/index them intentionally rather than silently deleting them.

---

# Search And Proof Requirements

Preserve all current proof-honest semantics.

Never label a route `PROVEN_OPTIMAL` merely because its selected policy is proper.

Maintain the distinction:

```text
selected policy fully resolved/proper/reconciled
```

vs:

```text
all potentially cheaper modeled competitors resolved or safely bounded
```

For simple one-mod fixtures, actively pursue stronger proof because the state space should be tractable.

For larger crafts, `BEST_RESOLVED` remains a valid product result when unresolved competitors exist.

A timeout/budget stop must never manufacture an EV for an unresolved route.

---

# No Unit Tests For This Phase

Do not add unit-test work.

Continue validation through:

- real browser smoke;
- deterministic diagnostics;
- full-pool reference searches;
- analytical/seeded transition checks;
- Craft A/C Monte Carlo regressions;
- Craft of Exile parity fixtures.

---

# Phase 2A Completion Gates

Do not move the main effort to pricing/polish until all of these pass:

- [ ] exact live one-mod T1 ES failure reproduced in diagnostic output;
- [ ] root cause documented;
- [ ] generic fix implemented without one-mod/craft-specific branching;
- [ ] clean-base ordinary crafting route is discovered for T1 ES;
- [ ] at least two additional simple one-mod full-pool crafts behave sensibly;
- [ ] selected simple policies are proper/absorbing;
- [ ] Bellman/occupancy convergence reported;
- [ ] EV reconciliation passes;
- [ ] hard browser timeout guard exists;
- [ ] configured runtime budgets stop near the configured wall time;
- [ ] worker is usable after timeout/cancellation;
- [ ] two-mod UI benchmark no longer runs unbounded for minutes;
- [ ] Craft A remains healthy;
- [ ] Craft C remains healthy;
- [ ] `npm run build` passes;
- [ ] no unit tests added.

---

# Phase 2B Completion Gates

After Phase 2A:

- [ ] Harvest total-affix approximation is internally consistent for fractured/unfractured states;
- [ ] UI final-rarity input exists;
- [ ] service-owned structured validation exists;
- [ ] browser smoke proves exact target parity with worker/service;
- [ ] league-aware price provenance is wired where available;
- [ ] clean-base default is not silently misclassified as known market data;
- [ ] optional fractured-market overrides exist;
- [ ] enabled Harvest craft scope is truthful;
- [ ] warnings are scoped by selected/proof/alternative/data freshness;
- [ ] target selector is searchable/grouped;
- [ ] compact recommendation summary exists;
- [ ] sale-value/profit input exists;
- [ ] `Retry deeper` exists;
- [ ] proof limitations remain visible;
- [ ] `npm run build` passes.

---

# Required Completion Report

When implementation is complete, report:

1. commit SHA;
2. files changed;
3. `npm run build` result;
4. exact root cause of the one-mod ~1534c recommendation;
5. before/after one-mod T1 ES result;
6. clean-base downstream policy/actions;
7. at least two additional one-mod sanity results;
8. hard timeout architecture;
9. 5-second hard-timeout browser result;
10. 30-second two-mod browser result;
11. worker responsiveness after timeout/cancel;
12. Bellman/occupancy/reconciliation for simple fixtures;
13. Craft A regression;
14. Craft C regression;
15. Harvest total-affix fix and fractured/unfractured distributions if Phase 2B is included;
16. final-rarity/validation changes if Phase 2B is included;
17. market-price provenance changes if Phase 2B is included;
18. remaining unresolved search limitations;
19. whether Phase 2A gates passed;
20. whether it is safe to continue into Phase 2B/polish.

---

# Bottom Line

The browser test was valuable because it exposed two issues the scripted Phase 1 smoke did not adequately characterize:

1. **The default-budget one-mod product result is not yet acceptable.** The engine is selecting an approximate ~1534c fractured acquisition instead of discovering the obvious ordinary crafting family.
2. **The configured wall-time budget is not a hard UI runtime guarantee.** A nominal 30-second two-mod solve can remain active for many minutes.

Fix those first.

The UI/worker architecture itself remains the correct foundation. Once simple-craft correctness and hard runtime control pass, continue with the existing Phase 2 work on target semantics, Harvest consistency, market pricing, warnings, and usability.