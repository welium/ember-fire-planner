# Historical USD total-return presets and CAGR inputs

## Goal and scope

Add broad global and country equity assumption presets plus Nasdaq-100, and three bond assumption presets to Ember. Prefer long, verifiable index total-return histories over the lifespan of a particular ETF. Change stock and bond return inputs from nominal arithmetic means to nominal geometric annual returns (CAGR).

Confirmed requirements:

- Stock coverage: broad global equities, broad U.S., Hong Kong, Japan, and China equities, plus Nasdaq-100. Exact original index names and all-cap coverage may be replaced to obtain longer reliable histories. The selected primary benchmarks are MSCI ACWI, MSCI USA, MSCI Hong Kong, MSCI Japan, MSCI China, and Nasdaq-100.
- Bond choices: global investment-grade corporate bonds, intermediate-term U.S. Treasuries (7–10 years remaining maturity), and short-term U.S. Treasuries (1–3 years remaining maturity).
- All series represent total return, including reinvested dividends or coupons, expressed in USD without currency hedging.
- Prefer index data. A clearly identified ETF proxy is acceptable for stocks and global corporate bonds if reliable index history is unavailable.
- Treasury choices use diversified maturity-range portfolios. Prefer Bloomberg U.S. Treasury 7–10 Year and 1–3 Year total-return histories; IEF and SHY are shorter ETF fallbacks and comparison sources.
- Selecting a preset applies both CAGR and historical annualized volatility. Correlation, inflation, inflation volatility, fees, and personal inputs remain independently editable.
- This task produces a plan only. Implementation must occur separately.

Keep the existing browser-only application, seeded Monte Carlo engine, annual rebalancing, cash-flow timing, Web Worker interface, explicit Run simulation action, localization, and display-only currency setting. Do not add a backend, runtime market-data calls, historical bootstrap simulation, portfolio backtesting, automatic correlation estimation, or a currency conversion engine.

## Current implementation and relevant files

| File | Relevant behavior and planned work |
| --- | --- |
| `src/simulation.ts` | Numeric `Plan`, forecast-based `defaults`, arithmetic-mean `logParameters`, validation, `simulate`, and exact stress shifts in `analyze`. Change return semantics and defaults, retain numeric Plan. |
| `src/main.tsx` | Assumptions fields, arithmetic-mean hints, methodology dialog, save/load at `ember-plan`, reset, scenarios, and dirty/submitted state. Add preset controls and version-aware loading. |
| `src/simulation.worker.ts` | Delegates to the same simulation functions. Retain its numeric Plan message contract. |
| `src/simulation.test.ts` | Cash flows, reproducibility, validation, analytic lognormal percentiles, and stresses. Replace arithmetic calibration assertions and hard-coded old default return expectations. |
| `src/translations.ts` | English message keys with three translations. Update return terminology, preset names, source labels, and methodology in all supported languages. |
| `src/i18n.test.ts` | Scans literal messages in three source files. Extend coverage for preset message keys; dynamic `t(preset.label)` calls are not covered by the existing scanner. |
| `src/i18n.tsx` | Currency is formatting only. Keep that behavior and add no FX conversion here. |
| `src/styles.css` | Compact field rows and existing native selects. Add only local preset-control styling, including focus and narrow-screen behavior. |
| `README.md` | Replace forecast stock/bond derivations, document historical sources, CAGR calibration, migration, assumptions, and limitations. Retain the independent inflation/correlation basis. |
| `package.json` | Existing `npm test`, `npm run build`, and local dev/preview scripts. No new runtime dependency required. |
| `tsconfig.json`, `vite.config.ts` | Strict TypeScript, ESM, Vite, and Vitest conventions. Use TypeScript and Node built-ins for data preparation. |

There is no existing preset catalog or historical dataset. `Plan` assumes every property is numeric through `Object.values` validation and generic numeric fields; do not add preset IDs or version strings to it. `TODO.md` records prior review work and is not a current implementation checklist for this feature.

## Resolved design decisions

### 1. Benchmark definitions and source policy

Use these benchmark definitions. Source URLs below are starting references, not proof that their complete historical datasets are publicly downloadable.

| Stable ID | Intended benchmark | Permitted substitution |
| --- | --- | --- |
| `global-equity` | MSCI ACWI gross total return, USD; developed and emerging large/mid caps | MSCI ACWI IMI gross USD if all-cap coverage is preferred and its shorter 1994 history is accepted; label the actual benchmark |
| `us-equity` | MSCI USA gross total return, USD; broad U.S. large/mid caps | S&P 500 total return with verified longer provider history; state the actual benchmark |
| `nasdaq100` | Nasdaq-100 Total Return, USD (XNDX) | QQQ adjusted total-return history |
| `hong-kong-equity` | MSCI Hong Kong gross total return, USD | A verified broad Hong Kong total-return series; disclose country classification and benchmark differences from HSI |
| `japan-equity` | MSCI Japan gross total return, USD | TOPIX total return with verified long history and USD conversion; disclose its different coverage |
| `china-equity` | MSCI China gross total return, USD; broad Chinese companies across eligible listings | A verified broad China total-return series; disclose that MSCI China includes offshore listings and partial A-share inclusion, and is not a mainland-only Shanghai index |
| `global-ig-corporate` | Bloomberg Global Aggregate Corporate total return, USD unhedged | A verified global investment-grade corporate fund with the same scope and no USD hedge; aggregate government bonds or U.S.-only corporate bonds are not equivalent |
| `treasury-intermediate` | Bloomberg U.S. Treasury 7–10 Year total return, USD (LT09TRUU) | IEF, explicitly identified as a shorter ETF proxy tracking a different index family |
| `treasury-short` | Bloomberg U.S. Treasury 1–3 Year total return, USD (LT01TRUU) | SHY, explicitly identified as a shorter ETF proxy tracking a different index family |

