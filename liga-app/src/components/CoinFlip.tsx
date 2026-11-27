import { useState } from 'react';
import { Coins } from 'lucide-react';
import { euro } from '../lib/tournament';
import { Btn } from './ui';

/** Fairer Münzwurf mit kryptografischem Zufall */
const fairFlip = (): 'double' | 'nothing' => {
  const a = new Uint8Array(1);
  crypto.getRandomValues(a);
  return a[0] < 128 ? 'double' : 'nothing';
};

/**
 * Doppelt-oder-nichts: Die Münze dreht sich ~2 Sekunden und landet auf ×2 (Vorderseite) oder 0 (Rückseite).
 * Das Ergebnis wird erst nach der Animation gespeichert.
 */
export default function CoinFlip({
  name,
  amount,
  done,
  canFlip,
  onResult,
}: {
  name: string;
  amount: number;
  done: 'double' | 'nothing' | null;
  canFlip: boolean;
  onResult(r: 'double' | 'nothing'): void;
}) {
  const [spinning, setSpinning] = useState(false);
  const [angle, setAngle] = useState(done === 'nothing' ? 180 : 0);
  const [local, setLocal] = useState<'double' | 'nothing' | null>(done);
  const result = done ?? local;

  const flip = () => {
    if (spinning || result) return;
    const r = fairFlip();
    setSpinning(true);
    setAngle(360 * 6 + (r === 'nothing' ? 180 : 0));
    setTimeout(() => {
      setSpinning(false);
      setLocal(r);
      onResult(r);
    }, 2300);
  };

  const face = 'absolute inset-0 flex flex-col items-center justify-center rounded-full border-4 [backface-visibility:hidden]';
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="[perspective:900px]">
        <div
          className="relative h-36 w-36 [transform-style:preserve-3d]"
          style={{ transform: `rotateY(${angle}deg)`, transition: spinning ? 'transform 2.2s cubic-bezier(.15,.75,.25,1)' : 'none' }}
        >
          <div className={`${face} border-gold bg-gradient-to-br from-[#ffe08a] via-gold to-gold-dark text-bg shadow-gold`}>
            <span className="font-display text-5xl font-extrabold">×2</span>
            <span className="text-[10px] font-bold uppercase tracking-widest">Doppelt</span>
          </div>
          <div className={`${face} border-zinc-400 bg-gradient-to-br from-zinc-200 via-zinc-400 to-zinc-600 text-bg [transform:rotateY(180deg)]`}>
            <span className="font-display text-5xl font-extrabold">0</span>
            <span className="text-[10px] font-bold uppercase tracking-widest">Nichts</span>
          </div>
        </div>
      </div>
      {result ? (
        result === 'double' ? (
          <div>
            <div className="font-display text-2xl font-extrabold text-gold">Verdoppelt! 🎉</div>
            <div className="text-sm text-muted">
              {name} bekommt <b className="text-white">{euro(amount * 2)}</b> statt {euro(amount)}.
            </div>
          </div>
        ) : (
          <div>
            <div className="font-display text-2xl font-extrabold text-red-300">Alles weg! 😬</div>
            <div className="text-sm text-muted">
              Die {euro(amount)} von {name} wandern in den Pot.
            </div>
          </div>
        )
      ) : canFlip ? (
        <Btn variant="gold" onClick={flip} disabled={spinning} className="px-6 py-3 text-base">
          <Coins size={18} /> {spinning ? 'Die Münze fliegt …' : `Münze werfen – ${euro(amount)} riskieren`}
        </Btn>
      ) : (
        <p className="text-sm text-muted">Der Münzwurf wird vom Admin am Ende des Abends gestartet.</p>
      )}
    </div>
  );
}
