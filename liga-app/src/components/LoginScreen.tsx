import { FormEvent, useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { useLeague } from '../lib/league';

export function Logo({ big = false }: { big?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className={big ? 'h-12 w-12 shrink-0' : 'h-8 w-8 shrink-0'} aria-hidden>
        <circle cx="16" cy="16" r="15" fill="#10b981" />
        <circle cx="16" cy="16" r="11" fill="#0f1216" />
        <circle cx="16" cy="16" r="7" fill="#ef4444" />
        <circle cx="16" cy="16" r="3" fill="#0f1216" />
        <circle cx="16" cy="16" r="1.4" fill="#10b981" />
      </svg>
      <div className="text-left leading-none">
        <div className={`font-display font-extrabold tracking-wider ${big ? 'text-2xl' : 'text-[15px] sm:text-base'}`}>DARTS &amp; DURSTIG</div>
        <div className={`font-bold tracking-[0.35em] text-accent-light ${big ? 'mt-1 text-xs' : 'text-[10px]'}`}>LIGA</div>
      </div>
    </div>
  );
}

export default function LoginScreen() {
  const { signIn } = useLeague();
  const [user, setUser] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user.trim() || !pw) return;
    setBusy(true);
    setError(null);
    const err = await signIn(user, pw);
    setBusy(false);
    if (err) setError(err);
  };

  const input =
    'w-full rounded-xl border border-line bg-panel2 px-4 py-3 text-base outline-none transition focus:border-accent/70 focus:ring-2 focus:ring-accent/20';

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(700px_400px_at_50%_0%,rgba(16,185,129,0.12),transparent_70%)]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo big />
        </div>
        <form onSubmit={submit} className="rounded-2xl border border-line bg-panel p-6 shadow-2xl">
          <h1 className="font-display text-xl font-bold">Anmelden</h1>
          <p className="mb-5 mt-1 text-sm text-muted">Nur für Mitglieder der Liga. Zugangsdaten gibt's beim Liga-Admin.</p>
          <label htmlFor="login-user" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">
            Benutzername
          </label>
          <input
            id="login-user"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className={input}
            placeholder="z. B. max"
          />
          <label htmlFor="login-pw" className="mb-1.5 mt-4 block text-xs font-semibold uppercase tracking-wider text-muted">
            Passwort
          </label>
          <div className="relative">
            <input
              id="login-pw"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className={`${input} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted hover:text-white"
              aria-label={show ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}
          <button
            type="submit"
            disabled={busy || !user.trim() || !pw}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 font-semibold text-bg transition hover:bg-accent-light disabled:opacity-40"
          >
            <LogIn size={18} /> {busy ? 'Melde an…' : 'Anmelden'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-muted">Du bleibst auf diesem Gerät angemeldet, bis du dich abmeldest.</p>
      </div>
    </div>
  );
}
