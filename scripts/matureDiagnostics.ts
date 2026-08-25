import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRootUrl = new URL('..', import.meta.url);
const repositoryRoot = fileURLToPath(repositoryRootUrl);
const diagnosticFiles = [
  // Run fixed-wall-time search gates first on a cold machine. Their assertions and budgets stay
  // unchanged; later parity/Monte Carlo diagnostics are intentionally heavyweight.
  'crafting-engine/scripts/phase2jSearchDiagnostic.ts',
  'crafting-engine/scripts/phase2k1ExactFixtureDiagnostic.ts',
  'crafting-engine/scripts/coreMechanicsPhaseDiagnostic.ts',
  'crafting-engine/scripts/phase2eFractureFidelityDiagnostic.ts',
  'crafting-engine/scripts/phase2hHeraldDiagnostic.ts',
  'crafting-engine/scripts/phase2iHarvestPlanDiagnostic.ts',
  'crafting-engine/scripts/phase2iWeightPolicyDiagnostic.ts',
  'crafting-engine/scripts/phase2jHarvestParityDiagnostic.ts',
  'crafting-engine/scripts/phase2kSearchDiagnostic.ts',
  'crafting-engine/scripts/phase2lPortfolioProofDiagnostic.ts',
  'scripts/developerUiPhase2mDiagnostic.ts',
  'scripts/developerUiPhase2nDiagnostic.ts',
  'scripts/developerUiPhase2pDiagnostic.ts',
  'scripts/developerUiPhase2qDiagnostic.ts',
  'scripts/developerUiPhase2rDiagnostic.ts',
  'scripts/developerUiPhase2sDiagnostic.ts',
] as const;

const lines = ['PHASE 2T — MATURE PHASE 2E–2S NON-UNIT REGRESSION MATRIX'];
try {
  for (const relativePath of diagnosticFiles) {
    const started = Date.now();
    const url = new URL(relativePath, repositoryRootUrl);
    // Every diagnostic owns its caches, heap, and fixed wall-time budget. Process isolation
    // prevents an earlier heavyweight parity audit from changing a later gate through GC pressure.
    const isolated = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(url)], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    if (isolated.error) throw isolated.error;
    if (isolated.status !== 0) {
      throw new Error(`${relativePath} failed in its isolated process with exit code ${isolated.status}`);
    }
    lines.push(`PASS ${relativePath} (${Date.now() - started} ms)`);
  }
  lines.push(`PASS: ${diagnosticFiles.length}/${diagnosticFiles.length} mature diagnostics completed.`);
  lines.push('Simulated browser smokes counted as release evidence: NO');
  lines.push('Unit tests run: NO');
} catch (error) {
  lines.push(`FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  const outputPath = join(repositoryRoot, 'output-phase2t-mature-regression-matrix.txt');
  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  throw error;
}

const outputPath = join(repositoryRoot, 'output-phase2t-mature-regression-matrix.txt');
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
