# Post-Phase 3I Field Review and Phase 3J Plan

## Strict Player Craft Instructions, Semantic Junk Grouping, and Always-Visible Constellation

Status: **READY FOR IMPLEMENTATION**

Baseline reviewed: `b9d76af62d8ee5097d2a2ac41d3cc3863cffafad` on `main`.

Phase 3I is **CLOSED / PASS / DEPLOYED**. Its import-first entry state, compact target summary, controlled disclosure primitive, compact search status, recommendation/craft/shopping hierarchy, responsive behavior, disclosure-state isolation, and retained Phase 3B-3H contracts are permanent except for one deliberate Phase 3J presentation revision: the PolicyFlow Constellation must no longer be inside a disclosure.

Phase 3J replaces vague chronological craft prose and repeated per-step `Decision details` with strict, exhaustive, player-readable `WHEN -> USE -> THEN` rules. Every unwanted explicit modifier is called a **junk modifier**. Exact modifier identities remain authoritative internally but are not repeated across the normal guide unless a minimal exception is mechanically necessary.

No unit tests are to be added or run. Add focused diagnostics and real-browser Quality Lab gates. Run DEV once and RELEASE once. EXTENDED, nightly, long-soak, the legacy 115-gate suite, and legacy release matrices remain withheld unless an implementation finding independently justifies one of them.

---

# 1. Field Review and Product Decision

## 1.1 Observed problem

Phase 3I successfully condensed the optimizer page, but the default craft guide still says things such as:

```text
Use Orb of Augmentation when the selected policy wants another Magic affix before promotion.
Use Regal Orb only for the one-target Magic states the selected policy promotes.
Use Exalted Orb Slam and Orb of Annulment only in the selected finishing states.
Expand Decision details when exact current affixes matter.
```

Those sentences describe the existence of a policy without telling the player how to follow it. The player must open large `Decision details` blocks, read represented-state counts and expected visits, compare exact state examples, and infer the action.

The reviewed Primordial Bond + Renewal + Rotten Claws guide demonstrates the problem:

- two Magic `1P/1S`, final-progress `1/3` states can choose Regal or Alteration depending on the other affix;
- two Rare `1P/2S`, final-progress `2/3` states can choose Exalted Orb or Annulment depending on the other affix;
- Rare final-progress `1/3` states can choose Exalted Orb or Scouring depending on the exact policy state;
- the same player-visible rarity, affix count, and progress are therefore not sufficient to select an action.

The solution is not a fabricated universal sequence and not one card per exact state. It is an authoritative semantic rule compiler that groups exact states into a small number of strict player conditions.

## 1.2 Authoritative Phase 3J decision

The normal guide must use this grammar:

```text
WHEN your item matches this condition
USE this currency/action
THEN re-check the result using this next rule or recovery instruction
```

The player-facing vocabulary is:

- **required target modifier**: a modifier required by `requiredMods`;
- **acceptable target modifier**: a modifier satisfying an `acceptableAnyOf` branch;
- **target modifier**: either of the above when the distinction is not needed in the sentence;
- **junk modifier**: every explicit modifier that does not contribute to the requested terminal target;
- **safe junk**: junk that the selected policy keeps in the current rule context;
- **blocking junk**: junk that blocks a missing target through exclusion or target-access constraints;
- **last-slot junk**: junk occupying the final prefix/suffix capacity needed by a missing target;
- **fractured junk**: unwanted junk that cannot be removed by normal modification and must be treated as permanent.

All four specializations remain junk. They are short mechanical qualifiers, not separate modifier-name combinations.

## 1.3 Constellation decision

When `constellationGraph` exists, the Markov Policy Constellation must be a normal always-visible top-level result section. It must not be owned by `OptimizerDisclosure`, `<details>`, an accordion, a dropdown, or a collapsed-by-default container.

Recommended result order:

1. Recommendation;
2. How to craft it;
3. Shopping list;
4. Policy Constellation;
5. Search & proof disclosure;
6. Alternative methods disclosure;
7. Cost & usage details disclosure;
8. Research diagnostics disclosure.

Phase 3J intentionally changes the Phase 3I five-disclosure result contract to four research disclosures plus one always-visible Constellation.

---

# 2. Scope and Non-Goals

## 2.1 In scope

Phase 3J includes:

- a canonical player modifier-role classifier;
- semantic junk classification;
- action-homogeneous player-rule grouping;
- strict `WHEN -> USE -> THEN` instructions;
- concise action and recovery cards;
- removal of repeated default `Decision details` blocks;
- one consolidated advanced policy-evidence destination;
- simple copy-playbook output;
- full-fidelity export/bug-report evidence;
- always-visible Constellation placement;
- Phase 3J direct, Worker, and browser gates;
- retained Phase 3B-3I validation.

