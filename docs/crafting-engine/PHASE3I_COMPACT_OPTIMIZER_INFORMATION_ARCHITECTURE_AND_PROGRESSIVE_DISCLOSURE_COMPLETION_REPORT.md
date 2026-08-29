# Phase 3I Compact Optimizer Information Architecture and Progressive Disclosure Completion Report

Date: 2026-08-29 (America/Los_Angeles)

Status: **IMPLEMENTATION COMPLETE / ACCEPTANCE CLOSED WITH DOCUMENTED TARGETED REPAIRS**

Source-of-truth plan: `POST_PHASE3H_FIELD_REVIEW_AND_PHASE3I_COMPACT_OPTIMIZER_INFORMATION_ARCHITECTURE_AND_PROGRESSIVE_DISCLOSURE_PLAN.md`, SHA-256 `810037fac766212d1db4af18dc4e36c97f5dd1b55735ea6a5afa1ac32ad5f5be`.

Baseline pulled from `origin/main`: `b8ad453402b7f1b08ac252c42f5a3b80c2daad15`.

Implementation commit, closeout commit, final Pages source SHA, and deployment identifiers are recorded in section 14 after push and live verification.

## 1. Outcome

The Craft Optimizer is now import-first and compact by default. A fresh page presents Import optimizer JSON as the primary action, with presets and manual construction secondary. A valid seed, share, or JSON import produces one compact structured target summary and a visible Optimize action while Edit target and Optimization settings begin closed. Invalid JSON remains at the import surface; a structurally readable import missing target or identity data preserves the fields it can hydrate and opens only Edit target.

Searches show a compact live phase/focus/expanded-state/elapsed-time strip. The complete existing Search Activity visualizer and the authoritative request-budget ledger are owned by Search & proof. A valid result initially shows Recommendation, How to craft it, and Shopping list. The remaining evidence is retained under five controlled disclosures.

No crafting-engine domain, mechanics, probability, action-legality, solver, canonical state/target identity, ranking, PolicyFlow, or Constellation-data implementation changed.

## 2. Files changed and component boundaries

- `src/CraftOptimizer.tsx`: retains authoritative Worker/request lifecycle, Phase 3H detachment, hydration, serialization, copy/export, and result calculations; composes the compact entry and result hierarchy.
- `src/components/OptimizerDisclosure.tsx`: controlled accessible disclosure shell; owns only presentation state, ARIA ownership, and optional mount-after-first-open behavior.
- `src/optimizerInformationArchitecture.ts`: presentation-only group/default constants and pure import entry classification.
- `src/App.css`: compact entry, disclosure, status, shopping-list, and responsive styling.
- `quality-lab/src/phase3iDiagnostics.ts`: direct Phase 3I information-architecture assertions.
- `quality-lab/src/gateRegistry.ts`: Phase 3I direct and real-browser gates.
- `quality-lab/src/gateWorker.ts`: I1-I16 browser evidence and retained-gate disclosure navigation.
- `docs/crafting-engine/PHASE3I_COMPACT_OPTIMIZER_INFORMATION_ARCHITECTURE_AND_PROGRESSIVE_DISCLOSURE_COMPLETION_REPORT.md`: this observed-evidence report.

`CraftOptimizer.tsx` deliberately remains the authority for request construction and side effects. The extracted code has no Worker, handoff, cache, fingerprint, policy, or serialization behavior.

## 3. Before and after hierarchy

Before Phase 3I, the fresh 1,768px desktop page exposed the entire Craft target form, settings, modifier editors, objective, search depth, and Advanced controls before a user could begin. Search Activity and every result/research card were top-level.

After Phase 3I:

1. Import a craft
2. compact loaded-target summary when a target exists
3. Edit target (closed)
4. Optimization settings (closed)
5. Optimize
6. compact running status
7. Recommendation
8. How to craft it
9. Shopping list
10. five closed research disclosures

### Previous surface to new owner

| Previous surface | Phase 3I owner |
|---|---|
| Craft identity and exact modifier editors | Edit target |
| Pricing, optional economics, objective, depth, fallback, and custom budgets | Optimization settings |
| Search Activity graph, request counters, stop conditions, retry evidence | Search & proof |
| Recommendation, proof label, selected-policy solve, portfolio optimality, critical warnings | Recommendation |
| Market-versus-craft source economics | Recommendation subregion |
| Pareto alternatives, Harvest comparison, method-family comparison | Alternative methods |
| Markov Policy Constellation | Strategy visualization |
| Chronological craft plan and authoritative Decision details | How to craft it |
| Compact expected currency needs and copy action | Shopping list |
| Acquisition/downstream/merged usage and reconciliation tables | Cost & usage details |
| Raw proof/policy audits, acquisition synthesis, exact rules, confidence, performance, all warnings | Research diagnostics |

No prior evidence assertion or rendered research field was deleted to create the compact view.

## 4. Entry-state behavior

