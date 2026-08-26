# Phase 2W Canonical Selection, Objective Integration, Cluster Handoff, and Autonomous QA Completion Report

Date: 2026-08-26 (America/Los_Angeles)

Source of truth: POST_PHASE2V_FIELD_REVIEW_AND_PHASE2W_CANONICAL_SELECTION_OBJECTIVE_INTEGRATION_CLUSTER_HANDOFF_AUTONOMOUS_QA_PLAN.md

Release-gate result: **PASSED - 75/75 real Playwright browser gates**

Preservation result: **PASSED - 16/16 mature diagnostics, Phase 2T T1-T16, Phase 2U U1-U17, and Phase 2V V1-V17**

Phase 2W result: **PASSED - W1-W22**

## 1. Final implementation commits

The Phase 2W product implementation, diagnostics, browser harness, and final evidence are committed on main as:

| Commit | Subject |
| --- | --- |
| ee8514112b1b23a9959e0eba482e13dd7b80ba06 | feat: complete Phase 2W objective integration and handoff |
| f19ecee89ee96d105f707f89db3ab460bc8ef42d | fix: close Phase 2W browser QA regressions |
| add8660ce1e191475adc156670237aae2853fff7 | test: record final Phase 2W release evidence |
| 56755ff37061b46a0b58e55ad8b69b68e136f571 | ci: persist Phase 2W handoff evidence |

This completion report is a documentation follow-up so it can cite the immutable implementation/evidence commits and the successful hosted deployment.

## 2. All files changed

The net implementation/evidence diff from the Phase 2W plan commit 0800515ed5816745bf4c01b63cbe91aa72d88705 through 56755ff changes 64 files. This report is the documentation follow-up.

| Area | Exact files |
| --- | --- |
| Workflows | .github/workflows/deploy.yml; .github/workflows/nightly-quality.yml |
| Engine and diagnostics | crafting-engine/scripts/phase2lPortfolioProofDiagnostic.ts; crafting-engine/src/domain/MethodFamily.ts; crafting-engine/src/service/optimizerService.ts; crafting-engine/src/service/optimizerValidation.ts; crafting-engine/src/service/shareBundle.ts; crafting-engine/src/solver/genericSearch.ts |
| Product UI and Worker | src/App.css; src/App.tsx; src/ClusterJewels.tsx; src/CraftOptimizer.tsx; src/crafting/optimizer.worker.ts; src/crafting/optimizerWorkerProtocol.ts; src/optimizerSeed.ts |
| Quality Lab source/config | package.json; quality-lab/fixtures/fixtureCorpus.json; quality-lab/src/eventCapture.ts; quality-lab/src/runner.ts |
| Diagnostic source | scripts/developerUiPhase2sDiagnostic.ts; scripts/phase2tDiagnostics.ts; scripts/phase2uDiagnostics.ts; scripts/phase2vDiagnostics.ts; scripts/phase2wDiagnostics.ts |
| Documentation | docs/crafting-engine/PATH_TO_SUCCESS.md; this completion report |
| Fresh diagnostic outputs | output-fracture-fidelity-phase2e.txt; output-phase2h-herald-diagnostic.txt; output-phase2i-weight-policy-diagnostic.txt; output-phase2j-harvest-parity-diagnostic.txt; output-phase2j-search-diagnostic.txt; output-phase2k1-exact-fixture-diagnostic.txt; output-phase2l-portfolio-proof-diagnostic.txt; output-phase2m-multi-objective-diagnostic.txt; output-phase2n-method-portfolio-diagnostic.txt; output-phase2p-correctness-diagnostic.txt; output-phase2q-constellation-diagnostic.txt; output-phase2r-pricing-sharing-diagnostic.txt; output-phase2s-release-candidate-diagnostic.txt; output-phase2t-mature-regression-matrix.txt; output-phase2t-release-truthfulness-diagnostic.txt; output-phase2u-constellation-interaction-readability-player-labels-diagnostic.txt; output-phase2v-scroll-semantics-harvest-closure-diagnostic.txt; output-phase2w-canonical-selection-objective-integration-cluster-handoff-diagnostic.txt |
| Stable reports | quality-lab/reports/release-gate.json; quality-lab/reports/summary.md; quality-lab/reports/evidence/worker-events.json; quality-lab/reports/evidence/phase2w-handoff-round-trip.json |
| Stable visual evidence | quality-lab/reports/evidence/constellation-fit-all.png; constellation-post-pan.png; constellation-real-frame.png; constellation-reduced-motion.png; constellation-route-focus.png; constellation-screensaver-fullscreen.png; constellation-selected-node.png; constellation-touch-390.png; four-mod-390.png; four-mod-desktop.png; phase2v-armour-evasion-comparison.png; phase2v-horizontal-route-rail-follow.png; phase2v-one-mod-clean-graph.png; phase2v-scrolled-above-playing.png; phase2v-self-fracture-chronology.png; phase2w-exact-market-vs-craft.png; phase2w-mobile-handoff.png |

