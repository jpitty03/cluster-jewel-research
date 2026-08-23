# Post Core-Mechanics Review and Pre-UI Hardening Plan

## Review Scope

This review covers the current `main` implementation after:

- `67afd55e849fd6d5fb71bf1f45b0f250818c59c2` — `feat: harden generic solver and add core mechanics`
- `9e62c7ded818d9d933dcab953b0038ee99f67d46` — `fix: evaluate generic starting routes`

The prior implementation baseline was:

- `8631353d62f25c23a78e04d872df4cce7e34d30b` — `Implement on-policy graph separation, candidate resolution status, action state attribution, and 2.6M+ CoE parity`

The purpose of this review is to:

1. verify the current generic solver/core mechanics architecture;
2. identify correctness gaps exposed by the larger action frontier;
3. decide whether the backend is ready for UI work;
4. define the final backend-hardening phase before Developer UI Phase 1.

---

# Executive Verdict

The current implementation is substantially closer to the final product.

Important improvements now present include:

- finite unresolved-branch penalties removed from actual value proof;
- selected-policy validity separated from global optimality claims;
- recursive candidate-resolution state;
- real TypeScript/Vite build validation;
- shared Scour, Restart/Reacquire, Exalt, and Fracturing mechanics;
- shared executable Exalt/Fracture external parity checks;
- corrected action-attribution reporting;
- a cyclic multi-stage generic route;
- stable Craft A/C regressions;
- generated starting routes actually evaluated;
- fractured starting candidates represented as their post-Scour magic state.

However, the backend is **not yet ready to claim arbitrary 1–4-mod least-cost optimization**.

The remaining work is concentrated in a small number of important areas:

1. canonical state identity does not include all mechanics-relevant flags;
2. fractured state is represented in two places and needs one explicit invariant;
3. generic Bellman search still does not execute Harvest reforges;
4. acquisition/restart choices are not yet one unified policy decision;
5. full-pool search still leaves potentially competitive unresolved routes;
6. the successful multi-stage proof uses a bounded five-mod fixture rather than the full production pool;
7. a stable serializable optimizer service contract should exist before React components consume results.

This should be the focus of **one final backend architecture phase before Developer UI Phase 1**.

---

# What Is Working Well

## 1. Selected-policy correctness

Current clean-base T1 Intelligence policy reports:

- full graph: 5,000-state cap reached;
- on-policy states: 1,360;
- on-policy unresolved probability: 0%;
- terminal absorption: effectively 100%;
- Bellman converged;
- Markov occupancy converged;
- action-cost sum and Bellman EV reconcile to approximately `0.0003c`;
- selected policy is fully resolved/proper/absorbing;
- global optimality remains explicitly unproven.

This is the correct distinction.

## 2. Action attribution

The output now distinguishes:

- action-local unique successor keys produced;
- first global discoveries;
- on-policy states selecting the action;
- unresolved outgoing edges.

This avoids confusing queue ownership with whether an action actually generates states.

## 3. Shared Scour

The diagnostic demonstrates:

- ordinary magic -> normal;
- ordinary rare -> normal;
- fractured item -> retains fractured explicit and receives the corresponding post-Scour rarity.

Analytical and sampled transitions agree in the current diagnostic.

## 4. Restart/Reacquire

The solver can compare:

```text
continue current item
vs
abandon + reacquire
```

and diagnostics demonstrate both restart-winning and continue-winning states.

## 5. Shared Exalt

Current parity:

```text
Analytical: 3.8062%
Seeded MC:  3.8350%
External:   3.5921% (31 / 863)
```

This is healthy. Do not tune Exalt weights to the external sample.

## 6. Shared Fracturing

Current parity:

```text
Analytical: 25.0000%
Seeded MC:  24.9550%
External:   25.0000%
```

This is healthy.

## 7. Harvest parity framing

Harvest and post-Harvest Annul are no longer presented as fully executable shared parity checks when they are not.

The compound Harvest observation remains:

```text
Craft of Exile: ~0.122529% (~1 / 816.1)
Current engine approximation: ~0.1460% (~1 / 684.9)
Assessment: CLOSE / APPROXIMATE — engine ~19% optimistic
```

Keep this non-blocking.

## 8. Cyclic multi-stage generic policy

The bounded five-mod fixture demonstrates a generic policy family containing:

```text
normal
-> magic
-> rare
-> fracture
-> scour/reset
-> continue
-> finish
```

with cycles, restart decisions, proper absorption, and expected-cost reconciliation.

This is an architecture/topology proof, not production-economics proof.

## 9. Craft A/C regressions

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

# Findings To Correct Before Production UI

## Finding 1 — Mechanics-Relevant State Flags Are Missing From Canonical Identity

### Severity

**HIGH — state-equivalence correctness**

`ItemState` now exposes generic metadata while Fracturing legality depends on mechanics-relevant values such as:

```text
influenced
synthesised
```

`getCanonicalStateKey()` does not currently encode these flags.

Therefore two otherwise identical states may share a Bellman key while having different legal action sets.

Example:

```text
Rare 4-mod non-influenced item
-> Fracturing legal

Same affixes but influenced
-> Fracturing illegal
```

Those states must not share a canonical key.

### Required fix

Do not serialize arbitrary metadata wholesale.

Introduce a typed mechanics-relevant flags structure, e.g.:

```ts
interface ItemStateFlags {
  influenced?: boolean;
  synthesised?: boolean;
}
```

Include every modeled mechanics-relevant flag in:

- canonical state identity;
- physical state equality/signatures;
- acquisition/restart identity.

Add runtime diagnostics proving that equivalent affixes with different mechanics flags have different canonical keys and different Fracturing legality.

---

## Finding 2 — Fracture State Has Two Sources of Truth

### Severity

**HIGH — generic-state robustness**

Fracture identity currently exists in both:

```text
RolledMod.isFractured
ItemState.fracturedModIds
```

Different subsystems inspect these values differently.

Current examples include:

- Scour checking the union;
- Fracturing legality checking the union;
- removable-affix logic checking the union;
- canonical state identity primarily using `isFractured`;
- magic-reroll preparation preserving `isFractured` mods;
- `mustBeFractured` target matching relying on mod fracture state.

This is only safe if every state is normalized before it reaches solver logic.

### Required fix

Choose one explicit invariant.

Preferred approach:

1. make `RolledMod.isFractured` authoritative;
2. normalize every incoming `ItemState` so `fracturedModIds` and mod flags cannot disagree;
3. gradually deprecate redundant state if practical.

An acceptable alternative is one authoritative helper such as:

```ts
isFracturedMod(state, mod)
```

used everywhere.

Add diagnostics with intentionally inconsistent states and prove normalization occurs before search.

---

## Finding 3 — Normalize All Target Requirements Once

### Severity

**MEDIUM**

Target-sensitive logic currently draws from multiple structures:

```text
requiredMods
outcomeBranches
acceptableAnyOf
finalRollRequirements
mustBeFractured
```

Avoid each subsystem independently flattening only some of these fields.

Introduce a normalized helper such as:

```ts
getAllTargetModRequirements(target)
```

and use it consistently in:

- canonical state identity;
- target-progress heuristics;
- starting-state discovery;
- reporting/display where applicable.

Roll requirements should remain represented separately when actual roll values affect target satisfaction or future action outcomes.

---

## Finding 4 — Generic Bellman Search Still Needs Executable Harvest

### Severity

**HIGH — final 1–4-mod product capability**

Harvest metadata can be discovered, but the generic Bellman engine still cannot execute Harvest transitions from the same shared mechanics layer used for ordinary currency actions.

The final optimizer must be able to compare:

```text
Harvest
vs
Exalt
vs
Annul
vs
Scour
vs
restart/reacquire
```

for arbitrary user-selected targets.

### Required fix

Migrate the **current Harvest approximation** into a shared executable Harvest mechanic/provider.

Do not attempt to perfect the external `~1/816` compound benchmark in this phase.

The goal is architecture unification.

Shared Harvest must provide:

- state legality;
- data-driven Harvest tag/craft definition;
- price-confidence handling;
- analytical transition distribution;
- seeded sample transition;
- fractured-mod preservation;
- explicit mechanics-confidence metadata;
- the current affix-count assumption clearly labeled approximate.

The generic solver should enumerate available Harvest reforges for a rare state and calculate Bellman Q-values alongside other mechanics.

Keep the specialized Craft A/C Harvest implementation temporarily as a regression oracle. Do not replace it all at once.

---

## Finding 5 — Acquisition and Restart Need One Unified Policy Space

