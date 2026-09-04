# Exact iPhone Shortcut changes

These are native Apple Shortcuts recipes. They do not require Scriptable, a server, Siri, or webpage JavaScript. They are construction instructions, not signed installable `.shortcut` files. Action labels vary slightly with iOS language; the English actions and their inputs are specified below. Use blue magic variables wherever a variable is named. Do not type brackets into a path.

Build the shared file helpers once, then reuse them from the existing Add Expense, Add Income, Transfer and Record Payment shortcuts. First perform the migration in MIGRATION.md with an iCloud backup. Use one iPhone as writer, allow iCloud to finish downloading the record folder, and avoid running two write shortcuts simultaneously.

## 0. Files and names

In Files, create `iCloud Drive/Personal Ledger v2/`, with `records` and `exports` inside it. Keep the old `Personal Ledger/ledger.txt` and `accounts.json` as archives after migration.

The app uses these exact Shortcut names:

- **Ledger Apply Change** — receives approved changes.
- **Ledger Migrate v2** — imports the one-time migration package.
- **Ledger Export v2** — refreshes the dashboard.

Also create these reusable native helpers:

- **Ledger Validate Event**
- **Ledger Read Record**
- **Ledger Save New**

Use a **Folder** action pointing to the iCloud folder in every helper, not On My iPhone. For a **Save File** action, turn **Ask Where to Save** off, use the specified subpath, and turn **Overwrite If File Exists** off for every file under `records`. Export files can be overwritten. Never append to a revision file.

`config.json` is private and contains only `{"schema":2,"ledgerId":"the ID from your migration package"}`. The migration Shortcut creates it. All write shortcuts read it afresh and compare ledgerId. Do not put the ledger ID, accounts, presets, financial values or exports into GitHub.

## 1. Ledger Validate Event

Input: one event Dictionary. Output: that same Dictionary. On any failed check, **Show Alert** with the field/problem, then **Stop This Shortcut** without output. Callers must check the result **has any value** before continuing. This prevents a stopped helper from accidentally being treated as a successful validation.

Use **Get Dictionary from Input**, **Get Dictionary Value**, **If**, **Match Text**, **Count**, and **Stop and Output** as follows:

1. Get Dictionary from Shortcut Input → `Event`.
2. Require `schema` equals number `2`, `kind` equals `ledger-event`.
3. For `ledgerId`, `id`, `revision`: Get Dictionary Value → Match Text `^[A-Za-z0-9-]{1,80}$` → Count must be exactly 1. Reject periods, slashes, spaces and empty IDs.
4. `parent` must exist as Text. Empty is allowed for the root. If nonempty, match the same identifier pattern. Require `parent` differs from `revision`.
5. Require `entity` is `transaction` or `accounts`; `operation` is `put` or `delete`. Require `savedAt` is parseable with **Get Dates from Input** and has a date.
6. For an accounts event: require `id = accounts`, `operation = put`, and a `data.accounts` List. Repeat accounts, require unique nonempty names, three-letter uppercase currency, numeric openingBalance when supplied, YYYY-MM-DD openingDate when supplied, positive valuationRate when supplied, and a valid valuationDate when supplied. Missing opening fields are allowed and remain missing/null. Stop and Output Event.
7. For a transaction event: require `id` is not `accounts`.
8. For a delete: require nonempty parent. Ignore replacement data and set `data` to the JSON null value by constructing this event through **Get Dictionary from Input** on a Text block with `"data":null`; do not use the literal string `"null"`. Stop and Output Event.
9. For a put: Get `data` as Dictionary. Require exactly one recognised type: Expense, Income, Transfer or Record Payment.
10. Require nonempty account; currency matches `^[A-Z]{3}$`; date begins `^[0-9]{4}-[0-9]{2}-[0-9]{2}`. For new/edited dates, use a Date variable and **Format Date** as `yyyy-MM-dd` or `yyyy-MM-dd'T'HH:mm:ssXXX` (lowercase `yyyy`, not week-year `YYYY`). Legacy migration dates may contain slashes: preserve them if **Get Dates from Input** can parse them.
11. Require amount, fxRate and jpyAmount are actual numbers greater than 0 and no larger than 10,000,000,000,000. Check each original value is not empty before **Get Numbers from Input**; require exactly one number and require its text representation represents the whole original value, not a number extracted from other text. A Dictionary **Number** type is preferable. For JPY, fxRate must equal 1.
12. For Transfer/Record Payment: require a different, nonempty toAccount. For Expense/Income: require empty toAccount. Require optional toAmount, if supplied, is a positive number.
13. Require account, toAccount, category and merchant each have at most 200 characters; note at most 2,000; optional taxTag at most 120. Preserve other data keys. Stop and Output Event.

