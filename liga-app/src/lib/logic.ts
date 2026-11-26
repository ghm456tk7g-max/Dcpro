import {
  LeagueMatch,
  LeagueState,
  Matchday,
  MATCHDAY_COUNT,
  Player,
  KoResult,
  uid,
} from './types';

/* ------------------------------------------------------------------ */
/* Spielplan (Jeder gegen Jeden, Kreis-Methode)                        */
/* ------------------------------------------------------------------ */

const BYE = '__bye__';

/** Round-Robin nach der Kreis-Methode: niemand spielt zweimal direkt hintereinander, wenn es sich vermeiden lässt. */
export function roundRobin(ids: string[]): { a: string; b: string; round: number }[] {
  const list = [...ids];
  if (list.length < 2) return [];
  if (list.length % 2) list.push(BYE);
  const n = list.length;
  const out: { a: string; b: string; round: number }[] = [];
  let cur = list;
  for (let r = 0; r < n - 1; r++) {
    for (let i = 0; i < n / 2; i++) {
      const x = cur[i];
      const y = cur[n - 1 - i];
      if (x === BYE || y === BYE) continue;
      // Heim/Gast abwechseln
      out.push(r % 2 === 0 ? { a: x, b: y, round: r } : { a: y, b: x, round: r });
    }
    cur = [cur[0], cur[n - 1], ...cur.slice(1, n - 1)];
  }
  return out;
}

/** Spielplan für die Anwesenden neu erzeugen; bereits eingetragene Ergebnisse gleicher Paarungen bleiben erhalten. */
export function buildMatches(attendees: string[], existing: LeagueMatch[]): LeagueMatch[] {
  return roundRobin(attendees).map(({ a, b, round }) => {
    const old = existing.find((m) => (m.a === a && m.b === b) || (m.a === b && m.b === a));
    if (!old) return { id: uid(), a, b, legsA: null, legsB: null, playedAt: null, round };
    const same = old.a === a;
    return {
      id: old.id,
      a,
      b,
      legsA: same ? old.legsA : old.legsB,
      legsB: same ? old.legsB : old.legsA,
      playedAt: old.playedAt,
      round,
    };
  });
}

/** Neue Saison: Spieltage starten leer, Anwesenheit wird am Abend per Klick erfasst */
export function createSeason(_players: Player[]): Matchday[] {
  return Array.from({ length: MATCHDAY_COUNT }, (_, i) => ({
    number: i + 1,
    started: false,
    date: null,
    attendees: [],
    matches: [],
    winnerOverride: null,
    koResults: {},
    specials: {},
  }));
}

/* ------------------------------------------------------------------ */
/* Status                                                               */
/* ------------------------------------------------------------------ */

export type Scored = Pick<LeagueMatch, 'a' | 'b' | 'legsA' | 'legsB'>;

export const isPlayed = (m: Scored) => m.legsA !== null && m.legsB !== null;

export const playedCount = (d: Matchday) => d.matches.filter(isPlayed).length;

export const isDayComplete = (d: Matchday) =>
  d.attendees.length >= 2 && d.matches.length > 0 && d.matches.every(isPlayed);

export type DayStatus = 'open' | 'running' | 'done';
export function dayStatus(d: Matchday): DayStatus {
  if (isDayComplete(d)) return 'done';
  return playedCount(d) > 0 ? 'running' : 'open';
}

export function completedDays(state: LeagueState) {
  return state.matchdays.filter(isDayComplete).length;
}

/** "Aktueller" Spieltag: erster nicht abgeschlossener, sonst der letzte. */
export function currentDayNumber(state: LeagueState): number {
  if (!state.matchdays.length) return 1;
  const running = state.matchdays.find((d) => dayStatus(d) === 'running');
  if (running) return running.number;
  const open = state.matchdays.find((d) => !isDayComplete(d));
  return open ? open.number : state.matchdays[state.matchdays.length - 1].number;
}

/* ------------------------------------------------------------------ */
/* Tabellen                                                             */
/* ------------------------------------------------------------------ */

export interface StatRow {
  playerId: string;
  played: number;
  wins: number;
  losses: number;
  legsFor: number;
  legsAgainst: number;
  diff: number;
  dayWins: number;
  points: number;
}

export const emptyRow = (playerId: string): StatRow => ({
  playerId,
  played: 0,
  wins: 0,
  losses: 0,
  legsFor: 0,
  legsAgainst: 0,
  diff: 0,
  dayWins: 0,
  points: 0,
});

