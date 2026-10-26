# FIRE planner — review TODO

Verdict: **CHANGES_REQUIRED**

Scope: whole working tree (not a git repository, so no diff/history). Target hosting: Cloudflare Workers serving the Vite build.

Ordered by severity. Each item lists where the problem is, why it matters, and the intended fix.

---

## P1 — Add a Cloudflare Workers deployment path

- [ ] Add `wrangler.jsonc` with assets-only config:

  ```jsonc
  {
    "name": "ember-fire-planner",
    "compatibility_date": "2026-10-01",
    "assets": { "directory": "./dist" }
  }
  ```

- [ ] Add `wrangler` to `devDependencies`.
- [ ] Add scripts: `"deploy": "npm run build && wrangler deploy"` and `"preview:cf": "npm run build && wrangler dev"`.
- [ ] Document the Cloudflare deploy flow in `README.md` (replace the generic "deploy that directory to a static web host").
- [ ] Do **not** add `not_found_handling: "single-page-application"`: the app has no client routes, only in-page anchors and local state.
- [ ] Keep absolute `/assets/*` paths. Add Vite `base` only if the app will be served under a subpath later.

Current state: no `wrangler.*`, no `_headers`/`_redirects`, no Wrangler dependency, no deploy script.

---

## P2 — Fix glide-path control/state desynchronization

Where: `src/main.tsx:114` (dynamic `max`), `src/main.tsx:50` (`update`), `src/simulation.ts:22-26` (`stockWeight`), `src/simulation.ts:8` (`glideYears: 15`).

Problem: the "Start reducing risk" slider caps at `Math.min(40, retirementAge - age)`, but `plan.glideYears` is never clamped when age or retirement age changes. The range input's thumb clamps to `max`, the label renders the raw state, and the chart/simulation use the raw state.

Reproduction (defaults, production preview):

1. Load defaults (`age 30`, `retirementAge 50`, `glideYears 15`).
2. Set **Current age** to `40`.

Observed:

| Surface | Value |
|---|---|
| Slider label | `15 years before` |
| Slider thumb | `10` (`max="10"`) |
| "Stocks today" | `90%` |
| Chart today marker | `77%` |
| Chart aria-label | "Stocks reduce from 90% to 50% by retirement" |
| Simulation input | `glideYears: 15` |

Same screen claims today's allocation is 90% and 77%; touching the slider silently rewrites the plan from 15 to 10. Survives save/reload. Also: `max` goes negative when `retirementAge < age`, and `validate` allows up to 60 while the slider caps at 40.

- [ ] Clamp `glideYears` whenever `age` or `retirementAge` changes:
      `const maxGlide = Math.max(0, Math.min(40, p.retirementAge - p.age))`
- [ ] Enforce it in `validate` (or fix the slider `max` to 60 and relabel the control/chart if pre-age glides are intentional).
- [ ] Update the README sentence that documents glides starting before the current age, if the clamp approach is chosen.
- [ ] Add a regression test asserting `glideYears <= retirementAge - age` after age changes.

---

## P2 — Invalidate scenario results when the plan changes

Where: `src/main.tsx:28` (`scenarioResults`), `src/main.tsx:68-81` (`compare`), `src/main.tsx:120` (render, "Use this plan").

Problem: scenario outputs are computed from a snapshot of `plan` and never invalidated. `dirty` tracks only `plan` vs `submitted`, not scenarios.

Reproduction:

1. Defaults → **Explore a scenario** → **Compare scenarios**.
2. Close, go to **Retirement**, set **Annual retirement spending** to `60000`.
3. Reopen **Explore a scenario**.

Observed: cards still show `Retire at 50 · $48,000 / year` and `75.4%` success, with no stale indicator. Worse, **Use this plan** writes back the full stale snapshot (every old field), silently discarding edits made since the comparison.

- [ ] Store an input signature with the results (e.g. `signature: JSON.stringify(plan)`).
- [ ] When `plan` changes: clear the results, or mark them stale with a "Plan changed — recompute" banner.
- [ ] Disable **Use this plan** while results are stale.
- [ ] Clearing on modal open is the least surprising option if a banner is not added.

---

## P3 — Keep results and labels paired during runs and failures

Where: `src/main.tsx:34-44` (`run` never clears `result`), `src/main.tsx:107` (pill/metrics).

