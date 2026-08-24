# Phase 2D Acquisition Synthesis Checkpoint and Integration Plan

## Status / Source of Truth

Current `main` reviewed at:

- `aa5ed97c29faf418757ee9b98cf0b292b5dc0f4b` — executable acquisition-synthesis/search checkpoint
- prior Phase 2D plan: `docs/crafting-engine/POST_PHASE2C_REVIEW_AND_PHASE2D_EXECUTABLE_FRACTURE_ACQUISITION_PLAN.md`

This document is the continuation source of truth for the unfinished portion of Phase 2D. It does **not** replace the architectural constraints in the prior Phase 2D plan; it records what has actually landed, what is now proven, what experiments were intentionally reverted, and the shortest path to finish integration safely.

No unit-test work is requested.

---

# Executive Verdict

## Checkpoint status: PASS FOR THE STANDALONE SYNTHESIS LAYER

The new executable acquisition-synthesis layer is real and useful. The current tree compiles cleanly with `tsc -b`, and the generic self-fracture fixture now produces a fully executable, proper, absorbing, cost-reconciled policy.

However, Phase 2D is **not yet integrated into the product path**.

The major remaining gap is very clear:

> `synthesizeAcquisition()` exists and can certify an executable self-fracture policy, but `strategyDiscovery` / `optimizerService` still rank fractured starting states using the old approximate formula and still retain pre-fractured market-purchase plumbing.

Therefore the next implementation pass should focus on integration and diagnostics, not another broad search-algorithm experiment.

---

# What Landed In `aa5ed97...`

The checkpoint added or materially changed:

- `crafting-engine/src/solver/acquisitionSynthesis.ts`
- `crafting-engine/src/solver/genericSearch.ts`
- `crafting-engine/src/solver/targetFeasibility.ts`
- acquisition/search probe scripts
- persistent graph-extension/search support
- improper-policy elimination diagnostics/cadence

The new acquisition synthesis is generic. It does not know about Craft A/C or a specific modifier. It models a desired fractured reusable physical state using the existing target contract:

```text
required modifier is fractured
+
max unmatched affixes = 0 by default
```

The executable action family is shared mechanics, including:

```text
Transmutation
Alteration
Augmentation
Regal
Exalted Orb
Annulment
Scour
Chaos Orb where legal
Fracturing Orb
Restart / Reacquire
```

Wrong fractures are permanent on the item, so the modeled recovery path is abandonment/reacquisition rather than an impossible in-place reset.

This is the correct architectural direction.

---

# Certified Standalone Self-Fracture Checkpoint

Current default acquisition-synthesis probe for:

```text
AfflictionJewelSmallPassivesGrantInt3
```

reported:

```text
status: RESOLVED
selectedPolicyProper: true
terminalAbsorptionProbability: 1
selectedPolicyStatus:
FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED

expected full acquisition EV:
12797.759748632898c

expected preparation / downstream-from-owned-clean-base EV:
12787.759748632898c

optimistic lower bound:
10.234997862513523c

expected clean-base restarts:
3.0

expected Fracturing Orbs:
4.0

states:
5001

runtime:
~18.2s
```

The `3.0` expected restarts and `4.0` expected Fracturing Orbs are especially important: they now emerge from the actual Fracturing Orb transitions plus restart policy instead of a hardcoded `4x` expected-attempt multiplier.

That satisfies the core executable-retry requirement.

---

# Critical Interpretation Of The 12,797c Result

Do **not** treat `12797.76c` as the true optimal cost of self-fracturing this modifier.

The current result proves:

> there is a complete executable, proper, absorbing and internally reconciled route costing about 12,798c under this modeled price/mechanics/search context.

It does **not** prove:

> no cheaper modeled self-fracture route exists.

The gap is explicit:

```text
certified incumbent U: ~12797.76c
optimistic lower bound L: ~10.235c
global optimality: NOT YET PROVEN
unresolved candidates may still beat the incumbent
```

Therefore this value is the **best fully resolved executable route currently found**, not a global optimum.

This distinction must survive service/UI integration.

The old historical approximate self-fracture reference around `~1533c` must not be used to tune the executable search. A large discrepancy is allowed and must be reported honestly. Possible explanations include:

- unresolved cheaper search branches;
- missing modeled preparation mechanics such as a cheap authoritative bench filler;
- different active currency prices;
- different preparation/recovery policy;
- incomplete modeled-action coverage.

Do not force the new engine back toward the historical estimate.

---

# Search Experiments That Were Intentionally Reverted

Two speculative frontier changes were tested and reverted:

1. heap re-push when a frontier state is promoted;
2. on-policy missing-successor prioritization in `collectCompetitiveMissingStateKeys`.

Both degraded the default synthesis from a certified policy into:

