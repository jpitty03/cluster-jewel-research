# Post Phase 2H Review and Phase 2I Chronological Craft Plan UI

## Status / Source of Truth

Live `main` reviewed at:

- `58aa2699122663243227e4ee83086babec7cd41e` — Phase 2H completion report
- implementation beneath it: `5665c9206b57b06f795f14b5caa4f728656e9f2a`

Primary completion evidence:

- `docs/crafting-engine/PHASE2H_ADMISSIBLE_BOUNDS_PROOF_SCALING_COMPLETION_REPORT.md`
- `output-phase2h-herald-diagnostic.txt`
- `output-browser-phase2h-smoke.txt`
- `output-browser-phase2g-smoke.txt`
- the real Herald craft browser/PDF supplied after Phase 2H

No unit-test work is requested.

---

# Executive Verdict

## Phase 2H: PASS

Phase 2H fixed the important proof/search problems it was intended to solve.

The reviewed completion evidence shows:

- mechanics-aware admissible self-fracture lower bounds are now explicit and decomposed;
- the admissibility audit passes `10/10` controlled certified states with zero violations;
- normal-price fracture families can be safely dominated without pretending they were fully resolved;
- the intentionally cheap-fracture fixture remains provisional when its admissible lower bound can beat the clean incumbent;
- the forced-Rare two-mod fixture becomes acquisition-safe without wasting the old acquisition search budget;
- the real Empowered Envoy + Endbringer Herald fixture now resolves from the default `RECOMMEND` path quickly instead of requiring the old manual retry merely to find any route;
- `NO_RESOLVED_ROUTE` no longer exposes ordinary expected-material rows from an uncertified policy;
- policy-condition collisions were removed without target-specific solver branches;
- build, lint, browser/worker, fracture/Harvest parity, Craft A, and Craft C regressions remain healthy;
- pre-fractured purchases and standard Crafting Bench notable creation remain excluded.

The Phase 2H search/proof work should therefore remain intact.

## New product issue exposed by the successful fix

Phase 2H solved the **correctness ambiguity** in the branch guide by adding enough exact state detail to distinguish branches that choose different actions.

That was the right correctness fix, but it made the default player experience much too verbose.

The real Herald output now expands into many pages of cards such as:

```text
magic 0P/1S; no target modifier present;
exact affix state: +Strength
-> Augment

magic 0P/1S; no target modifier present;
exact affix state: +Dexterity
-> Alteration

magic 0P/1S; no target modifier present;
exact affix state: +Intelligence
-> Alteration

...
```

and then repeats the same pattern for many filler suffixes and for each target notable.

This is proof-honest but is no longer a usable default crafting guide.

The attached real output is approximately thirteen pages, with most of the page count coming from exact Bellman-policy state cases rather than from the human crafting procedure.

The next phase should **not undo Phase 2H disambiguation**. The exact branch policy is valuable and must remain available.

Instead, Phase 2I should add a second presentation layer:

> **a compact chronological crafting playbook derived from the selected policy, with the exact branch policy moved behind progressive disclosure.**

---

# Important Semantic Correction

The desired UI should feel chronological, but the optimizer policy is a cyclic state machine, not literally a single linear recipe.

Therefore the default guide should be called something like:

```text
Crafting plan
```

or:

```text
Crafting loop
```

rather than implying that every craft follows one exact deterministic sequence.

Recommended helper copy:

> This is a condensed playbook from the selected optimizer policy. Follow the steps in order, repeat the recovery loop on misses, and expand decision details when the exact current affixes matter.

The service/UI must never fabricate a linear path that the returned policy does not support.

---

# Real Herald Fixture — Desired Player Mental Model

Fixture:

```text
Medium Cluster Jewel
10% increased Damage while affected by a Herald
ilvl 84
6 passives

Targets:
- Endbringer
- Empowered Envoy

Final rarity: Any
Extra affixes: Allowed
```

At a high level, the successful policy is understandable as approximately:

```text
Acquire clean base
    ↓
Transmute
    ↓
Alter until one target notable is present in a keepable magic state
    ↓
Augment when the magic item needs its second affix
    ↓
Regal when the current one-target magic state is worth promoting
    ↓
If Rare still has one target and an open target-side slot, Exalt
    ↓
If the Rare miss cannot progress, Scour
    ↓
Repeat the rolling loop
    ↓
Stop when both target notables are present
```

