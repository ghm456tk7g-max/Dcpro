import { Trash2 } from 'lucide-react';
import { validScores } from '../lib/logic';
import { Modal, usePlayerName } from './ui';

export interface ResultTarget {
  title: string;
  p1: string;
  p2: string;
  s1: number | null;
  s2: number | null;
  firstTo: number;
  onSave(s1: number, s2: number): void;
  onClear?(): void;
  /** Anzeigenamen, falls die Spieler keine Liga-Spieler sind (Turnier) */
  names?: [string, string];
  /** Zusatzinfo unter den Namen, z. B. "301 Single Out" */
  note?: string;
}

/** Ein-Tipp-Eingabe: alle gültigen Ergebnisse für "First to N" als Buttons */
export default function ResultModal({ target, onClose }: { target: ResultTarget | null; onClose(): void }) {
  const leagueName = usePlayerName();
  if (!target) return null;
  const name = (id: string) => (id === target.p1 ? target.names?.[0] : id === target.p2 ? target.names?.[1] : undefined) ?? leagueName(id);
  const scores = validScores(target.firstTo);
  const left = scores.filter(([a, b]) => a > b);
  const right = scores.filter(([a, b]) => b > a);
  const hasResult = target.s1 !== null && target.s2 !== null;

  const btn = ([a, b]: [number, number]) => {
    const sel = a === target.s1 && b === target.s2;
    return (
      <button
        key={`${a}-${b}`}
        onClick={() => {
          target.onSave(a, b);
          onClose();
        }}
        className={`rounded-xl border px-2 py-3 font-display text-xl font-bold tabular-nums transition ${
          sel ? 'border-accent bg-accent text-bg' : 'border-line bg-panel hover:border-accent/60 hover:bg-accent/10'
        }`}
      >
        {a}:{b}
      </button>
    );
  };

  return (
    <Modal open onClose={onClose} title={target.title}>
      <div className="p-4 sm:p-5">
        <div className="mb-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
          <div className="truncate font-display text-lg font-bold">{name(target.p1)}</div>
          <div className="text-xs font-semibold uppercase tracking-widest text-muted">vs</div>
          <div className="truncate font-display text-lg font-bold">{name(target.p2)}</div>
        </div>
        <p className="mb-4 text-center text-xs text-muted">
          {target.note ? `${target.note} · ` : ''}First to {target.firstTo} · Best of {target.firstTo * 2 - 1} · Ergebnis antippen
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <div className="text-center text-[11px] font-semibold uppercase tracking-wider text-accent-light">
              Sieg {name(target.p1)}
            </div>
            {left.map(btn)}
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-center text-[11px] font-semibold uppercase tracking-wider text-accent-light">
              Sieg {name(target.p2)}
            </div>
            {right.map(btn)}
          </div>
        </div>
        {hasResult && target.onClear && (
          <button
            onClick={() => {
              target.onClear!();
              onClose();
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 py-2.5 text-sm text-red-300 hover:bg-red-500/10"
          >
            <Trash2 size={16} /> Ergebnis löschen
          </button>
        )}
      </div>
    </Modal>
  );
}
