# Live storage diagnostic: implementation-ready review checklist (not executable)

This is a review artifact for PR #4 / Issue #3. It must not be executed or added to GitHub Actions until the earlier workflow-edit safety block is resolved through an approved process.

## Exact scope
- Repository: robigo/smarttrade-ai
- Source: preview/cloudflare-unified-v09
- Existing workflow: .github/workflows/preview-deploy.yml
- Existing job: github_oidc_signature_probe
- Target: https://smarttrade-codex-budget-sandbox.goshen-r.workers.dev/internal/budget/storage-diagnostic
- Method: POST
- OIDC audience: smarttrade-codex-budget
- Required job permissions: contents:read, id-token:write (already configured)
- No deployment, new secrets, permissions change, budget reservation, production access or paid API use.

## Acceptance cases (after authorized implementation)
| Case | Expected |
| --- | --- |
| Anonymous POST | HTTP 401 |
| Authenticated POST #1 | HTTP 200, authenticated=true, storageVerified=true, budgetReservationsEnabled=false, positive integer probeSequence |
| Authenticated POST #2 with newly minted GitHub OIDC token | HTTP 200, same flags, second probeSequence greater than first |
| Public POST /reserve | HTTP 404 |
| Budget ledger | Unchanged; only diagnostic:persistence:v1 may be written |
| Codex API calls | 0 |

## Review questions
1. Does the existing workflow's OIDC policy authorize only the intended preview push identity? A manually dispatched run may not satisfy event_name=push.
2. Does the deployed sandbox actually contain the diagnostic route and expected Durable Object binding? Code presence alone is not deployment evidence.
3. Is there any possibility that diagnostic responses or logs expose JWTs or internal bearer tokens? Only log status, booleans and sequence comparison.
4. Does the diagnostic namespace remain distinct from budget: and request: keys?
5. Are reservation endpoints still denied at the public gateway and internally while the runner is disabled?
6. Can the test be added via the authorized workflow review process, without bypassing the previous tool safety block?

## Evidence required for closure
Record the exact GitHub Actions run ID and SHA, individual HTTP statuses, authenticated/storageVerified/reservationsEnabled flags, and whether the sequence increased. Two sequential calls demonstrate continuity but **not** recovery after a worker restart. A restart-specific test would need separate approval.

## Current status
Proposal only. No live storage persistence test has been executed or verified.
