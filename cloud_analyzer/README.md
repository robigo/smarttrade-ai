# Cloud analyzer candidate — not deployable yet

Separate from local analyzer at eb06bb1. Local files and SQLite are unchanged. Use a dedicated Neon project/database and least-privilege role, never BeautyFlow credentials. CloudStore.initialize is explicit and has not been run. No database is provisioned. No automatic migration or deployment.

Next gates: PostgreSQL integration and parity tests; separate authenticated HTTPS server entrypoint with origin validation, request limits and private access; mobile browser tests; provider availability and cost review. Do not expose the local HTTP server publicly. Preserve existing UI and calculation code. Data refresh discrepancy monitoring (15/30 minutes and >3% escalation) is a separate pending requirement. No paid market API.

## Research end-of-day refresh

Use `ResearchRefresh(CloudStore(dsn)).status()` and `render_refresh_status(rows)`
in the authenticated cloud research host. The fragment reads cached status only.
The production Worker and local analyzer have separate entry points.

Invoke `ResearchRefresh.run()` from a trusted internal job or authenticated,
CSRF-protected manual handler. Both use one reservation ledger in the existing
cloud settings table. Reservations commit before fetches. Publication and the
successful attempt status commit together. Four requests per invocation, eight
per rolling minute and forty per session are candidate limits. A provider 429
records a shared cooldown from Retry-After, with a thirty-minute fallback.
Concurrent requests already in flight may complete. Failed refreshes preserve
the existing date and timestamp. Score display excludes stale and unverified
prices.

The 2026 calendar covers regular US equity trading, including Thanksgiving and
the November 27 and December 24 early closes. Sources:
https://www.nyse.com/trade/hours-calendars and
https://www.nasdaqtrader.com/trader.aspx?id=calendar . Times use America/New_York
and Asia/Jerusalem. Add verified future calendar coverage before operating in
2027. Refresh is eligible after the thirty-minute post-close window through
midnight New York time. A potential scheduler can invoke every fifteen minutes
during that window with the calendar gate above. Configure any scheduler only
after validating provider quotas, database transactions and the authenticated
host. The Cloudflare Worker would need a separately approved private integration
with this Python service. No schedule or hosting configuration is included.

Synthetic tests: `python3 -m unittest discover -s cloud_analyzer/tests -v`.
