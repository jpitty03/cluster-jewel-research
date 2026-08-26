# Post-Phase 2U Field Review and Phase 2V Plan

## Phase 2V — Scroll Ownership, Constellation Semantic Accuracy, and Harvest Family Closure

Baseline reviewed: `f0ce5323a2960d9abf37cbe04a36b9835dc041a3` on `main`.

Primary real-user evidence reviewed:

```text
1mod.pdf
t1-armour_t1-evasion-compared-independently.pdf
4-mod-initial(5).pdf
```

No unit tests are to be added or run unless the user explicitly changes the existing project constraint. Preserve the current local-heavy / hosted-lean validation policy: the complete browser/solver matrix remains a mandatory local completion gate, while automatic Pages validation remains limited to fast build, lint, diff, and committed-evidence checks.

---

# 1. Executive Verdict

Phase 2U is **CLOSED / PASS** for its intended interaction, readability, and player-label scope.

The new PDFs confirm that Phase 2U fixed the original player-vocabulary problem:

- Search Activity uses compact stat labels rather than raw `AfflictionJewel...` IDs;
- Target Summary uses the full game-stat vocabulary;
- method cards use recognizable target text;
- the Constellation has route focus, fit, reset, zoom, pan, touch, keyboard, and concise rail controls;
- full-route accounting and proof language remain Phase 2T-consistent.

The field runs also expose three concrete remaining issues:

1. **Replay steals the document scroll position.** When analysis finishes, the page jumps to the Markov Constellation. While Replay remains active, scrolling back upward does not stick; the page is repeatedly pulled back until animation is paused.
2. **The Constellation can describe a clean route as a fracture route.** The one-mod clean-base result displays `Fractured Base` and a `1 Fracture` route step even though the selected acquisition is Clean Base and the self-fracture family is dominated.
3. **The independently constrained Harvest family still does not resolve for the T1 Armour + T1 Evasion control.** The application now reports this honestly, but it still cannot answer the original “Harvest may cost more but use fewer actions” comparison for that real fixture.

Phase 2V is a targeted field-correction phase. It must not redesign the solver, undo Phase 2T/2U contracts, add a hardcoded Harvest answer, or broaden into another large product phase.

---

# 2. Field-Evidence Summary

## 2.1 One-mod increased-effect control

Observed result:

```text
Target: 35% increased Effect (T1)
Selected acquisition: Clean Base
Expected full-route cost: 8.784c
Expected physical actions: 39
Estimated manual time: 15.7s
Acquisition portfolio: safe
Self-fracture: dominated at 359.8c lower bound
```

This is a healthy simple-control optimizer result.

However, its Constellation shows a selected route resembling:

```text
Fractured Base
→ 1 Fracture
→ 2 Transmute
→ 3 Alter
→ 4 Augment
→ 5 Complete
→ Complete
```

That is semantically wrong for a clean-base route and contains a duplicate terminal concept.

## 2.2 T1 Armour + T1 Evasion comparison

Observed result:

```text
Open policy:
  175.363c
  1,161 actions
  464.2s estimated time

Independent Conventional family:
  230.909c
  1,502 actions
  600.9s estimated time

Independent Harvest Reforge Defences family:
  acquisition resolved at 4.000c
  downstream unresolved
  full-route L = 5.574c
  required Harvest action not observed on a certified on-policy route

Self-fracture Armour/Evasion families:
  dominated by 359.8c admissible lower bounds
```

This correctly prevents an expensive fracture shortcut from winning a cheap craft. It also demonstrates that the Method Portfolio is genuinely distinguishing Open and independently constrained Conventional results.

But the Harvest comparison remains incomplete. The exact eligible repeat-Harvest family should not need an unbounded enumeration of every filler-mod permutation merely to establish a finite “repeat until target” route.

## 2.3 Four-mod shield fixture

Observed result:

```text
Base: Large Cluster Jewel
Enchant: 12% increased Attack Damage while holding a Shield
Targets: 35% Effect, T1 Intelligence, T1 ES, +4 Attributes
Selected route: self-fracture +6–8 Intelligence (T1)
Expected cost: 6090.831c
Expected actions: 28,683
Estimated time: 11,491.3s
Portfolio status: provisional
Competitive unresolved families: 4
Potential proof gap: 6080.685c
```

This result is proof-honest and should remain unchanged by Phase 2V except for presentation-only Constellation behavior. It is not the same physical fixture as the earlier 10% Attack Damage benchmark, so its different economics are not a regression by themselves.

