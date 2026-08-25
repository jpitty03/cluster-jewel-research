# Post-Phase 2S Review and Phase 2T Plan

## Phase 2T — Release Truthfulness, Real Browser Quality Lab, Result Accounting Consistency, and Independent Method-Family Execution

Baseline reviewed: `a64e3ede117acd7d968ef29b57f62332a1e97cd0` on `main`.

Primary real-browser evidence reviewed:

```text
4-mod-initial(3).pdf
```

Exact observed configuration:

- Large Cluster Jewel;
- `10% increased Attack Damage`;
- item level 84;
- 12 passives;
- final rarity Rare;
- extra affixes allowed;
- T1 Intelligence;
- T1 All Attributes;
- T1 increased Effect;
- T1 Maximum Energy Shield;
- Allflame bundled pricing snapshot.

---

# 1. Executive Verdict

Phases 2M through 2S delivered a substantial amount of useful product functionality:

- multi-objective cost/action/time fields;
- method-comparison cards;
- Harvest comparison messaging;
- self-fracture alternatives;
- export/import/share tools;
- the Markov Constellation;
- onboarding and release metadata;
- a separately scoped `quality-lab/` directory.

Those features should remain in place.

However, the current evidence does **not** support the stronger claim that the application is fully release-certified or that every Phase 2M–2S acceptance claim has been validated through a real adaptive browser harness.

The primary problems are:

1. the Quality Lab largely evaluates synthetic fixtures and simulated browser/Worker data rather than driving the real production application;
2. the Phase 2S browser smoke writes hardcoded PASS statements after checking only that an HTML page is reachable;
3. the method portfolio mostly re-labels routes already discovered by the open search instead of independently solving every advertised family;
4. Harvest comparison detection and Lifeforce crossover arithmetic are not yet trustworthy enough for release claims;
5. the attached real output contains multiple contradictions between proof status, method status, timing labels, and expected-material accounting;
6. CI deploys after `npm run build` only, without running the claimed release-quality gates.

Therefore:

```text
Phase 2M feature implementation: RETAIN
Phase 2N feature implementation: RETAIN
Phase 2O validation certification: REOPEN
Phase 2P validation conclusions: REVERIFY through real browser harness
Phase 2Q feature implementation: RETAIN; visual certification REOPEN
Phase 2R feature implementation: RETAIN
Phase 2S public-beta certification: DOWNGRADE TO RELEASE CANDIDATE — NOT YET VERIFIED
```

This is not a request to discard or rewrite the application. Phase 2T is a targeted truthfulness and integration-hardening phase.

No unit tests are to be added or run unless the user explicitly changes the existing constraint.

---

# 2. Findings From the Real Four-Mod Output

## 2.1 The selected route is executable but deeply provisional

The output returns:

```text
Selected route: self-fracture T1 Intelligence
Executable U: approximately 4,144.6c
Best competitive L: approximately 4.2c
Potential gap: approximately 4,140.4c
Competitive unresolved families: 4
```

The selected policy itself is proper, absorbing, Bellman-converged, occupancy-converged, and reconciled. That is valuable.

It is not acquisition-safe or globally modeled-optimal. The application correctly states this in several places, but other parts of the UI overstate the result.

## 2.2 “Strictly optimal” is false in this proof context

The Multi-Objective section labels the selected route:

```text
Strictly optimal
```

while the same result states:

```text
Global optimality: NOT YET PROVEN
Acquisition selection safe: no
Unresolved competitors may be cheaper
```

The current phrase appears to mean only:

> cheapest, fewest-actions, and fastest among the currently generated resolved route set.

That is not the same as strict optimality over modeled actions or acquisition families.

Required wording:

```text
Dominates the currently resolved alternatives
```

or:

```text
Best across the current resolved Pareto set
```

Use `Strictly optimal` only when the applicable objective and portfolio proof are actually complete.

## 2.3 Harvest status contradicts itself

The user-facing card says:

```text
HARVEST CRAFTS DISABLED
Harvest route was unresolved within the allocated state budget
```

The Advanced section says:

