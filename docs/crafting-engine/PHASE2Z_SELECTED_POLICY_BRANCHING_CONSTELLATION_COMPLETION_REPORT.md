# Phase 2Z Selected-Policy Branching Constellation Completion Report

Status: **CLOSED / PASS / READY FOR CHECKPOINT**

Completed locally on 2026-08-26 PDT. Real-browser artifacts use UTC timestamps on 2026-08-27.

Source of truth:

- `POST_PHASE2Y_REVIEW_AND_PHASE2Z_PHASE3A_POLICY_FLOW_CONSTELLATION_AND_QUALITY_LAB_RUNTIME_PLAN.md`

Baseline: `9b71c9f` on `main`, already equal to `origin/main` before editing.

The Phase 2Z checkpoint commit is the commit containing this report. Its exact SHA is recorded in the final Phase 3A handoff after the mandatory checkpoint is created.

## 1. Outcome

The Constellation is no longer synthesized from the chronological craft-plan phase list. It now renders a presentation-only aggregation of the exact selected Bellman policy:

```text
exact expected flow(s → s') = occupancy(s) × P(s' | s, selected action)
macro conditional probability = aggregated expected flow(A → B) / all outgoing flow(A)
```

The Worker result carries `SELECTED_POLICY_FLOW_V1`, including exact-state/macro aggregation counts, occupancy, expected branch flow, occupancy-weighted conditional probabilities, recovery kinds, representative evidence, reconciliation, and topology metadata.

No Constellation value feeds back into the solver, objective selection, acquisition ranking, or canonical state identity.

## 2. Primary implementation

- `crafting-engine/src/domain/PolicyFlow.ts`
  - builds exact downstream and acquisition flow components from selected `GenericSearchResult` occupancy and authoritative transition distributions;
  - groups only states with the same selected action and preserved rarity/target/fracture/affix/flag semantics;
  - aggregates `v(s) × P(s' | s,a)` into macro edges;
  - computes flow conservation, conditional-probability conservation, terminal absorption, exact-state differential samples, and topology fingerprints;
  - composes certified self-fracture acquisition into downstream flow by redirecting real acquisition terminal outcomes to the actual downstream selected-policy start state.
- `crafting-engine/src/solver/acquisitionSynthesis.ts`
  - retains a presentation-only exact acquisition flow component alongside the authoritative acquisition result;
  - candidate summaries still omit that internal component, avoiding portfolio payload inflation.
- `crafting-engine/src/service/optimizerService.ts`
  - binds the final flow to the atomic selected bundle ID and canonical policy-equivalence fingerprint before Worker serialization;
  - withholds the flow on canonical-result mismatch.
- `crafting-engine/src/domain/VisualizationGraph.ts`
  - consumes only `PolicyFlowSummary`;
  - uses deterministic Tarjan SCC condensation and cycle-aware layout;
  - derives edge width/opacity from expected flow and conditional probability;
  - contains no craft-plan route-step probability or generic recovery-to-start logic.
- `src/components/MarkovConstellation.tsx` and `src/App.css`
  - render independently moving flow-weighted wisps with a 120-particle cap;
  - distinguish success, progress, repeat, recovery, and reacquire branches visually;
  - expose keyboard/pointer-selectable node and edge explanations;
  - preserve pan, zoom, Route Focus, Fit All, Reset View, replay, reduced motion, screensaver, and fullscreen.
- Worker capture, bug-report, and export surfaces retain the exact serialized flow needed for differential and technical review.

## 3. Aggregation and identity contract

The macro key preserves:

- selected action ID;
- rarity;
- matched target requirement identities;
- fractured target requirement identities;
- prefix/suffix counts and target-bearing prefix/suffix counts;
- influenced, synthesised, acquisition-menu, and required method-action flags;
- terminal status.

Exact states choosing different actions cannot merge. Solver `ItemState` identity and physical-state identity were not changed.

The final direct matrix observed:

| Control | Macro nodes | Macro edges | SCCs | Branch nodes | Recovery edges | Aggregation | Layout | Topology |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Clean one-mod | 5 | 14 | 3 | 4 | 0 | 44.78 ms | 0.87 ms | distinct |
| Conventional two-mod | 20 | 73 | 2 | 11 | 16 | 49.67 ms | 0.67 ms | distinct |
| Selected Harvest | 11 | 18 | 11 | 3 | 0 | 2.86 ms | 0.37 ms | distinct |
| Self-fracture three-notable | 18 | 37 | 4 | 9 | 10 | 93.85 ms | 0.32 ms | distinct |
| Four-mod provisional | 28 | 64 | 4 | 16 | 21 | 47.45 ms | 0.41 ms | distinct |

All five topology fingerprints and all five selected-action histograms differed.

## 4. Flow and probability reconciliation

For every positive-occupancy nonterminal macro node in the five-control direct matrix:

- outgoing expected flow reconciled to expected selected-action executions;
- outgoing occupancy-weighted conditional probabilities summed to one within `1e-7` tolerance;
- represented terminal absorption reconciled to selected-policy absorption;
- independently serialized differential samples satisfied `expectedFlow = occupancy × exactProbability`;
- every sample mapped back to a real serialized macro edge;
- visible flow fraction was `1` and rare-outcome collapsed flow was `0`.

