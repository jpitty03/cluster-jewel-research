# Post-Phase 3J Field Review and Replacement Phase 3K Plan

## Guided Player Constellation from Certified Craft Rules

Status: **READY FOR IMPLEMENTATION**

Authoritative baseline: `d289068a7a6cf92a5b6a247edf60341c0f9659cc` on `main`.

Phase 3J product implementation: `086d3c6bedfd4845e3b5bf9dd9251ffdc026421e`.

Phase 3J completion closeout: `d289068a7a6cf92a5b6a247edf60341c0f9659cc`.

Current release marker: `3J.1`.

This is the replacement Phase 3K plan after all later Phase 3K-and-newer work was intentionally reverted. No discarded companion, copied-current-item resolver, or post-3J UI contract is part of the baseline.

Phase 3J remains authoritative for:

- exact selected-policy evidence;
- canonical target and state identity;
- required-versus-acceptable target progress;
- contextual junk classification;
- certified `WHEN -> USE -> THEN` player rules;
- action- and recovery-homogeneous grouping;
- minimal exact-name exceptions;
- full copy/export/bug evidence;
- exact PolicyFlow transitions and reconciliation;
- the Phase 3E technical Markov graph interactions.

Phase 3K changes how that evidence is presented. The visible Constellation becomes the simple, player-facing step-by-step crafting flow. The existing raw Markov topology remains available as technical research evidence, but it is no longer the primary visible Constellation.

No unit tests are to be added or run. Add focused direct, Worker, and real-browser Quality Lab gates. Run DEV exactly once and RELEASE exactly once after focused closure. Do not run EXTENDED, nightly, long-soak, the legacy 115-gate suite, or legacy release matrices unless an independently documented implementation finding requires one.

---

# 0. Non-Negotiable Product Directive

This section is binding.

The player must not be shown a long stack of 24 or more `WHEN -> USE -> THEN` cards as the ordinary crafting guide.

The player must not be shown the raw solver topology as the ordinary Constellation.

The player must not need to understand represented-state counts, expected visits, macro states, occupancy, rule indices, or solver graph structure to follow the craft.

The primary result must contain one always-visible **Crafting Constellation** that answers:

1. where the selected route starts;
2. what currency or action is used at each major stage;
3. what visible result changes the next action;
4. where the craft loops;
5. when recovery means Scour, reacquire, or another certified action;
6. when the item is finished.

The visible flow must group equivalent junk outcomes. It must preserve any junk distinction that changes the selected action or recovery.

The Constellation must be generated from certified Phase 3J player rules and exact PolicyFlow transition evidence. It must not be hardcoded for Martial Prowess, Feed the Fury, Fuel the Fight, self-fracture, or any particular fixture.

The browser must not infer policy decisions from prose. React must not become a policy engine.

The implementation must not reintroduce the discarded post-3J current-item companion, paste parser, manual item editor, live state tracker, or route-start reset workflow. Those require a separate future plan.

The implementation must not embed Archify, generate a standalone Archify document, use an iframe, or add a diagram runtime dependency. The desired result is a native React presentation using the repository's own certified data.

The existing detailed Markov graph may move under a closed research disclosure only after it is renamed **Technical policy graph** and all Phase 3E/3F graph behavior is retained.

The player-facing Crafting Constellation itself must remain visible, mounted, top-level, and outside every dropdown, `<details>`, accordion, and `OptimizerDisclosure`.

If the default view still resembles the supplied multi-page rulebook, Phase 3K fails.

If the default Constellation still resembles the raw solver topology, Phase 3K fails.

---

# 1. Baseline Review

## 1.1 Repository state

The current `main` head is the Phase 3J documentation closeout:

```text
d289068a7a6cf92a5b6a247edf60341c0f9659cc
docs: close out Phase 3J
```

The reachable history contains Phase 3J and its prerequisites. It does not contain the discarded Phase 3K current-item companion or later guided-flow work.

The implementation must begin from the actual latest `main`. It must not cherry-pick, restore, copy, or otherwise resurrect reverted post-3J commits.

## 1.2 What Phase 3J already solved

Phase 3J compiles exact policy rows into structured `PlayerCraftRule` objects. Each rule already owns:

- stable rule ID and priority;
- player stage;
- policy scope and progress kind;
- current rarity and prefix/suffix counts;
- required targets present and missing;
- acceptable targets present;
- fractured target facts;
- open compatible target slots;
- contextual junk counts and categories;
- minimal exact-name exception when necessary;
- selected action ID and name;
- structured recovery kind;
- source policy-rule indices;
- exact source state keys;
- represented-state and expected-visit evidence;
- certification status.

Phase 3J also provides an exact `PolicyFlowSummary` with:

- exact selected-policy nodes;
- exact selected-policy transition edges;
- conditional probabilities;
- next selected actions;
- progress, success, recovery, reacquire, and repeat outcome kinds;
- certified acquisition-to-downstream handoff;
- topology and reconciliation evidence.

These two sources are sufficient to compile a truthful player-facing flow without adding crafting mechanics.

## 1.3 Current presentation problem

