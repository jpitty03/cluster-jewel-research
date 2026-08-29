# Post-Phase 3G Field Review and Phase 3H Plan

## Cluster-Handoff Detachment, Generic Alternative Labels, Proof/Search Evidence, and Exact Field Validation

Status: **READY FOR IMPLEMENTATION**

Baseline reviewed: `1052a346d2010af3cfc662bcdeb5482bb9a299e9` on `main`.

Phase 3G is **CLOSED / PASS / DEPLOYED**. Its canonical `TargetDefinition.acceptableAnyOf` representation, scenario-aware validation, structured required-versus-acceptable progress, terminal semantics, solver/MDP integration, persistence/share behavior, craft-plan evidence, PolicyFlow behavior, Constellation behavior, and required-only compatibility are permanent preservation requirements.

This is a focused Phase 3H product-correctness and evidence-clarity phase. It does not reopen the Phase 3G domain model or crafting mechanics.

No unit tests are to be added or run. Add focused diagnostics and real-browser Quality Lab gates instead. Run DEV once and RELEASE once. EXTENDED, nightly, legacy, and long-soak suites remain withheld unless a Phase 3H finding independently justifies one of them.

---

# 1. Field Finding and Authoritative Product Decision

The reviewed optimizer result was launched from the Cluster Jewels page. After the target was edited, the optimizer still showed:

```text
Loaded from Cluster Jewels
The craft identity has changed since handoff; source pricing is retained as context only.
```

It also continued to expose the inherited source quote through expected sale value and expected-profit presentation. Suppressing only the market-spread comparison was not enough: the screen still appeared to use the original Cluster Jewels listing to value a different craft.

The authoritative Phase 3H decision is:

> A Cluster Jewels handoff is attached only while the optimizer is still describing the handed-off craft and market identity. The first player edit that changes that identity permanently detaches the current handoff. Once detached, the optimizer removes the banner and every reference to the source context. Reverting fields does not reattach it. Only a new explicit Optimize action from the Cluster Jewels page creates a new attached handoff.

This is a one-way lifecycle for the current optimizer session:

```text
fresh optimizer
    OR
attached Cluster Jewels handoff
             |
             | first identity-changing player edit
             v
detached ordinary optimizer craft
```

Do not replace the current warning with different warning text. After detachment there must be no source banner, no source-price context note, no source listing reference, and no stale Cluster Jewels provenance in exported or shared state.

---

# 2. Phase 3H Outcomes

Implement all four outcomes together:

1. make Cluster Jewels handoff detachment authoritative and provenance-safe;
2. replace ordinal-specific acceptable-modifier wording with generic wording;
3. make proof status and search counters legible without changing their technical meaning;
4. field-validate the exact original `3 required + any 1 of 3` craft end to end.

## 2.1 Non-goals

Phase 3H must not:

- add a second optional-modifier representation;
- flatten `acceptableAnyOf` into `requiredMods`;
- change modifier weights, transition probabilities, crafting actions, or action legality;
- change terminal semantics or affix-slot capacity;
- change search allocation, continuation, retained-state reuse, host reserve, or proof algorithms merely to make labels look better;
- introduce alternative-specific ranks, weights, prices, or preferences;
- hardcode the field fixture's winning acquisition or crafting policy;
- add Craft-specific explanation branches;
- fracture acquisition ranking by market context;
- weaken canonical state or target identity;
- add or run unit tests.

---

# 3. Workstream A — One-Way Cluster Jewels Handoff Detachment

## 3.1 Replace equality-derived presentation with explicit lifecycle state

The Phase 3G implementation derives `seedTargetIdentityMatches` from current form values. That is suitable for checking equality but is not sufficient as ownership/lifecycle state: if a player changes a field and later changes it back, equality can become true again.

Introduce an explicit handoff state whose relevant states are conceptually:

```ts
type ClusterHandoffState =
  | { status: 'none' }
  | { status: 'attached'; seed: OptimizerSeed; baseline: HandoffIdentitySnapshot };
```

Detachment transitions `attached` to `none`. There is intentionally no automatically derived `detached-but-retained` UI state. Any internal diagnostic reason may be transient or development-only; it must not preserve source context in player-visible/shareable optimizer state.

Centralize the transition in one helper such as:

```ts
detachClusterHandoff(reason, nextValue?)
```

