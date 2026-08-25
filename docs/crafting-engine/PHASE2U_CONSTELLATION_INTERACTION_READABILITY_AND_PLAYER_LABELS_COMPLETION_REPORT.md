# Phase 2U Constellation Interaction, Readability, and Player Labels Completion Report

Date: 2026-08-25

Source of truth: `POST_PHASE2T_REVIEW_AND_PHASE2U_CONSTELLATION_INTERACTION_READABILITY_AND_PLAYER_LABELS_PLAN.md`

Release-gate result: **PASSED — 39/39 real-browser gates**

Preservation result: **PASSED — 16/16 mature diagnostics and T1–T16**

Phase 2U diagnostic result: **PASSED — U1 through U17 under the user-approved local release execution policy**

## 1. Implementation commit

The Phase 2U implementation and stable browser/regression evidence are committed as:

```text
76ce6d41850196b86f3123135eaac23be9c04ee0
```

Commit subject: `feat: complete Phase 2U constellation UX`.

Hosted-run timing evidence then required a diagnostic-only hardening follow-up:

```text
c6c958415fe47577cd0e9a523d1be8ef6ec5ed4d
```

Commit subject: `ci: stabilize mature diagnostic boundaries`. It changes no production source, mechanics, state identity, or expected value.

The user then explicitly moved wall-clock-sensitive mature/browser execution out of automatic GitHub Actions after the complete matrix passed locally:

```text
ce3db4f2a574a48e4d394f81e9dacb0f4f0d1649
```

Commit subject: `ci: keep heavyweight release gates local`. It keeps the assertions and local release commands intact, makes the remote extended matrix unscheduled/opt-in, and leaves automatic Pages validation with build, lint, diff hygiene, and a committed-evidence contract audit.

This report is a documentation follow-up so it can cite the immutable implementation commit and its hosted validation result.

## 2. Files changed

The implementation commit changes 47 files. The complete change set is grouped below.

| Area | Files and outcome |
| --- | --- |
| Shared modifier vocabulary | `crafting-engine/src/domain/ModifierDisplay.ts`, `crafting-engine/src/index.ts`, `crafting-engine/src/service/craftingCatalog.ts` |
| Graph/result presentation | `crafting-engine/src/domain/VisualizationGraph.ts`, `crafting-engine/src/service/optimizerService.ts` |
| Public UI | `src/components/MarkovConstellation.tsx`, `src/CraftOptimizer.tsx`, `src/SearchableModifierSelect.tsx`, `src/components/OnboardingModal.tsx`, `src/App.css` |
| Browser release harness | `quality-lab/src/runner.ts`, `quality-lab/README.md`, `package.json` |
| Diagnostics | `scripts/phase2uDiagnostics.ts`, `scripts/phase2tDiagnostics.ts`, `scripts/matureDiagnostics.ts`, `scripts/developerUiPhase2fDiagnostic.ts`, `scripts/developerUiPhase2sDiagnostic.ts` |
| Local/hosted validation policy | `.github/workflows/deploy.yml`, `.github/workflows/nightly-quality.yml`, `package.json`, `quality-lab/README.md` |
| Release documentation | `docs/crafting-engine/PATH_TO_SUCCESS.md` |
| Stable browser evidence | `quality-lab/reports/release-gate.json`, `quality-lab/reports/summary.md`, `quality-lab/reports/evidence/worker-events.json`, updated four-mod images, updated real-frame image, and seven new `constellation-*.png` Phase 2U images |
| Mature/phase evidence | Refreshed `output-phase2e` through `output-phase2t` diagnostic artifacts and new `output-phase2u-constellation-interaction-readability-player-labels-diagnostic.txt` |

No test file was added.

The diagnostic-only follow-up changes `phase2jSearchDiagnostic.ts`, `phase2k1ExactFixtureDiagnostic.ts`, `phase2uDiagnostics.ts`, and 11 regenerated diagnostic output artifacts. It makes fixed-state comparisons independent of runner speed and accepts signed measured overhead; all original pass assertions remain blocking.

The execution-policy follow-up changes seven tracked files. It does not change the production application, Quality Lab assertions, fixture budgets, screenshots, solver, or Worker.

