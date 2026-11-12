// Deliberately scoped calculations, not a general crafting probability engine.
export function normalizeExchangePrices(overviews) {
  const currency = overviews.find(row => row.type === 'Currency')?.data;
  const chaosPerDivine = currency?.lines.find(line => line.id === 'divine')?.primaryValue;
  if (currency?.core.primary !== 'chaos' || !Number.isFinite(chaosPerDivine) || chaosPerDivine <= 0) {
    throw new Error('A positive Divine quote in Chaos is required');
  }
  const prices = [];
  for (const { type, data } of overviews) {
    if (data.core.primary !== 'chaos') throw new Error(`Unsupported primary currency for ${type}`);
    for (const line of data.lines) {
      if (!Number.isFinite(line.primaryValue) || line.primaryValue <= 0) continue;
      prices.push({ type, id: line.id, chaos: line.primaryValue, divine: line.primaryValue / chaosPerDivine,
        volumePrimaryValue: line.volumePrimaryValue ?? null });
    }
  }
  return { chaosPerDivine, conversion: 'All Chaos quotes divided by the same direct Currency/divine quote; no inversion of core.rates.', prices };
}

export function orderedWeight(rows, tags) {
  if (!Array.isArray(rows)) throw new Error('Unknown weight table');
  const match = rows.find(row => row.tag === 'default' || tags.includes(row.tag));
  if (!match || !Number.isFinite(match.weight) || match.weight < 0) throw new Error('Missing or invalid matching weight');
  return match.weight;
}

export function elementalTierShare(modifiers, group, baseTags, itemLevel) {
  const family = modifiers.filter(mod => mod.sourcePool === 'normal' && mod.generationType === 'prefix'
    && mod.groups.includes(group) && mod.requiredItemLevel <= itemLevel);
  if (!family.length) throw new Error(`Missing family ${group}`);
  const shape = mod => JSON.stringify([mod.groups, mod.tags, mod.addsTags, mod.generationWeights]);
  if (family.some(mod => shape(mod) !== shape(family[0]))) throw new Error(`Tier-dependent mechanics in ${group}`);
  const tiers = family.map(mod => ({ recordId: mod.recordId, name: mod.name, tier: mod.tier,
    weight: orderedWeight(mod.spawnWeights, baseTags) * orderedWeight(mod.generationWeights, baseTags) / 100 }));
  const totalWeight = tiers.reduce((sum, tier) => sum + tier.weight, 0);
  const targetWeight = tiers.filter(tier => tier.tier === 1).reduce((sum, tier) => sum + tier.weight, 0);
  if (totalWeight <= 0 || targetWeight <= 0) throw new Error(`No eligible T1 in ${group}`);
  return { group, totalWeight, targetWeight, conditionalT1Probability: targetWeight / totalWeight, tiers };
}

export function repeatedAttemptBound(probabilityUpperBound, attemptCostDivine, budgetDivine) {
  if (!(probabilityUpperBound > 0 && probabilityUpperBound <= 1) || !(attemptCostDivine > 0)
    || !Number.isFinite(attemptCostDivine) || !Number.isFinite(budgetDivine) || budgetDivine < 0) throw new Error('Invalid bound inputs');
  const attemptsWithinBudget = Math.floor(budgetDivine / attemptCostDivine);
  return { probabilityUpperBound, expectedAttemptsLowerBound: 1 / probabilityUpperBound,
    expectedCostDivineLowerBound: attemptCostDivine / probabilityUpperBound, attemptsWithinBudget,
    successWithinBudgetUpperBound: attemptsWithinBudget === 0 ? 0
      : probabilityUpperBound === 1 ? 1 : -Math.expm1(attemptsWithinBudget * Math.log1p(-probabilityUpperBound)) };
}

export function emptyItemSidePool(modifiers, side) {
  const rows = modifiers.filter(mod => mod.generation_type === side && mod.adjustedWeight > 0);
  const totalWeight = rows.reduce((sum, mod) => sum + mod.adjustedWeight, 0);
  if (!rows.length || !(totalWeight > 0)) throw new Error(`Empty ${side} pool`);
  return { side, totalWeight, modifiers: rows };
}

