# Post Phase 2I Real-World Review and Phase 2J Policy Refinement / Multi-Mod Scaling Plan

## Status / Source of Truth

Live `main` reviewed at:

- `ac299efdffe5bd49e13a7ffc8ee252c8b1bce1a4` — Phase 2I completion report
- implementation beneath it: `06dcde926eed3c90ccec03d51b02acdc038fc5dc`

Phase 2I source documents remain valid:

- `docs/crafting-engine/POST_PHASE2H_REVIEW_AND_PHASE2I_CHRONOLOGICAL_CRAFT_PLAN_UI.md`
- `docs/crafting-engine/PHASE2I_WEIGHT_AWARE_POLICY_VALIDATION_ADDENDUM.md`

This document is the source of truth for **Phase 2J**.

No unit-test work is requested.

---

# Executive Verdict

## Phase 2I: PASS

Phase 2I accomplished its intended UI/presentation goal without changing solver mechanics.

Reviewed completion evidence confirms:

- W1–W6 weight/economic-policy diagnostics pass;
- the real Herald target is compressed from dozens of exact Bellman branch cards into an eight-step chronological playbook;
- exact policy branches remain available under Advanced;
- zero fabricated/uncovered selected actions;
- self-fracture preparation, wrong-fracture recovery, and selected Harvest actions survive the presentation transformation;
- no-route material safety is preserved;
- Phase 2H proof/search regressions remain healthy;
- Craft A/C remain multi-seed stable;
- build/browser/worker validation passes;
- no unit tests, target-order heuristics, Craft-specific solver branches, pre-fractured market ranking, or Bench-created cluster targets were added.

The user-facing guide is now good enough that the next work should return to **search quality, search reuse, multi-mod scalability, and economic validation** rather than another broad UI phase.

---

# New Real-World Evidence After Phase 2I

Several real browser crafts were run after Phase 2I. These are now required regression/evidence fixtures for Phase 2J.

## RWE-1 — Herald two-prefix craft: shallow vs Retry Deeper

Physical target:

```text
Medium Cluster Jewel
10% increased Damage while affected by a Herald
ilvl 84
6 passives
Final rarity: Any
Extra affixes: Allowed

Targets:
- Empowered Envoy — Prefix
- Endbringer — Prefix
```

Initial result:

```text
Recommended start: Clean Base
Recommendation: acquisition-safe
Expected cost: 265.853c

Expected usage approximately:
Alteration 1573.356
Exalt 11.054
Scour 20.593
Augment 97.471
Regal 21.593
Transmute 21.593
```

Retry Deeper result on the same target:

```text
Recommended start: Clean Base
Recommendation: acquisition-safe
Expected cost: 63.668c

Expected usage approximately:
Alteration 204.090
Scour 37.771
Regal 38.771
Augment 60.715
Exalt 1.223
Transmute 38.771
```

The deeper search lowers the executable policy from `265.853c` to `63.668c`:

```text
absolute improvement = 202.185c
relative improvement ≈ 76.05%
initial / deeper ≈ 4.18x
```

The broad action family remains the same:

```text
Acquire -> Transmute -> Alter -> Augment -> Regal -> Exalt -> Scour/repeat -> Finish
```

The economic improvement therefore comes primarily from **better state-conditioned keep/promote/recovery decisions**, not from discovering an entirely new currency recipe.

### Important conclusion

`acquisition-safe` proves the selected starting acquisition is safe among modeled acquisition families. It does **not** prove that the downstream crafting policy is mature, close to optimal, or even economically stable under additional search.

The UI already says the policy may improve, but a 4.18x difference is too material to treat that caveat as minor.

Phase 2J must make this distinction first-class in search diagnostics and player-facing status.

---

# RWE-2 — Four-mod full Rare craft does not resolve even with very deep search

Fixture:

```text
Large Cluster Jewel
12% increased Attack Damage while Dual Wielding
ilvl 84
12 passives
Final rarity: Rare
Extra affixes: Allowed

Targets:
Suffix: T1 Intelligence +(6-8)
Prefix: 35% increased Effect
Suffix: +4 to All Attributes
Prefix: T1 Maximum Energy Shield +(10-12)
```

This is an exact full target shape:

```text
2 target prefixes + 2 target suffixes = full Rare 2P / 2S
```

