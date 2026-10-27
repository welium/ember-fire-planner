# Ember FIRE planner

A browser-based financial independence planner built with React, TypeScript, Vite, and Tailwind CSS. No backend is required. Financial inputs and calculations stay in the browser. DM Sans and Manrope are self-hosted as variable fonts via Fontsource, so no third-party requests are needed; system fonts are used when the bundled fonts are unavailable.

The interface supports English, Traditional Chinese, Simplified Chinese, and Japanese. A display-currency setting supports USD, TWD, HKD, CNY, JPY, EUR, GBP, CAD, AUD, SGD, CHF, and KRW.

## Run locally

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The development server listens on all network interfaces. To bind only to this computer, use `npm run dev -- --host 127.0.0.1`.

```sh
npm test
npm run build
npm run preview
```

The production files are in `dist/`. `npm run preview` serves that directory with Vite for a quick local check.

## Deploy to Cloudflare Workers

The site is a static Vite build served by Cloudflare Workers Assets. There is no Worker script and no backend. `wrangler.jsonc` points Wrangler at the `dist/` directory.

```sh
npx wrangler login
npm run deploy
```

`npm run deploy` builds the app and uploads `dist/` to the `ember-fire-planner` Worker. The first run creates the Worker on your Cloudflare account; later runs publish a new version. To test the production build on Cloudflare's local runtime before deploying, run:

```sh
npm run preview:cf
```

Wrangler serves the site at `http://localhost:8787` by default.

The app has no client-side routes; navigation uses in-page anchors and local state. No single-page-application fallback is configured, so unknown paths return Cloudflare's normal 404 response. Absolute `/assets/*` URLs are served from the same origin.

`public/_headers` ships security and caching policy with the build: `nosniff`, a same-origin CSP (inline styles only, no inline scripts), deny framing, and immutable year-long caching for hashed `/assets/*` files.

## Use the planner

1. Enter your current age, planned retirement age, investable portfolio, annual contributions, and retirement spending.
2. In **Retirement**, set the planning horizon and after-tax retirement income, including its starting age.
3. In **Assumptions**, adjust stock and bond returns, standard deviations, correlation, inflation, inflation volatility, fees, and the number of simulations.
4. Adjust the glide path to reduce stock exposure before retirement.
5. Select **Run simulation** to update the projection and assumption stress scenarios. The glide path changes immediately; the result cards, main chart, and sensitivity table update after a run.
6. Explore scenarios to compare retiring three years later or spending 10% less. You can apply an alternative to your plan.

Use the selectors in the top bar to change the interface language and display currency. Both settings are saved on this device.

**Save plan** saves inputs in this browser's local storage. CSV export downloads the current simulation's annual percentiles and survival probabilities. It does not export unsimulated input edits. Hover over the projection to inspect a particular age. **Our methodology** explains assumptions and can restore the example plan.

## Language and currency display

All planner arithmetic is independent of language and currency. Amounts are never converted. Changing the display currency changes only the symbol and number formatting, so enter amounts in the currency you want to view. The `currency` input is passed to `Intl.NumberFormat`, which applies local conventions for grouping, decimal separators, and compact notation. Explicit symbols avoid ambiguity for dollar-based currencies: `$` (USD), `NT$`, `HK$`, `C$`, `A$`, and `S$`.

CSV exports include localized column names and the currency code in the monetary column headings. The filename includes the currency code. Hover over the **Currency** selector to see the reminder that amounts are not converted.

Translation keys are the English messages. Each key must have Traditional Chinese, Simplified Chinese, and Japanese versions with matching placeholders. Add or change UI text through the `t()` function and add all four versions in `src/translations.ts`. The test suite scans the UI and validation messages for untranslated keys.

## Historical assumption presets

Select a stock and bond preset in **Assumptions** to apply both nominal compound annual return (CAGR) and annualized simple-return standard deviation. Other inputs remain unchanged. Editing either field switches that asset to Custom. Run simulation explicitly to update results. Source links and observed dates appear below each selector. Changing display currency does not convert returns or amounts.

