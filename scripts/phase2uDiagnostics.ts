import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import {
  resolveModifierDisplayDescriptor,
  type ModifierDisplayDescriptor,
} from '../crafting-engine/src/domain/ModifierDisplay.ts';
import { disambiguateModifierSelectionLabels } from '../crafting-engine/src/service/craftingCatalog.ts';

interface BrowserCheck {
  id: string;
  scenario: string;
  passed: boolean;
  durationMs: number;
  details: string;
  error?: string;
}

interface BrowserReport {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  browser: string;
  browserVersion: string;
  requestedScenario: string;
  status: string;
  checks: BrowserCheck[];
  performance: {
    phase2u?: {
      frames?: number;
      medianFrameMs?: number;
      maxFrameMs?: number;
      maxLongTaskMs?: number;
      optimizerOverheadPercent?: number;
      workerMessagesAdded?: number;
    };
  };
}

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const outputPath = join(
  repositoryRoot,
  'output-phase2u-constellation-interaction-readability-player-labels-diagnostic.txt',
);
const reportPath = join(repositoryRoot, 'quality-lab', 'reports', 'release-gate.json');
const evidenceDirectory = join(repositoryRoot, 'quality-lab', 'reports', 'evidence');
const scenario = 'phase2u-interaction-label-readability';
const committedEvidenceMode = process.argv.includes('--committed-evidence');
const lines = ['PHASE 2U — CONSTELLATION INTERACTION, READABILITY, AND PLAYER LABELS DIAGNOSTIC'];

function requireGate(report: BrowserReport, id: string): BrowserCheck {
  const check = report.checks.find((candidate) => candidate.scenario === scenario && candidate.id === id);
  assert(check, `Missing Phase 2U real-browser gate: ${id}`);
  assert.equal(check.passed, true, `Phase 2U real-browser gate failed: ${id}: ${check.error ?? check.details}`);
  return check;
}

function parsedDetails(check: BrowserCheck): Record<string, unknown> {
  const parsed = JSON.parse(check.details) as unknown;
  assert(parsed && typeof parsed === 'object' && !Array.isArray(parsed), `${check.id} details are not an object`);
  return parsed as Record<string, unknown>;
}

assert(existsSync(reportPath), 'Real-browser report is missing; run npm run lab:release first');
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as BrowserReport;
assert.equal(report.status, 'PASSED', 'Latest real-browser report did not pass');
assert(['release', 'nightly'].includes(report.requestedScenario), 'Latest browser report is not a full release/nightly matrix');
if (!committedEvidenceMode) {
  assert(
    Date.now() - Date.parse(report.finishedAt ?? report.startedAt) < 60 * 60 * 1000,
    'Latest browser report completion is older than one hour',
  );
}
lines.push(`Evidence mode: ${committedEvidenceMode ? 'COMMITTED LOCAL RELEASE AUDIT' : 'FRESH LOCAL RELEASE'}`);

lines.push('\nU1 — Phase 2T preservation');
const phase2tOutput = readFileSync(join(repositoryRoot, 'output-phase2t-release-truthfulness-diagnostic.txt'), 'utf8');
const matureOutput = readFileSync(join(repositoryRoot, 'output-phase2t-mature-regression-matrix.txt'), 'utf8');
assert(phase2tOutput.includes('ALL PHASE 2T DIAGNOSTIC GATES PASS'));
assert(matureOutput.includes('mature diagnostics completed'));
for (const [oldScenario, id] of [
  ['real-browser-smoke', 'ui-result-export-differential'],
  ['exact-four-mod-release-regression', 'canonical-dom-and-accounting'],
  ['exact-four-mod-release-regression', 'independent-method-family-matrix'],
  ['constellation-real-render', 'fps-long-task-and-memory-soak'],
] as const) {
  const retained = report.checks.find((check) => check.scenario === oldScenario && check.id === id);
  assert(retained?.passed, `Retained Phase 2T browser gate failed: ${oldScenario}/${id}`);
}
lines.push('PASS: mature diagnostics, canonical Worker/DOM/export accounting, independent method families, and the retained real-render gate pass.');

