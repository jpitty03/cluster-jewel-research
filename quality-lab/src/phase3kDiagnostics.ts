import assert from 'node:assert/strict';
import {
  compileGuidedCraftConstellation,
  type GuidedConstellationEvidence,
  type GuidedCraftConstellationSummary,
} from '../../crafting-engine/src/service/guidedCraftConstellation.ts';
import type { OptimizeCraftResult } from '../../crafting-engine/src/service/optimizerService.ts';

const FROZEN_POLICY_ROWS = 267;
const FROZEN_PLAYER_RULES = 24;
const FROZEN_EXACT_STATES = 572;
const FROZEN_EXPECTED_VISITS = 740.8471930308734;

function canonical(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function evidenceComplete(evidence: GuidedConstellationEvidence, owner: string): void {
  assert.equal(evidence.evidenceStatus, 'CERTIFIED', `${owner} is not certified`);
  assert(evidence.playerRuleIds.length > 0, `${owner} has no player-rule IDs`);
  assert(evidence.policyRuleIndices.length > 0, `${owner} has no policy-rule indices`);
  assert(evidence.sourceStateKeys.length > 0, `${owner} has no source-state keys`);
  assert(evidence.sourcePolicyNodeIds.length > 0, `${owner} has no PolicyFlow nodes`);
  assert(evidence.sourcePolicyEdgeIds.length > 0, `${owner} has no exact PolicyFlow edges`);
}

function evidenceMapMatches(summary: GuidedCraftConstellationSummary): void {
  for (const node of summary.nodes) {
    evidenceComplete(node, `guided node ${node.id}`);
    assert.deepEqual(summary.evidenceMap.nodes[node.id], evidenceFor(node));
    for (const row of node.conditionRows) {
      evidenceComplete(row, `guided condition ${row.id}`);
      assert.deepEqual(summary.evidenceMap.conditionRows[row.id], evidenceFor(row));
    }
    for (const choice of node.actionChoices) {
      evidenceComplete(choice, `guided choice ${choice.id}`);
      assert.deepEqual(summary.evidenceMap.actionChoices[choice.id], evidenceFor(choice));
      const rows = node.conditionRows.filter((row) => choice.conditionRowIds.includes(row.id));
      assert(rows.length > 0, `${choice.id} has no condition rows`);
      assert(rows.every((row) =>
        row.actionId === choice.actionId && row.recoveryKind === choice.recoveryKind
      ), `${choice.id} merged a different action or recovery`);
    }
  }
  for (const edge of summary.edges) {
    evidenceComplete(edge, `guided edge ${edge.id}`);
    assert.deepEqual(summary.evidenceMap.edges[edge.id], evidenceFor(edge));
  }
}

function evidenceFor(source: GuidedConstellationEvidence): GuidedConstellationEvidence {
  return {
    playerRuleIds: [...source.playerRuleIds],
    policyRuleIndices: [...source.policyRuleIndices],
    sourceStateKeys: [...source.sourceStateKeys],
    sourcePolicyNodeIds: [...source.sourcePolicyNodeIds],
    sourcePolicyEdgeIds: [...source.sourcePolicyEdgeIds],
    evidenceStatus: source.evidenceStatus,
  };
}

export function auditPhase3KGuidedResult(result: OptimizeCraftResult) {
  const summary = result.guidedConstellation;
  const flow = result.policyFlow;
  assert(flow, 'Field result omitted PolicyFlow');
  assert.equal(summary.status, 'CERTIFIED', summary.reasons.join('\n'));
  assert.equal(result.craftPlan.playerRules.length, FROZEN_PLAYER_RULES);
  assert.equal(result.craftPlan.playerRuleCertification.sourcePolicyRuleIndices.length,
    FROZEN_POLICY_ROWS);
  assert.equal(result.craftPlan.playerRuleCertification.representedStateCount,
    FROZEN_EXACT_STATES);
  assert.equal(result.craftPlan.playerRuleCertification.expectedVisits,
    FROZEN_EXPECTED_VISITS);
  assert.equal(summary.representedStateCount, FROZEN_EXACT_STATES);
  assert.equal(summary.expectedVisits, FROZEN_EXPECTED_VISITS);
  assert(summary.nodes.length < FROZEN_PLAYER_RULES,
    'Guided field route did not compress the 24-card stack');
  assert(summary.nodes.filter((node) => node.lane === 'MAIN').length <= 9,
    'Guided main route exceeded the compact stage budget');

  const rowRuleIds = summary.nodes.flatMap((node) =>
    node.conditionRows.flatMap((row) => row.playerRuleIds)
  );
  assert.equal(rowRuleIds.length, new Set(rowRuleIds).size,
    'A certified player rule appears in multiple guided conditions');
  assert.deepEqual(canonical(rowRuleIds), canonical(result.craftPlan.playerRules.map((rule) => rule.id)));
  assert.deepEqual(summary.representedPolicyRuleIndices,
    result.craftPlan.playerRuleCertification.sourcePolicyRuleIndices);
  assert.deepEqual(summary.representedSourceStateKeys,
    canonical(result.craftPlan.playerRules.flatMap((rule) => rule.sourceStateKeys)));
  assert.deepEqual(summary.representedPolicyEdgeIds, canonical(flow.edges.map((edge) => edge.id)));
  evidenceMapMatches(summary);
  const sourceRuleById = new Map(result.craftPlan.playerRules.map((rule) => [rule.id, rule]));
  for (const node of summary.nodes) {
    for (const row of node.conditionRows) assert.equal(row.playerRuleIds.length, 1);
    for (const choice of node.actionChoices) {
      const semanticKeys = node.conditionRows
        .filter((row) => choice.conditionRowIds.includes(row.id))
        .map((row) => {
          const rule = sourceRuleById.get(row.playerRuleIds[0]);
          assert(rule, `${row.id} has no source player rule`);
          return JSON.stringify({
            actionId: row.actionId,
            recoveryKind: row.recoveryKind,
            nextNodeIds: canonical(row.nextNodeIds),
            policyScope: rule.when.policyScope,
            progressKind: rule.when.progressKind,
            requiredPresentModIds: canonical(rule.when.requiredPresentModIds),
            requiredMissingModIds: canonical(rule.when.requiredMissingModIds),
            acceptablePresentModIds: canonical(rule.when.acceptablePresentModIds),
            acceptableAlternativeSatisfied: rule.when.acceptableAlternativeSatisfied,
            fracturedRequiredTargetModIds: canonical(rule.when.fracturedRequiredTargetModIds),
            fracturedAcceptableTargetModIds: canonical(rule.when.fracturedAcceptableTargetModIds),
            fracturedJunk: rule.when.junk.some((junk) => junk.kind === 'FRACTURED'),
            openCompatibleTargetSlots: canonical(rule.when.openCompatibleTargetSlots),
            minimalException: rule.when.minimalException
              ? {
                  relation: rule.when.minimalException.relation,
                  modIds: canonical(rule.when.minimalException.modIds),
                }
              : undefined,
            terminalEligible: row.nextNodeIds.includes(summary.terminalNodeId ?? ''),
          });
        });
      assert.equal(new Set(semanticKeys).size, 1,
        `${choice.id} merged a semantic distinction that can change action or routing`);
    }
  }

  const rawEdges = new Map(flow.edges.map((edge) => [edge.id, edge]));
  const rawNodes = new Map(flow.nodes.map((node) => [node.id, node]));
  const guidedNodes = new Map(summary.nodes.map((node) => [node.id, node]));
  for (const edge of summary.edges) {
    const source = guidedNodes.get(edge.sourceNodeId);
    const target = guidedNodes.get(edge.targetNodeId);
    assert(source && target, `${edge.id} has an unknown guided endpoint`);
    for (const rawEdgeId of edge.sourcePolicyEdgeIds) {
      const raw = rawEdges.get(rawEdgeId);
      assert(raw, `${edge.id} cites unknown PolicyFlow edge ${rawEdgeId}`);
      assert(['EXACT_SELECTED_POLICY_TRANSITION', 'CERTIFIED_SCOPE_HANDOFF']
        .includes(raw.evidenceKind));
      assert(source.sourcePolicyNodeIds.includes(raw.sourceNodeId),
        `${edge.id} has the wrong source stage`);
      assert(target.sourcePolicyNodeIds.includes(raw.targetNodeId),
        `${edge.id} has the wrong recovery/loop/result destination`);
      if (edge.kind === 'SUCCESS') assert(rawNodes.get(raw.targetNodeId)?.terminal === true);
    }
  }

  const finish = result.craftPlan.playerFinishRule;
  assert(finish && summary.finishCondition, 'Finish evidence is absent');
  assert.deepEqual(summary.finishCondition.requiredTargetIds, finish.requiredTargetModIds);
  assert.deepEqual(summary.finishCondition.acceptableTargetBranches,
    finish.acceptableTargetBranches);
  assert.equal(summary.finishCondition.requiredRarity, finish.requiredRarity);
  assert.equal(summary.finishCondition.extraAffixesAllowed, finish.extraAffixesAllowed);
  const terminalIncoming = summary.edges.filter((edge) => edge.targetNodeId === summary.terminalNodeId);
  assert(terminalIncoming.length > 0 && terminalIncoming.every((edge) => edge.kind === 'SUCCESS'));

  const rows = summary.nodes.flatMap((node) => node.conditionRows);
  const actionIds = canonical(rows.map((row) => row.actionId));
  for (const actionId of [
    'transmutation_orb',
    'alteration_orb',
    'augmentation_orb',
    'regal_orb',
    'exalted_orb',
    'scouring_orb',
    'fracturing_orb',
    'restart_reacquire',
  ]) assert(actionIds.includes(actionId), `Guided field route omitted ${actionId}`);
  const exceptionRows = rows.filter((row) => row.minimalExceptionModIds.length > 0);
  const exceptionIdentities = canonical(exceptionRows.map((row) =>
    canonical(row.minimalExceptionModIds).join('|')
  ));
  assert.equal(result.craftPlan.playerRuleCertification.minimalExceptionCount, 2);
  assert(exceptionRows.length >= result.craftPlan.playerRuleCertification.minimalExceptionCount);
  assert(exceptionIdentities.length > 0);
  assert(exceptionRows.some((row) => row.actionId === 'scouring_orb' &&
    /blocked prefix or exception junk/i.test(row.label)));
  assert(exceptionRows.some((row) => row.actionId === 'exalted_orb' &&
    /safe open prefix slot.*no exception junk/i.test(row.label)));
  assert(rows.some((row) => row.actionId === 'exalted_orb' &&
    row.whenLines.some((line) => /Open target-compatible prefix/i.test(line))));
  assert(summary.edges.some((edge) => edge.kind === 'LOOP'));
  assert(summary.edges.some((edge) => edge.kind === 'REACQUIRE'));
  assert(summary.edges.some((edge) => /Preparation target fractured/i.test(edge.label)));
  assert(summary.edges.some((edge) => /Junk fractured/i.test(edge.label)));

  const withheldForPolicy = compileGuidedCraftConstellation({
    craftPlan: result.craftPlan,
    policyFlow: { ...flow, status: 'UNCERTIFIED' },
    target: result.target,
    modifierMetadata: result.craftPlan.playerRules.flatMap((rule) =>
      rule.sourceEvidence.flatMap((source) => source.exactAffixes.map((affix) => ({
        modId: affix.modId,
        name: affix.modId,
        genType: affix.side === 'PREFIX' ? 'Prefix' as const : 'Suffix' as const,
        tier: affix.tier,
        modGroup: affix.modId,
        modGroups: [affix.modId],
        isNotable: false,
      })))
    ),
    selectedRouteName: summary.selectedRouteName,
    physicalStart: summary.physicalStart,
  });
  assert.equal(withheldForPolicy.status, 'WITHHELD');
  assert.equal(withheldForPolicy.nodes.length, 0);
  assert.equal(withheldForPolicy.edges.length, 0);
  assert.deepEqual(withheldForPolicy.evidenceMap,
    { nodes: {}, conditionRows: {}, actionChoices: {}, edges: {} });

  const first = result.craftPlan.playerRules[0];
  const second = result.craftPlan.playerRules[1];
  const collisionPlan = {
    ...result.craftPlan,
    playerRules: result.craftPlan.playerRules.map((rule) => rule.id === second.id
      ? { ...rule, sourceStateKeys: [first.sourceStateKeys[0], ...rule.sourceStateKeys] }
      : rule),
  };
  const withheldForCollision = compileGuidedCraftConstellation({
    craftPlan: collisionPlan,
    policyFlow: flow,
    target: result.target,
    modifierMetadata: [],
    selectedRouteName: summary.selectedRouteName,
    physicalStart: summary.physicalStart,
  });
  assert.equal(withheldForCollision.status, 'WITHHELD');
  assert.equal(withheldForCollision.nodes.length, 0);

  return {
    K2_K6: {
      status: summary.status,
      playerRules: rowRuleIds.length,
      exactStates: summary.representedStateCount,
      guidedNodes: summary.nodes.length,
      guidedEdges: summary.edges.length,
      policyEdges: summary.representedPolicyEdgeIds.length,
      evidenceMapEntries: Object.values(summary.evidenceMap)
        .reduce((count, entries) => count + Object.keys(entries).length, 0),
    },
    K7: { actions: actionIds.filter((actionId) =>
      ['alteration_orb', 'augmentation_orb', 'regal_orb'].includes(actionId)) },
    K8: { fractureSuccess: true, junkReacquire: true },
    K9: {
      exalt: true,
      scour: true,
      exceptionRows: exceptionRows.map((row) => row.minimalExceptionModIds),
    },
    K10: { exactDestinationChecks: summary.edges.length },
    K11: { terminalEdges: terminalIncoming.length, finish: summary.finishCondition },
    K18: { uncertifiedWithheld: true, collisionWithheld: true, guessedNodes: 0 },
  };
}
