# PATH TO SUCCESS

## Master implementation roadmap for finishing the Cluster Jewel Research application

Baseline reviewed: `4b75cfe52f441114fca63aaa7bd4b9868cd30350` on `main`.

> **Phase 2V superseding status (2026-08-25):** Phase 2S public-beta certification remains reopened. The current product status is **Browser-Verified Release Candidate 2V.1**. Phase 2T solver, accounting, method-family, Worker, and real-browser truthfulness plus Phase 2U interaction, readability, player-vocabulary, and exact-identity behavior remain authoritative. Phase 2V adds document-scroll ownership, truthful clean/self-fracture Constellation chronology, one-terminal presentation, and generic certified repeatable-reroll closure for the eligible T1 Armour + T1 Evasion Harvest family, as defined by `POST_PHASE2U_FIELD_VALIDATION_AND_PHASE2V_SCROLL_SEMANTICS_HARVEST_CLOSURE_PLAN.md`.

> **Validation execution policy (2026-08-25):** Fresh mature diagnostics and the full Playwright release matrix are required local completion gates. Automatic Pages CI is intentionally limited to build, lint, diff hygiene, and auditing the committed Phase 2V local-evidence contract; the extended hosted matrix is unscheduled and opt-in. This user-approved execution-policy exception supersedes the automatic hosted execution described in Phase 2T T14 and Phase 2U U16, without changing any browser assertion or solver behavior.

This document is the high-level roadmap for taking the current research-grade optimizer to a trustworthy, efficient, polished application that ordinary players can use. Detailed phase documents remain the source of truth for their individual implementations; this file defines the final product, the order of work, the quality strategy, and the release gates.

The immediate detailed implementation plan is:

```text
docs/crafting-engine/POST_PHASE2U_FIELD_VALIDATION_AND_PHASE2V_SCROLL_SEMANTICS_HARVEST_CLOSURE_PLAN.md
```

Phase 2V is closed. Replay now moves only its horizontal route rail, clean and self-fracture graphs present physically truthful acquisition chronology with one terminal Goal, and eligible repeatable Harvest full rerolls can close through an audited family-scoped quotient without changing mechanics probabilities or global state identity. The exact four-mod benchmark still has a proof gap under interactive budgets, but its selected executable policy remains proper, absorbing, converged, and cost-reconciled. That is a proof-efficiency limitation, not a reason to hide or hardcode a result.

No new unit tests should be added or run unless the user explicitly lifts the current project constraint. The primary validation strategy remains deterministic diagnostics, analytical/Monte Carlo parity, actual Worker/browser integration tests, and the external adaptive browser quality harness proposed below.

---

# 1. Product North Star

A user should be able to:

1. choose a cluster-jewel base, enchantment, item level, passive count, final rarity, and extra-affix policy;
2. select one to four exact desired modifiers;
3. choose what “best” means, such as cheapest, fewer actions within a budget, estimated fastest within a budget, or balanced value of time;
4. receive multiple executable crafting methods, not merely one opaque winner;
5. understand the chronological steps, conditional decisions, expected materials, expected cost, expected effort, and proof confidence for every displayed method;
6. see why alternatives such as Harvest or self-fracture were selected, rejected, unresolved, or dominated;
7. watch the optimizer work through a beautiful live Markov/Bellman visualization without the animation changing solver decisions or slowing the search materially;
8. save, share, export, replay, and reproduce the recommendation with its exact prices, mechanics version, and search settings.

The application succeeds when it is both:

```text
mathematically honest
and
pleasant enough that a normal player would actually use it while crafting
```

---

# 2. Non-Negotiable Engineering Principles

## 2.1 Correctness before spectacle

The priority order is:

1. mechanics correctness;
2. price and objective correctness;
3. executable route coverage;
4. proof honesty;
5. search efficiency;
6. browser reliability;
7. user experience;
8. visual spectacle.

The full-screen Markov visualization is valuable, but it must never delay or weaken correctness work.

## 2.2 No hardcoded craft answers

Do not add:

- target-specific winners;
- “fracture this modifier first” rules;
- “Harvest always wins” or “Alteration always wins” rules;
- Craft of Exile observations as transition probabilities;
- fixed `4 × Fracturing Orb` acquisition shortcuts;
- Crafting Bench creation of unsupported cluster-jewel mods;
- pre-fractured market purchases in normal route ranking;
- hidden price premiums;
- fake progress, fake graph nodes, or fake certainty.

Generic strategy-family constraints are allowed when the user explicitly asks to compare methods, but the policy within each family must still be solved from shared mechanics, weights, prices, state, and recovery rules.

## 2.3 Every displayed route must be proof-honest

A route card must distinguish:

- executable expected-cost upper bound `U`;
- admissible lower bound `L`;
- selected-policy validity;
- acquisition safety;
- modeled-action optimality;
- global modeled portfolio status;
- mechanics and price confidence;
- search-budget limitations.

An unresolved lower bound is not an executable route and must never be presented as one.

## 2.4 Full-route accounting

Every result must account for the complete route:

```text
initial acquisition
+ preparation
+ expected failed attempts
+ wrong-fracture recovery
+ reacquisition
+ cleanup
+ downstream crafting
+ final finishing actions
```

Virtual acquisition-menu transitions are solver abstractions. They must not be counted as one physical action or one unit of time.

## 2.5 The browser is a real product boundary

A Node diagnostic passing is not sufficient by itself. Critical behavior must also pass through:

```text
production build
→ actual browser
→ actual module Worker
→ structured-clone PROGRESS / RESULT / ERROR
→ rendered UI
```

## 2.6 AI-assisted testing is advisory, not authoritative

A visual model may identify layout issues, interpret screenshots, choose an adaptive next step, and suggest a repair. It may not be the sole oracle for solver correctness, costs, probabilities, or proof status.

---

# 3. Definition of a Finished Application

The application is ready for broad use when all of the following are true.

## 3.1 Correctness

- Every recommended policy is proper, absorbing, Bellman-converged, occupancy-converged, and cost-reconciled.
- Every selected practical route satisfies its explicit executable monetary ceiling.
- Prices, mechanics confidence, and snapshot timestamps are visible.
- Modifier weights, exclusions, rarity, fracture locks, affix capacities, and final-state constraints are respected.
- Harvest, fracture, Alteration, Regal, Exalt, Annul, Scour, Chaos, and restart behavior are represented only where modeled and legal.
- Analytical transitions and seeded Monte Carlo remain aligned within documented statistical expectations.
- Target order does not change economics unless target identity genuinely changes the state or search.
- Retry Deeper preserves exact-context work and never regresses the best retained executable incumbent.

## 3.2 Route usefulness

For a target, the application should be able to show a non-dominated portfolio containing feasible examples of:

- open best-modeled route;
- clean Alteration/Augmentation rolling;
- Regal/Exalt promotion and recovery;
- Harvest reforge route where eligible;
- self-fracture route for each mechanically feasible target modifier;
- mixed self-fracture plus Harvest or conventional downstream route;
- Annul/Exalt cleanup and finishing where selected;
- Chaos reroll/restart route where modeled and competitive.

Not every family must produce a route for every target. The UI must state one of:

```text
Executable route found
Considered but more expensive
Considered but dominated
Enabled but unresolved at this budget
Not eligible for this target
Not modeled
```

## 3.3 Performance

Initial release targets on the reference test machine:

- simple one-mod search: P95 under 2 seconds;
- ordinary two-mod search: P95 under 10 seconds;
- complex three/four-mod search: first useful executable recommendation within the configured browser host guard when one is reachable;
- all controls remain responsive while the Worker runs;
- cancellation returns control immediately and the replacement Worker recovers;
- live telemetry and visualization add no more than 5% median wall-time overhead;
- no unbounded state/session growth across repeated searches;
- background or hidden-tab animation automatically reduces work.

These targets should be measured and versioned rather than silently relaxed.

## 3.4 User experience

- The main result can be understood without opening Advanced details.
- The chronological craft plan remains compact and branch-aware.
- The user can compare cost, actions, estimated time, proof, and acquisition method across alternatives.
- The user can see why Harvest or fracture was not selected.
- The UI works at 320px width, desktop width, keyboard-only navigation, and reduced-motion settings.
- Target configuration is shareable through a stable URL or exported file.
- Results can be copied as a shopping list and a step-by-step guide.
- Stale or missing pricing is prominent and can be overridden manually.

## 3.5 Quality evidence

- Every release candidate passes deterministic engine diagnostics.
- Every release candidate passes production-browser and Worker smokes.
- The separate adaptive browser harness passes its required journeys, visual checks, accessibility checks, and performance budgets.
- Visual baseline changes are reviewed explicitly rather than automatically accepted.
- No unresolved P0 correctness issue remains.

---

# 4. Finish the Optimizer

## 4.1 Complete Phase 2M: multi-objective routes

Implement the detailed Phase 2M plan already committed to the repository.

The default remains **Cheapest**. Add practical, cost-constrained alternatives:

- fewer actions within an explicit cost ceiling;
- estimated fastest within an explicit cost ceiling;
- balanced value-of-time.

Keep unconstrained fewest-actions and fastest results Advanced-only because they may choose an extremely expensive self-fracture route for an otherwise cheap craft.

Required full-route metrics:

```text
expected chaos
expected physical crafting actions
estimated manual time
objective score
cost premium vs Cheapest
proof status
```

## 4.2 Add a generic Method Portfolio

The current optimizer finds the best policy over its enabled actions. The finished application should also answer:

> What are the best executable versions of the major crafting approaches?

Create generic method-family search specifications. These are action-set constraints, not target-specific recipes.

### Open policy

All modeled legal actions compete normally.

### Conventional rolling

Typical allowed actions:

```text
Transmutation
Alteration
Augmentation
Regal
Exalt
Annul
Scour
restart/reacquire
```

### Alteration-focused clean route

A constrained clean-start family emphasizing Magic rolling and legal promotion. The solver still chooses keep/reroll decisions from weights and prices.

### Harvest route

Require at least one selected on-policy Harvest action. Allow the necessary cleanup, restart, fracture-preservation, and finishing actions. Report which Harvest tag was used.

### Self-fracture route

Pin one candidate starting physical state at a time, manufacture it through executable self-fracture synthesis, then solve its downstream policy. Evaluate every feasible desired modifier, not only the current incumbent.

### Self-fracture plus Harvest

Allow a synthesized fractured start and require Harvest downstream when a resolved policy exists.

### Chaos/reforge route

Allow generic Chaos reroll/recovery behavior where modeled. Do not advertise it when it never appears on-policy.

### Finishing/cleanup route labels

Annul and Exalt are often part of another family rather than standalone acquisition strategies. Surface them as route badges and chronological finishing steps.

## 4.3 Method-family output rules

For each family return:

- family name and action badges;
- acquisition route;
- expected chaos/actions/time;
- expected currency usage;
- chronological plan;
- conditional decision details;
- selected action evidence;
- mechanics/price confidence;
- executable `U`, admissible `L`, and proof status;
- reason it was or was not selected;
- search budget and retained work.

Do not display two cards that are materially the same policy. Deduplicate by selected acquisition, on-policy action set, and normalized policy signature.

Default-visible alternatives should be Pareto-non-dominated across cost, actions, and time. Advanced can show the full research set.

## 4.4 On-demand family solving

Do not run every family on every keystroke.

Recommended workflow:

```text
Find Cheapest
→ return first useful recommendation
→ show immediately available alternatives
→ offer “Compare methods”
→ solve missing family policies using retained transition graphs
```

This keeps the initial experience fast while still providing deep comparison.

## 4.5 Improve proof efficiency without hiding gaps

The current lower bounds are valid but can remain far below executable costs on pathological portfolios.

Continue improving:

- target-conditioned admissible downstream bounds;
- candidate-specific retained proof sessions;
- incumbent-directed tranche allocation;
- lower-bound decomposition by unavoidable slot, target, and action requirements;
- quotienting only after equivalence/bisimulation audits;
- transition-distribution reuse;
- policy/value solve reuse where the objective identity permits it;
- early domination when a proven lower bound exceeds the incumbent;
- graceful first-useful return followed by resumable proof deepening.

Never claim portfolio optimality merely because deeper search stopped improving the incumbent.

## 4.6 Mechanics-completeness ledger

Maintain a machine-readable ledger for every supported action:

```text
implemented
legality source
transition source
analytical parity status
Monte Carlo status
external parity status
price source
mechanics confidence
known limitations
```

The UI can derive “Modeled actions” and warnings from the same ledger.

## 4.7 Pricing and reproducibility

Every result should carry:

- league;
- price-snapshot timestamp;
- clean-base quote provenance;
- complete currency vector;
- manual overrides;
- mechanics-data version;
- canonical-state version;
- action-registry version;
- app commit/build version;
- normalized target and objective;
- search budgets.

This enables shareable, reproducible results and meaningful bug reports.

---

# 5. Finish the User Experience

## 5.1 Simplify the main workflow

The primary page should have four progressive sections:

```text
1. Choose the jewel
2. Choose 1–4 target modifiers
3. Choose objective and pricing
4. Compare crafting methods
```

Advanced search/proof controls remain collapsed by default.

## 5.2 Recommended result hierarchy

### Primary recommendation

Show:

- route name;
- expected cost;
- expected actions;
- estimated time if available;
- acquisition method;
- confidence/proof status;
- cost premium or savings;
- stale-price warnings;
- Retry Deeper or Compare Methods actions.

### How to craft it

Keep the compact chronological playbook:

```text
Acquire
→ prepare
→ roll
→ promote
→ finish
→ recover/restart
→ stop
```

Show exact state-dependent branches under Decision details.

### Alternative methods

Use cards for:

- Cheapest/Open;
- Conventional Alt/Aug/Regal/Exalt;
- Harvest Reforge;
- each resolved self-fracture target;
- other resolved mixed methods.

