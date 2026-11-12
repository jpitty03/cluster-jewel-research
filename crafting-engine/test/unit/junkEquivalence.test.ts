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

// A fractured junk mod stays interchangeable with its class-mates: whichever member was
// fractured blocks an identically shaped slice of the pool. Keying it by its own group left
// the graph with a state only for the representative the merged parent happened to carry,
// and a simulated craft that fractured another member fell out of the graph.
describe('fractured junk state identity', () => {
  it('gives class-mates one state and keeps fractured apart from loose junk', async () => {
    const { getCanonicalStateKey } = await import('../../src/rules/actionDiscovery.ts');
    const { toRolledMod } = await import('../../src/domain/Mod.ts');
    const pool = ModPool.forCluster(new ClusterModRepository(), BASE, CLUSTER);
    const notable = pool.getPrefixes().find((mod) => mod.isNotable)!;
    const target: TargetDefinition = { requiredMods: [{ modId: notable.modId }] };
    const bySignature = new Map<string, ReturnType<typeof pool.getSuffixes>>();
    for (const mod of pool.getSuffixes()) {
      const signature = mod.exclusionClass?.signature;
      if (!signature) continue;
      bySignature.set(signature, [...(bySignature.get(signature) ?? []), mod]);
    }
    const classMates = [...bySignature.values()]
      .map((mods) => mods.filter((mod, index, all) =>
        all.findIndex((other) => other.modGroup === mod.modGroup) === index))
      .find((mods) => mods.length >= 2);
    expect(classMates, 'pool has two junk suffix groups in one exclusion class').toBeDefined();
    const [first, second] = classMates!;
    const stateWith = (mod: typeof first, isFractured: boolean): ItemState => ({
      baseType: BASE,
      clusterType: CLUSTER,
      itemLevel: 84,
      passiveCount: 3,
      rarity: 'rare',
      prefixes: [],
      suffixes: [toRolledMod(mod, { isFractured })],
      fracturedModIds: isFractured ? [mod.modId] : [],
    });
    const key = (mod: typeof first, isFractured: boolean) =>
      getCanonicalStateKey(stateWith(mod, isFractured), target);
    expect(key(first, true)).toBe(key(second, true));
    expect(key(first, false)).toBe(key(second, false));
    expect(key(first, true)).not.toBe(key(first, false));
  });
});