The default result currently renders two separate explanations:

1. `SimpleCraftInstructions`, which expands the selected field route into 24 player-rule cards; and
2. `MarkovConstellation`, which renders the complete aggregated technical PolicyFlow graph.

Both are correct, but neither is the desired ordinary step-by-step experience.

The cards repeat the same loop at many exact affix shapes. The raw graph exposes internal topology and research interactions. The player must mentally combine both representations to understand a straightforward route such as:

```text
Clean base
  -> Transmute
  -> roll Magic for the preparation target
  -> Regal
  -> fill the fourth preparation modifier
  -> Fracture
  -> reacquire on junk fracture
  -> Scour on wanted fracture
  -> roll the final target pair
  -> Regal
  -> Exalt when safe or Scour when blocked
  -> Finish
```

The visible Constellation should communicate that flow directly.

## 1.4 Product recommendation

Replace both default presentations with one guided player Constellation.

Do not delete or weaken either underlying evidence source:

- `PlayerCraftRule[]` remains the player-decision contract;
- `PolicyFlowSummary` remains the transition/probability contract;
- the existing `MarkovConstellation` remains the technical graph renderer;
- exact advanced policy evidence remains available under Research diagnostics.

The change is presentation compression with fail-closed certification, not a solver change.

---

# 2. Result Information Architecture

## 2.1 Primary result order

Change the completed-result primary hierarchy to:

1. Recommendation;
2. Crafting Constellation;
3. Shopping list;
4. Research disclosures.

`How to craft it` and `Markov Policy Constellation` must no longer be separate primary sections.

The Crafting Constellation owns:

- selected route;
- physical starting point;
- compact target legend;
- the visible step-by-step flow;
- selected-node instruction details;
- Copy Playbook.

Shopping list retains full-route expected accounting and stays outside the Constellation.

## 2.2 Research disclosures

Retain these closed-by-default disclosures:

1. Search & proof;
2. Alternative methods;
3. Cost & usage details;
4. Research diagnostics.

Inside Research diagnostics retain:

- Advanced policy evidence;
- all exact Phase 3J player rules;
- exact modifier identities;
- source rule/state evidence;
- certification/reconciliation evidence;
- warnings and raw proof;
- the renamed **Technical policy graph**.

The technical graph may be nested in one explicit disclosure within Research diagnostics so its expensive visual surface is not part of the ordinary result. Once opened, it must remain mounted for the session so selection, camera, and layout state are not destroyed by closing and reopening it.

## 2.3 Superseded Phase 3J presentation assertions

Phase 3K intentionally supersedes only these Phase 3J presentation requirements:

- the 24-rule `SimpleCraftInstructions` list is no longer default-visible;
- the raw `MarkovConstellation` is no longer the always-visible primary graph;
- `How to craft it` and `Markov Policy Constellation` are replaced by one primary Crafting Constellation;
- the technical graph may be owned by a research disclosure;
- Phase 3E graph gestures are required when the technical graph is opened, not before disclosure interaction.

Phase 3K does not supersede Phase 3J rule certification, junk semantics, evidence retention, or action/recovery fidelity.

---

# 3. Scope and Non-Goals

## 3.1 In scope

- engine-owned Guided Constellation model;
- deterministic compilation from certified player rules and exact PolicyFlow;
- compact stage/action spine;
- semantic result branches;
- grouped junk outcomes;
- visible loops and recovery paths;
- one selected-node detail region;
- responsive desktop and mobile rendering;
- Copy Playbook based on the guided model;
- relocation and renaming of the raw technical graph;
- preservation of all exact evidence and accounting;
- focused Quality Lab coverage;
- documentation, deployment, and live verification.

## 3.2 Explicitly out of scope

- copied-item parsing;
- paste-current-item input;
- manual current-item construction;
- automatically identifying the player's current node;
- automatic step completion;
- session craft history;
- route-start reset controls;
- outcome sampling or simulation;
- clipboard polling;
- OCR or game-process integration;
- arbitrary-current-state optimization;
- solver, mechanic, probability, ranking, or acquisition changes;
- target editor or handoff redesign;
- Shopping-list accounting changes;
- Archify integration;
- unit tests.

The Constellation is an interactive route guide in this phase. It is not a live craft tracker.

---

# 4. Authoritative Guided Constellation Contract

## 4.1 Ownership

Add the Guided Constellation compiler in the crafting-engine domain near `craftPlan.ts` and `PolicyFlow.ts`.

Suggested ownership:

```text
crafting-engine/src/service/guidedCraftConstellation.ts
src/components/GuidedCraftConstellation.tsx
```

Exact paths may follow repository conventions, but the boundary is mandatory:

- the engine classifies, groups, orders, links, and certifies;
- React renders the returned model;
- React never parses `WHEN`, `THEN`, action names, or recovery prose to create graph structure;
- `CraftOptimizer.tsx` composes sections but does not build nodes or edges.

## 4.2 Suggested model