The helper is deliberately strict. The dashboard also validates imports; this native check prevents writing malformed requests from an unrelated link. The optional historical JPY rounding in migrated data is preserved; validation must not silently recalculate it.

## 2. Ledger Read Record

Input: record ID Text. Output Dictionary: `{id, head, events}`. `head` is the complete latest event; for a missing record return empty `head` and an empty `events` List. This helper checks the history instead of trusting the newest filename or filesystem timestamp.

1. **Match Text** on input with `^[A-Za-z0-9-]{1,80}$`; require exactly one match. Store as `RecordID`.
2. **Get Contents of Folder** `Personal Ledger v2/records`, Recursive off. **Filter Files**: name equals RecordID. If no folder: return the empty result above. If more than one: alert and stop without output.
3. **Get Contents of Folder** the matched folder, Recursive off. Filter extension `json`.
4. Set three empty **List** variables: `Events`, `RevisionIDs`, `ParentIDs`; set empty **Dictionary** `ByRevision`; set number `Roots=0`.
5. **Repeat with Each** file: Get Dictionary from Input → Run Shortcut **Ledger Validate Event**. If output is empty, stop. Require its id equals RecordID and ledgerId equals config.json ledgerId. Require filename without extension equals revision. Require revision is not already in RevisionIDs. Add Event to Events; add revision to RevisionIDs; **Set Dictionary Value** revision → Event in ByRevision, and explicitly **Set Variable ByRevision** to the updated dictionary. If parent is nonempty add it to ParentIDs; otherwise increment Roots.
6. After Repeat: require Roots equals 1. Repeat ParentIDs: each must occur in RevisionIDs. A missing parent means an incomplete iCloud download or corrupt history: stop and ask to download/repair it, never guess.
7. Build empty `Heads` List. Repeat Events: if its revision is not in ParentIDs, add it to Heads. Require Count Heads equals 1. Store its first item as Head.
8. Check connectedness: set `Current=Head`, empty `Visited`. **Repeat** Count Events times: require Current has value and its revision is not already in Visited; add revision to Visited. If parent is nonempty, Get Dictionary Value parent from ByRevision → Current. Otherwise set Current to empty. At the end require Count Visited equals Count Events and Current is empty. Any failure means a branch/cycle/disconnected record: alert and stop.
9. **Dictionary** with id=RecordID, head=Head, events=Events → **Stop and Output**.

An empty on-disk folder with zero JSON files is treated as a missing record, just like step 2. This allows interrupted creation to resume. The collector must initialise Lists explicitly; do not rely on a Text variable behaving like a List.

## 3. Ledger Save New — replace each old append block

Input: the existing 11-field transaction Dictionary. This helper records a NEW transaction only; it cannot overwrite an existing transaction.

1. Get Dictionary from Shortcut Input → `Transaction`.
2. Read `config.json`; get ledgerId → `LedgerID`.
3. **Generate UUID** → `TransactionID`. Generate another UUID → `RevisionID`.
4. **Current Date** → **Format Date** `yyyy-MM-dd'T'HH:mm:ssXXX` → `SavedAt`.
5. **Dictionary**:

   | Key | Type | Value |
   |---|---|---|
   | schema | Number | 2 |
   | kind | Text | ledger-event |
   | ledgerId | Text | LedgerID |
   | entity | Text | transaction |
   | id | Text | TransactionID |
   | revision | Text | RevisionID |
   | parent | Text | empty string |
   | operation | Text | put |
   | savedAt | Text | SavedAt |
   | data | Dictionary | Transaction |

