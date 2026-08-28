# Post-Phase 3D Field Review and Phase 3E Plan

## Manual Markov Constellation Layout — Drag, Persist, Reset, and Truth-Preserving Edge Rerouting

Status: **READY FOR IMPLEMENTATION**

Baseline reviewed: `dc32528e107090bfd7b6bbbe321db93d8b4b1723` on `main`.

Phase 3D is **CLOSED / PASS / DEPLOYED**. Do not reopen its policy-evidence, budget-isolation, or Constellation scope work unless Phase 3E discovers a direct regression.

Phase 3E is intentionally a **presentation-only Constellation UX phase**. It must allow a player to manually reposition macro nodes without changing any solver state, PolicyFlow node/edge identity, transition probability, expected occupancy/flow, route ranking, proof status, or crafting mechanics.

No unit tests are to be added or run. Use the Phase 3A targeted/DEV/RELEASE workflow. EXTENDED/nightly/legacy long suites remain manual-only and are not Phase 3E acceptance requirements.

---

# 1. Field Motivation

The current Phase 3C/3D semantic layout is much more readable than the original SCC ring packing, but real crafts can still produce local arrangements that a player would naturally want to adjust by hand.

The attached Normal three-notable field export is a useful acceptance fixture:

```text
Base:           Large Cluster Jewel
Cluster type:   12% increased Chaos Damage
Item level:     84
Passives:       8
Targets:
  Touch of Cruelty
  Unspeakable Gifts
  Unwaveringly Evil
Objective:      CHEAPEST_CHAOS
Budget:         NORMAL — 5,000 states / 30s / 3 rounds
Selected route: Self-fracture Unspeakable Gifts
Selected U:     1660.1253603083733c
```

Its certified PolicyFlow contains:

```text
macro nodes:        23
macro edges:        49
SCCs:                4
cyclic SCCs:         2
branch nodes:       11
recovery edges:     16
repeat edges:        5
topology fingerprint: topology-c6ae1cff
exact flow fingerprint: flow-95543b18
```

This is small enough to be manually arranged, but complex enough that moving a few Regal/Exalt/Scour/Recovery nodes can materially improve readability for a particular user.

The automatic semantic layout remains the authoritative default. Manual layout is an optional presentation override.

---

# 2. Core Invariant: Manual Layout Is Not Policy Data

Never mutate the canonical `VisualizationGraph` or the underlying `PolicyFlowSummary` to implement dragging.

Maintain two layers:

```text
canonical VisualizationGraph
  nodes[x,y]
  edges[controlX,controlY]
  probabilities
  expected flow
  topology
        ↓
manual presentation overrides
  nodeId -> { x, y }
        ↓
effective render geometry
```

The following must remain byte-for-byte / numerically unchanged by dragging:

- PolicyFlow node IDs;
- PolicyFlow edge IDs;
- edge source/target identities;
- transition conditional probabilities;
- expected flow / occupancy;
- recovery/success/repeat classifications;
- selected-policy fingerprint;
- topology fingerprint;
- exact-flow fingerprint;
- proof/reconciliation data;
- route U/L/gap;
- expected material usage;
- policy equivalence evidence.

A drag changes only the visual position used by the renderer.

---

# 3. Interaction Model

## 3.1 Layout editing must be explicit

Add a compact control such as:

```text
Arrange
```

or

```text
Unlock Layout / Lock Layout
```

Default state: **locked**.

This prevents accidental node movement while the user is panning, exploring, or clicking policy states.

When unlocked:

- pointer-down on a node + drag moves that node;
- pointer-down on empty graph background still pans the camera;
- ordinary click without exceeding the existing drag threshold still selects/opens the node;
- pointer capture must keep the drag stable if the pointer leaves the node/canvas;
- Escape cancels the active drag and restores that node's position from the start of the gesture;
- releasing the pointer commits the manual coordinate override;
- cursor communicates `grab` / `grabbing` when appropriate.

Do not overload normal camera panning with ambiguous node movement while the layout is locked.

## 3.2 Touch

When layout is unlocked:

- dragging directly on a node moves the node;
- dragging empty space pans;
- normal tap still selects;
- no document-level scrolling or horizontal overflow regression;
- use pointer events consistently rather than separate mouse-only code.

