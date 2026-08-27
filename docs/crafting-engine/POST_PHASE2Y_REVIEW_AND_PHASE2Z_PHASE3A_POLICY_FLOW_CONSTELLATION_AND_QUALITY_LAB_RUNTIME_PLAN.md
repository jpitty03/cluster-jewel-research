# Post-Phase 2Y Review and Overnight Phase 2Z + Phase 3A Plan

## Phase 2Z — Selected-Policy Branching Markov Constellation
## Phase 3A — Quality Lab Sharding, Checkpointing, Targeted Reruns, and Runtime Control

Baseline reviewed: `63002dcd415f9126078e97bf54e2e6a938fe3593` on `main`.

Phase 2Y / 2Y.1 is **CLOSED / PASS / DEPLOYED**. The final Phase 2Y release matrix completed at 115/115, the Worker evidence compactor now preserves real route proof fields, proof efficiency and budget telemetry are in place, and the user-facing route naming/equivalence work is retained. Do not reopen Phase 2Y unless a new defect specifically invalidates one of those contracts.

This document intentionally combines the next two phases so one implementation agent can work through both overnight with minimal supervision.

The order is mandatory:

```text
Phase 2Z
Real selected-policy branching Constellation
        ↓
Targeted Phase 2Z validation only
        ↓
checkpoint commit
        ↓
Phase 3A
Quality Lab runtime architecture
        ↓
new optimized release gate once
        ↓
final diagnostics / reports / deploy
```

The legacy long-running all-in-one browser matrix must **not** be repeatedly run during development. Its coverage is valuable; its current execution strategy is not.

No unit tests are to be added or run unless the user explicitly reverses the existing project constraint.

---

# 1. Executive Review

The application has reached a point where the optimizer is substantially more expressive than the current Markov Constellation.

The current Constellation is still largely a phase skeleton:

```text
Acquire → Transmute → Alter → Augment → Regal → Finish → Recover → Goal
```

Different crafts therefore tend to look similar even when their selected Bellman policies behave very differently.

Current production `VisualizationGraph.ts` also still synthesizes presentation probabilities rather than deriving them from the selected policy:

```text
forward edge probability = 1 / routeStepNumber
recovery loop probability = 0.5
recovery loop target = startNodeId
```

Those values are presentation placeholders, not actual policy probability mass. They must not survive Phase 2Z.

The user's three-notable field observation exposed the desired semantics clearly:

- Regal should visibly branch according to the actual selected policy outcome classes;
- a good Regal outcome may continue to Exalt/Finish or Goal;
- a bad Regal outcome may Scour/recover;
- a Scour on a one-fractured item leaves a **Magic** item, so its recovery flow should return to whichever Magic-state action the actual policy selects, not automatically to Transmute or the generic start node;
- `restart_reacquire` is a different recovery action and may genuinely return to the selected acquisition destination;
- Harvest crafts should have visually different loop structure from Alteration/Regal crafts;
- the Constellation should answer “what does the policy do after each kind of outcome?” rather than merely “which currencies appear somewhere?”

Phase 2Z makes that true.

Phase 3A then fixes the development bottleneck revealed by Phase 2Y: a useful 115-gate browser suite has become too serialized and too expensive to rerun after small repairs. The goal is to preserve or improve coverage while reducing ordinary iteration to targeted minutes rather than repeated 20+ minute acceptance runs.

---

# 2. Non-Negotiable Preservation Contracts

Both phases must preserve:

- all Phase 2T–2Y solver mechanics and probabilities;
- canonical state identity;
- Phase 2W atomic selected-policy bundle and reconciliation;
- Phase 2W multi-objective selection;
- Phase 2V certified repeatable Harvest mechanics;
- Phase 2X action taxonomy and fail-closed unknown-action behavior;
- Phase 2Y proof bounds, scheduler, proof telemetry, route naming, and policy equivalence;
- executable self-fracture rather than market-fractured ranking;
- Allflame mechanics deferred/disabled baseline;
- public player-facing modifier vocabulary with exact IDs confined to Technical/Advanced/export;
- no Craft-specific route branches;
- no hardcoded route winner;
- no unit tests.

The new Constellation is a **presentation projection of the exact selected policy**. It must never feed back into solver decisions.

---

# PART I — PHASE 2Z

