# Validation record

4 September 2026 — desktop implementation checks.

## Passed

- 25 automated contract/privacy tests using Node’s built-in test runner.
- BOM/CRLF/Unicode NDJSON; arrays and wrapper JSON; repeat-import idempotency; intentional duplicate preservation; original JPY rounding.
- Invalid record detection with position; date/leap-year and numeric validation; unsupported type rejection.
- Revision ordering and missing-parent detection; branches and cycles; immutable-content collision rejection; ledger identity separation.
- Stale edit rejection; request idempotency; path traversal rejection; exact-head write contract; deletion and restore.
- Transfers/payments excluded from cash-flow totals; opening-date boundaries; native balances; foreign-transfer uncertainty; card payment direction compatibility; incomplete asset claims.
- Recurrence minimum-evidence requirement; nullable account field round trips.
- 100,000 synthetic transactions materialized successfully in approximately 0.35 seconds in this desktop runtime. This is a model benchmark, not an iPhone performance promise or an iCloud export benchmark.
- Document CSP/no-referrer rules; absence of client upload APIs; fixed public service-worker allowlist; Pages workflow publishes only the build output.
- JavaScript syntax checks and successful HTTP responses from the local static preview.

No personal financial data was used in these tests. The app’s fictional example is synthetic and kept in memory only.

## Required device validation

The final checklist is in MIGRATION.md. No iPhone was available to execute native Shortcuts, validate its exact localised action UI, test iCloud file-provider timing, inspect Safari/Home Screen layouts, or exercise native deep links. These are not marked passed. The original live GitHub Pages repository was not available to update; the delivered source and static ZIPs are ready for the existing hosting workflow.

The project is implemented and packaged. Production use of the native write path depends on constructing and verifying the supplied Shortcuts on the designated writing iPhone.