## 3. Phase 2T preservation matrix

| Preserved contract | Evidence | Result |
| --- | --- | ---: |
| Mature Phase 2E–2S engine/UI behavior | Fresh-process `diagnostic:mature` matrix | **16/16 PASS** |
| Phase 2T truthfulness and result consistency | `diagnostic:phase2t` | **T1–T16 PASS** |
| Real browser and production Worker | Chromium release smoke, 4 Worker spawns, 21 requests, 186 responses, 3 intentional terminations | **PASS** |
| Cancel/host-guard/error recovery | Real Worker termination, replacement, recovery, and real `ERROR` message gates | **PASS** |
| Exact four-mod route accounting | 1465.766276c acquisition + 3793.427450c downstream = 5259.193726c full route; error `1.82e-12` | **PASS** |
| Full-route materials/results identity | Canonical Worker, DOM, copied text, share reload, and export differential gates | **PASS** |
| Independent method-family solving | OPEN, CONVENTIONAL, HARVEST, SELF_FRACTURE, and SELF_FRACTURE_HARVEST retain independent solve/session evidence before comparison | **PASS** |
| Harvest action evidence | `harvest_reforge_defences` observed on-policy at 2.482722 expected applications in the resolved witness | **PASS** |
| Lifeforce economics | 2.482722 × 75 = 186.204149 Primal Lifeforce, with price-derived crossover | **PASS** |
| Responsive/keyboard/real frame | Production DOM at 320/390/768/1280/1920 px plus actual canvas pixels and keyboard path | **PASS** |
| Simulation fallback exclusion | `lab:no-fallback-probe` proves unavailable app/browser fail hard | **PASS** |

The isolation change in `scripts/matureDiagnostics.ts` launches each mature diagnostic in a fresh Node process. It removes aggregate-heap/timing interference without changing assertions, mechanics, state/round ceilings, or expected values. Phase 2J and Phase 2K1 exact suites run first. When Phase 2J's deliberately short first-useful service path returns at 3,334 states, the diagnostic completes that same retained graph to the exact 5k prefix before asserting cold/resumed equality at 10k; production scheduling is untouched. The K6 seed returns its first certified clean control instead of starting a wall-clock-dependent refinement; a larger wall allowance lets slow runners finish that same round, and the retained 20k/40k DEEPEN probes still own the larger-state comparison. All health/proof assertions remain unchanged.

## 4. Player display descriptor contract

`ModifierDisplayDescriptor` is the single public/technical bridge for an exact modifier:

| Field | Contract |
| --- | --- |
| `modId` | Exact stable identity; never replaced by display text |
| `primaryText` | Full player-facing stat vocabulary with tier |
| `compactText` | Conservative player-facing short form with tier |
| `tier`, `tierLabel` | Numeric tier and `Tn` presentation |
| `genType` | Exact Prefix/Suffix classification |
| `requiredItemLevel` | Exact modifier item-level requirement |
| `internalAffixName` | Internal affix name, reserved for Technical/Advanced evidence |
| `modGroup` | Exact exclusion/state-identity group |
| `technicalText` | Explicit internal affix, exact ID, and exclusion-group evidence |

`resolveModifierDisplayDescriptor` is the only exact-mod resolver. `resolveRequirementModifierDescriptor` resolves a requirement only when an exact ID matches or its non-ID constraints identify one unique modifier; it never invents a replacement identity. `playerizeModifierText` replaces IDs/internal names in generated public prose while leaving the underlying exact descriptor and result untouched.

Duplicate visible labels receive deterministic `variant N` display disambiguation in the catalog. Raw IDs are not used as a public fallback.

## 5. Exact ID preservation evidence

The exact four-mod fixture retained these IDs unchanged in the Worker request/result, share payload, canonical result, Technical/Advanced disclosure, and export:

- `AfflictionJewelSmallPassivesGrantInt3`
- `AfflictionJewelSmallPassivesGrantAttributes3`
- `AfflictionJewelSmallPassivesHaveIncreasedEffect2`
- `AfflictionJewelSmallPassivesGrantES3`

