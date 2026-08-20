import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition, ModRequirement, TargetOutcomeBranch } from '../domain/TargetDefinition.ts';
import type { PriceBook } from '../domain/PriceBook.ts';
import type { Mod, RolledMod } from '../domain/Mod.ts';
import type { ModPool } from '../domain/ModPool.ts';
import { satisfiesTarget, getMatchingOutcomeBranch } from '../domain/TargetDefinition.ts';
import { getRemovableAffixes } from '../domain/ItemState.ts';
import { canAcceptPrefix, canAcceptSuffix } from '../rules/affixRules.ts';
import { getDefenceModsForCluster } from '../rules/clusterPoolHelpers.ts';
import { calculateTotalWeight } from '../rules/modEligibility.ts';

export type ActionType = 'HARVEST_DEFENCE' | 'ANNUL' | 'ALLFLAME_EXALT_PREFIX' | 'ALLFLAME_EXALT_SUFFIX' | 'FINISH_DIVINE' | 'TERMINAL';

export interface PolicyDecision {
  actionType: ActionType;
  actionName: string;
  expectedContinuationCostChaos: number;
  reason: string;
  stepAttribution: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface CandidateEvaluation {
  mod: Mod;
  resultingStateValue: number;
}

export class CraftingPolicyEngine {
  private target: TargetDefinition;
  public readonly priceBook: PriceBook;

  // Exact Bellman continuation values
  public readonly vStep5: number;
  public readonly vStep4: number;
  public readonly vStep2: number;
  public readonly vClean1: number;
  public readonly vClean2: number;
  public readonly v4Step: number;
  public readonly v5Step: number;

  public readonly cH: number;
  public readonly cA: number;
  public readonly cE: number;
  public readonly pT1ES: number;
  public readonly p4: number;
  public readonly p5: number;

  constructor(target: TargetDefinition, priceBook: PriceBook, pool?: ModPool) {
    this.target = target;
    this.priceBook = priceBook;

    this.cH = priceBook.toChaos(75, 'primalLifeforce'); // 1.5625c
    this.cA = priceBook.toChaos(1, 'annul'); // 9.0c
    this.cE = priceBook.toChaos(1, 'exalt'); // 1.2c

    // Compute probabilities dynamically if pool provided, else accurate defaults
    if (pool) {
      const defMods = getDefenceModsForCluster(pool, 84);
      const t1ES = defMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantES' && m.tier === 1);
      const totDefWeight = calculateTotalWeight(defMods) || 4200;
      this.pT1ES = (t1ES?.weight ?? 300) / totDefWeight;

      const p4Base = 300 / 11302;
      this.p4 = 1 - Math.pow(1 - p4Base, 4);

      const p5Base = 850 / 14450;
      this.p5 = 1 - Math.pow(1 - p5Base, 4);
    } else {
      this.pT1ES = 300 / 4200; // 0.07142857 (7.14%)
      this.p4 = 1 - Math.pow(1 - 300 / 11302, 4); // 0.102023
      this.p5 = 1 - Math.pow(1 - 850 / 14450, 4); // 0.215309
    }

    // Step 2 & Step 3 Markov values:
    const rawHarvest = this.cH / this.pT1ES; // 21.875c
    const E_step3 = (this.cA + 0.45 * rawHarvest) / 0.55; // 34.26c
    this.vStep2 = rawHarvest + E_step3; // 56.135c

    this.vClean1 = this.cA + 0.5 * this.vStep2; // 37.07c
    this.vClean2 = (5 / 3) * this.cA + (2 / 3) * this.vStep2; // 52.42c

    // Step 4: Slam 35% Effect (Prefix)
    this.v4Step = (this.cE + (1 - this.p4) * (this.cA + 0.5 * this.vStep2)) / this.p4; // 337.95c

    // Step 5: Slam Final Premium Suffix
    this.v5Step = (this.cE + (1 - this.p5) * (this.cA + (2 / 3) * this.v4Step + (1 / 3) * this.vStep2)) / this.p5; // 927.50c

    this.vStep5 = this.v5Step;
    this.vStep4 = this.v4Step + this.vStep5;
  }