6. Run **Ledger Validate Event** on this Dictionary; if output empty, stop.
7. **Create Folder** under records with name TransactionID. **Get Text from Input** Event → **Set Name** `RevisionID.json` → **Save File** to that folder, Ask Where off, Overwrite off.
8. Read that exact file back. Get Dictionary from Input. Compare ledgerId, id, revision, parent, operation and all transaction fields against the Event. If a mismatch, show failure and stop; do not log another transaction automatically.
9. **Vibrate Device** if desired. **Stop and Output** Event. Do not open a file, Numbers, Safari, or the dashboard.

In **Add Expense**, **Add Income**, **Transfer** and **Record Payment**:

1. Preserve the current field collection and historical FX calculation.
2. Remove **Add Row to Numbers** if still present.
3. Replace **Append to ledger.txt** with **Run Shortcut → Ledger Save New**, passing the transaction Dictionary.
4. If the helper output is empty, Stop. If it has value, update remembered defaults as described below, then **Stop This Shortcut**.

Do not keep writing to ledger.txt after cutover. Two independent active stores will drift. Existing Record Payment field direction is supported; for new payments consistently use funding account in account and card endpoint in toAccount.

## 4. Minimum-tap transaction entry

Separate the fast path from the full editor. The default path should never ask for data already supplied by a favourite or a safe saved default.

### Variable-price favourite: amount is the only question

Duplicate Add Expense and call it, for example, **Ledger · Lunch**:

1. **Ask for Input**: Number; prompt `Lunch · <preset account> · <preset currency>`. This is the only prompt.
2. Require amount > 0.
3. Current Date → Format Date `yyyy-MM-dd'T'HH:mm:ssXXX`.
4. Dictionary with Expense, the preset account/category/currency/merchant, empty toAccount/note, and entered amount.
5. For JPY use fxRate=1 and jpyAmount=amount. For foreign currency use the private stored rate and its date. If missing/stale beyond your explicit preference (start with 7 days), ask for a numeric rate; do not contact an online rate service or silently use 1.
6. Calculate jpyAmount = amount × fxRate. Run Ledger Save New. Stop.

From a widget, the expected interaction is: tap favourite → enter amount → Done. iOS may add initial permission/unlock prompts. Do not add a launcher menu in front of this path.

### Fixed-price favourite: tap to record

Duplicate the variable-price favourite and replace Ask for Input with a fixed Number. Include the amount and account in its name, e.g. `Coffee · ¥350 · Wallet`. Use this only when amount/account/currency are genuinely fixed. The widget tap commits the preset; it is not an amount-entry screen. A haptic acknowledges the save. A mis-tap can be corrected through the dashboard after import. This is optional, not the default for variable purchases.

### General expense: amount + category, account default in the prompt

Store private preferences in `entry-preferences.json`:

```json
{
  "version": 2,
  "expense": {"account":"YOUR DEFAULT ACCOUNT","currency":"JPY","lastCategory":"YOUR CATEGORY"},
  "income": {"account":"YOUR DEFAULT ACCOUNT","currency":"JPY","lastCategory":"YOUR CATEGORY"},
  "fx": {},
  "largeAmountJPY": 50000
}
```

These are placeholders, not recommended financial values. Set the large-amount threshold yourself or disable it.

