import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { allSuffixProbability, cleanupBeforeProtectedMod, previewTargetProbability,
  restartWithSalvage } from '../lib/equipment-route-analysis.mjs';

test('suffix-only generation accounts for blocked groups and changing denominators', () => {
  const rows = [
    { generation_type: 'prefix', adjustedWeight: 10, groups: ['blocked'] },
    { generation_type: 'prefix', adjustedWeight: 10, groups: ['open-prefix'] },
    { generation_type: 'suffix', adjustedWeight: 10, groups: ['a'] },
    { generation_type: 'suffix', adjustedWeight: 10, groups: ['b'] },
  ];
  assert.equal(allSuffixProbability(rows, 1, ['blocked']), 2 / 3);
  assert.equal(allSuffixProbability(rows, 2, ['blocked']), 1 / 3);
});

test('annulling two suffixes before one vulnerable prefix succeeds one third of the time', () => {
  const result = cleanupBeforeProtectedMod({ unwantedCount: 2, removalCost: 0.1 });
  assert.equal(result.successProbability, 1 / 3);
  assert.equal(result.expectedRemovalsPerGeneratedItem, 5 / 3);
});

test('three previews of four targets retain both preview interpretations', () => {
  assert.deepEqual(previewTargetProbability(4, 3), {
    distinctWithoutReplacement: 0.75,
    independentWithReplacement: 0.578125,
  });
});

test('restart calculation credits unconditional salvage', () => {
  assert.equal(restartWithSalvage({ attemptInputCost: 4, attemptActionCost: 1,
    successProbability: 0.5, unconditionalSalvageValue: 1 }), 8);
});

test('saved bow route prices recombination dust and tracks Gold separately', async () => {
  const root = new URL('../../docs/crafting-engine/references/', import.meta.url);
  const analysis = JSON.parse(await readFile(new URL('requests/miracle-stinger-analysis.json', root), 'utf8'));
  assert.equal(analysis.recombinationAttemptCost.chaos, 30);
  assert.equal(analysis.recombinationAttemptCost.gold, 10000);
  assert.equal(analysis.recombinationAttemptCost.thaumaturgicDust, 180000);
  assert.equal(analysis.recombinationAttemptCost.divine, 30 / 367.6);
  for (const scenario of analysis.route.conditionalScenarios) {
    assert.equal(scenario.finalAssembly.recombinationAttemptCost.policyId,
      'allflame-flat-recombination-cost-2026-09-21');
    assert.ok(scenario.suffixPiece.expectedRecombinationAttempts > 1);
  }
});
