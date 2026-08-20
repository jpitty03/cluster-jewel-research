# Crafting Optimizer — Post-Commit Validation Findings

## Context

This document records findings from the latest Reference Craft A/B run after commit:

```text
96f28fab9e3faa8b0e30bb24f7800735c5327401
feat: implement crafting optimizer core with Monte Carlo validation and cost analysis engine
```

The latest run is a meaningful improvement over the previous iteration. Reporting is clearer, route selection is internally consistent, route-specific Divine finishing is handled correctly for a purchased +8 Intelligence fracture, the self-fracture comparison is more realistic, and Craft B is now correctly labeled as not globally optimized.

However, Reference Craft A is still **not mathematically validated** because the analytical solver and Monte Carlo simulator disagree by approximately **43%** on expected total cost.

The immediate goal is **not to add more crafting methods**. The next work should focus only on reconciling the analytical and Monte Carlo models for Reference Craft A.

> **Do not add unit tests for this work.**
>
> Use diagnostic scripts, end-to-end reference runs, hand-checked probability calculations, Monte Carlo cross-validation, and regression/reference scripts instead.

---

# Latest Reference Craft A Result

Current recommended route:

```text
Buy Fractured T1 Intelligence Base (+8 roll)
```

Current reported analytical cost:

```text
2921.9c
≈ 14.61 div
```

Current Monte Carlo mean:

```text
1665.3c
≈ 8.33 div
```

Difference:

```text
≈ 43%
```

Therefore:

```text
STATUS: APPROXIMATE / INVESTIGATION REQUIRED
```

This status is correct and must remain until analytical and simulation results converge.

---

# What Improved in This Iteration

## 1. Step 1 route selection is now internally consistent

The previous run recommended buying the fractured Intelligence base in the detailed Step 1 section but then switched to self-fracturing in the final summary.

The latest run consistently recommends:

```text
Buy Fractured T1 Intelligence Base (+8 Roll)
Cost: 1600c / 8 div
```

This is correct given the current modeled downstream costs.

---

## 2. Self-fracture preparation now has a sub-plan cost

Latest modeled values:

```text
Self-fracture T1 Intelligence
  Clean base:              10.00c / attempt
  Preparation sub-plan:    10.16c / attempt
  Fracturing Orb:         359.00c / attempt
  Success probability:     25.00%
  Expected attempts:        4.00
  Expected acquisition:  1516.6c / 7.58 div

Self-fracture 35% Effect
  Clean base:              10.00c / attempt
  Preparation sub-plan:    18.50c / attempt
  Fracturing Orb:         359.00c / attempt
  Success probability:     25.00%
  Expected attempts:        4.00
  Expected acquisition:  1550.0c / 7.75 div
```

This is much better than a placeholder preparation estimate.

### Required follow-up

The report should expose the actual preparation recipe instead of only:

```text
Alt/Regal/Bench = 10.16c
```

The optimizer should eventually report something like:

```text
SELF-FRACTURE PREPARATION SUB-PLAN

1. Alteration until T1 Intelligence
   Chance per Alteration: X.XX%
   Expected Alterations: X.XX
   Expected cost: X.XXc

2. Augmentation if required
   Expected usage: X.XX
   Expected cost: X.XXc

3. Regal Orb
   Expected usage: X.XX
   Expected cost: X.XXc

4. Bench-craft filler modifier
   Cost: X.XXc

Expected preparation cost per fracture attempt:
   10.16c
```

The preparation total should remain auditable rather than appearing as an unexplained constant.

---

## 3. Purchased +8 Intelligence correctly avoids Divine finishing

The current chosen purchased fractured base explicitly has a +8 roll.

The latest output correctly reports:

```text
Step 6 — Divine Intelligence
No Action Required
Expected Divine cost: 0c
```

This resolves the previous mistake where every T1 Intelligence route automatically incurred three Divines.

### Route-specific rule

Keep the following distinction:

```text
Purchased fractured +8 Int:
  Expected finishing Divines = 0

Self-fractured T1 Int with unknown +6/+7/+8 roll:
  expected finishing Divine cost must be calculated from roll distribution
```

Do not apply one Divine expectation globally to every strategy.

---

