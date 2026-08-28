# Post-Phase 3F Field Review and Phase 3G Plan

## Exact Required Modifiers Plus Any-One-of Equal Alternatives

Status: **READY FOR IMPLEMENTATION**

Baseline reviewed: `96230c20ec1a67a9ed46b61e4bb4ecec322b5bf1` on `main`.

Phase 3F is **CLOSED / PASS / DEPLOYED**. Its authoritative craft-plan evidence, preparation-versus-final progress separation, PolicyFlow/Constellation behavior, manual layout persistence, and technical-overlay interaction rules are permanent preservation requirements.

The current `main` also contains the newer tiered Quality Lab harness. Phase 3G must use that gate registry and DEV/RELEASE workflow. Do not revive the historical serialized release loop as the normal acceptance path.

No unit tests are to be added or run. Add focused diagnostics and real-browser Quality Lab gates instead. EXTENDED, nightly, long-soak, and the legacy release matrix remain explicit/manual-only unless an implementation finding independently justifies them.

---

# 1. Field Request

The first Phase 3G field craft is:

```text
Base:           Large Cluster Jewel
Cluster type:   10% increased Spell Damage
Item level:     84
Passives:       12
Final rarity:   Rare
Extra affixes:  Allowed

Must have all three:
  Added Small Passive Skills also grant: +(10-12) to Maximum Energy Shield (T1)
  Added Small Passive Skills also grant: +(6-8) to Intelligence (T1)
  Added Small Passive Skills have 35% increased Effect (T1)

Must also have any one of:
  Added Small Passive Skills also grant: +4 to All Attributes (T1)
  Added Small Passive Skills also grant: +(6-8) to Strength (T1)
  Added Small Passive Skills also grant: 3% increased Cast Speed (T1)
```

The three alternatives are equally acceptable. They do not have ranks, weights, separate sale values, or tie-breaking preference.

The authoritative completion rule is:

```text
all required modifiers are present
AND
at least one acceptable alternative is present
AND
the requested rarity/final-state constraints are satisfied
```

Extra affixes remain allowed. An item containing two or three acceptable alternatives is still one successful terminal item; it is not counted two or three times.

## 1.1 Truth table

| Item state | Terminal success |
|---|---:|
| All three required modifiers; no alternative | No |
| All three required modifiers + All Attributes | Yes |
| All three required modifiers + Strength | Yes |
| All three required modifiers + Cast Speed | Yes |
| All three required modifiers + two or three alternatives | Yes, once |
| Any required modifier missing, even with an alternative | No |
| All targets present but final rarity/shape constraint fails | No |

This fixture needs two required prefixes (Energy Shield and Increased Effect), one required suffix (Intelligence), and one acceptable suffix. Its minimum successful shape is therefore `Rare 2P/2S`.

---

# 2. Current-Code Finding: Reuse the Existing Domain Contract

Do **not** create a parallel `alternativeGroups`, `optionalModIds`, or custom solver-only target model.

`crafting-engine/src/domain/TargetDefinition.ts` already defines:

```ts
export interface TargetDefinition {
  requiredMods: ModRequirement[];
  requiredRarity?: ItemRarity;
  outcomeBranches?: TargetOutcomeBranch[];
  acceptableAnyOf?: ModRequirement[][];
  finalRollRequirements?: RollRequirement[];
  finalStateConstraints?: FinalStateConstraints;
  saleValueChaos?: number;
}
```

The existing semantics are suitable:

- every `requiredMods` entry must match;
- each inner `acceptableAnyOf` array is an AND branch;
- the outer `acceptableAnyOf` array is OR;
- at least one branch must match;
- `getAllTargetModRequirements()` already flattens the alternatives for discovery and identity work;
- `satisfiesTarget()` already checks the alternative branches;
- `targetFeasibility.ts` and `relaxedTargetProgressLowerBound.ts` already enumerate alternative scenarios;
- `externalParity.ts` and the retained historical Phase 1 test demonstrate an existing any-one-of use case.

Encode this field request as three one-requirement branches:

```ts
target: {
  requiredRarity: 'rare',
  requiredMods: [
    { modId: ENERGY_SHIELD_T1_ID },
    { modId: INTELLIGENCE_T1_ID },
    { modId: INCREASED_EFFECT_T1_ID },
  ],
  acceptableAnyOf: [
    [{ modId: ALL_ATTRIBUTES_T1_ID }],
    [{ modId: STRENGTH_T1_ID }],
    [{ modId: CAST_SPEED_T1_ID }],
  ],
}
```

