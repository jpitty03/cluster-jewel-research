# Current Crafting Optimizer Output Review and Next Steps

## Scope

This document reviews the current `output.txt` produced by:

```text
node crafting-engine/scripts/optimizeCraftDemo.ts > output.txt
```

The current output is a major improvement over earlier iterations because the analytical expected-cost model and Monte Carlo execution now agree closely on the **total** expected cost of Reference Craft A. However, there are still important correctness and optimization issues before the result should be treated as the final globally optimal crafting strategy.

The most important new requirements are:

1. **T1 Intelligence is acceptable at any value from +6 to +8.**
   - Do not optimize specifically for +8.
   - Do not add any Divine Orb finishing step.
   - Do not give a purchased +8 base a special value advantage over a purchased/self-fractured +6/+7/+8 T1 Intelligence base.

2. **Do not assume Harvest stops as soon as T1 ES appears.**
   - A valid competing strategy is to continue Harvest Reforge Defence until the state contains both T1 ES and 35% Effect, or another high-value combination.
   - The optimizer must compare this against stopping at T1 ES and switching to Annul/Exalt/Allflame.

3. **Do not add unit tests as part of this work.**
   - Validate using the existing end-to-end optimizer script, diagnostic reports, targeted probability reports, Monte Carlo cross-validation, and trace analysis.

---

# What the Current Output Gets Right

## 1. Analytical and Monte Carlo total-cost agreement is now excellent

The current output reports approximately:

```text
Analytical total:   2921.9c / 14.61 div
Monte Carlo mean:   2918.2c / 14.59 div
Difference:         0.13%
```

It also reports no missing policy states and no fallback actions.

This is strong evidence that the analytical model and Monte Carlo simulator are finally evaluating the same policy and that the expected-cost recurrence/recovery accounting is internally consistent for that policy.

This should be described as:

```text
POLICY COST MODEL VALIDATED
```

rather than implying that the global crafting optimum or every PoE mechanic has been fully validated.

Recommended status wording:

```text
POLICY COST MODEL: VALIDATED
Analytical vs Monte Carlo difference: 0.13%

GAME-MECHANICS FIDELITY: PARTIAL
GLOBAL OPTIMALITY: NOT YET PROVEN
```

---

## 2. Harvest incidental successes are now visible

The Harvest success census is useful and confirms that Harvest Reforge Defence can provide valuable downstream target mods while trying to obtain T1 ES.

The current output reports, conditional on T1 ES being present:

```text
+35% Effect:                 ~1.86%
+4 All Attributes:           ~1.66%
3% Attack Speed:             ~1.32%
+4% All Resistance:          ~1.63%
+35% + premium suffix:       ~0.07%
junk-only extras:           ~93.45%
```

These outcomes prove that Harvest should not be treated as a one-purpose action whose only meaningful result is T1 ES.

Every Harvest outcome should be valued as a complete ItemState.

---

## 3. Recovery-loop accounting is much more realistic

The total action counts now show approximately:

```text
Harvest Attempts:    ~398
Annulment Orbs:      ~73.5
Exalted Orbs:        ~30.5
```

Monte Carlo produces nearly identical counts.

This demonstrates that the engine is now accounting for destructive recovery loops rather than simply using:

```text
14 Harvests = craft complete with ES
```

The craft can repeatedly lose T1 ES or other target mods during later recovery and return to earlier states.

That is an important improvement.

---

# Finding 1 — The output still incorrectly optimizes specifically for +8 Intelligence

The latest requirement is:

```text
T1 Intelligence = acceptable if the modifier is +6, +7, or +8.
```

There is no requirement to Divine the modifier to +8.

However, the current output still says things such as:

```text
Buy fractured T1 Intelligence (+8 roll)
```

and recommends it because:

```text
saving 2.0 Divines / 400c downstream finishing
```

It also includes:

```text
STEP 6 -- Finish Intelligence Numeric Roll
Action: No Action Required (Already +8)
```

This entire distinction is now invalid for this target.

## Required change

The target should be satisfied by:

```text
AfflictionJewelSmallPassivesGrantInt
Tier 1
numeric value: any valid T1 roll (+6 to +8)
```

