# Phase 2I Chronological Craft Plan UI — Completion Report

## 1. Implementation commit

Implementation and regenerated diagnostics are committed at:

`06dcde926eed3c90ccec03d51b02acdc038fc5dc`

This report is committed separately so it can cite the immutable implementation
commit.

## 2. Files changed

Implementation:

- `crafting-engine/src/service/craftPlan.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/src/index.ts`
- `src/CraftOptimizer.tsx`
- `src/App.css`

Diagnostics:

- `crafting-engine/scripts/phase2iWeightPolicyDiagnostic.ts`
- `crafting-engine/scripts/phase2iHarvestPlanDiagnostic.ts`
- `crafting-engine/scripts/phase2hHeraldDiagnostic.ts`
- `crafting-engine/scripts/phase2eFractureFidelityDiagnostic.ts`
- `scripts/browserPhase2gSmoke.mjs`
- `scripts/browserPhase2hSmoke.mjs`
- `output-phase2i-weight-policy-diagnostic.txt`
- `output-phase2i-harvest-plan-diagnostic.txt`
- `output-browser-phase2i-smoke.txt`
- `output-phase2h-herald-diagnostic.txt`
- `output-browser-phase2h-smoke.txt`
- `output-browser-phase2g-smoke.txt`
- `output-fracture-fidelity-phase2e.txt`

The mature `output-craft-a*.txt` and `output-craft-c*.txt` artifacts were
regenerated and remained byte-identical.

## 3. Compact-plan data model

`CraftPlanSummary` is serialized on every `OptimizeCraftResult`. It contains:

- certification status and starting point;
- ordered `CraftPlanStep[]` stages: `ACQUIRE`, `INITIALIZE`, `ROLL`, `FILL`,
  `PROMOTE`, `FINISH`, `SPECIALIZED`, `RECOVER`, and `SUCCESS`;
- exact selected action IDs and player-facing action names per step;
- recovery action IDs and a return-to-step ID;
- collapsed decision groups whose options retain exact `policyRuleIndices`;
- selected, represented, uncovered, and invented action-ID sets;
- full-policy branch counts and the count hidden by default;
- selected-policy target-order evidence, including per-target represented Magic
  states, visits, preserve/reroll counts, and selected actions;
- a concise current-best-policy note when global modeled-action optimality is not
  proven; and
- explicit provenance identifying this as presentation-only deterministic
  compression.

## 4. Derivation rules

The plan is built only after `OptimizerService` has selected a certified route.
It consumes the selected `recommended` route, selected acquisition method and
synthesis, positive `expectedActionUsage`, exact `policyExplanation`, target
requirements, and proof status.

Stage classification uses shared action metadata (`DiscoveredActionType`) and
the shared Harvest definitions. Reacquisition through the selected acquisition
action is recognized from its actual non-menu policy use. Chronology follows
mechanical acquisition, rarity/progress, finishing, recovery, and terminal
milestones; it does not sort action IDs, state keys, or expected visits.

Target order is not inferred from modifier names or raw weights. The summarizer
pairs analogous target-present Magic contexts after removing only the target
identity and compares the selected preserve-versus-reroll behavior. A preference
is emitted only when all identity-specific directional differences consistently
favor one target. Equal or conflicting behavior produces `NONE` and generic
“one target” copy.

## 5. No fabricated actions

The service computes the allowed action set from the selected acquisition,
positive expected action usage, positive exact policy visitation, selected
synthesis usage, and wrong-fracture recovery. Every displayed action is checked
against that set.

Real Herald D2 reports:

```text
invented=[]
```

The W1/W2, one-mod, two-mod, no-unwanted, selected self-fracture, and selected
Harvest diagnostics also report zero invented actions.

## 6. Selected-action coverage

All positive selected-policy/acquisition action families must occur in a primary
step or retained decision/recovery detail. Expected-usage actions are included
even if service policy compression does not create a standalone explanation
card for them.

