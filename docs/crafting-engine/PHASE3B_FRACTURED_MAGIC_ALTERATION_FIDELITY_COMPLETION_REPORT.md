# Phase 3B Fractured Magic Alteration Fidelity Completion Report

Status: **CLOSED / PASS / DEPLOYED**

Completed on 2026-08-27 PDT.

Source of truth:

- `POST_PHASE3A_REVIEW_AND_PHASE3B_FRACTURED_MAGIC_ALTERATION_FIDELITY_PLAN.md`
- source-plan SHA-256: `FE9BB4AF56A78BB8A354F19F7B6D28C3DCA4980189B262EC4D4301F552EF3B25`

Implementation commit:

- `d4f22de743efc3f4a153e5a67e913f59d751dd52` — `fix: preserve fractured Magic Alteration probability`

This report is a follow-up documentation commit; no mechanics or harness source changed after the implementation commit and its successful deployment.

## 1. Outcome

Phase 3B removes the one-fractured-affix Magic Alteration shortcut that forced every roll onto the open side. Analytical transition generation and Monte Carlo sampling now consume one versioned Magic roll-shape contract, preserve persistent fractured affixes, satisfy requested Prefix/Suffix sides independently, and retain blocked-side probability as a real self-loop.

Consequently:

- a fractured-Prefix Magic Alteration has a real blocked Prefix-only self-loop and a separately weighted open-Suffix outcome;
- fractured-Suffix behavior is the exact mirror modulo the eligible Prefix pool;
- Alter and Augment transitions are no longer treated as equivalent;
- their Bellman ranking remains price- and continuation-dependent rather than hardcoded;
- Scour with one persistent fracture produces the actual Magic state and continues with the selected action from that state;
- PolicyFlow exposes the resulting repeat/recovery branches with conserved occupancy and explanatory evidence.

No Craft-specific mechanics branch, market-fractured ranking, hardcoded action winner, approximate 52/48 hardcode, weakened state identity, or unit test was introduced.

## 2. Exact pre-fix defect

The old one-fractured-affix analytical and sampled Alteration path detected the persistent Prefix or Suffix and directly rolled the opposite side. It skipped the global Magic result-shape draw. A requested same-side one-affix shape therefore disappeared, and its probability was implicitly renormalized onto the open side.

For one fractured Prefix under the configured roll-shape approximation, the defect changed the physical distribution from:

```text
P(no new affix) = 0.25
P(add open Suffix) = 0.75
```

to the incorrect:

```text
P(no new affix) = 0
P(add open Suffix) = 1
```

The same defect existed symmetrically for one fractured Suffix. It affected transition probabilities, sampled behavior, downstream action usage, Bellman values, policy-flow topology, and recovery routing.

## 3. Final shared Magic roll-shape contract

`crafting-engine/src/rules/magicRollShape.ts` is the single analytical/sampling contract:

| Quantity | Configured probability |
|---|---:|
| One-affix Magic result | `0.50` |
| Two-affix Magic result | `0.50` |
| Prefix share within one-affix results | `0.50` |
| Suffix share within one-affix results | `0.50` |
| Prefix-only shape | `0.25` |
| Suffix-only shape | `0.25` |
| Prefix-and-Suffix shape | `0.50` |

Contract version: `MAGIC_ROLL_SHAPE_PHASE3B_V1`.

Confidence is explicitly `APPROXIMATE`. The existing documented 50/50 one-affix/two-affix model remains configured. The field observation of approximately 52/48 was not independently pinned to an exact authoritative value, so it was documented but neither asserted as exact nor hardcoded. Fractured-slot behavior is exact relative to the declared contract.

The generic algorithm now:

1. starts from persistent fractured affixes;
2. samples/enumerates the shared desired shape;
3. attempts each requested side independently against physical occupancy and the authoritative eligible weighted pool;
4. emits the unchanged state when a requested side is occupied or has no eligible affix;
5. combines identical destinations without dropping their probability mass.

## 4. Analytical acceptance

The controlled pool gives both sides a target weight of `2` and a filler weight of `3`, hence target share:

```text
w = 2 / (2 + 3) = 0.40
```

### Fractured Prefix

