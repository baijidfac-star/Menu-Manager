import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bell, ChevronDown, ExternalLink, Lock } from 'lucide-react';
import type { AppView, TableSession, WaiterCallStatus } from '../types';

export type GuestSection = 'menu' | 'orders' | 'zone' | 'pay';

interface TopBarProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  isDarkShell: boolean;
  isStaffLocked?: boolean;
  onLockStaff?: () => void;
  // Guest mode props
  guestTab?: GuestSection;
  onSelectGuestTab?: (tab: GuestSection) => void;
  activeOrderCount?: number;
  waiterStatus?: WaiterCallStatus;
  onCallWaiter?: () => void;
  exitPreviewLabel?: string;
  onExitPreview?: () => void;
  // Staff mode props
  tables?: TableSession[];
  onPreviewGuestTable?: (tableId: string) => void;
}

export function TopBar({
  activeView,
  onSelectView,
  isDarkShell,
  isStaffLocked = false,
  onLockStaff,
  guestTab = 'menu',
  onSelectGuestTab,
  activeOrderCount = 0,
  waiterStatus = 'None',
  onCallWaiter,
  exitPreviewLabel = 'Back to Admin',
  onExitPreview,
  tables = [],
  onPreviewGuestTable,
}: TopBarProps) {
  const isGuest = activeView === 'guest';
  const [previewOpen, setPreviewOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!previewOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPreviewOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [previewOpen]);

  const staffNavItems: { id: Exclude<AppView, 'guest'>; label: string; shortLabel: string }[] = [
    { id: 'admin', label: 'Menu Manager', shortLabel: 'Menu' },
    { id: 'floor', label: 'Floor Map', shortLabel: 'Floor' },
    { id: 'kds', label: 'Kitchen Display', shortLabel: 'Kitchen' },
  ];

  const guestNavItems: { id: GuestSection; label: string }[] = [
    { id: 'menu', label: 'Live Menu' },
    { id: 'orders', label: activeOrderCount > 0 ? `Orders (${activeOrderCount})` : 'Orders' },
    { id: 'zone', label: 'Guest Zone' },
    { id: 'pay', label: 'Split & Pay' },
  ];

  return (
    <header
      className={`no-print sticky top-0 z-40 h-13 md:h-16 border-b transition-colors ${
        isDarkShell
          ? 'bg-[#0B1120]/95 border-slate-800 text-slate-100 backdrop-blur-md'
          : 'bg-white/95 border-slate-200 text-slate-900 backdrop-blur-md'
      }`}
    >
      <div className="max-w-7xl mx-auto h-full px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2 sm:gap-4 md:gap-8">
        {/* Zone 1: Single text element wordmark */}
        <span className="text-base md:text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
          Bistro Solis
        </span>

        {/* Zone 2: Role-specific navigation links */}
        {isStaffLocked ? (
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
            <Lock className="w-3.5 h-3.5" />
            <span>Staff Portal Locked</span>
          </div>
        ) : isGuest ? (
          <nav
            aria-label="Guest Table Sections"
            className="hidden md:flex items-center gap-7"
          >
            {guestNavItems.map((item) => {
              const isActive = guestTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectGuestTab?.(item.id)}
                  className={`relative py-2 text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded ${
                    isActive
                      ? 'text-slate-900'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-slate-900" />
                  )}
                </button>
              );
            })}
          </nav>
        ) : (
          <nav
            aria-label="Staff Workspace Views"
            className="flex items-center gap-4 md:gap-7 overflow-x-auto no-scrollbar"
          >
            {staffNavItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectView(item.id)}
                  className={`relative py-2 text-xs md:text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded ${
                    isActive
                      ? isDarkShell
                        ? 'text-white'
                        : 'text-slate-900'
                      : isDarkShell
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden">{item.shortLabel}</span>
                  {isActive && (
                    <span
                      className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${
                        isDarkShell ? 'bg-amber-400' : 'bg-slate-900'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        )}

        {/* Zone 3: Contextual actions */}
        <div className="shrink-0 flex items-center gap-2" ref={dropdownRef}>
          {isStaffLocked ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600 whitespace-nowrap">
              <Lock className="w-3.5 h-3.5" />
              <span>Locked</span>
            </span>
          ) : isGuest ? (
            <>
              {onExitPreview && (
                <button
                  type="button"
                  onClick={onExitPreview}
                  className="min-h-[38px] px-2.5 sm:px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] sm:text-xs font-semibold text-slate-800 inline-flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{exitPreviewLabel}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onCallWaiter}
                disabled={waiterStatus === 'Requested' || waiterStatus === 'Acknowledged'}
                className={`min-h-[38px] px-2.5 sm:px-4 py-1.5 md:py-2 rounded-lg text-[11px] sm:text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  waiterStatus === 'Requested'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : waiterStatus === 'Acknowledged'
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>
                  {waiterStatus === 'Requested'
                    ? 'Waiter Notified'
                    : waiterStatus === 'Acknowledged'
                    ? 'Waiter En Route'
                    : 'Call Waiter'}
                </span>
              </button>
            </>
          ) : (
            <>
              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={previewOpen}
                  onClick={() => setPreviewOpen((v) => !v)}
                  className={`min-h-[36px] px-3 md:px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    isDarkShell
                      ? 'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  <span>Preview Guest</span>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>

                {previewOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5 z-50 text-slate-900"
                  >
                    <p className="px-3 py-1.5 text-[11px] font-medium text-slate-500 border-b border-slate-100">
                      Open Guest Table Session
                    </p>
                    <div className="max-h-64 overflow-y-auto py-1">
                      {tables.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setPreviewOpen(false);
                            onPreviewGuestTable?.(t.id);
                          }}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center justify-between gap-2"
                        >
                          <span className="font-medium text-slate-900">
                            {t.label} · {t.zone}
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500">
                            <span>{t.status}</span>
                            <ExternalLink className="w-3 h-3" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {onLockStaff && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewOpen(false);
                    onLockStaff();
                  }}
                  title="Lock staff portal & require PIN"
                  aria-label="Lock staff portal"
                  className={`min-h-[36px] px-2.5 md:px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                    isDarkShell
                      ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lock</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
