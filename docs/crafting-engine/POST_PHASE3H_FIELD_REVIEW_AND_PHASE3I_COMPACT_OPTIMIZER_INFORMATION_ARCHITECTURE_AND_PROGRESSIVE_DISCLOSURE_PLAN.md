# Post-Phase 3H Field Review and Phase 3I Plan

## Compact Optimizer Information Architecture and Progressive Disclosure

Status: **READY FOR IMPLEMENTATION**

Baseline reviewed: `3126cc9c74978933bb73b78e6307759e552308e0` on `main`.

Phase 3H is **CLOSED / PASS / DEPLOYED**. Its one-way Cluster Jewels handoff detachment, source-value ownership, generic acceptable-alternative wording, separated selected-policy-versus-portfolio proof labels, authoritative search evidence, exact `3 required + any 1 of 3` target semantics, share/export behavior, PolicyFlow, Constellation, and all Phase 3B-3G preservation requirements are permanent.

Phase 3I is a presentation and component-boundary phase. It must make the optimizer substantially calmer and shorter by default while keeping every useful research surface available on demand. It must not change optimizer mechanics, evidence meaning, target identity, ranking, or result data.

No unit tests are to be added or run. Add focused diagnostics and real-browser Quality Lab gates. Run DEV once and RELEASE once. EXTENDED, nightly, long-soak, the legacy 115-gate suite, and legacy release matrices remain withheld unless an implementation finding independently justifies one of them.

---

# 1. Latest-Merge Review and Recommendation

## 1.1 Verdict

Do not roll back or simplify Phase 3H's data contracts. The latest merge is technically strong:

- handoff state is explicit and one-way;
- source-owned and user-owned sale values are distinct;
- detached source context cannot leak into new shares or exports;
- required and acceptable progress remain structurally separate;
- proof and search labels now reflect their authoritative fields;
- the exact field target is validated through the Worker and browser;
- Phase 3E-3G graph, explanation, and compatibility behavior remains intact.

The current problem is information architecture, not engine correctness.

## 1.2 Root cause of the busy page

`src/CraftOptimizer.tsx` currently gives many independently useful surfaces equal top-level visual weight. A normal run can place all of the following into one long vertical page:

1. source handoff banner;
2. Craft target editor;
3. import and help controls;
4. base, cluster, item-level, passive, rarity, and league fields;
5. pricing and optional economics;
6. required and acceptable modifier editors;
7. target summary;
8. optimization objective;
9. search depth and advanced search settings;
10. full Search Activity visualizer, proof meter, candidate graph, and milestone feed;
11. Market vs craft;
12. recommendation hero;
13. search budget evidence;
14. recommendation warnings;
15. multi-objective alternatives;
16. Harvest comparison;
17. crafting-method portfolio;
18. Constellation;
19. craft guide;
20. expected materials and reconciliation;
21. Advanced optimizer details.

Some local details already use `<details>`, but the page still has too many top-level cards. The remedy is not to hide random fields one at a time. Phase 3I must establish a deliberate hierarchy with a compact primary workflow and a small number of named secondary disclosures.

## 1.3 Product recommendation

The default optimizer should answer only three player questions:

```text
1. What craft did I load?
2. What should I click to optimize it?
3. What should I do and buy after it finishes?
```

Everything that answers research questions—why the policy won, how proof progressed, how competing methods compare, how the Markov graph is shaped, and how counters reconcile—must remain available but begin collapsed.

---

# 2. Authoritative Phase 3I Product Contract

## 2.1 Compact-by-default rule

At default disclosure state:

- a fresh optimizer emphasizes importing a craft;
- a valid handoff/share/import emphasizes the loaded target summary and Optimize action;
- the full manual editor is not expanded unless the player chooses to create or edit a target;
- optimization settings show one compact summary, not the full objective/search form;
- running search shows compact status and cancellation/retry actions, not the full research graph;
- a successful result emphasizes recommendation, craft steps, and shopping list;
- comparisons, proof research, PolicyFlow/Constellation, and raw diagnostics begin collapsed.

## 2.2 Preserve, do not delete

Phase 3I must not delete or weaken:

- manual target construction;
- quick presets;
- pricing league and price provenance;
- optional economics;
- objective selection;
- search depth, intent, custom budgets, and fallback controls;
- live search activity and acquisition portfolio evidence;
- market comparison for a still-attached source handoff;
- multi-objective alternatives;
- Harvest comparison;
- crafting-method comparison;
- PolicyFlow and Constellation;
- craft-plan decision details;
- acquisition preparation and downstream usage separation;
- full-route currency totals and reconciliation;
- raw proof, policy health, performance, and acquisition diagnostics;
- copy, share, export, replay, and bug-report actions.

These surfaces move into an intentional disclosure hierarchy. Their data and semantics remain unchanged.

## 2.3 Critical truth must never be hidden

The following must remain visible without opening a disclosure:

- import/validation errors;
- no-route and internal-result-mismatch states;
- stale or fallback pricing when it materially qualifies the recommendation;
- provisional/acquisition-unsafe status;
- selected-policy solve and portfolio optimality at the compact summary level;
- source-market comparison caveat when an attached source listing is shown;
- cancellation and retry/deepen controls while relevant;
- any warning that says the displayed output must not be treated as a valid craft recommendation.

Detailed evidence supporting those statements may be collapsed. The statement itself may not be hidden.

---

# 3. Entry-State Information Architecture

The optimizer must render according to how the player entered it. Do not force every entry state through the same expanded form.

## 3.1 Fresh optimizer

Primary default card:

```text
Import a craft
```

Default-visible actions:

- `Import optimizer JSON`;
- a short sentence explaining that Cluster Jewels can also send a target directly;
- `Build a target manually` as a secondary disclosure/action;
- `Use a preset` as a secondary disclosure/action if presets remain useful.

The full manual form begins closed. Opening `Build a target manually` reveals the existing base/cluster/item-level/passive/rarity/modifier workflow.

Do not show empty result, proof, graph, or research cards on a fresh page.

## 3.2 Attached Cluster Jewels handoff

Keep the Phase 3H attached source strip, but reduce it to one compact contextual row:

- source label;
- source item/price summary;
- `Back to Cluster Jewels`;
- technical handoff details collapsed.

Directly below, show a compact loaded-target summary and the primary Optimize action. The full editor begins closed under `Edit target`.

Any identity-changing edit still performs the Phase 3H one-way detachment before the next render. Opening or closing the editor must never detach.

## 3.3 Share/import loaded target

When a valid share or imported JSON has populated the optimizer:

- show `Loaded target` rather than the entire expanded form;
- render base, cluster type, item level, passives, rarity, extra-affix policy, required modifiers, acceptable alternatives, pricing league, objective, and search preset in a compact summary;
- show validation status only when actionable;
- provide `Edit target` and `Optimization settings` disclosures;
- keep Optimize as the visual primary action.

## 3.4 Invalid or partial import

If an imported payload cannot produce a valid request:

- keep the exact error visible;
- automatically open the smallest relevant repair surface;
- focus or link to the owning field;
- do not open unrelated research panels;
- do not silently discard valid imported fields.

## 3.5 Existing result restored by share/replay

If the product supports restoring a result/evidence snapshot:

- show the compact result hierarchy immediately;
- leave setup summarized;
- preserve authoritative replay/share identity;
- keep research disclosures collapsed unless the restored artifact explicitly represents a presentation-only state under a future reviewed version.

Phase 3I itself must not add disclosure state to canonical share or optimizer fingerprints.

---

# 4. Default-Visible Setup Surface

## 4.1 Compact target summary

Use one summary card with stable rows or chips for:

| Group | Default-visible content |
|---|---|
| Item | Base type and cluster enchantment/type |
| Requirements | Item level, passive count, final rarity, extra-affix policy |
| Required | Count plus player-facing modifier chips/names |
| Acceptable | `Require one of N` plus player-facing modifier chips/names |
| Market | Pricing league and attached/imported price-context indicator |
| Run profile | Objective name and search preset summary |

Exact technical modifier IDs remain under the existing technical details within the editor or diagnostics. Do not expose them in the compact summary.

For the frozen Phase 3G/3H target, the compact summary must communicate:

```text
Large Cluster Jewel · 10% increased Spell Damage · ilvl 84 · 12 passives
Rare · Extra affixes allowed
3 required modifiers · Require any 1 of 3 acceptable alternatives
```

Do not display `4/6` or collapse required and acceptable progress.

## 4.2 Import actions

Place import actions above manual editing:

- `Import optimizer JSON` is the primary fresh-page action;
- if the current import flow uses a modal or file/text entry, preserve its validation and parsing contract;
- successful import replaces the empty entry state with the compact target summary;
- failed import keeps the import surface open with the error;
- duplicate import controls must not appear in both the page header and target card.

## 4.3 Manual target editor disclosure

Move the existing manual fields into one controlled disclosure labeled:

```text
Edit target
```

Within it preserve the current logical order:

1. base and cluster identity;
2. item level, passives, rarity, and extra-affix rule;
3. required modifiers;
4. acceptable alternative toggle and modifiers;
5. concise live target summary/validation.

Avoid a second large `Target summary` card inside the expanded editor if the compact summary already exists above it. Reuse one summary component in compact and editing contexts.

When the player changes a field:

- update the compact summary immediately;
- preserve Phase 3H detachment and sale-value ownership;
- invalidate stale results exactly as today;
- keep the editor open until the player closes it or starts a valid run;
- never treat disclosure interaction as an identity edit.

## 4.4 Optimization settings disclosure

Move these under one collapsed `Optimization settings` section:

- objective;
- constrained budget value when relevant;
- value-of-time inputs;
- search depth preset;
- advanced search intent;
- custom state/time/round limits;
- fallback pricing control;
- optional economics and manual sale value;
- market evidence.

The disclosure summary must show the effective choices, for example:

```text
Cheapest craft · Normal search · Settlers pricing
```

If a non-default or risky setting is active, add a concise badge such as `Custom budget`, `Fallback pricing`, or `Manual sale value`. Do not expand the entire section just to show that status.

## 4.5 Primary action bar

Use one compact action row after the target summary:

- primary: `Find cheapest craft` or the existing objective-correct action label;
- secondary: clear/cancel only when relevant;
- validation error directly adjacent;
- small effective-run summary;
- optional sticky behavior only within the optimizer container and only if it does not cover content on mobile.

Do not duplicate the Optimize button inside both the compact card and expanded editor.

---

# 5. Running-Search Surface

## 5.1 Compact live status

While running, default-visible status should contain only:

- phase/status label;
- progress indicator;
- selected incumbent/route when available;
- current best expected cost when valid;
- a short proof state such as `Still comparing acquisition routes`;
- elapsed/request cap summary;
- Cancel action.

The status must not imply global optimality before proof closes.

## 5.2 Full search research disclosure

Move the current rich `SearchActivityVisualizer` content under:

```text
Search progress & proof details
```

This disclosure contains:

- macro acquisition graph;
- portfolio proof meter and candidate bounds;
- resolved/unresolved family counts;
- retained-state and expansion details;
- milestone feed;
- exact stopping conditions;
- retry/deepen research context.

The compact live status and full visualizer must consume the same authoritative snapshot. Do not compute a second interpretation for the compact view.

## 5.3 Completion transition

On normal completion:

- replace live status with the compact result hierarchy;
- do not auto-open the full search disclosure;
- keep a small `Search completed` summary and the authoritative proof labels;
- preserve Retry deeper when useful.

On no-route, mismatch, or fatal evidence failure:

- keep the critical warning visible;
- automatically open only `Search progress & proof details` when it contains actionable explanation;
- never open comparisons or graphs merely because the run failed.

---

# 6. Default-Visible Result Surface

After a valid run, only three player-facing result groups begin open.

## 6.1 Recommendation

One compact recommendation card shows:

- recommendation status/title;
- selected acquisition/start;

- expected full-route cost;
- expected physical actions;
- selected-policy solve;
- portfolio optimality;
- essential price/proof qualifier;
- expected sale value/profit only when valid under Phase 3H ownership rules;
- Retry deeper when unresolved and useful.

Remove duplicated proof wording from neighboring top-level cards. A fact may have one concise primary presentation and a deeper evidence presentation, not several equal-weight repetitions.

Attached `Market vs craft` content should become a compact subsection of Recommendation or an adjacent collapsed `Market comparison` disclosure. It must remain entirely absent after Phase 3H detachment.

## 6.2 How to craft it

Keep the actionable craft guide open by default. It is the primary product output.

Default-visible content:

- recommended start/acquisition;
- numbered player actions;
- decision branches with concise player-facing conditions;
- expected visits/actions where useful;
- critical recovery instruction;
- `Copy craft steps` action.

Keep per-step `Decision details`, exact states, technical action IDs, and full traceability collapsed locally. Preserve Phase 3F authoritative explanation contexts and real comparable cohorts.

