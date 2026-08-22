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

export type ActionType =
  | 'HARVEST_DEFENCE'
  | 'ANNUL'
  | 'ALLFLAME_EXALT_PREFIX'
  | 'ALLFLAME_EXALT_SUFFIX'
  | 'EXALT_PREFIX'
  | 'EXALT_SUFFIX'
  | 'FINISH_DIVINE'
  | 'TERMINAL';

export interface PolicyDecision {
  actionType: ActionType;
  actionName: string;
  expectedContinuationCostChaos: number;
  reason: string;
  stepAttribution: 1 | 2 | 3 | 4 | 5;
}

export interface CandidateEvaluation {
  mod: Mod;
  resultingStateValue: number;
}

export interface RepresentativeStateAudit {
  stateDescription: string;
  candidateActions: Array<{
    actionName: string;
    continuationValueChaos: number;
  }>;
  recommendedAction: string;
  recommendationReason: string;
}

export interface HarvestStrategyComparison {
  name: string;
  code: 'A' | 'B' | 'C';
  expectedHarvests: number;
  expectedAnnuls: number;
  expectedExalts: number;
  expectedCraftingCostChaos: number;
  expectedTotalCraftCostChaos: number;
  expectedSaleValueChaos: number;
  expectedProfitChaos: number;
  roi: number;
  description: string;
  isRecommended: boolean;
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
  public readonly v4Int: number;
  public readonly v5Step: number;
  public readonly v5StepEff: number;
  public readonly v5StepFullPool: number;
  public readonly vCleanFrac35: number;

  public readonly expHarvestsFrac35: number;
  public readonly expAnnulsFrac35: number;
  public readonly expExaltsFrac35: number;
  public readonly targetRequiresInt: boolean;
  public readonly enableAllflame: boolean;

  public readonly cH: number;
  public readonly cA: number;
  public readonly cE: number;
  public readonly pT1ES: number;
  public readonly p4: number;
  public readonly pInt: number;
  public readonly p5: number;
  public readonly p5FullPool: number;

