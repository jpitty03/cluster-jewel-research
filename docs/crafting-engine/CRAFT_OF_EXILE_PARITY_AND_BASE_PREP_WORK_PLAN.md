# Craft of Exile Parity and Base-Prep Work Plan

## Purpose

Use the time while the longer Craft of Exile simulation is running to advance production-search architecture without changing the currently validated Craft A/C policy formulas.

This pass should focus on:

1. preserving external Craft of Exile observations as parity fixtures;
2. introducing a clean resolved-policy artifact for validation;
3. implementing real normal -> magic -> rare base-prep mechanics;
4. making analytical and Monte Carlo transitions share the same mechanics definitions;
5. preserving Craft A/C as regression fixtures.

Do **not** tune probabilities or hardcode constants merely to reproduce Craft of Exile.

---

## External Craft of Exile Reference Data

These are observed reference results only. They are not authoritative constants to hardcode.

### Benchmark 1 — Alteration -> T1 Intelligence

Reference base:
- Large Cluster Jewel
- 12 passives
- ilvl 84
- Attack Damage while holding a Shield
- started as Magic
- target: T1 `Added Small Passive Skills also grant: +# to Intelligence`

Observed runs:

Run A:
- Alterations: 140,488
- Successes: 2,193
- Success rate: 1.560%
- Displayed ratio: ~1 / 65

Run B:
- Alterations: 69,374
- Successes: 1,000
- Success rate: 1.441%
- Displayed ratio: ~1 / 70

Combined:
- Alterations: 209,862
- Successes: 3,193
- Combined observed success rate: ~1.52%
- Combined observed ratio: ~1 / 65.7

The engine should derive Alteration probability from actual eligible pools and magic-item generation mechanics. It should naturally land in the same statistical neighborhood if the model is correct.

### Benchmark 2 — Make and fracture T1 Intelligence

Observed:
- Alterations: 69,374
- T1 Int hits: 1,000
- Regals: 1,000
- Exalts: 1,000
- Fracturing Orbs: 1,000
- Successful T1 Int fractures: 250
- Fracture hit rate: 25.000%

Per successful fractured T1 Int base:
- ~278 Alterations
- 4 Regal Orbs
- 4 Exalted Orbs
- 4 Fracturing Orbs

This should become an external checkpoint for the self-fracture acquisition model.

Do not replace mechanics with the observed values. Implement actual mechanics and compare.

### Benchmark 3 — Harvest Defence -> T1 Maximum Energy Shield from fractured T1 Int

Observed:
- Harvest Defence reforges: 2,907
- T1 Maximum Energy Shield successes: 250
- Success rate: 8.599%
- Ratio: ~1 / 11.63

This is specifically for the fractured-T1-Int starting state and should not be compared blindly to the fractured-35% route probability.

### Longer Benchmark Still Running

A longer Craft of Exile simulation is currently being run to provide Step 6/7/8 evidence for:

- compound Harvest success;
- Annul preservation/recovery;
- final Exalt target hit rates.

Do not modify current Harvest/Annul/Exalt policy formulas merely to anticipate those results.

---

## A. Add External Parity Fixture / Diagnostic

Create a small external-parity data model and diagnostic harness.

Suggested shape:

```ts
interface ExternalParityObservation {
  source: 'craft-of-exile';
  benchmarkId: string;
  action: string;
  attempts: number;
  successes: number;
  observedProbability: number;
  notes?: string;
}
```

Equivalent architecture is fine.

The diagnostic should eventually report:

```text
Benchmark                         Craft of Exile   Analytical   Our Monte Carlo   Difference
Alteration -> T1 Int              1.52%            ?            ?                 ?
Fracture desired mod              25.00%           ?            ?                 ?
Harvest Defence -> T1 ES          8.599%           ?            ?                 ?
```

Requirements:

- Keep the observed sample sizes visible.
- Do not tune/hardcode engine probabilities to match the observations.
- Treat Craft of Exile as independent external evidence, not as the optimizer's strategy source.
- Keep economics separate from mechanics parity.

