# Post Phase 2C Review and Phase 2D Executable Fracture Acquisition Plan

## Status / Source of Truth

Current implementation reviewed at:

- `a14fde35dbd68ae1f26b50ea33c85b123f214530` — `feat: complete phase 2c search hardening`

This document is the source of truth for the next implementation pass. It supersedes the earlier Phase 2C planning documents for future work.

Primary implementation and diagnostics reviewed:

- `crafting-engine/src/domain/TargetDefinition.ts`
- `crafting-engine/src/rules/actionRegistry.ts`
- `crafting-engine/src/rules/externalParity.ts`
- `crafting-engine/src/solver/genericSearch.ts`
- `crafting-engine/src/solver/targetFeasibility.ts`
- `crafting-engine/src/solver/strategyDiscovery.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/src/service/optimizerValidation.ts`
- `src/CraftOptimizer.tsx`
- `output-developer-ui-phase2c.txt`
- `output-browser-phase2c-smoke.txt`
- Craft A/C regression outputs

No unit-test work is requested in this phase.

---

# Executive Verdict

## Phase 2C

**PASS.**

Phase 2C fixed the largest recommendation-quality problem exposed by the live browser tests.

The generic two-mod `Any` target now obtains a certified clean-base acquisition policy instead of presenting an unresolved ~1500c fractured-base route as the ordinary recommendation.

The phase also successfully added:

- generic final-state constraints;
- `Allow extra affixes` vs `No unwanted affixes` UI semantics;
- minimum-feasible-rarity search staging;
- fair bounded acquisition feasibility probes;
- acquisition-safe vs provisional recommendation statuses;
- engine-derived two-mod Alteration parity;
- exact-fixture Harvest raw-presence and one-Annul parity;
- deadline-aware large Harvest transition generation;
- DEEPEN no-progress early stopping;
- preserved one-mod behavior;
- preserved Craft A/C regressions.

The product is now substantially stronger for ordinary one- and two-mod targets.

## Next major limitation

The largest remaining product-economics approximation is now fracture acquisition:

> **Self-fracture acquisition is still a research formula rather than an executable policy discovered through the shared crafting mechanics.**

Fractured starting states are central to the expensive multi-stage crafts this optimizer is intended to solve. The next phase should therefore replace that approximation with actual search-derived fracture acquisition economics.

## Recommended next phase

> **Developer UI Phase 2D — Executable Fracture Acquisition, Buy-vs-Self Comparison, and Persistent Search Extension**

Do not spend this phase primarily on visual polish or unrelated mechanics.

---

# User-Directed Fracture Acquisition Invariant

This is a permanent product requirement.

Whenever the optimizer considers a route that uses a fractured modifier—whether as a starting acquisition or as an intermediate strategic milestone—it must compare:

```text
SELF-FRACTURE THE MODIFIER
vs
BUY THE FRACTURED BASE
```

whenever a valid market quote for the fractured base is available.

This comparison is mandatory. A market-purchase option must never suppress generation/evaluation of the self-fracture option, and a self-fracture option must never suppress a valid market-purchase option.

In practice, self-fracturing is expected to be cheaper in many or most cases. **Do not encode that expectation as a solver rule.** The engine must calculate both routes and let expected cost decide.

For every plausible fracture target generated from the requested final target, compare the complete route families. Example:

```text
clean / no fracture
self-fracture T1 ES
buy fractured T1 ES
self-fracture T1 Intelligence
buy fractured T1 Intelligence
self-fracture 35% Effect
buy fractured 35% Effect
...
```

Only include fracture targets that are mechanically relevant and legally modeled; do not enumerate arbitrary irrelevant pool mods merely to create more candidates.

If an exact market quote is unavailable:

- keep the self-fracture route;
- mark market purchase unavailable;
- never invent a market price.

If the self-fracture route remains unresolved and a market route is resolved, acquisition selection is only safe if the unresolved self-fracture lower bound cannot beat the market incumbent. Otherwise return a provisional acquisition result.

