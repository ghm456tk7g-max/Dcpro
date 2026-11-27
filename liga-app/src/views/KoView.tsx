import { useState } from 'react';
import { GitBranch, Hourglass } from 'lucide-react';
import { useLeague } from '../lib/league';
import { computeKo, KoMatchView, playedCount, pruneKoResults, roundName } from '../lib/logic';
import Bracket from '../components/Bracket';
import ResultModal, { ResultTarget } from '../components/ResultModal';
import { Card, EmptyState, MatchdayPicker, ProgressBar } from '../components/ui';

export default function KoView({ day: dayNo, setDay }: { day: number; setDay(n: number): void }) {
  const { state, canEdit, update } = useLeague();
  const [target, setTarget] = useState<ResultTarget | null>(null);
  const day = state.matchdays[dayNo - 1];
  const idx = dayNo - 1;

  if (!state.seasonStarted || !day)
    return <EmptyState icon={<GitBranch size={30} />} title="Keine Saison aktiv" text="Die K.O.-Phase wird pro Spieltag aus der Tages-Tabelle erzeugt." />;

  const ko = computeKo(day, state.players);
  const played = playedCount(day);

  const onMatch = (b: 'U' | 'L') => (m: KoMatchView) => {
    if (!canEdit || !m.p1 || !m.p2) return;
    const total = (b === 'U' ? ko.upper : ko.lower).rounds.length;
    setTarget({
      title: `${b === 'U' ? 'Gewinner' : 'Loser'}-Bracket · ${roundName(m.round, total)}`,
      p1: m.p1,
      p2: m.p2,
      s1: m.s1,
      s2: m.s2,
      firstTo: state.settings.koLegs,
      onSave: (s1, s2) =>
        update((s) => {
          const d = s.matchdays[idx];
          d.koResults[m.id] = { p1: m.p1!, p2: m.p2!, s1, s2, playedAt: d.koResults[m.id]?.playedAt ?? new Date().toISOString() };
          pruneKoResults(d, s.players);
        }, 'K.O.-Ergebnis gespeichert'),
      onClear: () =>
        update((s) => {
          const d = s.matchdays[idx];
          delete d.koResults[m.id];
          pruneKoResults(d, s.players);
        }, 'K.O.-Ergebnis gelöscht'),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tablet:text-4xl">K.O.-Phase · Spieltag {dayNo}</h1>
          <p className="text-sm text-muted">
            Obere Hälfte der Tages-Tabelle → Gewinner-Bracket, untere Hälfte → Loser-Bracket · Best of {state.settings.koLegs * 2 - 1}
          </p>
        </div>
      </div>
      <Card className="p-3 sm:p-4">
        <MatchdayPicker value={dayNo} onChange={setDay} />
      </Card>

      {!ko.ready ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <Hourglass className="text-amber-300" size={30} />
          <div className="font-display text-xl font-bold">Ligaphase läuft noch</div>
          <p className="max-w-md text-sm text-muted">
            Die Brackets werden automatisch aus der Tages-Tabelle ermittelt, sobald alle Ligaspiele von Spieltag {dayNo} eingetragen sind.
          </p>
          <div className="w-full max-w-xs">
            <ProgressBar pct={day.matches.length ? (played / day.matches.length) * 100 : 0} />
            <div className="mt-1 text-xs text-muted">
              {played} / {day.matches.length} Ligaspiele
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Bracket view={ko.upper} title="Gewinner-Bracket (Upper)" accent="gold" onMatchClick={canEdit ? onMatch('U') : undefined} />
          <Bracket view={ko.lower} title="Loser-Bracket (Lower)" accent="silver" onMatchClick={canEdit ? onMatch('L') : undefined} />
          <p className="px-1 text-xs text-muted">
            Freilose gehen bei ungerader Spielerzahl an die bestplatzierten Spieler des jeweiligen Brackets. Die Zahl vor dem Namen ist die Setzposition.
          </p>
        </>
      )}
      <ResultModal target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
