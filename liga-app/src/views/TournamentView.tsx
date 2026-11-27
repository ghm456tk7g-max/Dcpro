import { useMemo, useState } from 'react';
import { Award, Check, Minus, Coins, Crown, Dices, Medal, Plus, RotateCcw, Shuffle, Swords, Trash2, Trophy, UserPlus, Users, X } from 'lucide-react';
import { useLeague } from '../lib/league';
import { formatDate, formatDiff, isPlayed, StatRow } from '../lib/logic';
import {
  boardQueue,
  computeDE,
  createGroupPhase,
  potBreakdown,
  DEMatchView,
  deLabel,
  euro,
  groupPhaseDone,
  groupTable,
  paidCount,
  pruneDE,
  QueueItem,
  reshuffleGroupOrder,
  scheduleStats,
  total180,
  tAmountPer180,
  tPayersPer180,
  tNames,
} from '../lib/tournament';
import { defaultTournament, GroupKey, Tournament, uid } from '../lib/types';
import DoubleElim from '../components/DoubleElim';
import PotLedger from '../components/PotLedger';
import OddsModal from '../components/OddsModal';
import { buildOddsModel, fmtOdds, matchOdds, Odds } from '../lib/stats';
import { potLedger, seasonCash } from '../lib/cash';
import ResultModal, { ResultTarget } from '../components/ResultModal';
import { Btn, Card, CardTitle, ProgressBar, Segmented } from '../components/ui';

type Section = 'teilnehmer' | 'gruppen' | 'ko';
const legOptions = [1, 2, 3, 4, 5];

