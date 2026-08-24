import type { SolverContext } from '../domain/CraftAction.ts';
import {
  getAllAffixes,
  getPhysicalStateSignature,
  normalizeItemState,
  type ItemState,
} from '../domain/ItemState.ts';
import {
  matchesModRequirement,
  satisfiesTarget,
  type ModRequirement,
} from '../domain/TargetDefinition.ts';
import {
  CRAFT_MECHANICS,
  createRestartReacquireMechanic,
  type CraftMechanic,
  type TransitionDistribution,
} from '../rules/actionRegistry.ts';
import { getCanonicalStateKey } from '../rules/actionDiscovery.ts';
import {
  buildAcquisitionTargetDefinition,
  type CleanBaseAcquisition,
  type PhysicalStateRequirement,
} from './acquisitionSynthesis.ts';

/**
 * Phase 2E diagnostic upper bound.
 *
 * This evaluator is deliberately absent from normal strategy discovery and ranking. It evaluates
 * one generic, known-legal fixed policy entirely through shared action-registry transitions so a
 * search-quality gap can be measured without turning the policy into a solver shortcut.
 */

export interface FixedPolicyActionUsage {
  actionId: string;
  actionName: string;
  expectedCount: number;
  expectedCostChaos: number;
}

export interface FixedPolicyStageCoverage {
  magicRollOutcomes: number;
  magicTargetHitOutcomes: number;
  magicTargetHitProbability: number;
  magicOneAffixTargetProbability: number;
  magicTwoAffixTargetProbability: number;
  targetReadyMagicStates: number;
  rareThreeAffixStates: number;
  rareFourAffixStates: number;
  fractureOutcomeTransitions: number;
}

export interface AcquisitionFixedPolicyBaselineResult {
  status: 'RESOLVED';
  policyName: 'ROLL_TARGET_FILL_TO_FOUR_FRACTURE_CLEAN_OR_RESTART';
  policySteps: string[];
  legalityEvidence: string[];
  expectedCostChaos: number;
  expectedPreparationCostChaos: number;
  cleanBaseCostChaos: number;
  expectedActionUsage: FixedPolicyActionUsage[];
  targetHitProbabilityPerMagicRoll: number;
  desiredFractureProbabilityPerAttempt: number;
  expectedFracturingOrbs: number;
  expectedRestarts: number;
  proper: boolean;
  terminalAbsorptionProbability: number;
  reconciliationDifferenceChaos: number;
  costReconciled: boolean;
  stageCoverage: FixedPolicyStageCoverage;
  transitionSource: 'SHARED ACTION REGISTRY / PRICEBOOK';
}

export interface AcquisitionFixedPolicyBaselineRequest {
  cleanStartingState: ItemState;
  desiredPhysicalState: PhysicalStateRequirement;
  cleanBaseAcquisition: CleanBaseAcquisition;
}

interface WeightedState {
  state: ItemState;
  probability: number;
}

const PROBABILITY_TOLERANCE = 1e-9;

function requiredMechanic(actionId: string): CraftMechanic {
  const mechanic = CRAFT_MECHANICS.find((candidate) => candidate.id === actionId);
  if (!mechanic?.getTransitions) {
    throw new Error(`Fixed-policy baseline requires executable shared mechanic ${actionId}`);
  }
  return mechanic;
}

function assertProbabilityMass(distribution: TransitionDistribution, label: string): void {
  const probability = distribution.outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  if (Math.abs(probability - 1) > PROBABILITY_TOLERANCE) {
    throw new Error(`${label} transition probability mass is ${probability}, expected 1`);
  }
}

function applyMechanic(
  mechanic: CraftMechanic,
  state: ItemState,
  context: SolverContext,
  target: ReturnType<typeof buildAcquisitionTargetDefinition>
): TransitionDistribution {
  if (!mechanic.isLegal(state, target, context)) {
    throw new Error(
      `${mechanic.id} is not legal for ${state.rarity} ` +
      `${state.prefixes.length}P/${state.suffixes.length}S fixed-policy state`
    );
  }
  const distribution = mechanic.getTransitions!(state, target, context);
  if (distribution.outcomes.length === 0) {
    throw new Error(`${mechanic.id} produced no transitions for a legal fixed-policy state`);
  }
  assertProbabilityMass(distribution, mechanic.id);
  return distribution;
}

function aggregateWeightedStates(
  states: WeightedState[],
  target: ReturnType<typeof buildAcquisitionTargetDefinition>
): WeightedState[] {
  const aggregated = new Map<string, WeightedState>();
  for (const weighted of states) {
    const key = getCanonicalStateKey(weighted.state, target);
    const current = aggregated.get(key);
    if (current) current.probability += weighted.probability;
    else aggregated.set(key, { state: weighted.state, probability: weighted.probability });
  }
  return [...aggregated.values()];
}