Real Herald D3 reports:

```text
selected = acquire clean, Alteration, Exalt, Scour, Augmentation, Regal, Transmutation
represented = acquire clean, Transmutation, Alteration, Augmentation, Regal, Exalt, Scour
uncovered=[]
```

The diagnostic also caught and closed coverage for selected Fracturing Orb and
reacquisition actions in fracture-required routes.

## 7. Herald before/after guide size

The captured Phase 2H default showed all `54` exact policy cards in the primary
guide. Phase 2I shows `8` primary chronological steps and `0` exact policy cards
there. All `54` exact branches are retained in a collapsed Advanced disclosure.
The production browser measured the compact guide at `1435.5px` high.

## 8. Herald compact plan as rendered

The exact production-worker fixture rendered:

1. Acquire the base — acquire clean base.
2. Make it Magic — Orb of Transmutation.
3. Roll for a target modifier — Orb of Alteration.
4. Fill the Magic item when needed — Orb of Augmentation.
5. Promote the keepable Magic states — Regal Orb, with collapsed Decision
   details.
6. Try to finish the missing target — Exalted Orb.
7. Recover from misses — Orb of Scouring; return to Step 2.
8. Finish — stop when all requested targets are satisfied.

The default-depth selected policy treats Empowered Envoy and Endbringer the same
across all 15 analogous Magic contexts, so the UI correctly uses generic target
wording. Other certified search depths serialize a soft preference only where
their returned policy consistently demonstrates one.

## 9. Regal-versus-Alteration preservation

Herald D4 finds a collapsed decision group containing both `alteration_orb` and
`regal_orb`. Its exact examples retain the Phase 2H distinction:

- Empowered Envoy plus the T3 Dexterity filler selects Alteration;
- Empowered Envoy plus the T3 Strength filler selects Regal.

The promote instruction therefore says to Regal only states the policy promotes,
never “one target present means always Regal.” The disclosure is closed by
default and points to all remaining exact cases in Advanced.

## 10. Full policy under Advanced

The production browser compared every returned `policyExplanation` entry with
the Advanced `.exact-policy-branches` cards by condition/action identity:

```text
returned=54
advancedCards=54
rendered condition collisions=0
Advanced initially closed=true
exact-policy disclosure initially closed=true
```

Raw `policyRules`, proof, search, acquisition, and target-order evidence also
remain under Advanced.

## 11. One-mod regression

The production T1 Energy Shield fixture remains acquisition-safe at
`8.783561c`, proper, absorbing, Bellman-converged, and occupancy-converged. Its
five-step plan is only acquire, initialize, roll, fill, and success; it does not
manufacture Promote, Finish, or Recover stages.

## 12. Opposite-generation two-mod regression

T1 Energy Shield plus T1 Intelligence Any remains acquisition-safe at
`228.790316c` with exact target IDs unchanged. Its selected policy produces the
same five mechanical stages as its actual action set and no Herald/notable
template text. Because no target-present states are mechanically analogous
across the prefix/suffix identities, target-order classification is `NONE`.

## 13. No-unwanted regression

The same two-mod fixture with `maxUnmatchedAffixes: 0` preserves the final-state
constraint, economics (`228.790316c`), proof health, selected actions, and
zero-invented/zero-uncovered plan coverage.

## 14. Forced-Rare Phase 2H regression

The production forced-Rare two-mod fixture remains
`BEST_RESOLVED_ACQUISITION_SAFE`, proper, and absorbing, with clean incumbent
`U=207.885641c`. Normal-price fracture families remain safely dominated by the
admissible mandatory-mechanics bound.

## 15. Selected self-fracture plan

