# Phase 3K Guided Player Constellation Completion Report

Date: 2026-08-29/30 Pacific time
Plan: `POST_PHASE3J_FIELD_REVIEW_AND_PHASE3K_GUIDED_PLAYER_CONSTELLATION_PLAN.md`

## 1. Outcome and immutable references

Phase 3K replaces both default Phase 3J presentations—the 24-card Simple Craft Instructions stack and the raw Markov graph—with one always-visible, top-level **Crafting Constellation**. The player-facing route is compiled in the crafting-engine domain from certified Phase 3J player rules and certified exact PolicyFlow transitions. React only renders that model and changes the single explanatory selection.

The raw graph remains available as **Technical policy graph** under Research diagnostics. Its Phase 3E/3F renderer and interaction contract remain intact.

| Reference | SHA / ID | Observed result |
| --- | --- | --- |
| Requested Phase 3J closeout baseline | `d289068a7a6cf92a5b6a247edf60341c0f9659cc` | Ancestor of the implementation baseline |
| Actual baseline | `d240be2608d0cbe89415bf97a2957c670399be8a` | Newer plan-only `main`, descended from the requested closeout |
| Implementation commit | `79f505bc8b3f1c8ec771c0a4395b5693f325abf4` | Pushed to `main`; product and Quality Lab implementation |
| Implementation workflow | `33295997466` | Successful GitHub Pages workflow for the exact implementation SHA |
| Implementation deployment | `6163772013` | Successful `github-pages` deployment |
| Closeout / final deployed SHA | This documentation-only report commit | Its immutable SHA and final Pages run are necessarily obtained after this file is committed; they are recorded in the final handoff |

No reverted post-3J source was restored, copied, cherry-picked, or recreated. Direct gate K1/K19 found zero restored current-item sources, zero forbidden diagram runtimes, and zero added unit-test files. The implementation adds no paste parser, manual item editor, live tracker, route-start reset workflow, outcome simulator, Archify integration, iframe, generated standalone graph HTML, or automatic progression.

## 2. Exact files changed

The implementation commit changed exactly these 15 files:

- `crafting-engine/src/index.ts`
- `crafting-engine/src/service/guidedCraftConstellation.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/src/service/shareBundle.ts`
- `quality-lab/src/gateRegistry.ts`
- `quality-lab/src/gateWorker.ts`
- `quality-lab/src/impactRecommendation.ts`
- `quality-lab/src/phase3iDiagnostics.ts`
- `quality-lab/src/phase3kDiagnostics.ts`
- `src/App.css`
- `src/CraftOptimizer.tsx`
- `src/components/GuidedCraftConstellation.tsx`
- `src/components/MarkovConstellation.tsx`
- `src/components/OnboardingModal.tsx`
- `src/optimizerInformationArchitecture.ts`

This closeout adds only `docs/crafting-engine/PHASE3K_GUIDED_PLAYER_CONSTELLATION_COMPLETION_REPORT.md`.

## 3. Information architecture

Before Phase 3K, the default order was:

1. Recommendation
2. How to craft it: 24 expanded player-rule cards
3. Shopping list
4. Markov Policy Constellation: raw 23-node/49-edge policy topology
5. Four research disclosures

After Phase 3K, the primary order is:

1. Recommendation
2. Crafting Constellation
3. Shopping list
4. Research disclosures

The player-facing Crafting Constellation has no `details`, disclosure, accordion, or `OptimizerDisclosure` ancestor. The Technical policy graph is closed by default inside Research diagnostics, defers its first mount until opened, and remains mounted for the current result identity after that first opening.

## 4. Domain ownership, certification, and failure behavior

`compileGuidedCraftConstellation` is owned by `crafting-engine/src/service/guidedCraftConstellation.ts`. `optimizerService` supplies its certified Phase 3J player plan and exact PolicyFlow; the service result, share/export evidence, and bug evidence carry the compiled model. `CraftOptimizer.tsx` does not compile the guided graph.

The compiler emits:

- route identity, physical start, required and acceptable targets, and authoritative finish condition;
- guided nodes, displayed condition/action choices, and guided edges;
- player-rule IDs, policy-rule indices, source-state keys, exact source PolicyFlow node/edge IDs, and `CERTIFIED` status on every displayed element;
- a separate evidence map covering every node, condition, action choice, and edge;
- represented-rule, state, node, edge, and fingerprint reconciliation.

The semantic grouping key retains action, recovery, preparation/final scope, fracture meaning, compatible target slot, minimal exception set, target progress, terminal eligibility, and next guided stage. Therefore equivalent display conditions may be compressed, but action-changing outcomes cannot hide under `Other` and mechanically different junk is not declared interchangeable.

