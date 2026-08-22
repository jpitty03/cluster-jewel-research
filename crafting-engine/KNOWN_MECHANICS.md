# Path of Exile Cluster Jewel Crafting: Known & Documented Mechanics

This document establishes the game mechanics, domain rules, and mathematical models utilized by the crafting engine, categorized by verification certainty.

---

## 1. Confirmed Rules (Verified In-Game & Data Models)

1. **Affix Slot Limits on Cluster Jewels**:
   - Rare Cluster Jewels have a maximum of **2 Prefixes and 2 Suffixes** (total 4 explicit modifiers max).
   - Magic Cluster Jewels have a maximum of **1 Prefix and 1 Suffix** (total 2 explicit modifiers max).
   - Clean / Normal Cluster Jewels have 0 explicit prefixes and 0 explicit suffixes.

2. **Notable Capacity by Base Jewel Size**:
   - Large Cluster Jewels support up to **3 notables**.
   - Medium Cluster Jewels support up to **2 notables**.
   - Small Cluster Jewels support up to **1 notable**.
   - Attempting to roll a notable when notable capacity is reached is blocked.

3. **Mod Group / Family Exclusivity**:
   - Each explicit mod belongs to a mod group/family (e.g. `AfflictionJewelSmallPassivesGrantES`, `AfflictionJewelSmallPassivesHaveIncreasedEffect`, `AfflictionJewelSmallPassivesGrantInt`).
   - If an item already possesses any tier of a mod family, no other modifier belonging to that family can roll.
   - An item cannot roll duplicate instances of the same modifier or notable.

4. **Item Level Gating**:
   - Modifiers require a minimum item level ($ilvl$). An item with $ilvl < \text{req}$ cannot roll that modifier.
   - For example, T1 Maximum Energy Shield (`ilvl 84`), T1 35% Effect (`ilvl 84`), and T1 Intelligence (`ilvl 84`) require $ilvl \ge 84$.

5. **Base Size & spawnTags Handling**:
   - In `data/poedb-cluster-mods.json`, `baseMods` is already segmented by base jewel size (`Large Cluster Jewel`, `Medium Cluster Jewel`, `Small Cluster Jewel`).
   - `spawnTags` contains values like `expansion_jewel_large`, `expansion_jewel_medium`, `expansion_jewel_small`, or `default`.
   - `default` is a universal wildcard (e.g. 25% and 35% increased Effect mods carry `spawnTags: ["default"]`). `spawnTags` must NOT be used as an exclusionary filter that drops `default` mods.

6. **Dynamic Pool Probability & Weights**:
   - Modifiers roll based on relative weights in the currently available and eligible pool.
   - Static displayed percentages in scraper tables are invalid once specific mods are present or blocked.
   - $P(\text{mod}_i) = \frac{W_i}{\sum_{j \in \text{eligible}} W_j}$.
   - Prefix and Suffix pools are distinct; an action adding a Prefix rolls only among eligible prefixes.

7. **Orb of Annulment**:
   - Uniformly selects 1 non-fractured explicit modifier from all currently present non-fractured explicit modifiers.
   - $P(\text{annul target}) = \frac{1}{\text{removable non-fractured affixes}}$.
   - Fractured modifiers cannot be removed or targeted by Annulment Orbs or Scouring Orbs.
   - Annulment of modifiers does NOT alter or downgrade the item's rarity.

8. **Fracturing Orb**:
   - Requires an item with exactly 4 or more explicit modifiers (a full Rare Cluster Jewel).
   - Selects uniformly at random 1 modifier among all eligible explicit modifiers to become permanently fractured.
   - For 4 eligible candidates, $P(\text{fracture target}) = \frac{1}{4} = 25\%$.
   - An item can have at most one fractured modifier.
   - Fractured modifiers cannot be rolled off, removed, or changed.

9. **Untargetable Mods (35% Effect)**:
   - "Added Small Passive Skills have 35% increased Effect" (`Powerful`) has empty `tags: []` and empty `craftTags: []`.
   - It cannot be targeted or guaranteed by any Harvest Reforge craft.

