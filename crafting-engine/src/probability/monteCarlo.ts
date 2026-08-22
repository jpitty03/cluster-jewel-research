import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext } from '../domain/CraftAction.ts';
import type { Mod } from '../domain/Mod.ts';
import { toRolledMod } from '../domain/Mod.ts';
import { satisfiesTarget, getMatchingOutcomeBranch } from '../domain/TargetDefinition.ts';
import { DivineAction } from '../actions/divine.ts';
import { getRemovableAffixes } from '../domain/ItemState.ts';
import { getEligibleMods, calculateTotalWeight } from '../rules/modEligibility.ts';
import { canAcceptPrefix, canAcceptSuffix } from '../rules/affixRules.ts';
import { CraftingPolicyEngine } from '../solver/policyEngine.ts';
import { getDefenceModsForCluster } from '../rules/clusterPoolHelpers.ts';

export interface HarvestCensusData {
  totalHarvests: number;
  t1ESSuccesses: number;
  t1ESSuccessRate: number;
  t1ESOnlyPct: number;
  t1ESPlus35EffPct: number;
  t1ESPlusIntPct: number;
  t1ESPlusAttributesPct: number;
  t1ESPlusAttackSpeedPct: number;
  t1ESPlusAllResPct: number;
  t1ESPlusIntAndPremiumPct: number;
  t1ESPlus35AndPremiumPct: number;
  t1ESPlusJunkOnlyPct: number;
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
  sampleTraces?: SampleCraftTrace[];
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  message?: string;
}

export class MonteCarloSimulator {
  private context: SolverContext;
  private target: TargetDefinition;
  private allflameEnabled: boolean;
  private policyEngine: CraftingPolicyEngine;
  private divineAction = new DivineAction();

  constructor(
    context: SolverContext,
    target: TargetDefinition,
    allflameEnabled = false,
    policyEngine?: CraftingPolicyEngine
  ) {
    this.context = context;
    this.target = target;
    this.allflameEnabled = allflameEnabled;
    this.policyEngine = policyEngine ?? new CraftingPolicyEngine(target, context.priceBook, context.pool, allflameEnabled);
  }

