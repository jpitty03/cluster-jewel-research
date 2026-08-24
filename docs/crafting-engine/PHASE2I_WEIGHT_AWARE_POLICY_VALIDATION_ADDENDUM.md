# Phase 2I Weight-Aware Policy Validation Addendum

## Status / source of truth

Live `main` reviewed at:

- `c9bb847889810cb8060da6f4889e00cbc79c2772` — Phase 2I chronological craft-plan UI plan
- Phase 2H completion report: `58aa2699122663243227e4ee83086babec7cd41e`
- Phase 2H implementation: `5665c9206b57b06f795f14b5caa4f728656e9f2a`

Read this addendum together with:

`docs/crafting-engine/POST_PHASE2H_REVIEW_AND_PHASE2I_CHRONOLOGICAL_CRAFT_PLAN_UI.md`

This addendum **supplements Phase 2I and is required before Phase 2I is considered complete**. Where this addendum adds stricter validation or presentation requirements, it takes precedence.

No unit-test work is requested.

---

# Executive review

The current mechanics architecture already appears structurally capable of weight-aware economic strategy discovery.

`actionRegistry.ts` derives transition probabilities from the eligible mod pool and each mod's actual weight rather than treating eligible modifiers uniformly. Examples include:

- weighted random selection through `calculateTotalWeight(...)` and cumulative `mod.weight`;
- Alteration outcome probability from the relevant prefix/suffix weight totals;
- multi-affix Alteration probability as products of conditional eligible-pool weight fractions;
- Regal outcomes weighted over the mods still eligible from the current Magic state;
- Exalted Orb outcomes weighted over mods still eligible from the current Rare state;
- Harvest guaranteed/additional outcomes weighted from their applicable eligible pools.

The optimizer then prices actions through the shared `PriceBook` and solves expected continuation cost through the generic Bellman policy search.

Therefore the intended architecture is not:

```text
get either target first
-> continue with a fixed recipe
```

It is capable in principle of discovering:

```text
which target is economically worth obtaining with cheap rolling currency
+
which target is economically worth fishing with later expensive actions
+
which item states should be preserved, promoted, slammed, rerolled, or abandoned
```

However, this has not yet been isolated as a permanent regression.

That is important enough to add now, especially before Phase 2I compresses the exact policy into a human-readable crafting plan.

A compressed UI must not accidentally erase a meaningful target-order preference that exists because of modifier weights and action prices.

---

# Why this matters

Consider a synthetic two-prefix target with intentionally extreme weights:

```text
Target A prefix weight:      1
Target B prefix weight: 12,000
```

Assume Alterations are cheap while Regal/Exalted Orbs are materially more expensive.

A plausible low-EV strategy is:

```text
use cheap Alterations to absorb the rare event:
  roll until Target A is present in a keepable state

then use later promotion/slam actions to fish for Target B:
  Target B has much higher conditional weight
```

The economically poor alternative may be:

```text
stop early on common Target B
-> repeatedly spend Regal/Exalted/recovery costs trying to hit rare Target A
```

The solver must not be told either strategy as a rule.

The solver must choose from the actual combination of:

```text
eligible mod weights
conditional pool shape
slot availability
orb prices
failure outcomes
recovery/restart cost
continuation EV
```

The desired behavior should emerge from shared mechanics and Bellman optimization.

---

# Real Herald craft motivating case

Use the existing real-world fixture as the product context:

```text
Medium Cluster Jewel
10% increased Damage while affected by a Herald
ilvl 84
6 passives

Targets:
- Endbringer
- Empowered Envoy

Final rarity: Any
Extra affixes: Allowed
```

Both targets are prefixes.

This makes target-order reasoning especially relevant because a policy can potentially:

1. obtain one target on a Magic item with cheap rolling currency;
2. fill the opposite-side suffix slot as needed;
3. Regal into Rare;
4. reach a `1P/2S` Rare state where an Exalted Orb is forced to add a prefix;
5. use the conditional prefix pool to fish for the missing target;
6. Scour/restart when the remaining state is no longer economically worth continuing.

Do not hardcode that sequence. It is only an example of the kind of state-conditioned policy the engine should be able to discover.

---

# Phase 2I Priority 0 — Prove Weight-Aware Policy Economics Before Compressing It

Before finalizing the chronological playbook transformation, add a controlled diagnostic proving that target weights and action costs materially participate in policy selection.

