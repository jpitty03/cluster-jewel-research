// Server-side scraper for poe.ninja streamer builds.
//
// poe.ninja's builds API speaks protobuf: a "search" endpoint returns
// column-oriented build rows (capped at the top 100 for the current sort),
// and "dictionary" endpoints hold shared string tables referenced by index.
// The snapshot version hash rotates and is embedded in the HTML page props.
// To get the full list we partition the search by class (each slice < 100)
// and merge the results.
//
// Columns arrive as whole arrays, not per-row messages: a column holds either a
// repeated string field (one raw UTF-8 value per row) or a single packed-varint
// blob (one number per row), never both. Numeric columns that carry a dictionary
// name hold indexes into that dictionary rather than values.

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

const BASE = 'https://poe.ninja';

// ---------- minimal protobuf wire-format reader ----------

type Field = bigint | number | Uint8Array;
type Message = Record<number, Field[]>;

function readVarint(b: Uint8Array, pos: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  let p = pos;
  for (;;) {
    const byte = b[p++];
    if (byte === undefined) throw new Error('truncated varint');
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7n;
  }
  return [result, p];
}

function parseMessage(b: Uint8Array): Message {
  const out: Message = {};
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  while (p < b.length) {
    let tag: bigint;
    [tag, p] = readVarint(b, p);
    const wireType = Number(tag & 7n);
    const fieldNum = Number(tag >> 3n);
    let value: Field;
    if (wireType === 0) {
      [value, p] = readVarint(b, p);
    } else if (wireType === 1) {
      value = b.subarray(p, p + 8);
      p += 8;
    } else if (wireType === 5) {
      value = view.getFloat32(p, true);
      p += 4;
    } else if (wireType === 2) {
      let len: bigint;
      [len, p] = readVarint(b, p);
      value = b.subarray(p, p + Number(len));
      p += Number(len);
    } else {
      throw new Error(`unsupported wire type ${wireType}`);
    }
    (out[fieldNum] ||= []).push(value);
  }
  return out;
}

const text = new TextDecoder();
const str = (f: Field | undefined) => (f instanceof Uint8Array ? text.decode(f) : undefined);
const num = (f: Field | undefined) =>
  typeof f === 'bigint' ? Number(f) : typeof f === 'number' ? f : undefined;

// ---------- HTTP helpers ----------

async function fetchBytes(path: string): Promise<Uint8Array> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'user-agent': UA, accept: '*/*', referer: `${BASE}/poe1/builds/streamers` },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchSnapshotVersion(url = 'streamers', type = 'streamers'): Promise<string> {
  const res = await fetch(`${BASE}/poe1/builds/${url}`, {
    headers: { 'user-agent': UA },
  });
  if (!res.ok) throw new Error(`${url} page -> ${res.status}`);
  const html = (await res.text()).replaceAll('&quot;', '"');
  // Astro page props: {"url":[0,"<url>"],"type":[0,"<type>"],...,"version":[0,"<hash>"],...}
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = html.match(
    new RegExp(
      `"url":\\[0,"${esc(url)}"\\],"type":\\[0,"${esc(type)}"\\][^}]*?"version":\\[0,"([^"]+)"\\]`,
    ),
  );
  if (!m) throw new Error(`could not find ${url}/${type} snapshot version in page`);
  return m[1];
}

// ---------- search response decoding ----------

interface Column {
  rows: number;
  dict: string | null; // dictionary the numeric values index into, if any
  strings: string[] | null; // set for string-valued columns
  nums: number[] | null; // set for numeric / dictionary-indexed columns
}

interface SearchDecoded {
  total: number; // matching builds server-side, before the 100-row cap
  rowCount: number; // rows actually returned
  columns: Record<string, Column>;
  dictionaryHashes: Record<string, string>; // dictionary name -> hash
}

// Split a packed-varint blob into one number per row.
function unpackVarints(b: Uint8Array): number[] {
  const out: number[] = [];
  let p = 0;
  while (p < b.length) {
    let v: bigint;
    [v, p] = readVarint(b, p);
    out.push(Number(v));
  }
  return out;
}

