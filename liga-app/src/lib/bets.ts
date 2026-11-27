import { computeDay, computeKo, isDayComplete } from './logic';
import { buildOddsModel, matchOdds } from './stats';
import { Bet, LeagueState, Matchday } from './types';

/* ================================================================== */
/* Wettkatalog                                                          */
/* ================================================================== */

export type MarketKind = 'player' | 'yesno';

export interface MarketDef {
  id: string;
  title: string;
  /** kurze Erklärung für den Wettschein */
  hint: string;
  emoji: string;
  kind: MarketKind;
  /** Daten kommen automatisch (true) oder per Zähler/Schalter im Wettbüro (false) */
  auto: boolean;
  /** Topf läuft weiter, wenn niemand richtig liegt */
  jackpot?: boolean;
}

export const MARKETS: MarketDef[] = [
  { id: 'dayWinner', title: 'Tagessieger', hint: 'Wer gewinnt den Abend?', emoji: '🏆', kind: 'player', auto: true },
  { id: 'highFinish', title: 'Höchstes Finish', hint: 'Wer checkt am höchsten aus?', emoji: '🎯', kind: 'player', auto: true },
  { id: 'hf100', title: 'Finish über 100?', hint: 'Gibt es heute ein Finish über 100?', emoji: '💯', kind: 'yesno', auto: true },
  { id: 'most180', title: 'Meiste 180er', hint: 'Wer wirft die meisten 180er?', emoji: '🔥', kind: 'player', auto: true },
  { id: 'over180', title: 'Mehr als 2,5 180er?', hint: 'Fallen heute 3 oder mehr 180er?', emoji: '🔢', kind: 'yesno', auto: true },
  { id: 'bestAvg', title: 'Bester Average', hint: 'Wer spielt den besten Average?', emoji: '📈', kind: 'player', auto: true },
  { id: 'redLantern', title: 'Rote Laterne', hint: 'Wer wird Letzter der Tagestabelle?', emoji: '🏮', kind: 'player', auto: true },
  { id: 'most20', title: 'Meiste 2:0-Siege', hint: 'Wer gewinnt am häufigsten zu null?', emoji: '🧹', kind: 'player', auto: true },
  { id: 'upset', title: 'Überraschung des Abends', hint: 'Gewinnt ein Außenseiter (Quote über 3,00) mindestens eine Partie?', emoji: '😱', kind: 'yesno', auto: true },
  { id: 'koUpper', title: 'Sieger Gewinner-Bracket', hint: 'Wer gewinnt die obere K.O.-Runde?', emoji: '🥇', kind: 'player', auto: true },
  { id: 'koLower', title: 'Sieger Loser-Bracket', hint: 'Wer gewinnt die untere K.O.-Runde?', emoji: '🥈', kind: 'player', auto: true },
  { id: 'most26', title: 'Meiste 26er', hint: 'Bed & Breakfast: wer wirft die meisten 26er?', emoji: '🛏️', kind: 'player', auto: false },
  { id: 'mostBusts', title: 'Meiste Busts', hint: 'Wer überwirft sich am häufigsten?', emoji: '💥', kind: 'player', auto: false },
  { id: 'bullFinish', title: 'Bull-Finish?', hint: 'Checkt heute jemand über das Bull aus?', emoji: '🐂', kind: 'yesno', auto: false },
  { id: 'madhouse', title: 'Madhouse?', hint: 'Muss heute jemand auf Doppel 1 auschecken?', emoji: '🏚️', kind: 'yesno', auto: false },
  { id: 'first180', title: 'Erste 180 des Abends', hint: 'Wer wirft die erste 180?', emoji: '⚡', kind: 'player', auto: false },
  { id: 'nineDarter', title: 'Jackpot: 9-Darter', hint: 'Setze auf „Ja“: Fällt heute ein 9-Darter? Sonst wandert der Topf weiter, bis es passiert.', emoji: '💎', kind: 'yesno', auto: false, jackpot: true },
];

export const marketById = (id: string) => MARKETS.find((m) => m.id === id);

