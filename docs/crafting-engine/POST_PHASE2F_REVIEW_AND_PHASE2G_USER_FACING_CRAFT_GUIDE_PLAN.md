# Post Phase 2F Review and Phase 2G User-Facing Craft Guide Plan

## Status / Source of Truth

Live `main` reviewed at:

- `2f662ffdda5cc68ab6d13888eb38d57c76aa0f34` — `docs: report phase 2f modifier label completion`
- Phase 2F implementation: `ffba246dc3b70e3f3126279adac34a8a07808bc5` — `feat: make crafting modifier labels player-readable`

Primary reviewed sources:

- `docs/crafting-engine/PHASE2F_MOD_LABEL_UI_COMPLETION_REPORT.md`
- `crafting-engine/src/service/craftingCatalog.ts`
- `src/CraftOptimizer.tsx`
- `scripts/developerUiPhase2fDiagnostic.ts`
- `scripts/browserPhase2fSmoke.mjs`
- `output-developer-ui-phase2f.txt`
- `output-browser-phase2f-smoke.txt`

This document is the source of truth for the next implementation pass.

No unit-test work is requested.

---

# Executive Verdict

## Phase 2F: PASS

Phase 2F accomplished the requested modifier-language change cleanly and without changing optimizer semantics.

The important implementation properties are all present:

- ordinary modifiers now use committed player-facing `statText` as the primary label;
- tier information remains visible where mechanically meaningful;
- collision disambiguation is deterministic and only appears when necessary;
- notable labels remain concise and player-recognizable;
- internal affix names remain searchable;
- exact modifier IDs remain searchable/debuggable;
- dropdown selection and Target Summary use the same vocabulary;
- worker requests still send the exact original `modId` values;
- no solver/domain/rules/test implementation was changed;
- one-mod, two-mod `Any`, and no-unwanted browser regressions remained economically unchanged;
- build/lint/production browser-worker smoke passed.

The shared `CraftingCatalogMod` presentation contract is also a good architectural improvement. React no longer needs to independently reconstruct modifier naming rules.

## The next product problem is no longer modifier naming

The current page is still fundamentally presented as a **developer diagnostics surface** rather than a crafting tool for a player.

The source still introduces itself as:

```text
Developer-facing generic policy search.
```

and the main result hierarchy exposes concepts such as:

```text
BEST_RESOLVED_ACQUISITION_SAFE
Resolved incumbent U
Best unresolved acquisition L
Policy health
Bellman iterations
Occupancy iterations
Self-fracture synthesis portfolio
Canonical state identity
Search budget
Raw inferred tags
On-policy rules
```

These are valuable and should remain available, but they should not be the first thing a normal player must interpret.

The next phase should therefore focus on **progressive disclosure and an actionable craft guide**, not another broad mechanics/search rewrite.

## Recommended next phase

> **Developer UI Phase 2G — User-Facing Recommendation Hierarchy, Branch-Aware Craft Guide, and Progressive Disclosure**

The goal is not to hide uncertainty. The goal is to communicate the same proof-honest result in the order a player actually needs it:

```text
What am I crafting?
What should I start with?
What will it roughly cost?
What do I actually do?
What materials should I expect to use?
How confident is this recommendation?
What technical/search details are available if I want them?
```

---

# Finding 1 — The Primary Result Still Exposes Internal Status Vocabulary

## Severity

**HIGH for user-facing usability**

The result summary currently prints the raw recommendation enum directly:

```text
BEST_RESOLVED_ACQUISITION_SAFE
PROVISIONAL_RESOLVED
PROVEN_OPTIMAL
NO_RESOLVED_ROUTE
```

The code already has `STATUS_COPY` with understandable player-facing titles and explanations, so the product has the information needed to avoid using the enum as the primary label.

## Required Phase 2G behavior

The main recommendation card should use the human-readable status title as the primary status.

Examples:

```text
Recommended route found
```

or, using the existing vocabulary:

```text
Best resolved acquisition-safe route found
```

For provisional results:

```text
Provisional route — a cheaper unresolved route may exist
```

The raw enum may remain visible inside technical details for diagnostics.