## 6.3 Shopping list

Replace the large default `Expected materials` research card with a concise open shopping list:

- acquisition preparation materials/cost subtotal;
- downstream crafting materials/cost subtotal;
- merged currency totals;
- full-route cost;
- `Copy shopping list` action.

Detailed per-action expected counts, action IDs, and reconciliation evidence move under `Cost & usage details`. Preserve exact additive/non-overlapping accounting and full-route reconciliation.

---

# 7. Secondary Disclosure Architecture

Use a small stable set of top-level disclosures after the primary result.

## 7.1 Search & proof

Label:

```text
Search & proof
```

Collapsed summary badges may show:

- `Resolved policy`;
- `Portfolio not proven` or `Proven`;
- `N unresolved families`;
- stopping condition.

Contents:

- full Search Activity visualizer;
- authoritative per-run/portfolio/retained/cap counters;
- stopping conditions and additional request details;
- proof bounds;
- policy health;
- retry/deepen evidence;
- exact raw proof enums in a nested technical subsection.

## 7.2 Alternative methods

Label:

```text
Alternative methods
```

Collapsed summary may show the number of compared/resolved methods.

Contents:

- multi-objective tradeoffs;
- Harvest crafting comparison;
- crafting-method portfolio;
- acquisition alternatives;
- method policy-equivalence evidence;
- required-action evidence.

Do not show unsearched methods as if they were worse. Preserve the existing provenance/status wording.

## 7.3 Strategy visualization

Label:

```text
Strategy visualization
```

Contents:

- PolicyFlow/Constellation presentation;
- graph help/legend;
- node/edge technical details;
- layout reset/replay controls.

The disclosure interaction must not pan, deselect, reroute, or alter saved graph layout.

## 7.4 Cost & usage details

Label:

```text
Cost & usage details
```

Contents:

- full acquisition action table;
- full downstream action table;
- merged full-route action totals;
- currency totals;
- reconciliation difference;
- exact expected-action usage evidence.

## 7.5 Research diagnostics

Label:

```text
Research diagnostics
```

Contents:

- remaining material from `Advanced optimizer details` not already placed above;
- raw request/result identities;
- cache/fingerprint and continuation evidence;
- acquisition research internals;
- performance and Worker diagnostics;
- craft-plan action audit;
- uncertified exploratory usage, clearly labeled as not a valid estimate;
- export and bug-report tools.

Avoid placing the same table in two disclosures. Refactor existing sections into a single owning destination.

---

# 8. Disclosure Behavior Contract

## 8.1 Controlled accessible disclosure

Create a shared top-level disclosure component rather than styling unrelated `<details>` elements independently.

It must provide:

- semantic button or summary control;
- `aria-expanded` and `aria-controls`;
- keyboard activation;
- visible focus state;
- title, short description, and optional status badges;
- deterministic test identifier;
- no nested interactive element inside an invalid summary target;
- responsive header wrapping.

Native `<details>` may remain for small local technical details. Top-level result architecture should use one consistent controlled pattern.

## 8.2 Default state

Default closed:

- manual editor when a valid target is loaded;
- optimization settings;
- search/proof research;
- alternative methods;
- strategy visualization;
- cost/usage detail tables;
- research diagnostics;
- technical IDs and trace details.

Default open:

- import/start surface on a fresh page;
- compact target summary on a loaded page;
- compact live status while running;
- recommendation, craft steps, and shopping list after a valid result;
- the exact repair surface for an invalid import;
- critical error explanation when no valid recommendation exists.

## 8.3 State lifetime

Disclosure state is presentation-only:

- it must not enter optimizer request fingerprints;
- it must not enter target identity;
- it must not enter share/export/replay payloads;
- it must not detach a Cluster Jewels handoff;
- it must not invalidate a result;
- it must not start or deepen search;
- it may persist only within the current mounted page/session if useful.

Do not add cross-version local-storage schema for disclosure state in Phase 3I unless independently necessary.

## 8.4 Heavy visualization mounting

Constellation and the macro search visualizer may be expensive. They may defer first mount until their disclosure is opened.

After first mount, closing a disclosure must not lose:

- manual node positions;
- edge rerouting;
- selection;
- replay state;
- graph reset semantics;
- Phase 3E layout persistence.

Use keep-mounted-after-first-open behavior or move presentation state above the disclosure boundary. Do not simply unmount the graph on every close.

