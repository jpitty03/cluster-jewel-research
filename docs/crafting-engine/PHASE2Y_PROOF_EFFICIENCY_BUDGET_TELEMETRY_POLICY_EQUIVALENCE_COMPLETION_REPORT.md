# Phase 2Y Proof Efficiency, Budget Telemetry, Policy Equivalence Completion Report

Status: **CLOSED / PASS / DEPLOYED**

Completed locally on 2026-08-26 PDT. Real-browser artifacts use UTC timestamps on 2026-08-27.

Source plans:

- `POST_PHASE2X_FIELD_REVIEW_AND_PHASE2Y_PROOF_EFFICIENCY_BUDGET_TELEMETRY_POLICY_EQUIVALENCE_PLAN.md`
- `POST_PHASE2Y_FAILED_RELEASE_REVIEW_AND_PHASE2Y1_EVIDENCE_COMPACTION_CLOSEOUT_PLAN.md`

This report closes the original Phase 2Y product phase and its narrow Phase 2Y.1 release-evidence repair. Phase 2Y.1 did not redesign or change the shipped proof solver, scheduler, policy-equivalence model, mechanics, or optimizer state identity.

## 1. Final implementation and evidence commits

- Phase 2Y implementation baseline: `a6743b8443e1c0817c110c37387d5412c64340a5`.
- Phase 2Y.1 source-of-truth plan: `d9d2892`.
- Phase 2Y.1 compactor repair, focused harness, release evidence, and this report: `aa80dde613e4b217859beb19c4e7fe1fcb423959`.
- A later report-only metadata commit may record the deployment result; it does not change product or validation behavior.

The work began from a clean `main` at `d9d2892`, with `HEAD == origin/main`. The newer user data commit recorded by the Phase 2Y gate (`4e06388da42d9e875b231519abdea0509f8d6c0e`) remains preserved.

## 2. Files changed

Phase 2Y product implementation changed these primary source areas in `a6743b8`:

- `crafting-engine/src/solver/relaxedTargetProgressLowerBound.ts`
- `crafting-engine/src/solver/genericSearch.ts`
- `crafting-engine/src/solver/acquisitionSynthesis.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/src/service/optimizerValidation.ts`
- `crafting-engine/src/service/shareBundle.ts`
- `crafting-engine/src/domain/MethodFamily.ts`
- `crafting-engine/src/domain/VisualizationGraph.ts`
- `crafting-engine/src/index.ts`
- `src/CraftOptimizer.tsx`
- `src/App.css`
- `quality-lab/fixtures/fixtureCorpus.json`
- `quality-lab/src/eventCapture.ts`
- `quality-lab/src/runner.ts`
- `scripts/phase2yDiagnostics.ts` and retained phase diagnostics
- lean/manual workflow contracts, generated diagnostic ledgers, JSON evidence, and browser screenshots

Phase 2Y.1 source changes are deliberately narrower:

- `quality-lab/src/eventCapture.ts`: canonical compact route proof contract on every route surface.
- `quality-lab/src/runner.ts`: focused real-browser compaction boundary, shared Y18 oracle, route/accounting identity checks, method-reservation evidence, and isolated focused reports.
- `scripts/phase2yDiagnostics.ts`: precise tranche/field diagnostics without weakening the assertion.
- `package.json`: `lab:phase2y-fuzz` targeted command.
- `quality-lab/reports/evidence/phase2y1-compaction-witness.json`, focused gate/summary/Worker evidence, the final release ledger, mature diagnostic ledgers, and refreshed real-browser images.
- This completion report.

No mechanics probability file or `ItemState` identity implementation was changed by Phase 2Y.1.

## 3. Phase 2X preservation matrix

