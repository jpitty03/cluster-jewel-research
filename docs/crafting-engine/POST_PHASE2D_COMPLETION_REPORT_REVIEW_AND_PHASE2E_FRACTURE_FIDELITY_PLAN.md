# Post Phase 2D Completion-Report Review and Phase 2E Fracture-Preparation Search Plan

## Status / Source of Truth

Remote `origin/main` was reviewed at:

- `6b8d4e0ab0b4d5e8b9219c68486e38d534c000ae` — `docs: checkpoint phase 2d acquisition synthesis and plan integration`
- implementation beneath it: `aa5ed97c29faf418757ee9b98cf0b292b5dc0f4b` — standalone executable acquisition-synthesis checkpoint

The supplied Phase 2D completion report states that the completed integration exists locally at:

- `304784e893bee6758e28c2bafe222c98471f887d` — `feat: integrate executable fracture acquisition ranking`

but also states that it is local-only and one commit ahead of `origin/main`.

Therefore this review has two evidence levels:

1. **Code-reviewed remote checkpoint:** `aa5ed97...` / `6b8d4e0...`.
2. **Completion-report-reviewed local integration:** `304784e...`, which must be pushed before a full source-level review.

This document is the next-step source of truth after Phase 2D. It supersedes the first version of this file that incorrectly elevated Crafting Bench support as the presumed next mechanics requirement.

No unit-test work is requested.

---

# Important User Correction — Do Not Treat The Crafting Bench As A Target-Mod Source

The standard hideout Crafting Bench cannot directly craft cluster-jewel notable passive skills or the specific cluster-jewel modifiers that the optimizer is targeting.

Therefore:

> **Do not model the Crafting Bench as a way to create the desired cluster-jewel target modifier or notable during self-fracture preparation.**

The previous review over-interpreted the historical `+10c` preparation allowance as evidence that an authoritative Bench mechanic was the missing economic ingredient. That conclusion is withdrawn.

A Bench craft must not be introduced merely to make the executable self-fracture EV resemble the old estimate.

If some generic non-target Bench filler could legally participate in a future fracture-preparation route, that is a separate mechanics question and must be independently proven before implementation, including its interaction with Fracturing Orb eligibility/selection. It is **not** a Phase 2E assumption or completion requirement.

For Phase 2E, use only already-supported legal currency/mechanics unless a concrete missing mechanic is independently established.

---

# Executive Verdict

## Phase 2D architecture: STRONG PASS

The supplied completion report shows the main Phase 2D architectural goals were achieved:

- executable self-fracture synthesis participates in normal optimizer flow;
- pre-fractured market purchase no longer affects core ranking;
- the legacy `0.11c + 10c + fixed 4x` estimate no longer affects normal ranking;
- wrong-fracture outcomes recover through restart/reacquisition;
- expected Fracturing Orbs and failed attempts emerge from shared transitions;
- multiple fracture candidates are independently synthesized;
- persistent graph extension removes repeated expansion in the standalone synthesis fixture;
- one-mod, two-mod, Harvest, Fracturing, Craft A, Craft C, build, lint, and browser regressions remained healthy according to the completion report.

## Fracture economics: executable, but search quality is not yet trustworthy

The standalone fixture reports approximately:

```text
certified executable incumbent U: 12,797.76c
optimistic lower bound L:            10.235c
historical approximate reference:  1,538.95c
```

The important fact is not that the result differs from the old estimate. The important fact is that:

```text
U / L gap is enormous
+
global modeled-action optimality is not proven
+
unresolved candidates can still beat the incumbent
```

The engine has proven **an executable route**, not a persuasive economic optimum.

Now that the Bench-target-mod hypothesis is removed, the next task is to determine whether the large incumbent is caused by:

- the generic search failing to discover a much cheaper legal preparation policy;
- insufficient staging/prioritization around the fracture-preparation milestone;
- an actual missing legal crafting mechanic;
- price context differences;
- or some combination of those.

## Recommended next phase

> **Phase 2E — Fracture-Preparation Baseline, Search Fidelity, and Acquisition Proof Hardening**

Do not spend this phase on broad UI polish or speculative mechanics additions.

---

# Verified Phase 2D Completion-Report Results

According to the supplied completion report:

```text
npm run build: PASS
npm run lint: PASS
production browser + worker smoke: PASS

one-mod browser:      ~820ms
two-mod Any browser:  ~1,891ms
no-unwanted browser:  ~1,764ms
```

Executable synthesis reportedly produced:

```text
expected total acquisition EV:     12,797.759749c
expected preparation EV:           12,787.759749c
optimistic lower bound:                 10.234997c
expected Fracturing Orbs:                3.999999994
expected failed/restart attempts:         2.999999996
```

Wrong-fracture recovery correctly abandons/reacquires rather than Scouring away a permanent fracture.

Persistent synthesis reportedly used:

```text
PERSISTENT_EXTENDED
5,001 canonical states
5,001 cumulative expansions
0 repeated states
3 rounds
~19s runtime
```

Fracturing parity remained aligned at approximately 25% analytical / 24.955% seeded MC.

---

# Finding 1 — Establish A Known-Legal Fracture-Preparation Baseline Before More Search Tuning

## Severity

**CRITICAL**

The current search incumbent is too far from its optimistic lower bound to diagnose by intuition.

Before changing frontier heuristics, create a fixed-policy baseline built entirely from existing shared legal mechanics.

The baseline is **not** a new solver branch and must not be used as a hardcoded recommendation. It is a diagnostic upper bound answering:

> Can the existing mechanics already execute a materially cheaper self-fracture preparation policy than the generic search currently finds?

## Baseline shape

Use shared mechanics to evaluate a simple legal preparation family for a requested target modifier, conceptually:

```text
clean base
-> roll until desired target modifier is present
-> add legal affixes until Fracturing Orb requirements are satisfied
-> Fracturing Orb
    desired target fractured -> normalize reusable fractured state
    wrong fracture -> abandon/reacquire and repeat
```

The exact sequence must obey the current action registry and actual legality.

Possible actions may include only those already modeled and legal in the relevant state, such as:

```text
Transmutation
Alteration
Augmentation
Regal
Exalted Orb
Chaos / Harvest only where genuinely legal/economic
Scour
Fracturing Orb
Restart / Reacquire
```

Do not insert a Crafting Bench target-mod action.

Do not hardcode target probabilities or a `4x` retry multiplier. Derive the fixed-policy EV from the same transition distributions and PriceBook used by the optimizer.

## Required diagnostic

For at least the existing T1 Intelligence standalone fixture, report:

```text
generic-search certified incumbent U
optimistic lower bound L
fixed-policy executable baseline U_baseline
full expected action usage for baseline
full expected action usage for generic incumbent
```

Interpretation:

### If `U_baseline << U_search`

This proves a search-discovery/staging problem. Improve generic search until it can find or beat the known legal baseline without hardcoding the baseline sequence into production optimization.

### If `U_baseline ~= U_search`

Then the high EV is likely inherent to the currently modeled legal action set/price context, and a missing-mechanics investigation becomes justified.

### If the proposed baseline itself is illegal

Document exactly which transition/legality rule prevents it. Do not weaken legality merely to make the route cheaper.

---

# Finding 2 — Verify Unresolved Synthesis Lower Bounds Survive Product Integration

## Severity

**CRITICAL for proof-honest acquisition safety**

The completion report says:

> only resolved synthesis enters ranking.

That wording requires source-level verification after `304784e...` is pushed.

An unresolved fracture synthesis cannot be recommended as executable, but it must still be able to prevent a false acquisition-safe result when its lower bound is competitive.

Required semantics:

```text
resolved fracture synthesis:
  finite executable U
  eligible to become selected route

unresolved fracture synthesis:
  no fake finite U
  retains lower bound L
  can block acquisition-safe/proven status when L < incumbent U
```

Required diagnostic:

```text
another acquisition has certified U
fracture synthesis is unresolved
L_fracture < U
```

Expected:

```text
selected executable incumbent may still be shown
acquisition safe = NO
status = PROVISIONAL_RESOLVED or equivalent
fracture lower bound is visible
```

If unresolved synthesis is discarded before acquisition-safety classification, fix that in Phase 2E.

---

# Finding 3 — Improve Fracture Search Only Against A Demonstrated Baseline Gap

If the fixed-policy diagnostic proves a much cheaper existing legal route, target the actual search failure.

Preferred generic improvements, in order:

1. **Fracture-preparation milestone staging**
   - prioritize states containing the desired unfractured target modifier;
   - among those, prioritize states closer to legal Fracturing Orb eligibility;
   - this is generic physical-state progress, not a modifier-specific branch.

2. **Feasible-policy seeding**
   - use shared legal actions to establish an executable fracture-preparation U early;
   - do not require local/global optimality before an executable U can guide pruning.

