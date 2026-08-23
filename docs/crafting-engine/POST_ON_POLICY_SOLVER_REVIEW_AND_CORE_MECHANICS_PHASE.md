# Post On-Policy Solver Review & Core Mechanics Phase

## Scope

Reviewed implementation commit:

`8631353d62f25c23a78e04d872df4cce7e34d30b`

This review follows:

`docs/crafting-engine/HARVEST_PARITY_REPRIORITIZATION_AND_NEXT_STEPS.md`

The implementation made an important architectural improvement: the solver now distinguishes the large **candidate graph** from the much smaller **selected-policy reachable graph**. For the simple clean-base T1 Intelligence target, the selected policy is fully resolved inside the normal/magic state space, the occupancy calculation converges, and expected action-cost reconciliation agrees with the Bellman value to approximately `0.0003c`.

This is enough to move toward the next core-mechanics phase, but there are several correctness/reporting issues that must be fixed first or alongside the first mechanic migration.

---

# 1. Current status

## Clean-base T1 Intelligence selected policy

Current diagnostic reports:

- candidate graph expanded states: `5,000`
- candidate graph state cap hit: `YES`
- queued/unexpanded candidate states: `41,505`
- on-policy reachable states: `1,360`
- on-policy unresolved transitions: `0`
- on-policy unresolved probability: `0.0000%`
- terminal absorption: `100%`
- selected policy: `PROPER & ABSORBING`
- Bellman iterations: `331`
- final Bellman residual: `9.8646e-6`
- occupancy iterations: `891`
- occupancy residual: `9.9170e-9`
- expected action-cost sum: `6.050c`
- Bellman downstream EV: `6.050c`
- reconciliation delta: `0.0003c`

Expected usage:

- Transmutation: `1.00`
- Alteration: `51.17`
- Augmentation: `13.04`
- Regal: `0.00`
- Annul: `0.00`

This is strong evidence that the **currently selected normal/magic policy is internally coherent**.

## Regression fixtures

Craft A remains multi-seed stable:

- analytical total: `7623.7c`
- pooled MC mean: `7568.1c`
- aggregate difference: about `-0.73%`
- zero timeouts
- zero missing policy states

Craft C remains multi-seed stable:

- analytical total: `42814.4c`
- pooled MC mean: `42483.5c`
- aggregate difference: about `-0.77%`
- `1` timeout across `10,000` requested trials
- zero missing policy states

Preserve these as regression fixtures.

---

# 2. Important correction: on-policy completeness does NOT yet prove global action optimality

The new on-policy graph separation is correct and useful.

However, the current implementation still computes unresolved candidate branches using:

`UNRESOLVED_BRANCH_PENALTY = 150000`

and uses those penalized values while choosing the minimum Q-value.

That means:

- the selected policy can be fully resolved and proper;
- its expected cost can reconcile perfectly;
- **yet an unresolved competing action may still theoretically be cheaper**.

The current output illustrates this with Regal. The full candidate graph contains tens of thousands of rare-state successors from Regal, many of which are not expanded, while representative Q-value reporting can still show a Regal candidate as `COMPLETE` at the immediate state and assign a continuation EV near the unresolved penalty.

A candidate is not truly `COMPLETE` merely because all of its **direct** successor keys happen to exist in the current graph. Its downstream value also depends on whether those successor values are themselves based on fully resolved continuation graphs.

## Required change

Separate these concepts:

### Selected-policy validity

The current selected policy may be reported as:

`SELECTED POLICY: FULLY RESOLVED / PROPER / COST-RECONCILED`

when its reachable graph has zero unresolved transitions and is absorbing.

### Optimality proof

Only claim:

`OPTIMAL OVER CURRENT ACTION SET: PROVEN`

when every competing action capable of beating the incumbent has a trustworthy value or a mathematically valid bound proving it cannot win.

Until then report:

`BEST FULLY RESOLVED POLICY FOUND`

and retain:

`GLOBAL OPTIMALITY: NOT YET PROVEN`

Do not use the finite unresolved penalty itself as proof that a competing action is worse.

---

# 3. Make candidate resolution recursive / value-aware

The current candidate status is based primarily on whether the candidate has direct transitions whose target keys are absent from `V`.

That is too shallow.

Example:

- State S has a Regal action.
- Every direct Regal successor exists among the first 5,000 nodes.
- Those rare successor states themselves have unresolved continuation branches.
- Regal may still be labeled `COMPLETE` at S even though its Q-value depends on unresolved descendant values.

## Required behavior

Candidate status should describe the trustworthiness of the complete continuation value.

Suggested statuses:

- `RESOLVED` — all probability mass relevant to its continuation value is supported by a resolved/proper downstream policy/value.
- `UNRESOLVED` — some continuation value depends on truncated or unknown descendants.
- `IMPROPER` — known selected continuation cannot reach a terminal state with probability 1.
- optionally `DOMINATED_BY_BOUND` — unresolved internally, but a valid lower bound already proves it cannot beat the incumbent.