Resolve the exact IDs through the existing eligible-modifier catalog for the selected base, cluster type, and item level. Do not hardcode player-facing text as solver identity, and fail if a display name is absent or ambiguous.

Phase 3G is therefore primarily an end-to-end integration and proof phase, not a new solver-feature rewrite.

---

# 3. Phase Scope

## 3.1 In scope

Phase 3G supports one player-facing group with these semantics:

```text
Require all selected exact modifiers
plus any one selected exact acceptable alternative
```

The first UI may expose only one-requirement branches, because that exactly satisfies the field request. The engine's existing multi-requirement branch capability must remain intact.

Phase 3G includes:

- target-editor UI;
- request construction and validation;
- canonical target identity and cache/session separation;
- Worker/service serialization;
- terminal-state and solver audit;
- acquisition and lower-bound audit;
- craft-plan explanation fidelity;
- PolicyFlow and Constellation progress fidelity;
- share URL, bug-report, persistence, and replay compatibility;
- Quality Lab diagnostics and real-browser acceptance.

## 3.2 Out of scope

- ranked alternatives;
- alternative-specific sale values;
- weighting one alternative over another;
- requiring two of three alternatives;
- multiple independent `AND-of-OR` groups;
- automatic trade-price ranking of alternatives;
- changes to modifier weights or crafting probabilities;
- new crafting actions or action legality;
- redesigning `outcomeBranches`;
- Cluster Jewels automatically inventing alternatives during handoff;
- changing the Phase 3F acquisition-policy explanation cohort rules;
- unit-test work.

If future requirements need `two of N` or multiple independent groups, introduce a separate reviewed domain change later. Do not over-generalize Phase 3G and risk changing established solver semantics.

---

# 4. Authoritative Target Semantics and Canonicalization

Add or formalize shared helpers around the existing target shape. UI, validation, services, solver evidence, and renderers must not independently reinterpret `acceptableAnyOf`.

At minimum, centralize:

```text
canonical required requirements
canonical alternative branches
all target-relevant requirements
required-progress evaluation
acceptable-alternative progress evaluation
full terminal satisfaction
minimum feasible scenario shape
stable target fingerprint material
```

Canonicalization rules:

1. sort requirements inside each branch by the existing `ModRequirement` identity;
2. sort branches by their canonical requirement identities;
3. remove exact duplicate requirements within a branch;
4. reject duplicate branches;
5. reject an alternative identical to a base required modifier;
6. preserve branch boundaries in fingerprints and serialized data;
7. never treat input selection order as a different target;
8. never flatten alternatives into six simultaneously required modifiers.

For this UI scope, every acceptable branch contains exactly one exact `modId`. Keep the domain representation general; enforce the Phase 3G UI shape at the UI/validation boundary.

---

# 5. Validation and Feasibility

Extend `crafting-engine/src/service/optimizerValidation.ts` to validate both the required set and the alternatives.

## 5.1 Exact eligibility

Every required and alternative modifier must:

- have an exact `modId`;
- exist in the catalog;
- be eligible for the base, cluster type, and item level;
- satisfy the selected tier through the exact ID rather than display-text inference.

Validation errors must identify whether the defect is in `target.requiredMods` or `target.acceptableAnyOf`.

## 5.2 Duplicate and overlap rules

Reject:

- duplicate required IDs;
- duplicate alternative IDs/branches;
- the same ID appearing in both required and alternative sets;
- empty branches;
- an enabled alternative group with no valid alternatives.

## 5.3 Exclusion groups and slot capacity must be scenario-aware

Required modifiers must coexist with one another.

Each alternative must be checked against the complete required set. An alternative that conflicts with a required modifier cannot be a valid success branch.

Do **not** require alternatives to coexist with one another. All Attributes, Strength, and Cast Speed are competing OR outcomes; an exclusion conflict between two alternatives is not automatically a target error if each can independently coexist with the required set.

Likewise, prefix/suffix capacity must be checked per scenario:

```text
required modifiers + All Attributes
required modifiers + Strength
required modifiers + Cast Speed
```

Do not count the union of all six candidates as required affix occupancy.

## 5.4 Rarity normalization

The current UI derives automatic Rare selection from `requiredMods.length >= 3`. Replace any count-only shortcut with scenario-aware minimum rarity derived from the easiest valid completion branch.