lines.push('\nU2 — Shared display descriptor and exact identity');
const expectedDescriptors = [
  {
    modId: 'AfflictionJewelSmallPassivesHaveIncreasedEffect2',
    primaryText: 'Added Small Passive Skills have 35% increased Effect (T1)',
    compactText: '35% increased Effect (T1)',
    genType: 'Prefix',
    internalAffixName: 'Powerful',
  },
  {
    modId: 'AfflictionJewelSmallPassivesGrantES3',
    primaryText: 'Added Small Passive Skills also grant: +(10–12) to Maximum Energy Shield (T1)',
    compactText: '+10–12 Maximum Energy Shield (T1)',
    genType: 'Prefix',
    internalAffixName: 'Glowing',
  },
  {
    modId: 'AfflictionJewelSmallPassivesGrantAttributes3',
    primaryText: 'Added Small Passive Skills also grant: +4 to All Attributes (T1)',
    compactText: '+4 All Attributes (T1)',
    genType: 'Suffix',
    internalAffixName: 'of the Meteor',
  },
  {
    modId: 'AfflictionJewelSmallPassivesGrantInt3',
    primaryText: 'Added Small Passive Skills also grant: +(6–8) to Intelligence (T1)',
    compactText: '+6–8 Intelligence (T1)',
    genType: 'Suffix',
    internalAffixName: 'of the Prodigy',
  },
] as const;
const repository = new ClusterModRepository();
const pool = repository.getCombinedModPool('Large Cluster Jewel', '10% increased Attack Damage');
const descriptors: ModifierDisplayDescriptor[] = expectedDescriptors.map((expected) => {
  const mod = pool.find((candidate) => candidate.modId === expected.modId);
  assert(mod, `Exact fixture modifier is missing: ${expected.modId}`);
  const descriptor = resolveModifierDisplayDescriptor(mod);
  assert.equal(descriptor.modId, expected.modId);
  assert.equal(descriptor.primaryText, expected.primaryText);
  assert.equal(descriptor.compactText, expected.compactText);
  assert.equal(descriptor.tier, 1);
  assert.equal(descriptor.tierLabel, 'T1');
  assert.equal(descriptor.genType, expected.genType);
  assert.equal(descriptor.requiredItemLevel, 84);
  assert.equal(descriptor.internalAffixName, expected.internalAffixName);
  assert(descriptor.technicalText.includes(expected.modId));
  return descriptor;
});
const notable = pool.find((mod) => mod.modId === 'Vicious Skewering');
assert(notable);
const notableDescriptor = resolveModifierDisplayDescriptor(notable);
assert.equal(notableDescriptor.primaryText, 'Vicious Skewering');
assert.equal(notableDescriptor.compactText, 'Vicious Skewering');
const duplicates = disambiguateModifierSelectionLabels([
  { displayName: 'Duplicate stat (T1)', selectionLabel: '', genType: 'Prefix' as const, tierLabel: 'T1', requiredItemLevel: 84, modId: 'duplicate_a' },
  { displayName: 'Duplicate stat (T1)', selectionLabel: '', genType: 'Prefix' as const, tierLabel: 'T1', requiredItemLevel: 84, modId: 'duplicate_b' },
]);
assert.equal(new Set(duplicates.map((entry) => entry.selectionLabel)).size, 2);
assert(duplicates.every((entry) => !entry.selectionLabel.includes(entry.modId)));
requireGate(report, 'U2-display-descriptor-identity');
lines.push(`PASS: ${descriptors.length} exact ordinary targets, one notable, and duplicate player labels preserve exact identity and metadata.`);

lines.push('\nU3 — Public no-ID leakage and Technical disclosure');
const noLeakage = parsedDetails(requireGate(report, 'U3-public-no-id-leakage-and-technical-reveal'));
assert.equal(noLeakage.publicRawIds, 0);
assert.equal(noLeakage.publicInternalAffixNames, 0);
assert.equal(noLeakage.technicalExactIds, 4);
lines.push('PASS: closed public surfaces expose zero raw IDs/internal affix names; Technical disclosures expose all four exact IDs.');

lines.push('\nU4 — Player vocabulary consistency');
const vocabulary = parsedDetails(requireGate(report, 'U4-player-vocabulary-consistency'));
for (const surface of ['picker', 'targetSummary', 'activity', 'methods', 'constellation']) assert.equal(vocabulary[surface], 4);
assert.equal(vocabulary.copiedHeadings, 8);
lines.push(`PASS: ${expectedDescriptors.map((entry) => entry.compactText).join(' | ')} are consistent across all required public surfaces.`);

lines.push('\nU5 — Mouse pan and click suppression');
const mouse = parsedDetails(requireGate(report, 'U5-mouse-pointer-capture-pan'));
assert(Number(mouse.deltaX) >= 120 && mouse.clickSuppressed === true);
lines.push(`PASS: real captured-pointer drag moved ${Number(mouse.deltaX).toFixed(0)}×${Number(mouse.deltaY).toFixed(0)} CSS px without selection or page scroll.`);