---

# 3. Confirmed Root Cause: Replay Scroll Hijacking

The current Constellation has a timed replay index. Each active-node change runs:

```typescript
activeButton?.scrollIntoView({
  behavior: reducedMotion ? 'auto' : 'smooth',
  block: 'nearest',
  inline: 'center',
});
```

This runs on initial graph mount and again on every Replay step.

`Element.scrollIntoView()` is allowed to scroll every relevant ancestor, including the document viewport. `block: 'nearest'` does not mean “horizontal rail only.” It merely chooses the nearest vertical alignment. When the route rail is outside the viewport, the browser scrolls the page to the Constellation. The next replay tick repeats the behavior.

That exactly matches the observed symptom:

```text
Replay running  → page is repeatedly pulled to the Constellation
Replay paused   → active step stops changing, so scrolling upward works again
```

This is not a solver problem and should not be addressed by pausing Replay automatically.

---

# 4. Track A — Restore Document Scroll Ownership

## 4.1 Never use timed `scrollIntoView()` for route replay

Add a dedicated route-rail ref:

```typescript
const routeRailRef = useRef<HTMLDivElement | null>(null);
```

On active route-step changes, scroll only that element's horizontal axis.

Conceptually:

```typescript
const rail = routeRailRef.current;
const active = routeButtonRefs.current.get(activeReplayNodeId);

const desiredLeft =
  active.offsetLeft - (rail.clientWidth - active.offsetWidth) / 2;

rail.scrollTo({
  left: clamp(desiredLeft, 0, rail.scrollWidth - rail.clientWidth),
  behavior: reducedMotion ? 'auto' : 'smooth',
});
```

Do not call `scrollIntoView()` from a timer, animation loop, active replay effect, camera follow effect, or graph-mount effect.

## 4.2 Preserve horizontal route-rail following

The fix must retain the useful behavior:

- the active step remains visible inside the horizontal route rail;
- the rail may smoothly center an off-screen active chip;
- the document's `window.scrollY` does not change;
- no ancestor outside the route rail is scrolled;
- no element is focused merely because Replay advanced.

## 4.3 Respect user intent

Once a result appears, the user owns document scrolling.

Required behavior:

- completing analysis must not jump to the Constellation;
- Replay may continue while the user reads Search Activity, recommendation, method cards, or the form;
- scrolling upward must remain stable while Replay advances;
- scrolling below the Constellation must also remain stable;
- pausing/resuming Replay must not reposition the document;
- entering Fullscreen may change viewport context only through the user's explicit Fullscreen action;
- clicking a route chip may select/focus that chip, but it must not unexpectedly reposition the whole document.

## 4.4 Avoid focus-driven scroll

Audit the Constellation for:

- `.focus()` calls triggered by Replay;
- auto-focused selected-node controls;
- focus restoration to off-screen graph nodes;
- `scrollIntoView()` on route, label, node, or detail elements.

Only explicit user keyboard/pointer actions may transfer focus.

---

# 5. Track B — Make the Constellation Chronologically and Mechanically Accurate

## 5.1 Remove action-ID substring inference for acquisition type

The graph currently infers a fracture start from a route action ID containing `candidate_` and not containing `candidate_clean`.

That string heuristic is not a reliable domain contract.

Pass or derive an explicit presentation-safe acquisition descriptor from canonical result fields, conceptually:

```typescript
interface VisualizationAcquisitionContext {
  kind: 'CLEAN' | 'SELF_FRACTURE' | 'OTHER';
  targetModifier?: ModifierDisplayDescriptor;
  methodId?: string;
}
```

Authoritative sources may include:

- selected acquisition candidate ID;
- selected acquisition method ID;
- acquisition method type;
- exact selected self-fracture target descriptor.

Do not infer route semantics from display text or an incidental action-ID naming convention.

## 5.2 Correct start chronology

### Clean route

The graph should begin:

```text
Clean Base
→ Transmute
→ Alter
→ Augment when needed
→ Promote/Finish/Recover as selected
→ Goal
```

It must not contain:

```text
Fractured Base
Fracture
fracturing_orb
```

unless the selected on-policy route actually contains self-fracture acquisition.

### Self-fracture route

The chronological graph should not imply that the user starts with an already fractured base and then fractures it.

Preferred sequence:

```text
Clean Base
→ Create Fractured <player target>
→ downstream crafting
→ Goal
```

The acquisition step details may contain the full preparation/restart policy. The persistent label remains concise.

## 5.3 Make `ACQUIRE` labels data-driven

