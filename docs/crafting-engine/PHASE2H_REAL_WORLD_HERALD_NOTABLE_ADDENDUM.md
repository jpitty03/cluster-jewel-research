# Phase 2H Addendum — Real-World Herald Notable Regression, Recommend-Budget Resolution, and Policy-Guide Fidelity

## Status / Source of Truth

This document is an **addendum to**:

- `docs/crafting-engine/POST_PHASE2G_REVIEW_AND_PHASE2H_ADMISSIBLE_BOUNDS_PROOF_SCALING_PLAN.md`

Live `main` reviewed before writing this addendum:

- `c8b2b5dc188e6104ae2d39b960c5a24165857ed4`

Phase 2H has not yet been implemented on remote `main` at the time of this review.

Where this document adds or reprioritizes work, **this addendum wins**. The original Phase 2H admissible-lower-bound plan remains required unless explicitly changed below.

No unit-test work is requested.

---

# Executive Verdict

A real user craft exposed an important distinction that the synthetic fixtures did not make obvious:

1. the default `RECOMMEND` budget can fail to certify a practical two-notable craft even though a bounded deeper retry finds a sensible finite policy;
2. the deeper policy appears economically and mechanically plausible;
3. the result remains acquisition-provisional because fracture-family lower bounds are still extremely weak;
4. the player-facing policy grouping can collapse mechanically different states into the **same visible condition while showing conflicting actions**;
5. `NO_RESOLVED_ROUTE` currently still renders `Expected materials` from an uncertified/improper policy, which is misleading.

This is not evidence that the basic craft mechanics are fundamentally broken. It is evidence that **default search resolution, proof bounds, and policy-guide state description need hardening together**.

The real craft should become a permanent integration fixture.

---

# Real-World Fixture H — Herald Medium Cluster

Use the committed catalog/data to resolve exact modifier IDs; do not hardcode probability answers or create a craft-specific solver path.

```text
Base: Medium Cluster Jewel
Cluster enchantment: 10% increased Damage while affected by a Herald
Item level: 84
Passive count: 6
Final rarity: Any
Extra affixes: Allowed

Target modifiers:
- Empowered Envoy — Prefix, required ilvl 1
- Endbringer — Prefix, required ilvl 68
```

Both targets are prefixes. Therefore the existing feasibility layer correctly derives that the minimum feasible rarity is Rare because the target requires 2 Prefixes and Magic capacity is only 1P/1S.

This fixture is valuable because it is:

- a real user-selected craft rather than a synthetic stress shape;
- two exact notable targets;
- two modifiers in the same generation type;
- a normal clean-base rolling problem;
- mechanically fracture-capable, so acquisition proof still matters;
- small enough that a deeper search already demonstrated a plausible solution.

Do **not** add an `if (Empowered Envoy)` / `if (Endbringer)` / `if (Herald)` branch anywhere in solver logic.

---

# Observed Run H1 — Default RECOMMEND

The user ran the current Phase 2G UI with the default search configuration.

Observed result:

```text
recommendation status: NO_RESOLVED_ROUTE
resolved start: none
expected cost: unavailable
worker round trip: ~9301 ms
states expanded: 5000
expansion rounds: 3/3
minimum feasible rarity: rare
first certified policy: not reached
first acquisition-safe recommendation: not reached
budget exhausted: yes
```

Policy health was not trustworthy:

```text
terminal absorption: 0%
Bellman: not converged (1000)
occupancy: not converged (1000)
EV reconciliation difference: ~95594.904c
```

The clean-base alternative was shown as approximately `95720.101c` and `IMPROPER`. Those large values are **not valid craft-cost estimates** and must not be treated as economic evidence.

The acquisition stage itself did useful work:

```text
Empowered Envoy self-fracture:
  synthesis status: RESOLVED
  executable U: ~1474.778c
  optimistic L: ~10.186c
  expected Fracturing Orbs: 4.000
  expected restarts: 3.000

Endbringer self-fracture:
  synthesis status: RESOLVED
  executable U: ~1494.978c
  optimistic L: ~10.140c
  expected Fracturing Orbs: 4.000
  expected restarts: 3.000
```

That is important: **fracture synthesis succeeded; downstream/default proof search did not certify the clean rolling policy.**

---

# Observed Run H2 — Retry Deeper

The user then pressed `Retry deeper` without changing the craft target.

The current UI's retry behavior increases the search budget, and this deeper run produced a finite executable clean-base incumbent.

Observed result:

