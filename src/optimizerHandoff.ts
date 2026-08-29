import type { TargetDefinition } from '../crafting-engine/src/domain/TargetDefinition.ts';
import { canonicalTargetFingerprintMaterial } from '../crafting-engine/src/domain/TargetDefinition.ts';
import type { BaseType } from '../crafting-engine/src/domain/ItemState.ts';
import type { OptimizerSeed } from './optimizerSeed.ts';

export type SaleValueProvenance = 'empty' | 'cluster-source' | 'user';

export interface HandoffIdentitySnapshot {
  baseType: BaseType;
  clusterType: string;
  itemLevel: number;
  passiveCount: number;
  league: string;
  targetFingerprint: string;
}

export type ClusterHandoffState =
  | { status: 'none' }
  | { status: 'attached'; seed: OptimizerSeed; baseline: HandoffIdentitySnapshot };

export interface HandoffIdentityInput {
  baseType: BaseType;
  clusterType: string;
  itemLevel: number;
  passiveCount: number;
  league: string;
  target: TargetDefinition;
}

export function handoffIdentitySnapshot(input: HandoffIdentityInput): HandoffIdentitySnapshot {
  return {
    baseType: input.baseType,
    clusterType: input.clusterType,
    itemLevel: input.itemLevel,
    passiveCount: input.passiveCount,
    league: input.league,
    targetFingerprint: JSON.stringify(canonicalTargetFingerprintMaterial(input.target)),
  };
}

export function attachClusterHandoff(
  seed: OptimizerSeed,
  baseline: HandoffIdentitySnapshot,
): ClusterHandoffState {
  return { status: 'attached', seed, baseline };
}

export function detachClusterHandoff(): ClusterHandoffState {
  return { status: 'none' };
}

export function detachedSaleValue(
  value: string,
  provenance: SaleValueProvenance,
): { value: string; provenance: SaleValueProvenance } {
  return provenance === 'cluster-source'
    ? { value: '', provenance: 'empty' }
    : { value, provenance };
}

export function userSaleValue(value: string): SaleValueProvenance {
  return value.trim() === '' ? 'empty' : 'user';
}

export function hydratedSaleValue(
  value: number | undefined,
  sourceContextPresent: boolean,
  serializedProvenance?: SaleValueProvenance,
): SaleValueProvenance {
  if (value === undefined) return 'empty';
  if (serializedProvenance === 'user') return 'user';
  if (serializedProvenance === 'cluster-source') return 'cluster-source';
  // Legacy attached shares predate explicit provenance. Their source-context
  // ownership, rather than numeric equality, authoritatively identifies the quote.
  return sourceContextPresent ? 'cluster-source' : 'user';
}
