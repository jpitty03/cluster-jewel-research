# Phase 3L UI Reliability, Constellation Readability, and Print Completion Report

Date: 2026-08-30  
Status: COMPLETE

## 1. Immutable identities and scope

The actual latest `main` was fetched before implementation. The working tree was clean, local `main` equaled `origin/main`, and the recorded starting SHA was:

```text
25c139f87bf983150a1f31283ecd0e5e3ddae18f
```

The immutable Phase 3L implementation commit is:

```text
4c775a4c624f76d60c2c24ea40d3d967d064fd24
```

The implementation commit is a direct descendant of the recorded baseline. Its product and Quality Lab diff is limited to:

- `src/SearchableModifierSelect.tsx`;
- `src/CraftOptimizer.tsx`;
- `src/components/GuidedCraftConstellation.tsx`;
- `src/App.css`;
- `quality-lab/src/gateRegistry.ts`;
- `quality-lab/src/gateWorker.ts`;
- `quality-lab/src/impactRecommendation.ts`.

No file under `crafting-engine/src/` changed. No mechanic, probability, solver, ranking, acquisition, target-model, PolicyFlow, evidence, certification, or fail-closed implementation changed. No current-item, pasted-item, live-tracker, route-start, or discarded companion behavior was restored. No unit-test file or runtime dependency was added.

## 2. Completed product work

### Portaled modifier selector

The modifier listbox is now portaled to `document.body` while retaining trigger ownership through `aria-controls`. Fixed-position geometry uses the visual viewport when available, selects upward or downward placement from measured space, clamps within an eight-pixel viewport margin, and follows window/ancestor scroll, viewport resize/zoom, trigger resizing, and popup content-height changes.

Outside-click ownership includes both the in-flow trigger and portaled popup. Keyboard behavior, search focus, disabled duplicate handling, selection, Escape, and focus return remain intact. A responsive reflow that moves the trigger fully out of view intentionally closes the popup; a settled second animation-frame measurement prevents stale geometry after responsive layout completes.

### Validation lifecycle

Import/decode failure remains in the import-error channel. Parsed external setups cross an explicit hydration boundary and receive derived current-draft repair guidance only while their current validation remains invalid. The repair banner therefore clears in the same render that makes the draft valid.

The acceptable-alternative lifecycle preserves the existing model semantics:

- zero or one selected alternative is invalid;
- two distinct selections are valid;
- an additional blank draft row does not invalidate the two completed branches;
- three completed branches serialize as three branches;
- removal back to one restores inline validation;
- disabling alternatives clears the error and omits `acceptableAnyOf` from the Worker request.

### Guided constellation

Player-facing labels are presentation-only: the main route is `Step 1` through `Step 6`, recovery nodes are `R1` and `R2`, and the terminal node is `Finish`. Connector text now names the engine-owned action before the result label while retaining the exact action ID and PolicyFlow edge evidence.

All nine stage headers remain visible. Only the selected stage mounts its full preview action grid; every stage remains selectable and exposes its exact condition picker and `WHEN -> USE -> THEN` detail without new Worker traffic. The raw technical graph, engine-owned compiled model, and evidence mapping remain unchanged.

### Print, PDF, and copy

Print media uses A4 with 12 mm margins, a white page/root canvas, a single-column non-sticky guided layout, break avoidance for stages/connectors/action groups/detail/warnings/shopping content, explicit readable foregrounds/backgrounds, and hidden controls that add no print value.

The final representative PDF was rendered and visually reviewed page by page. All five pages were readable; no stage or connector overlapped, no fitting stage card split, the selected condition control remained readable, and no clipped, black, or empty page defect remained.

On-screen shopping quantities are explicitly labeled expected consumption/model averages. Copied purchase guidance explicitly rounds up from expected consumption. Both Shopping List and Playbook copy retain provisional/acquisition-safety status and Retry-deeper guidance when unresolved competitors remain.

The release marker is `3L.1`.

## 3. Phase 3L Quality Lab gates

Three focused gates were added:

| Gate | Suite ownership | Evidence |
| --- | --- | --- |
| `A-phase3l-ui-reliability-direct` | DEV, RELEASE | immutable baseline, frozen source scope, portal ownership, derived repair state, compact-label contract, print contract, release marker |
| `C-phase3l-editor-reliability-browser` | DEV, RELEASE | portal host/occlusion/geometry, upward and downward opening, scroll/resize/zoom/narrow viewport, keyboard/pointer/outside click, full acceptable-alternative lifecycle, request serialization |
| `C-phase3l-constellation-print-browser` | RELEASE | frozen field browser result, unique stage labels, action-distinct exact connectors, every-stage exploration, compact previews, expected/provisional copy, print styles, screenshot, and real PDF |

