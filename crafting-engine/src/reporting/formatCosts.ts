import type { PriceBook } from '../domain/PriceBook.ts';

export function formatChaos(chaos: number, divineRate = 200): string {
  if (Math.abs(chaos) >= divineRate) {
    const div = chaos / divineRate;
    return `${chaos.toFixed(1)}c (~${div.toFixed(2)} div)`;
  }
  return `${chaos.toFixed(1)}c`;
}

export function formatCurrencies(currencies: Record<string, number>, priceBook?: PriceBook): string {
  const lines: string[] = [];
  for (const [curr, amount] of Object.entries(currencies)) {
    if (amount && amount > 0.001) {
      const formattedAmount = amount < 10 ? amount.toFixed(2) : Math.round(amount).toLocaleString();
      let extra = '';
      if (priceBook) {
        const chaosVal = priceBook.toChaos(amount, curr);
        const divRate = priceBook.getRate('divine') || 200;
        extra = ` (${formatChaos(chaosVal, divRate)})`;
      }
      lines.push(`${formattedAmount}x ${curr}${extra}`);
    }
  }
  return lines.join(', ');
}
