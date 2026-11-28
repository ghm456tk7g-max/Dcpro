import { useMemo, useState } from 'react';
import { Target } from 'lucide-react';
import { euro } from '../lib/tournament';
import { Btn } from './ui';

/** 50:50 mit kryptografischem Zufall – identisch zur Münze */
const fair = (): 'double' | 'nothing' => {
  const a = new Uint8Array(1);
  crypto.getRandomValues(a);
  return a[0] < 128 ? 'double' : 'nothing';
};

const NUMBERS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const SIZE = 280;
const C = SIZE / 2;
const R = { bull: 4.5, outerBull: 10, trebleIn: 55, trebleOut: 61, doubleIn: 91, doubleOut: 100, numbers: 112, miss: 124 };

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (r: number, deg: number) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];

/** Ringsegment als SVG-Pfad */
function arc(r1: number, r2: number, a1: number, a2: number) {
  const [x1, y1] = pt(r2, a1);
  const [x2, y2] = pt(r2, a2);
  const [x3, y3] = pt(r1, a2);
  const [x4, y4] = pt(r1, a1);
  return `M${x1},${y1} A${r2},${r2} 0 0 1 ${x2},${y2} L${x3},${y3} A${r1},${r1} 0 0 0 ${x4},${y4} Z`;
}

function Board() {
  const segs = NUMBERS.map((n, i) => {
    const a1 = i * 18 - 9;
    const a2 = a1 + 18;
    const dark = i % 2 === 0;
    const single = dark ? '#1d1f22' : '#efe3c4';
    const ring = dark ? '#d8323f' : '#159947';
    return (
      <g key={n}>
        <path d={arc(R.outerBull, R.trebleIn, a1, a2)} fill={single} />
        <path d={arc(R.trebleIn, R.trebleOut, a1, a2)} fill={ring} />
        <path d={arc(R.trebleOut, R.doubleIn, a1, a2)} fill={single} />
        <path d={arc(R.doubleIn, R.doubleOut, a1, a2)} fill={ring} />
        <text x={pt(R.numbers, a1 + 9)[0]} y={pt(R.numbers, a1 + 9)[1] + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#e8eaed">
          {n}
        </text>
      </g>
    );
  });
  return (
    <>
      <circle cx={C} cy={C} r={R.numbers + 10} fill="#0b0d10" stroke="#2a2f37" strokeWidth="2" />
      {segs}
      {/* Drähte */}
      {NUMBERS.map((_, i) => {
        const [x1, y1] = pt(R.outerBull, i * 18 - 9);
        const [x2, y2] = pt(R.doubleOut, i * 18 - 9);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9aa0a6" strokeWidth=".6" opacity=".7" />;
      })}
      {[R.trebleIn, R.trebleOut, R.doubleIn, R.doubleOut].map((r) => (
        <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="#9aa0a6" strokeWidth=".6" opacity=".7" />
      ))}
      <circle cx={C} cy={C} r={R.outerBull} fill="#159947" stroke="#9aa0a6" strokeWidth=".6" />
      <circle cx={C} cy={C} r={R.bull} fill="#d8323f" />
    </>
  );
}

/** Pfeil, Spitze bei (0,0), Körper nach rechts unten (kommt vom Werfer) */
function DartSvg() {
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" style={{ overflow: 'visible', filter: 'drop-shadow(3px 5px 4px rgba(0,0,0,.65))' }}>
      <g transform="rotate(-45)">
        {/* Spitze: lang und silbern */}
        <path d="M0 0 L-1.2 14 L1.2 14 Z" fill="#f3f4f6" />
        {/* Barrel: dunkles Metall mit Rillen */}
        <rect x="-3.6" y="14" width="7.2" height="24" rx="2.5" fill="#4b5563" />
        {[17, 21, 25, 29, 33].map((y) => (
          <rect key={y} x="-3.6" y={y} width="7.2" height="1.6" fill="#9ca3af" />
        ))}
        {/* Schaft */}
        <rect x="-1.3" y="38" width="2.6" height="18" fill="#e5e7eb" />
        {/* Flight: breites Leitwerk am Ende */}
        <path d="M0 54 L-14 72 L-14 82 L0 74 L14 82 L14 72 Z" fill="#10b981" stroke="#064e3b" strokeWidth="1" />
      </g>
    </svg>
  );
}

