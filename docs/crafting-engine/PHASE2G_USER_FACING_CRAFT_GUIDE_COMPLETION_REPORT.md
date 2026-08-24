# Phase 2G User-Facing Craft Guide Completion Report

## 1. Implementation commit

`b58a6c51bfc4a5d822661dbb6b6abca40aa03aed` (`feat: add user-facing branching craft guide`)

The implementation started from `main` at `1bc767038677b3871223c942af96f471cc184c58`.

## 2. Files changed

The implementation commit changes:

- `src/CraftOptimizer.tsx`
- `src/App.css`
- `scripts/browserPhase2fSmoke.mjs`
- `output-browser-phase2f-smoke.txt`
- `scripts/browserPhase2gSmoke.mjs`
- `output-browser-phase2g-smoke.txt`

This completion report is added in the follow-up documentation commit.

## 3. New default information hierarchy

The default result now reads as a player answer rather than a research dashboard:

1. **Craft recommendation / Search outcome**
   - player-readable target modifiers;
   - recommended start;
   - expected cost;
   - optional sale value/profit only when supplied;
   - recommendation confidence;
   - finish condition;
   - human recommendation status;
   - materially relevant warnings.
2. **How to craft it**
   - starting point;
   - actual condition-to-action policy branches;
   - selected self-fracture acquisition details when that method wins.
3. **Expected materials**
   - returned action/material usage and expected cost;
   - expected currency totals in a secondary disclosure.
4. **Advanced optimizer details**
   - proof, policy health, acquisition research, search/performance, confidence, currency coverage, raw rules, and all warning evidence.

For the one-mod browser fixture, the hero text is target T1 ES, `Clean Base`, `8.784c`, `Acquisition-safe`, and `Extra affixes allowed`. The raw enum and proof registers are absent from that default hero.

## 4. Player copy for all recommendation statuses

- `PROVEN_OPTIMAL`: **Proven optimal over the modeled search space.** Every modeled competitor was resolved or safely bounded for this search.
- `BEST_RESOLVED_ACQUISITION_SAFE`: **Recommended route found.** The starting acquisition is safe among modeled families; the exact crafting policy may still improve.
- `PROVISIONAL_RESOLVED`: **Provisional route.** This route is executable, but a cheaper unresolved acquisition may exist.
- `NO_RESOLVED_ROUTE`: **No fully resolved route found within this search budget.** Increase a search budget or adjust the target; this is a valid search outcome.

Provisional results also receive an `Acquisition not yet safe` badge and a default-visible alert. No-route results use a `Search outcome` heading, `No resolved route` badge, `No start certified under this budget`, and a separate alert stating that nothing below is a resolved route. The bounded supplemental browser fixture exercises this no-route presentation and passes in `68ms`.

## 5. Raw status and proof access

`Advanced optimizer details` retains:

- the raw recommendation enum;
- raw proof/global-optimality values;
- acquisition safety;
- resolved incumbent upper bound `U`;
- best unresolved acquisition lower bound `L`;
- potential acquisition gap;
- selected method/provenance;
- worker runtime.

It also retains Bellman/occupancy/reconciliation health, full on-policy rules, alternative acquisitions, synthesis/cache identity, search timing/deadlines/tags/frontier data, confidence counts, currency coverage, and all raw warning evidence.

## 6. Branch-aware craft guide

The default `How to craft it` section maps every returned `result.policyExplanation` entry to one `If <condition> -> Then <action>` card. It does not use an ordered list and explicitly says the cards are policy branches rather than chronological steps.

The visible acquisition action is normalized to player copy such as `Acquire a clean base`; the original engine action, represented-state count, expected visits, and example engine state remain in collapsed `Policy context`. The production diagnostic compares every displayed rule's exact raw `condition`, `action`, and `actionId` attributes to the returned `policyExplanation` array in order. D3 passed.

No linear Alter/Augment/Regal/Exalt recipe is synthesized, and no Craft-specific presentation or solver branch was added.

## 7. Expected materials

`Expected materials` is default-visible next to the guide and renders `result.expectedActionUsage` directly:

| One-mod fixture material/action | Expected usage | Expected cost |
| --- | ---: | ---: |
| Orb of Alteration | 30.347 | 4.264c |
| Acquire a clean base | 1.000 | 4.000c |
| Orb of Augmentation | 7.837 | 0.509c |
| Orb of Transmutation | 1.000 | 0.011c |

Helper copy says that fractional values are long-run averages, not guaranteed whole-number purchases. `expectedCurrencies` remains available once under `Expected currency totals`, avoiding equally prominent duplication. D4 validates exact numeric correspondence for every returned action row.