Observed browser behavior:

- initial search: `NO_RESOLVED_ROUTE`;
- Retry Deeper: still `NO_RESOLVED_ROUTE`;
- user allowed the deeper search to run for roughly ten minutes;
- UI correctly reported no certified route rather than inventing a craft estimate.

### Important conclusion

This is no longer a reasonable candidate for “just increase the budget.”

The generic full-pool search/state representation is not scaling well enough to a practical complete four-affix target.

This fixture becomes the **primary Phase 2J multi-mod search-scaling regression**.

Phase 2J must not “solve” it by:

- adding a target-specific recipe;
- adding a Craft-A/C-specific branch;
- hardcoding a fracture target;
- hardcoding an affix ordering;
- merely raising the default state/wall-time limits;
- collapsing states without proving mechanical equivalence.

---

# RWE-3 — Three-notable route resolves but remains proof-weak

Fixture:

```text
Large Cluster Jewel
12% increased Cold Damage
ilvl 84
12 passives
Final rarity: Rare
Extra affixes: Allowed

Targets:
- Blanketed Snow — Prefix
- Prismatic Heart — Prefix
- Widespread Destruction — Suffix
```

Observed route:

```text
Recommended start: Self-fracture Blanketed Snow
Expected cost: 1646.773c
Status: provisional / acquisition not safe
```

The chronological plan correctly preserves:

- executable self-fracture preparation;
- Fracturing Orb;
- wrong-fracture reacquisition;
- downstream Alter/Aug/Regal/Exalt/Scour recovery.

However, proof evidence still had a very large unresolved acquisition gap:

```text
resolved incumbent U = 1646.773c
best unresolved acquisition L = 10.011c
potential gap = 1636.762c
```

This is a useful positive three-mod executable fixture, but it must remain explicitly provisional.

---

# RWE-4 — Simple one/two-mod routes remain healthy

Keep the existing simple real browser cases as controls:

## One mod

T1 Maximum Energy Shield on a Large Cluster Jewel resolves through the expected clean-base Magic rolling family:

```text
Acquire -> Transmute -> Alter -> Augment -> Finish
```

## Opposite-generation two mod

35% Effect + T1 Intelligence resolves through a normal clean-base policy containing:

```text
Acquire -> Transmute -> Alter -> Augment -> Regal -> Exalt -> Scour/repeat -> Finish
```

These establish that Phase 2J optimizations must not regress easy 1–2 target cases while improving harder target shapes.

---

# RWE-5 — New Craft of Exile T1 Armour + T1 Energy Shield evidence

The user supplied a Craft of Exile comparison for a two-target defensive craft whose desired outcome is:

```text
T1 Armour + T1 Energy Shield
```

The exact physical cluster metadata must be captured before claiming exact external parity. Do not infer missing base/enchantment/passive-count metadata from the screenshot.

The external observations themselves are useful and should be preserved as validation evidence once the exact fixture is pinned down.

## Harvest Reforge Defences observation

```text
Actions: 32,917
Passed: 98
Observed success: 0.297%
Observed ratio: ~1 / 336
```

## Conventional observed recipe

```text
Alteration:
  42,728 actions
  1,507 passed
  3.526%
  ~1 / 29

Regal:
  1,507 actions
  14 passed
  0.928%
  ~1 / 108

Exalted Orb:
  1,507 actions
  30 passed
  1.990%
  ~1 / 51

Scour:
  1,477 / 1,477

Transmute:
  1,477 / 1,477
```

Craft of Exile's displayed conventional cost-per-success under the user's entered prices was approximately:

```text
Alteration: 256.500c
Regal:       51.000c
Exalt:      102.000c
Scour:       50.000c
Transmute:   50.000c
--------------------------------
Total:      509.500c
```

The Harvest screenshot did not have a configured lifeforce chaos price, so it showed `N/A` rather than establishing that Harvest is cheaper.

The modeled Harvest craft uses 75 Primal Lifeforce per Reforge Defences. A useful approximate crossover diagnostic from the external `~336` crafts/success is therefore:

```text
336 * 75 = 25,200 Primal Lifeforce / success
509.5c / 25,200 ≈ 0.02022c per Primal Lifeforce
≈ 49.46 Primal Lifeforce per chaos
```

