# Phase 2X Craft-Plan Semantics, Budget UX, and Proof-Depth Completion Report

Date: 2026-08-26  
Branch: `main`  
Baseline: `b86ebddb9ed8816244c3697899e4c29d4a714c91`  
Implementation and committed evidence: `fad3c4a876f6f1641f2da3ccc0f387c2a434e02a`

## 1. Final implementation and evidence commits

- `fad3c4a876f6f1641f2da3ccc0f387c2a434e02a` — Phase 2X implementation, diagnostics, real-browser harness, regenerated mature evidence, screenshots, Worker log, semantic matrix, and passing release report.
- Completion report — the documentation-only commit containing this file; its hash is recorded in the final handoff because a Git commit cannot contain its own hash.
- The newer user-owned data commit `4e06388da42d9e875b231519abdea0509f8d6c0e` (`feat: add Allflame league trade price dataset`) remains an ancestor of both commits.

## 2. Files changed

The implementation/evidence commit changes 65 files. The material groups are:

- Craft-plan semantics: `crafting-engine/src/service/craftPlan.ts` and `crafting-engine/src/domain/VisualizationGraph.ts`.
- Release schema/share compatibility: `crafting-engine/src/service/optimizerService.ts` and `crafting-engine/src/service/shareBundle.ts`.
- Product UX: `src/CraftOptimizer.tsx` and `src/App.css`.
- Phase 2X fixture and browser harness: `quality-lab/fixtures/fixtureCorpus.json` and `quality-lab/src/runner.ts`.
- Local/committed diagnostics: `scripts/phase2xDiagnostics.ts`, the Phase 2T/2U/2V/2W evidence auditors, and `package.json`.
- Hosted/local policy: `.github/workflows/deploy.yml` and `.github/workflows/nightly-quality.yml`.
- Stable Phase 2X evidence: the before/after JSON, 11-case semantic matrix, exact export, seven reviewed screenshots, Worker event log, `release-gate.json`, and `summary.md` under `quality-lab/reports/`.
- Refreshed mature outputs: Phase 2E–2W diagnostic text artifacts and the new Phase 2X diagnostic output.

No mechanics-probability, solver-transition, or state-identity source file changed.

## 3. Phase 2W preservation matrix

| Phase 2W behavior | Phase 2X evidence | Result |
|---|---|---|
| Atomic selected bundle and cost reconciliation | W2–W4 plus X8/X17 | Preserved; browser full-route difference `4.55e-13c` |
| Unified Cheapest/Fewest/Fastest selection | W5–W13 | Preserved, including all nine ceiling boundaries |
| Objective-aware pruning and proof labels | W10–W12 | Preserved |
| Cluster Jewels optimizer handoff | W14–W20 and X8 | Preserved for exact three-notable handoff, export, and share/reload |
| Worker/session reuse and lifecycle | W21, X10, X11, X17 | Preserved |
| Phase 2V Harvest mechanics/proof behavior | V10–V16 and X4/X5 | Preserved |
| Player-facing labels and exact Technical IDs | U2–U17 and X8 | Preserved |
| Lean hosted deployment policy | X19/X20 and workflow run `32996630092` | Preserved and advanced to committed Phase 2X evidence |

The final browser run retained 64 passing Phase 2T–2W gates before the Phase 2X gate block.

## 4. Exact phantom-Harvest root cause

`buildCraftPlan` collected every positive selected-source entry into one untyped action list. An action without a recognized mechanics phase was assigned `SPECIALIZED` through `selectedPolicyPhase(...) ?? 'SPECIALIZED'`. The positive acquisition accounting entry `clean_base_initial` therefore became a chronological specialized step. `VisualizationGraph` then interpreted every `SPECIALIZED` step as `Harvest`/`HARVEST_REFORGE`, even though the selected canonical policy contained no `harvest_reforge_*` action.

The repair removes both guesses. Classification is now metadata/ID-contract driven, and unknown positive actions fail closed.

## 5. Before/after three-notable action evidence

The frozen pre-fix reproduction selected self-fracture Riot Queller with zero selected Harvest actions, but emitted:

- plan phase `SPECIALIZED` with `clean_base_initial`;
- instruction `Use Initial clean cluster jewel base...`;
- selected Constellation node `Harvest` with kind `HARVEST_REFORGE`.

The post-fix direct diagnostic selected the independently discovered self-fracture Prodigious Defence route and recorded:

- physical mechanics: Fracture, Alter, Exalt, Scour, Regal, Augment, Reacquire, and Transmute;
- selected Harvest actions: none;
- plan Harvest actions: none;
- selected Constellation Harvest nodes: none;
- `clean_base_initial` retained as one `4c` acquisition-accounting row and explicitly excluded from mechanics;
- uncovered, invented, and unknown mechanics: none.

The real handoff browser run independently selected self-fracture Riot Queller at `1669.629930c`; it produced the same no-Harvest invariant. Winners were observed, never asserted.

## 6. Canonical action taxonomy contract

`classifyCraftPlanAction` has four exhaustive presentation outcomes:

| Kind | Contract | Player-plan behavior |
|---|---|---|
| `CRAFT_MECHANIC` | Registered `CRAFT_MECHANICS`, registered Harvest definition, or dynamic `restart_reacquire` | May receive its metadata-derived phase/name/compact label |
| `ACQUISITION_RESOURCE` | Explicit accounting ID contract, currently `clean_base_initial` | Remains in acquisition accounting; never becomes a chronological mechanic |
| `VIRTUAL_SERVICE` | Explicit `acquire_*`, `method:`, `bundle:`, and `candidate:` service namespaces | Audited exclusion; never rendered as a physical craft action |
| `UNKNOWN` | No registered metadata or explicit ID contract | Exact ID retained; plan withheld fail-closed |

No player-facing name matching or generic `SPECIALIZED` fallback participates in classification.

## 7. Unknown-action fail-closed behavior

The injected positive action `phase2x_unknown_positive_action` classifies as `UNKNOWN`, has no phase, and remains in `unknownActionIds`. The resulting plan is `UNCERTIFIED`, exposes zero chronological steps, supplies a withheld reason, and creates no selected Harvest node. Exact diagnostic IDs remain available in Advanced/export evidence.

## 8. Acquisition/resource exclusion behavior

`clean_base_initial` is still additive full-route acquisition accounting. In the browser handoff it was one expected acquisition row at `46c`; in the frozen direct diagnostic it was one row at `4c`. In both cases it was present in `excludedAccountingActionIds` and absent from every plan step and selected Constellation mechanic node. Service wrappers are likewise retained in `excludedVirtualActionIds`.

## 9. Selected-plan coverage and invention audit

For every executable semantic-matrix case:

- selected physical mechanic IDs equal represented plan mechanic IDs;
- `uncoveredActionIds` is empty;
- `inventedActionIds` is empty;
- `unknownActionIds` is empty;
- DOM `data-action-id` mechanics match the independently extracted raw selected bundle.

Seven executable cases were checked directly by X7. Coverage mismatch now makes the plan `UNCERTIFIED` and withholds steps instead of publishing a partial guide.

## 10. Actual Harvest positive control

The independently solved Fewest Actions Armour + Evasion fixture selected `bundle:family_harvest_defences`. Raw evidence, plan, How to craft, and Constellation all contained exactly `harvest_reforge_defences`; the plan visibly rendered `Use Harvest Reforge Defences`. Lifeforce economics remained covered by the mature Phase 2V/2W gates.

## 11. Harvest-not-selected negative control

The same eligible method family under Cheapest selected `core:clean-open-policy`. Its raw selected bundle, plan, How to craft, and Constellation contained no Harvest mechanic even though Harvest remained eligible/independently comparable. The separate one-mod witness also retained the honest `NOT_SEARCHED` family state.

## 12. Constellation semantic differential

The selected three-notable browser route contained these selected nodes:

`Start → Fracture → Transmute → Alter → Augment → Regal → Finish → Recover → Goal`

The selected node mechanics exactly match the canonical selected plan. A Constellation node receives `HARVEST_REFORGE` only when its step contains a classified mechanic whose action type is actually `HARVEST_REFORGE`. Clean-base accounting and service wrappers never appear as route mechanics. The chronology retains one terminal Goal.

## 13. Search-depth preset table

| Preset | States | Requested wall time | Expansion rounds |
|---|---:|---:|---:|
| Normal | 5,000 | 30s | 3 |
| Deep | 10,000 | 60s | 4 |
| Very Deep | 20,000 | 120s | 5 |
| Research | 50,000 | 300s | 6 |
| Custom | Raw Advanced values | Raw Advanced value | Raw Advanced value |

Direct edits switch the control to Custom. Values above the measured Research envelope display a warning while retaining cancellation and the requested-runtime host guard.

## 14. Measured safe maximums

