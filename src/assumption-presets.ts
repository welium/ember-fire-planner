import snapshot from '../data/assumptions/snapshot.json'

export type Asset = 'stock' | 'bond'
export interface AssumptionPreset {
  id: string; asset: string; label: string; cagr: number; sd: number;
  start: string; end: string; source: string; basis: string;
}
export const presets: readonly AssumptionPreset[] = snapshot.presets.map(p => ({
  ...p, cagr: Number(p.cagr.toFixed(2)), sd: Number(p.sd.toFixed(2)),
}))
export const defaultStockPreset = presets.find(p => p.id === 'global-equity')!
export const defaultBondPreset = presets.find(p => p.id === 'global-ig-bonds')!
export function matchingPreset(id: unknown, asset: Asset, cagr: number, sd: number) {
  return presets.find(p => p.id === id && p.asset === asset && p.cagr === Number(cagr.toFixed(2)) && p.sd === Number(sd.toFixed(2)))?.id ?? 'custom'
}