Do not weaken the semantics of `PROVISIONAL_RESOLVED` merely to make the UI friendlier.

---

# Finding 2 — The Most Useful Output Is Buried Below Diagnostics

The current result area contains all of the pieces a player needs, but the information hierarchy is inverted.

Important player information exists in:

- selected acquisition;
- expected cost;
- `policyExplanation`;
- expected action usage;
- expected currencies;
- relevant warnings.

However, it competes visually with:

- Bellman / occupancy details;
- acquisition U/L proof values;
- self-fracture synthesis internals;
- search-state counts;
- stage timings;
- canonical identity;
- raw Harvest scope;
- currency mapping coverage;
- full on-policy rules.

The next phase should make the user-facing answer obvious before exposing research diagnostics.

---

# Phase 2G Priority 1 — Create A Player-Facing Recommendation Hero

## Required default-visible summary

The first result card should answer these fields in approximately this order:

```text
TARGET
<player-facing modifier names>

RECOMMENDED START
Clean Base
or
Self-fracture <player-facing modifier>

EXPECTED COST
228.790c

RECOMMENDATION CONFIDENCE
Acquisition-safe
or
Provisional — a cheaper unresolved acquisition may exist

FINISH CONDITION
Extra affixes allowed
or
No unwanted affixes
```

If expected sale value/profit was supplied, economics may appear immediately after expected cost:

```text
Expected sale value
Expected profit
```

Do not invent sale economics when the user did not provide them.

## Status display rules

Use the existing proof semantics rather than introducing a new confidence calculation.

Suggested player-facing mapping:

```text
PROVEN_OPTIMAL
-> Proven optimal over the modeled search space

BEST_RESOLVED_ACQUISITION_SAFE
-> Recommended route found
   Starting/acquisition choice is safe among modeled acquisition families;
   exact crafting policy may still improve.

PROVISIONAL_RESOLVED
-> Provisional route
   This route is executable, but a cheaper unresolved acquisition may exist.

NO_RESOLVED_ROUTE
-> No fully resolved route found within this search budget
```

The raw enum should be moved to Advanced diagnostics.

## Proof-honesty requirement

For `PROVISIONAL_RESOLVED`, the warning must be prominent and default-visible.

Do **not** hide a competitive unresolved lower bound inside a collapsed developer section.

A normal user must be able to distinguish:

```text
recommended
```

from:

```text
best executable route found so far, but not yet safe to recommend economically
```

---

# Phase 2G Priority 2 — Make The Branching Policy The Main Craft Guide

## Goal

The optimizer should answer:

> **What do I actually do in-game?**

The existing `result.policyExplanation` is the correct starting point because it represents grouped Bellman decisions rather than a fabricated linear recipe.

The current heading:

```text
Branching craft policy
```

is technically accurate but should become a primary player-facing section such as:

```text
How to craft it
```

or:

```text
Crafting instructions
```

## Critical rule — do not fabricate a linear recipe

The policy is state-dependent.

Do not convert it into fake steps like:

```text
1. Alter
2. Augment
3. Regal
4. Exalt
```

unless that exact sequence is truly unconditional under the selected policy.

Instead render the actual grouped policy as understandable conditional instructions.

Example presentation shape:

```text
STARTING POINT
Buy/acquire a clean 12-passive Large Cluster Jewel.

WHEN ROLLING THE ITEM
If the desired modifier is missing -> use Orb of Alteration.
If the desired modifier is present and one affix slot is open -> use Orb of Augmentation.
...

IF A FRACTURE ROUTE IS SELECTED
Prepare the legal fracture state using the selected policy.
Apply Fracturing Orb.
Desired modifier fractured -> continue with the item.
Wrong modifier fractured -> abandon/reacquire and retry.
```

The exact wording must come from selected acquisition/policy data. Do not hardcode the above as a universal recipe.

## Presentation detail

Default-visible instruction rows should emphasize:

```text
condition -> action
```

Secondary metadata such as:

```text
represented state count
expected visits
continuation EV
```

should be available but visually de-emphasized or collapsed.

---