## 3.3 Keyboard accessibility

When layout editing is unlocked and a node is keyboard-focused/selected:

- Arrow keys nudge the node in graph-space;
- Shift+Arrow uses a larger increment;
- Escape reverts the current keyboard edit gesture if applicable;
- expose an accessible label indicating that the node can be repositioned while layout editing is unlocked.

Exact step sizes are presentation choices, but they must be deterministic.

---

# 4. Effective Render Geometry

The current renderer reads node coordinates and edge control points directly from `VisualizationGraph`. Phase 3E should introduce a presentation projection so every visual subsystem consumes the same effective geometry.

Recommended shape:

```ts
interface ConstellationNodePosition {
  x: number;
  y: number;
}

type ConstellationLayoutOverrides = Record<string, ConstellationNodePosition>;
```

Build a memoized effective geometry from canonical graph + overrides.

Every one of these must use the effective geometry rather than canonical coordinates once an override exists:

- node circles/glows;
- node hit-testing;
- node labels;
- edge endpoints;
- edge labels;
- edge click/hit testing;
- wisp/particle paths;
- replay focus;
- camera selected-route bounds;
- Fit All bounds;
- fullscreen geometry;
- route-focus camera behavior.

There must not be a situation where the node moves but its edge, label, hit target, or wisp stays behind.

---

# 5. Edge Rerouting During Drag

Do not alter edge probability or identity. Only derive a presentation control point.

The renderer currently uses quadratic curves with canonical `controlX/controlY`. A manual node move therefore requires a deterministic effective control point.

Use a generic geometry rule. One acceptable approach is:

```text
source displacement = manualSource - canonicalSource
target displacement = manualTarget - canonicalTarget

control displacement = weighted blend of source + target displacement

effective control = canonical control + control displacement
```

A midpoint blend is acceptable for ordinary progress edges.

For recovery/reacquire/scope-handoff routes, preserve their visual corridor semantics. Prefer recalculating the presentation control point from the same generic routing category used by the renderer/layout rather than letting a moved endpoint create a line through unrelated nodes.

Requirements:

- no hardcoded Craft/target/node names;
- deterministic for the same override set;
- live rerouting while dragging;
- self-loops remain visually attached to the moved node;
- handoff edge remains visibly identifiable as the certified scope handoff;
- recovery edges remain orange/recovery-classified regardless of position;
- moving a node cannot change `edge.source`, `edge.target`, `probability`, `expectedVisits`, or `outcomeKind`.

If necessary, create a small presentation-only geometry helper rather than adding manual-layout concerns to the solver/domain graph builder.

---

# 6. Local Persistence

Persist manual coordinates in browser-local storage only. Do not put manual coordinates into solver request identity, search cache identity, PolicyFlow fingerprints, or route equivalence.

Use a versioned persistence identity that is strict enough to avoid applying stale coordinates to a different policy.

Recommended identity ingredients:

```text
MANUAL_CONSTELLATION_LAYOUT_V1
+ layoutVersion
+ sourcePolicyFingerprint
+ topology.fingerprint
+ sorted node IDs
```

The topology fingerprint alone is not sufficient if two distinct policies can share topology while assigning different state semantics to node IDs.

Persist **graph-space** coordinates, not screen pixels, so saved layouts remain usable across viewport sizes and zoom levels.

On graph load:

1. compute the persistence identity;
2. load only a matching schema/version/identity;
3. discard unknown node IDs;
4. ignore corrupt/non-finite coordinates;
5. never infer/migrate coordinates across a mismatched policy/topology identity;
6. apply valid overrides before Fit All is calculated.

Local persistence must not change exported optimizer JSON or share-link semantics in Phase 3E. A future explicit "export visual layout" feature can be separate if desired.

---

# 7. Controls

Add clear controls without overcrowding the existing toolbar.

Minimum controls:

```text
Arrange / Lock Layout
Reset Layout
```

Semantics:

### Reset View

Existing behavior remains camera-only:

```text
pan = reset
zoom = reset
layout overrides = preserved
```

### Reset Layout

