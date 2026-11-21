import { useMemo, useState } from 'react';
import {
  Calendar,
  Download,
  Edit3,
  Plus,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import type {
  ClientAction,
  ExpenseCategory,
  ExpenseEntry,
  PaymentMethod,
  PortionSize,
  RestaurantState,
  SalesTransaction,
} from '../types';
import { formatCurrency } from '../utils/format';

interface AccountingDashboardProps {
  state: RestaurantState;
  onDispatch: (action: ClientAction) => void;
}

type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'all';
type AccountingSection = 'overview' | 'sales' | 'expenses';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Bazar / Raw Materials',
  'Staff Salary',
  'Gas / Electricity / Utilities',
  'Rent',
  'Maintenance / Other',
];

const STANDARD_PAYMENT_METHODS: PaymentMethod[] = [
  'Cash',
  'Card',
  'Bank Transfer',
  'Google Pay',
];

function toLocalYmd(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalYmd(dt.getTime());
}

function matchesPeriod(ymd: string, period: ReportPeriod, selectedDate: string): boolean {
  if (period === 'all') return true;
  if (period === 'daily') return ymd === selectedDate;
  if (period === 'weekly') {
    const start = addDaysYmd(selectedDate, -6);
    return ymd >= start && ymd <= selectedDate;
  }
  // monthly
  return ymd.slice(0, 7) === selectedDate.slice(0, 7);
}

