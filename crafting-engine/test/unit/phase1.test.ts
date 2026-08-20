import { describe, it, expect } from 'vitest';
import { ClusterModRepository } from '../../src/data/loadClusterMods.ts';
import { ModPool } from '../../src/domain/ModPool.ts';
import type { ItemState } from '../../src/domain/ItemState.ts';
import { toRolledMod, type RolledMod } from '../../src/domain/Mod.ts';
import { cloneItemState, getRemovableAffixes } from '../../src/domain/ItemState.ts';
import { getEligibleMods } from '../../src/rules/modEligibility.ts';
import { canAcceptPrefix, canAcceptSuffix, canAcceptNotable, getMaxPrefixes, getMaxSuffixes, getMaxNotables } from '../../src/rules/affixRules.ts';
import { generateStateKey } from '../../src/solver/stateKey.ts';
import { expectedDivinesToReach } from '../../src/rules/rangeRolls.ts';
import { satisfiesTarget, type TargetDefinition } from '../../src/domain/TargetDefinition.ts';

function createDummyMod(options: {
  modId: string;
  name: string;
  genType: 'Prefix' | 'Suffix';
  modGroup: string;
  tier?: number;
  isFractured?: boolean;
  isNotable?: boolean;
}): RolledMod {
  return {
    modId: options.modId,
    name: options.name,
    genType: options.genType,
    modGroup: options.modGroup,
    modGroups: [options.modGroup],
    tier: options.tier ?? 1,
    statText: options.name,
    statValues: [],
    isFractured: options.isFractured ?? false,
    isNotable: options.isNotable ?? false,
  };
}

