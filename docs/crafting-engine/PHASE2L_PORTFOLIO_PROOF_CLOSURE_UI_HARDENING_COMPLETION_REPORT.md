# Phase 2L Portfolio Proof Closure / UI Hardening Completion Report

## Status and implementation commit

Phase 2L is complete on 2026-08-24. The implementation commit is `02265c3` (`feat: harden Phase 2L portfolio proof search`). This report is a follow-up documentation commit so it can refer to the immutable implementation commit.

The implementation closes the architecture and evidence gaps requested by `POST_PHASE2K1_REVIEW_AND_PHASE2L_PORTFOLIO_PROOF_CLOSURE_UI_HARDENING_PLAN.md`: it adds admissible full-route bounds, retained candidate-stage proof sessions, incumbent-directed resumable scheduling, proof-honest portfolio statuses, terminal proof telemetry, and the specified Search Activity / modifier-selector hardening. Existing Phase 2K and 2K.1 route construction, ranking, state identity, and Worker behavior remain intact.

The exact four-mod fixture does **not** reach portfolio closure within the required diagnostic budgets. It ends `BEST_RESOLVED_UNPROVEN`, with the unresolved proof gap reported explicitly below. No winner/order is hardcoded to conceal that result.

No unit tests were added or run.

## Files changed

Implementation and diagnostics:

- `crafting-engine/src/service/optimizerService.ts`;
- `crafting-engine/scripts/phase2lPortfolioProofDiagnostic.ts`;
- `crafting-engine/scripts/phase2iHarvestPlanDiagnostic.ts`;
- `crafting-engine/scripts/phase2iWeightPolicyDiagnostic.ts`;
- `src/CraftOptimizer.tsx`;
- `src/SearchableModifierSelect.tsx`;
- `src/App.css`;
- `scripts/browserPhase2lSmoke.ts`.

Evidence refreshed or added:

- `output-phase2l-portfolio-proof-diagnostic.txt`;
- `output-browser-phase2l-smoke.txt`;
- `output-browser-phase2k-smoke.txt`;
- `output-phase2k1-exact-fixture-diagnostic.txt`;
- `output-fracture-fidelity-phase2e.txt`;
- `output-phase2i-weight-policy-diagnostic.txt`;
- `output-phase2j-search-diagnostic.txt`;
- `output-phase2j-harvest-parity-diagnostic.txt`.

## Portfolio proof model and bound provenance

Each acquisition candidate now carries separate proof evidence for:

- acquisition `L` and executable `U`;
- downstream `L` and executable `U`;
- full-route `L` and current executable `U`;
- exact candidate lifecycle (`NOT_STARTED`, acquisition/downstream probing or resolved, `COMPETITIVE_UNRESOLVED`, `DOMINATED`, or `SELECTED`);
- proof reason, modeled-optimal flags, retained acquisition/downstream states, and transition-generation totals.

The aggregate portfolio reports `PORTFOLIO_OPTIMAL`, `SELECTED_ACQUISITION_SAFE`, `BEST_RESOLVED_UNPROVEN`, or `NO_EXECUTABLE_ROUTE`, together with incumbent U, best competitive L, gap, candidate counts, evidence, scheduler policy, and tranche history. Selected-policy validity, acquisition safety, portfolio optimality, and global modeled optimality remain distinct claims.

For every self-fracture candidate:

```text
fullRouteL = acquisitionL + downstreamL
```

`acquisitionL` is the maximum admissible lower bound established by mandatory mechanics and the retained acquisition graph. `downstreamL` comes from a generic proof search rooted at the candidate's actual reusable fractured item state. Its restart/reacquire price is the independently admissible acquisition lower bound, so a failure after the fractured start correctly pays for a later reacquisition. The initial acquisition is counted once in `acquisitionL`; the downstream start value excludes it, preventing double counting.

For Clean Base, acquisition L is the pinned clean-base price and downstream L is the generic clean-start action-Q lower bound. All lower bounds are monotone-retained per exact mechanics/economics identity. Candidate ordering is used only as an exact-identity tie-break after best-bound priority.

