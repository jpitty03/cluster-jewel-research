# Phase 2K.1 Exact-Fixture / Telemetry Hardening Completion Report

## Status

Phase 2K.1 is complete on 2026-08-24. This closeout is intentionally limited to the gaps in `POST_PHASE2K_REVIEW_AND_PHASE2K1_EXACT_FIXTURE_TELEMETRY_HARDENING.md`; the Phase 2K fracture portfolio, solver architecture, and Search Activity UI were not redesigned.

No unit tests were added or run.

## K1 — Permanently pinned exact RWE fixture

`crafting-engine/scripts/phase2k1ExactFixture.ts` now owns the deterministic fixture:

- Large Cluster Jewel;
- `10% increased Attack Damage`;
- item level 84;
- 12 passives;
- required rarity Rare;
- extra affixes allowed (`maxUnmatchedAffixes` is absent);
- exact targets, in the source-of-truth order:
  - `AfflictionJewelSmallPassivesHaveIncreasedEffect2`;
  - `AfflictionJewelSmallPassivesGrantInt3`;
  - `AfflictionJewelSmallPassivesGrantES3`;
  - `AfflictionJewelSmallPassivesGrantAttributes3`;
- an explicit frozen currency-rate table and 10c clean base;
- no pre-fractured market purchase.

The fixture allows research-fallback confidence because the service deliberately marks a synthesized self-fracture restart with that confidence even when every numeric price in the fixture is explicit. No stale Allflame value participates in deterministic expectations.

The final cold run completed in 24,659.505ms. Its selected route happened to be T1 Intelligence self-fracture at 3,926.335455c, but no assertion requires that target or order to win.

| Candidate | L | Acquisition U | Downstream U | Full-route U | Final cold status |
| --- | ---: | ---: | ---: | ---: | --- |
| Clean Base | 10.000000c | — | — | 213,866.185619c | Resolved |
| 35% Effect / Powerful | 369.000000c | 1,496.542933c | 3,449.880560c | 4,946.423493c | Full route resolved |
| T1 Intelligence / of the Prodigy | 369.000000c | 1,505.670333c | 2,420.665122c | 3,926.335455c | Selected |
| T1 Energy Shield / Glowing | 369.000000c | — | — | — | Probing at budget |
| +4 Attributes / of the Meteor | 369.000000c | — | — | — | Unresolved at budget |

The selected policy is proper, absorbing at 1.0, Bellman-converged, occupancy-converged, and cost-reconciled, with zero unresolved on-policy probability. Acquisition selection remains explicitly provisional: best unresolved L is 369c, potential gap is 3,557.335455c, modeled-action/global optimality is not proven, and unresolved competitors may be cheaper. This is proof-honest and meets the requirement that at least one executable self-fracture full route rank against Clean Base.

The older `phase2kSearchDiagnostic.ts` now imports the exact shared fixture instead of labeling the 8-passive dual-wield/no-extra case as the real fixture.

## K2 — Cold, resumed, and invalidated behavior

The exact fixture was issued twice through one `OptimizerService` instance:

| Request | Progress status | Result reuse | Retained states | Selected U |
| --- | --- | --- | ---: | ---: |
| Fresh RECOMMEND | `COLD` | `COLD` | 0 | 3,926.335455c |
| Same-worker DEEPEN | `RESUMED` | `RESUMED` | 2,158 | 3,926.335455c |

The resumed request retained 6,860 transition distributions, returned the same selected route/cost, and retained the same 1,505.670333c selected acquisition U. The service result now attributes a directly returned fracture policy to its selected `FRACTURE_DOWNSTREAM` session, rather than overwriting the summary with a newly keyed aggregate-portfolio session.

Complex multi-mod `DEEPEN` requests keep the clean probe bounded at 3 seconds. Before this correction, a resumed request could spend roughly 20 seconds re-refining a dominated clean route, reach only the first fracture, and return a worse incumbent. Deadline-skipped candidates are also no longer mislabeled `DOMINATED`; only an admissible bound can produce that status.

