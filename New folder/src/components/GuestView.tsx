import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChefHat,
  Clock,
  Flame,
  Gamepad2,
  Lock,
  Minus,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import type {
  CartItemInput,
  ClientAction,
  DealCombo,
  MenuCategory,
  MenuItem,
  OrderStatus,
  PortionSize,
  RestaurantState,
} from '../types';
import { formatCurrency, formatDealLabel, formatElapsedShort } from '../utils/format';
import { GuestZone } from './guest/GuestZone';
import { SplitAndPay } from './guest/SplitAndPay';
import type { GuestSection } from './TopBar';

interface GuestViewProps {
  state: RestaurantState;
  tableId: string;
  activeTab: GuestSection;
  onSelectTab: (tab: GuestSection) => void;
  onDispatch: (action: ClientAction) => void;
}

interface LocalCartLine {
  key: string;
  menuItemId: string;
  size: PortionSize;
  quantity: number;
  notes: string;
}

const CATEGORIES: ('All' | MenuCategory)[] = [
  'All',
  'Starters',
  'Mains',
  'Desserts',
  'Drinks',
];

const ORDER_STEPS: OrderStatus[] = [
  'Placed',
  'Sent to Kitchen',
  'Preparing',
  'Ready',
  'Served',
];

function DishImage({ src, alt, soldOut }: { src?: string; alt: string; soldOut?: boolean }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return null;
  }

  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-slate-100 mb-4 relative">
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover transition-transform duration-300 ${
          soldOut ? 'grayscale opacity-50' : 'group-hover:scale-[1.02]'
        }`}
      />
    </div>
  );
}

export function GuestView({
  state,
  tableId,
  activeTab,
  onSelectTab,
  onDispatch,
}: GuestViewProps) {
  const table =
    state.tables.find((t) => t.id.toUpperCase() === tableId.toUpperCase()) ??
    state.tables[0];

  const [category, setCategory] = useState<'All' | MenuCategory>('All');
  const [dealsOnly, setDealsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSizes, setSelectedSizes] = useState<Record<string, PortionSize>>({});
  const [cart, setCart] = useState<LocalCartLine[]>([]);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [justOrderedId, setJustOrderedId] = useState<string | null>(null);

  const tableOrders = useMemo(
    () => state.orders.filter((o) => o.tableId === table.id),
    [state.orders, table.id]
  );

  const unsettledOrders = useMemo(
    () => tableOrders.filter((o) => !o.settled),
    [tableOrders]
  );

  const activeOrderCount = unsettledOrders.filter((o) => o.status !== 'Served').length;

  const filteredMenu = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.menu.filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (dealsOnly && !item.dealTag) return false;
      if (q) {
        const hay = `${item.name} ${item.description} ${item.allergens.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state.menu, category, dealsOnly, searchQuery]);

  const getSelectedSize = (item: MenuItem): PortionSize => {
    if (selectedSizes[item.id]) return selectedSizes[item.id];
    const medium = item.sizes.find((s) => s.size === 'M');
    return medium ? 'M' : item.sizes[0].size;
  };

  const getItemUnitPrice = (item: MenuItem, size: PortionSize) => {
    const opt = item.sizes.find((s) => s.size === size) ?? item.sizes[0];
    return Math.max(1, item.basePrice + opt.priceDelta);
  };

  const addToCart = (menuItemId: string, size: PortionSize, delta = 1) => {
    const menuItem = state.menu.find((m) => m.id === menuItemId);
    if (delta > 0 && (!menuItem || !menuItem.available)) return;

    const key = `${menuItemId}:${size}`;
    setCart((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing) {
        const nextQty = existing.quantity + delta;
        if (nextQty <= 0) {
          return prev.filter((c) => c.key !== key);
        }
        return prev.map((c) => (c.key === key ? { ...c, quantity: nextQty } : c));
      }
      if (delta <= 0) return prev;
      return [...prev, { key, menuItemId, size, quantity: delta, notes: '' }];
    });
  };

  const isDealAvailable = (deal: DealCombo) =>
    deal.menuItemIds.every((id) => {
      const item = state.menu.find((m) => m.id === id);
      return Boolean(item && item.available);
    });

  const addComboToCart = (deal: DealCombo) => {
    if (!isDealAvailable(deal)) return;
    deal.menuItemIds.forEach((menuItemId) => {
      const item = state.menu.find((m) => m.id === menuItemId);
      if (item && item.available) {
        const defaultSize = item.sizes.find((s) => s.size === 'M')?.size ?? item.sizes[0].size;
        addToCart(item.id, defaultSize, 1);
      }
    });
  };

  const updateCartNote = (key: string, notes: string) => {
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, notes } : c)));
  };

  const cartSummary = useMemo(() => {
    let count = 0;
    let gross = 0;
    let savings = 0;
    let hasUnavailable = false;

    const detailed = cart
      .map((line) => {
        const item = state.menu.find((m) => m.id === line.menuItemId);
        if (!item) return null;
        if (!item.available) hasUnavailable = true;
        const unitPrice = getItemUnitPrice(item, line.size);
        const unitDiscount = item.dealDiscount ?? 0;
        count += line.quantity;
        gross += unitPrice * line.quantity;
        savings += unitDiscount * line.quantity;
        return {
          ...line,
          item,
          unitPrice,
          unitDiscount,
          lineTotal: Math.max(0, (unitPrice - unitDiscount) * line.quantity),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      count,
      gross,
      savings,
      net: Math.max(0, gross - savings),
      hasUnavailable,
      detailed,
    };
  }, [cart, state.menu]);

  const handlePlaceOrder = () => {
    if (cartSummary.detailed.length === 0 || cartSummary.hasUnavailable) return;
    const payloadItems: CartItemInput[] = cartSummary.detailed.map((line) => ({
      menuItemId: line.menuItemId,
      size: line.size,
      quantity: line.quantity,
      notes: line.notes,
    }));
    const clientOrderId = `co-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    onDispatch({
      type: 'order:place',
      payload: {
        clientOrderId,
        tableId: table.id,
        items: payloadItems,
      },
    });
    setCart([]);
    setMobileCartOpen(false);
    setJustOrderedId(clientOrderId);
    onSelectTab('orders');
    window.setTimeout(() => setJustOrderedId(null), 3500);
  };

  const renderSpiceLabel = (level: number) => {
    if (level === 0) return null;
    const text = level === 1 ? 'Mild' : level === 2 ? 'Medium Spice' : 'Hot';
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
        <span className="inline-flex items-center">
          {Array.from({ length: level }).map((_, i) => (
            <Flame key={i} className="w-3.5 h-3.5 fill-amber-500 text-amber-600" />
          ))}
        </span>
        <span>{text}</span>
      </span>
    );
  };

  const renderCartContent = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <p className="text-xs text-slate-500">Locked to {table.label}</p>
          <h3 className="text-base font-bold text-slate-900">Your Table Cart</h3>
        </div>
        {cartSummary.count > 0 && (
          <button
            type="button"
            onClick={() => setCart([])}
            className="text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            Clear
          </button>
        )}
      </div>

      {cartSummary.detailed.length === 0 ? (
        <div className="py-8 text-center space-y-2">
          <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-700">Cart is empty</p>
          <p className="text-xs text-slate-500">
            Select portion sizes and add dishes to order directly from {table.label}.
          </p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto pr-1">
            {cartSummary.detailed.map((line) => (
              <div key={line.key} className="py-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 leading-snug">
                      {line.item.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Size {line.size} · {line.item.station}
                    </p>
                    {!line.item.available && (
                      <p className="text-xs font-semibold text-red-700 mt-0.5">
                        Sold out — remove to place order
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums shrink-0">
                    {formatCurrency(line.lineTotal, state.currency)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={line.notes}
                    onChange={(e) => updateCartNote(line.key, e.target.value)}
                    placeholder="Add kitchen note..."
                    className="flex-1 min-h-[36px] px-2.5 text-xs rounded-lg border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50 shrink-0">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${line.item.name}`}
                      onClick={() => addToCart(line.menuItemId, line.size, -1)}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-l-lg"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-7 text-center font-mono text-xs font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      disabled={!line.item.available}
                      aria-label={`Increase quantity of ${line.item.name}`}
                      onClick={() => addToCart(line.menuItemId, line.size, 1)}
                      className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 rounded-r-lg"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 pt-3 space-y-1.5 text-sm">
            {cartSummary.savings > 0 && (
              <div className="flex justify-between text-xs text-emerald-700">
                <span>Menu Deal Savings</span>
                <span className="font-mono tabular-nums">
                  -{formatCurrency(cartSummary.savings, state.currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-900">
              <span>Order Total</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(cartSummary.net, state.currency)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={cartSummary.hasUnavailable}
            onClick={handlePlaceOrder}
            className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <span>Send Order · {table.label}</span>
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="pb-24 md:pb-12">
      {/* Locked Table Session Bar (No Table Switching in Guest Mode) */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-slate-600">
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-900">{table.label}</span>
            <span aria-hidden="true">·</span>
            <span>{table.zone}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{table.seats} seats</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-amber-700 tabular-nums">
              {table.rewardsPoints} pts
            </span>
          </div>
          <span className="text-xs text-slate-500">
            Instant Table Session · Free Wi-Fi in Guest Zone
          </span>
        </div>

        {/* Live Waiter Call Status Feedback Strip */}
        {table.waiterCall.status !== 'None' && (
          <div
            className={`border-t px-4 md:px-6 py-2.5 text-xs ${
              table.waiterCall.status === 'Arrived'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : table.waiterCall.status === 'Acknowledged'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-medium">
                {table.waiterCall.status === 'Arrived' && (
                  <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                )}
                <span>
                  {table.waiterCall.status === 'Requested' &&
                    `Floor staff alerted for ${table.label}. Someone will be right with you.`}
                  {table.waiterCall.status === 'Acknowledged' &&
                    `A server acknowledged your request and is walking to ${table.label} now.`}
                  {table.waiterCall.status === 'Arrived' &&
                    `Your server has arrived at ${table.label}.`}
                </span>
              </div>
              {table.waiterCall.status === 'Arrived' && (
                <button
                  type="button"
                  onClick={() =>
                    onDispatch({
                      type: 'waiter:respond',
                      payload: { tableId: table.id, action: 'clear' },
                    })
                  }
                  className="text-xs font-semibold underline hover:no-underline whitespace-nowrap"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 pt-6">
        {activeTab === 'menu' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Menu Column */}
            <div className="lg:col-span-8 space-y-6">
              {/* Active Combos & Deals */}
              {state.deals.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      <span>Table Deals & Combos</span>
                    </h2>
                    <span className="text-xs text-slate-500">Tap to add bundle</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {state.deals.map((deal) => {
                      const available = isDealAvailable(deal);
                      return (
                        <div
                          key={deal.id}
                          className={`bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4 ${
                            !available ? 'opacity-60' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-amber-700">
                              Save {formatCurrency(Math.max(0, deal.regularPrice - deal.bundlePrice), state.currency)} · {deal.stationSummary}
                            </p>
                            <h3 className="text-sm font-bold text-slate-900 mt-0.5 truncate">
                              {deal.title}
                            </h3>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                              {deal.subtitle}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={!available}
                            onClick={() => addComboToCart(deal)}
                            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 text-amber-900 border border-amber-200 text-xs font-semibold whitespace-nowrap shrink-0 tabular-nums transition-colors"
                          >
                            {available ? `Add ${formatCurrency(deal.bundlePrice, state.currency)}` : 'Sold Out'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Category Filter & Search */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        category === cat
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDealsOnly((v) => !v)}
                    className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      dealsOnly
                        ? 'bg-amber-600 text-white'
                        : 'bg-white border border-slate-200 text-amber-800 hover:bg-amber-50'
                    }`}
                  >
                    Deals Only
                  </button>
                </div>

                <div className="relative sm:w-56 shrink-0">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dishes or allergens..."
                    className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Dish Cards Grid */}
              {filteredMenu.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-2">
                  <p className="text-sm font-semibold text-slate-900">No dishes match your filter</p>
                  <button
                    type="button"
                    onClick={() => {
                      setCategory('All');
                      setDealsOnly(false);
                      setSearchQuery('');
                    }}
                    className="text-xs font-semibold text-amber-700 hover:underline"
                  >
                    Reset menu filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredMenu.map((item) => {
                    const activeSize = getSelectedSize(item);
                    const unitPrice = getItemUnitPrice(item, activeSize);
                    const discounted = Math.max(1, unitPrice - (item.dealDiscount ?? 0));
                    const cartKey = `${item.id}:${activeSize}`;
                    const inCartQty =
                      cart.find((c) => c.key === cartKey)?.quantity ?? 0;

                    return (
                      <article
                        key={item.id}
                        className={`group bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between ${
                          !item.available ? 'opacity-75 bg-slate-50/70' : ''
                        }`}
                      >
                        <div>
                          <DishImage
                            src={item.image}
                            alt={item.name}
                            soldOut={!item.available}
                          />

                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                            <span className="truncate">
                              {item.category} · {item.station} · {item.prepMinutes} min
                            </span>
                            {!item.available ? (
                              <span className="font-semibold text-red-700 whitespace-nowrap shrink-0">
                                Sold Out
                              </span>
                            ) : (
                              item.dealTag && (
                                <span className="font-semibold text-amber-700 whitespace-nowrap shrink-0">
                                  {formatDealLabel(item.dealTag, item.dealDiscount, state.currency)}
                                </span>
                              )
                            )}
                          </div>

                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-base font-bold text-slate-900 leading-snug">
                              {item.name}
                            </h3>
                            <div className="text-right shrink-0">
                              <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
                                {formatCurrency(discounted, state.currency)}
                              </span>
                              {item.dealDiscount && (
                                <span className="block font-mono text-[11px] text-slate-400 line-through tabular-nums">
                                  {formatCurrency(unitPrice, state.currency)}
                                </span>
                              )}
                            </div>
                          </div>

                          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                            {item.description}
                          </p>

                          <div className="mt-3 space-y-1">
                            {renderSpiceLabel(item.spiceLevel)}
                            {item.allergens.length > 0 && (
                              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span>{item.allergens.join(' · ')}</span>
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 space-y-3">
                          <div className="grid grid-cols-3 gap-1.5">
                            {item.sizes.map((opt) => {
                              const isSelected = activeSize === opt.size;
                              return (
                                <button
                                  key={opt.size}
                                  type="button"
                                  disabled={!item.available}
                                  onClick={() =>
                                    setSelectedSizes((prev) => ({
                                      ...prev,
                                      [item.id]: opt.size,
                                    }))
                                  }
                                  className={`min-h-[40px] px-2 py-1.5 rounded-lg text-xs border transition-colors flex flex-col items-center justify-center disabled:opacity-50 ${
                                    isSelected
                                      ? 'bg-slate-900 text-white border-slate-900'
                                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  <span className="font-bold">{opt.size}</span>
                                  <span
                                    className={`text-[10px] ${
                                      isSelected ? 'text-slate-300' : 'text-slate-500'
                                    }`}
                                  >
                                    {opt.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {!item.available ? (
                            <div className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 text-xs font-semibold flex items-center justify-center">
                              Currently Sold Out
                            </div>
                          ) : inCartQty > 0 ? (
                            <div className="flex items-center justify-between gap-2 bg-slate-900 text-white rounded-xl p-1">
                              <button
                                type="button"
                                aria-label={`Remove one ${item.name}`}
                                onClick={() => addToCart(item.id, activeSize, -1)}
                                className="min-w-[44px] min-h-[40px] flex items-center justify-center rounded-lg hover:bg-slate-800"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <span className="font-mono text-xs font-bold tabular-nums">
                                {inCartQty} in cart ({activeSize})
                              </span>
                              <button
                                type="button"
                                aria-label={`Add one more ${item.name}`}
                                onClick={() => addToCart(item.id, activeSize, 1)}
                                className="min-w-[44px] min-h-[40px] flex items-center justify-center rounded-lg hover:bg-slate-800"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => addToCart(item.id, activeSize, 1)}
                              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Add {activeSize} · {formatCurrency(discounted, state.currency)}</span>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Desktop Sticky Cart Panel */}
            <aside className="hidden lg:block lg:col-span-4 sticky top-24 bg-white border border-slate-200 rounded-2xl p-5">
              {renderCartContent()}
            </aside>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="max-w-3xl mx-auto space-y-5">
            {justOrderedId && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-sm font-medium">
                  <Check className="w-5 h-5 text-emerald-700 shrink-0" />
                  <span>
                    Order sent for {table.label}! Floor staff will dispatch it to the kitchen momentarily.
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Live Orders · {table.label}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time updates from floor dispatch and kitchen stations
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectTab('menu')}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Add More Dishes
              </button>
            </div>

            {tableOrders.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
                <ChefHat className="w-9 h-9 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-900">No orders yet at {table.label}</p>
                <p className="text-xs text-slate-500">
                  Explore the menu to place your first table-side order.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {tableOrders.map((order) => {
                  const stepIdx = ORDER_STEPS.indexOf(order.status);
                  return (
                    <section
                      key={order.id}
                      className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-bold text-slate-900">
                            {order.id}
                          </span>
                          <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatElapsedShort(order.createdAt, Date.now())}</span>
                          </span>
                          {order.settled && (
                            <span className="text-xs font-medium text-emerald-700">
                              · Settled
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-xs font-bold ${
                            order.status === 'Served' || order.status === 'Ready'
                              ? 'text-emerald-700'
                              : order.status === 'Preparing'
                              ? 'text-amber-700'
                              : 'text-slate-700'
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-5 gap-1.5">
                        {ORDER_STEPS.map((step, i) => {
                          const reached = i <= stepIdx;
                          return (
                            <div key={step} className="space-y-1">
                              <div
                                className={`h-1.5 rounded-full transition-colors ${
                                  reached ? 'bg-slate-900' : 'bg-slate-200'
                                }`}
                              />
                              <span
                                className={`block text-[10px] truncate ${
                                  reached
                                    ? 'font-semibold text-slate-900'
                                    : 'text-slate-400'
                                }`}
                              >
                                {step}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="divide-y divide-slate-100">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="py-2.5 flex items-center justify-between gap-3 text-sm"
                          >
                            <div className="min-w-0">
                              <span className="font-mono text-xs text-slate-500 mr-2 tabular-nums">
                                {item.quantity}x
                              </span>
                              <span className="font-medium text-slate-900">{item.name}</span>
                              <span className="text-xs text-slate-500 ml-1.5">
                                · {item.size} · {item.station}
                              </span>
                              {item.notes && (
                                <p className="text-xs text-amber-700 mt-0.5">
                                  Note: {item.notes}
                                </p>
                              )}
                            </div>
                            <span
                              className={`text-xs font-semibold shrink-0 ${
                                item.itemStatus === 'Ready'
                                  ? 'text-emerald-700'
                                  : item.itemStatus === 'Preparing'
                                  ? 'text-amber-700'
                                  : 'text-slate-500'
                              }`}
                            >
                              {item.itemStatus}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'zone' && (
          <GuestZone
            table={table}
            wifi={state.wifi}
            currency={state.currency}
            onDispatch={onDispatch}
          />
        )}

        {activeTab === 'pay' && (
          <SplitAndPay
            table={table}
            unsettledOrders={unsettledOrders}
            currency={state.currency}
            onDispatch={onDispatch}
            onBackToMenu={() => onSelectTab('menu')}
          />
        )}
      </div>

      {/* Quiet Hospitality Footer */}
      <footer className="max-w-7xl mx-auto px-4 md:px-6 mt-14 pt-6 border-t border-slate-200 flex items-center justify-between text-xs text-slate-400">
        <span>Bistro Solis · {table.label}</span>
        <span>Table-Side Dining</span>
      </footer>

      {/* Mobile Floating Cart Trigger */}
      {activeTab === 'menu' && cartSummary.count > 0 && !mobileCartOpen && (
        <div className="lg:hidden fixed bottom-16 left-4 right-4 z-30">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-900 text-white shadow-lg flex items-center justify-between text-xs font-semibold"
          >
            <span className="inline-flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              <span>View Cart ({cartSummary.count} items)</span>
            </span>
            <span className="font-mono tabular-nums">{formatCurrency(cartSummary.net, state.currency)}</span>
          </button>
        </div>
      )}

      {/* Mobile Cart Bottom Sheet */}
      {mobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end">
          <div className="w-full bg-white rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto mb-3" />
            <div className="flex justify-end mb-1">
              <button
                type="button"
                aria-label="Close cart"
                onClick={() => setMobileCartOpen(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderCartContent()}
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Guest Table Sections"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-14 bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-4 items-center"
      >
        {(
          [
            { id: 'menu', label: 'Menu', icon: UtensilsCrossed },
            {
              id: 'orders',
              label: activeOrderCount > 0 ? `Orders (${activeOrderCount})` : 'Orders',
              icon: ChefHat,
            },
            { id: 'zone', label: 'Guest Zone', icon: Gamepad2 },
            { id: 'pay', label: 'Pay Bill', icon: Receipt },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`h-full flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? 'text-slate-900 font-semibold' : 'text-slate-500'
              }`}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-amber-600' : ''}`} />
              <span className="text-[10px] tracking-tight whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