| Preserved contract | Evidence | Result |
|---|---|---:|
| Canonical selected bundle drives plan and Constellation | `diagnostic:phase2x`, Y16/Y17 browser gates | PASS |
| Positive-action classifier; no unknown/phantom Harvest | Phase 2X diagnostic plus selected/negative Harvest browser controls | PASS |
| Normal/Deep/Very Deep/Research/Custom budget UX and Retry Deeper | Phase 2X diagnostic and retained browser budget gates | PASS |
| Worker replacement, cancellation, host guard, and retained graph reuse | smoke/release gates and mature matrix | PASS |
| Phase 2T accounting/method independence | `diagnostic:phase2t` | PASS |
| Phase 2U labels, camera, pan/zoom, accessibility | `diagnostic:phase2u` | PASS |
| Phase 2V scroll ownership, chronology, certified Harvest mechanics | `diagnostic:phase2v` | PASS |
| Phase 2W canonical objectives and Cluster Jewels handoff | `diagnostic:phase2w` | PASS |
| Phase 2X craft-plan semantics and proof-depth UX | `diagnostic:phase2x` | PASS |

The final release gate's Y1 preservation check also observed all 94 preceding gates green before Phase 2Y-specific checks ran.

## 4. Exact field baseline

The frozen field handoff is a rare ilvl 75, 8-passive Large Cluster Jewel with `12% increased Chaos Damage`, exact targets Dark Ideation + Unspeakable Gifts + Wicked Pall, extra affixes allowed, sampled completed-jewel low `3416c`, and a Research request of up to `50,000 states / 300s / 6 rounds`.

The pre-Phase 2Y field observation was:

- selected executable route: `Self-fracture Unspeakable Gifts`;
- full-route U: `1648.171c`;
- best competitive L: `10.148c`;
- potential gap: `1638.024c`;
- expected physical actions: approximately `3007`;
- estimated manual time: approximately `1221.1s`;
- used: `20,002` portfolio states, `22,224` retained/reused, approximately `254.2s`;
- status: provisional because three acquisition families could still beat the incumbent.

The baseline is observational only. Neither the winner nor its EV is hardcoded.

## 5. Proof-stage timing and state instrumentation

Every proof tranche now serializes candidate, stage, reason, allocated caps, wall time, states before/after, transition distributions generated/reused, transition-generation time, Bellman time, occupancy time, L/U and potential gap before/after, proof status before/after, productivity rates, consecutive no-change count, and any generic deprioritization reason.

The final Research Worker evidence recorded nine portfolio tranches. Its request allocation summary was:

| Scope | Expanded | Retained | Wall time | Generated transitions | Reused transitions |
|---|---:|---:|---:|---:|---:|
| Clean route | 3,334 | 3,334 | 4,024 ms | 17,250 | 232 |
| Fracture acquisition | 10,002 | 10,002 | 5,053 ms | 30,075 | 657 |
| Fracture downstream | 8,306 | 8,306 | 8,412 ms | 33,007 | 278 |
| Lower-bound probes | 3,636 | 3,636 | 4,763 ms | 11,512 | 3,602 |
| Method-family comparison | 0 | 0 | 1 ms | 0 | 0 |

These scopes are reusable independent graphs and intentionally non-additive. The request high-water telemetry separately reports `35,000` expanded and `21,944` retained.

## 6. Relaxed-bound mathematical and admissibility argument

`RELAXED_TARGET_PROGRESS_LOWER_BOUND_V1` computes an optimistic, one-target-at-a-time hitting-cost relaxation using the shared eligible mod pool, shared action definitions, shared prices, and upper bounds on success probability.

It is admissible because it can only make the real task easier:

- fracture creation is bounded separately and the relaxed target predicate ignores the fracture requirement;
- target loss, cleanup, ordering, filler restrictions, and recovery penalties are ignored;
- up to three mutually incompatible favorable exclusion blockers may shrink the affix denominator;
- magic, rare, and Harvest rerolls use generous union bounds over all favorable draws;
- each target uses the cheapest `action cost / optimistic success probability` witness;
- completing every target requires completing each individual target, so the maximum unavoidable single-target hitting cost is a lower bound;
- alternative target scenarios take the cheapest relaxed scenario;
- unknown or unpriced creator actions fail the positive bound closed to zero;
- downstream composition is `max(partialGraphLowerBound, relaxedTargetProgressLowerBound)`, only between independently admissible bounds.

