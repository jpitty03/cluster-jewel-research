# Post-Phase 3A Review and Phase 3B Plan

## Phase 3B — Fractured Magic Alteration Fidelity, Magic Roll-Shape Parity, and Bellman/Constellation Revalidation

Baseline reviewed: `c1a1ca67623247d24bb62f0baa49aaa32fbeecb3` on `main`.

Phase 2Z and Phase 3A remain **CLOSED / PASS / DEPLOYED**. The selected-policy Constellation now renders actual occupancy-weighted policy flow, and Quality Lab now has DEV/RELEASE/EXTENDED tiers with targeted reruns and long soaks withheld from ordinary development. Do not reopen those phases except where this mechanics correction legitimately changes their expected policy evidence.

This phase exists because field review of the new policy-flow Constellation exposed a mechanics discrepancy in the authoritative Magic reroll transition model.

No unit tests are to be added or run unless the user explicitly reverses the standing project constraint.

---

# 1. Field Finding

The selected self-fracture three-notable policy visibly uses:

```text
Scour
  ↓
fracture-only Magic state
  ↓
Augment
```

That route is plausible and likely economically correct, but inspection of the authoritative transition source revealed that Alteration is currently modeled too favorably from a one-fractured-affix Magic state.

Current production behavior in `generateMagicTransitions(...)` has a special case equivalent to:

```text
if exactly one fractured affix remains:
    Alteration always fills the opposite-side slot
```

The code comment says:

```text
A scoured item with one fractured affix is magic and has exactly one legal
non-fractured slot. Alteration fills that opposite-side slot.
```

That is the bug to remove.

---

# 2. Intended Game Behavior to Model

The user-supplied field rule is:

```text
Magic reroll shape

Single-affix result: approximately 52%
  - prefix-only or suffix-only

Two-affix result: approximately 48%
  - one prefix + one suffix
```

For a Magic item whose Prefix slot is already occupied by a permanent fractured Prefix:

```text
single-affix branch chooses Prefix
  → the fracture already occupies the Prefix result
  → no new non-fractured affix is added
  → item remains fracture-only Magic

single-affix branch chooses Suffix
  → roll one eligible Suffix

two-affix branch
  → fractured Prefix satisfies the Prefix side
  → roll one eligible Suffix
```

The mirrored behavior applies to a fractured Suffix.

Using the approximate 52/48 observation only as an illustration:

```text
fractured Prefix + Alteration

~26%  → no new affix / fracture-only Magic
~74%  → fracture + one rolled Suffix
```

The production implementation must **not** hardcode `74%` or `26%` as fracture-specific constants. Those probabilities must emerge from one shared Magic roll-shape model plus slot occupancy/fracture semantics.

---

# 3. Important Scope Separation

There are two related questions and they must not be conflated.

## 3.1 Confirmed structural bug

The one-fractured-affix special case that forces a new opposite-side modifier with probability 1 is inconsistent with the intended reroll process and must be removed.

This can be fixed generically even if the exact global single-vs-two-affix split remains the engine's current approximation.

## 3.2 Exact Magic roll-shape probability

The current engine's ordinary unfractured analytical model uses:

```text
25% prefix-only
25% suffix-only
50% prefix+suffix
```

and the sampler uses an equivalent 50/50 one-affix vs two-affix split.

The user's current field evidence is approximately:

```text
52% one-affix
48% two-affix
```

Do not silently change the global 50/50 approximation to 52/48 based only on the approximate observation.

Phase 3B must establish one explicit `MagicRollShape` mechanics contract and then do one of:

1. **VALIDATED exact split available** — use that exact split in both analytical and sampling code; or
2. **exact split still not independently pinned** — preserve the current documented approximate global split, but fix fractured-slot interaction correctly and mark/report the remaining probability uncertainty.

The completion report must state which path was taken and why.

External Craft of Exile/manual observations may validate the contract but must never become target-specific transition inputs.

---

# 4. Authoritative Magic Roll-Shape Contract

Create one shared mechanics definition, conceptually:

```typescript
interface MagicRollShape {
  oneAffixProbability: number;
  twoAffixProbability: number;
  oneAffixPrefixShare: number;
  oneAffixSuffixShare: number;
  confidence: 'VALIDATED' | 'APPROXIMATE';
  provenance: string;
  version: string;
}
```

Required invariants:

```text
oneAffixProbability + twoAffixProbability = 1
oneAffixPrefixShare + oneAffixSuffixShare = 1
```

Both:

- `generateMagicTransitions(...)`; and
- `sampleMagicTransition(...)`

must consume the same contract.

Do not maintain separate analytical and Monte Carlo constants.

---

# 5. Generic Magic Reroll Algorithm

Replace the fracture-only shortcut with a generic roll-shape procedure.

The algorithm should conceptually operate as follows.

## 5.1 Start from persistent affixes

For Transmutation/Alteration-style Magic rerolls:

```text
nextState = preserve fractured affixes only
rarity = Magic
```

## 5.2 Draw desired Magic result shape

Possible shape classes:

```text
PREFIX_ONLY
SUFFIX_ONLY
PREFIX_AND_SUFFIX
```

Probabilities come from the shared `MagicRollShape` contract.

## 5.3 Satisfy each requested side independently against persistent slot occupancy

For each requested side:

```text
if persistent fractured affix already occupies that side:
    side is satisfied by the fracture
    do not add another same-side affix
else:
    roll one eligible modifier of that generation type
```

This naturally produces a no-new-affix outcome when:

```text
shape = PREFIX_ONLY
and fractured Prefix already exists
```

or the mirrored Suffix case.

## 5.4 Preserve probability mass for blocked/no-new outcomes

A no-new-affix outcome is a real transition back to the fracture-only Magic state.

Do not:

- renormalize it away;
- silently move its probability to the opposite side;
- discard it because the physical state equals the source state.

The self-loop must remain visible to Bellman, occupancy, expected-action usage, and PolicyFlow.

## 5.5 Eligibility/exclusion behavior

When the requested side is open:

- use the authoritative eligible pool;
- use modifier weights;
- preserve mod-group/exclusion rules;
- preserve item-level/base/enchantment restrictions;
- preserve target-roll semantics.

If no eligible modifier exists for an open requested side, keep that side empty rather than inventing an affix or renormalizing to another shape.

---

# 6. Augmentation Comparison

Augmentation is structurally different and should remain so.

From a fracture-only Magic state:

```text
fractured Prefix + empty Suffix
  → Augmentation can only add the Suffix

fractured Suffix + empty Prefix
  → Augmentation can only add the Prefix
```

The existing Augmentation implementation already constrains the new modifier to the available side and should be preserved unless diagnostics expose another issue.

This means the Bellman solver may legitimately discover:

```text
Scour → Augment
```

because Augment:

- always attempts the only open Magic side;
- may be cheaper per use;
- avoids Alteration's same-side/no-new-affix probability mass.

Do not hardcode Augment as the winner. The policy must emerge from actual prices and transition distributions.

---

# 7. Analytical Acceptance Matrix

Build a dedicated Phase 3B diagnostic around controlled tiny pools so exact expected probabilities are calculable.

## B1 — No fracture

Verify the shared Magic roll shape produces the declared:

```text
prefix-only
suffix-only
prefix+suffix
```

probabilities and exact weighted mod distributions.

## B2 — Fractured Prefix

Start:

```text
Magic
1 fractured Prefix
0 Suffix
```

Expected structural outcomes:

```text
fracture-only self-loop
fracture + one Suffix
```

No outcome may contain a second Prefix.

Expected probability mass must derive algebraically from the shared roll-shape contract.

For a symmetric 52/48 illustrative contract:

```text
self-loop = 0.52 × 0.5 = 0.26
new Suffix = 0.52 × 0.5 + 0.48 = 0.74
```

For a 50/50 approximate contract:

```text
self-loop = 0.25
new Suffix = 0.75
```

The test must calculate these values from the configured contract rather than embed the expected percentages as production logic.

## B3 — Fractured Suffix

