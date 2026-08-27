# Phase 3D Full-Route Policy Evidence, Budget Isolation, and Constellation Scope Completion Report

Status: **IMPLEMENTATION COMPLETE / TARGETED + DEV + RELEASE PASS / DEPLOYMENT PENDING**

Date: 2026-08-27

Baseline: `debd00cbc16911eb8ac27b010605015b8af6e334` (`main`, pulled clean before implementation)

Source of truth: `POST_PHASE3C_FIELD_REVIEW_AND_PHASE3D_FULL_ROUTE_POLICY_EVIDENCE_BUDGET_ISOLATION_CONSTELLATION_SCOPE_PLAN.md`

## 1. Scope and frozen field request

Phase 3D completed all three implementation tracks:

1. stage-aware required-mechanic evidence across the complete executable route;
2. recommendation-core budget isolation, request ledger instrumentation, and monotone request-local executable incumbents;
3. explicit self-fracture-preparation versus final-craft scope in Constellation, including a certified handoff and label-aware Fit All.

The frozen field request remained:

| Field | Value |
|---|---|
| Base | Large Cluster Jewel |
| Cluster type | Minions deal 10% increased Damage |
| Item level / passives | 84 / 8 |
| Target | Primordial Bond + Renewal + Rotten Claws |
| Final state | Rare; extra affixes allowed |
| Objective | `CHEAPEST_CHAOS` |
| Budget | NORMAL: 5,000 states / 30,000ms / 3 rounds |
| Clean base / sale value | 40c / 1708c |
| Relevant rates | alteration 0.1336c; augmentation 0.03941c; transmutation 0.005012c; regal 0.03638c; scour 0.5391c; exalt 1.17c; annul 11.66c; fracturing 298.6c |

The direct Phase 3D request identity is
`00326428ade79a96bfc53456c211bb4a0111db88c9c0d1b7d11ed6a9df253027`.

The final targeted Worker result selected the executable Self-fracture Primordial Bond route at
`1459.7923662158182c`. That observation is request-local. It does not claim that self-fracture is a hardcoded winner, that the historical `1440.187675c` clean policy persists across sessions, or that a pre-fractured market base participates in ranking.

## 2. Full-route stage-aware policy evidence

### Root cause

Phase 3C correctly regenerated and re-evaluated downstream policy states, but its required-action check derived positive mechanic evidence only from `sourceResult.onPolicyRules`. For a self-fracture route those rules begin after acquisition. The acquisition synthesis authoritatively used approximately four Fracturing Orbs, yet the downstream-only set omitted `fracturing_orb`. That allowed these two incompatible statements to coexist:

```text
SAME_AS_SELECTED
inadmissible: REQUIRED_ACTION_NOT_OBSERVED(fracturing_orb)
```

The defect was evidence scope, not mechanics, legality, transition probability, or state identity.

### Final contract

`MethodFamilySpec` now declares required evidence as `(actionId, scope)` where scope is:

- `ACQUISITION` for mechanics that must occur in certified acquisition synthesis;
- `DOWNSTREAM` for mechanics that must occur after the reusable base exists;
- `FULL_ROUTE` only when either authoritative stage is valid by specification.

Canonical `FULL_ROUTE_ACTION_EVIDENCE_V1` entries preserve:

- action ID and player label;
- acquisition/downstream scope;
- positive expected count and expected chaos cost;
- authoritative evidence source;
- physical acquisition identity;
- mechanics/economics session identity;
- complete source-policy fingerprint.

Self-fracture requires `fracturing_orb @ ACQUISITION`. Harvest requires its reforge action at `DOWNSTREAM`. A combined self-fracture + Harvest family requires both independently. Legacy `requiredActionIds` remains only as a downstream-scoped compatibility fallback; all production family declarations touched by this phase use the explicit contract.

The admissibility validator also rejects evidence whose acquisition identity, session identity, policy fingerprint, counts, or costs do not match the policy being audited. Phase 3C's acquisition-kind/cost/identity, exact-state legality, regenerated-transition, fixed-policy cost/action/time, properness, and absorption checks remain intact.

### Field evidence and contradiction closure

The targeted browser result published 13 canonical evidence entries for the Primordial self-fracture policy. Its required check was:

| Required action | Required scope | Observed | Expected count | Source |
|---|---|---:|---:|---|
| `fracturing_orb` | `ACQUISITION` | yes | `3.9999999999958504` | `ACQUISITION_SYNTHESIS_POLICY` |

The selected policy's acquisition U was `1406.2963152858167c`, downstream U was
`53.4960509300016c`, and full-route U was `1459.7923662158182c`. The deterministic 40c initial base is part of acquisition U; the positive synthesis-action entries account for the remaining acquisition cost.

The browser card then reported:

