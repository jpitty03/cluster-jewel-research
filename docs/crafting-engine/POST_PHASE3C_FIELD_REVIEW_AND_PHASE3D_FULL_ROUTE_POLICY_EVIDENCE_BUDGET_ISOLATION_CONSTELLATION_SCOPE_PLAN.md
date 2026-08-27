# Post-Phase 3C Field Review and Phase 3D Plan

## Full-Route Policy Evidence + Recommendation Budget Isolation + Constellation Scope Clarity

Status: **READY FOR IMPLEMENTATION**

Baseline reviewed: `621996531b025e4d7356fae7a9163c87f95723eb` on `main`.

Phase 3C is **CLOSED / PASS / DEPLOYED**. Do not reopen its generic policy-admissibility repair or large-SCC semantic layout unless Phase 3D finds a direct regression against those completed contracts.

This phase is based on the first real field run after Phase 3C using the same three-notable minion-jewel request that exposed the earlier Open-vs-Conventional inconsistency.

Phase 3D has three related goals:

1. make method-family admissibility and required-action evidence operate on the **whole executable route**, not only the downstream policy graph;
2. isolate the core recommendation search from optional method-family/admissibility enrichment so additional explainability work cannot consume the budget needed to discover the best core incumbent;
3. make the now-correct Constellation visually explicit about **acquisition-preparation state vs final-craft state**, while improving default fit/camera behavior without dropping exact PolicyFlow truth.

No unit tests are to be added or run. Use the Phase 3A targeted/DEV/RELEASE harness, direct diagnostics, exact Worker/browser evidence, and retained mature non-unit diagnostics. EXTENDED, long-soak, nightly, and the legacy 115-gate suite remain manual-only and must not be run as ordinary Phase 3D acceptance.

---

# 1. Frozen Post-Phase-3C Field Observation

The field run used:

```text
Base:           Large Cluster Jewel
Cluster type:   Minions deal 10% increased Damage
Item level:     84
Passives:       8
Targets:        Primordial Bond + Renewal + Rotten Claws
Final rarity:   Rare
Extra affixes:  allowed
Objective:      CHEAPEST_CHAOS
Budget:         NORMAL — 5,000 states / 30s / 3 rounds
League:         Allflame
Clean base:     40c
Expected sale:  1708c
```

Frozen relevant prices:

```text
annul          11.66c
exalt           1.17c
scour           0.5391c
alteration      0.1336c
transmutation   0.005012c
augmentation    0.03941c
regal           0.03638c
fracturing    298.6c
```

The post-Phase-3C field result selected:

```text
Selected route:            Self-fracture Primordial Bond
Expected full-route cost:  1459.792366c
Expected actions:          740.847
Estimated manual time:     314.5s
Recommendation status:     PROVISIONAL_RESOLVED
Core portfolio expanded:   3,334 states
Core portfolio retained:   21,944 states
Elapsed:                    21.2s
Stop reason:                HOST_RESERVE
Competitive families:      3
```

The selected route is plausible and executable. The field review does **not** assume that clean acquisition should be the winner.

Two follow-up inconsistencies are more important than the winner itself.

---

# 2. Issue A — `Same selected policy` Contradicts `inadmissible`

The method-family card for `Self-fracture Primordial Bond` correctly reports:

```text
status: SAME_AS_SELECTED
route: Self-fracture Primordial Bond
full-route U: ~1459.792c
canonical policy equivalence: true
on-policy full-route actions include fracturing_orb
```

Yet the same result also reports:

```text
Selected Open policy in this family: inadmissible
failure: REQUIRED_ACTION_NOT_OBSERVED(fracturing_orb)
```

This is internally contradictory for a player and exposes a real evidence-scope mismatch.

The current Phase 3C admissibility validator builds `positiveSourceActionIds` from `sourceResult.onPolicyRules`. For a self-fracture route, those rules represent the downstream fixed policy. The Fracturing Orb is an **acquisition-stage** action, so it is absent from that downstream set even though the complete executable route positively uses it.

The exported full-route usage proves the acquisition stage contains approximately:

```text
fracturing_orb      4.0
restart_reacquire   3.0
...
```

and the family result's complete `onPolicyActionIds` also includes `fracturing_orb`.

Phase 3D must stop treating downstream-only policy action evidence as synonymous with full-route mechanic evidence.

---

# 3. Stage-Aware Required-Action Contract

Replace ambiguous `requiredActionIds: string[]` semantics with an explicit stage-aware evidence contract, or introduce an equivalent internal representation.

Recommended shape:

```ts
interface RequiredActionEvidenceSpec {
  actionId: string;
  scope: 'ACQUISITION' | 'DOWNSTREAM' | 'FULL_ROUTE';
}
```

Exact naming may differ.

The intended semantics are:

```text
Self-fracture family
  fracturing_orb required in ACQUISITION/FULL_ROUTE evidence

Harvest family
  harvest_reforge_* required in DOWNSTREAM evidence

Self-fracture + Harvest family
  fracturing_orb required in ACQUISITION
  harvest_reforge_* required in DOWNSTREAM
```

Do not merely special-case `fracturing_orb`.

Build a canonical full-route action-evidence object from authoritative acquisition + downstream policy components. It should preserve at least:

```text
actionId
scope
expectedCount / positive occupancy evidence
evidence source
physical acquisition identity
policy/session identity
```

Required-action checks must consume this evidence contract.

Do not infer required-action satisfaction from a display label or copied scalar list.

---

# 4. Full-Route Admissibility Invariant

For a family policy that is canonically equivalent to the selected route:

```text
SAME_AS_SELECTED
```

must not coexist with a contradictory player-facing statement that the same full route is inadmissible solely because an acquisition-stage required action was omitted from a downstream-only rule set.

Acceptance invariant:

```text
if equivalentToSelectedPolicy === true
and the family acquisition identity matches
and all stage-scoped required mechanics are positively observed,
then selectedOpenPolicyAdmissibility must not fail REQUIRED_ACTION_NOT_OBSERVED
for those observed mechanics.
```

This does **not** mean equality implies admissibility. Preserve all Phase 3C checks:

- acquisition kind;
- physical acquisition identity;
- acquisition cost;
- target identity;
- allowed/forbidden actions;
- exact state legality;
- regenerated transitions;
- fixed-policy cost/action/time parity;
- properness and absorption.

The fix is evidence scope, not weaker validation.

---

# 5. Required Negative Controls

Phase 3D must prove the new full-route evidence does not make unrelated families falsely admissible.

Required controls:

```text
Conventional vs selected self-fracture Primordial Bond
  → still inadmissible because acquisition kind/identity/cost mismatch

Harvest Reforge Physical family vs non-Harvest selected policy
  → still inadmissible because required downstream Harvest action is absent

Self-fracture Renewal vs self-fracture Primordial Bond
  → still inadmissible because fractured acquisition identity differs

Self-fracture + Harvest
  → requires both the correct self-fracture acquisition evidence and the required downstream Harvest action
```

No family may satisfy a downstream-required mechanic because the same action ID happened in acquisition, or vice versa, unless the family explicitly declares `FULL_ROUTE` scope.

---

# 6. Issue B — Core Recommendation Quality Regressed While Explainability Work Increased

The pre-Phase-3C field export and the Phase 3C targeted acceptance proved the exact same clean request can produce a clean executable policy near:

```text
1440.187675c
```

The Phase 3C completion report explicitly revalidated that known clean policy and repaired Conventional so it could not publish the historical 2276.64c incumbent when the 1440.19c policy was known and admissible.

However, the new post-Phase-3C field run reports the current Clean Base candidate at:

```text
Clean acquisition:         40c
Current clean full-route U: 4767.731c
Expected actions:           ~35,646
Family status:              BEST_FOUND_UNPROVEN
```

The request inputs, target, prices, and NORMAL budget are otherwise the same.

The old clean result is not expected to persist magically across a new browser session. The concern is different:

> Phase 3C added expensive state-by-state revalidation and family explainability. The core recommendation search now stops at 3,334 expanded states with `HOST_RESERVE`, while the same NORMAL request previously reached a materially better clean policy under the same mechanics.

Phase 3D must determine whether optional family comparison/admissibility work is consuming the same host deadline before the core recommendation has received its intended search opportunity.

Do not assume that this is the root cause. Instrument it first.

---

# 7. Search-Budget Ledger

Add explicit request-level timing/work accounting that separates at least:

```text
CORE_PORTFOLIO_SEARCH
ACQUISITION_SYNTHESIS
METHOD_FAMILY_SEARCH
POLICY_ADMISSIBILITY_REVALIDATION
POLICY_EQUIVALENCE / PRESENTATION
PROOF_BOUND_WORK
HOST_SERIALIZATION_RESERVE
```

Expose machine-readable telemetry such as:

```text
requested total wall time
core search allocated wall time
core search used wall time
core states expanded
core stop reason
method-family search used wall time
admissibility revalidation used wall time
presentation/evidence used wall time
host reserve entered at
remaining request time at each stage
```

Names may differ.

The purpose is to answer exactly:

