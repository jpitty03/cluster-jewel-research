# Post Phase 2G Review and Phase 2H Admissible-Bounds / Proof-Scaling Plan

## Status / Source of Truth

Live `main` reviewed at:

- `8219b5ff0e97e59d5c3b3b54ff38769ac0230f5a` — Phase 2G completion report
- implementation beneath it: `b58a6c51bfc4a5d822661dbb6b6abca40aa03aed`

Primary completion evidence:

- `docs/crafting-engine/PHASE2G_USER_FACING_CRAFT_GUIDE_COMPLETION_REPORT.md`
- `output-browser-phase2g-smoke.txt`
- `output-browser-phase2f-smoke.txt`

No unit-test work is requested.

---

# Executive Verdict

## Phase 2G: PASS

Phase 2G successfully moved the optimizer from a research-dashboard presentation toward a player-facing craft recommendation without changing solver/domain/rules mechanics.

The important properties all survived:

- player-readable target labels from Phase 2F;
- exact modifier IDs in worker requests;
- one-mod recommendation stability;
- two-mod `Any` recommendation stability;
- no-unwanted final-state semantics;
- self-fracture-only acquisition policy;
- proof-honest provisional/no-route states;
- advanced research diagnostics remain available;
- no fabricated linear recipe was generated from a branching Bellman policy;
- no unit tests or Craft-specific branches were added.

The new result hierarchy is substantially better for actual users:

```text
Craft recommendation
How to craft it
Expected materials
Advanced optimizer details
```

The browser diagnostics also prove that displayed branch cards correspond directly to returned `policyExplanation` entries and that expected-material rows correspond directly to returned expected action usage.

## The next bottleneck is no longer UI presentation

The strongest remaining product issue is now proof/search efficiency on harder Rare targets.

The controlled forced-Rare two-mod fixture currently reports approximately:

```text
resolved incumbent U:                 228.909c
best unresolved acquisition L:          4.139c
potential acquisition gap:            224.771c
recommendation: PROVISIONAL_RESOLVED
acquisition safe: NO
browser/worker runtime:               ~14.6s
```

At the same time, the same result reports executable self-fracture families around:

```text
T1 ES self-fracture U:   ~1465.8c
T1 Int self-fracture U:  ~1477.9c
```

This is a very strong sign that the current optimistic lower bound is **too weak to prove economically obvious domination** on expensive acquisition families.

The present partial-graph lower-bound architecture intentionally treats unknown continuation optimistically. That remains proof-safe, but the resulting bound can collapse near the clean-base cost even when the desired physical state requires an unavoidable expensive action.

That creates two problems:

1. a cheap executable incumbent remains marked provisional because an unrealistically loose unresolved lower bound survives;
2. the search spends substantial time trying to resolve competitors that could potentially be eliminated much earlier by a stronger admissible bound.

Phase 2H should address that proof-quality problem before starting a broader 3/4-mod search expansion.

---

# Phase 2H

> **Mechanics-Aware Admissible Lower Bounds, Acquisition Proof Hardening, and Rare-Target Search Scaling**

The goal is **not** to make the optimizer more optimistic.

The goal is to make its lower bounds more informative while remaining mathematically safe.

A lower bound may only become larger when the engine can prove that every legal route to the required terminal state must incur at least that cost.

---

# Core Principle

Current partial-graph bound conceptually behaves like:

```text
known immediate cost
+
known expanded continuation
+
0 for unknown continuation
```

This is safely optimistic, but often extremely loose.

Phase 2H should add a second, mechanics-derived admissible bound:

```text
L_state = max(
  existing partial-graph optimistic lower bound,
  mechanics-required-cost lower bound
)
```

The `max` is valid only if both inputs are independently admissible.

The new bound must never become an executable upper bound and must never be presented as a craft cost.

It exists only to:

- classify unresolved competitors;
- prove domination when possible;
- prioritize meaningful frontier work;
- tighten acquisition-safety decisions;
- reduce wasted DEEPEN/PROVE work.

---

# Finding 1 — Fracture Acquisition Has An Obvious Mandatory-Cost Opportunity

Consider an unfractured starting state whose desired reusable physical state requires a particular modifier to be fractured.

Under the currently modeled mechanics, the terminal requirement cannot be satisfied without using some action that creates a fractured modifier.

