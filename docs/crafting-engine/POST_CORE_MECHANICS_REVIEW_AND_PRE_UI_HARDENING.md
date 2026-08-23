# Post Core-Mechanics Review and Pre-UI Hardening Plan

## Review Scope

This review covers the current `main` implementation after:

- `67afd55e849fd6d5fb71bf1f45b0f250818c59c2` — `feat: harden generic solver and add core mechanics`
- `9e62c7ded818d9d933dcab953b0038ee99f67d46` — `fix: evaluate generic starting routes`

The previous implementation baseline used for comparison is:

- `8631353d62f25c23a78e04d872df4cce7e34d30b` — `Implement on-policy graph separation, candidate resolution status, action state attribution, and 2.6M+ CoE parity`

The purpose of this review is to:

1. verify whether the new implementation materially improved the architecture;
2. identify correctness gaps introduced or exposed by the larger generic action frontier;
3. decide whether the backend is actually ready for UI work;
4. define the final backend-hardening phase before Developer UI Phase 1.

---

# Executive Verdict

## Overall result

The new implementation is **materially better than the previous pass**.

The strongest improvements are not cosmetic. The new work:

- removed the finite unresolved-branch penalty from value calculation;
- separated selected-policy validity from global optimality claims;
- recursively propagates candidate resolution state;
- runs a real TypeScript/Vite build as part of validation;
- added shared Scour, Restart/Reacquire, Exalt, and Fracturing mechanics;
- replaced fake Exalt/Fracture parity constants with shared mechanic execution;
- corrected action-attribution reporting;
- added a real cyclic multi-stage generic route;
- preserved Craft A/C regressions;
- performed a follow-up fix for starting-route evaluation and fractured-start rarity instead of leaving the first implementation untouched.

The architecture is now substantially closer to the final product.

However, the backend is **not yet ready to claim arbitrary 1–4-mod least-cost optimization**. The main remaining issues are now concentrated in a few important areas rather than spread throughout the whole engine:

1. canonical state identity does not include new mechanics-relevant metadata;
2. fractured state is represented in two places and is not handled consistently everywhere;
3. generic Bellman search still does not execute Harvest reforges;
4. acquisition/restart choices are not yet one unified policy decision;
5. the full real mod pool still produces many potentially competitive unresolved routes;
6. the successful multi-stage proof uses a deliberately bounded five-mod fixture, not the production-sized pool.

These should be the focus of **one final backend architecture phase before serious UI implementation**.

---

# LLM Implementation Quality Comparison

## New LLM vs previous LLM

### Verdict

**The new LLM performed better on this phase.**

That conclusion is based on implementation behavior, not style.

### Where the new LLM was stronger

#### 1. Better completion discipline

The previous implementation frequently completed a requested architecture change but left secondary correctness problems that were only discovered in the following review, including:

- finite placeholder penalties influencing unresolved Q-values;
- shallow candidate-resolution labeling;
- inconsistent action-attribution field names;
- engine-side external parity values inserted as constants;
- legal action scaffolding existing without actually being traversable by the solver.

The new LLM addressed those classes of issues directly rather than only adding another reporting layer.

#### 2. Better build discipline

The new LLM explicitly ran the real root build:

```text
npm.cmd run build
-> tsc -b && vite build
-> successful
```

This is an improvement over relying only on `tsx` diagnostics.

Continue requiring a real build at the end of architecture-heavy passes.

#### 3. Better solver-proof semantics

The distinction between:

```text
SELECTED POLICY:
FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED
```

and:

```text
GLOBAL OPTIMALITY:
NOT YET PROVEN
```

is correct and important.

The current full-pool T1 Intelligence search explicitly says:

- selected policy is fully resolved;
- 1,235 unresolved competitors may still be cheaper;
- therefore global optimality is not proven.

That is substantially safer than allowing a finite unresolved penalty to make competitors look expensive.

#### 4. Better mechanics centralization

Scour, Exalt, Fracturing, and Restart/Reacquire now live in the shared mechanics architecture instead of being added as Craft-specific route code.

That aligns directly with the final UI goal.

#### 5. Better self-correction

The follow-up commit fixed two meaningful issues from the first implementation:

- fractured starting candidates are now represented as their post-Scour magic state;
- generated starting candidates are actually evaluated rather than printing a predetermined clean-base winner.

That kind of self-correction is a positive signal.

### Where the new LLM still needs tighter review

The new implementation had a much larger blast radius than the previous pass.

