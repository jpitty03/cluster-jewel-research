# Phase 3J Strict Player Craft Instructions, Junk Grouping, and Visible Constellation Completion Report

Date: 2026-08-29 (America/Los_Angeles)

Status: **IMPLEMENTATION COMPLETE / ACCEPTANCE CLOSED**

Source-of-truth plan: `POST_PHASE3I_FIELD_REVIEW_AND_PHASE3J_STRICT_PLAYER_CRAFT_INSTRUCTIONS_JUNK_GROUPING_AND_VISIBLE_CONSTELLATION_PLAN.md`, SHA-256 `499c7fd74439e29dc46df52cf56dcee70f771cd62c2050e9b73988623fcacd63`.

The plan named `b9d76af62d8ee5097d2a2ac41d3cc3863cffafad`; the newer `origin/main` baseline actually pulled was `be6f8cc38ace039671e0b75a2e75ff4df9ce508d`.

Implemented and live-verified product SHA: `086d3c6bedfd4845e3b5bf9dd9251ffdc026421e`.

## 1. Outcome

The normal craft guide is now compiled from authoritative `PolicyExplanationRule` state/action evidence into certified player rules. Every actionable card uses visible `WHEN`, `USE`, and `THEN` commands, instructs one physical action, and directs the player to the correct re-check or state-dependent recovery. A separate certified Finish rule owns the terminal condition.

The compiler classifies every explicit modifier as required target, acceptable target, or junk. Junk is normalized into Safe for this rule, Blocks a missing target, Occupies the last compatible slot, or Fractured junk. Exact junk IDs remain in engine and export evidence and enter the normal guide only when the authoritative policy selects different actions for otherwise indistinguishable player-visible states.

The repeated per-step Decision disclosures have been removed from the rendered guide. Complete Phase 3F evidence now has one owner under Research diagnostics > Advanced policy evidence.

The PolicyFlow Constellation is an always-mounted top-level result after Shopping list and before the four research disclosures. It has no controlled disclosure, native `details`, or `aria-expanded` ancestor. Its PolicyFlow data and all Phase 3E/3F interactions are unchanged.

## 2. Files changed

- `crafting-engine/src/service/craftPlan.ts`: modifier roles, contextual junk taxonomy, structured player-rule compiler, recovery mapping, certification, and Finish rule.
- `crafting-engine/src/service/optimizerService.ts`: supplies authoritative eligible modifier metadata to craft-plan compilation.
- `crafting-engine/src/index.ts`: exports the new presentation-evidence contract.
- `crafting-engine/src/service/shareBundle.ts`: retains craft plan, policy explanation, and exact policy rules in bug-report evidence.
- `src/components/SimpleCraftInstructions.tsx`: strict player guide, target/junk legends, stage groups, recovery branches, and evidence links.
- `src/CraftOptimizer.tsx`: Copy Playbook, consolidated advanced evidence, complete export evidence, four-disclosure result hierarchy, and top-level Constellation.
- `src/optimizerInformationArchitecture.ts`: four research owners plus visible Constellation.
- `src/App.css`: strict-rule cards, advanced evidence, visible graph placement, and responsive layout.
- `quality-lab/src/phase3jDiagnostics.ts`: direct classifier/compiler and negative controls.
- `quality-lab/src/gateRegistry.ts`: Phase 3J direct, Worker, and browser gates.
- `quality-lab/src/gateWorker.ts`: J1-J18 evidence and superseding retained-gate navigation.
- `quality-lab/src/phase3iDiagnostics.ts`: updated four-disclosure/visible-graph contract.
- `docs/crafting-engine/PHASE3J_STRICT_PLAYER_CRAFT_INSTRUCTIONS_JUNK_GROUPING_AND_VISIBLE_CONSTELLATION_COMPLETION_REPORT.md`: this report.

## 3. Authoritative classification and grouping contract

Role classification uses canonical target requirements and eligible modifier metadata:

- `REQUIRED_TARGET`: contributes to `TargetDefinition.requiredMods`;
- `ACCEPTABLE_TARGET`: contributes to an `acceptableAnyOf` branch and is never junk;
- `JUNK`: every other explicit modifier.

Junk classification is state-aware. It uses fracture status, affix side, current rarity capacity, missing required requirements, an unsatisfied acceptable-alternative requirement, and modifier-group overlap. Required and acceptable progress remain separate serialized fields.

Rules group only when policy scope, preparation/final progress, rarity, affix shape, target progress, fracture facts, normalized junk counts/classes, selected action, and recovery signature match. Source rule indices, exact state keys, exact affix IDs/roles, represented-state counts, and expected visits remain attached to each group.

Certification fails closed when evidence is malformed, an action is unknown or invented, a selected positive action is uncovered, a source state is duplicated, actions/recoveries collide without a truthful separator, or coverage/reconciliation fails. The UI then says Simple instructions withheld and directs the reader to technical evidence; it never falls back to vague policy-dependent prose.

## 4. Before and after

Before:

```text
Repeat its recovery loop after misses, and expand Decision details when the exact current affixes matter.
```

After:

```text
WHEN
Final craft · Rare · 2 Prefixes / 2 Suffixes
Missing required target: ...
Safe for this rule: 1 suffix junk modifier
Open compatible target slot: prefix

USE
Exalted Orb

THEN
If the target is complete, stop; otherwise re-check the Rare finishing rules.
A new modifier is not guaranteed to be a target modifier.
```

Acquisition, Transmute, Alter, Augment, Regal, Exalt, Scour, fracture, and reacquisition appear in the frozen selected route only because each has positive source-policy evidence. The direct diagnostic separately proves Annul's three visible result branches and `STATE_DEPENDENT_ANNUL` recovery without inventing Annul in the frozen route.

## 5. Frozen field reconciliation

The selected field route was Self-fracture Primordial Bond at `1459.7923662160777c` full-route expected cost.

The authoritative explanation contained 268 rows: 267 positive actionable source rules plus the non-action menu row. Phase 3J grouped the 267 actionable rows and 572 represented states into 24 player rules. Expected visits reconciled exactly at `740.8471930308734`; canonical full-route accounting differed by only `6.821210263296962e-13c`.

| Action | Certified player rules |
|---|---:|
| Orb of Alteration | 4 |
| Orb of Augmentation | 4 |
| Regal Orb | 3 |
| Exalted Orb | 3 |
| Orb of Annulment | 0 in this selected route; direct positive-evidence control passes |
| Orb of Scouring | 7 |
| Orb of Transmutation | 1 |
| Fracturing Orb | 1 |
| Reacquire selected clean base | 1 |
| Total | 24 |

The retained Phase 3F preparation-Magic cohort remained exact:

| Action | Represented states | Expected visits |
|---|---:|---:|
| Alteration | 208 | 323.68085106349275 |
| Augmentation | 13 | 82.92021276587121 |
| Regal | 1 | 3.9999999999958216 |

All 268 explanation rows retained at least one exact source identity. The retained Rare Exalt-versus-Scour contrast passed.

## 6. Minimal exceptions and recovery

The field compiler produced two minimal exact-name exception pairs. One separates the Rare finishing policy's two Scour-selected unwanted notables from the complementary Exalt-selected safe-junk cohort; the other preserves the analogous field-derived action split without generating a card per state. The algorithm is generic: it first uses semantic target/fracture/slot/junk predicates, then accepts only an exact distinguishing ID shared by a complete action cohort or the exact singleton cover needed by every state in that cohort. Otherwise it withholds the guide.

Recovery evidence observed in the real Worker includes:

- normal random Magic actions -> re-check Magic rules;
- Regal -> check Rare rules;
- Exalt -> finish or re-check Rare rules, with no target guarantee;
- fractured Scour -> resulting fractured Magic state;
- reacquire -> selected clean-base acquisition start;
- Fracturing Orb -> wanted-fracture handoff or wrong-fracture reacquisition;
- direct Annul control -> junk removed, target removed, and other-affix removed branches.