function decodeSearch(bytes: Uint8Array): SearchDecoded {
  const root = parseMessage(bytes);
  const resultBuf = root[1]?.[0];
  if (!(resultBuf instanceof Uint8Array)) throw new Error('search result missing');
  const result = parseMessage(resultBuf);

  const columns: Record<string, Column> = {};
  let rowCount = 0;
  for (const colBuf of result[12] ?? []) {
    if (!(colBuf instanceof Uint8Array)) continue;
    const col = parseMessage(colBuf);
    const name = str(col[1]?.[0]);
    if (!name) continue;
    // Field 6 carries packed numbers, field 8 the same for boolean columns.
    const packed = col[6]?.[0] ?? col[8]?.[0];
    const rows = num(col[13]?.[0]) ?? 0;
    columns[name] = {
      rows,
      dict: str(col[11]?.[0]) ?? null,
      strings: col[7] ? col[7].map((c) => str(c) ?? '') : null,
      nums: packed instanceof Uint8Array ? unpackVarints(packed) : null,
    };
    rowCount = Math.max(rowCount, rows);
  }

  const dictionaryHashes: Record<string, string> = {};
  for (const refBuf of result[6] ?? []) {
    if (!(refBuf instanceof Uint8Array)) continue;
    const ref = parseMessage(refBuf);
    const name = str(ref[1]?.[0]);
    const hash = str(ref[2]?.[0]);
    if (name && hash) dictionaryHashes[name] = hash;
  }

  const total = num(result[1]?.[0]) ?? 0;
  // A response that reports matches but yields no rows means poe.ninja moved the
  // column payload again. Fail loudly — silently returning zero builds is how an
  // empty snapshot got published before.
  if (total > 0 && rowCount === 0) {
    throw new Error(
      `search returned total=${total} but no decodable rows — poe.ninja response format changed`,
    );
  }

  return { total, rowCount, columns, dictionaryHashes };
}

// Per-row accessors. A column is absent when it was not requested.
const cellStr = (d: SearchDecoded, col: string, i: number): string | null =>
  d.columns[col]?.strings?.[i] || null;
const cellNum = (d: SearchDecoded, col: string, i: number): number | null =>
  d.columns[col]?.nums?.[i] ?? null;
const cellDict = (d: SearchDecoded, col: string, i: number, names: string[]): string =>
  names[cellNum(d, col, i) ?? -1] ?? 'Unknown';

// poe.ninja's dictionary endpoints now wrap the value table in a custom "NDIC"
// binary container instead of plain protobuf. Layout (all little-endian):
//   "NDIC" | u32 version | u32 reserved | u32 count | u64 hash |
//   u32 (=16) | u32 n | u32 count | u64 (0) |
//   (n-1) × { u32 offset, u32 size }   // ancillary columns we don't read
//   count × u8 length                  // per-entry string length
//   concatenated string bytes
// The dictionaries the scraper consumes (class, league) hold short labels, so
// lengths fit in a single byte. Fall back to the legacy protobuf shape if the
// payload is not an NDIC container (older snapshots).
function decodeDictionary(b: Uint8Array): string[] {
  if (b.length < 44 || text.decode(b.subarray(0, 4)) !== 'NDIC') {
    const msg = parseMessage(b);
    // field 1 = dictionary name, field 2 = repeated values (0-based index)
    return (msg[2] ?? []).map((v) => str(v) ?? '');
  }
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const count = view.getUint32(12, true);
  const n = view.getUint32(28, true);
  const lenOff = 44 + (n - 1) * 8;
  // Validate the network-derived shape so a corrupt/format-shifted response
  // fails loudly instead of spinning a huge loop or silently emitting garbage.
  if (n < 1 || lenOff < 0 || lenOff + count > b.length) {
    throw new Error(`malformed NDIC dictionary (n=${n} count=${count} len=${b.length})`);
  }
  let p = lenOff + count;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = b[lenOff + i];
    out.push(text.decode(b.subarray(p, p + len)));
    p += len;
  }
  if (p !== b.length) {
    throw new Error(`NDIC dictionary not fully consumed (end=${p} len=${b.length})`);
  }
  return out;
}

async function fetchDictionary(hash: string): Promise<string[]> {
  return decodeDictionary(await fetchBytes(`/poe1/api/builds/dictionary/${hash}`));
}

// ---------- public API ----------

export interface StreamerBuild {
  name: string;
  account: string;
  class: string;
  level: number | null;
  dps: string | null;
  league: string | null;
  seen: string | null;
  streamerLogin: string | null;
  streamerName: string | null;
  live: boolean;
}

export interface StreamerData {
  fetchedAt: string;
  snapshotVersion: string;
  league: string;
  total: number;
  builds: StreamerBuild[];
}