This is **not** a mechanics input and must not be hardcoded. It is only a sanity/crossover observation under the user's compared conventional prices. Shared base-acquisition costs should be normalized consistently when doing the formal comparison.

---

# Phase 2J

> **Downstream Policy Refinement, Resumable Search, Multi-Mod State Scaling, and Harvest-vs-Conventional Economic Parity**

Phase 2J is an engine/search phase with a small proof-status UI follow-through.

Do not combine it with another broad visual redesign.

---

# Priority 1 — Separate Acquisition Safety From Downstream Policy Quality

The result contract currently makes acquisition safety highly visible, but the Herald RWE demonstrates that downstream policy quality can still change by >75% after deeper search.

Add an explicit downstream policy-refinement/proof summary.

Possible service shape:

```ts
interface PolicyRefinementSummary {
  status:
    | 'MODELED_OPTIMAL'
    | 'CURRENT_BEST_UNPROVEN'
    | 'STILL_IMPROVING_AT_BUDGET'
    | 'NO_EXECUTABLE_POLICY';

  firstCertifiedUpperBoundChaos?: number;
  finalUpperBoundChaos?: number;
  improvementChaos?: number;
  improvementFraction?: number;

  selectedStartLowerBoundChaos?: number;
  unresolvedCompetitiveLowerBoundChaos?: number;
  potentialGapChaos?: number;
  potentialGapFraction?: number;

  incumbentHistory: Array<{
    round: number;
    upperBoundChaos: number;
    statesExpanded: number;
    elapsedMs: number;
  }>;

  lastMeaningfulImprovementRound?: number;
  budgetEndedWhileImproving: boolean;
  explanation: string;
}
```

Exact naming is implementation-dependent.

## Proof semantics

Do not label a policy “refined”, “stable”, or “near-optimal” merely because it is executable.

Strong labels must arise from proof/search evidence.

At minimum distinguish:

```text
Starting acquisition: acquisition-safe
Crafting strategy: current best, modeled optimality not proven
```

from:

```text
Starting acquisition: acquisition-safe
Crafting strategy: modeled-action optimality proven
```

If the last search tranche is still materially improving the incumbent when the budget ends, surface that directly.

## UI requirement

The normal recommendation card should not let `Acquisition-safe` visually imply that the expected cost is settled.

Keep the current proof-honest caveat, but make the two axes explicit:

- starting/acquisition confidence;
- downstream policy/search confidence.

Do not dump raw Bellman diagnostics into the default UI.

---

# Priority 2 — Add a Bounded Automatic Refinement Stage to RECOMMEND

Phase 2H intentionally made RECOMMEND return a useful acquisition-safe answer quickly. Keep that property.

But after the first acquisition-safe executable policy is found, do not necessarily return immediately if:

- the selected policy has a large unresolved competitive gap;
- the search is still producing material U improvements;
- there is a bounded refinement reserve available.

Implement/profile a **small bounded refinement tranche** after first useful recommendation.

Do not guess one giant new default budget.

Run a controlled Herald matrix first, for example varying one factor at a time:

```text
post-certification extra states: 0 / 1k / 2.5k / 5k
post-certification extra rounds: 0 / 1 / 2
post-certification extra wall time: 0 / ~1s / ~2.5s / ~5s
```

The implementation may choose another equivalent matrix.

Goal:

> recover most of the `265.853c -> 63.668c` improvement without turning a ~1-second useful response into an unbounded 30-second wait.

Record:

- time to first useful policy;
- time to final returned policy;
- U after each refinement tranche;
- states/transition distributions added;
- Bellman/occupancy/reconciliation health;
- whether the tranche ended because of stability, state budget, round budget, or wall time.

Do not hardcode the Herald cost or target names into refinement logic.

---

# Priority 3 — Make Retry Deeper Reuse Prior Search Work

Current browser behavior constructs a larger budget and starts another optimize request for Retry Deeper.

Phase 2J should support safe continuation/reuse for the **same exact mechanical/economic request** rather than discarding all useful downstream search work.

Preferred architecture:

```text
normalized mechanical/economic request
      ↓ exact session identity
worker-owned GenericSearch session
      ↓
RECOMMEND expands graph and returns result
      ↓
Retry Deeper reuses same graph / transition cache / incumbent evidence
      ↓
extend frontier only
```