It changed the solver, domain model, action registry, target model, strategy discovery, policy engine, reporting, Monte Carlo wiring, and diagnostics in one phase.

That produced faster architectural progress, but it also introduced new cross-cutting invariants that were not fully audited, particularly:

- `ItemState.metadata` vs canonical identity;
- `isFractured` vs `fracturedModIds`;
- bounded-fixture proof vs production-pool proof;
- one-destination restart semantics vs multi-acquisition policy search.

### Recommendation on LLM choice

For architecture-heavy implementation passes, the new LLM appears stronger based on this sample.

Continue using it if desired, but keep the same review cadence. It makes larger changes per pass, so correctness review remains important.

---

# What Is Now Working Well

## 1. Selected-policy correctness is much stronger

Current clean-base T1 Intelligence policy:

- full graph: 5,000-state cap reached;
- on-policy states: 1,360;
- on-policy unresolved probability: 0%;
- terminal absorption: effectively 100%;
- Bellman converged;
- Markov occupancy converged;
- action-cost sum and Bellman EV reconcile to approximately `0.0003c`;
- selected policy is fully resolved/proper/absorbing;
- global optimality remains explicitly unproven.

This is the correct conceptual separation.

## 2. Action attribution is now meaningful

The output now distinguishes:

- action-local unique successor keys produced;
- first global discoveries;
- on-policy states selecting the action;
- unresolved outgoing edges.

This fixes the previous misleading result where Alteration/Augmentation appeared to generate zero states merely because another action inserted equivalent canonical states first.

## 3. Scour is now a shared executable mechanic

The diagnostic demonstrates:

- ordinary magic -> normal;
- ordinary rare -> normal;
- fractured item -> retains fractured explicit and appropriate post-Scour rarity.

The analytical and sample transitions agree in the diagnostic.

## 4. Restart/Reacquire exists as an economic action

The solver can now compare:

```text
continue current item
vs
abandon + reacquire
```

and the diagnostics demonstrate both a restart-winning and continue-winning state.

This is an important prerequisite for real failure recovery.

## 5. Exalt is now shared

Current parity:

```text
Analytical: 3.8062%
Seeded MC:  3.8350%
External:   3.5921% (31 / 863)
```

This is healthy.

Do not tune Exalt weights to the external sample.

## 6. Fracturing is now shared

Current parity:

```text
Analytical: 25.0000%
Seeded MC:  24.9550%
External:   25.0000%
```

This is healthy.

## 7. Harvest parity reporting is more honest

Harvest and post-Harvest Annul are no longer presented as if a shared executable parity runner exists when it does not.

The compound Harvest observation remains:

```text
Craft of Exile: ~0.122529% (~1 / 816.1)
Current engine approximation: ~0.1460% (~1 / 684.9)
Assessment: CLOSE / APPROXIMATE — engine ~19% optimistic
```

Keep this non-blocking.

## 8. A cyclic multi-stage generic policy now exists

The bounded five-mod fixture successfully demonstrates a generic policy family containing:

```text
normal
-> magic
-> rare
-> fracture
-> scour/reset
-> continue
-> finish
```

with cycles, restart decisions, proper absorption, and exact expected-cost reconciliation.

This is a meaningful architecture proof.

## 9. Craft A/C remain stable

Current reported pooled regressions remain healthy:

### Craft A

- analytical: `7623.7c`;
- pooled MC: `7568.1c`;
- difference: approximately `-0.73%`;
- zero timeouts;
- zero missing states.

### Craft C

- analytical: `42814.4c`;
- pooled MC: `42483.5c`;
- difference: approximately `-0.77%`;
- one timeout / 10,000;
- zero missing states.

Preserve these as regression fixtures.

---

# Findings That Need Correction Before Production UI

# Finding 1 — Mechanics-Relevant Metadata Is Missing From Canonical State Identity

## Severity

**HIGH — state-equivalence correctness**

`ItemState` now has:

```ts
metadata?: Record<string, unknown>
```

The shared Fracturing mechanic changes legality based on metadata such as:

```text
influenced
synthesised
```

But `getCanonicalStateKey()` does not include `metadata`.

Therefore two states can currently have the same canonical key while having different legal action sets.

Example:

```text
State A:
Rare, four mods, not influenced
-> Fracturing Orb legal

State B:
Rare, same four mods, influenced
-> Fracturing Orb illegal
```

If they share a Bellman key, the strict state-equivalence contract is violated.

## Required fix

Do not serialize arbitrary metadata wholesale.

