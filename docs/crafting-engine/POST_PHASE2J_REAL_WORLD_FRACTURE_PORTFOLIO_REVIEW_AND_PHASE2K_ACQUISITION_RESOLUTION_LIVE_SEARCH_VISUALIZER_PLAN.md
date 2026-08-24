# Post-Phase 2J Real-World Review and Phase 2K Plan

## Fractured Acquisition Portfolio Resolution + Live Markov/Bellman Search Visualizer

**Baseline reviewed:** `0b3390c78c35c7e12534c8a9adbb2a1cc936dfed`  
**Phase 2I:** CLOSED  
**Phase 2J:** CLOSED  
**Phase 2K status:** PLANNED

---

# 1. Why Phase 2K Exists

Phase 2J successfully fixed the previous generic-search failure mode where difficult three-/four-target crafts could run for many minutes and still return no executable route. It also added bounded downstream-policy refinement, exact-context downstream session reuse, target-conditioned compression, and proof-honest confidence separation.

A new real browser run exposed the next product-readiness bottleneck:

> The optimizer can now find and stabilize an executable clean-base downstream policy for a difficult four-target craft, but it can fail to resolve the competing executable self-fracture acquisition families quickly enough to rank the route that is most likely to matter economically.

This is not a reason to reopen Phase 2J. It is a narrower acquisition-portfolio problem revealed because Phase 2J made the downstream solver good enough to expose it.

Phase 2K has two coordinated tracks:

1. **Resolve competitive self-fracture acquisition families and their downstream routes efficiently enough to participate in normal product ranking.**
2. **Replace the opaque `Searching…` experience with a polished live visualization that shows what the optimizer is actually doing without slowing the solver or pretending an unresolved route is known.**

The fracture work is the primary correctness/economic priority. The visualizer is the primary UX/observability priority and must consume truthful engine telemetry rather than re-implement solver logic in the UI.

---

# 2. New Real-World Evidence: Exact Four-Mod Browser Fixture

The user ran both the initial search and Retry Deeper on this exact fixture:

```text
Base: Large Cluster Jewel
Cluster: 10% increased Attack Damage
Item level: 84
Passives: 12
Final rarity: Rare
Extra affixes: Allowed

Targets:
- T1 Intelligence suffix
- T1 Maximum Energy Shield prefix
- 35% increased Effect prefix
- +4 to All Attributes suffix
```

The live market snapshot in the browser was stale, so the absolute chaos values are not current-market truth. The relative solver behavior is still highly diagnostic.

## Initial result

```text
Recommended start: Clean Base
Expected cost: 42,659.146c
Starting acquisition confidence: NOT acquisition-safe
Crafting strategy confidence: STILL_IMPROVING_AT_BUDGET
Best unresolved acquisition lower bound: 359.800c
Potential acquisition gap: 42,299.346c
```

## Retry Deeper result

```text
Recommended start: Clean Base
Expected cost: 42,659.146c
Starting acquisition confidence: NOT acquisition-safe
Crafting strategy confidence: CURRENT_BEST_UNPROVEN
Best unresolved acquisition lower bound: 359.800c
Potential acquisition gap: 42,299.346c
```

The selected clean-base policy and expected-material totals were effectively unchanged between the two runs.

Representative clean-route expected usage:

```text
Alterations:      ~203,557
Scours:           ~11,256
Regals:           ~11,257
Augments:         ~5,542
Annuls:           ~786
Exalts:           ~762
Transmutations:   ~11,257
```

## Interpretation

This is useful evidence that the **clean-base downstream policy has substantially stabilized** under the explored graph.

It does **not** establish that Clean Base is the economically correct starting route.

The acquisition warning is material, not cosmetic:

```text
resolved full clean-route U = 42,659.146c
best unresolved acquisition L = 359.800c
potential gap                  = 42,299.346c
```

A self-fractured target permanently removes one of the four required affixes from the mutable downstream problem. For a 2-prefix / 2-suffix four-target craft, that can radically change the expected completion cost. The optimizer must evaluate this rather than assume either that fracture wins or that clean-base brute force wins.

---

# 3. Current Architecture Review: Why the Fracture Routes Stay Unresolved

The current architecture is conceptually correct:

- `generateStartingStateCandidates()` emits the clean physical state plus one single-target fractured physical state for each distinct target modifier/group.
- fractured states do not receive a fake market acquisition method;
- `synthesizeAcquisition()` manufactures a reusable fractured state using shared mechanics;
- wrong fractures recover through real restart/reacquire transitions;
- only `RESOLVED` executable self-fracture synthesis is allowed to enter the normal acquisition portfolio;
- unresolved fracture families remain visible through lower-bound evidence.

Those rules must remain.

The problem is search scheduling and reuse.

## 3.1 Equal acquisition-budget splitting starves real four-target portfolios

In `OptimizerService`, the acquisition stage currently creates one shared acquisition budget and divides it approximately evenly across every fractured candidate.

With four target fracture candidates and the current default acquisition-state budget of roughly 5,001 states, each candidate may receive only about:

```text
~1,250 states
```

before the downstream reserve is considered.

This is dramatically smaller than the search depth that previous fracture-fidelity work demonstrated can be necessary to produce a certified executable self-fracture route.

The result is predictable:

```text
four plausible fracture families
    ↓
all receive shallow independent tranches
    ↓
none reaches RESOLVED
    ↓
none enters the downstream acquisition portfolio
    ↓
certified Clean Base remains the only executable full route
    ↓
UI correctly returns PROVISIONAL_RESOLVED
```

The optimizer is not claiming fracture is expensive. It is failing to finish enough acquisition synthesis to calculate its executable upper bound.

## 3.2 Retry Deeper does not currently resume acquisition synthesis the way downstream search resumes

Phase 2J added reusable downstream `GenericSearchContinuationSession` state keyed by exact mechanics/economics context while intentionally excluding extendable budget controls and RECOMMEND/DEEPEN intent.

The acquisition synthesis cache behaves differently:

- its cache identity includes the acquisition budget;
- its cache identity includes search intent;
- `synthesizeAcquisition()` creates a fresh `GenericSearchEngine` without a continuation session.

Therefore a Retry Deeper request that changes budget and intent can reuse downstream graph work while still recomputing fracture acquisition searches from scratch.

This is the primary architectural mismatch Phase 2K should fix.

## 3.3 Resolved-only portfolio admission is correct and must not be weakened

Do **not** solve this by putting unresolved or approximate self-fracture candidates into normal economic ranking.

The correct fix is:

> make competitive self-fracture synthesis cheap enough and resumable enough to become genuinely executable, then admit it through the existing resolved-only gate.

---

# 4. Phase 2K Track A — Fractured Acquisition Portfolio Resolution

## 4.1 Add persistent per-candidate acquisition search sessions

Each fractured acquisition family should own a resumable `GenericSearchContinuationSession` analogous to the Phase 2J downstream session.

Conceptually:

```text
Optimizer exact request session
├─ clean downstream session
├─ acquisition candidate: fracture T1 Int
│   └─ reusable synthesis continuation
├─ acquisition candidate: fracture T1 ES
│   └─ reusable synthesis continuation
├─ acquisition candidate: fracture 35% Effect
│   └─ reusable synthesis continuation
├─ acquisition candidate: fracture +4 Attributes
│   └─ reusable synthesis continuation
└─ portfolio downstream session
```

The acquisition-session identity must include all mechanics/economics inputs that can change its value, including:

- base type;
- cluster type;
- item level;
- passive count;
- exact fractured target requirement;
- clean-base cost and provenance;
- complete currency rates used by acquisition actions;
- enabled acquisition action set/version;
- fracture-preparation canonical/quotient version;
- research-fallback policy;
- any future specialized action scope that is actually enabled.

It must intentionally exclude only extendable controls such as:

- `maxStates`;
- `maxWallTimeMs`;
- `maxExpansionRounds`;
- RECOMMEND vs DEEPEN when mechanics/economics are unchanged.

Changing a mechanics/economics input must invalidate reuse.

## 4.2 Do not equally divide the entire acquisition budget once and stop

Replace one-shot equal splitting with **bounded adaptive tranche scheduling**.

Recommended high-level behavior:

### Seed round

Give every mechanically feasible fracture family a small fair seed tranche so no candidate is silently ignored.

Collect for each candidate:

```text
status
lower bound
incumbent upper bound if executable
states retained
transitions generated/reused
last improvement
proof health
elapsed time
target-preparation milestones
```

### Competitive refinement rounds

Continue only families that can still matter economically, using admissible evidence.