export function accumulate(rows: Map<string, StatRow>, matches: Scored[], winPoints = 1) {
  for (const m of matches) {
    if (!isPlayed(m)) continue;
    const ra = rows.get(m.a);
    const rb = rows.get(m.b);
    const la = m.legsA!;
    const lb = m.legsB!;
    for (const [r, f, a] of [
      [ra, la, lb],
      [rb, lb, la],
    ] as const) {
      if (!r) continue;
      r.played++;
      r.legsFor += f;
      r.legsAgainst += a;
      if (f > a) r.wins++;
      else if (f < a) r.losses++;
    }
  }
  rows.forEach((r) => {
    r.diff = r.legsFor - r.legsAgainst;
    r.points = r.wins * winPoints + r.dayWins * 2;
  });
}

const primaryCmp = (x: StatRow, y: StatRow) =>
  y.points - x.points || y.diff - x.diff || y.legsFor - x.legsFor;

/** Sortierung: Punkte, Leg-Differenz, gewonnene Legs, direkter Vergleich (Mini-Tabelle der punktgleichen Spieler). */
export function sortRows(rows: StatRow[], matches: Scored[], names: Map<string, string>): StatRow[] {
  const sorted = [...rows].sort(primaryCmp);
  const out: StatRow[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && primaryCmp(sorted[i], sorted[j]) === 0) j++;
    const group = sorted.slice(i, j);
    if (group.length > 1) {
      const ids = new Set(group.map((g) => g.playerId));
      const h2h = new Map(group.map((g) => [g.playerId, { w: 0, d: 0 }]));
      for (const m of matches) {
        if (!isPlayed(m) || !ids.has(m.a) || !ids.has(m.b)) continue;
        const a = h2h.get(m.a)!;
        const b = h2h.get(m.b)!;
        a.d += m.legsA! - m.legsB!;
        b.d += m.legsB! - m.legsA!;
        if (m.legsA! > m.legsB!) a.w++;
        else if (m.legsB! > m.legsA!) b.w++;
      }
      group.sort((x, y) => {
        const hx = h2h.get(x.playerId)!;
        const hy = h2h.get(y.playerId)!;
        return (
          hy.w - hx.w ||
          hy.d - hx.d ||
          (names.get(x.playerId) ?? '').localeCompare(names.get(y.playerId) ?? '', 'de')
        );
      });
    }
    out.push(...group);
    i = j;
  }
  return out;
}

export function nameMap(players: Player[]) {
  return new Map(players.map((p) => [p.id, p.name]));
}

export interface DayResult {
  /** Tabelle inkl. Tagessieg-Bonus, in Anzeige-Reihenfolge */
  rows: StatRow[];
  complete: boolean;
  winnerId: string | null;
  /** true, wenn der Tagessieg manuell vergeben wurde */
  manual: boolean;
  /** Gleichstand an der Spitze, der nicht durch Legs / direkten Vergleich auflösbar ist */
  tieAtTop: boolean;
}

export function computeDay(day: Matchday, players: Player[]): DayResult {
  const names = nameMap(players);
  const ids = day.attendees.filter((id) => names.has(id));
  const rows = new Map(ids.map((id) => [id, emptyRow(id)]));
  accumulate(rows, day.matches);
  const base = sortRows([...rows.values()], day.matches, names);
  const complete = isDayComplete(day);

  let tieAtTop = false;
  if (complete && base.length > 1 && primaryCmp(base[0], base[1]) === 0) {
    // wirklich nicht aufgelöst, wenn direkter Vergleich zwischen den beiden ebenfalls offen ist
    const m = day.matches.find(
      (x) =>
        (x.a === base[0].playerId && x.b === base[1].playerId) ||
        (x.b === base[0].playerId && x.a === base[1].playerId),
    );
    tieAtTop = !m || m.legsA === m.legsB;
    // bei 3er-Gleichständen immer Stechen-Hinweis geben
    if (base.length > 2 && primaryCmp(base[1], base[2]) === 0) tieAtTop = true;
  }

  let winnerId: string | null = null;
  let manual = false;
  if (complete) {
    if (day.winnerOverride && rows.has(day.winnerOverride)) {
      winnerId = day.winnerOverride;
      manual = true;
    } else winnerId = base[0]?.playerId ?? null;
  }
  if (winnerId) {
    const r = rows.get(winnerId)!;
    r.dayWins = 1;
    r.points += 2;
  }
  // Tagessieger steht immer oben, der Rest bleibt in der sportlichen Reihenfolge
  const display = winnerId
    ? [rows.get(winnerId)!, ...base.filter((r) => r.playerId !== winnerId)]
    : base;
  return { rows: display, complete, winnerId, manual, tieAtTop };
}

export function computeOverall(state: LeagueState): StatRow[] {
  const names = nameMap(state.players);
  const rows = new Map(state.players.map((p) => [p.id, emptyRow(p.id)]));
  const all: LeagueMatch[] = [];
  for (const d of state.matchdays) {
    all.push(...d.matches);
    const { winnerId } = computeDay(d, state.players);
    if (winnerId && rows.has(winnerId)) rows.get(winnerId)!.dayWins++;
  }
  accumulate(rows, all);
  return sortRows([...rows.values()], all, names);
}

