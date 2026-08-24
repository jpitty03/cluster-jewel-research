# Phase 2K Revert-Recovery Context — Rebuild the Lost Search Activity UI Baseline

## Why this addendum exists

A local revert accidentally removed the in-progress Phase 2K UI changes before they were committed. GitHub therefore cannot restore the exact reverted source code. This document reconstructs the intended baseline from the user-supplied screenshots and the already-committed Phase 2K source-of-truth plan.

Read this addendum together with:

`docs/crafting-engine/POST_PHASE2J_FRACTURE_PORTFOLIO_AND_LIVE_MARKOV_VISUALIZER_PHASE2K_PLAN.md`

The Phase 2K plan remains authoritative for behavior, telemetry, solver constraints, and acceptance gates. This file exists only to restore visual/implementation context that was lost in the revert.

## What the reverted UI looked like

The reverted prototype added a bordered search-status card directly below the form/actions while an optimization request was running.

The user-provided screenshots showed this approximate structure:

```text
[ Searching... ] [ Cancel ]

┌──────────────────────────────────────────────────────────────┐
│ Deepening the search over the crafting-state chain...       │
│ The worker is exploring and valuing macro states like these.│
│ Detailed live telemetry lands with the progress-event stream.│
│                                                              │
│ [Clean Base] → [Transmute] → [Magic] → [Regal] → [Rare]     │
│     → [Exalt] → [Goal]                                       │
│                                                              │
│ ↻ Scour / restart → Clean Base                              │
│                                                              │
│ ELAPSED 6.4s   WALL-TIME BUDGET 1m 0s                       │
│ STATE BUDGET 10,000   EXPANSION ROUNDS up to 4              │
│ ━━━━━━━━━━━━━━━ progress/accent rule                         │
└──────────────────────────────────────────────────────────────┘
```

Visual characteristics from the screenshots:

- dark theme consistent with the existing optimizer;
- thin amber/orange border around the entire activity card;
- amber/orange heading;
- pill-shaped macro-state nodes with rounded outlines;
- small arrow separators between nodes;
- `Goal` received the strongest amber glow/accent in the early screenshot;
- `Scour / restart → Clean Base` appeared as a secondary loop line below the chain;
- four compact metrics sat in a row at the bottom: Elapsed, Wall-Time Budget, State Budget, Expansion Rounds;
- a thin amber progress/accent bar sat below those metrics;
- the card updated elapsed time while the request was running (screenshots captured approximately 2.4s and 6.4s);
- the existing `Searching...` and `Cancel` buttons remained above the card.

## Important: what the reverted prototype was and was not

The reverted prototype was primarily a **visual shell**. The repository still shows the worker protocol as only `OPTIMIZE -> RESULT/ERROR`; there is no committed `PROGRESS` response yet.

Therefore, do **not** recreate the old card by pretending the chain is live telemetry. Rebuild its visual shell, but immediately evolve it into the real Phase 2K Search Activity panel described in the main plan.

The final implementation must never imply that:

- the displayed chain is the literal complete Markov graph;
- a node is active unless the solver says it is;
- elapsed-time percentage equals solver completion percentage;
- a lower bound is an executable route cost;
- `Goal` is being approached merely because wall-clock time advances.

## Rebuild target

### 1. Preserve the screenshot-inspired shell

Keep the overall visual language and placement:

- activity card appears only while searching and may remain available in a completed/collapsed summary after RESULT if useful;
- title should describe the actual current phase, not always say `Deepening`;
- retain pill-style macro nodes and restart/recovery line;
- retain compact bottom metrics;
- retain dark/amber styling consistent with the existing page.

Suggested phase-aware headings:

- `Finding an executable clean-base route...`
- `Probing self-fracture acquisition candidates...`
- `Resolving self-fracture T1 Energy Shield...`
- `Comparing full acquisition + downstream routes...`
- `Refining the current crafting policy...`
- `Validating Bellman policy and expected cost...`
- `Continuing the previous search...`

### 2. Replace the fixed chain with solver-backed macro state

The reverted fixed chain was:

`Clean Base -> Transmute -> Magic -> Regal -> Rare -> Exalt -> Goal`

That is still useful as a **route topology illustration** when conventional crafting is the active downstream family, but the Phase 2K product needs a higher-level acquisition view first.