## 4. Step 5 probability reporting is clearer

Latest normal Exalt suffix probabilities:

```text
+4 All Attributes:  2.0761%  (300 weight)
3% Attack Speed:    1.7301%  (250 weight)
+4% All Res:        2.0761%  (300 weight)
Other:             94.1176%
```

Latest Allflame best-of-four per-attempt outcomes:

```text
Attributes:          8.05%
Attack Speed:        6.33%
All Res:             7.16%
No accepted result: 78.47%
```

And the report now correctly distinguishes the final distribution as:

```text
Conditional on eventual accepted success
```

with approximately:

```text
Attributes:   37.38%
Attack Speed: 29.39%
All Res:      33.23%
```

That distinction should remain.

---

## 5. Craft B is now correctly labeled as incomplete

Reference Craft B now reports:

```text
STATUS: NOT YET OPTIMIZED
```

with the explanation that the current Exalt path is only the best route among currently implemented actions and is not a global optimum.

This is correct.

Do not expand Craft B yet.

Wait until Reference Craft A is validated, then implement missing generic actions such as:

```text
Alteration
Augmentation
Regal
Scour / restart flow
```

Only after those exist should Craft B be evaluated for profitability.

---

# Main Remaining Blocker — Analytical vs Monte Carlo Mismatch

Latest comparison:

```text
                      Analytical      Monte Carlo
--------------------------------------------------
Primal Lifeforce         1050.0          1531.2
Annulment Orbs             14.26            3.52
Exalted Orbs               14.45            1.46
Divine Orbs                 0.00            0.00

Total cost              2921.9c         1665.3c
Difference                                 ~43%
```

This is not a validation success.

A 100% simulation completion rate only proves that the simulation terminates.

It does **not** prove that it executes the same policy or cost model as the analytical solver.

The next phase must determine exactly why the simulator crafts the target with dramatically fewer Exalted Orbs and Annulments while consuming more Harvest Lifeforce.

---

# Key Diagnostic Clue — Monte Carlo Uses Very Few Exalts

The analytical plan expects approximately:

```text
Step 4 Allflame Exalts: ~9.80 attempts
Step 5 Allflame Exalts: ~4.64 attempts
Total:                  ~14.44 attempts
```

Monte Carlo reports only:

```text
~1.46 Exalted Orbs per completed craft
```

That is too large a difference to be sampling noise.

It strongly suggests that the simulator and analytical solver are not valuing or traversing the same intermediate states.

A likely cause is **useful incidental modifiers produced by Harvest Reforge Defence**.

---

# Finding — Harvest Success Must Be Evaluated as Real Item States

The current analytical reporting describes successful Harvest outcomes approximately as:

```text
T1 ES + 0 junk mods
T1 ES + 1 junk mod
T1 ES + 2 junk mods
```

This abstraction is not sufficient for an optimizer.

An extra mod is not necessarily junk.

Examples:

```text
Outcome A
  fractured +8 Int
  T1 ES
  junk

Outcome B
  fractured +8 Int
  T1 ES
  35% Effect

Outcome C
  fractured +8 Int
  T1 ES
  +4 All Attributes

Outcome D
  fractured +8 Int
  T1 ES
  35% Effect
  +4 All Attributes
```

These states have completely different continuation costs.

The solver must preserve and value B/C/D rather than treating every additional modifier as cleanup material.

---

# Why This May Explain the Cost Gap

Monte Carlo consumes more Harvest currency:

```text
1531.2 / 75
≈ 20.42 Harvest crafts
```

versus the analytical model's:

```text
1050 / 75
= 14 Harvest crafts
```

At the same time Monte Carlo uses dramatically fewer:

```text
Exalts
Annuls
```

This suggests a possible actual policy closer to:

```text
Harvest more often
  ↓
keep valuable incidental Harvest outcomes
  ↓
need fewer later Exalts / Annuls
```

while the analytical model may still effectively behave like:

```text
Harvest only for T1 ES
  ↓
clean anything else
  ↓
Allflame Exalt 35%
  ↓
Allflame Exalt premium suffix
```

If true, those are different crafting policies and cannot be expected to match.

---

# Required Next Diagnostic — Harvest State Census