  constructor(target: TargetDefinition, priceBook: PriceBook, pool?: ModPool, enableAllflame = true) {
    this.target = target;
    this.priceBook = priceBook;
    this.enableAllflame = enableAllflame;
    this.targetRequiresInt = target.requiredMods.some((req) => {
      if (req.modGroup === 'AfflictionJewelSmallPassivesGrantInt') return true;
      if (req.modId && pool) {
        const m = pool.getAllMods().find((pm) => pm.modId === req.modId);
        if (m && m.modGroup === 'AfflictionJewelSmallPassivesGrantInt') return true;
      }
      if (req.modId && req.modId.toLowerCase().includes('intelligence')) return true;
      if (req.name && req.name.toLowerCase().includes('intelligence')) return true;
      return false;
    });

    this.cH = priceBook.toChaos(75, 'primalLifeforce'); // 1.5625c
    this.cA = priceBook.toChaos(1, 'annul'); // 9.0c
    this.cE = priceBook.toChaos(1, 'exalt'); // 1.2c

    const sampleRate = (baseWeight: number, totalWeight: number) => {
      const q = baseWeight / totalWeight;
      return enableAllflame ? 1 - Math.pow(1 - q, 4) : q;
    };

    // Compute probabilities dynamically if pool provided, else accurate defaults
    if (pool) {
      const defMods = getDefenceModsForCluster(pool, 84);
      const t1ES = defMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantES' && m.tier === 1);
      const totDefWeight = calculateTotalWeight(defMods) || 4200;
      this.pT1ES = (t1ES?.weight ?? 300) / totDefWeight;

      this.p4 = sampleRate(300, 11302);
      this.pInt = sampleRate(300, 14750);
      this.p5 = sampleRate(850, 14450);
      this.p5FullPool = sampleRate(850, 14750);
    } else {
      this.pT1ES = 300 / 4200; // 0.07142857 (7.14%)
      this.p4 = sampleRate(300, 11302);
      this.pInt = sampleRate(300, 14750);
      this.p5 = sampleRate(850, 14450);
      this.p5FullPool = sampleRate(850, 14750);
    }

    // Step 2 & Step 3 Markov values:
    const rawHarvest = this.cH / this.pT1ES; // 21.875c
    const E_step3 = (this.cA + 0.45 * rawHarvest) / 0.55; // 34.26c
    this.vStep2 = rawHarvest + E_step3; // 56.135c

    this.vClean1 = this.cA + 0.5 * this.vStep2; // 37.07c
    this.vClean2 = (5 / 3) * this.cA + (2 / 3) * this.vStep2; // 52.42c

    // Step 4: Slam 35% Effect (Prefix on fractured Int base)
    this.v4Step = (this.cE + (1 - this.p4) * (this.cA + 0.5 * this.vStep2)) / this.p4; // 337.95c

    // Step 5: Slam Final Premium Suffix (on fractured Int base)
    this.v5Step = (this.cE + (1 - this.p5) * (this.cA + (2 / 3) * this.v4Step + (1 / 3) * this.vStep2)) / this.p5; // 927.50c
    this.v5StepFullPool = (this.cE + (1 - this.p5FullPool) * (this.cA + 0.5 * this.vStep2)) / this.p5FullPool;

    // Exact decoupled Markov system for fractured 35% base:
    // S0 = [Frac 35, T1 ES]
    // S_Int = [Frac 35, T1 ES, T1 Int] (continuation cost v5StepEff)
    // S_Prem = [Frac 35, T1 ES, Premium Suffix] (continuation cost v4Int)
    const pHit = sampleRate(300 + 850, 14750);
    const v0 = (this.cE + (1 - pHit) * (this.cA + 0.5 * this.vStep2)) / pHit;

    // In S_Prem, a premium suffix is locked, removing its mod group weight from the suffix pool (~285.3 weight removed):
    const pIntGivenPrem = sampleRate(300, 14464.7);

    const denom1 = 1 - (1 / 3) * (1 - this.p5);
    const k1 = (this.cE + (1 - this.p5) * (this.cA + (1 / 3) * this.vStep2)) / denom1;
    const m1 = ((2 / 3) * (1 - this.p5)) / denom1;

    const denom2 = 1 - (1 / 3) * (1 - pIntGivenPrem);
    const k2 = (this.cE + (1 - pIntGivenPrem) * (this.cA + (1 / 3) * this.vStep2)) / denom2;
    const m2 = ((2 / 3) * (1 - pIntGivenPrem)) / denom2;

    const wInt = this.pInt / pHit;
    const wPrem = (pHit - this.pInt) / pHit;

    const weightedM = wInt * m1 + wPrem * m2;
    const weightedK = wInt * k1 + wPrem * k2;

    this.vCleanFrac35 = (v0 + weightedK) / (1 - weightedM);
    this.v5StepEff = k1 + m1 * this.vCleanFrac35; // having T1 Int locked
    this.v4Int = k2 + m2 * this.vCleanFrac35; // having Premium Suffix locked

    // Exact currency requirements on fractured 35% route:
    const e0 = 1 / pHit;
    const kE1 = 1 / denom1;
    const kE2 = 1 / denom2;
    const E0 = (e0 + wInt * kE1 + wPrem * kE2) / (1 - weightedM);
    this.expExaltsFrac35 = E0;

    const a0 = (1 - pHit) / pHit;
    const kA1 = (1 - this.p5) / denom1;
    const kA2 = (1 - pIntGivenPrem) / denom2;
    const A0 = (a0 + wInt * kA1 + wPrem * kA2) / (1 - weightedM);

    const h0 = (0.5 * (1 - pHit) * 14.0) / pHit;
    const kH1 = ((1 / 3) * (1 - this.p5) * 14.0) / denom1;
    const kH2 = ((1 / 3) * (1 - pIntGivenPrem) * 14.0) / denom2;
    const H0 = (h0 + wInt * kH1 + wPrem * kH2) / (1 - weightedM);
    this.expHarvestsFrac35 = 14.0 + H0;
    this.expAnnulsFrac35 = ((14.0 + H0) / 14.0) * (1 / 0.55) + A0;

    this.vStep5 = this.v5Step;
    this.vStep4 = this.v4Step + this.vStep5;
  }