Create a typed mechanics-relevant state flags structure, for example:

```ts
interface ItemStateFlags {
  influenced?: boolean;
  synthesised?: boolean;
  // only add flags that actually alter modeled legality/transitions
}
```

Then include every mechanics-relevant flag in:

- canonical state identity;
- physical state equality/signatures used by restart/acquisition logic.

Add runtime diagnostics proving:

```text
same affixes + influenced=false
!=
same affixes + influenced=true
```

and that Fracturing legality differs as expected.

---

# Finding 2 — Fracture State Has Two Sources of Truth

## Severity

**HIGH — future generic-state robustness**

Fracture identity currently exists in both:

```text
RolledMod.isFractured
ItemState.fracturedModIds
```

Different parts of the engine use these differently.

Examples:

- Scour correctly checks the union;
- Fracturing legality checks the union;
- `getRemovableAffixes()` checks the union;
- canonical state identity currently prefixes `FRAC:` from `m.isFractured` only;
- magic reroll preparation preserves `state.prefixes.filter(p => p.isFractured)` / suffix equivalent;
- target `mustBeFractured` matching relies on `isFractured` on the mod.

This is safe only if every state is perfectly normalized forever.

That invariant is not explicit enough for the future UI/import/API boundary.

## Required fix

Choose one architecture.

Preferred:

### Option A — make `RolledMod.isFractured` authoritative

Normalize every incoming ItemState so:

```text
fracturedModIds
and
isFractured
```

cannot disagree.

Then consider deprecating `fracturedModIds` after migration.

OR:

### Option B — use a single helper everywhere

For example:

```ts
isFracturedMod(state, mod)
```

and never directly inspect only one representation.

Whichever approach is chosen, add runtime diagnostics for intentionally inconsistent fixture states and prove normalization occurs before solver search.

This must be fixed before accepting arbitrary UI-created/imported states.

---

# Finding 3 — Target-Sensitive Canonicalization Should Include Every Target Branch

## Severity

**MEDIUM**

`getCanonicalStateKey()` currently builds target-sensitive requirements primarily from:

```text
requiredMods
outcomeBranches
```

The project also supports:

```text
acceptableAnyOf
finalRollRequirements
mustBeFractured
```

The final UI may eventually express alternatives/branches.

Ensure canonical target sensitivity uses one normalized flattened target-requirement representation rather than each subsystem independently deciding which target fields matter.

Recommended helper:

```ts
getAllTargetModRequirements(target)
```

Use it in:

- canonical key generation;
- display/reporting;
- target-progress heuristics;
- starting-state candidate generation where applicable.

---

# Finding 4 — Generic Bellman Search Still Does Not Execute Harvest

## Severity

**HIGH — final 1–4-mod product capability**

This is now the largest missing action-family issue.

`getLegalActions()` can discover data-driven Harvest metadata via `getHarvestMechanicsForState(...)`.

However, those returned Harvest mechanics currently provide legality/cost/metadata only and do not own shared executable transitions.

`GenericSearchEngine` builds its adapters from the executable `CRAFT_MECHANICS` registry plus optional restart mechanics.

Therefore the arbitrary generic route finder cannot yet decide:

```text
Harvest
vs
Exalt
vs
Annul
vs
Scour
vs
restart
```

for a user-selected arbitrary target.

Craft A/C still have mature specialized Harvest paths, but that does not satisfy the final UI architecture.

## Required fix

Migrate the **existing current Harvest approximation** into a shared executable Harvest mechanic/provider.

Do not attempt to perfect the 1/816 external parity discrepancy in this phase.

The goal is architectural unification.

Shared Harvest needs:

- state legality;
- data-driven Harvest tag/craft definition;
- current price-confidence handling;
- analytical transition distribution;
- seeded sampled transition;
- fractured-mod preservation;
- current affix-count assumption explicitly marked APPROXIMATE;
- mechanics-confidence metadata.

The generic solver should be able to enumerate available Harvest reforges from a rare state and compare their Bellman Q-values with ordinary currency actions.

The old specialized A/C implementation can remain temporarily as a regression oracle while shared Harvest is validated.

Do not replace A/C in one step.

---

# Finding 5 — Acquisition and Restart Are Still Not One Unified Policy Decision

## Severity

**HIGH — final optimizer architecture**

The current multi-stage diagnostic now evaluates multiple generated starting states, which is an improvement.

But each starting state is still solved independently, and each `GenericSearchEngine` instance receives at most one `restartReacquire` destination.

