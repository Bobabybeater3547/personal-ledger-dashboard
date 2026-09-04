# Personal Ledger II

A serious v2 of the original static Personal Ledger dashboard. iPhone-first, Apple Shortcuts for capture, iCloud Drive for the authoritative financial files, GitHub Pages for generic code only.

## Start here

1. Read [the architecture decision](docs/ARCHITECTURE.md), especially the explicit file-sync tradeoff.
2. Follow [migration and recovery](docs/MIGRATION.md). Your old ledger is preserved; no transaction needs to be relogged.
3. Build [the exact iPhone Shortcuts](docs/SHORTCUTS.md), then run the included device acceptance checks before making v2 your daily writer.

This package builds on the v1 source and retains its icons, manifest approach, original 11 fields and legacy fragment entry point. V2 separates pure accounting/protocol code, local storage, import worker and UI. No external runtime library is required.

## Implemented

- Full transaction history: search, type/account/category filters, full-history or selected-period scope, sorting and 50-row pagination; active and deleted history; UTF-8 CSV export.
- Editorial month overview with recent entries, income, expenses, net flow, previous-period comparison and category composition.
- Interactive monthly income/expense bars, cumulative net cash flow, category/month heatmap, month-by-month previous-year comparison, utility history and recurrence candidates. Charts drill into matching entries and expose accessible names and keyboard activation.
- Account positions and provisional asset totals, dated opening balances, explicit uncertainty, native currency and dated JPY conversion. Legacy payment endpoints remain compatible and are excluded from assets.
- Ranked merchant analysis with visits, average purchase and search.
- Tax review tags and export; investment cash-account organisation and a documented extension contract. No fabricated deductions, tax rates, security prices or portfolio returns.
- First-class edit, delete, restore and account-setup review. Approved requests remain pending until a matching imported iCloud revision confirms them. Small requests use the Shortcuts URL scheme; longer requests use a file.
- Worker-based file parsing, validated/idempotent revision imports, conflict detection, atomic IndexedDB commits and recoverable local storage.
- Standalone PWA manifest, retained icons, offline generic app shell, explicit update prompt, light/dark system styles, safe areas, large touch controls and local data clearing.
- Documented favourites, amount-only entry, fixed-price widget capture, remembered defaults and selective confirmation using native Shortcuts.

The fictional example is generated only after selecting “Explore fictional example”. It is never persisted or mixed with personal records. No user transactions or balances from the conversation appear in the project.

## Deploy to the existing GitHub Pages repository

The connected repositories did not expose the live ledger repository. The original local v1 source was found in the prior task; this package is the ready-to-upload v2 replacement, not a claim that the live site was changed.

### Recommended: GitHub Actions

1. Keep a copy/tag of the current repository for rollback.
2. Upload the contents of this source package into the repository root, replacing the old code files. Include `.github/workflows/pages.yml`, scripts, tests and docs. Never upload anything from your iCloud ledger folders.
3. In Settings → Pages choose GitHub Actions. The workflow runs the contract tests, builds a strict allowlist of generic files into `dist`, and publishes only that folder.
4. Keep the existing Pages URL and final slash. Open it online, install/update the Home Screen app, then import inside that app.

### No-build upload

Use the separate `personal-ledger-v2-pages.zip` containing the already-built static output. Upload its extracted contents to the Pages branch/root and choose “Deploy from a branch”. Do not upload the full source package for this mode. Both packages contain only generic code, synthetic examples and instructions.

The existing v1 `#v=1&ledger=...&accounts=...` link works as an import bridge before cutover; it is immediately cleaned from the address bar. Replace that launcher using the new guide. After migration is confirmed, legacy imports are rejected to prevent mixing two active stores.

## Local development

Node 22 or newer, no dependency install:

```sh
npm test
npm run build
npm run dev
```

Local preview: `http://127.0.0.1:4174/`. Use HTTPS on a deployed site. Opening files directly from disk is not the supported module/service-worker mode.

The build copies an explicit public allowlist and fails if unexpected files exist in `dist`. The Pages workflow never publishes repository root or financial-data directories. The app has no upload API, server, cookies, CDN or analytics.

## Validation and release status

See [VALIDATION.md](VALIDATION.md). Desktop tests and static delivery checks passed. Actual iPhone Shortcuts, iCloud timing, standalone routing, on-device layouts and cache eviction recovery must be exercised on the intended device. The native helpers are exact recipes, not installed or signed Shortcut files. The software cannot provide distributed locking across two offline iCloud writers.

Normal refresh is explicit export/import. There is no promised automatic iCloud sync, browser write access to iCloud, live FX, market pricing, full investment accounting, tax calculation or automatic reverse migration.