```text
Enabled Harvest crafts: Harvest Reforge Defences
```

These are different states and must never be conflated.

The product needs one authoritative Harvest lifecycle:

```text
NOT_ELIGIBLE
PRICE_UNAVAILABLE_OR_DISABLED
ENABLED_NOT_SEARCHED
SEARCHING
ENABLED_UNRESOLVED
RESOLVED_MORE_EXPENSIVE
RESOLVED_FASTER_BUT_OVER_CEILING
SELECTED
DOMINATED_BY_PROOF
```

The exact same lifecycle must drive:

- the Harvest comparison card;
- the method-family card;
- Advanced details;
- export JSON;
- the bug-report bundle;
- Quality Lab assertions.

## 2.4 Self-fracture acquisition and full-method status are conflated

The method cards say that several self-fracture syntheses remained unresolved.

The synthesis portfolio later reports all four fracture acquisitions as `RESOLVED` with finite executable acquisition U values.

The actual unresolved part is the candidate’s complete downstream/full-method comparison under the dedicated method-family budget, not necessarily acquisition synthesis.

Required separate fields:

```text
acquisitionStatus
acquisitionU
acquisitionL

downstreamStatus
downstreamU
downstreamL

fullRouteStatus
fullRouteU
fullRouteL

methodFamilyStatus
```

Never use “self-fracture synthesis unresolved” when synthesis itself is already resolved.

## 2.5 Expected-materials presentation double-counts and under-reports

The Expected Materials table contains:

```text
Acquire Self-fracture ... 1.000 @ 1,477.941c
```

and then separately lists the Fracturing Orbs, Alterations, base reacquisitions, Exalts, Augments, Regals, Scour, and Transmutations whose expected costs constitute that acquisition total.

A user summing the table would count acquisition twice.

At the same time, the `Expected currency totals` section appears to omit shared currencies from acquisition preparation. For example, the table lists acquisition Alterations separately from downstream Alterations, but the currency total shows only the downstream quantity rather than the merged full-route total.

Required accounting model:

```text
Full route = initial acquisition bundle + downstream policy
```

Render it in one of two safe forms.

### Option A — Grouped, additive rows

```text
Acquisition preparation
  Alteration       X
  Regal            Y
  Fracturing Orb   Z
  Reacquisition    R
  ...

Downstream crafting
  Alteration       A
  Regal            B
  ...

Full-route totals
  Alteration       X + A
  Regal            Y + B
  ...
```

### Option B — Bundle summary plus non-overlapping detail

The `Acquire self-fracture` row is explicitly marked non-additive and excluded from the shopping-list sum.

Required invariants:

```text
sum(full-route expected action costs) == reported expected route cost
full currency vector == acquisition currency vector + downstream currency vector
shopping-list export == full currency vector
no action is counted twice
no acquisition action is silently omitted
```

## 2.6 Refinement U values mix scopes

Advanced details show:

```text
First certified policy U: 2,666.696c
Final returned policy U: 4,144.637c
Refinement improvement: 0.000c
```

The first value appears to be downstream-only while the final value is full-route acquisition plus downstream.

Values compared in one refinement summary must have identical scope.

Required fields:

```text
firstCertifiedDownstreamU
finalDownstreamU
firstCertifiedFullRouteU
finalFullRouteU
```

If one scope is unavailable, omit the comparison rather than mixing it.

## 2.7 “First acquisition-safe recommendation” is mislabeled

The performance section reports a time to first acquisition-safe recommendation, yet the final result explicitly says acquisition selection is unsafe.

Likely intended metrics include:

```text
timeToFirstCompletedRound
timeToFirstPolicyCertified
timeToFirstUsefulExecutableRecommendation
timeToFirstAcquisitionSafeRecommendation
```

The final metric must be absent or `not reached` unless acquisition safety was truly established.

## 2.8 State counts lack scope labels

Search Activity reports large total portfolio-state counts, while Advanced reports a much smaller selected downstream graph count.

Both may be correct, but the UI must distinguish:

```text
Total portfolio states expanded this request
Total retained/reused portfolio states
Selected downstream policy states
Acquisition synthesis states
Method-family comparison states
Proof-bound states
```

Do not display multiple fields called simply `States expanded` when they refer to different graphs.

## 2.9 Milestone duplication

The milestone feed contains duplicate certification entries. Deduplicate identical consecutive events and distinguish:

```text
acquisition policy certified
full downstream policy certified
new full-route incumbent
portfolio proof improved
```

## 2.10 Markov Constellation is functional but not yet visually release-verified

The attached graph is a useful first implementation. It also has:

- tiny labels;
- label/edge crowding;
- a sparse graph occupying a small portion of a large canvas;
- limited visual evidence that the screensaver/replay has been tested from actual rendered frames.

Do not prioritize visual polish ahead of the accounting and validation fixes. Once the real browser harness exists, improve:

- semantic zoom;
- hover/focus labels;
- collision-aware label placement;
- route-focus camera framing;
- viewport utilization;
- deterministic rendered-frame comparison;
- FPS and memory soak;
- reduced-motion and fullscreen behavior.

## 2.11 Stale prices are honestly disclosed but weaken public-beta ranking

The output clearly warns that the market snapshot, currency rates, and clean-base quote are stale.

For a public-facing cheapest-route claim, the main recommendation should visibly become:

```text
Research estimate using stale bundled pricing
```

unless the user supplies current manual overrides or the snapshot meets freshness requirements.

Warnings buried in the recommendation and Advanced details are not sufficient by themselves.

---

# 3. Validation Audit

## 3.1 The current Quality Lab is not a real browser lab

The `quality-lab` package contains no Playwright, Puppeteer, browser driver, accessibility scanner, screenshot library, or trace/video dependency.

Several scenarios operate on synthetic data:

- the smoke scenario creates a fake Worker event stream and fake result;
- the responsive scenario supplies the requested width as both viewport and content width, then checks equality;
- the accessibility scenario checks a hardcoded mock element list;
- the animation scenario imports the production graph builder, uses a mock plan and mock portfolio, and tests simulated wisps without observing the rendered canvas;
- the runner continues with a “simulated black-box quality run” when the real app is unavailable.

Those tests can remain as fast deterministic model/oracle tests, but they must be renamed and removed from release-certification claims.

## 3.2 The Phase 2S browser smoke writes hardcoded passes

The script verifies that an HTML page responds. It optionally detects a DevTools endpoint but does not actually drive the page. It then writes PASS strings for:

- onboarding modal;
- presets;
- export/import;
- 320px layout;
- keyboard operation.

A release gate cannot claim those behaviors without interacting with the real DOM.

## 3.3 Quality Lab isolation claim is currently false

The animation scenario imports directly from:

```text
crafting-engine/src/domain/VisualizationGraph.ts
```

That violates the stated black-box/no-production-import boundary.

The external lab may consume public serialized fixtures and browser-observed results, but it must not import internal source modules.

## 3.4 CI does not run the advertised release gates

The deploy workflow currently runs:

```text
npm ci
npm run build
```

and deploys.

It does not run:

- lint;
- diff hygiene;
- deterministic diagnostics;
- actual browser/Worker checks;
- Quality Lab;
- visual regression;
- release-scorecard verification.

The deployment cannot be called release-gated until validation is in the dependency chain.

---

# 4. Method Portfolio Audit

## 4.1 Current method cards are mostly classifications, not independent solves

The current portfolio builder derives:

- Open from the current recommendation;
- Conventional from the already available clean incumbent;
- Harvest by searching resolved route names for “harvest” or “reforge”;
- self-fracture cards from existing acquisition/full-route candidates.

That is useful summarization, but it does not prove that every advertised discipline received a dedicated constrained search.

## 4.2 Required independent family contract

Each method family must have a real `MethodFamilySpec` that controls search, such as:

```text
OPEN
CONVENTIONAL
HARVEST
SELF_FRACTURE[targetModId]
SELF_FRACTURE_HARVEST[targetModId, harvestTag]
CHAOS_REFORGE
```

