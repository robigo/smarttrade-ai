# Production candidate configuration — NOT DEPLOYED / NO-GO

This change prepares a reviewable candidate. It does not authorize a merge,
Production deployment, Google configuration change, D1 resource, or market-data activation.

- `wrangler.toml` targets `smarttrade-ai`, with the existing public workers.dev URL enabled, preview URLs disabled, and no custom route configured. It bundles the same UI and market/auth handlers as Preview through `production.js`. The legacy bearer `/api/quote` is not exposed.
- `wrangler.preview.json` still targets only `smarttrade-ai-preview`; no Preview resources or secrets are copied to Production.
- Production requires a reviewed HTTPS `AUTH_PUBLIC_ORIGIN` with no trailing slash, path, query, fragment or credentials. Requests must match this origin; the Preview origin is forbidden as a Production origin. Missing configuration fails closed. Preview retains its existing origin as a compatibility default.
- Register that origin plus `/auth/google/callback` in a separate reviewed Google OAuth configuration. Use separate Google credentials and `GOOGLE_SESSION_SECRET`; retain the single-user `GOOGLE_ALLOWED_EMAIL` restriction. Do not reuse a Preview session secret.
- Market display and quota readiness remain `false`; no provider key is needed for the simulation-only candidate. The dormant quota binding is scoped to the separately named Worker. Any future enabling must review account-wide quota use across environments before provisioning keys.
- The former scheduled Twelve Data check becomes a manual anonymous access guard with no key or direct provider call. The active schedule is unchanged until the PR is merged to the default branch.
- D1 remains absent and disabled. The post-PR-59 D1 work on Preview is not included in this main-based patch.
- Preview deploys stamp `RELEASE_SHA`; health checks require it to match the workflow SHA. A browser simulation runs against deployed Preview after auth guards, checks SHA before and after, and gates agent handoff. It uses fresh local browser state and mocks Google navigation; it does not prove real Google login.

## Validation and remaining release gates

Run `python3 scripts/check-release-config.py`, offline Node regression tests,
and the CI Wrangler dry-run. The dry-run does not apply Durable Object migrations.
Do not deploy to Preview merely to obtain a green check while reviewing this PR.

The intended origin is `https://smarttrade-ai.goshen-r.workers.dev`; set `AUTH_PUBLIC_ORIGIN` only after reviewing the distinct Production OAuth client and callback. Do not hard-code OAuth secrets in the repository.

Cloudflare Workers Builds has a separate Production deploy command currently targeting `cloudflare/src/index.js`. The candidate dry-run uses `wrangler.toml` and does not prove the dashboard deploy command is aligned. Production automatic builds have been disabled by the owner; keep them disabled until the actual release pipeline is reviewed and approved.

Before any Production deployment, record the reviewed domain/route, separate
secrets and Google callback configuration; verify real Google login/logout,
session expiry, cookie/CSRF protections, mobile/desktop UAT and non-production
rollback on the exact candidate SHA. Review Production build logs, the generated
readiness report, and obtain explicit owner deployment approval. The health
endpoint is a liveness signal, not readiness or evidence that these gates passed.