U2 observed four descriptor rows and verified that every Worker/export ID survived unchanged. U3 opened the technical disclosure and observed all four exact IDs. The graph identity still includes exact graph node/family identities; replacing the graph resets presentation camera state rather than merging semantic states.

## 6. Public no-ID-leakage evidence

With Technical/Advanced disclosure closed, U3 scanned normal rendered text across the picker, Target Summary, Search Activity, milestones, recommendation, method cards, Constellation, selected-node panel, route rail, and copied player summary:

| Leakage class | Observed count |
| --- | ---: |
| Raw `AfflictionJewel...` IDs | 0 |
| Internal affix names | 0 |

Opening Technical/Advanced exposes exact identity intentionally. Export/share evidence also retains exact IDs. This is a visibility boundary, not an identity rewrite.

## 7. Exact four-mod vocabulary table across UI surfaces

Every required public surface resolves through the shared descriptor. U4 observed all four values in the picker, Target Summary, Search Activity, method cards, Constellation, and copied headings.

| Exact technical ID | Picker / Target Summary | Activity / methods / route names | Constellation / copied player evidence |
| --- | --- | --- | --- |
| `AfflictionJewelSmallPassivesHaveIncreasedEffect2` | **35% increased Effect (T1)** | **35% increased Effect (T1)** | **35% increased Effect (T1)** |
| `AfflictionJewelSmallPassivesGrantES3` | **+10–12 Maximum Energy Shield (T1)** | **+10–12 Maximum Energy Shield (T1)** | **+10–12 Maximum Energy Shield (T1)** |
| `AfflictionJewelSmallPassivesGrantAttributes3` | **+4 All Attributes (T1)** | **+4 All Attributes (T1)** | **+4 All Attributes (T1)** |
| `AfflictionJewelSmallPassivesGrantInt3` | **+6–8 Intelligence (T1)** | **+6–8 Intelligence (T1)** | **+6–8 Intelligence (T1)** |

## 8. Camera state model

The camera is presentation-only state:

```text
{ panX, panY, zoom, fitMode, baseFitMode }
```

`fitMode` is `SELECTED_ROUTE`, `ALL`, or `MANUAL`. A manual pan/zoom retains `baseFitMode`, so resizing continues to derive a valid base fit before applying user pan/zoom. The view transform is:

```text
scale   = fittedBaseScale(bounds(baseFitMode), viewport) × zoom
offsetX = viewportWidth / 2  + panX - graphCenterX × scale
offsetY = viewportHeight / 2 + panY - graphCenterY × scale
```

Zoom is clamped to `0.35×–5×`. Camera state is neither serialized into optimizer state nor sent to the Worker. A new graph identity resets the camera to the selected-route fit; U8 verified the replacement reset exactly.

## 9. Pointer capture and click-vs-drag behavior

The focusable viewport uses Pointer Events for mouse, pen, and touch. Primary pointer-down captures the pointer and records origin, starting pan, and target node. Movement at or above the 6 CSS-pixel Euclidean threshold changes to panning, sets `MANUAL`, and suppresses node selection. Pointer-up below the threshold performs hit-tested selection. Pointer cancel/lost capture ends without a click, and release explicitly relinquishes capture.

U5 sent a real captured mouse drag and measured `142 × 34` CSS pixels of camera movement. It also verified that the drag did not select a node and did not scroll the page.

## 10. Touch behavior

The graph viewport uses `touch-action: none`; the surrounding document does not. U6 used an actual Chrome DevTools Protocol touch stream at 390 px:

- graph pan: `126 × 54` CSS pixels;
- page scroll while touching the graph: suppressed;
- ordinary page scroll outside the graph: 600 CSS pixels;
- node selection during drag: suppressed.

The same pointer-capture lifecycle handles touch cancellation and prevents a stuck panning state.

## 11. Wheel anchor mathematics

Wheel listeners are registered with `{ passive: false }`, so the graph consumes the wheel without scrolling its page region. For viewport anchor `p`, old transform `(offset₀, scale₀)`, fitted base scale `b`, and clamped new zoom `z₁`:

```text
g = (p - offset₀) / scale₀
scale₁ = b × z₁
pan₁ = p - viewportCenter - (g - graphCenter) × scale₁
```

