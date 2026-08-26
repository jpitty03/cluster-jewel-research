# Post-Phase 2X Field Review and Phase 2Y Plan

## Phase 2Y — Proof Efficiency, Budget Telemetry, Equivalent-Policy Presentation, and Player Route Naming

Baseline reviewed: `f5891cb4841ee83f215274b31b13023ad228a4a7` on `main`.

Primary real-user field evidence reviewed:

```text
new-3-banger.pdf
```

Exact handoff fixture:

- Large Cluster Jewel;
- `12% increased Chaos Damage`;
- 8 passives;
- ilvl 75;
- Rare;
- extra affixes allowed;
- Dark Ideation + Unspeakable Gifts + Wicked Pall;
- source completed-jewel sampled low: `3416c`;
- Allflame source quote timestamp: `2026-08-26T05:41:54.304Z`;
- search depth: Research (`50,000 states / 300s / 6 rounds`);
- selected executable route: self-fracture Unspeakable Gifts;
- full-route EV: `1648.171c`;
- expected physical actions: `3007`;
- estimated manual time: `1221.1s`;
- result remains provisional because three acquisition families retain admissible lower bounds below the incumbent.

No unit tests are to be added or run unless the user explicitly reverses that standing project constraint.

---

# 1. Executive Verdict

Phase 2X is **CLOSED / PASS**.

The field PDF confirms the important Phase 2X corrections in an unrelated real craft:

- the phantom-Harvest bug is gone;
- the selected Constellation route contains only real selected mechanics;
- no `SPECIALIZED -> Harvest` fallback appears;
- the chronological guide is consistent with the selected self-fracture route;
- the Market vs Craft card uses the selected executable route EV rather than claiming global optimality;
- Search-depth presets and the next-depth preview are visible and usable;
- full-route accounting reconciles to `0.000c`.

The new limiting factor is no longer plan correctness. It is **proof efficiency and proof-budget transparency**.

The Research run spent about `254.2s` and still returned:

```text
incumbent U = 1648.171c
best competitive L = 10.148c
potential gap = 1638.024c
competitive unresolved families = 3
```

The current route is highly useful as an executable market-vs-craft candidate, but five minutes of Research depth does not materially certify that it is the globally cheapest modeled route.

Phase 2Y must improve what deeper search learns per unit of time and explain where the requested budget actually went. It must **not** merely raise preset limits again.

---

# 2. Field Findings

## 2.1 Research depth is useful but opaque

The UI requested:

```text
Research — 50,000 states / 300s / 6 rounds
```

The completed search reported:

```text
Total portfolio states expanded: 20,002
Retained/reused: 22,224
Elapsed: 254.2s
```

Those numbers are not necessarily contradictory: `maxStates` is a cap passed into individual/retained search work, transition generation can dominate wall time, and the portfolio scheduler allocates bounded tranches across candidates. But the player cannot currently tell **why only ~20k portfolio states were expanded under a 50k preset** or which stage consumed the wall time.

The UI should say “up to” for caps and report the actual stop/limiting reason.

## 2.2 The proof gap remains dominated by weak lower bounds

The exact field result shows:

```text
Clean Base                L 10.148c     U unresolved
Dark Ideation fracture    L 308.640c    U 2421.260c
Unspeakable Gifts         L 308.646c    U 1648.171c selected
Wicked Pall fracture      L 308.640c    U 4216.039c
```

Executable upper bounds are already informative, but the lower bounds are too optimistic to eliminate alternatives. Spending more time can keep improving policies without substantially closing global proof.

The next optimization target is therefore:

> **stronger generic admissible cost-to-go bounds and smarter proof-work allocation.**

## 2.3 Equivalent selected policies are presented as “dominated”

The Method Portfolio displays the Open policy at `1648.171c` as selected. It also displays the independently solved self-fracture Unspeakable Gifts family at exactly the same cost/actions/time and acquisition/downstream decomposition, but labels that family as `Dominated` because the unified candidate set deduplicates/selects the Open bundle first.

That is mathematically harmless but confusing.

A method family that resolves to the **same canonical executable policy** as the selected bundle is not usefully described to the player as dominated. It should be represented as something like:

```text
Same selected policy
Equivalent to Open winner
```

and may be visually grouped with the selected route.

## 2.4 The selected route name is too technical

The public route string is:

```text
Restart/Reacquire: Executable self-fracture: Unspeakable Gifts
```

The actual player-facing starting point is correctly shown as:

```text
Self-fracture Unspeakable Gifts
```

