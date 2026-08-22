# Post Risk-Reporting & Validation Stability Review

Reviewed `main` after implementation commit:

`e212c7ee93773ba74478b97e5245ba5fe3e5969d` — **Fix acquisition grouping, single-source breakdowns, profit risk metrics, and mod display names**

Reviewed outputs:

- `output-craft-a-review.txt`
- `output-craft-c-review.txt`

## Executive summary

This pass is a meaningful improvement and should be preserved.

The acquisition/reporting issues from the previous review are largely fixed:

- Craft A correctly groups the supplied self-fracture and market-purchase routes for the same fractured 35% starting state.
- Craft C no longer invents an unsupplied market purchase.
- The selected Craft C fractured-35 acquisition breakdown now uses the correct `14.35c` preparation cost rather than the Life-fracture preparation cost.
- User-facing mod names are substantially clearer.
- Monte Carlo risk metrics now expose the heavy right tail that expected-value-only reporting hid.

The core analytical/Monte Carlo agreement also remains healthy:

### Craft A

- Analytical total: **7623.7c (~38.12d)**
- Monte Carlo mean: **7488.0c (~37.44d)**
- Total difference: **1.78%**
- Harvest count difference: **2.34%**
- Annul difference: **2.04%**
- Exalt difference: **1.67%**
- Missing policy states: **0**
- Fallback actions: **0**
- Completion: **2000/2000**
- Terminal outcome differences: all within about **1 percentage point**

Craft A remains **validated for the currently implemented mechanics**.

### Craft C

- Analytical total: **42814.4c (~214.07d)**
- Monte Carlo mean: **40716.1c (~203.58d)**
- Total difference: **4.90%**
- Harvest count difference: **7.12%**
- Annul difference: **2.68%**
- Exalt difference: **1.37%**
- Missing policy states: **0**
- Fallback actions: **0**
- Completion: **2000/2000**
- Timeouts: **0**

Craft C remains **provisionally validated for the currently implemented mechanics**, but 4.90% is very close to the provisional 5% gate and the cost distribution is extremely heavy-tailed. A single 2,000-trial Monte Carlo run is not strong enough to claim that 4.90% is a stable estimate.

---

# Findings

## 1. PASS — acquisition grouping is now materially correct

Craft A now correctly reports the two supplied ways of acquiring the same fractured 35% starting state:

- Self-fracture: **1533.4c**
- Market purchase: **2600.0c**
- Downstream crafting EV: **6090.3c**
- Full self-fracture route: **7623.7c**
- Full market route: **8690.3c**

This fixes the previous bug where the selected route was incorrectly treated as evidence that no market option existed.

Craft C also correctly reports market purchase as **not supplied / unavailable** rather than manufacturing a market price.

Preserve this explicit acquisition model.

## 2. PASS — self-fracture breakdown is now single-source and route-consistent

For the selected fractured 35% Effect route, the report now uses:

- clean base: 10c
- preparation: 14.35c
- Fracturing Orb: 359c
- success chance: 25%
- expected attempts: 4
- total: 1533.4c

This is internally consistent.

Do not return to reconstructing acquisition details independently inside reporting.

## 3. PASS — Craft A model agreement is now strong

Craft A is the strongest reference validation currently in the project.

Analytical vs MC:

- total cost: **1.78%**
- Harvests: **2.34%**
- Annuls: **2.04%**
- Exalts: **1.67%**

Terminal outcome validation is also strong:

- Attributes: analytical 35.38%, MC 35.50%
- Attack Speed: analytical 29.23%, MC 28.25%
- All Resistance: analytical 35.38%, MC 36.25%

This is now good evidence that the analytical transition graph and Monte Carlo simulator are implementing the same current policy/mechanics for Craft A.

Do not broadly rewrite this solver path without a specific mechanics reason.

## 4. PASS / CAUTION — Craft C is inside provisional gates, but the MC mean is statistically fragile

Craft C reaches:

- total diff: **4.90%**
- Harvest diff: **7.12%**
- Annul diff: **2.68%**
- Exalt diff: **1.37%**
- 100% completion
- 0 timeouts

That passes the current provisional gate.

However, Craft C is highly right-skewed:

- P50: **140.60d**
- P75: **273.16d**
- P90: **460.40d**
- P95: **624.01d**
- CVaR95: **809.38d**

With this tail shape, the sample mean from only 2,000 trials can move materially between runs. The previous run was ~3.20% different; this run is 4.90% different without a mechanics change that should explain a large shift.

Therefore the next validation improvement should be **Monte Carlo uncertainty reporting**, not tuning the analytical model to the latest random mean.

Recommended additions:

- deterministic optional RNG seed;
- sample standard deviation of total cost;
- standard error of the mean;
- 95% confidence interval for mean cost;
- optionally 3 repeated seeds or a larger validation run for heavy-tail crafts.

For a heavy-tail craft, validation should consider whether the analytical expected cost lies inside a reasonable Monte Carlo confidence interval, not only a raw point-estimate percentage difference.

Do not tune policy equations to force 4.90% toward zero based on one random run.

## 5. BUG — Craft A risk report mixes branch-specific sale values with a single 17000c sale-value header

Craft A has three terminal outcomes with different sale values:

- Attributes: 17000c
- Attack Speed: 7800c
- All Resistance: 1400c

The simulator correctly computes each completed trial's profit using the matched outcome branch sale value.

That means the reported:

- profitable-trial count / probability;
- median realized profit;

can be branch-aware.

However, the risk report header currently says:

`PROFIT & RISK DISTRIBUTION METRICS (SALE VALUE: 17000.0c (~85.00 div))`

and then converts cost percentiles into "Realized" profit by subtracting those percentile costs from **17000c**.

For Craft A this is not valid because a P75-cost trial could finish in any of the three sale branches. Cost percentile and sale outcome are not interchangeable, and the first branch's sale value must not be treated as the sale value for all trials.

Examples currently shown such as:

- P75 cost -> `Realized: +7014.5c`
- P90 cost -> `Realized: +1402.9c`
- P95 cost -> `Realized: -1863.7c`

are not valid realized-profit percentiles for a mixed-outcome craft.

### Required fix

For outcome-branch crafts, maintain a `completedProfits[]` distribution using the actual branch sale value per trial and derive profit statistics directly from that array.

Report something like:

- Profit probability
- Median realized profit (P50 profit)
- P25 realized profit
- P10 realized profit
- P5 realized profit
- Expected realized profit

Cost percentiles may still be reported separately, but do **not** derive mixed-branch realized profit by subtracting cost percentile from one branch's sale value.

Header should become something like:

`PROFIT & RISK DISTRIBUTION METRICS (BRANCH-SPECIFIC SALE VALUES)`

For exact-target Craft C, the current fixed-sale-value presentation is valid because every terminal success is worth 32000c.

## 6. PASS — Craft C risk report exposes the important economic reality

Craft C currently reports:

- sale: 160d
- median craft cost: ~140.60d
- probability profitable: **54.60%**
- median realized profit: **+19.52d**
- analytical expected cost: ~214.07d
- MC mean cost: ~203.58d
- expected value: negative
- CVaR95: ~809.38d

This is exactly the kind of result the eventual UI should expose.

It demonstrates that:

> A craft can win more than half the time and have a positive median profit while still being negative expected value because rare recovery chains are extremely expensive.

Keep expected value as the primary optimization objective, but retain these risk metrics for bankroll / user decision support.

## 7. PASS — display-name improvements are useful, but do not hardcode the final UI vocabulary into the solver

The new labels are much easier to understand:

- 35% Increased Effect [Powerful]
- T1 Maximum Energy Shield [Glowing]
- T1 Maximum Life [Sanguine]
- T1 Intelligence [of the Prodigy]
- +4 to all Attributes [of the Meteor]
- +5% to Chaos Resistance [of Eviction]

This is good reporting/UI behavior.

However, `formatModDisplayName` currently contains explicit mappings for known reference mods. That is acceptable as temporary presentation cleanup, but it should not become the long-term mechanism for arbitrary user-selected mods.

For the eventual 1–4-mod UI, display labels need to come generically from scraped stat text / stat values / tier metadata, with internal affix name appended for auditability.

Do not add one `if (...) return ...` mapping per newly supported mod.

## 8. IMPORTANT ARCHITECTURAL NEXT STEP — move from supplied candidate routes toward automatic candidate generation

The long-term product goal is:

> user selects any 1–4 mods and the optimizer discovers the least-expensive crafting route.

The current reference demos still supply starting fracture states manually.

That is fine for validation, but the next major engine milestone should begin separating **reference-fixture setup** from **production strategy discovery**.

The production path should eventually look like:

1. Normalize the user's selected 1–4 `ModRequirement`s.
2. Generate candidate starting states automatically:
   - clean base;
   - market fractured target mods when prices exist;
   - self-fractured target mods when mechanically possible;
   - later any strategically useful non-target starts if justified.
3. Enumerate legal actions from each state.
4. Use the generic policy solver to minimize expected cost to the same target.
5. Rank complete routes.

Do **not** create separate 1-mod, 2-mod, 3-mod, and 4-mod solvers.

