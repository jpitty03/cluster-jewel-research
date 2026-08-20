# Crafting Optimizer Validation Findings and Required Stepwise Reporting Format

## Purpose

This document records the findings from the first end-to-end optimizer run and defines how the crafting engine should present a craft once the solver is mathematically valid.

The most important requirement is that optimizer output must be presented as a **step-by-step crafting plan**, with an expected cost for every step, recovery costs where applicable, and a final expected total craft cost.

The current end-to-end output is **not yet trustworthy**. Several implementation issues were identified that cause the reported costs to be materially wrong. These must be fixed before the optimizer is used to make real crafting decisions.

---

# Current Reference Prices

Use these values for the current Reference Craft A validation unless explicitly overridden by test input:

```text
Divine Orb               200c
Fracturing Orb           359c
Orb of Annulment           9c
Exalted Orb              1.2c
Yellow Lifeforce       1 / 13 c each
Blue Lifeforce         1 / 26 c each
Red Lifeforce          1 / 48 c each
Clean 12-passive base     10c
Fractured T1 Int base    8 div = 1600c
Fractured 35% base      13 div = 2600c
```

Target final sale outcomes:

```text
T1 ES + 35% Effect + T1 Int + +4 All Attributes
  → approximately 85 div

T1 ES + 35% Effect + T1 Int + 3% Attack Speed
  → approximately 39 div

T1 ES + 35% Effect + T1 Int + All Elemental Resistance
  → approximately 7 div
```

T1 Intelligence rolling +6, +7, or +8 counts as hitting the correct modifier.

If the final item needs +8 specifically, Divine Orbs may be used afterward to reroll the numeric value. Do not reduce the probability of hitting T1 Intelligence by another 1/3.

---

# Findings From the First End-to-End Run

The first optimizer run reported approximately:

```text
Clean/self-fracture route: ~7.24 div total investment
Purchased fractured Int:   ~8.01 div
Purchased fractured 35%:  ~35.09 div
```

These results must not be trusted yet.

The run exposed the following implementation problems.

## Finding 1 — The "self-fracture route" does not actually fracture anything

The demo creates an empty rare state and labels it:

```text
Clean 12-Passive Base (Self-Fracture Route)
```

but the evaluator currently registers only actions such as:

```text
Exalt
Annul
Harvest Reforge Defence
Harvest Reforge Attribute
```

There is no Fracturing Orb action in the evaluated route.

Therefore the optimizer is comparing:

```text
empty rare base
```

against:

```text
real fractured base
```

while pretending the clean base has paid the cost of self-fracturing.

This makes the self-fracture route artificially cheap.

### Required fix

A self-fracture starting strategy must explicitly include:

1. acquiring the clean base;
2. creating the desired fracture candidate modifier;
3. preparing exactly four eligible explicit modifiers;
4. using a Fracturing Orb;
5. handling a failed fracture;
6. repeating the complete preparation process after failure where necessary.

---

# Step 1 — Fractured Base Acquisition

This should be the first line of every fractured-base craft report.

The optimizer must compare all legal ways to acquire the desired fractured starting state.

For the T1 Intelligence route:

## Option A — Buy fractured T1 Intelligence

```text
Market price: 8 div
Chaos value: 1600c
```

Expected Step 1 cost:

```text
1600c
```

No probability calculation is required because the desired fractured base is purchased directly.

---

## Option B — Self-fracture T1 Intelligence

Known baseline:

```text
Clean base:       10c per attempt
Fracturing Orb:  359c per attempt
Fracture chance: 25% when exactly four valid mods are present
Expected fracture attempts: 4
```

Absolute theoretical floor, **before preparation cost**:

```text
4 × (359c + 10c)
= 1476c
= 7.38 div
```

This is only a floor.

The real expected self-fracture cost is:

```text
Expected Step 1 cost
=
expected clean base consumption
+ expected four-mod preparation cost
+ expected Fracturing Orb consumption
+ expected losses from failed fractures
```

At current prices, buying the fractured Int base costs:

```text
1600c
```

The difference between market purchase and the theoretical self-fracture floor is only:

```text
1600c - 1476c = 124c
```

