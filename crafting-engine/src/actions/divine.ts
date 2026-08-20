import type { CraftAction, SolverContext, CraftOutcome, CurrencyCost } from '../domain/CraftAction.ts';
import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import { cloneItemState, getAllAffixes } from '../domain/ItemState.ts';

export class DivineAction implements CraftAction {
  id = 'divine_orb';
  name = 'Divine Orb';

  isAvailable(state: ItemState): boolean {
    return state.rarity === 'rare';
  }

  cost(): CurrencyCost {
    return { divine: 1 };
  }

  outcomes(state: ItemState, context: SolverContext): CraftOutcome[] {
    const target = context.target;
    if (!target || !target.finalRollRequirements || target.finalRollRequirements.length === 0) {
      return [
        {
          probability: 1.0,
          state: cloneItemState(state),
          description: 'Divine Orb rerolled explicit numeric values',
        },
      ];
    }

    const nextState = cloneItemState(state);
    for (const rollReq of target.finalRollRequirements) {
      const match = [...nextState.prefixes, ...nextState.suffixes].find(
        (m) =>
          (rollReq.modGroup ? m.modGroup === rollReq.modGroup : true) &&
          (rollReq.modId ? m.modId === rollReq.modId : true) &&
          (rollReq.name ? m.name === rollReq.name : true)
      );

      if (match && rollReq.minValue !== undefined) {
        const statIdx = rollReq.statIndex ?? 0;
        if (!match.currentRoll) {
          match.currentRoll = match.statValues.map((s) => s.min);
        }
        match.currentRoll[statIdx] = rollReq.minValue;
      }
    }

    return [
      {
        probability: 1.0,
        state: nextState,
        description: 'Divine Orb achieved desired roll ranges',
      },
    ];
  }

  calculateExpectedFinishingCost(state: ItemState, target: TargetDefinition): number {
    if (!target.finalRollRequirements || target.finalRollRequirements.length === 0) {
      return 0;
    }

    const affixes = getAllAffixes(state);
    let jointSuccessProbability = 1.0;
    let anyNeedsReroll = false;

    for (const rollReq of target.finalRollRequirements) {
      const match = affixes.find(
        (m) =>
          (rollReq.modGroup ? m.modGroup === rollReq.modGroup : true) &&
          (rollReq.modId ? m.modId === rollReq.modId : true) &&
          (rollReq.name ? m.name === rollReq.name : true)
      );

      if (!match || rollReq.minValue === undefined) continue;

      const statIndex = rollReq.statIndex ?? 0;
      const range = match.statValues[statIndex];
      if (!range || range.min >= range.max || range.max < rollReq.minValue) {
        continue;
      }

      const currentVal = match.currentRoll?.[statIndex];
      const totalPossibleValues = range.max - range.min + 1;
      const acceptableValuesCount = Math.max(0, range.max - rollReq.minValue + 1);

      if (currentVal !== undefined && currentVal >= rollReq.minValue) {
        continue;
      }

      anyNeedsReroll = true;
      const singleRequirementSuccessChance = acceptableValuesCount / totalPossibleValues;
      jointSuccessProbability *= singleRequirementSuccessChance;
    }

    if (!anyNeedsReroll) {
      return 0;
    }

    return jointSuccessProbability > 0 ? 1 / jointSuccessProbability : Infinity;
  }
}