Every identity-changing form handler must use the shared transition rather than independently clearing pieces of state.

## 3.2 Hydration guard

Applying a seed populates several controlled fields and may normalize dependent values. Those initial programmatic writes must not detach the seed that is currently being hydrated.

Required sequence:

1. parse and validate the incoming optimizer seed;
2. enter seed-hydration mode;
3. populate and normalize the form;
4. record the normalized handoff identity baseline actually represented by the form;
5. attach the seed;
6. leave hydration mode;
7. only subsequent player-authored identity edits may detach it.

Do not compare against a pre-normalization snapshot if the UI deterministically normalizes rarity or another derived field during import.

## 3.3 Identity-changing edits that detach

The following player-authored changes alter the craft or the source market identity and must immediately detach an attached handoff, before another optimization is run:

| Field | Reason |
|---|---|
| Base type | Different item identity and modifier pool |
| Cluster enchantment/type | Different cluster item and pool |
| Item level | Different eligibility and market identity |
| Passive count | Different physical cluster identity |
| Required modifier selection or exact tier | Different terminal target |
| Enable/disable acceptable alternatives | Different terminal target |
| Add/remove/change an acceptable alternative | Different terminal target |
| Final rarity | Different terminal constraint |
| Extra-affix/final-state constraint | Different terminal constraint |
| Pricing league | Original source quote no longer belongs to the selected market context |

Selection order changes that canonicalize to the same target should not detach if the UI can produce them without changing the canonical identity. Cosmetic focus/blur events must never detach.

## 3.4 Changes that do not detach

These settings do not change the physical target or source market identity and therefore do not detach an attached handoff:

- objective selection;
- search depth, requested budget, or continuation request;
- value-of-time and other optimization preference controls;
- opening or closing panels;
- PolicyFlow/Constellation selection, dragging, zooming, panning, replay, or layout reset;
- text selection and technical overlay interaction;
- sorting or filtering explanatory tables.

If an economic input is edited manually, its value becomes user-authored. It must no longer be treated as a source-derived quote. That provenance change must be explicit even if the broader craft identity remains attached.

## 3.5 Sale-value provenance

Do not infer provenance by numeric equality. Track it explicitly, for example:

```ts
type SaleValueProvenance = 'empty' | 'cluster-source' | 'user';
```

Rules:

1. seed hydration may populate expected sale value with provenance `cluster-source`;
2. any direct player edit makes it `user` (or `empty` if cleared);
3. handoff detachment clears the sale value only when its provenance is `cluster-source`;
4. detachment preserves a user-authored value;
5. no result may display expected sale value or expected profit derived from a cleared source value;
6. share/export/replay must preserve a manual value as ordinary optimizer input without claiming Cluster Jewels provenance.

This resolves the observed stale `3416c` sale value and `1761.055c` expected profit without erasing a value the player deliberately entered.

## 3.6 Complete removal contract

After detachment, all of the following must be absent:

- `Loaded from Cluster Jewels` banner;
- `Back to Cluster Jewels` action tied to that seed;
- changed-identity/source-pricing warning;
- source listing identity or source market quote;
- source-derived sale value and any profit derived from it;
- optimizer-seed/source-context payload in new share links;
- optimizer-seed/source-context payload in bug reports, exports, persistence, and replay artifacts;
- Cluster Jewels provenance in result summaries, craft plans, PolicyFlow, and Constellation.

The edited optimizer may still use current base/material prices for normal cost calculation. Detachment removes the old listing/handoff context, not legitimate pricing inputs for the newly edited craft.

## 3.7 One-way and reload behavior

- Reverting every edited field to its original value must not reattach the handoff.
- Optimizing again must not reattach it.
- A share/export created after detachment must decode as an ordinary optimizer craft.
- Page reload from that detached share must remain detached.
- Browser history must not resurrect the detached seed through stale local state.
- Only a new explicit handoff initiated from Cluster Jewels may attach a new seed.

## 3.8 Likely code boundary

Start in `src/CraftOptimizer.tsx`, where seed hydration, `seedTargetIdentityMatches`, `sourceEconomicsReady`, expected sale value, and the banner currently meet. Follow the seed through every serializer and evidence surface before editing.

Prefer small shared helpers for:

- canonical handoff identity snapshots;
- provenance-aware sale-value updates;
- centralized detachment;
- serialization that includes source context only while attached.

