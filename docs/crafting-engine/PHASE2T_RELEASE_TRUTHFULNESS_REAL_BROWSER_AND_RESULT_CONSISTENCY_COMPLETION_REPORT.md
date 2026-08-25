# Phase 2T Release Truthfulness, Real Browser, and Result Consistency Completion Report

Date: 2026-08-25
Source of truth: `POST_PHASE2S_REVIEW_AND_PHASE2T_RELEASE_TRUTHFULNESS_REAL_BROWSER_AND_RESULT_CONSISTENCY_PLAN.md`
Release-gate result: **PASSED — 24/24 real-browser gates**
Phase 2T diagnostic result: **PASSED — T1 through T16**

## 1. Implementation commit

The Phase 2T implementation and its stable release evidence are committed as:

```text
b7168534b7d1c69ef1d58f245d5cec8d3208fd57
```

Commit subject: `Implement Phase 2T real-browser release validation`.

## 2. Release-status reclassification

Phase 2S public-beta certification remains reopened. The application is now labeled **Browser-Verified Release Candidate 2T.1**. This is intentionally narrower than a restored public-beta claim: the real browser, result-consistency, and retained-feature gates pass, while stale market data, approximate Harvest mechanics, and unresolved complex-family proof debt remain visible.

## 3. Files changed

The implementation commit changes 72 files. Principal groups are:

| Area | Principal files and outcome |
| --- | --- |
| Solver identity and contracts | `crafting-engine/src/domain/ItemState.ts`, `MethodFamily.ts`, `rules/actionDiscovery.ts`, `solver/genericSearch.ts` |
| Canonical result construction | `crafting-engine/src/service/optimizerService.ts`, `shareBundle.ts` |
| Public UI | `src/CraftOptimizer.tsx`, `src/App.css`, `src/components/MarkovConstellation.tsx`, `OnboardingModal.tsx` |
| Real Worker protocol | `src/crafting/optimizer.worker.ts`, `optimizerWorkerClient.ts`, `optimizerWorkerProtocol.ts` |
| Real-browser lab | `quality-lab/src/appLauncher.ts`, `eventCapture.ts`, `runner.ts`, `noFallbackProbe.ts`, fixture corpus, Playwright package files |
| CI | `.github/workflows/deploy.yml`, `.github/workflows/nightly-quality.yml` |
| Diagnostics | `scripts/matureDiagnostics.ts`, `scripts/phase2tDiagnostics.ts`, corrected Phase 2N/P/Q/S diagnostics and generated output files |
| Stable evidence | `quality-lab/reports/release-gate.json`, `summary.md`, three screenshots, and compact actual Worker trace |

The synthetic Quality Lab oracle/scenario modules and Phase 2M/2N/2P simulated browser-smoke scripts were deleted. The retained Phase 2S compatibility command now delegates to the real Playwright harness.

## 4. Real-browser tool and version

The final release run used **Playwright 1.62.1 with Chromium 151.0.7922.34** against the built Vite production bundle. Run ID:

```text
2026-08-25T18-47-19-833Z
```

The authoritative report is `quality-lab/reports/release-gate.json`.

## 5. Proof that release-mode simulation fallback is removed

- `appLauncher.ts` requires the built `dist/index.html` and fails if the production entry is unavailable.
- Chromium is launched directly by Playwright; launch failure aborts the run.
- `noFallbackProbe.ts` deliberately supplies a missing build and a missing browser executable. Both paths hard-failed, and the probe passed only because no substitute result was produced.
- Release mode contains no synthetic app, DOM, Worker, canvas, timing, or success fallback.
- The final release run passed 24/24 with zero console, page, or network errors.

## 6. Quality Lab dependency and isolation audit

The lab has its own locked package boundary under `quality-lab/`: Playwright is a lab-only development dependency, with `tsx` and TypeScript as lab runtime dependencies. A source audit found **zero imports from `crafting-engine/src` or the production `src` tree** in `quality-lab/src`.

The lab observes the application only through the built HTTP surface, real DOM, native browser Worker wrapper, clipboard/download behavior, screenshots, video, trace, browser performance APIs, and canvas pixels.

## 7. Actual Worker event trace summary

Stable evidence: `quality-lab/reports/evidence/worker-events.json`.

| Event | Observed count |
| --- | ---: |
| Worker spawns | 4 |
| Requests posted to Workers | 20 |
| Messages received from Workers | 183 |
| Worker terminations | 3 |

