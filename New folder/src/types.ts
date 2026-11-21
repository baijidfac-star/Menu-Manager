export type AppView = 'guest' | 'floor' | 'kds' | 'admin';

export type Station = 'Grill' | 'Fry' | 'Bar';

export type MenuCategory = 'Starters' | 'Mains' | 'Desserts' | 'Drinks';

export type SpiceLevel = 0 | 1 | 2 | 3;

export type PortionSize = 'S' | 'M' | 'L';

export interface SizeOption {
  size: PortionSize;
  label: string;
  priceDelta: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  category: MenuCategory;
  station: Station;
  basePrice: number;
  costPrice?: number;
  sizes: SizeOption[];
  allergens: string[];
  spiceLevel: SpiceLevel;
  image?: string;
  dealTag?: string;
  dealDiscount?: number;
  prepMinutes: number;
  available: boolean;
}

export interface DealCombo {
  id: string;
  title: string;
  subtitle: string;
  menuItemIds: string[];
  bundlePrice: number;
  regularPrice: number;
  stationSummary: string;
}

export type OrderItemStatus = 'Pending' | 'Preparing' | 'Ready';

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  station: Station;
  size: PortionSize;
  quantity: number;
  unitPrice: number;
  costPrice?: number;
  discountPerUnit: number;
  notes?: string;
  itemStatus: OrderItemStatus;
}

export type OrderStatus = 'Placed' | 'Sent to Kitchen' | 'Preparing' | 'Ready' | 'Served';

export interface Order {
  id: string;
  tableId: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  settled: boolean;
}

export type TableStatus = 'Free' | 'Occupied' | 'Needs Help';

export type WaiterCallStatus = 'None' | 'Requested' | 'Acknowledged' | 'Arrived';

export interface WaiterCall {
  active: boolean;
  requestedAt: number | null;
  status: WaiterCallStatus;
  reason?: string;
}

export type PresetPaymentMethod = 'Cash' | 'Bank Transfer' | 'Card' | 'Google Pay';
export type PaymentMethod = PresetPaymentMethod | (string & {});

export interface BillSettlement {
  id: string;
  tableId: string;
  subtotal: number;
  discount: number;
  rewardCredit: number;
  tax: number;
  serviceCharge: number;
  tipAmount: number;
  tipPercent: number;
  total: number;
  splitMode: 'equal' | 'custom';
  splitCount: number;
  shares: number[];
  paymentMethod: PaymentMethod;
  payerName?: string;
  referenceNote?: string;
  paidAt: number;
  receiptEmail?: string;
  reviewRating?: number;
  reviewComment?: string;
  itemsSnapshot: {
    name: string;
    size: PortionSize;
    quantity: number;
    lineTotal: number;
  }[];
}

export interface SalesLineItem {
  menuItemId: string;
  name: string;
  size: PortionSize;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  lineTotal: number;
  lineCost: number;
}

export interface SalesTransaction {
  id: string;
  receiptId: string;
  orderIds: string[];
  tableId: string;
  tableLabel: string;
  paidAt: number;
  items: SalesLineItem[];
  subtotal: number;
  discount: number;
  rewardCredit: number;
  tax: number;
  serviceCharge: number;
  tipAmount: number;
  total: number;
  cogs: number;
  paymentMethod: PaymentMethod;
  payerName?: string;
  referenceNote?: string;
}

export type ExpenseCategory =
  | 'Bazar / Raw Materials'
  | 'Staff Salary'
  | 'Gas / Electricity / Utilities'
  | 'Rent'
  | 'Maintenance / Other';

export interface ExpenseEntry {
  id: string;
  date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  amount: number;
  paymentMethod: PaymentMethod;
  note: string;
  createdAt: number;
  updatedAt: number;
}

export type TicTacToeCell = 'X' | 'O' | null;

export interface TicTacToeState {
  board: TicTacToeCell[];
  turn: 'X' | 'O';
  winner: 'X' | 'O' | 'Draw' | null;
  mode: 'solo' | 'table';
  scores: {
    X: number;
    O: number;
    draws: number;
  };
}

export interface TableSession {
  id: string;
  label: string;
  seats: number;
  zone: string;
  status: TableStatus;
  waiterCall: WaiterCall;
  rewardsPoints: number;
  redeemedRewardCredit: number;
  ticTacToe: TicTacToeState;
  lastSettlement: BillSettlement | null;
}

