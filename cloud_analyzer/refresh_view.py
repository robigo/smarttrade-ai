"""Hebrew dashboard fragment for an authenticated research host."""
from datetime import datetime
from html import escape
from zoneinfo import ZoneInfo

MARKET = {
    "closed_day": "אין מסחר היום", "before_open": "לפני פתיחת המסחר",
    "open": "המסחר פתוח", "after_close": "המסחר הסתיים", "unknown": "לוח מסחר לא זמין",
}
FRESHNESS = {
    "current": "עדכני", "stale": "נתונים ישנים", "missing": "אין נתונים",
    "unverified": "לא ניתן לאמת טריות",
}
ATTEMPT = {
    "in_progress": "התחיל ניסיון עדכון", "updated": "עודכן", "failed": "העדכון נכשל",
    "session_mismatch": "הספק טרם סיפק את יום המסחר הצפוי",
    "rate_limited": "הספק הגביל בקשות", "superseded": "קיים עותק חדש יותר",
}


def israel_time(value):
    if not value:
        return "—"
    try:
        instant = datetime.fromisoformat(value)
        if instant.tzinfo is None:
            return "—"
        return instant.astimezone(ZoneInfo("Asia/Jerusalem")).strftime("%d/%m/%Y %H:%M")
    except (TypeError, ValueError, OverflowError):
        return "—"


def render_refresh_status(rows):
    """Render only cached rows; usable in the existing authenticated page layout."""
    if not rows:
        return '<p lang="he" dir="rtl">אין סימולים להצגה</p>'
    market = rows[0]
    cells = []
    for row in rows:
        attempt = row["attempt"] or {}
        status = ATTEMPT.get(attempt.get("status"), "טרם בוצע עדכון")
        stamp = israel_time(attempt.get("finishedAt") or attempt.get("startedAt"))
        values = (
            row["symbol"], row["source"], row["dataDate"], israel_time(row["fetchedAt"]),
            FRESHNESS[row["freshness"]], f"{status} · {stamp}", row["score"],
        )
        symbol, *details = [escape(str(value) if value is not None else "—") for value in values]
        cells.append(f'<tr><th scope="row">{symbol}</th>' +
                     "".join(f"<td>{value}</td>" for value in details) + "</tr>")
    columns = ("סימול", "מקור המחיר", "יום המסחר של המחיר", "שליפה מוצלחת",
               "טריות", "ניסיון עדכון אחרון", "ציון עדכני")
    headings = "".join(f'<th scope="col">{label}</th>' for label in columns)
    last = escape(market["lastSession"] or "—")
    expected = escape(market["expectedSession"] or "—")
    return (
        '<section lang="he" dir="rtl"><h2>עדכניות נתוני סוף יום</h2>'
        f'<p>{MARKET[market["market"]]} · יום המסחר האחרון שהסתיים <bdi>{last}</bdi>'
        f' · יום מסחר צפוי במטמון <bdi>{expected}</bdi></p>'
        '<div style="overflow:auto" tabindex="0" role="region" aria-label="טריות לפי סימול">'
        '<table><caption>נתוני סוף יום · שעות בשעון ישראל</caption>'
        f'<thead><tr>{headings}</tr></thead><tbody>{"".join(cells)}</tbody></table></div></section>'
    )