describe('Phase 1: Domain Model & Mod Eligibility Engine', () => {
  const repo = new ClusterModRepository();
  const shieldPool = ModPool.forCluster(
    repo,
    'Large Cluster Jewel',
    '12% increased Attack Damage while holding a Shield'
  );
  const coldPool = ModPool.forCluster(
    repo,
    'Large Cluster Jewel',
    '12% increased Cold Damage'
  );

  // 1. ilvl 83 cannot roll ilvl 84 mods
  it('1. ilvl 83 cannot roll ilvl 84 mods', () => {
    const state83: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 83,
      rarity: 'rare',
      prefixes: [],
      suffixes: [],
      fracturedModIds: [],
    };

    const eligible = getEligibleMods(state83, shieldPool.getAllMods());
    const ilvl84Mods = eligible.filter((m) => m.ilvl >= 84);
    expect(ilvl84Mods.length).toBe(0);

    // Specifically verify 35% Effect (ilvl 84) and T1 ES (ilvl 84) and T1 Int (ilvl 84) are not eligible
    expect(eligible.some((m) => m.name === 'Powerful' || m.statText.includes('35% increased Effect'))).toBe(false);
    expect(eligible.some((m) => m.name === 'Glowing' || m.statText.includes('+(10—12) to Maximum Energy Shield'))).toBe(false);
    expect(eligible.some((m) => m.name === 'of the Prodigy' || m.statText.includes('+(6—8) to Intelligence'))).toBe(false);
  });

  // 2. ilvl 84 can roll 35% Effect
  it('2. ilvl 84 can roll 35% Effect', () => {
    const state84: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [],
      suffixes: [],
      fracturedModIds: [],
    };

    const eligible = getEligibleMods(state84, shieldPool.getAllMods());
    const effect35 = eligible.find((m) => m.name === 'Powerful' || m.statText.includes('35% increased Effect'));
    expect(effect35).toBeDefined();
    expect(effect35?.ilvl).toBe(84);
    expect(effect35?.genType).toBe('Prefix');
    expect(effect35?.weight).toBe(300);
  });

  // 3. T1 ES blocks T2/T3 ES
  it('3. T1 ES blocks T2/T3 ES', () => {
    const esT1 = shieldPool.findModById('AfflictionJewelSmallPassivesGrantES3')!;
    expect(esT1).toBeDefined();

    const stateWithT1ES: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [toRolledMod(esT1)],
      suffixes: [],
      fracturedModIds: [],
    };

    const eligible = getEligibleMods(stateWithT1ES, shieldPool.getAllMods());
    const anyESMod = eligible.filter((m) => m.modGroup === esT1.modGroup);
    expect(anyESMod.length).toBe(0);
  });

  // 4. T1 Intelligence blocks lower Intelligence tiers
  it('4. T1 Intelligence blocks lower Intelligence tiers', () => {
    const intT1 = shieldPool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;
    expect(intT1).toBeDefined();

    const stateWithT1Int: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [],
      suffixes: [toRolledMod(intT1)],
      fracturedModIds: [],
    };

    const eligible = getEligibleMods(stateWithT1Int, shieldPool.getAllMods());
    const anyIntMod = eligible.filter((m) => m.modGroup === intT1.modGroup);
    expect(anyIntMod.length).toBe(0);
  });

  // 5. 35% Effect blocks 25% Effect
  it('5. 35% Effect blocks 25% Effect', () => {
    const eff35 = shieldPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;
    expect(eff35).toBeDefined();

    const stateWithEff35: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [toRolledMod(eff35)],
      suffixes: [],
      fracturedModIds: [],
    };

    const eligible = getEligibleMods(stateWithEff35, shieldPool.getAllMods());
    const anyEffMod = eligible.filter((m) => m.modGroup === eff35.modGroup);
    expect(anyEffMod.length).toBe(0);
  });

  // 6. a full prefix side (2 prefixes on Rare cluster jewel) cannot accept another prefix
  it('6. a full prefix side (2 prefixes on Rare cluster jewel) cannot accept another prefix', () => {
    expect(getMaxPrefixes('rare')).toBe(2);
    expect(getMaxSuffixes('rare')).toBe(2);

    const state2Prefix: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [
        createDummyMod({ modId: 'P1', name: 'Prefix1', genType: 'Prefix', modGroup: 'G1' }),
        createDummyMod({ modId: 'P2', name: 'Prefix2', genType: 'Prefix', modGroup: 'G2' }),
      ],
      suffixes: [],
      fracturedModIds: [],
    };

    expect(canAcceptPrefix(state2Prefix)).toBe(false);
    expect(canAcceptSuffix(state2Prefix)).toBe(true);

    const eligible = getEligibleMods(state2Prefix, shieldPool.getAllMods());
    const eligiblePrefixes = eligible.filter((m) => m.genType === 'Prefix');
    expect(eligiblePrefixes.length).toBe(0);
    expect(eligible.length).toBeGreaterThan(0); // Suffixes still eligible
  });

  // 7. a full suffix side (2 suffixes on Rare cluster jewel) cannot accept another suffix
  it('7. a full suffix side (2 suffixes on Rare cluster jewel) cannot accept another suffix', () => {
    const state2Suffix: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [],
      suffixes: [
        createDummyMod({ modId: 'S1', name: 'Suffix1', genType: 'Suffix', modGroup: 'G1' }),
        createDummyMod({ modId: 'S2', name: 'Suffix2', genType: 'Suffix', modGroup: 'G2' }),
      ],
      fracturedModIds: [],
    };

    expect(canAcceptPrefix(state2Suffix)).toBe(true);
    expect(canAcceptSuffix(state2Suffix)).toBe(false);

    const eligible = getEligibleMods(state2Suffix, shieldPool.getAllMods());
    const eligibleSuffixes = eligible.filter((m) => m.genType === 'Suffix');
    expect(eligibleSuffixes.length).toBe(0);
    expect(eligible.length).toBeGreaterThan(0); // Prefixes still eligible
  });

  // 8. fractured mods remain present when constructing derived states
  it('8. fractured mods remain present when constructing derived states', () => {
    const intT1 = shieldPool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;
    const state: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [
        createDummyMod({ modId: 'P1', name: 'Random Prefix', genType: 'Prefix', modGroup: 'GP1' }),
      ],
      suffixes: [
        toRolledMod(intT1, { isFractured: true }),
      ],
      fracturedModIds: [intT1.modId],
    };

    const cloned = cloneItemState(state);
    expect(cloned.fracturedModIds).toContain(intT1.modId);
    expect(cloned.suffixes[0].isFractured).toBe(true);

    const removable = getRemovableAffixes(state);
    expect(removable.length).toBe(1);
    expect(removable[0].modId).toBe('P1');
  });

  // 9. Cold Damage cluster notable pool contains and correctly identifies notables
  it('9. Cold Damage cluster notable pool contains and correctly identifies notables', () => {
    const blankSnow = coldPool.findModByName('Blanketed Snow');
    const prismHeart = coldPool.findModByName('Prismatic Heart');
    const wideDest = coldPool.findModByName('Widespread Destruction');

    expect(blankSnow).toBeDefined();
    expect(blankSnow?.isNotable).toBe(true);
    expect(blankSnow?.genType).toBe('Prefix');
    expect(blankSnow?.ilvl).toBe(68);
    expect(blankSnow?.weight).toBe(95);

    expect(prismHeart).toBeDefined();
    expect(prismHeart?.isNotable).toBe(true);
    expect(prismHeart?.genType).toBe('Prefix');
    expect(prismHeart?.ilvl).toBe(1);
    expect(prismHeart?.weight).toBe(505);

    expect(wideDest).toBeDefined();
    expect(wideDest?.isNotable).toBe(true);
    expect(wideDest?.genType).toBe('Suffix');
    expect(wideDest?.ilvl).toBe(1);
    expect(wideDest?.weight).toBe(505);
  });

  // 10. item states with the same mechanically relevant mods canonicalize to the same state key regardless of insertion order
  it('10. item states canonicalize to same key regardless of insertion order and differentiate different states', () => {
    const modA = createDummyMod({ modId: 'A', name: 'Mod A', genType: 'Prefix', modGroup: 'GA' });
    const modB = createDummyMod({ modId: 'B', name: 'Mod B', genType: 'Prefix', modGroup: 'GB' });
    const modC = createDummyMod({ modId: 'C', name: 'Mod C', genType: 'Suffix', modGroup: 'GC' });
    const modD = createDummyMod({ modId: 'D', name: 'Mod D', genType: 'Suffix', modGroup: 'GD', tier: 2 });

    const state1: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'rare',
      prefixes: [modA, modB],
      suffixes: [modC, modD],
      fracturedModIds: ['A'],
    };

    const state2: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'rare',
      prefixes: [modB, modA], // reversed
      suffixes: [modD, modC], // reversed
      fracturedModIds: ['A'],
    };

    const state3: ItemState = {
      ...state1,
      passiveCount: 8, // Different passive count
    };

    const state4: ItemState = {
      ...state1,
      suffixes: [
        { ...modC, currentRoll: [6] },
        modD,
      ],
    };

    const state5: ItemState = {
      ...state1,
      suffixes: [
        { ...modC, currentRoll: [8] },
        modD,
      ],
    };

    const stateUnfractured: ItemState = {
      ...state1,
      fracturedModIds: [],
      prefixes: [
        { ...modA, isFractured: false },
        { ...modB, isFractured: false },
      ],
    };

    const stateFractured: ItemState = {
      ...state1,
      fracturedModIds: [modA.modId],
      prefixes: [
        { ...modA, isFractured: true },
        { ...modB, isFractured: false },
      ],
    };

    expect(generateStateKey(state1)).toBe(generateStateKey(state2));
    expect(generateStateKey(state1)).not.toBe(generateStateKey(state3));
    expect(generateStateKey(state4)).not.toBe(generateStateKey(state5));
    expect(generateStateKey(stateUnfractured)).not.toBe(generateStateKey(stateFractured));
  });

  // 11. Notable capacity limit (Large <= 3, Medium <= 2, Small <= 1)
  it('11. Notable capacity limit enforces max notables per base size', () => {
    expect(getMaxNotables('Large Cluster Jewel')).toBe(3);
    expect(getMaxNotables('Medium Cluster Jewel')).toBe(2);
    expect(getMaxNotables('Small Cluster Jewel')).toBe(1);

    const n1 = coldPool.findModByName('Blanketed Snow')!;
    const n2 = coldPool.findModByName('Prismatic Heart')!;
    const n3 = coldPool.findModByName('Widespread Destruction')!;

    const state3Notables: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Cold Damage',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [toRolledMod(n1), toRolledMod(n2)],
      suffixes: [toRolledMod(n3)],
      fracturedModIds: [],
    };

    expect(canAcceptNotable(state3Notables)).toBe(false);
    expect(canAcceptSuffix(state3Notables)).toBe(true); // 1 suffix slot still open (1/2)

    const eligible = getEligibleMods(state3Notables, coldPool.getAllMods());
    // Should contain eligible suffixes (like Int/All Res), but 0 notables!
    expect(eligible.some((m) => m.isNotable)).toBe(false);
    expect(eligible.length).toBeGreaterThan(0);
  });

  // 12. Tiered cluster mods normalization and cross-tier blocking
  it('12. Tiered cluster mods group correctly into tiers and block lower tiers', () => {
    const coldSpeedMods = coldPool.getAllMods().filter((m) => m.modGroup.includes('increased Attack and Cast Speed with Cold Skills'));
    expect(coldSpeedMods.length).toBe(3);

    const t1 = coldSpeedMods.find((m) => m.tier === 1);
    const t2 = coldSpeedMods.find((m) => m.tier === 2);
    const t3 = coldSpeedMods.find((m) => m.tier === 3);

    expect(t1?.ilvl).toBe(84);
    expect(t2?.ilvl).toBe(68);
    expect(t3?.ilvl).toBe(1);

    const stateWithT1Speed: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Cold Damage',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [],
      suffixes: [toRolledMod(t1!)],
      fracturedModIds: [],
    };

    const eligible = getEligibleMods(stateWithT1Speed, coldPool.getAllMods());
    expect(eligible.some((m) => m.modGroup === t1!.modGroup)).toBe(false);
  });

  // 13. TargetDefinition matching and numeric fail-closed check
  it('13. TargetDefinition matching and numeric fail-closed check', () => {
    const target: TargetDefinition = {
      requiredMods: [
        { modGroup: 'AfflictionJewelSmallPassivesGrantES', maxTierNumber: 1 },
        { modGroup: 'AfflictionJewelSmallPassivesHaveIncreasedEffect', maxTierNumber: 1 },
      ],
      acceptableAnyOf: [
        [{ modGroup: 'AfflictionJewelSmallPassivesGrantAttributes', maxTierNumber: 1 }],
        [{ modGroup: 'Added Small Passive Skills also grant: #% increased Attack Speed', maxTierNumber: 1 }],
      ],
      finalRollRequirements: [
        { modGroup: 'AfflictionJewelSmallPassivesGrantInt', minValue: 8 },
      ],
    };

    const esT1 = shieldPool.findModById('AfflictionJewelSmallPassivesGrantES3')!;
    const eff35 = shieldPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;
    const intT1 = shieldPool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;
    const attr4 = shieldPool.findModById('AfflictionJewelSmallPassivesGrantAttributes3')!;

    const stateUnrolled: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [toRolledMod(esT1), toRolledMod(eff35)],
      suffixes: [toRolledMod(intT1), toRolledMod(attr4)],
      fracturedModIds: [],
    };

    // Unrolled state fails closed on numeric requirement
    expect(satisfiesTarget(stateUnrolled, target)).toBe(false);

    // Rolled +6 fails
    const stateRolled6: ItemState = {
      ...stateUnrolled,
      suffixes: [
        toRolledMod(intT1, { currentRoll: [6] }),
        toRolledMod(attr4),
      ],
    };
    expect(satisfiesTarget(stateRolled6, target)).toBe(false);

    // Rolled +8 passes
    const stateRolled8: ItemState = {
      ...stateUnrolled,
      suffixes: [
        toRolledMod(intT1, { currentRoll: [8] }),
        toRolledMod(attr4),
      ],
    };
    expect(satisfiesTarget(stateRolled8, target)).toBe(true);
  });

  // 14. Divine roll expected cost helper
  it('14. Divine roll expected cost helper', () => {
    const expected = expectedDivinesToReach(6, 8, [8]);
    expect(expected).toBe(3);
    expect(expectedDivinesToReach(6, 8, [8], 8)).toBe(0);
    expect(expectedDivinesToReach(6, 8, [8], 6)).toBe(3);
  });
});