function distributionByPhysicalSignature(distribution: TransitionDistribution): Map<string, number> {
  const result = new Map<string, number>();
  for (const outcome of distribution.outcomes) {
    const key = getPhysicalStateSignature(outcome.state);
    result.set(key, (result.get(key) ?? 0) + outcome.probability);
  }
  return result;
}

function assertSameOutcomeDistribution(
  left: TransitionDistribution,
  right: TransitionDistribution,
  label: string
): void {
  const leftByState = distributionByPhysicalSignature(left);
  const rightByState = distributionByPhysicalSignature(right);
  if (leftByState.size !== rightByState.size) {
    throw new Error(`${label} distributions have different outcome counts`);
  }
  for (const [key, probability] of leftByState) {
    if (Math.abs(probability - (rightByState.get(key) ?? Number.NaN)) > PROBABILITY_TOLERANCE) {
      throw new Error(`${label} distributions differ at ${key}`);
    }
  }
}

function containsRequirement(state: ItemState, requirement: ModRequirement): boolean {
  return getAllAffixes(state).some((mod) => matchesModRequirement(mod, requirement));
}

/**
 * Evaluates:
 * clean -> Transmute -> Alter until target -> Augment if one affix -> Regal -> Exalt ->
 * Fracture -> Scour on desired fracture / Restart+Reacquire on wrong fracture.
 *
 * The repeated-roll and repeated-attempt equations use probabilities read from the shared
 * transition distributions. No target probability or fixed four-attempt multiplier is embedded.
 */