This is the appropriate level of detail for the **default** UI.

However, this is deliberately not identical to the naive rule:

```text
one target present -> always Regal
```

The Phase 2H policy demonstrates that exact filler state can still change the selected action. For example, one Empowered Envoy + filler-suffix state may Regal while another otherwise similar state may Alteration-reroll.

Therefore the compact plan should say:

```text
Regal when the current one-target magic state is one the policy promotes;
otherwise continue rolling.
```

Then a compact `Decision details` disclosure can explain the exact cases.

Do not erase a real policy distinction merely to make the prose prettier.

---

# Phase 2I

> **Player-Facing Chronological Craft Plan, Policy Compression, and Progressive Disclosure**

The goal is to separate two valid representations of the same selected policy:

1. **Default player representation:** concise chronological/playbook-style crafting loop.
2. **Exact research representation:** full state-conditioned Bellman policy.

The first exists for usability.

The second remains the source of truth and the audit trail.

No solver mechanics, probabilities, state identity, acquisition ranking, or action legality should change merely to produce this UI.

---

# Priority 1 — Add a Structured Craft-Plan Presentation Model

Do not build the new UI by concatenating ad-hoc strings inside React.

Create a pure presentation transformation from the returned **selected certified policy** into a structured craft plan.

A service-layer representation is preferred because it keeps the interpretation reusable across browser/UI consumers, but a well-isolated presentation module is acceptable if it remains deterministic and testable through the existing diagnostics.

Possible shape:

```ts
interface CraftPlanSummary {
  status: 'CERTIFIED' | 'UNCERTIFIED';
  startingPoint: string;
  steps: CraftPlanStep[];
  recovery?: CraftPlanRecovery;
  detailedDecisionCount: number;
  provenance: string;
}

interface CraftPlanStep {
  id: string;
  phase:
    | 'ACQUIRE'
    | 'INITIALIZE'
    | 'ROLL'
    | 'FILL'
    | 'PROMOTE'
    | 'FINISH'
    | 'RECOVER'
    | 'SUCCESS';
  title: string;
  instruction: string;
  actionIds: string[];
  targetProgressBefore?: number;
  targetProgressAfter?: number;
  decisionDetails?: CraftPlanDecision[];
}
```

Exact naming is implementation-dependent.

The important contract is:

- every displayed action comes from the actual selected policy/acquisition;
- every important selected action family is represented;
- target-progress statements come from represented policy state, not desired-target guesses;
- recovery steps come from actual recovery actions;
- self-fracture acquisition, when selected, is represented from the actual acquisition synthesis rather than a hand-written recipe;
- uncertified/no-route results do not receive a normal craft plan.

---

# Priority 2 — Replace Default Branch-Card Flood With a Compact Crafting Plan

For a certified recommendation, default-visible UI should become approximately:

```text
How to craft it

1. Acquire the base
   Start with a clean Medium Cluster Jewel.

2. Make it Magic
   Use an Orb of Transmutation.

3. Roll for a target notable
   Use Orbs of Alteration until one of your desired notables appears in a state worth keeping.

4. Fill the Magic item when needed
   Use an Orb of Augmentation when the selected policy wants a second affix.

5. Promote to Rare
   Regal the one-target Magic states the policy considers worth promoting.
   [Decision details]

6. Try to finish the missing target
   If the Rare jewel still has one target and an open appropriate slot, use the selected finishing action (for this fixture: Exalted Orb).

7. Recover from misses
   Scour failed Rare outcomes that cannot progress, then repeat the rolling loop.

8. Finish
   Stop when both target notables are present.
```

This example is a **presentation target for the Herald fixture**, not a hardcoded Herald recipe.

The implementation must derive the actual steps/actions from returned policy evidence.

## Compactness target

For the real Herald fixture:

- aim for roughly `6–9` default-visible primary steps;
- do not render dozens of exact filler-affix cards by default;
- the default `How to craft it` section should fit within a normal screen-reading workflow rather than spanning most of a 13-page PDF.

Do not impose a global hard cap that would hide materially distinct stages for other crafts.

---

# Priority 3 — Preserve Exact Decisions Behind `Decision details`

The Phase 2H exact-state disambiguation is correct and must not be discarded.

When a compact stage contains states that choose different actions, expose the distinction under a collapsed disclosure.

