# Post Phase 2E Review and Phase 2F User-Facing Modifier Label Plan

## Status / Source of Truth

Current `origin/main` reviewed at:

- `18e4ca50661c8e5fe08bd6b49f806f2cdb6202fa` — `docs: report phase 2e fracture fidelity completion`
- Phase 2E implementation: `11dae241cce320145adefc02a58fa7e454ef7d85` — `feat: harden fracture preparation search fidelity`
- Phase 2D integration beneath it: `304784e893bee6758e28c2bafe222c98471f887d`

Primary review sources:

- `docs/crafting-engine/PHASE2E_FRACTURE_FIDELITY_COMPLETION_REPORT.md`
- `output-fracture-fidelity-phase2e.txt`
- `crafting-engine/src/solver/acquisitionSynthesis.ts`
- `crafting-engine/src/solver/genericSearch.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/src/service/craftingCatalog.ts`
- `src/CraftOptimizer.tsx`
- existing browser/worker diagnostics and Craft A/C regression outputs

This document is the source of truth for the next small implementation pass.

No unit-test work is requested.

---

# Executive Verdict

## Phase 2E: PASS

Phase 2E closes the major fracture-preparation search-quality gap exposed after executable self-fracture integration.

The most important result is that the generic executable fracture search moved from approximately:

```text
12,797.759749c
```

to:

```text
1,506.328333c
```

while the complete known-legal shared-mechanics baseline is:

```text
1,512.424444c
```

The generic search therefore now finds a certified executable policy slightly cheaper than the diagnostic baseline rather than rerolling valuable target-present states because of frontier/state explosion.

The correction is architectural rather than target-specific:

- normal product search retains full canonical physical identity;
- acquisition synthesis alone uses the audited `FRACTURE_PREPARATION_BISIMULATION_V1` quotient;
- the quotient was checked against concrete action distributions;
- Bellman action selection remains generic and unrestricted;
- the known baseline sequence was not encoded as solver logic;
- wrong-fracture states remain permanent and require restart/reacquisition;
- unresolved acquisition lower bounds remain proof-blocking even when no executable U exists;
- pre-fractured market purchases and the old fixed-4x formula remain outside normal ranking;
- standard Crafting Bench is not treated as a target/notable source.

Phase 2E reports all R1-R9 regressions healthy, including production browser/worker smoke, Harvest/Fracturing parity, and multi-seed Craft A/C stability.

## Remaining optimizer limitations are explicit, not blockers for this UI pass

The completion report still correctly states that:

- acquisition global modeled-action optimality is not generally proven;
- executable Chaos/Alchemy transitions remain deferred;
- full research synthesis can cost roughly nine seconds per fracture candidate;
- proof/lower-bound/action-coverage evidence should remain visible as the UI matures.

Do not hide or weaken those proof semantics during UI work.

---

# Phase 2F Scope

> **Developer UI Phase 2F — Human-Readable Modifier Labels and Target-Selection Consistency**

This should be a deliberately small UI/usability phase.

Do not combine it with a broad redesign, new crafting mechanics, search-algorithm experiments, or target-specific solver work.

The immediate product problem is simple:

> The target dropdown currently presents PoE internal affix names such as `Acrobat's`, `of the Tiger`, etc. Those names are technically valid but are not how players identify the desired cluster-jewel modifier.

Players normally think in terms of the actual stat granted by the added small passives, for example:

```text
Added Small Passive Skills also grant: +(31—40) to Evasion
```

The Target Summary already exposes the meaningful stat text. Target selection should use the same vocabulary.

---

# Finding 1 — `CraftingCatalog.displayName` Is Currently Internal-Affix-Centric

`crafting-engine/src/service/craftingCatalog.ts` currently constructs the catalog display label approximately as:

```ts
displayName: `${mod.name}${mod.tierCount > 1 ? ` (T${mod.tier})` : ''}`
```

This means the dropdown's primary label is the internal prefix/suffix/notable name rather than the stat the player is selecting.

The catalog already exposes both:

```ts
name
statText
```

so no data-model or scraper change should be necessary for this UI improvement.

`CraftOptimizer.tsx` also already includes both `displayName` and `statText` in its search haystack, so the underlying data needed for a user-facing formatter is present.

---

# Permanent UI Label Rule

For target selection, the **primary player-facing identity must describe what the modifier gives**.

## Ordinary explicit cluster modifiers

Primary dropdown label:

```text
<statText> (T<tier>)
```

when the mod family has more than one tier.

Example:

Current:

```text
Acrobat's (T?)
```

Required style:

```text
Added Small Passive Skills also grant: +(31—40) to Evasion (T?)
```

Likewise, instead of an opaque suffix such as:

```text
of the Tiger
```

show the actual granted stat/range from `statText`.

Do not invent or manually rewrite ranges. Use the committed catalog/stat text.