```text
recommended start: Clean Base
expected cost: 78.781c
recommendation status: PROVISIONAL_RESOLVED
acquisition safe: NO
resolved incumbent U: 78.781c
best unresolved acquisition L: 10.149c
potential acquisition gap: 68.633c
```

This is a much more credible result than H1.

## Expected-action cost reconciliation visible in the UI

```text
Orb of Alteration:   320.077 expected   44.971c
Orb of Scouring:      33.920 expected   12.588c
Acquire clean base:    1.000 expected   10.000c
Orb of Augmentation: 102.917 expected    6.682c
Regal Orb:             34.920 expected    4.155c
Orb of Transmutation: 34.920 expected    0.385c
-------------------------------------------------
Total:                                      78.781c
```

The displayed action costs sum exactly to the displayed expected craft cost. Preserve that reconciliation property.

## Mechanically plausible policy shape

The returned guide includes generic branches equivalent to:

```text
normal 0P/0S, 0/2 targets
  -> Transmutation

magic 0P/1S, 0/2 targets
  -> Augmentation

magic 1P/0S, 0/2 targets
  -> Alteration

magic 1P/1S, 0/2 targets
  -> Alteration

magic 1P/1S, 1/2 targets
  -> Regal

failed Rare states with only 1/2 target modifiers
  -> Scour / restart the rolling cycle
```

This is exactly the kind of branching policy the generic Bellman solver should be able to discover. Do not replace it with a hardcoded linear recipe.

---

# Critical Finding A — Default Search Is Under-Resolving A Real Practical Craft

The first run returned `NO_RESOLVED_ROUTE`, yet a deeper retry found an executable `78.781c` clean-base policy.

That means `NO_RESOLVED_ROUTE` in H1 is fundamentally a **budget/search-resolution outcome**, not evidence that the target is unsupported.

Phase 2H must make this fixture a required search-scaling diagnostic.

## Do not immediately guess which retry parameter fixed it

`Retry deeper` changes more than one budget dimension. Before changing defaults, isolate the sensitivity.

Run a controlled matrix using the exact same prices/target:

```text
A:  5k states / 30s / 3 rounds   (current default reference)
B: 10k states / 30s / 3 rounds
C:  5k states / 60s / 3 rounds
D:  5k states / 30s / 4 rounds
E: 10k states / 30s / 4 rounds
F: current Retry Deeper semantics exactly
```

For each row report:

```text
recommendation status
resolved incumbent U
selected start
proper / absorption / reconciliation
Bellman / occupancy convergence
states expanded
cumulative expansion work
new states by round
retained states reused by round
repeatedStatesExpanded
first certified policy time
first useful recommendation time
engine elapsed
total staged elapsed
```

The purpose is to answer:

> Is the blocker state capacity, round count, wall time, frontier prioritization, or some combination?

Do not change the global default to 10k/60s/4 rounds until this matrix establishes what is actually required.

---

# Critical Finding B — RECOMMEND Should Use Its Budget To Produce A Useful Route When Practical

The first run used about 9.3 seconds of staged engine time while the normal host budget was much larger, but it exhausted its state/round limits before certifying a route.

Phase 2H should investigate a proof-honest **certification rescue** for `RECOMMEND`.

Preferred behavior:

```text
RECOMMEND finds a certified route early
  -> return early as today

RECOMMEND reaches the initial state/round cap with NO_RESOLVED_ROUTE
AND meaningful unresolved target progress exists
AND host wall-time remains
  -> spend a bounded rescue tranche on the best resolution frontier
  -> stop immediately once a proper finite incumbent is certified
```

This is not permission to ignore explicit user budgets.

Implementation options are acceptable only if budget semantics remain understandable. Examples:

1. improve frontier prioritization so the same configured budget resolves H without increasing the cap;
2. revise the default budget after the sensitivity matrix proves a larger state cap is the correct general setting;
3. add a clearly defined internal reserve/rescue tranche whose accounting is included in `searchSummary`;
4. another generic mechanism that demonstrably solves the same issue without target-specific heuristics.

## Hard requirements

- no silent unbounded retry;
- no infinite/recursive retry loop;
- respect the host deadline;
- preserve Cancel behavior;
- preserve proof semantics;
- report rescue work separately if added;
- stop as soon as a useful certified policy exists unless `PROVE` was explicitly requested;
- no Herald/notable-specific branching.

