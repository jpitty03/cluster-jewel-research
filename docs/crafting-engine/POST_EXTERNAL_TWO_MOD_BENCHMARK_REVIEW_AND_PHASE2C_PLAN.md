# Post External Two-Mod Benchmark Review and Phase 2C Plan

## Status / Source of Truth

Current repository `main` reviewed at:

- `dc24678060a8e23bfdfc7827027103c8e2d3951b` — documentation commit
- latest implementation beneath it: `93d66a728b5af0e6ac6854e2dcf7f2b0cc57d66b` — `feat: harden proof-honest optimizer search`

This document **supersedes** `docs/crafting-engine/POST_PHASE2B_LIVE_UI_REVIEW_AND_MULTIMOD_RESOLUTION_PLAN.md` as the source of truth for the next implementation pass.

It incorporates the live UI findings from that review plus two new independent Craft of Exile observations for the exact T1 Intelligence + T1 Maximum Energy Shield problem family.

No new implementation commit was made between the previous review and this document. The purpose of this review is to refine Phase 2C using the new external evidence.

---

# Executive Verdict

The new external data materially strengthens the Phase 2C priority.

The current UI can return a fully resolved ~1500c fractured-base policy for the two-mod `Any` target while leaving the clean-base acquisition unresolved at an optimistic lower bound near the base price.

The new Craft of Exile Alteration benchmark independently demonstrates that a direct clean/magic two-mod route is not merely theoretically possible; it has an observed hit rate of roughly **1 in 4,748 Alterations**.

That makes the unresolved clean-base family economically plausible enough that the product should not present the ~1500c fractured incumbent as a normal safe recommendation until the clean route receives a fair feasibility solve.

The new Harvest benchmark also exposes a separate product-model issue:

> “contains both target mods” and “finished craft with both target mods and no unwanted affixes” are not the same target.

The current `TargetDefinition` can require mods, rarity, branches, and roll thresholds, but it cannot express a generic final-state cleanliness/open-slot requirement. Therefore a Harvest result containing T1 Int + T1 ES + junk can currently satisfy a two-mod target even when the intended finished craft requires Annul cleanup.

## Phase 2C should now focus on four things

1. **Resolve or safely classify the clean-base two-mod acquisition family.**
2. **Add generic final-state constraints so “raw target presence” and “finished clean state” are distinct.**
3. **Add the new Craft of Exile observations as permanent external parity fixtures without hardcoding them into mechanics.**
4. **Keep recommendation language provisional whenever a materially cheaper unresolved acquisition remains.**

Do not add new exotic crafting mechanics in this phase.

---

# New External Craft of Exile Evidence

## Fixture A — Alteration until both T1 mods

User-supplied Craft of Exile configuration:

```text
Use Orbs of Alteration until you get:
- T1 Added Small Passive Skills also grant: +# to Intelligence
- T1 Added Small Passive Skills also grant: +# to Maximum Energy Shield
```

Observed result:

```text
Attempts:   85,471
Successes:  18
Observed:   0.0210598%
Ratio:      ~1 / 4,748.39
Displayed:  0.021%, ~1 / 4,749
```

Approximate 95% Wilson confidence interval:

```text
0.01332% – 0.03329%
```

### Interpretation

This is a direct independent benchmark for the clean magic two-mod outcome family.

Because a magic cluster can hold at most one prefix and one suffix, an Alteration success containing these exact two target mods is already a clean two-affix magic result. There is no additional junk-affix cleanup stage in this configuration.

This benchmark should become a permanent external fixture.

### Important economics note

The latest live UI one-mod run implied an Alteration price around 0.14c from its expected action-cost reporting. At ~4,748 Alterations, a naive pure-Alt two-mod route is therefore on the rough order of hundreds of chaos, not ~1500c.

Do **not** hardcode that rough cost into the optimizer. Current prices, Transmutation/Augmentation policy, and the weighted pool must derive the actual route EV.

The external benchmark is evidence that the unresolved clean-base family is economically material and deserves recommendation-stage feasibility work.

---

## Fixture B — Harvest Reforge Defences until both T1 mods are present

User-supplied Craft of Exile configuration:

```text
Harvest crafting
-> Reforge
-> Defences

Stop when both are present:
- T1 Intelligence
- T1 Maximum Energy Shield
```

Observed result:

```text
Attempts:   23,137
Successes:  38
Observed:   0.164239%
Ratio:      ~1 / 608.87
Displayed:  0.164%
```

Approximate 95% Wilson confidence interval:

```text
0.11969% – 0.22534%
```

### Critical interpretation

This fixture measures **raw presence of both target mods after a Harvest Reforge Defences**.

It does **not** include Annulment cleanup of unwanted affixes.

Therefore this observation must never be presented as:

```text
probability of a finished clean T1 Int + T1 ES item
```

unless the Craft of Exile success condition explicitly also constrained all unwanted affixes.

The supplied fixture did not do that.

This is a raw-hit benchmark only.

---

# What The Two External Fixtures Tell Us

The raw per-action hit rates are:

```text
Alteration both-mod hit:        ~0.02106%  (~1 / 4,748)
Harvest Defences raw both hit:  ~0.16424%  (~1 / 609)
```

Harvest therefore produces the raw simultaneous presence of both target mods roughly 7.8x as often per craft in these observations.

That does **not** establish Harvest as the cheaper finished strategy because:

- Harvest has a much higher per-attempt cost;
- Harvest can produce additional unwanted affixes;
- Annul cleanup can remove target mods and force recovery/restart loops;
- the exact final-state requirement changes which Harvest outcomes are terminal;
- the engine's Harvest mechanics are still intentionally labeled `APPROXIMATE / EXTERNALLY CLOSE`.

The optimizer must compare full expected costs through actual state transitions, not raw hit-rate ratios.

---

# Finding 1 — The Clean Two-Mod Route Is Now An Externally Supported Priority

## Severity

**CRITICAL for recommendation quality**

The live two-mod UI result previously showed approximately:

```text
Target:
- T1 Maximum Energy Shield
- T1 Intelligence
Final rarity: Any
Clean base manual override: 4c

Resolved incumbent:
Approximate self-fractured T1 ES
~1500c total

Clean base:
UNRESOLVED
Lower bound: ~4c

States:
5000 / 5000
Rounds:
3 / 3
First acquisition-safe recommendation:
not reached
```

The new external Alteration fixture shows a direct two-mod magic success around 1 / 4,748 Alterations.

This does not tell the solver what the optimal route is, but it confirms that the clean rolling family is a serious competitor.

## Required Phase 2C acceptance behavior

For the exact two-mod `Any` target:

```text
T1 Maximum ES Prefix
+
T1 Intelligence Suffix
```

`RECOMMEND` should attempt to establish a feasible clean-base policy before spending the whole recommendation budget on unrelated rare/off-policy proof branches.

Preferred outcome:

```text
clean route receives a certified feasible upper bound
and is economically compared against fractured acquisitions
```

Minimum acceptable outcome:

```text
if clean remains unresolved and L_clean < U_incumbent,
return a PROVISIONAL recommendation status,
not ordinary BEST_RESOLVED acquisition language
```

Do not tune the result toward the Craft of Exile ratio.

---

# Finding 2 — Add A Generic “Finished State” Contract

## Severity

**CRITICAL for target correctness**

Current `TargetDefinition` supports:

```text
requiredMods
requiredRarity
outcomeBranches
acceptableAnyOf
finalRollRequirements
saleValueChaos
```

It does not currently support generic constraints such as:

```text
no unwanted affixes
maximum total explicit affixes
maximum unmatched affixes
minimum open prefix slots
minimum open suffix slots
```

Current `satisfiesTarget()` therefore treats any item containing all required mods as terminal, subject only to required rarity/roll/branch checks.

For Harvest this is important.

These two states are mechanically and economically different:

```text
A. T1 ES + T1 Int

B. T1 ES + T1 Int + junk prefix + junk suffix
```

A raw-presence target may accept both.

A clean-finished target should accept A and reject B, forcing the policy to Annul/recover/restart as appropriate.

## Required generic model

Add a target-level final-state constraint structure. Exact naming is flexible, but it should be generic and mechanically explicit.

Recommended direction:

```ts
interface FinalStateConstraints {
  maxTotalExplicitAffixes?: number;
  maxUnmatchedAffixes?: number;
  minOpenPrefixes?: number;
  minOpenSuffixes?: number;
}
```