No unit-test file was added. The user-owned src/data/allflame/trade-prices.json working-tree update is deliberately excluded from this manifest because Phase 2W did not modify, stage, or commit it.

## 3. Newer user commits merged and preserved

The run fetched and fast-forwarded current main to 0800515 before implementation. That history contains the specifically protected user commit:

cd066d48752a752f76338efa119ba2321fd3adf8 - feat: add Allflame league cluster jewel snapshot data

Its committed src/data/allflame/cluster-jewels.json snapshot remains in history and drives generated handoff cases. A still-newer uncommitted src/data/allflame/trade-prices.json snapshot was detected before edits, treated as user-owned, and left untouched and unstaged throughout.

## 4. Phase 2V preservation matrix

| Preserved contract | Final evidence | Result |
| --- | --- | ---: |
| Phase 2E-2S engine/UI corpus | Fresh diagnostic:mature process matrix | **16/16 PASS** |
| Phase 2T real-browser truthfulness, accounting, independent families, and Worker | diagnostic:phase2t | **T1-T16 PASS** |
| Phase 2U camera, touch, keyboard, labels, and exact-ID disclosure | diagnostic:phase2u plus retained real-browser gates | **U1-U17 PASS** |
| Phase 2V Replay scroll ownership, chronology, one terminal, and Harvest closure | diagnostic:phase2v plus retained real-browser gates | **V1-V17 PASS** |
| Certified repeatable Harvest quotient | 140,076 outcomes represented by 440 retained states; 318.3545x compression | **PASS** |
| Full-route accounting and exact state identity | Fresh mature diagnostics and canonical browser oracle | **PASS** |
| Worker replacement/recovery and final COMPLETE/RESULT identity | Real Chromium Worker event capture | **PASS** |
| Player-facing labels with exact IDs confined to Technical/Advanced/export | Public/technical DOM differential | **PASS** |
| No simulated fallback | lab:no-fallback-probe and fallbackSubstitutionUsed=false | **PASS** |

The final release recorded 12 Worker spawns, 44 messages posted to Workers, 421 Worker responses, and 11 intentional terminations. Console, page, and network error counts were all zero.

## 5. Eldritch bug root cause

The service selected a recommended acquisition route from one search result but continued constructing expected action usage, materials, craft plan, policy explanation, and reconciliation from an ambient result that could belong to another policy. The route and its economics therefore had no atomic identity boundary.

Three related architecture defects amplified the problem:

- the primary acquisition-portfolio path did not consistently carry the requested objective and effort profile;
- chaos-incumbent pruning was applied where action/time objectives only permit cost-ceiling pruning;
- independently solved method families were appended after the initial Pareto and recommendation decision, making them display-only competitors.

The fix is generic: every executable policy becomes a self-contained resolved bundle, all bundles are finalized before selection, and the requested objective selects from that final set.

## 6. Before/after Eldritch cross-surface values

Fixture: Medium Cluster Jewel, 12% increased Chaos Damage over Time, item level 84, 6 passives, Eldritch Inspiration plus Low Tolerance, Cheapest.