Problem: `submitted` updates immediately, `result` only on success. During a re-run — and permanently after `onerror` — old numbers render under new labels (e.g. "Median balance at age 60" using the age-50 simulation). Before the first result, the pill renders `Room to improve` at `0%` because `success = result?.success ?? 0`.

Reproduction: any re-run (transient, usually sub-second for 5,000 paths) or a worker failure; not triggered by validation errors, which return early.

- [ ] Clear `result` when a run starts.
- [ ] Gate the success pill and metric cards on `result && !busy`.

---

## P3 — Handle Worker construction failure

Where: `src/main.tsx:39`, `src/main.tsx:75`.

Problem: `new Worker(new URL(...), { type: 'module' })` is unguarded. Unsupported environments (Firefox < 114) or blocked construction throws inside the mount effect; with no error boundary the tree unmounts and the page goes blank.

- [ ] Wrap construction in `try/catch` and surface the existing error message.
- [ ] Optional: fall back to `simulate` on the main thread for small `simulations` counts.

---

## P3 — Deduplicate projection x-axis ticks

Where: `src/main.tsx:148`.

Problem: 7 evenly spaced ages are rounded without deduplication; short horizons produce repeated labels and duplicate React keys.

Reproduction: age `98`, retirement `99`, plan through `100` → axis text `98, 98, 99, 99, 99, 100, 100`.

- [ ] Deduplicate (`[...new Set(ageTicks)]`) or skip ticks within a minimum pixel distance of the previous one.

---

## P3 — Add dialog focus trap and focus restoration

Where: `src/main.tsx:120`.

Problem: the modal uses `role="dialog" aria-modal="true"` and autofocuses the close button, but Tab escapes to the background page and focus is not restored on close. Escape and overlay click already work.

- [ ] Cycle focus inside `.modal` and restore the previously focused element on unmount, or adopt a dialog primitive.

---

## P3 — Add security headers and asset caching policy

Where: repository root (no `_headers`); Workers Assets defaults.

Problem: assets are served with `Cache-Control: public, max-age=0, must-revalidate` and no CSP, `X-Content-Type-Options`, `Referrer-Policy`, or frame protection. No backend/auth, so the exposure is clickjacking plus missing defense-in-depth; hashed assets also lose immutable caching.

- [ ] Ship `public/_headers` (Vite copies it into `dist`):

  ```
  /*
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
    Content-Security-Policy: default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self'

  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  ```

- [ ] `style-src 'unsafe-inline'` is required by inline `style` props; `worker-src 'self'` by the simulation worker. Do not add `script-src 'unsafe-inline'`.

---

## P3 — Remove the render-blocking third-party font import

Where: `src/styles.css:1`.

Problem: Google Fonts is loaded via CSS `@import`, so a third-party stylesheet blocks styling/first paint and discloses the visitor IP. The system-font fallback prevents breakage but the cost remains; it is also why the CSP needs an external `font-src`.

- [ ] Self-host both families via `@fontsource/*` and drop the `@import`.
- [ ] Then tighten CSP to `font-src 'self'`.

---

## Verification checklist

- [ ] `npm test` — currently 2 files / 15 tests pass (simulation + i18n).
- [ ] `npm run build` — currently passes; `dist/` = 297 kB JS (95 kB gzip), 32 kB CSS, 3.4 kB worker.
- [ ] Production preview at `http://127.0.0.1:4173` — simulation completes, `75%` success, 2 charts, worker assets resolve, 0 console errors.
- [ ] `npm audit` — currently 0 vulnerabilities (prod and dev).
- [ ] Re-run the glide, scenario, and tick reproductions after fixes.
- [ ] Deploy once to Cloudflare and confirm `/`, hashed assets, worker loading, and 404 behavior.

## Not verified during review

- No actual Cloudflare deployment (no config or credentials).
- Chromium only; Worker-failure and legacy-browser paths reasoned from code.
- No screen-reader or automated accessibility audit; accessibility items are code inspection only.
- No mobile-breakpoint visual review beyond the existing responsive CSS.
- No git history, so behavior changes could not be compared against prior revisions.

## What holds up

Correlated normal shocks feed lognormal gross returns calibrated to arithmetic mean/SD; inflation is independent and deflates each year's growth; fees apply multiplicatively; failed years latch so success cannot recover. Inputs never leave the browser, no `dangerouslySetInnerHTML`, translations are key-complete and placeholder-checked by tests, and 5,000-path runs stay off the main thread.