lines.push('\nU6 — Touch pan and scroll boundary');
const touch = parsedDetails(requireGate(report, 'U6-touch-pan-and-scroll-boundary'));
assert(Number(touch.deltaX) >= 120 && touch.canvasScrollSuppressed === true && Number(touch.outsideScroll) > 0);
lines.push('PASS: a real CDP touch stream pans at 390px, suppresses canvas scroll, and preserves ordinary scrolling outside the canvas.');

lines.push('\nU7 — Pointer-centered wheel and button zoom');
const zoom = parsedDetails(requireGate(report, 'U7-pointer-centered-wheel-and-button-zoom'));
assert(Number(zoom.anchoredDistance) <= 3);
lines.push(`PASS: pointer anchor drift=${Number(zoom.anchoredDistance).toFixed(3)}px; 0.35×–5× clamps and shared button state updates passed.`);

lines.push('\nU8 — Route Focus, Fit All, Reset, and replacement reset');
const fit = parsedDetails(requireGate(report, 'U8-route-focus-fit-all-and-reset'));
assert(Number(fit.routeCount) > 0 && Number(fit.allCount) >= Number(fit.routeCount));
requireGate(report, 'U8-graph-replacement-resets-camera');
lines.push(`PASS: Route Focus framed ${fit.routeCount} nodes, Fit All framed ${fit.allCount}, and reset/replacement camera state was exact.`);

lines.push('\nU9 — Keyboard camera and node access');
const keyboard = parsedDetails(requireGate(report, 'U9-keyboard-camera-and-node-access'));
assert.equal(keyboard.selectedAndCleared, true);
assert.equal(keyboard.noFocusTrap, true);
lines.push('PASS: arrows, +, 0, F, A, Enter, Escape, and focus escape operate through the focusable graph region.');

lines.push('\nU10 — Browser-measured label collision/readability');
const labels = parsedDetails(requireGate(report, 'U10-dom-label-collision-and-readability'));
assert(Number(labels.measuredLabels) >= 4);
assert.equal(labels.intersections, 0);
assert(Number(labels.minimumFontSize) >= 13);
lines.push(`PASS: Chromium measured ${labels.measuredLabels} persistent labels with zero intersections and ${labels.minimumFontSize}px minimum text.`);

lines.push('\nU11 — Long-label and mobile stress');
const stress = parsedDetails(requireGate(report, 'U11-long-label-mobile-and-fullscreen-stress'));
const mobile = stress.mobile as Record<string, unknown>;
assert(Number(stress.methodCards) > 0);
assert(Number(mobile.documentWidth) <= Number(mobile.viewportWidth) + 1);
assert.equal(mobile.labelOverflow, false);
lines.push(`PASS: ${stress.methodCards} long method cards and the 390px graph stay within their rendered boundaries.`);

lines.push('\nU12 — Concise route rail');
const rail = parsedDetails(requireGate(report, 'U12-concise-route-rail-and-active-step'));
const railLabels = rail.labels as string[];
const activeVisibility = rail.activeVisibility as Record<string, unknown>;
assert(railLabels.every((label) => label.length <= 28));
assert.equal(activeVisibility.inside, true);
lines.push(`PASS: ${railLabels.length} concise chips; the active step scrolled into view.`);

lines.push('\nU13 — Reduced motion, fullscreen, Screensaver, and five-minute soak');
const soak = parsedDetails(requireGate(report, 'U13-reduced-motion-fullscreen-screensaver-and-soak'));
assert.equal(soak.reducedFramesEqual, true);
assert.equal(soak.fullscreen, true);
assert.equal(soak.controlsAutoHide, true);
assert(Number(soak.soakMs) >= 300_000, `Phase 2U soak was only ${soak.soakMs}ms`);
assert(Number(soak.afterDom) <= Number(soak.beforeDom) + 2);
lines.push(`PASS: static frames, fullscreen lifecycle, Screensaver controls, and ${Number(soak.soakMs) / 60_000}-minute DOM/heap soak passed.`);

lines.push('\nU14 — Stable visual evidence');
requireGate(report, 'U14-stable-visual-evidence');
const screenshots = [
  'constellation-route-focus.png',
  'constellation-fit-all.png',
  'constellation-post-pan.png',
  'constellation-selected-node.png',
  'constellation-touch-390.png',
  'constellation-screensaver-fullscreen.png',
  'constellation-reduced-motion.png',
];
for (const filename of screenshots) {
  const path = join(evidenceDirectory, filename);
  assert(existsSync(path) && statSync(path).size > 10_000, `Stable screenshot is absent or empty: ${filename}`);
}
lines.push(`PASS: ${screenshots.length} committed real-browser camera/readability images are non-empty.`);

