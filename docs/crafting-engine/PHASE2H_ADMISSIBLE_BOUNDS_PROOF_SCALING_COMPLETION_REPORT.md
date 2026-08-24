# Phase 2H Admissible Bounds and Proof Scaling Completion Report

## 1. Implementation commit

`5665c9206b57b06f795f14b5caa4f728656e9f2a` (`Implement Phase 2H admissible proof scaling`)

The implementation started from synchronized `main` at
`ea2bdb388499b1a457c19a86c34d2fa7624f030b`. This report is added by a
follow-up documentation commit so it can cite the exact implementation SHA.

## 2. Files changed

The implementation commit changes:

- `crafting-engine/src/solver/mandatoryMechanicsLowerBound.ts`
- `crafting-engine/src/solver/acquisitionSynthesis.ts`
- `crafting-engine/src/solver/genericSearch.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/src/rules/actionRegistry.ts`
- `crafting-engine/src/rules/actionDiscovery.ts`
- `crafting-engine/src/domain/Mod.ts`
- `crafting-engine/src/domain/ModPool.ts`
- `src/CraftOptimizer.tsx`
- `crafting-engine/scripts/phase2eFractureFidelityDiagnostic.ts`
- `crafting-engine/scripts/phase2hHeraldDiagnostic.ts`
- `scripts/browserPhase2gSmoke.mjs`
- `scripts/browserPhase2hSmoke.mjs`
- `output-acquisition-synthesis-phase2d.txt`
- `output-fracture-fidelity-phase2e.txt`
- `output-phase2h-herald-diagnostic.txt`
- `output-browser-phase2g-smoke.txt`
- `output-browser-phase2h-smoke.txt`

## 3. Lower-bound architecture

Acquisition synthesis now serializes three distinct bounds:

```text
partialGraphL = cleanBaseCost + optimistic partial-graph preparation L
mechanicsL   = cleanBaseCost + proven mandatory-mechanics preparation L
combinedL    = max(partialGraphL, mechanicsL)
```

The partial-graph bound remains independently visible. The mechanics component
uses target predicates and capability declarations on shared action-registry
mechanics. The two bounds are combined with `max`, not addition, because their
costs can overlap. Evidence includes the combination rule, component/action,
minimum application count, mechanics and price confidence, enabled/unavailable
action scope, and prose provenance.

A clean-route certification prepass obtains a finite executable clean-family
upper bound with the normal generic solver. If that certified `U` is at or below
every relevant fracture family's combined `L`, the families are classified as
`SKIPPED_DOMINATED`, remain serialized as proof evidence, and consume no
self-fracture frontier budget. They are not called resolved.

## 4. Exact admissibility argument

The implemented positive mandatory component is
`CREATE_REQUIRED_FRACTURED_AFFIX`:

1. A self-fracture acquisition candidate requires the selected target affix to
   be fractured.
2. The clean initial state does not contain that required fractured affix.
3. Therefore every terminal path for that acquisition must execute at least one
   enabled action capable of creating `FRACTURED_AFFIX`.
4. The registry declares that capability on Fracturing Orb. The bound takes the
   cheapest usable price over every enabled mechanic declaring the capability.
5. It charges exactly one unavoidable application. It does not use a 25% hit
   rate, a four-attempt expectation, a selected policy, or external empirical
   Craft of Exile data.

Proof fails closed to a zero mechanics contribution if an enabled action is
outside the known capability registry, if any capable creator lacks usable price
evidence, or if no enabled priced creator is known. Research-fallback prices are
only eligible when the caller explicitly permits them. This prevents an unknown
or cheaper action from making the asserted minimum too high.

The clean-base acquisition cost is independently unavoidable for these
self-fracture routes. `max(partialGraphL, mechanicsL)` is admissible because each
input is independently a lower bound and taking their maximum cannot exceed the
true route cost.

## 5. Standalone self-fracture decomposition

Under the controlled normal-price standalone fixture:

| Quantity | Value |
| --- | ---: |
| Partial-graph `L` | `10.340709c` |
| Mandatory-mechanics `L` | `369.000000c` |
| Combined `L` | `369.000000c` |
| Certified executable `U` | `1506.328333c` |
| Admissibility margin | `1137.328333c` |

The `369c` mechanics bound is a `10c` clean base plus one `359c` Fracturing
Orb. The executable route happened to use approximately four orbs and three
restarts, but those policy-derived expectations do not participate in `L`.

## 6. Normal-price fracture values before and after

