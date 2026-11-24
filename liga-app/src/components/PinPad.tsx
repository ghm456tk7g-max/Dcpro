import { useState } from 'react';
import { Delete, Lock } from 'lucide-react';
import { useLeague } from '../lib/league';

/** 4-stelliger PIN mit Ziffernblock (auch per Tastatur bedienbar) */
export default function PinPad({ onSuccess }: { onSuccess?(): void }) {
  const { login, toast } = useLeague();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const press = async (d: string) => {
    if (busy) return;
    setError(false);
    const next = (pin + d).slice(0, 4);
    setPin(next);
    if (next.length === 4) {
      setBusy(true);
      const ok = await login(next);
      setBusy(false);
      if (ok) {
        toast('Admin-Modus aktiv');
        onSuccess?.();
      } else {
        setError(true);
        setTimeout(() => setPin(''), 450);
      }
    }
  };

  return (
    <div
      className="mx-auto flex w-full max-w-xs flex-col items-center gap-5 outline-none"
      tabIndex={0}
      autoFocus
      onKeyDown={(e) => {
        if (/^[0-9]$/.test(e.key)) press(e.key);
        if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      }}
    >
      <div className="rounded-2xl bg-accent/10 p-3 text-accent">
        <Lock size={26} />
      </div>
      <div className="text-center">
        <div className="font-display text-xl font-bold">Admin-PIN eingeben</div>
        <div className="text-sm text-muted">Zum Eintragen von Ergebnissen & Verwalten</div>
      </div>
      <div className={`flex gap-3 ${error ? 'animate-[shake_.35s]' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition ${
              error ? 'border-red-400 bg-red-400' : i < pin.length ? 'border-accent bg-accent' : 'border-white/30'
            }`}
          />
        ))}
      </div>
      <div className="grid w-full grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)} className="h-14 rounded-xl border border-line bg-panel font-display text-2xl font-bold hover:bg-white/5 active:bg-accent/20">
            {d}
          </button>
        ))}
        <div />
        <button onClick={() => press('0')} className="h-14 rounded-xl border border-line bg-panel font-display text-2xl font-bold hover:bg-white/5 active:bg-accent/20">
          0
        </button>
        <button onClick={() => setPin((p) => p.slice(0, -1))} className="flex h-14 items-center justify-center rounded-xl text-muted hover:text-white" aria-label="Löschen">
          <Delete size={22} />
        </button>
      </div>
    </div>
  );
}
