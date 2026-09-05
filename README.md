# Personal Ledger — v3.1

The Nordic editorial dashboard, with Apple-style controls and three practical additions: any month/year, account opening details, and file loading independent of URL size.

## Everyday use

- **Choose date** opens a Month / Year segmented control. Pick a month, enter any year from 1900 to 9998, or use the year stepper. The arrows beside the date move one month or one year. The original shortcuts to recent periods remain.
- **Open files** reads ledger.json and accounts.txt directly from iCloud Drive / Files. Files are processed locally, in a worker, without encoding the ledger in a URL. Select either file to replace only that part of the view. Multiple ledger parts must not overlap; they replace the loaded history together.
- **Edit** beside an account changes its opening date, opening balance and asset inclusion. **Add account** adds an account to the loaded account file. Apply recalculates the local view; it is a draft until you save and reopen the file.
- **Save account changes** shares or downloads the updated accounts.txt. Save it in your existing iCloud Personal Ledger folder, replacing the previous account file after making a backup. Reopen the saved file to verify that it matches. The dashboard cannot silently overwrite iCloud Drive.

Read [the file workflow](docs/FILES.md) before your first account save. Your existing Shortcut and URL fragment still work. No transaction migration is required.

## Private by design

Financial data stays in session memory. Closing or reloading requires reopening the files or using the existing Shortcut. No server, analytics, remote fonts, live exchange-rate calls or persistent financial browser database is introduced. The service worker caches generic application assets only. The public repository contains no personal ledger, account file or private fixture.

The direct-file workflow removes the URL transport limit, not device memory limits. A 100,000-entry synthetic import is tested. The legacy URL route retains its original practical size limit.

## Compatibility

Previous / Next / page jump, category-month drill-down and year selection remain. Credit cards are excluded from the provisional asset subtotal. Opening dates, native transfer amounts, both legacy payment directions, missing valuations and stable same-date ordering are preserved.

Existing account names, types and currencies stay fixed when editing to avoid breaking history. Unknown account fields and the original array/object envelope survive exports. The dashboard never rewrites ledger.json. If your logging Shortcuts have a hard-coded account menu, update those choices after adding an account; browser edits cannot modify a Shortcut.

## Development and deployment

No build dependencies. Serve this directory with a static HTTP server. Run `node --test tests/*.cjs` (or list the test files explicitly if your shell does not expand the pattern). Tests use synthetic data only.

The existing main-branch GitHub Pages workflow publishes the site. Deploy all tracked files, including files.js and file-worker.js. After deployment, open the clean URL online to update the shell, then reopen through your Shortcut or Open files. Real iPhone Safari, the Files share sheet and iCloud replacement still need device verification.

[Design system](docs/DESIGN.md) · [File workflow](docs/FILES.md) · [Legacy Shortcut](SHORTCUT.md)

Older v2 architecture and migration guides describe an abandoned implementation. They are not required for this version; no v2 migration should be run.