```text
P(self-loop)
  = P(one affix) * P(Prefix | one affix)
  = 0.50 * 0.50
  = 0.25

P(add open Suffix)
  = P(one affix) * P(Suffix | one affix) + P(two affixes)
  = 0.50 * 0.50 + 0.50
  = 0.75
```

### Fractured Suffix

The mirrored result is:

```text
P(self-loop) = 0.25
P(add open Prefix) = 0.75
```

### Weighted target hit

For either fractured side in the controlled pool:

```text
P(Alter target hit) = P(open-side request) * target weight share
                    = 0.75 * 0.40
                    = 0.30
```

### Augment differential

Augment fills the only open side without drawing a one-vs-two-affix shape:

```text
P(Augment self-loop) = 0
P(Augment open-side addition) = 1
P(Augment target hit) = 1 * 0.40 = 0.40
```

Alter and Augment thus differ mechanically, but neither is declared the economic winner by mechanics code.

## 5. Seeded Monte Carlo parity

Each case used 250,000 trials. Every analytical value lies inside its independently computed 99% Wilson interval.

| Case | Seed | Analytical | Observed | 99% Wilson interval | Result |
|---|---:|---:|---:|---:|---:|
| Clean one-affix shape | `989921281` | `0.500000` | `0.501252` | `[0.498676180, 0.503827754]` | PASS |
| Clean two-affix shape | `989921281` | `0.500000` | `0.498748` | `[0.496172246, 0.501323820]` | PASS |
| Fractured Prefix self-loop | `989986818` | `0.250000` | `0.249544` | `[0.247321291, 0.251780003]` | PASS |
| Fractured Prefix open Suffix | `989986818` | `0.750000` | `0.750456` | `[0.748219997, 0.752678709]` | PASS |
| Fractured Prefix target Suffix | `989986818` | `0.300000` | `0.302020` | `[0.299659979, 0.304390530]` | PASS |
| Fractured Suffix self-loop | `990052355` | `0.250000` | `0.249196` | `[0.246974339, 0.251430974]` | PASS |
| Fractured Suffix open Prefix | `990052355` | `0.750000` | `0.750804` | `[0.748569026, 0.753025661]` | PASS |
| Fractured Suffix target Prefix | `990052355` | `0.300000` | `0.301748` | `[0.299388591, 0.304117932]` | PASS |
| Augment target Suffix | `990183429` | `0.400000` | `0.398368` | `[0.395848673, 0.400892721]` | PASS |

Analytical and sampled runs produced zero illegal double-Prefix and zero illegal double-Suffix outcomes.

## 6. Probability and occupancy audit

The clean Alter, fractured-Prefix Alter, fractured-Suffix Alter, and fractured-Prefix Augment distributions each sum to exactly `1` within tolerance `1e-12`. The blocked-side mass appears as a self-loop rather than being dropped or renormalized.

The real controlled price-reversal PolicyFlow is also certified:

- exact states represented: `686`;
- exact transitions represented: `130846`;
- macro topology: `18` nodes / `42` edges;
- maximum outgoing-flow difference: `1.1164047464262694e-10`;
- maximum conditional-probability difference: `2.220446049250313e-16`;
- terminal absorption difference: `1.7007621977427334e-9`;
- outgoing flow, conditional probability, and terminal absorption reconciliation: PASS.

Its corrected downstream self-loop is `flow_downstream_f4484364`:

- action and next selected action: Alteration;
- conditional probability: `0.25`;
- expected flow: `52.049037780629426`;
- representative explanation: `Magic Prefix-only roll: no new affix — fractured Prefix already occupies the requested side`.

## 7. Bellman and economics

The controlled fracture-only Magic state used the committed Allflame snapshot (`alteration = 0.1336c`, `augmentation = 0.03941c`).

| Action | Immediate cost | Expected continuation | Total Q | Target hit | No-new mass |
|---|---:|---:|---:|---:|---:|
| Augment | `0.03941c` | `0.21517875c` | `0.25458875c` | `0.40` | `0` |
| Alter | `0.1336c` | `0.22503125c` | `0.35863125c` | `0.30` | `0.25` |

The selected action is Augment for this snapshot because its computed Q-value is lower. The proof is fully resolved, proper, absorbing, and cost-reconciled.

The controlled reversal changed only those two currency rates (`alteration = 0.0001c`, `augmentation = 50c`):