The deepest fully exercised chained request was Very Deep (`20,000 / 120s / 5`) with real retained work. Research (`50,000 / 300s / 6`) was browser-verified for exact request transmission, prompt cancellation, Worker replacement, host-guard safety, and recovery; this phase does not claim that every Research solve finishes within 300 seconds. No preset exceeds that measured interaction envelope.

## 15. Retry Deeper preview and actual-request evidence

The button previews the exact next request before work starts:

`20k states · up to 120s · 5 rounds · reuses compatible retained graph`

Normal→Deep sent exactly `10,000 / 60,000ms / 4`; the second retry sent exactly `20,000 / 120,000ms / 5`. The DOM preview data, visible copy, and Worker requests agreed. The preview contrast was visually corrected and re-captured after the first review.

## 16. Retained-state reuse evidence

- Deep reported 270 compatible retained states.
- Very Deep reported 10,000 compatible retained states.
- Exactly three optimize requests represented Normal, Deep, and Very Deep.
- The compatible incumbent was retained across all depths.

## 17. Cancel and host-guard evidence

The Research request returned control on cancellation in `119.86ms`; the old Worker terminated, a new Worker spawned, and a subsequent Normal request recovered to `BEST_RESOLVED_ACQUISITION_SAFE`. The one-millisecond host-guard probe passed, and recovered Normal used the unchanged `30,250ms` host-guard deadline.

## 18. Incumbent monotonicity evidence

The compatible objective incumbent was `6.368169700c` at Normal, Deep, and Very Deep. Deeper requests neither lost nor worsened the retained executable route.

## 19. Three-notable market-vs-craft wording

The real handoff card displayed:

- `Market sampled low`: `2562.000c`;
- `Selected executable route EV`: `1669.630c`;
- `Spread using this executable route`: `+892.4c`;
- `A cheaper crafting route may exist; resolving it would increase the modeled spread, not invalidate this executable route's EV.`
- `Expected value, not guaranteed profit.`

The card preserved the Allflame sampled-low provenance and did not describe a provisional route as globally cheapest.

## 20. Generated browser semantic matrix

Seed: `phase2x-action-semantic-matrix-v1`  
Corpus: `Phase2X-Frozen-Browser-Corpus-1`  
Browser: Playwright Chromium `151.0.7922.34`

All 11 cases passed: clean one-mod, clean two-mod, real three-notable handoff, selected self-fracture, selected actual Harvest, eligible/not-searched Harvest, independently searched Harvest not selected, Fewest/Harvest, Fastest/conventional, provisional four-mod fracture, and unresolved frontier. The artifact records inputs, bundle IDs, raw actions, exclusions, plan mechanics, Constellation Harvest state, and unresolved families.

## 21. Screenshots reviewed

The following final real-browser images were manually inspected:

- `phase2x-three-notable-constellation.png` — correct no-Harvest fracture chronology and readable route rail;
- `phase2x-harvest-selected-plan.png` — actual Harvest step present;
- `phase2x-harvest-eligible-not-selected-plan.png` — eligible but unselected Harvest absent;
- `phase2x-budget-presets-desktop.png` — readable desktop control;
- `phase2x-budget-presets-mobile.png` — readable 390px control with no horizontal overflow;
- `phase2x-retry-deeper-preview.png` — exact, readable deeper-budget preview;
- `phase2x-three-notable-market-proof.png` — selected-route EV and proof-honest spread wording.

Inherited Phase 2U/2V camera, mobile, chronology, and four-mod images were regenerated by the same passing release run.

## 22. Unexpected bugs found and fixed

- Root product defect: an untyped accounting action defaulted to SPECIALIZED and then to Harvest.
- Visual review: Retry Deeper's secondary line was too dim; it now inherits button color with controlled opacity and was re-captured.
- Browser harness: the preserved Phase 2U scenario name and one selected-node evidence variable were stale; both were corrected without weakening assertions.
- Worker differential: reused request IDs across Worker generations could make an evidence slice ambiguous; X17 now scopes events from the exact Worker-generation offset.
- Legacy diagnostics: Phase 2T/2U/2V CI-policy assertions still named the prior Phase 2W committed audit; they now require and report Phase 2X.

No ordinary failure was waived. Each issue was fixed, regression evidence was retained, and the full gate was rerun.

## 23. Worker, DOM, export, and share differential

For exact request `optimizer_1`, the scoped Worker stream ended with `COMPLETE` sequence 498 then `RESULT` sequence 499. Worker selected route, public DOM route, canonical bundle, plan, Constellation, materials, export, and share/reload all agreed on self-fracture Riot Queller. Export and share schema versions were both `2X.1`; exact IDs remained in technical evidence.

