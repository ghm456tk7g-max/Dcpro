import { LeagueState, Matchday, Settings } from './types';
import { tAmountPer180, tPayersPer180 } from './tournament';
import { computeDayBets } from './bets';

/** 180er eines Spieltags (nur Anwesende) */
export const day180s = (d: Matchday) => d.attendees.reduce((sum, id) => sum + (d.specials[id]?.s180 ?? 0), 0);

/** Wie viele Personen zahlen für eine 180 eines bestimmten Werfers */
export const payersPer180 = (d: Matchday, s: Settings) => Math.max(0, d.attendees.length - (s.throwerPays180 ? 0 : 1));

export interface DayCash {
  attendees: number;
  /** Startgeld: Anwesende × Gebühr */
  fees: number;
  count180: number;
  /** Betrag, den eine einzelne 180 in die Kasse bringt */
  per180: number;
  bonus: number;
  /** Wirkung des Wettbüros auf den Pot (meist negativ: Einsätze/Auszahlungen) */
  bets: number;
  total: number;
}

/**
 * Kasse eines Spieltags. Mit `state` wird das Wettbüro berücksichtigt:
 * Einsätze stammen aus dem Startgeld (sind im Wettbüro, nicht im Pot), verfallene Töpfe
 * und Restguthaben fließen in den Pot zurück, Auszahlungen gehen an die Gewinner.
 */
export function dayCash(d: Matchday, s: Settings, state?: LeagueState): DayCash {
  if (!d.started) return { attendees: 0, fees: 0, count180: 0, per180: 0, bonus: 0, bets: 0, total: 0 };
  const fees = d.attendees.length * s.dayFee;
  const count180 = day180s(d);
  const per180 = payersPer180(d, s) * s.fee180;
  const bonus = count180 * per180;
  const bets = state && (d.bets ?? []).length ? computeDayBets(state, d).potEffect : 0;
  return { attendees: d.attendees.length, fees, count180, per180, bonus, bets, total: fees + bonus + bets };
}

/** Liga-Kasse über alle gestarteten Spieltage der Saison */
export function seasonCash(state: LeagueState) {
  return state.matchdays.reduce(
    (acc, d) => {
      const c = dayCash(d, state.settings, state);
      return { total: acc.total + c.total, fees: acc.fees + c.fees, bonus: acc.bonus + c.bonus, count180: acc.count180 + c.count180, days: acc.days + (d.started ? 1 : 0) };
    },
    { total: 0, fees: 0, bonus: 0, count180: 0, days: 0 },
  );
}

/* ------------------------------------------------------------------ */
/* Gesamt-Pot: alle Spieltage + alle 180er + Turnier                   */
/* ------------------------------------------------------------------ */

export interface LedgerLine {
  key: string;
  label: string;
  detail: string;
  amount: number;
  kind: 'fee' | '180';
}

export interface LedgerGroup {
  key: string;
  title: string;
  date: string | null;
  lines: LedgerLine[];
  total: number;
}

const eur = (v: number) => v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: v % 1 ? 2 : 0 });

