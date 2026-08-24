import type { ItemState } from '../domain/ItemState.ts';
import type { CraftAction, SolverContext } from '../domain/CraftAction.ts';
import type { ModPool } from '../domain/ModPool.ts';
import { generateStateKey } from './stateKey.ts';
import { satisfiesTarget, type TargetDefinition } from '../domain/TargetDefinition.ts';
import { DivineAction } from '../actions/divine.ts';
import {
  CraftingPolicyEngine,
  type HarvestStrategyComparison,
  type RepresentativeStateAudit,
  type SuffixPoolAuditState,
} from './policyEngine.ts';
import { GenericSearchEngine } from './genericSearch.ts';

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
  confidence: 'deterministic' | 'approximate' | 'executable';
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
    acquisitionInput?: AcquisitionOption | number
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
    const annulRate = priceBook.getRate('annul');
    const exaltRate = priceBook.getRate('exalt');

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
        downstreamCraftCost = Infinity;
      } else if (hasFracSuffix) {
        downstreamCraftCost = Infinity;
      } else {
        // Clean/normal base without fractured mod
        const genericSearch = new GenericSearchEngine(this.context, this.target);
        const searchResult = genericSearch.search(startState);
        downstreamCraftCost = searchResult.totalExpectedCostChaos;

        if (searchResult.isTargetSatisfied) {
          const cleanSteps: CraftPlanStep[] = [
            {
              stepNumber: 1,
              title: 'Base Acquisition: Clean Normal Jewel',
              actionName: 'Acquire Clean Base',
              description: 'Starting clean normal base with 0 affixes',
              rawCostChaos: baseCostChaos,
              stepTotalCostChaos: baseCostChaos,
              cumulativeCostChaos: baseCostChaos,
              currencies: {},
            },
          ];

          for (let i = 0; i < searchResult.steps.length; i++) {
            const s = searchResult.steps[i];
            cleanSteps.push({
              stepNumber: i + 2,
              title: s.selectedAction,
              actionName: s.selectedAction,
              description: s.reason,
              rawCostChaos: s.immediateCostChaos,
              stepTotalCostChaos: s.continuationCostChaos,
              cumulativeCostChaos: baseCostChaos + s.continuationCostChaos,
              currencies: s.selectedAction.includes('Transmutation')
                ? { transmutation: searchResult.expectedCurrencies.transmutation ?? 1 }
                : { alteration: searchResult.expectedCurrencies.alteration ?? 0 },
            });
          }

          return {
            stateKey: key,
            state: startState,
            expectedCostChaos: downstreamCraftCost,
            bestAction: this.actions[0],
            bestActionCostChaos: downstreamCraftCost,
            expectedCurrencies: searchResult.expectedCurrencies,
            isTerminal: false,
            isRestart: false,
            steps: cleanSteps,
            step1Options: [],
            outcomeDistribution: [{ name: 'Target Satisfied', probability: 1.0, saleValueChaos: this.target.saleValueChaos ?? 0 }],
            expectedSaleValueChaos: this.target.saleValueChaos ?? 0,
            policyEngine: this.policyEngine,
            pool,
          };
        } else {
          downstreamCraftCost = Infinity;
        }
      }
    }

    // The acquisition price is supplied by strategy discovery. In particular, this solver never
    // reconstructs the retired Alt/Aug/Regal/Bench + fixed-4x fracture estimate. Core discovery
    // supplies a certified executable synthesis cost; historical fixtures may still explicitly
    // pass their own reference acquisition for regression reporting.
    const step1Options: AcquisitionOption[] = [];
    if (fracMod && acquisition) {
      const fullRouteTotalCostChaos = acquisition.costChaos + downstreamCraftCost;
      step1Options.push({
        ...acquisition,
        description: acquisition.description ??
          (acquisition.type === 'self-fracture'
            ? `Executable or explicitly supplied self-fracture acquisition for ${fracMod.name}`
            : `Explicitly supplied acquisition for fractured ${fracMod.name}`),
        isRecommended: true,
        downstreamCostChaos: downstreamCraftCost,
        fullRouteTotalCostChaos,
        reason: acquisition.confidence === 'executable'
          ? 'Self-fracture acquisition cost is a certified executable synthesis incumbent.'
          : 'Acquisition cost was supplied explicitly by the calling fixture.',
      });
    }

    // Determine canonical selected acquisition cost
    const selectedAcquisition = step1Options[0];
    const selectedAcquisitionCost = acquisition?.costChaos ?? baseCostChaos;

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
      actionName: selectedAcquisition?.description ?? (baseCostChaos > 0 ? 'Buy Fractured Base' : 'Acquire Base'),
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
        currencies: {
          exalt: this.policyEngine.expExaltsFrac35,
          annul: this.policyEngine.step4AnnulsFrac35,
        },
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
