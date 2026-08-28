# Post-Phase 3E Field Review and Phase 3F Plan

## Craft-Plan Decision Fidelity and Constellation Detail Interaction

Status: **READY FOR IMPLEMENTATION**

Baseline reviewed: `e33f6bf50e200a02d353a64eec7fed12ee97da43` on `main`.

Phase 3E is **CLOSED / PASS / DEPLOYED**. Preserve its manual Constellation layout behavior. Phase 3F is a focused presentation-fidelity and interaction-correctness phase; it must not alter crafting mechanics, transition probabilities, Bellman values, policy identity, ranking, acquisition synthesis, or state identity.

No unit tests are to be added or run. Use the Phase 3A targeted / DEV / RELEASE workflow. EXTENDED, nightly, long-soak, and the legacy 115-gate matrix remain manual-only and are not Phase 3F acceptance requirements.

---

# 1. Field Findings

The current Minion three-notable field request is:

```text
Base:           Large Cluster Jewel
Cluster type:   Minions deal 10% increased Damage
Item level:     84
Passives:       8
Targets:
  Primordial Bond
  Renewal
  Rotten Claws
Objective:      CHEAPEST_CHAOS
Budget:         NORMAL — 5,000 states / 30s / 3 rounds
Selected route: Self-fracture Primordial Bond
Selected U:     1459.7923662160777c
```

The selected PolicyFlow is certified and internally reconciled. The field defect is in the **written craft-plan explanation**, not in the selected route itself.

The player-facing step currently says:

```text
Promote the keepable Magic states
Use Regal Orb only for the one-target Magic states the selected policy promotes;
otherwise continue rolling.
```

but its Decision details render one apparent common state cohort:

```text
rare 0P/0S states with the same target progress choose different actions...
```

and then place all of these actions under that single heading:

```text
Alteration       208 represented states / 323.681 visits
Augmentation      13 represented states / 82.920 visits
Transmutation      1 represented state  / 4.000 visits
Fracturing Orb     1 represented state  / 4.000 visits
Regal              1 represented state  / 4.000 visits
Exalted Orb         1 represented state  / 4.000 visits
Reacquire           1 represented state  / 3.000 visits
Scour               1 represented state  / 1.000 visit
```

The counts are based on real selected-policy activity, but they do **not** describe one comparable `rare 0P/0S` decision state.

The current examples also produce the impossible phrase:

```text
no target modifier present; all target modifiers present
```

That is presentation evidence corruption and must fail closed instead of being shown to a player.

---

# 2. Frozen Ground Truth for the Field Fixture

Use the current field request above as the primary Phase 3F acceptance fixture.

The authoritative selected PolicyFlow shows the acquisition-preparation state/action structure below.

## 2.1 Initialization

```text
Transmute
Normal · prep 0/1 · 0 affixes
1 macro state
~4.000 expected visits
```

This is not Rare and must not be described as a Rare promotion decision.

## 2.2 Rolling states

Alteration contributes two acquisition Magic macro contexts:

```text
Magic · prep 0/1 · 2 affixes
192 exact states
~242.761 expected visits

Magic · prep 0/1 · 1 suffix
16 exact states
~80.920 expected visits
```

Together these explain the current aggregate:

```text
208 represented states
~323.681 expected visits
```

These counts are legitimate, but their examples must remain Magic and must describe their actual affix context.

## 2.3 Fill states

Augmentation contributes two acquisition Magic macro contexts:

```text
Magic · prep 0/1 · 1 prefix
12 exact states
~81.920 expected visits

Magic · desired preparation suffix present · 1 affix
1 exact state
~1.000 expected visit
```

Together:

```text
13 represented states
~82.920 expected visits
```

Again: Magic, not Rare.

## 2.4 Promotion state

The actual Regal preparation state is:

```text
Magic · desired preparation mod present · 2 affixes
1 exact state
~4.000 expected visits
```

Representative physical state:

```text
prefix Hale
suffix Primordial Bond
```

This is the actual state that belongs directly to the `PROMOTE` action.

## 2.5 Acquisition finish and fracture states

These are separate later phases, not Magic promotion states:

```text
Exalt
Rare · 3 affixes
1 state / ~4.000 visits

Fracture
Rare · 4 affixes
1 state / ~4.000 visits

Reacquire
Rare · wrong fracture outcome
1 state / ~3.000 visits

Scour
Rare · desired Primordial Bond fractured
1 state / ~1.000 visit
```

