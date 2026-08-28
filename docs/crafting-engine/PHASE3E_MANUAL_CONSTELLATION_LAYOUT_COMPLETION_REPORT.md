# Phase 3E Manual Constellation Layout Completion Report

Status: **COMPLETE / TARGETED + DEV + RELEASE-REPAIR ACCEPTANCE PASS / DEPLOYED**

Date: 2026-08-27

Baseline: `70161ea2f427724bae9f0a8decb34ba7ed2d7794` (`main`, pulled clean before implementation)

Source of truth: `POST_PHASE3D_FIELD_REVIEW_AND_PHASE3E_MANUAL_CONSTELLATION_LAYOUT_PLAN.md`

Reviewed plan SHA-256: `4911b07252b44523e7622f55e27dc076db090d09121c9c4ea1145e61fe251bc3`

## 1. Result

Phase 3E adds user-owned manual node placement to the production Markov Constellation as a presentation projection only. The canonical `VisualizationGraph`, selected `PolicyFlow`, solver result, probabilities, occupancy, costs, proofs, fingerprints, and policy identities remain untouched.

The completed feature provides:

- explicit `Arrange` and `Lock Layout` controls, locked by default;
- graph-space pointer, pen, and touch dragging for individual nodes;
- keyboard nudging at 12 graph units, or 48 with Shift;
- unchanged background-drag camera panning in either layout mode;
- live node, label, edge hit-target, edge curve, canvas, and wisp movement;
- strict browser-local persistence scoped to one complete policy/topology/node identity;
- distinct camera-only `Reset View` and coordinate-removing `Reset Layout` behavior;
- effective-coordinate `Route Focus` and label-aware `Fit All`;
- saved-coordinate compatibility with Replay, Screensaver, and fullscreen.

No crafting-engine production file changed in Phase 3E. The effective graph is derived in `src/components/constellationLayout.ts` and consumed only by `MarkovConstellation` rendering and interaction code.

## 2. Frozen field and truth boundary

The frozen field witness is the plan's Normal three-notable Chaos cluster request:

| Field | Value |
|---|---|
| Base | Large Cluster Jewel |
| Cluster type | 12% increased Chaos Damage |
| Item level / passives | 84 / 8 |
| Target | Touch of Cruelty + Unspeakable Gifts + Unwaveringly Evil |
| Final state | Rare; extra affixes allowed |
| Objective | `CHEAPEST_CHAOS` |
| Budget | NORMAL: 5,000 states / 30,000ms / 3 rounds |
| Clean base | 38c frozen reviewed quote |
| Selected route | Self-fracture Unspeakable Gifts |
| Selected U | `1660.1253603083733c` |

The explicitly refreshed frozen fixture records:

| Identity | Before manual projection | After manual projection |
|---|---|---|
| PolicyFlow status | `CERTIFIED` | `CERTIFIED` |
| Source policy | `policy-1031a5cd` | `policy-1031a5cd` |
| Topology | `topology-c6ae1cff` | `topology-c6ae1cff` |
| Exact flow | `flow-95543b18` | `flow-95543b18` |
| Nodes / edges | 23 / 49 | 23 / 49 |
| Flow truth SHA-256 | `2cb6b4ae60c766054a7ed044ed1caf359d990ae48a6d197ae975005b84ea8758` | unchanged |
| Graph truth SHA-256 | `e24865db87fcada2c3cb5f0fb43059a80bccca0870f073aff4c7c00712b0ef9b` | unchanged |

The frozen artifact SHA-256 is `bbdf04ed629da27927d620108b557132f5c000e2e93de0dbdca45711d262325d`; its normalized PolicyFlow SHA-256 is `14417ea81333802ec2827ea755cfabc684883c4ff94a5cf4a4ebcd1a8ed58936`.

The helper returns the canonical graph object itself when no valid override exists. With overrides, it clones only presentation nodes, connected edge geometry, scope-label placement, and effective bounds. Node/edge identity and every truth-bearing field remain those of the canonical graph.

## 3. Persistence contract

The schema is exactly:

```text
MANUAL_CONSTELLATION_LAYOUT_V1
```

The complete identity stored and compared on every load contains:

```text
schemaVersion
layoutVersion
sourcePolicyFingerprint
topologyFingerprint
sorted complete node-ID list
```

The reviewed field identity is:

```text
layoutVersion = SELECTED_POLICY_SEMANTIC_SCC_LAYOUT_V2
sourcePolicyFingerprint = policy-1031a5cd
topologyFingerprint = topology-c6ae1cff
nodeIds = all 23 canonical IDs, sorted
```

The local-storage key uses prefix `cluster-jewel-research:manual-constellation-layout:` plus a compact two-lane identity hash. The full unabridged identity remains inside the record and must compare exactly, so a key collision cannot apply another policy's positions.

Persistence fails closed:

- no source-policy fingerprint means no persistence;
- policy, topology, layout-version, or node-set mismatch returns automatic layout;
- malformed JSON/schema and missing position maps return automatic layout;
- NaN, Infinity, malformed positions, and unknown node IDs are discarded;
- storage read/write/security errors leave the graph usable;
- saved positions never enter optimizer input, cache identity, share links, exports, PolicyFlow, or policy equivalence.

