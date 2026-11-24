"""Datei-Pfade: Alles liegt neben der .exe (bzw. neben main.py beim Entwickeln)."""

import os
import sys


def app_dir() -> str:
    if getattr(sys, "frozen", False):
        base = os.path.dirname(os.path.abspath(sys.executable))
    else:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    data = os.path.join(base, "AutodartsCoach_Daten")
    try:
        os.makedirs(data, exist_ok=True)
        probe = os.path.join(data, ".write_test")
        with open(probe, "w", encoding="utf-8") as f:
            f.write("ok")
        os.remove(probe)
        return data
    except OSError:
        # Fallback, falls der Ordner der .exe schreibgeschützt ist (z.B. Programme)
        fallback = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "AutodartsCoach")
        os.makedirs(fallback, exist_ok=True)
        return fallback


DATA_DIR = app_dir()
DB_PATH = os.path.join(DATA_DIR, "historie.sqlite3")
SETTINGS_PATH = os.path.join(DATA_DIR, "einstellungen.json")
LOG_PATH = os.path.join(DATA_DIR, "log.txt")
