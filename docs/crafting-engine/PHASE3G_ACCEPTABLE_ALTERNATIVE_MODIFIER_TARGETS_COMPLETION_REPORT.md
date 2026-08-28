# Phase 3G Acceptable Alternative Modifier Targets Completion Report

Date: 2026-08-28 (America/Los_Angeles)

Status: **IMPLEMENTATION COMPLETE / ACCEPTANCE PASS**

Source-of-truth plan: `POST_PHASE3F_FIELD_REVIEW_AND_PHASE3G_ACCEPTABLE_ALTERNATIVE_MODIFIER_TARGETS_PLAN.md`, SHA-256 `11e667e32e521aacf429e36d7f3c8585071c9fed62201c54228717839e8a3794`.

Baseline pulled from `origin/main`: `e738e689616e3db8d58d0e118d0e201ea3d03a36`.

## 1. Outcome and frozen field target

Phase 3G makes the existing `TargetDefinition.acceptableAnyOf` contract authoritative end to end. It does not introduce another optional-modifier model and never flattens OR branches into `requiredMods`.

The frozen browser/Worker fixture is:

- Large Cluster Jewel, `10% increased Spell Damage`, item level 84, 12 passives;
- final rarity Rare, extra affixes allowed;
- all three required: Energy Shield T1 (`AfflictionJewelSmallPassivesGrantES3`), Intelligence T1 (`AfflictionJewelSmallPassivesGrantInt3`), and Increased Effect T1 (`AfflictionJewelSmallPassivesHaveIncreasedEffect2`);
- at least one equally acceptable alternative: All Attributes T1 (`AfflictionJewelSmallPassivesGrantAttributes3`), Strength T1 (`AfflictionJewelSmallPassivesGrantStr3_`), or Cast Speed T1 (`Added Small Passive Skills also grant: #% increased Cast Speed_T1`).

Canonical completion is therefore `required[3] AND (alternative[0] OR alternative[1] OR alternative[2])`. The three completion scenarios each contain four requirements and independently fit the Rare 2-prefix/2-suffix shape.

## 2. Root cause and repair boundary

`acceptableAnyOf` already existed in the domain type, but the application had no shared canonical or progress contract around it. Consumers consequently made one of four incompatible assumptions:

1. validation, UI state, Worker assembly, share data, bug reports, and fixture input treated `requiredMods` as the entire target and omitted alternatives;
2. feasibility and lower-bound code had local scenario expansion, while generic search, Allflame scoring, and specialized candidate discovery scored a flat collection of relevant modifiers;
3. terminal evaluation knew the OR semantics, but explanation, PolicyFlow, visualization, and craft-guide evidence exposed only one undifferentiated matched/missing list;
4. fingerprints and caches serialized whichever partial target shape their caller happened to supply, so order, duplicates, legacy absence, and enabled alternatives lacked one canonical identity boundary.

The repair starts in `TargetDefinition.ts`: requirement identity, target canonicalization, scenario generation, and structured progress evaluation are now shared. Service validation canonicalizes once at the request boundary. Required requirements and acceptable branches are independently sorted and deduplicated; empty/duplicate/overlapping/ineligible branches fail with field-specific errors. Disabled alternatives are omitted so legacy required-only target bytes remain stable.

All downstream changes consume that contract:

- Worker requests, persistence, replay, export/share version `3G.1`, bug reports, target/cache fingerprints, and registry identity retain the canonical branch shape;
- legacy `2R.1`, `2W.1`, `2X.1`, and `2Y.1` shares decode as required-only targets;
- terminal evaluation, feasibility, lower bounds, pruning priorities, acquisition synthesis, policy search, and plugin scoring use scenario or structured progress semantics as appropriate;
- explanation rules, decision cohorts, PolicyFlow nodes, and visualization details carry required progress separately from acceptable progress and matched branch identities;
- legacy required-only PolicyFlow serialization and labels remain unchanged.

No player-facing modifier text is used as identity, and no target-specific production branch or preferred alternative was added.

## 3. Canonicalization and scenario-aware validation

The direct Phase 3G gate proved:

- canonical required count: 3;
- canonical acceptable branch count: 3;
- scenario count: 3, each with 4 requirements;
- minimum feasible rarity: Rare;
- exact feasible affix shape: 2 prefixes / 2 suffixes for every scenario;
- duplicate IDs, duplicate branches, required/alternative overlap, empty branches, and pool-ineligible IDs are rejected at their owning field;
- conflicts and affix capacity are checked per completion scenario rather than by demanding mutually exclusive alternatives coexist.

The negative control inserted a conflicting Effect tier into one alternative. Validation reported both `ALTERNATIVE_MOD_GROUP_CONFLICT` and `SCENARIO_AFFIX_CAPACITY_EXCEEDED` against `target.acceptableAnyOf`. This proves validation is branch-aware rather than a cosmetic editor check.

## 4. Terminal truth table and probability union