The selected route's executable U is never inflated by this lower bound.

## 7. Relaxed-bound identity and cache contract

The bounded 512-entry LRU cache keys the complete mechanics identity: bound version; base/cluster/item/passive/rarity state; exact affix IDs and fracture flags; exact target requirements, branches, and any-of shape; complete eligible pool IDs, generation types, weights, ilvls, names, groups, and craft tags; enabled action IDs, types, prices, confidences, and parameters; and the research-fallback-price policy.

The evidence includes the stable `r2y-*` identity hash, hit/miss, compute time, enabled action IDs, selected relaxed scenario, exact requirement witnesses, and unknown/unpriced creators. A cache hit clones arrays/objects before returning. Mechanics, price, target, or state changes therefore cannot silently reuse an incompatible bound.

## 8. Admissibility corpus results

Zero admissibility violations were observed across one-mod controls, Armour + Evasion, Herald two-notable, three-notable, the exact field fixture, four-mod 2P/2S, clean and self-fracture starts, selected Harvest, and unwanted-affix constraints.

The final browser Y2 gate checked all four field acquisition candidates and an exact small-space optimum. The exact witness closed at `4.0148645c` with `PROOF_CLOSED`; every relaxed L remained at or below known executable U and the exact optimum.

## 9. Old and new lower-bound table

| Field candidate | Pre-2Y full-route L | Final Research full-route L | Final executable U | Result |
|---|---:|---:|---:|---|
| Clean Base | 10.148c | 10.591c | 104403.275c | stronger L; still competitive |
| Dark Ideation | 308.640c | 374.651c | 2421.260c | materially stronger L |
| Unspeakable Gifts | 308.646c | 314.792c | 1648.171c | selected executable route |
| Wicked Pall | 308.640c | 375.303c | 4216.039c | materially stronger L |

At initial bounded proof depth, the relaxed contribution raised the downstream L for Clean Base, Dark Ideation, and Wicked Pall from approximately `0–0.042c` to `0.59110275c`. For Unspeakable Gifts, the existing partial-graph L (`6.19238c`) was stronger than the relaxed witness (`0.121192c`), so `max` correctly retained the existing bound.

## 10. Scheduler priority formula and contract

For Cheapest, unresolved fracture families are ordered generically by the smallest score:

```text
full-route L / incumbent U
+ readiness penalty (0.04 acquisition unresolved, 0.02 downstream unresolved)
+ min(0.20, 0.05 * consecutive no-proof-change tranches)
- min(0.025, retained states / 1,000,000)
- min(0.025, last proof gain per second / 1,000)
```

Exact candidate identity is only a deterministic tie-break. No target name or preferred fracture mod participates. Acquisition prerequisites run before dependent downstream work. Once a stage produces two consecutive `NO_PROOF_CHANGE` tranches, the scheduler switches generically between executable-policy and downstream-bound work while preserving the candidate and its prior proof.

## 11. Scheduler A/B results

The final frozen equal-budget browser A/B was:

| Scheduler | Elapsed | Incumbent U | Best competitive L | Potential gap | Tranches | No-change tranches |
|---|---:|---:|---:|---:|---:|---:|
| Legacy best-bound reference | 12,430 ms | 2535.557c | 10.041c | 2525.516c | 8 | 1 |
| Phase 2Y proof-debt/productivity | 12,134 ms | 1648.171c | 10.591c | 1637.580c | 5 | 1 |

The Phase 2Y scheduler produced a better executable incumbent, a stronger competitive L, and a `887.936c` smaller proof gap in slightly less wall time.