export function evaluateAcquisitionFixedPolicyBaseline(
  context: SolverContext,
  request: AcquisitionFixedPolicyBaselineRequest
): AcquisitionFixedPolicyBaselineResult {
  const target = buildAcquisitionTargetDefinition(request.desiredPhysicalState);
  const desiredUnfractured: ModRequirement = {
    ...request.desiredPhysicalState.fracturedMod,
    mustBeFractured: undefined,
  };
  const cleanState = normalizeItemState(request.cleanStartingState);
  const transmutation = requiredMechanic('transmutation_orb');
  const alteration = requiredMechanic('alteration_orb');
  const augmentation = requiredMechanic('augmentation_orb');
  const regal = requiredMechanic('regal_orb');
  const exalted = requiredMechanic('exalted_orb');
  const fracturing = requiredMechanic('fracturing_orb');
  const scouring = requiredMechanic('scouring_orb');
  const restart = createRestartReacquireMechanic({
    destination: cleanState,
    acquisitionCostChaos: request.cleanBaseAcquisition.costChaos,
    confidence: request.cleanBaseAcquisition.confidence,
    provenance: request.cleanBaseAcquisition.provenance,
    label: 'Fixed-policy wrong-fracture restart and clean-base reacquisition',
  });

  const magicRoll = applyMechanic(transmutation, cleanState, context, target);
  const magicHits = magicRoll.outcomes.filter((outcome) =>
    containsRequirement(outcome.state, desiredUnfractured)
  );
  const magicMisses = magicRoll.outcomes.filter((outcome) =>
    !containsRequirement(outcome.state, desiredUnfractured)
  );
  const targetHitProbability = magicHits.reduce(
    (sum, outcome) => sum + outcome.probability,
    0
  );
  if (!(targetHitProbability > 0 && targetHitProbability <= 1)) {
    throw new Error(`Fixed-policy target hit probability is not usable: ${targetHitProbability}`);
  }
  if (!magicMisses.every((outcome) => alteration.isLegal(outcome.state, target, context))) {
    throw new Error('Alteration is not legal for every target-miss magic-roll outcome');
  }
  const representativeMiss = magicMisses[0];
  if (representativeMiss) {
    const alterationRoll = applyMechanic(alteration, representativeMiss.state, context, target);
    assertSameOutcomeDistribution(magicRoll, alterationRoll, 'Transmutation/Alteration clean-magic');
  }

  const conditionalHitStates = aggregateWeightedStates(
    magicHits.map((outcome) => ({
      state: outcome.state,
      probability: outcome.probability / targetHitProbability,
    })),
    target
  );
  let augmentationProbabilityPerAttempt = 0;
  const readyMagicStates: WeightedState[] = [];
  for (const weighted of conditionalHitStates) {
    const affixCount = getAllAffixes(weighted.state).length;
    if (affixCount === 1) {
      augmentationProbabilityPerAttempt += weighted.probability;
      const distribution = applyMechanic(augmentation, weighted.state, context, target);
      for (const outcome of distribution.outcomes) {
        if (!containsRequirement(outcome.state, desiredUnfractured)) {
          throw new Error('Augmentation removed the desired target modifier');
        }
        readyMagicStates.push({
          state: outcome.state,
          probability: weighted.probability * outcome.probability,
        });
      }
    } else if (affixCount === 2) {
      readyMagicStates.push(weighted);
    } else {
      throw new Error(`Unexpected target-hit magic affix count: ${affixCount}`);
    }
  }
  const aggregatedReadyMagic = aggregateWeightedStates(readyMagicStates, target);

  const rareThreeStates: WeightedState[] = [];
  for (const weighted of aggregatedReadyMagic) {
    const distribution = applyMechanic(regal, weighted.state, context, target);
    for (const outcome of distribution.outcomes) {
      if (
        outcome.state.rarity !== 'rare' ||
        getAllAffixes(outcome.state).length !== 3 ||
        !containsRequirement(outcome.state, desiredUnfractured)
      ) {
        throw new Error('Regal did not produce a target-preserving three-affix rare state');
      }
      rareThreeStates.push({
        state: outcome.state,
        probability: weighted.probability * outcome.probability,
      });
    }
  }
  const aggregatedRareThree = aggregateWeightedStates(rareThreeStates, target);

  let desiredFractureProbability = 0;
  let wrongFractureProbability = 0;
  let fractureOutcomeTransitions = 0;
  const rareFourSignatures = new Set<string>();
  for (const weighted of aggregatedRareThree) {
    const exaltDistribution = applyMechanic(exalted, weighted.state, context, target);
    for (const exaltOutcome of exaltDistribution.outcomes) {
      const rareFour = exaltOutcome.state;
      const rareFourWeight = weighted.probability * exaltOutcome.probability;
      if (
        getAllAffixes(rareFour).length !== 4 ||
        !containsRequirement(rareFour, desiredUnfractured)
      ) {
        throw new Error('Exalted Orb did not produce a target-preserving four-affix rare state');
      }
      rareFourSignatures.add(getCanonicalStateKey(rareFour, target));
      const fractureDistribution = applyMechanic(fracturing, rareFour, context, target);
      for (const fractureOutcome of fractureDistribution.outcomes) {
        fractureOutcomeTransitions++;
        const outcomeWeight = rareFourWeight * fractureOutcome.probability;
        const desiredWasFractured = getAllAffixes(fractureOutcome.state).some(
          (mod) => mod.isFractured && matchesModRequirement(mod, desiredUnfractured)
        );
        if (desiredWasFractured) {
          const scourDistribution = applyMechanic(scouring, fractureOutcome.state, context, target);
          if (!scourDistribution.outcomes.every((outcome) => satisfiesTarget(outcome.state, target))) {
            throw new Error('Scour after a desired fracture did not normalize to the terminal base');
          }
          desiredFractureProbability += outcomeWeight;
        } else {
          const restartDistribution = applyMechanic(restart, fractureOutcome.state, context, target);
          if (!restartDistribution.outcomes.every(
            (outcome) => getPhysicalStateSignature(outcome.state) === getPhysicalStateSignature(cleanState)
          )) {
            throw new Error('Wrong-fracture restart did not reacquire the clean starting state');
          }
          wrongFractureProbability += outcomeWeight;
        }
      }
    }
  }
  if (Math.abs(desiredFractureProbability + wrongFractureProbability - 1) > PROBABILITY_TOLERANCE) {
    throw new Error(
      `Fracture outcome mass is ${desiredFractureProbability + wrongFractureProbability}, expected 1`
    );
  }
  if (!(desiredFractureProbability > 0)) {
    throw new Error('Fixed fracture policy has zero desired-outcome probability');
  }

  const expectedAttempts = 1 / desiredFractureProbability;
  const expectedRestarts = wrongFractureProbability / desiredFractureProbability;
  const expectedAlterationsPerAttempt = (1 - targetHitProbability) / targetHitProbability;
  const counts = new Map<string, number>([
    ['transmutation_orb', expectedAttempts],
    ['alteration_orb', expectedAttempts * expectedAlterationsPerAttempt],
    ['augmentation_orb', expectedAttempts * augmentationProbabilityPerAttempt],
    ['regal_orb', expectedAttempts],
    ['exalted_orb', expectedAttempts],
    ['fracturing_orb', expectedAttempts],
    ['scouring_orb', 1],
    ['restart_reacquire', expectedRestarts],
  ]);
  const mechanicsById = new Map<string, CraftMechanic>([
    ...CRAFT_MECHANICS.map((mechanic): [string, CraftMechanic] => [mechanic.id, mechanic]),
    [restart.id, restart],
  ]);
  const expectedActionUsage = [...counts.entries()].map(([actionId, expectedCount]) => {
    const mechanic = mechanicsById.get(actionId)!;
    return {
      actionId,
      actionName: mechanic.name,
      expectedCount,
      expectedCostChaos: expectedCount * mechanic.getCost(context).costChaos,
    };
  });
  const expectedPreparationCostChaos = expectedActionUsage.reduce(
    (sum, usage) => sum + usage.expectedCostChaos,
    0
  );
  const perAttemptCost =
    transmutation.getCost(context).costChaos +
    expectedAlterationsPerAttempt * alteration.getCost(context).costChaos +
    augmentationProbabilityPerAttempt * augmentation.getCost(context).costChaos +
    regal.getCost(context).costChaos +
    exalted.getCost(context).costChaos +
    fracturing.getCost(context).costChaos +
    desiredFractureProbability * scouring.getCost(context).costChaos +
    wrongFractureProbability * restart.getCost(context).costChaos;
  const fixedPointPreparationCost = perAttemptCost / desiredFractureProbability;
  const reconciliationDifferenceChaos = Math.abs(
    expectedPreparationCostChaos - fixedPointPreparationCost
  );
  const magicOneAffixTargetProbability = magicHits
    .filter((outcome) => getAllAffixes(outcome.state).length === 1)
    .reduce((sum, outcome) => sum + outcome.probability, 0);
  const magicTwoAffixTargetProbability = magicHits
    .filter((outcome) => getAllAffixes(outcome.state).length === 2)
    .reduce((sum, outcome) => sum + outcome.probability, 0);

  return {
    status: 'RESOLVED',
    policyName: 'ROLL_TARGET_FILL_TO_FOUR_FRACTURE_CLEAN_OR_RESTART',
    policySteps: [
      'Transmute the clean normal base.',
      'Alter every magic miss until the requested unfractured modifier is present.',
      'Augment only a one-affix target hit so the magic item has two affixes.',
      'Regal the two-affix magic item to a three-affix rare item.',
      'Exalt the three-affix rare item to a four-affix legal fracture source.',
      'Apply Fracturing Orb using its shared uniform-over-affixes transition.',
      'Scour a desired fracture to the reusable terminal base; abandon and reacquire after a wrong fracture.',
    ],
    legalityEvidence: [
      'Transmutation was legal on the normalized clean normal state.',
      `Alteration was legal on all ${magicMisses.length} target-miss magic outcomes and reproduced the same shared clean-magic roll distribution.`,
      `Augmentation was legal on every one-affix target hit and preserved the target across ${aggregatedReadyMagic.length} ready magic states.`,
      `Regal was legal on every ready two-affix magic state and produced ${aggregatedRareThree.length} canonical target-preserving three-affix rare states.`,
      `Exalted Orb was legal on every three-affix rare state and produced ${rareFourSignatures.size} canonical four-affix fracture sources.`,
      `Fracturing Orb was legal on every source; desired outcomes Scoured to the terminal state and every wrong fracture used restart/reacquisition.`,
      'No Crafting Bench action or pre-fractured market purchase participates in this policy.',
    ],
    expectedCostChaos: request.cleanBaseAcquisition.costChaos + expectedPreparationCostChaos,
    expectedPreparationCostChaos,
    cleanBaseCostChaos: request.cleanBaseAcquisition.costChaos,
    expectedActionUsage,
    targetHitProbabilityPerMagicRoll: targetHitProbability,
    desiredFractureProbabilityPerAttempt: desiredFractureProbability,
    expectedFracturingOrbs: expectedAttempts,
    expectedRestarts,
    proper: true,
    terminalAbsorptionProbability: 1,
    reconciliationDifferenceChaos,
    costReconciled: reconciliationDifferenceChaos <= 1e-6,
    stageCoverage: {
      magicRollOutcomes: magicRoll.outcomes.length,
      magicTargetHitOutcomes: magicHits.length,
      magicTargetHitProbability: targetHitProbability,
      magicOneAffixTargetProbability,
      magicTwoAffixTargetProbability,
      targetReadyMagicStates: aggregatedReadyMagic.length,
      rareThreeAffixStates: aggregatedRareThree.length,
      rareFourAffixStates: rareFourSignatures.size,
      fractureOutcomeTransitions,
    },
    transitionSource: 'SHARED ACTION REGISTRY / PRICEBOOK',
  };
}
