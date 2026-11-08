// ==============================================================================
// METATRADER 5 (MT5) CONNECTOR & SYNCHRONIZATION TYPES
// ==============================================================================

export type MT5AccountMode = "demo" | "real";

export interface MT5ConnectorInfo {
  id: string;
  name: string;
  tokenPrefix: string;
  tokenHash?: string;
  createdAt: string;
  lastSyncAt?: string;
  status: "connected" | "disconnected" | "revoked";
  broker?: string;
  server?: string;
  accountNumber?: string; // Masked, e.g. "123***78"
  accountMode?: MT5AccountMode;
  currency?: string;
  leverage?: number;
  balance?: number;
  equity?: number;
  margin?: number;
  freeMargin?: number;
  openPositionsCount?: number;
  version?: string;
  revoked?: boolean;
  updatedAt?: string;
}

export interface MT5ConnectorTokenRecord {
  tokenHash: string;
  userId: string;
  connectorId: string;
  name: string;
  createdAt: string;
  revoked: boolean;
  lastUsedAt?: string;
}

export interface MT5AccountSummary {
  accountKey: string;
  login: number | string;
  maskedLogin: string;
  broker: string;
  server: string;
  accountMode: MT5AccountMode;
  currency: string;
  leverage: number;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel?: number;
  openPositionsCount: number;
  lastSyncAt: string;
  updatedAt: string;
}

export interface MT5PositionItem {
  ticket: number;
  identifier: number;
  symbol: string;
  direction: "buy" | "sell";
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  profit: number;
  swap: number;
  openTime: string;
  comment?: string;
  magic?: number;
  updatedAt: string;
}

export interface MT5DealItem {
  dealTicket: number;
  orderTicket: number;
  positionIdentifier: number;
  symbol: string;
  direction: "buy" | "sell";
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  time: string;
  entryType: "in" | "out" | "inout" | "out_by";
  reason?: string;
  comment?: string;
  magic?: number;
  createdAt: string;
}

export interface MT5PositionPayload {
  ticket: number;
  identifier: number;
  symbol: string;
  type: 0 | 1 | "buy" | "sell"; // 0: buy, 1: sell
  volume: number;
  openPrice: number;
  currentPrice?: number;
  sl: number;
  tp: number;
  profit?: number;
  swap?: number;
  openTime: number | string;
  comment?: string;
  magic?: number;
}

export interface MT5DealPayload {
  ticket: number;
  order: number;
  position: number;
  symbol: string;
  type: 0 | 1 | "buy" | "sell";
  entry: 0 | 1 | 2 | 3 | "in" | "out" | "inout" | "out_by";
  volume: number;
  price: number;
  profit: number;
  commission?: number;
  swap?: number;
  time: number | string;
  reason?: number | string;
  comment?: string;
  magic?: number;
}

export interface MT5SyncEvent {
  id: string; // e.g. "deal_12345" or "pos_67890_modify"
  type: "position_open" | "position_modify" | "position_partial_close" | "position_close" | "deal" | "heartbeat";
  timestamp: number;
  data: any;
}

export interface MT5WebhookPayload {
  version: string;
  account: {
    login: number | string;
    broker: string;
    server: string;
    name?: string;
    currency: string;
    leverage: number;
    isDemo: boolean;
    tradeMode?: "demo" | "real";
    balance: number;
    equity: number;
    margin: number;
    freeMargin: number;
    marginLevel?: number;
  };
  events?: MT5SyncEvent[];
  reconciliation?: {
    openPositions?: MT5PositionPayload[];
    recentDeals?: MT5DealPayload[];
  };
  timestamp: number;
}
