# Phase 2J Finalization Review and Closeout Checklist

## Status

Live `main` reviewed at:

- `a9942c75e04ab4f8624677932ce696b583239112` — current Phase 2J implementation/checkpoint
- Phase 2J source of truth: `docs/crafting-engine/POST_PHASE2I_REAL_WORLD_REVIEW_AND_PHASE2J_POLICY_REFINEMENT_MULTIMOD_SCALING_HARVEST_PARITY_PLAN.md`
- Phase 2I completion report: `docs/crafting-engine/PHASE2I_CHRONOLOGICAL_CRAFT_PLAN_UI_COMPLETION_REPORT.md`

This document is a **closeout review**, not a new implementation phase.

Do not reopen Phase 2I. Phase 2I remains complete and is now a regression dependency for Phase 2J.

Do not add unit tests.

---

# Executive Verdict

## Phase 2I: CLOSED / PASS

No new Phase 2I implementation work is required.

The current Phase 2J checkpoint preserves the Phase 2I architecture and adds downstream-policy confidence as a separate result axis rather than weakening the chronological-plan model.

Before Phase 2J is closed, rerun the Phase 2I regression gates and production browser checks one final time, but do not redesign or extend the Phase 2I UI unless a concrete regression is found.

## Phase 2J: IMPLEMENTATION SUBSTANTIALLY COMPLETE; CLOSEOUT EVIDENCE STILL REQUIRED

The core Phase 2J changes are strong and address the main real-world failures that motivated the phase:

- Herald RECOMMEND now performs a bounded post-certification refinement round and recovers most of the previously observed shallow/deep cost discrepancy.
- Retry Deeper can reuse exact-context downstream search state and transition work.
- exact-context invalidation is implemented and audited.
- the exact four-mod real-world fixture now resolves a finite generic product policy under a practical controlled budget instead of returning no route after roughly ten minutes.
- no weaker Phase 2J canonical state identity was introduced; the target-conditioned quotient/equivalence audit reports zero violations.
- T1 Armour + T1 ES Harvest/conventional analytical + MC diagnostics exist, preserve the incomplete external fixture metadata honestly, and demonstrate an economic crossover from Q-values rather than a hardcoded winner.
- the defensive two-mod controlled product solve is now measured in seconds rather than minutes.
- UI now separates starting-acquisition confidence from downstream crafting-strategy confidence.

I found **no reason to roll back the current Phase 2J architecture**.

The remaining work should be treated as **final validation, evidence capture, and completion reporting**, not an invitation to keep changing solver mechanics.

---

# Review of Current Phase 2J Evidence

## J1 — Phase 2I completion regression

### Status: PARTIAL PASS / FINAL CLOSEOUT RUN STILL REQUIRED

Current committed evidence shows the W1–W6 diagnostic still passing after Phase 2J search/caching changes. The Phase 2I chronological-plan contract remains in the product result, and the Phase 2J four-mod/Herald diagnostics continue to report:

```text
plan=CERTIFIED
uncovered=[]
invented=[]
```

The user also reported that the one-mod, two-mod Any, no-unwanted, forced-Rare, self-fracture, wrong-fracture recovery, Harvest-plan, and W1–W6 gates passed during the current final regression run.

Still required before closure:

- capture the final completed regression outputs after the mature Craft A/C run finishes;
- run the compiled production browser/worker checks after the final code state is frozen.

Do not change Phase 2I presentation behavior merely to regenerate outputs.

---

# J2 — Herald bounded policy refinement

## Status: PASS

Frozen Herald fixture, current RECOMMEND `5k / 30s / 3`:

```text
first certified U = 214.520976c
final U           = 62.518070c
improvement       = 152.002906c
improvement       = 70.857%
time to first useful policy ~= 1.925s
total engine time         ~= 6.832s
```

Health:

```text
proper=true
absorption=1.0
Bellman=true
occupancy=true
reconciled=true
unresolved on-policy probability=0
```

This meets the intent of Phase 2J: keep time-to-first-useful bounded, then spend one bounded post-certification round to improve the downstream policy materially.

Important: the returned status is correctly:

```text
STILL_IMPROVING_AT_BUDGET
```

rather than incorrectly claiming stability or modeled optimality.

No further Herald-specific tuning is requested.

---

# J3 — Cold vs resumed DEEPEN

## Status: PASS

Same exact final budget:

```text
resumed DEEPEN U = 62.518070c
cold DEEPEN U    = 62.518070c
EV difference    = 0
```

