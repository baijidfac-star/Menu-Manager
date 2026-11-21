import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createSeedState } from './src/seedData.ts';
import type {
  BillSettlement,
  ClientAction,
  DealCombo,
  ExpenseEntry,
  MenuItem,
  Order,
  OrderItem,
  OrderStatus,
  RestaurantState,
  SalesLineItem,
  SalesTransaction,
  ServerMessage,
  TableSession,
  TicTacToeCell,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'restaurant-state.json');
const TAX_RATE = 0.085;
const SERVICE_RATE = 0.05;

function sanitizeImageUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/')
  ) {
    return trimmed;
  }
  return undefined;
}

function loadPersistentState(): RestaurantState {
  const seed = createSeedState();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<RestaurantState>;
      if (parsed && Array.isArray(parsed.menu) && Array.isArray(parsed.tables)) {
        const seedCostById = new Map(seed.menu.map((m) => [m.id, m.costPrice]));
        return {
          ...seed,
          ...parsed,
          currency:
            parsed.currency &&
            typeof parsed.currency.symbol === 'string' &&
            typeof parsed.currency.code === 'string'
              ? parsed.currency
              : seed.currency,
          staffPinEnabled: Boolean(parsed.staffPinEnabled ?? seed.staffPinEnabled),
          staffPin: typeof parsed.staffPin === 'string' && parsed.staffPin ? parsed.staffPin : seed.staffPin,
          menu: parsed.menu.map((item) => ({
            ...item,
            costPrice:
              item.costPrice !== undefined
                ? item.costPrice
                : seedCostById.get(item.id),
            available: item.available ?? true,
          })),
          deals: Array.isArray(parsed.deals) ? parsed.deals : seed.deals,
          orders: Array.isArray(parsed.orders) ? parsed.orders : seed.orders,
          sales: Array.isArray(parsed.sales) ? parsed.sales : seed.sales,
          expenses: Array.isArray(parsed.expenses) ? parsed.expenses : seed.expenses,
          reviews: Array.isArray(parsed.reviews) ? parsed.reviews : seed.reviews,
          nextOrderSeq:
            typeof parsed.nextOrderSeq === 'number' ? parsed.nextOrderSeq : seed.nextOrderSeq,
        };
      }
    }
  } catch (err) {
    console.warn('Could not load saved restaurant state, using seed data:', err);
  }
  savePersistentState(seed);
  return seed;
}

function savePersistentState(currentState: RestaurantState) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(currentState, null, 2), 'utf-8');
    fs.renameSync(tmpFile, STATE_FILE);
  } catch (err) {
    console.error('Failed to persist restaurant state:', err);
  }
}

let state: RestaurantState = loadPersistentState();
const processedClientOrderIds = new Set<string>();

function checkTicTacToeWinner(board: TicTacToeCell[]): 'X' | 'O' | 'Draw' | null {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  if (board.every((cell) => cell !== null)) {
    return 'Draw';
  }
  return null;
}

function chooseBotMove(board: TicTacToeCell[]): number {
  const empty = board
    .map((val, idx) => (val === null ? idx : -1))
    .filter((idx) => idx !== -1);
  if (empty.length === 0) return -1;

  for (const idx of empty) {
    const copy = [...board];
    copy[idx] = 'O';
    if (checkTicTacToeWinner(copy) === 'O') return idx;
  }
  for (const idx of empty) {
    const copy = [...board];
    copy[idx] = 'X';
    if (checkTicTacToeWinner(copy) === 'X') return idx;
  }
  if (board[4] === null) return 4;
  const corners = [0, 2, 6, 8].filter((idx) => board[idx] === null);
  if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
  return empty[0];
}

function recalculateOrderStatus(order: Order): OrderStatus {
  if (order.status === 'Placed' || order.status === 'Served') {
    return order.status;
  }
  const allReady = order.items.every((item) => item.itemStatus === 'Ready');
  if (allReady) return 'Ready';
  const anyPreparingOrReady = order.items.some(
    (item) => item.itemStatus === 'Preparing' || item.itemStatus === 'Ready'
  );
  if (anyPreparingOrReady) return 'Preparing';
  return 'Sent to Kitchen';
}

