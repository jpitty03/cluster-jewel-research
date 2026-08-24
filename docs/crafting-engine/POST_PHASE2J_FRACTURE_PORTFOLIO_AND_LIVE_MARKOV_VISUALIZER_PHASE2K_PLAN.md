# Phase 2K — Fracture Portfolio Resolution + Live Markov/Bellman Visualizer

Baseline reviewed: `0b3390c78c35c7e12534c8a9adbb2a1cc936dfed` on `main`.

Phase 2I and Phase 2J remain CLOSED. Phase 2K addresses a new real-world product gap exposed after 2J.

## Triggering evidence

Exact browser fixture:

- Large Cluster Jewel
- `10% increased Attack Damage`
- ilvl 84, 12 passives, Rare, extras allowed
- T1 Intelligence
- T1 Maximum Energy Shield
- 35% increased Effect
- +4 All Attributes

Initial and Retry Deeper both returned Clean Base at `42,659.146c`. Retry Deeper stabilized the downstream policy, but acquisition remained provisional with best unresolved acquisition lower bound `359.800c` and potential gap `42,299.346c`.

The problem is no longer simply “can four mods resolve?” Phase 2J solved that. The problem is that self-fracture competitors are not becoming executable full routes soon enough to compete with the clean incumbent.

## Architecture review

The mechanics are already present and should be preserved:

- `generateStartingStateCandidates()` discovers clean and target-fracture families.
- `synthesizeAcquisition()` manufactures a fractured reusable base through shared mechanics.
- wrong fracture recovers through restart/reacquire.
- cleanup uses modeled Scour.
- acquisition uses `FRACTURE_PREPARATION_BISIMULATION_V1`.
- only resolved executable synthesis enters ranking.
- pre-fractured market purchase is excluded from core ranking.

The remaining issue is search scheduling/persistence:

1. Clean certification can consume up to roughly 22s in RECOMMEND before fracture synthesis starts.
2. Default acquisition state budget is about 5,001 total states split across every fracture candidate; four targets means roughly 1,250 states each.
3. Acquisition wall time is also split after the clean pass and clamped to the remaining request deadline.
4. Downstream search is resumable after Phase 2J, but `synthesizeAcquisition()` still starts a fresh GenericSearch. Its cache identity includes budget/search intent, so Retry Deeper does not truly extend prior fracture synthesis work.

## Track A — Fracture portfolio resolution

### A1. Resumable acquisition sessions

Give each exact fracture candidate a persistent GenericSearch continuation session. Stable identity must include base/cluster/ilvl/passives, exact fractured requirement and roll semantics, clean-base price/provenance, complete currency vector, acquisition action-set version, acquisition canonical-state version, fallback policy, and Harvest acquisition scope if enabled.

Exclude extendable controls: state/time/round budgets and RECOMMEND -> DEEPEN intent when mechanics/economics are unchanged.

Required gate: cold-small -> resumed-large versus independent cold-large must produce equivalent EV/policy/proof while resumed work generates materially fewer duplicate transitions.

### A2. Competitive multi-tranche scheduling

Replace equal one-shot splitting with bounded probe + deepen scheduling.

Probe every feasible fracture family for lower bound, status, states/frontier, executable acquisition incumbent if any, and elapsed time. Then allocate remaining tranches to unresolved candidates whose admissible lower bounds can still beat the current resolved full-route U.

Do not prioritize by target name, target order, or hardcoded “35% first.” Do not prune without an admissible domination proof.

Clean Base should still get a quick executable incumbent, but once Clean U is huge and fracture lower bounds are strongly competitive, do not spend most remaining time refining clean while fracture families stay starved.

### A3. Compare full routes

For every resolved fracture candidate evaluate:

`self-fracture acquisition EV + downstream EV from fractured state = full-route EV`

Diagnostics must show Clean and every feasible self-fracture candidate with acquisition status/EV, downstream EV, full EV, and proof status.

### A4. Primary acceptance fixture

Use the exact four-mod fixture above with frozen reproducible prices. Phase 2K must no longer finish with every fracture family represented only by ~359.8c lower bounds while Clean Base is the sole executable 42.7k route.

Required target: default RECOMMEND resolves at least one competitive self-fracture acquisition + downstream full route within a practical browser request unless a quantified safe-search blocker remains. Retry Deeper must resume acquisition work and resolve additional competitive families rather than restart them.

Do not hardcode that fracture must win. If resolved economics choose Clean Base, keep that result and show why.

### A5. Candidate progress data

Expose candidate states such as `NOT_STARTED`, `PROBING`, `UNRESOLVED`, `PROVISIONAL`, `RESOLVED`, `DOWNSTREAM_UNRESOLVED`, `FULL_ROUTE_RESOLVED`, `DOMINATED`, `SELECTED`, with lower bound, acquisition U, downstream/full U, states, retained work, transition generation/reuse, and elapsed time.

## Track B — Live Markov/Bellman Search Activity UI

The supplied LLM mockup is a good visual basis. Keep the `Search Activity` card, large States/Elapsed/Round metrics, `Current focus`, stable macro graph, explicit clean route beside fracture candidates, and compact status line.

### B1. Macro graph only