```text
Why did this NORMAL request stop core search at 3,334 states instead of 5,000?
```

No new timing value may be fabricated. Use the actual monotonic request clock and stage timers.

---

# 8. Recommendation-Core Budget Isolation

The player asked for the best recommendation first. Method comparison and explainability must not silently degrade the recommendation itself.

Establish this invariant:

```text
For identical mechanics/input/objective/search budget,
enabling method-family comparison/admissibility enrichment must not reduce
an already-planned core search envelope or worsen an already-discovered core incumbent.
```

A useful architecture is:

```text
core portfolio search
  ↓
freeze canonical executable incumbents / proof state
  ↓
optional family comparisons and policy revalidation
  ↓
presentation enrichment
```

If the implementation keeps these stages interleaved, it must provide equivalent budget isolation guarantees.

Do not hardcode a fixture-specific time split.

The core may still stop early for a legitimate reason such as:

- proof closure;
- state cap;
- explicit core wall-time cap;
- global host safety condition that would otherwise prevent serialization.

But post-hoc family auditing should not be the hidden reason the core stopped early.

If the total player-facing 30s cap makes complete family comparison impossible after protecting core search, return partial method-family statuses honestly rather than stealing core recommendation budget.

---

# 9. Compare-Methods A/B Invariant

Add a deterministic diagnostic using the frozen request:

```text
A: compareMethodFamilies = false
B: compareMethodFamilies = true
```

Run both with the same deterministic state/work limits and mechanics identity.

Before family-enrichment starts, assert core equivalence/monotonicity for:

```text
core selected executable U
core candidate executable U values already discovered
core retained-state fingerprint or deterministic state-set evidence
core states expanded
core stop reason
selected canonical policy fingerprint when the same graph is reached
```

Wall-clock milliseconds need not be identical.

The family-enabled path may add work after the core snapshot, but must not make the core snapshot worse.

If exact retained-state equality is impossible for a legitimate scheduler reason, document and prove a stronger monotonic invariant instead. Do not accept unexplained search variance.

---

# 10. Request-Local Known-Policy Registry

Generalize Phase 3C incumbent propagation into a request-local registry of **fully revalidated executable policies**.

Every policy discovered by a core candidate, constrained family solve, retained continuation, or admissibility revalidation may become a known executable candidate for any family that independently validates it.

Key by authoritative identities such as:

```text
target / terminal identity
mechanics session identity
economics / effort identity
physical acquisition identity
acquisition kind
canonical policy fingerprint
```

Do not key only by route name or scalar cost.

Monotonic invariant:

```text
Once a revalidated executable U is known for a compatible family during one request/session,
later search/enrichment stages may improve it but may never replace it with a worse U.
```

This registry does not have to persist across browser reloads in Phase 3D. Cross-session persistence is optional future work.

---

# 11. Preserve `BEST_FOUND_UNPROVEN`

Do not convert better incumbent propagation into a false optimality claim.

Continue separating:

```text
policy execution status
family search status
```

A family may have:

```text
Known executable U: 1440c
Family search status: BEST_FOUND_UNPROVEN
```

That is valid.

The current field run correctly demonstrates that unresolved competitors can remain cheaper by lower bound. Preserve provisional recommendation language and Retry Deeper behavior.

---

# 12. Issue C — Constellation Acquisition Scope Is Still Easy to Misread

Phase 3C materially improved the layout. Keep the new semantic large-SCC layout, recovery corridors, larger viewport, exact topology, and removal of default chronological numbering.

The post-Phase-3C screenshot is much more readable, but a player still sees state summaries such as:

```text
Transmute — Normal · 0/1 targets
Alter     — Magic · 0/1 targets
Scour     — Rare · 1/1 targets · fractured

then after the acquisition handoff:

Augment   — Magic · 1/3 targets · fractured
Alter     — Magic · 1/3 targets · fractured
Regal     — Magic · 2/3 targets · fractured
```

The `0/1` and `1/1` values are mechanically correct **for the acquisition synthesis sub-target**, but visually they look like the final three-notable target suddenly changed denominator.

The graph needs explicit scope semantics.

---

# 13. Scope-Aware Constellation Labels

Default player-facing state summaries should distinguish acquisition preparation from final-craft progress.

For example:

```text
ACQUISITION / FRACTURE PREP
Transmute
Prep target 0/1 · Normal

Scour
Desired fracture obtained · clean to Magic

FINAL CRAFTING
Augment
Final targets 1/3 · Magic · Primordial Bond fractured

Regal
Final targets 2/3 · Magic
```

Exact copy may differ.

Requirements:

