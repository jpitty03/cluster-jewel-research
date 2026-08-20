# Latest Crafting Optimizer Validation Findings

## Purpose

This document captures the findings from the latest end-to-end crafting optimizer run after the reporting improvements were added.

The latest output is substantially better organized and much easier to inspect, but the optimizer is **still not mathematically validated**. Several inconsistencies remain between the analytical model, the Monte Carlo model, route selection, and route-specific finishing costs.

The goal of the next implementation pass is to fix these issues before adding more crafting mechanics.

> **Important development constraint:** Do **not** create or expand unit tests for this work. Validation should use diagnostic scripts, end-to-end reference craft runs, hand-checked probability calculations, targeted regression/reference scripts, and Monte Carlo cross-validation. Do not let existing unrelated unit-test failures expand the scope unless explicitly requested.

---

# Latest Reference Craft A Result

The latest optimizer reported:

```text
Reference Craft A — 12-Passive Shield Cluster

Expected Total Craft Cost:
  3565.1c / ~17.83 div

Expected Sale Value:
  9551.4c / ~47.76 div

Expected Profit:
  5986.3c / ~29.93 div

Expected ROI:
  167.91%
```

It also reported these starting-route totals:

```text
Self-Fracture T1 Intelligence:      17.83 div
Buy Fractured T1 Intelligence:      17.95 div
Self-Fracture 35% Effect:           18.03 div
Buy Fractured 35% Effect:           22.95 div
```

These numbers are still **approximate and not validated**.

---

# Finding 1 — Step 1 Recommendation Is Internally Inconsistent

The detailed Step 1 section says:

```text
Recommended Step 1:
  Buy fractured T1 Intelligence
```

with the reason:

```text
Zero preparation variance and fixed 8.00 div acquisition cost.
```

However, the final recommended crafting plan changes the recommendation to:

```text
Self-Fracture T1 Intelligence
Expected cost: 1576c / 7.88 div
```

This is inconsistent.

The report must have one authoritative route selected by the optimizer.

If the optimizer chooses self-fracture because its expected cost is lower, Step 1 should say so.

If it chooses buying because preparation variance or risk is part of the objective, that risk adjustment must be represented mathematically in the optimization objective rather than added as a narrative override.

## Required fix

The selected starting strategy must be determined once and used consistently by:

- Step 1 recommendation;
- cumulative cost calculations;
- final recommended plan;
- Monte Carlo simulation;
- alternate-route comparison.

Do not allow the reporting layer to override the solver's recommendation.

---

# Finding 2 — Self-Fracture Preparation Cost Is Still an Assumption

The current report uses:

```text
T1 Intelligence fracture preparation: 25c per attempt
35% Effect fracture preparation:       35c per attempt
```

These numbers produce:

```text
Self-Fracture T1 Int:
  (10c base + 25c prep + 359c fracture) × 4
  = 1576c / 7.88 div

Self-Fracture 35% Effect:
  (10c base + 35c prep + 359c fracture) × 4
  = 1616c / 8.08 div
```

The problem is that the 25c and 35c preparation costs are not yet derived from an actual crafting path.

This matters because the self-fracture T1 Int route only beats buying the fractured Int base by:

```text
1600c - 1576c = 24c
```

That is an extremely small margin.

A preparation estimate that is wrong by only 6c per attempt changes the expected four-attempt cost by 24c and can flip the recommendation.

## Required fix

Self-fracture preparation must be modeled as a real sub-plan.

For example:

```text
Acquire clean base
→ create T1 Intelligence candidate
→ fill to exactly four fracture-eligible explicit modifiers
→ fracture
→ on failure, calculate whether the failed item is reusable or lost
→ repeat
```

The engine must calculate:

```text
Expected preparation cost per fracture attempt
Expected number of bases consumed
Expected number of crafting currencies consumed
Expected Fracturing Orbs consumed
Expected total self-fracture acquisition cost
```

Do not use arbitrary preparation constants in the final optimizer result.

Until this is implemented, report:

```text
Self-fracture acquisition cost: APPROXIMATE
```

---

# Finding 3 — Harvest Numbers Need Provenance

The current Step 2 reports:

```text
T1 ES probability per Reforge Defence: 7.1429%
Expected attempts:                     14.00

Successful-state distribution:
  clean T1 ES:       20%
  T1 ES + 1 junk:    50%
  T1 ES + 2 junk:    30%
```

