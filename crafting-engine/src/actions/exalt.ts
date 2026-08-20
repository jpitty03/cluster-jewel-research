import type { CraftAction, CraftOutcome, CurrencyCost, SolverContext } from '../domain/CraftAction.ts';
import type { ItemState } from '../domain/ItemState.ts';
import { cloneItemState } from '../domain/ItemState.ts';
import { toRolledMod } from '../domain/Mod.ts';
import { hasOpenAffixSlot } from '../rules/affixRules.ts';
import { getEligibleMods, calculateTotalWeight } from '../rules/modEligibility.ts';
import { consolidateOutcomes } from '../domain/CraftResult.ts';

export class ExaltAction implements CraftAction {
  readonly id = 'exalt';
  readonly name = 'Exalted Orb';

  isAvailable(state: ItemState, context: SolverContext): boolean {
    if (state.rarity !== 'rare') return false;
    if (!hasOpenAffixSlot(state)) return false;
    const eligible = getEligibleMods(state, context.pool.getAllMods());
    return eligible.length > 0;
  }

  cost(_state: ItemState, _context: SolverContext): CurrencyCost {
    return { exalt: 1 };
  }

  outcomes(state: ItemState, context: SolverContext): CraftOutcome[] {
    const eligibleMods = getEligibleMods(state, context.pool.getAllMods());
    const totalWeight = calculateTotalWeight(eligibleMods);

    if (totalWeight <= 0) {
      return [];
    }

    const rawOutcomes: CraftOutcome[] = eligibleMods.map((mod) => {
      const p = mod.weight / totalWeight;
      const nextState = cloneItemState(state);
      const rolled = toRolledMod(mod);

      if (mod.genType === 'Prefix') {
        nextState.prefixes.push(rolled);
      } else {
        nextState.suffixes.push(rolled);
      }

      return {
        probability: p,
        state: nextState,
        description: `Exalt slammed ${mod.name} (${mod.genType})`,
      };
    });

    return consolidateOutcomes(rawOutcomes);
  }
}