## 12. Normal, Deep, Very Deep, and Research continuation

The exact compatible continuation witness was monotone:

| Preset | U | Stop | Retained | Reuse |
|---|---:|---|---:|---|
| Normal | 4.0148645c | `NO_PRODUCTIVE_PROOF_WORK` | 4 | COLD |
| Deep | 4.0148645c | `PROOF_CLOSED` | 8 | RESUMED |
| Very Deep | 4.0148645c | `PROOF_CLOSED` | 8 | RESUMED |
| Research | 4.0148645c | `PROOF_CLOSED` | 8 | RESUMED |

No deeper compatible request lost or worsened the executable incumbent.

## 13. Requested-versus-used budget evidence

The final browser/Worker/DOM differential agreed exactly:

- requested: Research, up to `50,000` states, `300,000ms`, `6` rounds;
- used: `35,000` expanded, `21,944` retained, `254,215ms`, `5` rounds;
- transition distributions: `428,210` generated and `4,866` reused;
- stop: `HOST_RESERVE`, secondary `STATE_CAP`;
- presentation wording: caps are explicitly “up to,” and retained totals/scoped allocations are explained as non-additive.

The browser screenshot independently displays the same values as `35,000 expanded · 21,944 retained · 254.2s`.

## 14. Stop-reason witnesses

| Witness | Requested | Used | Primary stop | Secondary |
|---|---|---|---|---|
| Wall-limited | 50,000 states / 100ms / 50 rounds | 1 expanded / 10ms | `WALL_TIME` | `NO_PRODUCTIVE_PROOF_WORK` |
| State-limited | 1 state / 30,000ms / 50 rounds | 1 expanded / 279ms | `STATE_CAP` | `NO_PRODUCTIVE_PROOF_WORK` |
| Proof-closed | 100,000 states / 600,000ms / 7 rounds | 11,361 expanded / 5,255ms | `PROOF_CLOSED` | none |

The proof-closed case reports `PROVEN_OPTIMAL` and `OPTIMAL OVER MODELED ACTIONS: PROVEN`, not budget exhaustion. The direct local diagnostic also exercised an exact 1ms `WALL_TIME` witness.

## 15. Exact field post-change U, L, gap, and status

Final Research evidence:

- route: `Self-fracture Unspeakable Gifts`;
- recommendation: `PROVISIONAL_RESOLVED`;
- portfolio proof: `BEST_RESOLVED_UNPROVEN`;
- selected full-route U: `1648.1712565453913c`;
- best competitive L: `10.59110275c`;
- potential gap: `1637.5801538034277c`;
- unresolved competitive acquisition families: three;
- full-route accounting remains reconciled.

The stronger proof is still honest: the result is an executable incumbent, not a global-optimality claim.

## 16. Time to first executable and final proof progress

The final field Worker produced its first completed round at `18,184ms` and first certified policy at `20,349ms`. The incumbent history retained `1648.171256545393c` at 3,334, 5,000, 20,000, and 35,000 selected-graph states while later work strengthened competitor evidence.

The request completed in `254,215ms`. Relaxed-bound cache computation consumed only `3ms`; the dominant measured work remained Bellman/candidate proof processing and retained graph refinement.

## 17. Equivalent-policy fingerprint contract

`CANONICAL_POLICY_EQUIVALENCE_V1` hashes the complete normalized selected-policy evidence after independent solves:

- physical acquisition state/kind/method and synthesis terminal semantics;
- normalized physical-state-to-action decisions;
- self-fracture synthesis policy;
- positive required physical-action evidence;
- expected action counts and costs quantized only to the declared `1e-6` presentation tolerance;
- recovery decisions;
- physical acquisition terminal states and exact target predicate.

Scalar cost/actions/time alone are deliberately absent. Method-family evidence flags are removed only from the presentation-equivalence state signature. Solver state identity remains untouched.

## 18. Selected-equivalent family browser evidence

