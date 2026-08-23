# Post UI Phase 2A Review and UI Phase 2B Search/Usability Plan

## Review Scope

This review covers `main` at:

- `0f8659548d59ff5ccd167107a0a6d6506565be39` — `feat: harden optimizer search and add UI phase 2`

Primary implementation and artifacts reviewed:

- `crafting-engine/src/solver/genericSearch.ts`
- `crafting-engine/src/rules/actionRegistry.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/src/service/optimizerValidation.ts`
- `src/CraftOptimizer.tsx`
- `src/crafting/optimizerWorkerClient.ts`
- `src/crafting/optimizerPricing.ts`
- `scripts/developerUiPhase2Diagnostic.ts`
- `scripts/browserPhase2Smoke.mjs`
- `output-developer-ui-phase2-before.txt`
- `output-developer-ui-phase2.txt`
- `output-browser-phase2-smoke.txt`
- `output-craft-a-review.txt`
- `output-craft-c-review.txt`

This document is the source of truth for the next implementation pass.

---

# Executive Verdict

## Phase 2A correctness

**PASS.**

The live one-mod failure was real and the root cause was correctly identified and repaired.

Before this change the exact T1 ES target incorrectly produced:

```text
Approximate self-fracture T1 ES: 1534.3c
Clean base route:               1544.3c
On-policy states:               2
```

The clean acquisition's selected continuation abandoned into self-fracture, while competitive expansion failed to recursively follow the cheap unresolved Transmutation family beneath the off-policy clean acquisition.

After the fix, the same controlled fixture produces:

```text
Selected acquisition: clean base
Expected total:       14.817009c
Clean downstream EV: 4.817000c
Normal-state action:  Orb of Transmutation
On-policy states:     1361
Absorption:           ~100%
EV reconciliation:    0.000397c
```

That is a major correctness improvement.

The generic solver now propagates uncertainty from competitive unresolved descendants back through values that consume those descendants, including off-policy acquisition routes. It also recursively prioritizes competitive paths instead of only traversing the globally selected policy.

## Hard runaway-search safety

**PASS as a safety mechanism.**

The browser host timer now terminates and recreates the worker after the configured wall-time budget plus a small grace period.

The browser diagnostic demonstrates:

```text
5-second configured search: stopped in ~5295ms
page responsive afterward:  PASS
worker usable afterward:     PASS
explicit cancellation:       PASS
30-second two-mod search:     returned in ~7171ms
```

This closes the prior 5+ minute runaway UI failure.

## Default simple-craft usability

**NOT YET A FULL PASS.**

This distinction is important.

The corrected T1 ES direct engine diagnostic still ran for approximately the entire 30-second search budget:

```text
elapsed:          30002ms
graph states:     3334
budget exhausted: YES
```

The T1 Intelligence and Precise Retaliation one-mod service fixtures also consume essentially their full configured 10-second budgets.

The code now prevents an unbounded browser freeze, but the next phase should make a simple useful recommendation return quickly rather than relying on the hard host timer.

The post-fix browser smoke does **not** include a normal default-budget one-mod T1 ES run proving that the corrected clean-base recommendation is actually returned through the real React/worker path before the hard host guard fires.

Therefore:

> Phase 2A correctness is passed; runtime safety is passed; normal simple-craft response-time usability still needs one focused pass.

## Harvest approximation consistency

**PASS for the current explicitly approximate model.**

The shared Harvest implementation now models:

```text
preserve fractured mods
+ guarantee tagged mod
+ roll toward 3 or 4 total explicit affixes
```

The runtime diagnostic shows both unfractured and one-fracture states at 50%/50% analytical 3-vs-4 affix count, with seeded results close to that distribution.

Keep the confidence label:

```text
APPROXIMATE / EXTERNALLY CLOSE
```

The known compound Craft of Exile benchmark remains roughly 19% less optimistic than the engine and remains non-blocking.

Do not promote this Harvest model to validated game mechanics merely because analytical and internal seeded results agree.

## Target/validation boundary

**PASS.**

The shared service validator now owns the important target constraints and the UI supports:

```text
Any / Magic / Rare final rarity
1–4 exact mod IDs
mod-group conflicts
prefix/suffix capacity
notable capacity
item level
base/enchantment/passive compatibility
search budgets
```

Three or more explicit modifiers normalize to Rare when no explicit rarity was supplied.

Preserve this shared validator. Do not move crafting-rule validation back into React-only logic.

## Pricing integration

**GOOD FOUNDATION; needs one provenance/freshness hardening pass.**

The optimizer now consumes the existing league price snapshots and maps supported economy keys explicitly rather than silently inventing a 10c clean-base market price.

Manual clean-base and fractured-base overrides are also available.

This is the correct architecture.

---

# What Improved Materially

## 1. Competitive-value uncertainty is now propagated

A proper selected continuation no longer automatically implies a fully trustworthy value.

The solver now recognizes that a successor can have a proper incumbent while still containing a cheaper unresolved competing action, and propagates that uncertainty back to parent values.

This directly fixes the live one-mod acquisition failure.

## 2. Off-policy acquisition families are no longer invisible to competitive expansion

Competitive expansion now recurses through states reached only from an off-policy acquisition action.

That is required for a true acquisition portfolio: a currently losing starting route must still be explored when its lower bound says it could beat the incumbent.

## 3. Deadline checks exist inside expensive transition generation

Transition generation now accepts a deadline control and checks it during expensive loops/recursion.

This is much stronger than checking only between top-level Bellman phases.

## 4. The browser has an independent hard guard

The worker host terminates the worker if the engine does not return within the configured budget plus grace.

This should remain as a last-resort safety boundary even after cooperative search shutdown is improved.

## 5. Search results remain proof-honest

The corrected one-mod policies are fully resolved, proper, absorbing, and cost-reconciled, but unresolved competitors remain.

The output correctly retains:

```text
BEST FULLY RESOLVED POLICY FOUND
GLOBAL OPTIMALITY: NOT YET PROVEN
```

Do not weaken this wording.

## 6. Market-price mapping is explicit

The browser adapter maps engine currency keys to snapshot keys explicitly, including Fracturing Orb and Harvest lifeforce keys.

Missing mappings remain absent and therefore fall back/unavailable according to the existing pricing policy.

## 7. Craft A and Craft C remain stable

Reference outputs remain healthy and should continue to be treated as regression fixtures.

Do not tune generic-search changes to preserve exact A/C numbers if a verified shared mechanic legitimately changes them, but broad unrelated regressions are not acceptable.

---

# Findings For The Next Phase

# Finding 1 — The Hard Timeout Is A Safety Net, Not The Desired Normal Search Completion Path

## Severity

**HIGH — user-facing responsiveness**

The 5-second browser benchmark currently demonstrates the host hard guard:

```text
Search stopped at configured 5000ms budget
worker terminated/recreated
```

That is a good failure boundary, but a routine budget expiration should ideally return the best proof-honest result already computed rather than discard all work and surface an error.

There is an important implementation detail in `GenericSearchEngine.search()`:

```ts
if (!result) {
  result = this.searchOnce(startState, { ...effectiveOptions, maxStates: 1 });
}
```

When the first round is interrupted before producing a completed result, this fallback starts **after the original deadline** and does not pass the original deadline into `searchOnce()`.

The browser host guard is therefore still responsible for killing work that may continue after the cooperative engine budget has expired.

## Required fix

Make the engine finish cooperatively before the host hard guard in normal operation.

Preferred behavior:

```text
engine search deadline
    <
host worker-kill deadline
```

Reserve enough shutdown/serialization time for the worker to post a result.

Do not begin an unbounded fallback solve after the engine deadline.

If no completed full round exists, return a minimal proof-honest result using work created **within** the allowed engine budget, or establish a very small seed result early enough that a completed incumbent is always available.

The host termination/recreate behavior should remain as a failsafe for defects or unexpectedly non-cooperative code.

## Required reporting

Add:

```text
engineDeadlineMs
hostGuardDeadlineMs
timeToFirstCompletedRoundMs
timeToFirstCertifiedPolicyMs
returnedAtBudget: YES/NO
hostGuardTriggered: YES/NO
```

For normal supported searches, the target is:

```text
hostGuardTriggered: NO
```

