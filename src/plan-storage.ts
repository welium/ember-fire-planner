import { defaults, clampGlideYears, validate } from './simulation'
import type { Plan } from './simulation'
import { presets, defaultStockPreset, defaultBondPreset, matchingPreset } from './assumption-presets'

export interface SavedPlan { version: 2; plan: Plan; stockPresetId: string; bondPresetId: string }
const legacyDefaults = { ...defaults, stockReturn: 7.1, stockSD: 15.9, bondReturn: 5.8, bondSD: 5.5 }
export function initialSavedPlan(): SavedPlan {
  return { version: 2, plan: { ...defaults }, stockPresetId: defaultStockPreset.id, bondPresetId: defaultBondPreset.id }
}
export function arithmeticToCagr(mean: number, sd: number) {
  const variance = Math.log1p((sd / 100 / (1 + mean / 100)) ** 2)
  return Math.expm1(Math.log1p(mean / 100) - variance / 2) * 100
}
export function parseSavedPlan(raw: string | null): SavedPlan {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return initialSavedPlan()
    const stored = value as Record<string, unknown>
    const legacy = !('version' in stored)
    if (!legacy && stored.version !== 2) return initialSavedPlan()
    const source = legacy ? stored : stored.plan
    if (!source || typeof source !== 'object' || Array.isArray(source)) return initialSavedPlan()
    // Pick only numeric Plan fields, preserving the engine's numeric-only contract.
    const plan = { ...(legacy ? legacyDefaults : defaults) }
    for (const key of Object.keys(plan) as (keyof Plan)[]) {
      if (key in source) plan[key] = (source as Record<string, number>)[key]
    }
    if (Object.values(plan).some(v => typeof v !== 'number')) return initialSavedPlan()
    const migrated = clampGlideYears(plan)
    if (validate(migrated)) return initialSavedPlan()
    if (legacy) {
      migrated.stockReturn = arithmeticToCagr(migrated.stockReturn, migrated.stockSD)
      migrated.bondReturn = arithmeticToCagr(migrated.bondReturn, migrated.bondSD)
    }
    if (validate(migrated)) return initialSavedPlan()
    const stockPresetId = legacy ? 'custom' : matchingPreset(stored.stockPresetId, 'stock', migrated.stockReturn, migrated.stockSD)
    const bondPresetId = legacy ? 'custom' : matchingPreset(stored.bondPresetId, 'bond', migrated.bondReturn, migrated.bondSD)
    // Normalize preset values saved before the two-decimal precision limit.
    const stock = presets.find(p => p.id === stockPresetId)
    const bond = presets.find(p => p.id === bondPresetId)
    if (stock) { migrated.stockReturn = stock.cagr; migrated.stockSD = stock.sd }
    if (bond) { migrated.bondReturn = bond.cagr; migrated.bondSD = bond.sd }
    return { version: 2, plan: migrated, stockPresetId, bondPresetId }
  } catch { return initialSavedPlan() }
}