A candidate remains competitive if its proven total-route lower bound can still beat the best executable full-route incumbent.

If only an acquisition lower bound is available, using:

```text
route lower bound = acquisition lower bound + 0
```

is safe but weak.

Prefer a stronger downstream lower bound when one can be proven admissible from the fractured starting state. Never manufacture a heuristic lower bound merely to prune a candidate.

### Fairness requirement

The scheduler may prioritize, but it must not encode a hidden preferred fracture target.

No logic such as:

```text
35% Effect first
rare mod first
prefix first
lowest raw weight first
```

unless that priority is derived from admissible search/economic evidence rather than a hardcoded craft heuristic.

Use deterministic tie-breaking only for reproducibility.

## 4.3 Resolve an executable acquisition candidate, then evaluate the full route immediately

As soon as a self-fracture candidate becomes `RESOLVED`, inject it into the executable acquisition portfolio and evaluate its downstream policy.

Do not wait for all fracture candidates to resolve before learning whether the new full route beats Clean Base.

This creates a useful feedback loop:

```text
resolve fracture candidate
      ↓
compute full-route U
      ↓
new best executable incumbent
      ↓
use incumbent to prune/downgrade noncompetitive acquisition families by proven bounds
```

If another unresolved candidate still has a lower bound below that new incumbent, it remains competitive and must not be silently discarded.

## 4.4 Acquisition Retry Deeper must extend prior work

Retry Deeper should visibly and measurably continue acquisition synthesis.

Required equivalence diagnostic:

```text
cold acquisition DEEPEN to final budget
vs
RECOMMEND -> resumed acquisition DEEPEN to same final total budget
```

Acceptance:

- same candidate EV within numerical tolerance;
- same selected acquisition policy/proof health;
- retained states > 0 on resumed path;
- materially fewer duplicate transition generations;
- no unsafe reuse after identity-changing input.

## 4.5 Do not require fracture to win

The product expectation is that a fractured route is likely to be substantially cheaper for the new real-world four-target fixture, but Phase 2K must **not encode that expectation as a correctness gate**.

The correct gate is:

> every competitive self-fracture family must be given enough proof-safe/resumable search to produce an executable full-route result or remain explicitly unresolved with evidence explaining why; the selected winner must emerge from actual costs and Bellman continuation values.

If Clean Base legitimately remains cheaper under the same pinned PriceBook, that is acceptable if the competing fracture routes were actually resolved or soundly bounded.

---

# 5. Exact Phase 2K Real-World Fixture

Add a permanent diagnostic fixture matching the browser PDFs exactly:

```text
Large Cluster Jewel
10% increased Attack Damage
ilvl 84
12 passives
Rare
Allow extra affixes

Targets:
AfflictionJewelSmallPassivesGrantInt3
AfflictionJewelSmallPassivesGrantES3
AfflictionJewelSmallPassivesHaveIncreasedEffect2
AfflictionJewelSmallPassivesGrantAttributes3
```

Use a frozen controlled PriceBook for deterministic diagnostics. Separately allow the production browser to use market data, with stale-price warnings preserved.

For this fixture record a table for every acquisition family:

| Start family | Synthesis status | Acquisition L | Acquisition U | Full-route L | Full-route U | States | Time | Proper | Absorbing | Reconciled |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| Clean Base | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |
| Self-fracture T1 Int | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |
| Self-fracture T1 ES | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |
| Self-fracture 35% Effect | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |
| Self-fracture +4 Attributes | ... | ... | ... | ... | ... | ... | ... | ... | ... | ... |

For each resolved self-fracture synthesis also record:

- expected Fracturing Orbs;
- expected clean-base restarts;
- expected preparation currency;
- desired-fracture probability at each on-policy fracture state;
- wrong-fracture recovery action and expected visits;
- terminal reusable state cleanliness;
- acquisition policy status;
- downstream selected-policy health.

No fixed `4x` success formula is allowed. Expected attempts must arise from the real fracture-state occupancy and uniform-over-explicits transition distribution.

---

# 6. Phase 2K Track B — Live Markov/Bellman Search Visualizer

The current browser experience is too opaque. A static spinner or a simplistic few-box flowchart does not communicate what the optimizer is actually doing, and it wastes one of the most interesting aspects of this product.

The visualizer should feel like a **live optimizer control room**, not a generic loading diagram.

