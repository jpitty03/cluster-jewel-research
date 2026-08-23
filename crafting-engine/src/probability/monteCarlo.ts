import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext } from '../domain/CraftAction.ts';
import type { PriceBook } from '../domain/PriceBook.ts';
import type { Mod } from '../domain/Mod.ts';
import { toRolledMod } from '../domain/Mod.ts';
import { satisfiesTarget, getMatchingOutcomeBranch } from '../domain/TargetDefinition.ts';
import { DivineAction } from '../actions/divine.ts';
import { getRemovableAffixes } from '../domain/ItemState.ts';
import { getEligibleMods, calculateTotalWeight } from '../rules/modEligibility.ts';
import { canAcceptPrefix, canAcceptSuffix } from '../rules/affixRules.ts';
import { CraftingPolicyEngine } from '../solver/policyEngine.ts';
import { getTaggedModsForCluster } from '../rules/clusterPoolHelpers.ts';

import { type RandomSource, createRandomSource } from './random.ts';

export interface HarvestCensusData {
  totalHarvests: number;
  t1HarvestSuccesses: number;
  t1HarvestSuccessRate: number;
  t1HarvestAdditional0AffixesPct: number;
  t1HarvestAdditional1AffixesPct: number;
  t1HarvestAdditional2AffixesPct: number;
  t1HarvestOnlyPct: number;
  t1HarvestPlusJunk1OnlyPct: number;
  t1HarvestPlusJunk2OnlyPct: number;
  targetSuffixHitsPct: Record<string, number>;
}

export interface TraceStepLog {
  step: number;
  actionTaken: string;
  details: string;
  costChaos: number;
  resultStatePrefixes: string[];
  resultStateSuffixes: string[];
}

export interface SampleCraftTrace {
  trialNumber: number;
  stepCount: number;
  finalPrefixes: string[];
  finalSuffixes: string[];
  harvestCount: number;
  annulCount: number;
  exaltCount: number;
  totalCostChaos: number;
  stepLogs: TraceStepLog[];
}

export interface TimeoutDiagnostics {
  averageStepsCompleted: number;
  maxStepsCompleted: number;
  trialsExceeding5kSteps: number;
  trialsExceeding10kSteps: number;
  trialsExceeding20kSteps: number;
  timeoutPartialCostChaos: number;
  timeoutRatePercentage: number;
}

export interface EconomicRiskMetrics {
  saleValueChaos: number;
  isBranchSpecific: boolean;
  profitableTrialsCount: number;
  profitProbabilityPercentage: number;
  meanRealizedProfitChaos: number;
  medianRealizedProfitChaos: number;
  p75ProfitChaos?: number;
  p90ProfitChaos?: number;
  p95ProfitChaos?: number;
  p25ProfitChaos?: number;
  p10ProfitChaos?: number;
  p5ProfitChaos?: number;
  p75CostChaos: number;
  p90CostChaos: number;
  p95CostChaos: number;
  cvar95CostChaos: number;
}

export interface MonteCarloUncertaintyMetrics {
  sampleStandardDeviationChaos: number;
  standardErrorChaos: number;
  confidenceInterval95Chaos: [number, number];
  analyticalExpectedCostChaos?: number;
  analyticalInsideCi95: boolean;
  isCensored: boolean;
  timedOutTrials: number;
  censoringStatus: 'NONE' | 'PRESENT';
  censoringNote?: string;
}

export interface SimulationResult {
  totalTrials: number;
  completedTrials: number;
  failedTrials: number;
  timedOutTrials: number;
  completionRate: number;
  meanCostChaos?: number;
  medianCostChaos?: number;
  p75CostChaos?: number;
  p90CostChaos?: number;
  p95CostChaos?: number;
  currencyAverages?: Record<string, number>;
  stepwiseCostAverages?: {
    step1AcquisitionChaos: number;
    step2HarvestChaos: number;
    step3CleanupChaos: number;
    step4ExaltChaos: number;
    step5ExaltChaos: number;
    step6DivineChaos: number;
  };
  policyStats: {
    resolvedStatesCount: number;
    missingPolicyStates: number;
    fallbackActionsUsed: number;
  };
  harvestCensus?: HarvestCensusData;
  outcomeBranchDistribution?: Record<string, number>;
  timeoutDiagnostics?: TimeoutDiagnostics;
  riskMetrics?: EconomicRiskMetrics;
  uncertaintyMetrics?: MonteCarloUncertaintyMetrics;
  sampleTraces?: SampleCraftTrace[];
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  message?: string;
}

