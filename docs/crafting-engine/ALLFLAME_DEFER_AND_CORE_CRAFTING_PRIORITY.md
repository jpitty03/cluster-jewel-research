# Defer Allflame and Prioritize the Core Crafting Engine

## Decision

For the current phase of the crafting optimizer, disable Allflame crafting in the active reference-craft validation path and focus on the ordinary crafting engine first.

Allflame should remain isolated as an optional/plugin mechanic, but it should not influence the primary expected-cost, policy-search, Monte Carlo, or profitability conclusions until its Intangibility behavior is modeled correctly.

The immediate reference-craft configuration should therefore use:

```ts
enableAllflame: false
```

for Craft A and Craft C while the core crafting model is being generalized and validated.

This does **not** mean deleting the Allflame work. It means freezing it as an incomplete seasonal mechanic until the ordinary crafting system is reliable.

---

## Why the Current Allflame Model Is Incomplete

The current optimizer effectively treats an Allflame currency use as a stateless best-of-four craft:

```text
Generate four independent outcomes
        ↓
Choose the outcome with the best continuation value
        ↓
Future Allflame uses have the same four-choice probability
```

That is not sufficient for repeated Allflame use.

Allflame adds **Intangibility** to the item. Based on the observed mechanic:

- the first Allflame use adds approximately 5-10% Intangibility;
- every later Allflame use adds another 5-10%;
- Intangibility accumulates on the item;
- the accumulated Intangibility determines the probability that a future Allflame craft gives only one result instead of four;
- the Intangibility increase happens whether the four-result roll succeeds or fails.

For example, at 50% Intangibility:

```text
50% chance → normal Allflame behavior with four candidate outcomes
50% chance → degraded behavior with only one candidate outcome

After either branch:
  add another 5-10% Intangibility
```

Therefore repeated Allflame crafting becomes progressively worse on the same item.

This makes Allflame a **stateful, path-dependent mechanic**, not merely a multiplier on normal Exalted Orb success probability.

---

## Intangibility Must Be Part of Item State

When Allflame is implemented properly, the item state will need an Intangibility value, conceptually:

```ts
interface ItemState {
  // existing fields...
  intangibility: number;
}
```

Two items with identical explicit modifiers but different Intangibility values cannot share the same continuation value:

```text
[desired prefixes/suffixes, 0% Intangibility]

is NOT equivalent to

[desired prefixes/suffixes, 45% Intangibility]
```

The second item has a substantially worse probability of receiving four options on the next Allflame use.

Therefore Intangibility must eventually be included in:

- state keys;
- Bellman continuation values;
- transition generation;
- Monte Carlo state;
- reporting;
- restart decisions;
- action comparison.

---

## Correct Future Allflame Transition Shape

A future Allflame action should look approximately like this:

```text
Current Intangibility = X%

Probability of 4-choice outcome = 1 - X / 100
Probability of 1-choice outcome = X / 100

Branch A — 4-choice success:
  generate four legal currency outcomes
  select the candidate with the lowest continuation EV

Branch B — degraded 1-choice result:
  generate one legal outcome
  accept that outcome

Both branches:
  increase Intangibility by a random amount in the observed 5-10% range
```

The exact details should be verified before implementation, including:

- whether Intangibility is integer-valued;
- whether the increase is uniformly distributed from 5 through 10;
- whether values cap at 100%;
- exact behavior at or above 100%;
- whether all Allflame currency types use the same Intangibility behavior;
- whether Intangibility survives every relevant recovery action;
- whether any action can remove or reduce Intangibility.

Do not silently approximate these mechanics in the core optimizer.

---

## Why This Creates a New Restart Decision

Once Intangibility is modeled, the optimizer may eventually discover that the best action is to stop using the current item.

For example:

```text
Current item:
  correct fractured mod
  partial target progress
  47% Intangibility

Possible decisions:
  normal Exalted Orb
  Annul/recover
  Harvest
  Allflame again
  restart from starting fractured base
```

The Bellman solver should compare all legal continuation values.

The optimal policy may naturally discover thresholds such as:

```text
Use Allflame at 0-8% Intangibility
Use it again at 8-16%
At 24%+, normal currency is cheaper
At 40%+, restarting is cheaper
```