Do not create scattered render-only filters. The data must be detached before it reaches share/export/report/replay consumers.

---

# 4. Workstream B — Generic Acceptable-Alternative Wording

The current label `Acceptable fourth modifier` is accidentally tailored to the original fixture. Phase 3G correctly supports any required count; the reviewed field run used two required modifiers plus one acceptable alternative, so the accepted modifier was the third target modifier.

Use generic player-facing wording everywhere:

```text
Acceptable alternative modifiers
Require one acceptable alternative
```

Singular contexts may use `Acceptable alternative modifier`. Never compute or hardcode `third`, `fourth`, or another ordinal from the required count.

Audit and update:

- optimizer editor headings and helper text;
- selected-target summaries;
- craft-plan prose;
- PolicyFlow node/detail text;
- Constellation labels/details;
- copy/share summaries and printable views;
- Quality Lab fixtures and string assertions;
- bundled/static release strings.

Keep the exact terminal semantics unchanged: all required modifiers plus at least one equally acceptable alternative.

---

# 5. Workstream C — Player-Legible Proof and Search Evidence

## 5.1 Separate selected-policy resolution from portfolio optimality

The reviewed screen showed a low-level status such as `UNCONSTRAINED_RESOLVED` near a statement that global optimality was not proven. Both facts can be true, but the current presentation makes them appear contradictory.

Expose two separate player-facing facts:

| Question | Example player-facing answer |
|---|---|
| Was the selected policy solved/evaluated successfully? | `Selected policy solve: Resolved` |
| Was the selected recommendation proven globally optimal over the compared portfolio? | `Portfolio optimality: Not proven` |

If the authoritative result proves global optimality, show `Portfolio optimality: Proven`. Otherwise preserve the exact non-proof state; never promote a resolved selected policy into a global proof.

Keep raw enums such as `UNCONSTRAINED_RESOLVED` available in Advanced/diagnostic evidence. Create a shared mapping from authoritative fields to player labels; do not invent screen-specific interpretations.

Acquisition safety/proof remains a separate statement. A valid selected route, a resolved selected-policy solve, and a globally proven portfolio winner answer different questions.

## 5.2 Separate per-request, portfolio, retained, and cap counters

The reviewed run combined values like:

```text
DEEP up to 10,000
5,000 expanded
30,580 retained
23,336 portfolio expanded
Stopped for host safety reserve
State cap reached
```

These are different populations and limits. Present them with stable labels:

| Field | Meaning |
|---|---|
| `New states expanded this run` | Work newly expanded by the current request |
| `Total portfolio states expanded` | Cumulative/comparison-wide expanded states from the authoritative result |
| `States retained for continuation` | Reusable states currently retained, not new work this run |
| `Requested expansion cap` | The player's requested maximum for the relevant request scope |
| `Stopping condition` | The exact authoritative reason(s) search stopped |

If more than one stop flag is authoritative, label each precisely. Do not collapse a host-reserve stop and a state-cap stop into a fabricated single cause. If a field is unavailable, say unavailable or omit the row; do not derive a guessed value by subtracting unrelated counters.

## 5.3 Reconciliation and technical detail

Add a focused diagnostic that proves the displayed values are direct mappings from the result fields. Preserve the complete raw counter object and enum values in Advanced evidence.

This workstream is copy and evidence plumbing only. It must not change:

- requested budgets;
- the definition of expanded/retained states;
- host-safety reserve behavior;
- continuation reuse;
- candidate allocation;
- pruning;
- proof/certification semantics.

---

# 6. Workstream D — Exact `3 Required + Any 1 of 3` Field Validation

Phase 3G's implementation fixture encoded the intended target, but the reviewed player PDF exercised a different generalized target: two required notables plus any one of two alternatives. That is useful generalized coverage, but it is not sufficient field evidence for the original craft.

## 6.1 Frozen field target

```text
Base:           Large Cluster Jewel
Cluster type:   10% increased Spell Damage
Item level:     84
Passives:       12
Final rarity:   Rare
Extra affixes:  Allowed

Must have all three:
  Added Small Passive Skills also grant: +(10-12) to Maximum Energy Shield (T1)
  Added Small Passive Skills also grant: +(6-8) to Intelligence (T1)
  Added Small Passive Skills have 35% increased Effect (T1)

Must also have any one of:
  Added Small Passive Skills also grant: +4 to All Attributes (T1)
  Added Small Passive Skills also grant: +(6-8) to Strength (T1)
  Added Small Passive Skills also grant: 3% increased Cast Speed (T1)
```