## 8.5 Search updates

Streaming progress snapshots must not:

- reopen a disclosure the player closed;
- collapse a disclosure the player opened;
- move focus;
- reset scroll position;
- recreate graph state;
- produce layout shift in the compact status beyond its reserved area.

---

# 9. Component Refactor Boundary

`CraftOptimizer.tsx` currently combines orchestration, state, import/export, search progress, target editing, result presentation, comparison cards, graph presentation, and diagnostics in one very large component. Phase 3I may split presentation components while preserving one authoritative controller/data flow.

Recommended boundaries:

```text
CraftOptimizer
  OptimizerEntryPanel
  CompactTargetSummary
  TargetEditorDisclosure
  OptimizationSettingsDisclosure
  CompactSearchStatus
  RecommendationSummary
  CraftGuidePanel
  ShoppingListPanel
  SearchProofDisclosure
  AlternativeMethodsDisclosure
  StrategyVisualizationDisclosure
  CostUsageDisclosure
  ResearchDiagnosticsDisclosure
```

Component extraction rules:

- keep Worker ownership and request lifecycle centralized;
- pass authoritative result/snapshot data downward;
- do not copy domain calculations into child components;
- reuse `proofPresentation()` and `searchEvidencePresentation()`;
- reuse shared target-progress and modifier-label helpers;
- keep Phase 3H detachment handlers centralized;
- preserve copy/export/share payload construction;
- do not change serialization versions for presentation-only refactoring;
- avoid generic abstraction that obscures player-specific copy or evidence ownership.

A shared `OptimizerDisclosure` component is appropriate. A new UI-state framework is not.

---

# 10. Responsive and Visual Density Contract

## 10.1 Desktop

At a representative 1440 × 900 viewport:

- a fresh optimizer should show the import entry and manual/preset alternatives without a long empty form;
- a valid loaded target should show its complete compact summary and Optimize action in the first viewport;
- a completed result should show the recommendation and beginning of the craft guide before research disclosures;
- research cards must not push the primary action/output below unrelated evidence.

Use whitespace to separate workflow stages, not to give every metric its own large card.

## 10.2 Mobile

At 390 × 844 and 420px breakpoints:

- summary rows stack without horizontal scrolling;
- modifier chips wrap;
- disclosure headers remain tappable and readable;
- Optimize/Cancel actions remain reachable and do not cover content;
- tables inside disclosures use the existing responsive strategy or an explicit scroll container;
- graph disclosures do not force the closed page wider than the viewport;
- no nested disclosure control has an undersized touch target.

## 10.3 Visual hierarchy

Use three emphasis levels:

1. primary workflow/output: import, Optimize, recommendation, craft steps;
2. secondary action: edit, settings, shopping list, retry;
3. research: comparisons, proof, visualization, diagnostics.

Do not use warning colors merely to attract attention to optional research. Preserve semantic color meaning.

## 10.4 Reduced motion and focus

- respect reduced-motion preferences for disclosure and progress animation;
- never animate large height changes that cause disorientation;
- maintain logical focus when a panel closes;
- focus the first invalid field only for an explicit repair transition, not on every render;
- preserve text selection and Phase 3F overlay-exclusion behavior.

---

# 11. Result and Data Fidelity

Progressive disclosure must not create a second presentation truth.

## 11.1 One authoritative source per fact

The compact and expanded views may format the same fact differently, but they must read the same authoritative field/helper:

| Fact | Authority |
|---|---|
| Selected-policy solve | `proofPresentation(result)` |
| Portfolio optimality | `proofPresentation(result)` |
| New states expanded | `searchEvidencePresentation(result)` |
| Portfolio states expanded | `searchEvidencePresentation(result)` |
| Retained continuation states | `searchEvidencePresentation(result)` |
| Requested cap | request budget evidence |
| Stop conditions | authoritative primary/secondary stop fields |
| Required/acceptable progress | structured target progress contract |
| Full-route cost | reconciled full-route result |
| Source sale value | Phase 3H ownership-aware input/result |

Do not create compact-view approximations.

## 11.2 Copy/export independence

Copy, share, export, replay, and bug-report output must remain complete regardless of which disclosures have been opened. UI mounting must not determine whether data exists in an artifact.

An unopened diagnostic panel must not omit diagnostics from an export that previously included them.

## 11.3 Warning deduplication

