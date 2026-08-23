# Post Phase 2C Review and Phase 2D Executable Self-Fracture Acquisition Plan

## Status / Source of Truth

Current implementation reviewed at:

- `a14fde35dbd68ae1f26b50ea33c85b123f214530` — `feat: complete phase 2c search hardening`

This document is the source of truth for the next implementation pass. It supersedes the earlier Phase 2C planning documents for future work.

**Important product decision added after the original Phase 2D review:**

> **Core strategy discovery must treat a fractured route as a self-manufactured fractured base. The optimizer does not need to compare that route against buying a pre-fractured base.**

This deliberately removes fractured-base market availability from the core crafting strategy problem.

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

The largest remaining product-economics approximation is fracture acquisition:

> **Self-fracture acquisition is still a research formula rather than an executable policy discovered through the shared crafting mechanics.**

Fractured starting states are central to the expensive multi-stage crafts this optimizer is intended to solve. Phase 2D should replace that approximation with actual search-derived fracture acquisition economics.

## Recommended next phase

> **Developer UI Phase 2D — Executable Self-Fracture Acquisition and Persistent Search Extension**

Do not spend this phase primarily on visual polish or unrelated mechanics.

---

# Permanent Product Invariant — Fractured Routes Are Self-Fractured

This is a user-directed permanent product requirement.

When strategy discovery determines that a fractured modifier may be useful, the canonical acquisition method is:

```text
SELF-FRACTURE THE MODIFIER
```

The optimizer should **not require a pre-fractured market listing** in order for that route to exist.

The core optimizer should not spend search/product complexity comparing:

```text
self-fracture target X
vs
buy fractured target X
```

Instead:

```text
fractured target X route
=
executable self-fracture acquisition policy
+
downstream crafting policy
```

## Why this is the product rule

A pre-fractured base may:

- not exist on trade;
- have only one listing;
- have an unrealistic or manipulated price;
- have the wrong passive count;
- have the wrong item level;
- have the wrong cluster enchantment;
- disappear between pricing and execution;
- have stale or incomplete pricing evidence.

Self-fracturing is a reproducible crafting route. If the required base and crafting materials exist, the optimizer can describe an executable path.

A valuable product property is therefore:

> **Every core recommended route should be reproducible from an ordinary supported base rather than depend on a specific pre-fractured item existing on trade.**

## Important distinction

This does **not** mean:

```text
hardcode self-fracture cost = some fixed number
```

and it does **not** mean:

```text
assume the historical approximate self-fracture formula is correct
```

It means:

> **Assume self-fracture is the acquisition method for fractured strategy families, but calculate the cost of self-fracturing through executable shared mechanics.**

The strategy-selection question remains fully dynamic:

```text
clean/no-fracture route
vs
self-fracture target A route
vs
self-fracture target B route
vs
self-fracture target C route
...
```

The solver must still determine:

- whether fracturing is useful at all;
- which modifier is best to fracture;
- how to prepare the fracture attempt;
- how to recover from a wrong fracture;
- whether a clean/no-fracture strategy is cheaper.

Do not hardcode the “obvious” fracture target.

## Market purchase status

Existing fractured-market-price infrastructure does not need to be aggressively deleted in Phase 2D if removal creates unnecessary churn.

However:

- it must not be required by normal strategy discovery;
- it must not block a self-fracture route when no quote exists;
- it should not participate in core route ranking after the executable self-fracture path is established;
- UI controls that exist only to supply fractured-base prices should be removed or hidden from the normal product path when practical;
- the capability may remain dormant for a possible future advanced `Allow buying pre-fractured bases` feature.

Do not spend Phase 2D implementing or polishing that future advanced feature.

---

# Verified Phase 2C Results To Preserve

## 1. Live-equivalent two-mod `Any` target is acquisition-safe

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

This is a permanent regression.

## 2. One-mod regression remains healthy

The browser path chooses the clean-base rolling family for T1 ES instead of the former ~1500c approximate fracture route.

Keep this as the cheapest and fastest mandatory browser regression.

## 3. Final-state constraints remain authoritative

The engine models:

