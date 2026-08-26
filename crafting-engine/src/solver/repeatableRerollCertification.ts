import type { SolverContext } from '../domain/CraftAction.ts';
import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import { satisfiesTarget } from '../domain/TargetDefinition.ts';
import type {
  CraftMechanic,
  TransitionDistribution,
} from '../rules/actionRegistry.ts';
import { getCanonicalStateKey } from '../rules/actionDiscovery.ts';

export interface RepeatableRerollCertificationEvidence {
  status: 'CERTIFIED' | 'REJECTED';
  contractVersion: 'REPEATABLE_FULL_REROLL_V1';
  actionId: string;
  kernelIdentity: string;
  transitionOutcomeCount: number;
  successOutcomeCount: number;
  missOutcomeCount: number;
  totalProbabilityMass: number;
  successProbabilityPerApplication: number;
  expectedApplications: number;
  allMissesRemainLegal: boolean;
  allMissesShareKernel: boolean;
  preservedComponentsIdentical: boolean;
  nonPersistentAffixesReplaced: boolean;
  enabledActionSetAudit: 'ONLY_CERTIFIED_REROLL_LEGAL_IN_QUOTIENT';
  absorbingSuccess: boolean;
  rejectionReasons: string[];
}

export interface CertifiedRepeatableReroll {
  evidence: RepeatableRerollCertificationEvidence;
  distribution: TransitionDistribution;
  stateKey: (state: ItemState, target: TargetDefinition) => string;
}

export interface RepeatableRerollCertificationInput {
  mechanic: CraftMechanic;
  enabledMechanics: readonly CraftMechanic[];
  seedState: ItemState;
  target: TargetDefinition;
  context: SolverContext;
  requiredActionIds: readonly string[];
  deadlineMs?: number;
}

/**
 * Certifies and constructs a family-scoped Markov quotient. Full product-state
 * identity remains the fallback for terminal states, other kernels, and any state
 * where another enabled action is legal.
 */
export function certifyRepeatableReroll(
  input: RepeatableRerollCertificationInput,
): CertifiedRepeatableReroll | undefined {
  const {
    mechanic,
    enabledMechanics,
    seedState,
    target,
    context,
    requiredActionIds,
    deadlineMs,
  } = input;
  const contract = mechanic.repeatableFullReroll;
  if (!contract || !mechanic.getTransitions) return undefined;

  const kernelState = contract.getKernelState(seedState);
  const kernelIdentity = contract.getKernelIdentity(kernelState);
  if (!mechanic.isLegal(kernelState, target, context)) return undefined;
  const distribution = mechanic.getTransitions(kernelState, target, context, { deadlineMs });
  if (distribution.outcomes.length === 0) return undefined;

  let totalProbabilityMass = 0;
  let successProbability = 0;
  let successOutcomeCount = 0;
  let missOutcomeCount = 0;
  let allMissesRemainLegal = true;
  let allMissesShareKernel = true;
  let preservedComponentsIdentical = true;
  const rejectionReasons: string[] = [];

  for (const outcome of distribution.outcomes) {
    if (!Number.isFinite(outcome.probability) || outcome.probability < 0) {
      rejectionReasons.push('Transition distribution contains invalid probability mass.');
      continue;
    }
    totalProbabilityMass += outcome.probability;
    if (satisfiesTarget(outcome.state, target)) {
      successProbability += outcome.probability;
      successOutcomeCount++;
      continue;
    }
    missOutcomeCount++;
    if (!mechanic.isLegal(outcome.state, target, context)) allMissesRemainLegal = false;
    const outcomeKernelIdentity = contract.getKernelIdentity(outcome.state);
    if (outcomeKernelIdentity !== kernelIdentity) {
      allMissesShareKernel = false;
      preservedComponentsIdentical = false;
    }
  }

  if (Math.abs(totalProbabilityMass - 1) > 1e-8) {
    rejectionReasons.push(`Transition probability mass is ${totalProbabilityMass}, not 1.`);
  }
  if (!(successProbability > 0 && successProbability <= 1)) {
    rejectionReasons.push(`Success probability ${successProbability} is not absorbing and positive.`);
  }
  if (!allMissesRemainLegal) rejectionReasons.push('At least one miss makes the reroll action illegal.');
  if (!allMissesShareKernel) rejectionReasons.push('Misses do not share one transition kernel.');
  if (!preservedComponentsIdentical) rejectionReasons.push('Persistent components differ across misses.');
  if (!contract.replacesNonPersistentAffixes) rejectionReasons.push('Nonpersistent affix replacement is not declared.');
  if (!contract.transitionDistributionDependsOnlyOnKernel) {
    rejectionReasons.push('Transition distribution is not declared kernel-dependent.');
  }
  if (rejectionReasons.length > 0) return undefined;

  const evidence: RepeatableRerollCertificationEvidence = {
    status: 'CERTIFIED',
    contractVersion: 'REPEATABLE_FULL_REROLL_V1',
    actionId: mechanic.id,
    kernelIdentity,
    transitionOutcomeCount: distribution.outcomes.length,
    successOutcomeCount,
    missOutcomeCount,
    totalProbabilityMass,
    successProbabilityPerApplication: successProbability,
    expectedApplications: 1 / successProbability,
    allMissesRemainLegal,
    allMissesShareKernel,
    preservedComponentsIdentical,
    nonPersistentAffixesReplaced: contract.replacesNonPersistentAffixes,
    enabledActionSetAudit: 'ONLY_CERTIFIED_REROLL_LEGAL_IN_QUOTIENT',
    absorbingSuccess: true,
    rejectionReasons,
  };

  const stateKey = (state: ItemState, requestedTarget: TargetDefinition): string => {
    const observed = new Set(state.flags?.methodFamilyActionEvidence ?? []);
    const requiredEvidenceSatisfied = requiredActionIds.length === 0 ||
      requiredActionIds.some((actionId) => observed.has(actionId));
    if (requiredEvidenceSatisfied && satisfiesTarget(state, requestedTarget)) {
      return getCanonicalStateKey(state, requestedTarget);
    }
    if (contract.getKernelIdentity(state) !== kernelIdentity) {
      return getCanonicalStateKey(state, requestedTarget);
    }
    const legalActionIds = enabledMechanics
      .filter((candidate) => candidate.getTransitions && candidate.isLegal(state, requestedTarget, context))
      .map((candidate) => candidate.id)
      .sort();
    if (legalActionIds.length !== 1 || legalActionIds[0] !== mechanic.id) {
      return getCanonicalStateKey(state, requestedTarget);
    }
    return [
      'certified-repeatable-reroll-v1',
      mechanic.id,
      kernelIdentity,
      `method-evidence=${[...observed].sort().join(',')}`,
    ].join('|');
  };

  return { evidence, distribution, stateKey };
}
