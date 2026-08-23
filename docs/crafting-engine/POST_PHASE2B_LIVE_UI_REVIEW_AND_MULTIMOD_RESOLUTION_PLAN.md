# Post Phase 2B Live UI Review and Multi-Mod Resolution Plan

## Review Scope

This review covers current `main` at:

- `93d66a728b5af0e6ac6854e2dcf7f2b0cc57d66b` — `feat: harden proof-honest optimizer search`

Primary implementation and diagnostics reviewed:

- `crafting-engine/src/solver/genericSearch.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/src/service/searchRuntime.ts`
- `crafting-engine/src/service/optimizerValidation.ts`
- `src/CraftOptimizer.tsx`
- `src/crafting/optimizerWorkerClient.ts`
- `src/crafting/optimizerPricing.ts`
- `output-developer-ui-phase2b.txt`
- `output-browser-phase2b-smoke.txt`
- Craft A/C regression outputs
- live browser/UI results supplied after Phase 2B for:
  - one-mod T1 Maximum Energy Shield / `Glowing (T1)`;
  - two-mod `Glowing (T1)` + `of the Prodigy (T1)` with final rarity `Any`.

This document is the source of truth for the next implementation pass.

---

# Executive Verdict

## Phase 2B

**PASS WITH AN IMPORTANT MULTI-MOD SEARCH QUALIFICATION.**

Phase 2B materially improved the product path.

The implementation successfully established:

- fast, useful one-mod recommendations;
- proof-honest `RECOMMEND / DEEPEN / PROVE` semantics;
- cooperative engine deadlines plus a host worker failsafe;
- correct worker recovery after cancellation/timeout;
- admissible optimistic lower bounds over the partial graph;
- independent market snapshot / currency / base-quote freshness reporting;
- friendly target display;
- compact branching policy explanations;
- preserved Craft A and Craft C regressions;
- preserved Harvest confidence as `APPROXIMATE / EXTERNALLY CLOSE`.

The live one-mod UI result confirms that the previous 1534c self-fracture failure is fixed in the actual browser path.

However, the live two-mod `Any`-rarity result exposed the next major search-quality issue:

> The optimizer can find a fully resolved expensive fractured route while a very plausible clean-base route remains unresolved with a dramatically lower optimistic bound.

That situation is currently rendered as `BEST_RESOLVED` and prominently shown as the recommended acquisition.

The internal proof warning is honest, but the product-level recommendation is still too strong.

## Recommended next phase

> **Developer UI Phase 2C — Multi-Mod Acquisition Resolution, Recommendation Confidence, and Search Frontier Efficiency**

The next phase should not add new crafting mechanics.

The priority is to make `RECOMMEND` reliably identify a useful acquisition family for ordinary 1–2 mod crafts before spending the state budget on proof-only or rarity-escalating branches.

---

# Confirmed Strengths From Phase 2B

## 1. One-mod live UI behavior is now correct

The live UI run for a 12-passive ilvl 84 Large Cluster Jewel with one exact `Glowing (T1)` target selected:

```text
Clean Base
Expected cost: ~8.784c
Status: BEST_RESOLVED
Worker round trip: ~1.17s
Terminal absorption: 100%
Unresolved on-policy probability: 0%
EV reconciliation: 0.000c displayed
```

The selected policy family is sensible:

```text
clean base
-> Transmutation
-> Alteration on full/one-prefix magic misses
-> Augmentation on one-suffix magic misses
-> terminal when T1 ES is present
```

This is the desired product behavior.

Preserve it as a permanent browser regression.

## 2. Runtime architecture is now healthy

The engine deadline and host guard are correctly separated.

Normal fixtures return cooperatively without requiring worker termination.

The host guard remains a last-resort safety net rather than the normal exit path.

Preserve:

```text
requested wall time
-> engine deadline before host deadline
-> cooperative engine return
-> host terminate/recreate only if engine fails to return
```

## 3. Search proof language is much safer

The engine now keeps unresolved competitors explicit and does not convert unknown descendants into giant fake Q-values.

The optimistic lower-bound model is conservative:

```text
known non-negative immediate costs
+
unknown continuation initialized to zero
```

This is an admissible underestimate.

Keep the rule:

```text
prune only when lower bound >= incumbent upper bound
```

Do not replace it with heuristic cost inflation.

## 4. Market evidence reporting is useful

The UI now distinguishes:

- snapshot age;
- currency-rate age;
- exact base-quote age;
- manual overrides;
- missing mappings;
- stale evidence.

The live browser test correctly showed stale Allflame market data rather than silently treating it as fresh.

Preserve the provenance model.

## 5. Branching policy explanations are a strong direction

The UI now exposes grouped Bellman rules instead of pretending the policy is one deterministic sequence.

Keep this architecture.

The presentation order needs refinement, but the data source is correct.

---

# Finding 1 — Live Two-Mod `Any` Search Still Fails To Resolve The Most Important Acquisition Competitor

## Severity

**CRITICAL for multi-mod recommendation quality**

The live UI test used:

```text
Large Cluster Jewel
10% increased Attack Damage
ilvl 84
12 passives
Final rarity: Any
clean base override: 4c
Targets:
- Glowing (T1) / T1 Maximum Energy Shield
- of the Prodigy (T1) / T1 Intelligence
```

The returned result was approximately:

```text
Selected acquisition:
Approximate self-fracture: Glowing (T1)

Expected total:
~1500.058c

Clean-base acquisition:
UNRESOLVED
Lower bound: 4.000c

States expanded:
5000

Expansion rounds:
3 / 3

Budget exhausted:
YES

First acquisition-safe recommendation:
NOT REACHED
```

The selected fractured policy itself is a valid resolved policy:

```text
fractured T1 ES
-> Alteration
-> Augmentation where appropriate
-> T1 Intelligence
```

The problem is not that this policy is invalid.

The problem is that a clean-base acquisition route remains unresolved even though its lower bound is orders of magnitude below the ~1500c incumbent.

For a target that can legally finish as a two-affix magic item, the clean rolling family is an extremely important competitor and should receive enough recommendation-phase search attention to establish a feasible upper bound.

## Required behavior

For this exact class of target, the default `RECOMMEND` search must do one of two things:

### Preferred

Resolve a clean-base feasible policy and compare its actual expected cost to the fractured candidates.

### Acceptable fallback

If the clean route still cannot be resolved within the configured recommendation budget, do **not** present the fractured route as an ordinary `BEST_RESOLVED` recommendation.

Instead, clearly mark the result as provisional because acquisition selection itself is not safe.

---

# Finding 2 — `BEST_RESOLVED` Currently Conflates “Executable Policy Found” With “Acquisition Recommendation Is Safe”

## Severity

**HIGH — product semantics**

The service currently returns:

```text
PROVEN_OPTIMAL
BEST_RESOLVED
NO_RESOLVED_ROUTE
```

A route qualifies as `BEST_RESOLVED` when the selected acquisition's chosen policy is fully resolved/proper/absorbing/cost-reconciled, even if another acquisition route is unresolved and could be dramatically cheaper.

Phase 2B already computes a stronger concept:

```text
first acquisition-safe recommendation
```

The live two-mod `Any` result reported that this milestone was **not reached**.

Yet the UI still displayed:

```text
Best resolved route found
Recommended acquisition: Glowing (T1)
```

This is internally honest because warnings are shown, but it is not strong enough product language.

## Required contract refinement

Separate these concepts explicitly:

1. **Selected policy executable/certified**
2. **Acquisition selection safe against unresolved acquisition competitors**
3. **Modeled-action optimality proven**

A recommended shape is:

```ts
recommendationStatus:
  | 'PROVEN_OPTIMAL'
  | 'BEST_RESOLVED_ACQUISITION_SAFE'
  | 'PROVISIONAL_RESOLVED'
  | 'NO_RESOLVED_ROUTE'
```

Equivalent naming is acceptable.

### Meaning

`PROVEN_OPTIMAL`
- selected policy certified;
- acquisition safe;
- all modeled-action proof gates pass.

`BEST_RESOLVED_ACQUISITION_SAFE`
- selected policy certified;
- no unresolved acquisition candidate can beat the selected acquisition under current valid bounds;
- internal/off-policy action proof may still be incomplete.

`PROVISIONAL_RESOLVED`
- an executable fully resolved policy exists;
- at least one unresolved acquisition route has a lower bound below the incumbent;
- therefore the product should not imply that acquisition is the recommended economic choice.

`NO_RESOLVED_ROUTE`
- no executable certified policy found.

## UI behavior

For `PROVISIONAL_RESOLVED`, use language such as:

```text
Provisional resolved route
A cheaper acquisition route is still unresolved.
```

