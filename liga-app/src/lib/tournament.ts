import { accumulate, emptyRow, isPlayed, roundRobin, seedPositions, sortRows, StatRow } from './logic';
import { GroupKey, TGroupMatch, TResult, Tournament, uid } from './types';

/** Punkte pro Sieg in der Gruppenphase */
export const GROUP_WIN_POINTS = 2;

export const tNames = (t: Tournament) => new Map(t.participants.map((p) => [p.id, p.name]));

/* ================================================================== */
/* 1) Auslosung & optimierte Spielreihenfolge (eine Scheibe)          */
/* ================================================================== */

export function shuffle<T>(arr: T[], rand = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Zufällig in 2 ausgeglichene Gruppen (Größenunterschied max. 1) */
export function drawGroups(ids: string[], rand = Math.random): Record<GroupKey, string[]> {
  const s = shuffle(ids, rand);
  const half = Math.ceil(s.length / 2);
  return { A: s.slice(0, half), B: s.slice(half) };
}

interface Pairing {
  group: GroupKey;
  a: string;
  b: string;
}

export interface ScheduleStats {
  /** wie oft jemand zweimal direkt hintereinander spielt */
  backToBack: number;
  /** längste Wartezeit in Spielen zwischen zwei eigenen Partien */
  maxGap: number;
  /** längste Wartezeit bis zum ersten eigenen Spiel */
  maxFirstWait: number;
  /** Streuung der Pausen (kleiner = gleichmäßiger) */
  spread: number;
}

export function scheduleStats(seq: { a: string; b: string }[]): ScheduleStats {
  const seen = new Map<string, number[]>();
  seq.forEach((m, i) => {
    for (const p of [m.a, m.b]) seen.set(p, [...(seen.get(p) ?? []), i]);
  });
  let backToBack = 0;
  let maxGap = 0;
  let maxFirstWait = 0;
  const gaps: number[] = [];
  seen.forEach((idx) => {
    maxFirstWait = Math.max(maxFirstWait, idx[0]);
    for (let k = 1; k < idx.length; k++) {
      const g = idx[k] - idx[k - 1] - 1;
      if (g === 0) backToBack++;
      maxGap = Math.max(maxGap, g);
      gaps.push(g);
    }
  });
  const mean = gaps.reduce((s, g) => s + g, 0) / Math.max(1, gaps.length);
  const spread = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / Math.max(1, gaps.length));
  return { backToBack, maxGap, maxFirstWait, spread };
}

/** Ein Versuch: gierig, Gruppen im Verhältnis ihrer Spielanzahl abwechselnd, wer am längsten wartet, spielt zuerst */
function buildOnce<P extends Pairing>(pool: Record<GroupKey, P[]>, rand: () => number, prefix: Pairing[] = []): P[] {
  const left: Record<GroupKey, P[]> = { A: shuffle(pool.A, rand), B: shuffle(pool.B, rand) };
  const total = { A: pool.A.length, B: pool.B.length };
  const done = { A: 0, B: 0 };
  const last = new Map<string, number>();
  const count = new Map<string, number>();
  // bereits gespielte Partien: wer zuletzt dran war, soll nicht gleich wieder ran
  prefix.forEach((m, i) => {
    for (const p of [m.a, m.b]) {
      last.set(p, i - prefix.length);
      count.set(p, (count.get(p) ?? 0) + 1);
    }
  });
  const seq: P[] = [];
  const n = total.A + total.B;

  for (let step = 0; step < n; step++) {
    // Gruppe, die "an der Reihe" ist (gleichmäßig verteilt, bei gleicher Größe strikt abwechselnd)
    const due = (g: GroupKey) => (left[g].length ? (done[g] + 0.5) / total[g] : Infinity);
    const prev = seq[seq.length - 1] ?? prefix[prefix.length - 1];
    let order: GroupKey[] = due('A') < due('B') ? ['A', 'B'] : due('B') < due('A') ? ['B', 'A'] : prev?.group === 'A' ? ['B', 'A'] : ['A', 'B'];
    order = order.filter((g) => left[g].length);

    const rest = (p: string) => step - (last.get(p) ?? -3);
    const score = (m: Pairing) => {
      const ra = rest(m.a);
      const rb = rest(m.b);
      let s = 0;
      if (ra === 1 || rb === 1) s -= 1000; // direkt hintereinander -> vermeiden
      s += Math.min(ra, rb) * 10 + (ra + rb); // wer lange wartet, kommt dran
      s -= ((count.get(m.a) ?? 0) + (count.get(m.b) ?? 0)) * 2; // wer weniger gespielt hat, zuerst
      return s + rand() * 0.5;
    };

    let pick = null as { g: GroupKey; i: number; s: number } | null;
    for (const g of order) {
      left[g].forEach((m, i) => {
        const s = score(m) - (g === order[0] ? 0 : 400); // eigentlich fällige Gruppe bevorzugen
        if (!pick || s > pick.s) pick = { g, i, s };
      });
    }
    const { g, i } = pick!;
    const m = left[g].splice(i, 1)[0];
    done[g]++;
    seq.push(m);
    for (const p of [m.a, m.b]) {
      last.set(p, step);
      count.set(p, (count.get(p) ?? 0) + 1);
    }
  }
  return seq;
}

