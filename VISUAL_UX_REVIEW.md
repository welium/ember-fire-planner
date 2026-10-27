# Ember visual and UX review

Date: 2026-10-27

Implementation status: **IMPLEMENTED — Chromium verification passed**

The ten review items below have been implemented on `feature/visual-ux-review`, with one commit per item and a follow-up integration fix. The findings and measurements below describe the original reviewed state, not the current UI.

Current verification:

- `npm run build` passes; `npm test` passes (29 tests across three files).
- All five editor groups fit without document overflow at widths of 1440, 1024, 768, 390, and 320px.
- The rebuilt production app fits at 320px in English and Traditional Chinese.
- Browser checks cover pending-result notices, inline validation recovery and focus, monthly-to-annual financial entry, keyboard tabs, chart age selection, mobile drawer focus and dismissal, comparison ordering, applying and undoing changes, and persistent local save status.
- The projection stays paired with its calculated input snapshot during updates. Sensitivity analysis remains visible while recalculating.
- Investment controls are inside the plan editor. Charts provide readable labels, a selectable age with details, and an expandable values table.
- The mobile assumptions editor has a persistent update action outside the form fields.

The optional later improvement of editing alternatives within comparison is deferred. Comparison currently provides the two reviewed alternatives, automatic calculation, explicit percentage-point changes, and apply/undo.

These checks do not constitute an independent accessibility or cross-browser review. Firefox, Safari, screen-reader output, storage failures, and worker failure states remain unverified.

## Original review

Original verdict: **CHANGES_REQUIRED**

Before implementation, a fresh `npm run build` passed, and Chromium checks against that rebuilt app confirmed the main workflow and responsive defects. The most consequential issue is that users can change their inputs without clearly seeing that the results still describe their previous plan.

The verdict applies to the current `src/` implementation, verified through a fresh production build. It does not depend on the previously generated `dist/` files. The experience needs a clearer planning workflow, stronger reading hierarchy, and more usable responsive layouts.

The sections below preserve the original observations and proposals for reference. See the implementation status above for the current state and verification limits.

## Reviewed scope

The rendered app was reviewed in Chromium at these viewport sizes:

- 1440 × 1000
- 1024 × 768
- 768 × 1024
- 390 × 844
- 320 × 740

The review covered all three input tabs, simulation runs, chart hover, validation, scenario comparison and application, saving, methodology, mobile navigation, and a Traditional Chinese mobile view. The app has a single page with dialogs. The review used the default light appearance.

Firefox, Safari, screen-reader output, download contents, storage failures, and worker/network failure states were not tested. Implementation files were not changed during the review.

Screenshots are temporary review artifacts under `/tmp/opencode/fire-visual-review/`. They may not remain available after environment cleanup. They come from the original review, not the fresh-build verification below.

### Current-source verification

On 2026-10-27, `npm run build` completed successfully. The resulting app was served with Vite preview and checked in Chromium with a fresh browser session.

| Check | Result from the rebuilt app |
| --- | --- |
| 1440 × 1000 layout | Run button starts at y=1194, with a 510px gap after the input fields. |
| 768 × 1024 layout | Run button starts at y=1355, with a 696px gap after the fields. Chart legend font is 6px. |
| 390 × 844 layout | Mobile menu button measures 20 × 20px. Chart legend font is 7px. |
| 320 × 740 layout | Document width is 384px, causing 64px of horizontal overflow. |
| Pending input changes | Changing retirement spending from 48000 to 60000 leaves the headline at 49%. The pending-change note is below the run button. |
| Validation recovery | Submitting current age 60 with retirement age 50 shows an error. Restoring current age to 30 leaves that error visible. |
| Navigation state | Opening and closing Scenarios leaves Scenarios selected while the breadcrumb still says Overview. |

Source inspection also confirms that a run clears the previous result, the glide chart reads live inputs, and export reads the last calculated result. The mobile drawer has no visible close button or backdrop. Its closed state uses a transform without `inert` or `aria-hidden`, so its offscreen controls remain available to keyboard focus. Tabs lack arrow-key handling and tab-to-panel associations. These findings remain active in `src/main.tsx` and `src/styles.css`.

This verification repeated the key defect checks. It did not repeat every interaction or language view from the original review.

## 1. Keep the primary action beside the inputs

Priority: **High**

### Observed problem

On desktop, the input card stretches to the height of the entire results column. At 1440 × 1000, **Run simulation** sits below the viewport, separated from the fields by a large empty area. At tablet width, the separation becomes even larger.

This breaks the natural sequence of editing a number and checking its effect.

### Proposed change

Let the input card size to its content. Put **Update projection** directly beneath the fields, with a persistent action bar for long forms. Move the sensitivity analysis into a section below the main input/results layout.

Evidence:

- [Desktop layout](/tmp/opencode/fire-visual-review/desktop-full.png)
- [Tablet layout](/tmp/opencode/fire-visual-review/tablet.png)

## 2. Make outdated results unmistakable

Priority: **High**

### Observed problem

After retirement spending changed from $48,000 to $60,000, the result still showed 49% success. Only the note **You have changes ready to explore** beneath the run button indicated that the result was outdated.

The glide chart updates immediately, which adds another update behavior for users to understand.

Rerunning a simulation clears the results and removes the sensitivity section, changing the page height.

### Proposed change

Give the entire results area a visible state:

- **Up to date**
- **Inputs changed — update projection**
- **Updating projection…**

When edits are pending, show that notice above the result cards and beside the update action. Explain that export uses the last calculated projection.

If the previous projection remains visible during calculation, keep its result and original input snapshot together, clearly marked as updating. Do not pair old numbers with newly submitted ages or labels. The current implementation clears results at run start to prevent that mismatch; retaining results requires preserving the same guarantee.

