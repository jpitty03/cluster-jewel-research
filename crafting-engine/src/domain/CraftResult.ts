import type { CraftOutcome } from './CraftAction.ts';
import { generateStateKey } from '../solver/stateKey.ts';

export function consolidateOutcomes(outcomes: CraftOutcome[]): CraftOutcome[] {
  const byKey = new Map<string, CraftOutcome>();

  for (const outcome of outcomes) {
    const key = generateStateKey(outcome.state);
    const existing = byKey.get(key);
    if (existing) {
      existing.probability += outcome.probability;
    } else {
      byKey.set(key, {
        probability: outcome.probability,
        state: outcome.state,
        description: outcome.description,
      });
    }
  }

  return Array.from(byKey.values());
}

export function validateProbabilityDistribution(outcomes: CraftOutcome[], tolerance = 1e-6): boolean {
  const sum = outcomes.reduce((acc, o) => acc + o.probability, 0);
  return Math.abs(sum - 1.0) <= tolerance;
}
