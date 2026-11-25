import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path

class Store:
    def __init__(self, path):
        self.path=Path(path);self.path.parent.mkdir(parents=True,exist_ok=True)
        with closing(self.connect()) as connection, connection:
            connection.executescript('''
                CREATE TABLE IF NOT EXISTS datasets(symbol TEXT PRIMARY KEY, payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS analyses(
                    id INTEGER PRIMARY KEY, symbol TEXT NOT NULL, data_date TEXT NOT NULL,
                    fetched_at TEXT NOT NULL, score REAL, source TEXT NOT NULL,
                    data_hash TEXT NOT NULL, engine TEXT NOT NULL, payload TEXT NOT NULL,
                    UNIQUE(symbol,data_hash,engine));
                CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS fundamentals(symbol TEXT PRIMARY KEY,payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS fundamental_history(
                    id INTEGER PRIMARY KEY,symbol TEXT NOT NULL,fetched_at TEXT NOT NULL,
                    data_hash TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(symbol,data_hash));
            ''')
    def connect(self):
        return sqlite3.connect(self.path,timeout=10)
    def save(self, analysis):
        digest=hashlib.sha256(json.dumps({'bars':analysis['bars'],'source':analysis['source'],'basis':analysis['priceBasis']},sort_keys=True,allow_nan=False).encode()).hexdigest()
        encoded=json.dumps(analysis,ensure_ascii=False,allow_nan=False)
        with closing(self.connect()) as connection, connection:
            connection.execute('INSERT OR IGNORE INTO analyses(symbol,data_date,fetched_at,score,source,data_hash,engine,payload) VALUES(?,?,?,?,?,?,?,?)',
                (analysis['symbol'],analysis['dataDate'],analysis['fetchedAt'],analysis['score'],analysis['source'],digest,analysis['engineVersion'],encoded))
            row=connection.execute('SELECT id FROM analyses WHERE symbol=? AND data_hash=? AND engine=?',(analysis['symbol'],digest,analysis['engineVersion'])).fetchone()
            analysis={**analysis,'analysisId':row[0]}
            connection.execute('INSERT OR REPLACE INTO datasets(symbol,payload) VALUES(?,?)',(analysis['symbol'],json.dumps(analysis,ensure_ascii=False,allow_nan=False)))
            connection.execute('DELETE FROM analyses WHERE symbol=? AND id NOT IN(SELECT id FROM analyses WHERE symbol=? ORDER BY id DESC LIMIT 30)',(analysis['symbol'],analysis['symbol']))
        return analysis
    def latest(self, symbol):
        with closing(self.connect()) as connection:
            row=connection.execute('SELECT payload FROM datasets WHERE symbol=?',(symbol,)).fetchone()
        return json.loads(row[0]) if row else None
    def history(self, symbol):
        with closing(self.connect()) as connection:
            rows=connection.execute('SELECT id,symbol,data_date,fetched_at,score,source FROM analyses WHERE symbol=? ORDER BY id DESC LIMIT 30',(symbol,)).fetchall()
        return [dict(zip(('id','symbol','dataDate','fetchedAt','score','source'),row)) for row in rows]
    def snapshot(self, identifier):
        with closing(self.connect()) as connection:
            row=connection.execute('SELECT payload FROM analyses WHERE id=?',(identifier,)).fetchone()
        return {**json.loads(row[0]),'analysisId':identifier} if row else None
    def comparison(self):
        with closing(self.connect()) as connection:
            rows=connection.execute('SELECT payload FROM datasets').fetchall()
        values=[json.loads(row[0]) for row in rows]
        return sorted([{'symbol':item['symbol'],'name':item['name'],'score':item['score'],'dataDate':item['dataDate'],'source':item['source']} for item in values],key=lambda row:row['score'] if row['score'] is not None else -1,reverse=True)
    def setting(self,key,value=None):
        with closing(self.connect()) as connection, connection:
            if value is not None:
                connection.execute('INSERT OR REPLACE INTO settings(key,payload) VALUES(?,?)',(key,json.dumps(value,ensure_ascii=False,allow_nan=False)))
                return value
            row=connection.execute('SELECT payload FROM settings WHERE key=?',(key,)).fetchone()
        return json.loads(row[0]) if row else None
    def financials(self,symbol,value=None):
        with closing(self.connect()) as connection, connection:
            if value is not None:
                encoded=json.dumps(value,ensure_ascii=False,allow_nan=False)
                stable={key:item for key,item in value.items() if key!='fetchedAt'}
                digest=hashlib.sha256(json.dumps(stable,sort_keys=True,allow_nan=False).encode()).hexdigest()
                connection.execute('INSERT OR REPLACE INTO fundamentals(symbol,payload) VALUES(?,?)',(symbol,encoded))
                connection.execute('INSERT OR IGNORE INTO fundamental_history(symbol,fetched_at,data_hash,payload) VALUES(?,?,?,?)',(symbol,value['fetchedAt'],digest,encoded))
                connection.execute('DELETE FROM fundamental_history WHERE symbol=? AND id NOT IN(SELECT id FROM fundamental_history WHERE symbol=? ORDER BY id DESC LIMIT 30)',(symbol,symbol))
                return value
            row=connection.execute('SELECT payload FROM fundamentals WHERE symbol=?',(symbol,)).fetchone()
        return json.loads(row[0]) if row else None
