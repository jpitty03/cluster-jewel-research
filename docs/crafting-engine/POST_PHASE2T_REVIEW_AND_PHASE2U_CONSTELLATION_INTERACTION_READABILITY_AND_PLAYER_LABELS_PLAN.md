# Post-Phase 2T Review and Phase 2U Plan

## Phase 2U — Markov Constellation Interaction, Readability, and Player-Facing Modifier Vocabulary

Baseline reviewed: `d8e5e22a93ceac355d8547910b224f01fc73d711` on `main`.

Primary real-browser evidence reviewed:

```text
4-mod-initial(4).pdf
```

Exact observed fixture:

- Large Cluster Jewel;
- `10% increased Attack Damage`;
- item level 84;
- 12 passives;
- final rarity Rare;
- extra affixes allowed;
- T1 Intelligence;
- T1 All Attributes;
- T1 increased Effect;
- T1 Maximum Energy Shield;
- Allflame bundled price snapshot;
- resumed search with 30,753 retained states.

No unit tests are to be added or run unless the user explicitly changes the existing project constraint.

---

# 1. Review Verdict

Phase 2T is **CLOSED / PASS** for its stated truthfulness and real-browser scope.

The Phase 2T implementation successfully corrected the major release-evidence problems identified after Phase 2S:

- the Quality Lab now runs the built application through real Playwright Chromium rather than accepting synthetic fallbacks;
- the real module Worker, progress stream, cancellation, host guard, replacement, and result path are exercised;
- CI validation blocks Pages deployment;
- proof wording is scoped to resolved alternatives;
- Harvest now has an explicit lifecycle such as `ENABLED_NOT_SEARCHED` or `ENABLED_UNRESOLVED`;
- advertised method families distinguish independent solves from summaries and unsearched families;
- acquisition and downstream materials are displayed as additive, non-overlapping scopes;
- the application is labeled **Browser-Verified Release Candidate 2T.1**, not fully certified public beta.

The attached result confirms those corrections in the real UI. The selected route is presented as provisional, unresolved competitors remain visible, Harvest is enabled but not yet independently searched, method-family evidence is explicit, and the material scopes reconcile to the full route.

Phase 2U must **not** reopen or redesign the solver, proof model, full-route accounting, method-family architecture, or real-browser release harness. It is a focused player-facing UX and visualization hardening phase.

---

# 2. Findings Requiring Phase 2U

## 2.1 The canvas advertises dragging but does not implement panning

The stylesheet gives the canvas:

```css
cursor: grab;
```

but the component currently handles only hover and click on the canvas. It has no pointer-down, pointer-move drag state, pointer capture, pan offset, or pointer-up/cancel handling.

This produces a false interaction affordance: the user sees a grab cursor, drags, and nothing happens.

## 2.2 The selected route is visually unreadable

The real screenshot shows the selected route's labels and action sublabels colliding across the center of the canvas.

The current drawing behavior contributes directly:

- route steps are squeezed into a fixed-width graph;
- long step titles are drawn as one line;
- action lists are joined into long one-line sublabels;
- selected-route labels are rendered even when the collision detector reports a collision;
- labels use small fixed 12px/10px canvas fonts;
- full detail is duplicated both on the canvas and in the bottom step rail.

The canvas should communicate the route shape at a glance. It should not try to print the complete craft guide on top of the graph.

## 2.3 Raw internal modifier IDs still leak into the player surface

The acquisition cards display strings such as:

```text
AfflictionJewelSmallPassivesHaveIncreasedEffect2
AfflictionJewelSmallPassivesGrantES3
AfflictionJewelSmallPassivesGrantAttributes3
AfflictionJewelSmallPassivesGrantInt3
```

Those IDs are useful for exact identity, diagnostics, exports, and bug reports. They are not useful as the default player-facing modifier label.

The immediate source is that the progress candidate's `targetModName` is produced through `describeModRequirement(...)`, and that helper intentionally appends the exact `modId` to its technical description.

## 2.4 Internal affix names are also not the preferred primary vocabulary

Names such as:

```text
Powerful
Glowing
of the Meteor
of the Prodigy
```

are valid internal affix names, but the preferred player vocabulary is the actual stat granted, matching Target Summary and the modifier picker.

Examples:

```text
Added Small Passive Skills have 35% increased Effect (T1)
Added Small Passive Skills also grant: +(10–12) to Maximum Energy Shield (T1)
Added Small Passive Skills also grant: +4 to All Attributes (T1)
Added Small Passive Skills also grant: +(6–8) to Intelligence (T1)
```

For compact spaces, use a controlled short form such as:

```text
35% increased Effect (T1)
+10–12 Maximum Energy Shield (T1)
+4 All Attributes (T1)
+6–8 Intelligence (T1)
```

The internal affix name and exact ID may remain under a Technical details disclosure.

## 2.5 The public vocabulary is not centralized

Target Summary and the modifier picker already use player-friendly text, while Search Activity, method-family titles, milestones, route names, and Constellation nodes can use affix names or raw IDs.

Phase 2U must introduce one authoritative display descriptor rather than fixing each string independently.

---

# 3. Scope and Non-Scope

## In scope

- player-facing modifier display contract;
- public/technical vocabulary separation;
- Search Activity candidate labels;
- selected route and milestone labels;
- self-fracture method-family labels;
- Constellation node and detail labels;
- real pointer/touch panning;
- pointer-centered wheel zoom;
- keyboard camera controls;
- fit selected route / fit all / reset view;
- label layout and level-of-detail behavior;
- bottom route rail cleanup;
- mobile and fullscreen interaction;
- real Playwright interaction and screenshot gates;
- release-version update after all gates pass.

## Out of scope

- changing modifier weights or transition probabilities;
- changing Harvest mechanics;
- changing self-fracture economics;
- changing acquisition proof semantics;
- changing method-family search semantics;
- adding new crafting mechanics;
- weakening canonical identity;
- replacing exact IDs inside exports, Worker contracts, diagnostics, or Advanced technical evidence;
- adding unit tests.

---

# 4. Authoritative Player Modifier Display Contract

## 4.1 Introduce a shared display descriptor

Create a serializable shared type, conceptually:

```typescript
interface ModifierDisplayDescriptor {
  modId: string;
  primaryText: string;
  compactText: string;
  tier: number;
  tierLabel: string;
  genType: 'Prefix' | 'Suffix';
  requiredItemLevel: number;
  internalAffixName: string;
  technicalText: string;
}
```

Recommended semantics:

- ordinary modifier `primaryText`: `statText + (T#)`;
- notable `primaryText`: notable name;
- `compactText`: a conservative shortened stat label for constrained cards/canvas;
- `internalAffixName`: `Powerful`, `Glowing`, `of the Meteor`, etc.;
- `technicalText`: internal affix name plus exact `modId` and exclusion group where useful.

The exact `modId` remains authoritative identity. The display descriptor never replaces or mutates it.

## 4.2 One resolver

Add one shared resolver that receives the exact pool/repository modifier and produces this descriptor.

Do not use `describeModRequirement(...)` for public labels. Keep it as a technical/debug description function.

For a requirement that lacks an exact ID, the resolver may fall back in this order:

1. exact matching modifier from the eligible pool;
2. provided requirement name;
3. mod group;
4. clearly labeled technical fallback.

A fallback must never silently imply a different exact target.

## 4.3 Duplicate visible text

When two exact modifiers share the same visible stat text, disambiguate the default UI with player-relevant metadata first:

```text
Prefix · T1 · ilvl 84
Suffix · T1 · ilvl 84
```

Do not expose the raw ID merely to solve a layout collision. Exact ID belongs in Technical details.

## 4.4 Public surfaces that must use the descriptor

At minimum:

- Target Summary;
- selected route label;
- recommended starting point;
- Search Activity acquisition cards;
- milestone feed;
- Method Portfolio family title/badge;
- self-fracture and fracture+Harvest family titles;
- Constellation nodes, tooltips, and selected-node detail;
- chronological acquisition step;
- accessible Constellation node controls;
- copied playbook and shopping-list headings;
- share/reload confirmation copy.