/** Jede Einzahlung einzeln: Startgeld pro Spieltag, jede 180 pro Spieler, Turnier-Gebühren und Turnier-180er */
export function potLedger(state: LeagueState): { groups: LedgerGroup[]; total: number; league: number; tournament: number } {
  const s = state.settings;
  const pname = (id: string) => state.players.find((p) => p.id === id)?.name ?? '—';
  const groups: LedgerGroup[] = [];

  for (const d of state.matchdays) {
    if (!d.started) continue;
    const c = dayCash(d, s, state);
    const lines: LedgerLine[] = [
      { key: `${d.number}-fee`, kind: 'fee', label: 'Startgeld', detail: `${c.attendees} Anwesende × ${eur(s.dayFee)}`, amount: c.fees },
    ];
    if (c.bets) {
      const db = computeDayBets(state, d);
      lines.push({
        key: `${d.number}-bets`,
        kind: 'fee',
        label: 'Wettbüro',
        detail: db.settled
          ? `Einsätze ${eur(db.staked)} · Gewinne ausgezahlt, Verfallenes zurück in den Pot`
          : `Einsätze ${eur(db.staked)} liegen in den Wett-Töpfen`,
        amount: c.bets,
      });
    }
    for (const id of d.attendees) {
      const n = d.specials[id]?.s180 ?? 0;
      if (!n) continue;
      lines.push({
        key: `${d.number}-180-${id}`,
        kind: '180',
        label: `180 von ${pname(id)}${n > 1 ? ` (${n}×)` : ''}`,
        detail: `${n > 1 ? `${n} × ` : ''}${payersPer180(d, s)} Personen × ${eur(s.fee180)}`,
        amount: n * c.per180,
      });
    }
    groups.push({ key: `day-${d.number}`, title: `Spieltag ${d.number}`, date: d.date, lines, total: c.total });
  }
  const league = groups.reduce((sum, g) => sum + g.total, 0);

  const t = state.tournament;
  const paid = t.participants.filter((p) => p.paid).length;
  const tLines: LedgerLine[] = [];
  if (paid) tLines.push({ key: 't-fee', kind: 'fee', label: 'Turnier-Startgeld', detail: `${paid} bezahlt × ${eur(t.fee)}`, amount: paid * t.fee });
  for (const p of t.participants) {
    if (!p.s180) continue;
    tLines.push({
      key: `t-180-${p.id}`,
      kind: '180',
      label: `180 von ${p.name}${p.s180 > 1 ? ` (${p.s180}×)` : ''}`,
      detail: `${p.s180 > 1 ? `${p.s180} × ` : ''}${tPayersPer180(t, s)} Personen × ${eur(s.fee180)}`,
      amount: p.s180 * tAmountPer180(t, s),
    });
  }
  const tournament = tLines.reduce((sum, l) => sum + l.amount, 0);
  if (tLines.length) groups.push({ key: 'tournament', title: t.name, date: t.date, lines: tLines, total: tournament });

  return { groups, total: league + tournament, league, tournament };
}

/* ------------------------------------------------------------------ */
/* Unternehmenskasse: jeder Liga-Spieler zahlt pro Spieltag, auch wer fehlt (nicht im Pot) */
/* ------------------------------------------------------------------ */

export function clubCash(d: Matchday, state: LeagueState) {
  const players = state.players.length;
  const amount = d.started ? players * state.settings.clubFee : 0;
  return { players, amount };
}

export function clubLedger(state: LeagueState) {
  const lines = state.matchdays
    .filter((d) => d.started)
    .map((d) => ({ key: `club-${d.number}`, number: d.number, date: d.date, ...clubCash(d, state) }));
  return { lines, total: lines.reduce((s, l) => s + l.amount, 0) };
}

/* ------------------------------------------------------------------ */
/* Pro Spieler: was wurde eingezahlt, wie oft teilgenommen             */
/* ------------------------------------------------------------------ */

export type DayAttendance = 'present' | 'absent' | 'open';

export interface PlayerPayments {
  fees: number;
  rounds180: number;
  club: number;
  tournament: number;
  total: number;
  attended: number;
  startedDays: number;
  minAttendance: number;
  eligible: boolean;
  missing: number;
  /** Status je Spieltag 1–12 */
  days: DayAttendance[];
}

export function playerPayments(state: LeagueState, playerId: string): PlayerPayments {
  const s = state.settings;
  let fees = 0;
  let rounds180 = 0;
  let club = 0;
  let attended = 0;
  let startedDays = 0;
  const days: DayAttendance[] = [];
  for (const d of state.matchdays) {
    if (!d.started) {
      days.push('open');
      continue;
    }
    startedDays++;
    club += s.clubFee;
    if (!d.attendees.includes(playerId)) {
      days.push('absent');
      continue;
    }
    days.push('present');
    attended++;
    fees += s.dayFee;
    for (const id of d.attendees) {
      const n = d.specials[id]?.s180 ?? 0;
      if (!n || (id === playerId && !s.throwerPays180)) continue;
      rounds180 += n * s.fee180;
    }
  }
  // Turnier: eigene Gebühr (falls bezahlt) + Anteil an allen Turnier-180ern
  let tournament = 0;
  const t = state.tournament;
  const me = t.participants.find((p) => p.leagueId === playerId);
  if (me) {
    if (me.paid) tournament += t.fee;
    for (const p of t.participants) {
      if (!p.s180 || (p.id === me.id && !s.throwerPays180)) continue;
      tournament += p.s180 * s.fee180;
    }
  }
  const min = Math.max(0, s.minAttendance ?? 6);
  return {
    fees,
    rounds180,
    club,
    tournament,
    total: fees + rounds180 + club + tournament,
    attended,
    startedDays,
    minAttendance: min,
    eligible: attended >= min,
    missing: Math.max(0, min - attended),
    days,
  };
}