| Preset | CAGR | Annualized SD | Observed period |
| --- | ---: | ---: | --- |
| Global equities — MSCI ACWI | 7.69% | 15.43% | 1998-12-31–2026-09-30 |
| U.S. equities — MSCI USA | 8.66% | 15.24% | 1998-12-31–2026-09-30 |
| Hong Kong equities — MSCI Hong Kong | 6.86% | 21.31% | 1998-12-31–2026-09-30 |
| Japan equities — MSCI Japan | 5.43% | 16.20% | 1998-12-31–2026-09-30 |
| China equities — MSCI China | 5.84% | 28.05% | 1998-12-31–2026-09-30 |
| Nasdaq-100 — QQQ | 10.88% | 23.26% | 1999-03-10–2026-09-30 |
| Global investment-grade corporate — CORP | 1.79% | 6.44% | 2012-09-24–2026-09-30 |
| U.S. Treasury — short term (1–3 years) | 1.95% | 1.49% | 2002-07-30–2026-09-30 |
| U.S. Treasury — intermediate term (7–10 years) | 3.36% | 6.66% | 2002-07-30–2026-09-30 |

Fresh and reset plans use MSCI ACWI and CORP. All presets use USD unhedged total returns, including reinvested dividends/coupons. The catalog retains full precision. Inflation remains 2.0% with 1.7% SD, shock correlation 0.30, and additional fees 0.2%; these are separate illustrative assumptions and are not estimated when selecting presets.

### Sources and limitations

The frozen catalog is in `data/assumptions/snapshot.json`, retrieved October 27, 2026. Five MSCI entries use the provider's public monthly gross USD index levels (GRTR). Each record includes its exact request URL, index code, observation count, and response checksum. The public endpoint returns history from December 1998 even when an earlier start is requested. These calculations do not use the longer 1969/1987/1992 histories documented as available by MSCI; obtaining permitted longer exports remains unfinished data work.

MSCI ACWI covers developed/emerging large and mid caps, excluding small caps. MSCI Hong Kong follows country classification and differs from HSI's mainland-company exposure. MSCI China includes eligible offshore listings and partial A-share inclusion, with coverage changing over time; it is not Shanghai-only.

ETF proxies use Yahoo daily adjusted market closes and their distribution adjustments. CAGR uses actual endpoints and elapsed days / 365.2425. SD is sample monthly simple-return SD times sqrt(12), excluding the initial partial month. ETF returns embed fund expenses; enter only additional expenses in annual fees. CORP's issuer reports inception NAV CAGR of 1.80%, compared with the 1.79% market-close calculation. SHY/IEF vendor histories start eight calendar days after their July 22, 2002 fund launches.

