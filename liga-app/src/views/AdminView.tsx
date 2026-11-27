import { useRef, useState } from 'react';
import { Check, Cloud, Database, Download, HardDrive, KeyRound, LogOut, Pencil, Play, Plus, RotateCcw, Sparkles, Trash2, Upload, Users, X } from 'lucide-react';
import { useLeague } from '../lib/league';
import { buildDemoState } from '../lib/demo';
import { buildMatches, createSeason, isPlayed, pruneKoResults } from '../lib/logic';
import { emptyState, normalizeState, uid } from '../lib/types';
import PinPad from '../components/PinPad';
import { Btn, Card, CardTitle } from '../components/ui';

const legOptions = Array.from({ length: 11 }, (_, i) => i + 1);

export default function AdminView() {
  const { state, isAdmin, logout, update, replace, confirm, toast, store, changePin, tablet, setTablet } = useLeague();
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isAdmin)
    return (
      <Card className="mx-auto w-full max-w-md px-5 py-8">
        <PinPad />
        <p className="mt-6 text-center text-xs text-muted">
          Ohne PIN sind Tabelle, Spielpläne, K.O.-Bäume und Profile frei einsehbar. Standard-PIN beim ersten Start: 1800.
        </p>
      </Card>
    );

  const n = state.players.length;
  const nameTaken = (name: string, except?: string) =>
    state.players.some((p) => p.id !== except && p.name.trim().toLowerCase() === name.trim().toLowerCase());

  const addPlayer = () => {
    const name = newName.trim();
    if (!name) return;
    if (nameTaken(name)) return toast('Name ist schon vergeben', 'error');
    if (n >= 16) toast('Hinweis: mehr als 16 Spieler – Spieltage werden sehr lang', 'error');
    const id = uid();
    update((s) => {
      s.players.push({ id, name, createdAt: new Date().toISOString() });
      // Anwesenheit wird pro Spieltag per Klick erfasst (Startgeld), daher nicht automatisch eintragen
    }, `${name} hinzugefügt`);
    setNewName('');
  };

  const saveRename = (id: string) => {
    const name = editName.trim();
    if (!name) return;
    if (nameTaken(name, id)) return toast('Name ist schon vergeben', 'error');
    update((s) => void (s.players.find((p) => p.id === id)!.name = name), 'Name geändert');
    setEditId(null);
  };

  const removePlayer = async (id: string, name: string) => {
    const games = state.matchdays.reduce((c, d) => c + d.matches.filter((m) => isPlayed(m) && (m.a === id || m.b === id)).length, 0);
    const ok = await confirm({
      title: `${name} löschen?`,
      message: games
        ? `${name} hat bereits ${games} Ligaspiel(e) bestritten. Diese Ergebnisse werden ebenfalls gelöscht und die Tabellen neu berechnet.`
        : `${name} wird aus der Liga entfernt.`,
      confirmLabel: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    update((s) => {
      s.players = s.players.filter((p) => p.id !== id);
      for (const d of s.matchdays) {
        d.attendees = d.attendees.filter((x) => x !== id);
        d.matches = buildMatches(d.attendees, d.matches);
        delete d.specials[id];
        if (d.winnerOverride === id) d.winnerOverride = null;
        pruneKoResults(d, s.players);
      }
    }, `${name} gelöscht`);
  };

  const startSeason = async () => {
    if (n < 2) return toast('Mindestens 2 Spieler anlegen', 'error');
    const ok = await confirm({
      title: 'Neue Saison starten?',
      message: `Es werden 12 Spieltage angelegt. An jedem Spieltag wird per Klick erfasst, wer anwesend ist (Startgeld ${state.settings.dayFee} € pro Person), danach spielt Jeder gegen Jeden.${
        state.seasonStarted ? ' Alle Ergebnisse, K.O.-Phasen und Specials der laufenden Saison werden gelöscht!' : ''
      }`,
      confirmLabel: 'Saison starten',
      danger: state.seasonStarted,
    });
    if (!ok) return;
    update((s) => {
      s.matchdays = createSeason(s.players);
      s.seasonStarted = true;
    }, 'Neue Saison gestartet – viel Erfolg!');
  };

  const loadDemo = async () => {
    const ok = await confirm({
      title: 'Demo-Daten laden?',
      message: '8 Spieler und 2 gespielte Spieltage (inkl. K.O.-Phase und Specials) sowie ein laufendes Turnier mit 10 Teilnehmern werden geladen. Alle aktuellen Daten werden überschrieben (die Hall of Fame bleibt erhalten).',
      confirmLabel: 'Demo laden',
      danger: n > 0,
    });
    if (ok) replace({ ...buildDemoState(), hallOfFame: state.hallOfFame }, 'Demo-Daten geladen');
  };

  const resetAll = async () => {
    const ok = await confirm({
      title: 'Alles zurücksetzen?',
      message: 'Spieler, Saison und alle Ergebnisse werden unwiderruflich gelöscht. Tipp: Vorher ein Backup exportieren.',
      confirmLabel: 'Alles löschen',
      danger: true,
    });
    if (ok) replace({ ...emptyState(), settings: state.settings, hallOfFame: state.hallOfFame }, 'Alle Daten gelöscht (Hall of Fame bleibt)');
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `darts-durstig-liga-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const data = normalizeState(JSON.parse(await file.text()));
      const ok = await confirm({
        title: 'Backup importieren?',
        message: `${data.players.length} Spieler und ${data.matchdays.length} Spieltage werden geladen. Aktuelle Daten werden ersetzt.`,
        confirmLabel: 'Importieren',
        danger: true,
      });
      if (ok) replace(data, 'Backup importiert');
    } catch {
      toast('Datei ist kein gültiges Backup', 'error');
    }
  };

  const submitPin = async () => {
    if (!/^\d{4}$/.test(newPin)) return toast('Neuer PIN muss aus 4 Ziffern bestehen', 'error');
    const ok = await changePin(oldPin, newPin);
    if (ok) {
      toast('PIN geändert');
      setOldPin('');
      setNewPin('');
    } else toast('Aktueller PIN ist falsch', 'error');
  };

  const input = 'w-full rounded-xl border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-accent/60';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold">Admin</h1>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={() => setTablet(!tablet)}>
            Tablet-Modus {tablet ? 'aus' : 'an'}
          </Btn>
          <Btn variant="ghost" onClick={logout}>
            <LogOut size={16} /> Abmelden
          </Btn>
        </div>
      </div>

      <Card className="flex items-center gap-3 p-4 sm:p-5">
        <div className={`rounded-xl p-2.5 ${store.mode === 'supabase' ? 'bg-accent/15 text-accent' : 'bg-white/5 text-muted'}`}>
          {store.mode === 'supabase' ? <Cloud size={22} /> : <HardDrive size={22} />}
        </div>
        <div className="text-sm">
          <div className="font-semibold">{store.mode === 'supabase' ? 'Supabase Live-Sync aktiv' : 'Lokaler Modus (LocalStorage)'}</div>
          <div className="text-muted">
            {store.mode === 'supabase'
              ? 'Änderungen erscheinen sofort auf allen Geräten.'
              : 'Daten liegen nur in diesem Browser. Für Multi-Device-Sync Supabase-Keys in .env.local eintragen.'}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Spieler */}
        <Card>
          <CardTitle right={<span className={`text-xs ${n >= 6 && n <= 16 ? 'text-muted' : 'text-amber-300'}`}>{n} Spieler · empfohlen 6–16</span>}>
            <span className="flex items-center gap-2">
              <Users size={16} /> Spieler
            </span>
          </CardTitle>
          <form
            className="flex gap-2 px-4 pb-3 sm:px-5"
            onSubmit={(e) => {
              e.preventDefault();
              addPlayer();
            }}
          >
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name des Spielers" maxLength={24} className={input} />
            <Btn type="submit" disabled={!newName.trim()}>
              <Plus size={16} /> Hinzufügen
            </Btn>
          </form>
          <ul className="max-h-[420px] overflow-y-auto">
            {state.players.map((p, i) => (
              <li key={p.id} className="flex items-center gap-2 border-t border-line/60 px-4 py-2 sm:px-5">
                <span className="w-6 text-xs text-muted">{i + 1}</span>
                {editId === p.id ? (
                  <form
                    className="flex flex-1 gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveRename(p.id);
                    }}
                  >
                    <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={24} className={`${input} py-1.5`} />
                    <button type="submit" className="rounded-lg p-2 text-accent hover:bg-white/5" aria-label="Speichern">
                      <Check size={18} />
                    </button>
                    <button type="button" onClick={() => setEditId(null)} className="rounded-lg p-2 text-muted hover:bg-white/5" aria-label="Abbrechen">
                      <X size={18} />
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="flex-1 truncate font-medium">{p.name}</span>
                    <button
                      onClick={() => {
                        setEditId(p.id);
                        setEditName(p.name);
                      }}
                      className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white"
                      aria-label="Bearbeiten"
                    >
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => removePlayer(p.id, p.name)} className="rounded-lg p-2 text-muted hover:bg-red-500/10 hover:text-red-300" aria-label="Löschen">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </li>
            ))}
            {n === 0 && <li className="px-5 pb-5 text-sm text-muted">Noch keine Spieler angelegt.</li>}
          </ul>
        </Card>

        <div className="flex flex-col gap-4">
          {/* Saison */}
          <Card className="p-4 sm:p-5">
            <div className="mb-1 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Saison</div>
            <p className="mb-4 text-sm text-muted">
              Erzeugt 12 Spieltage. An jedem Spieltag spielt Jeder gegen Jeden; anschließend K.O.-Phase in Gewinner- & Loser-Bracket.
            </p>
            <Btn variant="gold" onClick={startSeason} className="w-full py-3">
              <Play size={16} /> Neue Saison (12 Spieltage) starten
            </Btn>
          </Card>

          {/* Einstellungen */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Einstellungen</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-muted">
                Saison-Name
                <input
                  defaultValue={state.settings.seasonName}
                  key={state.settings.seasonName}
                  maxLength={20}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== state.settings.seasonName) update((s) => void (s.settings.seasonName = v), 'Saison-Name gespeichert');
                  }}
                  className={`${input} mt-1`}
                />
              </label>
              {(['leagueLegs', 'koLegs'] as const).map((k) => (
                <label key={k} className="text-xs text-muted">
                  {k === 'leagueLegs' ? 'Ligaspiele' : 'K.O.-Spiele'}
                  <select
                    value={state.settings[k]}
                    onChange={(e) => update((s) => void (s.settings[k] = Number(e.target.value)), 'Leg-Distanz gespeichert')}
                    className={`${input} mt-1`}
                  >
                    {legOptions.map((l) => (
                      <option key={l} value={l}>
                        First to {l} (Best of {l * 2 - 1})
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </Card>

          {/* Liga-Kasse */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Liga-Kasse</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ['dayFee', 'Startgeld pro Anwesendem (€)'],
                  ['fee180', 'Pro 180 zahlt jede Person (€) – Liga & Turnier'],
                  ['clubFee', 'Unternehmenskasse pro Spieler & Spieltag (€) – auch wer fehlt, nicht im Pot'],
                  ['minAttendance', 'Mindestteilnahme für Auszahlung (Spieltage)'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="text-xs text-muted">
                  {label}
                  <input
                    id={`set-${k}`}
                    key={state.settings[k]}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.5}
                    defaultValue={state.settings[k]}
                    onBlur={(e) => {
                      const v = Math.max(0, Math.round(parseFloat(e.target.value.replace(',', '.')) * 100) / 100 || 0);
                      if (v !== state.settings[k]) update((s) => void (s.settings[k] = v), 'Kassen-Betrag gespeichert');
                    }}
                    className={`${input} mt-1`}
                  />
                </label>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                id="set-throwerPays"
                type="checkbox"
                checked={state.settings.throwerPays180}
                onChange={(e) => update((s) => void (s.settings.throwerPays180 = e.target.checked), 'Gespeichert')}
                className="h-4 w-4 accent-[#10b981]"
              />
              Werfer der 180 zahlt selbst mit
            </label>
            <p className="mt-2 text-xs text-muted">
              Beispiel mit {Math.max(2, n)} Anwesenden: Startgeld {Math.max(2, n) * state.settings.dayFee} €, jede 180 bringt{' '}
              {(Math.max(2, n) - (state.settings.throwerPays180 ? 0 : 1)) * state.settings.fee180} €.
            </p>
          </Card>

          {/* PIN */}
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">
              <KeyRound size={16} /> Admin-PIN ändern
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" placeholder="Aktueller PIN" className={input} />
              <input value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" placeholder="Neuer PIN (4 Ziffern)" className={input} />
              <Btn onClick={submitPin} disabled={oldPin.length !== 4 || newPin.length !== 4}>
                Ändern
              </Btn>
            </div>
          </Card>
        </div>
      </div>

      {/* Daten */}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">
          <Database size={16} /> Daten
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Btn variant="ghost" onClick={loadDemo}>
            <Sparkles size={16} className="text-gold" /> Demo-Daten laden
          </Btn>
          <Btn variant="ghost" onClick={exportJson}>
            <Download size={16} /> Backup exportieren
          </Btn>
          <Btn variant="ghost" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Backup importieren
          </Btn>
          <Btn variant="danger" onClick={resetAll}>
            <RotateCcw size={16} /> Alles zurücksetzen
          </Btn>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importJson(f);
            e.target.value = '';
          }}
        />
      </Card>
    </div>
  );
}
