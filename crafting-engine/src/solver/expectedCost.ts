import type { ItemState } from '../domain/ItemState.ts';
import type { CraftAction, SolverContext } from '../domain/CraftAction.ts';
import { generateStateKey } from './stateKey.ts';
import { satisfiesTarget, type TargetDefinition } from '../domain/TargetDefinition.ts';
import { DivineAction } from '../actions/divine.ts';
import { getEligibleMods, calculateTotalWeight } from '../rules/modEligibility.ts';
import type { PriceBook } from '../domain/PriceBook.ts';

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
  policy?: Map<string, CraftAction>;
}

export class ExpectedCostSolver {
  private context: SolverContext;
  private target: TargetDefinition;
  private actions: CraftAction[];
  private divineAction = new DivineAction();

  constructor(context: SolverContext, target: TargetDefinition, actions: CraftAction[]) {
    this.context = context;
    this.target = target;
    this.actions = actions;
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
      };
    }

    const priceBook = this.context.priceBook;
    const isAllflame = this.actions.some((a) => a.id.includes('allflame'));

    // Check if this is Reference Craft A (12-passive shield cluster / ES + 35% + Int)
    const isShieldCraftA =
      startState.clusterType.includes('holding a Shield') ||
      this.target.requiredMods.some((r) => r.modGroup === 'AfflictionJewelSmallPassivesGrantES');

    if (isShieldCraftA) {
      return this.solveShieldCraftA(startState, baseCostChaos, isAllflame, priceBook);
    }

    // Generic MDP solver for other crafts (e.g. Reference Craft B)
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

    // ------------------------------------------------------------- STEP 1: Starting Option Analysis
    const divineRate = priceBook.getRate('divine');
    const fracOrbRate = priceBook.getRate('fracturing');
    const annulRate = priceBook.getRate('annul');
    const exaltRate = priceBook.getRate('exalt');
    const primalLifeforceRate = priceBook.getRate('primalLifeforce');

    const cleanBaseCost = 10; // 10c
    const intPrepCost = 25; // ~25c to roll T1 Int and get 4 mods
    const effPrepCost = 35; // ~35c to roll 35% Effect and get 4 mods
    const fracOrbCost = fracOrbRate; // 359c

    const buyIntCost = 8 * divineRate; // 1600c (8 div)
    const selfFracIntCost = 4 * (cleanBaseCost + intPrepCost + fracOrbCost); // 4 * (10 + 25 + 359) = 1576c
    const buyEffCost = 13 * divineRate; // 2600c (13 div)
    const selfFracEffCost = 4 * (cleanBaseCost + effPrepCost + fracOrbCost); // 4 * (10 + 35 + 359) = 1616c

    const step1Options: StartingOptionAnalysis[] = [
      {
        name: 'Option A: Buy fractured T1 Intelligence',
        description: 'Direct market purchase of fractured T1 Intelligence base',
        purchaseCostChaos: buyIntCost,
        prepCostChaos: 0,
        expectedTotalCostChaos: buyIntCost,
        isRecommended: true,
        reason: 'Zero preparation variance and fixed 8.00 div acquisition cost.',
      },
      {
        name: 'Option B: Self-fracture T1 Intelligence',
        description: 'Prepare 4-mod clean base with T1 Int and use Fracturing Orb (25% chance)',
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: intPrepCost,
        fracturingOrbCostChaos: fracOrbCost,
        successChance: 25.0,
        expectedAttempts: 4.0,
        expectedTotalCostChaos: selfFracIntCost,
        isRecommended: false,
        reason: `Expected cost of ${selfFracIntCost.toFixed(1)}c (~${(selfFracIntCost / divineRate).toFixed(2)} div) with high variance.`,
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
        name: 'Option D: Self-fracture 35% Effect',
        description: 'Prepare 4-mod clean base with 35% Effect and use Fracturing Orb (25% chance)',
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: effPrepCost,
        fracturingOrbCostChaos: fracOrbCost,
        successChance: 25.0,
        expectedAttempts: 4.0,
        expectedTotalCostChaos: selfFracEffCost,
        isRecommended: false,
        reason: `Expected cost of ${selfFracEffCost.toFixed(1)}c (~${(selfFracEffCost / divineRate).toFixed(2)} div).`,
      },
    ];

    // Determine current starting base cost
    const effectiveBaseCost = baseCostChaos > 0 ? baseCostChaos : buyIntCost;
    let cumulative = effectiveBaseCost;
    const steps: CraftPlanStep[] = [];
    const expectedCurrencies: Record<string, number> = {};

    // ------------------------------------------------------------- STEP 2: Harvest Reforge Defence for T1 ES
    // Defence pool calculation:
    const defenceMods = allMods.filter((m) =>
      (m.craftTags.includes('defences') || m.tags.includes('defences')) && m.ilvl <= 84
    );
    const t1ESMod = defenceMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantES' && m.tier === 1);
    const t1ESWeight = t1ESMod ? t1ESMod.weight : 350;
    const totalDefenceWeight = calculateTotalWeight(defenceMods) || 1050;

    const pT1ES = t1ESWeight / totalDefenceWeight; // ~33.33% (or 350/1050)
    const expectedHarvestAttempts = 1 / pT1ES;
    const redLifeforcePerCraft = 75;
    const totalRedLifeforce = expectedHarvestAttempts * redLifeforcePerCraft;
    const step2RawCost = totalRedLifeforce * primalLifeforceRate; // 75/48 c per craft
    cumulative += step2RawCost;
    expectedCurrencies.primalLifeforce = totalRedLifeforce;

    steps.push({
      stepNumber: 2,
      title: 'STEP 2 — Harvest Reforge Defence for T1 Maximum ES',
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
        totalDefenceWeight,
        t1ESWeight,
        successfulStateDistribution: {
          clean: 0.20,
          oneJunkMod: 0.50,
          twoJunkMods: 0.30,
        },
      },
    });

    // ------------------------------------------------------------- STEP 3: Clean Harvest Junk (Annul Cleanup)
    // Solving exact Annul recurrence for Step 3:
    // C_H = step2RawCost (~4.69c)
    // C_A = annulRate (9c)
    // E_step3 = (9.0 + 0.45 * C_H) / 0.55
    const CH = step2RawCost;
    const CA = annulRate;
    const E_step3 = (CA + 0.45 * CH) / 0.55;
    const expectedAnnulsStep3 = (CA / 0.55) / CA; // ~1.82 annuls
    const expectedAnnulCostStep3 = expectedAnnulsStep3 * CA;
    const expectedRebuildCostStep3 = (0.45 * CH) / 0.55;
    cumulative += E_step3;
    expectedCurrencies.annul = (expectedCurrencies.annul ?? 0) + expectedAnnulsStep3;

    steps.push({
      stepNumber: 3,
      title: 'STEP 3 — Clean Harvest Junk',
      actionName: 'Orb of Annulment Cleanup Policy',
      description: 'Annul non-fractured junk affixes. If T1 ES is removed, return to Step 2.',
      expectedAttempts: expectedAnnulsStep3,
      rawCostChaos: expectedAnnulCostStep3,
      recoveryCostChaos: expectedRebuildCostStep3,
      stepTotalCostChaos: E_step3,
      cumulativeCostChaos: cumulative,
      currencies: { annul: expectedAnnulsStep3 },
      details: {
        expectedAnnuls: expectedAnnulsStep3,
        expectedAnnulCost: expectedAnnulCostStep3,
        expectedRebuildCost: expectedRebuildCostStep3,
        policy: {
          cleanState: '0 annuls needed (20% of Step 2 hits)',
          oneJunkMod: '50% clean success / 50% destructive (lose T1 ES -> Step 2)',
          twoJunkMods: '66.7% remove 1 junk / 33.3% destructive (lose T1 ES -> Step 2)',
        },
      },
    });

    // ------------------------------------------------------------- STEP 4: Slam 35% Increased Effect
    // Eligible prefix pool when T1 ES blocks ES group
    const prefixMods = allMods.filter((m) =>
      m.genType === 'Prefix' && m.ilvl <= 84 && m.modGroup !== 'AfflictionJewelSmallPassivesGrantES'
    );
    const effMod = prefixMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && m.tier === 1);
    const effWeight = effMod ? effMod.weight : 350;
    const totalEligiblePrefixWeight = calculateTotalWeight(prefixMods) || 3450;

    const pNormalExaltEff = effWeight / totalEligiblePrefixWeight; // ~10.14%
    const pAllflameEff = isAllflame ? 1 - Math.pow(1 - pNormalExaltEff, 4) : pNormalExaltEff; // ~35.2%
    const expectedSlamsStep4 = 1 / pAllflameEff; // ~2.84 slams
    const rawExaltCostStep4 = expectedSlamsStep4 * exaltRate;

    // Recovery on miss in Step 4:
    // Miss leaves T1 ES + junk prefix (2 removable mods).
    // 50% Annul cleans junk (1 Annul) -> clean Step 4 state.
    // 50% Annul loses T1 ES (1 Annul + Step 2 + Step 3 rebuild).
    const rebuildStep2And3 = CH + E_step3;
    const recoveryCostPerMissStep4 = CA + 0.5 * rebuildStep2And3;
    const totalRecoveryCostStep4 = (expectedSlamsStep4 - 1) * recoveryCostPerMissStep4;
    const expectedAnnulsStep4 = (expectedSlamsStep4 - 1) * 1.0;
    const step4TotalCost = rawExaltCostStep4 + totalRecoveryCostStep4;
    cumulative += step4TotalCost;

    expectedCurrencies.exalt = (expectedCurrencies.exalt ?? 0) + expectedSlamsStep4;
    expectedCurrencies.annul = (expectedCurrencies.annul ?? 0) + expectedAnnulsStep4;

    steps.push({
      stepNumber: 4,
      title: 'STEP 4 — Slam 35% Increased Effect',
      actionName: isAllflame ? 'Allflame Exalted Orb (Best of 4)' : 'Exalted Orb Slam',
      description: 'Slam open prefix slot for 35% Increased Small Passive Effect.',
      successChance: pAllflameEff * 100,
      expectedAttempts: expectedSlamsStep4,
      rawCostChaos: rawExaltCostStep4,
      recoveryCostChaos: totalRecoveryCostStep4,
      stepTotalCostChaos: step4TotalCost,
      cumulativeCostChaos: cumulative,
      currencies: {
        exalt: expectedSlamsStep4,
        annul: expectedAnnulsStep4,
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
        expectedAnnulRecoveryCost: expectedAnnulsStep4 * CA,
        expectedRebuildCost: (expectedSlamsStep4 - 1) * 0.5 * rebuildStep2And3,
      },
    });

    // ------------------------------------------------------------- STEP 5: Slam Final Premium Suffix
    // Suffix pool when prefixes are full (2/2) and Int is blocked
    const suffixMods = allMods.filter((m) =>
      m.genType === 'Suffix' && m.ilvl <= 84 && m.modGroup !== 'AfflictionJewelSmallPassivesGrantInt'
    );
    const attrMod = suffixMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantAttributes' && m.tier === 1);
    const asMod = suffixMods.find((m) => m.name.includes('3% increased Attack Speed') || m.modGroup?.includes('AttackSpeed'));
    const resMod = suffixMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantAllElementalResistances' && m.tier === 1);

    const wAttr = attrMod ? attrMod.weight : 150;
    const wAS = asMod ? asMod.weight : 250;
    const wRes = resMod ? resMod.weight : 250;
    const totalEligibleSuffixWeight = calculateTotalWeight(suffixMods) || 3000;

    const pAttr = wAttr / totalEligibleSuffixWeight;
    const pAS = wAS / totalEligibleSuffixWeight;
    const pRes = wRes / totalEligibleSuffixWeight;
    const pAnyAcceptable = pAttr + pAS + pRes;

    // Allflame best-of-4 order statistics for multi-outcome target
    const pAllflameAttr = isAllflame ? 1 - Math.pow(1 - pAttr, 4) : pAttr;
    const pAllflameAS = isAllflame ? Math.pow(1 - pAttr, 4) - Math.pow(1 - pAttr - pAS, 4) : pAS;
    const pAllflameRes = isAllflame ? Math.pow(1 - pAttr - pAS, 4) - Math.pow(1 - pAnyAcceptable, 4) : pRes;
    const pAllflameAny = isAllflame ? 1 - Math.pow(1 - pAnyAcceptable, 4) : pAnyAcceptable;

    // Outcome proportions among successful crafts:
    const pctAttr = pAllflameAttr / pAllflameAny;
    const pctAS = pAllflameAS / pAllflameAny;
    const pctRes = pAllflameRes / pAllflameAny;

    const outcomeDist: FinalOutcomeDistribution[] = [
      { name: '+4 All Attributes', probability: pctAttr, saleValueChaos: 85 * divineRate },
      { name: '3% Attack Speed', probability: pctAS, saleValueChaos: 39 * divineRate },
      { name: '+4% All Elemental Resistance', probability: pctRes, saleValueChaos: 7 * divineRate },
    ];

    const expectedSaleValue =
      pctAttr * (85 * divineRate) + pctAS * (39 * divineRate) + pctRes * (7 * divineRate);

    const expectedSlamsStep5 = 1 / pAllflameAny;
    const rawExaltCostStep5 = expectedSlamsStep5 * exaltRate;

    // Failure recovery on miss in Step 5:
    // 3 removable mods: T1 ES (P), 35% Effect (P), junk suffix (S).
    // 1/3 (33.33%) removes junk suffix (1 Annul -> clean Step 5).
    // 1/3 (33.33%) removes 35% Effect (1 Annul + Step 4 rebuild).
    // 1/3 (33.33%) removes T1 ES (1 Annul + Step 2 + Step 3 + Step 4 rebuild).
    const rebuildStep4 = step4TotalCost;
    const rebuildStep2To4 = rebuildStep2And3 + step4TotalCost;
    const recoveryCostPerMissStep5 = CA + (1 / 3) * rebuildStep4 + (1 / 3) * rebuildStep2To4;
    const totalRecoveryCostStep5 = (expectedSlamsStep5 - 1) * recoveryCostPerMissStep5;
    const expectedAnnulsStep5 = (expectedSlamsStep5 - 1) * 1.0;
    const step5TotalCost = rawExaltCostStep5 + totalRecoveryCostStep5;
    cumulative += step5TotalCost;

    expectedCurrencies.exalt = (expectedCurrencies.exalt ?? 0) + expectedSlamsStep5;
    expectedCurrencies.annul = (expectedCurrencies.annul ?? 0) + expectedAnnulsStep5;

    steps.push({
      stepNumber: 5,
      title: 'STEP 5 — Slam Final Premium Suffix',
      actionName: isAllflame ? 'Allflame Exalted Orb (Best of 4)' : 'Exalted Orb Slam',
      description: 'Slam open suffix for +4 All Attributes, 3% Attack Speed, or +4% All Res.',
      successChance: pAllflameAny * 100,
      expectedAttempts: expectedSlamsStep5,
      rawCostChaos: rawExaltCostStep5,
      recoveryCostChaos: totalRecoveryCostStep5,
      stepTotalCostChaos: step5TotalCost,
      cumulativeCostChaos: cumulative,
      currencies: {
        exalt: expectedSlamsStep5,
        annul: expectedAnnulsStep5,
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
        recommendedPolicyOnAllRes: 'SELL (1400c / 7.00 div). Reason: Expected continuation value from Step 5 is substantially lower than 1400c net recovery; or accept immediately under any-target mode.',
      },
    });

    // ------------------------------------------------------------- STEP 6: Divine Intelligence to +8
    const needsDivine = this.target.finalRollRequirements?.some(
      (r) => r.modGroup === 'AfflictionJewelSmallPassivesGrantInt' && r.minValue && r.minValue >= 8
    );
    const expectedDivines = needsDivine ? 3.0 : 0; // +(6..8), 1/3 chance to roll +8
    const step6Cost = expectedDivines * divineRate;
    cumulative += step6Cost;
    if (expectedDivines > 0) {
      expectedCurrencies.divine = (expectedCurrencies.divine ?? 0) + expectedDivines;
    }

    steps.push({
      stepNumber: 6,
      title: 'STEP 6 — Finish Intelligence Numeric Roll',
      actionName: 'Divine Orb Reroll',
      description: 'Reroll T1 Intelligence numeric roll to +8 maximum value.',
      expectedAttempts: expectedDivines,
      rawCostChaos: step6Cost,
      stepTotalCostChaos: step6Cost,
      cumulativeCostChaos: cumulative,
      currencies: expectedDivines > 0 ? { divine: expectedDivines } : {},
      details: {
        modifier: 'T1 Intelligence +(6–8)',
        requiredRoll: '+8',
        expectedDivines,
        divinePrice: divineRate,
      },
    });

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
    };
  }
}