Each card should answer “why this route?” and “why not selected?”

### Expected materials

Separate:

- initial shopping list;
- long-run expected usage;
- acquisition materials;
- downstream materials;
- optional buffer recommendation clearly labeled as a convenience estimate rather than solver EV.

## 5.3 Harvest transparency

When Harvest is not selected, show one of the following explicit explanations:

```text
Harvest was considered and was more expensive.
Harvest was considered and used fewer actions, but exceeded your cost ceiling.
Harvest was enabled but no executable Harvest policy resolved under this budget.
Harvest was not eligible for the selected target modifiers.
Harvest pricing is unavailable, so it was excluded from trusted ranking.
```

When possible include:

- Harvest expected cost;
- expected attempts;
- Lifeforce usage;
- expected actions/time;
- selected route comparison;
- price crossover estimate.

## 5.4 Share, export, and replay

Add:

- copyable configuration URL;
- export/import JSON;
- copyable Markdown craft guide;
- copyable shopping list;
- downloadable diagnostic JSON from Advanced;
- replay token for a completed search/visualization;
- anonymized bug-report bundle containing configuration, result, progress log, console errors, timing, and app version.

Do not include secrets or account data.

## 5.5 Saved craft workspace

Later in the release sequence, support browser-local saved crafts:

- name a target;
- pin price snapshot or use current prices;
- compare previous result to current result;
- mark completed or favorite;
- reopen and Retry Deeper.

Server-side accounts are not required for the first public release.

---

# 6. The Markov Constellation

## 6.1 Goal

Create an optional full-screen visualization that is genuinely beautiful and mesmerizing to watch, like a screensaver, while remaining grounded in real optimizer progress.

Working name:

```text
Markov Constellation
```

It should feel like a living web of crafting possibilities rather than a conventional flowchart.

## 6.2 Visual language

- Nodes float like luminous stars or orbs.
- Edges curve organically rather than using rigid right angles.
- Soft wisps travel along transitions.
- Wisps split across probabilistic branches and merge at quotient states.
- The active candidate pulses gently.
- New incumbents send a bright wave through the selected route.
- Dominated branches dim and drift into the background.
- Unresolved frontiers remain ghosted/dashed rather than appearing complete.
- Terminal success blooms subtly instead of flashing aggressively.
- The camera eases between active regions with no abrupt jumps.
- Background particles and noise remain restrained so the graph stays readable.

The visual must use text/icons/patterns in addition to color for status.

## 6.3 What the nodes represent

Do not render tens of thousands of raw states in the default view.

Use stable macro-state groups such as:

- clean base;
- each self-fracture acquisition family;
- Normal/Magic/Rare state;
- prefix/suffix occupancy;
- number and identity of matched targets where material;
- fractured target identity;
- Harvest/reset state;
- recovery/reacquisition state;
- terminal success;
- unresolved frontier;
- dominated family.

Advanced mode may reveal sampled or clustered concrete states.

## 6.4 What the wisps represent

A wisp should correspond to real evidence:

- transition probability;
- expected policy visits;
- search expansion activity;
- incumbent-policy flow;
- acquisition tranche activity.

Suggested behavior:

```text
wisp frequency      ∝ expected visits or recent expansion activity
wisp thickness      ∝ probability mass
node glow           ∝ occupancy / active focus
edge brightness     = selected vs alternative vs unresolved
```

Never invent a moving path solely for decoration when it implies a false transition.

## 6.5 Live mode and replay mode

### Live mode

Driven by throttled Worker `PROGRESS` events. It shows the current search phase, active family, retained work, bounds, and new incumbents.

### Policy replay

After completion, animate the selected policy using expected visits and transition probabilities. The replay should loop smoothly and can explain one branch at a time.

### Screensaver mode

A full-screen, low-chrome view that cycles through saved deterministic replays or curated benchmark crafts. It should not start expensive new solver jobs automatically.

## 6.6 Technical architecture

Preferred rendering path:

```text
React shell
+ renderer adapter
+ WebGL-accelerated 2D canvas, preferably PixiJS or an equivalent lightweight renderer
```

A Canvas2D fallback is acceptable for reduced environments.

Use a renderer-independent graph model:

```typescript
interface VisualizationGraph {
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
  events: VisualizationEvent[];
  seed: string;
  layoutVersion: string;
}
```

The solver/service produces data; the renderer only visualizes it.

## 6.7 Deterministic animation mode

For testing and reproducible screenshots, support:

- fixed graph seed;
- fixed layout seed;
- fixed replay log;
- controllable clock;
- step to exact frame/time;
- disable ambient randomness;
- stable viewport and device scale.