A correct answer that returns in, for example, 12–20 seconds is preferable to a 9-second `NO_RESOLVED_ROUTE` followed by a user manually retrying a craft that the engine can actually solve.

---

# Critical Finding C — Policy Explanation Can Show The Same Visible Condition With Conflicting Actions

The deeper output contains two player-facing cards with the same visible condition:

```text
magic item with 1 prefix(es), 1 suffix(es), and 1/2 target modifier(s)
```

but one card selects:

```text
Regal Orb
```

and another selects:

```text
Orb of Alteration
```

This does **not necessarily mean the solver is contradictory**.

The underlying states can differ by **which target modifier is present** or by another mechanically relevant property that the current grouped condition text omits.

The problem is presentation fidelity: the player cannot know which rule applies.

## Phase 2H requirement

No two default-visible policy-guide cards may have identical player-facing conditions with different actions unless the condition is further disambiguated using real state information.

Do not fix this by inventing prose.

Expose structured condition context from actual states.

A suitable generic shape would be something like:

```ts
interface PolicyExplanationRule {
  condition: string;
  actionId: string;
  action: string;
  representedStateCount: number;
  expectedVisits: number;
  exampleState: string;

  // New structured context, naming is implementation-dependent:
  matchedTargetModIds?: string[];
  unmatchedTargetModIds?: string[];
  rarity?: ItemRarity;
  prefixCount?: number;
  suffixCount?: number;
}
```

The service can preserve exact IDs; the browser catalog can map them to Phase 2F player labels.

For this fixture the UI should be capable of distinctions such as:

```text
IF magic 1P/1S with Empowered Envoy present and Endbringer missing
THEN ...

IF magic 1P/1S with Endbringer present and Empowered Envoy missing
THEN ...
```

**only if those are the actual underlying states.**

If another hidden state property causes the action difference, display that property instead.

## Diagnostic requirement

For every pair of `policyExplanation` entries:

```text
same rendered player condition + different actionId
```

must equal zero after rendering/disambiguation.

Also verify that every added condition detail is derived from the represented underlying state(s), not guessed from the target.

---

# Critical Finding D — `NO_RESOLVED_ROUTE` Must Not Present Uncertified Expected Materials As A Craft Estimate

H1 correctly said:

```text
No craft recommendation is available from this search.
Nothing displayed below should be treated as a resolved route.
```

But the default-visible `Expected materials` section still showed approximately:

```text
665.889 Alterations
333.111 Augmentations
1 acquisition
1 Transmutation
```

while the same result reported:

```text
NO_RESOLVED_ROUTE
0% terminal absorption
Bellman not converged
occupancy not converged
~95,594.904c reconciliation difference
```

Those material counts are not trustworthy enough to present as a user craft estimate.

## Required UI rule

```text
PROVEN_OPTIMAL
BEST_RESOLVED_ACQUISITION_SAFE
PROVISIONAL_RESOLVED with an executable certified incumbent
  -> Expected materials may be shown from the certified selected policy

NO_RESOLVED_ROUTE
or no certified selected policy
  -> do not show normal Expected materials
```

If research value warrants retaining the numbers, move them under Advanced and label them explicitly, for example:

```text
Uncertified exploratory policy usage
Not a valid craft estimate because no proper resolved policy was certified.
```

The row:

```text
Acquire No start certified under this budget
```

must never appear in the player-facing expected-material table.

Do not merely hide this exact string; make the display conditional on certification semantics.

---

# Critical Finding E — The Existing Phase 2H Lower-Bound Work Becomes Even More Valuable

H2 finds a clean incumbent:

```text
U_clean = 78.781c
```

but remains provisional because:

```text
best unresolved acquisition L = 10.149c
```

Meanwhile H1 already demonstrated executable self-fracture routes near:

```text
1474.778c Empowered Envoy
1494.978c Endbringer
```

This is an excellent real-world validation case for the original Phase 2H mechanics-aware admissible-bound work.

Under current normal pricing, if the engine can prove from shared mechanics that every route to the desired fractured state must incur at least one fracture-creating action whose minimum legal cost alone exceeds `78.781c`, then that acquisition family can be safely dominated without solving its exact continuation.

Do not hardcode the current Fracturing Orb price or this target's costs.

Do not use four expected fracture attempts as a mandatory lower bound.

The existing Phase 2H rule remains:

```text
combined L = max(partial-graph optimistic L, admissible mechanics-required L)
```

with proof that every component is independently admissible.

## New required diagnostic H-LB

For the Herald fixture report:

```text
clean incumbent U
Empowered Envoy fracture:
  executable U if available
  partial-graph L
  mandatory-mechanics L
  combined L
  dominated? yes/no

Endbringer fracture:
  executable U if available
  partial-graph L
  mandatory-mechanics L
  combined L
  dominated? yes/no

best unresolved acquisition L after combination
acquisition safe?
recommendation status
```

If all unresolved acquisition families are safely bounded above the clean incumbent, the result should become acquisition-safe.

If any valid unresolved `L < 78.781c` remains, it must stay provisional.

Do not force the fixture to become safe.

---

# Critical Finding F — Clarify `repeatedStatesExpanded` Before Optimizing Around It

H1 reports:

```text
Expansion architecture: PERSISTENT_EXTENDED
repeated states: 4,998
states expanded: 5,000
```

Do not assume from the label alone that 4,998 states were literally re-expanded.

The engine already carries separate concepts for:

```text
cumulativeExpansionWork
newStatesByRound
retainedStatesReusedByRound
repeatedStatesExpanded
```

Phase 2H diagnostics must explain exactly what each metric means under `PERSISTENT_EXTENDED`.

If `repeatedStatesExpanded` actually means retained/revisited accounting rather than duplicated transition-generation work, rename or clarify the UI/diagnostic label.

If it really represents expensive repeated expansion, measure the time and fix it.

Do not optimize a metric whose semantics have not first been established.

---

# Revised Phase 2H Implementation Order

The original admissible-bound work remains required, but use this order.

## Step 1 — Add the Herald real-world diagnostic fixture

Create a deterministic service/runtime diagnostic for:

```text
Medium / Herald / ilvl84 / 6p / Empowered Envoy + Endbringer / Any / extras allowed
```

Resolve exact modifier IDs through committed catalog data.

Record current default and deeper references.

No unit test.

## Step 2 — Fix `NO_RESOLVED_ROUTE` presentation correctness

Do not show certified-looking Expected Materials unless there is a certified executable selected policy.

Keep raw research evidence under Advanced if desired.

## Step 3 — Fix policy-guide condition collisions

Add structured state context sufficient to distinguish same-shape states that choose different actions.

Keep the UI branch-aware; do not convert it to a linear recipe.

## Step 4 — Implement the original Phase 2H admissible mechanics lower bounds

Follow `POST_PHASE2G_REVIEW_AND_PHASE2H_ADMISSIBLE_BOUNDS_PROOF_SCALING_PLAN.md`.

Preserve the artificial cheap-fracture counter-fixture.

Add the new Herald lower-bound diagnostic as an additional integration gate.

## Step 5 — Run the H budget-sensitivity matrix

Identify what actually causes default H1 to fail and H2 to succeed.

## Step 6 — Improve RECOMMEND certification efficiency

Use the matrix to choose the smallest generic correction:

- frontier prioritization;
- default state cap;
- bounded rescue tranche;
- round allocation;
- another proof-honest generic improvement.

Do not blindly increase every budget.

## Step 7 — Full regression matrix

Run the existing Phase 2H regressions plus the new H fixture and browser presentation checks.

---

# New Required Diagnostics

## H1 — Default vs Deeper Reproduction

Print side by side:

```text
default current-budget result
deeper result
status
selected start
U / best unresolved L / gap
properness
absorption
Bellman
occupancy
reconciliation
states / rounds / runtime
```

The historical references from the user run are:

```text
Default:
  NO_RESOLVED_ROUTE
  ~5000 states
  ~9.3s worker round trip

Deeper:
  Clean Base
  ~78.781c
  PROVISIONAL_RESOLVED
  best unresolved acquisition L ~10.149c
```

Do not hardcode these as required exact values if controlled prices or implementation details legitimately change. Explain deltas.

## H2 — Budget Sensitivity

Run A–F matrix described above and identify the limiting resource.

## H3 — Policy Collision Audit

Assert:

```text
identical rendered condition + different actionId = 0
```

for the Herald deeper policy and existing browser fixtures.

Print before/after examples showing the real distinguishing context.

## H4 — No-Route Material Safety

Construct/reuse a bounded `NO_RESOLVED_ROUTE` production-browser result.

Assert:

- no ordinary `Expected materials` craft estimate is default-visible;
- no `Acquire No start certified...` material row;
- raw exploratory usage, if retained, is Advanced-only and explicitly uncertified.

## H5 — Herald Lower-Bound Proof

Report the fracture-family decomposition and acquisition safety described in Finding E.

