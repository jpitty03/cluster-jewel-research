# Fractured 35% Route — Review Findings and Next Steps

## Scope

This review is based on the latest `output.txt` produced by:

```text
node cluster-jewel-research\crafting-engine\scripts\optimizeCraftDemo.ts > output.txt
```

and the latest committed implementation that introduced the fractured-35%-Effect route, a dedicated Markov continuation model for that route, updated self-fracture preparation estimates, and revised validation/reporting.

The current output reports:

- Policy cost model: **PROVISIONALLY VALIDATED**
- Analytical expected craft cost: **2417.1c (~12.09 div)**
- Monte Carlo mean craft cost: **2533.6c (~12.67 div)**
- Total-cost difference: **4.82%**
- Recommended starting route: **Self-fracture 35% Effect** at an estimated **1533.4c (~7.67 div)** acquisition cost

The fractured-35 route is structurally promising and should remain in the optimizer. However, the current 12.09-div analytical result should remain provisional until the state/probability issues below are resolved.

---

## 1. Positive Finding — The Optimizer Discovered a Better Structural Route

The optimizer is no longer assuming that fractured Intelligence is the preferred start.

The newly preferred route is conceptually:

```text
Fracture 35% Increased Effect
    -> Harvest Reforge Defence until T1 Maximum ES
    -> Prefixes are complete and 35% Effect is permanently protected
    -> Acquire T1 Intelligence (+6 to +8)
    -> Acquire one premium suffix:
         +4 All Attributes
         3% Attack Speed
         +4% All Elemental Resistance
```

This is a legitimate and important route to evaluate.

Its main structural advantage is that the difficult 35% Effect prefix is permanently protected from Annulment failures. This can reduce the amount of downstream rebuilding compared with a fractured-Intelligence route where both T1 ES and 35% Effect remain removable.

Do **not** hard-code fractured 35% Effect as the answer. Keep both fractured-Intelligence and fractured-35 routes in the same state/action optimization framework and let prices and probabilities determine the winner.

---

## 2. High Priority — Re-audit the Fractured-35 Suffix Pool Denominators

The current policy engine contains route-specific constants such as:

```text
pInt        = sampleRate(300, 14750)
p5          = sampleRate(850, 14450)
p5FullPool  = sampleRate(850, 14750)
```

These denominators need to be derived from the actual eligible modifier pool rather than embedded as route constants.

From the scraped Large Cluster data already used by the project, the approximate full suffix pool for the shield-attack cluster has previously been:

```text
Generic suffix weight:          13,200
Shield-specific suffix weight:   2,450
---------------------------------------
Approx. total suffix weight:    15,650
```

A fractured 35% Effect is a **prefix**, so by itself it should not block a suffix modifier family.

Therefore the initial suffix denominator for this state:

```text
Fractured 35% Effect
T1 Maximum ES
empty suffix
empty suffix
```

needs explicit verification. A denominator of `14750` should not be accepted without diagnostic proof.

### Required diagnostic output

Add a focused reference/diagnostic report that prints the actual eligible suffix pool and total weight for each important state:

```text
FRACTURED-35 SUFFIX POOL AUDIT

State A — Frac 35 + T1 ES, no suffixes
  Eligible suffix count: X
  Eligible suffix weight: X
  T1 Intelligence group weight: X
  Premium target weight: X

State B — Frac 35 + T1 ES + T1 Intelligence
  Eligible suffix count: X
  Eligible suffix weight: X
  Premium target weight: X

State C — Frac 35 + T1 ES + +4 All Attributes
  Eligible suffix weight: X
  T1 Intelligence weight: X

State D — Frac 35 + T1 ES + 3% Attack Speed
  Eligible suffix weight: X
  T1 Intelligence weight: X

State E — Frac 35 + T1 ES + +4% All Resistance
  Eligible suffix weight: X
  T1 Intelligence weight: X
```

All probabilities used by the solver should be calculated from these eligible pools.

Do not keep `14750`, `14450`, or similar denominator constants if they can be calculated from the actual `ItemState` plus `ModPool`.