## 4.5 Technical surfaces that retain exact identity

- Technical modifier details;
- Advanced optimizer details;
- exact policy branch/debug state;
- Worker result JSON;
- exported setup JSON;
- bug-report bundle;
- Quality Lab evidence;
- diagnostics.

## 4.6 No raw-ID leakage gate

When Advanced technical details are closed, the public visible page for the exact four-mod fixture must not expose a visible string matching:

```regex
\bAfflictionJewel[A-Za-z0-9_]+\b
```

Opening Technical details must reveal the exact ID, proving identity was preserved rather than deleted.

---

# 5. Constellation Camera Model

## 5.1 Separate fit transform from user camera transform

Use a stable camera model, conceptually:

```typescript
interface ConstellationCamera {
  panX: number;
  panY: number;
  zoom: number;
  fitMode: 'SELECTED_ROUTE' | 'ALL' | 'MANUAL';
}
```

The final canvas transform is:

```text
base fit transform
+ user pan
+ user zoom
```

Do not bake pan offsets into graph node coordinates.

## 5.2 Real pointer panning

Use Pointer Events rather than mouse-only events:

- `pointerdown`;
- `setPointerCapture(pointerId)`;
- `pointermove`;
- `pointerup`;
- `pointercancel`;
- `lostpointercapture`.

Requirements:

- mouse, touch, and pen use the same implementation;
- the background and nodes may initiate a pan;
- a movement threshold distinguishes click from drag;
- dragging must not accidentally select a node;
- cursor is `grab` when idle and `grabbing` while dragging;
- dragging updates continuously without waiting for animation frames from the solver;
- camera interaction never changes graph semantics or optimizer state.

## 5.3 Pointer-centered wheel zoom

Wheel zoom must keep the graph point under the pointer stable while zoom changes.

Requirements:

- clamp zoom to a documented range, such as `0.35x–5x`;
- prevent page scroll only while the pointer is over the canvas and the zoom gesture is being handled;
- trackpads and mouse wheels behave smoothly;
- zoom buttons and wheel use the same camera update path.

## 5.4 Touch behavior

- set `touch-action: none` on the interactive canvas surface;
- one-finger drag pans;
- optional pinch zoom is desirable but not required for Phase 2U if one-finger pan and explicit zoom buttons work correctly;
- dragging inside the canvas must not scroll the page;
- outside the canvas, ordinary page scrolling remains intact.

## 5.5 Camera controls

Provide explicit controls:

```text
Route Focus
Fit All
Reset View
Zoom Out
Zoom In
```

Suggested semantics:

- `Route Focus`: fit selected route and set `fitMode=SELECTED_ROUTE`;
- `Fit All`: fit selected and alternative families;
- `Reset View`: reset pan and zoom to the current fit mode;
- a manual pan/zoom changes `fitMode` to `MANUAL`;
- graph identity changes reset safely to Route Focus unless the current camera can be proven compatible.

## 5.6 Keyboard access

Make the canvas region focusable.

Support:

- arrow keys: pan;
- `+` / `=`: zoom in;
- `-`: zoom out;
- `0`: reset view;
- `F`: route focus;
- `A`: fit all;
- `Escape`: clear selected node/details.

Expose concise instructions through `aria-describedby` and the Guide/FAQ.

---

# 6. Constellation Readability Architecture

## 6.1 Canvas for motion; DOM overlay for text and interaction

Preferred Phase 2U architecture:

```text
Canvas:
  background, stars, curves, nodes, glow, wisps

DOM overlay:
  node labels, selected-node details, accessible hit targets
```

There are only a small number of macro nodes, so DOM labels are affordable and give major benefits:

- proper text wrapping;
- CSS font scaling;
- measurable bounding boxes;
- reliable collision assertions in Playwright;
- better accessibility;
- easier hover/focus states;
- no blurry text at high device-pixel ratios.

If canvas text is retained, the implementation must still meet every collision, wrapping, and browser-measurability gate below.

## 6.2 Reduce the default label payload

The canvas should not render full action lists as persistent sublabels.

