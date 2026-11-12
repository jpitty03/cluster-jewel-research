import { describe, expect, it } from 'vitest'
import { summarizeListings } from './priceModel.ts'

const c = (amount: number, account?: string) => ({ price: { amount, currency: 'chaos' }, account })

describe('summarizeListings', () => {
  it('counts one listing per seller', () => {
    const out = summarizeListings([c(10, 'a'), c(10, 'a'), c(11, 'a'), c(20, 'b'), c(30, 'c')], {})
    expect(out.low?.amount).toBe(10)
    expect(out.mid?.amount).toBe(20)
    expect(out.sampled).toBe(5)
    expect(out.sellers).toBe(3)
    expect(out.lowOutlier).toBeUndefined()
  })

  it('sets a lone lowball aside when three sellers are sampled', () => {
    const out = summarizeListings([c(1, 'fixer'), c(40, 'b'), c(45, 'c'), c(50, 'd')], {})
    expect(out.lowOutlier?.amount).toBe(1)
    expect(out.low?.amount).toBe(40)
    expect(out.mid?.amount).toBe(45)
    expect(out.sellers).toBe(4)
  })

  it('keeps a cheap listing that is within half of the next seller', () => {
    const out = summarizeListings([c(25, 'a'), c(40, 'b'), c(45, 'c')], {})
    expect(out.low?.amount).toBe(25)
    expect(out.lowOutlier).toBeUndefined()
  })

  it('does not judge a lowball with fewer than three sellers or unknown rates', () => {
    expect(summarizeListings([c(1, 'a'), c(40, 'b')], {}).low?.amount).toBe(1)
    const mixed = summarizeListings([
      { price: { amount: 1, currency: 'mystery' }, account: 'a' }, c(40, 'b'), c(45, 'c'),
    ], {})
    expect(mixed.low?.currency).toBe('mystery')
  })

  it('compares across currencies through the rate table', () => {
    const out = summarizeListings([
      c(20, 'a'), { price: { amount: 1, currency: 'divine' }, account: 'b' }, c(210, 'c'),
    ], { divine: 200 })
    expect(out.lowOutlier?.amount).toBe(20)
    expect(out.low?.currency).toBe('divine')
  })

  it('handles empty and unpriced samples', () => {
    expect(summarizeListings([], {})).toEqual({ low: null, mid: null, sampled: 0, sellers: 0 })
    expect(summarizeListings([{ price: null, account: 'a' }], {}).sampled).toBe(0)
  })
})
