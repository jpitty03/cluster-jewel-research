import type { StartingStrategyResult } from '../solver/evaluator.ts';
import { formatChaos, formatCurrencies } from './formatCosts.ts';
import type { PriceBook } from '../domain/PriceBook.ts';

export interface CraftPlanExplanation {
  title: string;
  recommendedStart: string;
  steps: string[];
  expectedTotalCost: string;
  expectedProfit?: string;
  roi?: string;
  alternateRoutes?: string[];
}

export function generateCraftExplanation(
  recommended: StartingStrategyResult,
  alternates: StartingStrategyResult[] = [],
  priceBook?: PriceBook
): string {
  const divineRate = priceBook?.getRate('divine') ?? 200;
  const lines: string[] = [];

  lines.push('='.repeat(70));
  lines.push(`RECOMMENDED CRAFTING PATH: ${recommended.strategyName.toUpperCase()}`);
  lines.push('='.repeat(70));

  lines.push(`\n1. Starting Base:`);
  lines.push(`   - ${recommended.strategyName}`);
  lines.push(`   - Base Cost: ${formatChaos(recommended.baseCostChaos, divineRate)}`);

  lines.push(`\n2. Expected Currency Consumption:`);
  lines.push(`   - ${formatCurrencies(recommended.expectedCurrencies, priceBook)}`);

  lines.push(`\n3. Financial Summary:`);
  lines.push(`   - Expected Crafting Cost: ${formatChaos(recommended.expectedCraftingCostChaos, divineRate)}`);
  lines.push(`   - Total Expected Investment: ${formatChaos(recommended.totalExpectedCostChaos, divineRate)}`);
  if (recommended.expectedProfitChaos !== undefined) {
    lines.push(`   - Expected Net Profit: ${formatChaos(recommended.expectedProfitChaos, divineRate)}`);
    lines.push(`   - Estimated ROI: ${recommended.roi?.toFixed(1)}%`);
  }

  if (alternates.length > 0) {
    lines.push(`\n4. Alternate Starting Routes:`);
    for (const alt of alternates) {
      const diff = alt.totalExpectedCostChaos - recommended.totalExpectedCostChaos;
      const diffStr = diff >= 0 ? `+${formatChaos(diff, divineRate)} more expensive` : `${formatChaos(Math.abs(diff), divineRate)} cheaper`;
      lines.push(`   - ${alt.strategyName}: Total ${formatChaos(alt.totalExpectedCostChaos, divineRate)} (${diffStr})`);
    }
  }

  lines.push('='.repeat(70));
  return lines.join('\n');
}