Recovery/reacquisition is part of the policy, not the human-readable route identity. Public route naming should be acquisition/strategy-centric; raw Bellman action/recovery labels stay in Advanced evidence.

## 2.5 The market-vs-craft result is already useful without global proof

The field run shows:

```text
Market sampled low:             3416.000c
Selected executable route EV:   1648.171c
Spread using executable route: +1767.8c
```

The current wording correctly says that a cheaper crafting route may still exist and would only increase the modeled spread. Preserve this contract.

---

# 3. Phase 2Y Goals

Phase 2Y has four focused tracks:

1. **Strengthen admissible downstream/full-route lower bounds generically.**
2. **Allocate deep proof work according to measured proof debt and progress.**
3. **Expose requested-vs-used budget and precise stop reasons.**
4. **Clean up equivalent-policy and public route naming without changing canonical identity.**

Do not add new crafting mechanics in this phase.

---

# 4. Track A — Generic Relaxed Target-Progress Lower Bound

## 4.1 Motivation

The current mandatory-mechanics bound is safe but often only proves that a base and perhaps one mandatory state-creation action must be paid. For a three-target craft this can leave a `10c` or `308c` lower bound against a `1600c+` executable policy.

Add a stronger **optimistic relaxed MDP** used only as an admissible lower bound.

Working name:

```text
RELAXED_TARGET_PROGRESS_LOWER_BOUND_V1
```

## 4.2 Relaxed state

The lower-bound abstraction may retain only mechanics necessary to make the relaxation safe, for example:

```text
matched exact target IDs
fractured target identity if any
rarity / affix-capacity class
prefix/suffix target occupancy
whether a mandatory promotion/reset class is required
```

It may deliberately relax or ignore:

- non-target filler identity;
- unfavorable filler exclusions;
- junk cleanup requirements;
- target-order restrictions that make the real craft harder;
- recovery penalties beyond unavoidable costs;
- other constraints only when removing them can make the relaxed problem easier, never harder.

The relaxed solver must never discard a real legal path or add cost absent from the real system.

## 4.3 Relaxed transitions

Derive target-progress probabilities from the same authoritative action transition mechanics/eligible weights.

Do not invent separate target chances.

For each real action class, aggregate successors by relaxed target-progress state. When exact enumeration is expensive, cache the aggregated distribution by a complete mechanics identity.

A relaxation may give the player **more favorable** transitions than reality to preserve admissibility, but it may never make success harder or add failure cost.

## 4.4 Bound composition

For each acquisition family:

```text
fullRouteLowerBound = acquisitionLowerBound + max(
  existingMandatoryDownstreamLowerBound,
  relaxedTargetProgressLowerBound
)
```

Use `max` only between independently admissible lower bounds.

The selected family's lower bound is also tracked, but it is not used to inflate its executable U.

## 4.5 Admissibility proof

Create a diagnostic corpus that compares the relaxed lower bound against known executable policies across:

- one-mod controls;
- Armour + Evasion;
- Herald two-notable;
- three-notable cold fixture;
- the new Dark Ideation + Unspeakable Gifts + Wicked Pall field fixture;
- four-mod 2P/2S fixture;
- self-fracture starts;
- actual Harvest selected family;
- no-unwanted-affix constraints.

Required invariant:

```text
relaxed lower bound <= every known executable full-route U
```

and, where an exact small state space is exhaustively solved:

```text
relaxed lower bound <= exact modeled optimum
```

Zero violations.

If a proposed abstraction cannot be proved optimistic, do not ship it.

---

# 5. Track B — Proof-Work Scheduler and Progress Efficiency

## 5.1 Instrument proof productivity first

For every portfolio tranche record:

```text
candidate
stage
wall time
states before/after
transitions generated/reused
transition-generation ms
Bellman ms
occupancy ms
lower bound before/after
upper bound before/after
potential gap before/after
proof status before/after
```

Derive metrics such as:

```text
lower-bound gain / second
upper-bound improvement / second
potential-gap reduction / second
transitions generated / second
```

These are diagnostics/scheduling evidence, not correctness criteria.

## 5.2 Incumbent-directed proof priority

For Cheapest, prioritize unresolved families whose admissible full-route L can beat the incumbent.

Suggested generic priority inputs:

1. smallest full-route L relative to incumbent;
2. stage needed to become executable/provable;
3. retained work already available;
4. recent proof improvement per second;
5. whether another tranche has repeatedly produced `NO_PROOF_CHANGE`.

Do not hardcode target names, fracture families, or a fixed winner.