The final product needs to answer a broader question:

> From this failure state, should I continue, restart from clean, buy/self-fracture another target mod, or reacquire another useful starting state?

A one-destination restart mechanic cannot express that.

## Required architecture

Move toward a unified acquisition portfolio.

Conceptually:

```ts
interface AcquisitionCandidate {
  physicalState: ItemState;
  methods: AcquisitionOption[];
}
```

The solver should receive all legal reacquisition destinations.

There are two acceptable designs.

### Design A — virtual acquisition state

A synthetic root/restart state has actions:

```text
Acquire clean base
Acquire fractured Int
Acquire fractured 35
Acquire fractured Life
...
```

Each action transitions to a physical state at its acquisition cost.

### Design B — multiple restart/acquisition actions

Create one restart action per acquisition method/destination.

Either way, the policy must be able to choose acquisition dynamically after a failure.

Important performance rule:

**Solve each unique physical downstream state once.**

Do not recompute the same Bellman continuation solely because one state can be acquired via multiple methods.

---

# Finding 6 — The Bounded Multi-Stage Fixture Is a Topology Proof, Not Production Proof

## Severity

**MEDIUM-HIGH**

The new five-mod multi-stage fixture is good engineering evidence.

It proves:

- the generic mechanics compose;
- cycles work;
- restart works;
- fracture/scour works;
- Bellman/occupancy reconciliation works;
- acquisition comparisons can be produced.

But it deliberately reduces the mod pool to five real mods.

Likewise, the Craft B diagnostic uses a bounded three-notable target-only pool.

Therefore values such as:

```text
Craft B EV = 0.245c
```

are **not realistic craft economics**.

They are graph-topology/mechanics integration tests.

Make that explicit in all future reports.

Use labels such as:

```text
BOUNDED MECHANICS FIXTURE — NOT PRODUCTION ECONOMICS
```

Do not display those values in the future UI as craft recommendations.

---

# Finding 7 — Full-Pool Search Scalability Is Now the Main Algorithmic Challenge

## Severity

**HIGH before user-facing UI; acceptable for developer UI with warnings**

The simple full-pool T1 Intelligence target still reports:

```text
5,000 expanded states
state cap reached
1,235 unresolved potentially cheaper competitors
```

The selected policy itself is valid and fully resolved.

But the engine cannot yet prove that it is the cheapest policy over all modeled actions.

Adding Harvest will increase the branching factor further.

Blindly raising the state cap is not the right long-term solution.

## Next search architecture

Implement incremental/lazy competitive expansion.

Suggested model:

1. find a fully resolved feasible incumbent policy and cost `U`;
2. retain unresolved candidate actions with admissible lower bound `L`;
3. if `L >= U`, safely mark candidate dominated;
4. if `L < U`, prioritize expansion of that candidate's missing successors;
5. repeat until:
   - all competitive candidates are resolved/dominated; or
   - a configured search budget is exhausted.

Return a clear proof level:

```text
OPTIMAL OVER MODELED ACTIONS: PROVEN
```

or:

```text
BEST FULLY RESOLVED POLICY FOUND
UNRESOLVED COMPETITORS MAY BE CHEAPER
```

Add explicit search budgets suitable for future UI use:

```text
maxStates
maxWallTimeMs
maxExpansionRounds
```

Report actual:

- states expanded;
- unresolved competitive candidates;
- elapsed time;
- proof level.

Do not hide search-budget exhaustion.

---

# Finding 8 — The UI Needs a Stable Service Contract Before Components

## Severity

**MEDIUM — architectural sequencing**

The project is close enough that UI Phase 1 is now realistic.

But do not connect React components directly to:

- `GenericSearchEngine` internals;
- `policyMap` Maps;
- solver caches;
- raw `ItemState` mutation details.

Create a production-facing optimizer service boundary first.

Conceptually:

```ts
interface OptimizeCraftInput {
  baseType: BaseType;
  clusterType: string;
  itemLevel: number;
  passiveCount: number;
  target: TargetDefinition;
  prices: PriceContext;
  searchBudget?: SearchBudget;
}
```

and:

```ts
interface OptimizeCraftResult {
  recommended: RouteSummary;
  alternatives: RouteSummary[];
  expectedCurrencies: Record<string, number>;
  policyRules: PolicyRule[];
  acquisition: AcquisitionSummary;
  expectedCostChaos: number;
  expectedSaleValueChaos?: number;
  expectedProfitChaos?: number;
  risk?: RiskSummary;
  priceConfidence: ConfidenceSummary;
  mechanicsConfidence: ConfidenceSummary;
  proof: OptimizationProofSummary;
  search: SearchSummary;
  warnings: string[];
}
```

