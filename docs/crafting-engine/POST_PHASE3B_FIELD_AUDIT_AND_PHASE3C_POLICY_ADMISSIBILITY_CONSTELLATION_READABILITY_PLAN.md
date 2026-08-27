# Post-Phase 3B Field Audit and Phase 3C Plan

## Open-vs-Conventional Policy Admissibility Consistency + Readable Large-SCC Markov Constellation

Status: **READY FOR IMPLEMENTATION**

Baseline reviewed: `eeb0883084b336018bb5bb239f587c8b846c43ff` on `main`.

Phase 3B is **CLOSED / PASS / DEPLOYED**. Do not reopen its fractured-Magic mechanics work unless Phase 3C discovers a direct regression against that completed contract.

This Phase 3C plan has two tightly related goals discovered from the same real three-notable field run:

1. audit and repair the large unexplained difference between the selected Open clean-base policy and the independently solved Conventional clean-base policy when both expose the same physical action vocabulary;
2. make the Phase 2Z exact selected-policy Constellation readable when a real craft produces one large cyclic SCC with dozens of macro states and hundreds of edges.

The solver-truth work comes first. The Constellation must render the corrected canonical selected policy, not compensate visually for a policy-selection defect.

No unit tests are to be added or run. Use the Phase 3A DEV/RELEASE harness, direct diagnostics, seeded analytical checks where appropriate, and targeted browser evidence. The legacy 115-gate release and EXTENDED/long-soak suites remain manual-only and must not be run as ordinary Phase 3C acceptance.

---

# 1. Frozen Field Observation

The field export that triggered this audit used:

```text
Base:           Large Cluster Jewel
Cluster type:   Minions deal 10% increased Damage
Item level:     84
Passives:       8
Final rarity:   rare
Targets:
  Primordial Bond
  Renewal
  Rotten Claws
Extra affixes:  allowed
Objective:      CHEAPEST_CHAOS
Budget:         NORMAL — 5,000 states / 30,000 ms / 3 rounds
League:         Allflame
Clean base:     40c
Expected sale:  1708c
```

Frozen relevant prices from the same exported request:

```text
annul          11.66c
exalt           1.17c
scour           0.5391c
alteration      0.1336c
transmutation   0.005012c
augmentation    0.03941c
regal           0.03638c
fracturing    298.6c
```

Observed selected Open route:

```text
route:                  Start clean base
full-route U:           1440.1876751182278c
expected actions:       8623.468731256784
estimated time:         3449387.4925 ms
policy fingerprint:     policy-8d1a067c
on-policy states:       1592
terminal states:        15
policy status:          fully resolved / proper / absorbing / cost-reconciled
proof wording:          BEST FULLY RESOLVED POLICY FOUND
```

Observed independently solved Conventional route:

```text
route:                  Start clean base
full-route U:           2276.6407665828724c
expected actions:       16142.004545840233
estimated time:         6456801.8183 ms
policy fingerprint:     policy-4aa41222
on-policy states:       1214
terminal states:        15
policy status:          fully resolved / proper / absorbing / cost-reconciled
proof wording:          BEST FULLY RESOLVED POLICY FOUND
```

Difference:

```text
2276.6407665828724 - 1440.1876751182278
= 836.4530914646446c
```

Both policies reported the same broad on-policy physical action vocabulary:

```text
clean_base_initial
transmutation_orb
alteration_orb
augmentation_orb
regal_orb
scouring_orb
exalted_orb
annulment_orb
```

Neither selected policy used Harvest, Fracturing Orb, restart/reacquire, or another Open-only physical mechanic.

Their action usage differs dramatically:

| Action | Open selected policy | Conventional independent policy |
|---|---:|---:|
| Alteration | 5321.460228 | 15635.418582 |
| Augmentation | 1515.246688 | 424.936073 |
| Regal | 578.144255 | 18.416187 |
| Scour | 577.144255 | 17.416187 |
| Annul | 22.122089 | 8.464367 |
| Exalt | 31.206960 | 18.936963 |
| Transmute | 578.144255 | 18.416187 |

The selected Open policy advances many more promising Magic states into Augment/Regal and then evaluates Rare finishing/recovery states. The Conventional solve instead spends far more expected Alterations before promotion.

