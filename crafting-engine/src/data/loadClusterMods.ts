import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClusterModRepository as DataBackedClusterModRepository,
  type RawClusterData,
} from './clusterModRepository.ts';

export * from './clusterModRepository.ts';

export interface LoadClusterModDataOptions {
  workingDataPath?: string;
  committedSnapshotPath?: string;
}

/** Node-only data acquisition with an explicit committed-snapshot fallback. */
export function loadClusterModData(options: LoadClusterModDataOptions = {}): RawClusterData {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = join(currentDir, '..', '..', '..');
  const candidates = [
    options.workingDataPath ?? join(projectRoot, 'data', 'poedb-cluster-mods.json'),
    options.committedSnapshotPath ?? join(projectRoot, 'src', 'data', 'poedb-cluster-mods.json'),
  ];
  const selectedPath = candidates.find((candidate) => existsSync(candidate));
  if (!selectedPath) {
    throw new Error(
      `Cluster mod data was not found. Checked: ${candidates.join(', ')}. ` +
      'Run the PoEDB scraper or restore the committed src/data snapshot.'
    );
  }

  try {
    return JSON.parse(readFileSync(selectedPath, 'utf8')) as RawClusterData;
  } catch (error) {
    throw new Error(`Failed to load cluster mod data from ${selectedPath}: ${String(error)}`);
  }
}

/** Backward-compatible Node repository used by scripts and diagnostics. */
export class ClusterModRepository extends DataBackedClusterModRepository {
  constructor(customData: RawClusterData = loadClusterModData()) {
    super(customData);
  }
}