The trace contains real `PROGRESS`, `COMPLETE`, `RESULT`, and `ERROR` responses. Successful requests emit `COMPLETE` immediately before `RESULT`. Cancellation and the forced host guard both terminate a Worker, spawn a replacement, and recover to `BEST_RESOLVED_ACQUISITION_SAFE`. The full transient trace, video, and Playwright trace are written beneath the ignored run artifact directory; the compact stable trace preserves the audited event sequence and canonical result fields.

## 8. Exact four-mod browser result consistency table

Fixture: Large Cluster Jewel, `10% increased Attack Damage`, item level 84, 12 passives, Rare, extra affixes allowed. Exact targets:

- `AfflictionJewelSmallPassivesGrantInt3`
- `AfflictionJewelSmallPassivesGrantAttributes3`
- `AfflictionJewelSmallPassivesHaveIncreasedEffect2`
- `AfflictionJewelSmallPassivesGrantES3`

| Surface or invariant | Observed final value |
| --- | --- |
| Recommendation status | `PROVISIONAL_RESOLVED` |
| Selected route | `Start self-fracture: Glowing (T1)` |
| Proof label | `Best among resolved alternatives` |
| Pricing label | `RESEARCH_ESTIMATE_STALE_PRICING` |
| Acquisition U | 1465.7662757333542c |
| Downstream U | 3793.4274504828263c |
| Full-route U | 5259.193726216181c |
| Reconciliation residual | 1.8189894035458565e-12c |
| Material rows | 9 acquisition, 6 downstream, 10 merged |
| Policy health | 398 reachable states, 2 terminal states, proper, absorption 1, unresolved on-policy probability 0 |
| Acquisition families | 5, with the four finite fracture acquisition statuses consistent across standalone and paired cards |
| Export | Schema `2T.1`; canonical presentation, full-route usage, and shopping vector equal the Worker result |
| Images | Real 1280px desktop and 390px mobile full-page screenshots; document width equals viewport width at 390px |

The DOM selected-route identity, proof label, cost scopes, material tables, method cards, advanced details, JSON export, and screenshot state all came from the same captured Worker result.

## 9. Proof-language before and after

| Rejected/unscoped wording | Phase 2T wording |
| --- | --- |
| `Strictly optimal` | `Portfolio optimal — proven` only when that proof exists; otherwise `Best among resolved alternatives` |
| `Optimal trade-off frontier` | `Current resolved Pareto set` |
| Implied dominance over unresolved competitors | `Dominates the currently resolved comparison routes` |
| `Public Beta certified` | `Browser-Verified Release Candidate 2T.1` |

Source and rendered-page audits confirm the rejected proof phrases are not exposed as product claims.

## 10. Canonical result scope model

`CanonicalResultPresentation` schema `2T.1` is the authoritative presentation contract. It carries selected-route identity/status, proof label, pricing label, Harvest lifecycle, acquisition/downstream/full-route U values, four timing milestones, six work scopes, and method-family status counts.

`FullRouteUsageSummary` separately carries acquisition actions/currencies/cost, downstream actions/currencies/cost, and the deduplicated combined action/currency/cost view. The UI, export, bug-report bundle, and browser differential assertions consume these same fields; none reconstruct a competing total from display text.

## 11. Full-route materials reconciliation

For the final exact four-mod browser result:

```text
1465.7662757333542c acquisition
+ 3793.4274504828263c downstream
= 5259.193726216181c full route
residual = 1.8189894035458565e-12c
```

Acquisition and downstream tables are non-overlapping scopes. The combined table merges identical action IDs once, explaining why 9 + 6 scoped rows become 10 combined rows. Virtual `acquire_*` menu transitions are excluded from physical usage; clean-base purchase and wrong-fracture reacquisition remain explicit economic rows.

## 12. Shopping-list reconciliation

The exact four-mod combined currency vector is:

| Currency/material | Expected quantity |
| --- | ---: |
| Alteration | 21232.411682626825 |
| Annulment | 33.54621756808432 |
| Augmentation | 898.1440015659149 |
| Initial clean base | 1 |
| Clean-base reacquisition | 3.000000000000043 |
| Exalted | 38.54621756810091 |
| Fracturing | 4.000000000000056 |
| Regal | 869.7973348992547 |
| Scouring | 865.7973348992423 |
| Transmutation | 4.000000000000053 |

The shopping list and exported `shoppingListCurrencies` equal `fullRouteUsage.combinedCurrencies`; each quantity equals acquisition plus downstream quantity for that currency.

## 13. Independent method-family evidence

The exact four-mod Compare Methods run produced 11 independently solved runnable families, each with its own session identity, constrained actions, retained state/transition counts, budget, stage statuses, and policy evidence. Chaos Reforge remains explicitly `NOT_MODELED` and receives no synthetic route.

