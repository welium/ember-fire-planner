// Offline calculation: pass a local JSON file containing [{date: 'YYYY-MM-DD', value: number}].
// No downloads or credentials are required. Output can be reconciled with snapshot.json.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const file = process.argv[2]
if (!file) throw new Error('Usage: node --experimental-strip-types scripts/build-assumption-presets.ts path/to/monthly-levels.json')
const input = readFileSync(file, 'utf8')
const rows: { date: string; value: number }[] = JSON.parse(input)
if (!Array.isArray(rows) || rows.length < 13) throw new Error('At least 13 monthly levels are required.')
for (let i = 0; i < rows.length; i++) {
  const row = rows[i]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || !Number.isFinite(row.value) || row.value <= 0) throw new Error(`Invalid observation ${i}`)
  if (i) {
    const previous = rows[i - 1]
    const month = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
    if (month(row.date) - month(previous.date) !== 1 || row.date <= previous.date) throw new Error(`Missing, duplicate, or unordered month at ${row.date}`)
  }
}
const returns = rows.slice(1).map((row, i) => row.value / rows[i].value - 1)
const mean = returns.reduce((a, b) => a + b, 0) / returns.length
const sd = Math.sqrt(returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1)) * Math.sqrt(12) * 100
const years = (Date.parse(rows.at(-1)!.date) - Date.parse(rows[0].date)) / 86400000 / 365.2425
const cagr = Math.expm1(Math.log(rows.at(-1)!.value / rows[0].value) / years) * 100
console.log(JSON.stringify({ start: rows[0].date, end: rows.at(-1)!.date, observations: rows.length, cagr, sd, sha256: createHash('sha256').update(input).digest('hex') }, null, 2))
