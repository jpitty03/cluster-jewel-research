# Phase 2E Fracture-Preparation Fidelity Completion Report

## Status

Phase 2E is complete. The executable self-fracture acquisition path remains part of normal optimizer discovery and ranking, the demonstrated preparation-search gap is closed with a correctness-scoped generic state quotient, unresolved synthesis evidence remains proof-blocking, and pre-fractured market purchases and the legacy approximate formula remain outside core ranking.

The standard Crafting Bench is not modeled or assumed as a source of cluster-jewel target modifiers or notables. No speculative Bench filler was added.

## 1. Commit SHA

Phase 2E implementation and regenerated diagnostics:

`11dae241cce320145adefc02a58fa7e454ef7d85`

Preceding corrected Phase 2E review/source-of-truth commit:

`10a0a03` (cherry-picked from `f36e01c3770eefaeb81d0db3335151727afbd9ae`)

## 2. Files changed

Implementation and diagnostic sources:

- `crafting-engine/src/solver/acquisitionFixedPolicyBaseline.ts`
- `crafting-engine/src/solver/acquisitionSynthesis.ts`
- `crafting-engine/src/solver/genericSearch.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/src/solver/expectedCost.ts`
- `crafting-engine/src/reporting/explainPath.ts`
- `crafting-engine/scripts/phase2eFractureFidelityDiagnostic.ts`
- `crafting-engine/scripts/phase2dIntegrationDiagnostic.ts`
- `src/CraftOptimizer.tsx`

Regenerated evidence:

- `output-fracture-fidelity-phase2e.txt`
- `output-acquisition-synthesis-phase2d.txt`
- `output-developer-ui-phase2c.txt`
- `output-browser-phase2c-smoke.txt`
- `output-craft-a.txt`
- `output-craft-a-review.txt`
- `output-craft-c.txt`
- `output-craft-c-review.txt`

This completion report is added in the follow-up documentation commit.

## 3. Source review findings for Phase 2D commit 304784e

- `synthesizeAcquisition()` runs in the normal `OptimizerService` acquisition stage; the strategy-discovery compatibility entry remains intact.
- Only `RESOLVED` synthesis with a finite executable upper bound enters the acquisition portfolio.
- Provisional or unresolved synthesis never receives a fabricated finite method. Its lower bound is retained as a synthetic evidence route and can make acquisition selection unsafe.
- Acquisition state and wall-time budgets are divided fairly across relevant fracture candidates using quotient/remainder allocation.
- Cache identity covers the clean physical state, fracture requirement, clean-price evidence, complete active rates, enabled actions, state-identity version, Harvest scope, fallback policy, intent, and exact candidate budget.
- The legacy approximate fracture formula is diagnostic/regression-only.
- Caller-supplied pre-fractured market prices remain dormant and ignored by core acquisition ranking.

## 4. Unresolved synthesis lower-bound propagation

A controlled proof fixture uses a one-mod T1 ES target, a deliberately artificial `0.001c` Fracturing Orb price, and a 500-state acquisition budget. This is diagnostic-only and is not normal pricing.

- Certified clean-route upper bound: `8.816617c`
- Fracture synthesis status: `UNRESOLVED`
- Fracture synthesis finite executable method: none
- Fracture lower bound: `4.062390c`
- Result: the executable clean incumbent is shown, but status is `PROVISIONAL_RESOLVED` and acquisition safety is `NO` because `L_fracture < U_clean`.

This verifies proof-safe product behavior without inventing an upper bound.

## 5. Exact fixed-policy baseline and action legality

The diagnostic-only baseline is:

1. Transmute the clean normal base.
2. Alter every magic miss until the requested modifier is present.
3. Augment only a one-affix target hit.
4. Regal the two-affix magic item to a three-affix rare item.
5. Exalt the three-affix rare item to a four-affix fracture source.
6. Apply a Fracturing Orb.
7. Scour a desired fracture to the reusable terminal base; abandon and reacquire after a wrong fracture.

Every legality check, transition distribution, probability, and price is obtained from the shared `CRAFT_MECHANICS` registry, dynamic restart mechanic, target semantics, and `PriceBook`. The evaluator checks complete probability mass and target preservation through 1,359 magic outcomes, 1,697 canonical rare-three states, 18,324 rare-four states, and 219,888 fracture transitions. No Bench action and no market-fractured purchase participates.

## 6. Baseline action usage and EV

- Total acquisition EV: `1512.424444c`
- Preparation EV: `1502.424444c`
- Per-magic-roll target hit: `1.437699681%`
- Desired fracture per attempt: `25.000000000%`, derived from shared transitions
- Proper / terminal absorption / reconciliation: `YES / 100% / PASS`

Expected action usage:

- Transmutation: `4.000000` (`0.120000c`)
- Alteration: `274.222222` (`30.164444c`)
- Augmentation: `1.333333` (`0.040000c`)
- Regal: `4.000000` (`0.800000c`)
- Exalted: `4.000000` (`4.800000c`)
- Fracturing: `4.000000` (`1436.000000c`)
- Scouring: `1.000000` (`0.500000c`)
- Restart/reacquire: `3.000000` (`30.000000c`)