## 5.3 Avoid repeated unproductive tranches

After configurable repeated `NO_PROOF_CHANGE` tranches, switch strategy generically:

```text
bound deepening -> executable-policy deepening
or
executable-policy deepening -> stronger admissible bound work
```

Do not abandon a competitive family silently. Preserve its lower bound and mark the reason for deprioritization.

## 5.4 Global request budget

Treat the user's state/wall-time preset as a **global request envelope** for product telemetry, while individual continuation sessions can retain their own caps.

The scheduler should report exactly how much of the envelope was consumed by:

```text
clean route
fracture acquisition
fracture downstream
lower-bound probes
Bellman/occupancy
method-family comparison if requested
serialization/presentation reserve
```

Do not claim all 50k states must be expanded; the product must explain when wall time or expensive transition generation prevents that.

## 5.5 Incumbent preservation

Across compatible Normal -> Deep -> Very Deep -> Research -> Custom deepening:

- best executable Cheapest U must never worsen;
- a valid retained selected policy must not be lost;
- lower-bound evidence must not be replaced by a weaker version unless the UI explicitly reports a different bound source;
- all session reuse/invalidation contracts remain Phase 2W-compatible.

---

# 6. Track C — Budget Telemetry and Proof-Debt UX

## 6.1 Rename preset semantics

Display presets as caps:

```text
Normal      up to 5k states / 30s / 3 rounds
Deep        up to 10k / 60s / 4
Very Deep   up to 20k / 120s / 5
Research    up to 50k / 300s / 6
```

Custom remains explicit raw values.

## 6.2 Add request utilization summary

After completion show a compact line/card:

```text
Requested: Research — up to 50k states / 300s / 6 rounds
Used:      20,002 expanded · 22,224 retained · 254.2s
Stopped:   <precise reason>
```

## 6.3 Stop reason contract

Add a serializable request-level stop reason such as:

```text
PROOF_CLOSED
STATE_CAP
WALL_TIME
ROUND_CAP
NO_PRODUCTIVE_PROOF_WORK
HOST_RESERVE
CANCELLED
ERROR
```

If multiple limits apply, provide primary plus secondary evidence.

Do not use the generic phrase `Search budget exhausted` when the engine knows the actual limiting resource.

## 6.4 Candidate proof-debt panel

For Advanced or an expandable “Why not proven?” panel show:

```text
Candidate        L         U/current   proof debt      last work
Clean Base       10.1c     unresolved  can beat best   downstream search
Dark Ideation    308.6c    2421.3c     L still < best  bound/policy deepening
Wicked Pall      308.6c    4216.0c     L still < best  bound/policy deepening
```

Use player labels and exact technical IDs only under Technical details.

## 6.5 Retry Deeper recommendation

Keep the exact preview and graph reuse.

Improve the recommendation text based on actual stop reason:

```text
Wall time limited this run; Retry Deeper gives up to 600s and reuses 22,224 retained states.
```

or

```text
State cap limited the strongest competitor; Retry Deeper doubles its state envelope.
```

Do not promise that a deeper run will prove optimality.

---

# 7. Track D — Equivalent Policies and Player Route Naming

## 7.1 Stable policy-equivalence fingerprint

Use the canonical selected policy rather than only cost/action/time equality.

An equivalence fingerprint should include at least:

```text
physical acquisition identity
normalized on-policy state -> action mapping
required action evidence
full-route expected action usage within declared numerical tolerance
recovery semantics
terminal semantics
```

Two routes with coincidentally identical scalar metrics are not automatically equivalent.

## 7.2 Method lifecycle

Add a presentation status conceptually like:

```text
SAME_AS_SELECTED
```

When an independently solved method family is canonically equivalent to the selected policy:

- do not call it `Dominated`;
- show `Same selected policy`;
- explain that the open search independently discovered the same executable strategy;
- optionally collapse/group the duplicate card by default.

Keep the independent-family evidence accessible.

## 7.3 Public route identity

Build public selected-route names from canonical acquisition + strategy context.

Examples:

```text
Start clean base
Self-fracture Unspeakable Gifts
Harvest Reforge Defences
Self-fracture <target> + Harvest
```

Do not use a recovery action such as `Restart/Reacquire` as the public route title merely because it is an important Bellman action.

Technical route/action IDs remain in Advanced/export evidence.

## 7.4 Cross-surface naming invariant

The same player route name must appear in:

- Search Activity selected route;
- Craft Recommendation;
- Pareto card;
- selected Method card/group;
- Constellation start/details;
- How to craft starting point;
- copy/export/share summary.