  runSimulation(
    startStateFactory: () => ItemState,
    baseCostChaos: number,
    numTrials = 2000,
    maxStepsPerTrial = 3000,
    traceTrialsCount = 0
  ): SimulationResult {
    const allMods = this.context.pool.getAllMods();
    const priceBook = this.context.priceBook;

    const completedCosts: number[] = [];
    const currencyTotals: Record<string, number> = {};
    const stepwiseTotals = {
      step1: 0,
      step2: 0,
      step3: 0,
      step4: 0,
      step5: 0,
      step6: 0,
    };

    let timedOutCount = 0;
    let failedCount = 0;
    let resolvedStatesCount = 0;
    let missingPolicyStates = 0;
    let fallbackActionsUsed = 0;
    const sampleTraces: SampleCraftTrace[] = [];

    // Detailed census tracking
    let totalHarvests = 0;
    let t1ESSuccesses = 0;
    let countT1ESOnly = 0;
    let countT1ESPlus35 = 0;
    let countT1ESPlusInt = 0;
    let countT1ESPlusAttr = 0;
    let countT1ESPlusAS = 0;
    let countT1ESPlusAllRes = 0;
    let countT1ESPlusIntAndPremium = 0;
    let countT1ESPlus35AndPremium = 0;
    let countT1ESPlusJunkOnly = 0;

    // Use unified helper for Defence pool
    const defenceMods = getDefenceModsForCluster(this.context.pool, 84);

    let totalAttempts = 0;
    const maxTotalAttempts = numTrials * 3;

    const outcomeBranchCounts: Record<string, number> = {};

    while (completedCosts.length < numTrials && totalAttempts < maxTotalAttempts) {
      totalAttempts++;
      let state = startStateFactory();
      let trialCostChaos = baseCostChaos;
      const trialCurrencies: Record<string, number> = {};
      const trialStepCosts = { step1: baseCostChaos, step2: 0, step3: 0, step4: 0, step5: 0, step6: 0 };
      const trialStepLogs: TraceStepLog[] = [];
      const captureTrace = sampleTraces.length < traceTrialsCount;

      let steps = 0;
      let isCompleted = false;
      let trialHarvests = 0;
      let trialAnnuls = 0;
      let trialExalts = 0;
      let trialSlamAttempted = false;

      while (steps < maxStepsPerTrial) {
        steps++;
        resolvedStatesCount++;

        // Consult policy engine
        const decision = this.policyEngine.getBestAction(state);

        if (decision.actionType === 'TERMINAL') {
          isCompleted = true;
          break;
        }

        // Strict unhandled state detection
        if (decision.expectedContinuationCostChaos === Infinity) {
          missingPolicyStates++;
          fallbackActionsUsed++;
          failedCount++;
          break;
        }

        // ------------------------------------------------------------- 1. HARVEST_DEFENCE
        if (decision.actionType === 'HARVEST_DEFENCE') {
          totalHarvests++;
          trialHarvests++;
          trialSlamAttempted = false;
          const costChaos = priceBook.toChaos(75, 'primalLifeforce');
          trialCostChaos += costChaos;
          trialCurrencies.primalLifeforce = (trialCurrencies.primalLifeforce ?? 0) + 75;
          trialStepCosts.step2 += costChaos;

          // Preserve fractured mods
          state.prefixes = state.prefixes.filter((m) => m.isFractured);
          state.suffixes = state.suffixes.filter((m) => m.isFractured);

          // Guarantee 1 defence mod
          const chosenDefence = this.sampleWeightedMod(defenceMods);
          if (chosenDefence) {
            state.prefixes.push(toRolledMod(chosenDefence));
          }

          // Random additional affixes (50% 1 extra, 50% 2 extra)
          const extraAffixesCount = Math.random() < 0.5 ? 1 : 2;
          const extraMods: Mod[] = [];
          for (let e = 0; e < extraAffixesCount; e++) {
            const eligible = getEligibleMods(state, allMods);
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

          // Comprehensive census tracking
          const isT1ES = chosenDefence?.modGroup === 'AfflictionJewelSmallPassivesGrantES' && chosenDefence?.tier === 1;
          if (isT1ES) {
            t1ESSuccesses++;
            const has35 = extraMods.some((m) => m.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && m.tier === 1);
            const hasInt = extraMods.some((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantInt' && m.tier === 1);
            const hasAttr = extraMods.some((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantAttributes' && m.tier === 1);
            const hasAS = extraMods.some((m) => m.name.includes('3% increased Attack Speed') && m.tier === 1);
            const hasAllRes = extraMods.some((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantElementalRes' && m.tier === 1);
            const hasAnyPremium = hasAttr || hasAS || hasAllRes;

            if (extraMods.length === 0) countT1ESOnly++;
            else if (has35 && hasInt && hasAnyPremium) countT1ESPlusIntAndPremium++;
            else if (has35 && hasInt) countT1ESPlusInt++;
            else if (has35 && hasAnyPremium) countT1ESPlus35AndPremium++;
            else if (hasInt && hasAnyPremium) countT1ESPlusIntAndPremium++;
            else if (has35) countT1ESPlus35++;
            else if (hasInt) countT1ESPlusInt++;
            else if (hasAttr) countT1ESPlusAttr++;
            else if (hasAS) countT1ESPlusAS++;
            else if (hasAllRes) countT1ESPlusAllRes++;
            else countT1ESPlusJunkOnly++;
          }

          if (captureTrace) {
            trialStepLogs.push({
              step: steps,
              actionTaken: 'Harvest Reforge Defence',
              details: `Reforged item (guaranteed Defence: ${chosenDefence?.name ?? 'none'})`,
              costChaos,
              resultStatePrefixes: state.prefixes.map((p) => `${p.name} (t${p.tier})`),
              resultStateSuffixes: state.suffixes.map((s) => `${s.name} (t${s.tier})`),
            });
          }
          continue;
        }

        // ------------------------------------------------------------- 2. ANNUL
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

          const targetIndex = Math.floor(Math.random() * removable.length);
          const removedMod = removable[targetIndex];

          if (removedMod.genType === 'Prefix') {
            const idx = state.prefixes.findIndex((m) => m.modId === removedMod.modId && !m.isFractured);
            if (idx !== -1) state.prefixes.splice(idx, 1);
          } else {
            const idx = state.suffixes.findIndex((m) => m.modId === removedMod.modId && !m.isFractured);
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

        // ------------------------------------------------------------- 3. ALLFLAME_EXALT_PREFIX / EXALT_PREFIX
        if (decision.actionType === 'ALLFLAME_EXALT_PREFIX' || decision.actionType === 'EXALT_PREFIX') {
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

          let chosenMod: Mod;
          let evalSummary = '';
          const isAllflame = decision.actionType === 'ALLFLAME_EXALT_PREFIX' && this.allflameEnabled;
          if (isAllflame) {
            const candidates = [
              this.sampleWeightedMod(eligiblePrefixes),
              this.sampleWeightedMod(eligiblePrefixes),
              this.sampleWeightedMod(eligiblePrefixes),
              this.sampleWeightedMod(eligiblePrefixes),
            ].filter((m): m is Mod => m !== null);

            const selection = this.policyEngine.selectBestAllflameCandidate(candidates, state);
            chosenMod = selection.chosenMod;
            evalSummary = ` [Candidates: ${selection.evaluations.map((e) => `${e.mod.name} (V=${e.resultingStateValue.toFixed(1)}c)`).join(', ')}]`;
          } else {
            chosenMod = this.sampleWeightedMod(eligiblePrefixes)!;
          }

          if (chosenMod) {
            state.prefixes.push(toRolledMod(chosenMod));
          }

          if (captureTrace) {
            trialStepLogs.push({
              step: steps,
              actionTaken: decision.actionName,
              details: `Slammed ${chosenMod.name}${evalSummary}`,
              costChaos,
              resultStatePrefixes: state.prefixes.map((p) => `${p.name} (t${p.tier})`),
              resultStateSuffixes: state.suffixes.map((s) => `${s.name} (t${s.tier})`),
            });
          }
          continue;
        }

        // ------------------------------------------------------------- 4. ALLFLAME_EXALT_SUFFIX / EXALT_SUFFIX
        if (decision.actionType === 'ALLFLAME_EXALT_SUFFIX' || decision.actionType === 'EXALT_SUFFIX') {
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
          if (decision.stepAttribution === 4) {
            trialStepCosts.step4 += costChaos;
          } else {
            trialStepCosts.step5 += costChaos;
          }

          let chosenMod: Mod;
          let evalSummary = '';
          const isAllflame = decision.actionType === 'ALLFLAME_EXALT_SUFFIX' && this.allflameEnabled;
          if (isAllflame) {
            const candidates = [
              this.sampleWeightedMod(eligibleSuffixes),
              this.sampleWeightedMod(eligibleSuffixes),
              this.sampleWeightedMod(eligibleSuffixes),
              this.sampleWeightedMod(eligibleSuffixes),
            ].filter((m): m is Mod => m !== null);

            const selection = this.policyEngine.selectBestAllflameCandidate(candidates, state);
            chosenMod = selection.chosenMod;
            evalSummary = ` [Candidates: ${selection.evaluations.map((e) => `${e.mod.name} (V=${e.resultingStateValue.toFixed(1)}c)`).join(', ')}]`;
          } else {
            chosenMod = this.sampleWeightedMod(eligibleSuffixes)!;
          }

          if (chosenMod) {
            state.suffixes.push(toRolledMod(chosenMod));
          }

          if (captureTrace) {
            trialStepLogs.push({
              step: steps,
              actionTaken: decision.actionName,
              details: `Slammed ${chosenMod.name}${evalSummary}`,
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
        // Track outcome branch
        const matchingBranch = getMatchingOutcomeBranch(state, this.target);
        if (matchingBranch) {
          outcomeBranchCounts[matchingBranch.name] = (outcomeBranchCounts[matchingBranch.name] || 0) + 1;
        }

        // Optional Step 6: Finishing Divines
        const finishingDivines = this.divineAction.calculateExpectedFinishingCost(state, this.target);
        if (finishingDivines > 0) {
          const divineCost = finishingDivines * priceBook.getRate('divine');
          trialCostChaos += divineCost;
          trialCurrencies.divine = (trialCurrencies.divine ?? 0) + finishingDivines;
          trialStepCosts.step6 += divineCost;
        }

        completedCosts.push(trialCostChaos);
        for (const [curr, amount] of Object.entries(trialCurrencies)) {
          currencyTotals[curr] = (currencyTotals[curr] ?? 0) + amount;
        }
        stepwiseTotals.step1 += trialStepCosts.step1;
        stepwiseTotals.step2 += trialStepCosts.step2;
        stepwiseTotals.step3 += trialStepCosts.step3;
        stepwiseTotals.step4 += trialStepCosts.step4;
        stepwiseTotals.step5 += trialStepCosts.step5;
        stepwiseTotals.step6 += trialStepCosts.step6;

        if (sampleTraces.length < traceTrialsCount && trialStepLogs.length > 0) {
          sampleTraces.push({
            trialNumber: completedCosts.length,
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
      } else if (steps >= maxStepsPerTrial) {
        timedOutCount++;
      }
    }

    const completedCount = completedCosts.length;
    const completionRate = totalAttempts > 0 ? (completedCount / totalAttempts) * 100 : 0;

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

    const harvestCensus: HarvestCensusData = {
      totalHarvests,
      t1ESSuccesses,
      t1ESSuccessRate: totalHarvests > 0 ? (t1ESSuccesses / totalHarvests) * 100 : 0,
      t1ESOnlyPct: t1ESSuccesses > 0 ? (countT1ESOnly / t1ESSuccesses) * 100 : 0,
      t1ESPlus35EffPct: t1ESSuccesses > 0 ? (countT1ESPlus35 / t1ESSuccesses) * 100 : 0,
      t1ESPlusIntPct: t1ESSuccesses > 0 ? (countT1ESPlusInt / t1ESSuccesses) * 100 : 0,
      t1ESPlusAttributesPct: t1ESSuccesses > 0 ? (countT1ESPlusAttr / t1ESSuccesses) * 100 : 0,
      t1ESPlusAttackSpeedPct: t1ESSuccesses > 0 ? (countT1ESPlusAS / t1ESSuccesses) * 100 : 0,
      t1ESPlusAllResPct: t1ESSuccesses > 0 ? (countT1ESPlusAllRes / t1ESSuccesses) * 100 : 0,
      t1ESPlusIntAndPremiumPct: t1ESSuccesses > 0 ? (countT1ESPlusIntAndPremium / t1ESSuccesses) * 100 : 0,
      t1ESPlus35AndPremiumPct: t1ESSuccesses > 0 ? (countT1ESPlus35AndPremium / t1ESSuccesses) * 100 : 0,
      t1ESPlusJunkOnlyPct: t1ESSuccesses > 0 ? (countT1ESPlusJunkOnly / t1ESSuccesses) * 100 : 0,
    };

    const outcomeBranchDistribution: Record<string, number> = {};
    for (const [name, count] of Object.entries(outcomeBranchCounts)) {
      outcomeBranchDistribution[name] = (count / completedCount) * 100;
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

    const r = Math.random() * totalWeight;
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
