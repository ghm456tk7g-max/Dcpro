import { Info, TrendingUp } from 'lucide-react';
import { fmtOdds, Odds } from '../lib/stats';
import { Modal } from './ui';

/** Erklärt, wie eine Quote zustande kommt */
export default function OddsModal({ data, onClose }: { data: { a: string; b: string; nameA: string; nameB: string; odds: Odds } | null; onClose(): void }) {
  if (!data) return null;
  const { nameA, nameB, odds } = data;
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const total = odds.factors.reduce((s, f) => s + Math.abs(f.points), 0) || 1;
  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <TrendingUp size={18} className="text-gold" /> Wettquote
        </span>
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <div>
            <div className="truncate font-display text-lg font-bold">{nameA}</div>
            <div className={`mt-1 font-display text-3xl font-extrabold tabular-nums ${odds.favorite === 'a' ? 'text-accent-light' : 'text-white'}`}>{fmtOdds(odds.oddsA)}</div>
            <div className="text-xs text-muted">Siegchance {pct(odds.pA)}</div>
          </div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted">vs</div>
          <div>
            <div className="truncate font-display text-lg font-bold">{nameB}</div>
            <div className={`mt-1 font-display text-3xl font-extrabold tabular-nums ${odds.favorite === 'b' ? 'text-accent-light' : 'text-white'}`}>{fmtOdds(odds.oddsB)}</div>
            <div className="text-xs text-muted">Siegchance {pct(odds.pB)}</div>
          </div>
        </div>
        {/* Wahrscheinlichkeits-Balken */}
        <div className="flex h-3 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${nameA} ${pct(odds.pA)}, ${nameB} ${pct(odds.pB)}`}>
          <div className="h-full bg-accent" style={{ width: `${odds.pA * 100}%` }} />
          <div className="h-full w-[2px] bg-bg" />
          <div className="h-full flex-1 bg-gold" />
        </div>

        <div className="rounded-xl border border-line bg-panel">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <span>Faktor</span>
            <span className="w-24 truncate text-right">{nameA}</span>
            <span className="w-24 truncate text-right">{nameB}</span>
          </div>
          {odds.factors.map((f) => (
            <div key={f.label} className="border-t border-line/60 px-3 py-2 text-sm first:border-0">
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3">
                <span className="text-white/90">{f.label}</span>
                <span className={`w-24 text-right tabular-nums tracking-wide ${f.points > 1 ? 'font-semibold text-accent-light' : ''}`}>{f.a}</span>
                <span className={`w-24 text-right tabular-nums tracking-wide ${f.points < -1 ? 'font-semibold text-gold' : ''}`}>{f.b}</span>
              </div>
              {/* Gewicht des Faktors: Ausschlag nach links = Vorteil A, rechts = Vorteil B */}
              <div className="mt-1.5 flex h-1.5 items-center">
                <div className="flex h-full flex-1 justify-end rounded-l-full bg-white/5">
                  {f.points > 0 && <div className="h-full rounded-l-full bg-accent" style={{ width: `${(f.points / total) * 100}%` }} />}
                </div>
                <div className="h-3 w-px bg-white/30" />
                <div className="h-full flex-1 rounded-r-full bg-white/5">
                  {f.points < 0 && <div className="h-full rounded-r-full bg-gold" style={{ width: `${(-f.points / total) * 100}%` }} />}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="flex gap-2 text-xs text-muted">
          <Info size={14} className="mt-0.5 shrink-0" />
          Die Quote berechnet sich aus allen bisherigen Spielen: Stärke-Rating (Siege gegen starke Gegner zählen mehr, 2:0 mehr als 2:1), Form der letzten 5 Spiele (S = Sieg, N = Niederlage),
          Punkte pro Spiel, direkter Vergleich und – falls eingetragen – Average. Bei wenigen Spielen bleiben die Quoten bewusst vorsichtig. Nur zum Spaß, keine echten Wetten.
        </p>
      </div>
    </Modal>
  );
}