The Treasury presets hold portfolios within their stated remaining-maturity ranges and roll/rebalance as required by the tracked indexes. Label them “U.S. Treasury — intermediate term (7–10 years)” and “U.S. Treasury — short term (1–3 years)”, with the actual index or ETF source identified in the details. They do not represent a single exact-tenor note or a buy-and-hold-to-maturity forecast. Use the full range labels because maturity classifications vary between providers.

For index data prefer gross reinvestment before investor taxes. If only net total return is obtainable, retain and disclose that exact variant. ETF proxies include their own expenses and tax effects; disclose this in the source record rather than trying to reverse them. The app's fee remains an additional user-selected cost; explain that fund expenses already embedded in proxies must not be added a second time.

Never silently replace a total-return series with a price index, yield, unrelated benchmark, inferred dividend estimate, or fabricated long-run rate. If an eligible series is inaccessible, record the exact access/licensing blocker. The full nine-preset feature is not accepted until all nine have verified data; do not represent a blocked entry as a working preset. Do not introduce a synthetic bond-pricing model to bypass a missing Treasury dataset.

Initial references:

- FTSE Global All Cap factsheet: https://research.ftserussell.com/Analytics/FactSheets/Home/DownloadSingleIssue?issueName=ACGRF
- iShares SHY: https://www.ishares.com/us/products/239452/ishares-1-3-year-treasury-bond-etf
- iShares IEF: https://www.ishares.com/us/products/239456/ishares-7-10-year-treasury-bond-etf
- Bloomberg fixed-income index catalog: https://www.bloomberg.com/professional/products/indices/fixed-income/
- Obtain exact HSI, TOPIX, Shanghai, S&P equity, and Nasdaq series identifiers and methodology references from their providers before calculating values.

### Research figures — retrieved October 27, 2026

The table below preserves the earlier measured ETF/vendor figures as comparison evidence. It is not the final preset roster or the final default values after the longer-history benchmark revision below. The cutoff is **September 30, 2026**, the latest completed month. Values are nominal USD returns with no currency hedge. CAGR uses the first daily observation and final observation; SD uses the sample standard deviation of consecutive month-end simple returns multiplied by `sqrt(12)`. The first partial month is excluded from SD. Values are rounded to two decimals for this table, not for eventual model inputs.

These are research candidates, with the evidence status shown separately. A successfully calculated number does not establish complete distributions, longest available index history, or source redistribution rights. Phase 1 must resolve those conditions before accepting production defaults.

| Preset | Actual series measured | CAGR | Annualized SD | CAGR observation dates | Complete monthly return intervals | Evidence status |
| --- | --- | ---: | ---: | --- | ---: | --- |
| All World All Cap | VT, USD adjusted market close | **8.81%** | **16.58%** | 2008-06-26–2026-09-30 | 219 | ETF proxy; available trading history measured. Confirm historical tracking-index changes and reconcile with Vanguard NAV total return. |
| S&P 500 | S&P 500 Total Return, Yahoo `^SP500TR`, USD | **11.47%** | **14.58%** | 1988-01-04–2026-09-30 | 464 | Actual total-return index; this is the vendor's available history, not a claim that S&P history starts in 1988. Seek longer provider history before final acceptance. |
| Nasdaq-100 | QQQ, USD adjusted market close | **10.88%** | **23.26%** | 1999-03-10–2026-09-30 | 330 | ETF proxy; reconcile with Invesco total return and seek longer XNDX index history. Yahoo XNDX returned no usable historical series. |
| HSI | Tracker Fund of Hong Kong, `2800.HK`, adjusted market close divided by HKD per USD | **1.86%** | **21.39%** | 2008-01-02–2026-09-30 | 224 | **Provisional; not accepted.** Yahoo history starts after the fund's 1999 inception, and dividend events begin only in 2013. Verify pre-2013 dividend adjustments or replace with provider total-return history. |
| TOPIX | Amova Exchange Traded Index Fund TOPIX, `1308.T`, adjusted market close divided by JPY per USD | **5.46%** | **15.21%** | 2008-01-04–2026-09-30 | 224 | **Provisional; not accepted.** Dividend events begin in 2013 although independent records show earlier payments. Obtain complete reinvested NAV/index history. |
| Shanghai Composite | Fullgoal SSE Composite Index ETF, `510210`, compounded Eastmoney NAV daily percentage returns divided by CNY per USD | **4.67%** | **20.34%** | 2011-01-30–2026-09-30 | 188 | ETF proxy; corporate-action handling checked at two split dates and two dividend dates. Reconcile compounded NAV performance with Fullgoal and verify rounded daily-return precision. |
| Global investment-grade corporate | iShares Global Corp Bond UCITS ETF USD (Dist), `CORP.L`, adjusted market close | **1.79%** | **6.44%** | 2012-09-24–2026-09-30 | 168 | Eligible unhedged ETF proxy, ISIN IE00B7J7TB45, benchmark LGCPTRUU. Independent issuer NAV CAGR is **1.80%** over this inception period; the small difference is consistent with market-close versus NAV measurement. |
| U.S. Treasury — intermediate term (7–10 years) | IEF, USD adjusted market close | **3.36%** | **6.66%** | 2002-07-30–2026-09-30 | 290 | Selected ETF proxy; 291 distribution events in retrieved history. Reconcile against issuer NAV total return and obtain the first trading days missing from this vendor history. |
| U.S. Treasury — short term (1–3 years) | SHY, USD adjusted market close | **1.95%** | **1.49%** | 2002-07-30–2026-09-30 | 290 | Selected ETF proxy; 290 distribution events in retrieved history. Reconcile against issuer NAV total return and obtain the first trading days missing from this vendor history. |

