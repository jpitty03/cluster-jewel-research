# Phase 3C Policy Admissibility and Constellation Readability Completion Report

Status: **COMPLETE / PASS — deployment closeout pending final push**

Date: 2026-08-27

Baseline: `c8f3fb0` (`main`, pulled clean before implementation)

Source of truth: `POST_PHASE3B_FIELD_AUDIT_AND_PHASE3C_POLICY_ADMISSIBILITY_CONSTELLATION_READABILITY_PLAN.md`

## 1. Scope and frozen field fixture

Both Phase 3C tracks are complete, in order:

1. Open-versus-Conventional policy admissibility, family-context re-evaluation, monotone known incumbents, and proof-status clarity.
2. Semantic large-SCC Constellation layout with unchanged PolicyFlow truth.

The exact field fixture is:

| Field | Value |
|---|---|
| Base | Large Cluster Jewel |
| Cluster type | Minions deal 10% increased Damage |
| Item level / passives | 84 / 8 |
| Target | Primordial Bond + Renewal + Rotten Claws |
| Final state | Rare; extra affixes allowed |
| Objective | `CHEAPEST_CHAOS` |
| Budget | NORMAL: 5,000 states / 30,000 ms / 3 rounds |
| Clean base / sale value | 40c / 1708c |
| Relevant rates | annul 11.66c; exalt 1.17c; scour 0.5391c; alteration 0.1336c; transmutation 0.005012c; augmentation 0.03941c; regal 0.03638c; fracturing 298.6c |

The fixture is committed in `quality-lab/fixtures/fixtureCorpus.json`. The exact large-flow renderer artifact and metadata are `policy-flow-phase3c-large-v1-artifact.json` and `policy-flow-phase3c-large-v1.json`.

## 2. Track 1 — policy consistency

### Historical contradiction

The source audit recorded two individually executable but not globally optimality-proven policies:

| Historical field result | Open clean policy | Independent Conventional |
|---|---:|---:|
| Full-route U | 1440.187675118228c | 2276.640766582872c |
| Expected actions | 8623.468731 | 16142.004546 |
| Fingerprint | `policy-8d1a067c` | `policy-4aa41222` |
| On-policy / terminal states | 1592 / 15 | 1214 / 15 |
| Policy execution | certified, proper, absorbing, reconciled | certified, proper, absorbing, reconciled |
| Family optimum | not proven | not proven |

The 836.453091464645c contradiction was real family-incumbent inconsistency. Certification established that each returned policy was executable; it did not establish that the independently searched Conventional policy was the cheapest known executable Conventional policy.

Historical action occupancy showed where the cost separated:

| Action | Open clean | Independent Conventional |
|---|---:|---:|
| Alteration | 5321.460228 | 15635.418582 |
| Augmentation | 1515.246688 | 424.936073 |
| Regal | 578.144255 | 18.416187 |
| Scour | 577.144255 | 17.416187 |
| Annul | 22.122089 | 8.464367 |
| Exalt | 31.206960 | 18.936963 |
| Transmute | 578.144255 | 18.416187 |

### Exact root cause and divergence

The canonical Open clean search and each constrained-family search owned separate retained graphs and continuation sessions. Conventional started a new, smaller graph and could return as soon as its current policy was executable even though family optimality remained unproven. No path imported an already-known, family-legal Open policy as an executable incumbent.

The Phase 3C exact-state comparison measured:

- known clean graph: 3,334 retained states;
- independent Conventional graph: 1,667 retained states;
- common retained states: 523;
- retained only in the known graph: 2,811;
- known on-policy states missing from the independent graph: 231;
- common on-policy states with different selected actions: 1.

Highest-occupancy missing states are one-affix Magic misses. For example, each of the Armour, Damage, Energy Shield, Evasion, Life, and Mana prefix states had 1,013.806982 expected visits under the known policy, selected `alteration_orb`, and was absent from the independent graph. More importantly for the historical Alter-versus-Augment split, the exact state

```text
magic | P:[Renewal target] | S:[]
```

had 422.419576 expected visits under the known policy, selected `augmentation_orb` with Q 4725.114446c in that retained graph, and was not discovered by the independent Conventional graph. That is the concrete state/action/search divergence behind the smaller Conventional promotion frontier and its much larger Alteration occupancy. The ranked evidence is in `C5_searchDivergence` of the Phase 3C diagnostic artifact.

The defect was therefore not a mechanics difference or an illegal action vocabulary. It was independent search coverage plus missing known-incumbent propagation, combined with UI language that made “policy certified” sound stronger than “best found, optimum unproven.”

### Generic repair

`policyAdmissibility.ts` now audits a candidate before it can become a family incumbent. It validates, without target-specific branches:

- actual acquisition destination kind, complete physical identity, and independently supplied family acquisition cost;
- mechanics/economics session identity and exact target/terminal definition;
- required, allowed, and forbidden positive-occupancy actions;
- exact legality in every reachable selected state using the shared action registry;
- regenerated canonical transition destinations and complete probability mass;
- immediate chaos, physical-action, and manual-time vectors;
- a fresh fixed-policy Markov value and occupancy solve;
- properness, absorption, cost/action/time parity, and cost reconciliation.

An admissible policy becomes a real candidate bundle, not a copied scalar. The independent family solve still runs and may improve it. Final family U is selected generically as the better executable policy, with provenance:

- `INDEPENDENT_DISCOVERY`;
- `ADMISSIBLE_KNOWN_POLICY`;
- `IMPROVED_FROM_KNOWN_POLICY`.

The family search status is separately reported as `OPTIMAL_PROVEN`, `BEST_FOUND_UNPROVEN`, or `UNRESOLVED`.

### Acceptance outcomes

The final targeted browser run reproduced the historical clean-policy value and closed the contradiction:

| Targeted exact Worker result | Value |
|---|---:|
| Known clean Open U | 1440.187675118228c |
| Family-context revalidated known U | 1440.187675570190c |
| Final Conventional U | 1440.187675118228c |
| Revalidated selected decisions / transition outcomes | 1,577 / 45,452 |
| Maximum transition probability difference | 0 |
| Incumbent provenance | `ADMISSIBLE_KNOWN_POLICY` |
| Family search status | `BEST_FOUND_UNPROVEN` |
| Canonical fingerprint equivalence | true |

Thus Conventional no longer publishes 2276.640767c when the 1440.187675c clean policy is known and admissible. Cost accounting reconciled as 40c acquisition + 1400.187675c downstream = 1440.187675c full route.

The same fixture also exercised the legitimate Outcome B path. When the canonical selected Open candidate was self-fracture rather than clean acquisition, Conventional rejected it with three exact failures:

1. `ACQUISITION_KIND_MISMATCH`: Conventional requires CLEAN; the candidate uses SELF_FRACTURE.
2. `ACQUISITION_IDENTITY_MISMATCH`: expected the clean Normal base; actual was the Magic base with fractured Primordial Bond.
3. `ACQUISITION_COST_MISMATCH`: family clean acquisition was 40c; source self-fracture acquisition was 1406.296315c.

This restriction is now visible on the family card. A separate clean Open candidate may still be audited and imported. In the final RELEASE run, independent Conventional found 2276.640767c and improved the currently revalidated 4767.731261c clean incumbent, so provenance correctly became `IMPROVED_FROM_KNOWN_POLICY`. In a budget where the independent solve remained unresolved, the direct diagnostic retained the revalidated clean 4767.731261c incumbent. These two paths prove both sides of the monotonic rule:

```text
familyU <= revalidated admissible known-policy U + 0.05c
```

Harvest-required controls rejected policies lacking the required Harvest action. Self-fracture controls rejected clean acquisition identity. No equality-only policy equivalence was introduced; equality presentation still requires the complete Phase 2Y canonical policy fingerprint.

## 3. Track 2 — large-SCC Constellation

### Before

The audited field policy contained 1,592 exact states, 45,452 exact transitions, 42 macro nodes, 172 macro edges, one large cyclic SCC, 32 recovery edges, and 29 repeats. The previous renderer placed every multi-node SCC on a ring capped near 125px and requested roughly 620px of height. It also displayed deterministic traversal numbers as though cyclic policy states formed one chronology.

The retained pre-Phase-3C chronology reference is `quality-lab/reports/evidence/phase2x-three-notable-constellation.png`. The exact pre-change large-field geometry is documented by the metrics above; no exact 42-node pre-change screenshot was persisted, so this report does not mislabel a different graph as that frame.

### New semantic SCC layout

Tarjan SCC detection and the condensed DAG remain unchanged. SCCs of eight nodes or fewer retain deterministic compact rings. Larger SCCs use `SCC_HYBRID_SEMANTIC_V2`:

- Acquisition/Normal, Magic rolling, Promotion, Rare finishing, Recovery, and Goal semantic bands;
- generic rarity, target progress, affix count, action category, recovery status, occupancy, and deterministic barycentric ordering;
- 280px semantic-column spacing and 112px row spacing;
- lower multi-lane quadratic recovery corridors;
- local self loops and distinct progress/back-edge routing;
- desktop viewport `height: clamp(700px, 72vh, 950px)`;
- graph-aware Fit All bounds, pan/zoom, and existing interaction semantics;
- no chronological number in default node labels, accessibility labels, details, or route rail; optional labels are explicitly named traversal indexes.

The layout uses only PolicyFlow state/action semantics. It contains no fixture name, target name, Craft branch, or hardcoded route order.

### After geometry and topology truth

The frozen exact-mechanics field stress flow contains:

| Metric | Result |
|---|---:|
| Macro nodes / edges | 43 / 191 |
| SCCs / cyclic SCCs | 2 / 1 |
| Nodes in large SCC | 42 |
| Branch / recovery / repeat edges | 29 / 34 / 41 |
| Semantic bands | 6 represented; 5 inside the large SCC |
| Horizontal / vertical large-SCC span | 1120px / 1456px |
| Minimum node-center distance | 112px |
| Default label collisions | 0 |
| Desktop viewport observed | 700px |
| Mobile document/body/viewport width | 390 / 390 / 390px |
| Default chronological ordinals | false |

The renderer fingerprint is `topology-3c852336` before and after presentation layout. Node IDs, edge identities, source/target endpoints, conditional probabilities, expected flow, and occupancy are byte-for-byte sourced from the frozen `SELECTED_POLICY_FLOW_V1` artifact. Reconciliation remained certified:

- maximum outgoing-flow difference: `1.8007995095103979e-10`;
- maximum conditional-probability difference: `4.440892098500626e-16`;
- terminal-absorption difference: `1.2487608724853771e-9`.

The final exact field Worker flow had its own current topology fingerprint, `topology-15b8f05d`. Because that selected run was smaller than 40 macro nodes, C8 used a targeted Conventional solve of the same frozen request and real shared mechanics to produce the committed 43-node field stress fixture. No synthetic nodes, probabilities, occupancy, or transitions were introduced.

### Human-reviewed screenshots

- Before chronology reference: `quality-lab/reports/evidence/phase2x-three-notable-constellation.png`
- After desktop 1440×900: `quality-lab/reports/evidence/phase3c-constellation-1440x900.png`
- After wide desktop 1920×1080: `quality-lab/reports/evidence/phase3c-constellation-1920x1080.png`
- After mobile 390×844: `quality-lab/reports/evidence/phase3c-constellation-mobile.png`
- Policy-family proof UI: `quality-lab/reports/evidence/phase3c-policy-family-desktop.png`

The screenshots were visually reviewed in addition to automated geometry checks. Desktop labels are separated across semantic columns, orange recovery corridors remain outside the main progress body, Goal is isolated to the right, and mobile remains graph-local with no document horizontal overflow.

## 4. Validation and runtime

No unit tests were added or run.

| Gate | Result |
|---|---|
| `npm run build` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS |
| `npm run lab:typecheck` | PASS |
| `npm run diagnostic:phase3c` | PASS, C1–C10 |
| Targeted `C-policy-family-admissibility` + `D-constellation-large-scc-layout` | PASS 2/2; run `2026-08-27T19-22-33-688Z`; 56.945s wall |
| DEV | PASS 8/8; run `2026-08-27T19-23-36-138Z`; 137.471s wall |
| RELEASE | PASS 14/14; run `2026-08-27T19-25-58-305Z`; 154.087s wall |
| Mature retained matrix | PASS 16/16 non-unit diagnostics |
| `diagnostic:phase3b` | PASS; 250,000 MC trials/case; self-loop 0.25/open side 0.75; price reversal preserved |
| `diagnostic:phase2z` | PASS; 5/5 topology fingerprints; exact flow/recovery preserved |
| `diagnostic:phase2y` | PASS; canonical equivalence and unequal-policy control preserved |

Chromium was `151.0.7922.34`. DEV and RELEASE both reported zero console, page, and network errors. Automatic long soak was `NO`.

EXTENDED, the nightly workflow, the legacy 115-gate suite, and the legacy release runner were not run. They were not independently justified for Phase 3C and remain manual-only.

## 5. Preservation audit

- Phase 3B fractured-Magic analytical and Monte Carlo roll shape: preserved.
- Phase 2Z PolicyFlow topology, probability mass, occupancy, Scour/reacquire destinations, and branch truth: preserved.
- Phase 2Y complete policy equivalence and canonical state identity: preserved.
- Executable self-fracture preparation/recovery: preserved.
- Market-fractured purchase ranking: absent.
- Target/Craft-specific production branches: absent.
- Hardcoded craft winner or target order: absent.
- State identity weakening: absent.
- Mechanics probability changes: none.

## 6. Evidence index

- `quality-lab/reports/evidence/phase3c-policy-admissibility-before.json`
- `quality-lab/reports/evidence/phase3c-policy-admissibility-after.json`
- `quality-lab/reports/evidence/phase3c-policy-admissibility-and-layout-diagnostic.json`
- `quality-lab/reports/evidence/phase3c-policy-family-browser.json`
- `quality-lab/reports/phase3a-targeted-gate.json`
- `quality-lab/reports/phase3a-dev-gate.json`
- `quality-lab/reports/phase3a-release-gate.json`
- `output-phase3c-policy-admissibility-layout-diagnostic.txt`

## 7. Commit and deployment

The implementation/report commit, pushed SHA, GitHub Pages workflow run, and deployed URL will be appended here after the final push. This unavoidable closeout is a documentation-only follow-up: a commit cannot embed its own content-derived SHA or its future workflow run ID.
