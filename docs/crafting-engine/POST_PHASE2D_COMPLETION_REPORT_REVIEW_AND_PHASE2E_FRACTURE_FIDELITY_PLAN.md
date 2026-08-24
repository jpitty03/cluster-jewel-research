# Post Phase 2D Completion-Report Review and Phase 2E Fracture-Fidelity Plan

## Status / Source of Truth

Remote `origin/main` was reviewed at:

- `6b8d4e0ab0b4d5e8b9219c68486e38d534c000ae` — `docs: checkpoint phase 2d acquisition synthesis and plan integration`
- implementation beneath it: `aa5ed97c29faf418757ee9b98cf0b292b5dc0f4b` — standalone executable acquisition-synthesis checkpoint

The supplied Phase 2D completion report states that the completed integration exists locally at:

- `304784e893bee6758e28c2bafe222c98471f887d` — `feat: integrate executable fracture acquisition ranking`

but also explicitly states that this commit is **local-only and one commit ahead of `origin/main`**.

Therefore this review has two evidence levels:

1. **Code-reviewed remote checkpoint:** `aa5ed97...` / `6b8d4e0...`.
2. **Completion-report-reviewed local integration:** `304784e...`, which cannot be directly inspected through GitHub until it is pushed.

Do not claim that `304784e...` has received a complete source-level review until it is present on GitHub.

This document is the next-step source of truth after the Phase 2D integration report. It should be cherry-picked onto `main` after `304784e...` is pushed.

No unit-test work is requested.

---

# Executive Verdict

## Phase 2D architecture: STRONG PASS

The supplied completion report shows that the main Phase 2D architectural goals were achieved:

- executable self-fracture synthesis participates in the normal optimizer path;
- pre-fractured market purchase no longer affects core ranking;
- the legacy `0.11c + 10c + fixed 4x` self-fracture estimate no longer affects normal ranking;
- wrong-fracture outcomes recover through actual restart/reacquisition;
- the expected `4` Fracturing Orbs and `3` failed-attempt restarts emerge from shared transitions rather than a hardcoded multiplier;
- multiple fracture candidates are independently synthesized;
- persistent graph extension eliminates repeated round expansion in the standalone fracture fixture;
- one-mod, two-mod, final-state semantics, Harvest parity, Fracturing parity, Craft A, and Craft C remained healthy;
- build, lint, and production browser/worker smoke all passed according to the completion report.

That is a substantial improvement over the old approximate acquisition layer.

## Fracture economics: NOT YET PRODUCT-TRUSTWORTHY

The new executable route is mechanically real, but its current economics are not mature enough to treat the resulting self-fracture cost as a high-confidence estimate.

The completion report itself identifies the key blocker:

> the modeled action set lacks an authoritative cheap Crafting Bench filler corresponding to the historical preparation assumption.

The current standalone fixture reports approximately:

```text
certified executable incumbent U: 12,797.76c
optimistic lower bound L:            10.235c
historical approximate reference:  1,538.95c
```

The large discrepancy does **not** prove that the executable mechanics are wrong. The policy is certified as executable, but global modeled-action optimality remains unproven, and a materially important preparation mechanic is missing.

Accordingly, Phase 2D should be considered complete as an **integration architecture phase**, but broader productization should not use the current ~12.8k self-fracture figure as if it were a trustworthy economic optimum.

## Recommended next phase

> **Phase 2E — Authoritative Crafting Bench Support, Fracture-Preparation Fidelity, and Acquisition Proof Hardening**

Do not spend the next phase on broad UI polish or another speculative search-frontier rewrite.

---

# Verified Phase 2D Completion-Report Results

The supplied completion report states the following.

## Build / browser

```text
npm run build: PASS
npm run lint: PASS
production browser + worker smoke: PASS

one-mod browser:      ~820ms
two-mod Any browser:  ~1,891ms
no-unwanted browser:  ~1,764ms
```

The only reported lint issue is a pre-existing `policyEngine.ts` warning.

## Core integration

Normal `OptimizerService` flow now invokes `synthesizeAcquisition()` during staged acquisition work.

The report states:

```text
legacy formula: diagnostic-only
pre-fractured market purchase: dormant / not part of core ranking
UI fractured-price inputs: removed
```

This matches the permanent product direction:

> a fractured route exists because the optimizer can manufacture the fractured state itself.

## Standalone executable fracture fixture

Reported result:

```text
expected total acquisition EV:     12,797.759749c
expected preparation EV:           12,787.759749c
optimistic lower bound:                 10.234997c
expected Fracturing Orbs:                3.999999994
expected failed/restart attempts:         2.999999996
```

Wrong-fracture recovery reportedly:

- does not Scour away a fracture;
- does not mutate the item back to an unfractured state;
- abandons/reacquires and repays the clean-base cost.

That is the correct recovery semantics.

## Multiple fracture targets

The report states that at least two requested modifier families were independently synthesized and certified before downstream competition.

This is an important genericity check: fracture candidate generation is not tied to one Craft A modifier.

## Persistent graph extension

Standalone synthesis reportedly used:

```text
expansion mode: PERSISTENT_EXTENDED
canonical states: 5,001
cumulative expansions: 5,001
repeated states: 0
rounds: 3
runtime: ~19.0s
```

This is a strong result versus the previous `REBUILT_EACH_ROUND` architecture.

## Existing regressions

Reported healthy:

```text
R1 one-mod T1 ES:
clean base, acquisition-safe, proper, absorbing, reconciled

R2 two-mod Any:
clean base, acquisition-safe, proper, absorbing, reconciled

R3 no-unwanted:
clean base, acquisition-safe, proper, absorbing, reconciled

Fracturing parity:
external 25.0000%
analytical 25.0000%
seeded MC 24.9550%
ALIGNED

Craft A:
7623.7c analytical / 7568.1c pooled MC / -0.73%

Craft C:
42814.4c analytical / 42483.5c pooled MC / -0.77%
```

Forced-Rare two-mod remains appropriately provisional/acquisition-unsafe rather than being mislabeled as proven.

---

# Finding 1 — Crafting Bench Support Is Now The Highest-Priority Mechanics Gap

## Severity

**CRITICAL for fracture-acquisition economics**

The current executable self-fracture incumbent is roughly `12.8k chaos`, versus an old approximate reference near `1.5k chaos`.

Do not tune the solver toward the old value.

However, the completion report identifies a concrete missing mechanic that plausibly explains a large part of the difference:

```text
cheap Crafting Bench filler used during legal fracture preparation
```

The old preparation estimate effectively assumed this capability via a flat allowance. The executable solver correctly refuses to invent that step because no authoritative Bench action currently exists.

The next phase should therefore model the missing mechanic from authoritative data rather than compensate with another heuristic.

---

# Phase 2E Priority 1 — Add Authoritative Generic Crafting Bench Mechanics

## Goal

The shared action registry must be able to represent the legal Bench filler actions that can participate in fracture preparation.

Do **not** implement a special action named something like:

```text
cheap_fracture_filler
```

or a Craft A-specific preparation action.

The engine should model real Crafting Bench actions and let generic search decide whether one is useful.

## Data requirements

Before implementation, source and record authoritative information for each Bench action used by the optimizer, including at least:

```text
modifier identity / stat
prefix or suffix generation type
mod-group exclusions
item/base applicability
required level or other eligibility conditions
currency cost
whether it counts toward explicit-affix capacity
crafted-mod restrictions
whether an existing crafted modifier must be replaced/removed first
interaction with Scour
interaction with Fracturing Orb eligibility and random selection
```

Do not infer any uncertain Fracturing-Orb interaction with crafted modifiers.

If the repository's existing PoEDB/game-data snapshot contains this information, derive the action from that source. If not, add a clearly documented authoritative fixture/source before adding mechanics.

## State representation

If mechanically necessary, extend `RolledMod` / `ItemState` with an explicit crafted-mod property rather than encoding crafted state in names or IDs.

Canonical identity must preserve any crafted property that affects:

- action legality;
- mod-group blocking;
- Fracturing Orb selection;
- Scour behavior;
- Bench replacement/removal behavior.