The captured forced-Rare pre-change result searched both fracture families:

| Family | Before executable `U` | Before `L` | After `U` | After `L` | After classification |
| --- | ---: | ---: | ---: | ---: | --- |
| Glowing (T1 ES) | `1477.396467c` | `4.240050c` | not searched | `363.000000c` | `SKIPPED_DOMINATED` |
| of the Prodigy (T1 Int) | `1482.328333c` | `4.239731c` | not searched | `363.000000c` | `SKIPPED_DOMINATED` |

Here `363c = 4c clean base + 359c one mandatory Fracturing Orb`. Independent
normal-price executable diagnostics remain available for admissibility auditing:
Glowing `U=1501.396467c` and the standalone Prodigy route
`U=1506.328333c`, both above their `369c` controlled standalone bound.

## 7. Cheap-fracture proof honesty

The isolated one-mod fixture uses an intentionally artificial `0.001c`
Fracturing Orb price:

- clean incumbent `U=8.816617c`;
- best fracture combined `L=4.241094c`;
- executable fracture `U=41.400467c`;
- recommendation `PROVISIONAL_RESOLVED`;
- acquisition safe: no;
- competitive fracture families: one.

Because `L < U_clean`, the fracture family is not pruned. The production Phase
2G browser smoke repeats this contract with live controlled rates and reports
`U_clean=8.783561c`, `L_fracture=4.141004c`, a visible provisional warning, and
one executable self-fracture family.

## 8. Admissibility audit

Ten controlled certified states were checked at tolerance `1e-8c`:

```text
combined L <= certified U + tolerance
```

Result: `10` samples, `0` violations. Coverage includes clean one-mod, two-mod
Any, no-unwanted, forced-Rare clean, standalone Prodigy and Glowing fracture,
the artificial cheap-fracture fixture, two multi-fracture families, and the
explicit no-market fracture route.

## 9. Forced-Rare two-mod proof scaling

| Metric | Before | After |
| --- | ---: | ---: |
| Clean `U` | `243.959278c` | `226.970482c` |
| Clean optimistic `L` | not captured | `4.231050c` |
| Glowing fracture `U / L` | `1477.396467 / 4.240050c` | `unsearched / 363.000000c` |
| Prodigy fracture `U / L` | `1482.328333 / 4.239731c` | `unsearched / 363.000000c` |
| Recommendation | `PROVISIONAL_RESOLVED` | `BEST_RESOLVED_ACQUISITION_SAFE` |
| Acquisition safe | no | yes |
| Acquisition-family states | `10002` | `0` |
| Downstream states / cumulative work | `5000 / 9998` | `3334 / 3334` |
| Staged / worker time | `32030 / 32054ms` | `2910 / 2919ms` |

The status changes only because the certified clean `U` is below both admissible
fracture `L` values. The browser normal-price forced-Rare regression independently
passes as acquisition-safe at `U=207.885641c` under its market-rate fixture.

## 10. Frontier work attribution

Captured forced-Rare before/after:

| Attribution | Before | After |
| --- | ---: | ---: |
| Competitive unresolved fracture families | `2` | `0` |
| Bound-dominated families | `0` | `2` |
| States spent on acquisition families | `10002` | `0` |
| Fracture families placed on DEEPEN frontier | `2` | `0` |

Dominated candidates remain inspectable in the service result and Advanced UI;
only their unnecessary search work is removed.

## 11. Real Herald fixture

The committed product fixture is:

- base: `Medium Cluster Jewel`;
- enchantment: `10% increased Damage while affected by a Herald`;
- item level: `84`;
- passive count: `6`;
- rarity: Any;
- extra affixes: allowed;
- exact resolved target IDs: `Empowered Envoy` and `Endbringer`;
- both target mods are prefixes.

The standard Crafting Bench is not treated as a way to create either notable.

### Historical H1/H2

The addendum's original browser H1 returned `NO_RESOLVED_ROUTE` at about `5000`
states and `9.3s`. Its default-visible uncertified policy had zero absorption and
non-converged Bellman/occupancy data. The controlled pre-change A row also
reproduced no route at `5000` states, `8334` cumulative legacy-accounted work,
two completed rounds, and `29005ms` staged time.

The historical deeper browser retry found a clean-base
`PROVISIONAL_RESOLVED` route near `78.781c`, with best unresolved acquisition
`L` near `10.149c`, and a proper, absorbing, reconciled policy. These are captured
historical references, not hardcoded acceptance values.

### A-F budget sensitivity after the change