This solves the new pan so the same graph coordinate `g` remains under the pointer. The exponential wheel factor is `exp(-deltaY × 0.0015)`. U7 measured only `0.647 px` of anchor drift and verified both clamps plus shared button/readout state.

## 12. Keyboard controls

The graph region is focusable, has screen-reader instructions, and provides:

| Key | Action |
| --- | --- |
| Arrow keys | Pan 36 px; Shift + Arrow pans 72 px |
| `+` / `=` | Zoom in around viewport center |
| `-` | Zoom out around viewport center |
| `0` | Reset current base fit |
| `F` | Route Focus |
| `A` | Fit All |
| Enter/Space on a DOM node | Select that exact node |
| Escape | Close node details and preserve native fullscreen exit |

U9 exercised the real keyboard path and verified focus can leave the graph; there is no focus trap.

## 13. Route Focus / Fit All / Reset behavior

- **Route Focus** computes bounds from the ten selected-route nodes and resets pan/zoom to that fit.
- **Fit All** computes bounds from all 20 nodes, including independent method-family lanes.
- **Reset View** clears manual pan/zoom but returns to the current `baseFitMode`, rather than silently changing scope.
- A graph replacement resets to `SELECTED_ROUTE`, zero pan, and `1×` user zoom.

U8 verified all node counts and exact camera telemetry for these transitions.

## 14. Label rendering architecture

The canvas renders motion, edges, particles, glows, and nodes. Persistent readable labels and interactive anchors are a synchronized DOM overlay. This provides real focus targets, semantic buttons, CSS wrapping, contrast/backplates, browser-measurable rectangles, and stable screenshots while retaining the Constellation animation.

Default labels contain concise phase/action/result language only. Transition lists, exact probabilities, long method explanations, internal identity, and accounting evidence move to the selected-node detail panel. Zoom-based detail thresholds reduce default density; Advanced labels are explicit opt-in.

## 15. Collision-layout evidence

Label placement is deterministic and priority ordered: selected/active route labels first, then other selected-route labels, terminal/start labels, and only then alternatives. Candidate positions are tested against already accepted DOM rectangles; lower-priority labels fall back to compact numbered anchors when required. Edge labels use separately measured fixed rectangles and deterministic candidates.

U10 used Chromium `getBoundingClientRect()` geometry for both node and edge labels. It measured 11 persistent labels, found **0 intersections**, and observed a **13 px minimum font size**. The gate uses rendered geometry rather than source-text or canvas-operation proxies.

## 16. Long-label stress screenshots

U11 rendered 12 long method cards, long fracture/Harvest names, the exact four-mod target, fullscreen, and the 390 px touch view. No public label escaped its graph/mobile boundary. Persistent alternative labels wrap or ellipsize conservatively; the complete evidence remains in the detail panel.

Relevant stable screenshots are:

- `quality-lab/reports/evidence/constellation-fit-all.png`
- `quality-lab/reports/evidence/constellation-selected-node.png`
- `quality-lab/reports/evidence/constellation-touch-390.png`
- `quality-lab/reports/evidence/constellation-screensaver-fullscreen.png`

## 17. Route-rail cleanup

The bottom rail is a horizontal sequence of concise, focusable chips rather than duplicated long transition evidence:

```text
Start · 1 Fracture · 2 Transmute · 3 Alter · 4 Augment ·
5 Regal · 6 Finish · 7 Recover · 8 Complete · Complete
```

U12 verified all ten chips and confirmed that the active step automatically scrolls fully into view (`scrollLeft = 184` in the tested frame).

## 18. Selected-node detail behavior

Selecting a DOM node opens a bounded, independently scrollable detail panel. It shows node kind, player-facing title, phase, route status, and exact incoming/outgoing transition evidence for that node. Replay mode defaults to the actual replay edge; Advanced labels can reveal additional modeled transitions. Escape or the close control dismisses the panel. Exact IDs/internal affix names remain restricted to the explicit Technical/Advanced disclosure.

## 19. Fullscreen/screensaver behavior

Fullscreen uses the real Fullscreen API and listens to `fullscreenchange`; layout/canvas dimensions follow the fullscreen element, and native Escape remains available. Explorer interactions pause Screensaver motion. Screensaver auto-hides controls after inactivity and restores them on pointer, wheel, focus, or keyboard activity. U13 verified entry/exit, control auto-hide, camera interaction, and the uncluttered fullscreen screenshot.

