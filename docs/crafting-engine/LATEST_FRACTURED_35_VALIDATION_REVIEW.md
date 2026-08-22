# Latest Fractured-35 Validation Review

## Scope

This review covers the latest `main` implementation and the current `output.txt` produced by `crafting-engine/scripts/optimizeCraftDemo.ts` after the fractured-35 route validation changes.

The latest run is a major improvement. The reported policy-cost model now agrees with Monte Carlo within **0.38%**, reports zero missing policy states and zero fallback actions, audits the suffix pools from data, includes T1 Intelligence in the Harvest census, and attributes recovery Harvest/Annul costs explicitly.

The current recommended route is approximately:

1. Self-fracture 35% Effect.
2. Harvest Reforge Defence until T1 Maximum ES, preserving useful suffix outcomes when they appear.
3. Annul unwanted Harvest suffixes according to continuation value.
4. Use Allflame Exalted suffix slams to complete T1 Intelligence plus one premium suffix.

Current analytical total: **2584.5c (~12.92 div)**.

This is substantially more credible than the prior fractured-35 result, but there are still several remaining issues before treating the route as fully mechanically validated or the optimizer as globally optimal.

---

## 1. Major improvement: the suffix denominators are now auditable and route-specific

The latest output correctly reports the fractured-35 suffix states from the actual pool:

- Full suffix pool: **15,650** weight.
- After T1 Intelligence: **14,450** weight.
- After +4 All Attributes: **14,450** weight.
- After 3% Attack Speed: **14,700** weight.
- After +4% All Resistance: **14,450** weight.

This resolves the previous concern around opaque constants such as `14750` and the averaged `14464.7` denominator.

Keep these values data-derived. Do not regress to hard-coded denominators except as explicit fallback values with diagnostics.

### Reporting clarification

The percentages printed beside the target weights in the suffix-pool audit are **Allflame best-of-four hit probabilities**, not single-Exalt probabilities. For example, T1 Int is 300 / 15,650 ~= 1.92% for one normal weighted roll, but the report shows ~7.45%, which is the four-choice Allflame probability.

Rename fields in the report to make that explicit, for example:

```text
T1 Int Weight:              300
Normal Exalt hit chance:    1.92%
Allflame best-of-4 chance:  7.45%
```

Do the same for premium target weight and combined target weight.

---

## 2. Validation is much stronger, but game-mechanics fidelity is still only partial

The current run reports:

```text
POLICY COST MODEL: VALIDATED
Analytical vs Monte Carlo total cost difference: 0.38%
Missing policy states: 0
Fallback actions: 0
```

This is a strong validation of the implemented policy model.

However, the Harvest model still contains a major mechanics assumption: after fractured 35% Effect plus the guaranteed Defence prefix consumes both prefix slots, the analytical model treats the additional Harvest affixes as an equal 50/50 split between **one extra suffix** and **two extra suffixes**.

That assumption is embedded in expressions such as:

```text
0.5 * one-extra-affix outcomes
+ 0.5 * two-extra-affix outcomes
```

The known Harvest description says the reforge has a 50% chance to roll 3-6 modifiers, but that does not by itself prove that, after fracture/prefix-slot constraints, the resulting legal distribution is exactly 50% one extra suffix and 50% two extra suffixes.

### Required next fidelity check

Instrument the simulator to print the empirical affix-count distribution specifically for:

```text
Fractured 35% prefix
+ Harvest Reforge Defence
+ T1 ES as the guaranteed Defence prefix
```

Report at least:

```text
T1 ES success states with:
  0 additional suffixes: X%
  1 additional suffix:   X%
  2 additional suffixes: X%
```

Then compare that distribution to the analytical assumption. If the simulator itself uses the same 50/50 assumption, this does **not** validate the game mechanic; it only validates model consistency. The source/mechanic still needs independent confirmation.

---

## 3. The Harvest census is now much more useful

The current census correctly includes:

- T1 ES + T1 Intelligence.
- T1 ES + each premium suffix.
- T1 ES + T1 Int + premium suffix.

The latest observed values include roughly:

```text
T1 ES + T1 Int:              2.71%
T1 ES + +4 Attributes:       2.82%
T1 ES + 3% Attack Speed:     2.30%
T1 ES + +4% All Res:         2.76%
T1 ES + Int + Premium:       0.11%
```

This is exactly the information needed for state-aware Harvest continuation decisions.

Keep this census permanently. It should eventually be generalized so the optimizer can emit equivalent target-state census data for arbitrary crafts rather than only Reference Craft A.

---

## 4. Remove or re-scope the stale Harvest stopping-policy comparison

The current output still prints:

```text
Strategy A: Stop Harvest at First T1 ES (Sequential Allflame)
Strategy B: Continue Harvest until T1 ES + 35% Effect
Strategy C: State-Aware Optimal Stopping Policy
```

and the descriptions still talk about acquiring **35% Effect after Harvest**.

That section belongs to the earlier **fractured-Int route**. It is no longer the correct conceptual comparison for the currently recommended **fractured-35 route**, where 35% Effect is already fractured before Harvest begins.

The same problem exists in the `REPRESENTATIVE STATE DECISIONS` section: it audits states such as:

```text
Fractured Int + T1 ES
Fractured Int + T1 ES + 35% Effect
```

while the recommended craft starts from fractured 35% Effect.

This is now misleading even if the numbers are mathematically valid for the old route.

### Replace with recommended-route state audits

For the fractured-35 route, representative decisions should instead include states such as:

```text
Frac 35 + T1 ES + no suffixes
Frac 35 + T1 ES + T1 Int
Frac 35 + T1 ES + premium suffix
Frac 35 + T1 ES + one junk suffix
Frac 35 + T1 ES + T1 Int + one junk suffix
Frac 35 + T1 ES + premium suffix + one junk suffix
Frac 35 + T1 ES + T1 Int + premium suffix
```

For each state, print every legal candidate action that the solver currently supports and its continuation EV.

The report should primarily explain **the route actually selected by the optimizer**. Old-route comparisons can remain in an alternate-route section, but must be labeled as such.

---

## 5. The analytical final-outcome distribution appears stale for the new route

The report still prints the old analytical distribution:

```text
37.38%  +4 All Attributes
29.39%  3% Attack Speed
33.23%  +4% All Resistance
```

while the current Monte Carlo run reports approximately:

```text
37.55%  +4 All Attributes
28.05%  3% Attack Speed
34.40%  +4% All Resistance
```

The difference is not enormous, but the analytical distribution appears to be inherited from the old final-suffix-only model.

The fractured-35 route is different because either target suffix can arrive first, and each completed suffix family changes the eligible pool for the second suffix. Attack Speed also blocks a different total family weight (950) than Attributes or All Resistance (1,200).

Therefore, final branch probabilities should be calculated from the **branch-specific fractured-35 Markov system**, not reused from the old fractured-Int route.

### Why this matters

The three branches have very different sale values:

```text
+4 Attributes:   85 div
3% Attack Speed: 39 div
+4 All Res:       7 div
```

Even a small probability error changes expected sale value and expected profit.

Using the current Monte Carlo branch percentages as a rough check gives a sale EV slightly below the displayed 9112.2c. The analytical sale EV should be recomputed from the new route-specific terminal probabilities and then Monte Carlo should validate those branch probabilities as well as total cost.

### Suggested branch validation gate

Add an outcome-distribution comparison such as:

```text
                         Analytical    Monte Carlo    Abs. diff
+4 Attributes               XX.XX%        XX.XX%       X.XX pp
3% Attack Speed             XX.XX%        XX.XX%       X.XX pp
+4 All Resistance           XX.XX%        XX.XX%       X.XX pp
```

Suggested target: <= 1 percentage point per terminal branch before calling profit EV validated.

---