Default selected-route node examples:

```text
1  Fracture Base
2  Make Magic
3  Roll Target
4  Fill Magic
5  Promote
6  Finish Missing Target
7  Recover
8  Complete
```

On hover, focus, or selection, show:

- full step title;
- full human-readable target/modifier name;
- selected action names;
- expected visits/actions;
- phase;
- recovery destination;
- proof/status where relevant.

## 6.3 Level of detail by zoom

Recommended behavior:

- low zoom: start, terminal, active node, and short step numbers only;
- normal zoom: compact labels for selected route plus important alternatives;
- high zoom: compact sublabels and edge action labels;
- hover/focus/selection: always show full detail regardless of zoom.

## 6.4 Label placement

Use a deterministic priority and placement algorithm.

Priority order:

1. selected/keyboard-focused node;
2. active replay node;
3. hovered node;
4. start and terminal;
5. selected-route nodes;
6. unresolved alternatives;
7. dominated alternatives.

Try candidate positions around each node:

```text
above
below
upper-left
upper-right
lower-left
lower-right
```

Choose the first in-bounds non-overlapping position. If no placement fits:

- show the short label only;
- hide the lower-priority sublabel;
- never draw multiple full labels on top of each other.

Selected-route status must not bypass collision prevention.

## 6.5 Wrapping and contrast

- label text wraps to a controlled maximum width;
- no label is a single unbounded line;
- use a translucent dark backing/pill behind text;
- use high-contrast text and a subtle outline/shadow;
- normal text should be at least visually equivalent to 13–14 CSS pixels at default zoom;
- terminal and active labels may be larger;
- do not depend on glow alone for readability.

## 6.6 Give the graph enough coordinate space

Do not squeeze every plan into a fixed 1,000-unit route width.

Derive graph width from route complexity, for example:

```text
minimum step spacing × number of selected-route nodes
+ side margins
+ alternative-family lanes
```

The camera will fit the wider graph initially. The user can then pan and zoom naturally.

Alternative families should occupy dedicated lanes/rows rather than clustering beneath the selected route.

## 6.7 Edge labels

Do not permanently draw every edge action label.

Show full edge/action details only when:

- its source/target is selected;
- the edge is hovered/focused through an associated control;
- replay reaches that edge;
- the user enables an Advanced labels toggle.

## 6.8 Bottom route rail

The current bottom rail repeats long instructions and becomes a wide horizontal strip.

Clean it up to show concise step chips:

```text
1 Fracture
2 Transmute
3 Alter
4 Augment
5 Regal
6 Finish
7 Recover
8 Complete
```

Requirements:

- active replay step scrolls into view;
- scroll snapping is allowed;
- no multi-sentence instruction inside a rail chip;
- full detail remains in the selected-node panel and normal How to craft section;
- the rail may be collapsible in Explorer and hidden by default in Screensaver mode.

## 6.9 Selected-node detail panel

Provide a stable panel or popover containing:

- step number and title;
- player-facing modifier/target text;
- phase;
- actions;
- expected visits/actions/time where available;
- incoming/outgoing transitions;
- recovery target;
- route status;
- Technical details disclosure with internal affix name and exact ID if applicable.

Do not force the user to read tiny text directly on the graph.

---

# 7. Screensaver and Explorer Behavior

## Replay

- route focus is the default;
- active step is centered only when necessary, using smooth camera easing rather than jumping;
- manual pan pauses automatic camera following until Route Focus is pressed again.

## Explorer

- pan/zoom is always available;
- click/select nodes for details;
- alternatives are visible through Fit All;
- selected route remains visually primary.

## Screensaver

- canvas fills available fullscreen space;
- no grab cursor unless interaction controls are shown;
- controls and route rail auto-hide after inactivity and reappear on pointer/keyboard input;
- manual interaction exits or pauses automatic camera drift;
- no solver work is started automatically;
- reduced motion produces a static, attractive overview.

---

# 8. Exact Four-Mod Phase 2U Fixture

Use the attached exact fixture as the primary regression.

Required public labels include:

