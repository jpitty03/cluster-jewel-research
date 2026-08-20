import type { CraftAction, CraftOutcome, CurrencyCost, SolverContext } from '../domain/CraftAction.ts';
import type { ItemState } from '../domain/ItemState.ts';
import { cloneItemState, getAllAffixes } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';

export class DivineAction implements CraftAction {
  readonly id = 'divine';
  readonly name = 'Divine Orb';

  isAvailable(state: ItemState, _context: SolverContext): boolean {
    const affixes = getAllAffixes(state);
    return affixes.some((m) => m.statValues.some((s) => s.min < s.max));
  }

  cost(_state: ItemState, _context: SolverContext): CurrencyCost {
    return { divine: 1 };
  }

  outcomes(state: ItemState, context: SolverContext): CraftOutcome[] {
    const target = context.target;
    if (!target || !target.finalRollRequirements || target.finalRollRequirements.length === 0) {
      return [
        {
          probability: 1.0,
          state: cloneItemState(state),
          description: 'Divine Orb rerolled numeric values',
        },
      ];
    }

    // Produce next state satisfying all roll requirements
    const nextState = cloneItemState(state);
    for (const rollReq of target.finalRollRequirements) {
      const match = [...nextState.prefixes, ...nextState.suffixes].find(
        (m) =>
          (rollReq.modGroup ? m.modGroup === rollReq.modGroup : true) &&
          (rollReq.modId ? m.modId === rollReq.modId : true) &&
          (rollReq.name ? m.name === rollReq.name : true)
      );

      if (match) {
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

      if (!match) continue;

      const statIndex = rollReq.statIndex ?? 0;
      const range = match.statValues[statIndex];
      if (!range || range.min >= range.max) continue;

      const currentVal = match.currentRoll?.[statIndex];
      const totalPossibleValues = range.max - range.min + 1;
      const acceptableValuesCount = Math.max(0, range.max - rollReq.minValue + 1);

      if (currentVal !== undefined && currentVal >= rollReq.minValue) {
        // Current value already satisfies this requirement
        continue;
      }

      anyNeedsReroll = true;
      const singleRequirementSuccessChance = acceptableValuesCount / totalPossibleValues;
      jointSuccessProbability *= singleRequirementSuccessChance;
    }

    if (!anyNeedsReroll) {
      return 0;
    }

    if (jointSuccessProbability <= 0) {
      return 1e6; // Unsatisfiable roll requirement
    }

    // Geometric distribution expectation = 1 / p
    return 1 / jointSuccessProbability;
  }
}
