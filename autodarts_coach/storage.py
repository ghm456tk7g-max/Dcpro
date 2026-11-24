"""Lokale Historie der eingetragenen Sessions in SQLite (Datei liegt neben der .exe)."""

import json
import sqlite3
import time

from .paths import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at REAL NOT NULL,
    session_date TEXT NOT NULL,
    mode TEXT,
    entry TEXT NOT NULL,
    metrics TEXT NOT NULL,
    notes TEXT,
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

    def add(self, session_date: str, mode: str, entry: dict, metrics: dict, notes: str) -> int:
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO sessions (created_at, session_date, mode, entry, metrics, notes) VALUES (?,?,?,?,?,?)",
                (time.time(), session_date, mode, json.dumps(entry), json.dumps(metrics), notes))
            return cur.lastrowid

    def update(self, sid: int, session_date: str, mode: str, entry: dict, metrics: dict, notes: str) -> None:
        with self._conn() as c:
            c.execute("UPDATE sessions SET session_date=?, mode=?, entry=?, metrics=?, notes=?, coach_text=NULL "
                      "WHERE id=?", (session_date, mode, json.dumps(entry), json.dumps(metrics), notes, sid))

    def set_coach_text(self, sid: int, text: str) -> None:
        with self._conn() as c:
            c.execute("UPDATE sessions SET coach_text=? WHERE id=?", (text, sid))

    def delete(self, sid: int) -> None:
        with self._conn() as c:
            c.execute("DELETE FROM sessions WHERE id=?", (sid,))

    def list(self) -> list[dict]:
        """Alle Sessions, neueste zuerst (nach Session-Datum, dann Eingabezeit)."""
        with self._conn() as c:
            rows = c.execute("SELECT id, created_at, session_date, mode, entry, metrics, notes, coach_text "
                             "FROM sessions ORDER BY session_date DESC, id DESC").fetchall()
        return [{"id": r[0], "created_at": r[1], "date": r[2], "mode": r[3] or "", "entry": json.loads(r[4]),
                 "metrics": json.loads(r[5]), "notes": r[6] or "", "coach_text": r[7]} for r in rows]
