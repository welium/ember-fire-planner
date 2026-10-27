import { describe, expect, it } from 'vitest'
import { analyze, clampGlideYears, defaults, maxGlideYears, simulate, stockWeight, successInterval, validate } from './simulation'
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
    expect(maxGlideYears({ age: 30, retirementAge: 90 })).toBe(60)
    expect(maxGlideYears({ age: 18, retirementAge: 90 })).toBe(72)
    expect(validate({ ...defaults, age: 18, retirementAge: 90, glideYears: 72 })).toBeNull()
    expect(maxGlideYears({ age: 40, retirementAge: 40 })).toBe(0)
    // Regression: raising the current age must pull an over-long glide back
    // so the slider, label, chart, and simulation stay in agreement.
    expect(clampGlideYears({ ...defaults, age: 40 }).glideYears).toBe(10)
    expect(clampGlideYears({ ...defaults, age: 30 }).glideYears).toBe(15)
    expect(validate({ ...defaults, age: 40 })).not.toBeNull()
    expect(validate({ ...defaults, age: 40, glideYears: 10 })).toBeNull()
  })
  it('preserves the glide setting for partial or invalid ages', () => {
    for (const changes of [{ retirementAge: 6 }, { age: 60 }, { age: 3 }, { retirementAge: 50.5 }, { retirementAge: 110 }]) {
      expect(clampGlideYears({ ...defaults, ...changes }).glideYears).toBe(15)
    }
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

describe('uncertainty and sensitivity analysis', () => {
  it('uses Wilson intervals with uncertainty at both endpoints', () => {
    expect(successInterval(50, 100)[0]).toBeCloseTo(40.383, 2)
    expect(successInterval(50, 100)[1]).toBeCloseTo(59.617, 2)
    expect(successInterval(0, 100)[1]).toBeCloseTo(3.699, 2)
    expect(successInterval(100, 100)[0]).toBeCloseTo(96.301, 2)
    expect(successInterval(5000, 10000)[1] - 50).toBeLessThan(successInterval(50, 100)[1] - 50)
    const result = simulate({ ...fixed, spending: 60 })
    expect(result.successInterval).toEqual(successInterval(0, fixed.simulations))
  })
  it('distinguishes unfunded withdrawals from no required withdrawal', () => {
    const empty = { ...fixed, portfolio: 0, contribution: 0 }
    expect(simulate(empty).withdrawalRate).toBeNull()
    expect(simulate({ ...empty, spending: 0 }).withdrawalRate).toBe(0)
    expect(simulate({ ...empty, income: 30, incomeAge: 32 }).withdrawalRate).toBe(0)
  })
  it('preserves the baseline and inputs, using identical seeds for exact stress shifts', () => {
    const input = { ...defaults, simulations: 100 }
    const snapshot = { ...input }, analysis = analyze(input, 7)
    const { sensitivity, ...baseline } = analysis
    expect(input).toEqual(snapshot)
    expect(baseline).toEqual(simulate(input, 7))
    expect(sensitivity.map(s => [s.plan.stockReturn, s.plan.bondReturn, s.plan.inflation, s.plan.correlation])).toEqual([
      [6.1, 4.8, 2, 0.3], [5.1, 3.8, 2, 0.3], [7.1, 5.8, 3, 0.3], [7.1, 5.8, 2, 0.7],
    ])
    for (const s of sensitivity) expect(s.result).toEqual(simulate(s.plan, 7))
  })
  it('reports unsupported stresses without clamping or failing the baseline', () => {
    const input = { ...fixed, stockReturn: -20, inflation: 15, correlation: 0.9 }
    const analysis = analyze(input)
    expect(analysis.sensitivity.map(s => s.result === null)).toEqual([true, true, true, false])
    expect(analysis.sensitivity[3].plan.correlation).toBe(0.9)
    expect(analysis.success).toBe(simulate(input).success)
  })
  it('matches analytical one-year lognormal percentiles', () => {
    // One accumulation year; observe that year before any retirement withdrawal.
    const input = { ...fixed, retirementAge: 31, endAge: 32, portfolio: 100, contribution: 0, spending: 0, startStocks: 100, retirementStocks: 100, stockReturn: 7.1, stockSD: 15.9, simulations: 20000 }
    const point = simulate(input, 42).points[1]
    const variance = Math.log(1 + .159 ** 2 / 1.071 ** 2)
    const mu = Math.log(1.071) - variance / 2
    const expected = (z: number) => 100 * Math.exp(mu + Math.sqrt(variance) * z)
    // Tolerances cover ordinary quantile sampling error at this sample size.
    expect(Math.abs(point.p50 - expected(0))).toBeLessThan(.6)
    expect(Math.abs(point.p10 - expected(-1.2815515655))).toBeLessThan(.6)
    expect(Math.abs(point.p90 - expected(1.2815515655))).toBeLessThan(.8)
  })
})
