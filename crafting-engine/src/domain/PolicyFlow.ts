import {
  getAllAffixes,
  getPhysicalStateSignature,
  type ItemState,
} from './ItemState.ts';
import {
  getAllTargetModRequirements,
  matchesModRequirement,
  type TargetDefinition,
} from './TargetDefinition.ts';
import { getCanonicalStateKey } from '../rules/actionDiscovery.ts';
import type { GenericSearchResult } from '../solver/genericSearch.ts';

export const SELECTED_POLICY_FLOW_VERSION = 'SELECTED_POLICY_FLOW_V1' as const;
export const POLICY_FLOW_RECONCILIATION_TOLERANCE = 1e-7;

export type PolicyFlowOutcomeKind =
  | 'PROGRESS'
  | 'SUCCESS'
  | 'RECOVERY'
  | 'REACQUIRE'
  | 'REPEAT'
  | 'OTHER';

export type PolicyFlowScope = 'ACQUISITION' | 'DOWNSTREAM';

export interface PolicyFlowNode {
  id: string;
  macroKey: string;
  label: string;
  stateSummary: string;
  scope: PolicyFlowScope;
  selectedActionId?: string;
  selectedActionName?: string;
  rarity?: ItemState['rarity'];
  matchedTargetModIds: string[];
  fracturedTargetModIds: string[];
  prefixCount?: number;
  suffixCount?: number;
  targetPrefixCount?: number;
  targetSuffixCount?: number;
  exactStateCount: number;
  expectedVisits: number;
  occupancyShare: number;
  terminal: boolean;
  start: boolean;
  recoveryLike: boolean;
  acquisitionMenu: boolean;
  representativeState?: string;
  representativeStateKey?: string;
  representativePhysicalStateSignature?: string;
}

export interface PolicyFlowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  actionId: string;
  actionName: string;
  expectedFlow: number;
  conditionalProbability: number;
  exactTransitionCount: number;
  outcomeKind: PolicyFlowOutcomeKind;
  nextSelectedActionId?: string;
  nextSelectedActionName?: string;
  representativeOutcome?: string;
  representativeState?: string;
  evidenceKind: 'EXACT_SELECTED_POLICY_TRANSITION' | 'CERTIFIED_SCOPE_HANDOFF';
}

export interface PolicyFlowAggregationEvidence {
  exactStateCount: number;
  exactTransitionCount: number;
  macroNodeCount: number;
  macroEdgeCount: number;
  exactStatesCollapsedAtScopeHandoff: number;
  exactTransitionsRepresented: number;
  expectedFlowRetained: number;
  expectedFlowCollapsedIntoRareOutcomes: number;
  visibleFlowFraction: number;
  exactFlowFingerprint: string;
  differentialSamples: PolicyFlowDifferentialSample[];
  aggregationMs: number;
}

export interface PolicyFlowDifferentialSample {
  sourceStateKey: string;
  targetStateKey: string;
  sourceNodeId: string;
  targetNodeId: string;
  actionId: string;
  occupancy: number;
  exactProbability: number;
  exactExpectedFlow: number;
}

export interface PolicyFlowReconciliation {
  tolerance: number;
  maximumOutgoingFlowDifference: number;
  maximumConditionalProbabilityDifference: number;
  representedTerminalAbsorption: number;
  selectedPolicyTerminalAbsorption: number;
  terminalAbsorptionDifference: number;
  outgoingFlowConserved: boolean;
  conditionalProbabilitiesConserved: boolean;
  terminalAbsorptionReconciled: boolean;
  certified: boolean;
}

export interface PolicyFlowTopology {
  nodeCount: number;
  edgeCount: number;
  stronglyConnectedComponentCount: number;
  cyclicComponentCount: number;
  branchNodeCount: number;
  recoveryEdgeCount: number;
  repeatEdgeCount: number;
  selectedActionHistogram: Record<string, number>;
  fingerprint: string;
}

export interface PolicyFlowSummary {
  version: typeof SELECTED_POLICY_FLOW_VERSION;
  status: 'CERTIFIED' | 'UNCERTIFIED';
  sourceBundleId: string;
  sourcePolicyFingerprint?: string;
  nodes: PolicyFlowNode[];
  edges: PolicyFlowEdge[];
  startNodeIds: string[];
  terminalNodeIds: string[];
  recoveryEdges: string[];
  aggregation: PolicyFlowAggregationEvidence;
  reconciliation: PolicyFlowReconciliation;
  topology: PolicyFlowTopology;
}