Example:

```text
5. Promote to Rare
Regal when the one-target Magic state is worth promoting.

▶ Decision details
  Empowered Envoy + Strength suffix -> Regal
  Empowered Envoy + Dexterity suffix -> keep rolling with Alteration
  ...
```

Do not default-expand all exact filler states.

Where many exact states make the **same** decision, summarize them by behavior rather than listing each modifier separately if that compression is semantically exact.

For example, if 14 distinct suffix states all select Alteration and no action-relevant distinction is lost:

```text
Most other one-target Magic filler suffixes -> continue with Alteration
```

The exact full state list must still remain accessible in Advanced diagnostics.

## Important safety rule

If two states that look similar to the player choose different actions, the compact plan must either:

1. state the differentiating rule accurately; or
2. say `See decision details for the exact affix cases`.

Never merge conflicting actions into one unconditional instruction.

---

# Priority 4 — Move Full Policy Branches to Advanced / Expert Disclosure

The existing exact branch cards should remain available as the audit representation, but they should no longer dominate the default craft guide.

Recommended hierarchy:

```text
Craft recommendation

How to craft it
  compact chronological/playbook summary
  compact decision disclosures only where needed

Expected materials

Advanced optimizer details
  Full exact policy branches
  acquisition proof
  Bellman / occupancy / reconciliation
  lower-bound evidence
  search diagnostics
  raw policy rules
```

A user who wants to reproduce every state-specific Bellman decision can still do so.

A normal player should not need to read dozens of T2/T3 filler suffix cases to understand the route.

---

# Priority 5 — Generic Step Synthesis Rules

The phase model must be generic and action-driven.

Suggested action-to-stage semantics may include:

```text
acquisition/restart action -> ACQUIRE
Transmutation -> INITIALIZE
Alteration / reroll family -> ROLL
Augmentation -> FILL
Regal -> PROMOTE
Exalt / targeted finishing action -> FINISH
Scour / restart-reacquire -> RECOVER
terminal target state -> SUCCESS
```

Do not assume those are the only possible future mechanics.

Prefer shared action metadata/capabilities where available instead of string matching on player-visible action names.

If a Harvest action, Fracturing Orb, Annulment, or another supported action appears in the selected policy, the stage model must keep it rather than forcing it into an Alter/Aug/Regal template.

---

# Priority 6 — Chronology From Policy Progress, Not Arbitrary Action Ordering

The policy graph contains cycles, so a normal topological ordering is impossible.

Construct the playbook around mechanically meaningful progress milestones such as:

```text
acquisition complete
rarity progression
number / identity of target modifiers matched
open target-side capacity
selected recovery boundary
terminal target satisfied
```

The ordering should describe the **crafting loop**, not pretend cycles do not exist.

A recovery step may explicitly point back to an earlier step:

```text
Scour and return to Step 2.
```

Do not generate fake chronological ordering merely by sorting action IDs, expected visits, state keys, or source-array order.

---

# Priority 7 — Distinguish `Current Best Policy` From Global Proof Without Adding Noise

Phase 2H now makes the default Herald result acquisition-safe quickly, but its completion evidence also shows deeper search can materially improve the clean-family policy cost.

That is valid: acquisition-safe means the chosen **starting family** is safe, not that the exact downstream policy is globally optimal.

The Phase 2G status copy already says this, so no redesign is required.

For the new crafting plan, retain one concise note when global policy optimality is not proven:

> This plan is the best certified policy found at the current search depth; Retry deeper may improve the expected cost or decisions.

Do not place proof registers or numeric lower bounds into the default craft steps.

---

# Priority 8 — Self-Fracture Route Presentation

If self-fracture is the selected acquisition, the compact plan must not begin as though the desired fractured base already exists.

The acquisition section should summarize the actual executable synthesis, for example:

```text
1. Create the fractured starting base
   Prepare a legal fracture candidate containing <target>.
   Use a Fracturing Orb.
   Wrong fracture -> reacquire/reprepare and retry.
   Correct fracture -> clean removable junk as required.
```

Then continue into the downstream craft plan.

Detailed preparation-state policy remains collapsed/Advanced.

No pre-fractured market-purchase path should re-enter normal ranking.

---

# Priority 9 — No-Route and Provisional Semantics

## `NO_RESOLVED_ROUTE`