Do not render the raw thousands-state Markov graph live. Use stable solver-backed macro nodes:

```text
Base
 ├─ Self-fracture 35% Effect   UNRESOLVED · L 359.8c
 ├─ Self-fracture T1 Int       PROBING · 1,250 states
 ├─ Self-fracture T1 ES        RESOLVED · Acq U ...
 ├─ Self-fracture +4 Attr      NOT STARTED
 └─ Clean Route                FULL U 42,659c
```

Lower bound L must never look like executable expected cost U. Nodes need text/icon status, not color alone. Suggested edges: solid resolved, dashed unresolved competitive, muted dominated.

### B2. Worker PROGRESS protocol

Current protocol is only `OPTIMIZE -> RESULT/ERROR`. Add `PROGRESS` with a structured-clone-safe `OptimizerProgressSnapshot`. Keep the existing Promise result API while allowing an optional `onProgress` callback.

Progress is observational only and must not change search priority, probabilities, pruning, action selection, or Bellman values.

Snapshot should include phase, elapsed time, states, frontier if useful, round/tranche, best executable full-route U, best unresolved acquisition L, potential gap, current candidate/focus, candidate summaries, recent milestone events, and reuse/retained-work data.

### B3. Throttle progress

Do not post every state transition. Emit milestones plus ~4–8 updates/sec (roughly 150–250ms): session resumed, clean incumbent, fracture probe/deepen, meaningful bound/incumbent improvement, synthesis resolved, candidate dominated, full route resolved, new best route, expansion round, Bellman/validation, complete.

### B4. Mockup changes

Keep the current layout but:

- show Best executable U and Best unresolved L near Current Focus;
- replace generic “Exploring 1/4 targets” with the real phase, e.g. `Resolving acquisition: self-fracture T1 ES`;
- show candidate status/economics in each node;
- mark the active candidate;
- distinguish acquisition vs downstream work;
- briefly announce new incumbents such as `42,659c -> 7,840c`;
- never show a fake percent-complete;
- never call a route cheaper based only on L.

### B5. Retry Deeper UI

Show continuation explicitly: retained states/transitions and per-candidate resumed progress. If price/target/ilvl/etc. invalidates identity, show `Restarted — search inputs changed`, not `Resumed`.

### B6. Telemetry gates

Telemetry ON/OFF must return the same selected policy/EV/proof and the same transition/pruning behavior. No progress after RESULT/ERROR/cancel. Target <=5% wall-time overhead; reduce emission frequency before weakening solver fidelity. Production smoke must observe at least one real PROGRESS before RESULT.

## Implementation order

1. Instrument exact four-mod acquisition starvation/allocation.
2. Add resumable acquisition continuation.
3. Add competitive multi-tranche scheduler.
4. Integrate resolved fracture + downstream full-route ranking.
5. Add worker PROGRESS protocol/client callback.
6. Implement screenshot-inspired Search Activity macro visualizer.
7. Run regressions and close out.

## Required gates

- exact four-mod acquisition budget profile
- cold vs resumed acquisition equivalence on at least two fracture targets
- exact four-mod full portfolio table
- Fracturing/conventional price sensitivity with emergent winner
- target-order neutrality
- Phase 2E fracture fidelity including wrong-fracture recovery and quotient audit
- Phase 2J controls: Herald refinement/reuse, J6 four-mod, J8 three-notable, defensive two-mod, W1–W6, simple/no-unwanted/forced-Rare/Harvest controls
- PROGRESS/RESULT/ERROR structured-clone, stale request, cancel, worker replacement, host guard
- Search Activity compiled browser smoke
- telemetry ON/OFF equality and overhead
- `npm run build`, `npm run lint`, `git diff --check`

**NO UNIT TESTS.**

## Non-negotiable invariants

No hardcoded craft answer, probability, fracture target/order, or Craft-specific branch. No bench invention. No pre-fractured market ranking. Self-fracture remains executable shared mechanics; wrong fracture remains restart/reacquire; no fixed 4x acquisition shortcut; no weakened identity without equivalence proof; external observations are validation only; unknown prices are not invented; Allflame crafting mechanic remains disabled/deferred; UI never fabricates state/cost/certainty; telemetry is observational only.

## Completion report

Create:

`docs/crafting-engine/PHASE2K_FRACTURE_PORTFOLIO_AND_LIVE_SEARCH_VISUALIZER_COMPLETION_REPORT.md`

Include exact four-mod before/after, starvation profile, acquisition session identity, cold/resumed evidence, per-fracture acquisition/downstream/full EV table, selected-route reasoning, unresolved bounds, reuse metrics, Phase 2E/2J regressions, PROGRESS schema, Search Activity browser evidence, telemetry equivalence/overhead, build/lint/diff/browser status, and explicit `unit tests added: NO`, `Craft/target-specific branches added: NO`, `pre-fractured market purchase ranked: NO`, `Allflame crafting mechanic enabled: NO`.

Phase 2K is complete when competitive self-fracture full routes are meaningfully resolved for the real four-mod target, Retry Deeper reuses acquisition work, resolved full routes are ranked proof-honestly against Clean Base, and the Search Activity panel displays real live search progress rather than a spinner/decorative graph.