The L2 audit checked nine resolved candidate observations and found zero violations of acquisition `L <= U`, downstream `L <= U`, or full-route `L <= U`.

## Exact fixture RECOMMEND baseline

The exact Phase 2K.1 Large Cluster Jewel fixture remains pinned to 10% increased Attack Damage, item level 84, 12 passives, Rare, extra affixes allowed, the four exact mod IDs, frozen currency rates, and no pre-fractured market purchase.

Cold `RECOMMEND` completed in 24,670ms and reproduced an executable Glowing self-fracture incumbent at 4,793.659159c. The selected target is an observed result, not an assertion or rule.

| Candidate | Lifecycle | Acquisition L | Acquisition U | Downstream L | Downstream U | Full-route L | Current full-route U |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Clean Base | Competitive unresolved | 10.000000c | 10.000000c | 0.230843c | 213,856.185619c | 10.230843c | 213,866.185619c |
| Powerful (T1) | Competitive unresolved | 369.000000c | 1,496.542933c | 0.034511c | 3,449.880560c | 369.034511c | 4,946.423493c |
| of the Prodigy (T1) | Competitive unresolved | 369.000000c | — | 0.037497c | — | 369.037497c | — |
| Glowing (T1) | Selected | 369.000000c | 1,496.542933c | 0.034511c | 3,297.116225c | 369.034511c | 4,793.659159c |
| of the Meteor (T1) | Competitive unresolved | 369.000000c | — | 0.037497c | — | 369.037497c | — |

Initial portfolio status was `BEST_RESOLVED_UNPROVEN`: four non-selected families retained full-route L below incumbent U; none was safely dominated.

## Incumbent-directed DEEPEN sequence

The scheduler re-sorts live competitors by full-route L during each request. It allocates only to a non-selected family whose L can beat incumbent U, resolves acquisition before executable downstream, then selects acquisition or downstream-bound work according to the remaining proof debt. Once a new executable candidate lowers U, every competitor is immediately reconsidered against the new incumbent. The diagnostic requires and observed the `competitors reprioritized` milestone, covering L6.

Tranche reasons emitted by the service include:

- `RESOLVE_ACQUISITION_BEFORE_DOWNSTREAM`;
- `DEEPEST_COMPETITOR_LOWER_BOUND`;
- `DEEPEST_ACQUISITION_PROOF_DEBT`;
- `DEEPEST_DOWNSTREAM_PROOF_DEBT`.

Every tranche records retained/generated work before and after, lower/upper bounds before and after, and a proof outcome. Examples include Clean retaining 3,334 -> 4,834 states while improving full-route L from 10.230843c to 10.308780c, and downstream-bound tranches improving several fracture-family L values from approximately 369c to 424.030000c.

| Request | Reuse | Selected U | Best competitive L | Potential gap | Competitive | Dominated | Portfolio status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Exact RECOMMEND | Cold | 4,793.659159c | 10.230843c | 4,783.428316c | 4 | 0 | `BEST_RESOLVED_UNPROVEN` |
| Exact DEEPEN 1 | Resumed | 4,793.659159c | 10.308780c | 4,783.350379c | 4 | 0 | `BEST_RESOLVED_UNPROVEN` |
| Exact DEEPEN 2 | Resumed | 4,793.659159c | 10.308780c | 4,783.350379c | 4 | 0 | `BEST_RESOLVED_UNPROVEN` |

Final per-target lifecycle and full-route L were:

- Clean Base: competitive unresolved, 10.308780c;
- Powerful: competitive unresolved, 424.030000c, executable U 4,946.423493c;
- of the Prodigy: competitive unresolved, 424.030000c;
- Glowing: selected, 369.034511c, executable U 4,793.659159c;
- of the Meteor: competitive unresolved, 424.030000c.

The incumbent never regressed across the sequence. Proof gap decreased on the first deepening request and did not increase on the second. Retained graphs and no-change tranches remain visible rather than being presented as proof progress.

### Remaining exact-fixture blocker