## 20. Reduced-motion behavior

`prefers-reduced-motion: reduce` switches the animation to static presentation and disables CSS motion. The toolbar exposes the resulting `Static` state. U13/U14 captured deterministic reduced-motion frames and verified byte-identical consecutive canvas frames while camera, DOM labels, and keyboard inspection remained available.

## 21. Five-minute memory/animation soak

The release scenario ran a real **300,000 ms** post-interaction soak; the complete U13 gate took 308,777 ms.

| Measure | Before | After | Change |
| --- | ---: | ---: | ---: |
| Used JS heap | 20,611,268 bytes | 20,817,164 bytes | +205,896 bytes (+1.00%) |
| DOM elements | 88 | 87 | -1 |

The soak begins after the camera, selection, reduced-motion, fullscreen, and Screensaver interactions; replay animation is resumed and continues throughout the five-minute interval. The bounded heap/DOM result passes the Phase 2U budget; it is evidence for this five-minute run, not a claim that an arbitrarily long session cannot leak.

## 22. Real Playwright screenshots and interaction evidence

Final release run `2026-08-25T23-17-21-034Z` used **Playwright Chromium 151.0.7922.34** against the built production app. It ran from `23:17:21Z` through `23:27:16Z`, passed **39/39** gates, and recorded zero console, page, or network errors.

The seven required committed Phase 2U images are:

1. `quality-lab/reports/evidence/constellation-route-focus.png`
2. `quality-lab/reports/evidence/constellation-fit-all.png`
3. `quality-lab/reports/evidence/constellation-post-pan.png`
4. `quality-lab/reports/evidence/constellation-selected-node.png`
5. `quality-lab/reports/evidence/constellation-touch-390.png`
6. `quality-lab/reports/evidence/constellation-screensaver-fullscreen.png`
7. `quality-lab/reports/evidence/constellation-reduced-motion.png`

The run also refreshed `four-mod-desktop.png`, `four-mod-390.png`, `constellation-real-frame.png`, the Worker event trace, JSON gate report, and Markdown summary. Actual mouse/touch/wheel/keyboard input, DOM geometry, fullscreen, canvas pixels, responsive layout, Worker traffic, result/export comparison, and generated screenshots are the evidence; no simulated browser smoke counts toward release.

All seven Phase 2U images plus the two four-mod responsive captures and retained real-frame capture were visually inspected from this final run. Labels, cards, camera framing, mobile containment, selected-node details, fullscreen presentation, and reduced-motion presentation were readable and free of visible clipping or unintended overlap.

## 23. Visualizer performance comparison

The dedicated Phase 2U interaction sample observed:

| Measure | Result |
| --- | ---: |
| Frames | 90 |
| Median frame interval | 16.700 ms |
| Maximum frame interval | 16.800 ms |
| Maximum long task | 0 ms |
| Worker messages added by camera interaction | 0 |

The final retained real optimizer telemetry ON/OFF comparison measured **-1.303% overhead** (the telemetry-on median was slightly faster from measurement noise), below the 5% budget. The browser report's visualizer `optimizerOverheadPercent: 0` specifically means camera activity added no optimizer/Worker work; it is not substituted for the independent runtime comparison.

The retained five-second Constellation performance gate also observed 301 frames in 5004.5 ms (**60.1459 FPS**), 68 ms maximum/total long task, and a 33,100,000-byte heap sample.

## 24. CI run and deployment status

The initial implementation workflow (`32903575256`) correctly blocked deployment when the slower Linux runner missed K6's wall-clock-dependent clean certificate. The deterministic diagnostic-boundary correction is committed as `c6c9584`; no failed run was deployed.

The corrected hosted run (`32907456876`) passed build, lint, diff, all 16 mature diagnostics, and the no-fallback probe. Its shared Linux runner then produced 35/39 browser passes: the transient 1 ms host-guard text missed a four-second locator window, the initial four-mod pass exhausted its wall budget before an executable route, and the two Armour fixtures independently searched but did not resolve Conventional inside their hosted allocations. Deployment remained correctly blocked. The unchanged harness subsequently passed all four gates in the final local 39/39 run, including resolved Conventional evidence for both Armour fixtures.

