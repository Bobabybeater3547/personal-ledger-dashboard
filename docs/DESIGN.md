# Personal Ledger v3 — design system

## Intent
A private financial journal, composed like a restrained Nordic annual report. The numbers and the reader's next action come first. No new finance modules, decorative cards, or marketing content.

## Typography
Locally available Palatino / Iowan serif for the masthead, period, section titles and asset subtotal. Helvetica Neue / Arial for controls, entries and the main expense figure. No remote fonts or third-party requests. Platform font differences are intentional; test with the fallbacks. Use tabular figures for comparable amounts. Main text is 16px; controls and category labels 14px; secondary metadata 12–13px. Native inputs remain 16px to avoid iOS focus zoom.

## Color
Paper #f6f5f1, charcoal #292b28, secondary ink #696c65, rules #d9dad2. Olive #58654c identifies spending; slate #72868d identifies income in the trend. Other categories use quiet mineral tones. Never encode meaning by color alone: retain names, amounts, accessible descriptions and the dashed income line. Dark mode uses the same hierarchy with independently defined tokens.

## Composition and spacing
A 4px-derived rhythm, 20px minimum phone gutters, fluid desktop gutters, 1440px outer limit. One major black rule closes the overview; lighter rules separate supporting content. Phone reading order: overview, spending, trend, category rhythms, accounts, entries. Desktop pairs charts and places accounts beside entries on an asymmetric grid. Section headings are deliberately smaller than the period and primary amount. Avoid adding equally weighted boxes.

## Controls and motion
Underlined period navigation; no pills. At least 44px touch areas for controls and heatmap cells. Keep the heatmap horizontally scrollable with sticky category labels. Preserve Previous, Next and the explicit page jump. Visible focus rings, a skip link, accessible chart descriptions, and full merchant text are part of the design. Transitions last 160–180ms with cubic-bezier(.2,.7,.2,1); reduced-motion removes them and smooth scrolling. No entrance delays, number-counting or perpetual animation.

## Privacy and compatibility
The active entry point remains index.html → app.js. Shortcuts supply the existing fragment payload; the fragment is removed immediately and transactions remain in session memory. No migration, analytics, remote font service, new persistent store, or server is introduced. Legacy v2 modules remain unused. Only generic shell assets belong in the service-worker cache and public repository. Do not add ledger.txt, accounts.json, private fixtures or exported fragments.

Keep transport and account calculations independent of presentation. Future account creation or transport replacement should reuse these surfaces, not add a second dashboard. Preserve credit-card exclusion, valuation uncertainty, both payment directions, opening-date rules, stable ordering and category-month transaction selection.

## Section audit
- Masthead: replace the compressed two-font logo with a small Personal label and clear serif Ledger wordmark.
- Overview: show the actual period; make expense numerals prominent and currency secondary; align supporting figures.
- Spending: thinner ring, compact keyed rows, wrapping category names, shared selection states.
- Trend: finer lines, dashed income, contained touch targets and width-aware tooltip; retain description after redraw.
- Rhythms: keep the complete yearly matrix and selected-cell outline; use the same olive ink as spending.
- Accounts: preserve the provisional subtotal above groups and all balance caveats; align values without cards.
- Entries: readable wrapping descriptions, restrained dates and amounts, familiar pagination, filter reset and focus restoration.

## Verification
Use fictional input only. Verify 10-row pages, last-page bounds and previous/jump actions; category-month selection and reset; year changes; empty and malformed payloads; subtotal exclusion of credit cards; opening-date and FX behavior; mobile overflow and long values; reduced-motion and dark tokens; cache version updates. Test the installed iPhone Shortcut after deployment for device-specific behavior.