This is mandatory for meaningful visual regression testing.

## 6.8 Performance and accessibility

- Cap active particles/wisps.
- Lower particle density when frame time rises.
- Pause or reduce rendering in hidden tabs.
- Keep solver Worker independent from rendering.
- Target smooth desktop animation and a lower-density mobile mode.
- Respect `prefers-reduced-motion` with a static or gently highlighted graph.
- Provide pause, resume, speed, zoom, reset-camera, and “focus selected route.”
- All essential information remains available as text outside the canvas.
- Measure visualizer ON/OFF solver latency and main-thread responsiveness.

---

# 7. External Adaptive Browser Quality Lab

## 7.1 Scope

Create a new harness outside the application source and engine directories:

```text
quality-lab/
```

It must have its own dependencies and package manifest so it does not pollute the main application bundle.

Recommended layout:

```text
quality-lab/
  package.json
  playwright.config.ts
  README.md
  src/
    runner.ts
    appLauncher.ts
    scenarioPlanner.ts
    appDriver.ts
    eventCapture.ts
    artifactStore.ts
    reportWriter.ts
    oracles/
      semanticOracle.ts
      workerOracle.ts
      visualOracle.ts
      layoutOracle.ts
      accessibilityOracle.ts
      performanceOracle.ts
      animationOracle.ts
    scenarios/
      smoke/
      optimizer/
      objectives/
      methods/
      responsive/
      accessibility/
      animation/
      chaos/
    generators/
      targetGenerator.ts
      priceSweepGenerator.ts
      viewportGenerator.ts
      interactionGenerator.ts
    vision/
      VisionProvider.ts
      optionalRemoteVisionAdapter.ts
  fixtures/
  baselines/
  artifacts/        # gitignored
  reports/          # gitignored except intentional summaries
```

The harness should launch the normal production build and interact with it as a black box. It should not import private React components or manipulate solver state directly.

## 7.2 Recommended harness tools

Use a separate Playwright installation for:

- Chromium launch;
- role/label-based interaction;
- screenshots and video;
- browser traces;
- viewport/device testing;
- console/network capture;
- keyboard and pointer input;
- actual Worker behavior.

Add harness-only utilities for:

- accessibility analysis;
- perceptual screenshot comparison;
- layout geometry checks;
- image sequence/frame-delta analysis;
- property-based scenario generation;
- report generation.

A remote multimodal model may be an optional visual-review adapter. The deterministic harness must still work without it.

## 7.3 Capture Worker events without production test hooks

Use `page.addInitScript` to instrument the browser before the app loads and observe:

```text
PROGRESS
RESULT
ERROR
Worker replacement
stale messages
cancel
host guard
```

Store a copy of structured-clone-safe events in the harness page context. This keeps the harness external and avoids adding debug-only global state to production code.

## 7.4 Goal-driven adaptive testing

Tests should describe goals rather than brittle click coordinates.

Example:

```yaml
goal: Compare Harvest and conventional methods for a two-mod defence target
constraints:
  - exact target IDs preserved
  - Harvest appears in considered scope
  - at least one executable route displayed
  - selected route explanation is visible
  - no horizontal overflow at 390px
```

The adaptive loop:

1. inspect the accessibility tree and visible text;
2. inspect the current screenshot;
3. locate controls by role, label, and semantic state;
4. choose the next allowed action;
5. perform the action;
6. wait on semantic conditions, not arbitrary sleeps;
7. compare DOM output to captured Worker result;
8. evaluate layout, visuals, accessibility, and performance;
9. react to the observed outcome;
10. stop with a structured pass/fail report and evidence.

Examples of dynamic reactions:

- If no route resolves, click Retry Deeper once and verify retained work.
- If pricing is stale, verify warning behavior and optionally apply a fixture override.
- If Harvest is not selected, expand the explanation and classify why.
- If a dropdown moved, rediscover it by accessible name instead of failing on a CSS selector.
- If a visual card overflows, test an adjacent viewport and capture its geometry.
- If animation appears frozen, inspect frame deltas and progress events before deciding whether it is a rendering or solver issue.
- If the Worker errors, collect trace, console, last progress, request input, and recovery behavior.

## 7.5 Test oracles

### Semantic oracle

Checks that visible values match the authoritative Worker result:

- selected route;
- expected cost/actions/time;
- proof status;
- bounds;
- candidate counts/statuses;
- pricing warnings;
- method-family labels;
- chronological plan coverage.

### Worker oracle

Checks:

- correct request IDs;
- PROGRESS ordering;
- terminal `COMPLETE → RESULT`;
- no progress after RESULT/ERROR;
- cancel and worker replacement;
- Retry Deeper reuse;
- invalidation on changed mechanics/economics/objective;
- structured clone.