Both policies are proper, absorbing, Bellman-converged, occupancy-converged, reconciled, and have zero unresolved on-policy probability.

The resumed run reports retained state/transition evidence from the prior RECOMMEND request and generates materially fewer duplicate transition distributions.

Committed diagnostic:

```text
cold transition distributions generated    = 35,458
resumed transition distributions generated = 18,748
difference                                  = 16,710 fewer generations
```

Wall time improves more modestly because Bellman/refinement work remains a major cost:

```text
resumed ~= 20.4s
cold    ~= 22.2s
```

That is acceptable. The completion report must distinguish **duplicate transition-work reduction** from **wall-clock speedup** rather than implying they are the same metric.

Do not chase a larger wall-clock difference by weakening the state model.

---

# J4 — Exact-context session invalidation

## Status: PASS

The current identity changes when any of the audited mechanics/economics inputs change:

- target mod ID;
- final-state constraint;
- currency rate;
- clean-base cost/evidence;
- Harvest scope;
- item level.

Search budget and RECOMMEND/DEEPEN intent are intentionally excluded from the continuation identity so the same exact mechanical/economic request can be extended safely.

The implementation also includes explicit mechanics/action-set and canonical-state version strings.

No blocker found here.

---

# J5 — Four-mod finite diagnostic baseline

## Status: PASS

A diagnostic-only finite shared-mechanics policy exists.

Current controlled result:

```text
selected Magic target pair:
- T1 Maximum Energy Shield
- T1 Intelligence

success probability per cycle ~= 0.0005518123
finite expected cost          ~= 866,938.452c
proper=true
absorption=1
reconciled=true
```

The baseline is intentionally non-optimal and remains outside product ranking.

That is exactly its intended purpose: prove finite reachability using shared mechanics and provide a debugging upper bound/reference route.

---

# J6 — Exact four-mod generic product solve

## Status: PASS, WITH ONE FINAL PRODUCTION-WORKER CHECK REQUIRED

Exact RWE-2 target now produces a finite generic product route under `5k / 30s / 3`:

```text
status=PROVISIONAL_RESOLVED
U=78,487.604523c
elapsed ~= 29.037s
proper=true
absorption=1.0
Bellman=true
occupancy=true
reconciled=true
unresolved on-policy probability=0
craft plan=CERTIFIED
uncovered=[]
invented=[]
```

This is a major improvement over the observed pre-fix behavior:

```text
NO_RESOLVED_ROUTE after roughly ten minutes
```

The acquisition result remains provisional/acquisition-unsafe, which is proof-honest and acceptable for the Phase 2J gate.

### Final caution

The controlled engine run is close to the default request deadline. Before closure, run this fixture through the **compiled production browser worker** and verify:

- final `RESULT` returns before the host guard;
- no `SearchWallTimeExceededError`;
- serialization/UI overhead does not push the request past the guard;
- the browser displays the finite provisional recommendation and certified plan correctly.

Do not increase the default timeout merely to make this smoke pass. If a small deterministic scheduling/cache fix is needed, make only that fix and rerun the full affected regressions.

---

# J7 — Quotient/equivalence safety audit

## Status: PASS

Current audit:

```text
concrete states = 1000
quotient classes = 309
collapsed = 691
violations = 0
```

The audit reports preservation of:

- exact target identities;
- target roll pass/fail semantics;
- fracture state;
- mod-group/name exclusions relevant to future legality/probability;
- rarity/occupancy;
- flags/final-state semantics;
- action distributions.

Importantly, the Phase 2J implementation did not introduce a weaker ad-hoc canonical state identity merely to make the four-mod case pass.

No blocker found here.

---

# J8 — Three-notable real-world regression

## Status: NOT YET CAPTURED IN THE PHASE 2J CLOSEOUT EVIDENCE

Run the exact real-world fixture from the Phase 2J plan:

```text
Large Cluster Jewel
12% increased Cold Damage
ilvl 84
12 passives
Rare
extra affixes allowed

Blanketed Snow
Prismatic Heart
Widespread Destruction
```

Acceptance:

- an executable route remains available when the generic search can resolve one;
- acquisition/proof status remains honest;
- do not require the old `1646.773c` incumbent;
- do not require the same fracture target if the generic solver legitimately changes it;
- chronological plan has `uncovered=[]` and `invented=[]`;
- no market-fractured purchase enters core ranking.

Add this result to the Phase 2J completion report.

---

# J9 — T1 Armour + T1 ES exact external physical fixture

