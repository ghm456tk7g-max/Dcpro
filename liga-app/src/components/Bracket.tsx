import { Trophy } from 'lucide-react';
import { BracketView, KoMatchView, roundName } from '../lib/logic';
import { usePlayerName } from './ui';

function Slot({
  id,
  seed,
  score,
  winner,
  decided,
}: {
  id: string | null;
  seed: number | null;
  score: number | null;
  winner: boolean;
  decided: boolean;
}) {
  const name = usePlayerName();
  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-2 ${
        winner ? 'bg-accent/15 text-white' : decided ? 'text-white/45' : 'text-white'
      }`}
    >
      <span className="w-5 shrink-0 text-center text-[11px] font-bold text-muted">{seed ?? ''}</span>
      <span className={`min-w-0 flex-1 truncate text-sm tablet:text-lg ${winner ? 'font-bold' : ''} ${!id ? 'italic text-muted' : ''}`}>
        {id ? name(id) : 'offen'}
      </span>
      <span className={`w-6 shrink-0 text-right font-display font-bold tabular-nums tablet:text-xl ${winner ? 'text-accent-light' : ''}`}>
        {score ?? ''}
      </span>
    </div>
  );
}

function MatchCard({ m, onClick }: { m: KoMatchView; onClick?(m: KoMatchView): void }) {
  const name = usePlayerName();
  if (m.bye) {
    const who = m.p1 ?? m.p2;
    return (
      <div className="w-full rounded-xl border border-dashed border-line bg-panel/50 px-3 py-2.5 text-sm">
        <div className="truncate font-semibold">{name(who)}</div>
        <div className="text-xs text-muted">Freilos · kampflos weiter</div>
      </div>
    );
  }
  const clickable = !!onClick && !!m.p1 && !!m.p2;
  const decided = m.winner !== null;
  return (
    <button
      disabled={!clickable}
      onClick={() => onClick?.(m)}
      className={`w-full overflow-hidden rounded-xl border bg-panel text-left transition ${
        clickable ? 'border-line hover:border-accent/60' : 'border-line'
      } ${!decided && m.p1 && m.p2 ? 'ring-1 ring-amber-400/30' : ''} divide-y divide-line`}
    >
      <Slot id={m.p1} seed={m.seed1} score={m.s1} winner={decided && m.winner === m.p1} decided={decided} />
      <Slot id={m.p2} seed={m.seed2} score={m.s2} winner={decided && m.winner === m.p2} decided={decided} />
    </button>
  );
}

export default function Bracket({
  view,
  title,
  accent,
  onMatchClick,
}: {
  view: BracketView;
  title: string;
  accent: 'gold' | 'silver';
  onMatchClick?(m: KoMatchView): void;
}) {
  const name = usePlayerName();
  const color = accent === 'gold' ? 'text-gold' : 'text-silver';
  return (
    <section className="rounded-2xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-4 sm:px-5">
        <h2 className={`text-sm font-semibold uppercase tracking-[0.14em] ${color}`}>{title}</h2>
        <span className="text-xs text-muted">{view.seeds.length} Spieler</span>
      </div>
      {view.seeds.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">Keine Spieler in diesem Bracket.</p>
      ) : (
        <div className="overflow-x-auto px-4 pb-4 sm:px-5">
          <div className="flex min-w-max gap-5">
            {view.rounds.map((round, ri) => (
              <div key={ri} className="flex w-52 flex-col tablet:w-64">
                <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {roundName(ri, view.rounds.length)}
                </div>
                <div className="flex flex-1 flex-col justify-around gap-3">
                  {round.map((m) => (
                    <div key={m.id} className="relative">
                      <MatchCard m={m} onClick={onMatchClick} />
                      {ri < view.rounds.length - 1 && <span className="absolute -right-5 top-1/2 h-px w-5 bg-line" />}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex w-44 flex-col justify-center tablet:w-56">
              <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">Sieger</div>
              <div
                className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-4 text-center ${
                  view.champion ? (accent === 'gold' ? 'border-gold/60 bg-gold/10 shadow-gold' : 'border-silver/50 bg-white/5') : 'border-dashed border-line'
                }`}
              >
                <Trophy className={view.champion ? color : 'text-muted'} size={26} />
                <div className={`font-display text-lg font-bold ${view.champion ? '' : 'text-muted'}`}>
                  {view.champion ? name(view.champion) : 'noch offen'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