function computeTableUnsettledTotals(tableId: string, redeemedCredit: number) {
  const unsettledOrders = state.orders.filter(
    (o) => o.tableId === tableId && !o.settled
  );
  let subtotal = 0;
  let discount = 0;
  let cogs = 0;
  const itemsSnapshot: BillSettlement['itemsSnapshot'] = [];
  const salesItems: SalesLineItem[] = [];

  for (const order of unsettledOrders) {
    for (const item of order.items) {
      const gross = item.unitPrice * item.quantity;
      const itemDisc = item.discountPerUnit * item.quantity;
      const lineTotal = Math.max(0, gross - itemDisc);
      const menuMatch = state.menu.find((m) => m.id === item.menuItemId);
      const unitCost = Math.max(0, Number((item.costPrice ?? menuMatch?.costPrice ?? 0).toFixed(2)));
      const lineCost = Number((unitCost * item.quantity).toFixed(2));
      subtotal += gross;
      discount += itemDisc;
      cogs += lineCost;
      itemsSnapshot.push({
        name: item.name,
        size: item.size,
        quantity: item.quantity,
        lineTotal,
      });
      salesItems.push({
        menuItemId: item.menuItemId,
        name: item.name,
        size: item.size,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        costPrice: unitCost,
        lineTotal: Number(lineTotal.toFixed(2)),
        lineCost,
      });
    }
  }

  const netBeforeTax = Math.max(0, subtotal - discount - redeemedCredit);
  const tax = Number((netBeforeTax * TAX_RATE).toFixed(2));
  const serviceCharge = Number((netBeforeTax * SERVICE_RATE).toFixed(2));
  return {
    unsettledOrders,
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    cogs: Number(cogs.toFixed(2)),
    tax,
    serviceCharge,
    netBeforeTax,
    itemsSnapshot,
    salesItems,
  };
}

