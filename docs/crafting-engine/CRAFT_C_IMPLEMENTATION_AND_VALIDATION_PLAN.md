# Craft C — Minion 12-Passive Cluster Implementation & Validation Plan

## Purpose

Add a third reference craft that tests whether the crafting optimizer is genuinely generalized for explicit-mod cluster-jewel crafting rather than being tuned to Reference Craft A.

This is a validation scenario, not a new one-off solver. Craft C must use the same state, action, eligibility, probability, recovery, Monte Carlo, and reporting framework as Craft A.

Do **not** add craft-specific branches such as `if (minionCraft)`. If Craft C exposes a missing capability, generalize the underlying engine so both Craft A and Craft C continue to work.

No unit-test work is required for this phase. Validate through diagnostics, analytical-vs-Monte-Carlo comparison, representative-state audits, and end-to-end reference runs.

---

## Reference Item

```text
Item Class: Jewels
Rarity: Rare
Hypnotic Glimmer
Large Cluster Jewel
--------
[Intangibility|Intangibility]: 22%
--------
Requirements:
Level: 67
--------
Item Level: 84
--------
Adds 12 Passive Skills (enchant)
2 Added Passive Skills are Jewel Sockets (enchant)
Added Small Passive Skills grant: Minions deal 10% increased Damage (enchant)
--------
Added Small Passive Skills also grant: +4 to All Attributes
Added Small Passive Skills also grant: +5% to Chaos Resistance
Added Small Passive Skills also grant: +10 to Maximum Life
Added Small Passive Skills have 35% increased Effect
--------
Place into an allocated Large Jewel Socket on the Passive Skill Tree. Added passives do not interact with jewel radiuses. Right click to remove from the Socket.
--------
Note: ~b/o 160 divine
```

## Target Definition

Base:

- `Large Cluster Jewel`
- 12 passives
- ilvl 84
- cluster enchant: `Minions deal 10% increased Damage`

Required final explicit modifiers:

### Prefixes

1. T1 Maximum Life (`+10 to Maximum Life`)
2. T1 35% Increased Effect

### Suffixes

3. T1 `+4 to All Attributes`
4. T1 `+5% to Chaos Resistance`

Unlike Craft A, this craft has one exact terminal mod combination rather than a one-of-many premium suffix outcome.

The 160-divine price is the finished-item market value. For the first generalized-engine validation, optimization should focus on **minimum expected crafting cost to reach the exact target**. Sale price should be added afterward for expected profit / ROI reporting.

---

## Why Craft C Is Important

Craft A has a highly specific structure:

```text
Fractured 35% Effect
T1 ES
T1 Intelligence
one of three premium suffixes
```

Craft C changes that structure to:

```text
35% Effect
T1 Maximum Life
+4 All Attributes
+5% Chaos Resistance
```

This tests whether the optimizer is driven by generic mechanics such as:

- target mod groups;
- prefix/suffix capacity;
- mod-group exclusion;
- actual eligible weights;
- Harvest tags;
- fracture protection;
- Annul recovery;
- Allflame candidate evaluation;
- expected continuation value;
- starting-fracture economics;

rather than hard-coded knowledge about ES, Intelligence, or Craft A's premium suffixes.

---

# Phase 1 — Discover and Audit Target Mods

Before changing solver behavior, inspect the existing PoEDB-derived pool for:

```text
Large Cluster Jewel
Minions deal 10% increased Damage
ilvl 84
```

Resolve the exact mod IDs, groups, generation types, tiers, tags, and weights for:

- T1 Maximum Life;
- 35% Increased Effect;
- +4 All Attributes;
- +5% Chaos Resistance.

Do not guess IDs or group names if the data can supply them.

Add a temporary or reusable diagnostic that prints something like:

```text
CRAFT C TARGET MOD AUDIT

T1 Maximum Life
  modId: ...
  modGroup: ...
  genType: Prefix
  weight: ...
  ilvl: ...
  tags: ...

35% Effect
  modId: ...
  modGroup: ...
  genType: Prefix
  weight: ...

+4 All Attributes
  modId: ...
  modGroup: ...
  genType: Suffix
  weight: ...

+5% Chaos Resistance
  modId: ...
  modGroup: ...
  genType: Suffix
  weight: ...
```

Also print the full eligible prefix and suffix pool totals for the Minion cluster at ilvl 84.

### Exit gate

Do not proceed to route evaluation until all four target mods are mechanically identified from the data source.

---

# Phase 2 — Add Craft C to `optimizeCraftDemo.ts`

Add a third reference section after Crafts A and B:

```text
>>> OPTIMIZING REFERENCE CRAFT C: 12-Passive Minion Cluster (ilvl 84)
```

Create the pool:

```ts
const minionPool = ModPool.forCluster(
  repo,
  'Large Cluster Jewel',
  'Minions deal 10% increased Damage'
);
```

Then resolve the four target `Mod` objects from the actual pool.

Define the target with **all four mods in `requiredMods`**. Do not model the finished item as outcome branches unless a later economic use case introduces multiple acceptable terminals.

Conceptually:

