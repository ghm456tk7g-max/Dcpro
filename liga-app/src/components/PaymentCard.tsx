import { BadgeCheck, Coins, Flame, Hourglass, Trophy, Users, Building2 } from 'lucide-react';
import { PlayerPayments } from '../lib/cash';
import { euro } from '../lib/tournament';
import { MATCHDAY_COUNT } from '../lib/types';

/** Fortschrittsring Teilnahmen / Mindestteilnahme */
function Ring({ value, max, ok }: { value: number; max: number; ok: boolean }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 1;
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="9" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={ok ? '#10b981' : '#f5c451'}
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        style={{ transition: 'stroke-dasharray .8s ease', filter: `drop-shadow(0 0 6px ${ok ? 'rgba(16,185,129,.6)' : 'rgba(245,196,81,.5)'})` }}
      />
      <g className="rotate-90" style={{ transformOrigin: '50px 50px' }}>
        <text x="50" y="49" textAnchor="middle" className="fill-white font-display" style={{ fontSize: 24, fontWeight: 800 }}>
          {value}/{max}
        </text>
        <text x="50" y="66" textAnchor="middle" style={{ fontSize: 9, fill: '#8b93a1', letterSpacing: '.08em' }}>
          TEILNAHMEN
        </text>
      </g>
    </svg>
  );
}

export default function PaymentCard({ pay }: { pay: PlayerPayments }) {
  const rows = [
    { icon: <Users size={14} />, label: 'Startgeld', detail: `${pay.attended}× anwesend`, amount: pay.fees },
    { icon: <Flame size={14} className="text-gold" />, label: '180er-Runden', detail: 'Anteil an den 180ern der Abende', amount: pay.rounds180 },
    { icon: <Building2 size={14} className="text-sky-300" />, label: 'Unternehmenskasse', detail: `${pay.startedDays} Spieltage, auch wenn man fehlt`, amount: pay.club },
    ...(pay.tournament ? [{ icon: <Trophy size={14} />, label: 'Turnier', detail: 'Gebühr + 180er', amount: pay.tournament }] : []),
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* Eingezahlt */}
      <div className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/10 via-panel to-panel p-4 sm:p-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gold">
          <Coins size={15} /> Bisher eingezahlt
        </div>
        <div className="mt-1 font-display text-4xl font-extrabold tabular-nums text-gold">{euro(pay.total)}</div>
        <ul className="mt-3 space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2.5">
              <span className="text-muted">{r.icon}</span>
              <span className="min-w-0 flex-1">
                {r.label}
                <span className="block text-[11px] text-muted">{r.detail}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{euro(r.amount)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Auszahlungs-Berechtigung */}
      <div className={`rounded-2xl border p-4 sm:p-5 ${pay.eligible ? 'border-accent/50 bg-accent/[0.06]' : 'border-line bg-panel'}`}>
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">Auszahlungs-Berechtigung</div>
        <div className="mt-2 flex items-center gap-4">
          <Ring value={pay.attended} max={pay.minAttendance} ok={pay.eligible} />
          <div className="min-w-0">
            {pay.eligible ? (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-sm font-bold text-bg">
                <BadgeCheck size={16} /> Auszahlungsberechtigt
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-gold/15 px-2.5 py-1 text-sm font-bold text-gold">
                <Hourglass size={15} /> Noch {pay.missing} {pay.missing === 1 ? 'Teilnahme' : 'Teilnahmen'}
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              Mindestteilnahme: <b className="text-white">{pay.minAttendance} Spieltage</b>. Erst dann besteht Anspruch auf eine Auszahlung aus dem Pot.
            </p>
          </div>
        </div>
        {/* Spieltage 1–12 */}
        <div className="mt-4 grid grid-cols-12 gap-1">
          {Array.from({ length: MATCHDAY_COUNT }, (_, i) => {
            const st = pay.days[i] ?? 'open';
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  title={`Spieltag ${i + 1}: ${st === 'present' ? 'anwesend' : st === 'absent' ? 'gefehlt' : 'noch offen'}`}
                  className={`h-6 w-full rounded-md ${
                    st === 'present' ? 'bg-accent shadow-glow' : st === 'absent' ? 'bg-red-500/40' : 'border border-dashed border-white/15'
                  }`}
                />
                <span className="text-[9px] tabular-nums text-muted">{i + 1}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent" />
            anwesend
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500/50" />
            gefehlt
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-sm border border-dashed border-white/30" />
            noch offen
          </span>
          {!pay.eligible && pay.missing > MATCHDAY_COUNT - pay.startedDays && <span className="text-red-300">Mindestteilnahme diese Saison nicht mehr erreichbar</span>}
        </div>
      </div>
    </div>
  );
}
