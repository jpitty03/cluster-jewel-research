# Post-Phase 3K Field Review and Phase 3L Plan

## UI Reliability, Crafting Constellation Readability, and Print Fidelity

Status: **READY FOR IMPLEMENTATION**

Authoritative baseline: `62aa3574acea8bcb56da4bf0988a40730c8e7a8f` on `main`.

Phase 3K implementation: `79f505bc8b3f1c8ec771c0a4395b5693f325abf4`.

Phase 3K closeout: `62aa3574acea8bcb56da4bf0988a40730c8e7a8f`.

Current release marker: `3K.1`.

Target release marker after implementation: `3L.1`.

This plan is based on a repository review of the Phase 3K implementation, the seven-page field capture `3banger_new.pdf`, and two additional field screenshots showing target-editor failures.

Phase 3K is accepted as the authoritative guided-crafting architecture. Phase 3L is a focused reliability and presentation pass. It must fix two field-blocking editor defects, reduce ambiguity in the player-facing Crafting Constellation, and make print/PDF output faithful without changing solver, mechanic, probability, policy, or certification semantics.

The two editor defects predate the Phase 3K implementation baseline. They were exposed during the post-3K field review and remain release blockers even though they are not regressions caused by the guided constellation work.

---

# 0. Executive Decision

Phase 3K successfully replaced the default 24-card player-rule stack and raw 23-node/49-edge solver graph with one certified player-facing Crafting Constellation. The domain boundary is sound:

- `crafting-engine/src/service/guidedCraftConstellation.ts` owns grouping, routing, and certification;
- React renders the compiled model and does not infer crafting policy;
- exact player rules, PolicyFlow transitions, evidence identities, and fail-closed behavior remain authoritative;
- the technical policy graph remains available under Research diagnostics;
- the closeout Pages workflow succeeded for the final Phase 3K SHA.

The result is materially better than Phase 3J, but field review found two blockers and several presentation defects:

1. the modifier dropdown is clipped and painted underneath the next result card;
2. acceptable-alternative validation leaves a stale global repair error after the form becomes valid;
3. recovery nodes reuse main-stage numbers;
4. action-distinct connectors can render as visually duplicate labels;
5. all stage previews and connectors render simultaneously, making the supposedly compact guide span several pages;
6. print/PDF pagination can split and overlap a crafting stage;
7. expected-value currency quantities read like literal purchase quantities;
8. provisional acquisition warnings are not carried consistently into copied or shopping-oriented actions.

Phase 3L closes those issues. It does not redesign the crafting engine.

---

# 1. Immutable Phase 3K Contract

The following behavior is authoritative and must remain unchanged unless an implementation finding proves a defect with exact evidence.

## 1.1 Frozen field reconciliation

The primary field witness remains:

| Evidence | Frozen value |
| --- | ---: |
| Positive policy rows | 267 |
| Certified player rules | 24 |
| Exact actionable states | 572 |
| Expected visits | `740.8471930308734` |
| Raw PolicyFlow nodes / edges | 23 / 49 |
| Guided nodes / edges | 9 / 17 |
| Guided evidence-map entries | 69 |
| Authoritative terminal edges | 2 |

Every Phase 3K fail-closed condition remains binding. Phase 3L must not guess a node, edge, action, recovery, or finish condition.

## 1.2 Frozen architecture

Phase 3L must retain:

- engine-owned guided compilation;
- exact evidence on nodes, condition rows, action choices, and edges;
- one selected explanatory stage without automatic craft progression;
- the visible top-level Crafting Constellation;
- Research diagnostics and the closed-by-default Technical policy graph;
- full share, export, playbook, bug-report, and evidence identity;
- all Phase 3K compiler reconciliation and withheld behavior.

## 1.3 Explicit non-goals

Phase 3L must not add or change:

- crafting mechanics;
- state generation;
- probabilities or currency rates;
- policy solving or ranking;
- acquisition synthesis;
- search budgets or stopping rules;
- current-item parsing or a live tracker;
- automatic stage completion;
- route-start reset behavior;
- item simulation;
- Archify, iframe, or diagram runtime integration.

Presentation changes must not move policy inference into React.

---

# 2. Field Finding A: Modifier Dropdown Is Clipped

Priority: **P0 - field-blocking interaction defect**

## 2.1 Observed behavior

Inside the expanded Edit target disclosure, opening a `SearchableModifierSelect` near the bottom of the Acceptable alternative modifiers card displays only the top portion of the options list. The following Target summary card paints over the popup. The user cannot reliably inspect or select covered options.

