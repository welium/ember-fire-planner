import { describe, expect, it } from 'vitest'
import { arithmeticToCagr, initialSavedPlan, parseSavedPlan } from './plan-storage'
import { defaults, logParameters, validate } from './simulation'
import { presets, matchingPreset } from './assumption-presets'

describe('CAGR calibration', () => {
  it('preserves geometric growth and simple-return SD exactly', () => {
    for (const g of [-20, 0, 7, 30]) for (const sd of [0, 5, 20, 60]) {
      const { mu, sigma } = logParameters(g, sd)
      expect(Math.expm1(mu) * 100).toBeCloseTo(g, 10)
      const variance = Math.expm1(sigma ** 2) * Math.exp(2 * mu + sigma ** 2)
      expect(Math.sqrt(variance) * 100).toBeCloseTo(sd, 8)
    }
  })
  it('preserves old lognormal distributions when converting arithmetic inputs', () => {
    for (const [mean, sd] of [[7.1, 15.9], [5.8, 5.5], [-10, 20], [0, 0]]) {
      const oldVariance = Math.log1p((sd / 100 / (1 + mean / 100)) ** 2)
      const parameters = logParameters(arithmeticToCagr(mean, sd), sd)
      expect(parameters.mu).toBeCloseTo(Math.log1p(mean / 100) - oldVariance / 2, 12)
      expect(parameters.sigma ** 2).toBeCloseTo(oldVariance, 12)
    }
  })
})
describe('saved plans', () => {
  it('loads legacy partial saves using frozen old assumptions and migrates glides', () => {
    const loaded = parseSavedPlan(JSON.stringify({ age: 40 }))
    expect(loaded.plan.glideYears).toBe(10)
    expect(loaded.plan.stockReturn).toBeCloseTo(arithmeticToCagr(7.1, 15.9))
    expect(loaded.plan.bondReturn).toBeCloseTo(arithmeticToCagr(5.8, 5.5))
    expect(loaded.stockPresetId).toBe('custom')
    expect(parseSavedPlan(JSON.stringify(loaded))).toEqual(loaded)
  })
  it('round-trips new presets and removes stale selection metadata', () => {
    const saved = initialSavedPlan()
    expect(parseSavedPlan(JSON.stringify(saved))).toEqual(saved)
    expect(parseSavedPlan(JSON.stringify({ ...saved, plan: { ...saved.plan, stockReturn: 4 } })).stockPresetId).toBe('custom')
    expect(matchingPreset('treasury-short', 'stock', 1, 2)).toBe('custom')
  })
  it('preserves corporate bond assumptions as custom after the global aggregate replacement', () => {
    const saved = initialSavedPlan()
    const plan = { ...saved.plan, bondReturn: 1.79, bondSD: 6.44 }
    const loaded = parseSavedPlan(JSON.stringify({ ...saved, plan, bondPresetId: 'global-ig-corporate' }))
    expect(loaded.plan).toEqual(plan)
    expect(loaded.bondPresetId).toBe('custom')
    expect(saved.bondPresetId).toBe('global-ig-bonds')
  })
  it('falls back for malformed saves and unsupported versions', () => {
    for (const raw of [null, 'broken', '[]', 'null', '{"version":3}', '{"portfolio":"100"}', '{"stockSD":-1}']) expect(parseSavedPlan(raw)).toEqual(initialSavedPlan())
  })
})
describe('historical presets', () => {
  it('uses a broad unhedged USD bond benchmark covering at least 1999', () => {
    const preset = presets.find(p => p.id === initialSavedPlan().bondPresetId)!
    expect(preset.start <= '1999-01-01').toBe(true)
    expect(preset.basis).toContain('FTSE WorldBIG')
    expect(preset.basis).toContain('USD unhedged')
    expect(preset.cagr).toBe(2.94)
    expect(preset.sd).toBe(5.97)
  })
  it('has six stock and three bond presets with valid dates, inputs, and sources', () => {
    expect(presets.filter(p => p.asset === 'stock')).toHaveLength(6)
    expect(presets.filter(p => p.asset === 'bond')).toHaveLength(3)
    expect(new Set(presets.map(p => p.id)).size).toBe(9)
    for (const preset of presets) {
      expect(Date.parse(preset.start)).toBeLessThan(Date.parse(preset.end))
      expect(new URL(preset.source).protocol).toBe('https:')
      const plan = preset.asset === 'stock' ? { ...defaults, stockReturn: preset.cagr, stockSD: preset.sd } : { ...defaults, bondReturn: preset.cagr, bondSD: preset.sd }
      expect(validate(plan)).toBeNull()
    }
  })
})