All rows use the same exact target and controlled prices.

| Row | Budget / intent | Result `U` | States / cumulative | Rounds | Engine / worker | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| A | 5k / 30s / 3, RECOMMEND | `214.520976c` | `3334 / 3334` | `2/3` | `2261 / 2279ms` | safe clean |
| B | 10k / 30s / 3, RECOMMEND | `124.352094c` | `6668 / 6668` | `2/3` | `7683 / 7709ms` | safe clean |
| C | 5k / 60s / 3, RECOMMEND | `214.520976c` | `3334 / 3334` | `2/3` | `2331 / 2344ms` | safe clean |
| D | 5k / 30s / 4, RECOMMEND | `214.520976c` | `3750 / 8536` | `3/4` | `10448 / 13666ms` | safe clean; full acquisition stage ran |
| E | 10k / 30s / 4, RECOMMEND | `158.931161c` | `5000 / 5000` | `2/4` | `3932 / 3949ms` | safe clean |
| F | Retry Deeper: 10k / 60s / 4, DEEPEN | `82.197143c` | `7500 / 7500` | `3/4` | `13339 / 13363ms` | safe clean |

Every row is proper, absorbing, Bellman-converged, occupancy-converged, and
cost-reconciled. Before the change, A-E all exhausted search capacity without a
route; merely increasing wall time in C did not help. The limiting combination
was state identity/frontier capacity and the validated-Rare target bypassing the
clean-first opportunity, not insufficient host wall time alone.

### Chosen generic search-resolution change

No global budget was inflated and no hidden rescue tranche was added. The
generic changes are:

1. certify the clean physical family early with the normal solver, including
   restart/reacquisition semantics and all work in elapsed accounting;
2. use the admissible acquisition bound to remove dominated fracture work;
3. quotient non-target filler states only where pool-derived eligibility data
   proves their action/transition behavior equivalent;
4. retain exact names where the same name spans exclusion groups; and
5. avoid starting a DEEPEN round that the remaining deadline cannot reasonably
   support, while preserving rollback/accounting.

The filler quotient audit reduced `1000` concrete Herald states to `165`
classes (`835` collapsed), with `0` action/cost/aggregated-transition violations.
The audit includes the critical Harvest scope. Pool data identified the only
duplicate eligibility-sensitive name, `of the Cloud`; missing sensitivity
markers were `0`. This is data-derived and contains no Herald, notable, or mod-ID
solver branch.

At the unchanged default A budget, the result moves from no route after roughly
the full controlled wall budget to a certified safe route in about `2.3s`. The
production compiled-worker default returns a safe clean route at
`265.852703c` in `1192ms`; differences from controlled A are the browser's
market/currency fixture. Retry Deeper returns `82.197143c` in `13363ms` in the
controlled matrix. The lower DEEPEN incumbent is an improved executable policy,
not evidence that the default route is globally optimal.

## 12. Herald fracture-family proof

Controlled A/C/E/F normal-price families each serialize:

| Family | Partial `L` | Mechanics `L` | Combined `L` | Status |
| --- | ---: | ---: | ---: | --- |
| Empowered Envoy | `10.000000c` | `369.000000c` | `369.000000c` | `SKIPPED_DOMINATED` |
| Endbringer | `10.000000c` | `369.000000c` | `369.000000c` | `SKIPPED_DOMINATED` |

Controlled D intentionally runs the acquisition stage and certifies fracture
upper bounds of `1485.306281c` and `1500.450227c`; each still has combined
`L=369c`. The production browser uses a `355.8c` orb and therefore reports
partial/mechanics/combined values `10 / 365.8 / 365.8c` for both families.

The clean incumbent is acquisition-safe because its certified `U` is below every
unresolved family's admissible combined `L`. This proves the acquisition choice,
not exact policy optimality inside the selected clean family. The cheap fixture
correctly remains provisional because the same inequality does not hold.

## 13. Policy-condition disambiguation

Before Phase 2H, the visible condition
`magic item with 1 prefix(es), 1 suffix(es), and 1/2 target modifier(s)` appeared
with both Regal Orb and Orb of Alteration.

The service now serializes actual rarity, prefix/suffix counts, matched/missing
target IDs, exact prefix/suffix mod IDs, tiers, fracture state, and current rolls.
The UI adds only the minimum actual state detail required when a coarse rendered
condition would otherwise collide. It uses the same Phase 2F label renderer as
the browser diagnostic and includes mod IDs when duplicate display labels require
them.

