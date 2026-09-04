# Personal Ledger v2 — architecture decision

Decision date: 4 September 2026. Target: iPhone, Apple Shortcuts, Safari/Home Screen web app, iCloud Drive. This is an evolution of the supplied v1 static project. There is no app server, public financial database, Debt feature, Siri entry or natural-language parser.

## The chosen system

**iCloud revision files → explicit file import → local IndexedDB index → dashboard.**

**Reviewed dashboard change → small Shortcuts request or request file → native validation and confirmation → new iCloud revision → import to acknowledge.**

The authoritative copy is in iCloud Drive. Browser memory and IndexedDB are device-local working copies; they are not iCloud storage and are not backed up by this app. This interpretation permits the local cache requested in the brief while keeping iCloud the only remote data store. Clear the local view whenever desired.

The normal refresh is a full export, divided into files as it grows. The importer also accepts complete histories for individual changed records, so the write Shortcut can export one changed record as an incremental update. There is no automatic time cursor, clipboard ferry, background polling or chained URL navigation. Importing the same export repeatedly is safe.

```text
iCloud Drive / Personal Ledger v2
  config.json                 private ledger identity
  entry-preferences.json      private defaults and favourites
  records/
    <transaction-id>/
      <revision-id>.json       immutable original or replacement
      <revision-id>.json       later edit or deletion
    accounts/
      <revision-id>.json       dated account configuration history
  exports/
    full-<export-id>-001.ledger.json
    changed-<record-id>.ledger.json

GitHub Pages: generic code, styles, icons and guides only
  ↓
Home Screen app: local index + pending change requests
```

The extra files are intentional. They avoid fragile append/rewrite operations on one synced text file. An interrupted multi-file migration can resume without overwriting existing records. A failed or concurrent change cannot silently replace another revision. The cost is more iCloud files and a slower native full export as history grows. At a much larger scale, a native iCloud document app would be the next architecture—not increasingly complicated URL transport.

## Why these alternatives were rejected

| Approach | Decision and reason |
|---|---|
| Entire ledger in one fragment | V1 compatibility only. URL size, navigation/history exposure and Home Screen routing remain problems. Base64 is encoding, not encryption. |
| Sliced fragments with callbacks | Rejected as the primary transport: interruption, ordering, app switching and lost acknowledgements introduce a distributed sync protocol on top of navigation. |
| Safari share-sheet JavaScript bridge | Useful in Safari, but requires an active Safari webpage and cannot be the dependable standalone-app bridge. |
| Clipboard bootstrap/deltas | Rejected: paste permission, clipboard lifecycle and possible cross-device clipboard exposure do not improve the core system. |
| Persistent iCloud directory handle | Not a portable Safari baseline. A browser cannot silently browse or overwrite arbitrary iCloud Drive files. |
| CloudKit JS / custom proxy / hosted API | Does not directly expose the existing iCloud Drive document. Adds credentials, containers or a server, outside this product’s constraints. |
| File picker + IndexedDB | Chosen: user-selected files, no URL-size dependency, local processing, recoverable cache and ordinary Home Screen operation. |

A refresh does require selecting export files. That is the explicit tradeoff for native-only, private, standalone operation. Logging remains independent and fast; refreshing a comprehensive dashboard is not part of each log action.

## Protocol

Each immutable revision is a complete replacement, not a field patch:

```json
{
  "schema": 2,
  "kind": "ledger-event",
  "ledgerId": "YOUR-LEDGER-UUID",
  "entity": "transaction",
  "id": "YOUR-TRANSACTION-UUID",
  "revision": "YOUR-REVISION-UUID",
  "parent": "",
  "operation": "put",
  "savedAt": "2026-09-04T12:00:00+09:00",
  "data": {
    "date": "2026-09-04T12:00:00+09:00",
    "type": "Expense",
    "account": "Example wallet",
    "toAccount": "",
    "category": "Food",
    "amount": 500,
    "currency": "JPY",
    "fxRate": 1,
    "jpyAmount": 500,
    "merchant": "Example cafe",
    "note": ""
  }
}
```

The first revision has an empty-string parent. Later revisions name their exact predecessor. Deletion uses `operation: "delete"`, a nonempty parent and `data: null`. Restore is a new `put` whose parent is the tombstone. Files are never deleted during normal use.

`entity: "accounts"` has the reserved ID `accounts`, operation `put` and `data: {"accounts": [...]}`. A transaction may not use that ID. An account can contain `name`, `type`, `currency`, `openingBalance`, `openingDate`, `includeInAssets`, `valuationRate` and `valuationDate`. Missing balances/dates remain unknown, not zero-known balances. Legacy credit-card accounts remain compatible as payment endpoints, excluded from assets; there is no debt-management UI.

An import envelope is:

```json
{"schema":2,"kind":"ledger-bundle","ledgerId":"YOUR-LEDGER-UUID","exportedAt":"ISO timestamp","events":[]}
```

Chunks may be imported together or separately. Revisions are keyed by revision ID, deduplicated by canonical content, and materialized only when a single root-to-head chain is available. Missing parents, multiple heads, cycles and changed immutable contents are reported. Conflicted records are excluded and the UI clearly marks totals as incomplete. File selection does not prove that an export contains every iCloud record: the UI describes imported coverage, never a guaranteed live balance.