The explicit fractured T1 Intelligence/no-market fixture legitimately selects
`self-fracture_executable` at `1482.328333c`. Its compact acquisition stage
contains the returned preparation actions including Fracturing Orb, reports
`4.000000` expected Fracturing Orbs and `3.000000` expected clean-base restarts,
and preserves `restart_reacquire` as wrong-fracture recovery. Coverage reports
`uncovered=NONE` and `invented=NONE`. No pre-fractured purchase is introduced.

## 16. Selected Harvest plan

The controlled shared-solver diagnostic selects the real shared
`harvest_reforge_defences` mechanic under a symmetric diagnostic pool and
PriceBook:

```text
FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED
selected Harvest actions=harvest_reforge_defences
specialized plan actions=harvest_reforge_defences
plan=ACQUIRE -> SPECIALIZED -> SUCCESS
uncovered=NONE; invented=NONE
```

The action is classified from shared Harvest metadata, not a target/Craft branch.

## 17. No-route and provisional UI

The injected no-route browser fixture returns `craftPlan.status=UNCERTIFIED`,
zero steps, no plan element, and no normal expected-materials section. Injected
raw exploratory usage appears only in Advanced and remains labeled “Not a valid
craft estimate.”

The artificial cheap-fracture fixture remains `PROVISIONAL_RESOLVED`; its
prominent warning still says a cheaper unresolved acquisition may exist. The
chronological guide does not weaken that warning.

## 18. Phase 2H H1–H8

All H1–H8 production-browser gates pass:

- default Herald is a finite acquisition-safe clean route;
- exact target identity is preserved;
- rendered exact-policy collisions are zero;
- no-route material safety holds;
- both normal-price fracture families are dominated by admissible bounds;
- expected materials exactly correspond to returned usage;
- Advanced remains collapsed by default; and
- market-fractured and standard-Bench target creation paths remain absent.

The full controlled A–F matrix passes. Row A resolves at `214.520976c` in `3334`
states; DEEPEN row F improves the incumbent to `82.197143c` while remaining
proper, absorbing, converged, and reconciled.

## 19. Adapted Phase 2G regressions

Phase 2G D1–D8 remain passing after adapting D3 to the new hierarchy. The
default guide now has zero exact cards; all returned exact cards match under
Advanced. Human status, recommendation hierarchy, expected-material
correspondence, provisional warning, Advanced diagnostics, Phase 2F labels, and
compiled-worker request identity remain intact.

## 20. Fracturing and Harvest parity

- Fracturing Orb: external `25.0000%`, analytical `25.0000%`, seeded Monte Carlo
  `24.9550%`; `ALIGNED`.
- Harvest B1/B2/B3 remain `CLOSE / APPROXIMATE`: analytical/MC
  `0.2755331/0.2753000%`, `43.7754343/44.2789684%`, and
  `0.1206158/0.1219000%`. Raw-presence and exactly-one-Annul semantics are
  unchanged.

## 21. Craft A / Craft C

`optimizeCraftDemo.ts --regressions-only` completed the full deterministic
multi-seed harness:

- Craft A: analytical `7623.7c`; `10000/10000` complete; pooled action-count
  differences at most `1.13%`; `MULTI-SEED STABLE`.
- Craft C: analytical `42814.4c`; one timeout and every seed at least `99.95%`
  complete; pooled differences at most `7.14%`; `MULTI-SEED STABLE`.

Both output pairs remained byte-identical. No mature PolicyEngine or solver
mechanic was changed.

## 22. Build

`npm run build`: **PASS**. Vite emitted only the existing native-config import
extension notice and large-chunk advisory.

## 23. Lint

`npm run lint`: **PASS with the one documented pre-existing warning** at
`crafting-engine/src/solver/policyEngine.ts:748:27` (`erasing-op`). The temporary
headless-browser profile was removed before the final lint run.

## 24. Production browser/worker

Both compiled-worker smokes pass against `npm run preview`:

- Phase 2G adapted UI/cross-shape diagnostic: all checks pass.
- Phase 2H H1–H8 plus Phase 2I D1–D5, W6 UI, and D10: all checks pass.