export const dayMarkets = (state: LeagueState, d: Matchday) =>
  (d.betMarkets ?? state.settings.defaultMarkets ?? []).filter((id) => marketById(id));

/**
 * Wettannahme offen?
 * betsClosed: true = vom Admin geschlossen, false = vom Admin ausdrücklich geöffnet,
 * undefined = automatisch: offen bis das erste Ligaspiel eingetragen ist.
 */
export const betsOpen = (d: Matchday) =>
  d.started && (d.betsClosed === undefined ? !d.matches.some((m) => m.legsA !== null && m.legsB !== null) : !d.betsClosed);

/* ================================================================== */
/* Auswertung                                                           */
/* ================================================================== */

export interface Resolution {
  decided: boolean;
  /** Gewinner-Tipps: Spieler-IDs oder 'yes' / 'no' */
  winners: string[];
}

const maxBy = (ids: string[], val: (id: string) => number) => {
  const best = Math.max(0, ...ids.map(val));
  return best > 0 ? ids.filter((id) => val(id) === best) : [];
};

export function resolveMarket(state: LeagueState, d: Matchday, marketId: string): Resolution {
  const complete = isDayComplete(d);
  const ids = d.attendees;
  const sp = (id: string) => d.specials[id];
  const yn = (v: boolean) => [v ? 'yes' : 'no'];
  switch (marketId) {
    case 'dayWinner': {
      const r = computeDay(d, state.players);
      return { decided: !!r.winnerId, winners: r.winnerId ? [r.winnerId] : [] };
    }
    case 'highFinish':
      return { decided: complete, winners: maxBy(ids, (id) => sp(id)?.bestFinish ?? 0) };
    case 'hf100':
      return { decided: complete, winners: yn(ids.some((id) => (sp(id)?.bestFinish ?? 0) > 100)) };
    case 'most180':
      return { decided: complete, winners: maxBy(ids, (id) => sp(id)?.s180 ?? 0) };
    case 'over180':
      return { decided: complete, winners: yn(ids.reduce((s, id) => s + (sp(id)?.s180 ?? 0), 0) >= 3) };
    case 'bestAvg':
      return { decided: complete, winners: maxBy(ids, (id) => sp(id)?.avg ?? 0) };
    case 'redLantern': {
      const r = computeDay(d, state.players);
      const last = r.rows[r.rows.length - 1];
      return { decided: complete, winners: complete && last ? [last.playerId] : [] };
    }
    case 'most20': {
      const n = new Map<string, number>();
      for (const m of d.matches) {
        if (m.legsA === null || m.legsB === null) continue;
        if (m.legsB === 0 && m.legsA > 0) n.set(m.a, (n.get(m.a) ?? 0) + 1);
        if (m.legsA === 0 && m.legsB > 0) n.set(m.b, (n.get(m.b) ?? 0) + 1);
      }
      return { decided: complete, winners: maxBy(ids, (id) => n.get(id) ?? 0) };
    }
    case 'upset': {
      if (!complete) return { decided: false, winners: [] };
      // Quoten so, wie sie VOR diesem Spieltag standen
      const before: LeagueState = {
        ...state,
        matchdays: state.matchdays.map((x) => (x.number >= d.number ? { ...x, matches: [], koResults: {}, specials: {} } : x)),
      };
      const model = buildOddsModel(before);
      const hit = d.matches.some((m) => {
        if (m.legsA === null || m.legsB === null) return false;
        const o = matchOdds(model, m.a, m.b);
        return m.legsA > m.legsB ? o.oddsA > 3 : o.oddsB > 3;
      });
      return { decided: true, winners: yn(hit) };
    }
    case 'koUpper':
    case 'koLower': {
      const ko = computeKo(d, state.players);
      const b = marketId === 'koUpper' ? ko.upper : ko.lower;
      return { decided: !!b.champion, winners: b.champion ? [b.champion] : [] };
    }
    case 'most26':
      return { decided: complete, winners: maxBy(ids, (id) => sp(id)?.s26 ?? 0) };
    case 'mostBusts':
      return { decided: complete, winners: maxBy(ids, (id) => sp(id)?.busts ?? 0) };
    case 'bullFinish':
      return { decided: complete, winners: yn(!!d.events?.bullFinish) };
    case 'madhouse':
      return { decided: complete, winners: yn(!!d.events?.madhouse) };
    case 'nineDarter':
      return { decided: complete, winners: yn(!!d.events?.nineDarter) };
    case 'first180': {
      const f = d.events?.first180 ?? null;
      return { decided: !!f || complete, winners: f ? [f] : [] };
    }
    default:
      return { decided: false, winners: [] };
  }
}

