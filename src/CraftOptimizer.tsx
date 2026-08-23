import { useEffect, useMemo, useRef, useState } from 'react';
import type { BaseType } from '../crafting-engine/src/domain/ItemState.ts';
import type {
  OptimizeCraftInput,
  OptimizeCraftResult,
  RecommendationStatus,
} from '../crafting-engine/src/service/optimizerService.ts';
import {
  browserCraftingCatalog,
  validateBrowserOptimizeInput,
} from './crafting/browserEngine.ts';
import {
  getBrowserOptimizerPricing,
  getOptimizerPricingLeagues,
} from './crafting/optimizerPricing.ts';
import {
  OptimizerWorkerClient,
  SearchWallTimeExceededError,
} from './crafting/optimizerWorkerClient.ts';

const DEFAULT_ITEM_LEVEL = 84;
const DEFAULT_BUDGET = { maxStates: 5000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 };

const STATUS_COPY: Record<RecommendationStatus, { title: string; detail: string }> = {
  PROVEN_OPTIMAL: {
    title: 'Optimal over modeled action/state space',
    detail: 'Every modeled competitor was resolved or safely bounded for this search.',
  },
  BEST_RESOLVED: {
    title: 'Best resolved route found',
    detail: 'Unresolved routes may still be cheaper.',
  },
  NO_RESOLVED_ROUTE: {
    title: 'No fully resolved route found within this search budget',
    detail: 'Increase a search budget or adjust the target; this is a valid search outcome.',
  },
};

