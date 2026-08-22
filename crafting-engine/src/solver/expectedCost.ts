import type { ItemState } from '../domain/ItemState.ts';
import type { CraftAction, SolverContext } from '../domain/CraftAction.ts';
import type { ModPool } from '../domain/ModPool.ts';
import { generateStateKey } from './stateKey.ts';
import { satisfiesTarget, type TargetDefinition } from '../domain/TargetDefinition.ts';
import { DivineAction } from '../actions/divine.ts';
import { getEligibleMods, calculateTotalWeight } from '../rules/modEligibility.ts';
import type { PriceBook } from '../domain/PriceBook.ts';
import {
  CraftingPolicyEngine,
  type HarvestStrategyComparison,
  type RepresentativeStateAudit,
} from './policyEngine.ts';

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

export interface StartingOptionAnalysis {
  name: string;
  description: string;
  purchaseCostChaos?: number;
  cleanBaseCostChaos?: number;
  prepCostChaos?: number;
  fracturingOrbCostChaos?: number;
  successChance?: number;
  expectedAttempts?: number;
  expectedTotalCostChaos: number;
  downstreamCostChaos?: number;
  fullRouteTotalCostChaos?: number;
  isRecommended: boolean;
  reason?: string;
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
  step1Options?: StartingOptionAnalysis[];
  outcomeDistribution?: FinalOutcomeDistribution[];
  expectedSaleValueChaos?: number;
  policyEngine?: CraftingPolicyEngine;
  harvestComparison?: HarvestStrategyComparison[];
  representativeDecisions?: RepresentativeStateAudit[];
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

  solve(startState: ItemState, baseCostChaos = 0): StateValueNode {
    const key = generateStateKey(startState);

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
    const isAllflame = this.actions.some((a) => a.id.includes('allflame'));

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

    const isFracPrefixDirectRoute =
      fracPrefix &&
      fracPrefix.modGroup !== 'AfflictionJewelSmallPassivesHaveIncreasedEffect' &&
      this.policyEngine.isExactTarget;

    const hasFrac35 =
      startState.prefixes.some((p) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.isFractured);

    // Compute Starting Option Analysis (Market Purchase vs Self-Fracture)
    let step1Options: StartingOptionAnalysis[] | undefined = undefined;
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

      let buyCost = baseCostChaos > 0 ? baseCostChaos : 8 * divineRate;
      if (baseCostChaos === 0) {
        if (fracMod.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect') {
          buyCost = 13 * divineRate;
        } else if (fracMod.modGroup === 'AfflictionJewelSmallPassivesGrantInt') {
          buyCost = 8 * divineRate;
        } else if (fracMod.modGroup === 'AfflictionJewelSmallPassivesGrantLife') {
          buyCost = 8 * divineRate;
        } else {
          buyCost = 5 * divineRate;
        }
      }

      let downstreamCost = 0;
      if (isFracPrefixDirectRoute) {
        downstreamCost = this.policyEngine.vFracLifeDownstream;
      } else if (hasFrac35) {
        downstreamCost = this.policyEngine.vEnter;
      } else if (fracSuffix) {
        downstreamCost = this.policyEngine.isExactTarget
          ? this.policyEngine.vFracSuffDownstream
          : this.policyEngine.vStep2 + this.policyEngine.vStep4;
      }

      const fullBuy = buyCost + downstreamCost;
      const fullSelfFrac = selfFracCost + downstreamCost;

      step1Options = [
        {
          name: `Option A: Buy fractured ${fracMod.name} base`,
          description: `Direct market purchase of fractured ${fracMod.name} base`,
          purchaseCostChaos: buyCost,
          prepCostChaos: 0,
          expectedTotalCostChaos: buyCost,
          downstreamCostChaos: downstreamCost,
          fullRouteTotalCostChaos: fullBuy,
          isRecommended: fullBuy <= fullSelfFrac,
          reason:
            fullBuy <= fullSelfFrac
              ? `Market purchase total of ${(fullBuy / divineRate).toFixed(2)} div (${fullBuy.toFixed(1)}c) is cheaper than self-fracturing (${fullSelfFrac.toFixed(1)}c).`
              : `Market price is ${(buyCost / divineRate).toFixed(2)} div (${buyCost.toFixed(1)}c). Deterministic alternative with 0 crafting risk.`,
        },
        {
          name: `Option B: Self-fracture ${fracMod.name} (Clean 12p base)`,
          description: `Prepare 4-mod clean base with ${fracMod.name} via Alt/Aug/Regal/Bench and use Fracturing Orb (25% chance)`,
          cleanBaseCostChaos: cleanBaseCost,
          prepCostChaos: prepCost,
          fracturingOrbCostChaos: fracOrbRate,
          successChance: 25.0,
          expectedAttempts: 4.0,
          expectedTotalCostChaos: selfFracCost,
          downstreamCostChaos: downstreamCost,
          fullRouteTotalCostChaos: fullSelfFrac,
          isRecommended: fullSelfFrac < fullBuy,
          reason:
            fullSelfFrac < fullBuy
              ? `Self-fracturing saves ${(fullBuy - fullSelfFrac).toFixed(1)}c on average vs market purchase.`
              : `Market purchase saves ${(fullSelfFrac - fullBuy).toFixed(1)}c vs self-fracturing.`,
        },
      ];
    }

