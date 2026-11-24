import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ConnStatus, createStore, Store } from './store';
import { emptyState, LeagueState } from './types';

const ADMIN_KEY = 'ddl-admin-pin';
const TABLET_KEY = 'ddl-tablet-mode';

export interface Toast {
  id: number;
  text: string;
  kind: 'ok' | 'error';
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface Ctx {
  state: LeagueState;
  loaded: boolean;
  store: Store;
  conn: ConnStatus;
  isAdmin: boolean;
  /** Admin und nicht im Tablet-Modus -> Bearbeitungselemente anzeigen */
  canEdit: boolean;
  tablet: boolean;
  setTablet(v: boolean): void;
  login(pin: string): Promise<boolean>;
  logout(): void;
  changePin(oldPin: string, newPin: string): Promise<boolean>;
  update(fn: (draft: LeagueState) => void, okMsg?: string): Promise<void>;
  replace(next: LeagueState, okMsg?: string): Promise<void>;
  toast(text: string, kind?: Toast['kind']): void;
  toasts: Toast[];
  confirm(o: ConfirmOptions): Promise<boolean>;
  confirmState: (ConfirmOptions & { resolve(v: boolean): void }) | null;
  profileId: string | null;
  openProfile(id: string | null): void;
  pinRequest: boolean;
  requestPin(v: boolean): void;
}

const LeagueCtx = createContext<Ctx | null>(null);

const readLS = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLS = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* privater Modus */
  }
};

export function LeagueProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => createStore(), []);
  const [state, setState] = useState<LeagueState>(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [conn, setConn] = useState<ConnStatus>(store.mode === 'local' ? 'local' : 'connecting');
  const [pin, setPin] = useState<string | null>(() => readLS(ADMIN_KEY));
  const [tablet, setTabletState] = useState(() => readLS(TABLET_KEY) === '1');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<Ctx['confirmState']>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [pinRequest, setPinRequest] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toast = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // Nur neuere Stände übernehmen (verhindert Flackern durch eigene, verspätete Echos)
  const accept = useCallback((s: LeagueState) => {
    if (s.updatedAt >= stateRef.current.updatedAt) setState(s);
  }, []);

  useEffect(() => {
    let alive = true;
    store
      .load()
      .then((s) => alive && s && setState(s))
      .catch(() => alive && toast('Daten konnten nicht geladen werden', 'error'))
      .finally(() => alive && setLoaded(true));
    const unsub = store.subscribe(accept, setConn);
    return () => {
      alive = false;
      unsub();
    };
  }, [store, accept, toast]);

  // gespeicherten PIN beim Start still prüfen (z. B. nach PIN-Änderung auf anderem Gerät)
  useEffect(() => {
    if (!pin) return;
    store
      .verifyPin(pin)
      .then((ok) => {
        if (!ok) {
          setPin(null);
          writeLS(ADMIN_KEY, null);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  useEffect(() => {
    document.documentElement.classList.toggle('tablet', tablet);
  }, [tablet]);

  const setTablet = (v: boolean) => {
    setTabletState(v);
    writeLS(TABLET_KEY, v ? '1' : '0');
  };

  const login = async (p: string) => {
    try {
      const ok = await store.verifyPin(p);
      if (ok) {
        setPin(p);
        writeLS(ADMIN_KEY, p);
      }
      return ok;
    } catch {
      toast('PIN-Prüfung fehlgeschlagen – Verbindung prüfen', 'error');
      return false;
    }
  };

  const logout = () => {
    setPin(null);
    writeLS(ADMIN_KEY, null);
    toast('Admin-Modus beendet');
  };

  const changePin = async (oldPin: string, newPin: string) => {
    try {
      const ok = await store.changePin(oldPin, newPin);
      if (ok) {
        setPin(newPin);
        writeLS(ADMIN_KEY, newPin);
      }
      return ok;
    } catch (e) {
      toast('PIN-Änderung fehlgeschlagen: ' + (e instanceof Error ? e.message : String(e)), 'error');
      return false;
    }
  };

  const persist = async (next: LeagueState, prev: LeagueState, okMsg?: string) => {
    if (!pin) {
      setPinRequest(true);
      return;
    }
    next.updatedAt = Math.max(Date.now(), prev.updatedAt + 1);
    setState(next);
    try {
      await store.save(next, pin);
      if (okMsg) toast(okMsg);
    } catch (e) {
      setState(prev);
      const msg = e instanceof Error ? e.message : String(e);
      if (/PIN/i.test(msg)) {
        setPin(null);
        writeLS(ADMIN_KEY, null);
        toast('Admin-PIN ungültig – bitte neu anmelden', 'error');
      } else toast('Speichern fehlgeschlagen: ' + msg, 'error');
    }
  };

  const update: Ctx['update'] = async (fn, okMsg) => {
    const prev = stateRef.current;
    const draft = structuredClone(prev);
    fn(draft);
    await persist(draft, prev, okMsg);
  };

  const replace: Ctx['replace'] = async (next, okMsg) => {
    await persist(structuredClone(next), stateRef.current, okMsg);
  };

  const confirm = (o: ConfirmOptions) =>
    new Promise<boolean>((resolve) =>
      setConfirmState({
        ...o,
        resolve: (v) => {
          setConfirmState(null);
          resolve(v);
        },
      }),
    );

  const isAdmin = !!pin;
  const value: Ctx = {
    state,
    loaded,
    store,
    conn,
    isAdmin,
    canEdit: isAdmin && !tablet,
    tablet,
    setTablet,
    login,
    logout,
    changePin,
    update,
    replace,
    toast,
    toasts,
    confirm,
    confirmState,
    profileId,
    openProfile: setProfileId,
    pinRequest,
    requestPin: setPinRequest,
  };
  return <LeagueCtx.Provider value={value}>{children}</LeagueCtx.Provider>;
}

export function useLeague() {
  const c = useContext(LeagueCtx);
  if (!c) throw new Error('useLeague außerhalb des Providers');
  return c;
}