/**
 * Optimierte Board-Reihenfolge für die Gruppenphase:
 * abwechselnd Gruppe A/B, niemand zweimal hintereinander, Pausen möglichst gleichmäßig.
 * Viele zufällige Versuche, der beste nach (Doppelspiele, längste Pause, Streuung) gewinnt.
 */
export function optimizeGroupOrder(groups: Record<GroupKey, string[]>, attempts = 400, rand = Math.random): Pairing[] {
  const pool: Record<GroupKey, Pairing[]> = {
    A: roundRobin(groups.A).map(({ a, b }) => ({ group: 'A' as const, a, b })),
    B: roundRobin(groups.B).map(({ a, b }) => ({ group: 'B' as const, a, b })),
  };
  return optimizePool(pool, [], attempts, rand);
}

function optimizePool<P extends Pairing>(pool: Record<GroupKey, P[]>, prefix: Pairing[], attempts: number, rand: () => number): P[] {
  let best: P[] = [];
  let bestScore = Infinity;
  for (let k = 0; k < attempts; k++) {
    const seq = buildOnce(pool, rand, prefix);
    const st = scheduleStats([...prefix, ...seq]);
    const sc = st.backToBack * 10000 + st.maxGap * 100 + st.maxFirstWait * 20 + st.spread * 10;
    if (sc < bestScore) {
      bestScore = sc;
      best = seq;
    }
  }
  return best;
}

export function createGroupPhase(ids: string[], rand = Math.random) {
  const groups = drawGroups(ids, rand);
  const groupMatches: TGroupMatch[] = optimizeGroupOrder(groups, 400, rand).map((m) => ({
    id: uid(),
    group: m.group,
    a: m.a,
    b: m.b,
    legsA: null,
    legsB: null,
    playedAt: null,
  }));
  return { groups, groupMatches };
}

/**
 * Zufallsgenerator "Reihenfolge neu mischen": Gruppen und bereits gespielte Partien bleiben,
 * die offenen Partien bekommen eine neue, wieder optimierte Reihenfolge.
 */
export function reshuffleGroupOrder(t: Tournament, rand = Math.random): TGroupMatch[] {
  const played = t.groupMatches
    .filter(isPlayed)
    .sort((x, y) => ((x.playedAt ?? '') < (y.playedAt ?? '') ? -1 : 1));
  const open = t.groupMatches.filter((m) => !isPlayed(m));
  const pool = { A: open.filter((m) => m.group === 'A'), B: open.filter((m) => m.group === 'B') };
  return [...played, ...optimizePool(pool, played, 400, rand)];
}

/* ================================================================== */
/* 2) Gruppentabellen                                                  */
/* ================================================================== */

export function groupTable(t: Tournament, g: GroupKey): StatRow[] {
  const ids = t.groups?.[g] ?? [];
  const rows = new Map(ids.map((id) => [id, emptyRow(id)]));
  const ms = t.groupMatches.filter((m) => m.group === g);
  accumulate(rows, ms, GROUP_WIN_POINTS);
  return sortRows([...rows.values()], ms, tNames(t));
}

