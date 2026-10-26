import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { translations } from './translations'

export const languages = [
  { code: 'en', label: 'English', locale: 'en-US' },
  { code: 'zh-Hant', label: '繁體中文', locale: 'zh-TW' },
  { code: 'zh-Hans', label: '简体中文', locale: 'zh-CN' },
  { code: 'ja', label: '日本語', locale: 'ja-JP' },
] as const
export const currencies = ['USD', 'TWD', 'HKD', 'CNY', 'JPY', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'CHF', 'KRW'] as const
export type Language = typeof languages[number]['code']
export type Currency = typeof currencies[number]
export interface Preferences { language: Language; currency: Currency }
export const defaultPreferences: Preferences = { language: 'en', currency: 'USD' }
// Intl renders several dollar currencies as "$"; explicit symbols keep the display unambiguous.
export const currencySymbols: Record<Currency, string> = { USD: '$', TWD: 'NT$', HKD: 'HK$', CNY: 'CN¥', JPY: '¥', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', SGD: 'S$', CHF: 'CHF', KRW: '₩' }

export function parsePreferences(saved: string | null): Preferences {
  try {
    const value: unknown = JSON.parse(saved ?? 'null')
    if (!value || typeof value !== 'object') return defaultPreferences
    const { language, currency } = value as Record<string, unknown>
    return {
      language: languages.some(l => l.code === language) ? language as Language : defaultPreferences.language,
      currency: currencies.includes(currency as Currency) ? currency as Currency : defaultPreferences.currency,
    }
  } catch { return defaultPreferences }
}
export function translate(language: Language, key: string, values: Record<string, string | number> = {}): string {
  const index = { en: -1, 'zh-Hant': 0, 'zh-Hans': 1, ja: 2 }[language]
  const message = index < 0 ? key : translations[key]?.[index] ?? key
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder))
}
export function formatMoney(amount: number, language: Language, currency: Currency, compact = false): string {
  const locale = languages.find(l => l.code === language)!.locale
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: compact ? 1 : 0, notation: compact ? 'compact' : 'standard' }).formatToParts(amount)
  return parts.map(part => part.type === 'currency' ? currencySymbols[currency] : part.value).join('')
}
function createFormatters(preferences: Preferences) {
  const { language, currency } = preferences
  const locale = languages.find(l => l.code === language)!.locale
  return {
    t: (key: string, values?: Record<string, string | number>) => translate(language, key, values),
    money: (amount: number, compact = false) => formatMoney(amount, language, currency, compact),
    number: (value: number) => new Intl.NumberFormat(locale).format(value),
    pct: (value: number) => new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 100),
    symbol: currencySymbols[currency],
  }
}
const I18nContext = createContext({
  ...defaultPreferences,
  ...createFormatters(defaultPreferences),
  setLanguage: (_language: Language) => {},
  setCurrency: (_currency: Currency) => {},
})
export function I18nProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    try { return parsePreferences(localStorage.getItem('ember-preferences')) } catch { return defaultPreferences }
  })
  useEffect(() => {
    document.documentElement.lang = preferences.language
    document.title = translate(preferences.language, 'Ember — Your path to financial freedom')
    try { localStorage.setItem('ember-preferences', JSON.stringify(preferences)) } catch { /* Preferences still work when browser storage is unavailable. */ }
  }, [preferences])
  return <I18nContext.Provider value={{
    ...preferences, ...createFormatters(preferences),
    setLanguage: language => setPreferences(p => ({ ...p, language })),
    setCurrency: currency => setPreferences(p => ({ ...p, currency })),
  }}>{children}</I18nContext.Provider>
}
export const useI18n = () => useContext(I18nContext)