# 3. Phase 2Z Product Goal

Replace the current phase-chain Constellation with a real macro-flow visualization derived from exact selected-policy occupancy and transition evidence.

A typical conventional craft should be capable of looking like:

```text
                         ┌── good Regal ──→ Exalt / Finish ──→ Goal
                         │
Alter / Augment ──→ Regal
                         │
                         └── bad Regal ───→ Scour
                                                 │
                                                 ↓
                                      fractured Magic state
                                                 │
                                      Alter / Augment again
```

A Harvest-only policy may look like:

```text
              ┌── success ──→ Goal
Harvest ──────┤
              └── miss ─────→ Harvest
```

A self-fracture policy may show a larger acquisition/restart loop feeding a smaller downstream policy.

A clean Alteration craft may be dominated visually by a reroll loop rather than an acquisition branch.

The graph must naturally differ between crafts because its topology comes from the selected policy.

---

# 4. Authoritative Policy-Flow Data Contract

Do not reconstruct exact branch probabilities in React from `CraftPlanSummary`.

The service already has access to the selected `GenericSearchResult`, exact selected action map, transition graph, occupancy, acquisition synthesis, target definition, and canonical selected bundle before the public result is serialized.

Create a serializable presentation-only result contract, conceptually:

```typescript
interface PolicyFlowSummary {
  version: 'SELECTED_POLICY_FLOW_V1';
  status: 'CERTIFIED' | 'UNCERTIFIED';
  sourceBundleId: string;
  sourcePolicyFingerprint?: string;
  nodes: PolicyFlowNode[];
  edges: PolicyFlowEdge[];
  terminalNodeIds: string[];
  recoveryEdges: string[];
  aggregation: PolicyFlowAggregationEvidence;
  reconciliation: PolicyFlowReconciliation;
}

interface PolicyFlowNode {
  id: string;
  macroKey: string;
  label: string;
  selectedActionId?: string;
  selectedActionName?: string;
  rarity?: 'normal' | 'magic' | 'rare';
  matchedTargetModIds: string[];
  fracturedTargetModIds: string[];
  prefixCount?: number;
  suffixCount?: number;
  exactStateCount: number;
  expectedVisits: number;
  occupancyShare: number;
  terminal: boolean;
  recoveryLike: boolean;
  representativeState?: string;
}

interface PolicyFlowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  actionId: string;
  actionName: string;
  expectedFlow: number;
  conditionalProbability: number;
  exactTransitionCount: number;
  outcomeKind:
    | 'PROGRESS'
    | 'SUCCESS'
    | 'RECOVERY'
    | 'REACQUIRE'
    | 'REPEAT'
    | 'OTHER';
  representativeOutcome?: string;
}
```

Names may differ, but the semantic contract must be equivalent.

The public Worker/result boundary must carry enough information for the browser to render real branching without importing private solver graphs directly.

---

# 5. Exact Flow Mathematics

For each exact selected-policy state `s` with occupancy/expected visits `v(s)`, selected action `a(s)`, and exact successor probability `P(s' | s, a)`:

```text
exact flow(s → s') = v(s) × P(s' | s, a)
```

When exact states are grouped into macro nodes `A` and `B`:

```text
macro flow(A → B)
  = Σ exact flow(s → s')
    for s ∈ A and s' ∈ B
```

The occupancy-weighted conditional probability shown on the branch is:

```text
P(B | A, selected policy)
  = macro flow(A → B)
    / Σ outgoing macro flow(A → *)
```

This value must be derived from actual policy occupancy and authoritative transition distributions.

Never use:

```text
1 / routeStepNumber
0.5 because it looks like a binary branch
uniform probability across visible edges
```

unless that value genuinely emerges from the selected policy evidence.

For every nonterminal macro node with positive outgoing flow:

```text
Σ conditional outgoing probabilities ≈ 1
```

within a declared numerical tolerance.

---

# 6. Presentation Aggregation Rules

This aggregation does **not** change solver state identity and therefore does not need to be a solver quotient. It still must be semantically honest.

A recommended macro key should preserve at least:

- selected action ID;
- rarity;
- matched exact target IDs;
- fractured exact target IDs;
- target-relevant prefix/suffix occupancy;
- terminal status;
- recovery/reacquire distinction;
- any state flag necessary to explain a materially different next-action branch.