```text
35% increased Effect (T1)
+10–12 Maximum Energy Shield (T1)
+4 All Attributes (T1)
+6–8 Intelligence (T1)
```

The Search Activity cards must not display:

```text
AfflictionJewelSmallPassivesHaveIncreasedEffect2
AfflictionJewelSmallPassivesGrantES3
AfflictionJewelSmallPassivesGrantAttributes3
AfflictionJewelSmallPassivesGrantInt3
```

The selected route may be any route produced by the solver. Phase 2U must not assert that Intelligence, Attributes, Effect, or ES is the correct fracture winner.

The exact result economics, proof, method-family states, full-route material accounting, Worker result, and Retry Deeper behavior must remain equivalent to Phase 2T within numerical tolerance.

---

# 9. Required Diagnostics and Browser Gates

## U1 — Phase 2T preservation

Run the mature Phase 2E–2T diagnostics and the strict no-fallback browser release gate.

Acceptance:

- no solver result or accounting regression;
- no proof-language regression;
- no simulated browser fallback;
- CI deploy remains blocked on validation.

## U2 — Display descriptor identity

For ordinary mods, notables, duplicate labels, and all four exact fixture targets:

- player text is correct;
- compact text is correct;
- exact ID is preserved;
- tier, generation type, and ilvl are correct;
- duplicate labels remain distinguishable without exposing raw ID by default.

## U3 — No public raw-ID leakage

With Advanced details and Technical modifier disclosures closed:

- visible public text contains no `AfflictionJewel...` token;
- Search Activity, Method Portfolio, Constellation, playbook, and route summary use player labels.

After opening Technical details:

- exact IDs are present and correct.

## U4 — Public vocabulary consistency

For every four-mod target, compare the visible text across:

- target picker;
- Target Summary;
- acquisition card;
- method-family title;
- selected route/start;
- Constellation node/details;
- craft plan;
- copied playbook.

All use the same descriptor vocabulary and exact target identity.

## U5 — Mouse drag/pan

In real Playwright Chromium:

- pointer down on the canvas;
- drag at least 120 CSS pixels;
- verify a known node's screen coordinate changes by the camera delta;
- verify cursor changes `grab → grabbing → grab`;
- verify no node click fires from the drag;
- verify the page itself does not scroll.

## U6 — Touch pan

At 390px viewport with a touch-capable context:

- drag the canvas with one pointer;
- verify camera movement;
- verify page scroll is suppressed only during canvas interaction;
- verify ordinary page scrolling still works outside the canvas.

## U7 — Pointer-centered wheel zoom

- record a graph point under the cursor;
- wheel zoom in and out;
- verify the point remains approximately anchored;
- verify zoom clamps;
- verify no NaN/infinite camera state;
- verify zoom buttons use equivalent state updates.

## U8 — Fit and reset controls

Verify:

- Route Focus frames every selected-route node;
- Fit All frames every node;
- manual pan changes to manual state;
- Reset View clears pan/zoom without changing graph data;
- graph replacement safely resets camera.

## U9 — Keyboard camera controls

Keyboard-only:

- focus the visualization;
- pan with arrows;
- zoom with +/-;
- reset with 0;
- route focus and fit all;
- select and clear node details;
- no focus trap.

## U10 — Label collision and readability

Use deterministic mode and a frozen viewport.

If DOM labels are used:

- measure every visible label rectangle;
- assert no intersections beyond a small declared tolerance;
- assert all labels remain inside the visible graph region;
- assert minimum computed font sizes and contrast classes.

If canvas labels remain:

- capture deterministic frames;
- use the real visual oracle plus documented layout telemetry;
- prove selected-route labels no longer overlap;
- do not certify from serialized graph geometry alone.

## U11 — Long-label stress

Use the exact four-mod route and intentionally long method-family explanations.

Acceptance:

- labels wrap or abbreviate;
- no text crosses node/card boundaries;
- no document-level horizontal overflow;
- fullscreen and 390px modes remain readable.

## U12 — Route rail

- concise labels only;
- active step scrolls into view;
- no giant instruction block inside rail chips;
- rail is hidden/collapsed appropriately in Screensaver;
- full detail remains available elsewhere.

