# Phase 2V Scroll Ownership, Constellation Semantics, and Harvest Closure Completion Report

Date: 2026-08-25 (America/Los_Angeles)

Source of truth: `POST_PHASE2U_FIELD_VALIDATION_AND_PHASE2V_SCROLL_SEMANTICS_HARVEST_CLOSURE_PLAN.md`

Release-gate result: **PASSED — 51/51 real Playwright browser gates**

Preservation result: **PASSED — 16/16 mature diagnostics, Phase 2T T1–T16, and Phase 2U U1–U17**

Phase 2V result: **PASSED — V1–V17**

## 1. Implementation commits

The Phase 2V product implementation, diagnostics, and stable evidence are committed as:

```text
8bba859964530d8871726c03bbe5719500e943d1
```

Commit subject: `feat: complete Phase 2V release closure`.

The first lean Linux evidence audit exposed a path-separator portability defect in the audit script only. The cross-platform follow-up is:

```text
328bc9fce48279f97e3fb1f89ddc9328edaf56b3
```

Commit subject: `ci: make Phase 2V evidence paths portable`. It changes no application, solver, mechanics, browser assertion, fixture, or evidence.

This completion report is a documentation follow-up so it can cite both immutable implementation commits and the hosted deploy result.

## 2. Files changed

The primary implementation commit changes 50 files. The material changes are:

| Area | Files and outcome |
| --- | --- |
| Certified mechanics | `crafting-engine/src/rules/actionRegistry.ts`, new `crafting-engine/src/solver/repeatableRerollCertification.ts`, `crafting-engine/src/solver/genericSearch.ts` |
| Method families and economics | `crafting-engine/src/domain/MethodFamily.ts`, `crafting-engine/src/service/optimizerService.ts` |
| Graph semantics | `crafting-engine/src/domain/VisualizationGraph.ts` |
| Public UI and Replay | `src/components/MarkovConstellation.tsx`, `src/CraftOptimizer.tsx` |
| Real-browser harness | `quality-lab/src/runner.ts`, `quality-lab/fixtures/fixtureCorpus.json`, `package.json` |
| Diagnostics | new `scripts/phase2vDiagnostics.ts` plus retained Phase 2T/2U/2S version and hosted-policy audits |
| Local-heavy/hosted-lean policy | `.github/workflows/deploy.yml`, `.github/workflows/nightly-quality.yml` |
| Stable evidence | `quality-lab/reports/release-gate.json`, `quality-lab/reports/summary.md`, `quality-lab/reports/evidence/worker-events.json`, five new `phase2v-*.png` images, refreshed retained images |
| Diagnostic evidence | refreshed mature/Phase 2T/2U outputs and new `output-phase2v-scroll-semantics-harvest-closure-diagnostic.txt` |

The portability follow-up changes only `scripts/phase2vDiagnostics.ts`. This report and `PATH_TO_SUCCESS.md` are the documentation follow-up. No unit-test file was added.

## 3. Phase 2U preservation matrix

| Preserved contract | Final evidence | Result |
| --- | --- | ---: |
| Phase 2E–2S engine/UI regression corpus | Fresh `diagnostic:mature` process matrix | **16/16 PASS** |
| Phase 2T release truthfulness and result consistency | `diagnostic:phase2t` | **T1–T16 PASS** |
| Phase 2U camera, touch, keyboard, labels, and exact-ID disclosure | `diagnostic:phase2u` | **U1–U17 PASS** |
| Production Worker startup/replacement/recovery | Real Chromium smoke, cancel, host guard, and real Worker `ERROR` response | **PASS** |
| Full-route material/result identity | Worker/DOM/share/export differential and accounting reconciliation | **PASS** |
| Independent method-family solves | OPEN, CONVENTIONAL, HARVEST, SELF_FRACTURE, and retained comparison lifecycle | **PASS** |
| Player-facing vocabulary | Public labels contain player stats; exact IDs remain in Technical/Advanced/export evidence | **PASS** |
| Pan/zoom/fit/reset/fullscreen/reduced motion | Retained Phase 2U real interaction gates and five-minute soak | **PASS** |
| Responsive/accessibility | 320/390/768/1280/1920 DOM geometry and keyboard path | **PASS** |
| No simulation fallback | `lab:no-fallback-probe` plus release report `fallbackSubstitutionUsed=false` | **PASS** |

