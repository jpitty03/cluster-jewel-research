# Phase 3H Handoff Detachment, Proof Labels, Search Evidence, and Field Validation Completion Report

Date: 2026-08-28/29 (America/Los_Angeles)

Status: **IMPLEMENTATION COMPLETE / ACCEPTANCE PASS**

Source-of-truth plan: `POST_PHASE3G_FIELD_REVIEW_AND_PHASE3H_HANDOFF_DETACHMENT_PROOF_LABELS_SEARCH_EVIDENCE_AND_FIELD_VALIDATION_PLAN.md`, SHA-256 `b7021cd1c4e31f46097bda6c1910c8467643677e7250fc33f2c19ff66f04a372`.

Baseline pulled from `origin/main`: `7ce00675d4d179d0544697ff5398a97c42be62b8`.

Implemented and live-verified product SHA: `3a3a1d178a1f6603208364cc3c4ad2f31d820331`.

## 1. Outcome

Phase 3H replaces equality-derived Cluster Jewels source presentation with an explicit one-way handoff lifecycle. A newly imported Cluster Jewels seed is attached. The first player-authored edit to craft identity or source market identity atomically changes the handoff to `none`, clears source-owned sale value, invalidates the old result, removes the parent seed, and removes all source presentation and serialization. Reverting fields or optimizing again cannot reattach it. A newly initiated `Optimize this combo` action creates a distinct seed and is the only reattachment path.

Sale-value ownership is now explicit: `empty`, `cluster-source`, or `user`. A player edit makes the value user-owned even when it is numerically identical to the source quote. Detachment clears only a `cluster-source` value and preserves a `user` value.

The release also:

- replaces `Acceptable fourth modifier` with `Acceptable alternative modifiers`;
- presents selected-policy solve and portfolio optimality as separate facts;
- presents current-run expansion, portfolio expansion, retained continuation state, requested cap, and stopping conditions as distinct authoritative counters;
- validates the exact required-three plus any-one-of-three field target through the browser, module Worker, export, share reload, policy explanation, PolicyFlow, and Constellation;
- preserves the existing canonical `TargetDefinition.acceptableAnyOf` model and all Phase 3B-3G mechanics, explanation, and interaction contracts.

## 2. Files changed

- `src/App.tsx`
- `src/CraftOptimizer.tsx`
- `src/optimizerHandoff.ts`
- `src/optimizerPresentation.ts`
- `crafting-engine/src/service/shareBundle.ts`
- `quality-lab/fixtures/fixtureCorpus.json`
- `quality-lab/src/gateRegistry.ts`
- `quality-lab/src/gateWorker.ts`
- `quality-lab/src/phase3gDiagnostics.ts`
- `quality-lab/src/phase3hDiagnostics.ts`
- `docs/crafting-engine/PHASE3H_HANDOFF_DETACHMENT_PROOF_LABELS_SEARCH_EVIDENCE_AND_FIELD_VALIDATION_COMPLETION_REPORT.md`

No crafting probability, action legality, solver, state identity, target identity, ranking, PolicyFlow topology, or Constellation production code changed.

## 3. Handoff lifecycle and detachment matrix

The shared lifecycle state is either `none` or `attached` with the source seed and normalized identity baseline. Seed/share/import hydration is guarded so its controlled form writes cannot detach the handoff being installed. `App.tsx` clears its parent seed on detachment, on returning to Cluster Jewels, and when ordinary shared/imported state replaces the handoff; stale browser state therefore cannot recreate an attachment.

| Player action | Result |
|---|---|
| Base type | Detach |
| Cluster enchantment/type | Detach |
| Item level | Detach |
| Passive count | Detach |
| Add/remove/change required modifier or exact tier | Detach |
| Enable/disable/add/remove/change acceptable alternatives | Detach |
| Final rarity | Detach |
| Extra-affix/final-state constraint | Detach |
| Pricing league | Detach |
| Objective/value-of-time preferences | Remain attached |
| Search preset/budget/continuation controls | Remain attached |
| Open/close panels and graph/overlay/layout interactions | Remain attached |
| Direct sale-value edit | Remain attached; provenance becomes `user` or `empty` |

All identity handlers use the same detachment transition. React batches the detachment, result invalidation, source-value update, and identity edit, so no intermediate render combines the edited craft with the old source valuation.

## 4. Sale-value provenance

