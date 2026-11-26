import { ChangeEvent, useState } from 'react';
import { Award, Camera, Check, Crown, Pencil, Plus, Trash2, Trophy, X } from 'lucide-react';
import { compressImage } from '../lib/image';
import { useLeague } from '../lib/league';
import { formatDate } from '../lib/logic';
import { computeDE, euro, tNames } from '../lib/tournament';
import { potLedger } from '../lib/cash';
import { HallOfFameEntry, uid } from '../lib/types';
import { Btn, Card, CardTitle } from '../components/ui';

const sortKey = (e: HallOfFameEntry) => `${e.year}-${e.date ?? ''}`;

interface Draft {
  year: string;
  name: string;
  pot: string;
  tournament: string;
  date: string;
  photo: string | null;
}

function EntryForm({ initial, onSave, onCancel }: { initial: Draft; onSave(d: Draft): void; onCancel(): void }) {
  const [d, setD] = useState(initial);
  const input = 'w-full rounded-xl border border-line bg-panel2 px-3 py-2 text-sm outline-none focus:border-accent/60';
  const set = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      setD((x) => ({ ...x, photo: null }));
      const photo = await compressImage(f);
      setD((x) => ({ ...x, photo }));
    } catch (er) {
      setErr(er instanceof Error ? er.message : 'Bild konnte nicht geladen werden');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="grid gap-2 p-4 sm:grid-cols-[5rem_1fr_6rem_1fr_9rem_auto] sm:items-end sm:px-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (d.name.trim() && /^\d{4}$/.test(d.year)) onSave(d);
      }}
    >
      <label className="text-xs text-muted">
        Jahr
        <input id="hof-year" value={d.year} onChange={set('year')} inputMode="numeric" maxLength={4} className={`${input} mt-1`} />
      </label>
      <label className="text-xs text-muted">
        Sieger
        <input id="hof-name" value={d.name} onChange={set('name')} maxLength={40} className={`${input} mt-1`} />
      </label>
      <label className="text-xs text-muted">
        Pot (€)
        <input id="hof-pot" value={d.pot} onChange={set('pot')} inputMode="decimal" className={`${input} mt-1`} />
      </label>
      <label className="text-xs text-muted">
        Turnier
        <input id="hof-tournament" value={d.tournament} onChange={set('tournament')} maxLength={40} className={`${input} mt-1`} />
      </label>
      <label className="text-xs text-muted">
        Datum
        <input id="hof-date" type="date" value={d.date} onChange={set('date')} className={`${input} mt-1 [color-scheme:dark]`} />
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        {d.photo ? (
          <img src={d.photo} alt="" className="h-16 w-16 rounded-xl border border-gold/40 object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-line text-muted">
            <Camera size={20} />
          </div>
        )}
        <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-xs font-semibold text-white hover:bg-white/5">
          {busy ? 'Lädt …' : d.photo ? 'Anderes Foto wählen' : 'Siegerfoto hochladen'}
          <input id="hof-photo" type="file" accept="image/*" onChange={pick} className="hidden" />
        </label>
        {d.photo && (
          <button type="button" onClick={() => setD({ ...d, photo: null })} className="text-xs text-muted hover:text-red-300">
            Foto entfernen
          </button>
        )}
        {err && <span className="text-xs text-red-300">{err}</span>}
      </div>
      <div className="flex gap-1">
        <button type="submit" className="rounded-lg p-2.5 text-accent hover:bg-white/5" aria-label="Speichern">
          <Check size={18} />
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg p-2.5 text-muted hover:bg-white/5" aria-label="Abbrechen">
          <X size={18} />
        </button>
      </div>
    </form>
  );
}

const toEntry = (d: Draft, id: string): HallOfFameEntry => ({
  id,
  year: d.year,
  name: d.name.trim(),
  pot: Math.max(0, parseFloat(d.pot.replace(',', '.')) || 0),
  tournament: d.tournament.trim() || `Steeldart-Turnier ${d.year}`,
  date: d.date || null,
  photo: d.photo,
});

