import { useEffect, useMemo, useState } from 'react';
import type {
  GuidedConstellationConditionRow,
  GuidedConstellationNode,
  GuidedCraftConstellationSummary,
} from '../../crafting-engine/src/service/guidedCraftConstellation.ts';

function firstCondition(node: GuidedConstellationNode | undefined) {
  return node?.conditionRows[0];
}

function nextTitle(
  summary: GuidedCraftConstellationSummary,
  nodeId: string,
): string {
  return summary.nodes.find((node) => node.id === nodeId)?.title ?? nodeId;
}

export function GuidedCraftConstellation({
  summary,
  onShowAdvancedEvidence,
}: {
  summary: GuidedCraftConstellationSummary;
  onShowAdvancedEvidence: (ruleId: string) => void;
}) {
  const initialNode = useMemo(
    () => summary.nodes.find((node) => node.id === summary.startNodeId) ?? summary.nodes[0],
    [summary],
  );
  const [selectedNodeId, setSelectedNodeId] = useState(initialNode?.id);
  const [selectedConditionId, setSelectedConditionId] = useState(firstCondition(initialNode)?.id);
  const [showWhy, setShowWhy] = useState(false);

  useEffect(() => {
    setSelectedNodeId(initialNode?.id);
    setSelectedConditionId(firstCondition(initialNode)?.id);
    setShowWhy(false);
  }, [initialNode, summary.fingerprint]);

  if (summary.status !== 'CERTIFIED') {
    return (
      <div className="guided-constellation-withheld" role="alert" data-guided-status="WITHHELD">
        <strong>Crafting Constellation withheld</strong>
        <p>The selected policy could not be compressed into an unambiguous player flow.</p>
        <p>Open Research diagnostics for the exact certified evidence.</p>
      </div>
    );
  }

  const selectedNode = summary.nodes.find((node) => node.id === selectedNodeId) ?? initialNode;
  const selectedCondition = selectedNode?.conditionRows.find((row) =>
    row.id === selectedConditionId
  ) ?? firstCondition(selectedNode);
  const outgoingByNode = new Map(summary.nodes.map((node) => [
    node.id,
    summary.edges.filter((edge) => edge.sourceNodeId === node.id),
  ]));

  const selectNode = (node: GuidedConstellationNode) => {
    setSelectedNodeId(node.id);
    setSelectedConditionId(firstCondition(node)?.id);
    setShowWhy(false);
  };
  const selectCondition = (node: GuidedConstellationNode, row: GuidedConstellationConditionRow) => {
    setSelectedNodeId(node.id);
    setSelectedConditionId(row.id);
    setShowWhy(false);
  };

  return (
    <div
      className="guided-craft-constellation"
      data-testid="guided-craft-constellation"
      data-guided-status={summary.status}
      data-guided-fingerprint={summary.fingerprint}
      data-guided-player-rule-count={summary.representedPlayerRuleIds.length}
      data-guided-state-count={summary.representedStateCount}
      data-guided-policy-edge-count={summary.representedPolicyEdgeIds.length}
    >
      <header className="guided-constellation-header">
        <div>
          <p className="guided-eyebrow">Selected route</p>
          <strong>{summary.selectedRouteName}</strong>
          <p className="guided-physical-start">Physical start: {summary.physicalStart}</p>
        </div>
        <div className="guided-target-legend" aria-label="Crafting Constellation target legend">
          <p><strong>Required:</strong> {summary.requiredTargetNames.join(', ') || 'none'}</p>
          <p><strong>Acceptable:</strong> {summary.acceptableTargetBranchNames.length > 0
            ? `any one of ${summary.acceptableTargetBranchNames.map((branch) => branch.join(' + ')).join(' or ')}`
            : 'none'}</p>
        </div>
      </header>

      <p className="guided-explore-copy">
        Explore a stage to see its certified <strong>WHEN → USE → THEN</strong> instruction. Selection explains the route; it does not track an item or advance the craft.
      </p>

      <div className="guided-constellation-layout">
        <div className="guided-flow" aria-label="Certified crafting route stages">
          {summary.nodes.map((node) => {
            const selected = node.id === selectedNode?.id;
            const outgoing = outgoingByNode.get(node.id) ?? [];
            return (
              <div
                className={`guided-stage-wrap lane-${node.lane.toLowerCase()}`}
                key={node.id}
                data-guided-node-id={node.id}
                data-guided-node-kind={node.kind}
                data-guided-lane={node.lane}
                data-policy-rule-indices={node.policyRuleIndices.join(',')}
                data-source-state-count={node.sourceStateKeys.length}
                data-policy-edge-ids={node.sourcePolicyEdgeIds.join(',')}
              >
                <article className={`guided-stage guided-kind-${node.kind.toLowerCase()} ${selected ? 'is-selected' : ''}`}>
                  <button
                    type="button"
                    className="guided-stage-select"
                    aria-pressed={selected}
                    onClick={() => selectNode(node)}
                  >
                    <span className="guided-stage-number" aria-hidden="true">
                      {node.kind === 'COMPLETE' ? '✓' : node.displayOrder + 1}
                    </span>
                    <span>
                      <strong>{node.title}</strong>
                      <small>{node.summary}</small>
                    </span>
                  </button>
                  {node.actionChoices.length > 0 && (
                    <div className="guided-action-choices" aria-label={`${node.title} result choices`}>
                      {node.actionChoices.filter((choice) => choice.preview).map((choice) => {
                        const row = node.conditionRows.find((candidate) =>
                          choice.conditionRowIds.includes(candidate.id)
                        );
                        if (!row) return null;
                        return (
                          <button
                            type="button"
                            key={choice.id}
                            className="guided-action-choice"
                            onClick={() => selectCondition(node, row)}
                            data-action-id={choice.actionId}
                            data-recovery-kind={choice.recoveryKind}
                            data-player-rule-ids={choice.playerRuleIds.join(',')}
                            data-policy-rule-indices={choice.policyRuleIndices.join(',')}
                            data-source-state-count={choice.sourceStateKeys.length}
                            data-policy-edge-ids={choice.sourcePolicyEdgeIds.join(',')}
                          >
                            <span>{choice.label}</span>
                            <strong>→ {choice.actionName}</strong>
                            {choice.conditionRowIds.length > 1 && (
                              <small>{choice.conditionRowIds.length} certified conditions</small>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
                {outgoing.length > 0 && (
                  <ul className="guided-connectors" aria-label={`${node.title} connections`}>
                    {outgoing.map((edge) => (
                      <li
                        key={edge.id}
                        className={`guided-connector edge-${edge.kind.toLowerCase()}`}
                        data-guided-edge-id={edge.id}
                        data-guided-edge-kind={edge.kind}
                        data-action-id={edge.actionId}
                        data-player-rule-ids={edge.playerRuleIds.join(',')}
                        data-policy-rule-indices={edge.policyRuleIndices.join(',')}
                        data-source-state-count={edge.sourceStateKeys.length}
                        data-policy-edge-ids={edge.sourcePolicyEdgeIds.join(',')}
                      >
                        <span aria-hidden="true">{edge.kind === 'LOOP' ? '↻' : edge.kind === 'RECOVERY' || edge.kind === 'REACQUIRE' ? '↩' : '↓'}</span>
                        <span>{edge.label}</span>
                        <small>{nextTitle(summary, edge.targetNodeId)}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {selectedNode && (
          <aside
            className="guided-instruction-detail"
            aria-label="Guided constellation instruction details"
            data-selected-guided-node-id={selectedNode.id}
            data-selected-guided-condition-id={selectedCondition?.id}
          >
            <p className="guided-detail-owner">Exploring: <strong>{selectedNode.title}</strong></p>
            {selectedNode.kind === 'COMPLETE' && summary.finishCondition ? (
              <>
                <section><h3>WHEN</h3><ul>
                  <li>All required targets are present: {summary.finishCondition.requiredTargetNames.join(', ')}.</li>
                  {summary.finishCondition.acceptableTargetBranches.length > 0 && <li>At least one acceptable target branch is satisfied.</li>}
                  {summary.finishCondition.requiredRarity && <li>The item is {capitalized(summary.finishCondition.requiredRarity)}.</li>}
                  <li>{summary.finishCondition.extraAffixesAllowed ? 'Extra affixes are allowed.' : 'The requested extra-affix limit is satisfied.'}</li>
                </ul></section>
                <section><h3>USE</h3><p>Stop crafting.</p></section>
                <section><h3>THEN</h3><p>The selected target is complete.</p></section>
              </>
            ) : selectedCondition ? (
              <>
                {selectedNode.conditionRows.length > 1 && (
                  <label className="guided-condition-picker">
                    Certified condition
                    <select
                      value={selectedCondition.id}
                      onChange={(event) => setSelectedConditionId(event.target.value)}
                    >
                      {selectedNode.conditionRows.map((row) => (
                        <option key={row.id} value={row.id}>{row.label} → {row.actionName}</option>
                      ))}
                    </select>
                  </label>
                )}
                <section><h3>WHEN</h3><ul>{selectedCondition.whenLines.map((line) => <li key={line}>{line}</li>)}</ul></section>
                <section><h3>USE</h3><p>{selectedCondition.actionName}</p></section>
                <section><h3>THEN</h3><p>{selectedCondition.thenSummary}</p>
                  {selectedCondition.thenBranches.length > 0 && <ul>{selectedCondition.thenBranches.map((branch) => <li key={branch}>{branch}</li>)}</ul>}
                </section>
              </>
            ) : null}
            <button
              type="button"
              className="guided-why-toggle"
              aria-expanded={showWhy}
              onClick={() => setShowWhy((current) => !current)}
            >
              Why this action?
            </button>
            {showWhy && (
              <div className="guided-why-evidence">
                <p>Certified from {selectedCondition?.playerRuleIds.join(', ') ?? 'the Finish rule'}.</p>
                {selectedCondition && <>
                  <p>{selectedCondition.representedStateCount} represented exact states · {selectedCondition.expectedVisits.toFixed(6)} expected visits.</p>
                  <p>Policy rules: {selectedCondition.policyRuleIndices.join(', ')} · exact PolicyFlow edges: {selectedCondition.sourcePolicyEdgeIds.length}.</p>
                  {selectedCondition.minimalExceptionModIds.length > 0 && <p>Minimal exact-name exception retained: {selectedCondition.minimalExceptionModIds.join(', ')}.</p>}
                  <button type="button" className="secondary" onClick={() => onShowAdvancedEvidence(selectedCondition.playerRuleIds[0])}>
                    Open Advanced policy evidence
                  </button>
                </>}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function capitalized(value: string): string {
  return value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}