They must not be flattened into the same `Promote the keepable Magic states` cohort.

---

# 3. Important Implementation Observation

Do not patch this by merely hiding action names in React.

`craftPlan.ts` already classifies actions by authoritative mechanic phase:

```text
Transmutation -> INITIALIZE
Alteration    -> ROLL
Augmentation  -> FILL
Regal         -> PROMOTE
Exalt/Annul   -> FINISH
Scour/Reacq   -> RECOVER
Fracture      -> ACQUIRE
```

It also builds conflict groups from a `coarseContextKey` that already includes:

```text
rarity
prefixCount
suffixCount
matchedTargetModIds
unmatchedTargetModIds
influenced
synthesised
acquisitionMenu
```

Therefore, the field output is a strong signal that either:

1. acquisition `PolicyExplanationRule.context` is being flattened or synthesized incorrectly before `decisionGroups()` sees it;
2. decision-group phase assignment is attaching an over-broad conflict group to the wrong focal step;
3. the UI is selecting one group's summary/example while rendering options from a broader set;
4. or a combination of the above.

Phase 3F must identify the exact source of the corruption and repair the evidence contract at the earliest authoritative layer. Do not paper over malformed policy explanation context with a Craft-specific display filter.

---

# 4. Decision-Detail Semantic Contract

Decision details exist to answer:

> “For states that are meaningfully comparable at this point in the craft, why does the selected policy choose different actions depending on the exact current item?”

They are **not** a dump of every positive action used somewhere in the route.

## 4.1 Every decision group must have an explicit cohort identity

Extend or formalize `CraftPlanDecisionGroup` so the group can prove the common context it claims. The exact schema is implementation-defined, but evidence should be sufficient to establish at minimum:

```text
policy scope: ACQUISITION / DOWNSTREAM
rarity cohort
progress semantics
represented exact rule indices
whether prefix/suffix counts are common or variable
focal craft-plan phase
```

Do not derive player-facing cohort semantics from an arbitrary first option after aggregation.

## 4.2 Comparable alternatives may cross action phases when that is genuinely explanatory

Do **not** implement the simplistic rule:

```text
PROMOTE decision details may contain Regal only
```

That would remove useful policy explanation.

For example, under `Promote the keepable Magic states`, it can be useful to explain that comparable **Magic acquisition-preparation states** choose:

```text
Regal      when the exact Magic state is keepable/promotable
Alter      when that Magic state should continue rerolling
Augment    when an open Magic affix should be filled first
```

Those are meaningful alternatives because they operate on the same broad Magic-stage decision space.

However, the same group must **not** include:

```text
Transmute  (Normal input)
Exalt      (Rare input)
Fracture   (Rare acquisition finish)
Scour      (Rare recovery)
Reacquire  (Rare recovery/restart)
```

because they are not comparable Magic promotion decisions.

This rule must be generic and state-derived, not based on this craft's action names.

## 4.3 Promote acceptance expectation

For the frozen field fixture, the player-facing Promote decision explanation should be conceptually equivalent to:

```text
Decision details

Acquisition-preparation Magic states at this preparation progress choose
between continuing the Magic roll and promoting a keepable state based on
exact current affixes.

- Orb of Alteration
  208 represented states · ~323.681 expected visits
  Example must be an actual Magic Alter state.

- Orb of Augmentation
  13 represented states · ~82.920 expected visits
  Example must be an actual Magic Augment state.

- Regal Orb
  1 represented state · ~4.000 expected visits
  Example: Magic — prefix Hale; suffix Primordial Bond.
```

Exact wording may improve, but the semantic boundary must match the actual policy states.

`Transmute`, `Fracture`, `Exalt`, `Scour`, and `Reacquire` must not appear inside this Promote decision cohort.

## 4.4 Finish/recovery comparisons remain allowed where state-comparable

The next step currently demonstrates a valid type of contrast:

```text
Rare finishing states with the same target progress
  -> Exalt in some exact states
  -> Scour in other exact states
```

Do not destroy that useful behavior by enforcing same-action-phase-only grouping.

The correct abstraction is **comparable item-state cohort**, not “all options must share the focal action's taxonomy phase.”

---

# 5. Example Fidelity Contract

Every rendered Decision-detail option must point to an actual `PolicyExplanationRule` in `policyRuleIndices` and generate its example from that rule's exact context.

Add generic invariant validation before player-facing serialization/rendering.

At minimum:

```text
rendered rarity == source rule rarity
rendered prefix count == source rule prefixCount
rendered suffix count == source rule suffixCount
matched target IDs and missing target IDs are disjoint
matched + missing target IDs reconcile with the target definition
an example cannot say both “no target present” and “all targets present”
fractured flags shown in the example match the source affixes
action shown for the option == source selected action
representedStateCount == sum of represented states in option rule indices
expectedVisits == sum of expected visits in option rule indices
```

If a compressed decision group spans variable prefix/suffix counts, its group summary must say so rather than inventing a single `0P/0S`, `1P/2S`, etc. label.

If evidence cannot be reconciled, **withhold the group and expose a diagnostic reason**. Never fabricate or silently normalize contradictory state text.

---

# 6. Acquisition Preparation Scope Must Stay Distinct From Final Craft Progress

Phase 3D established separate Constellation semantics for:

```text
self-fracture preparation progress
final craft target progress
```

The written craft plan must now honor the same distinction.

For acquisition synthesis, do not phrase the preparation target context as though it is already the three-target downstream objective.

Prefer explicit language such as:

```text
Preparation target: Primordial Bond
Prep progress: 0/1 or 1/1
```

Then after the certified handoff:

```text
Final targets: Primordial Bond + Renewal + Rotten Claws
Final progress: 1/3, 2/3, 3/3
```

Do not generate contradictory copy such as:

```text
no target modifier present; all target modifiers present
```

from mixed preparation/final-target semantics.

---

# 7. Advanced Details Must Be Authoritative, Not a Placeholder Escape Hatch

The text:

```text
207 more exact cases are retained in Advanced optimizer details
```

must be true in a useful sense.

When expanded, Advanced details must let the user inspect the real underlying policy evidence supporting the compressed option, including enough context to distinguish why actions differ.

At minimum preserve/access:

```text
rule/state identity
rarity
prefixes/suffixes
fractured flags
matched/missing target context
selected action
represented-state count
expected visits
```

The default UI may summarize, but the advanced evidence must not repeat the same malformed generic example for every option.

---

# 8. Companion Phase 3E.1 Interaction Fix: Constellation Detail Overlay

The field review also found one small Phase 3E interaction defect.

Clicking a node correctly opens its detail overlay, but clicking:

```text
Technical modifier details
Technical policy evidence
```

causes the overlay to close.

The current overlay is rendered inside the Constellation viewport. Pointer events from `<details>`, `<summary>`, text, future links/buttons, etc. bubble into the graph viewport gesture handler and can be interpreted as an empty-graph click/pan gesture.

Fix this generically by making graph-owned interactive UI an exclusion zone from viewport gesture initiation.

Desired behavior:

```text
Click graph node                -> open node details
Interact anywhere in overlay   -> keep details open
Open/close <details>            -> keep overlay open
Select/copy technical text      -> keep overlay open
Click ×                         -> close
Press Escape                    -> close
Click actual empty graph        -> close
Click another node/edge         -> replace selected details
```

Apply the same exclusion rule to the edge detail overlay.

Do not tie overlay lifetime to DOM focus/blur.

Preserve Phase 3E node dragging, panning, layout lock/unlock, persistence, keyboard nudging, and Reset Layout behavior.

---

# 9. Diagnostics and Evidence

Create `diagnostic:phase3f` with focused generic checks.

Required controls:

## F1 — Frozen Minion 3-banger route identity

Confirm the fixture still resolves to a valid executable policy under current timing. Do not require the route winner by hardcoded production behavior; diagnostic assertions may freeze the expected field fixture as regression evidence.

## F2 — Promote cohort fidelity

For the frozen selected self-fracture Primordial policy, prove the Promote decision group:

```text
scope = acquisition preparation
cohort rarity = Magic
contains Regal evidence
may contain comparable Alter/Augment evidence
contains no Normal/Rare-only action states
```

Explicitly fail if Transmute, Exalt, Fracture, Scour, or Reacquire is represented as a Magic Promote alternative.

## F3 — Exact aggregate reconciliation

Prove the current field totals reconcile from exact rules:

```text
Alter      208 represented states / ~323.681 visits
Augment     13 represented states / ~82.920 visits
Regal        1 represented state  / ~4.000 visits
```

Tolerances must account only for floating-point accumulation, not semantic mismatch.

## F4 — Example consistency

For every decision option in the fixture:

```text
rarity reconciles
prefix/suffix counts reconcile
matched/missing target sets reconcile
fracture status reconciles
selected action reconciles
```