This invariant applies to the generic solver, not only Craft A/C fixtures.

---

# Verified Phase 2C Results

## 1. Live-equivalent two-mod `Any` target is now acquisition-safe

Controlled diagnostic:

```text
Target:
T1 Maximum Energy Shield + T1 Intelligence
Final rarity: Any
Extra affixes allowed

Selected acquisition:
Clean Base

Expected cost:
179.586086c controlled

Recommendation status:
BEST_RESOLVED_ACQUISITION_SAFE

Acquisition safe:
YES

Fair acquisition probes:
3 / 3 certified

Clean Base:
~1080 states

Fractured T1 ES:
~40 states

Fractured T1 Int:
~27 states

On-policy unresolved probability:
0%

Terminal absorption:
100%

EV reconciliation:
0c
```

Real browser smoke:

```text
Selected acquisition: Clean Base
Expected cost: ~228.790c with browser market pricing
Runtime: ~1.3s
Status: BEST_RESOLVED_ACQUISITION_SAFE
```

This is a strong permanent regression.

## 2. One-mod regression remains healthy

The browser path continues to choose the clean-base rolling family for T1 ES instead of the former ~1500c approximate fracture route.

Keep this as the cheapest and fastest mandatory browser regression.

## 3. Final-state constraints are correctly separated from raw target presence

The engine now models:

```ts
FinalStateConstraints {
  maxTotalExplicitAffixes?: number;
  maxUnmatchedAffixes?: number;
  minOpenPrefixes?: number;
  minOpenSuffixes?: number;
}
```

`maxUnmatchedAffixes: 0` correctly distinguishes:

```text
T1 ES + T1 Int
```

from:

```text
T1 ES + T1 Int + junk
```

without adding Craft-specific cleanup logic.

Preserve this architecture.

## 4. Minimum feasible rarity now improves recommendation staging

For one Prefix + one Suffix and `requiredRarity = Any`, the engine derives:

```text
minimum feasible rarity = Magic
```

This prevents recommendation-stage rare/Regal expansion from starving the clean Magic completion family.

Keep minimum rarity as a search-priority fact, never a legality restriction.

## 5. External Alteration parity is strong

Craft of Exile:

```text
18 / 85,471
0.0210598%
~1 / 4,748.4
```

Shared engine analytical:

```text
0.0229995%
```

Seeded MC:

```text
0.0238000%
500,000 trials
```

The analytical value lies inside the supplied external confidence interval.

Status:

```text
ALIGNED
```

Do not tune Alteration mechanics toward the observation.

## 6. Exact Harvest fixture is now correctly represented

Confirmed external physical fixture:

```text
Large Cluster Jewel
Attack Damage while holding a Shield
ilvl 100
12 passives
Rare
unfractured
starting non-fractured affixes arbitrary / replaced by Harvest
```

Current results:

```text
RAW HARVEST TARGET PRESENCE
External:   0.2512458%
Analytical: 0.2755331%
Seeded MC:  0.2753000%
Relative difference: ~9.67% optimistic

ONE ANNUL CONDITIONAL PRESERVATION
External:   40.0367%
Analytical: 43.7754%
Seeded MC:  44.2790%
Relative difference: ~9.34% optimistic

HARVEST -> EXACTLY ONE ANNUL TARGET PRESENCE
External:   0.1005906%
Analytical: 0.1206158%
Seeded MC:  0.1219000%
Relative difference: ~19.91% optimistic
```

All three remain correctly labeled:

```text
CLOSE / APPROXIMATE
```

The combined one-Annul fixture means only:

```text
both targets remain after exactly one Annul
```

and does **not** mean:

```text
fully clean two-mod final item
```

Preserve this interpretation.

## 7. Craft A/C remain healthy

Craft A remains approximately:

```text
7623.7c analytical
7568.1c pooled MC
~ -0.73%
zero missing states
```

