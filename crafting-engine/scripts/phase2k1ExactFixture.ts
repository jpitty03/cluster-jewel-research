import type { CurrencyRates } from '../src/domain/PriceBook.ts';
import type { OptimizeCraftInput } from '../src/service/optimizerService.ts';

export const PHASE2K1_TARGET_MOD_IDS = [
  'AfflictionJewelSmallPassivesHaveIncreasedEffect2',
  'AfflictionJewelSmallPassivesGrantInt3',
  'AfflictionJewelSmallPassivesGrantES3',
  'AfflictionJewelSmallPassivesGrantAttributes3',
] as const;

/** Frozen deterministic prices. No live or pre-fractured market quote participates. */
export const PHASE2K1_FROZEN_CURRENCY_RATES: CurrencyRates = {
  chaos: 1,
  divine: 200,
  fracturing: 359,
  annul: 9,
  exalt: 1.2,
  scour: 0.5,
  alteration: 0.11,
  transmutation: 0.03,
  augmentation: 0.03,
  regal: 0.2,
  wildLifeforce: 1 / 13,
  vividLifeforce: 1 / 26,
  primalLifeforce: 1 / 48,
  crystallisedRancour: 10,
};

export function createPhase2k1ExactFixture(
  overrides: Partial<Pick<OptimizeCraftInput, 'searchBudget' | 'searchIntent'>> = {}
): OptimizeCraftInput {
  return {
    baseType: 'Large Cluster Jewel',
    clusterType: '10% increased Attack Damage',
    itemLevel: 84,
    passiveCount: 12,
    target: {
      requiredRarity: 'rare',
      requiredMods: PHASE2K1_TARGET_MOD_IDS.map((modId) => ({ modId })),
      // An empty constraint object permanently pins "extra affixes allowed" without
      // accidentally reintroducing maxUnmatchedAffixes: 0.
      finalStateConstraints: {},
    },
    prices: {
      currencyRates: { ...PHASE2K1_FROZEN_CURRENCY_RATES },
      cleanBaseCostChaos: 10,
      cleanBasePriceSource: 'manual',
      cleanBasePriceProvenance: 'Phase 2K.1 frozen exact RWE PriceBook fixture',
    },
    // The synthesized self-fracture restart is intentionally marked research-fallback
    // confidence by the service even when every numeric currency input is frozen here.
    allowResearchFallbackPrices: true,
    searchBudget: {
      maxStates: 5_000,
      maxWallTimeMs: 30_000,
      maxExpansionRounds: 3,
    },
    searchIntent: 'RECOMMEND',
    ...overrides,
  };
}