Each family solve must record:

- enabled/required/forbidden actions;
- permitted acquisition families;
- whether at least one required action appeared on-policy;
- its own continuation session;
- its own policy, occupancy, metrics, proof, and budget;
- whether the family was ineligible, unresolved, dominated, more expensive, or selected.

A Harvest family is not resolved unless its selected policy actually contains at least one Harvest action.

A Conventional family must not silently use Harvest or self-fracture.

A self-fracture family must clearly separate acquisition synthesis from downstream policy.

## 4.3 Search-on-demand

Keep initial latency manageable:

```text
Find Cheapest
→ return open recommendation
→ show immediately available known candidates
→ Compare Methods
→ independently solve missing families with retained transition distributions
```

The UI should identify which cards are:

```text
independently solved
summarized from open search
not yet searched
searching
unresolved
```

---

# 5. Harvest Audit and Required Correction

## 5.1 Do not identify Harvest by route name

A route is Harvest-using only when its selected on-policy action IDs contain a Harvest mechanic.

Names and labels are presentation data, not mechanics evidence.

## 5.2 Use the actual expected Harvest action count

The current comparison estimates Lifeforce usage from total physical actions. That can include Alterations, Scours, Regals, reacquisition, and other non-Harvest operations.

Required calculation:

```text
expectedHarvestApplications =
  sum expected visits for selected HARVEST_REFORGE action IDs

expectedLifeforce =
  Σ expectedHarvestApplications(action) × HARVEST_CRAFT_DEFINITIONS[tag].lifeforceAmount
```

## 5.3 Use the authoritative 75-Lifeforce amount

Do not use a generic 50-unit multiplier. The current modeled reforge definitions use 75 Lifeforce per application.

## 5.4 Exact crossover calculation

For a resolved Harvest family and a resolved comparison family:

```text
harvestTotalAtCurrentPrice =
  harvestNonLifeforceCost
  + expectedLifeforce × currentUnitPrice

crossoverUnitPrice =
  (comparisonTotalCost - harvestNonLifeforceCost)
  / expectedLifeforce
```

The result must specify Lifeforce type and tag. Do not calculate a crossover when the route is unresolved or expected Lifeforce is unavailable.

## 5.5 Mandatory real fixtures

Use at least:

```text
T1 Armour + T1 Evasion
T1 Armour + T1 Energy Shield
```

For each fixture capture:

- eligible/inferred Harvest tags;
- enabled craft definition;
- resolved conventional route;
- resolved Harvest route, or a quantified unresolved blocker;
- expected applications;
- expected Lifeforce;
- non-Lifeforce cost;
- current-price total;
- crossover price;
- action/time comparison;
- exact visible reason for selection or rejection.

---

# 6. Phase 2T Implementation Tracks

## Track A — Reclassify release status truthfully

1. Keep all Phase 2M–2S features.
2. Change the footer and documentation from `Public Beta certified` to an honest release-candidate label until the real gates pass.
3. Mark Phase 2O and Phase 2S validation claims as reopened.
4. Preserve every known limitation in product-visible copy.
5. Never silently edit old completion reports; add a Phase 2T superseding review note.

## Track B — Build a real external browser Quality Lab

Keep it scoped under:

```text
quality-lab/
```

Add Playwright as a Quality-Lab-only dependency.

Required behavior:

- build and serve the production `dist/` bundle;
- launch an actual browser;
- fail if the app or browser cannot start;
- no simulation fallback in release-gating mode;
- navigate and interact through role/label/text selectors;
- capture actual screenshots, video, traces, console, page errors, and network errors;
- intercept actual Worker messages through `page.addInitScript` without production hooks;
- exercise actual PROGRESS / COMPLETE / RESULT / ERROR / cancel / host-guard behavior;
- inspect real DOM geometry and accessibility semantics;
- operate at 320, 390, 768, 1280, and 1920 widths;
- test keyboard-only journeys;
- test reduced motion and constellation controls;
- write structured artifacts and a release-gate report.

The lab must import zero production source files. It may read serialized public fixture JSON.