Those numbers are examples only. The solver should derive the actual thresholds from currency prices, current state, target probabilities, and the correct Intangibility mechanics.

There should be no hard-coded maximum number of Allflame uses unless the game mechanic itself imposes one.

---

# Current Priority: Normal Crafting Methods

Before returning to Allflame, the optimizer should become reliable using ordinary crafting mechanics.

The immediate core action space should focus on:

```text
Alteration
Augmentation
Regal
Scour
Exalted Orb
Orb of Annulment
Harvest reforges
Fracturing Orb
bench/filler crafting where mechanically valid
restart / abandon-current-item decisions
starting-base and starting-fracture comparisons
```

The goal is to prove that the solver can discover efficient routes without depending on a seasonal mechanic.

---

## Craft A Should Be Revalidated Without Allflame

Craft A remains an important regression/reference craft, but previous expected-cost numbers that depended on repeated best-of-four Allflame Exalts should be considered provisional or obsolete.

Run Craft A with:

```ts
enableAllflame: false
```

The optimizer should then determine the best available ordinary-currency route for:

```text
T1 Maximum Energy Shield
35% increased Effect
T1 Intelligence (+6 to +8 accepted)
one premium suffix
```

The purpose is not to preserve the old ~12-13 Divine result. The purpose is to obtain a mechanically trustworthy baseline using ordinary crafting actions.

Validation should continue to require:

- analytical vs Monte Carlo total expected cost agreement;
- Harvest count agreement;
- Annul count agreement;
- Exalt count agreement;
- zero missing policy states;
- zero fallback actions;
- representative state traces;
- explicit reporting of any remaining unverified mechanic assumptions.

---

## Craft C Is Now More Valuable

Craft C should also run without Allflame.

Target:

```text
12-passive ilvl 84 Large Cluster Jewel
Minions deal 10% increased Damage

Required explicit mods:
PREFIX
  T1 Maximum Life (+10)
  35% increased Effect

SUFFIX
  +4 to All Attributes
  +5% Chaos Resistance
```

Craft C is a strong generalization test because all four explicit modifiers are fixed requirements.

The optimizer should compare possible starting fractures such as:

```text
T1 Maximum Life
35% increased Effect
+4 All Attributes
+5% Chaos Resistance
```

and determine the lowest-EV route using normal crafting methods.

The implementation should not add `if (minionCraft)` behavior.

If Craft C exposes a missing capability, generalize the underlying rule/action/search implementation instead.

---

## Recommended Craft C Validation Sequence

### Stage 1 — Downstream-only comparison

Give each fractured starting state the same acquisition cost, preferably 0c for diagnostic purposes.

This answers:

> If the fractured base is already owned, which fractured target mod creates the cheapest remaining craft?

This prevents external market prices from hiding weaknesses in the crafting solver.

### Stage 2 — Full economic comparison

After the downstream solver is working:

- add real purchased-fracture prices;
- add self-fracture estimates where supported;
- add the 160 Divine sale value;
- compare total expected cost, profit, and ROI.

Keep any approximate acquisition models clearly labeled.

---

# Separation Between Core and Seasonal Mechanics

The desired architecture should remain:

```text
Core Crafting Engine
  ├─ normal item state
  ├─ mod eligibility
  ├─ affix limits
  ├─ Alteration / Augmentation / Regal
  ├─ Exalt / Annul / Scour
  ├─ Harvest
  ├─ fracture acquisition
  ├─ expected-cost solver
  ├─ policy search
  └─ Monte Carlo validation

Optional Mechanics / Plugins
  └─ Allflame
       ├─ Intangibility state
       ├─ 4-choice vs 1-choice branch
       ├─ Intangibility accumulation
       ├─ continuation-value selection
       └─ restart threshold interaction
```

Core actions must not depend on Allflame being enabled.

Allflame-specific fields should not leak throughout unrelated rules if they can remain isolated behind plugin/state-extension boundaries.

---

# Immediate Implementation Guidance

## 1. Disable Allflame in active reference-craft demos

Set:

```ts
enableAllflame: false
```

for Craft A and Craft C.