No surface may independently infer a different route title.

---

# 8. Exact Phase 2Y Field Fixture

Pin the real handoff fixture from `new-3-banger.pdf` as a frozen browser regression with current committed prices.

Do **not** hardcode its winning fracture target or exact EV as a solver expectation. Record the observed baseline for regression comparison only.

Required facts to preserve or explain if legitimately changed by the stronger generic search:

```text
Market sampled low: 3416c
Selected result is executable and reconciled
No selected Harvest action unless real positive on-policy evidence exists
Three exact target notable IDs preserved
Research request identity preserved
Market-vs-craft wording remains proof-honest
```

Run target-order permutations and verify canonical economics/search identity neutrality.

---

# 9. Required Phase 2Y Diagnostics

## Y1 — Phase 2X preservation

Run all mature Phase 2E–2X diagnostics and the 95-gate real browser release suite before adding Y gates.

## Y2 — Relaxed-bound admissibility corpus

Zero violations against every known executable route and exact small-space optimum.

## Y3 — Bound-strength comparison

Record existing L vs relaxed L vs combined L for representative fixtures.

Acceptance: at least one complex 3/4-target fixture receives a materially stronger lower bound without any admissibility violation. If not, document the failed approach rather than shipping complexity with no benefit.

## Y4 — Field-fixture proof telemetry

For the new three-notable Research run record the full per-stage timing/state/proof table.

## Y5 — Scheduler A/B

Using identical frozen input/prices/budget compare old/reference scheduling with the new scheduler:

- time to first executable;
- final incumbent U;
- best competitive L;
- potential gap;
- states/transitions;
- wall time;
- number of no-proof-change tranches.

New scheduling must preserve or improve incumbent quality and materially improve proof-gap closure or explain a measured blocker.

## Y6 — Normal -> Deep -> Very Deep -> Research continuation

Confirm exact-context reuse, incumbent monotonicity, and honest stop reasons at each depth.

## Y7 — Requested-vs-used budget

Browser and Worker values must match for requested preset, actual states, elapsed time, retained states, and stop reason.

## Y8 — Wall-time-limited witness

Produce a controlled case whose primary stop reason is `WALL_TIME` and verify the UI says so.

## Y9 — State-limited witness

Produce a controlled case whose primary stop reason is `STATE_CAP`.

## Y10 — Proof-closed witness

A simple craft that proves fully must report `PROOF_CLOSED`, not budget exhaustion.

## Y11 — Equivalent-policy identity

Create at least one real case where Open and a constrained family resolve to the same canonical policy. UI must show `Same selected policy`, not `Dominated`.

## Y12 — Equal-metrics/non-equivalent counterexample

Construct two policies with equal/sufficiently close cost/actions/time but different canonical policy maps. They must **not** be marked equivalent.

## Y13 — Route naming

Clean, self-fracture, Harvest, and fracture+Harvest controls must have player-facing route names independent of recovery action names.

## Y14 — Cross-surface route name differential

Worker canonical presentation name == DOM == Constellation == guide == export/share.

## Y15 — Market handoff regression

Cluster Jewels -> optimizer handoff on at least five committed combinations, including the exact three-notable field fixture.

## Y16 — Harvest semantic preservation

Actual selected Harvest positive control and eligible-but-not-selected negative control remain Phase 2X-correct.

## Y17 — Constellation regression

No phantom mechanics; route camera/replay/scroll behavior preserved.

## Y18 — Generated proof-debt fuzzing

Use the external Quality Lab to generate a bounded matrix of 1–4 target crafts and automatically flag:

- U < L;
- weaker bound replacing a stronger retained bound;
- selected route not executable;
- public proof claim stronger than service status;
- unexplained budget utilization;
- equivalent policy mislabeled dominated;
- route-name disagreement;
- result reconciliation failure.

Fix generic defects found and rerun the matrix.

## Y19 — Performance/memory

Ensure stronger bound computation does not materially regress simple/common searches. Cache relaxed distributions and bound results by exact mechanics/target identity.

## Y20 — Build/release

Require locally:

```text
npm run build
npm run lint
git diff --check
npm run diagnostic:mature
npm run diagnostic:phase2t
npm run diagnostic:phase2u
npm run diagnostic:phase2v
npm run diagnostic:phase2w
npm run diagnostic:phase2x
npm run diagnostic:phase2y
npm run lab:no-fallback-probe
npm run lab:release
```

Heavy browser/solver matrices remain local/manual as established. Hosted Pages validation remains lean and audits committed Phase 2Y evidence.

