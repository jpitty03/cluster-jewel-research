import type { ItemState } from '../domain/ItemState.ts';
import type { CraftAction, SolverContext } from '../domain/CraftAction.ts';
import { generateStateKey } from './stateKey.ts';
import { satisfiesTarget, type TargetDefinition } from '../domain/TargetDefinition.ts';
import { DivineAction } from '../actions/divine.ts';
import { getEligibleMods, calculateTotalWeight } from '../rules/modEligibility.ts';

export interface StateValueNode {
  stateKey: string;
  state: ItemState;
  expectedCostChaos: number;
  bestAction?: CraftAction;
  bestActionCostChaos: number;
  expectedCurrencies: Record<string, number>;
  isTerminal: boolean;
  isRestart: boolean;
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

  solve(startState: ItemState, _restartCostChaos = 0): StateValueNode {
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
      };
    }

    const expectedCurrencies: Record<string, number> = {};
    let totalCostChaos = 0;

    const allMods = this.context.pool.getAllMods();
    const isAllflame = this.actions.some((a) => a.id.includes('allflame'));

    // 2. Identify unmet requirements from target definition
    const placedMods = [...startState.prefixes, ...startState.suffixes];
    const unmetRequirements = this.target.requiredMods.filter((req) =>
      !placedMods.some((m) =>
        (req.modId ? m.modId === req.modId : true) &&
        (req.modGroup ? m.modGroup === req.modGroup : true) &&
        (req.name ? m.name === req.name : true) &&
        (req.maxTierNumber !== undefined ? m.tier <= req.maxTierNumber : true)
      )
    );

    // 3. For each unmet requirement, evaluate optimal action
    for (const req of unmetRequirements) {
      // Find candidate matching mods in the pool
      const candidates = allMods.filter((m) =>
        (req.modId ? m.modId === req.modId : true) &&
        (req.modGroup ? m.modGroup === req.modGroup : true) &&
        (req.name ? m.name === req.name : true) &&
        (req.maxTierNumber !== undefined ? m.tier <= req.maxTierNumber : true)
      );

      if (candidates.length === 0) continue;

      // Check if a Harvest Reforge matches candidate tags
      const targetTags = new Set<string>();
      for (const c of candidates) {
        for (const t of [...c.craftTags, ...c.tags]) targetTags.add(t);
      }

      const harvestAction = this.actions.find((a) =>
        a.id.startsWith('harvest_reforge_') && targetTags.has((a as any).normalizedTag)
      );

      if (harvestAction) {
        // Tagged Harvest Reforge path
        const taggedNorm = (harvestAction as any).normalizedTag;
        const eligible = getEligibleMods(startState, allMods, { filterBySlotCapacity: false });
        const taggedInPool = eligible.filter((m) =>
          m.craftTags.includes(taggedNorm) || m.tags.includes(taggedNorm)
        );

        const totalTaggedWeight = calculateTotalWeight(taggedInPool);
        const candidateWeight = calculateTotalWeight(
          taggedInPool.filter((m) => candidates.some((c) => c.modId === m.modId))
        );

        const pHit = totalTaggedWeight > 0 ? candidateWeight / totalTaggedWeight : 0.05;
        const expectedAttempts = 1 / Math.max(pHit, 0.001);

        const craftCost = harvestAction.cost(startState, this.context);
        for (const [curr, amt] of Object.entries(craftCost)) {
          if (amt && amt > 0) {
            const totalAmt = amt * expectedAttempts;
            expectedCurrencies[curr] = (expectedCurrencies[curr] ?? 0) + totalAmt;
            totalCostChaos += this.context.priceBook.toChaos(totalAmt, curr);
          }
        }
      } else {
        // Direct Exalt slam path
        const eligible = getEligibleMods(startState, allMods);
        const totalEligibleWeight = calculateTotalWeight(eligible);
        const candidateWeight = calculateTotalWeight(
          eligible.filter((m) => candidates.some((c) => c.modId === m.modId))
        );

        const pBase = totalEligibleWeight > 0 ? candidateWeight / totalEligibleWeight : 0.01;
        const pEffective = isAllflame ? 1 - Math.pow(1 - pBase, 4) : pBase;

        const expectedSlams = 1 / Math.max(pEffective, 0.0001);
        expectedCurrencies.exalt = (expectedCurrencies.exalt ?? 0) + expectedSlams;
        totalCostChaos += this.context.priceBook.toChaos(expectedSlams, 'exalt');

        // Annul recovery for missed slams
        if (placedMods.length > 0) {
          const expectedAnnuls = expectedSlams * 0.8;
          expectedCurrencies.annul = (expectedCurrencies.annul ?? 0) + expectedAnnuls;
          totalCostChaos += this.context.priceBook.toChaos(expectedAnnuls, 'annul');
        }
      }
    }

    // 4. Divine finishing
    const finishingDivines = this.divineAction.calculateExpectedFinishingCost(startState, this.target);
    if (finishingDivines > 0) {
      expectedCurrencies.divine = (expectedCurrencies.divine ?? 0) + finishingDivines;
      totalCostChaos += this.context.priceBook.toChaos(finishingDivines, 'divine');
    }

    return {
      stateKey: key,
      state: startState,
      expectedCostChaos: totalCostChaos,
      bestActionCostChaos: totalCostChaos,
      expectedCurrencies,
      isTerminal: false,
      isRestart: false,
    };
  }
}