| Evidence | Result |
|---|---|
| Family | `family_fracture_Primordial Bond` |
| Status | `SAME_AS_SELECTED` |
| Canonical equivalence | true |
| Fingerprint | `policy-b8fc0f29` |
| Selected-policy admissibility | true |
| `REQUIRED_ACTION_NOT_OBSERVED(fracturing_orb)` | absent |
| Incumbent source | `ADMISSIBLE_KNOWN_POLICY` |
| Family optimum claim | `BEST_FOUND_UNPROVEN`, not upgraded |

An optional family rerun may run out of search time. It can no longer discard an already certified selected self-fracture route: the candidate carries its exact acquisition synthesis into family revalidation and the request-local registry. Independent family search may replace it only with a genuinely better executable route.

### Negative controls

- Conventional versus selected self-fracture remained inadmissible with acquisition kind, physical identity, and acquisition cost mismatches.
- All three Harvest families still require positive downstream Harvest evidence.
- Mismatched Renewal/Rotten Claws self-fracture families reject the Primordial fractured acquisition identity.
- All nine combined self-fracture + Harvest families require both scopes. The representative control observed Fracturing Orb in acquisition and correctly left `harvest_reforge_life @ DOWNSTREAM` false.
- Equality never bypasses any other Phase 3C admissibility check.

## 3. Core-search budget isolation and incumbent monotonicity

### Exact historical root cause

Before Phase 3D, the core deadline decision was effectively:

```text
objectiveNeedsUnifiedFamilies = nonCheapestObjective || compareMethodFamilies
```

For a cheapest request with method comparison enabled, that expression selected a `0.48` core fraction. With the 29,000ms engine deadline, core work received only `13,920ms`. The field run therefore stopped at 3,334 expanded states with `HOST_RESERVE` while family revalidation/explainability was enabled.

Phase 3D removes the presentation/enrichment flag from the core decision. Cheapest core search now always receives `0.85 × 29,000ms = 24,650ms`, recovering `10,730ms` of planned core envelope. Non-cheapest objectives may still request the unified objective path because that is recommendation semantics, not optional explanation work.

`HOST_RESERVE` is now concrete: it means the request-local core envelope ended and control moved to bounded enrichment/aggregation with the outer 1,000ms serialization reserve still protected. It no longer ambiguously attributes all later work to core search.

### Request budget ledger

The monotonic request clock publishes exclusive stages plus nested core detail. The final compare-enabled Worker evidence measured:

| Stage | Accounting | Request interval | Used | States | Stop |
|---|---|---:|---:|---:|---|
| Core portfolio search | exclusive | 0–24,674.7ms | 24,674.7ms | 13,336 | `HOST_RESERVE` |
| Method-family search | exclusive, excluding separately timed audit work | 24,674.7–28,186.0ms | 3,205.9ms | 375 | — |
| Policy admissibility | exclusive component | 24,674.7–28,186.0ms | 305.4ms | 0 | — |
| Equivalence/presentation | exclusive | 28,186.0–28,219.4ms | 33.4ms | 0 | — |
| Host serialization reserve | exclusive | 28,219.5–28,228.5ms | 9.0ms | 0 | — |
| Acquisition synthesis | nested core detail | 4,040.5–13,033.1ms | 5,769ms measured work | 10,002 | — |
| Proof/bound work | nested core detail | 15,015.6–20,606.4ms | 5,590ms | 3,636 | — |

Exclusive accounting reconciled with `0.1ms` unclassified time. Nested rows are explanatory subsets and are never double-counted into exclusive request time.

### Compare-methods A/B

The direct diagnostic ran fresh services and proved exact identity:

| Direct A/B | compare=false | compare=true |
|---|---:|---:|
| Expanded / retained | 3,336 / 6,339 | 3,336 / 6,339 |
| Retained-state fingerprint | `states-4fb07ffe` | `states-4fb07ffe` |
| Core policy fingerprint | `core-c8da05a5` | `core-c8da05a5` |
| Core executable U | `1459.7923662160783c` | `1459.7923662160783c` |
| Stop | `HOST_RESERVE` | `HOST_RESERVE` |

Fresh browser module Workers produced the allowed stronger monotone case under host timing:

| Browser A/B | compare=false | compare=true |
|---|---:|---:|
| Expanded / retained | 11,669 / 20,277 | 13,336 / 21,944 |
| Core policy fingerprint | `core-c8da05a5` | `core-c8da05a5` |
| Core executable U | `1459.7923662160783c` | `1459.7923662160783c` |
| Final executable U | `1459.7923662158182c` | `1459.7923662158182c` |
| Stop | `HOST_RESERVE` | `HOST_RESERVE` |

The compare-enabled path did more core work and never degraded the core policy or final recommendation.

### Request-local registry

