import React, { useEffect, useRef, useState } from 'react'
import { I18nProvider, useI18n, languages, currencies } from './i18n'
import { ArrowDownToLine, ArrowRight, Check, ChevronRight, CircleHelp, Flame, Globe2, Info, Leaf, Menu, Play, RotateCcw, ShieldCheck, SlidersHorizontal, TrendingUp, Wallet, X } from 'lucide-react'
import '@fontsource-variable/dm-sans'
import '@fontsource-variable/manrope'
import { analyze, clampGlideYears, defaults, maxGlideYears, simulate, stockWeight, validate } from './simulation'
import type { Analysis, Plan, Results, Point, StressId } from './simulation'
import { presets, defaultStockPreset, defaultBondPreset } from './assumption-presets'
import type { Asset } from './assumption-presets'
import { initialSavedPlan, parseSavedPlan } from './plan-storage'
import './styles.css'

const planTabs = ['Today', 'Retirement', 'Other income', 'Investments', 'Advanced assumptions'] as const
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
  const [busy, setBusy] = useState(false)
  const [reviewedSteps, setReviewedSteps] = useState<Tab[]>([])
  const [setupComplete, setSetupComplete] = useState(false)
  const [validationShown, setValidationShown] = useState(false)
  const [error, setError] = useState('')
  const [example, setExample] = useState(() => { try { return !localStorage.getItem('ember-plan') } catch { return true } })
  const [saved, setSaved] = useState(!example)
  const [investmentChoice, setInvestmentChoice] = useState<'example' | 'custom'>(example ? 'example' : 'custom')
  const customMix = useRef({ startStocks: plan.startStocks, retirementStocks: plan.retirementStocks, glideYears: plan.glideYears })
  const exampleMix = clampGlideYears({ ...plan, startStocks: defaults.startStocks, retirementStocks: defaults.retirementStocks, glideYears: defaults.glideYears })
  const usingExampleMix = investmentChoice === 'example' && plan.startStocks === exampleMix.startStocks && plan.retirementStocks === exampleMix.retirementStocks && plan.glideYears === exampleMix.glideYears
  const chooseInvestmentMix = (choice: 'example' | 'custom') => {
    if ((choice === 'example') === usingExampleMix) return
    if (choice === 'example') customMix.current = { startStocks: plan.startStocks, retirementStocks: plan.retirementStocks, glideYears: plan.glideYears }
    const mix = choice === 'example' ? exampleMix : customMix.current
    setPlan(p => clampGlideYears({ ...p, startStocks: mix.startStocks, retirementStocks: mix.retirementStocks, glideYears: mix.glideYears }))
    setInvestmentChoice(choice); setSaved(false); setExample(false); setError('')
  }
  const [modal, setModal] = useState<'method' | 'scenarios' | null>(null)
  const [nav, setNav] = useState('Plan')
  const [mobileNav, setMobileNav] = useState(false)
  const [undoPlan, setUndoPlan] = useState<Plan | null>(null)
  const [scenarioResults, setScenarioResults] = useState<{ name: string; result: Results; plan: Plan }[]>([])
  const [scenarioSignature, setScenarioSignature] = useState<string | null>(null)
  const [scenarioBusy, setScenarioBusy] = useState(false)
  const [scenarioError, setScenarioError] = useState('')
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const worker = useRef<Worker | null>(null)
  const scenarioWorkers = useRef<Worker[]>([])
  const dirty = JSON.stringify(plan) !== JSON.stringify(calculatedPlan)

  const run = (next: Plan = plan) => {
    if (!setupComplete) {
      const confirmed = tab === 'Investments' ? [...reviewedSteps, tab] : reviewedSteps
      const unfinished = planTabs.slice(0, 4).find(step => !confirmed.includes(step))
      if (unfinished) { setNav('Plan'); changeStep(unfinished); return }
    }
    const issue = validate(next)
    if (issue) { showValidation(); return }
    worker.current?.terminate()
    // Keep the previous result paired with calculatedPlan until this run succeeds.
    setSetupComplete(true); setExample(false)
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
  useEffect(() => {
    if (!result || modal || mobileNav) return
    resultHeading.current?.focus({ preventScroll: true })
    resultHeading.current?.closest('#results')?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }, [result])
  useEffect(() => () => { worker.current?.terminate(); scenarioWorkers.current.forEach(w => w.terminate()) }, [])
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
    setSaved(false); setExample(false); setError('')
  }
  const fieldErrors: Partial<Record<keyof Plan, string>> = {}
  for (const key of Object.keys(plan) as (keyof Plan)[]) {
    if (!Number.isFinite(plan[key])) fieldErrors[key] = t("Enter a valid number.")
  }
  if (plan.age < 18 || plan.age > 109) fieldErrors.age = t("Current age must be between 18 and 109.")
  if (plan.retirementAge < 19 || plan.retirementAge > 109) fieldErrors.retirementAge = t("Enter a retirement age from 19 to 109.")
  if (plan.endAge < 20 || plan.endAge > 110) fieldErrors.endAge = t("Enter a planning age from 20 to 110.")
  if (plan.incomeAge < 18 || plan.incomeAge > 110) fieldErrors.incomeAge = t("Income age must be between 18 and 110.")
  const limits: Partial<Record<keyof Plan, [number, number]>> = { portfolio:[0,1e10], contribution:[0,1e10], spending:[0,1e10], income:[0,1e10], stockReturn:[-20,30], bondReturn:[-20,30], stockSD:[0,60], bondSD:[0,60], correlation:[-1,1], inflation:[0,15], inflationSD:[0,15], fee:[0,5], simulations:[100,20000] }
  for (const [key, [min, max]] of Object.entries(limits) as [keyof Plan, [number, number]][]) {
    if (plan[key] < min || plan[key] > max) fieldErrors[key] = t("Enter a value from {min} to {max}.", { min: number(min), max: number(max) })
  }
  for (const key of ['age','retirementAge','endAge','incomeAge','glideYears','simulations'] as (keyof Plan)[]) {
    if (Number.isFinite(plan[key]) && !Number.isInteger(plan[key])) fieldErrors[key] = t("Enter a whole number.")
  }
  // Only compare complete, individually valid ages; partial entries keep their own guidance.
  const retirementOrderError = !fieldErrors.age && !fieldErrors.retirementAge && plan.retirementAge <= plan.age
    ? t("Current age is {age}; retirement age is {retirementAge}. Retirement must be later. Lower your current age or raise your retirement age.", { age: number(plan.age), retirementAge: number(plan.retirementAge) }) : ''
  const planningOrderError = !fieldErrors.retirementAge && !fieldErrors.endAge && plan.endAge <= plan.retirementAge
    ? t("Retirement age is {retirementAge}; planning age is {endAge}. Plan through a later age or lower your retirement age.", { retirementAge: number(plan.retirementAge), endAge: number(plan.endAge) }) : ''
  if (retirementOrderError) fieldErrors.retirementAge = retirementOrderError
  if (planningOrderError) fieldErrors.endAge = planningOrderError
  const fieldTab = (key: keyof Plan): Tab => ['age','portfolio','contribution'].includes(key) ? 'Today' : ['retirementAge','endAge','spending'].includes(key) ? 'Retirement' : ['income','incomeAge'].includes(key) ? 'Other income' : ['startStocks','retirementStocks','glideYears'].includes(key) ? 'Investments' : 'Advanced assumptions'
  const focusField = (key: keyof Plan) => {
    setTab(fieldTab(key))
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-field="' + key + '"] input')?.focus())
  }
  const stepValidationKeys = (step: Tab) => (Object.keys(plan) as (keyof Plan)[]).filter(key => fieldTab(key) === step || (step === 'Today' && key === 'retirementAge') || (step === 'Retirement' && key === 'age'))
  const showValidation = (keys = Object.keys(plan) as (keyof Plan)[]) => {
    setValidationShown(true)
    const first = keys.find(key => fieldErrors[key])
    if (first) {
      // Keep the dependent-age explanation beside the current-age input on step one.
      focusField(tab === 'Today' && first === 'retirementAge' && retirementOrderError ? 'age' : first)
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
    setMobileNav(false)
    if (target !== 'Plan' && !result) {
      setNav('Plan'); setModal(null)
      changeStep(planTabs.slice(0, 4).find(step => !reviewedSteps.includes(step)) ?? 'Investments')
      document.getElementById('planner')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    setNav(target)
    if (target === 'Compare') { if (validate(plan)) { setNav('Plan'); showValidation(); return } setModal('scenarios'); if (scenarioSignature !== JSON.stringify(plan) || scenarioResults.length === 0) compare(); return }
    setModal(null)
    document.getElementById(target === 'Results' ? 'results' : 'planner')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const save = () => {
    const issue = validate(plan); if (issue) { showValidation(); return }
    try { localStorage.setItem('ember-plan', JSON.stringify({ version: 2, plan, stockPresetId, bondPresetId })); setSaved(true) } catch { setError('Your browser could not save this plan. You can still export your projection.') }
  }
  const exportData = () => {
    if (!result) return
    const headers = ['Age', '10th percentile', '25th percentile', 'Median', '75th percentile', '90th percentile', 'Survival probability (%)'].map((key, i) => i > 0 && i < 6 ? t(key) + ' (' + currency + ')' : t(key))
    const csv = '\uFEFF' + [headers.map(header => '"' + header.replaceAll('"', '""') + '"').join(','), ...result.points.map(p => [p.age,p.p10,p.p25,p.p50,p.p75,p.p90,p.success].join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = `ember-retirement-projection-${currency}.csv`; a.click(); URL.revokeObjectURL(url)
  }
  const compare = () => {
    if (!setupComplete || !result) return
    const issue = validate(plan); if (issue) { showValidation(); return }
    scenarioWorkers.current.forEach(w => w.terminate()); scenarioWorkers.current = []
    setScenarioError(''); setScenarioBusy(true); setScenarioResults([]); setScenarioSignature(JSON.stringify(plan))
    const variants = [{ name: 'Your current plan', plan: { ...plan } }, { name: 'Retire 3 years later', plan: { ...plan, retirementAge: Math.min(plan.retirementAge + 3, plan.endAge - 1) } }, { name: 'Spend 10% less', plan: { ...plan, spending: Math.round(plan.spending * .9) } }]
    let finished = 0
    variants.forEach(variant => {
      const finish = () => { finished++; if (finished === variants.length) setScenarioBusy(false) }
      const finishWorker = (w: Worker) => { finish(); w.terminate() }
      const recordResult = (result: Results) => setScenarioResults(prev => [...prev, { ...variant, result }])
      try {
        const w = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }); scenarioWorkers.current.push(w)
        w.onmessage = (e) => { if (e.data.result) recordResult(e.data.result); else setScenarioError(e.data.error); finishWorker(w) }
        w.onerror = () => { setScenarioError('A scenario could not finish. Please try again.'); finishWorker(w) }
        w.postMessage({ plan: variant.plan, seed: 42 })
      } catch {
        // Same gated synchronous fallback as run(): small plans stay usable
        // where Workers are blocked, large plans surface the error instead.
        if (variant.plan.simulations <= SYNC_FALLBACK_LIMIT) {
          try { recordResult(simulate(variant.plan, 42)) }
          catch (error) { setScenarioError(error instanceof Error ? error.message : 'A scenario could not finish. Please try again.') }
        } else {
          setScenarioError('A scenario could not finish. Please try again.')
        }
        finish()
      }
    })
  }
  const scenariosStale = scenarioSignature !== null && scenarioSignature !== JSON.stringify(plan)
  const scenarioBaseline = scenarioResults.find(s => s.name === 'Your current plan')
  const field = (key: keyof Plan, label: string, options: { prefix?: string; suffix?: string; hint?: string; step?: number; min?: number; max?: number } = {}) => <label className="field" key={key} data-field={key}><span className="field-label">{label}{options.hint && <span className="hint-icon"><CircleHelp size={16}/></span>}</span>{options.hint && <span className="field-help">{options.hint}</span>}<span className="input-wrap">{options.prefix && <span>{options.prefix}</span>}{['portfolio','contribution','spending','income'].includes(key) ? <FinancialInput label={label} value={plan[key]} divisor={periods[key] === 'monthly' ? 12 : 1} format={number} error={validationShown ? fieldErrors[key] : undefined} fieldKey={key} onChange={value => update(key, value)}/> : <input aria-label={label} aria-invalid={validationShown && !!fieldErrors[key]} aria-describedby={validationShown && fieldErrors[key] ? `error-${key}` : undefined} type="number" min={options.min ?? 0} max={options.max} step={options.step ?? 1} value={Number.isNaN(plan[key]) ? '' : plan[key]} onChange={e => update(key, e.target.value === '' ? NaN : Number(e.target.value))} onBlur={() => { if (key === 'age' || key === 'retirementAge') setPlan(p => clampGlideYears(p)) }}/>}{options.suffix && !["contribution","spending","income"].includes(key) && <span className="input-suffix">{options.suffix}</span>}</span>{["contribution","spending","income"].includes(key) && <select aria-label={t("Entry period for {field}", { field: label })} value={periods[key] ?? "annual"} onChange={e => setPeriods(p => ({ ...p, [key]: e.target.value as "annual" | "monthly" }))}><option value="annual">{t("Per year")}</option><option value="monthly">{t("Per month")}</option></select>}{validationShown && fieldErrors[key] && <span className="field-error" id={`error-${key}`}>{fieldErrors[key]}</span>}</label>
  const stepIndex = planTabs.indexOf(tab)
  const stepLabels = [t("Your money today"), t("Your retirement"), t("Other income"), t("Your investments"), t("Advanced settings")]
  const stepTitles = [t("What are you starting with?"), t("What do you want retirement to look like?"), t("Will you have other retirement income?"), t("How will your money be invested?"), t("Adjust the calculation")]
  const stepDescriptions = [t("Enter your age, investments, and how much you save."), t("Choose when to retire and how much you will spend."), t("Add a pension or benefits. No other income? Leave it at zero."), t("Choose example assumptions for this calculation, or enter your own investment mix."), t("Optional. Keep the example assumptions or choose your own.")]
  const changeStep = (next: Tab) => {
    const keys = stepValidationKeys(tab)
    if (planTabs.indexOf(next) > stepIndex && keys.some(key => fieldErrors[key])) { showValidation(keys); return }
    setTab(next)
    requestAnimationFrame(() => document.getElementById('step-title')?.focus())
  }
  const nextStep = () => {
    const keys = stepValidationKeys(tab)
    if (keys.some(key => fieldErrors[key])) { showValidation(keys); return }
    setReviewedSteps(steps => steps.includes(tab) ? steps : [...steps, tab])
    changeStep(planTabs[Math.min(stepIndex + 1, 3)])
  }
  const success = result?.success ?? 0
  const failureRisk = 100 - success
  const projectionStatus = !setupComplete ? t("Review each step before calculating your results.") : busy ? t("Updating projection…") : error ? t("Projection update needs attention") : dirty ? t("Inputs changed — update projection") : result ? t("Up to date") : t("Projection unavailable")
  // Preserve the scale during partial age edits; clamp the value on blur.
  const rawMaxGlide = maxGlideYears(plan)
  const maxGlide = Number.isFinite(rawMaxGlide) ? Math.max(rawMaxGlide, plan.glideYears) : plan.glideYears
  return <div className="app-shell">
    {mobileNav && <button className="nav-backdrop" aria-label={t("Close navigation")} onClick={() => setMobileNav(false)}/>}
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}><button className="nav-close" aria-label={t("Close navigation")} onClick={() => setMobileNav(false)}><X size={22}/></button>
      <a className="brand" href="#" aria-label={t("Ember home")} onClick={e => { e.preventDefault(); navigate('Plan') }}><span className="brand-symbol"><Flame size={25} fill="currentColor" strokeWidth={1.6}/></span>ember<span className="brand-dot">.</span></a>
      <div className="workspace"><span className="workspace-avatar">P</span><span>{t("Personal workspace")}<small>{t("Your next chapter")}</small></span></div>
      <div className="nav-label">{t("YOUR PLAN")}</div>
      <nav>{[{ name: 'Plan', icon: <Globe2/> }, { name: 'Results', icon: <TrendingUp/> }, { name: 'Compare', icon: <SlidersHorizontal/> }].map(item => <button key={item.name} className={`nav-item ${nav === item.name ? 'active' : ''}`} aria-current={nav === item.name ? "page" : undefined} onClick={() => navigate(item.name)}>{item.icon}<span>{t(item.name)}</span>{nav === item.name && <span className="active-dot"/>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="little-card"><span className="little-icon"><Leaf size={19}/></span><strong>{t("A little clarity.")}<br/>{t("A lot of possibility.")}</strong><p>{t("A thoughtful plan for a life")}<br/>{t("that’s yours to choose.")}</p><button onClick={() => setModal('method')}>{t("Meet the methodology")} <ArrowRight size={14}/></button></div><button className="help-link" onClick={() => setModal('method')}><CircleHelp size={17}/> {t("How Ember works")} <ArrowRight size={14}/></button><div className="local-note"><span/>{t("Private by design. Saved on this device.")}</div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb"><button className="mobile-menu" aria-label={t("Open navigation")} aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)}><Menu size={20}/></button><span>{t("Your plan")}</span><ChevronRight size={13}/><strong>{t(nav)}</strong></div><div className="header-right"><div className="display-preferences"><select aria-label={t('Language')} value={language} onChange={e => setLanguage(e.target.value as typeof language)}>{languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select></div><span className="private-badge"><ShieldCheck size={14}/> {t("Your data stays yours")}</span></div></header>
      <main id="planner">
        <div className="page-title"><div><div className="eyebrow"><span/> {t("YOUR RETIREMENT, STEP BY STEP")}</div><h1>{t("Can your money last through retirement?")}<span>.</span></h1><p>{t("Tell us about your savings and the life you want. See how your plan could work.")}</p></div></div>
        {undoPlan && <div className="apply-notice" role="status">{t("Changes applied.")} <button className="button secondary" onClick={() => { setPlan(undoPlan); run(undoPlan); setSaved(false); setUndoPlan(null) }}>{t("Undo")}</button></div>}
        <div className={`planner-grid ${!result ? "setup-grid" : ""}`}>
          <section className="card plan-card" aria-labelledby="step-title"><div className="setup-navigation"><label className="step-picker"><span>{stepIndex < 4 ? t("Step {step} of 4", { step: stepIndex + 1 }) : t("Optional settings")}</span><select aria-label={t("Your plan")} value={tab} onChange={e => changeStep(e.target.value as Tab)}>{planTabs.slice(0, 4).map((step, index) => <option key={step} value={step}>{index + 1}. {stepLabels[index]}</option>)}{stepIndex === 4 && <option value="Advanced assumptions">{t("Advanced settings")}</option>}</select></label>{example && <span className="example-label">{t("Example plan")}</span>}</div>
            <div className="plan-fields" id="plan-panel"><div className="step-intro"><h3 id="step-title" tabIndex={-1}>{stepTitles[stepIndex]}</h3><p>{stepDescriptions[stepIndex]}</p></div>
              {tab === 'Today' && <><div className="field-row">{field('age',t("Current age"),{suffix:t("years"),min:18,max:109})}</div>{validationShown && retirementOrderError && <div className="age-recovery" role="alert"><p className="field-error">{retirementOrderError}</p><button className="button secondary" onClick={() => focusField('retirementAge')}>{t("Check retirement age")}</button></div>}<label className="currency-field"><span>{t("Currency")}</span><select aria-label={t('Currency')} value={currency} onChange={e => setCurrency(e.target.value as typeof currency)}>{currencies.map(c => <option key={c} value={c}>{c}</option>)}</select><span className="field-help">{t("Amounts are entered in {currency}. Changing currency does not convert values.", { currency })}</span></label>{field('portfolio',t("Money you have invested"),{prefix:symbol,hint:t("Add up your investments and retirement accounts. Do not include your home.")})}{field('contribution',t("Money you add to investments"),{prefix:symbol,suffix:t("/ year"),hint:t("How much will you invest while working? Choose per month or per year below.")})}<div className="field-footnote"><Info size={13}/> {t("All amounts are in today’s money ({currency}).", { currency })}</div></>}
              {tab === 'Retirement' && <><div className="field-row">{field('retirementAge',t("Retirement age"),{suffix:t("years"),min:19,max:109})}{field('endAge',t("Plan through age"),{suffix:t("years"),min:20,max:110})}</div>{validationShown && retirementOrderError && <button className="button secondary" onClick={() => focusField('age')}>{t("Check current age")}</button>}{field('spending',t("Money you will spend in retirement"),{prefix:symbol,suffix:t("/ year"),hint:t("Include housing, food, healthcare, taxes, and things you enjoy. Use today’s prices.")})}</>}
              {tab === 'Other income' && <>{field('income',t("Pension or other retirement income"),{prefix:symbol,suffix:t("/ year"),hint:t("Use the amount you receive after tax. Do not include withdrawals from your investments.")})}{field('incomeAge',t("Income starts at age"),{suffix:t("years"),min:18,max:110})}<div className="field-footnote"><Info size={13}/> {t("Income offsets spending once you retire.")}</div></>}
              {tab === 'Investments' && <section className="investment-editor" id="glide-path">
                <div className="investment-intro"><p>{t("Stocks are shares of company ownership. They can bring bigger gains and bigger losses.")}</p><p>{t("Bonds are loans to governments or companies. They can also lose value.")}</p></div>
                <fieldset className="investment-choices"><legend>{t("Choose assumptions for your investment mix")}</legend>
                  <label className="investment-choice"><input type="radio" name="investment-choice" checked={usingExampleMix} onChange={() => chooseInvestmentMix('example')}/><span><strong>{t("Use the example investment assumptions")}</strong><span>{t("An example for modeling your retirement, not investment advice.")}</span><span>{t("Today: {stocks}% stocks and {bonds}% bonds. At retirement: {retirementStocks}% stocks and {retirementBonds}% bonds.", { stocks: number(exampleMix.startStocks), bonds: number(100 - exampleMix.startStocks), retirementStocks: number(exampleMix.retirementStocks), retirementBonds: number(100 - exampleMix.retirementStocks) })}</span><span>{t("Start gradually moving from stocks to bonds {years} years before retirement.", { years: number(exampleMix.glideYears) })}</span></span></label>
                  <label className="investment-choice"><input type="radio" name="investment-choice" checked={!usingExampleMix} onChange={() => chooseInvestmentMix('custom')}/><span><strong>{t("Enter my investment mix")}</strong><span>{t("Set your own stock percentages. The rest is bonds. Switching back restores your entries for this visit.")}</span></span></label>
                </fieldset>
                {!usingExampleMix && <div className="glide-layout"><div className="glide-controls"><RangeField label={t("Stocks today")} value={plan.startStocks} onChange={v => update('startStocks', v)} min={0} max={100} allowedMin={plan.retirementStocks} suffix="%"/><RangeField label={t("Stocks at retirement")} value={plan.retirementStocks} onChange={v => update('retirementStocks', v)} min={0} max={100} allowedMax={plan.startStocks} suffix="%"/><RangeField label={t("Start moving from stocks to bonds")} value={plan.glideYears} onChange={v => update('glideYears', v)} min={0} max={maxGlide} suffix={t("years before")}/></div><GlideChart plan={plan}/></div>}
                <p className="investment-note">{t("Stock and bond returns, inflation, and fees are separate assumptions. Review them in Advanced settings.")}</p>
              </section>}
              {tab === 'Advanced assumptions' && <><div className="assumption-label">{t("NOMINAL ANNUAL RETURNS (CAGR)")}</div>{presetField('stock')}<div className="field-row">{field('stockReturn',t("Stock return"),{suffix:'%',step:.1,min:-20,max:30,hint:t("Nominal annual compound return (CAGR), including reinvested dividends.")})}{field('stockSD',t("Stock volatility (SD)"),{suffix:'%',step:.1,max:60,hint:t("Annualized standard deviation of simple returns.")})}</div>{presetField('bond')}<div className="field-row">{field('bondReturn',t("Bond return"),{suffix:'%',step:.1,min:-20,max:30,hint:t("Nominal annual compound return (CAGR), including reinvested coupons.")})}{field('bondSD',t("Bond volatility (SD)"),{suffix:'%',step:.1,max:60,hint:t("Annualized standard deviation of simple returns.")})}</div><div className="field-row">{field('inflation',t("Inflation"),{suffix:'%',step:.1,max:15,hint:t("Average annual inflation. Prices are sampled around this rate.")})}{field('inflationSD',t("Inflation volatility (SD)"),{suffix:'%',step:.1,max:15,hint:t("Annualized standard deviation of inflation. Inflation is sampled independently each year.")})}</div><div className="field-row">{field('correlation',t("Stock–bond correlation"),{step:.05,min:-1,max:1,hint:t("Correlation between annual stock and bond returns. The default is an illustrative assumption; presets do not change it.")})}{field('fee',t("Annual fees"),{suffix:'%',step:.05,max:5})}</div><div className="field-row single">{field('simulations',t("Simulations"),{step:100,min:100,max:20000})}</div></>}
            </div>
            <div className="plan-card-bottom">
              <div className="step-actions">
                {stepIndex > 0 && <button className="button secondary" onClick={() => changeStep(planTabs[stepIndex - 1])}>{t("Back")}</button>}
                {setupComplete && stepIndex < 3 && <button className="button secondary next-step" onClick={nextStep}>{t("Next: {step}", { step: stepLabels[stepIndex + 1] })}<ArrowRight size={16}/></button>}
                {stepIndex === 3 && <button className="advanced-link" onClick={() => { if ((Object.keys(fieldErrors) as (keyof Plan)[]).some(key => fieldTab(key) === tab)) { showValidation(); return }; setReviewedSteps(steps => steps.includes(tab) ? steps : [...steps, tab]); changeStep("Advanced assumptions") }}>{t("Advanced settings (optional)")}<ChevronRight size={16}/></button>}
              </div>
              {error && <p className="error" role="alert">{t(error)}</p>}
              <div className="step-primary-action"><button className="button primary run-button" onClick={() => !setupComplete && stepIndex < 3 ? nextStep() : run()} disabled={busy || (setupComplete && !dirty && !!result && !error)}>{busy && <span className="spinner"/>}{busy ? t("Checking your plan…") : !setupComplete && stepIndex < 3 ? t("Continue") : result ? t("Update results") : t("Show my results")}{!busy && <ArrowRight size={16}/>}</button></div>
              {setupComplete && <div className="projection-action-status" role="status">{projectionStatus}</div>}
              <div className="plan-save"><button className="button secondary save-button" onClick={save}>{saved ? <Check size={16}/> : <ArrowDownToLine size={16}/>} {saved ? t("Plan saved") : t("Save plan")}</button><span className="save-status" role="status">{saved ? t("Saved on this device") : t("Unsaved changes")}</span></div>
            </div>
          </section>
          {result && <div className="results-column" id="results" aria-busy={busy}><div className="results-intro"><h2 ref={resultHeading} tabIndex={-1}>{t("2. See how your plan holds up")}</h2><p>{example ? t("These results use example numbers. Enter your own to see your plan.") : t("These results use your last calculation.")}</p></div>
            <div className={`projection-status ${dirty || error ? "pending" : ""}`} role="status"><strong>{projectionStatus}</strong>{busy && <span>{t("Based on {count} simulated lifetimes", { count: number(submitted.simulations) })}</span>}{(dirty || busy || error) && <span>{t("Showing your last completed calculation. Your latest changes are not included yet.")}</span>}</div>
            <section className="card success-card result-summary" aria-labelledby="result-takeaway">
              <h3 id="result-takeaway">{failureRisk === 0 ? t("Your plan covered spending in every simulation.") : t("Your plan may leave you short of money in retirement.")}</h3>
              <p className="result-risk">{t("Risk of running out of money")}: {pct(failureRisk)}</p>
              <p>{t("A shortfall means investments could not cover spending in at least one retirement year, after any other income.")}</p>
              <div className="calculated-assumptions"><h4>{t("This calculation assumes")}</h4><ul>
                <li>{t("Retire at {age} and plan through age {endAge}.", { age: calculatedPlan.retirementAge, endAge: calculatedPlan.endAge })}</li>
                <li>{t("Spend {amount} a year in retirement.", { amount: money(calculatedPlan.spending) })}</li>
                <li>{t("Other income: {amount} a year from age {age}.", { amount: money(calculatedPlan.income), age: calculatedPlan.incomeAge })}</li>
              </ul><p>{t("All amounts are in today’s money ({currency}).", { currency })}</p></div>
              <p>{t("These are simulated possibilities, not a prediction. Actual results could be worse, even if no simulation ran short.")}</p>
              <p>{t("Try retiring later or spending less to see how the risk changes.")}</p>
              <button className="result-compare" onClick={() => navigate("Compare")}>{t("See ways to reduce this risk")}<ArrowRight size={16}/></button>
              <div className="metric-bottom">{t("Based on {count} simulated lifetimes", { count: number(calculatedPlan.simulations) })}</div>
            </section>
            <details className="result-details card"><summary>{t("Explore the details")}<span className="details-subtitle">{t("Exact estimates, investment balances, charts, and tougher market assumptions.")}</span></summary><div className="result-details-content">
              <section className="exact-risk"><h3>{t("Risk of running out of money")}</h3><p>{t("95% sampling interval: {low}–{high}", { low: pct(100 - result.successInterval[1]), high: pct(100 - result.successInterval[0]) })}</p><p>{t("Results depend on your assumptions. The sampling interval measures simulation noise only; it does not cover uncertainty about future markets.")}</p></section>
              <section className="card balance-card"><div className="metric-label">{t("Investments when you retire")} <Wallet size={15}/></div><strong className="metric-number">{money(result.retirementBalance, true)}</strong><p>{t("Median balance at age {age}", { age: calculatedPlan.retirementAge })}</p><div className="metric-divider"/><div className="small-metric"><span>{t("Initial withdrawal rate")}</span><strong>{result.withdrawalRate !== null ? pct(result.withdrawalRate) : '—'}</strong></div><span className="muted tiny">{t("In today’s dollars, before withdrawals")}</span></section>
            <section className="card projection-card"><div className="projection-heading"><div><h2>{t("Your money over time")}</h2><p>{t("Portfolio value over time, adjusted for inflation")}</p></div><button className="icon-button" aria-label={t("Download projection as CSV")} title={t("Download projection as CSV")} onClick={exportData} disabled={!result}><ArrowDownToLine size={17}/></button></div><div className="chart-legend"><span><i className="legend-line"/>{t("Middle outcome")}</span><span><i className="legend-square inner"/>{t("Middle 50% of outcomes")}</span><span><i className="legend-square outer"/>{t("Middle 80% of outcomes")}</span></div>{result ? <Projection points={result.points} plan={calculatedPlan}/> : <div className="chart-loading"><span className="spinner"/> {t("Finding the possibilities…")}</div>}<div className="chart-bottom"><span><span className="legend-dashed"/> {t("Retirement begins")}</span><span>{t("Values in today’s dollars")} <Info size={12}/></span></div></section>
              <Sensitivity analysis={result}/>
            </div></details>
          </div>}
        </div>
        <footer><span><Flame size={14}/> {t("Built for possibilities, not predictions.")}</span><button onClick={() => setModal('method')}>{t("Our methodology")} <ArrowUpRightIcon/></button><span>{t("Planning tool only. Not financial advice.")}</span></footer><div className="build-version"><span title={__BUILD_TIME__}>{__BUILD_LABEL__}</span></div>
      </main>
    </div>
    {modal && <div className="modal-overlay" onClick={closeModal}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}><div className="modal-dismiss">{modal === 'scenarios' && <button className="button secondary" onClick={closeModal}>{t("Return to plan")}</button>}<button className="icon-button modal-close" aria-label={t("Close dialog")} onClick={closeModal}><X size={20}/></button></div>{modal === 'method' ? <><span className="icon-tile"><Leaf size={22}/></span><h2 id="modal-title">{t("A plan built on possibilities.")}</h2><p>{t("Ember explores thousands of investment paths to help you understand uncertainty, rather than relying on a single average return.")}</p><h3>{t("Understanding uncertainty")}</h3><p>{t("Results depend on your assumptions. The sampling interval measures simulation noise only; it does not cover uncertainty about future markets.")}</p><h3>{t("Returns & risk")}</h3><p>{t("Annual stock and bond returns follow correlated lognormal distributions, calibrated to your nominal compound annual returns (CAGR) and simple-return standard deviations. Correlation applies to the underlying normal shocks. Inflation is drawn independently each year from a normal distribution with your chosen mean and standard deviation. Each path uses a repeatable random seed so you can compare changes fairly.")}</p><h3>{t("Your money, in today’s terms")}</h3><p>{t("Contributions, spending, and retirement income stay constant in purchasing power. Each year’s nominal return is divided by that year’s realized inflation, so high inflation reduces real growth. Contributions arrive at year end before retirement. Spending, less any eligible income, is withdrawn at the start of each retirement year. Include estimated taxes and healthcare in spending; income should be after tax.")}</p><h3>{t("A gradual shift in risk")}</h3><p>{t("Your stock allocation decreases linearly over the selected years before retirement, then stays at your retirement allocation. The balance is bonds. We rebalance annually, deduct annual fees, and treat any year with insufficient funds for spending as a failed path—even if wealth later recovers.")}</p><h3>{t("Default assumptions")}</h3><p>{t("Presets use historical USD total returns with dividends or coupons reinvested. Selecting a preset applies its compound annual return (CAGR) and volatility. Historical periods differ by source. Inflation and correlation remain separate assumptions. Historical returns are not forecasts.")}</p><p className="source-note">{t("Sources and historical periods are linked beside each preset. ETF returns include fund expenses; annual fees should cover additional costs only.")}</p><h3>{t("Know the limits")}</h3><p>{t("Percentile bands describe simulated outcomes, not guarantees. The model does not include market regime changes, serial correlation, tax calculations, correlation between inflation and returns, or unexpected expenses. These assumptions are not a promise of future returns. Revisit your assumptions and plan with a qualified adviser.")}</p><button className="button secondary" onClick={() => { setExample(true); setPlan({ ...defaults }); setStockPresetId(defaultStockPreset.id); setBondPresetId(defaultBondPreset.id); setSaved(false); setModal(null); run({ ...defaults }) }}><RotateCcw size={15}/> {t("Restore example plan")}</button></> : <><span className="icon-tile"><SlidersHorizontal size={22}/></span>
      <h2 id="modal-title">{t("Ways to reduce your risk")}</h2>
      <p>{t("Compare one change at a time with your current inputs. Choose a change to update your plan.")}</p>
      {scenarioBusy ? <p className="scenario-progress" role="status"><span className="spinner"/> {t("Comparing possibilities…")}</p> : (scenariosStale || scenarioResults.length < 3 || scenarioError) && <button className="button primary" onClick={compare}><Play size={14}/> {scenariosStale ? t("Compare current inputs") : scenarioError ? t("Try comparison again") : t("Compare scenarios")}</button>}
      {scenariosStale && scenarioResults.length > 0 && <p className="notice" role="status">{t("The plan changed since these scenarios were computed. Recompute to compare the current inputs.")}</p>}
      {scenarioResults.length > 0 && <div className="scenario-list">{[...scenarioResults].sort((a,b) => ['Your current plan','Retire 3 years later','Spend 10% less'].indexOf(a.name) - ['Your current plan','Retire 3 years later','Spend 10% less'].indexOf(b.name)).map(s => {
        const baseline = s.name === 'Your current plan'
        const ageChange = s.name === 'Retire 3 years later'
        const unchanged = !baseline && scenarioBaseline && s.plan.retirementAge === scenarioBaseline.plan.retirementAge && s.plan.spending === scenarioBaseline.plan.spending
        return <div className="scenario-result" key={s.name}>
          <div><h3>{baseline ? t("Your current inputs") : ageChange ? t("Retire at {age}", { age: s.plan.retirementAge }) : t("Spend {amount} per year", { amount: money(s.plan.spending) })}</h3>
            <p>{baseline ? t("Retire at {age} with spending of {amount} per year.", { age: s.plan.retirementAge, amount: money(s.plan.spending) }) : ageChange ? t("Keep spending at {amount} per year.", { amount: money(s.plan.spending) }) : t("Keep retirement at age {age}.", { age: s.plan.retirementAge })}</p>
            {!baseline && scenarioBaseline && <p>{ageChange ? t("Current retirement age: {age}.", { age: scenarioBaseline.plan.retirementAge }) : t("Current spending: {amount} per year.", { amount: money(scenarioBaseline.plan.spending) })}</p>}
          </div>
          <div className="scenario-outcome"><strong>{pct(100 - s.result.success)}</strong><span>{t("Risk of running out of money")}</span>
            {!baseline && scenarioBaseline && <p>{t("Current input risk: {risk}.", { risk: pct(100 - scenarioBaseline.result.success) })}</p>}
            {!baseline && (unchanged ? <p>{t("This already matches your current inputs.")}</p> : <button className="button secondary" disabled={scenariosStale || scenarioBusy || !scenarioBaseline} title={scenariosStale ? t("The plan changed since these scenarios were computed. Recompute to compare the current inputs.") : undefined} onClick={() => { setUndoPlan({ ...plan }); setExample(false); setPlan(s.plan); setSaved(false); run(s.plan); closeModal() }}>{ageChange ? t("Use retirement age {age}", { age: s.plan.retirementAge }) : t("Use spending of {amount} per year", { amount: money(s.plan.spending) })} <ArrowRight size={14}/></button>)}
          </div>
        </div>
      })}</div>}
      {scenarioError && <p className="error" role="alert">{t(scenarioError)}</p>}
      <p className="tiny muted">{t("Risk means investments could not cover spending in at least one retirement year through age {age}. All amounts are in today’s money ({currency}).", { age: scenarioBaseline?.plan.endAge ?? plan.endAge, currency })}</p></>}</section></div>}
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
    <details><summary><span>{t("What if markets are worse?")}</span><span className="details-subtitle">{t("See how lower returns or higher inflation change the result.")}</span></summary>
    <p>{t('Each scenario changes one assumption from your submitted plan. Other inputs stay the same.')}</p>
    <div className="sensitivity-table-wrap"><table className="sensitivity-table">
      <thead><tr><th scope="col">{t('Scenario')}</th><th scope="col">{t('Risk of running out of money')}</th><th scope="col">{t('95% sampling interval')}</th></tr></thead>
      <tbody><tr><th scope="row">{t('Your submitted assumptions')}</th><td>{pct(100 - analysis.success)}</td><td>{pct(100 - analysis.successInterval[1])}–{pct(100 - analysis.successInterval[0])}</td></tr>
      {analysis.sensitivity.map(s => <tr key={s.id}><th scope="row">{labels[s.id]}</th><td>{s.result ? pct(100 - s.result.success) : '—'}</td><td>{s.result ? <>{pct(100 - s.result.successInterval[1])}–{pct(100 - s.result.successInterval[0])}</> : t('Outside supported input limits')}</td></tr>)}</tbody>
    </table></div>
    <p>{t('Results depend on your assumptions. The sampling interval measures simulation noise only; it does not cover uncertainty about future markets.')}</p>
    <p>{t('Stress scenarios are illustrative, with no assigned likelihood. They use the same annual market model and do not measure all possible risks.')}</p></details>
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
