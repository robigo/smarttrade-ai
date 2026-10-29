# Adapt the current production gateway

Owner direction: retain the existing production infrastructure and make a minimal
compatible extension. The separate `smarttrade-ai-app` experiment (PR #68) was closed
without deployment; its branch remains recoverable.

## Existing state verified read-only

- Worker: `smarttrade-ai`, using `cloudflare/src/index.js` and `wrangler.toml`.
- `/health` returned the existing private-gateway response with HTTP 200.
- `/auth/google/start` returned 302 to Google with the existing **Preview** callback.
- Worker settings contained no D1 binding. No secret values were logged or copied.
- No production mutation, resource creation or provider-quote request was performed.

## CI adaptation

The Preview CI deployment now reads `/workers/scripts/smarttrade-ai-preview/settings`,
not the D1 inventory API. It extracts only the existing `PORTFOLIO_DB` binding and verifies
the approved identifier fingerprint before generating the same active account config.
This uses Worker permissions already needed for deployment; Cloudflare explicitly states
that deploying bindings does not require separate bound-resource permissions.

The local read generated a config identical to the active Preview config. A real CI run
with the existing GitHub token is required to finish validating this narrower route.
Do not weaken identity validation or change tokens merely to restore D1-list access.

Reference: https://developers.cloudflare.com/workers/authorization/workers/

## Optional production extension

`handleExistingAccountApp` is called only after the original auth and health routes and
before the original unknown-route check. It returns no response when the feature is off.
The existing `/api/quote` bearer contract and GitHub Pages CORS behavior remain intact.
Tests cover authorized legacy quotes with a mocked provider; no live paid call was made.

When explicitly enabled, the extension serves `/`, `/index.html`, `/account-client.js`,
the private account endpoint, and disabled-price UI endpoints. The UI endpoints never
alias the legacy paid quote gateway. Their market access remains disabled regardless
of inherited market variables.

Activation requires all of:

- `ACCOUNT_APP_ENABLED=true`;
- an explicitly reviewed `PORTFOLIO_DB` binding and `PORTFOLIO_SYNC_ENABLED=true`;
- existing Google credentials and a session-signing secret;
- `GOOGLE_APP_ORIGIN` matching the actual production origin;
- the optional static asset binding.

`/_account/ready` is available only when the extension is enabled and configured.
Existing `/health` is unchanged and does not prove account readiness.

The overlay `wrangler.existing-production.json` targets the existing Worker with both
new feature flags **false**. `wrangler.toml` remains unchanged. No new Worker, secrets,
Google setting or production database is created by preparing/building this code.

## Remaining before production activation

1. Verify the repaired Preview CI deployment with the existing token.
2. Choose and approve production account storage. The existing Worker has no database;
   full account persistence cannot be provided without adding a binding. Do not silently
   reuse/copy live Preview data or provision a resource as a side effect of deployment.
3. Verify that the current Google client accepts
   `https://smarttrade-ai.goshen-r.workers.dev/auth/google/callback` before switching
   `GOOGLE_APP_ORIGIN`. The current redirect to Preview is preserved while the feature is off.
   Existing runtime secrets can remain; no new OAuth client is imposed by this approach.
4. Review the exact enabled configuration and rollback target, then run account UAT on
   the chosen environment before enabling the optional app in production.

The existing production deployment is unchanged. This document describes a candidate
extension and its evidence, not a completed production release.