Spread over the expected four attempts, the self-fracture route has only:

```text
124c / 4 = 31c
```

of preparation-cost headroom per attempt before purchasing the fractured base becomes cheaper.

### Current expectation

Unless creating the exact four-mod T1 Intelligence fracture candidate costs less than about **31c per attempt**, buying the 8-div fractured Int base is likely cheaper.

The optimizer must prove this using the actual preparation route rather than hard-coding the conclusion.

---

## Option C — Buy fractured 35% Effect

```text
Market price: 13 div
Chaos value: 2600c
```

This is a legal alternative starting strategy and must be compared against fractured Int.

The solver must not assume either fracture is superior based on market price alone.

It must evaluate the entire downstream craft from each starting state.

---

# Required Step 1 Output Format

Example:

```text
STEP 1 — Acquire Starting Fracture

Option A: Buy fractured T1 Intelligence
  Purchase cost:              1600.0c / 8.00 div
  Expected preparation cost:     0.0c
  Expected total:             1600.0c / 8.00 div

Option B: Self-fracture T1 Intelligence
  Clean base per attempt:        10.0c
  Four-mod preparation:          XX.Xc per attempt
  Fracturing Orb:               359.0c per attempt
  Success chance:                25.00%
  Expected attempts:              4.00
  Expected total:               XXXX.Xc / XX.XX div

Recommended Step 1:
  BUY fractured T1 Intelligence

Reason:
  Expected cost is XXXc lower than self-fracturing.
```

---

# Finding 2 — Current demo prices are stale

The current demo script uses values that do not match the reference prices.

Examples currently hard-coded in the demo include values such as:

```text
Fractured Int base:   1000c / 5 div
Fractured 35% base:   6000c / 30 div
Clean base:            400c / 2 div
Finished sale value: 12000c / 60 div
```

These are not the current reference values.

### Required fix

Reference craft prices must come from a fixture/PriceBook or explicit request input rather than stale constants in the demonstration script.

Tests should fail if the fixture and demo silently diverge.

---

# Step 2 — Harvest Reforge Defence Until T1 Maximum ES

For the fractured Intelligence route, the expected state entering Step 2 is:

```text
Suffix:
  fractured T1 Intelligence

Prefixes:
  none initially
```

The goal is:

```text
T1 Maximum Energy Shield
```

Current Horticrafting data indicates Reforge Defence costs:

```text
75 Primal/Red Lifeforce
```

At:

```text
Red Lifeforce = 1 / 48 chaos each
```

raw cost per Harvest Defence craft is:

```text
75 / 48
= 1.5625c
```

However, the **probability of T1 ES per Harvest is not yet sufficiently validated**.

The current solver estimates Harvest target probability using a simplified tagged-weight ratio and then treats requirements independently. That is not enough for a reliable final craft cost because a real Harvest reforge also generates additional affixes and changes the item state.

### Required Step 2 calculation

The engine must report:

```text
P(T1 ES per Reforge Defence)
Expected attempts = 1 / P(T1 ES)
Raw Harvest cost = Expected attempts × 1.5625c
```

It must then include the expected state distribution when T1 ES succeeds:

```text
T1 ES + 0 junk removable mods
T1 ES + 1 junk removable mod
T1 ES + 2 junk removable mods
...
```

because Step 3 cleanup cost depends on that distribution.

### Required Step 2 output format

```text
STEP 2 — Harvest Reforge Defence for T1 Maximum ES

Craft cost per attempt:
  75 Red Lifeforce
  = 1.5625c

T1 ES probability per craft:
  X.XXXX%

Expected attempts:
  XX.XX

Expected raw Harvest cost:
  XXX.Xc

Successful-state distribution:
  clean T1 ES state:           XX.XX%
  T1 ES + 1 junk mod:          XX.XX%
  T1 ES + 2 junk mods:         XX.XX%
  ...

Expected cumulative cost after Step 2:
  XXXX.Xc / XX.XX div
```

Do not print a final Step 2 expected cost until the Harvest generation model is validated.

---

# Finding 3 — The expected-cost solver does not currently transition through states

The current solver identifies unmet target requirements from the original starting state and estimates a cost for each requirement independently.

