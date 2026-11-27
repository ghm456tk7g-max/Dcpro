import { computeOverall, isPlayed } from './logic';
import { LeagueState } from './types';

/* ------------------------------------------------------------------ */
/* Average                                                              */
/* ------------------------------------------------------------------ */

export function avgSeries(state: LeagueState, pid: string) {
  const points = state.matchdays.map((d) => {
    const v = d.specials[pid]?.avg;
    return typeof v === 'number' && v > 0 ? v : null;
  });
  const vals = points.filter((v): v is number => v !== null);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const best = vals.length ? Math.max(...vals) : null;
  const last = vals.length ? vals[vals.length - 1] : null;
  return { points, mean, best, last, count: vals.length };
}

/* ------------------------------------------------------------------ */
/* Alle gespielten Partien (Liga + K.O. am Spieltag), chronologisch     */
/* ------------------------------------------------------------------ */

export interface Game {
  a: string;
  b: string;
  la: number;
  lb: number;
  /** First to N */
  firstTo: number;
  at: number;
  day: number;
  ko: boolean;
}

export function allGames(state: LeagueState): Game[] {
  const games: Game[] = [];
  for (const d of state.matchdays) {
    const base = d.date ? new Date(d.date + 'T19:00:00').getTime() : d.number * 864e5;
    d.matches.forEach((m, i) => {
      if (!isPlayed(m)) return;
      games.push({
        a: m.a,
        b: m.b,
        la: m.legsA!,
        lb: m.legsB!,
        firstTo: Math.max(m.legsA!, m.legsB!),
        at: m.playedAt ? new Date(m.playedAt).getTime() : base + i,
        day: d.number,
        ko: false,
      });
    });
    for (const r of Object.values(d.koResults)) {
      games.push({ a: r.p1, b: r.p2, la: r.s1, lb: r.s2, firstTo: Math.max(r.s1, r.s2), at: new Date(r.playedAt).getTime() || base + 1e6, day: d.number, ko: true });
    }
  }
  return games.sort((x, y) => x.at - y.at);
}

/* ------------------------------------------------------------------ */
/* Direkter Vergleich                                                   */
/* ------------------------------------------------------------------ */

export interface H2H {
  opp: string;
  played: number;
  wins: number;
  losses: number;
  legsFor: number;
  legsAgainst: number;
}

export function headToHead(state: LeagueState, pid: string, games = allGames(state)): H2H[] {
  const map = new Map<string, H2H>();
  for (const g of games) {
    if (g.a !== pid && g.b !== pid) continue;
    const me = g.a === pid;
    const opp = me ? g.b : g.a;
    const my = me ? g.la : g.lb;
    const their = me ? g.lb : g.la;
    const r = map.get(opp) ?? { opp, played: 0, wins: 0, losses: 0, legsFor: 0, legsAgainst: 0 };
    r.played++;
    r.legsFor += my;
    r.legsAgainst += their;
    if (my > their) r.wins++;
    else r.losses++;
    map.set(opp, r);
  }
  return [...map.values()].sort((x, y) => y.played - x.played || y.wins - y.losses - (x.wins - x.losses));
}

/* ------------------------------------------------------------------ */
/* Quoten-Modell (just for fun)                                          */
/* ------------------------------------------------------------------ */

const ELO_START = 1500;
const ELO_K = 32;
const FORM_GAMES = 5;
const MARGIN = 1.07; // "Buchmacher-Marge" wie bei echten Quoten

export interface OddsModel {
  elo: Map<string, number>;
  form: Map<string, ('S' | 'N')[]>;
  played: Map<string, number>;
  formScore: Map<string, number>;
  ppg: Map<string, number>;
  avg: Map<string, number | null>;
  games: Game[];
}