References: [MSCI](https://www.msci.com/indexes), [CORP](https://www.ishares.com/ch/individual/en/products/251813/ishares-global-corporate-bond-ucits-etf), [SHY](https://www.ishares.com/us/products/239452/ishares-1-3-year-treasury-bond-etf), [IEF](https://www.ishares.com/us/products/239456/ishares-7-10-year-treasury-bond-etf). The implementation plan records ETF inputs, checksums, and longer-history targets. Raw provider observations are not redistributed; public access does not establish redistribution permission.

The offline tool accepts a local JSON array of monthly observations, each with an ISO date and positive value:

`node --experimental-strip-types scripts/build-assumption-presets.ts path/to/monthly-levels.json`

It rejects missing/duplicate months and invalid values, then outputs CAGR, SD, dates, observation count, and input checksum. It does not download data. Browsers use the frozen catalog without market-data requests.

Historical returns are descriptive, not forecasts. Longer index histories remain preferred; do not splice unlike benchmarks to manufacture length. A 30-year simulation can use a shorter calibration history, but additional simulations do not reduce uncertainty about the parameters or missing market regimes.

### Saved-plan compatibility

The existing `ember-plan` key now contains a version-2 envelope with numeric inputs and preset IDs. Unversioned plans are converted from arithmetic returns to equivalent CAGR while preserving their modeled distributions and SD. Missing legacy fields use the previous defaults; the glide-length migration remains active. Legacy selections become Custom. Loading does not write storage; the next explicit Save writes version 2. Malformed or unsupported saves fall back to defaults. Stale preset IDs become Custom while valid numeric inputs remain available.

## Financial model

Each simulation samples annual correlated lognormal gross stock and bond returns, plus an independent normal inflation rate. Stock and bond inputs are nominal CAGR and simple-return SD. For decimal CAGR `g` and SD `s`, the underlying normal parameters are:

```text
A = 1 + g
x = (1 + sqrt(1 + 4 × (s/A)²)) / 2
mu = ln(A)
sigma = sqrt(ln(x))
```

The entered CAGR determines expected single-asset log growth, not every path’s realized CAGR or a weighted portfolio CAGR. The calibration preserves the simple-return variance as A² × x × (x − 1).

The correlation input applies to the underlying normal shocks. It is not the exact Pearson correlation of the resulting simple returns. Asset returns remain above −100%.

Inflation is drawn from a normal distribution with the chosen mean and standard deviation. It is independent across years and of stock and bond returns. A year's real growth factor is:

```text
(1 + nominal portfolio growth) × (1 − fee) / (1 + realized inflation)
```

Because this division is nonlinear, real outcomes are not the same as deflating every path by the mean inflation rate.

Stocks decline linearly from the starting weight to the retirement weight over the selected glide period, which is capped at the years remaining until retirement. The glide therefore always starts at today's allocation and reaches the retirement allocation exactly at retirement. A zero-year glide switches allocation at retirement. The balance is bonds, and the portfolio rebalances annually.

All balances and cash flows are in today's purchasing power, expressed in the display currency. Each annual step:

1. If retired, withdraw spending less eligible retirement income at the beginning of the year. Income starts at the specified age, and only offsets cash flows after retirement. Surplus income is invested.
2. Apply weighted stock and bond gross returns.
3. Deduct the proportional annual fee and deflate by that year's realized inflation.
4. Before retirement, add the annual contribution at year end.

Contributions, spending, and income are constant in real terms. The balance shown at retirement is before the first retirement withdrawal. The plan funds years from retirement age through the year before the end age. Success means meeting every annual withdrawal through this horizon. A funding shortfall permanently marks the path unsuccessful, including if later income restores a positive balance. Wealth cannot be negative. Exact depletion after a fully funded final withdrawal counts as success.

The initial withdrawal rate uses spending less income already available at retirement, divided by the median portfolio at retirement. If that balance is zero and a withdrawal is required, the rate is unavailable and displays as “—”. If no withdrawal is required, the rate is zero. It is not a safe withdrawal recommendation. Percentiles are calculated independently at each age; a percentile curve is not one simulated lifetime.

### Sampling uncertainty and assumption sensitivity

Each success estimate includes a 95% Wilson score interval. This interval measures finite-sample simulation error, conditional on the selected model and assumptions. It retains uncertainty when every path succeeds or every path fails. It does not measure uncertainty about expected returns, market regimes, or the model itself. At about 61% success, 5,000 paths give an interval of roughly ±1.35 percentage points; increasing the path count reduces sampling error but does not validate the financial model.

Each main run also evaluates four illustrative stresses against the submitted inputs:

- Reduce both stock and bond CAGR inputs by 1 percentage point.
- Reduce both returns by 2 percentage points.
- Increase mean inflation by 1 percentage point.
- Set stock–bond shock correlation to the greater of 0.70 and the submitted correlation. This stress is unchanged if the submitted correlation is already at least 0.70.

Each stress retains all other inputs and uses the same seed and annual shocks as the baseline. Return stresses keep the entered simple-return standard deviations constant. If an exact stress exceeds the supported input limits, its result is unavailable; the inputs are not clamped. The stresses do not change the saved plan or the default assumptions. They have no assigned likelihood, and their range is not a confidence interval. The table updates with the submitted simulation, so unsimulated edits do not relabel previous results. Plan-alternative comparisons remain separate from these assumption stresses.

Simulations use a deterministic seed of 42. Scenario comparisons use common random shocks to reduce noise when comparing inputs. Work runs in Web Workers to keep the interface responsive.

## Limits

The model has not been validated against a historical retirement dataset or an independent simulation model. The stress table tests sensitivity within the same model; it does not establish that its absolute success probabilities predict real outcomes. Historical preset parameters are held constant across the planning horizon. No market-regime transition is applied.

The model uses independent annual shocks, constant return and inflation distributions, and annual cash flows. It does not model serial correlation, changing market regimes, correlation between inflation and returns, tax rules, individual accounts, housing, irregular expenses, or flexible spending. Enter estimated withdrawal taxes and healthcare costs in spending; enter pension and benefit income after tax. Income is assumed to be fully inflation-linked.

Defaults are illustrative assumptions, not forecasts. Simulated probabilities are conditional on the model and inputs. They are not guarantees or financial advice.

## Code map

- `src/simulation.ts`: validation, portfolio allocation, random returns, cash flows, and percentiles.
- `src/simulation.test.ts`: deterministic cash flow and simulation checks.
- `src/simulation.worker.ts`: background simulation entry point.
- `src/i18n.tsx`: language and currency preferences, translation lookup, and locale-aware formatting.
- `src/translations.ts`: English source messages with Traditional Chinese, Simplified Chinese, and Japanese translations.
- `src/i18n.test.ts`: translation coverage, placeholder, preference, and formatting checks.
- `src/main.tsx`: planner, charts, local saving, scenarios, and CSV export.
- `src/styles.css`: responsive styles.