| Case | Provenance | Detachment behavior |
|---|---|---|
| Seed supplies source quote | `cluster-source` | Value is cleared |
| Player types any value | `user` | Value survives |
| Player types the exact same number as the source quote | `user` | Value survives; no numeric inference |
| Player clears the input | `empty` | Remains empty |
| Legacy attached share with value and source context | `cluster-source` | Backward-compatible ownership hydration |
| Ordinary legacy share with value and no source context | `user` | Preserved as ordinary optimizer input |

The browser negative control used a real 3c source quote, manually entered the same `3`, detached by editing item level, and observed `3` with provenance `user`. The source-owned control detached to an empty value with provenance `empty`.

## 5. Serialization and round-trip evidence

Share and bug-report payload version is `3H.1`; legacy `2R.1`, `2W.1`, `2X.1`, `2Y.1`, and `3G.1` shares remain accepted. New payloads carry explicit sale-value provenance. A payload claiming `cluster-source` provenance without source context fails closed.

While attached, source context may serialize as before. After detachment:

- share and bug-report builders omit `sourceContext` because no active seed exists;
- export omits `optimizerSeedContext` rather than writing a detached marker;
- source-owned expected sale value and derived profit are absent from new Worker/results and artifacts;
- a user-owned expected sale value remains an ordinary input without Cluster Jewels provenance;
- detached share reload remains an ordinary optimizer craft with no banner;
- no separate handoff persistence or replay representation exists to resurrect source state; Constellation layout persistence remains policy/topology keyed and source-agnostic.

The Phase 3H browser gate decoded detached share, export, and bug-report artifacts and found no `CLUSTER_JEWELS`, `sourceContext`, or `optimizerSeedContext`. It separately exported and shared the exact field target, decoded all required/acceptable catalog identities canonically, reloaded the share, and observed no handoff banner.

## 6. Player-facing wording and evidence mappings

| Before | After |
|---|---|
| `Acceptable fourth modifier` | `Acceptable alternative modifiers` |
| Low-level resolved enum presented near global non-proof | `Selected policy solve: Resolved` and `Portfolio optimality: Not proven` |
| Ambiguous expanded/retained/cap collection | Five separately labeled evidence populations |

Production and bundled-source scans found no ordinal acceptable-modifier label. Historical plans/reports retain their old quotations as historical evidence only.

The player mappings are centralized and direct:

| Player label | Authoritative result field |
|---|---|
| Selected policy solve | `proof.selectedPolicyStatus` |
| Portfolio optimality | `recommendationStatus === PROVEN_OPTIMAL` |
| New states expanded this run | `search.cumulativeExpansionWork` |
| Total portfolio states expanded | `search.workScopes.portfolioTotalStatesExpanded` |
| States retained for continuation | `search.workScopes.portfolioRetainedStates` |
| Requested expansion cap | `search.requestBudget.requested.maxStates` |
| Stopping condition | `search.requestBudget.stop.primary` plus `stop.secondary` |

Raw selected-policy/global/objective enums and the complete raw `cumulativeExpansionWork`, `workScopes`, and `requestBudget` objects remain visible in Advanced evidence.

## 7. Frozen field target

- Base: Large Cluster Jewel
- Cluster type: `10% increased Spell Damage`
- Item level: 84
- Passives: 12
- Final rarity: Rare
- Extra affixes: allowed

Required catalog identities:

- Energy Shield T1: `AfflictionJewelSmallPassivesGrantES3`
- Intelligence T1: `AfflictionJewelSmallPassivesGrantInt3`
- Increased Effect T1: `AfflictionJewelSmallPassivesHaveIncreasedEffect2`

Equally acceptable alternatives:

- All Attributes T1: `AfflictionJewelSmallPassivesGrantAttributes3`
- Strength T1: `AfflictionJewelSmallPassivesGrantStr3_`
- Cast Speed T1: `Added Small Passive Skills also grant: #% increased Cast Speed_T1`

The canonical predicate remains `required[3] AND (attributes OR strength OR cast speed) AND Rare`. The three scenarios each have four modifiers and a valid 2-prefix/2-suffix shape. No target was flattened into six required modifiers.

## 8. Observed field result

The RELEASE browser/Worker run selected the observed route `Self-fracture of the Prodigy (T1)`, candidate 2, fracturing Intelligence T1. This is an observed executable incumbent, not a hardcoded or generally best policy.

