# Working in Ember

## Commands and verification

- Use Node.js 22.12+ and `npm ci` (the lockfile is npm).
- `npm test` runs Vitest once. Focus a file with `npm test -- src/simulation.test.ts`; add `-t "test name"` to select a test.
- `npm run build` runs TypeScript checks before Vite bundling. There are no separate lint, formatter, or typecheck scripts.
- `npm run preview` serves existing `dist/`; it does not rebuild. Run `npm run build` first when verifying current source. For live source, use `npm run dev -- --host 127.0.0.1` (the default dev and preview scripts expose all interfaces).
- Unit tests cover simulation, storage, and translations, not rendered interactions. For UI changes, check the affected workflow at desktop and 320px, including a Traditional Chinese view; prior regressions included overflow, hidden update actions, and offscreen drawer controls receiving focus.

## Branches, commits, and releases

- Start each feature or fix on a separate feature branch based on the current `main`. Do not implement features or fixes directly on `main`.
- Keep commits focused and use clear messages that describe the change.
- Prepare each release on its feature branch before merging. Every push that advances remote `main` must include a package version increase relative to the previous remote `main`, including pushes with only documentation or maintenance changes. Individual commits and feature-branch pushes do not each require a version increase.
- Use semantic versioning: patch for fixes and maintenance, minor for backward-compatible features, and major for breaking changes. Keep the version in `package.json` and the root package versions in `package-lock.json` consistent.
- Whenever the package version increases, update all direct dependencies and devDependencies to their latest stable releases, preferring an actively supported LTS release when available. Otherwise use the latest stable release; do not select nightly or prerelease versions. Review major-version changes, make required compatibility changes, and regenerate `package-lock.json`.
- Verify the release with `npm ci`, `npm test`, and `npm run build`, plus the UI checks above when applicable. Resolve dependency compatibility and verification failures before merging.
- Merge feature branches into `main` with `--no-ff` so that each merge creates a merge commit, even when a fast-forward is possible. Do not use fast-forward, squash, or rebase merges into `main`.
- Before pushing `main`, confirm that the version is greater than the current remote `main` version and that the dependency updates and checks cover the final merge result. If remote `main` advances first, update the branch and repeat these checks.
- See [README.md](README.md#commit-and-release-workflow) for the maintainer workflow.

## State and model constraints

- `index.html` loads `src/bootstrap.tsx`, which mounts `src/main.tsx` under React StrictMode. The planner, dialogs, charts, saving, and export share this component; navigation uses local state and scrolling, not routes.
- `src/simulation.worker.ts` dispatches to `analyze` for the main projection (baseline plus assumption stresses), or `simulate` for plan alternatives. UI runs use seed 42 so comparisons share random shocks.
- Preserve `plan` (live edits), `submitted` (active run), and `calculatedPlan` (last successful result snapshot) separately. Result labels, charts, and export must stay paired with the calculated snapshot during edits, runs, and failures. The glide chart intentionally previews live inputs.
- `Plan` contains numeric annual values in today's purchasing power. Monthly entry is a UI conversion; currency selection changes formatting and denomination without conversion. Do not apply either conversion again inside the simulation.
- Return inputs are nominal CAGR and simple-return SD; correlation applies to underlying normal shocks. See the README financial model before changing calibration or cash-flow timing. A funding shortfall remains a failed path even if wealth later recovers.
- `src/plan-storage.ts` owns the version-2 `ember-plan` envelope and legacy arithmetic-return migration. Loading does not write storage. Preserve numeric inputs when preset IDs no longer match.

## Translations and assumptions

- `t()` keys are English messages; `src/translations.ts` values are ordered `[Traditional Chinese, Simplified Chinese, Japanese]`. Preserve identical named placeholders in every translation.
- `src/i18n.test.ts` scans literal messages only in `main.tsx`, `simulation.ts`, and `simulation.worker.ts`, plus preset labels. If UI code moves to another file, extend the scan; dynamic `t(variable)` keys need explicit coverage.
- Runtime presets come from `data/assumptions/snapshot.json`, rounded to two decimals by `src/assumption-presets.ts`. No market data is fetched in the browser.
- The offline helper `node --experimental-strip-types scripts/build-assumption-presets.ts path/to/monthly-levels.json` prints statistics and a checksum; it neither downloads data nor rewrites the catalog. Input is consecutive monthly `{date, value}` observations. Keep source provenance when updating the snapshot; see README limitations before extending histories.

## Deployment and source of truth

- Cloudflare Workers Assets serves `dist/` with no backend or Worker script. `npm run preview:cf` rebuilds and serves locally; `npm run deploy` rebuilds and publishes. No SPA fallback is configured; unknown paths should remain 404s.
- `public/_headers` is copied into the build. The CSP permits bundled workers, same-origin assets, and inline styles, but no inline scripts or external fonts. Hashed `/assets/*` files have immutable caching.
- The small version label below the footer is injected by `vite.config.ts`: package version plus seven-character revision (`CF_PAGES_COMMIT_SHA`, then `GITHUB_SHA`, then Git HEAD). Hover shows the build's UTC timestamp. Rebuild after committing to verify the revision intended for deployment.
- `README.md` contains model and data provenance, but some UI instructions predate the current editor. `TODO.md` and the original findings in `VISUAL_UX_REVIEW.md` are historical; verify active behavior in source before treating an old finding as an open defect.
