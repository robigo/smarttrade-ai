"""Separate PostgreSQL storage candidate; never opens the local SQLite database."""
import hashlib
import json
from datetime import timedelta
import psycopg

from cloud_analyzer.refresh_budget import reserve

def encode(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False)

class CloudStore:
    def __init__(self, dsn):
        if not dsn:
            raise ValueError("A dedicated cloud database URL is required")
        self.dsn = dsn
    def connect(self):
        return psycopg.connect(self.dsn, sslmode="require", connect_timeout=10)
    def initialize(self):
        with self.connect() as c:
            c.execute("CREATE SCHEMA IF NOT EXISTS smarttrade_cloud")
            c.execute("CREATE TABLE IF NOT EXISTS smarttrade_cloud.datasets(symbol TEXT PRIMARY KEY,payload TEXT NOT NULL)")
            c.execute("CREATE TABLE IF NOT EXISTS smarttrade_cloud.analyses(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,symbol TEXT NOT NULL,data_date TEXT NOT NULL,fetched_at TEXT NOT NULL,score DOUBLE PRECISION,source TEXT NOT NULL,data_hash TEXT NOT NULL,engine TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(symbol,data_hash,engine))")
            c.execute("CREATE TABLE IF NOT EXISTS smarttrade_cloud.settings(key TEXT PRIMARY KEY,payload TEXT NOT NULL)")
            c.execute("CREATE TABLE IF NOT EXISTS smarttrade_cloud.fundamentals(symbol TEXT PRIMARY KEY,payload TEXT NOT NULL)")
            c.execute("CREATE TABLE IF NOT EXISTS smarttrade_cloud.fundamental_history(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,symbol TEXT NOT NULL,fetched_at TEXT NOT NULL,data_hash TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(symbol,data_hash))")
    def save(self, analysis):
        with self.connect() as c:
            return self._save(c, analysis)

    def _save(self, c, analysis):
        digest=hashlib.sha256(json.dumps({'bars':analysis['bars'],'source':analysis['source'],'basis':analysis['priceBasis']},sort_keys=True,allow_nan=False).encode()).hexdigest()
        c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ('analysis:'+analysis['symbol'],))
        c.execute("INSERT INTO smarttrade_cloud.analyses(symbol,data_date,fetched_at,score,source,data_hash,engine,payload) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(symbol,data_hash,engine) DO NOTHING",(analysis['symbol'],analysis['dataDate'],analysis['fetchedAt'],analysis['score'],analysis['source'],digest,analysis['engineVersion'],encode(analysis)))
        row=c.execute("SELECT id FROM smarttrade_cloud.analyses WHERE symbol=%s AND data_hash=%s AND engine=%s",(analysis['symbol'],digest,analysis['engineVersion'])).fetchone()
        analysis={**analysis,'analysisId':row[0]}
        c.execute("INSERT INTO smarttrade_cloud.datasets VALUES(%s,%s) ON CONFLICT(symbol) DO UPDATE SET payload=EXCLUDED.payload",(analysis['symbol'],encode(analysis)))
        c.execute("DELETE FROM smarttrade_cloud.analyses WHERE symbol=%s AND id NOT IN(SELECT id FROM smarttrade_cloud.analyses WHERE symbol=%s ORDER BY id DESC LIMIT 30)",(analysis['symbol'],analysis['symbol']))
        return analysis

    def latest(self,symbol):
        with self.connect() as c:
            row=c.execute("SELECT payload FROM smarttrade_cloud.datasets WHERE symbol=%s",(symbol,)).fetchone()
        return json.loads(row[0]) if row else None
    def history(self,symbol):
        with self.connect() as c:
            rows=c.execute("SELECT id,symbol,data_date,fetched_at,score,source FROM smarttrade_cloud.analyses WHERE symbol=%s ORDER BY id DESC LIMIT 30",(symbol,)).fetchall()
        return [dict(zip(('id','symbol','dataDate','fetchedAt','score','source'),row)) for row in rows]
    def snapshot(self,identifier):
        with self.connect() as c:
            row=c.execute("SELECT payload FROM smarttrade_cloud.analyses WHERE id=%s",(identifier,)).fetchone()
        return {**json.loads(row[0]),'analysisId':identifier} if row else None
    def comparison(self):
        with self.connect() as c:
            rows=c.execute("SELECT payload FROM smarttrade_cloud.datasets").fetchall()
        values=[json.loads(row[0]) for row in rows]
        return sorted([{k:item[k] for k in ('symbol','name','score','dataDate','source')} for item in values],key=lambda row:row['score'] if row['score'] is not None else -1,reverse=True)
    def setting(self,key,value=None):
        with self.connect() as c:
            if value is not None:
                c.execute("INSERT INTO smarttrade_cloud.settings VALUES(%s,%s) ON CONFLICT(key) DO UPDATE SET payload=EXCLUDED.payload",(key,encode(value)))
                return value
            row=c.execute("SELECT payload FROM smarttrade_cloud.settings WHERE key=%s",(key,)).fetchone()
        return json.loads(row[0]) if row else None
    def financials(self,symbol,value=None):
        with self.connect() as c:
            if value is not None:
                c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ('financial:'+symbol,))
                stable={k:v for k,v in value.items() if k!='fetchedAt'}
                digest=hashlib.sha256(json.dumps(stable,sort_keys=True,allow_nan=False).encode()).hexdigest()
                c.execute("INSERT INTO smarttrade_cloud.fundamentals VALUES(%s,%s) ON CONFLICT(symbol) DO UPDATE SET payload=EXCLUDED.payload",(symbol,encode(value)))
                c.execute("INSERT INTO smarttrade_cloud.fundamental_history(symbol,fetched_at,data_hash,payload) VALUES(%s,%s,%s,%s) ON CONFLICT(symbol,data_hash) DO NOTHING",(symbol,value['fetchedAt'],digest,encode(value)))
                c.execute("DELETE FROM smarttrade_cloud.fundamental_history WHERE symbol=%s AND id NOT IN(SELECT id FROM smarttrade_cloud.fundamental_history WHERE symbol=%s ORDER BY id DESC LIMIT 30)",(symbol,symbol))
                return value
            row=c.execute("SELECT payload FROM smarttrade_cloud.fundamentals WHERE symbol=%s",(symbol,)).fetchone()
        return json.loads(row[0]) if row else None

    def _research_state(self, c):
        row = c.execute("SELECT payload FROM smarttrade_cloud.settings WHERE key='research-refresh'").fetchone()
        return json.loads(row[0]) if row else {}

    def _write_research_state(self, c, state):
        c.execute(
            "INSERT INTO smarttrade_cloud.settings VALUES('research-refresh',%s) "
            "ON CONFLICT(key) DO UPDATE SET payload=EXCLUDED.payload", (encode(state),)
        )

    def _research_snapshots(self, c):
        rows = c.execute("SELECT symbol, (payload::jsonb - 'bars' - 'indicators' - 'scoreParts')::text FROM smarttrade_cloud.datasets").fetchall()
        return {symbol: json.loads(payload) for symbol, payload in rows}

    def research_status(self):
        with self.connect() as c:
            c.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
            return self._research_snapshots(c), self._research_state(c)

    def reserve_research_request(self, expected, now, symbols):
        with self.connect() as c:
            c.execute("SELECT pg_advisory_xact_lock(hashtext('research-refresh'))")
            state = self._research_state(c)
            symbol = reserve(state, self._research_snapshots(c), expected, now, symbols)
            if symbol:
                self._write_research_state(c, state)
            return symbol

    def finish_research_request(self, symbol, started, finished, status, *, analysis=None, cooldown=None):
        with self.connect() as c:
            c.execute("SELECT pg_advisory_xact_lock(hashtext('research-refresh'))")
            state = self._research_state(c)
            attempt = state["attempts"][symbol]
            if cooldown:
                state["cooldown"] = max(state.get("cooldown", 0), cooldown.timestamp())
            if attempt["startedAt"] != started.isoformat():
                status = "superseded"
            else:
                if analysis:
                    c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ('analysis:'+symbol,))
                    row = c.execute(
                        "SELECT payload FROM smarttrade_cloud.datasets WHERE symbol=%s", (symbol,)
                    ).fetchone()
                    previous = json.loads(row[0]) if row else None
                    if previous and previous["dataDate"] > analysis["dataDate"]:
                        status = "superseded"
                    else:
                        self._save(c, analysis)
                attempt.update(status=status, finishedAt=finished.isoformat(),
                               retryAfter=(finished + timedelta(minutes=2)).timestamp())
            self._write_research_state(c, state)
            return status