## 6. Keep the stricter action-count validation gate

The latest implementation adds action-count agreement to validation rather than validating only on total chaos cost. This was necessary because the previous run had compensating errors: total cost was close while Harvest/Annul/Exalt counts were far apart.

Keep this rule.

Recommended validation requirements remain:

```text
Total expected cost difference:
  <= 2% for VALIDATED
  <= 5% for PROVISIONAL

Expected Harvest count difference:
  <= 10%
Expected Annul count difference:
  <= 10%
Expected Exalt count difference:
  <= 10%

Missing policy states:
  0
Fallback actions:
  0
```

The report should print the individual count-difference percentages beside PASS/FAIL so the reader can immediately see why a validation status was assigned.

---

## 7. Stepwise reporting is substantially better

The latest report now distinguishes:

- initial T1 ES acquisition;
- additional Harvests caused by downstream failures;
- initial cleanup Annuls;
- recovery Annuls;
- suffix-slam raw cost;
- suffix-slam recovery cost.

This is much closer to a useful player-facing crafting plan.

One remaining presentation issue is the duplicated Step 1:

```text
STEP 1 -- Starting fracture
STEP 1 -- Acquire Fractured 35% Effect Base
```

Collapse this into a single Step 1 in the recommended-plan output.

---

## 8. Self-fracture acquisition is still approximate

The new self-fracture preparation estimates are more detailed:

```text
35% Effect:
  ~41.7 Alterations
  ~10.4 Augmentations
  Regal
  filler mods
  Fracturing Orb
```

but the output correctly continues to label the self-fracture model `APPROXIMATE`.

Keep that label until the magic-item Alt/Aug generation process and the exact four-mod preparation policy are mechanically validated.

The current ~7.67 div self-fracture estimate should not be presented with the same confidence as a directly observed 13-div market purchase price.

---

## 9. Current interpretation of the fractured-35 route

At this point the fractured-35 route is **credible and promising**:

- suffix pool denominators are now data-derived and audited;
- useful Harvest suffix states are preserved;
- the policy cost model and Monte Carlo total agree within 0.38%;
- missing/fallback policy states are zero;
- recovery costs are visible rather than hidden;
- the model recognizes that T1 Int is acceptable at +6 to +8 with no Divine finishing.

However, the next validation milestone should not be another large feature expansion. Finish the route-specific correctness work first.

### Recommended next work order

1. Replace stale fractured-Int policy-comparison and representative-state sections with fractured-35 route audits.
2. Compute exact analytical terminal branch probabilities for Attributes / Attack Speed / All Res from the fractured-35 Markov system.
3. Recompute expected sale value and expected profit from those route-specific branch probabilities.
4. Add analytical-vs-Monte-Carlo terminal branch validation.
5. Independently validate the Harvest extra-affix-count distribution rather than assuming the current 50/50 one-extra/two-extra split is mechanically exact.
6. Keep action-count validation alongside total-cost validation.
7. Keep self-fracture acquisition explicitly approximate.
8. Do not add unit tests for this work; continue using diagnostics, reference runs, Monte Carlo cross-validation, and hand verification.

---

## Current status recommendation

```text
POLICY COST MODEL:
  VALIDATED FOR THE IMPLEMENTED FRACTURED-35 POLICY

MONTE CARLO CONSISTENCY:
  STRONG

SUFFIX POOL / GROUP BLOCKING MODEL:
  MUCH IMPROVED; DATA-DERIVED

EXPECTED SALE / PROFIT BRANCH MODEL:
  NEEDS ROUTE-SPECIFIC ANALYTICAL RECOMPUTATION

HARVEST AFFIX-COUNT MECHANICS:
  PARTIAL / NEEDS INDEPENDENT VALIDATION

SELF-FRACTURE ACQUISITION:
  APPROXIMATE

BEST OF EVALUATED POLICIES:
  SUPPORTED

GLOBAL OPTIMALITY:
  NOT YET PROVEN
```
