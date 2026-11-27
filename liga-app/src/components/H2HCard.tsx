import { Swords } from 'lucide-react';
import { H2H } from '../lib/stats';

/** Direkter Vergleich gegen jeden Gegner */
export default function H2HCard({ rows, name, onOpen }: { rows: H2H[]; name(id: string): string; onOpen(id: string): void }) {
  const decided = rows.filter((r) => r.played >= 2);
  const fav = [...decided].sort((a, b) => b.wins / b.played - a.wins / a.played || b.played - a.played)[0];
  const nem = [...decided].sort((a, b) => b.losses / b.played - a.losses / a.played || b.played - a.played)[0];
  return (
    <div className="rounded-2xl border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-4 sm:px-5">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">
          <Swords size={16} /> Direkter Vergleich
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {fav && fav.wins > fav.losses && (
            <span className="rounded-lg bg-accent/15 px-2 py-1 text-accent-light">
              Lieblingsgegner: <b>{name(fav.opp)}</b> ({fav.wins}:{fav.losses})
            </span>
          )}
          {nem && nem.losses > nem.wins && (
            <span className="rounded-lg bg-red-500/10 px-2 py-1 text-red-300">
              Angstgegner: <b>{name(nem.opp)}</b> ({nem.wins}:{nem.losses})
            </span>
          )}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted">Noch keine Spiele.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2 text-left font-semibold sm:px-5">Gegner</th>
                <th className="px-2 py-2 text-right font-semibold">Spiele</th>
                <th className="px-2 py-2 text-right font-semibold">S</th>
                <th className="px-2 py-2 text-right font-semibold">N</th>
                <th className="px-2 py-2 text-right font-semibold">Legs</th>
                <th className="w-32 px-4 py-2 text-left font-semibold sm:px-5">Bilanz</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.opp} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2 sm:px-5">
                    <button onClick={() => onOpen(r.opp)} className="font-medium hover:underline">
                      {name(r.opp)}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{r.played}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-accent-light">{r.wins}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-red-300/80">{r.losses}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums text-white/80">
                    {r.legsFor}:{r.legsAgainst}
                  </td>
                  <td className="px-4 py-2 sm:px-5">
                    <div className="flex h-2 w-28 overflow-hidden rounded-full bg-white/5" title={`${r.wins} Siege, ${r.losses} Niederlagen`}>
                      <div className="h-full bg-accent" style={{ width: `${(r.wins / r.played) * 100}%` }} />
                      {r.wins > 0 && r.losses > 0 && <div className="h-full w-[2px] bg-panel" />}
                      <div className="h-full flex-1 bg-red-400/60" style={{ display: r.losses ? undefined : 'none' }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="px-4 pb-3 pt-2 text-[11px] text-muted sm:px-5">Ligaspiele und K.O.-Phase an den Spieltagen.</p>
    </div>
  );
}
