"""Auswertung der Roh-Daten aus der Autodarts-API zu vergleichbaren Kennzahlen.

Die Autodarts-API ist nicht offiziell dokumentiert; die Feldnamen werden
deshalb tolerant (über Aliase und normalisierte Schlüssel) gesucht.
"""

import re
from statistics import mean

# key, Label, höher ist besser, Einheit, Toleranz für "gleich geblieben"
METRIC_DEFS = [
    ("average", "3-Dart-Average (gesamt)", True, "", 0.3),
    ("first9", "First-9-Average (gesamt)", True, "", 0.3),
    ("checkout_pct", "Doppelquote / Checkout %", True, "%", 0.5),
    ("last10_average", "Average letzte 10 Matches", True, "", 0.3),
    ("last10_first9", "First-9 letzte 10 Matches", True, "", 0.3),
    ("last10_checkout_pct", "Doppelquote letzte 10 Matches", True, "%", 0.5),
    ("win_rate", "Siegquote", True, "%", 1.0),
    ("darts_per_leg", "Darts pro gewonnenem Leg", False, "", 0.3),
    ("highest_checkout", "Höchster Checkout", True, "", 0.5),
    ("best_leg", "Bestes Leg (Darts)", False, "", 0.5),
    ("plus60_per_leg", "60+ pro Leg", True, "", 0.05),
    ("plus100_per_leg", "100+ pro Leg", True, "", 0.03),
    ("plus140_per_leg", "140+ pro Leg", True, "", 0.02),
    ("plus170_per_leg", "170+ pro Leg", True, "", 0.01),
    ("t180_per_leg", "180er pro Leg", True, "", 0.01),
    ("matches_count", "Ausgewertete Matches", True, "", 0.5),
]
METRIC_INDEX = {d[0]: d for d in METRIC_DEFS}

ALIASES = {
    "average": ["average", "avg", "threedartaverage", "3dartaverage", "averageperturn", "dartsaverage", "x01average"],
    "first9": ["first9average", "first9avg", "first9", "firstnineaverage", "first9dartsaverage"],
    "checkout_pct": ["checkoutpercent", "checkoutrate", "checkoutpercentage", "checkoutratio",
                     "doublerate", "doublepercent", "doublepercentage", "checkoutsuccessrate"],
    "checkouts_hit": ["checkoutshit", "checkouts", "checkoutsuccess", "successfulcheckouts", "doubleshit"],
    "checkout_darts": ["checkoutattempts", "checkoutdarts", "checkoutthrows", "dartsatdouble",
                       "doubleattempts", "dartsondouble", "checkoutsthrown"],
    "plus60": ["plus60", "60plus", "total60", "score60plus", "over60"],
    "plus100": ["plus100", "100plus", "total100", "score100plus", "over100", "tons"],
    "plus140": ["plus140", "140plus", "total140", "score140plus", "over140"],
    "plus170": ["plus170", "170plus", "total170", "score170plus", "over170"],
    "t180": ["total180", "plus180", "180s", "oneeighties", "maxes", "count180", "score180"],
    "legs_won": ["legswon", "wonlegs"],
    "legs": ["legs", "legsplayed", "totallegs"],
    "darts": ["darts", "dartsthrown", "totaldarts"],
    "darts_per_leg": ["dartsperleg", "averagedartsperleg", "dartsperwonleg"],
    "highest_checkout": ["highestcheckout", "bestcheckout", "maxcheckout", "highcheckout"],
    "best_leg": ["bestleg", "fewestdarts", "bestlegdarts", "shortestleg"],
}
_ALIAS_LOOKUP = {a: k for k, al in ALIASES.items() for a in al}


def _norm(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(key).lower())


def _num(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.replace(",", ".").rstrip("%"))
        except ValueError:
            return None
    return None


def extract_fields(obj, depth: int = 2) -> dict:
    """Sucht bekannte Kennzahlen in einem Dict (inkl. verschachtelter Dicts, ohne Listen)."""
    found = {}

    def walk(o, d):
        if not isinstance(o, dict) or d < 0:
            return
        for k, v in o.items():
            nk = _norm(k)
            target = _ALIAS_LOOKUP.get(nk)
            val = _num(v)
            if target and val is not None and target not in found:
                found[target] = val
        for v in o.values():
            if isinstance(v, dict):
                walk(v, d - 1)

    walk(obj, depth)
    return found


def _ids_of(d: dict) -> set:
    ids = set()
    for k in ("userId", "user_id", "id", "uid"):
        if isinstance(d.get(k), str):
            ids.add(d[k])
    u = d.get("user")
    if isinstance(u, dict):
        ids |= _ids_of(u)
    return ids


def _find_player_index(obj, uid):
    """Findet die Position des eigenen Spielers in einer 'players'-artigen Liste."""
    result = None

    def walk(o):
        nonlocal result
        if result is not None:
            return
        if isinstance(o, list) and o and all(isinstance(x, dict) for x in o):
            for i, x in enumerate(o):
                if uid in _ids_of(x):
                    result = (i, len(o))
                    return
        if isinstance(o, dict):
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(obj)
    return result