## H6 — Expansion Metric Semantics

For each round print:

```text
new canonical states
retained states reused
actual transition distributions generated
actual previously-generated nodes re-expanded, if any
cumulative work
```

Explain whether `repeatedStatesExpanded` is actual duplicated work or legacy/accounting terminology.

---

# Revised Phase 2H Regression Matrix

All original Phase 2H regressions remain.

Add:

## R-H1 — Herald target, normal RECOMMEND

Goal: the normal product path should no longer strand this practical craft at a misleading no-route result when the configured generic search can reasonably certify the known finite route.

Acceptance depends on the budget-sensitivity finding, but the final behavior must be documented and intentional.

Preferred product result:

```text
finite clean-base incumbent found without a manual retry
proper / absorbing / reconciled
```

If there is a hard reason this cannot be achieved within the normal default request budget, document that reason quantitatively and make the UI clearly explain that a deeper search is required. Do not silently regress to invalid material estimates.

## R-H2 — Herald deeper economic stability

Preserve the general policy/economics shape of the observed deeper result:

```text
Clean Base incumbent
Alter/Aug + Regal + Scour recovery loop emerges generically
finite expected cost
proper/absorbing/reconciled
```

No exact `78.781c` hardcode.

## R-H3 — Herald policy guide

No identical condition cards with different actions after rendering.

## R-H4 — No-route presentation

No certified-looking materials for an uncertified policy.

## R-H5 — Acquisition proof

Normal-price fracture candidates may only be dominated by an admissible bound. Cheap-fracture counter-fixture must remain provisional when appropriate.

---

# Completion Gates Added By This Addendum

Phase 2H is not complete until all of the following are true:

1. The Herald/Empowered Envoy/Endbringer target is a committed diagnostic fixture.
2. The reason default H1 fails while deeper H2 succeeds is isolated with the budget matrix.
3. `NO_RESOLVED_ROUTE` no longer presents ordinary Expected Materials from an uncertified policy.
4. The invalid-looking `Acquire No start certified under this budget` material row cannot appear in normal player output.
5. Player-facing policy conditions uniquely identify the mechanical branch whenever actions differ.
6. No condition distinction is fabricated; all disambiguation comes from actual state data.
7. Original Phase 2H admissible-lower-bound gates still pass.
8. The Herald fixture participates in admissible-bound acquisition-safety validation.
9. Cheap-fracture proof honesty is preserved.
10. RECOMMEND certification efficiency is improved based on measured evidence, not arbitrary budget inflation.
11. Existing one-mod, two-mod Any, no-unwanted, fracture, Harvest, Craft A, and Craft C regressions remain healthy where required by the base Phase 2H plan.
12. Build passes.
13. Lint passes apart from already-documented pre-existing warnings.
14. Production browser/worker smoke passes.
15. No unit tests are added.
16. No Craft-specific, notable-specific, Herald-specific, or modifier-name-specific solver branch is added.
17. Pre-fractured market purchase remains outside normal ranking.
18. Standard Crafting Bench is not treated as a source of these cluster-jewel notables.

---

# Required Completion Report Additions

In addition to the original Phase 2H completion report requirements, include:

```text
1. exact implementation commit SHA
2. Herald fixture exact resolved target IDs
3. H1 current/default reproduction before changes
4. H2 deeper reference reproduction before changes
5. A–F budget sensitivity matrix
6. chosen RECOMMEND search-resolution change and quantitative justification
7. final Herald default result
8. final Herald deeper result
9. policy-guide collision audit before/after
10. no-route Expected Materials browser result before/after
11. Herald fracture-family partial/mechanics/combined L values
12. acquisition-safe/provisional explanation
13. expansion metric semantics and per-round work
14. all original Phase 2H diagnostics/regressions
15. build/lint/browser results
16. confirmation that no unit tests or target-specific branches were added
```

---

# Final Product Principle Reinforced By This Fixture

A crafting optimizer should distinguish three very different outcomes:

```text
1. No legal route exists in modeled mechanics.
2. A legal route likely exists, but the current search budget did not certify one.
3. A certified executable route exists, but proof that it is cheapest is incomplete.
```

The Herald real-world run demonstrated both #2 and #3 in consecutive requests.

The UI, proof layer, search scheduler, and diagnostics must preserve that distinction.

The deeper result is useful evidence that the generic crafting model can solve this target. Phase 2H should now make that capability **reachable, explainable, and proof-honest in the normal product workflow**.