Resolve and assert the catalog identities already evidenced by Phase 3G:

```text
Energy Shield:   AfflictionJewelSmallPassivesGrantES3
Intelligence:    AfflictionJewelSmallPassivesGrantInt3
Increased Effect: AfflictionJewelSmallPassivesHaveIncreasedEffect2
All Attributes:  AfflictionJewelSmallPassivesGrantAttributes3
Strength:        AfflictionJewelSmallPassivesGrantStr3_
Cast Speed:      Added Small Passive Skills also grant: #% increased Cast Speed_T1
```

Use catalog identity, not display text, for production matching. Fail the fixture loudly if the eligible catalog no longer resolves exactly one expected ID.

The canonical completion predicate is:

```text
required[3]
AND
(all-attributes OR strength OR cast-speed)
AND
Rare final-state constraints
```

Each completion scenario has four modifiers and a feasible `2 prefixes / 2 suffixes` shape. Extra affixes are allowed.

## 6.2 Required browser/Worker evidence

Run the exact target through the real optimizer Worker and browser UI. Record:

- canonical required and alternative identities;
- three completion scenarios, each with four requirements;
- feasibility and final affix shape;
- selected acquisition and craft route as observed evidence, never a hardcoded expectation;
- selected-policy validity, Bellman/flow/accounting evidence, and explicit unresolved competitors;
- search budget/counter values using the new labels;
- craft-plan required progress separately from acceptable progress;
- PolicyFlow and Constellation required-versus-acceptable details;
- share/export decode round trip;
- no stale Cluster Jewels banner or source economics.

Progress must never appear as `4/6`. Required progress is `0..3/3`; acceptable progress is `0/1` or `1/1`. A state containing two acceptable alternatives is still one terminal success and one probability outcome.

## 6.3 Broad-OR versus fixed-target comparison

Under one frozen price snapshot, action allow-list, objective, and search budget, compare:

1. required three + any one of the three alternatives;
2. required three + All Attributes only;
3. required three + Strength only;
4. required three + Cast Speed only.

The terminal set of the OR target contains the terminal set of each fixed target. At exact/global resolution, its optimum cannot be more expensive than the cheapest fixed-target optimum.

Finite search may produce upper bounds that do not respect that intuitive ordering because each target receives different search allocation and may remain unresolved. Therefore:

- compare proof status before comparing point estimates;
- record lower and upper bounds when available;
- do not call an ordering mismatch a mechanics bug unless comparable certification supports that conclusion;
- if the broad target remains unresolved, state that plainly instead of presenting the cheapest observed fixed route as proof against it;
- run deeper only as the focused Phase 3H field proof, not as a permanent target-specific search branch.

Also verify directly that the OR terminal probability is the union of distinct terminal outcomes and does not double-count states satisfying multiple acceptable alternatives.

## 6.4 Fresh and handed-off entry paths

Validate both relevant entry paths:

- build the exact target in a fresh optimizer and confirm no handoff UI/source context exists;
- launch an item from Cluster Jewels, edit its target into the frozen fixture, and confirm the first identity change detaches the seed permanently.

---

# 7. Serialization, Compatibility, and Result Invalidation

## 7.1 Source context ownership

While attached, current Phase 3G-compatible source context may remain available. After detachment, new serialized artifacts must omit it rather than serialize a `detached` source object that could be misread later.

Audit:

- share URL creation and decoding;
- local persistence/session restoration;
- replay payloads;
- export/print data;
- bug-report payloads;
- Worker input assembled from the editor;
- result snapshots and evidence payloads.

Legacy shares containing valid attached Phase 3G source context must still decode. Once edited, they follow the Phase 3H one-way detachment rule.

## 7.2 Result invalidation

Identity-changing edits already invalidate stale optimizer results. Preserve that behavior and ensure detachment occurs atomically with the edit/invalidation path. There must not be an intermediate render in which the new target is shown beside the old source valuation.

Non-identity settings follow their established invalidation/recompute behavior and must not be forced through handoff detachment.

## 7.3 Required-only compatibility

