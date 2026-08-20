import { describe, it, expect } from 'vitest';
import { ClusterModRepository } from '../../src/data/loadClusterMods.ts';
import { ModPool } from '../../src/domain/ModPool.ts';
import type { ItemState } from '../../src/domain/ItemState.ts';
import { toRolledMod } from '../../src/domain/Mod.ts';
import { ExaltAction } from '../../src/actions/exalt.ts';
import { AnnulAction } from '../../src/actions/annul.ts';
import { FractureAction } from '../../src/actions/fracture.ts';
import { DivineAction } from '../../src/actions/divine.ts';
import { ScourAction } from '../../src/actions/scour.ts';
import { PriceBook } from '../../src/domain/PriceBook.ts';
import type { SolverContext } from '../../src/domain/CraftAction.ts';
import { validateProbabilityDistribution } from '../../src/domain/CraftResult.ts';
import { type TargetDefinition } from '../../src/domain/TargetDefinition.ts';

describe('Phase 2: Exact Basic Currency Actions', () => {
  const repo = new ClusterModRepository();
  const shieldPool = ModPool.forCluster(
    repo,
    'Large Cluster Jewel',
    '12% increased Attack Damage while holding a Shield'
  );
  const priceBook = new PriceBook();
  const context: SolverContext = { pool: shieldPool, priceBook };

  const exalt = new ExaltAction();
  const annul = new AnnulAction();
  const fracture = new FractureAction();
  const divine = new DivineAction();
  const scour = new ScourAction();

  const t1ES = shieldPool.findModById('AfflictionJewelSmallPassivesGrantES3')!;
  const t1Int = shieldPool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;
  const eff35 = shieldPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;
  const attr4 = shieldPool.findModById('AfflictionJewelSmallPassivesGrantAttributes3')!;

  // 1. four valid mods -> target fracture probability exactly 25%
  it('1. four valid mods -> target fracture probability exactly 25%', () => {
    const full4ModState: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'rare',
      prefixes: [toRolledMod(t1ES), toRolledMod(eff35)],
      suffixes: [toRolledMod(t1Int), toRolledMod(attr4)],
      fracturedModIds: [],
    };

    expect(fracture.isAvailable(full4ModState, context)).toBe(true);

    const outcomes = fracture.outcomes(full4ModState, context);
    expect(outcomes.length).toBe(4);
    expect(validateProbabilityDistribution(outcomes)).toBe(true);

    for (const outcome of outcomes) {
      expect(outcome.probability).toBeCloseTo(0.25, 6);
      expect(outcome.state.fracturedModIds.length).toBe(1);
    }

    const t1IntFractured = outcomes.find((o) => o.state.fracturedModIds.includes(t1Int.modId));
    expect(t1IntFractured).toBeDefined();
    expect(t1IntFractured?.probability).toBe(0.25);
  });

  // 2. fractured mod cannot be annulled
  it('2. fractured mod cannot be annulled', () => {
    const stateWithFracture: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'rare',
      prefixes: [toRolledMod(t1ES)],
      suffixes: [toRolledMod(t1Int, { isFractured: true })],
      fracturedModIds: [t1Int.modId],
    };

    expect(annul.isAvailable(stateWithFracture, context)).toBe(true);

    const outcomes = annul.outcomes(stateWithFracture, context);
    // Only 1 removable mod (T1 ES)
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].probability).toBe(1.0);
    // Fractured T1 Int survives
    expect(outcomes[0].state.suffixes.some((s) => s.modId === t1Int.modId)).toBe(true);
    expect(outcomes[0].state.prefixes.length).toBe(0);
  });

  // 3. Exalt never rolls another member of an occupied mod family
  it('3. Exalt never rolls another member of an occupied mod family', () => {
    const stateWithT1Int: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'rare',
      prefixes: [],
      suffixes: [toRolledMod(t1Int, { isFractured: true })],
      fracturedModIds: [t1Int.modId],
    };

    const outcomes = exalt.outcomes(stateWithT1Int, context);
    for (const outcome of outcomes) {
      const allMods = [...outcome.state.prefixes, ...outcome.state.suffixes];
      const intMods = allMods.filter((m) => m.modGroup === t1Int.modGroup);
      // Only the existing T1 Int is present, no duplicate or other tier of Int
      expect(intMods.length).toBe(1);
    }
  });

  // 4. Exalt probability mass sums to 1.0
  it('4. Exalt probability mass sums to 1.0', () => {
    const state: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'rare',
      prefixes: [toRolledMod(t1ES)],
      suffixes: [toRolledMod(t1Int, { isFractured: true })],
      fracturedModIds: [t1Int.modId],
    };

    const outcomes = exalt.outcomes(state, context);
    expect(outcomes.length).toBeGreaterThan(0);
    expect(validateProbabilityDistribution(outcomes)).toBe(true);
  });

  // 5. Annul probability mass sums to 1.0
  it('5. Annul probability mass sums to 1.0', () => {
    const state3Mods: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'rare',
      prefixes: [toRolledMod(t1ES), toRolledMod(eff35)],
      suffixes: [toRolledMod(t1Int, { isFractured: true }), toRolledMod(attr4)],
      fracturedModIds: [t1Int.modId],
    };

    const outcomes = annul.outcomes(state3Mods, context);
    // 3 removable mods (t1ES, eff35, attr4) -> each 1/3
    expect(outcomes.length).toBe(3);
    expect(validateProbabilityDistribution(outcomes)).toBe(true);
    for (const outcome of outcomes) {
      expect(outcome.probability).toBeCloseTo(1 / 3, 6);
    }
  });

  // 6. Divine does not change mod identity
  it('6. Divine does not change mod identity', () => {
    const state: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'rare',
      prefixes: [toRolledMod(t1ES, { currentRoll: [10] })],
      suffixes: [toRolledMod(t1Int, { isFractured: true, currentRoll: [6] })],
      fracturedModIds: [t1Int.modId],
    };

    const target: TargetDefinition = {
      requiredMods: [{ modId: t1Int.modId }, { modId: t1ES.modId }],
      finalRollRequirements: [{ modGroup: t1Int.modGroup, minValue: 8 }],
    };

    const divineContext: SolverContext = { pool: shieldPool, priceBook, target };
    const outcomes = divine.outcomes(state, divineContext);

    expect(outcomes.length).toBe(1);
    expect(outcomes[0].state.prefixes[0].modId).toBe(t1ES.modId);
    expect(outcomes[0].state.suffixes[0].modId).toBe(t1Int.modId);
    expect(outcomes[0].state.suffixes[0].currentRoll?.[0]).toBe(8);
  });

  // 7. T1 Intelligence +6/+7/+8 finishing logic produces the analytically expected Divine cost
  it('7. T1 Intelligence +6/+7/+8 finishing logic produces the analytically expected Divine cost', () => {
    const target: TargetDefinition = {
      requiredMods: [{ modGroup: t1Int.modGroup }],
      finalRollRequirements: [{ modGroup: t1Int.modGroup, minValue: 8 }],
    };

    // State with +6 Int (range is 6-8, 3 possible values, target is +8 -> 1/3 chance -> 3 Divines expected)
    const state6Int: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [],
      suffixes: [toRolledMod(t1Int, { currentRoll: [6] })],
      fracturedModIds: [],
    };

    const expFrom6 = divine.calculateExpectedFinishingCost(state6Int, target);
    expect(expFrom6).toBe(3);

    // State with +8 Int (already at target -> 0 Divines expected)
    const state8Int: ItemState = {
      ...state6Int,
      suffixes: [toRolledMod(t1Int, { currentRoll: [8] })],
    };
    const expFrom8 = divine.calculateExpectedFinishingCost(state8Int, target);
    expect(expFrom8).toBe(0);
  });

  // 8. Exalting from T1 ES + fractured T1 Intelligence produces the expected recalculated chance for 35% Effect
  it('8. Exalting from T1 ES + fractured T1 Intelligence produces expected recalculated chance for 35% Effect', () => {
    const state: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'rare',
      prefixes: [toRolledMod(t1ES)],
      suffixes: [toRolledMod(t1Int, { isFractured: true })],
      fracturedModIds: [t1Int.modId],
    };

    const outcomes = exalt.outcomes(state, context);
    // Total prefix weight = 11302, Total suffix weight = 14450. Total pool weight = 25752.
    // 35% Effect (weight 300) probability = 300 / 25752 = 1.164958%
    const eff35Outcome = outcomes.find((o) =>
      o.state.prefixes.some((p) => p.modId === eff35.modId)
    );

    expect(eff35Outcome).toBeDefined();
    const expectedP = 300 / 25752;
    expect(eff35Outcome?.probability).toBeCloseTo(expectedP, 6);
  });

  // Scour Action test
  it('Scour action preserves fractured mods and clears non-fractured', () => {
    const state: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      rarity: 'rare',
      prefixes: [toRolledMod(t1ES)],
      suffixes: [toRolledMod(t1Int, { isFractured: true })],
      fracturedModIds: [t1Int.modId],
    };

    const outcomes = scour.outcomes(state, context);
    expect(outcomes.length).toBe(1);
    expect(outcomes[0].state.prefixes.length).toBe(0);
    expect(outcomes[0].state.suffixes.length).toBe(1);
    expect(outcomes[0].state.suffixes[0].modId).toBe(t1Int.modId);
    expect(outcomes[0].state.suffixes[0].isFractured).toBe(true);
  });
});