Equivalent naming is fine.

Do not call an action resolved merely because its immediate successor nodes have been inserted into the graph.

---

# 4. Stop unresolved penalties from participating in optimality claims

A finite placeholder can remain as an implementation aid for diagnostics, but it must not silently turn into an optimality certificate.

Recommended direction:

1. Find a feasible fully resolved incumbent policy and its cost `U`.
2. For unresolved candidate actions, maintain a lower bound `L` on their possible Q-value.
3. If `L >= U`, the candidate may be safely pruned/dominated.
4. If `L < U`, expand that candidate until:
   - it becomes resolved;
   - its valid lower bound rises above the incumbent;
   - or a resource cap is reached.
5. If the cap is reached while an unresolved candidate could still beat the incumbent, report:
   `BEST KNOWN FULLY RESOLVED POLICY — OPTIMALITY NOT PROVEN`.

A simpler first implementation is acceptable: never select an unresolved action as proven optimal and never claim the incumbent is globally optimal while unresolved competitors remain potentially competitive.

Do not blindly increase the global state cap.

---

# 5. Fix action-attribution metric semantics

Current attribution reports approximately:

- Transmutation: `1359` unique successors generated
- Augmentation: `0`
- Alteration: `0`
- Regal: `45074`
- Annul: `71`

The zero values for Augmentation/Alteration are misleading because those actions absolutely generate successor states. They appear as zero because the metric currently credits a successor primarily to the action that **first inserted its canonical key into the global queue**.

Rename or improve the metric.

Prefer reporting both:

- `unique successor keys produced by this action` — action-local uniqueness, regardless of whether another action already discovered the same key;
- `new global states first discovered by this action` — queue ownership;
- `on-policy states selecting this action`;
- `unresolved outgoing edges from this action`.

This will make future state-explosion analysis much more informative.

---

# 6. Fix the likely TypeScript field-name mismatch and require a real build

In the current `genericSearch.ts`, `ActionStateAttribution` declares:

`offPolicyOnlyStates`

while the initialization shown in the implementation uses:

`offPolicyStatesGenerated`

Verify and correct this mismatch.

The root project build script is:

`npm run build` -> `tsc -b && vite build`

The demo may run through `tsx` without providing a full TypeScript build check.

## Requirement for this and future phases

Run:

`npm run build`

and report its result.

This is **not unit-test work** and does not violate the no-unit-tests constraint.

Do not add new unit tests.

---

# 7. External parity harness still contains hardcoded engine-side expectations

The external Craft of Exile fixture data is useful and should remain.

However, `externalParity.ts` still contains engine-side constants such as values equivalent to:

- compound Harvest analytical probability `0.00146`;
- compound Harvest MC `0.144%`;
- post-Harvest Annul analytical `0.2200`;
- post-Harvest Annul MC `22.04%`;
- final Exalt MC `0.0381`;
- Fracturing analytical/MC inserted as `25%` rather than executed through a shared Fracturing mechanic.

Therefore the current parity table is **not yet a fully independent engine-derived parity suite** for those rows.

Alteration is much better: it derives analytical transitions and samples the shared mechanic.

## Required direction

Do not block the next mechanics phase on perfect Harvest parity, but clean this up incrementally:

- external observations may remain constants because they are source data;
- engine analytical values must come from the actual shared mechanic/state-distribution implementation;
- engine MC values must be sampled from the same shared mechanic using seeded RNG;
- if a shared mechanic does not exist yet, label that row `REFERENCE EXPECTATION` rather than implying an executable engine parity check.

As Exalt and Fracturing are migrated into the shared registry in this next phase, convert those parity rows from reference constants to actual analytical + seeded-MC executions.

Keep Harvest:

`CLOSE / APPROXIMATE — ENGINE CURRENTLY ~19% OPTIMISTIC ON COMPOUND EVENT`

This is tracked fidelity work, not a blocker to core architecture.

---

# 8. Craft of Exile evidence status

Permanent/current observations:

### Alteration -> T1 Intelligence

Large dedicated benchmark:

- attempts: `209,862`
- successes: `3,193`
- observed: `1.5215%`
- about `1 / 65.7`

Current engine analytical:

- `1.4377%`
- about `1 / 69.6`

Assessment: `ALIGNED`

### Fracturing Orb

Dedicated benchmark:

- `250 / 1,000`
- `25.000%`

Assessment: `ALIGNED` for the tested 4-mod scenario.

### Compound Harvest Defence

- attempts: `2,601,014`
- successes: `3,187`
- observed: `0.122529%`
- about `1 / 816.1`

Current approximate engine expectation:

- about `0.1460%`
- about `1 / 684.9`

Assessment:

`CLOSE / APPROXIMATE — ENGINE ~19% OPTIMISTIC`

Do not hardcode the external rate into mechanics.

### Post-Harvest Annul

- `863 / 4,019`
- `21.473%`
- about `1 / 4.657`

Current reference expectation around `22%`.

Assessment: encouraging/aligned, but convert the engine side to a real propagated-state calculation when practical.

### Final Exalt

- `31 / 863`
- `3.5921%`
- about `1 / 27.84`

Pool-derived expectation:

- `550 / 14,450`
- `3.8062%`
- about `1 / 26.27`

Assessment: `ALIGNED`.

The long-running simulation has provided enough evidence for this stage. No additional run of this exact recipe is required now.

---

# 9. Readiness decision

The implementation has crossed an important threshold.

The selected clean-base policy itself is now:

- fully resolved on-policy;
- absorbing;
- numerically converged;
- expected-cost reconciled;
- externally plausible for Alteration behavior.

Therefore it is reasonable to begin the next mechanics phase **after fixing the small build/type issue and correcting optimality/reporting semantics**.

Do not wait for Harvest to exactly match Craft of Exile.

The next mechanics sequence should be:

1. Scour/reset
2. restart/reacquire
3. shared Exalt
4. generic Fracturing Orb
5. full generic clean-base multi-mod discovery fixture
6. Craft B
7. developer UI Phase 1

Implement one mechanic at a time and rerun diagnostics/regressions after each addition.

---

# 10. Phase A — Orb of Scouring shared mechanic

Implement Scour as a shared `CraftMechanic` with:

- explicit legality rules;
- real price provenance;
- analytical transition(s);
- seeded sample transition;
- correct handling of fractured modifiers;
- correct resulting rarity/state after non-fractured explicit modifiers are removed.

Do not guess rarity behavior around fractured modifiers if uncertain. Verify the intended game behavior from existing project data or an authoritative/reproducible source and label any remaining assumption.

Add a runtime diagnostic that prints before/after states for:

- ordinary magic item;
- ordinary rare item;
- item containing a fractured mod plus removable mods.

Then allow Scour into generic Bellman search.

Measure:

- new candidate graph size;
- selected-policy graph size;
- whether Scour is selected anywhere;
- whether it introduces cycles;
- Bellman convergence;
- policy properness;
- occupancy convergence;
- cost reconciliation.

---

# 11. Phase B — restart / reacquire semantics

Restart must be modeled as a real economic transition, not an invisible reset.

A restart action needs to know the strategy's restart destination and reacquisition cost.

Examples may include:

- restart from clean normal base;
- reacquire the chosen fractured starting state;
- restart a self-fracture preparation attempt.

Do not bake Craft A/C recipes into restart logic.

Prefer a solver context / resolved starting-candidate concept that provides:

- restart state;
- restart acquisition cost;
- acquisition confidence/provenance.

Then Bellman may compare:

`continue current item`

versus

`abandon + reacquire/restart`.

This is critical for arbitrary 1–4-mod optimization.

Add diagnostics showing states where restart wins and where continuing wins.

---

# 12. Phase C — migrate Exalted Orb into shared mechanics

Exalt is a good next shared-transition migration because we now have external evidence for the final suffix case.

Implement shared Exalt with:

- rare-item legality;
- open-affix capacity checks;
- prefix/suffix eligibility;
- complete mod-group exclusion rules;
- weighted eligible pool;
- analytical transitions;
- seeded sampling from the same mechanic;
- current price provenance.

Then replace the external parity Exalt row's hardcoded engine-MC value with an actual sampled shared Exalt result.

For the external fixture state corresponding to fractured T1 Int + T1 ES + 35% Effect with an open suffix, compare:

- external: `31 / 863 = 3.5921%`;
- shared analytical engine;
- seeded shared-mechanic MC.

Do not tune weights to the external result.

After the shared Exalt mechanic is proven, migrate existing specialized paths carefully rather than replacing all mature Craft A/C Exalt logic in one step.

---

# 13. Phase D — generic Fracturing Orb

Implement Fracturing as a shared mechanic only after the rare-state/reset/restart model is stable.

Requirements:

- validate exact legality conditions;
- enumerate eligible explicit modifiers correctly;
- choose one uniformly if that is the verified mechanic;
- preserve all item mods while marking the selected modifier fractured;
- analytical transition distribution;
- seeded sampling;
- price provenance.

Use the existing external 4-mod benchmark:

- `250 / 1,000 = 25%`

as an independent check for the tested setup.

Replace the parity table's manually inserted 25% engine result with execution of the shared Fracturing mechanic.

Then model failure/restart paths through Bellman rather than recipe-specific code.

---

# 14. After the four mechanics: prove a full generic multi-stage route

Before starting serious UI work, prove one route that begins from a clean base and requires multiple stages.

