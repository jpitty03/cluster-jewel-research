// Single source of truth for the current PoE league.
//
// Update this string when a new league starts. Use poe.ninja's exact spelling
// (the name in its league filter, e.g. "Mirage" -> "Allflame"); URL slugs are
// derived from it by leagueUrl()/slugify() — lowercase, spaces to dashes.
//
// Node entry points also honour the POE_LEAGUE env var, and `npm run scrape`
// still takes --league=<Name>; both override this default.
export const DEFAULT_LEAGUE = 'Allflame'