export const groupPhaseDone = (t: Tournament) => !!t.groups && t.groupMatches.length > 0 && t.groupMatches.every(isPlayed);

/** Obere Hälfte jeder Gruppe -> Winners Bracket, untere Hälfte -> Losers Bracket. Gruppen über Kreuz gesetzt (A1, B1, A2, B2 …) */
export function koSeeds(t: Tournament) {
  const a = groupTable(t, 'A').map((r) => r.playerId);
  const b = groupTable(t, 'B').map((r) => r.playerId);
  const ha = Math.ceil(a.length / 2);
  const hb = Math.ceil(b.length / 2);
  const interleave = (x: string[], y: string[]) => {
    const out: string[] = [];
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if (x[i]) out.push(x[i]);
      if (y[i]) out.push(y[i]);
    }
    return out;
  };
  return { winners: interleave(a.slice(0, ha), b.slice(0, hb)), losers: interleave(a.slice(ha), b.slice(hb)) };
}

/* ================================================================== */
/* 3) Double Elimination                                               */
/* ================================================================== */

export type Src = { t: 'seed'; id: string } | { t: 'win'; m: string } | { t: 'lose'; m: string };
export type DEBracket = 'W' | 'L' | 'GF' | 'GF2';

export interface DEMatchDef {
  id: string;
  bracket: DEBracket;
  /** 0-basierte Runde innerhalb des Brackets */
  round: number;
  a: Src;
  b: Src;
}

export interface DEPlan {
  matches: DEMatchDef[];
  wbRounds: number;
  lbRounds: number;
  /** Spieler mit Freilos in Runde 1 des Winners Brackets */
  wbByes: string[];
  /** Spieler, die im Losers Bracket eine Runde aussetzen (Freilos) */
  lbByes: string[];
}

/**
 * Baut den kompletten Turnierbaum aus den Setzlisten.
 * Funktioniert für beliebige Anzahlen im Winners (2 Leben) und Losers Bracket (1 Leben).
 */
export function buildDEPlan(wSeeds: string[], lSeeds: string[], resetFinal: boolean): DEPlan {
  const matches: DEMatchDef[] = [];
  const wbByes: string[] = [];
  const lbByes: string[] = [];
  const seed = (id: string): Src => ({ t: 'seed', id });

  // ---------- Winners Bracket ----------
  const drops: Src[][] = [];
  let wbChampion: Src | null = null;
  let wbRounds = 0;
  if (wSeeds.length === 1) wbChampion = seed(wSeeds[0]);
  if (wSeeds.length >= 2) {
    let size = 1;
    while (size < wSeeds.length) size *= 2;
    let slots: (Src | null)[] = seedPositions(size).map((p) => (wSeeds[p - 1] ? seed(wSeeds[p - 1]) : null));
    let r = 0;
    while (slots.length > 1) {
      const next: (Src | null)[] = [];
      const losers: Src[] = [];
      let k = 0;
      for (let i = 0; i < slots.length; i += 2) {
        const a = slots[i];
        const b = slots[i + 1];
        if (a && b) {
          const id = `W${r + 1}-${++k}`;
          matches.push({ id, bracket: 'W', round: r, a, b });
          next.push({ t: 'win', m: id });
          losers.push({ t: 'lose', m: id });
        } else {
          const pass = a ?? b;
          if (pass?.t === 'seed') wbByes.push(pass.id);
          next.push(pass);
        }
      }
      drops.push(losers);
      slots = next;
      r++;
    }
    wbChampion = slots[0];
    wbRounds = r;
  }

  // ---------- Losers Bracket ----------
  let pool: Src[] = lSeeds.map(seed);
  let lr = 0;
  const playRound = (pairs: [Src, Src][]): Src[] => {
    const out = pairs.map(([a, b], i) => {
      const id = `L${lr + 1}-${i + 1}`;
      matches.push({ id, bracket: 'L', round: lr, a, b });
      return { t: 'win', m: id } as Src;
    });
    lr++;
    return out;
  };
  /** Pool so weit reduzieren, dass höchstens `target` übrig bleiben (Bestplatzierte bekommen Freilose) */
  const reduceTo = (target: number) => {
    while (pool.length > Math.max(1, target)) {
      const m = Math.min(Math.floor(pool.length / 2), pool.length - Math.max(1, target));
      const keep = pool.slice(0, pool.length - 2 * m);
      const play = pool.slice(pool.length - 2 * m);
      keep.forEach((s) => s.t === 'seed' && lbByes.push(s.id));
      const pairs: [Src, Src][] = [];
      for (let i = 0; i < m; i++) pairs.push([play[i], play[2 * m - 1 - i]]);
      pool = [...keep, ...playRound(pairs)];
    }
  };
  for (const d of drops) {
    if (!d.length) continue;
    reduceTo(d.length);
    if (!pool.length) {
      pool = [...d];
      continue;
    }
    // Einsteiger aus dem Winners Bracket in umgekehrter Reihenfolge (vermeidet direkte Revanchen)
    const incoming = [...d].reverse();
    const m = Math.min(pool.length, incoming.length);
    const pairs: [Src, Src][] = [];
    for (let i = 0; i < m; i++) pairs.push([pool[i], incoming[i]]);
    pool = [...playRound(pairs), ...pool.slice(m), ...incoming.slice(m)];
  }
  reduceTo(1);
  const lbChampion = pool[0] ?? null;

  // ---------- Finale ----------
  if (wbChampion && lbChampion) {
    matches.push({ id: 'GF', bracket: 'GF', round: 0, a: wbChampion, b: lbChampion });
    if (resetFinal) matches.push({ id: 'GF2', bracket: 'GF2', round: 0, a: wbChampion, b: lbChampion });
  }
  return { matches, wbRounds, lbRounds: lr, wbByes, lbByes };
}