Do not merge two exact states into one visible macro node if doing so causes the node to imply a single selected action when the exact policy chooses different actions.

It is acceptable for a macro node to have several outgoing branches caused by different outcomes of its selected action.

If the graph becomes too large, reduce detail by:

1. hiding extremely low-flow branches under an expandable “rare outcomes” group;
2. grouping branches that lead to the same next selected action and equivalent player-facing state class;
3. reducing label detail;

but never by inventing a simpler transition sequence.

Record:

```text
exact states → macro nodes
exact transitions → macro edges
flow retained visibly
flow collapsed into rare-outcome groups
```

---

# 7. Recovery Semantics

Recovery must be derived from the actual destination state/action.

## 7.1 Scour

The authoritative mechanic already preserves fractured affixes and sets rarity according to what remains.

Therefore:

- zero fractured affixes after Scour → Normal → policy may choose Transmute;
- one fractured affix after Scour → Magic → policy must continue from the actual Magic state, usually Alter/Augment/another legal policy action;
- two or more fractured affixes → appropriate retained rarity according to authoritative mechanics.

The graph must follow the actual selected next action after the Scour destination.

## 7.2 Restart/reacquire

`restart_reacquire` is not Scour. It returns to the selected acquisition destination and must be visualized separately.

Examples:

```text
bad downstream state → Scour → Magic fractured state → Alter
```

versus:

```text
wrong/abandoned attempt → Reacquire → selected fractured acquisition state
```

Do not label both simply “Recover” if the branch detail can distinguish them.

## 7.3 Recovery target correctness

The existing Constellation implementation currently routes recovery to `startNodeId` instead of following the actual destination/policy state. Phase 2Z must remove that behavior.

---

# 8. Branching at Regal and Other Random Actions

Regal is the primary field example, but implementation must be generic.

For a macro-state whose selected action is Regal, group actual Regal outcomes according to the next selected-policy destination.

Possible visible branches may include:

```text
Regal
├── Goal
├── Exalt / Finish
├── Annul / cleanup
├── Scour / recovery
└── another selected policy action
```

Only show branches actually present in exact policy evidence.

The same infrastructure must work for:

- Alteration;
- Augmentation;
- Exalt;
- Annul;
- Harvest;
- Fracturing Orb acquisition outcomes;
- Scour;
- restart/reacquire;
- any future modeled action.

No Regal-specific layout code or route logic may be added beyond generic visual styling.

---

# 9. Layout for Cyclic Policy Graphs

The graph is no longer a simple left-to-right list.

Use a deterministic cycle-aware layout.

Recommended approach:

1. build the directed macro flow graph;
2. compute strongly connected components (Tarjan/Kosaraju or equivalent);
3. condense SCCs into a DAG;
4. place the condensed DAG broadly left-to-right from acquisition toward terminal success;
5. arrange nodes inside cyclic SCCs in a loop/arc/compact ring;
6. route recovery edges backward with visibly different curvature;
7. keep Goal visually separated;
8. retain deterministic seed/layout for browser screenshots.

Do not add a large graph-layout dependency unless clearly justified. The macro graph should remain small enough for a local deterministic layout implementation.

The user must still be able to:

- pan;
- zoom;
- Route Focus;
- Fit All;
- Reset View;
- keyboard navigate;
- use reduced motion;
- enter Screensaver/Fullscreen.

---

# 10. Wisp and Glow Semantics

Wisps should become meaningful policy-flow particles.

Recommended mapping:

```text
wisp emission rate  ∝ expectedFlow
edge width          ∝ sqrt/log-scaled expectedFlow
edge opacity        ∝ conditionalProbability / flow importance
node glow           ∝ expectedVisits / occupancyShare
```

Cap particle count for performance, but preserve relative weighting.

A rare success branch may be thin but bright/green; a high-frequency recovery loop may carry many repeated wisps.

Do not make the selected route look like one deterministic traveler if the policy is probabilistic.

Screensaver mode should be especially effective after this change: visible flow should split, loop, merge, and converge on Goal.

---

# 11. Branch Explanation UX

Selecting a node or edge should expose a compact explanation.

For a node:

```text
Rare · 2 targets present
Selected action: Regal Orb
Expected visits per completed craft: 17.75
Exact states represented: 42
```

