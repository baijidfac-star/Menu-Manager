import type { CurrencyConfig } from '../types.ts';

export const SUPPORTED_CURRENCIES: CurrencyConfig[] = [
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
];

export const DEFAULT_CURRENCY: CurrencyConfig = SUPPORTED_CURRENCIES[0];

export function formatCurrency(
  amount: number,
  currency: CurrencyConfig = DEFAULT_CURRENCY,
  options?: { decimals?: number }
): string {
  const decimals = options?.decimals ?? 2;
  const safeVal = Number.isFinite(amount) ? amount : 0;
  const formatted = safeVal.toFixed(decimals);
  const symbol = currency?.symbol || DEFAULT_CURRENCY.symbol;
  const needsSpace = /[A-Za-z\u0600-\u06FF]$/.test(symbol) && symbol !== 'S$';
  return needsSpace ? `${symbol} ${formatted}` : `${symbol}${formatted}`;
}

export function formatDealLabel(
  dealTag: string | undefined,
  dealDiscount: number | undefined,
  currency: CurrencyConfig = DEFAULT_CURRENCY
): string | undefined {
  if (!dealTag) return undefined;
  const cleaned = dealTag.replace(/\s*·\s*\$\d+(\.\d+)?\s*Off/i, '').trim();
  if (dealDiscount && dealDiscount > 0) {
    return `${cleaned} · ${formatCurrency(dealDiscount, currency, { decimals: 0 })} Off`;
  }
  return cleaned;
}

export function formatElapsedMMSS(fromMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatElapsedShort(fromMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

export function normalizeTableId(raw: string | null, validIds?: string[]): string {
  if (!raw) return 'T07';
  const cleaned = raw.trim().toUpperCase();
  if (validIds && validIds.length > 0) {
    const exact = validIds.find((id) => id.toUpperCase() === cleaned);
    if (exact) return exact;
  }
  const match = cleaned.match(/^T?0?([1-9])$/);
  if (match) {
    return `T0${match[1]}`;
  }
  const safeCustom = cleaned.replace(/[^A-Z0-9_-]/g, '').slice(0, 12);
  return safeCustom || 'T07';
}