```text
NO FULLY RESOLVED POLICY FOUND
```

with much larger work, including approximately:

```text
20,000 states
~592 seconds
```

Larger state budgets such as `8k / 12k / 20k` with small per-round budgets also retained an improper policy rather than improving the certified result.

## Binding continuation rule

Do **not** reintroduce either reverted frontier experiment as part of the next integration pass.

Do not assume that simply increasing the state budget monotonically improves this fixture under the current solve/elimination cadence.

The known `5001`-state certified configuration is acceptable as the executable checkpoint. Treat larger-budget improper behavior as a documented search-quality limitation, not as a blocker to wiring the already-certified policy into the product.

Search-quality research can continue later with isolated diagnostics.

---

# Verified Remaining Product Gap

`strategyDiscovery.ts` still contains the legacy self-fracture ranking formula.

Its current shape still derives approximately:

```text
expected target Alterations from weight
prepCostPerAttempt = expectedAlts * 0.11 + 10
selfFracCost = 4 * (cleanBase + prep + fractureCost)
```

and it still adds a market-purchase acquisition method when a fractured-base quote exists.

This conflicts with the current permanent product rule:

> **When core strategy discovery wants a fractured starting state, manufacture it through executable self-fracture. Do not require or normally compare a pre-fractured market purchase.**

Repository search also confirms that `synthesizeAcquisition` is currently referenced by its module and probe script, not by normal strategy discovery / optimizer ranking.

So the next step is integration, not invention.

---

# Next Implementation Step — Wire Executable Synthesis Into Core Strategy Discovery

## Goal

Replace the economic method attached to every fractured physical candidate.

Current:

```text
fractured physical candidate X
  -> approximate formula self-fracture
  -> optional market purchase
```

Required core behavior:

```text
fractured physical candidate X
  -> executable search-derived self-fracture synthesis
```

The downstream physical state remains the same reusable fractured state. Only its acquisition method/economics change.

## Required flow

For every mechanically relevant requested modifier that can be used as a fracture candidate:

```text
1. Discover desired reusable fractured physical state.
2. Build acquisition-synthesis request from the same base/enchant/ilvl/passives.
3. Use the active PriceBook and active clean-base price/provenance.
4. Solve self-fracture acquisition through shared mechanics.
5. Attach the resolved executable acquisition EV/provenance to that fractured candidate.
6. Feed that physical candidate into normal downstream strategy competition.
```

Do not create Craft-specific fracture branches.

---

# Integration Architecture Requirement — Avoid Naive N × 18s Product Latency

The standalone synthesis currently takes roughly 18 seconds for one known fixture.

A target with multiple plausible fracture candidates must not blindly run several full 18-second synthesis searches sequentially with no global budget governance.

For example, four fracture candidates could otherwise turn one recommendation into a minute-plus pre-search before downstream optimization even begins.

The implementation must therefore make acquisition synthesis budget-aware.

Acceptable directions include:

- fair per-fracture-candidate synthesis budgets from a shared acquisition-stage budget;
- memoization by physical requirement + base/enchant/ilvl/passives + price/mechanics context;
- reuse of compatible transition/search work where correctness allows;
- staged synthesis that resolves a feasible executable U before spending time on broader proof.

Do not add unsafe cross-target canonical reuse merely for speed.

## Minimum acceptable Phase 2D behavior

A fractured family with a certified synthesis result may enter ordinary route ranking using that executable U.

An unresolved fracture synthesis must **not** silently fall back to the old approximate formula as if it were equivalent proof.

If unresolved synthesis must be surfaced, keep its lower bound/provisional status explicit. Do not turn a lower bound into a finite executable acquisition cost.

---

# Legacy Formula Policy

The legacy formula may temporarily remain only as a diagnostic/reference comparison.

It must no longer determine normal product ranking after integration passes.

Specifically, normal ranking must no longer depend on hidden constants such as:

```text
Alteration = 0.11c
prep allowance = 10c
expected attempts = fixed 4.0
Fracturing Orb fallback literal
```

Once an executable synthesis result is available, that result is the acquisition method.

For Diagnostic F, retain/report the old estimate only so the completion report can explain why the executable certified route differs.

---

# Pre-Fractured Market Purchase Policy

Core optimization should stop using pre-fractured market purchase as a normal competing acquisition path.

The existing plumbing may remain dormant for possible future advanced functionality, but it must not be required for a route to exist and should not affect normal ranking.

Required core invariant:

```text
fractured route exists because the optimizer can manufacture it
```

not:

```text
fractured route exists only if a matching trade listing/quote exists
```

The UI should no longer require the user to supply per-target fractured-base prices for core discovery.

