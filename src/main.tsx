import React, { useEffect, useRef, useState } from 'react'
import { I18nProvider, useI18n, languages, currencies } from './i18n'
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, ChevronRight, CircleHelp, Flame, Globe2, Info, Leaf, Menu, Play, Plus, RotateCcw, Settings2, ShieldCheck, SlidersHorizontal, TrendingUp, Wallet, X } from 'lucide-react'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/manrope'
import { clampGlideYears, defaults, maxGlideYears, simulate, stockWeight, validate } from './simulation'
import type { Plan, Results, Point } from './simulation'
import './styles.css'

type Tab = 'Your finances' | 'Retirement' | 'Assumptions'
function loadPlan(): Plan {
  try { const saved = localStorage.getItem('ember-plan'); if (saved) { const plan = { ...defaults, ...JSON.parse(saved) }; if (!validate(plan)) return plan } } catch { /* A new plan remains available when storage is disabled. */ }
  return defaults
}
export default function App() {
  return <I18nProvider><Planner/></I18nProvider>
}
function Planner() {
  const { t, money, pct, number, currency, language, setLanguage, setCurrency, symbol } = useI18n()
  const [plan, setPlan] = useState<Plan>(loadPlan)
  const [submitted, setSubmitted] = useState<Plan>(plan)
  const [result, setResult] = useState<Results | null>(null)
  const [tab, setTab] = useState<Tab>('Your finances')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [modal, setModal] = useState<'method' | 'scenarios' | null>(null)
  const [nav, setNav] = useState('Overview')
  const [mobileNav, setMobileNav] = useState(false)
  const [scenarioResults, setScenarioResults] = useState<{ name: string; result: Results; plan: Plan }[]>([])
  const [scenarioSignature, setScenarioSignature] = useState<string | null>(null)
  const [scenarioBusy, setScenarioBusy] = useState(false)
  const worker = useRef<Worker | null>(null)
  const scenarioWorkers = useRef<Worker[]>([])
  const dirty = JSON.stringify(plan) !== JSON.stringify(submitted)

  const run = (next: Plan = plan) => {
    const issue = validate(next)
    if (issue) { setError(issue); return }
    worker.current?.terminate()
    // Drop the previous result immediately so labels never pair with stale numbers.
    setBusy(true); setError(''); setSubmitted({ ...next }); setResult(null)
    const start = (instance: Worker) => {
      worker.current = instance
      instance.onmessage = (event) => { if (event.data.error) setError(event.data.error); else setResult(event.data.result); setBusy(false); instance.terminate() }
      instance.onerror = () => { setError('The simulation could not finish. Please try again.'); setBusy(false); instance.terminate() }
      instance.postMessage({ plan: next, seed: 42 })
    }
    try {
      start(new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }))
    } catch {
      // Workers are unavailable in some browsers (for example Firefox < 114).
      // Fall back to running synchronously so the page stays usable.
      try { setResult(simulate(next, 42)); setBusy(false) }
      catch (error) { setError(error instanceof Error ? error.message : 'The simulation could not finish. Please try again.'); setBusy(false) }
    }
  }
  useEffect(() => { run(plan); return () => { worker.current?.terminate(); scenarioWorkers.current.forEach(w => w.terminate()) } }, []) // Initial simulation; subsequent runs are explicit.
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') { setModal(null); setMobileNav(false) } }
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close)
  }, [])
  useEffect(() => {
    if (!modal) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const dialog = document.querySelector('.modal') as HTMLElement | null
    dialog?.querySelector<HTMLElement>('.modal-close')?.focus()
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
  }, [modal])
  const update = (key: keyof Plan, value: number) => {
    // Keep the glide path within the years left until retirement so the
    // slider, label, chart, and simulation never disagree.
    setPlan(p => key === 'age' || key === 'retirementAge' ? clampGlideYears({ ...p, [key]: value }) : ({ ...p, [key]: value }))
    setSaved(false)
  }
  const navigate = (target: string) => {
    setNav(target); setMobileNav(false)
    if (target === 'Scenarios') { setModal('scenarios'); return }
    if (target === 'Assumptions') setTab('Assumptions')
    if (target === 'Overview') setTab('Your finances')
    setTimeout(() => document.getElementById(target === 'Glide path' ? 'glide-path' : 'planner')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  const save = () => {
    const issue = validate(plan); if (issue) { setError(issue); return }
    try { localStorage.setItem('ember-plan', JSON.stringify(plan)); setSaved(true); setTimeout(() => setSaved(false), 3000) } catch { setError('Your browser could not save this plan. You can still export your projection.') }
  }
  const exportData = () => {
    if (!result) return
    const headers = ['Age', '10th percentile', '25th percentile', 'Median', '75th percentile', '90th percentile', 'Survival probability (%)'].map((key, i) => i > 0 && i < 6 ? t(key) + ' (' + currency + ')' : t(key))
    const csv = '\uFEFF' + [headers.map(header => '"' + header.replaceAll('"', '""') + '"').join(','), ...result.points.map(p => [p.age,p.p10,p.p25,p.p50,p.p75,p.p90,p.success].join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `ember-retirement-projection-${currency}.csv`; a.click(); URL.revokeObjectURL(url)
  }
  const compare = () => {
    const issue = validate(plan); if (issue) { setError(issue); return }
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
        // Same synchronous fallback as run(): keep the page usable where Workers are blocked.
        try { recordResult(simulate(variant.plan, 42)) }
        catch (error) { setError(error instanceof Error ? error.message : 'A scenario could not finish. Please try again.') }
        finish()
      }
    })
  }
  const scenariosStale = scenarioSignature !== null && scenarioSignature !== JSON.stringify(plan)
  const field = (key: keyof Plan, label: string, options: { prefix?: string; suffix?: string; hint?: string; step?: number; min?: number; max?: number } = {}) => <label className="field" key={key}><span className="field-label">{label}{options.hint && <span className="hint-icon" title={options.hint}><CircleHelp size={13}/></span>}</span><span className="input-wrap">{options.prefix && <span>{options.prefix}</span>}<input aria-label={label} type="number" min={options.min ?? 0} max={options.max} step={options.step ?? 1} value={Number.isNaN(plan[key]) ? '' : plan[key]} onChange={e => update(key, e.target.value === '' ? NaN : Number(e.target.value))}/>{options.suffix && <span className="input-suffix">{options.suffix}</span>}</span></label>
  const success = result?.success ?? 0
  const showResult = result !== null && !busy
  // While an age field holds NaN the bound is not finite; fall back to the
  // widest slider range so the control stays usable until validation runs.
  const rawMaxGlide = maxGlideYears(plan)
  const maxGlide = Number.isFinite(rawMaxGlide) ? rawMaxGlide : 40
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <a className="brand" href="#" aria-label={t("Ember home")} onClick={e => { e.preventDefault(); navigate('Overview') }}><span className="brand-symbol"><Flame size={25} fill="currentColor" strokeWidth={1.6}/></span>ember<span className="brand-dot">.</span></a>
      <div className="workspace"><span className="workspace-avatar">P</span><span>{t("Personal workspace")}<small>{t("Your next chapter")}</small></span><ChevronDown size={14}/></div>
      <div className="nav-label">{t("YOUR PLAN")}</div>
      <nav>{[{ name: 'Overview', icon: <Globe2/> }, { name: 'Scenarios', icon: <SlidersHorizontal/> }, { name: 'Glide path', icon: <TrendingUp/> }, { name: 'Assumptions', icon: <Settings2/> }].map(item => <button key={item.name} className={`nav-item ${nav === item.name ? 'active' : ''}`} onClick={() => navigate(item.name)}>{item.icon}<span>{t(item.name)}</span>{nav === item.name && <span className="active-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="little-card"><span className="little-icon"><Leaf size={19}/></span><strong>{t("A little clarity.")}<br/>{t("A lot of possibility.")}</strong><p>{t("A thoughtful plan for a life")}<br/>{t("that’s yours to choose.")}</p><button onClick={() => setModal('method')}>{t("Meet the methodology")} <ArrowRight size={14}/></button></div><button className="help-link" onClick={() => setModal('method')}><CircleHelp size={17}/> {t("How Ember works")} <ArrowRight size={14}/></button><div className="local-note"><span/>{t("Private by design. Saved on this device.")}</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="mobile-menu" aria-label={t("Open navigation")} onClick={() => setMobileNav(!mobileNav)}><Menu size={20}/></button><span>{t("Your plan")}</span><ChevronRight size={13}/><strong>{t("Overview")}</strong></div><div className="header-right"><div className="display-preferences"><select aria-label={t('Language')} value={language} onChange={e => setLanguage(e.target.value as typeof language)}>{languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select><select aria-label={t('Currency')} title={t('Display only. Amounts are not converted.')} value={currency} onChange={e => setCurrency(e.target.value as typeof currency)}>{currencies.map(c => <option key={c} value={c}>{c}</option>)}</select></div><span className="private-badge"><ShieldCheck size={14}/> {t("Your data stays yours")}</span><button className="avatar" onClick={save} aria-label={t("Save personal plan")}>P</button></div></header>
      <main id="planner">
        <div className="page-title"><div><div className="eyebrow"><span/> {t("MAKE ROOM FOR WHAT MATTERS")}</div><h1>{t("Your freedom, by design")}<span>.</span></h1><p>{t("Explore the possibilities. Build a plan you can believe in.")}</p></div><button className="button secondary save-button" onClick={save}>{saved ? <Check size={16}/> : <ArrowDownToLine size={16}/>} {saved ? t("Plan saved") : t("Save plan")}</button></div>
        <div className="planner-grid">
          <section className="card plan-card"><div className="card-heading"><div><h2>{t("Build your plan")}</h2><p>{t("A few numbers. A clearer picture.")}</p></div><span className="icon-tile"><SlidersHorizontal size={18}/></span></div>
            <div className="tabs" role="tablist">{(['Your finances', 'Retirement', 'Assumptions'] as Tab[]).map(tabName => <button key={tabName} role="tab" aria-selected={tab === tabName} onClick={() => setTab(tabName)}>{t(tabName)}</button>)}</div>
            <div className="plan-fields" role="tabpanel">
              {tab === 'Your finances' && <><div className="field-row">{field('age',t("Current age"),{suffix:t("years"),min:18,max:109})}{field('retirementAge',t("Retirement age"),{suffix:t("years"),min:19,max:109})}</div>{field('portfolio',t("Current portfolio"),{prefix:symbol,hint:t("Your total investable assets, excluding your home.")})}{field('contribution',t("Annual contributions"),{prefix:symbol,suffix:t("/ year"),hint:t("After-tax savings invested each year, increasing with inflation.")})}{field('spending',t("Retirement spending"),{prefix:symbol,suffix:t("/ year"),hint:t("Annual spending in today’s money. Include healthcare and estimated withdrawal taxes.")})}<div className="field-footnote"><Info size={13}/> {t("All amounts are in today’s money ({currency}).", { currency })}</div></>}
              {tab === 'Retirement' && <><div className="field-row">{field('retirementAge',t("Retirement age"),{suffix:t("years"),min:19,max:109})}{field('endAge',t("Plan through age"),{suffix:t("years"),min:20,max:110})}</div>{field('spending',t("Annual retirement spending"),{prefix:symbol,suffix:t("/ year")})}{field('income',t("Annual retirement income"),{prefix:symbol,suffix:t("/ year"),hint:t("After-tax pension or benefits, assumed to rise with inflation.")})}{field('incomeAge',t("Income starts at age"),{suffix:t("years"),min:18,max:110})}<div className="field-footnote"><Info size={13}/> {t("Income offsets spending once you retire.")}</div></>}
              {tab === 'Assumptions' && <><div className="assumption-label">{t("NOMINAL ANNUAL RETURNS")}</div><div className="field-row">{field('stockReturn',t("Stock return"),{suffix:'%',step:.1,min:-20,max:30,hint:t("Nominal arithmetic mean. The default reflects a global all-cap equity portfolio.")})}{field('stockSD',t("Stock volatility (SD)"),{suffix:'%',step:.1,max:60,hint:t("Annualized standard deviation of returns. The default reflects global equity risk.")})}</div><div className="field-row">{field('bondReturn',t("Bond return"),{suffix:'%',step:.1,min:-20,max:30,hint:t("Nominal arithmetic mean. The default reflects a global investment-grade bond portfolio.")})}{field('bondSD',t("Bond volatility (SD)"),{suffix:'%',step:.1,max:60})}</div><div className="field-row">{field('inflation',t("Inflation"),{suffix:'%',step:.1,max:15,hint:t("Average annual inflation. Prices are sampled around this rate.")})}{field('inflationSD',t("Inflation volatility (SD)"),{suffix:'%',step:.1,max:15,hint:t("Annualized standard deviation of inflation. Inflation is sampled independently each year.")})}</div><div className="field-row">{field('correlation',t("Stock–bond correlation"),{step:.05,min:-1,max:1,hint:t("Correlation between annual stock and bond returns. The default reflects the recent positive relationship between global stocks and bonds.")})}{field('fee',t("Annual fees"),{suffix:'%',step:.05,max:5})}</div><div className="field-row single">{field('simulations',t("Simulations"),{step:100,min:100,max:20000})}</div></>}
            </div>
            <div className="plan-card-bottom">{error && <p className="error" role="alert">{t(error)}</p>}<button className="button primary run-button" onClick={() => run()} disabled={busy}>{busy ? <span className="spinner"/> : <Play size={14} fill="currentColor"/>}{busy ? t("Exploring your future…") : t("Run simulation")}{!busy && <ArrowRight size={16}/>}</button><div className="simulation-note">{dirty ? t("You have changes ready to explore") : t("{count} possible futures. One more informed you.", { count: number(submitted.simulations) })}</div></div>
          </section>
          <div className={`results-column ${busy ? 'calculating' : ''}`} aria-live="polite" aria-busy={busy}>
            <div className="metric-grid"><section className="card success-card"><div className="metric-label">{t("Probability of success")} <CircleHelp size={13} aria-label={t("Share of simulations that fund every retirement year")}/></div><div className="success-main"><strong>{showResult ? Math.round(success) : '—'}<span>%</span></strong>{showResult && <span className={`status-pill ${success < 80 ? 'caution' : ''}`}><span/>{success >= 90 ? t("Looking strong") : success >= 80 ? t("On track") : t("Room to improve")}</span>}</div><p>{t("Funds every retirement year through age {age}", { age: submitted.endAge })}</p><div className="success-track"><span style={{width:`${showResult ? success : 0}%`}}/></div><div className="metric-bottom">{t("Based on {count} simulated lifetimes", { count: number(submitted.simulations) })} <ShieldCheck size={13}/></div></section>
              <section className="card balance-card"><div className="metric-label">{t("Portfolio at retirement")} <Wallet size={15}/></div><strong className="metric-number">{showResult ? money(result.retirementBalance, true) : '—'}</strong><p>{t("Median balance at age {age}", { age: submitted.retirementAge })}</p><div className="metric-divider"/><div className="small-metric"><span>{t("Initial withdrawal rate")}</span><strong>{showResult ? pct(result.withdrawalRate) : '—'}</strong></div><span className="muted tiny">{t("In today’s dollars, before withdrawals")}</span></section>
            </div>
            <section className="card projection-card"><div className="projection-heading"><div><h2>{t("A thousand ways your future could unfold")}</h2><p>{t("Portfolio value over time, adjusted for inflation")}</p></div><button className="icon-button" aria-label={t("Download projection as CSV")} title={t("Download projection as CSV")} onClick={exportData} disabled={!result}><ArrowDownToLine size={17}/></button></div><div className="chart-legend"><span><i className="legend-line"/>{t("Median outcome")}</span><span><i className="legend-square inner"/>{t("25th–75th percentile")}</span><span><i className="legend-square outer"/>{t("10th–90th percentile")}</span></div>{result ? <Projection points={result.points} plan={submitted}/> : <div className="chart-loading"><span className="spinner"/> {t("Finding the possibilities…")}</div>}<div className="chart-bottom"><span><span className="legend-dashed"/> {t("Retirement begins")}</span><span>{t("Values in today’s dollars")} <Info size={12}/></span></div></section>
          </div>
        </div>
        <div className="lower-grid">
          <section className="card glide-card" id="glide-path"><div className="section-heading"><div className="heading-with-icon"><span className="icon-tile"><TrendingUp size={18}/></span><div><h2>{t("A little less risk, as life moves forward")}</h2><p>{t("Your portfolio evolves with your priorities.")}</p></div></div><span className="subtle-badge">{t("Glide path")}</span></div><div className="glide-layout"><div className="glide-controls"><RangeField label={t("Stocks today")} value={plan.startStocks} onChange={v => update('startStocks', v)} min={plan.retirementStocks} max={100} suffix="%"/><RangeField label={t("Stocks at retirement")} value={plan.retirementStocks} onChange={v => update('retirementStocks', v)} min={0} max={plan.startStocks} suffix="%"/><RangeField label={t("Start reducing risk")} value={plan.glideYears} onChange={v => update('glideYears', v)} min={0} max={maxGlide} suffix={t("years before")}/></div><GlideChart plan={plan}/></div><div className="glide-note"><ShieldCheck size={14}/><span>{t("Gradually shift from stocks to bonds. Rebalanced annually.")}</span><button onClick={() => setModal('method')} aria-label={t("Learn about glide paths")}><CircleHelp size={14}/></button></div></section>
          <section className="next-card"><span className="next-icon"><Leaf size={22}/></span><div className="eyebrow">{t("YOUR LIFE. MORE POSSIBILITIES.")}</div><h2>{t("What if your next chapter")}<br/>{t("started a little sooner?")}</h2><p>{t("A few small changes can make a big difference.")}<br/>{t("See what happens when you explore.")}</p><button className="button scenario-button" onClick={() => { setModal('scenarios'); setNav('Scenarios') }}><Plus size={16}/> {t("Explore a scenario")} <ArrowRight size={15}/></button></section>
        </div>
        <footer><span><Flame size={14}/> {t("Built for possibilities, not predictions.")}</span><button onClick={() => setModal('method')}>{t("Our methodology")} <ArrowUpRightIcon/></button><span>{t("Planning tool only. Not financial advice.")}</span></footer>
      </main>
    </div>
    {modal && <div className="modal-overlay" onClick={() => setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><button autoFocus className="icon-button modal-close" aria-label={t("Close dialog")} onClick={() => setModal(null)}><X size={20}/></button>{modal === 'method' ? <><span className="icon-tile"><Leaf size={22}/></span><h2 id="modal-title">{t("A plan built on possibilities.")}</h2><p>{t("Ember explores thousands of investment paths to help you understand uncertainty, rather than relying on a single average return.")}</p><h3>{t("Returns & risk")}</h3><p>{t("Annual stock and bond returns follow correlated lognormal distributions, calibrated to your nominal arithmetic mean returns and standard deviations. Correlation applies to the underlying normal shocks. Inflation is drawn independently each year from a normal distribution with your chosen mean and standard deviation. Each path uses a repeatable random seed so you can compare changes fairly.")}</p><h3>{t("Your money, in today’s terms")}</h3><p>{t("Contributions, spending, and retirement income stay constant in purchasing power. Each year’s nominal return is divided by that year’s realized inflation, so high inflation reduces real growth. Contributions arrive at year end before retirement. Spending, less any eligible income, is withdrawn at the start of each retirement year. Include estimated taxes and healthcare in spending; income should be after tax.")}</p><h3>{t("A gradual shift in risk")}</h3><p>{t("Your stock allocation decreases linearly over the selected years before retirement, then stays at your retirement allocation. The balance is bonds. We rebalance annually, deduct annual fees, and treat any year with insufficient funds for spending as a failed path—even if wealth later recovers.")}</p><h3>{t("Default assumptions")}</h3><p>{t("The stock default follows a global all-cap portfolio using VT’s September 30, 2026, regional weights: 62.4% U.S. and 37.6% outside the U.S. Vanguard’s September 30, 2026, 10-year forecasts provide the regional midpoints: 5.8% expected compound return and 15.0% volatility for U.S. equities, and 6.0% and 19.1% for global ex-U.S. equities. Applying a 0.84 cross-region correlation gives about 5.9% expected compound return and 15.9% volatility. The bond default blends U.S. and hedged global aggregate bonds using forecast midpoints. Return inputs are arithmetic means, so the defaults show 7.1% for stocks and 5.8% for bonds; median compound returns are lower. Inflation defaults to 2.0% with a 1.7% standard deviation, based on 10-year inflation volatility estimates from Vanguard and J.P. Morgan. The stock–bond correlation defaults to 0.30, consistent with J.P. Morgan’s 0.33 long-term assumption for global equities versus U.S. aggregate bonds and with realized global stock–bond correlations of 0.39 to 0.52 since 2011. Inflation is sampled independently of returns.")}</p><p className="source-note">{t("Sources: Vanguard Capital Markets Model, September 30, 2026; FTSE Russell Global All Cap Index, September 30, 2026; J.P. Morgan 2026 Long-Term Capital Market Assumptions.")}</p><h3>{t("Know the limits")}</h3><p>{t("Percentile bands describe simulated outcomes, not guarantees. The model does not include market regime changes, serial correlation, tax calculations, correlation between inflation and returns, or unexpected expenses. These assumptions are not a promise of future returns. Revisit your assumptions and plan with a qualified adviser.")}</p><button className="button secondary" onClick={() => { setPlan({ ...defaults }); setSaved(false); setModal(null); run({ ...defaults }) }}><RotateCcw size={15}/> {t("Restore example plan")}</button></> : <><span className="icon-tile"><SlidersHorizontal size={22}/></span><h2 id="modal-title">{t("A small change. A different future.")}</h2><p>{t("Compare your current inputs with two practical alternatives. Each scenario uses the same random market paths.")}</p><button className="button primary" disabled={scenarioBusy} onClick={compare}>{scenarioBusy ? <span className="spinner"/> : <Play size={14}/>} {scenarioBusy ? t("Comparing possibilities…") : t("Compare scenarios")}</button>{scenariosStale && scenarioResults.length > 0 && <p className="error" role="alert">{t("The plan changed since these scenarios were computed. Recompute to compare the current inputs.")}</p>}{scenarioResults.length > 0 && <div className="scenario-list">{[...scenarioResults].sort((a,b) => a.plan.retirementAge - b.plan.retirementAge || b.plan.spending - a.plan.spending).map(s => <div className="scenario-result" key={s.name}><div><h3>{t(s.name)}</h3><p>{t("Retire at {age}", { age: s.plan.retirementAge })} {t("·")} {money(s.plan.spending)} {t("/ year")}</p><span>{t("Median at retirement:")} {money(s.result.retirementBalance)}</span></div><div className="scenario-outcome"><strong>{pct(s.result.success)}</strong><span>{t("success")}</span>{s.name !== 'Your current plan' && <button disabled={scenariosStale} title={scenariosStale ? t("The plan changed since these scenarios were computed. Recompute to compare the current inputs.") : undefined} onClick={() => { setPlan(s.plan); setSaved(false); run(s.plan); setModal(null) }}>{t("Use this plan")} <ArrowRight size={12}/></button>}</div></div>)}</div>}{error && <p className="error" role="alert">{t(error)}</p>}<p className="tiny muted">{t("Success means funding all retirement spending through age {age}. All amounts are in today’s money ({currency}).", { age: plan.endAge, currency })}</p></>}</section></div>}
  </div>
}
function ArrowUpRightIcon() { return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 12 12 4M4 4h8v8" stroke="currentColor" strokeWidth="1.5"/></svg> }
function RangeField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (value: number) => void }) {
  return <label className="range-field"><span>{label}<strong>{value}<small>{suffix}</small></strong></span><input type="range" aria-label={label} min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} style={{'--fill': `${max === min ? 0 : (value - min) / (max - min) * 100}%`} as React.CSSProperties}/></label>
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
  const W = 760, H = 270, left = 58, right = 18, top = 20, bottom = 34
  const plotW = W-left-right, plotH = H-top-bottom
  const max = Math.max(100000, ...points.map(p => p.p90)) * 1.08
  const niceStep = (value: number) => { const power = 10 ** Math.floor(Math.log10(value)); return Math.ceil(value / power / .5) * .5 * power }
  const step = niceStep(max / 4), yMax = step * 4
  const x = (age: number) => left + (age - plan.age) / (plan.endAge - plan.age) * plotW
  const y = (value: number) => top + plotH * (1 - value / yMax)
  const line = (key: 'p10'|'p25'|'p50'|'p75'|'p90') => points.map((p,i) => `${i ? 'L' : 'M'}${x(p.age).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ')
  const area = (low: 'p10'|'p25', high: 'p75'|'p90') => `${line(high)} ${[...points].reverse().map(p => `L${x(p.age).toFixed(2)},${y(p[low]).toFixed(2)}`).join(' ')} Z`
  const ageTicks = [...new Set(Array.from({length: 7},(_,i) => Math.round(plan.age + i*(plan.endAge-plan.age)/6)))]
  const active = hover === null ? null : points[hover]
  return <div className="projection-chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Portfolio projection with median and 10th to 90th percentile uncertainty bands")}><defs><clipPath id="plot-clip"><rect x={left} y={top} width={plotW} height={plotH}/></clipPath><linearGradient id="outer-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#dce8d5" stopOpacity=".8"/><stop offset="100%" stopColor="#edf3e9" stopOpacity=".5"/></linearGradient><linearGradient id="inner-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b9d1a9" stopOpacity=".85"/><stop offset="100%" stopColor="#d1e1c6" stopOpacity=".7"/></linearGradient></defs>{[0,1,2,3,4].map(i => <g key={i}><line x1={left} y1={y(i*step)} x2={W-right} y2={y(i*step)} stroke="#edf0ed" strokeDasharray={i ? '3 4' : undefined}/><text x={left-12} y={y(i*step)+4} textAnchor="end">{money(i*step,true)}</text></g>)}<g clipPath="url(#plot-clip)"><path d={area('p10','p90')} fill="url(#outer-fill)"/><path d={area('p25','p75')} fill="url(#inner-fill)"/><path d={line('p50')} fill="none" stroke="#5c8050" strokeWidth="2.5" strokeLinejoin="round"/><line x1={x(plan.retirementAge)} y1={top} x2={x(plan.retirementAge)} y2={H-bottom} stroke="#8b9886" strokeDasharray="4 4"/></g><rect x={x(plan.retirementAge)-31} y="4" width="62" height="20" rx="4" fill="#f0f4ec"/><text x={x(plan.retirementAge)} y="18" textAnchor="middle" className="retirement-label">{t("Retire at {age}", { age: plan.retirementAge })}</text>{ageTicks.map(age => <text key={age} x={x(age)} y={H-12} textAnchor="middle">{age}</text>)}<text x={W-right} y={H-12} textAnchor="end" className="age-label">{t("Age")}</text>{active && <g><line x1={x(active.age)} y1={top} x2={x(active.age)} y2={H-bottom} stroke="#6c8065" strokeDasharray="3 3"/><circle cx={x(active.age)} cy={y(active.p50)} r="4" fill="#5c8050" stroke="white" strokeWidth="2"/></g>}<rect x={left} y={top} width={plotW} height={plotH} fill="transparent" onMouseMove={e => { const bounds = e.currentTarget.ownerSVGElement!.getBoundingClientRect(); const cursorX = (e.clientX - bounds.left) / bounds.width * W; setHover(Math.max(0,Math.min(points.length-1,Math.round((cursorX-left)/plotW*(points.length-1))))) }} onMouseLeave={() => setHover(null)}/></svg>{active && <div className="chart-tooltip" style={{ left: `${Math.max(18, Math.min(76, x(active.age)/W*100))}%` }}><strong>{t("Age {age}", { age: active.age })}</strong><span>{t("Median")} <b>{money(active.p50)}</b></span><span>{t("10th–90th")} <b>{money(active.p10,true)} {t("–")} {money(active.p90,true)}</b></span><span>{t("Still funded")} <b>{pct(active.success)}</b></span></div>}<span className="chart-scale-note">{t("Shaded bands show the range of simulated outcomes.")}</span></div>
}