| State shape | Required progress | Acceptable progress | Terminal |
|---|---:|---:|---|
| all three required, no alternative | 3/3 | 0/1 | no |
| all three required + All Attributes T1 | 3/3 | 1/1 | yes |
| all three required + Strength T1 | 3/3 | 1/1 | yes |
| all three required + Cast Speed T1 | 3/3 | 1/1 | yes |
| any one required modifier missing + an alternative | 2/3 | 1/1 | no |
| all required + two acceptable alternatives | 3/3 | 1/1 | yes, counted once |

For the audited Exalt distribution, total transition probability is `0.9999999999999998`. The union of terminal outcomes is `0.05770144593035095`. A state containing two acceptable alternatives reports two satisfied branch indices but contributes one terminal outcome, proving that alternatives are not double-counted.

## 5. Solver, Bellman, and route evidence

The real Worker selected `bundle:family_fracture_AfflictionJewelSmallPassivesGrantInt3:independent`. This is evidence for the selected run, not a hardcoded winner.

| Measure | Result |
|---|---:|
| PolicyFlow nodes / edges / sampled states | 38 / 87 / 24 |
| On-policy reachable / exact terminal states | 528 / 4 |
| Bellman iterations | 1,010, converged |
| Occupancy iterations | 9, converged |
| Terminal absorption probability | `0.9999999999955921` |
| Unresolved on-policy probability | 0 |
| Acquisition cost | `1625.7609017006848c` |
| Downstream cost | `1851.7099317495565c` |
| Full-route cost | `3477.470833450241c` |
| Maximum accounting/reconciliation difference | `4.5474735088646412e-12c` |
| Explicit unresolved competitors | 1,225 |

The selected policy is proper, flow is conserved, terminal absorption is complete within tolerance, and acquisition plus downstream cost reconciles with the full route. Unresolved competitors remain explicit; selected-policy validity is not presented as proof of global optimality.

## 6. Acquisition, bounds, and pruning truthfulness

The relaxed lower bound evaluates the three four-requirement scenarios and selects a real scenario bound; it does not solve an impossible six-required target. The diagnostic reports `lowerBoundScenarioCount = 3` and `selectedScenarioRequirementCount = 4`.

Acquisition synthesis sees all six relevant modifier identities as independent candidates and produced six self-fracture candidates. Each candidate prepares one fractured modifier, then hands the unchanged complete target—including all required and acceptable branches—to downstream optimization. Search prioritization scores required completion plus the single acceptable dimension; terminal/pruning decisions still use authoritative `satisfiesTarget` semantics.

No mechanics probabilities, action legality, sale value, or market-fractured ranking changed.

## 7. UI, sharing, craft plan, and Constellation

Before Phase 3G, the editor and result surfaces showed only one flat required list, and alternatives disappeared at request/share/report boundaries. After Phase 3G:

- the editor has separate `Must have all` and opt-in `Acceptable fourth modifier` sections;
- at least two branches are required when creating a new alternative group, while a decoded historical single branch remains round-trippable until edited;
- duplicates across required and acceptable roles are blocked;
- result headers, shopping lists, copied guides, share URLs, exports, bug reports, reload/replay, and empty/error states preserve the same grouping;
- the real browser round trip retained 3 required and 3 acceptable selections through the Worker and a 4,959-character share hash;
- required-only frontier states remain nonterminal and exact terminal states render `Required 3/3` plus `Alternative 1/1`;
- Constellation technical evidence exposes acceptable branches, matched alternative IDs, and satisfied branch indices without changing PolicyFlow topology, probabilities, occupancy, cost, or manual layout behavior.

The browser gate observed two required-only frontier nodes, three rendered terminal cases, and matched-alternative evidence. Shopping-list clipboard and JSON export/share reload retained the canonical grouped target.

## 8. Phase 3F and earlier retention

Preparation evidence remains explicitly `ACQUISITION / PREPARATION`; it carries only the acquisition target and never fabricates acceptable final-target progress. Downstream evidence remains `DOWNSTREAM / FINAL` and separately partitions required and acceptable progress.

The retained Phase 3F craft-plan gate passed. Real Magic Promote cohorts remain Alter/Augment/Regal only, and valid Rare Exalt-vs-Scour finishing contrasts remain present. The Phase 3F node/edge detail overlay gate also passed, preserving technical-overlay interaction. Phase 3E manual layout, Phase 3D budget/handoff, Phase 3C SCC/policy behavior, and Phase 3B fractured-Magic behavior all passed their retained RELEASE gates.

For required-only targets, Phase 3F wording and frozen Phase 2Z PolicyFlow bytes remain unchanged. The structured Phase 3G fields are emitted only when alternatives exist.

## 9. Quality Lab and validation

