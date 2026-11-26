import { LeagueState, Matchday, Settings } from './types';

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