The three field failures supplied before Phase 2V are closed in the final run: host-guard replacement/recovery passes in 4,012 ms, exact four-mod canonical DOM/accounting passes, and the Armour + Evasion Harvest comparison is no longer `UNRESOLVED`.

## 4. Exact auto-scroll root cause

Replay advanced `activeReplayNodeId` on a timer. The corresponding effect called:

```text
activeButton.scrollIntoView({
  behavior,
  block: 'nearest',
  inline: 'center'
})
```

`Element.scrollIntoView()` may scroll every relevant ancestor, including the document viewport. `block: 'nearest'` does not limit the operation to the horizontal route rail. Therefore initial result rendering and each timed Replay tick could pull the page back to the Constellation and could defeat a user's attempt to scroll upward.

The final Constellation source contains no `scrollIntoView(` call.

## 5. Route-rail local-scroll implementation

The route rail now owns its own ref. On Replay change it computes:

```text
maximumLeft = rail.scrollWidth - rail.clientWidth
centeredLeft = button.offsetLeft + button.offsetWidth / 2 - rail.clientWidth / 2
left = clamp(centeredLeft, 0, maximumLeft)
rail.scrollTo({ left, behavior })
```

Only `rail.scrollLeft` can change. The effect does not focus the active chip and never asks an ancestor or the document to scroll. Reduced motion selects `auto`; ordinary motion may use `smooth`. The useful horizontal-follow behavior is retained.

## 6. Proof that Replay no longer changes window.scrollY

The final release report records:

| Gate | Before | After | Focus |
| --- | ---: | ---: | ---: |
| V2 initial result + 2.1 seconds of Replay | 0 | 0 | retained |
| V3 at least three timed Replay nodes | 0 | 0 | retained |
| V5 Pause | 4,886 | 4,886 | activated control retained |
| V5 Resume | 4,886 | 4,886 | activated control retained |
| V5 0.5× / 1× / 2× / 5× | 4,886 for each | 4,886 for each | retained for each |
| V6 mobile Replay | 8,313 | 8,313 | no ownership change |
| V4 horizontal follow | 14,390 | 14,390 | no synthetic focus |

V4 simultaneously observed `rail.scrollLeft=352`, the active chip fully inside the rail, and zero added Worker messages. This is direct evidence that Replay moved the rail without moving the document.

## 7. Desktop, mobile, pause/resume, and speed evidence

| Surface | Real-browser observation | Result |
| --- | --- | ---: |
| Desktop initial completion | Stable form control kept focus; page stayed at the user's chosen position | **PASS** |
| Desktop running Replay | Five distinct route nodes were observed without page/focus movement | **PASS** |
| Pause and Resume | Both controls retained focus and document position | **PASS** |
| Four speed controls | 0.5×, 1×, 2×, and 5× retained focus/scroll over speed-appropriate waits | **PASS** |
| 390 px mobile | Replay did not move the page; ordinary scrolling outside the graph moved 600 px | **PASS** |
| 390 px horizontal rail | Active chip followed inside a 300 px rail whose content exceeded its width | **PASS** |

The final rail labels are concise: `Start · 1 Fracture · 2 Transmute · 3 Alter · 4 Augment · 5 Regal · 6 Finish · 7 Recover · Goal`. Full acquisition detail remains in the graph node/details panel.

## 8. Explicit acquisition presentation contract

`CanonicalResultPresentation.acquisitionContext` is serialized as:

```text
kind: CLEAN | SELF_FRACTURE | OTHER
candidateId?: exact portfolio candidate
methodId?: exact selected acquisition method
targetModId?: exact fractured target ID
```