Craft C remains approximately:

```text
42814.4c analytical
42483.5c pooled MC
~ -0.77%
1 / 10,000 timeout
zero missing states
```

Do not broadly rewrite these mature regression paths.

---

# Finding 1 — Current Self-Fracture Economics Bypass The Shared Solver

## Severity

**CRITICAL for multi-stage economic recommendations**

`strategyDiscovery.ts` still estimates self-fracture acquisition using a research formula rather than executable shared mechanics.

The current shape is effectively:

```text
estimate target-mod hit rate from one affix-generation pool
-> expected Alterations
-> expectedAlts * hardcoded Alteration rate
-> add preparation allowance
-> add Fracturing Orb cost
-> multiply by four attempts for 25% desired fracture
```

The implementation includes logic equivalent to:

```ts
const expectedAlts = 1 / hitRate;
const prepCostPerAttempt = expectedAlts * 0.11 + 10;
const totalSelfFracCost = 4 * (cleanBaseCost + prepCostPerAttempt + fractureCost);
```

This was useful as an early estimate, but it is no longer acceptable as the primary ranking mechanism for fractured acquisition.

The engine already owns:

- Transmutation;
- Alteration;
- Augmentation;
- Regal;
- Exalted Orb;
- Scour;
- Fracturing Orb;
- restart/reacquire behavior;
- weighted mod pools;
- price provenance;
- Bellman recovery logic.

Therefore self-fracture economics should now emerge from those shared mechanics.

---

# Phase 2D Priority 1 — Build Generic Executable Self-Fracture Acquisition Synthesis

## Goal

A desired fractured starting state must be obtainable through distinct acquisition methods:

```text
market purchase, when quoted
executable self-fracture route
approximate research estimate only as a temporary fallback/reference
```

The executable self-fracture route must be solved from shared mechanics, not encoded as a Craft-specific sequence.

## Recommended architecture

Introduce an acquisition-synthesis request/result abstraction. Exact naming is flexible.

Example:

```ts
interface AcquisitionSynthesisRequest {
  cleanStartingState: ItemState;
  desiredPhysicalState: PhysicalStateRequirement;
  enabledActionIds: string[];
  searchBudget: SearchBudget;
}

interface AcquisitionSynthesisResult {
  status: 'RESOLVED' | 'PROVISIONAL' | 'UNRESOLVED';
  expectedCostChaos?: number;
  lowerBoundChaos: number;
  policy: ...;
  expectedActionUsage: ...;
  proof: ...;
  confidence: ...;
}
```

For a desired single-fractured base, the terminal physical requirement should represent the reusable post-reset state, for example:

```text
required target mod is fractured
no removable junk remains
physical state is legal for subsequent crafting
```

Do not hardcode modifier IDs or reference Craft A/C in the generic acquisition solver.

## Required modeled policy family

The shared engine should be able to discover behavior such as:

```text
clean base
-> Transmutation / Alteration / Augmentation
-> obtain desired target mod
-> Regal / Exalt as needed to reach legal Fracturing state
-> Fracturing Orb
    -> desired mod fractured
        -> Scour/reset removable junk
        -> acquisition terminal
    -> wrong mod fractured
        -> abandon/restart with a clean base
```

Exact actions must emerge from legality, weights, prices, and continuation EV.

If four explicit modifiers are the cheapest legal fracturing preparation, the solver should discover that. If another legal modeled state is cheaper, it should be allowed to choose it.

Do not manually encode a fixed 25% retry multiplier into the executable route; let Fracturing transitions and restart loops create the expectation.

## Missing mechanics coverage

The historical approximate preparation model assumes capabilities such as a cheap preparation/filler step.

If a required preparation mechanic is not yet modeled, do not silently hide that gap behind a hardcoded allowance.

Use only shared mechanics that actually exist and report the coverage limitation.

If later evidence shows a missing core mechanic—such as an authoritative Crafting Bench filler—is materially necessary for realistic self-fracture economics, plan and implement it separately from authoritative data rather than inventing its behavior in this phase.

