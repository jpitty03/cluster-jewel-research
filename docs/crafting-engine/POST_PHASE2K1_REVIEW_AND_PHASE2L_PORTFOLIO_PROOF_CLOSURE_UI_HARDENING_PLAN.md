# Post Phase 2K.1 Review and Phase 2L Portfolio Proof Closure / UI Hardening Plan

## Status / source of truth

Live `main` reviewed at:

- `be02700dc3d2845c3636ae986863bb6edb3a7dc3` — Phase 2K.1 telemetry hardening closeout;
- `ec6c1346cc4257794f42cf6571a16a159cd6f421` — subsequent modifier-selection / Craft Optimizer UI update.

Phase 2I, Phase 2J, Phase 2K, and Phase 2K.1 remain **CLOSED / PASS**.

This document is the source of truth for **Phase 2L**.

No unit-test work is requested.

---

# Executive review verdict

Phase 2K.1 fixed the important closeout gaps from Phase 2K without weakening the solver:

- the exact real-world four-mod fixture is now pinned as `10% increased Attack Damage`, ilvl 84, 12 passives, Rare, extras allowed;
- exact-context cold/resume/invalidation and `A -> B -> A` reuse are proven;
- actual browser Worker `PROGRESS -> COMPLETE -> RESULT` ordering is exercised;
- terminal telemetry matches authoritative result bounds/status;
- telemetry ON/OFF semantics match and measured median overhead is ~0.814%;
- mature clean-only EV is separately measured rather than confusing the shallow portfolio clean U with a mature clean estimate;
- Phase 2E/2I/2J regressions, build, lint, and diff hygiene pass;
- no unit tests were added or run.

The post-closeout UI commit adds a custom searchable modifier selector and substantial Craft Optimizer styling. Treat that work as useful product polish, but keep it separate from solver correctness.

## New primary bottleneck

The engine now finds an excellent executable self-fracture route on the exact four-mod fixture, but the recommendation is still proof-honestly provisional because some fracture families remain unresolved at very low admissible lower bounds.

On the pinned Phase 2K.1 fixture under the frozen PriceBook:

| Candidate | Acquisition L | Acquisition U | Downstream U | Full-route U | Status |
| --- | ---: | ---: | ---: | ---: | --- |
| Clean Base | 10c | — | — | 213,866.19c at portfolio depth | resolved at allocated depth |
| 35% Effect | 369c | 1,496.54c | 3,449.88c | 4,946.42c | full route resolved |
| T1 Intelligence | 369c | 1,505.67c | 2,420.67c | **3,926.34c** | selected |
| T1 Energy Shield | 369c | — | — | — | unresolved at budget |
| +4 Attributes | 369c | — | — | — | unresolved at budget |

Mature clean-only U is ~35,695.67c, so the selected resolved fracture route is already dramatically cheaper than mature clean. But `369c` unresolved fracture lower bounds are far below the selected `3,926c` U. Therefore we still cannot claim the selected fracture target is acquisition-safe / portfolio-optimal.

This is the next real engine problem:

> **close the competitive fracture portfolio proof gap efficiently, rather than merely finding one excellent executable fracture route.**

---

# Phase 2L

> **Competitive Portfolio Proof Closure, Incumbent-Directed Deepening, Stronger Full-Route Bounds, and Modifier-Selector Production Hardening**

Phase 2L should be a focused proof/search phase with a small UI-hardening track. Do not redesign the optimizer, rewrite Phase 2K telemetry, or replace the Markov/Bellman engine.

---

# Track A — Competitive portfolio proof closure

## A1 — Add explicit portfolio-proof semantics

The result should distinguish:

- an executable selected route;
- an acquisition-safe selected starting family;
- portfolio optimality over modeled acquisition families;
- downstream-policy optimality inside the selected family.

Do not overload `PROVISIONAL_RESOLVED` or downstream `PolicyRefinementSummary` to imply all of this.

Add a compact portfolio proof summary, naming is implementation-dependent, conceptually:

```ts
interface AcquisitionPortfolioProofSummary {
  status:
    | 'PORTFOLIO_OPTIMAL'
    | 'SELECTED_ACQUISITION_SAFE'
    | 'BEST_RESOLVED_UNPROVEN'
    | 'NO_EXECUTABLE_ROUTE';

  selectedFullRouteUpperBoundChaos?: number;
  bestCompetitiveLowerBoundChaos?: number;
  potentialGapChaos?: number;
  unresolvedCompetitiveCandidates: number;
  resolvedCompetitiveCandidates: number;
  dominatedCandidates: number;

  candidateEvidence: Array<{
    candidateId: string;
    acquisitionLowerBoundChaos: number;
    downstreamLowerBoundChaos?: number;
    fullRouteLowerBoundChaos: number;
    acquisitionUpperBoundChaos?: number;
    downstreamUpperBoundChaos?: number;
    fullRouteUpperBoundChaos?: number;
    status: string;
    proofReason: string;
  }>;
}
```