### Separate synthetic tests

Synthetic oracle/model tests may remain, but move or name them clearly:

```text
quality-lab/src/model-tests/
```

They cannot count as browser gates.

## Track C — Replace the Phase 2S smoke

The release smoke must actually:

1. load the built app;
2. open and close Guide & Engine FAQ;
3. use both presets and inspect resulting target IDs;
4. import a setup JSON;
5. export and validate JSON;
6. generate and reload a share URL;
7. run an optimization through the actual module Worker;
8. observe COMPLETE followed by RESULT;
9. verify visible recommendation fields against Worker result;
10. use Retry Deeper and verify retained work;
11. cancel and verify Worker replacement/recovery;
12. verify no horizontal overflow at 320px;
13. complete the primary path with keyboard only;
14. render and interact with Markov Constellation;
15. fail on unavailable browser or missing required UI.

No hardcoded PASS strings may substitute for observed behavior.

## Track D — Canonical result-scope and consistency model

Add explicit scope to every metric:

```text
ACQUISITION
DOWNSTREAM
FULL_ROUTE
PORTFOLIO_TOTAL_WORK
SELECTED_POLICY_GRAPH
METHOD_FAMILY_GRAPH
```

Use one canonical presentation model shared by UI, export, bug report, and Quality Lab.

Required cross-section invariants:

- selected route name matches in Search Activity, hero, method card, graph, playbook, Advanced, and export;
- proof wording matches proof fields;
- no optimal wording when proof is incomplete;
- Harvest lifecycle is identical everywhere;
- fracture acquisition/downstream/full-route states agree;
- timing labels are absent when the milestone was not reached;
- state counts identify scope;
- every U/L pair shares scope and units;
- method counts and statuses agree across visible and serialized output.

## Track E — Rebuild full-route material accounting

Create one authoritative `FullRouteUsageSummary`:

```typescript
interface FullRouteUsageSummary {
  acquisitionActions: ExpectedActionUsage[];
  downstreamActions: ExpectedActionUsage[];
  combinedActions: ExpectedActionUsage[];
  combinedCurrencies: Record<string, number>;
  acquisitionCostChaos: number;
  downstreamCostChaos: number;
  fullRouteCostChaos: number;
  reconciliationDifferenceChaos: number;
}
```

Merge by action/currency ID exactly once.

The virtual acquisition-selection action is either:

- omitted from additive materials; or
- shown as a non-additive bundle heading.

Required gates:

```text
acquisitionCost + downstreamCost == fullRouteCost
sum(combined action costs) == fullRouteCost
combined currency quantity == acquisition + downstream quantity
shopping-list export == combined currency vector
```

## Track F — Implement independent method-family searches

1. Add search-level family constraints.
2. Require family-defining on-policy actions where appropriate.
3. Give each family a safe session identity and retained continuation.
4. Reuse transition distributions when mechanics identity matches.
5. Recompute Bellman policy/occupancy for the family.
6. Produce independent route metrics and proof.
7. Deduplicate only after independent family evaluation.
8. Never infer method use from a route name.

Required families for the primary four-mod fixture:

- Open;
- Conventional;
- Harvest Defences;
- each of four self-fracture targets;
- self-fracture + Harvest when eligible;
- Chaos Reforge if modeled and legal.

## Track G — Correct Harvest economics and status

Implement the corrections in Section 5 and add dedicated diagnostics plus browser assertions.

## Track H — Correct proof and objective language

Replace:

```text
Strictly optimal
Optimal trade-off frontier
```

with proof-scoped language unless genuinely proven.

Suggested labels:

```text
Best among resolved alternatives
Current resolved Pareto set
Dominates the currently resolved comparison routes
Portfolio optimal — proven
Constrained objective optimal — proven
```

Objective proof, selected-policy validity, acquisition safety, and portfolio proof remain separate.

## Track I — Fix timing, work, and milestone scopes

Add distinct fields and UI labels for:

- first completed search round;
- first certified downstream policy;
- first useful executable full route;
- first acquisition-safe recommendation;
- total staged portfolio work;
- selected-policy graph work;
- per-family work;
- retained/reused work.