/* ------------------------------------------------------------------ */
/* K.O.-Phase                                                           */
/* ------------------------------------------------------------------ */

export type BracketKey = 'U' | 'L';

export interface KoMatchView {
  id: string;
  round: number;
  index: number;
  p1: string | null;
  p2: string | null;
  seed1: number | null;
  seed2: number | null;
  s1: number | null;
  s2: number | null;
  winner: string | null;
  bye: boolean;
}

export interface BracketView {
  key: BracketKey;
  seeds: string[];
  rounds: KoMatchView[][];
  champion: string | null;
}

/** Setzliste: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6 … */
export function seedPositions(size: number): number[] {
  let s = [1];
  while (s.length < size) {
    const n = s.length * 2;
    s = s.flatMap((x) => [x, n + 1 - x]);
  }
  return s;
}

export function roundName(round: number, total: number): string {
  const left = total - round;
  if (left === 1) return 'Finale';
  if (left === 2) return 'Halbfinale';
  if (left === 3) return 'Viertelfinale';
  if (left === 4) return 'Achtelfinale';
  return `Runde ${round + 1}`;
}

export function buildBracket(
  key: BracketKey,
  seeds: string[],
  results: Record<string, KoResult>,
): BracketView {
  if (seeds.length === 0) return { key, seeds, rounds: [], champion: null };
  if (seeds.length === 1) return { key, seeds, rounds: [], champion: seeds[0] };
  let size = 1;
  while (size < seeds.length) size *= 2;
  const pos = seedPositions(size);
  const seedOf = new Map(seeds.map((id, i) => [id, i + 1]));

  let entrants: (string | null)[] = pos.map((p) => seeds[p - 1] ?? null);
  const rounds: KoMatchView[][] = [];
  let r = 0;
  while (entrants.length > 1) {
    const ms: KoMatchView[] = [];
    for (let i = 0; i < entrants.length / 2; i++) {
      const p1 = entrants[2 * i];
      const p2 = entrants[2 * i + 1];
      const id = `${key}-R${r}-M${i}`;
      const m: KoMatchView = {
        id,
        round: r,
        index: i,
        p1,
        p2,
        seed1: p1 ? seedOf.get(p1) ?? null : null,
        seed2: p2 ? seedOf.get(p2) ?? null : null,
        s1: null,
        s2: null,
        winner: null,
        bye: false,
      };
      if (r === 0 && p1 && !p2) {
        m.bye = true;
        m.winner = p1;
      } else if (r === 0 && p2 && !p1) {
        m.bye = true;
        m.winner = p2;
      } else if (p1 && p2) {
        const res = results[id];
        if (res && res.p1 === p1 && res.p2 === p2) {
          m.s1 = res.s1;
          m.s2 = res.s2;
          m.winner = res.s1 > res.s2 ? p1 : p2;
        }
      }
      ms.push(m);
    }
    rounds.push(ms);
    entrants = ms.map((m) => m.winner);
    r++;
  }
  return { key, seeds, rounds, champion: entrants[0] ?? null };
}

export interface KoView {
  ready: boolean;
  upper: BracketView;
  lower: BracketView;
}

export function computeKo(day: Matchday, players: Player[]): KoView {
  const { rows, complete } = computeDay(day, players);
  const order = rows.map((r) => r.playerId);
  const half = Math.ceil(order.length / 2);
  const upperSeeds = complete ? order.slice(0, half) : [];
  const lowerSeeds = complete ? order.slice(half) : [];
  return {
    ready: complete && order.length >= 2,
    upper: buildBracket('U', upperSeeds, day.koResults),
    lower: buildBracket('L', lowerSeeds, day.koResults),
  };
}

/** Ergebnisse entfernen, deren Paarung nach einer Änderung nicht mehr existiert. */
export function pruneKoResults(day: Matchday, players: Player[]) {
  const ko = computeKo(day, players);
  const valid = new Set<string>();
  for (const b of [ko.upper, ko.lower])
    for (const round of b.rounds) for (const m of round) if (m.s1 !== null) valid.add(m.id);
  for (const id of Object.keys(day.koResults)) if (!valid.has(id)) delete day.koResults[id];
}

/* ------------------------------------------------------------------ */
/* Ergebnis-Validierung                                                 */
/* ------------------------------------------------------------------ */

export function validScores(firstTo: number): [number, number][] {
  const out: [number, number][] = [];
  for (let l = 0; l < firstTo; l++) out.push([firstTo, l]);
  for (let l = firstTo - 1; l >= 0; l--) out.push([l, firstTo]);
  return out;
}

export const formatDiff = (d: number) => (d > 0 ? `+${d}` : `${d}`);

export function formatDate(iso: string | null, withTime = false) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  if (!withTime) return date;
  return `${date}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}
