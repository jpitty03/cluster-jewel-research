# Post Phase 2K Review and Phase 2K.1 Exact-Fixture / Telemetry Hardening

## Status

Live `main` reviewed at:

- `f791da5d28a0044ea3817206d0e40ec9708b205e` — Phase 2K implementation + completion report

Phase 2K's **core product objective is working**: the real browser UI now resolves executable self-fracture routes and ranks them far below the brute-force clean-base path, and the Search Activity panel displays real live acquisition/search telemetry.

However, the formal Phase 2K closeout evidence has several validation gaps/mismatches. Do **not** reopen the architecture or rewrite the solver. Treat this as a focused **Phase 2K.1 hardening/closeout correction** before declaring the Phase 2K evidence fully certified.

**No unit tests.**

---

# Real browser evidence after Phase 2K

Exact user-run browser fixture:

```text
Large Cluster Jewel
10% increased Attack Damage
ilvl 84
12 passives
Final rarity: Rare
Extra affixes: Allowed

Targets:
- 35% increased Effect
- T1 Intelligence
- T1 Maximum Energy Shield
- +4 All Attributes
```

The live Search Activity panel shows the intended product behavior:

```text
Graph Resumed: 28,337 retained states
States expanded: 30,002
Best executable U: 4,144.6c
Active unresolved L: 359.8c
```

Visible macro candidate evidence:

```text
Clean Base
  executable full route: 182,116.7c at current search depth

Self-fracture 35% Effect (Powerful)
  acquisition U: 1,465.8c
  downstream U: 3,970.0c
  full U: 5,435.8c

Self-fracture T1 Intelligence (of the Prodigy)
  acquisition U: 1,477.9c
  downstream U: 2,666.7c
  full U: 4,144.6c

Self-fracture T1 ES (Glowing)
  still probing

Self-fracture +4 Attributes (of the Meteor)
  not yet started in the captured frame
```

This is strong real-world confirmation of the key Phase 2K product fix: fractured acquisition is no longer merely a ~359.8c lower bound. At least two executable self-fracture acquisitions and downstream full routes are now exposed and the T1 Intelligence fracture is the best executable route in this live run.

Do not hardcode this winner. The winner must remain price/pool/policy-derived.

---

# Finding 1 — Formal "real-world fixture" is not the exact user fixture

Both:

- `crafting-engine/scripts/phase2kSearchDiagnostic.ts`
- `scripts/browserPhase2kSmoke.ts`

currently label their primary case as the real four-mod fixture, but the committed inputs are:

```text
clusterType: 12% increased Attack Damage while Dual Wielding
passiveCount: 8
finalStateConstraints.maxUnmatchedAffixes: 0
```

The user fixture that triggered Phase 2K is:

```text
clusterType: 10% increased Attack Damage
passiveCount: 12
requiredRarity: rare
extra affixes: allowed
```

This is a material test-fixture mismatch. It does not invalidate the generic implementation, especially because the attached real browser run demonstrates the intended path works on the actual target, but the completion report must not claim that the formal diagnostic itself is the exact real-world fixture until this is corrected.

## Required correction K1

Add a permanently pinned exact RWE fixture matching the browser target above.

Use exact target IDs:

```text
AfflictionJewelSmallPassivesHaveIncreasedEffect2
AfflictionJewelSmallPassivesGrantInt3
AfflictionJewelSmallPassivesGrantES3
AfflictionJewelSmallPassivesGrantAttributes3
```

Requirements:

- Large Cluster Jewel
- `10% increased Attack Damage`
- ilvl 84
- 12 passives
- required rarity Rare
- extra affixes allowed
- no market-fractured purchase

Use a frozen explicit PriceBook for deterministic regression. Keep the user's stale Allflame browser run as real-world evidence only; do not make stale market data the deterministic expected value fixture.

Record:

- clean executable U;
- each target fracture's L;
- each resolved acquisition U;
- each downstream U;
- each full-route U;
- selected route;
- proper/absorption/Bellman/occupancy/reconciliation health;
- acquisition safety/proof status;
- runtime.

Acceptance: at least one executable self-fracture full route must resolve and rank against Clean Base. Do not require a particular target to win.

