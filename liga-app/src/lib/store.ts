import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { LeagueState, normalizeState } from './types';

export type StoreMode = 'supabase' | 'local';
export type ConnStatus = 'connecting' | 'live' | 'offline' | 'local';

export interface Store {
  mode: StoreMode;
  load(): Promise<LeagueState | null>;
  save(state: LeagueState, pin: string): Promise<void>;
  subscribe(onChange: (s: LeagueState) => void, onStatus: (s: ConnStatus) => void): () => void;
  verifyPin(pin: string): Promise<boolean>;
  changePin(oldPin: string, newPin: string): Promise<boolean>;
}

const STATE_ID = 'main';
const DEFAULT_PIN = '1800';

/* ---------------------------- LocalStorage ---------------------------- */

const LS_STATE = 'ddl-state-v1';
const LS_PIN = 'ddl-local-pin';

function localStore(): Store {
  return {
    mode: 'local',
    async load() {
      try {
        const raw = localStorage.getItem(LS_STATE);
        return raw ? normalizeState(JSON.parse(raw)) : null;
      } catch {
        return null;
      }
    },
    async save(state) {
      localStorage.setItem(LS_STATE, JSON.stringify(state));
    },
    subscribe(onChange, onStatus) {
      onStatus('local');
      // Synchronisation zwischen mehreren Tabs im selben Browser
      const h = (e: StorageEvent) => {
        if (e.key === LS_STATE && e.newValue) onChange(normalizeState(JSON.parse(e.newValue)));
      };
      window.addEventListener('storage', h);
      return () => window.removeEventListener('storage', h);
    },
    async verifyPin(pin) {
      return pin === (localStorage.getItem(LS_PIN) ?? DEFAULT_PIN);
    },
    async changePin(oldPin, newPin) {
      if (oldPin !== (localStorage.getItem(LS_PIN) ?? DEFAULT_PIN)) return false;
      localStorage.setItem(LS_PIN, newPin);
      return true;
    },
  };
}

/* ------------------------------ Supabase ------------------------------ */

function supabaseStore(url: string, key: string): Store {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
  });

  const load = async () => {
    const { data, error } = await sb.from('league_state').select('data').eq('id', STATE_ID).maybeSingle();
    if (error) throw error;
    return data?.data ? normalizeState(data.data) : null;
  };

  return {
    mode: 'supabase',
    load,
    async save(state, pin) {
      const { error } = await sb.rpc('save_league_state', { p_pin: pin, p_data: state });
      if (error) throw error;
    },
    subscribe(onChange, onStatus) {
      onStatus('connecting');
      // Bei jeder Änderung den Datensatz frisch laden (robust gegen große Payloads)
      const refresh = () =>
        load()
          .then((s) => s && onChange(s))
          .catch(() => onStatus('offline'));
      const channel = sb
        .channel('league-state')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'league_state', filter: `id=eq.${STATE_ID}` }, refresh)
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            onStatus('live');
            refresh();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus('offline');
        });
      // Tablet aus dem Standby geholt -> sofort aktualisieren
      const vis = () => document.visibilityState === 'visible' && refresh();
      document.addEventListener('visibilitychange', vis);
      window.addEventListener('online', refresh);
      return () => {
        document.removeEventListener('visibilitychange', vis);
        window.removeEventListener('online', refresh);
        sb.removeChannel(channel);
      };
    },
    async verifyPin(pin) {
      const { data, error } = await sb.rpc('verify_admin_pin', { p_pin: pin });
      if (error) throw error;
      return data === true;
    },
    async changePin(oldPin, newPin) {
      const { data, error } = await sb.rpc('change_admin_pin', { p_old: oldPin, p_new: newPin });
      if (error) throw error;
      return data === true;
    },
  };
}

export function createStore(): Store {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (url && key && url.startsWith('http') && !url.includes('DEIN-PROJEKT')) {
    return supabaseStore(url, key);
  }
  return localStore();
}
