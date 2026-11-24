# 🎯 Autodarts AI Coach

Eigenständiges Windows-Programm (`AutodartsCoach.exe`), keine Python-Installation nötig.

- Login bei Autodarts (Keycloak `login.autodarts.io`) und automatische Token-Verwaltung
- Abruf deiner Statistiken von `api.autodarts.io` (Average, First-9, Doppelquote, Scoring-Verteilung, Match-History)
- Lokale Historie (SQLite) mit Fortschritten ▲ und Rückschritten ▼
- KI-Dart-Coach über die Claude API: Schwachstellen, Trainingsplan mit Zielwerten, Doppelwege, mentale Tipps

## Download

Die fertige `.exe` wird bei jedem Push automatisch von GitHub Actions auf Windows gebaut und getestet:
**Actions → „Build Windows EXE“ → neuester Lauf → Artifact „AutodartsCoach“** (ZIP mit der `.exe`).

## Erster Start

1. `AutodartsCoach.exe` in einen eigenen Ordner legen (z. B. Desktop\AutodartsCoach) und starten.
   Windows SmartScreen: „Weitere Informationen“ → „Trotzdem ausführen“ (die EXE ist nicht signiert).
2. In **Einstellungen** eintragen und speichern:
   - **Autodarts-E-Mail + Passwort**
   - **Claude API-Key** (`sk-ant-…`, von console.anthropic.com → API Keys)
3. Auf **„Stats aktualisieren & Analyse starten“** klicken.

Daten (Historie, verschlüsselte Einstellungen, Log) liegen im Ordner `AutodartsCoach_Daten` neben der `.exe`.
Passwort und API-Key werden mit der Windows-DPAPI verschlüsselt.

## Hinweis zur Autodarts-API

Die Autodarts-API ist nicht offiziell dokumentiert. Das Programm sucht die Kennzahlen deshalb tolerant über
verschiedene Feldnamen. Falls Autodarts etwas ändert, steht der Fehler in `AutodartsCoach_Daten/log.txt`.

## Selbst bauen (optional, Windows)

`build_windows.bat` ausführen → `dist\AutodartsCoach.exe`.
