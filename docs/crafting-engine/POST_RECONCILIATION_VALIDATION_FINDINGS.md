# Post-Reconciliation Validation Findings

Reviewed implementation commit: `f551961c1206b4d92d04c8220a76d99f80c148a7`

Reviewed outputs:

- `output-craft-a-review.txt`
- `output-craft-c-review.txt`

## Executive Summary

This iteration is a major validation improvement.

Craft A is now **validated for the currently implemented mechanics**: analytical and Monte Carlo total cost agree within **1.97%**, with zero missing policy states and zero fallback actions.

Craft C is now **provisionally validated for the currently implemented mechanics**: analytical and Monte Carlo total cost agree within **3.20%**, action-count differences are all below 10%, all 2,000 Monte Carlo trials completed, and there were zero timeouts, missing policy states, or fallback actions.

The previous large model-consistency problems are therefore substantially resolved. The next phase should **not** be another large solver rewrite. The remaining work is mostly:

1. mechanics-fidelity validation,
2. acquisition-reporting correctness,
3. self-fracture model fidelity,
4. risk/distribution reporting,
5. small reporting cleanup.

Do not confuse analytical-vs-Monte-Carlo agreement with proof that the modeled Path of Exile mechanics are correct. Both models still share some assumptions.

---

## 1. Craft A — Current Result

Current analytical result:

- Expected total cost: **7623.7c (~38.12 div)**
- Expected sale value: **8790.7c (~43.95 div)**
- Expected profit: **1167.0c (~5.83 div)**
- Expected ROI: **15.31%**

Validation status reported by the engine:

- Total analytical-vs-Monte-Carlo difference: **1.97%**
- Missing policy states: **0**
- Fallback actions: **0**
- Status: **VALIDATED FOR CURRENT IMPLEMENTED MECHANICS**

The representative-state decisions are now internally consistent: the recommended action is the lower-EV candidate in the audited states, and the reason text uses the same candidate values.

The target-aware reporting is also materially improved. Craft A correctly reports the active Harvest target (`Glowing`) and the actual target suffixes rather than stale Craft C or Allflame terminology.

### Conclusion for Craft A

The **model-consistency gate is passed** for the currently implemented normal-crafting policy.

Do not spend another iteration broadly changing Craft A's Bellman solver unless a mechanics-fidelity audit proves a shared assumption is wrong.

---

## 2. Craft C — Current Result

Current analytical result:

- Expected total cost: **42814.4c (~214.07 div)**
- Sale value: **32000c (160 div)**
- Expected profit: **-10814.4c (~-54.07 div)**
- Expected ROI: **-25.26%**

Monte Carlo:

- Mean cost: **41446.3c (~207.23 div)**
- Total cost difference: **3.20%**
- Harvest count difference: **5.37%**
- Annul count difference: **4.54%**
- Exalt count difference: **3.13%**
- Completed trials: **2000 / 2000 (100%)**
- Timed out trials: **0**
- Missing policy states: **0**
- Fallback actions: **0**

This passes the project's provisional model-consistency gate.

The previous timeout-censoring concern is resolved for this run. With a 75,000-step cap:

- Average completed trial: **6,690 steps**
- Maximum observed completed trial: **48,255 steps**
- Trials over 5,000 steps: **48.90%**
- Trials over 10,000 steps: **22.70%**
- Trials over 20,000 steps: **5.10%**
- Timed out: **0**

### Important economic conclusion

Do **not** alter the solver merely because Craft C is currently unprofitable.

Under the currently modeled ordinary-currency action set, the expected-value result is legitimately negative. That is a useful optimizer result.

Only introduce a cheaper route if it comes from a legitimate additional crafting action or a corrected game-mechanics assumption.

---

## 3. Craft C Has a Very Heavy Cost Tail — Add Risk Reporting

Craft C's Monte Carlo distribution is economically important:

- P50: **30479.3c (~152.40 div)**
- P75: **56849.2c (~284.25 div)**
- P90: **92018.5c (~460.09 div)**
- P95: **122759.2c (~613.80 div)**
- Mean: **41446.3c (~207.23 div)**
- Sale value: **32000c (160 div)**