For this fixture, every valid scenario contains four explicit modifiers, so Rare is required.

The normalized rarity decision must remain deterministic and must agree with `deriveMinimumFeasibleRarity()`.

---

# 6. Optimizer UI

Update `src/CraftOptimizer.tsx` without merging alternatives into the current `Desired exact modifiers` list.

Use two visibly separate sections:

```text
Required modifiers
All of these must be present.

Acceptable fourth modifier
At least one of these must be present.
```

Recommended interaction:

1. retain the existing required-modifier rows;
2. add an explicit `Require one acceptable alternative` control;
3. when enabled, show independently removable alternative rows;
4. use the existing `SearchableModifierSelect` and eligible catalog;
5. disable IDs already selected anywhere else in the target;
6. require at least two alternatives for the player-facing OR group, while allowing the implementation to preserve a decoded historical single-branch payload;
7. show inline validation without starting the Worker;
8. reset stale results whenever required or alternative selection changes.

The request summary must render:

```text
Final rarity: Rare
Extra affixes: Allowed

Must have all:
  [three required modifiers]

And at least one:
  [three acceptable alternatives]
```

Do not label all six as `Desired exact modifiers (6/...)`. Do not imply that all three alternatives must appear.

The result header, shopping list, copied craft guide, bug-report summary, and empty/error states must preserve the same grouping.

---

# 7. Input, Handoff, Share, and Replay Contracts

## 7.1 Browser request construction

Build one-requirement branches from the selected alternative IDs:

```ts
acceptableAnyOf: selectedAlternativeIds.length > 0
  ? selectedAlternativeIds.map((modId) => [{ modId }])
  : undefined
```

Omit the field when the feature is disabled so legacy target identity remains stable where possible.

## 7.2 Cluster Jewels handoff

`OptimizerSeed.targetModIds` remains the required-modifier handoff for current Cluster Jewels combinations. Phase 3G must not infer alternatives from trade combinations.

When a seed is applied:

- populate required modifiers from `targetModIds`;
- initialize alternatives as disabled/empty;
- treat adding alternatives as a deliberate optimizer target change;
- retain source market information as context only under the existing identity-warning contract.

If a future handoff needs alternatives, extend `OptimizerSeed` in a later explicit phase.

## 7.3 Share payload

Bump the share payload version and serialize canonical alternative branches. Decode all currently supported versions by defaulting missing alternatives to `undefined`.

The share round trip must preserve:

- exact required IDs;
- exact alternative branch boundaries;
- selected rarity and final-state constraints;
- objective and budget configuration;
- source context;
- stable canonical ordering.

The bug-report bundle must include the same target shape.

## 7.4 Cache, request, policy, and replay identity

Audit every fingerprint, cache key, continuation-session key, source-policy fingerprint, frozen fixture identity, and replay identity that currently derives from `requiredMods` or `targetModIds`.

Two requests that differ only by their acceptable alternatives must not share a stale result or continuation session.

Two semantically identical requests with alternatives selected in a different order should canonicalize to the same target identity.

---

# 8. Solver and Probability Audit

The expected terminal predicate already exists. Preserve it and prove that every solver path uses it.

Audit at least:

- `crafting-engine/src/domain/TargetDefinition.ts`;
- `crafting-engine/src/solver/genericSearch.ts`;
- `crafting-engine/src/solver/policyEngine.ts`;
- `crafting-engine/src/solver/expectedCost.ts`;
- `crafting-engine/src/solver/targetFeasibility.ts`;
- `crafting-engine/src/solver/relaxedTargetProgressLowerBound.ts`;
- `crafting-engine/src/solver/acquisitionSynthesis.ts`;
- action/mechanic code that uses target requirements for transition pruning or weighting.

Replace any local assumption equivalent to:

```text
terminal == every targetModId is present
```

with the authoritative target helpers.

## 8.1 Union probability

The success probability is the probability of the union:

```text
P(All Attributes OR Strength OR Cast Speed)
```

It is not blindly the sum of three independent probabilities. Exact transition outcomes and canonical states must determine the union, so an outcome containing multiple acceptable alternatives contributes once.

## 8.2 Search-state relevance

All three alternatives are target-relevant and must remain distinguishable wherever target relevance affects:

- state expansion priority;
- lower bounds;
- pruning/dominance;
- acquisition candidate generation;
- terminal-state discovery;
- progress summaries.

Do not weaken canonical physical-state identity. Exact affixes remain authoritative.

