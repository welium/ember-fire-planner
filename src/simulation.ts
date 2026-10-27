export interface Plan {
  age: number; retirementAge: number; endAge: number; portfolio: number; contribution: number;
  spending: number; income: number; incomeAge: number; stockReturn: number; stockSD: number;
  bondReturn: number; bondSD: number; correlation: number; inflation: number; inflationSD: number; fee: number;
  startStocks: number; retirementStocks: number; glideYears: number; simulations: number;
}
// Global capital-market assumptions. See README for the derivation and sources.
export const defaults: Plan = { age: 30, retirementAge: 50, endAge: 95, portfolio: 250000, contribution: 24000, spending: 48000, income: 0, incomeAge: 67, stockReturn: 7.1, stockSD: 15.9, bondReturn: 5.8, bondSD: 5.5, correlation: 0.3, inflation: 2, inflationSD: 1.7, fee: 0.2, startStocks: 90, retirementStocks: 50, glideYears: 15, simulations: 5000 }
export interface Point { age: number; p10: number; p25: number; p50: number; p75: number; p90: number; success: number }
export interface Results { points: Point[]; success: number; successInterval: [number, number]; retirementBalance: number; endingBalance: number; withdrawalRate: number | null; seed: number }
export type StressId = 'lowerReturns' | 'muchLowerReturns' | 'higherInflation' | 'higherCorrelation'
export interface StressResult { id: StressId; plan: Plan; result: Results | null }
export interface Analysis extends Results { sensitivity: StressResult[] }
// Wilson score interval: retains uncertainty even when all paths succeed or fail.
export function successInterval(successes: number, count: number): [number, number] {
  const z = 1.959963984540054, fraction = successes / count, denominator = 1 + z * z / count
  const center = (fraction + z * z / (2 * count)) / denominator
  const radius = z * Math.sqrt(fraction * (1 - fraction) / count + z * z / (4 * count * count)) / denominator
  return [Math.max(0, center - radius) * 100, Math.min(1, center + radius) * 100]
}
// Exact stress shifts; unavailable inputs are reported instead of silently clamped.
export function analyze(p: Plan, seed = 42): Analysis {
  const baseline = simulate(p, seed)
  const variants: { id: StressId; changes: Partial<Plan> }[] = [
    { id: 'lowerReturns', changes: { stockReturn: p.stockReturn - 1, bondReturn: p.bondReturn - 1 } },
    { id: 'muchLowerReturns', changes: { stockReturn: p.stockReturn - 2, bondReturn: p.bondReturn - 2 } },
    { id: 'higherInflation', changes: { inflation: p.inflation + 1 } },
    { id: 'higherCorrelation', changes: { correlation: Math.max(0.7, p.correlation) } },
  ]
  return { ...baseline, sensitivity: variants.map(({ id, changes }) => {
    const plan = { ...p, ...changes }
    return { id, plan, result: validate(plan) ? null : simulate(plan, seed) }
  }) }
}
export function validate(p: Plan): string | null {
  if (Object.values(p).some(v => !Number.isFinite(v))) return 'Please enter a valid number in every field.'
  if (p.age < 18 || p.age >= p.retirementAge || p.retirementAge >= p.endAge || p.endAge > 110) return 'Use ages between 18 and 110, with retirement after your current age and before the plan ends.'
  if ([p.age, p.retirementAge, p.endAge, p.incomeAge, p.glideYears, p.simulations].some(v => !Number.isInteger(v))) return 'Ages, glide path years, and simulation count must be whole numbers.'
  if ([p.portfolio,p.contribution,p.spending,p.income].some(v => v < 0 || v > 1e10)) return 'Financial amounts must be between 0 and 10 billion.'
  if (p.stockReturn < -20 || p.stockReturn > 30 || p.bondReturn < -20 || p.bondReturn > 30 || p.stockSD < 0 || p.stockSD > 60 || p.bondSD < 0 || p.bondSD > 60) return 'Returns must be between −20% and 30%, and volatility between 0% and 60%.'
  if (p.correlation < -1 || p.correlation > 1 || p.inflation < 0 || p.inflation > 15 || p.inflationSD < 0 || p.inflationSD > 15 || p.fee < 0 || p.fee > 5) return 'Check correlation (−1 to 1), inflation (0–15%), inflation volatility (0–15%), and fees (0–5%).'
  if (p.startStocks < 0 || p.startStocks > 100 || p.retirementStocks < 0 || p.retirementStocks > p.startStocks || p.glideYears < 0) return 'Stock allocations must be between 0 and 100%; the retirement allocation cannot exceed today’s. Glide years cannot be negative.'
  if (p.glideYears > maxGlideYears(p)) return 'Glide years cannot exceed the years left until retirement.'
  if (p.incomeAge < 18 || p.incomeAge > 110 || p.simulations < 100 || p.simulations > 20000) return 'Income age must be 18–110 and simulations must be 100–20,000.'
  return null
}
// The glide cannot start before today.
export function maxGlideYears(p: Pick<Plan, 'age' | 'retirementAge'>) {
  return Math.max(0, p.retirementAge - p.age)
}
// Clamp a plan's glide length to the feasible window after age changes.
// Incomplete or invalid ages must not overwrite the user's glide setting.
export function clampGlideYears(p: Plan): Plan {
  if (!Number.isInteger(p.age) || !Number.isInteger(p.retirementAge) || p.age < 18 || p.retirementAge <= p.age || p.retirementAge > 109) return p
  const max = maxGlideYears(p)
  if (!Number.isFinite(p.glideYears)) return p
  return p.glideYears <= max ? p : { ...p, glideYears: max }
}
export function stockWeight(age: number, p: Plan) {
  if (age >= p.retirementAge) return p.retirementStocks / 100
  if (!p.glideYears) return p.startStocks / 100
  const progress = Math.max(0, Math.min(1, (age - (p.retirementAge - p.glideYears)) / p.glideYears))
  return (p.startStocks + progress * (p.retirementStocks - p.startStocks)) / 100
}
function randomGenerator(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
function logParameters(mean: number, sd: number) {
  const variance = Math.log(1 + (sd / 100) ** 2 / (1 + mean / 100) ** 2)
  return { mu: Math.log(1 + mean / 100) - variance / 2, sigma: Math.sqrt(variance) }
}
export function simulate(p: Plan, seed = 42): Results {
  const error = validate(p); if (error) throw new Error(error)
  const random = randomGenerator(seed), years = p.endAge - p.age
  const balances: number[][] = Array.from({ length: years + 1 }, () => [])
  const survived = new Uint32Array(years + 1)
  const stocks = logParameters(p.stockReturn, p.stockSD), bonds = logParameters(p.bondReturn, p.bondSD)
  for (let run = 0; run < p.simulations; run++) {
    let wealth = p.portfolio, failed = false
    balances[0].push(wealth); survived[0]++
    for (let year = 0; year < years; year++) {
      const age = p.age + year, retired = age >= p.retirementAge
      if (retired) {
        const needed = p.spending - (age >= p.incomeAge ? p.income : 0)
        if (needed > wealth + 1e-8) failed = true
        wealth = Math.max(0, wealth - needed)
      }
      const u1 = random(), u2 = random(), u3 = random(), u4 = random()
      const radius = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12))), angle = 2 * Math.PI * u2
      const z1 = radius * Math.cos(angle), z2 = p.correlation * z1 + Math.sqrt(1 - p.correlation ** 2) * radius * Math.sin(angle)
      // Inflation is independent of returns. The second Box-Muller pair supplies its shock.
      const inflationRadius = Math.sqrt(-2 * Math.log(Math.max(u3, 1e-12)))
      const inflation = p.inflation + p.inflationSD * inflationRadius * Math.cos(2 * Math.PI * u4)
      const w = stockWeight(age, p)
      const growth = w * Math.exp(stocks.mu + stocks.sigma * z1) + (1 - w) * Math.exp(bonds.mu + bonds.sigma * z2)
      wealth *= growth * (1 - p.fee / 100) / Math.max(0.01, 1 + inflation / 100)
      if (!retired) wealth += p.contribution
      balances[year + 1].push(wealth)
      if (!failed) survived[year + 1]++
    }
  }
  const points = balances.map((values, i) => {
    values.sort((a,b) => a-b)
    const q = (percent: number) => { const index = (values.length - 1) * percent, low = Math.floor(index); return values[low] + (values[Math.ceil(index)] - values[low]) * (index - low) }
    return { age: p.age + i, p10: q(.1), p25: q(.25), p50: q(.5), p75: q(.75), p90: q(.9), success: survived[i] / p.simulations * 100 }
  })
  const retirementBalance = points[p.retirementAge - p.age].p50
  const withdrawal = Math.max(0, p.spending - (p.retirementAge >= p.incomeAge ? p.income : 0))
  return { points, success: points[years].success, successInterval: successInterval(survived[years], p.simulations), retirementBalance, endingBalance: points[years].p50, withdrawalRate: retirementBalance ? withdrawal / retirementBalance * 100 : withdrawal ? null : 0, seed }
}