export function targetSideShares(modifiers, targetModIds) {
  const result = {};
  for (const side of ['prefix', 'suffix']) {
    const pool = emptyItemSidePool(modifiers, side);
    result[side] = targetModIds.flatMap(modId => {
      const mod = pool.modifiers.find(row => row.modId === modId);
      if (!mod) return [];
      return [{ modId, name: mod.name, adjustedWeight: mod.adjustedWeight, sideShare: mod.adjustedWeight / pool.totalWeight }];
    });
  }
  const found = [...result.prefix, ...result.suffix];
  if (found.length !== targetModIds.length) throw new Error('One or more target IDs are missing from empty-item pools');
  return result;
}

// Exact coupon-collector expectation under the stated magic-roll model.
export function expectedMagicRollsToCollect(prefixShares, suffixShares, singleAffixProbability) {
  if (!(singleAffixProbability >= 0 && singleAffixProbability <= 1)) throw new Error('Invalid single-affix probability');
  if (prefixShares.length + suffixShares.length > 20 || [...prefixShares, ...suffixShares].some(p => !(p > 0 && p <= 1))
    || prefixShares.reduce((a, b) => a + b, 0) > 1 || suffixShares.reduce((a, b) => a + b, 0) > 1) throw new Error('Invalid target shares');
  const prefixOffset = 0;
  const suffixOffset = prefixShares.length;
  const allMask = (1 << (prefixShares.length + suffixShares.length)) - 1;
  const expectation = new Array(allMask + 1).fill(0);
  const sideOutcomes = (shares, offset) => [
    { bit: 0, probability: 1 - shares.reduce((sum, p) => sum + p, 0) },
    ...shares.map((probability, index) => ({ bit: 1 << (offset + index), probability })),
  ];
  const prefixes = sideOutcomes(prefixShares, prefixOffset);
  const suffixes = sideOutcomes(suffixShares, suffixOffset);
  for (let mask = allMask - 1; mask >= 0; mask--) {
    const transitions = new Map();
    const add = (next, probability) => transitions.set(next, (transitions.get(next) ?? 0) + probability);
    for (const outcome of prefixes) add(mask | outcome.bit, singleAffixProbability * 0.5 * outcome.probability);
    for (const outcome of suffixes) add(mask | outcome.bit, singleAffixProbability * 0.5 * outcome.probability);
    for (const prefix of prefixes) for (const suffix of suffixes) {
      add(mask | prefix.bit | suffix.bit, (1 - singleAffixProbability) * prefix.probability * suffix.probability);
    }
    const stay = transitions.get(mask) ?? 0;
    if (!(stay < 1)) throw new Error('Target collection cannot progress');
    let numerator = 1;
    for (const [next, probability] of transitions) if (next !== mask) numerator += probability * expectation[next];
    expectation[mask] = numerator / (1 - stay);
  }
  return expectation[0];
}

export function noSalvageTwoByTwoRoute(pairCosts, pairSuccess, intermediateSuccess, finalSuccess,
  recombinationActionCost = 0) {
  if (pairCosts.length !== 3 || pairCosts.some(cost => !(cost > 0)) || !(pairSuccess > 0 && pairSuccess <= 1)
    || !(intermediateSuccess > 0 && intermediateSuccess <= 1)
    || !(finalSuccess > 0 && finalSuccess <= 1) || !(recombinationActionCost >= 0)) {
    throw new Error('Invalid no-salvage route inputs');
  }
  const sorted = [...pairCosts].sort((a, b) => a - b);
  const onePrefixOneSuffix = sorted.map(cost => (cost + recombinationActionCost) / pairSuccess);
  const onePrefixOneSuffixAttempts = sorted.map(() => 1 / pairSuccess);
  const twoPrefixTwoSuffix = [
    (onePrefixOneSuffix[0] + onePrefixOneSuffix[1] + recombinationActionCost) / intermediateSuccess,
    (onePrefixOneSuffix[0] + onePrefixOneSuffix[2] + recombinationActionCost) / intermediateSuccess,
  ];
  const twoPrefixTwoSuffixAttempts = [
    (onePrefixOneSuffixAttempts[0] + onePrefixOneSuffixAttempts[1] + 1) / intermediateSuccess,
    (onePrefixOneSuffixAttempts[0] + onePrefixOneSuffixAttempts[2] + 1) / intermediateSuccess,
  ];
  const finalExpectedCost = (twoPrefixTwoSuffix[0] + twoPrefixTwoSuffix[1] + recombinationActionCost) / finalSuccess;
  const finalExpectedRecombinationAttempts = (twoPrefixTwoSuffixAttempts[0]
    + twoPrefixTwoSuffixAttempts[1] + 1) / finalSuccess;
  return { overlapPairInputCost: sorted[0], onePrefixOneSuffix, twoPrefixTwoSuffix,
    recombinationActionCost, onePrefixOneSuffixAttempts, twoPrefixTwoSuffixAttempts,
    finalExpectedRecombinationAttempts, finalExpectedCost,
    finalExpectedInputCost: finalExpectedCost };
}