| Entry | Initial presentation |
|---|---|
| Fresh page | Import primary; preset/manual secondary; target/settings closed |
| Cluster Jewels handoff | Attached source strip, compact target summary, Optimize; target/settings closed before user interaction |
| Valid share | Canonical decoded target in compact summary; target/settings closed |
| Valid optimizer JSON | Canonical imported target in compact summary; target/settings closed |
| Unreadable JSON | Exact visible import error; no unrelated editor opens |
| Readable JSON missing target/identity | Valid fields hydrate; Edit target opens; settings remain closed |
| Completed result | Recommendation, How to craft it, Shopping list visible; research closed |

Phase 3H remains one-way: disclosure interaction never calls detachment. Identity/source-market edits still use the centralized detachment transition; reverting does not reattach. Sale-value provenance remains `cluster-source`, `user`, or `empty`, and manual values survive detachment.

## 5. Default open/closed matrix

| Surface | Fresh | Loaded | Running | Valid result |
|---|---:|---:|---:|---:|
| Edit target | closed | closed | closed | closed |
| Optimization settings | closed | closed | closed | closed |
| Compact search status | absent | absent | visible | final snapshot visible when available |
| Recommendation | absent | absent | absent | visible |
| How to craft it | absent | absent | absent | visible |
| Shopping list | absent | absent | absent | visible |
| Search & proof | absent | absent | closed | closed |
| Alternative methods | absent | absent | absent | closed |
| Strategy visualization | absent | absent | absent | closed |
| Cost & usage details | absent | absent | absent | closed |
| Research diagnostics | absent | absent | absent | closed |

## 6. Critical truth visibility

| Truth | Closed-panel behavior |
|---|---|
| Validation/import/Worker errors | Visible adjacent to primary workflow |
| No resolved route | Visible Recommendation alert |
| Internal result mismatch | Visible Recommendation alert; recommendation withheld |
| Provisional/acquisition unsafe | Visible Recommendation badge and alert |
| Stale research/fallback pricing | Visible Recommendation alert/label |
| Selected-policy solve | Visible Recommendation fact |
| Portfolio optimality | Visible separate Recommendation fact |
| Material selected-route/data-freshness/proof warning | Visible in Recommendation |
| Complete raw evidence | Available in Search & proof or Research diagnostics |

Compact labels reuse `proofPresentation(result)` and `searchEvidencePresentation(result)`; Phase 3I introduces no second proof or counter interpretation.

## 7. Isolation and payload equality

The direct diagnostic scans the complete `draftInput` memo/dependency region and rejects disclosure or entry-state dependencies. Browser evidence captured Worker-event count after completion, opened and closed the research panels, exercised Constellation selection, and observed zero additional Worker traffic. The same test copied the shopping list and share URL before and after disclosure interaction and observed byte-identical output.

Share/export/replay/bug-report construction remains outside disclosure components and uses canonical result/input objects. Graph data is passed unchanged. Phase 3H hydration/detachment and sale provenance are unchanged. No disclosure value enters request inputs, cache/fingerprint identity, budgets, result invalidation, or serialized payloads.

## 8. Constellation preservation

Strategy visualization defers its first graph mount. After first open, `keepMountedAfterOpen` keeps the exact MarkovConstellation instance mounted while its panel is closed. The Phase 3I browser gate selected a real node, closed Strategy visualization, reopened it, and observed the same selected-node overlay. Retained Phase 3E coverage separately passed manual pointer drag, keyboard nudge, strict local persistence, edge rerouting, replay, Screensaver, Reset View, Reset Layout, and reload behavior.

The disclosure panel uses no inset around the Constellation and permits the Phase 3D label-aware Fit All envelope to remain visible. PolicyFlow topology/probabilities/occupancy and graph fingerprints are unchanged.

## 9. Responsive and accessibility evidence

Fresh-page measurements used the same browser viewports before and after:

| Viewport | Before scroll height | After scroll height | Change | Horizontal overflow after |
|---|---:|---:|---:|---|
| 1440×900 | 1,768px | 900px | -868px (-49.1%) | none |
| 390×844 | 2,481px | 1,011px | -1,470px (-59.2%) | none |
| 420×844 | 2,445px | 993px | -1,452px (-59.4%) | none |

The after-state had zero open controlled disclosures and only one visible input/select control at each viewport. Document/body scroll width equaled client width at 390 and 420 pixels. The real field-result mobile gate also found no horizontal overflow after opening every research owner.

Every controlled disclosure is a native button with an accessible name, `aria-expanded`, `aria-controls`, stable owned panel ID, visible focus outline, and keyboard activation. Closing a panel does not move focus into hidden content. Existing graph keyboard access and overlay interaction gates remain green.

## 10. I1-I16