```text
manual node overrides for current layout identity = deleted
nodes return to automatic Phase 3C/3D semantic layout
camera may then Fit All using automatic geometry
```

Require a simple immediate action; no modal is necessary unless UX review finds accidental loss too easy.

### Fit All

Must use effective node positions and label-aware Phase 3D margins. A manually dragged node outside the original canonical bounds must still be included.

### Route Focus

Must frame the effective positions of the selected route.

### Screensaver / Replay

Both may render the saved manual layout. Screensaver must not enter editing mode automatically.

Changing mode must not discard coordinates.

---

# 8. Optional Group Drag — Defer Unless Trivial

Do **not** make group drag necessary for Phase 3E acceptance.

If it is trivial after single-node dragging is correct, an optional modifier gesture may move a semantic scope/group together. But correctness, persistence, edge rerouting, touch behavior, and reset semantics take priority.

Do not add complicated selection-box or multi-select state merely to claim group dragging.

---

# 9. Camera and Bounds Contract

The existing Constellation camera supports `SELECTED_ROUTE`, `ALL`, and `MANUAL` camera modes. Manual **node layout** must remain conceptually separate from manual **camera** state.

Avoid naming collisions such as treating a dragged node as `fitMode = MANUAL`.

Recommended internal vocabulary:

```text
camera manual state      = pan/zoom
layout manual state      = node coordinate overrides
```

`graphBounds(...)` or its replacement must accept effective positions.

After moving a node far left/right/up/down:

- Fit All shows it;
- labels are not clipped;
- Goal is still reachable/visible;
- scope headers/handoff labels remain within the graph-local viewport after fitting;
- no document-level horizontal overflow.

---

# 10. Scope Semantics Must Survive Arbitrary Placement

Phase 3D introduced preparation/final-craft visual scope and a certified handoff.

Manual placement must not redefine semantic scope based on x/y position.

A node remains Acquisition or Downstream because of its canonical `scope`, not because the user dragged it across the visual boundary.

Therefore:

- acquisition color/label remains acquisition;
- downstream color/label remains downstream;
- handoff edge identity remains handoff;
- scope details remain canonical;
- the user may visually move a node across the nominal boundary without changing its policy meaning.

If the static scope boundary becomes misleading after arbitrary dragging, prefer a presentation treatment that remains truthful (for example, scope header/region cues driven by node scope) rather than restricting valid dragging solely to preserve the old line.

Do not mutate scope to match position.

---

# 11. Graph Identity Changes

When the optimizer produces a new policy/graph identity:

- cancel any active drag;
- clear in-memory overrides from the previous graph;
- load saved overrides only if the new persistence identity matches exactly;
- reset selected/hover state per existing graph-change behavior;
- do not transfer coordinates by node label such as `Regal` or `Scour`;
- do not transfer by array index;
- do not transfer merely because node counts match.

Node IDs + policy/topology identity are authoritative.

---

# 12. Phase 3E Diagnostics

Add a focused `diagnostic:phase3e` or equivalent non-unit diagnostic with presentation-contract evidence.

It should prove at minimum:

### E1 — truth preservation

Take the frozen Normal three-notable graph and apply deterministic manual overrides to multiple nodes.

Assert before/after equality for:

```text
topology fingerprint
exact-flow fingerprint
node IDs
edge IDs
edge endpoints
conditional probabilities
expected flows
occupancy
reconciliation certification
```

### E2 — geometry movement

Assert moved nodes use overridden coordinates while untouched nodes retain canonical coordinates.

### E3 — live edge geometry

Assert connected edge presentation endpoints/control geometry update after node movement.

### E4 — self-loop attachment

Move the Alter node with a repeat edge and prove its visual self-loop follows it.

### E5 — certified handoff

Move one/both endpoints of the acquisition→downstream Scour handoff and prove the edge stays attached and still reports `CERTIFIED_SCOPE_HANDOFF` / scope-handoff presentation.

### E6 — persistence identity

Round-trip a layout through the persistence serializer/parser.

### E7 — mismatch rejection

Change policy fingerprint/topology/node identity and prove stale saved coordinates are rejected.

### E8 — malformed storage

NaN, Infinity, missing nodes, unknown node IDs, and malformed schema fail safely to automatic layout.

