# Phase 2C External Fixture Metadata Addendum

## Status

This addendum supplies the source-confirmed Craft of Exile metadata that was missing from:

- `docs/crafting-engine/POST_EXTERNAL_TWO_MOD_BENCHMARK_REVIEW_AND_PHASE2C_PLAN.md`

It **supersedes the Harvest two-mod fixture counts/metadata in that document** where they conflict, but does not otherwise replace the Phase 2C implementation plan.

Do not infer or substitute different fixture metadata.

---

# Authoritative Fixture B — Harvest Reforge Defences -> One Annul

## Source-confirmed physical setup

User-confirmed Craft of Exile configuration:

```text
Base type:
Large Cluster Jewel

Cluster enchantment:
Attack Damage while holding a Shield

Item level:
100

Passive count:
12

Starting rarity:
Rare

Starting explicit affixes:
Any / not material to this fixture, provided the starting item is Rare

Fracture state:
None / unfractured
```

### Important starting-state interpretation

The external fixture is defined by a **Rare, unfractured starting item**. The user explicitly confirmed that the pre-existing explicit affixes do not matter for this Craft of Exile setup.

The shared Harvest mechanic removes/replaces non-fractured explicit modifiers before rolling the reforge result. Therefore an internal parity runner may instantiate any legal representative Rare, unfractured starting state needed by the engine, but it must document that the representative affixes are implementation scaffolding and are **not additional external fixture facts**.

Do not substitute a fractured base.

Do not substitute ilvl 84 for the confirmed ilvl 100 fixture.

---

# Exact Craft of Exile Recipe Semantics

## Step 1 — Harvest Reforge Defences

Action:

```text
Harvest crafting
-> Reforge
-> Defences
```

Pass condition:

```text
T1 Intelligence is present
AND
T1 Maximum Energy Shield is present
```

Extra/junk explicit modifiers are allowed at this step.

This is a **raw target-presence** condition, not a clean-item condition.

### Latest cumulative result

```text
Actions:   866,880
Passed:    2,178
Observed:  0.2512458472%
Ratio:     ~1 / 398.0165
Displayed: 0.251%, ~1 / 399
```

Approximate 95% Wilson interval:

```text
0.24093% – 0.26201%
```

### Supersession rule

This is the latest cumulative snapshot of the same Harvest configuration supplied earlier.

It **supersedes** the older:

```text
38 / 23,137
0.164%
```

snapshot.

Do not add the old and new counts together.

---

## Step 2 — Exactly One Orb of Annulment

An Orb of Annulment is applied after a Step 1 pass.

Pass condition after the single Annul:

```text
T1 Intelligence is still present
AND
T1 Maximum Energy Shield is still present
```

If the Annul removes either target modifier:

```text
return to Harvest Reforge Defences
```

If both targets remain after the Annul:

```text
stop successfully after that one Annul
```

The recipe performs **exactly one Annul per Harvest hit** before evaluating this step.

If one junk affix remains after the Annul, nothing further happens. The recipe still passes as long as both target modifiers remain.

### Latest cumulative result

```text
Actions:   2,178
Passed:    872
Conditional probability:
872 / 2,178
= 40.03673095%
= ~1 / 2.4977
Displayed: 40.036%, ~1 / 3
```

Approximate 95% Wilson interval:

```text
37.998% – 42.110%
```

---

# Combined Harvest -> One-Annul Observation

Across all Harvest attempts:

```text
872 / 866,880
= 0.1005906238%
= ~1 / 994.1284
```

Approximate 95% Wilson interval:

```text
0.09413% – 0.10749%
```

Craft of Exile's cost-per-success display reports approximately 995 Harvest reforges per success, which is consistent with this combined observation.

## Critical semantic label

This combined observation means:

> Harvest produced both required target mods, then exactly one Annul was applied, and both target mods were still present afterward.

It does **NOT** mean:

- zero junk affixes remain;
- exactly two explicit modifiers remain;
- `maxUnmatchedAffixes = 0` is satisfied;
- the item is a fully cleaned two-mod finished item.

Example that still counts as a Step 2 pass:

```text
T1 Maximum ES
T1 Intelligence
1 junk modifier
```

if the Harvest result originally contained four explicit modifiers and the single Annul removed one of the two junk modifiers.