export interface PolicyFlowComponent {
  version: 'SELECTED_POLICY_FLOW_COMPONENT_V1';
  scope: PolicyFlowScope;
  status: 'CERTIFIED' | 'UNCERTIFIED';
  nodes: PolicyFlowNode[];
  edges: PolicyFlowEdge[];
  startNodeIds: string[];
  terminalNodeIds: string[];
  aggregation: PolicyFlowAggregationEvidence;
  reconciliation: PolicyFlowReconciliation;
  selectedPolicyTerminalAbsorption: number;
}

interface MutableNode {
  node: PolicyFlowNode;
  exactStateKeys: Set<string>;
}

interface MutableEdge {
  edge: PolicyFlowEdge;
}

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now();
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function requirementIdentity(
  requirement: ReturnType<typeof getAllTargetModRequirements>[number],
  index: number,
): string {
  return requirement.modId ?? requirement.name ?? requirement.modGroup ??
    `target-requirement-${index + 1}`;
}

function stateEvidence(state: ItemState, target: TargetDefinition): {
  matchedTargetModIds: string[];
  fracturedTargetModIds: string[];
  targetPrefixCount: number;
  targetSuffixCount: number;
} {
  const requirements = getAllTargetModRequirements(target);
  const matchingRequirementIds = (mod: ItemState['prefixes'][number]): string[] =>
    requirements.flatMap((requirement, index) =>
      matchesModRequirement(mod, requirement)
        ? [requirementIdentity(requirement, index)]
        : []
    );
  const matchedTargetModIds = [...new Set(
    getAllAffixes(state).flatMap(matchingRequirementIds),
  )].sort();
  const fracturedTargetModIds = [...new Set(
    getAllAffixes(state)
      .filter((mod) => mod.isFractured)
      .flatMap(matchingRequirementIds),
  )].sort();
  return {
    matchedTargetModIds,
    fracturedTargetModIds,
    targetPrefixCount: state.prefixes.filter((mod) => matchingRequirementIds(mod).length > 0).length,
    targetSuffixCount: state.suffixes.filter((mod) => matchingRequirementIds(mod).length > 0).length,
  };
}

function compactActionName(actionId: string | undefined, actionName: string | undefined): string {
  const known: Record<string, string> = {
    transmutation_orb: 'Transmute',
    alteration_orb: 'Alter',
    augmentation_orb: 'Augment',
    regal_orb: 'Regal',
    scouring_orb: 'Scour',
    chaos_orb: 'Chaos',
    annulment_orb: 'Annul',
    exalted_orb: 'Exalt',
    fracturing_orb: 'Fracture',
    restart_reacquire: 'Reacquire',
  };
  if (actionId && known[actionId]) return known[actionId];
  if (actionId?.startsWith('harvest_reforge_')) {
    return actionName?.replace(/^Harvest\s+/i, 'Harvest ') ?? 'Harvest';
  }
  if (actionId?.startsWith('acquire_')) return 'Acquire';
  return actionName?.replace(/\s+Orb$/i, '') ?? 'Policy state';
}

function describeState(state: ItemState, target: TargetDefinition): string {
  if (state.flags?.acquisitionMenu) return 'Acquisition menu for the selected starting family';
  const requirements = getAllTargetModRequirements(target);
  const describeMod = (mod: ItemState['prefixes'][number]) => {
    const targetMatch = requirements.some((requirement) => matchesModRequirement(mod, requirement));
    return `${mod.isFractured ? '[fractured] ' : ''}${mod.name}` +
      (targetMatch ? ' [target]' : '');
  };
  const prefixes = state.prefixes.map(describeMod).join('; ') || 'none';
  const suffixes = state.suffixes.map(describeMod).join('; ') || 'none';
  return `${state.rarity.toUpperCase()} — prefixes: ${prefixes} — suffixes: ${suffixes}`;
}

function stateSummary(
  state: ItemState,
  evidence: ReturnType<typeof stateEvidence>,
  target: TargetDefinition,
): string {
  if (state.flags?.acquisitionMenu) return 'Selected acquisition decision';
  const targetCount = getAllTargetModRequirements(target).length;
  const affixCount = state.prefixes.length + state.suffixes.length;
  const fractured = evidence.fracturedTargetModIds.length;
  return `${state.rarity[0].toUpperCase()}${state.rarity.slice(1)} · ` +
    `${evidence.matchedTargetModIds.length}/${targetCount} targets · ${affixCount} affixes` +
    (fractured > 0 ? ` · ${fractured} fractured` : '');
}