## 24. Performance and memory measurements

- Simple Normal browser result: `204ms` in the X18 control.
- Normal→Deep→Very Deep: three Worker requests, no preview-created Worker job.
- Retained states: 270 at Deep and 10,000 at Very Deep.
- Measured memory delta across the retry sequence: `0 bytes`.
- Classification occurs only during result presentation and starts no additional Worker or main-thread solver graph.
- Inherited Constellation gate: `60.11 FPS`, with interaction adding zero Worker messages.
- Release error arrays: console `0`, page `0`, network `0`.

## 25. Final local release command matrix

| Command | Final result |
|---|---|
| `npm run build` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS |
| `npm run diagnostic:mature` | PASS, 16/16 mature diagnostics |
| `npm run diagnostic:phase2t` | PASS |
| `npm run diagnostic:phase2u` | PASS |
| `npm run diagnostic:phase2v` | PASS after current Phase 2X CI-policy wording audit |
| `npm run diagnostic:phase2w` | PASS |
| `npm run diagnostic:phase2x` | PASS |
| `npm run lab:no-fallback-probe` | PASS; hard failure observed for unavailable app and browser |
| `npm run lab:release` | PASS, 95/95 real-browser gates; Phase 2X 20/20 |

The authoritative release run ID is `2026-08-26T17-32-13-469Z`, using real Playwright Chromium `151.0.7922.34`. Unit tests were not added or run.

## 26. Hosted lean deployment result

Implementation commit `fad3c4a876f6f1641f2da3ccc0f387c2a434e02a` deployed successfully in GitHub Actions run [32996630092](https://github.com/jpitty03/cluster-jewel-research/actions/runs/32996630092).

- `validate-and-build`: PASS in 14s.
- `npm ci`, build, lint, diff, committed Phase 2X evidence audit, and Pages artifact upload: PASS.
- `deploy`: PASS in 10s.
- GitHub Pages status: `built`, HTTPS enforced.
- Hosted URL: <https://jpitty03.github.io/cluster-jewel-research/>.
- Hosted verification returned HTTP 200 and referenced the exact locally built `index-DWQa9EMy.js` and `index-CMRzJexR.css` assets.

The heavyweight browser/solver matrix remains local; the remote extended matrix is manual-only.

## 27. Release label and version

Public release label, canonical presentation schema, export payload, and new share payload are `2X.1`. Share decoding remains backward compatible with `2R.1` and `2W.1` payloads.

## 28. Unit tests

Unit tests added: **NO**.  
Unit tests run: **NO**.

Validation used mature diagnostics and real Playwright browser gates as required.

## 29. Mechanics probabilities

Mechanics probabilities changed: **NO**. Harvest, fracture, currency, action legality, transition, and Lifeforce economics source remained unchanged.

## 30. Hardcoded winners and prohibited shortcuts

- Hardcoded route, Harvest, target-order, or fracture winner added: **NO**.
- State identity weakened: **NO**.
- Pre-fractured market ranking reintroduced: **NO**.
- Generic SPECIALIZED/Harvest fallback retained in production: **NO**.
- The observed Prodigious Defence/Riot Queller selections are evidence only, not assertions.

## 31. Remaining limitations and recommended next field tests

- The exact three-notable result is `PROVISIONAL_RESOLVED`; self-fracture Smite the Weak remains a competitive unresolved family. The selected route is executable and reconciled, but global cheapest-route proof is not claimed.
- Research was validated for request semantics, cancellation, Worker replacement, and host-guard recovery, not guaranteed completion for every craft.
- Market spread remains an expected-value comparison against timestamped sampled-low data; pricing freshness and realized craft variance remain external product risks.
- Next field testing should follow the real player flow: Cluster Jewels discovery → Optimize handoff → Normal → suggested deeper preset only when proof debt matters → Compare Methods when alternatives matter.
- Collect player feedback on whether the chronological guide is understandable in-game, and prioritize proof-efficiency/current-pricing work from that evidence rather than pre-committing another architecture phase.

## Completion verdict

Phase 2X is complete. The player craft guide and selected Constellation route are now lossless, fail-closed projections of the canonical selected bundle; accounting resources cannot masquerade as mechanics; real Harvest appears if and only if Harvest is selected; and proof-depth controls expose bounded deeper search without weakening Worker safety or release truthfulness.
