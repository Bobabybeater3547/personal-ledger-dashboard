# Working with iCloud files

## Open larger ledgers

1. Open the clean dashboard URL in Safari or the installed web app.
2. Tap **Open files** in the masthead.
3. Under Transactions, select `iCloud Drive/Personal Ledger/ledger.txt`. Under Accounts, select `accounts.json` from the same folder.
4. Tap **Open files**. This reads selected files on your device; it does not upload them.

You can refresh just the transactions by selecting only ledger.txt. The existing account view and any draft account edits remain. Selecting only accounts.json replaces only account configuration. Multiple non-overlapping NDJSON files can be selected together; their combined history replaces the current history. Reimporting the same full file does not append duplicates. Do not select overlapping backups together.

The importer reads chunks in a worker and applies results only after parsing succeeds. Invalid account files reject the whole selection. Malformed ledger lines are counted and skipped, with an incomplete-data notice; an entirely unreadable ledger is rejected. Cancelling an import keeps the previous view.

This removes the need to put the ledger in a URL. The device still needs enough memory for the loaded transactions. The session-only view does not automatically sync or survive a reload. iCloud remains the master copy.

Your existing logging Shortcuts do not need changing. For a clean-link launcher, create a separate Shortcut with URL (the clean dashboard URL, without a fragment) → Open URLs. Select your files in the dashboard after launching. Keep the old data-carrying launcher as a fallback while trying the new flow.

## Add or edit accounts

Open the complete existing accounts.json before editing; this avoids accidentally exporting an incomplete account list. If starting a new ledger, an accounts.json containing `[]` is a valid empty list.

Tap **Edit** beside an account to change its opening balance/date or asset inclusion. The opening balance is before all entries on the opening date. Moving the date forward excludes earlier entries from that account's balance. Account balances always use all loaded history through today, regardless of the selected spending period.

Tap **Add account** for a new named account, type, currency, opening balance and date. The name must be unique. A new credit-card account remains excluded from the asset subtotal. Existing names, types and currencies are read-only to preserve transaction identity and accounting semantics. Optional custom fields, FX metadata and the original JSON envelope are preserved.

**Apply changes** updates only the local draft. It does not claim to have saved to iCloud. Draft status remains visible, and supported browsers warn before closing a dirty view. Mobile operating systems can still terminate a page without such a warning; save before leaving.

## Save the actual account file

1. Tap **Save account changes**.
2. Use **Share file** on supported iPhones, then **Save to Files**. Select the existing Personal Ledger folder in iCloud Drive. Save as **accounts.json**, replacing the original only after making a backup. If Share is unavailable, use **Download file**, then move that file from Downloads to the same iCloud folder in Files.
3. Be careful about names: a browser may create accounts (1).json. Your logging Shortcuts need the authoritative file to retain the exact name **accounts.json**.
4. Back in the dashboard, tap **Reopen saved account file** and select the iCloud accounts.json. Matching contents clear the draft state; a different file leaves the draft intact and explains the mismatch.

Sharing or downloading alone is not proof of an iCloud write. The app checks the reopened contents. It cannot independently verify the file's folder or that iCloud has finished syncing; select the authoritative file explicitly. No callback or URL contains the edited accounts.

If logging Shortcuts read accounts.json dynamically, they can use the new account after saving. If they have a hard-coded List or Choose from Menu, add the new account name to those lists yourself. The dashboard cannot edit native Shortcuts.

## Platform boundary

Safari supports selected-file reading and sharing/downloading. It does not provide the user-visible showSaveFilePicker API used by some desktop browsers for arbitrary file overwrites. This version therefore uses an explicit, portable save workflow rather than claiming automatic iCloud synchronization.

References: [WebKit file system explanation](https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/), [File System Access specification and browser support](https://wicg.github.io/file-system-access/), [Apple Shortcuts share actions](https://support.apple.com/en-gb/guide/shortcuts/apdaf74d75a5/ios).
