# Adapt the current production gateway

## Production activation — 2026-10-29

The owner explicitly requested connection and verification after reviewing the remaining
storage and Google callback requirements. The existing Worker `smarttrade-ai` was
activated at https://smarttrade-ai.goshen-r.workers.dev/ with a separate production
account database. No Preview data was copied. Existing Google and gateway secrets
were preserved; no new Worker or OAuth client was created.

- Active version: `401d8bab-4fc4-46a7-bb15-274e896390f2`.
- Previous version / emergency rollback: `a1725f93-82d7-498f-bd6d-ca459c961d7e`.
- Production callback: https://smarttrade-ai.goshen-r.workers.dev/auth/google/callback .
  The actual post-deployment OAuth start reached Google's sign-in identifier page,
  without redirect mismatch or invalid-client errors. This does not claim completion
  of a personal Google sign-in.
- Production DB schema was applied before activation. Nine checks exercised the actual
  portfolio handler with synthetic local sessions against the remote production DB,
  including persistence, stale writes, identity separation and origin guards.
  Only test subjects were removed after verification. No live personal session was forged.
- 23 compatibility/config tests passed. The live site returned expected HTTP statuses
  on ten routes. The published HTML and script exactly matched the built assets.
- Live Chromium checks passed at 390, 768 and 1280 pixels, without horizontal overflow,
  JavaScript errors or external requests. Browser checks performed GET requests only.
- Existing gateway authorization remained intact. No paid quote requests were made;
  the new account UI's market access remains disabled. Preview callback is unchanged.
- The DB binding and live feature flags were verified from Worker settings after deploy.
- Human acceptance completed: the owner confirmed Google login, portfolio load,
  and preservation of a saved change after refresh/reload in the chat on 2026-10-29.
  This is owner-reported evidence; the agent did not access a personal session.
  Existing Preview portfolios are not copied automatically.

Deployment uses the ignored operator config `wrangler.accounts-existing-production.json`
with `--keep-vars`. Do not deploy the baseline `wrangler.toml` or the disabled example
over this release: they omit the active database/assets bindings. The new private config
must be backed up within the operator's secure environment. The guarded operator commands below now validate and preserve the binding.
Production CI remains separate from the existing automatic Preview workflow.

Rollback, if needed: use pinned Wrangler to roll back the existing production Worker
to the previous version above. Preserve the production database; rollback is not a
database deletion or schema reversal. It restores the original gateway/Preview-auth
behavior. No production rollback was performed during these non-disruptive checks.

The remaining sections below record the earlier preparation state, before activation.


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

## Guarded production deployment

Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the operator environment without printing them. Run npm.cmd run check:production in the repository for a dry-run, or npm.cmd run deploy:production for an authorized release. Both commands build assets and read only the existing production Worker settings before deployment. They verify the PORTFOLIO_DB identifier against deployment/production-accounts.json and abort on missing/replaced bindings. The generated private config is removed before refresh, so a failed refresh cannot leave a stale deploy config. The commands preserve runtime secrets with --keep-vars; they do not create databases, migrate data, query D1 or call a quote provider. Production is not automatically deployed by Preview CI.