`REQUEST_POLICY_REGISTRY_PHASE3D_V1` keys every executable candidate by target, mechanics session, economics/effort, physical acquisition, acquisition kind, and canonical complete-policy fingerprint. It accepts only solver-certified or family-revalidated executable policies and retains the minimum family U monotonically.

Production diagnostic evidence registered the independently certified Primordial policy at
`1459.7923662160777c`; a later equal revalidated policy produced `RETAINED_BETTER_INCUMBENT`. A controlled better-then-worse sequence retained 100c when a 120c candidate arrived. Browser evidence registered seven policies and remained monotone.

The final recommendation comparator also retains the frozen core candidate for every objective kind unless a later eligible candidate is actually better under that objective's declared comparator. Policy execution certification and family optimum proof remain separate fields.

## 4. Constellation scope and label-aware Fit All

No `PolicyFlow` field, node, edge, probability, occupancy, or topology builder changed. Presentation derives scope from the existing certified component and state summaries.

The renderer now:

- labels self-fracture nodes as `Prep target x/y` and the completed reusable base as `Fracture prep complete`;
- labels downstream nodes as `Final targets x/y` and the terminal as `Final target complete`;
- colors preparation and final crafting as distinct semantic regions;
- identifies the exact real edge crossing `ACQUISITION → DOWNSTREAM` as `SCOPE_HANDOFF` and labels it with the actual craft action plus `certified acquisition → final crafting`;
- preserves the Phase 3C semantic large-SCC bands and recovery corridors;
- computes Fit All from structural bounds plus asymmetric pixel margins for node cards, scope headers, edge labels, handoff label, and Goal;
- keeps graph-local pan/zoom and correct pointer-centered zoom at small scales.

The retained real field flow has 23 nodes, 49 edges, and one certified handoff. The Phase 3C stress flow has 43 nodes, 191 edges, and a 42-node large SCC.

| Fit All evidence | 1440×900 field | 1920×1080 field | 390×844 field | 1440×900 stress |
|---|---:|---:|---:|---:|
| Visible node labels | 22 | 21 | 11 | 33 |
| Scope headers | 2 | 2 | 2 | 1 |
| Handoff labels | 1 | 1 | 1 | 0 |
| Outside viewport | 0 | 0 | 0 | 0 |
| Label collisions | 0 | 0 | 0 | 0 |
| Goal visible | yes | yes | yes | yes |
| Top / bottom gap | 209.9 / 214.6px | 248.9 / 253.2px | 123.1 / 124.1px | 63.7 / 69.3px |

Mobile document/body/viewport widths were all exactly 390px. The graph remained locally interactive without document-level horizontal overflow.

### PolicyFlow truth preservation

| Flow | Topology | Projection SHA-256 | Reconciliation |
|---|---|---|---|
| Retained real 23-node self-fracture | `topology-b6fb87a1` | `d8cab7d73d1a83a6b12f1a1d5e8a0045ee1d8a3057c04fb4328dac492c567752` | certified |
| Phase 3C 43-node stress | `topology-3c852336` | `d1f3426039186010b1c687a77414b2cbcdac0e968181e1307aa966d69ac8e18d` | certified |

For the 23-node flow, maximum outgoing-flow difference remained
`6.298250809777528e-11`, maximum conditional-probability difference remained
`1.1102230246251565e-16`, and terminal-absorption difference remained
`2.0510804166207208e-10`.

### Screenshots