### Layout oracle

Uses DOM rectangles to detect:

- overlaps;
- clipping;
- off-screen popups;
- horizontal overflow;
- hidden buttons;
- text outside cards;
- canvas covering interactive UI;
- missing focus indicators.

### Visual oracle

Combines:

- deterministic screenshot diff;
- perceptual hash/difference;
- saliency/contrast heuristics;
- optional multimodal review.

It should flag issues such as:

- unreadable text;
- weak hierarchy;
- accidental blank regions;
- excessive density;
- animation obscuring results;
- inconsistent selected/dominated states;
- unattractive or broken Markov paths.

### Accessibility oracle

Checks:

- keyboard completion of the full target-to-result journey;
- roles and accessible names;
- active descendant and focus return;
- reduced motion;
- contrast;
- screen-reader-readable alternatives to canvas content;
- live-region announcement behavior.

### Performance oracle

Captures:

- time to first useful recommendation;
- time to result;
- main-thread long tasks;
- dropped animation frames;
- Worker/search duration;
- retained states and transition reuse;
- memory trend across repeated searches;
- visualizer ON/OFF overhead.

### Animation oracle

In deterministic mode:

- captures exact frames;
- verifies wisps follow real edges;
- verifies selected route highlight;
- verifies new-incumbent wave;
- verifies no teleporting/jarring layout changes;
- verifies reduced-motion static mode;
- verifies screensaver loops without memory growth.

## 7.6 Visual model output contract

When optional vision review is enabled, require structured JSON rather than free-form commentary:

```json
{
  "verdict": "PASS | WARN | FAIL",
  "confidence": 0.0,
  "issues": [
    {
      "severity": "P0 | P1 | P2 | P3",
      "region": "human-readable screen region",
      "description": "observable issue",
      "evidence": "what is visible",
      "suggestedNextTest": "bounded next action"
    }
  ]
}
```

Never allow the visual model to invent solver values or override deterministic oracles.

## 7.7 Controlled repair loop

By default, the harness only reports.

Optional explicit mode:

```text
--suggest-fix
```

may generate:

- a Markdown finding;
- likely source locations;
- a proposed patch file;
- a reproduction scenario;
- required validation commands.

A later explicit mode may apply a patch to a disposable branch, but it must:

- never modify or push `main` automatically;
- never accept its own visual baseline changes;
- rerun deterministic engine/browser gates;
- stop for human review.

## 7.8 Harness reports

Each run should produce:

```text
summary.md
results.json
screenshots/
video/
trace.zip
console.log
worker-events.json
performance.json
layout.json
visual-diff/
reproduction.yaml
```

Reports should identify app commit, browser version, viewport, seed, fixture, price snapshot, objective, and search budget.

---

# 8. Testing Methods to Build

## 8.1 Deterministic fixture corpus

Keep a small frozen release corpus covering:

- one ordinary mod;
- one notable;
- prefix + suffix two-mod;
- same-generation two-prefix and two-suffix targets;
- T1 Armour + T1 Evasion;
- T1 Armour + T1 ES;
- Herald Envoy + Endbringer;
- selected Harvest;
- selected self-fracture;
- wrong-fracture recovery;
- three-notable;
- exact four-mod;
- impossible/ineligible target;
- missing price;
- stale price;
- narrow cost ceiling;
- cheap/normal/expensive Fracturing Orb.

## 8.2 Differential testing

For the same normalized input compare:

```text
Node service result
vs
actual browser Worker result
vs
visible UI result
```

All authoritative semantic fields must agree.

## 8.3 Analytical versus Monte Carlo

For supported mechanics and representative states:

- compute analytical transition probabilities;
- run seeded Monte Carlo;
- compare with statistical intervals;
- preserve external observations separately as validation only.

## 8.4 Metamorphic testing

Use relationships that should hold even without knowing the exact expected answer.

Examples:

- reversing target input order preserves economics;
- increasing one currency price cannot reduce the direct cost of policies using that currency;
- a resumed exact-context search retains prior work;
- changing price/objective/target safely invalidates objective-specific values;
- returning A → B → A restores the exact cached session where retained;
- a practical cost-constrained route never exceeds its executable ceiling;
- a dominated method never appears as a default-visible Pareto alternative;
- telemetry ON/OFF preserves policy semantics;
- lower bounds never exceed their matching executable upper bounds;
- wrong-fracture recovery always reacquires rather than illegally removing the fracture;
- larger retained search does not discard a better executable incumbent.

## 8.5 Generated target matrix

Dynamically generate legal scenarios across:

- base size;
- enchantment;
- item level;
- passive count;
- one to four target mods;
- prefix/suffix topology;
- rarity;
- extra-affix policy;
- price vectors;
- objective;
- cost ceiling;
- search budget.

Bias generation toward untested method families, tags, mod groups, and proof states.

## 8.6 Browser journey fuzzing

Generate bounded UI journeys:

- add/remove/reorder targets;
- search with aliases;
- change base after selecting mods;
- change item level and verify invalid target handling;
- cancel at different phases;
- Retry Deeper repeatedly;
- switch objective and price overrides;
- resize during search;
- navigate with keyboard only;
- open/close Advanced and Decision details;
- export/import/share/replay.

The planner should preserve a valid goal and know when a generated action is intentionally invalid.

## 8.7 Performance and soak

Run:

- 20–50 sequential searches in one browser;
- repeated A → B → A reuse;
- repeated cancel/restart;
- long screensaver replay;
- hidden-tab/background behavior;
- large target and deep search;
- multiple viewport/device-scale combinations.

Detect memory, retained-session, canvas-resource, and Worker leaks.

## 8.8 Failure injection

Test:

- missing/stale price data;
- malformed imported config;
- Worker exception;
- structured-clone failure;
- host-guard timeout;
- cancellation during each phase;
- unavailable Harvest price;
- zero eligible tagged mods;
- empty outcome distribution;
- invalid objective/ceiling;
- corrupted replay log.

---

# 9. Phased Roadmap to Release

## Phase 2M — Cost-constrained multi-objective crafting

Source of truth already exists.

Exit gates:

- Cheapest unchanged;
- full acquisition + downstream action/time accounting;
- Harvest comparison transparency;
- practical cost guardrails;
- objective-specific Bellman policies;
- Pareto route contract;
- browser/Worker/regression gates.

## Phase 2N — Method Portfolio and result explainability

Implement generic method-family searches and comparison cards.

Exit gates:

- Open, conventional, Harvest, and self-fracture families are represented when executable;
- mixed-family badges are accurate;
- no duplicate policy cards;
- every card has full-route metrics/proof;
- “why not selected?” works;
- method comparison is on-demand and reuses transitions;
- copy/export guide works.

## Phase 2O — External Adaptive Browser Quality Lab

Create `quality-lab/` with its own package and Playwright installation.

Exit gates:

- black-box production build launch;
- actual Worker event capture;
- semantic/layout/visual/accessibility/performance oracles;
- deterministic fixture corpus;
- adaptive target and journey generation;
- screenshot/video/trace reports;
- no production source imports;
- no auto-merge or automatic baseline acceptance.

## Phase 2P — Correctness, proof, and performance closure

Use Quality Lab findings to harden the optimizer.

Focus:

- unresolved method families;
- pathological lower-bound gaps;
- long two-mod/three-mod/four-mod searches;
- memory/session bounds;
- mechanics ledger gaps;
- price-confidence behavior;
- cross-browser Worker behavior.

Exit gates:

- P0/P1 harness findings resolved;
- reference performance targets met or explicitly revised with evidence;
- no known route-accounting bug;
- no known proof mislabel;
- all mature diagnostics stable.

## Phase 2Q — Markov Constellation

Build the polished WebGL/Canvas visualization after the event/data contract is stable.

Exit gates:

- live and replay modes use real telemetry/policy data;
- deterministic animation mode;
- screensaver mode;
- selected/unresolved/dominated semantics accurate;
- reduced-motion mode;
- visualizer overhead within budget;
- adaptive visual and animation tests pass;
- long replay has no leak.

## Phase 2R — Pricing, sharing, and data freshness

Focus:

- league update workflow;
- currency/Lifeforce freshness;
- clean-base pricing quality;
- price provenance and age;
- manual overrides;
- shareable URL;
- export/import/replay bundles;
- reproducible bug reports.

Exit gates:

- stale data can never look current;
- no invented unknown price;
- configuration/result can be reproduced;
- pricing changes safely invalidate search sessions;
- deployment snapshot/version visible.

## Phase 2S — Release candidate and public beta

Focus:

- onboarding and help text;
- responsive polish;
- accessibility review;
- empty/error states;
- production monitoring;
- static deployment validation;
- documentation and known limitations;
- beta feedback loop.

Exit gates:

- release scorecard passes;
- Quality Lab smoke runs in CI;
- nightly extended matrix established;
- no P0/P1 issue;
- proof/mechanics/pricing limitations documented in product;
- rollback procedure tested;
- public beta tag/release created.

---

# 10. CI and Validation Strategy

## Pull-request gate

Run the fast set:

```text
npm run build
npm run lint
git diff --check
core deterministic diagnostics
actual browser/Worker smoke
Quality Lab smoke journeys
small visual baseline set
```