function macroKeyForState(
  state: ItemState,
  target: TargetDefinition,
  selectedActionId: string | undefined,
  terminal: boolean,
): string {
  if (terminal) return 'terminal:goal';
  const evidence = stateEvidence(state, target);
  return JSON.stringify({
    selectedActionId: selectedActionId ?? 'UNRESOLVED',
    rarity: state.rarity,
    matchedTargetModIds: evidence.matchedTargetModIds,
    fracturedTargetModIds: evidence.fracturedTargetModIds,
    prefixCount: state.prefixes.length,
    suffixCount: state.suffixes.length,
    targetPrefixCount: evidence.targetPrefixCount,
    targetSuffixCount: evidence.targetSuffixCount,
    influenced: state.flags?.influenced === true,
    synthesised: state.flags?.synthesised === true,
    acquisitionMenu: state.flags?.acquisitionMenu === true,
    methodFamilyActionEvidence: state.flags?.methodFamilyActionEvidence ?? [],
  });
}

function outcomeKind(
  sourceNodeId: string,
  targetNodeId: string,
  actionId: string,
  nextActionId: string | undefined,
  terminal: boolean,
): PolicyFlowOutcomeKind {
  if (terminal) return 'SUCCESS';
  if (actionId === 'restart_reacquire' || nextActionId === 'restart_reacquire') return 'REACQUIRE';
  if (actionId === 'scouring_orb' || nextActionId === 'scouring_orb') return 'RECOVERY';
  if (sourceNodeId === targetNodeId || actionId === nextActionId) return 'REPEAT';
  return 'PROGRESS';
}

function reconcileFlow(
  nodes: readonly PolicyFlowNode[],
  edges: readonly PolicyFlowEdge[],
  selectedPolicyTerminalAbsorption: number,
  tolerance = POLICY_FLOW_RECONCILIATION_TOLERANCE,
): PolicyFlowReconciliation {
  let maximumOutgoingFlowDifference = 0;
  let maximumConditionalProbabilityDifference = 0;
  for (const node of nodes) {
    if (node.terminal) continue;
    const outgoing = edges.filter((edge) => edge.sourceNodeId === node.id);
    if (outgoing.length === 0) {
      maximumOutgoingFlowDifference = Math.max(
        maximumOutgoingFlowDifference,
        node.expectedVisits,
      );
      maximumConditionalProbabilityDifference = Math.max(
        maximumConditionalProbabilityDifference,
        node.expectedVisits > tolerance ? 1 : 0,
      );
      continue;
    }
    const outgoingFlow = outgoing.reduce((sum, edge) => sum + edge.expectedFlow, 0);
    const probabilitySum = outgoing.reduce(
      (sum, edge) => sum + edge.conditionalProbability,
      0,
    );
    maximumOutgoingFlowDifference = Math.max(
      maximumOutgoingFlowDifference,
      Math.abs(outgoingFlow - node.expectedVisits),
    );
    maximumConditionalProbabilityDifference = Math.max(
      maximumConditionalProbabilityDifference,
      Math.abs(probabilitySum - 1),
    );
  }
  const terminalIds = new Set(nodes.filter((node) => node.terminal).map((node) => node.id));
  const representedTerminalAbsorption = edges
    .filter((edge) => terminalIds.has(edge.targetNodeId))
    .reduce((sum, edge) => sum + edge.expectedFlow, 0);
  const terminalAbsorptionDifference = Math.abs(
    representedTerminalAbsorption - selectedPolicyTerminalAbsorption,
  );
  const outgoingScale = Math.max(1, ...nodes.map((node) => node.expectedVisits));
  const outgoingFlowConserved = maximumOutgoingFlowDifference <= tolerance * outgoingScale;
  const conditionalProbabilitiesConserved = maximumConditionalProbabilityDifference <= tolerance;
  const terminalAbsorptionReconciled = terminalAbsorptionDifference <= tolerance;
  return {
    tolerance,
    maximumOutgoingFlowDifference,
    maximumConditionalProbabilityDifference,
    representedTerminalAbsorption,
    selectedPolicyTerminalAbsorption,
    terminalAbsorptionDifference,
    outgoingFlowConserved,
    conditionalProbabilitiesConserved,
    terminalAbsorptionReconciled,
    certified: outgoingFlowConserved && conditionalProbabilitiesConserved &&
      terminalAbsorptionReconciled,
  };
}