Do not treat Allflame-derived validation status as authoritative while its Intangibility mechanic is incomplete.

## 2. Preserve the plugin code

Do not delete Allflame support unless required for cleanup.

Prefer:

```text
implemented but disabled / incomplete
```

over removing it and rebuilding it later.

## 3. Remove Allflame assumptions from core math

Audit for calculations that assume every Exalt-like action has four independent candidate rolls.

When Allflame is disabled:

```text
normal Exalt probability = target eligible weight / total eligible weight
```

There should be no best-of-four transformation in normal-currency continuation values.

## 4. Re-run Craft A

Expect costs and policy choices to change materially.

Do not attempt to force the old Allflame result to remain competitive.

## 5. Run Craft C

Use Craft C to expose any remaining Craft-A-specific assumptions in:

- Harvest target selection;
- prefix/suffix handling;
- target-group detection;
- fracture choice;
- recovery logic;
- report generation.

## 6. Continue using diagnostics instead of adding unit tests

For this work, validation should continue through diagnostic/reference runs and Monte Carlo cross-validation rather than adding unit-test work.

Useful diagnostics include:

```text
eligible mod pools
blocked groups
normal Exalt hit probabilities
Harvest guaranteed-tag pools
state transitions
representative policy decisions
currency counts
rebuild frequency
starting-fracture comparison
analytical vs Monte Carlo agreement
```

---

# When to Return to Allflame

Allflame should become active again only after the normal crafting engine is sufficiently mature that Craft A and Craft C can both be explained and validated without it.

A reasonable gate is:

```text
Craft A ordinary-currency policy:
  mechanically sensible
  analytical/MC agreement acceptable
  no missing/fallback states

Craft C ordinary-currency policy:
  same generic engine
  no craft-specific solver branch
  mechanically sensible
  analytical/MC agreement acceptable

Core actions:
  Alt/Aug/Regal/Scour/Exalt/Annul/Harvest/restart supported as required
```

Then reopen the Allflame phase.

---

# Future Allflame Validation Requirements

When Allflame is restored, validation should include more than total expected cost.

At minimum report:

```text
Mean Allflame uses per completed craft
Intangibility distribution before each use
4-choice activation rate by Intangibility band
1-choice degradation rate by Intangibility band
Mean ending Intangibility
Restart rate due to excessive Intangibility
Normal Exalt vs Allflame action selection by state
Analytical vs Monte Carlo total cost
Analytical vs Monte Carlo action counts
```

Representative traces should demonstrate situations where the optimizer:

- uses Allflame on a low-Intangibility item;
- chooses normal currency instead on a higher-Intangibility item;
- restarts when continued crafting EV exceeds rebuilding;
- correctly increments Intangibility after both successful and degraded Allflame branches.

---

# Status of Previous Allflame-Based Results

Until the Intangibility mechanic is modeled correctly:

```text
Allflame-derived hit probabilities:       INCOMPLETE
Repeated Allflame continuation values:    INCOMPLETE
Allflame-based expected craft costs:      PROVISIONAL / OBSOLETE FOR DECISION-MAKING
Allflame-based profit estimates:          PROVISIONAL / OBSOLETE FOR DECISION-MAKING
Core mod-pool / state work:               STILL USEFUL
Core Monte Carlo framework:               STILL USEFUL
Core policy-search architecture:          STILL USEFUL
```

The goal is not to discard previous engineering work. The goal is to prevent an incomplete league mechanic from distorting the core crafting model while the architecture is still being generalized.

---

# Final Recommendation

Proceed in this order:

```text
1. Disable Allflame for Craft A and Craft C
2. Stabilize ordinary crafting actions and recovery
3. Revalidate Craft A
4. Generalize and validate Craft C
5. Expand ordinary action support as needed
6. Establish reliable reference-craft baselines
7. Return to Allflame as an optional plugin
8. Add Intangibility to plugin-aware item state
9. Model 4-choice / 1-choice degradation exactly
10. Let the policy solver determine when Allflame, normal currency, or restart is optimal
```

This keeps the current work focused on a trustworthy general-purpose crafting optimizer while preserving Allflame as a valuable later optimization layer rather than allowing an incomplete seasonal mechanic to dominate core solver behavior.
