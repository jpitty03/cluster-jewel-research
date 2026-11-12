// Pure research utilities. Game legality and probability evidence are supplied,
// not inferred by this module. No PoE1 imports or built-in live prices.
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function nonnegative(value, name) {
  requireCondition(typeof value === 'number' && Number.isFinite(value) && value >= 0,
    `${name} must be a finite nonnegative number`);
}

export function parseClipboard(rawText) {
  requireCondition(typeof rawText === 'string' && rawText.trim(), 'Item text is required');
  const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const sections = text.trim().split(/^--------+\s*$/m)
    .map(section => section.trim()).filter(Boolean);
  const lines = text.split('\n').map(line => line.trim());
  const field = name => lines.find(line => line.startsWith(`${name}: `))
    ?.slice(name.length + 2) ?? null;
  const rarity = field('Rarity');
  const headerLines = sections[0].split('\n').map(line => line.trim());
  const rarityIndex = headerLines.findIndex(line => line.startsWith('Rarity: '));
  const names = rarityIndex < 0 ? [] : headerLines.slice(rarityIndex + 1).filter(Boolean);
  const levelText = field('Item Level');
  const level = levelText !== null && /^\d+$/.test(levelText) ? Number(levelText) : null;
  const itemLevel = Number.isSafeInteger(level) && level > 0 ? level : null;
  const itemClass = field('Item Class');
  // Magic display names contain affixes. Resolving the base requires a catalogue.
  const baseName = ['Rare', 'Unique'].includes(rarity) && names.length === 2
    ? names[1] : rarity === 'Normal' && names.length === 1 ? names[0] : null;
  return {
    schemaVersion: 1, game: 'poe2', status: 'needs-resolution', rawItemText: rawText,
    identity: { itemClass, rarity, itemLevel, displayName: names[0] ?? null, baseName },
    sections,
    observedFlags: ['Corrupted', 'Mirrored', 'Sanctified', 'Unidentified']
      .filter(flag => lines.includes(flag)),
    unresolved: [
      ...(!itemClass ? ['item-class'] : []), ...(!rarity ? ['rarity'] : []),
      ...(!itemLevel ? ['item-level'] : []), ...(!baseName ? ['base-name'] : []),
      'game-confirmation', 'ruleset-and-league', 'intent-and-budget',
      'modifier-ids-tiers-and-sides', 'special-properties', 'complete-class-pool', 'prices',
    ],
    note: 'English clipboard intake only. Game is selected by this PoE2 entry point, not detected from text. No modifier resolution or game legality is implied.',
  };
}

export function evaluateRepeatRoute(route) {
  const { successProbability: p, attemptCost: c, recoveryCost: r,
    setupCost: s, finishCost: f, budget, priceUnit, identicalRestart } = route;
  requireCondition(identicalRestart === true, 'Must explicitly assert identical independent restart state');
  requireCondition(typeof priceUnit === 'string' && priceUnit.trim(), 'priceUnit is required');
  for (const [name, value] of Object.entries({ successProbability: p, attemptCost: c,
    recoveryCost: r, setupCost: s, finishCost: f, budget })) nonnegative(value, name);
  requireCondition(p > 0 && p <= 1, 'successProbability must be in (0, 1]');
  requireCondition(c > 0, 'attemptCost must be positive');
  // Completion on attempt n costs s + n*c + (n-1)*r + f.
  const attempts = budget < s + c + f ? 0 : Math.floor((budget - s - f + r) / (c + r));
  requireCondition(Number.isSafeInteger(attempts), 'Attempt count exceeds safe integer precision');
  const successWithinBudget = attempts === 0 ? 0
    : p === 1 ? 1 : -Math.expm1(attempts * Math.log1p(-p));
  const expectedTotalCost = s + (c + (1 - p) * r) / p + f;
  requireCondition(Number.isFinite(expectedTotalCost), 'Expected cost exceeds numeric range');
  return { priceUnit, expectedTotalCost, affordableAttempts: attempts, successWithinBudget,
    expectedAttempts: 1 / p,
    scope: 'Conditional on supplied probabilities, prices and identical independent restarts; excludes unsupported salvage.' };
}