These values are very clean and may be assumptions rather than results produced from the full Harvest generation model.

The optimizer must be able to explain exactly where each number came from.

## Required verification

For the 7.1429% T1 ES probability, report:

```text
Eligible Defence-tagged modifiers
Weight of each eligible Defence modifier
Total eligible Defence weight
T1 ES weight
Formula used to calculate target probability
```

For the 20/50/30 junk-state distribution, report whether it comes from:

```text
exact PoE affix-count rules
or
Monte Carlo approximation
or
manual assumption
```

If approximate, the report must say so.

The Step 3 cleanup cost depends directly on this distribution, so an incorrect Harvest distribution affects all downstream costs.

---

# Finding 4 — Analytical and Monte Carlo Results Disagree by Too Much

The analytical model reports:

```text
Expected total cost:
  3565.1c / 17.83 div
```

The Monte Carlo simulation reports:

```text
Completed trials: 1987 / 2000
Completion rate: 99.4%

Empirical mean total cost:
  1733.1c / 8.67 div
```

This is a very large discrepancy.

Difference:

```text
3565.1c - 1733.1c
= 1832.0c
= 9.16 div
```

Relative discrepancy versus analytical result:

```text
1832 / 3565.1
≈ 51.4%
```

The Monte Carlo run should therefore **not** be labeled successful validation merely because most trials completed.

Completion and agreement are separate requirements.

## Required validation status

The report should say something like:

```text
MONTE CARLO VALIDATION: FAILED

Completion rate:        99.4%
Analytical mean:      3565.1c
Monte Carlo mean:     1733.1c
Difference:           1832.0c / 51.4%

Reason:
Simulation terminates successfully but does not reproduce the analytical expected-cost model within tolerance.
```

## Required fix

Trace where the two models diverge.

Compare expected versus simulated currency use for each step:

```text
Step 1 base/fracture cost
Step 2 Harvest cost
Step 3 Annuls and rebuilds
Step 4 Exalts + Annuls + ES rebuilds
Step 5 Exalts + Annuls + rebuilds
Step 6 Divines
```

Add a diagnostic comparison table such as:

```text
                    Analytical     Monte Carlo     Difference
Harvest attempts      XX.XX          XX.XX          XX.XX
Annuls                 XX.XX          XX.XX          XX.XX
Exalts                 XX.XX          XX.XX          XX.XX
Divines                XX.XX          XX.XX          XX.XX
Restarts               XX.XX          XX.XX          XX.XX
Total cost             XXXXc          XXXXc          XXXXc
```

Do not continue to new optimizer features until the discrepancy is understood.

---

# Finding 5 — Divine Orb Cost Must Be Route-Specific

The current Step 6 assumes:

```text
Expected Divine attempts: 3
Expected Divine cost:     600c / 3 div
```

for every route.

That is not correct.

## Case A — Purchased Fractured +8 Intelligence Base

If the purchased base already has:

```text
+8 Intelligence
```

then the required final roll is already satisfied.

Expected Divine cost:

```text
0 Divines
0c
```

## Case B — Self-Fractured T1 Intelligence

If self-fracturing accepts any T1 Intelligence roll:

```text
+6
+7
+8
```

and these values are uniformly distributed, then:

```text
P(initial +8) = 1/3
P(initial not +8) = 2/3
```

Once Divining begins, probability of rolling +8 per Divine is:

```text
1/3
```

so expected Divines conditional on needing to Divine are:

```text
3
```

Unconditional expectation from a fresh unknown T1 roll is therefore:

```text
(1/3 × 0) + (2/3 × 3)
= 2 Divines
```

At 200c per Divine:

```text
Expected finishing cost = 400c / 2 div
```

not 600c.

## Required fix

Numeric finishing cost must be calculated from the actual starting roll state for each route.

Examples:

```text
Purchased fractured +8 Int:
  expected Divines = 0

Purchased fractured T1 Int with unknown +6–8 value:
  expected Divines derived from known purchase roll

Self-fractured T1 Int with uniform unknown +6–8:
  expected Divines = 2
```

The `ItemState` should preserve current numeric rolls so the solver can calculate this accurately.

---

# Finding 6 — Step 5 Outcome Probabilities Need Better Labels

The Step 5 per-Allflame-attempt probabilities are reported as:

```text
Best Attributes:    8.05%
Best Attack Speed:  6.33%
Best All Res:       6.00%
No acceptable:     79.63%
```