Do not merge crafted and naturally rolled physical states if downstream mechanics distinguish them.

## Scope

A minimal authoritative subset is acceptable if it is enough to validate the fracture-preparation use case, provided it is still generic and data-driven.

Do not attempt to implement every possible Bench craft if that materially expands scope before the acquisition fixture is validated.

---

# Phase 2E Priority 2 — Re-run Executable Fracture Synthesis With Bench Available

Once Bench mechanics exist, rerun the exact standalone fracture fixture under the same controlled prices.

Report before/after:

```text
certified executable incumbent U
optimistic lower bound L
expected Transmutations
expected Alterations
expected Augmentations
expected Regals
expected Bench crafts
expected Exalts
expected Fracturing Orbs
expected Scours
expected restarts
states
runtime
properness
absorption
reconciliation
global optimality proof
```

The expected Fracturing Orb count should continue to emerge from actual transition behavior.

Do not hardcode `4` attempts merely because the external fixture is 25%.

## Acceptance interpretation

A substantially cheaper executable incumbent after Bench support is expected to be plausible, but no target cost is prescribed.

The correct acceptance test is:

> the chosen preparation route is executable using authoritative shared mechanics and its EV is internally reconciled.

Not:

> the result must equal the historical ~1533c estimate.

---

# Finding 2 — Verify Unresolved Synthesis Lower Bounds Survive Product Integration

## Severity

**CRITICAL for proof-honest acquisition safety**

The completion report says:

> only resolved synthesis enters ranking.

That wording requires source-level verification once `304784e...` is pushed.

The prior Phase 2D contract required an unresolved self-fracture candidate to remain visible as lower-bound/provisional evidence rather than disappearing from economic competition.

If an unresolved fracture acquisition has:

```text
L_fracture < U_current_incumbent
```

then the optimizer must not call the acquisition choice safe merely because the fracture family lacks a certified executable upper bound.

## Required service behavior

Maintain separate concepts:

```text
resolved executable fracture candidate:
  has finite U
  can be selected as recommendation

unresolved fracture candidate:
  has lower bound L
  cannot be presented as executable
  can still prevent acquisition-safe/proven status
```

If the local implementation already does this through a side-channel/proof structure, document it explicitly.

If unresolved synthesis is fully discarded before acquisition-safety classification, fix that before Phase 2E is considered complete.

## Required diagnostic

Create a controlled fixture where:

```text
clean or another acquisition has certified U
fracture synthesis remains unresolved
fracture lower bound L < U
```

Expected result:

```text
recommendation may show the executable incumbent
acquisition safe = NO
status = PROVISIONAL_RESOLVED or equivalent
unresolved fracture lower bound is shown
```

No fake finite fracture cost may be invented.

---

# Finding 3 — The Current U/L Gap Is Too Large To Treat Fracture Cost As Optimized

The current standalone numbers are approximately:

```text
U = 12,797.76c
L =     10.235c
```

This means the engine has proven an executable route, not a tight economic optimum.

This distinction is currently being reported correctly and must remain explicit.

## Search work should come after Bench fidelity

Do not immediately launch another broad frontier-priority experiment.

Bench support changes the reachable preparation policy and likely changes the best incumbent dramatically. Search-quality work performed before that mechanic exists risks optimizing around the wrong action space.

After Bench support, inspect the new gap.

Only if a large gap remains should Phase 2E continue into targeted search improvement.

Acceptable generic directions include:

- acquisition-specific feasible-policy seeding using only shared legal actions;
- prioritizing states that satisfy the desired unfractured target and are closest to a legal fracture source;
- improved lower bounds for fracture preparation;
- continuation-value warm starts on persistent graph extension;
- budget staging between feasible-U discovery and proof search.

Do not add modifier-specific or Craft-specific paths.

Do not reintroduce the previously reverted frontier experiments without a new diagnostic proving they improve the actual post-Bench fixture.

---

# Finding 4 — Performance Is Acceptable For A Research Fixture, Not Yet Ideal For Product Fracture Discovery

The standalone synthesis takes roughly `19s` at `5,001` states.

The normal browser regressions remain fast, which indicates staging is preventing simple crafts from paying the full fracture-synthesis cost.

