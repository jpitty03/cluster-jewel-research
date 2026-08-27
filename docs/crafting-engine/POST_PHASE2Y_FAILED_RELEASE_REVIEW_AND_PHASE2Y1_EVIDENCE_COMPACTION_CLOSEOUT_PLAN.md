# Post-Phase 2Y Failed Release Review and Phase 2Y.1 Closeout Plan

## Phase 2Y.1 — Worker-Evidence Contract Repair, Targeted Revalidation, and Quality-Lab Execution Hardening

Baseline reviewed: `a6743b8443e1c0817c110c37387d5412c64340a5` on `main`.

This baseline contains the user's committed Phase 2Y work after stopping the release matrix at **114/115 PASS**. No Phase 2Y completion report, final release commit, push/deploy closeout, or release certification exists yet.

The sole reported failing gate is:

```text
Y18-generated-proof-debt-browser-fuzz
Compacted Worker evidence omits route.lowerBoundChaos
→ fuzz method 0 route L must be a finite number
```

No unit tests are to be added or run unless the user explicitly reverses the existing project constraint.

---

# 1. Review Verdict

Do **not** restart Phase 2Y from scratch.

The current Phase 2Y implementation should be treated as **implementation-complete but release-unclosed** pending repair of one Quality Lab evidence-contract defect and one final acceptance pass.

The failed 114/115 run is valuable evidence:

- the new Phase 2Y solver/proof implementation survived almost the entire real-browser lifecycle;
- the previously failing cross-surface route naming/accounting gate Y14 passed;
- coupled full-route proof bounds and independently displayed acquisition/downstream stage bounds are now correctly separated;
- selected/equivalent route-name identity and stage upper-bound reconciliation are enforced by the direct Phase 2Y diagnostic;
- the failure is in the **test evidence compactor**, not evidence that `RouteSummary.lowerBoundChaos` is absent from the real Worker result.

Phase 2Y.1 should be a narrow closeout pass. Do not redesign the relaxed bound, proof scheduler, equivalence model, or optimizer unless a targeted regression demonstrates a real product defect.

---

# 2. Confirmed Root Cause

The current `quality-lab/src/eventCapture.ts` compactor defines a reduced route object roughly as:

```typescript
const compactRoute = (route) => route && ({
  actionId: route.actionId,
  actionName: route.actionName,
  acquisitionCandidateId: route.acquisitionCandidateId,
  acquisitionMethodId: route.acquisitionMethodId,
  expectedTotalCostChaos: route.expectedTotalCostChaos,
  incumbentUpperBoundChaos: route.incumbentUpperBoundChaos,
  metrics: route.metrics,
});
```

The canonical `RouteSummary` proof scalar `lowerBoundChaos` is not preserved.

Y18 intentionally consumes **older compacted Worker results** rather than only the one full terminal result kept in memory. It therefore receives a real route whose lower-bound field was discarded by the harness itself.

This is exactly the kind of failure the fuzz gate should catch. Do not weaken Y18 or substitute an inferred lower bound.

---

# 3. Fix the Evidence Contract, Not the Assertion

## 3.1 Define the minimum compact RouteSummary contract

The compact representation must preserve every scalar field required to distinguish an executable route from its proof evidence.

At minimum preserve:

```typescript
interface CompactRouteSummary {
  actionId: string;
  name?: string;
  actionName?: string;
  acquisitionCandidateId?: string;
  acquisitionMethodId?: string;
  expectedTotalCostChaos: number | null;
  lowerBoundChaos: number;
  incumbentUpperBoundChaos: number | null;
  optimalityGapChaos: number | null;
  status: string;
  couldBeatResolvedIncumbent: boolean;
  metrics?: RouteMetricVector;
  acquisitionMetrics?: RouteMetricVector;
  downstreamMetrics?: RouteMetricVector;
}
```

Use the actual current service schema rather than copying this interface blindly. The principle is that all small proof/economic scalar fields survive compaction.

Do not preserve huge policy graphs merely to satisfy this requirement.

## 3.2 Preserve stage metrics where present

Phase 2Y already repaired method-family compaction so acquisition/downstream/full-route L/U fields survive. Retain that work.

For route-level evidence also preserve:

```text
route L
route U
route optimality gap
route status
could-beat-incumbent state
acquisition metric vector
 downstream metric vector
full-route metric vector
```

if those fields exist in the authoritative route object.

## 3.3 One canonical compactor contract

Avoid future drift between:

- recommended route;
- alternatives;
- Harvest comparison routes;
- method-family route;
- Pareto route.

Every route must pass through the same `compactRoute(...)` implementation.

Add a harness-side contract check over a representative real Worker result that enumerates every compacted route surface and verifies the same required scalar proof fields survive.

## 3.4 No fabricated fallback

If a real route has no finite lower bound where the schema requires one:

- fail the semantic gate;
- retain the exact route/family/request identity;
- do not substitute `0`, stage L, full-route L, or another candidate's bound.

Compaction must be loss-aware, not reconstructive.

---

# 4. Repair the Harness Iteration Workflow Before Another Full Run

The all-day loop exposed a second process problem: a one-field evidence-compaction defect should not require multiple 20-minute release matrices to diagnose.

Phase 2Y.1 must add or formalize **targeted Quality Lab execution** while keeping the complete 115-gate release matrix authoritative.

## 4.1 Required focused execution path

Provide one supported command or gate filter that can run the Y18 dependency set without the entire release suite.

Preferred forms, in order:

```text
npm run lab:phase2y-fuzz
```

or

```text
npm run lab:release -- --gate Y18
```

or a documented equivalent scenario/filter already supported by the runner.

The focused path must use:

- real Playwright Chromium;
- actual built product;
- actual module Worker;
- the same eventCapture compactor as release;
- the same Y18 oracle implementation;
- enough preceding result generation to force at least one older Worker RESULT to be compacted.

Do not replace Y18 with a synthetic object test.

## 4.2 Add a compaction-boundary witness

Before running generated fuzz, explicitly prove:

```text
full real Worker RESULT
→ compactCompletedResults()
→ compacted historical route
```

retains the authoritative route's:

```text
expectedTotalCostChaos
lowerBoundChaos
incumbentUpperBoundChaos
optimalityGapChaos
status
metrics
```

within exact serialization tolerance.

## 4.3 Run order after the repair

Do not immediately start another full 20-minute matrix.

Required order:

1. `npm run build`
2. `npm run lint`
3. `git diff --check`
4. direct Phase 2Y diagnostic
5. focused compaction witness
6. focused Y18 real-browser run
7. any directly related Y14 / method-family proof-bound gate
8. fast Worker/browser smoke

Only after all targeted gates pass should the complete `npm run lab:release` run **once** as final acceptance evidence.

If a targeted gate fails, repair and repeat only the targeted set.

## 4.4 After the full matrix passes

Run the independent mature/phase diagnostics **without rerunning the full Playwright matrix unless those diagnostics require a code change**.

If diagnostics pass:

```text
DO NOT rerun lab:release
→ inspect release-gate.json
→ inspect screenshots/artifacts
→ write completion report
→ final review
→ commit/push/deploy
```

If a later diagnostic requires a source change, run:

```text
changed diagnostic
+ directly affected focused Playwright group
+ fast browser smoke
```

Then decide whether the change touches a shared release contract strongly enough to warrant one final full matrix.

---

# 5. Phase 2Y Product Work to Preserve

The current commit contains substantial Phase 2Y work. Preserve it unless a regression proves it wrong.

At minimum retain:

- `RELAXED_TARGET_PROGRESS_LOWER_BOUND_V1` and its admissibility/fail-closed rules;
- relaxed-bound cache identity and telemetry;
- proof-debt / proof-productivity scheduling;
- prerequisite continuation behavior;
- `stopAfterFirstCertifiedPolicy` internal scheduler control;
- requested-vs-used budget telemetry;
- stop-reason reporting;
- canonical player route-family labels;
- canonical policy equivalence fingerprints;
- `SAME_AS_SELECTED` method-family status;
- selected/equivalent policy naming;
- coupled full-route proof bound separated from independent stage-display bounds;
- acquisition/downstream U reconciliation to full-route U;
- Phase 2X craft-plan semantics and no-phantom-Harvest guarantees;
- objective-aware family reservation when `compareMethodFamilies=true`;
- retained-graph continuation and Worker evidence memory compaction.

