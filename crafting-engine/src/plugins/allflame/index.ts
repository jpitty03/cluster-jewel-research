import type { CraftingPlugin } from '../Plugin.ts';
import type { CraftAction, CraftOutcome, CurrencyCost, SolverContext } from '../../domain/CraftAction.ts';
import type { ItemState } from '../../domain/ItemState.ts';
import { consolidateOutcomes } from '../../domain/CraftResult.ts';
import {
  evaluateTargetProgress,
  getAllTargetModRequirements,
  matchesModRequirement,
} from '../../domain/TargetDefinition.ts';

export class AllflamePlugin implements CraftingPlugin {
  readonly id = 'allflame';
  readonly name = 'Necropolis Allflame Ember';
  enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  transformActions(actions: CraftAction[], _context: SolverContext): CraftAction[] {
    if (!this.enabled) return actions;

    return actions.map((action) => {
      if (action.id === 'exalt') {
        return new AllflameExaltAction(action);
      }
      return action;
    });
  }
}

export class AllflameExaltAction implements CraftAction {
  readonly id = 'allflame_exalt';
  readonly name = 'Allflame Exalted Orb (Best of 4)';
  private baseAction: CraftAction;

  constructor(baseAction: CraftAction) {
    this.baseAction = baseAction;
  }

  isAvailable(state: ItemState, context: SolverContext): boolean {
    return this.baseAction.isAvailable(state, context);
  }

  cost(state: ItemState, context: SolverContext): CurrencyCost {
    return this.baseAction.cost(state, context);
  }

  outcomes(state: ItemState, context: SolverContext): CraftOutcome[] {
    const baseOutcomes = this.baseAction.outcomes(state, context);
    if (baseOutcomes.length === 0) return [];

    const target = context.target;

    // Evaluate target progress for each outcome relative to parent state
    const scoredOutcomes = baseOutcomes.map((o) => {
      let score = 0;
      if (target) {
        const progress = evaluateTargetProgress(o.state, target);
        const satisfiedCount = progress.required.matchedRequirementIds.length +
          (progress.acceptable.satisfied ? 1 : 0);

        // Check if the newly added mod was a target mod
        const newMod = [...o.state.prefixes, ...o.state.suffixes].slice(-1)[0];
        const isTargetMod = newMod ? getAllTargetModRequirements(target)
          .some((requirement) => matchesModRequirement(newMod, requirement)) : false;

        // Higher progress score = lower cost (better)
        score = -(satisfiedCount * 100 + (isTargetMod ? 50 : 0));
      }
      return { ...o, score };
    });

    // Sort from best (lowest score) to worst (highest score)
    scoredOutcomes.sort((a, b) => a.score - b.score);

    // Apply exact order statistics for Best of 4:
    // P(best of 4 is item i) = (1 - S_{i-1})^4 - (1 - S_i)^4 where S_i = sum_{j=1}^i p_j
    let prefixSum = 0;
    const transformedOutcomes: CraftOutcome[] = [];

    for (let i = 0; i < scoredOutcomes.length; i++) {
      const pCurrent = scoredOutcomes[i].probability;
      const prevPrefix = prefixSum;
      prefixSum += pCurrent;

      const pBestOf4 = Math.pow(1 - prevPrefix, 4) - Math.pow(1 - prefixSum, 4);

      transformedOutcomes.push({
        probability: Math.max(0, pBestOf4),
        state: scoredOutcomes[i].state,
        description: `[Allflame Best-of-4] ${scoredOutcomes[i].description}`,
      });
    }

    return consolidateOutcomes(transformedOutcomes);
  }
}
