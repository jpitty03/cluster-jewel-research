# Post-Phase 2W Field Review and Phase 2X Plan

## Phase 2X — Craft-Plan Semantic Integrity, Constellation Truthfulness, Search-Budget UX, and Proof-Depth Field Hardening

Baseline reviewed: `4e06388da42d9e875b231519abdea0509f8d6c0e` on `main`.

The newest baseline commit is data-only (`src/data/allflame/trade-prices.json`) and must be preserved. Phase 2W itself remains closed and successful: canonical selected-policy binding, objective-aware unified candidate selection, Cluster Jewels → Optimizer handoff, fail-closed cross-surface reconciliation, and the 75/75 real Playwright release suite are not to be redesigned.

Primary real-user field evidence reviewed:

```text
3banger.pdf
```

Fixture:

- Large Cluster Jewel;
- 12% increased Attack Damage while holding a Shield;
- 8 passives;
- ilvl 84 editable default from Cluster Jewels handoff;
- Rare;
- extra affixes allowed;
- Prodigious Defence + Riot Queller + Smite the Weak;
- current Allflame snapshot;
- source completed-jewel market low 2562c;
- selected executable self-fracture Riot Queller route at 1669.630c;
- route is provisional because three acquisition families remain competitive.

No unit tests are to be added or run unless the user explicitly reverses that project constraint.

---

# 1. Executive Verdict

Phase 2W is **CLOSED / PASS**. The new field run demonstrates that the Cluster Jewels handoff and current pricing pipeline are useful in real use: the exact 3-notable market combo arrives in Craft Optimizer with base/enchantment/passives/targets/market provenance, and the optimizer finds an executable route with a visible market-vs-craft comparison.

The field run also exposes one presentation/craft-plan correctness bug:

> The selected policy does not use Harvest, the Harvest Attack family is `NOT SEARCHED`, yet the craft plan and Markov Constellation contain a `Harvest` step.

This is not merely cosmetic. The chronological plan is a user instruction surface and must never invent a mechanic absent from the canonical selected policy.

Phase 2X therefore has four focused goals:

1. eliminate the phantom-Harvest / unknown-action fallback class completely;
2. make every craft-plan and Constellation step mechanically evidenced by the canonical selected bundle;
3. make search-budget controls understandable and safe for ordinary users while preserving resumable Retry Deeper;
4. use the real browser harness to fuzz plan/action consistency and field workflows before closing the phase.

Do not broaden Phase 2X into new crafting mechanics or another search-architecture rewrite.

---

# 2. Confirmed Phantom-Harvest Root Cause

## 2.1 Field contradiction

The 3-notable result says:

```text
Harvest Crafting Comparison: ENABLED NOT SEARCHED
Harvest Reforge Attack: Not searched
required action harvest_reforge_attack: not observed
```

But the selected craft plan later contains:

```text
7 Use the selected specialized craft
Use Initial clean cluster jewel base in the exact states assigned to it by the selected policy.
Selected actions: Initial clean cluster jewel base
```

and Markov Constellation renders that phase as:

```text
7 Harvest
```

The selected route itself is self-fracture Riot Queller and its full-route material accounting contains no Harvest cost/usage.

## 2.2 Code path

The current craft-plan builder constructs `policyActionIds` from:

- positive-visit `policyExplanation` action IDs; and
- positive-count `expectedActionUsage` action IDs excluding only the recommended acquisition action.

For every action it then runs:

```typescript
const phase = selectedPolicyPhase(actionId, source) ?? 'SPECIALIZED';
```

Therefore any action that is not a registered crafting mechanic silently becomes `SPECIALIZED`.

`Initial clean cluster jewel base` is a resource/acquisition accounting entry, not a downstream crafting mechanic. Its action ID is not recognized by `craftPlanPhaseForAction`, so it falls through to `SPECIALIZED`.

The visualization then intentionally renders every `SPECIALIZED` step as:

```text
Harvest
```