Preserve that property.

## Phase 2E performance requirements

Continue reporting acquisition-stage timing separately from downstream optimization.

For multi-fracture targets report:

```text
candidate count
budget allocated per candidate
cache hits/misses
synthesis wall time per candidate
total acquisition-stage time
downstream search time
```

The existing exact-context worker cache is a reasonable checkpoint architecture. Do not weaken its identity merely to increase hit rate.

After mechanics fidelity is corrected, optimize latency only where measurements show a meaningful product bottleneck.

---

# Phase 2E Priority 3 — Preserve The Self-Fracture-Only Product Rule

The permanent product rule remains:

> **If strategy discovery uses a fractured state, core optimization manufactures it through self-fracturing.**

Do not restore pre-fractured market purchase to normal ranking.

Dormant compatibility fields may remain temporarily if deleting them would create unrelated churn.

The UI should not ask for fractured-base market prices in normal operation.

---

# Phase 2E Required Diagnostics

## Diagnostic A — Authoritative Bench legality

For each newly modeled Bench action used by the fracture fixture, print:

```text
action ID / name
prefix or suffix
currency cost + provenance
legal starting state
resulting state
mod groups
crafted-state representation
explicit affix count before/after
Fracturing Orb legality after Bench
Fracturing Orb candidate set / selection behavior
Scour result
```

This diagnostic should make any uncertainty in crafted/fracture interaction obvious.

## Diagnostic B — Fracture synthesis before vs after Bench

Use the existing standalone T1 Intelligence fixture and report the full EV/action-usage comparison.

## Diagnostic C — Wrong fracture recovery with crafted filler

Prove that a wrong fracture still requires abandonment/restart and that no crafted-state shortcut removes a permanent wrong fracture.

## Diagnostic D — Unresolved fracture lower-bound propagation

Use the proof-honesty fixture described above.

## Diagnostic E — Multiple fracture candidates

Preserve independent synthesis for at least two relevant requested modifiers with no market quote required.

## Diagnostic F — Fracturing Orb parity

Preserve:

```text
external: 25%
analytical: 25%
seeded MC: statistically aligned
```

## Diagnostic G — Persistent extension

Report:

```text
canonical states
new states per round
cumulative expansion work
repeated states
transition reuse
round count
mode
```

Persistent extension should remain correctness-preserving after crafted-state identity is introduced.

---

# Regression Matrix

## R1 — One-mod T1 ES

Must remain:

```text
clean base
acquisition-safe
proper
absorbing
reconciled
fast browser response
```

## R2 — Two-mod T1 ES + T1 Int, Any

Must remain clean-base and acquisition-safe under the established fixture.

## R3 — Two-mod no-unwanted

Final-state cleanliness semantics must remain intact.

## R4 — Forced-Rare two-mod

Report:

```text
selected executable incumbent
clean U/L
fracture U/L for each relevant target
acquisition safety
runtime
states
```

A provisional result is acceptable.

## R5 — Harvest B1/B2/B3 parity

Preserve raw-presence / one-Annul semantics and `CLOSE / APPROXIMATE` labels.

## R6 — Fracturing parity

Preserve shared-mechanic 25% behavior.

## R7 — Craft A

Keep the mature policy regression stable, but separately report the updated executable fracture-acquisition economics after Bench support.

Do not tune the generic acquisition result to preserve the historical Craft A total.

## R8 — Craft C

Preserve the mature regression.

## R9 — Browser / build

Run:

```text
npm run build
npm run lint
production browser + worker smoke
```

No unit tests are requested.

---

# Phase 2E Completion Gates

Phase 2E is complete when:

- [ ] `304784e...` has been pushed and source-reviewed on live `main`;
- [ ] unresolved acquisition-synthesis lower-bound propagation has been verified or fixed;
- [ ] at least the fracture-relevant Crafting Bench subset is modeled from authoritative data;
- [ ] crafted-state identity preserves every mechanics-relevant distinction;
- [ ] Bench cost uses normal `PriceBook`/provenance rather than a hidden flat allowance;
- [ ] Fracturing Orb interaction with crafted modifiers is explicitly sourced and modeled;
- [ ] Scour/cleanup interaction with crafted modifiers is modeled correctly;
- [ ] executable fracture synthesis is rerun with Bench available;
- [ ] self-fracture preparation EV is derived only from shared executable actions;
- [ ] fixed `4x` retry economics remain absent from normal ranking;
- [ ] pre-fractured market purchase remains absent from normal core ranking;
- [ ] wrong-fracture restart economics remain correct;
- [ ] persistent graph extension remains correct with crafted-state identity;
- [ ] standalone U/L/proof status is reported honestly;
- [ ] one-mod regression remains healthy;
- [ ] two-mod Any regression remains healthy;
- [ ] no-unwanted semantics remain healthy;
- [ ] forced-Rare remains proof-honest;
- [ ] Harvest parity remains unchanged;
- [ ] Fracturing parity remains aligned;
- [ ] Craft A remains healthy;
- [ ] Craft C remains healthy;
- [ ] `npm run build` passes;
- [ ] `npm run lint` passes apart from explicitly documented pre-existing warnings;
- [ ] production browser/worker smoke passes;
- [ ] no unit tests were added;
- [ ] no Craft-specific solver branches were added.

---

# Required Completion Report

When Phase 2E is complete, report:

1. commit SHA;
2. files changed;
3. authoritative Bench data source/provenance;
4. exact Bench mechanics implemented;
5. crafted-state representation/canonical identity changes;
6. Bench cost/provenance behavior;
7. Fracturing Orb behavior with crafted modifiers;
8. Scour behavior with crafted modifiers;
9. unresolved synthesis lower-bound propagation behavior;
10. standalone fracture EV before Bench;
11. standalone fracture EV after Bench;
12. optimistic lower bound before/after;
13. expected action usage before/after;
14. expected Fracturing Orbs and restarts;
15. selected preparation policy;
16. properness/absorption/reconciliation;
17. global modeled-action optimality status;
18. persistent graph metrics;
19. acquisition-stage timing/caching metrics;
20. multi-fracture result;
21. forced-Rare result;
22. one-mod browser result;
23. two-mod Any browser result;
24. no-unwanted result;
25. Harvest parity;
26. Fracturing parity;
27. Craft A regression;
28. Craft C regression;
29. build/lint/browser results;
30. remaining mechanics/search blockers before broader UI productization.

---

# Constraints

Do not:

- add unit tests;
- add Craft A/C-specific acquisition branches;
- reintroduce pre-fractured market purchase into normal ranking;
- reintroduce the old `0.11c + 10c + fixed 4x` estimate into normal ranking;
- hardcode a cheap Bench filler without authoritative mechanics/data;
- infer uncertain crafted-mod/Fracturing-Orb interactions;
- tune executable fracture EV toward the historical approximate value;
- call a route globally optimal merely because it is executable/certified;
- discard unresolved acquisition evidence if its lower bound can affect recommendation safety;
- sacrifice canonical identity correctness to increase cache hits;
- broadly rewrite mature Craft A/C policy code;
- change Harvest external fixture semantics.

---

# Recommended Implementation Order

```text
0. Push local Phase 2D completion commit 304784e... to origin/main.
1. Cherry-pick this review-plan document onto the pushed main.
2. Source-review the pushed Phase 2D integration, especially unresolved synthesis propagation.
3. Source authoritative fracture-relevant Crafting Bench data/mechanics.
4. Add generic Bench action/state support.
5. Integrate Bench actions into acquisition synthesis.
6. Re-run standalone fracture diagnostics and compare U/L/action usage.
7. Fix proof/search issues only if the post-Bench fixture still shows a material unresolved gap.
8. Run multi-fracture + forced-Rare diagnostics.
9. Run R1-R9 regressions.
10. Run build/lint/production browser+worker smoke.
11. Commit regenerated diagnostics and Phase 2E completion report to main.
```

The main goal is now **mechanics fidelity before further optimizer cleverness**. The Phase 2D architecture has created a real executable fracture route; Phase 2E should make the economics of preparing that route trustworthy enough to drive product recommendations.