### Severity

**HIGH — final optimizer architecture**

Current diagnostics evaluate multiple generated starting states, but each start is still solved separately and each solver run supports at most one configured restart/reacquire destination.

The production question is broader:

> From this failure state, should I continue, restart from clean, reacquire fractured mod A, reacquire fractured mod B, buy a market base, or self-fracture another base?

### Required architecture

Move toward an acquisition portfolio.

Conceptually:

```ts
interface AcquisitionCandidate {
  physicalState: ItemState;
  methods: AcquisitionOption[];
}
```

Possible implementation designs:

### A. Virtual acquisition state

A synthetic state exposes actions such as:

```text
Acquire clean base
Acquire fractured Int
Acquire fractured 35
Acquire fractured Life
...
```

Each transitions to a physical state at its acquisition cost.

### B. Multiple acquisition/restart actions

Create one action per acquisition method/destination.

Either way:

- the policy must choose dynamically after failures;
- market and self-fracture methods must remain distinct;
- price confidence must survive;
- the same physical downstream state should be solved once where possible.

---

## Finding 6 — Bounded Fixtures Are Topology Proofs, Not Production Economics

### Severity

**MEDIUM-HIGH**

The five-mod multi-stage fixture is valuable because it proves mechanics composition, cycles, restart, fracture/scour behavior, Bellman convergence, occupancy convergence, and cost reconciliation.

But it deliberately restricts the pool.

Likewise, the bounded Craft B run uses a reduced target-only pool.

Therefore values such as:

```text
Craft B EV = 0.245c
```

are not realistic craft economics.

All such diagnostics should be labeled clearly:

```text
BOUNDED MECHANICS FIXTURE — NOT PRODUCTION ECONOMICS
```

Do not expose bounded-fixture costs as user recommendations.

---

## Finding 7 — Full-Pool Search Scalability Is Now The Main Algorithmic Challenge

### Severity

**HIGH before user-facing UI; acceptable for developer UI with explicit warnings**

The simple full-pool T1 Intelligence target still reports approximately:

```text
5,000 expanded states
state cap reached
1,235 unresolved potentially cheaper competitors
```

The selected policy itself is fully resolved, proper, absorbing, and reconciled.

But the engine cannot prove it is cheapest over all modeled actions.

Adding generic Harvest will increase branching further.

Do not solve this by blindly increasing `maxStates`.

### Required direction — lazy competitive expansion

Use the existing incumbent/lower-bound ideas:

1. find a fully resolved feasible incumbent with cost `U`;
2. retain unresolved candidates with admissible lower bound `L`;
3. if `L >= U`, safely mark the candidate dominated;
4. if `L < U`, prioritize expansion of its missing successors;
5. repeat until all competitive candidates are resolved/dominated or the configured search budget is exhausted.

Expose explicit budgets suitable for UI/API calls:

```text
maxStates
maxWallTimeMs
maxExpansionRounds
```

Return honest proof levels:

```text
OPTIMAL OVER MODELED ACTIONS: PROVEN
```

or:

```text
BEST FULLY RESOLVED POLICY FOUND
UNRESOLVED COMPETITORS MAY BE CHEAPER
```

Report:

- states expanded;
- elapsed solve time;
- unresolved competitive candidates;
- budget exhaustion;
- proof level.

---

## Finding 8 — Finalize A Stable UI-Facing Service Contract Before Components

### Severity

**MEDIUM — architectural sequencing**

Do not connect React directly to:

- `GenericSearchEngine` internals;
- raw `Map` objects;
- solver caches;
- mutable internal `ItemState` details.

Create a serializable optimizer boundary first.

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

The frontend should only consume this contract.

---

# Recommended Next Phase

## Phase Name

**Pre-UI Production Search Hardening**

This should be the final significant backend architecture phase before Developer UI Phase 1.

---

# Phase Implementation Order

## Step 1 — Harden Physical State Invariants

Implement:

- typed mechanics-relevant state flags;
- metadata-aware canonical identity;
- metadata-aware physical equality/restart identity;
- one authoritative fracture-state invariant;
- normalization at external/API/fixture boundaries;
- normalized flattened target-requirement helper.

Add runtime diagnostics.

No unit tests.

## Step 2 — Unify Acquisition and Reacquisition Decisions