This is a diagnostic/regression requirement, not a new solver heuristic.

Do **not** add:

- `if rare target then Alter first`;
- target-name branches;
- Herald-specific logic;
- notable-specific logic;
- fixed target ordering;
- hand-authored recipe preference;
- external observed probabilities as mechanics inputs.

The existing generic solver should produce the preference from the modeled transition probabilities and prices.

---

# Required controlled weight-asymmetry fixture

Create an isolated deterministic diagnostic fixture using the shared mechanics and generic solver.

Prefer an in-memory/diagnostic mod pool rather than editing production scraped weights.

Use two mechanically comparable target prefixes:

```text
Target A
- Prefix
- target requirement A

Target B
- Prefix
- target requirement B
```

The fixture must retain enough realistic filler prefixes/suffixes for Alteration, Augmentation, Regal, Exalt, Scour, and restart behavior to be meaningful.

Do not construct a degenerate two-mod-only pool where the answer is guaranteed by construction.

The purpose is to validate economic policy choice, not merely `weight / totalWeight` arithmetic.

---

# Diagnostic W1 — Rare A / Common B

Set controlled weights approximately:

```text
A = 1
B = 12,000
```

Use controlled currency prices with:

```text
Alteration << Regal < Exalted Orb
```

Exact values are diagnostic inputs and may be chosen for numerical stability, but document them explicitly.

Run the normal generic solver.

Report at minimum:

```text
A weight
B weight
Alteration price
Augmentation price
Regal price
Exalt price
Scour price
clean-base/restart price

selected acquisition
selected policy EV
proper / absorption / Bellman / occupancy / reconciliation

selected action from:
- clean/normal start
- representative zero-target Magic states
- representative A-present/B-missing Magic states
- representative B-present/A-missing Magic states
- representative A-present/B-missing Rare states
- representative B-present/A-missing Rare states

expected Alteration usage
expected Augmentation usage
expected Regal usage
expected Exalt usage
expected Scour/restart usage
```

Most importantly, state explicitly whether the selected policy economically prefers to **preserve A and fish for B later**, preserve B and fish for A later, or treats both families equivalently.

Do not force a predetermined answer if the actual modeled EV says otherwise. If the result is surprising, inspect the actual conditional pools and Q-values rather than changing the solver to match intuition.

---

# Diagnostic W2 — Reverse The Weights

Using the exact same fixture topology and prices, reverse only the two target weights:

```text
A = 12,000
B = 1
```

Re-run the solver.

Acceptance goal:

The target-preservation preference should respond to the reversed probability structure **if the two targets are otherwise mechanically symmetric enough for the weight difference to control the decision**.

If the policy does not reverse, the completion report must explain the actual Q-value reason, for example:

- exclusion groups differ;
- conditional eligible pools differ;
- target identity changes downstream action availability;
- filler interactions make the targets not truly symmetric;
- action pricing/recovery dominates the intuitive weight effect.

Do not hide a failure to reverse by merely calling the fixture asymmetric. Design the controlled fixture so symmetry is intentional and auditable.

---

# Diagnostic W3 — Price Sensitivity

Weights alone are not the product invariant.

The optimizer is supposed to minimize expected **economic cost**, so action prices must matter too.

Using one of the weight-asymmetry fixtures, create at least two controlled price regimes while keeping mechanics and weights unchanged.

Example concept:

```text
PRICE REGIME EXPENSIVE-LATE
Alteration very cheap
Regal/Exalt materially expensive

PRICE REGIME CHEAP-LATE
Regal/Exalt made much cheaper relative to Alteration/restart
```

The diagnostic should print representative candidate Q-values for the states where the policy chooses between continuing cheap rolling versus promoting/slamming/recovering.

Acceptance is not necessarily that one particular action **must** flip. Acceptance is:

1. the relevant action immediate costs in the Bellman candidates reflect the changed PriceBook rates;
2. total Q-values change consistently with those prices;
3. any resulting policy change is explained from Q-values;
4. if the policy does not change, the report demonstrates why the probability/recovery terms still dominate.

If practical, deliberately choose a controlled regime pair that crosses a policy decision boundary and proves an actual action flip without adding any solver special case.

---

# Diagnostic W4 — Analytical Transition Probability Audit

For representative states used by W1/W2, independently calculate from the eligible pool:

```text
P(A | action, state)
P(B | action, state)
```

for applicable actions such as:

- Alteration;
- Regal;
- Exalted Orb.

Compare these analytical values to the transition distribution emitted by the shared mechanic.

Required assertions within numerical tolerance:

```text
sum(outcome probabilities) = 1
aggregated P(A) = expected eligible-weight fraction
aggregated P(B) = expected eligible-weight fraction
```

For multi-affix Alteration branches, audit the documented branch probability and the conditional weight fraction rather than assuming a one-roll single-pool model.

This diagnostic is intended to catch a future regression where weights exist in data but a transition path accidentally treats outcomes uniformly.

---

# Diagnostic W5 — Monte Carlo Sanity Check

Use the existing sampling mechanics / RNG path for a lightweight non-unit-test Monte Carlo diagnostic.

For at least one representative weighted state/action:

```text
sample a sufficiently large number of outcomes
compare observed A/B frequency to analytical transition probability
report confidence/tolerance
```

This is a mechanics sanity check only.

Do not use Monte Carlo observations as the solver's probability source.

---

# Diagnostic W6 — Real Herald Target-Order Evidence

After the synthetic fixture passes, run the actual Herald craft with real scraped weights and current controlled pricing.

Report:

```text
actual Endbringer weight
actual Empowered Envoy weight
relevant eligible prefix weight totals in representative states
selected target-preservation behavior
representative target-present Magic Q-values
representative Rare continuation Q-values
whether the policy favors obtaining one notable before the other
```

No acceptance rule should say that Endbringer or Empowered Envoy must be first.

The result should simply expose what the optimizer believes and why.

If the real weights are similar enough that no strong preference exists, say so.

If one is substantially rarer, the chronological plan should preserve that meaningful distinction if the selected policy actually exploits it.

---

# Phase 2I UI correction — Do Not Compress Away Target Preference

The existing Phase 2I plan suggests generic text such as:

```text
Alter until one target notable is present in a keepable magic state
```

That remains appropriate when the policy genuinely treats target identities similarly.

However, when the selected policy materially prefers one target first, the default chronological crafting plan should preserve that information.

Example only:

```text
3. Roll for Empowered Envoy
   Use Orbs of Alteration until Empowered Envoy appears in a state worth keeping.

4. Fill the Magic item if needed
   Use an Orb of Augmentation when the selected policy wants a second affix.

5. Promote and fish for Endbringer
   Regal the qualifying state. If the resulting Rare item still has one target and an open prefix opportunity, continue with the selected slam/recovery policy.
```

Do not display this text unless it is derived from the actual selected policy.

The presentation model should classify target-order evidence approximately as:

```ts
type TargetOrderPreference =
  | { kind: 'NONE' }
  | {
      kind: 'PREFER_TARGET_FIRST';
      targetModIds: string[];
      evidence: string;
    };
```

Exact shape is implementation-dependent.

The important rules are:

- derive preference from represented selected-policy actions/states, not raw weight alone;
- raw lower weight does not automatically mean "roll this first";
- include action economics and continuation policy;
- never infer a target order from target names;
- if multiple targets are effectively equivalent, keep the generic wording;
- exact policy remains available under Advanced.

---

# How to derive a safe player-facing target preference

Do not merely compare:

```text
weight(A) < weight(B)
```

Instead inspect the selected policy's behavior across reachable states.

A safe presentation claim such as:

```text
Roll for A first
```

requires evidence that the selected policy repeatedly:

1. preserves A-present/B-missing states that it is willing to progress;
2. rerolls or rejects materially analogous B-present/A-missing states; or
3. assigns a clear continuation/action distinction indicating A is the intended early milestone.

If the policy sometimes preserves both depending on filler state, use softer wording:

```text
Prefer A as the first target; some B states are also worth keeping.
```

If there is no robust distinction:

```text
Roll until either target appears in a state worth keeping.
```

This prevents the chronological guide from overstating a statistical tendency as a hard recipe rule.

---

# Required policy evidence serialization

If the existing `policyRules` / `policyExplanation` data is sufficient, reuse it.

Do not add solver state solely for UI.

If a small structured summary is needed, keep it presentation-only and traceable to selected-policy states.

Useful evidence may include:

```text
target-present state count by target identity
action selected from those states
expected visits / occupancy mass where certified
promote vs reroll action split
representative Q-value gaps
```