---

# Finding 2 — A Correct One-Mod Route Still Takes Far Too Long Under The Current Deep Competitive Search

## Severity

**HIGH — next usability bottleneck**

The T1 ES policy is now correct, but the direct default-budget fixture uses almost exactly 30 seconds.

T1 Intelligence and Precise Retaliation use almost exactly their 10-second fixture budgets.

This indicates that the engine continues spending nearly all available time trying to improve/prove off-policy competitors after a useful fully resolved selected policy already exists.

The number of potentially competitive unresolved candidates is still very large:

```text
T1 Intelligence:    2721
Precise Retaliation: 2709
```

This is not a correctness failure, but it is poor default product behavior for the simplest target class.

## Required architecture

Separate these goals explicitly:

```text
1. FIND A CERTIFIED USEFUL POLICY
2. IMPROVE / CHALLENGE THAT POLICY
3. PROVE MODELED OPTIMALITY WHEN FEASIBLE
```

Do not force every normal UI request to spend its full budget on goal 2/3 before returning goal 1.

A suitable product contract could expose a search intent/profile such as:

```text
RECOMMEND
DEEPEN
PROVE
```

Equivalent naming is fine.

`RECOMMEND` must still be proof-honest:

- selected policy fully resolved;
- proper / absorbing;
- occupancy converged;
- EV reconciled;
- unresolved competitors explicitly reported;
- no `PROVEN_OPTIMAL` claim unless actually proven.

It may return `BEST_RESOLVED` early rather than exhaust the entire budget trying to eliminate every unresolved competitor.

`Retry deeper` should then perform the deeper competitor search.

## Critical anti-regression requirement

Do not recreate the original self-fracture bug by returning too early.

Before a fast recommendation is considered ready, cheap acquisition families whose lower bounds can materially beat the incumbent must receive enough priority to avoid obvious acquisition blindness.

The controlled T1 ES fixture must still select the clean-base route, not the 1534.3c self-fracture shortcut.

---

# Finding 3 — Expansion Rounds Still Rebuild Work Instead Of Extending One Persistent Graph

## Severity

**HIGH for performance; medium for correctness**

Current lazy expansion increases the state budget across rounds but rebuilds the graph from the start.

This duplicates transition generation, graph aggregation, Bellman work, and trust classification.

Now that live UI performance matters, the duplication is worth addressing.

## Required direction

Prefer persistent/incremental graph extension within one search:

```text
round 1 graph
  -> retain nodes / transitions / cached distributions
  -> add prioritized frontier states
  -> re-run only necessary value/trust work
```

Do not implement a fragile incremental solver merely for cleverness. If a safe persistent-graph implementation is too large for one pass, first instrument how much wall time is spent in:

```text
transition generation
graph aggregation
Bellman iteration
candidate trust classification
absorption
occupancy
competitive frontier collection
repeated/rebuilt work
```

Then optimize the dominant source.

The next completion report must include timing attribution rather than only total runtime.

---

# Finding 4 — Current Candidate Lower Bounds Are Too Weak To Prune Large Off-Policy Families

## Severity

**HIGH for scalability**

A large number of actions remain potentially competitive because their lower bound is effectively just immediate action cost.

Example from the T1 ES diagnostic:

```text
selected Alteration Q: ~4.897c
Regal lower bound:      0.200c
Regal:                  UNRESOLVED / potentially competitive
```

A 0.2c immediate-cost lower bound is valid but extremely weak, so the solver has little ability to prune rare-state branches.

## Recommended next solver improvement

Move toward an **optimistic value lower bound** over the partial graph rather than immediate action cost alone.

One defensible approach:

```text
L(terminal) = 0
L(missing/unexpanded successor) = 0
L(s) = min_a [ immediateCost(a) + sum P(s'|s,a) * L(s') ]
```

Start from zero and iterate monotonically over the known partial graph.

This remains optimistic/admissible because unknown continuation is treated as free.

Use:

```text
resolved incumbent U
optimistic competitor lower bound L
```

Then:

```text
if L >= U -> safely dominated
if L < U  -> still competitive / eligible for expansion
```

Equivalent mathematically justified bounds are acceptable.