There should be no `finalRollRequirements` entry for +8.

The report should instead show:

```text
STEP 1 -- Acquire fractured T1 Intelligence (+6 to +8)
```

and the craft should end once all four target modifier groups are present.

Remove Step 6 entirely.

## Impact on route comparison

The current conclusion that buying an 8-div +8 Intelligence base beats self-fracturing because it avoids 400c of Divine finishing is no longer valid.

The route comparison must be recalculated without any +8 premium.

This may change the preferred starting route.

---

# Finding 2 — The 398 Harvests must not be interpreted only as rebuilds

The current output gives two seemingly different Harvest numbers:

```text
14 Harvests
```

and:

```text
~398 Harvests
```

These represent different concepts:

```text
14 Harvests
= expected attempts to observe T1 ES once from a fresh relevant state

~398 Harvests
= expected total Harvest actions consumed across the complete policy,
  including every revisit to Harvest states during recovery loops
```

However, the optimizer must not conclude that the additional Harvests should only come from rebuilding lost T1 ES.

A potentially superior strategy is to deliberately remain in Harvest longer.

---

# Finding 3 — Explicitly compare deeper-Harvest strategies

The optimizer must compare at least the following policy families instead of assuming a fixed transition after T1 ES is first observed.

## Strategy A — Stop Harvest when T1 ES appears

```text
Start: fractured T1 Int (+6 to +8)

Harvest Reforge Defence until T1 ES
    ↓
Evaluate resulting state
    ↓
Clean junk as appropriate
    ↓
Allflame/Exalt 35% Effect
    ↓
Allflame/Exalt premium suffix
```

This resembles the currently reported human-readable plan.

---

## Strategy B — Harvest until T1 ES + 35% Effect

```text
Start: fractured T1 Int (+6 to +8)

Harvest Reforge Defence repeatedly
    ↓
Do NOT stop merely because T1 ES appeared
    ↓
Continue until state contains:
    T1 ES
    + 35% Effect
    + fractured T1 Int
    ↓
Clean other modifiers if continuation value justifies it
    ↓
Use Exalt/Allflame only for the premium final suffix
```

This strategy may consume many more Harvest crafts but could reduce the extremely expensive Exalt/Annul recovery loops used to acquire 35% Effect.

Harvest costs only:

```text
75 Red Lifeforce = 1.5625c per craft
```

so a large number of additional Harvests can still be cheaper than repeated downstream failures.

This route must be evaluated mathematically rather than ruled out because its raw Harvest count is high.

---

## Strategy C — State-aware Harvest stopping policy

This is the preferred architecture.

The solver should not operate using a rigid phase rule like:

```text
T1 ES found -> Harvest stage is over
```

Instead, each actual resulting state should be evaluated independently.

Examples:

```text
Fractured Int + T1 ES + junk
  -> compare:
       Annul now
       Harvest again
       another legal action

Fractured Int + T1 ES + 35% Effect
  -> likely preserve state and leave Harvest

Fractured Int + T1 ES + premium suffix
  -> compare preserving suffix and pursuing 35%
     against rerolling the entire non-fractured state

Fractured Int + T1 ES + 35% Effect + premium suffix
  -> finished target

Fractured Int + T1 ES + valuable but non-target combination
  -> continuation value decides whether to keep, sell, or reroll
```

The core decision is:

```text
V(current state)
=
min / max over all legal actions of expected continuation value
```

Harvest is simply one legal action among those choices.

Do not hard-code a Harvest phase exit condition.

---

# Finding 4 — The stepwise report still misattributes end-to-end cost

The current output reports individual analytical steps such as:

```text
Step 2 Harvest:       21.9c
Step 3 Cleanup:       34.3c
Step 4 35% Effect:   338.0c
Step 5 Final Suffix: 927.7c
```

but Monte Carlo attributes the actual end-to-end policy cost very differently:

```text
Step 2 Harvest:      ~621c
Step 3 Cleanup:      ~128c
Step 4 35% Effect:   ~533c
Step 5 Final Suffix:  ~36c
```

The total cost agrees because the same recovery work is being allocated to different conceptual phases.

For a user-facing crafting guide, this is confusing.

## Required reporting change