Required-only targets, including historical PolicyFlow serialization and labels, must remain compatible. The generic acceptable-alternative label must not introduce an empty alternative group or change required-only target bytes.

---

# 8. Quality Lab Diagnostic Contract

Add a focused Phase 3H diagnostic and browser gates. The identifiers below are acceptance requirements; they may be split between direct/Worker/browser layers when appropriate.

| Gate | Required proof |
|---|---|
| H1 | A fresh valid Cluster Jewels handoff initially shows the attached banner and exact source quote |
| H2 | Changing a required modifier detaches immediately and removes every source reference |
| H3 | Enabling/disabling or changing acceptable alternatives detaches immediately |
| H4 | Base, cluster type, item level, passives, rarity, final-state/extra-affix constraint, and league changes detach |
| H5 | Objective, search depth, continuation controls, and graph/UI interactions do not detach |
| H6 | Reverting identity fields does not reattach; only a new Cluster Jewels Optimize action attaches |
| H7 | Share/export/replay/bug report after detachment omit source context and source-derived sale value |
| H8 | A user-authored sale value survives detachment and has no Cluster Jewels provenance |
| H9 | All player-facing labels use generic acceptable-alternative wording; no ordinal `fourth` remains |
| H10 | Selected-policy resolution and portfolio optimality render separately; raw proof enum remains in Advanced evidence |
| H11 | Per-run, portfolio, retained, cap, and stop fields map exactly to their authoritative counters |
| H12 | The exact `3 required + any 1 of 3` fixture passes Worker/browser, evidence, and round-trip checks |
| H13 | Retained Phase 3G and Phase 3F gates remain green, including required-only PolicyFlow and Constellation interaction |

H2, H3, H6, H7, H8, H9, H10, H11, and H12 need real-browser coverage where the behavior is player-visible. A component-only assertion is not sufficient evidence for banner removal, serialization, or displayed proof/counter wording.

Add negative controls for:

- hydration accidentally detaching the seed;
- equality-based reattachment after revert;
- numeric-equality inference erasing a manual sale value;
- a detached share restoring Cluster Jewels context;
- a low-level resolved enum being rendered as global optimality;
- retained states being labeled as newly expanded states;
- the broad target being flattened to six required modifiers.

---

# 9. Execution and Validation Order

## 9.1 Pre-edit

1. Pull `origin/main` and verify the baseline/head.
2. Read this plan in full.
3. Read the Phase 3G source plan and completion report in full.
4. Trace the live seed, sale-value, share/export/replay, proof, and search-counter data paths before changing code.
5. Run the existing impact recommendation command and record its output.

## 9.2 Implementation order

1. Add explicit handoff lifecycle and sale-value provenance.
2. Route all identity-changing form handlers through centralized detachment.
3. Remove detached source context at serialization boundaries.
4. Replace ordinal acceptable-modifier wording.
5. Add shared proof/counter presentation mappings.
6. Add the exact field fixture and Phase 3H diagnostic/browser gates.
7. Run the frozen target and bounds-aware fixed-target comparison.
8. Write the completion report from observed evidence.

## 9.3 Required commands

Use the repository's current Quality Lab workflow:

```bash
npm run build
npm run lint
npm run lab:typecheck
npm run -- lab:recommend -- --base 1052a346d2010af3cfc662bcdeb5482bb9a299e9 --head HEAD
npm run lab:dev
npm run lab:release
```

Run DEV once and RELEASE once after focused diagnostics are green. Do not run unit tests. Do not run EXTENDED, nightly, legacy, or long-soak suites without an independently documented reason.

## 9.4 Diff hygiene

Before commit:

- inspect all changed files;
- confirm no generated result/corpus noise is accidentally tracked;
- confirm no target-specific production branch or hardcoded winner exists;
- confirm no player-facing `Acceptable fourth modifier` string remains;
- confirm source context cannot survive the detachment path;
- confirm required-only canonical bytes and retained behavior remain stable.

---

# 10. Acceptance Criteria

Phase 3H is complete only when all of the following are true:

1. an attached Cluster Jewels handoff is present only before the first identity-changing player edit;
2. the first such edit atomically removes the banner, back-link, source quote, source context, and any source-derived sale value/profit;
3. reverting the edit does not reattach the handoff;
4. a user-entered sale value is preserved through detachment;
5. detached share/export/replay/bug-report artifacts contain no Cluster Jewels source context;
6. only a new explicit Cluster Jewels Optimize action can attach a new handoff;
7. acceptable-alternative wording is generic everywhere and contains no ordinal assumption;
8. selected-policy solve status and portfolio optimality are separate and semantically faithful;
9. new-run, portfolio, retained, requested-cap, and stopping-condition fields are visibly distinct and map directly to authoritative result fields;
10. raw enums/counters remain available in Advanced evidence;
11. the exact Large Cluster Jewel `3 + any 1 of 3` target is validated through the real Worker and browser;
12. required and acceptable progress remain separate; terminal probability uses a union without double counting;
13. the OR-versus-fixed comparison is reported with honest proof/bound qualifications;
14. Phase 3B–3G retained behavior, Phase 3F evidence fidelity, and Phase 3E Constellation interactions remain intact;
15. build, lint, Quality Lab typecheck, focused gates, DEV, and RELEASE pass;
16. the work is committed to `main`, deployed, and the live uncached page/bundle is verified at the final SHA.

---

# 11. Completion Report

Create:

```text
docs/crafting-engine/PHASE3H_HANDOFF_DETACHMENT_PROOF_LABELS_SEARCH_EVIDENCE_AND_FIELD_VALIDATION_COMPLETION_REPORT.md
```

The report must include:

- baseline and final SHAs;
- exact files changed;
- the handoff lifecycle and detachment trigger matrix;
- sale-value provenance cases;
- serialization/round-trip evidence;
- before/after player-facing labels;
- authoritative proof/counter field mappings;
- exact frozen field target and resolved catalog IDs;
- real selected route and search/proof evidence;
- OR-versus-fixed results with bounds/proof qualifications;
- H1-H13 results;
- build/lint/typecheck/diff hygiene results;
- DEV and RELEASE counts/durations;
- explicitly unrun suites;
- workflow/deployment IDs and final live SHA verification.

Do not claim global optimality if the portfolio remains unresolved. Do not claim that an observed policy is generally best. Report the evidence the run actually produced.

---

# 12. Copy/Paste Implementation Prompt

```text
Implement Phase 3H in jpitty03/cluster-jewel-research from main.

The source of truth is:
docs/crafting-engine/POST_PHASE3G_FIELD_REVIEW_AND_PHASE3H_HANDOFF_DETACHMENT_PROOF_LABELS_SEARCH_EVIDENCE_AND_FIELD_VALIDATION_PLAN.md

Read that plan, the Phase 3G source plan, and the Phase 3G completion report in full before editing. Follow the Phase 3H plan exactly.

The central product rule is one-way Cluster Jewels handoff detachment: an imported seed starts attached, but the first player edit to craft identity or source market identity permanently removes the `Loaded from Cluster Jewels` banner, back-link, source quote/context, and source-derived expected sale value/profit. Reverting fields must not reattach it. Only a new explicit Optimize action from Cluster Jewels may attach a new handoff. Track sale-value provenance so a manually entered sale value survives detachment. Omit detached source context from share, export, persistence, replay, and bug reports.

Also replace ordinal wording such as `Acceptable fourth modifier` with generic acceptable-alternative wording; separate selected-policy resolution from portfolio-global optimality; distinguish per-run expanded, portfolio expanded, retained, requested-cap, and stopping-condition evidence; and field-validate the exact Large Cluster Jewel target with all three required T1 modifiers plus any one of the three equally acceptable T1 alternatives.

Preserve Phase 3B-3G mechanics and behavior, Phase 3F explanation evidence, Phase 3E Constellation interactions, required-only compatibility, canonical state/target identity, and market-independent ranking. Do not add hardcoded winners, Craft-specific branches, a second optional-mod representation, mechanics changes, or unit tests.

Add the Phase 3H H1-H13 focused diagnostics and real-browser gates. Run build, lint, Quality Lab typecheck, impact recommendation, DEV once, and RELEASE once. Do not run EXTENDED, nightly, legacy, or long-soak suites unless an implementation finding independently requires and documents one.

Create the specified Phase 3H completion report with observed evidence. Commit and push the implementation and report to main, verify the GitHub Pages deployment at the final SHA, and return the commits, workflow/deployment IDs, live verification, validation counts/durations, and explicitly unrun suites.
```