function rowsFrom(decoded: SearchDecoded, classNames: string[]): StreamerBuild[] {
  const rows: StreamerBuild[] = [];
  for (let i = 0; i < decoded.rowCount; i++) {
    rows.push({
      name: cellStr(decoded, 'name', i) ?? '',
      account: cellStr(decoded, 'account', i) ?? '',
      class: cellDict(decoded, 'class', i, classNames),
      level: cellNum(decoded, 'level', i),
      dps: cellStr(decoded, 'dps.total', i),
      league: cellStr(decoded, 'league', i),
      seen: cellStr(decoded, 'seen', i),
      streamerLogin: cellStr(decoded, 'streamer.login', i),
      streamerName: cellStr(decoded, 'streamer.display', i),
      live: cellNum(decoded, 'streamer.online', i) === 1,
    });
  }
  return rows;
}

async function searchBuilds(
  version: string,
  overview: string,
  type: string,
  extra: Record<string, string> = {},
) {
  const qs = new URLSearchParams({ overview, type, ...extra });
  return decodeSearch(await fetchBytes(`/poe1/api/builds/${version}/search?${qs}`));
}

async function searchStreamers(version: string, extra: Record<string, string> = {}) {
  return searchBuilds(version, 'streamers', 'streamers', extra);
}

// Top public (non-streamer) cluster-jewel builds from the league's exp overview,
// ranked ladder-style (level desc, cluster count as tiebreak) and capped at
// PUBLIC_TOP_N — the same selection the crawl targets via searchClusterHolders,
// so the character list and the jewel crawl stay in sync.
async function publicClusterBuilds(
  league: string,
): Promise<{ rows: StreamerBuild[]; total: number }> {
  const leagueSlug = leagueUrl(league);
  let expVersion = '';
  try {
    expVersion = await fetchSnapshotVersion(leagueSlug, 'exp');
  } catch (e) {
    console.warn(`[poeninja] no exp overview for "${league}": ${(e as Error).message}`);
    return { rows: [], total: 0 };
  }
  const expSearch = (extra: Record<string, string>) =>
    searchBuilds(expVersion, leagueSlug, 'exp', {
      'min-cjewels': '1',
      'min-level': String(MIN_LEVEL),
      columns: 'character,level,cjewels,dps',
      ...extra,
    });

  const first = await expSearch({});
  const classHash = first.dictionaryHashes['class'];
  const classNames = classHash ? await fetchDictionary(classHash) : [];

  const byKey = new Map<string, StreamerBuild & { cjewels: number }>();
  const add = (decoded: SearchDecoded, clsOverride?: string) => {
    for (let i = 0; i < decoded.rowCount; i++) {
      const account = cellStr(decoded, 'account', i);
      const name = cellStr(decoded, 'name', i);
      if (!account || !name) continue;
      byKey.set(`${account}\x00${name}`, {
        name,
        account,
        class: clsOverride ?? cellDict(decoded, 'class', i, classNames),
        level: cellNum(decoded, 'level', i),
        dps: cellStr(decoded, 'dps.total', i),
        league,
        seen: null,
        streamerLogin: null,
        streamerName: null,
        live: false,
        cjewels: cellNum(decoded, 'cjewels', i) ?? 0,
      });
    }
  };
  add(first);

  // The search endpoint caps at 100 rows; partition by class to recover the rest.
  if (first.total > byKey.size) {
    const results = await Promise.all(
      classNames.map(async (cls) => {
        const res = await expSearch({ class: cls });
        return { res, cls };
      }),
    );
    for (const { res, cls } of results) add(res, cls);
  }

  const rows = [...byKey.values()]
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || b.cjewels - a.cjewels)
    .slice(0, PUBLIC_TOP_N)
    .map(({ cjewels: _cjewels, ...r }) => r);
  return { rows, total: first.total };
}

export async function scrapeStreamerBuilds(league: string): Promise<StreamerData> {
  const version = await fetchSnapshotVersion();
  const filter = { league, 'min-level': String(MIN_LEVEL) };
  const first = await searchStreamers(version, filter);

  const classDictHash = first.dictionaryHashes['class'];
  const classNames = classDictHash ? await fetchDictionary(classDictHash) : [];

  const byKey = new Map<string, StreamerBuild>();
  const add = (rows: StreamerBuild[]) => {
    for (const r of rows) byKey.set(`${r.account}\x00${r.name}`, r);
  };
  add(rowsFrom(first, classNames));

  // The search endpoint caps at 100 rows; partition by class to recover the rest.
  if (first.total > byKey.size) {
    const results = await Promise.all(
      classNames.map(async (cls) => {
        const res = await searchStreamers(version, { ...filter, class: cls });
        if (res.total >= 100) {
          console.warn(`[poeninja] class "${cls}" hit the 100-row cap; some builds may be missing`);
        }
        return rowsFrom(res, classNames);
      }),
    );
    results.forEach(add);
  }

  // ---- merge in the top public (non-streamer) cluster-jewel builds ----
  // Streamer entries win on collision (they carry the streamer attribution).
  const { rows: pubRows, total: pubTotal } = await publicClusterBuilds(league);
  for (const r of pubRows) {
    const key = `${r.account}\x00${r.name}`;
    if (!byKey.has(key)) byKey.set(key, r);
  }

  return {
    fetchedAt: new Date().toISOString(),
    snapshotVersion: version,
    league,
    total: first.total + pubTotal,
    builds: [...byKey.values()].sort((a, b) => (b.level ?? 0) - (a.level ?? 0)),
  };
}

