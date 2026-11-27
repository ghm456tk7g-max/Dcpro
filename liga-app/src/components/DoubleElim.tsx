import { ReactNode } from 'react';
import { Heart, Trophy } from 'lucide-react';
import { DEBracket, DEMatchView, DEView, deLabel, srcLabel } from '../lib/tournament';

function Slot({ id, fallback, tag, score, win, decided }: { id: string | null; fallback: string; tag?: string; score: number | null; win: boolean; decided: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 ${win ? 'bg-accent/15' : ''} ${decided && !win ? 'text-white/45' : ''}`}>
      <span className="w-6 shrink-0 text-[10px] font-bold text-muted">{tag ?? ''}</span>
      <span className={`min-w-0 flex-1 truncate text-sm tablet:text-lg ${win ? 'font-bold' : ''} ${id ? '' : 'italic text-muted'}`}>{fallback}</span>
      <span className={`w-5 shrink-0 text-right font-display font-bold tabular-nums ${win ? 'text-accent-light' : ''}`}>{score ?? ''}</span>
    </div>
  );
}

export function DEMatchCard({
  m,
  de,
  names,
  tags,
  current,
  onClick,
}: {
  m: DEMatchView;
  de: DEView;
  names: Map<string, string>;
  tags: Map<string, string>;
  current: boolean;
  onClick?(m: DEMatchView): void;
}) {
  const decided = !!m.winner;
  const label1 = m.p1 ? names.get(m.p1) ?? '—' : srcLabel(m.a, names);
  const label2 = m.p2 ? names.get(m.p2) ?? '—' : srcLabel(m.b, names);
  const clickable = !!onClick && m.active && !!m.p1 && !!m.p2;
  if (!m.active)
    return (
      <div className="rounded-xl border border-dashed border-line px-3 py-3 text-xs text-muted">
        <div className="mb-0.5 font-semibold">{deLabel(m, de.plan)}</div>
        Nur nötig, wenn der Spieler aus dem Losers Bracket das 1. Finale gewinnt.
      </div>
    );
  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <span>{m.id}</span>
        {current && <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-amber-300">Jetzt am Board</span>}
      </div>
      <button
        disabled={!clickable}
        onClick={() => onClick?.(m)}
        className={`w-full divide-y divide-line overflow-hidden rounded-xl border bg-panel text-left transition ${
          current ? 'border-amber-400/60 ring-2 ring-amber-400/20' : 'border-line'
        } ${clickable ? 'hover:border-accent/60' : ''}`}
      >
        <Slot id={m.p1} fallback={label1} tag={m.p1 ? tags.get(m.p1) : undefined} score={m.s1} win={decided && m.winner === m.p1} decided={decided} />
        <Slot id={m.p2} fallback={label2} tag={m.p2 ? tags.get(m.p2) : undefined} score={m.s2} win={decided && m.winner === m.p2} decided={decided} />
      </button>
    </div>
  );
}

function Section({
  title,
  sub,
  icon,
  bracket,
  de,
  names,
  tags,
  currentId,
  onClick,
  tone,
}: {
  title: string;
  sub: string;
  icon: ReactNode;
  bracket: DEBracket[];
  de: DEView;
  names: Map<string, string>;
  tags: Map<string, string>;
  currentId: string | null;
  onClick?(m: DEMatchView): void;
  tone: string;
}) {
  const ms = de.matches.filter((m) => bracket.includes(m.bracket));
  const rounds = [...new Set(ms.map((m) => `${m.bracket}-${m.round}`))];
  if (!ms.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-4 sm:px-5">
        <h2 className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] ${tone}`}>
          {icon} {title}
        </h2>
        <span className="text-xs text-muted">{sub}</span>
      </div>
      <div className="overflow-x-auto px-4 pb-4 sm:px-5">
        <div className="flex min-w-max gap-5">
          {rounds.map((key) => {
            const roundMs = ms.filter((m) => `${m.bracket}-${m.round}` === key);
            return (
              <div key={key} className="flex w-56 flex-col tablet:w-64">
                <div className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted">{deLabel(roundMs[0], de.plan)}</div>
                <div className="flex flex-1 flex-col justify-around gap-3">
                  {roundMs.map((m) => (
                    <DEMatchCard key={m.id} m={m} de={de} names={names} tags={tags} current={m.id === currentId} onClick={onClick} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function DoubleElim({
  de,
  names,
  tags,
  currentId,
  onClick,
}: {
  de: DEView;
  names: Map<string, string>;
  tags: Map<string, string>;
  currentId: string | null;
  onClick?(m: DEMatchView): void;
}) {
  const p = de.plan;
  return (
    <div className="flex flex-col gap-4">
      {(p.wbByes.length > 0 || p.lbByes.length > 0) && (
        <p className="px-1 text-xs text-muted">
          Freilose:{' '}
          {[...p.wbByes.map((id) => `${names.get(id)} (Winners)`), ...p.lbByes.map((id) => `${names.get(id)} (Losers)`)].join(', ')}
        </p>
      )}
      <Section
        title="Winners Bracket"
        sub="2 Leben · Verlierer fallen ins Losers Bracket"
        icon={
          <span className="flex">
            <Heart size={14} fill="currentColor" />
            <Heart size={14} fill="currentColor" />
          </span>
        }
        bracket={['W']}
        de={de}
        names={names}
        tags={tags}
        currentId={currentId}
        onClick={onClick}
        tone="text-gold"
      />
      <Section
        title="Losers Bracket"
        sub="1 Leben · wer verliert, ist raus"
        icon={<Heart size={14} fill="currentColor" />}
        bracket={['L']}
        de={de}
        names={names}
        tags={tags}
        currentId={currentId}
        onClick={onClick}
        tone="text-silver"
      />
      <Section
        title="Finale"
        sub="Sieger Winners vs. Sieger Losers"
        icon={<Trophy size={15} />}
        bracket={['GF', 'GF2']}
        de={de}
        names={names}
        tags={tags}
        currentId={currentId}
        onClick={onClick}
        tone="text-accent-light"
      />
    </div>
  );
}