Compilation fails closed to an empty, withheld guide when either source is uncertified, identity/fingerprint evidence is absent, a state maps ambiguously, a displayed transition lacks an exact PolicyFlow edge, start or terminal ownership is ambiguous, Finish is unreachable, or rule/state/edge coverage does not reconcile. The UI directs withheld results to Research diagnostics and never guesses a route.

## 5. Rule and edge reconciliation

The final real-Worker witness certified:

| Evidence | Observed value |
| --- | ---: |
| Positive policy rows | 267 |
| Certified player rules | 24, represented exactly once |
| Exact actionable player-rule states | 572 |
| Expected visits | `740.8471930308734` |
| Raw PolicyFlow nodes / edges | 23 / 49 |
| Guided nodes / edges | 9 / 17 |
| Guided evidence-map entries | 69 |
| Exact guided destination checks | 17 |
| Authoritative terminal edges | 2 |

The nine visual nodes are a semantic player-facing projection; they are not solver states. All 572 exact actionable states remain in the certified conditions and evidence map.

Magic evidence contains separate `alteration_orb`, `augmentation_orb`, and `regal_orb` actions. Alter/Augment loops return to the correct Magic evaluation stage, while Regal advances only through its exact PolicyFlow destination.

Fracture evidence separately represents preparation completion, wanted-fracture cleanup, and junk-fracture reacquisition. The reacquisition edge returns to the selected physical start; wanted-fracture cleanup proceeds to final rolling. These states are not merged.

Rare finishing retains the action distinction visible in the field witness:

- a safe open prefix with no exception junk may use Exalted Orb;
- a blocked prefix or exception junk such as Heavy Hitter or Smite the Weak requires Orb of Scouring and returns to final Magic rolling.

The frozen reconciliation fixture exercises the same paired Exalt/Scour structure with its certified minimal exceptions, Call to the Slaughter and Vicious Bite. Minimal-exception identities stay evidence-driven rather than hardcoded in the renderer.

Finish is reachable only through the two authoritative success edges. Its evidence retains every required target, any acceptable-target branch, final Rare rarity, and the authoritative extra-affix allowance.

## 6. Observed field witness

The selected Martial self-fracture result rendered the following evidence-derived route:

```text
Clean Normal physical start
  -> Orb of Transmutation
  -> evaluate preparation Magic
       -> Alteration loop when target access is blocked
       -> Augmentation loop when the compatible target slot is open
       -> Regal when the Magic roll is keepable
  -> complete four-mod fracture preparation
  -> Fracturing Orb
       -> wanted fracture -> Scour cleanup -> evaluate final Magic
       -> junk fracture -> reacquire selected clean physical start
  -> evaluate final Magic -> Regal
  -> evaluate final Rare
       -> safe open prefix, no exception junk -> Exalted Orb
       -> blocked prefix / Heavy Hitter / Smite the Weak -> Scouring Orb -> final Magic
  -> Finish only on authoritative target-complete evidence
```

This is an observed diagnostic witness generated from the selected craft's actual target/action/evidence model, not a hardcoded production route or a claim of global optimality.

The final focused browser artifacts are:

- desktop: `quality-lab/artifacts/phase3a-2026-08-30T05-36-47-126Z/shard-C/phase3k-guided-constellation-1440.png`
- 420px: `quality-lab/artifacts/phase3a-2026-08-30T05-36-47-126Z/shard-C/phase3k-guided-constellation-420.png`
- 390px: `quality-lab/artifacts/phase3a-2026-08-30T05-36-47-126Z/shard-C/phase3k-guided-constellation-390.png`

The default guide measured 1,865px high at 1440px, 3,749px at 420px, and 3,855px at 390px. At every viewport the document and body widths exactly equaled the viewport, so there was no horizontal overflow.

## 7. Selection, copy, identity, and evidence

Selecting a guided node updates one compact owner with `WHEN -> USE -> THEN -> Why this action?`. Keyboard selection passed, focus remains visible, selectable text remains selectable, and the reduced-motion path disables nonessential motion. Browser instrumentation observed zero added Worker events.

Selection is explanatory only. The UI explicitly says that it explains the route and does not track an item or advance the craft. It does not accept pasted items, infer that a player's item matches the selected node, call the selection a current step, automatically progress, or simulate an outcome.

Copy Playbook changed from the Phase 3J 7,569-byte flat rulebook presentation to a 7,847-byte guided-stage playbook in the Martial witness. It still contains all 24 certified player rules, now ordered under their guided stages with their evidence retained.