| Family | Acquisition | Downstream | Full route | Result |
| --- | --- | --- | --- | --- |
| Open | Resolved | Resolved | Resolved | Selected winner |
| Conventional | Resolved | Unresolved | Unresolved | Unresolved at budget |
| Harvest Defences | Resolved | Unresolved | Unresolved | Unresolved at budget |
| Self-fracture Intelligence | Resolved | Unresolved | Unresolved | Unresolved at budget |
| Self-fracture Attributes | Resolved | Unresolved | Unresolved | Unresolved at budget |
| Self-fracture Increased Effect | Resolved | Resolved | Resolved | More expensive |
| Self-fracture Energy Shield | Resolved | Resolved | Resolved | Selected winner |
| Four fracture + Harvest pairs | Resolved | Unresolved | Unresolved | Independently searched; unresolved at budget |
| Chaos Reforge | Not applicable | Not applicable | Not applicable | Not modeled |

The browser gate also compares each standalone fracture acquisition L/U and status with its paired fracture+Harvest card. Deduplication is applied only after independent evaluation.

## 14. Harvest action evidence and lifecycle table

Required-action evidence is part of canonical solver state identity. A Harvest family cannot terminate merely because the target already matches: at least one required Harvest action ID must have occurred on-policy.

| Fixture | Lifecycle | Independent source | Harvest action on-policy | Result |
| --- | --- | --- | --- | --- |
| Initial eligible result before comparison | `ENABLED_NOT_SEARCHED` | Not yet searched | No | UI prompts Compare Methods |
| Armour + Evasion | `ENABLED_UNRESOLVED` | Yes | No resolved Harvest policy | 5,000 retained states; quantified budget blocker |
| Armour + Energy Shield | `ENABLED_UNRESOLVED` | Yes | No resolved Harvest policy | 5,000 retained states; quantified budget blocker |
| One-mod defensive witness | `RESOLVED_MORE_EXPENSIVE` | Yes | `harvest_reforge_defences`, 2.482721983514619 visits | Proper, absorbing, fully resolved, Bellman/occupancy converged, cost reconciled |

The lifecycle is shared by the Harvest comparison card, method card, advanced details, export, bug-report bundle, and Quality Lab assertions.

## 15. Corrected Lifeforce crossover calculation

The authoritative Harvest definition consumes **75 Primal Lifeforce per application**. For the resolved witness:

```text
expected applications = 2.482721983514619
expected Lifeforce    = 2.482721983514619 × 75
                      = 186.2041487635964

conventional full cost       = 11.357481259999986c
Harvest non-Lifeforce cost   = 10.130020000000115c
crossover unit price         = (11.357481259999986 - 10.130020000000115)
                               / 186.2041487635964
                             = 0.006592018857529578c per Primal Lifeforce
```

At the fixture's current price of 0.03697c per unit, Harvest totals 17.013987379790276c and is 5.65650611979029c more expensive. No generic 50-unit multiplier or Harvest-specific winner switch remains.

## 16. Armour + Evasion result

The real browser independently searched Harvest Defences with a 5,000-state, 15-second, three-round family budget. The Harvest family remained `ENABLED_UNRESOLVED`, with no falsely claimed on-policy Harvest route. Conventional resolved at 184.65268918864078c full-route cost (1c acquisition + 183.65268918864078c downstream), reconciled to 9.379164112033322e-13c.

## 17. Armour + Energy Shield result

The same real-browser discipline produced `ENABLED_UNRESOLVED` for Harvest Defences after 5,000 retained states. Conventional resolved at 184.65268918894608c full-route cost (1c acquisition + 183.65268918894608c downstream), reconciled to 1.8189894035458565e-12c. The UI reports the unresolved Harvest blocker rather than fabricating screenshot-metadata parity or a route winner.

## 18. Stale-pricing UI behavior

When market context is stale, the public result surface renders a prominent alert reading **Research estimate using stale bundled pricing** and emits `pricingLabel: RESEARCH_ESTIMATE_STALE_PRICING`. Route and proof data remain visible, but the product does not frame the result as a current-market cheapest-route certification.

## 19. Timing and state-scope changes

Timing now distinguishes first completed round, first certified downstream policy, first useful executable full route, and first acquisition-safe recommendation. Work now distinguishes total portfolio states expanded, retained/reused portfolio states, selected-policy graph states, acquisition-synthesis states, method-family states, and proof-bound states.

Advanced details, export, and bug reports use those explicit names. Generic duplicate labels such as multiple unrelated `States expanded` values are no longer presented as the same measurement.

## 20. Constellation real-frame evidence