| Surface | Pre-fix field evidence | Final browser evidence |
| --- | ---: | ---: |
| Clean candidate / selected route | about 599.483c | 593.4825975838281c |
| Public recommendation | 7243.718c | 593.4825975838229c |
| Downstream material/accounting source | 7233.718c | 589.4825975838229c |
| Acquisition | inconsistent with public plan | 4.0000000000000c |
| Reconciliation difference | 6644.235c | 5.229594535194337e-12c |
| Selected bundle | absent | core:clean-open-policy |
| Selected source | mixed | OPEN |

Final PROGRESS COMPLETE, Worker RESULT, the selected acquisition candidate, visible Craft Recommendation, selected Pareto semantics, full-route materials, export, and share/reload all identify the same clean policy and cost. Selected Fracturing Orb usage is zero and neither the selected craft plan nor Constellation contains a fracture step.

## 7. Canonical selected-policy bundle contract

ResolvedPolicyBundle now atomically carries:

- stable bundle and optional family IDs;
- policy source;
- exact route, acquisition candidate, acquisition method, and optional synthesis;
- the exact GenericSearchResult that produced the policy;
- downstream action usage and merged full-route usage;
- chaos/action/time objective metrics;
- policy rules and player explanation;
- required action evidence;
- an InternalResultConsistency record.

The final public result is rebound from the selected bundle after all candidate families resolve. Recommendation, expected cost/currencies/actions, materials, shopping list, craft plan, policy explanation, method selection, Pareto selection, Constellation, policy health, proof, final progress, Worker result, copied playbook, share, and export no longer read from a different ambient solver result.

## 8. Fail-closed reconciliation contract

The declared public tolerance is 0.05 chaos. Bundle construction compares route cost, exact solver cost, merged usage cost, and metric cost pairwise and records the maximum difference.

If the maximum exceeds 0.05c:

- consistency becomes INTERNAL_RESULT_MISMATCH;
- the normal recommendation and expected cost are withheld;
- the request, bundle, source, route action, candidate, and method IDs remain available for diagnostics;
- the search is not presented as a successful completed recommendation;
- the canonical browser oracle fails the release.

The final Eldritch maximum difference is 5.229594535194337e-12c, over nine orders of magnitude below the declared tolerance.

## 9. Search paths audited for objective propagation

Every GenericSearchEngine construction that participates in OptimizerService objective selection now receives both the normalized objective and effort profile:

1. independent method-family solve and continuation;
2. primary acquisition-portfolio search, including RECOMMEND/DEEPEN reuse;
3. bounded fast-clean certification;
4. self-fracture downstream-bound proof solve;
5. first resolved self-fracture downstream solve;
6. deepened competitive self-fracture downstream solve.

Acquisition synthesis remains a mechanics/cost-evidence producer rather than a user-objective selector; its exact resolved vector is attached to the downstream bundle before final selection. Mechanics transition distributions may be retained across objectives, but GenericSearch refreshes every retained edge's cost vector and immediate objective cost before Bellman work. Policies, values, and occupancy are therefore recomputed for A -> B -> A instead of being treated as transition identity.

## 10. Objective-aware acquisition pruning rules

The service-level pruning contract is:

- Cheapest: prune only when an admissible full-route chaos lower bound cannot beat the executable chaos incumbent.
- Fewest/Fastest within absolute cost: cost-prune only when an admissible lower bound is above the user's ceiling; being more expensive than the cheapest incumbent is not enough.
- Premium ceilings: normalize against a resolved cheapest executable cost before eligibility.
- Balanced and unconstrained effort objectives: do not use a raw chaos incumbent as an admissible scalar lower bound.
- Eligibility: use resolved executable full-route U, with a 1e-9 numerical boundary allowance.
- Lifecycle: distinguish RESOLVED_ELIGIBLE, OVER_COST_CEILING, OBJECTIVE_DOMINATED, UNRESOLVED_COULD_QUALIFY, and UNRESOLVED_COST_INELIGIBLE_BY_BOUND.

W11 proves a higher-cost route below 600c remains selectable and wins when it improves the requested action/time metric.

## 11. Final unified candidate and Pareto architecture