Do not headline it as simply:

```text
Recommended acquisition
```

Show:

```text
resolved incumbent U
best unresolved acquisition lower bound L
potential gap U - L
```

For the live two-mod fixture this gap is enormous and therefore highly material.

---

# Finding 3 — Recommendation Search Needs Fair Acquisition-Route Feasibility Before Global Proof Competition

## Severity

**HIGH — search architecture**

The current search still uses one global state budget and one global expansion queue.

That makes it possible for one acquisition family or one large rarity branch to consume enough expansion capacity that another economically important acquisition family never receives enough state coverage to produce a feasible policy.

This is exactly what the live two-mod `Any` test suggests.

## Required architecture

Add a generic acquisition-feasibility stage before broad proof search.

For every distinct acquisition physical state:

```text
clean base
market fractured target A
self-fractured target A
market fractured target B
self-fractured target B
...
```

attempt to obtain a **feasible certified policy upper bound** using a fair bounded share of recommendation resources.

This must remain generic over the generated acquisition portfolio.

Do not add clean-base-specific or Craft-A-specific algorithms.

## Important principle

A feasible selected policy cost is a valid **upper bound** even when cheaper actions remain unresolved.

Do not require global/local action optimality merely to record an executable route's cost.

Track separately:

```text
feasible policy upper bound
vs
unresolved action lower bounds
```

Then the acquisition menu can compare:

```text
candidate A: feasible U = ...
candidate B: feasible U = ...
candidate C: no feasible U yet, optimistic L = ...
```

This gives the optimizer a much stronger basis for an actual recommendation.

## Fairness requirement

No one acquisition candidate should be allowed to starve all other acquisition candidates before each plausible candidate receives its recommendation-stage feasibility attempt.

Possible implementations include:

- per-acquisition expansion quotas;
- round-robin candidate frontiers;
- candidate-specific feasibility queues feeding one shared canonical graph;
- another equivalent design that preserves shared state deduplication.

Do not duplicate physical states unnecessarily when two acquisition methods lead to the same canonical item state.

---

# Finding 4 — Expansion Priority Is Not Sufficiently Target-Rarity-Aware

## Severity

**HIGH for 1–2 mod `Any` targets**

The current target-progress priority assigns a base preference by rarity approximately like:

```text
rare  > magic > normal
```

before adding target-match bonuses.

That is reasonable for many rare end states, but it is counterproductive when the target can already be completed as a magic item.

For the live two-mod target:

```text
T1 ES Prefix
+
T1 Intelligence Suffix
+
Final rarity Any
```

one Prefix + one Suffix fits naturally on a magic item.

Spending recommendation-stage state budget on large Regal-generated rare branches before the clean magic completion family is resolved is not desirable.

## Required target feasibility helper

Compute the **minimum feasible terminal rarity** from the target definition and actual target mod generation types.

Examples:

```text
1 Prefix target, rarity Any     -> Magic sufficient
1 Prefix + 1 Suffix, Any        -> Magic sufficient
2 Prefixes, Any                 -> Rare required
2 Suffixes, Any                 -> Rare required
3+ explicit mods                -> Rare required
requiredRarity = Rare           -> Rare required
requiredRarity = Magic          -> Magic required
```

Use the real affix-capacity rules rather than hardcoding only these examples.

## Expansion priority rule

During `RECOMMEND` feasibility search:

- favor states that make target progress at the minimum feasible rarity;
- do not give rare states an unconditional priority bonus when rare is unnecessary;
- rarity-escalating actions such as Regal may remain modeled but can be deferred as unresolved competitors until an executable minimum-rarity route is found.

This is a generic target-aware staging rule, not a Craft-specific shortcut.

Once a useful route exists, `DEEPEN` / `PROVE` may expand those rarity-escalating competitors normally.

---

# Finding 5 — Add The Live Two-Mod `Any` Case As A Permanent Browser Regression

## Severity

**HIGH**

The automated Phase 2B browser smoke covers the two-mod target with:

```text
Final rarity: Rare
```

The live user test used:

```text
Final rarity: Any
```

These are materially different optimization problems.

The `Any` case is exactly what exposed the clean-route starvation issue.

## Required browser fixture

Add a real browser-path regression for:

```text
Large Cluster Jewel
10% increased Attack Damage
ilvl 84
12 passives
Final rarity: Any
clean base: 4c manual override
Glowing (T1)
of the Prodigy (T1)
```