The final exact status is `BEST_RESOLVED_UNPROVEN`. Four modeled non-selected families still have full-route L below 4,793.659159c. The strongest blocker is Clean Base at only 10.308780c; the other competitive lower bounds are 424.030000c. Closing this gap requires substantially stronger generic downstream lower bounds or more proof capacity. It is a proof-strength/cost blocker, not evidence of an invalid selected policy, an inadmissible bound, or missing executable incumbent.

## Cold versus resumed candidate-stage equivalence

L5 compares cold-large with small-then-resumed-large controls for two real fracture targets at both acquisition and downstream stages.

| Target | Acquisition U | Downstream U | Retained acquisition/downstream | Generated resumed acquisition/downstream | Generated cold acquisition/downstream |
| --- | ---: | ---: | ---: | ---: | ---: |
| Powerful (T1) | 1,496.542933c | 18.713993c | 5,001 / 2,132 | 10,033 / 2,132 | 15,024 / 6,309 |
| Glowing (T1) | 1,496.542933c | 40.190794c | 5,001 / 2,132 | 10,033 / 2,003 | 15,024 / 6,309 |

Cold and resumed controls produced exactly equivalent EV/proof results. Across the compared stages, resumed requests generated 24,201 current-request transition distributions versus 42,666 cold, avoiding 18,465 duplicate generations.

## Sensitivity, neutrality, and regression controls

L7 demonstrates emergent price behavior:

| Fracturing-orb regime | Selected family | U | Portfolio status |
| --- | --- | ---: | --- |
| Cheap, 1c | Powerful self-fracture | 70.247267c | `BEST_RESOLVED_UNPROVEN` |
| Frozen, 359c | Clean Base | 129.881929c | `SELECTED_ACQUISITION_SAFE` |
| Expensive, 20,000c | Clean Base | 129.881929c | `SELECTED_ACQUISITION_SAFE` |

No price-specific branch or forced target decides those results. In L8, reversing the same target set produced the same Clean Base selection, 134.034608c U, `SELECTED_ACQUISITION_SAFE` status, and equivalent proof economics.

The real three-notable J8 regression remains executable and proof-honest at its allocated depth: U 1,622.734548c, proper/absorbing/Bellman/occupancy/reconciliation checks pass, its chronological plan has no uncovered or invented steps, and market-fractured acquisition remains absent.

Simple controls remain healthy. The Phase 2K clean-dominance control completed in 0.86s at 27.37c with a proper policy and absorption probability 1. The Phase 2L sensitivity and permutation controls also close as `SELECTED_ACQUISITION_SAFE` in approximately 4.8–6.9s where their admissible fracture bounds dominate the alternatives.

## Phase 2K.1 preservation

The exact Phase 2K.1 diagnostic passes cold/resumed/invalidation recovery, terminal telemetry, telemetry equivalence/overhead, and the matched-action Clean-depth comparison:

- cold and resumed selected the same Glowing route and 4,793.659159c U;
- exact-context recovery retained 2,610 states and 8,270 transition distributions;
- terminal progress had no lingering probing candidate;
- seven paired telemetry runs had identical decision semantics;
- median OFF was 675.976ms and ON was 683.389ms, 1.097% overhead against the <=5% gate;
- current-depth Clean U was 213,866.185619c at 3,334 states;
- mature certified Clean U was 213,866.185081c at 14,001 states with the same action set.

The nearly identical Clean U values in this environment do not make the concepts interchangeable. Current-depth U is the executable incumbent returned by the portfolio's allocated clean tranche; mature U is the result of a separate retained clean-only search that reached the full proper/absorbing/Bellman/occupancy/reconciliation criteria. The label describes search maturity and certification provenance, not a promised numerical improvement.

The actual Chrome module Worker emitted terminal `PROGRESS:COMPLETE` immediately before `RESULT`, with all five candidates and four executable fracture full routes. Request-ID routing, structured clone, stale-message filtering, cancel, host-guard recovery, and ERROR hygiene all passed; direct worker-function substitution was not used.

## Search Activity and modifier selector

The Search Activity UI now presents semantic portfolio proof status and explanation, candidate proof lifecycles, competitive/executable/dominated counts, tranche milestones, retained state counts, and the four separate values `Acquisition L`, `Acquisition U`, `Full-route L`, and `Current Full-route U`. Terminal COMPLETE copies authoritative result evidence before RESULT. Retry Deeper continues the exact retained session.