Mirror B2 exactly.

## B4 — Target weighted suffix pool

With a fractured Prefix and two eligible Suffixes of known unequal weights:

```text
P(target suffix per Alter)
=
P(an open Suffix is actually rolled)
×
targetWeight / totalEligibleSuffixWeight
```

Verify exact analytical probability.

## B5 — Augment comparison

From the same fracture-only Magic state:

```text
P(target per Augment)
=
targetWeight / totalEligibleOppositeSideWeight
```

Show analytically that Alter and Augment are not equivalent when Alter carries a same-side/no-new-affix branch.

---

# 8. Monte Carlo Parity

Analytical and sampling implementations must be validated independently.

For B1–B5 run seeded Monte Carlo with enough trials to establish narrow confidence intervals.

Required comparisons:

- one-affix/two-affix frequency;
- fracture-only self-loop frequency;
- opposite-side affix frequency;
- target-mod hit frequency;
- weighted split among multiple eligible mods.

Use statistical intervals rather than exact sample equality.

The final report must include trial count, seed(s), observed percentages, analytical percentages, and confidence intervals.

No unit-test framework is required; use the existing diagnostics infrastructure.

---

# 9. Existing External Parity

Re-run the mature Alteration/Harvest/external parity diagnostics affected by Magic roll semantics.

At minimum inspect:

- historical T1 Intelligence Alteration observations;
- T1 Int + T1 ES Alteration benchmark;
- Phase 2I weight-policy controls;
- Craft A/C seeded mechanics where Magic rolling participates;
- self-fracture acquisition fidelity;
- any Craft of Exile fixtures whose pass semantics depend on Magic rolling.

Do not force historical expected values to remain unchanged after fixing a real mechanics bug.

For every material difference, classify it as:

```text
EXPECTED CORRECTION
UNRELATED REGRESSION
EXTERNAL PARITY IMPROVEMENT
EXTERNAL PARITY DEGRADATION / INVESTIGATE
```

---

# 10. Bellman and Economic Revalidation

The mechanics correction can change policy values and route choices.

Re-run controlled comparisons for:

## 10.1 Fracture-only Magic state

At current Allflame rates record:

```text
Q(Alter)
Q(Augment)
```

including:

- immediate chaos;
- continuation EV;
- target-hit probability;
- no-new-affix probability;
- selected action.

If Augment wins, the report must explain it from the calculated Q-values rather than assume it.

## 10.2 Price reversal

Modify only Alter/Augment prices in a frozen diagnostic so the policy can reverse when economics justify it.

Acceptance:

- no hardcoded Augment preference;
- if Alter becomes sufficiently cheap, the Bellman solver is free to select Alter despite the wasted-outcome probability.

## 10.3 Fractured Prefix and fractured Suffix

Both orientations must behave symmetrically modulo actual eligible pools/weights.

## 10.4 Downstream self-fracture EV

Measure how the correction changes:

- selected self-fracture downstream EV;
- expected Alterations;
- expected Augmentations;
- expected Scours;
- route action count/time;
- candidate ranking where applicable.

Do not preserve old EVs artificially.

---

# 11. Acquisition Synthesis Impact

Self-fracture acquisition preparation itself also uses Magic rolling.

Therefore Phase 3B must check whether the corrected Magic reroll interaction affects:

- preparation EV;
- expected Alterations;
- expected Augments;
- expected Fracturing Orbs;
- wrong-fracture restart EV;
- acquisition lower/upper bounds;
- cached continuation identity.

If transition semantics changed, increment any action-set/mechanics/cache version necessary to prevent stale incompatible continuation reuse.

Do not reuse a pre-Phase-3B graph whose Magic transition distributions were generated under the old behavior.

---

# 12. Cache and Session Invalidation

Because transition probabilities change, this is a mechanics-identity change even if `ItemState` identity does not change.

Audit all caches/session identities that can preserve generated transitions:

- GenericSearch continuation sessions;
- acquisition synthesis sessions;
- Harvest distribution cache if unrelated identity is shared;
- relaxed lower-bound cache where creator-action probability enters;
- Quality Lab frozen flow fixture identity;
- policy-flow topology/fingerprint evidence;
- share/export schema if mechanics-version provenance is serialized.

Required result:

```text
old transition cache/session
≠
Phase 3B transition cache/session
```

No stale old transition distribution may survive a live reload/retry.

---

# 13. Phase 2Z Policy-Flow / Constellation Revalidation

This correction should produce a useful visible effect in the new Constellation.

## 13.1 Alter self-loop

For a one-fractured Magic state where Alter is selected, the policy-flow graph must be capable of showing:

```text
Alter
├── no-new-affix / repeat → Alter or next selected action
└── rolled opposite side → downstream selected action
```

based on actual selected policy evidence.

## 13.2 Scour → Augment

For a policy where Bellman selects Augment after Scour:

```text
Scour
→ fracture-only Magic state
→ Augment
```

must remain visible and correct.

The graph must not insert Transmute merely because recovery occurred.

## 13.3 Branch explanation

Selecting the Alter branch should expose something like:

```text
Outcome: no new affix
Reason: Magic roll shape selected the already-occupied fractured side
Conditional policy-flow probability: <derived value>
```

Use player-friendly copy; retain exact technical evidence under Advanced.

## 13.4 Flow conservation

Phase 2Z's occupancy × transition probability reconciliation must continue to pass with the new self-loop probability mass.

---

# 14. Craft-Guide Recovery Copy

The current chronological guide may still collapse Scour and Reacquire under one generic recovery step.

Do not rewrite the whole guide in Phase 3B, but ensure it does not make a false mechanics statement after this fix.

Minimum acceptable copy:

```text
If the selected policy Scours, continue from the resulting item's actual rarity/state.
With one fractured affix, Scour leaves a Magic item.

If the selected policy Reacquires, return to the selected acquisition state.

Expand Decision details for the exact next action.
```

If current Decision details already expose the exact next action correctly, preserve them.

---

# 15. Quality Lab Validation Policy

Phase 3A's runtime architecture is now authoritative.

**Do not run the 20+ minute legacy matrix during normal Phase 3B development.**

Use targeted commands only while iterating.

Recommended development loop:

```text
npm run build
npm run lint
git diff --check
npm run diagnostic:phase3b
npm run -- lab:gate -- --tag solver --tag fracture
npm run -- lab:gate -- --tag Constellation --tag fracture
```

Exact command selection should use the Phase 3A impact helper if its changed-file mapping is more precise.

After the source is stable:

```text
npm run lab:dev
```

Then run the optimized Phase 3A `RELEASE` suite **once**.

Do not run EXTENDED or the legacy 115-gate matrix unless:

- a targeted failure specifically requires the historical assertion; or
- the user explicitly asks for it.

Long visual/replay/Research soaks remain manual-only.

---

# 16. Required Phase 3B Gates

## 3B1 — Shared roll-shape contract

Analytical and sampling paths consume one mechanics object/version.

## 3B2 — Fractured Prefix analytical

Self-loop and opposite-Suffix probability match the declared shape algebra exactly.

## 3B3 — Fractured Suffix analytical

Mirrored behavior passes.

## 3B4 — Weighted target hit

Exact target hit probability matches algebra from open-side probability × weight share.

## 3B5 — Augment differential

Augment and Alter transitions from fracture-only Magic are demonstrably not treated as identical.

## 3B6 — Monte Carlo parity

Seeded simulation agrees with analytical B1–B5 within statistical intervals.

## 3B7 — No probability loss

Every generated Magic transition distribution sums to 1 within tolerance, including self-loops.

## 3B8 — No illegal double prefix/suffix

Magic capacity remains max one Prefix + one Suffix; fractures never permit a second same-side Magic affix.

## 3B9 — Bellman Q differential

Record real Q(Alter) and Q(Augment) and selected action from a fracture-only state.

## 3B10 — Price reversal

Action choice can reverse under controlled prices; no Augment rule is hardcoded.

## 3B11 — Acquisition synthesis