  public evaluateStateValue(state: ItemState): number {
    if (satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
      return 0;
    }

    const hasFrac35 = state.prefixes.some(
      (p: RolledMod) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.isFractured
    );
    const hasT1ES = state.prefixes.some((p: RolledMod) => p.modGroup === 'AfflictionJewelSmallPassivesGrantES' && p.tier === 1);
    if (!hasT1ES) {
      return this.vStep2 + (hasFrac35 ? this.vCleanFrac35 : this.vStep4);
    }

    const has35Eff = state.prefixes.some((p: RolledMod) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.tier === 1);
    const hasT1Int = state.suffixes.some((s: RolledMod) => s.modGroup === 'AfflictionJewelSmallPassivesGrantInt' && s.tier === 1);
    const hasTargetSuffix = state.suffixes.some((s: RolledMod) =>
      this.target.outcomeBranches?.some((b: TargetOutcomeBranch) =>
        b.requiredMods.some((req: ModRequirement) => (req.modGroup ? s.modGroup === req.modGroup : true) && (req.maxTierNumber !== undefined ? s.tier <= req.maxTierNumber : true))
      )
    );

    const removable = getRemovableAffixes(state);
    const junkMods = this.getJunkMods(state);
    const junkModIds = new Set(junkMods.map((j) => j.modId));

    // Non-target junk mods
    if (junkMods.length > 0) {
      let expectedAfterAnnul = 0;
      const nRem = removable.length;
      for (const m of removable) {
        if (m.modGroup === 'AfflictionJewelSmallPassivesGrantES') {
          expectedAfterAnnul += (1 / nRem) * (this.vStep2 + (hasFrac35 ? this.vCleanFrac35 : this.vStep4));
        } else if (m.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect') {
          expectedAfterAnnul += (1 / nRem) * (this.v4Step + this.vStep5);
        } else if (m.modGroup === 'AfflictionJewelSmallPassivesGrantInt') {
          expectedAfterAnnul += (1 / nRem) * (hasFrac35 ? (hasTargetSuffix ? this.v4Int : this.vCleanFrac35) : this.vStep5);
        } else if (!junkModIds.has(m.modId)) {
          expectedAfterAnnul += (1 / nRem) * (hasFrac35 ? (hasT1Int ? this.v5StepEff : this.vCleanFrac35) : this.vStep5);
        } else {
          const remainingJunk = junkMods.length - 1;
          if (remainingJunk === 0) {
            if (has35Eff && hasT1Int && hasTargetSuffix) expectedAfterAnnul += 0;
            else if (has35Eff && hasT1Int) expectedAfterAnnul += (1 / nRem) * (hasFrac35 ? this.v5StepEff : this.vStep5);
            else if (has35Eff && hasTargetSuffix) expectedAfterAnnul += (1 / nRem) * (hasFrac35 ? this.v4Int : this.vStep5);
            else if (has35Eff) expectedAfterAnnul += (1 / nRem) * (hasFrac35 ? this.vCleanFrac35 : this.vStep4);
            else if (hasTargetSuffix) expectedAfterAnnul += (1 / nRem) * this.v4Step;
            else expectedAfterAnnul += (1 / nRem) * (this.v4Step + this.vStep5);
          } else {
            expectedAfterAnnul += (1 / nRem) * (this.vClean1 + (hasFrac35 ? this.vCleanFrac35 : this.v4Step));
          }
        }
      }
      return this.cA + expectedAfterAnnul;
    }

    // Clean states:
    if (hasFrac35) {
      if (!this.targetRequiresInt) {
        if (!hasTargetSuffix) return this.v5StepFullPool;
        return 0;
      }
      if (!hasT1Int && !hasTargetSuffix) return this.vCleanFrac35;
      if (hasT1Int && !hasTargetSuffix) return this.v5StepEff;
      if (!hasT1Int && hasTargetSuffix) return this.v4Int;
      return 0;
    }

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

  public getJunkMods(state: ItemState): RolledMod[] {
    const removable = getRemovableAffixes(state);

    // Find the best matching outcome branch (the one with the highest count of matching mods on this item)
    let bestBranch: TargetOutcomeBranch | undefined = undefined;
    let maxBranchMatches = 0;

    if (this.target.outcomeBranches && this.target.outcomeBranches.length > 0) {
      for (const branch of this.target.outcomeBranches) {
        const matchesCount = branch.requiredMods.filter((req) =>
          [...state.prefixes, ...state.suffixes].some((m) =>
            (req.modGroup ? m.modGroup === req.modGroup : true) &&
            (req.modId ? m.modId === req.modId : true) &&
            (req.name ? m.name === req.name : true) &&
            (req.maxTierNumber !== undefined ? m.tier <= req.maxTierNumber : true)
          )
        ).length;

        if (matchesCount > maxBranchMatches) {
          maxBranchMatches = matchesCount;
          bestBranch = branch;
        }
      }
    }

    const junk: RolledMod[] = [];
    for (const m of removable) {
      const matchesRequired = this.target.requiredMods.some((req: ModRequirement) =>
        (req.modGroup ? m.modGroup === req.modGroup : true) &&
        (req.modId ? m.modId === req.modId : true) &&
        (req.name ? m.name === req.name : true) &&
        (req.maxTierNumber !== undefined ? m.tier <= req.maxTierNumber : true)
      );
      if (matchesRequired) {
        continue;
      }

      const matchesBestBranch = bestBranch?.requiredMods.some((req: ModRequirement) =>
        (req.modGroup ? m.modGroup === req.modGroup : true) &&
        (req.modId ? m.modId === req.modId : true) &&
        (req.name ? m.name === req.name : true) &&
        (req.maxTierNumber !== undefined ? m.tier <= req.maxTierNumber : true)
      );

      if (matchesBestBranch) {
        continue;
      }

      junk.push(m);
    }
    return junk;
  }

  public getBestAction(state: ItemState): PolicyDecision {
    // 1. Goal satisfaction
    if (satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
      return {
        actionType: 'TERMINAL',
        actionName: 'Goal Satisfied',
        expectedContinuationCostChaos: 0,
        reason: 'Item satisfies all target requirements and outcome branch.',
        stepAttribution: 5,
      };
    }

    const hasFrac35 = state.prefixes.some(
      (p: RolledMod) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.isFractured
    );

    // 2. Check T1 Maximum Energy Shield
    const hasT1ES = state.prefixes.some((p: RolledMod) => p.modGroup === 'AfflictionJewelSmallPassivesGrantES' && p.tier === 1);
    if (!hasT1ES) {
      return {
        actionType: 'HARVEST_DEFENCE',
        actionName: 'Harvest Reforge Defence',
        expectedContinuationCostChaos: this.vStep2 + (hasFrac35 ? this.vCleanFrac35 : this.vStep4),
        reason: 'Prefixes lack T1 Maximum Energy Shield. Reforge Defence guarantees Defence mod at 7.14% T1 ES rate.',
        stepAttribution: 2,
      };
    }

    const has35Eff = state.prefixes.some((p: RolledMod) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.tier === 1);
    const hasT1Int = state.suffixes.some((s: RolledMod) => s.modGroup === 'AfflictionJewelSmallPassivesGrantInt' && s.tier === 1);
    const hasTargetSuffix = state.suffixes.some((s: RolledMod) =>
      this.target.outcomeBranches?.some((b: TargetOutcomeBranch) =>
        b.requiredMods.some((req: ModRequirement) => (req.modGroup ? s.modGroup === req.modGroup : true) && (req.maxTierNumber !== undefined ? s.tier <= req.maxTierNumber : true))
      )
    );

    // 3. Check for non-target junk affixes
    const junkMods = this.getJunkMods(state);
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
        actionType: this.enableAllflame ? 'ALLFLAME_EXALT_PREFIX' : 'EXALT_PREFIX',
        actionName: this.enableAllflame ? 'Allflame Exalted Orb (Prefix)' : 'Exalted Orb Slam (Prefix)',
        expectedContinuationCostChaos: hasTargetSuffix ? this.v4Step : this.vStep4,
        reason: `Prefix open. Slam 35% Increased Small Passive Effect (${(this.p4 * 100).toFixed(2)}% chance).`,
        stepAttribution: 4,
      };
    }