---

# Phase 2D Priority 2 — Always Compare Executable Self-Fracture Against Market Purchase

This priority implements the permanent fracture acquisition invariant.

For each relevant fractured physical candidate:

```text
candidate physical state: fractured target X

method A:
EXECUTABLE SELF-FRACTURE

method B:
MARKET PURCHASE, if exact quote exists
```

Both methods lead to the same downstream physical state and should therefore share the downstream crafting value.

The economic comparison should be:

```text
self-fracture acquisition EV + downstream EV
vs
market purchase price + downstream EV
```

Because downstream physical state is identical, the acquisition-cost difference is sufficient for ranking those two methods, but retain full-route reporting for clarity.

## Multiple fracture targets

If a final target contains multiple plausible fracture candidates, evaluate each relevant candidate independently.

For example:

```text
fracture 35% Effect:
  self vs buy

fracture T1 Intelligence:
  self vs buy

fracture T1 ES:
  self vs buy
```

Then compare those complete route families against each other and against clean/no-fracture acquisition.

Do not assume the “obvious” fracture target is best.

## Market data semantics

A market method exists only when an exact, user-supplied, or otherwise supported quote exists for that fractured physical target.

Do not fabricate fractured-base prices.

If no market quote exists:

```text
Market purchase: UNAVAILABLE
Self-fracture: still evaluate
```

The UI already has per-target fractured-price override infrastructure; preserve and use it.

---

# Phase 2D Priority 3 — Acquisition Method Proof And Provenance

The service/UI must clearly distinguish:

```text
MARKET PURCHASE
EXECUTABLE SEARCH-DERIVED SELF-FRACTURE
APPROXIMATE RESEARCH ESTIMATE
```

For executable self-fracture expose at least:

```text
expected acquisition cost
expected action usage
price confidence
mechanics confidence
selected-policy properness
terminal absorption
cost reconciliation
search budget / exhaustion
unresolved competitors
proof status
```

## Approximate fallback

The old research estimate may remain temporarily for comparison/debugging.

However:

- when an executable self-fracture route resolves, do not silently substitute the research estimate for it;
- do not label the research estimate as equivalent to a solved route;
- preferably remove the estimate from normal ranking once the executable replacement passes regressions;
- if an unresolved executable self-fracture lower bound can beat a resolved market purchase, acquisition selection remains provisional.

---

# Phase 2D Priority 4 — Remove Hardcoded Currency Economics From Remaining Self-Fracture Estimates

While any research estimate remains, it must use the same evaluated `PriceBook` economics/provenance as normal actions.

Do not retain silent values such as:

```text
Alteration = 0.11c
Fracturing Orb = fallback numeric literal
```

for route ranking when the active price context differs.

Unknown or unavailable prices must remain unavailable rather than silently receiving a ranking value.

The preferred end state is that executable synthesis removes the need for this formula from normal recommendations.

---

# Finding 2 — Search Rounds Still Rebuild The Graph

## Severity

**HIGH for executable fracture synthesis and multi-stage targets**

Phase 2C still reports:

```text
EXPANSION MODE: REBUILT_EACH_ROUND
```

Typical repeated work:

```text
one-mod:
~1082 final states / ~2164 cumulative expansion work

two-mod:
~1148 final states / ~2296 cumulative expansion work
```

This is manageable for current simple targets, but executable fracture acquisition introduces longer cyclic policies and additional rare states.

## Required Phase 2D direction

Implement persistent graph extension within a single optimizer request.

Desired behavior:

```text
round 1 graph
-> retain nodes and transition distributions
-> retain value/policy seeds where valid
-> prioritize unresolved frontier
-> expand only new states
-> re-evaluate on the enlarged graph
```

Do not rebuild every known state from the starting state each round.

### Correctness requirements

Persistent state must preserve every identity dimension already established, including:

```text
base / enchant / ilvl / passives
physical state flags
target and final-state constraints
fracture state
mod exclusions / target roll sensitivity
enabled mechanics / Harvest scope
acquisition portfolio
```

Do not trade canonical correctness for speed.

## Cross-request DEEPEN reuse

Reusing a compatible graph across a later UI `Retry deeper` request is desirable but secondary.

If implemented, its cache key must also include price context/fallback policy because values and action eligibility can change even when transitions do not.

It is acceptable to implement persistent extension only within one request in this phase and defer safe cross-request reuse.

---

# Finding 3 — Route Proof Language Is Correct But Can Be More Understandable

The UI may currently show both:

```text
BEST_RESOLVED_ACQUISITION_SAFE
```

and:

```text
UNRESOLVED COMPETITORS MAY BE CHEAPER
```

These are mathematically compatible:

- acquisition family selection is safe;
- exact action-policy optimality is still not proven.

For normal users, make these separate dimensions visible:

```text
Acquisition choice:
SAFE / PROVISIONAL

Crafting policy optimality:
PROVEN / NOT PROVEN
```

Suggested copy when acquisition is safe but action proof is incomplete:

```text
The starting/acquisition choice is safe among modeled acquisition methods.
The exact crafting policy may still improve because unresolved action alternatives remain.
```

Do not collapse these two concepts back into one generic confidence label.

---

# Finding 4 — Rare Two-Mod Search Remains A Useful Scalability Regression

Phase 2C still reports the forced-Rare two-mod target as approximately:

```text
PROVISIONAL_RESOLVED
self-fractured T1 ES incumbent ~1511.5c
clean-base unresolved lower bound ~4c
acquisition safe: NO
5000 states / 15000 cumulative work
```

This is acceptable for the completed Phase 2C gates because the normal `Any` target is solved correctly.

However, executable fracture synthesis plus persistent graph extension should be measured against this fixture.

Do not hardcode a solution.

Report whether Phase 2D changes:

```text
clean-base feasibility
fractured acquisition economics
state count
repeated work
acquisition safety
runtime
```

---

# Phase 2D Required Fracture Diagnostics

## Diagnostic A — Single Target Fracture Synthesis

Choose one ordinary target modifier on the known 12-passive shield cluster and request the reusable physical state:

```text
that modifier fractured
no removable junk
```

Report:

```text
preparation policy
expected Transmutations
expected Alterations
expected Augmentations
expected Regals
expected Exalts, if used
expected Fracturing Orbs
expected Scours
expected clean-base restarts
fracture success / failure transition behavior
expected acquisition EV
properness
absorption
reconciliation
proof status
```

Use a fixed diagnostic price context, but derive all action costs through `PriceBook`.

## Diagnostic B — Self vs Market Same Physical State

Supply a market price for the same fractured target and prove both methods are evaluated.

Run at least two price fixtures:

```text
Market price intentionally above self-fracture EV
-> self-fracture should win

Market price intentionally below self-fracture EV
-> market purchase should win
```

This validates comparison logic without hardcoding which method is normally cheaper.

## Diagnostic C — Multiple Target Fractures

Use a target containing at least two legally fracturable requested mods.

Show that the portfolio contains, where quotes are supplied:

```text
clean
self-fracture A
buy fracture A
self-fracture B
buy fracture B
```

and ranks the complete route families generically.

## Diagnostic D — Wrong Fracture Recovery

Show that a wrong fractured modifier does not magically reset in-place.

The policy must naturally pay for abandoning/reacquiring a legal clean attempt according to the modeled restart semantics.

## Diagnostic E — Existing External Fracture Parity

Preserve the known 4-mod Fracturing Orb benchmark:

```text
250 / 1000 desired fractures
25%
```

Shared analytical and seeded sampling should remain aligned.

Do not tune acquisition economics to this observation; use it only to validate the mechanic.

---

# Craft A As The Main Acquisition-Synthesis Integration Fixture