Resolved Open, clean direct, self-fracture, Conventional, Harvest, and supported combined-family policies are converted to the same bundle shape. Exact duplicate policy vectors are removed by action/cost/action-count/time fingerprint, then:

1. the cost ceiling is normalized from the cheapest resolved executable bundle;
2. ineligible resolved bundles are filtered by full-route U;
3. objective-specific comparison with deterministic cost/time/action/ID tie-breaks chooses one bundle;
4. the three-dimensional Pareto frontier is recomputed from the final unified set;
5. method lifecycle and why-not-selected copy are rebound to that decision.

The final Armour/Evasion run contained 5 distinct unified policies, 7 resolved family entries, and 4 non-dominated Pareto policies. Cheapest retains the responsive single-primary-policy path unless comparison work is requested; Fewest/Fastest run enough eligible families to make the objective meaningful.

## 12. Objective proof semantics

CONSTRAINED_OPTIMAL_PROVEN is emitted only when every relevant family that could qualify is resolved or safely excluded and every unified bundle's modeled-action optimality is proven. Otherwise a valid constrained selection says BEST_RESOLVED_WITHIN_COST.

The 600c Fewest result, 600c Fastest result, and 500c result all truthfully report BEST_RESOLVED_WITHIN_COST. The UI says best resolved route under the ceiling and does not claim global constrained optimality while an unresolved family could still qualify.

## 13. Armour + Evasion Cheapest result

The frozen 12-passive Large Attack fixture selects the clean/Open bundle naturally:

| Metric | Value |
| --- | ---: |
| Full-route chaos | 175.36284723500762c |
| Expected physical actions | 1160.5457125638522 |
| Estimated manual time | 464.21828502554406s |
| Acquisition / downstream | 4c / 171.36284723500762c |
| Reconciliation difference | 1.3926637620897964e-12c |

No family name or expected winner is encoded in the selector.

## 14. Armour + Evasion Fewest at 600c

Three resolved policies are eligible. The generic objective selector chooses Harvest Reforge Defences:

| Metric | Value |
| --- | ---: |
| Full-route chaos | 576.57990101593c |
| Expected physical actions | 208.45564187753305 |
| Estimated manual time | 413.7112837550661s |
| Expected Harvest applications | 206.45564187753305 |
| Expected Primal Lifeforce | 15484.173140814979 |
| Reconciliation difference | 1.1368683772161603e-13c |
| Proof | BEST_RESOLVED_WITHIN_COST |

The authoritative distribution remains 140,076 outcomes, 743 successes, and 139,333 repeatable misses, with per-application success probability 0.004843655474498472.

## 15. Armour + Evasion Fastest at 600c

Three resolved policies are eligible. The selector chooses Conventional:

| Metric | Value |
| --- | ---: |
| Full-route chaos | 347.75267148497517c |
| Expected physical actions | 742.212545830537 |
| Estimated manual time | 296.885018332211s |
| Reconciliation difference | 9.094947017729282e-13c |
| Proof | BEST_RESOLVED_WITHIN_COST |

Harvest remains the fewer-action policy, but it is slower under the retained DEFAULT_APPROXIMATE effort profile.

## 16. Armour + Evasion 500c result

Harvest's resolved 576.57990101593c U is above the ceiling and is excluded as OVER_COST_CEILING. Two policies remain eligible. Both Fewest and Fastest select the Conventional vector:

347.75267148497517c, 742.212545830537 physical actions, and 296.885018332211s.

The change from 600c emerges solely from the generic executable-U ceiling filter.

## 17. Dynamic ceiling-boundary matrix

Epsilon is 0.01c. All nine generated boundaries passed:

| Family | Resolved U | Just below | At U | Just above |
| --- | ---: | --- | --- | --- |
| Open | 298.18977983058113c | 298.17977983058114c - OVER_COST_CEILING | 298.18977983058113c - RESOLVED_ELIGIBLE | 298.1997798305811c - RESOLVED_ELIGIBLE |
| Conventional | 347.75267148497517c | 347.7426714849752c - OVER_COST_CEILING | 347.75267148497517c - RESOLVED_ELIGIBLE | 347.76267148497516c - RESOLVED_ELIGIBLE |
| Harvest | 576.57990101593c | 576.56990101593c - OVER_COST_CEILING | 576.57990101593c - RESOLVED_ELIGIBLE | 576.58990101593c - RESOLVED_ELIGIBLE |