Preserve Phase 2H's safety behavior:

- no normal chronological craft plan;
- no normal expected materials;
- uncertified exploratory policy evidence only under Advanced;
- tell the player to Retry deeper / adjust target.

## `PROVISIONAL_RESOLVED`

A compact plan may be displayed because it is executable, but preserve the prominent warning that a cheaper acquisition family may still exist.

Do not let the cleaner chronological UI visually erase provisional status.

---

# Required Diagnostics

## D1 — Herald compact plan

Run the exact real Herald fixture.

Report:

```text
recommendation status
expected cost
primary step count
step titles / actions
recovery target step
number of collapsed decision-detail groups
number of exact policy branches hidden by default
```

Acceptance:

- certified clean route remains healthy;
- default primary plan is compact (`~6–9` steps expected for this fixture);
- Transmute, Alteration, Augmentation, Regal, Exalt, Scour/repeat, and success semantics are represented if they occur in the returned selected policy;
- no exact filler-affix flood is default-visible.

## D2 — No fabricated actions

For every default plan step/action:

```text
actionId must exist in the selected acquisition or selected policy
```

Report zero invented actions.

## D3 — Selected-action coverage

For every distinct materially reachable selected-policy action family with positive expected visitation:

```text
represented in primary plan
OR
represented in a decision-detail/recovery group
```

Report uncovered action IDs.

Acceptance: zero unexplained selected action families.

## D4 — Conflicting branch preservation

Use the Herald states that required Phase 2H disambiguation.

Prove that:

- conflicting Regal-vs-Alteration cases are not merged into an unconditional Regal instruction;
- exact differences remain accessible under decision details/full policy;
- default guide remains compact.

## D5 — Full exact policy preservation

Assert that every `policyExplanation` entry returned by the service is still accessible under the expert/Advanced representation with its exact condition/action identity.

Do not weaken the Phase 2H collision diagnostic.

## D6 — One-mod simple craft

The compact plan should remain appropriately simple and should not manufacture unnecessary Rare/Exalt/recovery steps.

## D7 — Two-mod opposite-generation fixture

Re-run the established T1 ES + T1 Intelligence Any target.

Ensure the compact plan reflects its actual selected policy, not the Herald same-prefix template.

## D8 — Self-fracture presentation

Use an existing controlled fixture where executable self-fracture is selected or force a diagnostic pricing context where it legitimately wins.

Assert acquisition synthesis appears as part of the compact plan and wrong-fracture recovery remains visible.

## D9 — Harvest / specialized action preservation

Use the existing Harvest fixture and prove a selected Harvest action is preserved by the stage summarizer rather than silently dropped or mislabeled as a generic roll.

## D10 — No-route safety

Preserve the Phase 2H injected no-route fixture:

```text
normal craft plan: absent
normal expected materials: absent
raw exploratory evidence: Advanced only
```

---

# Regression Matrix

Preserve all relevant previous gates.

## R1 — Phase 2H H1-H8

All remain passing, including:

- default Herald resolution;
- admissible fracture domination;
- cheap-fracture proof honesty;
- no-route material safety;
- zero contradictory rendered exact-policy conditions.

## R2 — Phase 2G D1-D8

Adapt assertions for the new hierarchy without weakening semantic checks.

The full exact branch correspondence moves to the Advanced representation; the new compact-plan diagnostics own the default UI contract.

## R3 — One-mod T1 ES

Preserve economics, acquisition safety, properness, absorption, reconciliation, and fast browser behavior under unchanged controlled pricing.

## R4 — Two-mod T1 ES + T1 Intelligence Any

Preserve existing economics/search behavior and exact target IDs.

## R5 — No-unwanted

Preserve final-state constraint semantics.

## R6 — Forced-Rare two-mod

Preserve Phase 2H admissible acquisition proof behavior.

## R7 — Fracture parity

Preserve Fracturing Orb transition parity and executable self-fracture synthesis.

## R8 — Harvest parity

Preserve external close/approximate status and current mechanics confidence.

## R9 — Craft A / Craft C

Preserve multi-seed stability; do not tune the compact-guide layer against these fixture names.

## R10 — Build / lint / production browser worker

- `npm run build`
- `npm run lint` with only the already documented pre-existing warning unless separately fixed without scope risk
- production `npm run preview` browser/worker smoke
- `git diff --check`

No unit tests are requested.

