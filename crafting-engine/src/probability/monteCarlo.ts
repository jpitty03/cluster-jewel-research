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
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  message?: string;
}

export class MonteCarloSimulator {
  private context: SolverContext;
  private target: TargetDefinition;
  private allflameEnabled: boolean;
  private divineAction = new DivineAction();

  constructor(context: SolverContext, target: TargetDefinition, allflameEnabled = false) {
    this.context = context;
    this.target = target;
    this.allflameEnabled = allflameEnabled;
  }

  runSimulation(
    startStateFactory: () => ItemState,
    baseCostChaos: number,
    numTrials = 2000,
    maxStepsPerTrial = 500
  ): SimulationResult {
    const allMods = this.context.pool.getAllMods();
    const priceBook = this.context.priceBook;

    const completedCosts: number[] = [];
    const currencyTotals: Record<string, number> = {};
    let timedOutCount = 0;
    let failedCount = 0;

    // Full Defence pool matching Shield Large Cluster (total weight ~4200)
    const defenceMods = allMods.filter((m) =>
      (m.craftTags.includes('defences') ||
        m.tags.includes('defences') ||
        m.modGroup.includes('ES') ||
        m.modGroup.includes('Armour') ||
        m.modGroup.includes('Shield') ||
        m.modGroup.includes('Block')) &&
      m.ilvl <= 84
    );

    for (let trial = 0; trial < numTrials; trial++) {
      let state = startStateFactory();
      let trialCostChaos = baseCostChaos;
      const trialCurrencies: Record<string, number> = {};

      let steps = 0;
      let isCompleted = false;

      while (steps < maxStepsPerTrial) {
        // Goal check
        if (satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
          isCompleted = true;
          break;
        }

        steps++;

        // ------------------------------------------------------------- 1. If prefixes lack T1 ES -> Harvest Reforge Defence
        const hasT1ES = state.prefixes.some(
          (p) => p.modGroup === 'AfflictionJewelSmallPassivesGrantES' && p.tier === 1
        );

        if (!hasT1ES) {
          // Harvest Reforge Defence cost: 75 Primal Lifeforce (1.5625c)
          const costChaos = priceBook.toChaos(75, 'primalLifeforce');
          trialCostChaos += costChaos;
          trialCurrencies.primalLifeforce = (trialCurrencies.primalLifeforce ?? 0) + 75;

          // Preserve fractured mods
          state.prefixes = state.prefixes.filter((m) => m.isFractured);
          state.suffixes = state.suffixes.filter((m) => m.isFractured);

          // Guarantee 1 defence mod from full defence pool (T1 ES = 300 / 4200 = 7.14%)
          const chosenDefence = this.sampleWeightedMod(defenceMods);
          if (chosenDefence) {
            state.prefixes.push(toRolledMod(chosenDefence));
          }

          // Random additional affixes (PoE rare rules: 50% 1 extra, 50% 2 extra)
          const extraAffixesCount = Math.random() < 0.5 ? 1 : 2;
          for (let e = 0; e < extraAffixesCount; e++) {
            const eligible = getEligibleMods(state, allMods);
            const extra = this.sampleWeightedMod(eligible);
            if (extra) {
              if (extra.genType === 'Prefix' && canAcceptPrefix(state)) {
                state.prefixes.push(toRolledMod(extra));
              } else if (extra.genType === 'Suffix' && canAcceptSuffix(state)) {
                state.suffixes.push(toRolledMod(extra));
              }
            }
          }
          continue;
        }

        // ------------------------------------------------------------- 2. Clean non-target junk affixes
        const removable = getRemovableAffixes(state);
        const junkMods = removable.filter((m) => !this.matchesTargetRequirement(m));

        if (junkMods.length > 0) {
          // Annul cost: 1 Annul (9c)
          const costChaos = priceBook.toChaos(1, 'annul');
          trialCostChaos += costChaos;
          trialCurrencies.annul = (trialCurrencies.annul ?? 0) + 1;

          // Pick a random removable mod uniformly
          const targetIndex = Math.floor(Math.random() * removable.length);
          const removedMod = removable[targetIndex];

          if (removedMod.genType === 'Prefix') {
            const idx = state.prefixes.findIndex((m) => m.modId === removedMod.modId && !m.isFractured);
            if (idx !== -1) state.prefixes.splice(idx, 1);
          } else {
            const idx = state.suffixes.findIndex((m) => m.modId === removedMod.modId && !m.isFractured);
            if (idx !== -1) state.suffixes.splice(idx, 1);
          }
          continue;
        }

        // ------------------------------------------------------------- 3. Step 4: Slam 35% Effect (Prefix) if missing
        const has35Eff = state.prefixes.some(
          (p) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.tier === 1
        );

        if (!has35Eff && canAcceptPrefix(state)) {
          const eligiblePrefixes = getEligibleMods(state, allMods, { requiredGenType: 'Prefix' });
          if (eligiblePrefixes.length > 0) {
            const costChaos = priceBook.toChaos(1, 'exalt');
            trialCostChaos += costChaos;
            trialCurrencies.exalt = (trialCurrencies.exalt ?? 0) + 1;

            let chosenMod: Mod;
            if (this.allflameEnabled) {
              const candidates = [
                this.sampleWeightedMod(eligiblePrefixes),
                this.sampleWeightedMod(eligiblePrefixes),
                this.sampleWeightedMod(eligiblePrefixes),
                this.sampleWeightedMod(eligiblePrefixes),
              ].filter((m): m is Mod => m !== null);

              chosenMod = candidates.reduce((best, cur) => {
                const curScore = this.scoreModProgress(cur);
                const bestScore = this.scoreModProgress(best);
                return curScore > bestScore ? cur : best;
              }, candidates[0]);
            } else {
              chosenMod = this.sampleWeightedMod(eligiblePrefixes)!;
            }

            if (chosenMod) {
              state.prefixes.push(toRolledMod(chosenMod));
            }
            continue;
          }
        }

        // ------------------------------------------------------------- 4. Step 5: Slam Final Target Suffix if missing
        const hasTargetSuffix = state.suffixes.some((s) =>
          this.target.outcomeBranches?.some((b) =>
            b.requiredMods.some((req) =>
              (req.modGroup ? s.modGroup === req.modGroup : true) &&
              (req.maxTierNumber !== undefined ? s.tier <= req.maxTierNumber : true)
            )
          )
        );

        if (has35Eff && !hasTargetSuffix && canAcceptSuffix(state)) {
          const eligibleSuffixes = getEligibleMods(state, allMods, { requiredGenType: 'Suffix' });
          if (eligibleSuffixes.length > 0) {
            const costChaos = priceBook.toChaos(1, 'exalt');
            trialCostChaos += costChaos;
            trialCurrencies.exalt = (trialCurrencies.exalt ?? 0) + 1;

            let chosenMod: Mod;
            if (this.allflameEnabled) {
              const candidates = [
                this.sampleWeightedMod(eligibleSuffixes),
                this.sampleWeightedMod(eligibleSuffixes),
                this.sampleWeightedMod(eligibleSuffixes),
                this.sampleWeightedMod(eligibleSuffixes),
              ].filter((m): m is Mod => m !== null);

              chosenMod = candidates.reduce((best, cur) => {
                const curScore = this.scoreModProgress(cur);
                const bestScore = this.scoreModProgress(best);
                return curScore > bestScore ? cur : best;
              }, candidates[0]);
            } else {
              chosenMod = this.sampleWeightedMod(eligibleSuffixes)!;
            }

            if (chosenMod) {
              state.suffixes.push(toRolledMod(chosenMod));
            }
            continue;
          }
        }

        // Check completion
        if (satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
          isCompleted = true;
          break;
        }

        // No action took progress
        failedCount++;
        break;
      }

      if (isCompleted || satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
        // Step 6: Finishing Divines
        const finishingDivines = this.divineAction.calculateExpectedFinishingCost(state, this.target);
        if (finishingDivines > 0) {
          const divineCost = finishingDivines * priceBook.getRate('divine');
          trialCostChaos += divineCost;
          trialCurrencies.divine = (trialCurrencies.divine ?? 0) + finishingDivines;
        }

        completedCosts.push(trialCostChaos);
        for (const [curr, amount] of Object.entries(trialCurrencies)) {
          currencyTotals[curr] = (currencyTotals[curr] ?? 0) + amount;
        }
      } else if (steps >= maxStepsPerTrial) {
        timedOutCount++;
      }
    }

    const completedCount = completedCosts.length;
    const completionRate = (completedCount / numTrials) * 100;

    if (completedCount === 0) {
      return {
        totalTrials: numTrials,
        completedTrials: 0,
        failedTrials: failedCount,
        timedOutTrials: timedOutCount,
        completionRate: 0,
        status: 'FAILED',
        message: `VALIDATION FAILED: 0 / ${numTrials} simulations reached a terminal state within step limit (${maxStepsPerTrial}).`,
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

    const status = completionRate >= 95 ? 'SUCCESS' : 'PARTIAL';

    return {
      totalTrials: numTrials,
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

  private matchesTargetRequirement(mod: Mod | { modId: string; modGroup: string; tier: number; name: string }): boolean {
    const matchesMain = this.target.requiredMods.some((req) =>
      (req.modGroup ? mod.modGroup === req.modGroup : true) &&
      (req.modId ? mod.modId === req.modId : true) &&
      (req.name ? mod.name === req.name : true) &&
      (req.maxTierNumber !== undefined ? mod.tier <= req.maxTierNumber : true)
    );
    if (matchesMain) return true;

    if (this.target.outcomeBranches) {
      return this.target.outcomeBranches.some((b) =>
        b.requiredMods.some((req) =>
          (req.modGroup ? mod.modGroup === req.modGroup : true) &&
          (req.modId ? mod.modId === req.modId : true) &&
          (req.name ? mod.name === req.name : true) &&
          (req.maxTierNumber !== undefined ? mod.tier <= req.maxTierNumber : true)
        )
      );
    }
    return false;
  }

  private scoreModProgress(mod: Mod): number {
    // Check main required mods
    for (const req of this.target.requiredMods) {
      if (
        (req.modGroup ? mod.modGroup === req.modGroup : true) &&
        (req.modId ? mod.modId === req.modId : true) &&
        (req.name ? mod.name === req.name : true) &&
        (req.maxTierNumber !== undefined ? mod.tier <= req.maxTierNumber : true)
      ) {
        return 1000 - mod.tier * 10;
      }
    }

    // Check outcome branches
    if (this.target.outcomeBranches) {
      for (const branch of this.target.outcomeBranches) {
        for (const req of branch.requiredMods) {
          if (
            (req.modGroup ? mod.modGroup === req.modGroup : true) &&
            (req.modId ? mod.modId === req.modId : true) &&
            (req.name ? mod.name === req.name : true) &&
            (req.maxTierNumber !== undefined ? mod.tier <= req.maxTierNumber : true)
          ) {
            const saleVal = branch.saleValueChaos ?? 100;
            return 500 + saleVal / 100;
          }
        }
      }
    }

    return 0;
  }
}