---

# Finding 2 — The attached "initial" browser capture is actually a resumed search

The live panel explicitly reports:

```text
Graph Resumed (28,337 states)
Retained / Reused: 28,337
```

Therefore this screenshot/PDF is not a clean cold baseline, regardless of its filename.

That behavior is not a bug: Phase 2K intentionally resumes exact-context work in the same worker. In fact, the UI correctly makes reuse visible.

But future regression evidence must distinguish:

```text
COLD initial request
vs
same-worker RESUMED request
```

## Required correction K2

For the exact RWE fixture, capture both:

1. fresh service/worker cold RECOMMEND;
2. same-worker Retry Deeper / repeated exact-context request.

Require:

- `COLD` then `RESUMED` status;
- retained states > 0 on resumed request;
- equivalent or improved selected route;
- no cross-request state leakage when any mechanics/economic identity input changes.

The UI wording `Graph Resumed` / `Continuing prior search` should remain explicit.

---

# Finding 3 — The formal browser smoke does not exercise a real browser Worker boundary

`scripts/browserPhase2kSmoke.ts` currently imports and directly calls:

```ts
executeOptimizerWorkerRequest(...)
```

and JSON serializes the response.

That validates service/worker-engine serialization shape, but it is not the same thing as instantiating the actual compiled `Worker`, receiving `PROGRESS` events from `optimizer.worker.ts`, and then receiving the terminal result through `OptimizerWorkerClient`.

The user's real browser capture is valuable manual evidence that the UI wiring works, but formal closeout should have an actual production-worker smoke.

## Required correction K3

Add or extend a production browser/worker smoke that exercises the actual compiled worker path:

```text
CraftOptimizer / OptimizerWorkerClient
    -> optimizer.worker.ts
    -> PROGRESS (one or more)
    -> RESULT or ERROR
```

At minimum assert:

- real `PROGRESS` arrives before terminal RESULT on a nontrivial fixture;
- requestId routing is correct;
- structured clone succeeds;
- stale/unknown request progress is ignored;
- Cancel terminates/replaces the worker and no further old-request progress mutates UI state;
- host-guard replacement does the same;
- no progress after terminal RESULT/ERROR for that request.

Do not require UI automation if the existing project browser-smoke infrastructure can instantiate the compiled Worker more directly, but do not label a direct function call as a full worker-boundary smoke.

---

# Finding 4 — Final progress phase is not COMPLETE in committed smoke evidence

`output-browser-phase2k-smoke.txt` records:

```text
Final progress phase: FRACTURE_PROBE
```

Yet `OptimizerProgressSnapshot.phase` includes `COMPLETE`, and the Phase 2K plan called for a completion milestone.

The final result itself is healthy, so this is telemetry closeout semantics, not a solver failure.

## Required correction K4

Before terminal RESULT, emit one forced final progress snapshot:

```text
phase: COMPLETE
currentFocus: selected route / search finished
```

It should contain the final known candidate statuses and final best executable U / unresolved L / potential gap.

Then assert:

```text
last PROGRESS.phase === COMPLETE
RESULT follows
no PROGRESS follows RESULT
```

If a search ends in ERROR/cancel/host-guard replacement, do not synthesize a misleading COMPLETE event.

---

# Finding 5 — Telemetry equivalence and overhead gate is not evidenced in the completion report

The Phase 2K source plan required telemetry to be observational only and targeted <=5% overhead.

The completion report records telemetry snapshots and runtimes, but does not provide an ON/OFF equivalence comparison or measured overhead result.

## Required correction K5

On a deterministic frozen fixture, run:

```text
A. optimizer without progress callback
B. optimizer with progress callback
```

Require identical within numerical tolerance:

- selected acquisition/action;
- expected cost;
- proper/absorption/Bellman/occupancy/reconciliation;
- graph/search decision semantics;
- candidate ranking/proof.

Record runtime samples and overhead. Target <=5%. If noisy on one sample, use several repetitions and report median rather than weakening the solver.

If overhead exceeds target, reduce telemetry emission frequency/payload before changing search fidelity.

---