Do not collapse coupled full-route lower bounds into `acquisitionL + downstreamL` merely to simplify presentation. The current repair correctly recognizes that the coupled proof may be stronger than the sum of independently displayed stage lower bounds.

---

# 6. Mandatory Phase 2Y.1 Diagnostics

## Y1.1 — Compact route schema

For a real resolved Worker route assert after compaction:

```text
expectedTotalCostChaos: retained
lowerBoundChaos: retained and finite when source finite
incumbentUpperBoundChaos: retained
optimalityGapChaos: retained
status: retained
couldBeatResolvedIncumbent: retained
metrics: retained
```

## Y1.2 — All route surfaces use the same compactor

Exercise:

- `recommended`;
- `alternatives[]`;
- Harvest conventional route;
- Harvest route;
- method-family `route`;
- Pareto `route`.

No surface may use a weaker proof-scalar subset.

## Y1.3 — Compacted historical evidence

Force at least two completed real Worker results so the earlier result is compacted. Verify its route lower bound remains readable and equals the pre-compaction source value.

## Y1.4 — Y18 generated proof-debt fuzz

Re-run the actual previously failing gate with the same seed/corpus unless the current runner records a stronger deterministic replacement.

Acceptance:

```text
all generated route L values expected by the oracle are finite
stage bounds satisfy their own L <= U rules
coupled full-route bound remains semantically distinct
no inferred/fabricated compacted value
```

## Y1.5 — Y14 cross-surface route identity

Keep the repaired Y14 passing:

- selected route name;
- equivalent method family label;
- canonical bundle identity;
- acquisition/downstream/full-route U;
- stage proof evidence.

## Y1.6 — Four-mod browser control

The prior four-mod browser gate must remain passing under unchanged budgets.

## Y1.7 — Method comparison scheduler

Preserve the repaired reservation rule:

```text
compareMethodFamilies=true
```

must reserve unified-family time similarly to objective modes that require multiple families.

The browser comparison must not regress to consuming almost the entire default host envelope before family execution.

## Y1.8 — Worker compaction memory safety

Measure that retaining proof scalars does not materially undo evidence compaction.

Record:

- event count;
- compacted result approximate serialized bytes before/after repair;
- browser memory trend if available;
- no giant policy graph retained in every historical result.

A few additional numeric fields are expected to be negligible.

## Y1.9 — Full real-browser release

After Y1.1–Y1.8 are green, run the full release matrix once.

Acceptance:

```text
115/115 PASS
```

or a larger count only if new Phase 2Y.1 gates are intentionally added.

No failed gate may be waived.

## Y1.10 — Mature diagnostics

After the final browser pass:

```text
npm run diagnostic:mature
npm run diagnostic:phase2t
npm run diagnostic:phase2u
npm run diagnostic:phase2v
npm run diagnostic:phase2w
npm run diagnostic:phase2x
npm run diagnostic:phase2y
```

If these cause no source edits, do not run the full browser matrix again.

## Y1.11 — No-fallback and hygiene

Require:

```text
npm run lab:no-fallback-probe
npm run build
npm run lint
git diff --check
```

## Y1.12 — Artifact review

Inspect, do not merely generate:

- `quality-lab/reports/release-gate.json`;
- summary report;
- Worker event evidence;
- Phase 2Y proof screenshots;
- selected/equivalent policy presentation;
- route-stage bounds;
- no console/page/network errors.

---

# 7. Phase 2Y Completion Report

Once the release matrix and mature diagnostics are all green, create the originally required Phase 2Y completion report rather than inventing a separate product-version closeout.

Use the path required by the Phase 2Y source plan if it already specifies one. If not, use:

```text
docs/crafting-engine/PHASE2Y_PROOF_EFFICIENCY_BUDGET_TELEMETRY_POLICY_EQUIVALENCE_COMPLETION_REPORT.md
```

Include the following additional Phase 2Y.1 closeout evidence:

1. stopped 114/115 run and exact failed gate;
2. root cause in Worker evidence compaction;
3. compact route contract before/after;
4. proof that full result and compacted historical result agree on route L/U/gap/status;
5. Y18 focused rerun result;
6. Y14 preservation result;
7. method-comparison reservation preservation;
8. compaction memory-size comparison;
9. final full release count and run ID;
10. complete mature-diagnostic matrix;
11. artifact visual/manual review;
12. all Phase 2Y feature results required by the original source plan;
13. unit tests added/run: expected `NO`;
14. mechanics probabilities changed: expected `NO`;
15. state identity weakened: expected `NO`;
16. hardcoded route winner added: expected `NO`;
17. pre-fractured market ranking added: expected `NO`;
18. final deployment SHA and hosted run.

---

# 8. Post-2Y Recommendation: Make Quality Lab Faster

Do not implement this section before closing Phase 2Y unless it is trivial and necessary for targeted Y18 execution.

After Phase 2Y is green, the next dedicated engineering phase should optimize **Quality Lab execution architecture**, because the release harness is now a larger iteration bottleneck than many product changes.

Recommended goals for that later phase:

- self-contained test scenarios rather than late gates depending on earlier browser state;
- shard optimizer semantics, method families, UI/responsive, Constellation, and export/Worker lifecycle;
- run independent shards concurrently where CPU contention is safe;
- checkpoint successful shard artifacts;
- resume from a failed shard/gate rather than replaying all earlier gates;
- separate long replay/screensaver/memory soak from normal development acceptance;
- real-time console progress such as `[84/115] RUN/PASS`;
- per-gate timings and top-10 slowest scenarios;
- fast development gate (~1–3 min), release smoke (~2–5 min), full release matrix (~5–10 min target), extended soak manual/final;
- cache frozen expensive solver artifacts only when mechanics/solver/request/price identities prove reuse is valid;
- no reduction in semantic assertions merely to improve runtime.

The full matrix remains the final source of truth until an equivalently strong sharded replacement is proven.

---

# 9. Autonomous Execution Rules

The implementation LLM should proceed with minimal supervision.

It should:

1. fetch latest `main` and preserve `a6743b8...` plus any newer user commits;
2. inspect the actual current compactor and Y18 oracle before editing;
3. repair compact route proof-field preservation generically;
4. add the focused real-browser compaction/Y18 execution path if absent;
5. run targeted gates until green;
6. run the full browser release matrix exactly once after targeted green;
7. run mature/phase diagnostics;
8. if no code changes result, do not rerun the full browser matrix;
9. inspect artifacts and release ledger;
10. write the Phase 2Y completion report;
11. perform a final code/release review;
12. commit and push the repaired Phase 2Y implementation/evidence/report to `main`;
13. run/verify the lean Pages deployment;
14. verify worktree clean and `HEAD == origin/main`.

Do not stop for an ordinary failing assertion. Diagnose it, fix the generic defect, run the smallest relevant targeted gate, and continue.

Stop and ask the user only for:

- a genuinely unknown game mechanic;
- unavailable external credential/service required for completion;
- destructive conflict with a newer user-owned change that cannot be safely reconciled;
- a change that would require violating the permanent architecture constraints.

---

# 10. Completion Gates

Phase 2Y closes only when:

- the compacted Worker route preserves `lowerBoundChaos` and the rest of the canonical proof scalar contract;
- Y18 passes using real compacted historical Worker evidence;
- Y14 remains passing;
- coupled full-route L and independent stage L/U remain correctly separated;
- selected/equivalent route identity remains consistent;
- method comparison scheduler reservation remains repaired;
- targeted compaction tests pass before the full release run;
- full real Playwright release is 100% green;
- mature Phase 2E–2X regressions and Phase 2Y diagnostics pass;
- no-fallback/build/lint/diff pass;
- release artifacts are inspected;
- completion report is written;
- final deployment succeeds;
- no unit tests added/run;
- no mechanics probabilities changed;
- no state identity weakened;
- no hardcoded route winner added;
- no pre-fractured market ranking restored.

---

# Final Phase 2Y.1 Principle

> **Do not weaken a proof fuzz gate because the harness discarded evidence. Preserve the small canonical proof fields through compaction, validate the exact failed boundary with a focused real-browser path, and pay for the full release matrix only after the targeted defect is green.**
