import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  ChefHat,
  Clock,
  ExternalLink,
  Star,
  UserCheck,
  Utensils,
} from 'lucide-react';
import type { ClientAction, RestaurantState, TableSession } from '../types';
import { formatCurrency, formatElapsedMMSS, formatElapsedShort } from '../utils/format';

interface FloorDashboardProps {
  state: RestaurantState;
  onDispatch: (action: ClientAction) => void;
  onOpenGuestTable: (tableId: string) => void;
}

export function FloorDashboard({
  state,
  onDispatch,
  onOpenGuestTable,
}: FloorDashboardProps) {
  const [selectedTableId, setSelectedTableId] = useState<string>('T07');
  const [zoneFilter, setZoneFilter] = useState<string>('All');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const zones = useMemo(() => {
    const unique = Array.from(new Set(state.tables.map((t) => t.zone)));
    return ['All', ...unique];
  }, [state.tables]);

  const filteredTables = useMemo(
    () =>
      state.tables.filter((t) => zoneFilter === 'All' || t.zone === zoneFilter),
    [state.tables, zoneFilter]
  );

  const tableStatsMap = useMemo(() => {
    const map: Record<
      string,
      { activeOrders: number; placedCount: number; readyCount: number; openBalance: number }
    > = {};
    for (const t of state.tables) {
      map[t.id] = { activeOrders: 0, placedCount: 0, readyCount: 0, openBalance: 0 };
    }
    for (const o of state.orders) {
      if (o.settled) continue;
      const entry = map[o.tableId];
      if (!entry) continue;
      entry.activeOrders += 1;
      if (o.status === 'Placed') entry.placedCount += 1;
      if (o.status === 'Ready') entry.readyCount += 1;
      for (const item of o.items) {
        entry.openBalance +=
          Math.max(0, item.unitPrice - item.discountPerUnit) * item.quantity;
      }
    }
    return map;
  }, [state.tables, state.orders]);

  const summary = useMemo(() => {
    const occupied = state.tables.filter((t) => t.status !== 'Free').length;
    const needsHelp = state.tables.filter((t) => t.status === 'Needs Help').length;
    const pendingDispatch = state.orders.filter(
      (o) => !o.settled && o.status === 'Placed'
    ).length;
    const readyToServe = state.orders.filter(
      (o) => !o.settled && o.status === 'Ready'
    ).length;
    return { occupied, needsHelp, pendingDispatch, readyToServe };
  }, [state.tables, state.orders]);

  const helpTables = useMemo(
    () => state.tables.filter((t) => t.waiterCall.active),
    [state.tables]
  );

  const dispatchQueue = useMemo(
    () =>
      state.orders.filter(
        (o) => !o.settled && (o.status === 'Placed' || o.status === 'Ready')
      ),
    [state.orders]
  );

  const activeKitchenOrders = useMemo(
    () =>
      state.orders.filter(
        (o) =>
          !o.settled &&
          (o.status === 'Sent to Kitchen' || o.status === 'Preparing')
      ),
    [state.orders]
  );

  const selectedTable: TableSession =
    state.tables.find((t) => t.id === selectedTableId) ?? state.tables[0];
  const selectedTableOrders = useMemo(
    () => state.orders.filter((o) => o.tableId === selectedTable.id && !o.settled),
    [state.orders, selectedTable.id]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
      {/* Top KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <span className="text-xs font-medium text-slate-500">Active Tables</span>
          <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {summary.occupied} <span className="text-sm font-normal text-slate-400">/ {state.tables.length}</span>
          </p>
        </div>
        <div
          className={`border rounded-2xl p-4 ${
            summary.needsHelp > 0
              ? 'bg-red-50 border-red-200'
              : 'bg-white border-slate-200'
          }`}
        >
          <span
            className={`text-xs font-medium ${
              summary.needsHelp > 0 ? 'text-red-700' : 'text-slate-500'
            }`}
          >
            Waiter Alerts
          </span>
          <p
            className={`text-2xl font-bold tabular-nums mt-1 ${
              summary.needsHelp > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {summary.needsHelp}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <span className="text-xs font-medium text-slate-500">Awaiting Kitchen Dispatch</span>
          <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
            {summary.pendingDispatch}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <span className="text-xs font-medium text-slate-500">Ready on Kitchen Pass</span>
          <p className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">
            {summary.readyToServe}
          </p>
        </div>
      </div>

      {/* Urgent Waiter Alerts Banner */}
      {helpTables.length > 0 && (
        <section className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-900">
            <BellRing className="w-4 h-4 text-red-600 shrink-0" />
            <h2 className="text-sm font-bold">
              Active Waiter Requests ({helpTables.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {helpTables.map((t) => (
              <div
                key={t.id}
                className="bg-white border border-red-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{t.label}</span>
                    <span className="text-xs text-slate-500">· {t.zone}</span>
                    {t.waiterCall.requestedAt && (
                      <span className="font-mono text-xs text-red-700 tabular-nums">
                        · {formatElapsedMMSS(t.waiterCall.requestedAt, nowMs)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {t.waiterCall.reason || 'Guest requested assistance'} · Status:{' '}
                    <span className="font-semibold">{t.waiterCall.status}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.waiterCall.status === 'Requested' && (
                    <button
                      type="button"
                      onClick={() =>
                        onDispatch({
                          type: 'waiter:respond',
                          payload: { tableId: t.id, action: 'acknowledge' },
                        })
                      }
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold whitespace-nowrap"
                    >
                      On My Way
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onDispatch({
                        type: 'waiter:respond',
                        payload: { tableId: t.id, action: 'arrived' },
                      })
                    }
                    className="min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Waiter Arrived</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Workspace Grid: Floor Map + Detail & Dispatch */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Visual Floor Map (7 cols) */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Live Floor Map</h2>
              <p className="text-xs text-slate-500">
                Select any table to inspect orders, resolve alerts, or preview guest view
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto no-scrollbar">
              {zones.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoneFilter(z)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    zoneFilter === z
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {filteredTables.map((t) => {
              const stats = tableStatsMap[t.id];
              const isSelected = selectedTable.id === t.id;
              const isNeedsHelp = t.status === 'Needs Help';
              const isOccupied = t.status === 'Occupied';

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTableId(t.id)}
                  className={`text-left p-4 rounded-2xl border transition-all flex flex-col justify-between min-h-[144px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    isNeedsHelp
                      ? 'bg-red-50/70 border-red-300'
                      : isOccupied
                      ? 'bg-slate-50 border-slate-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  } ${isSelected ? 'ring-2 ring-slate-900 ring-offset-1' : ''}`}
                >
                  <div className="w-full flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-slate-500">
                        {t.id}
                      </span>
                      <p className="text-sm font-bold text-slate-900">{t.label}</p>
                    </div>
                    {isNeedsHelp ? (
                      <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                    ) : isOccupied ? (
                      <Utensils className="w-4 h-4 text-amber-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                  </div>

                  <div className="space-y-1.5 mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`font-semibold ${
                          isNeedsHelp
                            ? 'text-red-700'
                            : isOccupied
                            ? 'text-slate-900'
                            : 'text-emerald-700'
                        }`}
                      >
                        {t.status}
                      </span>
                      <span className="text-slate-500 tabular-nums">{t.seats}p</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-xs">
                      <span className="text-slate-500 truncate">{t.zone}</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {stats.openBalance > 0 ? formatCurrency(stats.openBalance, state.currency) : '—'}
                      </span>
                    </div>

                    {(stats.placedCount > 0 || stats.readyCount > 0) && (
                      <p className="text-[11px] font-medium text-amber-700">
                        {stats.placedCount > 0 && `${stats.placedCount} to dispatch`}
                        {stats.placedCount > 0 && stats.readyCount > 0 && ' · '}
                        {stats.readyCount > 0 && `${stats.readyCount} ready`}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Right: Selected Table Detail & Order Dispatch Queue (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Selected Table Control Card */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs text-slate-500">
                  {selectedTable.zone} · {selectedTable.seats} Seats · {selectedTable.status}
                </p>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  {selectedTable.label} Control
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onOpenGuestTable(selectedTable.id)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>Open Guest View</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onDispatch({
                    type: 'table:setStatus',
                    payload: { tableId: selectedTable.id, status: 'Occupied' },
                  })
                }
                disabled={selectedTable.status === 'Occupied'}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
              >
                Seat Guests (Occupied)
              </button>
              <button
                type="button"
                onClick={() =>
                  onDispatch({
                    type: 'table:setStatus',
                    payload: { tableId: selectedTable.id, status: 'Free' },
                  })
                }
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                Clear & Mark Free
              </button>
            </div>

            {selectedTableOrders.length === 0 ? (
              <p className="text-xs text-slate-500 py-3">
                No unsettled orders on {selectedTable.label}.
              </p>
            ) : (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                {selectedTableOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {order.id} · {order.status}
                      </span>
                      {order.status === 'Placed' && (
                        <button
                          type="button"
                          onClick={() =>
                            onDispatch({
                              type: 'order:dispatch',
                              payload: { orderId: order.id },
                            })
                          }
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 whitespace-nowrap"
                        >
                          Send to Kitchen
                        </button>
                      )}
                      {order.status === 'Ready' && (
                        <button
                          type="button"
                          onClick={() =>
                            onDispatch({
                              type: 'order:updateStatus',
                              payload: { orderId: order.id, status: 'Served' },
                            })
                          }
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 whitespace-nowrap"
                        >
                          Mark Served
                        </button>
                      )}
                    </div>
                    <ul className="text-xs text-slate-600 space-y-0.5">
                      {order.items.map((it) => (
                        <li key={it.id} className="flex justify-between gap-2">
                          <span>
                            {it.quantity}x {it.name} ({it.size})
                          </span>
                          <span className="text-slate-500">{it.station}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Order Dispatch & Runner Queue */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Order Dispatch & Runner Queue
                </h3>
                <p className="text-xs text-slate-500">
                  Approve guest orders for KDS or clear ready plates
                </p>
              </div>
              <ChefHat className="w-5 h-5 text-slate-400" />
            </div>

            {dispatchQueue.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                All incoming orders are dispatched and active in the kitchen ({activeKitchenOrders.length} in prep).
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {dispatchQueue.map((order) => (
                  <div key={order.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {order.tableId}
                        </span>
                        <span className="font-mono text-xs text-slate-500">
                          {order.id}
                        </span>
                        <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatElapsedShort(order.createdAt, nowMs)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 mt-1">
                        {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                      </p>
                    </div>

                    {order.status === 'Placed' ? (
                      <button
                        type="button"
                        onClick={() =>
                          onDispatch({
                            type: 'order:dispatch',
                            payload: { orderId: order.id },
                          })
                        }
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                      >
                        <span>Send to Kitchen</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          onDispatch({
                            type: 'order:updateStatus',
                            payload: { orderId: order.id, status: 'Served' },
                          })
                        }
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                      >
                        Mark Served
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Live Guest Reviews Strip */}
      {state.reviews.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Recent Guest Reviews</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {state.reviews.slice(0, 6).map((rev) => (
              <div
                key={rev.id}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-slate-900">
                    {rev.tableId}
                  </span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= rev.rating
                            ? 'fill-amber-400 text-amber-500'
                            : 'text-slate-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">{rev.comment}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
