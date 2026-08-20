import type { ItemRarity } from '../domain/ItemState.ts';

/**
 * In Path of Exile, an item's rarity tier (normal, magic, rare) is set upon item generation
 * or modified by transmutation / alchemy / regal / chance / chaos / scour orbs.
 * Annulment or removal of modifiers does NOT downgrade a rare item to magic.
 */
export function getRarityAfterScour(): ItemRarity {
  return 'normal';
}

export function getRarityAfterTransmute(): ItemRarity {
  return 'magic';
}

export function getRarityAfterRegalOrAlchemy(): ItemRarity {
  return 'rare';
}
