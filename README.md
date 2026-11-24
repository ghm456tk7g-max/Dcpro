# 🎯 Autodarts AI Coach

> Neu im Repo: **Darts & Durstig Liga** (Web-App/PWA für die Liga) im Ordner [`liga-app/`](liga-app/README.md).

Eigenständiges Windows-Programm (`AutodartsCoach.exe`), keine Python-Installation nötig.

**Kein Bann-Risiko:** Das Programm verbindet sich **nicht** mit Autodarts. Du trägst deine Werte nach einer
Session selbst ein, z. B. aus der Match-Übersicht in Autodarts. Die Autodarts-Nutzungsbedingungen verbieten
automatisierten Zugriff und Datenauslesen durch Fremdsoftware ohne schriftliche Erlaubnis. Deshalb
gibt es bewusst keinen automatischen Abruf.

## Funktionen

- **Session eintragen:** Average, First-9, Doppelquote (direkt oder Treffer/Darts), Legs, 60+/100+/140+/170+/180,
  höchster Checkout, bestes Leg, dazu optional Trainingsspiele (Bob's 27, Around the Clock Doubles,
  JDC Challenge, Random Checkout) und Notizen. Sessions lassen sich später bearbeiten oder löschen.
- **Dashboard:** Kennzahlen mit ▲/▼ gegenüber der Session davor, Verlaufsdiagramm mit 5er-Schnitt,
  Scoring-Verteilung pro Leg.
- **Fortschritte & Rückschritte:** Vergleich mit der vorherigen oder ersten Session, mit dem Schnitt aller
  früheren Sessions, mit einer beliebigen Session oder als „letzte 5 vs. die 5 davor“.
- **KI-Coach (Claude API):** Schwachstellen-Analyse, Trainingsplan mit Zielwerten, Doppelwege,
  mentale und technische Tipps. Die Analyse lässt sich als Textdatei speichern.
- **Lokale Historie:** SQLite-Datei im Ordner `AutodartsCoach_Daten` neben der `.exe`.

## Download

Die `.exe` wird bei jedem Push automatisch von GitHub Actions auf Windows gebaut und getestet:
**Actions → „Build Windows EXE“ → neuester Lauf → Artifact „AutodartsCoach“** (ZIP mit der `.exe`).

## Erster Start

1. `AutodartsCoach.exe` in einen eigenen Ordner legen und starten.
   Windows SmartScreen: „Weitere Informationen“ → „Trotzdem ausführen“ (die EXE ist nicht signiert).
2. **Einstellungen:** einmalig den **Claude API-Key** (`sk-ant-…`, console.anthropic.com → API Keys)
   eintragen und speichern. Er wird mit Windows-DPAPI verschlüsselt.
3. **Neue Session eintragen** → **Speichern & KI-Analyse starten**.

Für die KI-Analyse werden nur deine eingetragenen Werte und Notizen an die Claude API gesendet.

## Selbst bauen (optional, Windows)

`build_windows.bat` ausführen → `dist\AutodartsCoach.exe`.