## U13 — Reduced motion and screensaver

- reduced motion stops moving wisps and automatic camera movement;
- labels remain readable;
- fullscreen entry/exit works;
- controls auto-hide/reappear only in Screensaver;
- five-minute soak has no meaningful canvas/listener/memory growth.

## U14 — Visual regression evidence

Commit stable real-browser evidence for:

- desktop Route Focus;
- desktop Fit All;
- post-pan state;
- selected-node details;
- 390px touch layout;
- fullscreen Screensaver;
- reduced-motion frame.

Do not commit transient traces/videos unless intentionally selected as stable evidence.

## U15 — Performance

Measure Constellation disabled vs enabled and idle vs active interaction.

Acceptance:

- solver/Worker result semantics identical;
- median optimizer overhead remains within the existing 5% gate;
- pan/zoom stays responsive during replay;
- no long main-thread stalls attributable to label layout under normal graph sizes.

## U16 — CI and release gate

The blocking Pages workflow must run:

- build;
- lint;
- diff check;
- mature diagnostics;
- no-fallback probe;
- Phase 2T real release matrix;
- Phase 2U interaction/label/readability matrix.

A failed panning, raw-ID leakage, label collision, or visual gate must prevent deployment.

## U17 — Build hygiene

Require:

```text
npm run build
npm run lint
git diff --check
real Playwright release matrix
```

Unit tests added/run: **NO**.

---

# 10. Completion Gates

Phase 2U closes only when:

- Phase 2T remains fully passing;
- grab cursor corresponds to real pan behavior;
- mouse, touch, wheel, buttons, and keyboard camera controls work;
- click and drag are correctly distinguished;
- Route Focus, Fit All, and Reset View are accurate;
- selected-route labels do not overlap;
- long action lists are removed from persistent canvas labels;
- the Constellation remains understandable at default zoom;
- player-facing modifier text matches Target Summary vocabulary;
- raw `AfflictionJewel...` IDs are absent from normal public surfaces;
- exact IDs remain available in Technical/Advanced/export evidence;
- method cards, milestones, route names, and Constellation use the same display descriptor;
- actual Playwright geometry, interaction, screenshots, and canvas pixels pass;
- reduced motion, fullscreen, and screensaver pass;
- visualizer performance remains within budget;
- CI blocks deploy on failure;
- no mechanics probabilities changed;
- no hardcoded fracture target/winner added;
- no state identity weakened;
- no pre-fractured market ranking added;
- no unit tests added or run.

---

# 11. Required Completion Report

Create:

```text
docs/crafting-engine/PHASE2U_CONSTELLATION_INTERACTION_READABILITY_AND_PLAYER_LABELS_COMPLETION_REPORT.md
```

Include at minimum:

1. implementation commit;
2. files changed;
3. Phase 2T preservation matrix;
4. player display descriptor contract;
5. exact ID preservation evidence;
6. public no-ID-leakage evidence;
7. exact four-mod vocabulary table across UI surfaces;
8. camera state model;
9. pointer capture and click-vs-drag behavior;
10. touch behavior;
11. wheel anchor mathematics;
12. keyboard controls;
13. Route Focus / Fit All / Reset behavior;
14. label rendering architecture;
15. collision-layout evidence;
16. long-label stress screenshots;
17. route-rail cleanup;
18. selected-node detail behavior;
19. fullscreen/screensaver behavior;
20. reduced-motion behavior;
21. five-minute memory/animation soak;
22. real Playwright screenshots and interaction evidence;
23. visualizer performance comparison;
24. CI run and deployment status;
25. build/lint/diff results;
26. release label/version;
27. unit tests added/run: expected NO;
28. solver mechanics changed: expected NO;
29. hardcoded route winner added: expected NO;
30. remaining known UX or optimizer limitations.

---

# Final Phase 2U Principle

> **The optimizer may retain exact technical identity internally, but the normal player experience should speak in the same stat language the game uses. The Constellation should invite dragging and exploration only when those interactions are real, and its beauty must never come at the cost of readability.**