    // Finishing divines
    const finishingDivines = this.divineAction.calculateExpectedFinishingCost(startState, this.target);
    const finishingDivineCost = finishingDivines * divineRate;

    // Build Stepwise Crafting Plan
    const steps: CraftPlanStep[] = [];
    const expectedCurrencies: Record<string, number> = {};
    let totalExpectedCostChaos = baseCostChaos;

    // Step 1: Base Acquisition
    steps.push({
      stepNumber: 1,
      title: 'Base Acquisition',
      actionName: baseCostChaos > 0 ? (step1Options?.find((o) => o.isRecommended)?.name ?? 'Acquire Fractured Base') : 'Acquire Base',
      description: fracMod ? `Starting fractured base: ${fracMod.name}` : 'Starting clean base',
      rawCostChaos: baseCostChaos,
      stepTotalCostChaos: baseCostChaos,
      cumulativeCostChaos: totalExpectedCostChaos,
      currencies: {},
      details: { step1Options },
    });

    if (isFracPrefixDirectRoute) {
      // ------------------------------------------------------------- ROUTE 1: Fractured Non-Harvest Prefix (e.g. Fractured Life in Craft C)
      const p4 = this.policyEngine.p4;
      const effExalts = 1 / p4;
      const effAnnuls = (1 - p4) / p4;
      const effRaw = effExalts * exaltRate;
      const effRec = effAnnuls * annulRate;
      const step2Cost = this.policyEngine.vPrefEff;
      totalExpectedCostChaos += step2Cost;

      steps.push({
        stepNumber: 2,
        title: 'Prefix Completion: 35% Increased Effect',
        actionName: isAllflame ? 'Allflame Exalted Orb (Prefix: 35% Effect)' : 'Exalted Orb Slam (Prefix: 35% Effect)',
        description: `Directly slam 35% Increased Effect on open prefix slot (${(p4 * 100).toFixed(2)}% hit rate). Annul on miss (100% safe to retry).`,
        successChance: p4 * 100,
        expectedAttempts: effExalts,
        rawCostChaos: effRaw,
        recoveryCostChaos: effRec,
        stepTotalCostChaos: step2Cost,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: {
          exalt: effExalts,
          annul: effAnnuls,
        },
        details: {
          targetMod: '35% increased Effect',
          hitRatePct: p4 * 100,
          expectedExalts: effExalts,
          expectedAnnuls: effAnnuls,
        },
      });

      const suffExalts = this.policyEngine.expExaltsFracLife - effExalts;
      const suffAnnuls = this.policyEngine.expAnnulsFracLife - effAnnuls;
      const step3Cost = this.policyEngine.vFracLifeSuffixes;
      totalExpectedCostChaos += step3Cost;

      steps.push({
        stepNumber: 3,
        title: 'Suffix Completion: +4 All Attributes & +5% Chaos Resistance',
        actionName: isAllflame ? 'Allflame Exalted Orb (Suffix: S0/S1 Markov)' : 'Exalted Orb Slam (Suffix: S0/S1 Markov)',
        description:
          'Solve exact 5-state Markov linear system for target suffixes. If a target suffix hits, keep it and slam the other; if non-target hits, Annul with 50% recovery.',
        expectedAttempts: suffExalts,
        rawCostChaos: suffExalts * exaltRate,
        recoveryCostChaos: suffAnnuls * annulRate,
        stepTotalCostChaos: step3Cost,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: {
          exalt: suffExalts,
          annul: suffAnnuls,
        },
        details: {
          expectedExalts: suffExalts,
          expectedAnnuls: suffAnnuls,
          vFracLifeAttr: this.policyEngine.vFracLifeAttr,
          vFracLifeChaos: this.policyEngine.vFracLifeChaos,
        },
      });

      if (finishingDivines > 0) {
        totalExpectedCostChaos += finishingDivineCost;
        steps.push({
          stepNumber: 4,
          title: 'Divine Finishing (Max Numeric Rolls)',
          actionName: 'Divine Orb',
          description: 'Reroll explicit numeric values until all target mods reach maximum values.',
          expectedAttempts: finishingDivines,
          rawCostChaos: finishingDivineCost,
          stepTotalCostChaos: finishingDivineCost,
          cumulativeCostChaos: totalExpectedCostChaos,
          currencies: { divine: finishingDivines },
        });
      }

      expectedCurrencies.exalt = this.policyEngine.expExaltsFracLife;
      expectedCurrencies.annul = this.policyEngine.expAnnulsFracLife;
      if (finishingDivines > 0) expectedCurrencies.divine = finishingDivines;
    } else if (hasFrac35) {
      // ------------------------------------------------------------- ROUTE 2: Fractured 35% Effect (Harvest Route)
      const harvestLifeforce = this.policyEngine.harvestLifeforce;
      const harvestTag = this.policyEngine.harvestTag;
      const lifeforcePerCraft = this.policyEngine.harvestLifeforcePerCraft;
      const lifeforceRate = priceBook.toChaos(lifeforcePerCraft, harvestLifeforce as any) / lifeforcePerCraft;

      const expHarvests = this.policyEngine.expHarvestsFrac35;
      const step2Raw = expHarvests * lifeforcePerCraft * lifeforceRate;
      totalExpectedCostChaos += step2Raw;

      steps.push({
        stepNumber: 2,
        title: `Harvest Reforge ${harvestTag.charAt(0).toUpperCase() + harvestTag.slice(1)} (Guarantee ${this.policyEngine.harvestModName})`,
        actionName: `Harvest Reforge ${harvestTag.charAt(0).toUpperCase() + harvestTag.slice(1)}`,
        description: `Reforge with guaranteed ${harvestTag} modifier until ${this.policyEngine.harvestModName} hits (${(this.policyEngine.pT1ES * 100).toFixed(2)}% per craft).`,
        successChance: this.policyEngine.pT1ES * 100,
        expectedAttempts: expHarvests,
        rawCostChaos: step2Raw,
        stepTotalCostChaos: step2Raw,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: {
          [harvestLifeforce]: expHarvests * lifeforcePerCraft,
        },
        details: {
          harvestTag,
          lifeforceType: harvestLifeforce,
          lifeforcePerCraft,
          expectedHarvests: expHarvests,
        },
      });

      const step3Annuls = this.policyEngine.step3AnnulsFrac35;
      const step3Cost = step3Annuls * annulRate;
      totalExpectedCostChaos += step3Cost;

      steps.push({
        stepNumber: 3,
        title: 'Annul Cleanup: Isolate Target Prefixes',
        actionName: 'Orb of Annulment',
        description: 'Remove unwanted extra affixes generated during Harvest reforge. If the guaranteed mod is removed, return to Step 2.',
        expectedAttempts: step3Annuls,
        rawCostChaos: step3Cost,
        stepTotalCostChaos: step3Cost,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: { annul: step3Annuls },
        details: { expectedAnnuls: step3Annuls },
      });

      const expExalts = this.policyEngine.expExaltsFrac35;
      const step4Annuls = this.policyEngine.step4AnnulsFrac35;
      const step4Cost = expExalts * exaltRate + step4Annuls * annulRate;
      totalExpectedCostChaos += step4Cost;

      steps.push({
        stepNumber: 4,
        title: 'Suffix Slam & Annul Loop',
        actionName: isAllflame ? 'Allflame Exalted Orb (Suffix Slam)' : 'Exalted Orb Slam (Suffix Slam)',
        description:
          'Slam open suffix slots for target suffixes. Keep target hits; Annul junk affixes with state-aware Bellman continuation EV.',
        expectedAttempts: expExalts,
        rawCostChaos: expExalts * exaltRate,
        recoveryCostChaos: step4Annuls * annulRate,
        stepTotalCostChaos: step4Cost,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: {
          exalt: expExalts,
          annul: step4Annuls,
        },
        details: {
          expectedExalts: expExalts,
          expectedAnnuls: step4Annuls,
        },
      });

      if (finishingDivines > 0) {
        totalExpectedCostChaos += finishingDivineCost;
        steps.push({
          stepNumber: 5,
          title: 'Divine Finishing (Max Numeric Rolls)',
          actionName: 'Divine Orb',
          description: 'Reroll explicit numeric values until all target mods reach maximum values.',
          expectedAttempts: finishingDivines,
          rawCostChaos: finishingDivineCost,
          stepTotalCostChaos: finishingDivineCost,
          cumulativeCostChaos: totalExpectedCostChaos,
          currencies: { divine: finishingDivines },
        });
      }

      expectedCurrencies[harvestLifeforce] = expHarvests * lifeforcePerCraft;
      expectedCurrencies.annul = this.policyEngine.expAnnulsFrac35;
      expectedCurrencies.exalt = this.policyEngine.expExaltsFrac35;
      if (finishingDivines > 0) expectedCurrencies.divine = finishingDivines;
    } else if (fracSuffix) {
      // ------------------------------------------------------------- ROUTE 3: Fractured Suffix Route
      const harvestLifeforce = this.policyEngine.harvestLifeforce;
      const harvestTag = this.policyEngine.harvestTag;
      const lifeforcePerCraft = this.policyEngine.harvestLifeforcePerCraft;
      const lifeforceRate = priceBook.toChaos(lifeforcePerCraft, harvestLifeforce as any) / lifeforcePerCraft;

      const expHarvests = this.policyEngine.expHarvestsFracSuff;
      const step2Raw = expHarvests * lifeforcePerCraft * lifeforceRate;
      const step3Annuls = this.policyEngine.step3AnnulsFracSuff;
      const step3Cost = step3Annuls * annulRate;
      const harvTotalCost = step2Raw + step3Cost;
      totalExpectedCostChaos += harvTotalCost;

      steps.push({
        stepNumber: 2,
        title: `Harvest Reforge ${harvestTag.charAt(0).toUpperCase() + harvestTag.slice(1)} & Cleanup (Hit ${this.policyEngine.harvestModName})`,
        actionName: `Harvest Reforge ${harvestTag.charAt(0).toUpperCase() + harvestTag.slice(1)}`,
        description: `Reforge with guaranteed ${harvestTag} modifier until ${this.policyEngine.harvestModName} hits and clean unwanted affixes.`,
        successChance: this.policyEngine.pT1ES * 100,
        expectedAttempts: expHarvests,
        rawCostChaos: step2Raw,
        recoveryCostChaos: step3Cost,
        stepTotalCostChaos: harvTotalCost,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: {
          [harvestLifeforce]: expHarvests * lifeforcePerCraft,
          annul: step3Annuls,
        },
      });

      const p4 = this.policyEngine.p4;
      const effExalts = 1 / p4;
      const effAnnuls = (1 - p4) / p4;
      const step3CostVal = (exaltRate + (1 - p4) * (1.5 * annulRate + 0.5 * harvTotalCost)) / p4;
      totalExpectedCostChaos += step3CostVal;

      steps.push({
        stepNumber: 3,
        title: 'Prefix Slam: 35% Increased Effect',
        actionName: isAllflame ? 'Allflame Exalted Orb (Prefix: 35% Effect)' : 'Exalted Orb Slam (Prefix: 35% Effect)',
        description: `Slam open prefix slot for 35% Increased Effect (${(p4 * 100).toFixed(2)}% hit rate). Annul on miss with recursive Harvest recovery.`,
        successChance: p4 * 100,
        expectedAttempts: effExalts,
        rawCostChaos: effExalts * exaltRate,
        recoveryCostChaos: step3CostVal - effExalts * exaltRate,
        stepTotalCostChaos: step3CostVal,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: {
          exalt: effExalts,
          annul: effAnnuls,
        },
      });

      const pRem = this.policyEngine.pRemSuff;
      const remExalts = 1 / pRem;
      const remAnnuls = (1 - pRem) / pRem;
      const step4CostVal = this.policyEngine.vRemSuff;
      totalExpectedCostChaos += step4CostVal;

      steps.push({
        stepNumber: 4,
        title: 'Final Suffix Slam',
        actionName: isAllflame ? 'Allflame Exalted Orb (Final Suffix)' : 'Exalted Orb Slam (Final Suffix)',
        description: `Slam final open suffix slot (${(pRem * 100).toFixed(2)}% hit rate). Annul on miss with recursive prefix/Harvest recovery.`,
        successChance: pRem * 100,
        expectedAttempts: remExalts,
        rawCostChaos: remExalts * exaltRate,
        recoveryCostChaos: step4CostVal - remExalts * exaltRate,
        stepTotalCostChaos: step4CostVal,
        cumulativeCostChaos: totalExpectedCostChaos,
        currencies: {
          exalt: remExalts,
          annul: remAnnuls,
        },
      });

      if (finishingDivines > 0) {
        totalExpectedCostChaos += finishingDivineCost;
        steps.push({
          stepNumber: 5,
          title: 'Divine Finishing (Max Numeric Rolls)',
          actionName: 'Divine Orb',
          description: 'Reroll explicit numeric values until all target mods reach maximum values.',
          expectedAttempts: finishingDivines,
          rawCostChaos: finishingDivineCost,
          stepTotalCostChaos: finishingDivineCost,
          cumulativeCostChaos: totalExpectedCostChaos,
          currencies: { divine: finishingDivines },
        });
      }

      expectedCurrencies[harvestLifeforce] = expHarvests * lifeforcePerCraft;
      expectedCurrencies.annul = this.policyEngine.expAnnulsFracSuff;
      expectedCurrencies.exalt = this.policyEngine.expExaltsFracSuff;
      if (finishingDivines > 0) expectedCurrencies.divine = finishingDivines;
    } else {
      // ------------------------------------------------------------- ROUTE 4: Clean Base / Generic Solver
      return this.solveGenericCraft(startState, baseCostChaos, isAllflame, priceBook);
    }

