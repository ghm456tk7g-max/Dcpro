import { useState } from 'react';
import { ListOrdered } from 'lucide-react';
import { useLeague } from '../lib/league';
import { computeDay, computeOverall } from '../lib/logic';
import { RANKS, rangeLabel } from '../lib/ranks';
import StandingsTable from '../components/StandingsTable';
import RankBadge from '../components/RankBadge';
import { Card, EmptyState, MatchdayPicker, Segmented } from '../components/ui';

export default function RankingView({ day, setDay }: { day: number; setDay(n: number): void }) {
  const { state } = useLeague();
  const [mode, setMode] = useState<'total' | 'day'>('total');

  if (!state.players.length)
    return <EmptyState icon={<ListOrdered size={30} />} title="Noch keine Spieler" text="Sobald Spieler angelegt sind, erscheint hier die Rangliste." />;

  const overall = computeOverall(state);
  const rankPoints = new Map(overall.map((r) => [r.playerId, r.points]));
  const md = state.matchdays[day - 1];
  const dayRes = md ? computeDay(md, state.players) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold tablet:text-4xl">Rangliste</h1>
        <Segmented<"total" | "day">
          value={mode}
          onChange={setMode}
          options={[
            { value: 'total', label: <><span className="sm:hidden">Gesamt</span><span className="hidden sm:inline">Gesamttabelle (12 Spieltage)</span></> },
            { value: 'day', label: <><span className="sm:hidden">Spieltag {day}</span><span className="hidden sm:inline">Tages-Tabelle (Spieltag {day})</span></> },
          ]}
        />
      </div>

      {mode === 'day' && (
        <Card className="p-3 sm:p-4">
          <MatchdayPicker value={day} onChange={setDay} />
        </Card>
      )}

      <Card>
        {mode === 'total' ? (
          <StandingsTable rows={overall} rankPoints={rankPoints} />
        ) : dayRes ? (
          <StandingsTable rows={dayRes.rows} rankPoints={rankPoints} winnerId={dayRes.winnerId} />
        ) : (
          <p className="p-5 text-sm text-muted">Für diesen Spieltag gibt es noch keinen Spielplan.</p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4 text-sm text-muted sm:p-5">
          <div className="mb-2 font-semibold text-white">Punktesystem</div>
          <ul className="space-y-1">
            <li>Sieg im Ligaspiel = <b className="text-accent-light">1 Punkt</b>, Niederlage = 0 Punkte</li>
            <li>Tagessieg (1. Platz Tages-Tabelle) = <b className="text-gold">+2 Bonuspunkte</b></li>
            <li>Sortierung: Punkte → Leg-Differenz → gewonnene Legs → direkter Vergleich</li>
            <li>Spieler antippen öffnet das Oche-Profil</li>
          </ul>
        </Card>
        <Card className="p-4 sm:p-5">
          <div className="mb-3 text-sm font-semibold text-white">Divisionen</div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {RANKS.map((r) => (
              <div key={r.name} className="flex flex-col items-center gap-1 text-center">
                <RankBadge rank={r} size={36} />
                <div className="text-[11px] font-semibold leading-tight">{r.name}</div>
                <div className="text-[10px] text-muted">{rangeLabel(r)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
