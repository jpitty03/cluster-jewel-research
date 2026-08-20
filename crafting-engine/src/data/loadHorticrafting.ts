import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface HorticraftingCostItem {
  item: string;
  itemId: string;
  amount: number;
}

export interface HorticraftingCraft {
  description: string;
  action: string | null;
  modTag: string | null;
  tagClasses: string[];
  proportionalToStackSize: boolean;
  cost: HorticraftingCostItem[];
  lifeforce: {
    type: 'Wild' | 'Vivid' | 'Primal';
    amount: number;
  } | null;
}

export interface HorticraftingData {
  fetchedAt: string;
  source: string;
  count: number;
  crafts: HorticraftingCraft[];
}

export class HorticraftingRepository {
  private data: HorticraftingData;

  constructor(customData?: HorticraftingData) {
    if (customData) {
      this.data = customData;
    } else {
      const currentDir = dirname(fileURLToPath(import.meta.url));
      const projectRoot = join(currentDir, '..', '..', '..');
      const canonicalPath = join(projectRoot, 'data', 'poedb-horticrafting.json');
      const content = readFileSync(canonicalPath, 'utf-8');
      this.data = JSON.parse(content);
    }
  }

  getAllCrafts(): HorticraftingCraft[] {
    return this.data.crafts;
  }

  getReforgeCraft(targetTag: string): HorticraftingCraft | undefined {
    const norm = targetTag.toLowerCase();
    return this.data.crafts.find((c) => {
      if (c.action !== 'Reforge') return false;
      if (c.modTag && c.modTag.toLowerCase() === norm) return true;
      if (c.tagClasses && c.tagClasses.some((t) => t.replace('crafting', '').toLowerCase() === norm)) {
        return true;
      }
      return false;
    });
  }
}