Strong status is allowed only from actual proof evidence.

## A2 — Strengthen lower bounds from acquisition-only L to full-route L

Current unresolved fracture families often expose only the unavoidable acquisition lower bound (~369c). That is correct but too weak to close portfolio proof efficiently.

For each fracture candidate, derive a **proof-safe full-route lower bound**:

```text
fullRouteL = acquisitionL + downstreamLFromReusableFracturedState
```

Requirements:

- acquisition L remains admissible and must not include downstream cost;
- downstream L must be independently admissible from the actual reusable fractured state;
- unknown/unexpanded downstream successors may contribute optimistic zero continuation exactly as allowed by the existing partial-graph lower-bound method;
- do not double-count the first clean base, fracture preparation, restart/reacquisition, or action costs;
- target/final-state semantics must match the actual product target;
- if a safe downstream L cannot be established, fall back to the weaker acquisition-only L rather than guessing.

The purpose is not to create a heuristic score. The purpose is to prove when a candidate cannot beat the incumbent without fully solving it.

### Required bound audit

For controlled candidates where a full route can be resolved deeply:

```text
fullRouteL <= resolved fullRouteU
```

must always hold within numerical tolerance.

Run this across multiple fracture targets and price regimes. Any violation is a blocker.

## A3 — Incumbent-directed candidate scheduler

After an executable incumbent exists, allocate new search tranches based on proof need, not equal splitting and not target order.

Candidate eligibility for more work:

```text
candidate is unresolved
AND candidate fullRouteL < selected incumbent U
AND candidate is not admissibly dominated
```

Among eligible candidates, prioritize the candidate with the strongest proof need. Acceptable generic policies include smallest full-route L, largest potential gap, or an AO*/best-bound equivalent. The exact scheduler may combine safe signals, but it must not use modifier names, rarity folklore, historical winner identity, or hardcoded target ordering.

Record why each tranche was allocated.

Examples of proof reasons:

```text
DEEPEST_COMPETITOR_LOWER_BOUND
CAN_STILL_BEAT_INCUMBENT
INCUMBENT_CHANGED_REEVALUATE
RESOLVE_ACQUISITION_BEFORE_DOWNSTREAM
RESOLVE_DOWNSTREAM_AFTER_ACQUISITION
DOMINATED_BY_FULL_ROUTE_BOUND
```

## A4 — Candidate lifecycle should span acquisition and downstream proof

A candidate is not finished merely because acquisition synthesis resolves.

Use a proof-honest lifecycle such as:

```text
NOT_STARTED
-> ACQUISITION_PROBING
-> ACQUISITION_RESOLVED
-> DOWNSTREAM_PROBING
-> FULL_ROUTE_RESOLVED
-> SELECTED / DOMINATED / COMPETITIVE_UNRESOLVED
```

Retry Deeper should continue the exact stage that still carries competitive uncertainty.

If T1 ES acquisition is resolved but downstream remains unresolved, do not restart acquisition.

If acquisition itself remains unresolved, do not spend downstream budget on a fabricated reusable base.

## A5 — Retry Deeper should target proof debt

Phase 2K.1 proved graph retention. Phase 2L should use it to make Retry Deeper economically purposeful.

For the exact four-mod fixture, record before/after candidate table across:

```text
RECOMMEND
-> Retry Deeper #1
-> optional Retry Deeper #2 only if still competitive
```

Required evidence per request:

- incumbent U;
- best competitive full-route L;
- gap;
- which candidate/stage received each tranche;
- retained acquisition states;
- retained downstream states;
- generated/reused transition distributions;
- whether candidate resolved, improved L, improved U, or became dominated;
- wall time.

A Retry Deeper request that spends most of its budget on an already noncompetitive or already-mature family is a Phase 2L failure.

## A6 — Exact fixture closure gate

Primary fixture remains:

```text
Large Cluster Jewel
10% increased Attack Damage
ilvl 84
12 passives
Rare
extras allowed

35% Effect
T1 Intelligence
T1 Maximum Energy Shield
+4 All Attributes
```

Frozen Phase 2K.1 PriceBook remains the deterministic source for regressions.

Phase 2L target outcome:

1. RECOMMEND still finds an executable competitive self-fracture route quickly.
2. Continued exact-context DEEPEN work resolves or admissibly dominates the remaining competitive fracture candidates.
3. Preferably establish `SELECTED_ACQUISITION_SAFE` / `PORTFOLIO_OPTIMAL` over modeled acquisition families.
4. If complete closure cannot be achieved safely within practical budgets, return the strongest admissible full-route bounds and quantify exactly which candidate/stage prevents closure.