export class MonteCarloSimulator {
  private context: SolverContext;
  private target: TargetDefinition;
  private policyEngine: CraftingPolicyEngine;
  private divineAction = new DivineAction();
  private rng: RandomSource;

  constructor(
    context: SolverContext,
    target: TargetDefinition,
    allflameEnabled = false,
    policyEngine?: CraftingPolicyEngine,
    rngOrSeed?: RandomSource | number
  ) {
    this.context = context;
    this.target = target;
    this.policyEngine = policyEngine ?? new CraftingPolicyEngine(target, context.priceBook, context.pool, allflameEnabled);
    if (typeof rngOrSeed === 'number') {
      this.rng = createRandomSource(rngOrSeed);
    } else if (rngOrSeed) {
      this.rng = rngOrSeed;
    } else {
      this.rng = createRandomSource();
    }
  }

  public runSimulation(
    startState: ItemState,
    numTrials = 2000,
    baseCostChaos = 0,
    maxStepsPerTrial = 75000,
    priceBookOverride?: PriceBook,
    analyticalExpectedCostChaos?: number
  ): SimulationResult {
    const priceBook = priceBookOverride ?? this.context.priceBook;
    const allMods = this.context.pool ? this.context.pool.getAllMods().filter((m) => m.ilvl <= (startState.itemLevel ?? 84)) : [];

    let totalAttempts = 0;
    let completedCount = 0;
    let failedCount = 0;
    let timedOutCount = 0;

    let resolvedStatesCount = 0;
    let missingPolicyStates = 0;
    let fallbackActionsUsed = 0;

    // Timeout & step tracking diagnostics
    let totalCompletedSteps = 0;
    let maxCompletedSteps = 0;
    let trialsOver5k = 0;
    let trialsOver10k = 0;
    let trialsOver20k = 0;
    let timeoutPartialCost = 0;

    // Dynamic Harvest Census tracking variables
    let totalHarvests = 0;
    let t1HarvestSuccesses = 0;
    let countT1Additional0 = 0;
    let countT1Additional1 = 0;
    let countT1Additional2 = 0;
    let countT1Only = 0;
    let countT1PlusJunk1Only = 0;
    let countT1PlusJunk2Only = 0;

    const targetSuffixHitCounts: Record<string, number> = {};
    for (const g of this.policyEngine.targetSuffixGroups) {
      targetSuffixHitCounts[g.name] = 0;
    }

    const currencyTotals: Record<string, number> = {};
    const stepwiseTotals = {
      step1: 0,
      step2: 0,
      step3: 0,
      step4: 0,
      step5: 0,
      step6: 0,
    };

    const completedCosts: number[] = [];
    const completedProfits: number[] = [];
    const outcomeBranchCounts: Record<string, number> = {};
    const sampleTraces: SampleCraftTrace[] = [];

    for (let trial = 1; trial <= numTrials; trial++) {
      totalAttempts++;

      const state: ItemState = {
        baseType: startState.baseType,
        clusterType: startState.clusterType,
        itemLevel: startState.itemLevel,
        passiveCount: startState.passiveCount,
        rarity: startState.rarity,
        prefixes: startState.prefixes.map((p) => ({ ...p })),
        suffixes: startState.suffixes.map((s) => ({ ...s })),
        fracturedModIds: [...startState.fracturedModIds],
      };

      let steps = 0;
      let trialCostChaos = baseCostChaos;
      const trialCurrencies: Record<string, number> = {};
      const trialStepCosts = {
        step1: baseCostChaos,
        step2: 0,
        step3: 0,
        step4: 0,
        step5: 0,
        step6: 0,
      };

      const captureTrace = trial <= 5;
      const trialStepLogs: TraceStepLog[] = [];
      let isCompleted = false;
      let trialHarvests = 0;
      let trialAnnuls = 0;
      let trialExalts = 0;
      let trialSlamAttempted = false;

      while (steps < maxStepsPerTrial) {
        steps++;
        resolvedStatesCount++;

        // Consult mechanical policy engine
        const decision = this.policyEngine.getBestAction(state);

        if (decision.actionType === 'TERMINAL') {
          isCompleted = true;
          break;
        }

        if (decision.expectedContinuationCostChaos === Infinity) {
          missingPolicyStates++;
          fallbackActionsUsed++;
          failedCount++;
          break;
        }

        // 1. HARVEST_DEFENCE / HARVEST_REFORGE
        if (decision.actionType === 'HARVEST_DEFENCE' || decision.actionType === 'HARVEST_REFORGE') {
          totalHarvests++;
          trialHarvests++;
          trialSlamAttempted = false;
          const harvestLifeforce = this.policyEngine.harvestLifeforce ?? 'primalLifeforce';
          const harvestTag = this.policyEngine.harvestTag ?? 'defences';
          const costChaos = priceBook.toChaos(75, harvestLifeforce as any);
          trialCostChaos += costChaos;
          trialCurrencies[harvestLifeforce] = (trialCurrencies[harvestLifeforce] ?? 0) + 75;
          trialStepCosts.step2 += costChaos;

          // Preserve fractured mods
          state.prefixes = state.prefixes.filter((m) => m.isFractured);
          state.suffixes = state.suffixes.filter((m) => m.isFractured);

          // Guarantee 1 tagged mod
          const taggedMods = this.context.pool ? getTaggedModsForCluster(this.context.pool, harvestTag, 84) : [];
          const chosenTagged = this.sampleWeightedMod(taggedMods);
          if (chosenTagged) {
            if (chosenTagged.genType === 'Prefix') {
              state.prefixes.push(toRolledMod(chosenTagged));
            } else {
              state.suffixes.push(toRolledMod(chosenTagged));
            }
          }

          // Random additional affixes (50% 1 extra, 50% 2 extra)
          const extraAffixesCount = this.rng.next() < 0.5 ? 1 : 2;
          const extraMods: Mod[] = [];
          for (let e = 0; e < extraAffixesCount; e++) {
            const reqGenType = !canAcceptPrefix(state) ? 'Suffix' : (!canAcceptSuffix(state) ? 'Prefix' : undefined);
            const eligible = getEligibleMods(state, allMods, reqGenType ? { requiredGenType: reqGenType } : undefined);
            const extra = this.sampleWeightedMod(eligible);
            if (extra) {
              if (extra.genType === 'Prefix' && canAcceptPrefix(state)) {
                extraMods.push(extra);
                state.prefixes.push(toRolledMod(extra));
              } else if (extra.genType === 'Suffix' && canAcceptSuffix(state)) {
                extraMods.push(extra);
                state.suffixes.push(toRolledMod(extra));
              }
            }
          }

          // Dynamic Census tracking
          const isT1Harvest = chosenTagged?.modGroup === this.policyEngine.harvestModGroup && chosenTagged?.tier === 1;
          if (isT1Harvest) {
            t1HarvestSuccesses++;
            if (extraMods.length === 0) countT1Additional0++;
            else if (extraMods.length === 1) countT1Additional1++;
            else if (extraMods.length === 2) countT1Additional2++;

            let hasTargetSuffix = false;
            for (const g of this.policyEngine.targetSuffixGroups) {
              const hit = extraMods.some((m) => m.modGroup === g.modGroup && m.tier <= g.tier);
              if (hit) {
                targetSuffixHitCounts[g.name] = (targetSuffixHitCounts[g.name] ?? 0) + 1;
                hasTargetSuffix = true;
              }
            }

            if (extraMods.length === 0) {
              countT1Only++;
            } else if (!hasTargetSuffix) {
              if (extraMods.length === 1) countT1PlusJunk1Only++;
              else countT1PlusJunk2Only++;
            }
          }

          if (captureTrace) {
            trialStepLogs.push({
              step: steps,
              actionTaken: decision.actionName,
              details: `Reforged item (guaranteed ${harvestTag}: ${chosenTagged?.name ?? 'none'})`,
              costChaos,
              resultStatePrefixes: state.prefixes.map((p) => `${p.name} (t${p.tier})`),
              resultStateSuffixes: state.suffixes.map((s) => `${s.name} (t${s.tier})`),
            });
          }
          continue;
        }

        // 2. ANNUL
        if (decision.actionType === 'ANNUL') {
          const removable = getRemovableAffixes(state);
          if (removable.length === 0) {
            failedCount++;
            break;
          }

          trialAnnuls++;
          const costChaos = priceBook.toChaos(1, 'annul');
          trialCostChaos += costChaos;
          trialCurrencies.annul = (trialCurrencies.annul ?? 0) + 1;

          const hasFrac35 = state.prefixes.some(
            (p) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.isFractured
          );
          let attributedStep = decision.stepAttribution ?? 3;
          if (hasFrac35) {
            attributedStep = trialSlamAttempted ? 4 : 3;
          }

          if (attributedStep === 4) trialStepCosts.step4 += costChaos;
          else if (attributedStep === 5) trialStepCosts.step5 += costChaos;
          else trialStepCosts.step3 += costChaos;

          const targetIndex = Math.floor(this.rng.next() * removable.length);
          const removedMod = removable[targetIndex];

          if (removedMod.genType === 'Prefix') {
            const idx = state.prefixes.indexOf(removedMod);
            if (idx !== -1) state.prefixes.splice(idx, 1);
          } else {
            const idx = state.suffixes.indexOf(removedMod);
            if (idx !== -1) state.suffixes.splice(idx, 1);
          }

          if (captureTrace) {
            trialStepLogs.push({
              step: steps,
              actionTaken: 'Orb of Annulment',
              details: `Annul removed ${removedMod.name} (${removedMod.genType}) [Step ${attributedStep} Cleanup]`,
              costChaos,
              resultStatePrefixes: state.prefixes.map((p) => `${p.name} (t${p.tier})`),
              resultStateSuffixes: state.suffixes.map((s) => `${s.name} (t${s.tier})`),
            });
          }
          continue;
        }

        // 3. EXALT_PREFIX
        if (decision.actionType === 'EXALT_PREFIX' || decision.actionType === 'ALLFLAME_EXALT_PREFIX') {
          const eligiblePrefixes = getEligibleMods(state, allMods, { requiredGenType: 'Prefix' });
          if (eligiblePrefixes.length === 0) {
            failedCount++;
            break;
          }

          trialExalts++;
          const costChaos = priceBook.toChaos(1, 'exalt');
          trialCostChaos += costChaos;
          trialCurrencies.exalt = (trialCurrencies.exalt ?? 0) + 1;
          trialStepCosts.step4 += costChaos;

          const chosenMod = this.sampleWeightedMod(eligiblePrefixes)!;
          if (chosenMod) {
            state.prefixes.push(toRolledMod(chosenMod));
          }

          if (captureTrace) {
            trialStepLogs.push({
              step: steps,
              actionTaken: decision.actionName,
              details: `Slammed ${chosenMod.name}`,
              costChaos,
              resultStatePrefixes: state.prefixes.map((p) => `${p.name} (t${p.tier})`),
              resultStateSuffixes: state.suffixes.map((s) => `${s.name} (t${s.tier})`),
            });
          }
          continue;
        }

        // 4. EXALT_SUFFIX
        if (decision.actionType === 'EXALT_SUFFIX' || decision.actionType === 'ALLFLAME_EXALT_SUFFIX') {
          const eligibleSuffixes = getEligibleMods(state, allMods, { requiredGenType: 'Suffix' });
          if (eligibleSuffixes.length === 0) {
            failedCount++;
            break;
          }

          trialExalts++;
          trialSlamAttempted = true;
          const costChaos = priceBook.toChaos(1, 'exalt');
          trialCostChaos += costChaos;
          trialCurrencies.exalt = (trialCurrencies.exalt ?? 0) + 1;
          trialStepCosts.step4 += costChaos;

          const chosenMod = this.sampleWeightedMod(eligibleSuffixes)!;
          if (chosenMod) {
            state.suffixes.push(toRolledMod(chosenMod));
          }

          if (captureTrace) {
            trialStepLogs.push({
              step: steps,
              actionTaken: decision.actionName,
              details: `Slammed ${chosenMod.name}`,
              costChaos,
              resultStatePrefixes: state.prefixes.map((p) => `${p.name} (t${p.tier})`),
              resultStateSuffixes: state.suffixes.map((s) => `${s.name} (t${s.tier})`),
            });
          }
          continue;
        }

        // Goal check
        if (satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
          isCompleted = true;
          break;
        }

        failedCount++;
        break;
      }

      if (isCompleted || satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
        completedCount++;

        // Divine Finishing if applicable
        const divineAttempts = this.divineAction.calculateExpectedFinishingCost(state, this.target);
        if (divineAttempts > 0) {
          const divineCost = divineAttempts * priceBook.getRate('divine');
          trialCostChaos += divineCost;
          trialCurrencies.divine = (trialCurrencies.divine ?? 0) + divineAttempts;
          trialStepCosts.step6 += divineCost;
        }

        completedCosts.push(trialCostChaos);
        const matchedBranch = getMatchingOutcomeBranch(state, this.target);
        const branchName = matchedBranch?.name ?? 'Target Satisfied';
        outcomeBranchCounts[branchName] = (outcomeBranchCounts[branchName] ?? 0) + 1;

        const trialSaleValue = matchedBranch?.saleValueChaos ?? this.target.saleValueChaos ?? 0;
        if (trialSaleValue > 0) {
          completedProfits.push(trialSaleValue - trialCostChaos);
        }

        totalCompletedSteps += steps;
        if (steps > maxCompletedSteps) maxCompletedSteps = steps;
        if (steps > 5000) trialsOver5k++;
        if (steps > 10000) trialsOver10k++;
        if (steps > 20000) trialsOver20k++;

        for (const [curr, amt] of Object.entries(trialCurrencies)) {
          currencyTotals[curr] = (currencyTotals[curr] ?? 0) + amt;
        }
        stepwiseTotals.step1 += trialStepCosts.step1;
        stepwiseTotals.step2 += trialStepCosts.step2;
        stepwiseTotals.step3 += trialStepCosts.step3;
        stepwiseTotals.step4 += trialStepCosts.step4;
        stepwiseTotals.step5 += trialStepCosts.step5;
        stepwiseTotals.step6 += trialStepCosts.step6;

        if (captureTrace) {
          sampleTraces.push({
            trialNumber: trial,
            stepCount: steps,
            finalPrefixes: state.prefixes.map((p) => `${p.name} (t${p.tier})`),
            finalSuffixes: state.suffixes.map((s) => `${s.name} (t${s.tier})`),
            harvestCount: trialHarvests,
            annulCount: trialAnnuls,
            exaltCount: trialExalts,
            totalCostChaos: trialCostChaos,
            stepLogs: trialStepLogs,
          });
        }
      } else {
        timedOutCount++;
        timeoutPartialCost += trialCostChaos;
        if (steps > 5000) trialsOver5k++;
        if (steps > 10000) trialsOver10k++;
        if (steps > 20000) trialsOver20k++;
      }
    }

    const completionRate = totalAttempts > 0 ? (completedCount / totalAttempts) * 100 : 0;

    const timeoutDiagnostics: TimeoutDiagnostics = {
      averageStepsCompleted: completedCount > 0 ? totalCompletedSteps / completedCount : 0,
      maxStepsCompleted: maxCompletedSteps,
      trialsExceeding5kSteps: trialsOver5k,
      trialsExceeding10kSteps: trialsOver10k,
      trialsExceeding20kSteps: trialsOver20k,
      timeoutPartialCostChaos: timeoutPartialCost,
      timeoutRatePercentage: totalAttempts > 0 ? (timedOutCount / totalAttempts) * 100 : 0,
    };

    if (completedCount === 0) {
      return {
        totalTrials: totalAttempts,
        completedTrials: 0,
        failedTrials: failedCount,
        timedOutTrials: timedOutCount,
        completionRate: 0,
        policyStats: {
          resolvedStatesCount,
          missingPolicyStates,
          fallbackActionsUsed,
        },
        timeoutDiagnostics,
        status: 'FAILED',
        message: `VALIDATION FAILED: 0 / ${totalAttempts} simulations reached a terminal state within step limit (${maxStepsPerTrial}).`,
      };
    }

    completedCosts.sort((a, b) => a - b);
    const meanCostChaos = completedCosts.reduce((s, c) => s + c, 0) / completedCount;
    const medianCostChaos = completedCosts[Math.floor(completedCount * 0.5)];
    const p75CostChaos = completedCosts[Math.floor(completedCount * 0.75)];
    const p90CostChaos = completedCosts[Math.floor(completedCount * 0.9)];
    const p95CostChaos = completedCosts[Math.floor(completedCount * 0.95)];

    const currencyAverages: Record<string, number> = {};
    for (const [curr, total] of Object.entries(currencyTotals)) {
      currencyAverages[curr] = total / completedCount;
    }

    const stepwiseCostAverages = {
      step1AcquisitionChaos: stepwiseTotals.step1 / completedCount,
      step2HarvestChaos: stepwiseTotals.step2 / completedCount,
      step3CleanupChaos: stepwiseTotals.step3 / completedCount,
      step4ExaltChaos: stepwiseTotals.step4 / completedCount,
      step5ExaltChaos: stepwiseTotals.step5 / completedCount,
      step6DivineChaos: stepwiseTotals.step6 / completedCount,
    };

    const targetSuffixHitsPct: Record<string, number> = {};
    for (const [name, count] of Object.entries(targetSuffixHitCounts)) {
      targetSuffixHitsPct[name] = t1HarvestSuccesses > 0 ? (count / t1HarvestSuccesses) * 100 : 0;
    }

    const harvestCensus: HarvestCensusData = {
      totalHarvests,
      t1HarvestSuccesses,
      t1HarvestSuccessRate: totalHarvests > 0 ? (t1HarvestSuccesses / totalHarvests) * 100 : 0,
      t1HarvestAdditional0AffixesPct: t1HarvestSuccesses > 0 ? (countT1Additional0 / t1HarvestSuccesses) * 100 : 0,
      t1HarvestAdditional1AffixesPct: t1HarvestSuccesses > 0 ? (countT1Additional1 / t1HarvestSuccesses) * 100 : 0,
      t1HarvestAdditional2AffixesPct: t1HarvestSuccesses > 0 ? (countT1Additional2 / t1HarvestSuccesses) * 100 : 0,
      t1HarvestOnlyPct: t1HarvestSuccesses > 0 ? (countT1Only / t1HarvestSuccesses) * 100 : 0,
      t1HarvestPlusJunk1OnlyPct: t1HarvestSuccesses > 0 ? (countT1PlusJunk1Only / t1HarvestSuccesses) * 100 : 0,
      t1HarvestPlusJunk2OnlyPct: t1HarvestSuccesses > 0 ? (countT1PlusJunk2Only / t1HarvestSuccesses) * 100 : 0,
      targetSuffixHitsPct,
    };

    const outcomeBranchDistribution: Record<string, number> = {};
    for (const [name, count] of Object.entries(outcomeBranchCounts)) {
      outcomeBranchDistribution[name] = (count / completedCount) * 100;
    }

    let riskMetrics: EconomicRiskMetrics | undefined;
    const isBranchSpecific = Boolean(this.target.outcomeBranches && this.target.outcomeBranches.length > 1);
    const configuredSale = this.target.saleValueChaos ?? (this.target.outcomeBranches && this.target.outcomeBranches.length > 0 ? (this.target.outcomeBranches[0].saleValueChaos ?? 0) : 0);

    if (completedProfits.length > 0) {
      completedProfits.sort((a, b) => a - b);
      const profitableTrials = completedProfits.filter((p) => p >= 0).length;
      const profitProb = (profitableTrials / completedProfits.length) * 100;
      const meanProfit = completedProfits.reduce((s, p) => s + p, 0) / completedProfits.length;
      const medianProfit = completedProfits[Math.floor(completedProfits.length * 0.5)];

      const p75Profit = completedProfits[Math.floor(completedProfits.length * 0.75)];
      const p90Profit = completedProfits[Math.floor(completedProfits.length * 0.90)];
      const p95Profit = completedProfits[Math.floor(completedProfits.length * 0.95)];
      const p25Profit = completedProfits[Math.floor(completedProfits.length * 0.25)];
      const p10Profit = completedProfits[Math.floor(completedProfits.length * 0.10)];
      const p5Profit = completedProfits[Math.floor(completedProfits.length * 0.05)];

      const worst5PctIdx = Math.floor(completedCount * 0.95);
      const worst5PctSlice = completedCosts.slice(worst5PctIdx);
      const cvar95 = worst5PctSlice.reduce((s, c) => s + c, 0) / Math.max(1, worst5PctSlice.length);

      riskMetrics = {
        saleValueChaos: configuredSale,
        isBranchSpecific,
        profitableTrialsCount: profitableTrials,
        profitProbabilityPercentage: profitProb,
        meanRealizedProfitChaos: meanProfit,
        medianRealizedProfitChaos: medianProfit,
        p75ProfitChaos: p75Profit,
        p90ProfitChaos: p90Profit,
        p95ProfitChaos: p95Profit,
        p25ProfitChaos: p25Profit,
        p10ProfitChaos: p10Profit,
        p5ProfitChaos: p5Profit,
        p75CostChaos,
        p90CostChaos,
        p95CostChaos,
        cvar95CostChaos: cvar95,
      };
    }

    let uncertaintyMetrics: MonteCarloUncertaintyMetrics | undefined;
    if (completedCount > 1) {
      const variance = completedCosts.reduce((s, c) => s + (c - meanCostChaos) ** 2, 0) / (completedCount - 1);
      const sampleStandardDeviationChaos = Math.sqrt(variance);
      const standardErrorChaos = sampleStandardDeviationChaos / Math.sqrt(completedCount);
      const ciHalfWidth = 1.96 * standardErrorChaos;
      const confidenceInterval95Chaos: [number, number] = [
        Math.max(0, meanCostChaos - ciHalfWidth),
        meanCostChaos + ciHalfWidth,
      ];
      const analyticalInsideCi95 =
        analyticalExpectedCostChaos !== undefined
          ? analyticalExpectedCostChaos >= confidenceInterval95Chaos[0] &&
            analyticalExpectedCostChaos <= confidenceInterval95Chaos[1]
          : false;

      const isCensored = timedOutCount > 0;
      const censoringStatus: 'NONE' | 'PRESENT' = isCensored ? 'PRESENT' : 'NONE';
      const censoringNote = isCensored
        ? `${timedOutCount} trial(s) timed out at step limit; completed-trial sample excludes heavy right tail`
        : undefined;

      uncertaintyMetrics = {
        sampleStandardDeviationChaos,
        standardErrorChaos,
        confidenceInterval95Chaos,
        analyticalExpectedCostChaos,
        analyticalInsideCi95,
        isCensored,
        timedOutTrials: timedOutCount,
        censoringStatus,
        censoringNote,
      };
    }

    const status = completionRate >= 95 ? 'SUCCESS' : 'PARTIAL';

    return {
      totalTrials: totalAttempts,
      completedTrials: completedCount,
      failedTrials: failedCount,
      timedOutTrials: timedOutCount,
      completionRate,
      meanCostChaos,
      medianCostChaos,
      p75CostChaos,
      p90CostChaos,
      p95CostChaos,
      currencyAverages,
      stepwiseCostAverages,
      policyStats: {
        resolvedStatesCount,
        missingPolicyStates,
        fallbackActionsUsed,
      },
      harvestCensus,
      outcomeBranchDistribution,
      timeoutDiagnostics,
      riskMetrics,
      uncertaintyMetrics,
      sampleTraces,
      status,
      message:
        completionRate < 100
          ? `Completed ${completedCount}/${numTrials} trials (${completionRate.toFixed(1)}%).`
          : undefined,
    };
  }

  private sampleWeightedMod(mods: Mod[]): Mod | null {
    if (mods.length === 0) return null;
    const totalWeight = calculateTotalWeight(mods);
    if (totalWeight <= 0) return mods[0];

    const r = this.rng.next() * totalWeight;
    let acc = 0;
    for (const m of mods) {
      acc += m.weight;
      if (r <= acc) {
        return m;
      }
    }
    return mods[mods.length - 1];
  }
}