## 18. Lifeforce crossover preservation

The Phase 2V certified reroll mathematics and price-derived crossover calculation are unchanged. Fresh diagnostic:phase2t evidence still observes a 0.003059814c-per-unit crossover on its separate pinned Armour/Energy Shield witness. The retained real-browser method comparison records a 0.013549294846948773c-per-unit crossover on its frozen Armour/Evasion comparison fixture.

For the Phase 2W objective fixture, the current Primal Lifeforce rate is 0.03697c, expected use is 15484.173140814979, and the Harvest full-route result is 576.57990101593c. These values are derived from the supplied price book and certified action occupancy. No Lifeforce price, crossover, or Harvest winner is hardcoded.

## 19. Signed tradeoff examples

Fewest at 600c saves 533.756903953004 physical actions relative to Conventional but has a signed time saving of -116826.2654228551ms. The public explanation therefore says fewer actions and 116.8s slower. It no longer clamps a meaningful negative time difference to zero.

## 20. Cluster Jewels handoff type and API

App owns a typed OptimizerSeed boundary with:

- id and source CLUSTER_JEWELS;
- league;
- exact BaseType and cluster enchantment;
- one passive count or an explicit passive range;
- item level plus whether it was defaulted;
- exact target mod IDs;
- optional source combo label;
- optional market value with chaos value, LOW/MEDIAN kind, quote time, passive range, and provenance.

ClusterJewels receives an onOptimize callback. App switches tabs and passes the seed to CraftOptimizer. The optimizer clears prior craft identity, populates the seed, moves focus to the source banner, and waits for the user to review and run; handoff never auto-starts a search.

## 21. Group-level handoff evidence

The generated group case used Allflame, selected 8 passives, produced an empty target list, and rendered the optimizer handoff in 108.8768ms. Base, enchantment, league, passive choice, and editable item-level provenance were retained while old targets were cleared.

## 22. Notable-combo handoff evidence

Three committed-snapshot combinations passed:

| Combo | Base/enchantment | Passive / ilvl | Exact target IDs |
| --- | --- | --- | --- |
| Smite the Weak | Large Cluster Jewel / 10% increased Attack Damage | 8 / 83 | Smite the Weak |
| Enduring Composure | Small Cluster Jewel / 15% increased Armour | 2 selected from 2-3 / 84 | Enduring Composure |
| Pure Agony | Medium Cluster Jewel / Minions deal 10% increased Damage while affected by a Herald | 4 / 83 | Pure Agony |

Each launch replaces prior optimizer target identity and preserves the source label/provenance.

## 23. Passive-range selection evidence

Eldritch Inspiration plus Low Tolerance exposes only 4 and 5 passives from its source market SKU. The browser selected 5 before handoff; it never silently became 6. Enduring Composure similarly exposed 2 and 3 and required a choice. A range quote remains visibly identified as a range until it exactly matches the chosen passive count.

## 24. Exact target-ID resolution evidence

Shared catalog lookup resolves notable names to exact IDs before creating a combo seed. Ambiguous or missing IDs do not become guessed targets. W15 retained the exact notable IDs for all three generated combinations; W16 retained both Eldritch Inspiration and Low Tolerance; W18 retained AfflictionJewelSmallPassivesHaveIncreasedEffect2 through export/share/import.

Public UI continues using player-facing stat vocabulary. Raw IDs remain available in Technical/Advanced and export evidence.

## 25. Market sale-value provenance behavior

The exact Small Mana, 35% Small Passive Effect, 3-passive case loaded:

- completed market sampled low: 3c;
- expected craft EV: 9.427055174999975c;
- expected physical actions: 65.83750000000028;
- estimated manual time: 26.335s;
- source timestamp and sampled-low provenance.

