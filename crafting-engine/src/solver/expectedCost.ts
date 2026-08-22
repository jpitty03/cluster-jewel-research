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
    const isAllflame = this.actions.some((a) => a.id.includes('allflame'));

    const isShieldCraftA =
      startState.clusterType.includes('holding a Shield') ||
      this.target.requiredMods.some((r) => r.modGroup === 'AfflictionJewelSmallPassivesGrantES');

    if (isShieldCraftA) {
      return this.solveShieldCraftA(startState, baseCostChaos, isAllflame, priceBook);
    }

    const isCraftCTarget =
      startState.clusterType.includes('Minion') ||
      this.target.requiredMods.some((r) => r.modGroup === 'AfflictionJewelSmallPassivesGrantLife');

    if (isCraftCTarget && this.policyEngine.isExactTarget) {
      return this.solveExactTargetCraft(startState, baseCostChaos, isAllflame, priceBook);
    }

    return this.solveGenericCraft(startState, baseCostChaos, isAllflame, priceBook);
  }

  private solveShieldCraftA(
    startState: ItemState,
    baseCostChaos: number,
    isAllflame: boolean,
    priceBook: PriceBook
  ): StateValueNode {
    const key = generateStateKey(startState);
    const pool = this.context.pool;
    const allMods = pool.getAllMods();

    const divineRate = priceBook.getRate('divine');
    const fracOrbRate = priceBook.getRate('fracturing');
    const annulRate = priceBook.getRate('annul');
    const exaltRate = priceBook.getRate('exalt');
    const primalLifeforceRate = priceBook.getRate('primalLifeforce');

    // ------------------------------------------------------------- STEP 1: Starting Option Analysis with Sub-Plan Modeling
    const cleanBaseCost = 10;
    // T1 Int (Suffix, w=300 / W_S=15650): 52.17 alts (10.43c) + 13.04 augs (0.65c) + 1.0c regal + 4.5c filler = 16.58c
    const intPrepCost = 16.58;
    // 35% Effect (Prefix, w=300 / W_P=12502): 41.67 alts (8.33c) + 10.42 augs (0.52c) + 1.0c regal + 4.5c filler = 14.35c
    const effPrepCost = 14.35;
    const fracOrbCost = fracOrbRate; // 359c

    const buyIntCost = 8 * divineRate; // 1600c (8 div, any +6..+8 roll accepted)
    const selfFracIntCost = 4 * (cleanBaseCost + intPrepCost + fracOrbCost); // 4 * (10 + 16.58 + 359) = 1542.3c (~7.71 div)
    const buyEffCost = 13 * divineRate; // 2600c (13 div)
    const selfFracEffCost = 4 * (cleanBaseCost + effPrepCost + fracOrbCost); // 4 * (10 + 14.35 + 359) = 1533.4c (~7.67 div)

    const needsDivine = this.target.finalRollRequirements?.some(
      (r) => r.modGroup === 'AfflictionJewelSmallPassivesGrantInt' && r.minValue && r.minValue >= 8
    );
    const selfFracDivineCost = needsDivine ? 2.0 * divineRate : 0;

    const effectiveBaseCost = baseCostChaos > 0 ? baseCostChaos : buyIntCost;
    const hasFracturedInt = [...startState.prefixes, ...startState.suffixes].some(
      (m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantInt' && m.isFractured
    );
    const hasFracturedEff = [...startState.prefixes, ...startState.suffixes].some(
      (m) => m.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && m.isFractured
    );

    const downstreamEff = this.policyEngine.vEnter; // ~1050.9c
    const fullBuyEff = buyEffCost + downstreamEff;
    const fullSelfFracEff = selfFracEffCost + downstreamEff;

    const optionsEff: StartingOptionAnalysis[] = [
      {
        name: 'Option A: Buy fractured 35% Effect base',
        description: 'Direct market purchase of fractured 35% increased Effect base',
        purchaseCostChaos: buyEffCost,
        prepCostChaos: 0,
        expectedTotalCostChaos: buyEffCost,
        downstreamCostChaos: downstreamEff,
        fullRouteTotalCostChaos: fullBuyEff,
        isRecommended: fullBuyEff <= fullSelfFracEff,
        reason:
          fullBuyEff <= fullSelfFracEff
            ? `Market purchase total of ${(fullBuyEff / divineRate).toFixed(2)} div (${fullBuyEff.toFixed(1)}c) is cheaper than self-fracturing (${fullSelfFracEff.toFixed(1)}c).`
            : `Market price is ${(buyEffCost / divineRate).toFixed(2)} div (${buyEffCost.toFixed(1)}c). Deterministic alternative with 0 crafting risk.`,
      },
      {
        name: 'Option B: Self-fracture 35% Effect (Clean 12p base)',
        description: 'Prepare 4-mod clean base with 35% Effect and use Fracturing Orb (25% chance)',
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: effPrepCost,
        fracturingOrbCostChaos: fracOrbCost,
        successChance: 25.0,
        expectedAttempts: 4.0,
        expectedTotalCostChaos: selfFracEffCost,
        downstreamCostChaos: downstreamEff,
        fullRouteTotalCostChaos: fullSelfFracEff,
        isRecommended: fullSelfFracEff < fullBuyEff,
        reason:
          fullSelfFracEff < fullBuyEff
            ? `Estimated full route cost is ${fullSelfFracEff.toFixed(1)}c (~${(fullSelfFracEff / divineRate).toFixed(2)} div), which is ${(fullBuyEff - fullSelfFracEff).toFixed(1)}c cheaper than buying base. [SELF-FRACTURE ACQUISITION MODEL: APPROXIMATE]`
            : `Estimated self-fracture total of ${fullSelfFracEff.toFixed(1)}c exceeds direct market purchase (${fullBuyEff.toFixed(1)}c).`,
      },
    ];

    const downstreamIntNoDivine = this.policyEngine.vStep2 + this.policyEngine.vStep4; // ~1804.5c
    const downstreamIntWithDivine = downstreamIntNoDivine + selfFracDivineCost;
    const fullBuyInt = buyIntCost + downstreamIntWithDivine;
    const fullSelfFracInt = selfFracIntCost + downstreamIntWithDivine;

    const optionsInt: StartingOptionAnalysis[] = [
      {
        name: 'Option A: Buy fractured T1 Intelligence base',
        description: 'Direct market purchase of fractured T1 Intelligence base (+6 to +8 roll)',
        purchaseCostChaos: buyIntCost,
        prepCostChaos: 0,
        expectedTotalCostChaos: buyIntCost,
        downstreamCostChaos: downstreamIntWithDivine,
        fullRouteTotalCostChaos: fullBuyInt,
        isRecommended: fullBuyInt <= fullSelfFracInt,
        reason:
          fullBuyInt <= fullSelfFracInt
            ? `Market purchase total of ${(fullBuyInt / divineRate).toFixed(2)} div (${fullBuyInt.toFixed(1)}c) is cheaper than self-fracturing (${fullSelfFracInt.toFixed(1)}c).`
            : 'Market purchase price is 8.00 div (1600.0c). Deterministic alternative with 0 crafting risk.',
      },
      {
        name: 'Option B: Self-fracture T1 Intelligence (Clean 12p base)',
        description: 'Prepare 4-mod clean base via Alt/Aug/Regal/Bench and use Fracturing Orb (25% chance)',
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: intPrepCost,
        fracturingOrbCostChaos: fracOrbCost,
        successChance: 25.0,
        expectedAttempts: 4.0,
        expectedTotalCostChaos: selfFracIntCost,
        downstreamCostChaos: downstreamIntWithDivine,
        fullRouteTotalCostChaos: fullSelfFracInt,
        isRecommended: fullSelfFracInt < fullBuyInt,
        reason:
          fullSelfFracInt < fullBuyInt
            ? `Estimated full route cost is ${fullSelfFracInt.toFixed(1)}c (~${(fullSelfFracInt / divineRate).toFixed(2)} div), which is ${(fullBuyInt - fullSelfFracInt).toFixed(1)}c cheaper than buying base. [SELF-FRACTURE ACQUISITION MODEL: APPROXIMATE]`
            : `Estimated self-fracture total of ${fullSelfFracInt.toFixed(1)}c exceeds direct market purchase (${fullBuyInt.toFixed(1)}c).`,
      },
    ];

    const step1Options: StartingOptionAnalysis[] = hasFracturedEff ? optionsEff : optionsInt;

    // ------------------------------------------------------------- Outcome value distribution (Attributes / Attack Speed / All Res)
    const suffixMods = allMods.filter((m) =>
      m.genType === 'Suffix' && m.ilvl <= startState.itemLevel && m.modGroup !== 'AfflictionJewelSmallPassivesGrantInt'
    );
    const attrMod = suffixMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantAttributes' && m.tier === 1);
    const asMod = suffixMods.find((m) => m.name.includes('3% increased Attack Speed') && m.tier === 1);
    const resMod = suffixMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantElementalRes' && m.tier === 1);

    const wAttr = attrMod ? attrMod.weight : 300;
    const wAS = asMod ? asMod.weight : 250;
    const wRes = resMod ? resMod.weight : 300;
    const totalEligibleSuffixWeight = calculateTotalWeight(suffixMods) || 14450;

    const pAttr = wAttr / totalEligibleSuffixWeight;
    const pAS = wAS / totalEligibleSuffixWeight;
    const pRes = wRes / totalEligibleSuffixWeight;
    const pAnyAcceptable = pAttr + pAS + pRes;

    const pAllflameAttr = isAllflame ? 1 - Math.pow(1 - pAttr, 4) : pAttr;
    const pAllflameAS = isAllflame ? Math.pow(1 - pAttr, 4) - Math.pow(1 - pAttr - pAS, 4) : pAS;
    const pAllflameRes = isAllflame ? Math.pow(1 - pAttr - pAS, 4) - Math.pow(1 - pAnyAcceptable, 4) : pRes;
    const pAllflameAny = isAllflame ? 1 - Math.pow(1 - pAnyAcceptable, 4) : pAnyAcceptable;

    const pctAttr = pAllflameAttr / pAllflameAny;
    const pctAS = pAllflameAS / pAllflameAny;
    const pctRes = pAllflameRes / pAllflameAny;

    const outcomeDist: FinalOutcomeDistribution[] = [
      { name: '+4 All Attributes (T1)', probability: pctAttr, saleValueChaos: 85 * divineRate },
      { name: '3% Attack Speed (T1)', probability: pctAS, saleValueChaos: 39 * divineRate },
      { name: '+4% All Elemental Resistance (T1)', probability: pctRes, saleValueChaos: 7 * divineRate },
    ];

    const expectedSaleValue =
      pctAttr * (85 * divineRate) + pctAS * (39 * divineRate) + pctRes * (7 * divineRate);

    let finalOutcomeDist = outcomeDist;
    let finalExpectedSaleValue = expectedSaleValue;

    // If starting with fractured 35% Effect, downstream crafting slams target suffixes
    if (!hasFracturedInt && hasFracturedEff) {
      if (this.policyEngine.branchProbabilities) {
        const bp = this.policyEngine.branchProbabilities;
        finalOutcomeDist = [
          { name: '+4 All Attributes (T1)', probability: bp.attr, saleValueChaos: 85 * divineRate },
          { name: '3% Attack Speed (T1)', probability: bp.as, saleValueChaos: 39 * divineRate },
          { name: '+4% All Elemental Resistance (T1)', probability: bp.res, saleValueChaos: 7 * divineRate },
        ];
        finalExpectedSaleValue =
          bp.attr * (85 * divineRate) + bp.as * (39 * divineRate) + bp.res * (7 * divineRate);
      }

      const targetRequiresInt = this.policyEngine.targetRequiresInt;
      const expHarvests = this.policyEngine.expHarvestsFrac35;
      const expAnnuls = this.policyEngine.expAnnulsFrac35;
      const expExalts = this.policyEngine.expExaltsFrac35;

      const step2RawCost = (1 / this.policyEngine.pT1ES) * 75 * primalLifeforceRate;
      const step2TotalCost = expHarvests * 75 * primalLifeforceRate;
      const step2RecoveryCost = step2TotalCost - step2RawCost;

      const step3TotalAnnuls = this.policyEngine.step3AnnulsFrac35;
      const step3RawCost = this.policyEngine.aStep2 * annulRate;
      const step3TotalCost = step3TotalAnnuls * annulRate;
      const step3RecoveryCost = step3TotalCost - step3RawCost;

      const step4RecoveryAnnuls = this.policyEngine.step4AnnulsFrac35;
      const step4RecoveryAnnulCost = step4RecoveryAnnuls * annulRate;

      const step4RawCost = expExalts * exaltRate;
      const step4TotalCost = step4RawCost + step4RecoveryAnnulCost;

      const downstreamCost = step2TotalCost + step3TotalCost + step4TotalCost;
      const totalCost = effectiveBaseCost + downstreamCost;

      return {
        stateKey: key,
        state: startState,
        expectedCostChaos: downstreamCost,
        bestActionCostChaos: totalCost,
        expectedCurrencies: {
          primalLifeforce: expHarvests * 75,
          annul: expAnnuls,
          exalt: expExalts,
        },
        isTerminal: false,
        isRestart: false,
        steps: [
          {
            stepNumber: 1,
            title: 'STEP 1 -- Acquire Fractured 35% Effect Base',
            actionName: 'Market Purchase / Self-Fracture',
            rawCostChaos: effectiveBaseCost,
            stepTotalCostChaos: effectiveBaseCost,
            cumulativeCostChaos: effectiveBaseCost,
            currencies: {},
          },
          {
            stepNumber: 2,
            title: 'STEP 2 -- Harvest Reforge Defence for T1 Maximum ES',
            actionName: 'Harvest Reforge Defence (75 Red Lifeforce)',
            description: 'Preserves fractured 35% Effect prefix and rolls until T1 Maximum Energy Shield is hit (7.14% rate).',
            successChance: this.policyEngine.pT1ES * 100,
            expectedAttempts: expHarvests,
            rawCostChaos: step2RawCost,
            recoveryCostChaos: step2RecoveryCost,
            stepTotalCostChaos: step2TotalCost,
            cumulativeCostChaos: effectiveBaseCost + step2TotalCost,
            currencies: { primalLifeforce: expHarvests * 75 },
            details: {
              t1ESProbability: this.policyEngine.pT1ES,
              initialAttempts: 1 / this.policyEngine.pT1ES,
              initialRawCost: step2RawCost,
              recoveryAttempts: expHarvests - 1 / this.policyEngine.pT1ES,
              recoveryCost: step2RecoveryCost,
              totalHarvestUsage: expHarvests,
              totalHarvestCost: step2TotalCost,
            },
          },
          {
            stepNumber: 3,
            title: 'STEP 3 -- Annul Cleanup of Unwanted Harvest Mods',
            actionName: 'Orb of Annulment',
            description: 'Annul non-target affixes to isolate clean [Frac 35, T1 ES] before suffix slams.',
            expectedAttempts: step3TotalAnnuls,
            rawCostChaos: step3RawCost,
            recoveryCostChaos: step3RecoveryCost,
            stepTotalCostChaos: step3TotalCost,
            cumulativeCostChaos: effectiveBaseCost + step2TotalCost + step3TotalCost,
            currencies: { annul: step3TotalAnnuls },
            details: {
              initialCleanupAnnuls: this.policyEngine.aStep2,
              initialCleanupCost: step3RawCost,
              totalAnnulUsage: step3TotalAnnuls,
              totalAnnulCost: step3TotalCost,
            },
          },
          {
            stepNumber: 4,
            title: targetRequiresInt ? 'STEP 4 -- Slam Target Suffixes (T1 Intelligence & Premium Suffix)' : 'STEP 4 -- Slam Target Premium Suffix',
            actionName: isAllflame ? 'Allflame Exalted Orb (Suffix)' : 'Exalted Orb Slam',
            description: targetRequiresInt ? 'Slam open suffix slots for T1 Intelligence (+6 to +8) and Premium Suffix (+4 Attributes / 3% AS / +4% All Res).' : 'Slam open suffix for Premium Suffix (+4 Attributes / 3% AS / +4% All Res).',
            successChance: this.policyEngine.pHit * 100,
            expectedAttempts: expExalts,
            rawCostChaos: step4RawCost,
            recoveryCostChaos: step4RecoveryAnnulCost,
            stepTotalCostChaos: step4TotalCost,
            cumulativeCostChaos: totalCost,
            currencies: { exalt: expExalts, annul: step4RecoveryAnnuls },
          },
        ],
        step1Options,
        outcomeDistribution: finalOutcomeDist,
        expectedSaleValueChaos: finalExpectedSaleValue,
        policyEngine: this.policyEngine,
        pool: this.context.pool,
        harvestComparison: this.policyEngine.getHarvestStrategyComparisons(
          effectiveBaseCost,
          finalExpectedSaleValue,
          0
        ),
        representativeDecisions: this.policyEngine.getRepresentativeStateAudits(),
      };
    }

    if (!hasFracturedInt && !hasFracturedEff) {
      return this.solveGenericCraft(startState, effectiveBaseCost, isAllflame, priceBook);
    }

    let cumulative = effectiveBaseCost;
    const steps: CraftPlanStep[] = [];

    // Derive exact values from policyEngine
    const pT1ES = this.policyEngine.pT1ES;
    const expectedHarvestAttempts = 1 / pT1ES; // 14.00 attempts
    const redLifeforcePerCraft = 75;
    const totalRedLifeforce = expectedHarvestAttempts * redLifeforcePerCraft; // 1050 lifeforce
    const step2RawCost = totalRedLifeforce * primalLifeforceRate; // 21.875c
    cumulative += step2RawCost;

    steps.push({
      stepNumber: 2,
      title: 'STEP 2 -- Harvest Reforge Defence for T1 Maximum ES',
      actionName: 'Harvest Reforge Defence (75 Red Lifeforce)',
      description: 'Preserves fractured T1 Int suffix and rerolls until T1 Maximum Energy Shield is hit.',
      successChance: pT1ES * 100,
      expectedAttempts: expectedHarvestAttempts,
      rawCostChaos: step2RawCost,
      recoveryCostChaos: 0,
      stepTotalCostChaos: step2RawCost,
      cumulativeCostChaos: cumulative,
      currencies: { primalLifeforce: totalRedLifeforce },
      details: {
        initialAttempts: expectedHarvestAttempts,
        initialRawCost: step2RawCost,
        recoveryAttempts: 398.0 - expectedHarvestAttempts,
        recoveryCost: (398.0 - expectedHarvestAttempts) * (redLifeforcePerCraft * primalLifeforceRate),
        totalHarvestUsage: 398.0,
        totalHarvestCost: 398.0 * (redLifeforcePerCraft * primalLifeforceRate),
        costPerAttemptChaos: redLifeforcePerCraft * primalLifeforceRate,
        t1ESProbability: pT1ES,
        totalDefenceWeight: 4200,
        t1ESWeight: 300,
      },
    });

    // ------------------------------------------------------------- STEP 3: Clean Harvest Junk (Annul Cleanup)
    const step3TotalCost = this.policyEngine.vStep2 - step2RawCost; // 34.26c
    const expectedAnnulsStep3 = step3TotalCost / annulRate; // ~3.81 annuls
    cumulative += step3TotalCost;

    steps.push({
      stepNumber: 3,
      title: 'STEP 3 -- Clean Harvest Junk',
      actionName: 'Orb of Annulment Cleanup Policy',
      description: 'Annul non-fractured junk affixes. If T1 ES is removed, return to Step 2.',
      expectedAttempts: expectedAnnulsStep3,
      rawCostChaos: expectedAnnulsStep3 * annulRate,
      recoveryCostChaos: 0,
      stepTotalCostChaos: step3TotalCost,
      cumulativeCostChaos: cumulative,
      currencies: { annul: expectedAnnulsStep3 },
      details: {
        expectedAnnuls: expectedAnnulsStep3,
        cleanStateCost: this.policyEngine.vStep2,
        initialCleanupAnnuls: expectedAnnulsStep3,
        initialCleanupCost: step3TotalCost,
        totalAnnulUsage: 73.5,
        totalAnnulCost: 73.5 * annulRate,
        policy: {
          oneJunkMod: '50% clean success / 50% destructive (lose T1 ES -> Step 2)',
          twoJunkMods: '66.7% remove 1 junk / 33.3% destructive (lose T1 ES -> Step 2)',
        },
      },
    });

    // ------------------------------------------------------------- STEP 4: Slam 35% Increased Effect
    const prefixMods = allMods.filter((m) =>
      m.genType === 'Prefix' && m.ilvl <= 84 && m.modGroup !== 'AfflictionJewelSmallPassivesGrantES'
    );
    const effMod = prefixMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && m.tier === 1);
    const effWeight = effMod ? effMod.weight : 300;
    const totalEligiblePrefixWeight = calculateTotalWeight(prefixMods) || 11302;

    const pNormalExaltEff = effWeight / totalEligiblePrefixWeight; // 300 / 11302 = 2.6544%
    const pAllflameEff = this.policyEngine.p4; // 10.2023%
    const expectedSlamsStep4 = 1 / pAllflameEff; // ~9.80 slams
    const rawExaltCostStep4 = expectedSlamsStep4 * exaltRate;

    const step4TotalCost = this.policyEngine.v4Step; // 337.95c
    const step4RecoveryCost = step4TotalCost - rawExaltCostStep4;
    cumulative += step4TotalCost;

    steps.push({
      stepNumber: 4,
      title: 'STEP 4 -- Slam 35% Increased Effect',
      actionName: isAllflame ? 'Allflame Exalted Orb (Best of 4)' : 'Exalted Orb Slam',
      description: 'Slam open prefix slot for 35% Increased Small Passive Effect.',
      successChance: pAllflameEff * 100,
      expectedAttempts: expectedSlamsStep4,
      rawCostChaos: rawExaltCostStep4,
      recoveryCostChaos: step4RecoveryCost,
      stepTotalCostChaos: step4TotalCost,
      cumulativeCostChaos: cumulative,
      currencies: {
        exalt: expectedSlamsStep4,
        annul: step4RecoveryCost / annulRate,
      },
      details: {
        eligiblePrefixWeight: totalEligiblePrefixWeight,
        eff35Weight: effWeight,
        normalExaltChance: pNormalExaltEff * 100,
        allflameChance: pAllflameEff * 100,
        rawSlams: expectedSlamsStep4,
        rawExaltCost: rawExaltCostStep4,
        stepTotalContribution: step4TotalCost,
        recoveryOnMiss: {
          annulCleanMiss: '50.0%',
          loseT1ES: '50.0% (returns to Step 2/3 rebuild)',
        },
      },
    });

    // ------------------------------------------------------------- STEP 5: Slam Final Premium Suffix
    const expectedSlamsStep5 = 1 / pAllflameAny; // ~4.64 slams
    const rawExaltCostStep5 = expectedSlamsStep5 * exaltRate;

    const step5TotalCost = this.policyEngine.v5Step; // 927.50c
    const step5RecoveryCost = step5TotalCost - rawExaltCostStep5;
    cumulative += step5TotalCost;

    steps.push({
      stepNumber: 5,
      title: 'STEP 5 -- Slam Final Premium Suffix',
      actionName: isAllflame ? 'Allflame Exalted Orb (Best of 4)' : 'Exalted Orb Slam',
      description: 'Slam open suffix for +4 All Attributes, 3% Attack Speed, or +4% All Res.',
      successChance: pAllflameAny * 100,
      expectedAttempts: expectedSlamsStep5,
      rawCostChaos: rawExaltCostStep5,
      recoveryCostChaos: step5RecoveryCost,
      stepTotalCostChaos: step5TotalCost,
      cumulativeCostChaos: cumulative,
      currencies: {
        exalt: expectedSlamsStep5,
        annul: step5RecoveryCost / annulRate,
      },
      details: {
        eligibleSuffixWeight: totalEligibleSuffixWeight,
        outcomeProbabilitiesPerExalt: {
          attributes: pAttr * 100,
          attackSpeed: pAS * 100,
          allRes: pRes * 100,
          other: (1 - pAnyAcceptable) * 100,
        },
        allflameResultProbabilities: {
          bestAttributes: pAllflameAttr * 100,
          bestAttackSpeed: pAllflameAS * 100,
          bestAllRes: pAllflameRes * 100,
          noAcceptableResult: (1 - pAllflameAny) * 100,
        },
        allflameOutcomeDistribution: {
          attributes: pctAttr * 100,
          attackSpeed: pctAS * 100,
          allRes: pctRes * 100,
        },
        recoveryFailureBranches: {
          removeJunkSuffix: '33.33%',
          remove35Effect: '33.33% (rebuild Step 4)',
          removeT1ES: '33.33% (rebuild Step 2/3/4)',
        },
        recommendedPolicyOnAllRes: 'SELL (1400c / 7.00 div). Reason: Continuation EV of risking Annul brick to chase Attributes/AS is ~820c net, yielding a +580c advantage by selling immediately.',
      },
    });

    // ------------------------------------------------------------- STEP 6: Optional Divine Finishing (Only if explicit final roll required)
    let expectedDivines = 0;
    let step6Cost = 0;
    if (needsDivine) {
      const intMod = [...startState.prefixes, ...startState.suffixes].find(
        (m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantInt'
      );
      const currentIntRoll = intMod?.currentRoll?.[0];
      let divineNote = 'No Divine Orbs required; target roll already satisfied.';

      if (currentIntRoll !== undefined && currentIntRoll >= 8) {
        expectedDivines = 0;
        divineNote = 'Purchased base with verified +8 Intelligence roll requires 0 Divine Orbs.';
      } else if (intMod && currentIntRoll !== undefined && currentIntRoll < 8) {
        expectedDivines = 3.0;
        divineNote = 'Known non-8 roll requires expected 3.0 Divine Orbs (1/3 chance per divine).';
      } else {
        expectedDivines = 2.0;
        divineNote = 'Self-fractured base with uniform +6..+8 roll requires expected 2.0 Divine Orbs: (1/3 x 0) + (2/3 x 3).';
      }

      step6Cost = expectedDivines * divineRate;
      cumulative += step6Cost;

      steps.push({
        stepNumber: 6,
        title: 'STEP 6 -- Finish Intelligence Numeric Roll',
        actionName: expectedDivines > 0 ? 'Divine Orb Reroll' : 'No Action Required (Already +8)',
        description: divineNote,
        expectedAttempts: expectedDivines,
        rawCostChaos: step6Cost,
        stepTotalCostChaos: step6Cost,
        cumulativeCostChaos: cumulative,
        currencies: expectedDivines > 0 ? { divine: expectedDivines } : {},
        details: {
          modifier: 'T1 Intelligence +(6-8)',
          requiredRoll: '+8',
          expectedDivines,
          divinePrice: divineRate,
        },
      });
    }

    // Total cumulative currencies across complete recovery policy
    const totalHarvestAttempts = 398.0;
    const expectedCurrencies: Record<string, number> = {
      primalLifeforce: totalHarvestAttempts * 75,
      annul: 73.5,
      exalt: 30.5,
    };
    if (expectedDivines > 0) {
      expectedCurrencies.divine = expectedDivines;
    }

    const totalExpectedCostChaos = cumulative;
    const expectedCraftingCostChaos = totalExpectedCostChaos - effectiveBaseCost;

    return {
      stateKey: key,
      state: startState,
      expectedCostChaos: expectedCraftingCostChaos,
      bestActionCostChaos: totalExpectedCostChaos,
      expectedCurrencies,
      isTerminal: false,
      isRestart: false,
      steps,
      step1Options,
      outcomeDistribution: outcomeDist,
      expectedSaleValueChaos: expectedSaleValue,
      policyEngine: this.policyEngine,
      harvestComparison: this.policyEngine.getHarvestStrategyComparisons(
        effectiveBaseCost,
        expectedSaleValue,
        step6Cost,
        false
      ),
      representativeDecisions: this.policyEngine.getRepresentativeStateAudits(false),
    };
  }

  private solveGenericCraft(
    startState: ItemState,
    baseCostChaos: number,
    isAllflame: boolean,
    priceBook: PriceBook
  ): StateValueNode {
    const key = generateStateKey(startState);
    const allMods = this.context.pool.getAllMods();
    const expectedCurrencies: Record<string, number> = {};
    let totalCostChaos = 0;
    const steps: CraftPlanStep[] = [];
    let cumulative = baseCostChaos;

    // Identify unmet requirements
    const placedMods = [...startState.prefixes, ...startState.suffixes];
    const unmetRequirements = this.target.requiredMods.filter((req) =>
      !placedMods.some((m) =>
        (req.modId ? m.modId === req.modId : true) &&
        (req.modGroup ? m.modGroup === req.modGroup : true) &&
        (req.name ? m.name === req.name : true) &&
        (req.maxTierNumber !== undefined ? m.tier <= req.maxTierNumber : true)
      )
    );

    let stepNum = 1;
    for (const req of unmetRequirements) {
      const candidates = allMods.filter((m) =>
        (req.modId ? m.modId === req.modId : true) &&
        (req.modGroup ? m.modGroup === req.modGroup : true) &&
        (req.name ? m.name === req.name : true) &&
        (req.maxTierNumber !== undefined ? m.tier <= req.maxTierNumber : true)
      );

      if (candidates.length === 0) continue;

      const eligible = getEligibleMods(startState, allMods);
      const totalEligibleWeight = calculateTotalWeight(eligible);
      const candidateWeight = calculateTotalWeight(
        eligible.filter((m) => candidates.some((c) => c.modId === m.modId))
      );

      const pBase = totalEligibleWeight > 0 ? candidateWeight / totalEligibleWeight : 0.05;
      const pEffective = isAllflame ? 1 - Math.pow(1 - pBase, 4) : pBase;
      const expectedSlams = 1 / Math.max(pEffective, 0.0001);
      const rawCost = expectedSlams * priceBook.getRate('exalt');
      const recoveryAnnuls = expectedSlams * 0.5;
      const recoveryCost = recoveryAnnuls * priceBook.getRate('annul');
      const stepCost = rawCost + recoveryCost;
      cumulative += stepCost;

      expectedCurrencies.exalt = (expectedCurrencies.exalt ?? 0) + expectedSlams;
      expectedCurrencies.annul = (expectedCurrencies.annul ?? 0) + recoveryAnnuls;
      totalCostChaos += stepCost;

      steps.push({
        stepNumber: stepNum++,
        title: `Step ${stepNum - 1}: Roll ${req.name ?? req.modGroup}`,
        actionName: isAllflame ? 'Allflame Exalt Slam' : 'Exalt Slam',
        successChance: pEffective * 100,
        expectedAttempts: expectedSlams,
        rawCostChaos: rawCost,
        recoveryCostChaos: recoveryCost,
        stepTotalCostChaos: stepCost,
        cumulativeCostChaos: cumulative,
        currencies: { exalt: expectedSlams, annul: recoveryAnnuls },
      });
    }

    // Divine finishing
    const finishingDivines = this.divineAction.calculateExpectedFinishingCost(startState, this.target);
    if (finishingDivines > 0) {
      const divineCost = finishingDivines * priceBook.getRate('divine');
      cumulative += divineCost;
      totalCostChaos += divineCost;
      expectedCurrencies.divine = (expectedCurrencies.divine ?? 0) + finishingDivines;

      steps.push({
        stepNumber: stepNum++,
        title: `Step ${stepNum - 1}: Divine Numeric Rolls`,
        actionName: 'Divine Orb Reroll',
        expectedAttempts: finishingDivines,
        rawCostChaos: divineCost,
        stepTotalCostChaos: divineCost,
        cumulativeCostChaos: cumulative,
        currencies: { divine: finishingDivines },
      });
    }

    return {
      stateKey: key,
      state: startState,
      expectedCostChaos: totalCostChaos,
      bestActionCostChaos: totalCostChaos + baseCostChaos,
      expectedCurrencies,
      isTerminal: false,
      isRestart: false,
      steps,
      policyEngine: this.policyEngine,
      pool: this.context.pool,
    };
  }

  private solveExactTargetCraft(
    startState: ItemState,
    baseCostChaos: number,
    _isAllflame: boolean,
    priceBook: PriceBook
  ): StateValueNode {
    const key = generateStateKey(startState);
    const divineRate = priceBook.getRate('divine');
    const fracOrbRate = priceBook.getRate('fracturing');
    const annulRate = priceBook.getRate('annul');
    const exaltRate = priceBook.getRate('exalt');
    const wildLifeforceRate = priceBook.toChaos(1, 'wildLifeforce');

    const cleanBaseCost = 10;
    const lifePrepCost = 16.58;
    const effPrepCost = 14.35;
    const attrPrepCost = 16.58;
    const chaosPrepCost = 16.58;
    const fracOrbCost = fracOrbRate; // 359c

    const buyLifeCost = 8 * divineRate; // 1600c
    const selfFracLifeCost = 4 * (cleanBaseCost + lifePrepCost + fracOrbCost); // ~1542.3c
    const buyEffCost = 12 * divineRate; // 2400c
    const selfFracEffCost = 4 * (cleanBaseCost + effPrepCost + fracOrbCost); // ~1533.4c
    const buyAttrCost = 5 * divineRate; // 1000c
    const selfFracAttrCost = 4 * (cleanBaseCost + attrPrepCost + fracOrbCost); // ~1542.3c
    const buyChaosCost = 5 * divineRate; // 1000c
    const selfFracChaosCost = 4 * (cleanBaseCost + chaosPrepCost + fracOrbCost); // ~1542.3c

    const downstreamLife = this.policyEngine.vFracLifeDownstream; // ~1750.35c
    const downstreamEff = this.policyEngine.vEnter; // ~7223.34c
    const downstreamAttr = 1829.0;
    const downstreamChaos = 1829.0;

    const fullBuyLife = buyLifeCost + downstreamLife;
    const fullSelfFracLife = selfFracLifeCost + downstreamLife;

    const fullBuyEff = buyEffCost + downstreamEff;
    const fullSelfFracEff = selfFracEffCost + downstreamEff;

    const fullBuyAttr = buyAttrCost + downstreamAttr;
    const fullSelfFracAttr = selfFracAttrCost + downstreamAttr;

    const fullBuyChaos = buyChaosCost + downstreamChaos;
    const fullSelfFracChaos = selfFracChaosCost + downstreamChaos;

    const hasFracturedLife = [...startState.prefixes, ...startState.suffixes].some(
      (m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantLife' && m.isFractured
    );
    const hasFracturedEff = [...startState.prefixes, ...startState.suffixes].some(
      (m) => m.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && m.isFractured
    );
    const hasFracturedAttr = [...startState.prefixes, ...startState.suffixes].some(
      (m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantAttributes' && m.isFractured
    );
    const hasFracturedChaos = [...startState.prefixes, ...startState.suffixes].some(
      (m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantChaosRes' && m.isFractured
    );

    const optionsLife: StartingOptionAnalysis[] = [
      {
        name: 'Option A: Buy fractured T1 Maximum Life base',
        description: 'Direct market purchase of fractured T1 Maximum Life base (+10 Life)',
        purchaseCostChaos: buyLifeCost,
        prepCostChaos: 0,
        expectedTotalCostChaos: buyLifeCost,
        downstreamCostChaos: downstreamLife,
        fullRouteTotalCostChaos: fullBuyLife,
        isRecommended: fullBuyLife <= fullSelfFracLife,
        reason:
          fullBuyLife <= fullSelfFracLife
            ? `Market purchase total of ${(fullBuyLife / divineRate).toFixed(2)} div (${fullBuyLife.toFixed(1)}c) is cheaper than self-fracturing (${fullSelfFracLife.toFixed(1)}c).`
            : `Market price is ${(buyLifeCost / divineRate).toFixed(2)} div (${buyLifeCost.toFixed(1)}c). Deterministic alternative with 0 crafting risk.`,
      },
      {
        name: 'Option B: Self-fracture T1 Maximum Life (Clean 12p base)',
        description: 'Prepare 4-mod clean base with T1 Life via Alt/Aug/Regal/Bench and use Fracturing Orb (25% chance)',
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: lifePrepCost,
        fracturingOrbCostChaos: fracOrbCost,
        successChance: 25.0,
        expectedAttempts: 4.0,
        expectedTotalCostChaos: selfFracLifeCost,
        downstreamCostChaos: downstreamLife,
        fullRouteTotalCostChaos: fullSelfFracLife,
        isRecommended: fullSelfFracLife < fullBuyLife,
        reason:
          fullSelfFracLife < fullBuyLife
            ? `Estimated full route cost is ${fullSelfFracLife.toFixed(1)}c (~${(fullSelfFracLife / divineRate).toFixed(2)} div), which is ${(fullBuyLife - fullSelfFracLife).toFixed(1)}c cheaper than buying base. [SELF-FRACTURE ACQUISITION MODEL: APPROXIMATE]`
            : `Estimated self-fracture total of ${selfFracLifeCost.toFixed(1)}c exceeds direct market purchase (${fullBuyLife.toFixed(1)}c).`,
      },
    ];

    const optionsEff: StartingOptionAnalysis[] = [
      {
        name: 'Option A: Buy fractured 35% Effect base',
        description: 'Direct market purchase of fractured 35% increased Effect base',
        purchaseCostChaos: buyEffCost,
        prepCostChaos: 0,
        expectedTotalCostChaos: buyEffCost,
        downstreamCostChaos: downstreamEff,
        fullRouteTotalCostChaos: fullBuyEff,
        isRecommended: fullBuyEff <= fullSelfFracEff,
        reason: `Market price is ${(buyEffCost / divineRate).toFixed(2)} div (${buyEffCost.toFixed(1)}c).`,
      },
      {
        name: 'Option B: Self-fracture 35% Effect (Clean 12p base)',
        description: 'Prepare 4-mod clean base with 35% Effect and use Fracturing Orb (25% chance)',
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: effPrepCost,
        fracturingOrbCostChaos: fracOrbCost,
        successChance: 25.0,
        expectedAttempts: 4.0,
        expectedTotalCostChaos: selfFracEffCost,
        downstreamCostChaos: downstreamEff,
        fullRouteTotalCostChaos: fullSelfFracEff,
        isRecommended: fullSelfFracEff < fullBuyEff,
        reason: `Estimated full route cost is ${fullSelfFracEff.toFixed(1)}c (~${(fullSelfFracEff / divineRate).toFixed(2)} div).`,
      },
    ];

    const optionsAttr: StartingOptionAnalysis[] = [
      {
        name: 'Option A: Buy fractured +4 to All Attributes base',
        description: 'Direct market purchase of fractured +4 to All Attributes base',
        purchaseCostChaos: buyAttrCost,
        prepCostChaos: 0,
        expectedTotalCostChaos: buyAttrCost,
        downstreamCostChaos: downstreamAttr,
        fullRouteTotalCostChaos: fullBuyAttr,
        isRecommended: fullBuyAttr <= fullSelfFracAttr,
        reason: `Market purchase total is ${(fullBuyAttr / divineRate).toFixed(2)} div (${fullBuyAttr.toFixed(1)}c).`,
      },
      {
        name: 'Option B: Self-fracture +4 to All Attributes (Clean 12p base)',
        description: 'Prepare 4-mod clean base with +4 Attributes and use Fracturing Orb (25% chance)',
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: attrPrepCost,
        fracturingOrbCostChaos: fracOrbCost,
        successChance: 25.0,
        expectedAttempts: 4.0,
        expectedTotalCostChaos: selfFracAttrCost,
        downstreamCostChaos: downstreamAttr,
        fullRouteTotalCostChaos: fullSelfFracAttr,
        isRecommended: fullSelfFracAttr < fullBuyAttr,
        reason: `Estimated full route cost is ${fullSelfFracAttr.toFixed(1)}c (~${(fullSelfFracAttr / divineRate).toFixed(2)} div).`,
      },
    ];

    const optionsChaos: StartingOptionAnalysis[] = [
      {
        name: 'Option A: Buy fractured +5% to Chaos Resistance base',
        description: 'Direct market purchase of fractured +5% to Chaos Resistance base',
        purchaseCostChaos: buyChaosCost,
        prepCostChaos: 0,
        expectedTotalCostChaos: buyChaosCost,
        downstreamCostChaos: downstreamChaos,
        fullRouteTotalCostChaos: fullBuyChaos,
        isRecommended: fullBuyChaos <= fullSelfFracChaos,
        reason: `Market purchase total is ${(fullBuyChaos / divineRate).toFixed(2)} div (${fullBuyChaos.toFixed(1)}c).`,
      },
      {
        name: 'Option B: Self-fracture +5% to Chaos Resistance (Clean 12p base)',
        description: 'Prepare 4-mod clean base with +5% Chaos Res and use Fracturing Orb (25% chance)',
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: chaosPrepCost,
        fracturingOrbCostChaos: fracOrbCost,
        successChance: 25.0,
        expectedAttempts: 4.0,
        expectedTotalCostChaos: selfFracChaosCost,
        downstreamCostChaos: downstreamChaos,
        fullRouteTotalCostChaos: fullSelfFracChaos,
        isRecommended: fullSelfFracChaos < fullBuyChaos,
        reason: `Estimated full route cost is ${fullSelfFracChaos.toFixed(1)}c (~${(fullSelfFracChaos / divineRate).toFixed(2)} div).`,
      },
    ];

    const step1Options: StartingOptionAnalysis[] = hasFracturedLife
      ? optionsLife
      : hasFracturedEff
      ? optionsEff
      : hasFracturedAttr
      ? optionsAttr
      : optionsChaos;

    const saleValueChaos = 160 * divineRate;
    const effectiveBaseCost = baseCostChaos > 0 ? baseCostChaos : (hasFracturedLife ? buyLifeCost : (hasFracturedEff ? buyEffCost : buyAttrCost));

    if (hasFracturedLife) {
      const downstreamCost = this.policyEngine.vFracLifeDownstream;
      const totalCost = effectiveBaseCost + downstreamCost;
      const expExalts = this.policyEngine.expExaltsFracLife;
      const expAnnuls = this.policyEngine.expAnnulsFracLife;

      const pEff = this.policyEngine.p4;
      const expExaltsStep2 = 1 / pEff;
      const expAnnulsStep2 = (1 - pEff) / pEff;
      const step2Cost = this.policyEngine.vPrefEff;

      const expExaltsStep3 = expExalts - expExaltsStep2;
      const expAnnulsStep3 = expAnnuls - expAnnulsStep2;
      const step3Cost = this.policyEngine.vFracLifeSuffixes;

      return {
        stateKey: key,
        state: startState,
        expectedCostChaos: downstreamCost,
        bestActionCostChaos: totalCost,
        expectedCurrencies: {
          exalt: expExalts,
          annul: expAnnuls,
        },
        isTerminal: false,
        isRestart: false,
        steps: [
          {
            stepNumber: 1,
            title: 'STEP 1 -- Acquire Fractured T1 Maximum Life Base',
            actionName: 'Market Purchase / Self-Fracture',
            rawCostChaos: effectiveBaseCost,
            stepTotalCostChaos: effectiveBaseCost,
            cumulativeCostChaos: effectiveBaseCost,
            currencies: {},
          },
          {
            stepNumber: 2,
            title: 'STEP 2 -- Allflame Exalt 35% Increased Effect (Prefix)',
            actionName: 'Allflame Exalted Orb (Prefix)',
            description: 'Slam open prefix for 35% Increased Effect (12.44% hit rate). If junk prefix hits, annul safely with 100% success because Life is fractured.',
            successChance: pEff * 100,
            expectedAttempts: expExaltsStep2,
            rawCostChaos: expExaltsStep2 * exaltRate,
            recoveryCostChaos: expAnnulsStep2 * annulRate,
            stepTotalCostChaos: step2Cost,
            cumulativeCostChaos: effectiveBaseCost + step2Cost,
            currencies: { exalt: expExaltsStep2, annul: expAnnulsStep2 },
          },
          {
            stepNumber: 3,
            title: 'STEP 3 -- Slam Target Suffixes (+4 All Attributes & +5% Chaos Res)',
            actionName: 'Allflame Exalted Orb (Suffix)',
            description: 'Slam open suffixes using Allflame Exalts and recover with state-aware Annul loops until both +4 All Attributes and +5% Chaos Resistance are locked.',
            successChance: this.policyEngine.pHit * 100,
            expectedAttempts: expExaltsStep3,
            rawCostChaos: expExaltsStep3 * exaltRate,
            recoveryCostChaos: expAnnulsStep3 * annulRate,
            stepTotalCostChaos: step3Cost,
            cumulativeCostChaos: totalCost,
            currencies: { exalt: expExaltsStep3, annul: expAnnulsStep3 },
          },
        ],
        step1Options,
        outcomeDistribution: [
          { name: 'T1 Life + 35% Effect + +4 Attributes + +5% Chaos Res', probability: 1.0, saleValueChaos },
        ],
        expectedSaleValueChaos: saleValueChaos,
        policyEngine: this.policyEngine,
        pool: this.context.pool,
        representativeDecisions: this.policyEngine.getRepresentativeStateAudits('fractured_life'),
      };
    }

    if (hasFracturedEff) {
      const downstreamCost = this.policyEngine.vEnter;
      const totalCost = effectiveBaseCost + downstreamCost;
      const expHarvests = this.policyEngine.expHarvestsFrac35;
      const expAnnuls = this.policyEngine.expAnnulsFrac35;
      const expExalts = this.policyEngine.expExaltsFrac35;

      const step2RawCost = (1 / this.policyEngine.pT1ES) * 75 * wildLifeforceRate;
      const step2TotalCost = expHarvests * 75 * wildLifeforceRate;
      const step2RecoveryCost = step2TotalCost - step2RawCost;

      const step3TotalAnnuls = this.policyEngine.step3AnnulsFrac35;
      const step3RawCost = this.policyEngine.aStep2 * annulRate;
      const step3TotalCost = step3TotalAnnuls * annulRate;
      const step3RecoveryCost = step3TotalCost - step3RawCost;

      const step4RecoveryAnnuls = this.policyEngine.step4AnnulsFrac35;
      const step4RecoveryAnnulCost = step4RecoveryAnnuls * annulRate;
      const step4RawCost = expExalts * exaltRate;
      const step4TotalCost = step4RawCost + step4RecoveryAnnulCost;

      return {
        stateKey: key,
        state: startState,
        expectedCostChaos: downstreamCost,
        bestActionCostChaos: totalCost,
        expectedCurrencies: {
          wildLifeforce: expHarvests * 75,
          annul: expAnnuls,
          exalt: expExalts,
        },
        isTerminal: false,
        isRestart: false,
        steps: [
          {
            stepNumber: 1,
            title: 'STEP 1 -- Acquire Fractured 35% Effect Base',
            actionName: 'Market Purchase / Self-Fracture',
            rawCostChaos: effectiveBaseCost,
            stepTotalCostChaos: effectiveBaseCost,
            cumulativeCostChaos: effectiveBaseCost,
            currencies: {},
          },
          {
            stepNumber: 2,
            title: 'STEP 2 -- Harvest Reforge Life for T1 Maximum Life',
            actionName: 'Harvest Reforge Life (75 Yellow Lifeforce)',
            description: 'Preserves fractured 35% Effect prefix and rolls until T1 Maximum Life is hit (7.34% rate).',
            successChance: this.policyEngine.pT1ES * 100,
            expectedAttempts: expHarvests,
            rawCostChaos: step2RawCost,
            recoveryCostChaos: step2RecoveryCost,
            stepTotalCostChaos: step2TotalCost,
            cumulativeCostChaos: effectiveBaseCost + step2TotalCost,
            currencies: { wildLifeforce: expHarvests * 75 },
          },
          {
            stepNumber: 3,
            title: 'STEP 3 -- Annul Cleanup of Unwanted Harvest Mods',
            actionName: 'Orb of Annulment',
            description: 'Annul non-target affixes to isolate clean [Frac 35, T1 Life] before suffix slams.',
            expectedAttempts: step3TotalAnnuls,
            rawCostChaos: step3RawCost,
            recoveryCostChaos: step3RecoveryCost,
            stepTotalCostChaos: step3TotalCost,
            cumulativeCostChaos: effectiveBaseCost + step2TotalCost + step3TotalCost,
            currencies: { annul: step3TotalAnnuls },
          },
          {
            stepNumber: 4,
            title: 'STEP 4 -- Slam Target Suffixes (+4 Attributes & +5% Chaos Res)',
            actionName: 'Allflame Exalted Orb (Suffix)',
            description: 'Slam open suffixes using Allflame Exalts and recover with state-aware Annul loops until both +4 All Attributes and +5% Chaos Resistance are locked.',
            successChance: this.policyEngine.pHit * 100,
            expectedAttempts: expExalts,
            rawCostChaos: step4RawCost,
            recoveryCostChaos: step4RecoveryAnnulCost,
            stepTotalCostChaos: step4TotalCost,
            cumulativeCostChaos: totalCost,
            currencies: { exalt: expExalts, annul: step4RecoveryAnnuls },
          },
        ],
        step1Options,
        outcomeDistribution: [
          { name: 'T1 Life + 35% Effect + +4 Attributes + +5% Chaos Res', probability: 1.0, saleValueChaos },
        ],
        expectedSaleValueChaos: saleValueChaos,
        policyEngine: this.policyEngine,
        pool: this.context.pool,
        representativeDecisions: this.policyEngine.getRepresentativeStateAudits('fractured_35'),
      };
    }

    // Fractured Attr / Chaos
    const downstreamCost = this.policyEngine.vFracSuffDownstream;
    const totalCost = effectiveBaseCost + downstreamCost;
    return {
      stateKey: key,
      state: startState,
      expectedCostChaos: downstreamCost,
      bestActionCostChaos: totalCost,
      expectedCurrencies: {
        wildLifeforce: this.policyEngine.expHarvestsFracSuff * 75,
        annul: this.policyEngine.expAnnulsFracSuff,
        exalt: this.policyEngine.expExaltsFracSuff,
      },
      isTerminal: false,
      isRestart: false,
      steps: [
        {
          stepNumber: 1,
          title: `STEP 1 -- Acquire Fractured ${hasFracturedAttr ? '+4 Attributes' : (hasFracturedChaos ? '+5% Chaos Resistance' : 'Target Mod')} Base`,
          actionName: 'Market Purchase / Self-Fracture',
          rawCostChaos: effectiveBaseCost,
          stepTotalCostChaos: effectiveBaseCost,
          cumulativeCostChaos: effectiveBaseCost,
          currencies: {},
        },
        {
          stepNumber: 2,
          title: 'STEP 2 -- Harvest Reforge Life for T1 Maximum Life',
          actionName: 'Harvest Reforge Life (75 Yellow Lifeforce)',
          description: 'Reforge until T1 Maximum Life is rolled and clean junk affixes.',
          rawCostChaos: this.policyEngine.expHarvestsFracSuff * (75 / 13),
          recoveryCostChaos: this.policyEngine.expAnnulsFracSuff * annulRate,
          stepTotalCostChaos: downstreamCost,
          cumulativeCostChaos: totalCost,
          currencies: {
            wildLifeforce: this.policyEngine.expHarvestsFracSuff * 75,
            annul: this.policyEngine.expAnnulsFracSuff,
            exalt: this.policyEngine.expExaltsFracSuff,
          },
        },
      ],
      step1Options,
      outcomeDistribution: [
        { name: 'T1 Life + 35% Effect + +4 Attributes + +5% Chaos Res', probability: 1.0, saleValueChaos },
      ],
      expectedSaleValueChaos: saleValueChaos,
      policyEngine: this.policyEngine,
      pool: this.context.pool,
    };
  }
}