Then:

```ts
interface TargetDefinition {
  ...
  finalStateConstraints?: FinalStateConstraints;
}
```

### Definitions

`maxUnmatchedAffixes`
- number of explicit affixes allowed that do not satisfy any requested target requirement.
- `0` means “no junk affixes.”

`maxTotalExplicitAffixes`
- independent explicit-affix cap on the final state.

`minOpenPrefixes` / `minOpenSuffixes`
- allow future crafts to express “finish with an open slot” without inventing a fake target modifier.

Use actual rarity slot capacities.

Do not encode “clean” as a Craft-specific flag.

## UI Phase 2C

At minimum expose a simple finish-condition option:

```text
Extra affixes:
[ Allow extra affixes ]
[ No unwanted affixes ]
```

Advanced open-prefix/open-suffix controls may be exposed now or kept in the service contract if UI scope becomes too large.

The default must be explicit and understandable.

Do not silently change existing target semantics.

---

# Finding 3 — Preserve Two Distinct External Harvest Benchmarks

Do not merge the new raw two-mod Harvest fixture with the existing compound Harvest fixture.

They answer different questions.

Existing fixture:

```text
Fractured T1 Int
-> Harvest Reforge Defence
-> T1 ES + 35% Effect

3,187 / 2,601,014
~0.122529%
~1 / 816.1
```

New fixture:

```text
Harvest Reforge Defences
-> raw simultaneous T1 Int + T1 ES presence

38 / 23,137
~0.164239%
~1 / 608.9

NO Annul cleanup included
```

Both should remain independently named and documented.

Before treating the new fixture as exact pool-specific analytical parity, record/confirm all physical fixture metadata available from the Craft of Exile setup:

```text
base type
cluster enchantment
item level
passive count
starting rarity/state
fracture state, if any
```

Do not silently infer missing fixture metadata.

---

# Finding 4 — Add Engine-Derived Two-Mod Alteration Parity

## Priority

**HIGH**

The shared Alteration mechanic already supports analytical transitions and seeded sampling.

Add a fixed-policy parity diagnostic for:

```text
Magic clean state
-> Orb of Alteration
-> success if both exact T1 ES + T1 Int are present
```

Report:

```text
External Craft of Exile:
18 / 85,471
0.0210598%
~1 / 4,748.4
95% CI ~0.01332%–0.03329%

Engine analytical:
DERIVED FROM SHARED ALTERATION TRANSITIONS

Engine seeded MC:
DERIVED FROM SHARED ALTERATION SAMPLING

absolute difference
relative difference
inside external CI: YES/NO
status
```

The external observation may be a fixture constant.

The engine answer must be calculated.

Do not hardcode 1/4748 into Alteration mechanics.

---

# Finding 5 — Add Engine-Derived Harvest Raw-Presence Parity

## Priority

**HIGH, but mechanics remain approximate**

Once exact fixture starting-state metadata is known, add a fixed-policy diagnostic for:

```text
Harvest Reforge Defences
-> raw success if resulting item contains both T1 ES + T1 Int
```

Report:

```text
External:
38 / 23,137
0.164239%
~1 / 608.9
95% CI ~0.11969%–0.22534%

Engine analytical:
DERIVED FROM SHARED HARVEST TRANSITIONS

Engine seeded MC:
DERIVED FROM SHARED HARVEST SAMPLING

raw-presence comparison only
```

Keep the mechanics label:

```text
APPROXIMATE / EXTERNALLY CLOSE
```

unless independent evidence justifies changing it.

Do not include Annul cleanup in this raw parity row.

---

# Finding 6 — Add A Separate Finished Harvest Policy Diagnostic

The raw Harvest external fixture is not a finished-craft benchmark.

Separately validate the engine's policy for a target with:

```text
required:
- T1 ES
- T1 Int

finalStateConstraints:
- maxUnmatchedAffixes = 0
```

The generic solver should naturally compare behavior such as:

```text
Harvest Defences
-> both targets + no junk
    -> terminal

Harvest Defences
-> both targets + junk
    -> Annul if legal/economic
       -> preserve both targets: continue cleanup / terminal
       -> lose a target: recover/restart through normal policy

Harvest miss
    -> continue/retry/recover according to Bellman policy
```

