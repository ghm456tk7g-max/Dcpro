import { useMemo, useState } from 'react';
import { Crown, Trophy } from 'lucide-react';
import { useLeague } from '../lib/league';
import {
  completedDays,
  computeDay,
  computeKo,
  computeOverall,
  formatDate,
  formatDiff,
  isPlayed,
  roundName,
} from '../lib/logic';
import { RANKS, rangeLabel, rankProgress } from '../lib/ranks';
import { MATCHDAY_COUNT } from '../lib/types';
import RankBadge from './RankBadge';
import PaymentCard from './PaymentCard';
import { playerPayments } from '../lib/cash';
import { Modal, ProgressBar } from './ui';

interface HistoryItem {
  key: string;
  time: number;
  date: string;
  text: string;
  badge: string;
  tone: 'win' | 'loss' | 'gold' | 'ko';
}

export default function PlayerProfile() {
  const { state, profileId, openProfile } = useLeague();
  const [showAll, setShowAll] = useState(false);

  const data = useMemo(() => {
    if (!profileId) return null;
    const player = state.players.find((p) => p.id === profileId);
    if (!player) return null;
    const overall = computeOverall(state);
    const place = overall.findIndex((r) => r.playerId === profileId) + 1;
    const row = overall[place - 1];
    const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? '—';

    let s180 = 0;
    let hf = 0;
    let best = 0;
    let koTitles = 0;
    const history: HistoryItem[] = [];

    for (const day of state.matchdays) {
      const sp = day.specials[profileId];
      if (sp) {
        s180 += sp.s180;
        hf += sp.hf;
        best = Math.max(best, sp.bestFinish);
      }
      const dayTs = day.date ? new Date(day.date + 'T23:59:00').getTime() : day.number;
      for (const m of day.matches) {
        if (!isPlayed(m) || (m.a !== profileId && m.b !== profileId)) continue;
        const me = m.a === profileId;
        const my = me ? m.legsA! : m.legsB!;
        const opp = me ? m.legsB! : m.legsA!;
        const win = my > opp;
        history.push({
          key: m.id,
          time: m.playedAt ? new Date(m.playedAt).getTime() : dayTs,
          date: formatDate(m.playedAt ?? day.date, !!m.playedAt) || `Spieltag ${day.number}`,
          text: `${win ? 'Sieg' : 'Niederlage'} ${my}:${opp} gegen ${name(me ? m.b : m.a)} · Spieltag ${day.number} · Best of ${Math.max(my, opp) * 2 - 1}`,
          badge: win ? '+1 Pkt.' : '0 Pkt.',
          tone: win ? 'win' : 'loss',
        });
      }
      const res = computeDay(day, state.players);
      if (res.winnerId === profileId) {
        const last = day.matches.reduce((t, m) => Math.max(t, m.playedAt ? new Date(m.playedAt).getTime() : 0), 0);
        history.push({
          key: `dw-${day.number}`,
          time: (last || dayTs) + 1,
          date: formatDate(day.date) || `Spieltag ${day.number}`,
          text: `Tagessieg · Spieltag ${day.number}${res.manual ? ' (Stechen)' : ''}`,
          badge: '+2 Pkt.',
          tone: 'gold',
        });
      }
      const ko = computeKo(day, state.players);
      for (const b of [ko.upper, ko.lower]) {
        if (b.champion === profileId && b.rounds.length) koTitles++;
        b.rounds.forEach((round) =>
          round.forEach((m) => {
            if (m.s1 === null || (m.p1 !== profileId && m.p2 !== profileId)) return;
            const me = m.p1 === profileId;
            const my = me ? m.s1 : m.s2!;
            const opp = me ? m.s2! : m.s1;
            const r = day.koResults[m.id];
            history.push({
              key: m.id + day.number,
              time: r ? new Date(r.playedAt).getTime() : dayTs,
              date: formatDate(r?.playedAt ?? null, true),
              text: `K.O. ${roundName(m.round, b.rounds.length)} (${b.key === 'U' ? 'Gewinner' : 'Loser'}-Bracket): ${my > opp ? 'Sieg' : 'Niederlage'} ${my}:${opp} gegen ${name(me ? m.p2! : m.p1!)}`,
              badge: b.champion === profileId && m.round === b.rounds.length - 1 ? 'Titel' : 'K.O.',
              tone: 'ko',
            });
          }),
        );
      }
    }
    history.sort((a, b) => b.time - a.time);
    return { player, row, place, total: overall.length, s180, hf, best, koTitles, history };
  }, [profileId, state]);

  if (!data) return null;
  const { player, row, place, total, history } = data;
  const prog = rankProgress(row.points);
  const winrate = row.played ? Math.round((row.wins / row.played) * 100) : 0;
  const done = completedDays(state);
  const shown = showAll ? history : history.slice(0, 8);

  const tiles: { value: string; label: string; tone?: string }[] = [
    { value: String(row.wins), label: 'Siege', tone: 'text-accent-light' },
    { value: String(row.losses), label: 'Niederlagen' },
    { value: `${winrate} %`, label: 'Winrate' },
    { value: formatDiff(row.diff), label: 'Leg-Differenz', tone: row.diff > 0 ? 'text-accent-light' : row.diff < 0 ? 'text-red-300' : '' },
    { value: String(row.dayWins), label: 'Tagessiege', tone: 'text-gold' },
    { value: `${data.s180} / ${data.hf}`, label: '180er / High-Finishes' },
  ];

  return (
    <Modal
      open
      wide
      onClose={() => {
        openProfile(null);
        setShowAll(false);
      }}
      title={
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-glow" /> Oche-Profil
        </span>
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {/* Kopf mit Wappen */}
        <div className="relative overflow-hidden rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full blur-3xl" style={{ background: prog.rank.from + '22' }} />
          <div className="relative flex items-center gap-4 sm:gap-6">
            <RankBadge rank={prog.rank} size={96} className="shrink-0 drop-shadow-[0_8px_20px_rgba(0,0,0,.6)]" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-3xl font-extrabold sm:text-4xl">{player.name}</div>
              <div className="mt-0.5 font-display text-lg font-bold" style={{ color: prog.rank.rim }}>
                {prog.rank.name}
              </div>
              <div className="mt-1 font-display text-xl font-bold text-accent-light">{row.points} Pkt.</div>
              <div className="mt-2 max-w-sm">
                <ProgressBar pct={prog.pct} className="h-2" />
                <div className="mt-1.5 text-xs text-muted">
                  {prog.next ? `${prog.missing} Pkt. bis zur nächsten Division (${prog.next.name})` : 'Höchste Division erreicht'}
                </div>
                <div className="text-xs text-muted">
                  Saison {state.settings.seasonName} · Platz {place} von {total}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Saison */}
        <div className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-muted">Saison {state.settings.seasonName}</div>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5">
            <div className="shrink-0 font-display text-lg font-bold">
              {done < MATCHDAY_COUNT ? `Noch ${MATCHDAY_COUNT - done} Spieltage bis zum Saison-Ende` : 'Saison abgeschlossen'}
            </div>
            <ProgressBar pct={(done / MATCHDAY_COUNT) * 100} className="sm:flex-1" />
          </div>
          <div className="mt-1 text-xs text-muted">
            {done} von {MATCHDAY_COUNT} Spieltagen gespielt
            {data.best > 0 && ` · Höchstes Finish: ${data.best}`}
            {data.koTitles > 0 && ` · K.O.-Titel: ${data.koTitles}`}
          </div>
        </div>

        {/* 6 Kacheln */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-line bg-panel px-3.5 py-3">
              <div className={`font-display text-2xl font-extrabold tabular-nums ${t.tone ?? ''}`}>{t.value}</div>
              <div className="text-xs text-muted">{t.label}</div>
            </div>
          ))}
        </div>

        {/* Kasse & Auszahlung */}
        <PaymentCard pay={playerPayments(state, player.id)} />

        {/* Letzte Spiele */}
        <div className="rounded-2xl border border-line bg-panel">
          <div className="px-4 pb-2 pt-4 text-sm font-semibold uppercase tracking-[0.14em] text-white/80 sm:px-5">Letzte Spiele</div>
          {history.length === 0 && <div className="px-5 pb-5 text-sm text-muted">Noch keine Spiele eingetragen.</div>}
          <ul>
            {shown.map((h) => (
              <li key={h.key} className="flex items-center gap-3 border-t border-line/60 px-4 py-2.5 text-sm sm:px-5">
                <span className="hidden w-28 shrink-0 text-xs text-muted sm:block">{h.date}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted sm:hidden">{h.date}</span>
                  {h.tone === 'gold' && <Crown size={14} className="mr-1 inline text-gold" />}
                  {h.tone === 'ko' && <Trophy size={14} className="mr-1 inline text-sky-300" />}
                  {h.text}
                </span>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
                    h.tone === 'win'
                      ? 'bg-accent/15 text-accent-light'
                      : h.tone === 'gold'
                        ? 'bg-gold/15 text-gold'
                        : h.tone === 'ko'
                          ? 'bg-sky-400/10 text-sky-300'
                          : 'text-muted'
                  }`}
                >
                  {h.badge}
                </span>
              </li>
            ))}
          </ul>
          {history.length > 8 && (
            <button onClick={() => setShowAll((v) => !v)} className="w-full border-t border-line/60 py-2.5 text-sm text-accent-light hover:bg-white/[0.03]">
              {showAll ? 'Weniger anzeigen' : `Alle ${history.length} anzeigen`}
            </button>
          )}
        </div>

        {/* Rang-Leiste */}
        <div className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <div className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Dein Weg zur Legende</div>
          <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
            {RANKS.map((r) => {
              const current = r.index === prog.rank.index;
              const reached = r.index <= prog.rank.index;
              return (
                <div
                  key={r.name}
                  className={`flex min-w-[118px] flex-1 flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition ${
                    current ? 'border-gold bg-gold/10 shadow-gold' : 'border-line bg-panel2'
                  }`}
                >
                  <RankBadge rank={r} size={52} locked={!reached} />
                  <div className={`text-sm font-bold leading-tight ${current ? 'text-gold' : reached ? 'text-white' : 'text-muted'}`}>{r.name}</div>
                  <div className="text-[11px] text-muted">{rangeLabel(r)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
