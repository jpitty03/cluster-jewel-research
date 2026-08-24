import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { GenericSearchEngine } from '../src/solver/genericSearch.ts';
import { buildAcquisitionTargetDefinition } from '../src/solver/acquisitionSynthesis.ts';
import { getCanonicalStateKey } from '../src/rules/actionDiscovery.ts';

const repo = new ClusterModRepository();
const CLUSTER = '12% increased Attack Damage while holding a Shield';
const pool = ModPool.forCluster(repo, 'Large Cluster Jewel', CLUSTER);
const priceBook = new PriceBook();
const clean: ItemState = {
  baseType: 'Large Cluster Jewel', clusterType: CLUSTER, itemLevel: 84, passiveCount: 12,
  rarity: 'normal', prefixes: [], suffixes: [], fracturedModIds: [],
};
const modId = process.argv[2] ?? 'AfflictionJewelSmallPassivesGrantInt3';
const maxStates = Number(process.argv[3] ?? 4000);
const target = buildAcquisitionTargetDefinition({ fracturedMod: { modId } });
const engine = new GenericSearchEngine({ pool, priceBook, target }, target, {
  enabledActionIds: ['transmutation_orb','alteration_orb','augmentation_orb','regal_orb','exalted_orb','annulment_orb','scouring_orb','fracturing_orb','restart_reacquire'],
  prioritizeTargetProgress: true,
  searchIntent: 'RECOMMEND',
  restartReacquire: { destination: clean, acquisitionCostChaos: 10, confidence: 'research-fallback', provenance: 'probe' },
});
const graph = engine.buildGraph(clean, maxStates, undefined, Date.now() + 240000, undefined, 'RECOMMEND');
console.log('nodes', graph.nodes.size, 'terminals', graph.terminalStatesFound);
const startKey = getCanonicalStateKey(clean, target);
const startNode = graph.nodes.get(startKey)!;
for (const [id, edge] of startNode.actions) {
  const total = edge.transitions.length;
  const expanded = edge.transitions.filter((t) => graph.nodes.has(t.targetKey)).length;
  console.log(`  start action ${id}: transitions=${total} expandedSuccessors=${expanded} directlyResolved=${edge.isDirectlyResolved}`);
}
let resolvedNodes = 0;
for (const node of graph.nodes.values()) {
  if ([...node.actions.values()].some((e) => e.isDirectlyResolved) || node.isTerminal) resolvedNodes++;
}
console.log('nodes with >=1 directly resolved action or terminal:', resolvedNodes, '/', graph.nodes.size);
console.log('byRarity', graph.stateCountsByRarity, 'byAffixes', graph.stateCountsByAffixes);
