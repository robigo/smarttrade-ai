# SmartTrade AI — D1 Preview activation and rollback plan

**Status: NOT ACTIVATED.** This document is a review checklist, not an authorization to provision resources or change Production.

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
6. Add a deliberate opt-in UI for server snapshots only **after** legacy data mapping is tested. Never overwrite an existing local portfolio automatically.
7. Run the full browser UAT and repeat checks from both desktop and mobile. Require a recorded Go/No-Go decision.

## Rollback (manual, Preview only)
- Immediately unset `PORTFOLIO_SYNC_ENABLED`; this disables cloud read/write while retaining local browser portfolio data.
- If required, roll back only the isolated Preview Worker to the last known-good deployment, as documented in `docs/preview-rollback-runbook.md`.
- Preserve the D1 database for incident review. Do not delete data or revert schema without a separate approved recovery plan.
- Confirm `/health`, `/auth/me`, anonymous market guards, and browser UI still behave as expected.
- Record incident timestamp, failing SHA, Cloudflare deployment ID, test evidence and operator.

## Production gate
NO-GO until migration, real D1 restore, authenticated end-to-end tests, browser integration, monitoring, license-compliant market mode, owner acceptance and rollback rehearsal are documented. A 200 health response or green CI alone is insufficient.