The context is derived from selected portfolio evidence and the selected physical start. It is not inferred from a route name or action-ID substring.

- `CLEAN`: begin at Clean Base and omit a redundant visible acquisition node.
- `SELF_FRACTURE`: begin at Clean Base, add one explicit `Create Fractured <player target>` acquisition event, then show downstream craft actions.
- `OTHER`: retain a neutral selected-start/acquisition presentation.

Exact IDs remain in Technical/Advanced/export evidence. Public graph text continues through the Phase 2U player-facing descriptor vocabulary.

## 9. Clean-route graph before and after

Before Phase 2V, every `ACQUIRE` phase compacted to `Fracture`, even for a clean-base route, and the graph mapped the canonical acquisition step directly into persistent route semantics.

After Phase 2V, the exact one-mod clean fixture renders:

```text
Clean Base → Transmute → Alter → Augment → Goal
```

There is no `node_acquisition`, no fracture label, no fracture node/edge identity, and no lost canonical accounting. The How to craft plan still retains both `ACQUIRE` and `SUCCESS` phases.

## 10. Self-fracture chronology before and after

Before Phase 2V, a naturally selected self-fracture route could begin at `Fractured Base` and then show a fracture/acquisition action, reversing physical chronology.

After Phase 2V, the exact four-mod route renders:

```text
Clean Base
→ Create Fractured +4 All Attributes (T1)
→ Transmute → Alter → Augment → Regal → Finish → Recover
→ Goal
```

The concise rail uses `1 Fracture`, while the selected-node detail exposes the full player target and exact technical ID `AfflictionJewelSmallPassivesGrantAttributes3`. The selected graph IDs begin `node_start, node_acquisition`.

## 11. Terminal deduplication method

Graph construction now removes canonical `SUCCESS` steps from ordinary action-node mapping and appends exactly one terminal node:

- resolved/certified graph: `Goal` / `TERMINAL_SUCCESS`;
- unresolved graph: one `Unresolved Target` / `UNRESOLVED_FRONTIER`.

The rail uses that same node and does not append a second synthetic `Complete`. V9 observed one terminal node, one `Goal` chip, and zero `Complete` chips for one-, two-, and four-mod results.

## 12. One-mod exact-fixture regression

Fixture: Large Cluster Jewel, 10% increased Attack Damage, item level 84, 12 passives, any final rarity, extra affixes allowed, exact T1 increased Effect target.

| Measurement | Final value |
| --- | ---: |
| Expected full-route cost | 8.78356143333325c |
| Acquisition | 4.00000000000000c |
| Downstream | 4.78356143333325c |
| Reconciliation difference | 1.07e-14c |
| Selected nodes | 5 |
| Selected edges | 4 |
| Terminal nodes / Goal chips / Complete chips | 1 / 1 / 0 |

Expected currency use remains exact: 30.346667 Alterations, 7.836667 Augmentations, one Transmutation, and one clean base. The expected-cost regression stayed inside the required 8.7–8.9c window.

## 13. Harvest state-explosion measurements

For eligible T1 Armour + T1 Evasion, authoritative Harvest Reforge Defences generation produces:

| Exact transition class | Count |
| --- | ---: |
| Total physical outcomes | 140,076 |
| Target-success outcomes | 743 |
| Miss outcomes | 139,333 |
| Literal family state budget | 5,000 |
| Final retained quotient states | 440 |
| Outcome-to-retained-state ratio | 318.3545× |

The pre-Phase 2V literal miss frontier is about 28 times larger than the entire 5,000-state family budget before downstream repetition is considered. It therefore returned `UNRESOLVED` even though every miss could legally apply the same full reroll again. The certified representation closes the repeat behavior with 440 retained states.

## 14. Repeatable-reroll quotient equivalence proof

The new action-level `REPEATABLE_FULL_REROLL_V1` contract declares only mechanics facts already implemented by Harvest: fractured affixes persist, all non-fractured affixes are replaced, and the next distribution depends only on the persistent kernel.

