# Personal Ledger — v3

An aesthetics-first Nordic editorial redesign of the existing dashboard. The page keeps the current Shortcuts, NDJSON files, session-only data flow, account calculations, pagination and Category Rhythms. No migration is needed.

## What changed

A clearer serif masthead and period heading; refined sans-serif amounts; off-white paper and quiet olive/slate infographics; underlined period controls; thinner chart lines; compact account and entry rows; an asymmetric desktop layout and single-column phone layout. Dark mode, reduced motion, safe-area padding, keyboard controls and chart descriptions are included.

## Publish

This is the existing GitHub Pages repository. Commit the changes to main; the existing Deploy GitHub Pages workflow publishes them. Only generic dashboard code belongs here. Keep ledger.txt, accounts.json and backups in iCloud.

After deployment, open the clean website once online to receive the new shell, then reopen it from your existing Shortcut. If the installed shell is still old, close and reopen the dashboard after the update. No ledger edits or replacement are required.

## Preserved behavior

- Ten entries per page, Previous / Next / page-number jump; newest first with stable same-date ordering.
- Provisional JPY asset subtotal above the account groups, excluding credit cards and opted-out assets. Unknown balances and missing conversion rates remain visible as caveats.
- Category Rhythms year selector and tappable category-month cells, View entries and Back to selected period.
- Original account opening dates, FX valuation, native transfers and both credit-card-payment directions.
- The original fragment formats and immediate URL cleanup; financial data stays in browser-session memory. No remote libraries, analytics, fonts, new storage, or transport migration.

The practical URL-size limitation remains. The legacy v2 modules are unused by the active index.html → app.js entry point.

## Development

Serve the directory with any static HTTP server. There are no build dependencies. Run `node --test tests/compatibility.cjs` for synthetic-data regression checks. Do not use private financial fixtures.

See [the design system](docs/DESIGN.md) for typography, spacing, colors, component principles and the section audit. Existing Shortcut guides remain available in SHORTCUT.md and docs/.