The normal user should be able to understand, at a glance:

1. which route families are competing;
2. what the solver is exploring now;
3. whether it has found an executable route;
4. when a cheaper route is discovered;
5. whether acquisition or downstream policy is the unresolved bottleneck;
6. whether Retry Deeper is continuing previous work;
7. what the currently selected crafting loop broadly looks like.

It must remain proof-honest: visuals may summarize or animate engine state, but they may never imply that an unresolved route is certified.

---

# 7. Visual Design Direction — Make It Visually Interesting

## 7.1 Default view: animated route competition map

Do **not** make the default experience a literal graph of thousands of Markov states.

Use a horizontally flowing, animated route map with three visual regions:

```text
ACQUISITION                     CRAFTING POLICY                         GOAL

Clean Base ───────────────┐
                          ├── Magic rolling ── Rare progression ── ★ Success
Frac T1 Int ──────────────┤          ↖                │
Frac T1 ES ───────────────┤           ╰── Scour ──────╯
Frac 35% Effect ──────────┤
Frac +4 Attributes ───────┘
```

The map should be alive while searching.

### Node appearance

Use rich macro-state cards rather than plain labeled rectangles.

A state card can show:

```text
┌────────────────────────────┐
│ RARE · 3/4 TARGETS         │
│ ✓ 35% Effect   ✓ T1 ES     │
│ ✓ T1 Int       □ +4 Attr   │
│ 2P / 1S · 1 suffix open    │
└────────────────────────────┘
```

Visually distinguish:

- target acquired;
- target missing;
- fractured/locked target;
- open prefix/suffix slots;
- terminal success;
- recovery/restart states.

### Edge appearance

Edges should convey meaning:

- selected/high-flow policy edge: strong solid line;
- currently explored transition: animated travelling pulse/particle;
- recovery loop: curved return edge;
- unresolved branch: amber/dashed;
- dominated/pruned branch: dimmed/grey;
- successful terminal flow: visually emphasized but not distracting.

Edge thickness may reflect expected visit/flow magnitude after a policy exists. Do not use thickness as probability unless it is actually normalized/documented as such.

## 7.2 Acquisition race should be a first-class visual

For difficult crafts the user should see the acquisition competition explicitly.

Example presentation:

```text
STARTING ROUTE RACE

Clean Base             ✓ executable      42,659c
35% Effect fracture    ◉ refining         L 360c     6,200 states
T1 Int fracture        ◉ exploring        L 360c     4,800 states
T1 ES fracture         ✓ executable       6,940c
+4 Attr fracture       ◌ queued           L 360c
```

When a candidate resolves, animate the state change and immediately show its full-route economics once downstream evaluation is available.

If a new route becomes the best incumbent, show a brief event:

```text
NEW CHEAPEST ROUTE
42,659c → 6,940c
Self-fracture T1 ES
```

The final styling should fit the existing dark UI and restrained PoE gold accent, but it should have meaningful motion, depth, hierarchy, and polish rather than looking like a basic debug flowchart.

## 7.3 Live EV history

Include a compact live sparkline/timeline of incumbent improvements:

```text
Expected cost
42.7k ───────╲
              ╲ 18.2k
               ─────╲ 6.94k ─────
                       time →
```

Each improvement marker should be inspectable:

```text
12.4s — clean route certified: 42,659c
18.1s — self-fracture 35% acquisition resolved
21.8s — new full-route incumbent: 8,420c
27.3s — T1 ES fracture route improves incumbent: 6,940c
```

Do not fabricate intermediate EVs. The timeline is driven only by actual incumbent events emitted by the engine.

## 7.4 Current search focus panel

Show a compact statement that changes with real solver telemetry:

```text
Currently exploring
Self-fracture: 35% increased Effect
Preparing legal four-affix fracture states
Round 3 · 5,821 states retained
```

or:

```text
Currently refining
Rare items with 3/4 targets
Missing +4 Attributes suffix
Comparing Exalt vs Annul/Scour recovery
```

This should explain what is happening in human terms while remaining derived from actual search state.

## 7.5 Recent search-event feed

Show only a short rolling event feed, not a console dump.

Useful events:

- first executable route found;
- new incumbent found;
- acquisition candidate resolved;
- candidate proven dominated by bound;
- candidate remains unresolved at budget;
- Bellman policy converged;
- policy changed action at an important macro state;
- Retry Deeper resumed N prior states;
- transition cache reuse milestone.

