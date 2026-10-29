# SmartTrade AI — D1 Preview activation and rollback plan

**Preview status: ACTIVATED on 2026-10-29 after explicit user approval. Production: NOT ACTIVATED.** The baseline tracked config remains unbound; the approved live Preview uses the ignored account-specific config described below. This document does not authorize Production changes.

## Scope
- Target only the isolated Worker `smarttrade-ai-preview`.
- Route `/api/private/portfolio` exists but returns `503 sync_not_enabled` while `PORTFOLIO_SYNC_ENABLED` is not `true` or `PORTFOLIO_DB` is absent.
- The existing browser portfolio uses a different **legacy decimal-share, ILS** data model than the server's **integer-share, cents-based** paper ledger. Never silently upload or reinterpret legacy browser state as a server snapshot.
- No real broker, no paid provider calls, and no Twelve Data display rights are enabled.

## Preconditions (all must be evidenced)
1. Confirm the current Preview deployment SHA, `/health`, UI smoke, auth guard and the full test suite pass on the same SHA.
2. Complete authenticated live tests for Google login/logout, session expiry, cookie flags, cross-user isolation, CSRF/origin and D1 optimistic version conflicts.
3. Approve a separate migration/mapping strategy for legacy browser portfolios. Preserve local backups and prohibit destructive auto-import.
4. Approve Cloudflare D1 account quotas, retention, privacy, access permissions and any associated costs.
5. Review D1 schema `cloudflare/migrations/0001_paper_portfolios.sql`; prepare a separate **Preview-only** D1 resource with an isolated identifier.
6. Verify an encrypted backup/export and restoration drill for the new database, plus incident owner and rollback procedure.

## Staged Preview-only rollout (manual; not executed by CI)
1. Record approved D1 database ID securely; add `PORTFOLIO_DB` binding to a reviewed Preview-only Wrangler configuration. Do not commit secrets or a real database identifier into public docs.
2. Apply the SQL migration **only** to the newly approved Preview D1 database. Confirm table schema and ownership key.
3. Deploy with `PORTFOLIO_SYNC_ENABLED` **unset**. Confirm authenticated `GET /api/private/portfolio` returns 503 and local browser state remains untouched.
4. Run the server-side offline and isolated D1 integration tests; then run live authenticated tests using a dedicated non-production test user.
5. Explicitly approve enabling `PORTFOLIO_SYNC_ENABLED=true` for Preview only. Confirm version 0 reads, initial PUT, updated PUT, 409 stale write, 403 cross-origin PUT, 401 anonymous requests and per-subject isolation.
6. Verify the candidate opt-in account UI and legacy mapping described below. Never overwrite an existing local portfolio automatically.
7. Run the full browser UAT and repeat checks from both desktop and mobile. Require a recorded Go/No-Go decision.

## Rollback (manual, Preview only)
- Immediately unset `PORTFOLIO_SYNC_ENABLED`; this disables cloud read/write while retaining local browser portfolio data.
- If required, roll back only the isolated Preview Worker to the last known-good deployment, as documented in `docs/preview-rollback-runbook.md`.
- Preserve the D1 database for incident review. Do not delete data or revert schema without a separate approved recovery plan.
- Confirm `/health`, `/auth/me`, anonymous market guards, and browser UI still behave as expected.
- Record incident timestamp, failing SHA, Cloudflare deployment ID, test evidence and operator.

## Production gate
NO-GO until migration, real D1 restore, authenticated end-to-end tests, browser integration, monitoring, license-compliant market mode, owner acceptance and rollback rehearsal are documented. A 200 health response or green CI alone is insufficient.

## Account UI (active in isolated Preview)

The candidate adds a separate Google account portfolio panel with explicit load, save,
draft export, whole-share paper trades, and confirmed copying from the legacy local portfolio.
Account drafts stay in memory. No account portfolio is saved automatically or copied
over the legacy browser state. A rejected or cancelled import leaves both portfolios intact.

Legacy mapping converts ILS into exact integer cents and accepts whole-share quantities
only. Fractional shares, fractional cents, unknown symbols, and inconsistent replayed
ledgers are rejected with a visible message. Users can retain/export their local portfolio;
the candidate never rounds positions or prices to make a migration pass.