## 8.3 Lower bounds and proof status

`relaxedTargetProgressLowerBound.ts` already evaluates alternative scenarios. Prove that it selects an optimistic scenario without conflating the alternatives into simultaneous requirements.

Any unresolved branch or creator action must preserve the existing proof-honest `provisional/not proven` semantics. Supporting alternatives must not turn an unresolved route into a false global-optimality claim.

## 8.4 Acquisition synthesis

`getAllTargetModRequirements()` exposes all alternatives to acquisition discovery. Audit whether self-fracture and physical-acquisition candidate generation should consider an acceptable alternative as the fractured/prepared modifier.

Valid alternatives may produce valid acquisition candidates, but no specialized route may assume an alternative is mandatory across every success scenario. Keep acquisition preparation scope distinct from final target scope.

---

# 9. Phase 3F Explanation Fidelity Extension

This is the highest-risk presentation area.

Phase 3F currently carries a flat `targetModIds`, `matchedTargetModIds`, and `unmatchedTargetModIds` contract in explanation contexts. Flattening this Phase 3G target would incorrectly imply:

```text
final progress: 4/6
missing: the two alternatives that were not selected by the roll
```

That is false. The correct progress is:

```text
Required progress: 3/3
Acceptable alternative: 1/1 - Strength
Final target: complete
```

Extend the authoritative explanation context before grouping/rendering. The exact schema is implementation-defined, but it must preserve:

```text
required target definition
acceptable branch definition
matched/missing required IDs
whether any acceptable branch is satisfied
which acceptable branch(es)/modifier(s) matched
preparation vs final progress kind
```

Keep any legacy flat ID field only as a technical all-relevant-mod list; do not use its length as the player-facing completion denominator.

Every Decision cohort and example must reconcile against the same structured target definition. If evidence cannot reconcile, withhold the group and expose a structured diagnostic reason under the existing fail-closed contract.

Preserve all Phase 3F behaviors:

- Promote contains only comparable real Magic Alter/Augment/Regal states;
- preparation progress remains separate from final progress;
- the Hale + Primordial Bond Regal example remains authoritative;
- Rare Exalt-vs-Scour finishing contrasts remain available when state-comparable;
- no Craft-specific display filter;
- no fabricated rarity/affix/progress context;
- examples remain traceable to exact source-state identities.

---

# 10. PolicyFlow and Constellation

Extend PolicyFlow/Visualization progress data so the graph can represent both dimensions without changing physical node identity:

```text
Required 2/3; acceptable alternative 1/1
Required 3/3; acceptable alternative 0/1
Required 3/3; acceptable alternative 1/1 - Cast Speed
```

A final terminal node must require both dimensions.

Do not derive the denominator from a flattened list of all candidate IDs. Do not mark unused alternatives as missing after another branch is satisfied.

Audit:

- `crafting-engine/src/domain/PolicyFlow.ts`;
- `crafting-engine/src/domain/VisualizationGraph.ts`;
- `src/components/MarkovConstellation.tsx`;
- exact-flow fingerprints and frozen fixture metadata;
- node technical details and target-text resolution.

Preserve:

- exact selected-policy topology and flow reconciliation;
- acquisition/downstream handoff semantics;
- Phase 3C SCC layout behavior;
- Phase 3D full-route evidence and budget isolation;
- Phase 3E drag, reroute, persistence, replay, Fit All/Route Focus, and reset behavior;
- Phase 3F overlay gesture exclusion and text selection.

Manual layout persistence must continue to key from policy/topology/node identity. If the target shape legitimately changes the policy fingerprint, a prior layout must not be silently applied to a different graph.

---

# 11. Focused Phase 3G Diagnostics

Register focused Phase 3G diagnostics/gates in the current Quality Lab architecture. Use deterministic fixture data and exact catalog IDs resolved from the eligible pool.

## G1 - Frozen field target normalization

Prove the field request normalizes to:

```text
3 required exact modifiers
3 one-mod acceptable branches
Rare minimum feasible rarity
minimum successful shape 2P/2S
extra affixes allowed
```

## G2 - Required-only state is not terminal

A state with Energy Shield, Intelligence, and Increased Effect but no acceptable alternative must fail `satisfiesTarget()` and remain non-terminal in the graph.

## G3 - Every alternative independently completes the target

Build one state for each acceptable alternative and prove all three are terminal.

## G4 - Multiple alternatives count once

A state containing two acceptable alternatives must be one terminal state. Transition probability, terminal absorption, expected visits, and outcome distribution must not double-count it.

