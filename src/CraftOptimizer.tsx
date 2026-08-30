import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BaseType } from '../crafting-engine/src/domain/ItemState.ts';
import type { TargetDefinition } from '../crafting-engine/src/domain/TargetDefinition.ts';
import type {
  AcquisitionCandidateSummary,
  AcquisitionPortfolioProofReason,
  AcquisitionPortfolioProofStatus,
  OptimizationObjectiveKind,
  OptimizationObjectiveSpec,
  OptimizeCraftInput,
  OptimizeCraftResult,
  OptimizerProgressSnapshot,
  PolicyExplanationRule,
  RecommendationStatus,
  MethodFamilyResult,
  OptimizationRequestStopReason,
} from '../crafting-engine/src/service/optimizerService.ts';
import {
  playerizeModifierText,
  type ModifierDisplayDescriptor,
} from '../crafting-engine/src/domain/ModifierDisplay.ts';
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
import { SearchableModifierSelect } from './SearchableModifierSelect.tsx';
import { buildVisualizationGraph } from '../crafting-engine/src/domain/VisualizationGraph.ts';
import { MarkovConstellation } from './components/MarkovConstellation.tsx';
import { GuidedCraftConstellation } from './components/GuidedCraftConstellation.tsx';
import { OnboardingModal } from './components/OnboardingModal.tsx';
import { OptimizerDisclosure } from './components/OptimizerDisclosure.tsx';
import {
  encodeCraftToUrl,
  decodeCraftFromUrl,
  generateBugReportBundle,
  type CraftSharePayload,
} from '../crafting-engine/src/service/shareBundle.ts';
import type { OptimizerSeed } from './optimizerSeed.ts';
import {
  attachClusterHandoff,
  detachedSaleValue,
  detachClusterHandoff as detachedHandoffState,
  handoffIdentitySnapshot,
  hydratedSaleValue,
  userSaleValue,
  type ClusterHandoffState,
  type SaleValueProvenance,
} from './optimizerHandoff.ts';
import {
  proofPresentation,
  searchEvidencePresentation,
} from './optimizerPresentation.ts';
import {
  importedEntryMode,
  OPTIMIZER_DISCLOSURE_DEFAULTS,
  type OptimizerEntryMode,
} from './optimizerInformationArchitecture.ts';

const DEFAULT_ITEM_LEVEL = 84;
interface SearchDepthBudget {
  maxStates: number;
  maxWallTimeMs: number;
  maxExpansionRounds: number;
}

