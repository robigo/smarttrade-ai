# Production account backup and recovery

Scope: account portfolios in the existing `smarttrade-ai` production Worker's
`PORTFOLIO_DB`. No deployment, market calls, live restore, or data deletion is
performed by these commands. Google credentials and other runtime secrets are not
exported. This is an account-data backup, not an export of the whole Cloudflare account.

## Capture and verify

Requirements: Windows, Node 22.13+ (or Node 24), the current Windows user's DPAPI
profile, and Cloudflare credentials in `CLOUDFLARE_ACCOUNT_ID` and
`CLOUDFLARE_API_TOKEN`. Supply credentials without printing them or committing them.

Run `npm.cmd run backup:production` from this repository. The tool:

1. Reads the existing production Worker binding and verifies the database fingerprint
   against `deployment/production-accounts.json` before retrieving account data.
2. Captures portfolio identities, versions and ledger JSON with a single read-only
   SELECT. It never logs account identifiers or portfolio contents.
3. Encrypts the records in memory using a fresh AES-256-GCM key. The key is wrapped
   with Windows DPAPI CurrentUser. Source identity, schema hash, time and record count
   are authenticated; tampered archives fail authentication.
4. Writes only an encrypted archive and a sanitized verification report under
   `../artifacts/private-production-backups/` (ignored, outside the source repository).
   `SMARTTRADE_BACKUP_DIR` may explicitly select another operator-managed destination.
5. Rereads the stored archive, unwraps/decrypts it, and inserts recovered records into
   an isolated in-memory SQLite database using the reviewed local migration. Exact
   identities, versions and JSON are compared. No live database writes occur.

Verify a saved archive in a separate process, without Cloudflare access:

```powershell
npm.cmd run backup:verify -- "C:\path\to\backup.encrypted.json"
```

This command does not display decrypted account data or write a plaintext file.
The original matching schema must be retained when the application schema changes.
Archives are versioned and never overwritten or automatically deleted. A failed
capture/verification must be investigated; do not delete the last verified archive.

## Recovery limits and independent history

The encrypted archive requires this Windows user's DPAPI keys. Copying the archive
alone to a new machine or losing the Windows profile is **not** a portable disaster
recovery solution. Preserve the Windows recovery material securely. No independent
key escrow, external backup destination, long-term retention policy or recurring
local backup job has been configured by this rollout. The first archive is protected
on disk; its availability still depends on the operator's machine/profile and storage.

Cloudflare D1 Time Travel is an independent, automatically maintained recovery path.
The current production bookmark was retrieved read-only on 2026-10-29. Cloudflare
documents retention of 7 days on Free or 30 days on Paid; this run did not assume
the account plan or upgrade it. See [Cloudflare Time Travel documentation](https://developers.cloudflare.com/d1/reference/time-travel/).

## Production incident procedure

1. Record the incident, last good time, current Worker version and current Time
   Travel bookmark. Preserve recent encrypted account archives and operator reports.
2. Confirm the affected database matches the reviewed production fingerprint.
3. Verify an archive with the offline command above. This proves local SQLite
   recovery; it does not claim a restore into remote D1 or live Google acceptance.
4. Choose a recovery point and account for valid writes made after that point.
   Obtain explicit incident approval before any operation that overwrites production.
5. Cloudflare Time Travel restores overwrite the live database and cancel in-flight
   queries. Schedule the interruption, quiesce account writes and prepare an undo
   bookmark before executing a reviewed restore. Do not experiment on live data.
6. After an approved restore, verify account isolation and saved portfolio state,
   then resume writes and record the result. Keep the pre-restore recovery evidence.

No live restore has been performed. The current account records remain unchanged.