Increasing `z-index` on the selector does not fix the defect.

## 2.2 Root cause

The popup is currently rendered as an absolutely positioned descendant:

- `src/SearchableModifierSelect.tsx` renders `.searchable-dropdown-popup` inside `.searchable-modifier-select`;
- `src/App.css` gives the popup `position: absolute`;
- `.searchable-modifier-select.open` and the popup receive high stacking values;
- the ancestor `.optimizer-disclosure` uses `overflow: clip`.

An element cannot escape an ancestor clipping boundary through `z-index`. The popup is structurally unable to overlay adjacent cards while it remains inside the disclosure.

## 2.3 Required implementation

Render the open popup through a React portal attached to `document.body`.

The implementation must:

1. preserve the existing trigger in normal document flow;
2. render the listbox through `createPortal`;
3. use `position: fixed` for the portaled surface;
4. measure the trigger with `getBoundingClientRect()`;
5. match the popup width to the trigger unless viewport clamping requires a smaller width;
6. use a small viewport margin on every side;
7. choose upward or downward placement from actual available space and the configured popup height;
8. recompute placement on open, capture-phase scroll, resize, and meaningful popup-size changes;
9. avoid a visible one-frame jump by measuring in a layout-safe phase;
10. keep the popup above cards, disclosures, sticky regions, and ordinary page content;
11. retain the current search, categories, disabled states, mouse behavior, and keyboard behavior.

A selective `overflow: visible` rule may be used only as an independently justified fallback. It is not the primary fix because it remains vulnerable to future containing blocks and stacking contexts.

## 2.4 Event and focus requirements

Portaling changes DOM containment. The current outside-click check only tests `containerRef.current.contains(event.target)`. After portaling, a click inside the popup would look like an outside click.

Add a popup ref and treat an event as outside only when it is contained by neither:

- the trigger/container subtree; nor
- the portaled popup subtree.

Retain:

- listbox and combobox roles;
- `aria-controls`;
- `aria-activedescendant`;
- Arrow Up/Down, Home, End, Enter, and Escape behavior;
- focus transfer to the search input;
- focus return to the trigger after selection or Escape;
- accessible disabled and selected option semantics;
- the live matching-count announcement.

## 2.5 Geometry requirements

The popup must remain usable when:

- the trigger is near the bottom of the viewport;
- the trigger is near the top of the viewport;
- the page scrolls while the popup is open;
- an ancestor scroll container moves;
- browser zoom is not 100 percent;
- the viewport is narrow;
- the popup has zero matches;
- categories change height as the user searches.

The popup must either reposition continuously or close intentionally on a geometry-invalidating event. It must never remain detached from the trigger.

---

# 3. Field Finding B: Acceptable-Alternative Repair Error Goes Stale

Priority: **P0 - incorrect validation feedback**

## 3.1 Observed behavior

The field screenshot shows:

- acceptable alternatives enabled;
- Martial Prowess selected;
- Heavy Hitter selected;
- one additional blank draft row;
- a global error stating: “The loaded setup needs repair: Choose at least two acceptable alternatives, or disable the acceptable-alternative group.”

Two valid alternatives are already selected. The displayed error is false for the current state.

## 3.2 Root cause

`CraftOptimizer.tsx` correctly derives selected alternatives with:

`acceptableAlternativeModIds.filter(Boolean)`.

It also correctly derives `alternativeSelectionError` when fewer than two selected alternatives exist, except for the explicit decoded-single-alternative compatibility case.

The stale state is created by the repair effect:

1. enabling the group initially produces fewer than two selected alternatives;
2. `validationError` becomes non-null;
3. the effect writes a repair sentence into `importError`;
4. after the second alternative is selected, `validationError` becomes null;
5. the effect returns early;
6. the previously stored `importError` is never cleared.

The blank third row is not the cause. Blank draft rows are already excluded from `selectedAlternativeIds`.

## 3.3 Required implementation

Separate persistent import/hydration failures from current draft validation.

Use distinct concepts:

- `importError`: failures decoding or loading an external JSON/share payload;
- `setupRepairMessage`: a derived message based on the current normalized draft and entry/source context;
- inline target validation: current editor guidance adjacent to the owning control;
- request/runtime errors: failures returned by validation or optimization execution.

The global repair message must not be stored in `importError`.

A current-draft repair message must disappear in the same render cycle in which the form becomes valid. It must not depend on a later effect clearing a string.

## 3.4 Editing behavior

While a user is manually editing acceptable alternatives:

- fewer than two selected alternatives may show the existing inline validation;
- optimization must remain unavailable while the draft is invalid;
- selecting the second distinct valid alternative must clear the inline error and any derived repair banner;
- adding an extra blank row must not make an otherwise valid draft invalid;
- removing a selected alternative so only one remains must restore the inline error;
- disabling the group must remove the error and omit `acceptableAnyOf` from the request;
- duplicate modifier choices must remain disabled;
- required modifiers must remain disabled in the acceptable group.

The phrase “loaded setup needs repair” should be reserved for a setup that arrived invalid from an external load/hydration boundary. Ordinary intermediate manual editing must not be described as damaged imported data.

---

# 4. Field Finding C: Crafting Constellation Readability

Priority: **P1 - player comprehension**

## 4.1 Duplicate stage numbers

The renderer displays `node.displayOrder + 1`. The engine currently uses graph distance for `displayOrder`, so main and recovery nodes at the same distance can both display as stage 4 or stage 6.

That ordering is legitimate for topology but ambiguous as a player step number.

Required behavior:

- primary-lane stages receive one unambiguous sequential player-step label;
- recovery nodes are explicitly labeled as recovery, not as a second ordinary stage with the same number;
- recommended labels are `R1`, `R2`, or a clear “Recovery” badge tied to the source primary stage;
- Finish remains visually terminal and does not require a numeric label.

Do not change certified topology merely to force unique numbers.

## 4.2 Visually duplicate connectors

The compiler intentionally keeps action-distinct edges separate by including `actionId` in the grouping key. The renderer currently shows only the outcome label and destination. Separate actions can therefore appear as duplicate rows such as two instances of “Re-check this stage.”

Required behavior:

- preserve separate certified edges and their evidence;
- include sufficient action context in each visible connector, such as “After Orb of Alteration: Re-check this stage”;
- alternatively provide an engine-owned display grouping that preserves every underlying edge and action identity;
- do not merge action-changing transitions into one ambiguous instruction;
- no two outgoing connector rows from the same node may be visually identical while representing different actions.

## 4.3 Excessive default density

The Phase 3K guide is a successful semantic compression, but the field PDF still devotes roughly three pages to the constellation because every stage renders its preview actions and every connector simultaneously.

Required behavior:

- every stage header remains visible so the whole route can be scanned;
- the selected stage may show its preview action choices;
- unselected stages should use a compact summary rather than the full preview grid;
- the selected WHEN -> USE -> THEN detail remains authoritative;
- recovery branches remain visible and discoverable;
- evidence stays complete in the compiled model even when presentation is compact;
- selection still explains the route and does not track or advance an item.

The ordinary desktop route should be understandable without reading every exact condition or scrolling through a multi-page rulebook.

## 4.4 Selected-stage orientation

When a distant stage such as Finish is selected, the sticky detail panel can remain visible while the selected card is far outside the current viewport.

Add an orientation cue that does not turn selection into progression. Acceptable approaches include:

- a clear selected-stage label in both the rail and detail;
- bringing the selected card into view only when selection originated outside the card;
- a compact route-position indicator;
- a non-modal “Locate stage” action.

Avoid unexpected scroll jumps for ordinary card clicks.

---

# 5. Field Finding D: Print/PDF Fidelity

Priority: **P1 for review artifacts; P2 for ordinary browser use**

## 5.1 Observed behavior

In `3banger_new.pdf`, a constellation stage is split across pages 4 and 5. Content and connector rows visually collide near the page boundary. The sticky two-column layout is not print-safe.

## 5.2 Required print rules

Add a focused `@media print` contract:

- use one column for `.guided-constellation-layout`;
- make `.guided-instruction-detail` non-sticky;
- prevent avoidable breaks inside stage cards, action-choice groups, and tightly coupled connector blocks;
- keep a stage heading with its first action row;
- avoid clipping, overlap, or content painted over the next page;
- preserve readable contrast without relying on background effects unsupported by print;
- keep warning and provisional labels visible;
- avoid printing controls that have no value in static output unless their labels are part of the evidence;
- ensure the final page does not contain accidental layout overflow.

A print stylesheet must not change the normal interactive layout.

---

# 6. Field Finding E: Expected-Value and Provisional Copy

Priority: **P2 - interpretation and trust**

## 6.1 Shopping-list semantics

Fractional quantities such as `574.855 alteration` or `36.403 regal` are expected consumption, not literal purchase quantities.

Required behavior:

- label the on-screen values as expected consumption;
- preserve exact decimals in technical cost/accounting evidence;
- if a purchase-oriented list is offered, distinguish rounded purchase guidance from expected model usage;
- copied text must state whether each quantity is expected, rounded, or exact.

