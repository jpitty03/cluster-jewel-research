export type SearchIntent = 'RECOMMEND' | 'DEEPEN' | 'PROVE';

export const DEFAULT_SEARCH_WALL_TIME_MS = 30_000;
export const HOST_SEARCH_GUARD_GRACE_MS = 250;

export interface SearchRuntimeBudget {
  requestedWallTimeMs: number;
  engineDeadlineMs: number;
  hostGuardDeadlineMs: number;
  shutdownReserveMs: number;
}

/**
 * Keep cooperative engine completion comfortably ahead of the host kill timer.
 * The reserve is proportional for short searches and capped so deeper searches
 * still receive nearly all of their requested budget.
 */
export function getSearchRuntimeBudget(requestedWallTimeMs?: number): SearchRuntimeBudget {
  const requested = Math.max(1, requestedWallTimeMs ?? DEFAULT_SEARCH_WALL_TIME_MS);
  const shutdownReserveMs = Math.min(1_000, Math.max(100, Math.ceil(requested * 0.1)));
  return {
    requestedWallTimeMs: requested,
    engineDeadlineMs: Math.max(1, requested - shutdownReserveMs),
    hostGuardDeadlineMs: requested + HOST_SEARCH_GUARD_GRACE_MS,
    shutdownReserveMs,
  };
}