The unusually low HSI figure and the USD results for Asian assets must not be replaced with familiar local-currency figures. Start dates, currency movements, and missing dividend adjustments can all materially change the measured CAGR. HSI and TOPIX remain explicitly unverified total-return candidates until their distribution histories are reconciled.

#### Sources and checks

1. **Daily price and total-return inputs:** Yahoo Finance chart endpoint, with `period1=0`, `period2=1790985600`, `interval=1d`, and `events=div%2Csplits`. Example: https://query1.finance.yahoo.com/v8/finance/chart/VT?period1=0&period2=1790985600&interval=1d&events=div%2Csplits . Substitute the URL-encoded series identifier from the table. Use `indicators.adjclose[0].adjclose`; convert timestamps to the series exchange's local calendar date and exclude dates after September 30. Do not treat the monthly endpoint's period-start timestamps as actual observation dates.
2. **FX inputs:** the same daily endpoint for `HKD=X`, `JPY=X`, and `CNY=X`. These quote local currency per USD, so divide local adjusted levels by the FX value. Select the latest positive FX observation on or before each actual asset month-end date, within seven calendar days. All month-end matches and first-date matches used above met that test. The FX source has interior daily gaps in 2008; no missing daily FX values were interpolated, and only required month-end/endpoints were converted.
3. **Shanghai NAV input:** https://fund.eastmoney.com/pingzhongdata/510210.js , `Data_netWorthTrend`. Start a wealth index at 1 at the first observation and compound `1 + equityReturn / 100` from the second observation. These daily percentage returns handle NAV discontinuities: March 11, 2011 reports −0.7797% despite a share conversion; January 22, 2021 reports −0.46% despite a five-for-one split. June 20 and December 20, 2023 report −0.42% and −0.90%, respectively, after cash distributions. [Distribution and share-conversion record](https://fundf10.eastmoney.com/fhsp_510210.html) confirms the corporate-action dates and 2023 payments. The input has rounded percentage returns, so obtain more precise reinvested NAV history for the production snapshot if available.
4. **Corporate-bond independent check:** [iShares CORP product page](https://www.ishares.com/ch/individual/en/products/251813/ishares-global-corporate-bond-ucits-etf) reports, as of September 30, 2026, inception NAV CAGR **1.80%**, benchmark CAGR **1.98%** over the fund's inception period, and fund **three-year SD 6.37%**. That 6.37% is not a full-period SD and must not replace the calculated **6.44%** without changing the period label. The fund launched September 24, 2012, is unhedged USD distributing, and has a 0.20% current TER. Its benchmark inception-period figure must not be described as the Bloomberg index's full-history CAGR. [Bloomberg methodology](https://assets.bbhub.io/professional/sites/27/03435_20240409.pdf) identifies LGCPTRUU and states index history was backfilled to September 2000, with launch in January 2001; obtain that longer history when accessible.
5. **HSI validation source:** [TraHK fund information](https://www.trahk.com.hk/en-hk/trahk-fund/fund-information/) identifies inception November 11, 1999 and distinguishes reinvested total return from price-only and adjusted-NAV performance. Use its reinvested series when reconciling Yahoo data. [Hang Seng index details](https://www.hsi.com.hk/eng/indexes/all-indexes/hsi) separately identifies gross and net total-return variants.
6. **TOPIX data rejection:** do not use Yahoo `1306.T` as downloaded. Its adjusted series contains a roughly 90% discontinuity on January 5, 2015 and an inconsistent split transition in March/April 2026. [JPX split notice](https://www.jpx.co.jp/english/derivatives/products/individual/securities-options/vk0khi000000xf9o-att/NEXT_FUNDS_TOPIX_Exchange_Traded_Fund_and_other_4_underlying_securities_E.pdf) confirms a real 2026 share split, but the downloaded adjustment is inconsistent. `1308.T` avoids those large discontinuities; its early dividends still require reconciliation. [Independent 1308 dividend history](https://www.investing.com/etfs/nikko-topix-listed-dividends) lists 2010–2012 payments absent from Yahoo dividend events.
7. **Shanghai data rejection:** Yahoo `510210.SS` adjusted history contains repeated apparent fivefold jumps/reversals. Do not calculate preset statistics from that series. The actual Shanghai Composite Total Return index is `000888`; [Yahoo quote](https://finance.yahoo.com/quote/000888.SS/) confirms identity but returned no usable historical observations at the chosen cutoff. The Fullgoal NAV proxy above is a separate, identified source.
8. **Treasury sources:** [IEF issuer page](https://www.ishares.com/us/products/239456/ishares-7-10-year-treasury-bond-etf) confirms remaining maturities of seven to ten years; [issuer factsheet](https://www.ishares.com/us/literature/fact-sheet/ief-ishares-7-10-year-treasury-bond-etf-fund-fact-sheet-en-us.pdf) describes intermediate-term government debt. [SHY issuer page](https://www.ishares.com/us/products/239452/ishares-1-3-year-treasury-bond-etf) identifies the one-to-three-year Treasury portfolio. Both funds launched July 22, 2002, while the retrieved Yahoo daily series starts July 30; record this eight-calendar-day source limitation and obtain earlier observations for the production snapshot if available. Use the same Yahoo daily endpoint and adjusted-close methodology as the other USD ETF proxies. The previous S&P exact-tenor data-access blocker no longer applies to these replacement presets. No Treasury yield is used as a total-return input.
9. **Rejected comparison figures:** Curvo's default S&P/Nasdaq pages report EUR results, which do not meet the USD requirement. LazyPortfolioETF's VT history starts in 1970 and therefore includes pre-fund reconstructed history; do not label those statistics as actual VT inception history.

#### Calculation audit

The computed unrounded CAGR/SD pairs, in percentage units, are: VT `(8.8079266119, 16.5849680656)`; S&P 500 TR `(11.4661350937, 14.5831914484)`; QQQ `(10.8768787008, 23.2618139221)`; HSI proxy `(1.8572027126, 21.3871412804)`; TOPIX proxy `(5.4556305946, 15.2144039933)`; Shanghai NAV proxy `(4.6724212111, 20.3377942993)`; CORP `(1.7856374089, 6.4386296932)`; IEF `(3.3642801487, 6.6576538473)`; SHY `(1.9535092980, 1.4948406816)`. Their extra decimals support reproduction; they do not imply that data quality is equally precise.

Downloaded response SHA-256 values for the calculation runs:

| Input | SHA-256 |
| --- | --- |
| VT daily chart | `cf7a5216ae3bd4fe96370660322bd1104c749452c5fc2dff83ace92d324b3306` |
| S&P 500 TR daily chart | `9c9826acce364f638c925ad1482d253790762587280a1bb320f1436550618c02` |
| QQQ daily chart | `7918a85ed4e99bb39c1c1d1ef89ca70b7920f2ebe64abb1e34c875876a0647ae` |
| 2800.HK daily chart | `36c62db9a9e104d3360e545ebb83cc614c331e8d5146a3df71654e1f31ab6fdd` |
| HKD FX daily chart | `32603b73b39dca1083b4e3862677bbc35e9f910259be8a8b2f95f4fca62b275a` |
| 1308.T daily chart | `5cba4d640731f78eb6985e8b72ddbb566dd759de404a7c435e21b04ffe7fb824` |
| JPY FX daily chart | `f204c96912ddecd377fc678ec7749652b60b420e2590647d2ae16a052ed90762` |
| CORP.L daily chart | `04776b3a9fbaf1fe1cbfe33a62c3234f804ac09f2b8a0c481c02126d2d283449` |
| Eastmoney 510210 NAV response | `73f77213b8ad38d01499b3189c96abaae389dc2666c829505cd68f45afacaa8e` |
| CNY FX daily chart | `578d4065f7eada58f0ba27faea17c20e6a357cc4ac2e386b3665d8f0d62040fa` |
| IEF daily chart | `0f4e66003aa947dbe18f04f54c542ec122f5bcc913b382843e7d803908a466a2` |
| SHY daily chart | `23c5dfa5c2262a229ef6b76af18344799c0b083fab21a978fad6d7158aaeceeb` |

Hashes identify responses used in this research; these responses contain live metadata and historical adjustments and can change on later retrieval. Raw downloads were processed in memory and were not added outside `plans`. Phase 1 must preserve permitted normalized inputs and an executable calculation tool, rather than relying on hashes alone.

### Longer-history source selection for long retirement horizons

The latest requirement permits replacement of the original named equity indexes with broad country indexes, while retaining Nasdaq-100 and corporate/short-Treasury/intermediate-Treasury bond categories. Select the following primary sources. History dates below are provider-documented availability or inception dates, not confirmation that complete downloadable observations have already been acquired.

| Coverage | Primary source and history target | Approximate history to September 2026 | Selection rationale and limits |
| --- | --- | ---: | --- |
| Global equities | MSCI ACWI **gross USD**, from **1987-12-31** | 39 years | Broad developed/emerging large/mid caps. Prefer this longer history for the default. Small caps are omitted; do not call it all-cap. ACWI IMI gross USD from **1994-05-31** is an eligible 32-year all-cap alternative, not an extension to splice onto ACWI. |
| United States equities | MSCI USA **gross USD**, from **1969-12-31** | 57 years | Broad U.S. large/mid caps, approximately 85% free-float market-cap coverage. Replaces the S&P-only requirement. S&P predecessor history from 1926 can be a separate validation source. |
| Hong Kong equities | MSCI Hong Kong **gross USD**, from **1969-12-31** | 57 years | Broad Hong Kong country universe. Its country assignment differs from HSI, which also contains many mainland Chinese companies listed in Hong Kong. Disclose this change instead of calling it historical HSI. |
| Japan equities | MSCI Japan **gross USD**, from **1969-12-31** | 57 years | Broad Japan large/mid caps. Avoids incomplete early ETF dividend adjustments. |
| China equities | MSCI China **gross USD**, from **1992-12-31** | 34 years | Broad Chinese equity universe, including eligible offshore listings; onshore A shares were added later at partial inclusion weights. Historical coverage evolves. This replaces the mainland-only Shanghai requirement. |
| Nasdaq-100 | Official XNDX gross total return via Nasdaq/FRED, from **1999-03-04** | 28 years | Retain the explicitly requested Nasdaq exposure. Its parent price index begins in 1985, but the official versions document and the FRED download checked here start XNDX in 1999. Do not assume an authenticated 1985 total-return history exists. Accept shorter history unless a documented reconstruction is obtained. |
| Global investment-grade corporate bonds | Bloomberg Global Aggregate Corporate **unhedged USD**, LGCPTRUU, from **September 2000** | 26 years | Improves on CORP's 2012 start. Preserve global corporate scope; do not silently substitute U.S.-only credit to obtain more years. Accept the shorter history if no longer comparable global IG corporate series can be verified. |
| Short U.S. Treasuries | Bloomberg U.S. Treasury **1–3 Year USD total return**, LT01TRUU; launched **1992-02-01** | About 35 years | Same maturity bucket as the intended short exposure. Verify the first export observation; launch date alone is not the exact calculation start date. SHY remains a 2002-onward comparison/fallback. |
| Intermediate U.S. Treasuries | Bloomberg U.S. Treasury **7–10 Year USD total return**, LT09TRUU, history from **1992-01-01** | About 35 years | Provider states May 1997 launch with history backfilled to January 1992. IEF remains a 2002-onward comparison/fallback. |

Source evidence:

- [MSCI Earliest Index History Dates, Q2 2009](https://www.msci.com/documents/1296102/1359536/MSCI+Earliest+Index+History+Dates+-+Q2+2009.pdf/42ceffe5-1863-4765-ade0-87a8bd632146): downloaded and text-inspected; gross histories for USA, Hong Kong, Japan, and World start December 31, 1969; ACWI December 31, 1987; China December 31, 1992. Gross and net start dates differ for China and ACWI; use the specified gross variant consistently. This document establishes history dates, not current download access or publication permission.
- [MSCI ACWI IMI USD factsheet](https://www.msci.com/www/index-factsheets/msci-acwi-imi/09234846): reports history since May 31, 1994 and launch June 5, 2007. Prelaunch history is backtested. Published SD columns are only 3/5/10 years; obtain the monthly series for a matching full-period SD.
- [MSCI Japan](https://www.msci.com/indexes/index/939200/msci-japan-index), [MSCI China](https://www.msci.com/indexes/index/302400/msci-china-index), and [MSCI Hong Kong USD factsheet](https://www.msci.com/www/index-factsheets/msci-hong-kong-index/06061617) identify coverage. Acquire monthly gross USD levels through a permitted provider export before replacing candidate statistics.
- [Bloomberg Treasury 1–3 Year methodology](https://assets.bwbx.io/documents/users/iqjWHBFdfxIU/r1MiF6QkuOm4/v0): downloaded and text-inspected; states February 1, 1992 launch. [Bloomberg Treasury 7–10 Year methodology](https://assets.bbhub.io/professional/sites/27/US-Treasury-7-10-Year-Index.pdf): downloaded and text-inspected; states January 1, 1992 backfilled history. The broad Treasury parent index's 1973 history must not be assigned to these maturity buckets without verifying their own histories.
- [Nasdaq index versions](https://indexes.nasdaqomx.com/docs/NDX%20Versions.pdf): downloaded and text-inspected; distinguishes NDX price-return inception January 31, 1985 from XNDX gross-total-return inception March 4, 1999. The [FRED CSV](https://fred.stlouisfed.org/graph/fredgraph.csv?id=NASDAQXNDX) was retrieved and its first observation is March 4, 1999. An earlier search summary suggested 1985 total return; the provider document and downloaded observations do not establish that longer series.
- TOPIX remains a possible alternative, but its base date is not evidence of downloadable full total-return history: [JPX chart notes](https://www.jpx.co.jp/english/quick-disclaimer/index.html) list a 1989 total-return base date while the public chart's retrospect start is September 26, 2000. Likewise Shanghai's price-index history from 1990 is not its total-return history: [SSE's launch announcement](http://english.sse.com.cn/markets/indices/indexnews/c/5221435.shtml) specifies a July 21, 2020 base for the SSE Composite Total Return Index.

Longer research sources for independent checks, rather than silent extensions to the selected benchmarks:

- [Robert Shiller's data](https://shillerdata.com/) provides U.S. prices/dividends from 1871. Early observations are reconstructed predecessor-market data and prices are monthly averages, so they are not the modern S&P 500 month-end series. A dividend-based total-return reconstruction must state its method; do not mix its SD with month-end SD without checking the effect of averaging.
- [CRSP U.S. Treasury Database](https://indexes.morningstar.com/research-data-products/crsp-us-treasury-database) has month-end security data from 1925 and daily data from 1961. Individual fixed-maturity portfolios have later starts and gaps. These are useful licensed long-history checks, but do not assume a continuous SHY/IEF-equivalent portfolio since 1925.
- [Jordà–Schularick–Taylor Macrohistory Database](https://www.macrohistory.net/database/) offers annual equity and government-bond total returns for advanced economies, with histories reaching 1870 depending on country/series. These are nominal local-currency reconstructed histories; USD conversion requires FX, annual SD is calculated directly, and the dataset uses CC BY-NC-SA terms. It is a regime/long-run research check, not an automatic product-data replacement.

Thirty-plus-year planning does not mathematically require more than thirty years of calibration data: this engine samples a stationary annual distribution, rather than replaying a historical period. However, more independent market regimes improve the evidence for selecting its parameters. Even 60 years provide only two non-overlapping 30-year periods, and overlapping rolling periods are not independent. Increasing simulation count cannot remove uncertainty in the estimated CAGR, SD, correlation, or future regime.

Implementation decisions: prefer verified 30+ year index histories when available; permit the documented shorter Nasdaq/global-corporate exceptions. Keep dates and actual benchmark names visible. Do not splice unrelated indexes merely to meet a year threshold. As an offline data-acceptance check, compare full-history parameters with recent 20- and 30-year windows where enough observations exist, and record the differences in the audit. These checks do not add a new UI mode, historical simulation engine, or automatic pessimistic return adjustment. Existing return/inflation stresses remain part of the model. The prior ETF figures are comparison evidence until the longer index series have been acquired and recalculated.

### 2. History and statistical conventions

- “All time” means the earliest verified observation through the latest completed month available when the snapshot is prepared, for each chosen series. Histories may have different lengths and end dates. Use the longest obtainable valid history; do not truncate every preset to a common overlap or use a fixed 10-year window.
- Retain provider backfilled history when it is part of the verified series, and mark prelaunch/backtested periods. An ETF proxy starts at its own valid inception history; do not splice it onto another benchmark.
- Use monthly total-return levels. Include the initial valid inception observation when available, followed by month-end observations. CAGR uses the actual endpoint dates. For volatility, use only complete consecutive monthly intervals; exclude a partial initial interval and reject unexplained interior gaps. Do not forward-fill missing return observations.
- Prefer provider-supplied USD unhedged levels. Otherwise convert local total-return levels using contemporaneous FX: `USD_level = local_TR_level × USD_per_local_currency`. For month-end holidays use the latest FX observation on or before the index date within seven calendar days; reject missing/stale conversions. Never use future quotes or hedged series. Record FX source and quote direction.
- CAGR: `g = exp(ln(last_level / first_level) / years) - 1`, with `years = elapsed_calendar_days / 365.2425`. This equals the geometric mean for equally spaced annual holding periods; CAGR is the clearest label for arbitrary endpoints.
- Monthly simple total returns: `r[t] = level[t] / level[t-1] - 1`. Preset volatility is sample standard deviation (`n - 1`) times `sqrt(12)`, expressed as an annual percentage. Document this standard annualization convention as an estimate of annual simple-return volatility, not log-return volatility.
- Preserve calculation precision in the catalog; round only for display. Require positive levels, ordered unique dates, at least 12 complete monthly return intervals, finite statistics, and values accepted by the existing Plan limits. Do not clamp source statistics to fit those limits.
- Check source access and redistribution terms. Store redistributable normalized data with the project when permitted. Otherwise retain a source manifest, exact input checksum, acquisition instructions, and a calculation audit without committing restricted raw data.

### 3. CAGR calibration in the Monte Carlo model

Keep `stockReturn` and `bondReturn` as percentage fields but redefine them as geometric annual returns. Keep SD as annual simple-return SD and preserve the existing underlying-normal shock correlation semantics.

For decimal CAGR `g`, decimal simple-return SD `s`, and `A = 1 + g`:

```text
mu = ln(A)
x = (1 + sqrt(1 + 4 × (s / A)^2)) / 2
sigma² = ln(x)
sigma = sqrt(sigma²)
gross_return = exp(mu + sigma × z)
```

This follows from `Var(gross_return) = A² × x × (x - 1)`, where `x = exp(sigma²)`. Use `log1p` where useful for numerical precision. Do not retain the old `-variance/2` correction after setting a CAGR input, and do not substitute `sigma = s`, which would change the meaning of SD.

The entered CAGR sets expected log growth and the single-asset long-run geometric rate. It does not fix every simulated path's CAGR or equal a weighted average portfolio CAGR. Inflation remains a normal rate with an arithmetic mean. Return stresses subtract exactly 1 or 2 percentage points from the entered CAGR and retain the entered SD.

### 4. Defaults, selection, and persistence

- Fresh and reset plans use `global-equity` and `global-ig-corporate` historical values for return and SD. Keep all other default fields unchanged.
- Add one labeled native select above each asset's return/SD row, containing its presets plus Custom. Show a concise detail with USD unhedged total return, observed dates, source link, and proxy identity when relevant. Keep processing mechanics in documentation.
- Applying a preset replaces only that asset's return and SD, marks the plan unsaved/dirty, and waits for Run simulation. Editing either value selects Custom without changing the other value. Custom itself preserves entered numbers.
- Keep selection IDs in UI state separate from Plan. Save them as metadata so reloading a manually edited value equal to a preset does not incorrectly claim preset provenance. Reapplying a selected preset restores both catalog values.
- Add `src/plan-storage.ts` as a small pure serialization/parser module. Retain the `ember-plan` key and write a version-2 envelope: `{ version: 2, plan, stockPresetId, bondPresetId }`.
- Treat existing unversioned saved objects as version 1, whose returns are arithmetic means. Merge missing legacy fields with a frozen copy of the existing defaults, not the new historical defaults. Convert each arithmetic mean `m` and SD `s` exactly: `v = ln(1 + s²/(1+m)²)`; `g = exp(ln(1+m) - v/2) - 1`. Store percentages after conversion. This preserves the legacy lognormal distribution before validation and the existing glide-cap migration.
- Legacy saves become Custom. Do not write storage during load; the next explicit Save writes version 2. Version-2 saves are never converted again. Validate stored IDs against asset type and saved numeric values; stale or unknown preset metadata becomes Custom while valid numbers remain usable.
- If a converted legacy return falls outside existing supported limits, follow the existing invalid-plan fallback to defaults; do not silently clamp it. Malformed data and unknown future versions also fall back to defaults. Storage-disabled behavior remains available.
- Reset restores the two default selection IDs. Scenario alternatives preserve current selection metadata because they only change retirement timing/spending; numeric Plan snapshots still drive staleness and calculations.

## Implementation phases

### Phase 1 — Verify sources and produce the historical snapshot

Objective: obtain auditable values before changing user-visible defaults.

Work:

1. Resolve exact total-return series, access method, actual full available periods, licensing, FX inputs, and proxy status for all nine benchmarks. Acquire the longer primary index histories in the source-selection section below before finalizing any ETF fallback. Recalculate CAGR and SD over the same full period for each selected series.
2. Add a source manifest and concise methodology/audit record under `data/assumptions/`. Record series IDs, URLs, retrieval date, dates, currency, gross/net status, reinvestment basis, backfill status, sample counts, checksums, and any embedded fund fees.
3. Add a small offline `scripts/build-assumption-presets.ts` tool using Node built-ins, runnable with Node 22.12+ as `node --experimental-strip-types scripts/build-assumption-presets.ts`. Process normalized local inputs without runtime credentials or downloading data in the browser. Keep this script within Node's supported erasable TypeScript syntax.
4. Generate a checked-in typed catalog `src/assumption-presets.ts` with stable IDs, asset types, message keys, CAGR, SD, dates, USD basis, source links, and proxy metadata. Import no simulation defaults into the catalog, to avoid circular imports.
5. Add focused data-calculation tests with small synthetic inputs and catalog integrity checks. Separate pure calculations if necessary; do not create a general market-data adapter framework.

Dependencies: none. Source acquisition may require licensed exports; stop the affected data work with a specific blocker if these cannot be obtained. Model/persistence work can be reviewed independently, but final feature delivery depends on all nine datasets.

Acceptance:

- Nine eligible sources and calculated records; no missing-history substitutions disguised as full history.
- Repeated processing of identical inputs yields identical numeric output.
- A known doubling series gives the expected CAGR; FX appreciation/depreciation changes USD returns correctly; sample SD and month handling match independent hand calculations.
- Invalid levels, gaps, duplicate dates, stale FX, insufficient observations, and unsupported statistics fail clearly.
- At least endpoint returns and selected sample periods reconcile with provider reports or independent calculations using documented tolerances.

### Phase 2 — Change the model and migrate stored plans

Objective: introduce CAGR semantics without silently reinterpreting existing saves.

Work:

1. Implement the exact CAGR/SD calibration in `src/simulation.ts`. Source stock/bond defaults from the catalog when Phase 1 is ready; preserve the numeric Plan interface.
2. Add the version-aware storage helpers and connect load/save in `src/main.tsx`, preserving glide migration, validation, and disabled-storage handling.
3. Update simulation tests: zero volatility and zero return, positive/negative CAGR, analytical one-year percentiles, SD reconstruction, deterministic seeds, and stock-only/bond-only behavior.
4. Prove legacy conversion preserves `mu` and `sigma` for representative old means and volatilities. Test missing legacy fields against frozen old defaults, no double conversion, malformed/future versions, metadata mismatch, and glide migration.
5. Update sensitivity assertions to derive return shifts from input values rather than hard-coding the replaced forecast defaults. Confirm baseline and variants still use common shocks. Worker messages remain unchanged.

Dependencies: Phase 1 catalog for final defaults. Calibration and migration tests can be developed before final source values arrive.

Acceptance:

- Exact analytical distribution relationships hold within floating-point tolerance; sampled quantiles meet explicit sampling tolerances.
- Existing deterministic cash-flow, fee, inflation, survival, and glide tests continue to pass.
- Valid legacy plans retain their modeled distributions; new saves use CAGR once and only once.
- Return stress shifts apply to CAGR and preserve SD, with existing out-of-range behavior.

### Phase 3 — Add preset controls and localized explanations

Objective: make all presets selectable without changing the existing run workflow.

Work:

1. Add the two native selects, Custom behavior, detail lines, reset behavior, and persisted selection metadata in `src/main.tsx`.
2. Replace arithmetic-return hints and methodology text with CAGR language. Explain USD basis and historical dates clearly; keep technical calibration formulas in README.
3. Add necessary styles in `src/styles.css`, using existing field patterns rather than redesigning the Assumptions tab.
4. Update `src/translations.ts` for English, Traditional Chinese, Simplified Chinese, and Japanese. Add explicit test coverage for catalog label keys and matching placeholders in `src/i18n.test.ts`.
5. Verify fresh load, every preset, manual edits, save/reload, reset, legacy load, scenario application, run/stress results, and changing display currency without changing returns.

Dependencies: Phases 1 and 2.

Acceptance:

- Six stock and three bond choices apply precisely the corresponding return and SD; unrelated inputs remain intact.
- Manual edits reliably show Custom. Reload does not assert provenance from coincidental numeric equality.
- Edits are unsaved and dirty until the existing actions are used. Results retain submitted-input labels during edits/runs.
- Selects are keyboard accessible and labeled; long names and source details fit desktop and 390px layouts in every supported language.
- Source links identify actual proxies and observed periods. Treasury entries show their selected 1–3-year or 7–10-year range and actual index/ETF source.

### Phase 4 — Document and verify the complete feature

Objective: deliver a reproducible implementation with consistent user and developer documentation.

Work:

1. Rewrite README stock/bond assumptions, source tables, financial model equations, stress terminology, saving behavior, and limitations. Preserve the documented forward-looking inflation/correlation assumptions, clearly distinguished from historical asset presets.
2. Document offline snapshot reproduction, each period and proxy, FX direction, gross/net treatment, monthly SD annualization, fees, prelaunch history, and old-save conversion. Update the code map for new files.
3. Run `npm test` and `npm run build`. Use the existing dev/preview workflow for a focused browser verification of Phase 3. Check Web Worker and permitted small-plan synchronous paths use the same CAGR engine.
4. Review the final changed files for obsolete arithmetic-mean claims about stock/bond inputs. Retain arithmetic terminology where it correctly describes inflation or legacy migration. Do not update unrelated completed items in TODO.md.

Dependencies: Phases 1–3.

Acceptance:

- All tests and the TypeScript/Vite build pass.
- All nine sources and values are auditable; no incomplete data gate remains.
- Documentation and interface agree on CAGR, SD, USD basis, fees, history lengths, and proxy identity.
- No new runtime dependency, backend, external browser data request, or deployment is introduced.

## Verification scope for this planning task

Inspected source, tests, README, prior review notes, package scripts, TypeScript/Vite configuration, worker behavior, localization, storage, and relevant styles. Follow-up research on October 27, 2026 calculated nine candidate CAGR/SD pairs from downloaded historical data and added provider references, date ranges, calculation conventions, response hashes, and source-quality findings above. Corporate-bond inception CAGR was cross-checked against the issuer. HSI/TOPIX dividend completeness, full provider histories (including the initial IEF/SHY trading days), source redistribution terms, and final issuer reconciliation remain unresolved Phase 1 requirements. Subsequent source research selected longer MSCI country/global and Bloomberg Treasury index histories as primary acquisition targets. Earlier ETF figures remain comparison evidence; replacement full-history CAGR/SD values are not yet calculated. No application tests or build were run because this task changes only this plan.

## Implementation status — October 27, 2026

Implemented numeric CAGR calibration, nine assumption choices, source/date details, Custom behavior, version-2 saves, exact legacy arithmetic-return migration, localization, and reset selection metadata. Added the frozen source catalog, offline monthly-statistics tool, calibration/storage/catalog tests, and updated README.

Actual data differs from the preferred longer-history acquisition targets: the MSCI public website endpoint `/indexes/api/index/performance` returns monthly gross USD history from December 31, 1998 for all five selected broad indexes. The catalog uses these actual observations through September 30, 2026, with exact input URLs, sample sizes, and response checksums. CAGR/SD pairs are ACWI 7.6914176393/15.4319421733, USA 8.6583252634/15.2355391732, Hong Kong 6.8646121700/21.3089512838, Japan 5.4328381667/16.2035604346, and China 5.8427221892/28.0468351988. Earlier HSI/TOPIX/Shanghai ETF figures are not shipped as presets. Nasdaq uses QQQ and bonds use CORP/SHY/IEF with the previously recorded periods and calculations.

The longer 1969/1987/1992 MSCI and Bloomberg Treasury/corporate exports were not acquired. Those remain data improvements and the original full-history acceptance gate is not satisfied. No unavailable dates or invented full-history statistics are presented. Public access does not establish raw-data redistribution permission; raw provider observations were not committed.

Verification: `npm test` passes 29 tests across three files; `npm run build` passes TypeScript and Vite. Chromium browser checks passed preset selection, version-2 save/reload, switching manual edits to Custom, and no horizontal overflow at 390px. Main Web Worker simulation rendered results. No deployment or independent review was performed.