def my_match_stats(entry: dict, uid: str) -> dict | None:
    summary = entry.get("summary") or {}
    stats = entry.get("stats") or {}
    combined = {"summary": summary, "stats": stats}
    pos = _find_player_index(combined, uid)
    if pos is None:
        return None
    idx, n_players = pos
    found = {}

    def walk(o):
        if isinstance(o, list):
            if len(o) == n_players and all(isinstance(x, dict) for x in o):
                f = extract_fields(o[idx], depth=2)
                if len(f) >= 2:
                    for k, v in f.items():
                        found.setdefault(k, v)
            for x in o:
                walk(x)
        elif isinstance(o, dict):
            if uid in _ids_of(o):
                f = extract_fields(o, depth=2)
                if len(f) >= 2:
                    for k, v in f.items():
                        found.setdefault(k, v)
            for v in o.values():
                walk(v)

    walk(stats)
    walk(summary)
    if not found:
        return None

    winner = stats.get("winner", summary.get("winner")) if isinstance(stats, dict) else summary.get("winner")
    if isinstance(winner, (int, float)) and not isinstance(winner, bool):
        found["won"] = 1.0 if int(winner) == idx else 0.0
    elif isinstance(winner, dict):
        found["won"] = 1.0 if uid in _ids_of(winner) else 0.0
    elif isinstance(winner, str):
        found["won"] = 1.0 if winner == uid else 0.0

    found["date"] = (summary.get("finishedAt") or summary.get("finished_at") or summary.get("createdAt")
                     or summary.get("created_at") or "")
    variant = summary.get("variant") or (stats.get("variant") if isinstance(stats, dict) else None) or ""
    settings = summary.get("settings") or {}
    base = settings.get("baseScore") if isinstance(settings, dict) else None
    found["variant"] = f"{variant} {base or ''}".strip()
    found["players"] = n_players
    return found


def _pct(v):
    if v is None:
        return None
    return v * 100 if v <= 1.0 else v


def _co_pct(f: dict):
    if f.get("checkout_pct") is not None:
        return _pct(f["checkout_pct"])
    hit, darts = f.get("checkouts_hit"), f.get("checkout_darts")
    if hit is not None and darts:
        return 100.0 * hit / darts
    return None


def _aggregate(match_list: list[dict]) -> dict:
    out = {}
    if not match_list:
        return out
    for k in ("average", "first9"):
        vals = [m[k] for m in match_list if m.get(k)]
        if vals:
            out[k] = mean(vals)
    hit = sum(m.get("checkouts_hit", 0) or 0 for m in match_list)
    darts = sum(m.get("checkout_darts", 0) or 0 for m in match_list)
    if darts:
        out["checkout_pct"] = 100.0 * hit / darts
    else:
        vals = [_co_pct(m) for m in match_list if _co_pct(m) is not None]
        if vals:
            out["checkout_pct"] = mean(vals)
    won = [m["won"] for m in match_list if "won" in m]
    if won:
        out["win_rate"] = 100.0 * sum(won) / len(won)
    legs = sum(m.get("legs", 0) or 0 for m in match_list)
    if not legs:
        legs = sum((m.get("legs_won", 0) or 0) for m in match_list)
    for src, dst in (("plus60", "plus60_per_leg"), ("plus100", "plus100_per_leg"),
                     ("plus140", "plus140_per_leg"), ("plus170", "plus170_per_leg"), ("t180", "t180_per_leg")):
        tot = [m[src] for m in match_list if m.get(src) is not None]
        if tot and legs:
            out[dst] = sum(tot) / legs
    dpl = [m["darts_per_leg"] for m in match_list if m.get("darts_per_leg")]
    if dpl:
        out["darts_per_leg"] = mean(dpl)
    hc = [m["highest_checkout"] for m in match_list if m.get("highest_checkout")]
    if hc:
        out["highest_checkout"] = max(hc)
    bl = [m["best_leg"] for m in match_list if m.get("best_leg")]
    if bl:
        out["best_leg"] = min(bl)
    return out


def compute_metrics(raw: dict) -> dict:
    """Ergebnis: {'metrics': {...}, 'matches': [...pro Match...]}"""
    uid = raw.get("user_id")
    per_match = []
    for entry in raw.get("matches", []):
        try:
            m = my_match_stats(entry, uid)
        except Exception:
            m = None
        if m:
            per_match.append(m)

    metrics = _aggregate(per_match)

    # Offizielle Gesamt-Stats haben Vorrang, wenn vorhanden
    for key in ("x01", "general"):
        us = raw.get("user_stats", {}).get(key)
        if isinstance(us, dict):
            f = extract_fields(us, depth=3)
            for k in ("average", "first9", "highest_checkout", "best_leg", "darts_per_leg"):
                if f.get(k):
                    metrics[k] = f[k]
            co = _co_pct(f)
            if co is not None:
                metrics["checkout_pct"] = co

    last10 = _aggregate(per_match[:10])
    for k in ("average", "first9", "checkout_pct"):
        if k in last10:
            metrics["last10_" + k] = last10[k]
    metrics["matches_count"] = float(len(per_match))
    metrics = {k: round(v, 2) for k, v in metrics.items() if v is not None}
    return {"metrics": metrics, "matches": per_match}


def compare(current: dict, previous: dict) -> list[dict]:
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
    s = f"{v:.2f}".rstrip("0").rstrip(".") if abs(v - round(v)) > 1e-9 else f"{int(round(v))}"
    return s + (" " + unit if unit else "")