```ts
export type GuidedConstellationNodeKind =
  | 'ROUTE_START'
  | 'ACTION_STAGE'
  | 'DECISION_STAGE'
  | 'RECOVERY'
  | 'COMPLETE'
  | 'WITHHELD';

export type GuidedConstellationEdgeKind =
  | 'PRIMARY'
  | 'RESULT'
  | 'LOOP'
  | 'RECOVERY'
  | 'REACQUIRE'
  | 'SUCCESS';

export interface GuidedConstellationConditionRow {
  id: string;
  label: string;
  actionId: string;
  actionName: string;
  nextNodeId: string;
  playerRuleIds: string[];
  policyRuleIndices: number[];
  sourceStateKeys: string[];
}

export interface GuidedConstellationNode {
  id: string;
  kind: GuidedConstellationNodeKind;
  stage: PlayerCraftRuleStage | 'ROUTE_START';
  title: string;
  summary: string;
  actionIds: string[];
  conditionRows: GuidedConstellationConditionRow[];
  playerRuleIds: string[];
  sourcePolicyNodeIds: string[];
  sourcePolicyEdgeIds: string[];
  evidenceStatus: 'CERTIFIED';
}

export interface GuidedConstellationEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: GuidedConstellationEdgeKind;
  label: string;
  playerRuleIds: string[];
  sourcePolicyEdgeIds: string[];
  evidenceStatus: 'CERTIFIED';
}

export interface GuidedCraftConstellationSummary {
  version: 'GUIDED_CRAFT_CONSTELLATION_V1';
  status: 'CERTIFIED' | 'WITHHELD';
  reasons: string[];
  nodes: GuidedConstellationNode[];
  edges: GuidedConstellationEdge[];
  startNodeId?: string;
  terminalNodeId?: string;
  representedPlayerRuleIds: string[];
  representedPolicyRuleIndices: number[];
  representedSourceStateKeys: string[];
  representedPolicyEdgeIds: string[];
  fingerprint: string;
}
```

Names may change, but equivalent structured evidence is required.

## 4.3 Inputs

The compiler must consume:

- certified `CraftPlanSummary.playerRules`;
- certified `CraftPlanSummary.playerFinishRule`;
- `CraftPlanSummary.playerRuleCertification`;
- certified `PolicyFlowSummary.nodes` and `.edges`;
- selected route and acquisition presentation evidence;
- canonical target definition and modifier metadata only where needed for labels.

It must not consume rendered UI strings as policy truth.

## 4.4 Fail-closed behavior

Withhold the Guided Constellation when:

- Phase 3J player rules are withheld;
- PolicyFlow is uncertified;
- a player rule cannot be represented;
- a displayed edge lacks exact transition or certified handoff evidence;
- one source rule maps to conflicting guided actions;
- an action-changing exception is lost by grouping;
- a recovery destination cannot be proved;
- start or terminal ownership is ambiguous;
- source counts, IDs, or fingerprints fail reconciliation.

The withheld UI must say:

```text
Crafting Constellation withheld
The selected policy could not be compressed into an unambiguous player flow.
Open Research diagnostics for the exact certified evidence.
```

It must not fall back to a guessed chart or vague chronological prose.

---

# 5. Semantic Compression Rules

## 5.1 Main spine

Build the main spine only from stages/actions that have positive selected-route evidence.

The common self-fracture route may resemble:

```text
Selected start
  -> Make Magic
  -> Roll preparation target
  -> Promote
  -> Complete fracture preparation
  -> Fracture
  -> Begin final craft
  -> Roll remaining targets
  -> Promote
  -> Finish or recover
  -> Complete
```

This is an example, not a hardcoded sequence. Clean, purchased-fractured, Harvest, or other certified routes must omit, add, or rename stages from their actual evidence.

## 5.2 Condition compression

Within a stage, collapse repeated rules into short player decisions such as:

```text
Open compatible target slot -> Augment
Target slot occupied by junk -> Alter
Valid target pair -> Regal
```

The display may say `junk` without exact names when all represented rules share the same action and recovery.

Do not collapse rules when any of these differ:

- action ID;
- recovery kind;
- next guided stage;
- required-versus-acceptable progress;
- preparation-versus-final scope;
- fracture meaning;
- compatible slot side;
- minimal exception;
- terminal eligibility.

## 5.3 Action-changing junk exceptions

The player-facing flow must retain concise exceptions that change the action.

For the reviewed field witness, Rare finishing must preserve the distinction:

```text
Open missing-target prefix slot and no exception junk -> Exalted Orb
Prefix blocked, or Heavy Hitter / Smite the Weak present -> Orb of Scouring
```

Do not render one branch for every other junk modifier.

Do not hide different actions behind `Other junk`.

## 5.4 Loops

Repeated random rolling is shown as a loop, not duplicated cards.

Examples:

- Alter/Augment returns to Magic evaluation;
- an unsuccessful Exalt returns to Rare evaluation when exact evidence says so;
- Scour on a wanted fracture returns to the fractured Magic final-craft stage;
- junk fracture returns to reacquisition;
- a successful terminal transition goes to Complete.

Every loop must own exact source PolicyFlow edge IDs.

## 5.5 Fracture outcome

When present in the selected route, show one explicit fracture decision:

```text
Preparation target fractured -> certified cleanup and downstream handoff
Junk fractured -> certified reacquisition
```

Do not imply that every fracture route uses Scour or that every wrong fracture returns to the same base. Use the selected evidence.

## 5.6 Finish

Complete is a terminal node owned by `playerFinishRule` and PolicyFlow terminal evidence.

It must display:

- required targets;
- acceptable-alternative requirement when enabled;
- final rarity requirement when present;
- whether extra affixes are allowed.

No non-terminal state may visually connect to Complete without exact terminal transition evidence.

---

# 6. Visible Crafting Constellation

## 6.1 Default visual structure

Use a deterministic top-to-bottom or left-to-right flow, not an orbital cloud.

At desktop width:

- show one dominant main route;
- place recovery branches beside the stage that owns them;
- show loop arrows returning to the relevant evaluation stage;
- keep labels directly attached to their edges;
- keep the entire common route understandable without panning;
- avoid a full-canvas research viewer inside the primary result.

At 420px and 390px:

- use a vertical spine;
- stack paired branches;
- keep action names untruncated;
- allow the page to grow vertically;
- do not introduce page-level or component-level horizontal scrolling.

## 6.2 Complexity budget

The default visual should normally show:

- one route-start node;
- no more than eight major stage/action nodes on the main spine;
- no more than two immediately visible action-changing branches per stage;
- one terminal node;
- concise loop/recovery connectors.

This is a presentation target, not permission to discard truth.

When more distinctions are required, keep the stage as one visible node and place its certified condition rows in the selected-node detail region. If a truthful compact representation remains impossible, withhold instead of drawing a giant or misleading chart.

## 6.3 Node copy

Node titles should be direct actions or decisions:

- Start with clean Normal base;
- Use Orb of Transmutation;
- Roll for Martial Prowess;
- Use Regal Orb;
- Complete fracture preparation;
- Use Fracturing Orb;
- Roll for Feed the Fury or Fuel the Fight;
- Evaluate the Rare item;
- Finish.

Names must come from the current target and action metadata. These strings are examples only.

## 6.4 Visual semantics

Use color together with text and shape:

- route start;
- ordinary action;
- decision/evaluation;
- recovery/reacquisition;
- terminal success.

Do not assign a unique decorative color to every currency or node.

The selected node must be apparent without relying on color alone.

Honor reduced motion. The normal guide needs no particle system, replay animation, or Screensaver mode.

---

# 7. Selection and Instruction Details

## 7.1 One detail owner

Selecting a guided node opens or updates one compact detail region adjacent to or below the graph.

It must not expand a full card underneath every node.

The region shows:

```text
WHEN
<compact certified condition rows>

USE
<one action for the selected condition>

THEN
<re-check, next stage, recovery, or finish instruction>
```

When one stage contains multiple action-changing condition rows, selecting the row updates `USE` and `THEN` without changing solver state.

## 7.2 Why this action

Provide one `Why this action?` control in the selected-node detail region.

It may show compact evidence:

- rule IDs;
- action and recovery agreement;
- represented-state count;
- expected visits;
- exact-name exception, when applicable.

It must link or scroll to the corresponding Advanced policy evidence.

Do not reproduce complete exact state dumps in the primary Constellation.

## 7.3 No progression state

Node selection is explanatory only.

It must not:

- mark the craft complete;
- claim the player's item matches the node;
- choose a policy action for a supplied item;
- store gameplay history;
- modify the optimizer result;
- trigger a Worker request.

Use copy such as `Explore a stage` rather than `Current step` or `Your item is here`.

---

# 8. Technical Policy Graph Preservation

## 8.1 Rename and relocate

Rename the existing raw `Markov Policy Constellation` presentation to:

```text
Technical policy graph
```

Place it under Research diagnostics with a concise description:

```text
Exact aggregated selected-policy states, transitions, probabilities, occupancy, and layout tools.
```

The term **Crafting Constellation** is reserved for the new player-facing guide.

## 8.2 Preserve behavior

When Technical policy graph is opened, preserve:

- graph topology and fingerprints;
- node and edge identity;
- conditional probabilities and expected flow;
- selected-route focus;
- pan, zoom, replay, and Screensaver;
- node and edge selection;
- manual node dragging;
- keyboard nudging;
- edge rerouting;
- layout persistence bytes;
- Reset View, Reset Layout, Fit All, and Route Focus;
- overlay gesture exclusion;
- selectable technical text;
- fullscreen behavior;
- reduced-motion behavior.

Do not reuse the raw graph renderer to draw the guided graph. The two visuals have different contracts.

## 8.3 Mounting

The technical graph may defer its first mount until the user opens its disclosure. After first open, retain the mount for the result identity so closing/reopening does not discard local graph interaction state.

Changing optimizer result identity may correctly rebuild the technical graph from new result data.

---

# 9. Copy, Share, Export, and Evidence

## 9.1 Copy Playbook

Copy Playbook should follow the guided structure:

1. selected route and physical start;
2. target legend;
3. major stage/action spine;
4. compact action-changing condition rows;
5. loop and recovery instructions;
6. finish condition;
7. one-time caveats.

It must not silently omit a certified rule. Rules compressed into one guided stage must remain represented in the copied stage's conditions or advanced appendix.

## 9.2 Export and bug report

Retain all current exact evidence and add the Guided Constellation summary:

- model version and fingerprint;
- certification/withholding reasons;
- guided nodes and edges;
- represented player-rule IDs;
- represented policy-rule indices;
- represented source-state keys;
- represented PolicyFlow edge IDs.

Do not remove:

- `craftPlan`;
- `policyExplanation`;
- `policyRules`;
- `policyFlow`;
- raw Constellation graph evidence;
- exact modifier identities;
- full-route accounting.

## 9.3 Share and handoff

The Guided Constellation is derived result presentation.

Do not add node selection, detail expansion, technical-graph disclosure, camera, or layout state to:

- target/request fingerprints;
- optimizer cache identity;
- share identity;
- Cluster Jewels handoff identity;
- acquisition ranking;
- result certification.

Preserve Phase 3H one-way handoff detachment exactly as implemented at the Phase 3J baseline.

---

# 10. Suggested File Changes

Expected areas include:

```text
crafting-engine/src/service/guidedCraftConstellation.ts
crafting-engine/src/service/craftPlan.ts
crafting-engine/src/index.ts
crafting-engine/src/service/shareBundle.ts
src/components/GuidedCraftConstellation.tsx
src/components/SimpleCraftInstructions.tsx
src/components/MarkovConstellation.tsx
src/CraftOptimizer.tsx
src/optimizerInformationArchitecture.ts
src/index.css
quality-lab/**
docs/crafting-engine/PHASE3K_GUIDED_PLAYER_CONSTELLATION_COMPLETION_REPORT.md
```

This list is directional, not a requirement to touch every file.

Rules:

- do not change `MarkovConstellation.tsx` merely to force it into the new design;
- do not delete `SimpleCraftInstructions` evidence until Copy Playbook, diagnostics, and retained compatibility have explicit owners;
- do not perform graph compilation in `CraftOptimizer.tsx`;
- do not parse UI labels to build edges;
- do not hardcode the reviewed three-notable witness;
- do not create new Worker traffic for presentation.

---

# 11. Preservation Requirements

Phase 3K must preserve:

- Phase 3J modifier-role classification;
- Phase 3J contextual safe/blocking/last-slot/fractured junk semantics;
- Phase 3J action/recovery-homogeneous rule grouping;
- Phase 3J minimal exceptions;
- Phase 3J fail-closed rule certification;
- Phase 3J exact source-state/rule/visit reconciliation;
- Phase 3J Advanced policy evidence;
- Phase 3I import-first compact setup;
- Phase 3H handoff detachment and source-value ownership;
- Phase 3G required-plus-acceptable target semantics;
- Phase 3F authoritative scope, examples, and Rare action contrasts;
- Phase 3F overlay gesture exclusion and text selection;
- Phase 3E technical graph interaction and layout behavior;
- Phase 3D request-local proof/budget behavior;
- Phase 3B executable self-fracture mechanics;
- approximate-mechanics disclosures;
- canonical state, target, request, result, cache, and share identity;
- market-independent acquisition ranking;
- Shopping-list totals and full-route expected cost;
- zero hardcoded winners and zero Craft-specific policy branches.

The frozen Phase 3J field witness must still reconcile:

- 267 positive actionable policy rows;
- 572 represented exact states;
- 24 certified player rules before guided presentation compression;
- `740.8471930308734` expected visits.

The Guided Constellation may show far fewer visual nodes. That visual count must never be described as a reduction in solver states or policy rules.

---

# 12. Quality Lab Phase 3K Contract

Add focused direct, Worker, and real-browser gates.

| Gate | Required proof |
|---|---|
| K1 | Baseline is the Phase 3J closeout and no reverted post-3J source is restored |
| K2 | Guided model is compiled in the engine domain from certified player rules and certified PolicyFlow |
| K3 | Every displayed action, branch, loop, recovery, and terminal edge owns exact source evidence |
| K4 | Every certified player rule is represented exactly once in the guided model or causes withholding |
| K5 | Guided grouping never merges different actions, recoveries, scopes, fracture meanings, slot access, exceptions, or terminal eligibility |
| K6 | Field witness compresses the 24-rule card stack into a compact major-stage flow without changing the 24-rule evidence |
| K7 | Magic evaluation truthfully separates Augment, Alter, and Regal conditions |
| K8 | Preparation truthfully shows fill-to-four, Fracture, wanted-fracture handoff, and junk-fracture reacquisition when selected |
| K9 | Rare evaluation preserves Exalt-versus-Scour and Heavy Hitter / Smite the Weak exception evidence |
| K10 | Loops and recovery connectors terminate at the correct certified guided stage |
| K11 | Complete is reachable only from authoritative terminal evidence and retains required/acceptable/final-rarity/extra-affix truth |
| K12 | Default completed result contains one top-level Crafting Constellation and no 24-card rule stack or raw technical graph |
| K13 | Selecting a node changes only one compact `WHEN / USE / THEN / Why` detail owner and triggers zero Worker traffic |
| K14 | Copy Playbook remains complete; Shopping list is byte-equivalent; share/handoff/cache/request identities are unchanged |
| K15 | Export and bug report retain exact Phase 3J evidence and add guided-model evidence without identity loss |
| K16 | Technical policy graph is closed under Research diagnostics, retains mount after first open, and preserves all Phase 3E/3F interactions |
| K17 | Desktop, 420px, and 390px layouts are readable, keyboard accessible, reduced-motion safe, and free of horizontal overflow |
| K18 | Withheld/uncertified/colliding evidence produces no guessed flow and directs the user to Research diagnostics |
| K19 | No current-item parser, manual editor, live tracker, automatic progression, Archify runtime, or unit test is added |
| K20 | Retained Phase 3B-3J gates, exact 572-state differential, build, lint, typecheck, and diff hygiene close under the documented supersession |