Do not create a hardcoded Harvest-cleanup recipe.

This diagnostic is about proving that final-state semantics cause cleanup to emerge naturally from shared actions.

If no useful policy resolves within budget, report it honestly and improve search staging rather than adding Craft-specific logic.

---

# Finding 7 — Acquisition Recommendation Safety Must Become A First-Class Service Result

Keep the distinction introduced in the prior review:

```text
selected policy is executable/certified
vs
acquisition choice is safe
vs
modeled global optimality is proven
```

Recommended statuses remain:

```text
PROVEN_OPTIMAL
BEST_RESOLVED_ACQUISITION_SAFE
PROVISIONAL_RESOLVED
NO_RESOLVED_ROUTE
```

Equivalent naming is acceptable.

## `PROVISIONAL_RESOLVED`

Use it when:

```text
there is a fully resolved executable incumbent U
AND
an unresolved acquisition candidate has valid lower bound L < U
```

Display:

```text
Resolved incumbent: U
Best unresolved acquisition lower bound: L
Potential gap: U - L
```

For a provisional result, avoid primary wording such as:

```text
Recommended acquisition
```

Use:

```text
Resolved incumbent acquisition
```

or equivalent.

---

# Finding 8 — Fair Acquisition Feasibility Before Broad Proof Search

The recommendation phase should establish a feasible upper bound for each economically plausible acquisition family before allowing one family's large state frontier to consume the entire state budget.

Generic acquisition candidates may include:

```text
clean base
market fractured target A
self-fractured target A
market fractured target B
self-fractured target B
...
```

Required behavior:

```text
for each distinct acquisition physical state:
    attempt bounded feasible-policy search
    preserve shared canonical-state deduplication
    record feasible U if found
    record optimistic L if unresolved

then choose the best certified feasible incumbent
and deepen competitors whose L can beat it
```

Do not require each acquisition family to prove local optimality before it can contribute a valid executable upper bound.

A proper executable policy cost is already a valid upper bound.

No acquisition candidate should starve another before plausible candidates receive a feasibility attempt.

---

# Finding 9 — Minimum Feasible Terminal Rarity Must Guide `RECOMMEND`

For the raw two-mod target:

```text
T1 ES Prefix
+
T1 Int Suffix
+
required rarity = Any
```

Magic is sufficient.

During recommendation-stage feasibility search, large rare/Regal branches should not outrank the unresolved clean magic completion family merely because rare states receive a generic rarity priority bonus.

Add a generic helper that derives minimum feasible rarity from:

```text
target mod generation types
prefix/suffix counts required
explicit requiredRarity
actual magic/rare affix capacities
```

Examples:

```text
1 Prefix, Any                -> Magic sufficient
1 Prefix + 1 Suffix, Any     -> Magic sufficient
2 Prefixes, Any              -> Rare required
2 Suffixes, Any              -> Rare required
3+ explicit target mods      -> Rare required
requiredRarity = Rare        -> Rare required
requiredRarity = Magic       -> Magic required
```

Use this only for expansion/staging priority.

Do not remove legal higher-rarity actions from the model.

`DEEPEN` and `PROVE` should still consider them.

---

# Finding 10 — Make The New External Data Part Of The Regression Matrix

Add permanent diagnostics for at least these two configurations.

## Regression A — raw clean magic two-mod target

```text
T1 ES + T1 Int
Final rarity: Any or explicitly Magic for the fixed-policy parity row
Extra affixes: no unwanted affixes / naturally impossible on magic once both slots are occupied
```

External Alteration benchmark:

```text
18 / 85,471
~0.0210598%
~1 / 4,748.4
```

Generic optimizer acceptance:

```text
clean-base family receives a feasible certified policy under default recommendation resources
OR result is explicitly PROVISIONAL if a lower-bound competitor remains unresolved
```

## Regression B — Harvest raw presence

```text
T1 ES + T1 Int
Extra affixes allowed
Harvest Reforge Defences raw hit
```

External:

```text
38 / 23,137
~0.164239%
~1 / 608.9
```

This is parity evidence, not necessarily the selected optimal route.