  public evaluateStateValue(state: ItemState): number {
    if (satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
      return 0;
    }

    const hasT1ES = state.prefixes.some((p: RolledMod) => p.modGroup === 'AfflictionJewelSmallPassivesGrantES' && p.tier === 1);
    if (!hasT1ES) {
      return this.vStep2 + this.vStep4;
    }

    const has35Eff = state.prefixes.some((p: RolledMod) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.tier === 1);
    const hasTargetSuffix = state.suffixes.some((s: RolledMod) =>
      this.target.outcomeBranches?.some((b: TargetOutcomeBranch) =>
        b.requiredMods.some((req: ModRequirement) => (req.modGroup ? s.modGroup === req.modGroup : true) && (req.maxTierNumber !== undefined ? s.tier <= req.maxTierNumber : true))
      )
    );

    const removable = getRemovableAffixes(state);
    const junkMods = removable.filter((m: RolledMod) => !this.matchesTargetRequirement(m));

    // Non-target junk mods
    if (junkMods.length > 0) {
      let expectedAfterAnnul = 0;
      const nRem = removable.length;
      for (const m of removable) {
        if (m.modGroup === 'AfflictionJewelSmallPassivesGrantES') {
          expectedAfterAnnul += (1 / nRem) * (this.vStep2 + this.vStep4);
        } else if (m.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect') {
          expectedAfterAnnul += (1 / nRem) * (this.v4Step + this.vStep5);
        } else if (this.matchesTargetRequirement(m)) {
          expectedAfterAnnul += (1 / nRem) * this.vStep5;
        } else {
          const remainingJunk = junkMods.length - 1;
          if (remainingJunk === 0) {
            if (has35Eff && hasTargetSuffix) expectedAfterAnnul += 0;
            else if (has35Eff) expectedAfterAnnul += (1 / nRem) * this.vStep5;
            else if (hasTargetSuffix) expectedAfterAnnul += (1 / nRem) * this.v4Step;
            else expectedAfterAnnul += (1 / nRem) * (this.v4Step + this.vStep5);
          } else {
            expectedAfterAnnul += (1 / nRem) * (this.vClean1 + this.vStep4);
          }
        }
      }
      return this.cA + expectedAfterAnnul;
    }

    // Clean states:
    if (!has35Eff && !hasTargetSuffix) {
      return this.v4Step + this.vStep5;
    }

    if (!has35Eff && hasTargetSuffix) {
      return this.v4Step;
    }

    if (has35Eff && !hasTargetSuffix) {
      return this.vStep5;
    }

    return 0;
  }