Separate:

```text
INITIAL ACQUISITION COST
```

from:

```text
TOTAL END-TO-END CONTRIBUTION
```

Example:

```text
STEP 2 -- Establish T1 ES / Harvest Policy

Initial T1 ES acquisition:
  Chance per Harvest:          7.1429%
  Expected attempts:           14.00
  Initial raw cost:            21.9c

Additional Harvests caused by continuation/recovery policy:
  Expected attempts:           XXX.XX
  Expected cost:               XXX.Xc

TOTAL HARVEST USAGE ACROSS FINISHED CRAFT:
  Expected Harvests:           XXX.XX
  Expected total Harvest cost: XXX.Xc
```

Apply the same distinction to Annuls and Exalts.

The final report should still provide a simple craft sequence, but it must not imply that the first-pass `21.9c` Harvest cost is the whole expected Harvest contribution to a finished item.

---

# Finding 5 — The self-fracture preparation math still needs mechanical validation

The current output estimates preparation through values such as:

```text
T1 Int:
~23.3 Alterations based on 300 / 7000 magic weight

35% Effect:
~65 Alterations based on 300 / 5800 magic weight
```

Before using these acquisition routes as decisive evidence, verify that Alteration crafting is modeled according to the actual magic-item generation rules.

A simple:

```text
total weight / target weight
```

may not be sufficient because an Orb of Alteration rerolls a complete magic item and may produce prefix/suffix combinations rather than exactly one isolated weighted modifier roll.

Do not discard the self-fracture route. Instead, label the preparation cost:

```text
SELF-FRACTURE ACQUISITION MODEL: APPROXIMATE
```

until the preparation process is represented correctly.

No unit tests are required for this validation. Use targeted diagnostic scripts and Monte Carlo comparison of the preparation sub-plan if needed.

---

# Finding 6 — Monte Carlo timeout handling should be tightened

The current run completed roughly:

```text
1991 / 2000 trials
```

with nine timeouts.

The distribution has a significant expensive tail:

```text
P50: ~12.48 div
P75: ~17.22 div
P90: ~23.55 div
P95: ~28.26 div
```

Timed-out trials are likely disproportionately expensive.

Excluding them from the mean can create a small downward bias.

Preferred approach:

```text
Run until N completed trials are collected.
Track timeout/restart count separately.
```

For example:

```text
Completed trials requested: 2000
Completed trials obtained:  2000
Additional timed-out runs:      9
```

Then calculate percentiles from the completed set.

---

# Recommended Next Implementation Pass

Do not work on Reference Craft B yet.

Focus only on Reference Craft A until the following questions are answered.

## Priority 1 — Remove +8-specific target logic

Change the target to T1 Intelligence at any roll from +6 to +8.

Remove:

```text
+8-specific purchase advantage
Divine finishing cost
Step 6
```

Re-run all starting-route comparisons.

---

## Priority 2 — Expose Harvest as a continued legal action after T1 ES

From any state where Harvest Reforge Defence is mechanically legal, allow it to compete against:

```text
Annul
Exalt / Allflame Exalt
restart / rebuild
sell, if applicable
```

Do not force:

```text
T1 ES -> stop Harvesting
```

---

## Priority 3 — Compare Harvest stopping policies

The diagnostic output should explicitly compare:

```text
A. Stop Harvest at first T1 ES
B. Continue until T1 ES + 35% Effect
C. State-aware optimal stopping policy
```

For each, show:

```text
Expected Harvest count
Expected Annul count
Expected Exalt count
Expected total cost
Expected sale value
Expected profit
Expected ROI
```

This comparison should make it obvious whether deeper Harvesting is actually cheaper.

---

## Priority 4 — Print policy decisions for representative states

Add a diagnostic section like:

```text
HARVEST CONTINUATION POLICY

State: Fractured Int + T1 ES
  Harvest again EV:      XXXXc
  Annul/cleanup EV:      XXXXc
  Exalt 35% EV:          XXXXc
  Recommended:           XXXXX

State: Fractured Int + T1 ES + junk suffix
  Harvest again EV:      XXXXc
  Annul EV:              XXXXc
  Recommended:           XXXXX

State: Fractured Int + T1 ES + 35% Effect
  Harvest again EV:      XXXXc
  Exalt premium suffix:  XXXXc
  Recommended:           XXXXX

State: Fractured Int + T1 ES + premium suffix
  Harvest again EV:      XXXXc
  pursue 35% EV:         XXXXc
  Recommended:           XXXXX
```