3. **Persistent-graph warm starts**
   - retain continuation values/policy seeds where valid when extending the graph.

4. **Acquisition-specific lower bounds**
   - improve the current extremely loose lower bound if a correctness-preserving bound can be derived.

5. **Budget staging**
   - separate “find a plausible executable fracture route” from broader proof work.

Do not:

- create a T1-Int-specific path;
- create a Craft A/C-specific path;
- hardcode the diagnostic baseline as the production policy;
- reintroduce previously reverted frontier changes unless a new diagnostic demonstrates improvement;
- tune toward the historical `~1533c` estimate.

The success criterion is that generic search discovers a competitive legal route, not that it reproduces a historical number.

---

# Finding 4 — Audit The Existing Fracture Preparation Action Set

If the baseline remains unexpectedly expensive, perform a focused mechanics coverage audit.

For the path from:

```text
clean cluster jewel
```

to:

```text
legal Fracturing Orb source containing the desired target modifier
```

list every modeled action that can legally advance the state and every obvious game action that is intentionally absent.

For each absent action, classify:

```text
NOT APPLICABLE TO CLUSTER JEWELS
APPLICABLE BUT NOT MODELED
UNKNOWN / NEEDS AUTHORITATIVE SOURCE
DEFERRED NON-CORE MECHANIC
```

Do not assume Crafting Bench support is needed.

Specifically preserve the user-confirmed rule:

> Standard hideout Crafting Bench does not directly create the cluster-jewel notable or specific target modifier.

Only propose a new mechanic after identifying a concrete legal action missing from the preparation state machine.

---

# Finding 5 — Performance Is Acceptable For Research, But Must Stay Staged

Standalone synthesis takes roughly `19s` at `5,001` states while normal browser regressions remain fast.

Preserve this staging property.

For multi-fracture targets report:

```text
candidate count
budget per candidate
cache hits/misses
synthesis time per candidate
total acquisition-stage time
downstream search time
```

Do not weaken cache identity merely to gain hits.

---

# Permanent Self-Fracture Product Rule

The product rule remains:

> **If strategy discovery uses a fractured state, core optimization manufactures it through self-fracturing.**

Do not restore pre-fractured market purchase to normal ranking.

The UI should not require fractured-base market prices.

---

# Phase 2E Required Diagnostics

## Diagnostic A — Source review of pushed Phase 2D integration

After `304784e...` is pushed, verify:

```text
synthesizeAcquisition integration path
resolved-vs-unresolved propagation
budget allocation
cache identity
legacy formula isolation
market-fracture dormancy
```

## Diagnostic B — Fixed-policy legal preparation baseline

For the known standalone target report:

```text
exact legal action sequence/fixed policy
expected action usage
EV
properness
absorption
reconciliation
Fracturing Orb count
restart count
```

All probabilities/costs must come from shared mechanics/PriceBook.

## Diagnostic C — Search vs baseline

Report:

```text
U_search
L_search
U_baseline
ratio/difference
which legal baseline states/actions generic search failed to resolve or prioritize
```

## Diagnostic D — Wrong-fracture recovery

Preserve actual abandonment/reacquisition economics and prove no permanent-fracture reset loophole.

## Diagnostic E — Unresolved lower-bound propagation

Use the controlled provisional-acquisition fixture described above.

## Diagnostic F — Multiple fracture candidates

Preserve independent synthesis for at least two relevant requested modifiers, with no market quote required.

## Diagnostic G — Fracturing Orb parity

Preserve:

```text
external: 25%
analytical: 25%
seeded MC: statistically aligned
```

## Diagnostic H — Mechanics coverage audit

If baseline/search economics remain unexpectedly high, print the preparation action coverage classification before proposing new mechanics.

## Diagnostic I — Persistent extension

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

---

# Regression Matrix

## R1 — One-mod T1 ES

Must remain clean-base, acquisition-safe, proper, absorbing, reconciled, and fast.

## R2 — Two-mod T1 ES + T1 Int, Any

Must remain clean-base and acquisition-safe under the established fixture.

## R3 — Two-mod no-unwanted

Preserve final-state cleanliness semantics.

## R4 — Forced-Rare two-mod

Report selected incumbent, clean U/L, fracture U/L by candidate, acquisition safety, runtime, and states. Provisional is acceptable.

## R5 — Harvest B1/B2/B3 parity

Preserve raw-presence / one-Annul semantics and `CLOSE / APPROXIMATE` labels.

## R6 — Fracturing parity