/* ================================================================== */
/* Töpfe & Abrechnung                                                   */
/* ================================================================== */

export interface MarketResult {
  def: MarketDef;
  pool: number;
  /** aus Vorwochen übernommener Jackpot */
  carryIn: number;
  resolution: Resolution;
  bets: Bet[];
  /** Auszahlung je Wette (inkl. Einsatz) */
  payouts: Map<string, number>;
  /** geht in den Pot (niemand richtig) */
  toPot: number;
  /** wandert zum nächsten Spieltag (Jackpot) */
  carryOut: number;
}

export interface DayBets {
  markets: MarketResult[];
  /** alle Wetten entschieden? */
  settled: boolean;
  staked: number;
  /** Einsatz und Auszahlung je Wetter */
  perBettor: Map<string, { staked: number; payout: number }>;
  /** Tippkönig: höchster Gewinn (Auszahlung − Einsatz) > 0 */
  king: { player: string; payout: number; net: number } | null;
  /** Auszahlung je Spieler nach Münzwurf */
  finalPayout: Map<string, number>;
  /** Wirkung auf den Pot (negativ = Geld ist im Wettbüro / wurde ausgezahlt) */
  potEffect: number;
  budget: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Jackpot-Topf, der bei Spieltag d ankommt (Summe ungewonnener Jackpot-Töpfe der Vorwochen) */
function jackpotCarry(state: LeagueState, upTo: number, marketId: string): number {
  let carry = 0;
  for (const d of state.matchdays) {
    if (d.number >= upTo) break;
    if (!d.started || !dayMarkets(state, d).includes(marketId)) continue;
    const pool = carry + (d.bets ?? []).filter((b) => b.market === marketId).reduce((s, b) => s + b.stake, 0);
    const res = resolveMarket(state, d, marketId);
    const won = res.decided && (d.bets ?? []).some((b) => b.market === marketId && res.winners.includes(b.pick));
    carry = res.decided && won ? 0 : pool;
  }
  return carry;
}

export function computeDayBets(state: LeagueState, d: Matchday): DayBets {
  const bets = d.bets ?? [];
  const markets: MarketResult[] = dayMarkets(state, d).map((id) => {
    const def = marketById(id)!;
    const mBets = bets.filter((b) => b.market === id);
    const carryIn = def.jackpot ? jackpotCarry(state, d.number, id) : 0;
    const pool = r2(carryIn + mBets.reduce((s, b) => s + b.stake, 0));
    const resolution = resolveMarket(state, d, id);
    const payouts = new Map<string, number>();
    let toPot = 0;
    let carryOut = 0;
    if (resolution.decided) {
      const winning = mBets.filter((b) => resolution.winners.includes(b.pick));
      const wStake = winning.reduce((s, b) => s + b.stake, 0);
      if (winning.length) winning.forEach((b) => payouts.set(b.id, r2((pool * b.stake) / wStake)));
      else if (def.jackpot) carryOut = pool;
      else toPot = pool;
    }
    return { def, pool, carryIn, resolution, bets: mBets, payouts, toPot, carryOut };
  });
  const settled = markets.length > 0 && markets.every((m) => m.resolution.decided);

  const perBettor = new Map<string, { staked: number; payout: number }>();
  for (const b of bets) {
    const e = perBettor.get(b.bettor) ?? { staked: 0, payout: 0 };
    e.staked += b.stake;
    perBettor.set(b.bettor, e);
  }
  for (const m of markets)
    for (const b of m.bets) {
      const p = m.payouts.get(b.id) ?? 0;
      if (p) perBettor.get(b.bettor)!.payout += p;
    }
  perBettor.forEach((e) => {
    e.staked = r2(e.staked);
    e.payout = r2(e.payout);
  });

  let king: DayBets['king'] = null;
  if (settled) {
    perBettor.forEach((e, player) => {
      const net = r2(e.payout - e.staked);
      if (net > 0 && (!king || net > king.net || (net === king.net && e.payout > king.payout))) king = { player, payout: e.payout, net };
    });
  }

  const finalPayout = new Map<string, number>();
  perBettor.forEach((e, p) => finalPayout.set(p, e.payout));
  let coinAdjust = 0;
  const cf = d.coinflip;
  if (cf && settled) {
    const base = finalPayout.get(cf.player) ?? 0;
    if (cf.result === 'double') {
      finalPayout.set(cf.player, r2(base * 2));
      coinAdjust = -base; // die Verdopplung bezahlt der Pot
    } else {
      finalPayout.set(cf.player, 0);
      coinAdjust = base; // Gewinn verfällt -> Pot
    }
  }

  const staked = r2(bets.reduce((s, b) => s + b.stake, 0));
  const toPot = markets.reduce((s, m) => s + m.toPot, 0);
  // Einsätze kommen aus dem Startgeld (stehen also nicht im Pot), Jackpot-Übertrag wird hier neu eingesetzt
  // und ist schon beim Vorwochen-Spieltag aus dem Pot herausgerechnet.
  const potEffect = r2(-staked + toPot + coinAdjust);
  return { markets, settled, staked, perBettor, king, finalPayout, potEffect, budget: state.settings.betBudget };
}

/** Freies Wettguthaben eines Spielers an diesem Spieltag */
export function remainingBudget(state: LeagueState, d: Matchday, bettor: string) {
  const used = (d.bets ?? []).filter((b) => b.bettor === bettor).reduce((s, b) => s + b.stake, 0);
  return r2(Math.max(0, state.settings.betBudget - used));
}

/** Darf diese Wette platziert werden? Gibt eine Fehlermeldung oder null zurück. */
export function validateBet(state: LeagueState, d: Matchday, bettor: string, marketId: string, pick: string, stake: number): string | null {
  const def = marketById(marketId);
  if (!def) return 'Unbekannte Wette';
  if (!betsOpen(d)) return 'Die Wettannahme ist geschlossen';
  if (!d.attendees.includes(bettor)) return 'Nur Anwesende können wetten';
  if (!(stake > 0)) return 'Einsatz fehlt';
  if (stake > remainingBudget(state, d, bettor) + 1e-9) return `Nicht genug Guthaben (frei: ${remainingBudget(state, d, bettor).toFixed(2).replace('.', ',')} €)`;
  if (def.kind === 'player') {
    if (!d.attendees.includes(pick)) return 'Bitte einen anwesenden Spieler wählen';
    if (pick === bettor) return 'Auf sich selbst wetten ist nicht erlaubt';
  } else if (pick !== 'yes' && pick !== 'no') return 'Bitte Ja oder Nein wählen';
  if (def.jackpot && pick !== 'yes') return 'Beim Jackpot kann man nur auf „Ja“ setzen';
  return null;
}

/** Saison-Bilanz im Wettbüro je Spieler (für Tippkönig-Rangliste) */
export function seasonBetStats(state: LeagueState) {
  const map = new Map<string, { staked: number; payout: number; kings: number }>();
  for (const d of state.matchdays) {
    if (!d.started || !(d.bets ?? []).length) continue;
    const db = computeDayBets(state, d);
    db.perBettor.forEach((e, p) => {
      const x = map.get(p) ?? { staked: 0, payout: 0, kings: 0 };
      x.staked += e.staked;
      x.payout += db.finalPayout.get(p) ?? 0;
      map.set(p, x);
    });
    if (db.king) map.get(db.king.player)!.kings++;
  }
  return [...map.entries()]
    .map(([player, x]) => ({ player, staked: r2(x.staked), payout: r2(x.payout), net: r2(x.payout - x.staked), kings: x.kings }))
    .sort((a, b) => b.net - a.net);
}
