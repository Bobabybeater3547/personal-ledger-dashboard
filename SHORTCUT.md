# iPhone Shortcut: Open Personal Ledger

This Shortcut reads the two private files from iCloud, Base64-encodes them on the phone, and puts them after `#` in the dashboard URL.

Before building it, replace the URL below with your deployed GitHub Pages URL. Keep the final `/`.

```text
https://YOUR-USERNAME.github.io/personal-ledger-dashboard/
```

## Build the Shortcut

Create a new Shortcut named **Open Personal Ledger**, then add these actions in this exact order.

1. **File**
   - Tap the file field and choose `iCloud Drive/Personal Ledger/ledger.txt`.
   - Turn off **Show Document Picker** if that option appears.

2. **Base64 Encode**
   - Input: the `ledger.txt` file from step 1.
   - Mode: **Encode**.
   - **Line Breaks: None**.

3. **Set Variable**
   - Name: `LedgerBase64`.
   - Value: the Base64 result from step 2.

4. **File**
   - Choose `iCloud Drive/Personal Ledger/accounts.json`.
   - Turn off **Show Document Picker** if shown.

5. **Base64 Encode**
   - Input: the `accounts.json` file from step 4.
   - Mode: **Encode**.
   - **Line Breaks: None**.

6. **Set Variable**
   - Name: `AccountsBase64`.
   - Value: the Base64 result from step 5.

7. **Text**
   - Enter one continuous line exactly like this, inserting the two blue magic variables in the marked positions:

```text
https://YOUR-USERNAME.github.io/personal-ledger-dashboard/#v=1&ledger=[LedgerBase64]&accounts=[AccountsBase64]
```

   - `[LedgerBase64]` must be the magic variable from step 3, not typed brackets.
   - `[AccountsBase64]` must be the magic variable from step 6.
   - Do not add spaces or line breaks.

8. **URL**
   - Input: the Text result from step 7.

9. **Open URLs**
   - Input: the URL from step 8.

Run the Shortcut. Safari should briefly receive the fragment, then the address bar should immediately return to the clean GitHub Pages URL while the dashboard stays populated.

## Optional finishing touches

- Open the Shortcut’s details, choose **Add to Home Screen**, and use the name `Ledger`.
- The Home Screen icon launches the Shortcut, which is important: launching the installed web app by itself has no private fragment and therefore no ledger data.
- Keep `ledger.txt` as newline-delimited JSON: one complete JSON transaction per line and no surrounding array.

## If Base64 Encode is hard to find

Search actions for **Base64**. Depending on iOS language and version, the action can appear as **Base64 Encode**, **Encode with Base64**, or an **Encode/Decode Base64** action whose mode must be set to **Encode**.

## Quick diagnosis

- **Dashboard is empty:** the Text action probably contains typed variable names instead of magic variables, or the file action returned no content.
- **“Private data fragment could not be read”:** confirm both Base64 actions use no line breaks and the final Text is one line.
- **Some transactions are missing:** open `ledger.txt` and confirm every non-empty line is valid JSON with an ISO-style `date`.
- **CNY shows no JPY equivalent:** at least one CNY transaction needs a positive numeric `fxRate`.