1. Read preferences. Ask for amount with account/currency in the prompt.
2. **Choose from List** containing `lastCategory` first, then your other categories, then `Change account…`, then `More details…`. Remove duplicate category labels. A category choice finishes the ordinary path.
3. `Change account…`: choose an account from your existing account list, derive its currency, then return to category selection. `More details…`: offer merchant/note/date changes. Do not ask for merchant and note on every ordinary expense.
4. Only after a successful Ledger Save New output, update expense.account, expense.currency and expense.lastCategory in preferences. Income uses its own separate defaults. Do not let Transfer or Record Payment overwrite either default.
5. Show a review only when the user selected More details, changed currency/FX, exceeded their chosen large-amount threshold, or requested confirmation. Foreign transfers always show both amounts and accounts.

For **Transfer**, choose source, destination and amount, and require explicit toAmount for a different foreign destination currency. Remember the last pair for display only; do not silently reuse a payment destination. For **Record Payment**, show the funding account and card endpoint together before saving. These are less frequent, higher-consequence flows where an explicit confirmation is useful.

### Launcher, Home Screen and widgets

Edit **Ledger**’s Choose from Menu to contain your two or three most-used favourite shortcuts first, then `Expense`, `Income`, `Transfer`, `Record Payment`, `Prepare dashboard export`. Each menu item runs its child shortcut and then stops. Avoid returning to the menu after logging.

Add the favourite shortcuts themselves to a Shortcuts widget, Home Screen or Action Button where your device supports it. Those entry points bypass the Ledger menu completely. Keep the installed dashboard icon separate and name it `Ledger View`. Do not use Open URLs after a log: it would cost another app switch and may open Safari.

## 5. Ledger Apply Change — reviewed edit/delete/write-back

Enable **Show in Share Sheet** and accept **Files** and **Text**. URL text input from the app works without the Share Sheet. Always validate even though the app already showed a review.

1. **Get Text from Shortcut Input** → **Get Dictionary from Input** → `Request`.
2. Read config.json. Require Request schema=2, kind=ledger-command and ledgerId exactly matches the private configured ID. Check requestId and id using the identifier pattern in helper 1. Require entity transaction/accounts, parent empty or a valid identifier, operation put/delete. No URLs or filesystem paths from Request are used.
3. **Run Shortcut Ledger Read Record**, input Request.id → `Record`. If output is empty due to error, stop. Require Request.parent equals Record.head.revision; if no head, require empty parent. If the same requestId already exists as a revision filename, stop without writing and show `This request already has a file. Import its export to check the result.` Do not claim a successful save on filename presence alone.
4. Build a prospective Event Dictionary with all envelope fields from Request, `revision=Request.requestId`, and savedAt=Current Date formatted as above. For delete use JSON null as explained in helper 1; otherwise data=Request.data.
5. Run Ledger Validate Event. If output empty, stop. Require an existing record’s entity is unchanged.
6. Build review **Text** from the actual Record.head.data and the validated replacement, showing all affected fields, account, amount, date, and operation. For account setup show the full account list. **Choose from Menu**: `Save change` / `Cancel`. Cancellation → Stop. Deletion must explicitly say `Delete this entry from active totals; retain its history?`.
7. Run Ledger Read Record AGAIN on the same ID immediately before saving. Require the current head is still Request.parent. If changed, show `The record changed. Import the latest export and review again.` → Stop.
8. Create the record folder if this is a new root. Save the Event as `records/Request.id/Request.requestId.json`, Overwrite off. Read that exact file back and compare every field (including the complete data Dictionary) with Event. Any mismatch → error, no success output.
9. Run Ledger Read Record again. Require its sole head equals Request.requestId. A conflict → alert; preserve both files and stop.
10. Build **Dictionary** `{schema:2, kind:"ledger-bundle", ledgerId:LedgerID, exportedAt:SavedAt, events:Record.events}` using the fresh result from step 9. Get Text, Set Name `changed-Request.id.ledger.json`, Save to exports, Overwrite on.
11. **Show Notification** `Change saved. Import the changed-record export in Ledger View.` Then **Stop This Shortcut**. Do not use x-callback-url or return the event to a web URL.