Changed economic and mechanics inputs each produced `INVALIDATED` with zero retained states. Exact identity checks also independently changed for passive count, item level, Harvest scope, fallback policy, final-state constraint, and a currency rate.

The diagnostic additionally exercises `A -> B -> A`: after both changed contexts, returning to the exact fixture reports `RESUMED` in progress and result telemetry and reuses the original selected downstream session's 2,158 states. Reuse status is now based on retained exact-context work before a previous-request invalidation reason, so the UI does not falsely label this case invalidated.

## K3/K4 — Actual Worker boundary and terminal ordering

`scripts/browserPhase2kSmoke.ts` no longer substitutes a direct `executeOptimizerWorkerRequest` call. It loads `OptimizerWorkerClient` in Chrome through Vite, which instantiates the compiled module Worker and crosses the real structured-clone/message boundary.

Observed success sequence:

```text
PROGRESS:INITIALIZING
-> PROGRESS:CLEAN_PROBE ...
-> PROGRESS:COMPLETE
-> RESULT
```

The last progress snapshot contained the final selected route, candidate statuses, best executable U, unresolved L, and potential gap. The service emits this single authoritative `COMPLETE` only after result construction/serialization succeeds. ERROR, cancel, and host-guard replacement do not synthesize it.

The success request used the exact 10% Attack Damage / 12-passive fixture, not a clean-only control. In 20,954.700ms it crossed the Worker boundary with all five candidates, four executable fracture full routes in terminal progress, and a selected self-fracture route. The actual-browser smoke also passed:

- response request IDs matched across all 29 unfiltered, non-injected events observed on the success Worker;
- result/progress structured clone completed with zero `messageerror` events;
- injected unknown-request progress was ignored while a request was pending;
- injected stale progress was ignored after RESULT;
- Cancel rejected with `AbortError`, terminated/replaced the Worker, and ignored old-worker progress;
- a forced host guard rejected with `SearchWallTimeExceededError`, terminated/replaced the Worker, ignored old-worker progress, and the replacement recovered through `COMPLETE -> RESULT`;
- an invalid actual-worker request ended in `ERROR` with no prior `COMPLETE` and no later progress;
- no progress followed RESULT or ERROR.

The Search Activity cards now say `Current Full Route U`, explain that non-selected values are current executable upper bounds at allocated depth, end at `Search Complete`, mark the final selected candidate `SELECTED`, and convert any budget-ended `PROBING` candidate to `UNRESOLVED`. The terminal frame preserves the result's authoritative 3,926.335455c executable U, 369c unresolved L, and 3,557.335455c potential gap.

## K5 — Telemetry equivalence and overhead

The deterministic frozen one-mod clean-dominance control completes by graph/proof criteria before its deadline, avoiding wall-time-frontier noise. After warmup, seven fresh-service paired runs alternated ON/OFF order. This measures the requested service-level progress-callback delta; when telemetry is OFF, the service now also omits its engine progress closures. The exact fracture branch is covered functionally by the exact diagnostic and actual Worker smoke, but is not used for the timing median because its wall-time frontier would make a <=5% overhead comparison noisy and decision-unstable.

The semantic fingerprint was identical in every pair for:

- selected acquisition/action and expected cost;
- risk, properness, absorption, Bellman, occupancy, and reconciliation;
- recommendation and proof status;
- acquisition candidate status/cost/proof and route ranking;
- selected policy rules;
- graph/search decision semantics.

Measured samples:

```text
OFF ms: 575.302, 552.815, 581.836, 560.938, 564.925, 557.123, 556.492
ON  ms: 556.142, 549.771, 579.805, 582.135, 578.660, 552.595, 565.504

OFF median: 560.938ms
ON median:  565.504ms
Overhead:   0.814%
Target:     <=5% — PASS
```

Telemetry remains observational; search fidelity was not reduced.

## K6 — Current-depth Clean U versus mature clean U

All values below use the same exact target, frozen PriceBook, inferred Harvest action set (`attribute`, `defences`, `energy_shield`), and research-fallback policy.

