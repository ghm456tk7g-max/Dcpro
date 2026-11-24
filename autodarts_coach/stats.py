"""Kennzahlen aus manuell eingetragenen Sessions berechnen und vergleichen."""

from statistics import mean

# key, Label, höher ist besser, Einheit, Toleranz für "gleich geblieben"
METRIC_DEFS = [
    ("average", "3-Dart-Average", True, "", 0.3),
    ("first9", "First-9-Average", True, "", 0.3),
    ("checkout_pct", "Doppelquote / Checkout", True, "%", 0.5),
    ("win_rate", "Gewonnene Legs", True, "%", 1.0),
    ("plus60_per_leg", "60+ pro Leg", True, "", 0.05),
    ("plus100_per_leg", "100+ pro Leg", True, "", 0.03),
    ("plus140_per_leg", "140+ pro Leg", True, "", 0.02),
    ("plus170_per_leg", "170+ pro Leg", True, "", 0.01),
    ("t180_per_leg", "180er pro Leg", True, "", 0.01),
    ("highest_checkout", "Höchster Checkout", True, "", 0.5),
    ("best_leg", "Bestes Leg (Darts)", False, "", 0.5),
    ("bobs27", "Bob's 27 (Punkte)", True, "", 2.0),
    ("atc_darts", "Around the Clock Doubles (Darts)", False, "", 1.0),
    ("jdc", "JDC Challenge (Punkte)", True, "", 5.0),
    ("rc_pct", "Random Checkout Trefferquote", True, "%", 1.0),
]
METRIC_INDEX = {d[0]: d for d in METRIC_DEFS}

# Eingabefelder: key, Label, Bereich (min, max), Hinweis
ENTRY_FIELDS = {
    "match": [
        ("legs_played", "Legs gespielt", (0, 1000), "z. B. 10"),
        ("legs_won", "Legs gewonnen", (0, 1000), ""),
        ("average", "3-Dart-Average", (0, 180), "z. B. 54,3"),
        ("first9", "First-9-Average", (0, 180), ""),
        ("checkout_pct", "Checkout-Quote %", (0, 100), "oder unten Treffer/Darts"),
        ("doubles_hit", "Doppel getroffen", (0, 10000), "z. B. 8"),
        ("doubles_darts", "Darts auf Doppel", (0, 10000), "z. B. 25"),
        ("plus60", "60+ (Anzahl)", (0, 10000), ""),
        ("plus100", "100+ (Anzahl)", (0, 10000), ""),
        ("plus140", "140+ (Anzahl)", (0, 10000), ""),
        ("plus170", "170+ (Anzahl)", (0, 10000), ""),
        ("t180", "180er (Anzahl)", (0, 10000), ""),
        ("highest_checkout", "Höchster Checkout", (2, 170), ""),
        ("best_leg", "Bestes Leg (Darts)", (9, 200), ""),
    ],
    "training": [
        ("bobs27", "Bob's 27 – Punkte", (-10000, 1500), "Endstand"),
        ("atc_darts", "Around the Clock Doubles – Darts", (21, 1000), "benötigte Darts"),
        ("jdc", "JDC Challenge – Punkte", (0, 1000), ""),
        ("rc_hit", "Random Checkout – getroffen", (0, 1000), ""),
        ("rc_total", "Random Checkout – Versuche", (0, 1000), ""),
    ],
}
ALL_FIELDS = {f[0]: f for group in ENTRY_FIELDS.values() for f in group}


class EntryError(ValueError):
    pass


def parse_number(text: str):
    text = (text or "").strip().replace(",", ".").rstrip("%").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        raise EntryError(f"„{text}“ ist keine Zahl.") from None


def validate_entry(values: dict) -> dict:
    """values: key -> Text. Gibt geprüfte Zahlen zurück oder wirft EntryError."""
    out = {}
    for key, raw in values.items():
        if key not in ALL_FIELDS:
            continue
        _, label, (lo, hi), _ = ALL_FIELDS[key]
        try:
            v = parse_number(raw)
        except EntryError as e:
            raise EntryError(f"{label}: {e}") from None
        if v is None:
            continue
        if not lo <= v <= hi:
            raise EntryError(f"{label}: {raw} liegt außerhalb des sinnvollen Bereichs ({lo}–{hi}).")
        out[key] = v
    if "legs_won" in out and "legs_played" in out and out["legs_won"] > out["legs_played"]:
        raise EntryError("Es können nicht mehr Legs gewonnen als gespielt sein.")
    if "doubles_hit" in out and "doubles_darts" in out and out["doubles_hit"] > out["doubles_darts"]:
        raise EntryError("Doppel getroffen kann nicht größer sein als Darts auf Doppel.")
    if "rc_hit" in out and "rc_total" in out and out["rc_hit"] > out["rc_total"]:
        raise EntryError("Random Checkout: Treffer können nicht größer sein als Versuche.")
    if not out:
        raise EntryError("Bitte mindestens einen Wert eintragen (z. B. den Average).")
    return out


def session_metrics(e: dict) -> dict:
    """Berechnet vergleichbare Kennzahlen aus einer eingetragenen Session."""
    m = {}
    for k in ("average", "first9", "highest_checkout", "best_leg", "bobs27", "atc_darts", "jdc"):
        if e.get(k) is not None:
            m[k] = e[k]
    if e.get("doubles_darts"):
        m["checkout_pct"] = 100.0 * (e.get("doubles_hit") or 0) / e["doubles_darts"]
    elif e.get("checkout_pct") is not None:
        m["checkout_pct"] = e["checkout_pct"]
    legs = e.get("legs_played")
    if legs:
        if e.get("legs_won") is not None:
            m["win_rate"] = 100.0 * e["legs_won"] / legs
        for src in ("plus60", "plus100", "plus140", "plus170", "t180"):
            if e.get(src) is not None:
                m[f"{src}_per_leg"] = e[src] / legs
    if e.get("rc_total"):
        m["rc_pct"] = 100.0 * (e.get("rc_hit") or 0) / e["rc_total"]
    return {k: round(v, 2) for k, v in m.items()}


def average_of(metric_dicts: list[dict]) -> dict:
    """Durchschnitt je Kennzahl über mehrere Sessions (fehlende Werte werden ignoriert)."""
    out = {}
    for key, *_ in METRIC_DEFS:
        vals = [m[key] for m in metric_dicts if m.get(key) is not None]
        if vals:
            out[key] = round(mean(vals), 2)
    return out


def compare(current: dict, previous: dict | None) -> list[dict]:
    rows = []
    for key, label, higher, unit, tol in METRIC_DEFS:
        if key not in current:
            continue
        cur = current[key]
        prev = previous.get(key) if previous else None
        if prev is None:
            status, delta = "neu", None
        else:
            delta = cur - prev
            if abs(delta) < tol:
                status = "gleich"
            elif (delta > 0) == higher:
                status = "besser"
            else:
                status = "schlechter"
        rows.append({"key": key, "label": label, "unit": unit, "current": cur,
                     "previous": prev, "delta": delta, "status": status})
    return rows


def fmt(v, unit=""):
    if v is None:
        return "–"
    if abs(v - round(v)) < 1e-9:
        s = str(int(round(v)))
    else:
        s = f"{v:.{1 if abs(v) >= 10 else 2}f}".rstrip("0").rstrip(".")
    s = s.replace(".", ",")
    return s + (" " + unit if unit else "")