The real one-mod comparison resolved Open and Conventional independently to route `Start clean base`, fingerprint `policy-b29143bf`, and full-route U `6.368169700000105c`. Open is `Recommended`; Conventional is `Same selected policy`, with its own independently displayed acquisition/downstream/full-route stage evidence.

Phase 2Y.1 rechecked this after historical Worker compaction and also verified the selected and equivalent route name, fingerprint, DOM labels, and additive stage U reconciliation.

## 19. Equal-metrics non-equivalent counterexample

Two constructed policies with equal scalar route metrics but different canonical policy maps produced fingerprints `policy-3ffc403c` and `policy-95aa88a5`. They were correctly classified non-equivalent. This prevents cost/actions/time coincidence from collapsing distinct policies.

## 20. Public route naming contract

Public route identity is strategy/acquisition-centric:

- `Start clean base`
- `Self-fracture <player stat/notable>`
- `Harvest Reforge <family>`
- `Self-fracture <player stat/notable> + Harvest`

Incidental recovery actions such as restart/reacquire never lead the public title. Exact action IDs, recovery decisions, canonical identities, and raw mod IDs remain available in Technical/Advanced/export evidence.

## 21. Cross-surface naming differential

Y14 verified `Self-fracture Unspeakable Gifts` across the Worker result, recommendation hero, Search Activity, selected Pareto card, selected Method card, Constellation, How to craft, copy/share/export, and schema `2Y.1` export.

Its independent stage display remained semantically correct:

- acquisition: L `308.600c`, U `1440.983893c`;
- downstream: L `0.047605c`, U `207.187364c`;
- coupled full route: L `1441.031498c`, U `1648.171257c`.

The coupled full-route L is not replaced with a naive sum from unrelated independent stage proofs.

## 22. Market vs Craft preservation

The frozen Cluster Jewels handoff preserved exact source provenance, target IDs, Research identity, and sampled market low `3416c`. The selected executable craft U remains `1648.171c`, a modeled spread of approximately `+1767.8c`.

The UI continues to state that a cheaper unresolved crafting policy may exist and would increase the modeled spread. It does not claim global proof, invent a clean-base quote, or rank pre-fractured market items.

## 23. Harvest semantic controls

The positive control selected `Harvest Reforge Defences` and showed real positive `harvest_reforge_defences` policy usage in the selected bundle, plan, and Constellation. The negative clean/Open control had no selected Harvest action in its policy, plan, or Constellation. Both had zero unknown action IDs.

Phase 2T/2V retained checks also reconfirmed independent Harvest family solving, positive on-policy action evidence, `75` Lifeforce per application, and exact Lifeforce economics. No Harvest route was forced.

## 24. Generated proof-debt fuzz matrix

Y18 used the unchanged seed `phase2y-real-worker-result-matrix-v1` and fixtures:

- `phase2v_one_mod_clean_graph`
- `harvest_one_mod_math_witness`
- `herald_envoy_endbringer`
- `three_notable`
- `phase2w_eldritch_low_tolerance`

The focused repair run checked 12 real Worker results, 28 candidates, and one equivalent pair. The final full release checked 12 results, 36 candidates, and one equivalent pair. Every internal-consistency status was `OK`; every required route L was finite, every present L/U ordering passed, selected/equivalent stage accounting reconciled, route naming remained canonical, and certified plans remained certified.

## 25. Unexpected bugs found and fixed

Three harness issues were addressed without changing product mechanics:

1. The 114/115 release failure exposed that the historical Worker compactor discarded route `lowerBoundChaos` and related proof scalars. The compactor now preserves the real values.
2. The first focused closeout attempt primed history with an identity also used by late Y18, turning that bounded cold case into continuation work and timing out at fixture 5/6. The prelude now uses a cheap identity outside the Y18 seed, preserving the exact Y18 seed and unchanged `1,200-state / 5,000ms / 2-round` caps.
3. A time-sensitive direct diagnostic once reported a generic incomplete-tranche assertion. The assertion was not weakened; its failure now identifies the exact tranche, candidate, stage, and missing fields. The unchanged product run then passed.