Add a diagnostic mode to the existing end-to-end / Monte Carlo tooling.

Do not create unit tests.

For every Harvest Reforge Defence that results in T1 ES, classify the complete resulting state.

Track at minimum:

```text
T1 ES only
T1 ES + junk
T1 ES + multiple junk
T1 ES + 35% Effect
T1 ES + +4 Attributes
T1 ES + Attack Speed
T1 ES + All Res
T1 ES + 35% Effect + premium suffix
other strategically useful target combinations
```

Print:

```text
HARVEST SUCCESS STATE CENSUS

Total Harvests:                  N
T1 ES successes:                 N

Of T1 ES successes:
  T1 ES only:                   XX.XX%
  +35% Effect:                  XX.XX%
  +Attributes:                  XX.XX%
  +Attack Speed:                XX.XX%
  +All Res:                     XX.XX%
  already complete/near-complete: XX.XX%
  junk-only extras:             XX.XX%
```

This will prove or disprove whether incidental Harvest target mods explain the low Monte Carlo Exalt count.

---

# Required Change — Remove the Generic `Junk Count` Decision Model

Do not let continuation logic operate only on:

```text
0 junk
1 junk
2 junk
```

Instead, each actual Harvest result should become a canonical `ItemState` and be sent back to the same state-value solver.

Example:

```text
Harvest outcome
  ↓
canonical ItemState
  ↓
V(state)
  ↓
solver chooses:
    keep and continue
    Annul
    Harvest again
    Exalt
    sell
    restart
```

This is a core requirement of the state-graph architecture.

---

# Required Change — Analytical and Monte Carlo Must Execute the Same Policy

The analytical solver should return something equivalent to:

```text
policy[stateKey] = bestAction
```

Monte Carlo must execute this policy.

It should not contain an independently coded crafting recipe.

For a sampled state:

```text
stateKey = canonicalize(state)
action = policy[stateKey]
outcome = random sample(action.outcomes(state))
state = outcome.state
```

If Monte Carlo encounters a state for which the analytical policy has no action, report it explicitly.

Do not silently choose a fallback crafting action.

Diagnostic output should include:

```text
Unhandled policy states: N
Fallback actions used: 0
```

The target is always:

```text
Fallback actions used: 0
```

---

# Required Change — Compare Cost by Step, Not Just Currency

Currency totals help, but they are not enough to locate the discrepancy.

The next report should include:

```text
                         Analytical      Monte Carlo      Difference
-------------------------------------------------------------------
Step 1 acquisition         1600.0c         1600.0c           0.0c
Step 2 Harvest               21.9c           XX.Xc          XX.Xc
Step 3 cleanup               34.3c           XX.Xc          XX.Xc
Step 4 35% Effect           338.0c           XX.Xc          XX.Xc
Step 5 premium suffix       927.7c           XX.Xc          XX.Xc
Step 6 Divine                 0.0c            0.0c           0.0c
-------------------------------------------------------------------
TOTAL                       2921.9c         1665.3c       -1256.6c
```

This will identify exactly where the models diverge.

---

# Required Change — Trace a Small Number of Full Monte Carlo Crafts

Add an optional trace mode, for example:

```text
--trace-trials 5
```

Print five complete successful crafts.

Example:

```text
TRIAL 1

Start:
  fractured +8 Int

Harvest #1:
  result = ...
  solver action = Harvest again

Harvest #2:
  result = T1 ES + 35% Effect
  solver action = keep

Allflame Exalt #1:
  four outcomes = [...]
  selected = +4 Attributes

Complete.

Total cost: XXXc
```

This should make it immediately obvious why Monte Carlo averages only ~1.46 Exalts.

---

# Allflame Failure Handling Still Needs Validation

The reported Step 4 and Step 5 analytical recovery costs are large:

```text
Step 4 recovery: ~326.3c
Step 5 recovery: ~922.1c
```

These values should not be based on a generic failed-slam formula.

For each Allflame use, four actual resulting item states exist.

Even when none contain the direct target, the player can choose the result with the best continuation value.

Therefore:

```text
Allflame failure
```

must not mean:

```text
four misses → take generic junk → Annul
```

It must mean:

```text
four non-terminal states
  ↓
calculate V(state1)
calculate V(state2)
calculate V(state3)
calculate V(state4)
  ↓
choose minimum expected continuation cost
```

This may reduce analytical recovery costs substantially.

---

# Step 5 All Resistance Decision

Current report concludes:

```text
SELL All Resistance result for 7 div
```

because the modeled continuation value is lower than the guaranteed sale value.

That is a valid kind of solver decision.

However, the report should expose enough math to audit it:

```text
SELL VALUE
  1400c

RETRY VALUE
  expected value after Annul/recovery: XXXXc
  expected cost to recover: XXXc
  net continuation value: 820c

Difference:
  SELL better by 580c
```

Do not leave continuation EV as an unexplained single number.

---

# Validation Acceptance Criteria

Do not mark Reference Craft A as validated until all of the following are true:

```text
[ ] Analytical and Monte Carlo execute the same policy
[ ] Monte Carlo fallback actions = 0
[ ] Harvest outcomes are evaluated as complete ItemStates
[ ] Useful incidental Harvest mods are preserved when optimal
[ ] Allflame chooses among four complete states by continuation value
[ ] Self-fracture preparation costs are auditable step-by-step
[ ] Step-by-step analytical and Monte Carlo costs are printed
[ ] Action counts are printed for both models
[ ] Total expected cost difference <= 5%
```

Preferred target:

```text
<= 2% difference
```

If difference is greater than 5%:

```text
STATUS: INVESTIGATION REQUIRED
```

If difference is <= 5% but > 2%:

```text
STATUS: PROVISIONALLY VALIDATED
```

If difference is <= 2% and the policy/state traces are mechanically correct:

```text
STATUS: VALIDATED
```

---

# Immediate Work Order

Use this order for the next iteration.

```text
1. Do not work on Craft B.

2. Add Harvest success-state census.

3. Add full Monte Carlo trace mode for a few trials.

4. Determine why Monte Carlo averages ~1.46 Exalts.

5. Replace junk-count Harvest handling with actual ItemState continuation values.

6. Ensure analytical solver emits a state -> action policy.

7. Make Monte Carlo consume exactly that policy.

8. Remove any Monte Carlo fallback crafting recipe.

9. Evaluate Allflame failures using best continuation state.

10. Print analytical vs Monte Carlo costs per crafting step.

11. Re-run Reference Craft A.

12. Continue until cost difference <= 5%, preferably <= 2%.
```

Do not add unit tests during this work unless explicitly requested later.

---

# Expected Next Report

The next useful output should look approximately like:

```text
REFERENCE CRAFT A VALIDATION

Analytical Expected Cost:  XXXX.Xc / XX.XX div
Monte Carlo Mean:          XXXX.Xc / XX.XX div
Difference:                X.XX%
Status:                    VALIDATED / INVESTIGATION REQUIRED

POLICY CONSISTENCY
  Monte Carlo policy states resolved: XXXX
  Missing policy states:                 0
  Fallback actions used:                  0

HARVEST SUCCESS STATE CENSUS
  T1 ES only:                   XX.XX%
  T1 ES + 35% Effect:          XX.XX%
  T1 ES + premium suffix:      XX.XX%
  T1 ES + 35% + premium:       XX.XX%
  junk-only extras:            XX.XX%

STEPWISE COST COMPARISON
                         Analytical     Monte Carlo     Difference
  Acquisition              XXXX.Xc        XXXX.Xc         XX.Xc
  Harvest                    XXX.Xc         XXX.Xc         XX.Xc
  Cleanup                    XXX.Xc         XXX.Xc         XX.Xc
  35% Effect                 XXX.Xc         XXX.Xc         XX.Xc
  Final suffix               XXX.Xc         XXX.Xc         XX.Xc
  Divine                     XXX.Xc         XXX.Xc         XX.Xc

ACTION COUNTS
                         Analytical     Monte Carlo
  Harvest                     XX.XX          XX.XX
  Annul                       XX.XX          XX.XX
  Exalt                       XX.XX          XX.XX
  Divine                      XX.XX          XX.XX

TOTAL DIFFERENCE
  X.XX%
```

That output will tell us whether the engine is finally evaluating the same stochastic crafting process in both analytical and simulation modes.