Centralize visible warning selection so the compact result shows one authoritative player-facing warning per issue. Expanded evidence may explain it, but must not introduce contradictory wording.

---

# 12. Compatibility and Preservation Requirements

Phase 3I must preserve:

- Phase 3H attached-to-detached handoff lifecycle;
- source-value provenance and removal contract;
- no automatic reattachment after edit/revert;
- generic acceptable-alternative labels;
- exact `required[3] AND any-one-of-three` semantics;
- required-only byte and share compatibility;
- Phase 3G canonicalization, scenario validation, terminal union, and no double counting;
- Phase 3F craft-plan decision cohorts, preparation/final progress separation, and overlay interaction;
- Phase 3E dragging, saved positions, edge rerouting, replay, and reset;
- Phase 3D budget ledger, request-local incumbent monotonicity, and evidence scopes;
- Phase 3C admissibility and large-SCC behavior;
- Phase 3B mechanics and probabilities;
- market-independent acquisition ranking;
- no hardcoded winners or fixture-specific production paths.

The Phase 3H RELEASE unequal-work HOST_RESERVE finding remains closed under its corrected diagnostic semantics. Do not reintroduce strict incumbent/fingerprint equality for unequal cold-Worker host-reserve work. Retain strict equal-work A/B evidence at deterministic state-capped snapshots.

---

# 13. Quality Lab Phase 3I Contract

Add focused direct and real-browser gates. The identifiers below are acceptance requirements and may be distributed across existing gate files as appropriate.

| Gate | Required proof |
|---|---|
| I1 | Fresh page shows import as primary; manual target editor and research surfaces begin closed |
| I2 | Valid Cluster Jewels handoff shows compact attached strip, loaded-target summary, and Optimize; opening disclosures does not detach |
| I3 | Valid JSON/share import shows the same canonical target in compact summary and full editor |
| I4 | Invalid import visibly opens only the owning repair surface and retains valid imported fields |
| I5 | Identity edit still detaches exactly once; disclosure/edit/settings interactions alone do not detach |
| I6 | Default optimization settings are summarized correctly; non-default/custom/fallback/manual-value badges are truthful |
| I7 | Running search shows compact status; full visualizer is closed by default and maps to the same authoritative snapshot when opened |
| I8 | Normal completion leaves only Recommendation, How to craft it, and Shopping list open among result groups |
| I9 | Critical no-route, mismatch, stale-price, provisional, and acquisition-unsafe truths remain visible without opening research panels |
| I10 | Search & proof, Alternative methods, Strategy visualization, Cost & usage details, and Research diagnostics contain all prior evidence exactly once |
| I11 | Copy/share/export/replay/bug-report payloads are identical whether disclosures were never opened, opened, or closed again |
| I12 | Constellation first-open rendering works; close/reopen preserves layout, selection, rerouting, replay, and reset behavior |
| I13 | Streaming progress does not change disclosure state, focus, scroll ownership, or graph state |
| I14 | Desktop and 390/420px browser views have no horizontal overflow, covered actions, or unusable disclosure headers |
| I15 | Keyboard and screen-reader disclosure semantics expose correct labels, `aria-expanded`, ownership, and focus behavior |
| I16 | Phase 3H handoff/browser gate, Phase 3G exact alternative target gate, Phase 3F overlay/decision evidence, and retained budget-isolation closure remain green |

## 13.1 Browser assertions

The real-browser gate must assert both visibility and preservation:

- `isVisible()` for default primary content;
- not visible/collapsed for secondary research content;
- opening each disclosure reveals its owned evidence;
- closing it restores compact height without losing data;
- full-page scroll height is materially reduced in default state compared with an all-expanded control;
- no console, page, or network errors;
- import, edit, Optimize, cancel, retry, copy, share/export, and graph interactions still work.

Do not use a brittle exact pixel-height requirement. Record viewport, default scroll height, expanded scroll height, and top-level open/closed counts as diagnostic evidence, with semantic thresholds such as default height being strictly and materially smaller.

## 13.2 Required negative controls

Prove that:

- a disclosure click cannot enter the Phase 3H detachment path;
- lazy rendering cannot omit export/share/bug-report data;
- closing Strategy visualization cannot erase Phase 3E layout;
- compact proof text cannot claim global proof from selected-policy resolution;
- hidden comparisons do not stop being searched or ranked;
- collapsed diagnostics do not change Worker requests, cache keys, result fingerprints, or budgets;
- DOM/test refactoring does not weaken retained gates simply because content is now collapsed.