## 2.2 Out of scope

Phase 3J must not:

- change crafting probabilities or action legality;
- change the selected policy or search ranking;
- treat all exact junk modifiers as mechanically identical when they are not;
- expose one rule per exact state or one rule per exact junk name;
- create a Craft-specific target branch;
- hardcode Primordial Bond, Renewal, Rotten Claws, Strength, Call to the Slaughter, or any field fixture into production grouping;
- replace required-versus-acceptable progress with one flat target count;
- invent an action when policy evidence is absent or unreconciled;
- hide provisional, unresolved, approximate-mechanics, or proof caveats;
- add a live item-parser/paste-state feature;
- change Constellation topology, probabilities, occupancy, identity, layout persistence, or replay;
- add or run unit tests.

A future item-paste helper may automatically identify the current rule, but it is not needed to make the Phase 3J guide strict and readable.

---

# 3. Authoritative Modifier-Role Classification

## 3.1 Classification boundary

Add one shared classifier in the craft-plan/explanation domain. Do not classify modifiers independently in React.

Conceptually:

```ts
type PlayerModifierRole =
  | 'REQUIRED_TARGET'
  | 'ACCEPTABLE_TARGET'
  | 'JUNK';

type PlayerJunkKind =
  | 'SAFE_FOR_THIS_RULE'
  | 'BLOCKS_MISSING_TARGET'
  | 'OCCUPIES_LAST_COMPATIBLE_SLOT'
  | 'FRACTURED'
  | 'OTHER';
```

`PlayerJunkKind` is contextual. A modifier is not globally safe or blocking; it is evaluated against:

- the complete target;
- currently missing required modifiers;
- acceptable-branch satisfaction;
- affix capacity;
- exclusion/mod groups;
- fracture state;
- the selected policy action and recovery semantics.

## 3.2 Required targets

A state modifier is `REQUIRED_TARGET` only when it matches a canonical `requiredMods` requirement by existing exact identity/tier rules.

The player guide may say:

```text
Required target: Renewal
Required targets present: Primordial Bond + Renewal
Required target missing: Rotten Claws
```

Do not infer target status from display text.

## 3.3 Acceptable targets

A state modifier is `ACCEPTABLE_TARGET` when it matches a canonical acceptable branch requirement.

The guide must preserve structured progress:

```text
Required: 3/3
Acceptable alternative: 0/1
```

or:

```text
Required: 3/3
Acceptable alternative satisfied: Strength T1
```

An acceptable modifier is wanted, not junk. Multiple acceptable alternatives in one state still produce one terminal success and no probability double counting.

## 3.4 Junk

Every other explicit modifier is player-facing junk.

Default instruction text must not print the junk modifier's exact name. Prefer:

```text
1 junk suffix
2 junk prefixes
1 safe junk modifier
1 blocking junk notable
1 fractured junk modifier
```

Exact junk identity remains available in consolidated advanced evidence and exported source-state identities.

## 3.5 Minimal exceptions

Sometimes exact junk identities in the same apparent shape produce different policy actions. Phase 3J must first attempt to explain the split with stable mechanical predicates:

- prefix versus suffix;
- normal modifier versus cluster notable;
- exclusion/mod-group conflict;
- occupies the last compatible slot;
- fractured versus removable;
- blocks a particular missing target;
- action/recovery equivalence.

Only when no truthful compact predicate separates the cohorts may the rule show a minimal exception line:

```text
Any junk suffix except: Call to the Slaughter
```

or:

```text
If the junk modifier is an unwanted cluster notable, follow the reroll rule instead.
```

Do not create a separate card for every exact junk modifier. Minimize exception names and prove that the exception set exactly covers the action difference.

---

# 4. Player Decision Rule Contract

## 4.1 Canonical rule shape

Add an authoritative player-instruction representation to the craft plan rather than reconstructing it from UI strings.

Conceptually:

```ts
interface PlayerCraftRule {
  id: string;
  stage: 'ACQUIRE' | 'MAGIC_ROLL' | 'PROMOTE' | 'RARE_FINISH' | 'RECOVER' | 'TERMINAL';
  priority: number;
  when: PlayerRuleCondition;
  actionId: string;
  actionName: string;
  then: PlayerRuleOutcome[];
  representedPolicyRuleIndices: number[];
  representedStateCount: number;
  expectedVisits: number;
  evidenceStatus: 'CERTIFIED' | 'WITHHELD';
}
```

`representedStateCount`, `expectedVisits`, exact rule indices, and state identities are evidence fields. They do not appear in the default instruction card.

## 4.2 Condition vocabulary

