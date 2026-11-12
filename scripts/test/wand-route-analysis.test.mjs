import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeExchangePrices, orderedWeight, elementalTierShare, repeatedAttemptBound,
  targetSideShares, expectedMagicRollsToCollect, noSalvageTwoByTwoRoute,
  atLeastAffixCountProbability, independentAffixCountSuccess, optimalAllflameEnchantCost } from '../lib/wand-route-analysis.mjs';

test('price units: direct Divine quote, missing prices and unsupported units', () => {
  const fixture = [{ type: 'Currency', data: { core: { primary: 'chaos', rates: { divine: 0.0025 } }, lines: [{ id: 'divine', primaryValue: 400 }] } },
    { type: 'Fossil', data: { core: { primary: 'chaos' }, lines: [{ id: 'example', primaryValue: 20 }, { id: 'unknown', primaryValue: null }] } }];
  const result = normalizeExchangePrices(fixture);
  assert.equal(result.prices[0].divine, 1);
  assert.equal(result.prices[1].divine, 0.05);
  assert.equal(result.prices.length, 2);
  assert.throws(() => normalizeExchangePrices([]));
  fixture[1].data.core.primary = 'divine';
  assert.throws(() => normalizeExchangePrices(fixture));
});

test('ordered zero exclusions win; absent weights fail closed', () => {
  assert.equal(orderedWeight([{ tag: 'blocked', weight: 0 }, { tag: 'wand', weight: 45 }], ['blocked', 'wand']), 0);
  assert.throws(() => orderedWeight(null, ['wand']));
  assert.throws(() => orderedWeight([{ tag: 'sword', weight: 10 }], ['wand']));
});

test('saved Kinetic elemental families have invariant tier tags and 45/4120 T1 shares', async () => {
  const root = new URL('../../docs/crafting-engine/references/snapshots/poedb-wands-2026-09-06/', import.meta.url);
  const { modifiers } = JSON.parse(await readFile(new URL('modifiers.json', root), 'utf8'));
  const { bases } = JSON.parse(await readFile(new URL('base-types.json', root), 'utf8'));
  for (const group of ['FireDamage', 'ColdDamage', 'LightningDamage']) {
    const family = elementalTierShare(modifiers, group, bases[0].datatableTags, 85);
    assert.equal(family.totalWeight, 4120);
    assert.equal(family.targetWeight, 45);
    assert.equal(family.tiers.length, 10);
    assert.throws(() => elementalTierShare(modifiers, group, bases[0].datatableTags, 81), /No eligible T1/);
  }
  const changed = structuredClone(modifiers);
  changed.find(mod => mod.name === 'Carbonising' && mod.sourcePool === 'normal').tags.push('tier_specific');
  assert.throws(() => elementalTierShare(changed, 'FireDamage', bases[0].datatableTags, 85), /Tier-dependent/);
});

test('repeat bounds agree with an independently enumerated two-try example', () => {
  const bound = repeatedAttemptBound(0.25, 2, 4);
  assert.equal(bound.expectedCostDivineLowerBound, 8);
  assert.equal(bound.attemptsWithinBudget, 2);
  assert.ok(Math.abs(bound.successWithinBudgetUpperBound - (0.25 + 0.75 * 0.25)) < 1e-12);
  assert.equal(repeatedAttemptBound(1, 2, 1).successWithinBudgetUpperBound, 0);
  assert.equal(repeatedAttemptBound(1, 2, 2).successWithinBudgetUpperBound, 1);
  assert.throws(() => repeatedAttemptBound(0, 2, 4));
});

test('magic target collector handles guaranteed two-affix and one-affix coupon cases', () => {
  assert.equal(expectedMagicRollsToCollect([1], [1], 0), 1);
  assert.equal(expectedMagicRollsToCollect([1], [1], 1), 3);
  assert.throws(() => expectedMagicRollsToCollect([0], [1], 0.5));
  assert.throws(() => expectedMagicRollsToCollect([0.6, 0.5], [1], 0.5));
});

