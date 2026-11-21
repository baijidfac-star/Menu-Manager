import { useState } from 'react';
import { Check, Copy, Gift, RotateCcw, Trophy, Wifi } from 'lucide-react';
import type { ClientAction, CurrencyConfig, TableSession } from '../../types';
import { formatCurrency } from '../../utils/format';

interface GuestZoneProps {
  table: TableSession;
  wifi: { ssid: string; password: string };
  currency: CurrencyConfig;
  onDispatch: (action: ClientAction) => void;
}

export function GuestZone({ table, wifi, currency, onDispatch }: GuestZoneProps) {
  const [copiedField, setCopiedField] = useState<'password' | 'ssid' | null>(null);
  const [claimedCheckIn, setClaimedCheckIn] = useState(false);

  const handleCopy = async (text: string, field: 'password' | 'ssid') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard fallback for restricted frames
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopiedField(field);
    window.setTimeout(() => setCopiedField(null), 2000);
  };

  const rewardGoal = 500;
  const progressPct = Math.min(100, Math.round((table.rewardsPoints / rewardGoal) * 100));
  const game = table.ticTacToe;

  const handleClaimCheckIn = () => {
    if (claimedCheckIn) return;
    setClaimedCheckIn(true);
    onDispatch({
      type: 'rewards:earn',
      payload: { tableId: table.id, points: 20 },
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Guest Wi-Fi Card */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Complimentary Table Access</p>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">Guest Wi-Fi</h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Wifi className="w-5 h-5" />
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-xs text-slate-500">Network Name</span>
                <span className="block font-mono text-sm font-medium text-slate-900 truncate">
                  {wifi.ssid}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(wifi.ssid, 'ssid')}
                className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedField === 'ssid' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy SSID</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <div className="min-w-0">
                <span className="block text-xs text-slate-500">Password</span>
                <span className="block font-mono text-sm font-semibold text-slate-900 truncate">
                  {wifi.password}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(wifi.password, 'password')}
                className="min-h-[44px] px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedField === 'password' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Password</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Rewards Widget */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col justify-between gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">
                {table.label} Loyalty Wallet
              </p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <h2 className="text-2xl font-bold text-slate-900 tabular-nums">
                  {table.rewardsPoints} pts
                </h2>
                <span className="text-xs text-slate-500 tabular-nums">
                  / {rewardGoal} pts goal
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>
                {table.rewardsPoints >= rewardGoal
                  ? `Reward unlocked: ${formatCurrency(10, currency, { decimals: 0 })} off your check`
                  : `${rewardGoal - table.rewardsPoints} pts away from ${formatCurrency(10, currency, { decimals: 0 })} off`}
              </span>
              {table.redeemedRewardCredit > 0 && (
                <span className="font-medium text-emerald-700 tabular-nums">
                  {formatCurrency(table.redeemedRewardCredit, currency)} credit active
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              disabled={table.rewardsPoints < 250}
              onClick={() =>
                onDispatch({
                  type: 'rewards:redeem',
                  payload: { tableId: table.id, pointsCost: 250, creditAmount: 5 },
                })
              }
              className="min-h-[44px] px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              Redeem 250 pts ({formatCurrency(5, currency, { decimals: 0 })} Off)
            </button>
            <button
              type="button"
              disabled={table.rewardsPoints < 500}
              onClick={() =>
                onDispatch({
                  type: 'rewards:redeem',
                  payload: { tableId: table.id, pointsCost: 500, creditAmount: 10 },
                })
              }
              className="min-h-[44px] px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              Redeem 500 pts ({formatCurrency(10, currency, { decimals: 0 })} Off)
            </button>
            <button
              type="button"
              disabled={claimedCheckIn}
              onClick={handleClaimCheckIn}
              className="min-h-[44px] px-3.5 py-2 text-xs font-medium rounded-lg bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {claimedCheckIn ? 'Check-In Claimed (+20)' : 'Claim Table Check-In (+20 pts)'}
            </button>
          </div>
        </section>
      </div>

      {/* Playable Tic-Tac-Toe Mini-Game */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <p className="text-xs font-medium text-slate-500">
              While You Wait · Win +15 Reward Points
            </p>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">
              Table Tic-Tac-Toe
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() =>
                  onDispatch({
                    type: 'game:reset',
                    payload: { tableId: table.id, mode: 'solo' },
                  })
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  game.mode === 'solo'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Solo vs Chef Bot
              </button>
              <button
                type="button"
                onClick={() =>
                  onDispatch({
                    type: 'game:reset',
                    payload: { tableId: table.id, mode: 'table' },
                  })
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  game.mode === 'table'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Table 2-Player
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                onDispatch({
                  type: 'game:reset',
                  payload: { tableId: table.id },
                })
              }
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>New Round</span>
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Board */}
          <div className="md:col-span-6 flex justify-center">
            <div
              role="grid"
              aria-label="Tic-Tac-Toe Board"
              className="grid grid-cols-3 gap-2.5 w-full max-w-[280px]"
            >
              {game.board.map((cell, idx) => {
                const disabled = cell !== null || game.winner !== null;
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={disabled}
                    aria-label={`Square ${idx + 1}${cell ? `, ${cell}` : ''}`}
                    onClick={() =>
                      onDispatch({
                        type: 'game:move',
                        payload: { tableId: table.id, index: idx },
                      })
                    }
                    className={`aspect-square min-h-[76px] rounded-xl border text-2xl font-bold font-display flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                      cell === 'X'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : cell === 'O'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 active:scale-[0.97]'
                    }`}
                  >
                    {cell}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Status & Scoreboard */}
          <div className="md:col-span-6 space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              {game.winner ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Trophy className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {game.winner === 'Draw'
                          ? 'Round Draw (+5 pts)'
                          : game.winner === 'X'
                          ? 'Player X Wins! (+15 pts)'
                          : game.mode === 'solo'
                          ? 'Chef Bot Wins'
                          : 'Player O Wins!'}
                      </p>
                      <p className="text-xs text-slate-500">
                        Tap New Round to keep playing at {table.label}.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Current Turn</span>
                  <span className="text-sm font-bold text-slate-900">
                    {game.turn === 'X'
                      ? 'Player X (You)'
                      : game.mode === 'solo'
                      ? 'Chef Bot (O)'
                      : 'Player O'}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="block text-xs text-slate-500">Player X</span>
                <span className="block text-xl font-bold text-slate-900 tabular-nums mt-0.5">
                  {game.scores.X}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="block text-xs text-slate-500">Draws</span>
                <span className="block text-xl font-bold text-slate-600 tabular-nums mt-0.5">
                  {game.scores.draws}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200">
                <span className="block text-xs text-slate-500">
                  {game.mode === 'solo' ? 'Chef Bot' : 'Player O'}
                </span>
                <span className="block text-xl font-bold text-amber-700 tabular-nums mt-0.5">
                  {game.scores.O}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