Replace one-destination restart semantics with an acquisition portfolio.

The solver must be able to compare all configured physical starts/restarts dynamically.

Avoid recomputing the same downstream physical state solely because it has multiple acquisition methods.

## Step 3 — Make Harvest A Shared Executable Generic Action

Port the current Harvest behavior into the shared mechanics architecture.

Do not tune it to Craft of Exile.

Keep mechanics confidence:

```text
APPROXIMATE / EXTERNALLY CLOSE
```

Then prove the generic solver can compare Harvest against ordinary actions on representative rare states.

## Step 4 — Implement Lazy Competitive Expansion

Use the incumbent/lower-bound architecture to expand unresolved candidates only while they could beat the best fully resolved policy.

Add wall-time/state/round budgets and proof-aware output.

## Step 5 — Run A Full-Pool Generic Multi-Mod Smoke Test

Do **not** use a reduced mod pool for this validation.

Choose a manageable real two-mod cluster target and run against the complete actual pool.

Measure:

- full-pool state growth;
- generic Harvest participation where legal/useful;
- acquisition/restart switching;
- search-budget behavior;
- proof level;
- runtime;
- expected-cost reconciliation.

Full optimality is not required if the engine reports its limitation honestly.

## Step 6 — Re-run Craft B Using The Real Pool

Keep the bounded Craft B fixture as a mechanics smoke test if useful.

Add a separate full-pool Craft B discovery run once lazy search supports it.

Do not add a Craft-B-specific solver.

Do not expect the bounded `0.245c` value to survive.

## Step 7 — Finalize The Optimizer Service Contract

Expose a serializable request/result boundary suitable for React.

Do not expose internal maps, caches, or implementation-specific solver objects.

## Step 8 — Declare Developer UI Phase 1 Readiness

Produce an explicit gate report.

---

# Developer UI Phase 1 Gate

Developer UI Phase 1 is ready when all of these are true:

- [ ] `npm run build` passes;
- [ ] mechanics-relevant state flags are part of canonical identity;
- [ ] fracture state cannot have contradictory representations at solver entry;
- [ ] acquisition/restart can choose among multiple configured starts;
- [ ] shared Harvest is Bellman-searchable;
- [ ] Scour is Bellman-searchable;
- [ ] Exalt is Bellman-searchable;
- [ ] Fracturing is Bellman-searchable;
- [ ] search budget/proof level is exposed;
- [ ] one full-pool multi-mod generic run completes with honest proof status;
- [ ] A/C regressions remain healthy or mechanics-driven changes are explained;
- [ ] result object is serializable and UI-facing;
- [ ] price-confidence warnings survive;
- [ ] mechanics-confidence warnings survive.

At that point begin the thin Developer UI.

The UI does **not** need global optimality on every possible target before it can exist.

It does need to know when optimality was not proven.

---

# Developer UI Phase 1 Scope — Do Not Implement Yet In This Phase

Once the gate passes, the next phase should be a thin React UI containing:

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

If shared Harvest intentionally changes these values, report the exact mechanics reason instead of tuning old values back.

## State-identity diagnostics

Prove:

```text
influenced state key != non-influenced state key
synthesised state key != ordinary state key
fractured state normalized consistently
restart physical equality respects mechanics-relevant state flags
```

## Generic Harvest diagnostics

For at least one representative rare state print:

```text
Harvest action
analytical transitions
seeded sampled distribution
price confidence
mechanics confidence
candidate Q-value vs Exalt/Annul/Scour/restart
```

## Acquisition portfolio diagnostics

Print all acquisition/restart destinations and costs.

Demonstrate at least:

- one state where restart to candidate A wins;
- another state where continuing or restart to candidate B wins.

## Full-pool generic diagnostic

Print:

- target;
- full real pool size;
- starting candidates;
- enabled actions;
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
- present bounded-fixture economics as production results;
- hide unresolved competitors;
- put crafting-strategy logic in UI code;
- broadly rewrite stable Craft A/C code without a verified mechanics reason.

Keep:

```text
GAME-MECHANICS FIDELITY: PARTIAL
```

until remaining mechanics assumptions are independently validated.

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
21. whether Developer UI Phase 1 gate is PASS or FAIL.

---

# Bottom Line

The engine has crossed from mechanics scaffolding into a real generic cyclic crafting policy engine.

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
