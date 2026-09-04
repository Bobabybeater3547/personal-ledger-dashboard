# Personal Ledger — v1, with three additions

The original v1 dashboard, with its off-white paper, charcoal type, serif headings, thin rules, donut chart and yearly line chart.

- **All loaded transactions, ten per page.** Previous, Next, and a page number jump. Select **All time** to browse across every loaded year. Entries show their year as well as month and day.
- **Provisional asset subtotal.** A JPY subtotal above the original account list. Credit cards still show their recorded balances and are excluded from the asset subtotal.
- **Category rhythms.** Choose a year and explore spending across its twelve months. All expense categories are included. Tap a cell for the amount and entry count, then **View entries** to reach those transactions. **Back to selected period** clears this selection.

This update uses the original iPhone Shortcuts and current iCloud files. No migration or additional Shortcut helpers are required.

## Install in the existing GitHub repository

These are replacement files for the existing repository, which already contains the icons and GitHub Pages workflow. This ZIP is not a standalone site.

1. On Windows, download **personal-ledger-v1-update.zip**.
2. Right-click the ZIP and choose **Extract All**, then **Extract**.
3. Open the extracted folder. You should see six files: **app.js**, **index.html**, **styles.css**, **sw.js**, **manifest.json**, and **README.md**.
4. Open [the repository's main Code page](https://github.com/Bobabybeater3547/personal-ledger-dashboard). Stay in the top folder, where the existing index.html appears.
5. Choose **Add file → Upload files**.
6. Drag those **six files** into the upload box. Upload the files themselves, not the enclosing folder or the ZIP.
7. Enter **Restore v1 with pagination, assets and category rhythms** as the commit message. Commit directly to **main** using **Commit changes**.
8. Open **Actions** and select the newest **Deploy GitHub Pages** run. Wait until that run succeeds with a green check. The existing workflow deploys automatically; no separate build step is needed.

Only generic dashboard files belong in GitHub. Keep ledger.txt, accounts.json, backups, and migration exports in iCloud.

## Open the update on iPhone

1. With an internet connection, open [the dashboard](https://bobabybeater3547.github.io/personal-ledger-dashboard/) in Safari. This gives the old installed app a chance to receive the replacement.
2. If v2 remains visible, let the page finish loading, then reload it. The replacement activates automatically; there is no need to look for an Update App button.
3. Once the original Personal Ledger design appears, run your original **Open Personal Ledger** Shortcut, or the original dashboard option in your **Ledger** launcher.
4. The Shortcut loads the current ledger.txt and accounts.json. Select **All time**, scroll to **Recent**, and use **Next** to see entries after the first ten.
5. The restored dashboard also has **Category rhythms** and a **Provisional asset subtotal** in **Accounts**.

Opening the website or the v2 Home Screen web-app icon by itself does not supply v1 with financial data. A message asking you to open from your Shortcut is expected. Use the original Shortcut or its Home Screen icon to load the latest entries, as in v1. If an app update reload interrupts a data-filled view, run the original Shortcut again after the update is visible.

If the green deployment has finished but a Safari reload still shows v2, close that dashboard tab, open the clean dashboard link above in a new Safari tab, and reload after it finishes loading. Then run the original Shortcut. Do not change or erase the ledger to fix an app-cache problem.

## Keep using the current files

Continue using **iCloud Drive/Personal Ledger/ledger.txt** and **accounts.json**, and the existing Add Expense, Add Income, Transfer, and Record Payment Shortcuts.

Do not replace the current ledger with an older v1 backup: the current file may contain newer transactions. The unfinished v2 helper and unused v2 folders can remain unused. Do not run a migration.

The original NDJSON transaction fields remain compatible:

date, type, account, toAccount, category, amount, currency, fxRate, jpyAmount, merchant, note.

## How the three additions work

### Transactions

There is no fixed display limit. Ten entries are rendered at a time, newest first. Period changes and category-month selections return to page one. A category-month selection affects the transaction list; the overview and donut keep their selected period.

Pagination does not remove the practical size limits of v1's URL-fragment transport or the phone's memory. It lets you browse every successfully loaded transaction. No new transport or persistent financial cache is introduced.

### Provisional asset subtotal

The subtotal uses configured non-card accounts included in assets. It applies recorded opening balances and transactions through the current time, then converts supported foreign balances into JPY. It is an asset subtotal, not net worth.

The **About these balances** disclosure explains assumptions, missing accounts, missing rates, and skipped ledger lines. Missing opening balances assume zero; missing opening dates apply all loaded entries. These assumptions are why the subtotal remains provisional.

No account-file changes are required. If already present, optional openingDate, includeInAssets, valuationRate and valuationDate are respected. An opening balance is before entries on its opening date. A dated explicit valuation rate takes priority; otherwise the latest available recorded exchange rate is used, not a live market rate.

Accounts that cannot be valued are excluded from the subtotal and identified. A native balance can still be shown when its JPY valuation is unavailable. An unknown native balance is labelled Unavailable rather than displayed as zero. Cross-currency movements estimated from a valuation rate are identified. Both existing card-payment directions remain supported.

### Category rhythms

Expense totals are grouped by recorded category and calendar month, in JPY, for the selected year. Income, transfers and card payments are excluded. Blank categories appear as Other.

All categories in that year are shown, sorted by annual spending. Colour strength uses the same scale across the whole year, so amounts can be compared between categories. Each cell exposes its exact amount and count when selected, including to assistive technology.

Dots mean no expenses were loaded for that cell. They do not establish that a month's records are complete. Like the original charts, amounts use recorded JPY values or recorded transaction exchange rates.

## Privacy and compatibility

GitHub Pages serves generic HTML, CSS, JavaScript and icons. Financial values arrive only in the URL fragment, which is removed from the visible address before other resources load. Dashboard code reads the values in memory and does not upload them or save them in browser storage.

The service worker caches generic app files only. This release replaces old v1/v2 app caches; it does not delete unrelated browser storage, old v2 IndexedDB data, or anything in iCloud. Unused v2 code files in the repository are not loaded by this dashboard.

## Verification

Desktop checks with synthetic records covered pagination across 100,003 entries, list rendering, category-month totals and selection, page/period reset, asset balances, both card-payment directions, foreign exchange, missing values, opening dates, and app-cache replacement. The original donut/line-chart code, type palette, and manifest were retained.

These checks do not establish unlimited URL transport capacity. Browser appearance and iPhone activation still need confirmation on the device after deployment.
