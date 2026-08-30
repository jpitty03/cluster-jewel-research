import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Recommendation {
  tags: string[];
  suites: Array<'DEV' | 'RELEASE'>;
  reasons: string[];
  commands: string[];
}

const repositoryRoot = resolve(import.meta.dirname, '..', '..');

function valueFor(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function changedPaths(): string[] {
  const base = valueFor('--base');
  const head = valueFor('--head');
  const args = base
    ? ['diff', '--name-only', base, head ?? 'HEAD']
    : ['diff', '--name-only', 'HEAD'];
  const tracked = execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean);
  if (base) return tracked;
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).split(/\r?\n/).filter(Boolean);
  return [...new Set([...tracked, ...untracked])].sort();
}

export function recommendForPaths(paths: readonly string[]): Recommendation {
  const tags = new Set<string>();
  const reasons = new Set<string>();
  const matches = (pattern: RegExp) => paths.some((path) => pattern.test(path.replaceAll('\\', '/')));
  if (matches(/^crafting-engine\/src\/rules\//)) {
    ['solver', 'worker', 'harvest', 'fracture'].forEach((tag) => tags.add(tag));
    reasons.add('Mechanics rules affect solver transitions and selected browser controls.');
  }
  if (matches(/crafting-engine\/src\/(service\/optimizerService|solver\/genericSearch)\.ts$/)) {
    ['proof', 'objectives', 'worker'].forEach((tag) => tags.add(tag));
    reasons.add('Optimizer/search changes affect canonical proof and objective selection.');
  }
  if (matches(/guidedCraftConstellation\.ts$/)) {
    ['guided-constellation', 'craft-plan', 'policy-flow', 'proof'].forEach((tag) => tags.add(tag));
    reasons.add('Guided model changes require direct evidence, real Worker reconciliation, and browser presentation coverage.');
  }
  if (matches(/(GuidedCraftConstellation\.tsx|MarkovConstellation\.tsx|VisualizationGraph\.ts|PolicyFlow\.ts|App\.css)$/)) {
    ['constellation', 'responsive', 'accessibility', 'visual'].forEach((tag) => tags.add(tag));
    reasons.add('Constellation presentation changes require renderer, interaction, and responsive coverage.');
  }
  if (matches(/(SearchableModifierSelect\.tsx|CraftOptimizer\.tsx|GuidedCraftConstellation\.tsx|App\.css)$/)) {
    tags.add('phase3l');
    reasons.add('Phase 3L surfaces require portal/validation lifecycle, compact constellation, copy, and print/PDF coverage.');
  }
  if (matches(/(ClusterJewels\.tsx|optimizerSeed\.ts|shareBundle\.ts)$/)) {
    ['handoff', 'share-export', 'responsive'].forEach((tag) => tags.add(tag));
    reasons.add('Handoff/share changes require exact round-trip and responsive controls.');
  }
  if (matches(/^quality-lab\//)) {
    reasons.add('Harness changes require static validation and a targeted DEV execution.');
  }
  if (tags.size === 0 && paths.length > 0) {
    ['worker', 'proof'].forEach((tag) => tags.add(tag));
    reasons.add('No narrow mapping matched; use the cross-boundary Worker/proof smoke.');
  }
  const sortedTags = [...tags].sort();
  const commands = sortedTags.map((tag) => `npm run -- lab:tag -- --tag ${tag}`);
  if (paths.some((path) => path.startsWith('quality-lab/'))) commands.unshift('npm run lab:typecheck');
  commands.push('npm run lab:dev');
  commands.push('npm run lab:release  # once on final source; advisory final acceptance');
  return {
    tags: sortedTags,
    suites: ['DEV', 'RELEASE'],
    reasons: [...reasons],
    commands: [...new Set(commands)],
  };
}

function main(): void {
  const paths = changedPaths();
  const recommendation = recommendForPaths(paths);
  console.log('Changed paths:');
  for (const path of paths) console.log(`  ${path}`);
  console.log(`Recommended tags: ${recommendation.tags.join(', ') || '(none)'}`);
  for (const reason of recommendation.reasons) console.log(`Reason: ${reason}`);
  console.log('Run next:');
  for (const command of recommendation.commands) console.log(`  ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