Self-fracture acquisition remains executable/proper/absorbing/reconciled under corrected transitions.

## 3B12 — Cache invalidation

Old mechanics/session identity cannot reuse pre-fix Magic distributions.

## 3B13 — Phase 2Z flow

Real Worker policy flow preserves the new self-loop/recovery probability and conservation.

## 3B14 — Field three-notable control

Re-run the current Chaos Damage three-notable flow and record before/after:

```text
selected acquisition
full-route EV
Alter count
Augment count
Scour count
Regal count
policy-flow topology
Scour destinations
```

Winner may change; do not assert Unspeakable Gifts.

## 3B15 — One/two-mod controls

No unrelated regression for simple clean crafts.

## 3B16 — Mature affected diagnostics

Run the mature direct diagnostics whose mechanics are actually touched.

## 3B17 — Optimized browser RELEASE

Run Phase 3A RELEASE once after targeted gates are green.

## 3B18 — Build hygiene

```text
npm run build
npm run lint
git diff --check
```

Unit tests added/run: **NO**.

---

# 17. Completion Gates

Phase 3B closes only when:

- the one-fractured-affix Magic Alteration shortcut is removed;
- no-new-affix probability mass is retained rather than renormalized away;
- fractured Prefix/Suffix behavior is symmetric modulo eligible pools;
- one shared roll-shape contract drives analytical + sampled transitions;
- the exact global one-vs-two-affix split is either independently validated or explicitly remains approximate;
- Monte Carlo agrees with analytical transitions;
- Augment vs Alter Q-values are economically emergent;
- a controlled price change can reverse the winner;
- self-fracture acquisition/downstream EVs are regenerated under the corrected mechanics;
- incompatible old transition sessions are invalidated;
- PolicyFlow shows real new self-loop/recovery flow where selected;
- Scour with one fracture continues from Magic, not Transmute by assumption;
- no probability/occupancy reconciliation fails;
- Phase 3A targeted/DEV/RELEASE validation policy is followed;
- EXTENDED/legacy long suite is not run without explicit justification;
- no Craft-specific branch is added;
- no hardcoded Augment/Alter winner is added;
- no market-fractured ranking is introduced;
- no unit tests are added or run.

---

# 18. Required Completion Report

Create:

```text
docs/crafting-engine/PHASE3B_FRACTURED_MAGIC_ALTERATION_FIDELITY_COMPLETION_REPORT.md
```

Include at minimum:

1. implementation commit(s);
2. files changed;
3. exact pre-fix mechanics defect;
4. final Magic roll-shape contract and provenance/confidence;
5. whether 52/48 was validated exactly or remained approximate;
6. fractured Prefix algebra and analytical result;
7. fractured Suffix algebra and analytical result;
8. weighted target-hit analytical result;
9. Augment analytical comparison;
10. seeded Monte Carlo table and intervals;
11. probability-sum audit;
12. Bellman Q(Alter) / Q(Augment) comparison;
13. controlled price-reversal result;
14. self-fracture acquisition before/after metrics;
15. downstream route before/after metrics;
16. transition/session cache invalidation evidence;
17. exact three-notable field before/after result;
18. PolicyFlow/Constellation screenshot showing corrected branch behavior;
19. one/two-mod regression status;
20. affected external/Craft of Exile parity classification;
21. targeted Quality Lab commands and results;
22. DEV result;
23. optimized RELEASE result;
24. EXTENDED/legacy suite disposition (expected NOT RUN);
25. build/lint/diff;
26. deployment result;
27. unit tests added/run: expected NO;
28. mechanics probability changes: document precisely;
29. hardcoded route winner added: expected NO;
30. state identity weakened: expected NO;
31. remaining mechanics uncertainty.

---

# Final Phase 3B Principle

> **A fracture may occupy a Magic affix slot, but it must not cause the reroll engine to silently redirect blocked probability onto the opposite side. Preserve the actual roll-shape probability mass, let Augment and Alter compete through real Bellman economics, and let the Constellation expose the resulting self-loops and recovery flow truthfully.**