function formatMonthTitle(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  if (!y || !m) return ymd;
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function summarizePeriod(
  sales: SalesTransaction[],
  expenses: ExpenseEntry[],
  period: ReportPeriod,
  selectedDate: string
) {
  const periodSales = sales.filter((s) =>
    matchesPeriod(toLocalYmd(s.paidAt), period, selectedDate)
  );
  const periodExpenses = expenses.filter((e) =>
    matchesPeriod(e.date, period, selectedDate)
  );

  const totalSales = periodSales.reduce((sum, s) => sum + s.total, 0);
  const totalCogs = periodSales.reduce((sum, s) => sum + s.cogs, 0);
  const totalTips = periodSales.reduce((sum, s) => sum + s.tipAmount, 0);
  const totalTaxService = periodSales.reduce((sum, s) => sum + s.tax + s.serviceCharge, 0);
  const totalExpenses = periodExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalSales - totalCogs - totalExpenses;

  const byMethod: Record<string, { amount: number; count: number }> = {};
  for (const s of periodSales) {
    const key = s.paymentMethod || 'Cash';
    if (!byMethod[key]) byMethod[key] = { amount: 0, count: 0 };
    byMethod[key].amount += s.total;
    byMethod[key].count += 1;
  }

  const byExpenseCat: Record<string, number> = {};
  for (const cat of EXPENSE_CATEGORIES) {
    byExpenseCat[cat] = 0;
  }
  for (const e of periodExpenses) {
    byExpenseCat[e.category] = (byExpenseCat[e.category] ?? 0) + e.amount;
  }

  return {
    sales: periodSales,
    expenses: periodExpenses,
    orderCount: periodSales.length,
    totalSales,
    totalCogs,
    totalTips,
    totalTaxService,
    totalExpenses,
    netProfit,
    byMethod,
    byExpenseCat,
  };
}

export function AccountingDashboard({ state, onDispatch }: AccountingDashboardProps) {
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalYmd(Date.now()));
  const [period, setPeriod] = useState<ReportPeriod>('daily');
  const [section, setSection] = useState<AccountingSection>('overview');

  // Sales ledger filters
  const [tableFilter, setTableFilter] = useState<string>('ALL');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [salesSearch, setSalesSearch] = useState<string>('');

  // Expense filters & form modal
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('ALL');
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expDate, setExpDate] = useState<string>(() => toLocalYmd(Date.now()));
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Bazar / Raw Materials');
  const [expAmount, setExpAmount] = useState<string>('');
  const [expMethod, setExpMethod] = useState<string>('Cash');
  const [expCustomMethod, setExpCustomMethod] = useState<string>('');
  const [expNote, setExpNote] = useState<string>('');
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);

  // Manual counter/table sale modal
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [saleTableId, setSaleTableId] = useState<string>('COUNTER');
  const [saleMenuId, setSaleMenuId] = useState<string>(state.menu[0]?.id ?? '');
  const [saleSize, setSaleSize] = useState<PortionSize>('M');
  const [saleQty, setSaleQty] = useState<string>('1');
  const [saleTip, setSaleTip] = useState<string>('0');
  const [saleMethod, setSaleMethod] = useState<string>('Cash');
  const [saleCustomMethod, setSaleCustomMethod] = useState<string>('');
  const [salePayerName, setSalePayerName] = useState<string>('');
  const [saleRefNote, setSaleRefNote] = useState<string>('');
  const [saleLines, setSaleLines] = useState<
    { menuItemId: string; size: PortionSize; quantity: number }[]
  >([]);

  const dailySummary = useMemo(
    () => summarizePeriod(state.sales, state.expenses, 'daily', selectedDate),
    [state.sales, state.expenses, selectedDate]
  );
  const weeklySummary = useMemo(
    () => summarizePeriod(state.sales, state.expenses, 'weekly', selectedDate),
    [state.sales, state.expenses, selectedDate]
  );
  const monthlySummary = useMemo(
    () => summarizePeriod(state.sales, state.expenses, 'monthly', selectedDate),
    [state.sales, state.expenses, selectedDate]
  );
  const allTimeSummary = useMemo(
    () => summarizePeriod(state.sales, state.expenses, 'all', selectedDate),
    [state.sales, state.expenses, selectedDate]
  );

  const activeSummary =
    period === 'daily'
      ? dailySummary
      : period === 'weekly'
      ? weeklySummary
      : period === 'monthly'
      ? monthlySummary
      : allTimeSummary;

  const knownPaymentMethods = useMemo(() => {
    const set = new Set<string>(STANDARD_PAYMENT_METHODS);
    for (const s of state.sales) {
      if (s.paymentMethod) set.add(s.paymentMethod);
    }
    for (const e of state.expenses) {
      if (e.paymentMethod) set.add(e.paymentMethod);
    }
    return Array.from(set);
  }, [state.sales, state.expenses]);

  const filteredSales = useMemo(() => {
    const q = salesSearch.trim().toLowerCase();
    return activeSummary.sales.filter((s) => {
      if (tableFilter !== 'ALL' && s.tableId !== tableFilter) return false;
      if (methodFilter !== 'ALL' && s.paymentMethod !== methodFilter) return false;
      if (q) {
        const hay = [
          s.id,
          s.receiptId,
          s.tableId,
          s.tableLabel,
          s.paymentMethod,
          s.payerName ?? '',
          s.referenceNote ?? '',
          ...s.orderIds,
          ...s.items.map((it) => it.name),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeSummary.sales, tableFilter, methodFilter, salesSearch]);

  const filteredPaymentTotals = useMemo(() => {
    const map: Record<string, { amount: number; count: number }> = {};
    let totalAmount = 0;
    for (const s of filteredSales) {
      const m = s.paymentMethod || 'Cash';
      if (!map[m]) map[m] = { amount: 0, count: 0 };
      map[m].amount += s.total;
      map[m].count += 1;
      totalAmount += s.total;
    }
    return { map, totalAmount };
  }, [filteredSales]);

  const filteredExpenses = useMemo(() => {
    return activeSummary.expenses.filter(
      (e) => expenseCategoryFilter === 'ALL' || e.category === expenseCategoryFilter
    );
  }, [activeSummary.expenses, expenseCategoryFilter]);

  const openAddExpense = () => {
    setEditingExpenseId(null);
    setExpDate(selectedDate);
    setExpCategory('Bazar / Raw Materials');
    setExpAmount('');
    setExpMethod('Cash');
    setExpCustomMethod('');
    setExpNote('');
    setExpenseModalOpen(true);
  };

  const openEditExpense = (entry: ExpenseEntry) => {
    setEditingExpenseId(entry.id);
    setExpDate(entry.date);
    setExpCategory(entry.category);
    setExpAmount(String(entry.amount));
    if (STANDARD_PAYMENT_METHODS.includes(entry.paymentMethod)) {
      setExpMethod(entry.paymentMethod);
      setExpCustomMethod('');
    } else {
      setExpMethod('CUSTOM');
      setExpCustomMethod(entry.paymentMethod);
    }
    setExpNote(entry.note);
    setExpenseModalOpen(true);
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(expAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const resolvedMethod =
      expMethod === 'CUSTOM' ? expCustomMethod.trim() || 'Cash' : expMethod;

    if (editingExpenseId) {
      onDispatch({
        type: 'expense:update',
        payload: {
          id: editingExpenseId,
          updates: {
            date: expDate,
            category: expCategory,
            amount,
            paymentMethod: resolvedMethod,
            note: expNote.trim() || expCategory,
          },
        },
      });
    } else {
      onDispatch({
        type: 'expense:add',
        payload: {
          expense: {
            date: expDate,
            category: expCategory,
            amount,
            paymentMethod: resolvedMethod,
            note: expNote.trim() || expCategory,
          },
        },
      });
    }
    setExpenseModalOpen(false);
  };

  const openManualSaleModal = () => {
    setSaleTableId('COUNTER');
    setSaleMenuId(state.menu[0]?.id ?? '');
    setSaleSize('M');
    setSaleQty('1');
    setSaleTip('0');
    setSaleMethod('Cash');
    setSaleCustomMethod('');
    setSalePayerName('');
    setSaleRefNote('');
    setSaleLines([]);
    setSaleModalOpen(true);
  };

  const handleAddSaleLine = () => {
    if (!saleMenuId) return;
    const qty = Math.max(1, Math.round(Number(saleQty) || 1));
    setSaleLines((prev) => [...prev, { menuItemId: saleMenuId, size: saleSize, quantity: qty }]);
  };

  const handleSaveManualSale = (e: React.FormEvent) => {
    e.preventDefault();
    const lines =
      saleLines.length > 0
        ? saleLines
        : saleMenuId
        ? [{ menuItemId: saleMenuId, size: saleSize, quantity: Math.max(1, Math.round(Number(saleQty) || 1)) }]
        : [];
    if (lines.length === 0) return;
    const resolvedMethod =
      saleMethod === 'CUSTOM' ? saleCustomMethod.trim() || 'Cash' : saleMethod;

    onDispatch({
      type: 'sales:add',
      payload: {
        tableId: saleTableId,
        items: lines,
        tipAmount: Math.max(0, Number(saleTip) || 0),
        paymentMethod: resolvedMethod,
        payerName: salePayerName.trim() || undefined,
        referenceNote: saleRefNote.trim() || undefined,
      },
    });
    setSaleModalOpen(false);
  };

  const handleExportSalesCsv = () => {
    const header = [
      'Receipt ID',
      'Order IDs',
      'Date & Time',
      'Table',
      'Items',
      'Subtotal',
      'Discount',
      'Tax',
      'Service Charge',
      'Tip',
      'Total Paid',
      'Food Cost (COGS)',
      'Payment Method',
      'Payer Name',
      'Reference Note',
    ];
    const escapeCsv = (val: string | number) => {
      const s = String(val ?? '');
      return `"${s.replace(/"/g, '""')}"`;
    };
    const rows = filteredSales.map((s) => [
      s.receiptId,
      s.orderIds.join(' '),
      new Date(s.paidAt).toISOString(),
      `${s.tableId} (${s.tableLabel})`,
      s.items.map((i) => `${i.quantity}x ${i.name} (${i.size})`).join('; '),
      s.subtotal.toFixed(2),
      s.discount.toFixed(2),
      s.tax.toFixed(2),
      s.serviceCharge.toFixed(2),
      s.tipAmount.toFixed(2),
      s.total.toFixed(2),
      s.cogs.toFixed(2),
      s.paymentMethod,
      s.payerName ?? '',
      s.referenceNote ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bistro-solis-sales-${period}-${selectedDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const periodLabel =
    period === 'daily'
      ? `Daily · ${selectedDate}`
      : period === 'weekly'
      ? `Weekly · ${addDaysYmd(selectedDate, -6)} to ${selectedDate}`
      : period === 'monthly'
      ? `Monthly · ${formatMonthTitle(selectedDate)}`
      : 'All Time';

  return (
    <div className="space-y-6">
      {/* Top Toolbar: Period Controls & Section Switcher */}
      <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-1 bg-slate-100 rounded-xl">
            {(
              [
                { id: 'daily', label: 'Daily' },
                { id: 'weekly', label: 'Weekly' },
                { id: 'monthly', label: 'Monthly' },
                { id: 'all', label: 'All Time' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  period === opt.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <input
              type="date"
              aria-label="Reference date for reports"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              className="bg-transparent font-mono text-xs text-slate-900 focus:outline-none"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 bg-slate-100 rounded-xl">
            {(
              [
                { id: 'overview', label: 'Profit Summary' },
                { id: 'sales', label: `Sales Ledger (${activeSummary.orderCount})` },
                { id: 'expenses', label: `Expenses (${activeSummary.expenses.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  section === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={openManualSaleModal}
            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Sale</span>
          </button>

          <button
            type="button"
            onClick={openAddExpense}
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Expense</span>
          </button>
        </div>
      </section>

      {/* Daily, Weekly & Monthly Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(
          [
            {
              id: 'daily' as const,
              title: 'Daily Report',
              subtitle: selectedDate === toLocalYmd(Date.now()) ? `Today · ${selectedDate}` : selectedDate,
              data: dailySummary,
            },
            {
              id: 'weekly' as const,
              title: 'Weekly Report',
              subtitle: `7 Days ending ${selectedDate}`,
              data: weeklySummary,
            },
            {
              id: 'monthly' as const,
              title: 'Monthly Report',
              subtitle: formatMonthTitle(selectedDate),
              data: monthlySummary,
            },
          ] as const
        ).map((card) => {
          const isSelected = period === card.id;
          const profitPositive = card.data.netProfit >= 0;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setPeriod(card.id)}
              className={`text-left rounded-2xl border p-5 transition-colors space-y-3 ${
                isSelected
                  ? 'bg-white border-slate-900 ring-1 ring-slate-900'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">{card.title}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{card.subtitle}</p>
                </div>
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  {card.data.orderCount} paid
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-500 block">Total Sales</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatCurrency(card.data.totalSales, state.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Food Cost (COGS)</span>
                  <span className="font-mono font-semibold text-slate-700 tabular-nums">
                    {formatCurrency(card.data.totalCogs, state.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Expenses</span>
                  <span className="font-mono font-semibold text-slate-700 tabular-nums">
                    {formatCurrency(card.data.totalExpenses, state.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Net Profit</span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      profitPositive ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {profitPositive ? '' : '-'}
                    {formatCurrency(Math.abs(card.data.netProfit), state.currency)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Profit Summary & Breakdown Section */}
      {section === 'overview' && (
        <div className="space-y-6">
          {/* Active Period Headline Metrics */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                  <span>Profit & Loss Statement · {periodLabel}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Net Profit = Total Sales − Dish Food Cost (COGS) − Operating Expenses
                </p>
              </div>
              <span className="font-mono text-xs text-slate-600 tabular-nums">
                {activeSummary.orderCount} paid orders · Tips {formatCurrency(activeSummary.totalTips, state.currency)}
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-medium text-slate-500">Total Sales (Gross)</span>
                <p className="text-xl font-bold font-mono text-slate-900 tabular-nums mt-1">
                  {formatCurrency(activeSummary.totalSales, state.currency)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  Incl. {formatCurrency(activeSummary.totalTaxService, state.currency)} tax & service
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-medium text-slate-500">Food Cost (COGS)</span>
                <p className="text-xl font-bold font-mono text-slate-900 tabular-nums mt-1">
                  {formatCurrency(activeSummary.totalCogs, state.currency)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  {activeSummary.totalSales > 0
                    ? `${((activeSummary.totalCogs / activeSummary.totalSales) * 100).toFixed(1)}% of sales`
                    : '0.0% of sales'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-medium text-slate-500">Operating Expenses</span>
                <p className="text-xl font-bold font-mono text-slate-900 tabular-nums mt-1">
                  {formatCurrency(activeSummary.totalExpenses, state.currency)}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  {activeSummary.expenses.length} logged {activeSummary.expenses.length === 1 ? 'entry' : 'entries'}
                </p>
              </div>

              <div
                className={`p-4 rounded-xl border ${
                  activeSummary.netProfit >= 0
                    ? 'bg-emerald-50/70 border-emerald-200'
                    : 'bg-red-50/70 border-red-200'
                }`}
              >
                <span
                  className={`text-xs font-medium ${
                    activeSummary.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'
                  }`}
                >
                  Net Profit
                </span>
                <p
                  className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                    activeSummary.netProfit >= 0 ? 'text-emerald-800' : 'text-red-800'
                  }`}
                >
                  {activeSummary.netProfit < 0 ? '-' : ''}
                  {formatCurrency(Math.abs(activeSummary.netProfit), state.currency)}
                </p>
                <p
                  className={`text-[11px] mt-1 tabular-nums ${
                    activeSummary.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {activeSummary.totalSales > 0
                    ? `${((activeSummary.netProfit / activeSummary.totalSales) * 100).toFixed(1)}% net margin`
                    : 'No revenue in period'}
                </p>
              </div>
            </div>
          </section>

          {/* Breakdown Grid: Payment Methods + Expense Categories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-slate-700" />
                    <span>Payment Method Breakdown</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Total money collected per payment channel ({periodLabel})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSection('sales')}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-2"
                >
                  Open Sales Ledger
                </button>
              </div>

              {Object.keys(activeSummary.byMethod).length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No paid transactions recorded for this period.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {Object.entries(activeSummary.byMethod)
                    .sort((a, b) => b[1].amount - a[1].amount)
                    .map(([method, info]) => (
                      <div key={method} className="py-3 flex items-center justify-between gap-3 text-sm">
                        <div>
                          <span className="font-semibold text-slate-900">{method}</span>
                          <span className="text-xs text-slate-500 ml-2 tabular-nums">
                            {info.count} {info.count === 1 ? 'payment' : 'payments'}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-slate-900 tabular-nums">
                          {formatCurrency(info.amount, state.currency)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-slate-700" />
                    <span>Operating Expenses by Category</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Bazar, payroll, utilities, rent & maintenance ({periodLabel})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSection('expenses')}
                  className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-2"
                >
                  Manage Expenses
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {EXPENSE_CATEGORIES.map((cat) => {
                  const amt = activeSummary.byExpenseCat[cat] ?? 0;
                  return (
                    <div key={cat} className="py-3 flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-800">{cat}</span>
                      <span className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(amt, state.currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* All Sales & Payment Ledger Section */}
      {section === 'sales' && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                All Sales & Payment Ledger · {periodLabel}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Completed guest settlements and recorded counter transactions
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleExportSalesCsv}
                disabled={filteredSales.length === 0}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={openManualSaleModal}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Record Sale</span>
              </button>
            </div>
          </div>

          {/* Ledger Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                placeholder="Search receipt, dish, payer or note..."
                className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <select
              aria-label="Filter sales by table"
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">All Tables</option>
              {state.tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {t.label}
                </option>
              ))}
              <option value="COUNTER">COUNTER · Takeaway / POS</option>
            </select>

            <select
              aria-label="Filter sales by payment method"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">All Payment Methods</option>
              {knownPaymentMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Filtered Collection Totals by Payment Method */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {Object.keys(filteredPaymentTotals.map).length === 0 ? (
                <span className="text-slate-500">No payments match current filters.</span>
              ) : (
                Object.entries(filteredPaymentTotals.map).map(([method, info]) => (
                  <div key={method} className="inline-flex items-center gap-1.5">
                    <span className="font-semibold text-slate-700">{method}:</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatCurrency(info.amount, state.currency)}
                    </span>
                    <span className="text-slate-500 tabular-nums">({info.count})</span>
                  </div>
                ))
              )}
            </div>
            <div className="font-mono font-bold text-slate-900 tabular-nums">
              Filtered Total: {formatCurrency(filteredPaymentTotals.totalAmount, state.currency)}
            </div>
          </div>

          {/* Sales Table */}
          {filteredSales.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">No paid transactions found</p>
              <p className="text-xs text-slate-500">
                Try switching the report period to Weekly, Monthly, or All Time, or record a new sale.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2.5 pr-3 whitespace-nowrap">Date & Time</th>
                    <th className="py-2.5 pr-3 whitespace-nowrap">Receipt / Order</th>
                    <th className="py-2.5 pr-3 whitespace-nowrap">Table</th>
                    <th className="py-2.5 pr-3">Itemized Dishes</th>
                    <th className="py-2.5 pr-3 text-right whitespace-nowrap">Subtotal / Tax / Tip</th>
                    <th className="py-2.5 pr-3 text-right whitespace-nowrap">Food Cost</th>
                    <th className="py-2.5 pr-3 text-right whitespace-nowrap">Total Paid</th>
                    <th className="py-2.5 pl-2 whitespace-nowrap">Payment & Payer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {filteredSales.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-3 font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        <div>{toLocalYmd(tx.paidAt)}</div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(tx.paidAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="py-3 pr-3 font-mono whitespace-nowrap">
                        <div className="font-bold text-slate-900">{tx.receiptId}</div>
                        <div className="text-[11px] text-slate-500">
                          {tx.orderIds.join(', ')}
                        </div>
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <span className="font-mono font-bold text-slate-800">{tx.tableId}</span>
                        <div className="text-[11px] text-slate-500">{tx.tableLabel}</div>
                      </td>
                      <td className="py-3 pr-3 min-w-[200px]">
                        <ul className="space-y-0.5 text-slate-700">
                          {tx.items.map((it, idx) => (
                            <li key={idx} className="flex justify-between gap-3">
                              <span>
                                <span className="font-mono text-slate-500">{it.quantity}x</span>{' '}
                                {it.name} ({it.size})
                              </span>
                              <span className="font-mono text-slate-600 tabular-nums shrink-0">
                                {formatCurrency(it.lineTotal, state.currency)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        <div>Sub: {formatCurrency(tx.subtotal - tx.discount - tx.rewardCredit, state.currency)}</div>
                        <div className="text-[11px] text-slate-500">
                          Tax/Svc: {formatCurrency(tx.tax + tx.serviceCharge, state.currency)} · Tip: {formatCurrency(tx.tipAmount, state.currency)}
                        </div>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        {formatCurrency(tx.cogs, state.currency)}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(tx.total, state.currency)}
                      </td>
                      <td className="py-3 pl-2 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{tx.paymentMethod}</div>
                        {(tx.payerName || tx.referenceNote) && (
                          <div className="text-[11px] text-slate-500 max-w-[180px] truncate">
                            {[tx.payerName, tx.referenceNote].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Operating Expenses Section */}
      {section === 'expenses' && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Operating Expenses Tracker · {periodLabel}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Log daily bazar, raw materials, staff salary, utilities, rent, and maintenance costs
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                aria-label="Filter expenses by category"
                value={expenseCategoryFilter}
                onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                className="min-h-[38px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="ALL">All Categories</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={openAddExpense}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log Expense</span>
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">
              Showing {filteredExpenses.length} {filteredExpenses.length === 1 ? 'entry' : 'entries'}
            </span>
            <span className="font-mono font-bold text-slate-900 tabular-nums">
              Total Expenses:{' '}
              {formatCurrency(
                filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
                state.currency
              )}
            </span>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700">No expenses logged for this filter</p>
              <button
                type="button"
                onClick={openAddExpense}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                Log First Expense
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                    <th className="py-2.5 pr-3 whitespace-nowrap">Date</th>
                    <th className="py-2.5 pr-3 whitespace-nowrap">Category</th>
                    <th className="py-2.5 pr-3">Note / Description</th>
                    <th className="py-2.5 pr-3 whitespace-nowrap">Payment Method</th>
                    <th className="py-2.5 pr-3 text-right whitespace-nowrap">Amount</th>
                    <th className="py-2.5 pl-2 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-3 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        {entry.date}
                      </td>
                      <td className="py-3 pr-3 font-semibold text-slate-900 whitespace-nowrap">
                        {entry.category}
                      </td>
                      <td className="py-3 pr-3 text-slate-600 min-w-[200px]">{entry.note}</td>
                      <td className="py-3 pr-3 text-slate-700 whitespace-nowrap">
                        {entry.paymentMethod}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(entry.amount, state.currency)}
                      </td>
                      <td className="py-3 pl-2 text-right whitespace-nowrap">
                        {deletingExpenseId === entry.id ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                onDispatch({
                                  type: 'expense:delete',
                                  payload: { id: entry.id },
                                });
                                setDeletingExpenseId(null);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingExpenseId(null)}
                              className="px-2 py-1 rounded-lg border border-slate-200 text-[11px] text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={`Edit ${entry.note}`}
                              onClick={() => openEditExpense(entry)}
                              className="min-w-[32px] min-h-[32px] px-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 inline-flex items-center justify-center"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${entry.note}`}
                              onClick={() => setDeletingExpenseId(entry.id)}
                              className="min-w-[32px] min-h-[32px] px-2 rounded-lg border border-slate-200 text-slate-500 hover:text-red-600 hover:border-red-200 inline-flex items-center justify-center"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Log / Edit Expense Modal */}
      {expenseModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingExpenseId ? 'Edit Operating Expense' : 'Log Operating Expense'}
              </h3>
              <button
                type="button"
                aria-label="Close expense modal"
                onClick={() => setExpenseModalOpen(false)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Date *</span>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 font-mono text-xs"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">
                    Amount ({state.currency.symbol}) *
                  </span>
                  <input
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    value={expAmount}
                    onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 font-mono text-sm tabular-nums"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Category *</span>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                  className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Payment Method *</span>
                <select
                  value={expMethod}
                  onChange={(e) => setExpMethod(e.target.value)}
                  className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs bg-white"
                >
                  {STANDARD_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value="CUSTOM">Custom Payment Method...</option>
                </select>
              </label>

              {expMethod === 'CUSTOM' && (
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={expCustomMethod}
                  onChange={(e) => setExpCustomMethod(e.target.value)}
                  placeholder="e.g. bKash, Petty Cash, Cheque"
                  className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs"
                />
              )}

              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Note / Details</span>
                <textarea
                  rows={2}
                  maxLength={200}
                  value={expNote}
                  onChange={(e) => setExpNote(e.target.value)}
                  placeholder="e.g. Morning bazar vegetables, meat & spices"
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setExpenseModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                >
                  {editingExpenseId ? 'Save Changes' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Counter / Direct Sale Modal */}
      {saleModalOpen && (
        <div className="no-print fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Record Counter / Direct Sale</h3>
              <button
                type="button"
                aria-label="Close sale modal"
                onClick={() => setSaleModalOpen(false)}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveManualSale} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Table / Channel</span>
                  <select
                    value={saleTableId}
                    onChange={(e) => setSaleTableId(e.target.value)}
                    className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs bg-white"
                  >
                    <option value="COUNTER">Counter / Takeaway</option>
                    {state.tables.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.id} · {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">
                    Tip ({state.currency.symbol})
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={saleTip}
                    onChange={(e) => setSaleTip(e.target.value)}
                    className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 font-mono text-xs tabular-nums"
                  />
                </label>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <span className="text-xs font-semibold text-slate-700 block">Add Dishes</span>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <select
                    value={saleMenuId}
                    onChange={(e) => setSaleMenuId(e.target.value)}
                    className="sm:col-span-6 min-h-[38px] px-2.5 rounded-lg border border-slate-200 text-xs bg-white"
                  >
                    {state.menu.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({formatCurrency(m.basePrice, state.currency)})
                      </option>
                    ))}
                  </select>
                  <select
                    value={saleSize}
                    onChange={(e) => setSaleSize(e.target.value as PortionSize)}
                    className="sm:col-span-2 min-h-[38px] px-2 rounded-lg border border-slate-200 text-xs bg-white"
                  >
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={saleQty}
                    onChange={(e) => setSaleQty(e.target.value)}
                    className="sm:col-span-2 min-h-[38px] px-2 rounded-lg border border-slate-200 font-mono text-xs text-center bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddSaleLine}
                    className="sm:col-span-2 min-h-[38px] px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                  >
                    Add
                  </button>
                </div>

                {saleLines.length > 0 && (
                  <ul className="divide-y divide-slate-200 text-xs pt-1">
                    {saleLines.map((line, i) => {
                      const dish = state.menu.find((m) => m.id === line.menuItemId);
                      return (
                        <li key={i} className="py-1.5 flex items-center justify-between gap-2">
                          <span>
                            {line.quantity}x {dish?.name ?? line.menuItemId} ({line.size})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setSaleLines((prev) => prev.filter((_, idx) => idx !== i))
                            }
                            className="text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Payment Method</span>
                  <select
                    value={saleMethod}
                    onChange={(e) => setSaleMethod(e.target.value)}
                    className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs bg-white"
                  >
                    {STANDARD_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                    <option value="CUSTOM">Custom Payment Method...</option>
                  </select>
                </label>

                {saleMethod === 'CUSTOM' ? (
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">Custom Method *</span>
                    <input
                      type="text"
                      required
                      maxLength={40}
                      value={saleCustomMethod}
                      onChange={(e) => setSaleCustomMethod(e.target.value)}
                      placeholder="e.g. bKash, Nagad"
                      className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs"
                    />
                  </label>
                ) : (
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-700">Payer Name</span>
                    <input
                      type="text"
                      maxLength={60}
                      value={salePayerName}
                      onChange={(e) => setSalePayerName(e.target.value)}
                      placeholder="Guest / Walk-in"
                      className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs"
                    />
                  </label>
                )}
              </div>

              {saleMethod === 'CUSTOM' && (
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Payer Name</span>
                  <input
                    type="text"
                    maxLength={60}
                    value={salePayerName}
                    onChange={(e) => setSalePayerName(e.target.value)}
                    placeholder="Guest / Walk-in"
                    className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs"
                  />
                </label>
              )}

              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Reference Note</span>
                <input
                  type="text"
                  maxLength={120}
                  value={saleRefNote}
                  onChange={(e) => setSaleRefNote(e.target.value)}
                  placeholder="Optional transaction ref or note"
                  className="mt-1 w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSaleModalOpen(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                >
                  Record Paid Sale
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