Do not spend this checkpoint deleting every historical type/property if doing so creates unnecessary churn. It is acceptable to leave dormant compatibility fields while removing them from the core ranking path.

---

# Diagnostics Required Before Phase 2D Completion

## Diagnostic A — Standalone single-target executable fracture

Use the known fixture and report:

```text
target modifier
status
expected total acquisition EV
expected preparation EV
optimistic lower bound
expected action usage
expected restarts
expected Fracturing Orbs
properness
terminal absorption
Bellman convergence
occupancy convergence
EV reconciliation
states/runtime
proof/global-optimality status
```

Keep the known certified configuration available as a regression.

## Diagnostic B — Wrong-fracture recovery

Demonstrate explicitly that wrong-fracture outcomes:

```text
do not magically Scour the fracture away
do not mutate back to an unfractured item
pay restart/reacquisition economics
```

The current expected `4` Fracturing Orbs / `3` restarts is useful evidence for a four-affix fracture source.

## Diagnostic C — Multiple fracture-target portfolio

Use a final target with at least two requested modifiers that are legal fracture candidates.

Show that core discovery generates each relevant self-fracture family independently and sends the complete route families into downstream ranking.

No market-fracture quote should be required.

## Diagnostic D — No-market-quote product gate

Run normal optimizer/service flow with no fractured-base market prices supplied.

Prove that fractured route discovery still occurs through executable self-fracture.

This is a mandatory product requirement.

## Diagnostic E — Existing external Fracturing Orb parity

Preserve the external fixture:

```text
250 / 1000
25% desired fracture on a four-mod item
```

Shared analytical and seeded mechanics must remain aligned with 25%.

Do not use this empirical fixture as a hardcoded acquisition multiplier.

## Diagnostic F — Legacy estimate comparison

For the known self-fracture fixture, report both:

```text
legacy approximate reference
current executable certified incumbent
```

The report must explicitly state that the executable incumbent currently has:

```text
globalOptimality = NOT YET PROVEN
unresolvedCandidatesCouldBeatIncumbent = true
```

Therefore a large difference from the old `~1533c` reference does not by itself prove the new mechanics are wrong.

Also report any known missing mechanic that could materially inflate the current executable route.

---

# Normal Optimizer Integration Acceptance

After synthesis is wired in, regenerate the normal product diagnostics.

## R1 — One-mod T1 ES

Must remain healthy:

```text
clean-base recommendation
proper
absorbing
reconciled
good browser runtime
```

Fracture synthesis should not make a simple one-mod craft slower merely because a fractured family exists off-policy. Use staging/budgeting appropriately.

## R2 — Two-mod T1 ES + T1 Int, Any rarity

Must continue to resolve the clean-base family as the acquisition-safe normal recommendation under the existing fixture.

Do not regress to a fractured route because integration changed acquisition staging.

## R3 — Two-mod no-unwanted

Preserve final-state cleanliness semantics.

## R4 — Forced-Rare two-mod

Report the new result. It may remain provisional.

Compare:

```text
winner
fractured-family acquisition EVs
clean lower bound/upper bound
runtime
states
acquisition safety
```

Do not hardcode a preferred winner.

## R5 — Harvest parity

Preserve all Phase 2C raw/one-Annul semantics and confidence labels.

## R6 — Fracturing parity

Preserve the 25% shared-mechanic behavior.

## R7 — Craft A

Preserve mature Craft A policy regression health.

In addition, report how executable self-fracture acquisition changes the fracture-acquisition economics compared with the historical approximate acquisition reference.

Do not tune the synthesis result to keep Craft A's old total unchanged.

## R8 — Craft C

Preserve mature Craft C regression health.

## R9 — Build / browser

Run:

```text
npm run build
npm run lint
production browser + worker smoke
```

The current `tsc -b` checkpoint is encouraging but is not the final Phase 2D validation gate.

---

# Persistent Search Status

The current checkpoint added support for:

```text
PERSISTENT_EXTENDED
```

in addition to the old rebuilt-round mode.

Do not broadly redesign persistent graph extension during this continuation unless integration exposes a concrete correctness blocker.

The immediate product value is to finish executable self-fracture integration first.

For the completion report, record whether the acquisition-synthesis fixture used persistent extension and report:

```text
final canonical states
cumulative expansion work
repeated states expanded
round count
expansion mode
```

---

# Search-Quality Limitation To Preserve Honestly

A certified proper policy at 5001 states while larger configurations can become improper is a real search/solve limitation worth documenting.

It is not acceptable to hide it, but it is also not necessary to solve it before integrating a certified executable route.

For this phase:

```text
selected executable policy certification
```

and:

```text
global modeled-action optimality proof
```

remain separate dimensions.

A result can legitimately be:

```text
EXECUTABLE / PROPER / ABSORBING / RECONCILED
GLOBAL OPTIMALITY NOT PROVEN
```