function chaos(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toFixed(3)}c`;
}

function count(value: number): string {
  return value < 0.01 ? value.toExponential(2) : value.toFixed(3);
}

function CraftOptimizer() {
  const baseTypes = useMemo(() => browserCraftingCatalog.getBaseTypes(), []);
  const initialBase = baseTypes[0] ?? 'Large Cluster Jewel';
  const [baseType, setBaseType] = useState<BaseType>(initialBase);
  const clusterTypes = useMemo(
    () => browserCraftingCatalog.getClusterTypes(baseType),
    [baseType],
  );
  const [clusterType, setClusterType] = useState(clusterTypes[0] ?? '');
  const passiveCounts = useMemo(
    () => browserCraftingCatalog.getPassiveCounts(baseType),
    [baseType],
  );
  const [passiveCount, setPassiveCount] = useState(passiveCounts.at(-1) ?? 12);
  const [itemLevel, setItemLevel] = useState(DEFAULT_ITEM_LEVEL);
  const eligibleMods = useMemo(
    () => browserCraftingCatalog.getEligibleMods(baseType, clusterType, itemLevel),
    [baseType, clusterType, itemLevel],
  );
  const [targetModIds, setTargetModIds] = useState(['']);
  const [finalRarity, setFinalRarity] = useState<'any' | 'magic' | 'rare'>('any');
  const [modSearch, setModSearch] = useState('');
  const [cleanBaseCost, setCleanBaseCost] = useState('');
  const [fracturedMarketPrices, setFracturedMarketPrices] = useState<Record<string, string>>({});
  const [saleValue, setSaleValue] = useState('');
  const pricingLeagues = useMemo(() => getOptimizerPricingLeagues(), []);
  const [league, setLeague] = useState(pricingLeagues[0] ?? '');
  const [allowFallback, setAllowFallback] = useState(true);
  const [maxStates, setMaxStates] = useState(DEFAULT_BUDGET.maxStates);
  const [maxWallTimeMs, setMaxWallTimeMs] = useState(DEFAULT_BUDGET.maxWallTimeMs);
  const [maxExpansionRounds, setMaxExpansionRounds] = useState(DEFAULT_BUDGET.maxExpansionRounds);
  const [result, setResult] = useState<OptimizeCraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallTimeExceeded, setWallTimeExceeded] = useState(false);
  const [running, setRunning] = useState(false);
  const [runtimeMs, setRuntimeMs] = useState<number | null>(null);
  const workerRef = useRef<OptimizerWorkerClient | null>(null);

  const marketPricing = useMemo(
    () => getBrowserOptimizerPricing(league, baseType, clusterType, passiveCount, itemLevel),
    [baseType, clusterType, itemLevel, league, passiveCount],
  );
  const selectedTargetIds = useMemo(() => targetModIds.filter(Boolean), [targetModIds]);
  const effectiveRarity = selectedTargetIds.length >= 3 ? 'rare' : finalRarity;
  const groupedEligibleMods = useMemo(() => {
    const needle = modSearch.trim().toLowerCase();
    const filtered = eligibleMods.filter((mod) =>
      selectedTargetIds.includes(mod.modId) ||
      needle.length === 0 ||
      `${mod.displayName} ${mod.statText} ${mod.modId} t${mod.tier} ${mod.genType}`.toLowerCase().includes(needle)
    );
    const groups = new Map<string, typeof filtered>();
    for (const mod of filtered) {
      const key = `${mod.isNotable ? 'Notable' : 'Ordinary'} ${mod.genType}`;
      const entries = groups.get(key) ?? [];
      entries.push(mod);
      groups.set(key, entries);
    }
    return [...groups.entries()];
  }, [eligibleMods, modSearch, selectedTargetIds]);

  const draftInput = useMemo((): OptimizeCraftInput => {
    const manualClean = cleanBaseCost.trim() === '' ? undefined : Number(cleanBaseCost);
    const marketFracturedPricesChaos = Object.fromEntries(
      selectedTargetIds.flatMap((modId) => {
        const raw = fracturedMarketPrices[modId]?.trim();
        const value = raw ? Number(raw) : NaN;
        return Number.isFinite(value) && value > 0 ? [[modId, value]] : [];
      })
    );
    const parsedSaleValue = saleValue.trim() === '' ? undefined : Number(saleValue);
    return {
      baseType,
      clusterType,
      itemLevel,
      passiveCount,
      target: {
        requiredMods: selectedTargetIds.map((modId) => ({ modId })),
        requiredRarity: effectiveRarity === 'any' ? undefined : effectiveRarity,
      },
      prices: {
        ...marketPricing?.priceContext,
        cleanBaseCostChaos: Number.isFinite(manualClean) && manualClean !== undefined && manualClean >= 0
          ? manualClean
          : marketPricing?.priceContext.cleanBaseCostChaos,
        cleanBasePriceSource: Number.isFinite(manualClean) && manualClean !== undefined
          ? 'manual'
          : marketPricing?.priceContext.cleanBasePriceSource,
        cleanBasePriceProvenance: Number.isFinite(manualClean) && manualClean !== undefined
          ? 'manual clean-base override supplied in Developer UI'
          : marketPricing?.priceContext.cleanBasePriceProvenance,
        marketFracturedPricesChaos: Object.keys(marketFracturedPricesChaos).length > 0
          ? marketFracturedPricesChaos
          : undefined,
      },
      marketContext: marketPricing?.marketContext,
      expectedSaleValueChaos: Number.isFinite(parsedSaleValue) && parsedSaleValue !== undefined && parsedSaleValue >= 0
        ? parsedSaleValue
        : undefined,
      allowResearchFallbackPrices: allowFallback,
      searchBudget: { maxStates, maxWallTimeMs, maxExpansionRounds },
    };
  }, [
    allowFallback,
    baseType,
    cleanBaseCost,
    clusterType,
    effectiveRarity,
    fracturedMarketPrices,
    itemLevel,
    marketPricing,
    maxExpansionRounds,
    maxStates,
    maxWallTimeMs,
    passiveCount,
    saleValue,
    selectedTargetIds,
  ]);
  const validation = useMemo(() => validateBrowserOptimizeInput(draftInput), [draftInput]);

  useEffect(() => {
    const client = new OptimizerWorkerClient();
    workerRef.current = client;
    return () => {
      client.dispose();
      if (workerRef.current === client) workerRef.current = null;
    };
  }, []);

  const validationError = validation.errors.map((issue) => issue.message).join(' ') || null;

  const changeBase = (nextBase: BaseType) => {
    const nextClusterTypes = browserCraftingCatalog.getClusterTypes(nextBase);
    const nextPassiveCounts = browserCraftingCatalog.getPassiveCounts(nextBase);
    setBaseType(nextBase);
    setClusterType(nextClusterTypes[0] ?? '');
    setPassiveCount(nextPassiveCounts.at(-1) ?? 1);
    setTargetModIds(['']);
    setResult(null);
  };

  const changeCluster = (nextCluster: string) => {
    setClusterType(nextCluster);
    setTargetModIds(['']);
    setResult(null);
  };

  const updateTarget = (index: number, modId: string) => {
    setTargetModIds((current) => current.map((value, i) => (i === index ? modId : value)));
  };

  const optimize = async (budget = { maxStates, maxWallTimeMs, maxExpansionRounds }) => {
    if (validationError || !workerRef.current) return;
    const requestValidation = validateBrowserOptimizeInput({ ...draftInput, searchBudget: budget });
    if (!requestValidation.valid) {
      setError(requestValidation.errors.map((issue) => issue.message).join(' '));
      return;
    }
    const input = requestValidation.normalizedInput;
    setRunning(true);
    setError(null);
    setWallTimeExceeded(false);
    setResult(null);
    setRuntimeMs(null);
    const started = performance.now();
    try {
      const nextResult = await workerRef.current.optimize(input);
      setResult(nextResult);
      setRuntimeMs(performance.now() - started);
    } catch (caught) {
      if (caught instanceof SearchWallTimeExceededError) {
        setWallTimeExceeded(true);
        setError(
          `Search stopped at the configured ${caught.budgetMs.toLocaleString()} ms runtime budget. ` +
          'The worker was replaced and is ready for another run.'
        );
      } else if (caught instanceof Error && caught.name === 'AbortError') {
        setError('Optimization cancelled. The worker was replaced and is ready for another run.');
      } else {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      setRunning(false);
    }
  };

  const retryDeeper = () => {
    const budget = {
      maxStates: Math.max(maxStates + 1, maxStates * 2),
      maxWallTimeMs: Math.max(maxWallTimeMs + 1, maxWallTimeMs * 2),
      maxExpansionRounds: maxExpansionRounds + 1,
    };
    setMaxStates(budget.maxStates);
    setMaxWallTimeMs(budget.maxWallTimeMs);
    setMaxExpansionRounds(budget.maxExpansionRounds);
    void optimize(budget);
  };

  const cancel = () => workerRef.current?.cancel();
  const selectedAcquisition = result?.acquisition.candidates.find(
    (candidate) => candidate.id === result.acquisition.selectedCandidateId,
  );
  const selectedMethod = selectedAcquisition?.methods.find(
    (method) => method.id === result?.acquisition.selectedMethodId,
  );

  return (
    <main className="optimizer-page">
      <p className="subtitle">
        Developer-facing generic policy search. Targets are exact modifier IDs from the committed
        PoEDB snapshot; optimization runs off the main thread.
      </p>

      <section className="optimizer-card optimizer-form" aria-labelledby="optimizer-input-title">
        <h2 id="optimizer-input-title">Craft target</h2>
        <div className="optimizer-grid">
          <label>
            <span>Base type</span>
            <select value={baseType} onChange={(event) => changeBase(event.target.value as BaseType)}>
              {baseTypes.map((base) => <option key={base}>{base}</option>)}
            </select>
          </label>
          <label>
            <span>Cluster enchantment</span>
            <select value={clusterType} onChange={(event) => changeCluster(event.target.value)}>
              {clusterTypes.map((cluster) => <option key={cluster}>{cluster}</option>)}
            </select>
          </label>
          <label>
            <span>Item level</span>
            <input type="number" min="1" max="100" value={itemLevel} onChange={(event) => setItemLevel(event.target.valueAsNumber)} />
          </label>
          <label>
            <span>Passive skills</span>
            <select value={passiveCount} onChange={(event) => setPassiveCount(Number(event.target.value))}>
              {passiveCounts.map((passives) => <option key={passives}>{passives}</option>)}
            </select>
          </label>
          <label>
            <span>Final rarity</span>
            <select
              value={effectiveRarity}
              disabled={selectedTargetIds.length >= 3}
              onChange={(event) => setFinalRarity(event.target.value as typeof finalRarity)}
            >
              <option value="any">Any</option>
              <option value="magic">Magic</option>
              <option value="rare">Rare</option>
            </select>
          </label>
          <label>
            <span>Pricing league</span>
            <select value={league} onChange={(event) => setLeague(event.target.value)}>
              {pricingLeagues.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>Clean base manual override (chaos)</span>
            <input
              type="number"
              min="0"
              step="0.1"
              value={cleanBaseCost}
              placeholder={marketPricing?.marketContext.cleanBaseQuote.status === 'AVAILABLE'
                ? String(marketPricing.marketContext.cleanBaseQuote.costChaos)
                : 'Market quote unavailable'}
              onChange={(event) => setCleanBaseCost(event.target.value)}
            />
          </label>
          <label>
            <span>Expected sale value (chaos, optional)</span>
            <input type="number" min="0" step="1" value={saleValue} onChange={(event) => setSaleValue(event.target.value)} />
          </label>
        </div>

        <p className="muted">
          {marketPricing?.marketContext.cleanBaseQuote.provenance ?? 'No league price snapshot is available.'}
        </p>

        <div className="target-list">
          <h3>Desired exact modifiers ({targetModIds.length}/4)</h3>
          <label>
            <span>Search modifiers</span>
            <input
              type="search"
              value={modSearch}
              placeholder="Name, tier, Prefix/Suffix, notable…"
              onChange={(event) => setModSearch(event.target.value)}
            />
          </label>
          {targetModIds.map((modId, index) => (
            <div className="target-row" key={index}>
              <select value={modId} onChange={(event) => updateTarget(index, event.target.value)} aria-label={`Desired modifier ${index + 1}`}>
                <option value="">Select an eligible modifier…</option>
                {groupedEligibleMods.map(([group, mods]) => (
                  <optgroup key={group} label={group}>
                    {mods.map((mod) => (
                      <option key={mod.modId} value={mod.modId}>
                        {mod.displayName} — T{mod.tier}, ilvl {mod.requiredItemLevel}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {targetModIds.length > 1 && (
                <button type="button" className="secondary" onClick={() => setTargetModIds((current) => current.filter((_, i) => i !== index))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {targetModIds.length < 4 && (
            <button type="button" className="secondary" onClick={() => setTargetModIds((current) => [...current, ''])}>
              Add modifier
            </button>
          )}
          {selectedTargetIds.map((modId) => {
            const mod = eligibleMods.find((candidate) => candidate.modId === modId);
            return (
              <label key={`fractured-${modId}`}>
                <span>Fractured-base market price — {mod?.displayName ?? modId} (optional chaos)</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={fracturedMarketPrices[modId] ?? ''}
                  onChange={(event) => setFracturedMarketPrices((current) => ({
                    ...current,
                    [modId]: event.target.value,
                  }))}
                />
              </label>
            );
          })}
        </div>

        <section className="target-summary">
          <h3>Target summary</h3>
          <p>{baseType} · {clusterType} · ilvl {itemLevel} · {passiveCount} passives</p>
          <p>Final rarity: {validation.normalizedInput.target.requiredRarity ?? 'Any'}</p>
          <ul>
            {validation.normalizedInput.target.requiredMods.map((requirement) => (
              <li key={requirement.modId}>{requirement.modId}</li>
            ))}
          </ul>
          {validation.notices.map((notice) => <p className="muted" key={notice.code}>{notice.message}</p>)}
        </section>

        <details className="advanced-controls">
          <summary>Advanced search budgets</summary>
          <p>Defaults: 5,000 states, 30,000 ms, 3 lazy-expansion rounds.</p>
          <div className="optimizer-grid">
            <label><span>Max states</span><input type="number" min="1" step="100" value={maxStates} onChange={(event) => setMaxStates(event.target.valueAsNumber)} /></label>
            <label><span>Max wall time (ms)</span><input type="number" min="1" step="1000" value={maxWallTimeMs} onChange={(event) => setMaxWallTimeMs(event.target.valueAsNumber)} /></label>
            <label><span>Expansion rounds</span><input type="number" min="1" max="20" value={maxExpansionRounds} onChange={(event) => setMaxExpansionRounds(event.target.valueAsNumber)} /></label>
          </div>
          <label className="optimizer-checkbox">
            <input type="checkbox" checked={allowFallback} onChange={(event) => setAllowFallback(event.target.checked)} />
            Allow research-fallback currency and acquisition prices
          </label>
        </details>

        {validationError && <div className="optimizer-validation">{validationError}</div>}
        <div className="optimizer-actions">
          <button type="button" onClick={() => void optimize()} disabled={running || validationError !== null || workerRef.current === null}>
            {running ? 'Searching…' : 'Optimize craft'}
          </button>
          {running && <button type="button" className="secondary" onClick={cancel}>Cancel</button>}
        </div>
      </section>

      {error && (
        <div className="error">
          {error}
          {wallTimeExceeded && !running && (
            <button type="button" className="secondary" onClick={retryDeeper}>Retry deeper</button>
          )}
        </div>
      )}
      {running && <div className="status">The worker is exploring and valuing the candidate graph…</div>}

      {result && (
        <div className="optimizer-results">
          <section className="optimizer-card optimizer-summary">
            <h2>Recommendation summary</h2>
            <dl>
              <dt>Target</dt>
              <dd>{result.target.requiredMods.map((requirement) => requirement.modId).join(' + ')} · {result.target.requiredRarity ?? 'Any rarity'}</dd>
              <dt>Status</dt><dd>{result.recommendationStatus}</dd>
              <dt>Selected acquisition</dt><dd>{selectedAcquisition?.label ?? result.recommended?.name ?? 'None certified'}</dd>
              <dt>Expected cost</dt><dd>{chaos(result.expectedCostChaos)}</dd>
              {result.expectedSaleValueChaos !== undefined && <><dt>Expected sale value</dt><dd>{chaos(result.expectedSaleValueChaos)}</dd></>}
              {result.expectedProfitChaos !== undefined && <><dt>Expected profit</dt><dd>{chaos(result.expectedProfitChaos)}</dd></>}
              <dt>Proof</dt><dd>{result.proof.proofLevel}</dd>
              <dt>Runtime</dt><dd>{runtimeMs?.toFixed(0)} ms worker round trip</dd>
            </dl>
            {result.warningDetails.filter((warning) => warning.category === 'SELECTED_ROUTE' || warning.category === 'PROOF_SEARCH').length > 0 && (
              <ul className="warnings">
                {result.warningDetails
                  .filter((warning) => warning.category === 'SELECTED_ROUTE' || warning.category === 'PROOF_SEARCH')
                  .map((warning) => <li key={`${warning.category}-${warning.message}`}>{warning.category}: {warning.message}</li>)}
              </ul>
            )}
            {(result.recommendationStatus !== 'PROVEN_OPTIMAL' || result.search.budgetExhausted) && (
              <button type="button" className="secondary" onClick={retryDeeper}>Retry deeper</button>
            )}
          </section>

          <section className={`optimizer-proof ${result.recommendationStatus.toLowerCase()}`}>
            <strong>{STATUS_COPY[result.recommendationStatus].title}</strong>
            <span>{STATUS_COPY[result.recommendationStatus].detail}</span>
          </section>

          <div className="optimizer-result-grid">
            <section className="optimizer-card">
              <h2>Recommended acquisition</h2>
              {result.recommended ? (
                <>
                  <p><strong>{selectedAcquisition?.label ?? result.recommended.name}</strong></p>
                  <p>{selectedMethod?.label} · {chaos(result.expectedCostChaos)}</p>
                  {selectedMethod?.approximate && <p className="warning-text">Approximate self-fracture acquisition estimate</p>}
                  {selectedMethod && <p className="muted">{selectedMethod.provenance}</p>}
                </>
              ) : <p>No certified acquisition route is available under this budget.</p>}
            </section>

            <section className="optimizer-card">
              <h2>Policy health</h2>
              <dl>
                <dt>Terminal absorption</dt><dd>{(result.risk.terminalAbsorptionProbability * 100).toFixed(6)}%</dd>
                <dt>On-policy states</dt><dd>{result.risk.onPolicyReachableStates.toLocaleString()}</dd>
                <dt>Unresolved on-policy</dt><dd>{(result.risk.unresolvedOnPolicyProbability * 100).toFixed(6)}%</dd>
                <dt>Bellman</dt><dd>{result.solver.bellmanConverged ? 'converged' : 'not converged'} ({result.solver.bellmanIterations})</dd>
                <dt>Occupancy</dt><dd>{result.solver.occupancyConverged ? 'converged' : 'not converged'} ({result.solver.occupancyIterations})</dd>
                <dt>EV reconciliation</dt><dd>{chaos(result.solver.reconciliationDifferenceChaos)}</dd>
              </dl>
            </section>
          </div>

          <section className="optimizer-card">
            <h2>Expected action usage</h2>
            {result.expectedActionUsage.length > 0 ? (
              <table><thead><tr><th>Action</th><th>Expected count</th><th>Expected cost</th></tr></thead>
                <tbody>{result.expectedActionUsage.map((usage) => <tr key={usage.actionId}><td>{usage.actionName}</td><td>{count(usage.expectedCount)}</td><td>{chaos(usage.expectedCostChaos)}</td></tr>)}</tbody>
              </table>
            ) : <p>No resolved on-policy action usage is available.</p>}
            <h3 className="optimizer-subheading">Expected currencies</h3>
            {Object.keys(result.expectedCurrencies).length > 0 ? (
              <ul className="currency-usage">
                {Object.entries(result.expectedCurrencies).map(([currency, amount]) => (
                  <li key={currency}><span>{currency}</span><strong>{amount === null ? '—' : count(amount)}</strong></li>
                ))}
              </ul>
            ) : <p>No resolved currency usage is available.</p>}
          </section>

          <section className="optimizer-card">
            <h2>Alternative acquisitions</h2>
            {result.alternatives.length > 0 ? (
              <table><thead><tr><th>Route</th><th>Status</th><th>Expected total</th><th>Could beat incumbent</th></tr></thead>
                <tbody>{result.alternatives.map((route) => <tr key={route.actionId}><td>{route.name}</td><td>{route.status}</td><td>{chaos(route.expectedTotalCostChaos)}</td><td>{route.couldBeatResolvedIncumbent ? 'yes' : 'no'}</td></tr>)}</tbody>
              </table>
            ) : <p>No alternative acquisition routes were generated.</p>}
          </section>

          <details className="optimizer-card policy-rules">
            <summary>On-policy rules ({result.policyRules.length})</summary>
            <table><thead><tr><th>Expected visits</th><th>State</th><th>Selected action</th><th>Continuation EV</th></tr></thead>
              <tbody>{result.policyRules.map((rule) => <tr key={rule.stateKey}><td>{count(rule.expectedVisits)}</td><td>{rule.state}</td><td>{rule.selectedAction}</td><td>{chaos(rule.totalCostChaos)}</td></tr>)}</tbody>
            </table>
          </details>

          <div className="optimizer-result-grid">
            <section className="optimizer-card">
              <h2>Search budget</h2>
              <dl>
                <dt>States expanded</dt><dd>{result.search.statesExpanded.toLocaleString()}</dd>
                <dt>Expansion rounds</dt><dd>{result.search.expansionRounds}/{result.search.maxExpansionRounds}</dd>
                <dt>Engine elapsed</dt><dd>{result.search.elapsedMs.toLocaleString()} ms</dd>
                <dt>Worker round trip</dt><dd>{runtimeMs?.toFixed(0)} ms</dd>
                <dt>Budget exhausted</dt><dd>{result.search.budgetExhausted ? 'yes' : 'no'}</dd>
                <dt>Raw inferred tags</dt><dd>{result.search.harvestActionScope.rawInferredTags.join(', ') || 'none'}</dd>
                <dt>Enabled Harvest crafts</dt>
                <dd>{result.search.harvestActionScope.enabledCrafts.map((craft) => craft.actionName).join(', ') || 'none'}</dd>
              </dl>
            </section>
            <section className="optimizer-card">
              <h2>Confidence</h2>
              <p><strong>Game mechanics fidelity:</strong> {result.mechanicsConfidence.gameMechanicsFidelity}</p>
              <p><strong>Selected policy prices:</strong> {result.priceConfidence.selectedPolicy.complete ? 'complete' : 'incomplete'} ({result.priceConfidence.selectedPolicy.warnings.length} warnings)</p>
              <p><strong>Broader search prices:</strong> {result.priceConfidence.consideredSearchSpace.complete ? 'complete' : 'incomplete'} ({result.priceConfidence.consideredSearchSpace.warnings.length} warnings)</p>
              <p><strong>Selected mechanics:</strong> {result.mechanicsConfidence.selectedPolicy.warnings.length} approximation warnings</p>
              <p><strong>Broader mechanics:</strong> {result.mechanicsConfidence.consideredSearchSpace.warnings.length} approximation warnings</p>
            </section>
          </div>

          {result.warningDetails.some((warning) => warning.category === 'DATA_FRESHNESS') && (
            <section className="optimizer-card warnings">
              <h2>Data freshness</h2>
              <ul>{result.warningDetails.filter((warning) => warning.category === 'DATA_FRESHNESS').map((warning) => (
                <li key={warning.message}>{warning.message}</li>
              ))}</ul>
            </section>
          )}
          {result.warningDetails.some((warning) => warning.category === 'CONSIDERED_ALTERNATIVE') && (
            <details className="optimizer-card warnings">
              <summary>Considered-alternative warnings</summary>
              <ul>{result.warningDetails.filter((warning) => warning.category === 'CONSIDERED_ALTERNATIVE').map((warning) => (
                <li key={warning.message}>{warning.message}</li>
              ))}</ul>
            </details>
          )}
        </div>
      )}
    </main>
  );
}

export default CraftOptimizer;
