import { useEffect, useMemo, useRef, useState } from 'react';
import type { BaseType } from '../crafting-engine/src/domain/ItemState.ts';
import type {
  AcquisitionCandidateSummary,
  OptimizeCraftInput,
  OptimizeCraftResult,
  PolicyExplanationRule,
  RecommendationStatus,
} from '../crafting-engine/src/service/optimizerService.ts';
import type { SearchIntent } from '../crafting-engine/src/service/searchRuntime.ts';
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
const TARGET_MOD_GROUP_ORDER = [
  'Ordinary Prefix',
  'Ordinary Suffix',
  'Notable Prefix',
  'Notable Suffix',
] as const;

const STATUS_COPY: Record<RecommendationStatus, { title: string; detail: string }> = {
  PROVEN_OPTIMAL: {
    title: 'Proven optimal over the modeled search space',
    detail: 'Every modeled competitor was resolved or safely bounded for this search.',
  },
  BEST_RESOLVED_ACQUISITION_SAFE: {
    title: 'Recommended route found',
    detail: 'The starting acquisition is safe among modeled families; the exact crafting policy may still improve.',
  },
  PROVISIONAL_RESOLVED: {
    title: 'Provisional route',
    detail: 'This route is executable, but a cheaper unresolved acquisition may exist.',
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

function candidatePlayerLabel(
  candidate: AcquisitionCandidateSummary | undefined,
  mods: ReturnType<typeof browserCraftingCatalog.getEligibleMods>,
): string | undefined {
  if (!candidate || candidate.label === 'Clean Base') return candidate?.label;
  const fracturedModIds = new Set(candidate.physicalStateSignature.split('|').flatMap((segment) => {
    const [genType, modId, , fractureFlag] = segment.split(':');
    return (genType === 'Prefix' || genType === 'Suffix') && fractureFlag === 'F' && modId
      ? [modId]
      : [];
  }));
  return mods.find((mod) => fracturedModIds.has(mod.modId))?.displayName ?? 'Fractured target modifier';
}

function playerActionName(actionId: string, actionName: string, recommendedStart: string): string {
  if (!actionId.startsWith('acquire_')) return actionName;
  return recommendedStart === 'Clean Base'
    ? 'Acquire a clean base'
    : `Acquire ${recommendedStart}`;
}

function playerModName(
  modId: string,
  mods: ReturnType<typeof browserCraftingCatalog.getEligibleMods>,
): string {
  return mods.find((mod) => mod.modId === modId)?.displayName ?? modId;
}

function renderPolicyCondition(
  rule: PolicyExplanationRule,
  mods: ReturnType<typeof browserCraftingCatalog.getEligibleMods>,
): string {
  const { context } = rule;
  if (context.acquisitionMenu) return 'Start: choose an acquisition route';
  const display = (modId: string): string => {
    const match = mods.find((mod) => mod.modId === modId);
    if (!match) return modId;
    const duplicateDisplay = mods.some(
      (mod) => mod.modId !== modId && mod.displayName === match.displayName
    );
    return duplicateDisplay ? `${match.displayName} [${modId}]` : match.displayName;
  };
  const formatAffix = (
    affix: PolicyExplanationRule['context']['prefixes'][number],
  ): string => {
    const roll = affix.currentRoll?.length ? ` (roll ${affix.currentRoll.join('/')})` : '';
    const label = display(affix.modId);
    const tier = label.includes(`(T${affix.tier})`) ? '' : ` (T${affix.tier})`;
    return `${affix.isFractured ? 'fractured ' : ''}${label}${tier}${roll}`;
  };
  const exactAffixState = [
    ...context.prefixes.map((affix) => `prefix ${formatAffix(affix)}`),
    ...context.suffixes.map((affix) => `suffix ${formatAffix(affix)}`),
  ];
  const details = [
    context.matchedTargetModIds.length > 0
      ? `target present: ${context.matchedTargetModIds.map(display).join(', ')}`
      : 'no target modifier present',
    context.unmatchedTargetModIds.length > 0
      ? `target missing: ${context.unmatchedTargetModIds.map(display).join(', ')}`
      : 'all target modifiers present',
    context.disambiguateAffixes && exactAffixState.length > 0
      ? `exact affix state: ${exactAffixState.join(', ')}`
      : undefined,
    context.influenced ? 'influenced' : undefined,
    context.synthesised ? 'synthesised' : undefined,
  ].filter((detail): detail is string => detail !== undefined);
  return `${context.rarity} ${context.prefixCount}P/${context.suffixCount}S; ${details.join('; ')}`;
}

function playerWarning(message: string): string {
  const separator = message.indexOf(':');
  const heading = separator === -1 ? message : message.slice(0, separator);
  if (!/^[A-Z0-9 /-]+$/.test(heading)) return message;
  const sentenceHeading = heading.charAt(0) + heading.slice(1).toLowerCase();
  return separator === -1
    ? sentenceHeading
    : `${sentenceHeading}${message.slice(separator)}`;
}

function age(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return 'unknown';
  const days = value / 86_400_000;
  return days < 1 ? `${(value / 3_600_000).toFixed(1)} hours` : `${days.toFixed(1)} days`;
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
  const [finishCondition, setFinishCondition] = useState<'allow-extra' | 'no-unwanted'>('allow-extra');
  const [modSearch, setModSearch] = useState('');
  const [cleanBaseCost, setCleanBaseCost] = useState('');
  const [saleValue, setSaleValue] = useState('');
  const pricingLeagues = useMemo(() => getOptimizerPricingLeagues(), []);
  const [league, setLeague] = useState(pricingLeagues[0] ?? '');
  const [allowFallback, setAllowFallback] = useState(true);
  const [maxStates, setMaxStates] = useState(DEFAULT_BUDGET.maxStates);
  const [maxWallTimeMs, setMaxWallTimeMs] = useState(DEFAULT_BUDGET.maxWallTimeMs);
  const [maxExpansionRounds, setMaxExpansionRounds] = useState(DEFAULT_BUDGET.maxExpansionRounds);
  const [searchIntent, setSearchIntent] = useState<SearchIntent>('RECOMMEND');
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
      mod.searchAliases.some((alias) => alias.toLowerCase().includes(needle))
    );
    const groups = new Map<string, typeof filtered>();
    for (const mod of filtered) {
      const key = `${mod.isNotable ? 'Notable' : 'Ordinary'} ${mod.genType}`;
      const entries = groups.get(key) ?? [];
      entries.push(mod);
      groups.set(key, entries);
    }
    return [...groups.entries()].sort(([left], [right]) =>
      TARGET_MOD_GROUP_ORDER.indexOf(left as typeof TARGET_MOD_GROUP_ORDER[number]) -
      TARGET_MOD_GROUP_ORDER.indexOf(right as typeof TARGET_MOD_GROUP_ORDER[number])
    );
  }, [eligibleMods, modSearch, selectedTargetIds]);

  const draftInput = useMemo((): OptimizeCraftInput => {
    const manualClean = cleanBaseCost.trim() === '' ? undefined : Number(cleanBaseCost);
    const parsedSaleValue = saleValue.trim() === '' ? undefined : Number(saleValue);
    return {
      baseType,
      clusterType,
      itemLevel,
      passiveCount,
      target: {
        requiredMods: selectedTargetIds.map((modId) => ({ modId })),
        requiredRarity: effectiveRarity === 'any' ? undefined : effectiveRarity,
        finalStateConstraints: finishCondition === 'no-unwanted'
          ? { maxUnmatchedAffixes: 0 }
          : undefined,
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
      },
      marketContext: marketPricing?.marketContext,
      expectedSaleValueChaos: Number.isFinite(parsedSaleValue) && parsedSaleValue !== undefined && parsedSaleValue >= 0
        ? parsedSaleValue
        : undefined,
      allowResearchFallbackPrices: allowFallback,
      searchBudget: { maxStates, maxWallTimeMs, maxExpansionRounds },
      searchIntent,
    };
  }, [
    allowFallback,
    baseType,
    cleanBaseCost,
    clusterType,
    effectiveRarity,
    finishCondition,
    itemLevel,
    marketPricing,
    maxExpansionRounds,
    maxStates,
    maxWallTimeMs,
    passiveCount,
    saleValue,
    searchIntent,
    selectedTargetIds,
  ]);
  const validation = useMemo(() => validateBrowserOptimizeInput(draftInput), [draftInput]);
  const previousDraftInputRef = useRef(draftInput);

  useEffect(() => {
    if (previousDraftInputRef.current === draftInput) return;
    previousDraftInputRef.current = draftInput;
    setResult(null);
  }, [draftInput]);

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

  const optimize = async (
    budget = { maxStates, maxWallTimeMs, maxExpansionRounds },
    intent: SearchIntent = searchIntent
  ) => {
    if (validationError || !workerRef.current) return;
    const requestValidation = validateBrowserOptimizeInput({
      ...draftInput,
      searchBudget: budget,
      searchIntent: intent,
    });
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
    setSearchIntent('DEEPEN');
    void optimize(budget, 'DEEPEN');
  };

  const cancel = () => workerRef.current?.cancel();
  const selectedAcquisition = result?.acquisition.candidates.find(
    (candidate) => candidate.id === result.acquisition.selectedCandidateId,
  );
  const selectedMethod = selectedAcquisition?.methods.find(
    (method) => method.id === result?.acquisition.selectedMethodId,
  );
  const selectedAcquisitionLabel = candidatePlayerLabel(selectedAcquisition, eligibleMods);
  const recommendedStart = selectedMethod?.executable && selectedAcquisitionLabel
    ? `Self-fracture ${selectedAcquisitionLabel}`
    : selectedAcquisitionLabel ?? result?.recommended?.name ?? 'No start certified under this budget';
  const materialWarnings = result?.warningDetails.filter((warning) =>
    warning.category === 'SELECTED_ROUTE' ||
    warning.category === 'DATA_FRESHNESS' ||
    (warning.category === 'PROOF_SEARCH' && (
      result.recommendationStatus === 'PROVISIONAL_RESOLVED' ||
      result.recommendationStatus === 'NO_RESOLVED_ROUTE'
    ))
  ) ?? [];
  const selectedSynthesis = selectedMethod?.executable ? selectedAcquisition?.synthesis : undefined;

  return (
    <main className="optimizer-page">
      <p className="subtitle">
        Find the cheapest modeled way to acquire and craft your target cluster jewel. The guide
        follows the optimizer's actual branching policy and keeps technical proof details available.
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
            <span>Extra affixes</span>
            <select value={finishCondition} onChange={(event) => setFinishCondition(event.target.value as typeof finishCondition)}>
              <option value="allow-extra">Allow extra affixes</option>
              <option value="no-unwanted">No unwanted affixes</option>
            </select>
          </label>
        </div>

        <p className="muted">
          {marketPricing?.marketContext.cleanBaseQuote.provenance ?? 'No league price snapshot is available.'}
        </p>
        <details className="pricing-controls">
          <summary>Pricing &amp; optional economics</summary>
          <div className="optimizer-grid">
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
          {marketPricing && (
            <details className="market-evidence">
              <summary>Market evidence</summary>
              <dl>
                <dt>Sampled low</dt><dd>{chaos(marketPricing.marketContext.cleanBaseQuote.lowChaos)}</dd>
                <dt>Sample midpoint</dt><dd>{chaos(marketPricing.marketContext.cleanBaseQuote.midChaos)}</dd>
                <dt>Listings/sample</dt>
                <dd>{marketPricing.marketContext.cleanBaseQuote.listed ?? 0} / {marketPricing.marketContext.cleanBaseQuote.sampled ?? 0}</dd>
                <dt>Quote timestamp</dt><dd>{marketPricing.marketContext.cleanBaseQuote.at ?? 'unavailable'}</dd>
                <dt>Quote age</dt><dd>{age(marketPricing.marketContext.cleanBaseQuote.ageMs)}{marketPricing.marketContext.cleanBaseQuote.stale ? ' (stale)' : ''}</dd>
                <dt>Currency-rate age</dt><dd>{age(marketPricing.marketContext.currencyRatesAgeMs)}{marketPricing.marketContext.currencyRatesStale ? ' (stale)' : ''}</dd>
                <dt>Snapshot age</dt><dd>{age(marketPricing.marketContext.snapshotAgeMs)}{marketPricing.marketContext.snapshotStale ? ' (stale)' : ''}</dd>
              </dl>
            </details>
          )}
        </details>

        <div className="target-list">
          <h3>Desired exact modifiers ({targetModIds.length}/4)</h3>
          <label>
            <span>Search modifiers</span>
            <input
              type="search"
              value={modSearch}
              placeholder="Granted stat, internal name, mod ID, tier…"
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
                      <option
                        key={mod.modId}
                        value={mod.modId}
                        data-primary-label={mod.displayName}
                        data-technical-name={mod.technicalName}
                      >
                        {mod.selectionLabel}
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
          <p className="muted">
            Relevant fractured bases are manufactured through executable self-fracture synthesis;
            no pre-fractured market quote is required or ranked.
          </p>
        </div>

        <section className="target-summary">
          <h3>Target summary</h3>
          <p>{baseType} · {clusterType} · ilvl {itemLevel} · {passiveCount} passives</p>
          <p>Final rarity: {validation.normalizedInput.target.requiredRarity ?? 'Any'}</p>
          <p>Extra affixes: {validation.normalizedInput.target.finalStateConstraints?.maxUnmatchedAffixes === 0 ? 'No unwanted affixes' : 'Allowed'}</p>
          <ul>
            {validation.normalizedInput.target.requiredMods.map((requirement, index) => (
              <li key={`${requirement.modId}-${index}`} data-mod-id={requirement.modId}>
                {(() => {
                  const mod = eligibleMods.find((candidate) => candidate.modId === requirement.modId);
                  return mod ? (
                    <>
                      <strong>{mod.displayName}</strong> · {mod.genType}, ilvl {mod.requiredItemLevel}
                      <details><summary>Technical modifier details</summary><code>{mod.technicalLabel}</code></details>
                    </>
                  ) : requirement.modId;
                })()}
              </li>
            ))}
          </ul>
          {validation.notices.map((notice) => <p className="muted" key={notice.code}>{notice.message}</p>)}
        </section>

        <details className="advanced-controls">
          <summary>Advanced search settings</summary>
          <p>Defaults: 5,000 states, 30,000 ms, 3 lazy-expansion rounds.</p>
          <div className="optimizer-grid">
            <label>
              <span>Search intent</span>
              <select value={searchIntent} onChange={(event) => setSearchIntent(event.target.value as SearchIntent)}>
                <option value="RECOMMEND">Recommend quickly</option>
                <option value="DEEPEN">Deepen competitors</option>
                <option value="PROVE">Attempt proof</option>
              </select>
            </label>
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
            {running ? 'Searching…' : 'Find cheapest craft'}
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
          <section className="optimizer-card optimizer-summary recommendation-hero">
            <div className="recommendation-heading">
              <h2>{result.recommendationStatus === 'NO_RESOLVED_ROUTE' ? 'Search outcome' : 'Craft recommendation'}</h2>
              <span className={`confidence-badge ${result.recommendationStatus.toLowerCase()}`}>
                {result.recommendationStatus === 'PROVEN_OPTIMAL'
                  ? 'Proven optimal'
                  : result.recommendationStatus === 'BEST_RESOLVED_ACQUISITION_SAFE'
                    ? 'Acquisition-safe start'
                    : result.recommendationStatus === 'PROVISIONAL_RESOLVED'
                      ? 'Provisional — acquisition not yet safe'
                      : 'No resolved route'}
              </span>
            </div>
            <div className="recommendation-target">
              <span>Target</span>
              <strong>{result.target.requiredMods.map((requirement) =>
                eligibleMods.find((mod) => mod.modId === requirement.modId)?.displayName ?? requirement.modId
              ).join(' + ')} · {result.target.requiredRarity ?? 'Any rarity'}</strong>
            </div>
            <dl className="recommendation-facts">
              <dt>{result.recommendationStatus === 'NO_RESOLVED_ROUTE' ? 'Resolved start' : 'Recommended start'}</dt><dd>{recommendedStart}</dd>
              <dt>Expected cost</dt><dd className="recommendation-cost">{chaos(result.expectedCostChaos)}</dd>
              {result.expectedSaleValueChaos !== undefined && <><dt>Expected sale value</dt><dd>{chaos(result.expectedSaleValueChaos)}</dd></>}
              {result.expectedProfitChaos !== undefined && <><dt>Expected profit</dt><dd>{chaos(result.expectedProfitChaos)}</dd></>}
              <dt>Starting acquisition confidence</dt>
              <dd>{result.recommendationStatus === 'NO_RESOLVED_ROUTE'
                ? 'No fully resolved route is available'
                : result.recommendationStatus === 'PROVISIONAL_RESOLVED'
                  ? 'Not acquisition-safe; cheaper unresolved acquisition may exist'
                  : result.recommendationStatus === 'PROVEN_OPTIMAL'
                    ? 'Proven optimal over the modeled search space'
                    : 'Acquisition-safe'}</dd>
              <dt>Crafting strategy confidence</dt>
              <dd>{result.policyRefinement.status === 'MODELED_OPTIMAL'
                ? 'Modeled-action optimality proven'
                : result.policyRefinement.status === 'STILL_IMPROVING_AT_BUDGET'
                  ? 'Current best — still improving at the search budget'
                  : result.policyRefinement.status === 'CURRENT_BEST_UNPROVEN'
                    ? 'Current best — modeled optimality not proven'
                    : 'No executable downstream policy certified'}</dd>
              <dt>Finish condition</dt>
              <dd>{result.target.finalStateConstraints?.maxUnmatchedAffixes === 0 ? 'No unwanted affixes' : 'Extra affixes allowed'}</dd>
            </dl>
            <div className={`optimizer-proof ${result.recommendationStatus.toLowerCase()}`}>
              <strong>{STATUS_COPY[result.recommendationStatus].title}</strong>
              <span>{STATUS_COPY[result.recommendationStatus].detail}</span>
            </div>
            {result.recommended !== null && result.policyRefinement.status !== 'MODELED_OPTIMAL' && (
              <div className={`optimizer-proof policy-${result.policyRefinement.status.toLowerCase()}`}>
                <strong>{result.policyRefinement.status === 'STILL_IMPROVING_AT_BUDGET'
                  ? 'Crafting strategy was still improving'
                  : 'Crafting strategy is the current best found'}</strong>
                <span>{result.policyRefinement.explanation}</span>
              </div>
            )}
            {result.recommendationStatus === 'PROVISIONAL_RESOLVED' && (
              <div className="provisional-warning" role="alert">
                <strong>Do not treat this as the final cheapest recommendation.</strong>
                <span>The displayed incumbent is executable, but acquisition safety is not established because a cheaper unresolved route may exist.</span>
              </div>
            )}
            {result.recommendationStatus === 'NO_RESOLVED_ROUTE' && (
              <div className="no-route-warning" role="alert">
                <strong>No craft recommendation is available from this search.</strong>
                <span>Nothing displayed below should be treated as a resolved route. Increase a search budget or adjust the target.</span>
              </div>
            )}
            {materialWarnings.length > 0 && (
              <section className="decision-warnings" aria-label="Important recommendation warnings">
                <h3>Important for this recommendation</h3>
                <ul>
                  {materialWarnings.map((warning) => (
                    <li key={`${warning.category}-${warning.message}`}>{playerWarning(warning.message)}</li>
                  ))}
                </ul>
              </section>
            )}
            {(result.recommendationStatus !== 'PROVEN_OPTIMAL' || result.search.budgetExhausted) && (
              <button type="button" className="secondary" onClick={retryDeeper}>Retry deeper</button>
            )}
          </section>

          <section className="optimizer-card craft-guide" aria-labelledby="craft-guide-title">
            <h2 id="craft-guide-title">How to craft it</h2>
            {result.recommended && result.craftPlan.status === 'CERTIFIED' ? (
              <>
                <div className="craft-start">
                  <span>Starting point</span>
                  <strong>{recommendedStart}</strong>
                  <p>This condensed playbook puts the selected policy in chronological order. Repeat its recovery loop after misses, and expand Decision details when the exact current affixes matter.</p>
                </div>
                <ol className="craft-plan" data-plan-status={result.craftPlan.status}>
                  {result.craftPlan.steps.map((step, stepIndex) => {
                    const recoveryIndex = step.recoveryTargetStepId === undefined
                      ? undefined
                      : result.craftPlan.steps.findIndex((candidate) => candidate.id === step.recoveryTargetStepId);
                    const preferredTargets = step.preferredTargetModIds?.map((modId) =>
                      playerModName(modId, eligibleMods)
                    ) ?? [];
                    return <li
                      className="craft-plan-step"
                      key={step.id}
                      data-step-id={step.id}
                      data-phase={step.phase}
                      data-action-ids={step.actionIds.join(',')}
                    >
                      <span className="craft-plan-number" aria-hidden="true">{stepIndex + 1}</span>
                      <div className="craft-plan-step-body">
                        <h3>{preferredTargets.length > 0
                          ? `${step.title}: ${preferredTargets.join(' + ')}`
                          : step.title}</h3>
                        <p>{step.instruction}</p>
                        {step.actionIds.length > 0 && (
                          <p className="craft-plan-actions"><strong>Selected actions:</strong>{' '}
                            {step.actionIds.map((actionId, actionIndex) =>
                              playerActionName(
                                actionId,
                                step.actionNames[actionIndex] ?? actionId,
                                recommendedStart,
                              )
                            ).join(', ')}
                          </p>
                        )}
                        {step.phase === 'ACQUIRE' && selectedSynthesis && (
                          <details className="selected-fracture-guide">
                            <summary>Self-fracture materials and recovery</summary>
                            <p>{selectedSynthesis.explanation}</p>
                            <dl>
                              <dt>Expected Fracturing Orbs</dt>
                              <dd>{selectedSynthesis.expectedFracturingOrbs === undefined ? '—' : count(selectedSynthesis.expectedFracturingOrbs)}</dd>
                              <dt>Expected clean-base retries</dt>
                              <dd>{selectedSynthesis.expectedRestarts === undefined ? '—' : count(selectedSynthesis.expectedRestarts)}</dd>
                            </dl>
                            {selectedSynthesis.wrongFractureRecovery && (
                              <p className="fracture-recovery"><strong>Wrong fracture:</strong> {selectedSynthesis.wrongFractureRecovery.note}</p>
                            )}
                          </details>
                        )}
                        {step.decisionDetails.map((decision) => (
                          <details className="craft-plan-decision-details" key={decision.id}>
                            <summary>Decision details</summary>
                            <p>{decision.summary}</p>
                            <ul>{decision.options.map((option) => {
                              const exampleRule = result.policyExplanation[option.policyRuleIndices[0]];
                              return <li
                                key={option.actionId}
                                data-action-id={option.actionId}
                                data-policy-rule-indices={option.policyRuleIndices.join(',')}
                              >
                                <strong>{playerActionName(option.actionId, option.action, recommendedStart)}</strong>
                                <span>{option.representedStateCount} represented states · {count(option.expectedVisits)} expected visits</span>
                                {exampleRule && <span className="craft-plan-decision-example">Example: {renderPolicyCondition(exampleRule, eligibleMods)}</span>}
                                {option.policyRuleIndices.length > 1 && <span className="muted">{option.policyRuleIndices.length - 1} more exact cases are retained in Advanced optimizer details.</span>}
                              </li>;
                            })}</ul>
                          </details>
                        ))}
                        {recoveryIndex !== undefined && recoveryIndex >= 0 && (
                          <p className="craft-plan-loop"><strong>Return to Step {recoveryIndex + 1}.</strong></p>
                        )}
                      </div>
                    </li>;
                  })}
                </ol>
                {result.craftPlan.optimalityNote && <p className="craft-plan-optimality">{result.craftPlan.optimalityNote}</p>}
              </>
            ) : <p>No certified acquisition route is available under this search budget.</p>}
          </section>

          {result.recommended !== null && <section className="optimizer-card expected-materials" aria-labelledby="expected-materials-title">
            <h2 id="expected-materials-title">Expected materials</h2>
            <p className="muted">These are long-run averages from the selected policy, so fractional usage is expected rather than a guaranteed whole-number shopping list.</p>
            {result.expectedActionUsage.length > 0 ? (
              <table><thead><tr><th>Material or action</th><th>Expected usage</th><th>Expected cost</th></tr></thead>
                <tbody>{result.expectedActionUsage.map((usage) => (
                  <tr
                    key={usage.actionId}
                    data-action-id={usage.actionId}
                    data-expected-count={usage.expectedCount}
                    data-expected-cost={usage.expectedCostChaos}
                  >
                    <td>{playerActionName(usage.actionId, usage.actionName, recommendedStart)}</td><td>{count(usage.expectedCount)}</td><td>{chaos(usage.expectedCostChaos)}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p>No resolved expected material usage is available.</p>}
            {Object.keys(result.expectedCurrencies).length > 0 && (
              <details className="currency-summary">
                <summary>Expected currency totals</summary>
                <ul className="currency-usage">
                  {Object.entries(result.expectedCurrencies).map(([currency, amount]) => (
                    <li key={currency}><span>{currency}</span><strong>{amount === null ? '—' : count(amount)}</strong></li>
                  ))}
                </ul>
              </details>
            )}
          </section>}

          <details className="optimizer-card advanced-optimizer-details">
            <summary>
              <strong>Advanced optimizer details</strong>
              <span>Proof bounds, policy health, search performance, and acquisition research</span>
            </summary>
            <div className="advanced-details-content">
              <section className="advanced-section raw-proof-details">
                <h2>Recommendation proof</h2>
                <dl>
                  <dt>Raw recommendation status</dt><dd>{result.recommendationStatus}</dd>
                  <dt>Raw proof level</dt><dd>{result.proof.proofLevel}</dd>
                  <dt>Global optimality</dt><dd>{result.proof.globalOptimality}</dd>
                  <dt>Acquisition selection safe</dt><dd>{result.acquisition.selectionSafe ? 'yes' : 'no'}</dd>
                  <dt>Downstream policy status</dt><dd>{result.policyRefinement.status}</dd>
                  <dt>Downstream refinement stop</dt><dd>{result.policyRefinement.stopReason}</dd>
                  {result.policyRefinement.firstCertifiedUpperBoundChaos !== undefined && <><dt>First certified policy U</dt><dd>{chaos(result.policyRefinement.firstCertifiedUpperBoundChaos)}</dd></>}
                  {result.policyRefinement.finalUpperBoundChaos !== undefined && <><dt>Final returned policy U</dt><dd>{chaos(result.policyRefinement.finalUpperBoundChaos)}</dd></>}
                  {result.policyRefinement.improvementFraction !== undefined && <><dt>Refinement improvement</dt><dd>{chaos(result.policyRefinement.improvementChaos)} ({(result.policyRefinement.improvementFraction * 100).toFixed(2)}%)</dd></>}
                  {result.policyRefinement.unresolvedCompetitiveLowerBoundChaos !== undefined && <><dt>Unresolved downstream competitive L</dt><dd>{chaos(result.policyRefinement.unresolvedCompetitiveLowerBoundChaos)}</dd></>}
                  {result.acquisition.resolvedIncumbentUpperBoundChaos !== undefined && <><dt>Resolved incumbent U</dt><dd>{chaos(result.acquisition.resolvedIncumbentUpperBoundChaos)}</dd></>}
                  {result.acquisition.bestUnresolvedLowerBoundChaos !== undefined && <><dt>Best unresolved acquisition L</dt><dd>{chaos(result.acquisition.bestUnresolvedLowerBoundChaos)}</dd></>}
                  {result.acquisition.potentialGapChaos !== undefined && <><dt>Potential acquisition gap</dt><dd>{chaos(result.acquisition.potentialGapChaos)}</dd></>}
                  <dt>Selected acquisition method</dt><dd>{selectedMethod?.label ?? 'none'}</dd>
                  <dt>Worker round trip</dt><dd>{runtimeMs === null ? 'not recorded' : `${runtimeMs.toFixed(0)} ms`}</dd>
                </dl>
                {selectedMethod && <p className="muted">{selectedMethod.provenance}</p>}
              </section>

              {result.recommended === null && result.expectedActionUsage.length > 0 && (
                <section className="advanced-section uncertified-exploratory-usage">
                  <h2>Uncertified exploratory policy usage</h2>
                  <p><strong>Not a valid craft estimate.</strong> No certified executable policy was selected under this budget. These raw counts are retained only as research diagnostics.</p>
                  <table><thead><tr><th>Exploratory action</th><th>Raw expected usage</th><th>Raw expected cost</th></tr></thead>
                    <tbody>{result.expectedActionUsage.map((usage) => (
                      <tr key={usage.actionId} data-action-id={usage.actionId}>
                        <td>{usage.actionName}</td><td>{count(usage.expectedCount)}</td><td>{chaos(usage.expectedCostChaos)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </section>
              )}

              <section className="advanced-section policy-health">
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

              <section className="advanced-section">
                <h2>Alternative acquisitions</h2>
                {result.alternatives.length > 0 ? (
                  <table><thead><tr><th>Route</th><th>Status</th><th>Expected total</th><th>Lower bound</th><th>Gap to incumbent</th><th>Could beat</th></tr></thead>
                    <tbody>{result.alternatives.map((route) => <tr key={route.actionId}><td>{route.name}</td><td>{route.status}</td><td>{chaos(route.expectedTotalCostChaos)}</td><td>{chaos(route.lowerBoundChaos)}</td><td>{chaos(route.optimalityGapChaos)}</td><td>{route.couldBeatResolvedIncumbent ? 'yes' : 'no'}</td></tr>)}</tbody>
                  </table>
                ) : <p>No alternative acquisition routes were generated.</p>}
              </section>

              <section className="advanced-section self-fracture-portfolio">
                <h2>Self-fracture synthesis portfolio</h2>
                <p className="muted">Only certified executable self-fracture routes enter ranking. Unresolved synthesis remains proof evidence; pre-fractured market purchases and the retired approximation are excluded.</p>
                <dl>
                  <dt>Stage mode</dt><dd>{result.acquisition.stage.mode}</dd>
                  <dt>Shared state budget</dt><dd>{result.acquisition.stage.totalStateBudget.toLocaleString()}</dd>
                  <dt>Shared wall-time budget</dt><dd>{result.acquisition.stage.totalWallTimeBudgetMs.toLocaleString()} ms</dd>
                  <dt>Certified candidates</dt><dd>{result.acquisition.stage.certifiedCandidates}/{result.acquisition.stage.candidateCount}</dd>
                  <dt>Exact-cache hits</dt><dd>{result.acquisition.stage.cacheHits}</dd>
                  <dt>Stage elapsed</dt><dd>{result.acquisition.stage.elapsedMs.toLocaleString()} ms</dd>
                  <dt>Allocation</dt><dd>{result.acquisition.stage.allocation}</dd>
                  <dt>Cache identity contract</dt><dd>{result.acquisition.stage.cacheIdentity}</dd>
                </dl>
                {result.acquisition.stage.cleanCertification && (
                  <details>
                    <summary>Clean-route certification prepass</summary>
                    <dl>
                      <dt>Certified</dt><dd>{result.acquisition.stage.cleanCertification.certified ? 'yes' : 'no'} — {result.acquisition.stage.cleanCertification.recommendationStatus}</dd>
                      <dt>Executable U</dt><dd>{chaos(result.acquisition.stage.cleanCertification.expectedTotalCostChaos)}</dd>
                      <dt>Optimistic L</dt><dd>{chaos(result.acquisition.stage.cleanCertification.lowerBoundChaos)}</dd>
                      <dt>Unresolved gap</dt><dd>{chaos(result.acquisition.stage.cleanCertification.optimalityGapChaos)}</dd>
                      <dt>States / cumulative work</dt><dd>{result.acquisition.stage.cleanCertification.statesExpanded.toLocaleString()} / {result.acquisition.stage.cleanCertification.cumulativeExpansionWork.toLocaleString()}</dd>
                      <dt>Rounds / elapsed</dt><dd>{result.acquisition.stage.cleanCertification.expansionRounds} / {result.acquisition.stage.cleanCertification.elapsedMs.toLocaleString()} ms</dd>
                      <dt>Proof health</dt><dd>{result.acquisition.stage.cleanCertification.proper ? 'proper' : 'improper'}, absorption {(result.acquisition.stage.cleanCertification.absorptionProbability * 100).toFixed(6)}%, {result.acquisition.stage.cleanCertification.costReconciled ? 'cost-reconciled' : 'not reconciled'}</dd>
                    </dl>
                  </details>
                )}
                {result.acquisition.candidates.some((candidate) => candidate.synthesis) ? (
                  <>
                    <table><thead><tr><th>Physical family</th><th>Status</th><th>Executable U</th><th>Combined L</th><th>Partial-graph L</th><th>Mechanics-required L</th><th>Fracturing Orbs</th><th>Restarts</th><th>Proof</th></tr></thead>
                      <tbody>{result.acquisition.candidates.filter((candidate) => candidate.synthesis).map((candidate) => {
                        const synthesis = candidate.synthesis!;
                        return <tr
                          key={candidate.id}
                          data-candidate-id={candidate.id}
                          data-player-label={candidatePlayerLabel(candidate, eligibleMods)}
                        >
                          <td>{candidatePlayerLabel(candidate, eligibleMods)}</td>
                          <td>{synthesis.status}</td>
                          <td>{chaos(synthesis.expectedCostChaos)}</td>
                          <td>{chaos(synthesis.lowerBoundChaos)}</td>
                          <td>{chaos(synthesis.lowerBoundEvidence.partialGraphLowerBoundChaos)}</td>
                          <td>{chaos(synthesis.lowerBoundEvidence.mandatoryMechanicsLowerBoundChaos)}</td>
                          <td>{synthesis.expectedFracturingOrbs === undefined ? '—' : count(synthesis.expectedFracturingOrbs)}</td>
                          <td>{synthesis.expectedRestarts === undefined ? '—' : count(synthesis.expectedRestarts)}</td>
                          <td>{synthesis.proof?.globalOptimality ?? synthesis.provenance}; mechanics price evidence {synthesis.lowerBoundEvidence.mechanics.components.map((component) => component.priceConfidence).join(', ') || 'none'}</td>
                        </tr>;
                      })}</tbody>
                    </table>
                    <div className="synthesis-explanations">
                      {result.acquisition.candidates.filter((candidate) => candidate.synthesis).map((candidate) => {
                        const synthesis = candidate.synthesis!;
                        const recovery = synthesis.wrongFractureRecovery;
                        return <details key={`${candidate.id}-explanation`}>
                          <summary>{candidatePlayerLabel(candidate, eligibleMods)} self-fracture explanation</summary>
                          <p>{synthesis.explanation}</p>
                          {recovery && (
                            <>
                              <p><strong>Wrong-fracture recovery:</strong> {recovery.note}</p>
                              <dl>
                                <dt>Wrong-fracture states / expected visits</dt><dd>{recovery.states} / {count(recovery.expectedVisits)}</dd>
                                <dt>In-place reset available</dt><dd>{recovery.inPlaceResetAvailable ? 'yes' : 'no'}</dd>
                                <dt>Expected restart cost</dt><dd>{chaos(recovery.expectedRestartCostChaos)}</dd>
                              </dl>
                              {recovery.recoveryActions.length > 0 && (
                                <ul>{recovery.recoveryActions.map((action) => (
                                  <li key={action.actionId}>{action.actionName}: {count(action.expectedVisits)} expected uses</li>
                                ))}</ul>
                              )}
                            </>
                          )}
                          {synthesis.search?.canonicalStateIdentity && <p className="muted">Canonical state identity: {synthesis.search.canonicalStateIdentity}</p>}
                        </details>;
                      })}
                    </div>
                  </>
                ) : <p>No fractured physical family was mechanically relevant.</p>}
              </section>

              {result.craftPlan.status === 'CERTIFIED' && (
                <details className="policy-rules target-order-evidence">
                  <summary>Target-order policy evidence</summary>
                  <p><strong>Classification:</strong>{' '}
                    {result.craftPlan.targetOrderPreference.kind === 'PREFER_TARGET_FIRST'
                      ? `Prefer ${result.craftPlan.targetOrderPreference.targetModIds.map((modId) => playerModName(modId, eligibleMods)).join(' + ')} first (${result.craftPlan.targetOrderPreference.strength.toLowerCase()})`
                      : 'No selected-policy target order'}</p>
                  <p>{result.craftPlan.targetOrderPreference.evidence}</p>
                  <table><thead><tr><th>Target present</th><th>Magic states</th><th>Expected visits</th><th>Preserve / reroll</th><th>Selected actions</th></tr></thead>
                    <tbody>{result.craftPlan.targetOrderPreference.behaviors.map((behavior) => (
                      <tr key={behavior.targetModId} data-target-mod-id={behavior.targetModId}>
                        <td>{playerModName(behavior.targetModId, eligibleMods)}</td>
                        <td>{behavior.representedMagicStates}</td>
                        <td>{count(behavior.expectedVisits)}</td>
                        <td>{behavior.preserveStates} / {behavior.rerollStates}</td>
                        <td>{behavior.selectedActions.map((action) => `${action.actionId} (${action.representedStates})`).join(', ') || 'none'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </details>
              )}

              <details className="policy-rules exact-policy-branches">
                <summary>Full exact policy branches ({result.policyExplanation.length})</summary>
                <p className="muted">These are the complete condition-to-action branches compressed by the chronological playbook above.</p>
                <div className="craft-rules">
                  {result.policyExplanation.map((rule) => {
                    const renderedCondition = renderPolicyCondition(rule, eligibleMods);
                    return <article
                      className="craft-rule"
                      key={`${JSON.stringify(rule.context)}\u0000${rule.actionId}`}
                      data-condition={renderedCondition}
                      data-action={rule.action}
                      data-action-id={rule.actionId}
                    >
                      <div><span>If</span><strong>{renderedCondition}</strong></div>
                      <span className="craft-rule-arrow" aria-hidden="true">→</span>
                      <div><span>Then</span><strong>{playerActionName(rule.actionId, rule.action, recommendedStart)}</strong></div>
                      <details>
                        <summary>Policy context</summary>
                        <p>{rule.representedStateCount} represented states · {count(rule.expectedVisits)} expected visits</p>
                        <p className="muted">Optimizer action: {rule.action}</p>
                        <p className="muted">Example engine state: {rule.exampleState}</p>
                      </details>
                    </article>;
                  })}
                </div>
              </details>

              <details className="policy-rules">
                <summary>Full on-policy rules ({result.policyRules.length})</summary>
                <table><thead><tr><th>Expected visits</th><th>State</th><th>Selected action</th><th>Continuation EV</th></tr></thead>
                  <tbody>{result.policyRules.map((rule) => <tr key={rule.stateKey}><td>{count(rule.expectedVisits)}</td><td>{rule.state}</td><td>{rule.selectedAction}</td><td>{chaos(rule.totalCostChaos)}</td></tr>)}</tbody>
                </table>
              </details>

              <div className="optimizer-result-grid">
                <section className="advanced-section search-performance">
                  <h2>Search budget and performance</h2>
                  <dl>
                    <dt>States expanded</dt><dd>{result.search.statesExpanded.toLocaleString()}</dd>
                    <dt>Expansion rounds</dt><dd>{result.search.expansionRounds}/{result.search.maxExpansionRounds}</dd>
                    <dt>Search intent</dt><dd>{result.search.intent}</dd>
                    <dt>Engine elapsed</dt><dd>{result.search.elapsedMs.toLocaleString()} ms</dd>
                    <dt>Total staged engine elapsed</dt><dd>{result.search.totalElapsedMs.toLocaleString()} ms</dd>
                    <dt>Engine / host deadline</dt><dd>{result.search.engineDeadlineMs} / {result.search.hostGuardDeadlineMs} ms</dd>
                    <dt>First completed round</dt><dd>{result.search.timeToFirstCompletedRoundMs === undefined ? 'not reached' : `${result.search.timeToFirstCompletedRoundMs} ms`}</dd>
                    <dt>First certified policy</dt><dd>{result.search.timeToFirstCertifiedPolicyMs === undefined ? 'not reached' : `${result.search.timeToFirstCertifiedPolicyMs} ms`}</dd>
                    <dt>First acquisition-safe recommendation</dt><dd>{result.search.timeToFirstUsefulRecommendationMs === undefined ? 'not reached' : `${result.search.timeToFirstUsefulRecommendationMs} ms`}</dd>
                    <dt>Minimum feasible rarity</dt><dd>{result.search.minimumFeasibleRarity.rarity} — {result.search.minimumFeasibleRarity.reason}</dd>
                    <dt>Returned at budget</dt><dd>{result.search.returnedAtBudget ? 'yes' : 'no'}</dd>
                    <dt>Host guard triggered</dt><dd>{result.search.hostGuardTriggered ? 'yes' : 'no'}</dd>
                    <dt>Expansion architecture</dt><dd>{result.search.expansionMode}</dd>
                    <dt>Retry session</dt><dd>{result.search.sessionReuse.status} — {result.search.sessionReuse.scope} ({result.search.sessionReuse.identityHash})</dd>
                    {result.search.sessionReuse.missReason && <><dt>Session miss reason</dt><dd>{result.search.sessionReuse.missReason}</dd></>}
                    <dt>Prior-request states retained</dt><dd>{result.search.sessionReuse.retainedStates.toLocaleString()}</dd>
                    <dt>Prior transition distributions retained</dt><dd>{result.search.sessionReuse.retainedTransitionDistributions.toLocaleString()}</dd>
                    <dt>Actual canonical states fully re-expanded</dt><dd>{result.search.repeatedStatesExpanded.toLocaleString()}</dd>
                    <dt>Retained nodes revisited for deferred edges</dt><dd>{result.search.previouslyExpandedNodesRevisited.toLocaleString()}</dd>
                    <dt>Transition distributions generated</dt><dd>{result.search.transitionDistributionsGenerated.toLocaleString()}</dd>
                    <dt>Transition distributions reused in this request</dt><dd>{result.search.transitionDistributionsReused.toLocaleString()}</dd>
                    <dt>Separate acquisition-feasibility states</dt><dd>{result.search.acquisitionFeasibilityStatesExpanded.toLocaleString()}</dd>
                    <dt>Expansion work from interrupted result rounds</dt><dd>{result.search.interruptedStatesExpanded.toLocaleString()}</dd>
                    <dt>Fair acquisition probes</dt><dd>{result.search.acquisitionFeasibility.certifiedCandidates}/{result.search.acquisitionFeasibility.attemptedCandidates} certified</dd>
                    <dt>Budget exhausted</dt><dd>{result.search.budgetExhausted ? 'yes' : 'no'}</dd>
                    <dt>Raw inferred tags</dt><dd>{result.search.harvestActionScope.rawInferredTags.join(', ') || 'none'}</dd>
                    <dt>Enabled Harvest crafts</dt><dd>{result.search.harvestActionScope.enabledCrafts.map((craft) => craft.actionName).join(', ') || 'none'}</dd>
                  </dl>
                  <details>
                    <summary>Stage timing</summary>
                    <table><tbody>{Object.entries(result.search.stageTimingMs).map(([stage, milliseconds]) => (
                      <tr key={stage}><th>{stage}</th><td>{milliseconds} ms</td></tr>
                    ))}</tbody></table>
                  </details>
                  <details>
                    <summary>Persistent expansion work by round</summary>
                    <p className="muted">Retained states keep their generated edges and are not counted as repeated expansion.</p>
                    <table><thead><tr><th>Round</th><th>New states</th><th>Retained states</th><th>Transitions generated / reused</th><th>Prior nodes revisited</th></tr></thead>
                      <tbody>{result.search.newStatesByRound.map((newStates, index) => (
                        <tr key={index}><td>{index + 1}</td><td>{newStates}</td><td>{result.search.retainedStatesReusedByRound[index] ?? 0}</td><td>{result.search.transitionDistributionsGeneratedByRound[index] ?? 0} / {result.search.transitionDistributionsReusedByRound[index] ?? 0}</td><td>{result.search.previouslyExpandedNodesRevisitedByRound[index] ?? 0}</td></tr>
                      ))}</tbody>
                    </table>
                  </details>
                  {result.policyRefinement.incumbentHistory.length > 0 && (
                    <details>
                      <summary>Downstream incumbent history</summary>
                      <table><thead><tr><th>Round</th><th>Phase</th><th>Policy U</th><th>States</th><th>Elapsed</th></tr></thead>
                        <tbody>{result.policyRefinement.incumbentHistory.map((entry) => (
                          <tr key={`${entry.round}-${entry.phase}`}><td>{entry.round}</td><td>{entry.phase}</td><td>{chaos(entry.upperBoundChaos)}</td><td>{entry.statesExpanded.toLocaleString()}</td><td>{entry.elapsedMs.toLocaleString()} ms</td></tr>
                        ))}</tbody>
                      </table>
                    </details>
                  )}
                  {result.search.intent === 'DEEPEN' && (
                    <details>
                      <summary>DEEPEN frontier progress</summary>
                      <dl>
                        <dt>New canonical states</dt><dd>{result.search.deepenProgress.newCanonicalStates}</dd>
                        <dt>New acquisition upper bounds</dt><dd>{result.search.deepenProgress.newAcquisitionFeasibleUpperBounds}</dd>
                        <dt>Unresolved acquisitions</dt><dd>{result.search.deepenProgress.before.unresolvedAcquisitionCandidates} → {result.search.deepenProgress.after.unresolvedAcquisitionCandidates}</dd>
                        <dt>Best unresolved lower bound</dt><dd>{chaos(result.search.deepenProgress.before.bestUnresolvedAcquisitionLowerBoundChaos)} → {chaos(result.search.deepenProgress.after.bestUnresolvedAcquisitionLowerBoundChaos)}</dd>
                        <dt>Incumbent upper bound</dt><dd>{chaos(result.search.deepenProgress.before.incumbentUpperBoundChaos)} → {chaos(result.search.deepenProgress.after.incumbentUpperBoundChaos)}</dd>
                        <dt>Newly dominated</dt><dd>{result.search.deepenProgress.newlyDominatedByBound}</dd>
                        <dt>Optimality gap</dt><dd>{chaos(result.search.deepenProgress.before.optimalityGapChaos)} → {chaos(result.search.deepenProgress.after.optimalityGapChaos)}</dd>
                      </dl>
                      {result.search.deepenProgress.message && <p>{result.search.deepenProgress.message}</p>}
                    </details>
                  )}
                </section>
                <section className="advanced-section confidence-details">
                  <h2>Confidence</h2>
                  <p><strong>Game mechanics fidelity:</strong> {result.mechanicsConfidence.gameMechanicsFidelity}</p>
                  <p><strong>Selected policy prices:</strong> {result.priceConfidence.selectedPolicy.complete ? 'complete' : 'incomplete'} ({result.priceConfidence.selectedPolicy.warnings.length} warnings)</p>
                  <p><strong>Broader search prices:</strong> {result.priceConfidence.consideredSearchSpace.complete ? 'complete' : 'incomplete'} ({result.priceConfidence.consideredSearchSpace.warnings.length} warnings)</p>
                  <p><strong>Selected mechanics:</strong> {result.mechanicsConfidence.selectedPolicy.warnings.length} approximation warnings</p>
                  <p><strong>Broader mechanics:</strong> {result.mechanicsConfidence.consideredSearchSpace.warnings.length} approximation warnings</p>
                </section>
              </div>

              {result.marketContext && (
                <details className="currency-coverage">
                  <summary>Currency mapping coverage</summary>
                  <p><strong>Mapped and present:</strong> {result.marketContext.currencyCoverage.mappedAndPresent.join(', ') || 'none'}</p>
                  <p><strong>Mapped but missing:</strong> {result.marketContext.currencyCoverage.mappedButMissing.join(', ') || 'none'}</p>
                  <p><strong>Unmapped engine currencies:</strong> {result.marketContext.currencyCoverage.unmappedEngineCurrencies.join(', ') || 'none'}</p>
                </details>
              )}

              {result.warningDetails.length > 0 && (
                <section className="advanced-section all-warnings">
                  <h2>All warning evidence</h2>
                  <ul>{result.warningDetails.map((warning) => (
                    <li key={`${warning.category}-${warning.message}`}><strong>{warning.category}:</strong> {warning.message}</li>
                  ))}</ul>
                </section>
              )}
            </div>
          </details>
        </div>
      )}
    </main>
  );
}

export default CraftOptimizer;
