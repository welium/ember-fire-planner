import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { currencies, currencySymbols, formatMoney, languages, parsePreferences, translate } from './i18n'
import { translations } from './translations'
import { presets } from './assumption-presets'

describe('translations', () => {
  it('covers literal UI and validation messages in every supported language', () => {
    const keys = new Set<string>(presets.flatMap(p => [p.label, p.basis]))
    for (const file of ['main.tsx', 'simulation.ts', 'simulation.worker.ts']) {
      const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) keys.add(node.arguments[0].text)
        if (file === 'simulation.ts' && ts.isReturnStatement(node) && node.expression && ts.isStringLiteral(node.expression)) keys.add(node.expression.text)
        if (ts.isCallExpression(node) && node.expression.getText(source) === 'setError' && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) keys.add(node.arguments[0].text)
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    keys.delete('')
    const missing = [...keys].filter(key => !['·', '–'].includes(key) && !translations[key])
    expect(missing).toEqual([])
    for (const key of keys) {
      if (['·', '–'].includes(key)) continue
      for (const message of translations[key]) {
        expect(message.trim(), key).not.toBe('')
        expect([...message.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), key).toEqual([...key.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort())
      }
    }
  })
  it('interpolates dynamic values and falls back to the source message', () => {
    expect(translate('ja', 'Retire at {age}', { age: 50 })).toBe('50歳でリタイア')
    expect(translate('zh-Hant', 'Retire at {age}', { age: 50 })).toBe('50 歲退休')
    expect(translate('en', 'Retire at {age}', { age: 50 })).toBe('Retire at 50')
    expect(translate('ja', 'Unknown message')).toBe('Unknown message')
  })
})
describe('display preferences', () => {
  it('validates stored preferences and handles missing or invalid storage', () => {
    expect(parsePreferences('{"language":"ja","currency":"JPY"}')).toEqual({ language: 'ja', currency: 'JPY' })
    for (const value of [null, 'broken', 'null', '42', '{"language":"bad","currency":"bad"}']) expect(parsePreferences(value)).toEqual({ language: 'en', currency: 'USD' })
    expect(parsePreferences('{"language":"zh-Hant","currency":"bad"}')).toEqual({ language:'zh-Hant', currency:'USD' })
  })
  it('changes formatting without converting the numerical amount', () => {
    for (const language of languages) for (const currency of currencies) {
      const standard = new Intl.NumberFormat(language.locale, { style:'currency', currency, maximumFractionDigits:0 }).formatToParts(250000).map(p => p.type === 'currency' ? currencySymbols[currency] : p.value).join('')
      const compact = new Intl.NumberFormat(language.locale, { style:'currency', currency, maximumFractionDigits:1, notation:'compact' }).formatToParts(250000).map(p => p.type === 'currency' ? currencySymbols[currency] : p.value).join('')
      expect(formatMoney(250000, language.code, currency)).toBe(standard)
      expect(formatMoney(250000, language.code, currency, true)).toBe(compact)
    }
    expect(formatMoney(250000, 'zh-Hant', 'TWD')).toContain('NT$')
    expect(formatMoney(250000, 'en', 'USD')).toBe('$250,000')
    expect(formatMoney(250000, 'ja', 'JPY')).toBe('¥250,000')
  })
})