The Craft of Exile currency prices do not need to match this project's PriceBook.

---

## B. Introduce `ResolvedCraftPolicy` / `ResolvedCraftSolution`

Validation currently knows too much about the original request and solver internals.

Introduce a stable resolved solution artifact containing at least:

```ts
interface ResolvedCraftSolution {
  startingState: ItemState;
  acquisition: AcquisitionOption;
  target: TargetDefinition;
  solverContext: SolverContext;
  policy: /* resolved Bellman policy type */;
  analyticalExpectedCostChaos: number;
  expectedCurrencies: /* existing currency summary type */;
}
```

Equivalent naming/design is fine.

Goals:

- Monte Carlo consumes the resolved solution directly.
- Validation does not reconstruct the selected starting state from `baseRequest.startingStates`.
- Automatically discovered starts validate correctly.
- This becomes a clean backend/service boundary for the future UI.

Do not expose or depend on ad-hoc private optimizer internals where a stable artifact can carry the data instead.

---

## C. Implement Shared Transmutation Mechanics

Current production search needs a real executable normal -> magic step.

Transmutation must:

- be legal only on normal items;
- generate a real magic item with legal affixes;
- use the actual eligible pool for the current base / cluster / item level;
- respect prefix/suffix limits and mod-group exclusions;
- derive analytical transition probabilities from weights;
- sample Monte Carlo outcomes from the same mechanics definition;
- not merely change `rarity: normal` to `rarity: magic`.

Add a seeded runtime diagnostic that compares analytical transition mass to empirical sampled outcomes.

No unit tests.

---

## D. Implement Shared Alteration Mechanics

Alteration is the highest-priority base-prep mechanic because we now have strong external data.

Requirements:

- legal only on magic items;
- reroll the magic item using the real eligible modifier pool;
- correctly model the number/side of magic affixes produced;
- respect item level and exclusion groups;
- analytical transitions and Monte Carlo sampling must originate from the same mechanics implementation;
- canonical successor states must remain mechanically correct.

Add a parity diagnostic for the reference shield cluster:

```text
T1 Intelligence via Alteration
Craft of Exile observed: ~1.52% combined (~1 / 65.7)
Analytical engine:       ?
Monte Carlo engine:      ?
```

Do not force the result to 1.52%.

If the engine disagrees materially, investigate:

- eligible magic pool composition;
- prefix/suffix generation rules;
- affix-count distribution;
- mod weights;
- exclusion groups;
- item-level filtering.

Do not paper over a mismatch with a correction factor.

---

## E. Then Implement Augmentation and Regal

After Transmutation and Alteration are stable, implement:

1. Orb of Augmentation
2. Regal Orb

Each must use the same shared-mechanics pattern:

```ts
interface CraftMechanic {
  id: string;
  actionType: DiscoveredActionType;
  name: string;
  isLegal(...): boolean;
  getCost(...): CraftCost;
  getTransitions(...): TransitionDistribution;
  sampleTransition(...): ItemState;
}
```

Equivalent architecture is fine.

### Augmentation

Must:
- be legal only when the magic item can accept another affix;
- add a legal affix from the eligible weighted pool;
- respect occupied side, mod groups, and item level.

### Regal

Must:
- be legal only on a valid magic item;
- upgrade rarity to rare;
- add one legal rare affix using actual eligibility/weights;
- preserve existing magic affixes.

Do not implement Craft-A-specific or Craft-C-specific branches.

---

## F. Runtime Mechanics Diagnostics — No Unit Tests

For every migrated shared mechanic, add focused seeded diagnostics.

Examples:

### Transmutation
- total analytical probability = 1;
- sampled prefix/suffix outcome frequencies broadly align;
- all generated mods are legal.

### Alteration
- T1 Int analytical probability;
- seeded empirical probability;
- Craft of Exile external observation shown separately.

### Augmentation
- every sampled added mod is legal from the input state;
- analytical weights match sampled frequencies.

### Regal
- rarity becomes rare;
- old affixes are preserved;
- one legal new affix is added.

These diagnostics are not unit tests.

