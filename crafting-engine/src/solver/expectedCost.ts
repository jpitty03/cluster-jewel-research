import type { ItemState } from '../domain/ItemState.ts';
import type { CraftAction, SolverContext } from '../domain/CraftAction.ts';
import type { ModPool } from '../domain/ModPool.ts';
import { generateStateKey } from './stateKey.ts';
import { satisfiesTarget, type TargetDefinition } from '../domain/TargetDefinition.ts';
import { DivineAction } from '../actions/divine.ts';
import { calculateTotalWeight } from '../rules/modEligibility.ts';
import type { PriceBook } from '../domain/PriceBook.ts';
import {
  CraftingPolicyEngine,
  type HarvestStrategyComparison,
  type RepresentativeStateAudit,
  type SuffixPoolAuditState,
} from './policyEngine.ts';

export interface AcquisitionBreakdown {
  cleanBaseCostChaos: number;
  prepCostChaos: number;
  fracturingOrbCostChaos: number;
  successChance: number;
  expectedAttempts: number;
}

export interface AcquisitionOption {
  type: 'market' | 'self-fracture' | 'clean-base';
  costChaos: number;
  confidence: 'deterministic' | 'approximate';
  description?: string;
  cleanBaseCostChaos?: number;
  prepCostChaos?: number;
  fracturingOrbCostChaos?: number;
  successChance?: number;
  expectedAttempts?: number;
  breakdown?: AcquisitionBreakdown;
  isRecommended?: boolean;
  reason?: string;
  downstreamCostChaos?: number;
  fullRouteTotalCostChaos?: number;
}

export interface CraftPlanStep {
  stepNumber: number;
  title: string;
  actionName: string;
  description?: string;
  successChance?: number;
  expectedAttempts?: number;
  rawCostChaos: number;
  recoveryCostChaos?: number;
  stepTotalCostChaos: number;
  cumulativeCostChaos: number;
  currencies: Record<string, number>;
  details?: Record<string, any>;
}

export interface FinalOutcomeDistribution {
  name: string;
  probability: number;
  saleValueChaos: number;
}

export interface StateValueNode {
  stateKey: string;
  state: ItemState;
  expectedCostChaos: number;
  bestAction?: CraftAction;
  bestActionCostChaos: number;
  expectedCurrencies: Record<string, number>;
  isTerminal: boolean;
  isRestart: boolean;
  steps?: CraftPlanStep[];
  step1Options?: AcquisitionOption[];
  outcomeDistribution?: FinalOutcomeDistribution[];
  expectedSaleValueChaos?: number;
  policyEngine?: CraftingPolicyEngine;
  harvestComparison?: HarvestStrategyComparison[];
  representativeDecisions?: RepresentativeStateAudit[];
  suffixPoolAudits?: SuffixPoolAuditState[];
  pool?: ModPool;
}

export class ExpectedCostSolver {
  private context: SolverContext;
  private target: TargetDefinition;
  private actions: CraftAction[];
  private divineAction = new DivineAction();
  public policyEngine: CraftingPolicyEngine;

  constructor(context: SolverContext, target: TargetDefinition, actions: CraftAction[]) {
    this.context = context;
    this.target = target;
    this.actions = actions;
    const isAllflame = actions.some((a) => a.id.includes('allflame'));
    this.policyEngine = new CraftingPolicyEngine(target, context.priceBook, context.pool, isAllflame);
  }

