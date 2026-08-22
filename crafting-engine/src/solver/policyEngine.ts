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

export interface SuffixPoolAuditState {
  stateLabel: string;
  description: string;
  eligibleSuffixCount: number;
  eligibleSuffixWeight: number;
  t1IntWeight?: number;
  t1IntChance?: number;
  t1IntNormalChance?: number;
  t1IntAllflameChance?: number;
  premiumTargetWeight?: number;
  premiumTargetChance?: number;
  premiumTargetNormalChance?: number;
  premiumTargetAllflameChance?: number;
  allTargetWeight?: number;
  allTargetChance?: number;
  allTargetNormalChance?: number;
  allTargetAllflameChance?: number;
  blockedGroups: string[];
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

  // Branch-specific continuation values for fractured 35% route
  public readonly vInt: number;
  public readonly vAttr: number;
  public readonly vAS: number;
  public readonly vRes: number;

  public readonly hStep2: number;
  public readonly aStep2: number;
  public readonly pCleanPass: number;

  public readonly W_A: number;
  public readonly W_B: number;
  public readonly W_C: number;
  public readonly W_D: number;
  public readonly W_E: number;

  public readonly pHit: number;
  public readonly pPremGivenInt: number;
  public readonly pIntGivenAttr: number;
  public readonly pIntGivenAS: number;
  public readonly pIntGivenRes: number;

  public readonly expHarvestsFrac35: number;
  public readonly expAnnulsFrac35: number;
  public readonly expExaltsFrac35: number;
  public readonly expHarvestsDirectTarget: number;
  public readonly expAnnulsDirectTarget: number;
  public readonly step3AnnulsFrac35: number;
  public readonly step4AnnulsFrac35: number;
  public readonly vEnter: number;
  public readonly branchProbabilities: { attr: number; as: number; res: number };
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

    const ilvl = 84;
    let totalSuffixWeight = 15650;
    let intGroupWeight = 1200;
    let attrGroupWeight = 1200;
    let asGroupWeight = 950;
    let resGroupWeight = 1200;

    let wInt = 300;
    let wAttr = 300;
    let wAS = 250;
    let wRes = 300;

    if (pool) {
      const defMods = getDefenceModsForCluster(pool, ilvl);
      const t1ES = defMods.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantES' && m.tier === 1);
      const totDefWeight = calculateTotalWeight(defMods) || 4200;
      this.pT1ES = (t1ES?.weight ?? 300) / totDefWeight;

      const allMods = pool.getAllMods();
      const allPrefixes = allMods.filter((m) => m.genType === 'Prefix' && m.ilvl <= ilvl);
      const allSuffixes = allMods.filter((m) => m.genType === 'Suffix' && m.ilvl <= ilvl);
      totalSuffixWeight = calculateTotalWeight(allSuffixes) || 15650;

      const eff35Mod = allPrefixes.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && m.tier === 1);
      const totPrefWeight = calculateTotalWeight(allPrefixes) || 11302;
      this.p4 = sampleRate(eff35Mod?.weight ?? 300, totPrefWeight);

      const intMod = allSuffixes.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantInt' && m.tier === 1);
      const attrMod = allSuffixes.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantAttributes' && m.tier === 1);
      const asMod = allSuffixes.find((m) => m.name.includes('3% increased Attack Speed') && m.tier === 1);
      const resMod = allSuffixes.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantElementalRes' && m.tier === 1);

      wInt = intMod?.weight ?? 300;
      wAttr = attrMod?.weight ?? 300;
      wAS = asMod?.weight ?? 250;
      wRes = resMod?.weight ?? 300;