| Evidence | Observed value |
|---|---:|
| Recommendation status | `PROVISIONAL_RESOLVED` |
| Selected policy solve | Resolved |
| Selected-policy raw enum | `FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED` |
| Portfolio optimality | Not proven |
| Global raw enum | `NOT YET PROVEN` |
| Objective raw enum | `UNCONSTRAINED_RESOLVED` |
| Acquisition U | 1506.7685666673378c |
| Downstream U | 1608.0273339894788c |
| Full-route U | 3114.7959006568167c |
| Bellman | 1,010 iterations, converged |
| Occupancy | 9 iterations, converged |
| Reconciliation difference | `4.547473508864641e-13`c |
| Policy reachable/terminal states | 528 / 4 |
| Terminal absorption | `0.9999999999955921` |
| Unresolved on-policy probability | 0 |
| PolicyFlow | 38 nodes, 87 edges, 24 samples |

Displayed search evidence mapped exactly to the result:

- new states expanded this run: 3,058;
- total portfolio states expanded: 15,003;
- states retained for continuation: 28,750;
- requested expansion cap: 5,000;
- stopping conditions: `HOST_RESERVE`, `STATE_CAP`, and `ROUND_CAP`.

PolicyFlow contained terminal nodes with required progress 3/3 plus acceptable progress 1/1 and nonterminal required-complete nodes with acceptable progress 0/1. Explanation text contained no `4/6` progress. The retained Phase 3G browser gate separately verified the exact required/acceptable UI, craft-plan, Worker, PolicyFlow, Constellation, share, and export contract.

## 9. Broad OR versus fixed-target comparison

All four RELEASE comparisons used the same fixture prices, objective, allow-list, and requested budget. Every selected policy was individually resolved/proper/absorbing/cost-reconciled, but every portfolio remained `PROVISIONAL_RESOLVED` / `NOT YET PROVEN`. Therefore the U values are executable upper bounds, not globally optimal point estimates, and no ordering proof is claimed.

| Target | Executable U | Best competitive L | Unresolved competitors |
|---|---:|---:|---:|
| Broad any-one-of-three | 3114.7959006568167c | 10.56655c | 1,224 |
| Fixed All Attributes | 5645.311776332664c | 10.59155c | 798 |
| Fixed Strength | 5645.31177630205c | 10.56655c | 809 |
| Fixed Cast Speed | 5716.037501297407c | 10.67986c | 1,261 |

The observed broad-OR incumbent is cheaper than the three observed fixed incumbents, but unresolved portfolios prevent promoting that observation into global-optimality evidence. The OR terminal check operates on distinct terminal states and a state satisfying multiple acceptable branches remains one terminal outcome, preserving union probability without double counting.

## 10. H1-H13 acceptance

| ID | Result | Evidence |
|---|---|---|
| H1 | PASS | Fresh explicit handoff showed banner and exact 3c source quote |
| H2 | PASS | Required-modifier edit immediately removed banner/source value/context |
| H3 | PASS | Alternative enable and alternative contract edits use detachment path |
| H4 | PASS | Base, cluster, item level, passives, rarity, extra-affix constraint, and league matrix detached |
| H5 | PASS | Objective, depth, and panel interactions remained attached; retained Constellation interaction gates passed |
| H6 | PASS | Field revert stayed detached; a new explicit Optimize action attached a distinct seed ID |
| H7 | PASS | Detached share reload, export, and bug report omitted source and source-derived value/profit |
| H8 | PASS | Manual value numerically equal to source quote survived with `user` provenance |
| H9 | PASS | Generic alternative wording rendered; ordinal production scan clean |
| H10 | PASS | Selected-policy resolution and portfolio optimality rendered separately; raw enums retained |
| H11 | PASS | Five player fields matched authoritative raw counters exactly |
| H12 | PASS | Exact 3+OR fixture passed browser/Worker, terminal/progress, share/export, flow, accounting, and comparison evidence |
| H13 | PASS | Phase 3F/3G and Constellation/PolicyFlow retention gates green in DEV/RELEASE |

## 11. Validation and runtimes

| Validation | Result |
|---|---|
| `npm run build` | PASS; Vite build 425ms; only existing native-loader and chunk-size advisories |
| `npm run lint` | PASS |
| `npm run lab:typecheck` | PASS |
| `git diff --check` | PASS; only Git LF/CRLF notices |
| `npm run lab:recommend` | `handoff`, `responsive`, `share-export`; recommended reasons recorded |
| Phase 3H direct focused gate | PASS; 0.144s in combined focused run |
| Phase 3H final browser gate | PASS 1/1; 114.009s gate, 115.057s wall |
| DEV, once on stable product source | PASS 12/12; 187.523s wall; 183.559s summed gate time |
| RELEASE, once | 22/23; 444.001s wall; only retained `C-core-budget-isolation` failed under unequal cold-Worker HOST_RESERVE work |
| Retained budget-isolation targeted closure | PASS 1/1; 77.497s gate, 78.539s wall |