The compiled browser smoke observed selected and dominated cards, the selected-safe milestone/status, all four bounds, a terminal COMPLETE frame, and a working Retry Deeper callback.

The searchable modifier selector now has stable listbox/option IDs, `aria-controls`, `aria-activedescendant`, result-count live status, real keyboard-accessible clear buttons, ArrowUp/ArrowDown/Home/End/Enter/Escape behavior, disabled-option skipping, and focus return after Escape or selection. Typing a query never changes target identity. Duplicate labels display technical identity and the smoke selected exact ID `dup-b` while the disabled `dup-a` was skipped.

At 320x568 with four rows and long labels, the smoke found no page-level horizontal overflow. Its near-bottom popup opened upward inside the viewport without clipping Search Activity. Desktop behavior and mouse/keyboard opening/closing passed in the same compiled smoke.

## Regression gates

| Gate | Command / evidence | Result |
| --- | --- | --- |
| L1-L8 portfolio proof, admissibility, resumed reuse, sensitivity, permutation | `npx tsx crafting-engine/scripts/phase2lPortfolioProofDiagnostic.ts` | PASS, with explicit unclosed exact portfolio |
| L9 / Phase 2J search, Herald refinement/reuse, three-notable | `npx tsx crafting-engine/scripts/phase2jSearchDiagnostic.ts` | PASS |
| Phase 2J Harvest parity/crossover and defensive control | `npx tsx crafting-engine/scripts/phase2jHarvestParityDiagnostic.ts` | PASS |
| Phase 2I W1-W6 / real Herald target order | `npx tsx crafting-engine/scripts/phase2iWeightPolicyDiagnostic.ts` | PASS |
| Phase 2I selected Harvest plan | `npx tsx crafting-engine/scripts/phase2iHarvestPlanDiagnostic.ts` | PASS |
| Phase 2E fracture/restart fidelity and parity | `npx tsx crafting-engine/scripts/phase2eFractureFidelityDiagnostic.ts` | PASS |
| Phase 2K.1 exact fixture, reuse/invalidation, telemetry, Clean-depth explanation | `npx tsx crafting-engine/scripts/phase2k1ExactFixtureDiagnostic.ts` | PASS |
| Phase 2K portfolio and simple clean control | `npx tsx crafting-engine/scripts/phase2kSearchDiagnostic.ts` | PASS |
| L12 compiled Search Activity / selector browser smoke | Vite + headless Chrome, `npx tsx scripts/browserPhase2lSmoke.ts` | PASS |
| Actual Phase 2K.1 Worker boundary | Vite + headless Chrome, `npx tsx scripts/browserPhase2kSmoke.ts` | PASS |
| Build | `npm run build` | PASS |
| Lint | `npm run lint` | PASS |
| Diff hygiene | `git diff --check` | PASS |
| Unit tests | Not added or run | Required constraint satisfied |

## Invariant and readiness audit

- Hardcoded craft answer, fracture winner, or target order added: no.
- Target/Craft-specific solver branch added: no.
- Target probabilities or prices hardcoded as decisions: no.
- Modifier weights remain mechanics inputs and prices remain economic inputs: yes.
- Core fractured states are manufactured by executable self-fracture: yes.
- Pre-fractured market purchase reintroduced into normal ranking: no.
- Wrong-fracture restart/reacquire or fixed `4x` shortcut changed: no.
- Canonical/state identity weakened: no.
- Unknown prices invented: no.
- External validation data used as mechanics input: no.
- Allflame crafting mechanic enabled: no.
- Search/display query permitted to change exact target identity: no.
- Telemetry permitted to change solver decisions: no.
- Unit tests added or run: no.

Before broad product-readiness claims, the main remaining blocker is proof efficiency on pathological exact portfolios: the current generic lower bounds are valid but far too weak to dominate Clean and every fracture family within interactive budgets. The implementation now exposes and retains the exact proof debt needed to improve that later. Broader fixture diversity, longer soak/performance sampling, and product-scale accessibility review would also be prudent, but no correctness blocker was discovered in the required Phase 2L scope.