No contradictory target sentence is permitted.

## F5 — Finish contrast preservation

Prove comparable Rare finishing states can still show a meaningful Exalt-vs-Scour decision when exact affixes differ.

## F6 — Preparation vs final-target wording

Prove acquisition decision text uses preparation scope while downstream decision text uses final target scope.

## F7 — Generic non-fracture control

Use at least one clean/non-fracture policy to prove the fix is not specific to self-fracture acquisition.

## F8 — Harvest/specialized retention

Use an existing Harvest-capable fixture to prove decision grouping remains taxonomy-safe and does not invent Harvest evidence.

## F9 — Constellation detail overlay interaction

Real-browser evidence:

```text
select node
open Technical policy evidence
assert node detail remains present
open Technical modifier details when available
assert remains present
interact/select text inside overlay
assert remains present
click empty graph
assert closes
```

Repeat the relevant technical-details interaction for an edge overlay.

## F10 — Phase 3E manual-layout retention

Move a node, verify live edge reroute/persistence, interact with its detail overlay, and prove the manual layout is unchanged after opening/closing technical details.

---

# 10. Browser Acceptance

Add a focused real Playwright Phase 3F gate using the actual built app and Worker where applicable.

The browser fixture must inspect the rendered `How to craft it` section, not only direct service objects.

Required rendered assertions for Promote:

```text
heading/instruction says Magic promotion
Decision details does not say “rare 0P/0S” for the mixed Magic cohort
Alter example is Magic
Augment example is Magic
Regal example is Magic
Transmute absent from Promote cohort
Fracture absent from Promote cohort
Exalt absent from Promote cohort
Scour absent from Promote cohort
Reacquire absent from Promote cohort
no “no target modifier present; all target modifiers present” contradiction
```

Also inspect the `Try to finish the missing target` decision block and prove the Exalt/Scour contrast remains correctly represented from actual Rare states.

---

# 11. Validation Sequence

Do not repeatedly run RELEASE.

Use this order:

1. `npm run build`
2. `npm run lint`
3. typecheck / existing static checks
4. `git diff --check`
5. `npm run diagnostic:phase3f`
6. focused craft-plan Decision-details browser gate
7. focused Constellation detail-overlay interaction gate
8. relevant Phase 3D/3E retention gates
9. DEV once
10. RELEASE once after source stabilizes
11. mature/relevant diagnostics that are green on the unchanged baseline

If RELEASE fails, rerun only the failing gate/shard while fixing it. Run one final RELEASE after the source fix stabilizes.

Do not run EXTENDED/nightly/legacy unless a new source change independently requires that level of evidence.

---

# 12. Completion Report

Write:

`docs/crafting-engine/PHASE3F_CRAFT_PLAN_DECISION_FIDELITY_AND_CONSTELLATION_DETAIL_INTERACTION_COMPLETION_REPORT.md`

It must include:

- exact root cause of the over-broad/malformed Promote Decision group;
- whether corruption originated in `PolicyExplanationRule` generation, grouping, rendering, or multiple layers;
- before/after Promote group evidence;
- exact aggregate rule reconciliation;
- proof that examples derive from real rule context;
- proof that preparation vs final-target semantics remain distinct;
- Finish Exalt/Scour contrast preservation;
- non-fracture and Harvest controls;
- Constellation technical-details overlay fix and browser evidence;
- Phase 3E drag/persistence retention;
- DEV/RELEASE counts and wall times;
- any unrelated baseline failures reproduced without source changes;
- final deployment run and deployed SHA.

---

# 13. Permanent Invariants

Phase 3F must preserve all existing project contracts:

- no unit tests;
- no hardcoded route winner;
- no Craft-specific solver branch;
- no mechanics probability changes;
- no action legality changes;
- no weakened canonical state identity;
- no pre-fractured market ranking;
- no fabricated prices;
- no fabricated target progress;
- no invented action evidence;
- selected-policy validity remains distinct from global optimality;
- preparation acquisition and downstream crafting remain separate additive scopes;
- Phase 3B fractured-Magic Alteration fidelity remains intact;
- Phase 3C known-policy admissibility/incumbent propagation remains intact;
- Phase 3D budget isolation and stage-aware mechanic evidence remain intact;
- Phase 3E manual Constellation geometry remains presentation-only.

The goal is not to make the craft guide simpler by hiding complexity. The goal is for every sentence, example, count, and alternative shown to the player to be traceable to the exact selected-policy states it claims to explain.