The retained Phase 3K browser gate and Phase 3F decision-fidelity gate were adapted only to explore each compact stage before aggregating rendered action IDs. The Phase 3I repair assertion was adapted to the new dedicated setup-repair owner. Their underlying product, solver, evidence, and certification assertions were not weakened.

## 4. Frozen Phase 3K reconciliation

Post-commit report `quality-lab/reports/phase3l-frozen-postcommit.json`, run `2026-08-30T18-22-56-518Z`, passed 3/3 against application source identity `app-409c537e0e2c7802a526`.

| Frozen evidence | Observed result |
| --- | ---: |
| Positive policy rows | 267 |
| Certified player rules | 24 |
| Exact actionable states | 572 |
| Expected visits | `740.8471930308734` |
| Raw PolicyFlow topology | 23 nodes / 49 edges |
| Guided topology | 9 nodes / 17 edges |
| Guided evidence-map entries | 69 |
| Authoritative terminal edges | 2 |

All 17 guided destinations reconciled to exact certified PolicyFlow edges. Alteration, Augmentation, Regal, Exalt, Scour, wanted-fracture cleanup, and junk-fracture reacquisition evidence remained present. The uncertified and collision negative controls remained withheld with empty guides and zero guessed nodes.

## 5. Browser, print, and PDF evidence

Post-commit focused report `quality-lab/reports/phase3l-focused-postcommit.json`, run `2026-08-30T18-22-16-817Z`, passed 5/5 against the same source identity.

Observed browser evidence included:

- six unique primary labels, two recovery labels, and `Finish`;
- 17 action-qualified connectors with exact source-edge evidence;
- two certified success edges into `Finish`;
- nine visible stage headers and zero unselected full action grids;
- every stage explored with zero added Worker events;
- 24 represented player rules, 572 represented states, and 49 represented policy edges;
- body portal ownership, upward/downward geometry, overlap hit testing, scroll/resize/zoom handling, keyboard and pointer selection, outside click, focus return, disabled duplicate protection, and narrow layout coverage;
- the complete 0/1/2/blank-third/3/remove/disable acceptable-alternative lifecycle and exact request payload behavior;
- distinct invalid-setup repair and malformed-file import/decode errors.

The final PDF evidence was:

```text
Artifact: quality-lab/artifacts/phase3a-2026-08-30T18-22-16-817Z/shard-C/phase3l-representative-route.pdf
Pages: 5
Bytes: 270279
SHA-256: BEAAFABD0F44E27F8057DE0398EC36F3140EAA093ADD6E548FF8D4FEA7235F2A
```

Computed print evidence showed one layout column, static detail positioning, `break-inside: avoid` on all fitting stages/connectors/action groups, sequential non-overlapping stage rectangles, no horizontal overflow, visible warning/Finish/expected cost, hidden setup form, white HTML/root/condition-picker backgrounds, and readable critical text colors.

## 6. Validation ledger

| Validation | Result | Run / duration evidence |
| --- | --- | --- |
| Production TypeScript/Vite build | PASS | final assets `index-DdgDeAdX.js`, `index-DJhYQKGC.css`, `optimizer.worker-D0vTW4wT.js`; only pre-existing Vite configuration/chunk warnings |
| Lint | PASS | `npm run lint` |
| Quality Lab typecheck | PASS | `npm run lab:typecheck` |
| Diff hygiene | PASS | `git diff --check` |
| Post-commit Phase 3L focused | 5/5 PASS | run `2026-08-30T18-22-16-817Z`; 29.823s wall |
| Post-commit frozen Phase 3K | 3/3 PASS | run `2026-08-30T18-22-56-518Z`; 19.491s wall |
| DEV, one actual suite execution | 18/18 PASS | run `2026-08-30T18-03-41-334Z`; 216.713s wall |
| RELEASE initial execution | 30/32 PASS | run `2026-08-30T18-07-23-248Z`; 551.554s wall |
| RELEASE failed-gate closure | 2/2 PASS | run `2026-08-30T18-17-07-242Z`; 61.481s wall |

The initial RELEASE failures were exact supersession findings, not product failures:

1. `C-craft-plan-decision-fidelity` inspected only the initially selected stage and therefore expected all three Promote action previews to be mounted simultaneously. Phase 3L's binding compact contract mounts only the selected preview. The gate now selects every stage and still requires the real Alteration, Augmentation, and Regal action IDs.
2. `C-phase3i-progressive-disclosure-browser` waited for the intentionally retired import-error sentence. It now requires `optimizer-setup-repair` for parsed invalid state, asserts that `optimizer-import-error` is absent, and retains the original disclosure assertions.

