import type { Mod } from './Mod.ts';
import type { ModRequirement } from './TargetDefinition.ts';

export interface ModifierDisplayDescriptor {
  /** Exact identity. Display text never replaces or mutates this value. */
  modId: string;
  primaryText: string;
  compactText: string;
  tier: number;
  tierLabel: string;
  genType: 'Prefix' | 'Suffix';
  requiredItemLevel: number;
  internalAffixName: string;
  modGroup: string;
  technicalText: string;
}

export type ModifierDisplaySource = Pick<
  Mod,
  'modId' | 'name' | 'statText' | 'tier' | 'tierCount' | 'genType' | 'ilvl' | 'modGroup' | 'isNotable'
>;

function normalizeStatPunctuation(text: string): string {
  return text
    .replace(/(\d)\s*[—–-]\s*(\d)/g, '$1–$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Conservative short form for cards and graph labels; it never changes the represented stat. */
export function compactModifierStatText(text: string): string {
  return normalizeStatPunctuation(text)
    .replace(/^Added Small Passive Skills also grant:\s*/i, '')
    .replace(/^Added Small Passive Skills have\s*/i, '')
    .replace(/^\+\(([^)]+)\)\s+to\s+/i, '+$1 ')
    .replace(/^(\+[^\s]+)\s+to\s+/i, '$1 ')
    .trim();
}

/** The single Phase 2U resolver for an exact pool/repository modifier. */
export function resolveModifierDisplayDescriptor(
  mod: ModifierDisplaySource,
): ModifierDisplayDescriptor {
  const tierLabel = `T${mod.tier}`;
  const statText = normalizeStatPunctuation(mod.statText);
  const playerText = statText || (mod.isNotable ? mod.name : `${mod.genType} modifier`);
  const compact = mod.isNotable ? mod.name : compactModifierStatText(playerText);
  const withTier = (text: string) => mod.isNotable || text.endsWith(`(${tierLabel})`)
    ? text
    : `${text} (${tierLabel})`;

  return {
    modId: mod.modId,
    primaryText: withTier(playerText),
    compactText: withTier(compact),
    tier: mod.tier,
    tierLabel,
    genType: mod.genType,
    requiredItemLevel: mod.ilvl,
    internalAffixName: mod.name,
    modGroup: mod.modGroup,
    technicalText: `Internal affix: ${mod.name} · exact modifier ID: ${mod.modId} · exclusion group: ${mod.modGroup}`,
  };
}

/** Resolve a requirement without ever pretending a fallback is a different exact target. */
export function resolveRequirementModifierDescriptor(
  requirement: ModRequirement,
  pool: readonly ModifierDisplaySource[],
): ModifierDisplayDescriptor | undefined {
  const exact = requirement.modId
    ? pool.find((mod) => mod.modId === requirement.modId)
    : undefined;
  if (exact) return resolveModifierDisplayDescriptor(exact);

  const matches = pool.filter((mod) =>
    (!requirement.name || mod.name === requirement.name) &&
    (!requirement.modGroup || mod.modGroup === requirement.modGroup) &&
    (requirement.minTierNumber === undefined || mod.tier >= requirement.minTierNumber) &&
    (requirement.maxTierNumber === undefined || mod.tier <= requirement.maxTierNumber)
  );
  return matches.length === 1 ? resolveModifierDisplayDescriptor(matches[0]) : undefined;
}

export function requirementDisplayFallback(requirement: ModRequirement): string {
  return requirement.name ?? requirement.modGroup ?? 'Technical modifier requirement';
}

/** Replace technical tokens in generated prose while retaining the original exact IDs elsewhere. */
export function playerizeModifierText(
  text: string,
  descriptors: readonly ModifierDisplayDescriptor[],
  form: 'primary' | 'compact' = 'compact',
): string {
  let playerText = normalizeStatPunctuation(text);
  const replacements = descriptors
    .flatMap((descriptor) => [
      { token: descriptor.modId, replacement: form === 'primary' ? descriptor.primaryText : descriptor.compactText },
      { token: descriptor.internalAffixName, replacement: form === 'primary' ? descriptor.primaryText : descriptor.compactText },
    ])
    .filter(({ token }) => token.trim().length > 0)
    .sort((left, right) => right.token.length - left.token.length);
  for (const { token, replacement } of replacements) {
    playerText = playerText.split(token).join(replacement);
  }
  return playerText.replace(/\((T\d+)\)\s*\(\1\)/g, '($1)');
}