The UI should only consume this contract.

---

# New LLM Work — Specific Review Summary

## Strong work

The following implementation choices should be preserved:

- `ActionResolutionStatus` with explicit unresolved/proof semantics;
- removal of finite unresolved penalty from actual value proof;
- separate on-policy graph analysis;
- exact cost reconciliation;
- real shared Exalt parity;
- real shared Fracturing parity;
- shared Scour mechanics;
- restart economics as a transition rather than a report-only concept;
- action-local vs first-discovery attribution;
- A/C regression preservation;
- generated-start route evaluation;
- post-Scour fractured start represented as magic;
- real build validation.

## Items requiring follow-up

The new LLM did not fully catch:

- metadata missing from canonical state equivalence;
- dual fracture representation;
- generic Harvest still not executable by Bellman search;
- one-restart-destination limitation;
- bounded-fixture results potentially looking more production-ready than they are;
- full-pool unresolved competitor count remaining high.

These are normal next-stage issues rather than reasons to revert the new work.

---

# Recommended Next Phase

## Phase Name

**Pre-UI Production Search Hardening**

This should be the final significant backend architecture phase before Developer UI Phase 1.

---

# Phase Implementation Order

## Step 1 — Harden physical state invariants

Implement:

- typed mechanics-relevant state flags;
- metadata-aware canonical identity;
- metadata-aware physical equality/restart identity;
- one authoritative fracture-state invariant;
- normalization at all external/API/fixture boundaries;
- normalized flattened target-requirement helper.

Add runtime diagnostics.

No unit tests.

## Step 2 — Unify acquisition and reacquisition decisions

Replace one-destination restart architecture with an acquisition portfolio.

The solver must be able to compare all configured physical starts/restarts dynamically.

Guarantee one downstream solve per unique physical state where possible.

## Step 3 — Make Harvest a shared executable generic action

Port current Harvest behavior into the shared action architecture.

Do not tune mechanics to Craft of Exile.

Mark mechanics confidence:

```text
APPROXIMATE / EXTERNALLY CLOSE
```

Then prove the generic solver can compare Harvest against ordinary actions on representative rare states.

## Step 4 — Implement lazy competitive expansion

Use the existing incumbent/lower-bound concepts to expand unresolved candidates only when they could still beat the best resolved policy.

Do not attempt to fully enumerate the production graph up front.

Add wall-time/state/round budgets and proof-aware output.

## Step 5 — Run a full-pool generic multi-mod smoke test

Do NOT use a reduced mod pool for this validation.

Choose a manageable real target such as a two-mod cluster target and run against the complete actual cluster pool.

The purpose is to measure:

- full-pool state growth;
- generic Harvest participation where legal/useful;
- restart/acquisition switching;
- search budget behavior;
- proof level;
- runtime;
- expected-cost reconciliation.

If full optimality is not proven, that is acceptable if the engine reports the limitation honestly.

## Step 6 — Re-run Craft B using the real pool

The bounded Craft B fixture may remain as a mechanics smoke test.

Add a separate full-pool Craft B discovery run when the lazy search can support it.

Do not expect the `0.245c` bounded-fixture number to survive.

Do not add a Craft-B-specific route.

## Step 7 — Finalize the optimizer service contract

Expose a serializable request/result boundary suitable for React.

Do not expose internal `Map` objects or solver implementation details.

## Step 8 — Declare Developer UI Phase 1 readiness

At the end of this phase, produce an explicit gate report.

---

# Developer UI Phase 1 Gate

Developer UI Phase 1 is ready when all of these are true:

- [ ] `npm run build` passes;
- [ ] mechanics-relevant metadata is part of canonical state identity;
- [ ] fracture state cannot have contradictory representations;
- [ ] acquisition/restart can choose among multiple configured starts;
- [ ] shared Harvest is Bellman-searchable;
- [ ] Scour is Bellman-searchable;
- [ ] Exalt is Bellman-searchable;
- [ ] Fracturing is Bellman-searchable;
- [ ] search budget/proof level is exposed;
- [ ] one full-pool multi-mod generic run completes with honest proof status;
- [ ] A/C regressions remain healthy or any mechanics-driven changes are explained;
- [ ] output result object is serializable and UI-facing;
- [ ] price-confidence warnings survive;
- [ ] mechanics-confidence warnings survive.