/**
 * „Doppel oder Draußen“: gleiche 50:50-Regel wie die Münze, im Dart-Look.
 * Pfeil im Doppelring = doppelt, Pfeil neben der Scheibe = nichts.
 */
export default function DartFlip({
  name,
  amount,
  stake,
  done,
  canFlip,
  onResult,
}: {
  name: string;
  amount: number;
  stake: number;
  done: 'double' | 'nothing' | null;
  canFlip: boolean;
  onResult(r: 'double' | 'nothing'): void;
}) {
  const full = stake >= amount - 0.005;
  const [phase, setPhase] = useState<'idle' | 'spin' | 'landed'>(done ? 'landed' : 'idle');
  const [result, setResult] = useState<'double' | 'nothing' | null>(done);
  const [spin, setSpin] = useState(0);
  // Landepunkt: zufälliger Winkel; Doppelring-Mitte oder außerhalb der Scheibe
  const target = useMemo(() => {
    const deg = Math.floor(Math.random() * 360);
    const r = (result ?? done) === 'nothing' ? R.miss : (R.doubleIn + R.doubleOut) / 2;
    const [x, y] = pt(r, deg);
    return { x, y };
  }, [result, done]);

  const go = () => {
    if (phase !== 'idle') return;
    const r = fair();
    setResult(r);
    setSpin(720 + Math.floor(Math.random() * 360));
    setPhase('spin');
    setTimeout(() => {
      setPhase('landed');
      onResult(r);
    }, 2600);
  };

  const shown = phase === 'landed' ? result ?? done : null;

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          width={SIZE}
          height={SIZE}
          style={{ transform: `rotate(${spin}deg)`, transition: phase === 'spin' ? 'transform 2s cubic-bezier(.2,.8,.25,1)' : 'none' }}
          aria-label="Dartscheibe"
        >
          <Board />
        </svg>
        {/* Pfeil: fliegt im letzten Drittel von rechts unten heran */}
        {phase !== 'idle' && (
          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{
              transform: `translate(${target.x}px, ${target.y}px)`,
            }}
          >
            <div
              style={{
                transformOrigin: '0 0',
                animation: 'dartIn .55s cubic-bezier(.3,.7,.4,1) 1.95s both',
              }}
            >
              <DartSvg />
            </div>
          </div>
        )}
        {shown && (
          <div
            className="pointer-events-none absolute rounded-full"
            style={{
              left: target.x - 16,
              top: target.y - 16,
              width: 32,
              height: 32,
              border: `3px solid ${shown === 'double' ? '#f5c451' : '#f87171'}`,
              animation: 'hitRing .9s ease-out both',
            }}
          />
        )}
        <style>{`
          @keyframes dartIn { from { transform: translate(170px, 170px) scale(2.4); opacity: 0 } 55% { opacity: 1 } to { transform: none; opacity: 1 } }
          @keyframes hitRing { from { transform: scale(.3); opacity: 1 } to { transform: scale(2.4); opacity: 0 } }
        `}</style>
      </div>

      {shown ? (
        shown === 'double' ? (
          <div>
            <div className="font-display text-2xl font-extrabold text-gold">Doppel getroffen! 🎯</div>
            <div className="text-sm text-muted">
              {name} bekommt <b className="text-white">{euro(amount + stake)}</b> statt {euro(amount)}.
            </div>
          </div>
        ) : (
          <div>
            <div className="font-display text-2xl font-extrabold text-red-300">Draußen! 😬</div>
            <div className="text-sm text-muted">
              {full ? `Die ${euro(amount)} von ${name} wandern in den Pot.` : `${name} bekommt noch ${euro(amount - stake)}, ${euro(stake)} wandern in den Pot.`}
            </div>
          </div>
        )
      ) : canFlip ? (
        <Btn variant="gold" onClick={go} disabled={phase !== 'idle'} className="px-6 py-3 text-base">
          <Target size={18} /> {phase === 'spin' ? 'Der Pfeil fliegt …' : `Pfeil werfen – ${euro(stake)} riskieren`}
        </Btn>
      ) : (
        <p className="text-sm text-muted">Der Wurf wird vom Admin am Ende des Abends gestartet.</p>
      )}
      <p className="text-[11px] text-muted">
        Doppelring = {full ? 'doppelt' : `+${euro(stake)}`} · daneben = {full ? 'nichts' : `−${euro(stake)}`} · Chance 50:50
      </p>
    </div>
  );
}