The compact guide does not need to show all of this by default.

Advanced diagnostics should retain enough evidence to audit the claim.

---

# Phase 2I implementation order, amended

Use this order:

1. **W4 transition-weight analytical audit** — prove the existing mechanics consume weights correctly.
2. **W1/W2 symmetric reversed-weight fixture** — prove strategy responds to target rarity without target-specific logic.
3. **W3 price sensitivity** — prove economics, not weight alone, drives the Bellman choice.
4. **W5 sampling sanity check** — independently validate the weighted transition sampler.
5. **W6 real Herald evidence** — explain actual target-order behavior with real data.
6. Implement the structured chronological craft-plan presentation model from the main Phase 2I plan.
7. Preserve target-order preference in the compact plan when the selected policy materially demonstrates one.
8. Keep decision details for material state distinctions.
9. Keep full exact Bellman policy under Advanced.
10. Run all Phase 2I UI/browser diagnostics plus Phase 2H regressions.
11. Produce the completion report.

Do not change solver mechanics merely because W1/W2 do not initially match intuition. Diagnose transition probabilities, eligibility, state equivalence, Q-values, and prices first.

---

# Required regression matrix

In addition to the main Phase 2I regressions, preserve:

## R-W1 — Existing one-mod

No material result regression.

## R-W2 — Existing two-mod Any

No material result regression.

## R-W3 — Existing no-unwanted

Final-state semantics unchanged.

## R-W4 — Real Herald default RECOMMEND

Must remain:

- finite executable clean route;
- acquisition-safe under the normal-price fixture when admissible fracture bounds dominate;
- proper;
- absorbing;
- Bellman-converged;
- occupancy-converged;
- cost-reconciled;
- fast enough to retain the Phase 2H product improvement.

Do not require an exact chaos value because deeper search may find a cheaper incumbent.

## R-W5 — Herald Retry Deeper

Must remain capable of improving or preserving the incumbent without corrupting proof status.

## R-W6 — Cheap-fracture proof fixture

Must remain provisional when a valid fracture lower bound can beat the clean incumbent.

## R-W7 — Fracturing Orb / Harvest external parity

Preserve existing mechanics parity classifications.

## R-W8 — Craft A / Craft C

Preserve current multi-seed stability and no Craft-specific generic branches.

## R-W9 — No-route material safety

Uncertified policy usage remains Advanced-only and is never shown as normal expected materials.

---

# Phase 2I completion gates, amended

Phase 2I is not complete until all of the following are true:

1. Weighted transition probabilities are explicitly audited for Alteration, Regal, and Exalt where applicable.
2. A symmetric controlled two-target fixture demonstrates that reversing target weights changes the optimizer's target-preservation preference, or an actual audited Q-value/mechanics reason explains why it does not.
3. The fixture is designed so weight reversal is a meaningful symmetry check rather than a degenerate or structurally asymmetric case.
4. PriceBook sensitivity is demonstrated separately from weight sensitivity.
5. No target-order heuristic is added to the solver.
6. No hardcoded "rare mod first" rule is added.
7. No target-name, Herald, notable, Craft A/B/C, or mod-ID branch is added.
8. Real Herald weights and representative Q-values are reported.
9. The default chronological guide preserves a meaningful target-order preference when the selected policy actually has one.
10. The default guide uses generic "one target" wording when no robust target-order preference exists.
11. Exact decision details remain available.
12. Full exact Bellman policy remains available under Advanced.
13. Existing Phase 2H proof/search improvements remain intact.
14. Build passes.
15. Lint passes apart from any explicitly documented pre-existing warning.
16. Production browser/worker smoke passes.
17. No unit tests are added.

---

# Required completion report section

Add a dedicated section:

## Weight-aware economic policy validation

It must report:

```text
W1 rare-A/common-B result
W2 reversed-weight result
W3 price-sensitivity result
W4 analytical transition audit
W5 Monte Carlo sanity result
W6 real Herald target-order evidence
```

For W1/W2 include representative Bellman Q-values, not only the final prose recommendation.

State explicitly:

> Modifier weights are transition mechanics inputs; currency prices are action-cost inputs; target-order preference is an emergent selected-policy result, not a hardcoded recipe rule.

If that statement is not supported by the diagnostics, Phase 2I should remain incomplete.