## 3. Make the result answer a human question

Priority: **High**

### Observed problem

The headline **49% probability of success** requires users to interpret both “success” and what they should do next. Its green styling and shield imagery give a reassuring presentation regardless of the number.

The initial example inputs produce a personalized-sounding result before the user enters anything.

### Proposed change

Lead with a concrete explanation. For example:

> **Your plan funded retirement in 49% of simulations.**
>
> Retire at 50 · Spend $48,000/year · Plan through age 95
>
> Explore how changing your retirement age or spending affects this result.

Use neutral styling for the estimate. Keep the model qualification visible, and place the technical sampling interval in an expandable explanation.

Label the initial loaded inputs **Example plan** until the user personalizes them.

## 4. Rebuild charts for smaller screens

Priority: **High**

### Observed problem

At mobile and tablet widths, the desktop chart scales down as a whole. Axis labels become extremely small. At 768px, the legend is only 6px.

The glide chart and controls are squeezed side by side on mobile. The projection exposes detailed values through mouse hover and has no keyboard controls for those values.

### Proposed change

- Use a responsive chart layout with fewer ticks and readable label sizes.
- Stack allocation controls above their chart on mobile.
- Add a selectable age control and a visible details panel for median, outcome range, and funding rate.
- Support touch and keyboard interaction.
- Offer an accessible table of values.

Evidence: [Mobile page](/tmp/opencode/fire-visual-review/mobile-full.png)

## 5. Fix navigation’s meaning and current state

Priority: **Medium**

### Observed problem

The sidebar mixes three behaviors: scrolling to a section, switching an input tab, and opening a modal. Closing the scenarios modal leaves **Scenarios** highlighted while the overview is visible. The breadcrumb continues to say **Overview**.

The mobile drawer covers its own menu trigger and has no visible close button or backdrop.

### Proposed change

Use three consistent destinations:

**Plan → Results → Compare**

Keep **Assumptions** and **Investment allocation** inside the plan editor. Use a comparison view with an explicit return action. Synchronize the active navigation and breadcrumb with the displayed view.

Give the mobile drawer a visible close button, a dismissible backdrop, and managed keyboard focus.

Evidence: [Mobile navigation](/tmp/opencode/fire-visual-review/mobile-menu.png)

## 6. Consolidate the plan editor

Priority: **Medium**

### Observed problem

Retirement age and spending appear in both **Your finances** and **Retirement**. Portfolio allocation lives far below the editor. Users must understand the app’s structure before they can understand their plan.

### Proposed change

Organize inputs into clear groups:

| Group | Contents |
| --- | --- |
| Today | Age, invested assets, contributions |
| Retirement | Retirement age, spending, planning horizon |
| Other income | Pension/benefit amount and starting age |
| Investments | Stock/bond allocation and changes over time |
| Advanced assumptions | Presets, returns, volatility, inflation, fees, simulation count |

Allow monthly or annual entry for contributions and spending. Format large amounts with grouping separators on blur so `250000` is easier to verify.

## 7. Make comparisons directly useful

Priority: **Medium**

### Observed problem

Opening Scenarios initially shows another button before displaying any alternatives. Once calculated, the cards show percentages but leave users to calculate the improvement themselves.

**Use this plan** immediately replaces inputs without an undo action. The lower promotional card asks about retiring sooner, while the available retirement alternative is retiring later.

### Proposed change

Open comparison with the alternatives already calculating. Show the change and its effect explicitly. For example:

> **Retire 3 years later**
>
> Retirement age: 50 → 53
>
> Simulated funding rate: 48.7% → 66.5%
>
> **+17.8 percentage points**

Use a stable ordering, rename the action **Apply these changes**, and show confirmation with **Undo**.

As a later improvement, let users adjust retirement age, spending, and contributions within comparison.

Evidence: [Scenario results](/tmp/opencode/fire-visual-review/scenarios-results.png)

## 8. Put validation where users can fix it

Priority: **Medium**

### Observed problem

An invalid age produces a broad message at the bottom of the input card. It remains visible after correcting the age and after switching tabs.

### Proposed change

Identify the affected field, show a specific message beside it, and clear the error when resolved. On submission, focus the first invalid field.

Example message: **Retirement age must be later than your current age.**

## 9. Increase readability and control sizes

Priority: **Medium**

### Observed problem

Many labels, explanations, legends, and controls use very small text and pale colors. The mobile menu’s measured target is only 20 × 20px.

Tab arrow-key navigation does not work, and help explanations depend on hover titles.

### Proposed change

Establish a readable type scale, with body text around 14–16px and secondary text generally at least 12px. Darken essential supporting text.

Provide roughly 44px touch targets, implement standard keyboard behavior for tabs, and make help available through click, touch, and keyboard focus.

## 10. Clarify saving and currency

Priority: **Medium**

### Observed problem

The **P** avatar saves the plan, although its appearance suggests an account menu. **Personal workspace** has a dropdown chevron without an interaction.

Currency switching changes symbols without converting values. Its explanation is confined to a hover title.

### Proposed change

Remove misleading account affordances. Keep one explicit save control with persistent status: **Unsaved changes** or **Saved on this device**. Distinguish saved inputs from calculated results.

Put currency with the financial inputs and show this explanation:

> Amounts are entered in USD. Changing currency does not convert values.

## Recommended experience

**Enter your plan → Update projection → Understand the result → Compare changes → Apply and save**

For the first implementation pass, prioritize:

1. A compact editor with a visible update button.
2. Explicit result freshness and stable calculation states.
3. Readable responsive charts and a fix for the 320px overflow.
4. Field-level validation that clears when corrected.
5. Consistent navigation and an accessible mobile drawer.

At 320px, the measured document width was 384px. This is a verified horizontal overflow defect and should be corrected as part of the responsive work.
