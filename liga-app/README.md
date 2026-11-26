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

## Online stellen: eigene Website mit Login

Ziel: `https://deine-domain.de` → Login-Seite → nur Liga-Mitglieder sehen Tabellen & Co.,
Ergebnisse eintragen zusätzlich nur mit Admin-PIN.

### 1. Supabase (Datenbank + Logins, kostenlos)

1. Auf <https://supabase.com> ein Projekt anlegen (Region z. B. Frankfurt).
2. **SQL Editor** → Inhalt von [`supabase/schema.sql`](supabase/schema.sql) einfügen → **Run**.
3. **Authentication → Sign In / Providers**: „Allow new users to sign up“ **ausschalten**
   (sonst könnte sich jeder selbst ein Konto anlegen).
4. **Authentication → Users → Add user → Create new user** für jeden Teilnehmer:
   - E-Mail: `benutzername@ddliga.local` (z. B. `max@ddliga.local`) – angemeldet wird später nur mit `max`
   - Passwort vergeben, **„Auto Confirm User“ anhaken**
   - Wer lieber eine echte E-Mail-Adresse nutzt, meldet sich einfach mit dieser an.
   - Alternativ ein einziges gemeinsames Konto, z. B. `liga@ddliga.local`.
5. **Project Settings → API**: `Project URL` und `anon public` Key kopieren.

Jeder kann sein Passwort danach in der App selbst ändern (Personen-Symbol oben rechts).
Passwort vergessen? Im Supabase-Dashboard beim Nutzer ein neues setzen.

### 2. Netlify (Hosting, kostenlos)

1. Auf <https://netlify.com> mit GitHub anmelden → **Add new site → Import an existing project** → dieses Repo.
2. **Base directory:** `liga-app` (Build-Befehl und Ordner kommen aus `netlify.toml`), Branch auswählen.
3. **Environment variables:** `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` eintragen → **Deploy**.

### 3. Eigene Domain

1. Domain bei einem beliebigen Anbieter mieten (z. B. IONOS, Strato, INWX, Namecheap).
2. Netlify → **Domain management → Add a domain** → Domain eingeben.
3. Beim Domain-Anbieter die DNS-Einträge setzen, die Netlify anzeigt
   (typisch: `A`-Record `@` → `75.2.60.5` und `CNAME` `www` → `deine-seite.netlify.app`).
4. HTTPS-Zertifikat erstellt Netlify automatisch (kann bis zu einer Stunde dauern).

### Lokal mit Supabase testen

`.env.example` nach `.env.local` kopieren, URL und Key eintragen, `npm run dev` neu starten.
Ohne diese Werte läuft die App im lokalen Testmodus **ohne Login** (Daten nur im Browser).

### Sicherheit

- Der anon-Key im Website-Code ist öffentlich, das ist so vorgesehen. Die Datenbank gibt Daten aber nur an
  angemeldete Konten heraus; Schreiben geht nur über eine Funktion, die zusätzlich den Admin-PIN prüft.
- Der 4-stellige Admin-PIN ist eine Bedienungs-Sperre für angemeldete Mitglieder, kein starker Schutz.

## Bedienung

| Reiter | Inhalt |
|---|---|
| **Übersicht / Spieltag** | Saison-Fortschritt, Spieltag 1–12, Anwesenheit, Ergebnis-Eingabe per Antippen, Tages-Tabelle, automatischer Tagessieg (+2) mit Override fürs Stechen |
| **Rangliste** | Gesamt- oder Tages-Tabelle, Klick auf einen Spieler öffnet das Oche-Profil |
| **K.O.-Phase** | Brackets entstehen automatisch, sobald alle Ligaspiele des Spieltags eingetragen sind (obere Hälfte ins Gewinner-, untere Hälfte ins Loser-Bracket, Freilose an die Bestplatzierten) |
| **Turnier** | Eigenständiges Steeldart-Turnier: Teilnehmer & Kasse (Gebühr, Bezahlt Ja/Nein, aktueller Pot), Auslosung in 2 Gruppen mit optimierter Board-Reihenfolge, Gruppenphase (Jeder gegen Jeden), danach Double Elimination |
| **Hall of Fame** | Titelverteidiger groß, Chronik aller Sieger mit Pot; Turniersieger per Klick übernehmen |
| **Specials** | Zähler für 180er, High-Finishes (100+) und das höchste Finish pro Spieltag |
| **Admin** | PIN-Login, Spieler, Leg-Distanzen, PIN ändern, neue Saison, Demo-Daten, Backup-Export/-Import |