Conceptually it currently behaves like:

```text
start state
  calculate cost for ES
  calculate cost for Effect
  calculate cost for Int
  calculate cost for Attributes
  sum all costs
```

It does not actually perform:

```text
state A
  → craft action
  → state B
  → choose next action
  → state C
```

This is a fundamental blocker.

Every crafting step changes:

- prefix/suffix occupancy;
- eligible modifier weights;
- blocked mod groups;
- available actions;
- Annul risk;
- Harvest behavior;
- recovery strategy.

### Required fix

The solver must evaluate real transitions:

```text
V(state) = min_action[
  actionCost + Σ(probability × V(resultingState))
]
```

with terminal goal states and restart states.

---

# Step 3 — Clean Irrelevant Modifiers

After Harvest successfully rolls T1 ES, additional mods may be present.

Desired preserved state:

```text
Fractured T1 Intelligence
T1 Maximum ES
```

All other affixes are candidates for cleanup.

Fractured Intelligence cannot be Annulled.

Annulment Orb price:

```text
9c
```

Annulment probabilities must be calculated from the **actual removable modifiers currently present**.

Example:

```text
Fractured Int
T1 ES
junk prefix
junk suffix
```

Removable candidates:

```text
T1 ES
junk prefix
junk suffix
```

Therefore:

```text
P(remove junk) = 2 / 3
P(remove T1 ES) = 1 / 3
```

If T1 ES is removed, the craft may need to return to Step 2.

Another example:

```text
Fractured Int
T1 ES
junk
```

Then:

```text
P(remove junk) = 1 / 2
P(remove T1 ES) = 1 / 2
```

### Current bug

The current expected-cost solver uses an approximation similar to:

```text
expectedAnnuls = expectedSlams × 0.8
```

This is not mathematically valid and must be removed.

### Required Step 3 output format

```text
STEP 3 — Clean Harvest Junk

Starting state distribution:
  [state A] XX.XX%
  [state B] XX.XX%
  ...

Recommended cleanup policy:
  State A: Annul
    removable mods: 3
    desired cleanup chance: 66.67%
    destructive chance: 33.33%
    recovery on destructive outcome: return to Step 2

  State B: already clean
    no action required

Expected Annuls used:
  X.XX

Expected Annul cost:
  XX.Xc

Expected rebuild/Harvest cost caused by destructive Annuls:
  XX.Xc

Expected Step 3 total:
  XXX.Xc

Expected cumulative craft cost:
  XXXX.Xc / XX.XX div
```

---

# Step 4 — Exalt / Allflame for 35% Increased Effect

Desired state before Step 4:

```text
Prefix:
  T1 Maximum ES

Suffix:
  fractured T1 Intelligence
```

Goal:

```text
35% increased Small Passive Effect
```

The engine must recalculate the eligible prefix pool after T1 ES blocks the entire ES family.

Do not use a static global display percentage.

If normal Exalt target probability is:

```text
p
```

then under the current Allflame assumption of four simulated Exalts where the best result may be selected, the binary probability of seeing the target at least once is:

```text
1 - (1 - p)^4
```

But the real Allflame implementation must evaluate all four states by continuation value, not only target/no-target.

Exalted Orb cost:

```text
1.2c
```

The raw Exalt currency itself is cheap. The expensive part can be recovery after a failed slam.

Example failed state:

```text
Fractured Int
T1 ES
junk
```

Annul candidates:

```text
T1 ES
junk
```

so:

```text
50% remove junk and return to clean Step 4 state
50% remove T1 ES and return to Step 2/3 rebuild path
```

This recovery loop must be included in Step 4 expected cost.

### Required Step 4 output format

```text
STEP 4 — Slam 35% Increased Effect

Eligible prefix weight:
  XXXXX

35% Effect weight:
  XXX

Normal Exalt chance:
  X.XXXX%

Allflame 4-choice chance:
  XX.XXXX%

Raw expected Exalt attempts:
  X.XX

Raw Exalt cost:
  XX.Xc

Failure recovery:
  Annul clean miss: XX.XX%
  Lose T1 ES:      XX.XX%
  Other outcome:   XX.XX%

Expected Annul recovery cost:
  XX.Xc

Expected T1 ES rebuild cost caused by failures:
  XX.Xc

Expected Step 4 total:
  XXX.Xc

Expected cumulative craft cost:
  XXXX.Xc / XX.XX div
```

