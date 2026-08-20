export interface CurrencyRates {
  chaos: number;
  divine: number;
  fracturing: number;
  annul: number;
  exalt: number;
  scour: number;
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
  wildLifeforce: 1 / 13, // Yellow lifeforce
  vividLifeforce: 1 / 26, // Blue lifeforce
  primalLifeforce: 1 / 48, // Red lifeforce
  crystallisedRancour: 10,
};

export interface BaseItemPrices {
  cleanBaseChaos: number;
  fracturedBasesChaos?: Record<string, number>;
}

export class PriceBook {
  private rates: CurrencyRates;
  private basePrices: Map<string, BaseItemPrices>;
  private finishedItemPrices: Map<string, number>;

  constructor(
    rates: Partial<CurrencyRates> = {},
    basePrices: Record<string, BaseItemPrices> = {},
    finishedItemPrices: Record<string, number> = {}
  ) {
    this.rates = { ...DEFAULT_CURRENCY_RATES, ...rates };
    this.basePrices = new Map(Object.entries(basePrices));
    this.finishedItemPrices = new Map(Object.entries(finishedItemPrices));
  }

  getRate(currency: keyof CurrencyRates | string): number {
    return this.rates[currency] ?? 1;
  }

  toChaos(amount: number, currency: keyof CurrencyRates | string): number {
    return amount * this.getRate(currency);
  }

  getBasePrice(key: string): BaseItemPrices | undefined {
    return this.basePrices.get(key);
  }

  getFinishedPrice(key: string): number | undefined {
    return this.finishedItemPrices.get(key);
  }
}