## Notables

Notables are already recognized by players by their notable identity, but they should still use a player-meaningful label rather than obscure internal metadata.

Preferred rule:

- if `statText` is the canonical player-readable notable statement (for example `1 Added Passive Skill is ...`), it may be used directly;
- a concise notable name may remain visible as secondary/auxiliary text if useful;
- do not replace a meaningful notable name with an unrelated internal affix code/name.

The implementation may choose a single shared formatter that handles ordinary and notable mods cleanly, but ordinary prefix/suffix affix names must not remain the primary label.

---

# Phase 2F Priority 1 — Add One Shared User-Facing Modifier Formatter

Do not create separate ad-hoc label logic in the dropdown, Target Summary, search chips, and diagnostics.

Introduce one shared browser/catalog-level formatting contract. Exact naming is flexible, for example:

```ts
interface CraftingCatalogMod {
  modId: string;
  displayName: string;       // user-facing primary label
  technicalName: string;     // PoE/internal affix name, if retained
  statText: string;
  ...
}
```

or helper functions such as:

```ts
formatModifierPrimaryLabel(mod)
formatModifierTechnicalLabel(mod)
```

The important requirement is semantic:

```text
primary label = what the item gives
technical affix name = optional metadata/search alias
exact modId = internal identity, never changed by display formatting
```

Do not change the `TargetDefinition` contract or solver target IDs.

---

# Phase 2F Priority 2 — Update Target Dropdown Labels

For every ordinary selectable prefix/suffix, render the `statText`-based label.

Recommended visual examples:

```text
Added Small Passive Skills also grant: +(10—12) to Maximum Energy Shield (T1)
Added Small Passive Skills also grant: +(6—8) to Intelligence (T1)
Added Small Passive Skills also grant: +(31—40) to Evasion (Tn)
```

The exact range punctuation should come from committed data; do not normalize it by hand unless there is an existing shared text-normalization utility.

If the current `<select>` width makes these labels hard to read, a small width/layout adjustment is in scope. Do not turn this phase into a component-library rewrite.

---

# Phase 2F Priority 3 — Preserve Search Aliases

Changing the visible label must not make search worse.

Search should continue to match all useful identities:

```text
stat text
internal affix name
notable name
exact mod ID
tier
Prefix / Suffix
```

Therefore a user searching either:

```text
Evasion
```

or, for debugging/backward familiarity:

```text
Acrobat
```

should still be able to find the same option.

The internal affix name should become a search alias/technical field, not the primary human-facing text.

---

# Phase 2F Priority 4 — Make Selected Target / Target Summary Vocabulary Consistent

The dropdown and Target Summary should not describe the same target using two different naming systems.

Required principle:

```text
Target dropdown primary label
≈ Target Summary primary stat description
```

The Target Summary may still show extra technical details below or beside the primary description, such as:

```text
T1
Prefix / Suffix
required ilvl
exact modifier ID
```

but the main visible target name should be what the modifier grants.

Do not remove exact modifier IDs from the underlying request or validation logic.

---

# Phase 2F Priority 5 — Sorting and Duplicate/Disambiguation Safety

Switching from affix names to stat text may create visually similar options across tiers or modifier families.

The catalog/UI must retain deterministic disambiguation.

At minimum:

- display tier when a family has multiple tiers;
- preserve exact `modId` as the option value;
- preserve Prefix/Suffix grouping already used by the UI;
- if two visible stat labels would otherwise be identical, add the smallest useful differentiator such as tier, generation type, or required ilvl;
- never use the internal affix name merely because it is easier to make labels unique.

Sort by the user-facing label first, then tier/ID as a stable tie-breaker.

Do not change mechanics based on display sorting.

---

# Phase 2F UI Examples

## Ordinary modifier

Before:

```text
Acrobat's (T3)
```

After:

```text
Added Small Passive Skills also grant: +(31—40) to Evasion (T3)
```

## Ordinary suffix

Before:

```text
of the Prodigy (T1)
```

After:

```text
Added Small Passive Skills also grant: +(6—8) to Intelligence (T1)
```

## Energy Shield

Before:

```text
Glowing (T1)
```

After:

```text
Added Small Passive Skills also grant: +(10—12) to Maximum Energy Shield (T1)
```

These examples illustrate presentation only. Exact live text/ranges must come from the repository snapshot.

---

# Phase 2F Required Browser Diagnostics

Add/extend production browser smoke coverage for target-label usability.

## D1 — Ordinary affix label

Select a known ordinary affix and assert that the visible dropdown text contains its `statText` and tier rather than relying on the internal affix name.

For example, verify a known Evasion or T1 ES entry.

## D2 — Internal-name search alias

Search by the old affix name and prove the correct stat-based option remains discoverable.

The old name does not need to be visibly primary.

## D3 — Stat-text search

