import type { BaseType } from '../crafting-engine/src/domain/ItemState.ts';

export interface OptimizerSeedMarketValue {
  chaos: number;
  kind: 'LOW' | 'MEDIAN';
  quotedAt: string;
  passiveRange: { min: number; max: number };
  provenance: string;
}

/** Typed, App-owned handoff from Cluster Jewels to the crafting workflow. */
export interface OptimizerSeed {
  id: string;
  source: 'CLUSTER_JEWELS';
  league: string;
  baseType: BaseType;
  clusterType: string;
  passiveCount?: number;
  passiveRange?: { min: number; max: number };
  itemLevel: number;
  itemLevelDefaulted: boolean;
  targetModIds: string[];
  sourceComboLabel?: string;
  sourceMarketValue?: OptimizerSeedMarketValue;
}
