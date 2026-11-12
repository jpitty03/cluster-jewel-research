import { describe, expect, it } from 'vitest';
import { ClusterModRepository } from '../../src/data/loadClusterMods.ts';
import type { ItemState } from '../../src/domain/ItemState.ts';
import { ModPool } from '../../src/domain/ModPool.ts';
import { PriceBook } from '../../src/domain/PriceBook.ts';
import type { TargetDefinition } from '../../src/domain/TargetDefinition.ts';
import { GenericSearchEngine } from '../../src/solver/genericSearch.ts';

// Search merges non-target mods that exclude an identical slice of the pool into one
// state (ExclusionClass). That is only allowed if it changes nothing about the answer,
// so this pins the merged search to the unmerged one on a jewel small enough for the
// unmerged graph to close completely.
const BASE = 'Small Cluster Jewel';
const CLUSTER = '+12% to Chaos Resistance';
const ACTIONS = [
  'transmutation_orb',
  'alteration_orb',
  'augmentation_orb',
  'regal_orb',
  'scouring_orb',
  'annulment_orb',
];

function solve(merge: boolean) {
  const pool = ModPool.forCluster(new ClusterModRepository(), BASE, CLUSTER);
  if (!merge) for (const mod of pool.getAllMods()) delete mod.exclusionClass;
  const notable = pool.getPrefixes().find((mod) => mod.isNotable)!;
  const suffix = pool.getSuffixes().find((mod) => mod.tier === 1)!;
  const target: TargetDefinition = {
    requiredMods: [{ modId: notable.modId }, { modId: suffix.modId }],
  };
  const clean: ItemState = {
    baseType: BASE,
    clusterType: CLUSTER,
    itemLevel: 84,
    passiveCount: 3,
    rarity: 'normal',
    prefixes: [],
    suffixes: [],
    fracturedModIds: [],
  };
  const result = new GenericSearchEngine({ pool, priceBook: new PriceBook() }, target, {
    enabledActionIds: ACTIONS,
    prioritizeTargetProgress: true,
    searchIntent: 'PROVE',
    maxStates: 50_000,
    maxExpansionRounds: 16,
    maxWallTimeMs: 120_000,
  }).search(clean);
  return {
    cost: result.totalExpectedCostChaos,
    states: result.graphBuild.nodes.size,
    truncated: result.graphBuild.hitStateLimit || result.graphBuild.hitWallTimeLimit,
  };
}

describe('interchangeable junk mods', () => {
  it('gives the same expected cost as tracking every junk mod separately', () => {
    const merged = solve(true);
    const strict = solve(false);
    expect(merged.truncated).toBe(false);
    expect(strict.truncated).toBe(false);
    expect(Number.isFinite(strict.cost)).toBe(true);
    expect(merged.cost).toBeCloseTo(strict.cost, 6);
    expect(merged.states).toBeLessThan(strict.states / 5);
  }, 120_000);
});
