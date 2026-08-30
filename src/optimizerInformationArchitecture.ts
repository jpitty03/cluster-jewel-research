export const OPTIMIZER_PRIMARY_RESULT_GROUPS = [
  'Recommendation',
  'Crafting Constellation',
  'Shopping list',
] as const;

export const OPTIMIZER_RESEARCH_RESULT_GROUPS = [
  'Search & proof',
  'Alternative methods',
  'Cost & usage details',
  'Research diagnostics',
] as const;

export const OPTIMIZER_DISCLOSURE_DEFAULTS = Object.freeze({
  targetEditor: false,
  settings: false,
  searchProof: false,
  alternativeMethods: false,
  costUsage: false,
  researchDiagnostics: false,
  technicalPolicyGraph: false,
});

export type OptimizerEntryMode = 'fresh' | 'loaded' | 'manual';

export function importedEntryMode(input: {
  baseType?: unknown;
  clusterType?: unknown;
  itemLevel?: unknown;
  passiveCount?: unknown;
  targetModCount: number;
}): { mode: OptimizerEntryMode; openTargetEditor: boolean } {
  const completeIdentity = Boolean(
    input.baseType && input.clusterType && input.itemLevel && input.passiveCount
  );
  const completeTarget = input.targetModCount > 0;
  return completeIdentity && completeTarget
    ? { mode: 'loaded', openTargetEditor: false }
    : { mode: 'manual', openTargetEditor: true };
}
