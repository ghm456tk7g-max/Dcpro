import { useMemo, useState } from 'react';
import { Crown, Lock, LockOpen, Minus, Plus, Settings2, Ticket, Trash2 } from 'lucide-react';
import { useLeague } from '../lib/league';
import {
  betsOpen,
  computeDayBets,
  dayMarkets,
  MarketDef,
  MARKETS,
  marketById,
  remainingBudget,
  seasonBetStats,
  validateBet,
} from '../lib/bets';
import { euro } from '../lib/tournament';
import { Matchday, uid } from '../lib/types';
import CoinFlip from '../components/CoinFlip';
import DartFlip from '../components/DartFlip';
import { Btn, Card, CardTitle, Segmented } from '../components/ui';

const STAKES = [0.5, 1, 2, 5];

export default function BettingOffice({ day }: { day: Matchday }) {
  const { state, canEdit, update, toast } = useLeague();
  const idx = day.number - 1;
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? '—';
  const pickLabel = (p: string) => (p === 'yes' ? 'Ja' : p === 'no' ? 'Nein' : name(p));
  const db = useMemo(() => computeDayBets(state, day), [state, day]);
  const active = dayMarkets(state, day);
  const open = betsOpen(day);

  const [menuOpen, setMenuOpen] = useState(false);
  const [bettor, setBettor] = useState<string | null>(null);
  const [market, setMarket] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [stake, setStake] = useState<number>(1);
  const [game, setGame] = useState<'coin' | 'dart'>('coin');

  if (!day.started)
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <Ticket className="text-gold" size={30} />
        <div className="font-display text-xl font-bold">Wettbüro öffnet mit dem Spieltag</div>
        <p className="max-w-md text-sm text-muted">Sobald Spieltag {day.number} gestartet ist und die Anwesenden eingetragen sind, hat jeder {euro(state.settings.betBudget)} zum Wetten.</p>
      </Card>
    );

  const upd = (fn: (d: Matchday) => void, msg?: string) => update((s) => fn(s.matchdays[idx]), msg);
  const def = market ? marketById(market) : null;

  const place = () => {
    if (!bettor || !market || !pick) return;
    const err = validateBet(state, day, bettor, market, pick, stake);
    if (err) return toast(err, 'error');
    upd((d) => {
      d.bets = [...(d.bets ?? []), { id: uid(), bettor, market, pick, stake, at: new Date().toISOString() }];
    }, `${name(bettor)}: ${euro(stake)} auf „${pickLabel(pick)}“ (${def!.title})`);
    setPick(null);
    setStake((s) => Math.min(s, Math.max(0.5, remainingBudget(state, day, bettor) - stake)));
  };

  const toggleMarket = (id: string) =>
    upd((d) => {
      const cur = d.betMarkets ?? state.settings.defaultMarkets;
      d.betMarkets = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });

  const setEvent = (patch: Partial<NonNullable<Matchday['events']>>) => upd((d) => void (d.events = { ...(d.events ?? {}), ...patch }));
  const setCounter = (pid: string, key: 's26' | 'busts', v: number) =>
    upd((d) => void (d.specials[pid] = { ...(d.specials[pid] ?? { s180: 0, hf: 0, bestFinish: 0 }), [key]: Math.max(0, v) }));

  const needs = (id: string) => active.includes(id);
  const freeOf = (id: string) => remainingBudget(state, day, id);

  const MarketChip = ({ m }: { m: MarketDef }) => {
    const on = active.includes(m.id);
    return (
      <button
        onClick={() => toggleMarket(m.id)}
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${on ? 'border-gold/60 bg-gold/10 text-white' : 'border-line bg-panel2 text-muted hover:text-white'}`}
      >
        <span className="text-lg leading-none">{m.emoji}</span>
        <span>
          <span className="font-semibold">{m.title}</span>
          <span className="block text-[11px] text-muted">{m.hint}</span>
        </span>
      </button>
    );
  };

  const season = seasonBetStats(state);

  return (
    <div className="flex flex-col gap-4">
      {/* Kopf */}
      <section className="relative overflow-hidden rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/15 via-panel to-panel p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gold">
              <Ticket size={15} /> Wettbüro · Spieltag {day.number}
            </div>
            <div className="mt-1 font-display text-3xl font-extrabold tabular-nums text-gold">{euro(db.staked)} im Spiel</div>
            <div className="text-sm text-muted">
              {day.attendees.length} Anwesende × {euro(state.settings.betBudget)} Wettguthaben aus dem Startgeld · {(day.bets ?? []).length} Wetten · nicht gesetztes Guthaben geht in den Pot · niemand zahlt nach
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ${db.settled ? 'bg-accent/15 text-accent-light' : open ? 'bg-gold/15 text-gold' : 'bg-white/10 text-white/80'}`}>
              {db.settled ? 'Abgerechnet' : open ? 'Wettannahme offen' : 'Wettannahme geschlossen'}
            </span>
            {canEdit && !db.settled && (
              <Btn variant="ghost" onClick={() => upd((d) => void (d.betsClosed = open), open ? 'Wettannahme geschlossen' : 'Wettannahme wieder offen')} className="py-1.5">
                {open ? <Lock size={15} /> : <LockOpen size={15} />} {open ? 'Schließen' : 'Öffnen'}
              </Btn>
            )}
            {canEdit && (
              <Btn variant="ghost" onClick={() => setMenuOpen((v) => !v)} className="py-1.5">
                <Settings2 size={15} /> Wettmenü
              </Btn>
            )}
          </div>
        </div>
        {open && <p className="mt-2 text-xs text-muted">Die Annahme schließt automatisch, sobald das erste Ergebnis des Abends eingetragen wird.</p>}
      </section>

      {/* Wettmenü */}
      {canEdit && menuOpen && (
        <Card className="p-4 sm:p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold uppercase tracking-[0.14em] text-white/80">Wettmenü für Spieltag {day.number}</div>
            <button
              onClick={() => update((s) => void (s.settings.defaultMarkets = [...active]), 'Als Standard für neue Spieltage gespeichert')}
              className="text-xs font-semibold text-accent-light hover:underline"
            >
              Auswahl als Standard speichern
            </button>
          </div>
          <p className="mb-3 text-xs text-muted">Antippen zum An- und Abwählen. {active.length} Wetten aktiv – 4 bis 6 sind für einen Abend ideal.</p>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Wertet die App automatisch aus</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MARKETS.filter((m) => m.auto).map((m) => (
              <MarketChip key={m.id} m={m} />
            ))}
          </div>
          <div className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">Mit Zähler (im Bereich „Ereignisse des Abends“ eintragen)</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {MARKETS.filter((m) => !m.auto).map((m) => (
              <MarketChip key={m.id} m={m} />
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Wettschein */}
        {canEdit && open ? (
          <Card className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-white/80">
              <Ticket size={16} className="text-gold" /> Wettschein
            </div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">1 · Wer wettet?</div>
            <div className="flex flex-wrap gap-1.5">
              {day.attendees.map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    setBettor(id);
                    setPick(null);
                  }}
                  disabled={freeOf(id) <= 0}
                  className={`rounded-lg border px-2.5 py-1.5 text-sm transition disabled:opacity-35 ${bettor === id ? 'border-gold bg-gold/15 text-white' : 'border-line bg-panel2 text-white/80 hover:border-gold/50'}`}
                >
                  {name(id)} <span className="text-[11px] text-muted">{euro(freeOf(id))}</span>
                </button>
              ))}
            </div>
            {bettor && (
              <>
                <div className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">2 · Auf welche Wette?</div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {active.map((id) => {
                    const m = marketById(id)!;
                    return (
                      <button
                        key={id}
                        onClick={() => {
                          setMarket(id);
                          setPick(null);
                        }}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${market === id ? 'border-gold bg-gold/15' : 'border-line bg-panel2 hover:border-gold/50'}`}
                      >
                        <span className="text-base">{m.emoji}</span>
                        <span className="min-w-0 flex-1 truncate">{m.title}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {bettor && def && (
              <>
                <div className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">3 · Tipp – {def.hint}</div>
                <div className="flex flex-wrap gap-1.5">
                  {(def.kind === 'yesno' ? (def.jackpot ? ['yes'] : ['yes', 'no']) : day.attendees.filter((id) => id !== bettor)).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPick(p)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${pick === p ? 'border-accent bg-accent/15 text-white' : 'border-line bg-panel2 text-white/80 hover:border-accent/50'}`}
                    >
                      {pickLabel(p)}
                    </button>
                  ))}
                </div>
                {def.kind === 'player' && <p className="mt-1 text-[11px] text-muted">Auf sich selbst wetten ist nicht erlaubt.</p>}
                <div className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">4 · Einsatz (frei: {euro(freeOf(bettor))})</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {STAKES.filter((v) => v <= freeOf(bettor) + 1e-9).map((v) => (
                    <button
                      key={v}
                      onClick={() => setStake(v)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-bold tabular-nums transition ${stake === v ? 'border-gold bg-gold text-bg' : 'border-line bg-panel2 hover:border-gold/50'}`}
                    >
                      {euro(v)}
                    </button>
                  ))}
                  <div className="ml-1 flex items-center gap-1">
                    <button onClick={() => setStake((s) => Math.max(0.5, s - 0.5))} className="rounded-md border border-line p-1.5 text-muted hover:text-white" aria-label="weniger">
                      <Minus size={14} />
                    </button>
                    <span className="w-14 text-center font-display font-bold tabular-nums">{euro(stake)}</span>
                    <button onClick={() => setStake((s) => Math.min(freeOf(bettor), s + 0.5))} className="rounded-md border border-line p-1.5 text-muted hover:text-white" aria-label="mehr">
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <Btn variant="gold" onClick={place} disabled={!pick || stake > freeOf(bettor) + 1e-9} className="mt-4 w-full py-3">
                  <Ticket size={16} /> {pick ? `${euro(stake)} auf „${pickLabel(pick)}“ setzen` : 'Tipp auswählen'}
                </Btn>
              </>
            )}
          </Card>
        ) : (
          <Card className="p-4 text-sm text-muted sm:p-5">
            {db.settled
              ? 'Alle Wetten sind entschieden. Unten stehen Gewinner und Tippkönig des Abends.'
              : open
                ? 'Wetten trägt der Admin ein (Schloss oben rechts).'
                : 'Die Wettannahme ist geschlossen – jetzt wird gespielt. Die Töpfe werden automatisch abgerechnet.'}
          </Card>
        )}

        {/* Töpfe */}
        <div className="flex flex-col gap-3">
          {db.markets.map((m) => {
            const byPick = new Map<string, number>();
            m.bets.forEach((b) => byPick.set(b.pick, (byPick.get(b.pick) ?? 0) + b.stake));
            return (
              <Card key={m.def.id} className={m.resolution.decided ? 'border-accent/30' : ''}>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 sm:px-5">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="text-lg">{m.def.emoji}</span> {m.def.title}
                  </div>
                  <div className="text-right">
                    <span className="font-display text-lg font-bold tabular-nums text-gold">{euro(m.pool)}</span>
                    {m.carryIn > 0 && <span className="ml-1.5 text-[11px] text-gold/80">inkl. {euro(m.carryIn)} Jackpot</span>}
                  </div>
                </div>
                <div className="px-4 pb-3 text-xs sm:px-5">
                  {m.resolution.decided ? (
                    <span className="text-accent-light">
                      Ergebnis: <b>{m.resolution.winners.map(pickLabel).join(', ') || 'niemand'}</b>
                      {m.toPot > 0 && <span className="text-muted"> · keiner lag richtig, {euro(m.toPot)} gehen in den Pot</span>}
                      {m.carryOut > 0 && <span className="text-gold"> · Jackpot wandert weiter: {euro(m.carryOut)}</span>}
                    </span>
                  ) : (
                    <span className="text-muted">läuft …</span>
                  )}
                </div>
                {m.bets.length > 0 && (
                  <ul className="border-t border-line/60">
                    {m.bets.map((b) => {
                      const pay = m.payouts.get(b.id);
                      const lost = m.resolution.decided && !pay;
                      const share = (byPick.get(b.pick) ?? 0) > 0 ? b.stake / byPick.get(b.pick)! : 0;
                      const potential = m.pool * share;
                      return (
                        <li key={b.id} className={`flex items-center gap-2 border-t border-line/40 px-4 py-1.5 text-sm first:border-0 sm:px-5 ${lost ? 'opacity-45' : ''}`}>
                          <span className="min-w-0 flex-1 truncate">
                            <b>{name(b.bettor)}</b> <span className="text-muted">→</span> {pickLabel(b.pick)}
                          </span>
                          <span className="tabular-nums text-muted">{euro(b.stake)}</span>
                          <span className={`w-20 text-right font-semibold tabular-nums ${pay ? 'text-accent-light' : 'text-muted'}`}>
                            {pay ? `+${euro(pay)}` : lost ? 'verloren' : `bis ${euro(potential)}`}
                          </span>
                          {canEdit && open && (
                            <button onClick={() => upd((d) => void (d.bets = (d.bets ?? []).filter((x) => x.id !== b.id)), 'Wette gelöscht')} className="rounded p-1 text-muted hover:text-red-300" aria-label="Wette löschen">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
          {db.markets.length === 0 && <Card className="p-4 text-sm text-muted">Noch keine Wetten im Menü. Der Admin wählt sie über „Wettmenü“ aus.</Card>}
        </div>
      </div>

      {/* Ereignisse des Abends */}
      {canEdit && ['most26', 'mostBusts', 'bullFinish', 'madhouse', 'nineDarter', 'first180'].some(needs) && (
        <Card>
          <CardTitle>Ereignisse des Abends</CardTitle>
          <div className="flex flex-col gap-4 px-4 pb-4 sm:px-5">
            {(needs('most26') || needs('mostBusts')) && (
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {day.attendees.map((id) => {
                  const e = day.specials[id] ?? { s180: 0, hf: 0, bestFinish: 0 };
                  return (
                    <div key={id} className="flex items-center gap-2 rounded-xl border border-line bg-panel2 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium">{name(id)}</span>
                      {(['s26', 'busts'] as const)
                        .filter((k) => needs(k === 's26' ? 'most26' : 'mostBusts'))
                        .map((k) => (
                          <span key={k} className="flex items-center gap-1">
                            <span className="text-[10px] uppercase text-muted">{k === 's26' ? '26er' : 'Bust'}</span>
                            <button onClick={() => setCounter(id, k, (e[k] ?? 0) - 1)} className="rounded border border-line p-0.5 text-muted" aria-label="weniger">
                              <Minus size={12} />
                            </button>
                            <span className="w-5 text-center font-bold tabular-nums">{e[k] ?? 0}</span>
                            <button onClick={() => setCounter(id, k, (e[k] ?? 0) + 1)} className="rounded bg-gold/20 p-0.5 text-gold" aria-label="mehr">
                              <Plus size={12} />
                            </button>
                          </span>
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['bullFinish', 'Bull-Finish passiert'],
                  ['madhouse', 'Madhouse (Doppel 1)'],
                  ['nineDarter', '9-Darter geworfen'],
                ] as const
              )
                .filter(([k]) => needs(k))
                .map(([k, label]) => {
                  const on = !!day.events?.[k];
                  return (
                    <button
                      key={k}
                      onClick={() => setEvent({ [k]: !on })}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${on ? 'border-accent bg-accent/15 text-white' : 'border-line bg-panel2 text-muted hover:text-white'}`}
                    >
                      {marketById(k)!.emoji} {label}: <b>{on ? 'Ja' : 'Nein'}</b>
                    </button>
                  );
                })}
              {needs('first180') && (
                <label className="flex items-center gap-2 rounded-xl border border-line bg-panel2 px-3 py-1.5 text-sm">
                  ⚡ Erste 180:
                  <select
                    value={day.events?.first180 ?? ''}
                    onChange={(e) => setEvent({ first180: e.target.value || null })}
                    className="rounded-md border border-line bg-bg px-2 py-1 text-sm"
                  >
                    <option value="">noch keine</option>
                    {day.attendees.map((id) => (
                      <option key={id} value={id}>
                        {name(id)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <p className="text-[11px] text-muted">Tagessieger, Finishes, 180er und Average kommen automatisch aus „Spieltag“ und „Specials“.</p>
          </div>
        </Card>
      )}

      {/* Abrechnung & Tippkönig */}
      {(day.bets ?? []).length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Card>
            <CardTitle right={<span className="text-xs text-muted">{db.settled ? 'endgültig' : 'vorläufig'}</span>}>Abrechnung</CardTitle>
            <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
                  <th className="px-4 py-2 text-left font-semibold sm:px-5">Spieler</th>
                  <th className="px-2 py-2 text-right font-semibold">Einsatz</th>
                  <th className="px-2 py-2 text-right font-semibold">Auszahlung</th>
                  <th className="px-4 py-2 text-right font-semibold sm:px-5">Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {[...db.perBettor.entries()]
                  .map(([p, e]) => ({ p, staked: e.staked, pay: db.finalPayout.get(p) ?? 0 }))
                  .sort((a, b) => b.pay - b.staked - (a.pay - a.staked))
                  .map((r) => (
                    <tr key={r.p} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2 font-medium sm:px-5">
                        {db.king?.player === r.p && <Crown size={14} className="mr-1 inline text-gold" />}
                        {name(r.p)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted">{euro(r.staked)}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{euro(r.pay)}</td>
                      <td className={`px-4 py-2 text-right font-display font-bold tabular-nums sm:px-5 ${r.pay - r.staked > 0 ? 'text-accent-light' : r.pay - r.staked < 0 ? 'text-red-300/80' : 'text-muted'}`}>
                        {r.pay - r.staked > 0 ? '+' : ''}
                        {euro(r.pay - r.staked)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            </div>
            <p className="px-4 pb-3 pt-2 text-[11px] text-muted sm:px-5">
              Eingesetzt werden nur die {euro(state.settings.betBudget)} Wettguthaben aus dem Startgeld – niemand zahlt etwas nach. Ausgezahlt wird nur, was an diesem Abend eingesetzt wurde.
            </p>
          </Card>

          <Card className={`p-5 ${db.king ? 'border-gold/50 shadow-gold' : ''}`}>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-gold">
              <Crown size={15} /> Tippkönig des Abends
            </div>
            {!db.settled ? (
              <p className="text-sm text-muted">Steht fest, sobald alle Wetten entschieden sind. Dann darf er per Münzwurf auf „Doppelt oder nichts“ gehen.</p>
            ) : !db.king ? (
              <p className="text-sm text-muted">Heute hat niemand Gewinn gemacht – kein Tippkönig, kein Münzwurf.</p>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="text-center">
                  <div className="font-display text-3xl font-extrabold">{name(db.king.player)}</div>
                  <div className="text-sm text-muted">
                    gewinnt {euro(db.king.payout)} (+{euro(db.king.net)})
                  </div>
                </div>
                {db.coinStake <= 0 && !day.coinflip ? (
                  <p className="text-center text-sm text-muted">
                    Heute sind weniger als 0,50 € Wetteinsatz verfallen ({euro(db.forfeited)}) – zu wenig, um eine Verdopplung zu bezahlen. Darum gibt es heute keinen Münzwurf, {name(db.king.player)} bekommt die {euro(db.king.payout)} sicher.
                  </p>
                ) : (
                  (() => {
                    const mode = day.coinflip?.mode ?? (day.coinflip ? 'coin' : game);
                    const props = {
                      name: name(db.king.player),
                      amount: db.king.payout,
                      stake: day.coinflip ? Math.min(day.coinflip.amount, db.king.payout) : db.coinStake,
                      done: day.coinflip?.result ?? null,
                      canFlip: canEdit,
                      onResult: (r: 'double' | 'nothing') =>
                        upd(
                          (d) => void (d.coinflip = { player: db.king!.player, amount: db.coinStake, result: r, mode, at: new Date().toISOString() }),
                          r === 'double' ? `${name(db.king!.player)} gewinnt den Wurf!` : `${name(db.king!.player)} verliert den Wurf – ab in den Pot`,
                        ),
                    };
                    return (
                      <>
                        {!day.coinflip && canEdit && (
                          <Segmented<'coin' | 'dart'>
                            value={game}
                            onChange={setGame}
                            options={[
                              { value: 'coin', label: '🪙 Münze' },
                              { value: 'dart', label: '🎯 Doppel oder Draußen' },
                            ]}
                          />
                        )}
                        {mode === 'dart' ? <DartFlip key="dart" {...props} /> : <CoinFlip key="coin" {...props} />}
                      </>
                    );
                  })()
                )}
                {!day.coinflip && db.coinStake > 0 && (
                  <p className="text-center text-[11px] text-muted">
                    Freiwillig – wer nicht riskieren will, wirft nicht. Bezahlt wird nur aus den heute verfallenen Wetteinsätzen ({euro(db.forfeited)}), darum geht es um höchstens {euro(db.coinStake)}. Niemand zahlt etwas nach.
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Saison */}
      {season.length > 0 && (
        <Card>
          <CardTitle>Tippkönig der Saison</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
                <th className="px-4 py-2 text-left font-semibold sm:px-5">Spieler</th>
                <th className="px-2 py-2 text-right font-semibold">Eingesetzt</th>
                <th className="px-2 py-2 text-right font-semibold">Ausgezahlt</th>
                <th className="px-2 py-2 text-right font-semibold">👑</th>
                <th className="px-4 py-2 text-right font-semibold sm:px-5">Bilanz</th>
              </tr>
            </thead>
            <tbody>
              {season.map((r, i) => (
                <tr key={r.player} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-2 font-medium sm:px-5">
                    <span className="mr-2 text-xs text-muted">{i + 1}.</span>
                    {name(r.player)}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted">{euro(r.staked)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{euro(r.payout)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gold">{r.kings || ''}</td>
                  <td className={`px-4 py-2 text-right font-display font-bold tabular-nums sm:px-5 ${r.net > 0 ? 'text-accent-light' : r.net < 0 ? 'text-red-300/80' : 'text-muted'}`}>
                    {r.net > 0 ? '+' : ''}
                    {euro(r.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
            </div>
        </Card>
      )}
    </div>
  );
}