Do **not** force the historical T1 Intelligence winner. A different winner is correct if the generic economics change.

---

# Track B — Generalize proof closure beyond the exact fixture

The exact fixture is the primary regression, not a special algorithm.

## B1 — Three-notable regression

Re-run the 12p Cold cluster:

- Blanketed Snow;
- Prismatic Heart;
- Widespread Destruction.

Track resolved fracture families, unresolved full-route L, selected U, and proof status.

The route must remain proof-honest; do not require the same historical fracture target.

## B2 — Two-target clean-dominance controls

Simple one-/two-target crafts must not pay the new portfolio-proof cost when clean is already admissibly dominant.

Keep fast clean dominance behavior.

Required controls include:

- one-mod T1 ES;
- Herald one-/two-notable control;
- opposite-generation two-mod;
- forced-Rare;
- no-unwanted.

## B3 — Price sensitivity

Change Fracturing Orb / Alteration / Exalt / Harvest-relevant prices in controlled frozen fixtures.

Require candidate priority and route selection to move because bounds/Q-values/economics move.

No hardcoded fracture preference.

## B4 — Target-order neutrality

Permute the same target IDs. Candidate discovery, resolved economics, proof status, and selected route should remain semantically equivalent apart from deterministic tie ordering.

---

# Track C — Search Activity proof visualization

The live visualizer should expose the new portfolio proof work without becoming more technical by default.

## C1 — Show full-route proof status, not only candidate activity

For each candidate card show only meaningful values:

```text
Acquisition L
Acquisition U (when executable)
Full-route L
Current Full-route U (when executable)
Status / proof reason
```

Make `L` and `U` visually distinct and always text-labeled.

A candidate can say:

```text
Competitive — unresolved
Full-route L 2,180c < current best U 3,926c
Deepening downstream policy
```

or:

```text
Dominated by proof
Full-route L 4,220c >= current best U 3,926c
```

Never call an unresolved candidate "more expensive" solely from an upper bound.

## C2 — Portfolio-level proof meter should be semantic, not percentage

Do not invent percent complete.

Use states such as:

```text
Best executable route found
2 competitive families unresolved
1 competitive family unresolved
Selected start is acquisition-safe
Portfolio optimal over modeled acquisitions
```

## C3 — Milestones

Add milestones only for meaningful proof changes:

- stronger full-route lower bound;
- candidate acquisition resolved;
- candidate downstream route resolved;
- candidate dominated by bound;
- new incumbent;
- selected acquisition becomes safe;
- portfolio optimality proven.

Do not spam per-state activity.

---

# Track D — Searchable modifier selector production hardening

The post-2K.1 UI commit introduced a useful custom searchable modifier selector. Preserve the design, but harden its interaction contract before broad product readiness.

## D1 — Combobox/listbox accessibility

Verify and, where needed, implement standard combobox behavior:

- stable `id` for listbox;
- `aria-controls` from combobox to listbox;
- `aria-activedescendant` for highlighted option;
- unique option IDs;
- focus returns to trigger after Escape/selection when appropriate;
- ArrowUp/ArrowDown, Enter, Escape, Home/End behavior;
- disabled already-selected options are skipped by keyboard navigation;
- clear-selection control is keyboard accessible, not only a `span` with click handling;
- screen reader announcement for result count / no matches.

Do not change target semantics while the user is merely typing a search query.

## D2 — Browser/layout smoke

Verify:

- 320px narrow viewport;
- normal desktop viewport;
- dropdown near the bottom of the viewport;
- long modifier names;
- four selected rows;
- opening/closing via keyboard and mouse;
- no clipping behind optimizer cards or Search Activity;
- no page-level horizontal overflow;
- existing Search Activity remains readable during an open modifier dropdown.

## D3 — Modifier identity safety

Keep exact internal mod IDs as submitted values.

Search/display aliases are presentation only. Searching `int`, `es`, `35%`, notable names, tiers, and ilvl may improve discovery but must never map a query directly into a different target without explicit selection.

If duplicate player-facing labels exist, surface enough technical disambiguation to avoid selecting the wrong modifier.

---

# Required Phase 2L diagnostics

## L1 — Exact fixture RECOMMEND baseline

Record the current exact Phase 2K.1 candidate table and reproduce the selected executable route.

## L2 — Full-route lower-bound admissibility

Across resolved candidate controls, prove `fullRouteL <= fullRouteU` with zero violations.

## L3 — Exact fixture proof-directed DEEPEN

Show candidate/stage allocation by tranche and reduction of competitive proof gap.