The service/UI must preserve this distinction.

---

# Recommended Implementation Order From This Checkpoint

```text
1. Wire acquisition synthesis into fracture candidate economics.
2. Remove legacy approximate self-fracture formula from normal ranking.
3. Remove pre-fractured market purchase from normal core ranking.
4. Add shared acquisition-stage budget/caching so multiple fracture candidates do not multiply latency unchecked.
5. Preserve unresolved synthesis as provisional/lower-bound evidence rather than substituting a fake finite cost.
6. Generate Diagnostics A-F.
7. Run R1-R9 regressions.
8. Run npm build/lint and production browser+worker smoke.
9. Write Phase 2D completion report.
10. Commit implementation and regenerated outputs to main.
```

Do not detour into another large frontier-priority experiment unless one of these steps is blocked by a reproducible correctness failure.

---

# Phase 2D Completion Gates From This Checkpoint

Phase 2D is complete when:

- [ ] `synthesizeAcquisition()` participates in normal fractured-route economics;
- [ ] every core fractured family uses executable self-fracture rather than the old formula;
- [ ] pre-fractured market purchase does not participate in normal core ranking;
- [ ] no fractured-base market quote is required for route discovery;
- [ ] self-fracture retry/restart cost comes from shared transitions;
- [ ] wrong-fracture recovery is executable and pays clean-base reacquisition cost;
- [ ] resolved synthesis proof/provenance is surfaced distinctly;
- [ ] unresolved synthesis is not silently replaced by a legacy estimate;
- [ ] multi-fracture targets are budgeted fairly enough to avoid one candidate starving all others;
- [ ] Diagnostic A passes;
- [ ] Diagnostic B passes;
- [ ] Diagnostic C passes;
- [ ] Diagnostic D passes;
- [ ] Diagnostic E passes;
- [ ] Diagnostic F explains the old-vs-new EV discrepancy honestly;
- [ ] R1 one-mod remains healthy;
- [ ] R2 two-mod Any remains healthy;
- [ ] R3 no-unwanted remains healthy;
- [ ] R4 forced-Rare result is reported proof-honestly;
- [ ] R5 Harvest parity is preserved;
- [ ] R6 Fracturing parity is preserved;
- [ ] R7 Craft A remains healthy;
- [ ] R8 Craft C remains healthy;
- [ ] R9 build/lint/browser passes;
- [ ] no unit tests are added;
- [ ] no Craft-specific solver branches are added.

---

# Required Completion Report

When the continuation is complete, report at minimum:

1. commit SHA;
2. files changed;
3. `npm run build` result;
4. `npm run lint` result;
5. production browser/worker smoke result;
6. where `synthesizeAcquisition()` is now invoked in normal product flow;
7. how acquisition synthesis budgets are allocated across multiple fracture candidates;
8. whether any synthesis results are cached/reused and the exact cache identity;
9. whether the legacy self-fracture formula still affects normal ranking;
10. whether market-fractured purchase still affects normal ranking;
11. standalone executable self-fracture EV;
12. standalone lower bound and global-optimality status;
13. expected Fracturing Orbs;
14. expected restarts;
15. wrong-fracture recovery behavior;
16. multi-fracture candidate result;
17. no-market-quote result;
18. external 25% Fracturing parity result;
19. legacy ~1533c comparison and explanation;
20. any missing mechanic materially biasing fracture preparation economics;
21. expansion mode / states / cumulative work / repeated work for synthesis;
22. one-mod result;
23. two-mod Any result;
24. two-mod no-unwanted result;
25. forced-Rare two-mod result;
26. Harvest parity result;
27. Craft A result;
28. Craft C result;
29. any remaining search-quality limitations;
30. whether Phase 2D is ready to close.

---

# Binding Constraints

Do not:

- add unit tests;
- add Craft-specific solver branches;
- reintroduce pre-fractured market purchase into normal core ranking;
- require fractured-base market quotes;
- use the old `0.11c / +10c / fixed 4x` formula as the normal acquisition answer;
- hardcode 25% or `4x` into executable acquisition EV;
- tune executable synthesis to the historical ~1533c reference;
- call a certified executable incumbent globally optimal when unresolved competitors can beat it;
- substitute an unresolved lower bound for an executable acquisition cost;
- reintroduce the reverted frontier experiments as part of ordinary integration;
- spend another multi-minute/20k-state search experiment unless a concrete integration correctness issue requires it;
- regress Phase 2C final-state semantics or external parity interpretation;
- sacrifice canonical correctness merely to reduce latency.

The immediate objective is to finish the product connection from **generic executable self-fracture synthesis** to **normal optimizer route ranking**, then validate the whole system end-to-end.