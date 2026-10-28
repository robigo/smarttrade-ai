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

## Preview-first release procedure (RC is not a gate)

The isolated `smarttrade-ai-rc` experiment is **not** a prerequisite for this
release. Its unresolved Google `invalid_client` observation neither proves
nor disproves whether the separately registered Production OAuth client works.
Do not copy RC secrets, session cookies or callback URLs into Production.

**Pre-approval checks (read only):**
1. Pin PR #65's exact SHA; require successful offline unit tests, Browser Smoke,
   deployed Preview API guards, release config check, and Wrangler dry-run.
   An intermittent Preview network check requires a documented retry, not
   suppression of a security assertion.
2. Verify real Google login/logout is still working on the *existing Preview*
   Worker, including an unauthorized session and restricted market endpoints.
   Preview success is evidence for shared code, **not** proof of Production OAuth.
3. Record the currently deployed Production version, its original
   `cloudflare/src/index.js` build command and a rehearsed rollback procedure.
   Review the difference between the legacy private quote gateway and the new
   UI: intentionally dropping the old bearer endpoint is a compatibility change.
4. Review the distinct **Production** Google OAuth client and its callback
   `https://smarttrade-ai.goshen-r.workers.dev/auth/google/callback`.
   Confirm its approved test user and that secrets/session key are different
   from Preview; validate only names and settings, never expose secret values.
5. Record the proposed Worker runtime variable:
   `AUTH_PUBLIC_ORIGIN=https://smarttrade-ai.goshen-r.workers.dev`.
   The current Production Worker has not yet been configured for this candidate.
6. Review Cloudflare Workers Builds: automatic builds remain disabled, and its
   *existing* deployment command points at the legacy `index.js`. The future
   command for this candidate is `npx wrangler deploy --config wrangler.toml`.
   A dry-run alone does not change this dashboard setting.

**Release approval boundary:** Stop here. Obtain explicit approval identifying
the production deployment, exact SHA, changed Worker/Secrets/build settings,
the possibility of quota/billing impact, and the rollback version. Never merge,
deploy, overwrite existing OAuth secrets, change routes, or enable market feeds
merely because CI passes. Avoid creating additional RC Workers.

**Only after approval:** apply reviewed Production-only configuration in a
controlled change window; deploy the exact reviewed SHA with a verified rollback
path. Verify the release version, real Google login and logout, cookie/session
isolation, authenticated and unauthenticated guards, browser/mobile access,
simulation-only behavior, restricted market data, and absence of live trading.
If any gate fails, stop rollout and restore the recorded previous version.
Document the final GO/NO-GO result. This checklist is not evidence of any
successful Production end-to-end authentication.