| Search | States | Result | Clean U |
| --- | ---: | --- | ---: |
| Normal portfolio clean probe | 3,334 | Executable at allocated depth | 213,866.185619c |
| Clean-only seed | 5,000 | Uncertified incumbent; not called executable | 45,063.038340c |
| First clean-only DEEPEN | 10,000 | Uncertified incumbent; not called executable | 45,063.038386c |
| Final clean-only DEEPEN | 17,500 | Proper, absorbing, Bellman/occupancy-converged, reconciled, stable | 35,695.666547c |

The final clean-only tranche took 60,317.848ms beyond its retained graph. It demonstrates that the portfolio's 213,866c clean figure is the current executable upper bound at its allocated search depth, not a mature clean-policy estimate.

The scheduler bounds the clean probe in advance through its generic complex-target allocation policy; it does not first prove fracture dominance and then stop clean. It reallocates the remaining request budget across all four fracture candidates, and this run then resolves fracture routes well below both the allocated-depth and mature clean U values. The selected executable fracture route is 3,926.335455c, about 9.1 times cheaper even than the mature clean-only policy.

## Regression gates

| Gate | Command/evidence | Result |
| --- | --- | --- |
| Exact cold/resumed fixture, candidate table, identity invalidation, telemetry equivalence/overhead, mature Clean U | `npx tsx crafting-engine/scripts/phase2k1ExactFixtureDiagnostic.ts` | PASS |
| Actual browser Worker boundary and terminal hygiene | Vite + headless Chrome CDP, then `npx tsx scripts/browserPhase2kSmoke.ts` | PASS |
| Phase 2E fracture/restart fidelity | `npx tsx crafting-engine/scripts/phase2eFractureFidelityDiagnostic.ts` | PASS |
| Phase 2I W1–W6 | `npx tsx crafting-engine/scripts/phase2iWeightPolicyDiagnostic.ts` | PASS |
| Phase 2J Herald refinement/reuse and J8 three-notable | `npx tsx crafting-engine/scripts/phase2jSearchDiagnostic.ts` | PASS |
| Phase 2J Harvest parity and defensive two-mod | `npx tsx crafting-engine/scripts/phase2jHarvestParityDiagnostic.ts` | PASS |
| Build | `npm run build` | PASS |
| Lint | `npm run lint` | PASS |
| Diff hygiene | `git diff --check` | PASS |
| Unit tests | NOT RUN | Required constraint satisfied |

Evidence artifacts:

- `output-phase2k1-exact-fixture-diagnostic.txt`;
- `output-browser-phase2k-smoke.txt`;
- refreshed Phase 2E, Phase 2I, and Phase 2J diagnostic outputs.

## Constraint audit

- Hardcoded fracture winner or target order: no.
- Target/Craft-specific solver branch: no.
- Market pre-fractured purchase in normal ranking: no.
- Wrong-fracture restart/reacquisition fidelity: retained and regression-passed.
- Fixed 4x fracture shortcut: no.
- Weakened state identity: no.
- Unknown prices invented: no.
- Allflame crafting enabled: no.
- Telemetry changes decisions: no.
- Unit tests added/run: no.

## Review

Claude Code 2.1.241 performed the requested independent source review with Opus/high effort before commit. Its session could read files but was denied Bash/git access, so all post-review execution claims below were independently rerun rather than attributed to Claude.

Claude identified three closeout blockers, all addressed and regressed:

- terminal `COMPLETE` was recomputing and potentially dropping authoritative unresolved L/gap; the terminal frame now retains result values and has an explicit equality gate;
- budget-ended candidates could remain `PROBING`; final reconciliation now emits `UNRESOLVED` and the diagnostic requires zero lingering `PROBING` candidates;
- the Worker request-routing assertion filtered by request ID before asserting it; it now asserts over the success Worker's unfiltered actual events.

The review also prompted stronger evidence: the browser success case now runs the exact five-candidate fracture portfolio; `A -> B -> A` reuse is covered; the K6 clean-only action set now matches the portfolio; scheduler causality and telemetry benchmark scope are stated precisely; zero-valued UI bounds render correctly; and the unit-test gate wording is unambiguous. No second Claude session was started because the available Claude quota was nearly exhausted.