The importer validates a selection before one IndexedDB commit. A failure leaves the prior data unchanged. A local pending request is never applied to balances. It is acknowledged only when an imported revision matches request ID, record ID, parent, entity, operation and data. A cancelled handoff stays pending until dismissed or confirmed by import.

## Writing and conflicts

Use **one designated iPhone as writer**. Read-only dashboards can exist on several devices. iCloud file operations have no database transaction or compare-and-swap primitive; no Shortcut can promise serializable writes across offline devices. The writer checks the current head immediately before saving, writes a new uniquely named file, reads it back and verifies the result. A simultaneous race can still create a branch; both versions survive and the importer detects the branch.

The native Shortcut is the trust boundary. It checks the private configured ledger ID, allowed identifiers, schema, entity, operation and values. It rejects stale parents. It shows the actual iCloud predecessor and the requested replacement, rather than trusting browser-supplied “before” text. Only explicit native confirmation writes. The full steps are in SHORTCUTS.md.

No `x-success` financial payload is used. Apple’s callback mechanism appends text output as a result parameter; a careless callback could put data into an HTTP query. The simple `shortcuts://run-shortcut` route avoids that mechanism. Requests longer than the app’s conservative 6,000-character URL threshold use a request file. That threshold is a routing policy, not a claimed iOS maximum.

## Accounting boundaries

- Expenses and income use the stored historical `jpyAmount`; importing does not reprice history.
- Transfers and Record Payment never inflate income or expenses.
- Native asset balances start immediately before transactions on `openingDate`. Entries before it are ignored for that account; later entries through the as-of date are included.
- A foreign transfer into a foreign account needs `toAmount` when the destination amount cannot be inferred from matching currency. The original 11 fields remain unchanged; this optional field removes ambiguity.
- Missing opening dates, unknown accounts and missing conversion information make asset totals provisional. Imported history may itself be incomplete even when the account model is fully configured.
- Foreign asset values use an explicitly dated stored valuation rate, or the latest imported matching-currency transaction rate no later than the as-of date. This is not a live quote; its date is displayed.
- Calendar periods use the date written on the transaction, preserving the local day rather than shifting it across time zones. Edited dates preserve the original timestamp if the day is unchanged.
- Recurrence is a labelled heuristic: at least three same-merchant/currency/account expenses, with at least 75% of intervals near a weekly/monthly/yearly median. It creates no scheduled charges.
- Tax tags are organisational metadata, not a tax opinion. Exports supply evidence for the user’s own review.
- Investment accounts track uninvested cash and funding. Market values, returns, lots and tax computations need explicit holdings and valuation inputs; they are not inferred from deposits.

## Extensibility

`taxTag` is supported by the transaction editor and tax export. Unknown legacy transaction keys are retained. A future holdings module should use a new, explicitly versioned entity with instrument ID, quantity, quote currency, valuation timestamp, unit price, FX source/date and linked cash account. It must reconcile purchases against cash movements and avoid adding portfolio value on top of the same cash. The current importer deliberately rejects unknown v2 entity types until that module is implemented; it does not pretend these analytics exist today.

## Privacy and Home Screen behaviour

No telemetry, analytics, fonts from a CDN, external chart library, rate service, sign-in or backend. The document uses `connect-src 'none'`, `form-action 'none'` and a no-referrer policy. Imported text is escaped when rendered. CSV exports neutralise spreadsheet formula prefixes. Service-worker fetches use only an explicit set of generic URLs and strip query strings.

A downloaded static application must trust its origin’s code. GitHub Pages projects on the same hostname share an origin; project subpaths are not a security boundary. A dedicated hostname/account with no untrusted sibling sites is preferable. CSP reduces accidental exfiltration; it cannot make compromised hosting trustworthy. Store no private filenames in public links. A browser cache is protected by the device/browser, not separately encrypted by this app.

The Home Screen icon opens the local cache immediately. Import inside that app; Safari’s IndexedDB is not transferred. Storage persistence is requested on demand but may be denied; eviction recovery is reimport. Updates are offered explicitly, and saved pending requests survive an update. Offline availability requires one successful online install. A shortcut URL is not promised to open the installed web app.

## Evidence checked

- [Apple: Run JavaScript on Webpage](https://support.apple.com/guide/shortcuts/intro-to-the-run-javascript-on-webpage-action-apd218e2187d/ios): requires an active Safari webpage/share-sheet invocation.
- [Apple: Run a shortcut from a URL](https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios): documented `shortcuts://run-shortcut` text input.
- [Apple: x-callback-url](https://support.apple.com/en-euro/guide/shortcuts/apdcd7f20a6f/ios): callback output/result semantics.
- [WebKit: Storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/): IndexedDB quota, eviction and persistence policy.
- [WebKit: Safari 17.2](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/): only login cookies copy to a new Home Screen app; other website data is separate.
- [WebKit: Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/): Home Screen “Open as Web App” behaviour.
- [MDN: using files from web applications](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications): selected files can be read locally.
- [MDN: showOpenFilePicker](https://developer.mozilla.org/en-US/docs/Web/API/Window/showOpenFilePicker): limited availability; not used as the cross-browser baseline.
- [GitHub: Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): static artifact deployment.

These sources establish platform boundaries. The exact native Shortcut recipes still require execution on the user’s iPhone; desktop tests cannot establish iCloud write timing or iOS UI behaviour.