This means the median craft is near/below the sale value, while the expected craft is substantially unprofitable because rare long recovery chains dominate the mean.

That distinction matters for a profit-crafting optimizer.

Add distribution-aware economics to Monte Carlo reporting where a sale value exists:

- probability `craftCost < saleValue`,
- probability of positive realized profit,
- median realized profit,
- P75/P90/P95 craft cost,
- optionally expected shortfall / CVaR for expensive tail outcomes.

Do **not** replace expected cost/profit with median cost/profit. Expected value remains the primary risk-neutral optimization objective. These metrics are additional bankroll/risk information.

---

## 4. Acquisition Semantics Are Improved, but Craft A Reporting Is Still Wrong

The explicit acquisition structure is the correct architectural change:

```ts
acquisition: {
  type: 'market' | 'self-fracture' | 'clean-base',
  costChaos: number,
  confidence: 'deterministic' | 'approximate'
}
```

However, the Craft A report still says:

> `Market purchase: unavailable / not supplied`

for the selected fractured-35 route.

That is false for the supplied Craft A configuration. The demo explicitly includes:

- Self-fracture 35% Effect: **1533.4c**
- Buy fractured 35% Effect: **2600c**
- Self-fracture T1 Intelligence: **1542.3c**
- Buy fractured T1 Intelligence: **1600c**

The report appears to be looking only at the selected strategy's acquisition object rather than grouping equivalent starting item states / fractured targets across all supplied starting options.

### Required fix

Build acquisition comparison from the complete evaluated starting-option set.

For each equivalent starting fractured target, show all supplied acquisition methods, e.g.:

```text
Fractured 35% Effect
  Self-fracture: 1533.4c
  Market:        2600.0c

Fractured T1 Intelligence
  Self-fracture: 1542.3c
  Market:        1600.0c
```

Then compare **full-route EV**, not acquisition cost alone.

Only print `Market purchase: not supplied` when there truly is no market acquisition option for that equivalent starting state.

---

## 5. Craft C Acquisition Breakdown Contains an Internal Inconsistency

Craft C selects the fractured 35% Effect (`Powerful`) route and reports:

- Expected self-fracture total: **1533.4c**
- Preparation sub-plan: **12.85c per attempt**

But the configured fractured-35% route uses approximately **14.35c / 14.36c** preparation per attempt. The **12.85c** preparation figure belongs to the T1 Life self-fracture calculation.

The total remains 1533.4c, so the displayed breakdown and the actual total are being sourced from different route-specific data.

### Required fix

Do not reconstruct self-fracture detail from generic assumptions after strategy selection.

Carry the calculated acquisition breakdown with the acquisition option itself, for example:

```ts
acquisition: {
  type: 'self-fracture',
  costChaos: 1533.4,
  confidence: 'approximate',
  breakdown: {
    cleanBaseChaos: ...,
    preparationChaos: ...,
    fracturingOrbChaos: ...,
    successChance: 0.25,
    expectedAttempts: 4
  }
}
```

or derive it once from the exact target fracture and reuse the same result everywhere.

The headline total, Step 1, acquisition comparison, and detailed sub-plan must all come from one acquisition-result object.

---

## 6. Sale-Value Propagation Is Fixed

Craft C now consistently reports the configured 160-divine sale value in:

- Strategy A,
- Strategy B,
- Strategy C,
- final terminal outcome,
- expected profit,
- ROI.

This fixes the previous zero-sale-value strategy-comparison bug.

Preserve this behavior.

---

## 7. Timeout Diagnostics Are Now Useful

The new timeout diagnostics are a good addition and should remain.

Craft C's 75,000-step limit produced zero timeouts while still showing that a meaningful share of trials are very long.

Do not blindly raise the limit further unless a future craft again shows censoring.

For future validation:

- zero timeouts: normal mean is acceptable;
- nonzero timeouts: mark MC mean as potentially censored and report partial timeout costs;
- do not declare a model validated if meaningful timeout censoring remains unexplained.

---

## 8. Mechanics Fidelity Is Now the Main Correctness Risk

The reports correctly distinguish:

- `POLICY COST MODEL` validation,
- `GAME-MECHANICS FIDELITY: PARTIAL`,
- `BEST OF EVALUATED POLICIES: PROVEN`,
- `GLOBAL OPTIMALITY: NOT YET PROVEN`.

Keep those distinctions.

The most important shared-model assumption still visible is Harvest affix count generation:

- 50% chance of one additional affix,
- 50% chance of two additional affixes.

Monte Carlo matching analytical results does **not** validate this because both implementations use the same assumption.

### Next mechanics-fidelity priority

Before broadening the crafting action space, independently verify the Harvest reforge affix-count model against authoritative game data or reproducible empirical data.

If the 50/50 model is not mechanically accurate, update the transition model and then rerun both Craft A and Craft C.

Do not tune probabilities merely to preserve the current validated totals.

---

## 9. Self-Fracture Acquisition Remains Approximate

The self-fracture preparation model is still explicitly approximate.

That is acceptable for now because it is labeled, but it means a 5-10c difference between two self-fracture routes should not be treated as a high-confidence strategic conclusion.

Before using self-fracture acquisition to rank close market/profit opportunities, mechanically validate:

- Alteration target acquisition,
- magic-item prefix/suffix generation behavior,
- Augmentation usage probability,
- Regal transition,
- filler/bench route to exactly four explicit mods,
- expected lost bases/currency per successful fracture.

Keep acquisition uncertainty separate from downstream-crafting validation.

---

## 10. Reporting Polish — Human-Readable Mod Names

Target-driven reporting is now correct but still uses internal affix names such as:

- `Glowing`,
- `Sanguine`,
- `of the Prodigy`,
- `of the Meteor`,
- `of Eviction`,
- `Powerful`.

For user-facing reports, prefer combined labels such as:

```text
T1 Maximum Energy Shield [Glowing]
T1 Maximum Life [Sanguine]
T1 Intelligence [of the Prodigy]
+4 All Attributes [of the Meteor]
+5% Chaos Resistance [of Eviction]
35% Increased Effect [Powerful]
```

This is a lower priority than mechanics fidelity and acquisition correctness.

---

## 11. What Should Not Be Changed Next

Do not:

- reintroduce Allflame,
- expand Craft B yet,
- add another reference craft,
- add unit tests,
- replace expected-value optimization with median optimization,
- rewrite the now-consistent Bellman solver without a concrete mechanics reason,
- force Craft C to become profitable,
- claim global optimality.

The generalized core solver is finally reaching acceptable model consistency. Preserve that progress.

---

## Recommended Next Pass

Priority order:

1. Fix acquisition grouping/reporting so supplied market routes are recognized.
2. Fix the Craft C self-fracture breakdown mismatch.
3. Add probability-of-profit / cost-distribution metrics to MC reporting.
4. Independently validate Harvest reforge affix-count mechanics.
5. Improve human-readable target labels.
6. Rerun Craft A and Craft C and confirm existing model-consistency gates remain passed.
7. Only after mechanics fidelity is acceptable should broader action-space work resume.

---

## Validation Gates for the Next Run

### Craft A

Must remain:

- total analytical-vs-MC difference <= 2%, or explain any regression,
- action-count differences <= 10%,
- missing policy states = 0,
- fallback actions = 0,
- no min-EV recommendation violations.

### Craft C

Must remain at least provisionally valid:

- total analytical-vs-MC difference <= 5%,
- Harvest/Annul/Exalt differences <= 10%,
- completion >= 99%,
- zero unexplained timeout censoring,
- missing policy states = 0,
- fallback actions = 0,
- no min-EV recommendation violations.

### Both

Also require:

- no invented market acquisition values,
- one source of truth for acquisition cost + breakdown,
- sale values propagated consistently,
- mechanics assumptions explicitly labeled,
- Allflame remains disabled/deferred.

## Bottom Line

The analytical and Monte Carlo implementations are now close enough that the project should transition from **solver-consistency debugging** toward **mechanics-fidelity validation and economic/risk reporting**.

Craft A is validated for the currently implemented mechanics. Craft C is provisionally validated and its negative expected profit should be treated as a legitimate current result rather than a bug.