```ts
FinalStateConstraints {
  maxTotalExplicitAffixes?: number;
  maxUnmatchedAffixes?: number;
  minOpenPrefixes?: number;
  minOpenSuffixes?: number;
}
```

`maxUnmatchedAffixes: 0` correctly distinguishes a clean target from target+junk without Craft-specific cleanup logic.

## 4. Minimum feasible rarity remains search staging only

For one Prefix + one Suffix with `requiredRarity = Any`:

```text
minimum feasible rarity = Magic
```

Preserve this as a search-priority fact, never a legality restriction.

## 5. External Alteration parity remains aligned

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

Status:

```text
ALIGNED
```

Do not tune mechanics to the observation.

## 6. Exact Harvest fixture semantics remain unchanged

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

All three remain:

```text
CLOSE / APPROXIMATE
```

The combined one-Annul fixture means only that both targets remain after exactly one Annul. It is not a clean-finished-item benchmark.

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
-> hardcoded/approximate preparation cost
-> add Fracturing Orb cost
-> multiply by four attempts for 25% desired fracture
```

The implementation includes logic equivalent to:

```ts
const expectedAlts = 1 / hitRate;
const prepCostPerAttempt = expectedAlts * 0.11 + 10;
const totalSelfFracCost = 4 * (cleanBaseCost + prepCostPerAttempt + fractureCost);
```

This was useful as an early research estimate but must not remain the primary ranking mechanism for fractured routes.

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

Self-fracture economics should emerge from shared mechanics.

---

# Phase 2D Priority 1 — Build Generic Executable Self-Fracture Acquisition Synthesis

## Goal

A desired reusable fractured starting state must be obtained by an executable self-fracture policy.

Conceptually:

```text
requested fractured physical state
-> synthesize cheapest executable self-fracture policy
-> return acquisition EV + policy/proof
-> feed resulting physical state into downstream optimizer
```

The old approximate research estimate may remain temporarily as diagnostics/reference, but it should leave normal ranking once the executable replacement is healthy.

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

For a desired single-fractured base, terminal semantics should represent a reusable post-reset physical state such as:

```text
required target mod is fractured
no removable junk remains
physical state is legal for downstream crafting
```

Do not hardcode modifier IDs or reference Craft A/C inside the generic acquisition solver.

## Required modeled policy family

The shared engine should be capable of discovering behavior such as:

```text
clean base
-> Transmutation / Alteration / Augmentation
-> obtain desired target mod
-> Regal / Exalt / other modeled legal actions as needed
-> reach legal Fracturing state
-> Fracturing Orb
    -> desired mod fractured
        -> Scour/reset removable junk
        -> acquisition terminal
    -> wrong mod fractured
        -> abandon/restart with a clean base