# Finding 6 — Explain executable Clean U at current depth versus prior Clean U

The real Phase 2K browser capture shows Clean Base as an executable `182,116.7c` route, whereas the pre-2K browser PDFs on the same visible target previously showed a much lower clean executable route around `42,659c`.

This does **not automatically mean a regression**. After a much cheaper fracture route is found, the competitive scheduler may rationally stop spending search budget refining a dominated clean executable policy. A resolved U means executable upper bound, not optimized U.

However, this distinction should be measured rather than assumed.

## Required correction K6

With a frozen identical price fixture:

- run clean-only or sufficient clean DEEPEN to recover a mature clean U;
- run the normal Phase 2K portfolio scheduler;
- compare clean candidate U at the point the scheduler stops refining it;
- prove the scheduler stopped because a fracture route already dominates economically or because its remaining budget was reallocated to more competitive candidates.

If true, expose in diagnostics/UI wording that the clean figure is the **current executable upper bound at the allocated search depth**, not necessarily the mature clean-policy cost.

Do not waste production runtime refining a route that is safely irrelevant to the selected recommendation merely to make its displayed U prettier.

---

# UI review

The live visualizer is a substantial improvement over the earlier decorative chain.

Keep:

- phase badge;
- `Graph Resumed` visibility;
- States Expanded / Retained-Reused / Elapsed;
- Best Executable U versus Active Bound L;
- explicit Optimality Gap;
- individual candidate cards;
- separate Acquisition U / Downstream U / Full Route U;
- status labels such as PROBING, RESOLVED, FULL ROUTE RESOLVED, NOT STARTED;
- recent milestone feed.

The captured UI correctly shows why a user should prefer the fractured path without pretending unresolved candidates are priced at their lower bound.

### Small UI hardening

Add/confirm:

- `COMPLETE` terminal state rather than leaving the final panel saying PROBING after RESULT;
- current executable U wording for non-selected candidates whose downstream policy is not deeply refined;
- selected route badge once final RESULT arrives;
- candidate policy-confidence/proof hint in Advanced details if useful;
- no fake percent-complete.

Do not expand into a raw thousands-node graph.

---

# Phase 2K.1 Required Regression Gates

1. Exact cold RWE fixture with frozen prices.
2. Exact same-worker resumed RWE fixture.
3. Full candidate table for Clean + all four self-fracture targets.
4. At least one self-fracture full route executable; winner must emerge generically.
5. Acquisition restart/wrong-fracture fidelity retained.
6. Cold/resumed acquisition equivalence/reuse evidence.
7. Actual worker-boundary `PROGRESS -> COMPLETE -> RESULT` smoke.
8. Cancel/error/host-guard terminal-message hygiene.
9. Telemetry ON/OFF equality.
10. Telemetry overhead measurement, target <=5%.
11. Explain current-depth Clean U versus mature clean-only U.
12. Phase 2E fracture-fidelity regression.
13. Phase 2I W1-W6 regression.
14. Phase 2J Herald refinement/reuse, Harvest parity, defensive two-mod, J8 three-notable regressions.
15. Build, lint, `git diff --check`.
16. No unit tests.

---

# Permanent constraints

- No hardcoded fracture winner or target order.
- No target/Craft-specific solver branches.
- No market pre-fractured purchase in normal core ranking.
- Self-fracture must be executable shared mechanics.
- Wrong fracture must restart/reacquire.
- No fixed `4x` fracture shortcut.
- No weaker state identity without equivalence evidence.
- External observations remain validation-only.
- Unknown prices are not invented.
- Allflame crafting mechanic remains disabled/deferred.
- Telemetry is observational only.
- No unit tests unless explicitly requested later.

---

# Completion artifact

Update or add:

```text
docs/crafting-engine/PHASE2K1_EXACT_FIXTURE_TELEMETRY_HARDENING_COMPLETION_REPORT.md
```

Phase 2K.1 closes when the exact target is formally pinned, cold/resumed behavior is separately proven, the real worker path terminates with `COMPLETE -> RESULT`, telemetry equality/overhead is measured, and the existing fracture winner behavior remains generic and proof-honest.
