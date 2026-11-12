import type { Mod, GenType } from './Mod.ts';
import type { BaseType } from './ItemState.ts';
import type { ClusterModRepository } from '../data/clusterModRepository.ts';

export class ModPool {
  private mods: Mod[];
  private prefixes: Mod[];
  private suffixes: Mod[];

  constructor(mods: Mod[]) {
    // Interchangeability classes for non-target mods (see ExclusionClass). Only groups that
    // partition the pool cleanly qualify: every member must belong to exactly that one group,
    // otherwise two occupied groups could overlap and the removed weight would not be additive.
    const membersByGroup = new Map<string, Mod[]>();
    const multiGroup = new Set<string>();
    for (const mod of mods) {
      const groups = mod.modGroups?.length > 0 ? mod.modGroups : [mod.modGroup];
      for (const group of groups) {
        const members = membersByGroup.get(group) ?? [];
        members.push(mod);
        membersByGroup.set(group, members);
        if (groups.length !== 1) multiGroup.add(group);
      }
    }
    for (const [group, members] of membersByGroup) {
      if (multiGroup.has(group)) continue;
      const exclusionClass = {
        signature: members
          .map((member) =>
            `${member.genType === 'Prefix' ? 'P' : 'S'}${member.isNotable ? 'N' : ''}@${member.ilvl}x${member.weight}`)
          .sort()
          .join(','),
        memberIds: new Set(members.map((member) => member.modId)),
        memberNames: new Set(members.map((member) => member.name)),
      };
      for (const member of members) member.exclusionClass = exclusionClass;
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