## 6.2 Provisional acquisition state

The reviewed result is executable but not acquisition-safe. The visible lower-bound gap is large.

Required behavior:

- retain the strong recommendation warning;
- carry provisional status into Copy Shopping List and Copy Playbook output;
- do not silently present copied content as the proven cheapest route;
- keep Retry deeper prominent when it is the direct path to improving acquisition confidence;
- do not block an expert from copying an executable provisional route, but make the status impossible to lose in the copied artifact.

No change to acquisition solving is in scope.

---

# 7. Expected File Scope

The implementation is expected to touch a focused set of files.

Likely product files:

- `src/SearchableModifierSelect.tsx`;
- `src/CraftOptimizer.tsx`;
- `src/components/GuidedCraftConstellation.tsx`;
- `src/App.css`;
- copy/export helpers only if required for provisional and expected-value labels.

Likely engine files:

- none for the dropdown or stale validation fixes;
- `crafting-engine/src/service/guidedCraftConstellation.ts` only if an engine-owned display label/group is necessary to avoid moving policy-sensitive grouping into React;
- share or playbook serialization only when required to preserve provisional wording.

Likely Quality Lab files:

- `quality-lab/src/gateRegistry.ts`;
- `quality-lab/src/gateWorker.ts`;
- `quality-lab/src/impactRecommendation.ts`;
- a focused Phase 3L diagnostics module if it matches the existing Phase 3K pattern;
- existing fixture corpus only when a deterministic field fixture is required.

Do not broaden the change into unrelated optimizer restyling.

---

# 8. Quality Lab and Regression Gates

Phase 3L must add focused interaction coverage for the two field bugs. The Phase 3K diagnostics strongly cover compiler evidence, but they do not prove editor overlay geometry or the lifecycle of repair messages.

## L1 - Baseline and scope

Prove:

- implementation starts from the actual latest `main`;
- Phase 3K reconciliation values remain frozen;
- no solver, mechanic, probability, ranking, or acquisition files changed without an independently documented need;
- no current-item tracker or discarded companion behavior was restored.

## L2 - Portaled dropdown ownership

Open a modifier selector inside the target disclosure and prove:

- the listbox exists under the intended portal host;
- it is not a descendant of `.optimizer-disclosure`;
- the trigger still owns it through `aria-controls`;
- the popup width and horizontal alignment match the trigger within a small tolerance;
- the popup is visible above the Target summary card.

## L3 - Occlusion and geometry

For downward and upward opening positions, prove:

- the popup remains inside the viewport margin;
- a point in the portion overlapping the following card resolves to the popup or an option through `document.elementFromPoint`;
- no ancestor clips the popup;
- scroll and resize either reposition the popup or close it intentionally;
- the popup remains attached to the trigger after search filtering changes its height.

## L4 - Dropdown input behavior

Prove:

- search input receives focus;
- Arrow keys, Home, End, Enter, and Escape work;
- selection updates the modifier and returns focus;
- clicking an option in the portal is not treated as an outside click;
- clicking outside closes the popup;
- disabled duplicates cannot be selected;
- behavior remains usable at desktop and narrow widths.

## L5 - Acceptable-alternative lifecycle

Starting from a valid preset:

1. enable acceptable alternatives;
2. observe invalid state with zero selections;
3. select one alternative and retain the inline error;
4. select a second distinct alternative;
5. prove validation and repair messages clear;
6. add a third blank row;
7. prove the draft remains valid;
8. select a third alternative and prove all three branches serialize;
9. remove alternatives until one remains and prove the error returns;
10. disable the group and prove the error clears and `acceptableAnyOf` is omitted.

Also prove a genuinely invalid imported/shared setup receives repair guidance and that a decoding failure remains distinct from current-draft validation.

## L6 - Constellation labels

On the frozen field result, prove:

- primary step labels are unique and sequential;
- recovery nodes are visibly recovery nodes;
- no two outgoing connectors from one node are visually identical while carrying different `actionId` values;
- every connector retains its exact source edge evidence;
- Finish remains reachable only through certified success edges.

## L7 - Compact default route

Prove:

- all guided node headers are visible in the ordinary route;
- only the selected stage exposes the full preview action grid, or an equivalently compact contract is used;
- selecting each stage exposes its exact certified condition picker and WHEN -> USE -> THEN detail;
- no player rule, exact state, or evidence entry is lost from the compiled summary.

Avoid a brittle pixel-perfect height assertion. Use structural assertions plus a reviewed screenshot fixture.

## L8 - Print fidelity

Generate or render the representative route with print media and prove:

- no stage text overlaps another stage or connector;
- stage cards do not split when they fit on a fresh page;
- the detail panel is non-sticky and single-column;
- warnings, Finish, and expected full-route cost remain readable;
- the output has no clipped text or black/empty rendering defects.

## L9 - Frozen Phase 3K evidence

Re-run the Phase 3K direct and Worker reconciliation needed to prove:

- 267 positive policy rows;
- 24 certified player rules;
- 572 exact actionable states;
- expected visits `740.8471930308734`;
- 23/49 raw topology;
- 9/17 guided topology unless an explicitly reviewed presentation-only model version requires a change;
- 69 guided evidence-map entries;
- two authoritative terminal edges;
- fail-closed withheld cases remain empty and diagnostic.

## L10 - Build, release, and deployment

Run the repository-prescribed focused checks, then:

- lint;
- TypeScript build;
- production bundle build;
- focused Phase 3L gates;
- required DEV and RELEASE Quality Lab suites according to the current repository policy;
- GitHub Pages deployment;
- uncached live verification against the exact deployed asset.

Record immutable commit, workflow, job, deployment, and asset identities in the completion report.

---

# 9. Acceptance Criteria

Phase 3L is complete only when all of the following are true.

## Editor reliability

- [ ] The modifier popup renders outside the clipped disclosure.
- [ ] It overlays the Target summary card without being covered.
- [ ] Downward and upward placement remain viewport-safe.
- [ ] Scroll, resize, zoom, search filtering, and narrow layouts remain usable.
- [ ] Portal clicks are not misclassified as outside clicks.
- [ ] Existing keyboard and accessibility behavior is preserved.

## Validation correctness

- [ ] Two selected acceptable alternatives are valid.
- [ ] An additional blank draft row does not invalidate them.
- [ ] The stale global repair banner disappears immediately when valid.
- [ ] Inline validation returns when fewer than two alternatives remain.
- [ ] Import/decode errors and current-draft validation are separate.
- [ ] Disabling alternatives clears the error and request payload.

## Constellation readability

- [ ] Primary stages have unique player-facing labels.
- [ ] Recovery nodes are not presented as duplicate ordinary step numbers.
- [ ] Action-distinct connectors are visibly distinguishable.
- [ ] Unselected stages are compact.
- [ ] Every stage remains discoverable.
- [ ] Exact policy and evidence fidelity remain unchanged.

## Print and copy

- [ ] Printed stages and connectors do not overlap.
- [ ] Print layout is single-column and non-sticky.
- [ ] Expected consumption is not presented as literal exact purchase quantity.
- [ ] Provisional status survives shopping-list and playbook copy.
- [ ] The resulting PDF is visually reviewed page by page.

## Release evidence

- [ ] Frozen Phase 3K reconciliation passes.
- [ ] Focused Phase 3L browser gates pass.
- [ ] Build and release checks pass.
- [ ] Pages deploys the exact implementation SHA.
- [ ] A Phase 3L completion report records immutable evidence.

---

# 10. Recommended Implementation Order

1. Implement the portal and popup geometry contract.
2. Add focused portal interaction/occlusion coverage.
3. Separate import failures from derived draft-repair messaging.
4. Add acceptable-alternative lifecycle coverage.
5. Repair constellation numbering and connector wording.
6. Compact unselected stage previews.
7. Add print rules and rendered-PDF verification.
8. Clarify expected-consumption and provisional copy.
9. Run frozen Phase 3K reconciliation.
10. Run the prescribed build/release/deployment sequence and write the closeout report.

Do not combine the portal fix with broad CSS cleanup. Do not combine validation repair with target-model changes. Keep each finding independently reviewable.

---

# 11. Final Product Directive

Phase 3K remains the certified crafting-guide foundation.

Phase 3L succeeds when the ordinary player can:

- open any modifier dropdown without it being clipped;
- build an acceptable-alternative group without receiving a stale false error;
- scan one unambiguous primary crafting route;
- identify recovery paths without duplicate step numbers;
- understand why visually similar transitions differ;
- print or export the route without overlap;
- distinguish expected usage from literal purchase quantities;
- retain provisional warnings when copying an executable but not-yet-proven recommendation.

If the dropdown is still constrained by the target disclosure, Phase 3L fails.

If a valid two-alternative target can still display the stale repair banner, Phase 3L fails.

If action-distinct edges still look identical to the player, Phase 3L fails.

If print output still splits and overlaps a stage, Phase 3L fails.

Correctness evidence remains mandatory, but the visible product must also behave like a reliable player tool.