Therefore do not use `872 / 866,880` as external parity for a clean-state constraint such as:

```ts
finalStateConstraints: {
  maxUnmatchedAffixes: 0
}
```

A separate repeated-cleanup Craft of Exile fixture would be required for that policy.

---

# Required Engine Parity Rows

The Phase 2C parity work should now treat these as three separate observations.

## B1 — Harvest raw target presence

```text
Fixture state:
Large Cluster Jewel
Attack Damage while holding a Shield
ilvl 100
12 passives
Rare
unfractured
arbitrary starting non-fractured affixes

Action:
Harvest Reforge Defences

Success:
T1 Int + T1 ES both present
extras allowed

External:
2,178 / 866,880
0.2512458472%
~1 / 398.0165
```

Engine analytical probability must be derived from the shared Harvest transition distribution.

Engine seeded MC must use the shared Harvest sampler.

Keep Harvest fidelity labeled:

```text
APPROXIMATE / EXTERNALLY CLOSE
```

unless independent evidence justifies changing it.

## B2 — One-Annul conditional preservation

Condition on the actual Harvest-success state distribution from B1.

```text
Action:
exactly one Orb of Annulment

Success:
both T1 Int and T1 ES remain after the Annul

External:
872 / 2,178
40.03673095%
~1 / 2.4977
```

This row should test the **Harvest success-state mixture + shared Annul mechanic**, not a hand-picked representative state and not a raw `2 / n` formula.

If the engine parity runner can propagate the analytical Harvest success-state distribution through one Annul exactly, prefer that.

Also provide seeded Monte Carlo from the same shared mechanics.

## B3 — Combined Harvest -> one Annul

```text
External:
872 / 866,880
0.1005906238%
~1 / 994.1284
```

The internal analytical value should be derived from B1 state probabilities propagated through B2 Annul transitions.

Do not multiply unrelated hardcoded percentages.

This row is a **one-Annul target-presence** benchmark, not a clean-finished-state benchmark.

---

# Authoritative Alteration Fixture Semantics

The user explicitly confirmed the stopping condition for the existing two-mod Alteration fixture:

```text
Use Orb of Alteration until a magic item contains:
- T1 Intelligence
- T1 Maximum Energy Shield

Stop immediately when both are present.
There is no additional condition.
```

Because the successful item is Magic and the two targets occupy one Prefix and one Suffix, this outcome is inherently the clean two-explicit-mod state for that run.

Existing observed result remains:

```text
18 / 85,471
= 0.02105977466%
= ~1 / 4,748.3889
```

Approximate 95% Wilson interval:

```text
0.01332% – 0.03329%
```

Do not infer additional physical metadata for the Alteration run beyond what has been source-confirmed elsewhere. If an exact pool-specific fixture requires base/enchant/ilvl/passives that are not already explicitly recorded, request those values rather than guessing.

---

# Phase 2C Implementation Impact

The missing Harvest fixture metadata blocker is now resolved.

Proceed with the existing Phase 2C plan, with these corrections:

1. Replace the old `38 / 23,137` raw Harvest snapshot with `2,178 / 866,880`.
2. Add the one-Annul conditional preservation fixture `872 / 2,178`.
3. Add the combined one-Annul target-presence fixture `872 / 866,880`.
4. Do not label the combined result as a clean finished item.
5. Keep `maxUnmatchedAffixes = 0` validation separate from this external one-Annul benchmark.
6. Derive all engine-side probabilities from shared mechanics.
7. Preserve the primary Phase 2C priorities around clean two-mod acquisition resolution, acquisition-safe recommendation semantics, target final-state constraints, and search-frontier efficiency.

---

# Completion Report Additions

In addition to the completion report required by the main Phase 2C document, report:

```text
Harvest fixture metadata used
Harvest raw-hit analytical probability
Harvest raw-hit seeded MC probability
Harvest raw-hit external comparison
one-Annul conditional analytical probability
one-Annul conditional seeded MC probability
one-Annul external comparison
combined Harvest -> one-Annul analytical probability
combined seeded MC probability
combined external comparison
whether any of those rows incorrectly required a clean final state
```

The final answer to the last line must be:

```text
NO
```

unless the external recipe itself is changed and a new source-confirmed clean-state fixture is supplied.
