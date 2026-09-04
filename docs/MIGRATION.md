# Migration and recovery

## Before touching the working ledger

1. In iCloud Drive, duplicate the entire old `Personal Ledger` folder as `Personal Ledger v1 backup`. Keep Numbers as an archive if you still use it for reference.
2. Stop logging temporarily. Do not modify the backup or upload it anywhere.
3. Deploy the generic v2 files. The new source is separate from the original delivered v1 files, so those remain available for rollback.
4. Add the clean dashboard URL to the iPhone Home Screen. Open that icon with Open as Web App enabled. All subsequent imports should happen there, not in Safari’s separate local view.

## Import without relogging

1. Tap **Import from iCloud**. Select the complete current ledger.txt and accounts.json. NDJSON, a JSON transaction array and `{transactions:[...]}` are accepted. UTF-8, BOM, CRLF, Japanese text and duplicate transactions are supported.
2. Every nonempty line must be valid. An invalid record cancels the selection with a record number; it is never silently dropped. Fix a working COPY in iCloud and import again. Keep the original backup intact.
3. Check transaction count, earliest/latest dates, monthly income/expense totals and original currency values against v1. Use Transactions → full history and CSV export if needed. Historical jpyAmount values are preserved, including old rounding.
4. In **Data & privacy**, choose **Save migration package**. Save the file in iCloud Drive. It contains YOUR private data; it must never go to GitHub or a support conversation.
5. Build **Ledger Migrate v2** and the reusable helpers from SHORTCUTS.md. Share the migration file to Ledger Migrate v2. It saves each original as a root revision under the new folder and prepares a full export.
6. Return to the installed Ledger View app. Import all files from that full export. The importer recognises the same IDs; the count must not double. These returned revisions enable editing.
7. Edit the four transaction shortcuts to call **Ledger Save New**. Remove Numbers actions and the old append-to-ledger.txt actions. Log one small real entry only when you intend that financial record; otherwise use a disposable test ledger as described below.
8. Run Ledger Export v2 and import its new full export. Confirm that the new entry appears once. Then resume normal logging.

Legacy IDs derive from canonical transaction contents plus the occurrence number of identical rows. Reordering nonidentical lines does not change IDs; identical purchases remain separate. The migration preserves all 11 fields and extra metadata. Run migration once on the complete frozen legacy file. Do not reimport separately edited legacy fragments after cutover—changing a legacy row changes its derived ID. From then on, use v2 exports and revisions.

The ledger identity is generated on the first legacy import. Migrate once on one device, then bootstrap other devices from the resulting v2 export. Independently importing the same legacy file into two empty browsers creates two different ledger identities; do not merge them. Clear the unused local view and import the canonical v2 export instead.

## Establishing real asset balances

V1 opening balances without a date are retained but flagged as provisional. Open Accounts → Edit setup and supply an opening date and balance for each asset account. The balance must be the amount immediately BEFORE any entries on that date.

Do not put today’s balance against the beginning of the ledger: that would double-count past activity. Either use a known old opening balance/date, or start with today’s known balance and a date boundary consistent with your transaction history. Because this release uses start-of-day boundaries, a mid-day balance needs reconciliation against that day’s entries before you set it.

Check transfers into foreign accounts. If a foreign destination’s received amount differs from the source amount and cannot be inferred, open the entry and set the optional received amount. The dashboard flags the affected account until then.

Credit-card records are retained as payment endpoints and are excluded from assets. Investment accounts in this release represent uninvested cash, not market value. Keep them excluded unless that balance truly represents cash you intend to count.

## Daily use

- **Record:** use a favourite widget or the Ledger launcher. Logging writes an immutable iCloud file and ends silently.
- **View:** open Ledger View. It immediately displays the last imported local copy.
- **Refresh:** run Ledger Export v2, open Ledger View, select all parts of the new full export.
- **Edit/delete:** open an entry, review, approve handoff, confirm in Ledger Apply Change. Return and import its changed-record export. The request stays pending until the exact saved revision arrives.
- **Restore:** Transactions → Deleted entries → open the item → review restoration → use the same write-back flow.

