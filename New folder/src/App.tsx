import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Lock, X } from 'lucide-react';
import { FloorDashboard } from './components/FloorDashboard';
import { GuestView } from './components/GuestView';
import { KitchenDisplay } from './components/KitchenDisplay';
import { MenuManager } from './components/MenuManager';
import { TopBar, type GuestSection } from './components/TopBar';
import { useRestaurantStore } from './hooks/useRestaurantStore';
import type { AppView } from './types';
import { normalizeTableId } from './utils/format';

function getInitialRouteState(): { view: AppView; tableId: string | null } {
  if (typeof window === 'undefined') {
    return { view: 'admin', tableId: null };
  }
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get('view');
  const rawTable = params.get('table');

  if (rawView === 'floor' || rawView === 'kds' || rawView === 'admin') {
    return {
      view: rawView,
      tableId: rawTable ? normalizeTableId(rawTable) : null,
    };
  }

  if (rawTable || rawView === 'guest') {
    return {
      view: 'guest',
      tableId: normalizeTableId(rawTable),
    };
  }

  // Default startup view when opening "/" without ?table= is Menu Manager (admin)
  return { view: 'admin', tableId: null };
}

export default function App() {
  const initial = getInitialRouteState();
  const [activeView, setActiveView] = useState<AppView>(initial.view);
  const [tableId, setTableId] = useState<string>(initial.tableId ?? 'T07');
  const [guestTab, setGuestTab] = useState<GuestSection>('menu');
  const [previewReturnView, setPreviewReturnView] = useState<Exclude<AppView, 'guest'> | null>(
    null
  );

  const [staffUnlocked, setStaffUnlocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('bistro_staff_unlocked') === '1';
  });
  const [staffManuallyLocked, setStaffManuallyLocked] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.sessionStorage.getItem('bistro_staff_locked') === '1';
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const { state, error, dispatch, clearError } = useRestaurantStore();
  const autoCreatedTablesRef = useRef<Set<string>>(new Set());

  // If a guest scans a custom ?table=T09 link not yet in state.tables, create it seamlessly
  useEffect(() => {
    if (!state || activeView !== 'guest') return;
    const exists = state.tables.some(
      (t) => t.id.toUpperCase() === tableId.toUpperCase()
    );
    if (!exists && !autoCreatedTablesRef.current.has(tableId)) {
      autoCreatedTablesRef.current.add(tableId);
      dispatch({
        type: 'table:add',
        payload: {
          id: tableId,
          label: `Table ${tableId.replace(/^T0?/, '')}`,
          seats: 4,
          zone: 'Main Hall',
        },
      });
    }
  }, [state, activeView, tableId, dispatch]);

  const resolvedTableId = useMemo(() => {
    if (!state) return tableId;
    const matched = state.tables.find(
      (t) => t.id.toUpperCase() === tableId.toUpperCase()
    );
    return matched ? matched.id : tableId;
  }, [state, tableId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeView === 'guest') {
      params.delete('view');
      params.set('table', resolvedTableId);
    } else {
      params.delete('table');
      if (activeView === 'admin') {
        params.delete('view');
      } else {
        params.set('view', activeView);
      }
    }
    const qs = params.toString();
    const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.replaceState(null, '', nextUrl);
    }
  }, [activeView, resolvedTableId]);

  useEffect(() => {
    const onPop = () => {
      const next = getInitialRouteState();
      if (next.view !== 'guest') {
        setPreviewReturnView(null);
      }
      setActiveView(next.view);
      if (next.tableId) setTableId(next.tableId);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const isStaffRouteNeedingPin =
    activeView !== 'guest' &&
    !staffUnlocked &&
    (Boolean(state?.staffPinEnabled) || staffManuallyLocked);

  const handleOpenGuestTable = (nextTableId: string) => {
    const validIds = state?.tables.map((t) => t.id);
    const normalized = normalizeTableId(nextTableId, validIds);
    // Push history entry so staff previewing a guest table can use Browser Back
    const nextUrl = `${window.location.pathname}?table=${normalized}`;
    window.history.pushState(null, '', nextUrl);
    if (activeView !== 'guest' && !isStaffRouteNeedingPin) {
      setPreviewReturnView(activeView);
    }
    setTableId(normalized);
    setGuestTab('menu');
    setActiveView('guest');
  };

  const handleExitPreview = () => {
    const targetView = previewReturnView ?? 'admin';
    setPreviewReturnView(null);
    setActiveView(targetView);
  };

  const currentGuestTable = useMemo(() => {
    if (!state) return null;
    return state.tables.find((t) => t.id === resolvedTableId) ?? state.tables[0] ?? null;
  }, [state, resolvedTableId]);

  const activeGuestOrderCount = useMemo(() => {
    if (!state || !currentGuestTable) return 0;
    return state.orders.filter(
      (o) => o.tableId === currentGuestTable.id && !o.settled && o.status !== 'Served'
    ).length;
  }, [state, currentGuestTable]);

  const handleLockStaff = () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('bistro_staff_unlocked');
      window.localStorage.removeItem('bistro_staff_unlocked');
      window.sessionStorage.setItem('bistro_staff_locked', '1');
    }
    setPreviewReturnView(null);
    setStaffUnlocked(false);
    setStaffManuallyLocked(true);
    setPinInput('');
    setPinError(false);
  };

  const isDarkShell = activeView === 'kds' && !isStaffRouteNeedingPin;
  const exitPreviewLabel =
    previewReturnView === 'floor'
      ? 'Back to Floor'
      : previewReturnView === 'kds'
      ? 'Back to Kitchen'
      : 'Back to Admin';

  return (
    <div
      className={`min-h-screen print:min-h-0 transition-colors print:bg-white print:text-slate-900 ${
        isDarkShell ? 'bg-[#0B1120] text-slate-100' : 'bg-[#F8F9FA] text-slate-900'
      }`}
    >
      <TopBar
        activeView={activeView}
        onSelectView={setActiveView}
        isDarkShell={isDarkShell}
        isStaffLocked={isStaffRouteNeedingPin}
        onLockStaff={activeView !== 'guest' && !isStaffRouteNeedingPin ? handleLockStaff : undefined}
        guestTab={guestTab}
        onSelectGuestTab={setGuestTab}
        activeOrderCount={activeGuestOrderCount}
        waiterStatus={currentGuestTable?.waiterCall.status ?? 'None'}
        onCallWaiter={() => {
          if (!currentGuestTable) return;
          dispatch({
            type: 'waiter:call',
            payload: { tableId: currentGuestTable.id, reason: 'Table requested assistance' },
          });
        }}
        exitPreviewLabel={exitPreviewLabel}
        onExitPreview={
          activeView === 'guest' && previewReturnView !== null ? handleExitPreview : undefined
        }
        tables={state?.tables ?? []}
        onPreviewGuestTable={handleOpenGuestTable}
      />

      {error && (
        <div className="no-print max-w-7xl mx-auto px-4 md:px-6 pt-4">
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-medium flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={clearError}
              className="p-1 text-red-700 hover:text-red-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {!state ? (
        <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
          <div className="h-14 rounded-2xl bg-slate-200/70 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-64 rounded-2xl bg-slate-200/70 animate-pulse" />
            <div className="h-64 rounded-2xl bg-slate-200/70 animate-pulse" />
            <div className="h-64 rounded-2xl bg-slate-200/70 animate-pulse" />
          </div>
        </main>
      ) : isStaffRouteNeedingPin ? (
        <main className="max-w-md mx-auto px-4 py-16">
          <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Staff PIN Required</h1>
              <p className="text-xs text-slate-500 mt-1">
                Enter the restaurant staff PIN to open Menu Manager, Floor Map, or Kitchen Display.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (pinInput.trim() === state.staffPin) {
                  setStaffUnlocked(true);
                  setStaffManuallyLocked(false);
                  window.sessionStorage.setItem('bistro_staff_unlocked', '1');
                  window.sessionStorage.removeItem('bistro_staff_locked');
                  setPinInput('');
                  setPinError(false);
                } else {
                  setPinError(true);
                }
              }}
              className="space-y-3"
            >
              <input
                type="password"
                inputMode="numeric"
                autoFocus
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                placeholder="Enter PIN"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 font-mono text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              {pinError && (
                <p className="text-xs font-medium text-red-700">
                  Incorrect PIN. Please try again.
                </p>
              )}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                >
                  Unlock Staff View
                </button>
              </div>
            </form>
          </section>
        </main>
      ) : (
        <main>
          {activeView === 'guest' && (
            <GuestView
              state={state}
              tableId={resolvedTableId}
              activeTab={guestTab}
              onSelectTab={setGuestTab}
              onDispatch={dispatch}
            />
          )}
          {activeView === 'floor' && (
            <FloorDashboard
              state={state}
              onDispatch={dispatch}
              onOpenGuestTable={handleOpenGuestTable}
            />
          )}
          {activeView === 'kds' && (
            <KitchenDisplay state={state} onDispatch={dispatch} />
          )}
          {activeView === 'admin' && (
            <MenuManager
              state={state}
              onDispatch={dispatch}
              onOpenGuestTable={handleOpenGuestTable}
            />
          )}
        </main>
      )}
    </div>
  );
}