# Phase 2G Priority 3 — Promote Expected Materials

The current engine already exposes:

```text
expectedActionUsage
expectedCurrencies
```

These should become a compact default-visible **Expected materials** section near the craft guide.

Suggested presentation:

| Material/action | Expected usage | Expected cost |
| --- | ---: | ---: |
| Orb of Alteration | 30.35 | 4.26c |
| Orb of Augmentation | 7.84 | 0.51c |
| Clean-base reacquisition | 1.00 | 4.00c |

Use the actual returned values; the example above is illustrative only.

Expected values may be fractional because they are long-run averages. Make that clear in short helper copy rather than rounding them into misleading whole-number guarantees.

Avoid showing the same information twice in equally prominent forms. If `expectedActionUsage` already contains the useful currency/action rows, `expectedCurrencies` can be a compact secondary summary or live under details.

---

# Phase 2G Priority 4 — Progressive Disclosure For Research Diagnostics

## Default-visible information

Keep these visible without expanding anything:

1. target;
2. recommendation status in player language;
3. selected starting/acquisition route;
4. expected cost;
5. acquisition-safe vs provisional distinction;
6. materially relevant warning(s);
7. crafting instructions;
8. expected materials;
9. stale-data warning when it materially affects price confidence.

## Move behind an `Advanced optimizer details` disclosure

The following should remain available but no longer dominate the default result page:

```text
raw recommendation enum
resolved incumbent U
unresolved lower bound L
potential proof gap
Bellman iterations
occupancy iterations
EV reconciliation
on-policy state count
full on-policy rules
self-fracture synthesis portfolio internals
canonical state identity
search state counts
stage timing
host deadline values
raw inferred Harvest tags
currency mapping coverage
full confidence warning counts
DEEPEN frontier metrics
```

Do not delete this data. It has been valuable for research and debugging.

This phase is about **layering**, not removal.

## Suggested advanced structure

```text
Advanced optimizer details
  Proof and bounds
  Policy health
  Acquisition synthesis
  Search performance
  Full on-policy rules
  Pricing / mechanics coverage
```

Avoid one giant unstructured diagnostics dump.

---

# Phase 2G Priority 5 — Simplify The Input Hierarchy Without Changing The Contract

The target-selection work from Phase 2F should be preserved.

## Keep immediately visible

```text
Base type
Cluster enchantment
Item level
Passive count
Desired modifiers
Final rarity
Finish condition
Pricing league
```

## Reframe / optionally collapse

The following are useful but secondary for a normal user:

```text
Clean base manual override
Expected sale value
Research fallback pricing toggle
Search state/time/round budgets
Search intent
```

Recommended layout:

```text
Pricing & optional economics
  Clean base manual override
  Expected sale value

Advanced search settings
  Recommend / Deepen / Prove
  Max states
  Wall time
  Expansion rounds
  Research fallback toggle
```

The exact grouping can vary, but the primary craft-definition flow should not be interrupted by research controls.

## Copy improvements

Replace developer-oriented copy such as:

```text
Developer-facing generic policy search.
```

with user-facing language, for example:

```text
Choose your cluster jewel and desired modifiers. The optimizer searches modeled crafting routes and estimates the cheapest executable strategy it can resolve.
```

Suggested button copy:

```text
Find cheapest craft
```

instead of requiring the user to understand what "Optimize craft" means.

The old labels may remain in diagnostic scripts where exact text matching is useful, but production UI should be player-oriented.

---

# Phase 2G Priority 6 — Warning Hierarchy

Warnings currently have useful category separation. Preserve it.

## Must remain prominent

Default-visible warnings should include anything that can materially change the user's decision, especially:

```text
PROVISIONAL acquisition / cheaper unresolved route may exist
selected-policy price incompleteness
selected-policy mechanics approximation
stale price data when selected route economics depend on it
```

## May remain advanced

Warnings about off-policy alternatives or broad considered-search-space coverage may remain in advanced details unless they directly prevent a safe recommendation.

Do not make the UI look confident by hiding economically relevant uncertainty.

---

# Phase 2G Required Browser Diagnostics