Preserve the shared 25% mechanic.

## R7 — Craft A

Keep the mature regression stable. Report executable acquisition economics separately; do not tune the generic solver to the old acquisition reference.

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

- [ ] `304784e...` has been pushed and source-reviewed;
- [ ] unresolved fracture lower-bound propagation is verified or fixed;
- [ ] a known-legal fixed-policy fracture-preparation baseline is evaluated entirely through shared mechanics;
- [ ] the baseline is compared directly against the generic-search incumbent;
- [ ] any material search gap is diagnosed at the state/action level;
- [ ] generic search is improved if a cheaper legal baseline proves the current incumbent is search-starved;
- [ ] no Crafting Bench target-mod/notable mechanic is introduced;
- [ ] no speculative Bench filler is added without separate authoritative proof of legality and Fracturing interaction;
- [ ] no fixed `4x` retry economics return to normal ranking;
- [ ] pre-fractured market purchase remains absent from normal ranking;
- [ ] wrong-fracture recovery remains correct;
- [ ] persistent extension remains correctness-preserving;
- [ ] one-mod regression remains healthy;
- [ ] two-mod Any regression remains healthy;
- [ ] no-unwanted semantics remain healthy;
- [ ] forced-Rare remains proof-honest;
- [ ] Harvest parity remains unchanged;
- [ ] Fracturing parity remains aligned;
- [ ] Craft A remains healthy;
- [ ] Craft C remains healthy;
- [ ] `npm run build` passes;
- [ ] `npm run lint` passes apart from documented pre-existing warnings;
- [ ] production browser/worker smoke passes;
- [ ] no unit tests were added;
- [ ] no Craft-specific solver branches were added.

---

# Required Completion Report

Report:

1. commit SHA;
2. files changed;
3. source review findings for `304784e...`;
4. unresolved synthesis lower-bound propagation behavior;
5. exact fixed-policy baseline and why each action is legal;
6. baseline expected action usage and EV;
7. generic search U/L before changes;
8. baseline vs search difference;
9. search failure/staging diagnosis;
10. generic search changes made, if needed;
11. generic search U/L after changes;
12. expected Fracturing Orbs and restarts;
13. wrong-fracture recovery behavior;
14. mechanics coverage audit and any genuinely missing action;
15. persistent graph metrics;
16. acquisition timing/caching metrics;
17. multi-fracture result;
18. forced-Rare result;
19. one-mod browser result;
20. two-mod Any browser result;
21. no-unwanted result;
22. Harvest parity;
23. Fracturing parity;
24. Craft A regression;
25. Craft C regression;
26. build/lint/browser results;
27. whether executable self-fracture economics are now sufficiently tight for normal product ranking;
28. remaining blockers before broader UI productization.

---

# Constraints

Do not:

- add unit tests;
- add Craft A/C-specific acquisition branches;
- reintroduce pre-fractured market purchase into normal ranking;
- reintroduce the old `0.11c + 10c + fixed 4x` estimate into normal ranking;
- model the standard Crafting Bench as a direct source of cluster-jewel notable passive skills or specific target modifiers;
- invent a generic Bench filler merely to lower the fracture EV;
- tune executable fracture EV toward the historical reference;
- call a route globally optimal merely because it is executable/certified;
- discard unresolved acquisition evidence when its lower bound affects recommendation safety;
- sacrifice canonical correctness for cache/search performance;
- change Harvest external fixture semantics.

---

# Recommended Implementation Order

```text
0. Push local Phase 2D completion commit 304784e... to origin/main.
1. Cherry-pick this corrected review-plan document onto main.
2. Source-review the pushed Phase 2D integration, especially unresolved synthesis propagation.
3. Build the known-legal fixed-policy fracture-preparation baseline from existing shared mechanics.
4. Compare generic search U/L against that baseline.
5. If baseline is materially cheaper, fix generic fracture-preparation staging/search without hardcoding the baseline.
6. If baseline is similarly expensive, perform the focused mechanics coverage audit before proposing any new mechanic.
7. Re-run standalone, multi-fracture, and forced-Rare diagnostics.
8. Run R1-R9 regressions.
9. Run build/lint/production browser+worker smoke.
10. Commit regenerated diagnostics and Phase 2E completion report to main.
```

The Phase 2D architecture already produces a real executable fracture route. Phase 2E should now determine whether the high cost is a **search problem or a genuinely incomplete legal action set**, without assuming the Crafting Bench can manufacture cluster-jewel target modifiers.