## Regression C — Harvest clean finished state

```text
T1 ES + T1 Int
maxUnmatchedAffixes = 0
```

No external finished probability is currently supplied.

Validate internally through:

```text
shared analytical transitions
seeded transitions
Bellman policy
properness
absorption
occupancy
EV reconciliation
```

Do not invent an external benchmark for this case.

---

# Finding 11 — `DEEPEN` Must Show Actual Progress

Preserve the Phase 2B `RECOMMEND / DEEPEN / PROVE` split.

For `DEEPEN`, report before/after deltas:

```text
new canonical states
new acquisition feasible upper bounds
unresolved acquisition candidates
best unresolved acquisition lower bound
incumbent upper bound
new candidates dominated by bound
optimality gap
```

If a deeper run does not improve graph coverage, bounds, acquisition safety, or incumbent cost, stop early and report:

```text
No meaningful additional progress in this deeper budget.
```

Do not consume the full wall-time budget merely to repeat equivalent work.

---

# Finding 12 — Persistent Graph Extension Remains Desirable, But Comes After Correct Recommendation Semantics

The current implementation still reports:

```text
REBUILT_EACH_ROUND
```

and repeats substantial state work.

Persistent graph extension should remain a Phase 2C/2D optimization target, especially for multi-mod and Craft B searches.

Implementation order:

1. final-state target semantics;
2. acquisition-safe/provisional recommendation semantics;
3. fair acquisition feasibility;
4. minimum-rarity recommendation staging;
5. external two-mod parity diagnostics;
6. then persistent graph extension if needed for the acceptance gates.

Do not introduce a persistent graph design that changes canonical identity or transition correctness merely for speed.

---

# Required Implementation Order

## Phase 2C-A — Target semantics and external fixtures

1. Add `FinalStateConstraints` or equivalent to `TargetDefinition`.
2. Update canonical target identity if target constraints participate in state-key semantics.
3. Update `satisfiesTarget()` and outcome handling.
4. Update service validation and serialization.
5. Add simple UI finish-condition control for extra affixes.
6. Add the new Alteration and Harvest external observations as separate fixtures.
7. Add engine-derived shared-mechanic parity for the two-mod Alteration fixture.
8. Add raw-presence Harvest parity once its exact starting-state metadata is explicit.

## Phase 2C-B — Multi-mod acquisition recommendation safety

9. Add acquisition-safe/provisional result status.
10. Add fair per-acquisition feasibility staging.
11. Add minimum-feasible-rarity staging to `RECOMMEND`.
12. Make the live two-mod `Any` clean-base case a permanent browser regression.
13. Ensure clean-base feasibility is not starved by rare/Regal proof branches.
14. Keep unresolved competitors explicit and lower-bound driven.

## Phase 2C-C — Finished Harvest policy and deeper-search progress

15. Add the clean-finished two-mod target diagnostic (`maxUnmatchedAffixes = 0`).
16. Confirm Annul/recovery emerges from the generic Bellman policy where economic/legal.
17. Add `DEEPEN` before/after frontier metrics.
18. Stop DEEPEN early when no meaningful progress occurs.
19. Implement persistent graph extension only if still needed after the above changes.

---

# UI Acceptance Requirements

## One-mod T1 ES

Must remain healthy:

```text
clean-base acquisition
fast recommendation
proper / absorbing selected policy
0 unresolved on-policy probability
reconciled EV
```

Do not regress this while fixing two-mod search.

## Two-mod T1 ES + T1 Int, extra affixes allowed

Default `RECOMMEND` should:

```text
resolve a plausible clean-base policy
or explicitly label the incumbent PROVISIONAL
```

It must not imply acquisition safety if:

```text
L_clean < U_selected
```

## Two-mod T1 ES + T1 Int, no unwanted affixes

The target must reject Harvest states containing junk.

If Harvest is selected, cleanup/recovery must be represented by the generic policy.

## Rare two-mod target

Keep this as a separate regression.

Do not conflate it with the `Any`/Magic-sufficient target.

---

# External Parity Acceptance Requirements

## Alteration two-mod fixture

Report:

```text
CoE: 18 / 85,471
Engine analytical
Engine seeded MC
95% external CI
absolute difference
relative difference
inside CI yes/no
```