The result is a false Harvest instruction despite zero selected Harvest evidence.

## 2.3 Required principle

> Unknown actions must fail closed. `SPECIALIZED` is an explicit mechanics classification, never a generic fallback bucket.

---

# 3. Track A — Canonical Action Taxonomy

## 3.1 Separate three kinds of entries

Introduce or enforce an authoritative semantic distinction between:

### Physical crafting mechanics

Examples:

```text
transmutation_orb
alteration_orb
augmentation_orb
regal_orb
exalted_orb
annulment_orb
scouring_orb
fracturing_orb
harvest_reforge_attack
harvest_reforge_defences
```

These may appear as chronological craft-plan mechanics when positively evidenced on-policy.

### Acquisition/resource accounting entries

Examples:

```text
initial clean cluster jewel base
clean-base acquisition
self-fracture acquisition wrapper
market/sale value
```

These belong in acquisition/material accounting and possibly the dedicated `ACQUIRE` step. They must never be inferred as downstream crafting mechanics.

### Virtual/service actions

Examples:

```text
acquire_* menu choices
candidate selection wrappers
internal bundle/family actions
terminal/service bookkeeping
```

These may support service routing or proof evidence but are not necessarily player clicks and must not leak into ordinary craft-plan phases unless explicitly mapped.

## 3.2 Typed classification contract

Prefer an explicit classifier, conceptually:

```typescript
type CraftPlanActionClassification =
  | { kind: 'CRAFT_MECHANIC'; phase: CraftPlanPhase; mechanicId: string }
  | { kind: 'ACQUISITION_RESOURCE' }
  | { kind: 'VIRTUAL_SERVICE' }
  | { kind: 'UNKNOWN' };
```

The classifier must be derived from authoritative action/mechanic metadata, not action-name text matching.

## 3.3 No default SPECIALIZED

Remove:

```typescript
selectedPolicyPhase(actionId, source) ?? 'SPECIALIZED'
```

Use behavior equivalent to:

```text
recognized mechanic      → its declared phase
acquisition resource     → acquisition/material scope only
virtual service action   → exclude from chronological mechanics unless explicitly represented
unknown positive action  → fail craft-plan certification / emit diagnostic blocker
```

An unknown positive-usage action must never be silently rendered as Harvest, Finish, Recover, or another known mechanic.

## 3.4 SPECIALIZED means positively identified specialized mechanic

`SPECIALIZED` may be emitted only from a registered mechanic whose declared action type maps there, currently including actual Harvest reforges.

If future mechanics use SPECIALIZED, render their player-facing mechanic name from metadata rather than hardcoding every SPECIALIZED node to `Harvest`.

Recommended visualization behavior:

```typescript
compactStepLabel(step)
```

should inspect exact classified action IDs:

- actual `harvest_reforge_*` → `Harvest`;
- future explicit specialized mechanic → its configured compact label;
- impossible/unknown → release-blocking diagnostic rather than generic `Harvest`.

---

# 4. Track B — Canonical Plan Evidence Contract

## 4.1 Craft plan must be derived from the selected bundle only

Phase 2W established the canonical `ResolvedPolicyBundle`. Phase 2X must extend that atomicity to plan semantics.

Every chronological step must have provenance pointing to one or more of:

- selected bundle on-policy rule indices;
- selected bundle expected physical action usage;
- selected acquisition synthesis action usage;
- selected acquisition/recovery evidence.

No action from a non-selected family, market card, accounting-only resource row, or ambient result may appear in the selected plan.

## 4.2 Strong selected-action invariant

For a certified plan:

```text
represented physical mechanics
= exact selected on-policy physical mechanics
  + selected acquisition synthesis mechanics
  - intentionally collapsed duplicates
```

Any difference must be explicitly categorized.

Keep and strengthen:

```text
uncoveredActionIds
inventedActionIds
```

Add, if useful:

```text
excludedAccountingIds
excludedVirtualIds
unknownActionIds
```

A certified player plan requires:

```text
uncoveredActionIds = []
inventedActionIds = []
unknownActionIds = []
```

## 4.3 Harvest iff Harvest evidence

Add a generic invariant:

```text
Craft plan contains Harvest
IFF
selected canonical bundle has positive on-policy expected visits/count for an actual harvest_reforge_* mechanic.
```

Likewise:

```text
Constellation selected-route Harvest node
IFF
craft plan contains a positively evidenced Harvest step.
```

Do not infer Harvest merely because Harvest was eligible, considered, or independently searched.

## 4.4 Acquisition-resource exclusion

`Initial clean cluster jewel base` must appear only in:

- acquisition materials;
- shopping/provenance output;
- acquisition cost breakdown;
- optional acquisition start description.

It must not appear as a downstream `SPECIALIZED` action.

## 4.5 Fail closed on plan mismatch

If a selected bundle contains a positive physical/mechanical action that cannot be safely classified, return the optimization result but withhold the normal certified player craft plan and display a diagnostic-safe message such as:

```text
The optimizer found an executable policy, but the player instruction plan was withheld because one selected action lacks presentation metadata.
```

Advanced/export evidence must retain the exact unknown action ID for diagnosis.

Never guess.

---

# 5. Track C — Exact 3-Notable Regression

Pin the real handoff fixture from `3banger.pdf` as a browser regression:

```text
Large Cluster Jewel
12% increased Attack Damage while holding a Shield
8 passives
ilvl 84 editable default
Rare
extras allowed
Prodigious Defence
Riot Queller
Smite the Weak
Allflame current frozen price snapshot
Cheapest
```

The selected route is not to be hardcoded. Record whatever policy the engine legitimately selects under the frozen fixture.

Required assertions:

- if selected bundle contains no `harvest_reforge_*`, no selected craft-plan step is Harvest;
- no selected Constellation node/edge says Harvest;
- Method Portfolio may still show Harvest as eligible/not searched/resolved independently;
- acquisition material `Initial clean cluster jewel base` remains in acquisition accounting;
- `Initial clean cluster jewel base` does not appear as a SPECIALIZED plan action;
- plan/material/full-route cost reconcile;
- market-vs-craft card agrees with selected bundle cost;
- handoff provenance remains intact;
- no raw modifier IDs leak publicly.

---

# 6. Track D — Search Budget UX

The raw controls are correct but too technical for ordinary use.

Current default:

```text
5,000 states
30,000 ms
3 expansion rounds
```

Retry Deeper already performs approximately:

```text
states × 2
wall time × 2
rounds + 1
```

while reusing compatible retained search work.

Preserve that behavior.

## 6.1 Add budget presets

Add a simple `Search depth` control above or alongside Advanced raw fields:

```text
Normal       5,000 states / 30s / 3 rounds
Deep        10,000 states / 60s / 4 rounds
Very Deep   20,000 states / 120s / 5 rounds
Research    50,000 states / 300s / 6 rounds
Custom      use raw Advanced values
```

These values are UX presets, not solver rules. The raw fields remain authoritative and editable.

If runtime/Worker architecture has a validated upper limit below any proposed preset, reduce the preset after measuring it rather than weakening host-guard safety.

## 6.2 Make Retry Deeper self-explanatory

Replace or supplement the generic button text with a preview, for example:

```text
Retry deeper
10k states · up to 60s · 4 rounds · reuses 34,994 retained states
```

After another retry:

```text
Retry deeper
20k states · up to 120s · 5 rounds · reuses retained graph
```

Do not imply the full wall-time will always be consumed.

## 6.3 Proof-oriented recommendation

When unresolved competitive families remain, show a compact recommendation such as:

```text
3 competitive families remain.
Suggested next depth: Deep (10k / 60s / 4 rounds)
```

After Deep remains unresolved:

```text
Suggested next depth: Very Deep
```

This suggestion is based only on current budget/proof status, not target-specific route knowledge.

## 6.4 Preserve explicit control

Advanced continues to expose:

- Search intent;
- Max states;
- Max wall time;
- Expansion rounds;
- research-fallback pricing toggle.

Selecting a preset fills those fields. Editing a raw value moves the selector to `Custom`.

## 6.5 Guardrails

- reject nonpositive budgets;
- impose documented browser-safe maxima or show a warning for unusually large values;
- cancellation must work at every preset;
- host guard remains derived from the requested runtime;
- a deeper request must never discard a better retained incumbent;
- target/price/objective changes still invalidate incompatible sessions.

---

# 7. Track E — Market-vs-Craft Proof Language

The current 3-notable run shows:

```text
Completed market low: 2562c
Selected executable craft route: 1669.630c
Gross EV spread: +892.4c
```

but acquisition/global optimality is not proven.

The spread is still meaningful for the displayed executable route. Clarify the wording:

```text
Selected executable route EV: 1669.630c
Market sampled low: 2562c
Spread using this executable route: +892.4c
```

When cheaper unresolved routes may exist, add:

```text
A cheaper crafting route may exist; resolving it would increase the modeled spread, not invalidate this executable route's EV.
```

Do not label the selected craft cost as the globally cheapest cost while proof remains provisional.

Preserve the existing “Expected value, not guaranteed profit” warning and market quote provenance.

---

# 8. Track F — Autonomous Real-Browser Bug Hunt

Phase 2X should finish with another bounded autonomous QA pass rather than stopping immediately after the phantom-Harvest fix.

The LLM should use the existing Quality Lab / Playwright harness to discover, reproduce, repair, and re-run issues without asking for ordinary supervision.

## 8.1 Generated plan-consistency corpus

Generate a bounded matrix from current committed cluster/mod data covering:

- clean one-mod;
- clean two-mod;
- real three-notable handoff;
- selected self-fracture;
- selected actual Harvest;
- Harvest eligible but not searched;
- independently searched Harvest not selected;
- fewest-actions Harvest-selected objective;
- fastest Conventional-selected objective;
- four-mod provisional fracture;
- no-route/unresolved case.

For every executable case compare:

```text
Worker selected bundle
selected on-policy action IDs
expected action usage
craft plan selected/represented actions
Constellation selected-route nodes/edges
How to craft text
materials
export/share payload
```

## 8.2 Semantic action oracle

The browser harness should independently assert:

- Harvest text/node only when an actual selected Harvest action exists;
- Fracture text/node only when selected acquisition/policy contains fracture evidence;
- Annul/Exalt/Regal/Scour only when positively represented;
- acquisition resources never masquerade as specialized mechanics;
- no positive selected mechanic disappears from the plan without declared collapsing/provenance;
- no plan action appears that is absent from selected policy/acquisition evidence.

Do not import the same craft-plan classifier into the oracle; compare raw Worker action evidence against visible semantics independently.

## 8.3 Budget-control browser matrix

Real Playwright must verify:

- Normal preset values;
- Deep preset values;
- Very Deep values;
- Research values or validated replacement limits;
- Custom transition after manual edit;
- Retry Deeper preview;
- retained-state reuse;
- cancel during a deep run;
- host guard;
- invalidation after target/price/objective change;
- mobile wrapping of controls.

## 8.4 Repair loop

If the autonomous matrix finds an issue:

1. capture request/Worker/DOM/screenshot evidence;
2. identify the generic cause;
3. fix production code;
4. add or strengthen a deterministic/Playwright regression;
5. rerun the affected slice;
6. continue the matrix;
7. do not simply update expected screenshots/values to accept broken behavior.

Stop only for an actual unknown game mechanic, unavailable external credential/service, irreconcilable concurrent user change, or an unsafe architectural decision requiring user input.

---

# 9. Required Phase 2X Gates

## X1 — Phase 2W preservation

Run fresh mature and Phase 2T/2U/2V/2W diagnostics. Canonical selected bundle, objective selection, handoff, scroll ownership, and Harvest quotient remain healthy.