| Action | Total Q under reversal |
|---|---:|
| Alter | `0.0003333333333333333c` |
| Augment | `50.0002c` |

Alter becomes selected. This proves the winner emerges from mechanics, prices, and continuation values; there is no Augment-specific or Alter-specific winner rule.

## 8. Self-fracture acquisition and downstream before/after

### Shield fixture

The Phase 2Z shield fixture provides a topology-bearing before artifact. The route remains `Self-fracture Riot Queller`.

| Metric | Before Phase 3B | After Phase 3B | Delta |
|---|---:|---:|---:|
| Acquisition EV | `1652.3740800069322c` | `1652.3740800069322c` | `0c` |
| Downstream EV | `105.2366922587018c` | `113.98089928629301c` | `+8.74420702759121c` |
| Full-route EV | `1757.610772265634c` | `1766.3549792932251c` | `+8.7442070275911c` |
| Alter count | `1850.6851703831362` | `1850.6851703804941` | numerical tolerance only |
| Augment count | `351.4758207473403` | `486.1471133409799` | `+134.6712925936396` |
| Scour count | `21.475820745959325` | `21.475820745854048` | numerical tolerance only |
| Regal count | `25.475820745968154` | `25.475820745862816` | numerical tolerance only |
| Expected physical actions | `2275.1572958322936` | `2409.828588423025` | `+134.6712925907314` |
| Estimated manual time | `928262.9183329939 ms` | `982131.4353692862 ms` | `+53868.517036292236 ms` |
| Policy topology | `18 / 37`, `topology-e5f288b9` | `18 / 38`, `topology-8d0a74e9` | one real branch added |

All four selected Scour recovery edges now land on the actual one-fracture `MAGIC` state and continue with the computed selected action, Augment. Current flow reconciliation is certified; maximum outgoing difference is `1.1550582712516189e-10` and terminal-absorption difference is `5.988320950223169e-12`.

Acquisition EV is unchanged because this fixture prepares the item before fracture and performs terminal cleanup immediately after the desired fracture. The affected downstream loop pays for the extra Augment occupancy; the change is not a ranking patch.

The independent controlled acquisition synthesis also remains executable and proves the generic preparation path:

- status: `RESOLVED`;
- expected cost: `1203.8634880000036c`;
- lower bound: `299.6c`;
- expected fractures: `4.000000000000012`;
- expected restarts: `3.0000000000000093`;
- selected policy: fully resolved, proper, absorbing, and cost-reconciled;
- reconciliation difference: `3.637978807091713e-12`.

### Exact Chaos Damage three-notable field control

The exact field request remains Dark Ideation + Unspeakable Gifts + Wicked Pall on an ilvl 75 eight-passive Chaos Damage Large Cluster Jewel. The solver still selected `Self-fracture Unspeakable Gifts`, but the gate does not assert that name; it records the computed winner.

| Required field metric | Before Phase 3B | After Phase 3B | Delta/disposition |
|---|---:|---:|---:|
| Selected acquisition | Self-fracture Unspeakable Gifts | Self-fracture Unspeakable Gifts | computed, not asserted |
| Acquisition EV | `1440.9838929989774c` | `1440.9838929989774c` | `0c` |
| Full-route EV | `1648.1712565453913c` | `1658.464113712305c` | `+10.2928571669137c` |
| Downstream EV | `207.18736354641402c` | `217.4802207133278c` | `+10.29285716691378c` |
| Alter count | `2446.694967464281` | `2446.694967464099` | numerical tolerance only |
| Augment count | `405.36587184305085` | `666.5396137093154` | `+261.17374186626455` |
| Scour count | `52.86587184330265` | `52.86587184329363` | numerical tolerance only |
| Regal count | `56.86587184330046` | `56.86587184329129` | numerical tolerance only |
| Policy topology | not emitted by the pre-Phase-2Z field artifact | `23 / 49`, `topology-b6fb87a1` | new exact Phase 3B capture |
| Scour destinations | not represented by the historical field artifact | seven `MAGIC -> Augment` recovery destinations | actual state/action captured |

The field PolicyFlow is certified with maximum outgoing-flow difference `6.298250809777528e-11`, maximum conditional-probability difference `1.1102230246251565e-16`, and terminal-absorption difference `2.0510804166207208e-10`.