```ts
target: {
  requiredMods: [
    { modGroup: LIFE_GROUP, maxTierNumber: 1 },
    { modGroup: 'AfflictionJewelSmallPassivesHaveIncreasedEffect', maxTierNumber: 1 },
    { modGroup: 'AfflictionJewelSmallPassivesGrantAttributes', maxTierNumber: 1 },
    { modGroup: CHAOS_RES_GROUP, maxTierNumber: 1 },
  ],
}
```

Use the actual discovered groups from Phase 1.

---

# Phase 3 — Starting-Fracture Comparison

Craft C should initially compare all four target mods as possible starting fractures:

1. Fractured T1 Maximum Life
2. Fractured 35% Effect
3. Fractured +4 All Attributes
4. Fractured +5% Chaos Resistance

Create one `ItemState` for each fractured starting condition.

Example structure:

```ts
const fracLifeState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(t1Life, { isFractured: true })],
  suffixes: [],
  fracturedModIds: [t1Life.modId],
};
```

Do the corresponding construction for Effect, Attributes, and Chaos Resistance.

## Stage A — Downstream-only comparison

For the first run, set all four starting-state base costs equal, preferably `0`.

Purpose:

> If the fractured base were already owned, which target fracture produces the cheapest expected downstream completion?

This isolates solver quality from market-price assumptions.

Desired output:

```text
STARTING FRACTURE — DOWNSTREAM CRAFT EV

Fractured 35% Effect       X.XXd
Fractured T1 Life          X.XXd
Fractured +4 Attributes    X.XXd
Fractured +5 Chaos Res     X.XXd

Best downstream structure: ...
```

## Stage B — Full economic comparison

Only after downstream behavior is sensible, add:

- market buy prices for each fractured base;
- self-fracture expected acquisition cost for each target mod;
- finished sale value: 160 divine.

Then compare:

```text
                               Acquire      Downstream      Total EV
Buy fractured 35%               Xd             Xd             Xd
Self-fracture 35%                Xd             Xd             Xd
Buy fractured Life              Xd             Xd             Xd
Self-fracture Life               Xd             Xd             Xd
Buy fractured Attributes        Xd             Xd             Xd
Self-fracture Attributes         Xd             Xd             Xd
Buy fractured Chaos Res         Xd             Xd             Xd
Self-fracture Chaos Res          Xd             Xd             Xd
```

Do not invent market prices. Use actual prices when available, otherwise mark acquisition inputs as unknown / placeholder and keep the downstream-only result authoritative.

---

# Phase 4 — Generalized Harvest Action Discovery

Craft C must not assume that the correct Harvest action is `Reforge Defence`.

The engine should determine which required modifier is Harvest-targetable and compare the relevant legal actions based on target tags and continuation EV.

For example, T1 Maximum Life is likely a candidate for a Life-tagged Harvest route, but this must be determined from the scraped mod tags and horticrafting data rather than hard-coded for this specific item.

The generalized logic should answer questions such as:

```text
Which missing target mods can the selected Harvest reforge influence?
What is the guaranteed-tag eligible pool?
What is the probability of the desired tier?
What useful incidental target states can appear alongside it?
Should the solver stop, clean, preserve, Exalt, or Harvest again?
```

If Craft C currently fails because the engine only knows `HARVEST_DEFENCE`, that is evidence that Harvest action representation must be generalized.

Do **not** solve that by adding `HARVEST_LIFE_FOR_CRAFT_C` as a one-off path. Introduce a generic tagged-Harvest action or equivalent abstraction.

---

# Phase 5 — Generic State-Aware Policy Validation

For each starting fracture, the policy should compare legal state transitions rather than follow a pre-scripted recipe.

Representative states should include at least:

```text
Fractured 35 + T1 Life
Fractured 35 + T1 Life + Attributes
Fractured 35 + T1 Life + Chaos Res
Fractured 35 + Attributes
Fractured Life + 35
Fractured Attributes + T1 Life
Fractured Chaos Res + T1 Life
Target mod + one junk affix
Target mod + two junk affixes where legal
Full target
```

For each state print:

- legal candidate actions;
- continuation EV of each action;
- chosen action;
- reason;
- blocked mod groups / remaining eligible weights when relevant.

The goal is to detect hidden Craft-A assumptions such as:

- `hasT1ES` as a universal progression gate;
- Intelligence-specific suffix handling;
- premium-suffix special casing;
- assuming 35% must be fractured;
- hard-coded prefix/suffix target weights.

---

# Phase 6 — Monte Carlo Cross-Validation

Enable Monte Carlo validation for Craft C with the same standard currently used for Craft A.

Initial run:

```ts
runMonteCarloValidation: true,
monteCarloTrials: 2000,
```

Validation should include:

```text
Analytical total expected cost
Monte Carlo mean total cost
Difference %

Analytical Harvest count
Monte Carlo Harvest count
Difference %

Analytical Annul count
Monte Carlo Annul count
Difference %

Analytical Exalt count
Monte Carlo Exalt count
Difference %

Missing policy states
Fallback actions
Completion rate
Timed-out trials
```

Retain the existing thresholds:

```text
VALIDATED FOR CURRENT IMPLEMENTED MECHANICS
  total cost difference <= 2%
  each modeled action count difference <= 10%
  completion >= 98%
  missing policy states = 0
  fallback actions = 0

PROVISIONAL
  total cost difference <= 5%
  action counts <= 10%
  completion >= 95%
  missing policy states = 0
  fallback actions = 0

Otherwise:
  INVESTIGATION REQUIRED
```

A low total-cost difference alone is not sufficient.

---

# Phase 7 — Preserve Craft A as Regression Reference

Every generic engine change made for Craft C must run Craft A again.

Expected workflow:

```text
Craft A — must continue to validate
Craft B — retain current status
Craft C — new generalized explicit-mod validation
```

Do not accept a Craft C fix that causes Craft A to regress materially.

Craft A remains the baseline regression scenario for:

- fractured-35 route;
- Defence Harvest;
- flexible premium suffix outcome branches;
- state-aware recovery;
- Allflame best-of-four selection;
- analytical / Monte Carlo agreement.

Craft C becomes the second explicit-mod reference for:

- different cluster enchant;
- Life instead of ES;
- exact four-mod terminal state;
- two mandatory suffixes;
- potentially different optimal starting fracture;
- generalized tagged-Harvest support.

---

# Phase 8 — Reporting Requirements

Craft C output should be clearly separated from Craft A and should not reuse Craft-A-specific labels.

Target report shape:

```text
REFERENCE CRAFT C — 12-PASSIVE MINION CLUSTER

TARGET
  T1 Maximum Life
  35% Effect
  +4 All Attributes
  +5% Chaos Resistance

STARTING FRACTURE — DOWNSTREAM EV
  35% Effect             Xd
  T1 Life                Xd
  +4 Attributes          Xd
  +5 Chaos Res           Xd

RECOMMENDED STARTING FRACTURE
  ...

RECOMMENDED POLICY
  Step 1 ...
  Step 2 ...
  Step 3 ...

EXPECTED DOWNSTREAM CRAFT COST
  Xd

ACQUISITION OPTIONS
  ...

EXPECTED FULL CRAFT COST
  Xd

SALE VALUE
  160d

EXPECTED PROFIT
  Xd

ROI
  X%

ANALYTICAL VS MONTE CARLO
  ...

REPRESENTATIVE STATE AUDIT
  ...
```

If any mechanic used in Craft C remains assumed rather than externally validated, print it explicitly, e.g.:

```text
GAME-MECHANICS FIDELITY: PARTIAL
HARVEST AFFIX-COUNT MODEL: UNVERIFIED ASSUMPTION
SELF-FRACTURE ACQUISITION MODEL: APPROXIMATE
```

---

# Failure Modes That Are Useful Findings

The first Craft C run is allowed to fail.

Useful failures include:

- `Unhandled State`;
- `Infinity` continuation cost;
- missing Life Harvest action;
- wrong target mod-group matching;
- incorrect affix-capacity handling;
- wrong eligible-weight denominator;
- choosing a non-target or blocked group;
- Craft A-specific reporting appearing in Craft C;
- failure to compare all four starting fractures;
- analytical / Monte Carlo action counts diverging;
- Monte Carlo fallbacks;
- Craft A regression after generic changes.

Each failure should be treated as evidence of a missing **generic** capability.

---

# Guardrails

1. Do not hard-code the winning starting fracture.
2. Do not assume 35% Effect is best because it won Craft A.
3. Do not hard-code Life probabilities from manual arithmetic; derive eligible pools.
4. Do not add Minion-specific solver branches.
5. Do not use display percentages as probability invariants.
6. Do not suppress legal Harvest actions after a useful target mod appears.
7. Preserve useful incidental target mods from Harvest when continuation EV says to keep them.
8. Recalculate eligible weights after every mod-group block.
9. Allflame remains a removable plugin, not a core assumption.
10. Keep self-fracture acquisition labeled approximate until its preparation mechanics are validated.
11. Do not use the 160d sale value to bias the first downstream-only route comparison.
12. Do not add unit tests for this work unless explicitly requested later.

---

# Definition of Success

Craft C is considered a successful generalized-engine validation when:

1. All four target mods are discovered from actual data.
2. All four starting fractures can be evaluated without craft-specific solver logic.
3. The engine selects a minimum-EV downstream route itself.
4. Tagged Harvest behavior is generic rather than Defence-only if Craft C requires another tag.
5. Representative states have sensible legal-action comparisons.
6. No missing policy states or fallbacks occur in Monte Carlo.
7. Analytical and Monte Carlo total cost and action counts meet validation thresholds.
8. Craft A continues to meet its existing regression thresholds.
9. The output clearly distinguishes implemented-mechanics validation from game-mechanics fidelity.
10. Full economic comparison is only declared authoritative once starting-base acquisition inputs are real or explicitly marked approximate.

If both Craft A and Craft C validate through the same generic explicit-mod engine, the next major test should be the three-notable Cold cluster, because that introduces a substantially different crafting/search space rather than another variation of the same explicit-mod pattern.
