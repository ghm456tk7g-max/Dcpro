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
  date: string | null;
  attendees: string[];
  matches: LeagueMatch[];
  /** Manuell vergebener Tagessieg (Stechen) */
  winnerOverride: string | null;
  /** K.O.-Ergebnisse, Schlüssel = Match-ID (z. B. "U-R0-M1") */
  koResults: Record<string, KoResult>;
  specials: Record<string, SpecialEntry>;
}

export interface LeagueState {
  version: 1;
  settings: Settings;
  players: Player[];
  seasonStarted: boolean;
  matchdays: Matchday[];
  updatedAt: number;
}

export const emptyState = (): LeagueState => ({
  version: 1,
  settings: { seasonName: '2026', leagueLegs: 5, koLegs: 5 },
  players: [],
  seasonStarted: false,
  matchdays: [],
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
          date: d.date ?? null,
          attendees: d.attendees ?? [],
          matches: d.matches ?? [],
          winnerOverride: d.winnerOverride ?? null,
          koResults: d.koResults ?? {},
          specials: d.specials ?? {},
        }))
      : [],
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
  };
}
