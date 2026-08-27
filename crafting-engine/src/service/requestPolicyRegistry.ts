export const REQUEST_POLICY_REGISTRY_VERSION = 'REQUEST_POLICY_REGISTRY_PHASE3D_V1' as const;

export interface ExecutablePolicyRegistryIdentity {
  targetIdentity: string;
  mechanicsSessionIdentity: string;
  economicsEffortIdentity: string;
  physicalAcquisitionIdentity: string;
  acquisitionKind: 'CLEAN' | 'SELF_FRACTURE';
  canonicalPolicyFingerprint: string;
}

export type ExecutablePolicyValidationSource =
  | 'SOLVER_CERTIFICATION'
  | 'FAMILY_ADMISSIBILITY_REVALIDATION';

export interface ExecutablePolicyRegistryCandidate<T> {
  familyId: string;
  bundleId: string;
  fullRouteUChaos: number;
  identity: ExecutablePolicyRegistryIdentity;
  validationSource: ExecutablePolicyValidationSource;
  payload: T;
}

export interface ExecutablePolicyRegistryEvent {
  familyId: string;
  bundleId: string;
  policyFingerprint: string;
  candidateUChaos: number;
  previousFamilyUChaos?: number;
  resultingFamilyUChaos: number;
  outcome: 'INITIAL_INCUMBENT' | 'IMPROVED_INCUMBENT' | 'RETAINED_BETTER_INCUMBENT';
}

export interface RequestPolicyRegistrySummary {
  version: typeof REQUEST_POLICY_REGISTRY_VERSION;
  registeredPolicyCount: number;
  familyIncumbents: Array<{
    familyId: string;
    bundleId: string;
    fullRouteUChaos: number;
    identity: ExecutablePolicyRegistryIdentity;
    validationSource: ExecutablePolicyValidationSource;
  }>;
  events: ExecutablePolicyRegistryEvent[];
  monotone: boolean;
}

function canonicalIdentity(identity: ExecutablePolicyRegistryIdentity): string {
  return JSON.stringify([
    identity.targetIdentity,
    identity.mechanicsSessionIdentity,
    identity.economicsEffortIdentity,
    identity.physicalAcquisitionIdentity,
    identity.acquisitionKind,
    identity.canonicalPolicyFingerprint,
  ]);
}

/**
 * Request-local ledger of independently executable policies.
 *
 * Callers certify or revalidate candidates before registration. The registry
 * retains every authoritative identity while enforcing a monotone chaos-cost U
 * for each compatible family; later enrichment can improve, never worsen, U.
 */
export class RequestLocalExecutablePolicyRegistry<T> {
  private readonly policies = new Map<string, ExecutablePolicyRegistryCandidate<T>>();
  private readonly incumbents = new Map<string, ExecutablePolicyRegistryCandidate<T>>();
  private readonly events: ExecutablePolicyRegistryEvent[] = [];

  register(
    candidate: ExecutablePolicyRegistryCandidate<T>,
  ): ExecutablePolicyRegistryEvent {
    if (!Number.isFinite(candidate.fullRouteUChaos) || candidate.fullRouteUChaos < 0) {
      throw new Error('Executable policy registry requires a finite non-negative full-route U');
    }
    const key = `${candidate.familyId}\u0000${canonicalIdentity(candidate.identity)}`;
    const samePolicy = this.policies.get(key);
    if (!samePolicy || candidate.fullRouteUChaos < samePolicy.fullRouteUChaos) {
      this.policies.set(key, candidate);
    }
    const previous = this.incumbents.get(candidate.familyId);
    const improves = !previous || candidate.fullRouteUChaos < previous.fullRouteUChaos;
    if (improves) this.incumbents.set(candidate.familyId, candidate);
    const resulting = this.incumbents.get(candidate.familyId)!;
    const event: ExecutablePolicyRegistryEvent = {
      familyId: candidate.familyId,
      bundleId: candidate.bundleId,
      policyFingerprint: candidate.identity.canonicalPolicyFingerprint,
      candidateUChaos: candidate.fullRouteUChaos,
      previousFamilyUChaos: previous?.fullRouteUChaos,
      resultingFamilyUChaos: resulting.fullRouteUChaos,
      outcome: !previous
        ? 'INITIAL_INCUMBENT'
        : improves
          ? 'IMPROVED_INCUMBENT'
          : 'RETAINED_BETTER_INCUMBENT',
    };
    this.events.push(event);
    return event;
  }

  bestForFamily(familyId: string): ExecutablePolicyRegistryCandidate<T> | undefined {
    return this.incumbents.get(familyId);
  }

  summary(): RequestPolicyRegistrySummary {
    let monotone = true;
    const lastByFamily = new Map<string, number>();
    for (const event of this.events) {
      const previous = lastByFamily.get(event.familyId);
      if (previous !== undefined && event.resultingFamilyUChaos > previous + 1e-9) {
        monotone = false;
      }
      lastByFamily.set(event.familyId, event.resultingFamilyUChaos);
    }
    return {
      version: REQUEST_POLICY_REGISTRY_VERSION,
      registeredPolicyCount: this.policies.size,
      familyIncumbents: [...this.incumbents.values()]
        .map((candidate) => ({
          familyId: candidate.familyId,
          bundleId: candidate.bundleId,
          fullRouteUChaos: candidate.fullRouteUChaos,
          identity: { ...candidate.identity },
          validationSource: candidate.validationSource,
        }))
        .sort((left, right) => left.familyId.localeCompare(right.familyId)),
      events: this.events.map((event) => ({ ...event })),
      monotone,
    };
  }
}