- never imply the final target count is one when the final craft has three targets;
- preserve the actual acquisition synthesis target internally;
- keep advanced/technical labels available;
- no target-specific hardcoded text;
- derive stage labels from `node.scope`, acquisition context, target counts, and certified scope handoff evidence.

---

# 14. Visually Mark the Acquisition → Downstream Handoff

The certified scope handoff is an important semantic event and should be visible.

Use a restrained presentation such as:

```text
SELF-FRACTURE PREPARATION   │   FINAL CRAFTING
                             │
       Scour ────────────────┼──→ Augment
                             │
```

or equivalent lane/header treatment.

The handoff edge must remain the real `CERTIFIED_SCOPE_HANDOFF` edge from PolicyFlow. Do not invent a presentation-only fake craft action.

Acquisition and downstream may remain in the same continuous graph; this is a visual semantic boundary, not two disconnected diagrams.

---

# 15. Default Camera / Fit-All Acceptance

The new viewport height is good and should remain approximately the current responsive desktop behavior (`clamp(700px, 72vh, 950px)` unless evidence supports a better equivalent).

The field PDF still shows a large amount of unused upper space while some right-side node cards are only partially visible in the captured frame.

Audit `Fit All` and initial camera bounds so they account for:

```text
node circles
player-facing label/card extents
branch labels
semantic lane headers
Goal
recovery corridors
```

Acceptance on desktop:

- initial/`Fit All` framing does not clip any default node card or Goal;
- occupied graph is vertically centered within a reasonable margin;
- labels do not overlap at the frozen 23-node field flow;
- the larger 40+ node Phase 3C stress flow remains readable;
- no document-level horizontal overflow;
- graph-local pan/zoom remains available.

Do not shrink nodes/labels until they are technically visible but unreadable. Prefer using the available viewport.

---

# 16. Phase 3D Direct Diagnostic

Add `npm run diagnostic:phase3d` with at least these gates:

```text
D1  frozen post-3C field request reproduces with exact request identity
D2  full-route stage-aware action evidence is internally reconciled
D3  self-fracture Primordial family no longer says REQUIRED_ACTION_NOT_OBSERVED for acquisition Fracturing Orb
D4  Conventional still rejects selected self-fracture by acquisition kind/identity/cost
D5  Harvest-required family still requires Harvest in downstream scope
D6  self-fracture + Harvest requires both stage-specific mechanics
D7  compareMethodFamilies false/true core-search A/B invariant
D8  request-local incumbent registry is monotone; worse later family U cannot replace better revalidated U
D9  request budget ledger reconciles total stage time/work and explains HOST_RESERVE
D10 no family optimum claim is upgraded merely because a known incumbent was imported
D11 Constellation acquisition nodes use acquisition/prep progress semantics, not ambiguous final-target denominator
D12 certified acquisition→downstream handoff is rendered and preserves exact PolicyFlow edge identity
D13 Fit All is label-aware on 23-node field flow and 40+ node Phase 3C stress flow
D14 exact PolicyFlow topology/probabilities/occupancy are unchanged by presentation changes
```

The exact gate count may increase if implementation discovers additional generic invariants.

---

# 17. Browser Acceptance

Use real Playwright Chromium, the built app, and real module Worker.

At minimum add targeted browser evidence for:

### Policy-family consistency

For the frozen three-notable request:

- selected route may be whichever executable route the core search legitimately finds;
- if Self-fracture Primordial Bond is selected and the corresponding family is canonically equivalent, the card must not simultaneously claim the full route is inadmissible because `fracturing_orb` was not observed;
- stage-specific required-action evidence must be visible or inspectable;
- policy execution status and family optimum status remain separate.

### Budget isolation

Capture a compare-methods false/true A/B Worker run and prove the core snapshot is not degraded by the enrichment path.

### Constellation scope

At 1440×900 and 1920×1080:

- acquisition prep and final crafting are visually distinguishable;
- target progress denominator is not misleading;
- the certified handoff is understandable;
- Fit All includes default labels and Goal;
- recovery edges remain outside/behind the main progress body where appropriate.

At 390×844:

- no body/document horizontal overflow;
- graph remains locally pan/zoomable;
- scope headers do not force page overflow.

---

# 18. Validation Order

Follow this order and do not repeatedly run the broad browser matrix:

1. `npm run build`
2. `npm run lint`
3. `git diff --check`
4. `npm run lab:typecheck`
5. `npm run diagnostic:phase3d`
6. focused policy-evidence/admissibility browser gate
7. focused budget-isolation Worker/browser gate
8. focused Constellation scope/camera browser gate
9. fast relevant Phase 3B / Phase 3C retention checks
10. DEV once
11. RELEASE once
12. mature non-unit diagnostics and relevant phase diagnostics