function tarjanComponents(nodes: readonly PolicyFlowNode[], edges: readonly PolicyFlowEdge[]): string[][] {
  const adjacency = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
  for (const targets of adjacency.values()) targets.sort();
  let index = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];
  const visit = (nodeId: string): void => {
    indices.set(nodeId, index);
    lowLinks.set(nodeId, index);
    index += 1;
    stack.push(nodeId);
    onStack.add(nodeId);
    for (const targetId of adjacency.get(nodeId) ?? []) {
      if (!indices.has(targetId)) {
        visit(targetId);
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId)!, lowLinks.get(targetId)!));
      } else if (onStack.has(targetId)) {
        lowLinks.set(nodeId, Math.min(lowLinks.get(nodeId)!, indices.get(targetId)!));
      }
    }
    if (lowLinks.get(nodeId) !== indices.get(nodeId)) return;
    const component: string[] = [];
    while (stack.length > 0) {
      const member = stack.pop()!;
      onStack.delete(member);
      component.push(member);
      if (member === nodeId) break;
    }
    components.push(component.sort());
  };
  for (const node of [...nodes].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!indices.has(node.id)) visit(node.id);
  }
  return components;
}

function topologyFor(nodes: readonly PolicyFlowNode[], edges: readonly PolicyFlowEdge[]): PolicyFlowTopology {
  const components = tarjanComponents(nodes, edges);
  const selfLoops = new Set(edges.filter((edge) => edge.sourceNodeId === edge.targetNodeId)
    .map((edge) => edge.sourceNodeId));
  const selectedActionHistogram: Record<string, number> = {};
  for (const node of nodes) {
    if (!node.selectedActionId) continue;
    selectedActionHistogram[node.selectedActionId] =
      (selectedActionHistogram[node.selectedActionId] ?? 0) + 1;
  }
  const branchNodeCount = nodes.filter((node) =>
    edges.filter((edge) => edge.sourceNodeId === node.id && edge.expectedFlow > 1e-12).length > 1
  ).length;
  const cyclicComponentCount = components.filter((component) =>
    component.length > 1 || selfLoops.has(component[0])
  ).length;
  const fingerprintPayload = {
    nodes: nodes.map((node) => [node.macroKey, node.selectedActionId, node.terminal]).sort(),
    edges: edges.map((edge) => [
      nodes.find((node) => node.id === edge.sourceNodeId)?.macroKey,
      nodes.find((node) => node.id === edge.targetNodeId)?.macroKey,
      edge.actionId,
      edge.outcomeKind,
    ]).sort(),
  };
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    stronglyConnectedComponentCount: components.length,
    cyclicComponentCount,
    branchNodeCount,
    recoveryEdgeCount: edges.filter((edge) =>
      edge.outcomeKind === 'RECOVERY' || edge.outcomeKind === 'REACQUIRE'
    ).length,
    repeatEdgeCount: edges.filter((edge) => edge.outcomeKind === 'REPEAT').length,
    selectedActionHistogram,
    fingerprint: `topology-${hashText(JSON.stringify(fingerprintPayload))}`,
  };
}

/**
 * Presentation-only aggregation of the already-selected policy. It reads exact solver occupancy
 * and transition distributions, and never participates in action choice or state identity.
 */