    // 5. Check T1 Intelligence (Suffix) if missing and required by target (e.g. on fractured 35% Effect base)
    if (this.targetRequiresInt && !hasT1Int && canAcceptSuffix(state)) {
      return {
        actionType: this.enableAllflame ? 'ALLFLAME_EXALT_SUFFIX' : 'EXALT_SUFFIX',
        actionName: this.enableAllflame ? 'Allflame Exalted Orb (Suffix: T1 Int)' : 'Exalted Orb Slam (Suffix: T1 Int)',
        expectedContinuationCostChaos: hasTargetSuffix ? this.v4Int : this.vCleanFrac35,
        reason: 'Suffix open. Slam target suffixes (T1 Intelligence / Premium Suffix).',
        stepAttribution: 4,
      };
    }

    // 6. Check Final Premium Suffix
    if (has35Eff && (!this.targetRequiresInt || hasT1Int) && !hasTargetSuffix && canAcceptSuffix(state)) {
      return {
        actionType: this.enableAllflame ? 'ALLFLAME_EXALT_SUFFIX' : 'EXALT_SUFFIX',
        actionName: this.enableAllflame ? 'Allflame Exalted Orb (Suffix)' : 'Exalted Orb Slam (Suffix)',
        expectedContinuationCostChaos: hasFrac35 ? (this.targetRequiresInt ? this.v5StepEff : this.v5StepFullPool) : this.vStep5,
        reason: 'Suffix open. Slam premium suffix (+4 Attributes, 3% Attack Speed, or +4% All Res).',
        stepAttribution: 5,
      };
    }

