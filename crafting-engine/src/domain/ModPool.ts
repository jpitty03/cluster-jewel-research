import type { Mod, GenType } from './Mod.ts';
import type { BaseType } from './ItemState.ts';
import { ClusterModRepository } from '../data/loadClusterMods.ts';

export class ModPool {
  private mods: Mod[];
  private prefixes: Mod[];
  private suffixes: Mod[];

  constructor(mods: Mod[]) {
    this.mods = mods;
    this.prefixes = mods.filter((m) => m.genType === 'Prefix');
    this.suffixes = mods.filter((m) => m.genType === 'Suffix');
  }

  static forCluster(repo: ClusterModRepository, baseType: BaseType, clusterType: string): ModPool {
    const combined = repo.getCombinedModPool(baseType, clusterType);
    return new ModPool(combined);
  }

  getAllMods(): Mod[] {
    return this.mods;
  }

  getPrefixes(): Mod[] {
    return this.prefixes;
  }

  getSuffixes(): Mod[] {
    return this.suffixes;
  }

  getByGenType(genType: GenType): Mod[] {
    return genType === 'Prefix' ? this.prefixes : this.suffixes;
  }

  findModById(modId: string): Mod | undefined {
    return this.mods.find((m) => m.modId === modId);
  }

  findModByName(name: string): Mod | undefined {
    return this.mods.find((m) => m.name === name);
  }

  findModsByGroup(modGroup: string): Mod[] {
    return this.mods.filter((m) => m.modGroup === modGroup || (m.modGroups && m.modGroups.includes(modGroup)));
  }
}
