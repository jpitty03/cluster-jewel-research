export type PriceSource = 'user-supplied' | 'market-feed' | 'research-default' | 'unavailable';
export type PriceConfidence = 'known' | 'research-fallback' | 'unavailable';

export interface CurrencyRates {
  chaos: number;
  divine: number;
  fracturing: number;
  annul: number;
  exalt: number;
  scour: number;
  alteration: number;
  transmutation: number;
  augmentation: number;
  regal: number;
  wildLifeforce: number;
  vividLifeforce: number;
  primalLifeforce: number;
  crystallisedRancour?: number;
  [key: string]: number | undefined;
}

export const DEFAULT_CURRENCY_RATES: CurrencyRates = {
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
  wildLifeforce: 1 / 13, // Yellow lifeforce (1/13c each)
  vividLifeforce: 1 / 26, // Blue lifeforce (1/26c each)
  primalLifeforce: 1 / 48, // Red lifeforce (1/48c each)
  crystallisedRancour: 10,
};

export interface PriceEvaluation {
  costChaos: number;
  source: PriceSource;
  confidence: PriceConfidence;
}

export interface BaseItemPrices {
  cleanBaseChaos: number;
  fracturedBasesChaos?: Record<string, number>;
}

export const DEFAULT_BASE_PRICES: Record<string, BaseItemPrices> = {
  'Large Cluster Jewel:12% increased Attack Damage while holding a Shield': {
    cleanBaseChaos: 10,
    fracturedBasesChaos: {
      'AfflictionJewelSmallPassivesGrantInt3': 1600, // 8 div
      'AfflictionJewelSmallPassivesHaveIncreasedEffect2': 2600, // 13 div
    },
  },
};

export class PriceBook {
  private rates: CurrencyRates;
  private customRates: Set<string>;
  private basePrices: Map<string, BaseItemPrices>;
  private finishedItemPrices: Map<string, number>;

  constructor(
    rates: Partial<CurrencyRates> = {},
    basePrices: Record<string, BaseItemPrices> = DEFAULT_BASE_PRICES,
    finishedItemPrices: Record<string, number> = {}
  ) {
    this.rates = { ...DEFAULT_CURRENCY_RATES, ...rates };
    this.customRates = new Set(Object.keys(rates));
    this.basePrices = new Map(Object.entries(basePrices));
    this.finishedItemPrices = new Map(Object.entries(finishedItemPrices));
  }

  getKnownRate(currency: keyof CurrencyRates | string): number | undefined {
    return this.rates[currency];
  }

  getRate(currency: keyof CurrencyRates | string): number {
    return this.rates[currency] ?? 0;
  }

  evaluateRate(currency: keyof CurrencyRates | string, fallbackPrice?: number): PriceEvaluation {
    const isCustom = this.customRates.has(currency as string);
    const known = this.rates[currency];

    if (isCustom && known !== undefined && known > 0) {
      return {
        costChaos: known,
        source: 'market-feed',
        confidence: 'known',
      };
    }

    if (known !== undefined && known > 0) {
      return {
        costChaos: known,
        source: 'research-default',
        confidence: 'research-fallback',
      };
    }

    if (fallbackPrice !== undefined && fallbackPrice > 0) {
      return {
        costChaos: fallbackPrice,
        source: 'research-default',
        confidence: 'research-fallback',
      };
    }

    return {
      costChaos: 0,
      source: 'unavailable',
      confidence: 'unavailable',
    };
  }

  toChaos(amount: number, currency: keyof CurrencyRates | string): number {
    const known = this.rates[currency];
    if (known !== undefined) {
      return amount * known;
    }
    return 0;
  }

  getBasePrice(key: string): BaseItemPrices | undefined {
    return this.basePrices.get(key);
  }

  getFinishedPrice(key: string): number | undefined {
    return this.finishedItemPrices.get(key);
  }
}