## Session identity requirements

The reuse identity must include every input that can change mechanics, legality, probabilities, target semantics, acquisition economics, or Q-values, including at least:

- base type;
- cluster type;
- item level;
- passive count;
- exact target IDs/tiers/roll requirements/final-state constraints;
- clean-base cost/confidence/provenance where economically relevant;
- complete active currency rates;
- Harvest scope/tags;
- research-fallback policy;
- mechanics/action-set version;
- canonical-state/quotient version.

The continuation identity should intentionally **exclude only extendable search controls** such as larger state/time/round budgets and RECOMMEND -> DEEPEN intent when all underlying mechanics/economics are identical.

Any target, price, league snapshot, mechanics scope, or target-semantic change must invalidate reuse.

## Required equivalence diagnostic

For the same final total search budget compare:

```text
A. cold DEEPEN from scratch
B. RECOMMEND -> resumed DEEPEN
```

Require:

- same or policy-equivalent selected incumbent;
- same expected cost within numerical tolerance;
- same proper/absorption/convergence/reconciliation status;
- no state leakage from another request;
- resumed path performs materially less duplicate transition/expansion work.

If exact tie ordering differs, prove equivalent Q/EV rather than comparing serialized state order.

---

# Priority 4 — Diagnose and Fix Four-Mod Full-Rare State Explosion

The four-mod RWE is the primary scaling target.

## Step 4A — Build a diagnostic finite executable baseline

Before changing state identity, create a **diagnostic-only** finite legal reference policy for a generic two-prefix/two-suffix four-target shape using only shared mechanics already available to product search.

This baseline exists to establish:

> the fixture is craftable through modeled actions and to provide a finite U/reference path for search debugging.

It must not enter product ranking as a hardcoded recipe.

It must not use Crafting Bench notable/target creation.

It must not assume a particular fracture target unless that choice itself is generated/evaluated generically.

The evaluator can be deliberately non-optimal.

## Step 4B — Instrument where the search loses the route

Report target-progress milestone counts such as:

```text
0/4 targets
1/4 targets
2/4 targets
3/4 targets
4/4 terminal
```

split by mechanically relevant state shape:

```text
rarity
P/S occupancy
open P/S slots
which target requirements are satisfied
fracture state
wrong permanent fracture
selected action
resolved/unresolved transition distribution
```

Also report:

- concrete states per milestone;
- distinct target-eligibility/exclusion signatures;
- filler-identity fanout;
- transition generation count/time per action family;
- frontier states that can still reach 4/4;
- states discarded by budget before first 3/4 milestone;
- Bellman solve time vs transition-generation time.

Do not optimize blindly until this profile identifies the dominant explosion.

## Step 4C — Introduce only proof-safe target-conditioned state compression

If filler identities are the source of explosion, use the Phase 2E principle:

> collapse states only after proving that states in the quotient have identical future mechanics relevant to the target/action set.

A downstream target-progress quotient may consider dimensions such as:

- rarity;
- prefix/suffix occupancy;
- exact matched target requirement identities;
- target roll pass/fail state where rolls matter;
- fracture identity/status;
- permanent wrong-fracture status;
- open prefix/suffix capacity;
- mod-group/exclusion footprint **as it affects future target eligibility**;
- tags/craft tags **when they affect an enabled specialized action**;
- influence/synthesised flags;
- any other property used by action legality or transition probabilities.

Do **not** collapse two filler states merely because neither filler is a target.

If different filler mod groups remove different target candidates from the eligible pool, they are not equivalent.

If their downstream transition probabilities differ, they are not equivalent.

## Required bisimulation/equivalence audit

For sampled or exhaustive concrete states within the controlled fixture:

- states assigned the same quotient key must expose the same legal action set;
- for each legal action, aggregated successor quotient probabilities must match within numerical tolerance;
- immediate cost must match;
- terminal semantics must match;
- target roll/final-state semantics must match.

Any violation is a Phase 2J blocker.

## Step 4D — Product search gate

After the fix, the generic solver—not the diagnostic baseline—must resolve a finite executable route for the exact four-mod RWE.

Do not require global optimality in Phase 2J.

Require at minimum:

```text
finite executable U
proper policy
terminal absorption ~100%
Bellman converged
occupancy converged
EV reconciled
no unresolved on-policy probability
chronological plan coverage: no invented/uncovered actions
```

Performance must be **materially better than the observed ~10-minute no-route run**. Do not claim success merely because a much larger timeout eventually returns.

Target a practical controlled diagnostic budget; aim for <=60 seconds if the architecture supports it. If that target cannot be reached without unsafe approximation, return the best proof-honest improvement and document the remaining blocker rather than weakening state identity.

---

# Priority 5 — Add T1 Armour + T1 ES External Parity and Economic Crossover Diagnostics

Capture the exact physical Craft of Exile fixture before claiming parity.

Record:

```text
base type
cluster enchantment
item level
passive count
starting rarity/state
fracture state
finish semantics / extra-affix semantics
exact T1 Armour mod ID
target T1 ES mod ID
```

Then permanently record the user-supplied external observations above as validation-only data.

## J-H1 — Harvest analytical parity

For `Harvest Reforge Defences`, report:

```text
external observed probability
engine analytical probability
seeded Monte Carlo probability
absolute/relative difference
external confidence interval where appropriate
mechanics confidence status
```

Do not tune modifier weights to the external observation.

## J-H2 — Conventional stage parity

For the same exact fixture, report analytical and seeded MC stage probabilities for the shared:

- Alteration;
- Regal;
- Exalted Orb;
- Scour/restart topology.

Compare them to the supplied Craft of Exile observations.

Preserve the semantics of what each external “Passed” count means. Do not multiply unrelated rows into a fake combined probability if the recipe semantics do not support that interpretation.

## J-H3 — Identical-price economic comparison

Feed the same currency prices into both modeled route evaluations.

Report:

```text
Harvest expected EV
conventional policy expected EV
selected action family
```

Then perform a Primal Lifeforce price sweep around the external approximate crossover.

The selected strategy should switch because Q-values change—not because of a Harvest-specific if-statement.

At least three points:

```text
lifeforce materially cheaper than crossover
near crossover
lifeforce materially more expensive than crossover
```

Require a strategy/economic response consistent with Bellman values.

The approximate `~0.02022c / Primal Lifeforce` observation is validation guidance only and must not be embedded as a rule.

---

# Priority 6 — Profile the Two-Mod Defensive 10-Minute Runtime

The user observed the T1 Armour + T1 ES optimizer search taking roughly ten minutes while ultimately selecting the conventional Alt/Regal/Exalt family.

A two-mod target should not require that runtime merely to compare ordinary currency rolling against one relevant Harvest family.

Add stage-level profiling for the exact fixture:

```text
acquisition probing
transition generation by action
Harvest transition generation
canonical aggregation / quotient work
graph expansion
lower-bound solve
Bellman solve
absorption
occupancy
serialization
```

Also report:

- number of Harvest successor states before/after aggregation;
- number of repeated/reused transition distributions;
- states expanded per target-progress bucket;
- time to first executable policy;
- time to first acquisition-safe policy;
- time to final returned incumbent.

Optimization order:

1. remove provably duplicate work;
2. improve safe aggregation/caching;
3. improve frontier prioritization;
4. only then reconsider budgets.

Do not reduce mechanics fidelity solely to hit a runtime number.

---

# Priority 7 — Preserve Phase 2I Presentation Semantics

Phase 2J may change which policy is selected, but not the presentation guarantees.

Keep:

- chronological plan default;
- exact branch policy under Advanced;
- zero fabricated selected actions;
- zero uncovered selected action families;
- target-order copy only when the actual selected policy supports it;
- self-fracture and Harvest SPECIALIZED stages derived from selected mechanics;
- no-route result with no normal expected-materials estimate;
- provisional/acquisition-unsafe warnings;
- exact target IDs unchanged.

If resumed/refined search changes the selected policy, the displayed plan must be regenerated from the final returned policy rather than patched incrementally in the UI.

---

# Required Phase 2J Diagnostics

## J1 — Phase 2I completion regression

Re-run the Phase 2I W1–W6 and chronological plan gates.

Expected: no regression.

## J2 — Herald policy-refinement regression

Use exact RWE-1.

Record:

```text
first certified U
first acquisition-safe U
post-refinement U
DEEPEN U
incumbent history
states/time per tranche
policy proper/absorption/convergence/reconciliation
```

Acceptance:

- refinement logic is generic;
- normal RECOMMEND captures a materially better policy than the current shallow `265.853c` behavior under equivalent prices/input;
- time to useful result remains bounded;
- Retry Deeper remains capable of improving further when evidence supports it.

Do not require the exact historical `63.668c` value if current prices/search ordering differ. Compare under a controlled frozen PriceBook fixture for deterministic regression.

## J3 — Cold vs resumed DEEPEN equivalence

Same final budget, same normalized request:

```text
cold DEEPEN
vs
RECOMMEND -> resumed DEEPEN
```

Acceptance:

- EV/policy-equivalent result;
- proof health equal;
- resumed duplicate expansion/transition work materially lower.

## J4 — Session invalidation

Change one at a time:

- target mod ID;
- target final-state constraint;
- currency rate;
- clean-base cost;
- Harvest scope;
- item level.

Each must invalidate unsafe reuse.

## J5 — Four-mod baseline

Diagnostic finite executable shared-mechanics policy exists and is proper/absorbing/reconciled.

It is diagnostic-only and absent from product ranking.

## J6 — Four-mod generic solve

Exact RWE-2 generic product search resolves a finite executable policy after the scaling fix.

No target/Craft-specific branch.

## J7 — Quotient safety audit

Zero legal-action or successor-distribution equivalence violations across the audited controlled concrete states.

## J8 — Three-notable regression

Exact RWE-3 still returns an executable route when available and remains proof-honest about acquisition safety.

No forced requirement that the same fracture target or exact historical U remain selected if the generic search legitimately finds a better route.

## J9 — T1 Armour + T1 ES external parity

Record exact physical metadata, then external vs analytical vs MC results for Harvest and conventional stages.

## J10 — Lifeforce price crossover

Low / near / high Primal Lifeforce prices cause the Bellman policy economics to respond appropriately.

No hardcoded crossover or route winner.

## J11 — Two-mod defensive runtime profile

Document current bottleneck and before/after timings.

A successful Phase 2J should materially reduce the observed multi-minute behavior.

## J12 — Simple controls

Re-run:

- one-mod T1 ES;
- opposite-generation two-mod Any;
- no-unwanted two-mod;
- forced-Rare Phase 2H fixture;
- Herald;
- selected self-fracture;
- selected Harvest controlled plan.

## J13 — Mature regressions

Re-run Craft A and Craft C multi-seed diagnostics if mechanics/search-state semantics change.

If Phase 2J changes only search scheduling/caching and demonstrably leaves transitions untouched, still run the deterministic analytical regressions; multi-seed may be skipped only if the completion report justifies why transition mechanics are byte/behavior unchanged.

## J14 — Build / lint / browser worker

Require:

```text
npm run build
npm run lint
production browser + compiled worker smoke
git diff --check
```

The existing `policyEngine.ts:748` warning may remain documented if still pre-existing and unchanged.

No unit tests.

---

# Required Search Instrumentation

Phase 2J completion evidence should include enough data to distinguish:

```text
better policy because more useful states were discovered
```

from:

```text
same graph, Bellman just needed more iterations
```

and from:

```text
Harvest transition generation dominated runtime
```

At minimum expose in diagnostics:

- first certified incumbent U;
- incumbent U by expansion/refinement round;
- lower bound / competitive gap by round;
- states added by round;
- retained states reused;
- transition distributions generated vs reused;
- target-progress milestone counts;
- action-family transition generation timing;
- Bellman timing/iterations;
- occupancy timing/iterations;
- resumed-session hit/miss reason;
- cold-vs-resumed duplicate-work delta.

Do not make all of this default-visible UI.

---

# Permanent Constraints Reaffirmed