- Before reference: [Phase 3C 1440×900 at baseline `debd00c`](https://github.com/jpitty03/cluster-jewel-research/blob/debd00cbc16911eb8ac27b010605015b8af6e334/quality-lab/reports/evidence/phase3c-constellation-1440x900.png)
- After 1440×900: `quality-lab/reports/evidence/phase3d-constellation-scope-1440x900.png`
- After 1920×1080: `quality-lab/reports/evidence/phase3d-constellation-scope-1920x1080.png`
- After 390×844: `quality-lab/reports/evidence/phase3d-constellation-scope-390x844.png`
- Policy-family evidence UI: `quality-lab/reports/evidence/phase3d-full-route-policy-evidence-desktop.png`

The after images were visually reviewed in addition to the geometry assertions. Purple preparation, blue final crafting, and the teal certified handoff are readable; recovery paths remain outside/behind the main progress body; Goal and default cards are not clipped.

## 5. Validation and runtime

| Gate | Result |
|---|---|
| `npm run build` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS; only LF/CRLF notices |
| `npm run lab:typecheck` | PASS |
| `npm run diagnostic:phase3d` | PASS D1–D14; evidence object SHA-256 `baf7b2a6c05e4630cdf799913e86c5a4906651c7217fd9c2eb097a74a8f5c42d` |
| Policy-evidence targeted gate | PASS 1/1; run `2026-08-27T21-44-49-855Z`; 59.007s wall |
| Budget-isolation targeted gate | PASS 1/1; run `2026-08-27T21-45-54-525Z`; 58.370s wall |
| Constellation scope/Fit All gate | PASS 1/1; run `2026-08-27T21-46-57-164Z`; 9.061s wall |
| Phase 3B/3C focused retention | PASS 2/2; run `2026-08-27T21-47-11-400Z`; 36.727s wall |
| DEV, exactly once | PASS 10/10; run `2026-08-27T21-47-54-750Z`; 214.217s wall |
| RELEASE, exactly once | PASS 16/16; run `2026-08-27T21-51-34-657Z`; 233.469s wall |
| `diagnostic:phase3b` | PASS; 250,000 seeded trials/case; 0.25 self-loop / 0.75 open side and price reversal preserved |
| `diagnostic:phase3c` | PASS C1–C10 after its negative-control assertion was made stage-aware |

Chromium was `151.0.7922.34`. The final targeted, DEV, and RELEASE reports contain zero console, page, or network errors.

### Mature retained audit

Fourteen of the sixteen unchanged mature diagnostic programs passed fresh, covering core mechanics, fracture fidelity, Herald, Harvest plan/parity, weight-sensitive policy, fracture portfolio, proof closure, and developer UI 2M–2S. Phase 2N also passes after a diagnostic-only update replaced its obsolete “Open must win” assumption with the canonical invariant that exactly one selected family must match the primary executable recommendation.

Two old diagnostics failed locally, and both failures reproduced with the same evidence in a detached untouched worktree at baseline `debd00c`:

- Phase 2J cold/resumed DEEPEN: cold `62.51806953950456c`, resumed `214.52097591436896c` at 10,000 states;
- Phase 2K.1 K6: the optional portfolio Clean candidate did not expose a current-depth clean U.

Neither assertion was weakened, bypassed, or counted as a Phase 3D pass. The prior committed mature artifact remains 16/16 from its successful retained run; the fresh audit and baseline reproductions are recorded in `output-phase3d-mature-retention-audit.txt`. These are baseline-variable search/diagnostic exceptions, not changes to mechanics, state identity, Phase 3D policy evidence, core A/B monotonicity, or PolicyFlow.

No unit tests were added or run. EXTENDED, nightly, long-soak, the legacy 115-gate suite, and the legacy release runner were not run.

## 6. Preservation and self-review

- Phase 3B Magic roll shape/probabilities: unchanged and revalidated.
- Phase 3C exact state-by-state policy admissibility: retained; acquisition evidence is added, not substituted for downstream re-evaluation.
- Phase 3C large-SCC semantic layout and recovery corridors: retained.
- Phase 2Z exact PolicyFlow topology, probabilities, occupancy, Scour/reacquire destinations, and handoff edge: retained.
- Phase 2Y canonical complete-policy equivalence: retained.
- Canonical solver state identity: unchanged.
- Executable self-fracture and wrong-fracture reacquisition: retained.
- Market-fractured purchase ranking: absent.
- Mechanics probability changes: none.
- Hardcoded winner/target order: absent.
- Target/Craft-specific production branches: absent; production-source scan found none of the frozen target names.
- Test files added/changed and unit tests run: none.

Self-review additionally found and repaired one integration edge before broad validation: an optional family rerun could lose the certified selected self-fracture incumbent when the rerun exhausted its budget. The generic fix carries exact acquisition synthesis into revalidation/registry identity and preserves the better executable U without claiming family optimality.

## 7. Evidence index

- `quality-lab/reports/evidence/phase3d-full-route-budget-scope-diagnostic.json`
- `quality-lab/reports/evidence/phase3d-full-route-policy-evidence-browser.json`
- `quality-lab/reports/evidence/phase3d-core-budget-worker-ab.json`
- `quality-lab/fixtures/policy-flow-phase3d-field-v1.json`
- `quality-lab/reports/phase3d-targeted-policy-evidence.json`
- `quality-lab/reports/phase3d-targeted-budget-isolation.json`
- `quality-lab/reports/phase3d-targeted-constellation-scope.json`
- `quality-lab/reports/phase3d-targeted-retention.json`
- `quality-lab/reports/phase3d-dev-gate.json`
- `quality-lab/reports/phase3d-release-gate.json`
- `output-phase3d-full-route-budget-scope-diagnostic.txt`
- `output-phase3d-mature-retention-audit.txt`

## 8. Commit, push, and deployment

- Implementation/evidence/report commit: pending final commit.
- Push to `origin/main`: pending.
- GitHub Pages workflow: pending.
- Deployed SHA and live verification: pending.

This section will be closed with immutable commit and Pages evidence after the implementation commit deploys. A later documentation-only closeout does not change product, mechanics, search, layout, or validation evidence.