## Nightly gate

Run the extended set:

- generated target matrix;
- multi-seed Monte Carlo;
- method-family coverage;
- multiple objectives and price sweeps;
- repeated DEEPEN and cache reuse;
- responsive/accessibility matrix;
- deterministic Markov animation frames;
- performance and memory soak;
- optional multimodal visual review.

## Release-candidate gate

Run all mature phases, the full frozen fixture corpus, production static build, deployed-site smoke, and a manual review of all visual baseline changes.

The separate harness should publish artifacts without committing generated screenshots or traces to `main` by default.

---

# 11. Prioritized Backlog

## P0 — Must be correct before public use

- Complete Phase 2M full-route multi-objective accounting.
- Ensure self-fracture acquisition is never counted as one action.
- Expose multiple executable methods with accurate proof.
- Explain Harvest eligibility/economics.
- Preserve price provenance and stale warnings.
- Close any known Worker/result/UI semantic mismatch.
- Build the external semantic/browser test harness.

## P1 — Must be efficient and understandable

- On-demand method comparison with graph reuse.
- Faster proof/search for common one/two/three-mod targets.
- Share/export/reproducibility.
- Responsive, keyboard, accessibility, and error-state polish.
- Performance/soak automation.

## P2 — Differentiating experience

- Markov Constellation live view.
- Full-screen screensaver/replay mode.
- Saved local craft workspace.
- Price-history and previous-result comparison.
- Optional visual AI reviewer and controlled patch suggestions.

---

# 12. First Concrete Tasks

After the current implementation LLM finishes Phase 2M:

1. Review Phase 2M against its completion gates.
2. Define a serializable `MethodFamilySpec` and route-policy signature.
3. Add on-demand family solves for Open, Conventional, Harvest, and each self-fracture target.
4. Add full-route method comparison cards and “why not selected?” explanations.
5. Add exportable result/diagnostic JSON.
6. Create the standalone `quality-lab/` package.
7. Implement black-box Worker event capture and semantic UI/result comparison.
8. Add the deterministic fixture corpus and adaptive scenario planner.
9. Add visual/layout/accessibility/performance oracles.
10. Use harness findings to complete proof/performance hardening.
11. Freeze the visualization event/replay contract.
12. Build and test Markov Constellation.
13. Finish pricing/share/export work.
14. Run the release-candidate scorecard and public beta.

---

# 13. Final Release Scorecard

## Solver

- [ ] Every selected route is proper, absorbing, converged, and reconciled.
- [ ] Cheapest, practical fastest/fewest-actions, and balanced objectives are proof-honest.
- [ ] Full acquisition/downstream metrics reconcile.
- [ ] Major method families are discoverable on demand.
- [ ] Harvest and fracture explanations are accurate.
- [ ] No hardcoded target, route, or winner.
- [ ] No market-fractured purchase in normal ranking.
- [ ] No unsupported bench mechanics.

## Performance

- [ ] Simple and common searches meet reference budgets.
- [ ] Complex searches return first useful results within browser guard where reachable.
- [ ] Retry Deeper reuses work.
- [ ] Cancellation and Worker recovery pass.
- [ ] Session and memory growth are bounded.
- [ ] Visualization overhead is within 5%.

## User experience

- [ ] Main result is understandable without Advanced.
- [ ] Chronological instructions are compact and branch-aware.
- [ ] Multiple method cards show cost/actions/time/proof.
- [ ] Why-not-selected explanations exist.
- [ ] Share/export/replay works.
- [ ] Pricing freshness and overrides are clear.
- [ ] 320px, desktop, keyboard, screen-reader, and reduced-motion paths pass.
- [ ] Markov Constellation is attractive, truthful, smooth, and optional.

## Quality

- [ ] Phase diagnostics pass.
- [ ] Actual production Worker/browser smokes pass.
- [ ] Quality Lab semantic, layout, visual, accessibility, and performance gates pass.
- [ ] Nightly generated matrix is healthy.
- [ ] Visual changes were explicitly reviewed.
- [ ] No P0/P1 defect remains.
- [ ] Build, lint, and diff checks pass.
- [ ] Unit tests added/run: NO unless the user explicitly changes this constraint.

## Release

- [ ] Known limitations are visible in product and documentation.
- [ ] App/mechanics/price versions are reproducible.
- [ ] Deployment and rollback are tested.
- [ ] Beta feedback path exists.
- [ ] Public beta release is tagged.

---

# Final Principle

> The application is finished when it does not merely produce a number. It produces a trustworthy set of executable choices, explains the tradeoffs, remains responsive and reproducible, proves what it can, admits what it cannot, and makes the underlying search beautiful enough that users enjoy watching it think.
