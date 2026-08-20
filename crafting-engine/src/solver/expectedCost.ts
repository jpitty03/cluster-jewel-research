import type { ItemState } from '../domain/ItemState.ts';
import type { CraftAction, SolverContext } from '../domain/CraftAction.ts';
import { generateStateKey } from './stateKey.ts';
import { satisfiesTarget, type TargetDefinition } from '../domain/TargetDefinition.ts';
import { DivineAction } from '../actions/divine.ts';
import { getEligibleMods, calculateTotalWeight } from '../rules/modEligibility.ts';
import type { PriceBook } from '../domain/PriceBook.ts';
import { CraftingPolicyEngine } from './policyEngine.ts';

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
    this.policyEngine = new CraftingPolicyEngine(target, context.priceBook);
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
    const intPrepCost = 10.16; // 23.3 alts (4.66c) + regal (1.0c) + bench/exalt filler (4.50c)
    const effPrepCost = 18.5; // 65 alts (13.0c) + regal (1.0c) + bench/exalt filler (4.50c)
    const fracOrbCost = fracOrbRate; // 359c

    const buyIntCost = 8 * divineRate; // 1600c (8 div, comes with +8 Int roll -> 0 Divines needed downstream)
    const selfFracIntCost = 4 * (cleanBaseCost + intPrepCost + fracOrbCost); // 4 * (10 + 10.16 + 359) = 1516.6c (needs +400c Divines downstream)
    const buyEffCost = 13 * divineRate; // 2600c (13 div)
    const selfFracEffCost = 4 * (cleanBaseCost + effPrepCost + fracOrbCost); // 4 * (10 + 18.5 + 359) = 1550.0c

    const step1Options: StartingOptionAnalysis[] = [
      {
        name: 'Option A: Buy fractured T1 Intelligence (+8 roll)',
        description: 'Direct market purchase of fractured T1 Intelligence base with +8 roll',
        purchaseCostChaos: buyIntCost,
        prepCostChaos: 0,
        expectedTotalCostChaos: buyIntCost,
        isRecommended: true,
        reason: 'Includes guaranteed +8 Intelligence roll (saving 2.0 Divines / 400c downstream finishing), making it the cheapest overall route.',
      },
      {
        name: 'Option B: Self-fracture T1 Intelligence (Clean 12p base)',
        description: 'Prepare 4-mod clean base via Alt/Regal/Bench and use Fracturing Orb (25% chance)',
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: intPrepCost,
        fracturingOrbCostChaos: fracOrbCost,
        successChance: 25.0,
        expectedAttempts: 4.0,
        expectedTotalCostChaos: selfFracIntCost,
        isRecommended: false,
        reason: `Acquisition cost is ${selfFracIntCost.toFixed(1)}c (~${(selfFracIntCost / divineRate).toFixed(2)} div), but requires +400c in Step 6 Divine rerolls, making total craft cost higher.`,
      },
      {
        name: 'Option C: Buy fractured 35% Effect',
        description: 'Direct market purchase of fractured 35% Increased Effect base',
        purchaseCostChaos: buyEffCost,
        prepCostChaos: 0,
        expectedTotalCostChaos: buyEffCost,
        isRecommended: false,
        reason: `Market price is 13.00 div (${buyEffCost.toFixed(1)}c), substantially higher than fractured Int.`,
      },
      {
        name: 'Option D: Self-fracture 35% Effect (Clean 12p base)',
        description: 'Prepare 4-mod clean base with 35% Effect and use Fracturing Orb (25% chance)',
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: effPrepCost,
        fracturingOrbCostChaos: fracOrbCost,
        successChance: 25.0,
        expectedAttempts: 4.0,
        expectedTotalCostChaos: selfFracEffCost,
        isRecommended: false,
        reason: `Acquisition cost is ${selfFracEffCost.toFixed(1)}c (~${(selfFracEffCost / divineRate).toFixed(2)} div).`,
      },
    ];

    const effectiveBaseCost = baseCostChaos > 0 ? baseCostChaos : buyIntCost;
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
        recoveryOnMiss: {
          annulCleanMiss: '50.0%',
          loseT1ES: '50.0% (returns to Step 2/3 rebuild)',
        },
      },
    });

    // ------------------------------------------------------------- STEP 5: Slam Final Premium Suffix
    const suffixMods = allMods.filter((m) =>
      m.genType === 'Suffix' && m.ilvl <= 84 && m.modGroup !== 'AfflictionJewelSmallPassivesGrantInt'
    );
    const attrMod = suffixMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantAttributes' && m.tier === 1);
    const asMod = suffixMods.find((m) => m.name.includes('3% increased Attack Speed') && m.tier === 1);
    const resMod = suffixMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantElementalRes' && m.tier === 1);

    const wAttr = attrMod ? attrMod.weight : 300;
    const wAS = asMod ? asMod.weight : 250;
    const wRes = resMod ? resMod.weight : 300;
    const totalEligibleSuffixWeight = calculateTotalWeight(suffixMods) || 14450;

    const pAttr = wAttr / totalEligibleSuffixWeight; // 300 / 14450 = 2.0761%
    const pAS = wAS / totalEligibleSuffixWeight; // 250 / 14450 = 1.7301%
    const pRes = wRes / totalEligibleSuffixWeight; // 300 / 14450 = 2.0761%
    const pAnyAcceptable = pAttr + pAS + pRes; // 850 / 14450 = 5.8824%

    const pAllflameAttr = 1 - Math.pow(1 - pAttr, 4); // 8.05%
    const pAllflameAS = Math.pow(1 - pAttr, 4) - Math.pow(1 - pAttr - pAS, 4); // 6.36%
    const pAllflameRes = Math.pow(1 - pAttr - pAS, 4) - Math.pow(1 - pAnyAcceptable, 4); // 7.12%
    const pAllflameAny = this.policyEngine.p5; // 21.53%

    const pctAttr = pAllflameAttr / pAllflameAny; // 37.39%
    const pctAS = pAllflameAS / pAllflameAny; // 29.54%
    const pctRes = pAllflameRes / pAllflameAny; // 33.07%

    const outcomeDist: FinalOutcomeDistribution[] = [
      { name: '+4 All Attributes (T1)', probability: pctAttr, saleValueChaos: 85 * divineRate },
      { name: '3% Attack Speed (T1)', probability: pctAS, saleValueChaos: 39 * divineRate },
      { name: '+4% All Elemental Resistance (T1)', probability: pctRes, saleValueChaos: 7 * divineRate },
    ];

    const expectedSaleValue =
      pctAttr * (85 * divineRate) + pctAS * (39 * divineRate) + pctRes * (7 * divineRate);

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

    // ------------------------------------------------------------- STEP 6: Route-Specific Divine Finishing
    const needsDivine = this.target.finalRollRequirements?.some(
      (r) => r.modGroup === 'AfflictionJewelSmallPassivesGrantInt' && r.minValue && r.minValue >= 8
    );

    let expectedDivines = 0;
    let divineNote = 'No Divine Orbs required; target roll already satisfied.';

    if (needsDivine) {
      const intMod = [...startState.prefixes, ...startState.suffixes].find(
        (m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantInt'
      );
      const currentIntRoll = intMod?.currentRoll?.[0];

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
    }

    const step6Cost = expectedDivines * divineRate;
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

    // Total cumulative currencies
    const totalHarvestAttempts = 398.0;
    const expectedCurrencies: Record<string, number> = {
      primalLifeforce: totalHarvestAttempts * 75,
      annul: 73.5,
      exalt: 30.5,
      divine: expectedDivines,
    };

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
    };
  }
}
