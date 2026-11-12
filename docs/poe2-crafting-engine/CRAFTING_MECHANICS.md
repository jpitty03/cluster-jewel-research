# Path of Exile 2 crafting mechanics and planner

Reviewed **2026-09-16**. Observed patch context: **0.5.5b**, from the [official Early Access patch index](https://www.pathofexile.com/forum/view-forum/2212) and [patch notes](https://www.pathofexile.com/forum/view-thread/4004106). Resolve league, platform, mode and subsequent changes for each request. This date is a research timestamp, not proof that every extracted mechanic is patch matched.

**Workflow: paste item -> resolve target -> collect its full modifier pool -> enumerate legal routes -> compare total cost and budget risk -> provide steps and recovery branches.**

This is a separate PoE2 research engine. It does not import PoE1 mechanics, modifier data, prices or saved league preferences. Start with [WORKFLOW.md](WORKFLOW.md) for an actual item. The [reference manifest](references/sources.json) records inspected sources and outstanding validation. The [runtime](../../poe2-crafting-engine/README.md) provides clipboard intake, repeat-attempt cost arithmetic, and exact finite-budget optimization over a supplied, validated transition graph. It does **not** yet generate a complete game graph from arbitrary clipboard text. Class-specific research is performed when an item is supplied and saved for reuse.

## 1. What “optimal” means

Default proposal: reproduce the same base and modifier tiers with any rolls, minimizing expected total acquisition and crafting cost. State this assumption; explicit user requirements override it. Improving an owned item is a different problem: initialize from that exact state and include the value of affixes at risk.

Keep these objectives distinct:

| Objective | Required comparison |
| --- | --- |
| Lowest expected cost | Total cost to reach the complete target, including every restart and finishing step |
| Best chance within budget | Adaptive policy maximizing completion probability before spending the budget |
| Preserve this item | Forbid transitions that violate marked properties, or report explicitly allowed loss risk |
| Minimum performance | Meet numerical thresholds, including quality/augment effects if allowed |
| Exact replica | Match requested identities, tiers, ranges and special properties; rare name is normally irrelevant |

Report **best supported route among evaluated candidates** unless the legal action space, transition distributions and optimization bounds establish a stronger claim. Unknown branches remain visible and unranked. A simulator agreeing with a model tests arithmetic, not the game's rules.

No universal budget, league or acquisition restrictions have been saved for PoE2. In particular, do not import Allflame or a 300-Divine limit from the PoE1 request. Buying bases, buying intermediates, self-crafting, and buying a finished item are separate alternatives; respect the user's restrictions.

## 2. Item and target resolution

Retain raw clipboard text and all unknown lines. Resolve each modifier against the base class, level, source and patch. A hybrid modifier can occupy one affix slot while displaying multiple lines. Conversely, displayed stats can combine contributions. Never count printed lines as affixes.

```text
ItemState
  game = poe2; rulesetId; league; mode; realm
  baseId; itemClass; itemLevel; rarity; identified
  baseTags; baseRequirements; grantedSkills; baseDefenceRolls
  quality { type, amount, scalingRule }
  explicits[] { id, groups[], side, level, tier, values[], source,
                fractured, desecrated, revealed, crafted }
  implicits[]; enchantments[]; allocatedPassive
  augmentSockets[] { augmentId, socketBound, effect, restrictions }
  corrupted; mirrored; sanctified; exceptional; specialProperties[]
  previewState; desecrationHistory; retainedInventory
```

Distinguish item level, character requirement, modifier level, displayed tier, and dropped-item tier. Resolve tier order from PoE2 data; never assume a displayed tier label means the same thing as PoE1 T1. For “same tier,” retain the actual modifier IDs and level/range rows. Overlapping ranges leave multiple candidates until resolved.

Ordinary equipment uses the familiar magic 1-prefix/1-suffix and rare 3-prefix/3-suffix model only after class validation. Jewels, flasks, charms, waystones, tablets, uniques and exceptional properties require their own capacities and predicates. Do not impose six-affix equipment rules on everything.

Targets contain allowed modifier IDs, exact-tier or threshold interpretation, permitted extra affixes, forbidden properties, base alternatives, and quality/augment requirements. Numeric improvements are not always desirable: requirements, costs and build-disabling effects need directional constraints. A rune bonus is not a substitute for a requested natural explicit unless the user accepts a performance target.

## 3. Evidence rules

Each executable action needs: input predicate, consumption, ordered mutation stages, complete outcomes/probabilities, output restrictions, availability, source patch, evidence IDs and regression fixtures. Evidence kinds are `game_text`, `official_patch`, `datamined`, `experiment`, `inferred`, or `unknown`.

PoE2DB's extracted item/help text is useful evidence; its community articles, old snippets and market tables are different evidence. The same page can contain contradictory generations of text. Prefer current extracted records, preserve the conflict, and validate the action before execution. A drop-level record does not prove current league availability. A listing does not prove sale value.

Unknown weights are not equal weights. Missing prices are not zero. Failed scraping is not an empty pool. Do not label an impossible action as merely expensive, or missing evidence as target impossibility.

## 4. Crafting families

### 4.1 Rarity, adding and replacing modifiers

The inspected [currency text](https://poe2db.tw/us/Currency) establishes these basic effects:

| Currency | PoE2 effect |
| --- | --- |
| Transmutation | Normal to magic with one modifier |
| Augmentation | Adds a modifier to magic |
| Regal | Magic to rare, adding one modifier |
| Alchemy | Normal **or magic** to rare with four random modifiers |
| Exalted | Adds a modifier to rare |
| Chaos | Removes one modifier, then adds a random modifier |
| Annulment | Removes a modifier |
| Divine | Rerolls modifier values |
| Chance | Normal to unique, or destroys the item |
| Fracturing | Locks a random modifier on a rare with at least four modifiers |

Do not offer PoE1 Alteration/Scouring loops, a PoE1 Chaos full reroll, Harvest, fossils, bench metamods, Eldritch currency, beasts, or recombinators without separate current PoE2 evidence. These are not inherited actions.

**Planning consequences:** Chaos's addition pool is evaluated after removal, including newly opened slots and groups. An Erasure Omen constrains removal; it does not automatically constrain the replacement side. Alchemy's text alone does not establish retention of magic affixes: validate that transition before treating a magic anchor as protected. A failed normal-base attempt may require another base rather than a cheap reset.

### 4.2 Greater and Perfect currencies

The inspected currency levels are:

| Family | Greater minimum modifier level | Perfect minimum modifier level |
| --- | ---: | ---: |
| Transmutation / Augmentation | 44 | 70 |
| Regal / Exalted / Chaos | 35 | 50 |

[Currency records](https://poe2db.tw/us/Currency). These thresholds are **not** a guarantee of the top tier. [Minimum Modifier Level help](https://poe2db.tw/us/Minimum_Modifier_Level) includes an exception when a modifier type would otherwise disappear entirely, and disallows use below the currency's required item level.

Resolve what “type” means in the underlying generation data before implementing that exception. A naive `mod.level >= floor` filter can produce false guarantees. Keep that kernel unvalidated until the type mapping and retained fallback tiers are established. Compare ordinary/Greater/Perfect prices against the actual change in target probability.

### 4.3 Essences

Current [essence records](https://poe2db.tw/us/Essence) distinguish Lesser/ordinary/Greater magic-to-rare upgrades adding a guaranteed modifier from Perfect and corrupted essence remove/add operations on rare items. Guaranteed results depend on essence and class. Perfect is not simply the strongest version of the same ordinary stat.

Resolve the exact guaranteed modifier ID, side, range, class restrictions and group interactions. “Guaranteed modifier” does not mean the whole craft is guaranteed: removal can destroy an anchor and full sides can affect legality. Crystallisation Omens restrict removal side; verify the complete post-removal insertion and collision rules. Do not translate PoE1 Deafening essence tiers or launch-era PoE2 essence rules into this pool.

Enumerate magic-anchor -> essence -> finish, and rare-anchor -> Perfect/corrupted essence -> repair/finish. Price failed anchors, rebuilding and Omens, not just the essence stack.

### 4.4 Omens

The [Omen catalogue](https://poe2db.tw/us/Omen) supplies these triggers; each is consumed in conjunction with its triggering operation, not a permanent item metamod:

| Family | Constraint/effect |
| --- | --- |
| Sinistral / Dextral Exaltation | Prefix / suffix addition |
| Sinistral / Dextral Coronation | Regal addition side |
| Sinistral / Dextral Annulment | Removal side |
| Sinistral / Dextral Erasure | Chaos removal side |
| Sinistral / Dextral Alchemy | Maximize corresponding side's count |
| Greater Exaltation / Annulment | Two additions / removals |
| Whittling | Remove lowest modifier level with Chaos |
| Homogenising | Added type matches an existing modifier type |
| Crystallisation | Perfect/corrupted essence removal side |
| Catalysing Exaltation | Consume catalyst quality for type bias |
| Blessed | Divine acts on implicits |
| Chance / Ancients | Change Chance destruction / unique selection |

Validate simultaneous activation, conflicts, consumption and stage order for each combination. Whittling uses modifier level, not the smallest displayed number or a generic tier rank; ties require a distribution. A side restriction becomes deterministic only if exactly one eligible outcome remains. Unknown type-selection weights must remain unknown.

### 4.5 Desecration and reveal decisions

[Desecration help and bone records](https://poe2db.tw/us/Desecrated_Modifiers): add an unrevealed modifier; a full item also loses a random modifier. Reveal at the Well of Souls. An item already carrying a desecrated modifier cannot ordinarily be desecrated again. Bone eligibility depends on class, with level restrictions on some grades.

Model application, offered reveal choices, selection and reroll as separate states. Capture the entire offered set distribution, not merely the chance of one generated modifier. An Omen of Light targets desecrated removal; validate repeat eligibility after removal. Echoes permits a reveal reroll; named Omens select particular families. Putrefaction replaces the item’s modifiers with unrevealed ones and corrupts it. Unstable Desecration needs an attempt counter and destruction risk; Mark of the Abyssal Lord has a special replacement rule.

Do not use `1 - (1-p)^k` for reveal offers unless independent sampling with replacement has been demonstrated. Group exclusion and sampling without replacement can change it. Preserve special and ordinary reveal pools separately. A bad reveal is not automatically a free restart.

### 4.6 Fractures, previews and terminal operations

Fracture planning includes anchor acquisition, filler setup, the fracture attempt, unwanted-fracture handling, and rebuilding. Four affixes alone do not prove a 25% target chance: establish eligible records and selection distribution. Store protection per modifier and action, including whether values can change.

The [currency catalogue](https://poe2db.tw/us/Currency) includes Hinekora's Lock: preview is invalidated by modification. Validate preview support and Omen interaction for the exact action. No generic rollback or free preview reroll is assumed.

[Sanctification help](https://poe2db.tw/us/Sanctified_Items) describes independent per-modifier scaling in the 78–122% range and restrictions on subsequent changes. The distribution and rounding still require validation; “random” does not prove uniform. Resolve original tier separately from the scaled displayed value. Vaal, Sanctification and other terminal branches require an explicit target allowing their output restrictions.

### 4.7 Quality and socketed augments

Use the applicable quality currency and class-specific scaling rule; record whether quality modifies the displayed target. [Catalyst records](https://poe2db.tw/us/Catalysts) are a separate jewellery-quality data source. Do not infer a crafting-weight bonus from stat quality; Catalysing Exaltation is its own action with consumption and an unresolved bias kernel.

[Augment help](https://poe2db.tw/us/Augment) distinguishes replacement from extraction. Ordinary augments can be replaced; socket-bound augments cannot. Orb of Extraction destroys equipment to recover eligible augments. Exceptional items can have extra sockets or quality. Preserve base capacity, special sockets, augment restrictions, granted effects and global limits.

Equipment augment sockets and Skill Gem support sockets are separate systems. Include finishing costs when part of the target. Compare doing finish work late against any validated benefit of doing it earlier; do not automatically repeat expensive augments on disposable bases.

### 4.8 Recipes, liquids and specialised systems

[Reforging recipes](https://poe2db.tw/us/Reforging_Bench) include currency upgrades and specified item recipes. Record exact inputs, output level/base/rarity inheritance, and which properties survive. Reforging is not a universal Scouring substitute or a proven donor-mod recombination action.

Current extracted [liquid item text](https://poe2db.tw/us/Rarity) includes remove/add guaranteed crafted modifiers on rare basic jewels. This needs a jewel-specific model and must not be confused with equipment affixes or a remembered historical anoint recipe. Resolve allocations/anoint-like properties from their current recipes if present on the requested item.

Expedition, recombination, temple/league devices, unique transformations, special base properties, Runeshaping and other systems belong in the candidate audit whenever relevant. Their mere presence in a database or an old guide does not establish an executable current route. Capture exact interface choices, costs, displayed odds and outputs for the relevant ruleset. Unsupported families remain in the report with the evidence needed to rank them.

## 5. Pool construction and probabilities

For each requested class, save a versioned catalogue containing **all** applicable ordinary and special records, including unwanted modifiers. Each record needs ID, groups, side, required level, ranges/stat IDs, ordered spawn-weight tags, generation weights/tags, source and availability. Preserve original tier labels. Keep missing weights as null.

For a validated weighted-add kernel, calculate effective weights only after applying class/domain, base tags, item level, action floor and exceptions, occupied groups, affix capacity and active effects. Then:

```text
P(target | state, action) = sum(eligible target weights) / sum(all eligible weights)
```

This equation assumes selection over that weighted pool; validate whether the game first selects side or type. Do not force a 50/50 prefix/suffix split. For multiple additions, enumerate sequentially and rebuild the pool after each draw. For removal, use the removal kernel, not spawn weights. For Chaos and essence, sum over each removal outcome before evaluating insertion.

Pool completeness includes ordinary tiers, essence-exclusive IDs, desecrated alternatives, fractured restrictions, base-specific records and any relevant league pool. A new class is an instruction to extend the references, not to approximate from a wand or PoE1 pool.

## 6. Cost and policy comparison

Price records need game, league, realm, timestamp, currency unit, rate direction, source, volume/depth and quantity. Include bases, all currencies and Omens, failed attempts, setup, repair, finishing, exchange gold and any non-tradable resources. Show gold/time separately unless the user supplies a conversion. Owned consumables have opportunity cost; show incremental cash cost separately when useful.

Only grant salvage credit for an allowed and supported recovery/sale. Present gross spend as well as net cost; unsold inventory cannot fund an immediate next attempt. Buying a finished item is a benchmark when allowed, not proof that a particular listing is available at unlimited volume.

For independent identical attempts that restore the exact starting state after failure:

```text
E(total) = setup + (attemptCost + (1-p) * recoveryCost) / p + finish
P(success within n attempts) = 1 - (1-p)^n
cost of success on attempt n = setup + n*attemptCost + (n-1)*recoveryCost + finish
```

Here setup is paid once. If a base is lost each time, its replacement belongs in attempt/recovery cost. Returning to a worse state, keeping valuable partials, price changes, or accumulating desecration risk breaks the identical-attempt model. Use a state graph instead.

For a complete stochastic shortest-path model, the expected-cost target is `V(s) = min_a [cost(s,a) + sum P(s'|s,a)V(s')]`, with target states at zero and unsuccessful closed components at infinity. The current runtime does not solve this general unbounded problem. Its finite-budget dynamic program optimizes success probability over the supplied graph, allowing repair, restart and purchase alternatives when encoded. Graph costs use a declared discrete unit; report rounding if real prices were discretized.

Never infer a budget guarantee from expected cost. Report completion probability within budget, risk to protected affixes, and an explicit stopping rule. Save the winning policy with state-dependent branches, not just the luckiest sequence of clicks.

## 7. Required recommendation

Return the interpreted target and confidence, base/level prerequisites, cheapest supported route, cost assumptions/date, budget success probability where calculable, and alternatives. Each step names the precise currency grade and active Omens, required slots, success test, and failure/recovery action. Include irreversible steps and finishing costs in the same route.

End with a coverage statement: what was evaluated, what is unranked, and what prevents a global optimum claim. If no fully supported route exists, give useful legal partial steps and the precise data gap; do not fabricate odds to fill the table.

## 8. Validation and expansion

Before ranking a new class: resolve an advanced-description clipboard fixture; verify slot/group legality; reproduce a known transition; ensure outcome probabilities sum to one; compare conditional pools with independent game or simulator evidence; test failure and repeat branches; and reconcile all resource costs. A simulator must explicitly support the current PoE2 patch.

Current coverage: researched action catalogue, request template, source manifest, conservative clipboard intake, identical-attempt cost evaluation, finite-budget graph optimizer, and synthetic mathematical regression tests. The [Morbid Siege bow request](references/requests/morbid-siege/routes.md) adds the first class snapshot: 412 displayed bow records and 188 linked details, with all six tooltip modifiers matched by ranges/groups/levels. Page-weight provenance and desecration offer probabilities remain unresolved; no live price feed or game-validated action kernel is bundled yet. This research workflow is usable now; fully automatic arbitrary-item optimization remains unimplemented.