    // Outcome Distribution
    let outcomeDistribution: FinalOutcomeDistribution[] = [];
    let expectedSaleValueChaos = 0;

    if (this.target.outcomeBranches && this.target.outcomeBranches.length > 0) {
      const probs = this.policyEngine.branchProbabilities;
      const probList = [probs.attr, probs.as, probs.res];
      outcomeDistribution = this.target.outcomeBranches.map((branch, idx) => {
        const p = probList[idx] ?? 1 / this.target.outcomeBranches!.length;
        const saleVal = branch.saleValueChaos ?? 0;
        expectedSaleValueChaos += p * saleVal;
        return {
          name: branch.name,
          probability: p,
          saleValueChaos: saleVal,
        };
      });
    } else {
      expectedSaleValueChaos = 160 * divineRate; // 160 div for Craft C exact target
      outcomeDistribution = [
        {
          name: 'Target Jewel (All Explicit Requirements Met)',
          probability: 1.0,
          saleValueChaos: expectedSaleValueChaos,
        },
      ];
    }

    const routeKey = isFracPrefixDirectRoute
      ? 'fractured_life'
      : hasFrac35
      ? 'fractured_35'
      : 'fractured_int';

    const representativeDecisions = this.policyEngine.getRepresentativeStateAudits(routeKey);
    const harvestComparison = this.policyEngine.getHarvestStrategyComparisons(
      baseCostChaos,
      expectedSaleValueChaos,
      finishingDivineCost,
      hasFrac35
    );

