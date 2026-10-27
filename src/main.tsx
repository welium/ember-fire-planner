import React, { useEffect, useRef, useState } from 'react'
import { I18nProvider, useI18n, languages, currencies } from './i18n'
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, ChevronRight, CircleHelp, Flame, Globe2, Info, Leaf, Menu, Play, Plus, RotateCcw, ShieldCheck, SlidersHorizontal, TrendingUp, Wallet, X } from 'lucide-react'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/manrope'
import { analyze, clampGlideYears, defaults, maxGlideYears, simulate, stockWeight, validate } from './simulation'
import type { Analysis, Plan, Results, Point, StressId } from './simulation'
import { presets, defaultStockPreset, defaultBondPreset } from './assumption-presets'
import type { Asset } from './assumption-presets'
import { initialSavedPlan, parseSavedPlan } from './plan-storage'
import './styles.css'

type Tab = 'Today' | 'Retirement' | 'Other income' | 'Investments' | 'Advanced assumptions'
function loadPlan() {
  try { return parseSavedPlan(localStorage.getItem('ember-plan')) }
  catch { return initialSavedPlan() }
}
// Above this size a synchronous run would freeze the UI, so the Worker
// fallback only applies to smaller plans.
const SYNC_FALLBACK_LIMIT = 2000
export default function App() {
  return <I18nProvider><Planner/></I18nProvider>
}
function Planner() {
  const { t, money, pct, number, currency, language, setLanguage, setCurrency, symbol } = useI18n()
  const [loaded] = useState(loadPlan)
  const [plan, setPlan] = useState<Plan>(loaded.plan)
  const [periods, setPeriods] = useState<Record<string, 'annual' | 'monthly'>>({})
  const [stockPresetId, setStockPresetId] = useState(loaded.stockPresetId)
  const [bondPresetId, setBondPresetId] = useState(loaded.bondPresetId)
  const [submitted, setSubmitted] = useState<Plan>(plan)
  const [calculatedPlan, setCalculatedPlan] = useState<Plan>(plan)
  const [result, setResult] = useState<Analysis | null>(null)
  const [tab, setTab] = useState<Tab>('Today')
  const [busy, setBusy] = useState(true)
  const [validationShown, setValidationShown] = useState(false)
  const [error, setError] = useState('')
  const [example, setExample] = useState(() => { try { return !localStorage.getItem('ember-plan') } catch { return true } })
  const [saved, setSaved] = useState(false)
  const [modal, setModal] = useState<'method' | 'scenarios' | null>(null)
  const [nav, setNav] = useState('Plan')
  const [mobileNav, setMobileNav] = useState(false)
  const [undoPlan, setUndoPlan] = useState<Plan | null>(null)
  const [scenarioResults, setScenarioResults] = useState<{ name: string; result: Results; plan: Plan }[]>([])
  const [scenarioSignature, setScenarioSignature] = useState<string | null>(null)
  const [scenarioBusy, setScenarioBusy] = useState(false)
  const worker = useRef<Worker | null>(null)
  const scenarioWorkers = useRef<Worker[]>([])
  const dirty = JSON.stringify(plan) !== JSON.stringify(calculatedPlan)

  const run = (next: Plan = plan) => {
    const issue = validate(next)
    if (issue) { showValidation(); return }
    worker.current?.terminate()
    // Keep the previous result paired with calculatedPlan until this run succeeds.
    setBusy(true); setError(''); setSubmitted({ ...next })
    const start = (instance: Worker) => {
      worker.current = instance
      instance.onmessage = (event) => { if (event.data.error) setError(event.data.error); else { setResult(event.data.result); setCalculatedPlan({ ...next }) }; setBusy(false); instance.terminate() }
      instance.onerror = () => { setError('The simulation could not finish. Please try again.'); setBusy(false); instance.terminate() }
      instance.postMessage({ plan: next, seed: 42, analysis: true })
    }
    try {
      start(new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }))
    } catch {
      // Workers are unavailable in some browsers (for example Firefox < 114).
      // Fall back to running synchronously for small plans so the page stays usable.
      if (next.simulations <= SYNC_FALLBACK_LIMIT) {
        try { setResult(analyze(next, 42)); setCalculatedPlan({ ...next }); setBusy(false) }
        catch (error) { setError(error instanceof Error ? error.message : 'The simulation could not finish. Please try again.'); setBusy(false) }
      } else {
        setError('The simulation could not finish. Please try again.'); setBusy(false)
      }
    }
  }
  useEffect(() => { run(plan); return () => { worker.current?.terminate(); scenarioWorkers.current.forEach(w => w.terminate()) } }, []) // Initial simulation; subsequent runs are explicit.
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { closeModal(); setMobileNav(false) } }
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close)
  }, [])
  useEffect(() => {
    if (!modal && !mobileNav) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const dialog = document.querySelector(modal ? '.modal' : '.sidebar') as HTMLElement | null
    if (dialog && mobileNav) dialog.inert = false
    dialog?.querySelector<HTMLElement>(modal ? '.modal-close' : '.nav-close')?.focus()
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialog) return
      const focusables = [...dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(el => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      if (focusables.length === 0) { e.preventDefault(); return }
      const first = focusables[0], last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { document.removeEventListener('keydown', trap); previouslyFocused?.focus?.() }
  }, [modal, mobileNav])
  useEffect(() => {
    const sidebar = document.querySelector<HTMLElement>('.sidebar')
    const media = matchMedia('(max-width:760px)')
    const sync = () => { if (sidebar) sidebar.inert = media.matches && !mobileNav }
    sync(); media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [mobileNav])
  const update = (key: keyof Plan, value: number) => {
    // Age fields may contain partial numbers while typing. Apply their
    // glide constraint on blur, once the user has finished the edit.
    setPlan(p => ({ ...p, [key]: value }))
    if (key === 'stockReturn' || key === 'stockSD') setStockPresetId('custom')
    if (key === 'bondReturn' || key === 'bondSD') setBondPresetId('custom')
    setSaved(false); setExample(false)
  }
  const fieldErrors: Partial<Record<keyof Plan, string>> = {}
  for (const key of Object.keys(plan) as (keyof Plan)[]) {
    if (!Number.isFinite(plan[key])) fieldErrors[key] = t("Enter a valid number.")
  }
  if (plan.age < 18 || plan.age > 109) fieldErrors.age = t("Current age must be between 18 and 109.")
  if (plan.retirementAge <= plan.age || plan.retirementAge > 109) fieldErrors.retirementAge = t("Retirement age must be later than your current age and no later than 109.")
  if (plan.endAge <= plan.retirementAge || plan.endAge > 110) fieldErrors.endAge = t("Planning age must be later than retirement and no later than 110.")
  if (plan.incomeAge < 18 || plan.incomeAge > 110) fieldErrors.incomeAge = t("Income age must be between 18 and 110.")
  const limits: Partial<Record<keyof Plan, [number, number]>> = { portfolio:[0,1e10], contribution:[0,1e10], spending:[0,1e10], income:[0,1e10], stockReturn:[-20,30], bondReturn:[-20,30], stockSD:[0,60], bondSD:[0,60], correlation:[-1,1], inflation:[0,15], inflationSD:[0,15], fee:[0,5], simulations:[100,20000] }
  for (const [key, [min, max]] of Object.entries(limits) as [keyof Plan, [number, number]][]) {
    if (plan[key] < min || plan[key] > max) fieldErrors[key] = t("Enter a value from {min} to {max}.", { min: number(min), max: number(max) })
  }
  for (const key of ['age','retirementAge','endAge','incomeAge','glideYears','simulations'] as (keyof Plan)[]) {
    if (Number.isFinite(plan[key]) && !Number.isInteger(plan[key])) fieldErrors[key] = t("Enter a whole number.")
  }
  const fieldTab = (key: keyof Plan): Tab => ['age','portfolio','contribution'].includes(key) ? 'Today' : ['retirementAge','endAge','spending'].includes(key) ? 'Retirement' : ['income','incomeAge'].includes(key) ? 'Other income' : ['startStocks','retirementStocks','glideYears'].includes(key) ? 'Investments' : 'Advanced assumptions'
  const showValidation = () => {
    setValidationShown(true)
    const first = (Object.keys(plan) as (keyof Plan)[]).find(key => fieldErrors[key])
    if (first) {
      setTab(fieldTab(first))
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-field="' + first + '"] input')?.focus())
    } else setError(validate(plan) ?? '')
  }
  const presetField = (asset: Asset) => {
    const id = asset === 'stock' ? stockPresetId : bondPresetId
    const selected = presets.find(p => p.id === id)
    return <div className="preset-field"><label><span className="field-label">{asset === 'stock' ? t('Stock preset') : t('Bond preset')}</span><select value={id} onChange={e => {
      const next = presets.find(p => p.id === e.target.value && p.asset === asset)
      setExample(false)
       const select = asset === 'stock' ? setStockPresetId : setBondPresetId
      select(next?.id ?? 'custom')
      if (next) setPlan(p => asset === 'stock' ? { ...p, stockReturn: next.cagr, stockSD: next.sd } : { ...p, bondReturn: next.cagr, bondSD: next.sd })
      setSaved(false)
    }}><option value="custom">{t('Custom')}</option>{presets.filter(p => p.asset === asset).map(p => <option key={p.id} value={p.id}>{t(p.label)}</option>)}</select></label>{selected && <p>{t('USD unhedged total return')} · {selected.start} – {selected.end}<br/><a href={selected.source} target="_blank" rel="noreferrer">{t(selected.basis)}</a></p>}</div>
  }
  const closeModal = () => { setModal(null); setNav('Plan') }
  const navigate = (target: string) => {
    setNav(target); setMobileNav(false)
    if (target === 'Compare') { setModal('scenarios'); compare(); return }
    setModal(null)
    document.getElementById(target === 'Results' ? 'results' : 'planner')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const save = () => {
    const issue = validate(plan); if (issue) { showValidation(); return }
    try { localStorage.setItem('ember-plan', JSON.stringify({ version: 2, plan, stockPresetId, bondPresetId })); setSaved(true); setTimeout(() => setSaved(false), 3000) } catch { setError('Your browser could not save this plan. You can still export your projection.') }
  }
  const exportData = () => {
    if (!result) return
    const headers = ['Age', '10th percentile', '25th percentile', 'Median', '75th percentile', '90th percentile', 'Survival probability (%)'].map((key, i) => i > 0 && i < 6 ? t(key) + ' (' + currency + ')' : t(key))
    const csv = '\uFEFF' + [headers.map(header => '"' + header.replaceAll('"', '""') + '"').join(','), ...result.points.map(p => [p.age,p.p10,p.p25,p.p50,p.p75,p.p90,p.success].join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `ember-retirement-projection-${currency}.csv`; a.click(); URL.revokeObjectURL(url)
  }
  const compare = () => {
    const issue = validate(plan); if (issue) { showValidation(); return }
    scenarioWorkers.current.forEach(w => w.terminate()); scenarioWorkers.current = []
    setScenarioBusy(true); setScenarioResults([]); setScenarioSignature(JSON.stringify(plan))
    const variants = [{ name: 'Your current plan', plan: { ...plan } }, { name: 'Retire 3 years later', plan: { ...plan, retirementAge: Math.min(plan.retirementAge + 3, plan.endAge - 1) } }, { name: 'Spend 10% less', plan: { ...plan, spending: Math.round(plan.spending * .9) } }]
    let finished = 0
    variants.forEach(variant => {
      const finish = () => { finished++; if (finished === variants.length) setScenarioBusy(false) }
      const finishWorker = (w: Worker) => { finish(); w.terminate() }
      const recordResult = (result: Results) => setScenarioResults(prev => [...prev, { ...variant, result }])
      try {
        const w = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }); scenarioWorkers.current.push(w)
        w.onmessage = (e) => { if (e.data.result) recordResult(e.data.result); else setError(e.data.error); finishWorker(w) }
        w.onerror = () => { setError('A scenario could not finish. Please try again.'); finishWorker(w) }
        w.postMessage({ plan: variant.plan, seed: 42 })
      } catch {
        // Same gated synchronous fallback as run(): small plans stay usable
        // where Workers are blocked, large plans surface the error instead.
        if (variant.plan.simulations <= SYNC_FALLBACK_LIMIT) {
          try { recordResult(simulate(variant.plan, 42)) }
          catch (error) { setError(error instanceof Error ? error.message : 'A scenario could not finish. Please try again.') }
        } else {
          setError('A scenario could not finish. Please try again.')
        }
        finish()
      }
    })
  }
  const scenariosStale = scenarioSignature !== null && scenarioSignature !== JSON.stringify(plan)
  const field = (key: keyof Plan, label: string, options: { prefix?: string; suffix?: string; hint?: string; step?: number; min?: number; max?: number } = {}) => <label className="field" key={key} data-field={key}><span className="field-label">{label}{options.hint && <span className="hint-icon"><CircleHelp size={16}/></span>}</span>{options.hint && <span className="field-help">{options.hint}</span>}<span className="input-wrap">{options.prefix && <span>{options.prefix}</span>}{['portfolio','contribution','spending','income'].includes(key) ? <FinancialInput label={label} value={plan[key]} divisor={periods[key] === 'monthly' ? 12 : 1} format={number} error={validationShown ? fieldErrors[key] : undefined} fieldKey={key} onChange={value => update(key, value)}/> : <input aria-label={label} aria-invalid={validationShown && !!fieldErrors[key]} aria-describedby={validationShown && fieldErrors[key] ? `error-${key}` : undefined} type="number" min={options.min ?? 0} max={options.max} step={options.step ?? 1} value={Number.isNaN(plan[key]) ? '' : plan[key]} onChange={e => update(key, e.target.value === '' ? NaN : Number(e.target.value))} onBlur={() => { if (key === 'age' || key === 'retirementAge') setPlan(p => clampGlideYears(p)) }}/>}{options.suffix && !["contribution","spending","income"].includes(key) && <span className="input-suffix">{options.suffix}</span>}</span>{["contribution","spending","income"].includes(key) && <select aria-label={t("Entry period for {field}", { field: label })} value={periods[key] ?? "annual"} onChange={e => setPeriods(p => ({ ...p, [key]: e.target.value as "annual" | "monthly" }))}><option value="annual">{t("Per year")}</option><option value="monthly">{t("Per month")}</option></select>}{validationShown && fieldErrors[key] && <span className="field-error" id={`error-${key}`}>{fieldErrors[key]}</span>}</label>
  const success = result?.success ?? 0
  const showResult = result !== null
  const projectionStatus = busy ? t("Updating projection…") : dirty ? t("Inputs changed — update projection") : result ? t("Up to date") : t("Projection unavailable")
  // Preserve the scale during partial age edits; clamp the value on blur.
  const rawMaxGlide = maxGlideYears(plan)
  const maxGlide = Number.isFinite(rawMaxGlide) ? Math.max(rawMaxGlide, plan.glideYears) : plan.glideYears
  return <div className="app-shell">
    {mobileNav && <button className="nav-backdrop" aria-label={t("Close navigation")} onClick={() => setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}><button className="nav-close" aria-label={t("Close navigation")} onClick={() => setMobileNav(false)}><X size={22}/></button>
      <a className="brand" href="#" aria-label={t("Ember home")} onClick={e => { e.preventDefault(); navigate('Plan') }}><span className="brand-symbol"><Flame size={25} fill="currentColor" strokeWidth={1.6}/></span>ember<span className="brand-dot">.</span></a>
      <div className="workspace"><span className="workspace-avatar">P</span><span>{t("Personal workspace")}<small>{t("Your next chapter")}</small></span><ChevronDown size={14}/></div>
      <div className="nav-label">{t("YOUR PLAN")}</div>
      <nav>{[{ name: 'Plan', icon: <Globe2/> }, { name: 'Results', icon: <TrendingUp/> }, { name: 'Compare', icon: <SlidersHorizontal/> }].map(item => <button key={item.name} className={`nav-item ${nav === item.name ? 'active' : ''}`} aria-current={nav === item.name ? "page" : undefined} onClick={() => navigate(item.name)}>{item.icon}<span>{t(item.name)}</span>{nav === item.name && <span className="active-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="little-card"><span className="little-icon"><Leaf size={19}/></span><strong>{t("A little clarity.")}<br/>{t("A lot of possibility.")}</strong><p>{t("A thoughtful plan for a life")}<br/>{t("that’s yours to choose.")}</p><button onClick={() => setModal('method')}>{t("Meet the methodology")} <ArrowRight size={14}/></button></div><button className="help-link" onClick={() => setModal('method')}><CircleHelp size={17}/> {t("How Ember works")} <ArrowRight size={14}/></button><div className="local-note"><span/>{t("Private by design. Saved on this device.")}</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="mobile-menu" aria-label={t("Open navigation")} aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)}><Menu size={20}/></button><span>{t("Your plan")}</span><ChevronRight size={13}/><strong>{t(nav)}</strong></div><div className="header-right"><div className="display-preferences"><select aria-label={t('Language')} value={language} onChange={e => setLanguage(e.target.value as typeof language)}>{languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select><select aria-label={t('Currency')} title={t('Display only. Amounts are not converted.')} value={currency} onChange={e => setCurrency(e.target.value as typeof currency)}>{currencies.map(c => <option key={c} value={c}>{c}</option>)}</select></div><span className="private-badge"><ShieldCheck size={14}/> {t("Your data stays yours")}</span><button className="avatar" onClick={save} aria-label={t("Save personal plan")}>P</button></div></header>
      <main id="planner">
        <div className="page-title"><div><div className="eyebrow"><span/> {t("MAKE ROOM FOR WHAT MATTERS")}</div><h1>{t("Your freedom, by design")}<span>.</span></h1><p>{t("Explore the possibilities. Build a plan you can believe in.")}</p></div><button className="button secondary save-button" onClick={save}>{saved ? <Check size={16}/> : <ArrowDownToLine size={16}/>} {saved ? t("Plan saved") : t("Save plan")}</button></div>
        {undoPlan && <div className="apply-notice" role="status">{t("Changes applied.")} <button className="button secondary" onClick={() => { setPlan(undoPlan); run(undoPlan); setSaved(false); setUndoPlan(null) }}>{t("Undo")}</button></div>}
        <div className="planner-grid">
          <section className="card plan-card"><div className="card-heading"><div><h2>{t("Build your plan")}</h2>{example && <span className="example-label">{t("Example plan")}</span>}<p>{t("A few numbers. A clearer picture.")}</p></div><span className="icon-tile"><SlidersHorizontal size={18}/></span></div>
            <div className="tabs" role="tablist">{(['Today', 'Retirement', 'Other income', 'Investments', 'Advanced assumptions'] as Tab[]).map(tabName => <button key={tabName} role="tab" id={`tab-${tabName.replaceAll(" ", "-")}`} aria-controls="plan-panel" tabIndex={tab === tabName ? 0 : -1} aria-selected={tab === tabName} onKeyDown={e => { const tabs: Tab[] = ["Today","Retirement","Other income","Investments","Advanced assumptions"]; const index = tabs.indexOf(tabName); const next = e.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] : e.key === "ArrowLeft" ? tabs[(index + tabs.length - 1) % tabs.length] : e.key === "Home" ? tabs[0] : e.key === "End" ? tabs[tabs.length - 1] : null; if (next) { e.preventDefault(); setTab(next); requestAnimationFrame(() => document.getElementById(`tab-${next.replaceAll(" ", "-")}`)?.focus()) } }} onClick={() => setTab(tabName)}>{t(tabName)}</button>)}</div>
            <div className="plan-fields" role="tabpanel" id="plan-panel" aria-labelledby={`tab-${tab.replaceAll(" ", "-")}`}>
              {tab === 'Today' && <><div className="field-row">{field('age',t("Current age"),{suffix:t("years"),min:18,max:109})}</div>{field('portfolio',t("Current portfolio"),{prefix:symbol,hint:t("Your total investable assets, excluding your home.")})}{field('contribution',t("Annual contributions"),{prefix:symbol,suffix:t("/ year"),hint:t("After-tax savings invested each year, increasing with inflation.")})}<div className="field-footnote"><Info size={13}/> {t("All amounts are in today’s money ({currency}).", { currency })}</div></>}
              {tab === 'Retirement' && <><div className="field-row">{field('retirementAge',t("Retirement age"),{suffix:t("years"),min:19,max:109})}{field('endAge',t("Plan through age"),{suffix:t("years"),min:20,max:110})}</div>{field('spending',t("Annual retirement spending"),{prefix:symbol,suffix:t("/ year")})}</>}
              {tab === 'Other income' && <>{field('income',t("Annual retirement income"),{prefix:symbol,suffix:t("/ year"),hint:t("After-tax pension or benefits, assumed to rise with inflation.")})}{field('incomeAge',t("Income starts at age"),{suffix:t("years"),min:18,max:110})}<div className="field-footnote"><Info size={13}/> {t("Income offsets spending once you retire.")}</div></>}
              {tab === 'Investments' && <section className="investment-editor" id="glide-path"><div className="section-heading"><div className="heading-with-icon"><span className="icon-tile"><TrendingUp size={18}/></span><div><h2>{t("A little less risk, as life moves forward")}</h2><p>{t("Your portfolio evolves with your priorities.")}</p></div></div><span className="subtle-badge">{t("Glide path")}</span></div><div className="glide-layout"><div className="glide-controls"><RangeField label={t("Stocks today")} value={plan.startStocks} onChange={v => update('startStocks', v)} min={0} max={100} allowedMin={plan.retirementStocks} suffix="%"/><RangeField label={t("Stocks at retirement")} value={plan.retirementStocks} onChange={v => update('retirementStocks', v)} min={0} max={100} allowedMax={plan.startStocks} suffix="%"/><RangeField label={t("Start reducing risk")} value={plan.glideYears} onChange={v => update('glideYears', v)} min={0} max={maxGlide} suffix={t("years before")}/></div><GlideChart plan={plan}/></div><div className="glide-note"><ShieldCheck size={14}/><span>{t("Gradually shift from stocks to bonds. Rebalanced annually.")}</span><button onClick={() => setModal('method')} aria-label={t("Learn about glide paths")}><CircleHelp size={14}/></button></div></section>}
              {tab === 'Advanced assumptions' && <><div className="assumption-label">{t("NOMINAL ANNUAL RETURNS (CAGR)")}</div>{presetField('stock')}<div className="field-row">{field('stockReturn',t("Stock return"),{suffix:'%',step:.1,min:-20,max:30,hint:t("Nominal annual compound return (CAGR), including reinvested dividends.")})}{field('stockSD',t("Stock volatility (SD)"),{suffix:'%',step:.1,max:60,hint:t("Annualized standard deviation of simple returns.")})}</div>{presetField('bond')}<div className="field-row">{field('bondReturn',t("Bond return"),{suffix:'%',step:.1,min:-20,max:30,hint:t("Nominal annual compound return (CAGR), including reinvested coupons.")})}{field('bondSD',t("Bond volatility (SD)"),{suffix:'%',step:.1,max:60,hint:t("Annualized standard deviation of simple returns.")})}</div><div className="field-row">{field('inflation',t("Inflation"),{suffix:'%',step:.1,max:15,hint:t("Average annual inflation. Prices are sampled around this rate.")})}{field('inflationSD',t("Inflation volatility (SD)"),{suffix:'%',step:.1,max:15,hint:t("Annualized standard deviation of inflation. Inflation is sampled independently each year.")})}</div><div className="field-row">{field('correlation',t("Stock–bond correlation"),{step:.05,min:-1,max:1,hint:t("Correlation between annual stock and bond returns. The default is an illustrative assumption; presets do not change it.")})}{field('fee',t("Annual fees"),{suffix:'%',step:.05,max:5})}</div><div className="field-row single">{field('simulations',t("Simulations"),{step:100,min:100,max:20000})}</div></>}
            </div>
            <div className="plan-card-bottom">{error && <p className="error" role="alert">{t(error)}</p>}<button className="button primary run-button" onClick={() => run()} disabled={busy}>{busy ? <span className="spinner"/> : <Play size={14} fill="currentColor"/>}{busy ? t("Exploring your future…") : t("Update projection")}{!busy && <ArrowRight size={16}/>}</button><div className="projection-action-status" role="status">{projectionStatus}</div><div className="simulation-note">{dirty ? t("You have changes ready to explore") : t("{count} possible futures. One more informed you.", { count: number(result ? calculatedPlan.simulations : submitted.simulations) })}</div></div>
          </section>
          <div className="results-column" id="results" aria-busy={busy}>
            <div className={`projection-status ${dirty ? "pending" : ""}`}><strong>{projectionStatus}</strong>{result && <span>{t("Exports use the last calculated projection.")}</span>}</div>
            <div className="metric-grid"><section className="card success-card"><div className="metric-label">{t("Simulated retirement funding")} <CircleHelp size={13} aria-label={t("Share of simulations that fund every retirement year")}/></div><div className="success-main"><strong>{showResult ? Math.round(success) : '—'}<span>%</span></strong></div><p>{t("Your plan funded retirement in {rate} of simulations.", { rate: pct(success) })}</p><p>{t("Retire at {age}", { age: calculatedPlan.retirementAge })} · {money(calculatedPlan.spending)} {t("/ year")} · {t("Plan through age")} {calculatedPlan.endAge}</p><p>{t("Explore changes to retirement age or spending.")}</p>{showResult && <details><summary>{t("About this estimate")}</summary><p>{t("95% sampling interval: {low}–{high}", { low: pct(result.successInterval[0]), high: pct(result.successInterval[1]) })}</p></details>}<p>{t("Results depend on your assumptions. The sampling interval measures simulation noise only; it does not cover uncertainty about future markets.")}</p><div className="success-track"><span style={{width:`${showResult ? success : 0}%`}}/></div><div className="metric-bottom">{t("Based on {count} simulated lifetimes", { count: number(submitted.simulations) })} <ShieldCheck size={13}/></div></section>
              <section className="card balance-card"><div className="metric-label">{t("Portfolio at retirement")} <Wallet size={15}/></div><strong className="metric-number">{showResult ? money(result.retirementBalance, true) : '—'}</strong><p>{t("Median balance at age {age}", { age: calculatedPlan.retirementAge })}</p><div className="metric-divider"/><div className="small-metric"><span>{t("Initial withdrawal rate")}</span><strong>{showResult && result.withdrawalRate !== null ? pct(result.withdrawalRate) : '—'}</strong></div><span className="muted tiny">{t("In today’s dollars, before withdrawals")}</span></section>
            </div>
            <section className="card projection-card"><div className="projection-heading"><div><h2>{t("A thousand ways your future could unfold")}</h2><p>{t("Portfolio value over time, adjusted for inflation")}</p></div><button className="icon-button" aria-label={t("Download projection as CSV")} title={t("Download projection as CSV")} onClick={exportData} disabled={!result}><ArrowDownToLine size={17}/></button></div><div className="chart-legend"><span><i className="legend-line"/>{t("Median outcome")}</span><span><i className="legend-square inner"/>{t("25th–75th percentile")}</span><span><i className="legend-square outer"/>{t("10th–90th percentile")}</span></div>{result ? <Projection points={result.points} plan={calculatedPlan}/> : <div className="chart-loading"><span className="spinner"/> {t("Finding the possibilities…")}</div>}<div className="chart-bottom"><span><span className="legend-dashed"/> {t("Retirement begins")}</span><span>{t("Values in today’s dollars")} <Info size={12}/></span></div></section>
          </div>
        </div>
        {showResult && <Sensitivity analysis={result}/>}
        <div className="lower-grid">

          <section className="next-card"><span className="next-icon"><Leaf size={22}/></span><div className="eyebrow">{t("YOUR LIFE. MORE POSSIBILITIES.")}</div><h2>{t("What if your next chapter")}<br/>{t("looked a little different?")}</h2><p>{t("A few small changes can make a big difference.")}<br/>{t("See what happens when you explore.")}</p><button className="button scenario-button" onClick={() => { navigate('Compare') }}><Plus size={16}/> {t("Explore a scenario")} <ArrowRight size={15}/></button></section>
        </div>
        <footer><span><Flame size={14}/> {t("Built for possibilities, not predictions.")}</span><button onClick={() => setModal('method')}>{t("Our methodology")} <ArrowUpRightIcon/></button><span>{t("Planning tool only. Not financial advice.")}</span></footer>
      </main>
    </div>
    {modal && <div className="modal-overlay" onClick={closeModal}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button autoFocus className="icon-button modal-close" aria-label={t("Close dialog")} onClick={closeModal}><X size={20}/></button>{modal === 'method' ? <><span className="icon-tile"><Leaf size={22}/></span><h2 id="modal-title">{t("A plan built on possibilities.")}</h2><p>{t("Ember explores thousands of investment paths to help you understand uncertainty, rather than relying on a single average return.")}</p><h3>{t("Understanding uncertainty")}</h3><p>{t("Results depend on your assumptions. The sampling interval measures simulation noise only; it does not cover uncertainty about future markets.")}</p><h3>{t("Returns & risk")}</h3><p>{t("Annual stock and bond returns follow correlated lognormal distributions, calibrated to your nominal compound annual returns (CAGR) and simple-return standard deviations. Correlation applies to the underlying normal shocks. Inflation is drawn independently each year from a normal distribution with your chosen mean and standard deviation. Each path uses a repeatable random seed so you can compare changes fairly.")}</p><h3>{t("Your money, in today’s terms")}</h3><p>{t("Contributions, spending, and retirement income stay constant in purchasing power. Each year’s nominal return is divided by that year’s realized inflation, so high inflation reduces real growth. Contributions arrive at year end before retirement. Spending, less any eligible income, is withdrawn at the start of each retirement year. Include estimated taxes and healthcare in spending; income should be after tax.")}</p><h3>{t("A gradual shift in risk")}</h3><p>{t("Your stock allocation decreases linearly over the selected years before retirement, then stays at your retirement allocation. The balance is bonds. We rebalance annually, deduct annual fees, and treat any year with insufficient funds for spending as a failed path—even if wealth later recovers.")}</p><h3>{t("Default assumptions")}</h3><p>{t("Presets use historical USD total returns with dividends or coupons reinvested. Selecting a preset applies its compound annual return (CAGR) and volatility. Historical periods differ by source. Inflation and correlation remain separate assumptions. Historical returns are not forecasts.")}</p><p className="source-note">{t("Sources and historical periods are linked beside each preset. ETF returns include fund expenses; annual fees should cover additional costs only.")}</p><h3>{t("Know the limits")}</h3><p>{t("Percentile bands describe simulated outcomes, not guarantees. The model does not include market regime changes, serial correlation, tax calculations, correlation between inflation and returns, or unexpected expenses. These assumptions are not a promise of future returns. Revisit your assumptions and plan with a qualified adviser.")}</p><button className="button secondary" onClick={() => { setExample(true); setPlan({ ...defaults }); setStockPresetId(defaultStockPreset.id); setBondPresetId(defaultBondPreset.id); setSaved(false); setModal(null); run({ ...defaults }) }}><RotateCcw size={15}/> {t("Restore example plan")}</button></> : <><span className="icon-tile"><SlidersHorizontal size={22}/></span><button className="button secondary" onClick={closeModal}>{t("Return to plan")}</button><h2 id="modal-title">{t("A small change. A different future.")}</h2><p>{t("Compare your current inputs with two practical alternatives. Each scenario uses the same random market paths.")}</p><button className="button primary" disabled={scenarioBusy} onClick={compare}>{scenarioBusy ? <span className="spinner"/> : <Play size={14}/>} {scenarioBusy ? t("Comparing possibilities…") : t("Compare scenarios")}</button>{scenariosStale && scenarioResults.length > 0 && <p className="notice" role="status">{t("The plan changed since these scenarios were computed. Recompute to compare the current inputs.")}</p>}{scenarioResults.length > 0 && <div className="scenario-list">{[...scenarioResults].sort((a,b) => ['Your current plan','Retire 3 years later','Spend 10% less'].indexOf(a.name) - ['Your current plan','Retire 3 years later','Spend 10% less'].indexOf(b.name)).map(s => <div className="scenario-result" key={s.name}><div><h3>{t(s.name)}</h3><p>{t("Retire at {age}", { age: s.plan.retirementAge })} {t("·")} {money(s.plan.spending)} {t("/ year")}</p><span>{t("Median at retirement:")} {money(s.result.retirementBalance)}</span></div><div className="scenario-outcome"><strong>{pct(s.result.success)}</strong><span>{t("success")}</span>{s.name !== 'Your current plan' && scenarioResults.find(base => base.name === 'Your current plan') && <p className="scenario-delta">{pct(scenarioResults.find(base => base.name === 'Your current plan')!.result.success)} → {pct(s.result.success)}<br/>{t("Change: {points} percentage points", { points: number(Math.round((s.result.success - scenarioResults.find(base => base.name === 'Your current plan')!.result.success) * 10) / 10) })}</p>}{s.name !== 'Your current plan' && <button disabled={scenariosStale} title={scenariosStale ? t("The plan changed since these scenarios were computed. Recompute to compare the current inputs.") : undefined} onClick={() => { setUndoPlan({ ...plan }); setExample(false); setPlan(s.plan); setSaved(false); run(s.plan); closeModal() }}>{t("Apply these changes")} <ArrowRight size={12}/></button>}</div></div>)}</div>}{error && <p className="error" role="alert">{t(error)}</p>}<p className="tiny muted">{t("Success means funding all retirement spending through age {age}. All amounts are in today’s money ({currency}).", { age: plan.endAge, currency })}</p></>}</section></div>}
  </div>
}

function Sensitivity({ analysis }: { analysis: Analysis }) {
  const { t, pct, number } = useI18n()
  const labels: Record<StressId, string> = {
    lowerReturns: t('Stock and bond returns −1 percentage point'),
    muchLowerReturns: t('Stock and bond returns −2 percentage points'),
    higherInflation: t('Inflation +1 percentage point'),
    higherCorrelation: t('Stock–bond correlation: {value}', { value: number(analysis.sensitivity.find(s => s.id === 'higherCorrelation')!.plan.correlation) }),
  }
  return <section className="card sensitivity-card">
    <h2>{t('How sensitive is your plan?')}</h2>
    <p>{t('Each scenario changes one assumption from your submitted plan. Other inputs stay the same.')}</p>
    <div className="sensitivity-table-wrap"><table className="sensitivity-table">
      <thead><tr><th scope="col">{t('Scenario')}</th><th scope="col">{t('Simulated success')}</th><th scope="col">{t('95% sampling interval')}</th></tr></thead>
      <tbody><tr><th scope="row">{t('Your submitted assumptions')}</th><td>{pct(analysis.success)}</td><td>{pct(analysis.successInterval[0])}–{pct(analysis.successInterval[1])}</td></tr>
      {analysis.sensitivity.map(s => <tr key={s.id}><th scope="row">{labels[s.id]}</th><td>{s.result ? pct(s.result.success) : '—'}</td><td>{s.result ? <>{pct(s.result.successInterval[0])}–{pct(s.result.successInterval[1])}</> : t('Outside supported input limits')}</td></tr>)}</tbody>
    </table></div>
    <p>{t('Results depend on your assumptions. The sampling interval measures simulation noise only; it does not cover uncertainty about future markets.')}</p>
    <p>{t('Stress scenarios are illustrative, with no assigned likelihood. They use the same annual market model and do not measure all possible risks.')}</p>
  </section>
}

function ArrowUpRightIcon() { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 12 12 4M4 4h8v8" stroke="currentColor" strokeWidth="1.5"/></svg> }
function RangeField({ label, value, min, max, allowedMin = min, allowedMax = max, suffix, onChange }: { label: string; value: number; min: number; max: number; allowedMin?: number; allowedMax?: number; suffix: string; onChange: (value: number) => void }) {
  const position = (n: number) => `${max === min ? 0 : (n - min) / (max - min) * 100}%`
  return <label className="range-field"><span>{label}<strong>{value}<small>{suffix}</small></strong></span><input type="range" aria-label={label} aria-valuemin={allowedMin} aria-valuemax={allowedMax} min={min} max={max} value={value} onChange={e => {
    const next = Math.max(allowedMin, Math.min(allowedMax, Number(e.target.value)))
    e.target.value = String(next)
    onChange(next)
  }} style={{'--fill': position(value), '--allowed-start': position(allowedMin), '--allowed-end': position(allowedMax)} as React.CSSProperties}/><span className="range-scale" aria-hidden="true"><span>{min}{suffix === '%' ? '%' : ''}</span><span>{max}{suffix === '%' ? '%' : ''}</span></span></label>
}
function GlideChart({ plan }: { plan: Plan }) {
  const { t } = useI18n()
  const width = 300, height = 125, left = 0, top = 12, plotHeight = 80
  const x = (age: number) => left + (age - plan.age) / Math.max(1, plan.endAge - plan.age) * width
  const y = (percent: number) => top + plotHeight * (1 - percent / 100)
  const ages = Array.from({length: Math.max(1, plan.endAge - plan.age + 1)}, (_,i) => plan.age + i)
  const line = ages.map((age,i) => `${i ? 'L' : 'M'} ${x(age)} ${y(stockWeight(age,plan)*100)}`).join(' ')
  return <div className="glide-chart"><div className="glide-legend"><span><i/>{t("Stocks")}</span><span><i/>{t("Bonds")}</span></div><svg role="img" aria-label={t("Stocks reduce from {start}% to {end}% by retirement", { start: plan.startStocks, end: plan.retirementStocks })} viewBox={`-1 0 ${width+2} ${height}`}><defs><clipPath id="glide-clip"><rect x="0" y={top} width={width} height={plotHeight} rx="4"/></clipPath></defs><g clipPath="url(#glide-clip)"><rect x="0" y={top} width={width} height={plotHeight} fill="#e7ecf1"/><path d={`${line} L ${width} ${top+plotHeight} L 0 ${top+plotHeight} Z`} fill="#b2cda6"/><path d={line} stroke="#739769" strokeWidth="1.8" fill="none"/></g><line x1={x(plan.retirementAge)} y1={top} x2={x(plan.retirementAge)} y2={top+plotHeight} stroke="#59745b" strokeDasharray="3 3"/><text x="7" y={y(stockWeight(plan.age,plan)*100) + 19} className="glide-percent">{Math.round(stockWeight(plan.age,plan)*100)}%</text><text x={width-7} textAnchor="end" y={y(plan.retirementStocks)+19} className="glide-percent">{plan.retirementStocks}%</text><text x="0" y="115">{t("Age {age}", { age: plan.age })}</text><text x={x(plan.retirementAge)} y="115" textAnchor="middle">{t("Retire at {age}", { age: plan.retirementAge })}</text><text x={width} y="115" textAnchor="end">{plan.endAge}</text></svg></div>
}
function Projection({ points, plan }: { points: Point[]; plan: Plan }) {
  const { t, money, pct } = useI18n()
  const [hover, setHover] = useState<number | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(760)
  useEffect(() => {
    const observer = new ResizeObserver(entries => setChartWidth(Math.max(220, entries[0].contentRect.width)))
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const W = chartWidth, H = 270, left = 58, right = 18, top = 20, bottom = 34
  const plotW = W-left-right, plotH = H-top-bottom
  const max = Math.max(100000, ...points.map(p => p.p90)) * 1.08
  const niceStep = (value: number) => { const power = 10 ** Math.floor(Math.log10(value)); return Math.ceil(value / power / .5) * .5 * power }
  const step = niceStep(max / 4), yMax = step * 4
  const x = (age: number) => left + (age - plan.age) / (plan.endAge - plan.age) * plotW
  const y = (value: number) => top + plotH * (1 - value / yMax)
  const line = (key: 'p10'|'p25'|'p50'|'p75'|'p90') => points.map((p,i) => `${i ? 'L' : 'M'}${x(p.age).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ')
  const area = (low: 'p10'|'p25', high: 'p75'|'p90') => `${line(high)} ${[...points].reverse().map(p => `L${x(p.age).toFixed(2)},${y(p[low]).toFixed(2)}`).join(' ')} Z`
  const ageTicks = [...new Set(Array.from({length: W < 420 ? 4 : 7},(_,i) => Math.round(plan.age + i*(plan.endAge-plan.age)/(W < 420 ? 3 : 6))))]
  const active = points[Math.min(hover ?? 0, points.length - 1)]
  return <div className="projection-chart" ref={container}><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Portfolio projection with median and 10th to 90th percentile uncertainty bands")}><defs><clipPath id="plot-clip"><rect x={left} y={top} width={plotW} height={plotH}/></clipPath><linearGradient id="outer-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#dce8d5" stopOpacity=".8"/><stop offset="100%" stopColor="#edf3e9" stopOpacity=".5"/></linearGradient><linearGradient id="inner-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b9d1a9" stopOpacity=".85"/><stop offset="100%" stopColor="#d1e1c6" stopOpacity=".7"/></linearGradient></defs>{[0,1,2,3,4].map(i => <g key={i}><line x1={left} y1={y(i*step)} x2={W-right} y2={y(i*step)} stroke="#edf0ed" strokeDasharray={i ? '3 4' : undefined}/><text x={left-12} y={y(i*step)+4} textAnchor="end">{money(i*step,true)}</text></g>)}<g clipPath="url(#plot-clip)"><path d={area('p10','p90')} fill="url(#outer-fill)"/><path d={area('p25','p75')} fill="url(#inner-fill)"/><path d={line('p50')} fill="none" stroke="#5c8050" strokeWidth="2.5" strokeLinejoin="round"/><line x1={x(plan.retirementAge)} y1={top} x2={x(plan.retirementAge)} y2={H-bottom} stroke="#8b9886" strokeDasharray="4 4"/></g><rect x={x(plan.retirementAge)-31} y="4" width="62" height="20" rx="4" fill="#f0f4ec"/><text x={x(plan.retirementAge)} y="18" textAnchor="middle" className="retirement-label">{t("Retire at {age}", { age: plan.retirementAge })}</text>{ageTicks.map(age => <text key={age} x={x(age)} y={H-12} textAnchor="middle">{age}</text>)}<text x={W-right} y={H-12} textAnchor="end" className="age-label">{t("Age")}</text>{active && <g><line x1={x(active.age)} y1={top} x2={x(active.age)} y2={H-bottom} stroke="#6c8065" strokeDasharray="3 3"/><circle cx={x(active.age)} cy={y(active.p50)} r="4" fill="#5c8050" stroke="white" strokeWidth="2"/></g>}<rect x={left} y={top} width={plotW} height={plotH} fill="transparent" onPointerMove={e => { const bounds = e.currentTarget.ownerSVGElement!.getBoundingClientRect(); const cursorX = (e.clientX - bounds.left) / bounds.width * W; setHover(Math.max(0,Math.min(points.length-1,Math.round((cursorX-left)/plotW*(points.length-1))))) }} /></svg><div className="chart-details"><label>{t("Age")} <input type="range" aria-label={t("Selected projection age")} min={0} max={points.length-1} value={hover ?? 0} onChange={e => setHover(Number(e.target.value))}/></label><strong>{t("Age {age}", { age: active.age })}</strong><dl><div><dt>{t("Median")}</dt><dd>{money(active.p50)}</dd></div><div><dt>{t("10th–90th")}</dt><dd>{money(active.p10,true)} – {money(active.p90,true)}</dd></div><div><dt>{t("Still funded")}</dt><dd>{pct(active.success)}</dd></div></dl></div><details className="chart-data"><summary>{t("View projection table")}</summary><div className="sensitivity-table-wrap" tabIndex={0}><table className="sensitivity-table"><caption>{t("Portfolio value over time, adjusted for inflation")}</caption><thead><tr>{['Age','10th percentile','25th percentile','Median','75th percentile','90th percentile','Survival probability (%)'].map(label=><th scope="col" key={label}>{t(label)}</th>)}</tr></thead><tbody>{points.map(p=><tr key={p.age}><th scope="row">{p.age}</th>{[p.p10,p.p25,p.p50,p.p75,p.p90].map((value,i)=><td key={i}>{money(value)}</td>)}<td>{pct(p.success)}</td></tr>)}</tbody></table></div></details><span className="chart-scale-note">{t("Shaded bands show the range of simulated outcomes.")}</span></div>
}


function FinancialInput({ label, value, divisor, format, onChange, error, fieldKey }: { label: string; value: number; divisor: number; format: (value: number) => string; onChange: (value: number) => void; error?: string; fieldKey: string }) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (input.current && document.activeElement !== input.current) input.current.value = Number.isFinite(value) ? format(value / divisor) : ''
  }, [value, divisor, format])
  return <input ref={input} aria-label={label} aria-invalid={!!error} aria-describedby={error ? `error-${fieldKey}` : undefined} type="text" inputMode="decimal" defaultValue={Number.isFinite(value) ? format(value / divisor) : ''} onFocus={e => e.currentTarget.select()} onChange={e => onChange(e.target.value.trim() === '' ? NaN : Number(e.target.value.replaceAll(',', '')) * divisor)} onBlur={e => { e.currentTarget.value = Number.isFinite(value) ? format(value / divisor) : '' }}/>
}