export function buildOddsModel(state: LeagueState): OddsModel {
  const games = allGames(state);
  const elo = new Map<string, number>(state.players.map((p) => [p.id, ELO_START]));
  const form = new Map<string, ('S' | 'N')[]>(state.players.map((p) => [p.id, []]));
  const played = new Map<string, number>();
  for (const g of games) {
    const ra = elo.get(g.a) ?? ELO_START;
    const rb = elo.get(g.b) ?? ELO_START;
    const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
    const aWon = g.la > g.lb;
    // Klarer Sieg (2:0) zählt mehr als knapper (2:1)
    const diff = Math.abs(g.la - g.lb);
    const mov = 0.75 + 0.5 * (diff / Math.max(1, g.firstTo));
    const delta = ELO_K * mov * ((aWon ? 1 : 0) - ea);
    elo.set(g.a, ra + delta);
    elo.set(g.b, rb - delta);
    form.get(g.a)?.push(aWon ? 'S' : 'N');
    form.get(g.b)?.push(aWon ? 'N' : 'S');
    played.set(g.a, (played.get(g.a) ?? 0) + 1);
    played.set(g.b, (played.get(g.b) ?? 0) + 1);
  }
  const formScore = new Map<string, number>();
  form.forEach((list, id) => {
    const last = list.slice(-FORM_GAMES);
    form.set(id, last);
    // jüngste Spiele zählen mehr; Ergebnis zwischen -1 und +1
    let sum = 0;
    let wsum = 0;
    last.forEach((r, i) => {
      const w = 0.8 ** (last.length - 1 - i);
      sum += (r === 'S' ? 1 : -1) * w;
      wsum += w;
    });
    formScore.set(id, wsum ? sum / wsum : 0);
  });
  const ppg = new Map<string, number>();
  for (const r of computeOverall(state)) ppg.set(r.playerId, r.played ? r.points / r.played : 0);
  const avg = new Map(state.players.map((p) => [p.id, avgSeries(state, p.id).mean]));
  return { elo, form, formScore, ppg, avg, games, played };
}

export interface OddsFactor {
  label: string;
  a: string;
  b: string;
  /** Beitrag zum Stärke-Unterschied zugunsten von A (Elo-Punkte) */
  points: number;
}

export interface Odds {
  pA: number;
  pB: number;
  oddsA: number;
  oddsB: number;
  factors: OddsFactor[];
  favorite: 'a' | 'b' | null;
}

const fmt = (v: number, d = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

export function matchOdds(model: OddsModel, a: string, b: string): Odds {
  const eA = model.elo.get(a) ?? ELO_START;
  const eB = model.elo.get(b) ?? ELO_START;
  const fA = model.formScore.get(a) ?? 0;
  const fB = model.formScore.get(b) ?? 0;
  const pA = model.ppg.get(a) ?? 0;
  const pB = model.ppg.get(b) ?? 0;
  const aA = model.avg.get(a) ?? null;
  const aB = model.avg.get(b) ?? null;
  let hw = 0;
  let hl = 0;
  for (const g of model.games) {
    if (g.a === a && g.b === b) (g.la > g.lb ? hw++ : hl++);
    else if (g.a === b && g.b === a) (g.lb > g.la ? hw++ : hl++);
  }
  const fl = (id: string) => (model.form.get(id) ?? []).join('') || '–';
  const factors: OddsFactor[] = [
    { label: 'Stärke-Rating (Elo)', a: fmt(eA), b: fmt(eB), points: eA - eB },
    { label: `Form (letzte ${FORM_GAMES})`, a: fl(a), b: fl(b), points: 50 * (fA - fB) },
    { label: 'Punkte pro Spiel (Tabelle)', a: fmt(pA, 2), b: fmt(pB, 2), points: 90 * (pA - pB) },
    { label: 'Direkter Vergleich', a: `${hw} Siege`, b: `${hl} Siege`, points: (120 * (hw - hl)) / (hw + hl + 2) },
  ];
  if (aA !== null && aB !== null) factors.push({ label: 'Ø Average', a: fmt(aA, 1), b: fmt(aB, 1), points: 3 * (aA - aB) });
  // Wenig Daten = vorsichtigere Quote: Unterschied wird gedämpft, bis beide ~15 Spiele haben
  const n = Math.min(model.played.get(a) ?? 0, model.played.get(b) ?? 0);
  const trust = n / (n + 6);
  factors.forEach((f) => (f.points *= trust));
  const d = factors.reduce((s, f) => s + f.points, 0);
  let p = 1 / (1 + 10 ** (-d / 400));
  p = Math.min(0.9, Math.max(0.1, p));
  const odds = (x: number) => Math.max(1.01, Math.round((1 / (x * MARGIN)) * 100) / 100);
  return {
    pA: p,
    pB: 1 - p,
    oddsA: odds(p),
    oddsB: odds(1 - p),
    factors,
    favorite: Math.abs(p - 0.5) < 0.02 ? null : p > 0.5 ? 'a' : 'b',
  };
}

export const fmtOdds = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