## G5 - Missing-required control

Each state that has an acceptable alternative but is missing one required modifier must remain non-terminal.

## G6 - Scenario-aware feasibility

Prove required-plus-each-alternative coexistence and slot capacity separately. Prove the validator does not demand that all three OR alternatives coexist.

Include a negative alternative that conflicts with a required modifier and prove validation rejects or removes that branch with an exact explanation.

## G7 - MDP/Bellman reconciliation

For a bounded deterministic field fixture, prove:

- probability rows reconcile;
- on-policy terminal absorption reconciles;
- the policy is proper when reported proper;
- Bellman/value/occupancy convergence retains existing tolerances;
- expected cost and expected action usage reconcile;
- unresolved states remain explicit.

## G8 - Lower-bound and acquisition truthfulness

Prove the relaxed lower bound evaluates alternative scenarios rather than all alternatives simultaneously. Prove acquisition candidates and selected acquisition scope do not silently make every alternative mandatory.

## G9 - Explanation fidelity

Rendered/service evidence must say conceptually:

```text
Required modifiers: 3/3
Acceptable alternative: 1/1 - <matched alternative>
```

Explicitly fail on:

```text
4/6 final progress
the two unrolled alternatives reported as required/missing
required-only state described as complete
preparation progress merged with final progress
```

Retain the Phase 3F Promote and Rare Exalt-vs-Scour evidence controls.

## G10 - UI/Worker/share round trip

Drive the real built application:

- select the three required modifiers;
- enable acceptable alternatives;
- select All Attributes, Strength, and Cast Speed;
- confirm the structured summary;
- optimize through the real Worker;
- inspect the result/craft guide;
- copy and reload the share URL;
- prove the same canonical target reaches the Worker and renderer.

## G11 - PolicyFlow/Constellation progress

Prove terminal nodes require required `3/3` plus alternative `1/1`; non-terminal required-only nodes show `3/3` plus `0/1`. Preserve node/edge overlay interactions and manual-layout bytes.

## G12 - Legacy target preservation

Existing required-only crafts must retain:

- normalized input identity where no alternative field exists;
- selected-policy validity semantics;
- Phase 3F explanation cohorts;
- share decoding for all existing payload versions;
- clean, self-fracture, Harvest, and objective controls;
- DEV/RELEASE gate behavior.

---

# 12. Real-Browser Acceptance

Add focused Quality Lab gates with appropriate `target`, `solver`, `worker`, `share`, `craft-plan`, and `constellation` tags.

The gate must use the actual built app and Worker, not a React-only mock or a hand-built result object.

Required rendered assertions:

```text
Required modifiers section contains exactly three selected entries
Acceptable alternative section contains exactly three selected entries
Summary says all three required plus any one acceptable alternative
Final rarity is Rare
Extra affixes are Allowed
No summary says six required modifiers
No target progress uses 4/6
Required-only state is not presented as final success
Matched alternative is named in final progress/evidence
Share reload restores the same grouping
Craft guide and shopping list preserve the grouping
```

Use a focused browser run during development. Do not repeatedly run RELEASE.

---

# 13. Implementation Order

Use this dependency order:

1. inventory all `requiredMods`, `targetModIds`, target-count, target-progress, terminal, fingerprint, and share-version assumptions;
2. formalize canonical alternative helpers around existing `acceptableAnyOf`;
3. extend validation and scenario-aware feasibility;
4. extend request/share/bug-report/persistence identities;
5. add the UI editor and structured summary;
6. audit terminal, lower-bound, pruning, acquisition, and probability paths;
7. extend authoritative explanation and PolicyFlow progress contracts;
8. update craft guide, shopping list, Constellation, and technical details;
9. add Phase 3G diagnostic and browser gates;
10. run focused validation, then DEV once, then RELEASE once after source stabilizes;
11. write the Phase 3G completion report and verify the deployed SHA.

Do not begin by adding a UI-only list. A UI patch that flattens the alternatives into `requiredMods` will produce the wrong terminal condition and corrupt Phase 3F evidence.

---

# 14. Validation Sequence

After implementation stabilizes:

1. `npm run build`
2. `npm run lint`
3. `npm run lab:typecheck`
4. `git diff --check`
5. run the focused Phase 3G domain/solver gate
6. run the focused Phase 3G real Worker/browser/share gate
7. run the focused craft-plan/Constellation retention gates
8. `npm run -- lab:recommend -- --base <baseline> --head HEAD`
9. run any additional exact gates/tags recommended by the impact mapper
10. `npm run lab:dev` once after source stabilization
11. `npm run lab:release` once after DEV passes
12. verify the GitHub Pages workflow and deployed product SHA

If RELEASE fails, rerun only the failing gate or shard while repairing it. After the repair stabilizes, run one final RELEASE.

Do not run `npm test`. Do not run EXTENDED, nightly, long-soak, or the legacy release suite unless an independent implementation finding requires them.

---

# 15. Completion Report

Write:

`docs/crafting-engine/PHASE3G_ACCEPTABLE_ALTERNATIVE_MODIFIER_TARGETS_COMPLETION_REPORT.md`

It must include:

- exact field target and resolved modifier IDs;
- confirmation that existing `acceptableAnyOf` was reused;
- exact root cause of every missing integration point;
- canonicalization and scenario-aware validation evidence;
- truth-table results for all three alternatives;
- union/no-double-count probability evidence;
- Bellman, terminal absorption, occupancy, and cost reconciliation;
- acquisition and lower-bound truthfulness;
- before/after UI, craft-plan, share, and Constellation evidence;
- proof that Phase 3F preparation/final progress remains distinct;
- Phase 3F Promote and Rare Exalt-vs-Scour retention;
- DEV/RELEASE counts and wall times;
- unrelated baseline failures reproduced without source changes, if any;
- implementation commit, documentation closeout commit, workflow/deployment IDs, and deployed SHA.

---

# 16. Permanent Invariants

Phase 3G must preserve:

- no unit-test work;
- no hardcoded route winner;
- no Craft-specific solver or renderer branch;
- no player-facing text used as canonical modifier identity;
- no mechanics probability changes without separate evidence;
- no action-legality changes;
- no weakened canonical state identity;
- no flattening OR alternatives into simultaneous required modifiers;
- no double-counting terminal outcomes containing multiple alternatives;
- no fabricated target progress, action evidence, prices, or sale values;
- alternatives remain equally acceptable;
- selected-policy validity remains distinct from global optimality;
- unresolved competitors and proof gaps remain explicit;
- acquisition preparation remains separate from downstream final crafting;
- Phase 3B fractured-Magic behavior remains intact;
- Phase 3C policy admissibility and SCC layout remain intact;
- Phase 3D full-route evidence and budget isolation remain intact;
- Phase 3E manual Constellation geometry remains presentation-only;
- Phase 3F authoritative explanations and overlay exclusions remain intact;
- Quality Lab DEV/RELEASE remains the normal acceptance workflow.

The goal is not merely to accept three more modifier inputs. The goal is for the optimizer, solver proof, acquisition search, explanation layer, graph, share payload, and player-facing craft guide to agree on one exact proposition:

> The item must contain all three required modifiers and at least one of the three equally acceptable alternatives.

---

# 17. Copy-Paste Implementation Prompt

```text
Implement Phase 3G exactly as specified in:

docs/crafting-engine/POST_PHASE3F_FIELD_REVIEW_AND_PHASE3G_ACCEPTABLE_ALTERNATIVE_MODIFIER_TARGETS_PLAN.md

Start from current main and read the Phase 3F plan/completion report plus the current Quality Lab README before editing. Reuse the existing TargetDefinition.acceptableAnyOf semantics; do not introduce a parallel alternative-target model and do not flatten alternatives into requiredMods.

Implement the full end-to-end contract: canonical target helpers, scenario-aware validation, UI selection, Worker input, share/bug-report persistence, cache/fingerprint isolation, terminal/lower-bound/acquisition audit, Phase 3F-compatible structured progress evidence, PolicyFlow/Constellation rendering, and focused Quality Lab gates.

Use the frozen Large Cluster Jewel / 10% increased Spell Damage / ilvl 84 / 12-passive field target in the plan. The three core modifiers are mandatory and any one of All Attributes, Strength, or Cast Speed T1 completes the acceptable alternative requirement. All alternatives are equally acceptable and extra affixes are allowed.

Do not add or run unit tests. Use focused diagnostics/browser gates during development, then build, lint, lab:typecheck, diff check, impact recommendations, DEV once, and RELEASE once after source stabilization. Preserve all Phase 3B-3F contracts. Write the required Phase 3G completion report, commit, push to main, verify GitHub Pages, and do not claim completion until the deployed SHA is verified.
```
