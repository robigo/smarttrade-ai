# Separate production website candidate

The user approved the new target `smarttrade-ai-app` at
https://smarttrade-ai-app.goshen-r.workers.dev/ . Preserve the existing
`smarttrade-ai` private quote gateway and `smarttrade-ai-preview` application.

This branch prepares code and configuration only. It does not authorize ignoring
failed CI, copying Preview user data, revealing runtime secrets, or enabling paid quotes.

## Current state

- Preview PR #67 merged as `01bfbf802fc98e2cac80985e3806ccd9c2483e10`.
- Merged-source Preview Checks and UI Smoke passed.
- The first CI deployment stopped before any upload when D1 inventory access returned
  Cloudflare `Authentication error [code: 10000]`. The existing Preview version stayed active.
- Correct the Cloudflare token stored as GitHub `CLOUDFLARE_API_TOKEN`: retain its existing
  deployment scope and grant D1 metadata-read access to the intended account. Never put
  tokens in chat or source. Re-run failed jobs and require the merged-SHA deployment and
  anonymous guards to pass; do not bypass the database identity check.

## Candidate safeguards

`wrangler.production-app.json` names a separate Worker and has no D1 binding or secrets.
Account sync is false by default. `cloudflare/src/production-app.mjs` rejects normal
requests until origin, Google secrets, account storage, explicit sync and assets are configured.
`/health` is liveness only; `/ready` must return 200 with `configurationReady=true`
before the service is treated as configured. This does not replace a release decision or UAT.

The production wrapper forces both market-provider flags false even if dashboard variables
are changed accidentally. The legacy quote gateway route is not exposed by this Worker.
The configuration builder rejects the Preview database fingerprint and requires a separate
`smarttrade-ai-production-accounts-*` database. Private generated config is ignored by Git.

## Steps after CI is repaired

1. Build and test the approved candidate with `npm run build:production-app` and
   `npm run test:production-app`. Run Wrangler dry-run against the separate production config.
2. Provision a new production-only D1 database, apply the reviewed portfolio schema and
   record its identifier privately. Do not bind or copy the Preview database.
3. Generate `wrangler.production-app.generated.json` with reviewed
   `SMARTTRADE_PRODUCTION_D1_ID`, `SMARTTRADE_PRODUCTION_D1_NAME` and
   `SMARTTRADE_PRODUCTION_SYNC_ENABLED`. Sync defaults false.
4. Configure Google OAuth for the new app. The exact authorized redirect URI is:
   `https://smarttrade-ai-app.goshen-r.workers.dev/auth/google/callback`.
   This requires access to the owner's Google Cloud OAuth configuration.
5. Provision runtime secrets for the new Worker: `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_ALLOWED_EMAIL` and a freshly generated independent
   `GOOGLE_SESSION_SECRET` (at least 32 random bytes). Do not request secret values in chat.
   Preview runtime secret values are not available through the current tooling for copying.
6. Establish the owner-operated encrypted backup/retention and incident procedure for
   persistent production data. The Preview synthetic restore drill is evidence of a
   mechanism, not an unattended production backup policy.
7. Only after missing credentials/CI and configuration gates are closed, deploy the
   approved separate app, explicitly enable its own account sync and require `/ready`,
   real Google login/logout, save/reload and rollback acceptance for that environment.

No production provisioning or deployment was performed while preparing this candidate.
The prepared callback/config and tests are reviewable before any environment changes.