After Phase 2H, identical rendered condition plus different `actionId` collisions
are `0` in every Herald A-F row and the production browser. Real examples now
distinguish:

- Empowered Envoy present, Endbringer missing, exact Strength suffix: Regal Orb;
- Empowered Envoy present, Endbringer missing, exact Dexterity suffix:
  Orb of Alteration.

Those details come from represented solver states; no condition prose is guessed
from the desired target.

## 14. No-route expected-material safety

Before Phase 2H, a `NO_RESOLVED_ROUTE` result could show approximately
`665.889` Alterations, `333.111` Augmentations, one acquisition, and one
Transmutation despite zero absorption and non-converged policy evidence. It could
also render `Acquire No start certified under this budget` as a material row.

After Phase 2H, normal `Expected materials` renders only for a certified selected
policy. H4 injects one presentation-only raw usage action into a bounded no-route
browser result to make the test non-vacuous:

- ordinary material section present: no;
- ordinary material rows: `0`;
- raw usage rows retained: `1`;
- raw usage location: Advanced only;
- explicit `Uncertified exploratory policy usage` warning: yes;
- `Acquire No start certified under this budget` in player materials: no.

Certified results still pass exact expected-material correspondence.

## 15. Expansion metric semantics

`newCanonicalStates` counts newly added canonical graph nodes per completed
round. `retainedStatesReused` counts persistent nodes whose already-generated
edges remain available to later rounds; it is not re-expansion work.
`transitionDistributionsGenerated` counts actual transition-distribution
generation. `priorNodesRevisited` counts actual visits to previously generated
nodes. `repeatedStatesExpanded` now means literal full re-expansion of a canonical
node and is `0` in A-F. The large historical “repeated” values were legacy
cumulative graph carry-over, not evidence that those nodes were regenerated.

| Row | New states by round | Retained by round | Transition distributions by round | Prior-node revisits | Repeated full expansions |
| --- | --- | --- | --- | --- | ---: |
| A | `[1666,1667]` | `[1,1667]` | `[5266,5538]` | `[1,0]` | `0` |
| B | `[3333,3334]` | `[1,3334]` | `[10779,10825]` | `[1,0]` | `0` |
| C | `[1666,1667]` | `[1,1667]` | `[5266,5538]` | `[1,0]` | `0` |
| D | `[1249,1250,1250]` | `[1,1250,2500]` | `[6429,6456,6695]` | `[1,0,0]` | `0` |
| E | `[2499,2500]` | `[1,2500]` | `[8017,8185]` | `[1,0]` | `0` |
| F | `[2499,2500,2500]` | `[1,2500,5000]` | `[8017,8185,10000]` | `[1,0,0]` | `0` |

D additionally records `4786` feasibility states because its clean prepass does
not dominate the families and the full acquisition/downstream path executes.
All other rows record zero feasibility and interrupted states.

## 16. Core regressions

Controlled engine regressions:

| Regression | Result | Runtime | Health |
| --- | ---: | ---: | --- |
| R1 one-mod T1 ES | Clean Base, `8.816617c` | `499ms` | safe, proper, absorbing, reconciled |
| R2 two-mod T1 ES + Int, Any | Clean Base, `243.759278c` | `858ms` | safe, proper, absorbing, reconciled |
| R3 no-unwanted | Clean Base, `243.759278c` | `842ms` | safe, proper, absorbing, reconciled |
| R4 forced-Rare | Clean Base, `226.970482c` | `2919ms` worker | safe, proper, absorbing, reconciled |

Production Phase 2G browser values are `8.783561c / 181ms`,
`228.790316c / 258ms`, `228.790316c / 316ms`, and forced-Rare
`207.885641c / 1263ms`. Price-context differences explain the economic deltas.

Phase 2G D1-D8: **all PASS**. This includes human status, primary hierarchy,
exact branch-guide and material correspondence, provisional warning, Advanced
diagnostics, Phase 2F labels/aliases, and exact compiled-worker request identity.
The supplemental bounded no-route presentation also passes.

## 17. Mechanics and mature-policy regressions

- Self-fracture invariant: **PASS**. Only executable self-fracture routes enter
  normal ranking; wrong fractures restart/reacquire; no legacy approximate
  formula or pre-fractured market purchase is ranked.
- Fracturing parity: external `25.0000%`, analytical `25.0000%`, seeded Monte
  Carlo `24.9550%`; **ALIGNED**.
