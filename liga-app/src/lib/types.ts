export const MATCHDAY_COUNT = 12;

export interface Player {
  id: string;
  name: string;
  createdAt: string;
}

export interface Settings {
  /** Anzeige-Name der Saison, z. B. "2026" */
  seasonName: string;
  /** Ligaspiele: First to N Legs */
  leagueLegs: number;
  /** K.O.-Spiele: First to N Legs */
  koLegs: number;
  /** Liga-Kasse: Betrag pro anwesendem Spieler und Spieltag (€) */
  dayFee: number;
  /** Liga-Kasse: pro geworfener 180 zahlt jeder Anwesende diesen Betrag (€) */
  fee180: number;
  /** zahlt der Werfer der 180 selbst mit? */
  throwerPays180: boolean;
}

export interface LeagueMatch {
  id: string;
  a: string;
  b: string;
  legsA: number | null;
  legsB: number | null;
  playedAt: string | null;
  /** Runde im Round-Robin-Plan (0-basiert) */
  round: number;
}

export interface KoResult {
  p1: string;
  p2: string;
  s1: number;
  s2: number;
  playedAt: string;
}

export interface SpecialEntry {
  s180: number;
  /** Anzahl High-Finishes (100+) */
  hf: number;
  /** Höchstes Finish des Abends (0 = keins) */
  bestFinish: number;
}

export interface Matchday {
  number: number;
  /** gestartet = Anwesenheit wird erfasst, Startgeld läuft in die Kasse */
  started: boolean;
  date: string | null;
  attendees: string[];
  matches: LeagueMatch[];
  /** Manuell vergebener Tagessieg (Stechen) */
  winnerOverride: string | null;
  /** K.O.-Ergebnisse, Schlüssel = Match-ID (z. B. "U-R0-M1") */
  koResults: Record<string, KoResult>;
  specials: Record<string, SpecialEntry>;
}

/* ----------------------------- Turnier ----------------------------- */

export interface TPlayer {
  id: string;
  name: string;
  /** Teilnahmegebühr bezahlt */
  paid: boolean;
  /** Verknüpfung zum Liga-Spieler (optional) */
  leagueId: string | null;
  /** geworfene 180er im Turnier (jede erhöht den Pot) */
  s180: number;
}

export type GroupKey = 'A' | 'B';

export interface TGroupMatch {
  id: string;
  group: GroupKey;
  a: string;
  b: string;
  legsA: number | null;
  legsB: number | null;
  playedAt: string | null;
}

export interface TResult {
  p1: string;
  p2: string;
  s1: number;
  s2: number;
  playedAt: string;
}

export interface Tournament {
  name: string;
  date: string;
  /** Teilnahmegebühr in Euro */
  fee: number;
  /** Anzeige, z. B. "301 Single Out" */
  mode: string;
  /** First to N (2 = Best of 3) */
  groupLegs: number;
  koLegs: number;
  /** Reset-Finale, wenn der Spieler aus dem Losers Bracket das erste Finale gewinnt */
  resetFinal: boolean;
  participants: TPlayer[];
  groups: Record<GroupKey, string[]> | null;
  /** bereits in optimierter Board-Reihenfolge */
  groupMatches: TGroupMatch[];
  koResults: Record<string, TResult>;
  /** gesetzt, sobald der Sieger in die Hall of Fame übernommen wurde */
  hofEntryId: string | null;
}

export interface HallOfFameEntry {
  id: string;
  year: string;
  date: string | null;
  name: string;
  /** gewonnener Pot in Euro */
  pot: number;
  tournament: string;
  placeholder?: boolean;
}

export const defaultTournament = (): Tournament => ({
  name: 'Steeldart-Turnier',
  date: new Date().toISOString().slice(0, 10),
  fee: 10,
  mode: '301 Single Out',
  groupLegs: 2,
  koLegs: 2,
  resetFinal: true,
  participants: [],
  groups: null,
  groupMatches: [],
  koResults: {},
  hofEntryId: null,
});

export const defaultHallOfFame = (): HallOfFameEntry[] => [
  {
    id: 'placeholder-2025',
    year: '2025',
    date: '2025-12-13',
    name: 'Max Mustermann',
    pot: 100,
    tournament: 'Steeldart-Turnier 2025',
    placeholder: true,
  },
];

export interface LeagueState {
  version: 1;
  settings: Settings;
  players: Player[];
  seasonStarted: boolean;
  matchdays: Matchday[];
  tournament: Tournament;
  hallOfFame: HallOfFameEntry[];
  updatedAt: number;
}

export const emptyState = (): LeagueState => ({
  version: 1,
  settings: { seasonName: '2026', leagueLegs: 5, koLegs: 5, dayFee: 15, fee180: 5, throwerPays180: true },
  players: [],
  seasonStarted: false,
  matchdays: [],
  tournament: defaultTournament(),
  hallOfFame: defaultHallOfFame(),
  updatedAt: 0,
});

export const uid = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)
  ).slice(0, 12);

/** Fehlende Felder älterer/fremder Stände auffüllen */
export function normalizeState(raw: unknown): LeagueState {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<LeagueState>;
  return {
    ...base,
    ...s,
    version: 1,
    settings: { ...base.settings, ...(s.settings ?? {}) },
    players: Array.isArray(s.players) ? s.players : [],
    matchdays: Array.isArray(s.matchdays)
      ? s.matchdays.map((d) => ({
          number: d.number,
          // ältere Stände: Spieltage mit Ergebnissen gelten als gestartet
          started: d.started ?? (d.matches ?? []).some((m) => m.legsA !== null && m.legsB !== null),
          date: d.date ?? null,
          attendees: d.attendees ?? [],
          matches: d.matches ?? [],
          winnerOverride: d.winnerOverride ?? null,
          koResults: d.koResults ?? {},
          specials: d.specials ?? {},
        }))
      : [],
    tournament: (() => {
      const t = { ...defaultTournament(), ...(s.tournament ?? {}) };
      t.participants = (t.participants ?? []).map((p) => ({ ...p, s180: p.s180 ?? 0, leagueId: p.leagueId ?? null }));
      return t;
    })(),
    hallOfFame: Array.isArray(s.hallOfFame) ? s.hallOfFame : defaultHallOfFame(),
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
  };
}