Adding the sale value changed only spread/profit presentation. A differential run proved mechanics, selected route, cost, actions, and time were identical. Unknown prices are not treated as zero, and passive-range mismatches display a warning instead of silently claiming an exact SKU. The UI explicitly says expected value, not guaranteed profit.

## 26. Share/import handoff round trip

W18 performed Cluster handoff -> export/share -> import/reload and retained:

- Small Cluster Jewel;
- 6% increased maximum Mana;
- 3 passives;
- item level 84 with default provenance;
- Allflame;
- Cheapest;
- 3c sampled-low sale value and timestamp/provenance;
- exact target AfflictionJewelSmallPassivesHaveIncreasedEffect2;
- schema 2W.1 source context.

Import from the Craft tab now clears a stale location hash and lands on the optimizer route. The stable serialized evidence is quality-lab/reports/evidence/phase2w-handoff-round-trip.json.

## 27. Generated cluster-data QA seed and results

The bounded generated matrix passed with:

| Field | Evidence |
| --- | --- |
| Seed | phase2w-cluster-matrix-v1 |
| App commit under browser test | f19ecee89ee96d105f707f89db3ab460bc8ef42d |
| Fixture corpus | Phase2W-Frozen-Browser-Corpus-1 |
| Browser | Chromium 151.0.7922.34 |
| Objective | CHEAPEST_CHAOS |
| Budget | 5000 states, 30000ms, 3 rounds |
| Cluster cases | three named combos, one passive-range combo, one exact priced stat combo |
| Metamorphic case | Armour/Evasion target order reversed |

The target permutation preserved canonical exact-ID identity, the Harvest enabled-action set, and the 175.36284723500762c / 1160.5457125638522 actions / 464.21828502554406s economics. Every seed, input, price, objective, budget, browser version, and app commit is recorded in release-gate.json.

## 28. Unexpected bugs found autonomously and fixes made

The autonomous loop found and closed the following additional defects:

1. Smoke cancellation and host-guard assertions compared the user's input target order against the service's canonical order. Exact IDs were identical, but the harness timed out. Identity assertions now compare canonical exact-ID sets; the stronger W20 permutation/economics oracle remains.
2. JSON import from the Craft route could retain a stale hash and navigate back to the wrong tab. Successful import now clears that hash and selects the optimizer route.
3. At 390px, a wide result table caused document overflow and a generic optimizer-card definition-list grid overrode method-stage metrics. Scoped containment, min-width, and wrapping rules closed both real-DOM overflows.
4. The fresh mature Phase 2L target-order diagnostic could compare different proof depths after a wall interruption. It now records both cold runs and, only when needed, reruns at a common state/round tranche before testing economic neutrality.
5. The first lean Linux evidence audit referenced a transient ignored Quality Lab artifact. W18 now copies that exact browser export to the committed stable evidence directory, and the report/auditor reference the stable path.

No screenshot or expected winner was changed merely to accept broken behavior.

## 29. Quality Lab canonical-result oracle evidence

The browser oracle compares Worker recommendation/cost, PROGRESS COMPLETE, public selected route, selected Pareto/method semantics, merged materials, full-route accounting, export, and share/reload identity for every executable Phase 2W result.

For Eldritch, W2-W4 observed:

- bundle core:clean-open-policy and source OPEN everywhere;
- full-route cost 593.4825975838229c;
- acquisition 4c and downstream 589.4825975838229c;
- maximum cross-surface difference 5.229594535194337e-12c;
- COMPLETE and RESULT on the same request with the same objective/source/bundle;
- clean acquisition and zero fracture action evidence.

The same oracle remained active on the one-mod, four-mod, Harvest, objective, and additional regression fixtures. The full release had no reconciliation failure.

## 30. Quality Lab objective oracle evidence

The Quality Lab independently filters resolved U values against the normalized ceiling and sorts raw policy vectors by the requested metric and declared tie-breakers. It does not import the application's selector.

