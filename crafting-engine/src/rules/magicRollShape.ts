import type { RandomSource } from '../probability/random.ts';

export type MagicRollShapeClass = 'PREFIX_ONLY' | 'SUFFIX_ONLY' | 'PREFIX_AND_SUFFIX';
export type MagicRollShapeConfidence = 'VALIDATED' | 'APPROXIMATE';

/**
 * One authoritative contract for every analytical and sampled Magic reroll.
 *
 * Phase 3B deliberately retains the engine's pre-existing global 50/50
 * one-affix/two-affix approximation. The field observation of approximately
 * 52/48 is not an independently pinned exact probability, so it is recorded as
 * uncertainty instead of being promoted into production mechanics.
 */
export interface MagicRollShape {
  oneAffixProbability: number;
  twoAffixProbability: number;
  oneAffixPrefixShare: number;
  oneAffixSuffixShare: number;
  confidence: MagicRollShapeConfidence;
  provenance: string;
  version: string;
}

export const MAGIC_ROLL_SHAPE: Readonly<MagicRollShape> = Object.freeze({
  oneAffixProbability: 0.5,
  twoAffixProbability: 0.5,
  oneAffixPrefixShare: 0.5,
  oneAffixSuffixShare: 0.5,
  confidence: 'APPROXIMATE',
  provenance:
    'Phase 3B shared contract retaining the existing documented 50/50 one-affix/two-affix ' +
    'approximation. Field evidence reports approximately 52/48, but no independent exact ' +
    'split is currently pinned; fractured-slot behavior is exact relative to this contract.',
  version: 'MAGIC_ROLL_SHAPE_PHASE3B_V1',
});

const PROBABILITY_TOLERANCE = 1e-12;

export function validateMagicRollShape(shape: Readonly<MagicRollShape>): void {
  const probabilities = [
    shape.oneAffixProbability,
    shape.twoAffixProbability,
    shape.oneAffixPrefixShare,
    shape.oneAffixSuffixShare,
  ];
  if (probabilities.some((probability) => !Number.isFinite(probability) || probability < 0 || probability > 1)) {
    throw new Error(`Invalid Magic roll-shape probability in ${shape.version}`);
  }
  if (Math.abs(shape.oneAffixProbability + shape.twoAffixProbability - 1) > PROBABILITY_TOLERANCE) {
    throw new Error(`Magic one/two-affix probabilities do not sum to 1 in ${shape.version}`);
  }
  if (Math.abs(shape.oneAffixPrefixShare + shape.oneAffixSuffixShare - 1) > PROBABILITY_TOLERANCE) {
    throw new Error(`Magic one-affix Prefix/Suffix shares do not sum to 1 in ${shape.version}`);
  }
  if (!shape.version || !shape.provenance) {
    throw new Error('Magic roll-shape version and provenance are required');
  }
}

export function magicRollShapeProbabilities(
  shape: Readonly<MagicRollShape> = MAGIC_ROLL_SHAPE,
): Readonly<Record<MagicRollShapeClass, number>> {
  validateMagicRollShape(shape);
  return {
    PREFIX_ONLY: shape.oneAffixProbability * shape.oneAffixPrefixShare,
    SUFFIX_ONLY: shape.oneAffixProbability * shape.oneAffixSuffixShare,
    PREFIX_AND_SUFFIX: shape.twoAffixProbability,
  };
}

export function sampleMagicRollShape(
  rng: RandomSource,
  shape: Readonly<MagicRollShape> = MAGIC_ROLL_SHAPE,
): MagicRollShapeClass {
  validateMagicRollShape(shape);
  if (rng.next() >= shape.oneAffixProbability) return 'PREFIX_AND_SUFFIX';
  return rng.next() < shape.oneAffixPrefixShare ? 'PREFIX_ONLY' : 'SUFFIX_ONLY';
}

validateMagicRollShape(MAGIC_ROLL_SHAPE);
