# SmartTrade AI — v0.2

Hebrew RTL paper-trading prototype. Open `index.html` in a browser.

## Included
- Virtual initial cash: ₪15,000
- Fictional fixed ILS prices for illustrative US and Israeli market assets
- Simulated buy/sell and holdings with browser-local storage
- Equity allocation cap (25%, 45%, 60%, 100%) on new simulated stock purchases
- Simplified equity drawdown stress scenario
- JSON portfolio and CSV trade exports

## Limitations
No real-time market quotes, broker connection, real orders, AI model, FX conversion, taxes, fees, user authentication or downside protection. All data stays in this browser and can be lost when storage is cleared. Do not use this prototype for real-money decisions.

## Roadmap
Market-data provider and licensing; tests; secure multi-user backend; broker integration only after separate security and regulatory review.

## Account-service candidate

`preview-public/account-client.js` adds an opt-in account portfolio panel, backed by
`/api/private/portfolio` when a reviewed storage binding and feature flag are enabled.
The local simulation portfolio remains separate. This candidate does not activate D1,
configure secrets, enable provider calls, or authorize production rollout.

Run the selected offline account tests with `npm run test:accounts`.
The application uses ES modules; `server/quote-gateway.cjs` remains CommonJS.
See `docs/d1-preview-activation-runbook.md` for the API contract, exact legacy data mapping,
staged activation, and remaining live acceptance and recovery gates.

## Preview CI deployment

The deployment workflow reads the account-store binding already attached to the Worker
and verifies its identifier fingerprint in `deployment/preview-accounts.json`. It generates the ignored
`wrangler.accounts-preview.json` and deploys only that config with `--keep-vars`.
Missing or changed database metadata aborts deployment; CI never provisions a new database
or executes SQL. It uses the existing Workers deployment permissions, not the D1 inventory API.
Live market-provider access stays disabled, and separate budget diagnostic writes require
an explicit manual workflow input. Run offline policy tests with:

```sh
node --test test/preview-deployment-config.test.mjs
```

## Existing production adaptation

The separate-Worker experiment in PR #68 is on hold. `cloudflare/src/index.js` keeps
the existing `smarttrade-ai` gateway, routes and credentials. Optional app/account paths
are guarded by `ACCOUNT_APP_ENABLED=true` and remain absent by default.
Build optional assets with `npm run build:existing-production` and run compatibility tests
with `npm run test:existing-production`. `wrangler.existing-production.json` targets the
same Worker with the feature disabled; it does not bind a database or change Google settings.
See `docs/existing-production-adaptation.md` before any activation or production deployment.

## Active production deployment

The existing Worker is active with account persistence. The owner confirmed Google login and save/refresh/reload on 2026-10-29. Use `npm.cmd run check:production` for a guarded dry-run or `npm.cmd run deploy:production` for an authorized release, with Cloudflare credentials supplied in the environment. These commands verify the live production DB fingerprint and preserve bindings/secrets. Do not deploy the legacy baseline config over the active account app. See `docs/existing-production-adaptation.md` for evidence and rollback.

## Production account backups

Run `npm.cmd run backup:production` with Cloudflare credentials in the environment on Windows. Archives are AES-256-GCM encrypted, with Windows-user-bound DPAPI keys. Each archive is reread and restored into isolated in-memory SQLite for verification. `npm.cmd run backup:verify -- "C:\path\backup.encrypted.json"` verifies it later without Cloudflare access. No live database writes occur. See `docs/production-backup-recovery.md` for recovery limits, Time Travel and incident handling.

## Private Basic learning data

The existing production account app supports manually requested US stock and ETF prices from a shared 12-symbol catalog for the authorized Google account when the explicit personal-learning policy is enabled. It uses the existing server key and a shared 8/minute, 800/day quota guard, without polling, public distribution or portfolio-price changes. See `docs/personal-market-learning.md` for scope, validation and disabling the feature.

## Local simulation value chart

The production chart records a current baseline and later local portfolio observations after successful trades and price updates. A single point is visible; no prior history is invented. Reloads keep observations without duplicating the same state, and a manual snapshot button is available. This is separate from Twelve Data stock prices and the Google account ledger. See `docs/local-portfolio-chart.md`.
