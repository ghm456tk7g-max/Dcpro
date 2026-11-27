import { Flame, Minus, Plus, Target } from 'lucide-react';
import { useLeague } from '../lib/league';
import { SpecialEntry } from '../lib/types';
import { Card, CardTitle, EmptyState, MatchdayPicker, PlayerLink } from '../components/ui';
import CashCard from '../components/CashCard';
import { dayCash } from '../lib/cash';
import { euro } from '../lib/tournament';
import { avgSeries } from '../lib/stats';

const empty: SpecialEntry = { s180: 0, hf: 0, bestFinish: 0 };

function Counter({ value, onChange, disabled }: { value: number; onChange(v: number): void; disabled: boolean }) {
  if (disabled) return <span className="w-16 text-center font-display text-2xl font-bold tabular-nums">{value}</span>;
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={() => onChange(Math.max(0, value - 1))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-panel2 text-muted hover:text-white active:bg-white/10" aria-label="weniger">
        <Minus size={18} />
      </button>
      <span className="w-9 text-center font-display text-2xl font-bold tabular-nums">{value}</span>
      <button onClick={() => onChange(value + 1)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-bg hover:bg-accent-light active:scale-95" aria-label="mehr">
        <Plus size={18} />
      </button>
    </div>
  );
}

export default function SpecialsView({ day: dayNo, setDay }: { day: number; setDay(n: number): void }) {
  const { state, canEdit, update } = useLeague();
  const day = state.matchdays[dayNo - 1];
  const idx = dayNo - 1;

  if (!state.seasonStarted || !day)
    return <EmptyState icon={<Flame size={30} />} title="Keine Saison aktiv" text="Hier zählt ihr 180er und High-Finishes (100+) aus Scolia mit." />;

  const pname = (id: string) => state.players.find((p) => p.id === id)?.name ?? '';
  const per180 = dayCash(day, state.settings).per180;
  const set = (pid: string, patch: Partial<SpecialEntry>) => {
    const before = day.specials[pid]?.s180 ?? 0;
    const diff = patch.s180 !== undefined ? patch.s180 - before : 0;
    update(
      (s) => {
        const d = s.matchdays[idx];
        d.specials[pid] = { ...empty, ...d.specials[pid], ...patch };
      },
      diff > 0
        ? `180! ${pname(pid)} · Kasse +${euro(per180)} (${day.attendees.length - (state.settings.throwerPays180 ? 0 : 1)} × ${euro(state.settings.fee180)})`
        : diff < 0
          ? `180 bei ${pname(pid)} zurückgenommen · Kasse −${euro(per180)}`
          : undefined,
    );
  };

  const totals = state.players
    .map((p) => {
      let s180 = 0;
      let hf = 0;
      let best = 0;
      for (const d of state.matchdays) {
        const e = d.specials[p.id];
        if (!e) continue;
        s180 += e.s180;
        hf += e.hf;
        best = Math.max(best, e.bestFinish);
      }
      return { id: p.id, s180, hf, best };
    })
    .sort((a, b) => b.s180 - a.s180 || b.hf - a.hf || b.best - a.best);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold tablet:text-4xl">Specials</h1>
        <p className="text-sm text-muted">180er und High-Finishes (100+) aus Scolia übernehmen</p>
      </div>
      <Card className="p-3 sm:p-4">
        <MatchdayPicker value={dayNo} onChange={setDay} />
      </Card>

      <CashCard day={day} compact />
      {!day.started && <Card className="p-4 text-sm text-muted">Spieltag {dayNo} ist noch nicht gestartet. 180er können erst gezählt werden, wenn unter „Spieltag“ die Anwesenden eingetragen sind.</Card>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardTitle>Spieltag {dayNo}</CardTitle>
          <div className="hidden grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted sm:grid">
            <span>Spieler</span>
            <span className="w-[136px] text-center">180er</span>
            <span className="w-[136px] text-center">High-Finishes</span>
            <span className="w-24 text-center">Höchstes</span>
            <span className="w-24 text-center text-accent-light">Average</span>
          </div>
          <ul>
            {day.attendees.map((pid) => {
              const e = { ...empty, ...day.specials[pid] };
              return (
                <li key={pid} className="grid grid-cols-2 items-center gap-3 border-t border-line/60 px-4 py-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:gap-4 sm:px-5">
                  <PlayerLink id={pid} className="col-span-2 font-semibold sm:col-span-1 tablet:text-xl" />
                  <div className="flex flex-col items-center gap-1 sm:w-[136px]">
                    <span className="text-[10px] font-semibold uppercase text-muted sm:hidden">180er</span>
                    <Counter value={e.s180} disabled={!canEdit} onChange={(v) => set(pid, { s180: v })} />
                  </div>
                  <div className="flex flex-col items-center gap-1 sm:w-[136px]">
                    <span className="text-[10px] font-semibold uppercase text-muted sm:hidden">High-Finishes</span>
                    <Counter value={e.hf} disabled={!canEdit} onChange={(v) => set(pid, { hf: v })} />
                  </div>
                  <div className="flex flex-col items-center justify-center gap-1 sm:w-24">
                    <span className="text-[10px] font-semibold uppercase text-muted sm:hidden">Höchstes Finish</span>
                    {canEdit ? (
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={170}
                        placeholder="–"
                        defaultValue={e.bestFinish || ''}
                        key={`${pid}-${e.bestFinish}`}
                        onBlur={(ev) => {
                          const v = Math.min(170, Math.max(0, parseInt(ev.target.value || '0', 10) || 0));
                          if (v !== e.bestFinish) set(pid, { bestFinish: v, hf: v >= 100 && e.hf === 0 ? 1 : e.hf });
                        }}
                        className="w-20 rounded-lg border border-line bg-panel2 px-2 py-2 text-center font-display font-bold"
                      />
                    ) : (
                      <span className="font-display text-lg font-bold">{e.bestFinish || '–'}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-center justify-center gap-1 sm:w-24">
                    <span className="text-[10px] font-semibold uppercase text-accent-light sm:hidden">Average</span>
                    {canEdit ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Ø"
                        aria-label="3-Dart-Average"
                        defaultValue={typeof e.avg === 'number' ? String(e.avg).replace('.', ',') : ''}
                        key={`${pid}-avg-${e.avg ?? ''}`}
                        onBlur={(ev) => {
                          const raw = ev.target.value.trim().replace(',', '.');
                          const n = raw === '' ? null : Math.round(Math.min(180, Math.max(0, parseFloat(raw) || 0)) * 100) / 100;
                          const next = n === 0 ? null : n;
                          if (next !== (e.avg ?? null)) set(pid, { avg: next });
                        }}
                        className="w-20 rounded-lg border border-accent/40 bg-panel2 px-2 py-2 text-center font-display font-bold"
                      />
                    ) : (
                      <span className="font-display text-lg font-bold text-accent-light">{typeof e.avg === 'number' ? e.avg.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : '–'}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardTitle>Saison-Bestenliste</CardTitle>
          <table className="w-full text-sm tablet:text-lg">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2 text-left font-semibold">Spieler</th>
                <th className="px-2 py-2 text-right font-semibold">
                  <Flame size={13} className="mr-1 inline" />
                  180er
                </th>
                <th className="px-2 py-2 text-right font-semibold">
                  <Target size={13} className="mr-1 inline" />
                  HF
                </th>
                <th className="px-2 py-2 text-right font-semibold">Höchstes</th>
                <th className="px-4 py-2 text-right font-semibold text-accent-light">Ø Avg</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t, i) => (
                <tr key={t.id} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="mr-2 text-xs text-muted">{i + 1}.</span>
                    <PlayerLink id={t.id} className="font-semibold" />
                  </td>
                  <td className="px-2 py-2.5 text-right font-display font-bold tabular-nums text-accent-light">{t.s180}</td>
                  <td className="px-2 py-2.5 text-right font-display font-bold tabular-nums">{t.hf}</td>
                  <td className="px-2 py-2.5 text-right font-display font-bold tabular-nums text-gold">{t.best || '–'}</td>
                  <td className="px-4 py-2.5 text-right font-display font-bold tabular-nums text-accent-light">
                    {(() => {
                      const m = avgSeries(state, t.id).mean;
                      return m !== null ? m.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–';
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