These sum to approximately:

```text
20.37% accepted result per attempt
```

The final report then shows:

```text
+4 All Attributes:   39.51%
3% Attack Speed:     31.06%
All Resistance:      29.43%
```

These second percentages appear to be the **conditional distribution given that an acceptable result eventually occurs**.

That is mathematically fine, but the report does not clearly explain the distinction.

## Required fix

Use separate labels:

```text
STEP 5 PER-ATTEMPT ALLFLAME OUTCOMES
  Attributes:      8.05%
  Attack Speed:    6.33%
  All Res:         6.00%
  No acceptable: 79.63%

FINAL ACCEPTED OUTCOME DISTRIBUTION
Conditional on eventually accepting a Step 5 result:
  Attributes:     39.51%
  Attack Speed:   31.06%
  All Res:        29.43%
```

Do not present conditional and unconditional probabilities under the same heading.

---

# Finding 7 — The Step 5 "Sell All Res" Decision Needs Full Continuation-Value Proof

The report currently recommends:

```text
All Resistance result → SELL at 7 div
```

because its sale value is greater than the estimated continuation value.

This is exactly the type of decision the optimizer should make, but it must show the calculation.

The solver should compare:

```text
Sell now value
versus
Expected value of Annul and retry
```

For a failed/low-value final suffix state:

```text
T1 ES
35% Effect
fractured T1 Int
All Res or junk suffix
```

an Annul can remove:

```text
1/3 final suffix
1/3 T1 ES
1/3 35% Effect
```

Therefore retry value must include:

- successful cleanup;
- rebuild of T1 ES if ES is lost;
- rebuild of 35% Effect if Effect is lost;
- Annul cost;
- future Exalt/Allflame cost;
- future sale-value distribution.

## Required output

For economically meaningful stop decisions, include:

```text
All Res sale value:              1400c
Expected continuation value:     XXXXc
Expected cost to continue:        XXXc
Net continuation value:           XXXc

Recommended action: SELL
Advantage versus continuing:      XXXc
```

---

# Finding 8 — Craft B Is Still Not an Optimization Result

Reference Craft B currently reports:

```text
Blanketed Snow:
  ~204 Exalt attempts

Prismatic Heart:
  ~38 Exalt attempts

Widespread Destruction:
  ~38 Exalt attempts

Expected total craft cost:
  ~8.51 div
```

The example sale value in the run is also only:

```text
4 div
```

while the current reference example used during design was approximately 6 div.

More importantly, the optimizer still does not compare the important three-notable crafting routes.

Before Reference Craft B is meaningful, the engine needs support for at least:

```text
Orb of Alteration
Orb of Augmentation
Regal Orb
proper Scour/restart flow
magic → rare transitions
```

Potentially also:

```text
Harvest reforge approaches
fractured notable bases
Allflame wrappers for eligible currency actions
```

Until then the output must say:

```text
STATUS: NOT YET OPTIMIZED

The reported Exalt path is only the best route among currently implemented actions.
It is not a global optimum.
```

Do not use Reference Craft B to rank profitability yet.

---

# Finding 9 — Reporting Format Is Now Good Enough to Keep

The latest stepwise report is a major improvement.

Keep the overall structure:

```text
Step 1 — Starting-base/fracture acquisition
Step 2 — Primary deterministic/tagged craft
Step 3 — Cleanup
Step 4 — First rare slam
Step 5 — Final valuable slam
Step 6 — Numeric finishing

Total expected cost
Outcome value distribution
Expected sale value
Expected profit
ROI
Alternate starting routes
Monte Carlo comparison
```

This is the desired long-term output shape.

The next work should focus on fixing the underlying mathematics rather than redesigning the report.

---

# Required Next Work Order

Do not add more crafting methods until these items are resolved.

## 1. Fix starting-route consistency

One route must be selected consistently across the entire report and simulation.

## 2. Replace self-fracture prep constants

Remove the 25c / 35c assumptions and compute actual fracture-preparation costs.

## 3. Make Divine finishing route-aware

Purchased +8 Int should cost 0 Divines.
Self-fractured unknown T1 Int should use the correct expected reroll cost.

## 4. Prove Harvest numbers

Show the exact source/formula for:

```text
7.1429% T1 ES
20/50/30 successful-state distribution
```

## 5. Diagnose analytical vs Monte Carlo mismatch

This is the highest-priority mathematical issue.

