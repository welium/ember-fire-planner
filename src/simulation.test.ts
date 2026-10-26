import { describe, expect, it } from 'vitest'
import { clampGlideYears, defaults, maxGlideYears, simulate, stockWeight, validate } from './simulation'
import type { Plan } from './simulation'
const fixed: Plan = { ...defaults, age: 30, retirementAge: 32, endAge: 35, portfolio: 100, contribution: 20, spending: 30, income: 0, stockReturn: 0, bondReturn: 0, stockSD: 0, bondSD: 0, correlation: 0, inflation: 0, inflationSD: 0, fee: 0, glideYears: 0, simulations: 100 }
describe('retirement cash flows', () => {
  it('contributes before retirement and withdraws from retirement onward', () => {
    const result = simulate(fixed)
    expect(result.points.map(p => p.p50)).toEqual([100,120,140,110,80,50])
    expect(result.success).toBe(100)
    expect(result.retirementBalance).toBe(140)
    expect(result.withdrawalRate).toBeCloseTo(30/140*100)
  })
  it('records depletion without allowing negative wealth', () => {
    const result = simulate({ ...fixed, spending: 60 })
    expect(result.points.map(p => p.p50)).toEqual([100,120,140,80,20,0])
    expect(result.success).toBe(0)
  })
  it('accepts exactly funded final spending', () => {
    expect(simulate({ ...fixed, portfolio: 50, contribution: 20 }).success).toBe(100)
  })
  it('starts income at the specified age and preserves failure if wealth recovers', () => {
    const result = simulate({ ...fixed, spending: 160, income: 300, incomeAge: 33 })
    expect(result.points.map(p => p.p50)).toEqual([100,120,140,0,140,280])
    expect(result.success).toBe(0)
  })
  it('deflates nominal returns and deducts annual fees', () => {
    const result = simulate({ ...fixed, stockReturn: 10, bondReturn: 10, inflation: 5, fee: 1, contribution: 0, spending: 0 })
    expect(result.points[1].p50).toBeCloseTo(100*1.1*.99/1.05)
  })
  it('samples inflation around its mean and widens real outcomes', () => {
    const base = { ...fixed, retirementAge: 31, endAge: 70, portfolio: 100, contribution: 0, spending: 0, simulations: 2000, inflation: 2 }
    const steady = simulate({ ...base, inflationSD: 0 }, 7)
    const variable = simulate({ ...base, inflationSD: 2 }, 7)
    const last = (result: ReturnType<typeof simulate>) => result.points.at(-1)!
    expect(last(steady).p10).toBeCloseTo(last(steady).p90)
    expect(last(variable).p10).toBeLessThan(last(variable).p90)
    expect(last(variable).p10).toBeLessThan(last(steady).p50)
    expect(last(variable).p90).toBeGreaterThan(last(steady).p50)
  })
})
describe('glide path and uncertainty', () => {
  it('interpolates only within the glide path and holds retirement allocation', () => {
    const p = { ...defaults, retirementAge: 50, glideYears: 10 }
    expect(stockWeight(30,p)).toBe(.9)
    expect(stockWeight(40,p)).toBe(.9)
    expect(stockWeight(45,p)).toBe(.7)
    expect(stockWeight(50,p)).toBe(.5)
    expect(stockWeight(80,p)).toBe(.5)
    expect(stockWeight(49,{ ...p, glideYears:0 })).toBe(.9)
  })
  it('uses repeatable paths with ordered percentiles', () => {
    const p = { ...defaults, simulations: 100 }
    const a = simulate(p,42), b = simulate(p,42)
    expect(a).toEqual(b)
    expect(a).not.toEqual(simulate(p,43))
    for (const point of a.points) {
      expect(point.p10).toBeLessThanOrEqual(point.p25)
      expect(point.p25).toBeLessThanOrEqual(point.p50)
      expect(point.p50).toBeLessThanOrEqual(point.p75)
      expect(point.p75).toBeLessThanOrEqual(point.p90)
    }
    expect(a.success).toBeGreaterThanOrEqual(0)
    expect(a.success).toBeLessThanOrEqual(100)
  })
  it('uses a positive stock–bond correlation and stochastic inflation by default', () => {
    expect(defaults.correlation).toBeGreaterThan(0.1)
    expect(defaults.inflationSD).toBeGreaterThan(0)
    expect(validate(defaults)).toBeNull()
  })
  it('makes a balanced portfolio more dispersed when stock and bond shocks are positively correlated', () => {
    const base = { ...fixed, retirementAge: 31, endAge: 70, portfolio: 100, contribution: 0, spending: 0, stockSD: 20, bondSD: 20, startStocks: 50, retirementStocks: 50, simulations: 2000 }
    const spread = (result: ReturnType<typeof simulate>) => { const point = result.points.at(-1)!; return point.p90 / Math.max(point.p10, 1e-9) }
    expect(spread(simulate({ ...base, correlation: 0.9 }, 7))).toBeGreaterThan(spread(simulate({ ...base, correlation: -0.9 }, 7)))
  })
  it('rejects invalid and unbounded plans', () => {
    expect(validate(defaults)).toBeNull()
    for (const changes of [{age:50}, {retirementAge:96}, {stockSD:-1}, {correlation:2}, {inflationSD:-1}, {inflationSD:16}, {simulations:1e9}, {age:30.5}, {portfolio:NaN}, {retirementStocks:95}]) {
      expect(validate({ ...defaults,...changes })).not.toBeNull()
    }
  })
  it('caps the glide path at the years left until retirement', () => {
    expect(maxGlideYears({ age: 30, retirementAge: 50 })).toBe(20)
    expect(maxGlideYears({ age: 30, retirementAge: 90 })).toBe(40)
    expect(maxGlideYears({ age: 40, retirementAge: 40 })).toBe(0)
    // Regression: raising the current age must pull an over-long glide back
    // so the slider, label, chart, and simulation stay in agreement.
    expect(clampGlideYears({ ...defaults, age: 40 }).glideYears).toBe(10)
    expect(clampGlideYears({ ...defaults, age: 30 }).glideYears).toBe(15)
    expect(validate({ ...defaults, age: 40 })).not.toBeNull()
    expect(validate({ ...defaults, age: 40, glideYears: 10 })).toBeNull()
  })
  it('leaves the glide path alone while ages are incomplete', () => {
    // Clearing the age field to retype it must not corrupt the glide setting.
    const cleared = clampGlideYears({ ...defaults, age: NaN })
    expect(cleared.glideYears).toBe(defaults.glideYears)
    expect(validate(cleared)).not.toBeNull()
    // Retyping a valid age then clamps from the preserved value.
    expect(clampGlideYears({ ...cleared, age: 40 }).glideYears).toBe(10)
  })
})
