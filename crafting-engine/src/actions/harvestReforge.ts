import type { CraftAction, CraftOutcome, CurrencyCost, SolverContext } from '../domain/CraftAction.ts';
import type { ItemState } from '../domain/ItemState.ts';
import { cloneItemState } from '../domain/ItemState.ts';
import type { Mod } from '../domain/Mod.ts';
import { toRolledMod } from '../domain/Mod.ts';
import { getEligibleMods, calculateTotalWeight } from '../rules/modEligibility.ts';
import { consolidateOutcomes } from '../domain/CraftResult.ts';
import { HorticraftingRepository } from '../data/loadHorticrafting.ts';

const TAG_NORMALIZATION: Record<string, string> = {
  defence: 'defences',
  defences: 'defences',
  attribute: 'attribute',
  attributes: 'attribute',
  life: 'life',
  cold: 'cold',
  fire: 'fire',
  lightning: 'lightning',
  physical: 'physical',
  chaos: 'chaos',
  attack: 'attack',
  speed: 'speed',
  caster: 'caster',
  critical: 'critical',
};

export class HarvestReforgeAction implements CraftAction {
  readonly id: string;
  readonly name: string;
  readonly targetTag: string;
  readonly normalizedTag: string;
  readonly isApproximate: boolean = true;
  private hortiRepo = new HorticraftingRepository();

  constructor(targetTag: string) {
    this.targetTag = targetTag;
    this.normalizedTag = TAG_NORMALIZATION[targetTag.toLowerCase()] ?? targetTag.toLowerCase();
    this.id = `harvest_reforge_${this.normalizedTag}`;
    this.name = `Harvest Reforge ${targetTag}`;
  }

  isAvailable(state: ItemState, _context: SolverContext): boolean {
    return state.rarity === 'rare';
  }

  cost(_state: ItemState, _context: SolverContext): CurrencyCost {
    const craft = this.hortiRepo.getReforgeCraft(this.targetTag);
    if (!craft) {
      // Default fallback cost if bench craft entry not found
      return { primalLifeforce: 75 };
    }

    const result: CurrencyCost = {};
    if (craft.lifeforce) {
      if (craft.lifeforce.type === 'Wild') result.wildLifeforce = craft.lifeforce.amount;
      if (craft.lifeforce.type === 'Vivid') result.vividLifeforce = craft.lifeforce.amount;
      if (craft.lifeforce.type === 'Primal') result.primalLifeforce = craft.lifeforce.amount;
    }

    const rancour = craft.cost.find((c) => c.item.includes('Rancour'));
    if (rancour) {
      result.crystallisedRancour = rancour.amount;
    }

    return result;
  }

  outcomes(state: ItemState, context: SolverContext): CraftOutcome[] {
    // 1. Base clean state with fractured mods preserved
    const baseCleanState = cloneItemState(state);
    baseCleanState.prefixes = baseCleanState.prefixes.filter((m) => m.isFractured);
    baseCleanState.suffixes = baseCleanState.suffixes.filter((m) => m.isFractured);

    // 2. Find eligible mods with the target tag
    const allEligible = getEligibleMods(baseCleanState, context.pool.getAllMods(), { filterBySlotCapacity: false });
    const taggedMods = allEligible.filter((m) =>
      m.craftTags.includes(this.normalizedTag) || m.tags.includes(this.normalizedTag)
    );

    const totalTaggedWeight = calculateTotalWeight(taggedMods);
    if (totalTaggedWeight === 0) {
      return [];
    }

    // 3. For each guaranteed tagged mod outcome:
    const rawOutcomes: CraftOutcome[] = [];

    for (const taggedMod of taggedMods) {
      const pGuaranteed = taggedMod.weight / totalTaggedWeight;

      const nextState = cloneItemState(baseCleanState);
      const rolled = toRolledMod(taggedMod);

      if (taggedMod.genType === 'Prefix') {
        nextState.prefixes.push(rolled);
      } else {
        nextState.suffixes.push(rolled);
      }

      rawOutcomes.push({
        probability: pGuaranteed,
        state: nextState,
        description: `Harvest Reforge guaranteed ${taggedMod.name} (${taggedMod.genType}) [approximate clean branch]`,
      });
    }

    return consolidateOutcomes(rawOutcomes);
  }

  getTaggedMods(state: ItemState, pool: Mod[]): Mod[] {
    const eligible = getEligibleMods(state, pool, { filterBySlotCapacity: false });
    return eligible.filter((m) =>
      m.craftTags.includes(this.normalizedTag) || m.tags.includes(this.normalizedTag)
    );
  }
}
