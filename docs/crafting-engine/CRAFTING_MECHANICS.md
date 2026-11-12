# Path of Exile 1 crafting mechanics and planner specification

Reviewed: **2026-09-05**. Reference context: **PoE 1, 3.29.3b**, ordinary non-Ruthless rules unless stated otherwise. League access, Standard legacy items, platform and later hotfixes must be resolved separately. The [GGG patch index](https://www.pathofexile.com/forum/view-forum/patch-notes) and [3.29.3b notes](https://www.pathofexile.com/forum/view-thread/4001117) establish the review context; they do not certify every probability.

This catalogue arranges crafting families from least to most complex, then specifies a data-backed planner. Equipment is the main scope, with separate handling for jewels, flasks, gems, maps and historical systems. Individual recipes, tiers, prices and probability tables belong in versioned JSON under `references/`. A catalogue entry does **not** mean that the repository implements or validates it.

Intended workflow: **paste item -> resolve modifiers and target requirements -> enumerate legal crafts -> calculate and compare policies -> explain steps, risks and recovery**. The LLM should explain engine results rather than invent weights or declare a globally optimal craft from prose alone.

Implementation status, **2026-09-21**: the [Torment Spire request](references/requests/torment-spire.json) has a resolved six-natural-T1 target, a replayable PoEDB wand catalogue, a patch-matched RePoE Kinetic Wand pool, saved Craft of Exile magic/Allflame models, dated Allflame exchange prices, and an archived recombination guide. The [Miracle Stinger request](references/requests/miracle-stinger.json) adds the first reusable class expansion: generic PoEDB, RePoE, and economy collectors; a complete 1,146-record Bow catalogue; an ilvl 85 Thicket Bow pool; official-trade fracture evidence; and a [costed route with recovery branches](references/requests/miracle-stinger-routes.md). Its best supported self-craft is conditionally 7.07–7.73 Divine after valuing recombination dust, so it does not beat the observed 5-Divine listing. The reusable recombination policy charges every attempt 30 Chaos for 180,000 dust and tracks 10,000 Gold separately. The planner still needs independent 3.29 recombination/Brinehook validation before it can claim a global optimum.

Raw inputs now follow a [retention policy](references/RAW_RETENTION.md), share class-independent source dumps, and pass an orphan/duplicate audit.

The next deliverables needed for a reliable pasted-item recommendation are:

| Deliverable | Acceptance condition for this wand |
| --- | --- |
| Clipboard resolver | Resolve six natural T1 records despite the fire enchant's magnitude scaling; preserve ambiguity instead of confusing crafted/essence tiers. The current target JSON was resolved manually. |
| Executable wand rules | Filter by Kinetic base, item level, every modifier group, slots, fractures and the chosen action. Validate action-specific weight and affix-count rules against independent fixtures. |
| Current recombination and Allflame models | Separate selected and random recombination; capture full inputs, displayed odds where applicable, resource costs, failure outputs and recycling. The current conditional Brinehook model and 9,760-Sulphur Kinetic cost need in-game reproduction and an identity-aware recycling policy. |
| Self-crafting and finishing costs | For this request, generate every donor, fracture and intermediate from uncrafted bases. The isolated-donor and enchant baselines are priced; add recombination attempts, gold/dust and retained inventory. No donor listings are required. |
| Policy comparison | Account for failed attempts and retained inventory; compare complete routes under 300 divines and report budget risk. Unknown branches stay unranked. |
| End-to-end entry point | Pasted item plus saved preferences produces a target, coverage report, ranked supported policies and concrete recovery steps. Broaden beyond wands only after this works. |

The user's [saved preferences](references/requests/crafting-preferences.json) record league, acquisition, tier, fracture, socket and cost defaults. Apply them without asking again; individual requests may override them. Normalize each pasted item through the [crafting request schema](references/schemas/crafting-request.schema.json), then add a complete class snapshot when the requested base class is not already covered. This request contract is the reusable entry point for boots, body armour and other equipment; the executable action coverage may still be narrower and must remain explicit.

## 1. Review findings

The original document contained consequential mistakes. The sections below supersede it.

| Original claim | Correction / implication |
| --- | --- |
| Eater dominance crafts prefixes | Exarch targets prefixes; Eater targets suffixes. |
| Four Scraps on a normal endgame base give 20% quality | The old rarity formula is obsolete for these items; use item-level quality rules. |
| White sockets require special endgame crafting | Socket rules changed in 3.29; the old off-colour recipe loop is historical. |
| Wild Bristle Matron removes a prefix and adds a suffix | It adds a crafted metamod. Full **suffixes**, a free prefix and legal craft capacity can force Suffixes Cannot Be Changed. |
| Harvest augment removes a non-target-tag mod | Modern add/remove can remove an old mod of the same tag. |
| Veiled Orb is the current name | Since 3.26 it is Veiled Exalted Orb; Veiled Chaos also exists again. |
| Locking prefixes forces a veiled suffix | Protecting existing prefixes does not prevent adding a prefix in a free slot. |
| An imprint can undo a fracture | Do not offer ordinary imprint recovery for a fractured result. |
| Every fractured item has exactly one fracture | Store fracture state per modifier; exceptional/historical items can have several. |
| Deafening essences always equal natural T1 | Their IDs and ranges are selected by essence and item class. |
| Temple corruption makes eight-mod equipment | Eight-mod maps are a separate domain. |
| Hinekora's Lock previews everything and guarantees success | Support is action-specific; it is not universal rollback or a finite-budget guarantee. |
| Fixed Chaos, Transmute, Fusing and recombination odds are exact | The draft supplied no evidence for its constants. They have been removed. |
| The sample has a proven cheapest essence route | No complete pool or price model established that. Section 5 compares conditional candidates. |
| poe.ninja supplies crafting weights | Use it for economy data; obtain modifier generation data separately. |

## 2. Foundations for every recommendation

### 2.1 Ruleset and target interpretation

A request needs a patch/ruleset, league/mode, starting inventory or acquisition budget, and an objective:

| Objective | Meaning |
| --- | --- |
| Exact modifiers | Allowed IDs/families and tiers; extra affixes only if permitted. |
| Exact values | Exact numerical values in addition to modifier constraints. |
| Minimum performance | Thresholds such as Life >= 95; stronger tiers and crafted equivalents only under the stated policy. |
| Improve this item | Start from this physical item and preserve marked properties. |
| Reproduce a target | Acquire another base/intermediate item; clipboard is the desired result. |

Do not silently turn a low-tier target into a minimum, substitute an essence ID for a natural ID, add implicits/affixes, fracture, change base, or corrupt. Rare display names normally are not crafting objectives. Negative stats, maximum requirements and build-disabling mods are not necessarily improved by larger numbers.

When details are missing, state assumptions and separate conditional alternatives. Distinguish impossible targets, ambiguous parsing, missing data and unsupported actions.

### 2.2 Item state: independent layers

Retain the complete clipboard text alongside normalized state:

```text
ItemState
  rulesetId, sourcePatch, realm, league, mode
  identity, baseId, itemClass, domain, itemLevel, rarity, identified
  baseTags, baseRequirements, effectiveRequirements
  quality: type, amount, scalingRules
  baseDefenceRolls, displayedDefences
  sockets: ordered colours, linkGroups, kinds, disabled/etched state
  explicits[]: modId, groups[], generationType, values[], source, fractured, crafted
  implicits[]: modId, values[], source, eldritchOwner, strength
  enchantments[], anoint, rune/league-specific properties
  influences[], corrupted, mirrored, split, synthesized, intangibility
  imprintIdentity, previewState, other action-specific restrictions
```

This is an engine design, not a claim that all fields coexist. Unknown fields remain unresolved. `tags: []` means verified tagless, not a failed scrape.

Count **modifier records**, not printed lines. Hybrid mods can print several lines; one line can combine several contributions. Display tags, spawn-weight tags, generation tags, catalyst applicability and stat IDs are distinct. Preserve the source fields.

Usual capacities are 1 prefix/1 suffix for magic items, 3/3 for ordinary rare equipment, and 2/2 for ordinary rare jewels including cluster and Abyss jewels. These are defaults: special generation, corruption, item properties and league actions can override them. Flasks/tinctures need their own rules. Uniques use predefined sets rather than ordinary rare generation.

### 2.3 Compatibility is an action predicate

| State | Ordinary implications; exceptions require explicit rules |
| --- | --- |
| Shaper/Elder/Conqueror influence | Expands explicit pools; compatible fusion can produce two influences. Ordinary Eldritch armour currencies and fracturing are not interchangeable routes. |
| Fractured affix | Protected against ordinary explicit rerolls/removals/value rerolls. Fractured armour can be Eldritch-crafted when otherwise eligible. |
| Synthesized | Special implicit layer; not a blank base for ordinary influence/Eldritch conversion. |
| Eldritch | Independent Exarch/Eater implicits and strengths; compatible with eligible fractured armour. |
| Corrupted | Most ordinary changes fail. Tainted currencies and specific recipes are exceptions, not arbitrary explicit bench crafting. |
| Mirrored | Ordinary changes blocked; exceptions must be operation-specific. |
| Split | Persistent reuse/provenance restriction, not corruption. Check splitting and imprint rules independently. |
| Special base | May alter pools, capacity or actions; restrictive Keepers rings and newer Talismans are examples. |

Do not generalize the four armour classes supported by ordinary Embers/Ichors to every item whose tooltip says Eldritch. A special amulet implicit action does not establish eligibility for the whole currency family.

### 2.4 Evidence and availability

Each rule needs evidence status: `game_text`, `patch_note`, `datamined`, `experiment`, `inferred`, or `unknown`. Each action needs availability: `core`, `league_only`, `legacy_currency`, `historical_only`, `ruthless_variant`, or `unverified`.

Prefer GGG changes and extracted game text/data. PoEDB can contain current item text above an old embedded article. For example, [Fractured Fossil](https://poedb.tw/us/Fractured_Fossil) currently describes fracturing at the top while its embedded article describes old duplication. Do not merge both into one executable rule.

Unknown probabilities are not equal probabilities. Missing prices are not zero. A historical recipe name is not evidence of current availability.

## 3. Catalogue, least to most complex

Ordering measures state dependencies and planning difficulty, not price. Advanced policies often combine simple actions.

### 3.1 Base preparation, quality and sockets

**Identification/acquisition.** Reveal items and select a base with the necessary class, level, implicits and special properties. Higher item level can introduce unwanted mods and reduce success probability. Choose the lowest sufficient level unless another property justifies a higher base.

**Quality.** Scraps, Whetstones, Baubles and Chisels improve their respective classes. Since 3.25, quality gained on non-uniques depends on item level rather than normal/magic/rare 5/2/1. Armour/weapon/flask quality effects also changed. GCPs follow gem-specific rules. Above-cap quality, uniques and alternative effects require separate records. Do not scour an endgame base merely to save Scraps. [GGG quality changes](https://www.pathofexile.com/forum/view-thread/3533334)

**Jeweller's/Fusing.** Reroll socket counts/links within base constraints. Traditional level gates for up to 2/3/4/5/6 sockets are 1/15/25/35/50. Bench socket crafts bypass item-level gates without overriding incompatible base capacity. Inspected six-socket/six-link recipes cost 350 Jeweller's/1,500 Fusings. Random attempts need a validated quality-dependent distribution, not the draft's six-link odds. [Bench recipes](https://poedb.tw/us/Crafting_Bench)

**3.29 socket changes.** Gems fit irrespective of colour; matching coloured sockets grant +10% gem quality. Added sockets are white, so growing socket counts is no longer the old off-colour sampling trick. [GGG socket changes](https://www.pathofexile.com/forum/view-thread/3985332)

**Chromatics.** Reroll colours; quality affects non-white chances. Current bench options specify minimum non-white counts. Track generating action, level, quality and requirements rather than an invented colour formula. Historical red/green/blue bias and bench loops belong to older rulesets. [Chromatic text/recipes](https://poedb.tw/us/Chromatic_Orb)

**Binding.** Normal-to-rare generation with up to four linked sockets; early gearing, not six-link finishing. Include lost socket setup in the transition. Track socket order/link groups and distinguish Abyss sockets.

**Crafting Omens** modify a triggering currency use: Omen of the Jeweller ensures maximum sockets and Omen of Connections ensures maximum links. Price the Omen and triggering currency together, and validate the item and consumption context. Do not import PoE 2 Omen rules into PoE 1. Historical Omen of Blanching belongs with the older colouring system unless a current replacement is verified. [Jeweller Omen](https://poedb.tw/us/Omen_of_the_Jeweller), [Connections](https://poedb.tw/us/Omen_of_Connections)

### 3.2 Basic rarity and explicit operations

| Action | Ordinary effect | Planner consideration |
| --- | --- | --- |
| Transmutation | Normal -> magic, generate explicits | One/two-mod counts and side probabilities need evidence. |
| Augmentation | Add a mod to eligible magic item | Existing prefix forces suffix and conversely under 1/1 capacity. |
| Alteration | Reroll magic explicits | Isolate anchor/pair; account for persistent protection. |
| Regal | Magic -> rare, retain mods and add one | Sparse rare intermediates can be useful. |
| Alchemy | Normal -> rare | Baseline missing from the old catalogue. |
| Chaos | Reroll rare explicits | Whole-item baseline; fractures/locks need separate rules. |
| Scouring | Remove removable explicits | Rarity depends on retained mods; need not become normal. |
| Exalted | Add an eligible mod to rare | Requires capacity and nonempty pool. |
| Annulment | Remove an eligible mod | Select removable records, not lines or spawn weights. |

These are summaries; class-specific kernels remain separate data. [Alchemy](https://poedb.tw/us/Orb_of_Alchemy), [Annulment](https://poedb.tw/us/Orb_of_Annulment)

**Alteration crafting is a policy.** Augment or immediately Regal a useful one-affix item according to the goal. A bad Regal can lead to annulment, valid imprint restore, sale or restart. Losing valuable affixes is risk even when the base survives. Do not reuse the draft's unsupported fixed count percentages.

### 3.3 Value rerolls, uniques and vendor recipes

**Divine** rerolls eligible explicit values, not ordinary identities/tiers. **Blessed** rerolls implicit values. **Sacred** rerolls variable base defences, not an ES prefix. Fractures, protection and legacy unique updates need exceptions. Uniform integer rolls are a possible model, not a fact about every displayed value. [Divine](https://poedb.tw/us/Divine_Orb), [Blessed](https://poedb.tw/us/Blessed_Orb), [Sacred](https://poedb.tw/us/Sacred_Orb)

**Chance** upgrades eligible normal bases to magic/rare/obtainable uniques. **Ancient** transforms uniques according to class/pool rules, not necessarily on the same base. **Horizons/Harbinger's Orb** are map transformations. Do not insert guessed chase-unique probabilities. [Chance](https://poedb.tw/us/Orb_of_Chance), [Ancient](https://poedb.tw/us/Ancient_Orb)

**Omen of Fortune** guarantees the unique outcome of a Chance use on an eligible base. It does not guarantee a particular unique when multiple eligible outcomes exist, or enable a normally ineligible unique. [Fortune](https://poedb.tw/us/Omen_of_Fortune)

**Vendor recipes** generate specified bases/mods, gems/materials and special uniques. Store exact ingredients/output inheritance. New outputs need not retain sockets, level, influence or affixes. Recipes are not generic split/mirrored restriction bypasses.

### 3.4 Bench additions, blocking and partial rerolls

Ordinary crafting selects a known modifier/range and needs a free side, legal class, compatible groups, recipe access and crafted capacity. Selection is deterministic; values may roll. Removal/replacement costs resources. Removing crafts is not targeted natural-mod removal and can remove the entire crafted set.

**Blocking** occupies a conflicting family/side before another operation. Evaluate slots, persistence during selection, groups and removal cost. A reroll that removes the blocker before generation cannot benefit from it.

**Current partial rerolls:** three random modifiers for 3 Chaos, or one for 8 Chaos. These need independent stage-order, pool and metamod rules; do not implement as Divine or full Chaos from names alone. [Bench data](https://poedb.tw/us/Crafting_Bench)

The inspected table also has a non-unique rarity-reroll recipe costing one Chance Orb. Treat its broader input predicate and output inheritance separately from using a Chance Orb on a normal item. [Chance recipe data](https://poedb.tw/us/Orb_of_Chance)

### 3.5 Catalysts, flasks and oils

**Catalysts** set jewellery quality affecting applicable categories: Fertile (life/mana), Prismatic (resistances), Intrinsic (attributes), Tempering (defences), Abrasive (attack), Imbued (caster), Turbulent (elemental damage), Noxious (physical/chaos damage), Accelerating (speed), Unstable (critical). They are not a current generic weight boost. Type replacement, applicability and rounding need data. [Catalyst tags](https://poedb.tw/us/Catalyst)

**Instilling/Enkindling** add automation/enhancement enchantments to eligible utility flasks; conflicting enchants replace one another and do not occupy ordinary affix slots. Bench automation and Bestiary flask explicits are separate. [Instilling](https://poedb.tw/us/Instilling_Orb), [Enkindling](https://poedb.tw/us/Enkindling_Orb)

**Anoints** use oils for passive allocations on eligible amulets/special gear, tower effects on rings and Blighted-map effects. Check capacity/replacement. Tainted Oil grants a particular corrupted-item exception; Oil Extractors destroy the input. [Oil recipes](https://poedb.tw/us/Oil)

Current Talismans have inherent enchantments, are not inherently corrupted and cannot be anointed; legacy versions differ. [GGG Talisman changes](https://www.pathofexile.com/forum/view-thread/3985332)

**Tailoring/Tempering Orbs** add or replace Heist enchantments on body armour/weapons respectively and can reforge sockets. Their magnitude effects belong in derived-stat evaluation; sockets and conflicting enchantments can make this an expensive finishing order mistake. Compare applying them before socket investment, and use their own enchant pools rather than explicit-mod weights. [Tailoring](https://poedb.tw/us/Tailoring_Orb), [Tempering](https://poedb.tw/us/Tempering_Orb)

### 3.6 Essences and biased currency

Essences inject a mod selected by class/tier then generate other affixes. Progression: Whispering, **Muttering**, Weeping, Wailing, Screaming, Shrieking, Deafening; not all families exist at every tier. Lower-tier input/level restrictions differ from high-tier rare reforges. Magic input is not implicitly eligible.

Essence IDs/ranges are independent of natural tiers: some exceed, match, or provide exclusive stats. Horror/Delirium/Hysteria/Insanity do not corrupt crafted equipment. Remnant corruption of appropriate encounters is an acquisition process; other reward sources can exist. [Essence data](https://poedb.tw/us/Essence)

Deafening Anger gives **46-48% Fire Resistance on body armour**. That part of the example was correct; other suffixes and one-in-45 odds do not follow. [Anger mapping](https://poedb.tw/us/Deafening_Essence_of_Anger)

**Desolation** has its own properties/level restrictions. Do not force all special essences into the seven-tier ladder. [Desolation](https://poedb.tw/us/Essence_of_Desolation)

**Foulborn Augmentation/Regal/Exalted** favour higher-level mods, not guaranteed T1. Keepers/Genesis Tree/Wombgift/Foulborn unique generation also belongs in acquisition planning; distinguish historical processes from current rewards. [Keepers items](https://poedb.tw/us/Keepers)

### 3.7 Fossils and resonators

One-to-four-socket resonators combine fossil effects. Store eligibility, exclusions, weights, injections and special outcomes.

| Families | Role |
| --- | --- |
| Scorched / Frigid / Metallic | Fire / cold / lightning bias and exclusions |
| Jagged / Aberrant | Physical / chaos bias |
| Pristine / Dense | Life / defence bias; exclude defence / life |
| Corroded / Prismatic | Ailment versus elemental shaping |
| Aetheric / Serrated | Caster versus attack weights |
| Lucent / Shuddering | Mana versus speed weights |
| Bound | Minion/aura/curse bias |
| Deft / Fundamental | Critical versus attribute filtering |
| Faceted / Opulent | Gem / drop bias; Opulent excludes tagless mods |
| Sanctified | Higher-level weighting, lucky values |
| Hollow / Glyphic | Abyss socket / corrupt-essence injection |
| Bloodstained / Gilded / Tangled | Corruption implicit / vendor property / revealed tag effects |

Import [exact effects](https://poedb.tw/us/Fossil). Dense does not generically exclude mana, Corroded is not all-chaos weighting, and Faceted is not an exclusive-mod injector. Do not blindly multiply all matching tags. Combination, level and lucky rules need verified evaluators.

**Fractured Fossil:** current text fractures a mod and excludes influenced/fractured input; older text describes duplication/split. Validate reforge/fracture ordering before calculating odds. **Perfect Fossil** and older effects belong to historical records unless the chosen patch enables them. [Fractured Fossil](https://poedb.tw/us/Fractured_Fossil)

### 3.8 Harvest

| Family | Behaviour |
| --- | --- |
| Tag reforge | Guarantees the action's tagged outcome, not a particular stat/T1. |
| More/less likely | Bias existing modifier types, not universal tag sharing. |
| Add tagged/remove another | Add matching mod, remove eligible old mod, including same-tag mods; newly added mod excluded. Modern listed recipes require non-influenced input. |
| Resistance conversion | Similar-tier mapping; preserve only specified properties. |
| Rancour recipes | Extra tag reforges and damage/gem conversions. |
| Other | Quality enchants, influence reforges and resource/map transformations; synthesis is historical for this review's ruleset. |

Use the [current table](https://poedb.tw/us/Horticrafting), not the historical essay below it. Removed targeted annuls, remove/add and keep-side crafts are not enabled by name similarity.

Addition/removal needs distinct pools and ordering. Valuable mods/protection can be removed. A tagged guarantee can have multiple eligible prefixes/suffixes. Validate capacity and intermediate state.

The [local scrape](../../src/data/poedb-horticrafting.json) has 74 recipes, fetched 2026-08-19. Audit inferred `actionTypes` and CSS-derived `tagClasses`; its 50%-chance/3-6-mod prose is not a verified kernel. Preserve all costs, including Sacred Lifeforce and [Rancour](https://poedb.tw/us/Crystallised_Rancour).

### 3.9 Metacrafting

| Craft | Slot | Purpose for compatible operations |
| --- | --- | --- |
| Prefixes Cannot Be Changed | Suffix | Preserve existing prefixes |
| Suffixes Cannot Be Changed | Prefix | Preserve existing suffixes |
| 1 Prefix Modifier cannot be changed | Unverified | Preserve one existing prefix |
| 2 Prefix Modifiers cannot be changed | Unverified | Preserve two existing prefixes |
| 1 Suffix Modifier cannot be changed | Unverified | Preserve one existing suffix |
| 2 Suffix Modifiers cannot be changed | Unverified | Preserve two existing suffixes |
| Cannot Roll Attack Modifiers | Suffix | Filter attack generation |
| Cannot Roll Caster Modifiers | Suffix | Filter caster generation |
| Can have up to 3 Crafted Modifiers | Suffix | Counts as one; normally allows two more |

Metamods are explicit mods, not permanent flags. [Recipes](https://poedb.tw/us/Crafting_Bench)

**Protection costs** (user-supplied patch notes, recorded 2026-11-10; patch number not supplied, not reproduced in game). Machine-readable copy: [`references/bench/metacrafting-costs.json`](references/bench/metacrafting-costs.json).

| Craft | Item type | Cost |
| --- | --- | --- |
| 1 Prefix / 1 Suffix Modifier cannot be changed | Any eligible | 1 Divine |
| 2 Prefix / 2 Suffix Modifiers cannot be changed | Any eligible | 2 Divine |
| Prefixes / Suffixes Cannot Be Changed | Weapons | 4 Divine + 1 Sacred Orb |
| Prefixes / Suffixes Cannot Be Changed | Armour and Quivers | 4 Divine + 4 Blessed Orbs |
| Prefixes / Suffixes Cannot Be Changed | Jewellery | 4 Divine + 8 Exalted Orbs |

The full-side lock is no longer a flat 2 Divine: resolve the item type before costing it, and price the secondary currency from the request's snapshot. Shields are assumed to be Armour and belts Jewellery. Routes that recraft a lock per attempt must be re-costed.

The partial locks cost 1-2 Divine against 4+ for the full lock, so prefer them when the side holds no more mods than the protected count. The notes do not say which modifiers are protected when the side holds more, which slot the metamod occupies, or how it groups with the full lock. Until verified, numeric planning may use a partial lock only when existing mods on that side <= protected count, and must treat its slot as unknown (require a free slot on both sides or block).

Protection does **not** reserve empty slots. A protected side can receive additions. The opposite-side lock can disappear in a reroll/removal, requiring recrafting before another attempt.

| Operation | Interaction distinction to validate |
| --- | --- |
| Scour | Preserve protected mods; remove others; derive rarity. |
| Chaos / compatible Harvest | Retain protected existing mods; determine generation separately. |
| Exalt / additions | Free slots can fill; use supported attack/caster filters. |
| Ordinary Annul | Exclude mods protected by Cannot Be Changed locks. Cannot Roll Attack/Caster Modifiers no longer protect attack/caster mods from removal: count them as removable. |
| Divine | Protected values differ from generation filters. |
| Essence / resonator | No standard safe preservation through metamods; reject incompatible combinations. |
| Veiled currencies | Separate removal protection from addition eligibility. |
| Awakener / recombination / corruption / league actions | No inherited protection; require independent rules. |

**Attack/caster filters are generation-only for removal currencies** (user-supplied patch notes, recorded 2026-11-11; patch number not supplied). Cannot Roll Caster Modifiers no longer stops "some Currencies that remove Modifiers, such as Orbs of Annulment" from removing caster mods, and likewise for Cannot Roll Attack Modifiers. Old annul-shielding routes (craft the filter so an Annul can only hit the other mods) are invalid: use the full removable count in 1/N. The notes say "some", so the affected currency list beyond Annulment is unverified; treat any other removal action (Veiled Exalted, Eldritch Annulment, Harvest/beast removal) as unprotected unless shown otherwise. Addition filtering (Exalt and similar) is unchanged by this note.

This is a validation matrix, not a universal guarantee. Unknown interactions block numeric planning; do not use a single boolean for every action stage.

### 3.10 Veiled crafting

**Veiled Exalted** removes an eligible explicit and adds a veiled mod. It was renamed in 3.26. **Veiled Chaos**, reintroduced then, reforges a rare with a veil. Catarina double-veiled drops are another source state. [GGG 3.26](https://www.pathofexile.com/forum/view-thread/3787013/page/1), [currency text](https://poedb.tw/us/Veiled_Exalted_Orb)

Unveiling generates an eligible choice set, not three independent rolls with replacement. Available families can limit options. Member-specific/unveiled/bench variants have different IDs.

A blocker excludes an unwanted family only if groups conflict and capacity permits. A surviving lock may need removal before blocking. Protected prefixes force a veiled suffix only if capacity/generation eliminates prefix outcomes. Include failed removal, unwanted unveil and recovery costs.

### 3.11 Eldritch crafting

Ordinary Embers/Ichors affect eligible helmets/body armours/gloves/boots. Embers give Exarch implicits; Ichors give Eater implicits, changing the implicit layer. Fractured armour can qualify; influenced/synthesized bases are not interchangeable inputs.

| Dominant owner | Chaos | Exalted | Annulment |
| --- | --- | --- | --- |
| **Searing Exarch** | Reroll prefixes | Add prefix | Remove prefix |
| **Eater of Worlds** | Reroll suffixes | Add suffix | Remove suffix |

Stronger implicit determines dominance; one suffices. A tie establishes neither. Compare strength rather than ambiguous tier numbers. [Eldritch Chaos](https://poedb.tw/us/Eldritch_Chaos_Orb), [Exalted](https://poedb.tw/us/Eldritch_Exalted_Orb), [Annulment](https://poedb.tw/us/Eldritch_Orb_of_Annulment)

**Conflict** raises one implicit/lowers another, removing a lowered Lesser. Both owners required; odds depend on relative strength. Ladder: Lesser, Greater, Grand, Exceptional, Exquisite, Perfect. Recompute dominance. [Conflict](https://poedb.tw/us/Orb_of_Conflict)

Eldritch removal protects the other side, not desirable mods on its target side. One unwanted among three removable suffixes gives 1/3 safe removal under uniform selection. Eldritch Chaos needs its own mod-count kernel.

### 3.12 Beasts, imprints, splitting and Talismans

**Matron** adds a crafted metamod. Full suffixes and an eligible free prefix can force Suffixes Cannot Be Changed. Check craft capacity first; compare full recipe costs, not an assumed beast price. [Matron](https://poedb.tw/us/Wild_Bristle_Matron)

**Magic imprints** save corresponding eligible item states. Current Craicic Croaker supplies the recipe; old guides use Craicic Chimeral. Do not restore destroyed items, donors, arbitrary copies, or results made ineligible by fracture/split/corruption. [Croaker](https://poedb.tw/us/Craicic_Croaker)

**Wolf Alpha** adds prefix/removes suffix; **Lynx Alpha** adds suffix/removes prefix. Validate ordering, slots, relevant beast-level rules and removal protection. **Aspects** occupy explicit suffixes. Watcher's Eye/synthesis beast rerolls have narrow eligibility; old rare-base Vivid Vulture behaviour is not automatically current. [Bestiary](https://poedb.tw/us/Bestiary_league)

**Splitting** distributes mods and imposes restrictions; it is not full-item duplication. Fenumal Plagued Arachnid/multi-split recipes require historical/current distinctions.

For 3.29, the ordinary two-item and three-item beast splits were replaced by Talisman fracturing recipes. Do not offer those old split services as current actions. [GGG replacements](https://www.pathofexile.com/forum/view-thread/3985332)

**Black Mórrigan** includes maximum sockets/links, stronger Aspects, magic Lock application and Talisman operations, not blanket corrupted crafting. Current data includes two-mod fracturing on a rare Talisman with at least six mods and unique Talisman creation. [Recipes](https://poedb.tw/us/Black_M%C3%B3rrigan)

Talisman base rerolls/rare imprints need separate kernels. Several older recipes were replaced. [GGG Talisman recipes](https://www.pathofexile.com/forum/view-thread/3985332)

### 3.13 Influence and elevation

**Conqueror Exalts** add influence and a corresponding mod to eligible rares. Check ilvl floor (ordinary examples 68+), capacity and forbidden states; Shaper/Elder lack equivalent ordinary Exalts. [Hunter's](https://poedb.tw/us/Hunters_Exalted_Orb)

**Awakener's Orb** consumes a donor and reforges a same-class recipient with compatible influences. Recipient base survives. Multiple candidate influence mods create uncertainty; group conflicts can prevent retaining both. Prepare one desired eligible mod per input when possible and price donor replacement. [Awakener's](https://poedb.tw/us/Awakeners_Orb)

**Dominance** removes one influence mod/upgrades another on eligible armour with at least two. Lower-tier upgrades need not elevate; store actual transition IDs rather than universal T0. [Dominance](https://poedb.tw/us/Orb_of_Dominance)

### 3.14 Fracturing, synthesis and recombination

**Fracturing Orb** locks a random mod on eligible rares with at least four. Influenced/already-fractured inputs are excluded; older synthesized items remain ineligible even though current text no longer lists that restriction. For N uniformly eligible mods, target probability is 1/N: 25% only at N=4. Failed attempts cost prepared bases too. Compare buying a fracture. [Fracturing](https://poedb.tw/us/Fracturing_Orb), [GGG legacy restriction](https://www.pathofexile.com/forum/view-thread/3985332)

**Synthesis** generates special implicits through versioned sources. Identity generation, value reroll and ordinary explicit crafting are separate. Original Synthesiser, Harvest, rewards and restricted beast rerolls need distinct pools. [Synthesis](https://poedb.tw/us/Synthesis)

**Current availability:** Harvest synthesis is removed. New non-unique synthesized items are restricted to corruption of synthesis uniques into rares; legacy Standard bases remain a separate inventory class. Synthesis beast rerolls now require unique items. [GGG 3.29 synthesis changes](https://www.pathofexile.com/forum/view-thread/3985332)

**Recombination** combines prepared inputs with stochastic base/mod retention. Separate Sentinel, Settlers/Kingsmarch and later versions; a [legacy mod table](https://poedb.tw/us/Recombinator) is not a retention kernel.

Store compatibility, base selection, level inheritance, per-side counts, duplicate/groups, exclusive categories, selected-base eligibility, state restrictions and socket/quality/implicit inheritance. Do not guess binomial odds or transfer invalid mods.

Plan donor production, combining, reuse/sale/restart as inventory transitions. Crafted/essence/veiled exclusivity and duplicates can matter; older-version folklore is not executable evidence.

### 3.15 Corruption, tainted currency, reflection and foresight

**Vaal** needs class-specific tables: equipment/jewel/map/gem unchanged-corrupted, reforge, implicit, socket and gem outcomes differ. **Locus** can destroy equipment, alter sockets, reforge or add two implicits; its reforge is not an eight-mod map. Socket corruption changed in 3.29. [Locus](https://poedb.tw/us/Locus_of_Corruption), [GGG changes](https://www.pathofexile.com/forum/view-thread/3985332)

In this ruleset the socket branches turn white sockets non-white: one for Vaal, all for Locus. Historical white-socket outcomes must not remain in the current tables. [GGG socket branches](https://www.pathofexile.com/forum/view-thread/3985332)

| Tainted family | Kernel required |
| --- | --- |
| Jeweller / Fusing | Socket/link gain/loss, boundaries, largest group |
| Chromatic | Corrupted colour reroll under selected patch |
| Chaos | Reforge/removal outcomes |
| Exalted | Addition/removal |
| Mythic | Eligible unique conversion/destruction |
| Scrap / Whetstone | Random quality/caps |
| Divine Teardrop | Historical/special tier-changing action, not Divine values |

Do not propagate 50/50 across this family without evidence. [Tainted Fusing](https://poedb.tw/us/Tainted_Orb_of_Fusing), [Mythic](https://poedb.tw/us/Tainted_Mythic_Orb)

**Volatile Vaal** changes values/corrupts unique equipment or destroys it; requires scaling/unscalable-stat rules. [Volatile Vaal](https://poedb.tw/us/Volatile_Vaal_Orb)

**Reflecting Mist** gives mirrored ring/amulet alternatives. Evaluate beneficial negative stats and value/quality preparation. Influenced/veiled inputs excluded; signed reflection needs its own kernel. [Mist](https://poedb.tw/us/Reflecting_Mist)

**Mirror** copies eligible finished gear into a mirrored output. Services are acquisition with fees/availability, not generation of the original. [Mirror](https://poedb.tw/us/Mirror_of_Kalandra)

**Hinekora's Lock** previews supported subsequent currency results and loses foresight on modification. Altar/bench/two-input/service support is not automatic. Rejected previews can cost another Lock and a legal reset affecting target values. No universal rollback or finite-budget guarantee. [Lock](https://poedb.tw/us/Hinekoras_Lock)

### 3.16 Allflame and Ducats

Allflame offers ghostly outcomes and a choice. Model offer generation plus selection. **Intangibility** can restrict later crafts to one copy; retain it in state and do not assume independent alternatives. [Intangibility](https://poedb.tw/us/Intangibility)

| Item/system | Purpose |
| --- | --- |
| Ukatoa's Ducat | Special amulet implicit |
| Merrick's Ducat | Extra Abyss-jewel mod/corruption/capacity exception |
| Cyaxan's Ducat | Infamous-mod reforge |
| The Genteel's Ducat | Attribute conversion |
| Kishara's Ducat | Single-mod ghostly outputs |
| Rotmother's Ducat | Trap/mine rare-belt mod |
| Brinehook's Ducat | Pantheon Aspect |
| Katakohi's Ducat | Glove socket etching; disabled sockets |
| Tzamoto's Ducat | Intangibility removal/destruction |
| Enshrouding Crystals | Class-specific unique transformations |
| Other Ducats/Charts | Resource/voyage operations separate from gear |

The [catalogue](https://poedb.tw/us/Allflame_items) establishes these families. Import support, copy counts, sulphur costs, Intangibility changes and legality before ranking. A one-line Enshrouding tooltip is not a full kernel. Omitting enabled league mechanics limits cheapest-craft claims.

### 3.17 Other domains and historical registry

Each family needs its own adapter rather than six-affix assumptions.

| Family | Explanation / boundary |
| --- | --- |
| Rog | Select his offered item; accept/skip upgrades/additions/removals. Player inventory is not arbitrary input. Track artifacts/offers. [Rog](https://poedb.tw/us/Rog) |
| Labyrinth / Divine Font | Gem quality/experience/transfiguration; old equipment enchants are historical. |
| Temple gems/uniques | Lapidary Lens, sacrifice/vial upgrades differ from equipment corruption. |
| Gems | GCP, experience, vendor recipes, Vaal/transfigured variants and caps. Mirage Coins imbue through separate corruption. [GGG 3.28](https://www.pathofexile.com/forum/view-thread/3913392) |
| Cluster jewels | Size/passive count/small-passive enchant define base; explicit rerolls do not redesign layout. Include notable IDs, level gates, 2/2 sides and placement. |
| Ordinary/Abyss/Timeless jewels | Distinct pools, corruption exceptions and seed evaluation. |
| Maps/invitations | Rolling, quality, corruption, Horizons/Harbinger, Delirium/oils/enchants and restrictions. Eight-mod maps are domain-specific. |
| Strongboxes | Identify/roll/corrupt before opening; encounter output. |
| Heist | Rogue job gear, trinkets, replicas, experimental/enchanted bases, Tailoring/Tempering Orbs. |
| Runes/runegrafts | Weapon enchants, restrictions/resources and replacement systems; character passives are not item enchants. |
| Drop-exclusive mods | Incursion, Delve, grasping-mail, Infamous and other source mods require acquisition/injection/transfer; ordinary weight zero does not imply nonexistence. |
| Betrayal sprees | Limited supplied bases/resources; historical Aisling/Vorici/Hillock services separated. |
| Genesis Tree/Foulborn | Biased generation/unique variants; source processes versus editing. |
| Original Harvest | Old targeted removals, remove/add, keep-side, jewel implicits and fractures; historical unless reintroduced. |
| Original Synthesis/Sentinel | Synthesiser thresholds and old recombination transfer/mods. |
| Necropolis graveyard | Corpses/layout/tags/tier scarcity/base choice/copies; historical provenance. |
| Crucible | Reveal/level/merge weapon/shield passive trees, separate from affixes. |
| Scourge | Beneficial/detrimental transformations, not current tainted currency. |
| Prophecy/fated uniques | Retired upgrades; may require purchase/replacement sources. |
| Eternal Orb | Legacy imprint currency, not ordinary magic beastcrafting. |
| Old quality/sockets/enchants | Perfect Fossil/Hillock/Vorici/Harvest variants cannot mix with current rules. |
| Events/legacy | Enable actual event rules; obsolete outcomes remain provenance, not current recipes. |

Explain why historical-only routes are unavailable; do not omit unfamiliar mods or invent replacements.

## 4. Probability and planning model

### 4.1 Eligible pools and ordered generation

For each action stage, resolve item domain, base tags, item level, influence, generation type, capacity, existing mod groups, source restrictions, persistent state and supported metamods. Evaluate **ordered** spawn-weight conditions according to the dataset. Do not sum every matching row or collapse all base-dependent conditions to a universal weight.

For a stage that uses weighted selection:

$$P(m\mid s,a,\mathrm{stage})=\frac{w_{\mathrm{effective}}(m,s,a)}{\sum_{j\in\Omega(s,a,\mathrm{stage})}w_{\mathrm{effective}}(j,s,a)}.$$

This formula does not establish side selection, mod count, forced-tag ordering, corruption odds or unveiling offers. Those are separate kernels. If the action chooses a side first, include that stage; if it samples a combined pool, use that pool. The original combined-side formula must not be applied universally without evidence.

After every addition update groups, capacity and pools. Whole-item success sums all successful ordered paths and value outcomes. Three desired mods generally are **not independent probabilities** that can simply be multiplied.

Weight zero in ordinary generation can coexist with essence, drop, bench or unveiled injection. Keep source-specific eligibility and level overrides. A guaranteed tag does not imply a guaranteed particular stat, generation side, tier, or value.

### 4.2 Removal and value kernels

For N equally selectable removable modifiers and k safe removals, `P(safe)=k/N`. Exclude fractured/protected modifiers as required by that action. Spawn weights do not govern ordinary annul selection. Distinguish an illegal operation from a legal operation with zero chance of satisfying the goal.

For an **explicitly assumed** uniform integer value from L through U:

```text
P(value >= x) = clamp((U - max(L,x) + 1) / (U-L+1), 0, 1)
```

Verify each value kernel. Hybrid/correlated stats, lucky rolls, discrete steps, negative values and rounding may require different models. Tier success alone may not satisfy a numerical target. A Divine that improves one stat can spoil another.

### 4.3 Repeated attempts and budgets

For independent, identically distributed complete attempts with success p and cost c:

$$E[N]=1/p,\qquad P(\text{success by }n)=1-(1-p)^n,$$

$$n_q=\left\lceil\frac{\log(1-q)}{\log(1-p)}\right\rceil\quad (0<p<1).$$

`c/p` is valid only when c includes the **entire cost of returning to the same attempt state**. It is not a universal essence/imprint/fracture formula. Handle p=0 as unreachable and p=1 as one attempt.

Synthetic illustration, not a PoE estimate: p=0.02 and c=10 Chaos per complete reset gives mean cost 500 Chaos, but about 149 attempts/1,490 Chaos for a 95% success chance. Expected cost is not a safe spending cap.

### 4.4 Optimize a policy with recovery

Let `goal(s)` be the target predicate and `P(s' | s,a)` the transition distribution. A stochastic shortest-path formulation is:

$$V(s)=\min_{a\in A(s)}\left[c(s,a)+\sum_{s'}P(s'\mid s,a)V(s')\right],\qquad V(s)=0\text{ if goal}(s).$$

Use proper terminating policies, explicit unreachable states and explicit destruction/restart branches. An unrecoverable failure must not receive value zero. A* on a single lucky sequence does not solve stochastic crafting. A budget-constrained objective includes remaining resources in state and may favour a different route than minimum expected spend.

Actions include buying finished/intermediate/fractured/synthesized items, farming accessible sources, selling failures, reusing donors and abandoning uneconomic branches. For improving an existing item, its old purchase cost is sunk, but current resale value and loss risk still matter.

Count base acquisition, currencies, beasts, lifeforce, resonators, blockers, recrafting locks, donors, sockets/links, values, service fees and optional time. Track untradeable resources/access separately rather than inventing Chaos equivalents. Resale assumptions need realistic liquidity and transaction costs.

Report expected cost, median/tail percentile where supported, budget success probability, input-loss/destruction probability, expected clicks and explicit stop/recovery rules. A route should say what to do after each meaningful failure, not only list the successful sequence.

### 4.5 Honest confidence and coverage

- **Exact within supported model:** known kernels and exhaustive search or a justified bound within a specified action set.
- **Estimated:** simulation/empirical kernels, with sample size, seed and uncertainty.
- **Heuristic candidate:** plausible route, not numerically ranked.
- **Unsupported:** missing mechanics/data prevent evaluation.

Each result includes ruleset/data snapshot IDs, price timestamp, target interpretation, explored/excluded actions, assumptions and per-step evidence. “Cheapest among these evaluated policies” is a scoped claim; “best possible method” requires much broader coverage.

## 5. Worked review: Agony Salvation, Twilight Regalia

### 5.1 Parse the supplied item

| Property | Observation | Interpretation |
| --- | --- | --- |
| Class/base/rarity | Body Armours / Twilight Regalia / Rare | Resolve base ID from versioned data |
| Item level | 87 | Separate from required character level |
| Energy Shield | 283 | Derived defence, not an additional ES explicit |
| Requirements | Level 84; Int 240 augmented | Derived base/mod/gem requirements as applicable; unmet is character context |
| Sockets | `B-W` | Two linked sockets, blue then white |
| Prefix | Rotund, displayed T7; +95 Life, range 85-99 | One observed natural prefix; resolve actual ID |
| Suffix | of the Worthy, displayed T2; 18% reduced Attribute Requirements | Requirement reduction, not +Intelligence |
| Suffix | of Tzteosh, displayed T1; +47% Fire Resistance, range 46-48 | One resistance suffix |
| Suffix | of Galvanising, displayed T3; 43% faster start of ES Recharge, range 43-50 | Recharge **start/delay**, not recharge rate |
| Other states | No influence/fracture/corruption/enchant shown | Absence conditional on complete clipboard |

There are **one prefix and three suffixes**, leaving two ordinary prefix slots. Store observed names, tiers, tags and values; do not fabricate game IDs such as `EnergyShieldRechargeRate`. [Twilight Regalia base](https://poedb.tw/us/Twilight_Regalia)

Lower-tier Life is not automatically a mistake. Exact reproduction preserves the requested tier; minimum performance may allow stronger Life. Exact defence, quality, socket order, absence of implicits and absence of additional affixes are independent requirements.

### 5.2 Already owned versus target to reproduce

If this is both the starting item and the exact target, **stop: additional crafting cost is zero**. If improving it, define wanted prefixes/defence goals. Applying an essence to an already-correct suffix set destroys progress.

If reproducing it on another base, compare acquisition and crafting candidates. The observation does not establish why a new base must specifically be ilvl 86+. Resolve actual mod-level gates and base acquisition before choosing the input level.

### 5.3 Candidate A: Anger suffix foundation, then prefixes

This is a **heuristic candidate**, conditional on allowing an essence-equivalent Fire Resistance modifier and additional Eldritch implicits.

1. Acquire an eligible Twilight Regalia at sufficient item level. Compare useful intermediate bases and fractures if permitted.
2. Use the selected Anger essence until **both** other desired suffixes meet the target. Hitting either alone is only an intermediate state.
3. Once all three suffixes are correct, stop essences: another essence rerolls progress.
4. If implicits are allowed, establish **Exarch dominance** with an Ember stronger than any Eater implicit. A sole Lesser Ember can suffice; an expensive Ichor is not the default prefix-finishing tool.
5. Compare Exarch-dominant Chaos and selected Eldritch Annul/Exalt steps. These prefix operations preserve the suffix side but can lose useful prefixes.
6. Do not stop at ordinary crafted flat Life for this +95 target: the inspected body-armour recipe tops out at +85. It can be a temporary/fallback outcome if the target is relaxed, and does not reproduce natural Rotund. [Body-armour bench ranges](https://poedb.tw/us/Body_Armours)
7. Resolve exact values if needed, additional-affix cleanup, defence/quality constraints and the `B-W` setup. Do not add unwanted properties simply as conventional finishing steps.

The essence stage needs the joint probability of requirement reduction and recharge-start after guaranteed Fire Resistance, capacity and group rules. That probability is **unknown without the full pool/count kernels**. [Anger guarantee](https://poedb.tw/us/Deafening_Essence_of_Anger), [Eldritch prefix rule](https://poedb.tw/us/Eldritch_Chaos_Orb)

One unwanted suffix beside two wanted ones does not make Eater-dominant annulment safe. Compare the chance and replacement cost of losing a wanted suffix with restarting; it does not automatically supply the missing suffix afterward.

### 5.4 Other candidate policies

| Candidate | Why consider it | Conditions / missing data |
| --- | --- | --- |
| Buy finished or intermediate item | Modest-stat targets may cost less to buy | League prices, availability and acceptable equivalents |
| Fractured suffix + Anger | Reduces random suffix goals | Fracture permitted; correct range/tier; base price |
| Alt/Aug/Regal + additions | Isolate requirement reduction/recharge-start with another useful mod | Generation kernels and recovery cost |
| Harvest tag reforge | Bias relevant families | Alternative same-tag mods, guarantees, locks and complete pools |
| Fossil combination | Exclude unwanted pools | Avoid disabling desired Life or defence-tagged recharge-start |
| Full suffixes + Suffixes Cannot Be Changed + Life reforge | Finish prefixes without adding Eldritch implicits | Free prefix, item-type lock cost (section 3.9), forced-mod/protection kernel, full-prefix failure branch |
| Partial bench reroll | Improve an almost-correct item | New action kernel and metamod interactions |
| Recombination / Allflame | Donor transfer or offer selection may help | Enabled version, legality, distributions and resource prices |

For an exact natural four-affix target with no implicits, essence-exclusive IDs, crafted Life, extra prefixes, fractures or Eldritch implicits are not success. Do not assume all these changes can be reversed. Exact reproduction may require a different route entirely.

### 5.5 Example planner request

Valid JSON illustrating a request, **not scraped data or a numeric estimate**. Semantic keys are local labels awaiting canonical game-stat mappings. The interpretation below is an example, not an assumption forced on the user.

```json
{
  "rulesetId": "poe1-3.29.3b",
  "league": null,
  "mode": "non-ruthless",
  "task": "reproduce-from-new-base",
  "baseName": "Twilight Regalia",
  "referenceItemLevel": 87,
  "target": {
    "interpretation": "minimum-performance",
    "stats": [
      { "semanticKey": "maximumLife", "min": 95 },
      { "semanticKey": "reducedAttributeRequirementsPercent", "min": 18 },
      { "semanticKey": "fireResistancePercent", "min": 47 },
      { "semanticKey": "fasterStartOfEnergyShieldRechargePercent", "min": 43 }
    ],
    "allowAdditionalAffixes": true,
    "allowCraftedEquivalent": true,
    "allowEssenceEquivalent": true,
    "allowFractured": false,
    "allowAdditionalImplicits": false,
    "allowCorrupted": false,
    "socketGroups": [["B", "W"]]
  },
  "budgetChaos": null,
  "costSnapshotId": null,
  "resolvedModIds": null,
  "status": "needs-league-and-data"
}
```

With `allowAdditionalImplicits: false`, an Eldritch route is excluded unless a validated complete policy still satisfies the final implicit restriction. The planner cannot ignore that flag for convenience.

## 6. Reference data contract and implementation phases

### 6.1 Sources and priorities

**poe.ninja is an economy input, not the modifier-weight database.** Obtain IDs, groups, ordered weights, ranges, base tags and recipe mappings from patch-matched game extraction/PoEDB. Tooltips establish behaviour but may not expose server-side distributions; these can require experiments. Simulators/adapters are cross-checks, not proof of all rules. [PoEDB](https://poedb.tw/us/Modifiers), [poe.ninja API reference](https://poe.ninja/docs/api)

Import in this order:

1. Bases and complete ordinary modifier pools for selected item classes.
2. Bench, essence and currency actions, including stage-specific distributions.
3. League prices for currencies, materials, bases and useful intermediates.
4. Harvest/fossils and metamod interaction fixtures.
5. Veils/Eldritch/beasts/influence, then recombination/special systems.

Every snapshot needs schema version, game, exact patch or explicitly unknown patch, league applicability, source URLs, fetch time, content hash, extraction method and evidence status. A fetch date alone does not establish patch. Preserve the raw inputs required for offline reproduction, share identical global datasets between class snapshots, and apply the [raw retention rules](references/RAW_RETENTION.md).

For economy ingestion, keep exchange-price reference currency separate from already-normalized Chaos prices. The documented API exposes different response shapes, so convert using the snapshot's reference rates instead of assuming every numeric quote is Chaos. Cache snapshots and retain missing/low-volume observations. [poe.ninja API](https://poe.ninja/docs/api)

### 6.2 Proposed `references/` layout

The ruleset layout below remains proposed. A dated [PoEDB Wands snapshot](references/README.md) is populated under `references/snapshots/poedb-wands-2026-09-06/`, with raw sources, modifiers, complete groups/tags, tiers/ranges, exposed ordered weights, Kinetic Wand base data and weapon enchantments. Its exact source patch remains unknown. The companion RePoE 3.29.3.3 snapshot supplies canonical IDs and patch-matched empty-base weights for this Kinetic Wand request. The saved Craft of Exile package supplies a community-model magic affix-count distribution. Together these support the current donor calculation, but they are not yet a complete executable ruleset.

```text
references/
  manifest.json
  raw/<source>/<class-or-source-snapshot>/...
  schemas/*.schema.json
  rulesets/<rulesetId>/
    base_types.json
    modifiers.json
    stat_translations.json
    currency_actions.json
    bench_recipes.json
    essences.json
    fossils.json
    harvest.json
    beasts.json
    veiled_modifiers.json
    eldritch_implicits.json
    influence_transforms.json
    synthesis.json
    recombination.json
    corruption.json
    league_actions.json
    interaction_matrix.json
    generation_distributions.json
  economies/<league>/<timestamp>/
    currency_costs.json
    material_costs.json
    base_prices.json
    intermediate_item_prices.json
  fixtures/<rulesetId>/...
```

### 6.3 Normalized fields

The previous single `weight` and ambiguous `requiredLevel` are insufficient. Separate required **item** level from character requirement. Mods can contain several groups and stats.

| Record | Required content |
| --- | --- |
| Base | ID, aliases, domain/class, ordered tags, requirements, defences/variance, implicit/special properties, capacities |
| Modifier | ID, domain, generation type, name, groups[], requiredItemLevel, source categories, ordered spawnWeights/generationWeights, tags, stat ranges/value rules |
| Action | ID, input predicate, resource vector, stage order, effects on every item layer, pools/kernels, failure outputs, interaction rules |
| Distribution | Stage/event, conditions, outcomes/probabilities or unknown, evidence, empirical sample size/confidence/version |
| Economy | League/realm/mode, observation timestamp, unit, quote/interval, liquidity, provenance, stale/missing flags |
| Target | Exact IDs/equivalences, ranges/thresholds, prohibited mods/states, derived stats, sockets, allowed extras |
| Fixture | Initial state, action, legality, invariants/outcomes, independent expected probabilities where known, evidence |

Illustrative modifier record; placeholders are **not real game IDs**:

```json
{
  "id": "EXAMPLE_ONLY_NOT_A_GAME_MOD_ID",
  "domain": "item",
  "generationType": "prefix",
  "name": "Example",
  "groups": ["EXAMPLE_GROUP"],
  "requiredItemLevel": 1,
  "tierDisplay": null,
  "tags": ["life"],
  "spawnWeights": [
    { "tag": "EXAMPLE_BASE_TAG", "weight": 100 },
    { "tag": "default", "weight": 0 }
  ],
  "generationWeights": [],
  "sources": ["ordinary"],
  "stats": [{ "id": "EXAMPLE_STAT_ID", "min": 1, "max": 3 }],
  "valueKernelId": null,
  "evidence": { "status": "example-only", "sourceUrls": [] }
}
```

When implemented, JSON Schemas must require essential fields, reject negative weights/costs and invalid ranges, preserve array ordering, check references, and prohibit example placeholders in production. Structural validation cannot establish mechanical correctness.

### 6.4 Action contract

```text
availability(context) -> supported | unavailable | unknown
validate(item, inventory, context) -> legal | illegal(reason) | unknown(reason)
cost(item, context) -> resource vector + optional priced estimate
outcomes(item, context) -> exact distribution | simulator | unsupported
apply(item, outcome) -> next item and consumed/created inventory
explain(item, outcome) -> human-readable changes and preservation
```

Validate eligible outcomes and intermediate stages, not merely total free slots. Restoration, selling, donors and resource conversion are actions too. Previews reveal information and affect future choices; do not model them as ordinary blind rolls.

### 6.5 Phases and completion gates

| Phase | Deliverable | Completion gate |
| --- | --- | --- |
| 1: Parse/audit | Clipboard/target parser, manifest, base/mod resolution | Sample resolves to 1P/3S and recharge-start; ambiguities preserved |
| 2: Core evaluator | Basic currency, bench, essence kernels for chosen gear/cluster classes | Legal pools, normalized distributions, no invented weights |
| 3: First planner | Compare buy, alt/regal, essence and bench policies | Scoped costs with recovery and budget risk |
| 4: Targeting/protection | Harvest, fossil, metamod, Eldritch | Fixtures for locks/full sides/fractures/dominance |
| 5: Advanced branches | Veils, beasts, influence, fracture/synthesis, recombination | Donors, imprint eligibility, source mods and failure inventory |
| 6: Expanded domains | Allflame, reflection, uniques/gems/maps/legacy | Availability and domain exceptions enforced |
| 7: LLM integration | Reproducible comparisons and explanations | No numeric optimum with missing kernels/prices |

Start with a narrow supported item set and enumerate action coverage. The existing repository has a cluster-focused engine; this document does not extend that implementation to every equipment class by itself.

### 6.6 Semantic acceptance fixtures

These are proposed checks to implement with the corresponding features, not claims of live-game validation:

1. Hybrid modifiers count correctly; item level and character level remain distinct.
2. Sample contains 1P/3S, linked `B-W`, and recharge-start semantics.
3. Missing IDs/tags/weights stay unresolved, not default weight 1 or tagless.
4. Ineligible item-level tiers never roll; allowed essence overrides use their own rules.
5. Conflicting groups and full sides exclude illegal additions.
6. Fractured/protected mods and values survive compatible operations.
7. Protecting a side does not forbid adding into its free slots.
8. Exarch selects prefixes, Eater suffixes; ties have no dominance.
9. One safe among three uniformly removable mods gives 1/3.
10. Harvest add/remove can remove an old same-tag mod, not its new mod.
11. Veiled generation can use a protected side's empty slot; full-side cases force only legal outcomes.
12. Matron options derive from slots/craft capacity.
13. Ordinary imprint rejects ineligible changed/destroyed/split/fractured results.
14. Exact targets reject substitutes/extras/implicits unless allowed.
15. Socket/Talisman/Fractured Fossil/recipe behaviour is version-selected.
16. Recombination enforces selected-version transfer/group restrictions.
17. Unsupported Allflame/preview kernels are omitted from numeric ranking with coverage disclosed.
18. Missing prices are unknown; stale snapshots labelled; reset costs include replacement inputs.
19. Small synthetic exact enumerations agree with simulation within stated error, using independent expected results.
20. Plans end in target success or an explicit failure/recovery branch; already-satisfied targets stop.

## 7. Maintenance and unresolved quantitative work

Diff patch notes, currency text, pools, bases and recipes on updates; rebuild snapshots and rerun affected fixtures. Bugfixes matter: 3.29.3b changed corruption implicit availability/weights. [GGG 3.29.3b](https://www.pathofexile.com/forum/view-thread/4001117)

Numeric optimization still needs independently validated affix-count/side kernels, multi-tag fossil evaluation, special rounding, partial-bench interactions, complete recombination transitions and recycling, Allflame action costs, source availability and weighted enchant outcomes. The Torment Spire fixture now has canonical target IDs, empty-base weights and selected-league exchange prices; future targets still require the same resolution pipeline. These are explicit data/implementation work, not gaps to fill with plausible constants.

The eventual answer to how to craft an item must come from its ruleset, target and priced policy comparison, with confidence and coverage stated.