Do not assert only that some result renders.

Assert/report:

- recommendation status;
- acquisition-safe yes/no;
- selected acquisition;
- clean acquisition status;
- clean feasible upper bound if found;
- best unresolved acquisition lower bound;
- expected cost;
- state count;
- runtime;
- host guard;
- proof warnings.

## Acceptance target

Preferred:

```text
clean acquisition obtains a fully resolved feasible policy
```

and is economically compared with the ~1500c fractured family.

At minimum:

```text
if clean remains unresolved, result status is PROVISIONAL_RESOLVED rather than normal BEST_RESOLVED.
```

Do not hardcode a specific clean-route expected chaos value in the solver.

Let the weighted pool and current prices derive it.

---

# Finding 6 — `DEEPEN` Must Demonstrate Measurable Frontier Progress

## Severity

**MEDIUM-HIGH**

The controlled T1 ES Phase 2B diagnostic showed:

```text
RECOMMEND unresolved competitors: 2709
DEEPEN unresolved competitors:   2709
```

while `DEEPEN` used its full engine budget.

This means the intent architecture is good, but the current deeper search did not materially tighten that fixture's proof frontier.

## Required progress metrics

For `DEEPEN`, report deltas from the initial certified recommendation stage:

```text
new canonical states added
new acquisition candidates resolved
competitive unresolved count before -> after
best unresolved acquisition lower bound before -> after
incumbent upper bound before -> after
number of candidates newly dominated by bound
optimality gap before -> after
```

If a deeper round produces no meaningful graph/bound progress, stop early rather than consuming the entire budget doing repeated work.

## UI

After `Retry deeper`, communicate one of:

```text
Search improved the recommendation
Search tightened proof bounds
No additional progress within this deeper budget
Acquisition recommendation became safe
Optimality proven
```

Do not make the user infer progress from raw state counts.

---

# Finding 7 — Persistent Graph Extension Is Now Worth Implementing, But Correctness Comes First

## Severity

**MEDIUM-HIGH scalability**

Phase 2B explicitly reports:

```text
EXPANSION MODE: REBUILT_EACH_ROUND
```

Typical repeated work includes roughly:

```text
one-mod: ~1668 repeated states
two-mod: ~5002 repeated states
Craft B: ~5002 repeated states
```

This means a meaningful portion of later-round work is reconstructing states already seen.

## Recommended implementation order

First fix:

1. acquisition recommendation semantics;
2. fair acquisition feasibility;
3. target-rarity-aware expansion.

Then move the in-request multi-round search toward persistent graph extension.

Desired model:

```text
round 1 builds graph G
round 2 extends G with prioritized frontier
round 3 extends same G
```

not:

```text
round 1 rebuild
round 2 larger rebuild
round 3 larger rebuild
```

Preserve:

- canonical state identity;
- transition caches;
- action attribution;
- resolution/proof metadata;
- deadline checks;
- lower-bound correctness.

Do not implement unsafe mutation merely for speed.

### Cross-request warm start

Caching graph state across separate UI `Retry deeper` requests is optional for this phase.

If attempted, key it by an exact immutable search fingerprint including:

- target;
- base/enchantment/ilvl/passives;
- prices;
- acquisition portfolio;
- Harvest scope;
- mechanics/action set.

Never reuse a graph after any material input or price change.

In-request persistent extension is the higher priority.

---

# Finding 8 — Branching Policy Presentation Should Follow Causal Craft Progress, Not Expected-Visit Ranking

## Severity

**MEDIUM UI clarity**

The live one-mod UI correctly reports a branching policy, but the numbered display can appear in an unintuitive order such as:

```text
1. acquisition
2. Alteration branch
3. Augmentation branch
4. Alteration branch
5. Transmutation from normal
```

This happens because non-start rules are sorted primarily by expected visit count.

Although the UI says it is not a fabricated linear recipe, numbering this way still visually implies sequence.

## Required presentation change

Order explanation groups by causal/state progression where possible:

```text
Start / acquisition
Normal -> Transmutation
Magic one-affix states -> conditional Augmentation / Alteration
Magic full miss -> Alteration
Rare states -> ...
```

Use expected visits as a secondary metric, not the primary ordering key.

If the graph is cyclic, do not pretend a strict topological order exists.

Use sections such as:

```text
Start
Normal-state decisions
Magic-state decisions
Rare-state decisions
Recovery/restart decisions
```