If the shared action registry proves that only one currently enabled action family can create that required physical property, then every valid route must pay at least the cheapest possible cost of one such action.

Conceptually:

```text
unfractured input
+
terminal requires desired fractured modifier
+
no zero-cost transition can create fracture
=
mandatory positive fracture-creation cost
```

For the current modeled action set, this will commonly imply at least one Fracturing Orb cost.

## Critical rule

Do **not** hardcode:

```ts
if (desiredFracture) lowerBound += priceOfFracturingOrb
```

unless the implementation proves that this is the only safe abstraction supported by the current architecture.

Prefer a generic capability/reachability model derived from shared mechanics:

```text
terminal predicate required
-> which enabled mechanics can create that predicate?
-> what is the minimum unavoidable action cost before the predicate can become true?
```

This keeps the architecture extensible if another future mechanic can legally create the same physical property.

---

# Finding 2 — The Bound Must Be About Unavoidable Cost, Not Expected Cost Guessing

Do not use the external 25% fracture observation to claim that four Fracturing Orbs are mandatory.

That would not be an admissible deterministic lower bound on one successful path.

For lower-bound purposes, a safe statement may be:

```text
at least one fracture-creating action must occur
```

not:

```text
four fracture attempts must occur
```

The selected executable policy may still have expected usage near four through actual probability transitions.

Upper-bound economics and lower-bound proof logic must remain separate.

Similarly, do not use:

- historical expected Alteration counts;
- Craft of Exile empirical success rates;
- historical Craft A acquisition estimates;
- fixed retry multipliers;

as mandatory-cost lower bounds.

---

# Phase 2H Architecture — Abstract Mechanical Reachability

## Preferred model

Introduce a small reusable abstraction that can answer:

> From this state, what mechanically required properties are still missing from the target, and what is the minimum cost that must be paid before those properties could possibly become satisfied?

The abstraction should operate on mechanics-relevant predicates rather than concrete filler modifier identities.

Candidate predicates include only those that can be proven useful and safe, for example:

```text
required rarity reached
required desired fracture present
minimum explicit-affix capacity reached
required target mod currently present / absent
required prefix/suffix capacity reachable
```

Do not add a predicate merely because it seems intuitively useful.

Every predicate-based lower-bound rule needs an admissibility argument.

## Possible implementation shape

A small abstract-state shortest-path problem is acceptable:

```text
abstract state:
  required mechanical predicates currently satisfied

abstract edge:
  one enabled shared mechanic
  cost = minimum legal action cost
  successor = optimistic predicate effects of that mechanic

heuristic/state bound:
  cheapest abstract path to any target-satisfying predicate state
```

The abstraction must be **optimistic** about what an action can accomplish.

If an action can sometimes add one of several target mods, the abstraction may assume the most favorable legal outcome.

That keeps the path cost a lower bound.

Do not use real transition probabilities in this deterministic mandatory-cost bound unless a proof shows the resulting quantity remains admissible for expected-cost comparison.

---

# Phase 2H Priority 1 — Acquisition Synthesis Lower Bound

Add the strongest safe bound first to executable self-fracture synthesis.

For each unresolved synthesis result, report separately:

```text
partial-graph lower bound
mechanics-required-cost lower bound
combined admissible lower bound
```

Do not overwrite provenance.

The synthesis result/service layer should preserve which lower-bound component is responsible for the final `L`.

## Required diagnostic A — Normal-price fracture synthesis

Use the existing T1 ES and T1 Intelligence fracture families from the forced-Rare fixture.

Report before/after:

```text
U
old partial-graph L
mechanics-required L
combined L
candidate status
could beat clean incumbent?
states expanded
runtime
```

If the new admissible bound proves that a fracture family cannot beat the clean incumbent, it should become bound-dominated without needing a full downstream proof.

Do not force that outcome if the actual prices/mechanics do not mathematically justify it.

---

# Phase 2H Priority 2 — Preserve The Cheap-Fracture Proof Fixture

Phase 2E intentionally added a controlled fixture with an artificially cheap Fracturing Orb so an unresolved fracture lower bound can legitimately remain below a clean incumbent.

That fixture is extremely important now.

Re-run it.

Expected semantic result:

```text
if the mechanically mandatory-cost lower bound is still below the incumbent:
  acquisition safe = NO
  recommendation remains provisional
```