If a later non-browser diagnostic causes **no source changes**, do not rerun RELEASE.

If source changes after RELEASE, rerun only the changed diagnostic + affected targeted browser group + DEV smoke first. Run RELEASE again only when the affected surface justifies it.

Do not run EXTENDED, nightly, long soak, or the legacy 115-gate suite unless a new Phase 3D finding independently justifies one of them.

---

# 19. Preservation Requirements

Phase 3D must preserve:

- Phase 3B fractured-Magic 25% self-loop / 75% open-side behavior under the documented approximate Magic roll-shape contract;
- Phase 3C exact state-by-state admissibility revalidation and monotone family U behavior;
- Phase 3C semantic large-SCC layout foundation;
- Phase 2Z exact PolicyFlow topology, conditional probabilities, occupancy, recovery destinations, and certified scope handoff;
- Phase 2Y canonical complete-policy equivalence;
- full canonical state identity;
- executable self-fracture synthesis and wrong-fracture reacquisition;
- no pre-fractured market ranking;
- no hardcoded craft winner;
- no target-specific/Craft-specific production branches;
- no mechanics probability changes;
- no unit tests.

Do not change PoE mechanics in this phase unless a newly discovered mechanics defect blocks the work. If that occurs, stop and document the evidence before changing mechanics.

---

# 20. Completion Report

Create:

`docs/crafting-engine/PHASE3D_FULL_ROUTE_POLICY_EVIDENCE_BUDGET_ISOLATION_CONSTELLATION_SCOPE_COMPLETION_REPORT.md`

It must include:

- exact baseline SHA;
- frozen field request and evidence values;
- explanation of the downstream-only required-action bug;
- final stage-aware action-evidence contract;
- proof that `Same selected policy` no longer conflicts with full-route admissibility;
- negative family controls;
- request timing/work ledger before/after;
- root cause of the 3,334-state HOST_RESERVE stop;
- compare-methods A/B evidence;
- request-local incumbent monotonicity evidence;
- clean-policy/current-route observations without falsely claiming cross-session persistence;
- Constellation before/after screenshots;
- acquisition-vs-final target-progress presentation;
- Fit All geometry metrics;
- PolicyFlow fingerprint/reconciliation preservation;
- targeted browser run IDs/timings;
- DEV and RELEASE counts/timings;
- mature diagnostics;
- explicit statement that EXTENDED/legacy/unit tests were not run;
- commit/push/deployment evidence.

---

# 21. Autonomous Execution Rules

Implement the entire phase autonomously after pulling latest `main`.

Preserve any newer user-owned commits if `main` moved after this plan.

Fix ordinary implementation/build/lint/diagnostic/browser failures generically and continue.

Stop only for:

- an unknown PoE mechanic that would require inventing behavior;
- an unavailable external credential/service that is truly required;
- a destructive conflict with newer user-owned work;
- a request that would violate the permanent project constraints.

Otherwise complete implementation, validation, report, review, commit, push, and deploy.

---

# 22. Phase 3D Exit Criteria

Phase 3D is complete only when all are true:

```text
[ ] full-route action evidence is stage-aware
[ ] self-fracture required Fracturing Orb can be satisfied by authoritative acquisition evidence
[ ] Harvest-required actions remain downstream-scoped
[ ] SAME_AS_SELECTED cannot contradict required-action admissibility for the same full route
[ ] Conventional/self-fracture/Harvest negative controls remain correctly inadmissible
[ ] core recommendation budget is explicitly isolated/accounted from family revalidation work
[ ] compareMethodFamilies true does not degrade the frozen core search snapshot
[ ] request-local revalidated incumbents are monotone
[ ] HOST_RESERVE has a concrete stage-by-stage explanation
[ ] policy execution certification remains distinct from family optimum proof
[ ] Constellation clearly labels acquisition prep vs final craft progress
[ ] acquisition target denominator cannot be mistaken for final target denominator
[ ] certified scope handoff remains exact and visible
[ ] Fit All is label-aware and avoids default clipping
[ ] exact PolicyFlow topology/probabilities/occupancy are preserved
[ ] targeted browser gates pass
[ ] DEV passes once
[ ] RELEASE passes once
[ ] mature/relevant retained diagnostics pass
[ ] no unit tests added/run
[ ] EXTENDED/legacy long suites not run without independent justification
[ ] completion report written
[ ] self-review complete
[ ] committed and pushed to main
[ ] Pages deployment succeeds
```
