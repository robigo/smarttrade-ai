import unittest
from datetime import datetime, timedelta
from urllib.error import HTTPError

from cloud_analyzer.refresh import ResearchRefresh, market_status, research_row
from cloud_analyzer.refresh_budget import reserve
from cloud_analyzer.refresh_view import render_refresh_status


def utc(value):
    return datetime.fromisoformat(value + "+00:00")


FRIDAY = utc("2026-11-27T18:30:00")
HOLIDAY = utc("2026-11-26T22:00:00")
OLD = {"dataDate": "2026-11-25", "fetchedAt": "2026-11-25T22:00:00+00:00",
       "source": "<synthetic>", "score": 50}


class FakeStore:
    def __init__(self):
        self.snapshots = {"NVDA": OLD.copy()}
        self.state = {}

    def research_status(self):
        return self.snapshots, self.state

    def reserve_research_request(self, expected, now, symbols):
        return reserve(self.state, self.snapshots, expected, now, symbols)

    def finish_research_request(self, symbol, started, finished, status, *, analysis=None, cooldown=None):
        self.state["attempts"][symbol].update(status=status, finishedAt=finished.isoformat())
        if cooldown:
            self.state["cooldown"] = cooldown.timestamp()
        if analysis:
            self.snapshots[symbol] = analysis
        return status


class ResearchRefreshTests(unittest.TestCase):
    def test_thanksgiving_and_weekend(self):
        market = market_status(HOLIDAY)
        self.assertEqual(market["market"], "closed_day")
        self.assertEqual(research_row("NVDA", OLD, None, market)["freshness"], "current")
        self.assertEqual(market_status(utc("2026-11-29T20:00:00"))["expectedSession"], "2026-11-27")

    def test_early_close_and_grace(self):
        self.assertEqual(market_status(FRIDAY - timedelta(minutes=31))["market"], "open")
        waiting = market_status(FRIDAY - timedelta(seconds=1))
        self.assertEqual(waiting["lastSession"], "2026-11-27")
        self.assertEqual(waiting["expectedSession"], "2026-11-25")
        self.assertEqual(market_status(FRIDAY)["expectedSession"], "2026-11-27")

    def test_dst_regular_close_and_calendar_bounds(self):
        self.assertEqual(market_status(utc("2026-07-06T20:30:00"))["expectedSession"], "2026-07-06")
        self.assertEqual(market_status(utc("2027-01-04T22:00:00"))["market"], "unknown")

    def test_no_fetch_on_closed_day(self):
        service = ResearchRefresh(FakeStore(), lambda _: self.fail("provider called"), lambda: HOLIDAY)
        self.assertEqual(service.run(), [])

    def test_rate_limit_preserves_snapshot_and_controls_next_run(self):
        store = FakeStore()
        called = []
        def provider(symbol):
            called.append(symbol)
            raise HTTPError(None, 429, "Limited", {"Retry-After": "120"}, None)

        service = ResearchRefresh(store, provider, lambda: FRIDAY)
        self.assertEqual(service.run(), [])
        self.assertEqual(service.run(), [])
        self.assertEqual(called, ["NVDA"])
        row = next(row for row in service.status() if row["symbol"] == "NVDA")
        self.assertEqual(row["fetchedAt"], OLD["fetchedAt"])
        self.assertEqual(row["freshness"], "stale")
        self.assertIsNone(row["score"])
        self.assertEqual(row["attempt"]["status"], "rate_limited")
        self.assertEqual(store.state["cooldown"], FRIDAY.timestamp() + 120)

    def test_bounded_updates_use_validated_daily_data(self):
        store = FakeStore()
        def provider(symbol):
            bars = [{"date": day, "open": 10, "high": 11, "low": 9, "close": 10, "volume": 12}
                    for day in ("2026-11-25", "2026-11-27")]
            return {"symbol": symbol, "dataDate": "2026-11-27", "bars": bars,
                    "source": "synthetic", "priceBasis": "synthetic"}

        service = ResearchRefresh(store, provider, lambda: FRIDAY)
        self.assertEqual(len(service.run()), 4)
        self.assertEqual(len(service.run()), 4)
        self.assertEqual(service.run(), [])
        self.assertEqual(store.snapshots["NVDA"]["fetchedAt"], FRIDAY.isoformat())
        self.assertEqual(store.state["attempts"]["NVDA"]["status"], "updated")

    def test_outdated_provider_data_rejected(self):
        store = FakeStore()
        service = ResearchRefresh(store, lambda symbol: {**OLD, "symbol": symbol}, lambda: FRIDAY)
        self.assertEqual(service.run(), [])
        self.assertEqual(store.snapshots["NVDA"], OLD)
        self.assertEqual(store.state["attempts"]["NVDA"]["status"], "session_mismatch")

    def test_daily_budget_and_symbol_reservation(self):
        state = {}
        self.assertEqual(reserve(state, {}, "2026-11-27", FRIDAY, ["NVDA"]), "NVDA")
        self.assertIsNone(reserve(state, {}, "2026-11-27", FRIDAY, ["NVDA"]))
        state["requests"] = [["2026-11-27", FRIDAY.timestamp() - 120]] * 40
        self.assertIsNone(reserve(state, {}, "2026-11-27", FRIDAY, ["AAPL"]))

    def test_dashboard_shows_escaped_source_and_distinct_statuses(self):
        row = research_row("NVDA", OLD, {"status": "failed"}, market_status(FRIDAY))
        html = render_refresh_status([row])
        for expected in ("2026-11-27", "2026-11-25", "26/11/2026 00:00", "נתונים ישנים",
                         "העדכון נכשל", "&lt;synthetic&gt;"):
            self.assertIn(expected, html)
        self.assertNotIn("<synthetic>", html)