This provides a direct audit trail showing that the solver is discovering the stopping rule rather than following a fixed recipe.

---

## Priority 5 — Re-run analytical vs Monte Carlo validation

The new state-aware policy must again satisfy:

```text
Missing policy states: 0
Fallback actions:      0
```

and analytical versus Monte Carlo expected total cost should remain within:

```text
<= 5% required
<= 2% preferred
```

The current ~0.13% agreement is excellent and should be preserved if possible.

---

# Desired Next Output Format

The next `output.txt` should make the discovered policy obvious.

Example:

```text
======================================================================
REFERENCE CRAFT A -- OPTIMIZED POLICY
======================================================================

TARGET:
  T1 ES
  35% Effect
  T1 Intelligence (+6 to +8; any T1 numeric roll accepted)
  one premium suffix

STEP 1 -- Acquire fractured T1 Intelligence

Buy fractured T1 Int:
  Expected cost: X.XX div

Self-fracture T1 Int:
  Expected cost: X.XX div
  Acquisition model status: APPROXIMATE / VALIDATED

Recommended:
  XXXXX

----------------------------------------------------------------------
HARVEST STOPPING POLICY COMPARISON
----------------------------------------------------------------------

A. Stop at first T1 ES
   Expected Harvests: XXX
   Expected total craft cost: XX.XX div

B. Continue to T1 ES + 35% Effect
   Expected Harvests: XXX
   Expected total craft cost: XX.XX div

C. State-aware policy
   Expected Harvests: XXX
   Expected total craft cost: XX.XX div

Recommended:
   State-aware policy

Representative decisions:
  T1 ES only                 -> HARVEST / CLEAN / EXALT
  T1 ES + junk              -> HARVEST / ANNUL
  T1 ES + 35%               -> PRESERVE; pursue suffix
  T1 ES + premium suffix    -> PRESERVE / HARVEST / pursue effect
  T1 ES + 35% + premium     -> FINISHED

----------------------------------------------------------------------
EXPECTED TOTAL CRAFT COST
  XX.XX div

EXPECTED SALE VALUE
  XX.XX div

EXPECTED PROFIT
  XX.XX div

P50 / P75 / P90 / P95 COST
  ...

POLICY COST VALIDATION
  Analytical: XX.XX div
  Monte Carlo: XX.XX div
  Difference: X.XX%
======================================================================
```

---

# Phase Gate

Do not move on to the three-notable Cold cluster until all of the following are true:

```text
[ ] T1 Int target accepts +6 to +8 with no Divine finishing
[ ] +8-specific purchased-base advantage is removed
[ ] Harvest remains a candidate action after T1 ES
[ ] Stop-at-ES strategy is explicitly compared to deeper Harvesting
[ ] State-aware Harvest stopping policy is evaluated
[ ] Representative state decisions are printed for auditability
[ ] Stepwise cost attribution distinguishes first acquisition from full-craft contribution
[ ] Self-fracture preparation is clearly labeled approximate until mechanically validated
[ ] Monte Carlo has zero fallback actions
[ ] Analytical vs Monte Carlo total cost remains within tolerance
```

No unit tests are requested for this phase.

---

# Bottom Line

The current optimizer has reached an important milestone: **the analytical expected-cost engine and Monte Carlo simulation now agree on the cost of the same policy.**

The next problem is not primarily numerical reconciliation. It is **policy completeness**.

The optimizer must now prove whether the current human-readable sequence:

```text
Harvest until T1 ES
-> clean
-> Exalt 35%
-> Exalt premium suffix
```

is actually superior to strategies that continue cheap Harvest reforges deeper into the craft.

At the same time, the target must be corrected so that **any T1 Intelligence roll from +6 to +8 is accepted**, with no Divine finishing requirement and no special +8 purchase premium.

Only after those two changes are evaluated should Reference Craft A be treated as globally optimized.