For an edge:

```text
Regal → Scour
Conditional policy flow: 71.4%
Expected traversals per craft: 12.68
Outcome group: bad Regal results
Next selected action: Orb of Scouring
```

Numbers above are illustrative only.

Include:

- action;
- branch probability;
- expected flow/visits;
- source and destination player-facing summaries;
- representative outcome/state when useful;
- whether it is success, progress, recovery, repeat, or reacquire;
- Technical disclosure for exact IDs/state evidence.

For grouped branches, label the probability explicitly as an **occupancy-weighted policy-flow probability**, not a universal single-state probability.

---

# 12. Craft Plan vs Constellation

The chronological craft plan remains useful and should stay compact.

Do not attempt to force the chronological card list itself into a giant branching tree.

The two surfaces answer different questions:

```text
How to craft it:
  player-readable chronological instructions

Markov Constellation:
  actual selected-policy branch / loop behavior
```

The Constellation must be derived from the canonical selected bundle, not from the chronological list.

---

# 13. Phase 2Z Required Diagnostics

## Z1 — Phase 2Y preservation

Run the direct mature/Phase diagnostics needed to verify source compatibility, but do not run the full legacy browser release matrix during development.

Minimum targeted commands after meaningful source changes:

```text
npm run build
npm run lint
git diff --check
npm run diagnostic:phase2y
```

Run earlier direct diagnostics only when affected source crosses their contract.

## Z2 — Flow conservation

For every selected nonterminal macro node:

- outgoing expected flow reconciles to source occupancy × expected action execution;
- outgoing conditional probabilities sum to 1 within tolerance;
- total terminal absorption represented in the macro graph matches selected policy absorption within tolerance.

## Z3 — Exact-state differential

Sample exact selected-policy states and independently aggregate their transition flow.

Assert macro node/edge totals match service serialization.

## Z4 — No synthetic probabilities

Assert no production selected-policy edge uses placeholder values produced from:

```text
route step number
static 0.5 recovery probability
uniform branch count
```

## Z5 — Recovery destination control

Use two controlled policies:

1. non-fractured Scour → Normal → next selected action includes Transmute when policy says so;
2. one-fractured Scour → Magic → next selected action does **not** incorrectly Transmute and follows the exact policy.

## Z6 — Restart/reacquire distinction

Verify restart/reacquire and Scour render as separate branch semantics with correct destinations.

## Z7 — Regal branching control

Use a deterministic frozen fixture where exact selected-policy Regal outcomes lead to at least two next-action classes.

Assert:

- the graph has multiple actual outgoing macro branches;
- every branch maps to real exact policy outcomes;
- branch probabilities reconcile;
- no hardcoded expected destination names are embedded in production selection logic.

## Z8 — Harvest loop control

Selected repeat-Harvest fixture should visibly loop Harvest misses back to Harvest and send success flow to Goal, based on certified/selected policy evidence.

## Z9 — Acquisition fracture flow

A self-fracture route must show acquisition preparation/fracture success/recovery semantics truthfully without exploding into every raw acquisition state.

## Z10 — Topology diversity

Render at least:

- clean one-mod;
- conventional two-mod;
- selected Harvest;
- self-fracture three-notable;
- four-mod provisional route.

Record a topology fingerprint such as node/edge count, SCC count, branch-node count, recovery-edge count, and selected-action histogram.

Acceptance: the fixtures should not all collapse to the same linear phase skeleton when their exact policies differ.

## Z11 — Constellation browser targeted suite

Create a dedicated fast command, for example:

```text
npm run lab:phase2z
```

It should run only the browser gates required for Phase 2Z:

- pan/zoom;
- selected branch clicking;
- branch detail correctness;
- deterministic screenshots;
- reduced motion;
- replay scroll ownership;
- real Worker/result flow differential;
- representative topology controls.

Target runtime: **under 5 minutes** on the reference machine.

If it exceeds 5 minutes, profile and reduce redundant solver/browser work before accepting it.

## Z12 — Performance

Measure:

- policy-flow serialization time;
- macro aggregation time;
- layout time;
- render FPS;
- particle count;
- memory during a short replay;
- solver semantics with visualization disabled/enabled.

The presentation graph must not materially delay the Worker result.

---

# 14. Phase 2Z Completion Gates

