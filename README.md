# Ember FIRE planner

A browser-based financial independence planner built with React, TypeScript, Vite, and Tailwind CSS. No backend is required. Financial inputs and calculations stay in the browser. Google Fonts supplies the typefaces; system fonts are used when unavailable.

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

The production files are in `dist/`. Deploy that directory to a static web host.

## Use the planner

1. Enter your current age, planned retirement age, investable portfolio, annual contributions, and retirement spending.
2. In **Retirement**, set the planning horizon and after-tax retirement income, including its starting age.
3. In **Assumptions**, adjust stock and bond returns, standard deviations, correlation, inflation, inflation volatility, fees, and the number of simulations.
4. Adjust the glide path to reduce stock exposure before retirement.
5. Select **Run simulation** to update the projection. The glide path changes immediately; the result cards and main chart update after a run.
6. Explore scenarios to compare retiring three years later or spending 10% less. You can apply an alternative to your plan.

Use the selectors in the top bar to change the interface language and display currency. Both settings are saved on this device.

**Save plan** saves inputs in this browser's local storage. CSV export downloads the current simulation's annual percentiles and survival probabilities. It does not export unsimulated input edits. Hover over the projection to inspect a particular age. **Our methodology** explains assumptions and can restore the example plan.

## Language and currency display

All planner arithmetic is independent of language and currency. Amounts are never converted. Changing the display currency changes only the symbol and number formatting, so enter amounts in the currency you want to view. The `currency` input is passed to `Intl.NumberFormat`, which applies local conventions for grouping, decimal separators, and compact notation. Explicit symbols avoid ambiguity for dollar-based currencies: `$` (USD), `NT$`, `HK$`, `C$`, `A$`, and `S$`.

CSV exports include localized column names and the currency code in the monetary column headings. The filename includes the currency code. Hover over the **Currency** selector to see the reminder that amounts are not converted.

Translation keys are the English messages. Each key must have Traditional Chinese, Simplified Chinese, and Japanese versions with matching placeholders. Add or change UI text through the `t()` function and add all four versions in `src/translations.ts`. The test suite scans the UI and validation messages for untranslated keys.

## Default assumptions

The example plan uses global capital-market assumptions, not U.S.-only historical returns. The data are a 10-year, nominal, U.S.-dollar view as of September 30, 2026.

| Input | Default | Basis |
| --- | ---: | --- |
| Global stock return | 7.1% | Arithmetic mean implied by a 5.9% expected compound return and 15.9% volatility |
| Global stock volatility | 15.9% | U.S. and ex-U.S. equity volatility, weighted by VT's regional allocation |
| Global bond return | 5.8% | Arithmetic mean implied by a 5.65% expected compound return and 5.5% volatility |
| Global bond volatility | 5.5% | U.S. and hedged global aggregate bond volatility |
| Inflation | 2.0% | Midpoint of Vanguard's 10-year U.S. inflation range |
| Inflation volatility | 1.7% | Vanguard and J.P. Morgan 10-year inflation volatility estimates |
| Stock–bond correlation | 0.30 | J.P. Morgan's 2026 long-term correlation of 0.33 for global equities versus U.S. aggregate bonds |
| Fees | 0.2% | User assumption; include fund, platform, and advisory costs |

### Stock derivation

VT tracks the FTSE Global All Cap Index. The index had 62.39% U.S. and 37.61% non-U.S. weight at September 30, 2026. The Vanguard Capital Markets Model (VCMM) 10-year midpoints for that date are:

- U.S. equities: 5.8% expected annualized compound return; 15.0% median volatility.
- Global ex-U.S. equities: 6.0% expected annualized compound return; 19.1% median volatility.

The weighted expected compound return is `0.6239 × 5.8% + 0.3761 × 6.0% = 5.875%`. Using a 0.84 correlation between U.S. and non-U.S. equity returns, estimated from monthly VTI and VXUS returns from 2011 to 2026, the weighted volatility is:

```text
sqrt(0.6239² × 15.0² + 0.3761² × 19.1²
     + 2 × 0.6239 × 0.3761 × 0.84 × 15.0 × 19.1) = 15.88%
```

The simulation takes an arithmetic mean, not the compound median. For lognormal returns, the arithmetic mean is approximately the compound return plus half the variance:

```text
5.875% + 15.88² / 200 = 7.14%
```

The default input is rounded to 7.1%. The model's resulting median compound return is about 5.9%.

### Bond derivation

Vanguard's 10-year midpoints are 5.6% for U.S. aggregate bonds and 5.7% for global ex-U.S. aggregate bonds hedged to the dollar. Their median volatilities are 6.3% and 5.3%. A roughly equal blend gives about 5.65% expected compound return and 5.5% volatility. Converting to the app's arithmetic-mean input gives approximately 5.8%.