At that point begin the thin developer UI.

The UI does **not** need global optimality on every possible target before it can exist.

It does need to know when optimality was not proven.

---

# Developer UI Phase 1 Scope — Do Not Implement Yet In This Phase

When the above gate passes, the next phase should be a thin React UI containing:

```text
Base Type
Cluster Type
Item Level
Passive Count
1–4 Desired Mods
[ Optimize ]
```

Result view:

```text
Recommended route
Expected cost
Acquisition method
Expected currency counts
Representative policy rules
Alternative routes
Proof level
Search-budget status
Price confidence
Mechanics confidence
Warnings
```

Do not put crafting logic in React components.

---

# Validation Requirements

## Build

Run:

```text
npm run build
```

Do not add unit tests.

## Existing regressions

Re-run Craft A and Craft C.

### Craft A guardrails

Current reference:

```text
Analytical: 7623.7c
Pooled MC:  7568.1c
Difference: ~-0.73%
```

Keep:

- zero missing states;
- zero fallback actions;
- stable terminal branches;
- no unexplained timeout regression.

### Craft C guardrails

Current reference:

```text
Analytical: 42814.4c
Pooled MC:  42483.5c
Difference: ~-0.77%
```

Keep:

- zero missing states;
- zero fallbacks;
- completion >=99%;
- censoring explicit.

If shared Harvest changes these values because mechanics are intentionally unified, report the exact reason rather than tuning old values back.

## New state-identity diagnostics

Prove:

```text
influenced state key != non-influenced state key
synthesised state key != normal state key
fractured state normalized consistently
restart physical equality respects mechanics-relevant state flags
```

## Generic Harvest diagnostics

For at least one representative rare state print:

```text
Harvest action
analytical transitions
seeded sampled result distribution
price confidence
mechanics confidence
candidate Q-value vs Exalt/Annul/Scour/restart
```

## Acquisition portfolio diagnostics

Print all acquisition/restart destinations and their costs.

Show at least one state where:

```text
restart to candidate A wins
```

and another where:

```text
continue or restart to candidate B wins
```

## Full-pool generic diagnostic

Print:

- target;
- real full pool size;
- starting candidates;
- actions enabled;
- states expanded;
- elapsed solve time;
- state/search budget usage;
- best resolved route;
- alternative acquisition routes;
- unresolved competitive candidates;
- proof level;
- expected currencies;
- EV reconciliation;
- price warnings;
- mechanics warnings.

---

# Constraints

Do not:

- add unit tests;
- reintroduce Allflame;
- add Craft-specific solver branches;
- create separate 1/2/3/4-mod algorithms;
- hardcode Craft of Exile probabilities;
- replace bounded fixtures with claims of real economics;
- hide unresolved competitors;
- put crafting strategy logic in UI code;
- broadly rewrite stable Craft A/C code without a verified mechanics reason.

Keep:

```text
GAME-MECHANICS FIDELITY: PARTIAL
```

until Harvest and the other remaining assumptions are independently validated.

Keep:

```text
GLOBAL OPTIMALITY: NOT YET PROVEN
```

unless a specific result actually proves optimality over its complete modeled action/state space.

---

# Required Completion Report

When this phase is finished, commit implementation and regenerated outputs to `main` and report:

1. commit SHA;
2. files changed;
3. `npm run build` result;
4. canonical metadata/state-flag changes;
5. fracture-state source-of-truth decision;
6. target-requirement normalization changes;
7. acquisition/restart portfolio architecture;
8. duplicate physical-state solve behavior;
9. generic Harvest transition architecture;
10. Harvest mechanics-confidence label;
11. lazy competitive expansion behavior;
12. state/search budgets;
13. full-pool generic multi-mod result;
14. solve runtime and state count;
15. unresolved competitive candidate count;
16. proof level;
17. Craft B full-pool result if completed;
18. Craft A regression;
19. Craft C regression;
20. optimizer service contract shape;
21. whether Developer UI Phase 1 gate is now PASS or FAIL.

---

# Bottom Line

The new LLM's implementation is a clear improvement over the previous pass and should be kept.

The engine has crossed from "mechanics scaffolding" into a real generic cyclic crafting policy engine.

The next phase should **not** add more exotic crafting systems.

It should make the existing core engine production-shaped:

```text
correct physical state identity
+
multiple acquisition/restart choices
+
generic Harvest
+
lazy proof-aware full-pool search
+
stable service contract
```

Once those are in place, begin Developer UI Phase 1.