```

Exact preparation actions must emerge from legality, weights, prices, and continuation EV.

Do not manually encode a fixed retry multiplier. Let Fracturing transitions and restart cycles generate expected cost.

## Fracturing legality must be authoritative

Do not assume a preparation shape solely because the historical research estimate did so.

The synthesis solver must use actual modeled Fracturing Orb legality and state transitions.

If game data/mechanics require an exact four-mod rare before fracturing, enforce that through the shared mechanic.

If the authoritative mechanic permits something else, use the authoritative rule.

## Missing mechanics coverage

The historical estimate assumes cheap filler/preparation capabilities.

If a required preparation mechanic is not modeled, do not hide that gap behind a magic numeric allowance.

Use only executable shared mechanics and report missing coverage.

If Crafting Bench filler becomes materially necessary, model it later from authoritative data rather than inventing its behavior.

---

# Phase 2D Priority 2 — Compare Fracture Targets, Not Fractured-Base Sellers

The economic portfolio should compare strategic physical families:

```text
Clean / no fracture
Self-fracture target A
Self-fracture target B
Self-fracture target C
...
```

For example, a four-mod target might produce:

```text
Clean / no fracture
Fracture T1 ES yourself
Fracture T1 Intelligence yourself
Fracture 35% Effect yourself
Fracture +4 Attributes yourself
```

Only include fracture targets that are mechanically relevant and legally generated from the requested target.

Do not enumerate arbitrary pool modifiers merely to increase search breadth.

## What remains dynamic

The solver must derive independently for every relevant fracture candidate:

```text
self-fracture acquisition EV
+
downstream crafting EV
=
complete route EV
```

Then compare complete routes.

Therefore this Phase 2D rule does **not** mean:

```text
always fracture something
```

It means:

```text
if considering fractured target X,
manufacture X yourself
```

A clean/no-fracture family remains a normal competitor.

## No fractured-market dependency

A route must not become unavailable because:

```text
no fractured market quote exists
```

Core discovery should no longer need per-target fractured purchase prices.

Any legacy market-purchase acquisition candidate should be removed from core ranking once doing so is safe and low-risk.

---

# Phase 2D Priority 3 — Self-Fracture Proof And Provenance

For executable self-fracture, expose at least:

```text
fractured target
expected acquisition cost
preparation policy
expected action usage
price confidence
mechanics confidence
selected-policy properness
terminal absorption
cost reconciliation
search budget / exhaustion
unresolved competitors
proof status
wrong-fracture restart behavior
```

The UI/service should clearly distinguish:

```text
EXECUTABLE SEARCH-DERIVED SELF-FRACTURE
```

from:

```text
LEGACY APPROXIMATE RESEARCH ESTIMATE
```

The latter may remain in diagnostic output temporarily but should not masquerade as executable proof.

## Approximate fallback

If executable synthesis is unresolved, do not silently use the research estimate as though it were a certified acquisition route.

Prefer:

```text
SELF-FRACTURE ACQUISITION: UNRESOLVED / PROVISIONAL
```

with a bound/proof status.

A legacy estimate may be displayed separately as research reference only.

---

# Phase 2D Priority 4 — Remove Hardcoded Currency Economics From Self-Fracture Ranking

No normal recommendation should rank fracture candidates using silent constants such as:

```text
Alteration = 0.11c
Fracturing Orb = fallback numeric literal
prep allowance = 10c
```

Executable synthesis should obtain costs from the same active `PriceBook` used by normal actions.

Unknown/unavailable prices must remain unavailable or be explicitly labeled research fallback according to existing price-confidence rules.

The preferred end state is that the old formula is not used in normal recommendations at all.

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

This is manageable for simple targets but executable fracture acquisition introduces longer cyclic policies and additional rare states.

## Required Phase 2D direction

Implement persistent graph extension within a single optimizer request where it can be done without weakening canonical correctness.

Desired behavior:

```text
round 1 graph
-> retain nodes and transition distributions
-> retain value/policy seeds where valid
-> prioritize unresolved frontier
-> expand only new states
-> re-evaluate on enlarged graph
```

Do not repeatedly rebuild every known state from the beginning.

### Correctness requirements

Persistent state must preserve all relevant identity dimensions:

```text
base / enchant / ilvl / passives
physical state flags
target and final-state constraints
fracture state
mod exclusions / target roll sensitivity
enabled mechanics / Harvest scope
acquisition scope
```

Do not trade canonical correctness for speed.

## Cross-request DEEPEN reuse

Cross-request graph reuse remains secondary.

It is acceptable to implement persistence only within a single optimizer request and defer safe cross-request reuse.

---

# Finding 3 — Proof Language Should Keep Two Dimensions Separate

Continue distinguishing:

```text
Acquisition / starting-family choice:
SAFE / PROVISIONAL

Crafting policy optimality:
PROVEN / NOT PROVEN
```

For fracture families, acquisition safety now means the solver has sufficiently compared:

```text
clean/no-fracture
vs
relevant executable self-fracture families
```

It does **not** require checking whether some seller might list an equivalent fractured base cheaper.

That question is intentionally outside core Phase 2D strategy discovery.

---

# Finding 4 — Forced-Rare Two-Mod Search Remains A Scalability Regression

Phase 2C reports the forced-Rare two-mod target approximately as:

```text
PROVISIONAL_RESOLVED
self-fractured T1 ES incumbent ~1511.5c
clean-base unresolved lower bound ~4c
acquisition safe: NO
5000 states / 15000 cumulative work
```

This remains useful for measuring:

- executable self-fracture economics;
- persistent graph extension;
- clean rare-route feasibility;
- repeated work;
- acquisition-family safety;
- runtime.

Do not hardcode its solution.

---

# Phase 2D Required Fracture Diagnostics

## Diagnostic A — Single Target Executable Self-Fracture

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
fracture success/failure transition behavior
expected acquisition EV
properness
absorption
reconciliation
proof status
```