export default function HallOfFameView({ goTournament }: { goTournament(): void }) {
  const { state, canEdit, update, confirm } = useLeague();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const list = [...state.hallOfFame].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  const champ = list[0];

  const t = state.tournament;
  const de = computeDE(t);
  const pending = de.champion && !t.hofEntryId ? tNames(t).get(de.champion) : null;

  const titles = new Map<string, number>();
  list.filter((e) => !e.placeholder).forEach((e) => titles.set(e.name, (titles.get(e.name) ?? 0) + 1));
  const multi = [...titles.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);

  const remove = async (e: HallOfFameEntry) => {
    const ok = await confirm({ title: 'Eintrag löschen?', message: `${e.name} (${e.year}) wird aus der Hall of Fame entfernt.`, confirmLabel: 'Löschen', danger: true });
    if (ok)
      update((s) => {
        s.hallOfFame = s.hallOfFame.filter((x) => x.id !== e.id);
        if (s.tournament.hofEntryId === e.id) s.tournament.hofEntryId = null;
      }, 'Eintrag gelöscht');
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-extrabold tablet:text-4xl">Hall of Fame</h1>

      {/* Titelverteidiger */}
      {champ ? (
        <section className="relative overflow-hidden rounded-2xl border border-gold/50 bg-gradient-to-br from-gold/20 via-panel to-panel p-6 shadow-gold sm:p-8">
          <div className="pointer-events-none absolute -right-10 -top-10 text-gold/10">
            <Trophy size={220} strokeWidth={1} />
          </div>
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
            {champ.photo ? (
              <img
                src={champ.photo}
                alt={`Siegerfoto ${champ.name}`}
                className="aspect-square w-full max-w-[18rem] shrink-0 rounded-2xl border-2 border-gold/60 object-cover shadow-gold sm:w-56 tablet:w-72"
              />
            ) : (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl border border-gold/50 bg-gold/15 text-gold">
                <Crown size={52} />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-gold">
                {champ.year === String(new Date().getFullYear() - 1) ? 'Gewinner des letzten Jahres' : 'Amtierender Champion'} · {champ.year}
              </div>
              <div className="mt-1 truncate font-display text-4xl font-extrabold sm:text-5xl tablet:text-6xl">{champ.name}</div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                <span>{champ.tournament}</span>
                {champ.date && <span>{formatDate(champ.date)}</span>}
                <span className="font-semibold text-gold">Pot: {euro(champ.pot)}</span>
              </div>
              {champ.placeholder && (
                <div className="mt-3 inline-block rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-200">
                  Platzhalter – im Admin-Modus mit dem echten Vorjahressieger überschreiben
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <Card className="px-6 py-10 text-center text-sm text-muted">Noch keine Einträge.</Card>
      )}

      {pending && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="text-sm">
            <span className="font-semibold text-gold">{pending}</span> hat „{t.name}“ gewonnen ({euro(potLedger(state).total)} Pot) und ist noch nicht eingetragen.
          </div>
          <Btn variant="gold" onClick={goTournament}>
            <Award size={16} /> Zum Turnier
          </Btn>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardTitle
            right={
              canEdit && !adding ? (
                <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs font-semibold text-accent-light hover:underline">
                  <Plus size={14} /> Eintrag hinzufügen
                </button>
              ) : null
            }
          >
            Alle Sieger
          </CardTitle>
          {adding && (
            <div className="border-t border-line">
              <EntryForm
                initial={{ year: String(new Date().getFullYear()), name: '', pot: '', tournament: '', date: '', photo: null }}
                onCancel={() => setAdding(false)}
                onSave={(d) => {
                  update((s) => void s.hallOfFame.push(toEntry(d, uid())), `${d.name} eingetragen`);
                  setAdding(false);
                }}
              />
            </div>
          )}
          <ul>
            {list.map((e, i) =>
              editing === e.id ? (
                <li key={e.id} className="border-t border-line/60">
                  <EntryForm
                    initial={{ year: e.year, name: e.name, pot: String(e.pot), tournament: e.tournament, date: e.date ?? '', photo: e.photo ?? null }}
                    onCancel={() => setEditing(null)}
                    onSave={(d) => {
                      update((s) => {
                        const idx = s.hallOfFame.findIndex((x) => x.id === e.id);
                        s.hallOfFame[idx] = toEntry(d, e.id);
                      }, 'Eintrag gespeichert');
                      setEditing(null);
                    }}
                  />
                </li>
              ) : (
                <li key={e.id} className="flex items-center gap-3 border-t border-line/60 px-4 py-3 sm:px-5">
                  <span className={`w-14 shrink-0 font-display text-lg font-extrabold tabular-nums ${i === 0 ? 'text-gold' : 'text-white/70'}`}>{e.year}</span>
                  {e.photo && <img src={e.photo} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-line object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold tablet:text-lg">
                      {i === 0 && <Crown size={15} className="mr-1.5 inline text-gold" />}
                      {e.name}
                      {e.placeholder && <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">Platzhalter</span>}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {e.tournament}
                      {e.date && ` · ${formatDate(e.date)}`}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md bg-gold/10 px-2 py-1 font-display text-sm font-bold text-gold tabular-nums">{euro(e.pot)}</span>
                  {canEdit && (
                    <>
                      <button onClick={() => setEditing(e.id)} className="rounded-lg p-2 text-muted hover:bg-white/5 hover:text-white" aria-label="Bearbeiten">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove(e)} className="rounded-lg p-2 text-muted hover:bg-red-500/10 hover:text-red-300" aria-label="Löschen">
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </li>
              ),
            )}
          </ul>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Rekorde</div>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Turniere in der Chronik</dt>
              <dd className="font-display text-2xl font-bold">{list.filter((e) => !e.placeholder).length}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Höchster Pot</dt>
              <dd className="font-display text-2xl font-bold text-gold">{list.length ? euro(Math.max(...list.map((e) => e.pot))) : '–'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Mehrfachsieger</dt>
              <dd>{multi.length ? multi.map(([n, c]) => `${n} (${c}×)`).join(', ') : 'noch keiner'}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