export function buildPolicyFlowComponent(
  result: GenericSearchResult,
  scope: PolicyFlowScope,
): PolicyFlowComponent {
  const started = now();
  const mutableNodes = new Map<string, MutableNode>();
  const mutableEdges = new Map<string, MutableEdge>();
  const nodeByExactStateKey = new Map<string, MutableNode>();
  const ruleByStateKey = new Map(result.onPolicyRules.map((rule) => [rule.stateKey, rule]));
  const startStateKey = getCanonicalStateKey(result.startingState, result.target);

  const ensureNode = (
    stateKey: string,
    state: ItemState,
    selectedActionId: string | undefined,
    selectedActionName: string | undefined,
    terminal: boolean,
    visits: number,
  ): MutableNode => {
    const cached = nodeByExactStateKey.get(stateKey);
    if (cached) {
      cached.node.expectedVisits += visits;
      cached.node.start ||= stateKey === startStateKey;
      return cached;
    }
    const macroKey = macroKeyForState(state, result.target, selectedActionId, terminal);
    const id = `policy_${scope.toLowerCase()}_${hashText(macroKey)}`;
    const existing = mutableNodes.get(macroKey);
    if (existing) {
      existing.exactStateKeys.add(stateKey);
      existing.node.exactStateCount = existing.exactStateKeys.size;
      existing.node.expectedVisits += visits;
      existing.node.start ||= stateKey === startStateKey;
      nodeByExactStateKey.set(stateKey, existing);
      return existing;
    }
    const evidence = stateEvidence(state, result.target);
    const node: PolicyFlowNode = {
      id,
      macroKey,
      label: terminal
        ? 'Goal'
        : compactActionName(selectedActionId, selectedActionName),
      stateSummary: terminal
        ? 'Selected target satisfied'
        : stateSummary(state, evidence, result.target),
      scope,
      selectedActionId,
      selectedActionName,
      rarity: state.rarity,
      matchedTargetModIds: evidence.matchedTargetModIds,
      fracturedTargetModIds: evidence.fracturedTargetModIds,
      prefixCount: state.prefixes.length,
      suffixCount: state.suffixes.length,
      targetPrefixCount: evidence.targetPrefixCount,
      targetSuffixCount: evidence.targetSuffixCount,
      exactStateCount: 1,
      expectedVisits: visits,
      occupancyShare: 0,
      terminal,
      start: stateKey === startStateKey,
      recoveryLike: selectedActionId === 'scouring_orb' || selectedActionId === 'restart_reacquire',
      acquisitionMenu: state.flags?.acquisitionMenu === true,
      representativeState: describeState(state, result.target),
      representativeStateKey: stateKey,
      representativePhysicalStateSignature: getPhysicalStateSignature(state),
    };
    const created = { node, exactStateKeys: new Set([stateKey]) };
    mutableNodes.set(macroKey, created);
    nodeByExactStateKey.set(stateKey, created);
    return created;
  };

  for (const rule of result.onPolicyRules) {
    if (rule.expectedVisits <= 1e-12) continue;
    ensureNode(
      rule.stateKey,
      rule.state,
      rule.selectedActionId,
      rule.selectedActionName,
      false,
      rule.expectedVisits,
    );
  }

  let exactTransitionCount = 0;
  const differentialSamples: PolicyFlowDifferentialSample[] = [];
  const sampledSourceStateKeys = new Set<string>();
  for (const rule of result.onPolicyRules) {
    if (rule.expectedVisits <= 1e-12) continue;
    const source = ensureNode(
      rule.stateKey,
      rule.state,
      rule.selectedActionId,
      rule.selectedActionName,
      false,
      0,
    ).node;
    const exactNode = result.graphBuild.nodes.get(rule.stateKey);
    const exactAction = exactNode?.actions.get(rule.selectedActionId);
    if (!exactAction) continue;
    for (const transition of exactAction.transitions) {
      if (transition.probability <= 0) continue;
      const targetExactNode = result.graphBuild.nodes.get(transition.targetKey);
      if (!targetExactNode) continue;
      const targetRule = ruleByStateKey.get(transition.targetKey);
      const terminal = targetExactNode.isTerminal;
      const target = ensureNode(
        transition.targetKey,
        targetExactNode.state,
        targetRule?.selectedActionId,
        targetRule?.selectedActionName,
        terminal,
        0,
      ).node;
      const expectedFlow = rule.expectedVisits * transition.probability;
      if (expectedFlow <= 1e-15) continue;
      const edgeKey = `${source.id}\u0000${target.id}\u0000${rule.selectedActionId}`;
      const edgeId = `flow_${scope.toLowerCase()}_${hashText(edgeKey)}`;
      exactTransitionCount += 1;
      if (differentialSamples.length < 24 && !sampledSourceStateKeys.has(rule.stateKey)) {
        sampledSourceStateKeys.add(rule.stateKey);
        differentialSamples.push({
          sourceStateKey: rule.stateKey,
          targetStateKey: transition.targetKey,
          sourceNodeId: source.id,
          targetNodeId: target.id,
          actionId: rule.selectedActionId,
          occupancy: rule.expectedVisits,
          exactProbability: transition.probability,
          exactExpectedFlow: expectedFlow,
        });
      }
      const existing = mutableEdges.get(edgeKey);
      if (existing) {
        existing.edge.expectedFlow += expectedFlow;
        existing.edge.exactTransitionCount += 1;
        if (!existing.edge.representativeOutcome && transition.label) {
          existing.edge.representativeOutcome = transition.label;
        }
        continue;
      }
      mutableEdges.set(edgeKey, {
        edge: {
          id: edgeId,
          sourceNodeId: source.id,
          targetNodeId: target.id,
          actionId: rule.selectedActionId,
          actionName: rule.selectedActionName,
          expectedFlow,
          conditionalProbability: 0,
          exactTransitionCount: 1,
          outcomeKind: outcomeKind(
            source.id,
            target.id,
            rule.selectedActionId,
            target.selectedActionId,
            terminal,
          ),
          nextSelectedActionId: target.selectedActionId,
          nextSelectedActionName: target.selectedActionName,
          representativeOutcome: transition.label,
          representativeState: target.representativeState,
          evidenceKind: 'EXACT_SELECTED_POLICY_TRANSITION',
        },
      });
    }
  }

  const nodes = [...mutableNodes.values()].map(({ node }) => node);
  const edges = [...mutableEdges.values()].map(({ edge }) => edge);
  const outgoingFlow = new Map<string, number>();
  for (const edge of edges) {
    outgoingFlow.set(edge.sourceNodeId, (outgoingFlow.get(edge.sourceNodeId) ?? 0) + edge.expectedFlow);
  }
  for (const edge of edges) {
    const denominator = outgoingFlow.get(edge.sourceNodeId) ?? 0;
    edge.conditionalProbability = denominator > 0 ? edge.expectedFlow / denominator : 0;
  }
  const terminalNodeIds = nodes.filter((node) => node.terminal).map((node) => node.id).sort();
  for (const node of nodes.filter((candidate) => candidate.terminal)) {
    node.expectedVisits = edges
      .filter((edge) => edge.targetNodeId === node.id)
      .reduce((sum, edge) => sum + edge.expectedFlow, 0);
  }
  const totalVisits = nodes.reduce((sum, node) => sum + node.expectedVisits, 0);
  for (const node of nodes) node.occupancyShare = totalVisits > 0 ? node.expectedVisits / totalVisits : 0;
  nodes.sort((left, right) => Number(right.start) - Number(left.start) ||
    Number(left.terminal) - Number(right.terminal) ||
    right.expectedVisits - left.expectedVisits || left.id.localeCompare(right.id));
  edges.sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId) ||
    right.expectedFlow - left.expectedFlow || left.targetNodeId.localeCompare(right.targetNodeId));
  const reconciliation = reconcileFlow(
    nodes,
    edges,
    result.onPolicyGraph.terminalAbsorptionProbability,
  );
  const aggregation: PolicyFlowAggregationEvidence = {
    exactStateCount: nodes.reduce((sum, node) => sum + node.exactStateCount, 0),
    exactTransitionCount,
    macroNodeCount: nodes.length,
    macroEdgeCount: edges.length,
    exactStatesCollapsedAtScopeHandoff: 0,
    exactTransitionsRepresented: exactTransitionCount,
    expectedFlowRetained: edges.reduce((sum, edge) => sum + edge.expectedFlow, 0),
    expectedFlowCollapsedIntoRareOutcomes: 0,
    visibleFlowFraction: 1,
    exactFlowFingerprint: `flow-${hashText(edges.map((edge) => [
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.actionId,
      edge.expectedFlow.toPrecision(16),
      edge.exactTransitionCount,
    ].join('|')).sort().join('\n'))}`,
    differentialSamples,
    aggregationMs: Math.max(0, now() - started),
  };
  const status = result.optimalityProof.selectedPolicyStatus ===
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED' &&
    result.reconciliation.visitConverged && reconciliation.certified
      ? 'CERTIFIED'
      : 'UNCERTIFIED';
  return {
    version: 'SELECTED_POLICY_FLOW_COMPONENT_V1',
    scope,
    status,
    nodes,
    edges,
    startNodeIds: nodes.filter((node) => node.start).map((node) => node.id).sort(),
    terminalNodeIds,
    aggregation,
    reconciliation,
    selectedPolicyTerminalAbsorption: result.onPolicyGraph.terminalAbsorptionProbability,
  };
}