## L4 — Portfolio closure

Resolve or dominate all modeled acquisition candidates if practical. Report final portfolio status explicitly.

## L5 — Cold vs resumed candidate-stage equivalence

For at least two fracture targets compare cold-large vs small-then-resumed-large at both acquisition and downstream stages. EV/proof equivalent; resumed duplicate work materially lower.

## L6 — Incumbent-change reprioritization

When a newly resolved candidate lowers incumbent U, unresolved candidates are immediately reconsidered against the new U and safely dominated or reprioritized.

## L7 — Price sensitivity

At least three price regimes demonstrate emergent changes without hardcoded winner/order.

## L8 — Target permutation neutrality

Same target set in different orders produces semantically equivalent portfolio economics/proof.

## L9 — Three-notable regression

Executable/proof-honest result with no market-fractured ranking.

## L10 — Simple controls / clean dominance

Easy one-/two-target controls remain fast and healthy.

## L11 — Phase 2E / 2I / 2J / 2K.1 regression suite

Preserve fracture fidelity, W1-W6, Herald refinement/reuse, Harvest parity/crossover, exact Worker telemetry semantics, and telemetry overhead behavior.

## L12 — Search Activity proof UI

Compiled browser smoke validates full-route L/U display, candidate proof status, selected-safe/portfolio-optimal milestones, terminal COMPLETE frame, and Retry Deeper continuation.

## L13 — Searchable modifier selector

Keyboard, accessibility attributes, duplicate-label selection safety, 320px layout, and four-row selection smoke.

## L14 — Build hygiene

```text
npm run build
npm run lint
git diff --check
```

No unit tests.

---

# Permanent invariants reaffirmed

1. No hardcoded craft answer.
2. No hardcoded target probability.
3. No hardcoded fracture winner/order.
4. No target/Craft-specific solver branch.
5. Modifier weights remain transition-mechanics inputs.
6. Prices remain economic inputs.
7. Strategy preference emerges from Bellman/Q-values/proof bounds.
8. Standard Crafting Bench does not create cluster targets/notables.
9. Core fractured states are manufactured through executable self-fracture.
10. Pre-fractured market purchase remains outside normal core ranking.
11. Wrong fracture remains restart/reacquire.
12. No fixed `4x` self-fracture shortcut.
13. No weakened canonical/state quotient without equivalence evidence.
14. Unknown price is never invented.
15. External Craft of Exile data remains validation-only.
16. Allflame crafting mechanic remains disabled/deferred.
17. Selected-policy validity, acquisition safety, portfolio optimality, and global modeled optimality are distinct claims.
18. Telemetry remains observational only.
19. Search/display aliases never change exact target identity without explicit selection.
20. No unit tests unless the user explicitly reverses that constraint.

---

# Completion report

Create:

```text
docs/crafting-engine/PHASE2L_PORTFOLIO_PROOF_CLOSURE_UI_HARDENING_COMPLETION_REPORT.md
```

Report at minimum:

1. implementation commit;
2. files changed;
3. exact fixture initial candidate table;
4. portfolio proof data model;
5. full-route lower-bound formula/provenance;
6. admissibility audit;
7. scheduler policy and tranche reasons;
8. exact fixture RECOMMEND result;
9. exact fixture DEEPEN sequence;
10. selected U / best competitive L / gap by request;
11. candidate lifecycle by target;
12. acquisition vs downstream retained-state reuse;
13. cold vs resumed candidate-stage equivalence;
14. duplicate-work savings;
15. final exact-fixture portfolio status;
16. unresolved blocker if portfolio proof still cannot close;
17. price-sensitivity results;
18. target-order neutrality;
19. three-notable regression;
20. easy clean-dominance regressions;
21. Phase 2E/2I/2J/2K.1 regressions;
22. Search Activity proof UI evidence;
23. modifier-selector accessibility/keyboard evidence;
24. narrow/mobile layout evidence;
25. build;
26. lint;
27. git diff check;
28. unit tests added/run: expected NO;
29. target/Craft-specific branches added: expected NO;
30. pre-fractured market ranking added: expected NO;
31. Allflame crafting mechanic enabled: expected NO;
32. remaining blockers before broad product readiness.

---

# Final Phase 2L principle

Phase 2K proved that self-fracture can turn a pathological four-mod clean craft into a practical executable route. Phase 2K.1 proved the exact fixture and telemetry honestly.

Phase 2L should now answer the remaining decision-quality question:

> **Can the optimizer efficiently prove that the selected acquisition family is safe against every modeled competitive fracture family, rather than merely finding one very good executable route?**

Close that proof gap with admissible full-route bounds and resumable incumbent-directed search, while preserving the new Search Activity and searchable-modifier UX.