At the user's explicit direction, `ce3db4f` makes the full mature/no-fallback/Playwright/Phase 2T/Phase 2U sequence an authoritative **local** release gate instead of repeating wall-clock-sensitive work on every shared Actions runner. This is a documented execution-policy exception to the source plan's automatic-hosted wording in T14/U16; it changes no acceptance assertion or production behavior.

The lean hosted workflow [`32910078255`](https://github.com/jpitty03/cluster-jewel-research/actions/runs/32910078255) passed. Its `validate-and-build` job ran `npm ci`, build, lint, diff hygiene, and `diagnostic:phase2u:committed`; that audit revalidated the committed 39/39 report, required screenshots, Phase 2T preservation evidence, display/identity contracts, and the local/hosted policy. `deploy` still has `needs: validate-and-build`, and Pages deployed commit `ce3db4f` successfully to [the production site](https://jpitty03.github.io/cluster-jewel-research/).

The extended remote matrix remains available only through explicit `workflow_dispatch`; its schedule was removed, so it cannot consume Actions time automatically.

## 25. Build/lint/diff results

| Gate | Command | Result |
| --- | --- | ---: |
| Production TypeScript/Vite build | `npm run build` | **PASS** |
| Repository lint | `npm run lint` | **PASS** |
| Patch whitespace/error audit | `git diff --check` and `git diff --cached --check` | **PASS** |
| Committed local-evidence contract | `npm run diagnostic:phase2u:committed` | **PASS** |

Vite continues to emit the pre-existing advisory about extensionless native-config imports and the large application chunk. Neither is a build failure or a Phase 2U regression.

## 26. Release label/version

The application label and canonical presentation/export schema are **Browser-Verified Release Candidate 2U.1** / `2U.1`. Phase 2S retained diagnostics explicitly verify the updated label. The claim remains narrower than public-beta certification because pricing freshness and some optimizer proof/mechanics limitations remain visible.

## 27. Unit tests added/run

**NO.** No unit-test file or unit-test workflow command was added, and no unit test was run. Validation used production builds, direct/mature non-unit diagnostics, a real production Worker, and Playwright Chromium as required.

## 28. Solver mechanics changed

**NO.** No action probability, modifier weight, crafting rule, price rule, Bellman calculation, acquisition contract, Harvest cost, or Lifeforce quantity was changed for Phase 2U. `optimizerService.ts` changes only the presentation/export schema version from `2T.1` to `2U.1`.

State identity weakened: **NO**. Exact modifier/fracture identity and graph identity remain explicit.

Pre-fractured market ranking reintroduced: **NO**. Core ranking still evaluates clean acquisition and executable self-fracture synthesis/recovery rather than market-fractured shortcuts.

## 29. Hardcoded route winner added

**NO.** No fracture target, route, method family, or winner is selected by modifier name/ID or fixture branch. The exact four-mod run happened to select the Energy Shield self-fracture route from generic policy costs at current research prices. Price-sensitivity diagnostics still reverse route winners naturally.

## 30. Remaining known UX or optimizer limitations

1. Bundled currency and clean-base prices are stale research estimates, so Release Candidate 2U.1 does not claim current-market or public-beta certification.
2. The exact four-mod recommendation remains `PROVISIONAL_RESOLVED` / best among resolved alternatives; several independently searched families remain unresolved at the production budget.
3. Harvest mechanics retain their disclosed approximate confidence. The one-mod witness resolves and reconciles Harvest evidence/economics; Armour + Evasion and Armour + Energy Shield remain honestly `ENABLED_UNRESOLVED` at budget.
4. Collision/readability gates cover the frozen fixture corpus, long method cards, fullscreen, and 390 px stress. Future substantially denser graphs may intentionally fall back to numbered anchors/details rather than showing every label persistently.
5. Touch gestures beginning inside the graph are intentionally reserved for camera interaction; ordinary page scrolling remains available outside its bounded viewport.

These limitations are disclosed behavior, not incomplete Phase 2U completion gates.