### E9 — reset semantics

Reset Layout removes overrides; Reset View does not.

### E10 — Fit All effective bounds

Move a node outside canonical bounds and prove effective Fit All contains its node + label margin.

No unit-test framework is needed; this remains a direct diagnostic.

---

# 13. Real Browser Quality Lab Gates

Add a focused real-browser Phase 3E gate using the actual app and actual Constellation component.

Required browser witness:

1. load a deterministic/frozen real PolicyFlow fixture;
2. confirm layout initially locked;
3. unlock Arrange mode;
4. drag a real node by a meaningful distance;
5. verify the node moved;
6. verify at least one connected edge endpoint/path moved;
7. verify its visible label moved with it;
8. verify graph topology/proof data surfaced to the harness is unchanged;
9. reload the page and verify the manual position persists;
10. use Reset View and verify the manual coordinate still persists;
11. use Reset Layout and verify the node returns to automatic geometry and persisted override is gone;
12. move a node beyond original canonical bounds and run Fit All; verify no clipping;
13. verify background drag still pans rather than moving a node;
14. verify locked mode returns node dragging to normal click/pan behavior;
15. exercise fullscreen;
16. exercise a 390px mobile viewport with no document horizontal overflow.

If practical, add a pointer/touch-style drag witness rather than mouse-only event synthesis.

Do not validate manual dragging by mutating fixture JSON directly. Exercise the actual browser gesture path.

---

# 14. Runtime Policy

Keep Phase 3E small.

During implementation:

```text
build / typecheck as needed
diagnostic:phase3e
targeted Phase 3E browser gate
relevant Phase 3D / 3C Constellation retention gate
```

After source stabilizes:

```text
npm run build
npm run lint
git diff --check
npm run lab:typecheck
diagnostic:phase3e
relevant retained Phase 3D/3C diagnostics
targeted browser gate
DEV once
RELEASE once
```

Do not run EXTENDED, nightly, legacy 115-gate, or long soak for ordinary acceptance.

If a browser failure is isolated, rerun that targeted gate rather than repeatedly rerunning RELEASE.

Keep DEV under the Phase 3A runtime target. Manual-layout exhaustive interaction coverage belongs in targeted/RELEASE if adding all permutations would make DEV cumbersome.

---

# 15. Completion Report

Create:

`docs/crafting-engine/PHASE3E_MANUAL_CONSTELLATION_LAYOUT_COMPLETION_REPORT.md`

Record:

- implementation commit(s);
- final deployment SHA;
- exact persistence identity/schema;
- interaction behavior;
- edge-rerouting method;
- reset-view vs reset-layout semantics;
- frozen field topology before/after truth fingerprints;
- browser drag/persist/reset evidence;
- desktop/mobile screenshots;
- Fit All evidence after out-of-bounds manual movement;
- Phase 3C/3D preservation results;
- DEV and RELEASE counts/runtime;
- confirmation that no unit tests or long suites ran;
- Pages deployment run and deployed-SHA verification.

---

# 16. Permanent Constraints

Phase 3E must not:

- alter crafting mechanics or probabilities;
- alter Bellman/search behavior;
- alter selected policy decisions;
- alter route ranking;
- alter PolicyFlow aggregation;
- weaken canonical state identity;
- alter policy-equivalence semantics;
- introduce target/Craft-specific layout branches;
- introduce hardcoded winner logic;
- restore market-fractured ranking;
- add/run unit tests;
- make manual layout part of solver/cache identity;
- silently migrate a saved layout to a different policy.

Manual node movement is a user-owned **visual preference**, nothing more.

---

# 17. Autonomous Execution

Preserve any commits that arrive on `main` after this plan. Refetch before implementation and rebase/merge normally rather than resetting newer user work.

Fix ordinary implementation/build/browser failures autonomously.

Stop only for:

- a destructive conflict with newer user-owned behavior;
- an unknown game-mechanics question;
- unavailable external credentials/service required for deployment;
- a requirement that would violate the permanent constraints above.

Otherwise complete Phase 3E, write the report, self-review, commit, push to `main`, deploy Pages, and verify the deployed SHA.