function normalizeCombinedFlow(
  nodes: PolicyFlowNode[],
  edges: PolicyFlowEdge[],
): void {
  const outgoing = new Map<string, number>();
  for (const edge of edges) {
    outgoing.set(edge.sourceNodeId, (outgoing.get(edge.sourceNodeId) ?? 0) + edge.expectedFlow);
  }
  for (const edge of edges) {
    const total = outgoing.get(edge.sourceNodeId) ?? 0;
    edge.conditionalProbability = total > 0 ? edge.expectedFlow / total : 0;
    const target = nodes.find((node) => node.id === edge.targetNodeId);
    edge.nextSelectedActionId = target?.selectedActionId;
    edge.nextSelectedActionName = target?.selectedActionName;
    edge.representativeState = target?.representativeState;
    edge.outcomeKind = outcomeKind(
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.actionId,
      target?.selectedActionId,
      target?.terminal === true,
    );
  }
  const totalVisits = nodes.reduce((sum, node) => sum + node.expectedVisits, 0);
  for (const node of nodes) node.occupancyShare = totalVisits > 0 ? node.expectedVisits / totalVisits : 0;
}

export function buildSelectedPolicyFlowSummary(options: {
  sourceBundleId: string;
  sourcePolicyFingerprint?: string;
  downstream: PolicyFlowComponent;
  acquisition?: PolicyFlowComponent;
}): PolicyFlowSummary {
  const started = now();
  const downstreamNodes = options.downstream.nodes.map((node) => ({ ...node }));
  let downstreamEdges = options.downstream.edges.map((edge) => ({ ...edge }));
  let downstreamStartIds = [...options.downstream.startNodeIds];
  let collapsedHandoffStates = 0;

  if (options.acquisition) {
    const menuStartIds = downstreamStartIds.filter((nodeId) =>
      downstreamNodes.find((node) => node.id === nodeId)?.acquisitionMenu === true
    );
    if (menuStartIds.length > 0) {
      const menuTargets = downstreamEdges
        .filter((edge) => menuStartIds.includes(edge.sourceNodeId))
        .sort((left, right) => right.expectedFlow - left.expectedFlow || left.id.localeCompare(right.id));
      if (menuTargets.length > 0) downstreamStartIds = [...new Set(menuTargets.map((edge) => edge.targetNodeId))];
      downstreamEdges = downstreamEdges.filter((edge) =>
        !menuStartIds.includes(edge.sourceNodeId) && !menuStartIds.includes(edge.targetNodeId)
      );
      for (let index = downstreamNodes.length - 1; index >= 0; index -= 1) {
        if (menuStartIds.includes(downstreamNodes[index].id)) downstreamNodes.splice(index, 1);
      }
      collapsedHandoffStates += menuStartIds.length;
    }
    for (const node of downstreamNodes) node.start = downstreamStartIds.includes(node.id);
  }

  let nodes = downstreamNodes;
  let edges = downstreamEdges;
  let startNodeIds = downstreamStartIds;
  let exactStateCount = options.downstream.aggregation.exactStateCount;
  let exactTransitionCount = options.downstream.aggregation.exactTransitionCount;
  let exactTransitionsRepresented = options.downstream.aggregation.exactTransitionsRepresented;
  let expectedFlowRetained = options.downstream.aggregation.expectedFlowRetained;
  let exactFlowFingerprints = [options.downstream.aggregation.exactFlowFingerprint];
  let differentialSamples = options.downstream.aggregation.differentialSamples.map((sample) => ({ ...sample }));
  let componentAggregationMs = options.downstream.aggregation.aggregationMs;
  let selectedPolicyTerminalAbsorption = options.downstream.selectedPolicyTerminalAbsorption;

  if (options.acquisition) {
    const acquisitionTerminalIds = new Set(options.acquisition.terminalNodeIds);
    const acquisitionNodes = options.acquisition.nodes
      .filter((node) => !acquisitionTerminalIds.has(node.id))
      .map((node) => ({ ...node }));
    const entryIds = downstreamStartIds.length > 0
      ? downstreamStartIds
      : options.downstream.startNodeIds;
    const primaryEntryId = entryIds[0];
    const acquisitionEdges: PolicyFlowEdge[] = [];
    for (const sourceEdge of options.acquisition.edges) {
      if (!acquisitionTerminalIds.has(sourceEdge.targetNodeId)) {
        acquisitionEdges.push({ ...sourceEdge });
        continue;
      }
      if (!primaryEntryId) continue;
      acquisitionEdges.push({
        ...sourceEdge,
        id: `${sourceEdge.id}_handoff_${hashText(primaryEntryId)}`,
        targetNodeId: primaryEntryId,
        evidenceKind: 'CERTIFIED_SCOPE_HANDOFF',
      });
    }
    for (const node of downstreamNodes) node.start = false;
    nodes = [...acquisitionNodes, ...downstreamNodes];
    edges = [...acquisitionEdges, ...downstreamEdges];
    startNodeIds = options.acquisition.startNodeIds.filter((nodeId) =>
      acquisitionNodes.some((node) => node.id === nodeId)
    );
    collapsedHandoffStates += options.acquisition.terminalNodeIds.length;
    exactStateCount += options.acquisition.aggregation.exactStateCount;
    exactTransitionCount += options.acquisition.aggregation.exactTransitionCount;
    exactTransitionsRepresented += options.acquisition.aggregation.exactTransitionsRepresented;
    expectedFlowRetained += options.acquisition.aggregation.expectedFlowRetained;
    exactFlowFingerprints.push(options.acquisition.aggregation.exactFlowFingerprint);
    differentialSamples = [
      ...options.acquisition.aggregation.differentialSamples.map((sample) => ({
        ...sample,
        targetNodeId: acquisitionTerminalIds.has(sample.targetNodeId) && primaryEntryId
          ? primaryEntryId
          : sample.targetNodeId,
      })),
      ...differentialSamples,
    ].slice(0, 24);
    componentAggregationMs += options.acquisition.aggregation.aggregationMs;
    selectedPolicyTerminalAbsorption *= options.acquisition.selectedPolicyTerminalAbsorption;
  }

  normalizeCombinedFlow(nodes, edges);
  const visibleEdgeKeys = new Set(edges.map((edge) =>
    `${edge.sourceNodeId}\u0000${edge.targetNodeId}\u0000${edge.actionId}`
  ));
  differentialSamples = differentialSamples.filter((sample) => visibleEdgeKeys.has(
    `${sample.sourceNodeId}\u0000${sample.targetNodeId}\u0000${sample.actionId}`
  ));
  nodes.sort((left, right) => Number(right.start) - Number(left.start) ||
    Number(left.terminal) - Number(right.terminal) ||
    left.scope.localeCompare(right.scope) || right.expectedVisits - left.expectedVisits ||
    left.id.localeCompare(right.id));
  edges.sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId) ||
    right.expectedFlow - left.expectedFlow || left.targetNodeId.localeCompare(right.targetNodeId));
  const terminalNodeIds = nodes.filter((node) => node.terminal).map((node) => node.id).sort();
  const reconciliation = reconcileFlow(nodes, edges, selectedPolicyTerminalAbsorption);
  const aggregation: PolicyFlowAggregationEvidence = {
    exactStateCount,
    exactTransitionCount,
    macroNodeCount: nodes.length,
    macroEdgeCount: edges.length,
    exactStatesCollapsedAtScopeHandoff: collapsedHandoffStates,
    exactTransitionsRepresented,
    expectedFlowRetained,
    expectedFlowCollapsedIntoRareOutcomes: 0,
    visibleFlowFraction: 1,
    exactFlowFingerprint: `flow-${hashText(exactFlowFingerprints.sort().join('|'))}`,
    differentialSamples,
    aggregationMs: componentAggregationMs + Math.max(0, now() - started),
  };
  const status = options.downstream.status === 'CERTIFIED' &&
      (!options.acquisition || options.acquisition.status === 'CERTIFIED') &&
      reconciliation.certified
    ? 'CERTIFIED'
    : 'UNCERTIFIED';
  return {
    version: SELECTED_POLICY_FLOW_VERSION,
    status,
    sourceBundleId: options.sourceBundleId,
    sourcePolicyFingerprint: options.sourcePolicyFingerprint,
    nodes,
    edges,
    startNodeIds,
    terminalNodeIds,
    recoveryEdges: edges.filter((edge) =>
      edge.outcomeKind === 'RECOVERY' || edge.outcomeKind === 'REACQUIRE'
    ).map((edge) => edge.id),
    aggregation,
    reconciliation,
    topology: topologyFor(nodes, edges),
  };
}
