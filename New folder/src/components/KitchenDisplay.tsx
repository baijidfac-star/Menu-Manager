import { useEffect, useMemo, useState } from 'react';
import { Check, ChefHat, Clock, Flame, GlassWater, Utensils } from 'lucide-react';
import type { ClientAction, Order, RestaurantState, Station } from '../types';
import { formatElapsedMMSS } from '../utils/format';

interface KitchenDisplayProps {
  state: RestaurantState;
  onDispatch: (action: ClientAction) => void;
}

type StationFilter = 'All' | Station;

export function KitchenDisplay({ state, onDispatch }: KitchenDisplayProps) {
  const [stationFilter, setStationFilter] = useState<StationFilter>('All');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const kdsOrders = useMemo(
    () =>
      state.orders.filter(
        (o) =>
          !o.settled &&
          (o.status === 'Sent to Kitchen' ||
            o.status === 'Preparing' ||
            o.status === 'Ready')
      ),
    [state.orders]
  );

  const stationCounts = useMemo(() => {
    const counts: Record<StationFilter, number> = {
      All: 0,
      Grill: 0,
      Fry: 0,
      Bar: 0,
    };
    for (const order of kdsOrders) {
      if (order.status === 'Ready') continue;
      counts.All += 1;
      const stationsInOrder = new Set(
        order.items.filter((i) => i.itemStatus !== 'Ready').map((i) => i.station)
      );
      stationsInOrder.forEach((st) => {
        counts[st] += 1;
      });
    }
    return counts;
  }, [kdsOrders]);

  const activeTickets = useMemo(() => {
    return kdsOrders
      .filter((order) => order.status !== 'Ready')
      .map((order) => {
        const visibleItems =
          stationFilter === 'All'
            ? order.items
            : order.items.filter((it) => it.station === stationFilter);
        return { order, visibleItems };
      })
      .filter(({ visibleItems }) => visibleItems.length > 0)
      .sort((a, b) => a.order.createdAt - b.order.createdAt);
  }, [kdsOrders, stationFilter]);

  const readyTickets = useMemo(
    () =>
      kdsOrders
        .filter((order) => order.status === 'Ready')
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [kdsOrders]
  );

  const placedWaitingCount = useMemo(
    () => state.orders.filter((o) => !o.settled && o.status === 'Placed').length,
    [state.orders]
  );

  const getTimerSeverity = (createdAt: number) => {
    const mins = (nowMs - createdAt) / 60000;
    if (mins >= 10) return { text: 'text-red-400', border: 'border-red-500/40', label: 'Urgent' };
    if (mins >= 5) return { text: 'text-amber-400', border: 'border-amber-500/40', label: 'Fire' };
    return { text: 'text-emerald-400', border: 'border-slate-700', label: 'On Time' };
  };

  const renderStationIcon = (station: Station) => {
    if (station === 'Grill') return <Flame className="w-3.5 h-3.5 text-amber-400" />;
    if (station === 'Fry') return <Utensils className="w-3.5 h-3.5 text-orange-400" />;
    return <GlassWater className="w-3.5 h-3.5 text-sky-400" />;
  };

  const handleTicketBump = (order: Order, nextItemStatus: 'Preparing' | 'Ready') => {
    onDispatch({
      type: 'kds:stationAction',
      payload: {
        orderId: order.id,
        station: stationFilter === 'All' ? undefined : stationFilter,
        itemStatus: nextItemStatus,
      },
    });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[#0B1120] text-slate-100">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* KDS Station Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Kitchen Display System
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Live pass tickets by prep station · {placedWaitingCount} awaiting floor dispatch
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto no-scrollbar">
            {(['All', 'Grill', 'Fry', 'Bar'] as StationFilter[]).map((st) => {
              const active = stationFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStationFilter(st)}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-2 ${
                    active
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span>{st === 'All' ? 'All Stations' : st}</span>
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      active ? 'text-slate-900' : 'text-slate-400'
                    }`}
                  >
                    {stationCounts[st]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Kitchen Tickets Grid */}
        {activeTickets.length === 0 ? (
          <div className="bg-[#131C31] border border-slate-800 rounded-2xl p-10 text-center space-y-3">
            <ChefHat className="w-10 h-10 text-slate-500 mx-auto" />
            <p className="text-base font-bold text-white">
              All clear on {stationFilter === 'All' ? 'all stations' : `${stationFilter} station`}
            </p>
            <p className="text-xs text-slate-400">
              New tickets appear automatically when floor staff sends guest orders to the kitchen.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-start">
            {activeTickets.map(({ order, visibleItems }) => {
              const timer = getTimerSeverity(order.createdAt);
              const allVisiblePreparingOrReady = visibleItems.every(
                (i) => i.itemStatus !== 'Pending'
              );
              const allVisibleReady = visibleItems.every(
                (i) => i.itemStatus === 'Ready'
              );

              return (
                <article
                  key={order.id}
                  className={`bg-[#131C31] border ${timer.border} rounded-2xl overflow-hidden flex flex-col`}
                >
                  {/* Ticket Header */}
                  <div className="px-4 py-3.5 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-bold text-white">
                          {order.tableId}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="font-mono text-xs text-slate-300">
                          {order.id}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {order.status} · {timer.label}
                      </p>
                    </div>

                    <div className={`text-right font-mono tabular-nums ${timer.text}`}>
                      <div className="inline-flex items-center gap-1 text-base font-bold">
                        <Clock className="w-4 h-4" />
                        <span>{formatElapsedMMSS(order.createdAt, nowMs)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Ticket Line Items */}
                  <div className="p-4 divide-y divide-slate-800/80 flex-1">
                    {visibleItems.map((item) => (
                      <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">
                              <span className="font-mono text-amber-400 mr-2 tabular-nums">
                                {item.quantity}x
                              </span>
                              {item.name}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                              <span className="inline-flex items-center gap-1">
                                {renderStationIcon(item.station)}
                                <span>{item.station}</span>
                              </span>
                              <span>·</span>
                              <span>Size {item.size}</span>
                            </div>
                          </div>
                          <span
                            className={`text-[11px] font-semibold shrink-0 ${
                              item.itemStatus === 'Ready'
                                ? 'text-emerald-400'
                                : item.itemStatus === 'Preparing'
                                ? 'text-amber-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {item.itemStatus}
                          </span>
                        </div>
                        {item.notes && (
                          <p className="text-xs font-medium text-amber-300 pl-6">
                            Note: {item.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Ticket Actions */}
                  <div className="p-3 bg-slate-900/50 border-t border-slate-800 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={allVisiblePreparingOrReady}
                      onClick={() => handleTicketBump(order, 'Preparing')}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold transition-colors"
                    >
                      {allVisiblePreparingOrReady ? 'In Prep' : 'Start Prep'}
                    </button>
                    <button
                      type="button"
                      disabled={allVisibleReady}
                      onClick={() => handleTicketBump(order, 'Ready')}
                      className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>Bump Ready</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Ready on Pass Rail */}
        {readyTickets.length > 0 && (
          <section className="border-t border-slate-800 pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-300">
                Ready on Pass · Awaiting Runner Pickup ({readyTickets.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {readyTickets.map((order) => (
                <div
                  key={order.id}
                  className="bg-[#131C31] border border-emerald-500/30 rounded-xl p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-emerald-400">
                      {order.tableId} · {order.id}
                    </p>
                    <p className="text-xs text-slate-300 truncate mt-0.5">
                      {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onDispatch({
                        type: 'order:updateStatus',
                        payload: { orderId: order.id, status: 'Served' },
                      })
                    }
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    Served
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