Phase 2Z closes when:

- all selected-policy probabilities/flows are evidence-derived;
- fake `1/routeStepNumber` and static recovery probability semantics are gone;
- recovery reaches actual selected-policy destinations;
- fractured Scour does not incorrectly return to Transmute;
- restart/reacquire remains distinct from Scour;
- Regal and other random actions visibly branch when the actual selected policy branches;
- Harvest loop topology is materially different from conventional craft topology;
- edge/node details reconcile to exact Worker/service evidence;
- topology diversity controls pass;
- Constellation interaction/accessibility remains healthy;
- targeted Phase 2Z browser suite is under the runtime target or a concrete blocker is documented;
- no solver mechanics changed;
- no unit tests run.

Create:

```text
docs/crafting-engine/PHASE2Z_SELECTED_POLICY_BRANCHING_CONSTELLATION_COMPLETION_REPORT.md
```

Do **not** run the old all-in-one `npm run lab:release` merely to close Phase 2Z. Phase 3A immediately follows and will replace its execution model before final browser acceptance.

Checkpoint commit Phase 2Z before beginning Phase 3A.

---

# PART II — PHASE 3A

# 15. Phase 3A Goal

Preserve the mature browser/solver validation coverage while reducing ordinary development and final acceptance wall-clock cost.

Current package scripts show that several historical phase commands still alias directly to the complete release scenario. The runner also carries shared in-process evidence between scenarios, making later gates depend on work performed much earlier in the same serialized browser session.

That architecture was useful for discovering bugs, but it now causes:

```text
small source repair
→ targeted check
→ 20+ minute full release
→ late failure
→ repair
→ another 20+ minute full release
```

Phase 3A replaces that loop.

---

# 16. Testing Policy Effective Immediately

During Phase 2Z and Phase 3A implementation:

## Never automatically run the legacy long release matrix after every change.

Instead use:

```text
build / lint / diff
+ directly affected diagnostics
+ directly affected Playwright gate/shard
+ fast cross-boundary smoke
```

The old long matrix may be run only when:

1. explicitly requested by the user; or
2. the implementation has made an unusually broad/high-impact solver/Worker contract change and the agent documents why targeted/new release coverage is insufficient; or
3. once as a temporary comparison benchmark while proving the new Phase 3A runner gives equivalent coverage and lower wall time.

It must not be run repeatedly in a repair loop.

Long visual/replay/memory soaks are **extended/manual tests**, not normal development or deployment gates.

---

# 17. Gate Registry

Refactor Quality Lab around explicit gate metadata rather than one giant imperative scenario.

Conceptually:

```typescript
interface QualityGateDefinition {
  id: string;
  phase: string;
  title: string;
  tags: string[];
  fixtureIds: string[];
  costClass: 'FAST' | 'MEDIUM' | 'SOLVER_HEAVY' | 'LONG_SOAK';
  isolation: 'SELF_CONTAINED' | 'SHARED_FIXTURE';
  dependencies: string[];
  sourceAreas: string[];
  defaultSuites: Array<'DEV' | 'RELEASE' | 'EXTENDED'>;
  run(ctx: GateContext): Promise<GateResult>;
}
```

Required tags should cover at least:

```text
worker
solver
objectives
harvest
fracture
handoff
constellation
responsive
accessibility
share-export
proof
visual
soak
```

The registry becomes the source of truth for CLI selection and reporting.

---

# 18. Self-Contained Scenario Contract

Remove unnecessary cross-scenario global dependencies such as “later gate consumes the exact browser result generated much earlier by another scenario.”

Each important gate should either:

- create the exact fixture/result it requires; or
- depend on a named, persisted fixture artifact with an explicit version/hash.

Do not rely on mutable module globals from an earlier unrelated gate.

When expensive solver setup is genuinely shared, expose it as a named prerequisite fixture with provenance rather than hidden execution order.

This enables targeted reruns and sharding.

---

# 19. Three Quality Tiers

## 19.1 DEV — target 1–3 minutes

Run continuously after changes.

Suggested coverage:

- build/lint/diff outside or before suite;
- real browser launch;
- one cheap clean Worker result;
- canonical Worker → DOM result identity;
- one self-fracture semantic control;
- one Harvest semantic control;
- affected component/gate tags;
- no console/page/network errors.