Deduplicate milestone events by semantic event identity.

## Track J — Add real CI release gates

Create a validation workflow or extend deployment:

```text
npm ci
npm run build
npm run lint
git diff --check
mature deterministic diagnostics
real Quality Lab smoke
actual Worker/browser smoke
```

Deployment must depend on validation success.

Add a nightly workflow for:

- extended fixtures;
- generated targets;
- objective and price sweeps;
- method-family matrix;
- constellation visual frames;
- memory/soak;
- multiple browser viewports.

Do not add unit tests.

## Track K — Markov Constellation visual hardening

Only after Tracks B–I pass:

- drive screenshots and frame tests from the actual browser;
- improve label collisions and readability;
- use the available canvas more effectively;
- add route-focus and semantic zoom;
- verify real edges only;
- test deterministic replay frames;
- measure FPS, long-task time, and memory over a long screensaver run;
- validate reduced motion, fullscreen, pause, and speed controls.

---

# 7. Exact Four-Mod Release Regression

Pin the attached configuration and a frozen reproducible price vector.

Required browser assertions:

## 7.1 Input

- exact base/enchantment/ilvl/passives/rarity/extra-affix policy;
- exact four target mod IDs;
- no target mutation after display/search interactions.

## 7.2 Search and proof

- selected route is executable;
- selected policy health is valid;
- proof status is provisional when competitive L remains below U;
- no `optimal` wording appears unless proof supports it;
- all five acquisition families have internally consistent lifecycle/status fields;
- Retry Deeper reuses work and never regresses the retained executable incumbent.

## 7.3 Method portfolio

- Open and Conventional are independently verified;
- Harvest is either independently resolved or explicitly `ENABLED_UNRESOLVED`;
- each self-fracture card distinguishes resolved acquisition from downstream/full-route status;
- method-card values match their independent method results;
- no duplicate route is presented as a distinct method.

## 7.4 Materials

- acquisition and downstream tables are non-overlapping;
- combined action usage reconciles to full-route cost;
- combined currencies include every acquisition and downstream use;
- shopping-list export matches the combined vector;
- no virtual acquisition bundle is counted twice.

## 7.5 Scope labels

- full-route versus downstream U is explicit;
- total portfolio work versus selected graph states is explicit;
- acquisition-safety time is absent when not reached;
- no duplicated milestones.

## 7.6 Visual and accessibility

- real screenshot captured at desktop and 390px;
- no horizontal overflow;
- keyboard path passes;
- constellation labels are legible or discoverable by focus/hover;
- reduced-motion path passes;
- actual Worker event trace is included in artifacts.

---

# 8. Additional Required Fixtures

## 8.1 T1 Armour + T1 Evasion

Purpose:

- dedicated Conventional versus Harvest comparison;
- current Lifeforce economics;
- action/time comparison;
- objective/cost-ceiling behavior.

## 8.2 T1 Armour + T1 ES

Purpose:

- retain prior Craft of Exile external validation;
- verify corrected 75-Lifeforce crossover math;
- verify dedicated Harvest policy.

## 8.3 Cheap one-mod craft

Purpose:

- prevent unconstrained fastest/fewest-action fracture from being presented as practical;
- verify cost ceiling.

## 8.4 Herald Envoy + Endbringer

Purpose:

- retain downstream refinement regression;
- verify chronological plan and method comparison.

## 8.5 Three-notable and four-mod targets

Purpose:

- complex runtime/proof behavior;
- method family and acquisition portfolio consistency.

---

# 9. Required Phase 2T Diagnostics

## T1 — Release-claim audit

Machine-check every public-beta/release statement against actual gate evidence.

## T2 — Real browser startup/no-fallback

Prove that unavailable app/browser fails the gate. No simulated success.

## T3 — Real Worker event stream

Capture actual request/PROGRESS/COMPLETE/RESULT/ERROR/cancel/host-guard events.

## T4 — UI/result differential oracle

Compare Worker result with every visible result section and exports.