---

## 3. High Priority — Do Not Collapse All Premium Suffixes Into One Average State

The current fractured-35 Markov model uses an approximation similar to:

```text
premium suffix present -> remove ~285.3 average weight
```

and then derives one averaged T1 Intelligence probability after a premium suffix is present.

That is not exact enough for this route.

The three premium suffixes belong to different modifier groups:

```text
+4 All Attributes
3% Attack Speed
+4% All Elemental Resistance
```

Once one is present, that modifier family is excluded from future rolls. The amount of weight removed from the eligible suffix pool can differ by branch.

The exact state graph should therefore distinguish:

```text
S_Attributes
S_AttackSpeed
S_AllResistance
```

instead of one generic:

```text
S_Premium
```

For each branch, calculate the exact continuation probability and expected cost of acquiring T1 Intelligence.

This is also important because these three terminal outcomes have very different sale values:

```text
+4 All Attributes -> 85 div
3% Attack Speed   -> 39 div
All Resistance    -> 7 div
```

The optimizer should preserve branch identity through the state graph rather than averaging it away prematurely.

---

## 4. High Priority — The Current 4.82% Agreement May Contain Compensating Errors

The latest output reports total expected cost agreement within 4.82%, which is encouraging but not sufficient by itself.

The action counts disagree substantially:

```text
                         Analytical     Monte Carlo
Harvest Attempts:           159.14          326.18
Annulment Orbs:              43.92           51.23
Exalted Orbs:                30.27           24.55
```

The Harvest estimate is off by roughly a factor of two.

That means the final total can still be close because multiple errors are cancelling each other out.

### Change the validation gate

Do not classify a policy as provisionally validated based only on total chaos-cost agreement.

Use a multi-metric gate such as:

```text
POLICY COST MODEL VALIDATION

Total expected cost difference: <= 5%
Harvest count difference:       <= 10%
Annul count difference:         <= 10%
Exalt count difference:         <= 10%
Missing policy states:          0
Fallback actions used:          0
```

Prefer <=2% total-cost difference for full validation after the transition model is stable.

Under this stronger rule, the current result should remain:

```text
POLICY COST MODEL: INVESTIGATION REQUIRED
```

because the Harvest/Annul/Exalt action counts do not yet agree closely enough.

The Monte Carlo simulator is valuable precisely because it can expose these hidden state-frequency errors even when total cost appears close.

---

## 5. High Priority — Fix Stepwise Cost Attribution for the New Route

The current stepwise analytical/Monte Carlo table is still partly structured around the older fractured-Intelligence route.

It currently reports values similar to:

```text
Step 1 Acquisition: 1533.4c
Step 2 Harvest:      1533.4c
Step 3 Cleanup:        56.1c
Step 4 35% Effect:    827.5c
Step 5 Final Suffix:  927.5c
```

This is not a faithful representation of the new route.

For a fractured-35 start there is no later "slam 35% Effect" stage. The route should be reported using its actual conceptual phases:

```text
Step 1 — Acquire fractured 35% Effect base
Step 2 — Establish / re-establish T1 Maximum ES with Harvest
Step 3 — Clean unwanted Harvest mods when continuation EV says Annul is best
Step 4 — Acquire T1 Intelligence and premium suffix using the optimal suffix-state policy
Step 5 — Sell / terminal outcome
```

The reporting model should derive step labels from the selected policy/route rather than indexing fixed array positions that assume the fractured-Int route.

### Recovery-loop reporting

For each action type, show both initial acquisition and full-craft contribution.

Example:

```text
STEP 2 — T1 ES via Harvest

Initial acquisition:
  Chance per Harvest: X%
  Expected Harvests for first T1 ES: X
  Expected cost: Xc

Recovery contribution:
  Expected additional Harvests after downstream destructive failures: X
  Expected recovery Harvest cost: Xc

Full-craft Harvest usage:
  Expected Harvests: X
  Expected cost: Xc
```

This prevents a small "initial" cost from being mistaken for the true expected currency consumption across the complete crafting process.

---

