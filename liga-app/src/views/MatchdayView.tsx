import { useMemo, useState } from 'react';
import { CalendarDays, Crown, Play, Shuffle, Users, RotateCcw, Swords, UserCheck, UserX, AlertTriangle } from 'lucide-react';
import { useLeague } from '../lib/league';
import { shuffle } from '../lib/tournament';
import { buildMatches, computeDay, computeOverall, formatDate, isPlayed, playedCount, pruneKoResults } from '../lib/logic';
import { LeagueMatch } from '../lib/types';
import ResultModal, { ResultTarget } from '../components/ResultModal';
import SeasonProgress from '../components/SeasonProgress';
import CashCard from '../components/CashCard';
import OddsModal from '../components/OddsModal';
import { buildOddsModel, fmtOdds, matchOdds, Odds } from '../lib/stats';
import { euro } from '../lib/tournament';
import { dayCash } from '../lib/cash';
import StandingsTable from '../components/StandingsTable';
import { Btn, Card, CardTitle, EmptyState, MatchdayPicker, ProgressBar, usePlayerName } from '../components/ui';

export default function MatchdayView({ day: dayNo, setDay, goAdmin }: { day: number; setDay(n: number): void; goAdmin(): void }) {
  const { state, canEdit, update, confirm, openProfile, isAdmin } = useLeague();
  const name = usePlayerName();
  const [target, setTarget] = useState<ResultTarget | null>(null);
  const [rolling, setRolling] = useState(false);
  const oddsModel = useMemo(() => buildOddsModel(state), [state]);
  const [oddsView, setOddsView] = useState<{ a: string; b: string; nameA: string; nameB: string; odds: Odds } | null>(null);
  const day = state.matchdays[dayNo - 1];

  if (!state.seasonStarted || !day) {
    return (
      <div className="flex flex-col gap-4">
        <SeasonProgress />
        <EmptyState
          icon={<Swords size={30} />}
          title="Noch keine Saison gestartet"
          text="Lege im Admin-Bereich die Spieler an und starte die Saison mit 12 Spieltagen – oder lade die Demo-Daten zum Ausprobieren."
          action={<Btn onClick={goAdmin}>{isAdmin ? 'Zum Admin-Bereich' : 'Admin-Anmeldung'}</Btn>}
        />
      </div>
    );
  }

  const res = computeDay(day, state.players);
  const overall = computeOverall(state);
  const rankPoints = new Map(overall.map((r) => [r.playerId, r.points]));
  const played = playedCount(day);
  const legs = state.settings.leagueLegs;
  const rounds = [...new Set(day.matches.map((m) => m.round))].sort((a, b) => a - b);
  const idx = dayNo - 1;

  const fee = state.settings.dayFee;

  const startDay = () =>
    update((s) => {
      const d = s.matchdays[idx];
      d.started = true;
      d.attendees = [];
      d.matches = [];
      d.specials = {};
      d.koResults = {};
      d.winnerOverride = null;
      if (!d.date) d.date = new Date().toISOString().slice(0, 10);
    }, `Spieltag ${dayNo} gestartet – jetzt die Anwesenden antippen`);

  const undoStart = () => update((s) => void (s.matchdays[idx].started = false), 'Start zurückgenommen');

  const allPresent = () =>
    update((s) => {
      const d = s.matchdays[idx];
      d.attendees = s.players.map((p) => p.id);
      d.matches = buildMatches(d.attendees, d.matches);
    }, `Alle anwesend · Kasse ${euro(dayCash({ ...day, attendees: state.players.map((p) => p.id) }, state.settings).total)}`);

  const toggleAttendance = async (pid: string) => {
    const present = day.attendees.includes(pid);
    if (present) {
      const lost = day.matches.filter((m) => isPlayed(m) && (m.a === pid || m.b === pid)).length;
      if (
        lost &&
        !(await confirm({
          title: `${name(pid)} abwesend setzen?`,
          message: `${lost} bereits eingetragene Ergebnis(se) von ${name(pid)} an diesem Spieltag werden gelöscht.`,
          confirmLabel: 'Abwesend setzen',
          danger: true,
        }))
      )
        return;
    }
    update((s) => {
      const d = s.matchdays[idx];
      const order = s.players.map((p) => p.id);
      d.attendees = present ? d.attendees.filter((x) => x !== pid) : order.filter((x) => d.attendees.includes(x) || x === pid);
      d.matches = buildMatches(d.attendees, d.matches);
      if (d.winnerOverride && !d.attendees.includes(d.winnerOverride)) d.winnerOverride = null;
      delete d.specials[pid];
      if (present) {
        // ohne Startgeld kein Wettguthaben: eigene Wetten und Tipps auf ihn werden zurückgenommen
        d.bets = (d.bets ?? []).filter((b) => b.bettor !== pid && b.pick !== pid);
        if (d.events?.first180 === pid) d.events.first180 = null;
      }
      pruneKoResults(d, s.players);
    }, present ? `${name(pid)} abwesend · Kasse −${euro(fee)}` : `${name(pid)} anwesend · Kasse +${euro(fee)}`);
  };

  const openMatch = (m: LeagueMatch) => {
    if (!canEdit) return;
    setTarget({
      title: `Spieltag ${dayNo} · Ligaspiel`,
      p1: m.a,
      p2: m.b,
      s1: m.legsA,
      s2: m.legsB,
      firstTo: legs,
      onSave: (a, b) =>
        update((s) => {
          const d = s.matchdays[idx];
          const mm = d.matches.find((x) => x.id === m.id)!;
          mm.legsA = a;
          mm.legsB = b;
          mm.playedAt = mm.playedAt ?? new Date().toISOString();
          pruneKoResults(d, s.players);
        }, `${name(m.a)} ${a}:${b} ${name(m.b)} gespeichert`),
      onClear: () =>
        update((s) => {
          const d = s.matchdays[idx];
          const mm = d.matches.find((x) => x.id === m.id)!;
          mm.legsA = null;
          mm.legsB = null;
          mm.playedAt = null;
          pruneKoResults(d, s.players);
        }, 'Ergebnis gelöscht'),
    });
  };

  const shuffleMatches = () => {
    setRolling(true);
    setTimeout(() => {
      update((s) => {
        const d = s.matchdays[idx];
        d.matches = buildMatches(shuffle(d.attendees), d.matches);
      }, played ? 'Partien neu gemischt (Ergebnisse bleiben erhalten)' : 'Partien neu gemischt');
      setRolling(false);
    }, 600);
  };

  const setOverride = (pid: string | null) =>
    update((s) => {
      const d = s.matchdays[idx];
      d.winnerOverride = pid;
      pruneKoResults(d, s.players);
    }, pid ? `Tagessieg an ${name(pid)} vergeben` : 'Tagessieg wieder automatisch');

  return (
    <div className="flex flex-col gap-4">
      <SeasonProgress />

      <Card className="p-3 sm:p-4">
        <MatchdayPicker value={dayNo} onChange={setDay} />
      </Card>

      {/* Kopf des Spieltags */}
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 className="font-display text-2xl font-extrabold tablet:text-4xl">Spieltag {dayNo}</h2>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-muted">
            <CalendarDays size={15} />
            {canEdit ? (
              <input
                type="date"
                value={day.date ?? ''}
                onChange={(e) => update((s) => void (s.matchdays[idx].date = e.target.value || null))}
                className="rounded-md border border-line bg-panel px-2 py-0.5 text-white [color-scheme:dark]"
              />
            ) : (
              <span>{day.date ? formatDate(day.date) : 'Datum offen'}</span>
            )}
            <span>· {day.attendees.length} Spieler anwesend</span>
          </div>
        </div>
        <div className="w-full sm:w-64">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Ligaspiele</span>
            <span>
              {played} / {day.matches.length}
            </span>
          </div>
          <ProgressBar pct={day.matches.length ? (played / day.matches.length) * 100 : 0} />
        </div>
      </div>

      {/* Spieltag noch nicht gestartet */}
      {!day.started && (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <div className="rounded-2xl bg-accent/10 p-4 text-accent">
            <Users size={30} />
          </div>
          <div className="font-display text-xl font-bold">Spieltag {dayNo} ist noch nicht gestartet</div>
          <p className="max-w-md text-sm text-muted">
            Beim Start tippt ihr an, wer da ist. Jeder Anwesende zahlt {euro(fee)} Startgeld in die Kasse, jede 180 kostet {euro(state.settings.fee180)} pro anwesender Person. Der Spielplan entsteht automatisch aus den Anwesenden.
          </p>
          {canEdit && (
            <Btn variant="gold" onClick={startDay} className="px-6 py-3">
              <Play size={16} /> Spieltag {dayNo} starten
            </Btn>
          )}
        </Card>
      )}

      {/* Anwesenheit */}
      {canEdit && day.started && (
        <Card>
          <CardTitle
            right={
              <div className="flex items-center gap-2">
                {day.attendees.length < state.players.length && (
                  <button onClick={allPresent} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-accent-light hover:border-accent/60">
                    Alle anwesend
                  </button>
                )}
                {day.attendees.length === 0 && (
                  <button onClick={undoStart} className="rounded-lg border border-line px-2.5 py-1 text-xs text-muted hover:text-white">
                    Start zurücknehmen
                  </button>
                )}
              </div>
            }
          >
            Anwesenheit · {day.attendees.length} × {euro(fee)}
          </CardTitle>
          <div className="flex flex-wrap gap-2 px-4 pb-4 sm:px-5">
            {state.players.map((p) => {
              const on = day.attendees.includes(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => toggleAttendance(p.id)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    on ? 'border-accent/50 bg-accent/10 text-white' : 'border-line bg-panel2 text-muted line-through decoration-white/30'
                  }`}
                >
                  {on ? <UserCheck size={16} className="text-accent" /> : <UserX size={16} />}
                  {p.name}
                  <span className={`text-[10px] font-bold uppercase ${on ? 'text-accent-light' : 'text-muted'}`}>{on ? `Anwesend · ${euro(fee)}` : 'Abwesend'}</span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {day.started && (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] tablet:xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.3fr)]">
        {/* Spiele */}
        <Card>
          <CardTitle
            right={
              canEdit && day.attendees.length > 2 && !res.complete ? (
                <button
                  onClick={shuffleMatches}
                  disabled={rolling}
                  className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-accent-light transition hover:border-accent/60"
                  title="Paarungen und Reihenfolge zufällig neu würfeln"
                >
                  <Shuffle size={14} className={rolling ? 'animate-spin' : ''} /> {rolling ? 'Mische …' : 'Partien mischen'}
                </button>
              ) : (
                <span className="text-xs text-muted">Best of {legs * 2 - 1}</span>
              )
            }
          >
            Ligaspiele · Jeder gegen Jeden
          </CardTitle>
          {day.attendees.length < 2 ? (
            <p className="px-5 pb-5 text-sm text-muted">Mindestens 2 anwesende Spieler nötig.</p>
          ) : (
            <div className="flex flex-col gap-3 px-3 pb-4 sm:px-4">
              {played < day.matches.length && (
                <p className="-mt-1 px-1 text-[11px] text-muted">
                  Zahlen neben den Namen = <span className="text-accent-light">Wettquote</span> nach aktueller Form · antippen für Details · just for fun
                </p>
              )}
              {rounds.map((r) => (
                <div key={r}>
                  <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Runde {r + 1}</div>
                  <div className="flex flex-col gap-1">
                    {day.matches
                      .filter((m) => m.round === r)
                      .map((m) => {
                        const done = isPlayed(m);
                        const aWin = done && m.legsA! > m.legsB!;
                        const bWin = done && m.legsB! > m.legsA!;
                        const o = done ? null : matchOdds(oddsModel, m.a, m.b);
                        const chip = (side: 'a' | 'b') =>
                          o && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOddsView({ a: m.a, b: m.b, nameA: name(m.a), nameB: name(m.b), odds: o });
                              }}
                              title="Wettquote – antippen für Details"
                              className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition hover:bg-white/10 tablet:text-sm ${
                                o.favorite === side ? 'border-accent/50 text-accent-light' : 'border-line text-muted'
                              }`}
                            >
                              {fmtOdds(side === 'a' ? o.oddsA : o.oddsB)}
                            </button>
                          );
                        return (
                          <div
                            key={m.id}
                            role={canEdit ? 'button' : undefined}
                            tabIndex={canEdit ? 0 : undefined}
                            onClick={() => openMatch(m)}
                            onKeyDown={(e) => canEdit && (e.key === 'Enter' || e.key === ' ') && openMatch(m)}
                            className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border px-3 py-2 transition tablet:py-3 ${
                              done ? 'border-line bg-panel2' : 'border-dashed border-line bg-transparent'
                            } ${canEdit ? 'cursor-pointer hover:border-accent/60' : 'cursor-default'}`}
                          >
                            <span className="flex min-w-0 items-center justify-end gap-2">
                              {chip('a')}
                              <span className={`truncate text-right text-sm tablet:text-xl ${aWin ? 'font-bold text-white' : done ? 'text-white/50' : 'text-white'}`}>{name(m.a)}</span>
                            </span>
                            <span
                              className={`min-w-[64px] rounded-lg px-2 py-1 text-center font-display font-bold tabular-nums tablet:min-w-[90px] tablet:text-2xl ${
                                done ? 'bg-bg text-white' : 'text-muted'
                              }`}
                            >
                              {done ? (
                                <>
                                  <span className={aWin ? 'text-accent-light' : ''}>{m.legsA}</span>
                                  <span className="px-1 text-muted">:</span>
                                  <span className={bWin ? 'text-accent-light' : ''}>{m.legsB}</span>
                                </>
                              ) : canEdit ? (
                                <span className="text-xs font-semibold text-accent-light">Eintragen</span>
                              ) : (
                                '– : –'
                              )}
                            </span>
                            <span className="flex min-w-0 items-center gap-2">
                              <span className={`truncate text-left text-sm tablet:text-xl ${bWin ? 'font-bold text-white' : done ? 'text-white/50' : 'text-white'}`}>{name(m.b)}</span>
                              {chip('b')}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <CashCard day={day} />
          {/* Tagessieg */}
          <Card className={res.winnerId ? 'border-gold/40' : ''}>
            <div className="flex items-center gap-4 p-4 sm:p-5">
              <div className={`rounded-2xl p-3 ${res.winnerId ? 'bg-gold/15 text-gold shadow-gold' : 'bg-white/5 text-muted'}`}>
                <Crown size={30} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted">Tagessieg · +2 Bonuspunkte</div>
                {res.winnerId ? (
                  <button onClick={() => openProfile(res.winnerId!)} className="font-display text-2xl font-extrabold text-gold hover:underline tablet:text-4xl">
                    {name(res.winnerId)}
                  </button>
                ) : (
                  <div className="font-display text-lg font-bold text-muted">
                    Wird vergeben, sobald alle {day.matches.length} Spiele eingetragen sind
                  </div>
                )}
                {res.manual && <div className="text-xs text-gold/80">Manuell vergeben (Stechen)</div>}
              </div>
            </div>
            {res.complete && res.tieAtTop && !res.manual && (
              <div className="mx-4 mb-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 sm:mx-5">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                Gleichstand an der Spitze – Stechen spielen und den Sieger unten manuell festlegen.
              </div>
            )}
            {canEdit && res.complete && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
                <span className="text-xs text-muted">Override (Stechen):</span>
                <select
                  value={day.winnerOverride ?? ''}
                  onChange={(e) => setOverride(e.target.value || null)}
                  className="rounded-lg border border-line bg-panel2 px-2 py-1.5 text-sm"
                >
                  <option value="">Automatisch (Platz 1)</option>
                  {res.rows.map((r) => (
                    <option key={r.playerId} value={r.playerId}>
                      {name(r.playerId)}
                    </option>
                  ))}
                </select>
                {day.winnerOverride && (
                  <button onClick={() => setOverride(null)} className="flex items-center gap-1 text-xs text-muted hover:text-white">
                    <RotateCcw size={13} /> zurücksetzen
                  </button>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle>Tages-Tabelle</CardTitle>
            <StandingsTable rows={res.rows} rankPoints={rankPoints} compact winnerId={res.winnerId} />
          </Card>
        </div>
      </div>
      )}

      <ResultModal target={target} onClose={() => setTarget(null)} />
      <OddsModal data={oddsView} onClose={() => setOddsView(null)} />
    </div>
  );
}
