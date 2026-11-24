# 🎯 Darts & Durstig Liga

Liga-, K.O.-Turnier- und Statistik-Plattform (Web-App + PWA) für 12 Spieltage mit
Jeder-gegen-Jeden-Ligaphase und anschließender K.O.-Phase (Gewinner- & Loser-Bracket) an jedem Spieltag.
Die Darts selbst zählt Scolia. Hier werden nur die fertigen Leg-Ergebnisse (z. B. 5:4) eingetragen.

## Schnellstart (lokal, ohne Supabase)

```bash
cd liga-app
npm install
npm run dev        # http://localhost:5173 (im WLAN auch über die angezeigte Netzwerk-IP)
```

Ohne Supabase-Keys speichert die App alles im **LocalStorage** des Browsers.
Zum Ausprobieren: **Admin → PIN `1800` → „Demo-Daten laden“** (8 Spieler, 2 gespielte Spieltage).

## Live-Sync mit Supabase (mehrere Geräte)

1. Kostenloses Projekt auf <https://supabase.com> anlegen.
2. Im Dashboard **SQL Editor** öffnen, den Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen und **Run** klicken.
   Damit werden Tabelle, PIN-Prüfung (Start-PIN `1800`) und Realtime eingerichtet.
3. **Project Settings → API**: `Project URL` und den `anon` `public` Key kopieren.
4. `.env.example` nach `.env.local` kopieren und eintragen:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
5. `npm run dev` neu starten. Oben rechts steht jetzt **„Live“** statt „Lokal“.

Beim Hosting (Netlify, Vercel, Cloudflare Pages …) dieselben zwei Variablen in den Projekt-Einstellungen
setzen. Build-Befehl: `npm run build`, Ausgabeordner: `dist`.

Der anon-Key darf öffentlich sein: Er erlaubt nur Lesen. Geschrieben wird ausschließlich über die
Datenbank-Funktion `save_league_state`, die den Admin-PIN serverseitig prüft.

## Bedienung

| Reiter | Inhalt |
|---|---|
| **Übersicht / Spieltag** | Saison-Fortschritt, Spieltag 1–12, Anwesenheit, Ergebnis-Eingabe per Antippen, Tages-Tabelle, automatischer Tagessieg (+2) mit Override fürs Stechen |
| **Rangliste** | Gesamt- oder Tages-Tabelle, Klick auf einen Spieler öffnet das Oche-Profil |
| **K.O.-Phase** | Brackets entstehen automatisch, sobald alle Ligaspiele des Spieltags eingetragen sind (obere Hälfte ins Gewinner-, untere Hälfte ins Loser-Bracket, Freilose an die Bestplatzierten) |
| **Specials** | Zähler für 180er, High-Finishes (100+) und das höchste Finish pro Spieltag |
| **Admin** | PIN-Login, Spieler, Leg-Distanzen, PIN ändern, neue Saison, Demo-Daten, Backup-Export/-Import |

- **Tablet-Modus** (Monitor-Symbol oben rechts): blendet Eingaben aus und vergrößert die Schrift.
- **Als App installieren:** Seite im Browser öffnen → „Zum Home-Bildschirm hinzufügen“.
  Die PWA funktioniert erst im Produktions-Build (`npm run build && npm run preview` bzw. gehostet über HTTPS).

## Regeln (in der App umgesetzt)

- Sieg = 1 Punkt, Niederlage = 0 Punkte, Tagessieg = +2 Bonuspunkte
- Sortierung: Punkte → Leg-Differenz → gewonnene Legs → direkter Vergleich
- Ränge: Kneipen-Rookie (0–5), Single-Shooter (6–12), Double-Hunter (13–20), Treble-Striker (21–30),
  Checkout-Artist (31–42), Dart-Legende (43+)

## Hinweise

- Ein 4-stelliger PIN ist eine Bedienungs-Sperre und keine echte Absicherung. Für eine Kneipenliga reicht das.
- Es wird immer der komplette Liga-Stand gespeichert. Tragen zwei Admins in derselben Sekunde etwas ein,
  gewinnt die letzte Speicherung. Im Alltag passiert das praktisch nie.