Finish requires all required targets, the acceptable-alternative condition when configured, final rarity, and final-state constraints. Extra junk remains allowed only when the target permits it.

## 7. Copy, export, bug report, and advanced evidence

Copy Playbook now emits, once:

- `TARGETS`, with Required and Acceptable legends;
- the definition of Junk;
- all certified `WHEN`, `USE`, and `THEN` rules;
- rule-specific recovery branches and terminal `STOP WHEN`;
- one `IMPORTANT CAVEATS` section for proof/approximation truth.

The RELEASE browser captured a 7,569-byte playbook, no normal-guide state/visit dump, and byte-identical Shopping-list output before and after evidence navigation.

Export and bug-report summaries retain the full `craftPlan`, `policyExplanation`, `policyRules`, PolicyFlow, accounting, proof, and target evidence. Share/replay remain canonical configuration/graph flows and do not depend on disclosure state.

Advanced policy evidence retains every player's source policy scope, progress kind, rarity/shape, exact rule indices, source-state identities, exact modifier role/junk classification, represented states, expected visits, recovery signature, minimal-exception count, and the Phase 3F comparable Decision cohorts. The normal guide renders zero repeated `craft-plan-decision-details` disclosures.

## 8. Constellation placement and preservation

The browser verified the visible order Recommendation -> How to craft it -> Shopping list -> Markov Policy Constellation -> four research disclosures. The graph container had no disclosure, `details`, or `aria-expanded` ancestor.

Retained evidence passed for semantic large-SCC layout, label-aware Fit All, manual pointer/touch drag, keyboard nudge, live label/edge rerouting, strict layout persistence identity, Reset View, Reset Layout, background pan, Route Focus, replay, Screensaver, node/edge selection, technical overlays, overlay text selection, and responsive geometry. Opening the visible graph or research disclosures emitted no extra Worker request and did not alter handoff or saved graph state.

## 9. J1-J18

| ID | Result | Observed evidence |
|---|---|---|
| J1 | PASS | Six direct affixes classified exactly once across required, acceptable, and junk roles |
| J2 | PASS | Four non-target direct affixes were junk; normal cards expose semantic junk, not exact state dumps |
| J3 | PASS | Safe, blocking, last-slot, and fractured classes all exercised |
| J4 | PASS | 267/267 actionable source rules covered; action/recovery-homogeneous certification |
| J5 | PASS | Same coarse shapes with different actions split by semantic conditions or exception |
| J6 | PASS | 572 states compressed to 24 cards; two field exceptions; ambiguous control withheld |
| J7 | PASS | All 24 field cards visibly contain `WHEN`, `USE`, and `THEN`; vague phrases absent |
| J8 | PASS | Eight field action IDs plus Finish have positive evidence; Annul direct positive control passes |
| J9 | PASS | Annul, fractured Scour, fracture handoff, and reacquisition mappings verified |
| J10 | PASS | Required/acceptable fields remain separate; acceptable modifier never classified junk |
| J11 | PASS | Deliberately overlapping Exalt/Scour input produced `WITHHELD` and zero rules |
| J12 | PASS | 7,569-byte certified playbook; caveats once; Shopping list unchanged |
| J13 | PASS | Exact craft plan, explanation, policy rules, state identities, and PolicyFlow retained in evidence |
| J14 | PASS | One advanced owner; 268 exact explanation rows; zero inline Decision disclosures |
| J15 | PASS | Initially visible/mounted graph; excluded disclosure/native/ARIA ancestry |
| J16 | PASS | All retained manual layout, selection, routing, replay, reset, Fit, and overlay gates green |
| J17 | PASS | Document/body widths exactly 1440, 390, and 420 at matching viewports |
| J18 | PASS | Retained Phase 3B-3I, handoff, alternatives, evidence, graph, share/export, and budget gates green |