After standalone fracture acquisition passes, use Craft A as the strongest integration check because it has multiple plausible fracture choices and known historical purchase references.

Do **not** replace the mature Craft A policy implementation in one large rewrite.

Instead compare the new generic acquisition synthesis against its acquisition assumptions.

Required route families should include, when prices are supplied:

```text
clean/no-fracture family where legal
self-fracture 35% Effect
buy fractured 35% Effect
self-fracture T1 Intelligence
buy fractured T1 Intelligence
other relevant requested fracture candidates if generated
```

The generic optimizer must decide the acquisition family.

It must not contain:

```ts
if (craftA) choose fracture35
```

or equivalent behavior.

If executable self-fracture economics differ materially from the old approximate ~1533c reference, report why rather than tuning the new solver back to the historical estimate.

Possible valid causes include:

```text
current currency prices
actual shared preparation policy
missing modeled Bench filler
alternative action choice
retry/recovery policy
```

---

# Persistent Search Acceptance Targets

The purpose of persistent extension is reduced repeated work, not a specific magic performance number.

For fixtures that require more than one round, report:

```text
final canonical states
new states added each round
states reused
transition distributions reused
cumulative expansion work
rebuild-equivalent work avoided
Bellman/policy reevaluation time
```

A successful implementation should no longer describe normal multi-round search as:

```text
REBUILT_EACH_ROUND
```

unless a fallback path was explicitly used.

If persistent extension risks incorrect identity or stale transition reuse, preserve correctness and document the limitation instead of forcing the optimization.

---

# External Parity Requirements

Preserve all Phase 2C fixtures and semantics.

Especially preserve:

```text
Alteration T1 ES + T1 Int:
ALIGNED

Harvest raw presence:
CLOSE / APPROXIMATE

One Annul conditional preservation:
CLOSE / APPROXIMATE

Harvest -> exactly one Annul target presence:
CLOSE / APPROXIMATE
```

Do not relabel the combined Harvest+Annul observation as a clean-finished result.

No new Craft of Exile simulation is required solely for Phase 2D unless a mechanics discrepancy is discovered.

---

# UI Scope For Phase 2D

Keep UI changes functional and small.

The UI should expose fracture acquisition evidence in the result when relevant:

```text
Fractured target X

Self-fracture:
  expected acquisition: ...
  status/proof: ...

Buy fractured:
  market price: ...
  quote provenance: ...

Selected method:
  ...
```

If no market quote exists:

```text
Buy fractured: price unavailable
```

Do not hide the self-fracture calculation.

If executable self-fracture is unresolved but potentially cheaper than buy, mark the acquisition choice provisional.

Do not spend this phase on broad visual redesign.

---

# Regression Matrix

The next implementation must preserve or report changes for all of the following.

## R1 — One-mod T1 ES browser

Expected:

```text
Clean Base
acquisition-safe
good runtime
proper / absorbing / reconciled
```

## R2 — Two-mod T1 ES + T1 Int, `Any`

Expected:

```text
clean-base family receives certified feasible policy
acquisition safe
no return to ~1500c fractured recommendation due search starvation
```

## R3 — Two-mod no-unwanted

Expected:

```text
final-state semantics remain active
clean terminal state behaves correctly
```

## R4 — Forced-Rare two-mod

Report current behavior and whether persistent extension/self-fracture synthesis improves it.

No hardcoded expected winner.

## R5 — Harvest external parity

Preserve B1/B2/B3 semantics and confidence labels.

## R6 — Fracturing Orb external parity

Preserve ~25% analytical/MC behavior on the known four-mod fixture.

## R7 — Craft A

Preserve mature regression health and compare new acquisition synthesis separately.

## R8 — Craft C

Preserve mature regression health.

## R9 — Build / browser

Run:

```text
npm run build
npm run lint
real production browser + worker smoke
```

No unit tests are requested.

---

# Phase 2D Completion Gates