This explains **where the cost difference comes from**. It does not yet explain **why the constrained Conventional family failed to retain/reproduce a known cheaper policy that appears to use only Conventional-legal actions**.

That is the primary Phase 3C correctness audit.

---

# 2. Current Semantic Distinction That Must Remain Explicit

Do not conflate these claims:

```text
POLICY CERTIFIED / FULLY RESOLVED
```

means the returned selected policy itself is executable, proper, absorbing, evaluable, and cost-reconciled.

It does **not** necessarily mean:

```text
FAMILY OPTIMUM PROVEN
```

The field export makes this distinction important. Both the 1440c and 2276c policies are individually fully resolved, but neither carries the stronger `OPTIMAL OVER MODELED ACTIONS: PROVEN` wording.

Phase 3C must preserve this distinction in data and UI. If needed, improve naming so `RESOLVED` cannot be casually read as “proven cheapest in this method family.”

Recommended concepts:

```text
Policy execution status:
  CERTIFIED / FULLY RESOLVED

Family search status:
  OPTIMAL_PROVEN
  BEST_FOUND_UNPROVEN
  UNRESOLVED
```

Names may differ, but the semantics must not.

---

# 3. Core Phase 3C Policy-Admissibility Invariant

The optimizer already knows more than one policy for the same request. A worse independently searched family incumbent must not replace a better policy that is already known to be feasible under that family's constraints.

For every method family `F`, define a policy-admissibility check against a known policy `P`.

At minimum validate:

- acquisition identity satisfies `F.forcedAcquisitionType`;
- every physical selected action in every reachable on-policy state is in the family's permitted action set;
- no selected action violates a forbidden-action rule;
- all required family actions are satisfied when the family requires positive action evidence;
- target definition is identical;
- item/base/passive/item-level identity is identical;
- mechanics version/session identity is compatible;
- every selected action remains legal in its exact state under the family context;
- all policy transitions can be regenerated/evaluated under the family action context;
- terminal semantics are identical;
- expected cost/action/time evaluation reconciles under the family's price and effort context.

The central invariant is:

```text
If known policy P is admissible in family F,
then family F's executable upper bound must be no worse than P.

familyU(F) <= cost(P) + tolerance
```

For the frozen field fixture, if the 1440.187675c Open policy is admissible in Conventional, then Conventional must not publish 2276.640767c as its best executable U.

If the Open policy is **not** admissible in Conventional, Phase 3C must produce a precise machine-readable rejection reason identifying the exact state/action/constraint that makes it invalid.

The phase must never silently leave the current contradiction unexplained.

---

# 4. First Task: Reproduce Before Repair

Before changing selection behavior, add a direct Phase 3C diagnostic that reconstructs the frozen request above and records both independent policies.

Persist a compact evidence artifact containing:

```text
request identity
mechanics/session identity
family specs
per-family allowed/required/forbidden actions
Open policy fingerprint
Conventional policy fingerprint
Open U
Conventional U
policy health
family-optimality/proof wording
on-policy action IDs
expected action usage
on-policy reachable state count
retained graph states
transition distributions generated/reused
budget requested/used
```

Then run the policy-admissibility audit state-by-state.

The diagnostic must answer:

```text
Is Open selected policy admissible inside Conventional?
YES / NO
```

If NO, print every failed contract with exact evidence.

If YES, print:

```text
known feasible Conventional incumbent = 1440.187675...
independent Conventional incumbent     = 2276.640766...
consistency violation                  = 836.453091...
```

Do not begin by forcing the expected answer. Let the exact legality/evaluation audit establish it.

---

# 5. Determine the Actual Root Cause

If the Open policy is admissible in Conventional, compare the two solves at the exact-state/action level.

Instrument at least:

- retained state sets;
- states present only in Open vs only in Conventional;
- common states where selected actions differ;
- Q-values for Open-selected and Conventional-selected actions in those common states;
- first/highest-occupancy divergent states;
- action-discovery differences;
- pruning/rejection reasons;
- Bellman initialization;
- incumbent initialization;
- expansion ordering;
- continuation-session reuse;
- state-cap/wall-time/round-cap effects;
- whether a family solve terminates because its current policy is fully resolvable even though a better feasible policy is already known;
- whether the independent family search is using a smaller reachable graph or is failing to import states already discovered by the canonical Open search;
- whether any constrained-family action filter changes legal successors despite identical observed on-policy action IDs.