Player conditions may use only facts the player can reasonably inspect:

- current rarity;
- prefix/suffix affix counts;
- fracture presence and whether it is wanted or junk;
- required target names present/missing;
- acceptable target status;
- number and slot of junk modifiers;
- safe/blocking/last-slot/fractured junk qualifier;
- open compatible target slot;
- preparation versus final-craft scope.

Avoid Bellman values, Q-values, rule indices, fingerprints, source-state IDs, raw enum names, and expected visits in default conditions.

## 4.3 Grouping signature

Exact source states may be grouped only when they share:

1. the same policy/explanation scope;
2. the same player-inspectable condition after junk normalization;
3. the same selected physical action;
4. the same recovery/next-rule semantics;
5. compatible target-present/missing meaning;
6. compatible affix/fracture constraints;
7. reconciled state counts and expected visits.

If the selected action differs, split the group. If recovery differs, split the group. If a compact predicate cannot distinguish the groups, use a minimal exception—not fabricated equivalence.

## 4.4 Priority and exclusivity

Rules are evaluated top-to-bottom. For every on-policy reachable state:

- exactly one nonterminal player rule must match;
- terminal states match the Finish rule and no action rule;
- no state may match two rules recommending different actions;
- no published action may lack source policy evidence;
- no source policy rule may be silently omitted.

Priority must be derived generically and serialized as evidence. UI order alone must not resolve an ambiguous rule set.

## 4.5 Certification and withholding

Publish Simple Craft Instructions only when the rule set certifies:

- complete source-rule coverage;
- action-homogeneous groups;
- non-overlap;
- count/visit reconciliation;
- exact selected-action union;
- exact recovery mapping;
- known modifier roles;
- no invented mechanics;
- no unknown action IDs.

If certification fails, withhold the simple guide and show:

```text
Simple instructions withheld
The selected policy could not be grouped into unambiguous player rules. Technical evidence remains available for diagnosis.
```

Do not fall back to vague `when the selected policy wants` wording.

---

# 5. Default Simple Craft Instructions UI

## 5.1 Heading and orientation

Rename the default section content to emphasize direct use:

```text
How to craft it
Match your current item to the first WHEN condition that applies, use the listed action once, then check the result again.
```

Keep Selected route, Starting point, and Physical start concise.

Remove the current sentence telling players to expand Decision details when exact affixes matter.

## 5.2 Rule card format

Every actionable card must use the same visual grammar:

```text
WHEN
Magic · 1 Prefix / 1 Suffix
Has required target: Renewal
Also has: 1 safe junk suffix

USE
Regal Orb

THEN
Check the resulting Rare item against the Rare rules below.
```

Use strong labels, short lines, currency icon/name, and an action color that remains semantic and accessible. Do not rely on color alone.

## 5.3 Rule list organization

Group rules into a small chronological stage list:

1. Acquire/start;
2. Make Magic;
3. Magic rolling rules;
4. Promotion rules;
5. Rare finishing rules;
6. Recovery rules;
7. Finish condition.

Within Magic and Rare sections, cards are ordered by certified priority. Do not repeat an eight-step macro card and then repeat the actual rule cards underneath it.

## 5.4 Target legend

At the start of the guide, show one small target legend:

```text
Required targets: Primordial Bond, Renewal, Rotten Claws
Acceptable alternative: none
Junk modifier: anything else
```

For Phase 3G targets:

```text
Required targets: Energy Shield T1, Intelligence T1, Increased Effect T1
Acceptable target: any one of All Attributes T1, Strength T1, or Cast Speed T1
Junk modifier: anything else
```

Do not repeat the full required list inside every rule unless the present/missing distinction is necessary.

## 5.5 Compact junk legend

Show once:

```text
Safe junk: the selected rule can keep it.
Blocking junk: it prevents or occupies the slot needed by a missing target.
Fractured junk: permanent unwanted modifier.
```

This is explanatory terminology, not a user setting.

---

# 6. Action-Specific Instruction Requirements

The following are presentation templates. Production conditions and actions must come from the selected policy.

## 6.1 Orb of Transmutation

Example form:

```text
WHEN: The item is Normal and this route starts from a clean base.
USE: Orb of Transmutation.
THEN: Check the resulting Magic item against the Magic rolling rules.
```

Do not show Transmutation when the physical start is already Magic or Rare.

## 6.2 Orb of Alteration

Alteration rules must say exactly which state is rejected in semantic terms:

```text
WHEN: Magic item has no target modifier.
USE: Orb of Alteration.
THEN: Continue checking the Magic rules.
```

or:

```text
WHEN: Magic item has 1 required target plus blocking junk.
USE: Orb of Alteration.
THEN: Continue checking the Magic rules.
```