The current compact-label rule returns `Fracture` for every `ACQUIRE` phase.

Replace it with logic driven by explicit acquisition context and action evidence:

```text
Clean base purchase        → Acquire Base or omit duplicate graph step
Executable self-fracture   → Fracture <compact target>
Other modeled acquisition  → Acquire
```

Do not classify every `ACQUIRE` step as `FRACTURE_FAMILY`.

## 5.4 Avoid duplicated start/acquisition concepts

For a simple Clean Base acquisition, the start node already communicates the starting physical state. The graph may omit a redundant `Acquire the base` action node from the visual route while preserving it in the normal craft guide and accounting.

For self-fracture, the acquisition action is mechanically meaningful and remains visible.

The visual graph is a chronological abstraction, not a one-to-one dump of every plan section.

## 5.5 Remove duplicate terminal chips

The current rail may show both:

```text
5 Complete
Complete
```

or:

```text
8 Complete
Complete
```

When the final craft-plan step already represents success/finish, do one of:

- use that step as the terminal node; or
- keep a separate terminal node labeled `Goal`, but exclude the redundant second `Complete` from the route rail.

Acceptance: one clear terminal concept, no `Complete Complete` sequence.

## 5.6 Graph-data assertions

The graph model itself—not only the screenshot—must assert:

- clean selected route has zero selected fracture nodes and zero selected `fracturing_orb` edges;
- self-fracture selected route has exactly one acquisition-stage fracture concept;
- the terminal concept is unique;
- node/edge route order matches craft-plan chronology;
- every visible player target retains its exact descriptor ID underneath.

---

# 6. Track C — Close the T1 Armour + T1 Evasion Harvest Family

## 6.1 Preserve the current honest lifecycle

Until a certified required-action route exists, continue reporting:

```text
ENABLED_UNRESOLVED
```

Do not rename the route as selected, faster, cheaper, or executable based on a lower bound.

## 6.2 Diagnose the state explosion first

For the exact frozen fixture, record:

- enabled Harvest action ID;
- eligible tagged pool size and weight;
- exact one-use success probability;
- 3-affix versus 4-affix success contributions;
- number of unique raw outcomes;
- number of canonical states;
- number of states differing only by nonpersistent filler identity;
- required-action witness status;
- unresolved probability mass;
- time spent in transition generation, graph insertion, Bellman, and occupancy.

The likely cause is that a memoryless full reroll is being represented as thousands of concrete post-roll filler permutations, even though applying the same Harvest reforge again discards those non-fractured fillers.

Do not assume that diagnosis without measuring it.

## 6.3 Add a generic repeatable-reroll certification path

Implement a generic mechanism for a full-reroll action only when the engine can prove all of the following:

1. the action remains legal after every nonterminal miss state in the proposed loop;
2. preserved state components are identical across attempts, including fractures and item flags;
3. nonpersistent affixes are replaced by the action;
4. the next-outcome distribution is identical for every miss state after target-relevant aggregation;
5. target success is absorbing;
6. the required action has positive expected on-policy visits.

When those properties hold, aggregate the transition kernel into:

```text
success probability p
miss probability 1-p
```

and solve the exact geometric loop:

```text
expected applications = 1 / p
expected action cost   = actionCost / p
expected action count  = 1 / p
expected manual time   = actionTime / p
```

Include clean-base acquisition and any other genuinely required costs once.

This may be implemented as:

- a compact exact Markov policy; or
- a certified incumbent/seed consumed by the family evaluator.

It must use the existing authoritative Harvest transition distribution. Do not copy or recalculate weights in a separate Craft-specific formula.

## 6.4 Generic quotient alternative

If the kernel is not strictly memoryless because cleanup/finishing actions are permitted, add a target-conditioned quotient only after a transition-equivalence audit proves it safe.

Candidate state identity may preserve:

- fractures;
- target-match vector;
- prefix/suffix occupancy;
- rarity;
- exclusion groups that affect enabled follow-up actions;
- relevant flags.

It may collapse filler identities only when every enabled family action has the same aggregate transition distribution from the candidate states.

No target-specific or `Armour + Evasion` branch is allowed.

## 6.5 Let Bellman economics decide

The resolved Harvest family may be:

- cheaper;
- more expensive but fewer actions;
- faster but over a user cost ceiling;
- dominated;
- still unresolved for a quantified reason.

Phase 2V must not force the expected answer.

## 6.6 Preserve Harvest mechanics confidence

The existing Harvest model remains:

```text
APPROXIMATE / EXTERNALLY CLOSE
```

A more efficient exact solve over the modeled transition distribution does not upgrade the underlying game-mechanics fidelity.

## 6.7 Method-card explanation

Once resolved, the exact Armour + Evasion comparison should show:

```text
Open policy
Independent Conventional
Independent Harvest Reforge Defences
```

with cost, actions, time, required-action evidence, policy health, and a direct comparison.

If the Open and Conventional routes differ, add a compact action-set explanation such as:

```text
Open route also uses: Annulment
Conventional family forbids: Harvest, self-fracture, <other excluded actions>
```

Derive this from actual on-policy action IDs and family constraints, not prose assumptions.

---

# 7. Required Phase 2V Diagnostics and Browser Gates

## V1 — Phase 2U preservation

Run:

```text
npm run diagnostic:mature
npm run diagnostic:phase2t
npm run diagnostic:phase2u
npm run lab:no-fallback-probe
```

Acceptance:

- Phase 2E–2S mature matrix remains healthy;
- T1–T16 remain passing;
- U1–U17 remain passing or are deliberately superseded by stronger V gates;
- no solver/accounting/proof regression.

## V2 — No initial result scroll jump

Real Playwright desktop test:

1. start a real optimizer request while the form/search area is visible;
2. record `window.scrollY` before the result mounts;
3. wait for real `COMPLETE → RESULT` and the Constellation to mount;
4. wait through at least two Replay transitions;
5. assert the document did not jump to the Constellation.

Allow only a tiny browser rounding tolerance.

## V3 — Replay cannot reclaim document scroll

1. leave Replay running;
2. scroll to the form or Search Activity above the Constellation;
3. record `window.scrollY`;
4. wait for at least three active route-step changes;
5. assert `window.scrollY` remains stable;
6. verify Replay index and route-rail active chip continued changing.

## V4 — Route rail still follows horizontally

- use a route wider than the rail;
- record rail `scrollLeft`;
- wait until an off-screen active step becomes current;
- assert rail `scrollLeft` changes enough to expose it;
- assert `window.scrollY` does not change.

## V5 — Pause/resume and speed controls

At 0.5x, 1x, 2x, and 5x:

- pausing freezes replay progression;
- resuming continues it;
- neither operation changes document scroll;
- changing speed does not create a focus or scroll jump.

## V6 — Mobile scroll ownership

At 390px touch context:

- complete a search;
- scroll above the Constellation while Replay runs;
- wait through route transitions;
- assert vertical page position remains user-controlled;
- horizontal route-rail auto-follow remains internal;
- graph touch panning still suppresses page scroll only during direct graph interaction.

## V7 — One-mod clean-route graph semantics

Exact fixture:

```text
Large Cluster Jewel
10% increased Attack Damage
ilvl 84
12 passives
35% increased Effect (T1)
Any rarity
extras allowed
```

Acceptance:

- selected acquisition remains Clean Base;
- expected cost remains equivalent to 8.784c under the frozen prices;
- selected graph begins Clean Base;
- no selected `Fracture` step;
- no selected fracture-family node;
- no selected `fracturing_orb` edge;
- no duplicate Complete terminal;
- ordinary craft guide/accounting remains unchanged.

## V8 — Self-fracture graph chronology

Use the four-mod fixture.

Acceptance:

- graph begins from a clean physical acquisition context or another explicitly accurate pre-fracture start;
- one acquisition step creates the selected fractured target;
- it never says `Fractured Base → Fracture`;
- downstream sequence remains in policy chronology;
- exact selected player target is correct;
- no raw IDs leak publicly.

## V9 — Unique terminal concept

Across one-mod, two-mod, and four-mod plans:

- one visible terminal route chip;
- one terminal node;
- no `Complete Complete` rail text;
- replay loops or stops according to the existing behavior without duplicating the terminal.

## V10 — T1 Armour + T1 Evasion Harvest transition audit

Record the measured root cause and equivalence evidence described in Track C.

## V11 — Certified repeatable-reroll mathematics

For the resolved compact Harvest loop:

- aggregate success + miss probability = 1 within tolerance;
- expected applications equal `1/p`;
- expected cost/actions/time reconcile;
- required Harvest action has positive visits;
- selected policy is proper and absorbing;
- analytical result matches seeded Monte Carlo within a documented interval.

## V12 — Armour + Evasion browser comparison

Real browser:

- click Compare Methods Independently;
- Harvest must either resolve with a real required-action policy or return a newly quantified blocker that explains why the repeatable-reroll certification preconditions failed;
- no synthetic route;
- no forced winner;
- Open/Conventional/Harvest metrics and evidence agree with Worker/export data.

## V13 — Action-set difference explanation

When Open and Conventional costs differ:

- show actual on-policy actions unique to each resolved route;
- show constrained-family exclusions;
- do not claim a mechanic difference that is absent from the policy.

## V14 — Four-mod regression

Preserve, within numerical tolerance and current search nondeterminism rules:

- selected executable route behavior;
- acquisition/downstream/full-route accounting;
- provisional proof state;
- unresolved candidate evidence;
- Retry Deeper reuse;
- player labels;
- no raw-ID leakage.

## V15 — Performance

- simple one-mod search remains sub-second/near-current behavior;
- route-rail updates add no Worker messages;
- replay adds no document-layout thrash outside the rail;
- Harvest compact family resolution is materially faster/smaller than the current 5,000-state unresolved run;
- no new memory/session leak.

## V16 — Stable evidence

Commit real-browser screenshots/evidence for:

- one-mod clean graph;
- self-fracture chronological graph;
- user scrolled above a still-playing Constellation;
- horizontally followed route rail;
- Armour + Evasion comparison after independent methods.

## V17 — Build and release hygiene

Require locally:

```text
npm run build
npm run lint
git diff --check
npm run diagnostic:mature
npm run lab:no-fallback-probe
npm run lab:release
npm run diagnostic:phase2t
npm run diagnostic:phase2u
npm run diagnostic:phase2v
```

Hosted Pages validation remains lean and audits the newly committed Phase 2V evidence. Do not silently restore the heavyweight hosted matrix or schedule it.

Unit tests added/run: **NO**.

---

# 8. Completion Gates

Phase 2V closes only when:

- Phase 2U remains preserved;
- analysis completion never auto-scrolls the page to the Constellation;
- Replay cannot reclaim the document scroll position;
- route-rail horizontal follow still works;
- no timed `scrollIntoView()` remains in Constellation replay behavior;
- one-mod Clean Base graph contains no phantom fracture semantics;
- self-fracture graph chronology is physically sensible;
- duplicate terminal nodes/chips are removed;
- T1 Armour + T1 Evasion Harvest family resolves through generic certified mechanics or returns a strictly quantified failed-certification blocker;
- required Harvest action evidence is real;
- no Harvest winner is hardcoded;
- Open/Conventional route differences are explained from action evidence;
- four-mod solver, proof, accounting, and player-label behavior remain healthy;
- real Playwright desktop/mobile scroll gates pass;
- build/lint/diff/no-fallback/local release gates pass;
- no mechanics probability changed;
- no state identity weakened;
- no pre-fractured market ranking added;
- no unit tests added or run.

---

# 9. Required Completion Report

Create:

```text
docs/crafting-engine/PHASE2V_SCROLL_OWNERSHIP_CONSTELLATION_SEMANTICS_AND_HARVEST_CLOSURE_COMPLETION_REPORT.md
```

Include at minimum:

1. implementation commit(s);
2. files changed;
3. Phase 2U preservation matrix;
4. exact auto-scroll root cause;
5. route-rail local-scroll implementation;
6. proof that Replay no longer changes `window.scrollY`;
7. desktop/mobile/pause/resume/speed evidence;
8. explicit acquisition presentation contract;
9. clean-route graph before/after;
10. self-fracture chronology before/after;
11. terminal deduplication method;
12. one-mod exact-fixture regression;
13. Harvest state-explosion measurements;
14. repeatable-reroll or quotient equivalence proof;
15. Harvest exact success probability and expected applications;
16. Harvest cost/actions/time reconciliation;
17. seeded Monte Carlo comparison;
18. Armour + Evasion Open/Conventional/Harvest table;
19. on-policy action-set difference explanation;
20. four-mod preservation result;
21. stable browser screenshots and Worker differential evidence;
22. performance and memory comparison;
23. local release command results;
24. hosted lean evidence/deploy result;
25. release label/version;
26. unit tests added/run: expected NO;
27. mechanics probabilities changed: expected NO;
28. hardcoded route winner added: expected NO;
29. remaining known limitations.

---

# Final Phase 2V Principle

> **Animation may move inside its own viewport, but it must never take control of the user's document scroll. The Constellation must describe the route that was actually selected, and an eligible repeatable Harvest method should be resolved through generic mechanics rather than lost inside disposable filler-state permutations.**