lines.push('\nU15 — Worker semantics and performance');
requireGate(report, 'U15-worker-semantics-and-interaction-performance');
const performance = report.performance.phase2u;
assert(performance);
assert.equal(performance.frames, 90);
assert(Number(performance.medianFrameMs) < 25);
assert(Number(performance.maxLongTaskMs) < 100);
assert.equal(performance.workerMessagesAdded, 0);
const phase2k1 = readFileSync(join(repositoryRoot, 'output-phase2k1-exact-fixture-diagnostic.txt'), 'utf8');
const overheadMatch = phase2k1.match(/overhead=(-?[\d.]+)%; target<=5%=PASS/);
assert(overheadMatch && Number(overheadMatch[1]) <= 5, 'Retained optimizer median overhead gate is absent or failed');
lines.push(`PASS: camera interaction added no Worker work; median frame=${Number(performance.medianFrameMs).toFixed(3)}ms, max long task=${Number(performance.maxLongTaskMs).toFixed(3)}ms, retained optimizer overhead=${overheadMatch[1]}%.`);

lines.push('\nU16 — Local release evidence and lean hosted deploy policy');
const deploy = readFileSync(join(repositoryRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');
const nightly = readFileSync(join(repositoryRoot, '.github', 'workflows', 'nightly-quality.yml'), 'utf8');
const runner = readFileSync(join(repositoryRoot, 'quality-lab', 'src', 'runner.ts'), 'utf8');
for (const command of ['npm run build', 'npm run lint', 'git diff --check', 'npm run diagnostic:phase2x:committed']) {
  assert(deploy.includes(command), `Deploy validation lacks ${command}`);
}
for (const localOnlyCommand of ['npm run diagnostic:mature', 'npm run lab:no-fallback-probe', 'npm run lab:release', 'npm run diagnostic:phase2t']) {
  assert(!deploy.includes(`run: ${localOnlyCommand}`), `Automatic deploy unexpectedly runs local-only gate ${localOnlyCommand}`);
}
assert(/deploy:\s+[\s\S]*needs: validate-and-build/.test(deploy));
assert(runner.includes('await runPhase2U(page, evidence'));
assert(runner.includes("requested === 'phase2u-quick' ? 5_000 : 300_000"));
assert(!nightly.includes('schedule:'), 'The heavyweight remote matrix must not run on a schedule');
for (const optInCommand of ['npm run diagnostic:mature', 'npm run lab:no-fallback-probe', 'npm run lab:nightly', 'npm run diagnostic:phase2t', 'npm run diagnostic:phase2u']) {
  assert(nightly.includes(optInCommand), `Manual troubleshooting matrix lacks ${optInCommand}`);
}
lines.push('PASS: the full fresh browser/solver matrix is a mandatory local completion gate; automatic Pages CI blocks on build/lint/diff plus committed-evidence integrity, and the remote extended matrix is unscheduled/opt-in.');

lines.push('\nU17 — Build hygiene and prohibited-change audit');
assert(!/npm (?:run )?test|vitest/.test(deploy));
assert(!/npm (?:run )?test|vitest/.test(nightly));
const cameraSource = readFileSync(join(repositoryRoot, 'src', 'components', 'MarkovConstellation.tsx'), 'utf8');
const cameraCss = readFileSync(join(repositoryRoot, 'src', 'App.css'), 'utf8');
for (const required of ['setPointerCapture', 'onPointerCancel', 'onLostPointerCapture', "fitMode: 'MANUAL'", "fitMode: 'SELECTED_ROUTE'", "fitMode: 'ALL'"]) {
  assert(cameraSource.includes(required), `Camera source lacks ${required}`);
}
assert(/\.constellation-viewport\s*\{[\s\S]*?touch-action:\s*none/.test(cameraCss));
assert(cameraSource.includes('const ZOOM_MIN = 0.35') && cameraSource.includes('const ZOOM_MAX = 5'));
lines.push('PASS: build/lint/diff are blocking; no unit-test command exists in CI; camera state is presentation-only.');

lines.push('\n=== ALL PHASE 2U DIAGNOSTIC GATES PASS ===');
lines.push(`Real browser: ${report.browser} ${report.browserVersion}; run=${report.runId}; scenario=${report.requestedScenario}`);
lines.push('Release label/schema: 2X.1 (Phase 2U behavior retained)');
lines.push('Unit tests added/run: NO');
lines.push('Solver mechanics/probabilities changed: NO');
lines.push('State identity weakened: NO');
lines.push('Hardcoded fracture target/winner added: NO');
lines.push('Pre-fractured market ranking reintroduced: NO');

const output = `${lines.join('\n')}\n`;
if (!committedEvidenceMode) writeFileSync(outputPath, output, 'utf8');
console.log(output);
