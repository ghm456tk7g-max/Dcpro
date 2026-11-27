import { ReactNode, useEffect } from 'react';
import { X, Check, Crown } from 'lucide-react';
import { useLeague } from '../lib/league';
import { computeDay, dayStatus } from '../lib/logic';
import { MATCHDAY_COUNT } from '../lib/types';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-panel ${className}`}>{children}</section>;
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3 sm:px-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/80">{children}</h2>
      {right}
    </div>
  );
}

export function ProgressBar({ pct, className = '', gold = false }: { pct: number; className?: string; gold?: boolean }) {
  return (
    <div className={`h-2.5 w-full overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-700 ${
          gold ? 'bg-gradient-to-r from-gold-dark to-gold' : 'bg-gradient-to-r from-accent to-lime-300'
        }`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
  wide = false,
  title,
}: {
  open: boolean;
  onClose(): void;
  children: ReactNode;
  wide?: boolean;
  title?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-bg shadow-2xl sm:rounded-2xl ${
          wide ? 'sm:max-w-4xl' : 'sm:max-w-md'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="min-w-0 font-display font-bold">{title}</div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-white/5 hover:text-white" aria-label="Schließen">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange(v: T): void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="inline-flex rounded-xl border border-line bg-panel p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === o.value ? 'bg-white/10 text-white' : 'text-muted hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MatchdayPicker({ value, onChange }: { value: number; onChange(n: number): void }) {
  const { state } = useLeague();
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
      {Array.from({ length: MATCHDAY_COUNT }, (_, i) => {
        const day = state.matchdays[i];
        const st = day ? dayStatus(day) : 'open';
        const winner = day && st === 'done' ? computeDay(day, state.players).winnerId : null;
        const active = value === i + 1;
        return (
          <button
            key={i}
            onClick={() => onChange(i + 1)}
            title={`Spieltag ${i + 1}`}
            className={`relative flex h-11 flex-col items-center justify-center rounded-xl border text-sm font-bold transition ${
              active
                ? 'border-accent bg-accent/15 text-white shadow-glow'
                : st === 'done'
                  ? 'border-accent/30 bg-accent/5 text-accent-light hover:border-accent/60'
                  : st === 'running'
                    ? 'border-amber-400/40 bg-amber-400/5 text-amber-200 hover:border-amber-400/70'
                    : 'border-line bg-panel text-muted hover:text-white'
            }`}
          >
            <span className="font-display">{i + 1}</span>
            {st === 'done' && (
              <span className="absolute -right-1 -top-1 rounded-full bg-accent p-0.5 text-bg">
                {winner ? <Crown size={10} strokeWidth={3} /> : <Check size={10} strokeWidth={3} />}
              </span>
            )}
            {st === 'running' && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />}
          </button>
        );
      })}
    </div>
  );
}

export function PlayerLink({ id, className = '' }: { id: string; className?: string }) {
  const { state, openProfile } = useLeague();
  const p = state.players.find((x) => x.id === id);
  return (
    <button onClick={() => openProfile(id)} className={`truncate text-left hover:underline ${className}`}>
      {p?.name ?? 'Unbekannt'}
    </button>
  );
}

export function usePlayerName() {
  const { state } = useLeague();
  return (id: string | null | undefined) => state.players.find((p) => p.id === id)?.name ?? '—';
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="rounded-2xl bg-white/5 p-4 text-accent">{icon}</div>
      <h3 className="font-display text-xl font-bold">{title}</h3>
      <p className="max-w-md text-sm text-muted">{text}</p>
      {action}
    </Card>
  );
}

export function Btn({
  children,
  onClick,
  variant = 'primary',
  className = '',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?(): void;
  variant?: 'primary' | 'ghost' | 'danger' | 'gold';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const styles = {
    primary: 'bg-accent text-bg hover:bg-accent-light',
    ghost: 'border border-line bg-panel text-white hover:bg-white/5',
    danger: 'border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20',
    gold: 'bg-gradient-to-r from-gold-dark to-gold text-bg hover:brightness-110',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}