The production graph contains none of the removed presentation placeholders:

- route-step reciprocal probability;
- static `0.5` recovery probability;
- recovery targeting a generic start node.

## 5. Recovery and branching controls

The selected self-fracture three-notable control produced:

- one real Regal macro state with multiple next-policy outcome classes;
- four Scour branches;
- two restart/reacquire branches;
- four one-fractured Scour branches whose actual destination is Magic and whose next selected action is not Transmutation;
- acquisition preparation, Fracturing Orb, cleanup, and restart flow without exposing every raw acquisition state.

Scour edges are `RECOVERY`; `restart_reacquire` edges are `REACQUIRE`. They have separate IDs, labels, colors, destinations, and technical evidence.

The selected fewest-actions-within-600c Harvest control produced an evidence-derived repeat branch with `99.516%` occupancy-weighted policy flow and a separate success-to-Goal branch. No Harvest route was forced: the control uses the existing generic objective, candidate set, and selected-bundle comparison.

## 6. Branch explanation UX

Node detail includes:

- rarity and player-facing state summary;
- selected action;
- expected visits per completed craft;
- occupancy share;
- exact represented-state count;
- incoming and outgoing branches;
- Technical exact target IDs, representative state, and state key.

Edge detail includes:

- source selected action;
- explicitly named occupancy-weighted policy-flow probability;
- expected traversals per craft;
- outcome kind;
- source and destination summaries;
- actual next selected action;
- representative outcome;
- Technical exact transition count and evidence kind.

## 7. Wisp, glow, and layout semantics

- Particle allocation is proportional to square-root-scaled expected flow and globally capped at 120.
- Edge width is logarithmic/square-root scaled by expected flow.
- Edge opacity combines conditional probability and flow importance.
- Node radius/glow is logarithmically scaled by expected visits.
- Success is green, reacquire purple, recovery orange, repeat yellow, and ordinary progress blue.
- SCCs are condensed to a deterministic DAG; cyclic members are arranged in compact rings and backward/recovery edges receive distinct curvature.
- A Harvest miss and success therefore visibly split, while high-frequency reroll/recovery flow carries more particles than rare outcomes.

## 8. Direct and real-browser diagnostics

| Command / gate | Result |
|---|---:|
| `npm run build` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS after one trailing-space repair; line-ending notices only |
| `npm run diagnostic:phase2x` | PASS |
| `npm run diagnostic:phase2y` | PASS |
| `npm run diagnostic:phase2z` | PASS; five real selected-policy controls |
| `npm run lab:phase2z` | PASS 10/10 |

Final Phase 2Z browser run:

```text
run:      2026-08-27T05-52-00-914Z
browser:  Playwright Chromium 151.0.7922.34
wall:     55.038 seconds
result:   10/10 PASS
errors:   console 0 / page 0 / network 0
```

The suite is below the five-minute target. The legacy release matrix was not run.

## 9. Reviewed artifacts

- `quality-lab/reports/phase2z-gate.json`
- `quality-lab/reports/phase2z-summary.md`
- `quality-lab/reports/evidence/phase2z-policy-flow-diagnostic.json`
- `quality-lab/reports/evidence/phase2z-browser-flow.json`
- `quality-lab/reports/evidence/phase2z-worker-events.json`
- `quality-lab/reports/evidence/phase2z-selected-branch-detail.png`
- `quality-lab/reports/evidence/phase2z-fractured-scour-destination.png`
- `quality-lab/reports/evidence/phase2z-harvest-loop.png`

The three stable images were opened and reviewed. They show readable action nodes and branch labels, exact probability/flow explanations, a Magic fractured Scour destination selecting Augmentation rather than Transmutation, and a high-frequency Harvest repeat loop distinct from success-to-Goal.

## 10. Bugs found and repaired autonomously

1. The first browser attempt launched a stale pre-build `dist`, so new edge anchors were absent. The source was correct; rebuilding and rerunning the targeted suite made the edge-selection gates pass.
2. The first replay gate used an exact accessible-name match that excluded the existing play glyph. It now uses the semantic `Replay` name without changing the UI or assertion scope.
3. The first direct Harvest control compared method families under Cheapest, which correctly selected a conventional route. The control now uses the existing fewest-actions-within-600c objective that independently selects Harvest; production selection logic remains generic.
4. Initial exact-flow fingerprint sampling added approximately 239 ms to the cheap control. Replacing per-transition long-state hashing with bounded differential sampling plus a macro-flow fingerprint reduced final cheap aggregation to 44.78 ms and self-fracture aggregation to 93.85 ms.

Each repair was followed by the smallest affected diagnostic or browser gate, then one final complete Phase 2Z targeted suite.

## 11. Preservation declarations

- Unit tests added or run: **NO**.
- Mechanics probabilities changed: **NO**.
- Solver action legality changed: **NO**.
- Canonical state identity weakened: **NO**.
- Hardcoded route winner added: **NO**.
- Craft-specific production branch added: **NO**.
- Market-fractured ranking restored: **NO**.
- Legacy long release matrix run: **NO**.
- Long soak disposition: **withheld for Phase 3A EXTENDED/manual**.

Phase 2Z is complete and ready for its mandatory checkpoint commit before Phase 3A begins.