## 12.1 Field browser witness

Use the reviewed Martial Prowess self-fracture route as one frozen presentation witness while keeping production logic fixture-independent.

The visible route should communicate approximately:

```text
Clean Normal base
  -> Transmutation
  -> Magic evaluation
       open target slot -> Augmentation
       occupied target slot -> Alteration
       valid target pair -> Regal
  -> Rare preparation
       valid 3-mod item -> Exalted Orb
       valid 4-mod item -> Fracturing Orb
  -> Fracture result
       Martial Prowess fractured -> Scour and begin final craft
       junk fractured -> abandon and reacquire
  -> Final Magic evaluation
       roll Feed the Fury or Fuel the Fight
       valid pair -> Regal
  -> Rare evaluation
       safe open prefix -> Exalted Orb
       blocked/exception junk -> Scouring Orb
  -> Finish
```

This browser witness must prove labels are generated from the selected target/action evidence rather than literal source constants.

## 12.2 Negative controls

Prove Phase 3K does not:

- restore reverted Phase 3K or later code;
- use the raw Markov graph as the player guide;
- retain the long default rule-card stack;
- hide the player-facing Crafting Constellation;
- label the technical graph as the Crafting Constellation;
- create an edge from `then.summary` string parsing;
- merge all junk without action comparison;
- conceal different actions behind an `Other` result;
- imply Exalt guarantees a target;
- imply Annul removes only junk;
- imply every Scour returns to Normal;
- imply every wrong fracture shares one recovery;
- claim a selected node is the player's current item;
- trigger optimization from node selection;
- alter Shopping-list totals;
- change solver policy or graph topology;
- add Archify or another diagram dependency;
- add or run unit tests.

---

# 13. Execution Order

## 13.1 Pre-edit

1. Pull `origin/main` and verify `d289068a7a6cf92a5b6a247edf60341c0f9659cc` or document the newer baseline.
2. Confirm the old post-3J commits are not reachable from `main` and do not restore them.
3. Read this plan in full.
4. Read the Phase 3E, 3F, 3G, 3H, 3I, and 3J plans/completion reports relevant to graph behavior, target semantics, handoff ownership, information architecture, and player-rule certification.
5. Trace `PlayerCraftRule`, `PlayerCraftRuleOutcome`, `PolicyFlowNode`, and `PolicyFlowEdge` from engine construction through UI, copy, share, export, and Quality Lab.
6. Capture before-state desktop/mobile screenshots of the 24-card guide and raw Markov graph.
7. Record the exact current information-architecture constants and Worker request count.
8. Run impact recommendation and record the selected focused gates.

## 13.2 Implementation sequence

1. Define the engine-owned Guided Constellation model and fingerprint.
2. Compile major stages and condition rows from certified player rules.
3. Map every guided edge to exact PolicyFlow edges or certified scope handoff.
4. Add fail-closed reconciliation and direct differential diagnostics.
5. Prove the field witness before changing default UI.
6. Implement the responsive `GuidedCraftConstellation` renderer.
7. Add the single selected-node `WHEN / USE / THEN / Why` detail owner.
8. Replace the default `SimpleCraftInstructions` and raw Markov sections with one Crafting Constellation.
9. Move and rename the existing raw graph under Research diagnostics.
10. Update Copy Playbook and export/bug evidence.
11. Update information-architecture constants and superseded browser assertions.
12. Add K1-K20 and retained focused gates.
13. Run focused closure.
14. Run DEV exactly once.
15. Run RELEASE exactly once.
16. Write the completion report from observed evidence.
17. Commit implementation and closeout directly to `main`.
18. Verify GitHub Pages and uncached live assets at the final SHA.

## 13.3 Required commands

```bash
npm run build
npm run lint
npm run lab:typecheck
git diff --check
npm run -- lab:recommend -- --base d289068a7a6cf92a5b6a247edf60341c0f9659cc --head HEAD
npm run lab:dev
npm run lab:release
```

Run focused direct/Worker/browser gates and retained impact-selected gates before DEV/RELEASE.

Do not add or run unit tests.