This remains a branching policy, not a fake recipe.

---

# Finding 9 — Small UI Formatting Cleanup

## Severity

**LOW**

The two-mod live UI reports:

```text
First acquisition-safe recommendation: not reached ms
```

Render this as:

```text
not reached
```

without the `ms` suffix.

Also keep long alternative-acquisition rows readable without requiring the main result card to become horizontally awkward.

Do not prioritize this ahead of search correctness.

---

# Finding 10 — Craft B Remains A Scalability Benchmark, Not A Reason To Add A Craft-B Solver

Current Phase 2B Craft B stress still finds:

```text
NO FULLY RESOLVED POLICY
```

within the current state frontier.

That is acceptable for now.

Use Craft B to measure whether:

- acquisition fairness;
- target-aware priority;
- persistent expansion;
- tighter bounds;

improve generic multi-mod search.

Do not create:

```text
if (craftB)
if (threeNotableCraft)
```

or any dedicated notable recipe solver.

Craft B becomes a pass only when the same generic optimizer naturally resolves it.

---

# Required Implementation Order

## Phase 2C.1 — Recommendation confidence semantics

Implement explicit acquisition-safety status in the service result and UI.

Required distinctions:

```text
policy certified
acquisition safe
modeled optimality proven
```

A resolved route with an unresolved acquisition competitor below the incumbent must be visibly provisional.

Add upper/lower-bound gap reporting for acquisition candidates.

## Phase 2C.2 — Minimum feasible terminal rarity

Add one shared target helper deriving minimum feasible rarity from:

- requested rarity;
- target Prefix count;
- target Suffix count;
- affix capacities.

Use it in search staging/priority.

Do not duplicate the logic in React.

## Phase 2C.3 — Fair acquisition feasibility search

Before broad proof expansion, give each generated acquisition physical state a fair generic attempt to produce a fully executable policy upper bound.

Reuse canonical states when possible.

Return per-acquisition:

```text
feasibleUpperBoundChaos
optimisticLowerBoundChaos
policyCertified
acquisitionCandidateStatus
```

## Phase 2C.4 — Resolve the live two-mod `Any` regression

The exact live fixture must become a permanent browser/service diagnostic.

Preferred outcome:

- clean-base route resolves under default recommendation budget;
- actual weighted expected cost is calculated;
- fractured route remains an alternative;
- selected acquisition reflects real cost comparison.

If this cannot be achieved within the default budget, return a provisional result rather than a strong acquisition recommendation.

## Phase 2C.5 — Make `DEEPEN` measurable

Add before/after progress metrics and early-stop when deeper search is making no useful frontier/bound progress.

## Phase 2C.6 — Persistent in-request graph extension

Implement only after the above correctness gates are stable.

Measure repeated-state work before/after.

## Phase 2C.7 — Policy explanation ordering / small UI cleanup

Improve causal presentation and `not reached` formatting.

Do not turn this into a broad visual redesign.

---

# Required Regression / Diagnostic Matrix

## A. Live one-mod T1 ES regression

Use the same shape as the user browser test:

```text
Large Cluster Jewel
10% increased Attack Damage
ilvl 84
12 passives
Any rarity
Glowing (T1)
clean-base manual override 4c
```

Required:

- clean base selected;
- selected policy fully resolved/proper/absorbing;
- 0 unresolved on-policy probability;
- EV reconciled;
- normal `RECOMMEND` returns quickly;
- host guard not triggered;
- Transmutation/Alteration/Augmentation policy preserved.

Do not require an exact chaos total if the committed market snapshot changes; report the active prices and resulting total.

## B. Two-mod `Any` regression — highest priority

```text
Large Cluster Jewel
10% increased Attack Damage
ilvl 84
12 passives
Any rarity
Glowing (T1)
of the Prodigy (T1)
clean-base manual override 4c
```

Required report:

- selected/provisional acquisition;
- clean route status;
- clean route feasible U if found;
- clean route optimistic L;
- fractured ES route U/L;
- fractured Int route U/L;
- acquisition-safe yes/no;
- total states;
- recommendation runtime;
- unresolved competitors;
- proof level.

## C. Two-mod `Rare` regression

Retain the automated Rare benchmark.

Do not assume it must choose the same acquisition as the `Any` target.

Required:

- target summary proves rarity is Rare;
- selected policy certified if a result is shown;
- unresolved competitors honestly reported;
- no host guard in normal budget.

## D. `Retry deeper`

Run on the two-mod `Any` fixture.

Report:

```text
before -> after
states
candidate resolutions
lower bounds
incumbent
acquisition safety
unresolved competitors
runtime
```

If there is no meaningful progress, return early with a clear no-progress result.

## E. Craft B stress

Keep as a scalability benchmark.

No special-case solver.

## F. Craft A / Craft C

Preserve current healthy regression behavior.

Current reference neighborhood:

### Craft A

```text
Analytical ~7623.7c
Pooled MC ~7568.1c
~0.73% difference
0 missing states
0 fallback actions
```

### Craft C

```text
Analytical ~42814.4c
Pooled MC ~42483.5c
~0.77% aggregate difference
1 timeout / 10,000 historical pooled run
0 missing states
0 fallback actions
```

If verified mechanics changes legitimately move these values, explain why rather than tuning back to the old totals.

---

# Harvest Status

Keep:

```text
APPROXIMATE / EXTERNALLY CLOSE
ENGINE ~19% OPTIMISTIC ON THE COMPOUND EXTERNAL EVENT
```

Do not block Phase 2C on exact Harvest parity.

Do not hardcode the external probability into mechanics.

The current generic 3/4 total-affix approximation may remain while the search architecture work proceeds.

---

# What Not To Do

Do not:

- add unit tests;
- add Craft-specific algorithms;
- add a special T1 ES + T1 Int solver;
- add a Craft B solver;
- reintroduce Allflame mechanics;
- add new exotic crafting mechanics;
- hide unresolved acquisition candidates;
- call a provisional acquisition economically recommended merely because its own policy is resolved;
- treat lower-bound heuristics as exact expected costs;
- hardcode expected clean-route costs;
- tune weights to force a desired route;
- sacrifice canonical-state correctness for graph reuse.

Continue using:

- runtime diagnostics;
- real browser smoke paths;
- Bellman/occupancy reconciliation;
- proof/lower-bound reporting;
- A/C regressions;
- external CoE parity where already applicable.

---

# Phase 2C Completion Gates

Phase 2C is complete when all of the following hold:

- [ ] Live one-mod T1 ES regression still selects a sensible clean-base policy quickly.
- [ ] A resolved policy and an acquisition-safe recommendation are represented separately.
- [ ] A result with a cheaper unresolved acquisition route is labeled provisional, not ordinary best-resolved acquisition.
- [ ] Minimum feasible terminal rarity is derived generically from target requirements.
- [ ] Recommendation-stage expansion no longer inherently favors Rare when Magic can satisfy the target.
- [ ] Each acquisition candidate receives fair feasibility consideration.
- [ ] The two-mod `Any` browser fixture resolves the clean route OR clearly returns a provisional result if it cannot.
- [ ] `DEEPEN` reports measurable before/after progress or stops early when no progress is possible.
- [ ] Host guard remains a failsafe, not the normal timeout path.
- [ ] Bellman convergence remains reported.
- [ ] Selected policies remain proper/absorbing where certified.
- [ ] Expected-cost reconciliation remains tight.
- [ ] Craft A remains healthy.
- [ ] Craft C remains healthy.
- [ ] Craft B remains generic with no special branch.
- [ ] Harvest remains explicitly approximate/external-close.
- [ ] `npm run build` passes.
- [ ] No unit tests are added.

---

# Required Completion Report

When implementation is complete, report:

1. commit SHA;
2. files changed;
3. `npm run build` result;
4. new recommendation-status/acquisition-safety contract;
5. minimum feasible rarity logic;
6. acquisition-feasibility architecture;
7. whether expansion still rebuilds each round;
8. one-mod live regression result/runtime;
9. two-mod `Any` live regression result/runtime;
10. clean-base U/L for the two-mod `Any` target;
11. fractured ES U/L;
12. fractured Int U/L;
13. whether the two-mod `Any` result is acquisition-safe;
14. two-mod `Rare` result/runtime;
15. `DEEPEN` before/after progress metrics;
16. host-guard usage;
17. Bellman/occupancy/reconciliation status;
18. Craft B stress result;
19. Craft A regression;
20. Craft C regression;
21. Harvest confidence label;
22. whether the backend/UI is ready for broader UI polish rather than further search-correctness work.

Commit implementation and regenerated diagnostics to `main`.
