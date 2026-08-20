/**
 * Calculates the expected number of Divine Orbs needed to reach a desired target roll
 * assuming uniform discrete distribution over [min, max].
 *
 * @param min Minimum possible integer roll for the tier
 * @param max Maximum possible integer roll for the tier
 * @param acceptedValues List or set of values that satisfy the target requirement
 * @param currentRoll Current value of the roll (if known). If currentRoll already qualifies, returns 0.
 */
export function expectedDivinesToReach(
  min: number,
  max: number,
  acceptedValues: number[] | Set<number>,
  currentRoll?: number
): number {
  const acceptedSet = acceptedValues instanceof Set ? acceptedValues : new Set(acceptedValues);

  // If already at target value, 0 Divines needed
  if (currentRoll !== undefined && acceptedSet.has(currentRoll)) {
    return 0;
  }

  const totalPossible = max - min + 1;
  if (totalPossible <= 0) return 0;

  let successfulCount = 0;
  for (let val = min; val <= max; val++) {
    if (acceptedSet.has(val)) {
      successfulCount++;
    }
  }

  if (successfulCount === 0) {
    return Number.POSITIVE_INFINITY; // Impossible to reach
  }

  const pSuccess = successfulCount / totalPossible;
  return 1 / pSuccess;
}