export interface GuestReview {
  id: string;
  tableId: string;
  rating: number;
  comment: string;
  createdAt: number;
}

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
}

export interface RestaurantState {
  restaurantName: string;
  wifi: {
    ssid: string;
    password: string;
  };
  currency: CurrencyConfig;
  staffPinEnabled: boolean;
  staffPin: string;
  tables: TableSession[];
  menu: MenuItem[];
  deals: DealCombo[];
  orders: Order[];
  sales: SalesTransaction[];
  expenses: ExpenseEntry[];
  reviews: GuestReview[];
  nextOrderSeq: number;
}

export interface CartItemInput {
  menuItemId: string;
  size: PortionSize;
  quantity: number;
  notes?: string;
}

export type ClientAction =
  | {
      type: 'order:place';
      payload: {
        clientOrderId?: string;
        tableId: string;
        items: CartItemInput[];
      };
    }
  | {
      type: 'order:dispatch';
      payload: { orderId: string };
    }
  | {
      type: 'order:updateStatus';
      payload: { orderId: string; status: OrderStatus };
    }
  | {
      type: 'kds:stationAction';
      payload: {
        orderId: string;
        station?: Station;
        itemStatus: OrderItemStatus;
      };
    }
  | {
      type: 'waiter:call';
      payload: { tableId: string; reason?: string };
    }
  | {
      type: 'waiter:respond';
      payload: { tableId: string; action: 'acknowledge' | 'arrived' | 'clear' };
    }
  | {
      type: 'table:setStatus';
      payload: { tableId: string; status: TableStatus };
    }
  | {
      type: 'table:add';
      payload: { id: string; label: string; seats: number; zone: string };
    }
  | {
      type: 'menu:add';
      payload: { item: Omit<MenuItem, 'id'> };
    }
  | {
      type: 'menu:update';
      payload: { id: string; updates: Partial<Omit<MenuItem, 'id'>> };
    }
  | {
      type: 'menu:toggleAvailability';
      payload: { id: string; available: boolean };
    }
  | {
      type: 'menu:delete';
      payload: { id: string };
    }
  | {
      type: 'deal:add';
      payload: { deal: Omit<DealCombo, 'id'> };
    }
  | {
      type: 'deal:update';
      payload: { id: string; updates: Partial<Omit<DealCombo, 'id'>> };
    }
  | {
      type: 'deal:delete';
      payload: { id: string };
    }
  | {
      type: 'staff:updatePin';
      payload: { enabled: boolean; pin?: string };
    }
  | {
      type: 'settings:updateCurrency';
      payload: { currency: CurrencyConfig };
    }
  | {
      type: 'rewards:earn';
      payload: { tableId: string; points: number };
    }
  | {
      type: 'rewards:redeem';
      payload: { tableId: string; pointsCost: number; creditAmount: number };
    }
  | {
      type: 'game:move';
      payload: { tableId: string; index: number };
    }
  | {
      type: 'game:reset';
      payload: { tableId: string; mode?: 'solo' | 'table' };
    }
  | {
      type: 'bill:settle';
      payload: {
        tableId: string;
        splitMode: 'equal' | 'custom';
        splitCount: number;
        shares: number[];
        tipPercent: number;
        tipAmount: number;
        paymentMethod: PaymentMethod;
        payerName?: string;
        referenceNote?: string;
      };
    }
  | {
      type: 'sales:add';
      payload: {
        tableId: string;
        items: { menuItemId: string; size: PortionSize; quantity: number }[];
        tipAmount?: number;
        paymentMethod: PaymentMethod;
        payerName?: string;
        referenceNote?: string;
        paidAt?: number;
      };
    }
  | {
      type: 'expense:add';
      payload: {
        expense: Omit<ExpenseEntry, 'id' | 'createdAt' | 'updatedAt'>;
      };
    }
  | {
      type: 'expense:update';
      payload: {
        id: string;
        updates: Partial<Omit<ExpenseEntry, 'id' | 'createdAt' | 'updatedAt'>>;
      };
    }
  | {
      type: 'expense:delete';
      payload: { id: string };
    }
  | {
      type: 'receipt:sendEmail';
      payload: { tableId: string; settlementId: string; email: string };
    }
  | {
      type: 'review:submit';
      payload: { tableId: string; settlementId: string; rating: number; comment: string };
    }
  | {
      type: 'system:resetDemo';
    };

export type ServerMessage =
  | { type: 'state:sync'; payload: RestaurantState }
  | { type: 'error'; payload: { message: string } };
