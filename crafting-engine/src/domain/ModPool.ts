import type { Mod, GenType } from './Mod.ts';
import type { BaseType } from './ItemState.ts';
import type { ClusterModRepository } from '../data/clusterModRepository.ts';

export class ModPool {
  private mods: Mod[];
  private prefixes: Mod[];
  private suffixes: Mod[];

  constructor(mods: Mod[]) {
    const groupSignaturesByName = new Map<string, Set<string>>();
    for (const mod of mods) {
      const groups = (mod.modGroups?.length > 0 ? mod.modGroups : [mod.modGroup])
        .slice()
        .sort()
        .join('+');
      const signatures = groupSignaturesByName.get(mod.name) ?? new Set<string>();
      signatures.add(groups);
      groupSignaturesByName.set(mod.name, signatures);
    }
    for (const mod of mods) {
      if ((groupSignaturesByName.get(mod.name)?.size ?? 0) > 1) {
        // Duplicate-name exclusion is a separate legality predicate from mod-group exclusion.
        // Mark it from pool data so canonical search preserves only names that can change the
        // eligible successor pool, without any modifier-name special cases.
        mod.eligibilityNameSensitive = true;
      }
    }
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