CLI example:

```text
npm run lab:dev
```

## 19.2 RELEASE — target 5–10 minutes

This becomes the normal final acceptance gate.

It should cover representative real Worker/browser paths across:

- clean;
- fracture;
- Harvest;
- objective selection;
- handoff;
- share/export;
- proof/accounting;
- Constellation branch flow;
- responsive/accessibility smoke;
- cancellation/replacement;
- no-fallback.

It should **not** include long screensaver/replay/memory soaks.

CLI:

```text
npm run lab:release
```

The command may keep its name, but it must use the new efficient registry/shard architecture.

## 19.3 EXTENDED — manual / explicit only

Contains:

- long screensaver soak;
- long memory soak;
- exhaustive visual viewport matrix;
- generated large fuzz matrix;
- expensive Research/full-proof field runs;
- legacy-equivalent broad coverage not needed on every release.

CLI:

```text
npm run lab:extended
```

Do not run automatically in Pages deployment or ordinary implementation loops.

---

# 20. Targeted Reruns

Add CLI selection by gate and tag:

```text
--gate Z7-regal-branching
--tag constellation
--tag worker
--tag harvest
--failed <report.json>
```

Examples:

```text
npm run lab:gate -- --gate Z7-regal-branching
npm run lab:tag -- --tag constellation
npm run lab:failed -- quality-lab/reports/latest.json
```

Exact script names may differ.

A gate failure should print an immediately copyable rerun command.

Example:

```text
[FAIL 74/121] Z7-regal-branching  11.8s
Rerun: npm run lab:gate -- --gate Z7-regal-branching
```

---

# 21. Checkpoint / Resume

Each gate result must carry an execution identity including:

- application source/build hash;
- gate ID/version;
- fixture corpus version;
- fixture input hash;
- price snapshot identity;
- browser/version;
- relevant harness version.

For the initial implementation, resume passing gates **only when the complete compatible build identity matches**.

Do not reuse a passing gate across changed production source merely because its name matches.

Later dependency-aware invalidation may safely broaden this, but Phase 3A must prefer correctness over clever cache reuse.

Add:

```text
--resume <run-id/report>
```

If gate 114/115 fails on an unchanged build, rerunning should execute only the failed gate(s) and required explicit dependencies.

---

# 22. Sharding and Parallelism

Support independent process-level shards.

Suggested initial groups:

```text
A — Worker / canonical result / proof
B — Objectives / method families / Harvest
C — Handoff / share / export / responsive
D — Constellation / interaction / visual
E — extended solver-heavy / generated fuzz (manual)
```

Do not blindly run several heavy Bellman searches concurrently on the same machine.

Introduce cost-aware concurrency:

```text
FAST / browser-light     parallel allowed
MEDIUM                   limited parallelism
SOLVER_HEAVY             concurrency 1 by default
LONG_SOAK                separate manual suite
```

Measure before increasing concurrency.

The goal is lower wall-clock time without turning CPU contention into flaky solver deadlines.

---

# 23. Live Progress and Runtime Reporting

The current runner mostly reports successful gates at the end. Change that.

Required console format, conceptually:

```text
[63/121] PASS  objective-fewest-600c          18.2s
[64/121] PASS  objective-fastest-600c         16.8s
[65/121] RUN   constellation-regal-branch      7.3s elapsed
```

For long-running gates, heartbeat:

```text
[82/121] RUN   extended-replay-soak  02:10 / 05:00
```

At completion print:

```text
Passed / failed / skipped
Total wall time
Total summed gate time
Browser startup time
Solver-heavy time
Visual/interaction time
Harness overhead
10 slowest gates
```

Persist per-gate durations to JSON so future optimization is evidence-driven.

---

# 24. Impact-Aware Test Recommendation

Add a helper that maps changed files to recommended tags/suites.

Examples:

```text
crafting-engine/src/rules/*
  → solver + mechanics + worker + method + selected browser controls

optimizerService.ts / genericSearch.ts
  → proof + objectives + methods + worker + canonical result

MarkovConstellation.tsx / VisualizationGraph.ts
  → constellation + responsive + accessibility

ClusterJewels.tsx / optimizerSeed.ts
  → handoff + share/export + responsive
```

This is an advisory planner, not permission to skip final RELEASE coverage.

CLI example:

```text
npm run lab:recommend -- --base HEAD~1 --head HEAD
```

Output exact commands the implementation agent should run next.

---

# 25. Frozen Visual Replay Fixtures

For pure renderer/interaction tests, allow stable serialized `PolicyFlowSummary` fixtures so a visual-only change does not rerun a 30–300 second solver merely to reproduce the same graph.

Rules:

- fixture must record source app commit, normalized request, selected bundle ID/fingerprint, and policy-flow version;
- it is valid only for renderer/interaction/visual tests;
- it cannot certify current solver mechanics or Worker correctness;
- RELEASE still includes at least one real Worker-generated Constellation flow differential;
- updating a visual fixture requires an explicit regeneration command and reviewed diff.

This should substantially reduce Constellation iteration time.

---

# 26. Long Soak Separation

Move these out of ordinary RELEASE:

- five-minute screensaver soak;
- long animation memory soak;
- exhaustive frame sequence capture;
- exhaustive viewport combinations;
- repeated Research-depth field searches;
- large generated target fuzz corpus.

They belong to EXTENDED/manual validation.

A targeted shorter check may remain in RELEASE:

```text
10–30 second replay
short memory delta check
one desktop + one mobile frame
```

Long soak may be required after a genuinely impactful animation/resource-lifecycle change, but it should run once after targeted tests pass—not after every repair.

---

# 27. Legacy Matrix Compatibility

Keep the old full 115+ coverage available temporarily as something like:

```text
npm run lab:legacy-release
```

Do not make it the default.

Use it once during Phase 3A to compare:

- gate coverage mapping;
- failures found;
- wall time;
- summed gate time;
- artifacts;

After equivalence is documented, normal development uses DEV/RELEASE/EXTENDED.

If the old suite requires 20+ minutes and the new RELEASE meets its coverage goals in materially less time, preserve the old suite only as a manual audit tool until confidence justifies retirement.

---

# 28. Phase 3A Required Diagnostics

## A1 — Gate registry completeness

Every current release gate maps to:

- new gate ID;
- tags;
- tier;
- dependency/isolation classification;
- retained, replaced, or moved-to-extended disposition.

No gate silently disappears.

## A2 — Self-contained rerun

Choose at least five historical gates that previously depended on earlier shared browser state.

Run each alone in a clean browser/process and prove it passes.

## A3 — Failed-gate resume

Inject or use a controlled failing assertion late in a disposable run.

Acceptance:

- report identifies the failed gate;
- `--failed` reruns only that gate and explicit prerequisites;
- earlier compatible passing gates are not replayed;
- no production assertion is weakened.

## A4 — Live progress

Real terminal output shows gate index, state, name, and duration/heartbeat.

## A5 — Duration ledger

Produce ranked slowest-gate report and suite category totals.

## A6 — Cost-aware sharding

Demonstrate parallel browser-light shards and serialized solver-heavy work without increased flake or timeout rate.

## A7 — DEV runtime

Target: ≤3 minutes.

If missed, document slowest gates and continue optimizing until the suite is useful for ordinary development.

## A8 — RELEASE runtime

Target: ≤10 minutes on the reference machine.

Prefer ≤7 minutes if achievable without dropping important coverage.

A modest target miss may be accepted only with an explicit evidence-backed blocker and a major improvement over the legacy baseline.

## A9 — EXTENDED separation

Prove RELEASE does not run long soak gates.

Prove EXTENDED can invoke them explicitly.

## A10 — Visual fixture differential

Renderer test using frozen flow fixture must match a real Worker-generated flow rendering for the same serialized summary.

## A11 — Legacy coverage map

Run the legacy suite **once** only after new architecture is stable, unless its runtime has already become unreasonable and an equivalent per-gate artifact comparison can be performed without re-executing it.

Compare every legacy gate to new disposition.

## A12 — Optimized final release

Run the new RELEASE suite once on final source.

If it fails:

```text
rerun failed gate/shard only
fix
rerun targeted gate
rerun affected shard
```

Do not automatically restart the entire release suite after each repair.

Once targeted repairs are green, run new RELEASE once more for final acceptance.

## A13 — Mature diagnostics

After final browser acceptance, run mature/direct phase diagnostics.

If they pass without changing source, **do not rerun RELEASE**.