Only these two failed gates were rerun after their expectation-only updates. The product and frozen engine files did not change between RELEASE and the 2/2 closure. The rejected first DEV command was an npm argument-parsing error before the Quality Lab process started; it produced no run ID, report, browser, Worker, or gate execution. Run `2026-08-30T18-03-41-334Z` is the sole actual DEV suite execution.

Impact recommendation identified `accessibility`, `constellation`, `phase3l`, `responsive`, and `visual`. Dry-run expansion showed that the first, second, fourth, and fifth tags also select forbidden `E` long-soak/EXTENDED gates. Those gates, unit tests, nightly, legacy release, and legacy 115-gate matrices were not run, preserving the binding Phase 3K validation policy. All non-long-soak retained matches required by current DEV/RELEASE policy ran in the suites above; the Phase 3L tag was additionally run post-commit.

## 7. Findings and plan conformance

No acceptance criterion was weakened and no product-scope deviation was required.

The following implementation findings were resolved with evidence:

- responsive CSS can finish reflow one frame after the resize event, so popup geometry performs a settled second-frame measurement and intentionally closes only if the trigger has moved fully outside the viewport;
- an early non-frozen browser probe represented 620 states, so it was not accepted as L6/L7 evidence; the final gate uses `phase3c_primordial_renewal_rotten_claws` at its audited 3,334-state browser budget and proves the exact frozen 572 represented states;
- page-by-page PDF review exposed the setup form and dark root paper canvas in intermediate bundles; the setup form is now hidden for print, all critical content is print-readable, `@page`/HTML/root are white, and the final five-page artifact was reviewed again;
- the two RELEASE failures documented above were retained assertions superseded by binding Phase 3L behavior and were closed without changing production behavior.

## 8. Hosted workflow, deployment, and exact live assets

The implementation workflow was [33327737461](https://github.com/jpitty03/cluster-jewel-research/actions/runs/33327737461), named `Deploy to GitHub Pages`, and completed successfully for exact implementation SHA `4c775a4c624f76d60c2c24ea40d3d967d064fd24`.

| Hosted record | Immutable ID | Result |
| --- | ---: | --- |
| `validate-and-build` job | `99300761187` | PASS, 18s |
| `deploy` job | `99300806253` | PASS, 8s |
| Pages deployment | `6169755858` | success |
| Waiting status | `17535228538` | recorded |
| Queued status | `17535229085` | recorded |
| In-progress status | `17535229528` | recorded |
| Successful status | `17535232505` | success |

The deployed site is [https://jpitty03.github.io/cluster-jewel-research/](https://jpitty03.github.io/cluster-jewel-research/). A cache-busted index request returned HTTP 200 and named the exact implementation entry assets. Cache-busted entry requests returned `X-Cache: MISS`, `x-proxy-cache: MISS`, age zero, and exact local/live SHA-256 matches.

| Live asset | HTTP / bytes | SHA-256 | Exact local match |
| --- | ---: | --- | --- |
| `assets/index-DdgDeAdX.js` | 200 / 6,229,950 | `9607566C6EE1DD1AD42C25C3E53806C6FCAB2FD39546938B546993AEAD270FA7` | yes |
| `assets/index-DJhYQKGC.css` | 200 / 79,318 | `6E2BF52285FF04A406946C715F237518E60D0A49B330B1E744F60B71955BEF7D` | yes |
| `assets/optimizer.worker-D0vTW4wT.js` | 200 / 540,258 | `EBD68A5EDE3B8D7BFCA8E86706C5646DDB90B6CCD6257DCB5D3477D57A2B41F7` | yes |

The JavaScript entry imports that exact Worker filename. The Worker byte comparison also returned `x-proxy-cache: MISS`; a prior cache-busted request had already populated the edge (`X-Cache: HIT`) when the final hash was recorded, but the live bytes still matched the exact local production artifact.

## 9. Acceptance result

Phase 3L is complete. The portaled modifier selector is unclipped and viewport-safe; validation ownership is current and non-stale; the ordinary player route is compact and unambiguous; recovery and connector meanings are explicit; expected/provisional copy remains honest; the five-page PDF is readable; frozen Phase 3K reconciliation and fail-closed behavior remain intact; required focused, DEV, RELEASE-closure, build, and hosted deployment evidence is immutable and recorded.
