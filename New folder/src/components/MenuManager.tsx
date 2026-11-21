import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Coins,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Lock,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  ClientAction,
  DealCombo,
  MenuCategory,
  MenuItem,
  RestaurantState,
  SpiceLevel,
  Station,
} from '../types';
import {
  formatCurrency,
  formatDealLabel,
  SUPPORTED_CURRENCIES,
} from '../utils/format';
import { AccountingDashboard } from './AccountingDashboard';

interface MenuManagerProps {
  state: RestaurantState;
  onDispatch: (action: ClientAction) => void;
  onOpenGuestTable: (tableId: string) => void;
}

type AdminTab = 'menu' | 'accounting' | 'qr';

const IMAGE_PRESETS: { label: string; url: string }[] = [
  { label: 'None (Text Card)', url: '' },
  {
    label: 'Truffle Arancini',
    url: '/src/assets/images/dish_truffle_arancini_1795213821474.jpg',
  },
  {
    label: 'Prime Ribeye',
    url: '/src/assets/images/dish_charred_ribeye_1795213820922.jpg',
  },
  {
    label: 'Spicy Rigatoni',
    url: '/src/assets/images/dish_spicy_rigatoni_1795213820714.jpg',
  },
  {
    label: 'Espresso Tiramisu',
    url: '/src/assets/images/dish_yuzu_tiramisu_1795213822120.jpg',
  },
  {
    label: 'Citrus Spritz',
    url: '/src/assets/images/dish_citrus_spritz_1795213820204.jpg',
  },
];

const ALLERGEN_OPTIONS = [
  'Contains dairy',
  'Contains nuts',
  'Contains egg',
  'Contains gluten',
  'Contains shellfish',
  'Contains sesame',
];

interface DishFormState {
  id?: string;
  name: string;
  description: string;
  category: MenuCategory;
  station: Station;
  basePrice: string;
  costPrice: string;
  prepMinutes: string;
  spiceLevel: SpiceLevel;
  allergens: string[];
  customAllergen: string;
  image: string;
  dealTag: string;
  dealDiscount: string;
  available: boolean;
  smallLabel: string;
  smallDelta: string;
  medLabel: string;
  medDelta: string;
  largeLabel: string;
  largeDelta: string;
}

function createEmptyDishForm(): DishFormState {
  return {
    name: '',
    description: '',
    category: 'Mains',
    station: 'Grill',
    basePrice: '22',
    costPrice: '',
    prepMinutes: '10',
    spiceLevel: 0,
    allergens: [],
    customAllergen: '',
    image: '',
    dealTag: '',
    dealDiscount: '',
    available: true,
    smallLabel: 'Small',
    smallDelta: '-3',
    medLabel: 'Regular',
    medDelta: '0',
    largeLabel: 'Large',
    largeDelta: '6',
  };
}

function dishToForm(item: MenuItem): DishFormState {
  const s = item.sizes.find((x) => x.size === 'S') ?? item.sizes[0];
  const m = item.sizes.find((x) => x.size === 'M') ?? item.sizes[1] ?? item.sizes[0];
  const l = item.sizes.find((x) => x.size === 'L') ?? item.sizes[2] ?? item.sizes[0];
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    station: item.station,
    basePrice: String(item.basePrice),
    costPrice: item.costPrice !== undefined ? String(item.costPrice) : '',
    prepMinutes: String(item.prepMinutes),
    spiceLevel: item.spiceLevel,
    allergens: [...item.allergens],
    customAllergen: '',
    image: item.image ?? '',
    dealTag: item.dealTag ?? '',
    dealDiscount: item.dealDiscount ? String(item.dealDiscount) : '',
    available: item.available,
    smallLabel: s?.label ?? 'Small',
    smallDelta: String(s?.priceDelta ?? -2),
    medLabel: m?.label ?? 'Regular',
    medDelta: String(m?.priceDelta ?? 0),
    largeLabel: l?.label ?? 'Large',
    largeDelta: String(l?.priceDelta ?? 6),
  };
}