The same `TargetDefinition` + state/action engine should handle all target sizes.

## 9. IMPORTANT ARCHITECTURAL NEXT STEP — generic action discovery should become the next core focus after current validation cleanup

The current engine is strong enough around the existing Harvest / Exalt / Annul policy family to serve as a reference baseline.

Before a frontend is built, the next substantial engine work should be toward a generic interface such as:

```ts
getLegalActions(state, target, context): CraftAction[]
```

and state-transition evaluation for ordinary crafting methods such as:

- Alteration
- Augmentation
- Regal
- Scour
- Exalt
- Annul
- Harvest
- Fracturing
- bench/filler actions
- restart

The optimizer should discover which are useful from the state, rather than the reference craft selecting a route family in advance.

Allflame should remain disabled/deferred until the normal-core action system is mature.

## 10. Mechanics fidelity remains PARTIAL

Do not upgrade `GAME-MECHANICS FIDELITY` yet.

Shared assumptions still include at least:

- Harvest additional-affix generation modeled as 50% one extra / 50% two extra;
- self-fracture Alt/Aug/Regal/bench preparation remains approximate;
- not all ordinary crafting methods are yet represented in automatic action discovery;
- Allflame remains deferred.

Analytical/MC agreement proves internal consistency for the implemented mechanics, not that those mechanics perfectly match the game.

---

# Recommended next implementation pass

Keep the next pass narrow. Do not perform another solver rewrite.

Priority order:

1. **Fix mixed-outcome risk metrics for Craft A.**
   - branch-specific sale-value header;
   - calculate profit percentiles from actual completed profit samples;
   - never subtract a cost percentile from the first outcome branch's sale value.

2. **Add Monte Carlo statistical uncertainty diagnostics.**
   - optional deterministic seed;
   - cost standard deviation;
   - standard error;
   - 95% CI for mean cost;
   - keep completion/timeout diagnostics.

3. **Preserve Craft A validation.**
   - total <=2%;
   - action counts <=10%;
   - outcome branches close;
   - no missing/fallback states.

4. **Keep Craft C provisional and test stability rather than tuning to one run.**
   - total point-estimate <=5% is still useful;
   - action counts <=10%;
   - 100% or >=99% completion;
   - no timeout censoring;
   - use CI/repeated-seed evidence to judge mean stability.

5. **Begin a design/implementation seam for automatic starting-strategy generation.**
   - do not remove manually supplied states from reference demos;
   - add production-facing abstraction separately;
   - generate clean/fractured candidate states from TargetDefinition rather than craft names.

6. **Begin generic action-discovery scaffolding only after the above remains stable.**

Do not yet:

- build the frontend;
- reintroduce Allflame;
- add unit tests;
- claim global optimality;
- add craft-specific solver branches;
- add one-off display mappings for every future mod;
- force Craft C to become profitable.

---

# Validation gates after the next pass

## Craft A

- analytical vs MC total <=2% OR analytical mean inside an appropriately reported MC confidence interval with no mechanics discrepancy;
- Harvest/Annul/Exalt count differences <=10%;
- terminal branch probabilities remain closely aligned;
- 0 missing states;
- 0 fallback actions;
- 0 timeouts;
- mixed-outcome risk metrics use actual branch-specific profits.

## Craft C

- analytical vs MC total remains <=5% as a point-estimate target;
- Harvest/Annul/Exalt count differences <=10%;
- >=99% completion;
- no unexplained timeout censoring;
- report CI/standard error so the heavy-tail MC mean can be interpreted correctly;
- 0 missing states;
- 0 fallback actions.

## Architecture

- reference crafts continue to use the generic solver;
- no new Craft A/C special cases;
- acquisition reporting remains single-source;
- first production-facing automatic starting-strategy abstraction exists or is clearly designed around `TargetDefinition` rather than reference craft identity.

---

# Bottom line

The core optimizer is now in a substantially healthier state.

Craft A is a strong internally validated reference craft. Craft C is a useful heavy-tail reference craft and is within the provisional validation gate, but its Monte Carlo mean needs uncertainty/stability reporting before treating a 4.90% point-estimate difference as especially meaningful.

The main concrete bug in this pass is the mixed-outcome Craft A risk presentation: branch-specific profit samples are available, but the report still uses the first 17000c branch as if it were a universal sale value when converting cost percentiles to "realized" profit.

After fixing that and adding MC uncertainty diagnostics, the project should begin shifting effort from hand-supplied reference routes toward **automatic starting-strategy generation and generic legal-action discovery**, because those are the key remaining architectural steps toward the end goal of a UI where a user selects any 1–4 mods and the engine discovers the cheapest craft automatically.