W5-W13 independently confirmed Open for Cheapest, Harvest for Fewest at 600c, Conventional for Fastest at 600c, Conventional for both 500c constrained objectives, all nine generated ceiling boundaries, final Pareto non-dominance, truthful proof labels, objective-aware pruning, and signed tradeoff direction.

## 31. Desktop, mobile, and accessibility evidence

Real Chromium passed 320, 390, 768, 1280, and 1920px DOM geometry with document width equal to viewport width. At 390px the combo button and passive chooser were keyboard operable, focus landed on the fully visible source banner, scrollY stayed zero, and no raw mod ID was exposed publicly.

Committed Phase 2W images are:

- quality-lab/reports/evidence/phase2w-mobile-handoff.png;
- quality-lab/reports/evidence/phase2w-exact-market-vs-craft.png.

Retained Phase 2U/2V and four-mod images were refreshed and visually reviewed. Constellation labels remained collision-free and readable; clean/self-fracture chronology and one-terminal semantics remained correct.

## 32. Performance before/after

The pre-fix Fewest/Fastest result was not a valid performance comparator because it returned the already-cheapest policy without doing the required family work. Phase 2W therefore records honest final costs of the new behavior rather than claiming a fabricated speedup:

| Path | Final runtime |
| --- | ---: |
| Cheapest primary path | 5339ms |
| Fewest with relevant family resolution | 20101ms |
| Fastest with relevant family resolution | 20618ms |
| Repeated Cheapest after A -> B -> A | 5518ms |
| Cluster handoff render | 108.8768ms |

Cheapest still resolves only its responsive primary candidate for selection and does not precompute every expensive family. The repeated Cheapest sample is within 179ms of the first sample, showing the new objective path did not turn ordinary Cheapest into a family-precomputation path.

## 33. Memory, session, and reuse evidence

The A -> B -> A gate retained 5000 mechanics states and 17231 transition distributions while recomputing objective-specific Bellman/policy/occupancy state. The measured session memory delta was 0 bytes, and the second Cheapest recovered equivalent economics without a stale Fewest policy.

Retained performance evidence also records:

- Phase 2V quotient: 140,076 outcomes to 440 states, 318.3545x compression, 0-byte short memory delta;
- Phase 2U camera sample: 90 frames, 16.7ms median, 16.8ms maximum, zero new Worker messages;
- Constellation render: 60.089 FPS, 122ms maximum observed long task, 44.7MB used JS heap;
- five-minute soak: DOM count remained 88 and heap changed from 18,849,004 to 19,039,796 bytes.

## 34. Local full release command results

| Command | Final result |
| --- | --- |
| npm run build | **PASS** |
| npm run lint | **PASS** |
| git diff --check | **PASS** |
| npm run diagnostic:mature | **PASS - 16/16** |
| npm run lab:no-fallback-probe | **PASS - unavailable app and browser both fail hard** |
| npm run lab:release | **PASS - 75/75** |
| npm run diagnostic:phase2t | **PASS - T1-T16** |
| npm run diagnostic:phase2u | **PASS - U1-U17** |
| npm run diagnostic:phase2v | **PASS - V1-V17** |
| npm run diagnostic:phase2w | **PASS - W1-W22** |
| npm run diagnostic:phase2w:committed | **PASS** |

The authoritative release run is 2026-08-26T12-07-53-467Z. It ran from 12:07:53.468Z to 12:22:21.152Z in Playwright Chromium 151.0.7922.34, with zero console, page, or network errors.

Focused repair-loop gates also passed: lab:smoke 10/10, lab:objectives 5/5, and lab:phase2u:quick 20/20.

## 35. Hosted lean evidence and deployment result

Automatic Pages validation remains intentionally lean:

- npm run build;
- npm run lint;
- git diff --check;
- npm run diagnostic:phase2w:committed;
- Pages artifact upload and deployment.

It does not run diagnostic:mature, Playwright, or the heavyweight solver matrix remotely. Those are authoritative local release gates, matching the user-approved local-heavy/hosted-lean policy.

The first implementation run, 32970000980, failed only because the committed-evidence audit pointed to an ignored transient W18 export. No product, build, lint, browser, or mechanics gate failed. Commit 56755ff persists the exact export under quality-lab/reports/evidence and makes future runs independent of a local artifact directory.