## 7. Generic-search U/L before changes

- `U_search = 12797.759749c`
- `L_search = 10.234997c`
- States: `5001`
- Alterations: `100709.345101`

## 8. Baseline versus pre-change search

The pre-change generic incumbent was `11285.335304c` more expensive than the fixed-policy baseline, or `8.461751x` the baseline total. This was a material search-fidelity gap.

## 9. Search failure/staging diagnosis

Concrete non-target filler identities expanded the same target-present preparation milestones into tens of thousands of equivalent rare-three and rare-four states. Only 3 of 33 target-ready magic states selected Regal; only 2 of 1,670 target rare-three Exalt candidates resolved; 53,889 Exalt successors were absent. The certified policy consequently rerolled valid target hits.

## 10. Generic-search changes

- Added an optional caller-supplied canonical state identity to `GenericSearchEngine`; normal product search retains the full canonical identity.
- Added acquisition-only `FRACTURE_PREPARATION_BISIMULATION_V1` identity. Target-absent states remain fully concrete; once the desired modifier is present, filler permutations collapse by base, rarity, affix count, and distinct desired/wrong fracture milestones.
- Kept Bellman action selection unrestricted; the baseline sequence is not encoded in the solver.
- Removed Annulment only from the acquisition-synthesis action allowlist. Annulment remains available to normal crafting; in acquisition preparation it removes required progress, is dominated by Scour after success, and cannot repair a permanent wrong fracture.
- Versioned the quotient in the exact synthesis cache identity and exposed it in diagnostics/UI proof evidence.
- Added persistent-extension seed/new/retained-state accounting.

A 5,001-state concrete audit compared immediate costs and quotient-aggregated action distributions. It found zero equivalence violations across 2,046 non-wrong concrete states. It separately audited 2,954 permanent-wrong states and 2,954 non-restart transitions; none escaped to a desired fracture.

## 11. Generic-search U/L after changes

- `U_search = 1506.328333c`
- `L_search = 10.239731c`
- Difference from fixed baseline: `-6.096111c`; generic search beats the known-legal baseline.
- All baseline milestone edges are resolved in the post-change graph.
- Selected policy: fully resolved, proper, absorbing, and cost-reconciled.
- Global optimality: not yet proven; unresolved modeled branches may still be cheaper.

## 12. Expected Fracturing Orbs and restarts

Both the fixed-policy baseline and the improved generic incumbent derive approximately `4.000000` Fracturing Orbs and `3.000000` clean-base restarts from shared transition probabilities.

## 13. Wrong-fracture recovery

Wrong fracture is permanent. Fracturing Orb is no longer legal, Scour preserves the wrong fractured modifier, and no in-place reset is available. The on-policy recovery is `restart_reacquire` with three expected visits and `30.000000c` expected restart cost under the 10c standalone clean-base fixture.

## 14. Mechanics coverage audit

- Modeled and applicable by state: Transmutation, Alteration, Augmentation, Regal, Exalted, Scour, Fracturing, restart/reacquire.
- Annulment: modeled for normal crafting and intentionally excluded from acquisition synthesis for the dominance/permanence reasons above.
- Chaos Orb: legality/cost exists, but no executable analytical transition distribution is registered.
- Orb of Alchemy: applicable but not modeled; it was not needed to close the demonstrated baseline gap.
- Harvest reforges: deferred non-core mechanics for this standalone acquisition fixture.
- Standard Crafting Bench target modifier/notable: not applicable and not modeled.

No genuinely missing action blocks the demonstrated legal baseline or current certified incumbent.

## 15. Persistent graph metrics

The bounded `PROVE` fixture reports:

- Canonical states: `5001`
- Seed states expanded: `1`
- New states by round: `1666, 1667, 1667`
- Retained states reused by round: `1, 1667, 3334`
- Cumulative expansion work: `5001`
- Repeated states: `0`
- Rounds: `3`
- Mode: `PERSISTENT_EXTENDED`
- Transition reuse: retained nodes keep generated edges; no canonical state is re-expanded.

## 16. Acquisition timing and caching

In the full Phase 2E portfolio run, the two independently synthesized fracture families used 1,667 canonical states each and completed in approximately `8.962s` and `8.979s`. The explicit no-market repeat reused the exact cached T1 Intelligence synthesis (`1` cache hit). The regenerated Phase 2D exact-repeat fixture completed downstream processing in `4.906s` with the same cache hit.

## 17. Multi-fracture result

For requested T1 Intelligence plus T1 Attributes, both relevant fracture families are independently discovered and certified without market quotes:

- T1 Intelligence: `U=1482.328333c`, `L=4.239731c`, executable
- T1 Attributes: `U=1482.328333c`, `L=4.239727c`, executable