Produce a ranked divergence report, e.g.:

```text
state X
occupancy under Open: ...
Open chooses: Augment
Conventional chooses: Alter
Q(Open action): ...
Q(Conventional action): ...
reason Open action absent/rejected/not-selected in family solve: ...
```

Prioritize high-occupancy divergence because that is most likely to explain the 3x Alteration usage.

Do not patch this fixture specifically.

---

# 6. Correct Known-Feasible Incumbent Handling

If an already-computed policy is admissible inside a constrained family, the family solver should be able to use it as a **known feasible incumbent**.

This is generic branch-and-bound/search hygiene, not a route-specific shortcut.

Recommended architecture:

```text
known policy
  ↓
family admissibility validator
  ↓
independent family re-evaluation
  ↓
known feasible incumbent U
  ↓
family search attempts to improve/prove it
```

The family search may still discover a cheaper policy.

It must not worsen the incumbent.

The seed/import must not falsely claim independent proof. Record provenance such as:

```text
incumbentSource:
  INDEPENDENT_DISCOVERY
  ADMISSIBLE_KNOWN_POLICY
  IMPROVED_FROM_KNOWN_POLICY
```

Names may differ.

A known policy must be independently revalidated in the family context before becoming a family incumbent. Do not merely copy its scalar cost.

Validate:

- exact state/action decisions;
- legal actions;
- transition distributions;
- absorption;
- expected cost/actions/time;
- reconciliation;
- target terminal semantics.

If re-evaluation disagrees with the source policy metrics beyond tolerance, fail closed and investigate.

---

# 7. Method-Family Comparison Semantics

After repair, Method Comparison should behave coherently.

If Conventional independently validates the exact selected Open policy and cannot improve it, it should be eligible for canonical equivalence classification:

```text
Open:          Recommended
Conventional:  Same selected policy
```

only if their full canonical policy-equivalence fingerprints match under the existing Phase 2Y equivalence contract.

Do not force equivalence based only on equal U.

If Conventional discovers a different policy with equal or better U, display it as a distinct policy.

If the family still has unresolved proof debt, show:

```text
Known executable U: ...
Family optimum: not proven
```

rather than implying the known incumbent is modeled-optimal.

---

# 8. No Family Regression Invariant

Generalize the audit beyond Conventional.

For any family whose constraint set admits the selected Open policy:

```text
family executable U <= admissible Open policy U
```

For families requiring a mechanic the Open policy does not contain, e.g. Harvest required-action families, the Open policy is correctly inadmissible and must not seed them.

For self-fracture families, clean acquisition is correctly inadmissible when the family forces self-fracture.

Add a compact matrix to the diagnostic showing:

```text
family
Open policy admissible? YES/NO
reason
known incumbent imported? YES/NO
independent improvement? YES/NO
final family U
proof status
```

---

# 9. Field Acceptance for Policy Consistency

For the frozen Primordial Bond + Renewal + Rotten Claws request, acceptance requires one of exactly two outcomes.

## Outcome A — Expected likely result

The Open policy is admissible in Conventional.

Then:

```text
Conventional U <= 1440.1876751182278c + tolerance
```

and the 2276.640766c incumbent may remain only as historical/pre-fix evidence, not the final best family U.

If the canonical policy fingerprint matches, Conventional should show `Same selected policy` or semantically equivalent presentation.

## Outcome B — Legitimate hidden restriction discovered

The Open policy is inadmissible in Conventional.

Then the completion report must identify:

- exact family restriction;
- exact violating state/action;
- why current public naming/description failed to make that restriction obvious;
- updated player-facing copy so the 1440c vs 2276c difference is understandable.

“No longer reproducible” or “search variance” is not sufficient without evidence.

---

# 10. Phase 3C Constellation Field Observation

The same selected Open policy serializes a certified `SELECTED_POLICY_FLOW_V1` graph with:

```text
exact states:           1592
exact transitions:      45452
macro nodes:            42
macro edges:            172
strongly connected:     2 SCCs total
cyclic SCCs:             1
branch nodes:            28
recovery edges:          32
repeat edges:            29
visible flow fraction:   1.0
```

Selected macro action histogram:

```text
Transmute  1
Alter      5
Augment    4
Regal      5
Scour     13
Exalt      7
Annul      6
```

The current renderer is truthful, but the layout is not sufficiently readable for this topology.

Current `VisualizationGraph.ts` behavior is the core issue:

- Tarjan SCC condensation is correct;
- SCC DAG ranks are useful;
- every cyclic SCC with more than one node is currently placed around a compact ring;
- the ring radius is capped at roughly `125px`;
- default requested layout height is roughly `620px`.

A large real craft therefore puts much of the 42-node selected policy into one tightly packed cyclic component.

This is a layout problem, not a reason to weaken policy aggregation or hide exact flow.

---

# 11. Constellation Goal

Preserve exact topology while turning a large cyclic policy into a readable player-facing flow map.

The desired mental model is approximately:

```text
CRAFT PROGRESS →

NORMAL         MAGIC ROLLING          PROMOTION          RARE FINISHING        GOAL

Transmute      Alter / Augment        Regal              Exalt / Annul          Goal
   ↑               │                    │                    │
   │               │                    └──── bad ─→ Scour ──┘
   │               │                                  │
   └─────────────── recovery / restart corridor ──────┘
```

This is illustrative. The actual nodes and edges remain derived from `PolicyFlowSummary`.

No target name, Craft fixture, or hardcoded route order may participate in layout logic.

---

# 12. Replace Large-SCC Ring Packing with Semantic Internal Layout

Keep SCC detection. Change how a **large** SCC is arranged internally.

Recommended hybrid strategy:

```text
small SCC (for example <= 6–8 nodes)
  → compact deterministic ring is acceptable

large SCC
  → semantic layered layout
```

For a large SCC, derive a presentation rank from generic state/action semantics such as:

- scope: acquisition vs downstream;
- terminal status;
- rarity: normal / magic / rare;
- matched target count;
- affix count;
- selected action category;
- recovery-like state;
- graph distance toward terminal when recovery/repeat edges are temporarily de-emphasized;
- expected occupancy/flow importance.

A useful default horizontal progression is:

```text
Acquisition / Normal
→ Magic rolling
→ Promotion
→ Rare finishing / cleanup
→ Goal
```

Within each column, vertically separate macro states by:

- target progress;
- action type;
- occupancy importance;
- deterministic barycentric ordering against neighboring columns to reduce crossings.

Recovery and repeat edges should not force the main progress layout backward.

---

# 13. Recovery/Repeat Edge Corridors

The selected policy contains many real backward transitions.

Route them intentionally.

Recommended visual conventions:

- primary/progress edges use the central graph body;
- success edges trend toward the terminal/right side;
- recovery edges use a lower or outer backward corridor;
- repeat/self-loop edges remain close to their source node;
- high-flow recovery corridors may be thicker/brighter but should not cross every label;
- long recovery curves should share bundled waypoints visually where useful, while remaining individually selectable/traceable.

Do not change edge probability, expected flow, identity, or source/target semantics to make routing easier.

---

# 14. Increase the Available Viewport

Desktop should spend available screen area rather than compressing the graph.

Recommended target:

```css
height: clamp(700px, 72vh, 950px);
```

Exact values may be adjusted after browser evidence, but the field graph should get materially more vertical room than the current ~620px default.

Also allow graph bounds to grow beyond the viewport and rely on existing pan/zoom/Fit All behavior.

Do not make “Fit All” synonymous with “make every label tiny.”

Fit All should preserve a comfortable margin and a minimum readable node/label scale.

On mobile, keep a smaller viewport appropriate to the device, but preserve graph-local pan/zoom and prevent document-level horizontal overflow.

---

# 15. Remove Misleading Chronological Ordinals from Default View

The current Constellation shows labels like:

```text
14 Regal
21 Scour
29 Goal
```

Those numbers come from deterministic traversal order. They are not player crafting step numbers in a branching cyclic policy.

Default Constellation labels should not imply chronology.

Recommended:

```text
Regal
Scour
Exalt
Goal
```

If the traversal/state index is still useful for technical debugging, keep it under Advanced labels/Technical details.

Do not change node IDs or replay determinism.

---

# 16. Make State Context Readable Without Opening Every Node

Use the extra space for compact contextual sublabels where they improve comprehension.

Examples:

```text
Regal
Magic · 1/3 targets · 2 affixes

Exalt
Rare · 2/3 targets · 3 affixes

Scour
Rare · 1/3 targets · recovery
```

Player-facing notable names may be used where a node represents a small target-specific class, but avoid long raw modifier strings in the default view.

Exact IDs remain Advanced/Technical.

---

# 17. Do Not Solve Readability by Hiding Truth

Phase 3C should first improve geometry, spacing, routing, labels, and viewport size.

Do not make the default graph falsely simple by dropping meaningful nodes/edges or renormalizing probabilities.

If an optional future “Simplified” mode is useful, it may be added only if:

- Full remains available;
- aggregate probability/flow is conserved;
- collapsed branches are explicitly marked;
- the exact selected-policy graph remains the source of truth.

A simplified mode is not required to close Phase 3C.

---

# 18. Deterministic Layout Acceptance

Use the frozen field topology as the primary large-SCC stress case.

Required geometry checks should include:

- deterministic node positions for identical flow/viewport identity;
- Goal remains clearly separated on the progress/terminal side;
- large SCC spans multiple horizontal semantic bands rather than one <=125px ring;
- large SCC spans sufficient vertical height to distinguish state groups;
- no node-circle overlap;
- default visible labels do not substantially overlap each other;
- progress edges and recovery edges use distinguishable routing corridors;
- Fit All produces usable margins;
- Route Focus still works;
- edge/node selection still resolves the correct detail panel;
- replay still follows exact edge identities;
- Screensaver/Fullscreen still work;
- reduced-motion behavior remains correct;
- particle budget remains bounded;
- no document scroll hijack regression;
- mobile has no document-level horizontal overflow.

Prefer robust geometry metrics over brittle pixel-perfect screenshots.

Also capture stable screenshots for human review at:

```text
1440×900 or comparable desktop
1920×1080 or comparable wide desktop
mobile control
```

---

# 19. Phase 3C Direct Diagnostics

Create `diagnostic:phase3c` with at least these groups.

## C1 — Frozen request reproduction

Reproduce the exact request/prices and capture Open vs Conventional before/after behavior.

## C2 — Policy admissibility

Validate Open policy against Conventional constraints state-by-state.

## C3 — Known-incumbent monotonicity

If admissible:

```text
Conventional final U <= admissible known policy U
```

## C4 — Independent evaluation parity

Re-evaluating the known Open policy inside Conventional must reconcile cost/actions/time and absorption within tolerance.

## C5 — Search divergence evidence

Record highest-occupancy states where the independent family policy differs from the Open policy and why.

## C6 — Family matrix

Check admissibility/import semantics across Open, Conventional, Harvest-required, self-fracture, and self-fracture+Harvest controls.

## C7 — Policy equivalence

If Open and Conventional end on the same policy, canonical policy-equivalence fingerprints must agree; equal scalar cost is insufficient.

## C8 — Large-SCC layout

Use the real 42-node/172-edge class or corrected successor topology and assert semantic spread/collision/routing invariants.

## C9 — Topology preservation

Layout changes must not change PolicyFlow node/edge IDs, probabilities, expected flow, recovery classification, or reconciliation.

## C10 — Phase 3B preservation

Fractured Magic 25% blocked-side self-loop / 75% open-side mass under the existing approximate contract remains intact.

---

# 20. Browser / Quality Lab Work

Add Phase 3C targeted gates to the Phase 3A registry.

At minimum:

```text
C-policy-family-admissibility
D-constellation-large-scc-layout
```

The policy browser gate should use the real Worker and exact field request.

Assert:

- Worker Open U;
- Conventional U;
- admissibility result;
- family incumbent provenance;
- no family regression against a known admissible policy;
- UI proof wording distinguishes executable policy certification from family optimum proof;
- if equivalent, `Same selected policy` presentation is backed by the canonical fingerprint.

The Constellation gate should use a real Worker flow plus a frozen renderer fixture generated **after** the policy-consistency repair.

Assert:

- topology differential real Worker ↔ frozen renderer;
- expected nodes/edges/fingerprint identity;
- large-SCC layout spread;
- no default label collisions above the allowed tolerance;
- Goal separation;
- recovery corridor behavior;
- node/edge interaction;
- Fit All/Reset View/Route Focus;
- responsive/mobile ownership.

---