## 6. Add T1 Intelligence to the Harvest Success Census

The current Harvest census reports several useful incidental states but does not clearly report T1 Intelligence outcomes on the fractured-35 route.

For this route, T1 Intelligence is one of the two suffix goals, so the census should include it directly.

Add at least:

```text
Of T1 ES Harvest successes:
  T1 ES + T1 Intelligence
  T1 ES + +4 All Attributes
  T1 ES + 3% Attack Speed
  T1 ES + +4% All Resistance
  T1 ES + T1 Intelligence + premium suffix
  junk-only extras
```

If Harvest can incidentally produce both required suffix categories, the solver must preserve and value those states appropriately.

The state census should be generated from actual simulation states, not inferred from fixed percentages.

---

## 7. Self-Fracture Acquisition Remains Approximate

The latest implementation improved the preparation estimates substantially:

```text
T1 Intelligence self-fracture prep:
  Alterations:   ~52.2
  Augmentations: ~13.0
  Regal:          1
  filler/bench:   modeled

35% Effect self-fracture prep:
  Alterations:   ~41.7
  Augmentations: ~10.4
  Regal:          1
  filler/bench:   modeled
```

This is better than the previous single-mod-weight approximation, but the acquisition model should still be considered approximate until the exact magic-item roll process is verified against PoE mechanics.

Do not present self-fracture as deterministically superior purely because its estimated EV is lower.

Current reporting should continue distinguishing:

```text
PROVISIONAL CHEAPEST
```

from:

```text
DETERMINISTIC MARKET ALTERNATIVE
```

Also ensure the optimizer can compare **all T1 Intelligence rolls +6 to +8 equally**. There is no requirement to Divine Intelligence to +8 for this target.

---

## 8. Correct Validation Wording

The revised wording is directionally better:

```text
BEST OF EVALUATED POLICIES: PROVEN
GLOBAL OPTIMALITY: NOT YET PROVEN
```

Keep this distinction.

The optimizer can only claim global optimality when the relevant legal action space is sufficiently complete and the solver actually searches it.

For Craft A, current statements should remain scoped to the actions and policies currently modeled.

Craft B is still not globally optimized until Alteration/Augmentation/Regal/Scour and related rarity/reset transitions are available in the general solver.

---

## 9. Recommended Next Work Order

Implement the following in this order:

1. **Derive fractured-35 suffix pools dynamically** from the actual `ItemState` and mod data.
2. **Print a suffix-pool diagnostic audit** for the key fractured-35 states.
3. **Split the generic premium continuation state** into Attributes / Attack Speed / All Resistance branches.
4. **Recalculate the fractured-35 Markov system** from those exact branch-specific probabilities.
5. **Add T1 Intelligence and joint target states to the Harvest census.**
6. **Fix route-specific step attribution/reporting.**
7. **Strengthen validation** so action-count agreement is required in addition to total-cost agreement.
8. Re-run at least **2,000 completed Monte Carlo trials** using the exact same policy.
9. Compare analytical vs Monte Carlo action counts and costs again.
10. Only after Craft A converges, return to expanding the generic action set for Craft B.

Do not add unit tests for this work. Use diagnostic/reference scripts, Monte Carlo cross-validation, and end-to-end demonstration output instead.

---

## Validation Target for the Next Run

The next `output.txt` should ideally demonstrate:

```text
POLICY COST MODEL
  Total cost difference: <= 2% preferred, <= 5% maximum

ACTION COUNT AGREEMENT
  Harvests: <= 10% difference
  Annuls:   <= 10% difference
  Exalts:   <= 10% difference

POLICY CONSISTENCY
  Missing policy states: 0
  Fallback actions:      0

POOL AUDIT
  No unexplained hard-coded suffix denominators
  Branch-specific blocked modifier groups shown explicitly

REPORTING
  No old fractured-Int step labels leaking into fractured-35 route
  Initial acquisition vs recovery-loop costs separated clearly
```

Until those conditions are met, treat the current ~12.09-div analytical result as a promising **provisional estimate**, not a settled expected crafting cost.