Compare dictionaries field by field, not with a formatted JSON string: key ordering is not meaningful. For transaction data, loop **Get All Keys** from both dictionaries, require identical key sets and equal values; for scalar values use their typed comparison. For accounts, compare the account lists in order and each account’s key/value fields. If unknown nested metadata cannot be compared, stop safely and reimport to verify rather than reporting success. The published `approveCommand` function in core.js is the executable reference for this contract; it is not an action to paste into Safari.

The pre-save re-read narrows races; it does not provide a distributed iCloud lock. The supported operating mode remains one designated writing iPhone. With two offline writers, both unique revision files may survive as a branch; the dashboard will flag it.

## 6. Ledger Export v2 — scalable refresh, no URL payload

Default mode is **All records**. Every full refresh is safe to repeat. Do not infer deletion from absent files; only tombstone revisions delete records.

1. Read config.json → LedgerID. Generate UUID → ExportID. Current Date formatted ISO → ExportedAt.
2. **Get Contents of Folder** records, Recursive off → the record folders.
3. Initialise empty **List** `Batch`, number `BatchCount=0`, number `Part=1`, empty **List** `ExportFiles`.
4. Repeat each record folder: Get its name → Run Ledger Read Record. If validation returns empty, stop export and show the folder name. Do not silently omit a broken record. Repeat its `events`: Add event Dictionary to Batch; increment BatchCount.
5. Whenever BatchCount reaches 2,500: build Dictionary `{schema:2,kind:"ledger-bundle",ledgerId:LedgerID,exportedAt:ExportedAt,events:Batch}`; Get Text → Set Name `full-ExportID-Part.ledger.json` → Save in exports, Overwrite off. Add saved file to ExportFiles. Increment Part; reset Batch to a new empty List and BatchCount to 0.
6. After all records, if BatchCount > 0, write the last file using the same block. If there are no records, stop and say so.
7. Show Result `Prepared [Count ExportFiles] files for [Count record folders] records. In Ledger View choose Import from iCloud and select every file beginning full-[ExportID].` No Open URLs, no Base64 and no clipboard action.

The file picker can select several files. If a record’s chain crosses two chunks, import both; the dashboard flags missing parents until the rest arrive. Keep total selected files below 64 MB per import; multiple imports merge safely.

Optional **Selected records** mode: Choose from List of record folders, Select Multiple on, then run the same export loop. This is an explicit incremental export. A changed-record export from Ledger Apply Change already includes that record’s full chain. New logs are picked up by the next full export. There is deliberately no “since timestamp” cursor that could skip edits or iCloud-delayed files.

## 7. Ledger Migrate v2

Accept Files/Text in the Share Sheet. Run it on the dashboard-generated `ledger-v2.migration.json` saved in iCloud.

1. Get Text → Get Dictionary → require schema=2, kind=ledger-migration, ledgerId passes the identifier pattern and events is a List.
2. If config.json exists, require identical ledgerId. If missing, create it from schema and ledgerId. Use fixed iCloud paths. Do not replace an existing identity.
3. Show Result with transaction-root count, account-root count and destination folder. Choose `Migrate` or `Cancel`.
4. Repeat each event: Run Ledger Validate Event; if empty stop. Require event.ledgerId matches and parent is empty and operation=put. Create the record folder if absent.
5. If the exact revision file already exists: compare the full Dictionary field by field; if identical, skip it; otherwise stop and report the conflicting ID. If no exact file exists but the record folder has other JSON revisions, stop—do not add a second root. Otherwise save the original Event text under its exact revision filename with Overwrite off.
6. Read every newly saved file back and compare. Preserve the generated IDs, savedAt and data; do not regenerate them. A interrupted run can be repeated on the SAME migration file.
7. After all roots succeed, run Ledger Export v2. Import every produced file in Ledger View. The app enables edits only for revisions that have returned in v2 exports.

For hundreds or thousands of roots, keep the phone awake during the initial migration. Shortcuts/iCloud may need time to materialise files. An interruption is recoverable because no original or revision is overwritten.