This prevents the new bound from simply turning every self-fracture candidate into a dominated route.

The implementation must prove both sides:

```text
normal expensive fracture can be eliminated when justified
cheap fracture remains competitive when justified
```

---

# Phase 2H Priority 3 — Forced-Rare Two-Mod Proof Scaling

The current forced-Rare fixture is the main integration target because it is already executable but not acquisition-safe.

Current reference:

```text
Clean U: ~228.909c
Best unresolved acquisition L: ~4.139c
Status: PROVISIONAL_RESOLVED
Runtime: ~14.6s
```

After stronger admissible bounds, report:

```text
selected incumbent
clean U/L
self-fracture ES U/L
self-fracture Int U/L
which candidates were dominated by the new bound
acquisition safety
recommendation status
states expanded
acquisition-stage runtime
downstream runtime
total worker round trip
```

## Acceptance

If all unresolved acquisition families have admissible `L >= U_clean`, the result **must** become acquisition-safe without requiring those families to be fully solved.

If any unresolved family still has `L < U_clean`, the result must remain provisional.

Do not change status merely to satisfy a desired UI outcome.

---

# Phase 2H Priority 4 — Use Stronger Bounds For Frontier Prioritization

Once candidate classification is correct, allow the improved lower bound to inform search prioritization.

Candidates already proven unable to beat the incumbent should not consume the same frontier budget as competitive unresolved candidates.

Required behavior:

```text
bound-dominated candidate
-> retained in diagnostics
-> not treated as competitive proof frontier
-> no unnecessary DEEPEN work solely to resolve it
```

Competitive candidates remain explicit.

Do not delete them from evidence.

Do not mutate an unresolved candidate into `RESOLVED`; its status should distinguish:

```text
unresolved but safely dominated by admissible bound
```

from:

```text
fully resolved
```

---

# Phase 2H Priority 5 — General Lower-Bound Hooks, Narrow Initial Scope

The architecture should be reusable, but Phase 2H does not need to solve every possible target-bound problem.

A narrow, well-proven implementation is better than an aggressive heuristic.

Minimum useful supported scope:

1. desired fracture terminal requirement;
2. required-rarity transition when a positive-cost promotion is provably unavoidable under enabled actions, if this can be implemented safely;
3. any other predicate only if diagnostics demonstrate a valid admissibility proof.

It is acceptable for unsupported predicates to contribute `0`.

Never overestimate merely to make the bound more useful.

---

# Admissibility Validation

This is the most important Phase 2H correctness gate.

Create diagnostics that compare the new lower bound against known executable values.

For every sampled/controlled state with a certified finite continuation `U`:

```text
L_mechanics <= U
L_combined <= U
```

must hold within numerical tolerance.

Include at least:

- clean-base one-mod state;
- two-mod Any state;
- forced-Rare clean state;
- normal-price self-fracture synthesis state;
- artificially cheap-fracture state;
- at least several intermediate acquisition-synthesis states if practical.

A single counterexample where the lower bound exceeds a valid executable continuation is a Phase 2H blocker.

Do not weaken or discard the fixture to make it pass.

---

# Lower-Bound Provenance Contract

Expose enough structured evidence for diagnostics and Advanced UI details.

Suggested shape:

```ts
interface LowerBoundEvidence {
  partialGraphChaos: number;
  mandatoryMechanicsChaos: number;
  combinedChaos: number;
  components: Array<{
    predicate: string;
    costChaos: number;
    reason: string;
    mechanicIds: string[];
    provenance: string;
  }>;
}
```

Exact naming is implementation-dependent.

Do not put verbose mechanics internals into the default player UI.

Advanced optimizer details may expose:

```text
Optimistic lower bound: ...
  partial graph: ...
  mandatory mechanics: ...
```

when useful for debugging proof decisions.

---

# Phase 2H UI Scope

Keep UI changes minimal.

The Phase 2G player hierarchy is now good and should remain stable.

Default player UI should change only when the underlying recommendation status legitimately changes.

Examples:

```text
before:
Provisional — acquisition not yet safe

possible after stronger proof:
Acquisition-safe
```

only if the new admissible bounds actually prove the unresolved acquisition families cannot beat the incumbent.

Detailed lower-bound components belong under `Advanced optimizer details`.

Do not redesign the page in this phase.

---

# Deferred From Phase 2H

## 3/4-mod broad search scaling