## 10. Validation and runtimes

| Validation | Result |
|---|---|
| `npm run build` | PASS; Vite build 0.398s; only existing native-loader/chunk advisories |
| `npm run lint` | PASS, zero warnings |
| App TypeScript/static check | PASS |
| `npm run lab:typecheck` | PASS |
| `git diff --check` | PASS; only Git line-ending notices |
| Impact recommendation | proof + Worker smoke, DEV, RELEASE |
| Phase 3J direct | PASS; RELEASE 0.053s |
| Phase 3J Worker | PASS; RELEASE 18.956s |
| Phase 3J browser | PASS; RELEASE 37.002s |
| Focused retained batch | Final closure 8/8; prior Phase 3F moved-locator failure closed at 20.899s |
| DEV, exactly once | PASS 15/15; 202.766s wall; 198.885s summed |
| RELEASE, exactly once | PASS 28/28; 554.871s wall; 550.840s summed |
| RELEASE runtime errors | console 0; page 0; network 0 |

Development diagnostics first exposed an uncertified coarse condition where Fracture/Scour and Rare Exalt/Scour shared presentation shape. Fractured-target facts and the generic minimal-exception contract closed that finding. Browser development also corrected one transpiled inner helper in the harness, one ambiguous copy-button locator, and the retained Phase 3F locator after evidence consolidation. No RELEASE retry was needed.

No unit tests were added or run. EXTENDED, nightly, long-soak, the legacy 115-gate suite, and legacy release matrices were explicitly not run. No implementation finding justified them.

## 11. Preservation and self-review

- No mechanics probability, action legality, policy selection, ranking, PolicyFlow topology, state identity, target identity, or market-fractured ranking code changed.
- `TargetDefinition.acceptableAnyOf` remains the only acceptable-alternative model.
- Phase 3B roll shape and executable self-fracture mechanics remain green.
- Phase 3F authoritative cohorts/examples and Rare contrasts remain green.
- Phase 3H one-way handoff detachment and sale-value ownership remain green.
- Phase 3I import-first setup, compact search, responsive behavior, and four-disclosure research hierarchy remain green.
- Unequal-work `HOST_RESERVE` remained a host-timed observation; deterministic compare-methods false/true snapshots stayed identical at 2,000 expanded / 4,500 retained / `STATE_CAP`.
- Production code contains no named field fixture, hardcoded action winner, Craft-specific grouping branch, UI string-derived policy decision, or weakened identity.
- Generated Quality Lab reports/artifacts remained ignored and uncommitted.

## 12. Commit, workflow, and deployment

- Implementation commit: `086d3c6bedfd4845e3b5bf9dd9251ffdc026421e` (`feat: implement Phase 3J certified craft instructions`).
- Push: `be6f8cc38ace039671e0b75a2e75ff4df9ce508d..086d3c6bedfd4845e3b5bf9dd9251ffdc026421e` to `origin/main`.
- GitHub Pages workflow: `33276462905`, successful.
- Validate/build job: `99163933591`, successful in 19s.
- Deploy job: `99163974386`, successful in 8s.
- GitHub Pages deployment: `6160369279`, environment `github-pages`.
- Successful deployment status: `17509644419`.
- Live URL: `https://jpitty03.github.io/cluster-jewel-research/`.
- Verified deployed product SHA: `086d3c6bedfd4845e3b5bf9dd9251ffdc026421e`.

Uncached product verification returned HTTP 200 for 479-byte HTML referencing `assets/index-Cghm5Yi1.js`; the uncached 6,224,032-byte bundle also returned HTTP 200. It contained release `3J.1`, the strict guide orientation, Advanced policy evidence, and `constellation-top-level`, and did not contain the removed `strategy-visualization-disclosure` test ID.

This documentation-only closeout records the already deployed product commit and changes no application or acceptance behavior. Its exact closeout commit/workflow/deployment IDs and final Pages SHA are verified in the final handoff.