## Status: SOURCE EVIDENCE INCOMPLETE — TREAT AS DOCUMENTED EXTERNAL-EVIDENCE LIMITATION, NOT A CODE FAILURE

The supplied Craft of Exile screenshot contains the action/pass counts and displayed conventional costs, but it does **not** contain enough visible information to recover confidently:

- exact base type;
- cluster enchantment;
- item level;
- passive count;
- therefore exact external modifier IDs/pool identity.

The current diagnostic handles this correctly:

```text
external parity claim: BLOCKED / INCOMPLETE
```

and then uses an explicitly pinned controlled engine fixture without pretending it was recovered from the screenshot.

### Closeout amendment

Do **not** invent the missing metadata and do not block the engineering closeout indefinitely on information that is absent from the source evidence.

For Phase 2J closure, treat J9 as:

```text
EXTERNAL FIXTURE METADATA: INCOMPLETE BY SOURCE
EXACT PARITY CLAIM: NOT MADE
CONTROLLED ENGINE PARITY/ECONOMIC DIAGNOSTIC: REQUIRED AND PASSING
```

If the exact original Craft of Exile physical fixture is supplied later, it can be added as a stronger independent benchmark without changing engine mechanics.

The completion report must call this out explicitly rather than writing `J9 PASS exact parity`.

---

# J10 — Lifeforce price crossover

## Status: PASS

Controlled engine fixture uses identical conventional prices and derives the crossover from the engine's own analytical probabilities/EV.

Current result:

```text
controlled conventional fixed-policy EV = 205.030617c
controlled crossover ~= 0.00867529c / Primal Lifeforce
                   ~= 115.270 Lifeforce / chaos
```

Sweep:

```text
LOW  -> Harvest selected
NEAR -> equal-Q boundary
HIGH -> conventional selected
```

This is the correct behavior.

The earlier screenshot-derived `~0.02022c / Lifeforce` remains validation guidance only and must **not** be compared as if it were the exact same physical fixture. The current external fixture metadata is incomplete, so differing crossover values are not a defect by themselves.

No hardcoded crossover/winner branch was added.

---

# J11 — Defensive two-mod runtime

## Status: PASS, FINAL BROWSER SMOKE STILL REQUIRED

Controlled product result:

```text
status=BEST_RESOLVED_ACQUISITION_SAFE
U=235.684630c
elapsed ~= 8.822s
states=5000
first policy ~= 3.429s
first acquisition-safe ~= 3.429s
```

Harvest analytical distribution:

```text
first generation ~= 3.303s
reused equivalent reset-state distribution ~= 0ms
retained outcomes = 204,642
```

This is a material improvement over the user-observed roughly ten-minute run without reducing mechanics fidelity.

The completion report should note that Bellman remains the largest measured stage in the controlled solve, so the phase did not magically eliminate all computational cost; it eliminated a major duplicate-work path and made the fixture practical.

---

# J12 — Simple/control regressions

## Status: REPORTED PASSING; CAPTURE FINAL OUTPUTS

User's interrupted implementation session reported these gates passing:

- one-mod;
- two-mod Any;
- no-unwanted;
- forced-Rare;
- selected self-fracture;
- wrong-fracture recovery;
- selected Harvest plan;
- W1–W6.

Before closure, record final rerun output after all code is frozen.

No new solver changes should be made solely because these values differ slightly due to search scheduling/order. Require mechanical/proof health and expected policy semantics, not byte-for-byte search timing.

---

# J13 — Mature Craft A / Craft C regressions

## Status: IN PROGRESS AT THE INTERRUPTION POINT

The last implementation session was waiting on the mature Craft A/C optimization and seeded mechanics checks.

Finish that run.

Acceptance:

- deterministic analytical results remain mechanically consistent with the mature fixtures;
- if full multi-seed is run, retain the existing stability expectations;
- zero missing policy states / fallback corruption;
- no transition formula was intentionally changed by Phase 2J;
- any output changes caused only by new cache/search instrumentation must be documented as such.

Because Phase 2J did alter search scheduling/caching but not the underlying transition formulas, it is reasonable to run the full mature regression once for final confidence and then freeze the implementation.

Do not tune Phase 2J around Craft A/C historical numbers.

---

# J14 — Build / lint / production browser worker

## Status: REQUIRED BEFORE CLOSURE

After J8/J12/J13 finish and no further solver change is required, run:

```text
npm run build
npm run lint
git diff --check
```

Then run the compiled production browser/worker smokes.

At minimum the final production-browser evidence must cover:

1. Phase 2I chronological-plan regression / Advanced exact policy retention.
2. Herald default RECOMMEND showing separate:
   - starting acquisition confidence;
   - crafting strategy confidence.
3. Herald Retry Deeper through the **same worker** and proof that the result reports resumed exact-context search reuse.
4. Exact four-mod fixture returning a finite provisional/certified-plan result before the host guard.
5. Defensive T1 Armour + T1 ES controlled browser-equivalent search completing in a practical request window.
6. no-route material safety remains intact for an intentionally constrained no-route fixture.
7. self-fracture/Harvest specialized plan coverage remains intact.

The documented pre-existing `policyEngine.ts:748` lint warning may remain if unchanged.

No unit tests.

---

# Code Review Notes

## 1. Transition caching approach is directionally correct

`SolverCraftActionAdapter` now caches reset-equivalent distributions for mechanics that erase non-fractured explicit state before rolling:

- Alteration;
- Harvest Reforge.

That is a sensible reuse boundary because the cache key is built from the mechanically relevant post-reset state and target semantics rather than arbitrary pre-reset filler identity.

The controlled Harvest diagnostic explicitly checks that an equivalent reset state reuses the exact distribution object and does not regenerate the ~204k-outcome distribution.

Keep this architecture unless a regression exposes a concrete correctness issue.

## 2. Retry Deeper continuation identity is appropriately conservative

The service identity includes the important mechanics/economic dimensions and uses explicit action-set/canonical-state versioning. Search budgets/intent are excluded intentionally so a larger exact-context request can extend previous work.

Do not loosen the identity further for cache-hit rate.

## 3. Four-mod route is now a search-quality result, not a hidden recipe

The product result is produced by `GenericSearchEngine`; the finite diagnostic baseline is separate and explicitly diagnostic-only.

Keep this separation in the completion report.

## 4. Near-deadline four-mod runtime needs production confirmation

The controlled four-mod solve returning at ~29s is the main closeout risk I see. The architecture itself is working, but the browser/worker/serialization path must prove it reliably returns before the host guard.

Do not declare Phase 2J complete until that smoke is recorded.

## 5. Resumed wall-clock improvement is modest but legitimate

Do not oversell resumed search as a 2x runtime optimization. Its strongest demonstrated result is eliminating ~16.7k duplicate transition generations while preserving exactly the same U/proof health. Bellman work still dominates substantial runtime.

That is still a successful Phase 2J result.

## 6. External parity wording must remain conservative

The controlled T1 Armour + T1 ES engine fixture is useful, but it is **not** the exact source fixture because the screenshot did not include physical metadata.

Keep:

```text
APPROXIMATE / EXTERNALLY CLOSE
```

and never write that exact Craft of Exile parity was established from the supplied screenshot.

---

# Minimal Remaining Work

Do these in order:

1. Finish the already-running mature Craft A/C regression.
2. Run/capture J8 three-notable regression.
3. Re-run/capture J12 controls on the final frozen code.
4. Re-run `phase2jSearchDiagnostic.ts` and `phase2jHarvestParityDiagnostic.ts` only if code changed after their committed outputs.
5. Run build, lint, `git diff --check`.
6. Run focused production browser/compiled-worker Phase 2J smoke, especially the four-mod deadline and same-worker Retry Deeper reuse.
7. If all pass, **stop changing solver code**.
8. Create `docs/crafting-engine/PHASE2J_POLICY_REFINEMENT_MULTIMOD_SCALING_COMPLETION_REPORT.md` using the required structure from the Phase 2J source document plus the J9 source-evidence limitation described here.
9. Commit regenerated diagnostics + completion report to `main`.

---

# Completion Decision Rule

Close Phase 2J if:

- J8/J12/J13/J14 pass;
- production worker proves the four-mod result returns safely;
- no new correctness regression appears;
- completion report documents the incomplete external physical metadata rather than inventing it.

Do **not** keep optimizing because:

- the four-mod U is large;
- global optimality remains unproven;
- resumed wall-clock speedup is smaller than duplicate-work reduction;
- Harvest remains approximate;
- the controlled crossover differs from the screenshot-derived guidance.

Those are not Phase 2J completion failures when they are reported proof-honestly.

---

# Deferred Work

The live Markov/search visualization discussed after the Phase 2J plan is useful, but it is **not part of this closeout**.

Do not add progress streaming or the visualization UI until Phase 2J is closed and the current solver/search behavior is frozen.

A future phase can introduce worker `PROGRESS` events and player/developer search visualization on top of this stable baseline.
