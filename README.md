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

The deployment workflow resolves the existing approved D1 database by its name and
identifier fingerprint in `deployment/preview-accounts.json`. It generates the ignored
`wrangler.accounts-preview.json` and deploys only that config with `--keep-vars`.
Missing or changed database metadata aborts deployment; CI never provisions a new database
or executes SQL. The Cloudflare CI token must permit reading D1 metadata.
Live market-provider access stays disabled, and separate budget diagnostic writes require
an explicit manual workflow input. Run offline policy tests with:

```sh
node --test test/preview-deployment-config.test.mjs
```

## Separate production website candidate

`wrangler.production-app.json` and `cloudflare/src/production-app.mjs` prepare the
approved `smarttrade-ai-app` target without overwriting the existing gateway or binding
Preview data. Build with `npm run build:production-app` and test with
`npm run test:production-app`. The `/ready` endpoint returns 503 until required runtime
configuration is present. Paid market calls remain disabled in the wrapper.
See `docs/production-app-rollout.md` for the CI-token blocker, production OAuth callback,
separate storage/secrets and the remaining release steps. This candidate is not deployed.
