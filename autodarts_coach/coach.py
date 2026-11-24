"""KI-Dart-Coach über die Claude API (offizielles Anthropic-SDK, Streaming)."""

import datetime as dt
import json

import anthropic

SYSTEM_PROMPT = """Du bist ein erfahrener, ehrlicher Steel-Dart-Coach (PDC-Niveau) und analysierst die \
Autodarts-Statistiken eines Spielers. Antworte immer auf Deutsch, direkt und konkret, ohne Schönfärberei.

Du bekommst als JSON:
- aktuelle Kennzahlen (Gesamt und Form der letzten 10 Matches),
- den Vergleich zum letzten Abruf (Fortschritte/Rückschritte),
- die Kennzahlen früherer Abrufe (Verlauf),
- eine Liste der letzten Matches mit Einzelwerten,
- die Roh-Statistiken der Autodarts-API.

Gliedere deine Antwort exakt in diese Abschnitte (Markdown-Überschriften mit ##):

## 1. Kurzfazit
2–4 Sätze: Wo steht der Spieler, Trend (besser/schlechter), Leistungsniveau grob einordnen.

## 2. Fortschritte & Rückschritte
Die wichtigsten Veränderungen gegenüber früheren Abrufen mit Zahlen, und was sie bedeuten.

## 3. Schwachstellen-Analyse (Flaschenhals)
Benenne den EINEN größten Flaschenhals ehrlich (z. B. Scoring vs. Doppel vs. Konstanz/First-9 vs. Finish) \
und begründe mit den Zahlen. Danach max. 2 Nebenbaustellen.

## 4. Trainingsplan für die nächste Autodarts-Session
Konkreter Plan mit Zeitangaben (Gesamt ca. 60–90 Min), Reihenfolge Aufwärmen → Hauptteil → Matchpraxis. \
Nutze konkrete Autodarts-Spiele/Modi wie Bob's 27, Around the Clock (Doubles), Random Checkout, \
JDC Challenge, Cricket, Shanghai, 121/170 Checkout-Training, Score Training (z. B. 20er/19er), \
501 gegen den Bot (konkretes Bot-Level). Gib für JEDE Übung einen messbaren Zielwert an \
(z. B. „Bob's 27: > 150 Punkte“, „Bot-Level X: mind. 3 von 5 Legs“), abgeleitet aus seinen aktuellen Werten.

## 5. Taktik: Doppel- und Checkout-Wege
Bevorzugte Doppel (z. B. D16/D20/D8-Kette), Setup-Würfe, Wege für typische Reste (z. B. 40, 32, 36, 81, 100, \
Bogey-Zahlen vermeiden), passend zu seiner Doppelquote.

## 6. Mentale & technische Tipps
3–5 konkrete Punkte (Wurfrhythmus, Stand, Routinen, Druck beim Checkout).

## 7. Ziele bis zum nächsten Abruf
2–3 messbare Ziele (z. B. Average +1,5, Doppelquote > 35 %).

Wenn Daten fehlen oder unplausibel sind, sag das kurz und arbeite mit dem, was vorhanden ist. \
Erfinde keine Zahlen."""


class CoachError(Exception):
    pass


def build_payload(current: dict, comparison: list, history: list, matches: list, raw: dict) -> str:
    def ts(t):
        return dt.datetime.fromtimestamp(t).strftime("%Y-%m-%d %H:%M")

    payload = {
        "heute": dt.date.today().isoformat(),
        "spieler": raw.get("username"),
        "aktuelle_kennzahlen": current,
        "vergleich_zum_letzten_abruf": comparison,
        "verlauf_frueherer_abrufe": [{"zeit": ts(h["created_at"]), "kennzahlen": h["metrics"]} for h in history],
        "letzte_matches": matches,
        "autodarts_roh_statistiken": raw.get("user_stats", {}),
    }
    return json.dumps(payload, ensure_ascii=False, indent=1, default=str)


def run_coach(api_key: str, model: str, payload_json: str, on_text) -> str:
    """Streamt die Analyse. on_text(str) wird für jedes Textstück aufgerufen. Gibt den Volltext zurück."""
    if not api_key:
        raise CoachError("Kein Anthropic/Claude API-Key hinterlegt (Einstellungen).")
    client = anthropic.Anthropic(api_key=api_key, max_retries=3)
    parts: list[str] = []
    try:
        with client.beta.messages.stream(
            model=model or "claude-opus-5-5",
            max_tokens=32000,
            system=SYSTEM_PROMPT,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{
                "role": "user",
                "content": "Hier sind meine aktuellen Autodarts-Daten. Bitte analysiere sie und erstelle "
                           "meinen Trainingsplan.\n\n```json\n" + payload_json + "\n```",
            }],
        ) as stream:
            for text in stream.text_stream:
                parts.append(text)
                on_text(text)
            final = stream.get_final_message()
    except anthropic.AuthenticationError as e:
        raise CoachError("Claude API-Key ungültig. Bitte in den Einstellungen prüfen.") from e
    except anthropic.PermissionDeniedError as e:
        raise CoachError(f"Keine Berechtigung für dieses Modell/diesen Key: {e.message}") from e
    except anthropic.NotFoundError as e:
        raise CoachError(f"Modell '{model}' nicht gefunden. Bitte in den Einstellungen anpassen.") from e
    except anthropic.RateLimitError as e:
        raise CoachError("Claude API Rate-Limit erreicht – bitte kurz warten und erneut versuchen.") from e
    except anthropic.BadRequestError as e:
        raise CoachError(f"Claude API hat die Anfrage abgelehnt: {e.message}") from e
    except anthropic.APIStatusError as e:
        raise CoachError(f"Claude API Fehler (HTTP {e.status_code}): {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise CoachError("Keine Verbindung zur Claude API (Internet/Firewall prüfen).") from e

    if final.stop_reason == "refusal":
        msg = "\n\n[Die Anfrage wurde vom Modell abgelehnt.]"
        parts.append(msg)
        on_text(msg)
    elif final.stop_reason == "max_tokens":
        msg = "\n\n[Antwort wurde wegen Längenlimit abgeschnitten.]"
        parts.append(msg)
        on_text(msg)
    return "".join(parts)