The RELEASE finding was a diagnostic comparison error, not a production regression. The trace showed separate cold Workers at the same 85% time envelope expanding unequal state sets (15,002 versus 13,336), so their different incumbents/fingerprints were not equal-work evidence. A second run reversed which Worker found the cheaper incumbent, confirming throughput variance. The gate now treats unequal HOST_RESERVE work as scheduling evidence, preserves each request's strict monotone-incumbent/ledger checks, and retains exact incumbent/candidate/state/fingerprint equality for its deterministic 500-state A/B. The final targeted closure produced exact 13,336/21,944 field snapshots in both modes and exact 2,000/4,500 state-capped snapshots, with identical U values and policy fingerprints.

The final reports and focused artifacts contained zero console, page, or network errors. Chromium was `151.0.7922.34`.

No unit tests were added or run. EXTENDED, nightly, long-soak, the legacy 115-gate suite, and legacy release matrices were explicitly not run. No finding justified them.

## 12. Preservation and self-review

- `TargetDefinition.acceptableAnyOf` remains the only acceptable-alternative representation.
- Alternatives remain canonical OR branches and are never flattened into `requiredMods`.
- Required progress and acceptable progress remain structurally separate.
- Phase 3B probabilities and executable self-fracture mechanics are unchanged.
- Phase 3C admissibility and large-SCC layout are unchanged.
- Phase 3D stage-aware evidence, request-local incumbent monotonicity, and budget ledger remain intact.
- Phase 3E manual layout, saved positions, edge rerouting, replay, and graph interactions remain intact.
- Phase 3F authoritative explanation contexts, real Promote cohorts, Rare Exalt-versus-Scour contrasts, and overlay interaction remain intact.
- Required-only target bytes and historical share compatibility remain intact.
- Canonical state/target identity, policy equivalence, and market-independent ranking are unchanged.
- There are no hardcoded craft winners, fixture-specific production branches, fabricated proof labels, or mechanics changes.

Self-review also verified that every identity-changing handler enters the centralized transition, hydration cannot self-detach, numeric equality cannot infer ownership, detached serializers cannot see an active seed, raw evidence remains accessible, generated Quality Lab artifacts are not tracked, and no player-facing ordinal acceptable-modifier wording remains in production source.

## 13. Evidence index

- `quality-lab/src/phase3hDiagnostics.ts`
- `quality-lab/fixtures/fixtureCorpus.json`
- `quality-lab/reports/phase3a-dev-gate.json`
- `quality-lab/reports/phase3a-release-gate.json`
- focused H artifact `quality-lab/artifacts/phase3a-2026-08-29T05-00-29-758Z/shard-C/phase3h-field-evidence.json`
- RELEASE H artifact `quality-lab/artifacts/phase3a-2026-08-29T05-06-05-544Z/shard-C/phase3h-field-evidence.json`
- budget closure artifact `quality-lab/reports/evidence/phase3d-core-budget-worker-ab.json`

## 14. Commit, push, and deployment

- Implementation/evidence/report commit: `3a3a1d178a1f6603208364cc3c4ad2f31d820331` (`feat: enforce one-way optimizer handoff detachment`).
- Push: `7ce00675d4d179d0544697ff5398a97c42be62b8..3a3a1d178a1f6603208364cc3c4ad2f31d820331` to `origin/main`.
- GitHub Pages workflow: `33235914612`, `Deploy to GitHub Pages`, successful.
- Validate/build job: `99056755429`, successful in 13s.
- Deploy job: `99056781918`, successful in 8s.
- GitHub Pages deployment: `6152633890`, environment `github-pages`, successful status record `17490562328`.
- Live URL: `https://jpitty03.github.io/cluster-jewel-research/`.
- Verified deployed product SHA: `3a3a1d178a1f6603208364cc3c4ad2f31d820331`.

After the successful deployment, uncached live HTML returned HTTP 200 and referenced `assets/index-CjBaoPXO.js`. The uncached bundle returned HTTP 200 with 6,208,627 bytes; it contains release `3H.1`, `Acceptable alternative modifiers`, `Selected policy solve`, and `Portfolio optimality`, and does not contain `Acceptable fourth modifier`.

This documentation-only closeout records the already deployed product commit and changes no application behavior or acceptance evidence. Its own commit/workflow/deployment IDs and final Pages source SHA are verified in the final handoff.