export function MenuManager({
  state,
  onDispatch,
  onOpenGuestTable,
}: MenuManagerProps) {
  const [adminTab, setAdminTab] = useState<AdminTab>('menu');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | MenuCategory>('All');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'soldout'>('all');

  // Dish modal state
  const [editorOpen, setEditorOpen] = useState(false);
  const [dishForm, setDishForm] = useState<DishFormState>(createEmptyDishForm);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Deal editor state
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [dealTitle, setDealTitle] = useState('');
  const [dealSubtitle, setDealSubtitle] = useState('');
  const [dealPrice, setDealPrice] = useState('24');
  const [dealItemIds, setDealItemIds] = useState<string[]>([]);

  // QR generator state
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const [copiedTableId, setCopiedTableId] = useState<string | null>(null);
  const [printTableId, setPrintTableId] = useState<string | null>(null);
  const [printModalTableId, setPrintModalTableId] = useState<string | null>(null);
  const [newTableId, setNewTableId] = useState('');
  const [newTableLabel, setNewTableLabel] = useState('');
  const [newTableZone, setNewTableZone] = useState('Patio');
  const [newTableSeats, setNewTableSeats] = useState('4');

  // Staff settings & demo reset
  const [pinDraft, setPinDraft] = useState(state.staffPin);
  const [pinSaved, setPinSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setPinDraft(state.staffPin);
  }, [state.staffPin]);

  // Currency selector state
  const isPresetCurrency = SUPPORTED_CURRENCIES.some(
    (c) => c.code === state.currency.code && c.symbol === state.currency.symbol
  );
  const [customCurrencyMode, setCustomCurrencyMode] = useState(!isPresetCurrency);
  const [customCurrencyCode, setCustomCurrencyCode] = useState(state.currency.code);
  const [customCurrencySymbol, setCustomCurrencySymbol] = useState(state.currency.symbol);
  const [customCurrencyName, setCustomCurrencyName] = useState(state.currency.name);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const getTableUrl = (tableId: string) => `${origin}/?table=${tableId}`;

  useEffect(() => {
    let cancelled = false;
    async function generateAll() {
      const next: Record<string, string> = {};
      for (const table of state.tables) {
        const url = `${window.location.origin}/?table=${table.id}`;
        try {
          next[table.id] = await QRCode.toDataURL(url, {
            width: 512,
            margin: 2,
            errorCorrectionLevel: 'M',
            color: { dark: '#0F172A', light: '#FFFFFF' },
          });
        } catch {
          // ignore
        }
      }
      if (!cancelled) setQrDataUrls(next);
    }
    generateAll();
    return () => {
      cancelled = true;
    };
  }, [state.tables]);

  const filteredDishes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.menu.filter((item) => {
      if (categoryFilter !== 'All' && item.category !== categoryFilter) return false;
      if (availabilityFilter === 'available' && !item.available) return false;
      if (availabilityFilter === 'soldout' && item.available) return false;
      if (q) {
        const hay = `${item.name} ${item.category} ${item.station} ${item.allergens.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state.menu, categoryFilter, availabilityFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = state.menu.length;
    const available = state.menu.filter((m) => m.available).length;
    const soldOut = total - available;
    return { total, available, soldOut, deals: state.deals.length };
  }, [state.menu, state.deals.length]);

  const openAddDish = () => {
    setDishForm(createEmptyDishForm());
    setEditorOpen(true);
  };

  const openEditDish = (item: MenuItem) => {
    setDishForm(dishToForm(item));
    setEditorOpen(true);
  };

  const handleSaveDish = (e: React.FormEvent) => {
    e.preventDefault();
    const basePrice = Math.max(1, Number(dishForm.basePrice) || 10);
    const trimmedCost = dishForm.costPrice.trim();
    const costPrice =
      trimmedCost !== '' && Number.isFinite(Number(trimmedCost))
        ? Math.max(0, Number(trimmedCost))
        : undefined;
    const prepMinutes = Math.max(1, Math.round(Number(dishForm.prepMinutes) || 10));
    const dealDiscount = dishForm.dealDiscount ? Math.max(0, Number(dishForm.dealDiscount)) : undefined;

    const sizes = [
      {
        size: 'S' as const,
        label: dishForm.smallLabel.trim() || 'Small',
        priceDelta: Number(dishForm.smallDelta) || 0,
      },
      {
        size: 'M' as const,
        label: dishForm.medLabel.trim() || 'Regular',
        priceDelta: Number(dishForm.medDelta) || 0,
      },
      {
        size: 'L' as const,
        label: dishForm.largeLabel.trim() || 'Large',
        priceDelta: Number(dishForm.largeDelta) || 0,
      },
    ];

    const payload = {
      name: dishForm.name.trim(),
      description: dishForm.description.trim(),
      category: dishForm.category,
      station: dishForm.station,
      basePrice,
      costPrice,
      prepMinutes,
      spiceLevel: dishForm.spiceLevel,
      allergens: dishForm.allergens,
      image: dishForm.image.trim() || undefined,
      dealTag: dishForm.dealTag.trim() || undefined,
      dealDiscount,
      available: dishForm.available,
      sizes,
    };

    if (dishForm.id) {
      onDispatch({
        type: 'menu:update',
        payload: { id: dishForm.id, updates: payload },
      });
    } else {
      onDispatch({
        type: 'menu:add',
        payload: { item: payload },
      });
    }
    setEditorOpen(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 1_200_000) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDishForm((prev) => ({ ...prev, image: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const openAddDeal = () => {
    setEditingDealId(null);
    setDealTitle('');
    setDealSubtitle('');
    setDealPrice('24');
    setDealItemIds(state.menu.slice(0, 2).map((m) => m.id));
    setDealModalOpen(true);
  };

  const openEditDeal = (deal: DealCombo) => {
    setEditingDealId(deal.id);
    setDealTitle(deal.title);
    setDealSubtitle(deal.subtitle);
    setDealPrice(String(deal.bundlePrice));
    setDealItemIds([...deal.menuItemIds]);
    setDealModalOpen(true);
  };

  const handleSaveDeal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealTitle.trim() || dealItemIds.length === 0) return;
    const regularPrice = dealItemIds.reduce((sum, id) => {
      const m = state.menu.find((x) => x.id === id);
      return sum + (m ? m.basePrice : 0);
    }, 0);
    const stationSummary = Array.from(
      new Set(
        dealItemIds
          .map((id) => state.menu.find((x) => x.id === id)?.station)
          .filter(Boolean)
      )
    ).join(' + ');

    const bundlePrice = Math.max(1, Number(dealPrice) || 15);

    if (editingDealId) {
      onDispatch({
        type: 'deal:update',
        payload: {
          id: editingDealId,
          updates: {
            title: dealTitle.trim(),
            subtitle: dealSubtitle.trim() || 'Curated table bundle',
            menuItemIds: dealItemIds,
            bundlePrice,
            regularPrice,
            stationSummary,
          },
        },
      });
    } else {
      onDispatch({
        type: 'deal:add',
        payload: {
          deal: {
            title: dealTitle.trim(),
            subtitle: dealSubtitle.trim() || 'Curated table bundle',
            menuItemIds: dealItemIds,
            bundlePrice,
            regularPrice,
            stationSummary,
          },
        },
      });
    }
    setDealModalOpen(false);
  };

  const handleCopyTableUrl = async (tableId: string) => {
    const url = getTableUrl(tableId);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopiedTableId(tableId);
    window.setTimeout(() => setCopiedTableId(null), 1800);
  };

  const handleDownloadQr = (tableId: string) => {
    const dataUrl = qrDataUrls[tableId];
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `bistro-solis-${tableId}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrintQr = async (tableId: string) => {
    const table = state.tables.find((t) => t.id === tableId);
    if (!table) return;

    const tableUrl = getTableUrl(table.id);
    if (!qrDataUrls[table.id]) {
      try {
        const qrSrc = await QRCode.toDataURL(tableUrl, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: 'M',
          color: { dark: '#0F172A', light: '#FFFFFF' },
        });
        setQrDataUrls((prev) => ({ ...prev, [table.id]: qrSrc }));
      } catch {
        return;
      }
    }

    setPrintTableId(table.id);
    setPrintModalTableId(table.id);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print();
      });
    });
  };

  const handleAddTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableId.trim()) return;
    onDispatch({
      type: 'table:add',
      payload: {
        id: newTableId.trim(),
        label: newTableLabel.trim() || `Table ${newTableId.trim().toUpperCase()}`,
        zone: newTableZone.trim() || 'Main Hall',
        seats: Number(newTableSeats) || 4,
      },
    });
    setNewTableId('');
    setNewTableLabel('');
  };

  const printTable = state.tables.find((t) => t.id === printTableId) ?? null;
  const printModalTable = state.tables.find((t) => t.id === printModalTableId) ?? null;

  return (
    <>
      <div className="no-print max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* Header & Sub-Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Menu Manager & Table QR Hub
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Changes persist on the server and sync immediately to all guest tables
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex p-1 bg-slate-200/70 rounded-xl">
              <button
                type="button"
                onClick={() => setAdminTab('menu')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  adminTab === 'menu'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Menu & Deals
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('accounting')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  adminTab === 'accounting'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sales & Accounting
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('qr')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  adminTab === 'qr'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Table QR & Settings
              </button>
            </div>

            {adminTab === 'menu' && (
              <button
                type="button"
                onClick={openAddDish}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Dish</span>
              </button>
            )}
          </div>
        </div>

        {adminTab === 'accounting' && (
          <AccountingDashboard state={state} onDispatch={onDispatch} />
        )}

        {adminTab === 'menu' && (
          <div className="space-y-6">
            {/* Summary Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <span className="text-xs font-medium text-slate-500">Total Dishes</span>
                <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                  {stats.total}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <span className="text-xs font-medium text-slate-500">Available</span>
                <p className="text-2xl font-bold text-emerald-700 tabular-nums mt-1">
                  {stats.available}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <span className="text-xs font-medium text-slate-500">Sold Out</span>
                <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">
                  {stats.soldOut}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <span className="text-xs font-medium text-slate-500">Active Combos</span>
                <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
                  {stats.deals}
                </p>
              </div>
            </div>

            {/* Menu Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {(['All', 'Starters', 'Mains', 'Desserts', 'Drinks'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                      categoryFilter === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                <div className="inline-flex p-1 bg-slate-200/70 rounded-xl ml-1">
                  {(
                    [
                      { id: 'all', label: 'All Stock' },
                      { id: 'available', label: 'Available' },
                      { id: 'soldout', label: 'Sold Out' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAvailabilityFilter(f.id)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        availabilityFilter === f.id
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter menu items..."
                  className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Menu Data Table / Rows */}
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {filteredDishes.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No menu items match the selected filter.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredDishes.map((item) => (
                    <div
                      key={item.id}
                      className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
                        !item.available ? 'bg-slate-50/80' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start gap-3.5 min-w-0">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className={`w-16 h-12 rounded-xl object-cover shrink-0 border border-slate-200 ${
                              !item.available ? 'grayscale opacity-50' : ''
                            }`}
                          />
                        ) : (
                          <div className="w-16 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-mono text-slate-400 shrink-0">
                            {item.station}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-bold text-slate-900">
                              {item.name}
                            </h3>
                            <span className="text-xs text-slate-500">
                              {item.category} · {item.station} · {item.prepMinutes}m
                            </span>
                            {item.dealTag && (
                              <span className="text-xs font-medium text-amber-700">
                                · {formatDealLabel(item.dealTag, item.dealDiscount, state.currency)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                            {item.description}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                            {item.costPrice !== undefined
                              ? `Cost ${formatCurrency(item.costPrice, state.currency)} · Margin ${formatCurrency(item.basePrice - item.costPrice, state.currency)}`
                              : 'Cost price not set'}
                            {item.allergens.length > 0 ? ` · ${item.allergens.join(' · ')}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 shrink-0">
                        {/* Quick Price Stepper */}
                        <div className="inline-flex items-center border border-slate-200 rounded-xl bg-white">
                          <button
                            type="button"
                            aria-label={`Decrease price of ${item.name} by 1`}
                            disabled={item.basePrice <= 1}
                            onClick={() =>
                              onDispatch({
                                type: 'menu:update',
                                payload: {
                                  id: item.id,
                                  updates: {
                                    basePrice: Math.max(1, item.basePrice - 1),
                                  },
                                },
                              })
                            }
                            className="min-w-[44px] min-h-[38px] px-2 flex items-center justify-center font-mono text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-30 rounded-l-xl"
                          >
                            -{state.currency.symbol}1
                          </button>
                          <span className="px-3 font-mono text-sm font-bold text-slate-900 tabular-nums border-x border-slate-100">
                            {formatCurrency(item.basePrice, state.currency)}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase price of ${item.name} by 1`}
                            onClick={() =>
                              onDispatch({
                                type: 'menu:update',
                                payload: {
                                  id: item.id,
                                  updates: { basePrice: item.basePrice + 1 },
                                },
                              })
                            }
                            className="min-w-[44px] min-h-[38px] px-2 flex items-center justify-center font-mono text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-r-xl"
                          >
                            +{state.currency.symbol}1
                          </button>
                        </div>

                        {/* Availability Toggle */}
                        <button
                          type="button"
                          onClick={() =>
                            onDispatch({
                              type: 'menu:toggleAvailability',
                              payload: { id: item.id, available: !item.available },
                            })
                          }
                          className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap ${
                            item.available
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                          }`}
                        >
                          {item.available ? 'Available' : 'Sold Out'}
                        </button>

                        {/* Edit Dish */}
                        <button
                          type="button"
                          onClick={() => openEditDish(item)}
                          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>

                        {/* Delete Dish with inline confirm */}
                        {confirmDeleteId === item.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDispatch({
                                  type: 'menu:delete',
                                  payload: { id: item.id },
                                });
                                setConfirmDeleteId(null);
                              }}
                              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Delete ${item.name}`}
                            onClick={() => setConfirmDeleteId(item.id)}
                            className="min-w-[38px] min-h-[38px] rounded-xl border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Deals & Combos Manager */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>Deals & Combos Manager</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Adjust combo bundle pricing or featured dish pairings
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openAddDeal}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 hover:bg-slate-50 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Combo</span>
                </button>
              </div>

              {state.deals.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No active combo deals configured.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {state.deals.map((deal) => (
                    <div
                      key={deal.id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-amber-700 tabular-nums">
                          Bundle {formatCurrency(deal.bundlePrice, state.currency)} (Reg. {formatCurrency(deal.regularPrice, state.currency)})
                        </p>
                        <h3 className="text-sm font-bold text-slate-900 mt-0.5">
                          {deal.title}
                        </h3>
                        <p className="text-xs text-slate-600 mt-0.5">{deal.subtitle}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditDeal(deal)}
                          className="min-h-[36px] px-3 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${deal.title}`}
                          onClick={() =>
                            onDispatch({
                              type: 'deal:delete',
                              payload: { id: deal.id },
                            })
                          }
                          className="min-w-[36px] min-h-[36px] rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-red-600 flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {adminTab === 'qr' && (
          <div className="space-y-6">
            {/* Active Currency Selector Card */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-600" />
                    <span>Restaurant Currency</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Active across Guest Menu, Deals, Cart, Split &amp; Pay, Floor Map, and Menu Manager
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    aria-label="Select Restaurant Currency"
                    value={customCurrencyMode ? 'CUSTOM' : state.currency.code}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'CUSTOM') {
                        setCustomCurrencyMode(true);
                        setCustomCurrencyCode(state.currency.code);
                        setCustomCurrencySymbol(state.currency.symbol);
                        setCustomCurrencyName(state.currency.name);
                        return;
                      }
                      const found = SUPPORTED_CURRENCIES.find((c) => c.code === val);
                      if (found) {
                        setCustomCurrencyMode(false);
                        onDispatch({
                          type: 'settings:updateCurrency',
                          payload: { currency: found },
                        });
                      }
                    }}
                    className="min-h-[42px] pl-3.5 pr-8 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.symbol}) — {c.name}
                      </option>
                    ))}
                    <option value="CUSTOM">Custom Currency...</option>
                  </select>
                  <span className="font-mono text-xs text-slate-500 tabular-nums">
                    Preview: {formatCurrency(125, state.currency)}
                  </span>
                </div>
              </div>

              {customCurrencyMode && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!customCurrencyCode.trim() || !customCurrencySymbol.trim()) return;
                    onDispatch({
                      type: 'settings:updateCurrency',
                      payload: {
                        currency: {
                          code: customCurrencyCode.trim().toUpperCase(),
                          symbol: customCurrencySymbol.trim(),
                          name: customCurrencyName.trim() || customCurrencyCode.trim().toUpperCase(),
                        },
                      },
                    });
                  }}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100 items-end"
                >
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Currency Code *</span>
                    <input
                      type="text"
                      required
                      maxLength={8}
                      value={customCurrencyCode}
                      onChange={(e) => setCustomCurrencyCode(e.target.value)}
                      placeholder="e.g. JPY"
                      className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Symbol *</span>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      value={customCurrencySymbol}
                      onChange={(e) => setCustomCurrencySymbol(e.target.value)}
                      placeholder="e.g. ¥"
                      className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Display Name</span>
                    <input
                      type="text"
                      maxLength={48}
                      value={customCurrencyName}
                      onChange={(e) => setCustomCurrencyName(e.target.value)}
                      placeholder="e.g. Japanese Yen"
                      className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <button
                    type="submit"
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Apply Currency
                  </button>
                </form>
              )}
            </section>

            {/* Add Custom Table QR Form */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-slate-700" />
                  <span>Add Custom Table & QR Link</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Create a new table ID to generate its dedicated QR code and URL immediately
                </p>
              </div>
              <form
                onSubmit={handleAddTable}
                className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
              >
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Table ID</span>
                  <input
                    type="text"
                    required
                    value={newTableId}
                    onChange={(e) => setNewTableId(e.target.value)}
                    placeholder="e.g. T09 or PATIO2"
                    className="mt-1 w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Display Label</span>
                  <input
                    type="text"
                    value={newTableLabel}
                    onChange={(e) => setNewTableLabel(e.target.value)}
                    placeholder="e.g. Table 09"
                    className="mt-1 w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Zone</span>
                  <input
                    type="text"
                    value={newTableZone}
                    onChange={(e) => setNewTableZone(e.target.value)}
                    placeholder="Patio"
                    className="mt-1 w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Seats</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={newTableSeats}
                    onChange={(e) => setNewTableSeats(e.target.value)}
                    className="mt-1 w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-xs font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <button
                  type="submit"
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Create Table QR
                </button>
              </form>
            </section>

            {/* Table QR Cards Grid */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {state.tables.map((t) => {
                const url = getTableUrl(t.id);
                const qrSrc = qrDataUrls[t.id];
                const isCopied = copiedTableId === t.id;
                return (
                  <article
                    key={t.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-slate-500">
                          {t.id}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">{t.label}</h3>
                        <p className="text-xs text-slate-500">
                          {t.zone} · {t.seats} seats
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenGuestTable(t.id)}
                        title={`Preview ${t.label} guest view`}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col items-center justify-center">
                      {qrSrc ? (
                        <img
                          src={qrSrc}
                          alt={`QR code for ${t.label}`}
                          className="w-36 h-36 rounded-lg"
                        />
                      ) : (
                        <div className="w-36 h-36 bg-slate-200 animate-pulse rounded-lg" />
                      )}
                      <span className="font-mono text-[11px] text-slate-500 mt-2 truncate max-w-full">
                        /?table={t.id}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopyTableUrl(t.id)}
                        className="min-h-[38px] px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadQr(t.id)}
                        disabled={!qrSrc}
                        className="min-h-[38px] px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>PNG</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintQr(t.id)}
                        disabled={!qrSrc}
                        className="min-h-[38px] px-2 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 inline-flex items-center justify-center gap-1 disabled:opacity-40"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Print</span>
                      </button>
                    </div>
                    <span className="sr-only">{url}</span>
                  </article>
                );
              })}
            </section>

            {/* Staff Access PIN & Demo Reset Controls (Strictly Staff/Admin Only) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                      <Lock className="w-4 h-4 text-slate-700" />
                      <span>Staff Portal PIN Lock</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Optional 4-digit PIN required when entering Staff views from a guest table
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onDispatch({
                        type: 'staff:updatePin',
                        payload: { enabled: !state.staffPinEnabled, pin: pinDraft },
                      })
                    }
                    className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                      state.staffPinEnabled
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {state.staffPinEnabled ? 'PIN Enabled' : 'PIN Off'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={8}
                    value={pinDraft}
                    onChange={(e) => {
                      setPinDraft(e.target.value);
                      setPinSaved(false);
                    }}
                    placeholder="PIN (e.g. 1234)"
                    className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="button"
                    disabled={pinDraft.trim().length < 4}
                    onClick={() => {
                      onDispatch({
                        type: 'staff:updatePin',
                        payload: { enabled: state.staffPinEnabled, pin: pinDraft.trim() },
                      });
                      setPinSaved(true);
                      window.setTimeout(() => setPinSaved(false), 2000);
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
                  >
                    {pinSaved ? 'PIN Saved' : 'Save PIN'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Use 4–8 characters. Toggle <span className="font-semibold text-slate-700">PIN Enabled / PIN Off</span> above to require or bypass the PIN prompt on Staff/Admin views.
                </p>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-slate-700" />
                    <span>Demo & Seed Data Control</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Restore default tables, menu items, and sample orders across all terminals. Hidden from guests.
                  </p>
                </div>

                {confirmReset ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onDispatch({ type: 'system:resetDemo' });
                        setConfirmReset(false);
                      }}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                    >
                      Confirm Reset Demo Data
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="self-start min-h-[42px] px-4 py-2 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold"
                  >
                    Reset Demo Data
                  </button>
                )}
              </section>
            </div>
          </div>
        )}
      </div>

      {/* Print-Only Table Tent Card (Single-Page 1/1 Fit) */}
      {printTable && qrDataUrls[printTable.id] && (
        <div className="qr-print-sheet" aria-hidden="true">
          <div className="qr-print-card">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              {state.restaurantName}
            </p>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-1.5 leading-tight">
              {printTable.id} — {printTable.label}
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              {printTable.zone} · {printTable.seats} Seats
            </p>
            <div className="inline-block my-4 p-2.5 border border-slate-200 rounded-xl bg-white">
              <img
                src={qrDataUrls[printTable.id]}
                alt={`Printable QR for ${printTable.label}`}
                className="qr-print-img"
              />
            </div>
            <p className="text-xs font-medium text-slate-800 leading-snug">
              Scan this QR code to view the menu and place your order
            </p>
          </div>
        </div>
      )}

      {/* In-App Printable Table Card Modal (No about:blank Popup) */}
      {printModalTable && qrDataUrls[printModalTable.id] && (
        <div className="no-print fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Printable Table QR Card
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Single-page table tent card ready to print or save as PNG
                </p>
              </div>
              <button
                type="button"
                aria-label="Close print preview"
                onClick={() => setPrintModalTableId(null)}
                className="min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="border-2 border-slate-900 rounded-2xl p-5 text-center bg-white max-w-[340px] mx-auto">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                {state.restaurantName}
              </p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1.5 leading-tight">
                {printModalTable.id} — {printModalTable.label}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {printModalTable.zone} · {printModalTable.seats} Seats
              </p>
              <div className="inline-block my-4 p-2.5 border border-slate-200 rounded-xl bg-white">
                <img
                  src={qrDataUrls[printModalTable.id]}
                  alt={`Printable QR for ${printModalTable.label}`}
                  className="w-48 h-48 mx-auto block"
                />
              </div>
              <p className="text-xs font-medium text-slate-800 leading-snug">
                Scan this QR code to view the menu and place your order
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleDownloadQr(printModalTable.id)}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PNG</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrintTableId(printModalTable.id);
                  window.requestAnimationFrame(() => {
                    window.print();
                  });
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Dish Modal */}
      {editorOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-lg font-bold text-slate-900">
                {dishForm.id ? 'Edit Dish' : 'Add New Dish'}
              </h2>
              <button
                type="button"
                aria-label="Close dish editor"
                onClick={() => setEditorOpen(false)}
                className="min-w-[38px] min-h-[38px] rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDish} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold text-slate-700">Dish Name *</span>
                  <input
                    type="text"
                    required
                    value={dishForm.name}
                    onChange={(e) => setDishForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Seared Hokkaido Scallops"
                    className="mt-1 w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Category</span>
                  <select
                    value={dishForm.category}
                    onChange={(e) =>
                      setDishForm((p) => ({
                        ...p,
                        category: e.target.value as MenuCategory,
                      }))
                    }
                    className="mt-1 w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Starters">Starters</option>
                    <option value="Mains">Mains</option>
                    <option value="Desserts">Desserts</option>
                    <option value="Drinks">Drinks</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Kitchen Station</span>
                  <select
                    value={dishForm.station}
                    onChange={(e) =>
                      setDishForm((p) => ({
                        ...p,
                        station: e.target.value as Station,
                      }))
                    }
                    className="mt-1 w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Grill">Grill</option>
                    <option value="Fry">Fry</option>
                    <option value="Bar">Bar</option>
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">
                      Base Price ({state.currency.symbol}) *
                    </span>
                    <input
                      type="number"
                      required
                      min="1"
                      step="0.5"
                      value={dishForm.basePrice}
                      onChange={(e) =>
                        setDishForm((p) => ({ ...p, basePrice: e.target.value }))
                      }
                      className="mt-1 w-full min-h-[42px] px-3 rounded-xl border border-slate-200 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">
                      Cost Price ({state.currency.symbol})
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="Optional"
                      value={dishForm.costPrice}
                      onChange={(e) =>
                        setDishForm((p) => ({ ...p, costPrice: e.target.value }))
                      }
                      className="mt-1 w-full min-h-[42px] px-3 rounded-xl border border-slate-200 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">Prep (min)</span>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={dishForm.prepMinutes}
                      onChange={(e) =>
                        setDishForm((p) => ({ ...p, prepMinutes: e.target.value }))
                      }
                      className="mt-1 w-full min-h-[42px] px-3 rounded-xl border border-slate-200 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">Spice Level</span>
                    <select
                      value={dishForm.spiceLevel}
                      onChange={(e) =>
                        setDishForm((p) => ({
                          ...p,
                          spiceLevel: Number(e.target.value) as SpiceLevel,
                        }))
                      }
                      className="mt-1 w-full min-h-[42px] px-3 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value={0}>0 · None</option>
                      <option value={1}>1 · Mild</option>
                      <option value={2}>2 · Medium</option>
                      <option value={3}>3 · Hot</option>
                    </select>
                  </label>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Description</span>
                <textarea
                  rows={2}
                  value={dishForm.description}
                  onChange={(e) =>
                    setDishForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Key ingredients and culinary finish..."
                  className="mt-1 w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>

              {/* Portion Sizes */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <span className="text-xs font-semibold text-slate-700 block">
                  Portion Sizes (Label & Price Delta vs. Base)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-500">Size S</span>
                    <input
                      type="text"
                      value={dishForm.smallLabel}
                      onChange={(e) =>
                        setDishForm((p) => ({ ...p, smallLabel: e.target.value }))
                      }
                      placeholder="Small"
                      className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={dishForm.smallDelta}
                      onChange={(e) =>
                        setDishForm((p) => ({ ...p, smallDelta: e.target.value }))
                      }
                      placeholder="-2"
                      className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-200 bg-white"
                    />
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-500">Size M</span>
                    <input
                      type="text"
                      value={dishForm.medLabel}
                      onChange={(e) =>
                        setDishForm((p) => ({ ...p, medLabel: e.target.value }))
                      }
                      placeholder="Regular"
                      className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={dishForm.medDelta}
                      onChange={(e) =>
                        setDishForm((p) => ({ ...p, medDelta: e.target.value }))
                      }
                      placeholder="0"
                      className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-200 bg-white"
                    />
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-500">Size L</span>
                    <input
                      type="text"
                      value={dishForm.largeLabel}
                      onChange={(e) =>
                        setDishForm((p) => ({ ...p, largeLabel: e.target.value }))
                      }
                      placeholder="Large"
                      className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white"
                    />
                    <input
                      type="number"
                      step="0.5"
                      value={dishForm.largeDelta}
                      onChange={(e) =>
                        setDishForm((p) => ({ ...p, largeDelta: e.target.value }))
                      }
                      placeholder="6"
                      className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-200 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Allergens */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <span className="text-xs font-semibold text-slate-700 block">
                  Allergen Tags
                </span>
                <div className="flex flex-wrap gap-2">
                  {ALLERGEN_OPTIONS.map((tag) => {
                    const selected = dishForm.allergens.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setDishForm((p) => ({
                            ...p,
                            allergens: selected
                              ? p.allergens.filter((a) => a !== tag)
                              : [...p.allergens, tag],
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          selected
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Image URL / Preset / Upload */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <span className="text-xs font-semibold text-slate-700 block">
                  Dish Image (Preset, URL, or Upload)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={
                      IMAGE_PRESETS.some((p) => p.url === dishForm.image)
                        ? dishForm.image
                        : ''
                    }
                    onChange={(e) =>
                      setDishForm((p) => ({ ...p, image: e.target.value }))
                    }
                    className="min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs bg-white"
                  >
                    {IMAGE_PRESETS.map((preset) => (
                      <option key={preset.label} value={preset.url}>
                        Preset: {preset.label}
                      </option>
                    ))}
                  </select>

                  <label className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
                <input
                  type="text"
                  value={dishForm.image}
                  onChange={(e) =>
                    setDishForm((p) => ({ ...p, image: e.target.value }))
                  }
                  placeholder="Or paste image URL (/src/assets/... or https://...)"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Deal & Availability */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-slate-100 pt-3 items-end">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Deal Label</span>
                  <input
                    type="text"
                    value={dishForm.dealTag}
                    onChange={(e) =>
                      setDishForm((p) => ({ ...p, dealTag: e.target.value }))
                    }
                    placeholder={`e.g. Chef Special · ${state.currency.symbol}3 Off`}
                    className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">
                    Discount ({state.currency.symbol})
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={dishForm.dealDiscount}
                    onChange={(e) =>
                      setDishForm((p) => ({ ...p, dealDiscount: e.target.value }))
                    }
                    placeholder="0"
                    className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 font-mono text-xs"
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDishForm((p) => ({ ...p, available: !p.available }))
                  }
                  className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold border ${
                    dishForm.available
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}
                >
                  {dishForm.available ? 'Status: Available' : 'Status: Sold Out'}
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                >
                  {dishForm.id ? 'Save Dish Changes' : 'Create Dish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Deal Modal */}
      {dealModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">
                {editingDealId ? 'Edit Combo Deal' : 'New Combo Deal'}
              </h2>
              <button
                type="button"
                aria-label="Close deal editor"
                onClick={() => setDealModalOpen(false)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDeal} className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Combo Title *</span>
                <input
                  type="text"
                  required
                  value={dealTitle}
                  onChange={(e) => setDealTitle(e.target.value)}
                  placeholder="e.g. Steak & Spritz Evening"
                  className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Subtitle</span>
                <input
                  type="text"
                  value={dealSubtitle}
                  onChange={(e) => setDealSubtitle(e.target.value)}
                  placeholder="Description of included dishes"
                  className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-700">
                  Bundle Price ({state.currency.symbol}) *
                </span>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.5"
                  value={dealPrice}
                  onChange={(e) => setDealPrice(e.target.value)}
                  className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 font-mono text-sm"
                />
              </label>

              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-700 block">
                  Included Dishes
                </span>
                <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {state.menu.map((item) => {
                    const checked = dealItemIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setDealItemIds((prev) =>
                                checked
                                  ? prev.filter((id) => id !== item.id)
                                  : [...prev, item.id]
                              )
                            }
                          />
                          <span className="font-medium text-slate-900">{item.name}</span>
                        </span>
                        <span className="font-mono text-slate-500">
                          {formatCurrency(item.basePrice, state.currency)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDealModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                >
                  Save Combo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