Example:

```text
27.3s  New cheapest route: 6,940c
25.8s  T1 ES fracture acquisition certified
22.1s  Reused 8,421 prior transitions
18.4s  Clean route stabilized at 42,659c
```

## 7.6 Retry Deeper should visibly continue, not reset

When the same exact-context request resumes:

```text
Previous search retained
5,000 states · 17,230 transitions

Continuing deeper…
7,142 states
8,804 states
10,000 states
```

Keep the existing graph on screen and expand/refine it. Do not visually wipe the graph and restart from Clean Base unless the session was actually invalidated.

If reuse is invalidated, say why in a small neutral status:

```text
Search restarted because currency prices changed.
```

---

# 8. Visualizer Modes

Use progressive disclosure.

## Player mode — default

Focus on understanding and confidence:

- animated macro route map;
- acquisition race;
- current best route/cost;
- incumbent-history sparkline;
- states explored;
- elapsed time;
- current focus;
- short event feed;
- starting-acquisition confidence;
- crafting-strategy confidence.

The graph should generally stay around 8–25 meaningful visible macro nodes.

## Advanced search mode

Allow technical users to inspect more of the MDP without dumping the entire graph by default.

Provide filters such as:

- acquisition family;
- action type;
- rarity;
- target progress 0/4, 1/4, 2/4, 3/4, 4/4;
- resolved / unresolved / dominated;
- on-policy only;
- fracture status;
- high expected-visit states.

A selected node can show:

```text
Exact state / quotient key
Selected Bellman action
V(state)
Candidate Q-values
Transition probabilities
Expected visits
Lower bound / incumbent gap
Policy status
```

Only render a bounded subset at once. The advanced graph is an inspection tool, not a mandate to push the entire state graph into the DOM.

---

# 9. Worker Progress Protocol

The browser protocol currently exposes only:

```text
OPTIMIZE -> RESULT
OPTIMIZE -> ERROR
```

Add a structured-clone-safe progress response:

```text
OPTIMIZE
  -> PROGRESS
  -> PROGRESS
  -> PROGRESS
  -> RESULT
```

Conceptually:

```ts
interface OptimizerWorkerProgressResponse {
  type: 'PROGRESS';
  requestId: string;
  progress: OptimizerProgressSnapshot;
}
```

The snapshot should stay lightweight and may contain:

```text
phase
subphase
elapsedMs
statesDiscovered / retained / expanded
expansionRound
frontierSize
incumbent full-route U
best known lower bound
incumbent history delta
current acquisition candidate
acquisition-candidate summaries
current target-progress bucket
transition distributions generated/reused
session reuse status
recent semantic events
macro-route nodes/edges or enough data for UI aggregation
```

Do not serialize complete raw graph state on each update.

---

# 10. Telemetry Performance Rules

The visualizer must not become a new solver bottleneck.

Requirements:

- throttle periodic progress snapshots to roughly 4–8 Hz;
- allow immediate event emission for rare high-value events such as a new incumbent;
- never emit one browser message per expanded state or transition;
- keep a bounded recent-event buffer;
- send deltas where practical instead of repeatedly serializing the same large structures;
- build expensive detailed graph views only on demand or after search completion;
- make progress emission optional at the engine/service boundary so diagnostics can benchmark telemetry OFF vs ON.

Add a controlled performance diagnostic. Target:

> progress telemetry + normal player visualization should add no more than ~5% end-to-end runtime overhead on representative two-mod and four-mod fixtures.

If this threshold is not achievable safely, document the measured overhead and reduce update frequency/detail before weakening solver fidelity.

---

# 11. Visualizer Truthfulness Rules

1. Never label a lower bound as an expected cost.
2. Never show an unresolved acquisition family as executable.
3. Never show a provisional route as globally cheapest.
4. Acquisition confidence and downstream-policy confidence remain separate.
5. A dimmed/pruned branch must be pruned by actual bound/status evidence, not by UI heuristics.
6. The displayed selected path must come from the current returned/incumbent policy.
7. If the selected policy changes during refinement, update the highlighted path from actual policy data.
8. Do not infer target-order preference from mod weight alone.
9. Do not imply that a candidate is progressing merely because the UI animation is active; current-focus text and events must reflect real telemetry.
10. Stale price evidence must remain visible and must not be hidden by the visualization.

