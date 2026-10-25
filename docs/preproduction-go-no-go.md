# SmartTrade AI — pre-production Go/No-Go

**Current decision: NO-GO.** This is a checklist, not evidence that all items passed.

## Automated evidence (Preview test branch)
- [x] Paper-trading browser smoke: buy, sell, persistence, equity cap, rejected sale.
- [x] Unauthenticated market status and quote endpoints reject access.
- [x] Bounded read-only API resilience check.
- [x] Machine-readable readiness report uploaded as GitHub Actions artifact.
- [x] Preview Health check and CI decision tests.
- [x] PR #2 merged to Preview; Preview deployment verified.
- [ ] Event-driven result controller demonstrated from an actual completed upstream workflow (workflow_run must exist on default branch).
- [ ] All critical tests run against deployed Preview, not only local assets.

## Security / functional release gates
- [ ] Google sign-in and sign-out end-to-end with a dedicated test account.
- [ ] Session expiry, cookie attributes, CSRF/state, unauthorized and cross-user access tested.
- [ ] Quota enforcement under concurrency, 429 behavior, provider timeout and budget cap verified.
- [ ] Licensing confirmed before enabling live quotes; live quotes disabled by default.
- [ ] No real broker/order execution or unapproved paid integration.
- [ ] Secret scanning and dependency audit reviewed; no secret values included in reports.
- [ ] Browser verification on mobile and desktop, including failed network and refresh.

## Operational release gates
- [ ] Measured latency and controlled resilience evidence.
- [ ] Documented rollback target, tested rollback in non-production and incident owner.
- [ ] Production environment configuration review, backup/recovery requirements if stateful.
- [ ] Human UAT acceptance and explicit owner Go/No-Go approval.

## Decision protocol
1. All automated checks must pass for the **same commit SHA**.
2. Every blocker must have linked evidence and a reviewer decision.
3. Any failure => NO-GO; do not auto-fix, merge, deploy, change secrets, or enable trading.
4. Only after human UAT and separate explicit production approval may a production change be considered.

**No automatic production deployment is authorized by this document.**

## Verified evidence (2026-10-25)
- SHA `9d82b3f`: Preview Checks, UI Smoke and Preview Deploy succeeded in GitHub Actions.
- Full Google account login and non-production rollback rehearsal remain unverified.
- Cloudflare Production build failures require independent log review.
- Decision: NO-GO until these blockers and human UAT are closed.