No Phase 2Y.1 failure required a solver, mechanics, probability, or state-identity change.

## 26. Performance and memory comparison

- Scheduler A/B: `12,134ms` Phase 2Y versus `12,430ms` reference, with a much smaller final gap.
- Field Research: `255,031ms` browser-observed, within the 300s request cap.
- Relaxed bound compute: `3ms`, well below both the absolute and proportional gate limits.
- Field browser heap delta: `0` bytes in the stable measurement.
- Phase 2Y.1 representative full Worker result: `425,479` bytes.
- Repaired compact historical result: `38,606` bytes (`90.926%` reduction).
- Seven compacted historical results: `201,852` bytes total; largest `38,606` bytes.
- Focused compaction heap: `16,100,000` bytes before and after; delta `0`.
- No historical compact retained `policyRules` or `policyExplanation` graphs.

The additional proof scalars therefore do not materially undo evidence compaction.

## 27. Real Playwright release count and screenshots reviewed

The one final full matrix after targeted green was run `2026-08-27T03-56-52-896Z` using real Playwright Chromium `151.0.7922.34`:

- `115/115 PASS`;
- `20/20` Phase 2Y gates;
- `580` Worker messages, `63` posts, `15` spawns, `13` terminations;
- zero console errors;
- zero page errors;
- zero network errors;
- duration approximately `21.643` minutes.

Manual image review covered:

- `phase2y-proof-debt.png`: readable full-route L/U, proof debt, selected route, and last-work labels.
- `phase2y-budget-telemetry.png`: Research requested/used/stop values match Worker evidence.
- `phase2y-equivalent-policy.png`: selected and equivalent cards, independent stage bounds, action evidence, and status copy are coherent.
- `phase2y-route-naming.png`: selected/starting/physical route naming agrees and recovery remains a later plan step.
- `four-mod-desktop.png`: retained four-mod controls, accounting, methods, Constellation, and craft guide render coherently.

No clipping, contradictory labels, stale public route title, or stage-bound inversion was observed.

## 28. Full local command matrix

| Command / gate | Result |
|---|---:|
| `npm run build` (targeted preflight and final post-browser) | PASS |
| `npm run lint` (targeted preflight and final post-browser) | PASS |
| `git diff --check` (targeted preflight and final post-browser) | PASS; line-ending notices only |
| `npm run diagnostic:phase2y` | PASS; all local Phase 2Y gates |
| `npm run lab:phase2y-fuzz` | PASS 6/6, run `2026-08-27T03-54-06-906Z` |
| `npm run lab:objectives` | PASS 5/5 |
| `npm run lab:smoke` | PASS 10/10 |
| `npm run lab:release` | PASS 115/115, run `2026-08-27T03-56-52-896Z` |
| `npm run diagnostic:mature` | PASS 16/16 |
| `npm run diagnostic:phase2t` | PASS |
| `npm run diagnostic:phase2u` | PASS |
| `npm run diagnostic:phase2v` | PASS |
| `npm run diagnostic:phase2w` | PASS |
| `npm run diagnostic:phase2x` | PASS |
| `npm run diagnostic:phase2y` (post-browser) | PASS |
| `npm run diagnostic:phase2y:committed` | PASS; 20/20 committed Phase 2Y browser gates audited |
| `npm run lab:no-fallback-probe` | PASS; unavailable app/browser fail closed |

No source file changed after the final full browser pass, so the full matrix was not rerun.

## 29. Hosted lean deployment result

