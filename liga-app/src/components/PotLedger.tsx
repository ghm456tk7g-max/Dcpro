import { Coins, Flame, Users } from 'lucide-react';
import { useLeague } from '../lib/league';
import { potLedger } from '../lib/cash';
import { formatDate } from '../lib/logic';
import { euro } from '../lib/tournament';
import { Modal } from './ui';

/** Alle Einzahlungen im Pot einzeln aufgelistet */
export default function PotLedger({ open, onClose }: { open: boolean; onClose(): void }) {
  const { state } = useLeague();
  const { groups, total, league, tournament } = potLedger(state);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 text-gold">
          <Coins size={18} /> Aktueller Pot · {euro(total)}
        </span>
      }
    >
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-xl border border-line bg-panel px-3 py-2">
            <div className="text-xs text-muted">Liga-Spieltage</div>
            <div className="font-display text-lg font-bold tabular-nums">{euro(league)}</div>
          </div>
          <div className="rounded-xl border border-line bg-panel px-3 py-2">
            <div className="text-xs text-muted">Turnier</div>
            <div className="font-display text-lg font-bold tabular-nums">{euro(tournament)}</div>
          </div>
        </div>
        {groups.length === 0 && <p className="text-sm text-muted">Noch keine Einzahlungen.</p>}
        {groups.map((g) => (
          <section key={g.key} className="rounded-xl border border-line bg-panel">
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-3 py-2">
              <div className="font-semibold">
                {g.title}
                {g.date && <span className="ml-2 text-xs font-normal text-muted">{formatDate(g.date)}</span>}
              </div>
              <div className="font-display font-bold tabular-nums text-gold">{euro(g.total)}</div>
            </div>
            <ul>
              {g.lines.map((l) => (
                <li key={l.key} className="flex items-center gap-2.5 border-t border-line/50 px-3 py-1.5 text-sm first:border-0">
                  {l.kind === 'fee' ? <Users size={14} className="shrink-0 text-muted" /> : <Flame size={14} className="shrink-0 text-gold" />}
                  <span className="min-w-0 flex-1">
                    {l.label}
                    <span className="block text-xs text-muted">{l.detail}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{euro(l.amount)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="flex justify-between rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5 font-display text-lg font-bold text-gold">
          <span>Gesamt</span>
          <span className="tabular-nums">{euro(total)}</span>
        </div>
      </div>
    </Modal>
  );
}
