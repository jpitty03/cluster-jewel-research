import assert from 'node:assert/strict';
import {
  importedEntryMode,
  OPTIMIZER_DISCLOSURE_DEFAULTS,
  OPTIMIZER_PRIMARY_RESULT_GROUPS,
  OPTIMIZER_RESEARCH_RESULT_GROUPS,
} from '../../src/optimizerInformationArchitecture.ts';

export function runPhase3IInformationArchitectureDiagnostics() {
  assert.deepEqual(OPTIMIZER_PRIMARY_RESULT_GROUPS, [
    'Recommendation',
    'Crafting Constellation',
    'Shopping list',
  ]);
  assert.deepEqual(OPTIMIZER_RESEARCH_RESULT_GROUPS, [
    'Search & proof',
    'Alternative methods',
    'Cost & usage details',
    'Research diagnostics',
  ]);
  assert(Object.values(OPTIMIZER_DISCLOSURE_DEFAULTS).every((open) => open === false),
    'Every editor, setting, and research disclosure must default closed');

  const validImport = importedEntryMode({
    baseType: 'Large Cluster Jewel',
    clusterType: '10% increased Spell Damage',
    itemLevel: 84,
    passiveCount: 12,
    targetModCount: 3,
  });
  assert.deepEqual(validImport, { mode: 'loaded', openTargetEditor: false });

  const missingTarget = importedEntryMode({
    baseType: 'Large Cluster Jewel',
    clusterType: '10% increased Spell Damage',
    itemLevel: 84,
    passiveCount: 12,
    targetModCount: 0,
  });
  assert.deepEqual(missingTarget, { mode: 'manual', openTargetEditor: true });

  const missingIdentity = importedEntryMode({
    baseType: 'Large Cluster Jewel',
    clusterType: undefined,
    itemLevel: 84,
    passiveCount: 12,
    targetModCount: 3,
  });
  assert.deepEqual(missingIdentity, { mode: 'manual', openTargetEditor: true });

  return {
    I1: { freshPrimaryAction: 'Import optimizer JSON' },
    I2: validImport,
    I3: { targetEditorOpen: false, settingsOpen: false },
    I4: { missingTarget, missingIdentity },
    I7: { openByDefault: OPTIMIZER_PRIMARY_RESULT_GROUPS },
    I8: { closedByDefault: OPTIMIZER_RESEARCH_RESULT_GROUPS },
    I15: { presentationOnlyDefaults: OPTIMIZER_DISCLOSURE_DEFAULTS },
  };
}
