import { useState } from 'react';
import { Target } from 'lucide-react';
import { MATCHDAY_COUNT } from '../lib/types';

const f1 = (v: number) => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Average-Kennzahlen + Verlauf über die 12 Spieltage (eine Reihe, daher ohne Legende) */
export default function AvgCard({ points, mean, best, last }: { points: (number | null)[]; mean: number | null; best: number | null; last: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = points.filter((v): v is number => v !== null);
  const W = 600;
  const H = 170;
  const pad = { l: 34, r: 12, t: 16, b: 24 };
  const lo = vals.length ? Math.floor((Math.min(...vals) - 3) / 5) * 5 : 30;
  const hi = vals.length ? Math.ceil((Math.max(...vals) + 3) / 5) * 5 : 60;
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (MATCHDAY_COUNT - 1);
  const y = (v: number) => pad.t + ((hi - v) * (H - pad.t - pad.b)) / Math.max(1, hi - lo);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  // Linie nur zwischen eingetragenen Werten (Lücken bleiben sichtbar)
  const segs: string[] = [];
  let cur = '';
  points.forEach((v, i) => {
    if (v === null) {
      if (cur) segs.push(cur);
      cur = '';
    } else cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segs.push(cur);

  const tiles = [
    { label: 'Ø Saison', value: mean },
    { label: 'Bester Abend', value: best },
    { label: 'Zuletzt', value: last },
  ];

  return (
    <div className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">
        <Target size={16} className="text-accent" /> 3-Dart-Average
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-line bg-panel2 px-3 py-2.5">
            <div className="font-display text-2xl font-extrabold tabular-nums">{t.value !== null ? f1(t.value) : '–'}</div>
            <div className="text-xs text-muted">{t.label}</div>
          </div>
        ))}
      </div>
      {vals.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Noch kein Average eingetragen. Der Admin trägt ihn nach dem Abend im Reiter „Specials“ ein (aus Scolia abgelesen).</p>
      ) : (
        <div className="relative mt-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Average-Verlauf über die Spieltage" onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,.07)" strokeWidth="1" />
                <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#8b93a1">
                  {t}
                </text>
              </g>
            ))}
            {points.map((_, i) => (
              <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill={hover === i ? '#fff' : '#8b93a1'}>
                {i + 1}
              </text>
            ))}
            {hover !== null && points[hover] !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgba(255,255,255,.25)" strokeWidth="1" />}
            {segs.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {points.map((v, i) =>
              v === null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 6 : 4.5} fill="#10b981" stroke="#181c23" strokeWidth="2" />
              ),
            )}
            {/* große, unsichtbare Trefferflächen pro Spieltag */}
            {points.map((_, i) => (
              <rect key={i} x={x(i) - 22} y={0} width={44} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
            ))}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute -top-1 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-xs shadow-xl"
              style={{ left: `${(x(hover) / W) * 100}%`, transform: 'translate(-50%, -100%)' }}
            >
              <div className="text-muted">Spieltag {hover + 1}</div>
              <div className="font-semibold text-white">{points[hover] !== null ? `Ø ${f1(points[hover]!)}` : 'kein Wert'}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
