import { describe, it, expect } from 'vitest';
import { ClusterModRepository } from '../../src/data/loadClusterMods.ts';
import { ModPool } from '../../src/domain/ModPool.ts';
import type { ItemState } from '../../src/domain/ItemState.ts';
import { toRolledMod } from '../../src/domain/Mod.ts';
import { getEligibleMods, calculateTotalWeight } from '../../src/rules/modEligibility.ts';

describe('Regression Benchmarks: Reference Crafts A & B', () => {
  const repo = new ClusterModRepository();

  describe('Reference Craft A (12-Passive Shield Cluster, ilvl 84)', () => {
    const shieldPool = ModPool.forCluster(
      repo,
      'Large Cluster Jewel',
      '12% increased Attack Damage while holding a Shield'
    );

    it('pins exact initial weights for Reference Craft A', () => {
      const stateA0: ItemState = {
        baseType: 'Large Cluster Jewel',
        clusterType: '12% increased Attack Damage while holding a Shield',
        itemLevel: 84,
        passiveCount: 12,
        rarity: 'rare',
        prefixes: [],
        suffixes: [],
        fracturedModIds: [],
      };

      const eligible = getEligibleMods(stateA0, shieldPool.getAllMods());
      const prefixes = eligible.filter((m) => m.genType === 'Prefix');
      const suffixes = eligible.filter((m) => m.genType === 'Suffix');
      const notables = eligible.filter((m) => m.isNotable);

      expect(prefixes.length).toBe(33);
      expect(calculateTotalWeight(prefixes)).toBe(12502);

      expect(suffixes.length).toBe(39);
      expect(calculateTotalWeight(suffixes)).toBe(15650);

      expect(calculateTotalWeight(eligible)).toBe(28152); // Exact total weight invariant
      expect(notables.length).toBe(16);
      expect(calculateTotalWeight(notables)).toBe(6002);
    });

    it('pins step-by-step target mod weights and remaining pool dynamics', () => {
      const stateA0: ItemState = {
        baseType: 'Large Cluster Jewel',
        clusterType: '12% increased Attack Damage while holding a Shield',
        itemLevel: 84,
        passiveCount: 12,
        rarity: 'rare',
        prefixes: [],
        suffixes: [],
        fracturedModIds: [],
      };

      const t1Int = shieldPool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;
      const t1ES = shieldPool.findModById('AfflictionJewelSmallPassivesGrantES3')!;
      const eff35 = shieldPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;
      const attr4 = shieldPool.findModById('AfflictionJewelSmallPassivesGrantAttributes3')!;

      // State 1: Fractured T1 Int
      const stateA1: ItemState = {
        ...stateA0,
        suffixes: [toRolledMod(t1Int, { isFractured: true, currentRoll: [8] })],
        fracturedModIds: [t1Int.modId],
      };
      const eligibleA1 = getEligibleMods(stateA1, shieldPool.getAllMods());
      const preA1 = eligibleA1.filter((m) => m.genType === 'Prefix');
      const sufA1 = eligibleA1.filter((m) => m.genType === 'Suffix');

      expect(calculateTotalWeight(preA1)).toBe(12502);
      expect(calculateTotalWeight(sufA1)).toBe(14450); // 15650 - (500+400+300) = 14450

      // State 2: + T1 ES
      const stateA2: ItemState = {
        ...stateA1,
        prefixes: [toRolledMod(t1ES, { currentRoll: [12] })],
      };
      const eligibleA2 = getEligibleMods(stateA2, shieldPool.getAllMods());
      const preA2 = eligibleA2.filter((m) => m.genType === 'Prefix');

      expect(calculateTotalWeight(preA2)).toBe(11302); // 12502 - (500+400+300) = 11302

      // State 3: + 35% Effect (Prefixes full: 2/2)
      const stateA3: ItemState = {
        ...stateA2,
        prefixes: [...stateA2.prefixes, toRolledMod(eff35)],
      };
      const eligibleA3 = getEligibleMods(stateA3, shieldPool.getAllMods());
      const preA3 = eligibleA3.filter((m) => m.genType === 'Prefix');
      const sufA3 = eligibleA3.filter((m) => m.genType === 'Suffix');

      expect(preA3.length).toBe(0); // 2 prefixes max on Rare cluster
      expect(calculateTotalWeight(sufA3)).toBe(14450);

      // State 4: + +4 All Attributes (Terminal full 2P/2S)
      const stateA4: ItemState = {
        ...stateA3,
        suffixes: [...stateA3.suffixes, toRolledMod(attr4, { currentRoll: [4] })],
      };
      const eligibleA4 = getEligibleMods(stateA4, shieldPool.getAllMods());
      expect(eligibleA4.length).toBe(0); // Item is full
    });
  });

  describe('Reference Craft B (8-Passive Cold Cluster, ilvl 83)', () => {
    const coldPool = ModPool.forCluster(
      repo,
      'Large Cluster Jewel',
      '12% increased Cold Damage'
    );

    it('pins exact initial weights for Reference Craft B', () => {
      const stateB0: ItemState = {
        baseType: 'Large Cluster Jewel',
        clusterType: '12% increased Cold Damage',
        itemLevel: 83,
        passiveCount: 8,
        rarity: 'rare',
        prefixes: [],
        suffixes: [],
        fracturedModIds: [],
      };

      const eligible = getEligibleMods(stateB0, coldPool.getAllMods());
      const prefixes = eligible.filter((m) => m.genType === 'Prefix');
      const suffixes = eligible.filter((m) => m.genType === 'Suffix');
      const notables = eligible.filter((m) => m.isNotable);

      expect(prefixes.length).toBe(24);
      expect(calculateTotalWeight(prefixes)).toBe(7955);

      expect(suffixes.length).toBe(27);
      expect(calculateTotalWeight(suffixes)).toBe(11453);

      expect(calculateTotalWeight(eligible)).toBe(19408); // Exact total weight invariant
      expect(notables.length).toBe(14);
      expect(calculateTotalWeight(notables)).toBe(2908);
    });

    it('pins step-by-step notable additions and notable capacity cap', () => {
      const stateB0: ItemState = {
        baseType: 'Large Cluster Jewel',
        clusterType: '12% increased Cold Damage',
        itemLevel: 83,
        passiveCount: 8,
        rarity: 'rare',
        prefixes: [],
        suffixes: [],
        fracturedModIds: [],
      };

      const bs = coldPool.findModByName('Blanketed Snow')!;
      const ph = coldPool.findModByName('Prismatic Heart')!;
      const wd = coldPool.findModByName('Widespread Destruction')!;

      // State 1: + Blanketed Snow
      const stateB1: ItemState = {
        ...stateB0,
        prefixes: [toRolledMod(bs)],
      };
      const eligibleB1 = getEligibleMods(stateB1, coldPool.getAllMods());
      const preB1 = eligibleB1.filter((m) => m.genType === 'Prefix');
      expect(calculateTotalWeight(preB1)).toBe(7860); // 7955 - 95 = 7860

      // State 2: + Prismatic Heart (Prefixes full: 2/2)
      const stateB2: ItemState = {
        ...stateB1,
        prefixes: [...stateB1.prefixes, toRolledMod(ph)],
      };
      const eligibleB2 = getEligibleMods(stateB2, coldPool.getAllMods());
      const preB2 = eligibleB2.filter((m) => m.genType === 'Prefix');
      const sufB2 = eligibleB2.filter((m) => m.genType === 'Suffix');
      expect(preB2.length).toBe(0);
      expect(calculateTotalWeight(sufB2)).toBe(11453);

      // State 3: + Widespread Destruction (3/3 notables full)
      const stateB3: ItemState = {
        ...stateB2,
        suffixes: [toRolledMod(wd)],
      };
      const eligibleB3 = getEligibleMods(stateB3, coldPool.getAllMods());
      expect(eligibleB3.some((m) => m.isNotable)).toBe(false); // No notables eligible
      expect(eligibleB3.length).toBe(24);
      // Suffix notables at ilvl 83: Widespread Destruction (505), Disorienting Display (253), Doryani's Lesson (95) = 853
      // Total suffix weight (11453) - suffix notables (853) = 10600 non-notable suffix fillers
      expect(calculateTotalWeight(eligibleB3)).toBe(10600);

      // State 4: + Suffix filler (Terminal full 2P/2S)
      const suffixFiller = eligibleB3[0];
      const stateB4: ItemState = {
        ...stateB3,
        suffixes: [...stateB3.suffixes, toRolledMod(suffixFiller)],
      };
      const eligibleB4 = getEligibleMods(stateB4, coldPool.getAllMods());
      expect(eligibleB4.length).toBe(0); // Full 4-mod item
    });
  });
});
