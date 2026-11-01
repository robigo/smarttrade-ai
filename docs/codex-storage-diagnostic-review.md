# Codex Budget Storage Diagnostic — review-only proposal

Related: #3. Target branch: `preview/cloudflare-unified-v09`.

**This document is not an executable workflow, does not call Cloudflare, and must not be used to bypass the previously blocked workflow edit.** No changes to the existing `preview-deploy.yml` are proposed for automatic application.

## Verified baseline
- Existing `github_oidc_signature_probe` verifies GitHub OIDC and `/internal/budget/ping`.
- Existing `/internal/budget/storage-diagnostic` requires a verified read-only GitHub OIDC token and a private Durable Object binding.
- `checkStoragePersistence` writes only to `diagnostic:persistence:v1`; it does not initialize or update the budget ledger.
- Existing workflow logs establish a successful authenticated ping, **not** persistence of diagnostic storage.

## Proposed acceptance test — requires security review before implementation
1. Obtain a short-lived GitHub OIDC token with audience `smarttrade-codex-budget` from the approved preview push workflow. Do not print or persist it.
2. Confirm anonymous `POST /internal/budget/storage-diagnostic` returns 401.
3. Make an authenticated `POST /internal/budget/storage-diagnostic`; require HTTP 200, `authenticated: true`, `storageVerified: true`, `budgetReservationsEnabled: false`, and a positive integer `probeSequence`.
4. Make a second authenticated request with a newly issued token; require the same checks and `second.probeSequence > first.probeSequence`.
5. Check the public `/reserve` route still returns 404.
6. Report status codes, booleans, and whether the sequence increased. Never log JWTs, API keys, internal bearer tokens, or sensitive response bodies.
7. Keep all paid Codex API requests disabled and leave Production untouched.

## Limits of evidence
Two successful requests prove sequence continuity across requests, not necessarily persistence after process restart or durable storage recovery. A separately approved restart/recovery test is needed for that stronger claim.

## Review checklist
- [ ] Confirm the diagnostic endpoint has no access to budget ledger writes.
- [ ] Confirm the caller's exact OIDC claims and minimum permissions.
- [ ] Confirm no new workflow, secret, permissions, production deployment, or paid API use is introduced without approval.
- [ ] Resolve the prior tool safety block through the approved process, **not** by alternate execution.
- [ ] Only then implement and run an authorized live diagnostic, attaching the GitHub Actions run and results to #3.