Unit tests added/run: **NO**.

---

# 10. Autonomous Implementation / Review Loop

The implementation LLM should work through Phase 2Y with minimal supervision.

1. Fetch the latest `main` immediately before editing and preserve newer user-owned data commits.
2. Reproduce the exact field fixture and freeze raw baseline evidence.
3. Add instrumentation before changing proof algorithms.
4. Implement the relaxed lower bound only after its admissibility argument is explicit.
5. Run Y2 after every meaningful lower-bound change; any violation is a blocking defect.
6. Implement proof scheduling using measured generic evidence, never target names.
7. Implement budget telemetry and stop reasons.
8. Fix equivalent-policy status and route naming.
9. Run real Playwright continuously, not only at the end.
10. Use screenshots/DOM/Worker/export comparisons to discover unexpected defects.
11. When a normal bug is found, diagnose it, fix it generically, add regression evidence, and continue without waiting for user intervention.
12. Do not weaken a gate or update expected values merely to make a failure pass.
13. Review the complete diff for hidden mechanics changes, stale IDs, duplicated result sources, and accidental data edits.
14. Run the full Y1–Y20 matrix.
15. Create the completion report, commit, push, verify lean Pages deployment, and confirm `origin/main` matches the final worktree.

Only stop for user input when blocked by an unknown real game mechanic, unavailable credentials/external infrastructure, or an irreconcilable concurrent source change.

---

# 11. Completion Gates

Phase 2Y closes only when:

- Phase 2X remains passing;
- the relaxed bound has a documented optimistic/admissible argument and zero corpus violations;
- at least one complex fixture receives materially stronger proof evidence, or the attempted bound is explicitly rejected and not shipped;
- Research/Custom budget utilization and stop reason are visible and Worker-consistent;
- the scheduler is driven by proof debt/productivity rather than target identity;
- compatible deepening never loses a better executable incumbent;
- the exact three-notable field fixture remains executable/reconciled/proof-honest;
- identical canonical method policies are no longer shown as dominated duplicates;
- equal scalar metrics alone do not imply policy equivalence;
- public selected-route naming no longer begins with incidental recovery actions;
- route naming agrees across all public surfaces;
- Harvest/no-Harvest action semantics remain exact;
- generated Quality Lab proof-debt fuzzing finds no unresolved correctness defect;
- build/lint/diff/all mature diagnostics/no-fallback/real Playwright release pass;
- no unit tests are added/run;
- no route winner is hardcoded;
- no mechanics probability is changed without a separate explicitly approved mechanics phase;
- state identity is not weakened;
- pre-fractured market ranking remains absent.

---

# 12. Required Completion Report

Create:

```text
docs/crafting-engine/PHASE2Y_PROOF_EFFICIENCY_BUDGET_TELEMETRY_POLICY_EQUIVALENCE_COMPLETION_REPORT.md
```

Include at minimum:

1. final implementation/evidence commits;
2. files changed;
3. Phase 2X preservation matrix;
4. exact field baseline;
5. proof-stage timing/state instrumentation;
6. relaxed-bound mathematical/admissibility argument;
7. relaxed-bound identity/cache contract;
8. admissibility corpus results;
9. old/new lower-bound table;
10. scheduler priority formula/contract;
11. scheduler A/B results;
12. Normal/Deep/Very Deep/Research continuation table;
13. requested-vs-used budget evidence;
14. stop-reason witnesses;
15. exact field post-change U/L/gap/status;
16. time-to-first-executable and final proof progress;
17. equivalent-policy fingerprint contract;
18. selected-equivalent family browser evidence;
19. equal-metrics non-equivalent counterexample;
20. public route naming contract;
21. cross-surface naming differential;
22. Market vs Craft preservation;
23. Harvest semantic controls;
24. generated proof-debt fuzz matrix;
25. unexpected bugs found and fixed;
26. performance/memory comparison;
27. real Playwright release count and screenshots reviewed;
28. full local command matrix;
29. hosted lean deployment result;
30. release label/version;
31. unit tests added/run: expected NO;
32. mechanics probabilities changed: expected NO;
33. state identity weakened: expected NO;
34. hardcoded route winners added: expected NO;
35. remaining blockers to broader public use.

---

# Final Phase 2Y Principle

> **Deeper search should buy evidence, not merely time. A Research run must tell the player what budget was actually consumed, why proof stopped, and which unresolved family still owns the uncertainty. The optimizer should spend its next tranche where it can most reduce that uncertainty while preserving every existing correctness guarantee.**