Do not run EXTENDED, nightly, long-soak, the legacy 115-gate suite, or legacy release matrices without a separate documented finding.

## 13.4 Diff hygiene

Before commit, confirm:

- no reverted post-3J code was restored;
- no solver/mechanics/policy/ranking changes exist;
- all new graph compilation is in the engine domain;
- no UI string parsing creates graph semantics;
- every guided edge retains exact evidence;
- all 24 field player rules remain represented;
- all 572 field states and expected visits reconcile;
- no action-changing junk exception was lost;
- the default page contains only one player-facing Constellation;
- the technical graph remains available but closed;
- node selection triggers zero Worker requests;
- copy/export/share/handoff/accounting remain correct;
- generated Quality Lab reports are not tracked;
- the worktree contains no unrelated changes.

---

# 14. Acceptance Criteria

Phase 3K is complete only when:

1. the default result contains one always-visible Crafting Constellation;
2. the Constellation is a simple player flow rather than a raw solver graph;
3. the 24-card instruction stack is not default-rendered;
4. the flow shows route start, actions, meaningful result branches, loops, recovery, and Finish;
5. equivalent junk outcomes are grouped without losing action-changing distinctions;
6. every displayed node and edge maps to certified Phase 3J and PolicyFlow evidence;
7. every certified player rule is represented exactly once or the flow is withheld;
8. React renders structured data and does not infer policy truth;
9. the reviewed Magic Augment/Alter/Regal distinctions remain clear;
10. the reviewed fracture success/reacquire split remains clear;
11. the reviewed Rare Exalt/Scour exception remains clear;
12. selecting a node reveals one concise `WHEN / USE / THEN / Why` region;
13. selection is explanatory and never claims live item state;
14. Copy Playbook remains complete;
15. Shopping-list accounting is unchanged;
16. exact evidence remains in export and bug reports;
17. the raw graph is renamed Technical policy graph and preserved under Research diagnostics;
18. Phase 3E/3F graph interactions pass after opening the technical graph;
19. desktop and mobile layouts are readable and accessible;
20. interaction adds zero Worker requests and changes no result identity;
21. no discarded companion/current-item code is restored;
22. no mechanics, probabilities, solver policy, acquisition ranking, topology, or canonical identity changes occur;
23. K1-K20 and retained focused gates close;
24. build, lint, Quality Lab typecheck, and diff hygiene pass;
25. DEV and RELEASE follow the required one-run contract;
26. implementation/report are committed to `main` and Pages is verified at the final SHA.

If the default page still prints the supplied long rulebook, Phase 3K fails.

If the primary Constellation still requires understanding raw policy nodes, Phase 3K fails.

If the simplified flow invents a transition, Phase 3K fails.

If all junk is merged despite different actions, Phase 3K fails.

---

# 15. Completion Report

Create:

```text
docs/crafting-engine/PHASE3K_GUIDED_PLAYER_CONSTELLATION_COMPLETION_REPORT.md
```

The report must include:

- requested baseline, actual baseline, implementation, closeout, and final deployed SHAs;
- explicit confirmation that reverted post-3J code was not restored;
- exact files changed;
- before/after information architecture;
- Guided Constellation model and compiler ownership;
- node/edge certification and fail-closed rules;
- player-rule-to-guided-node/condition reconciliation;
- PolicyFlow-edge-to-guided-edge reconciliation;
- field witness diagram and screenshots;
- 24-rule, 572-state, and expected-visit reconciliation;
- Magic Augment/Alter/Regal evidence;
- fracture success/reacquire evidence;
- Rare Exalt/Scour and exception evidence;
- loop and recovery destination evidence;
- terminal evidence;
- visible-node and default-height measurements;
- selected-node detail behavior;
- Copy Playbook comparison;
- Shopping-list byte comparison;
- share/handoff/cache/request identity comparison;
- export/bug evidence comparison;
- zero-Worker interaction evidence;
- Technical policy graph disclosure/mount behavior;
- retained Phase 3E/3F graph interaction results;
- desktop, 420px, and 390px screenshots and overflow evidence;
- accessibility, keyboard, focus, and reduced-motion evidence;
- K1-K20 results;
- retained Phase 3B-3J results and superseded assertion list;
- build, lint, typecheck, diff hygiene, focused, DEV, and RELEASE counts/durations;
- historical failures and targeted closures without rewriting suite history;
- explicitly unrun suites;
- workflow, job, deployment, and status IDs;
- final uncached live HTML/bundle status, asset name, release marker, player-facing Constellation labels, closed technical graph marker, and absence of the default 24-card stack.

Do not claim that the Guided Constellation is a live tracker.

Do not claim that visual nodes equal solver states.

Do not claim all junk is mechanically interchangeable.

Do not claim global optimality when it is not proven.

Do not claim correctness from screenshots without direct evidence reconciliation.

---

# 16. Copy/Paste Implementation Prompt