Use a fixed diagnostic price context but derive costs through `PriceBook`.

## Diagnostic B — Wrong Fracture Recovery

Prove that a wrong fractured modifier does not magically reset in-place.

The policy must naturally pay for abandoning/reacquiring a legal clean attempt according to modeled restart semantics.

Report expected restarts and their EV contribution.

## Diagnostic C — Multiple Target Fractures

Use a target containing at least two legally fracturable requested modifiers.

Show that the portfolio contains:

```text
clean/no fracture
self-fracture A
self-fracture B
```

and, for a richer fixture when appropriate:

```text
self-fracture C
self-fracture D
```

Show complete-route EV for each candidate.

Do not include fractured-base market purchase in the core comparison.

## Diagnostic D — No Market Quote Required

Run the self-fracture portfolio with **zero fractured-base market overrides**.

Required result:

```text
fractured strategy families still exist
```

This is a critical product gate.

No self-fracture route may depend on a buy quote being present.

## Diagnostic E — Existing External Fracturing Parity

Preserve the known four-mod Fracturing Orb benchmark:

```text
250 / 1000 desired fractures
25%
```

Shared analytical and seeded sampling should remain aligned.

Do not hardcode acquisition economics to this observation; use it to validate the mechanic.

## Diagnostic F — Legacy Estimate Comparison

For at least one fracture target, report:

```text
old approximate self-fracture estimate
new executable self-fracture EV
difference
reason for difference
```

Do not force agreement.

Potential legitimate differences include:

```text
current prices
actual preparation policy
real restart loop
missing Bench filler
alternative legal actions
state-dependent continuation
```

---

# Craft A As Main Fracture-Discovery Integration Fixture

After standalone self-fracture synthesis passes, use Craft A as the strongest integration check because it has multiple plausible fracture choices.

Do **not** replace the mature Craft A policy in one large rewrite.

Compare the new generic acquisition synthesis against the mature acquisition assumptions.

Required strategic families should include relevant candidates such as:

```text
clean/no-fracture family where legal
self-fracture 35% Effect
self-fracture T1 Intelligence
self-fracture T1 ES, if the generic target/discovery marks it relevant
other requested fracture candidates if legally generated
```

The generic optimizer must decide which fractured target, if any, produces the lowest total route EV.

It must not contain:

```ts
if (craftA) choose fracture35
```

or equivalent behavior.

Historical fractured-base purchase references may remain in old diagnostic reports for context, but they are **not part of the Phase 2D core strategy comparison**.

If executable self-fracture economics differ materially from the old approximate ~1533c reference, report why rather than tuning back to the reference.

---

# Persistent Search Acceptance Targets

For fixtures requiring multiple rounds, report:

```text
final canonical states
new states added each round
states reused
transition distributions reused
cumulative expansion work
rebuild-equivalent work avoided
Bellman/policy reevaluation time
```

Successful persistent extension should no longer describe normal multi-round search as:

```text
REBUILT_EACH_ROUND
```

unless an explicit fallback path is used.

If persistent extension risks incorrect identity or stale reuse, preserve correctness and document the blocker.

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