---

# Step 5 — Slam Premium Final Suffix

Desired state before Step 5:

```text
Prefixes:
  T1 Maximum ES
  35% increased Effect

Suffixes:
  fractured T1 Intelligence
  one open suffix
```

Acceptable final outcomes:

```text
+4 All Attributes → ~85 div
3% Attack Speed   → ~39 div
All Resistance    → ~7 div
```

The optimizer must support **outcome-specific sale values**.

A 7-div All Resistance result is not economically equivalent to an 85-div Attributes result.

The optimization objective must therefore distinguish:

```text
craft success
```

from:

```text
specific final market outcome
```

If the goal mode is minimum cost to produce *any acceptable result*, the solver may accept All Resistance immediately.

If the objective is maximum expected profit, the solver may decide that:

- the 7-div result should be sold;
- the 7-div result should be Annulled and retried;
- or the 7-div result is not worth accepting at all.

That decision must come from continuation value.

### Recovery danger at Step 5

Example miss:

```text
T1 ES
35% Effect
fractured Int
junk suffix
```

Removable modifiers are:

```text
T1 ES
35% Effect
junk suffix
```

The fractured Int is excluded.

Therefore a normal Annul has:

```text
1/3 remove junk       → ideal recovery
1/3 remove T1 ES      → rebuild earlier step
1/3 remove 35% Effect → rebuild Step 4
```

This makes Step 5 recovery substantially more expensive than a simple "Exalt until hit" calculation.

### Required Step 5 output format

```text
STEP 5 — Slam Final Premium Suffix

Eligible suffix weight:
  XXXXX

Outcome probabilities per normal Exalt:
  +4 All Attributes:  X.XXXX%
  3% Attack Speed:    X.XXXX%
  All Resistance:     X.XXXX%
  Other:             XX.XXXX%

Allflame result probabilities:
  best result = Attributes:   XX.XX%
  best result = Attack Speed: XX.XX%
  best result = All Res:      XX.XX%
  no acceptable result:       XX.XX%

Expected raw Exalts:
  X.XX

Expected raw Exalt cost:
  XX.Xc

Failure recovery:
  remove junk:       33.33%
  remove T1 ES:      33.33%
  remove 35% Effect: 33.33%

Recommended action on All Resistance result:
  SELL / ANNUL / RETRY

Reason:
  expected continuation value = ...
  sale value = 1400c

Expected Step 5 total:
  XXX.Xc
```

---

# Step 6 — Divine T1 Intelligence to +8 if Needed

T1 Intelligence ranges from:

```text
+6 to +8
```

The correct modifier has already been obtained if any T1 value rolls.

If the final sale specification requires +8, use Divine Orbs after all other crafting is complete.

The engine must calculate expected rerolls from the current value/range.

Do not add numeric-roll rarity to the original T1 Intelligence mod-hit probability.

### Required Step 6 output format

```text
STEP 6 — Finish Intelligence Numeric Roll

Current modifier:
  T1 Intelligence +(6–8)

Required final roll:
  +8

Current roll:
  +6 / +7 / +8 / unknown distribution

Expected Divine Orbs:
  X.XX

Divine price:
  200c

Expected Divine finishing cost:
  XXX.Xc
```

---

# Required Final Craft Summary

Every optimization result should end with a compact summary like this:

```text
============================================================
RECOMMENDED CRAFTING PLAN
============================================================

STEP 1 — Starting fracture
  Buy fractured T1 Intelligence
  Expected cost: 1600.0c / 8.00 div

STEP 2 — Harvest Reforge Defence for T1 ES
  Chance per attempt: X.XX%
  Expected attempts: XX.XX
  Expected cost: XXX.Xc
  Cumulative: XXXX.Xc / XX.XX div

STEP 3 — Clean Harvest junk
  Recommended action: Annul according to state policy
  Expected Annuls: X.XX
  Expected rebuild cost: XX.Xc
  Expected step cost: XXX.Xc
  Cumulative: XXXX.Xc / XX.XX div

STEP 4 — Allflame Exalt 35% Effect
  Chance per attempt: XX.XX%
  Expected attempts: X.XX
  Raw Exalt cost: XX.Xc
  Expected recovery cost: XXX.Xc
  Expected step cost: XXX.Xc
  Cumulative: XXXX.Xc / XX.XX div

STEP 5 — Allflame Exalt premium suffix
  +4 Attributes outcome: XX.XX%
  3% Attack Speed outcome: XX.XX%
  All Res outcome: XX.XX%
  Expected raw slam cost: XX.Xc
  Expected recovery cost: XXX.Xc
  Expected step cost: XXX.Xc
  Cumulative: XXXX.Xc / XX.XX div

STEP 6 — Divine Intelligence to +8
  Expected Divines: X.XX
  Expected step cost: XXX.Xc

------------------------------------------------------------
EXPECTED TOTAL CRAFT COST
  XXXX.Xc / XX.XX div

FINAL OUTCOME VALUE DISTRIBUTION
  85 div Attributes result:    XX.XX%
  39 div Attack Speed result:  XX.XX%
   7 div All Res result:       XX.XX%

EXPECTED SALE VALUE
  XXXX.Xc / XX.XX div

EXPECTED PROFIT
  XXXX.Xc / XX.XX div

EXPECTED ROI
  XX.XX%
============================================================
```

---

# Alternate Route Comparison

The report must also show alternate complete strategies, not merely one recommended route.

For Reference Craft A, at minimum compare:

```text
1. Buy fractured T1 Intelligence
2. Self-fracture T1 Intelligence
3. Buy fractured 35% Effect
4. Self-fracture 35% Effect
5. Clean/unfractured route, if mechanically possible
```

Example:

```text
ALTERNATE STARTING ROUTES

1. Buy fractured T1 Int
   Expected total craft cost:  XX.XX div
   Difference from best:        BEST

2. Self-fracture T1 Int
   Expected total craft cost:  XX.XX div
   Difference from best:       +X.XX div

3. Buy fractured 35% Effect
   Expected total craft cost:  XX.XX div
   Difference from best:       +X.XX div

4. Self-fracture 35% Effect
   Expected total craft cost:  XX.XX div
   Difference from best:       +X.XX div
```

Each route must include the entire downstream cost. Do not compare fractures only by acquisition price.

---

# Finding 4 — Current Monte Carlo validation is invalid

The first run reported every Monte Carlo percentile as exactly the base cost.

Example:

```text
Mean:   400c
Median: 400c
P75:    400c
P90:    400c
P95:    400c
```

This is caused by simulation behavior that discards trials reaching the step limit.

If all trials are discarded, the implementation inserts the base cost into the result array.

This transforms a total simulation failure into what looks like a successful zero-crafting-cost result.

### Required fix

Monte Carlo must track:

```text
completed trials
failed/abandoned trials
timed-out trials
```

If no trial completes:

```text
VALIDATION FAILED
0 / N simulations reached a terminal state.
```

Do not generate percentiles.

If only some complete, report both:

```text
completion rate
conditional cost distribution of completed runs
```

and do not call it a full validation unless completion behavior matches the analytical policy.

---

# Finding 5 — Monte Carlo has a hard-coded craft policy

The Monte Carlo implementation currently contains Reference Craft A-specific behavior such as:

```text
if T1 ES is missing → Harvest Defence
if junk exists → Annul
otherwise → Exalt
```

This does not validate the optimizer.

It validates a separate manually coded recipe.

### Required fix

The solver must return a policy mapping:

```text
state → recommended action
```

Monte Carlo must execute that policy.

It should contain no knowledge of:

```text
T1 ES
35% Effect
Cold notables
specific target mod names
```

outside the target definition supplied to the solver.

---

# Finding 6 — Three-notable Cold craft result is premature

The current Cold cluster output suggests Exalt spam because the action set does not yet include the important alternatives needed to evaluate that craft, such as:

```text
Alteration
Augmentation
Regal
proper reset/scour flow
```

