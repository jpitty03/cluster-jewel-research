import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseClipboard, evaluateRepeatRoute, optimizeBudget } from '../engine.mjs';

const fixture = () => JSON.parse(readFileSync(new URL('../examples/synthetic-model.json', import.meta.url), 'utf8'));
const repeat = () => ({ priceUnit: 'test', identicalRestart: true, successProbability: 0.25,
  attemptCost: 2, recoveryCost: 3, setupCost: 5, finishCost: 1, budget: 18 });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('clipboard preserves raw hybrid/special lines and does not infer modifier records', () => {
  const raw = 'Item Class: Boots\r\nRarity: Rare\r\nStorm Step\r\nTest Boots\r\n--------\r\nItem Level: 82\r\n--------\r\n+20 to maximum Life\r\n+12 to maximum Mana\r\nUnrevealed Modifier\r\n--------\r\nCorrupted\r\n';
  const result = parseClipboard(raw);
  assert.equal(result.rawItemText, raw);
  assert.equal(result.identity.itemLevel, 82);
  assert.equal(result.identity.baseName, 'Test Boots');
  assert.deepEqual(result.observedFlags, ['Corrupted']);
  assert.ok(result.unresolved.includes('modifier-ids-tiers-and-sides'));
  assert.ok(result.sections.some(section => section.includes('Unrevealed Modifier')));
  assert.equal(result.modifiers, undefined);
});

test('magic base and missing item level remain unresolved', () => {
  const result = parseClipboard('Rarity: Magic\nHealthy Test Boots of Speed\n--------\nRequires Level 70');
  assert.equal(result.identity.baseName, null);
  assert.equal(result.identity.itemLevel, null);
  assert.ok(result.unresolved.includes('item-class'));
  assert.throws(() => parseClipboard('  '));
});

test('repeat arithmetic includes failed recovery and successful finishing', () => {
  const result = evaluateRepeatRoute(repeat());
  near(result.expectedTotalCost, 23);
  assert.equal(result.affordableAttempts, 3);
  near(result.successWithinBudget, 1 - 0.75 ** 3);
  near(evaluateRepeatRoute({ ...repeat(), budget: 7 }).successWithinBudget, 0);
  near(evaluateRepeatRoute({ ...repeat(), budget: 8 }).successWithinBudget, 0.25);
  near(evaluateRepeatRoute({ ...repeat(), successProbability: 1 }).expectedTotalCost, 8);
});

test('repeat rejects missing prices, zero odds and nonidentical restart assumptions', () => {
  for (const change of [{ attemptCost: null }, { recoveryCost: undefined },
    { successProbability: 0 }, { successProbability: 1.01 }, { setupCost: -1 },
    { identicalRestart: false }, { priceUnit: '' }, { budget: Infinity }]) {
    assert.throws(() => evaluateRepeatRoute({ ...repeat(), ...change }));
  }
});

test('budget optimizer chooses purchase over cheaper expected-spend gambling', () => {
  const result = optimizeBudget(fixture());
  near(result.successProbability, 1);
  near(result.expectedSpend, 4);
  assert.equal(result.policy[0].action, 'buy-finished');
});

test('adaptive repair/retry policy has analytic success and expenditure', () => {
  const model = fixture();
  model.budget = 3;
  const result = optimizeBudget(model);
  near(result.successProbability, 0.75);
  near(result.expectedSpend, 2); // 1 + 0.5*(1 + 1)
  assert.ok(result.policy.some(row => row.state === 'damaged' && row.action === 'repair'));
  near(optimizeBudget({ ...model, budget: 0 }).successProbability, 0);
});

test('retry graph agrees with independent geometric probability across budgets', () => {
  const model = fixture();
  model.states.anchor.actions = [{ id: 'retry', cost: 1, evidenceIds: ['test'], outcomes: [
    { state: 'finished', probability: 0.2 }, { state: 'anchor', probability: 0.8 },
  ] }];
  for (let budget = 0; budget <= 20; budget++) {
    const result = optimizeBudget({ ...model, budget });
    near(result.successProbability, 1 - 0.8 ** budget);
    near(result.expectedSpend, (1 - 0.8 ** budget) / 0.2);
  }
});

test('closed failure component stops rather than spending with no success chance', () => {
  const model = fixture();
  model.states.anchor.actions = [{ id: 'loop', cost: 1, evidenceIds: ['test'],
    outcomes: [{ state: 'anchor', probability: 1 }] }];
  const result = optimizeBudget(model);
  near(result.successProbability, 0);
  near(result.expectedSpend, 0);
  assert.equal(result.policy[0].action, null);
});

test('malformed graph, PoE1 data and unbounded computation are rejected', () => {
  for (const mutate of [
    model => { model.game = 'poe1'; },
    model => { model.states.anchor.actions[0].cost = 0; },
    model => { model.states.anchor.actions[0].cost = 0.5; },
    model => { model.states.anchor.actions[0].evidenceIds = []; },
    model => { model.states.anchor.actions[0].outcomes[0].probability = 0.4; },
    model => { model.states.anchor.actions[0].outcomes[0].state = 'absent'; },
    model => { model.states.finished.actions = model.states.anchor.actions; },
    model => { model.budget = 2_000_000; },
  ]) {
    const model = fixture(); mutate(model);
    assert.throws(() => optimizeBudget(model));
  }
});

test('success already achieved needs no budget', () => {
  const model = fixture(); model.start = 'finished'; model.budget = 0;
  const result = optimizeBudget(model);
  near(result.successProbability, 1); near(result.expectedSpend, 0);
});