test('RePoE Kinetic pools resolve canonical target IDs and weights', async () => {
  const path = new URL('../../docs/crafting-engine/references/snapshots/repoe-wands-2026-09-06/kinetic-wand.json', import.meta.url);
  const data = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(data.gameVersion, '3.29.3.3');
  assert.equal(data.ordinary.filter(mod => mod.generation_type === 'prefix').reduce((sum, mod) => sum + mod.adjustedWeight, 0), 47566);
  assert.equal(data.ordinary.filter(mod => mod.generation_type === 'suffix').reduce((sum, mod) => sum + mod.adjustedWeight, 0), 64842);
  const shares = targetSideShares(data.ordinary, data.targetRecords.map(target => target.modId));
  assert.deepEqual(shares.prefix.map(target => target.adjustedWeight), [45, 45, 45]);
  assert.deepEqual(shares.suffix.map(target => target.adjustedWeight), [500, 1000, 1000]);
  assert.equal(data.targetRecords.find(target => target.modId === 'LocalCriticalMultiplier6').generation_weights.length, 0);
  assert.equal(data.targetRecords.find(target => target.modId === 'LocalCriticalMultiplier6').generationPercent, 100);
});

test('no-salvage topology repeats its cheapest pair and applies each stage rate', () => {
  const route = noSalvageTwoByTwoRoute([3, 1, 2], 0.5, 0.25, 0.1);
  assert.deepEqual(route.onePrefixOneSuffix, [2, 4, 6]);
  assert.deepEqual(route.twoPrefixTwoSuffix, [24, 32]);
  assert.equal(route.finalExpectedInputCost, 560);
  const priced = noSalvageTwoByTwoRoute([3, 1, 2], 0.5, 0.25, 0.1, 0.25);
  assert.deepEqual(priced.onePrefixOneSuffix, [2.5, 4.5, 6.5]);
  assert.deepEqual(priced.twoPrefixTwoSuffix, [29, 37]);
  assert.equal(priced.finalExpectedRecombinationAttempts, 410);
  assert.equal(priced.finalExpectedCost, 662.5);
  assert.equal(priced.finalExpectedCost - route.finalExpectedCost,
    priced.finalExpectedRecombinationAttempts * priced.recombinationActionCost);
  assert.throws(() => noSalvageTwoByTwoRoute([1, 2], 0.5, 0.25, 0.1));
});

test('published count kernel reproduces ordinary and Brinehook-padded final rates', async () => {
  const path = new URL('../../docs/crafting-engine/references/requests/recombination-guide-baseline.json', import.meta.url);
  const { affixCountKernel: kernel } = JSON.parse(await readFile(path, 'utf8'));
  assert.ok(Math.abs(atLeastAffixCountProbability(kernel, 4, 2) - 0.9) < 1e-12);
  assert.deepEqual(independentAffixCountSuccess(kernel, {
    totalInputPrefixes: 4, requiredPrefixes: 3, totalInputSuffixes: 4, requiredSuffixes: 3,
  }), { prefix: 0.31, suffix: 0.31, combined: 0.0961 });
  assert.deepEqual(independentAffixCountSuccess(kernel, {
    totalInputPrefixes: 4, requiredPrefixes: 3, totalInputSuffixes: 6, requiredSuffixes: 3,
  }), { prefix: 0.31, suffix: 0.72, combined: 0.22319999999999998 });
});

test('Allflame enchant policy prices preview decay and switches to ordinary crafting', () => {
  const result = optimalAllflameEnchantCost({ totalOutcomes: 181, acceptedOutcomes: 5, previewCount: 3,
    addedIntangibility: [5, 8], normalAttemptCost: 760.4 / 408.8, sulphurCost: 12200 * 0.01351 / 408.8,
    startIntangibility: 16 });
  assert.ok(Math.abs(result.singleSuccess - 5 / 181) < 1e-12);
  assert.ok(Math.abs(result.optimalExpectedCost - 54.52025748089443) < 1e-10);
  assert.equal(result.highestIntangibilityForAllflame, 88);
  assert.equal(optimalAllflameEnchantCost({ totalOutcomes: 1, acceptedOutcomes: 1, previewCount: 3,
    addedIntangibility: [5, 8], normalAttemptCost: 2, sulphurCost: 1 }).actionAtStart, 'normal');
});
