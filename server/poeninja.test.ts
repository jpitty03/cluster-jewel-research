import { afterEach, describe, expect, it, vi } from 'vitest'

// Small wire-format fixtures exercise the actual search and dictionary decoders.
const varint = (value: number): number[] => {
  const bytes: number[] = []
  do {
    const byte = value & 127
    value >>>= 7
    bytes.push(byte | (value ? 128 : 0))
  } while (value)
  return bytes
}
const field = (id: number, value: string | number | number[]): number[] => {
  if (typeof value === 'number') return [...varint(id << 3), ...varint(value)]
  const bytes = typeof value === 'string' ? [...new TextEncoder().encode(value)] : value
  return [...varint((id << 3) | 2), ...varint(bytes.length), ...bytes]
}
const classes = ['Elementalist', 'Slayer']
const column = (name: string, value: string | number, dictionary?: string): number[] =>
  field(12, [
    ...field(1, name),
    ...(typeof value === 'string' ? field(7, value) : field(6, varint(value))),
    ...(dictionary ? field(11, dictionary) : []),
    ...field(13, 1),
  ])
const searchResponse = (overview: string, cls: string | null): Response => {
  const classIndex = cls === 'Slayer' ? 1 : 0
  return new Response(new Uint8Array(field(1, [
    ...field(1, cls ? 1 : 2), // force the caller to partition the first response
    ...field(6, [...field(1, 'class'), ...field(2, 'class-hash')]),
    ...column('name', `${overview}-${classes[classIndex]}`),
    ...column('account', 'Player#1234'),
    ...column('class', classIndex, 'class'),
    ...column('level', 95),
    ...column('cjewels', 3),
    ...column('lcjewels', 1),
    ...column('mcjewels', 2),
    ...column('scjewels', 0),
    ...column('streamer.display', overview === 'streamers' ? 'Streamer' : ''),
  ])))
}

afterEach(() => vi.unstubAllGlobals())

describe('protected build search', () => {
  it.each(['searchClusterHolders', 'scrapeStreamerBuilds'] as const)(
    '%s discovers separate snapshots and preserves overview, league, and ascendancy filters',
    async (method) => {
      vi.resetModules()
      const searches: URL[] = []
      vi.stubGlobal('fetch', vi.fn(async (input: string) => {
        const url = new URL(input)
        if (url.pathname === '/poe1/api/data/snapshot-versions') {
          const overview = url.searchParams.get('league')!
          return Response.json([{
            url: overview,
            type: overview === 'streamers' ? 'streamers' : 'exp',
            version: `${overview}-rotating-snapshot`,
          }])
        }
        if (url.pathname === '/poe1/api/data/index-state') {
          return Response.json({ buildLeagues: [{ name: 'Covens', url: 'covens' }] })
        }
        if (url.pathname === '/api/lookup/poe1/builds/dictionary/class-hash') {
          return new Response(new Uint8Array(classes.flatMap((cls) => field(2, cls))))
        }
        const overview = url.searchParams.get('overview')!
        expect(url.pathname).toBe(`/api/protected/poe1/builds/${overview}-rotating-snapshot/search`)
        expect(url.searchParams.get('type')).toBe(overview === 'streamers' ? 'streamers' : 'exp')
        expect(url.searchParams.get('min-level')).toBe('80')
        if (overview === 'streamers') expect(url.searchParams.get('league')).toBe('Covens')
        if (method === 'searchClusterHolders' || overview === 'covens') {
          expect(url.searchParams.get('min-cjewels')).toBe('1')
          expect(url.searchParams.get('columns')).toContain('cjewels')
        }
        searches.push(url)
        return searchResponse(overview, url.searchParams.get('class'))
      }))

      const ninja = await import('./poeninja.ts')
      const result = await ninja[method]('Covens')
      const rows = 'holders' in result ? result.holders : result.builds
      expect(rows).toHaveLength(4) // initial rows deduplicated against class partitions
      expect(rows.map((row) => row.class).sort()).toEqual([
        'Elementalist', 'Elementalist', 'Slayer', 'Slayer',
      ])
      expect(searches).toHaveLength(6)
      for (const overview of ['streamers', 'covens']) {
        expect(searches.filter((url) => url.searchParams.get('overview') === overview)
          .map((url) => url.searchParams.get('class'))).toEqual([null, ...classes])
      }
      if ('holders' in result) {
        expect(result.version).toBe('streamers-rotating-snapshot')
        expect(result.expVersion).toBe('covens-rotating-snapshot')
        expect(result.holders.every((holder) => holder.cjewels === 3)).toBe(true)
      }
    },
  )

  it('reports a protected search failure instead of returning an empty result', async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (new URL(input).pathname === '/poe1/api/data/snapshot-versions') {
        return Response.json([{ url: 'streamers', type: 'streamers', version: 'current' }])
      }
      return new Response('Forbidden', { status: 403 })
    }))
    const { searchClusterHolders } = await import('./poeninja.ts')
    await expect(searchClusterHolders('Covens')).rejects.toThrow(
      /GET \/api\/protected\/poe1\/builds\/current\/search\?.* -> 403/,
    )
  })
})
