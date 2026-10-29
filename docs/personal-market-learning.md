# Private Basic learning quotes

The owner explicitly selected their existing Twelve Data Basic account for private
self-learning, within its free quota, without a broker or a subscription upgrade.
This mode is not public market-data distribution or a representation that an
exchange/redistribution license has been granted. General public display remains
disabled (`MARKET_DISPLAY_APPROVED=false`). The existing authorized Google account
is the only account allowed to use the browser quote endpoint.

## Behavior

- `GET /api/market/status` and `GET /api/market/quote?symbol=AAPL` require a valid
  existing Google session. Initially supported symbols: AAPL, MSFT and SPY.
- Quotes use the existing server-side secret. No API key is sent to browser code,
  a public repository, error messages or browser storage.
- Quotes are requested only by a button click. There is no automatic polling,
  batch request, WebSocket subscription or retry loop. Returned prices remain
  separate from local and account simulation portfolio calculations.
- A new SQLite Durable Object binding on the same existing Worker reserves each
  request before contacting the provider. The Google route and existing authorized
  bearer route share the same instance and its 8/minute, 800/UTC-day limits.
  Failed provider requests conservatively consume reserved credits too.
- Counter failures reject the request. Provider errors and credentials are
  sanitized; 429 responses explain rate limits. Responses use `no-store`; no raw
  quote database or public edge cache is created.
- These counters cover this Worker only. Other applications using the same key
  share the provider's real account quota; upstream 429s are still respected.
- The provider's Basic `/price` endpoint is used for a single latest price (one
  credit per symbol), instead of the richer `/quote` endpoint. It supplies no
  provider timestamp; the UI marks that timestamp as unknown and shows fetch time
  and source. A successful fetch does not certify
  exchange-wide coverage, real-time entitlement or data freshness.

The Basic credit limits and midnight UTC reset are described in the provider's
[credits documentation](https://support.twelvedata.com/en/articles/5615854-credits).
See also its [trial documentation](https://support.twelvedata.com/en/articles/5335783-trial)
and [current pricing/usage descriptions](https://twelvedata.com/pricing).
No paid subscription, exchange add-on, billing upgrade or broker integration is
created by this code. It implements the owner's private learning scope; use for
public/third-party display requires a separately reviewed provider entitlement.

## Deployment and validation

`deployment/production-accounts.json` explicitly selects `personal_learning=true`.
The guarded production generator keeps the exact reviewed D1 account store and
existing Google/gateway secrets. It adds `MARKET_QUOTA`, exports `MarketQuota`, and
applies `v1_personal_market_quota` with `new_sqlite_classes` on the existing Worker.
Preview's separate counter, disabled mode and account database are unchanged.

Use the guarded production deployment commands from the production runbook. Confirm
the D1 binding, Google origin and quota binding after deployment. Anonymous market
requests must remain 401. Automated server/browser validation uses synthetic local
sessions and mocked provider replies; it does not prove the real private API key works.
The owner must perform a manual authenticated quote request for that final acceptance.
No personal Google session is forged or copied for automated tests.

## Disable and recover

Set `personal_learning=false` in the production policy, regenerate the guarded
configuration and redeploy with `--keep-vars`. This retains the quota class,
migration and counter binding while disabling the browser quote feature. The bearer
gateway retains the shared quota protection. Account storage remains active and
does not need a restore. Do not remove/reset the counter to bypass exhausted credits.
Do not assume a rollback across a new Durable Object migration is possible; use the
feature-disabled configuration to preserve state instead.