Target before considering the model validated:

```text
Analytical expected cost
and
Monte Carlo empirical mean
```

should agree within a small tolerance.

Recommended initial threshold:

```text
<= 5% difference
```

with a goal of:

```text
<= 2%
```

for stable high-sample runs.

## 6. Label Step 5 probabilities correctly

Separate per-attempt outcome rates from eventual accepted-result distribution.

## 7. Show continuation-value math for sell/retry decisions

Especially for the 7-div All Resistance result.

## 8. Leave Reference Craft B in NOT YET OPTIMIZED status

Do not treat it as a global optimum until Alt/Aug/Regal/restart paths exist.

---

# Next Validation Checkpoint

The next run should focus only on Reference Craft A.

Do not use the Cold three-notable craft as a validation gate yet.

The next Reference Craft A report should include:

```text
[ ] One consistent selected starting route
[ ] Real self-fracture preparation cost
[ ] Route-specific Divine finishing cost
[ ] Harvest probability provenance
[ ] Harvest success-state distribution provenance
[ ] Analytical currency consumption by step
[ ] Monte Carlo currency consumption by step
[ ] Analytical/Monte Carlo difference <= 5%
[ ] Correctly labeled conditional/unconditional Step 5 probabilities
[ ] Explicit continuation-value comparison for SELL vs RETRY
```

If analytical and Monte Carlo costs still differ materially, stop and diagnose that mismatch before expanding the optimizer.

---

# Expected Stepwise Output After These Fixes

The desired final report should look approximately like this:

```text
STEP 1 — Acquire Starting Fracture

Buy fractured +8 Int:
  Cost: 1600c / 8.00 div

Self-fracture T1 Int:
  Base cost per attempt:          10c
  Preparation cost per attempt:   XXc
  Fracturing Orb per attempt:    359c
  Success chance:                 25%
  Expected attempts:                4
  Expected total:               XXXXc / XX.XX div

Recommended:
  [route]

Cumulative expected cost:
  XXXXc

STEP 2 — Harvest Defence for T1 ES

T1 ES probability:              X.XX%
Expected Harvest attempts:      XX.XX
Raw Harvest cost:               XXc
Expected cleanup/recovery setup: ...
Step total:                     XXXc
Cumulative:                    XXXXc

STEP 3 — Clean Harvest Junk

Expected Annuls:                 X.XX
Expected successful cleanup:    XX.XX%
Expected ES-loss rebuilds:       X.XX
Step total:                     XXXc
Cumulative:                    XXXXc

STEP 4 — Allflame Exalt 35% Effect

Normal target chance:            X.XX%
Allflame target chance:         XX.XX%
Expected attempts:               X.XX
Raw Exalt cost:                  XXc
Expected Annul/rebuild cost:    XXXc
Step total:                     XXXc
Cumulative:                    XXXXc

STEP 5 — Allflame Exalt Final Suffix

Per-attempt outcomes:
  Attributes:                    X.XX%
  Attack Speed:                  X.XX%
  All Res:                       X.XX%
  No accepted result:           XX.XX%

On All Res:
  Sell value:                   1400c
  Continue EV:                  XXXXc
  Recommended action:           SELL / RETRY

Expected step total:            XXXc
Cumulative:                    XXXXc

STEP 6 — Finish Int Roll

If purchased +8 Int:
  Expected Divine cost:            0c

If self-fractured unknown T1 Int:
  Expected Divines:               2.0
  Expected Divine cost:          400c

TOTAL EXPECTED CRAFT COST:
  XXXXc / XX.XX div

EXPECTED SALE VALUE:
  XXXXc / XX.XX div

EXPECTED PROFIT:
  XXXXc / XX.XX div

EXPECTED ROI:
  XX.XX%

MONTE CARLO VALIDATION:
  Completion rate:               XX.XX%
  Analytical mean:               XXXXc
  Simulated mean:                XXXXc
  Difference:                    X.XX%
  Status:                        PASS / FAIL
```

---

# Bottom Line

The optimizer's reporting layer is now close to the desired final format.

The remaining blockers are mathematical consistency issues, not presentation issues.

The most important next goal is:

> **Make the analytical solver and Monte Carlo implementation describe the exact same policy and produce approximately the same expected total cost for Reference Craft A.**

Until that happens, the optimizer should continue to label its output:

```text
STATUS: APPROXIMATE / NOT VALIDATED
```
