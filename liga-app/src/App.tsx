import { useEffect, useState } from 'react';
import { CircleUserRound, CalendarRange, Flame, GitBranch, ListOrdered, Lock, LockOpen, Monitor, MonitorOff, Settings } from 'lucide-react';
import { useLeague } from './lib/league';
import { currentDayNumber } from './lib/logic';
import PlayerProfile from './components/PlayerProfile';
import PinPad from './components/PinPad';
import LoginScreen, { Logo } from './components/LoginScreen';
import AccountModal from './components/AccountModal';
import { Btn, Modal } from './components/ui';
import MatchdayView from './views/MatchdayView';
import RankingView from './views/RankingView';
import KoView from './views/KoView';
import SpecialsView from './views/SpecialsView';
import AdminView from './views/AdminView';

type Tab = 'spieltag' | 'rangliste' | 'ko' | 'specials' | 'admin';
const TABS: { id: Tab; label: string; short: string; icon: typeof ListOrdered }[] = [
  { id: 'spieltag', label: 'Übersicht / Spieltag', short: 'Spieltag', icon: CalendarRange },
  { id: 'rangliste', label: 'Rangliste', short: 'Rangliste', icon: ListOrdered },
  { id: 'ko', label: 'K.O.-Phase', short: 'K.O.', icon: GitBranch },
  { id: 'specials', label: 'Specials', short: 'Specials', icon: Flame },
  { id: 'admin', label: 'Admin', short: 'Admin', icon: Settings },
];

const tabFromHash = (): Tab => {
  const h = location.hash.replace('#/', '') as Tab;
  return TABS.some((t) => t.id === h) ? h : 'spieltag';
};

function ConnBadge() {
  const { conn } = useLeague();
  const cfg = {
    live: ['bg-accent', 'Live'],
    connecting: ['bg-amber-400 animate-pulse', 'Verbinde…'],
    offline: ['bg-red-500', 'Offline'],
    local: ['bg-white/40', 'Lokal'],
  }[conn];
  return (
    <span className="hidden items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs text-muted sm:flex" title="Sync-Status">
      <span className={`h-2 w-2 rounded-full ${cfg[0]}`} /> {cfg[1]}
    </span>
  );
}

export default function App() {
  const lg = useLeague();
  const { state, loaded, isAdmin, tablet, setTablet, profileId, toasts, confirmState, pinRequest, requestPin } = lg;
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [day, setDay] = useState<number | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    const h = () => setTabState(tabFromHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  const setTab = (t: Tab) => {
    location.hash = `#/${t}`;
    setTabState(t);
    window.scrollTo({ top: 0 });
  };

  if (lg.authRequired && lg.user === undefined)
    return <div className="flex min-h-dvh items-center justify-center bg-bg text-muted">Lade…</div>;
  if (lg.authRequired && !lg.user) return <LoginScreen />;

  // ausgewählter Spieltag folgt automatisch dem aktuellen, bis man selbst wählt
  const selectedDay = day ?? currentDayNumber(state);

  return (
    <div className="min-h-dvh bg-bg pb-24 text-white md:pb-10">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <button onClick={() => setTab('spieltag')}>
            <Logo />
          </button>
          <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  tab === t.id ? 'bg-white/10 text-white' : 'text-muted hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ConnBadge />
            {lg.authRequired && (
              <button
                onClick={() => setAccountOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-xs font-semibold text-muted transition hover:text-white"
                title="Mein Konto"
              >
                <CircleUserRound size={16} />
                <span className="hidden max-w-[8rem] truncate lg:inline">{lg.user}</span>
              </button>
            )}
            <button
              onClick={() => (isAdmin ? setTab('admin') : requestPin(true))}
              className={`rounded-lg border p-2 transition ${isAdmin ? 'border-accent/40 text-accent' : 'border-line text-muted hover:text-white'}`}
              title={isAdmin ? 'Admin-Modus aktiv' : 'Admin-Anmeldung'}
            >
              {isAdmin ? <LockOpen size={18} /> : <Lock size={18} />}
            </button>
            <button
              onClick={() => setTablet(!tablet)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
                tablet ? 'border-accent bg-accent/15 text-accent-light' : 'border-line text-muted hover:text-white'
              }`}
              title="Tablet-Anzeigemodus"
            >
              {tablet ? <MonitorOff size={16} /> : <Monitor size={16} />}
              <span className="hidden sm:inline">Tablet</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        {!loaded ? (
          <div className="flex h-64 items-center justify-center text-muted">Lade Liga-Daten…</div>
        ) : tab === 'spieltag' ? (
          <MatchdayView day={selectedDay} setDay={setDay} goAdmin={() => setTab('admin')} />
        ) : tab === 'rangliste' ? (
          <RankingView day={selectedDay} setDay={setDay} />
        ) : tab === 'ko' ? (
          <KoView day={selectedDay} setDay={setDay} />
        ) : tab === 'specials' ? (
          <SpecialsView day={selectedDay} setDay={setDay} />
        ) : (
          <AdminView />
        )}
      </main>

      {/* Mobile Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${tab === t.id ? 'text-accent-light' : 'text-muted'}`}
            >
              <t.icon size={20} />
              {t.short}
            </button>
          ))}
        </div>
      </nav>

      {profileId && <PlayerProfile />}
      {lg.authRequired && <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />}

      <Modal open={pinRequest} onClose={() => requestPin(false)} title="Admin-Anmeldung">
        <div className="p-6">
          <PinPad onSuccess={() => requestPin(false)} />
        </div>
      </Modal>

      {confirmState && (
        <Modal open onClose={() => confirmState.resolve(false)} title={confirmState.title}>
          <div className="p-5">
            <p className="text-sm text-white/80">{confirmState.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Btn variant="ghost" onClick={() => confirmState.resolve(false)}>
                Abbrechen
              </Btn>
              <Btn variant={confirmState.danger ? 'danger' : 'primary'} onClick={() => confirmState.resolve(true)}>
                {confirmState.confirmLabel ?? 'OK'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border px-4 py-2.5 text-sm font-medium shadow-2xl ${
              t.kind === 'error' ? 'border-red-500/40 bg-[#2a1416] text-red-200' : 'border-accent/40 bg-[#10241c] text-accent-light'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