---

# 14. Execution Order

## 14.1 Pre-edit

1. Pull `origin/main` and verify `3126cc9c74978933bb73b78e6307759e552308e0` or document any newer baseline.
2. Read this plan in full.
3. Read the Phase 3H plan and completion report in full.
4. Inventory every current `CraftOptimizer.tsx` top-level section, copy/export dependency, selector, and Quality Lab assertion.
5. Capture before-state desktop and mobile DOM/scroll evidence.
6. Run the impact recommendation command and record its selected gates.

## 14.2 Implementation sequence

1. Add the shared accessible `OptimizerDisclosure` primitive and direct gate.
2. Extract compact target summary and entry-state panels without changing form state.
3. Move manual target and optimization settings into controlled disclosures.
4. Add compact running-search status backed by existing presentation helpers.
5. Recompose results into Recommendation, How to craft it, and Shopping list.
6. Move existing secondary sections into their single owning disclosures.
7. Implement heavy-graph first-open/keep-mounted state without losing Phase 3E behavior.
8. Centralize warning selection and remove duplicate top-level wording.
9. Update responsive CSS and accessibility semantics.
10. Update Quality Lab selectors to open disclosures before asserting hidden evidence; do not delete evidence assertions.
11. Run I1-I16 focused diagnostics/browser checks.
12. Run DEV once and RELEASE once.
13. Produce completion evidence, commit, deploy, and live-verify.

## 14.3 Required commands

```bash
npm run build
npm run lint
npm run lab:typecheck
git diff --check
npm run -- lab:recommend -- --base 3126cc9c74978933bb73b78e6307759e552308e0 --head HEAD
npm run lab:dev
npm run lab:release
```

Run focused Phase 3I and retained gates before DEV/RELEASE. Run DEV once and RELEASE once on stable product source. Do not add or run unit tests. Do not run EXTENDED, nightly, long-soak, the legacy 115-gate suite, or legacy release matrices without a separately documented finding.

## 14.4 Diff hygiene

Before commit:

- inspect every moved section and confirm it has one owner;
- confirm no result or evidence field was deleted;
- confirm no copy/export output depends on disclosure mounting;
- confirm Phase 3H detachment handlers were not bypassed;
- confirm no mechanics, solver, state identity, target identity, ranking, PolicyFlow topology, or Constellation graph data changed;
- confirm generated Quality Lab reports/corpora are not tracked accidentally;
- confirm no hidden evidence assertion was removed merely to make a gate pass;
- confirm the product bundle contains the new compact labels and retains the deep diagnostic labels.

---

# 15. Acceptance Criteria

Phase 3I is complete only when all of the following are true:

1. the fresh optimizer primarily presents Import, with manual construction and presets secondary;
2. an attached/imported/shared valid target is represented by one compact, complete player-facing summary;
3. the full target editor and optimization settings begin closed for a valid loaded target;
4. the Optimize action and validation state are easy to find without scrolling through research controls;
5. running search has a compact truthful status while full telemetry remains available on demand;
6. normal results default to Recommendation, How to craft it, and Shopping list;
7. Search & proof, Alternative methods, Strategy visualization, Cost & usage details, and Research diagnostics preserve all prior evidence under consistent disclosures;
8. critical truth and invalid-result warnings are never hidden;
9. selected-policy resolution, portfolio optimality, search counters, and stop reasons retain Phase 3H meaning;
10. disclosure state cannot affect handoff attachment, target/request identity, search, result invalidation, caching, serialization, or exports;
11. unopened panels do not cause missing copy/share/export/replay/bug-report data;
12. graph close/reopen preserves Phase 3E interaction and layout state;
13. desktop and mobile default layouts are materially shorter, readable, keyboard accessible, and free from horizontal overflow;
14. no optimizer mechanics, probabilities, action legality, rankings, hardcoded winners, or fixture-specific branches change;
15. I1-I16, retained Phase 3H/3G/3F gates, build, lint, typecheck, diff hygiene, DEV, and RELEASE satisfy the documented acceptance outcome;
16. implementation and completion report are committed to `main`, GitHub Pages succeeds, and uncached live HTML/bundle are verified at the final SHA.

---

# 16. Completion Report

Create:

```text
docs/crafting-engine/PHASE3I_COMPACT_OPTIMIZER_INFORMATION_ARCHITECTURE_AND_PROGRESSIVE_DISCLOSURE_COMPLETION_REPORT.md
```

The completion report must include:

- baseline, implementation, closeout, and final deployed SHAs;
- exact files changed and extracted component boundaries;
- before/after top-level information hierarchy;
- entry-state behavior for fresh, handoff, share/import, invalid import, and restored result;
- default open/closed matrix;
- exact mapping of every old top-level section to its new owner;
- critical-warning visibility matrix;
- proof/search presentation authority reuse;
- disclosure-state isolation evidence;
- copy/share/export/replay/bug-report equality evidence across disclosure states;
- Constellation close/reopen preservation evidence;
- desktop and 390/420px browser evidence, including scroll-height comparison and overflow checks;
- accessibility assertions;
- I1-I16 results;
- Phase 3H/3G/3F retained results;
- build, lint, typecheck, diff hygiene, DEV, and RELEASE counts/durations;
- explicitly unrun suites;
- any failure, correction, and targeted closure without rewriting historical run results;
- workflow, job, deployment, and successful status IDs;
- final uncached live HTML/bundle HTTP status, asset name, release marker, and key compact/deep label checks.

Do not describe collapsed evidence as removed. Do not claim a performance improvement without measured evidence. Do not claim global optimality from a compact resolved-policy label.

---

# 17. Copy/Paste Implementation Prompt

```text
Implement Phase 3I in jpitty03/cluster-jewel-research from main.

The source of truth is:
docs/crafting-engine/POST_PHASE3H_FIELD_REVIEW_AND_PHASE3I_COMPACT_OPTIMIZER_INFORMATION_ARCHITECTURE_AND_PROGRESSIVE_DISCLOSURE_PLAN.md

Read that plan, the Phase 3H source plan, and the Phase 3H completion report in full before editing. Follow Phase 3I exactly.

The goal is a substantially condensed Craft Optimizer that is import-first and compact by default while preserving every useful diagnostic and research surface behind intentional progressive disclosure.

Entry behavior must be state-aware. A fresh page primarily offers Import optimizer JSON, with presets/manual construction secondary. A valid Cluster Jewels handoff, share, or JSON import shows a compact loaded-target summary and Optimize action; the full target editor and optimization settings begin closed. Phase 3H one-way handoff detachment and sale-value ownership must remain exact.

While searching, show a compact truthful status by default and keep the full Search Activity graph/proof research under Search & proof. After a valid run, only Recommendation, How to craft it, and Shopping list begin open. Preserve the former top-level research under Search & proof, Alternative methods, Strategy visualization, Cost & usage details, and Research diagnostics. Critical errors, provisional/acquisition-unsafe truth, stale/fallback pricing, selected-policy solve, and portfolio optimality must remain visible without opening research panels.

Use shared authoritative proof/search/target-progress helpers. Disclosure state must not affect handoff state, requests, cache or fingerprints, search, results, share/export/replay/bug reports, or copy output. Heavy graphs may mount on first open, but close/reopen must preserve Phase 3E layout, selection, rerouting, replay, and reset behavior.

You may extract presentation components from CraftOptimizer.tsx, but keep Worker/request lifecycle, detachment, serialization, and domain calculations authoritative and centralized. Do not change mechanics, probabilities, action legality, state/target identity, ranking, PolicyFlow topology, Constellation data, or proof semantics. Do not add hardcoded winners, fixture-specific production branches, or unit tests.

Add Phase 3I I1-I16 focused diagnostics and real-browser gates. Preserve Phase 3H handoff behavior, Phase 3G acceptable alternatives, Phase 3F decision/overlay evidence, Phase 3E graph interaction, and corrected unequal-work HOST_RESERVE diagnostic semantics.

Run build, lint, Quality Lab typecheck, diff hygiene, impact recommendation, focused gates, DEV once, and RELEASE once. Do not run unit tests, EXTENDED, nightly, long-soak, the legacy 115-gate suite, or legacy release matrices unless an implementation finding independently requires and documents one.

Create the specified Phase 3I completion report using observed evidence. Commit and push the implementation/report to main, verify GitHub Pages at the final SHA, and return implementation/closeout commits, validation counts and durations, explicitly unrun suites, workflow/job/deployment IDs, and live uncached verification.
```
