# Cloud analyzer candidate — not deployable yet

Separate from local analyzer at eb06bb1. Local files and SQLite are unchanged. Use a dedicated Neon project/database and least-privilege role, never BeautyFlow credentials. CloudStore.initialize is explicit and has not been run. No database is provisioned. No automatic migration or deployment.

Next gates: PostgreSQL integration and parity tests; separate authenticated HTTPS server entrypoint with origin validation, request limits and private access; mobile browser tests; provider availability and cost review. Do not expose the local HTTP server publicly. Preserve existing UI and calculation code. Data refresh discrepancy monitoring (15/30 minutes and >3% escalation) is a separate pending requirement. No paid market API.