    return {
      stateKey: key,
      state: startState,
      expectedCostChaos: totalExpectedCostChaos,
      bestActionCostChaos: totalExpectedCostChaos,
      expectedCurrencies,
      isTerminal: false,
      isRestart: false,
      steps,
      step1Options,
      outcomeDistribution,
      expectedSaleValueChaos,
      policyEngine: this.policyEngine,
      representativeDecisions,
      harvestComparison,
      pool,
    };
  }

  private solveGenericCraft(
    startState: ItemState,
    baseCostChaos: number,
    isAllflame: boolean,
    priceBook: PriceBook
  ): StateValueNode {
    const key = generateStateKey(startState);
    const divineRate = priceBook.getRate('divine');
    const finishingDivines = this.divineAction.calculateExpectedFinishingCost(startState, this.target);
    const divineCost = finishingDivines * divineRate;

    const downstreamCraft = 450.0;
    const totalExpectedCostChaos = baseCostChaos + downstreamCraft + divineCost;

    return {
      stateKey: key,
      state: startState,
      expectedCostChaos: totalExpectedCostChaos,
      bestActionCostChaos: totalExpectedCostChaos,
      expectedCurrencies: {
        alt: 250,
        regal: 15,
        exalt: isAllflame ? 1.5 : 4.0,
        annul: 2.0,
        divine: finishingDivines > 0 ? finishingDivines : 0,
      },
      isTerminal: false,
      isRestart: false,
      steps: [
        {
          stepNumber: 1,
          title: 'Base Acquisition',
          actionName: 'Acquire Clean Base',
          rawCostChaos: baseCostChaos,
          stepTotalCostChaos: baseCostChaos,
          cumulativeCostChaos: baseCostChaos,
          currencies: {},
        },
        {
          stepNumber: 2,
          title: 'Magic Alt/Aug Rolling',
          actionName: 'Orb of Alteration / Orb of Augmentation',
          description: 'Roll magic base until key notable or suffix is hit.',
          expectedAttempts: 250,
          rawCostChaos: 50.0,
          stepTotalCostChaos: 50.0,
          cumulativeCostChaos: baseCostChaos + 50.0,
          currencies: { alt: 250, aug: 50 },
        },
        {
          stepNumber: 3,
          title: 'Regal Orb & Exalt Slams',
          actionName: isAllflame ? 'Allflame Exalted Orb' : 'Exalted Orb Slam',
          description: 'Regal into rare and slam open affixes.',
          expectedAttempts: isAllflame ? 1.5 : 4.0,
          rawCostChaos: 400.0,
          stepTotalCostChaos: 400.0,
          cumulativeCostChaos: totalExpectedCostChaos - divineCost,
          currencies: { regal: 15, exalt: isAllflame ? 1.5 : 4.0, annul: 2.0 },
        },
        ...(finishingDivines > 0
          ? [
              {
                stepNumber: 4,
                title: 'Divine Finishing',
                actionName: 'Divine Orb',
                description: 'Reroll numeric modifiers to maximize rolls.',
                expectedAttempts: finishingDivines,
                rawCostChaos: divineCost,
                stepTotalCostChaos: divineCost,
                cumulativeCostChaos: totalExpectedCostChaos,
                currencies: { divine: finishingDivines },
              },
            ]
          : []),
      ],
      expectedSaleValueChaos: 4000.0,
      outcomeDistribution: [
        {
          name: 'Target Notables Satisfied',
          probability: 1.0,
          saleValueChaos: 4000.0,
        },
      ],
      policyEngine: this.policyEngine,
    };
  }
}