## T5 — Four-mod consistency matrix

Run all assertions in Section 7.

## T6 — Full-route usage reconciliation

Audit clean, Harvest, and self-fracture routes.

## T7 — Method-family independence

Prove each displayed method was independently solved or clearly labeled summary-only/not searched.

## T8 — Harvest action-evidence audit

Selected Harvest family must include a Harvest action ID on-policy.

## T9 — Lifeforce math audit

Use actual expected Harvest count and authoritative 75-unit definition.

## T10 — Proof-language audit

No false optimal/strictly optimal/frontier wording.

## T11 — Scope-label audit

Every U/L, timing, and state-count metric is scoped.

## T12 — Responsive/accessibility real-browser matrix

Real DOM geometry and keyboard behavior at required viewports.

## T13 — Constellation actual-render audit

Real canvas frames, deterministic replay, reduced motion, FPS, and memory.

## T14 — CI gate audit

Validation workflow must fail on intentional browser/semantic breakage and block deploy.

## T15 — Mature regression matrix

Retain critical Phase 2E through 2S engine behaviors, but do not treat old simulated browser checks as authoritative.

## T16 — Build hygiene

```text
npm run build
npm run lint
git diff --check
```

No unit tests.

---

# 10. Phase 2T Completion Gates

Phase 2T closes only when:

- release status is truthfully represented;
- real Playwright browser tests replace simulation for release gating;
- Quality Lab has zero production-source imports;
- unavailable app/browser fails rather than simulates;
- Phase 2S smoke performs real interactions;
- actual Worker events are captured and validated;
- the exact attached four-mod fixture is internally consistent across all UI sections and exports;
- expected materials merge acquisition and downstream exactly once;
- shopping-list currency totals are complete;
- method-family cards are based on independent solves or clearly labeled otherwise;
- Harvest detection uses action evidence;
- Lifeforce crossover uses expected Harvest visits and 75 units/application;
- Harvest statuses are consistent everywhere;
- false optimal/frontier wording is removed;
- timing and state counts have explicit scopes;
- stale prices produce a prominent research-estimate state;
- Constellation is tested from real rendered frames;
- validation blocks deployment;
- mature engine diagnostics pass;
- build/lint/diff pass;
- unit tests added/run: NO;
- hardcoded route winner added: NO;
- target/Craft-specific branch added: NO;
- market-fractured ranking reintroduced: NO;
- unsupported Allflame crafting mechanics enabled: NO.

---

# 11. Required Completion Report

Create:

```text
docs/crafting-engine/PHASE2T_RELEASE_TRUTHFULNESS_REAL_BROWSER_AND_RESULT_CONSISTENCY_COMPLETION_REPORT.md
```

Include:

1. implementation commit;
2. release-status reclassification;
3. files changed;
4. real-browser tool and version;
5. proof that simulation fallback is removed from release mode;
6. Quality Lab dependency/isolation audit;
7. actual Worker event trace summary;
8. exact four-mod browser result consistency table;
9. proof-language before/after;
10. canonical result scope model;
11. full-route materials reconciliation;
12. shopping-list reconciliation;
13. independent method-family evidence;
14. Harvest action-evidence and lifecycle table;
15. corrected Lifeforce crossover calculation;
16. Armour+Evasion result;
17. Armour+ES result;
18. stale-pricing UI behavior;
19. timing/state-scope changes;
20. Constellation real-frame evidence;
21. responsive/keyboard/accessibility evidence;
22. cancel/host-guard/Worker recovery evidence;
23. CI validation/deploy dependency;
24. mature regression matrix;
25. performance and memory results;
26. remaining blockers to restoring public-beta certification;
27. unit tests added/run: expected NO;
28. target/Craft-specific branches: expected NO;
29. hardcoded route winner: expected NO;
30. pre-fractured market ranking: expected NO.

---

# Final Phase 2T Principle

> A release badge is only as trustworthy as the browser and result-consistency evidence behind it. Keep the features, replace simulated validation with observed behavior, and make every number, label, method card, and shopping-list total agree with one authoritative full-route result.