Hosted run [32970173652](https://github.com/jpitty03/cluster-jewel-research/actions/runs/32970173652) then passed validate-and-build, the committed Phase 2W evidence audit, artifact upload, and deployment. The deployed Pages site is:

https://jpitty03.github.io/cluster-jewel-research/

## 36. Final release label and version

Public label: **Browser-Verified Release Candidate 2W.1**.

Optimizer result/export/share schema, Worker protocol version, committed diagnostic evidence, browser fixture corpus, and completion documentation use 2W.1. Phase 2S public-beta certification remains reopened; this phase does not overclaim a public-beta release.

## 37. Worktree and origin status

At the implementation/evidence deployment checkpoint:

- HEAD and origin/main both equal 56755ff37061b46a0b58e55ad8b69b68e136f571;
- every Phase 2W implementation and evidence change is committed and pushed;
- the only working-tree entry is the pre-existing user-owned src/data/allflame/trade-prices.json update;
- that user file remains unstaged and unmodified by Phase 2W.

This report is the final documentation follow-up and is pushed separately. No force push, reset, or user-data replacement was used.

## 38. Unit tests added or run

**NO.**

No unit-test file, command, or CI step was added or run. Validation used deterministic diagnostics, exact mechanics enumeration, the production Worker, real Playwright Chromium, generated metamorphic cases, accessibility/layout geometry, visual review, and committed-evidence auditing.

## 39. Mechanics probabilities changed

**NO.**

Phase 2W changes policy binding, objective propagation/selection, presentation, handoff, and QA. The Phase 2V repeatable-reroll certification still consumes the shared authoritative Harvest transition distribution. No weight, affix-roll, reroll, fracture, or currency probability was changed.

## 40. Hardcoded winner or target branch added

**NO.**

- No Open, Conventional, Harvest, fracture target, Eldritch, Low Tolerance, Armour, or Evasion winner branch was added to solver selection.
- Frozen expected winners live only in external browser/diagnostic evidence and are also checked by a generic independent oracle.
- Exact state identity remains intact.
- Market-fractured acquisition ranking remains absent.
- Target order is canonicalized by exact requirement identity, not by a named fixture.

## 41. Remaining known limitations

- Bundled Allflame prices are snapshots and can become stale. The user's newer uncommitted trade-price snapshot was intentionally preserved rather than silently folded into frozen Phase 2W evidence.
- Harvest mechanics confidence remains APPROXIMATE / EXTERNALLY CLOSE. Phase 2W preserves the audited shared mechanics and internal exact probability/occupancy consistency; it does not assert new external-game parity.
- Manual-time estimates retain DEFAULT_APPROXIMATE confidence.
- BEST_RESOLVED_WITHIN_COST is deliberately provisional when a mechanically relevant unresolved family could still qualify. Complex four-mod work is not claimed globally optimal at interactive budgets.
- Cluster handoff requires unambiguous shared target IDs. A group handoff intentionally has no targets; ambiguous passive ranges require an explicit player choice; non-unique item levels use a visible editable default.
- Completed-item sampled lows/medians are market evidence, not guaranteed sale prices or profit. Range/staleness provenance remains visible.
- Heavy solver and real-browser gates are local by policy. Hosted Pages audits the committed evidence and build hygiene rather than recomputing the full matrix.
- The completion report cites the successful implementation/evidence deploy. Its later documentation-only deployment does not change product or evidence semantics.

## Completion statement

Phase 2W is complete. A recommendation is now one canonical resolved policy across route, economics, proof, Worker, DOM, materials, Pareto, method, Constellation, share, and export. Fewest and Fastest choose from the final unified resolved policy set under executable-U ceilings, objective changes reuse mechanics without stale policy state, Cluster Jewels hands exact player choices and market provenance to the optimizer without auto-search, and the complete local real-browser release matrix plus lean hosted deployment pass without unit tests, probability changes, weakened identity, market-fractured ranking, or hardcoded craft winners.
