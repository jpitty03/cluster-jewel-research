import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { PriceBook } from '../domain/PriceBook.ts';
import type { RolledMod } from '../domain/Mod.ts';
import type { ModPool } from '../domain/ModPool.ts';
import { satisfiesTarget, getMatchingOutcomeBranch, matchesModRequirement } from '../domain/TargetDefinition.ts';
import { getRemovableAffixes } from '../domain/ItemState.ts';
import { canAcceptPrefix, canAcceptSuffix } from '../rules/affixRules.ts';
import { calculateTotalWeight } from '../rules/modEligibility.ts';
import { getTaggedModsForCluster } from '../rules/clusterPoolHelpers.ts';

export type ActionType =
  | 'HARVEST_DEFENCE'
  | 'HARVEST_REFORGE'
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

export interface CandidateActionEvaluation {
  actionType: ActionType;
  actionName: string;
  immediateCostChaos: number;
  expectedContinuationCostChaos: number;
  expectedTotalCostChaos: number;
  stepAttribution: 1 | 2 | 3 | 4 | 5;
  reason: string;
}

export interface RepresentativeStateAudit {
  stateDescription: string;
  candidateActions: Array<{
    actionName: string;
    continuationValueChaos: number;
    immediateCostChaos?: number;
    totalExpectedCostChaos?: number;
  }>;
  recommendedAction: string;
  recommendationReason: string;
  isMinEvVerified: boolean;
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
  targetChances: Array<{
    name: string;
    weight: number;
    normalChance: number;
  }>;
  allTargetWeight: number;
  allTargetNormalChance: number;
  blockedGroups: string[];
}

export interface SuffixTargetGroup {
  id: string;
  name: string;
  modGroup: string;
  modId?: string;
  nameFilter?: string;
  tier: number;
  weight: number;
  groupTotalWeight: number;
  saleValueChaos?: number;
  isBaseRequired: boolean;
  branchName?: string;
}