The account API contract now binds writes to the loaded identity:

- `GET /auth/me` returns `accountId` (Google subject) for an authorized session.
- `GET /api/private/portfolio` returns `{accountId, version, snapshot}`.
- `PUT /api/private/portfolio` requires JSON `{version, snapshot}`, same-origin `Origin`,
  and `X-Account-Id` equal to the current session subject. The header selects no owner;
  the server always uses the signed session. A session switch returns 403 before writes.
- A 409 response locks further editing/saving while keeping the draft exportable.
  Reload requires confirmation if the draft has unsaved changes.

`GOOGLE_APP_ORIGIN` configures the exact HTTPS app origin for OAuth callbacks and logout.
It defaults to the existing Preview origin for compatibility. Before a later production
deployment, register that environment's callback with Google and use separate reviewed
runtime secrets. Origins containing paths, credentials, queries, or fragments are rejected.
Changing the configured origin invalidates in-flight OAuth transactions.

Local evidence uses the actual Worker and signed synthetic sessions with an in-memory
database. It does not establish successful real Google sign-in, durable D1 storage,
database restoration, or production readiness. The D1 binding and feature flag remain absent from the baseline tracked config; the approved account-specific Preview deployment is recorded below.

Before activation, explicitly authorize a dedicated Preview D1 database and its costs,
review the existing migration, backup/export and retention policy, and run the staged rollout
above. Do not reuse a production database or enable market-provider calls for these tests.

## Approved activation evidence — 2026-10-29

The user explicitly approved a new isolated Preview D1 resource and account activation.
The reviewed schema was applied to the new empty database. The account candidate was
first deployed with sync false, then enabled only after the remote storage drill passed.

- Active Preview version: `5af49d67-bd60-42d9-8503-a7e214dedf48`.
- Sync-disabled rollback target: `c829c134-4516-4d22-9087-d3ac02b7f8de`.
- The Preview-only rollback and return to the active version were rehearsed successfully.
- Twelve remote D1 checks passed using the actual account handler in Node and local,
  synthetically signed test sessions. No live session was forged or secret read.
- Checks covered initial save, versioned update, persistence, two-account isolation,
  stale writes, origin/account guards, encrypted backup tamper detection and actual
  restoration into the remote database. Only the two synthetic subjects were deleted;
  the database was confirmed empty after the drill.
- Backup encryption used AES-256-GCM with a key wrapped by Windows DPAPI CurrentUser.
  The backup contains synthetic data only. This is not an unattended production backup policy.
- Live Preview health returned 200; anonymous account/market access returned 401.
  OAuth start returned 302 to Google with the correct Preview callback and secure cookie.
- Thirty-eight browser checks passed against the deployed HTML and captured static script
  with mocked API replies. Thirteen account integration cases passed separately in the
  local 51-case browser suite. These counts do not claim a completed real Google login.

Private configuration and database metadata are stored in the operator workspace as
`wrangler.accounts-preview.json` (ignored by Git). Regenerate it with
`scripts/write-preview-account-config.mjs` using reviewed `SMARTTRADE_PREVIEW_D1_ID`,
`SMARTTRADE_PREVIEW_D1_NAME`, and `SMARTTRADE_PREVIEW_SYNC_ENABLED` environment values.
Sync defaults to false; paid market-provider flags are always false in this generator.
Deploy only this reviewed config with `--keep-vars`. The existing CI deployment still
uses the unbound baseline config; do not merge/deploy this account branch through CI
until its reviewed binding configuration is integrated, or cloud sync will be disabled.

The guarded remote drill is `scripts/preview-d1-smoke.mjs`. It requires an explicit
`SMARTTRADE_APPROVED_D1_SMOKE=1`, a sync-disabled config, a verified empty Preview database
and the pinned Wrangler CLI. Run only while deployed account writes are disabled.
It is an operator drill, not a CI test or a production data restore command.

Remaining gates: real Google login/logout by the authorized human account, session lifecycle
UAT, review of persistent user data retention/backup/incident ownership, production routing
and configuration review, and final production Go/No-Go. Production remains NO-GO.