---

# 12. Required Phase 2K Diagnostics / Gates

## K1 — Exact browser-PDF fixture reproduction

Reproduce the exact four-mod `10% increased Attack Damage` fixture under a frozen PriceBook.

Record:

- clean initial U;
- clean Retry Deeper U;
- policy confidence progression;
- every fractured acquisition candidate status/L/U;
- allocation per candidate;
- why each unresolved candidate stopped.

## K2 — Direct self-fracture candidate resolution matrix

Run each of the four target fracture syntheses independently with sufficient controlled budget.

Require for every resolved candidate:

- finite acquisition EV;
- proper policy;
- terminal absorption approximately 1;
- Bellman convergence;
- occupancy convergence;
- cost reconciliation;
- no unresolved on-policy probability;
- correct wrong-fracture restart semantics;
- reusable post-cleanup fractured state.

If a candidate cannot resolve, identify the actual mathematical/search blocker rather than inventing a formula.

## K3 — Adaptive acquisition scheduler

Demonstrate that a multi-candidate request no longer gives every candidate one shallow tranche and abandons all of them.

Record seed and refinement allocations by candidate and reason for each next tranche.

## K4 — Acquisition resume equivalence

Cold final-budget acquisition search vs RECOMMEND -> resumed DEEPEN:

- EV equivalent;
- proof-health equivalent;
- actual retained states/transitions reused;
- materially less duplicate work.

## K5 — Acquisition invalidation

Changing any relevant input invalidates acquisition reuse:

- target fracture requirement;
- base/cluster;
- ilvl/passives;
- clean-base price;
- Fracturing Orb price;
- Alter/Aug/Regal/Exalt/Scour/Chaos rates;
- action-set version;
- canonical acquisition-state version;
- research fallback policy.

Budget extension and RECOMMEND -> DEEPEN alone must not invalidate.

## K6 — Full-route competition

For the exact four-mod fixture, compare Clean Base plus every resolved self-fracture route under one identical PriceBook.

The winning start must emerge from total route Q-values.

No hardcoded requirement that fracture wins.

## K7 — Competitive-family closure

At product return, every acquisition family whose proven route lower bound can beat the incumbent must be one of:

- executable/resolved and ranked;
- still explicitly unresolved with its lower bound and budget stop reason;
- soundly dominated by a proven bound.

Never silently omit a competitive family.

## K8 — Existing Phase 2J regressions

Re-run at minimum:

- Herald bounded refinement;
- cold/resumed downstream DEEPEN;
- target-conditioned quotient zero-violation audit;
- three-notable Cold fixture;
- defensive two-mod runtime;
- one-mod and two-mod controls;
- selected self-fracture;
- selected Harvest;
- Craft A/C deterministic or multi-seed regression as appropriate.

No unit tests.

## K9 — Worker progress protocol

Validate:

- PROGRESS is structured-clone safe;
- RESULT and ERROR behavior remains backward-correct;
- request IDs isolate events;
- cancellation terminates progress cleanly;
- host guard still works;
- no progress from an old/replaced worker is applied to a new request.

## K10 — Live visualizer semantics

Browser smoke should verify:

- macro route map appears during a long-running search;
- acquisition candidate status changes are reflected;
- a new incumbent updates displayed cost/path;
- Retry Deeper preserves prior visual state when session reuse occurs;
- invalidated search visually resets with a reason;
- provisional vs acquisition-safe vs modeled-optimal labels remain truthful;
- no unresolved candidate appears as certified.

## K11 — Telemetry overhead

Benchmark progress OFF vs ON on:

- defensive two-mod fixture;
- exact four-mod fixture.

Target <= ~5% end-to-end overhead.

## K12 — Production validation

Require:

```text
npm run build
npm run lint
git diff --check
compiled production browser + worker smoke
```

No unit tests.

---

# 13. UI Acceptance Criteria

The visualizer is not complete merely because boxes and arrows render.

It should pass this qualitative product test:

> A user watching a 20–30 second hard craft should be able to explain what the optimizer is currently trying, which starting routes are still competing, whether a cheaper route has just been found, and what remains unresolved—without opening Advanced details.

Specific acceptance expectations:

- visually polished dark-theme integration;
- clear route hierarchy and spatial flow;
- purposeful animation tied to real events;
- acquisition competition prominently visible;
- target-progress state cards rather than generic circles;
- visible recovery loops;
- incumbent-change animation/event;
- live EV history;
- current-focus explanation;
- progressive disclosure into exact Q-values and state details;
- responsive layout that does not dominate the page after search completion;
- reduced-motion accessibility support;
- no misleading decorative animation disconnected from solver activity.

---

# 14. Permanent Constraints Reaffirmed

1. No hardcoded answer.
2. No hardcoded target probabilities.
3. Use actual eligible mod weights.
4. No target/Craft-specific solver branches.
5. No assumed best fracture target.
6. No fixed `4x` self-fracture cost.
7. Wrong fracture uses real restart/reacquire transitions.
8. Core fractured states are manufactured through executable self-fracture.
9. Pre-fractured market purchase remains outside normal core ranking.
10. Standard Crafting Bench is not a source of cluster-jewel targets/notables.
11. Harvest external observations remain validation-only.
12. Allflame crafting mechanic remains deferred/disabled.
13. Unknown prices never silently become invented values.
14. Any compression must remain mechanics-equivalent/bisimulation-audited.
15. Selected-policy validity, acquisition safety, and global/model optimality remain distinct.
16. UI visualization never substitutes for proof state.
17. No unit tests unless explicitly requested later.
18. No weakening of mechanics fidelity solely to meet visualizer or runtime goals.

---

# 15. Recommended Implementation Order

1. Add exact K1 fixture and print the complete fracture-candidate acquisition table before changing scheduling.
2. Add resumable per-fracture acquisition continuation sessions.
3. Fix acquisition cache/session identity so budget/intent extensions reuse work safely.
4. Implement bounded adaptive tranche scheduling across fracture candidates.
5. Resolve candidates incrementally and inject each executable route into downstream competition immediately.
6. Run K2–K7 until the real four-mod acquisition portfolio is economically meaningful and proof-honest.
7. Introduce progress telemetry at solver/service/worker boundaries without changing mechanics.
8. Build the polished player-facing route map, acquisition race, EV history, current-focus panel, and event feed.
9. Add Advanced graph inspection and filters only after the default experience is useful.
10. Benchmark telemetry overhead and complete K8–K12 regressions.

---

# 16. Required Phase 2K Completion Report

Create:

```text
docs/crafting-engine/PHASE2K_FRACTURE_PORTFOLIO_AND_LIVE_SEARCH_VISUALIZER_COMPLETION_REPORT.md
```

Report at minimum:

1. implementation commit;
2. files changed;
3. exact K1 fixture and frozen prices;
4. pre-fix acquisition allocation table;
5. root cause confirmed/refuted;
6. per-candidate continuation-session design;
7. exact acquisition-session identity/invalidation contract;
8. adaptive scheduler algorithm;
9. fairness/tie-breaking behavior;
10. direct K2 fracture synthesis matrix;
11. expected Fracturing Orbs/restarts per resolved candidate;
12. cold vs resumed acquisition equivalence;
13. duplicate acquisition work before/after;
14. full-route Clean vs each fracture candidate economics;
15. selected winning route and why it emerged from Q-values;
16. any unresolved competitive acquisition and reason;
17. exact four-mod runtime before/after;
18. three-notable regression;
19. Herald/downstream-resume regression;
20. fracture quotient/bisimulation audit status;
21. worker PROGRESS protocol schema;
22. progress throttling/event policy;
23. visualizer default player-mode design implemented;
24. acquisition-race behavior;
25. incumbent-history visualization;
26. Retry Deeper visual continuation behavior;
27. Advanced graph behavior;
28. telemetry OFF vs ON overhead;
29. stale-price/proof-warning presentation;
30. build;
31. lint;
32. production browser/worker smoke;
33. unit tests added? expected NO;
34. transition mechanics changed? explain exactly;
35. target/Craft-specific branches added? expected NO;
36. remaining blockers before broader product readiness.

---

# Final Phase 2K Principle

Phase 2J proved that a hard craft can now produce a real executable downstream policy quickly enough to be useful.

Phase 2K should make sure the optimizer is solving the **right starting-route competition**, not merely the first route it can finish.

And while it works, the user should be able to see that reasoning unfold:

> **which acquisition families are competing, what the search is learning, when a better route appears, and what remains unproven.**
