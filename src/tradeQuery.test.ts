import { gunzipSync, strFromU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { tradeSearchUrl, type TradeQuery } from './tradeQuery'

describe('tradeSearchUrl', () => {
  const query: TradeQuery = {
    query: { status: { option: 'securable' }, type: 'Large Cluster Jewel', filters: {}, stats: [] },
    sort: { price: 'asc' },
  }

  it('puts the gzipped, base64url query in the path, as the trade site does', () => {
    const url = tradeSearchUrl('Hardcore Covens', query)
    const prefix = 'https://www.pathofexile.com/trade/search/Hardcore%20Covens/'
    expect(url.startsWith(prefix)).toBe(true)
    const payload = url.slice(prefix.length)
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/)
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    expect(JSON.parse(strFromU8(gunzipSync(bytes)))).toEqual(query.query)
  })

  it('gives the same link for the same search', () => {
    expect(tradeSearchUrl('Covens', query)).toBe(tradeSearchUrl('Covens', query))
  })
})