## 8. Warning hierarchy and provisional behavior

Default-visible warnings are:

- selected-route price warnings;
- selected-route mechanics warnings;
- stale data relevant to the returned economics;
- proof/search warnings when the result is provisional or has no resolved route.

Considered-alternative and broad search-space warnings remain under Advanced unless the proof status makes them decision-relevant.

The controlled provisional result keeps the executable clean-base incumbent visible at `228.909c`, labels acquisition safety as false in player language, shows a prominent alert, and exposes exact evidence: `U=228.909316c`, `L=4.138746c`, potential gap about `224.771c`. It cannot visually masquerade as a normal recommendation.

## 9. Input-form progressive disclosure

Default-visible craft definition remains:

- base type;
- cluster enchantment;
- item level;
- passive count;
- target modifiers;
- final rarity;
- finish condition / extra-affix constraint;
- pricing league.

Manual clean-base price and optional sale value moved under `Pricing & optional economics`, with nested market evidence. Intent, state/wall/round budgets, and research fallback moved under `Advanced search settings`. The primary action is now `Find cheapest craft`. Changing any normalized optimizer input clears the old result so the player cannot read a result against stale form labels.

## 10. Phase 2F D1-D7 regression

Regenerated `output-browser-phase2f-smoke.txt`: **PASS**.

- D1 statText-first ordinary label: PASS
- D2 technical-name search alias: PASS
- D3 stat-text search: PASS
- D4 multiple tiers remain distinguishable: PASS
- D5 notable is understandable/selectable: PASS
- D6 selector and Target Summary agree: PASS
- D7 exact worker modifier IDs are unchanged: PASS

The Phase 2F harness was adapted to the new button/hierarchy and now waits on intercepted worker results rather than racing the transient Cancel button. Its D1-D7 assertions were not weakened.

## 11. Phase 2G D1-D8 browser diagnostic

Regenerated `output-browser-phase2g-smoke.txt`: **all PASS**.

- D1 human recommendation status: PASS
- D2 primary result hierarchy: PASS
- D3 exact branch-guide correspondence: PASS
- D4 exact expected-material correspondence: PASS
- D5 visible provisional incumbent/warning/safety semantics: PASS
- D6 advanced proof/health/search/self-fracture diagnostics retained: PASS
- D7 Phase 2F label contract retained: PASS
- D8 normalized worker identity retained: PASS

The supplemental bounded no-route presentation check also passes.

## 12. Worker-request identity comparison

The Phase 2G production harness intercepts the normalized requests posted to the compiled Worker and asserts the established Phase 2F input contract field by field:

- `baseType = Large Cluster Jewel`;
- `clusterType = 10% increased Attack Damage`;
- `itemLevel = 84`;
- `passiveCount = 12`;
- exact ordered modifier IDs;
- exact rarity and final-state constraints;
- the full expected price context, including all currency rates, manual `4c` clean-base evidence, source, and provenance;
- stable full `marketContext` across the fixture requests;
- `expectedSaleValueChaos` absent;
- research fallback enabled;
- exact state/wall/round budgets;
- `searchIntent = RECOMMEND`.

The first three requests reproduce the prior Phase 2F one-mod, two-mod Any, and no-unwanted fixtures. Their exact target IDs remain identical to the committed Phase 2F evidence. The Phase 2F artifact did not serialize every historical request field, so the broader comparison is an absolute expected-contract assertion plus unchanged `draftInput` construction, not a byte-for-byte diff against a previously stored full JSON request.

## 13. One-mod economic result/runtime

- Target: T1 Energy Shield
- Acquisition: Clean Base
- Status: `BEST_RESOLVED_ACQUISITION_SAFE`
- Expected cost: `8.783561c` (`8.784c` displayed)
- Browser/worker runtime: `953ms`
- Proper policy: yes
- Terminal absorption: `0.9999999999996421`
- Unresolved on-policy mass: effectively zero
- Bellman/occupancy: converged

## 14. Two-mod Any economic result/runtime

- Target: T1 Energy Shield + T1 Intelligence
- Rarity: Any
- Acquisition: Clean Base
- Status: `BEST_RESOLVED_ACQUISITION_SAFE`
- Expected cost: `228.790316c` (`228.790c` displayed)
- Browser/worker runtime: `2265ms`
- Terminal absorption: `0.9999999999776508`

## 15. No-unwanted result/runtime