Therefore:

```text
281 expected Exalts / ~1.69 div
```

must not be interpreted as the optimal Cold cluster crafting method.

The engine currently means only:

> among currently implemented actions, this is the route I can construct.

It does not mean:

> Exalt spam is globally optimal.

---

# Important Rule Correction — Cluster Explicit Affix Limits

The implementation plan previously contained an incorrect generic statement that rare cluster jewels may have three prefixes and three suffixes.

For the cluster jewel system being modeled here, enforce the actual cluster explicit structure used by these items:

```text
maximum explicit modifiers: 4
maximum prefixes: 2
maximum suffixes: 2
```

Reference Craft A demonstrates the intended final structure:

```text
PREFIXES
  T1 Maximum ES
  35% Effect

SUFFIXES
  T1 Intelligence
  Premium fourth suffix
```

Add regression tests so this cannot drift back to standard rare-item 3-prefix/3-suffix assumptions.

---

# Immediate Implementation Priorities

Do not add more crafting methods until these are fixed.

## Priority 1 — Correct reference fixture prices

Replace stale demo prices with the values at the top of this document.

## Priority 2 — Correct affix limits

Enforce:

```text
2 prefixes
2 suffixes
4 total explicits
```

for this cluster system.

## Priority 3 — Real state-transition solver

Replace independent target requirement cost summation with actual action transitions.

## Priority 4 — Real Annul branching

Remove all hard-coded Annul multipliers.

## Priority 5 — Real fracture strategy

A self-fracture route must use Fracturing Orbs and pay all preparation costs.

## Priority 6 — Validate one narrow state first

Before full optimization, validate this state:

```text
Fractured T1 Int
T1 ES
```

Ask:

```text
What is the exact legal Exalted Orb outcome distribution?
What is the exact probability of 35% Effect?
Do all probabilities sum to 1?
```

Then validate:

```text
Fractured T1 Int
T1 ES
35% Effect
```

and calculate the exact forced-suffix Exalt distribution.

## Priority 7 — Repair Monte Carlo

Monte Carlo must execute solver policy and expose failures/timeouts.

---

# Phase Gate Before Trusting Full Craft Costs

The optimizer must not print a result as authoritative until all of these are true:

```text
[ ] Reference prices are correct
[ ] Cluster affix limits are correct
[ ] Every action changes ItemState
[ ] Solver evaluates resulting states
[ ] Annul outcomes are exact branches
[ ] Fracturing route actually fractures
[ ] Harvest success state distribution is modeled
[ ] Allflame chooses based on continuation value
[ ] Monte Carlo runs the solver's policy
[ ] Monte Carlo failures/timeouts are visible
[ ] Analytical and Monte Carlo results agree within tolerance
```

Until then, output should include:

```text
STATUS: APPROXIMATE / NOT VALIDATED
```

instead of implying mathematical optimality.

---

# Final Objective

The final system should answer a user request like:

```text
Craft this cluster jewel.
```

with an explanation in this form:

```text
Step 1 — Buy fractured T1 Int instead of self-fracturing
  Buy: 8.00 div
  Self-fracture: 8.47 div expected
  Savings: 0.47 div

Step 2 — Harvest Defence until T1 ES
  Chance: 7.12%
  Expected attempts: 14.04
  Expected cost: 21.9c

Step 3 — Annul cleanup
  Expected cost: 34.2c

Step 4 — Allflame Exalt 35% Effect
  Chance: 10.20%
  Raw slam cost: 11.8c
  Recovery cost: 63.5c
  Step total: 75.3c

Step 5 — Allflame Exalt premium suffix
  Expected step cost: 142.6c

Step 6 — Divine Int to +8
  Expected cost: 133.3c

Expected total craft cost:
  10.03 div

Expected sale value:
  57.4 div

Expected profit:
  47.37 div
```

The numbers above are an **example of the required presentation style only**. They must not be copied into actual calculations unless independently produced by the validated solver.

The engine's value is not just identifying the final cheapest strategy. It must clearly explain **where the cost comes from, what can fail at each step, how that failure is recovered, and how every step contributes to the total expected craft cost.**