      intGroupWeight = calculateTotalWeight(allSuffixes.filter((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantInt'));
      attrGroupWeight = calculateTotalWeight(allSuffixes.filter((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantAttributes'));
      asGroupWeight = asMod ? calculateTotalWeight(allSuffixes.filter((m) => m.modGroup === asMod.modGroup)) : 0;
      resGroupWeight = calculateTotalWeight(allSuffixes.filter((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantElementalRes'));
    } else {
      this.pT1ES = 300 / 4200; // 0.07142857 (7.14%)
      this.p4 = sampleRate(300, 11302);
    }

    this.W_A = totalSuffixWeight;
    this.W_B = totalSuffixWeight - intGroupWeight;
    this.W_C = totalSuffixWeight - attrGroupWeight;
    this.W_D = totalSuffixWeight - asGroupWeight;
    this.W_E = totalSuffixWeight - resGroupWeight;

    const wTarget = wInt + wAttr + wAS + wRes;
    const wPrem = wAttr + wAS + wRes;

    this.pInt = sampleRate(wInt, this.W_A);
    this.p5 = sampleRate(wPrem, this.W_B);
    this.p5FullPool = sampleRate(wPrem, this.W_A);

    this.pHit = sampleRate(wTarget, this.W_A);
    this.pPremGivenInt = sampleRate(wPrem, this.W_B);
    this.pIntGivenAttr = sampleRate(wInt, this.W_C);
    this.pIntGivenAS = sampleRate(wInt, this.W_D);
    this.pIntGivenRes = sampleRate(wInt, this.W_E);

    // -------------------------------------------------------------
    // INTEGRATED HARVEST + SUFFIX SLAM MARKOV SYSTEM (FRACTURED 35% ROUTE)
    // -------------------------------------------------------------
    // Note: On rare cluster jewels, max prefixes = 2. With Fractured 35% Effect (Prefix 1)
    // and guaranteed Defence mod (Prefix 2), prefix capacity is saturated. Thus, all 1-2
    // extra affixes generated during Harvest are drawn strictly from eligible suffixes (W_A).
    // Model exact 1-draw and 2-draw Harvest additional affix probabilities:
    const activeTargetWeight = this.targetRequiresInt ? (wInt + wPrem) : wPrem;
    const qInt = wInt / this.W_A;
    const qTarget = activeTargetWeight / this.W_A;
    const qJunk = 1 - qTarget;
    const p1_target = qTarget;
    const p1_junk = qJunk;

    const p2_int_prem = this.targetRequiresInt
      ? (qInt * (wPrem / this.W_B)) +
        ((wAttr / this.W_A) * (wInt / this.W_C)) +
        ((wAS / this.W_A) * (wInt / this.W_D)) +
        ((wRes / this.W_A) * (wInt / this.W_E))
      : ((wAttr / this.W_A) * ((wPrem - wAttr) / this.W_C)) +
        ((wAS / this.W_A) * ((wPrem - wAS) / this.W_D)) +
        ((wRes / this.W_A) * ((wPrem - wRes) / this.W_E));

    const p2_target_then_junk = this.targetRequiresInt
      ? qInt * ((this.W_B - wPrem) / this.W_B) +
        (wAttr / this.W_A) * ((this.W_C - wInt) / this.W_C) +
        (wAS / this.W_A) * ((this.W_D - wInt) / this.W_D) +
        (wRes / this.W_A) * ((this.W_E - wInt) / this.W_E)
      : (wAttr / this.W_A) * ((this.W_C - (wPrem - wAttr)) / this.W_C) +
        (wAS / this.W_A) * ((this.W_D - (wPrem - wAS)) / this.W_D) +
        (wRes / this.W_A) * ((this.W_E - (wPrem - wRes)) / this.W_E);

    let p2_junk_then_target = 0;
    if (pool) {
      const allMods = pool.getAllMods();
      const allSuffixes = allMods.filter((m) => m.genType === 'Suffix' && m.ilvl <= ilvl);
      const targetGroupSet = new Set<string>();
      if (this.targetRequiresInt) targetGroupSet.add('AfflictionJewelSmallPassivesGrantInt');
      targetGroupSet.add('AfflictionJewelSmallPassivesGrantAttributes');
      targetGroupSet.add('AfflictionJewelSmallPassivesGrantElementalRes');

      const junkSuffixes = allSuffixes.filter(
        (m) => !targetGroupSet.has(m.modGroup) && !m.name.includes('3% increased Attack Speed')
      );
      const junkGroupWeights = new Map<string, number>();
      for (const m of junkSuffixes) {
        const g = m.modGroup || m.name;
        junkGroupWeights.set(g, (junkGroupWeights.get(g) || 0) + m.weight);
      }
      for (const [, groupW] of junkGroupWeights.entries()) {
        p2_junk_then_target += (groupW / this.W_A) * (activeTargetWeight / (this.W_A - groupW));
      }
    } else {
      const defaultJunkGroups = [1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 600, 600, 300, 700];
      for (const groupW of defaultJunkGroups) {
        p2_junk_then_target += (groupW / this.W_A) * (activeTargetWeight / (this.W_A - groupW));
      }
    }

    const p2_target_junk = p2_target_then_junk + p2_junk_then_target;
    const p2_junk_junk = Math.max(0, 1 - p2_int_prem - p2_target_junk);

    // Direct clean pass from Harvest includes junk cleanups and direct single-mod / double-mod target hits:
    this.pCleanPass = 0.5 * (p1_target * 1.0 + p1_junk * 0.5) + 0.5 * (p2_int_prem * 1.0 + p2_target_junk * 0.5 + p2_junk_junk * (1 / 3));
    const aSpend = 0.5 * (p1_target * 0.0 + p1_junk * 1.0) + 0.5 * (p2_int_prem * 0.0 + p2_target_junk * (4 / 3) + p2_junk_junk * (5 / 3));

    const hCycle = 1 / this.pT1ES;
    const H_Harvest = hCycle / this.pCleanPass;
    const A_Harvest = aSpend / this.pCleanPass;
    const v_Harvest = H_Harvest * this.cH + A_Harvest * this.cA;

    const pTerminalFromHarvest = this.targetRequiresInt
      ? (0.5 * p2_int_prem * 1.0) / this.pCleanPass
      : (0.5 * p1_target * 1.0 + 0.5 * p2_int_prem * 1.0 + 0.5 * p2_target_junk * (1 / 3)) / this.pCleanPass;
    const pDirectTarget = this.targetRequiresInt
      ? (0.5 * p1_target * 1.0 + 0.5 * p2_target_junk * (1 / 3)) / this.pCleanPass
      : 0;
    const pDirectS0 = 1 - pTerminalFromHarvest - pDirectTarget;

    const piH_Int = this.targetRequiresInt ? (wInt / activeTargetWeight) : 0;
    const piH_Attr = wAttr / activeTargetWeight;
    const piH_AS = wAS / activeTargetWeight;
    const piH_Res = wRes / activeTargetWeight;

    // 4-choice Allflame branch probabilities from S0 using exact order statistics:
    const qA = wAttr / this.W_A;
    const qAS = wAS / this.W_A;
    const qR = wRes / this.W_A;
    const qI = wInt / this.W_A;
    const pAllJunk = enableAllflame ? Math.pow(qJunk, 4) : qJunk;
    this.pHit = 1 - pAllJunk;

    let pIntBranch = 0;
    let pAttrBranch = 0;
    let pASBranch = 0;
    let pResBranch = 0;

    if (this.targetRequiresInt) {
      if (enableAllflame) {
        pIntBranch = 1 - Math.pow(1 - qI, 4);
        pAttrBranch = Math.pow(1 - qI, 4) - Math.pow(1 - qI - qA, 4);
        pResBranch = Math.pow(1 - qI - qA, 4) - Math.pow(1 - qI - qA - qR, 4);
        pASBranch = Math.pow(1 - qI - qA - qR, 4) - Math.pow(1 - qI - qA - qR - qAS, 4);
      } else {
        pIntBranch = qI;
        pAttrBranch = qA;
        pResBranch = qR;
        pASBranch = qAS;
      }
    } else {
      if (enableAllflame) {
        pAttrBranch = 1 - Math.pow(1 - qA, 4);
        pASBranch = Math.pow(1 - qA, 4) - Math.pow(1 - qA - qAS, 4);
        pResBranch = Math.pow(1 - qA - qAS, 4) - Math.pow(1 - qA - qAS - qR, 4);
      } else {
        pAttrBranch = qA;
        pASBranch = qAS;
        pResBranch = qR;
      }
    }

    const piInt = this.pHit > 0 ? pIntBranch / this.pHit : 0;
    const piAttr = this.pHit > 0 ? pAttrBranch / this.pHit : 0;
    const piAS = this.pHit > 0 ? pASBranch / this.pHit : 0;
    const piRes = this.pHit > 0 ? pResBranch / this.pHit : 0;

    // Terminal branch absorption probabilities:
    let V = [0, 0, 0, 0, 0]; // [S0, S_Int, S_Attr, S_AS, S_Res]
    let H_vec = [0, 0, 0, 0, 0];
    let A_vec = [0, 0, 0, 0, 0];
    let E_vec = [0, 0, 0, 0, 0];
    let B_Attr = [0, 0, 0, 0, 0];
    let B_AS = [0, 0, 0, 0, 0];
    let B_Res = [0, 0, 0, 0, 0];

    const qA_B = wAttr / this.W_B;
    const qAS_B = wAS / this.W_B;
    const pAttr_from_Int = enableAllflame
      ? (1 - Math.pow(1 - qA_B, 4)) / this.pPremGivenInt
      : (wAttr / wPrem);
    const pAS_from_Int = enableAllflame
      ? (Math.pow(1 - qA_B, 4) - Math.pow(1 - qA_B - qAS_B, 4)) / this.pPremGivenInt
      : (wAS / wPrem);
    const pRes_from_Int = Math.max(0, 1 - pAttr_from_Int - pAS_from_Int);

    const p2_int_attr = this.targetRequiresInt ? (qInt * (wAttr / this.W_B)) + ((wAttr / this.W_A) * (wInt / this.W_C)) : 0;
    const p2_int_as = this.targetRequiresInt ? (qInt * (wAS / this.W_B)) + ((wAS / this.W_A) * (wInt / this.W_D)) : 0;
    const p2_int_res = this.targetRequiresInt ? (qInt * (wRes / this.W_B)) + ((wRes / this.W_A) * (wInt / this.W_E)) : 0;

    const pTermAttr = this.targetRequiresInt
      ? (0.5 * p2_int_attr * 1.0) / this.pCleanPass
      : (0.5 * qA + 0.5 * (qA * ((wPrem - wAttr) / this.W_C) + (qA * ((this.W_C - (wPrem - wAttr)) / this.W_C) + p2_junk_then_target * (wAttr / activeTargetWeight)) * (1 / 3))) / this.pCleanPass;
    const pTermAS = this.targetRequiresInt
      ? (0.5 * p2_int_as * 1.0) / this.pCleanPass
      : (0.5 * qAS + 0.5 * (qAS * ((wPrem - wAS) / this.W_D) + (qAS * ((this.W_D - (wPrem - wAS)) / this.W_D) + p2_junk_then_target * (wAS / activeTargetWeight)) * (1 / 3))) / this.pCleanPass;
    const pTermRes = this.targetRequiresInt
      ? (0.5 * p2_int_res * 1.0) / this.pCleanPass
      : (0.5 * qR + 0.5 * (qR * ((wPrem - wRes) / this.W_E) + (qR * ((this.W_E - (wPrem - wRes)) / this.W_E) + p2_junk_then_target * (wRes / activeTargetWeight)) * (1 / 3))) / this.pCleanPass;

    for (let iter = 0; iter < 10000; iter++) {
      const [v0, vInt, vAttr, vAS, vRes] = V;
      const vExit = pDirectS0 * v0 + pDirectTarget * (piH_Int * vInt + piH_Attr * vAttr + piH_AS * vAS + piH_Res * vRes);
      const vEnter = v_Harvest + vExit;

      const next_v0 = this.cE + this.pHit * (piInt * vInt + piAttr * vAttr + piAS * vAS + piRes * vRes) + (1 - this.pHit) * (this.cA + 0.5 * v0 + 0.5 * vEnter);
      const next_vInt = this.targetRequiresInt ? (this.cE + (1 - this.pPremGivenInt) * ((4 / 3) * this.cA + (1 / 6) * v0 + 0.5 * vEnter)) / (1 - (1 / 3) * (1 - this.pPremGivenInt)) : 0;
      const next_vAttr = this.targetRequiresInt ? (this.cE + (1 - this.pIntGivenAttr) * ((4 / 3) * this.cA + (1 / 6) * v0 + 0.5 * vEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenAttr)) : 0;
      const next_vAS = this.targetRequiresInt ? (this.cE + (1 - this.pIntGivenAS) * ((4 / 3) * this.cA + (1 / 6) * v0 + 0.5 * vEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenAS)) : 0;
      const next_vRes = this.targetRequiresInt ? (this.cE + (1 - this.pIntGivenRes) * ((4 / 3) * this.cA + (1 / 6) * v0 + 0.5 * vEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenRes)) : 0;
      
      const hExit = pDirectS0 * H_vec[0] + pDirectTarget * (piH_Int * H_vec[1] + piH_Attr * H_vec[2] + piH_AS * H_vec[3] + piH_Res * H_vec[4]);
      const hEnter = H_Harvest + hExit;
      const next_h0 = this.pHit * (piInt * H_vec[1] + piAttr * H_vec[2] + piAS * H_vec[3] + piRes * H_vec[4]) + (1 - this.pHit) * (0.5 * H_vec[0] + 0.5 * hEnter);
      const next_hInt = this.targetRequiresInt ? ((1 - this.pPremGivenInt) * ((1 / 6) * H_vec[0] + 0.5 * hEnter)) / (1 - (1 / 3) * (1 - this.pPremGivenInt)) : 0;
      const next_hAttr = this.targetRequiresInt ? ((1 - this.pIntGivenAttr) * ((1 / 6) * H_vec[0] + 0.5 * hEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenAttr)) : 0;
      const next_hAS = this.targetRequiresInt ? ((1 - this.pIntGivenAS) * ((1 / 6) * H_vec[0] + 0.5 * hEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenAS)) : 0;
      const next_hRes = this.targetRequiresInt ? ((1 - this.pIntGivenRes) * ((1 / 6) * H_vec[0] + 0.5 * hEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenRes)) : 0;

      const aExit = pDirectS0 * A_vec[0] + pDirectTarget * (piH_Int * A_vec[1] + piH_Attr * A_vec[2] + piH_AS * A_vec[3] + piH_Res * A_vec[4]);
      const aEnter = A_Harvest + aExit;
      const next_a0 = this.pHit * (piInt * A_vec[1] + piAttr * A_vec[2] + piAS * A_vec[3] + piRes * A_vec[4]) + (1 - this.pHit) * (1 + 0.5 * A_vec[0] + 0.5 * aEnter);
      const next_aInt = this.targetRequiresInt ? ((1 - this.pPremGivenInt) * ((4 / 3) + (1 / 6) * A_vec[0] + 0.5 * aEnter)) / (1 - (1 / 3) * (1 - this.pPremGivenInt)) : 0;
      const next_aAttr = this.targetRequiresInt ? ((1 - this.pIntGivenAttr) * ((4 / 3) + (1 / 6) * A_vec[0] + 0.5 * aEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenAttr)) : 0;
      const next_aAS = this.targetRequiresInt ? ((1 - this.pIntGivenAS) * ((4 / 3) + (1 / 6) * A_vec[0] + 0.5 * aEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenAS)) : 0;
      const next_aRes = this.targetRequiresInt ? ((1 - this.pIntGivenRes) * ((4 / 3) + (1 / 6) * A_vec[0] + 0.5 * aEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenRes)) : 0;

      const eExit = pDirectS0 * E_vec[0] + pDirectTarget * (piH_Int * E_vec[1] + piH_Attr * E_vec[2] + piH_AS * E_vec[3] + piH_Res * E_vec[4]);
      const eEnter = eExit;
      const next_e0 = 1 + this.pHit * (piInt * E_vec[1] + piAttr * E_vec[2] + piAS * E_vec[3] + piRes * E_vec[4]) + (1 - this.pHit) * (0.5 * E_vec[0] + 0.5 * eEnter);
      const next_eInt = this.targetRequiresInt ? (1 + (1 - this.pPremGivenInt) * ((1 / 6) * E_vec[0] + 0.5 * eEnter)) / (1 - (1 / 3) * (1 - this.pPremGivenInt)) : 0;
      const next_eAttr = this.targetRequiresInt ? (1 + (1 - this.pIntGivenAttr) * ((1 / 6) * E_vec[0] + 0.5 * eEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenAttr)) : 0;
      const next_eAS = this.targetRequiresInt ? (1 + (1 - this.pIntGivenAS) * ((1 / 6) * E_vec[0] + 0.5 * eEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenAS)) : 0;
      const next_eRes = this.targetRequiresInt ? (1 + (1 - this.pIntGivenRes) * ((1 / 6) * E_vec[0] + 0.5 * eEnter)) / (1 - (1 / 3) * (1 - this.pIntGivenRes)) : 0;

      const exitAttr = pTermAttr + pDirectS0 * B_Attr[0] + pDirectTarget * (piH_Int * B_Attr[1] + piH_Attr * B_Attr[2] + piH_AS * B_Attr[3] + piH_Res * B_Attr[4]);
      const next_b0_Attr = this.pHit * (piInt * B_Attr[1] + piAttr * B_Attr[2] + piAS * B_Attr[3] + piRes * B_Attr[4]) + (1 - this.pHit) * (0.5 * B_Attr[0] + 0.5 * exitAttr);
      const next_bInt_Attr = this.targetRequiresInt ? (this.pPremGivenInt * pAttr_from_Int + (1 - this.pPremGivenInt) * ((1 / 6) * B_Attr[0] + 0.5 * exitAttr)) / (1 - (1 / 3) * (1 - this.pPremGivenInt)) : 0;
      const next_bAttr_Attr = this.targetRequiresInt ? (this.pIntGivenAttr * 1.0 + (1 - this.pIntGivenAttr) * ((1 / 6) * B_Attr[0] + 0.5 * exitAttr)) / (1 - (1 / 3) * (1 - this.pIntGivenAttr)) : 1.0;
      const next_bAS_Attr = this.targetRequiresInt ? ((1 - this.pIntGivenAS) * ((1 / 6) * B_Attr[0] + 0.5 * exitAttr)) / (1 - (1 / 3) * (1 - this.pIntGivenAS)) : 0;
      const next_bRes_Attr = this.targetRequiresInt ? ((1 - this.pIntGivenRes) * ((1 / 6) * B_Attr[0] + 0.5 * exitAttr)) / (1 - (1 / 3) * (1 - this.pIntGivenRes)) : 0;

      const exitAS = pTermAS + pDirectS0 * B_AS[0] + pDirectTarget * (piH_Int * B_AS[1] + piH_Attr * B_AS[2] + piH_AS * B_AS[3] + piH_Res * B_AS[4]);
      const next_b0_AS = this.pHit * (piInt * B_AS[1] + piAttr * B_AS[2] + piAS * B_AS[3] + piRes * B_AS[4]) + (1 - this.pHit) * (0.5 * B_AS[0] + 0.5 * exitAS);
      const next_bInt_AS = this.targetRequiresInt ? (this.pPremGivenInt * pAS_from_Int + (1 - this.pPremGivenInt) * ((1 / 6) * B_AS[0] + 0.5 * exitAS)) / (1 - (1 / 3) * (1 - this.pPremGivenInt)) : 0;
      const next_bAttr_AS = this.targetRequiresInt ? ((1 - this.pIntGivenAttr) * ((1 / 6) * B_AS[0] + 0.5 * exitAS)) / (1 - (1 / 3) * (1 - this.pIntGivenAttr)) : 0;
      const next_bAS_AS = this.targetRequiresInt ? (this.pIntGivenAS * 1.0 + (1 - this.pIntGivenAS) * ((1 / 6) * B_AS[0] + 0.5 * exitAS)) / (1 - (1 / 3) * (1 - this.pIntGivenAS)) : 1.0;
      const next_bRes_AS = this.targetRequiresInt ? ((1 - this.pIntGivenRes) * ((1 / 6) * B_AS[0] + 0.5 * exitAS)) / (1 - (1 / 3) * (1 - this.pIntGivenRes)) : 0;

      const exitRes = pTermRes + pDirectS0 * B_Res[0] + pDirectTarget * (piH_Int * B_Res[1] + piH_Attr * B_Res[2] + piH_AS * B_Res[3] + piH_Res * B_Res[4]);
      const next_b0_Res = this.pHit * (piInt * B_Res[1] + piAttr * B_Res[2] + piAS * B_Res[3] + piRes * B_Res[4]) + (1 - this.pHit) * (0.5 * B_Res[0] + 0.5 * exitRes);
      const next_bInt_Res = this.targetRequiresInt ? (this.pPremGivenInt * pRes_from_Int + (1 - this.pPremGivenInt) * ((1 / 6) * B_Res[0] + 0.5 * exitRes)) / (1 - (1 / 3) * (1 - this.pPremGivenInt)) : 0;
      const next_bAttr_Res = this.targetRequiresInt ? ((1 - this.pIntGivenAttr) * ((1 / 6) * B_Res[0] + 0.5 * exitRes)) / (1 - (1 / 3) * (1 - this.pIntGivenAttr)) : 0;
      const next_bAS_Res = this.targetRequiresInt ? ((1 - this.pIntGivenAS) * ((1 / 6) * B_Res[0] + 0.5 * exitRes)) / (1 - (1 / 3) * (1 - this.pIntGivenAS)) : 0;
      const next_bRes_Res = this.targetRequiresInt ? (this.pIntGivenRes * 1.0 + (1 - this.pIntGivenRes) * ((1 / 6) * B_Res[0] + 0.5 * exitRes)) / (1 - (1 / 3) * (1 - this.pIntGivenRes)) : 1.0;

      const delta = Math.max(
        Math.abs(next_v0 - v0),
        Math.abs(next_vInt - vInt),
        Math.abs(next_vAttr - vAttr),
        Math.abs(next_vAS - vAS),
        Math.abs(next_vRes - vRes),
        Math.abs(next_h0 - H_vec[0]),
        Math.abs(next_hInt - H_vec[1]),
        Math.abs(next_hAttr - H_vec[2]),
        Math.abs(next_hAS - H_vec[3]),
        Math.abs(next_hRes - H_vec[4]),
        Math.abs(next_a0 - A_vec[0]),
        Math.abs(next_aInt - A_vec[1]),
        Math.abs(next_aAttr - A_vec[2]),
        Math.abs(next_aAS - A_vec[3]),
        Math.abs(next_aRes - A_vec[4]),
        Math.abs(next_e0 - E_vec[0]),
        Math.abs(next_eInt - E_vec[1]),
        Math.abs(next_eAttr - E_vec[2]),
        Math.abs(next_eAS - E_vec[3]),
        Math.abs(next_eRes - E_vec[4]),
        Math.abs(next_b0_Attr - B_Attr[0]),
        Math.abs(next_bInt_Attr - B_Attr[1]),
        Math.abs(next_bAttr_Attr - B_Attr[2]),
        Math.abs(next_bAS_Attr - B_Attr[3]),
        Math.abs(next_bRes_Attr - B_Attr[4]),
        Math.abs(next_b0_AS - B_AS[0]),
        Math.abs(next_bInt_AS - B_AS[1]),
        Math.abs(next_bAttr_AS - B_AS[2]),
        Math.abs(next_bAS_AS - B_AS[3]),
        Math.abs(next_bRes_AS - B_AS[4]),
        Math.abs(next_b0_Res - B_Res[0]),
        Math.abs(next_bInt_Res - B_Res[1]),
        Math.abs(next_bAttr_Res - B_Res[2]),
        Math.abs(next_bAS_Res - B_Res[3]),
        Math.abs(next_bRes_Res - B_Res[4])
      );

      V = [next_v0, next_vInt, next_vAttr, next_vAS, next_vRes];
      H_vec = [next_h0, next_hInt, next_hAttr, next_hAS, next_hRes];
      A_vec = [next_a0, next_aInt, next_aAttr, next_aAS, next_aRes];
      E_vec = [next_e0, next_eInt, next_eAttr, next_eAS, next_eRes];
      B_Attr = [next_b0_Attr, next_bInt_Attr, next_bAttr_Attr, next_bAS_Attr, next_bRes_Attr];
      B_AS = [next_b0_AS, next_bInt_AS, next_bAttr_AS, next_bAS_AS, next_bRes_AS];
      B_Res = [next_b0_Res, next_bInt_Res, next_bAttr_Res, next_bAS_Res, next_bRes_Res];

      if (delta < 1e-11 && iter > 10) break;
    }

    this.hStep2 = H_Harvest;
    this.aStep2 = A_Harvest;
    this.vStep2 = v_Harvest;

    this.vClean1 = this.cA + 0.5 * this.vStep2;
    this.vClean2 = (5 / 3) * this.cA + (2 / 3) * this.vStep2;
    this.v4Step = (this.cE + (1 - this.p4) * (this.cA + 0.5 * this.vStep2)) / this.p4;
    this.v5Step = (this.cE + (1 - this.p5) * (this.cA + (2 / 3) * this.v4Step + (1 / 3) * this.vStep2)) / this.p5;
    this.v5StepFullPool = (this.cE + (1 - this.p5FullPool) * (this.cA + 0.5 * this.vStep2)) / this.p5FullPool;

    this.vCleanFrac35 = V[0];
    this.vInt = V[1];
    this.vAttr = V[2];
    this.vAS = V[3];
    this.vRes = V[4];

    this.v5StepEff = this.vInt;
    this.v4Int = (wAttr / wPrem) * this.vAttr + (wAS / wPrem) * this.vAS + (wRes / wPrem) * this.vRes;

    this.expHarvestsFrac35 = H_Harvest + (pDirectS0 * H_vec[0] + pDirectTarget * (piH_Int * H_vec[1] + piH_Attr * H_vec[2] + piH_AS * H_vec[3] + piH_Res * H_vec[4]));
    this.expAnnulsFrac35 = A_Harvest + (pDirectS0 * A_vec[0] + pDirectTarget * (piH_Int * A_vec[1] + piH_Attr * A_vec[2] + piH_AS * A_vec[3] + piH_Res * A_vec[4]));
    this.expExaltsFrac35 = pDirectS0 * E_vec[0] + pDirectTarget * (piH_Int * E_vec[1] + piH_Attr * E_vec[2] + piH_AS * E_vec[3] + piH_Res * E_vec[4]);

    const pJointDirect = this.targetRequiresInt
      ? (0.5 * p2_int_prem)
      : (0.5 * p1_target + 0.5 * p2_int_prem + 0.5 * p2_target_junk * (1 / 3));
    this.expHarvestsDirectTarget = pJointDirect > 0 ? (1 / (this.pT1ES * pJointDirect)) : 12280.0;
    this.expAnnulsDirectTarget = (!this.targetRequiresInt && pJointDirect > 0)
      ? (0.5 * p2_target_junk * (1 / 3)) / pJointDirect
      : 0.0;

    this.vEnter = v_Harvest + (pDirectS0 * V[0] + pDirectTarget * (piH_Int * V[1] + piH_Attr * V[2] + piH_AS * V[3] + piH_Res * V[4]));
    this.step3AnnulsFrac35 = (this.expHarvestsFrac35 / H_Harvest) * A_Harvest;
    this.step4AnnulsFrac35 = this.expAnnulsFrac35 - this.step3AnnulsFrac35;

    const numAttr = pTermAttr + pDirectS0 * B_Attr[0] + pDirectTarget * (piH_Int * B_Attr[1] + piH_Attr * B_Attr[2] + piH_AS * B_Attr[3] + piH_Res * B_Attr[4]);
    const numAS = pTermAS + pDirectS0 * B_AS[0] + pDirectTarget * (piH_Int * B_AS[1] + piH_Attr * B_AS[2] + piH_AS * B_AS[3] + piH_Res * B_AS[4]);
    const numRes = pTermRes + pDirectS0 * B_Res[0] + pDirectTarget * (piH_Int * B_Res[1] + piH_Attr * B_Res[2] + piH_AS * B_Res[3] + piH_Res * B_Res[4]);
    const totalBranchSum = numAttr + numAS + numRes || 1;

    this.branchProbabilities = {
      attr: numAttr / totalBranchSum,
      as: numAS / totalBranchSum,
      res: numRes / totalBranchSum,
    };

    this.vStep5 = this.v5Step;
    this.vStep4 = this.v4Step + this.vStep5;
  }

  public getSuffixPoolAudit(pool: ModPool, ilvl = 84): SuffixPoolAuditState[] {
    const allMods = pool.getAllMods();
    const suffixes = allMods.filter((m) => m.genType === 'Suffix' && m.ilvl <= ilvl);
    const tInt = suffixes.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantInt' && m.tier === 1);
    const tAttr = suffixes.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantAttributes' && m.tier === 1);
    const tAS = suffixes.find((m) => m.name.includes('3% increased Attack Speed') && m.tier === 1);
    const tRes = suffixes.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesGrantElementalRes' && m.tier === 1);

    const wInt = tInt?.weight ?? 300;
    const wAttr = tAttr?.weight ?? 300;
    const wAS = tAS?.weight ?? 250;
    const wRes = tRes?.weight ?? 300;
    const wPrem = wAttr + wAS + wRes;
    const wTotalTarget = wInt + wPrem;

    const normalRate = (w: number, W: number) => (w / W) * 100;
    const allflameRate = (w: number, W: number) => (this.enableAllflame ? 1 - Math.pow(1 - w / W, 4) : w / W) * 100;

    return [
      {
        stateLabel: 'State A — Frac 35 + T1 ES, no suffixes',
        description: 'Initial clean prefix state before suffix slams',
        eligibleSuffixCount: suffixes.length,
        eligibleSuffixWeight: this.W_A,
        t1IntWeight: wInt,
        t1IntChance: allflameRate(wInt, this.W_A),
        t1IntNormalChance: normalRate(wInt, this.W_A),
        t1IntAllflameChance: allflameRate(wInt, this.W_A),
        premiumTargetWeight: wPrem,
        premiumTargetChance: allflameRate(wPrem, this.W_A),
        premiumTargetNormalChance: normalRate(wPrem, this.W_A),
        premiumTargetAllflameChance: allflameRate(wPrem, this.W_A),
        allTargetWeight: wTotalTarget,
        allTargetChance: this.pHit * 100,
        allTargetNormalChance: normalRate(wTotalTarget, this.W_A),
        allTargetAllflameChance: this.pHit * 100,
        blockedGroups: ['None (Full suffix pool)'],
      },
      {
        stateLabel: 'State B — Frac 35 + T1 ES + T1 Intelligence',
        description: 'T1 Intelligence locked, rolling for final premium suffix',
        eligibleSuffixCount: suffixes.filter((m) => m.modGroup !== 'AfflictionJewelSmallPassivesGrantInt').length,
        eligibleSuffixWeight: this.W_B,
        premiumTargetWeight: wPrem,
        premiumTargetChance: this.pPremGivenInt * 100,
        premiumTargetNormalChance: normalRate(wPrem, this.W_B),
        premiumTargetAllflameChance: this.pPremGivenInt * 100,
        blockedGroups: [`AfflictionJewelSmallPassivesGrantInt (${(this.W_A - this.W_B).toLocaleString()} weight blocked)`],
      },
      {
        stateLabel: 'State C — Frac 35 + T1 ES + +4 All Attributes',
        description: '+4 All Attributes locked, rolling for T1 Intelligence',
        eligibleSuffixCount: suffixes.filter((m) => m.modGroup !== 'AfflictionJewelSmallPassivesGrantAttributes').length,
        eligibleSuffixWeight: this.W_C,
        t1IntWeight: wInt,
        t1IntChance: this.pIntGivenAttr * 100,
        t1IntNormalChance: normalRate(wInt, this.W_C),
        t1IntAllflameChance: this.pIntGivenAttr * 100,
        blockedGroups: [`AfflictionJewelSmallPassivesGrantAttributes (${(this.W_A - this.W_C).toLocaleString()} weight blocked)`],
      },
      {
        stateLabel: 'State D — Frac 35 + T1 ES + 3% Attack Speed',
        description: '3% Attack Speed locked, rolling for T1 Intelligence',
        eligibleSuffixCount: suffixes.filter((m) => m.modGroup !== (tAS?.modGroup ?? 'Added Small Passive Skills also grant: #% increased Attack Speed')).length,
        eligibleSuffixWeight: this.W_D,
        t1IntWeight: wInt,
        t1IntChance: this.pIntGivenAS * 100,
        t1IntNormalChance: normalRate(wInt, this.W_D),
        t1IntAllflameChance: this.pIntGivenAS * 100,
        blockedGroups: [`Attack Speed Group (${(this.W_A - this.W_D).toLocaleString()} weight blocked)`],
      },
      {
        stateLabel: 'State E — Frac 35 + T1 ES + +4% All Resistance',
        description: '+4% All Resistance locked, rolling for T1 Intelligence',
        eligibleSuffixCount: suffixes.filter((m) => m.modGroup !== 'AfflictionJewelSmallPassivesGrantElementalRes').length,
        eligibleSuffixWeight: this.W_E,
        t1IntWeight: wInt,
        t1IntChance: this.pIntGivenRes * 100,
        t1IntNormalChance: normalRate(wInt, this.W_E),
        t1IntAllflameChance: this.pIntGivenRes * 100,
        blockedGroups: [`AfflictionJewelSmallPassivesGrantElementalRes (${(this.W_A - this.W_E).toLocaleString()} weight blocked)`],
      },
    ];
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
      return hasFrac35 ? this.vEnter : (this.vStep2 + this.vStep4);
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
          expectedAfterAnnul += (1 / nRem) * (hasFrac35 ? this.vEnter : (this.vStep2 + this.vStep4));
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
      if (hasT1Int && !hasTargetSuffix) return this.vInt;
      if (!hasT1Int && hasTargetSuffix) {
        const hasAttr = state.suffixes.some((s) => s.modGroup === 'AfflictionJewelSmallPassivesGrantAttributes' && s.tier === 1);
        const hasAS = state.suffixes.some((s) => s.name.includes('3% increased Attack Speed') && s.tier === 1);
        const hasRes = state.suffixes.some((s) => s.modGroup === 'AfflictionJewelSmallPassivesGrantElementalRes' && s.tier === 1);
        if (hasAttr) return this.vAttr;
        if (hasAS) return this.vAS;
        if (hasRes) return this.vRes;
        return this.v4Int;
      }
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
        expectedContinuationCostChaos: hasFrac35 ? this.vEnter : (this.vStep2 + this.vStep4),
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
      if (hasFrac35) {
        if (hasT1Int || hasTargetSuffix) {
          stepAttr = 4;
        } else {
          stepAttr = 3;
        }
      } else {
        if (has35Eff && !hasTargetSuffix) stepAttr = 5;
        else if (!has35Eff && state.prefixes.length > 1) stepAttr = 4;
      }

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
        stepAttribution: hasFrac35 ? 4 : 5,
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
    let bestSaleValue = -Infinity;

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
      const branch = getMatchingOutcomeBranch(clonedState, this.target);
      const saleValue = branch?.saleValueChaos ?? 0;
      evaluations.push({ mod, resultingStateValue: cost });

      if (cost < bestValue || (cost === bestValue && saleValue > bestSaleValue)) {
        bestValue = cost;
        bestSaleValue = saleValue;
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

  public getRepresentativeStateAudits(isFractured35Route = true): RepresentativeStateAudit[] {
    if (isFractured35Route) {
      const harvestRestartEV = this.cH + this.vEnter;

      return [
        {
          stateDescription: 'Frac 35 + T1 ES (Clean S0)',
          candidateActions: [
            { actionName: 'Allflame Exalt Suffix (T1 Int / Premium)', continuationValueChaos: this.vCleanFrac35 },
            { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
          ],
          recommendedAction: 'Allflame Exalt Suffix',
          recommendationReason: `Direct Allflame Exalt has continuation EV of ${this.vCleanFrac35.toFixed(1)}c vs ${harvestRestartEV.toFixed(1)}c to reforge away T1 ES.`,
        },
        {
          stateDescription: 'Frac 35 + T1 ES + T1 Intelligence',
          candidateActions: [
            { actionName: 'Allflame Exalt Premium Suffix', continuationValueChaos: this.vInt },
            { actionName: 'Orb of Annulment', continuationValueChaos: this.cA + (1 / 3) * this.vInt + (1 / 3) * this.vCleanFrac35 + (1 / 3) * this.vEnter },
            { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
          ],
          recommendedAction: 'PRESERVE; Allflame Exalt Premium Suffix',
          recommendationReason: `T1 Intelligence secured. Open suffix slam continuation EV is only ${this.vInt.toFixed(1)}c vs ${harvestRestartEV.toFixed(1)}c restart.`,
        },
        {
          stateDescription: 'Frac 35 + T1 ES + +4 All Attributes',
          candidateActions: [
            { actionName: 'Allflame Exalt Suffix (T1 Intelligence)', continuationValueChaos: this.vAttr },
            { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
          ],
          recommendedAction: 'PRESERVE; Allflame Exalt T1 Intelligence',
          recommendationReason: `+4 All Attributes secured. Suffix slam continuation EV is only ${this.vAttr.toFixed(1)}c vs ${harvestRestartEV.toFixed(1)}c restart.`,
        },
        {
          stateDescription: 'Frac 35 + T1 ES + 3% Attack Speed',
          candidateActions: [
            { actionName: 'Allflame Exalt Suffix (T1 Intelligence)', continuationValueChaos: this.vAS },
            { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
          ],
          recommendedAction: 'PRESERVE; Allflame Exalt T1 Intelligence',
          recommendationReason: `3% Attack Speed secured. Suffix slam continuation EV is only ${this.vAS.toFixed(1)}c vs ${harvestRestartEV.toFixed(1)}c restart.`,
        },
        {
          stateDescription: 'Frac 35 + T1 ES + +4% All Resistance',
          candidateActions: [
            { actionName: 'Allflame Exalt Suffix (T1 Intelligence)', continuationValueChaos: this.vRes },
            { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
          ],
          recommendedAction: 'PRESERVE; Allflame Exalt T1 Intelligence',
          recommendationReason: `+4% All Resistance secured. Suffix slam continuation EV is only ${this.vRes.toFixed(1)}c vs ${harvestRestartEV.toFixed(1)}c restart.`,
        },
        {
          stateDescription: 'Frac 35 + T1 ES + 1 Junk Suffix',
          candidateActions: [
            { actionName: 'Orb of Annulment', continuationValueChaos: this.cA + 0.5 * this.vCleanFrac35 + 0.5 * this.vEnter },
            { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
          ],
          recommendedAction: 'Orb of Annulment',
          recommendationReason: `Annul has 50% clean success rate with EV of ${(this.cA + 0.5 * this.vCleanFrac35 + 0.5 * this.vEnter).toFixed(1)}c, beating Harvest restart (${harvestRestartEV.toFixed(1)}c).`,
        },
        {
          stateDescription: 'Frac 35 + T1 ES + T1 Intelligence + 1 Junk Suffix',
          candidateActions: [
            { actionName: 'Orb of Annulment', continuationValueChaos: this.cA + (1 / 3) * this.vInt + (1 / 3) * this.vCleanFrac35 + (1 / 3) * this.vEnter },
            { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
          ],
          recommendedAction: 'Orb of Annulment',
          recommendationReason: `Annul has 1/3 chance to isolate T1 Int and 1/3 for clean S0, beating Harvest restart.`,
        },
        {
          stateDescription: 'Frac 35 + T1 ES + Premium Suffix + 1 Junk Suffix',
          candidateActions: [
            { actionName: 'Orb of Annulment', continuationValueChaos: this.cA + (1 / 3) * this.vAttr + (1 / 3) * this.vCleanFrac35 + (1 / 3) * this.vEnter },
            { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
          ],
          recommendedAction: 'Orb of Annulment',
          recommendationReason: `Annul has 1/3 chance to isolate Premium suffix and 1/3 for clean S0, beating Harvest restart.`,
        },
        {
          stateDescription: 'Frac 35 + T1 ES + T1 Intelligence + Premium Suffix',
          candidateActions: [
            { actionName: 'Goal Satisfied (Terminal)', continuationValueChaos: 0 },
            { actionName: 'Harvest Reforge Defence again', continuationValueChaos: harvestRestartEV },
          ],
          recommendedAction: 'FINISHED',
          recommendationReason: 'Target definition fully satisfied; item complete.',
        },
      ];
    }

    // Fractured Int route representative decisions
    const harvestRestartEV = this.cH + this.vStep2 + this.vStep4;

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
    baseCostChaos = 1533.4,
    saleValueChaos = 8946.0,
    divineFinishingCostChaos = 0,
    isFractured35Route = true
  ): HarvestStrategyComparison[] {
    if (isFractured35Route) {
      const expectedHarvestsA = this.expHarvestsFrac35;
      const expectedAnnulsA = this.expAnnulsFrac35;
      const expectedExaltsA = this.expExaltsFrac35;
      const costA_craft = this.vEnter + divineFinishingCostChaos;
      const costA_total = baseCostChaos + costA_craft;
      const profitA = saleValueChaos - costA_total;
      const roiA = costA_total > 0 ? (profitA / costA_total) * 100 : 0;

      // Strategy B: Stay in Harvest until complete target is hit directly from Harvest
      const expectedHarvestsB = this.expHarvestsDirectTarget;
      const expectedAnnulsB = this.expAnnulsDirectTarget;
      const expectedExaltsB = 0.0;
      const costB_craft =
        expectedHarvestsB * this.cH +
        expectedAnnulsB * this.cA +
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
          description: 'Stop Harvest upon hitting T1 ES, clean junk suffixes with Annuls, and slam target suffixes with Allflame Exalts.',
          isRecommended: true,
        },
        {
          name: 'Strategy B: Continue Harvest until T1 ES + Target Suffixes',
          code: 'B',
          expectedHarvests: expectedHarvestsB,
          expectedAnnuls: expectedAnnulsB,
          expectedExalts: expectedExaltsB,
          expectedCraftingCostChaos: costB_craft,
          expectedTotalCraftCostChaos: costB_total,
          expectedSaleValueChaos: saleValueChaos,
          expectedProfitChaos: profitB,
          roi: roiB,
          description: this.targetRequiresInt
            ? `Remain in Harvest until BOTH T1 ES, T1 Intelligence, and Premium Suffix appear simultaneously (1 in ~${Math.round(expectedHarvestsB).toLocaleString()} crafts directly from Harvest).`
            : `Remain in Harvest until BOTH T1 ES and a Premium Suffix appear simultaneously (1 in ~${Math.round(expectedHarvestsB).toLocaleString()} crafts directly from Harvest).`,
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
          description: 'Dynamic Bellman policy choosing min-cost action at every state; preserves any target suffix hit in Harvest, cleans junk, and slams remainder.',
          isRecommended: true,
        },
      ];
    }

    // Fractured Int route comparison
    const expectedHarvestsA = 398.0;
    const expectedAnnulsA = 73.5;
    const expectedExaltsA = 30.5;
    const costA_craft = this.vStep2 + this.vStep4 + divineFinishingCostChaos;
    const costA_total = baseCostChaos + costA_craft;
    const profitA = saleValueChaos - costA_total;
    const roiA = costA_total > 0 ? (profitA / costA_total) * 100 : 0;

    const expectedHarvestsB = 1126.0;
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