During acquisition competition, prefer a macro portfolio layout such as:

```text
Start / acquisition portfolio
  ├─ Clean Base                  FULL U 42,659c · executable
  ├─ Self-fracture T1 Int        PROBING · L 359.8c
  ├─ Self-fracture T1 ES         RESOLVED · Acq U 1,5xxc
  ├─ Self-fracture 35% Effect    UNRESOLVED · L 359.8c
  └─ Self-fracture +4 Attributes NOT STARTED
```

When a specific candidate becomes active, the panel can then show the candidate's local macro chain:

```text
Clean Base
  -> prepare legal fracture state
  -> Fracturing Orb
  -> desired fracture / wrong fracture
  -> Scour cleanup or restart/reacquire
  -> reusable fractured start
  -> downstream craft
  -> Goal
```

For a resolved conventional downstream route, the original pill chain can still appear:

`Clean Base -> Transmute -> Magic -> Regal -> Rare -> Exalt/Annul -> Goal`

The set of displayed actions must come from actual selected/active mechanics. Do not force Exalt, Regal, Harvest, Annul, or Scour into the visual when they are not part of the active macro route.

### 3. Add the economics the old prototype was missing

Near the heading/current-focus area, show at minimum:

- `Best executable U` — full executable expected cost;
- `Best unresolved L` — admissible lower bound for a competitive unresolved route;
- `Potential gap` when both exist;
- `Current focus` — candidate and phase being worked;
- `Search reuse` — Cold / Resumed / Restarted because inputs changed.

Use explicit labels `U` and `L` and explanatory tooltip/help text. Never display `L 359.8c` in a visual style that can be mistaken for `Expected cost 359.8c`.

### 4. Candidate status chips

Support solver-backed statuses from the main Phase 2K plan:

- `NOT_STARTED`
- `PROBING`
- `UNRESOLVED`
- `PROVISIONAL`
- `RESOLVED`
- `DOWNSTREAM_UNRESOLVED`
- `FULL_ROUTE_RESOLVED`
- `DOMINATED`
- `SELECTED`

Each candidate should be understandable without relying on color alone.

Example compact node/card:

```text
Self-fracture T1 ES
RESOLVED ACQUISITION
Acq U 1,506c
Downstream: evaluating
3,842 states · resumed
```

### 5. Retry Deeper should visibly continue

The UI should make Phase 2J/2K continuation behavior obvious.

Example:

```text
Continuing previous search
Retained: 5,000 states · 17,230 transition distributions
Current: self-fracture 35% Effect
New states this request: 1,842
```

If session identity changes because of target, ilvl, prices, final-state constraints, Harvest scope, etc., say:

`Restarted — search inputs changed`

Do not say `Resumed` when the worker/session was invalidated.

## Worker/protocol reconstruction instructions

The current committed protocol is still effectively:

```text
OPTIMIZE -> RESULT
OPTIMIZE -> ERROR
```

Phase 2K should extend it to:

```text
OPTIMIZE
  -> PROGRESS
  -> PROGRESS
  -> ...
  -> RESULT | ERROR
```

Implement a structured-clone-safe `OptimizerProgressSnapshot` and preserve the existing Promise-based final result API. Add an optional progress callback/subscription at the worker client boundary.

Suggested snapshot fields:

```ts
interface OptimizerProgressSnapshot {
  phase: string;
  elapsedMs: number;
  round?: number;
  tranche?: number;
  statesExpanded: number;
  retainedStates?: number;
  transitionDistributionsGenerated?: number;
  transitionDistributionsReused?: number;
  bestExecutableUpperBoundChaos?: number;
  bestUnresolvedLowerBoundChaos?: number;
  potentialGapChaos?: number;
  currentCandidateId?: string;
  currentFocus?: string;
  sessionReuse?: 'COLD' | 'RESUMED' | 'INVALIDATED';
  candidates?: OptimizerCandidateProgress[];
  recentEvents?: OptimizerProgressEvent[];
}
```

Exact type naming is flexible; semantics are not.

Throttle snapshots to milestone events plus about 4–8 Hz. Do not post one message per state or transition.

## Event examples to surface

Useful live events include:

- `Clean executable route found: U 42,659c`
- `Probing self-fracture T1 ES`
- `Self-fracture T1 ES acquisition resolved: U ...`
- `Evaluating downstream policy from fractured T1 ES`
- `New best full route: 42,659c -> 7,840c`
- `Self-fracture +4 Attributes dominated by admissible bound`
- `Retry Deeper resumed 5,000 retained states`
- `Bellman policy converged`
- `Expected-cost reconciliation passed`

Do not emit fake celebratory events when only a lower bound improves.

## CSS/layout guidance from the reverted visual

Do not over-engineer the first pass. Recreate the screenshot's visual hierarchy using the existing application CSS conventions:

- one full-width `.optimizer-card`-style activity surface;
- flex/wrap row for macro nodes;
- compact pill nodes rather than a third-party graph library;
- CSS arrows/labels are enough for the player-facing macro view;
- CSS grid/flex for metrics;
- responsive wrapping below desktop widths;
- no canvas/SVG force-directed graph required for this phase;
- animation should be subtle and reduced/disabled under `prefers-reduced-motion`;
- active status can use border/glow plus text/icon, not glow alone.

A later Advanced developer graph can use a graph library if needed. Phase 2K does not need to render thousands of raw MDP states.

## Suggested component boundary

Keep `CraftOptimizer.tsx` thin. Prefer extracting the activity UI, for example:

```text
src/crafting/SearchActivity.tsx
src/crafting/searchActivityModel.ts
```

or an equivalent location consistent with the existing source tree.

Responsibilities:

- `CraftOptimizer.tsx`: start/cancel request, own latest progress snapshot, render activity component;
- worker client/protocol: transport progress safely;
- service/search engine: emit observational progress only;
- `SearchActivity`: transform snapshots into player-facing macro nodes/metrics;
- no crafting mechanics or route-choice logic in the React component.

## Revert-recovery implementation order

1. Recreate the screenshot-inspired Search Activity card as a component using real request metadata only (elapsed time, configured budgets); do not claim solver progress yet.
2. Add `PROGRESS` protocol and client callback.
3. Emit coarse real progress from service/search/acquisition scheduler.
4. Replace placeholder macro nodes/current-focus text with solver-backed data.
5. Add acquisition portfolio candidate statuses and U/L economics.
6. Add Retry Deeper retained-work visualization.
7. Add milestone events/new incumbent display.
8. Run telemetry equality/overhead and compiled-browser smoke gates from the main Phase 2K plan.

## Recovery acceptance check

The rebuilt UI should visually resemble the lost screenshots, but should be *more truthful* than the reverted prototype.

A hard four-mod request should visibly progress through something conceptually like:

```text
Finding clean incumbent...
  Clean Base FULL U 42,659c

Probing fracture portfolio...
  T1 Int        UNRESOLVED  L 359.8c
  T1 ES         PROBING     L 359.8c
  35% Effect    NOT STARTED
  +4 Attributes NOT STARTED

Resolving competitive acquisition...
  T1 ES Acq U ...

Evaluating downstream from fractured T1 ES...

New best full route...
```

The exact numbers must come from the engine. The UI must never fabricate them.

## What not to do while recovering the reverted work

- Do not try to recover exact lost source code from GitHub; it was never committed.
- Do not stop at rebuilding the decorative fixed macro chain.
- Do not add fake progress percentages.
- Do not tie graph animation speed to assumed solver completion.
- Do not move crafting rules into UI code.
- Do not hardcode the four target names outside diagnostics/fixture code.
- Do not hardcode a preferred fracture target.
- Do not reintroduce market-fractured purchase ranking.
- Do not change transition probabilities just to make telemetry easier.
- Do not add unit tests.

## Relationship to Phase 2K completion

This addendum does not change Phase 2K gates. It restores the missing UI context after the accidental revert.

Phase 2K is still complete only when:

1. competitive self-fracture acquisition work is resumable and meaningfully resolved for the real four-mod fixture;
2. full fractured routes are ranked against Clean Base using executable acquisition + downstream EV;
3. Retry Deeper reuses fracture acquisition work;
4. the Search Activity panel is driven by real `PROGRESS` telemetry and clearly distinguishes executable `U`, unresolved `L`, acquisition work, downstream work, and session reuse;
5. all regression, proof, browser, telemetry-equivalence, overhead, build, lint, and no-unit-test gates in the main Phase 2K plan pass.
