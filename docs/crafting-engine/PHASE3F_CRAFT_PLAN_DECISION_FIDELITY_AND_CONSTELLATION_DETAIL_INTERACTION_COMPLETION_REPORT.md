# Phase 3F Craft-Plan Decision Fidelity and Constellation Detail Interaction Completion Report

Date: 2026-08-27/28 (America/Los_Angeles)

Status: **IMPLEMENTATION COMPLETE / ACCEPTANCE PASS**

Source-of-truth plan: `POST_PHASE3E_FIELD_REVIEW_AND_PHASE3F_CRAFT_PLAN_DECISION_FIDELITY_AND_CONSTELLATION_DETAIL_INTERACTION_PLAN.md`, SHA-256 `1125f98bd0e07f228531fc9799ebcc3b632c745c000ec1879f6c825fb011c292`.

Baseline pulled from `origin/main`: `b5d27a370d22bb9f6d7c775b97a63746a79ef7c9`.

## 1. Outcome

Phase 3F repairs the craft-plan explanation contract at its authoritative source. Every rendered Decision cohort and option now carries reconciled scope, progress, rarity, target definition, exact rule indices, affix shape, source-state identities, selected action, represented-state count, and expected visits.

For the frozen Primordial Bond + Renewal + Rotten Claws self-fracture policy, the Promote cohort is now the real broad Magic acquisition-preparation decision space:

| Action | Exact states | Expected visits |
|---|---:|---:|
| Orb of Alteration | 208 | 323.68085106349275 |
| Orb of Augmentation | 13 | 82.92021276587121 |
| Regal Orb | 1 | 3.9999999999958216 |

Transmute, Exalt, Fracture, Scour, and Reacquire are not members of that cohort. The two valid Rare final-craft Exalt-vs-Scour contrasts remain present.

The Constellation node and edge technical-detail overlays are now graph-gesture exclusion zones. Opening details and selecting text no longer pans, deselects, closes the popup, moves a manually arranged node, changes edge geometry, or changes saved layout bytes.

## 2. Exact root cause and repair boundary

The corruption originated in `synthesisPolicyExplanation()` in `optimizerService.ts`, before grouping or rendering. `AcquisitionPolicyRule` exported the real state key, prose state, action, visits, and cost, but discarded the structured `ItemState`. The service then fabricated the same context for every self-fracture acquisition rule:

```text
rarity = rare
prefixCount = 0
suffixCount = 0
matched targets = []
missing targets = []
prefixes/suffixes = []
```

Two later layers amplified that original corruption:

1. `decisionGroups()` correctly saw those fabricated contexts as identical, merged all eight acquisition actions, then attached the conflict to PROMOTE through phase priority.
2. React rendered a summary and example from the malformed aggregated evidence, producing `rare 0P/0S` and the impossible `no target modifier present; all target modifiers present` sentence.

The repair is therefore multi-layer defensive, but its authoritative fix is at acquisition synthesis export:

- `AcquisitionPolicyRule.context` now contains the exact acquisition/preparation scope, complete preparation target definition, rarity, prefix/suffix counts and affixes, fracture flags, roll data, matched/missing preparation progress, and item flags from the real on-policy state.
- `PolicyExplanationRule` now retains `sourceStateKeys`, `policyScope`, `progressKind`, and the complete `targetModIds` definition. Downstream matched/missing IDs use the same target-requirement identities, so the partition is provable.
- Both self-fracture service paths use the same `synthesisPolicyExplanation()` adapter; the duplicate fabricated mapping was removed.
- `decisionGroups()` uses a generic state-derived comparability key. Acquisition/preparation Magic states may span variable affix shapes and preparation progress, while Normal, Rare, recovery, acquisition finish, and downstream states retain narrower physical cohorts. There are no target names, action winners, or Craft-specific branches in this logic.
- Every group is reconciled before publication. Count, visit, action, source identity, target partition, affix count, and fracture evidence mismatches withhold the group and expose structured diagnostic reasons in `withheldDecisionDetails`.
- The renderer uses an actual indexed `PolicyExplanationRule` for each option example and surfaces the authoritative source-state identities in Advanced details.

The downstream target-order evidence was also explicitly restricted to `DOWNSTREAM / FINAL` rules so preparation progress cannot influence final three-target order wording.

## 3. Before and after evidence

Before Phase 3F, one fabricated `rare 0P/0S` group claimed 227 states and approximately 426.601 visits across Alter, Augment, Transmute, Fracture, Regal, Exalt, Reacquire, and Scour.

After Phase 3F, the Promote group reports:

```text
Acquisition-preparation Magic states with variable affix counts
(prefixes 0/1; suffixes 0/1) at varying preparation progress
(0/1, 1/1) choose different actions based on exact current affixes.
```

Its exact source aggregation is:

```text
Alter:   sum 208 source states; sum 323.68085106349275 visits
Augment: sum  13 source states; sum  82.92021276587121 visits
Regal:   sum   1 source state;  sum   3.9999999999958216 visits
```

The real Regal source rule is policy rule 22:

```text
state: magic: Hale (T3) + Primordial Bond (T1)
scope: ACQUISITION / PREPARATION
rarity: magic
shape: 1 prefix / 1 suffix
prep target: Primordial Bond
prep progress: 1/1
prefix: AfflictionJewelSmallPassivesGrantLife_, tier 3, not fractured
suffix: Primordial Bond, tier 1, not fractured
selected action: regal_orb
```

The rendered browser example resolves the Hale affix to its player-facing modifier text while retaining its exact internal ID and canonical source identity in Advanced details.

No rendered condition can emit both empty-present and empty-missing conclusions. Present and missing clauses are omitted independently when empty, while the explicit target definition and numeric progress remain visible.

## 4. Preparation and final-craft scope

Acquisition examples now say `preparation target: Primordial Bond` and `prep progress: 0/1` or `1/1`. The complete preparation target definition contains one requirement.

Downstream examples say `final targets` and `final progress`; the retained Rare finishing cohorts use all three target requirements and show final progress `2/3` where the exact policy chooses Exalt in some states and Scour in others.

This is presentation evidence only. Acquisition and downstream costs remain separate additive scopes, and the certified PolicyFlow handoff is unchanged.

## 5. Generic controls

`diagnostic:phase3f` passed all required controls:

- F1: frozen self-fracture route remains executable and certified at `1459.7923662160777c` in the direct diagnostic.
- F2/F3: Magic Promote contains exactly Alter/Augment/Regal with the reconciled counts above.
- F4: all 268 explanation rules and all four published decision groups reconcile; zero groups were withheld for the valid fixture.
- F5: two Rare Exalt-vs-Scour finishing groups remain.
- F6: preparation target cardinality is 1; final target cardinality is 3.
- F7: the clean/non-fracture control publishes no fabricated preparation rules.
- F8: the Harvest-capable control enables its registered Harvest mechanic but invents no Harvest policy or plan evidence.

Diagnostic evidence: `quality-lab/reports/evidence/phase3f-craft-plan-decision-fidelity-diagnostic.json`, SHA-256 `5dc1bed9919dba8245ea13b99def55952845b92ac7c3511f47b09ffa19a27951`.

The frozen browser fixture explicitly supplies an empty `marketFracturedPricesChaos` map. This prevents ambient live market-fractured data from entering a fixture whose declared price context contains none. The presentation gate uses the audited 3,334-state Phase 3D core frontier because a faster wall-clock NORMAL run can legitimately discover a different, cheaper clean incumbent. That bounded gate choice is test-only; production ranking and the NORMAL fixture diagnostic are unchanged.

## 6. Constellation interaction repair

The viewport pointer handler now exits before focus, pointer capture, node drag, pan, or deselection whenever the pointer target is inside a marked graph-owned interaction exclusion. Both node and edge detail asides carry that generic marker. Overlay CSS restores text selection and normal touch behavior inherited from the gesture canvas.

The browser gate proved:

- manual node movement of 107.429 graph units;
- live connected-edge rerouting;
- persisted layout bytes before and after overlay interaction;
- Technical modifier details remain open;
- Technical policy evidence remains open;
- real pointer text selection remains active;
- node and edge overlays remain selected during their internal interactions;
- close button, Escape, and real empty-graph click still close as specified;
- Reset Layout restores automatic geometry and removes persistence.

Screenshot: `quality-lab/reports/evidence/phase3f-constellation-detail-overlay-1440x900.png`, SHA-256 `111c3b0f336fff5b8b3fb66769768e06bd91df15523218422be18b64ce27d9dd`.

The Phase 3E manual-layout and Phase 3D scope/Fit All targeted retention gates passed unchanged. RELEASE also retained Phase 3E keyboard, touch, persistence, Reset View/Layout, Route Focus, Replay, Screensaver, and short-replay behavior.

## 7. Browser evidence

The real built-app/Worker craft gate inspects the rendered `How to craft it` section and passed every required assertion:

- Magic Promote heading and acquisition-preparation summary;
- exact Alter/Augment/Regal action set and aggregates;
- real Magic example for every option;
- no `rare 0P/0S` cohort;
- no Transmute, Fracture, Exalt, Scour, or Reacquire in Promote;
- no contradictory target sentence;
- retained final Rare Exalt/Scour contrast;
- all 268 Advanced branches expose one or more authoritative source-state identities.

Screenshot: `quality-lab/reports/evidence/phase3f-craft-plan-decision-details-1440x900.png`, SHA-256 `37cdc28b108bc2050ee73fcda84a4dabad98498a8139bec7ee1cc44281727c31`.

## 8. Validation and runtime