Certification regenerates the authoritative distribution and audits every outcome:

- total probability mass = 1.0000000000001161;
- every one of 139,333 misses keeps the action legal;
- every miss maps to the same persistent kernel;
- persistent/fractured components are identical;
- nonpersistent affixes are replaced;
- success is absorbing for the requested target;
- only the certified reroll may be legal in a quotient state.

The family-scoped key falls back to the full canonical state key for:

- exact successful terminal states;
- a different persistent kernel;
- any state where another enabled action is legal;
- any state outside the independently constrained certified family.

The compact key includes mechanic ID, kernel identity, and required-action evidence. Normal product search, Open search, Conventional search, self-fracture search, and global state identity are unchanged.

## 15. Harvest exact probability and expected applications

The weighted authoritative distribution gives:

```text
p(success per Harvest application) = 0.004843655474498472
                                   = 0.4843655474498472%

E[applications] = 1 / p
                = 206.45564187315432
```

The independently solved Bellman policy reports 206.45564187753305 expected Harvest applications; its difference from `1/p` is below 5e-9 applications.

## 16. Harvest cost, actions, and time reconciliation

At the pinned stale Allflame research rates:

| Component | Expected count | Expected cost |
| --- | ---: | ---: |
| Harvest Reforge Defences | 206.4556418775 | 572.4498810159c |
| Regal Orb | 1.0000000000 | 0.1190000000c |
| Orb of Transmutation | 1.0000000000 | 0.0110200000c |
| Clean base acquisition | 1 base, 0 virtual physical actions | 1.0000000000c |
| **Total** | **208.4556418775 physical actions** | **573.5799010159c** |

The Harvest route uses 15,484.173140815 Primal Lifeforce at 75 per application. Non-Lifeforce cost is 1.130020c. Downstream cost is 572.579901c and acquisition is 1c. Estimated manual time is 413.711284s with the retained `DEFAULT_APPROXIMATE` effort confidence.

Versus Conventional, Harvest costs 345.670462c more but saves 1,293.738419 physical actions and 187.166341s. The price-derived crossover is 0.014645885c per Primal Lifeforce; the pinned current rate is 0.03697c, so `RESOLVED_MORE_EXPENSIVE` is correct.

## 17. Seeded Monte Carlo comparison

Two independent seeded checks passed:

| Check | Trials | Analytical | Empirical | Difference |
| --- | ---: | ---: | ---: | ---: |
| Geometric repeat-count simulation | 20,000 | E[N] 206.455642 | mean 208.466450 | 0.974% relative |
| Actual shared `sampleTransition` mechanic | 20,000 applications | p 0.004843655 | 112 successes, p 0.005600 | 15.6% relative, within the fixed 30% gate |

The actual-mechanic sample is independent of the analytical enumeration. Neither sample tunes or changes mechanics probabilities.

## 18. Armour + Evasion Open/Conventional/Harvest table

All three families were independently solved from the same exact fixture and price book.

| Family | Status | Full-route cost | Physical actions | Manual time | Retained states | Policy health |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Open | `SELECTED_WINNER` | 184.652689c | 1,270.165 | 508.066s | 5,000 | fully resolved, proper, absorbing, reconciled |
| Conventional | `MORE_EXPENSIVE` | 227.909439c | 1,502.194 | 600.878s | 5,000 | fully resolved, proper, absorbing, reconciled |
| Harvest Reforge Defences | `MORE_EXPENSIVE` | 573.579901c | 208.456 | 413.711s | 440 | fully resolved, proper, absorption 1, optimal over modeled family actions, reconciled |

Harvest was not forced to win. It resolved honestly and lost on current chaos cost.

## 19. On-policy action-set difference

The final action evidence is:

| Family | Observed on-policy actions |
| --- | --- |
| Open | Alteration, Augmentation, Exalted, Regal, Scouring, Transmutation |
| Conventional | Alteration, Augmentation, Exalted, Regal, Scouring, Transmutation |
| Harvest | Harvest Reforge Defences, Regal, Transmutation |