// All league names poe.ninja exposes for streamer builds (for the scrape picker),
// decoded from the `league` filter-dimension dictionary in a search response.
export async function listPoeLeagues(): Promise<string[]> {
  const version = await fetchSnapshotVersion();
  const decoded = await searchStreamers(version);
  const hash = decoded.dictionaryHashes['league'];
  if (!hash) return [];
  const leagues = await fetchDictionary(hash);
  return leagues.filter((l) => l && l !== 'league');
}

// ---------- currency rates ----------

// Chaos value of every currency poe.ninja tracks, keyed by its currency id
// ("divine" -> 219.1, "chaos" -> 1). Used by scripts/price.ts to normalize trade
// listings, which come back in whatever currency the seller posted them in.
//
// This is the economy API, not the builds API — no snapshot version, no protobuf,
// just a JSON GET. `core.primary` names the unit every `primaryValue` is quoted in
// (chaos); it's asserted rather than assumed, since a league where poe.ninja moved
// off chaos would otherwise silently produce rates off by a factor of ~200.
export async function fetchCurrencyRates(league: string): Promise<Record<string, number>> {
  const url =
    `${BASE}/poe1/api/economy/exchange/current/overview` +
    `?league=${encodeURIComponent(league)}&type=Currency`;
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`currency overview -> ${res.status}`);

  const body = (await res.json()) as {
    core?: { primary?: string };
    lines?: { id?: string; primaryValue?: number }[];
  };
  if (body.core?.primary !== 'chaos')
    throw new Error(`currency overview is quoted in ${body.core?.primary ?? '?'}, expected chaos`);

  const rates: Record<string, number> = {};
  for (const line of body.lines ?? []) {
    if (line.id && typeof line.primaryValue === 'number' && line.primaryValue > 0)
      rates[line.id] = line.primaryValue;
  }
  if (!rates.chaos) rates.chaos = 1; // present in practice, but the unit is true by definition
  return rates;
}

// ---------- cluster-holder prioritization ----------

export interface ClusterHolder {
  account: string;
  name: string;
  class: string;
  streamerName: string | null;
  cjewels: number; // total cluster jewels
  lcjewels: number;
  mcjewels: number;
  scjewels: number;
}

export const MIN_LEVEL = 80; // level floor for streamer builds we care about
export const PUBLIC_TOP_N = 300; // top slice of public (non-streamer) ladder holders to crawl

// poe.ninja overview URLs are lowercase slugs of the league name ("Mirage" -> "mirage").
export const leagueUrl = (league: string) => league.toLowerCase().replace(/\s+/g, '-');