export interface DEMatchView extends DEMatchDef {
  p1: string | null;
  p2: string | null;
  s1: number | null;
  s2: number | null;
  winner: string | null;
  loser: string | null;
  /** false = Reset-Finale wird nicht benötigt */
  active: boolean;
}

export interface DEView {
  ready: boolean;
  plan: DEPlan;
  matches: DEMatchView[];
  byId: Map<string, DEMatchView>;
  champion: string | null;
  second: string | null;
  third: string | null;
  /** optimierte Reihenfolge der Match-IDs fürs Board */
  order: string[];
}

export function resolveDE(plan: DEPlan, results: Record<string, TResult>): Omit<DEView, 'ready' | 'order'> {
  const byId = new Map<string, DEMatchView>();
  const resolve = (s: Src): string | null =>
    s.t === 'seed' ? s.id : s.t === 'win' ? byId.get(s.m)?.winner ?? null : byId.get(s.m)?.loser ?? null;

  for (const d of plan.matches) {
    const v: DEMatchView = { ...d, p1: resolve(d.a), p2: resolve(d.b), s1: null, s2: null, winner: null, loser: null, active: true };
    if (d.bracket === 'GF2') {
      const gf = byId.get('GF');
      v.active = !!gf?.winner && gf.winner === gf.p2; // nur wenn der Losers-Bracket-Spieler das 1. Finale gewinnt
      if (!v.active) {
        v.p1 = null;
        v.p2 = null;
      }
    }
    const r = results[d.id];
    if (v.active && v.p1 && v.p2 && r && r.p1 === v.p1 && r.p2 === v.p2) {
      v.s1 = r.s1;
      v.s2 = r.s2;
      v.winner = r.s1 > r.s2 ? v.p1 : v.p2;
      v.loser = r.s1 > r.s2 ? v.p2 : v.p1;
    }
    byId.set(d.id, v);
  }

  const gf = byId.get('GF');
  const gf2 = byId.get('GF2');
  let champion: string | null = null;
  let second: string | null = null;
  if (gf?.winner) {
    if (gf.winner === gf.p1 || !gf2) {
      champion = gf.winner;
      second = gf.loser;
    } else if (gf2?.winner) {
      champion = gf2.winner;
      second = gf2.loser;
    }
  }
  const lbFinal = [...plan.matches].reverse().find((m) => m.bracket === 'L');
  const third = lbFinal ? byId.get(lbFinal.id)?.loser ?? null : null;
  return { plan, matches: [...byId.values()], byId, champion, second, third };
}