### Inflation derivation

The default mean of 2.0% is the midpoint of Vanguard's 1.5%–2.5% 10-year U.S. inflation range. Both providers report similar uncertainty: Vanguard's median inflation volatility is 1.7%, and J.P. Morgan's 2026 Long-Term Capital Market Assumptions use a 1.77% annualized volatility for U.S. inflation. The app rounds this to 1.7%.

Inflation is sampled independently each year from a normal distribution with that mean and standard deviation. This allows deflation and high-inflation years instead of holding purchasing power constant. The realized real return for a year is:

```text
real return = (1 + nominal return) / (1 + realized inflation) - 1
```

The denominator is floored at 0.01 to keep the calculation defined. The model does not include correlation between inflation and asset returns. In practice, unexpected inflation tends to hurt nominal bonds more than equities, so this independence assumption is a simplification.

### Stock–bond correlation

The default of 0.30 replaces the earlier 0.10 placeholder. It is a forward-looking compromise, not a constant of nature:

- J.P. Morgan's 2026 LTCMA correlation matrix reports 0.33 between AC World Equity and U.S. Aggregate Bonds.
- Monthly total returns for VT and BND have a correlation of about 0.39 from 2011 to 2026; VT and BNDW have about 0.52 from 2018 to 2026.
- The stock–bond correlation was negative for much of 2000–2020 and turned positive during the 2022 inflation shock. Its sign depends on the inflation regime, so no single value fits every period.

A positive correlation makes a balanced portfolio less diversified: stocks and bonds are more likely to fall together.

Sources:

- [Vanguard Capital Markets Model forecasts](https://corporate.vanguard.com/content/corporatesite/us/en/corp/vemo/vemo-return-forecasts.html), run of September 30, 2026, published October 21, 2026.
- [FTSE Global All Cap Index factsheet](https://research.ftserussell.com/Analytics/FactSheets/Home/DownloadSingleIssue?issueName=ACGRF), September 30, 2026.
- [J.P. Morgan 2026 Long-Term Capital Market Assumptions](https://am.jpmorgan.com/content/dam/jpm-am-aem/global/en/insights/ltcma-2026-us-matrix_usd.pdf), data as of September 30, 2025.
- Yahoo Finance adjusted monthly prices for VT, BND, BNDW, VTI, and VXUS, accessed October 26, 2026.

These are starting assumptions, not promises. A 10-year forecast does not describe every future period. Update them when your circumstances, portfolio, or the published assumptions change.

## Financial model

Each simulation samples annual correlated lognormal gross stock and bond returns, plus an independent normal inflation rate. User inputs are nominal arithmetic mean returns and standard deviations. For a return mean `m` and standard deviation `s`, both expressed as decimals, the underlying normal parameters are:

```text
variance = ln(1 + s² / (1 + m)²)
mu = ln(1 + m) - variance / 2
sigma = sqrt(variance)
```

The correlation input applies to the underlying normal shocks. It is not the exact Pearson correlation of the resulting simple returns. Asset returns remain above −100%.

Inflation is drawn from a normal distribution with the chosen mean and standard deviation. It is independent across years and of stock and bond returns. A year's real growth factor is:

```text
(1 + nominal portfolio growth) × (1 − fee) / (1 + realized inflation)
```

Because this division is nonlinear, real outcomes are not the same as deflating every path by the mean inflation rate.

Stocks decline linearly from the starting weight to the retirement weight over the selected glide period. If the glide period begins before the current age, the current allocation reflects progress already made. A zero-year glide switches allocation at retirement. The remaining allocation is bonds, and the portfolio rebalances annually.

All balances and cash flows are in today's purchasing power, expressed in the display currency. Each annual step:

1. If retired, withdraw spending less eligible retirement income at the beginning of the year. Income starts at the specified age, and only offsets cash flows after retirement. Surplus income is invested.
2. Apply weighted stock and bond gross returns.
3. Deduct the proportional annual fee and deflate by that year's realized inflation.
4. Before retirement, add the annual contribution at year end.

Contributions, spending, and income are constant in real terms. The balance shown at retirement is before the first retirement withdrawal. The plan funds years from retirement age through the year before the end age. Success means meeting every annual withdrawal through this horizon. A funding shortfall permanently marks the path unsuccessful, including if later income restores a positive balance. Wealth cannot be negative. Exact depletion after a fully funded final withdrawal counts as success.

The initial withdrawal rate uses spending less income already available at retirement, divided by the median portfolio at retirement. It is not a safe withdrawal recommendation. Percentiles are calculated independently at each age; a percentile curve is not one simulated lifetime.

Simulations use a deterministic seed of 42. Scenario comparisons use common random shocks to reduce noise when comparing inputs. Work runs in Web Workers to keep the interface responsive.

## Limits

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