const SEARCH_DEPTH_PRESETS = {
  NORMAL: { label: 'Normal', maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  DEEP: { label: 'Deep', maxStates: 10_000, maxWallTimeMs: 60_000, maxExpansionRounds: 4 },
  VERY_DEEP: { label: 'Very Deep', maxStates: 20_000, maxWallTimeMs: 120_000, maxExpansionRounds: 5 },
  RESEARCH: { label: 'Research', maxStates: 50_000, maxWallTimeMs: 300_000, maxExpansionRounds: 6 },
} as const;

type SearchDepthPreset = keyof typeof SEARCH_DEPTH_PRESETS | 'CUSTOM';
const SEARCH_DEPTH_ORDER: Array<Exclude<SearchDepthPreset, 'CUSTOM'>> = [
  'NORMAL',
  'DEEP',
  'VERY_DEEP',
  'RESEARCH',
];
const DEFAULT_BUDGET: SearchDepthBudget = SEARCH_DEPTH_PRESETS.NORMAL;

function matchingSearchDepthPreset(budget: SearchDepthBudget): SearchDepthPreset {
  return SEARCH_DEPTH_ORDER.find((preset) => {
    const candidate = SEARCH_DEPTH_PRESETS[preset];
    return candidate.maxStates === budget.maxStates &&
      candidate.maxWallTimeMs === budget.maxWallTimeMs &&
      candidate.maxExpansionRounds === budget.maxExpansionRounds;
  }) ?? 'CUSTOM';
}

function nextDeeperBudget(budget: SearchDepthBudget): SearchDepthBudget {
  return {
    maxStates: Math.max(budget.maxStates + 1, budget.maxStates * 2),
    maxWallTimeMs: Math.max(budget.maxWallTimeMs + 1, budget.maxWallTimeMs * 2),
    maxExpansionRounds: budget.maxExpansionRounds + 1,
  };
}

function compactBudgetValue(value: number): string {
  return value >= 1_000 && value % 1_000 === 0 ? `${value / 1_000}k` : value.toLocaleString();
}

function budgetPreview(budget: SearchDepthBudget): string {
  return `up to ${compactBudgetValue(budget.maxStates)} states · up to ${Math.round(budget.maxWallTimeMs / 1000)}s · ` +
    `${budget.maxExpansionRounds} rounds · reuses compatible retained graph`;
}

function nextNamedDepth(budget: SearchDepthBudget): Exclude<SearchDepthPreset, 'CUSTOM'> | undefined {
  return SEARCH_DEPTH_ORDER.find((preset) => {
    const candidate = SEARCH_DEPTH_PRESETS[preset];
    return candidate.maxStates > budget.maxStates ||
      candidate.maxWallTimeMs > budget.maxWallTimeMs ||
      candidate.maxExpansionRounds > budget.maxExpansionRounds;
  });
}

function RetryDeeperButton({
  onClick,
  preview,
  className = 'secondary',
}: {
  onClick: () => void;
  preview: SearchDepthBudget;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${className} retry-deeper-button`}
      onClick={onClick}
      aria-label="Retry Deeper"
      data-next-max-states={preview.maxStates}
      data-next-max-wall-time-ms={preview.maxWallTimeMs}
      data-next-max-expansion-rounds={preview.maxExpansionRounds}
    >
      <span>Retry deeper</span>
      <small>{budgetPreview(preview)}</small>
    </button>
  );
}

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
  INTERNAL_RESULT_MISMATCH: {
    title: 'Internal result mismatch',
    detail: 'The solver withheld this recommendation because its route, policy, and material totals did not reconcile.',
  },
};

const REQUEST_STOP_COPY: Record<OptimizationRequestStopReason, { label: string; retry: string }> = {
  PROOF_CLOSED: {
    label: 'Proof closed',
    retry: 'All modeled competitors were resolved or excluded by admissible bounds.',
  },
  STATE_CAP: {
    label: 'State cap reached',
    retry: 'The state cap limited the strongest competitor; Retry deeper increases the state envelope and reuses retained work.',
  },
  WALL_TIME: {
    label: 'Wall time reached',
    retry: 'Wall time limited this run; Retry deeper increases the time cap and reuses retained work.',
  },
  ROUND_CAP: {
    label: 'Round cap reached',
    retry: 'The expansion-round cap ended this run; Retry deeper adds another round and reuses retained work.',
  },
  NO_PRODUCTIVE_PROOF_WORK: {
    label: 'No productive proof work remained',
    retry: 'Recent tranches did not improve a bound or executable policy; Retry deeper may try the alternate retained proof stage.',
  },
  HOST_RESERVE: {
    label: 'Stopped for host safety reserve',
    retry: 'The engine preserved its shutdown/serialization reserve; Retry deeper increases the request cap and reuses retained work.',
  },
  CANCELLED: {
    label: 'Cancelled',
    retry: 'The request was cancelled; compatible retained work remains available.',
  },
  ERROR: {
    label: 'Stopped after an error',
    retry: 'The request stopped after an error; retry only after reviewing the reported failure.',
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
  return mods.find((mod) => fracturedModIds.has(mod.modId))?.compactText ?? 'Target modifier';
}

function publicModifierText(
  text: string,
  mods: readonly ModifierDisplayDescriptor[],
  form: 'primary' | 'compact' = 'compact',
): string {
  return playerizeModifierText(text, mods, form);
}

function methodFamilyPlayerName(
  method: MethodFamilyResult,
  mods: ReturnType<typeof browserCraftingCatalog.getEligibleMods>,
): string {
  const target = method.spec.targetFractureModId
    ? mods.find((mod) => mod.modId === method.spec.targetFractureModId)
    : undefined;
  if (target && method.spec.kind === 'SELF_FRACTURE') return `Self-fracture ${target.compactText}`;
  if (target && method.spec.kind === 'SELF_FRACTURE_HARVEST') {
    return `Self-fracture ${target.compactText} + Harvest`;
  }
  return publicModifierText(method.spec.name, mods);
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
  return mods.find((mod) => mod.modId === modId)?.primaryText ?? 'Exact modifier (see Technical details)';
}

function targetRequirementName(
  requirement: TargetDefinition['requiredMods'][number],
  mods: ReturnType<typeof browserCraftingCatalog.getEligibleMods>,
): string {
  return requirement.modId
    ? playerModName(requirement.modId, mods)
    : requirement.name ?? requirement.modGroup ?? 'Exact modifier';
}

function acceptableBranchName(
  branch: TargetDefinition['requiredMods'],
  mods: ReturnType<typeof browserCraftingCatalog.getEligibleMods>,
): string {
  return branch.map((requirement) => targetRequirementName(requirement, mods)).join(' + ');
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
  const progressNoun = context.progressKind === 'PREPARATION' ? 'preparation' : 'final';
  const progressLabel = context.progressKind === 'PREPARATION' ? 'prep' : 'final';
  const targetDefinition = context.requiredTargetModIds.length > 0
    ? `${context.progressKind === 'PREPARATION' ? 'preparation target' : 'required modifiers'}: ` +
      context.requiredTargetModIds.map(display).join(', ')
    : `${progressNoun} target context unavailable`;
  const acceptableDefinition = context.acceptableTargetBranches.length > 0
    ? `acceptable alternatives (any one): ${context.acceptableTargetBranches
        .map((branch) => branch.map(display).join(' + ')).join(' OR ')}`
    : undefined;
  const matchedAcceptable = context.matchedAcceptableTargetModIds.map(display);
  const details = [
    targetDefinition,
    `${progressLabel === 'prep' ? 'prep' : 'required'} progress: ` +
      `${context.matchedRequiredTargetModIds.length}/${context.requiredTargetModIds.length}`,
    context.matchedRequiredTargetModIds.length > 0
      ? `${progressNoun} required present: ${context.matchedRequiredTargetModIds.map(display).join(', ')}`
      : undefined,
    context.unmatchedRequiredTargetModIds.length > 0
      ? `${progressNoun} required missing: ${context.unmatchedRequiredTargetModIds.map(display).join(', ')}`
      : undefined,
    acceptableDefinition,
    context.acceptableTargetBranches.length > 0
      ? `acceptable alternative: ${context.acceptableAlternativeSatisfied ? '1/1' : '0/1'}` +
        (matchedAcceptable.length > 0 ? ` - ${matchedAcceptable.join(', ')}` : '')
      : undefined,
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

interface SearchActivityVisualizerProps {
  progress: OptimizerProgressSnapshot | null;
  running: boolean;
  selectedRouteName?: string;
  modifierDescriptors: ReturnType<typeof browserCraftingCatalog.getEligibleMods>;
  onRetryDeeper?: () => void;
  retryDeeperBudget: SearchDepthBudget;
  onCancel?: () => void;
}

const PORTFOLIO_PROOF_COPY: Record<AcquisitionPortfolioProofStatus, {
  title: string;
  detail: string;
}> = {
  PORTFOLIO_OPTIMAL: {
    title: 'Portfolio optimal',
    detail: 'The selected route and every modeled acquisition family are proven at this depth.',
  },
  SELECTED_ACQUISITION_SAFE: {
    title: 'Selected acquisition is safe',
    detail: 'Every competing acquisition family is resolved or bounded above the selected route.',
  },
  BEST_RESOLVED_UNPROVEN: {
    title: 'Best executable route found',
    detail: 'At least one unresolved family still has a full-route lower bound below the incumbent.',
  },
  NO_EXECUTABLE_ROUTE: {
    title: 'No executable route yet',
    detail: 'The current search depth has not produced a finite full-route upper bound.',
  },
};

const PROOF_REASON_COPY: Record<AcquisitionPortfolioProofReason, string> = {
  DEEPEST_COMPETITOR_LOWER_BOUND: 'Deepening the strongest remaining competitor bound.',
  CAN_STILL_BEAT_INCUMBENT: 'Its full-route lower bound can still beat the incumbent.',
  INCUMBENT_CHANGED_REEVALUATE: 'A new incumbent changed this candidate\'s proof priority.',
  RESOLVE_ACQUISITION_BEFORE_DOWNSTREAM: 'Acquisition must resolve before executable downstream work.',
  RESOLVE_DOWNSTREAM_AFTER_ACQUISITION: 'Acquisition resolved; downstream route is next.',
  DEEPEST_ACQUISITION_PROOF_DEBT: 'Acquisition has the larger unresolved proof gap.',
  DEEPEST_DOWNSTREAM_PROOF_DEBT: 'Downstream has the larger unresolved proof gap.',
  PROOF_PRODUCTIVITY_PRIORITY: 'Recent retained work has the strongest proof productivity.',
  SWITCH_AFTER_NO_PROOF_CHANGE: 'Repeated no-change work switched to the alternate proof stage.',
  DEPRIORITIZED_REPEATED_NO_CHANGE: 'Repeated no-change work was temporarily deprioritized.',
  DOMINATED_BY_FULL_ROUTE_BOUND: 'Its admissible full-route lower bound cannot beat the incumbent.',
  SELECTED_EXECUTABLE_ROUTE: 'This is the best executable full route found.',
  CLEAN_ROUTE_PROVEN: 'The clean route is resolved at the current allocated depth.',
  NO_EXECUTABLE_ROUTE: 'No executable full route has resolved for this family.',
};

const SEARCH_PHASE_LABELS: Record<OptimizerProgressSnapshot['phase'], string> = {
  INITIALIZING: 'Initializing Search Space',
  CLEAN_PROBE: 'Certifying Clean Base Route',
  FRACTURE_PROBE: 'Probing Self-Fracture Portfolios',
  FRACTURE_DEEPEN: 'Deepening Competitive Candidates',
  DOWNSTREAM_SOLVE: 'Solving Downstream Transition Policy',
  REFINEMENT: 'Refining Recommendation Proof',
  COMPLETE: 'Search Complete',
};

export function SearchActivityVisualizer({
  progress,
  running,
  selectedRouteName,
  modifierDescriptors,
  onRetryDeeper,
  retryDeeperBudget,
  onCancel,
}: SearchActivityVisualizerProps) {
  if (!progress && !running) return null;

  const currentPhase = progress?.phase ?? (running ? 'INITIALIZING' : 'COMPLETE');
  const elapsed = progress ? (progress.elapsedMs / 1000).toFixed(1) : '0.0';
  const totalStates = progress?.totalStatesExpanded ?? 0;
  const retainedStates = progress?.retainedStatesReused ?? 0;
  const proofStatus = progress?.portfolioProofStatus;
  const proofCopy = proofStatus ? PORTFOLIO_PROOF_COPY[proofStatus] : undefined;

  return (
    <section
      className="optimizer-card search-activity-card"
      aria-label="Search Activity"
      data-selected-route={selectedRouteName}
    >
      <div className="search-activity-header">
        <div className="search-activity-title-group">
          <div className="search-status-pill-container">
            <span className={`search-status-badge ${currentPhase.toLowerCase()} ${running ? 'pulse' : ''}`}>
              {running && <span className="status-spinner" />}
              {SEARCH_PHASE_LABELS[currentPhase] || currentPhase}
            </span>
            {progress?.sessionReuseStatus === 'RESUMED' && (
              <span className="session-reuse-chip resumed">
                ⚡ Graph Resumed ({retainedStates.toLocaleString()} states)
              </span>
            )}
            {progress?.sessionReuseStatus === 'INVALIDATED' && (
              <span className="session-reuse-chip invalidated">
                ↺ Graph Invalidated
              </span>
            )}
          </div>
          <p className="search-focus-text">
            {progress?.currentFocus
              ? publicModifierText(progress.currentFocus, modifierDescriptors)
              : running ? 'Analyzing reachable state graphs…' : 'Optimization finished.'}
          </p>
        </div>

        <div className="search-activity-actions">
          {running && onCancel && (
            <button type="button" className="secondary small-btn" onClick={onCancel}>
              Cancel
            </button>
          )}
          {!running && onRetryDeeper && (
            <RetryDeeperButton
              className="secondary small-btn"
              onClick={onRetryDeeper}
              preview={retryDeeperBudget}
            />
          )}
        </div>
      </div>

      {!running && selectedRouteName && (
        <p className="search-selected-route"><strong>Selected route:</strong> {selectedRouteName}</p>
      )}

      {/* Metrics Row */}
      <div className="search-metrics-bar">
        <div className="search-metric-item">
          <span className="metric-label">Total Portfolio States Expanded</span>
          <span className="metric-value">{totalStates.toLocaleString()}</span>
        </div>
        <div className="search-metric-item">
          <span className="metric-label">Portfolio States Retained / Reused</span>
          <span className="metric-value">{retainedStates.toLocaleString()}</span>
        </div>
        <div className="search-metric-item">
          <span className="metric-label">Elapsed Time</span>
          <span className="metric-value">{elapsed}s</span>
        </div>
        <div className="search-metric-item highlight">
          <span className="metric-label">Best Executable (U)</span>
          <span className="metric-value cost">
            {progress?.bestExecutableUpperBoundChaos !== undefined ? `${progress.bestExecutableUpperBoundChaos.toFixed(1)}c` : '—'}
          </span>
        </div>
        <div className="search-metric-item">
          <span className="metric-label">Active Bound (L)</span>
          <span className="metric-value">
            {progress?.bestUnresolvedLowerBoundChaos !== undefined ? `${progress.bestUnresolvedLowerBoundChaos.toFixed(1)}c` : '—'}
          </span>
        </div>
        <div className="search-metric-item">
          <span className="metric-label">Optimality Gap</span>
          <span className="metric-value">
            {progress?.potentialGapChaos !== undefined ? `${progress.potentialGapChaos.toFixed(1)}c` : '—'}
          </span>
        </div>
      </div>

      {proofStatus && proofCopy && (
        <div
          className={`portfolio-proof-meter ${proofStatus.toLowerCase()}`}
          role="status"
          aria-live="polite"
        >
          <div className="portfolio-proof-copy">
            <span className="portfolio-proof-eyebrow">Portfolio proof</span>
            <strong>{proofCopy.title}</strong>
            <span>{proofCopy.detail}</span>
          </div>
          <dl className="portfolio-proof-counts">
            <div>
              <dt>Competitive</dt>
              <dd>{progress?.unresolvedCompetitiveCandidates ?? 0}</dd>
            </div>
            <div>
              <dt>Executable rivals</dt>
              <dd>{progress?.resolvedCompetitiveCandidates ?? 0}</dd>
            </div>
            <div>
              <dt>Dominated</dt>
              <dd>{progress?.dominatedCandidates ?? 0}</dd>
            </div>
          </dl>
        </div>
      )}

      {/* Macro Markov-Bellman Graph */}
      <div className="macro-graph-container">
        <h3 className="macro-graph-title">Macro Markov-Bellman Acquisition Graph</h3>
        <p className="muted">
          Non-selected route costs are current executable upper bounds at their allocated search
          depth; they are not necessarily mature policy costs.
        </p>
        <div className="macro-graph-nodes-grid">
          {progress?.candidates.map((cand) => {
            const isWinner = cand.status === 'SELECTED';
            const isDominated = cand.status === 'DOMINATED';
            const isProbing = cand.status === 'PROBING' ||
              cand.status === 'ACQUISITION_PROBING' ||
              cand.status === 'DOWNSTREAM_PROBING' ||
              cand.isActive;

            return (
              <div
                key={cand.id}
                className={`macro-candidate-node ${cand.kind} ${cand.status.toLowerCase()} ${isProbing ? 'active-probe' : ''} ${isWinner ? 'winner' : ''} ${isDominated ? 'dominated' : ''}`}
              >
                <div className="node-header">
                  <span className="candidate-kind-badge">{cand.kind === 'clean' ? 'Clean Base' : 'Self-Fracture'}</span>
                  <span className={`candidate-status-chip ${cand.status.toLowerCase()}`}>
                    {cand.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="node-body">
                  <strong className="candidate-label">
                    {cand.kind === 'clean'
                      ? 'Clean Base'
                      : cand.targetModName
                        ? publicModifierText(cand.targetModName, modifierDescriptors)
                        : publicModifierText(cand.label, modifierDescriptors)}
                  </strong>
                  {cand.targetModName && (
                    <span className="candidate-mod-badge">
                      {publicModifierText(cand.targetModName, modifierDescriptors)}
                    </span>
                  )}

                  <div className="node-bounds-grid">
                    <div className="bound-row">
                      <span className="bound-tag">Acquisition L:</span>
                      <span className="bound-num">
                        {cand.acquisitionLowerBoundChaos !== undefined ? `${cand.acquisitionLowerBoundChaos.toFixed(1)}c` : '—'}
                      </span>
                    </div>

                    <div className="bound-row">
                      <span className="bound-tag">Acquisition U:</span>
                      <span className="bound-num">
                        {cand.acquisitionUpperBoundChaos !== undefined ? `${cand.acquisitionUpperBoundChaos.toFixed(1)}c` : '—'}
                      </span>
                    </div>

                    <div className="bound-row proof-bound">
                      <span className="bound-tag">Full-route L:</span>
                      <span className="bound-num">
                        {cand.fullRouteLowerBoundChaos !== undefined ? `${cand.fullRouteLowerBoundChaos.toFixed(1)}c` : '—'}
                      </span>
                    </div>

                    <div className="bound-row full-cost">
                      <span className="bound-tag">Current Full-route U:</span>
                      <span className="bound-num cost">
                        {cand.fullRouteUpperBoundChaos !== undefined ? `${cand.fullRouteUpperBoundChaos.toFixed(1)}c` : '—'}
                      </span>
                    </div>
                  </div>
                  {cand.proofReason && (
                    <p className="candidate-proof-reason">{PROOF_REASON_COPY[cand.proofReason]}</p>
                  )}
                </div>

                <div className="node-footer">
                  <span>
                    {(((cand.retainedAcquisitionStates ?? 0) +
                      (cand.retainedDownstreamStates ?? 0)) ||
                      cand.statesExpanded).toLocaleString()} retained states
                  </span>
                  <span>{cand.elapsedMs > 0 ? `${(cand.elapsedMs / 1000).toFixed(1)}s` : ''}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Milestones Log */}
      {progress && progress.recentMilestones.length > 0 && (
        <div className="search-milestones-feed">
          <h4 className="milestones-title">Recent Milestones &amp; Graph Updates</h4>
          <ul className="milestones-list">
            {progress.recentMilestones.slice(-6).map((item, idx) => (
              <li key={idx} className="milestone-entry">
                <span className="milestone-bullet">›</span>
                <span className="milestone-text">{publicModifierText(item, modifierDescriptors)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export const APP_RELEASE_VERSION = '3L.1';

interface CraftOptimizerProps {
  seed?: OptimizerSeed | null;
  onBackToClusterJewels?: () => void;
  onHandoffDetached?: () => void;
}

export function CraftOptimizer({
  seed = null,
  onBackToClusterJewels,
  onHandoffDetached,
}: CraftOptimizerProps) {
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
  const [targetModIds, setTargetModIds] = useState(['']);
  const [acceptableAlternativesEnabled, setAcceptableAlternativesEnabled] = useState(false);
  const [acceptableAlternativeModIds, setAcceptableAlternativeModIds] = useState(['', '']);
  const [preserveDecodedSingleAlternative, setPreserveDecodedSingleAlternative] = useState(false);
  const [finalRarity, setFinalRarity] = useState<'any' | 'magic' | 'rare'>('any');
  const [finishCondition, setFinishCondition] = useState<'any-match' | 'no-unwanted'>('any-match');
  const [cleanBaseCost, setCleanBaseCost] = useState('');
  const [saleValue, setSaleValue] = useState('');
  const [saleValueProvenance, setSaleValueProvenance] =
    useState<SaleValueProvenance>('empty');
  const [importedPriceContext, setImportedPriceContext] =
    useState<OptimizeCraftInput['prices'] | null>(null);
  const [importedMarketContext, setImportedMarketContext] =
    useState<OptimizeCraftInput['marketContext'] | null>(null);
  const pricingLeagues = useMemo(() => getOptimizerPricingLeagues(), []);
  const [league, setLeague] = useState(pricingLeagues[0] ?? '');
  const leagueRef = useRef(league);
  leagueRef.current = league;
  const [allowFallback, setAllowFallback] = useState(true);
  const eligibleMods = useMemo(
    () => browserCraftingCatalog.getEligibleMods(baseType, clusterType, itemLevel),
    [baseType, clusterType, itemLevel],
  );
  const [maxStates, setMaxStates] = useState(DEFAULT_BUDGET.maxStates);
  const [maxWallTimeMs, setMaxWallTimeMs] = useState(DEFAULT_BUDGET.maxWallTimeMs);
  const [maxExpansionRounds, setMaxExpansionRounds] = useState(DEFAULT_BUDGET.maxExpansionRounds);
  const [searchDepthPreset, setSearchDepthPreset] = useState<SearchDepthPreset>('NORMAL');
  const [searchIntent, setSearchIntent] = useState<SearchIntent>('RECOMMEND');
  const [result, setResult] = useState<OptimizeCraftResult | null>(null);
  const [progress, setProgress] = useState<OptimizerProgressSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallTimeExceeded, setWallTimeExceeded] = useState(false);
  const [running, setRunning] = useState(false);
  const [comparingMethods, setComparingMethods] = useState(false);
  const [runtimeMs, setRuntimeMs] = useState<number | null>(null);
  const workerRef = useRef<OptimizerWorkerClient | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceBannerRef = useRef<HTMLElement | null>(null);
  const appliedSeedIdRef = useRef<string | null>(null);
  const [clusterHandoff, setClusterHandoff] = useState<ClusterHandoffState>({ status: 'none' });
  const [seedWarning, setSeedWarning] = useState<string | null>(null);
  const hydratingHandoffRef = useRef(false);
  const onHandoffDetachedRef = useRef(onHandoffDetached);
  onHandoffDetachedRef.current = onHandoffDetached;
  const activeSeed = clusterHandoff.status === 'attached' ? clusterHandoff.seed : null;

  const detachClusterHandoff = useCallback((reason: string) => {
    if (hydratingHandoffRef.current || clusterHandoff.status !== 'attached') return;
    const detachedSale = detachedSaleValue(saleValue, saleValueProvenance);
    setSaleValue(detachedSale.value);
    setSaleValueProvenance(detachedSale.provenance);
    setClusterHandoff(detachedHandoffState());
    setSeedWarning(null);
    setResult(null);
    setProgress(null);
    setError(null);
    onHandoffDetachedRef.current?.();
    if (import.meta.env.DEV) console.debug(`Cluster handoff detached: ${reason}`);
  }, [clusterHandoff.status, saleValue, saleValueProvenance]);

  const currentSearchBudget = useMemo<SearchDepthBudget>(() => ({
    maxStates,
    maxWallTimeMs,
    maxExpansionRounds,
  }), [maxExpansionRounds, maxStates, maxWallTimeMs]);
  const retryDeeperBudget = useMemo(
    () => nextDeeperBudget(currentSearchBudget),
    [currentSearchBudget],
  );
  const unresolvedCompetitiveFamilies = result?.acquisition.portfolioProof.unresolvedCompetitiveCandidates ??
    progress?.unresolvedCompetitiveCandidates ?? 0;
  const suggestedDepth = unresolvedCompetitiveFamilies > 0
    ? nextNamedDepth(currentSearchBudget)
    : undefined;
  const exceedsMeasuredResearchPreset =
    maxStates > SEARCH_DEPTH_PRESETS.RESEARCH.maxStates ||
    maxWallTimeMs > SEARCH_DEPTH_PRESETS.RESEARCH.maxWallTimeMs ||
    maxExpansionRounds > SEARCH_DEPTH_PRESETS.RESEARCH.maxExpansionRounds;

  const selectSearchDepthPreset = (preset: SearchDepthPreset) => {
    setSearchDepthPreset(preset);
    if (preset === 'CUSTOM') return;
    const budget = SEARCH_DEPTH_PRESETS[preset];
    setMaxStates(budget.maxStates);
    setMaxWallTimeMs(budget.maxWallTimeMs);
    setMaxExpansionRounds(budget.maxExpansionRounds);
  };

  const updateCustomBudget = (
    field: keyof SearchDepthBudget,
    value: number,
  ) => {
    const normalized = Number.isFinite(value) ? value : 0;
    setSearchDepthPreset('CUSTOM');
    if (field === 'maxStates') setMaxStates(normalized);
    else if (field === 'maxWallTimeMs') setMaxWallTimeMs(normalized);
    else setMaxExpansionRounds(normalized);
  };

  const marketPricing = useMemo(
    () => getBrowserOptimizerPricing(league, baseType, clusterType, passiveCount, itemLevel),
    [baseType, clusterType, itemLevel, league, passiveCount],
  );
  const selectedTargetIds = useMemo(() => targetModIds.filter(Boolean), [targetModIds]);
  const selectedAlternativeIds = useMemo(
    () => acceptableAlternativeModIds.filter(Boolean),
    [acceptableAlternativeModIds],
  );

  const [objectiveKind, setObjectiveKind] = useState<OptimizationObjectiveKind>('CHEAPEST_CHAOS');
  const [costConstraintType, setCostConstraintType] = useState<'PREMIUM_PERCENT' | 'PREMIUM_CHAOS' | 'ABSOLUTE'>('PREMIUM_PERCENT');
  const [costConstraintValue, setCostConstraintValue] = useState('20');
  const [valueOfTimeChaosPerMin, setValueOfTimeChaosPerMin] = useState('50');
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [entryMode, setEntryMode] = useState<OptimizerEntryMode>('fresh');
  const [importError, setImportError] = useState<string | null>(null);
  const [setupRepairSource, setSetupRepairSource] = useState<
    'none' | 'external-pending' | 'external-invalid'
  >('none');
  const [targetEditorOpen, setTargetEditorOpen] = useState<boolean>(OPTIMIZER_DISCLOSURE_DEFAULTS.targetEditor);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(OPTIMIZER_DISCLOSURE_DEFAULTS.settings);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [searchProofOpen, setSearchProofOpen] = useState<boolean>(OPTIMIZER_DISCLOSURE_DEFAULTS.searchProof);
  const [alternativeMethodsOpen, setAlternativeMethodsOpen] = useState<boolean>(OPTIMIZER_DISCLOSURE_DEFAULTS.alternativeMethods);
  const [costUsageOpen, setCostUsageOpen] = useState<boolean>(OPTIMIZER_DISCLOSURE_DEFAULTS.costUsage);
  const [researchDiagnosticsOpen, setResearchDiagnosticsOpen] = useState<boolean>(OPTIMIZER_DISCLOSURE_DEFAULTS.researchDiagnostics);
  const [technicalPolicyGraphOpen, setTechnicalPolicyGraphOpen] = useState<boolean>(OPTIMIZER_DISCLOSURE_DEFAULTS.technicalPolicyGraph);

  const applyPreset = (preset: 'attack-large' | 'es-small') => {
    detachClusterHandoff('target preset changed');
    if (preset === 'attack-large') {
      const base: BaseType = 'Large Cluster Jewel';
      const cluster = '10% increased Attack Damage';
      setBaseType(base);
      setClusterType(cluster);
      setItemLevel(84);
      setPassiveCount(8);
      const eligible = browserCraftingCatalog.getEligibleMods(base, cluster, 84);
      const m1 = eligible.find((m) => m.isNotable && m.displayName === 'Feed the Fury')?.modId;
      const m2 = eligible.find((m) => m.isNotable && m.displayName === 'Fuel the Fight')?.modId;
      const fallbackNotables = eligible.filter((m) => m.isNotable);
      setTargetModIds([
        m1 || fallbackNotables[0]?.modId || '',
        m2 || fallbackNotables[1]?.modId || '',
      ]);
      setAcceptableAlternativesEnabled(false);
      setAcceptableAlternativeModIds(['', '']);
      setPreserveDecodedSingleAlternative(false);
      setFinalRarity('rare');
    } else if (preset === 'es-small') {
      const base: BaseType = 'Small Cluster Jewel';
      const cluster = '6% increased maximum Energy Shield';
      setBaseType(base);
      setClusterType(cluster);
      setItemLevel(84);
      setPassiveCount(2);
      const eligible = browserCraftingCatalog.getEligibleMods(base, cluster, 84);
      setTargetModIds([eligible[0]?.modId || '']);
      setAcceptableAlternativesEnabled(false);
      setAcceptableAlternativeModIds(['', '']);
      setPreserveDecodedSingleAlternative(false);
      setFinalRarity('magic');
    }
    setEntryMode('loaded');
    setImportError(null);
    setSetupRepairSource('none');
    setTargetEditorOpen(false);
    setSettingsOpen(false);
    setResult(null);
  };

  const draftObjective = useMemo<OptimizationObjectiveSpec>(() => {
    switch (objectiveKind) {
      case 'FEWEST_ACTIONS_WITHIN_COST':
      case 'FASTEST_WITHIN_COST': {
        const numVal = parseFloat(costConstraintValue);
        if (costConstraintType === 'ABSOLUTE' && Number.isFinite(numVal) && numVal >= 0) {
          return { kind: objectiveKind, maxExpectedCostChaos: numVal };
        }
        if (costConstraintType === 'PREMIUM_CHAOS' && Number.isFinite(numVal) && numVal >= 0) {
          return { kind: objectiveKind, maxPremiumChaos: numVal };
        }
        if (costConstraintType === 'PREMIUM_PERCENT' && Number.isFinite(numVal) && numVal >= 0) {
          return { kind: objectiveKind, maxPremiumFraction: numVal / 100 };
        }
        return { kind: objectiveKind };
      }
      case 'BALANCED_VALUE_OF_TIME': {
        const cpm = parseFloat(valueOfTimeChaosPerMin);
        return {
          kind: objectiveKind,
          valueOfTimeChaosPerMinute: Number.isFinite(cpm) && cpm > 0 ? cpm : 50,
        };
      }
      case 'UNCONSTRAINED_FEWEST_ACTIONS':
      case 'UNCONSTRAINED_FASTEST':
      case 'CHEAPEST_CHAOS':
      default:
        return { kind: objectiveKind };
    }
  }, [objectiveKind, costConstraintType, costConstraintValue, valueOfTimeChaosPerMin]);

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
        ...(acceptableAlternativesEnabled
          ? { acceptableAnyOf: selectedAlternativeIds.map((modId) => [{ modId }]) }
          : {}),
        requiredRarity: finalRarity === 'any' ? undefined : finalRarity,
        finalStateConstraints: finishCondition === 'no-unwanted'
          ? { maxUnmatchedAffixes: 0 }
          : undefined,
      },
      prices: {
        ...marketPricing?.priceContext,
        ...importedPriceContext,
        currencyRates: {
          ...marketPricing?.priceContext.currencyRates,
          ...importedPriceContext?.currencyRates,
        },
        cleanBaseCostChaos: Number.isFinite(manualClean) && manualClean !== undefined && manualClean >= 0
          ? manualClean
          : importedPriceContext?.cleanBaseCostChaos ?? marketPricing?.priceContext.cleanBaseCostChaos,
        cleanBasePriceSource: Number.isFinite(manualClean) && manualClean !== undefined
          ? 'manual'
          : importedPriceContext?.cleanBasePriceSource ?? marketPricing?.priceContext.cleanBasePriceSource,
        cleanBasePriceProvenance: Number.isFinite(manualClean) && manualClean !== undefined
          ? 'manual clean-base override supplied in Developer UI'
          : importedPriceContext?.cleanBasePriceProvenance ?? marketPricing?.priceContext.cleanBasePriceProvenance,
      },
      marketContext: importedMarketContext ?? marketPricing?.marketContext,
      expectedSaleValueChaos: Number.isFinite(parsedSaleValue) && parsedSaleValue !== undefined && parsedSaleValue >= 0
        ? parsedSaleValue
        : undefined,
      allowResearchFallbackPrices: allowFallback,
      objective: draftObjective,
      searchBudget: {
        maxStates,
        maxWallTimeMs,
        maxExpansionRounds,
        preset: searchDepthPreset,
      },
      searchIntent,
    };
  }, [
    allowFallback,
    acceptableAlternativesEnabled,
    baseType,
    cleanBaseCost,
    clusterType,
    draftObjective,
    finalRarity,
    finishCondition,
    itemLevel,
    importedMarketContext,
    importedPriceContext,
    marketPricing,
    maxExpansionRounds,
    maxStates,
    maxWallTimeMs,
    passiveCount,
    saleValue,
    searchDepthPreset,
    searchIntent,
    selectedAlternativeIds,
    selectedTargetIds,
  ]);
  const validation = useMemo(() => validateBrowserOptimizeInput(draftInput), [draftInput]);
  const previousDraftInputRef = useRef(draftInput);

  const applySharedCraftHash = useCallback(() => {
    if (typeof window === 'undefined' || !window.location.hash.startsWith('#craft=')) return;
    const encoded = window.location.hash.slice(7);
    const decoded = decodeCraftFromUrl(encoded);
    if (!decoded) {
      setImportError('This shared craft could not be decoded. Import another optimizer JSON file or build the target manually.');
      setSetupRepairSource('none');
      setEntryMode('fresh');
      return;
    }
    hydratingHandoffRef.current = true;
    if (decoded.baseType) setBaseType(decoded.baseType);
    if (decoded.clusterType) setClusterType(decoded.clusterType);
    if (decoded.itemLevel) setItemLevel(decoded.itemLevel);
    if (decoded.passiveCount) setPassiveCount(decoded.passiveCount);
    setTargetModIds(decoded.targetMods.length > 0 ? decoded.targetMods : ['']);
    const decodedAlternativeIds = decoded.acceptableAnyOf?.flatMap((branch) =>
      branch.length === 1 && branch[0].modId ? [branch[0].modId] : []
    ) ?? [];
    setAcceptableAlternativesEnabled(decoded.acceptableAnyOf !== undefined);
    setAcceptableAlternativeModIds(decodedAlternativeIds.length > 0 ? decodedAlternativeIds : ['', '']);
    setPreserveDecodedSingleAlternative(decodedAlternativeIds.length === 1);
    if (decoded.finalRarity) setFinalRarity(decoded.finalRarity);
    if (decoded.objectiveSpec) setObjectiveKind(decoded.objectiveSpec.kind);
    if (decoded.costConstraintType) setCostConstraintType(decoded.costConstraintType);
    if (decoded.costConstraintValue) setCostConstraintValue(decoded.costConstraintValue);
    if (decoded.valueOfTimeChaosPerMin) setValueOfTimeChaosPerMin(decoded.valueOfTimeChaosPerMin);
    setCleanBaseCost(decoded.cleanBaseCostChaos === undefined ? '' : String(decoded.cleanBaseCostChaos));
    if (decoded.maxUnmatchedAffixes === 0) setFinishCondition('no-unwanted');
    else setFinishCondition('any-match');
    setSaleValue(decoded.expectedSaleValueChaos === undefined ? '' : String(decoded.expectedSaleValueChaos));
    setSaleValueProvenance(hydratedSaleValue(
      decoded.expectedSaleValueChaos,
      decoded.sourceContext !== undefined,
      decoded.saleValueProvenance,
    ));
    setImportedPriceContext(decoded.prices ?? null);
    setImportedMarketContext(decoded.marketContext ?? null);
    if (decoded.sourceContext) {
      if (pricingLeagues.includes(decoded.sourceContext.league)) {
        setLeague(decoded.sourceContext.league);
        setSeedWarning(null);
      } else {
        setSeedWarning(
          `${decoded.sourceContext.league} is not available in optimizer pricing. The existing pricing league was preserved.`
        );
      }
      const importedSeed: OptimizerSeed = {
        id: `shared-cluster-jewels:${encoded.slice(0, 16)}`,
        source: 'CLUSTER_JEWELS',
        league: decoded.sourceContext.league,
        baseType: decoded.baseType,
        clusterType: decoded.clusterType,
        passiveCount: decoded.passiveCount,
        passiveRange: decoded.sourceContext.passiveRange,
        itemLevel: decoded.itemLevel,
        itemLevelDefaulted: decoded.sourceContext.itemLevelDefaulted,
        targetModIds: [...decoded.targetMods],
        sourceComboLabel: decoded.sourceContext.sourceComboLabel,
        sourceMarketValue: decoded.sourceContext.sourceMarketValue,
      };
      setClusterHandoff(attachClusterHandoff(importedSeed, handoffIdentitySnapshot({
        baseType: decoded.baseType,
        clusterType: decoded.clusterType,
        itemLevel: decoded.itemLevel,
        passiveCount: decoded.passiveCount ?? 1,
        league: pricingLeagues.includes(decoded.sourceContext.league)
          ? decoded.sourceContext.league
          : leagueRef.current,
        target: {
          requiredMods: decoded.targetMods.map((modId) => ({ modId })),
          ...(decoded.acceptableAnyOf ? { acceptableAnyOf: decoded.acceptableAnyOf } : {}),
          requiredRarity: decoded.finalRarity === 'any' ? undefined : decoded.finalRarity,
          finalStateConstraints: decoded.maxUnmatchedAffixes === 0
            ? { maxUnmatchedAffixes: 0 }
            : undefined,
        },
      })));
    } else {
      setClusterHandoff(detachedHandoffState());
      setSeedWarning(null);
      onHandoffDetachedRef.current?.();
    }
    setResult(null);
    setProgress(null);
    setError(null);
    setEntryMode('loaded');
    setImportError(null);
    setSetupRepairSource('external-pending');
    setTargetEditorOpen(false);
    setSettingsOpen(false);
    hydratingHandoffRef.current = false;
  }, [pricingLeagues]);

  useEffect(() => {
    if (previousDraftInputRef.current === draftInput) return;
    previousDraftInputRef.current = draftInput;
    setResult(null);
  }, [draftInput]);

  useEffect(() => {
    const client = new OptimizerWorkerClient();
    workerRef.current = client;

    applySharedCraftHash();

    return () => {
      client.dispose();
      if (workerRef.current === client) workerRef.current = null;
    };
  }, [applySharedCraftHash]);

  useEffect(() => {
    window.addEventListener('hashchange', applySharedCraftHash);
    return () => window.removeEventListener('hashchange', applySharedCraftHash);
  }, [applySharedCraftHash]);

  useEffect(() => {
    if (!seed || appliedSeedIdRef.current === seed.id || window.location.hash.startsWith('#craft=')) return;
    appliedSeedIdRef.current = seed.id;
    hydratingHandoffRef.current = true;
    setBaseType(seed.baseType);
    setClusterType(seed.clusterType);
    setPassiveCount(seed.passiveCount ?? seed.passiveRange?.min ?? 1);
    setItemLevel(seed.itemLevel);
    setTargetModIds(seed.targetModIds.length > 0 ? [...seed.targetModIds] : ['']);
    setAcceptableAlternativesEnabled(false);
    setAcceptableAlternativeModIds(['', '']);
    setPreserveDecodedSingleAlternative(false);
    setFinalRarity('any');
    setFinishCondition('any-match');
    setCleanBaseCost('');
    setImportedPriceContext(null);
    setImportedMarketContext(null);
    setSaleValue(seed.sourceMarketValue ? String(seed.sourceMarketValue.chaos) : '');
    setSaleValueProvenance(seed.sourceMarketValue ? 'cluster-source' : 'empty');
    const normalizedLeague = pricingLeagues.includes(seed.league) ? seed.league : leagueRef.current;
    if (pricingLeagues.includes(seed.league)) {
      setLeague(seed.league);
      setSeedWarning(null);
    } else {
      setSeedWarning(
        `${seed.league} is not available in optimizer pricing. The existing pricing league was preserved.`
      );
    }
    setResult(null);
    setProgress(null);
    setError(null);
    setWallTimeExceeded(false);
    setRuntimeMs(null);
    setEntryMode('loaded');
    setImportError(null);
    setSetupRepairSource('external-pending');
    setTargetEditorOpen(false);
    setSettingsOpen(false);
    setClusterHandoff(attachClusterHandoff(seed, handoffIdentitySnapshot({
      baseType: seed.baseType,
      clusterType: seed.clusterType,
      passiveCount: seed.passiveCount ?? seed.passiveRange?.min ?? 1,
      itemLevel: seed.itemLevel,
      league: normalizedLeague,
      target: { requiredMods: seed.targetModIds.map((modId) => ({ modId })) },
    })));
    hydratingHandoffRef.current = false;
  }, [pricingLeagues, seed]);

  useEffect(() => {
    if (!activeSeed) return;
    const frame = requestAnimationFrame(() => sourceBannerRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [activeSeed]);

  const alternativeSelectionError = acceptableAlternativesEnabled &&
    selectedAlternativeIds.length < 2 && !preserveDecodedSingleAlternative
    ? 'Choose at least two acceptable alternatives, or disable the acceptable-alternative group.'
    : null;
  const validationError = [
    ...validation.errors.map((issue) => issue.message),
    alternativeSelectionError,
  ].filter((message): message is string => message !== null).join(' ') || null;
  const setupRepairMessage = setupRepairSource === 'external-invalid' && validationError !== null
    ? `The loaded setup needs repair: ${validationError}`
    : null;

  useEffect(() => {
    if (setupRepairSource === 'external-invalid' && validationError === null) {
      setSetupRepairSource('none');
      return;
    }
    if (setupRepairSource !== 'external-pending') return;
    if (validationError === null) {
      setSetupRepairSource('none');
      return;
    }
    setSetupRepairSource('external-invalid');
    const targetOwnsRepair = alternativeSelectionError !== null || validation.errors.some((issue) =>
      issue.field === 'baseType' ||
      issue.field === 'clusterType' ||
      issue.field === 'itemLevel' ||
      issue.field === 'passiveCount' ||
      issue.field.startsWith('target')
    );
    if (targetOwnsRepair) setTargetEditorOpen(true);
    else setSettingsOpen(true);
  }, [alternativeSelectionError, setupRepairSource, validation.errors, validationError]);

  const changeBase = (nextBase: BaseType) => {
    detachClusterHandoff('base type changed');
    const nextClusterTypes = browserCraftingCatalog.getClusterTypes(nextBase);
    const nextPassiveCounts = browserCraftingCatalog.getPassiveCounts(nextBase);
    setBaseType(nextBase);
    setClusterType(nextClusterTypes[0] ?? '');
    setPassiveCount(nextPassiveCounts.at(-1) ?? 1);
    setTargetModIds(['']);
    setAcceptableAlternativesEnabled(false);
    setAcceptableAlternativeModIds(['', '']);
    setPreserveDecodedSingleAlternative(false);
    setResult(null);
  };

  const changeCluster = (nextCluster: string) => {
    detachClusterHandoff('cluster enchantment changed');
    setClusterType(nextCluster);
    setTargetModIds(['']);
    setAcceptableAlternativesEnabled(false);
    setAcceptableAlternativeModIds(['', '']);
    setPreserveDecodedSingleAlternative(false);
    setResult(null);
  };

  const updateTarget = (index: number, modId: string) => {
    if (targetModIds[index] !== modId) detachClusterHandoff('required modifier changed');
    setTargetModIds((current) => current.map((value, i) => (i === index ? modId : value)));
  };

  const updateAcceptableAlternative = (index: number, modId: string) => {
    if (acceptableAlternativeModIds[index] !== modId) {
      detachClusterHandoff('acceptable alternative changed');
    }
    setPreserveDecodedSingleAlternative(false);
    setAcceptableAlternativeModIds((current) =>
      current.map((value, i) => (i === index ? modId : value))
    );
  };

  const updateSaleValue = (value: string) => {
    setSaleValue(value);
    setSaleValueProvenance(userSaleValue(value));
  };

  const optimize = async (
    budget = { maxStates, maxWallTimeMs, maxExpansionRounds },
    intent: SearchIntent = searchIntent,
    compareMethodFamilies = false,
  ) => {
    if (validationError || !workerRef.current) return;
    const requestValidation = validateBrowserOptimizeInput({
      ...draftInput,
      searchBudget: { ...budget, preset: matchingSearchDepthPreset(budget) },
      searchIntent: intent,
      compareMethodFamilies,
    });
    if (!requestValidation.valid) {
      setError(requestValidation.errors.map((issue) => issue.message).join(' '));
      return;
    }
    const input = requestValidation.normalizedInput;
    setRunning(true);
    setComparingMethods(compareMethodFamilies);
    setError(null);
    setWallTimeExceeded(false);
    if (!compareMethodFamilies) {
      setResult(null);
      setEntryMode('loaded');
      setTargetEditorOpen(false);
      setSettingsOpen(false);
      setSearchProofOpen(false);
      setAlternativeMethodsOpen(false);
      setCostUsageOpen(false);
      setResearchDiagnosticsOpen(false);
      setTechnicalPolicyGraphOpen(false);
    }
    setProgress(null);
    setRuntimeMs(null);
    const started = performance.now();
    try {
      const nextResult = await workerRef.current.optimize(input, (snapshot) => {
        setProgress(snapshot);
      });
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
      setComparingMethods(false);
    }
  };

  const retryDeeper = () => {
    const budget = retryDeeperBudget;
    setMaxStates(budget.maxStates);
    setMaxWallTimeMs(budget.maxWallTimeMs);
    setMaxExpansionRounds(budget.maxExpansionRounds);
    setSearchDepthPreset(matchingSearchDepthPreset(budget));
    setSearchIntent('DEEPEN');
    void optimize(budget, 'DEEPEN');
  };

  const cancel = () => workerRef.current?.cancel();

  const compareMethods = () => {
    void optimize(
      { maxStates, maxWallTimeMs, maxExpansionRounds },
      'DEEPEN',
      true,
    );
  };

  const copyShoppingList = (res: OptimizeCraftResult) => {
    const lines: string[] = ['=== CLUSTER JEWEL CRAFTING SHOPPING LIST ==='];
    const acquisitionProvisional = res.recommendationStatus === 'PROVISIONAL_RESOLVED' ||
      res.acquisition.portfolioProof.unresolvedCompetitiveCandidates > 0;
    if (acquisitionProvisional) {
      lines.push('STATUS: PROVISIONAL — this executable route is not proven acquisition-safe; a cheaper unresolved route may exist. Retry deeper to improve acquisition confidence.');
    } else {
      lines.push('STATUS: Acquisition-safe for the reported modeled search evidence.');
    }
    lines.push(`Must have all: ${res.target.requiredMods.map((requirement) =>
      targetRequirementName(requirement, eligibleMods)
    ).join(' + ')}`);
    if (res.target.acceptableAnyOf?.length) {
      lines.push(`And at least one: ${res.target.acceptableAnyOf.map((branch) =>
        acceptableBranchName(branch, eligibleMods)
      ).join(' OR ')}`);
    }
    lines.push(`Selected Route: ${publicSelectedRouteName ?? 'none certified'}`);
    lines.push(`Expected Total Cost: ~${chaos(res.expectedCostChaos)}`);
    lines.push('\nRounded purchase guidance (expected model consumption is shown explicitly):');

    const cleanMethod = res.acquisition.candidates
      .flatMap((c) => c.methods)
      .find((m) => m.id.startsWith('clean-base'));
    if (cleanMethod?.costChaos !== undefined) {
      lines.push(`- 1x ${baseType} (rounded purchase guidance; ilvl ${itemLevel}, ${passiveCount} passives; expected acquisition cost ~${cleanMethod.costChaos.toFixed(1)}c)`);
    }

    const currencies = res.expectedCurrencies ?? {};
    for (const [curr, expectedCount] of Object.entries(currencies)) {
      if (expectedCount && expectedCount > 0) {
        lines.push(`- ${Math.ceil(expectedCount).toLocaleString()}x ${curr} (rounded-up purchase guidance from ${expectedCount} expected consumption)`);
      }
    }

    void navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAction('SHOPPING_LIST');
    setTimeout(() => setCopiedAction(null), 2500);
  };

  const copyCraftGuide = (res: OptimizeCraftResult) => {
    const lines: string[] = ['=== CLUSTER JEWEL CRAFTING PLAYBOOK ==='];
    const acquisitionProvisional = res.recommendationStatus === 'PROVISIONAL_RESOLVED' ||
      res.acquisition.portfolioProof.unresolvedCompetitiveCandidates > 0;
    lines.push(acquisitionProvisional
      ? 'STATUS: PROVISIONAL — this executable route is not proven acquisition-safe; a cheaper unresolved route may exist. Retry deeper to improve acquisition confidence.'
      : 'STATUS: Acquisition-safe for the reported modeled search evidence.');
    lines.push('\nTARGETS');
    lines.push(`Required: ${res.target.requiredMods.map((requirement) =>
      targetRequirementName(requirement, eligibleMods)
    ).join(', ')}`);
    if (res.target.acceptableAnyOf?.length) {
      lines.push(`Acceptable: any one of ${res.target.acceptableAnyOf.map((branch) =>
        acceptableBranchName(branch, eligibleMods)
      ).join(' OR ')}`);
    } else lines.push('Acceptable: none');
    lines.push('Junk: anything else');
    lines.push('Junk categories: Safe for this rule; Blocks a missing target; Occupies the last compatible slot; Fractured junk');

    lines.push(`Selected route: ${res.guidedConstellation.selectedRouteName}`);
    lines.push(`Physical start: ${res.guidedConstellation.physicalStart}`);

    if (res.guidedConstellation.status !== 'CERTIFIED') {
      lines.push('\nCrafting Constellation withheld');
      lines.push('The selected policy could not be compressed into an unambiguous player flow.');
      for (const reason of res.guidedConstellation.reasons) lines.push(`- ${reason}`);
    } else {
      let ruleNumber = 0;
      for (const node of res.guidedConstellation.nodes) {
        lines.push(`\nSTAGE: ${node.title}`);
        for (const row of node.conditionRows) {
          ruleNumber += 1;
          lines.push(`RULE ${ruleNumber} [${row.playerRuleIds.join(', ')}]`);
          lines.push(`WHEN: ${row.whenLines.join('; ')}`);
          lines.push(`USE: ${row.actionName}`);
          lines.push(`THEN: ${row.thenSummary}`);
          for (const branch of row.thenBranches) lines.push(`  - ${branch}`);
        }
        for (const edge of res.guidedConstellation.edges.filter((candidate) =>
          candidate.sourceNodeId === node.id
        )) lines.push(`  ${edge.kind}: ${edge.label}`);
      }
      const finish = res.guidedConstellation.finishCondition;
      if (finish) {
        lines.push('\nFINISH WHEN');
        lines.push(`- all required targets are present: ${finish.requiredTargetNames.join(', ')}`);
        if (finish.acceptableTargetBranchNames.length > 0) {
          lines.push(`- at least one acceptable branch is present: ${finish.acceptableTargetBranchNames.map((branch) => branch.join(' + ')).join(' OR ')}`);
        }
        if (finish.requiredRarity) lines.push(`- final rarity is ${finish.requiredRarity}`);
        lines.push(finish.extraAffixesAllowed
          ? '- extra affixes are allowed'
          : '- the requested extra-affix limit is satisfied');
      }
    }
    lines.push('\nIMPORTANT CAVEATS');
    lines.push(res.craftPlan.optimalityNote ?? 'The displayed policy is certified over the reported modeled evidence.');
    const approximationWarnings = res.mechanicsConfidence.selectedPolicy.warnings;
    lines.push(approximationWarnings.length > 0
      ? `Approximate mechanics: ${approximationWarnings.join(' ')}`
      : 'No selected-policy mechanics approximation warning was reported.');

    void navigator.clipboard.writeText(lines.join('\n'));
    setCopiedAction('CRAFT_GUIDE');
    setTimeout(() => setCopiedAction(null), 2500);
  };

  const copyShareUrl = () => {
    const payload: CraftSharePayload = {
      version: '3H.1',
      baseType,
      clusterType,
      itemLevel,
      passiveCount,
      targetMods: validation.normalizedInput.target.requiredMods.flatMap((requirement) =>
        requirement.modId ? [requirement.modId] : []
      ),
      acceptableAnyOf: validation.normalizedInput.target.acceptableAnyOf,
      selectedRouteName: publicSelectedRouteName,
      finalRarity: validation.normalizedInput.target.requiredRarity === 'normal'
        ? 'any'
        : validation.normalizedInput.target.requiredRarity ?? 'any',
      objectiveSpec: draftObjective,
      costConstraintType,
      costConstraintValue,
      valueOfTimeChaosPerMin,
      cleanBaseCostChaos: cleanBaseCost ? Number(cleanBaseCost) : undefined,
      maxUnmatchedAffixes: finishCondition === 'no-unwanted' ? 0 : undefined,
      expectedSaleValueChaos: draftInput.expectedSaleValueChaos,
      saleValueProvenance,
      prices: draftInput.prices,
      marketContext: draftInput.marketContext,
      sourceContext: activeSeed ? {
        source: 'CLUSTER_JEWELS',
        league: activeSeed.league,
        passiveRange: activeSeed.passiveRange,
        itemLevelDefaulted: activeSeed.itemLevelDefaulted,
        sourceComboLabel: activeSeed.sourceComboLabel,
        sourceMarketValue: activeSeed.sourceMarketValue,
      } : undefined,
    };
    const encoded = encodeCraftToUrl(payload);
    const fullUrl = `${window.location.origin}${window.location.pathname}#craft=${encoded}`;
    void navigator.clipboard.writeText(fullUrl);
    setCopiedAction('SHARE_URL');
    setTimeout(() => setCopiedAction(null), 2500);
  };

  const copyBugReport = (res?: OptimizeCraftResult) => {
    const payload: CraftSharePayload = {
      version: '3H.1',
      baseType,
      clusterType,
      itemLevel,
      passiveCount,
      targetMods: validation.normalizedInput.target.requiredMods.flatMap((requirement) =>
        requirement.modId ? [requirement.modId] : []
      ),
      acceptableAnyOf: validation.normalizedInput.target.acceptableAnyOf,
      selectedRouteName: publicSelectedRouteName,
      finalRarity: validation.normalizedInput.target.requiredRarity === 'normal'
        ? 'any'
        : validation.normalizedInput.target.requiredRarity ?? 'any',
      objectiveSpec: draftObjective,
      costConstraintType,
      costConstraintValue,
      valueOfTimeChaosPerMin,
      cleanBaseCostChaos: cleanBaseCost ? Number(cleanBaseCost) : undefined,
      maxUnmatchedAffixes: finishCondition === 'no-unwanted' ? 0 : undefined,
      expectedSaleValueChaos: draftInput.expectedSaleValueChaos,
      saleValueProvenance,
      prices: draftInput.prices,
      marketContext: draftInput.marketContext,
      sourceContext: activeSeed ? {
        source: 'CLUSTER_JEWELS',
        league: activeSeed.league,
        passiveRange: activeSeed.passiveRange,
        itemLevelDefaulted: activeSeed.itemLevelDefaulted,
        sourceComboLabel: activeSeed.sourceComboLabel,
        sourceMarketValue: activeSeed.sourceMarketValue,
      } : undefined,
    };
    const bundle = generateBugReportBundle(payload, res, APP_RELEASE_VERSION);
    void navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
    setCopiedAction('BUG_REPORT');
    setTimeout(() => setCopiedAction(null), 2500);
  };

  const importSetupJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        hydratingHandoffRef.current = true;
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        const input = parsed.requestInput || parsed;

        const targetMods: string[] = Array.isArray(input.targetMods)
          ? input.targetMods
          : Array.isArray(input.target?.requiredMods)
            ? input.target.requiredMods.map((m: { modId: string }) => m.modId).filter(Boolean)
            : [];

        if (input.baseType) setBaseType(input.baseType);
        if (input.clusterType) setClusterType(input.clusterType);
        if (input.itemLevel) setItemLevel(input.itemLevel);
        if (input.passiveCount) setPassiveCount(input.passiveCount);
        setTargetModIds(targetMods.length > 0 ? targetMods : ['']);
        const importedAlternatives = Array.isArray(input.acceptableAnyOf)
          ? input.acceptableAnyOf
          : Array.isArray(input.target?.acceptableAnyOf)
            ? input.target.acceptableAnyOf
            : undefined;
        const importedAlternativeIds: string[] = importedAlternatives?.flatMap(
          (branch: Array<{ modId?: string }>) =>
            branch.length === 1 && branch[0]?.modId ? [branch[0].modId] : []
        ) ?? [];
        setAcceptableAlternativesEnabled(importedAlternatives !== undefined);
        setAcceptableAlternativeModIds(
          importedAlternativeIds.length > 0 ? importedAlternativeIds : ['', '']
        );
        setPreserveDecodedSingleAlternative(importedAlternativeIds.length === 1);

        const rarity = input.finalRarity || input.target?.requiredRarity;
        if (rarity) setFinalRarity(rarity);

        if (input.objectiveSpec) {
          setObjectiveKind(input.objectiveSpec.kind);
        } else if (input.objective) {
          setObjectiveKind(typeof input.objective === 'string' ? input.objective : input.objective.kind);
        }

        if (input.costConstraintType) setCostConstraintType(input.costConstraintType);
        if (input.costConstraintValue) setCostConstraintValue(input.costConstraintValue);
        if (input.valueOfTimeChaosPerMin) setValueOfTimeChaosPerMin(input.valueOfTimeChaosPerMin);
        setCleanBaseCost(input.cleanBaseCostChaos === undefined ? '' : String(input.cleanBaseCostChaos));
        if (input.expectedSaleValueChaos !== undefined) setSaleValue(String(input.expectedSaleValueChaos));
        else setSaleValue('');
        if (input.prices && typeof input.prices === 'object') setImportedPriceContext(input.prices);
        else setImportedPriceContext(null);
        if (input.marketContext && typeof input.marketContext === 'object') setImportedMarketContext(input.marketContext);
        else setImportedMarketContext(null);
        if (parsed.optimizerSeedContext?.source === 'CLUSTER_JEWELS') {
          const importedSeed = parsed.optimizerSeedContext as OptimizerSeed;
          setSaleValueProvenance(hydratedSaleValue(
            input.expectedSaleValueChaos,
            true,
            parsed.saleValueProvenance,
          ));
          if (pricingLeagues.includes(importedSeed.league)) {
            setLeague(importedSeed.league);
            setSeedWarning(null);
          } else {
            setSeedWarning(
              `${importedSeed.league} is not available in optimizer pricing. The existing pricing league was preserved.`
            );
          }
          setClusterHandoff(attachClusterHandoff(importedSeed, handoffIdentitySnapshot({
            baseType: input.baseType,
            clusterType: input.clusterType,
            itemLevel: input.itemLevel,
            passiveCount: input.passiveCount,
            league: pricingLeagues.includes(importedSeed.league) ? importedSeed.league : league,
            target: input.target ?? {
              requiredMods: targetMods.map((modId) => ({ modId })),
              ...(importedAlternatives ? { acceptableAnyOf: importedAlternatives } : {}),
            },
          })));
        } else {
          setSaleValueProvenance(hydratedSaleValue(
            input.expectedSaleValueChaos,
            false,
            parsed.saleValueProvenance,
          ));
          setClusterHandoff(detachedHandoffState());
          setSeedWarning(null);
          onHandoffDetachedRef.current?.();
        }
        if (input.target?.finalStateConstraints?.maxUnmatchedAffixes === 0 || input.maxUnmatchedAffixes === 0) {
          setFinishCondition('no-unwanted');
        } else {
          setFinishCondition('any-match');
        }
        if (window.location.hash.startsWith('#craft=')) {
          window.history.replaceState(
            null,
            '',
            `${window.location.pathname}${window.location.search}#optimizer`,
          );
        }
        setResult(null);
        const importedEntry = importedEntryMode({
          baseType: input.baseType,
          clusterType: input.clusterType,
          itemLevel: input.itemLevel,
          passiveCount: input.passiveCount,
          targetModCount: targetMods.length,
        });
        if (importedEntry.mode === 'loaded') {
          setEntryMode(importedEntry.mode);
          setImportError(null);
          setSetupRepairSource('external-pending');
          setTargetEditorOpen(importedEntry.openTargetEditor);
          setSettingsOpen(false);
        } else {
          setEntryMode(importedEntry.mode);
          setImportError(null);
          setSetupRepairSource('external-pending');
          setTargetEditorOpen(importedEntry.openTargetEditor);
        }
        hydratingHandoffRef.current = false;
      } catch {
        hydratingHandoffRef.current = false;
        setImportError('This file is not valid optimizer JSON. Choose another file or build the target manually.');
        setSetupRepairSource('none');
        setEntryMode('fresh');
      }
    };
    reader.readAsText(file);
  };

  const exportSetupJson = (res: OptimizeCraftResult) => {
    const exportBundle = {
      appVersion: APP_RELEASE_VERSION,
      exportedAt: new Date().toISOString(),
      requestInput: validation.normalizedInput,
      ...(activeSeed ? { optimizerSeedContext: activeSeed } : {}),
      saleValueProvenance,
      resultSummary: {
        expectedCostChaos: res.expectedCostChaos,
        recommendationStatus: res.recommendationStatus,
        recommendedRoute: res.recommended?.name,
        metrics: res.recommended?.metrics,
        presentation: res.presentation,
        policyFlow: res.policyFlow,
        guidedConstellation: res.guidedConstellation,
        craftPlan: res.craftPlan,
        policyExplanation: res.policyExplanation,
        policyRules: res.policyRules,
        fullRouteUsage: res.fullRouteUsage,
        requestBudget: res.search.requestBudget,
        coreRecommendationSnapshot: res.search.coreRecommendationSnapshot,
        requestPolicyRegistry: res.requestPolicyRegistry,
        shoppingListCurrencies: res.expectedCurrencies,
        harvestComparison: res.harvestComparison,
        methodFamilies: res.methodPortfolio?.map((family) => ({
          id: family.spec.id,
          status: family.status,
          evaluationSource: family.evaluationSource,
          incumbentSource: family.incumbentSource,
          familySearchStatus: family.familySearchStatus,
          independentFullRouteU: family.independentFullRouteU,
          knownPolicyCostChaos: family.knownPolicyCostChaos,
          revalidatedKnownPolicyCostChaos: family.revalidatedKnownPolicyCostChaos,
          selectedOpenPolicyCostChaos: family.selectedOpenPolicyCostChaos,
          selectedOpenPolicyAdmissibility: family.selectedOpenPolicyAdmissibility,
          knownPolicyAdmissibility: family.knownPolicyAdmissibility,
          fullRouteActionEvidence: family.fullRouteActionEvidence,
          requiredActionEvidenceChecks: family.requiredActionEvidenceChecks,
          acquisitionStatus: family.acquisitionStatus,
          downstreamStatus: family.downstreamStatus,
          fullRouteStatus: family.fullRouteStatus,
                          requiredActionObservedOnPolicy: family.requiredActionObservedOnPolicy,
                          onPolicyActionIds: family.onPolicyActionIds,
                          expectedActionUsage: family.expectedActionUsage,
                          policyHealth: family.policyHealth,
                          sessionIdentity: family.sessionIdentity,
                          retainedStates: family.retainedStates,
                          transitionDistributionsGenerated: family.transitionDistributionsGenerated,
                          budget: family.budget,
        })),
      },
    };

    const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cluster-craft-${clusterType.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setCopiedAction('EXPORT_JSON');
    setTimeout(() => setCopiedAction(null), 2500);
  };
  const selectedAcquisition = result?.acquisition.candidates.find(
    (candidate) => candidate.id === result.acquisition.selectedCandidateId,
  );
  const selectedMethod = selectedAcquisition?.methods.find(
    (method) => method.id === result?.acquisition.selectedMethodId,
  );
  const targetDescriptors = useMemo(
    () => [...selectedTargetIds, ...selectedAlternativeIds]
      .flatMap((modId) => eligibleMods.find((mod) => mod.modId === modId) ?? []),
    [eligibleMods, selectedAlternativeIds, selectedTargetIds],
  );
  const publicSelectedRouteName = result?.presentation.selectedRouteName
    ? publicModifierText(result.presentation.selectedRouteName, targetDescriptors)
    : undefined;
  const selectedAcquisitionLabel = candidatePlayerLabel(selectedAcquisition, eligibleMods);
  const recommendedStart = selectedMethod?.executable && selectedAcquisitionLabel
    ? `Self-fracture ${selectedAcquisitionLabel}`
    : selectedAcquisitionLabel ?? (result?.recommended?.name
      ? publicModifierText(result.recommended.name, targetDescriptors)
      : 'No start certified under this budget');
  const materialWarnings = result?.warningDetails.filter((warning) =>
    warning.category === 'SELECTED_ROUTE' ||
    warning.category === 'DATA_FRESHNESS' ||
    (warning.category === 'PROOF_SEARCH' && (
      result.recommendationStatus === 'PROVISIONAL_RESOLVED' ||
      result.recommendationStatus === 'NO_RESOLVED_ROUTE'
    ))
  ) ?? [];
  const sourceQuoteExactForSelectedPassive = activeSeed?.sourceMarketValue !== undefined &&
    activeSeed.sourceMarketValue.passiveRange.min === activeSeed.sourceMarketValue.passiveRange.max &&
    activeSeed.sourceMarketValue.passiveRange.min === passiveCount;
  const sourceEconomicsReady = Boolean(
    result?.recommended &&
    result.internalConsistency.status === 'OK' &&
    activeSeed?.sourceMarketValue &&
    sourceQuoteExactForSelectedPassive
  );
  const displayedProof = result ? proofPresentation(result) : null;
  const displayedSearchEvidence = result ? searchEvidencePresentation(result) : null;

  const technicalPolicyGraph = useMemo(() => {
    if (!result?.policyFlow) return null;
    return buildVisualizationGraph(
      result.policyFlow,
      {
        modifierDescriptors: targetDescriptors,
        acquisitionContext: result.presentation.acquisitionContext,
      },
    );
  }, [result, targetDescriptors]);

  const showAdvancedPolicyEvidence = (ruleId: string) => {
    setResearchDiagnosticsOpen(true);
    window.requestAnimationFrame(() => {
      const evidence = document.getElementById(`advanced-policy-${ruleId}`);
      evidence?.scrollIntoView({ block: 'center' });
      evidence?.focus({ preventScroll: true });
    });
  };

  const resultSearchProofDisclosure = result ? (
    <OptimizerDisclosure
      title="Search & proof"
      description="Complete live activity, request budget, stopping condition, and proof evidence"
      badge={result.presentation.proofLabel}
      open={searchProofOpen}
      onToggle={setSearchProofOpen}
      testId="search-proof-disclosure"
      className="optimizer-result-disclosure"
    >
      <SearchActivityVisualizer
        progress={progress}
        running={running}
        selectedRouteName={publicSelectedRouteName}
        modifierDescriptors={targetDescriptors}
        onRetryDeeper={retryDeeper}
        retryDeeperBudget={retryDeeperBudget}
        onCancel={cancel}
      />
      <section
        className="request-budget-utilization"
        data-testid="request-budget-utilization"
        data-requested-preset={result.search.requestBudget.requested.preset}
        data-requested-max-states={result.search.requestBudget.requested.maxStates}
        data-requested-max-wall-time-ms={result.search.requestBudget.requested.maxWallTimeMs}
        data-requested-max-rounds={result.search.requestBudget.requested.maxExpansionRounds}
        data-used-states={result.search.requestBudget.used.statesExpanded}
        data-retained-states={result.search.requestBudget.used.retainedStates}
        data-new-states-expanded={displayedSearchEvidence?.newStatesExpandedThisRun}
        data-portfolio-states-expanded={displayedSearchEvidence?.totalPortfolioStatesExpanded}
        data-continuation-states-retained={displayedSearchEvidence?.statesRetainedForContinuation}
        data-used-elapsed-ms={result.search.requestBudget.used.elapsedMs}
        data-stop-reason={result.search.requestBudget.stop.primary}
      >
        <h3>Search budget used</h3>
        <dl data-testid="search-evidence-summary">
          <dt>New states expanded this run</dt>
          <dd>{displayedSearchEvidence?.newStatesExpandedThisRun.toLocaleString()}</dd>
          <dt>Total portfolio states expanded</dt>
          <dd>{displayedSearchEvidence?.totalPortfolioStatesExpanded.toLocaleString()}</dd>
          <dt>States retained for continuation</dt>
          <dd>{displayedSearchEvidence?.statesRetainedForContinuation.toLocaleString()}</dd>
          <dt>Requested expansion cap</dt>
          <dd>{displayedSearchEvidence?.requestedExpansionCap.toLocaleString()}</dd>
          <dt>Stopping condition</dt>
          <dd>{REQUEST_STOP_COPY[result.search.requestBudget.stop.primary].label}</dd>
        </dl>
        <details className="request-budget-raw-summary">
          <summary>Additional request details</summary>
          <dl>
            <dt>Requested</dt>
            <dd>
              {result.search.requestBudget.requested.preset.replace('_', ' ')} — up to{' '}
              {compactBudgetValue(result.search.requestBudget.requested.maxStates)} states /{' '}
              {Math.round(result.search.requestBudget.requested.maxWallTimeMs / 1000)}s /{' '}
              {result.search.requestBudget.requested.maxExpansionRounds} rounds
            </dd>
            <dt>Used</dt>
            <dd>
              {result.search.requestBudget.used.statesExpanded.toLocaleString()} expanded ·{' '}
              {result.search.requestBudget.used.retainedStates.toLocaleString()} retained ·{' '}
              {(result.search.requestBudget.used.elapsedMs / 1000).toFixed(1)}s
            </dd>
            <dt>Stopped</dt>
            <dd>{REQUEST_STOP_COPY[result.search.requestBudget.stop.primary].label}</dd>
          </dl>
        </details>
        {result.search.requestBudget.stop.secondary.length > 0 && (
          <p className="muted">Also observed: {result.search.requestBudget.stop.secondary
            .map((reason) => REQUEST_STOP_COPY[reason].label)
            .join(', ')}.</p>
        )}
        {result.search.requestBudget.stop.primary !== 'PROOF_CLOSED' && (
          <p className="budget-retry-recommendation">
            {REQUEST_STOP_COPY[result.search.requestBudget.stop.primary].retry}{' '}
            Exact reuse available: {result.search.requestBudget.used.retainedStates.toLocaleString()} retained states.
            A deeper run may improve the proof; it does not guarantee closure.
          </p>
        )}
      </section>
    </OptimizerDisclosure>
  ) : null;

  return (
    <main className="optimizer-page">
      {activeSeed && (
        <section
          ref={sourceBannerRef}
          tabIndex={-1}
          className="optimizer-source-banner"
          aria-label="Cluster Jewels handoff source"
          data-seed-id={activeSeed.id}
          data-seed-target-ids={activeSeed.targetModIds.join(',')}
        >
          <div>
            <strong>Loaded from Cluster Jewels</strong>
            <span>
              {activeSeed.sourceComboLabel ?? 'Base and enchantment'} · {activeSeed.clusterType} ·{' '}
              {activeSeed.passiveCount ?? activeSeed.passiveRange?.min} passives
            </span>
          </div>
          {onBackToClusterJewels && (
            <button type="button" className="secondary" onClick={onBackToClusterJewels}>
              Back to Cluster Jewels
            </button>
          )}
          {activeSeed.itemLevelDefaulted && (
            <p>Item level was not unique in the source data; ilvl 84 was supplied as an editable default.</p>
          )}
          {activeSeed.sourceMarketValue && (
            <p>
              Source market {activeSeed.sourceMarketValue.kind.toLowerCase()}: {activeSeed.sourceMarketValue.chaos.toFixed(1)}c ·{' '}
              {activeSeed.sourceMarketValue.provenance}
            </p>
          )}
          {activeSeed.sourceMarketValue && !sourceQuoteExactForSelectedPassive && (
            <p className="warning-note" role="status">
              This quote spans {activeSeed.sourceMarketValue.passiveRange.min}–{activeSeed.sourceMarketValue.passiveRange.max} passives.
              It is shown with provenance, but no single-passive profit comparison will be claimed.
            </p>
          )}
          {seedWarning && <p className="warning-note" role="status">{seedWarning}</p>}
          {activeSeed.targetModIds.length > 0 && (
            <details>
              <summary>Technical handoff details</summary>
              <code>{activeSeed.targetModIds.join(' + ')}</code>
            </details>
          )}
        </section>
      )}
      <p className="subtitle">
        Import a target, then optimize it. Manual construction and complete research evidence remain available when needed.
      </p>

      <section className="optimizer-card optimizer-form" aria-labelledby="optimizer-input-title">
        <div className="craft-guide-heading-row optimizer-entry-heading">
          <div>
            <p className="eyebrow">Craft Optimizer</p>
            <h2 id="optimizer-input-title">{entryMode === 'fresh' ? 'Import a craft' : 'Target ready'}</h2>
            <p>
              {entryMode === 'fresh'
                ? 'Optimizer JSON is the fastest way to load a complete, reproducible target.'
                : 'Review the compact target below or optimize with the loaded settings.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="export-btn optimizer-import-primary"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Import Setup JSON file"
            >
              Import optimizer JSON
            </button>
            <button
              type="button"
              className="secondary export-btn"
              onClick={() => setShowHelpModal(true)}
              aria-label="Open Optimizer Guide and FAQ"
            >
              Guide &amp; Engine FAQ
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importSetupJson(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {importError && <div className="optimizer-validation optimizer-import-error" role="alert" data-testid="optimizer-import-error">{importError}</div>}
        {setupRepairMessage && (
          <div className="optimizer-validation optimizer-setup-repair" role="alert" data-testid="optimizer-setup-repair">
            {setupRepairMessage}
          </div>
        )}
        <div className="optimizer-secondary-entry-actions">
          <button
            type="button"
            className="secondary"
            aria-expanded={presetsOpen}
            onClick={() => setPresetsOpen((current) => !current)}
          >
            Use a preset
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setEntryMode('manual');
              setImportError(null);
              setSetupRepairSource('none');
              setTargetEditorOpen(true);
            }}
          >
            Build manually
          </button>
        </div>
        {presetsOpen && <div className="target-presets-row" aria-label="Popular Craft Target Presets">
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>⚡ Quick Presets:</span>
          <button type="button" className="preset-chip" onClick={() => applyPreset('attack-large')}>
            Large Attack (8p / 2-Notable)
          </button>
          <button type="button" className="preset-chip" onClick={() => applyPreset('es-small')}>
            Small Energy Shield (2p / Magic)
          </button>
        </div>}
        <OptimizerDisclosure
          title="Edit target"
          description="Base, enchantment, item level, passives, rarity, and modifier requirements"
          badge={entryMode === 'fresh' ? 'Manual' : `${selectedTargetIds.length} required`}
          open={targetEditorOpen}
          onToggle={setTargetEditorOpen}
          testId="target-editor-disclosure"
        >
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
            <input type="number" min="1" max="100" value={itemLevel} onChange={(event) => {
              if (event.target.valueAsNumber !== itemLevel) detachClusterHandoff('item level changed');
              setItemLevel(event.target.valueAsNumber);
            }} />
          </label>
          <label>
            <span>Passive skills</span>
            <select value={passiveCount} onChange={(event) => {
              const next = Number(event.target.value);
              if (next !== passiveCount) detachClusterHandoff('passive count changed');
              setPassiveCount(next);
            }}>
              {passiveCounts.map((passives) => <option key={passives}>{passives}</option>)}
            </select>
          </label>
          <label>
            <span>Final rarity</span>
            <select
              value={finalRarity}
              onChange={(event) => {
                const next = event.target.value as typeof finalRarity;
                if (next !== finalRarity) detachClusterHandoff('final rarity changed');
                setFinalRarity(next);
              }}
            >
              <option value="any">Any</option>
              <option value="magic">Magic</option>
              <option value="rare">Rare</option>
            </select>
          </label>
          <label>
            <span>Pricing league</span>
            <select value={league} onChange={(event) => {
              if (event.target.value !== league) detachClusterHandoff('pricing league changed');
              setLeague(event.target.value);
            }}>
              {pricingLeagues.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>Extra affixes</span>
            <select value={finishCondition} onChange={(event) => {
              const next = event.target.value as typeof finishCondition;
              if (next !== finishCondition) detachClusterHandoff('extra-affix constraint changed');
              setFinishCondition(next);
            }}>
              <option value="any-match">Allow extra affixes</option>
              <option value="no-unwanted">No unwanted affixes</option>
            </select>
          </label>
        </div>

        <div className="target-list required-target-list" data-testid="required-modifier-editor">
          <h3>Required modifiers ({selectedTargetIds.length}/4)</h3>
          <p className="muted">All of these must be present.</p>
          {targetModIds.map((modId, index) => (
            <div className="target-row" key={index}>
              <SearchableModifierSelect
                value={modId}
                onChange={(nextModId) => updateTarget(index, nextModId)}
                eligibleMods={eligibleMods}
                disabledModIds={[
                  ...targetModIds.filter((id, i) => i !== index && Boolean(id)),
                  ...selectedAlternativeIds,
                ]}
                ariaLabel={`Required modifier ${index + 1}`}
                placeholder="Select an eligible modifier…"
              />
              {targetModIds.length > 1 && (
                <button
                  type="button"
                  className="secondary remove-target-btn"
                  onClick={() => {
                    detachClusterHandoff('required modifier removed');
                    setTargetModIds((current) => current.filter((_, i) => i !== index));
                  }}
                  title="Remove modifier slot"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {targetModIds.length < 4 && (
            <button
              type="button"
              className="secondary add-target-btn"
              onClick={() => {
                detachClusterHandoff('required modifier slot added');
                setTargetModIds((current) => [...current, '']);
              }}
            >
              + Add modifier
            </button>
          )}
          <p className="muted">
            Relevant fractured bases are manufactured through executable self-fracture synthesis;
            no pre-fractured market quote is required or ranked.
          </p>
        </div>

        <div className="target-list acceptable-target-list" data-testid="acceptable-alternative-editor">
          <h3>Acceptable alternative modifiers</h3>
          <label className="acceptable-target-toggle">
            <input
              type="checkbox"
              checked={acceptableAlternativesEnabled}
              onChange={(event) => {
                if (event.target.checked !== acceptableAlternativesEnabled) {
                  detachClusterHandoff('acceptable alternatives toggled');
                }
                setPreserveDecodedSingleAlternative(false);
                setAcceptableAlternativesEnabled(event.target.checked);
                if (event.target.checked && acceptableAlternativeModIds.length < 2) {
                  setAcceptableAlternativeModIds(['', '']);
                }
              }}
            />
            <span>Require one acceptable alternative</span>
          </label>
          <p className="muted">At least one of these must be present. Every selected alternative is equally acceptable.</p>
          {acceptableAlternativesEnabled && (
            <>
              {acceptableAlternativeModIds.map((modId, index) => (
                <div className="target-row" key={index}>
                  <SearchableModifierSelect
                    value={modId}
                    onChange={(nextModId) => updateAcceptableAlternative(index, nextModId)}
                    eligibleMods={eligibleMods}
                    disabledModIds={[
                      ...selectedTargetIds,
                      ...acceptableAlternativeModIds.filter((id, i) => i !== index && Boolean(id)),
                    ]}
                    ariaLabel={`Acceptable alternative ${index + 1}`}
                    placeholder="Select an equally acceptable modifier..."
                  />
                  {acceptableAlternativeModIds.length > 1 && (
                    <button
                      type="button"
                      className="secondary remove-target-btn"
                      onClick={() => {
                        detachClusterHandoff('acceptable alternative removed');
                        setPreserveDecodedSingleAlternative(false);
                        setAcceptableAlternativeModIds((current) => current.filter((_, i) => i !== index));
                      }}
                      title="Remove acceptable alternative"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {acceptableAlternativeModIds.length < 6 && (
                <button
                  type="button"
                  className="secondary add-target-btn"
                  onClick={() => {
                    detachClusterHandoff('acceptable alternative slot added');
                    setPreserveDecodedSingleAlternative(false);
                    setAcceptableAlternativeModIds((current) => [...current, '']);
                  }}
                >
                  + Add acceptable alternative
                </button>
              )}
              {alternativeSelectionError && <p className="optimizer-validation">{alternativeSelectionError}</p>}
            </>
          )}
        </div>

        </OptimizerDisclosure>

        {entryMode !== 'fresh' && <section className="target-summary compact-target-summary" data-testid="structured-target-summary">
          <h3>Target summary</h3>
          <p>{baseType} · {clusterType} · ilvl {itemLevel} · {passiveCount} passives</p>
          <p>Final rarity: {validation.normalizedInput.target.requiredRarity ?? 'Any'}</p>
          <p>Extra affixes: {validation.normalizedInput.target.finalStateConstraints?.maxUnmatchedAffixes === 0 ? 'No unwanted affixes' : 'Allowed'}</p>
          <h4>Must have all</h4>
          <ul data-testid="required-modifier-summary">
            {validation.normalizedInput.target.requiredMods.map((requirement, index) => (
              <li key={`${requirement.modId}-${index}`} data-mod-id={requirement.modId} data-target-role="required">
                {(() => {
                  const mod = eligibleMods.find((candidate) => candidate.modId === requirement.modId);
                  return mod ? (
                    <>
                      <strong>{mod.primaryText}</strong> · {mod.genType}, ilvl {mod.requiredItemLevel}
                      <details><summary>Technical modifier details</summary><code>{mod.technicalLabel}</code></details>
                    </>
                  ) : (
                    <>
                      <strong>Exact modifier unavailable in the current eligible pool</strong>
                      <details><summary>Technical modifier details</summary><code>Exact modifier ID: {requirement.modId}</code></details>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
          {validation.normalizedInput.target.acceptableAnyOf && (
            <>
              <h4>And at least one</h4>
              <ul data-testid="acceptable-alternative-summary">
                {validation.normalizedInput.target.acceptableAnyOf.map((branch, branchIndex) => {
                  const requirement = branch[0];
                  const mod = eligibleMods.find((candidate) => candidate.modId === requirement?.modId);
                  return (
                    <li
                      key={`${requirement?.modId}-${branchIndex}`}
                      data-mod-id={requirement?.modId}
                      data-target-role="acceptable-alternative"
                    >
                      {mod ? (
                        <>
                          <strong>{mod.primaryText}</strong> · {mod.genType}, ilvl {mod.requiredItemLevel}
                          <details><summary>Technical modifier details</summary><code>{mod.technicalLabel}</code></details>
                        </>
                      ) : (
                        <strong>Exact acceptable alternative unavailable in the current eligible pool</strong>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {validation.notices.map((notice) => <p className="muted" key={notice.code}>{notice.message}</p>)}
        </section>}

        <OptimizerDisclosure
          title="Optimization settings"
          description="Objective, search depth, budgets, and fallback pricing"
          badge={searchDepthPreset === 'CUSTOM' ? 'Custom' : SEARCH_DEPTH_PRESETS[searchDepthPreset].label}
          open={settingsOpen}
          onToggle={setSettingsOpen}
          testId="optimization-settings-disclosure"
        >
        <p className="muted">
          {marketPricing?.marketContext.cleanBaseQuote.provenance ?? 'No league price snapshot is available.'}
        </p>
        {importedPriceContext && (
          <p className="muted imported-price-context" role="status">
            Imported pricing context is active for this reproducible setup and overrides matching snapshot rates.
          </p>
        )}
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
              <input
                type="number"
                min="0"
                step="1"
                value={saleValue}
                data-sale-value-provenance={saleValueProvenance}
                onChange={(event) => updateSaleValue(event.target.value)}
              />
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

        <section className="optimizer-section objective-section">
          <h3>Optimization Objective</h3>
          <div className="optimizer-grid">
            <label>
              <span>Optimization goal</span>
              <select
                value={objectiveKind}
                onChange={(e) => setObjectiveKind(e.target.value as OptimizationObjectiveKind)}
              >
                <option value="CHEAPEST_CHAOS">Cheapest (minimize chaos cost)</option>
                <option value="FEWEST_ACTIONS_WITHIN_COST">Fewest actions (within cost ceiling)</option>
                <option value="FASTEST_WITHIN_COST">Estimated fastest (within cost ceiling)</option>
                <option value="BALANCED_VALUE_OF_TIME">Balanced (currency + value of time)</option>
                <option value="UNCONSTRAINED_FEWEST_ACTIONS">Advanced: Unconstrained fewest actions (ignores cost)</option>
                <option value="UNCONSTRAINED_FASTEST">Advanced: Unconstrained fastest (ignores cost)</option>
              </select>
            </label>

            {(objectiveKind === 'FEWEST_ACTIONS_WITHIN_COST' || objectiveKind === 'FASTEST_WITHIN_COST') && (
              <>
                <label>
                  <span>Cost ceiling type</span>
                  <select
                    value={costConstraintType}
                    onChange={(e) => setCostConstraintType(e.target.value as 'PREMIUM_PERCENT' | 'PREMIUM_CHAOS' | 'ABSOLUTE')}
                  >
                    <option value="PREMIUM_PERCENT">Percentage premium over cheapest (%)</option>
                    <option value="PREMIUM_CHAOS">Chaos premium over cheapest (+chaos)</option>
                    <option value="ABSOLUTE">Absolute maximum cost (chaos)</option>
                  </select>
                </label>
                <label>
                  <span>
                    {costConstraintType === 'PREMIUM_PERCENT' ? 'Max premium (%)' : costConstraintType === 'PREMIUM_CHAOS' ? 'Max premium (chaos)' : 'Max total cost (chaos)'}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step={costConstraintType === 'PREMIUM_PERCENT' ? '5' : '10'}
                    value={costConstraintValue}
                    onChange={(e) => setCostConstraintValue(e.target.value)}
                  />
                </label>
              </>
            )}

            {objectiveKind === 'BALANCED_VALUE_OF_TIME' && (
              <label>
                <span>Player time value (chaos / minute)</span>
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={valueOfTimeChaosPerMin}
                  onChange={(e) => setValueOfTimeChaosPerMin(e.target.value)}
                />
              </label>
            )}
          </div>
          {(objectiveKind === 'UNCONSTRAINED_FEWEST_ACTIONS' || objectiveKind === 'UNCONSTRAINED_FASTEST') && (
            <p className="warning-note">
              ⚠️ Warning: Unconstrained mode ignores currency cost and may recommend expensive Fracturing Orbs even for simple crafts.
            </p>
          )}
        </section>

        <section className="search-depth-control" aria-labelledby="search-depth-title">
          <div>
            <h3 id="search-depth-title">Search depth</h3>
            <p>
              {searchDepthPreset === 'CUSTOM'
                ? `Custom · up to ${maxStates.toLocaleString()} states / ${Math.round(maxWallTimeMs / 1000)}s / ${maxExpansionRounds} rounds`
                : `${SEARCH_DEPTH_PRESETS[searchDepthPreset].label} · up to ${maxStates.toLocaleString()} states / ${Math.round(maxWallTimeMs / 1000)}s / ${maxExpansionRounds} rounds`}
            </p>
          </div>
          <label>
            <span>Search depth preset</span>
            <select
              value={searchDepthPreset}
              onChange={(event) => selectSearchDepthPreset(event.target.value as SearchDepthPreset)}
            >
              {SEARCH_DEPTH_ORDER.map((preset) => {
                const budget = SEARCH_DEPTH_PRESETS[preset];
                return (
                  <option key={preset} value={preset}>
                    {budget.label} — up to {budget.maxStates.toLocaleString()} states / {budget.maxWallTimeMs / 1000}s / {budget.maxExpansionRounds} rounds
                  </option>
                );
              })}
              <option value="CUSTOM">Custom — use Advanced values</option>
            </select>
          </label>
        </section>
        {unresolvedCompetitiveFamilies > 0 && (
          <p
            className="search-depth-recommendation"
            data-competitive-families={unresolvedCompetitiveFamilies}
            data-suggested-depth={suggestedDepth ?? 'CUSTOM'}
          >
            <strong>{unresolvedCompetitiveFamilies} competitive {unresolvedCompetitiveFamilies === 1 ? 'family remains' : 'families remain'}.</strong>{' '}
            Suggested next depth: {suggestedDepth
              ? `${SEARCH_DEPTH_PRESETS[suggestedDepth].label} (up to ${compactBudgetValue(SEARCH_DEPTH_PRESETS[suggestedDepth].maxStates)} / ${SEARCH_DEPTH_PRESETS[suggestedDepth].maxWallTimeMs / 1000}s / ${SEARCH_DEPTH_PRESETS[suggestedDepth].maxExpansionRounds} rounds)`
              : `Custom (${budgetPreview(retryDeeperBudget).replace(' · reuses compatible retained graph', '')})`}.
          </p>
        )}

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
            <label><span>Max states</span><input type="number" min="1" step="100" value={maxStates} onChange={(event) => updateCustomBudget('maxStates', event.target.valueAsNumber)} /></label>
            <label><span>Max wall time (ms)</span><input type="number" min="1" step="1000" value={maxWallTimeMs} onChange={(event) => updateCustomBudget('maxWallTimeMs', event.target.valueAsNumber)} /></label>
            <label><span>Expansion rounds</span><input type="number" min="1" max="20" value={maxExpansionRounds} onChange={(event) => updateCustomBudget('maxExpansionRounds', event.target.valueAsNumber)} /></label>
          </div>
          {exceedsMeasuredResearchPreset && (
            <p className="warning-note" role="status">
              This custom budget exceeds the browser-measured Research preset (up to 50,000 states / 300s / 6 rounds). Cancellation and the requested-runtime host guard remain active.
            </p>
          )}
          <label className="optimizer-checkbox">
            <input type="checkbox" checked={allowFallback} onChange={(event) => setAllowFallback(event.target.checked)} />
            Allow research-fallback currency and acquisition prices
          </label>
        </details>
        </OptimizerDisclosure>

        {validationError && <div className="optimizer-validation">{validationError}</div>}
        <div className="optimizer-actions">
          <button type="button" onClick={() => void optimize()} disabled={running || validationError !== null || workerRef.current === null}>
            {running ? 'Searching…' : objectiveKind === 'CHEAPEST_CHAOS' ? 'Find cheapest craft' : 'Optimize craft'}
          </button>
          {running && <button type="button" className="secondary" onClick={cancel}>Cancel</button>}
        </div>
      </section>

      {error && (
        <div className="error">
          {error}
          {wallTimeExceeded && !running && (
            <RetryDeeperButton onClick={retryDeeper} preview={retryDeeperBudget} />
          )}
        </div>
      )}

      {(progress || running) && (
        <section className="optimizer-card compact-search-status" role="status" aria-live="polite" data-testid="compact-search-status">
          <div>
            <strong>{SEARCH_PHASE_LABELS[progress?.phase ?? 'INITIALIZING']}</strong>
            <span>{progress?.currentFocus
              ? publicModifierText(progress.currentFocus, targetDescriptors)
              : running ? 'Preparing the modeled search space…' : 'Search complete.'}</span>
          </div>
          <dl>
            <dt>Expanded</dt><dd>{(progress?.totalStatesExpanded ?? 0).toLocaleString()}</dd>
            <dt>Elapsed</dt><dd>{((progress?.elapsedMs ?? 0) / 1000).toFixed(1)}s</dd>
          </dl>
          {running && <button type="button" className="secondary" onClick={cancel}>Cancel</button>}
        </section>
      )}

      {(progress || running) && !result && (
        <OptimizerDisclosure
          title="Search & proof"
          description="Complete live activity, request budget, stopping condition, and proof evidence"
          badge={running ? 'Searching' : 'Available'}
          open={searchProofOpen}
          onToggle={setSearchProofOpen}
          testId="search-proof-disclosure"
          className="optimizer-result-disclosure"
        >
          <SearchActivityVisualizer
            progress={progress}
            running={running}
            selectedRouteName={publicSelectedRouteName}
            modifierDescriptors={targetDescriptors}
            onRetryDeeper={retryDeeper}
            retryDeeperBudget={retryDeeperBudget}
            onCancel={cancel}
          />
        </OptimizerDisclosure>
      )}

      {result && (
        <div className="optimizer-results">
          <section
            className="optimizer-card optimizer-summary recommendation-hero"
            data-selected-route={publicSelectedRouteName}
            data-proof-label={result.presentation.proofLabel}
            data-pricing-label={result.presentation.pricingLabel}
          >
            <div className="recommendation-heading">
              <h2>{result.recommendationStatus === 'INTERNAL_RESULT_MISMATCH'
                ? 'Internal consistency failure'
                : result.recommendationStatus === 'NO_RESOLVED_ROUTE'
                  ? 'Search outcome'
                  : 'Craft recommendation'}</h2>
              <span className={`confidence-badge ${result.recommendationStatus.toLowerCase()}`}>
                {result.recommendationStatus === 'PROVEN_OPTIMAL'
                  ? 'Proven optimal'
                  : result.recommendationStatus === 'BEST_RESOLVED_ACQUISITION_SAFE'
                    ? 'Acquisition-safe start'
                    : result.recommendationStatus === 'PROVISIONAL_RESOLVED'
                      ? 'Provisional — acquisition not yet safe'
                      : result.recommendationStatus === 'INTERNAL_RESULT_MISMATCH'
                        ? 'Recommendation withheld'
                        : 'No resolved route'}
              </span>
            </div>
            {activeSeed?.sourceMarketValue && (
              <div className="source-market-summary" aria-label="Market vs craft">
                <h3>Market vs craft</h3>
                {sourceEconomicsReady ? (
                  <dl>
                    <dt>Market sampled {activeSeed.sourceMarketValue.kind.toLowerCase()}</dt>
                    <dd>{chaos(activeSeed.sourceMarketValue.chaos)}</dd>
                    <dt>Selected executable route EV</dt>
                    <dd>{chaos(result.expectedCostChaos)}</dd>
                    <dt>Spread using this executable route</dt>
                    <dd>{result.expectedCostChaos === null
                      ? '—'
                      : `${activeSeed.sourceMarketValue.chaos - result.expectedCostChaos >= 0 ? '+' : ''}${(activeSeed.sourceMarketValue.chaos - result.expectedCostChaos).toFixed(1)}c`}</dd>
                  </dl>
                ) : (
                  <p className="warning-note">
                    No spread is calculated because the source quote and executable result do not describe the same exact passive-count craft identity.
                  </p>
                )}
                {sourceEconomicsReady && (
                  result.recommendationStatus === 'PROVISIONAL_RESOLVED' ||
                  result.acquisition.portfolioProof.unresolvedCompetitiveCandidates > 0
                ) && (
                  <p className="market-proof-caveat">
                    A cheaper crafting route may exist; resolving it would increase the modeled spread, not invalidate this executable route&apos;s EV.
                  </p>
                )}
                <p className="muted">Expected value, not guaranteed profit. {activeSeed.sourceMarketValue.provenance}</p>
              </div>
            )}
            {result.presentation.pricingLabel === 'RESEARCH_ESTIMATE_STALE_PRICING' && (
              <div className="stale-research-estimate" role="alert">
                <strong>Research estimate using stale bundled pricing</strong>
                <span>Route ordering is provisional until current manual overrides or a fresh market snapshot are supplied.</span>
              </div>
            )}
            <div className="recommendation-target">
              <span>Required modifiers</span>
              <strong data-testid="result-required-modifiers">
                {result.target.requiredMods.map((requirement) =>
                  targetRequirementName(requirement, eligibleMods)
                ).join(' + ')}
              </strong>
              {result.target.acceptableAnyOf?.length ? (
                <>
                  <span>Acceptable alternative</span>
                  <strong data-testid="result-acceptable-alternatives">
                    Any one of {result.target.acceptableAnyOf.map((branch) =>
                      acceptableBranchName(branch, eligibleMods)
                    ).join(' OR ')}
                  </strong>
                </>
              ) : null}
              <span>Final rarity</span>
              <strong>{result.target.requiredRarity ?? 'Any rarity'}</strong>
            </div>
            <dl className="recommendation-facts">
              <dt>Selected route</dt><dd>{publicSelectedRouteName ?? 'none certified'}</dd>
              <dt>{result.recommendationStatus === 'NO_RESOLVED_ROUTE' || result.recommendationStatus === 'INTERNAL_RESULT_MISMATCH' ? 'Resolved start' : 'Recommended start'}</dt><dd>{recommendedStart}</dd>
              <dt>Expected cost</dt><dd className="recommendation-cost">{chaos(result.expectedCostChaos)}</dd>
              <dt>Expected physical actions</dt>
              <dd>{result.recommended?.metrics?.expectedPhysicalActions !== undefined ? `${Math.round(result.recommended.metrics.expectedPhysicalActions).toLocaleString()} actions` : '—'}</dd>
              <dt>Estimated manual time</dt>
              <dd>{result.recommended?.metrics?.estimatedManualTimeMs !== undefined ? `${(result.recommended.metrics.estimatedManualTimeMs / 1000).toFixed(1)}s` : '—'}</dd>
              {result.objective && (
                <>
                  <dt>Optimization objective</dt>
                  <dd>
                    {result.objective.kind === 'CHEAPEST_CHAOS'
                      ? 'Cheapest currency cost'
                      : result.objective.kind === 'FEWEST_ACTIONS_WITHIN_COST'
                        ? `Fewest actions (Cost ceiling: ${result.costCeilingChaos ? `${result.costCeilingChaos.toFixed(1)}c` : 'none'})`
                        : result.objective.kind === 'FASTEST_WITHIN_COST'
                          ? `Estimated fastest (Cost ceiling: ${result.costCeilingChaos ? `${result.costCeilingChaos.toFixed(1)}c` : 'none'})`
                          : result.objective.kind === 'BALANCED_VALUE_OF_TIME'
                            ? `Balanced (${result.objective.valueOfTimeChaosPerMinute ?? 50}c/min time value)`
                            : result.objective.kind}
                  </dd>
                </>
              )}
              {displayedProof && (
                <>
                  <dt>Selected policy solve</dt>
                  <dd data-testid="selected-policy-solve">{displayedProof.selectedPolicySolve}</dd>
                  <dt>Portfolio optimality</dt>
                  <dd data-testid="portfolio-optimality">{displayedProof.portfolioOptimality}</dd>
                </>
              )}
              {result.expectedSaleValueChaos !== undefined && <><dt>Expected sale value</dt><dd>{chaos(result.expectedSaleValueChaos)}</dd></>}
              {result.expectedProfitChaos !== undefined && <><dt>Expected profit</dt><dd>{chaos(result.expectedProfitChaos)}</dd></>}
              <dt>Starting acquisition confidence</dt>
              <dd>{result.recommendationStatus === 'INTERNAL_RESULT_MISMATCH'
                ? 'Recommendation withheld because canonical result fields did not reconcile'
                : result.recommendationStatus === 'NO_RESOLVED_ROUTE'
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
              <strong>{result.presentation.proofLabel}</strong>
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
            {result.recommendationStatus === 'INTERNAL_RESULT_MISMATCH' && (
              <div className="no-route-warning" role="alert">
                <strong>The recommendation was withheld.</strong>
                <span>Route, policy, and material totals exceeded the 0.05c reconciliation tolerance. Diagnostic evidence remains available below.</span>
              </div>
            )}
            {/* Phase 3J moved Search & proof to the top-level research sequence.
            <OptimizerDisclosure
              title="Search & proof"
              description="Complete live activity, request budget, stopping condition, and proof evidence"
              badge={result.presentation.proofLabel}
              open={searchProofOpen}
              onToggle={setSearchProofOpen}
              testId="search-proof-disclosure"
              className="optimizer-result-disclosure recommendation-research-disclosure"
            >
            <SearchActivityVisualizer
              progress={progress}
              running={running}
              selectedRouteName={publicSelectedRouteName}
              modifierDescriptors={targetDescriptors}
              onRetryDeeper={retryDeeper}
              retryDeeperBudget={retryDeeperBudget}
              onCancel={cancel}
            />
            <section
              className="request-budget-utilization"
              data-testid="request-budget-utilization"
              data-requested-preset={result.search.requestBudget.requested.preset}
              data-requested-max-states={result.search.requestBudget.requested.maxStates}
              data-requested-max-wall-time-ms={result.search.requestBudget.requested.maxWallTimeMs}
              data-requested-max-rounds={result.search.requestBudget.requested.maxExpansionRounds}
              data-used-states={result.search.requestBudget.used.statesExpanded}
              data-retained-states={result.search.requestBudget.used.retainedStates}
              data-new-states-expanded={displayedSearchEvidence?.newStatesExpandedThisRun}
              data-portfolio-states-expanded={displayedSearchEvidence?.totalPortfolioStatesExpanded}
              data-continuation-states-retained={displayedSearchEvidence?.statesRetainedForContinuation}
              data-used-elapsed-ms={result.search.requestBudget.used.elapsedMs}
              data-stop-reason={result.search.requestBudget.stop.primary}
            >
              <h3>Search budget used</h3>
              <dl data-testid="search-evidence-summary">
                <dt>New states expanded this run</dt>
                <dd>{displayedSearchEvidence?.newStatesExpandedThisRun.toLocaleString()}</dd>
                <dt>Total portfolio states expanded</dt>
                <dd>{displayedSearchEvidence?.totalPortfolioStatesExpanded.toLocaleString()}</dd>
                <dt>States retained for continuation</dt>
                <dd>{displayedSearchEvidence?.statesRetainedForContinuation.toLocaleString()}</dd>
                <dt>Requested expansion cap</dt>
                <dd>{displayedSearchEvidence?.requestedExpansionCap.toLocaleString()}</dd>
                <dt>Stopping condition</dt>
                <dd>{REQUEST_STOP_COPY[result.search.requestBudget.stop.primary].label}</dd>
              </dl>
              <details className="request-budget-raw-summary">
                <summary>Additional request details</summary>
              <dl>
                <dt>Requested</dt>
                <dd>
                  {result.search.requestBudget.requested.preset.replace('_', ' ')} — up to{' '}
                  {compactBudgetValue(result.search.requestBudget.requested.maxStates)} states /{' '}
                  {Math.round(result.search.requestBudget.requested.maxWallTimeMs / 1000)}s /{' '}
                  {result.search.requestBudget.requested.maxExpansionRounds} rounds
                </dd>
                <dt>Used</dt>
                <dd>
                  {result.search.requestBudget.used.statesExpanded.toLocaleString()} expanded ·{' '}
                  {result.search.requestBudget.used.retainedStates.toLocaleString()} retained ·{' '}
                  {(result.search.requestBudget.used.elapsedMs / 1000).toFixed(1)}s
                </dd>
                <dt>Stopped</dt>
                <dd>{REQUEST_STOP_COPY[result.search.requestBudget.stop.primary].label}</dd>
              </dl>
              </details>
              {result.search.requestBudget.stop.secondary.length > 0 && (
                <p className="muted">
                  Also observed: {result.search.requestBudget.stop.secondary
                    .map((reason) => REQUEST_STOP_COPY[reason].label)
                    .join(', ')}.
                </p>
              )}
              {result.search.requestBudget.stop.primary !== 'PROOF_CLOSED' && (
                <p className="budget-retry-recommendation">
                  {REQUEST_STOP_COPY[result.search.requestBudget.stop.primary].retry}{' '}
                  Exact reuse available: {result.search.requestBudget.used.retainedStates.toLocaleString()} retained states.
                  A deeper run may improve the proof; it does not guarantee closure.
                </p>
              )}
            </section>
            </OptimizerDisclosure> */}
            {materialWarnings.length > 0 && (
              <section className="decision-warnings" aria-label="Important recommendation warnings">
                <h3>Important for this recommendation</h3>
                <ul>
                  {materialWarnings.map((warning) => (
                    <li key={`${warning.category}-${warning.message}`}>
                      {publicModifierText(playerWarning(warning.message), targetDescriptors, 'primary')}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(result.recommendationStatus !== 'PROVEN_OPTIMAL' || result.search.budgetExhausted) && (
              <RetryDeeperButton onClick={retryDeeper} preview={retryDeeperBudget} />
            )}
          </section>

          <OptimizerDisclosure
            title="Alternative methods"
            description="Pareto tradeoffs, Harvest comparisons, and independently evaluated method families"
            badge={result.methodPortfolio ? `${result.methodPortfolio.length} families` : 'Research'}
            open={alternativeMethodsOpen}
            onToggle={setAlternativeMethodsOpen}
            testId="alternative-methods-disclosure"
            className="optimizer-result-disclosure"
          >
          {result.paretoAlternatives && result.paretoAlternatives.length > 0 && (
            <section className="optimizer-card pareto-comparison-card" aria-labelledby="pareto-card-title">
              <h2 id="pareto-card-title">Multi-Objective Tradeoffs &amp; Alternatives</h2>
              <p className="muted">
                These non-dominated alternatives form the current resolved Pareto set for currency cost, physical crafting operations, and manual crafting time. Unresolved competitors are excluded.
              </p>
              <div className="pareto-grid">
                {result.paretoAlternatives.map((alt, idx) => (
                  <div
                    key={idx}
                    className={`pareto-alternative-card ${alt.isRequestedObjective ? 'selected-objective' : ''}`}
                  >
                    <div className="pareto-card-header">
                      <span className="pareto-route-name">{publicModifierText(alt.route.name, targetDescriptors)}</span>
                      <div className="pareto-badges">
                        {alt.isCheapest && <span className="badge badge-cheapest">Cheapest</span>}
                        {alt.isFewestActions && <span className="badge badge-actions">Fewest Actions</span>}
                        {alt.isFastest && <span className="badge badge-fastest">Fastest</span>}
                        {alt.isRequestedObjective && <span className="badge badge-selected">Selected Goal</span>}
                      </div>
                    </div>
                    <dl className="pareto-metrics">
                      <div>
                        <dt>Expected Cost</dt>
                        <dd className="cost-val">{chaos(alt.route.expectedTotalCostChaos)}</dd>
                      </div>
                      <div>
                        <dt>Physical Actions</dt>
                        <dd>{alt.route.metrics?.expectedPhysicalActions !== undefined ? Math.round(alt.route.metrics.expectedPhysicalActions).toLocaleString() : '—'}</dd>
                      </div>
                      <div>
                        <dt>Estimated Time</dt>
                        <dd>{alt.route.metrics?.estimatedManualTimeMs !== undefined ? `${(alt.route.metrics.estimatedManualTimeMs / 1000).toFixed(1)}s` : '—'}</dd>
                      </div>
                    </dl>
                    <p className="pareto-tradeoff-text">{publicModifierText(alt.tradeoffSummary, targetDescriptors, 'primary')}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.harvestComparison && (
            <section
              className="optimizer-card harvest-comparison-card"
              aria-labelledby="harvest-card-title"
              data-harvest-lifecycle={result.harvestComparison.status}
              data-harvest-action-evidence={result.harvestComparison.actionEvidenceObserved}
            >
              <div className="harvest-card-heading">
                <h2 id="harvest-card-title">Harvest Crafting Comparison</h2>
                <span className={`harvest-status-badge ${result.harvestComparison.status.toLowerCase()}`}>
                  {result.harvestComparison.status === 'SELECTED'
                    ? 'Harvest Route Recommended'
                    : result.harvestComparison.status === 'RESOLVED_MORE_EXPENSIVE'
                      ? 'Harvest More Expensive'
                      : result.harvestComparison.status === 'NOT_ELIGIBLE'
                        ? 'Not Eligible for Target'
                        : result.harvestComparison.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="harvest-explanation">
                {publicModifierText(result.harvestComparison.explanation, targetDescriptors, 'primary')}
              </p>
              {result.harvestComparison.actionEvidenceObserved && (
                <div className="harvest-comparison-grid">
                  <div className="harvest-stat-box">
                    <span className="stat-label">Expected Harvest Applications</span>
                    <strong className="stat-value">{count(result.harvestComparison.expectedHarvestApplications ?? 0)}</strong>
                  </div>
                  {result.harvestComparison.certifiedSuccessProbabilityPerApplication !== undefined && (
                    <div className="harvest-stat-box">
                      <span className="stat-label">Success per Application</span>
                      <strong className="stat-value">
                        {(result.harvestComparison.certifiedSuccessProbabilityPerApplication * 100).toFixed(4)}%
                      </strong>
                      <small>Certified from the authoritative transition distribution</small>
                    </div>
                  )}
                  <div className="harvest-stat-box">
                    <span className="stat-label">Expected Lifeforce</span>
                    <strong className="stat-value">
                      {count(result.harvestComparison.expectedLifeforce ?? 0)} {result.harvestComparison.lifeforceType}
                    </strong>
                    <small>{result.harvestComparison.lifeforcePerApplication} per application</small>
                  </div>
                  <div className="harvest-stat-box">
                    <span className="stat-label">Non-Lifeforce Cost</span>
                    <strong className="stat-value">{chaos(result.harvestComparison.harvestNonLifeforceCostChaos)}</strong>
                  </div>
                  <div className="harvest-stat-box">
                    <span className="stat-label">Current-Price Harvest Total</span>
                    <strong className="stat-value">{chaos(result.harvestComparison.harvestTotalAtCurrentPriceChaos)}</strong>
                  </div>
                  <div className="harvest-stat-box">
                    <span className="stat-label">Currency Delta</span>
                    <strong className={`stat-value ${(result.harvestComparison.costDifferenceChaos ?? 0) <= 0 ? 'good' : 'more-cost'}`}>
                      {result.harvestComparison.costDifferenceChaos === undefined
                        ? '—'
                        : result.harvestComparison.costDifferenceChaos > 0
                          ? `+${result.harvestComparison.costDifferenceChaos.toFixed(1)}c`
                          : `${result.harvestComparison.costDifferenceChaos.toFixed(1)}c`}
                    </strong>
                  </div>
                  <div className="harvest-stat-box">
                    <span className="stat-label">Physical Action Difference</span>
                    <strong className={`stat-value ${(result.harvestComparison.actionsSaved ?? 0) >= 0 ? 'good' : 'more-cost'}`}>
                      {result.harvestComparison.actionsSaved === undefined
                        ? '—'
                        : result.harvestComparison.actionsSaved > 0
                          ? `${Math.round(result.harvestComparison.actionsSaved).toLocaleString()} fewer`
                          : result.harvestComparison.actionsSaved < 0
                            ? `${Math.round(Math.abs(result.harvestComparison.actionsSaved)).toLocaleString()} more`
                            : 'No difference'}
                    </strong>
                  </div>
                  <div className="harvest-stat-box">
                    <span className="stat-label">Manual Time Difference</span>
                    <strong className={`stat-value ${(result.harvestComparison.timeSavedMs ?? 0) >= 0 ? 'good' : 'more-cost'}`}>
                      {result.harvestComparison.timeSavedMs === undefined
                        ? '—'
                        : result.harvestComparison.timeSavedMs > 0
                          ? `${(result.harvestComparison.timeSavedMs / 1000).toFixed(0)}s faster`
                          : result.harvestComparison.timeSavedMs < 0
                            ? `${(Math.abs(result.harvestComparison.timeSavedMs) / 1000).toFixed(0)}s slower`
                            : 'No difference'}
                    </strong>
                  </div>
                  {result.harvestComparison.lifeforceCrossoverPriceChaosPerUnit !== undefined && result.harvestComparison.lifeforceCrossoverPriceChaosPerUnit > 0 && (
                    <div className="harvest-stat-box crossover-box">
                      <span className="stat-label">Lifeforce Crossover Price</span>
                      <strong className="stat-value crossover">
                        {result.harvestComparison.lifeforceCrossoverPriceChaosPerUnit.toFixed(4)}c / {result.harvestComparison.lifeforceType}
                      </strong>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {result.methodPortfolio && result.methodPortfolio.length > 0 && (
            <section className="optimizer-card method-portfolio-card" aria-labelledby="method-portfolio-title">
              <div className="method-portfolio-heading">
                <h2 id="method-portfolio-title">Crafting Method Comparison</h2>
                <span className="portfolio-badge">
                  {result.methodPortfolio.filter((method) => method.evaluationSource === 'INDEPENDENT_SOLVE').length}/{result.methodPortfolio.length} Independently Solved
                </span>
              </div>
              <p className="muted">
                Each card states whether it came from an independent constrained solve, an open-search summary, or has not been searched. Required mechanics are accepted only with positive on-policy action evidence.
              </p>
              {result.methodPortfolio.some((method) => method.evaluationSource !== 'INDEPENDENT_SOLVE' && method.status !== 'NOT_MODELED') && (
                <button type="button" className="secondary compare-methods-btn" onClick={compareMethods} disabled={running}>
                  {comparingMethods ? 'Comparing methods…' : 'Compare Methods Independently'}
                </button>
              )}
              <div className="method-portfolio-grid">
                {result.methodPortfolio.map((method) => {
                  const isWinner = method.status === 'SELECTED_WINNER';
                  const isSameSelectedPolicy = method.status === 'SAME_AS_SELECTED';
                  const isMoreExpensive = method.status === 'MORE_EXPENSIVE';
                  const isDominated = method.status === 'DOMINATED';
                  const isNotEligible = method.status === 'NOT_ELIGIBLE';
                  const isUnresolved = method.status === 'UNRESOLVED_AT_BUDGET';
                  const isNotSearched = method.status === 'NOT_SEARCHED';

                  return (
                    <div
                      key={method.spec.id}
                      className={`method-family-card ${isWinner ? 'winner' : ''} ${isSameSelectedPolicy ? 'same-selected-policy' : ''} status-${method.status.toLowerCase()}`}
                      data-method-family-id={method.spec.id}
                      data-evaluation-source={method.evaluationSource}
                      data-incumbent-source={method.incumbentSource}
                      data-family-search-status={method.familySearchStatus}
                      data-known-policy-admissible={method.knownPolicyAdmissibility?.admissible}
                      data-selected-open-policy-admissible={method.selectedOpenPolicyAdmissibility?.admissible}
                      data-required-action-evidence={method.requiredActionEvidenceChecks
                        ?.map((check) =>
                          `${check.actionId}:${check.requiredScope}:${check.observed}`
                        )
                        .join(',')}
                      data-objective-eligibility={method.objectiveEligibility}
                      data-required-action-observed={method.requiredActionObservedOnPolicy}
                      data-duplicate-of={method.duplicateOfMethodFamilyId}
                      data-player-route={method.playerRouteName
                        ? publicModifierText(method.playerRouteName, targetDescriptors)
                        : undefined}
                    >
                      <div className="method-card-header">
                        <div className="method-title-group">
                          <span className="method-badge-pill">{publicModifierText(method.spec.badge, targetDescriptors)}</span>
                          <h3 className="method-name">{methodFamilyPlayerName(method, eligibleMods)}</h3>
                        </div>
                        <span className={`method-status-tag ${method.status.toLowerCase()}`}>
                          {isWinner
                            ? 'Recommended'
                            : isSameSelectedPolicy
                              ? 'Same selected policy'
                            : isMoreExpensive
                              ? method.costDifferenceChaos !== undefined
                                ? `+${method.costDifferenceChaos.toFixed(1)}c${method.costDifferencePercent !== undefined ? ` (+${method.costDifferencePercent.toFixed(0)}%)` : ''}`
                                : 'More Expensive'
                              : isDominated
                                ? 'Dominated'
                                : isNotEligible
                                  ? 'Not Eligible'
                                  : isUnresolved
                                    ? 'Unresolved at budget'
                                    : isNotSearched
                                      ? 'Not searched'
                                    : method.status}
                        </span>
                      </div>
                      <p className="method-desc">{publicModifierText(method.spec.description, targetDescriptors, 'primary')}</p>
                      {method.playerRouteName && (
                        <p className="method-route-name">
                          <strong>{method.route ? 'Route:' : 'Route family:'}</strong>{' '}
                          {publicModifierText(method.playerRouteName, targetDescriptors)}
                        </p>
                      )}
                      <p className="method-evaluation-source">
                        <strong>Evidence:</strong> {method.evaluationSource.replace(/_/g, ' ')}
                        {method.duplicateOfMethodFamilyId ? ` · canonically equivalent to ${method.duplicateOfMethodFamilyId}` : ''}
                      </p>
                      {method.incumbentSource && (
                        <p className="method-incumbent-source">
                          <strong>Executable incumbent:</strong>{' '}
                          {method.incumbentSource.replace(/_/g, ' ').toLowerCase()}
                          {method.revalidatedKnownPolicyCostChaos !== undefined
                            ? ` · revalidated U ${chaos(method.revalidatedKnownPolicyCostChaos)}`
                            : ''}
                        </p>
                      )}
                      {method.selectedOpenPolicyAdmissibility && (
                        <p className="method-incumbent-source">
                          <strong>Selected Open policy in this family:</strong>{' '}
                          {method.selectedOpenPolicyAdmissibility.admissible
                            ? 'admissible'
                            : `inadmissible · ${method.selectedOpenPolicyAdmissibility.failures
                                .map((failure) => failure.code.replace(/_/g, ' ').toLowerCase())
                                .join(', ')}`}
                        </p>
                      )}
                      {method.policyEquivalenceEvidence && (
                        <details className="method-equivalence-evidence">
                          <summary>Policy equivalence evidence</summary>
                          <dl>
                            <div><dt>Fingerprint</dt><dd>{method.policyEquivalenceFingerprint}</dd></div>
                            <div><dt>Acquisition identity</dt><dd>{method.policyEquivalenceEvidence.physicalAcquisitionIdentity}</dd></div>
                            <div><dt>Normalized decisions</dt><dd>{method.policyEquivalenceEvidence.normalizedPolicyDecisionCount}</dd></div>
                            <div><dt>Required action evidence</dt><dd>{method.policyEquivalenceEvidence.requiredActionEvidence.join(', ') || 'none'}</dd></div>
                            <div><dt>Recovery / terminal evidence</dt><dd>{method.policyEquivalenceEvidence.recoveryDecisionCount} / {method.policyEquivalenceEvidence.terminalStateCount}</dd></div>
                            <div><dt>Usage tolerance</dt><dd>{method.policyEquivalenceEvidence.usageTolerance}</dd></div>
                          </dl>
                        </details>
                      )}
                      {method.objectiveEligibility && (
                        <p className="method-objective-eligibility">
                          <strong>Objective eligibility:</strong>{' '}
                          {method.objectiveEligibility.replace(/_/g, ' ').toLowerCase()}
                        </p>
                      )}
                      {method.route && (
                        <dl className="method-metrics">
                          <div>
                            <dt>Expected Cost</dt>
                            <dd className="cost-val">{chaos(method.route.expectedTotalCostChaos)}</dd>
                          </div>
                          <div>
                            <dt>Actions</dt>
                            <dd>{method.route.metrics?.expectedPhysicalActions !== undefined ? Math.round(method.route.metrics.expectedPhysicalActions).toLocaleString() : '—'}</dd>
                          </div>
                          <div>
                            <dt>Time</dt>
                            <dd>{method.route.metrics?.estimatedManualTimeMs !== undefined ? `${(method.route.metrics.estimatedManualTimeMs / 1000).toFixed(1)}s` : '—'}</dd>
                          </div>
                        </dl>
                      )}
                      <dl className="method-stage-metrics">
                        <div><dt>Acquisition</dt><dd>{method.acquisitionStatus} · L {chaos(method.acquisitionL)} · U {chaos(method.acquisitionU)}</dd></div>
                        <div><dt>Downstream</dt><dd>{method.downstreamStatus} · L {chaos(method.downstreamL)} · U {chaos(method.downstreamU)}</dd></div>
                        <div><dt>Full route</dt><dd>{method.fullRouteStatus} · L {chaos(method.fullRouteL)} · U {chaos(method.fullRouteU)}</dd></div>
                        <div><dt>Required action evidence</dt><dd>{method.requiredActionEvidenceChecks?.length
                          ? method.requiredActionEvidenceChecks.map((check) =>
                              `${check.actionId} @ ${check.requiredScope.toLowerCase()}: ` +
                              (check.observed
                                ? `observed (${check.observedExpectedCount.toFixed(4)} expected)`
                                : 'not observed')
                            ).join(' · ')
                          : method.spec.requiredActionEvidence?.length
                            ? method.spec.requiredActionEvidence.map((requirement) =>
                                `${requirement.actionId} @ ${requirement.scope.toLowerCase()}: not evaluated`
                              ).join(' · ')
                            : 'not required'}</dd></div>
                        {method.policyHealth && <>
                          <div><dt>Policy execution status</dt><dd>{method.policyHealth.selectedPolicyStatus}</dd></div>
                          <div><dt>Family search status</dt><dd>{method.familySearchStatus === 'OPTIMAL_PROVEN'
                            ? 'Family optimum proven'
                            : method.familySearchStatus === 'BEST_FOUND_UNPROVEN'
                              ? 'Known executable U; family optimum not proven'
                              : 'Family optimum unresolved'}</dd></div>
                          <div><dt>Policy health</dt><dd>{method.policyHealth.proper ? 'proper' : 'not proper'} · absorption {(method.policyHealth.terminalAbsorptionProbability * 100).toFixed(6)}% · reconciliation {method.policyHealth.costReconciled ? 'yes' : 'no'}</dd></div>
                        </>}
                        {method.repeatableRerollCertification && <>
                          <div><dt>Repeatable reroll proof</dt><dd>{method.repeatableRerollCertification.status} · p {(method.repeatableRerollCertification.successProbabilityPerApplication * 100).toFixed(6)}% · E[N] {method.repeatableRerollCertification.expectedApplications.toFixed(3)}</dd></div>
                          <div><dt>Transition quotient</dt><dd>{method.repeatableRerollCertification.transitionOutcomeCount.toLocaleString()} exact outcomes · {method.repeatableRerollCertification.missOutcomeCount.toLocaleString()} equivalent legal misses</dd></div>
                        </>}
                      </dl>
                      {method.whyNotSelectedExplanation && (
                        <div className={`method-explanation ${isWinner ? 'winner' : 'not-selected'}`}>
                          <strong>{isWinner ? 'Why selected:' : 'Policy note:'}</strong>
                          <span>{publicModifierText(method.whyNotSelectedExplanation, targetDescriptors, 'primary')}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          </OptimizerDisclosure>

          <section
            className="optimizer-card craft-guide crafting-constellation-top-level"
            aria-labelledby="crafting-constellation-title"
            data-testid="crafting-constellation-top-level"
          >
            <div className="craft-guide-heading-row">
              <div>
                <h2 id="crafting-constellation-title">Crafting Constellation</h2>
                <p className="muted">A certified player route from physical start through result decisions, recovery, and Finish.</p>
              </div>
              {result.recommended && (
                <div className="craft-export-toolbar">
                  <button
                    type="button"
                    className="secondary export-btn"
                    onClick={copyShareUrl}
                    title="Copy shareable configuration URL to clipboard"
                  >
                    {copiedAction === 'SHARE_URL' ? '✓ Copied Share Link!' : '🔗 Share Link'}
                  </button>
                  <button
                    type="button"
                    className="secondary export-btn"
                    onClick={() => copyShoppingList(result)}
                  >
                    {copiedAction === 'SHOPPING_LIST' ? '✓ Copied Shopping List!' : '📋 Copy Shopping List'}
                  </button>
                  <button
                    type="button"
                    className="secondary export-btn"
                    onClick={() => copyCraftGuide(result)}
                  >
                    {copiedAction === 'CRAFT_GUIDE' ? '✓ Copied Playbook!' : '📖 Copy Playbook'}
                  </button>
                  <button
                    type="button"
                    className="secondary export-btn"
                    onClick={() => exportSetupJson(result)}
                  >
                    {copiedAction === 'EXPORT_JSON' ? '✓ Exported JSON!' : '💾 Export Setup JSON'}
                  </button>
                  <button
                    type="button"
                    className="secondary export-btn"
                    onClick={() => copyBugReport(result)}
                    title="Copy anonymized bug report bundle"
                  >
                    {copiedAction === 'BUG_REPORT' ? '✓ Copied Bug Report!' : '🐛 Bug Report'}
                  </button>
                </div>
              )}
            </div>
            <GuidedCraftConstellation
              summary={result.guidedConstellation}
              onShowAdvancedEvidence={showAdvancedPolicyEvidence}
            />
                {/* Phase 3J removed the legacy chronological plan and repeated inline Decision details.
                <ol className="craft-plan" data-plan-status={result!.craftPlan.status}>
                  {result!.craftPlan.steps.map((step, stepIndex) => {
                    const recoveryIndex = step.recoveryTargetStepId === undefined
                      ? undefined
                      : result!.craftPlan.steps.findIndex((candidate) => candidate.id === step.recoveryTargetStepId);
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
                        <div className="step-title-row">
                          <h3>{preferredTargets.length > 0
                            ? `${publicModifierText(step.title, targetDescriptors, 'primary')}: ${preferredTargets.join(' + ')}`
                            : publicModifierText(step.title, targetDescriptors, 'primary')}</h3>
                          <div className="step-effort-badges">
                            {step.expectedPhysicalActions !== undefined && (
                              <span className="step-effort-pill actions">
                                ~{Math.round(step.expectedPhysicalActions)} actions
                              </span>
                            )}
                            {step.estimatedManualTimeMs !== undefined && (
                              <span className="step-effort-pill time">
                                ~{(step.estimatedManualTimeMs / 1000).toFixed(1)}s
                              </span>
                            )}
                          </div>
                        </div>
                        <p>{publicModifierText(step.instruction, targetDescriptors, 'primary')}</p>
                        {step.actionIds.length > 0 && (
                          <p className="craft-plan-actions"><strong>Selected actions:</strong>{' '}
                            {step.actionIds.map((actionId, actionIndex) =>
                              publicModifierText(
                                playerActionName(
                                  actionId,
                                  step.actionNames[actionIndex] ?? actionId,
                                  recommendedStart,
                                ),
                                targetDescriptors,
                                'primary',
                              )
                            ).join(', ')}
                          </p>
                        )}
                        {step.phase === 'ACQUIRE' && selectedSynthesis && (
                          <details className="selected-fracture-guide">
                            <summary>Self-fracture materials and recovery</summary>
                            <p>{publicModifierText(selectedSynthesis.explanation, targetDescriptors, 'primary')}</p>
                            <dl>
                              <dt>Expected Fracturing Orbs</dt>
                              <dd>{selectedSynthesis.expectedFracturingOrbs === undefined ? '—' : count(selectedSynthesis.expectedFracturingOrbs)}</dd>
                              <dt>Expected clean-base retries</dt>
                              <dd>{selectedSynthesis.expectedRestarts === undefined ? '—' : count(selectedSynthesis.expectedRestarts)}</dd>
                            </dl>
                            {selectedSynthesis.wrongFractureRecovery && (
                              <p className="fracture-recovery"><strong>Wrong fracture:</strong> {publicModifierText(selectedSynthesis.wrongFractureRecovery.note, targetDescriptors, 'primary')}</p>
                            )}
                          </details>
                        )}
                        {step.decisionDetails.map((decision) => (
                          <details
                            className="craft-plan-decision-details"
                            key={decision.id}
                            data-decision-id={decision.id}
                            data-evidence-status={decision.evidenceStatus}
                            data-policy-scope={decision.cohort.policyScope}
                            data-progress-kind={decision.cohort.progressKind}
                            data-rarity-cohort={decision.cohort.rarity}
                            data-focal-phase={decision.cohort.focalPhase}
                            data-policy-rule-indices={decision.cohort.policyRuleIndices.join(',')}
                          >
                            <summary>Decision details</summary>
                            <p>{publicModifierText(decision.summary, targetDescriptors, 'primary')}</p>
                            <ul>{decision.options.map((option) => {
                              const exampleRule = result!.policyExplanation[option.policyRuleIndices[0]];
                              return <li
                                key={option.actionId}
                                data-action-id={option.actionId}
                                data-policy-rule-indices={option.policyRuleIndices.join(',')}
                                data-example-policy-rule-index={option.policyRuleIndices[0]}
                              >
                                <strong>{publicModifierText(playerActionName(option.actionId, option.action, recommendedStart), targetDescriptors, 'primary')}</strong>
                                <span>{option.representedStateCount} represented states · {count(option.expectedVisits)} expected visits</span>
                                {exampleRule && <span className="craft-plan-decision-example">Example: {renderPolicyCondition(exampleRule, eligibleMods)}</span>}
                                {option.representedStateCount > 1 && <span className="muted">{option.representedStateCount - 1} more exact states are traceable in Advanced optimizer details.</span>}
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
                </ol> */}
            {result.craftPlan.optimalityNote && (
              <p className="craft-plan-optimality">
                {publicModifierText(result.craftPlan.optimalityNote, targetDescriptors, 'primary')}
              </p>
            )}
          </section>

          {result.recommended !== null && (
            <section className="optimizer-card compact-shopping-list" aria-labelledby="shopping-list-title">
              <div className="craft-guide-heading-row">
                <div>
                  <h2 id="shopping-list-title">Shopping list</h2>
                  <p className="muted">Expected consumption (model averages), not literal exact purchase quantities.</p>
                </div>
                <button type="button" className="secondary" onClick={() => copyShoppingList(result)}>
                  {copiedAction === 'SHOPPING_LIST' ? 'Copied' : 'Copy shopping list'}
                </button>
              </div>
              {Object.keys(result.expectedCurrencies).length > 0 ? (
                <ul className="compact-currency-list">
                  {Object.entries(result.expectedCurrencies).map(([currency, amount]) => (
                    <li key={currency}>
                      <strong>{amount === null ? '—' : count(amount)}</strong>{' '}
                      <span>{currency} — expected consumption</span>
                    </li>
                  ))}
                </ul>
              ) : <p>No expected currency consumption is certified for this result.</p>}
              <p><strong>Expected full-route cost:</strong> {chaos(result.fullRouteUsage.fullRouteCostChaos)}</p>
            </section>
          )}

          {resultSearchProofDisclosure}

          <OptimizerDisclosure
            title="Cost & usage details"
            description="Acquisition, downstream, merged action, currency, and reconciliation tables"
            badge={chaos(result.fullRouteUsage.fullRouteCostChaos)}
            open={costUsageOpen}
            onToggle={setCostUsageOpen}
            testId="cost-usage-disclosure"
            className="optimizer-result-disclosure"
          >
          {result.recommended !== null && <section className="optimizer-card expected-materials" aria-labelledby="expected-materials-title">
            <h2 id="expected-materials-title">Expected materials</h2>
            <p className="muted">Acquisition preparation and downstream crafting are additive, non-overlapping scopes. Full-route totals merge matching action and currency IDs exactly once.</p>
            <h3>Acquisition preparation</h3>
            {result.fullRouteUsage.acquisitionActions.length > 0 ? (
              <table data-usage-scope="ACQUISITION"><thead><tr><th>Material or action</th><th>Expected usage</th><th>Expected cost</th></tr></thead>
                <tbody>{result.fullRouteUsage.acquisitionActions.map((usage) => (
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
            ) : <p>No additive acquisition usage is available.</p>}
            <p><strong>Acquisition cost:</strong> {chaos(result.fullRouteUsage.acquisitionCostChaos)}</p>
            <h3>Downstream crafting</h3>
            {result.fullRouteUsage.downstreamActions.length > 0 ? (
              <table data-usage-scope="DOWNSTREAM"><thead><tr><th>Material or action</th><th>Expected usage</th><th>Expected cost</th></tr></thead>
                <tbody>{result.fullRouteUsage.downstreamActions.map((usage) => (
                  <tr
                    key={usage.actionId}
                    data-action-id={usage.actionId}
                    data-expected-count={usage.expectedCount}
                    data-expected-cost={usage.expectedCostChaos}
                  >
                    <td>{usage.actionName}</td><td>{count(usage.expectedCount)}</td><td>{chaos(usage.expectedCostChaos)}</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <p>No downstream actions are needed.</p>}
            <p><strong>Downstream cost:</strong> {chaos(result.fullRouteUsage.downstreamCostChaos)}</p>
            <details className="combined-action-summary">
              <summary>Full-route merged action totals</summary>
              <table data-usage-scope="FULL_ROUTE"><thead><tr><th>Material or action</th><th>Expected usage</th><th>Expected cost</th></tr></thead>
                <tbody>{result.fullRouteUsage.combinedActions.map((usage) => (
                  <tr key={usage.actionId} data-action-id={usage.actionId} data-expected-count={usage.expectedCount} data-expected-cost={usage.expectedCostChaos}>
                    <td>{usage.actionName}</td><td>{count(usage.expectedCount)}</td><td>{chaos(usage.expectedCostChaos)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </details>
            <p className="full-route-reconciliation" data-reconciliation-difference={result.fullRouteUsage.reconciliationDifferenceChaos}>
              <strong>Full-route cost:</strong> {chaos(result.fullRouteUsage.fullRouteCostChaos)} · reconciliation difference {chaos(result.fullRouteUsage.reconciliationDifferenceChaos)}
            </p>
            {Object.keys(result.expectedCurrencies).length > 0 && (
              <details className="currency-summary">
                <summary>Full-route expected currency totals (shopping list)</summary>
                <ul className="currency-usage">
                  {Object.entries(result.expectedCurrencies).map(([currency, amount]) => (
                    <li key={currency}><span>{currency}</span><strong>{amount === null ? '—' : count(amount)}</strong></li>
                  ))}
                </ul>
              </details>
            )}
          </section>}
          </OptimizerDisclosure>

          <OptimizerDisclosure
            title="Research diagnostics"
            description="Raw proof, policy audits, synthesis portfolios, exact rules, confidence, and warnings"
            badge={result.warningDetails.length > 0 ? `${result.warningDetails.length} warnings` : 'Available'}
            open={researchDiagnosticsOpen}
            onToggle={setResearchDiagnosticsOpen}
            testId="research-diagnostics-disclosure"
            className="optimizer-result-disclosure"
          >
          <OptimizerDisclosure
            key={`${result.policyFlow?.sourcePolicyFingerprint ?? 'no-policy'}|${result.guidedConstellation.fingerprint}|${result.internalConsistency.selectedBundleId ?? 'no-bundle'}`}
            title="Technical policy graph"
            description="Exact aggregated selected-policy states, transitions, probabilities, occupancy, and layout tools."
            badge={technicalPolicyGraph ? `${technicalPolicyGraph.nodes.length} nodes` : 'Unavailable'}
            open={technicalPolicyGraphOpen}
            onToggle={setTechnicalPolicyGraphOpen}
            testId="technical-policy-graph-disclosure"
            className="technical-policy-graph-disclosure"
            keepMountedAfterOpen
          >
            {technicalPolicyGraph && (
              <section
                className="optimizer-card constellation-card technical-policy-graph"
                aria-label="Technical policy graph"
                data-testid="technical-policy-graph"
              >
                <MarkovConstellation
                  title="Technical policy graph"
                  graph={technicalPolicyGraph}
                  selectedRouteName={publicSelectedRouteName}
                />
              </section>
            )}
          </OptimizerDisclosure>
          <div className="optimizer-card advanced-optimizer-details">
            <div className="advanced-details-content">
              <section className="advanced-section raw-proof-details">
                <h2>Recommendation proof</h2>
                <dl>
                  <dt>Selected route</dt><dd>{result.presentation.selectedRouteName ?? 'none'}</dd>
                  <dt>Raw recommendation status</dt><dd>{result.recommendationStatus}</dd>
                  <dt>Raw proof level</dt><dd>{result.proof.proofLevel}</dd>
                  <dt>Global optimality</dt><dd>{result.proof.globalOptimality}</dd>
                  <dt>Acquisition selection safe</dt><dd>{result.acquisition.selectionSafe ? 'yes' : 'no'}</dd>
                  <dt>Downstream policy status</dt><dd>{result.policyRefinement.status}</dd>
                  <dt>Downstream refinement stop</dt><dd>{result.policyRefinement.stopReason}</dd>
                  {result.policyRefinement.firstCertifiedDownstreamU !== undefined && <><dt>First certified downstream policy U</dt><dd>{chaos(result.policyRefinement.firstCertifiedDownstreamU)}</dd></>}
                  {result.policyRefinement.finalDownstreamU !== undefined && <><dt>Final downstream policy U</dt><dd>{chaos(result.policyRefinement.finalDownstreamU)}</dd></>}
                  {result.policyRefinement.firstCertifiedFullRouteU !== undefined && <><dt>First certified full-route U</dt><dd>{chaos(result.policyRefinement.firstCertifiedFullRouteU)}</dd></>}
                  {result.policyRefinement.finalFullRouteU !== undefined && <><dt>Final returned full-route U</dt><dd>{chaos(result.policyRefinement.finalFullRouteU)}</dd></>}
                  {result.policyRefinement.improvementFraction !== undefined && <><dt>Full-route refinement improvement</dt><dd>{chaos(result.policyRefinement.improvementChaos)} ({(result.policyRefinement.improvementFraction * 100).toFixed(2)}%)</dd></>}
                  {result.policyRefinement.unresolvedCompetitiveLowerBoundChaos !== undefined && <><dt>Unresolved downstream competitive L</dt><dd>{chaos(result.policyRefinement.unresolvedCompetitiveLowerBoundChaos)}</dd></>}
                  {result.acquisition.resolvedIncumbentUpperBoundChaos !== undefined && <><dt>Resolved full-route incumbent U</dt><dd>{chaos(result.acquisition.resolvedIncumbentUpperBoundChaos)}</dd></>}
                  {result.acquisition.bestUnresolvedLowerBoundChaos !== undefined && <><dt>Best unresolved competitive full-route L</dt><dd>{chaos(result.acquisition.bestUnresolvedLowerBoundChaos)}</dd></>}
                  {result.acquisition.potentialGapChaos !== undefined && <><dt>Potential acquisition gap</dt><dd>{chaos(result.acquisition.potentialGapChaos)}</dd></>}
                  <dt>Selected acquisition method</dt><dd>{selectedMethod?.label ?? 'none'}</dd>
                  <dt>Worker round trip</dt><dd>{runtimeMs === null ? 'not recorded' : `${runtimeMs.toFixed(0)} ms`}</dd>
                </dl>
                {selectedMethod && <p className="muted">{selectedMethod.provenance}</p>}
              </section>

              <section
                className="advanced-section advanced-policy-evidence"
                id="advanced-policy-evidence"
                aria-labelledby="advanced-policy-evidence-title"
              >
                <h2 id="advanced-policy-evidence-title">Advanced policy evidence</h2>
                <p className="muted">
                  Guided Constellation evidence plus the retained exact modifier identities, source states, policy-rule indices, represented counts, expected visits, grouping, and recovery evidence for every certified Phase 3J player rule.
                </p>
                <dl>
                  <dt>Guided Constellation</dt><dd>{result.guidedConstellation.status}</dd>
                  <dt>Guided fingerprint</dt><dd><code>{result.guidedConstellation.fingerprint}</code></dd>
                  <dt>Guided nodes / exact edges</dt><dd>{result.guidedConstellation.nodes.length} / {result.guidedConstellation.edges.length}</dd>
                  <dt>Guided player-rule coverage</dt><dd>{result.guidedConstellation.representedPlayerRuleIds.length} / {result.craftPlan.playerRules.length}</dd>
                  <dt>Guided source-state coverage</dt><dd>{result.guidedConstellation.representedSourceStateKeys.length}</dd>
                  <dt>Guided PolicyFlow edge coverage</dt><dd>{result.guidedConstellation.representedPolicyEdgeIds.length} / {result.policyFlow?.edges.length ?? 0}</dd>
                  <dt>Player-rule certification</dt><dd>{result.craftPlan.playerRuleCertification.status}</dd>
                  <dt>Covered source policy rules</dt><dd>{result.craftPlan.playerRuleCertification.coveredPolicyRuleIndices.length} / {result.craftPlan.playerRuleCertification.sourcePolicyRuleIndices.length}</dd>
                  <dt>Represented states</dt><dd>{result.craftPlan.playerRuleCertification.representedStateCount}</dd>
                  <dt>Expected visits reconciled</dt><dd>{count(result.craftPlan.playerRuleCertification.expectedVisits)}</dd>
                  <dt>Minimal exact-name exceptions</dt><dd>{result.craftPlan.playerRuleCertification.minimalExceptionCount}</dd>
                </dl>
                {result.craftPlan.playerRuleCertification.reasons.length > 0 && (
                  <ul>{result.craftPlan.playerRuleCertification.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                )}
                <div className="advanced-player-rule-list">
                  {result.craftPlan.playerRules.map((rule) => (
                    <article
                      id={`advanced-policy-${rule.id}`}
                      className="advanced-player-rule"
                      key={rule.id}
                      tabIndex={-1}
                      data-player-rule-id={rule.id}
                      data-action-id={rule.actionId}
                      data-policy-rule-indices={rule.policyRuleIndices.join(',')}
                    >
                      <h3>{rule.id}: {playerActionName(rule.actionId, rule.action, recommendedStart)}</h3>
                      <dl>
                        <dt>Stage / priority</dt><dd>{rule.stage} / {rule.priority}</dd>
                        <dt>Scope / progress</dt><dd>{rule.when.policyScope} / {rule.when.progressKind}</dd>
                        <dt>Rarity / shape</dt><dd>{rule.when.rarity} {rule.when.prefixCount}P/{rule.when.suffixCount}S</dd>
                        <dt>Policy rule indices</dt><dd>{rule.policyRuleIndices.join(', ')}</dd>
                        <dt>Represented states / expected visits</dt><dd>{rule.representedStateCount} / {count(rule.expectedVisits)}</dd>
                        <dt>Recovery mapping</dt><dd>{rule.then.recoveryKind} · {rule.then.summary}</dd>
                        <dt>Source state identities</dt><dd><code>{rule.sourceStateKeys.join('\n')}</code></dd>
                      </dl>
                      <details>
                        <summary>Exact modifier-role and junk evidence ({rule.sourceEvidence.length} source rules)</summary>
                        {rule.sourceEvidence.map((source) => (
                          <section key={source.policyRuleIndex} data-policy-rule-index={source.policyRuleIndex}>
                            <h4>Policy rule {source.policyRuleIndex}</h4>
                            <p>{source.representedStateCount} represented states · {count(source.expectedVisits)} expected visits</p>
                            <ul>{source.exactAffixes.map((affix, index) => (
                              <li key={`${affix.side}-${affix.modId}-${index}`}>
                                <code>{affix.modId}</code> · {affix.side} · T{affix.tier} · {affix.role}
                                {affix.junkKind ? ` · ${affix.junkKind}` : ''}
                                {affix.isFractured ? ' · fractured' : ''}
                              </li>
                            ))}</ul>
                          </section>
                        ))}
                      </details>
                    </article>
                  ))}
                </div>
                <details className="advanced-decision-cohorts">
                  <summary>Phase 3F comparable Decision cohorts ({result.craftPlan.detailedDecisionCount})</summary>
                  {result.craftPlan.steps.flatMap((step) => step.decisionDetails).map((decision) => (
                    <article key={decision.id} data-decision-id={decision.id}>
                      <h3>{decision.summary}</h3>
                      <p>{decision.cohort.policyScope} / {decision.cohort.progressKind} / {decision.cohort.rarity}</p>
                      <ul>{decision.options.map((option) => {
                        const exampleRule = result.policyExplanation[option.policyRuleIndices[0]];
                        return <li key={option.actionId} data-action-id={option.actionId}>
                          <strong>{option.action}</strong>: {option.representedStateCount} represented states · {count(option.expectedVisits)} expected visits · policy rules {option.policyRuleIndices.join(', ')}
                          {exampleRule ? ` · Example: ${renderPolicyCondition(exampleRule, eligibleMods)}` : ''}
                        </li>;
                      })}</ul>
                    </article>
                  ))}
                </details>
              </section>

              <section className="advanced-section craft-plan-action-audit" data-plan-status={result.craftPlan.status}>
                <h2>Craft-plan action audit</h2>
                <dl>
                  <dt>Plan certification</dt><dd>{result.craftPlan.status}</dd>
                  <dt>Selected physical mechanics</dt><dd>{result.craftPlan.selectedActionIds.join(', ') || 'none'}</dd>
                  <dt>Represented physical mechanics</dt><dd>{result.craftPlan.representedActionIds.join(', ') || 'none'}</dd>
                  <dt>Uncovered physical mechanics</dt><dd>{result.craftPlan.uncoveredActionIds.join(', ') || 'none'}</dd>
                  <dt>Invented mechanics</dt><dd>{result.craftPlan.inventedActionIds.join(', ') || 'none'}</dd>
                  <dt>Excluded accounting entries</dt><dd>{result.craftPlan.excludedAccountingActionIds.join(', ') || 'none'}</dd>
                  <dt>Excluded virtual/service actions</dt><dd>{result.craftPlan.excludedVirtualActionIds.join(', ') || 'none'}</dd>
                  <dt>Unknown action IDs</dt><dd>{result.craftPlan.unknownActionIds.join(', ') || 'none'}</dd>
                </dl>
                {result.craftPlan.withheldReason && <p>{result.craftPlan.withheldReason}</p>}
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

              <section className="advanced-section proof-debt-panel" data-testid="proof-debt-panel">
                <h2>Why not proven?</h2>
                <p className="muted">
                  Full-route lower/upper bounds and the most recent proof work. Lower bounds combine
                  the partial graph with the independently admissible relaxed target-progress bound.
                </p>
                <table>
                  <thead><tr><th>Candidate</th><th>L</th><th>U/current</th><th>Proof debt</th><th>Last work</th></tr></thead>
                  <tbody>{result.acquisition.portfolioProof.candidateEvidence.map((candidate) => (
                    <tr
                      key={candidate.candidateId}
                      data-proof-candidate={candidate.candidateId}
                      data-proof-status={candidate.status}
                      data-relaxed-lower-bound={candidate.downstreamLowerBoundEvidence.relaxedTargetProgressLowerBoundChaos}
                    >
                      <td>{publicModifierText(candidate.label, targetDescriptors)}</td>
                      <td>{chaos(candidate.fullRouteLowerBoundChaos)}</td>
                      <td>{chaos(candidate.fullRouteUpperBoundChaos)}</td>
                      <td>{candidate.status === 'DOMINATED'
                        ? 'Bound excludes it'
                        : candidate.status === 'SELECTED'
                          ? 'Selected executable route'
                          : candidate.proofDebtChaos === undefined
                            ? 'No incumbent yet'
                            : `${candidate.proofDebtChaos.toFixed(1)}c · can still beat best`}</td>
                      <td>
                        {candidate.lastWorkStage?.replace(/_/g, ' ').toLowerCase() ?? 'relaxed bound'}
                        {candidate.consecutiveNoProofChange > 0
                          ? ` · ${candidate.consecutiveNoProofChange} no-change`
                          : ''}
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                <details>
                  <summary>Bound sources and technical identities</summary>
                  {result.acquisition.portfolioProof.candidateEvidence.map((candidate) => (
                    <dl key={`${candidate.candidateId}-bound-technical`}>
                      <dt>Candidate ID</dt><dd>{candidate.candidateId}</dd>
                      <dt>Player route</dt><dd>{publicModifierText(candidate.label, targetDescriptors)}</dd>
                      <dt>Partial / relaxed / combined downstream L</dt>
                      <dd>
                        {chaos(candidate.downstreamLowerBoundEvidence.partialGraphLowerBoundChaos)} /{' '}
                        {chaos(candidate.downstreamLowerBoundEvidence.relaxedTargetProgressLowerBoundChaos)} /{' '}
                        {chaos(candidate.downstreamLowerBoundEvidence.combinedLowerBoundChaos)}
                      </dd>
                      <dt>Relaxed-bound identity</dt>
                      <dd>{candidate.downstreamLowerBoundEvidence.relaxedTargetProgress.cache.identityHash}</dd>
                      <dt>Last scheduler reason</dt><dd>{candidate.proofReason}</dd>
                      {candidate.deprioritizedReason && <><dt>Deprioritization</dt><dd>{candidate.deprioritizedReason}</dd></>}
                    </dl>
                  ))}
                </details>
                {result.acquisition.portfolioProof.tranches.length > 0 && (
                  <details>
                    <summary>Proof-work tranche telemetry</summary>
                    <table>
                      <thead><tr><th>Candidate / stage</th><th>States</th><th>Transitions gen/reused</th><th>Timing</th><th>L → L</th><th>Outcome</th></tr></thead>
                      <tbody>{result.acquisition.portfolioProof.tranches.map((tranche, index) => (
                        <tr key={`${tranche.candidateId}-${tranche.stage}-${index}`}>
                          <td>{publicModifierText(tranche.label, targetDescriptors)} · {tranche.stage}</td>
                          <td>{tranche.statesExpandedBefore} → {tranche.statesExpandedAfter}</td>
                          <td>
                            {tranche.transitionDistributionsGeneratedBefore} → {tranche.transitionDistributionsGeneratedAfter} /{' '}
                            {tranche.transitionDistributionsReusedBefore} → {tranche.transitionDistributionsReusedAfter}
                          </td>
                          <td>{tranche.wallTimeMs}ms · transitions {tranche.transitionGenerationMs}ms · Bellman {tranche.bellmanMs}ms · occupancy {tranche.occupancyMs}ms</td>
                          <td>{chaos(tranche.lowerBoundBeforeChaos)} → {chaos(tranche.lowerBoundAfterChaos)}</td>
                          <td>{tranche.outcome}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </details>
                )}
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
                      data-policy-scope={rule.context.policyScope}
                      data-progress-kind={rule.context.progressKind}
                      data-rarity={rule.context.rarity}
                      data-source-state-keys={JSON.stringify(rule.sourceStateKeys)}
                    >
                      <div><span>If</span><strong>{renderedCondition}</strong></div>
                      <span className="craft-rule-arrow" aria-hidden="true">→</span>
                      <div><span>Then</span><strong>{playerActionName(rule.actionId, rule.action, recommendedStart)}</strong></div>
                      <details>
                        <summary>Policy context</summary>
                        <p>{rule.representedStateCount} represented states · {count(rule.expectedVisits)} expected visits</p>
                        <p className="muted">Optimizer action: {rule.action}</p>
                        <p className="muted">Example engine state: {rule.exampleState}</p>
                        <details>
                          <summary>Source state identities ({rule.sourceStateKeys.length})</summary>
                          <code>{rule.sourceStateKeys.join('\n')}</code>
                        </details>
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
                    <dt>Total portfolio states expanded this request</dt><dd>{result.search.workScopes.portfolioTotalStatesExpanded.toLocaleString()}</dd>
                    <dt>Total retained/reused portfolio states</dt><dd>{result.search.workScopes.portfolioRetainedStates.toLocaleString()}</dd>
                    <dt>Selected downstream policy graph states</dt><dd>{result.search.workScopes.selectedPolicyGraphStates.toLocaleString()}</dd>
                    <dt>Selected acquisition synthesis states</dt><dd>{result.search.workScopes.acquisitionSynthesisStates.toLocaleString()}</dd>
                    <dt>Independent method-family graph states</dt><dd>{result.search.workScopes.methodFamilyStates.toLocaleString()}</dd>
                    <dt>Proof-bound states</dt><dd>{result.search.workScopes.proofBoundStates.toLocaleString()}</dd>
                    <dt>Expansion rounds</dt><dd>{result.search.expansionRounds}/{result.search.maxExpansionRounds}</dd>
                    <dt>Search intent</dt><dd>{result.search.intent}</dd>
                    <dt>Engine elapsed</dt><dd>{result.search.elapsedMs.toLocaleString()} ms</dd>
                    <dt>Total staged engine elapsed</dt><dd>{result.search.totalElapsedMs.toLocaleString()} ms</dd>
                    <dt>Engine / host deadline</dt><dd>{result.search.engineDeadlineMs} / {result.search.hostGuardDeadlineMs} ms</dd>
                    <dt>First completed search round</dt><dd>{result.search.timeToFirstCompletedRoundMs === undefined ? 'not reached' : `${result.search.timeToFirstCompletedRoundMs} ms`}</dd>
                    <dt>First certified downstream policy</dt><dd>{result.search.timeToFirstCertifiedPolicyMs === undefined ? 'not reached' : `${result.search.timeToFirstCertifiedPolicyMs} ms`}</dd>
                    <dt>First useful executable full route</dt><dd>{result.search.timeToFirstUsefulExecutableRecommendationMs === undefined ? 'not reached' : `${result.search.timeToFirstUsefulExecutableRecommendationMs} ms`}</dd>
                    <dt>First acquisition-safe recommendation</dt><dd>{result.search.timeToFirstAcquisitionSafeRecommendationMs === undefined ? 'not reached' : `${result.search.timeToFirstAcquisitionSafeRecommendationMs} ms`}</dd>
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
                    <dt>Harvest lifecycle</dt><dd>{result.harvestComparison?.status ?? 'NOT_ELIGIBLE'}</dd>
                    <dt>Eligible/enabled Harvest definitions</dt><dd>{result.search.harvestActionScope.enabledCrafts.map((craft) => craft.actionName).join(', ') || 'none'}</dd>
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
                  {displayedProof && (
                    <details data-testid="raw-proof-evidence">
                      <summary>Raw proof evidence</summary>
                      <dl>
                        <dt>Selected-policy status enum</dt><dd>{displayedProof.rawSelectedPolicyStatus}</dd>
                        <dt>Global-optimality enum</dt><dd>{displayedProof.rawGlobalOptimality}</dd>
                        <dt>Objective proof enum</dt><dd>{displayedProof.rawObjectiveProofStatus ?? 'unavailable'}</dd>
                      </dl>
                    </details>
                  )}
                  <details data-testid="raw-search-counter-evidence">
                    <summary>Raw search counters</summary>
                    <code>{JSON.stringify({
                      cumulativeExpansionWork: result.search.cumulativeExpansionWork,
                      workScopes: result.search.workScopes,
                      requestBudget: result.search.requestBudget,
                    }, null, 2)}</code>
                  </details>
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
          </div>
          </OptimizerDisclosure>
        </div>
      )}

      <footer className="release-footer" role="contentinfo">
        <p>
          <strong>Cluster Jewel Craft Optimizer</strong> — Browser-Verified Release Candidate {APP_RELEASE_VERSION}
        </p>
        <p>
          Powered by Markov Decision Processes & Bellman Dynamic Programming.
          Trade prices from bundled snapshot (league: <em>{league}</em>{marketPricing?.marketContext.snapshotAt ? `, snapshot date: ${marketPricing.marketContext.snapshotAt}` : ''}).
        </p>
      </footer>

      <OnboardingModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />
    </main>
  );
}

export default CraftOptimizer;