# 21. Validation Cadence

Use the efficient harness deliberately.

During implementation:

```text
npm run build
npm run lint
git diff --check
npm run diagnostic:phase3c
```

Then run only the affected Phase 3C browser gate(s).

Use DEV after meaningful cross-surface changes.

Do not repeatedly run RELEASE.

When implementation is stable:

1. final Phase 3C direct diagnostic;
2. final Phase 3C targeted browser gates;
3. DEV once;
4. RELEASE once;
5. mature diagnostics and relevant retained Phase diagnostics;
6. no RELEASE rerun if later diagnostics change only diagnostic/report code and no app/harness compatibility identity relevant to RELEASE changed.

EXTENDED and `lab:legacy-release` remain withheld/manual-only.

---

# 22. Required Preservation Matrix

Phase 3C must preserve:

- Phase 3B Magic roll-shape fidelity;
- Phase 2Z exact occupancy/probability PolicyFlow;
- Phase 3A DEV/RELEASE/EXTENDED tiering;
- Phase 2Y policy equivalence;
- Phase 2W atomic selected bundle and objective comparison;
- Phase 2X action taxonomy and fail-closed unknown-action behavior;
- Phase 2V Harvest certification;
- canonical solver state identity;
- executable self-fracture synthesis;
- no pre-fractured market ranking;
- no hardcoded winner;
- no Craft-specific production branch;
- no unit tests.

No solver probability or crafting mechanic should change in Phase 3C unless the admissibility audit independently exposes a mechanics bug. If that happens, stop and document the new mechanics issue before changing it.

---

# 23. Completion Report

Create:

`docs/crafting-engine/PHASE3C_POLICY_ADMISSIBILITY_AND_CONSTELLATION_READABILITY_COMPLETION_REPORT.md`

It must include:

- baseline SHA;
- exact field fixture;
- before Open/Conventional table;
- exact admissibility result;
- root cause;
- highest-impact divergent policy states;
- repair architecture;
- known-incumbent provenance behavior;
- after Open/Conventional table;
- family equivalence result;
- proof-status semantics;
- large-SCC before topology/layout metrics;
- new layout algorithm;
- viewport dimensions/behavior;
- collision/spacing evidence;
- before/after screenshots;
- topology reconciliation showing presentation-only layout did not change policy flow;
- DEV result/runtime;
- RELEASE result/runtime;
- mature/retained diagnostics;
- declaration that EXTENDED/legacy were not run;
- deployment run and deployed SHA;
- all preservation declarations.

---

# 24. Autonomous Execution Rules

Work through ordinary implementation failures without waiting for the user.

Preserve any newer user-owned commits that appear after this plan.

Before modifying source, fetch/rebase/merge latest `main` safely as appropriate.

Stop only for:

- a genuinely unknown Path of Exile mechanic requiring external validation;
- destructive conflict with newer user-owned source changes;
- unavailable external credential/service;
- a requirement that would violate a permanent project constraint.

Do not stop merely because the frozen fixture changes after a generic correctness repair. Record the before/after result and continue.

---

# 25. Definition of Done

Phase 3C is complete when all of the following are true:

- the Open-vs-Conventional discrepancy is reproduced and explained;
- every known policy used as a family incumbent is revalidated under that family's exact constraints;
- no constrained family publishes a worse executable U than a known admissible policy;
- the frozen field fixture either gives Conventional `U <= 1440.187675c + tolerance` or has a precise proven inadmissibility explanation;
- policy certification and family optimality are clearly distinct;
- no equality-based fake policy equivalence is introduced;
- large cyclic Constellations are spread into readable semantic layers rather than one compact ring;
- the field-class graph gets materially more usable vertical space;
- default node labels no longer imply false chronology;
- recovery/repeat routing is visually separated from main progress flow;
- PolicyFlow topology/probability/occupancy reconciliation is unchanged by layout;
- build/lint/diff pass;
- Phase 3C direct diagnostic passes;
- targeted Phase 3C browser gates pass;
- DEV passes;
- RELEASE passes once at final acceptance;
- relevant mature/phase diagnostics pass;
- EXTENDED/legacy remain withheld unless an independently justified need arises;
- completion report is committed;
- source/report commits are pushed to `main`;
- Pages deploy succeeds and deployed SHA matches final `main`.