## 4. Interaction and camera behavior

| Interaction | Locked | Arrange |
|---|---|---|
| Drag node | normal camera pan/click behavior | move that node in graph space |
| Drag background | pan camera | pan camera |
| Click node/edge | select canonical node/edge | select when below drag threshold |
| Arrow on focused/selected node | pan camera | nudge node 12 units |
| Shift + Arrow | larger camera pan | nudge node 48 units |
| Escape during pointer/keyboard edit | close/cancel as applicable | restore the pre-gesture override |

Pointer capture and a six-pixel threshold distinguish click from drag. Drag deltas are divided by the frozen start scale, so the saved coordinate is graph-space geometry rather than a viewport pixel offset. Pointer cancellation, lost capture, Escape, graph identity changes, and Screensaver entry clean up the active gesture.

`Reset View` resets pan/zoom to the current base fit and preserves both in-memory and persisted node positions. `Reset Layout` removes the exact current-policy storage record, clears all overrides, restores automatic semantic geometry, and fits the canonical graph. It never deletes another policy's record.

`Route Focus` and `Fit All` calculate bounds from effective node coordinates. During a node drag, the current camera bounds are frozen to avoid feedback jitter; the next explicit focus/fit includes the new geometry. E10 moved a node to `(4167, -669.182...)`; effective bounds expanded to `x=255.76..4207`, `y=-766.517..1300`.

## 5. Live edge, scope, and animation projection

Only edges connected to a moved node are rerouted. Unconnected edges retain their exact automatic presentation geometry.

- Self-loops translate their canonical control point by the node displacement.
- Recovery corridors retain their routing class and canonical bend relative to the effective endpoint midpoint.
- Progress, back-edge, and certified handoff curves retain canonical curvature against effective endpoints.
- Edge anchors and visible edge labels read the same effective curve used by canvas rendering.
- Wisps retain canonical edge IDs, probability-derived count/speed/opacity, and sample the effective curve each frame.

The certified acquisition-to-downstream handoff remains `SCOPE_HANDOFF` with `CERTIFIED_SCOPE_HANDOFF` evidence and teal presentation. Recovery semantics and scope colors remain unchanged. Scope headers follow their effective scope centers; if manual positions make the two scopes overlap horizontally, only the potentially misleading divider is omitted while node scope, header, color, handoff edge, and evidence remain visible.

Callbacks resolve clicked effective nodes/edges back to canonical graph objects before leaving the component.

## 6. Direct and browser evidence

`diagnostic:phase3e` passed E1-E10:

- three deterministic node overrides moved while all untouched nodes stayed canonical;
- a connected back edge rerouted live;
- the Alter self-loop followed `policy_acquisition_277e773e`;
- the certified Scour handoff remained attached and retained both evidence/routing identities;
- persistence round-trip, mismatch rejection, malformed storage, reset semantics, and outlier Fit All passed.

Final direct evidence object SHA-256: `1a560e7f3ba39f70b15eda84422b83239da87b8daf6df8592eff9ce560d44087`.

The focused real-browser gate moved the Alter node `584.589` graph units through the real pointer path and observed:

- connected edge `flow_acquisition_13e74d8a` rerouted live and the node's visible label moved with it;
- DOM-surfaced policy, topology, endpoints, probabilities, expected flows, outcome/evidence classes, and canonical coordinates remained identical;
- strict local storage survived a document reload;
- Reset View preserved the coordinate and storage bytes;
- Reset Layout restored canonical coordinates and removed the storage key;
- background drag panned without moving a node;
- locked node-origin drag panned without changing graph coordinates;
- keyboard nudge, Route Focus, outlier Fit All, Replay, Screensaver, and fullscreen passed;
- trusted Chromium touch input moved the node at the 390px viewport;
- mobile viewport, document, and body widths were all exactly 390px.

The final focused Constellation run passed 3/3 in 26.287s (`2026-08-28T03-52-10-167Z`): Phase 3C large SCC, Phase 3D scope/Fit All, and Phase 3E manual layout. The Phase 3E gate itself took 12.834s.

### Screenshots

- `quality-lab/reports/evidence/phase3e-manual-constellation-1440x900.png` — SHA-256 `8d854b53b0c35eae92266ec0c34ace4a0ea13e99e974df19ecebf6b623ea394`
- `quality-lab/reports/evidence/phase3e-manual-constellation-390x844.png` — SHA-256 `c963254f407b83df008a8433e93f351daa398a97621a1d79381ac014e01f3146`

Both images were visually reviewed. The effective outlier fit remains inside the Constellation viewport; acquisition/final-craft color and certified-handoff semantics remain distinguishable; the mobile page has no horizontal overflow.

## 7. Retention and acceptance

