import rawClusterData from '../data/poedb-cluster-mods.json';
import {
  ClusterModRepository,
  type RawClusterData,
} from '../../crafting-engine/src/data/clusterModRepository.ts';
import { CraftingCatalog } from '../../crafting-engine/src/service/craftingCatalog.ts';
import { OptimizerService } from '../../crafting-engine/src/service/optimizerService.ts';
import type { OptimizeCraftInput } from '../../crafting-engine/src/service/optimizerService.ts';
import { validateOptimizeCraftInput } from '../../crafting-engine/src/service/optimizerValidation.ts';

const repository = new ClusterModRepository(rawClusterData as RawClusterData);

export const browserCraftingCatalog = new CraftingCatalog(repository);

/** One browser-safe service instance; workers reuse its repository caches. */
export function createBrowserOptimizerService(): OptimizerService {
  return new OptimizerService(repository);
}

export function validateBrowserOptimizeInput(input: OptimizeCraftInput) {
  return validateOptimizeCraftInput(repository, input);
}