Do not introduce heuristic lower bounds that can incorrectly prune a genuinely cheaper route.

## Reporting

For unresolved acquisition/action competitors expose:

```text
lowerBoundChaos
incumbentUpperBoundChaos
optimalityGapChaos (when meaningful)
```

This will also improve UI explanation of why a route remains unresolved.

---

# Finding 5 — The Actual Browser One-Mod Post-Fix Path Must Become A Required Regression Fixture

## Severity

**HIGH — live failure originally came from browser testing**

The post-fix diagnostics prove the engine/service behavior, but the browser Phase 2 smoke does not run the corrected T1 ES target through the normal UI and assert the clean-base result.

That should be permanent because the original bug was discovered only when the UI was manually exercised.

## Required browser fixture

Using a controlled 10c clean-base override:

```text
Large Cluster Jewel
12% increased Attack Damage while holding a Shield
ilvl 84
12 passives
Final rarity: Any
Target: Glowing (T1) / T1 Maximum ES
```

Verify through real React -> worker -> service:

```text
selected acquisition: clean base
self-fracture is not selected
recommendation status: BEST_RESOLVED or better
selected policy proper: YES
unresolved on-policy probability: 0
EV reconciled: YES
host hard guard triggered: NO
```

Record actual runtime.

Also keep the existing exact Rare two-mod browser fixture.

---

# Finding 6 — Market Freshness Needs Per-Evidence Timestamps, Not Only File-Level Freshness

## Severity

**MEDIUM-HIGH — economics provenance**

The browser pricing adapter currently calculates one `stale` flag from:

```text
snapshot.fetchedAt
```

But the clean-base quote has its own timestamp:

```text
entry.at
```

and currency rates have their own timestamp:

```text
snapshot.ratesAt
```

A price file can be rewritten/refreshed while a specific cached base quote remains much older.

Therefore file-level freshness is not sufficient evidence for an individual quote.

## Required fix

Track freshness separately:

```text
cleanBaseQuote.at
cleanBaseQuote.ageMs
cleanBaseQuote.stale
currencyRatesAt
currencyRatesAgeMs
currencyRatesStale
snapshotAt
```

Use the actual quote timestamp for clean-base freshness warnings.

The solver may still use stale data if the user permits it, but the provenance must be explicit.

Do not silently relabel stale evidence as current market pricing.

## Additional pricing diagnostic

Validate every current engine-to-snapshot currency mapping against the committed snapshot and report:

```text
mapped and present
mapped but missing
unmapped engine currency
```

Missing market rates should continue to use research fallback/unavailable according to user settings.

---

# Finding 7 — The Current Market Base Quote Is A Sampled Low Quote; Make That Semantics Visible

## Severity

**MEDIUM — economics interpretation**

The optimizer uses the cached `low` listing as clean-base acquisition cost.

That is defensible for a buyer seeking the cheapest available item, but the UI should make clear that this is:

```text
sampled low listing
```

rather than a robust market median.

The price cache also stores `mid`.

## Required UI refinement

Display at least:

```text
market low
sample midpoint/median-like value
listed count
sampled count
quote timestamp
```

Continue to use the low quote as the default acquisition opportunity if desired, but label it accurately.

A future preference may allow conservative/low pricing modes; do not block this phase on that feature.

---

# Finding 8 — Target Summary Is Correct But Still Developer-Oriented

## Severity

**MEDIUM — UI Phase 2B polish**

The target summary currently renders raw modifier IDs.

The IDs are useful for debugging, but a user-facing summary should primarily display:

```text
Glowing (T1) — T1 Maximum Energy Shield
of the Prodigy (T1) — T1 Intelligence
```

with the exact ID available as secondary/collapsible detail.

## Required refinement

Use the existing catalog metadata to render friendly mod names, tier, Prefix/Suffix, and optionally required ilvl.

Keep exact IDs available for diagnostics.

---

# Finding 9 — Expected Action Usage Is Good Data But Not Yet A Human Crafting Route

## Severity

**MEDIUM — route explanation**

Expected action usage currently answers:

```text
How many of each action do I expect to consume?
```

The complete policy rule table answers:

```text
What should I do in every reachable state?
```

Neither by itself is an ideal human crafting guide.

## Phase 2B requirement

Add a compact policy explanation layer derived from the policy, not hardcoded recipes.

Example style:

```text
Start: buy clean base
Roll magic with Transmutation
If target is present -> stop
If target side is blocked -> Alteration
If one compatible slot remains -> compare Augmentation vs Alteration
...
```

For complex policies, group mechanically equivalent states into conditional rules.

Do not fabricate a single linear sequence for a branching Bellman policy.

Keep the full on-policy table under developer/advanced details.

---

# Finding 10 — `Retry deeper` Should Reuse Search Work When Practical

## Severity

**MEDIUM-HIGH — UX/performance**

The UI now provides `Retry deeper`, which is the correct proof-honest interaction.

However, a deeper retry currently starts a new optimizer request and reconstructs the solver/search from scratch.

After persistent graph extension exists, consider retaining a search session in the worker keyed by a stable input fingerprint:

```text
base / enchant / ilvl / passives
target
prices
mechanics/fallback settings
```

A deeper retry could then continue the frontier instead of discarding prior work.

Do not implement cross-request caching before correctness-safe invalidation is clear.

At minimum, keep this design in mind while implementing persistent per-request graph extension so the architecture does not prevent later reuse.

---

# Recommended Implementation Order

## Phase 2B.1 — Search completion and instrumentation

1. Reserve internal deadline headroom before host worker termination.
2. Remove or bound the post-deadline `maxStates: 1` fallback.
3. Return the best completed proof-honest result at cooperative budget exhaustion whenever possible.
4. Add stage timing and time-to-first-certified-policy metrics.
5. Add the actual browser one-mod T1 ES post-fix regression.

**Gate:** normal simple one-mod search must return a useful clean-base result without triggering the host hard guard.

## Phase 2B.2 — Recommendation vs proof search

1. Define explicit recommendation/deepening behavior.
2. Allow the UI to return a certified `BEST_RESOLVED` policy without spending the entire default budget proving off-policy action families.
3. Preserve acquisition-family prioritization so the old self-fracture failure cannot return.
4. Keep `Retry deeper` for broader competitor exploration.

**Gate:** fast return must remain proof-honest and must not regress the T1 ES clean-base selection.

## Phase 2B.3 — Partial-graph lower bounds / performance

1. Implement or prototype optimistic partial-graph value lower bounds.
2. Compare unresolved candidate count and runtime before/after.
3. Instrument rebuild duplication.
4. If justified, make expansion rounds incrementally extend a persistent graph.

**Gate:** reduce large one-mod unresolved competitor work without unsafe pruning.

## Phase 2B.4 — Market evidence hardening

1. Track quote/rate/file freshness independently.
2. Add currency mapping coverage diagnostic.
3. Expose low/mid/listed/sampled/timestamp in UI.
4. Keep manual clean/fractured overrides explicit.

## Phase 2B.5 — Human-readable result presentation

1. Friendly target names/tier instead of raw IDs as primary display.
2. Compact recommended-route summary.
3. Grouped conditional policy explanation.
4. Keep proof, confidence, search budgets, and full on-policy table available under advanced details.
5. Preserve selected-route vs considered-alternative warning scopes.

## Phase 2B.6 — Regression and scaling pass

Run:

```text
T1 ES one-mod browser fixture
T1 Intelligence one-mod service/browser fixture
Rare T1 Int + T1 ES browser fixture
Harvest-selected full-pool fixture
Craft B full-pool stress fixture
Craft A regression
Craft C regression
```

Craft B does not need to become fully solved in this phase, but report whether improved bounds/incremental expansion materially improve its resolved frontier and runtime.

---

# UI Search Semantics To Preserve

The following distinctions must remain visible:

## `PROVEN_OPTIMAL`

Only when modeled-action optimality is actually proven.

## `BEST_RESOLVED`

A valid fully resolved/proper/absorbing/cost-reconciled policy exists, but unresolved modeled alternatives may still be cheaper.

This is expected to be the normal useful result for many UI searches.

## `NO_RESOLVED_ROUTE`

No certified route was found under the current budget.

