"""Lokale Historie in SQLite (Datei liegt neben der .exe)."""

import json
import sqlite3
import time
import zlib

from .paths import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at REAL NOT NULL,
    metrics TEXT NOT NULL,
    matches TEXT NOT NULL,
    raw BLOB,
    coach_text TEXT
);
"""


class Storage:
    def __init__(self, path: str = DB_PATH):
        self.path = path
        with self._conn() as c:
            c.executescript(SCHEMA)

    def _conn(self):
        return sqlite3.connect(self.path)

    def add_snapshot(self, metrics: dict, matches: list, raw: dict) -> int:
        blob = zlib.compress(json.dumps(raw, ensure_ascii=False, default=str).encode("utf-8"))
        with self._conn() as c:
            cur = c.execute("INSERT INTO snapshots (created_at, metrics, matches, raw) VALUES (?,?,?,?)",
                            (time.time(), json.dumps(metrics), json.dumps(matches, default=str), blob))
            return cur.lastrowid

    def set_coach_text(self, snap_id: int, text: str) -> None:
        with self._conn() as c:
            c.execute("UPDATE snapshots SET coach_text=? WHERE id=?", (text, snap_id))

    def list_snapshots(self, limit: int = 200) -> list[dict]:
        with self._conn() as c:
            rows = c.execute("SELECT id, created_at, metrics, matches, coach_text FROM snapshots "
                             "ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        return [{"id": r[0], "created_at": r[1], "metrics": json.loads(r[2]),
                 "matches": json.loads(r[3]), "coach_text": r[4]} for r in rows]

    def get_raw(self, snap_id: int) -> dict | None:
        with self._conn() as c:
            row = c.execute("SELECT raw FROM snapshots WHERE id=?", (snap_id,)).fetchone()
        if not row or row[0] is None:
            return None
        return json.loads(zlib.decompress(row[0]).decode("utf-8"))

    def delete_snapshot(self, snap_id: int) -> None:
        with self._conn() as c:
            c.execute("DELETE FROM snapshots WHERE id=?", (snap_id,))
