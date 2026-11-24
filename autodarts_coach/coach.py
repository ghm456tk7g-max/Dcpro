"""KI-Dart-Coach über die Claude API (offizielles Anthropic-SDK, Streaming)."""

import datetime as dt
import json

import anthropic

SYSTEM_PROMPT = """Du bist ein erfahrener, ehrlicher Steel-Dart-Coach (PDC-Niveau) und analysierst die \
Trainings- und Spielstatistiken eines Spielers, der auf Autodarts spielt und seine Werte nach jeder Session \
selbst einträgt. Antworte immer auf Deutsch, direkt und konkret, ohne Schönfärberei.

Du bekommst als JSON:
- die aktuelle Session (eingetragene Rohwerte, berechnete Kennzahlen, Notizen des Spielers),
- den Vergleich zur vorherigen Session (Fortschritte/Rückschritte),
- den Schnitt der letzten 5 Sessions im Vergleich zum Schnitt der Sessions davor (Trend),
- den Verlauf aller früheren Sessions.
Einzelne Sessions schwanken stark – bewerte Trends über mehrere Sessions höher als eine einzelne Session. \
Nicht jede Session enthält alle Werte.

Gliedere deine Antwort exakt in diese Abschnitte (Markdown-Überschriften mit ##):

## 1. Kurzfazit
2–4 Sätze: Wo steht der Spieler, Trend (besser/schlechter), Leistungsniveau grob einordnen.

## 2. Fortschritte & Rückschritte
Die wichtigsten Veränderungen gegenüber früheren Sessions mit Zahlen, und was sie bedeuten.

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

## 7. Ziele für die nächsten Sessions
2–3 messbare Ziele (z. B. Average +1,5, Doppelquote > 35 %).

## 8. Was du nächstes Mal zusätzlich eintragen solltest
Nur falls für eine bessere Analyse wichtige Werte fehlen (z. B. First-9 oder Doppel-Darts) – kurz, max. 2 Punkte.

Wenn Daten fehlen oder unplausibel sind, sag das kurz und arbeite mit dem, was vorhanden ist. \
Erfinde keine Zahlen."""


class CoachError(Exception):
    pass


def build_payload(player: str, session: dict, comparison: list, trend: dict, history: list) -> str:
    def brief(s):
        return {"datum": s["date"], "modus": s["mode"], "kennzahlen": s["metrics"],
                **({"notizen": s["notes"]} if s.get("notes") else {})}

    payload = {
        "heute": dt.date.today().isoformat(),
        "spieler": player or None,
        "aktuelle_session": {**brief(session), "eingetragene_werte": session["entry"]},
        "vergleich_zur_vorherigen_session": comparison,
        "trend_letzte_5_vs_davor": trend,
        "verlauf_fruehere_sessions_neueste_zuerst": [brief(s) for s in history],
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
                "content": "Hier sind meine aktuellen Dart-Statistiken. Bitte analysiere sie und erstelle "
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