## 9. Cache/session invalidation and state identity

Incompatible mechanics sessions cannot reuse the old transition kernels:

| Identity | Before | After |
|---|---|---|
| Mechanics action-set version | `phase2j-core-actions-v1` | `phase3b-magic-roll-shape-v1` |
| Optimizer identity hash | `phase2j-cee29d59` | `phase2j-67d8b678` |
| Repeatable Magic kernel | implicit/special-cased | `MAGIC_ROLL_SHAPE_PHASE3B_V1` |
| Relaxed bound version | prior V2 identifier | `RELAXED_TARGET_PROGRESS_LOWER_BOUND_V2_PHASE3B_MAGIC_ROLL_SHAPE` |

The hashes differ as required. Share/export bundles contain request/result summaries, not live continuation graphs.

Canonical physical state identity remains `FRACTURE_PREPARATION_BISIMULATION_V1`. It was not weakened or made coarser: the physical equivalence relation was unchanged because the state description was already sufficient; transition/session identities were invalidated because the kernel changed.

## 10. PolicyFlow, recovery copy, and screenshot

The real Worker controlled reversal renders the new Alter self-loop, its exact `0.25` conditional probability, expected occupancy, next selected action, and blocked-side explanation. Evidence:

- `quality-lab/reports/evidence/phase3b-alter-self-loop-flow.json`
- `quality-lab/reports/evidence/phase3b-alter-self-loop.png`
- `quality-lab/reports/evidence/phase3b-current-self-fracture-flow.json`
- `quality-lab/reports/evidence/phase3b-field-three-notable.json`

![Corrected fractured-Magic Alter self-loop in the selected PolicyFlow](../../quality-lab/reports/evidence/phase3b-alter-self-loop.png)

Craft-guide recovery copy now explains that Scour removes removable affixes while retaining fractures, derives the resulting rarity from the physical state, and continues with the optimizer's selected action. It no longer promises a fixed Transmute destination when one fracture leaves the item Magic. Reacquire returns to the selected acquisition route rather than a fabricated generic destination.

## 11. Clean controls and external parity

One/two-mod controls passed:

- the clean Worker/canonical gate passed;
- the real clean PolicyFlow remained exactly equal to the reviewed frozen flow;
- the frozen renderer gate passed;
- clean analytical one-affix/two-affix probabilities remained `0.5 / 0.5`;
- no unrelated clean transition or renderer regression was detected.

Nine affected external/Craft of Exile parity benchmarks were rerun:

| Benchmark | Status | Phase 3B classification |
|---|---|---|
| `alt_t1_int` | ALIGNED | preserved; starts without a fracture |
| `alt_t1_int_es_raw_magic` | ALIGNED | preserved; starts without a fracture |
| `harvest_defences_t1_int_es_raw_presence` | CLOSE / APPROXIMATE | preserved; unrelated mechanic |
| `annul_once_after_harvest_t1_int_es_raw_hit` | CLOSE / APPROXIMATE | preserved; unrelated mechanic |
| `harvest_then_one_annul_t1_int_es_presence` | CLOSE / APPROXIMATE | preserved; unrelated mechanic |
| `fracture_t1_int` | ALIGNED | preserved; unrelated mechanic |
| `compound_harvest_frac_int_to_es35` | REFERENCE EXPECTATION | preserved; unrelated mechanic |
| `annul_after_compound_harvest` | REFERENCE EXPECTATION | preserved; unrelated mechanic |
| `final_exalt_attr_or_attack_speed` | ALIGNED | preserved; unrelated mechanic |

No existing approximate Harvest classification was upgraded or hidden.

## 12. Files changed

Mechanics and solver:

- `crafting-engine/src/rules/magicRollShape.ts`
- `crafting-engine/src/rules/actionRegistry.ts`
- `crafting-engine/src/solver/genericSearch.ts`
- `crafting-engine/src/solver/relaxedTargetProgressLowerBound.ts`
- `crafting-engine/src/service/optimizerService.ts`
- `crafting-engine/src/service/craftPlan.ts`
- `crafting-engine/src/index.ts`

Phase 3B diagnostics and command wiring:

- `scripts/phase3bDiagnostics.ts`
- `scripts/phase3aDiagnostics.ts`
- `package.json`
- `output-phase3b-fractured-magic-alteration-diagnostic.txt`
- `output-phase3a-quality-lab-execution-efficiency-diagnostic.txt`
- `output-fracture-fidelity-phase2e.txt`

Quality Lab definitions and implementation:

- `quality-lab/fixtures/fixtureCorpus.json`
- `quality-lab/src/gateRegistry.ts`
- `quality-lab/src/gateWorker.ts`

Committed evidence and reports:

- `quality-lab/reports/evidence/phase3b-fractured-magic-alteration-diagnostic.json`
- `quality-lab/reports/evidence/phase3b-alter-self-loop-flow.json`
- `quality-lab/reports/evidence/phase3b-alter-self-loop.png`
- `quality-lab/reports/evidence/phase3b-current-self-fracture-flow.json`
- `quality-lab/reports/evidence/phase3b-field-three-notable.json`
- `quality-lab/reports/evidence/phase3a-quality-lab-diagnostic.json`
- `quality-lab/reports/phase3b-targeted-alter.json`
- `quality-lab/reports/phase3b-targeted-alter.md`
- `quality-lab/reports/phase3b-targeted-self-fracture.json`
- `quality-lab/reports/phase3b-targeted-self-fracture.md`
- `quality-lab/reports/phase3b-targeted-clean-flow.json`
- `quality-lab/reports/phase3b-targeted-clean-flow.md`
- `quality-lab/reports/phase3b-targeted-field.json`
- `quality-lab/reports/phase3b-targeted-field.md`
- `quality-lab/reports/phase3a-dev-gate.json`
- `quality-lab/reports/phase3a-dev-summary.md`
- `quality-lab/reports/phase3a-release-gate.json`
- `quality-lab/reports/phase3a-release-summary.md`
- `quality-lab/reports/latest.json`

## 13. Diagnostics and targeted Quality Lab results

Direct mechanics:

```text
npm run diagnostic:phase3b
```

Result: PASS. It covers the shared contract, Prefix/Suffix algebra, weighted targets, Augment differential, four probability-sum audits, illegal occupancy, seeded Monte Carlo/Wilson parity, Bellman Q-values, price reversal, acquisition synthesis, cache identity, and nine external parity controls.

Affected mature diagnostics:

```text
npx tsx crafting-engine/scripts/phase2iWeightPolicyDiagnostic.ts
npx tsx crafting-engine/scripts/phase2eFractureFidelityDiagnostic.ts
```

Both passed. The Phase 3A preservation diagnostic also passed all 15 checks after incorporating the Phase 3B direct diagnostic:

```text
npm run diagnostic:phase3a
npm run diagnostic:phase3a:committed
```

Targeted browser commands used the exact-gate form and dedicated reports:

```text
npm run -- lab:gate -- --gate B-fractured-magic-alter-price-reversal --report quality-lab/reports/phase3b-targeted-alter.json
npm run -- lab:gate -- --gate B-self-fracture-policy --report quality-lab/reports/phase3b-targeted-self-fracture.json
npm run -- lab:gate -- --gate A-clean-worker-canonical --gate D-real-policy-flow-differential --gate D-frozen-policy-flow-renderer --report quality-lab/reports/phase3b-targeted-clean-flow.json
npm run -- lab:gate -- --gate E-research-field-proof --report quality-lab/reports/phase3b-targeted-field.json
```

| Targeted selection | Result | Wall time | Runtime errors |
|---|---:|---:|---:|
| Alter price reversal and self-loop | `1/1 PASS` | `29.640 s` | `0 / 0 / 0` |
| Current self-fracture policy | `1/1 PASS` | `28.059 s` | `0 / 0 / 0` |
| Clean Worker + real/frozen flow | `3/3 PASS` | `5.120 s` | `0 / 0 / 0` |
| Exact field three-notable gate | `1/1 PASS` | `257.566 s` | `0 / 0 / 0` |

The field run was the specifically required `3B14` exact gate, not the EXTENDED suite or a legacy soak. Automatic long soak was `NO` for every targeted report.

An early targeted reversal pass completed all mechanics/flow assertions but its screenshot interaction closed the overlay when a collapsed technical-details control bubbled. The harness was corrected to inspect the already-rendered hidden evidence without that pointer interaction, and the stable targeted run above plus final DEV and RELEASE passed. No production mechanics was changed for that harness issue.

