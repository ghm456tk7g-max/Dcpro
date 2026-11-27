import { Crown } from 'lucide-react';
import { useLeague } from '../lib/league';
import { formatDiff, StatRow } from '../lib/logic';
import { rankFor } from '../lib/ranks';
import RankBadge from './RankBadge';

function Label({ long, short, compact }: { long: string; short: string; compact: boolean }) {
  if (compact) return <span title={long}>{short}</span>;
  return (
    <>
      <span className="hidden sm:inline">{long}</span>
      <span className="sm:hidden">{short}</span>
    </>
  );
}

const placeStyle = (i: number) =>
  i === 0
    ? 'bg-gradient-to-br from-gold to-gold-dark text-bg'
    : i === 1
      ? 'bg-gradient-to-br from-silver to-slate-500 text-bg'
      : i === 2
        ? 'bg-gradient-to-br from-bronze to-amber-900 text-white'
        : 'bg-white/5 text-muted';

/**
 * Spalten exakt: Platz | Spieler | Spiele | Siege | Niederlagen | Legs | Leg-Diff | Tagessiege | Punkte
 * rankPoints: Gesamtpunkte je Spieler für das Rang-Icon (auch in der Tages-Tabelle)
 */
export default function StandingsTable({
  rows,
  rankPoints,
  compact = false,
  winnerId,
}: {
  rows: StatRow[];
  rankPoints: Map<string, number>;
  compact?: boolean;
  winnerId?: string | null;
}) {
  const { state, openProfile } = useLeague();
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? '—';
  const th = 'px-2 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted';
  const td = 'px-2 py-2.5 text-right tabular-nums';

  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${compact ? 'text-sm' : 'text-sm sm:text-[15px]'} tablet:text-lg`}>
        <thead>
          <tr className="border-b border-line">
            <th className={`${th} w-12 pl-4 text-left`}>Platz</th>
            <th className={`${th} sticky left-0 bg-panel text-left`}>Spieler</th>
            <th className={th}>Spiele</th>
            <th className={th}>Siege</th>
            <th className={th}>
              <Label long="Niederlagen" short="Ndl." compact={compact} />
            </th>
            <th className={th}>Legs</th>
            <th className={th}>
              <Label long="Leg-Diff." short="+/-" compact={compact} />
            </th>
            <th className={th}>
              <Label long="Tagessiege" short="TS" compact={compact} />
            </th>
            <th className={`${th} pr-4 text-white`}>Punkte</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const rank = rankFor(rankPoints.get(r.playerId) ?? 0);
            return (
              <tr
                key={r.playerId}
                onClick={() => openProfile(r.playerId)}
                className={`cursor-pointer border-b border-line/60 transition last:border-0 hover:bg-white/[0.03] ${
                  r.playerId === winnerId ? 'bg-gold/[0.06]' : ''
                }`}
              >
                <td className="py-2.5 pl-4 pr-2">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg font-display text-sm font-bold tablet:h-9 tablet:w-9 tablet:text-base ${placeStyle(i)}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="sticky left-0 max-w-[11rem] bg-panel px-2 py-2.5 sm:max-w-none">
                  <div className="flex items-center gap-2">
                    <RankBadge rank={rank} size={22} className="shrink-0 tablet:hidden" />
                    <RankBadge rank={rank} size={30} className="hidden shrink-0 tablet:block" />
                    <span className="truncate font-semibold">{name(r.playerId)}</span>
                    {r.playerId === winnerId && <Crown size={16} className="shrink-0 text-gold" />}
                  </div>
                </td>
                <td className={td}>{r.played}</td>
                <td className={`${td} text-accent-light`}>{r.wins}</td>
                <td className={`${td} text-red-300/80`}>{r.losses}</td>
                <td className={`${td} whitespace-nowrap text-white/80`}>
                  {r.legsFor}:{r.legsAgainst}
                </td>
                <td className={`${td} ${r.diff > 0 ? 'text-accent-light' : r.diff < 0 ? 'text-red-300/80' : 'text-muted'}`}>
                  {formatDiff(r.diff)}
                </td>
                <td className={`${td} text-gold`}>{r.dayWins || <span className="text-muted">0</span>}</td>
                <td className={`${td} pr-4`}>
                  <span className="font-display text-base font-extrabold text-white tablet:text-2xl">{r.points}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