## X2 — Phantom-Harvest exact reproduction

Before the fix, preserve evidence that the 3-notable fixture has zero selected Harvest action evidence while the plan contains a SPECIALIZED/Harvest step.

After the fix, assert zero phantom step.

## X3 — Unknown action fail-closed

Inject or construct a diagnostic selected policy with one unknown positive action ID.

Acceptance:

- it is not mapped to SPECIALIZED;
- no Harvest text is generated;
- certified normal player plan is withheld or explicitly marked incomplete;
- exact unknown ID is retained in diagnostics.

## X4 — Actual Harvest positive control

Use Armour + Evasion Fewest Actions at a sufficient ceiling or another existing certified Harvest-selected fixture.

Acceptance:

- selected Harvest action has positive visits;
- plan contains a Harvest/specialized step;
- Constellation contains the Harvest node;
- action/cost/Lifeforce evidence reconciles.

## X5 — Harvest-not-selected negative control

Use a fixture where Harvest is eligible/resolved/not selected.

Acceptance: Method Portfolio may show Harvest, but selected craft plan/Constellation do not.

## X6 — Acquisition-resource exclusion

Assert `Initial clean cluster jewel base` remains in acquisition accounting but cannot create a downstream mechanical plan step.

## X7 — Full selected-action coverage

For every frozen executable corpus fixture:

```text
uncovered physical mechanic IDs = []
invented mechanic IDs = []
unknown action IDs = []
```

Accounting/virtual exclusions must be explicit and audited.

## X8 — 3-notable real-browser result

Run from Cluster Jewels → Optimize handoff. Verify handoff provenance, market quote, selected route consistency, no phantom Harvest, Constellation chronology, material reconciliation, and export/share identity.

## X9 — Budget preset contract

Verify exact displayed raw values for each preset and Custom behavior.

## X10 — Retry Deeper behavior

From Normal, Retry Deeper must extend approximately to Deep and reuse compatible retained work. A second retry extends again. Exact displayed preview and actual Worker request must agree.

## X11 — Deep cancellation/host guard

Cancel must return UI control promptly. Host guard remains safe even for large presets.

## X12 — Incumbent monotonicity

A compatible deeper request may improve or retain the best executable objective value; it must not lose a better retained incumbent solely because more budget was requested.

## X13 — Profit wording

On a provisional craft with market value, verify the card says the spread is based on the selected executable route and does not claim globally cheapest craft cost.

## X14 — Responsive budget UX

390px and desktop controls remain readable without document horizontal overflow.

## X15 — Action-semantic generated matrix

Run the bounded generated corpus and record seed, inputs, selected bundle IDs, raw action evidence, plan semantics, and visible Constellation labels.

## X16 — Real screenshots

Commit stable evidence for:

- 3-notable corrected Constellation;
- actual selected Harvest plan;
- Harvest eligible/not-selected plan;
- budget presets desktop;
- budget presets mobile;
- Retry Deeper preview.

## X17 — Worker/serialization differential

PROGRESS COMPLETE, RESULT, selected bundle, plan, visible recommendation, Constellation, materials, export, and share/reload remain semantically aligned.

## X18 — Performance

- default simple searches do not regress materially;
- craft-plan classification overhead is negligible;
- no extra Worker jobs are started by Constellation or budget preview;
- deep-budget controls do not allocate huge state on the main thread;
- no memory/session leak in repeated Normal → Deep → Very Deep flow.

## X19 — Local release matrix

Require:

```text
npm run build
npm run lint
git diff --check
npm run diagnostic:mature
npm run diagnostic:phase2t
npm run diagnostic:phase2u
npm run diagnostic:phase2v
npm run diagnostic:phase2w
npm run diagnostic:phase2x
npm run lab:no-fallback-probe
npm run lab:release
```

Adapt command names only if the repository's established naming convention requires it.

## X20 — Final autonomous review

Before closeout, the implementation LLM must:

- review its own diff against this MD;
- inspect real browser screenshots;
- inspect release-gate JSON;
- inspect console/page/network errors;
- inspect Worker event ordering;
- search production code for generic `?? 'SPECIALIZED'`-style classification fallbacks and equivalent dangerous action guessing;
- document all additional bugs found/fixed;
- confirm newer user-owned price/data commits were preserved.

---

# 10. Completion Gates

Phase 2X closes only when:

- Phase 2W remains passing;
- no unknown action can silently become SPECIALIZED/Harvest;
- `Initial clean cluster jewel base` cannot become a downstream craft mechanic;
- 3-notable field fixture contains no phantom Harvest;
- actual Harvest-selected fixture still contains correct Harvest chronology;
- craft-plan selected mechanics match canonical selected bundle evidence;
- Constellation selected-route semantics match the craft plan and raw selected mechanics;
- budget presets and Custom mode work;
- Retry Deeper clearly previews and reuses the deeper budget;
- large budgets retain cancel/host-guard safety;
- provisional market-vs-craft wording is proof-honest;
- generated semantic QA matrix passes;
- real Playwright release passes;
- build/lint/diff and mature diagnostics pass;
- no mechanics probabilities changed;
- no hardcoded route/Harvest/fracture winner added;
- state identity remains strong;
- market-fractured ranking remains absent;
- unit tests added/run: NO.

---

# 11. Required Completion Report

Create:

```text
docs/crafting-engine/PHASE2X_CRAFT_PLAN_SEMANTICS_BUDGET_UX_PROOF_DEPTH_COMPLETION_REPORT.md
```

Include at minimum:

1. final implementation/evidence commits;
2. files changed;
3. Phase 2W preservation matrix;
4. exact phantom-Harvest root cause;
5. before/after 3-notable action evidence;
6. canonical action taxonomy contract;
7. unknown-action fail-closed behavior;
8. acquisition/resource exclusion behavior;
9. selected-plan coverage/invention audit;
10. actual Harvest positive control;
11. Harvest-not-selected negative control;
12. Constellation semantic differential;
13. Normal/Deep/Very Deep/Research preset table;
14. measured safe maximums if presets changed;
15. Retry Deeper preview and actual-request evidence;
16. retained-state reuse evidence;
17. cancel/host-guard evidence;
18. incumbent monotonicity evidence;
19. 3-notable market-vs-craft wording result;
20. generated browser semantic matrix seed/results;
21. screenshots reviewed;
22. unexpected bugs found and fixed;
23. Worker/DOM/export/share differential;
24. performance/memory measurements;
25. final local release command matrix;
26. hosted lean deployment result;
27. release label/version;
28. unit tests added/run: expected NO;
29. mechanics probabilities changed: expected NO;
30. hardcoded winner added: expected NO;
31. remaining limitations and recommended next field tests.

---

# 12. Next Product Direction After 2X

Do not pre-commit another architecture phase until field evidence after 2X.

If Phase 2X closes cleanly, prioritize real user workflows:

1. discover a cluster on Cluster Jewels;
2. hand it directly to Craft Optimizer;
3. run Normal;
4. use suggested Deep/Very Deep only when proof debt remains meaningful;
5. compare market low/median with selected executable craft EV;
6. Compare Methods when a user wants Harvest/conventional/fracture alternatives;
7. record actual player feedback on whether the chronological plan is understandable enough to execute in-game.

Likely future work should be chosen from evidence rather than feature count:

- proof-efficiency improvements for commonly profitable 3/4-target crafts;
- live/current pricing automation and freshness UX;
- additional generic crafting mechanics only when correctly modeled;
- product simplification for non-technical users;
- public-beta release hardening.

---

# Final Phase 2X Principle

> **The selected player craft guide must be a lossless semantic projection of the selected canonical policy—not an interpretation of whichever action names happen to be present. Unknowns fail closed, real Harvest looks like Harvest, and no accounting resource may masquerade as a crafting step. Deeper search should be powerful without requiring users to understand solver internals.**