If a diagnostic requires a source change, use impact-aware targeted browser validation and then decide whether one final RELEASE rerun is necessary.

## A14 — Hosted policy

Pages remains lean:

```text
npm ci
build
lint
diff hygiene
committed-evidence audit
deploy
```

Do not put solver-heavy or long visual suites back into automatic Pages deployment.

Manual extended workflow remains manual-only.

---

# 29. Phase 3A Completion Gates

Phase 3A closes when:

- all previous Quality Lab coverage has an explicit disposition;
- ordinary targeted reruns no longer require replaying the full suite;
- failed-gate rerun/checkpoint works;
- live gate progress is visible;
- per-gate durations are persisted and ranked;
- DEV and RELEASE tiers are materially faster;
- long soak is separated to EXTENDED/manual;
- solver-heavy concurrency is bounded;
- Constellation visual iteration can use frozen flow fixtures safely;
- at least one real Worker flow differential remains in RELEASE;
- new RELEASE passes on final source;
- mature Phase diagnostics pass afterward;
- no source change after final browser acceptance invalidates the result;
- Pages deploy remains lean;
- no unit tests run.

Create:

```text
docs/crafting-engine/PHASE3A_QUALITY_LAB_EXECUTION_EFFICIENCY_COMPLETION_REPORT.md
```

---

# 30. Overnight Agent Execution Contract

The implementing LLM should work autonomously through both phases.

## Before editing

1. Fetch/pull latest `main`.
2. Preserve any commits newer than this document.
3. Inspect working-tree changes before touching files.
4. Do not overwrite user-owned generated evidence files left modified by unrelated runs.
5. Read the Phase 2Y completion report and this document completely.

## Phase 2Z loop

Use:

```text
edit
→ build/lint/diff
→ direct policy-flow diagnostic
→ targeted Phase 2Z browser gate(s)
→ inspect screenshots/JSON
→ fix discovered issues
→ repeat targeted gate only
```

Do not run legacy `lab:release` in this loop.

After all Z gates are green, write the Phase 2Z completion report and make a checkpoint commit.

## Phase 3A loop

Refactor the harness using small self-contained steps:

```text
gate registry
→ targeted CLI
→ self-contained scenarios
→ progress/duration reporting
→ checkpoint/resume
→ sharding/concurrency
→ tier separation
→ visual fixtures
```

Validate each subsystem with focused harness tests, not the legacy full matrix.

## Final acceptance

1. Run new optimized RELEASE once.
2. Repair failures using only failing gates/affected shard.
3. Run new RELEASE once after targeted fixes are green.
4. Run mature/direct Phase diagnostics.
5. If no source changes occur, do not rerun browser RELEASE.
6. Run build/lint/diff/no-fallback as required.
7. Review stable screenshots and machine-readable reports.
8. Write both completion reports.
9. Self-review the final diff for correctness, stale naming, hidden fallbacks, test weakening, and user-owned artifact changes.
10. Commit/push final implementation and evidence to `main`.
11. Deploy through the lean Pages workflow.

The long legacy/extended matrix is withheld unless there is a documented reason under this plan. Ordinary failures are not a reason to ask the user for supervision: diagnose, fix generically, rerun the smallest relevant gate, and continue.

Stop and ask only for:

- genuinely unknown Path of Exile mechanics;
- credentials/external service blockers;
- irreconcilable concurrent changes to the same source;
- a required destructive repository operation.

---

# 31. Required Combined Final Handoff

At the end provide:

```text
Phase 2Z implementation commit
Phase 2Z completion report path
Phase 3A implementation commit
Phase 3A completion report path
new DEV runtime
new RELEASE runtime
legacy baseline runtime
long-soak disposition
final targeted/release gate counts
mature diagnostic status
deployment run
live URL
unit tests added/run: NO
mechanics probabilities changed: NO
state identity weakened: NO
hardcoded winner added: NO
market-fractured ranking restored: NO
```

Also list any bugs found autonomously during the overnight run and how each was validated after repair.

---

# Final Principle

> **The Constellation should visualize the actual probability flow of the selected Bellman policy, including its branches and recovery loops. The Quality Lab should then validate that behavior intelligently: run the smallest meaningful test while developing, preserve broad coverage for final acceptance, and reserve long soaks for the moments when they can actually change a decision.**