This is a valid result, not an exception.

## Host hard timeout

This is a runtime safety failure/failsafe, not a normal optimization result.

Prefer a proof-honest partial search result before reaching this boundary.

---

# Performance Targets For The Next Pass

These are product targets, not mathematical correctness requirements.

Use them to drive profiling rather than to introduce unsafe shortcuts.

### One-mod target

A simple exact one-mod request should ideally produce its first certified useful policy in a few seconds, not consume the full 30-second budget.

Report both:

```text
time to first certified policy
total deep-search time
```

### Two-mod target

The current ~7.2 second browser result is acceptable for the developer UI.

Do not regress it substantially while optimizing one-mod behavior.

### Hard ceiling

The host guard should almost never fire in normal supported searches.

It remains required as a safety net.

---

# Required Diagnostics

The next implementation must regenerate a diagnostic covering:

## A. Controlled T1 ES

```text
clean base = 10c
selected acquisition
selected policy
expected cost
self-fracture alternative
first-certified-policy time
final/deep-search time
host guard triggered?
unresolved competitor count
on-policy states
absorption
Bellman convergence
occupancy convergence
EV reconciliation
```

## B. Search-stage timing

```text
transition generation
graph aggregation/value setup
Bellman
candidate classification / trust
absorption
occupancy
competitive frontier collection
rebuild/incremental expansion
serialization/worker round trip
```

Approximate timing instrumentation is acceptable if clearly labeled.

## C. Browser real-path checks

```text
one-mod clean route returned
5-second budget returns result if possible, otherwise host guard behavior explicitly documented
30-second two-mod result
explicit cancellation
worker recovery
Retry deeper
```

## D. Pricing coverage

```text
pricing league
snapshot age
clean quote age
currency rate age
low/mid/listed/sampled
mapped currency rates present/missing
manual override provenance
```

---

# Constraints

Do not:

- add unit tests unless explicitly requested;
- reintroduce Allflame crafting mechanics;
- add Fossils/Essences/Beastcrafting or other exotic systems in this phase;
- add Craft-specific solver branches;
- create special one-mod/two-mod/three-mod algorithms;
- hardcode the T1 ES answer;
- hide unresolved competitors;
- call `BEST_RESOLVED` globally optimal;
- weaken timeout safety to improve benchmark numbers;
- use a heuristic lower bound that can incorrectly prune a cheaper route;
- tune Harvest to the external 0.1225% compound observation without a mechanics basis.

Continue using runtime diagnostics, browser smoke, external parity, and A/C regression outputs. No new unit-test work is required.

---

# Completion Report Required

When implementation is complete, report:

1. Commit SHA.
2. Files changed.
3. `npm run build` result.
4. Whether the host hard guard triggered in each normal browser fixture.
5. Engine deadline vs host deadline behavior.
6. T1 ES browser-path selected acquisition and expected cost.
7. T1 ES time to first certified policy.
8. T1 ES total/deep-search runtime.
9. T1 Intelligence result/runtime.
10. Rare T1 Int + T1 ES result/runtime.
11. Whether recommendation/deepen/prove semantics were introduced and how they differ.
12. Current unresolved competitor counts for one-mod and two-mod fixtures.
13. Lower-bound implementation and proof that it is admissible.
14. Search-stage timing attribution.
15. Whether expansion rounds still rebuild or incrementally extend the graph.
16. Pricing snapshot / clean-quote / currency-rate freshness semantics.
17. Currency mapping coverage result.
18. Friendly target-summary result.
19. Compact branching policy explanation result.
20. Harvest confidence/parity status.
21. Craft B stress result.
22. Craft A regression.
23. Craft C regression.
24. Remaining blockers before moving from Developer UI to broader product polish.

---

# Bottom Line

The latest pass fixed the most important live correctness bug and established a real hard runtime safety boundary.

The engine can now find the expected cheap clean-base one-mod family instead of incorrectly preferring a 1534c approximate fracture.

The next problem is no longer "does the UI call the right engine?"

It is:

> **Can the engine return a useful, certified, proof-honest recommendation quickly, then deepen the proof only when requested?**

That should be the focus of UI Phase 2B before spending significant time on visual polish.