A useful milestone is that the generic solver can discover, without a hardcoded recipe, a policy family containing the kinds of transitions needed for:

`normal -> magic -> rare -> fracture -> scour/reset -> continue -> finish`

The exact optimal route may differ from Craft of Exile. That is expected.

Report:

- target definition only;
- generated candidate starts;
- selected acquisition;
- branching policy rules;
- expected currencies;
- total expected cost;
- alternative starting strategies;
- unresolved competitors;
- proof level (`best resolved` vs `optimal over modeled actions`).

Then bring Craft B back as the next regression/discovery fixture.

Do not make a Craft-B-specific algorithm.

---

# 15. UI Phase 1 readiness gate

Developer UI Phase 1 can begin once the following are true:

- [ ] `npm run build` passes;
- [ ] selected-policy diagnostics remain proper/reconciled;
- [ ] unresolved competitor reporting cannot falsely claim optimality;
- [ ] Scour is shared and searchable;
- [ ] restart/reacquire is searchable;
- [ ] Exalt is shared/searchable;
- [ ] Fracturing is shared/searchable;
- [ ] one clean-base multi-mod craft is discovered end-to-end without a hardcoded recipe;
- [ ] Craft A remains healthy;
- [ ] Craft C remains healthy;
- [ ] price-confidence warnings survive into the result object;
- [ ] `GLOBAL OPTIMALITY: NOT YET PROVEN` remains unless the modeled frontier is actually complete.

At that point, start a thin developer UI.

The UI should only construct a target and render a result. It must not contain crafting strategy logic.

---

# 16. Regression requirements after every mechanic

## Craft A

Preserve approximately:

- strong multi-seed total-cost agreement;
- zero missing states;
- zero fallbacks;
- no unexpected timeout regression.

## Craft C

Preserve:

- strong pooled total-cost agreement;
- pooled primary-action differences within the existing validation bands;
- completion >= 99%;
- zero missing states;
- zero fallbacks;
- censoring explicit.

If a verified mechanics correction changes the expected costs, allow the values to change and explain why.

Do not tune them back to old output values.

---

# 17. Constraints

Do not:

- add unit tests;
- reintroduce Allflame;
- build polished frontend UI yet;
- hardcode Craft of Exile probabilities;
- create Craft-specific solver branches;
- create separate 1/2/3/4-mod algorithms;
- call a truncated unresolved competitor `dominated` merely because a finite placeholder made its Q-value large;
- claim global optimality until supported.

Continue using:

- runtime mechanics diagnostics;
- seeded sampling;
- Bellman Q-value audits;
- on-policy reachability;
- cost reconciliation;
- external parity;
- Craft A/C end-to-end regressions.

---

# 18. Recommended implementation order

1. Fix `ActionStateAttribution` field-name/type mismatch.
2. Run and pass `npm run build`.
3. Correct optimality language: selected-policy validity vs unresolved competitor optimality.
4. Make candidate resolution recursively/value-aware or introduce valid unresolved-action bounds.
5. Improve action-attribution semantics.
6. Keep external parity observations, but stop presenting hardcoded engine values as executed parity where no shared mechanic exists.
7. Implement shared Scour.
8. Rerun generic search + A/C.
9. Implement restart/reacquire semantics.
10. Rerun generic search + A/C.
11. Implement shared Exalt and convert Exalt parity row to actual shared-mechanic analytical + MC.
12. Rerun A/C.
13. Implement shared Fracturing and convert Fracturing parity row to actual shared-mechanic analytical + MC.
14. Build a full clean-base multi-stage generic discovery diagnostic.
15. Bring Craft B back.
16. If gates pass, begin developer UI Phase 1.

---

# 19. Completion report required

When complete, commit implementation and regenerated outputs to `main` and report:

- commit SHA;
- files changed;
- `npm run build` result;
- field-name/type fix result;
- selected-policy proof status;
- unresolved competitor handling approach;
- whether any unresolved candidate could still theoretically beat the incumbent;
- updated candidate/action attribution metrics;
- Bellman convergence;
- on-policy reachable states;
- on-policy unresolved probability;
- terminal absorption;
- occupancy convergence;
- EV reconciliation delta;
- Scour implementation/result;
- restart/reacquire implementation/result;
- shared Exalt implementation/parity result;
- shared Fracturing implementation/parity result;
- current Harvest parity label;
- Craft A regression;
- Craft C regression;
- full generic multi-stage route diagnostic status;
- whether the backend is ready for developer UI Phase 1.

---

# Bottom line

The on-policy solver is now in substantially better shape and the core selected policy is internally coherent. The project is ready to move into **Scour -> restart -> shared Exalt -> Fracturing**, but first fix the small build/type issue and stop using unresolved penalized competitors as evidence of global optimality.

Harvest remains a known approximation in the right neighborhood and should not block this progression.