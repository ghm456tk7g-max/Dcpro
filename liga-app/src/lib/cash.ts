import { LeagueState, Matchday, Settings } from './types';
import { tAmountPer180, tPayersPer180 } from './tournament';

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
  total: number;
}

export function dayCash(d: Matchday, s: Settings): DayCash {
  if (!d.started) return { attendees: 0, fees: 0, count180: 0, per180: 0, bonus: 0, total: 0 };
  const fees = d.attendees.length * s.dayFee;
  const count180 = day180s(d);
  const per180 = payersPer180(d, s) * s.fee180;
  const bonus = count180 * per180;
  return { attendees: d.attendees.length, fees, count180, per180, bonus, total: fees + bonus };
}

/** Liga-Kasse über alle gestarteten Spieltage der Saison */
export function seasonCash(state: LeagueState) {
  return state.matchdays.reduce(
    (acc, d) => {
      const c = dayCash(d, state.settings);
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
    const c = dayCash(d, s);
    const lines: LedgerLine[] = [
      { key: `${d.number}-fee`, kind: 'fee', label: 'Startgeld', detail: `${c.attendees} Anwesende × ${eur(s.dayFee)}`, amount: c.fees },
    ];
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