Open and Conventional share action IDs here but differ because their independent searches retain different policy/state frontiers and costs: Open resolves at 184.653c while the explicitly constrained Conventional solve resolves at 227.909c. Harvest has a materially different required-action policy with 206.456 observed reforge visits. Method cards are compared only after independent solves; no family is relabeled from the Open result.

## 20. Four-mod preservation result

The exact target IDs remain:

- `AfflictionJewelSmallPassivesGrantInt3`;
- `AfflictionJewelSmallPassivesGrantAttributes3`;
- `AfflictionJewelSmallPassivesHaveIncreasedEffect2`;
- `AfflictionJewelSmallPassivesGrantES3`.

The final real-browser result naturally selects self-fracture of `+4 All Attributes (T1)`. It reports:

| Measurement | Final value |
| --- | ---: |
| Acquisition | 1,477.941256c |
| Downstream | 2,666.695662c |
| Full route | 4,144.636918c |
| Reconciliation difference | 1.82e-12c |
| On-policy states / terminals | 462 / 2 mathematical terminal states |
| Absorption | 1.000000000000 |
| Proper / unresolved on policy | true / 0 |

The Constellation presentation has one visual Goal terminal even though the exact Markov policy may contain multiple mathematical success states.

## 21. Stable screenshots and Worker differential evidence

Committed Phase 2V images:

- `quality-lab/reports/evidence/phase2v-one-mod-clean-graph.png`;
- `quality-lab/reports/evidence/phase2v-self-fracture-chronology.png`;
- `quality-lab/reports/evidence/phase2v-scrolled-above-playing.png`;
- `quality-lab/reports/evidence/phase2v-horizontal-route-rail-follow.png`;
- `quality-lab/reports/evidence/phase2v-armour-evasion-comparison.png`.

The final report records 229 real Worker messages across the retained release flow, including progress, completion, result, intentional replacement, and a real error response. Replay, camera, rail following, and the Phase 2V idle/memory interval added **zero** Worker responses. `worker-events.json` is committed; trace/video/full-event artifacts remain local release artifacts rather than deploy payload.

## 22. Performance and memory comparison

| Measurement | Final observation | Result |
| --- | ---: | ---: |
| Harvest family elapsed / budget | 2,372 ms / 15,000 ms | **PASS** |
| Physical outcomes / retained states | 140,076 / 440 | **318.4× compact** |
| Phase 2V idle Worker additions | 0 | **PASS** |
| Phase 2V short heap delta | 0 bytes | **PASS** |
| Phase 2U five-minute heap | 21,569,608 → 21,770,656 bytes | +201,048 bytes |
| Phase 2U five-minute DOM nodes | 82 → 81 | no growth |
| Real render sample | 60.065 FPS | **PASS** |
| Five-second render max long task | 68 ms | recorded and within gate |

The five-minute reduced-motion/fullscreen/Screensaver soak completed in 308,420 ms. Camera/replay remains presentation-only and starts no solver work.

## 23. Local release command results

| Command | Final result |
| --- | --- |
| `npm run build` | **PASS** |
| `npm run lint` | **PASS** |
| `git diff --check` | **PASS** |
| `npm run diagnostic:mature` | **PASS — 16/16** |
| `npm run lab:no-fallback-probe` | **PASS — unavailable app/browser fail hard** |
| `npm run lab:phase2v` | **PASS — 13/13 dedicated gates** |
| `npm run lab:release` | **PASS — 51/51, Chromium 151.0.7922.34** |
| `npm run diagnostic:phase2t` | **PASS — T1–T16** |
| `npm run diagnostic:phase2u` | **PASS — U1–U17** |
| `npm run diagnostic:phase2v` | **PASS — V1–V17** |
| `npm run diagnostic:phase2v:committed` | **PASS** |