The selected witness Shopping list was 448 bytes before and after guided selection, byte-for-byte identical. Full-route acquisition/downstream accounting and material identities remain governed by the retained Phase 3D/3J evidence gates. Share bytes were also identical before and after selection. Request policy registry version `REQUEST_POLICY_REGISTRY_PHASE3D_V1`, selected policy fingerprint `policy-b8fc0f29`, selected bundle `bundle:family_fracture_Primordial Bond:independent`, cache identity, result identity, canonical state/target identity, required-plus-acceptable semantics, and share/handoff ownership were unchanged.

Export and bug evidence retain all exact Phase 3J player-plan, PolicyFlow, policy topology, mechanics, probability, ranking, acquisition, target, and source identity fields. They add the full Guided Constellation and its evidence map; no Phase 3J evidence was removed and the share schema was not revised.

## 8. Technical policy graph preservation

The raw renderer is renamed **Technical policy graph** and moved under Research diagnostics. Browser K16 observed:

- no mount while the containing disclosure remained closed;
- a mount on first opening;
- the same mounted graph and selected element after closing and reopening for the current result identity.

Retained Phase 3E/3F gates passed topology/fingerprint preservation, probability and occupancy labels, pan/zoom, replay and Screensaver, node/edge selection, manual dragging, keyboard nudging, edge rerouting, persisted layout, Reset View, Reset Layout, Fit All, Route Focus, fullscreen, overlay gesture exclusion, selectable text, and reduced-motion behavior. The raw renderer was not reused for the player guide.

## 9. K1-K20 acceptance evidence

| Gate | Result | Observed evidence |
| --- | --- | --- |
| K1 | PASS | `d240be2` descends from `d289068`; no discarded post-3J source restored |
| K2 | PASS | Engine-owned deterministic compiler produced a certified model from player rules plus PolicyFlow |
| K3 | PASS | 69-entry evidence map covers every displayed node, condition/action choice, and edge |
| K4 | PASS | All 24 certified player rules represented exactly once; 572 exact states retained |
| K5 | PASS | Semantic compression key preserves every action-changing and scope-changing dimension |
| K6 | PASS | Nine readable guided nodes cover start, rolling, promotion/preparation, fracture, recovery, Rare finish, and Finish |
| K7 | PASS | Distinct Alteration, Augmentation, and Regal actions/destinations observed |
| K8 | PASS | Wanted-fracture cleanup and junk-fracture reacquisition both observed and kept separate |
| K9 | PASS | Exalt-safe and Scour-blocked/exception branches observed with exact minimal-exception evidence |
| K10 | PASS | All 17 guided edges reconciled to exact certified PolicyFlow destinations, including loops/recovery |
| K11 | PASS | Two terminal edges; Finish retains target branches, Rare rarity, and extra-affix truth |
| K12 | PASS | Default result: one top-level guide, zero rule-card stacks, zero mounted technical graphs |
| K13 | PASS | One detail owner; selection caused zero Worker traffic |
| K14 | PASS | Complete guided Copy Playbook; 448-byte Shopping list and share output unchanged by selection; identities retained |
| K15 | PASS | Exact Phase 3J export/bug evidence retained and guided evidence map added |
| K16 | PASS | Technical graph deferred, retained after opening, and retained selection/interactions |
| K17 | PASS | 1440/420/390 layouts had exact viewport width, keyboard/focus/reduced-motion coverage, and no overflow |
| K18 | PASS | Uncertified and colliding negative controls yielded withheld empty guides and zero guessed nodes |
| K19 | PASS | Zero forbidden runtimes/features/restored current-item sources/unit tests |
| K20 | PASS | Frozen 267/24/572/`740.8471930308734` reconciliation plus retained gates and hygiene all closed |

## 10. Retained gates, supersession, and validation ledger

The impact-selected focused run covered 22 retained Phase 3B-3J and Phase 3K gates, including the Phase 3E manual-layout gate and Phase 3F detail-overlay gate. It excluded only explicitly forbidden long-soak matches and assertions superseded by K12/K16.

The superseded default-presentation assertions are:

- the Phase 3J 24-card Simple Craft Instructions stack is visible by default;
- the Phase 3J raw Markov graph is a top-level, always-mounted primary result.

Phase 3J direct certification remains active. K4/K12 replace the old default-card assertion, and K16 plus retained D-shard interaction gates replace the old top-level raw-graph assertion. No mechanics, solver, probability, ranking, acquisition, target, or PolicyFlow behavior was superseded.