function validateModel(model) {
  requireCondition(model && model.game === 'poe2', 'model.game must be poe2');
  requireCondition(typeof model.priceUnit === 'string' && model.priceUnit.trim(), 'priceUnit is required');
  requireCondition(typeof model.ruleset === 'string' && model.ruleset.trim(), 'ruleset is required');
  requireCondition(Number.isSafeInteger(model.budget) && model.budget >= 0, 'budget must be a nonnegative integer');
  requireCondition(model.states && typeof model.states === 'object' && !Array.isArray(model.states), 'states must be an object');
  const ids = Object.keys(model.states);
  requireCondition(ids.length > 0 && Object.hasOwn(model.states, model.start), 'Unknown start state');
  requireCondition((model.budget + 1) * ids.length <= 2_000_000, 'Model exceeds 2,000,000 budget-state cells');
  for (const [id, state] of Object.entries(model.states)) {
    requireCondition(state && typeof state.success === 'boolean' && Array.isArray(state.actions), `${id}: success and actions required`);
    requireCondition(!state.success || state.actions.length === 0, `${id}: success must be terminal`);
    const actionIds = new Set();
    for (const action of state.actions) {
      requireCondition(typeof action.id === 'string' && action.id.trim() && !actionIds.has(action.id), `${id}: action IDs must be unique nonempty strings`);
      actionIds.add(action.id);
      requireCondition(Number.isSafeInteger(action.cost) && action.cost > 0, `${id}/${action.id}: cost must be a positive integer`);
      requireCondition(Array.isArray(action.evidenceIds) && action.evidenceIds.length > 0 &&
        action.evidenceIds.every(value => typeof value === 'string' && value.trim()), `${id}/${action.id}: evidenceIds required`);
      requireCondition(Array.isArray(action.outcomes) && action.outcomes.length > 0, `${id}/${action.id}: outcomes required`);
      let sum = 0;
      for (const outcome of action.outcomes) {
        requireCondition(Object.hasOwn(model.states, outcome.state), `${id}: unknown outcome state`);
        requireCondition(typeof outcome.probability === 'number' && Number.isFinite(outcome.probability) &&
          outcome.probability > 0 && outcome.probability <= 1, `${id}: invalid probability`);
        sum += outcome.probability;
      }
      requireCondition(Math.abs(sum - 1) < 1e-12, `${id}/${action.id}: probabilities must sum to one`);
    }
  }
  return ids;
}

export function optimizeBudget(model) {
  const ids = validateModel(model);
  const index = new Map(ids.map((id, i) => [id, i]));
  const width = ids.length;
  const count = (model.budget + 1) * width;
  const probabilities = new Float64Array(count);
  const spend = new Float64Array(count);
  const choices = new Int32Array(count).fill(-1);
  // Strictly positive costs make every dependency use a smaller budget.
  // Cycles such as repair/retry therefore require no iterative convergence.
  for (let budget = 0; budget <= model.budget; budget++) {
    for (let i = 0; i < width; i++) {
      const cell = budget * width + i;
      const state = model.states[ids[i]];
      if (state.success) { probabilities[cell] = 1; continue; }
      state.actions.forEach((action, ai) => {
        if (action.cost > budget) return;
        let probability = 0;
        let cost = action.cost;
        for (const outcome of action.outcomes) {
          const next = (budget - action.cost) * width + index.get(outcome.state);
          probability += outcome.probability * probabilities[next];
          cost += outcome.probability * spend[next];
        }
        if (probability > probabilities[cell] ||
            (probability === probabilities[cell] && cost < spend[cell])) {
          probabilities[cell] = probability;
          spend[cell] = cost;
          choices[cell] = ai;
        }
      });
    }
  }
  const startIndex = index.get(model.start);
  const root = model.budget * width + startIndex;
  const pending = [[model.start, model.budget]];
  const seen = new Set();
  const policy = [];
  while (pending.length) {
    const [id, budget] = pending.pop();
    const cell = budget * width + index.get(id);
    if (seen.has(cell)) continue;
    seen.add(cell);
    const state = model.states[id];
    const action = state.actions[choices[cell]];
    policy.push({ state: id, remainingBudget: budget, action: action?.id ?? null,
      successProbability: probabilities[cell], expectedSpend: spend[cell] });
    if (action) for (const outcome of action.outcomes) pending.push([outcome.state, budget - action.cost]);
  }
  return {
    game: 'poe2', ruleset: model.ruleset, priceUnit: model.priceUnit, budget: model.budget,
    objective: 'maximum-success-probability-within-budget',
    successProbability: probabilities[root], expectedSpend: spend[root], policy,
    scope: 'Optimal within the supplied discrete graph (floating-point arithmetic). Game legality, evidence quality, price freshness and action-space completeness are not certified. Expected spend includes failed/stopped runs; it is not expected cost to eventual success.',
  };
}