10. **Enchantment Modifiers vs Explicit Modifiers (Jewel Sockets & Passives)**:
    - Passive skill count ("Adds 12 Passive Skills"), socket count enchantments ("2 Added Passive Skills are Jewel Sockets"), and small passive grants ("Small Passives grant 12% increased Attack Damage while holding a Shield") are enchantments inherent to the base jewel.
    - Reference Craft B (8-passive Cold) achieves its 3 notables through 3 rolled explicit affixes: Blanketed Snow (Prefix), Prismatic Heart (Prefix), Widespread Destruction (Suffix) on an 8-passive, 2-socket base.

---

## 2. Data-Derived Assumptions & Modeling Decisions

1. **Combined Pool Composition & Denominators**:
   - For a cluster jewel of a specific size and `clusterType` (e.g. `12% increased Cold Damage`), the explicit mod pool is composed of:
     1. The generic `baseMods` for that jewel size matching `ilvl`.
     2. The cluster-type-specific notables and cluster-specific passive tiers listed in `bases[baseType]` matching `ilvl`.
   - Notable `totalWeight` in `poedb-cluster-mods.json` is not split by `genType`. The engine computes per-side (`Prefix` / `Suffix`) sums for notables dynamically and merges them with `baseMods` per-side totals.

2. **Notable & Cluster-Specific Mod Identity & Family Grouping**:
   - Entries in `bases[].notables` belong to two categories:
     - **True Notables** (e.g., *Blanketed Snow*, *Sadist*, *Prismatic Heart*): Uniquely named single-tier passive skills. Grouped by their name to prevent duplicates on the same item.
     - **Tiered Cluster-Specific Passives** (e.g., `"Added Small Passive Skills also grant: 1% / 2% / 3% increased Attack Speed"`): Mod group is normalized by stripping variable numeric values (e.g. `"Added Small Passive Skills also grant: #% increased Attack Speed"`). Tiers are ranked by required $ilvl$ (e.g. ilvl 84 is T1, ilvl 68 is T2, ilvl 1 is T3). Any tier present on an item blocks all other tiers of that family.

3. **Harvest Reforge Tag Matching & Normalization**:
   - For bench crafts in `data/poedb-horticrafting.json`:
     - If `tagClasses` is present (e.g. `["craftingdefences"]`), strip the `crafting` prefix to obtain the target tag (`defences`).
     - If `tagClasses` is empty (e.g. `Reforge Attribute`), fall back to `craft.modTag.toLowerCase()` (`attribute`).
   - Match against modifier `craftTags` in `baseMods` (e.g. `craftTags: ["defences"]` or `craftTags: ["attribute"]`).

4. **Divine Orb Numeric Rerolling & State Key Model**:
   - Integer stat ranges are modeled as discrete uniform distributions over $[V_{\min}, V_{\max}]$, with $K = V_{\max} - V_{\min} + 1$ equally probable values.
   - If the current roll already satisfies the requirement, expected additional Divine Orbs $E = 0$.
   - If the current roll does not satisfy the target, for a target subset of size $S$, expected Divines $E = \frac{K}{S}$.
   - Exact numerical rolls are evaluated as terminal Divine finishing expectations, keeping the core MDP transition state space compact and tractable.

5. **Exalted Orb Side Selection**:
   - When both Prefix and Suffix slots are open, Exalt selects prefix vs suffix weighted by total eligible prefix weight vs total eligible suffix weight.
   - If only one side has open slots, all probability mass is allocated to the open side.

---

## 3. Unverified / Approximated Assumptions (Explicitly Labeled in Solver)

1. **Notable Eligibility in Harvest Reforge Guarantees**:
   - Notables carry generic `tags` (e.g. `defences`, `cold`, `damage`) but no `craftTags`.
   - Tiered cluster passives in notable pools copy their `tags` into `craftTags`.
   - The engine flags Harvest calculations as `approximate` where exact multi-mod joint generation distributions are approximated.

2. **Harvest Multi-Affix Generation Distribution**:
   - Poedb description: "Rerolls a rare item that guarantees a modifier with the respective modTag. 50% chance to roll 3-6 modifiers."
   - For cluster jewels with max 4 affixes (2P / 2S), the distribution rolls 3 or 4 affixes.

---

## 4. Unsupported Mechanics (Out of Scope for v1 Core)

1. Veiled Orbs / Betrayal crafting on Cluster Jewels.
2. Synthesis implicits / corrupted implicit modification.
3. Fossils & Resonators.
4. Beastcrafting.