Keep the full refresh as the normal routine. An incremental changed-record import only updates those explicit records; it is not evidence that every other iCloud record is current. No browser background sync is claimed.

## Recovery cases

| Situation | Recovery |
|---|---|
| Browser cache lost / new phone | Open the installed app and import a fresh full export from iCloud. Browser storage is never the sole copy. |
| Shortcuts or phone closes during migration | Re-run the SAME migration file. Existing identical roots are skipped; conflicting files stop the run. |
| Interrupted edit save | Check the exact revision file and export the record. Reusing the same pending request does not create another revision. Do not tap a new log favourite to “retry” an edit. |
| Shortcut cancelled | No imported revision means no change to totals. Dismiss the pending request or retry it. |
| Native save succeeded but export failed | Run Ledger Export v2. The immutable revision remains authoritative; the browser will acknowledge it on import. |
| Import says missing parent | Import the remaining export parts or a complete history for that record. Allow iCloud downloads to finish first. |
| Import belongs to another ledger | Do not merge. Clear this device’s local view only if you intend to switch, then import the correct full export. |
| Two heads / conflicting edits | Preserve both branches. Use the manual procedure below; no silent winner is chosen. |
| Old browser keeps v1 | Open the clean page online, close older tabs, and reload. V2 removes the known v1 shell cache after activation. Import again inside the Home Screen app. |
| iCloud rename creates a conflicted copy | Do not delete either file on sight. Compare IDs and content; a mismatched filename/revision or duplicate revision is rejected by the export helper. |

## Manual branch recovery

This uncommon maintenance operation is intentionally not a one-tap financial decision.

1. Stop writers and back up the full affected `records/<id>` folder inside iCloud.
2. Inspect the common ancestor and each branch. Decide which final transaction is correct; do not infer it from file modification times.
3. Move the rejected branch’s unique revision files into an iCloud `conflict-archive/<id>` folder OUTSIDE records. Keep the full original backup. Retain the selected root-to-head chain in records. Never rewrite an existing revision.
4. Run Ledger Read Record to verify exactly one connected head. If fields from the rejected branch also belong in the final result, make a new reviewed edit after restoring the selected chain.
5. Clear the dashboard’s local view and import a fresh full export. This is required because the normal importer is additive and intentionally does not infer deletions from missing files. Otherwise it would still retain the archived conflicting branch locally.

## Rollback

The old files remain untouched, but v1 does not understand v2 revisions. Before switching back, export all ACTIVE transactions from Transactions (reset every filter, choose all history). That CSV is a readable recovery artifact, not an NDJSON replacement. For a true v1 rollback, materialise active v2 records to the original 11-field NDJSON format using the model in core.js and verify counts/totals before replacing a working COPY of ledger.txt. Do not simply append v2 event envelopes to a v1 ledger.

If no new v2 records were saved, restoring the old logging shortcuts and original ledger is sufficient. Keep v2 iCloud files until rollback has been reconciled. There is no automatic reverse migration tool in this release.

## iPhone acceptance checklist

Use a separate disposable iCloud folder and ledger ID for these checks before daily use; do not send real financial data to a test host.

1. Import a legacy duplicate pair and a CNY transaction; migrate, reimport, verify unchanged counts and historical JPY values.
2. Log from a favourite widget: amount prompt only; no Numbers or Safari opens; verify one new revision file.
3. Edit then cancel the native confirmation: no new revision and no changed totals.
4. Edit and save: changed-record export updates totals once and removes the pending request. Repeat the same import: no duplicate.
5. Delete and restore: active count and totals update only after the two corresponding imports; history survives.
6. Attempt a stale edit from an older local view: native writer rejects it.
7. Turn off network after the app’s first successful install: viewing/search works; a new iCloud file may need to be downloaded before offline access.
8. Force-close/reopen Ledger View; then clear website data and recover from a full export.
9. Open the same URL in Safari and the Home Screen app: verify each requires its own import; do not assume shared caches.
10. Check first-run Files/Shortcuts permission prompts, very long request-file handoff, action names, keyboard and touch layout on your exact iOS version.

These device checks are not marked passed by the desktop build. They are the remaining release gate for your installed Shortcut/iCloud integration.