| Check | Result |
|---|---|
| `npm run build` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS; only LF/CRLF notices |
| `npm run lab:typecheck` | PASS |
| `npm run diagnostic:phase3e` | PASS E1-E10 |
| `npm run diagnostic:phase3c` | PASS C1-C10; 43 nodes / 191 edges; `topology-3c852336`; zero layout overlaps |
| `npm run diagnostic:phase3d` | PASS D1-D14; 23-node/49-edge field handoff and 43-node/191-edge stress retained |
| Targeted Phase 3C/3D/3E browser run | PASS 3/3; 26.287s |
| DEV, exactly once | PASS 9/9; 154.890s, below 180s target |
| RELEASE, exactly once | 16/17 passed in 283.407s; Phase 3E passed; one new Phase 3D diagnostic supplement exposed a harness session-reuse defect |
| Isolated failed-gate repair | PASS 1/1; 75.808s gate / 76.822s wall; no second RELEASE run |
| Fail-closed committed-evidence audit | PASS 17/17 composite acceptance; 360.229s; A1-A14 + preservation |

The RELEASE failure was not a product failure. The deterministic disabled half navigated to the already-active `#optimizer` hash and inherited the prior Worker's retained request graph; the enabled half correctly used a fresh Worker. An explicit cold reload now precedes both deterministic halves. The targeted repair then observed exact equality at 13,336 states for the live field pair and exact equality at 2,000 states for the state-capped pair.

The committed-evidence audit accepts an isolated repair only when it exactly matches the base RELEASE failure set, contains one failed gate, occurs later, passes, and preserves application source build, fixture corpus, price snapshot, browser, harness, gate version, and fixture input identities. All other mismatches fail closed. This implements the Phase 3E instruction to rerun an isolated browser gate instead of repeating RELEASE.

No unit tests were added or run. EXTENDED, nightly, the legacy 115-gate suite, the legacy release runner, and long-soak suites were not run.

## 8. Preservation and self-review

- Mechanics rules and probabilities: unchanged.
- Bellman/search behavior and selected-policy decisions: unchanged.
- Canonical item/state identity: unchanged.
- PolicyFlow aggregation, topology, occupancy, Scour/reacquire destinations, and route costs: unchanged.
- Phase 3B fractured-Magic roll shape and executable self-fracture behavior: retained by DEV/RELEASE.
- Phase 3C admissibility and large-SCC layout: retained by direct and browser gates.
- Phase 3D scope, handoff, Fit All, evidence, budget, and monotone incumbent behavior: retained.
- Phase 2Z PolicyFlow truth and Phase 2Y equivalence: unchanged.
- Hardcoded craft winners or frozen target branches: none.
- Craft-specific production layout branches: none.
- Market-fractured ranking: absent.
- Manual coordinates in export/share/solver/cache identity: absent.
- Test files added/changed: none.

Self-review found and repaired four validation/integration issues before closeout:

1. fixture normalized hashing now hashes the JSON-round-tripped flow, matching loader semantics;
2. disconnected edges retain exact automatic geometry when another node moves;
3. the mobile touch witness closes the selected-node overlay before locating a trusted hit point;
4. the Phase 3D deterministic browser pair now explicitly reloads before its cold-worker comparison.

## 9. Evidence index

- `scripts/phase3eDiagnostics.ts`
- `output-phase3e-manual-constellation-layout-diagnostic.txt`
- `quality-lab/fixtures/policy-flow-phase3e-manual-v1.json`
- `quality-lab/fixtures/policy-flow-phase3e-manual-v1-artifact.json`
- `quality-lab/reports/evidence/phase3e-manual-constellation-layout-diagnostic.json`
- `quality-lab/reports/evidence/phase3e-manual-constellation-1440x900.png`
- `quality-lab/reports/evidence/phase3e-manual-constellation-390x844.png`
- `quality-lab/reports/phase3a-dev-gate.json`
- `quality-lab/reports/phase3a-release-gate.json`
- `quality-lab/reports/phase3a-targeted-gate.json`
- `quality-lab/reports/evidence/phase3a-quality-lab-diagnostic.json`
- `output-phase3a-quality-lab-execution-efficiency-diagnostic.txt`

## 10. Commit, push, and deployment

- Implementation/evidence/report commit: `8514d9f31ba6096024eda7a156f1edce234b9e95` (`feat: add manual constellation layout`).
- Push: `70161ea2f427724bae9f0a8decb34ba7ed2d7794..8514d9f31ba6096024eda7a156f1edce234b9e95` to `origin/main`.
- GitHub Pages workflow: `33141166375`, `Deploy to GitHub Pages`, successful; validate/build job `98752131761`, deploy job `98752170163`.
- GitHub Pages deployment: `6135480500`, status `success`, environment `github-pages`, status record `17444690383`.
- Verified deployed product SHA: `8514d9f31ba6096024eda7a156f1edce234b9e95`.
- Live URL: `https://jpitty03.github.io/cluster-jewel-research/`; uncached HTML and `assets/index-xXpxlXyD.js` both returned HTTP 200, and the published bundle contains `MANUAL_CONSTELLATION_LAYOUT_V1`.

This documentation-only closeout records the already deployed product commit and changes no product, mechanics, search, PolicyFlow, layout behavior, or acceptance evidence. Its own push/deployment is verified in the final handoff so `main` and Pages also contain this completed report.