export function solveLinearSystem(M: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const A = M.map((row, i) => [...row, rhs[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    if (Math.abs(A[i][i]) < 1e-12) {
      continue;
    }
    for (let k = i + 1; k < n; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j <= n; j++) A[k][j] -= f * A[i][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    if (Math.abs(A[i][i]) > 1e-12) {
      x[i] = s / A[i][i];
    } else {
      x[i] = 0;
    }
  }
  return x;
}

export class CraftingPolicyEngine {
  public readonly target: TargetDefinition;
  public readonly priceBook: PriceBook;
  public readonly pool?: ModPool;
  public readonly enableAllflame: boolean;
  public readonly isExactTarget: boolean;

  // Generalized Harvest properties
  public readonly harvestTag: string;
  public readonly harvestLifeforce: string;
  public readonly harvestModGroup: string;
  public readonly harvestModName: string;
  public readonly harvestLifeforcePerCraft: number;
  public readonly pT1Harvest: number;

  // Currency costs in Chaos
  public readonly cH: number; // Harvest reforge cost
  public readonly cA: number; // Annul cost (9.0c)
  public readonly cE: number; // Exalt cost (1.2c)

  // Target Suffix Groups
  public readonly targetSuffixGroups: SuffixTargetGroup[] = [];
  public readonly suffixGroupMap = new Map<string, SuffixTargetGroup>();
  public readonly compatiblePairs = new Map<string, Set<string>>(); // group id -> set of compatible group ids
  public readonly totalSuffixPoolWeight: number;

  // Exact Markov Continuation Values
  public readonly vS0: number; // Clean prefixes, 0 suffixes
  public readonly vGroupMap = new Map<string, number>(); // groupId -> V(S_group)
  public readonly vEnter: number; // Harvest entry state (from clean Fractured 35% base)

  // Exact Markov Action Counts
  public readonly expHarvestsFrac35: number;
  public readonly expAnnulsFrac35: number;
  public readonly expExaltsFrac35: number;
  public readonly step2Cost: number;
  public readonly step3Cost: number;
  public readonly step4Cost: number;
  public readonly step3AnnulsFrac35: number;
  public readonly step4AnnulsFrac35: number;

  // Absorption branch probabilities (branch name -> probability)
  public readonly branchProbabilitiesMap = new Map<string, number>();

  // Prefix slam probability (e.g. 35% effect on open prefix)
  public readonly p35Effect: number;

  constructor(target: TargetDefinition, priceBook: PriceBook, pool?: ModPool, enableAllflame = false) {
    this.target = target;
    this.priceBook = priceBook;
    this.pool = pool;
    this.enableAllflame = enableAllflame;
    this.isExactTarget = !target.outcomeBranches || target.outcomeBranches.length === 0;

    const ilvl = 84;
    this.cA = priceBook.toChaos(1, 'annul');
    this.cE = priceBook.toChaos(1, 'exalt');

    // ------------------------------------------------------------- 1. Dynamic Harvest Tag & Prefix Discovery
    let harvestTag = 'defences';
    let harvestLifeforce = 'primalLifeforce';
    let harvestModGroup = 'AfflictionJewelSmallPassivesGrantES';
    let harvestModName = 'T1 Maximum Energy Shield';
    let pT1 = 300 / 4200;

    if (pool) {
      const allPoolMods = pool.getAllMods();
      for (const req of target.requiredMods) {
        const found = allPoolMods.find((m) => matchesModRequirement(m, req));
        if (found && found.genType === 'Prefix') {
          if (found.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect') {
            continue; // 35% effect is handled separately
          }
          const hasTag = (tag: string) =>
            found.craftTags.some((t) => t.toLowerCase() === tag) || found.tags.some((t) => t.toLowerCase() === tag);

          if (hasTag('life')) {
            harvestTag = 'life';
            harvestLifeforce = 'wildLifeforce';
            harvestModGroup = found.modGroup;
            harvestModName = found.modGroup === 'AfflictionJewelSmallPassivesGrantLife' ? 'T1 Maximum Life [Sanguine]' : found.name;
            const tagged = getTaggedModsForCluster(pool, 'life', ilvl);
            const totalW = calculateTotalWeight(tagged) || 4088;
            pT1 = found.weight / totalW;
            break;
          } else if (hasTag('defences') || hasTag('defence')) {
            harvestTag = 'defences';
            harvestLifeforce = 'primalLifeforce';
            harvestModGroup = found.modGroup;
            harvestModName = found.modGroup === 'AfflictionJewelSmallPassivesGrantES' ? 'T1 Maximum Energy Shield [Glowing]' : found.name;
            const tagged = getTaggedModsForCluster(pool, 'defences', ilvl);
            const totalW = calculateTotalWeight(tagged) || 3976;
            pT1 = found.weight / totalW;
            break;
          } else if (hasTag('chaos')) {
            harvestTag = 'chaos';
            harvestLifeforce = 'vividLifeforce';
            harvestModGroup = found.modGroup;
            harvestModName = found.name;
            const tagged = getTaggedModsForCluster(pool, 'chaos', ilvl);
            const totalW = calculateTotalWeight(tagged) || 2000;
            pT1 = found.weight / totalW;
            break;
          }
        }
      }
    }

    this.harvestTag = harvestTag;
    this.harvestLifeforce = harvestLifeforce;
    this.harvestModGroup = harvestModGroup;
    this.harvestModName = harvestModName;
    this.harvestLifeforcePerCraft = 75;
    this.pT1Harvest = pT1;
    this.cH = priceBook.toChaos(75, harvestLifeforce as any);

    // ------------------------------------------------------------- 2. Prefix 35% Effect Slam Probability
    let p35 = 300 / 9176;
    if (pool) {
      const allPrefixes = pool.getAllMods().filter((m) => m.genType === 'Prefix' && m.ilvl <= ilvl);
      const eff35Mod = allPrefixes.find((m) => m.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && m.tier === 1);
      const nonHarvestPrefixes = allPrefixes.filter((m) => m.modGroup !== harvestModGroup);
      const totPrefWeight = calculateTotalWeight(nonHarvestPrefixes) || 9176;
      p35 = (eff35Mod?.weight ?? 300) / totPrefWeight;
    }
    this.p35Effect = p35;

    // ------------------------------------------------------------- 3. Extract Target Suffix Groups
    const allSuffixes = pool ? pool.getAllMods().filter((m) => m.genType === 'Suffix' && m.ilvl <= ilvl) : [];
    this.totalSuffixPoolWeight = calculateTotalWeight(allSuffixes) || 15401;

    // 3a. Base required suffixes
    for (const req of target.requiredMods) {
      const found = allSuffixes.find((m) => matchesModRequirement(m, req));
      if (found && found.genType === 'Suffix') {
        const groupMods = allSuffixes.filter((m) => m.modGroup === found.modGroup);
        const groupTotalWeight = calculateTotalWeight(groupMods) || 1200;
        let suffixDisplayName = found.name;
        if (found.modGroup === 'AfflictionJewelSmallPassivesGrantInt') suffixDisplayName = 'T1 Intelligence [of the Prodigy]';
        else if (found.modGroup === 'AfflictionJewelSmallPassivesGrantAttributes') suffixDisplayName = '+4 to all Attributes [of the Meteor]';
        else if (found.modGroup === 'AfflictionJewelSmallPassivesGrantChaosRes') suffixDisplayName = '+5% to Chaos Resistance [of Eviction]';
        else if (found.modGroup === 'AfflictionJewelSmallPassivesGrantElementalRes') suffixDisplayName = '+4% to all Elemental Resistance [of the Kaleidoscope]';

        const targetGroup: SuffixTargetGroup = {
          id: req.modGroup ?? found.modGroup,
          name: suffixDisplayName,
          modGroup: found.modGroup,
          modId: req.modId ?? found.modId,
          tier: req.maxTierNumber ?? found.tier,
          weight: found.weight,
          groupTotalWeight,
          isBaseRequired: true,
        };
        this.targetSuffixGroups.push(targetGroup);
        this.suffixGroupMap.set(targetGroup.id, targetGroup);
      }
    }

    // 3b. Outcome branch suffixes
    if (target.outcomeBranches && target.outcomeBranches.length > 0) {
      for (const branch of target.outcomeBranches) {
        for (const req of branch.requiredMods) {
          const found = allSuffixes.find((m) => matchesModRequirement(m, req));
          if (found && found.genType === 'Suffix') {
            const groupMods = allSuffixes.filter((m) => m.modGroup === found.modGroup);
            const groupTotalWeight = calculateTotalWeight(groupMods) || 1200;
            const existing = this.targetSuffixGroups.find((g) => g.modGroup === found.modGroup);
            if (!existing) {
              const targetGroup: SuffixTargetGroup = {
                id: req.modGroup ?? found.modGroup,
                name: branch.name,
                modGroup: found.modGroup,
                modId: req.modId ?? found.modId,
                tier: req.maxTierNumber ?? found.tier,
                weight: found.weight,
                groupTotalWeight,
                saleValueChaos: branch.saleValueChaos,
                isBaseRequired: false,
                branchName: branch.name,
              };
              this.targetSuffixGroups.push(targetGroup);
              this.suffixGroupMap.set(targetGroup.id, targetGroup);
            }
          }
        }
      }
    }

    // 3c. Acceptable alternative suffixes. These are roll candidates, not
    // additional mandatory targets: compatiblePairs below asks the authoritative
    // target predicate whether a concrete pair is terminal.
    for (const branch of target.acceptableAnyOf ?? []) {
      for (const req of branch) {
        const found = allSuffixes.find((mod) => matchesModRequirement(mod, req));
        if (!found || found.genType !== 'Suffix') continue;
        if (this.targetSuffixGroups.some((group) => group.modGroup === found.modGroup)) continue;
        const groupMods = allSuffixes.filter((mod) => mod.modGroup === found.modGroup);
        const targetGroup: SuffixTargetGroup = {
          id: req.modGroup ?? found.modGroup,
          name: found.name,
          modGroup: found.modGroup,
          modId: req.modId ?? found.modId,
          tier: req.maxTierNumber ?? found.tier,
          weight: found.weight,
          groupTotalWeight: calculateTotalWeight(groupMods) || 1200,
          isBaseRequired: false,
          branchName: 'Acceptable alternative',
        };
        this.targetSuffixGroups.push(targetGroup);
        this.suffixGroupMap.set(targetGroup.id, targetGroup);
      }
    }

    // 3d. Compute compatible pairs for each target suffix group
    for (const g1 of this.targetSuffixGroups) {
      const compSet = new Set<string>();
      for (const g2 of this.targetSuffixGroups) {
        if (g1.id === g2.id || g1.modGroup === g2.modGroup) continue;
        // Check if item with g1 and g2 satisfies target
        const dummyState: ItemState = {
          baseType: 'Large Cluster Jewel',
          clusterType: 'any',
          itemLevel: 84,
          rarity: 'rare',
          prefixes: [
            {
              modId: 'p1',
              name: '35% increased Effect',
              modGroup: 'AfflictionJewelSmallPassivesHaveIncreasedEffect',
              modGroups: ['AfflictionJewelSmallPassivesHaveIncreasedEffect'],
              tier: 1,
              genType: 'Prefix',
              statText: '',
              statValues: [],
              tags: [],
              craftTags: [],
              isFractured: true,
              isNotable: false,
            },
            {
              modId: 'p2',
              name: this.harvestModName,
              modGroup: this.harvestModGroup,
              modGroups: [this.harvestModGroup],
              tier: 1,
              genType: 'Prefix',
              statText: '',
              statValues: [],
              tags: [],
              craftTags: [],
              isFractured: false,
              isNotable: false,
            },
          ],
          suffixes: [
            {
              modId: g1.modId ?? 's1',
              name: g1.name,
              modGroup: g1.modGroup,
              modGroups: [g1.modGroup],
              tier: g1.tier,
              genType: 'Suffix',
              statText: '',
              statValues: [],
              tags: [],
              craftTags: [],
              isFractured: false,
              isNotable: false,
            },
            {
              modId: g2.modId ?? 's2',
              name: g2.name,
              modGroup: g2.modGroup,
              modGroups: [g2.modGroup],
              tier: g2.tier,
              genType: 'Suffix',
              statText: '',
              statValues: [],
              tags: [],
              craftTags: [],
              isFractured: false,
              isNotable: false,
            },
          ],
          fracturedModIds: ['p1'],
        };
        if (satisfiesTarget(dummyState, target)) {
          compSet.add(g2.id);
        }
      }
      this.compatiblePairs.set(g1.id, compSet);
    }

    // ------------------------------------------------------------- 4. Solve the Exact Markov Linear System
    const K = this.targetSuffixGroups.length;
    const N = K + 2;
    // Index 0: S0 (Clean prefixes, 0 suffixes)
    // Index 1..K: S_G1 .. S_GK (Clean prefixes, 1 target suffix)
    // Index K+1: VH (Harvest entry state)

    const W0 = this.totalSuffixPoolWeight;
    const pTargets0 = this.targetSuffixGroups.map((g) => g.weight / W0);
    const pHit0 = pTargets0.reduce((sum, p) => sum + p, 0);
    const pJunk0 = Math.max(0, 1 - pHit0);

    const pWin = this.targetSuffixGroups.map((g1) => {
      const W1 = Math.max(1, W0 - g1.groupTotalWeight);
      const compIds = this.compatiblePairs.get(g1.id) ?? new Set();
      let winProb = 0;
      for (const g2 of this.targetSuffixGroups) {
        if (compIds.has(g2.id)) {
          winProb += g2.weight / W1;
        }
      }
      return winProb;
    });

    // Build Transition Matrix M
    const M: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

    // Row 0: Equation for S0
    // (1 - 0.5 * pJunk0) * V(S0) - sum_i p_i * V(S_Gi) - 0.5 * pJunk0 * VH = cE + pJunk0 * cA
    M[0][0] = 1 - 0.5 * pJunk0;
    for (let i = 0; i < K; i++) {
      M[0][i + 1] = -pTargets0[i];
    }
    M[0][K + 1] = -0.5 * pJunk0;

    // Rows 1..K: Equations for S_G1 .. S_GK
    // (2 + pWin[i]) * V(S_Gi) - 0.5 * (1 - pWin[i]) * V(S0) - 1.5 * (1 - pWin[i]) * VH = 3 cE + 4 (1 - pWin[i]) cA
    for (let i = 0; i < K; i++) {
      const pw = pWin[i];
      M[i + 1][i + 1] = 2 + pw;
      M[i + 1][0] = -0.5 * (1 - pw);
      M[i + 1][K + 1] = -1.5 * (1 - pw);
    }

    // Row K+1: Equation for VH
    // Harvest extra affixes transitions:
    const qi_harvest = new Array(K).fill(0);
    for (let i = 0; i < K; i++) {
      qi_harvest[i] += 0.5 * pTargets0[i];
    }

    // Calculate 2-extra suffix probabilities:
    let pPairWinSum = 0;
    const p1TargetJunk = new Array(K).fill(0);
    for (let i = 0; i < K; i++) {
      const g1 = this.targetSuffixGroups[i];
      const W1 = Math.max(1, W0 - g1.groupTotalWeight);
      const compIds = this.compatiblePairs.get(g1.id) ?? new Set();

      let pWinFromG1 = 0;
      for (let j = 0; j < K; j++) {
        const g2 = this.targetSuffixGroups[j];
        if (compIds.has(g2.id)) {
          pWinFromG1 += g2.weight / W1;
        }
      }
      const pPairWin = (g1.weight / W0) * pWinFromG1;
      pPairWinSum += pPairWin;

      const pG1ThenJunk = (g1.weight / W0) * (1 - pWinFromG1);
      const pJunkThenG1 = pJunk0 * (g1.weight / (W0 - 1000));
      p1TargetJunk[i] = pG1ThenJunk + pJunkThenG1;
    }
    const p1TargetJunkSum = p1TargetJunk.reduce((s, p) => s + p, 0);
    const p2Junk = Math.max(0, 1 - pPairWinSum - p1TargetJunkSum);

    for (let i = 0; i < K; i++) {
      qi_harvest[i] += 0.5 * (1 / 3) * p1TargetJunk[i];
    }

    // Determine whether annulling 2 junk suffixes is EV-positive: 5 * cA < VH - V(S0)
    let q0_harvest = 0.5 * 0.5 * pJunk0 + 0.5 * (1 / 6) * p1TargetJunkSum;
    let qH_harvest = 0.5 * 0.5 * pJunk0 + 0.5 * (0.5 * p1TargetJunkSum + 1.0 * p2Junk);
    let kA_harvest = 0.5 * pJunk0 + 0.5 * (4 / 3) * p1TargetJunkSum;

    M[K + 1][K + 1] = 1 - qH_harvest;
    M[K + 1][0] = -q0_harvest;
    for (let i = 0; i < K; i++) {
      M[K + 1][i + 1] = -qi_harvest[i];
    }

    // ------------------------------------------------------------- 4a. Solve Costs (V)
    let bV = new Array(N).fill(0);
    bV[0] = this.cE + pJunk0 * this.cA;
    for (let i = 0; i < K; i++) {
      bV[i + 1] = 3 * this.cE + 4 * (1 - pWin[i]) * this.cA;
    }
    bV[K + 1] = this.cH / this.pT1Harvest + kA_harvest * this.cA;

    let V_sol = solveLinearSystem(M, bV);

    // If annulling 2 junk suffixes is strictly cheaper: (VH - V(S0)) > 5 * cA
    if (V_sol[K + 1] - V_sol[0] > 5 * this.cA) {
      q0_harvest = 0.5 * 0.5 * pJunk0 + 0.5 * ((1 / 6) * p1TargetJunkSum + (1 / 3) * p2Junk);
      qH_harvest = 0.5 * 0.5 * pJunk0 + 0.5 * ((1 / 2) * p1TargetJunkSum + (2 / 3) * p2Junk);
      kA_harvest = 0.5 * pJunk0 + 0.5 * ((4 / 3) * p1TargetJunkSum + (5 / 3) * p2Junk);

      M[K + 1][K + 1] = 1 - qH_harvest;
      M[K + 1][0] = -q0_harvest;
      bV[K + 1] = this.cH / this.pT1Harvest + kA_harvest * this.cA;
      V_sol = solveLinearSystem(M, bV);
    }

    this.vS0 = V_sol[0];
    for (let i = 0; i < K; i++) {
      this.vGroupMap.set(this.targetSuffixGroups[i].id, V_sol[i + 1]);
    }
    this.vEnter = V_sol[K + 1];

    // ------------------------------------------------------------- 4b. Solve Expected Harvests (H)
    const bH = new Array(N).fill(0);
    bH[K + 1] = 1 / this.pT1Harvest;
    const H_sol = solveLinearSystem(M, bH);
    this.expHarvestsFrac35 = H_sol[K + 1];

    // ------------------------------------------------------------- 4c. Solve Expected Exalts (E)
    const bE = new Array(N).fill(0);
    bE[0] = 1;
    for (let i = 0; i < K; i++) {
      bE[i + 1] = 3;
    }
    bE[K + 1] = 0;
    const E_sol = solveLinearSystem(M, bE);
    this.expExaltsFrac35 = E_sol[K + 1];

    // ------------------------------------------------------------- 4d. Solve Expected Annuls (A)
    const bA = new Array(N).fill(0);
    bA[0] = pJunk0;
    for (let i = 0; i < K; i++) {
      bA[i + 1] = 4 * (1 - pWin[i]);
    }
    bA[K + 1] = kA_harvest;
    const A_sol = solveLinearSystem(M, bA);
    this.expAnnulsFrac35 = A_sol[K + 1];

    this.step2Cost = this.expHarvestsFrac35 * this.cH;
    const bA4 = new Array(N).fill(0);
    bA4[0] = pJunk0;
    for (let i = 0; i < K; i++) {
      bA4[i + 1] = 4 * (1 - pWin[i]);
    }
    bA4[K + 1] = 0;
    const A4_sol = solveLinearSystem(M, bA4);
    this.step4AnnulsFrac35 = A4_sol[K + 1];
    this.step3AnnulsFrac35 = Math.max(0, this.expAnnulsFrac35 - this.step4AnnulsFrac35);
    this.step3Cost = this.step3AnnulsFrac35 * this.cA;
    this.step4Cost = this.expExaltsFrac35 * this.cE + this.step4AnnulsFrac35 * this.cA;

    // ------------------------------------------------------------- 4e. Solve Terminal Branch Probabilities
    if (target.outcomeBranches && target.outcomeBranches.length > 0) {
      for (const branch of target.outcomeBranches) {
        const bPi = new Array(N).fill(0);
        let branchPairWinHarvest = 0;

        for (let i = 0; i < K; i++) {
          const g1 = this.targetSuffixGroups[i];
          const W1 = Math.max(1, W0 - g1.groupTotalWeight);
          const compIds = this.compatiblePairs.get(g1.id) ?? new Set();

          let branchWinFromG1 = 0;
          for (let j = 0; j < K; j++) {
            const g2 = this.targetSuffixGroups[j];
            if (compIds.has(g2.id)) {
              const isMatch = g1.branchName === branch.name || g2.branchName === branch.name;
              if (isMatch) {
                branchWinFromG1 += g2.weight / W1;
              }
            }
          }
          bPi[i + 1] = 3 * branchWinFromG1;
          branchPairWinHarvest += (g1.weight / W0) * branchWinFromG1;
        }
        bPi[K + 1] = 0.5 * branchPairWinHarvest;

        const pi_sol = solveLinearSystem(M, bPi);
        this.branchProbabilitiesMap.set(branch.name, pi_sol[K + 1]);
      }
    }
  }

  // ------------------------------------------------------------- Mechanical Evaluation Core
  public getJunkMods(state: ItemState): RolledMod[] {
    const junk: RolledMod[] = [];

    // If item already satisfies target, 0 junk
    if (satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
      return [];
    }

    // Check non-fractured prefixes
    for (const p of state.prefixes) {
      if (p.isFractured) continue;
      const isHarvestT1 = p.modGroup === this.harvestModGroup && p.tier === 1;
      if (!isHarvestT1) {
        junk.push(p);
      }
    }

    // Check suffixes
    if (state.suffixes.length === 1) {
      const s = state.suffixes[0];
      const isTarget = this.targetSuffixGroups.some((g) => g.modGroup === s.modGroup && s.tier <= g.tier);
      if (!isTarget) {
        junk.push(s);
      }
    } else if (state.suffixes.length === 2) {
      const [s1, s2] = state.suffixes;
      const g1 = this.targetSuffixGroups.find((g) => g.modGroup === s1.modGroup && s1.tier <= g.tier);
      const g2 = this.targetSuffixGroups.find((g) => g.modGroup === s2.modGroup && s2.tier <= g.tier);

      if (!g1 && !g2) {
        junk.push(s1, s2);
      } else if (g1 && !g2) {
        junk.push(s2);
      } else if (!g1 && g2) {
        junk.push(s1);
      } else if (g1 && g2) {
        // Both match target groups, but pair is mutually incompatible because satisfiesTarget was false
        junk.push(s1, s2);
      }
    }

    return junk;
  }

  public evaluateCandidateAction(state: ItemState, actionType: ActionType): CandidateActionEvaluation {
    const junkMods = this.getJunkMods(state);
    const removable = getRemovableAffixes(state);
    const hasHarvestMod = state.prefixes.some((p) => p.modGroup === this.harvestModGroup && p.tier === 1);

    // 1. TERMINAL
    if (actionType === 'TERMINAL') {
      return {
        actionType: 'TERMINAL',
        actionName: 'Goal Satisfied',
        immediateCostChaos: 0,
        expectedContinuationCostChaos: 0,
        expectedTotalCostChaos: 0,
        stepAttribution: 5,
        reason: 'Item satisfies all target requirements and outcome branch.',
      };
    }

    // 2. HARVEST_REFORGE / HARVEST_DEFENCE
    if (actionType === 'HARVEST_REFORGE' || actionType === 'HARVEST_DEFENCE') {
      const actionName = `Harvest Reforge ${this.harvestTag.charAt(0).toUpperCase() + this.harvestTag.slice(1)}`;
      return {
        actionType: 'HARVEST_REFORGE',
        actionName,
        immediateCostChaos: this.cH,
        expectedContinuationCostChaos: this.vEnter,
        expectedTotalCostChaos: this.cH + this.vEnter,
        stepAttribution: 2,
        reason: `${actionName} guarantees ${this.harvestTag} modifier at ${(this.pT1Harvest * 100).toFixed(2)}% rate.`,
      };
    }

    // 3. ANNUL
    if (actionType === 'ANNUL') {
      if (removable.length === 0) {
        return {
          actionType: 'ANNUL',
          actionName: 'Orb of Annulment',
          immediateCostChaos: this.cA,
          expectedContinuationCostChaos: this.vEnter,
          expectedTotalCostChaos: this.cA + this.vEnter,
          stepAttribution: 3,
          reason: 'No removable mods. Restart via Harvest.',
        };
      }

      let sumContinuation = 0;
      for (const m of removable) {
        const nextState: ItemState = {
          ...state,
          prefixes: state.prefixes.filter((p) => p !== m),
          suffixes: state.suffixes.filter((s) => s !== m),
        };
        sumContinuation += this.evaluateStateValue(nextState);
      }
      const expContinuation = sumContinuation / removable.length;
      const stepAttr = hasHarvestMod ? (state.suffixes.length > 0 ? 4 : 3) : 2;

      return {
        actionType: 'ANNUL',
        actionName: 'Orb of Annulment',
        immediateCostChaos: this.cA,
        expectedContinuationCostChaos: expContinuation,
        expectedTotalCostChaos: this.cA + expContinuation,
        stepAttribution: stepAttr,
        reason: `Item has ${junkMods.length} junk mod(s). Annul non-target mods.`,
      };
    }

    // 4. EXALT_PREFIX
    if (actionType === 'EXALT_PREFIX' || actionType === 'ALLFLAME_EXALT_PREFIX') {
      const pHit = this.p35Effect;
      const expContinuation = pHit * this.vS0 + (1 - pHit) * (this.cA + 0.5 * this.vS0 + 0.5 * this.vEnter);
      return {
        actionType: 'EXALT_PREFIX',
        actionName: 'Exalted Orb Slam (Prefix: 35% Effect)',
        immediateCostChaos: this.cE,
        expectedContinuationCostChaos: expContinuation,
        expectedTotalCostChaos: this.cE + expContinuation,
        stepAttribution: 2,
        reason: `Prefix open. Slam 35% Increased Effect (${(pHit * 100).toFixed(2)}% hit rate).`,
      };
    }

    // 5. EXALT_SUFFIX
    if (actionType === 'EXALT_SUFFIX' || actionType === 'ALLFLAME_EXALT_SUFFIX') {
      const targetSuffixNames = this.targetSuffixGroups.map((g) => g.name).join(' / ');
      const W0 = this.totalSuffixPoolWeight;

      const lockedGroups = this.targetSuffixGroups.filter((g) =>
        state.suffixes.some((s) => s.modGroup === g.modGroup && s.tier <= g.tier)
      );

      let expContinuation = this.vS0;
      if (lockedGroups.length === 0) {
        let sumCont = 0;
        for (const g of this.targetSuffixGroups) {
          const vG = this.vGroupMap.get(g.id) ?? this.vS0;
          sumCont += (g.weight / W0) * vG;
        }
        const pHit = this.targetSuffixGroups.reduce((s, g) => s + g.weight / W0, 0);
        const pJunk = Math.max(0, 1 - pHit);
        sumCont += pJunk * (this.cA + 0.5 * this.vS0 + 0.5 * this.vEnter);
        expContinuation = sumCont;
      } else {
        const g1 = lockedGroups[0];
        const vG1 = this.vGroupMap.get(g1.id) ?? this.vS0;
        const W1 = Math.max(1, W0 - g1.groupTotalWeight);
        const compIds = this.compatiblePairs.get(g1.id) ?? new Set();

        let winProb = 0;
        for (const g2 of this.targetSuffixGroups) {
          if (compIds.has(g2.id)) {
            winProb += g2.weight / W1;
          }
        }
        const junkProb = Math.max(0, 1 - winProb);
        expContinuation = junkProb * ((4 / 3) * this.cA + (1 / 3) * vG1 + (1 / 6) * this.vS0 + 0.5 * this.vEnter);
      }

      return {
        actionType: 'EXALT_SUFFIX',
        actionName: `Exalted Orb Slam (Suffix: ${targetSuffixNames})`,
        immediateCostChaos: this.cE,
        expectedContinuationCostChaos: expContinuation,
        expectedTotalCostChaos: this.cE + expContinuation,
        stepAttribution: 4,
        reason: `Suffix open. Slam target suffix (${targetSuffixNames}).`,
      };
    }

    return {
      actionType: 'HARVEST_REFORGE',
      actionName: `Harvest Reforge ${this.harvestTag}`,
      immediateCostChaos: this.cH,
      expectedContinuationCostChaos: this.vEnter,
      expectedTotalCostChaos: this.cH + this.vEnter,
      stepAttribution: 2,
      reason: 'Standard Harvest reforge entry.',
    };
  }

  public getLegalCandidateActions(state: ItemState): CandidateActionEvaluation[] {
    if (satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
      return [this.evaluateCandidateAction(state, 'TERMINAL')];
    }

    const candidates: CandidateActionEvaluation[] = [];
    const junkMods = this.getJunkMods(state);
    const hasHarvestMod = state.prefixes.some((p) => p.modGroup === this.harvestModGroup && p.tier === 1);
    const hasFrac35 = state.prefixes.some(
      (p) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.isFractured
    );

    // Harvest Reforge is always a legal candidate
    candidates.push(this.evaluateCandidateAction(state, 'HARVEST_REFORGE'));

    // Annul is legal if there are removable mods and item has Harvest mod
    if (junkMods.length > 0 && hasHarvestMod) {
      candidates.push(this.evaluateCandidateAction(state, 'ANNUL'));
    }

    // Exalt Prefix is legal if prefix slot open
    if (!hasFrac35 && canAcceptPrefix(state)) {
      candidates.push(this.evaluateCandidateAction(state, 'EXALT_PREFIX'));
    }

    // Exalt Suffix is legal if prefix satisfied, suffix slot open, and 0 junk
    if (hasHarvestMod && junkMods.length === 0 && canAcceptSuffix(state)) {
      candidates.push(this.evaluateCandidateAction(state, 'EXALT_SUFFIX'));
    }

    return candidates;
  }

  public getBestAction(state: ItemState): PolicyDecision {
    const candidates = this.getLegalCandidateActions(state);
    if (candidates.length === 0) {
      return {
        actionType: 'HARVEST_REFORGE',
        actionName: `Harvest Reforge ${this.harvestTag}`,
        expectedContinuationCostChaos: this.vEnter,
        reason: 'Default Harvest reforge.',
        stepAttribution: 2,
      };
    }

    // Mechanical min-EV selection
    let best = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].expectedTotalCostChaos < best.expectedTotalCostChaos) {
        best = candidates[i];
      }
    }

    return {
      actionType: best.actionType,
      actionName: best.actionName,
      expectedContinuationCostChaos: best.expectedContinuationCostChaos,
      reason: best.reason,
      stepAttribution: best.stepAttribution,
    };
  }

  public evaluateStateValue(state: ItemState): number {
    if (satisfiesTarget(state, this.target) || getMatchingOutcomeBranch(state, this.target)) {
      return 0;
    }
    const hasHarvestMod = state.prefixes.some((p) => p.modGroup === this.harvestModGroup && p.tier === 1);
    if (!hasHarvestMod) {
      return this.vEnter;
    }

    const junkMods = this.getJunkMods(state);
    const lockedGroups = this.targetSuffixGroups.filter((g) =>
      state.suffixes.some((s) => s.modGroup === g.modGroup && s.tier <= g.tier)
    );

    if (junkMods.length === 0) {
      if (lockedGroups.length === 0) {
        return this.vS0;
      }
      return this.vGroupMap.get(lockedGroups[0].id) ?? this.vS0;
    }

    if (junkMods.length === 1) {
      if (lockedGroups.length === 0) {
        return this.cA + 0.5 * this.vS0 + 0.5 * this.vEnter;
      }
      const vG1 = this.vGroupMap.get(lockedGroups[0].id) ?? this.vS0;
      return (4 / 3) * this.cA + (1 / 3) * vG1 + (1 / 6) * this.vS0 + 0.5 * this.vEnter;
    }

    // 2 junk mods
    return (5 / 3) * this.cA + (1 / 3) * this.vS0 + (2 / 3) * this.vEnter;
  }

  // ------------------------------------------------------------- Representative State Audits
  public getRepresentativeStateAudits(): RepresentativeStateAudit[] {
    const audits: RepresentativeStateAudit[] = [];

    const makeState = (_desc: string, suffixes: RolledMod[]): ItemState => ({
      baseType: 'Large Cluster Jewel',
      clusterType: 'any',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [
        {
          modId: 'p1',
          name: '35% increased Effect',
          modGroup: 'AfflictionJewelSmallPassivesHaveIncreasedEffect',
          modGroups: ['AfflictionJewelSmallPassivesHaveIncreasedEffect'],
          tier: 1,
          genType: 'Prefix',
          statText: '',
          statValues: [],
          tags: [],
          craftTags: [],
          isFractured: true,
          isNotable: false,
        },
        {
          modId: 'p2',
          name: this.harvestModName,
          modGroup: this.harvestModGroup,
          modGroups: [this.harvestModGroup],
          tier: 1,
          genType: 'Prefix',
          statText: '',
          statValues: [],
          tags: [],
          craftTags: [],
          isFractured: false,
          isNotable: false,
        },
      ],
      suffixes,
      fracturedModIds: ['p1'],
    });

    const junkMod: RolledMod = {
      modId: 'junk1',
      name: 'Junk Suffix',
      modGroup: 'JunkGroup',
      modGroups: ['JunkGroup'],
      tier: 2,
      genType: 'Suffix',
      statText: '',
      statValues: [],
      tags: [],
      craftTags: [],
      isFractured: false,
      isNotable: false,
    };

    // 1. Clean S0
    const s0State = makeState(`Frac 35 + ${this.harvestModName} (Clean S0)`, []);
    audits.push(this.auditState(`Frac 35 + ${this.harvestModName} (Clean S0)`, s0State));

    // 2..K+1. Clean S_Gi for each target suffix group
    for (const g of this.targetSuffixGroups) {
      const targetMod: RolledMod = {
        modId: g.modId ?? g.id,
        name: g.name,
        modGroup: g.modGroup,
        modGroups: [g.modGroup],
        tier: g.tier,
        genType: 'Suffix',
        statText: '',
        statValues: [],
        tags: [],
        craftTags: [],
        isFractured: false,
        isNotable: false,
      };
      const sGiState = makeState(`Frac 35 + ${this.harvestModName} + ${g.name}`, [targetMod]);
      audits.push(this.auditState(`Frac 35 + ${this.harvestModName} + ${g.name}`, sGiState));
    }

    // K+2. 1 Junk Suffix
    const junkState = makeState(`Frac 35 + ${this.harvestModName} + 1 Junk Suffix`, [junkMod]);
    audits.push(this.auditState(`Frac 35 + ${this.harvestModName} + 1 Junk Suffix`, junkState));

    return audits;
  }

  private auditState(desc: string, state: ItemState): RepresentativeStateAudit {
    const candidates = this.getLegalCandidateActions(state);
    const best = this.getBestAction(state);

    const minCandidateCost = Math.min(...candidates.map((c) => c.expectedTotalCostChaos));
    const bestCandidate = candidates.find((c) => c.actionType === best.actionType);
    const isMinEvVerified = Math.abs((bestCandidate?.expectedTotalCostChaos ?? 0) - minCandidateCost) < 1e-4;

    const harvestCandidate = candidates.find((c) => c.actionType === 'HARVEST_REFORGE' || c.actionType === 'HARVEST_DEFENCE');
    const harvestContEv = harvestCandidate ? harvestCandidate.expectedContinuationCostChaos : (this.vEnter - this.cH);

    return {
      stateDescription: desc,
      candidateActions: candidates.map((c) => ({
        actionName: c.actionName,
        continuationValueChaos: c.expectedContinuationCostChaos,
        immediateCostChaos: c.immediateCostChaos,
        totalExpectedCostChaos: c.expectedTotalCostChaos,
      })),
      recommendedAction: best.actionName,
      recommendationReason: `${best.actionName} has continuation EV of ${best.expectedContinuationCostChaos.toFixed(1)}c vs ${harvestContEv.toFixed(1)}c to reforge.`,
      isMinEvVerified,
    };
  }

  // ------------------------------------------------------------- Suffix Pool Diagnostic Audit
  public getSuffixPoolAudit(): SuffixPoolAuditState[] {
    const audits: SuffixPoolAuditState[] = [];
    const W0 = this.totalSuffixPoolWeight;

    // State A: Clean S0
    audits.push({
      stateLabel: `State A — Frac 35 + ${this.harvestModName}, no suffixes`,
      description: 'Initial clean prefix state before suffix slams',
      eligibleSuffixCount: 39,
      eligibleSuffixWeight: W0,
      targetChances: this.targetSuffixGroups.map((g) => ({
        name: g.name,
        weight: g.weight,
        normalChance: (g.weight / W0) * 100,
      })),
      allTargetWeight: this.targetSuffixGroups.reduce((s, g) => s + g.weight, 0),
      allTargetNormalChance: (this.targetSuffixGroups.reduce((s, g) => s + g.weight, 0) / W0) * 100,
      blockedGroups: ['None (Full suffix pool)'],
    });

    // State B..: Each target suffix group locked
    for (let i = 0; i < this.targetSuffixGroups.length; i++) {
      const g = this.targetSuffixGroups[i];
      const W1 = Math.max(1, W0 - g.groupTotalWeight);
      const label = String.fromCharCode(66 + i);
      const compIds = this.compatiblePairs.get(g.id) ?? new Set();

      audits.push({
        stateLabel: `State ${label} — Frac 35 + ${this.harvestModName} + ${g.name}`,
        description: `${g.name} locked, rolling for final compatible suffix`,
        eligibleSuffixCount: 36,
        eligibleSuffixWeight: W1,
        targetChances: this.targetSuffixGroups
          .filter((g2) => compIds.has(g2.id))
          .map((g2) => ({
            name: g2.name,
            weight: g2.weight,
            normalChance: (g2.weight / W1) * 100,
          })),
        allTargetWeight: this.targetSuffixGroups.filter((g2) => compIds.has(g2.id)).reduce((s, g2) => s + g2.weight, 0),
        allTargetNormalChance:
          (this.targetSuffixGroups.filter((g2) => compIds.has(g2.id)).reduce((s, g2) => s + g2.weight, 0) / W1) * 100,
        blockedGroups: [`${g.modGroup} (${g.groupTotalWeight} weight blocked)`],
      });
    }

    return audits;
  }

  // ------------------------------------------------------------- Harvest Stopping Policy Comparison
  public getHarvestStrategyComparison(saleValueChaos = 7380.1, baseCostChaos = 1533.4): HarvestStrategyComparison[] {
    // Strategy A: Stop at first T1 Harvest mod, sequential exalts
    const expCraftCostA = this.vEnter;
    const expTotalCostA = baseCostChaos + expCraftCostA;
    const profitA = saleValueChaos - expTotalCostA;
    const roiA = (profitA / expTotalCostA) * 100;

    // Strategy B: Pure Harvest Fishing (Harvest until T1 Harvest mod AND both target suffixes roll simultaneously)
    const W0 = this.totalSuffixPoolWeight;
    let pPairSuccess = 0;
    for (const g1 of this.targetSuffixGroups) {
      const W1 = Math.max(1, W0 - g1.groupTotalWeight);
      const compIds = this.compatiblePairs.get(g1.id) ?? new Set();
      for (const g2 of this.targetSuffixGroups) {
        if (compIds.has(g2.id)) {
          pPairSuccess += (g1.weight / W0) * (g2.weight / W1);
        }
      }
    }
    const pHarvestPureSuccess = this.pT1Harvest * 0.5 * pPairSuccess;
    const expHarvestsB = 1 / Math.max(1e-6, pHarvestPureSuccess);
    const expCraftCostB = expHarvestsB * this.cH;
    const expTotalCostB = baseCostChaos + expCraftCostB;
    const profitB = saleValueChaos - expTotalCostB;
    const roiB = (profitB / expTotalCostB) * 100;

    // Strategy C: State-Aware Optimal Policy (Identical to A with dynamic preserve)
    const expCraftCostC = this.vEnter;
    const expTotalCostC = baseCostChaos + expCraftCostC;
    const profitC = saleValueChaos - expTotalCostC;
    const roiC = (profitC / expTotalCostC) * 100;

    return [
      {
        name: `Strategy A: Stop Harvest at First ${this.harvestModName} (Sequential Exalts)`,
        code: 'A',
        expectedHarvests: this.expHarvestsFrac35,
        expectedAnnuls: this.expAnnulsFrac35,
        expectedExalts: this.expExaltsFrac35,
        expectedCraftingCostChaos: expCraftCostA,
        expectedTotalCraftCostChaos: expTotalCostA,
        expectedSaleValueChaos: saleValueChaos,
        expectedProfitChaos: profitA,
        roi: roiA,
        description: `Stop Harvest upon hitting ${this.harvestModName}, clean junk suffixes with Annuls, and slam target suffixes with Exalted Orbs.`,
        isRecommended: false,
      },
      {
        name: `Strategy B: Pure Harvest Fishing (Until ${this.harvestModName} + Target Suffixes)`,
        code: 'B',
        expectedHarvests: expHarvestsB,
        expectedAnnuls: 0,
        expectedExalts: 0,
        expectedCraftingCostChaos: expCraftCostB,
        expectedTotalCraftCostChaos: expTotalCostB,
        expectedSaleValueChaos: saleValueChaos,
        expectedProfitChaos: profitB,
        roi: roiB,
        description: `Remain in Harvest until BOTH ${this.harvestModName} and all Target Suffixes appear simultaneously directly from Harvest (1 in ~${Math.round(expHarvestsB).toLocaleString()} crafts).`,
        isRecommended: false,
      },
      {
        name: 'Strategy C: State-Aware Optimal Stopping Policy',
        code: 'C',
        expectedHarvests: this.expHarvestsFrac35,
        expectedAnnuls: this.expAnnulsFrac35,
        expectedExalts: this.expExaltsFrac35,
        expectedCraftingCostChaos: expCraftCostC,
        expectedTotalCraftCostChaos: expTotalCostC,
        expectedSaleValueChaos: saleValueChaos,
        expectedProfitChaos: profitC,
        roi: roiC,
        description: `Dynamic Bellman policy choosing min-cost action at every state; preserves any target suffix hit in Harvest, cleans junk, and slams remainder with Exalted Orbs.`,
        isRecommended: true,
      },
    ];
  }
}