| Validation | Count | Result | Wall duration | Additional observed timing |
| --- | ---: | --- | ---: | --- |
| Focused impact-selected retained run | 22/22 | PASS | 553.569s | 548.339s summed; 506.616s solver-heavy; 294.695s visual |
| Build | 1/1 | PASS | 1.556s | Vite build 538ms; only existing configuration/chunk warnings |
| Lint | 1/1 | PASS | 0.287s | No lint errors |
| Quality Lab typecheck | 1/1 | PASS | 0.504s | No type errors |
| Diff hygiene | 1/1 | PASS | 0.080s | `git diff --check` clean |
| Hygiene subtotal | 4/4 | PASS | 2.437s | Run after focused closure |
| DEV, exactly once | 16/16 | PASS | 246.003s | 241.592s summed; 202.176s solver-heavy; 100.752s visual; 2.074s overhead |
| RELEASE, exactly once | 29/29 | PASS | 636.621s | 632.115s summed; 546.678s solver-heavy; 370.047s visual; 2.222s overhead |

Stable reports and run IDs:

- focused: `quality-lab/reports/phase3a-targeted-gate.json`, run `2026-08-30T05-36-47-126Z`;
- DEV: `quality-lab/reports/phase3a-dev-gate.json`, run `2026-08-30T05-46-44-180Z`;
- RELEASE: `quality-lab/reports/phase3a-release-gate.json`, run `2026-08-30T05-50-55-853Z`.

Historical failures remain visible in their immutable artifact runs:

- two pre-edit baseline capture attempts (`04-50-34-160Z`, `04-53-18-977Z`) hit a hidden-locator wait and screenshot timeout; the successful baseline capture `04-54-55-882Z` passed 2/2 and recorded 24 default cards and the raw graph;
- Worker runs `05-25-03-713Z`, `05-26-03-710Z`, and `05-26-47-049Z` exposed diagnostic assumptions of 2 instead of 4 paired exception rows, 2 instead of 1 unique exception set, and 588 aggregate PolicyFlow states instead of the certified 572 actionable player-rule states. The diagnostics were corrected without changing the certified production model; `05-27-29-540Z` passed 3/3;
- browser runs `05-28-07-684Z` and `05-29-03-521Z` exposed insufficient explicit Rare labels and an incomplete audit regex. The visible labels now state “Safe open prefix slot” and “Blocked prefix or exception junk”; `05-29-38-708Z` passed 3/3.

This preserves suite history rather than rewriting it.

The following suites were explicitly not run: unit tests, EXTENDED, nightly, long-soak, the legacy 115-gate suite, and legacy release matrices. No separate implementation finding required any of them.

## 11. Hosted workflow, deployment, and live verification

The implementation workflow was [33295997466](https://github.com/jpitty03/cluster-jewel-research/actions/runs/33295997466), workflow database ID `315756490`, named `Deploy to GitHub Pages`, and completed successfully for exact SHA `79f505bc8b3f1c8ec771c0a4395b5693f325abf4`.

| Hosted record | ID | Result |
| --- | ---: | --- |
| `validate-and-build` job | `99215642933` | PASS, 17s |
| `deploy` job | `99215675313` | PASS, 8s |
| Pages deployment | `6163772013` | `success` |
| Waiting status | `17520286524` | recorded |
| Queued status | `17520286815` | recorded |
| In-progress status | `17520287776` | recorded |
| Successful status | `17520290513` | `success` |

The deployed site is `https://jpitty03.github.io/cluster-jewel-research/`. A cache-busted HTML request returned HTTP 200 and named `assets/index-DJ_rc5Iw.js` plus `assets/index-BnhM9Hb-.css`. An uncached (`X-Cache: MISS`, `x-proxy-cache: MISS`, age 1) JavaScript request returned HTTP 200 and 6,226,413 bytes. Its SHA-256 was:

```text
3640473DF270926C09C2112DDF16F56704D8B01DDB3D65D5AB50198B5E812511
```

That exactly matched the locally built content-hashed asset. The live bundle contains release marker `3K.1`, **Crafting Constellation**, and **Technical policy graph**. It contains neither the retired **Markov Policy Constellation** title nor the tree-shaken default-card markers `How to craft it`, `Simple Craft Instructions`, or `player-rule-card`. Direct browser evidence additionally confirms that the Technical policy graph is closed and unmounted by default.

The report commit is documentation-only and changes no product, evidence, or validation behavior. Its final SHA, workflow/job/deployment/status IDs, and a second uncached Pages check are recorded in the final handoff so `main` and Pages can be verified at that exact closeout SHA without a self-referential commit claim.

## 12. Conclusion

Phase 3K closes the field-review presentation problem without adding a second policy engine or a live item tracker. The player sees one compact, selected-craft route whose nodes, conditions, loops, recovery, and Finish are certified back to Phase 3J rules and exact PolicyFlow transitions. The full raw technical graph remains available for research with its established interaction behavior, while all frozen Phase 3J reconciliation values and identity/accounting contracts remain intact.