The bounded downstream rare craft has no resolved final route, so the product result honestly remains `NO_RESOLVED_ROUTE`; acquisition discovery itself certifies both families.

## 18. Forced-Rare result

- Selected incumbent: clean base
- Clean `U/L`: `243.959278c / 4.230098c`
- T1 ES fracture `U/L`: `1477.396467c / 4.240050c`
- T1 Intelligence fracture `U/L`: `1482.328333c / 4.239731c`
- Acquisition safety: `NO`
- Recommendation: `PROVISIONAL_RESOLVED`
- Downstream states/cumulative/repeated: `5000 / 9998 / 4998`
- Full diagnostic runtime: approximately `32.054s`

## 19. One-mod browser result

Production browser + worker: `PASS` in `931ms`. Clean Base remained selected, status was `BEST_RESOLVED_ACQUISITION_SAFE`, expected cost was `8.784c`, and policy absorption/convergence remained healthy.

## 20. Two-mod Any browser result

Production browser + worker: `PASS` in `2018ms`. Clean Base remained selected and acquisition-safe at `228.790c`; policy absorption was `100%`, unresolved on-policy mass was `0%`, and Bellman/occupancy converged.

## 21. No-unwanted result

The production UI rendered the no-unwanted control and returned a healthy policy in `1950ms`, with the clean-base route at `228.790c`. The normal optimizer R3 fixture also remained acquisition-safe, proper, absorbing, and reconciled at `243.759278c`.

## 22. Harvest parity

Raw-presence and exactly-one-Annul semantics are unchanged; remaining junk is still allowed.

- Raw simultaneous presence: external `0.2512458%`, analytical `0.2755331%`, seeded MC `0.2753000%` — `CLOSE / APPROXIMATE`
- Conditional one-Annul preservation: `40.0367309% / 43.7754343% / 44.2789684%` — `CLOSE / APPROXIMATE`
- Unconditional Harvest-then-one-Annul presence: `0.1005906% / 0.1206158% / 0.1219000%` — `CLOSE / APPROXIMATE`

## 23. Fracturing parity

External `25.0000%`, analytical `25.0000%`, and seeded Monte Carlo `24.9550%` remain `ALIGNED`. The shared mechanic supplies this probability; normal acquisition ranking contains no fixed `4x` retry formula.

## 24. Craft A regression

- Analytical total: `7623.7c`
- Pooled five-seed Monte Carlo mean: `7568.1c` (`-0.73%`)
- Completion: `100%` for all seeds
- Status: `MULTI-SEED STABLE`
- All six representative policy decisions passed.

The historical 1533.4c acquisition fixture remains labeled approximate and isolated from normal optimizer ranking; its report no longer describes Bench preparation.

## 25. Craft C regression

- Analytical total: `42814.4c`
- Pooled five-seed Monte Carlo mean: `42483.5c` (`-0.77%`)
- Minimum completion: `99.95%`; one bounded timeout across 10,000 trials
- Status: `MULTI-SEED STABLE`
- All four representative policy decisions passed.

The same historical acquisition-fixture caveat applies.

## 26. Build, lint, and browser results

- `npm run build`: `PASS`
- `npm run lint`: `PASS` with the documented pre-existing erasing-operation warning at `crafting-engine/src/solver/policyEngine.ts:748`
- Production preview + compiled worker browser smoke: `PASS`
- `git diff --check`: `PASS`
- Unit tests: not added or run, as requested

## 27. Product-ranking readiness

Yes, with explicit proof qualifications. The executable self-fracture upper bound now beats the complete known-legal baseline and is sufficiently tight to participate in normal product ranking as a certified incumbent. It is not presented as globally optimal: unresolved lower bounds continue to control provisional/acquisition-safe labeling.

The fixed-policy evaluator is diagnostic-only, the legacy approximate formula remains diagnostic/regression-only, and pre-fractured market purchases remain absent from core discovery.

## 28. Remaining blockers before broader UI productization

There is no remaining Phase 2E correctness blocker for normal ranking. Broader productization should still account for:

- global optimality is not yet proven for the acquisition action graph;
- executable Chaos/Alchemy transition models remain deferred and could expose cheaper policies later;
- independent synthesis currently costs roughly 9 seconds per fracture family on the full research fixture, so UI budget and cache presentation remain important;
- proof status, unresolved competing lower bounds, action coverage, and cache identity should remain visible when expanding the public UI.

These are explicit fidelity/performance limitations, not reasons to add target-specific solver branches or assume Crafting Bench target-mod creation.

## Completion gates

All Phase 2E gates pass:

- Phase 2D implementation was pushed and source-reviewed.
- The corrected Phase 2E review was cherry-picked.
- Diagnostics A-I and regressions R1-R9 pass with the proof qualifications recorded above.
- The standard Crafting Bench does not create target modifiers/notables in the model.
- No fixed `4x` economics or pre-fractured market purchase participates in normal ranking.
- No unit tests or Craft-specific solver branches were added.
