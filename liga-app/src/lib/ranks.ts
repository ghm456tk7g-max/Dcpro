export interface RankDef {
  index: number;
  name: string;
  min: number;
  max: number | null;
  /** Verlauf des Wappens: hell -> dunkel */
  from: string;
  to: string;
  rim: string;
}

export const RANKS: RankDef[] = [
  { index: 0, name: 'Kneipen-Rookie', min: 0, max: 5, from: '#e08a4a', to: '#6b3410', rim: '#f3b27a' },
  { index: 1, name: 'Single-Shooter', min: 6, max: 12, from: '#c9d1dc', to: '#4a5463', rim: '#e5e9ef' },
  { index: 2, name: 'Double-Hunter', min: 13, max: 20, from: '#34d399', to: '#065f46', rim: '#6ee7b7' },
  { index: 3, name: 'Treble-Striker', min: 21, max: 30, from: '#60a5fa', to: '#1e3a8a', rim: '#93c5fd' },
  { index: 4, name: 'Checkout-Artist', min: 31, max: 42, from: '#c084fc', to: '#4c1d95', rim: '#d8b4fe' },
  { index: 5, name: 'Dart-Legende', min: 43, max: null, from: '#fde68a', to: '#b45309', rim: '#fff3c4' },
];

export function rankFor(points: number): RankDef {
  return [...RANKS].reverse().find((r) => points >= r.min) ?? RANKS[0];
}

export function rankProgress(points: number) {
  const rank = rankFor(points);
  const next = RANKS[rank.index + 1] ?? null;
  if (!next) return { rank, next, pct: 100, missing: 0 };
  const span = next.min - rank.min;
  return {
    rank,
    next,
    pct: Math.max(4, Math.round(((points - rank.min) / span) * 100)),
    missing: next.min - points,
  };
}

export const rangeLabel = (r: RankDef) => (r.max === null ? `ab ${r.min} Pkt.` : `${r.min}–${r.max} Pkt.`);