No hardcoded engine probability.

## Harvest raw fixture

Report:

```text
CoE: 38 / 23,137
Engine analytical
Engine seeded MC
95% external CI
RAW PRESENCE ONLY
mechanics confidence
```

No Annul cleanup included in this parity row.

## Harvest clean-finished diagnostic

Label:

```text
INTERNAL POLICY DIAGNOSTIC — NO EXTERNAL FINISHED FIXTURE YET
```

Do not claim Craft of Exile parity for cleanup until external cleanup data exists.

---

# Preserve Existing Regression Fixtures

## Craft A

Preserve current stable behavior approximately:

```text
Analytical: 7623.7c
Pooled MC: 7568.1c
Difference: ~-0.73%
Missing states: 0
Fallback actions: 0
```

## Craft C

Preserve current stable behavior approximately:

```text
Analytical: 42814.4c
Pooled MC: 42483.5c
Difference: ~-0.77%
Missing states: 0
Fallback actions: 0
```

If a legitimate generic target/mechanics correction changes them, report the reason rather than tuning them back.

## Harvest confidence

Keep:

```text
APPROXIMATE / EXTERNALLY CLOSE
```

The existing ~19% optimistic compound-Harvest difference remains tracked and non-blocking.

---

# Constraints

Do **not**:

- add unit tests;
- reintroduce Allflame mechanics;
- add Craft-specific solver branches;
- add separate 1-mod/2-mod/3-mod/4-mod solvers;
- hardcode the new Craft of Exile probabilities into mechanics;
- treat raw Harvest target presence as equivalent to clean finished-state success;
- claim a fractured acquisition is economically recommended while a materially cheaper unresolved acquisition remains without a provisional warning/status;
- remove legal rare actions merely to make the magic route win;
- add unrelated new crafting systems in this pass.

Continue using:

- runtime diagnostics;
- real browser smoke tests;
- external Craft of Exile parity;
- seeded Monte Carlo;
- Bellman convergence/properness/reconciliation;
- Craft A/C regressions.

---

# Required Completion Report

When implementation is complete, report:

1. commit SHA;
2. files changed;
3. `npm run build` result;
4. exact final-state constraint schema added;
5. service/UI semantics for “extra affixes allowed” vs “no unwanted affixes”;
6. whether target constraints are included in canonical target/state identity where required;
7. new external Alteration fixture values;
8. engine analytical two-mod Alteration probability;
9. seeded MC two-mod Alteration probability;
10. external CI comparison/status;
11. new raw Harvest fixture values;
12. exact Harvest parity starting state used;
13. engine analytical raw Harvest both-mod probability;
14. seeded MC raw Harvest both-mod probability;
15. Harvest raw parity status;
16. clean-finished Harvest policy result and whether Annul/recovery appears;
17. recommendation status model (`PROVISIONAL` / acquisition-safe / proven semantics);
18. two-mod `Any` live-equivalent selected acquisition;
19. clean-base feasible upper bound;
20. best unresolved acquisition lower bound;
21. acquisition-safe yes/no;
22. expected cost;
23. runtime and state count;
24. minimum feasible rarity derived for the two-mod target;
25. evidence that rare/Regal expansion did not starve the clean magic family;
26. `DEEPEN` progress deltas;
27. whether persistent graph extension was implemented or deferred and why;
28. one-mod T1 ES regression;
29. rare two-mod regression;
30. Craft A regression;
31. Craft C regression;
32. Harvest confidence label;
33. remaining blockers before broader UI polish/productization.

---

# Bottom Line

The new Craft of Exile data makes the next step clearer, not broader.

The engine already has the mechanics needed to model the core two-mod comparison.

The problem is now primarily:

```text
correct target completion semantics
+
fair acquisition feasibility
+
proof-honest recommendation language
+
search frontier efficiency
```

The most important external anchor is now:

```text
T1 ES + T1 Int via Alteration
18 / 85,471
~1 / 4,748
```

That benchmark should help validate the clean rolling family without becoming an input to the optimizer.

The Harvest observation:

```text
38 / 23,137
~1 / 609 raw presence
```

is also useful, but it must remain explicitly separated from finished-craft cleanup economics.