If a specific unwanted notable is the minimal exception, show one exception line rather than a separate state card.

## 6.3 Orb of Augmentation

Augmentation instructions must state the open-slot condition:

```text
WHEN: Magic item has one keepable affix and an open Magic affix slot that can improve target access.
USE: Orb of Augmentation once.
THEN: Re-check the resulting Magic item; Regal only if a promotion rule matches.
```

Do not say merely `when needed` or `when the policy wants another affix`.

## 6.4 Regal Orb

Regal instructions must expose the real Promote cohort using junk abstraction:

```text
WHEN: Magic item has 1 target modifier plus 1 safe junk modifier and matches this promotion rule.
USE: Regal Orb once.
THEN: Check the resulting Rare item against the Rare finishing rules.
```

The rejected contrast must also be explicit:

```text
WHEN: The second Magic affix is blocking junk or a listed exception.
USE: Orb of Alteration instead.
```

Preserve the authoritative Phase 3F Promote cohort and its reconciled Alter/Augment/Regal actions. The UI may compress junk identities, but the evidence totals and rule indices must remain exact.

## 6.5 Exalted Orb

Exalt instructions must name the missing target and compatible open slot:

```text
WHEN: Rare item has 2 required targets, the missing required target is a Prefix, and at least one Prefix slot is open; existing junk is safe for this rule.
USE: Exalted Orb once.
THEN: If the target is complete, stop. Otherwise re-check the Rare rules.
```

Do not imply that Exalt guarantees the missing target. Do not say `Exalt at 2/3` without the slot/junk condition.

## 6.6 Orb of Annulment

Annul instructions must show outcome branches:

```text
WHEN: Rare item matches this Annul rule and contains blocking/removable junk.
USE: Orb of Annulment once.
THEN:
  - if junk was removed, re-check for an Exalt or finish rule;
  - if a target was removed, follow the certified recovery rule;
  - if another affix was removed, re-check the Rare rules.
```

Use the actual policy recovery mapping. Do not imply that Annul cannot remove a wanted modifier. Fractured modifiers remain unremovable.

## 6.7 Orb of Scouring

Scour instructions must be state-aware:

```text
WHEN: Rare item matches a certified restart rule.
USE: Orb of Scouring.
THEN: Continue from the resulting item's actual rarity/state.
```

With no fracture, Scour normally returns to a clean Normal item. With a fracture, the actual post-Scour state may remain Magic. Preserve reacquisition and recovery semantics; do not always send every Scour outcome to Step 1.

## 6.8 Harvest, Fracturing, and acquisition actions

If the selected certified route contains Harvest, Fracturing, or acquisition preparation:

- use the same `WHEN -> USE -> THEN` format;
- preserve approximate-mechanics warnings;
- preserve wrong-fracture recovery;
- do not invent a Harvest instruction merely because the mechanic is registered;
- do not model the Crafting Bench as creating cluster target modifiers/notables.

## 6.9 Finish

The final rule must state:

```text
STOP WHEN
All required targets are present,
the acceptable-alternative requirement is satisfied when enabled,
and the requested rarity/final-state constraints are satisfied.
```

Extra affixes follow the target constraint. Junk does not prevent success when extra affixes are allowed unless it blocks an otherwise missing target before completion.

---

# 7. Recovery and Loop Fidelity

## 7.1 Re-check after every action

The guide must not imply a fixed sequence after random actions. `THEN` generally instructs the player to re-check the new state against the rules.

Use direct recovery links only when the policy evidence has an exact recovery target.

## 7.2 Outcome branches

Random destructive or additive actions may require multiple `THEN` outcomes. Branches must be grouped by player-visible result:

- target added;
- junk added;
- target removed;
- junk removed;
- rarity changed;
- reacquisition/restart required;
- terminal completion.

Do not expose transition probabilities in the default card. Preserve them in advanced evidence.

## 7.3 No universal action shortcuts

The guide must never claim:

- always Augment a one-affix Magic item;
- always Regal at one target;
- always Exalt at two targets;
- always Annul blocking junk;
- always Scour a failed Rare item.

Each shortcut is valid only when a certified rule condition matches.

---

# 8. Consolidated Advanced Policy Evidence

## 8.1 Remove repeated default Decision details

Do not render a large `Decision details` disclosure under every chronological step.

The default guide must not show:

- represented-state counts;
- expected visits;
- exact affix-state prose;
- source-state identities;
- policy rule indices;
- Q-values or bounds;
- raw action IDs.

## 8.2 Preserve one advanced destination

Move complete decision evidence into `Research diagnostics` under a nested section:

```text
Advanced policy evidence
```

For every player rule, preserve:

- source policy scope;
- progress kind;
- rarity/affix/fracture cohort;
- exact rule indices;
- exact source-state identities;
- action options;
- represented-state counts;
- expected visits;
- reconciliation totals;
- minimal-exception derivation;
- withheld-group diagnostics;
- recovery mapping.

## 8.3 Traceability from simple rule to evidence

Each simple rule may have a small `Why this action?` link/button that opens or navigates to its corresponding advanced evidence. It must not expand a huge inline block inside the rule card.

The link must preserve scroll/focus behavior and must not alter graph state, handoff state, or search state.

---

# 9. Always-Visible Policy Constellation

## 9.1 Placement

Remove the `OptimizerDisclosure` wrapper currently titled `Strategy visualization`.

Render:

```tsx
{constellationGraph && (
  <section className="optimizer-card constellation-card" aria-label="Markov Policy Constellation">
    <MarkovConstellation ... />
  </section>
)}
```

as an ordinary top-level result section after Shopping list and before collapsed research disclosures.

## 9.2 Visibility contract

When a valid graph exists:

- it is mounted automatically;
- it is visible without a click;
- it has no parent `aria-expanded` control;
- it is not hidden with CSS;
- it is not deferred until a disclosure opens;
- browser printing/export does not omit it because of disclosure state.

## 9.3 Interaction preservation

Preserve all Phase 3E and Phase 3F behavior:

- manual node dragging;
- keyboard nudge;
- edge rerouting;
- node and edge selection;
- saved positions and strict identity key;
- replay and Screensaver behavior;
- Reset View and Reset Layout;
- Fit All and label-aware scope envelope;
- detail overlay exclusion from pan/deselect/drag;
- text selection inside overlays;
- unchanged saved layout bytes after technical-detail interaction.

## 9.4 Responsive behavior

Always visible does not mean unconstrained height or horizontal overflow.

- preserve the current graph viewport and internal navigation controls;
- keep document/body scroll width equal to client width at 390px and 420px;
- do not clip scope labels;
- do not add an inset that regresses Phase 3I's focused mobile closure;
- keep touch interaction and overlay text selection usable.

The completed-result page may be taller because the graph is intentionally visible. Fresh/import/setup heights should remain Phase 3I-equivalent.

---

# 10. Copy, Share, Export, and Replay

## 10.1 Copy Playbook

`Copy Playbook` must copy the simple rulebook, not the current vague macro steps or full technical decision dumps.

Required copied structure:

```text
TARGETS
Required: ...
Acceptable: ...
Junk: anything else

RULE 1
WHEN: ...
USE: ...
THEN: ...
```

Include critical optimality/approximation caveats once, not after every rule.

## 10.2 Shopping list

Shopping-list content and full-route accounting remain unchanged by rule grouping.

## 10.3 Share and replay

Player rule grouping is derived from the authoritative result. Do not add UI disclosure state or graph visibility state to target/request fingerprints.

If a serialized result includes craft-plan presentation, version it only if required for compatibility. Preserve decoding of Phase 3I/3H shares and required-only targets.

## 10.4 Export and bug report

Exports and bug reports retain full exact evidence:

- exact state identities;
- original policy explanation;
- player rules;
- grouping/reconciliation evidence;
- exception derivation;
- Constellation graph data;
- certification/withholding reasons.

The default UI's use of `junk` must not erase exact identities from diagnostic artifacts.

---

# 11. Suggested Code Boundaries

Keep policy truth in the crafting-engine explanation/craft-plan layer.

Suggested additions or extractions:

```text
crafting-engine/.../playerModifierRole.ts
crafting-engine/.../playerCraftRuleCompiler.ts
src/components/PlayerCraftRuleCard.tsx
src/components/SimpleCraftInstructions.tsx
```

Exact paths should follow the current craft-plan/explanation ownership found during implementation.

Rules:

- `CraftOptimizer.tsx` consumes certified rules; it does not group states itself;
- the compiler consumes authoritative `PolicyExplanationRule`/craft-plan evidence;
- modifier-role helpers use canonical target requirement identity;
- junk classification never changes solver state identity;
- UI labels are produced from structured fields, not parsed technical prose;
- existing `OptimizerDisclosure` remains for the four research disclosures;
- Constellation is removed from disclosure ownership without changing `MarkovConstellation` internals.

---

# 12. Preservation Requirements

Phase 3J must preserve:

- Phase 3I import-first setup and compact target/settings behavior;
- Phase 3I Recommendation, How to craft it, and Shopping list primary hierarchy;
- four remaining accessible disclosure controls and disclosure-state isolation;
- Phase 3H one-way handoff detachment and source-value ownership;
- Phase 3G required-plus-acceptable target semantics and union terminal probability;
- Phase 3F authoritative decision scopes, exact rule indices, reconciled cohorts, real Promote action set, and Rare Exalt-versus-Scour contrasts;
- Phase 3F graph-overlay gesture exclusion and text selection;
- Phase 3E Constellation layout, selection, rerouting, replay, and reset;
- Phase 3D request-local incumbent monotonicity and budget ledger;
- corrected unequal-work `HOST_RESERVE` diagnostic semantics;
- Phase 3B probabilities and executable self-fracture mechanics;
- approximate-mechanics disclosures for Transmutation/Alteration and Harvest;
- canonical state/target identity;
- market-independent acquisition ranking;
- no hardcoded winners or Craft-specific branches.

Phase 3J intentionally supersedes only these Phase 3I presentation assertions:

- research disclosure count changes from five to four;
- Strategy visualization is no longer closed by default;
- Constellation no longer defers first mount;
- completed-result default-visible groups now include Constellation.

Update retained gates to express the new contract without deleting their graph/data/interaction assertions.

---

# 13. Quality Lab Phase 3J Contract

Add focused direct, Worker, and real-browser gates.

| Gate | Required proof |
|---|---|
| J1 | Every explicit state modifier is classified exactly once as required target, acceptable target, or junk |
| J2 | Every non-target modifier is player-facing junk; default rule cards do not enumerate exact junk names |
| J3 | Safe, blocking, last-slot, and fractured junk classifications are contextual and reconcile with target access/fracture evidence |
| J4 | Player-rule groups are action-homogeneous, recovery-homogeneous, non-overlapping, and complete over reachable source rules |
| J5 | Same rarity/progress/shape states with different actions remain separated by a truthful junk predicate or minimal exception |
| J6 | Minimal exceptions exactly cover action differences and do not create one card per exact state/modifier |
| J7 | Every default instruction uses visible `WHEN`, `USE`, and `THEN`; prohibited vague policy-dependent prose is absent |
| J8 | Alteration, Augmentation, Regal, Exalt, Annul, Scour, Transmute/acquisition when selected, and Finish rules are represented only with positive policy evidence |
| J9 | Annul, Scour, fracture, and reacquisition outcomes retain exact state-dependent recovery mapping |
| J10 | Required and acceptable progress remain separate; acceptable modifiers are never labeled junk |
| J11 | Uncertified, overlapping, unreconciled, or unknown-action rule sets withhold Simple Craft Instructions |
| J12 | Copy Playbook contains the certified simple rulebook and one-time caveats; Shopping list remains byte-equivalent |
| J13 | Export/share/replay/bug report preserve exact identities and evidence regardless of normal-guide simplification |
| J14 | Advanced policy evidence retains Phase 3F scope, rules, counts, visits, examples, and reconciliation without inline repetition |
| J15 | Constellation is visible and mounted whenever graph data exists, with no disclosure/`aria-expanded` ancestor |
| J16 | Constellation drag, keyboard nudge, selection, rerouting, layout persistence, replay, reset, Fit All, overlays, and text selection remain green |
| J17 | Desktop, 390px, and 420px result pages have no horizontal overflow; fresh/setup heights remain Phase 3I-equivalent |
| J18 | Retained Phase 3B-3I, handoff, alternative-target, decision-fidelity, overlay, manual-layout, share/export, and budget-isolation gates close green under the superseding presentation contract |

## 13.1 Frozen semantic contrast controls

Retain a field-derived contrast where the same coarse shape/progress selects different actions. Prove that:

- exact states are not incorrectly merged;
- default cards say `junk` rather than printing every junk identity;
- a compact safe/blocking or exception predicate tells the player which action applies;
- represented counts and visits sum to the authoritative Phase 3F evidence;
- the player condition maps back to exact source policy rule indices.

The known Magic Regal-versus-Alter and Rare Exalt-versus-Annul/Scour contrasts are suitable evidence, but production logic must remain fixture-independent.

## 13.2 Browser evidence

The focused browser gate must verify:

- simple guide orientation and target/junk legend;
- strict action cards;
- no visible represented-state/expected-visit dumps in the normal guide;
- minimal exception readability;
- rule priority and outcome/recovery text;
- Copy Playbook output;
- Advanced policy evidence traceability;
- always-visible Constellation before any disclosure interaction;
- all Phase 3E/3F graph interactions;
- four remaining research disclosures;
- no console, page, or network errors;
- no desktop/mobile horizontal overflow.

## 13.3 Negative controls

Prove that Phase 3J does not:

- merge different selected actions because both states contain junk;
- label an acceptable alternative as junk;
- hide an exact identity from export/bug evidence;
- publish an instruction from approximate/unreconciled text alone;
- claim Exalt guarantees a target;
- claim Annul removes only junk;
- return every fractured Scour outcome to Normal;
- invent Harvest, Fracturing, or Crafting Bench actions;
- place Constellation back behind a controlled or native disclosure;
- allow Constellation mounting to trigger Worker traffic, search, handoff detachment, or layout reset.

---

# 14. Execution Order

## 14.1 Pre-edit

1. Pull `origin/main` and verify `b9d76af62d8ee5097d2a2ac41d3cc3863cffafad` or document a newer baseline.
2. Read this plan in full.
3. Read the Phase 3F, Phase 3G, Phase 3H, and Phase 3I plans/completion reports relevant to decision evidence and presentation.
4. Trace `PolicyExplanationRule` through craft-plan construction, Decision details, copy/export, and Quality Lab.
5. Record the exact current Promote and Rare finishing cohorts.
6. Capture before-state guide and Constellation browser evidence.
7. Run impact recommendation and record selected gates.

## 14.2 Implementation sequence

1. Add canonical modifier-role and contextual junk classification.
2. Add the authoritative player-rule compiler and certification diagnostics.
3. Prove grouping/reconciliation with direct and Worker gates before changing UI.
4. Replace chronological vague steps/inline Decision details with Simple Craft Instructions.
5. Add strict action cards, target/junk legend, recovery outcomes, and minimal exceptions.
6. Update Copy Playbook and preserve complete export/bug evidence.
7. Consolidate exact Decision details into Advanced policy evidence.
8. Remove Constellation from `OptimizerDisclosure` and render it as an always-visible top-level section.
9. Update Phase 3I information-architecture constants from five disclosures to four plus visible Constellation.
10. Update browser harness navigation without deleting retained graph/evidence assertions.
11. Run J1-J18 and retained focused gates.
12. Run DEV once and RELEASE once.
13. Write the completion report from observed evidence.
14. Commit, push, deploy, and live-verify.

## 14.3 Required commands

```bash
npm run build
npm run lint
npm run lab:typecheck
git diff --check
npm run -- lab:recommend -- --base b9d76af62d8ee5097d2a2ac41d3cc3863cffafad --head HEAD
npm run lab:dev
npm run lab:release
```

Run focused Phase 3J/direct/Worker/browser and retained gates before DEV/RELEASE. Run DEV once and RELEASE once on stable product source. Do not add or run unit tests. Do not run EXTENDED, nightly, long-soak, the legacy 115-gate suite, or legacy release matrices without a separately documented finding.

## 14.4 Diff hygiene

Before commit:

- inspect all changed files;
- confirm exact identities remain in engine/export evidence;
- confirm no UI string parsing determines player rules;
- confirm no one-card-per-junk-state explosion;
- confirm every rule and recovery path is certified;
- confirm prohibited vague phrases are absent from the normal guide;
- confirm Constellation has no disclosure ancestor;
- confirm Phase 3I fresh/setup compaction is unchanged;
- confirm generated Quality Lab reports are not tracked;
- confirm no mechanics, action legality, policy, ranking, topology, or canonical identity changed.

---

# 15. Acceptance Criteria

Phase 3J is complete only when:

1. the normal guide tells the player exactly when to Alter, Augment, Regal, Exalt, Annul, Scour, and use any other selected physical action;
2. every action card uses `WHEN -> USE -> THEN` and contains player-inspectable conditions;
3. every unwanted explicit modifier is called junk in the normal guide;
4. exact junk identities are grouped by safe/blocking/last-slot/fractured mechanics or a minimal exception rather than repeated combinations;
5. states selecting different actions are never falsely merged;
6. every reachable source policy state matches exactly one certified player rule or terminal rule;
7. required and acceptable targets remain distinct and are never labeled junk;
8. recovery after random actions is state-dependent and honest;
9. Exalt and Annul instructions do not imply guaranteed favorable outcomes;
10. inline per-step Decision details no longer dominate the guide;
11. consolidated Advanced policy evidence retains complete Phase 3F traceability;
12. Copy Playbook contains the simple rules while export/bug artifacts retain exact evidence;
13. Constellation is always visible when available and is not under any dropdown/disclosure;
14. all Phase 3E/3F Constellation interactions and layout evidence remain intact;
15. Phase 3I import/setup compaction, responsive behavior, and four remaining disclosures remain correct;
16. no mechanics, probabilities, action legality, policy selection, ranking, topology, state identity, target identity, or hardcoded winner changes;
17. J1-J18, retained focused gates, build, lint, typecheck, diff hygiene, DEV, and RELEASE satisfy the documented acceptance outcome;
18. implementation/report are committed to `main`, GitHub Pages succeeds, and uncached live HTML/bundle are verified at the final SHA.