Search by a player-facing stat fragment such as:

```text
Energy Shield
Intelligence
Evasion
```

and verify the intended options remain discoverable.

## D4 — Multiple tiers

Verify a multi-tier family produces distinguishable user-facing options with correct tier labels.

## D5 — Notable

Verify at least one notable remains understandable and selectable after the shared formatting change.

## D6 — Target Summary consistency

Select an ordinary mod and verify the Target Summary describes the same granted stat/range as the selector.

## D7 — Exact target identity unchanged

After selecting the renamed option, verify the optimizer request still contains the exact same `modId` as before.

No user-facing label change may alter solver semantics.

---

# Regression Matrix

This is primarily a display phase, so core economic outputs should not materially change.

## R1 — Build / lint

Run:

```text
npm run build
npm run lint
```

Existing documented lint warning may remain.

## R2 — Production browser/worker smoke

Run the actual production preview + compiled worker smoke.

## R3 — One-mod T1 ES

The exact target ID, selected clean-base route, proof status, and expected economics should remain consistent with the established fixture.

## R4 — Two-mod T1 ES + T1 Int, Any

Must remain healthy and acquisition-safe under the established fixture.

## R5 — No-unwanted

Target final-state semantics must remain unchanged.

## R6 — Fracture acquisition

No change to Phase 2E acquisition synthesis/state identity is expected from this UI pass.

Do not modify `FRACTURE_PREPARATION_BISIMULATION_V1` for label work.

## R7 — Craft A / Craft C

A full expensive multi-seed rerun is optional if implementation truly remains UI/catalog-display-only and no engine/domain mechanics are touched. At minimum do not modify their solver paths. If engine/catalog data semantics are changed beyond presentation, rerun the full A/C regressions.

No unit tests are requested.

---

# Phase 2F Completion Gates

Phase 2F is complete when:

- [ ] ordinary target dropdown options primarily show the actual granted stat text;
- [ ] opaque affix names such as `Acrobat's` / `of the Tiger` are no longer the primary ordinary-mod label;
- [ ] tier remains visible where necessary for disambiguation;
- [ ] notable labels remain player-understandable;
- [ ] exact `modId` option values and optimizer request semantics are unchanged;
- [ ] internal affix names remain searchable as aliases/technical metadata;
- [ ] stat-text searching works;
- [ ] multi-tier options remain unambiguous;
- [ ] dropdown and Target Summary use consistent player-facing vocabulary;
- [ ] browser smoke explicitly validates the label change;
- [ ] existing one-mod / two-mod / no-unwanted browser regressions remain healthy;
- [ ] build passes;
- [ ] lint passes apart from documented pre-existing warning;
- [ ] production browser/worker smoke passes;
- [ ] no unit tests are added;
- [ ] no solver mechanics, target semantics, or Craft-specific branches are introduced for this display change.

---

# Required Completion Report

When complete, report:

1. commit SHA;
2. files changed;
3. shared modifier-label formatting architecture;
4. ordinary modifier label rule;
5. notable label rule;
6. tier/disambiguation behavior;
7. search aliases retained;
8. example before/after labels for Evasion, T1 ES, and T1 Intelligence;
9. confirmation that exact `modId` values are unchanged;
10. Target Summary consistency result;
11. production browser label-smoke result;
12. one-mod regression;
13. two-mod Any regression;
14. no-unwanted regression;
15. build result;
16. lint result;
17. production browser/worker smoke result;
18. whether any engine/mechanics behavior changed (expected: NO).

---

# Constraints

Do not:

- add unit tests;
- change modifier IDs because display names changed;
- rewrite stat ranges manually when committed `statText` already contains them;
- use internal affix names as the primary label for ordinary mods;
- remove internal affix names from search/debug metadata unless there is a specific reason;
- add Craft-specific UI/solver branches;
- alter Phase 2E fracture state quotient/search mechanics for this task;
- change Harvest, Fracturing, target, pricing, or acquisition semantics;
- broaden this into a major UI redesign.

---

# Recommended Implementation Order

```text
1. Introduce/centralize the user-facing modifier label formatter in the catalog/UI boundary.
2. Change ordinary target option labels to statText + tier.
3. Keep internal affix name as search/technical alias.
4. Make notable formatting explicitly player-readable.
5. Align Target Summary primary wording with the same formatter/data.
6. Add duplicate/tier disambiguation safeguards.
7. Extend production browser smoke for label/search/identity checks.
8. Run one-mod, two-mod Any, and no-unwanted browser regressions.
9. Run build/lint + production browser/worker smoke.
10. Commit implementation and regenerated UI diagnostics to `main`.
```

After this pass, the target-selection UI should speak in the same terms a player uses when deciding what they want on the jewel, while the optimizer continues to operate entirely on exact modifier IDs and the Phase 2E proof/economic architecture remains untouched.
