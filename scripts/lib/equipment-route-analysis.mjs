export function weightedSelections(rows, count, blockedGroups = []) {
  if (!Number.isInteger(count) || count < 0) throw new Error('Invalid selection count');
  const blocked = new Set(blockedGroups);
  const visit = (remaining, depth, groups) => {
    if (depth === count) return 1;
    const eligible = remaining.filter(row => row.adjustedWeight > 0
      && !(row.groups ?? []).some(group => groups.has(group)));
    const total = eligible.reduce((sum, row) => sum + row.adjustedWeight, 0);
    if (!(total > 0)) return 0;
    let probability = 0;
    for (const row of eligible) {
      const nextGroups = new Set(groups);
      for (const group of row.groups ?? []) nextGroups.add(group);
      probability += row.adjustedWeight / total
        * visit(remaining, depth + 1, nextGroups);
    }
    return probability;
  };
  return visit(rows, 0, blocked);
}

export function allSuffixProbability(modifiers, additionalAffixes, fixedGroups = []) {
  const prefixes = modifiers.filter(row => row.generation_type === 'prefix');
  const suffixes = modifiers.filter(row => row.generation_type === 'suffix');
  const blocked = new Set(fixedGroups);
  const visit = (depth, groups) => {
    if (depth === additionalAffixes) return 1;
    const eligiblePrefixes = prefixes.filter(row => row.adjustedWeight > 0
      && !(row.groups ?? []).some(group => groups.has(group)));
    const eligibleSuffixes = suffixes.filter(row => row.adjustedWeight > 0
      && !(row.groups ?? []).some(group => groups.has(group)));
    const prefixWeight = eligiblePrefixes.reduce((sum, row) => sum + row.adjustedWeight, 0);
    const suffixWeight = eligibleSuffixes.reduce((sum, row) => sum + row.adjustedWeight, 0);
    const total = prefixWeight + suffixWeight;
    if (!(total > 0)) return 0;
    let probability = 0;
    for (const row of eligibleSuffixes) {
      const nextGroups = new Set(groups);
      for (const group of row.groups ?? []) nextGroups.add(group);
      probability += row.adjustedWeight / total * visit(depth + 1, nextGroups);
    }
    return probability;
  };
  return visit(0, blocked);
}

export function cleanupBeforeProtectedMod({ unwantedCount, removalCost }) {
  if (!Number.isInteger(unwantedCount) || unwantedCount < 1 || !(removalCost >= 0)) {
    throw new Error('Invalid cleanup inputs');
  }
  return {
    successProbability: 1 / (unwantedCount + 1),
    expectedRemovalsPerGeneratedItem: unwantedCount * (unwantedCount + 3) / (2 * (unwantedCount + 1)),
    removalCost,
  };
}

export function previewTargetProbability(targets, outcomes) {
  if (!Number.isInteger(targets) || targets < 1 || !Number.isInteger(outcomes) || outcomes < 1
    || outcomes > targets) throw new Error('Invalid preview inputs');
  return {
    distinctWithoutReplacement: outcomes / targets,
    independentWithReplacement: 1 - (1 - 1 / targets) ** outcomes,
  };
}

export function restartWithSalvage({ attemptInputCost, attemptActionCost, successProbability,
  unconditionalSalvageValue }) {
  if (!(attemptInputCost >= 0) || !(attemptActionCost >= 0)
    || !(successProbability > 0 && successProbability <= 1)
    || !(unconditionalSalvageValue >= 0)
    || unconditionalSalvageValue >= attemptInputCost + attemptActionCost) {
    throw new Error(`Invalid restart inputs: ${JSON.stringify({ attemptInputCost, attemptActionCost,
      successProbability, unconditionalSalvageValue })}`);
  }
  return (attemptInputCost + attemptActionCost - unconditionalSalvageValue) / successProbability;
}