Phase 2D is complete when all of the following are true:

- [ ] self-fracture acquisition can be computed from executable shared mechanics;
- [ ] self-fracture retry cost arises from actual fracture/restart transitions, not a fixed 4x multiplier;
- [ ] every relevant fractured candidate compares self-fracture vs market purchase when a market quote exists;
- [ ] self-fracture is still evaluated when market price is unavailable;
- [ ] no valid market purchase suppresses self-fracture evaluation;
- [ ] no hardcoded assumption forces self-fracture to win;
- [ ] acquisition methods expose proof/provenance/confidence distinctly;
- [ ] old hardcoded self-fracture currency rates no longer affect normal ranking;
- [ ] at least one self-vs-buy fixture proves each side can win when prices justify it;
- [ ] multiple possible fracture targets are compared generically;
- [ ] wrong-fracture recovery pays actual restart/reacquisition economics;
- [ ] persistent graph extension is implemented within a request, or a clearly justified correctness blocker is documented;
- [ ] one-mod regression remains healthy;
- [ ] two-mod `Any` regression remains healthy;
- [ ] Harvest parity semantics remain unchanged;
- [ ] Fracturing parity remains healthy;
- [ ] Craft A remains healthy;
- [ ] Craft C remains healthy;
- [ ] `npm run build` passes;
- [ ] `npm run lint` passes apart from any explicitly documented pre-existing warning;
- [ ] production browser/worker smoke passes;
- [ ] no unit tests were added.

---

# Required Completion Report

When implementation is complete, report:

1. commit SHA;
2. files changed;
3. build result;
4. lint result;
5. browser/worker smoke result;
6. executable self-fracture architecture;
7. exact acquisition terminal-state semantics;
8. shared actions used by self-fracture synthesis;
9. expected action usage for the standalone fracture fixture;
10. expected self-fracture acquisition EV;
11. wrong-fracture recovery behavior;
12. self-vs-buy high-market-price fixture result;
13. self-vs-buy low-market-price fixture result;
14. behavior when market price is unavailable;
15. multiple-fracture-target portfolio result;
16. whether any approximate self-fracture formula remains in normal ranking;
17. any remaining missing mechanic that materially biases self-fracture economics;
18. persistent graph extension architecture/status;
19. repeated expansion work before/after;
20. forced-Rare two-mod result;
21. one-mod regression;
22. two-mod `Any` regression;
23. Harvest parity regression;
24. Fracturing Orb parity regression;
25. Craft A regression;
26. Craft C regression;
27. whether fracture acquisition is now safe for normal product recommendations;
28. remaining blockers before broader UI polish / productization.

---

# Constraints

Do not:

- add unit tests;
- reintroduce Allflame;
- add Craft-specific solver branches;
- assume self-fracture is cheaper without calculating it;
- skip self-fracture merely because a market fractured base is available;
- skip market purchase when an exact supported quote is available;
- invent missing fractured-base market prices;
- hardcode a 25% fracture success result into acquisition EV instead of using shared transitions;
- hardcode a 4x retry multiplier into executable self-fracture;
- use hidden fixed currency prices in acquisition ranking;
- silently treat approximate research acquisition as executable proof;
- broadly rewrite mature Craft A/C policy code;
- sacrifice canonical-state correctness for persistent-cache performance;
- change Harvest external fixture semantics.

---

# Recommended Order

```text
1. executable physical-state acquisition synthesis
2. executable self-fracture route
3. mandatory self-fracture vs market comparison
4. acquisition proof/provenance service contract
5. remove/de-rank legacy approximate fracture formula
6. persistent graph extension within one request
7. standalone fracture diagnostics
8. multiple-fracture candidate comparison
9. Craft A acquisition-synthesis integration
10. Rare two-mod scalability regression
11. browser fracture-acquisition presentation
12. full A/C + parity regression
```

After these gates pass, broader UI polish and productization can proceed on a substantially more trustworthy economic foundation.
