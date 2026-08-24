import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { getAllAffixes } from '../src/domain/ItemState.ts';
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
const maxStates = Number(process.argv[3] ?? 20000);
const rounds = Number(process.argv[4] ?? 16);
const target = buildAcquisitionTargetDefinition({ fracturedMod: { modId } });
const engine = new GenericSearchEngine({ pool, priceBook, target }, target, {
  enabledActionIds: ['transmutation_orb','alteration_orb','augmentation_orb','regal_orb','exalted_orb','annulment_orb','scouring_orb','fracturing_orb','restart_reacquire'],
  prioritizeTargetProgress: true,
  searchIntent: 'RECOMMEND',
  maxStates, maxExpansionRounds: rounds, maxWallTimeMs: 240000,
  restartReacquire: { destination: clean, acquisitionCostChaos: 10, confidence: 'research-fallback', provenance: 'probe' },
});
const result = engine.search(clean);
const nodes = result.graphBuild.nodes;
console.log('nodes', nodes.size, 'terminals', result.graphBuild.terminalStatesFound);
console.log('byRarity', result.graphBuild.stateCountsByRarity);
console.log('byAffixes', result.graphBuild.stateCountsByAffixes);

const startKey = getCanonicalStateKey(clean, target);
const start = nodes.get(startKey)!;
for (const [id, e] of start.actions) {
  const exp = e.transitions.filter((t) => nodes.has(t.targetKey)).length;
  console.log(`start ${id}: transitions=${e.transitions.length} expanded=${exp} resolved=${e.isDirectlyResolved}`);
}

const V = new Map<string, number>();
for (const [k, n] of nodes) V.set(k, n.isTerminal ? 0 : Infinity);
for (let i = 0; i < 3000; i++) {
  let changed = false;
  for (const [k, n] of nodes) {
    if (n.isTerminal) continue;
    let best = Infinity;
    for (const a of n.actions.values()) {
      if (!a.isDirectlyResolved) continue;
      let c = 0;
      for (const t of a.transitions) c += t.probability * (V.get(t.targetKey) ?? Infinity);
      const q = a.immediateCostChaos + c;
      if (q < best) best = q;
    }
    const prev = V.get(k)!;
    if (Math.abs(best - prev) > 1e-9 && !(best === Infinity && prev === Infinity)) changed = true;
    V.set(k, best);
  }
  if (!changed) { console.log('converged sweep', i + 1); break; }
}
let finite = 0;
for (const v of V.values()) if (Number.isFinite(v)) finite++;
console.log('finite V nodes', finite, '/', nodes.size, ' V(start)=', V.get(startKey));

const describe = (s: ItemState): string =>
  `${s.rarity}[${getAllAffixes(s).map((m) => `${m.isFractured ? '*' : ''}${m.modId}`).join('+')}]`;
const finiteNodes = [...V.entries()].filter(([, v]) => Number.isFinite(v))
  .sort((a, b) => a[1] - b[1]).slice(0, 15);
for (const [k, v] of finiteNodes) console.log(`  V=${v.toFixed(3)} ${describe(nodes.get(k)!.state)}`);

const klass: Record<string, number> = {};
for (const n of nodes.values()) {
  const affixes = getAllAffixes(n.state);
  const has = affixes.some((m) => m.modId === modId && !m.isFractured);
  const frac = affixes.some((m) => m.modId === modId && m.isFractured);
  const other = affixes.some((m) => m.isFractured && m.modId !== modId);
  const tag = `${n.state.rarity}/${affixes.length}aff/${frac ? 'FRACTARGET' : other ? 'FRACWRONG' : has ? 'hasTarget' : 'none'}`;
  klass[tag] = (klass[tag] ?? 0) + 1;
}
console.log('expanded classification:');
for (const [k, v] of Object.entries(klass).sort((a, b) => b[1] - a[1])) console.log(`   ${k}: ${v}`);

// Which actions carry resolved edges anywhere?
const resolvedByAction: Record<string, number> = {};
const totalByAction: Record<string, number> = {};
for (const n of nodes.values()) {
  for (const [id, a] of n.actions) {
    totalByAction[id] = (totalByAction[id] ?? 0) + 1;
    if (a.isDirectlyResolved) resolvedByAction[id] = (resolvedByAction[id] ?? 0) + 1;
  }
}
for (const id of Object.keys(totalByAction)) {
  console.log(`  edge ${id}: ${resolvedByAction[id] ?? 0}/${totalByAction[id]} resolved`);
}