1. No hardcoded answer.
2. No hardcoded target probability.
3. Use actual eligible mod weights.
4. Currency prices are action-cost inputs.
5. Strategy order must emerge from Bellman/Q-values.
6. No “rare modifier first” heuristic.
7. No target/Craft-specific solver branches.
8. Standard Crafting Bench is not a source of cluster target modifiers/notables.
9. Core fractured states are manufactured through executable self-fracture.
10. Pre-fractured market purchase stays out of normal core ranking.
11. Wrong fracture uses real restart/reacquire transitions.
12. Harvest external observations are validation-only, never mechanics inputs.
13. Preserve Harvest `APPROXIMATE / EXTERNALLY CLOSE` labeling unless improved mechanics actually justify changing it.
14. Do not collapse states without equivalence evidence.
15. No unit tests unless the user explicitly reverses that constraint.
16. Allflame crafting mechanic remains deferred/disabled baseline; Allflame market snapshot naming is unrelated.
17. Unknown price never becomes invented `1c` or another silent fallback.
18. Selected-policy validity and global modeled optimality remain separate.
19. Retry/reuse caches must be exact-context safe.
20. The diagnostic four-mod baseline must never become a hidden product recipe.

---

# Phase 2J Completion Gates

Phase 2J closes only when:

- Phase 2I remains healthy;
- acquisition confidence and downstream policy confidence are explicitly separated;
- Herald shallow-policy instability is measured and normal RECOMMEND refinement is materially improved without unbounded latency;
- Retry Deeper can safely reuse prior exact-context search work or the completion report demonstrates why reuse was unsafe and provides an equivalent duplicate-work reduction by another proven method;
- cold vs resumed-equivalent search produces equivalent economics/proof;
- exact-context invalidation is demonstrated;
- a finite shared-mechanics diagnostic baseline exists for the four-mod fixture;
- the generic product solver resolves an executable four-mod route, or the completion report clearly identifies a remaining mathematical/scaling blocker without weakening mechanics/state identity;
- any new quotient passes a zero-violation equivalence/bisimulation audit;
- the three-notable route remains proof-honest;
- the T1 Armour + T1 ES physical external fixture is pinned down;
- Harvest and conventional stage parity diagnostics are recorded;
- identical-price Harvest-vs-conventional EV comparison is recorded;
- lifeforce price sweep demonstrates an emergent strategy crossover where economics warrant it;
- the defensive two-mod runtime bottleneck is identified and materially improved;
- simple one/two-mod, Phase 2H, fracture, Harvest, and mature regressions remain healthy;
- build/lint/browser/worker validation passes;
- no unit tests;
- no target/Craft-specific solver branches;
- no hardcoded route winner/crossover/target order.

---

# Required Phase 2J Completion Report

Create:

```text
docs/crafting-engine/PHASE2J_POLICY_REFINEMENT_MULTIMOD_SCALING_COMPLETION_REPORT.md
```

Report at minimum:

1. implementation commit;
2. files changed;
3. Phase 2I regression status;
4. new policy-refinement status/data model;
5. Herald initial/first-certified/final U history;
6. RECOMMEND refinement budget and latency effect;
7. Retry Deeper reuse architecture;
8. exact session identity/invalidation contract;
9. cold vs resumed DEEPEN equivalence results;
10. duplicate work before/after;
11. four-mod diagnostic baseline policy/economics/proof;
12. four-mod pre-fix state-explosion profile;
13. any quotient/state abstraction introduced;
14. quotient equivalence/bisimulation audit;
15. four-mod generic post-fix result and runtime;
16. three-notable regression;
17. exact T1 Armour + T1 ES external physical fixture;
18. CoE Harvest external vs analytical vs MC;
19. CoE Alter/Regal/Exalt external vs analytical vs MC;
20. identical-price Harvest-vs-conventional EV comparison;
21. lifeforce crossover sweep;
22. defensive two-mod runtime before/after profile;
23. one-mod regression;
24. two-mod regression;
25. no-unwanted regression;
26. forced-Rare regression;
27. selected self-fracture regression;
28. selected Harvest plan regression;
29. Craft A/C regression status;
30. build;
31. lint;
32. production browser/worker smoke;
33. unit tests added? expected NO;
34. solver mechanics changed? explain exactly;
35. target/Craft-specific branches added? expected NO;
36. remaining blockers before broad product readiness.

---

# Final Phase 2J Principle

The most important lesson from the new real crafts is:

> **finding an executable acquisition-safe route quickly is not the same problem as finding a high-quality downstream crafting policy, and neither is the same problem as proving modeled optimality.**

Phase 2J should preserve all three distinctions while making deeper search cheaper, reusable, and capable of handling real three-/four-target crafts.