| Check | Result |
|---|---|
| `npm run build` | PASS; TypeScript build and Vite production build |
| `npm run lint` | PASS |
| `npm run lab:typecheck` | PASS |
| `git diff --check` | PASS; only repository LF/CRLF notices |
| `npm run diagnostic:phase3f` | PASS F1-F8 |
| Focused craft-plan gate | PASS 1/1; 24.735s in the final focused run |
| Focused overlay gate | PASS 1/1; 4.100s |
| Phase 3D/3E targeted retention | PASS 2/2; 20.094s |
| DEV, exactly once after source stabilization | PASS 10/10; 159.815s |
| RELEASE, exactly once after source stabilization | PASS 19/19; 292.723s |
| `diagnostic:phase3b` | PASS; shared analytical/Monte Carlo roll shape retained |
| `diagnostic:phase3c` | PASS C1-C10; 43-node/191-edge large SCC retained |
| `diagnostic:phase3d` | PASS D1-D14; full-route evidence, budget isolation, 23-node handoff retained |
| `diagnostic:phase3e` | PASS E1-E10; manual layout truth/persistence retained |
| `diagnostic:phase3a` | PASS A1-A14 + preservation; DEV/RELEASE evidence accepted |

No unrelated baseline failures were reproduced on the final unchanged source. Implementation-stage focused runs exposed and repaired browser witness visibility/text-selection issues and the timing-dependent hardcoded-winner gate design before RELEASE. RELEASE itself passed without repair or rerun.

No unit tests were added or run. EXTENDED, nightly, long-soak, the legacy 115-gate suite, and the legacy release matrix were not run.

## 9. Preservation and self-review

- Mechanics probabilities, action legality, Bellman values, and solver transition behavior: unchanged.
- Canonical item/state identity, cache identity, and policy equivalence: unchanged.
- PolicyFlow topology, occupancy, probabilities, fingerprints, recovery destinations, and certified handoff: unchanged.
- Route cost accounting, acquisition/downstream separation, and proof status semantics: unchanged.
- Phase 3B fractured-Magic behavior: retained.
- Phase 3C policy admissibility and semantic large-SCC layout: retained.
- Phase 3D full-route evidence, request budget isolation, and monotone incumbents: retained.
- Phase 3E manual coordinates remain local presentation state only.
- Hardcoded production winners: none.
- Craft-specific production branches: none.
- Market-fractured ranking: absent.

Self-review found and repaired five integration issues before closeout:

1. the earliest malformed context source was the service adapter, not React;
2. matched and missing IDs previously used different identity domains for group requirements;
3. source-state identities needed a JSON-safe DOM representation because canonical keys may contain punctuation;
4. the Constellation viewport's inherited `user-select: none` blocked real technical-text selection even after gesture exclusion;
5. the NORMAL browser winner was timing-dependent, so the focused gate was bounded at the audited state frontier instead of encoding a production winner.

## 10. Evidence index

- `scripts/phase3fDiagnostics.ts`
- `output-phase3f-craft-plan-decision-fidelity-diagnostic.txt`
- `quality-lab/reports/evidence/phase3f-craft-plan-decision-fidelity-diagnostic.json`
- `quality-lab/reports/evidence/phase3f-craft-plan-decision-details-1440x900.png`
- `quality-lab/reports/evidence/phase3f-constellation-detail-overlay-1440x900.png`
- `quality-lab/reports/phase3a-dev-gate.json`
- `quality-lab/reports/phase3a-release-gate.json`
- `quality-lab/reports/evidence/phase3a-quality-lab-diagnostic.json`
- `output-phase3a-quality-lab-execution-efficiency-diagnostic.txt`

## 11. Commit, push, and deployment

- Implementation/evidence/report commit: `c1f6a41c250320c89949d41b5e3352810396efca` (`feat: repair craft plan decision evidence`).
- Push: `b5d27a370d22bb9f6d7c775b97a63746a79ef7c9..c1f6a41c250320c89949d41b5e3352810396efca` to `origin/main`.
- GitHub Pages workflow: `33148676583`, `Deploy to GitHub Pages`, successful; validate/build job `98775366355`, deploy job `98775434036`.
- GitHub Pages deployment: `6136857278`, status `success`, environment `github-pages`, status record `17448337524`.
- Verified deployed product SHA: `c1f6a41c250320c89949d41b5e3352810396efca`.
- Live URL: `https://jpitty03.github.io/cluster-jewel-research/`.

Uncached live HTML returned HTTP 200 and referenced `assets/index-CLSfhv0V.js`; that bundle returned HTTP 200 and contains both `Source state identities` and the Constellation interaction-exclusion marker. The published `assets/index-DcmK7a3E.css` returned HTTP 200 and contains the overlay `user-select:text` rule.

This documentation-only closeout records the already deployed product commit and changes no product behavior or acceptance evidence. Its own push/deployment is verified in the final handoff so `main` and Pages also contain this completed report.
