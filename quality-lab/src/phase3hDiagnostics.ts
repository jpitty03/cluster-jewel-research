import assert from 'node:assert/strict';
import type { TargetDefinition } from '../../crafting-engine/src/domain/TargetDefinition.ts';
import {
  decodeCraftFromUrl,
  encodeCraftToUrl,
  generateBugReportBundle,
  type CraftSharePayload,
} from '../../crafting-engine/src/service/shareBundle.ts';
import type { OptimizerSeed } from '../../src/optimizerSeed.ts';
import {
  attachClusterHandoff,
  detachedSaleValue,
  detachClusterHandoff,
  handoffIdentitySnapshot,
  hydratedSaleValue,
} from '../../src/optimizerHandoff.ts';

const REQUIRED_IDS = [
  'AfflictionJewelSmallPassivesGrantES3',
  'AfflictionJewelSmallPassivesGrantInt3',
  'AfflictionJewelSmallPassivesHaveIncreasedEffect2',
];
const ACCEPTABLE_IDS = [
  'AfflictionJewelSmallPassivesGrantAttributes3',
  'AfflictionJewelSmallPassivesGrantStr3_',
  'Added Small Passive Skills also grant: #% increased Cast Speed_T1',
];

export function runPhase3HHandoffDiagnostics() {
  const target: TargetDefinition = {
    requiredMods: REQUIRED_IDS.map((modId) => ({ modId })),
    acceptableAnyOf: ACCEPTABLE_IDS.map((modId) => [{ modId }]),
    requiredRarity: 'rare',
  };
  const seed: OptimizerSeed = {
    id: 'phase3h-diagnostic-seed-1',
    source: 'CLUSTER_JEWELS',
    league: 'Mercenaries',
    baseType: 'Large Cluster Jewel',
    clusterType: '10% increased Spell Damage',
    passiveCount: 12,
    passiveRange: { min: 12, max: 12 },
    itemLevel: 84,
    itemLevelDefaulted: false,
    targetModIds: [...REQUIRED_IDS],
    sourceComboLabel: 'Phase 3H exact target',
    sourceMarketValue: {
      chaos: 3416,
      kind: 'LOW',
      quotedAt: '2026-08-28T00:00:00.000Z',
      passiveRange: { min: 12, max: 12 },
      provenance: 'Phase 3H deterministic source quote',
    },
  };
  const baseline = handoffIdentitySnapshot({
    baseType: seed.baseType,
    clusterType: seed.clusterType,
    itemLevel: seed.itemLevel,
    passiveCount: seed.passiveCount!,
    league: seed.league,
    target,
  });
  const attached = attachClusterHandoff(seed, baseline);
  assert.equal(attached.status, 'attached');
  assert.equal(attached.seed.sourceMarketValue?.chaos, 3416);

  const detached = detachClusterHandoff();
  assert.equal(detached.status, 'none');
  assert.equal(detachClusterHandoff().status, 'none', 'Detachment must be idempotent');
  const reattached = attachClusterHandoff({ ...seed, id: 'phase3h-diagnostic-seed-2' }, baseline);
  assert.equal(reattached.status, 'attached');
  assert.notEqual(reattached.seed.id, seed.id, 'Only a new explicit seed may attach');

  assert.deepEqual(detachedSaleValue('3416', 'cluster-source'), {
    value: '', provenance: 'empty',
  });
  assert.deepEqual(detachedSaleValue('3416', 'user'), {
    value: '3416', provenance: 'user',
  });
  assert.equal(hydratedSaleValue(3416, true), 'cluster-source');
  assert.equal(hydratedSaleValue(3416, true, 'user'), 'user');
  assert.equal(hydratedSaleValue(3416, false), 'user');

  const detachedPayload: CraftSharePayload = {
    version: '3H.1',
    baseType: seed.baseType,
    clusterType: seed.clusterType,
    itemLevel: seed.itemLevel,
    passiveCount: seed.passiveCount,
    targetMods: [...REQUIRED_IDS],
    acceptableAnyOf: ACCEPTABLE_IDS.map((modId) => [{ modId }]),
    finalRarity: 'rare',
    expectedSaleValueChaos: 3416,
    saleValueProvenance: 'user',
  };
  const decodedDetached = decodeCraftFromUrl(encodeCraftToUrl(detachedPayload));
  assert(decodedDetached);
  assert.equal(decodedDetached.sourceContext, undefined);
  assert.equal(decodedDetached.saleValueProvenance, 'user');
  const detachedBug = generateBugReportBundle(decodedDetached, undefined, '3H.1');
  assert.equal(detachedBug.configuration.sourceContext, undefined);
  assert.equal(JSON.stringify(detachedBug).includes('CLUSTER_JEWELS'), false);

  const invalidDetachedSourceValue = decodeCraftFromUrl(encodeCraftToUrl({
    ...detachedPayload,
    saleValueProvenance: 'cluster-source',
  }));
  assert.equal(invalidDetachedSourceValue, null,
    'Cluster-source sale provenance without attached context must fail closed');

  return {
    H1: { attached: true, sourceQuoteChaos: attached.seed.sourceMarketValue?.chaos },
    H6: { detachedIsAbsorbing: true, explicitNewSeedReattaches: true },
    H7: {
      shareVersion: decodedDetached.version,
      sourceContextOmitted: decodedDetached.sourceContext === undefined,
      bugReportSourceOmitted: detachedBug.configuration.sourceContext === undefined,
    },
    H8: {
      sourceValueAfterDetach: detachedSaleValue('3416', 'cluster-source'),
      equalManualValueAfterDetach: detachedSaleValue('3416', 'user'),
    },
    H12: {
      requiredIds: REQUIRED_IDS,
      acceptableIds: ACCEPTABLE_IDS,
      targetFingerprint: baseline.targetFingerprint,
    },
  };
}
