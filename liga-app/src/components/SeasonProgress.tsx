import { Crown, Target } from 'lucide-react';
import { useLeague } from '../lib/league';
import { completedDays, computeOverall, currentDayNumber } from '../lib/logic';
import { MATCHDAY_COUNT } from '../lib/types';
import { ProgressBar, usePlayerName } from './ui';

export default function SeasonProgress() {
  const { state, openProfile } = useLeague();
  const name = usePlayerName();
  const done = completedDays(state);
  const current = currentDayNumber(state);
  const leader = state.seasonStarted ? computeOverall(state)[0] : null;
  const allDone = done === MATCHDAY_COUNT;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-8">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-accent-light">
            Saison {state.settings.seasonName}
          </div>
          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <h1 className="shrink-0 font-display text-2xl font-extrabold sm:text-3xl tablet:text-4xl">
              {allDone ? 'Saison abgeschlossen' : `Spieltag ${current} von ${MATCHDAY_COUNT}`}
            </h1>
            <ProgressBar pct={(done / MATCHDAY_COUNT) * 100} className="h-3 sm:flex-1" />
          </div>
          <p className="mt-2 text-sm text-muted">
            {done} von {MATCHDAY_COUNT} Spieltagen gespielt
            {!state.seasonStarted && ' · Saison noch nicht gestartet'}
          </p>
        </div>
        {leader && leader.played > 0 && (
          <button
            onClick={() => openProfile(leader.playerId)}
            className="flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-left transition hover:bg-gold/10"
          >
            <Crown className="text-gold" size={26} />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-gold/80">Tabellenführer</div>
              <div className="font-display text-lg font-bold">{name(leader.playerId)}</div>
              <div className="text-xs text-muted">{leader.points} Punkte</div>
            </div>
          </button>
        )}
        {!state.seasonStarted && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Target size={18} /> Im Admin-Bereich Spieler anlegen und Saison starten
          </div>
        )}
      </div>
    </section>
  );
}
