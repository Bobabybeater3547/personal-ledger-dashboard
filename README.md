# Personal Ledger

A static, private-by-design dashboard for a ledger stored in iCloud Drive. GitHub Pages serves only the interface. The iPhone Shortcut passes `ledger.txt` and `accounts.json` in the URL fragment, which browsers do not send to the server. The dashboard copies the fragment into memory and removes it from the address bar before parsing it.

The app does not upload data, use analytics, make API calls, or write financial data to `localStorage`, `sessionStorage`, IndexedDB, or the Cache API. Its service worker caches only the public app shell.

## Files

- `index.html`, `styles.css`, `app.js`: the dashboard
- `manifest.json`, `sw.js`, `icons/`: PWA support
- `SHORTCUT.md`: exact iPhone Shortcut construction
- `.github/workflows/pages.yml`: automatic GitHub Pages deployment

## Deploy to GitHub Pages

1. Create a new **public** GitHub repository, for example `personal-ledger-dashboard`.
2. Upload every file and folder from this project to the repository root. Do **not** upload `ledger.txt` or `accounts.json`.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **GitHub Actions**.
5. Push to the `main` branch or run the **Deploy GitHub Pages** workflow manually.
6. After deployment, GitHub shows the URL, normally `https://YOUR-USERNAME.github.io/personal-ledger-dashboard/`.
7. Put that URL into the Shortcut described in `SHORTCUT.md`.

No build step or package installation is required.

## Accepted private fragment

The recommended format is:

```text
#v=1&ledger=BASE64_LEDGER&accounts=BASE64_ACCOUNTS
```

Both values are ordinary UTF-8 Base64 with no line breaks. The parser also accepts Base64URL and percent-encoded text for compatibility.

## `accounts.json`

```json
{
  "version": 1,
  "accounts": [
    { "name": "Cash", "type": "Cash", "currency": "JPY", "openingBalance": 0 },
    { "name": "PayPay", "type": "E-money", "currency": "JPY", "openingBalance": 0 },
    { "name": "WeChat Pay", "type": "E-money", "currency": "CNY", "openingBalance": 0 },
    { "name": "ゆうちょ", "type": "Bank", "currency": "JPY", "openingBalance": 0 },
    { "name": "金庫", "type": "Bank", "currency": "JPY", "openingBalance": 0 },
    { "name": "Visa Card", "type": "Credit Card", "currency": "JPY", "openingBalance": 0 }
  ]
}
```

Asset opening balances are amounts held. Credit-card opening balances are positive amounts owed. CNY accounts show their native balance and a JPY equivalent using the newest dated CNY transaction with a positive `fxRate`.

Account balances understand `Expense`, `Income`, `Transfer`, and `Record Payment`. For transfers, `account` is the source and `toAccount` is the destination. A card payment may be recorded either asset → card, or card in `account` with the funding asset in `toAccount`; the dashboard recognizes both forms.

## Privacy notes

- The URL fragment never forms part of the HTTP request to GitHub Pages.
- The fragment is removed with `history.replaceState()` in an inline script at the top of the document, before the dashboard code loads.
- Financial records exist only in page memory for that session.
- Opening the clean GitHub Pages URL directly intentionally shows an empty state. Run the Shortcut whenever you want the latest data.
- Browser extensions, iOS accessibility features, screenshots, and a compromised device can still read what is visible in the browser. This design protects the data from the web host; it is not a replacement for device security.
- Very large ledgers can eventually exceed practical URL limits. If that happens, split the ledger by year or move to a different local transport while keeping the same NDJSON schema.

## Local preview

Serve the folder with any static web server and open its local URL. Opening `index.html` directly works for the dashboard but not for service-worker installation.
