"""End-of-day refresh for the separate US equity research candidate."""
from datetime import date, datetime, time, timedelta, timezone
from urllib.error import HTTPError
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

from local_analyzer.indicators import analyze
from local_analyzer.market_data import DataError, SYMBOLS, fetch_yahoo, validate_bars

NEW_YORK = ZoneInfo("America/New_York")
GRACE = timedelta(minutes=30)
# Shared 2026 NYSE and Nasdaq regular equity schedules.
HOLIDAYS = {date.fromisoformat(f"2026-{day}") for day in (
    "01-01", "01-19", "02-16", "04-03", "05-25", "06-19",
    "07-03", "09-07", "11-26", "12-25",
)}
EARLY_CLOSES = {date(2026, 11, 27), date(2026, 12, 24)}


def close_at(day):
    if day.weekday() >= 5 or day in HOLIDAYS:
        return None
    return datetime.combine(day, time(13 if day in EARLY_CLOSES else 16), NEW_YORK)


def market_status(now):
    now = now.astimezone(NEW_YORK)
    day = now.date()
    unknown = {"market": "unknown", "lastSession": None, "expectedSession": None}
    if day.year != 2026:
        return unknown
    close = close_at(day)
    market = "closed_day"
    if close:
        opened = datetime.combine(day, time(9, 30), NEW_YORK)
        market = "before_open" if now < opened else "open" if now < close else "after_close"

    def latest(delay):
        for offset in range(8):
            candidate = day - timedelta(days=offset)
            if candidate.year != 2026:
                return None
            end = close_at(candidate)
            if end and end + delay <= now:
                return candidate.isoformat()
        return None

    return {"market": market, "lastSession": latest(timedelta()), "expectedSession": latest(GRACE)}


def research_row(symbol, snapshot, attempt, market):
    snapshot = snapshot or {}
    actual, expected = snapshot.get("dataDate"), market["expectedSession"]
    if not actual:
        freshness = "missing"
    elif not expected or actual > expected:
        freshness = "unverified"
    else:
        freshness = "current" if actual == expected else "stale"
    return {
        "symbol": symbol, **market, "freshness": freshness,
        "dataDate": actual, "fetchedAt": snapshot.get("fetchedAt"),
        "source": snapshot.get("source"), "attempt": attempt,
        "score": snapshot.get("score") if freshness == "current" else None,
    }


def retry_after(error, now):
    header = error.headers.get("Retry-After") if error.headers else None
    try:
        return now + timedelta(seconds=max(1, int(header)))
    except (TypeError, ValueError, OverflowError):
        try:
            return max(now + timedelta(seconds=1), parsedate_to_datetime(header))
        except (TypeError, ValueError, OverflowError):
            return now + GRACE


class ResearchRefresh:
    """Manual and scheduled invocations share the same bounded refresh path."""

    def __init__(self, store, provider=fetch_yahoo, clock=None):
        self.store = store
        self.provider = provider
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def status(self):
        market = market_status(self.clock())
        snapshots, state = self.store.research_status()
        attempts = state.get("attempts", {})
        rows = [research_row(symbol, snapshots.get(symbol), attempts.get(symbol), market)
                for symbol in SYMBOLS]
        return sorted(rows, key=lambda row: (row["score"] is None, -(row["score"] or 0)))

    def run(self):
        updated = []
        for _ in range(4):
            now = self.clock()
            market = market_status(now)
            expected = market["expectedSession"]
            # Retry on the trading date after publication, even on early-close days.
            if market["market"] != "after_close" or expected != now.astimezone(NEW_YORK).date().isoformat():
                break
            symbol = self.store.reserve_research_request(expected, now, SYMBOLS)
            if not symbol:
                break
            try:
                candidate = self.provider(symbol)
                finished = self.clock()
                if candidate.get("symbol") != symbol:
                    raise DataError("Unexpected symbol")
                if candidate.get("dataDate") != expected:
                    self.store.finish_research_request(symbol, now, finished, "session_mismatch")
                    continue
                bars = validate_bars(candidate.get("bars"), date.fromisoformat(expected))
                if bars[-1]["date"] != expected:
                    raise DataError("Unexpected last bar")
                analysis = analyze({**candidate, "fetchedAt": finished.isoformat()})
            except (DataError, HTTPError, OSError, TimeoutError) as error:
                finished = self.clock()
                http_error = error if isinstance(error, HTTPError) else error.__context__
                limited = isinstance(http_error, HTTPError) and http_error.code == 429
                cooldown = retry_after(http_error, finished) if limited else None
                self.store.finish_research_request(
                    symbol, now, finished, "rate_limited" if limited else "failed", cooldown=cooldown
                )
                if limited:
                    break
                continue
            if self.store.finish_research_request(symbol, now, finished, "updated", analysis=analysis) == "updated":
                updated.append(symbol)
        return updated