---

# 16. Completion Report

Create:

```text
docs/crafting-engine/PHASE3J_STRICT_PLAYER_CRAFT_INSTRUCTIONS_JUNK_GROUPING_AND_VISIBLE_CONSTELLATION_COMPLETION_REPORT.md
```

The report must include:

- baseline, implementation, closeout, and final deployed SHAs;
- exact files changed;
- modifier-role and junk-classification contract;
- player-rule grouping signature and certification conditions;
- before/after guide examples;
- exact action rule counts by Alter/Augment/Regal/Exalt/Annul/Scour/other;
- source-state/rule/count/visit reconciliation;
- minimal-exception evidence;
- required-versus-acceptable target evidence;
- recovery and terminal coverage;
- Copy Playbook and export/bug-report comparisons;
- Advanced policy evidence traceability;
- proof that Constellation has no disclosure ancestor and is initially visible;
- Phase 3E/3F graph interaction results;
- desktop, 390px, and 420px screenshots/overflow evidence;
- J1-J18 results;
- retained Phase 3B-3I results, including intentional supersession of Phase 3I's five-disclosure assertion;
- build, lint, typecheck, diff hygiene, DEV, and RELEASE counts/durations;
- historical failures and focused closures without rewriting suite history;
- explicitly unrun suites;
- workflow/job/deployment/status IDs;
- final live HTML/bundle status, asset name, release marker, strict-rule labels, junk labels, visible Constellation marker, and absence of prohibited vague wording.

Do not claim that junk modifiers are mechanically interchangeable. Do not claim global optimality when not proven. Do not claim a performance improvement without measurements.

---

# 17. Copy/Paste Implementation Prompt

```text
Implement Phase 3J in jpitty03/cluster-jewel-research from main.

The source of truth is:
docs/crafting-engine/POST_PHASE3I_FIELD_REVIEW_AND_PHASE3J_STRICT_PLAYER_CRAFT_INSTRUCTIONS_JUNK_GROUPING_AND_VISIBLE_CONSTELLATION_PLAN.md

Read that plan and the relevant Phase 3F, 3G, 3H, and 3I plans/completion reports in full before editing. Follow Phase 3J exactly.

Replace the current vague chronological craft prose and repeated inline Decision details with certified Simple Craft Instructions. Every actionable rule must use strict WHEN -> USE -> THEN wording and tell the player exactly when to Alter, Augment, Regal, Exalt, Annul, Scour, or use another selected physical action, followed by the correct re-check/recovery instruction.

Anything that does not contribute to a required or acceptable target is player-facing junk. Group exact states using semantic junk categories: safe for this rule, blocks a missing target, occupies the last compatible slot, or fractured. Do not generate one card per junk modifier/state. Use exact junk names only as a minimal exception when no truthful compact mechanical predicate separates different actions. Never merge states that select different actions or recovery paths.

Keep exact modifier IDs, source states, policy rule indices, represented counts, expected visits, probabilities, and reconciliation in authoritative engine/export evidence. Move complete technical Decision details into one Advanced policy evidence section under Research diagnostics. Copy Playbook should output the simple target/junk legend and WHEN/USE/THEN rules; export and bug reports must retain full exact evidence.

Remove the PolicyFlow Constellation from Strategy visualization/OptimizerDisclosure. Whenever graph data exists, render Constellation as an always-visible, always-mounted top-level result section after Shopping list and before the four remaining research disclosures. Preserve every Phase 3E/3F graph behavior: manual layout, selection, keyboard nudge, edge rerouting, persistence, replay, reset, Fit All, overlay gesture exclusion, and text selection.

Preserve Phase 3I import-first setup and responsive compaction, Phase 3H handoff detachment/value ownership, Phase 3G required-plus-acceptable semantics, Phase 3F authoritative cohorts and Rare contrasts, corrected HOST_RESERVE diagnostics, canonical identities, mechanics, policy selection, and market-independent ranking. Do not add hardcoded winners, Craft-specific grouping, mechanics changes, or unit tests.

Add Phase 3J J1-J18 direct/Worker/browser gates. Run build, lint, Quality Lab typecheck, diff hygiene, impact recommendation, focused/retained gates, DEV once, and RELEASE once. Do not run unit tests, EXTENDED, nightly, long-soak, the legacy 115-gate suite, or legacy release matrices unless an implementation finding independently requires and documents one.

Create the specified Phase 3J completion report from observed evidence. Commit and push the implementation/report to main, verify GitHub Pages at the final SHA, and return implementation/closeout commits, validation counts/durations, explicitly unrun suites, workflow/job/deployment/status IDs, and live uncached verification.
```