`git diff --check`: **PASS**.

## 25. Constraints confirmed

- Unit tests added: **NO**.
- Solver mechanics changed: **NO**.
- Target-order heuristic or hardcoded rare-mod-first rule added: **NO**.
- Target name, target ID, Herald, notable, Craft A/C, or Craft-specific solver or
  presentation branch added: **NO**.
- Standard Crafting Bench used to create a cluster target/notable: **NO**.
- Pre-fractured market purchase restored to discovery/ranking: **NO**.

## Weight-aware economic policy validation

### W1 — rare A / common B

The symmetric fixture uses prefix target weights `A=1`, `B=12000`. The certified
policy preserves rare A in all `4/4` target-present Magic cases and rerolls common
B in all `4/4`; the chronological Roll step prefers A.

Representative Bellman values:

```text
Magic A: Regal Q=50.954427c; Alteration Q=250.995664c
Magic B: Alteration Q=250.995664c; Regal Q=251.555814c
total EV including first base=251.995664c
```

### W2 — reversed weights

Only the target weights reverse (`A=12000`, `B=1`). The policy and presentation
preference reverse exactly: preserve B `4/4`, reroll A `4/4`.

```text
Magic A: Alteration Q=250.995664c; Regal Q=251.555814c
Magic B: Regal Q=50.954427c; Alteration Q=250.995664c
total EV including first base=251.995664c
```

### W3 — price sensitivity

Weights and topology remain W1. Changing only PriceBook inputs flips a
B-present `1P/1S` decision:

```text
expensive late actions: Alteration Q=250.995664c; Regal Q=251.549174c -> Alteration
cheap late actions:     Regal Q=69.043487c; Alteration Q=74.044612c -> Regal
```

### W4 — analytical transitions

All emitted distributions sum to `1.000000000000`. Independent eligible-pool
calculations exactly match emitted probabilities for Alteration, Regal, and
Exalted Orb, including:

```text
Alteration P(A)=0.000049996667; P(B)=0.599960002666
Regal/Exalt P(A)=0.000060237335; P(B)=0.722848021204
```

### W5 — seeded Monte Carlo

For 500,000 Exalted Orb samples:

```text
A expected/observed=0.000060237335/0.000054000000
B expected/observed=0.722848021204/0.722758000000
both within declared statistical tolerance
```

### W6 — real Herald evidence

Committed weights are Empowered Envoy `1882` and Endbringer `353`. Eligible
prefix totals are `14000` clean, `12118` after Empowered Envoy, and `13647` after
Endbringer. The controlled default policy is proper, absorbing, Bellman- and
occupancy-converged, reconciled, and has `U=214.520976c`.

Both targets select Augmentation in one represented Magic context, Regal in one,
and Alteration in thirteen. Representative Magic Q-values are:

```text
Empowered Envoy: Augmentation Q=204.229642c; Alteration Q=204.600976c
Endbringer:      Augmentation Q=202.335346c; Alteration Q=204.600976c
```

The default selected policy therefore has no consistent identity-specific target
order, and the UI says “Roll for a target modifier.” Its two target-evidence rows
remain auditable under Advanced.

> Modifier weights are transition mechanics inputs; currency prices are action-cost inputs; target-order preference is an emergent selected-policy result, not a hardcoded recipe rule.

## 26. Remaining blockers before broad product readiness

Phase 2I has no completion blocker. Broader product readiness still depends on:

- improving currently `PARTIAL` game-mechanics fidelity;
- resolving the documented `CLOSE / APPROXIMATE` Harvest model gap;
- deeper search for policies whose modeled-action global optimality remains
  unproven;
- fresher production market/currency snapshots and broader clean-base quote
  coverage; and
- normal product work around bundle size and the existing Vite native-config
  import-extension notice.

These are explicitly surfaced confidence/search/data limitations; none are
hidden or converted into a false recipe guarantee.