| ID | Result | Observed evidence |
|---|---|---|
| I1 | PASS | Fresh import-first page; manual and research closed |
| I2 | PASS | Phase 3H attached handoff strip/target/Optimize retained; disclosure interaction does not detach |
| I3 | PASS | Phase 3G JSON and share round trips preserve canonical required/acceptable summaries |
| I4 | PASS | Unreadable import stays at import; repairable import opens Edit target only |
| I5 | PASS | Phase 3H detachment matrix/revert/new-seed behavior passes; disclosure Worker traffic is zero |
| I6 | PASS | Normal/custom depth labels and authoritative controls remain in Optimization settings |
| I7 | PASS | Compact live status plus same-snapshot full Search Activity/request ledger |
| I8 | PASS | Only Recommendation, How to craft it, Shopping list initially visible as result groups |
| I9 | PASS | Critical proof, pricing, provisional/no-route/mismatch branches remain outside closed research |
| I10 | PASS | Five named research owners retain prior surfaces exactly once |
| I11 | PASS | Shopping-list and share output identical before/after disclosures; retained export/bug gates pass |
| I12 | PASS | Lazy first mount and selected node survive close/reopen; Phase 3E retained gate passes |
| I13 | PASS | Streaming status does not auto-open disclosures; graph mounts only on user action |
| I14 | PASS | Desktop/390/420 measurements have no horizontal overflow or covered actions |
| I15 | PASS | Controlled ARIA ownership, expanded state, native keyboard buttons, focus assertions |
| I16 | PASS | Phase 3H, Phase 3G, Phase 3F, Phase 3E, overlay, and budget-isolation retained closure |

## 11. Validation and runtimes

| Validation | Result |
|---|---|
| `npm run build` | PASS; Vite application build approximately 0.4s; only existing native-loader/chunk advisories |
| `npm run lint` | PASS |
| `npm run lab:typecheck` | PASS |
| `git diff --check` | PASS; only Git LF/CRLF notices |
| Impact recommendation | accessibility, constellation, responsive, visual; DEV and RELEASE recommended |
| Phase 3I direct focused gate | PASS 1/1; 0.125s gate |
| Phase 3I final browser gate | PASS 1/1; 34.819s gate, 35.827s wall |
| Retained Phase 3G browser | PASS 1/1; 29.448s gate |
| Retained Phase 3H browser | PASS 1/1; 112.731s gate |
| Retained Phase 3F Decision | PASS 1/1; 22.615s gate |
| Retained Phase 3E manual layout | PASS 1/1; 11.621s gate |
| Retained Phase 3F overlay | PASS 1/1; 3.278s gate |
| DEV, exactly once | Historical 11/13; 189.247s wall, 185.310s summed |
| DEV targeted closure | 2/2; scope Fit 5.310s and fractured-Magic interaction 27.385s |
| RELEASE, exactly once | Historical 23/25; 484.624s wall, 480.448s summed |
| RELEASE targeted closure | 2/2; handoff focus 1.030s and short replay 11.739s |

DEV exposed a presentation inset that clipped one mobile scope label and a retained gate that focused an unopened graph edge. The inset was removed for Strategy visualization; the focused scope gate passed. RELEASE later found the same missing open step in the short replay harness and an ordering error where the handoff focus assertion ran after opening Edit target. The assertion now waits for and records the banner focus before opening the editor; both focused gates pass. Historical suite results are retained as 11/13 and 23/25 rather than rewritten. All failed gate IDs have focused passing closure, and no product mechanics finding resulted.

No unit tests were added or run. EXTENDED, nightly, long-soak, the legacy 115-gate suite, and legacy release matrices were explicitly not run. No finding justified them.

## 12. Preservation and self-review

- `TargetDefinition.acceptableAnyOf` remains the only acceptable-alternative model.
- Required and acceptable progress remain structured separately.
- Phase 3B roll probabilities and executable self-fracture mechanics are unchanged.
- Phase 3C/3D Constellation topology, scope semantics, and Fit All behavior are preserved.
- Phase 3E manual positions, identity key, edge rerouting, selection, replay, and reset behavior are preserved.
- Phase 3F authoritative PolicyExplanationRule context, Promote cohorts, Rare Exalt-versus-Scour evidence, and overlay exclusions are preserved.
- Phase 3H one-way detachment, source omission, and sale-value ownership are preserved.
- Selected-policy solve and portfolio-global optimality remain separate facts.
- Corrected unequal-work `HOST_RESERVE` diagnostics passed in RELEASE.
- No hardcoded winner, fixture-specific production branch, mechanics change, weakened identity, or market-fractured ranking was introduced.

Self-review confirmed every old top-level surface has one owner, authoritative request/serialization functions remain centralized, no disclosure state enters domain calculations, generated artifacts remain ignored, and the production bundle contains both compact and deep labels.

## 13. Evidence index

- `quality-lab/src/phase3iDiagnostics.ts`
- `quality-lab/reports/phase3a-dev-gate.json`
- `quality-lab/reports/phase3a-release-gate.json`
- final focused Phase 3I artifact: `quality-lab/artifacts/phase3a-2026-08-29T14-41-44-983Z/shard-C/phase3i-compact-optimizer-mobile.png`
- retained Phase 3H field evidence: `quality-lab/artifacts/phase3a-2026-08-29T14-18-14-239Z/shard-C/phase3h-field-evidence.json`

## 14. Commit, push, workflow, and deployment

Pending implementation commit, push, GitHub Pages workflow/job/deployment/status IDs, and final uncached live HTML/bundle verification. This section will be completed in the documentation-only closeout after the implementation commit is live.
