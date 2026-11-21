import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Landmark,
  Mail,
  Receipt,
  Smartphone,
  Star,
  Users,
} from 'lucide-react';
import type {
  BillSettlement,
  ClientAction,
  CurrencyConfig,
  Order,
  PaymentMethod,
  TableSession,
} from '../../types';
import { formatCurrency } from '../../utils/format';

interface SplitAndPayProps {
  table: TableSession;
  unsettledOrders: Order[];
  currency: CurrencyConfig;
  onDispatch: (action: ClientAction) => void;
  onBackToMenu: () => void;
}

const TAX_RATE = 0.085;
const SERVICE_RATE = 0.05;

export function SplitAndPay({
  table,
  unsettledOrders,
  currency,
  onDispatch,
  onBackToMenu,
}: SplitAndPayProps) {
  const [splitMode, setSplitMode] = useState<'equal' | 'custom'>('equal');
  const [splitCount, setSplitCount] = useState<number>(2);
  const [tipPercent, setTipPercent] = useState<number>(10);
  const [customTipStr, setCustomTipStr] = useState<string>('');
  const [isCustomTip, setIsCustomTip] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Card');
  const [useCustomMethod, setUseCustomMethod] = useState<boolean>(false);
  const [customMethodName, setCustomMethodName] = useState<string>('');
  const [payerName, setPayerName] = useState<string>('');
  const [referenceNote, setReferenceNote] = useState<string>('');

  const [receiptEmail, setReceiptEmail] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState('');

  const billSummary = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    const lines: {
      id: string;
      name: string;
      size: string;
      quantity: number;
      lineTotal: number;
    }[] = [];

    for (const order of unsettledOrders) {
      for (const item of order.items) {
        const gross = item.unitPrice * item.quantity;
        const disc = item.discountPerUnit * item.quantity;
        subtotal += gross;
        discount += disc;
        lines.push({
          id: item.id,
          name: item.name,
          size: item.size,
          quantity: item.quantity,
          lineTotal: Math.max(0, gross - disc),
        });
      }
    }

    const netBeforeTax = Math.max(0, subtotal - discount - table.redeemedRewardCredit);
    const tax = Number((netBeforeTax * TAX_RATE).toFixed(2));
    const serviceCharge = Number((netBeforeTax * SERVICE_RATE).toFixed(2));
    const preTipTotal = Number((netBeforeTax + tax + serviceCharge).toFixed(2));
    const tipAmount = isCustomTip
      ? Math.max(0, Number(customTipStr) || 0)
      : Number((netBeforeTax * (tipPercent / 100)).toFixed(2));
    const grandTotal = Number((preTipTotal + tipAmount).toFixed(2));

    return {
      lines,
      subtotal,
      discount,
      tax,
      serviceCharge,
      netBeforeTax,
      tipAmount,
      grandTotal,
    };
  }, [unsettledOrders, table.redeemedRewardCredit, isCustomTip, customTipStr, tipPercent]);

  const [customShares, setCustomShares] = useState<number[]>([]);

  useEffect(() => {
    const count = Math.max(1, splitCount);
    const each = Number((billSummary.grandTotal / count).toFixed(2));
    const next = Array(count).fill(each);
    const diff = Number((billSummary.grandTotal - each * count).toFixed(2));
    next[0] = Number((next[0] + diff).toFixed(2));
    setCustomShares(next);
  }, [splitCount, billSummary.grandTotal]);

  const customSum = customShares.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
  const customBalanced = Math.abs(customSum - billSummary.grandTotal) <= 0.05;

  const equalShare =
    splitCount > 0 ? Number((billSummary.grandTotal / splitCount).toFixed(2)) : billSummary.grandTotal;

  const handleCustomShareChange = (index: number, rawVal: string) => {
    const val = Math.max(0, Number(rawVal) || 0);
    setCustomShares((prev) => prev.map((v, i) => (i === index ? val : v)));
  };

  const handleSettle = () => {
    const shares =
      splitMode === 'equal'
        ? Array(splitCount).fill(equalShare)
        : customShares;
    const resolvedMethod =
      useCustomMethod && customMethodName.trim()
        ? customMethodName.trim()
        : paymentMethod;

    onDispatch({
      type: 'bill:settle',
      payload: {
        tableId: table.id,
        splitMode,
        splitCount,
        shares,
        tipPercent: isCustomTip ? 0 : tipPercent,
        tipAmount: billSummary.tipAmount,
        paymentMethod: resolvedMethod,
        payerName: payerName.trim() || undefined,
        referenceNote: referenceNote.trim() || undefined,
      },
    });
  };

  const settlement: BillSettlement | null =
    unsettledOrders.length === 0 ? table.lastSettlement : null;

  // Post-payment Receipt & Review View
  if (settlement) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-emerald-700">
                  Bill Settled · {settlement.paymentMethod}
                </p>
                <h2 className="text-xl font-bold text-slate-900">
                  Digital Receipt #{settlement.id}
                </h2>
              </div>
            </div>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {new Date(settlement.paidAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          <div className="space-y-2.5 text-sm">
            {settlement.itemsSnapshot.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between gap-3">
                <span className="text-slate-700">
                  <span className="font-mono text-xs text-slate-500 mr-2">
                    {item.quantity}x
                  </span>
                  {item.name} ({item.size})
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatCurrency(item.lineTotal, currency)}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatCurrency(settlement.subtotal, currency)}</span>
            </div>
            {settlement.discount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Deal Savings</span>
                <span className="font-mono tabular-nums">-{formatCurrency(settlement.discount, currency)}</span>
              </div>
            )}
            {settlement.rewardCredit > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Rewards Credit</span>
                <span className="font-mono tabular-nums">
                  -{formatCurrency(settlement.rewardCredit, currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-slate-500">
              <span>Tax (8.5%) & Service (5%)</span>
              <span className="font-mono tabular-nums">
                {formatCurrency(settlement.tax + settlement.serviceCharge, currency)}
              </span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Tip</span>
              <span className="font-mono tabular-nums">{formatCurrency(settlement.tipAmount, currency)}</span>
            </div>
            <div className="flex justify-between text-base font-bold text-slate-900 border-t border-slate-200 pt-3">
              <span>
                Total Paid ({settlement.splitCount} {settlement.splitCount === 1 ? 'share' : 'shares'})
              </span>
              <span className="font-mono tabular-nums">{formatCurrency(settlement.total, currency)}</span>
            </div>
          </div>

          {/* Email Receipt Option */}
          <div className="border-t border-slate-100 pt-5">
            <p className="text-xs font-medium text-slate-700 mb-2">
              Email Digital Receipt
            </p>
            {settlement.receiptEmail ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0" />
                <span>Receipt sent to {settlement.receiptEmail}</span>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!receiptEmail.trim()) return;
                  onDispatch({
                    type: 'receipt:sendEmail',
                    payload: {
                      tableId: table.id,
                      settlementId: settlement.id,
                      email: receiptEmail,
                    },
                  });
                }}
                className="flex gap-2"
              >
                <input
                  type="email"
                  required
                  value={receiptEmail}
                  onChange={(e) => setReceiptEmail(e.target.value)}
                  placeholder="guest@example.com"
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 whitespace-nowrap"
                >
                  Send Receipt
                </button>
              </form>
            )}
          </div>
        </section>

        {/* One-Tap Star Rating & Review */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-500">Table Feedback</p>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">
              How was your meal at Bistro Solis?
            </h3>
          </div>

          {settlement.reviewRating ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-5 h-5 ${
                      star <= (settlement.reviewRating ?? 0)
                        ? 'fill-amber-400 text-amber-500'
                        : 'text-slate-300'
                    }`}
                  />
                ))}
              </div>
              <p className="text-sm font-medium text-slate-900 pt-1">
                Thank you for rating us {settlement.reviewRating}/5!
              </p>
              {settlement.reviewComment && (
                <p className="text-xs text-slate-600">“{settlement.reviewComment}”</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    aria-label={`Rate ${star} stars`}
                    onClick={() => setRating(star)}
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 flex items-center justify-center hover:bg-amber-50 transition-colors"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        star <= rating
                          ? 'fill-amber-400 text-amber-500'
                          : 'text-slate-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <textarea
                rows={2}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Optional note for our kitchen and floor team..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onBackToMenu}
                  className="min-h-[44px] px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50"
                >
                  Start New Order
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onDispatch({
                      type: 'review:submit',
                      payload: {
                        tableId: table.id,
                        settlementId: settlement.id,
                        rating,
                        comment: reviewComment,
                      },
                    })
                  }
                  className="min-h-[44px] px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl"
                >
                  Submit Review
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    );
  }

  if (unsettledOrders.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-lg mx-auto space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto">
          <Receipt className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">No Active Balance for {table.label}</h2>
          <p className="text-sm text-slate-500 mt-1">
            Add dishes from the live menu to open your table tab and split or pay anytime.
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToMenu}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
        >
          Browse Menu
        </button>
      </div>
    );
  }

  const paymentOptions: { id: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
    { id: 'Card', label: 'Card', icon: CreditCard },
    { id: 'Google Pay', label: 'Google Pay', icon: Smartphone },
    { id: 'Bank Transfer', label: 'Bank Transfer', icon: Landmark },
    { id: 'Cash', label: 'Cash', icon: Banknote },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Itemized Bill */}
      <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-medium text-slate-500">{table.label} · {table.zone}</p>
            <h2 className="text-lg font-bold text-slate-900 mt-0.5">Itemized Check</h2>
          </div>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {unsettledOrders.length} active {unsettledOrders.length === 1 ? 'order' : 'orders'}
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {billSummary.lines.map((line) => (
            <div key={line.id} className="py-3 flex items-center justify-between gap-4 text-sm">
              <div className="min-w-0">
                <span className="font-mono text-xs text-slate-500 mr-2 tabular-nums">
                  {line.quantity}x
                </span>
                <span className="font-medium text-slate-900">{line.name}</span>
                <span className="text-xs text-slate-500 ml-1.5">· {line.size}</span>
              </div>
              <span className="font-mono font-medium text-slate-900 tabular-nums shrink-0">
                {formatCurrency(line.lineTotal, currency)}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 pt-4 space-y-2 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="font-mono tabular-nums">{formatCurrency(billSummary.subtotal, currency)}</span>
          </div>
          {billSummary.discount > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Combo & Happy Hour Deals</span>
              <span className="font-mono tabular-nums">-{formatCurrency(billSummary.discount, currency)}</span>
            </div>
          )}
          {table.redeemedRewardCredit > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Redeemed Rewards Credit</span>
              <span className="font-mono tabular-nums">
                -{formatCurrency(table.redeemedRewardCredit, currency)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>Tax (8.5%)</span>
            <span className="font-mono tabular-nums">{formatCurrency(billSummary.tax, currency)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Service Charge (5%)</span>
            <span className="font-mono tabular-nums">
              {formatCurrency(billSummary.serviceCharge, currency)}
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Tip</span>
            <span className="font-mono tabular-nums">{formatCurrency(billSummary.tipAmount, currency)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-slate-900 border-t border-slate-200 pt-3">
            <span>Total Due</span>
            <span className="font-mono tabular-nums">{formatCurrency(billSummary.grandTotal, currency)}</span>
          </div>
        </div>
      </section>

      {/* Right: Split, Tip & Payment */}
      <section className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
        {/* Bill Split Controls */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 inline-flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-500" />
              <span>Split Bill</span>
            </h3>
            <div className="inline-flex p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setSplitMode('equal')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  splitMode === 'equal'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Equal
              </button>
              <button
                type="button"
                onClick={() => setSplitMode('custom')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  splitMode === 'custom'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Custom Shares
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs font-medium text-slate-600">Guests Splitting</span>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSplitCount(n)}
                  className={`min-w-[36px] min-h-[36px] rounded-lg text-xs font-semibold tabular-nums transition-colors ${
                    splitCount === n
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {splitMode === 'equal' ? (
            <div className="flex items-center justify-between text-sm px-1">
              <span className="text-slate-600">Per Guest ({splitCount}x)</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {formatCurrency(equalShare, currency)} each
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {customShares.map((val, idx) => (
                  <label key={idx} className="block">
                    <span className="text-[11px] text-slate-500">
                      Guest {idx + 1} ({currency.symbol})
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={val}
                      onChange={(e) => handleCustomShareChange(idx, e.target.value)}
                      className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-200 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                ))}
              </div>
              <p
                className={`text-xs font-mono tabular-nums ${
                  customBalanced ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                Shares sum: {formatCurrency(customSum, currency)} / {formatCurrency(billSummary.grandTotal, currency)}
                {!customBalanced && ' · Adjust shares to match total'}
              </p>
            </div>
          )}
        </div>

        {/* Tip Selector */}
        <div className="space-y-2.5 border-t border-slate-100 pt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Add Tip</h3>
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {formatCurrency(billSummary.tipAmount, currency)}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[0, 5, 10, 15].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  setIsCustomTip(false);
                  setTipPercent(pct);
                }}
                className={`min-h-[44px] rounded-xl text-xs font-semibold tabular-nums border transition-colors ${
                  !isCustomTip && tipPercent === pct
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {pct}%
              </button>
            ))}
            <button
              type="button"
              onClick={() => setIsCustomTip(true)}
              className={`min-h-[44px] rounded-xl text-xs font-semibold border transition-colors ${
                isCustomTip
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Custom
            </button>
          </div>
          {isCustomTip && (
            <input
              type="number"
              min="0"
              step="0.5"
              value={customTipStr}
              onChange={(e) => setCustomTipStr(e.target.value)}
              placeholder={`Enter tip amount (${currency.symbol})`}
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          )}
        </div>

        {/* Payment Method */}
        <div className="space-y-2.5 border-t border-slate-100 pt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Payment Method</h3>
            <button
              type="button"
              onClick={() => setUseCustomMethod((v) => !v)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2"
            >
              {useCustomMethod ? 'Use Standard Methods' : 'Custom Method'}
            </button>
          </div>
          {useCustomMethod ? (
            <input
              type="text"
              maxLength={40}
              value={customMethodName}
              onChange={(e) => setCustomMethodName(e.target.value)}
              placeholder="e.g. bKash, Nagad, Apple Pay, Voucher"
              className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {paymentOptions.map((opt) => {
                const Icon = opt.icon;
                const active = paymentMethod === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPaymentMethod(opt.id)}
                    className={`min-h-[48px] px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <input
              type="text"
              maxLength={60}
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder="Payer name (optional)"
              className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <input
              type="text"
              maxLength={120}
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
              placeholder="Reference / Txn note (optional)"
              className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={
            (splitMode === 'custom' && !customBalanced) ||
            (useCustomMethod && !customMethodName.trim())
          }
          onClick={handleSettle}
          className="w-full min-h-[50px] px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 tabular-nums"
        >
          <span>
            Pay {formatCurrency(splitMode === 'equal' && splitCount > 1 ? equalShare : billSummary.grandTotal, currency)}
          </span>
          {splitMode === 'equal' && splitCount > 1 && (
            <span className="text-amber-100 text-xs font-normal">
              (Settle {formatCurrency(billSummary.grandTotal, currency)} Check)
            </span>
          )}
        </button>
      </section>
    </div>
  );
}
