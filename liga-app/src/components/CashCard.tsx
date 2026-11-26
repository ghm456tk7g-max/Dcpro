import { useState } from 'react';
import { Coins } from 'lucide-react';
import PotLedger from './PotLedger';
import { useLeague } from '../lib/league';
import { dayCash, potLedger, seasonCash } from '../lib/cash';
import { euro } from '../lib/tournament';
import { Matchday } from '../lib/types';

/** Liga-Kasse: Startgeld der Anwesenden + 180er-Einzahlungen, pro Spieltag und Saison gesamt */
export default function CashCard({ day, compact = false }: { day: Matchday; compact?: boolean }) {
  const { state } = useLeague();
  const s = state.settings;
  const c = dayCash(day, s);
  const season = seasonCash(state);
  const pot = potLedger(state).total;
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/15 via-panel to-panel p-4 shadow-gold sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gold">
            <Coins size={16} /> Kasse Spieltag {day.number}
          </div>
          <div className={`mt-1 font-display font-extrabold tabular-nums text-gold ${compact ? 'text-3xl' : 'text-4xl tablet:text-5xl'}`}>{euro(c.total)}</div>
        </div>
        <button onClick={() => setOpen(true)} className="rounded-xl border border-gold/30 px-3 py-2 text-right transition hover:bg-gold/10" title="Alle Einzahlungen anzeigen">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Aktueller Pot</div>
          <div className="font-display text-xl font-bold tabular-nums text-gold">{euro(pot)}</div>
          <div className="text-[11px] text-muted">{season.days} Spieltage · Details</div>
        </button>
      </div>
      {day.started ? (
        <div className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted">
              Startgeld · {c.attendees} Anwesende × {euro(s.dayFee)}
            </span>
            <span className="font-semibold tabular-nums">{euro(c.fees)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted">
              180er · {c.count180} × {euro(c.per180)}
              <span className="hidden sm:inline">
                {' '}
                ({s.throwerPays180 ? c.attendees : Math.max(0, c.attendees - 1)} × {euro(s.fee180)})
              </span>
            </span>
            <span className="font-semibold tabular-nums">{euro(c.bonus)}</span>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">Spieltag noch nicht gestartet – die Kasse füllt sich, sobald Spieler auf „Anwesend“ gesetzt werden.</p>
      )}
      <PotLedger open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