```text
Implement the replacement Phase 3K in jpitty03/cluster-jewel-research from the latest main.

The sole source of truth is:
docs/crafting-engine/POST_PHASE3J_FIELD_REVIEW_AND_PHASE3K_GUIDED_PLAYER_CONSTELLATION_PLAN.md

Read the entire plan before editing anything. Then read the relevant Phase 3E, 3F, 3G, 3H, 3I, and 3J plans and completion reports. Trace PlayerCraftRule, PlayerCraftRuleOutcome, PolicyFlowNode, PolicyFlowEdge, SimpleCraftInstructions, MarkovConstellation, Copy Playbook, export, bug evidence, and Quality Lab before implementation.

The baseline must be the Phase 3J closeout or a documented newer main descended from it. DO NOT restore, cherry-pick, copy, or recreate the reverted post-3J current-item companion, paste parser, manual item editor, live tracker, route-start reset workflow, or any other discarded Phase 3K-and-later code.

Replace the default 24-card Simple Craft Instructions stack and the default raw Markov graph with one always-visible, top-level Crafting Constellation. This Constellation must be a simple player-facing route flow: selected start, major actions, meaningful result branches, loops, recovery, and Finish.

Compile a deterministic Guided Constellation model in the crafting-engine domain from certified Phase 3J player rules and certified exact PolicyFlow transitions. Every displayed node, condition, edge, loop, recovery, and terminal connection must retain player-rule IDs, policy-rule indices, source-state keys, and exact PolicyFlow edge evidence. Fail closed if any rule or transition cannot be represented unambiguously.

React may render the model. React MUST NOT parse WHEN/THEN prose, infer actions, group junk, invent transitions, choose recovery, or become a second policy engine. CraftOptimizer.tsx must not construct the graph.

Group equivalent junk outcomes, but NEVER merge states that differ by action, recovery, scope, fracture meaning, compatible slot, minimal exception, target progress, or terminal eligibility. Preserve the real Rare finishing distinction: safe open prefix may Exalt, while blocked or exception junk such as Heavy Hitter / Smite the Weak may require Scour. Do not create one branch per junk modifier and do not hide different actions under Other.

Use a deterministic readable spine. The common self-fracture witness should read approximately as clean base -> Transmute -> evaluate Magic -> Alter/Augment -> Regal -> complete four-mod preparation -> Fracture -> wanted fracture cleanup or junk-fracture reacquisition -> roll final targets -> Regal -> Exalt when safe or Scour when blocked -> Finish. This is a fixture witness, NOT a hardcoded production route.

Selecting a guided node must update one compact WHEN / USE / THEN / Why this action region. Do not expand details under every node. Selection is explanatory only: do not call it the player's current step, do not track progress, do not accept pasted items, and do not trigger Worker traffic.

Rename the existing raw Markov Policy Constellation to Technical policy graph and move it under Research diagnostics. It may defer first mount until opened, but after first open it must remain mounted for the current result identity. Preserve every Phase 3E/3F behavior: topology, probabilities, occupancy, pan, zoom, replay, Screensaver, node/edge selection, dragging, keyboard nudge, rerouting, layout persistence, Reset View, Reset Layout, Fit All, Route Focus, fullscreen, overlay gesture exclusion, text selection, and reduced motion.

Update the primary result order to Recommendation -> Crafting Constellation -> Shopping list -> research disclosures. The player-facing Crafting Constellation must remain outside every dropdown, details element, accordion, and OptimizerDisclosure.

Update Copy Playbook to follow the guided stages while retaining every certified rule. Preserve Shopping-list bytes, request/result/cache/share/handoff identities, required-plus-acceptable targets, exact export/bug evidence, acquisition ranking, mechanics, probabilities, policy topology, and canonical identities. Add the Guided Constellation model and evidence map to export/bug evidence without removing Phase 3J data.

Do not add Archify, an iframe, a generated standalone graph, a diagram runtime dependency, hardcoded winners, Craft-specific branches, current-item parsing, automatic progression, outcome simulation, unit tests, or any mechanics/solver/ranking change.

Implement K1-K20 direct, Worker, and real-browser gates exactly as specified. Retain the Phase 3J field reconciliation: 267 positive policy rows, 24 player rules, 572 exact states, and 740.8471930308734 expected visits. Run focused and impact-selected retained gates, build, lint, Quality Lab typecheck, diff hygiene, DEV exactly once, and RELEASE exactly once after focused closure. Do not run unit tests, EXTENDED, nightly, long-soak, the legacy 115-gate suite, or legacy release matrices unless a separately documented finding requires one.

Create docs/crafting-engine/PHASE3K_GUIDED_PLAYER_CONSTELLATION_COMPLETION_REPORT.md from observed evidence. Commit implementation and closeout directly to main, verify GitHub Pages at the final SHA, and return exact commits, validation counts/durations, explicitly unrun suites, workflow/job/deployment/status IDs, and uncached live HTML/bundle verification.

DO NOT REPORT PHASE 3K COMPLETE if the 24-card rulebook remains default-visible, the raw technical topology remains the primary Constellation, the player-facing Constellation is hidden, any edge lacks exact evidence, action-changing junk is falsely merged, node selection pretends to track the live item, reverted code is restored, or the Technical policy graph loses Phase 3E/3F behavior.
```
