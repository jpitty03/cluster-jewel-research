import type { TargetDefinition } from '../../crafting-engine/src/domain/TargetDefinition.ts';
import type {
  CraftPlanSummary,
  PlayerCraftFinishRule,
  PlayerCraftRule,
  PlayerCraftRuleStage,
  PlayerJunkKind,
} from '../../crafting-engine/src/service/craftPlan.ts';

const STAGE_LABELS: Record<PlayerCraftRuleStage, string> = {
  ACQUIRE: 'Acquire and prepare',
  MAKE_MAGIC: 'Make Magic',
  MAGIC_ROLL: 'Magic rolling rules',
  PROMOTE: 'Promotion rules',
  RARE_FINISH: 'Rare finishing rules',
  SPECIALIZED: 'Specialized crafting rules',
  RECOVER: 'Recovery rules',
  TERMINAL: 'Finish condition',
};

const JUNK_LABELS: Record<PlayerJunkKind, string> = {
  SAFE_FOR_THIS_RULE: 'Safe for this rule',
  BLOCKS_MISSING_TARGET: 'Blocks a missing target',
  OCCUPIES_LAST_COMPATIBLE_SLOT: 'Occupies the last compatible slot',
  FRACTURED: 'Fractured junk',
};

function plural(value: number, singular: string, pluralValue = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

function conditionLines(
  rule: PlayerCraftRule,
  modifierName: (modId: string) => string,
): string[] {
  const condition = rule.when;
  const lines = [
    `${condition.progressKind === 'PREPARATION' ? 'Self-fracture preparation' : 'Final craft'} · ` +
      `${condition.rarity[0].toUpperCase()}${condition.rarity.slice(1)} · ` +
      `${plural(condition.prefixCount, 'Prefix')} / ${plural(condition.suffixCount, 'Suffix')}`,
  ];
  if (condition.requiredPresentModIds.length > 0) {
    lines.push(`Has required target: ${condition.requiredPresentModIds.map(modifierName).join(', ')}`);
  }
  if (condition.requiredMissingModIds.length > 0) {
    lines.push(`Missing required target: ${condition.requiredMissingModIds.map(modifierName).join(', ')}`);
  }
  if (condition.fracturedRequiredTargetModIds.length > 0) {
    lines.push(`Fractured required target: ${condition.fracturedRequiredTargetModIds.map(modifierName).join(', ')}`);
  }
  if (condition.fracturedAcceptableTargetModIds.length > 0) {
    lines.push(`Fractured acceptable target: ${condition.fracturedAcceptableTargetModIds.map(modifierName).join(', ')}`);
  }
  if (condition.acceptableAlternativeRequired) {
    lines.push(condition.acceptableAlternativeSatisfied
      ? `Acceptable target satisfied: ${condition.acceptablePresentModIds.map(modifierName).join(', ')}`
      : 'Acceptable target not yet satisfied');
  }
  if (
    condition.requiredPresentModIds.length === 0 &&
    condition.acceptablePresentModIds.length === 0
  ) lines.push('No target modifier is present');
  for (const junk of condition.junk) {
    lines.push(
      `${JUNK_LABELS[junk.kind]}: ${plural(junk.count, `${junk.side.toLowerCase()} junk`, `${junk.side.toLowerCase()} junk modifiers`)}`,
    );
  }
  if (condition.openCompatibleTargetSlots.length > 0) {
    lines.push(`Open compatible target slot: ${condition.openCompatibleTargetSlots
      .map((side) => side.toLowerCase())
      .join(' or ')}`);
  }
  if (condition.minimalException) {
    const relation = condition.minimalException.relation === 'HAS_JUNK' ? 'Has' : 'Does not have';
    lines.push(
      `${relation} exception junk: ${condition.minimalException.modIds.map(modifierName).join(', ')}`,
    );
  }
  return lines;
}

function FinishRule({
  rule,
  modifierName,
}: {
  rule: PlayerCraftFinishRule;
  modifierName: (modId: string) => string;
}) {
  return (
    <article className="player-craft-rule finish-rule" data-player-rule-id={rule.id}>
      <div className="player-rule-command stop-when">
        <strong>STOP WHEN</strong>
        <ul>
          <li>All required targets are present: {rule.requiredTargetModIds.map(modifierName).join(', ')}.</li>
          {rule.acceptableTargetBranches.length > 0 && (
            <li>At least one acceptable target is present.</li>
          )}
          {rule.requiredRarity && (
            <li>The item is {rule.requiredRarity[0].toUpperCase()}{rule.requiredRarity.slice(1)}.</li>
          )}
          <li>{rule.extraAffixesAllowed
            ? 'Extra junk affixes are allowed after every target condition is complete.'
            : 'The requested final-state junk limit is satisfied.'}</li>
        </ul>
      </div>
    </article>
  );
}

export function SimpleCraftInstructions({
  craftPlan,
  target,
  modifierName,
  actionName,
  onShowEvidence,
}: {
  craftPlan: CraftPlanSummary;
  target: TargetDefinition;
  modifierName: (modId: string) => string;
  actionName: (actionId: string, fallback: string) => string;
  onShowEvidence: (ruleId: string) => void;
}) {
  if (craftPlan.playerRuleCertification.status !== 'CERTIFIED') {
    return (
      <div className="plan-withheld-warning" role="alert" data-player-rule-status="WITHHELD">
        <strong>Simple instructions withheld</strong>
        <p>The selected policy could not be grouped into unambiguous player rules. Technical evidence remains available for diagnosis.</p>
      </div>
    );
  }

  const required = target.requiredMods.map((requirement, index) =>
    modifierName(requirement.modId ?? requirement.name ?? requirement.modGroup ?? `target requirement ${index + 1}`)
  );
  const acceptable = (target.acceptableAnyOf ?? []).map((branch) =>
    branch.map((requirement, index) =>
      modifierName(requirement.modId ?? requirement.name ?? requirement.modGroup ?? `acceptable target ${index + 1}`)
    ).join(' + ')
  );
  const byStage = new Map<PlayerCraftRuleStage, PlayerCraftRule[]>();
  for (const rule of craftPlan.playerRules) {
    const rules = byStage.get(rule.stage) ?? [];
    rules.push(rule);
    byStage.set(rule.stage, rules);
  }

  return (
    <div className="simple-craft-instructions" data-player-rule-status="CERTIFIED">
      <p className="craft-guide-orientation">
        Match your current item to the first <strong>WHEN</strong> condition that applies, use the listed action once, then check the result again.
      </p>
      <section className="player-target-legend" aria-label="Craft target legend">
        <p><strong>Required targets:</strong> {required.join(', ') || 'none'}</p>
        <p><strong>Acceptable target:</strong> {acceptable.length > 0
          ? `any one of ${acceptable.join(', or ')}`
          : 'none'}</p>
        <p><strong>Junk modifier:</strong> anything else.</p>
      </section>
      <section className="player-junk-legend" aria-label="Junk modifier legend">
        <p><strong>Safe junk:</strong> the selected rule can keep it.</p>
        <p><strong>Blocking junk:</strong> it prevents or occupies the slot needed by a missing target.</p>
        <p><strong>Fractured junk:</strong> a permanent unwanted modifier.</p>
      </section>
      {[...byStage].map(([stage, rules]) => (
        <section className="player-rule-stage" key={stage} data-player-rule-stage={stage}>
          <h3>{STAGE_LABELS[stage]}</h3>
          <div className="player-rule-list">
            {rules.sort((left, right) => left.priority - right.priority).map((rule) => (
              <article
                className="player-craft-rule"
                key={rule.id}
                data-player-rule-id={rule.id}
                data-action-id={rule.actionId}
                data-evidence-status={rule.evidenceStatus}
                data-rule-priority={rule.priority}
                data-recovery-kind={rule.then.recoveryKind}
              >
                <div className="player-rule-command when">
                  <strong>WHEN</strong>
                  <ul>{conditionLines(rule, modifierName).map((line) => <li key={line}>{line}</li>)}</ul>
                </div>
                <div className="player-rule-command use">
                  <strong>USE</strong>
                  <p>{actionName(rule.actionId, rule.action)}</p>
                </div>
                <div className="player-rule-command then">
                  <strong>THEN</strong>
                  <p>{rule.then.summary}</p>
                  {rule.then.branches.length > 0 && (
                    <ul>{rule.then.branches.map((branch) => <li key={branch}>{branch}</li>)}</ul>
                  )}
                </div>
                <button
                  type="button"
                  className="player-rule-evidence-link"
                  onClick={() => onShowEvidence(rule.id)}
                >
                  Why this action?
                </button>
              </article>
            ))}
          </div>
        </section>
      ))}
      {craftPlan.playerFinishRule && (
        <section className="player-rule-stage" data-player-rule-stage="TERMINAL">
          <h3>{STAGE_LABELS.TERMINAL}</h3>
          <FinishRule rule={craftPlan.playerFinishRule} modifierName={modifierName} />
        </section>
      )}
    </div>
  );
}