| Check | Result |
|---|---|
| `npm run build` | PASS; TypeScript and Vite production build |
| `npm run lint` | PASS |
| `npm run lab:typecheck` | PASS |
| `git diff --check` | PASS; only repository LF/CRLF notices |
| Focused Phase 3G domain/solver gate | PASS; 28.788s in the final focused run |
| Focused Phase 3G real browser/Worker/share gate | PASS; 29.703s after the final compatibility repair |
| Focused Phase 3F craft-plan gate | PASS; 24.833s |
| Focused Phase 3F overlay gate | PASS; 3.883s |
| Focused required-only scope/PolicyFlow retention | PASS 2/2; 9.473s |
| DEV final clean run | PASS 11/11; 192.257s wall, 188.480s summed gate time |
| RELEASE final clean run | PASS 21/21; 354.593s wall, 350.651s summed gate time |

The impact mapper recommended `accessibility`, `constellation`, `handoff`, `objectives`, `proof`, `responsive`, `share-export`, `visual`, and `worker`. The exact focused gates plus the complete DEV and RELEASE profiles covered those non-EXTENDED recommendations. Raw broad tag commands were not redundantly run because some tags also select manual long-soak/EXTENDED gates that the plan excludes.

Implementation-stage validation found and repaired four integration issues:

1. the browser harness inspected raw JSON with an over-broad text expression and used a nested helper that Playwright could not serialize; both checks were made structural/in-page;
2. new final-progress wording disturbed Phase 3F required-only evidence, so structured wording is conditional on alternatives;
3. additive structured PolicyFlow fields and keys disturbed the frozen required-only differential, so legacy targets retain byte-stable serialization while alternative targets carry the new evidence;
4. the first RELEASE exposed a Phase 3D HOST_RESERVE A/B regression. Repeated hot-path canonicalization in `getAllTargetModRequirements` consumed core search budget and allowed optional family comparison to change the discovered incumbent. Canonicalization remains at the service boundary, restoring budget isolation without weakening target identity. The exact failed gate passed after repair, followed by the clean final RELEASE above.

The initial DEV and RELEASE findings were implementation regressions, not unrelated baseline failures. There were no remaining baseline failures on final source.

No unit tests were added or run. EXTENDED, nightly, long-soak, the legacy 115-gate suite, and the legacy release matrix were not run.

## 10. Preservation and self-review

- Existing `acceptableAnyOf` semantics are reused; there is no parallel optional-target model.
- OR alternatives remain branches and are never flattened into simultaneous required modifiers.
- Required and acceptable progress are structurally separate in solver and explanation evidence.
- Canonical item/state identity and policy equivalence are unchanged.
- PolicyFlow probabilities, occupancy, recovery destinations, route costs, proof status, and fingerprints reflect the selected policy truth.
- Phase 3B mechanics probabilities and executable self-fracture behavior are unchanged.
- Phase 3C admissibility/layout, Phase 3D route evidence/budget isolation, Phase 3E manual layout, and Phase 3F authoritative evidence/overlay interaction are retained.
- There are no hardcoded craft winners, Craft-specific production branches, fabricated evidence, or market-fractured ranking.

Self-review additionally verified that disabled alternatives are omitted rather than serialized as an empty semantic feature; canonical branch order cannot cause cache/share divergence; a state satisfying multiple branches is terminal once; target-order explanations use required IDs only; and preparation-stage rules cannot claim final acceptable progress.

## 11. Evidence index

- `quality-lab/src/phase3gDiagnostics.ts`
- `quality-lab/fixtures/fixtureCorpus.json`
- `quality-lab/reports/phase3a-dev-gate.json`
- `quality-lab/reports/phase3a-release-gate.json`
- `quality-lab/reports/phase3a-release-summary.md`
- RELEASE artifact `phase3g-alternative-export.json`

## 12. Commit, push, and deployment

- Implementation/evidence/report commit: `b93ffb8c4e476216cde9b959414e166b5884a3ef` (`feat: support acceptable alternative modifier targets`).
- Push: `e738e689616e3db8d58d0e118d0e201ea3d03a36..b93ffb8c4e476216cde9b959414e166b5884a3ef` to `origin/main`.
- GitHub Pages workflow: `33220431765`, `Deploy to GitHub Pages`, successful; validate/build job `99013128437`, deploy job `99013183179`.
- GitHub Pages deployment: `6150157471`, status `success`, environment `github-pages`, status record `17484142505`.
- Verified deployed product SHA: `b93ffb8c4e476216cde9b959414e166b5884a3ef`.
- Live URL: `https://jpitty03.github.io/cluster-jewel-research/`.

Uncached live HTML returned HTTP 200 and referenced `assets/index-DVjG3S9i.js`. That bundle returned HTTP 200, identifies release `3G.1`, and contains the `Must have all` and `Acceptable fourth modifier` UI contracts. The successful GitHub Pages deployment record names the exact product SHA above.

This documentation-only closeout records the already deployed product commit and changes no application behavior or acceptance evidence. Its own commit, workflow/deployment IDs, and final deployed SHA are verified in the final handoff so `main` and Pages also contain this completed report.