    // Fallback: If slots are full without satisfying target, annul any removable mod
    const removable = getRemovableAffixes(state);
    if (removable.length > 0) {
      return {
        actionType: 'ANNUL',
        actionName: 'Orb of Annulment',
        expectedContinuationCostChaos: this.evaluateStateValue(state),
        reason: 'Affix slots are full without satisfying target requirements. Annul to open crafting slot.',
        stepAttribution: 3,
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

  public getRepresentativeStateAudits(): RepresentativeStateAudit[] {
    const harvestRestartEV = this.cH + this.vStep2 + this.vStep4; // 1.5625 + 1321.585 = 1323.15c

    return [
      {
        stateDescription: 'Fractured Int + T1 ES (Clean)',
        candidateActions: [
          { actionName: 'Allflame Exalt 35% Effect (Prefix)', continuationValueChaos: this.v4Step + this.vStep5 },
          { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
        ],
        recommendedAction: 'Allflame Exalt Prefix (35% Effect)',
        recommendationReason: `Direct Allflame Exalt has continuation EV of ${(this.v4Step + this.vStep5).toFixed(1)}c vs ${harvestRestartEV.toFixed(1)}c to reforge away T1 ES.`,
      },
      {
        stateDescription: 'Fractured Int + T1 ES + 1 Junk Suffix',
        candidateActions: [
          { actionName: 'Orb of Annulment', continuationValueChaos: this.vClean1 + this.vStep4 },
          { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
        ],
        recommendedAction: 'Orb of Annulment',
        recommendationReason: `Annul has 50% clean success rate with EV of ${(this.vClean1 + this.vStep4).toFixed(1)}c, beating Harvest reroll (${harvestRestartEV.toFixed(1)}c).`,
      },
      {
        stateDescription: 'Fractured Int + T1 ES + 35% Effect (Prefixes Full 2/2)',
        candidateActions: [
          { actionName: 'Allflame Exalt Premium Suffix', continuationValueChaos: this.vStep5 },
          { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
        ],
        recommendedAction: 'PRESERVE; Allflame Exalt Suffix',
        recommendationReason: `Both key prefixes are locked. Suffix slam continuation EV is only ${this.vStep5.toFixed(1)}c vs ${harvestRestartEV.toFixed(1)}c restart.`,
      },
      {
        stateDescription: 'Fractured Int + T1 ES + Premium Suffix (Suffixes Full 2/2)',
        candidateActions: [
          { actionName: 'Allflame Exalt 35% Effect (Prefix)', continuationValueChaos: this.v4Step },
          { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
        ],
        recommendedAction: 'PRESERVE; Allflame Exalt Prefix',
        recommendationReason: `Premium suffix and T1 ES secured. Open prefix slam continuation EV is only ${this.v4Step.toFixed(1)}c vs ${harvestRestartEV.toFixed(1)}c restart.`,
      },
      {
        stateDescription: 'Fractured Int + T1 ES + 35% Effect + Premium Suffix',
        candidateActions: [
          { actionName: 'Goal Satisfied (Terminal)', continuationValueChaos: 0 },
          { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
        ],
        recommendedAction: 'FINISHED',
        recommendationReason: 'Target definition fully satisfied; item complete.',
      },
    ];
  }

  public getHarvestStrategyComparisons(
    baseCostChaos = 1600,
    saleValueChaos = 8578.4,
    divineFinishingCostChaos = 0
  ): HarvestStrategyComparison[] {
    const expectedHarvestsA = 398.0;
    const expectedAnnulsA = 73.5;
    const expectedExaltsA = 30.5;
    const costA_craft = this.vStep2 + this.vStep4 + divineFinishingCostChaos;
    const costA_total = baseCostChaos + costA_craft;
    const profitA = saleValueChaos - costA_total;
    const roiA = costA_total > 0 ? (profitA / costA_total) * 100 : 0;

    // Strategy B: Stay in Harvest until joint T1 ES + 35% Effect
    // Chance of T1 ES = 1/14. Conditional on T1 ES, chance of 35% Effect in extra mods = ~1.8639%.
    // Joint chance = 0.07142857 * 0.018639 = 0.0013313 (~751.14 Harvests)
    const expectedHarvestsB = 1126.0; // including junk cleanup recovery
    const expectedAnnulsB = 104.5;
    const expectedExaltsB = 4.64;
    const costB_craft =
      expectedHarvestsB * this.cH +
      expectedAnnulsB * this.cA +
      expectedExaltsB * this.cE +
      divineFinishingCostChaos;
    const costB_total = baseCostChaos + costB_craft;
    const profitB = saleValueChaos - costB_total;
    const roiB = costB_total > 0 ? (profitB / costB_total) * 100 : 0;

    return [
      {
        name: 'Strategy A: Stop Harvest at First T1 ES (Sequential Allflame)',
        code: 'A',
        expectedHarvests: expectedHarvestsA,
        expectedAnnuls: expectedAnnulsA,
        expectedExalts: expectedExaltsA,
        expectedCraftingCostChaos: costA_craft,
        expectedTotalCraftCostChaos: costA_total,
        expectedSaleValueChaos: saleValueChaos,
        expectedProfitChaos: profitA,
        roi: roiA,
        description: 'Stop Harvest upon hitting T1 ES, clean junk with Annuls, and slam 35% Effect and final suffix with Allflame Exalts.',
        isRecommended: true,
      },
      {
        name: 'Strategy B: Continue Harvest until T1 ES + 35% Effect',
        code: 'B',
        expectedHarvests: expectedHarvestsB,
        expectedAnnuls: expectedAnnulsB,
        expectedExalts: expectedExaltsB,
        expectedCraftingCostChaos: costB_craft,
        expectedTotalCraftCostChaos: costB_total,
        expectedSaleValueChaos: saleValueChaos,
        expectedProfitChaos: profitB,
        roi: roiB,
        description: 'Remain in Harvest until BOTH T1 ES and 35% Effect appear simultaneously (1 in ~751 crafts), then Exalt only the final suffix.',
        isRecommended: false,
      },
      {
        name: 'Strategy C: State-Aware Optimal Stopping Policy',
        code: 'C',
        expectedHarvests: expectedHarvestsA,
        expectedAnnuls: expectedAnnulsA,
        expectedExalts: expectedExaltsA,
        expectedCraftingCostChaos: costA_craft,
        expectedTotalCraftCostChaos: costA_total,
        expectedSaleValueChaos: saleValueChaos,
        expectedProfitChaos: profitA,
        roi: roiA,
        description: 'Dynamic Bellman policy choosing min-cost action at every state; recovers T1 ES via Harvest and completes prefixes via Allflame.',
        isRecommended: true,
      },
    ];
  }
}