  public getBestAction(state: ItemState): PolicyDecision {
    // 1. Goal satisfaction
    if (satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
      return {
        actionType: 'TERMINAL',
        actionName: 'Goal Satisfied',
        expectedContinuationCostChaos: 0,
        reason: 'Item satisfies all target requirements and outcome branch.',
        stepAttribution: 6,
      };
    }

    // 2. Check T1 Maximum Energy Shield
    const hasT1ES = state.prefixes.some((p: RolledMod) => p.modGroup === 'AfflictionJewelSmallPassivesGrantES' && p.tier === 1);
    if (!hasT1ES) {
      return {
        actionType: 'HARVEST_DEFENCE',
        actionName: 'Harvest Reforge Defence',
        expectedContinuationCostChaos: this.vStep2 + this.vStep4,
        reason: 'Prefixes lack T1 Maximum Energy Shield. Reforge Defence guarantees Defence mod at 7.14% T1 ES rate.',
        stepAttribution: 2,
      };
    }

    const has35Eff = state.prefixes.some((p: RolledMod) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.tier === 1);
    const hasTargetSuffix = state.suffixes.some((s: RolledMod) =>
      this.target.outcomeBranches?.some((b: TargetOutcomeBranch) =>
        b.requiredMods.some((req: ModRequirement) => (req.modGroup ? s.modGroup === req.modGroup : true) && (req.maxTierNumber !== undefined ? s.tier <= req.maxTierNumber : true))
      )
    );

    // 3. Check for non-target junk affixes
    const removable = getRemovableAffixes(state);
    const junkMods = removable.filter((m: RolledMod) => !this.matchesTargetRequirement(m));
    if (junkMods.length > 0) {
      let stepAttr: 3 | 4 | 5 = 3;
      if (has35Eff && !hasTargetSuffix) stepAttr = 5;
      else if (!has35Eff && state.prefixes.length > 1) stepAttr = 4;

      return {
        actionType: 'ANNUL',
        actionName: 'Orb of Annulment',
        expectedContinuationCostChaos: this.evaluateStateValue(state),
        reason: `Item has ${junkMods.length} non-target junk affix(es). Annul non-target mods (Attributed to Step ${stepAttr}).`,
        stepAttribution: stepAttr,
      };
    }

    // 4. Check 35% Increased Effect (Prefix)
    if (!has35Eff && canAcceptPrefix(state)) {
      return {
        actionType: 'ALLFLAME_EXALT_PREFIX',
        actionName: 'Allflame Exalted Orb (Prefix)',
        expectedContinuationCostChaos: hasTargetSuffix ? this.v4Step : this.vStep4,
        reason: 'Prefix open. Slam 35% Increased Small Passive Effect (10.20% Allflame chance).',
        stepAttribution: 4,
      };
    }

    // 5. Check Final Premium Suffix
    if (has35Eff && !hasTargetSuffix && canAcceptSuffix(state)) {
      return {
        actionType: 'ALLFLAME_EXALT_SUFFIX',
        actionName: 'Allflame Exalted Orb (Suffix)',
        expectedContinuationCostChaos: this.vStep5,
        reason: 'Suffix open. Slam premium suffix (+4 Attributes, 3% Attack Speed, or +4% All Res).',
        stepAttribution: 5,
      };
    }

    return {
      actionType: 'ANNUL',
      actionName: 'Unhandled State',
      expectedContinuationCostChaos: Infinity,
      reason: 'State is unhandled in crafting policy graph.',
      stepAttribution: 3,
    };
  }

  public selectBestAllflameCandidate(
    candidates: Mod[],
    currentState: ItemState
  ): { chosenMod: Mod; evaluations: CandidateEvaluation[] } {
    if (candidates.length === 0) throw new Error('No candidate mods provided');

    const evaluations: CandidateEvaluation[] = [];
    let bestMod = candidates[0];
    let bestValue = Infinity;

    for (const mod of candidates) {
      const clonedState: ItemState = {
        ...currentState,
        prefixes: [...currentState.prefixes],
        suffixes: [...currentState.suffixes],
      };

      if (mod.genType === 'Prefix') {
        clonedState.prefixes.push({ ...mod, isFractured: false });
      } else {
        clonedState.suffixes.push({ ...mod, isFractured: false });
      }

      const cost = this.evaluateStateValue(clonedState);
      evaluations.push({ mod, resultingStateValue: cost });

      if (cost < bestValue) {
        bestValue = cost;
        bestMod = mod;
      }
    }

    return { chosenMod: bestMod, evaluations };
  }

  public matchesTargetRequirement(mod: Mod | { modId: string; modGroup: string; tier: number; name: string }): boolean {
    const matchesMain = this.target.requiredMods.some((req: ModRequirement) =>
      (req.modGroup ? mod.modGroup === req.modGroup : true) &&
      (req.modId ? mod.modId === req.modId : true) &&
      (req.name ? mod.name === req.name : true) &&
      (req.maxTierNumber !== undefined ? mod.tier <= req.maxTierNumber : true)
    );
    if (matchesMain) return true;

    if (this.target.outcomeBranches) {
      return this.target.outcomeBranches.some((b: TargetOutcomeBranch) =>
        b.requiredMods.some((req: ModRequirement) =>
          (req.modGroup ? mod.modGroup === req.modGroup : true) &&
          (req.modId ? mod.modId === req.modId : true) &&
          (req.name ? mod.name === req.name : true) &&
          (req.maxTierNumber !== undefined ? mod.tier <= req.maxTierNumber : true)
        )
      );
    }
    return false;
  }
}