/** Quellen-Abhängigkeiten eines Matches */
const deps = (d: DEMatchDef) => [d.a, d.b].filter((s): s is Extract<Src, { m: string }> => s.t !== 'seed').map((s) => s.m);
const seedsOf = (d: DEMatchDef) => [d.a, d.b].filter((s): s is Extract<Src, { t: 'seed' }> => s.t === 'seed').map((s) => s.id);

/**
 * Board-Reihenfolge für den K.O.-Baum: nur Spiele, deren Vorgänger schon dran waren;
 * niemand direkt hintereinander (weder als Sieger/Verlierer des letzten Spiels noch als gesetzter Spieler),
 * Winners- und Losers-Bracket möglichst abwechselnd, frühe Runden zuerst.
 */
export function orderDE(plan: DEPlan): string[] {
  const rest = plan.matches.filter((m) => m.bracket !== 'GF2');
  const index = new Map(plan.matches.map((m, i) => [m.id, i]));
  const done: DEMatchDef[] = [];
  while (rest.length) {
    const doneIds = new Set(done.map((d) => d.id));
    const avail = rest.filter((m) => deps(m).every((x) => doneIds.has(x)));
    const last = done[done.length - 1];
    const last2 = done[done.length - 2];
    const score = (m: DEMatchDef) => {
      let s = index.get(m.id)!; // Grundreihenfolge
      if (last) {
        if (deps(m).includes(last.id)) s += 100;
        if (seedsOf(m).some((x) => seedsOf(last).includes(x))) s += 100;
        if (m.bracket !== last.bracket) s -= 3;
      }
      if (last2 && deps(m).includes(last2.id)) s += 4; // nur ein Spiel Pause -> eher später
      return s;
    };
    avail.sort((x, y) => score(x) - score(y));
    const pick = avail[0];
    done.push(pick);
    rest.splice(rest.indexOf(pick), 1);
  }
  const ids = done.map((d) => d.id);
  if (plan.matches.some((m) => m.id === 'GF2')) ids.push('GF2');
  return ids;
}

export function computeDE(t: Tournament): DEView {
  const ready = groupPhaseDone(t);
  const { winners, losers } = ready ? koSeeds(t) : { winners: [], losers: [] };
  const plan = buildDEPlan(winners, losers, t.resetFinal);
  return { ready, order: orderDE(plan), ...resolveDE(plan, t.koResults) };
}

/** K.O.-Ergebnisse löschen, deren Paarung nach einer Änderung nicht mehr stimmt */
export function pruneDE(t: Tournament) {
  const v = computeDE(t);
  for (const id of Object.keys(t.koResults)) {
    const m = v.byId.get(id);
    if (!m || m.s1 === null) delete t.koResults[id];
  }
}

export function deLabel(m: DEMatchDef, plan: DEPlan): string {
  if (m.bracket === 'GF') return 'Finale';
  if (m.bracket === 'GF2') return 'Reset-Finale';
  if (m.bracket === 'W') {
    const left = plan.wbRounds - m.round;
    const name = left === 1 ? 'WB-Finale' : left === 2 ? 'WB-Halbfinale' : `WB Runde ${m.round + 1}`;
    return name;
  }
  return m.round === plan.lbRounds - 1 ? 'LB-Finale' : `LB Runde ${m.round + 1}`;
}

export function srcLabel(s: Src, names: Map<string, string>): string {
  if (s.t === 'seed') return names.get(s.id) ?? '—';
  return `${s.t === 'win' ? 'Sieger' : 'Verlierer'} ${s.m}`;
}

/* ================================================================== */
/* 4) Kasse                                                            */
/* ================================================================== */