Add a dedicated Phase 2G production browser/worker smoke rather than weakening Phase 2F coverage.

## D1 — Human recommendation status

One-mod T1 ES result:

```text
raw BEST_RESOLVED_ACQUISITION_SAFE is not the primary visible status
human-readable recommendation status is visible
raw enum remains available in Advanced optimizer details
```

## D2 — Primary result hierarchy

Verify the initial visible result includes:

```text
target
recommended start/acquisition
expected cost
confidence/safety
finish condition
```

without opening advanced details.

## D3 — Branch-aware craft guide

Verify `How to craft it` / equivalent renders rules from `result.policyExplanation`.

The browser diagnostic should establish that the displayed conditions/actions correspond to actual returned policy explanation entries.

Do not validate a hardcoded Craft A/one-mod recipe.

## D4 — Expected materials

Verify actual `expectedActionUsage` values are rendered and at least one known one-mod action/currency appears with its returned count/cost.

## D5 — Provisional result warning

Use an existing controlled fixture capable of producing `PROVISIONAL_RESOLVED`.

Verify:

```text
executable incumbent remains visible
prominent provisional warning is visible
acquisition safe = false is communicated in player language
competitive unresolved evidence is not silently hidden
```

The exact lower-bound number may live in advanced proof details, but the decision-relevant warning must be visible by default.

## D6 — Advanced diagnostics retained

Open `Advanced optimizer details` and verify presence of at least:

```text
raw recommendation status
U/L proof evidence when available
policy health
search budget/performance
self-fracture synthesis information when applicable
```

## D7 — Phase 2F modifier labels remain intact

Retain smoke coverage for:

```text
statText-first ordinary label
technical-name search alias
stat-text search
multi-tier labels
notable selection
selector / Target Summary consistency
exact worker mod IDs
```

Do not regress Phase 2F while restructuring the page.

## D8 — Worker identity unchanged

Intercept production worker requests and verify the UI restructuring does not alter:

```text
baseType
clusterType
itemLevel
passiveCount
required mod IDs
required rarity
final-state constraints
price context
search budgets
search intent
```

Presentation changes must not mutate optimizer semantics.

---

# Economic Regression Matrix

## R1 — One-mod T1 ES

Preserve the established browser behavior approximately:

```text
Clean Base
BEST_RESOLVED_ACQUISITION_SAFE semantics
~8.784c under current browser fixture pricing
proper / absorbing / converged
```

Do not require an exact runtime equality; report before/after.

## R2 — Two-mod T1 ES + T1 Int, Any

Preserve approximately:

```text
Clean Base
acquisition-safe
~228.790c under current browser fixture pricing
100% policy absorption
```

## R3 — No unwanted affixes

Preserve the same final-state constraint and current controlled economics.

## R4 — Provisional fixture

Preserve proof-honest classification. UI copy may change; engine status may not.

## R5 — Self-fracture presentation fixture

Use a controlled/service-backed result where a fractured acquisition family is relevant and verify the UI can explain:

```text
self-fracture acquisition
expected Fracturing Orbs / retries when available
wrong-fracture restart semantics
```

Do not introduce pre-fractured market purchase.

---

# What Is Explicitly Out Of Scope For Phase 2G

Do not use this UI phase to implement:

```text
Chaos Orb analytical transitions
Orb of Alchemy analytical transitions
new Harvest mechanics
new seasonal mechanics
new probability assumptions
new acquisition algorithms
new state-identity quotients
new Craft A/C special cases
broad solver frontier research
```

Those mechanics/search topics remain valid future work, but mixing them into a presentation phase would make regressions harder to interpret.

The existing roughly multi-second fracture-family synthesis performance should be measured and preserved, not redesigned here unless the UI restructuring itself introduces a regression.

---

# Phase 2G Completion Gates

Phase 2G is complete when all of the following are true:

- [ ] Phase 2F player-facing modifier labels remain unchanged and correct;
- [ ] raw recommendation enums are no longer the primary user-facing status;
- [ ] a user can identify the recommended starting/acquisition route without reading developer diagnostics;
- [ ] expected cost is prominent;
- [ ] acquisition-safe vs provisional meaning is visible in player language;
- [ ] a provisional/unsafe result cannot visually masquerade as a normal recommendation;
- [ ] `policyExplanation` drives the default-visible craft guide;
- [ ] no fake unconditional linear recipe is generated from a branching policy;
- [ ] expected action/material usage is easy to find;
- [ ] economically material selected-route warnings remain visible;
- [ ] developer proof/search diagnostics remain accessible through progressive disclosure;
- [ ] input controls are grouped into primary craft definition vs optional/advanced settings;
- [ ] production copy no longer describes the page primarily as a developer-facing search tool;
- [ ] worker request semantics remain unchanged;
- [ ] one-mod regression remains healthy;
- [ ] two-mod `Any` regression remains healthy;
- [ ] no-unwanted regression remains healthy;
- [ ] provisional proof semantics remain healthy;
- [ ] self-fracture-only acquisition rule remains unchanged;
- [ ] pre-fractured market purchase remains absent from normal ranking;
- [ ] `npm run build` passes;
- [ ] `npm run lint` passes apart from explicitly documented pre-existing warnings;
- [ ] production browser + compiled worker Phase 2G smoke passes;
- [ ] no unit tests were added;
- [ ] no Craft-specific solver branches were added;
- [ ] no solver/domain/rules mechanics were changed as part of this UI phase.

---

# Required Completion Report

When Phase 2G is complete, report:

1. implementation commit SHA;
2. files changed;
3. screenshots/text description of the new default information hierarchy;
4. recommendation-status player copy for all four statuses;
5. how raw status/proof data remains accessible;
6. how `policyExplanation` is transformed into the craft-guide UI without inventing a linear recipe;
7. expected-materials presentation;
8. warning hierarchy and provisional-result behavior;
9. input-form progressive disclosure changes;
10. Phase 2F D1-D7 regression result;
11. Phase 2G D1-D8 browser diagnostic result;
12. exact worker-request identity comparison before/after;
13. one-mod economic result/runtime;
14. two-mod `Any` economic result/runtime;
15. no-unwanted result/runtime;
16. provisional fixture result;
17. self-fracture presentation fixture result;
18. build result;
19. lint result;
20. production browser/worker smoke result;
21. confirmation that solver/domain/rules mechanics were unchanged;
22. confirmation that no unit tests were added;
23. remaining usability/mechanics/performance blockers before calling the optimizer broadly product-ready.

---

# Constraints

Do not:

- add unit tests;
- change exact modifier IDs;
- regress statText-first modifier labels;
- invent a linear recipe from a branching Bellman policy;
- hide `PROVISIONAL_RESOLVED` uncertainty behind optimistic user copy;
- hide economically material selected-policy warnings;
- remove technical diagnostics that are still useful for research;
- reintroduce pre-fractured market purchase;
- change self-fracture economics;
- change target/final-state semantics;
- change solver mechanics;
- add Craft-specific branches;
- add Chaos/Alchemy/Harvest mechanics in this phase;
- couple the UI to internal affix names again.

---

# Recommended Implementation Order

```text
1. Restructure result hierarchy around player-facing recommendation/status/cost.
2. Promote `policyExplanation` into a primary branch-aware craft guide.
3. Promote expected materials/action usage.
4. Add structured `Advanced optimizer details` progressive disclosure.
5. Reorganize input form into primary / pricing-optional / advanced controls.
6. Implement warning hierarchy with provisional state always prominent.
7. Add Phase 2G browser diagnostics D1-D8.
8. Re-run Phase 2F label diagnostics.
9. Re-run one-mod / two-mod Any / no-unwanted / provisional / fracture presentation regressions.
10. Run `npm run build`, `npm run lint`, production browser + compiled worker smoke, and `git diff --check`.
11. Write the Phase 2G completion report.
12. Commit and push implementation, regenerated diagnostics, and completion report to `main`.
```

After this phase, the optimizer should still expose all of its research-grade evidence, but a normal player should no longer need to understand Bellman iteration counts, acquisition lower bounds, or canonical state identities before they can answer the basic question: **what should I do, and what should it cost?**