Fracturing Orb 4-mod target selection:
~25% / ALIGNED
```

Do not relabel the combined Harvest+Annul observation as a clean-finished result.

No new Craft of Exile simulation is required solely for Phase 2D unless a mechanics discrepancy is discovered.

---

# UI Scope For Phase 2D

Keep UI work functional and small.

When a self-fracture family is relevant, result evidence should communicate something like:

```text
Fractured target: 35% Effect
Acquisition method: Self-fracture
Expected acquisition: ...
Preparation/retry policy: ...
Status/proof: ...
```

Do **not** require the user to provide a fractured-base price for normal optimization.

Remove or de-emphasize per-target fractured-market override controls from the normal UI path when practical.

It is acceptable to leave underlying market-purchase plumbing dormant if deleting it would add risk with no Phase 2D benefit.

Do not spend this phase on broad visual redesign.

---

# Regression Matrix

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

Preserve mature regression health and compare new self-fracture synthesis separately.

## R8 — Craft C

Preserve mature regression health.

## R9 — Fractured route without market quote

Required:

```text
self-fracture family still discovered and evaluated
```

## R10 — Build / browser

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
- [ ] retry cost arises from actual Fracturing/restart transitions, not a fixed 4x multiplier;
- [ ] fractured strategy families exist without any fractured-base market quote;
- [ ] normal fractured-route ranking no longer depends on buying a pre-fractured base;
- [ ] relevant fracture targets are compared generically against each other and clean/no-fracture;
- [ ] the optimizer does not hardcode which target should be fractured;
- [ ] acquisition methods expose proof/provenance/confidence distinctly;
- [ ] legacy approximate self-fracture values do not drive normal route ranking once executable synthesis resolves;
- [ ] hidden hardcoded self-fracture currency constants no longer affect normal ranking;
- [ ] wrong-fracture recovery pays actual restart/reacquisition economics;
- [ ] at least one standalone self-fracture fixture is fully resolved/proper/absorbing/reconciled;
- [ ] multiple possible fracture targets are compared generically;
- [ ] dormant fractured-market plumbing, if retained, is outside the normal discovery/ranking path;
- [ ] persistent graph extension is implemented within a request, or a clearly justified correctness blocker is documented;
- [ ] one-mod regression remains healthy;
- [ ] two-mod `Any` regression remains healthy;
- [ ] no-unwanted semantics remain healthy;
- [ ] Harvest parity semantics remain unchanged;
- [ ] Fracturing parity remains healthy;
- [ ] Craft A remains healthy;
- [ ] Craft C remains healthy;
- [ ] `npm run build` passes;
- [ ] `npm run lint` passes apart from explicitly documented pre-existing warnings;
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
11. wrong-fracture recovery behavior and expected restarts;
12. result with no fractured-base market quote supplied;
13. multiple-fracture-target portfolio result;
14. clean/no-fracture vs each self-fracture complete-route EV;
15. whether any approximate self-fracture formula remains in normal ranking;
16. old approximate estimate vs new executable EV for at least one target;
17. any remaining missing mechanic that materially biases self-fracture economics;
18. whether fractured-market purchase code remains and, if so, confirmation that it is outside normal ranking;
19. persistent graph extension architecture/status;
20. repeated expansion work before/after;
21. forced-Rare two-mod result;
22. one-mod regression;
23. two-mod `Any` regression;
24. no-unwanted regression;
25. Harvest parity regression;
26. Fracturing Orb parity regression;
27. Craft A regression;
28. Craft C regression;
29. whether fracture acquisition is now safe for normal product recommendations;
30. remaining blockers before broader UI polish/productization.

---

# Constraints

Do not:

- add unit tests;
- reintroduce Allflame mechanics;
- add Craft-specific solver branches;
- require a fractured-base market quote for a fractured strategy family;
- make buying a pre-fractured base part of normal Phase 2D strategy ranking;
- invent missing fractured-base market prices;
- hardcode which target modifier should be fractured;
- hardcode a 25% result directly into acquisition EV instead of using shared Fracturing transitions;
- hardcode a 4x retry multiplier into executable self-fracture;
- use hidden fixed currency prices in self-fracture ranking;
- silently treat approximate research acquisition as executable proof;
- broadly rewrite mature Craft A/C policy code;
- sacrifice canonical-state correctness for persistent-cache performance;
- change Harvest external fixture semantics.

---

# Recommended Order

```text
1. executable physical-state acquisition synthesis
2. executable self-fracture route
3. remove fractured-market dependency from core discovery/ranking
4. self-fracture proof/provenance service contract
5. remove/de-rank legacy approximate self-fracture formula
6. persistent graph extension within one request
7. standalone self-fracture + wrong-fracture diagnostics
8. multiple-fracture-target comparison
9. no-market-quote regression
10. Craft A self-fracture-discovery integration
11. Rare two-mod scalability regression
12. browser self-fracture presentation cleanup
13. full A/C + parity regression
```

After these gates pass, broader UI polish and productization can proceed on a substantially more trustworthy economic foundation.