## 14. DEV, RELEASE, and long-suite disposition

Final DEV:

- command: `npm run lab:dev`;
- result: `6/6 PASS`;
- wall time: `84.474 s`;
- compatibility: `compatible-52913c9a49518520a46c9e08`;
- console/page/network errors: `0 / 0 / 0`;
- automatic long soak: `NO`.

Optimized RELEASE was run exactly once after the final source/harness identity stabilized:

- command: `npm run lab:release`;
- result: `12/12 PASS`;
- wall time: `103.727 s`;
- compatibility: `compatible-52913c9a49518520a46c9e08`;
- solver-heavy time: `78.258 s`;
- console/page/network errors: `0 / 0 / 0`;
- automatic long soak: `NO`.

EXTENDED: **NOT RUN**.

Legacy 115-gate release matrix: **NOT RUN**.

There was no targeted failure requiring either long suite, and the user did not request one. The historical `1298.597 s` legacy runtime was used only as saved comparison data; it was not re-executed.

## 15. Build hygiene and deployment

Final local validation:

```text
npm run build                              PASS
npm run lint                               PASS
npm run lab:typecheck                      PASS
git diff --check                           PASS
npm run diagnostic:phase3a:committed       PASS (15/15)
```

The build emitted only the already-known Vite native-config/chunk advisory warnings; there was no build failure.

Implementation commit `d4f22de743efc3f4a153e5a67e913f59d751dd52` was pushed directly to `origin/main` and deployed successfully:

- GitHub Actions run: `33087152959`;
- workflow: `Deploy to GitHub Pages`;
- validate/build job: PASS (`17 s`);
- deploy job: PASS (`10 s`);
- completed: `2026-08-27T15:19:46Z`;
- run URL: `https://github.com/jpitty03/cluster-jewel-research/actions/runs/33087152959`;
- hosted URL: `https://jpitty03.github.io/cluster-jewel-research/`;
- Pages API status after deployment: `built`.

## 16. Prohibitions and remaining uncertainty

| Requirement | Result |
|---|---|
| Unit tests added | NO |
| Unit tests run | NO |
| Hardcoded Alter/Augment winner | NO |
| Hardcoded approximate 52/48 split | NO |
| Craft-specific mechanics branch | NO |
| Market-fractured ranking | NO |
| Canonical state identity weakened | NO |
| EXTENDED run | NO |
| Legacy long release run | NO |

Precise mechanics probability changes:

- clean Magic Alteration: no configured probability change;
- one-fractured-Prefix Alteration: self-loop `0 -> 0.25`, open-Suffix addition `1 -> 0.75`, target hit `w -> 0.75w`;
- one-fractured-Suffix Alteration: mirrored self-loop `0 -> 0.25`, open-Prefix addition `1 -> 0.75`, target hit `w -> 0.75w`;
- Augment from a one-fracture Magic item: unchanged at open-side addition `1`, target hit `w`;
- all generated distributions: mass `1`, with blocked outcomes explicitly represented.

Remaining mechanics uncertainty is limited to the exact global one-affix/two-affix Magic roll-shape split. The implementation keeps the existing transparent 50/50 approximation and records the unpinned approximately 52/48 observation as such. If authoritative exact evidence becomes available, only the shared versioned contract and its evidence should change; both analytical and sampled paths will consume it together.

## 17. Completion-gate self-review

All Phase 3B completion gates are satisfied:

- the fractured-affix shortcut is removed and probability mass is preserved;
- Prefix/Suffix symmetry, weighted pools, Augment differential, Monte Carlo parity, probability sums, and occupancy limits pass;
- Q-values and the controlled reversal prove emergent action selection;
- acquisition and both affected self-fracture routes were regenerated;
- mechanics/session caches are invalidated without weakening state identity;
- real Worker flows show the Alter self-loop, actual Scour-to-Magic destinations, selected reacquisition behavior, explanatory labels, and certified conservation;
- exact field, clean controls, affected mature diagnostics, targeted browser gates, DEV, one final optimized RELEASE, build hygiene, push, and deployment pass;
- EXTENDED, legacy release, and unit tests were not run.

Phase 3B is closed.