// Use the (non-rate-limited) search endpoint to enumerate only characters that hold
// at least one cluster jewel in the given league, with per-size counts for
// prioritization. Partitions by class to get past the 100-row cap.
export async function searchClusterHolders(league: string): Promise<{
  version: string;
  expVersion: string;
  holders: ClusterHolder[];
}> {
  const version = await fetchSnapshotVersion();
  const columns = 'character,cjewels,lcjewels,mcjewels,scjewels,streamer';
  const search = (extra: Record<string, string>) =>
    searchStreamers(version, {
      'min-cjewels': '1',
      'min-level': String(MIN_LEVEL),
      league,
      columns,
      ...extra,
    });

  const first = await search({});
  const classDictHash = first.dictionaryHashes['class'];
  const classNames = classDictHash ? await fetchDictionary(classDictHash) : [];

  const byKey = new Map<string, ClusterHolder>();
  const add = (decoded: SearchDecoded, cls?: string) => {
    for (let i = 0; i < decoded.rowCount; i++) {
      const account = cellStr(decoded, 'account', i);
      const name = cellStr(decoded, 'name', i);
      if (!account || !name) continue;
      byKey.set(`${account} ${name}`, {
        account,
        name,
        class: cls ?? cellDict(decoded, 'class', i, classNames),
        streamerName: cellStr(decoded, 'streamer.display', i),
        cjewels: cellNum(decoded, 'cjewels', i) ?? 0,
        lcjewels: cellNum(decoded, 'lcjewels', i) ?? 0,
        mcjewels: cellNum(decoded, 'mcjewels', i) ?? 0,
        scjewels: cellNum(decoded, 'scjewels', i) ?? 0,
      });
    }
  };
  add(first);

  // Partition by class so each slice stays under the 100-row cap.
  if (first.total > byKey.size) {
    const results = await Promise.all(
      classNames.map(async (cls) => {
        const res = await search({ class: cls });
        if (res.total >= 100) {
          console.warn(`[poeninja] cluster-holders class "${cls}" hit the 100-row cap`);
        }
        return { res, cls };
      }),
    );
    for (const { res, cls } of results) add(res, cls);
  }

  // ---- public (non-streamer) ladder builds from the league's "exp" overview ----
  // The exp overview is the general ladder snapshot for the league; it is much
  // larger than the streamers overview, so we only keep a small top slice.
  const leagueSlug = leagueUrl(league);
  let expVersion = '';
  try {
    expVersion = await fetchSnapshotVersion(leagueSlug, 'exp');
  } catch (e) {
    console.warn(`[poeninja] no exp overview for "${league}": ${(e as Error).message}`);
  }
  if (expVersion) {
    const expSearch = (extra: Record<string, string>) =>
      searchBuilds(expVersion, leagueSlug, 'exp', {
        'min-cjewels': '1',
        'min-level': String(MIN_LEVEL),
        columns: 'character,level,cjewels,lcjewels,mcjewels,scjewels',
        ...extra,
      });

    const pub = new Map<string, ClusterHolder & { level: number }>();
    const firstPub = await expSearch({});
    const pubClassHash = firstPub.dictionaryHashes['class'];
    const pubClassNames = pubClassHash ? await fetchDictionary(pubClassHash) : classNames;
    const addPub = (decoded: SearchDecoded, cls?: string) => {
      for (let i = 0; i < decoded.rowCount; i++) {
        const account = cellStr(decoded, 'account', i);
        const name = cellStr(decoded, 'name', i);
        if (!account || !name) continue;
        pub.set(`${account} ${name}`, {
          account,
          name,
          class: cls ?? cellDict(decoded, 'class', i, pubClassNames),
          streamerName: null,
          level: cellNum(decoded, 'level', i) ?? 0,
          cjewels: cellNum(decoded, 'cjewels', i) ?? 0,
          lcjewels: cellNum(decoded, 'lcjewels', i) ?? 0,
          mcjewels: cellNum(decoded, 'mcjewels', i) ?? 0,
          scjewels: cellNum(decoded, 'scjewels', i) ?? 0,
        });
      }
    };
    addPub(firstPub);

    // Partition by class so each slice stays under the 100-row cap.
    if (firstPub.total > pub.size) {
      const results = await Promise.all(
        pubClassNames.map(async (cls) => {
          const res = await expSearch({ class: cls });
          if (res.total >= 100) {
            console.warn(`[poeninja] public cluster-holders class "${cls}" hit the 100-row cap`);
          }
          return { res, cls };
        }),
      );
      for (const { res, cls } of results) addPub(res, cls);
    }

    // Ladder-style ranking: highest level first, cluster-jewel count as tiebreak.
    // Streamer entries win on collision (they carry the streamer attribution).
    const publicTop = [...pub.values()]
      .filter((h) => !byKey.has(`${h.account} ${h.name}`))
      .sort((a, b) => b.level - a.level || b.cjewels - a.cjewels)
      .slice(0, PUBLIC_TOP_N);
    for (const { level: _level, ...h } of publicTop) byKey.set(`${h.account} ${h.name}`, h);
  }

  const holders = [...byKey.values()].sort((a, b) => b.cjewels - a.cjewels);
  return { version, expVersion, holders };
}

// ---------- simple in-memory cache ----------

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { data: StreamerData; at: number }>();
const inflight = new Map<string, Promise<StreamerData>>();

export async function getStreamerBuilds(league: string, forceRefresh = false): Promise<StreamerData> {
  const hit = cache.get(league);
  if (!forceRefresh && hit && Date.now() - hit.at < TTL_MS) return hit.data;
  let pending = inflight.get(league);
  if (!pending) {
    pending = scrapeStreamerBuilds(league)
      .then((data) => {
        cache.set(league, { data, at: Date.now() });
        return data;
      })
      .finally(() => {
        inflight.delete(league);
      });
    inflight.set(league, pending);
  }
  return pending;
}