Stable screenshot: `quality-lab/reports/evidence/constellation-real-frame.png`.

The browser observed a 1114.796875 × 520 canvas with nine focusable nodes. It exercised route focus, zoom, pause, speed, reduced motion, node focus, and the real Fullscreen API; fullscreen entry succeeded. Two paused reduced-motion frames were byte-identical. This evidence comes from rendered pixels and browser state, not serialized graph assertions alone.

## 21. Responsive, keyboard, and accessibility evidence

Real DOM geometry passed at widths 320, 390, 768, 1280, and 1920; in every case client, body, and document widths matched the requested viewport. The exact four-mod page also passed its 390px screenshot gate.

The primary preset-to-optimization path completed keyboard-only, and the audit found zero visible unnamed buttons. Preset selection, optimizer activation, method comparison, and constellation node controls expose semantic browser-accessible controls.

## 22. Cancel, host-guard, and Worker recovery evidence

- User cancel: termination observed, replacement Worker observed, next request recovered to `BEST_RESOLVED_ACQUISITION_SAFE`.
- Forced host guard: a 251ms deadline terminated the stalled Worker; the replacement recovered to `BEST_RESOLVED_ACQUISITION_SAFE`.
- Invalid real request: the Worker emitted an actual `ERROR` response rather than a simulated failure.
- Retry Deeper retained 270 states and did not regress the executable incumbent.

## 23. CI validation and deploy dependency

The Pages workflow now has a blocking `validate-and-build` job that runs install, lab install, Chromium install, build, lint, `git diff --check`, all mature diagnostics, the no-fallback probe, the real release matrix, and Phase 2T diagnostics. Browser artifacts are uploaded even on failure. The deploy job has `needs: validate-and-build`, so failed validation cannot deploy.

The nightly workflow schedules the same correctness chain plus extended fixtures, family matrix, viewport/frame checks, and a longer memory/animation soak.

## 24. Mature regression matrix

`output-phase2t-mature-regression-matrix.txt` records **16/16 PASS** across the retained Phase 2E–2S non-unit diagnostics: core mechanics; fracture fidelity; Herald; Harvest plan/weight/parity; search/refinement; exact fixture; fracture portfolio; portfolio proof closure; multi-objective; method portfolio; correctness/performance; constellation serialization; pricing/sharing; and retained release-candidate integration.

Simulated browser smokes count as release evidence: **NO**.

## 25. Performance and memory results

The real five-second Constellation release soak observed:

| Measure | Result |
| --- | ---: |
| Frames | 301 |
| Elapsed | 5006.1ms |
| FPS | 60.1266 |
| Long-task total | 123ms |
| Maximum long task | 73ms |
| Used JS heap sample | 31,200,000 bytes |

These are bounded release-run observations, not a claim that longer sessions cannot leak. Nightly owns the extended soak.

## 26. Remaining blockers to restoring public-beta certification

Public-beta certification remains blocked by:

1. stale bundled market prices and clean-base quotes; live/current price evidence must replace the research-estimate state;
2. approximate Harvest mechanics confidence and unresolved production-budget Harvest policies for the Armour + Evasion and Armour + Energy Shield fixtures;
3. unresolved competitive proof debt on the exact four-mod portfolio, whose selected result is intentionally `PROVISIONAL_RESOLVED` rather than globally optimal;
4. completion of the hosted main-branch CI/deploy run and continued nightly stability after this report is pushed.

These blockers do not invalidate the Release Candidate 2T.1 browser and consistency evidence; they prevent a broader public-beta certification claim.

## 27. Unit tests added or run

**NO.** No unit-test files were added, and no unit-test command was run. Validation used production builds, mature non-unit diagnostics, direct engine diagnostics, and real-browser integration gates as required by the Phase 2T plan.

## 28. Target- or Craft-specific branches

**NO.** No target name, modifier ID, notable name, Herald name, attached fixture, or Craft-specific route branch was added. Family constraints are action- and acquisition-contract based; target ordering remains emergent from generic mechanics, weights, prices, and policy search.

## 29. Hardcoded route winner

**NO.** Route and family winners arise from finite policy costs, constraints, proof status, and market inputs. Price-sensitivity regressions continue to reverse clean/self-fracture and conventional/Harvest rankings without a winner switch in solver code.

## 30. Pre-fractured market ranking

**NO.** Pre-fractured market purchases remain absent from core ranking. Self-fractured bases require executable synthesis with Fracturing Orb mechanics, wrong-fracture recovery, clean-base reacquisition, cleanup, and downstream accounting.

Additional constraint audit: unsupported Allflame crafting mechanics enabled: **NO**.