export const paidCount = (t: Tournament) => t.participants.filter((p) => p.paid).length;
export const total180 = (t: Tournament) => t.participants.reduce((sum, p) => sum + (p.s180 ?? 0), 0);
const num = (v: number) => (Number.isFinite(v) ? v : 0);

/** Pot = bezahlte Gebühren + 180er-Einzahlungen */
export function potBreakdown(t: Tournament) {
  const fees = paidCount(t) * num(t.fee);
  const bonus = total180(t) * num(t.per180);
  const openFees = (t.participants.length - paidCount(t)) * num(t.fee);
  return { fees, bonus, total: fees + bonus, openFees, possible: fees + bonus + openFees };
}
export const currentPot = (t: Tournament) => potBreakdown(t).total;
export const euro = (v: number) =>
  v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: v % 1 ? 2 : 0 });

/** Spieler des zuletzt gespielten Matches (Gruppenphase oder K.O.) */
function lastPlayers(t: Tournament): { last: string[]; prev: string[] } {
  const played: { at: string; ps: string[] }[] = [
    ...t.groupMatches.filter((m) => m.playedAt).map((m) => ({ at: m.playedAt!, ps: [m.a, m.b] })),
    ...Object.values(t.koResults).map((r) => ({ at: r.playedAt, ps: [r.p1, r.p2] })),
  ].sort((x, y) => (x.at < y.at ? 1 : -1));
  return { last: played[0]?.ps ?? [], prev: played[1]?.ps ?? [] };
}

const LOOKAHEAD_DEPTH = 5;

/**
 * Erwartete Anzahl "zweimal direkt hintereinander" für die nächsten Spiele,
 * wenn jetzt Match m gespielt wird (beide Ausgänge gleich wahrscheinlich, danach jeweils die beste Wahl).
 */
function lookahead(plan: DEPlan, results: Record<string, TResult>, m: DEMatchView, last: string[], depth: number): number {
  const here = last.includes(m.p1!) || last.includes(m.p2!) ? 1 : 0;
  if (depth <= 1) return here;
  let sum = 0;
  for (const p1Wins of [true, false]) {
    const res = { ...results, [m.id]: { p1: m.p1!, p2: m.p2!, s1: p1Wins ? 1 : 0, s2: p1Wins ? 0 : 1, playedAt: '' } };
    const v = resolveDE(plan, res);
    const ready = v.matches.filter((x) => x.active && x.p1 && x.p2 && !x.winner);
    if (!ready.length) continue;
    sum += Math.min(...ready.map((x) => lookahead(plan, res, x, [m.p1!, m.p2!], depth - 1)));
  }
  return here + sum / 2;
}

export interface QueueItem {
  kind: 'group' | 'ko';
  id: string;
  a: string;
  b: string;
  label: string;
}

/**
 * Warteschlange fürs Board. Gruppenphase: ausgeloste Reihenfolge.
 * K.O.: alle spielbaren Matches; wer gerade gespielt hat, rückt nach hinten, sonst optimierte Grundreihenfolge.
 */
export function boardQueue(t: Tournament, de: DEView): QueueItem[] {
  if (!groupPhaseDone(t)) {
    return t.groupMatches
      .filter((m) => !isPlayed(m))
      .map((m) => ({ kind: 'group' as const, id: m.id, a: m.a, b: m.b, label: `Gruppe ${m.group}` }));
  }
  const { last, prev } = lastPlayers(t);
  const pos = new Map(de.order.map((id, i) => [id, i]));
  const ready = de.matches.filter((m) => m.active && m.p1 && m.p2 && !m.winner);
  const cost = new Map(ready.map((m) => [m.id, lookahead(de.plan, t.koResults, m, last, LOOKAHEAD_DEPTH)]));
  const penalty = (m: DEMatchView) =>
    cost.get(m.id)! * 1000 + (prev.includes(m.p1!) || prev.includes(m.p2!) ? 10 : 0) + pos.get(m.id)!;
  return ready
    .sort((x, y) => penalty(x) - penalty(y))
    .map((m) => ({ kind: 'ko' as const, id: m.id, a: m.p1!, b: m.p2!, label: deLabel(m, de.plan) }));
}