The final product still needs robust 1–4 target support.

However, do not begin another broad multi-mod state-abstraction experiment until the current proof engine stops wasting work on obviously expensive unresolved acquisition families.

After Phase 2H, the next likely phase should explicitly cover:

```text
3-mod Rare feasibility
4-mod Rare feasibility
Craft B as a generic notable stress fixture
multi-mod target-conditioned search scaling
```

without Craft-specific branches.

## Live pricing automation

The committed Allflame market/currency snapshot is stale, and that must be addressed before public product readiness.

Phase 2G already surfaces freshness warnings correctly, so this is not the immediate proof/search blocker.

Do not mix a pricing-pipeline rewrite into Phase 2H.

## Chaos / Alchemy analytical transitions

These remain deferred mechanics coverage.

Do not add them merely to improve a benchmark unless a legal-route/action-coverage diagnostic demonstrates they are required.

## Standard Crafting Bench target creation

Still not applicable. Do not reintroduce it as a source of cluster-jewel target modifiers/notables.

---

# Required Diagnostics

## D1 — Lower-bound decomposition

For the standalone self-fracture fixture, print:

```text
partial graph L
mandatory mechanics L
combined L
certified U
admissibility margin U-L
components/provenance
```

## D2 — Normal-price domination

Use normal current controlled pricing and show whether the fracture acquisition lower bound can or cannot beat the clean incumbent.

## D3 — Artificial cheap-fracture preservation

Use the existing cheap Fracturing Orb fixture and prove the candidate remains competitive/provisional when its valid lower bound is below the incumbent.

## D4 — Forced-Rare two-mod

Report all acquisition U/L values, status, safety, and before/after runtime/work.

## D5 — Admissibility audit

For every controlled state with certified U, assert:

```text
combined L <= U + tolerance
```

Report zero violations.

## D6 — Frontier work attribution

Report:

```text
competitive unresolved candidates before/after
bound-dominated candidates before/after
states spent on dominated families before/after
DEEPEN frontier size before/after
```

## D7 — Lower-bound provenance serialization

Prove the service/worker result preserves enough structured evidence to explain the bound in Advanced diagnostics without changing optimizer target identity.

---

# Regression Matrix

## R1 — One-mod T1 ES

Preserve approximately the established result and behavior:

```text
Clean Base
~8.784c under the controlled fixture
acquisition-safe
proper
absorbing
reconciled
fast browser response
```

No hardcoded exact-value assertion is required if controlled pricing changes; explain any difference.

## R2 — Two-mod T1 ES + T1 Int, Any

Preserve:

```text
clean-base route
acquisition-safe
~228.790c under the current fixture
proper / absorbing / reconciled
```

## R3 — Two-mod no-unwanted

Preserve final-state semantics and clean-base route health.

## R4 — Forced-Rare two-mod

This is the Phase 2H proof-scaling target.

Status may become acquisition-safe **only if** all competing unresolved lower bounds are mathematically dominated.

## R5 — Phase 2G presentation

Preserve:

- human recommendation copy;
- branch-aware guide correspondence;
- expected-material correspondence;
- provisional/no-route presentation;
- Advanced details;
- stale-result invalidation;
- Phase 2F labels and search aliases.

## R6 — Self-fracture invariant

Preserve:

- executable self-fracture only in core ranking;
- no pre-fractured market purchase;
- wrong-fracture restart/reacquisition;
- no fixed `4x` expected-attempt formula.

## R7 — Fracturing parity

Preserve external / analytical / MC alignment around the existing four-affix 25% fixture.

## R8 — Harvest B1/B2/B3 parity

Preserve the current raw-presence and exactly-one-Annul semantics and approximate confidence labels.

## R9 — Craft A / Craft C

If solver code touched by the lower-bound integration is shared with mature policies, rerun the established A/C diagnostics and report changes.

If the implementation is strictly proof-classification code that cannot affect selected policy transitions/EV, the completion report may justify a narrower regression, but do not silently skip affected paths.

## R10 — Build / browser

Run:

```text
npm run build
npm run lint
production browser + compiled worker smoke
```

No unit tests are requested.

---

# Completion Gates

Phase 2H is complete when all of the following are true:

- [ ] a mechanics-aware admissible lower-bound component exists;
- [ ] the existing partial-graph lower bound remains available separately;
- [ ] the combined bound uses only mathematically safe components;
- [ ] lower-bound provenance is explicit;
- [ ] no lower-bound component uses empirical Craft of Exile rates as mechanics input;
- [ ] no lower-bound component hardcodes expected four-attempt fracture economics;
- [ ] normal-price fracture candidates receive a meaningfully stronger bound when mechanics justify it;
- [ ] the cheap-fracture fixture remains competitive/provisional when justified;
- [ ] zero admissibility-audit violations occur on all controlled certified states;
- [ ] bound-dominated unresolved candidates remain distinguishable from resolved candidates;
- [ ] bound-dominated candidates stop consuming competitive frontier work unnecessarily;
- [ ] forced-Rare two-mod status reflects the new mathematical evidence correctly;
- [ ] one-mod remains healthy;
- [ ] two-mod Any remains healthy;
- [ ] no-unwanted remains healthy;
- [ ] Phase 2G player hierarchy remains healthy;
- [ ] self-fracture-only acquisition remains intact;
- [ ] Fracturing parity remains aligned;
- [ ] Harvest parity semantics remain unchanged;
- [ ] build passes;
- [ ] lint passes apart from explicitly documented pre-existing warnings;
- [ ] production browser/worker smoke passes;
- [ ] no unit tests were added;
- [ ] no Craft-specific solver branches were added.

---

# Required Completion Report

When Phase 2H is complete, report:

1. implementation commit SHA;
2. files changed;
3. lower-bound architecture;
4. exact admissibility argument for each implemented mandatory-cost component;
5. partial-graph L vs mechanics L vs combined L for standalone fracture synthesis;
6. normal-price fracture U/L before and after;
7. cheap-fracture fixture U/L and status;
8. admissibility audit count / violations;
9. forced-Rare clean U/L;
10. forced-Rare fracture-family U/L values;
11. forced-Rare recommendation status before/after;
12. forced-Rare acquisition safety before/after;
13. forced-Rare runtime/states before/after;
14. competitive unresolved count before/after;
15. bound-dominated count before/after;
16. frontier work attribution before/after;
17. one-mod result/runtime;
18. two-mod Any result/runtime;
19. no-unwanted result/runtime;
20. Phase 2G D1-D8 regression status;
21. self-fracture invariant status;
22. Fracturing parity;
23. Harvest parity;
24. Craft A/C regression status where shared code requires it;
25. build result;
26. lint result;
27. browser/worker smoke result;
28. remaining blockers before the dedicated 3/4-mod search-scaling phase.

---

# Constraints

Do not:

- add unit tests;
- add Craft-specific solver branches;
- hardcode a desired Phase 2H winner;
- hardcode `4 x Fracturing Orb` into a lower bound;
- turn a lower bound into an executable finite recommendation;
- use external empirical rates as mechanics inputs;
- hide unresolved candidates merely because they are dominated;
- call an unresolved candidate resolved;
- weaken acquisition-safety semantics;
- restore pre-fractured market purchase;
- restore the legacy approximate self-fracture formula;
- reintroduce standard Crafting Bench target/notable creation;
- redesign the Phase 2G UI hierarchy;
- combine this phase with a broad live-pricing pipeline rewrite;
- broadly attack 3/4-mod search before the new proof bounds are validated.

---

# Recommended Implementation Order

```text
1. Instrument current lower-bound decomposition on the forced-Rare fixture.
2. Add a generic mechanics-required-cost bound API with explicit provenance.
3. Implement the narrow desired-fracture mandatory-cost case from shared mechanics.
4. Combine it with the existing partial-graph lower bound using max().
5. Add admissibility diagnostics against certified continuations.
6. Re-run normal-price and artificial cheap-fracture fixtures.
7. Feed the stronger bound into candidate classification.
8. Stop bound-dominated candidates from consuming competitive frontier work.
9. Re-run forced-Rare two-mod and measure status/runtime/work.
10. Run one-mod/two-mod/no-unwanted + Phase 2G browser regressions.
11. Run shared parity/A/C regressions as required by touched code.
12. Run build/lint/production browser+worker smoke.
13. Write the Phase 2H completion report and commit regenerated diagnostics.
```

After Phase 2H, move directly into a dedicated **3/4-mod Rare search-scaling phase** unless the new evidence reveals a more fundamental mechanics blocker.