export function atLeastAffixCountProbability(kernel, totalInputAffixes, requiredOutputAffixes) {
  const row = kernel?.byTotalInputAffixes?.[String(totalInputAffixes)];
  if (!row || !Number.isInteger(requiredOutputAffixes) || requiredOutputAffixes < 0) {
    throw new Error('Invalid recombination count-kernel inputs');
  }
  const probability = Object.entries(row).reduce((sum, [count, value]) => {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('Invalid recombination count probability');
    return Number(count) >= requiredOutputAffixes ? sum + value : sum;
  }, 0);
  if (!(probability > 0 && probability <= 1.01)) throw new Error('Required recombination outcome is unavailable');
  return probability;
}

export function independentAffixCountSuccess(kernel, topology) {
  const prefix = atLeastAffixCountProbability(kernel, topology.totalInputPrefixes, topology.requiredPrefixes);
  const suffix = atLeastAffixCountProbability(kernel, topology.totalInputSuffixes, topology.requiredSuffixes);
  return { prefix, suffix, combined: prefix * suffix };
}

export function optimalAllflameEnchantCost({ totalOutcomes, acceptedOutcomes, previewCount, addedIntangibility,
  normalAttemptCost, sulphurCost, startIntangibility = 0 }) {
  if (!Number.isInteger(totalOutcomes) || !Number.isInteger(acceptedOutcomes) || acceptedOutcomes <= 0
    || acceptedOutcomes > totalOutcomes || !Number.isInteger(previewCount) || previewCount < 1
    || !Array.isArray(addedIntangibility) || addedIntangibility.length !== 2
    || addedIntangibility.some(value => !Number.isInteger(value) || value < 1)
    || addedIntangibility[0] > addedIntangibility[1] || !(normalAttemptCost > 0) || !(sulphurCost >= 0)
    || !Number.isInteger(startIntangibility) || startIntangibility < 0 || startIntangibility > 100) {
    throw new Error('Invalid Allflame enchant inputs');
  }
  const singleSuccess = acceptedOutcomes / totalOutcomes;
  const previewSuccess = 1 - (1 - singleSuccess) ** previewCount;
  const normalExpectedCost = normalAttemptCost / singleSuccess;
  const expectedCost = new Array(101).fill(normalExpectedCost);
  const action = new Array(101).fill('normal');
  const increments = Array.from({ length: addedIntangibility[1] - addedIntangibility[0] + 1 },
    (_, index) => addedIntangibility[0] + index);
  for (let intangibility = 99; intangibility >= 0; intangibility--) {
    const success = intangibility / 100 * singleSuccess + (1 - intangibility / 100) * previewSuccess;
    const next = increments.reduce((sum, increment) => sum + expectedCost[Math.min(100, intangibility + increment)], 0)
      / increments.length;
    const allflameExpectedCost = normalAttemptCost + sulphurCost + (1 - success) * next;
    if (allflameExpectedCost < normalExpectedCost) {
      expectedCost[intangibility] = allflameExpectedCost;
      action[intangibility] = 'allflame';
    }
  }
  return { singleSuccess, previewSuccess, normalExpectedCost, startIntangibility,
    optimalExpectedCost: expectedCost[startIntangibility], actionAtStart: action[startIntangibility],
    highestIntangibilityForAllflame: action.reduce((highest, value, index) => value === 'allflame' ? index : highest, null) };
}