function GroupTableCard({ g, rows, names, tags }: { g: GroupKey; rows: StatRow[]; names: Map<string, string>; tags: Map<string, string> }) {
  const half = Math.ceil(rows.length / 2);
  const th = 'px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted';
  return (
    <Card>
      <CardTitle right={<span className="text-xs text-muted">{rows.length} Spieler</span>}>Gruppe {g}</CardTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm tablet:text-lg">
          <thead>
            <tr className="border-b border-line">
              <th className={`${th} pl-4 text-left`}>Platz</th>
              <th className={`${th} text-left`}>Spieler</th>
              <th className={th}>Spiele</th>
              <th className={th}>Siege</th>
              <th className={th}>Legs</th>
              <th className={th}>Leg-Diff.</th>
              <th className={`${th} pr-4 text-white`}>Punkte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.playerId} className={`border-b border-line/60 last:border-0 ${i === half - 1 ? 'border-b-2 border-b-white/15' : ''}`}>
                <td className="py-2.5 pl-4 pr-2">
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg font-display text-sm font-bold ${
                      i < half ? 'bg-gold/15 text-gold' : 'bg-white/5 text-muted'
                    }`}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="max-w-[10rem] truncate px-2 py-2.5 font-semibold">
                  {names.get(r.playerId)}
                  <span className="ml-1.5 text-[10px] font-bold text-muted">{tags.get(r.playerId)}</span>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">{r.played}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-accent-light">{r.wins}</td>
                <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-white/80">
                  {r.legsFor}:{r.legsAgainst}
                </td>
                <td className={`px-2 py-2.5 text-right tabular-nums ${r.diff > 0 ? 'text-accent-light' : r.diff < 0 ? 'text-red-300/80' : 'text-muted'}`}>
                  {formatDiff(r.diff)}
                </td>
                <td className="px-2 py-2.5 pr-4 text-right font-display text-base font-extrabold">{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-[11px] text-muted sm:px-5">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-gold" />
          Plätze 1–{half}: Winners Bracket (2 Leben)
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-white/30" />
          Plätze {half + 1}–{rows.length}: Losers Bracket (1 Leben)
        </span>
      </div>
    </Card>
  );
}

export default function TournamentView({ goHallOfFame }: { goHallOfFame(): void }) {
  const { state, canEdit, update, confirm, toast } = useLeague();
  const t = state.tournament;
  const names = useMemo(() => tNames(t), [t]);
  const de = useMemo(() => computeDE(t), [t]);
  const queue = useMemo(() => boardQueue(t, de), [t, de]);
  const tags = useMemo(() => {
    const m = new Map<string, string>();
    if (t.groups) (['A', 'B'] as const).forEach((g) => groupTable(t, g).forEach((r, i) => m.set(r.playerId, `${g}${i + 1}`)));
    return m;
  }, [t]);
  const groupDone = groupPhaseDone(t);
  const [section, setSection] = useState<Section>(() => (!t.groups ? 'teilnehmer' : groupDone ? 'ko' : 'gruppen'));
  const [target, setTarget] = useState<ResultTarget | null>(null);
  const [newName, setNewName] = useState('');
  const [paidOnAdd, setPaidOnAdd] = useState(true);
  const [rolling, setRolling] = useState(false);
  /** kurze Würfel-Animation, dann mischen */
  const roll = (fn: () => void) => {
    setRolling(true);
    setTimeout(() => {
      fn();
      setRolling(false);
    }, 650);
  };

  const n = t.participants.length;
  const potInfo = potBreakdown(t, state.settings);
  const amount180 = tAmountPer180(t, state.settings);
  const payers180 = tPayersPer180(t, state.settings);
  const season = seasonCash(state);
  /** Aktueller Pot = alle Liga-Spieltage (Startgeld + 180er) + Turnier */
  const pot = potLedger(state).total;
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [oddsView, setOddsView] = useState<{ a: string; b: string; nameA: string; nameB: string; odds: Odds } | null>(null);
  const oddsModel = useMemo(() => buildOddsModel(state), [state]);
  /** Quote nur, wenn beide Turnier-Spieler Liga-Spieler sind (sonst fehlen Daten) */
  const boardOdds = (() => {
    const q = queue[0];
    if (!q) return null;
    const la = t.participants.find((p) => p.id === q.a)?.leagueId;
    const lb = t.participants.find((p) => p.id === q.b)?.leagueId;
    if (!la || !lb) return null;
    return { a: la, b: lb, nameA: names.get(q.a) ?? '—', nameB: names.get(q.b) ?? '—', odds: matchOdds(oddsModel, la, lb) };
  })();
  const paid = paidCount(t);
  const groupPlayed = t.groupMatches.filter(isPlayed).length;
  const hasResults = groupPlayed > 0 || Object.keys(t.koResults).length > 0;
  const name = (id: string) => names.get(id) ?? '—';
  const fmtLegs = (l: number) => `Best of ${l * 2 - 1}`;

  const upd = (fn: (t: Tournament) => void, msg?: string) => update((s) => fn(s.tournament), msg);

  /* ---------------- Teilnehmer ---------------- */
  const resetDrawIfNeeded = async (what: string) => {
    if (!t.groups) return true;
    return confirm({
      title: 'Auslosung zurücksetzen?',
      message: `${what} ändert das Teilnehmerfeld. Gruppen, Spielplan${hasResults ? ' und alle bisherigen Ergebnisse' : ''} werden gelöscht und müssen neu ausgelost werden.`,
      confirmLabel: 'Fortfahren',
      danger: hasResults,
    });
  };
  const clearDraw = (x: Tournament) => {
    x.groups = null;
    x.groupMatches = [];
    x.koResults = {};
    x.hofEntryId = null;
  };

  const addParticipant = async (pname: string, leagueId: string | null = null) => {
    const nm = pname.trim();
    if (!nm) return;
    if (t.participants.some((p) => p.name.toLowerCase() === nm.toLowerCase())) return toast(`${nm} ist schon angemeldet`, 'error');
    if (!(await resetDrawIfNeeded(`${nm} hinzufügen`))) return;
    upd((x) => {
      x.participants.push({ id: uid(), name: nm, paid: paidOnAdd, leagueId, s180: 0 });
      clearDraw(x);
    }, `${nm} angemeldet${paidOnAdd ? ` · Pot +${euro(t.fee)}` : ' (Gebühr noch offen)'}`);
    setNewName('');
  };

  const removeParticipant = async (id: string) => {
    if (!(await resetDrawIfNeeded(`${name(id)} entfernen`))) return;
    upd((x) => {
      x.participants = x.participants.filter((p) => p.id !== id);
      clearDraw(x);
    }, `${name(id)} abgemeldet`);
  };

  const setPaid = (id: string, v: boolean) =>
    upd((x) => {
      x.participants.find((p) => p.id === id)!.paid = v;
    }, `${name(id)}: Gebühr ${v ? `bezahlt · Pot +${euro(t.fee)}` : `offen · Pot −${euro(t.fee)}`}`);

  const add180 = (id: string, delta: number) => {
    const cur = t.participants.find((p) => p.id === id)?.s180 ?? 0;
    if (cur + delta < 0) return;
    upd(
      (x) => {
        const p = x.participants.find((y) => y.id === id)!;
        p.s180 = Math.max(0, (p.s180 ?? 0) + delta);
      },
      delta > 0 ? `180! ${name(id)} · Pot +${euro(amount180)} (${payers180} × ${euro(state.settings.fee180)})` : `180 bei ${name(id)} zurückgenommen · Pot −${euro(amount180)}`,
    );
  };

  const draw = async () => {
    if (n < 4) return toast('Mindestens 4 Teilnehmer nötig', 'error');
    if (
      t.groups &&
      !(await confirm({
        title: 'Neu mischen?',
        message: hasResults
          ? 'Es gibt schon Ergebnisse. Neu mischen löscht alle Ergebnisse der Gruppenphase und des K.O.-Baums.'
          : 'Gruppen und Spielplan werden neu ausgelost.',
        confirmLabel: 'Neu auslosen',
        danger: hasResults,
      }))
    )
      return;
    roll(() => {
      const { groups, groupMatches } = createGroupPhase(t.participants.map((p) => p.id));
      upd((x) => {
        x.groups = groups;
        x.groupMatches = groupMatches;
        x.koResults = {};
        x.hofEntryId = null;
      }, 'Gruppen und Spielplan neu ausgelost');
      setSection('gruppen');
    });
  };

  const reshuffle = () => {
    if (groupDone) return;
    roll(() =>
      upd((x) => {
        x.groupMatches = reshuffleGroupOrder(x);
      }, groupPlayed ? 'Offene Partien neu gemischt' : 'Reihenfolge neu gemischt'),
    );
  };

  const newTournament = async () => {
    const ok = await confirm({
      title: 'Neues Turnier starten?',
      message: 'Auslosung, alle Ergebnisse und der Bezahlt-Status werden zurückgesetzt. Die Teilnehmerliste und die Einstellungen bleiben erhalten.',
      confirmLabel: 'Neues Turnier',
      danger: true,
    });
    if (!ok) return;
    upd((x) => {
      clearDraw(x);
      x.participants.forEach((p) => {
        p.paid = false;
        p.s180 = 0;
      });
      x.date = defaultTournament().date;
    }, 'Neues Turnier angelegt');
    setSection('teilnehmer');
  };

  /* ---------------- Ergebnisse ---------------- */
  const openGroupMatch = (id: string) => {
    if (!canEdit) return;
    const m = t.groupMatches.find((x) => x.id === id)!;
    setTarget({
      title: `Gruppe ${m.group}`,
      p1: m.a,
      p2: m.b,
      s1: m.legsA,
      s2: m.legsB,
      firstTo: t.groupLegs,
      names: [name(m.a), name(m.b)],
      note: t.mode,
      onSave: (a, b) =>
        upd((x) => {
          const mm = x.groupMatches.find((y) => y.id === id)!;
          mm.legsA = a;
          mm.legsB = b;
          mm.playedAt = mm.playedAt ?? new Date().toISOString();
          pruneDE(x);
        }, `${name(m.a)} ${a}:${b} ${name(m.b)}`),
      onClear: () =>
        upd((x) => {
          const mm = x.groupMatches.find((y) => y.id === id)!;
          mm.legsA = null;
          mm.legsB = null;
          mm.playedAt = null;
          pruneDE(x);
        }, 'Ergebnis gelöscht'),
    });
  };

  const openKoMatch = (m: DEMatchView) => {
    if (!canEdit || !m.p1 || !m.p2) return;
    setTarget({
      title: `${deLabel(m, de.plan)} · ${m.id}`,
      p1: m.p1,
      p2: m.p2,
      s1: m.s1,
      s2: m.s2,
      firstTo: t.koLegs,
      names: [name(m.p1), name(m.p2)],
      note: t.mode,
      onSave: (s1, s2) =>
        upd((x) => {
          x.koResults[m.id] = { p1: m.p1!, p2: m.p2!, s1, s2, playedAt: x.koResults[m.id]?.playedAt ?? new Date().toISOString() };
          x.hofEntryId = null;
          pruneDE(x);
        }, 'K.O.-Ergebnis gespeichert'),
      onClear: () =>
        upd((x) => {
          delete x.koResults[m.id];
          x.hofEntryId = null;
          pruneDE(x);
        }, 'K.O.-Ergebnis gelöscht'),
    });
  };

  const openQueueItem = (q: QueueItem) => (q.kind === 'group' ? openGroupMatch(q.id) : openKoMatch(de.byId.get(q.id)!));

  /* ---------------- Hall of Fame ---------------- */
  const toHallOfFame = async () => {
    if (!de.champion) return;
    const ok = await confirm({
      title: 'In die Hall of Fame übernehmen?',
      message: `${name(de.champion)} wird als Sieger von „${t.name}“ (${formatDate(t.date)}) mit einem Pot von ${euro(pot)} eingetragen.`,
      confirmLabel: 'Übernehmen',
    });
    if (!ok) return;
    const id = uid();
    update((s) => {
      s.hallOfFame.push({
        id,
        year: s.tournament.date.slice(0, 4),
        date: s.tournament.date,
        name: name(de.champion!),
        pot,
        tournament: s.tournament.name,
      });
      s.tournament.hofEntryId = id;
    }, `${name(de.champion)} ist jetzt in der Hall of Fame`);
    goHallOfFame();
  };

  /* ---------------- Render ---------------- */
  const input = 'w-full rounded-xl border border-line bg-panel2 px-3 py-2.5 text-sm outline-none focus:border-accent/60';
  const stats = t.groupMatches.length ? scheduleStats(t.groupMatches) : null;
  const currentId = queue[0]?.id ?? null;
  const freeLeague = state.players.filter((p) => !t.participants.some((x) => x.leagueId === p.id || x.name.toLowerCase() === p.name.toLowerCase()));

  return (
    <div className="flex flex-col gap-4">
      {/* Kopf: Turnier + Pot */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative">
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-accent-light">Steeldart-Turnier · {formatDate(t.date)}</div>
            <h1 className="mt-1 font-display text-2xl font-extrabold sm:text-3xl tablet:text-4xl">{t.name}</h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-lg border border-line bg-panel2 px-2.5 py-1">{t.mode}</span>
              <span className="rounded-lg border border-line bg-panel2 px-2.5 py-1">Gruppen: {fmtLegs(t.groupLegs)}</span>
              <span className="rounded-lg border border-line bg-panel2 px-2.5 py-1">K.O.: {fmtLegs(t.koLegs)}</span>
              <span className="rounded-lg border border-line bg-panel2 px-2.5 py-1">Double Elimination{t.resetFinal ? ' · mit Reset-Finale' : ''}</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-muted">
              {[
                ['Anmeldung', !!t.groups, true],
                ['Gruppenphase', groupDone, !!t.groups],
                ['Double Elimination', !!de.champion, groupDone],
              ].map(([label, done, active], i) => (
                <div key={i} className={`rounded-xl border px-2 py-2 ${done ? 'border-accent/40 bg-accent/10 text-accent-light' : active ? 'border-amber-400/40 text-amber-200' : 'border-line'}`}>
                  <div className="font-display text-base font-bold">{i + 1}</div>
                  {label as string}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="order-first flex flex-col justify-center rounded-2xl border border-gold/40 lg:order-none bg-gradient-to-br from-gold/15 via-panel to-panel p-5 shadow-gold">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gold">
            <Coins size={16} /> Aktueller Pot
          </div>
          <div className="mt-1 font-display text-5xl font-extrabold tabular-nums text-gold tablet:text-6xl">{euro(pot)}</div>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted">Liga-Startgeld · {season.days} Spieltage</span>
              <span className="font-semibold tabular-nums">{euro(season.fees)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted">Liga-180er · {season.count180}×</span>
              <span className="font-semibold tabular-nums">{euro(season.bonus)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted">
                Turnier-Startgeld · {paid} von {n} × {euro(t.fee)}
              </span>
              <span className="font-semibold tabular-nums">{euro(potInfo.fees)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted">
                Turnier-180er · {total180(t)} × {euro(amount180)}
              </span>
              <span className="font-semibold tabular-nums">{euro(potInfo.bonus)}</span>
            </div>
            {potInfo.openFees > 0 && (
              <div className="flex justify-between gap-3 text-amber-200/90">
                <span>Noch offen · {n - paid} Spieler</span>
                <span className="font-semibold tabular-nums">{euro(potInfo.openFees)}</span>
              </div>
            )}
          </div>
          <ProgressBar pct={pot + potInfo.openFees ? (pot / (pot + potInfo.openFees)) * 100 : 0} gold className="mt-3 h-2" />
          {potInfo.openFees > 0 && <div className="mt-1.5 text-xs text-muted">Wenn alle Turnier-Gebühren bezahlt sind: {euro(pot + potInfo.openFees)}</div>}
          <button onClick={() => setLedgerOpen(true)} className="mt-3 rounded-lg border border-gold/40 px-3 py-1.5 text-xs font-semibold text-gold hover:bg-gold/10">
            Alle Einzahlungen anzeigen
          </button>
        </section>
      </div>

      {/* Jetzt am Board */}
      {queue.length > 0 && (
        <Card className="border-amber-400/30">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-400/15 p-3 text-amber-300">
                <Swords size={26} />
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-widest text-amber-300">
                Jetzt am Board
                <div className="text-muted">{queue[0].label}</div>
              </div>
            </div>
            <button
              onClick={() => openQueueItem(queue[0])}
              disabled={!canEdit}
              className={`flex-1 rounded-xl px-2 py-1 text-left font-display text-2xl font-extrabold tablet:text-4xl ${canEdit ? 'hover:bg-white/5' : ''}`}
            >
              {name(queue[0].a)} <span className="text-muted">vs</span> {name(queue[0].b)}
            </button>
            {boardOdds && (
              <button
                onClick={() => setOddsView(boardOdds)}
                className="rounded-xl border border-line px-3 py-2 text-left text-xs text-muted transition hover:bg-white/5"
                title="Wettquote – antippen für Details"
              >
                Quote
                <div className="font-display text-base font-bold tabular-nums text-white">
                  {fmtOdds(boardOdds.odds.oddsA)} : {fmtOdds(boardOdds.odds.oddsB)}
                </div>
              </button>
            )}
            {canEdit && (
              <div className="flex gap-2">
                {[queue[0].a, queue[0].b].map((pid) => (
                  <button
                    key={pid}
                    onClick={() => add180(pid, 1)}
                    className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-left text-xs font-bold text-gold transition hover:bg-gold/20 active:scale-95"
                    title={`180 für ${name(pid)} – erhöht den Pot um ${euro(amount180)}`}
                  >
                    +180
                    <div className="max-w-[6rem] truncate font-medium text-white/80">{name(pid)}</div>
                  </button>
                ))}
              </div>
            )}
            {queue.length > 1 && (
              <div className="text-sm text-muted sm:max-w-xs sm:text-right">
                <div className="text-[11px] font-semibold uppercase tracking-wider">Danach</div>
                {queue.slice(1, 3).map((q) => (
                  <div key={q.id} className="truncate">
                    {name(q.a)} – {name(q.b)} <span className="text-xs">({q.label})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      <Segmented<Section>
        value={section}
        onChange={setSection}
        options={[
          { value: 'teilnehmer', label: <><span className="sm:hidden">Teilnehmer</span><span className="hidden sm:inline">Teilnehmer &amp; Kasse</span></> },
          { value: 'gruppen', label: 'Gruppenphase' },
          { value: 'ko', label: <><span className="sm:hidden">K.O.-Baum</span><span className="hidden sm:inline">Double Elimination</span></> },
        ]}
      />

      {/* ------------------------- Teilnehmer & Kasse ------------------------- */}
      {section === 'teilnehmer' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Card>
            <CardTitle right={<span className={`text-xs ${n >= 8 && n <= 12 ? 'text-muted' : 'text-amber-300'}`}>{n} Teilnehmer · vorgesehen 8–12</span>}>
              <span className="flex items-center gap-2">
                <Users size={16} /> Teilnehmer
              </span>
            </CardTitle>
            {canEdit && (
              <div className="flex flex-col gap-3 px-4 pb-3 sm:px-5">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addParticipant(newName);
                  }}
                >
                  <input id="t-new" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name (auch Gäste)" maxLength={24} className={input} />
                  <Btn type="submit" disabled={!newName.trim()}>
                    <Plus size={16} /> Anmelden
                  </Btn>
                </form>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input id="t-paid-on-add" type="checkbox" checked={paidOnAdd} onChange={(e) => setPaidOnAdd(e.target.checked)} className="h-4 w-4 accent-[#10b981]" />
                  Beim Anmelden direkt als „bezahlt“ markieren ({euro(t.fee)} kommen sofort in den Pot)
                </label>
                {freeLeague.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted">Aus der Liga:</span>
                    {freeLeague.map((p) => (
                      <button key={p.id} onClick={() => addParticipant(p.name, p.id)} className="flex items-center gap-1 rounded-lg border border-line bg-panel2 px-2 py-1 text-xs hover:border-accent/50">
                        <UserPlus size={12} /> {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <ul>
              {t.participants.map((p, i) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line/60 px-4 py-2.5 sm:flex-nowrap sm:px-5">
                  <span className="w-5 text-xs text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium tablet:text-lg">
                    {p.name}
                    {tags.get(p.id) && <span className="ml-2 text-[10px] font-bold text-muted">Gruppe {tags.get(p.id)![0]}</span>}
                  </span>
                  <div className="flex w-full items-center justify-end gap-3 pl-8 sm:w-auto sm:pl-0">
                  {canEdit ? (
                    <div className="mr-auto flex items-center gap-0.5 sm:mr-0" title="Geworfene 180er (erhöhen den Pot)">
                      <button onClick={() => add180(p.id, -1)} disabled={!p.s180} className="rounded-md p-1 text-muted hover:text-white disabled:opacity-30" aria-label={`180 bei ${p.name} abziehen`}>
                        <Minus size={13} />
                      </button>
                      <span className={`min-w-[3.2rem] text-center text-xs font-bold tabular-nums ${p.s180 ? 'text-gold' : 'text-muted'}`}>{p.s180 ?? 0}× 180</span>
                      <button onClick={() => add180(p.id, 1)} className="rounded-md bg-gold/15 p-1 text-gold hover:bg-gold/25" aria-label={`180 für ${p.name}`}>
                        <Plus size={13} />
                      </button>
                    </div>
                  ) : (
                    p.s180 > 0 && <span className="text-xs font-bold text-gold">{p.s180}× 180</span>
                  )}
                  <span className="hidden text-[11px] text-muted xl:inline">Gebühr bezahlt</span>
                  {canEdit ? (
                    <div className="inline-flex rounded-lg border border-line bg-panel2 p-0.5">
                      <button
                        onClick={() => setPaid(p.id, true)}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition ${p.paid ? 'bg-accent text-bg' : 'text-muted hover:text-white'}`}
                      >
                        <Check size={13} /> Ja
                      </button>
                      <button
                        onClick={() => setPaid(p.id, false)}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold transition ${!p.paid ? 'bg-red-500/80 text-white' : 'text-muted hover:text-white'}`}
                      >
                        <X size={13} /> Nein
                      </button>
                    </div>
                  ) : (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${p.paid ? 'bg-accent/15 text-accent-light' : 'bg-red-500/10 text-red-300'}`}>{p.paid ? 'Bezahlt' : 'Offen'}</span>
                  )}
                  {canEdit && (
                    <button onClick={() => removeParticipant(p.id)} className="rounded-lg p-1.5 text-muted hover:bg-red-500/10 hover:text-red-300" aria-label="Entfernen">
                      <Trash2 size={15} />
                    </button>
                  )}
                  </div>
                </li>
              ))}
              {n === 0 && <li className="px-5 pb-5 text-sm text-muted">Noch niemand angemeldet.</li>}
            </ul>
          </Card>

          <div className="flex flex-col gap-4">
            {canEdit && (
              <Card className="p-4 sm:p-5">
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">
                  <Dices size={16} /> Auslosung
                </div>
                <p className="mb-4 text-sm text-muted">
                  Lost die Teilnehmer zufällig in 2 ausgeglichene Gruppen und erstellt die Board-Reihenfolge: abwechselnd Gruppe A und B, niemand zweimal hintereinander, Pausen gleichmäßig verteilt.
                </p>
                <Btn variant="gold" onClick={draw} disabled={n < 4} className="w-full py-3">
                  <Shuffle size={16} className={rolling ? 'animate-spin' : ''} /> {t.groups ? 'Spielplan neu mischen' : 'Spielplan auslosen'}
                </Btn>
                {(n < 8 || n > 12) && n >= 4 && <p className="mt-2 text-xs text-amber-300">Hinweis: Das Format ist für 8–12 Spieler gedacht, funktioniert aber auch mit {n}.</p>}
              </Card>
            )}

            {canEdit && (
              <Card className="p-4 sm:p-5">
                <div className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Turnier-Einstellungen</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs text-muted">
                    Name
                    <input
                      id="t-name"
                      key={t.name}
                      defaultValue={t.name}
                      maxLength={40}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && upd((x) => void (x.name = e.target.value.trim()))}
                      className={`${input} mt-1`}
                    />
                  </label>
                  <label className="text-xs text-muted">
                    Datum
                    <input id="t-date" type="date" value={t.date} onChange={(e) => e.target.value && upd((x) => void (x.date = e.target.value))} className={`${input} mt-1 [color-scheme:dark]`} />
                  </label>
                  <label className="text-xs text-muted">
                    Teilnahmegebühr (€)
                    <input
                      id="t-fee"
                      key={t.fee}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.5}
                      defaultValue={t.fee}
                      onBlur={(e) => {
                        const v = Math.max(0, Math.round(parseFloat(e.target.value.replace(',', '.')) * 100) / 100 || 0);
                        if (v !== t.fee) upd((x) => void (x.fee = v), `Gebühr: ${euro(v)}`);
                      }}
                      className={`${input} mt-1`}
                    />
                  </label>
                  <div className="text-xs text-muted">
                    Pro 180
                    <div className="mt-1 rounded-xl border border-line bg-panel2 px-3 py-2.5 text-sm text-white">
                      {payers180} × {euro(state.settings.fee180)} = <span className="font-semibold text-gold">{euro(amount180)}</span>
                    </div>
                    <div className="mt-1 text-[11px]">jeder Teilnehmer zahlt {euro(state.settings.fee180)} · änderbar unter Admin → Liga-Kasse</div>
                  </div>
                  <label className="text-xs text-muted">
                    Spielmodus
                    <input
                      id="t-mode"
                      key={t.mode}
                      defaultValue={t.mode}
                      maxLength={30}
                      onBlur={(e) => e.target.value.trim() && e.target.value !== t.mode && upd((x) => void (x.mode = e.target.value.trim()))}
                      className={`${input} mt-1`}
                    />
                  </label>
                  {(['groupLegs', 'koLegs'] as const).map((k) => (
                    <label key={k} className="text-xs text-muted">
                      {k === 'groupLegs' ? 'Gruppenphase' : 'Double Elimination'}
                      <select id={`t-${k}`} value={t[k]} onChange={(e) => upd((x) => void (x[k] = Number(e.target.value)))} className={`${input} mt-1`}>
                        {legOptions.map((l) => (
                          <option key={l} value={l}>
                            Best of {l * 2 - 1} (First to {l})
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm">
                  <input
                    id="t-reset"
                    type="checkbox"
                    checked={t.resetFinal}
                    onChange={(e) =>
                      upd((x) => {
                        x.resetFinal = e.target.checked;
                        pruneDE(x);
                      })
                    }
                    className="h-4 w-4 accent-[#10b981]"
                  />
                  Reset-Finale, wenn der Spieler aus dem Losers Bracket das 1. Finale gewinnt
                </label>
                <div className="mt-4 border-t border-line pt-4">
                  <Btn variant="danger" onClick={newTournament} className="w-full">
                    <RotateCcw size={16} /> Neues Turnier starten
                  </Btn>
                </div>
              </Card>
            )}
            {!canEdit && (
              <Card className="p-4 text-sm text-muted sm:p-5">
                Teilnehmer anmelden, Gebühren abhaken und auslosen kann der Admin (Schloss-Symbol oben rechts).
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------ Gruppenphase ------------------------------ */}
      {section === 'gruppen' &&
        (!t.groups ? (
          <Card className="px-6 py-10 text-center text-sm text-muted">Noch nicht ausgelost. Unter „Teilnehmer &amp; Kasse“ den Spielplan auslosen.</Card>
        ) : (
          <div className="flex flex-col gap-4">
          {canEdit && (
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
              <div className="flex items-center gap-3 sm:flex-1">
                <div className={`rounded-2xl bg-accent/10 p-3 text-accent transition ${rolling ? 'animate-bounce' : ''}`}>
                  <Dices size={26} className={rolling ? 'animate-spin' : ''} />
                </div>
                <div>
                  <div className="font-display text-lg font-bold">{rolling ? 'Wird gemischt …' : 'Zufallsgenerator'}</div>
                  <div className="text-sm text-muted">
                    {groupDone
                      ? 'Gruppenphase ist durchgespielt. Neu auslosen würde alle Ergebnisse löschen.'
                      : groupPlayed
                        ? `Gruppen und ${groupPlayed} gespielte ${groupPlayed === 1 ? 'Partie bleiben' : 'Partien bleiben'}, die ${t.groupMatches.length - groupPlayed} offenen werden neu gemischt.`
                        : 'Partien per Knopfdruck neu würfeln – niemand spielt dabei zweimal hintereinander.'}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Btn onClick={reshuffle} disabled={rolling || groupDone}>
                  <Shuffle size={16} /> Reihenfolge neu mischen
                </Btn>
                <Btn variant="ghost" onClick={draw} disabled={rolling}>
                  <Dices size={16} /> Gruppen neu auslosen
                </Btn>
              </div>
            </Card>
          )}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              {(['A', 'B'] as const).map((g) => (
                <GroupTableCard key={g} g={g} rows={groupTable(t, g)} names={names} tags={tags} />
              ))}
            </div>
            <Card>
              <CardTitle right={<span className="text-xs text-muted">{groupPlayed} / {t.groupMatches.length}</span>}>Spielplan · 1 Board</CardTitle>
              {stats && (
                <div className="mx-4 mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-line bg-panel2 px-3 py-2 text-xs text-muted sm:mx-5">
                  <span className={stats.backToBack ? 'text-amber-300' : 'text-accent-light'}>
                    {stats.backToBack ? `${stats.backToBack}× direkt hintereinander` : '✓ Niemand spielt zweimal hintereinander'}
                  </span>
                  <span>Längste Pause: {stats.maxGap} Spiele</span>
                  <span>Spätester Einstieg: Spiel {stats.maxFirstWait + 1}</span>
                </div>
              )}
              <ol className="flex flex-col gap-1 px-3 pb-4 sm:px-4">
                {t.groupMatches.map((m, i) => {
                  const done = isPlayed(m);
                  const aWin = done && m.legsA! > m.legsB!;
                  const bWin = done && m.legsB! > m.legsA!;
                  const now = m.id === currentId;
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => openGroupMatch(m.id)}
                        disabled={!canEdit}
                        className={`grid w-full grid-cols-[2rem_1.6rem_1fr_auto_1fr] items-center gap-3 rounded-xl border px-2.5 py-1.5 transition tablet:py-3 ${
                          now ? 'border-amber-400/60 bg-amber-400/5' : done ? 'border-line bg-panel2' : 'border-dashed border-line'
                        } ${canEdit ? 'hover:border-accent/60' : 'cursor-default'}`}
                      >
                        <span className="text-xs tabular-nums text-muted">{i + 1}.</span>
                        <span className={`rounded-md px-1 text-center text-[11px] font-bold ${m.group === 'A' ? 'bg-sky-400/15 text-sky-300' : 'bg-fuchsia-400/15 text-fuchsia-300'}`}>{m.group}</span>
                        <span className={`truncate text-right text-sm tablet:text-lg ${aWin ? 'font-bold' : done ? 'text-white/50' : ''}`}>{name(m.a)}</span>
                        <span className="min-w-[54px] rounded-lg bg-bg px-2 py-0.5 text-center font-display font-bold tabular-nums">
                          {done ? (
                            <>
                              <span className={aWin ? 'text-accent-light' : ''}>{m.legsA}</span>:<span className={bWin ? 'text-accent-light' : ''}>{m.legsB}</span>
                            </>
                          ) : now ? (
                            <span className="text-[10px] text-amber-300">JETZT</span>
                          ) : (
                            <span className="text-muted">–:–</span>
                          )}
                        </span>
                        <span className={`truncate text-left text-sm tablet:text-lg ${bWin ? 'font-bold' : done ? 'text-white/50' : ''}`}>{name(m.b)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </Card>
          </div>
          </div>
        ))}

      {/* --------------------------- Double Elimination --------------------------- */}
      {section === 'ko' &&
        (!de.ready ? (
          <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <Trophy className="text-muted" size={30} />
            <div className="font-display text-xl font-bold">Gruppenphase läuft noch</div>
            <p className="max-w-md text-sm text-muted">
              Sobald alle Gruppenspiele eingetragen sind, entsteht der Turnierbaum automatisch: die obere Hälfte jeder Gruppe startet im Winners Bracket, die untere im Losers Bracket.
            </p>
            {t.groupMatches.length > 0 && (
              <div className="w-full max-w-xs">
                <ProgressBar pct={(groupPlayed / t.groupMatches.length) * 100} />
                <div className="mt-1 text-xs text-muted">
                  {groupPlayed} / {t.groupMatches.length} Gruppenspiele
                </div>
              </div>
            )}
          </Card>
        ) : (
          <>
            {de.champion && (
              <Card className="border-gold/50 shadow-gold">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-4">
                    <div className="rounded-2xl bg-gold/15 p-4 text-gold">
                      <Crown size={34} />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-widest text-gold/80">Turniersieger</div>
                      <div className="font-display text-3xl font-extrabold text-gold tablet:text-5xl">{name(de.champion)}</div>
                      <div className="text-sm text-muted">gewinnt {euro(pot)}</div>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-wrap gap-3 text-sm sm:justify-center">
                    {de.second && (
                      <span className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2">
                        <Medal size={16} className="text-silver" /> 2. {name(de.second)}
                      </span>
                    )}
                    {de.third && (
                      <span className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2">
                        <Medal size={16} className="text-bronze" /> 3. {name(de.third)}
                      </span>
                    )}
                  </div>
                  {canEdit &&
                    (t.hofEntryId ? (
                      <Btn variant="ghost" onClick={goHallOfFame}>
                        <Award size={16} className="text-gold" /> In der Hall of Fame
                      </Btn>
                    ) : (
                      <Btn variant="gold" onClick={toHallOfFame}>
                        <Award size={16} /> In Hall of Fame übernehmen
                      </Btn>
                    ))}
                </div>
              </Card>
            )}
            <DoubleElim de={de} names={names} tags={tags} currentId={currentId} onClick={canEdit ? openKoMatch : undefined} />
            <p className="px-1 text-xs text-muted">
              Kürzel wie „A1“ = Platz in der Gruppe. Die nächste Partie wählt die App so, dass möglichst niemand zweimal direkt hintereinander ans Board muss.
            </p>
          </>
        ))}

      <ResultModal target={target} onClose={() => setTarget(null)} />
      <PotLedger open={ledgerOpen} onClose={() => setLedgerOpen(false)} />
      <OddsModal data={oddsView} onClose={() => setOddsView(null)} />
    </div>
  );
}