- Target: T1 Energy Shield + T1 Intelligence
- Constraint: `{ "maxUnmatchedAffixes": 0 }`
- Expected cost: `228.790316c`
- Browser/worker runtime: `2092ms`
- Terminal absorption: effectively 100%
- UI finish condition: `No unwanted affixes`

## 16. Provisional fixture

The controlled two-mod forced-Rare production fixture returns:

- selected incumbent: Clean Base;
- expected/resolved incumbent upper bound: `228.909316c`;
- best unresolved acquisition lower bound: `4.138746c`;
- recommendation: `PROVISIONAL_RESOLVED`;
- acquisition safe: no;
- browser/worker runtime: `14641ms`.

The incumbent, cost, unsafe meaning, qualitative alert, and competitive unresolved evidence are all default-visible; exact proof registers remain under Advanced as well.

## 17. Self-fracture presentation fixture

The same controlled service-backed result discovers and resolves two mechanically relevant self-fracture families:

- T1 ES: `U=1465.766276c`, `L=4.139902c`, expected Fracturing Orbs `4.000`, expected clean-base restarts `3.000`;
- T1 Intelligence: `U=1477.941256c`, `L=4.138746c`, expected Fracturing Orbs `4.000`, expected clean-base restarts `3.000`.

The UI maps both physical families to statText-first player labels using their exact fractured modifier IDs, not reconstructed internal affix names. It shows the returned Fracturing Orb/restart values and the returned wrong-fracture rule: no in-place reset; recovery is restart/reacquisition and pays the clean-base price again.

Only `clean-base_*` and `self-fracture_executable` methods appear. No pre-fractured market purchase participates. Clean Base remains the selected incumbent at current prices, so the conditional default-visible selected-self-fracture block exists but no natural winning self-fracture fixture currently exercises that selected path; the advanced user-accessible presentation is fully exercised.

## 18. Build result

`npm run build`: **PASS**.

TypeScript project build and Vite production build completed successfully. Vite reported its existing native-config and large-chunk advisory warnings; neither is a Phase 2G failure.

## 19. Lint result

`npm run lint`: **PASS with one pre-existing warning**.

The only warning is the existing `oxc(erasing-op)` warning at `crafting-engine/src/solver/policyEngine.ts:748`. Phase 2G did not touch that file. `git diff --check` and both browser-script syntax checks also pass.

## 20. Production browser/worker smoke

**PASS** against `npm run preview` and the compiled worker bundle in headless Chrome.

The final recorded browser outputs were regenerated after the final source build. The disposable `.tmp-phase2g-chrome` profile and its processes were removed after validation and were not committed.

## 21. Solver/domain/rules mechanics

Confirmed unchanged. The implementation commit touches only React presentation/CSS and browser diagnostic artifacts. It does not modify `crafting-engine` solver, domain, rules, mechanics, strategy discovery, acquisition synthesis, optimizer ranking, or worker-request construction.

The existing self-fracture-only acquisition rule, absence of pre-fractured market purchase in ranking, and retired approximate fracture formula remain unchanged.

## 22. Unit tests and Craft-specific branches

No unit tests were added. No Craft-specific solver or UI branch was added. The requested validation used the existing regression matrix and compiled production browser/worker diagnostics.

## 23. Remaining blockers before broad product readiness

- Game-mechanics fidelity is still explicitly partial; the UI now exposes rather than solves those existing modeling limits.
- The committed Allflame market and currency evidence is stale, so selected-route economics correctly carry default-visible freshness warnings.
- Acquisition-safe recommendations do not necessarily prove the exact downstream policy globally optimal.
- The controlled forced-Rare fixture remains provisional with a large unresolved acquisition gap and takes about `14.6s`; broader high-complexity targets remain a search/performance concern.
- Current prices do not produce a naturally selected self-fracture winner, so that conditional default-visible acquisition block is not yet covered by a natural production selection fixture.
- Vite still reports the existing bundle-size and future native-config compatibility advisories.

## Claude review

Claude reviewed the full Phase 2G plan and the uncommitted implementation before the implementation commit. Supported findings were applied before final validation:

- fracture-family player labels now derive from exact fractured mod IDs rather than reverse-matching a private internal-name format;
- optimizer input changes invalidate stale displayed results;
- acquisition actions use player copy while raw actions remain available;
- no-route presentation and a bounded browser fixture were added;
- D5's incumbent assertion now checks the visible DOM and a non-null route;
- D8 now asserts the full expected price context plus market/fallback/economics fields;
- Phase 2F completion detection no longer races the Cancel button;
- the final build and all browser artifacts were regenerated after those changes;
- the disposable Chrome profile was removed.