Authoritative release run `2026-08-26T02-43-47-841Z` ran from 02:43:47.842Z to 02:54:30.467Z and reported zero console, page, or network errors.

One pre-final full run correctly failed retained U12 because the new rail chip contained the full `Create Fractured +4 All Attributes (T1)` detail. That run was stopped and does not count as release evidence. The rail was restored to the Phase 2U concise `1 Fracture` contract while the full player/exact-ID detail stayed in the node panel; the dedicated 13/13 and final 51/51 runs then passed.

## 24. Hosted lean evidence and deploy result

Automatic Pages validation remains intentionally lean:

```text
npm run build
npm run lint
git diff --check
npm run diagnostic:phase2v:committed
```

It does not run `diagnostic:mature`, `lab:no-fallback-probe`, or `lab:release`. The extended Phase 2V workflow has `workflow_dispatch` only and no schedule.

The first implementation deploy, run `32924795839`, failed only because Windows-style report artifact separators were interpreted literally on Linux. No product or browser gate failed. Commit `328bc9f` normalizes either slash form inside the lean auditor.

Final hosted run [32924883911](https://github.com/jpitty03/cluster-jewel-research/actions/runs/32924883911) passed. Its build, lint, diff check, committed Phase 2V evidence audit, Pages artifact upload, and Pages deployment all completed successfully. No heavyweight solver or Playwright release command ran remotely.

## 25. Release label and version

Public label: **Browser-Verified Release Candidate 2V.1**.

Canonical presentation schema, graph layout, copied/exported result version, retained diagnostics, and browser differential evidence all use `2V.1`. Phase 2S public-beta certification remains reopened; this phase does not overclaim public-beta status.

## 26. Unit tests added or run

**NO.**

No unit-test file, command, or CI step was added. Validation used deterministic diagnostics, authoritative probability enumeration, seeded Monte Carlo, the real Worker, and real Playwright Chromium.

## 27. Mechanics probabilities changed

**NO.**

Harvest analytical and sampled transitions call the same shared mechanic. The reset helper centralizes existing behavior—preserve fractures, replace non-fractured affixes, keep the existing tagged-roll/3-or-4-affix probabilities—without changing weights or probabilities. Certification consumes those transitions; it does not manufacture or tune them.

## 28. Hardcoded route winner or prohibited ranking added

**NO.**

- Harvest is not forced; it resolves and is more expensive at the pinned price.
- No route winner or fracture target is hardcoded.
- Acquisition context comes from selected exact portfolio evidence.
- Global/open state identity is not weakened.
- Market-fractured purchase ranking remains absent.
- The certified key is family-scoped and dynamically falls back to full identity whenever another action is legal.

## 29. Remaining known limitations

- Pricing evidence is a stale bundled Allflame research snapshot. Costs and the Harvest crossover must be recomputed from current prices before player spending decisions.
- Harvest mechanics confidence remains `APPROXIMATE / EXTERNALLY CLOSE`; Phase 2V proves internal analytical/sampling consistency and policy closure, not exact external game parity.
- Manual-time estimates retain `DEFAULT_APPROXIMATE` confidence.
- The certified quotient applies only when an action declares the full-reroll kernel contract and passes every legality/kernel/action-set audit. Other large repeatable families remain literal unless separately certified.
- Self-fracture + Harvest families keep their retained independent-search behavior; Phase 2V does not force them through the clean Harvest closure.
- Complex four-mod selection remains best among resolved alternatives at the interactive proof budget, not a claim of global optimality.
- Heavy release evidence is deliberately local. Hosted Pages validates the committed evidence contract and build hygiene; its manual extended matrix is troubleshooting evidence, not the completion oracle.

## Completion statement

Phase 2V is complete. Animation moves inside its own horizontal rail without taking document-scroll or focus ownership; Constellation chronology describes the selected physical acquisition route with one visual terminal; and eligible T1 Armour + T1 Evasion Harvest closes through generic, audited mechanics with exact probability, action, Lifeforce, cost, proof, Worker, and browser evidence.