---

## G. Preserve Existing Craft A / Craft C Regression Fixtures

Do not change the validated Craft A/C policy formulas unless a specific mechanics correction requires it.

Keep rerunning A/C after structural mechanics changes.

### Craft A guardrails

Current expected behavior remains approximately:
- analytical total: 7623.7c;
- multi-seed aggregate close to analytical;
- pooled Harvest/Annul/Exalt differences very small;
- missing policy states = 0;
- fallback actions = 0;
- normal-seed timeouts = 0.

### Craft C guardrails

Current expected behavior remains approximately:
- analytical total: 42814.4c;
- multi-seed aggregate close to analytical;
- pooled Harvest <=10%;
- pooled Annul <=10%;
- pooled Exalt <=10%;
- completion >=99%;
- missing policy states = 0;
- fallback actions = 0;
- censoring explicit when present.

Do not tune either fixture to one deterministic Monte Carlo seed.

---

## H. Keep Mechanics Parity and Economics Separate

External Craft of Exile results validate mechanics/action frequencies.

This project's PriceBook controls route economics.

Do not import Craft of Exile prices into the optimizer merely because they appear in its result screen.

Report separately:

```text
MECHANICS PARITY
- success probabilities
- action counts
- state transitions

ECONOMICS
- project PriceBook
- acquisition prices
- lifeforce prices
- expected route cost
```

---

## I. Tighten Price Confidence While Here

Continue the existing price-confidence architecture.

Production/frontend search should eventually default to:

```text
allowResearchFallbackPrices = false
```

Rules:

- real supplied/current price -> `known`;
- research convenience value -> `research-fallback`;
- no usable price -> `unavailable`.

Do not allow unknown currency keys to silently become a legitimate-looking 1c price.

Apply the same confidence concepts to self-fracture acquisition assumptions.

A route depending on fallback economics must not be described as definitively cheapest in production mode.

---

## J. Do Not Reintroduce Allflame

Keep Allflame disabled and deferred.

The ordinary generic crafting engine is the priority.

---

## K. Do Not Build the Frontend Yet

The final UI remains intentionally thin:

```text
User selects:
- base / cluster
- item level
- passive count
- 1–4 desired mods

Frontend -> TargetDefinition
Backend -> automatic starts -> legal actions -> transitions -> search -> economics -> risk
```

Do not put recipe logic into frontend code.

---

## L. No Unit Tests

Do not create or expand unit tests.

Use:

- runtime mechanics diagnostics;
- seeded Monte Carlo;
- external Craft of Exile parity fixtures;
- Craft A/C end-to-end runs;
- canonical-state diagnostics;
- compact output artifacts.

---

## Recommended Implementation Order

1. Add external Craft of Exile parity data/harness.
2. Introduce `ResolvedCraftSolution` / equivalent.
3. Make Monte Carlo consume resolved solution directly.
4. Implement true Transmutation transitions.
5. Implement true Alteration transitions.
6. Add Alteration external-parity diagnostic.
7. Implement Augmentation transitions.
8. Implement Regal transitions.
9. Rerun Craft A/C.
10. Tighten price-confidence behavior where needed.
11. Wait for the longer Craft of Exile simulation before changing Harvest/Annul/Exalt mechanics.
12. After that external data arrives, add those observations to the parity fixture and compare before modifying mechanics.

---

## Completion Report

When this pass is complete, commit code and regenerated outputs to `main` and report:

- commit SHA;
- files changed;
- external parity harness design;
- resolved-policy artifact design;
- Transmutation mechanics status;
- Alteration analytical probability for T1 Int;
- Alteration Monte Carlo probability for T1 Int;
- comparison to Craft of Exile ~1.52% observation;
- Augmentation status;
- Regal status;
- Craft A regression results;
- Craft C regression results;
- price-confidence changes;
- remaining mechanics assumptions.

Do **not** modify Harvest/Annul/Exalt policy formulas solely because the long external simulation is still pending.

The goal of this pass is to make the production search path mechanically executable from a clean base while preserving independent external validation evidence.