---

# Implementation Order

## Step 1 — Capture Phase 2H baseline

Before changing presentation, regenerate the current real Herald result and preserve:

- result status/cost;
- exact `policyExplanation` count;
- expected-action usage;
- exact branch collision count;
- default-visible policy-card count.

## Step 2 — Build pure craft-plan summarizer

Create the structured transformation from certified selected policy/acquisition into compact stages.

Do not change solver ranking or mechanics.

## Step 3 — Add coverage / contradiction diagnostics

Prove:

- no invented actions;
- all meaningful selected action families represented;
- conflicting state decisions remain explicit somewhere;
- no-route produces no normal plan.

## Step 4 — Replace default branch list

Render compact chronological/playbook plan in `How to craft it`.

Move full exact policy to an Advanced/expert disclosure.

## Step 5 — Herald browser fixture

Validate that the real Herald guide is comprehensible without expanding exact branch details.

## Step 6 — Cross-shape regressions

One-mod, opposite-gen two-mod, no-unwanted, forced-Rare, selected self-fracture, Harvest.

## Step 7 — Full regression matrix

Phase 2H, Phase 2G semantics, fracture/Harvest, Craft A/C, build/lint/browser.

## Step 8 — Completion report

Commit implementation, regenerated diagnostics, and a Phase 2I completion report.

---

# Completion Gates

Phase 2I is complete only when all are true:

- [ ] Phase 2H behavior remains intact.
- [ ] Default `How to craft it` is a compact chronological/playbook representation rather than the full exact state policy.
- [ ] Real Herald fixture defaults to a small number of understandable primary steps rather than dozens of filler-affix cards.
- [ ] Compact plan is derived from selected policy/acquisition evidence.
- [ ] No action appears in the compact plan unless it exists in the returned selected route.
- [ ] Every materially selected action family is represented or explicitly accounted for.
- [ ] Recovery/repeat semantics come from actual policy actions.
- [ ] Conflicting state-specific actions are not falsely merged.
- [ ] Exact Phase 2H disambiguated policy remains accessible under decision details / Advanced.
- [ ] Self-fracture selected routes summarize executable preparation and wrong-fracture recovery.
- [ ] Harvest/specialized selected actions survive summarization.
- [ ] `NO_RESOLVED_ROUTE` has no normal craft plan or expected materials.
- [ ] Provisional warning semantics remain prominent.
- [ ] No pre-fractured purchase path returns.
- [ ] No standard Crafting Bench notable-target creation is introduced.
- [ ] No Craft-specific or target-ID-specific solver/presentation branch is added.
- [ ] No unit tests are added.
- [ ] Existing economic/mechanics regressions pass.
- [ ] `npm run build` passes.
- [ ] `npm run lint` passes apart from any explicitly documented pre-existing warning.
- [ ] production browser/worker smoke passes.

---

# Required Completion Report

Create:

`docs/crafting-engine/PHASE2I_CHRONOLOGICAL_CRAFT_PLAN_UI_COMPLETION_REPORT.md`

Include:

1. implementation commit SHA;
2. files changed;
3. exact compact-plan data model;
4. derivation rules from selected policy/acquisition;
5. proof that no actions are fabricated;
6. proof of selected-action coverage;
7. Herald before/after default-visible guide size;
8. Herald compact plan as rendered;
9. exact Regal-vs-Alteration disambiguation preservation;
10. full-policy Advanced preservation;
11. one-mod regression;
12. opposite-generation two-mod regression;
13. no-unwanted regression;
14. forced-Rare Phase 2H regression;
15. self-fracture compact-plan fixture;
16. Harvest compact-plan fixture;
17. no-route/provisional UI results;
18. Phase 2H H1-H8 result;
19. Phase 2G adapted regression result;
20. fracture / Harvest parity;
21. Craft A / Craft C multi-seed result;
22. build result;
23. lint result;
24. production browser/worker smoke result;
25. confirmation that no unit tests or Craft-specific branches were added;
26. remaining blockers before broad product readiness.

---

# Final Direction

Phase 2H made the optimizer much more capable and proof-honest.

Do not reverse that work just because the exact policy is verbose.

The next product step is to preserve the exact state machine as the expert truth while translating it into a human-sized crafting loop for the default UI:

> **show the player the procedure first; show the optimizer every exact branch only when they ask for it.**