function applyAction(action: ClientAction): string | null {
  const now = Date.now();

  switch (action.type) {
    case 'order:place': {
      const { tableId, items, clientOrderId } = action.payload;
      if (clientOrderId && processedClientOrderIds.has(clientOrderId)) {
        return null;
      }
      const table = state.tables.find((t) => t.id === tableId);
      if (!table) return `Unknown table ${tableId}`;
      if (!Array.isArray(items) || items.length === 0) return 'Order has no items';

      const orderItems: OrderItem[] = [];
      for (let i = 0; i < items.length; i++) {
        const req = items[i];
        const menuItem = state.menu.find((m) => m.id === req.menuItemId);
        if (!menuItem || req.quantity <= 0) continue;
        if (!menuItem.available) {
          return `"${menuItem.name}" was just marked Sold Out. Please remove it from your cart.`;
        }
        const sizeOpt =
          menuItem.sizes.find((s) => s.size === req.size) ?? menuItem.sizes[0];
        const unitPrice = Math.max(1, menuItem.basePrice + sizeOpt.priceDelta);
        orderItems.push({
          id: `oi-${now}-${i}-${Math.floor(Math.random() * 1000)}`,
          menuItemId: menuItem.id,
          name: menuItem.name,
          station: menuItem.station,
          size: sizeOpt.size,
          quantity: Math.min(20, Math.floor(req.quantity)),
          unitPrice,
          costPrice: menuItem.costPrice ?? 0,
          discountPerUnit: menuItem.dealDiscount ?? 0,
          notes: req.notes?.trim() ? req.notes.trim().slice(0, 120) : undefined,
          itemStatus: 'Pending',
        });
      }

      if (orderItems.length === 0) return 'No valid menu items in order';

      const orderId = `ORD-${state.nextOrderSeq++}`;
      const newOrder: Order = {
        id: orderId,
        tableId,
        items: orderItems,
        status: 'Placed',
        createdAt: now,
        updatedAt: now,
        settled: false,
      };
      state.orders.unshift(newOrder);

      if (table.status === 'Free') {
        table.status = 'Occupied';
      }
      table.lastSettlement = null;

      const itemCount = orderItems.reduce((acc, it) => acc + it.quantity, 0);
      table.rewardsPoints += 25 + itemCount * 5;

      if (clientOrderId) {
        processedClientOrderIds.add(clientOrderId);
      }
      return null;
    }

    case 'order:dispatch': {
      const order = state.orders.find((o) => o.id === action.payload.orderId);
      if (!order) return 'Order not found';
      if (order.status === 'Placed') {
        order.status = 'Sent to Kitchen';
        order.updatedAt = now;
      }
      return null;
    }

    case 'order:updateStatus': {
      const order = state.orders.find((o) => o.id === action.payload.orderId);
      if (!order) return 'Order not found';
      order.status = action.payload.status;
      order.updatedAt = now;
      if (action.payload.status === 'Ready' || action.payload.status === 'Served') {
        order.items.forEach((it) => {
          it.itemStatus = 'Ready';
        });
      } else if (action.payload.status === 'Preparing') {
        order.items.forEach((it) => {
          if (it.itemStatus === 'Pending') it.itemStatus = 'Preparing';
        });
      }
      return null;
    }

    case 'kds:stationAction': {
      const { orderId, station, itemStatus } = action.payload;
      const order = state.orders.find((o) => o.id === orderId);
      if (!order) return 'Order not found';

      let touched = false;
      for (const item of order.items) {
        if (!station || item.station === station) {
          item.itemStatus = itemStatus;
          touched = true;
        }
      }
      if (!touched) return null;

      if (order.status === 'Placed') {
        order.status = 'Sent to Kitchen';
      }
      order.status = recalculateOrderStatus(order);
      order.updatedAt = now;
      return null;
    }

    case 'waiter:call': {
      const table = state.tables.find((t) => t.id === action.payload.tableId);
      if (!table) return 'Table not found';
      table.status = 'Needs Help';
      table.waiterCall = {
        active: true,
        requestedAt: now,
        status: 'Requested',
        reason: action.payload.reason?.trim() || 'Guest requested assistance',
      };
      return null;
    }

    case 'waiter:respond': {
      const table = state.tables.find((t) => t.id === action.payload.tableId);
      if (!table) return 'Table not found';
      const hasUnsettledOrders = state.orders.some(
        (o) => o.tableId === table.id && !o.settled
      );
      if (action.payload.action === 'acknowledge') {
        table.waiterCall = {
          ...table.waiterCall,
          active: true,
          status: 'Acknowledged',
        };
      } else if (action.payload.action === 'arrived') {
        table.waiterCall = {
          active: false,
          requestedAt: null,
          status: 'Arrived',
          reason: table.waiterCall.reason,
        };
        table.status = 'Occupied';
      } else if (action.payload.action === 'clear') {
        table.waiterCall = {
          active: false,
          requestedAt: null,
          status: 'None',
        };
        table.status = hasUnsettledOrders ? 'Occupied' : 'Free';
      }
      return null;
    }

    case 'table:setStatus': {
      const table = state.tables.find((t) => t.id === action.payload.tableId);
      if (!table) return 'Table not found';
      table.status = action.payload.status;
      if (action.payload.status === 'Free') {
        table.waiterCall = { active: false, requestedAt: null, status: 'None' };
        state.orders.forEach((o) => {
          if (o.tableId === table.id) o.settled = true;
        });
        table.redeemedRewardCredit = 0;
        table.lastSettlement = null;
      }
      return null;
    }

    case 'table:add': {
      const rawId = action.payload.id.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12);
      if (!rawId) return 'Table ID is required';
      if (state.tables.some((t) => t.id.toUpperCase() === rawId)) {
        return `Table ${rawId} already exists`;
      }
      const newTable: TableSession = {
        id: rawId,
        label: action.payload.label.trim().slice(0, 32) || `Table ${rawId}`,
        seats: Math.max(1, Math.min(20, Math.round(action.payload.seats || 4))),
        zone: action.payload.zone.trim().slice(0, 24) || 'Main Hall',
        status: 'Free',
        waiterCall: { active: false, requestedAt: null, status: 'None' },
        rewardsPoints: 0,
        redeemedRewardCredit: 0,
        ticTacToe: {
          board: Array(9).fill(null),
          turn: 'X',
          winner: null,
          mode: 'solo',
          scores: { X: 0, O: 0, draws: 0 },
        },
        lastSettlement: null,
      };
      state.tables.push(newTable);
      return null;
    }

    case 'menu:add': {
      const incoming = action.payload.item;
      const name = incoming.name?.trim();
      if (!name) return 'Dish name is required';
      const basePrice = Number(incoming.basePrice);
      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        return 'Base price must be greater than 0';
      }
      const rawCost = incoming.costPrice !== undefined ? Number(incoming.costPrice) : undefined;
      const costPrice =
        rawCost !== undefined && Number.isFinite(rawCost) && rawCost >= 0
          ? Number(rawCost.toFixed(2))
          : undefined;
      const newDish: MenuItem = {
        id: `m-${now}-${Math.floor(Math.random() * 1000)}`,
        name: name.slice(0, 80),
        description: (incoming.description ?? '').trim().slice(0, 240) || 'Freshly prepared to order.',
        category: incoming.category,
        station: incoming.station,
        basePrice: Number(basePrice.toFixed(2)),
        costPrice,
        sizes:
          Array.isArray(incoming.sizes) && incoming.sizes.length > 0
            ? incoming.sizes
            : [
                { size: 'S', label: 'Small', priceDelta: -2 },
                { size: 'M', label: 'Regular', priceDelta: 0 },
                { size: 'L', label: 'Large', priceDelta: 5 },
              ],
        allergens: Array.isArray(incoming.allergens)
          ? incoming.allergens.map((a) => a.trim()).filter(Boolean)
          : [],
        spiceLevel: incoming.spiceLevel ?? 0,
        image: sanitizeImageUrl(incoming.image),
        dealTag: incoming.dealTag?.trim() || undefined,
        dealDiscount:
          incoming.dealDiscount && incoming.dealDiscount > 0
            ? Number(incoming.dealDiscount.toFixed(2))
            : undefined,
        prepMinutes: Math.max(1, Math.min(60, Math.round(incoming.prepMinutes || 10))),
        available: incoming.available ?? true,
      };
      state.menu.unshift(newDish);
      return null;
    }

    case 'menu:update': {
      const idx = state.menu.findIndex((m) => m.id === action.payload.id);
      if (idx === -1) return 'Dish not found';
      const current = state.menu[idx];
      const u = action.payload.updates;
      const nextPrice =
        u.basePrice !== undefined ? Number(u.basePrice) : current.basePrice;
      if (!Number.isFinite(nextPrice) || nextPrice <= 0) {
        return 'Price must be greater than 0';
      }
      let nextCost = current.costPrice;
      if ('costPrice' in u) {
        if (u.costPrice === undefined || u.costPrice === null || Number.isNaN(Number(u.costPrice))) {
          nextCost = undefined;
        } else {
          const parsedCost = Number(u.costPrice);
          if (parsedCost < 0) return 'Cost price cannot be negative';
          nextCost = Number(parsedCost.toFixed(2));
        }
      }
      state.menu[idx] = {
        ...current,
        ...u,
        name: u.name !== undefined ? u.name.trim().slice(0, 80) || current.name : current.name,
        description:
          u.description !== undefined
            ? u.description.trim().slice(0, 240)
            : current.description,
        basePrice: Number(nextPrice.toFixed(2)),
        costPrice: nextCost,
        image: u.image !== undefined ? sanitizeImageUrl(u.image) : current.image,
        dealTag: u.dealTag !== undefined ? u.dealTag.trim() || undefined : current.dealTag,
        dealDiscount:
          u.dealDiscount !== undefined
            ? u.dealDiscount > 0
              ? Number(u.dealDiscount.toFixed(2))
              : undefined
            : current.dealDiscount,
      };
      return null;
    }

    case 'menu:toggleAvailability': {
      const item = state.menu.find((m) => m.id === action.payload.id);
      if (!item) return 'Dish not found';
      item.available = Boolean(action.payload.available);
      return null;
    }

    case 'menu:delete': {
      const before = state.menu.length;
      state.menu = state.menu.filter((m) => m.id !== action.payload.id);
      if (state.menu.length === before) return 'Dish not found';
      state.deals = state.deals
        .map((deal) => ({
          ...deal,
          menuItemIds: deal.menuItemIds.filter((id) => id !== action.payload.id),
        }))
        .filter((deal) => deal.menuItemIds.length > 0);
      return null;
    }

    case 'deal:add': {
      const d = action.payload.deal;
      if (!d.title?.trim()) return 'Combo title is required';
      if (!Array.isArray(d.menuItemIds) || d.menuItemIds.length === 0) {
        return 'Select at least one dish for the combo';
      }
      const regularPrice = d.menuItemIds.reduce((sum, id) => {
        const m = state.menu.find((x) => x.id === id);
        return sum + (m ? m.basePrice : 0);
      }, 0);
      const stations = Array.from(
        new Set(
          d.menuItemIds
            .map((id) => state.menu.find((x) => x.id === id)?.station)
            .filter(Boolean)
        )
      ).join(' + ');
      const newDeal: DealCombo = {
        id: `deal-${now}`,
        title: d.title.trim().slice(0, 60),
        subtitle: d.subtitle?.trim().slice(0, 120) || 'Curated table bundle',
        menuItemIds: d.menuItemIds,
        bundlePrice: Math.max(1, Number(d.bundlePrice.toFixed(2))),
        regularPrice: Number((d.regularPrice || regularPrice).toFixed(2)),
        stationSummary: d.stationSummary || stations || 'Kitchen',
      };
      state.deals.unshift(newDeal);
      return null;
    }

    case 'deal:update': {
      const idx = state.deals.findIndex((d) => d.id === action.payload.id);
      if (idx === -1) return 'Deal not found';
      const cur = state.deals[idx];
      const u = action.payload.updates;
      const nextIds = u.menuItemIds ?? cur.menuItemIds;
      const regularPrice = nextIds.reduce((sum, id) => {
        const m = state.menu.find((x) => x.id === id);
        return sum + (m ? m.basePrice : 0);
      }, 0);
      state.deals[idx] = {
        ...cur,
        ...u,
        bundlePrice:
          u.bundlePrice !== undefined
            ? Math.max(1, Number(u.bundlePrice.toFixed(2)))
            : cur.bundlePrice,
        regularPrice: u.menuItemIds ? Number(regularPrice.toFixed(2)) : u.regularPrice ?? cur.regularPrice,
      };
      return null;
    }

    case 'deal:delete': {
      state.deals = state.deals.filter((d) => d.id !== action.payload.id);
      return null;
    }

    case 'staff:updatePin': {
      state.staffPinEnabled = Boolean(action.payload.enabled);
      if (action.payload.pin && action.payload.pin.trim().length >= 4) {
        state.staffPin = action.payload.pin.trim().slice(0, 8);
      }
      return null;
    }

    case 'settings:updateCurrency': {
      const incoming = action.payload.currency;
      const code = incoming?.code?.trim().toUpperCase().slice(0, 8);
      const symbol = incoming?.symbol?.trim().slice(0, 6);
      const name = incoming?.name?.trim().slice(0, 48);
      if (!code || !symbol) {
        return 'Currency code and symbol are required';
      }
      state.currency = {
        code,
        symbol,
        name: name || code,
      };
      return null;
    }

    case 'rewards:earn': {
      const table = state.tables.find((t) => t.id === action.payload.tableId);
      if (!table) return 'Table not found';
      const pts = Math.max(0, Math.min(200, Math.floor(action.payload.points)));
      table.rewardsPoints += pts;
      return null;
    }

    case 'rewards:redeem': {
      const table = state.tables.find((t) => t.id === action.payload.tableId);
      if (!table) return 'Table not found';
      const { pointsCost, creditAmount } = action.payload;
      if (table.rewardsPoints < pointsCost) {
        return 'Not enough reward points';
      }
      table.rewardsPoints -= pointsCost;
      table.redeemedRewardCredit += creditAmount;
      return null;
    }

    case 'game:move': {
      const table = state.tables.find((t) => t.id === action.payload.tableId);
      if (!table) return 'Table not found';
      const game = table.ticTacToe;
      const idx = action.payload.index;
      if (idx < 0 || idx > 8 || game.board[idx] !== null || game.winner !== null) {
        return null;
      }

      game.board[idx] = game.turn;
      let winner = checkTicTacToeWinner(game.board);
      if (winner) {
        game.winner = winner;
        if (winner === 'X') {
          game.scores.X += 1;
          table.rewardsPoints += 15;
        } else if (winner === 'O') {
          game.scores.O += 1;
        } else {
          game.scores.draws += 1;
          table.rewardsPoints += 5;
        }
        return null;
      }

      game.turn = game.turn === 'X' ? 'O' : 'X';

      if (game.mode === 'solo' && game.turn === 'O') {
        const botIdx = chooseBotMove(game.board);
        if (botIdx !== -1) {
          game.board[botIdx] = 'O';
          winner = checkTicTacToeWinner(game.board);
          if (winner) {
            game.winner = winner;
            if (winner === 'O') game.scores.O += 1;
            else if (winner === 'Draw') {
              game.scores.draws += 1;
              table.rewardsPoints += 5;
            }
          } else {
            game.turn = 'X';
          }
        }
      }
      return null;
    }

    case 'game:reset': {
      const table = state.tables.find((t) => t.id === action.payload.tableId);
      if (!table) return 'Table not found';
      table.ticTacToe = {
        ...table.ticTacToe,
        board: Array(9).fill(null),
        turn: 'X',
        winner: null,
        mode: action.payload.mode ?? table.ticTacToe.mode,
      };
      return null;
    }

    case 'bill:settle': {
      const {
        tableId,
        splitMode,
        splitCount,
        shares,
        tipPercent,
        tipAmount,
        paymentMethod,
        payerName,
        referenceNote,
      } = action.payload;
      const table = state.tables.find((t) => t.id === tableId);
      if (!table) return 'Table not found';

      const cleanMethod = String(paymentMethod || '').trim().slice(0, 40) || 'Cash';
      const cleanPayer = payerName?.trim().slice(0, 60) || undefined;
      const cleanNote = referenceNote?.trim().slice(0, 120) || undefined;

      const totals = computeTableUnsettledTotals(
        tableId,
        table.redeemedRewardCredit
      );
      if (totals.unsettledOrders.length === 0) {
        return 'No active items to settle';
      }

      const safeTip = Math.max(0, Number(tipAmount.toFixed(2)));
      const grandTotal = Number(
        (totals.netBeforeTax + totals.tax + totals.serviceCharge + safeTip).toFixed(2)
      );
      const receiptId = `RCPT-${now.toString().slice(-6)}`;

      const settlement: BillSettlement = {
        id: receiptId,
        tableId,
        subtotal: totals.subtotal,
        discount: totals.discount,
        rewardCredit: table.redeemedRewardCredit,
        tax: totals.tax,
        serviceCharge: totals.serviceCharge,
        tipAmount: safeTip,
        tipPercent,
        total: grandTotal,
        splitMode,
        splitCount: Math.max(1, splitCount),
        shares,
        paymentMethod: cleanMethod,
        payerName: cleanPayer,
        referenceNote: cleanNote,
        paidAt: now,
        itemsSnapshot: totals.itemsSnapshot,
      };

      const transaction: SalesTransaction = {
        id: `TXN-${now.toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`,
        receiptId,
        orderIds: totals.unsettledOrders.map((o) => o.id),
        tableId: table.id,
        tableLabel: table.label,
        paidAt: now,
        items: totals.salesItems,
        subtotal: totals.subtotal,
        discount: totals.discount,
        rewardCredit: table.redeemedRewardCredit,
        tax: totals.tax,
        serviceCharge: totals.serviceCharge,
        tipAmount: safeTip,
        total: grandTotal,
        cogs: totals.cogs,
        paymentMethod: cleanMethod,
        payerName: cleanPayer,
        referenceNote: cleanNote,
      };
      state.sales.unshift(transaction);

      totals.unsettledOrders.forEach((order) => {
        order.settled = true;
      });
      table.redeemedRewardCredit = 0;
      table.rewardsPoints += Math.max(10, Math.round(grandTotal));
      table.waiterCall = { active: false, requestedAt: null, status: 'None' };
      table.status = 'Free';
      table.lastSettlement = settlement;
      return null;
    }

    case 'sales:add': {
      const { tableId, items, tipAmount = 0, paymentMethod, payerName, referenceNote, paidAt } =
        action.payload;
      if (!Array.isArray(items) || items.length === 0) {
        return 'Select at least one dish for the sale';
      }
      const table = state.tables.find((t) => t.id === tableId);
      const resolvedTableId = table ? table.id : tableId.trim().toUpperCase() || 'COUNTER';
      const resolvedTableLabel = table ? table.label : resolvedTableId === 'COUNTER' ? 'Counter / Takeaway' : resolvedTableId;
      const cleanMethod = String(paymentMethod || '').trim().slice(0, 40) || 'Cash';

      let subtotal = 0;
      let discount = 0;
      let cogs = 0;
      const salesItems: SalesLineItem[] = [];

      for (const req of items) {
        const menuItem = state.menu.find((m) => m.id === req.menuItemId);
        if (!menuItem || req.quantity <= 0) continue;
        const sizeOpt = menuItem.sizes.find((s) => s.size === req.size) ?? menuItem.sizes[0];
        const qty = Math.min(50, Math.floor(req.quantity));
        const unitPrice = Math.max(1, menuItem.basePrice + sizeOpt.priceDelta);
        const unitDisc = menuItem.dealDiscount ?? 0;
        const gross = unitPrice * qty;
        const itemDisc = unitDisc * qty;
        const lineTotal = Math.max(0, gross - itemDisc);
        const unitCost = Math.max(0, Number((menuItem.costPrice ?? 0).toFixed(2)));
        const lineCost = Number((unitCost * qty).toFixed(2));
        subtotal += gross;
        discount += itemDisc;
        cogs += lineCost;
        salesItems.push({
          menuItemId: menuItem.id,
          name: menuItem.name,
          size: sizeOpt.size,
          quantity: qty,
          unitPrice,
          costPrice: unitCost,
          lineTotal: Number(lineTotal.toFixed(2)),
          lineCost,
        });
      }

      if (salesItems.length === 0) return 'No valid dishes in sale';

      const netBeforeTax = Math.max(0, subtotal - discount);
      const tax = Number((netBeforeTax * TAX_RATE).toFixed(2));
      const serviceCharge = Number((netBeforeTax * SERVICE_RATE).toFixed(2));
      const safeTip = Math.max(0, Number((Number(tipAmount) || 0).toFixed(2)));
      const total = Number((netBeforeTax + tax + serviceCharge + safeTip).toFixed(2));
      const orderId = `ORD-${state.nextOrderSeq++}`;
      const receiptId = `RCPT-${now.toString().slice(-6)}`;

      const tx: SalesTransaction = {
        id: `TXN-${now.toString().slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`,
        receiptId,
        orderIds: [orderId],
        tableId: resolvedTableId,
        tableLabel: resolvedTableLabel,
        paidAt: typeof paidAt === 'number' && Number.isFinite(paidAt) ? paidAt : now,
        items: salesItems,
        subtotal: Number(subtotal.toFixed(2)),
        discount: Number(discount.toFixed(2)),
        rewardCredit: 0,
        tax,
        serviceCharge,
        tipAmount: safeTip,
        total,
        cogs: Number(cogs.toFixed(2)),
        paymentMethod: cleanMethod,
        payerName: payerName?.trim().slice(0, 60) || undefined,
        referenceNote: referenceNote?.trim().slice(0, 120) || undefined,
      };
      state.sales.unshift(tx);
      state.sales.sort((a, b) => b.paidAt - a.paidAt);
      return null;
    }

    case 'expense:add': {
      const incoming = action.payload.expense;
      const amount = Number(incoming?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return 'Expense amount must be greater than 0';
      }
      const dateStr = (incoming.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return 'Valid expense date (YYYY-MM-DD) is required';
      }
      const cleanMethod = String(incoming.paymentMethod || '').trim().slice(0, 40) || 'Cash';
      const entry: ExpenseEntry = {
        id: `exp-${now}-${Math.floor(Math.random() * 900 + 100)}`,
        date: dateStr,
        category: incoming.category,
        amount: Number(amount.toFixed(2)),
        paymentMethod: cleanMethod,
        note: (incoming.note || '').trim().slice(0, 200) || incoming.category,
        createdAt: now,
        updatedAt: now,
      };
      state.expenses.unshift(entry);
      state.expenses.sort((a, b) => (b.date !== a.date ? b.date.localeCompare(a.date) : b.createdAt - a.createdAt));
      return null;
    }

    case 'expense:update': {
      const idx = state.expenses.findIndex((e) => e.id === action.payload.id);
      if (idx === -1) return 'Expense entry not found';
      const current = state.expenses[idx];
      const u = action.payload.updates;
      const nextAmount = u.amount !== undefined ? Number(u.amount) : current.amount;
      if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
        return 'Expense amount must be greater than 0';
      }
      const nextDate = u.date !== undefined ? u.date.trim() : current.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
        return 'Valid expense date (YYYY-MM-DD) is required';
      }
      state.expenses[idx] = {
        ...current,
        ...u,
        date: nextDate,
        amount: Number(nextAmount.toFixed(2)),
        paymentMethod:
          u.paymentMethod !== undefined
            ? String(u.paymentMethod).trim().slice(0, 40) || current.paymentMethod
            : current.paymentMethod,
        note:
          u.note !== undefined
            ? u.note.trim().slice(0, 200) || current.category
            : current.note,
        updatedAt: now,
      };
      state.expenses.sort((a, b) => (b.date !== a.date ? b.date.localeCompare(a.date) : b.createdAt - a.createdAt));
      return null;
    }

    case 'expense:delete': {
      const before = state.expenses.length;
      state.expenses = state.expenses.filter((e) => e.id !== action.payload.id);
      if (state.expenses.length === before) return 'Expense entry not found';
      return null;
    }

    case 'receipt:sendEmail': {
      const table = state.tables.find((t) => t.id === action.payload.tableId);
      if (!table || !table.lastSettlement) return 'Receipt not found';
      if (table.lastSettlement.id !== action.payload.settlementId) return null;
      table.lastSettlement.receiptEmail = action.payload.email.trim();
      return null;
    }

    case 'review:submit': {
      const table = state.tables.find((t) => t.id === action.payload.tableId);
      if (!table || !table.lastSettlement) return 'Settlement not found';
      const rating = Math.max(1, Math.min(5, Math.round(action.payload.rating)));
      const comment = action.payload.comment.trim().slice(0, 400);
      table.lastSettlement.reviewRating = rating;
      table.lastSettlement.reviewComment = comment;
      state.reviews.unshift({
        id: `rev-${now}`,
        tableId: table.id,
        rating,
        comment: comment || `${rating}/5 stars from ${table.label}`,
        createdAt: now,
      });
      return null;
    }

    case 'system:resetDemo': {
      state = createSeedState();
      processedClientOrderIds.clear();
      return null;
    }

    default:
      return 'Unknown action';
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, restaurant: state.restaurantName });
  });

  app.get('/api/state', (_req, res) => {
    res.json(state);
  });

  app.post('/api/action', (req, res) => {
    const action = req.body as ClientAction;
    if (!action || typeof action.type !== 'string') {
      res.status(400).json({ error: 'Invalid action payload' });
      return;
    }
    const err = applyAction(action);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }
    savePersistentState(state);
    broadcastState();
    res.json({ ok: true, state });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  function broadcastState() {
    const payload: ServerMessage = { type: 'state:sync', payload: state };
    const serialized = JSON.stringify(payload);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    });
  }

  wss.on('connection', (ws) => {
    const initial: ServerMessage = { type: 'state:sync', payload: state };
    ws.send(JSON.stringify(initial));

    ws.on('message', (raw) => {
      try {
        const action = JSON.parse(raw.toString()) as ClientAction;
        if (!action || typeof action.type !== 'string') return;
        const err = applyAction(action);
        if (err) {
          const errMsg: ServerMessage = { type: 'error', payload: { message: err } };
          ws.send(JSON.stringify(errMsg));
          return;
        }
        savePersistentState(state);
        broadcastState();
      } catch {
        const errMsg: ServerMessage = {
          type: 'error',
          payload: { message: 'Malformed WebSocket payload' },
        };
        ws.send(JSON.stringify(errMsg));
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Bistro Solis TableOS server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