- **Tablet-Modus** (Monitor-Symbol oben rechts): blendet Eingaben aus und vergrößert die Schrift.
- **Als App installieren:** Seite im Browser öffnen → „Zum Home-Bildschirm hinzufügen“.
  Die PWA funktioniert erst im Produktions-Build (`npm run build && npm run preview` bzw. gehostet über HTTPS).

## Liga-Kasse

- Neue Spieltage starten leer: **„Spieltag starten“**, dann die Anwesenden antippen. Jeder Anwesende bringt
  das Startgeld (Standard 15 €) in die Kasse, der Spielplan entsteht aus den Anwesenden.
- Jede 180 (Reiter „Specials“) kostet jeden Anwesenden des Spieltags einen Betrag (Standard 5 €).
  Optional zahlt der Werfer nicht mit. Ändert sich die Anwesenheit später, wird neu gerechnet.
- Kasse pro Spieltag und Saison gesamt stehen beim Spieltag und bei den Specials. Beträge unter Admin → Liga-Kasse.

## Turnier-Modus (1 Board)

- **Auslosung:** zufällig in 2 Gruppen (Größenunterschied max. 1). Die Board-Reihenfolge wird aus 400 zufälligen
  Varianten ausgewählt: Gruppen abwechselnd (bei ungleicher Größe gleichmäßig verteilt), niemand zweimal direkt
  hintereinander, möglichst gleichmäßige Pausen. Die Kennzahlen (längste Pause, spätester Einstieg) stehen über dem Spielplan.
- **Gruppenphase:** Standard 301 Single Out, Best of 3. Sieg = 2 Punkte. Sortierung wie in der Liga
  (Punkte → Leg-Differenz → gewonnene Legs → direkter Vergleich).
- **Double Elimination:** obere Hälfte jeder Gruppe ins Winners Bracket (2 Leben), untere Hälfte ins Losers
  Bracket (1 Leben), Gruppen über Kreuz gesetzt (A1, B1, A2, B2 …), Freilose an die Bestplatzierten.
  Finale Winners- gegen Losers-Sieger, optional Reset-Finale. „Jetzt am Board“ wählt das nächste Spiel mit
  Vorausschau so, dass möglichst niemand direkt hintereinander spielt. Nur am Ende, wenn nur noch ein Spiel offen ist,
  lässt sich das nicht immer vermeiden.
- **Zufallsgenerator:** In der Gruppenphase „Reihenfolge neu mischen“ (Gruppen und gespielte Partien bleiben,
  offene Partien werden neu gewürfelt) oder „Gruppen neu auslosen“. Am Liga-Spieltag würfelt „Partien mischen“
  Paarungen und Reihenfolge neu, eingetragene Ergebnisse bleiben erhalten.
- **Kasse:** Pot = Anzahl „bezahlt: Ja“ × Teilnahmegebühr + Anzahl 180er × Betrag pro 180 (Standard 1 €), live.
  Neue Teilnehmer können direkt als bezahlt angemeldet werden. 180er zählt man in der Teilnehmerliste
  oder mit „+180“ direkt bei „Jetzt am Board“. Die Pot-Karte zeigt auch, was noch offen ist.

## Regeln (in der App umgesetzt)

- Sieg = 1 Punkt, Niederlage = 0 Punkte, Tagessieg = +2 Bonuspunkte
- Sortierung: Punkte → Leg-Differenz → gewonnene Legs → direkter Vergleich
- Ränge: Kneipen-Rookie (0–5), Single-Shooter (6–12), Double-Hunter (13–20), Treble-Striker (21–30),
  Checkout-Artist (31–42), Dart-Legende (43+)

## Hinweise

- Es wird immer der komplette Liga-Stand gespeichert. Tragen zwei Admins in derselben Sekunde etwas ein,
  gewinnt die letzte Speicherung. Im Alltag passiert das praktisch nie.