  public solve(
    startState: ItemState,
    acquisitionInput?:
      | {
          type: 'market' | 'self-fracture' | 'clean-base';
          costChaos: number;
          confidence: 'deterministic' | 'approximate';
        }
      | number
  ): StateValueNode {
    const key = generateStateKey(startState);

    const acquisition =
      typeof acquisitionInput === 'number'
        ? { type: 'self-fracture' as const, costChaos: acquisitionInput, confidence: 'approximate' as const }
        : acquisitionInput;

    const baseCostChaos = acquisition?.costChaos ?? 0;

    // 1. Check if start state already satisfies target
    if (satisfiesTarget(startState, this.target)) {
      const finishingDivines = this.divineAction.calculateExpectedFinishingCost(startState, this.target);
      const divineCost = finishingDivines * this.context.priceBook.getRate('divine');
      return {
        stateKey: key,
        state: startState,
        expectedCostChaos: divineCost,
        bestActionCostChaos: divineCost,
        expectedCurrencies: finishingDivines > 0 ? { divine: finishingDivines } : {},
        isTerminal: true,
        isRestart: false,
        steps: [],
        policyEngine: this.policyEngine,
      };
    }

    const priceBook = this.context.priceBook;
    const pool = this.context.pool;
    const divineRate = priceBook.getRate('divine');
    const fracOrbRate = priceBook.getRate('fracturing');
    const annulRate = priceBook.getRate('annul');
    const exaltRate = priceBook.getRate('exalt');
    const altRate = 0.2;
    const augRate = 0.05;
    const regalRate = 1.0;
    const benchRate = 4.5;
    const cleanBaseCost = 10;

    // Identify fractured mod on the starting base
    const fracPrefix = startState.prefixes.find((p) => p.isFractured);
    const fracSuffix = startState.suffixes.find((s) => s.isFractured);
    const fracMod = fracPrefix ?? fracSuffix;

    const hasFrac35 = startState.prefixes.some(
      (p) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.isFractured
    );
    const hasFracPrefix = startState.prefixes.some((p) => p.isFractured);
    const hasFracSuffix = startState.suffixes.some((s) => s.isFractured);

    let downstreamCraftCost = this.policyEngine.vEnter;
    if (!hasFrac35) {
      if (hasFracPrefix) {
        downstreamCraftCost = 100000;
      } else if (hasFracSuffix) {
        downstreamCraftCost = 117000;
      }
    }

    // Compute Starting Option Analysis (Market Purchase vs Self-Fracture)
    const step1Options: AcquisitionOption[] = [];
    if (fracMod && pool) {
      const poolMod = pool.getAllMods().find(
        (m) =>
          (fracMod.modGroup ? m.modGroup === fracMod.modGroup : true) &&
          (fracMod.tier !== undefined ? m.tier === fracMod.tier : true)
      );

      const allEligible = pool.getAllMods().filter((m) => m.genType === fracMod.genType && m.ilvl <= (startState.itemLevel ?? 84));
      const totalAffixWeight = calculateTotalWeight(allEligible) || 15650;
      const modWeight = poolMod?.weight ?? 300;

      const altsNeeded = totalAffixWeight / modWeight;
      const prepCost = altsNeeded * altRate + (altsNeeded * 0.25) * augRate + regalRate + benchRate;
      const selfFracCost = 4 * (cleanBaseCost + prepCost + fracOrbRate);
      const fullSelfFrac = selfFracCost + downstreamCraftCost;

      const breakdown: AcquisitionBreakdown = acquisition?.breakdown ?? {
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: prepCost,
        fracturingOrbCostChaos: fracOrbRate,
        successChance: 25.0,
        expectedAttempts: 4.0,
      };

      if (acquisition && acquisition.type === 'market') {
        const fullBuy = acquisition.costChaos + downstreamCraftCost;
        step1Options.push({
          type: 'market',
          costChaos: acquisition.costChaos,
          confidence: 'deterministic',
          description: `Direct market purchase of fractured ${fracMod.name} base`,
          isRecommended: fullBuy <= fullSelfFrac,
          downstreamCostChaos: downstreamCraftCost,
          fullRouteTotalCostChaos: fullBuy,
          reason:
            fullBuy <= fullSelfFrac
              ? `Market purchase total of ${(fullBuy / divineRate).toFixed(2)} div (${fullBuy.toFixed(1)}c) is cheaper than self-fracturing (${fullSelfFrac.toFixed(1)}c).`
              : `Market price is ${(acquisition.costChaos / divineRate).toFixed(2)} div (${acquisition.costChaos.toFixed(1)}c). Deterministic alternative with 0 crafting risk.`,
        });
      }

      // Self-Fracture option
      const selfFracActualCost = acquisition?.type === 'self-fracture' && acquisition.costChaos > 0 ? acquisition.costChaos : selfFracCost;
      const fullActualSelfFrac = selfFracActualCost + downstreamCraftCost;
      step1Options.push({
        type: 'self-fracture',
        costChaos: selfFracActualCost,
        confidence: 'approximate',
        description: `Prepare 4-mod clean base with ${fracMod.name} via Alt/Aug/Regal/Bench and use Fracturing Orb (25% chance)`,
        cleanBaseCostChaos: breakdown.cleanBaseCostChaos,
        prepCostChaos: breakdown.prepCostChaos,
        fracturingOrbCostChaos: breakdown.fracturingOrbCostChaos,
        successChance: breakdown.successChance,
        expectedAttempts: breakdown.expectedAttempts,
        breakdown,
        isRecommended: !acquisition || acquisition.type === 'self-fracture' || fullActualSelfFrac < (baseCostChaos + downstreamCraftCost),
        downstreamCostChaos: downstreamCraftCost,
        fullRouteTotalCostChaos: fullActualSelfFrac,
        reason:
          acquisition?.type === 'market'
            ? fullActualSelfFrac < (baseCostChaos + downstreamCraftCost)
              ? `Self-fracturing saves ${(baseCostChaos - selfFracActualCost).toFixed(1)}c on average vs market purchase.`
              : `Market purchase saves ${(selfFracActualCost - baseCostChaos).toFixed(1)}c vs self-fracturing.`
            : 'Self-fracturing route evaluated with Alt/Aug/Regal/Bench prep + Fracturing Orb.',
      });
    }

    // Determine canonical selected acquisition cost
    const selectedAcquisition = step1Options.find((o) => o.isRecommended) ?? (step1Options.length > 0 ? step1Options[0] : undefined);
    const selectedAcquisitionCost = baseCostChaos > 0 ? baseCostChaos : (selectedAcquisition?.costChaos ?? 0);

    // Finishing divines
    const finishingDivines = this.divineAction.calculateExpectedFinishingCost(startState, this.target);
    const finishingDivineCost = finishingDivines * divineRate;

    // Build Stepwise Crafting Plan
    const steps: CraftPlanStep[] = [];
    let totalExpectedCostChaos = selectedAcquisitionCost;

    // Step 1: Base Acquisition
    steps.push({
      stepNumber: 1,
      title: 'Base Acquisition',
      actionName: selectedAcquisition ? selectedAcquisition.description : (baseCostChaos > 0 ? 'Buy Fractured Base' : 'Acquire Base'),
      description: fracMod ? `Starting fractured base: ${fracMod.name}` : 'Starting clean base',
      rawCostChaos: selectedAcquisitionCost,
      stepTotalCostChaos: selectedAcquisitionCost,
      cumulativeCostChaos: totalExpectedCostChaos,
      currencies: {},
      details: { step1Options },
    });

    if (hasFrac35) {
      // Step 2: Harvest Reforge Tag
      const step2Cost = this.policyEngine.step2Cost;
      totalExpectedCostChaos += step2Cost;
      const harvestTagCapitalized = this.policyEngine.harvestTag.charAt(0).toUpperCase() + this.policyEngine.harvestTag.slice(1);
      steps.push({
        stepNumber: 2,
        title: `Prefix Acquisition: Harvest Reforge ${harvestTagCapitalized}`,
        actionName: `Harvest Reforge ${harvestTagCapitalized}`,
        description: `Reforge with guaranteed ${this.policyEngine.harvestTag} modifier until ${this.policyEngine.harvestModName} hits (${(this.policyEngine.pT1Harvest * 100).toFixed(2)}% per craft).`,
        successChance: this.policyEngine.pT1Harvest * 100,
        expectedAttempts: this.policyEngine.expHarvestsFrac35,
        rawCostChaos: step2Cost,
        stepTotalCostChaos: step2Cost,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: {
          [this.policyEngine.harvestLifeforce]: this.policyEngine.expHarvestsFrac35 * this.policyEngine.harvestLifeforcePerCraft,
        },
        details: {
          harvestLifeforce: this.policyEngine.harvestLifeforce,
          lifeforcePerCraft: this.policyEngine.harvestLifeforcePerCraft,
          expectedHarvests: this.policyEngine.expHarvestsFrac35,
        },
      });

      // Step 3: Annul Cleanup
      const step3Cost = this.policyEngine.step3Cost;
      totalExpectedCostChaos += step3Cost;
      steps.push({
        stepNumber: 3,
        title: 'Suffix Cleanup: Orb of Annulment',
        actionName: 'Orb of Annulment',
        description: `Annul non-target junk suffixes while preserving ${this.policyEngine.harvestModName} and any target suffixes generated during Harvest.`,
        rawCostChaos: step3Cost,
        stepTotalCostChaos: step3Cost,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: {
          annul: this.policyEngine.step3AnnulsFrac35,
        },
        details: {
          expectedAnnuls: this.policyEngine.step3AnnulsFrac35,
        },
      });

      // Step 4: Suffix Completion (Exalts + Recovery Annuls)
      const step4Cost = this.policyEngine.step4Cost;
      totalExpectedCostChaos += step4Cost;
      const targetSuffixList = this.policyEngine.targetSuffixGroups.map((g) => g.name).join(', ');
      steps.push({
        stepNumber: 4,
        title: 'Suffix Completion: Sequential Exalted Slams',
        actionName: 'Exalted Orb Slam (Suffix)',
        description: `Slam open suffix slots with Exalted Orbs for target suffixes (${targetSuffixList}). Annul on misses.`,
        rawCostChaos: this.policyEngine.expExaltsFrac35 * exaltRate,
        recoveryCostChaos: this.policyEngine.step4AnnulsFrac35 * annulRate,
        stepTotalCostChaos: step4Cost,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: {
          exalt: this.policyEngine.expExaltsFrac35,
          annul: this.policyEngine.step4AnnulsFrac35,
        },
        details: {
          expectedExalts: this.policyEngine.expExaltsFrac35,
          expectedAnnuls: this.policyEngine.step4AnnulsFrac35,
        },
      });
    } else {
      totalExpectedCostChaos += downstreamCraftCost;
      steps.push({
        stepNumber: 2,
        title: 'Non-Fractured 35% Route: Sequential Exalt & Annul Completion',
        actionName: 'Exalted Orb Slam & Annul Recovery',
        description: 'Exalt slam prefixes/suffixes with Annul recovery on non-Fractured 35% Effect base.',
        rawCostChaos: downstreamCraftCost,
        stepTotalCostChaos: downstreamCraftCost,
        cumulativeCostChaos: totalExpectedCostChaos,
      });
    }

    // Step 5: Divine Finishing (if required)
    if (finishingDivines > 0) {
      totalExpectedCostChaos += finishingDivineCost;
      steps.push({
        stepNumber: 5,
        title: 'Perfect Roll Finishing: Divine Orbs',
        actionName: 'Divine Orb',
        description: 'Divine jewel until target numeric roll values are achieved.',
        expectedAttempts: finishingDivines,
        rawCostChaos: finishingDivineCost,
        stepTotalCostChaos: finishingDivineCost,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: { divine: finishingDivines },
      });
    }

    // Build Terminal Outcome Distribution
    const outcomeDistribution: FinalOutcomeDistribution[] = [];
    let expectedSaleValueChaos = this.target.saleValueChaos ?? 0;

    if (this.target.outcomeBranches && this.target.outcomeBranches.length > 0) {
      expectedSaleValueChaos = 0;
      for (const branch of this.target.outcomeBranches) {
        const prob = this.policyEngine.branchProbabilitiesMap.get(branch.name) ?? (1 / this.target.outcomeBranches.length);
        const saleVal = branch.saleValueChaos ?? 0;
        outcomeDistribution.push({
          name: branch.name,
          probability: prob,
          saleValueChaos: saleVal,
        });
        expectedSaleValueChaos += prob * saleVal;
      }
    } else {
      outcomeDistribution.push({
        name: 'Target Satisfied',
        probability: 1.0,
        saleValueChaos: expectedSaleValueChaos,
      });
    }

    // Currencies record
    const expectedCurrencies: Record<string, number> = {
      [this.policyEngine.harvestLifeforce]: this.policyEngine.expHarvestsFrac35 * this.policyEngine.harvestLifeforcePerCraft,
      annul: this.policyEngine.expAnnulsFrac35,
      exalt: this.policyEngine.expExaltsFrac35,
    };
    if (finishingDivines > 0) {
      expectedCurrencies.divine = finishingDivines;
    }

    const harvestComparison = this.policyEngine.getHarvestStrategyComparison(expectedSaleValueChaos, selectedAcquisitionCost);
    const representativeDecisions = this.policyEngine.getRepresentativeStateAudits();
    const suffixPoolAudits = this.policyEngine.getSuffixPoolAudit();

    return {
      stateKey: key,
      state: startState,
      expectedCostChaos: totalExpectedCostChaos - selectedAcquisitionCost,
      bestAction: this.actions[0],
      bestActionCostChaos: totalExpectedCostChaos - selectedAcquisitionCost,
      expectedCurrencies,
      isTerminal: false,
      isRestart: false,
      steps,
      step1Options,
      outcomeDistribution,
      expectedSaleValueChaos,
      policyEngine: this.policyEngine,
      harvestComparison,
      representativeDecisions,
      suffixPoolAudits,
      pool,
    };
  }
}