- Product/evidence deployment SHA: `aa80dde613e4b217859beb19c4e7fe1fcb423959`.
- GitHub Pages workflow run: [33040593211](https://github.com/jpitty03/cluster-jewel-research/actions/runs/33040593211).
- Hosted URL: [https://jpitty03.github.io/cluster-jewel-research/](https://jpitty03.github.io/cluster-jewel-research/).
- Result: **SUCCESS**; `validate-and-build` and `deploy` both completed successfully.

The hosted workflow remains lean: build, lint, diff hygiene, and committed local-release evidence integrity gate deployment; the heavyweight browser/solver matrix remains local, with remote extended validation manual-only.

## 30. Release label and version

The public release label and export/presentation schema are `2Y.1`. Phase 2T–2X behavior remains retained under that version.

## 31. Unit tests added or run

**NO.** No unit test was added, invoked, or added to CI.

## 32. Mechanics probabilities changed

**NO.** Phase 2Y.1 changed only release-evidence capture/validation. The original Phase 2Y work added an admissible proof abstraction using existing shared mechanics; it did not change authoritative action probabilities.

## 33. State identity weakened

**NO.** Canonical policy equivalence is presentation-only and runs after independent solves. Solver/session/physical item state identity remains unchanged. The Phase 2Y.1 prohibited-file diff is empty for `crafting-engine/src/domain/ItemState.ts`.

## 34. Hardcoded route winners added

**NO.** The proof scheduler uses bound/readiness/retained-work/productivity/no-change evidence with stable identity only as a tie-break. Y18 uses a fixed deterministic fixture corpus, not expected winners.

## 35. Remaining blockers to broader public use

There is no blocker to closing Phase 2Y as a browser-verified release candidate. Broader public-use caveats remain explicit rather than hidden:

- the exact three-notable field route is still provisional because three competitors retain admissible L below the incumbent U;
- market/pricing freshness and unavailable exact quotes remain provenance-scoped;
- estimates cover modeled mechanics, not every possible game method;
- the monolithic full Quality Lab remains an iteration-time bottleneck and should be sharded/checkpointed in a later phase without weakening semantic coverage.

## 36. Phase 2Y.1 stopped run and exact failed gate

Baseline `a6743b8` stopped at `114/115 PASS`. The sole failure was:

```text
Y18-generated-proof-debt-browser-fuzz
Compacted Worker evidence omits route.lowerBoundChaos
→ fuzz method 0 route L must be a finite number
```

Y14 had already passed, so this was treated as a release-evidence defect rather than a reason to restart Phase 2Y.

## 37. Phase 2Y.1 root cause

The browser keeps one full terminal Worker result and compacts older results to avoid retaining large policy graphs. The historical `compactRoute` retained U and metrics but omitted canonical route L, gap, status, could-beat, name, and stage metric vectors. Y18 correctly consumed those older real results and refused to fabricate the discarded L.

The real Worker `RouteSummary` contained the proof; the harness had thrown it away.

## 38. Compact route contract before and after

Before, compact routes retained action/acquisition identity, `expectedTotalCostChaos`, `incumbentUpperBoundChaos`, and `metrics`.

After, the shared reducer additionally preserves:

- `name`;
- `lowerBoundChaos`;
- `optimalityGapChaos`;
- `status`;
- `couldBeatResolvedIncumbent`;
- `acquisitionMetrics`;
- `downstreamMetrics`.

The same reducer is used for recommended, alternatives, Harvest conventional/resolved/legacy route aliases, method-family routes, and Pareto routes. Undefined optional vectors remain undefined; no value is synthesized.

## 39. Full versus compacted route-proof agreement

The focused real-browser boundary captured a full `harvest_one_mod_math_witness` result, issued a second real Worker request, then read the now-compacted earlier result. It found exactly nine route surfaces:

- recommended;
- one alternative;
- Harvest conventional and resolved routes;
- three method-family routes;
- two Pareto routes.

For every surface, deep equality covered action/name/acquisition identity, U, L, incumbent U, gap, status, could-beat, full metrics, and optional acquisition/downstream vectors. Representative retained values were:

- recommended/Open/Pareto clean: L `11.1597680089c`, U `11.1598454200c`;
- conventional clean: L `11.1597751396c`, U `11.1598454200c`;
- Harvest alternative/resolved/Pareto: L `17.6478246105c`, U `17.6478314770c`.

`proofValuesInferredOrFabricated` is recorded as `false`.

## 40. Focused Y18 result

Focused run `2026-08-27T03-54-06-906Z` passed all `6/6` checks with zero console/page/network errors. Y18 itself passed with the unchanged seed and caps, 12 real results, 28 candidates, and one equivalent pair. The exact Y18 implementation is shared by focused and release scenarios, preventing drift between a reproduction and the release oracle.

## 41. Y14 preservation result

The focused closeout verified selected/equivalent route identity and accounting after compaction on a cheap real Worker control. The final release Y14 independently passed the exact field route across DOM, Worker, Method, Pareto, Constellation, guide, share, and export, with the stage/full-route values recorded in section 21.

## 42. Method-comparison reservation preservation

The focused request observed `compareMethodFamilies=true`. Its real `methodFamilyComparison` allocation was:

- `1,202` states expanded and retained;
- `2,803ms` wall time;
- `2,498` transitions generated;
- `250` transitions reused;
- positive independent Open and Conventional solves;
- one `SAME_AS_SELECTED` family.

This proves the repaired objective-aware reservation still reaches unified family work rather than exhausting the host envelope beforehand.

## 43. Compaction size and memory closeout

The focused witness compared a `425,479`-byte full result with a `38,606`-byte repaired historical result. Seven compacted results occupied `201,852` bytes total, versus the committed failed-run artifact's `1,299,585` bytes for 12 payload-bearing results. Heap stayed at `16.1MB`; giant policy graphs were absent from every compact historical result.

The cost of preserving the small route-proof scalars is negligible relative to the removed policy graphs.

## 44. Final full release count and run identity

The final full browser matrix ran once after all targeted gates were green:

```text
run:      2026-08-27T03-56-52-896Z
browser:  Playwright Chromium 151.0.7922.34
started:  2026-08-27T03:56:52.897Z
finished: 2026-08-27T04:18:31.494Z
result:   115/115 PASS
errors:   console 0 / page 0 / network 0
```

No source repair followed it, so it was not rerun.

## 45. Complete mature-diagnostic closeout

`diagnostic:mature` passed all `16/16` Phase 2E–2S diagnostics. The separately required Phase 2T, 2U, 2V, 2W, 2X, and 2Y diagnostics then passed. The no-fallback probe, build, lint, and diff check also passed. Mature output explicitly records simulated browser smokes as release evidence: `NO`, and unit tests run: `NO`.

## 46. Artifact and release-ledger review

The release JSON and summary agree on status, run identity, 115 checks, browser version, Worker counts, artifacts, and zero runtime errors. Stable Worker evidence contains 12 payload-bearing compact result records and 62 route surfaces with no observed full-route or method-stage L > U violation. The focused boundary supplies the stronger pre/post exact-equality proof for all canonical scalar/vector fields.

All Phase 2Y screenshots named in section 27 were opened and manually reviewed rather than merely generated.

## 47. Phase 2Y.1 prohibited-change and deployment closeout

- Unit tests added/run: **NO**.
- Mechanics probabilities changed: **NO**.
- State identity weakened: **NO**.
- Hardcoded route winner added: **NO**.
- Pre-fractured market ranking added: **NO**.
- Y18 weakened or missing proof fabricated: **NO**.
- Final deployed product SHA/run: `aa80dde613e4b217859beb19c4e7fe1fcb423959` / [33040593211](https://github.com/jpitty03/cluster-jewel-research/actions/runs/33040593211).

Phase 2Y is closed. The subsequent report-metadata commit changes documentation only; the verified product/evidence deployment remains the SHA and run above.