- Harvest B1/B2/B3: **CLOSE / APPROXIMATE** with raw-presence and exactly-one-
  Annul semantics unchanged. Analytical/MC are `0.2755331/0.2753000%`,
  `43.7754343/44.2789684%`, and `0.1206158/0.1219000%` respectively.
- Craft A: analytical `7623.7c`; all `10000/10000` multi-seed trials completed;
  pooled action differences remain within the established threshold; **MULTI-SEED
  STABLE**.
- Craft C: analytical `42814.4c`; one timeout among `10000` trials, every seed at
  least `99.95%` complete; pooled action differences remain within threshold;
  **MULTI-SEED STABLE**.

Craft A/C artifacts were regenerated by `optimizeCraftDemo.ts
--regressions-only` and remained byte-identical. The final pool-derived
eligibility annotation affects only GenericSearch filler identity and is not
consumed by those mature PolicyEngine fixtures. Craft B is intentionally deferred
by the source plan.

The older `coreMechanicsPhaseDiagnostic.ts` is not a Phase 2H gate and was not
used as evidence: it predates Phase 2D and assumes every fracture discovery
candidate has a direct market `acquisition` quote. That assumption is
intentionally false now that pre-fractured market purchases are excluded. The
Phase 2D, Phase 2E, and Phase 2H diagnostics supersede that acquisition check;
the obsolete assumption was not restored to make a legacy harness pass.

## 18. Browser, build, and lint gates

- `npm run build`: **PASS**. Vite reports only the existing native-config import
  extension notice and large-chunk advisory.
- `npm run lint`: **PASS with one pre-existing warning** at
  `crafting-engine/src/solver/policyEngine.ts:748:27` (`erasing-op`).
- Production browser + compiled Worker Phase 2H H1-H8: **all PASS**.
- Production browser + compiled Worker Phase 2G D1-D8 and R1-R5: **all PASS**.
- Phase 2D integration diagnostic: **PASS**.
- Phase 2E D1-D7, R1-R6, and proof audit: **PASS**.
- `git diff --check`: **PASS**.
- Unit tests added or run: **none**, as requested.

## 19. Claude review

Claude performed read-only review passes before the implementation commit. The
accepted findings were addressed by:

- using actual engine lower bounds in D5 instead of a repeated literal;
- failing the mechanics proof when enabled capabilities or creator prices are
  unknown;
- serializing mechanics price confidence;
- reporting a real clean-family optimistic `L` and accounting for clean-prepass
  work/time;
- deriving acquisition action/candidate IDs from real discovery indices;
- adding the actual clean acquisition policy card and start action ID;
- using the production Phase 2F label formatter in collision diagnostics;
- making H4 non-vacuous with Advanced-only injected raw usage;
- removing unused recommendation-rescue code;
- adding both Harvest-critical quotient and normal-price Glowing admissibility
  coverage; and
- labeling captured historical numbers explicitly.

A final local audit after that review found the duplicate internal name
`of the Cloud`; the quotient now preserves names whenever pool-derived exclusion
groups make them eligibility-sensitive. The final quotient audit has zero
violations.

## 20. Constraints and exclusions

- Unit tests added: **no**.
- Craft-, Herald-, notable-, target-ID-, or modifier-name-specific solver branch:
  **no**.
- Fixed four-attempt fracture economics in a lower bound or normal ranking:
  **no**.
- Empirical external rates as mechanics inputs: **no**.
- Unresolved candidate relabeled resolved: **no**.
- Pre-fractured market purchase in normal discovery/ranking: **no**.
- Standard Crafting Bench used to create a cluster modifier/notable: **no**.
- Broad 3/4-mod frontier experiment: **not started**.

## 21. Remaining work before the dedicated 3/4-mod phase

There is no remaining Phase 2H completion blocker. The next phase still needs:

- generic 3-mod and 4-mod Rare feasibility/search scaling;
- Craft B as a generic notable stress fixture;
- target-conditioned frontier scaling beyond the proven two-mod paths;
- refreshed live league/currency pricing (the committed Allflame snapshot is
  stale, and the UI correctly warns about it);
- broader mechanics-capability coverage before positive bounds can safely apply
  to future state-creation requirements; and
- eventual retirement or rewrite of the pre-Phase-2D legacy core-mechanics
  diagnostic around the executable-synthesis acquisition contract.

Chaos/Alchemy analytical transitions and the live-pricing pipeline remain
explicitly deferred. Phase 2H establishes an acquisition-safe default Herald
route, not global optimality of every clean-family crafting policy.
