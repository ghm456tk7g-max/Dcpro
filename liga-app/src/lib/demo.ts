import { buildMatches, createSeason, pruneKoResults, computeKo } from './logic';
import { boardQueue, computeDE, createGroupPhase } from './tournament';
import { LeagueState, Player, emptyState, uid } from './types';

/** Kleiner deterministischer Zufallsgenerator, damit die Demo immer gleich aussieht */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const NAMES = ['Max', 'Lena', 'Deniz', 'Jonas', 'Sarah', 'Tobi', 'Mia', 'Kalle'];
/** grobe Spielstärke für realistischere Ergebnisse */
const SKILL = [0.68, 0.62, 0.58, 0.52, 0.5, 0.45, 0.4, 0.33];

export function buildDemoState(): LeagueState {
  const rand = rng(1800);
  const state = emptyState();
  state.settings = { ...state.settings, seasonName: '2026', leagueLegs: 5, koLegs: 5 };
  const players: Player[] = NAMES.map((name) => ({ id: uid(), name, createdAt: new Date().toISOString() }));
  state.players = players;
  state.seasonStarted = true;
  state.matchdays = createSeason(players);
  const skill = new Map(players.map((p, i) => [p.id, SKILL[i]]));

  const play = (a: string, b: string, firstTo: number): [number, number] => {
    const pa = skill.get(a)! / (skill.get(a)! + skill.get(b)!);
    let la = 0;
    let lb = 0;
    while (la < firstTo && lb < firstTo) {
      if (rand() < pa) la++;
      else lb++;
    }
    return [la, lb];
  };

  const dates = ['2026-11-06', '2026-11-20'];
  dates.forEach((date, di) => {
    const day = state.matchdays[di];
    day.date = date;
    // Spieltag 2: Kalle fehlt -> Spielplan nur für 7 Spieler
    day.started = true;
    day.attendees = players.map((p) => p.id).filter((id) => di === 0 || id !== players[7].id);
    day.matches = buildMatches(day.attendees, []);
    let t = new Date(`${date}T19:30:00`).getTime();
    for (const m of day.matches) {
      const [la, lb] = play(m.a, m.b, 5);
      m.legsA = la;
      m.legsB = lb;
      m.playedAt = new Date(t).toISOString();
      t += 12 * 60 * 1000;
    }
    for (const id of day.attendees) {
      const s180 = Math.floor(rand() * 3.2 * skill.get(id)!);
      const hf = Math.floor(rand() * 2.6 * skill.get(id)!);
      day.specials[id] = { s180, hf, bestFinish: hf ? 100 + Math.floor(rand() * 61) : 0 };
    }
    // K.O.-Phase: Spieltag 1 komplett, Spieltag 2 bis zum Halbfinale
    for (let pass = 0; pass < 4; pass++) {
      const ko = computeKo(day, state.players);
      for (const b of [ko.upper, ko.lower]) {
        b.rounds.forEach((round, ri) => {
          if (di === 1 && ri === b.rounds.length - 1) return;
          for (const m of round) {
            if (!m.p1 || !m.p2 || m.bye || day.koResults[m.id]) continue;
            const [s1, s2] = play(m.p1, m.p2, 5);
            day.koResults[m.id] = { p1: m.p1, p2: m.p2, s1, s2, playedAt: new Date(t).toISOString() };
            t += 15 * 60 * 1000;
          }
        });
      }
    }
    pruneKoResults(day, state.players);
  });
  // Turnier: 8 Liga-Spieler + 2 Gäste, Gruppenphase gespielt, K.O.-Baum zur Hälfte
  const t = state.tournament;
  t.name = 'Winter-Cup 2026';
  const today = new Date();
  t.date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  t.participants = [
    ...players.map((p, i) => ({ id: uid(), name: p.name, paid: i !== 3 && i !== 6, leagueId: p.id, s180: i === 0 ? 2 : i === 2 ? 1 : 0 })),
    { id: uid(), name: 'Gast Ömer', paid: true, leagueId: null, s180: 1 },
    { id: uid(), name: 'Gast Jule', paid: false, leagueId: null, s180: 0 },
  ];
  const tSkill = new Map(t.participants.map((p, i) => [p.id, SKILL[i] ?? 0.5]));
  const tPlay = (a: string, b: string, firstTo: number): [number, number] => {
    const pa = tSkill.get(a)! / (tSkill.get(a)! + tSkill.get(b)!);
    let la = 0;
    let lb = 0;
    while (la < firstTo && lb < firstTo) {
      if (rand() < pa) la++;
      else lb++;
    }
    return [la, lb];
  };
  const { groups, groupMatches } = createGroupPhase(
    t.participants.map((p) => p.id),
    rand,
  );
  t.groups = groups;
  t.groupMatches = groupMatches;
  // Spielzeiten in der Vergangenheit (vor ca. 5 Stunden gestartet), damit neue Einträge danach kommen
  let tt = Date.now() - 5 * 60 * 60 * 1000;
  for (const m of t.groupMatches) {
    [m.legsA, m.legsB] = tPlay(m.a, m.b, t.groupLegs);
    m.playedAt = new Date(tt).toISOString();
    tt += 8 * 60 * 1000;
  }
  for (let k = 0; k < 7; k++) {
    const q = boardQueue(t, computeDE(t))[0];
    if (!q) break;
    const [s1, s2] = tPlay(q.a, q.b, t.koLegs);
    t.koResults[q.id] = { p1: q.a, p2: q.b, s1, s2, playedAt: new Date(tt).toISOString() };
    tt += 10 * 60 * 1000;
  }

  state.updatedAt = Date.now();
  return state;
}
