export type SupportedDeskTimeframe = "H1" | "M15" | "M5";
export type TradingDeskSession = "asia" | "london" | "newyork" | "overlap" | string;

export interface MarketSnapshot {
  symbol: string;
  timeframe: SupportedDeskTimeframe;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
  session: TradingDeskSession;
  receivedAt: string;
}

export interface CandleItem {
  symbol: string;
  timeframe: SupportedDeskTimeframe;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
  session?: TradingDeskSession;
  receivedAt?: string;
}

export interface TwelveDataProviderStatus {
  source: "twelve_data";
  lastFetchM5: number;
  lastFetchM15: number;
  lastFetchH1: number;
  lastSuccessfulSync: number;
  lastError: string | null;
  updatedAt: number;
}

export interface TwelveDataDailyUsage {
  requestsM5: number;
  requestsM15: number;
  requestsH1: number;
  totalRequests: number;
  updatedAt: number;
}

export interface TimeframeFeedStatus {
  source: "twelve_data" | "firestore_cache";
  count: number;
  latestTimestamp: number | null;
  ageSeconds: number | null;
  fresh: boolean;
}

export interface QuotaStatus {
  estimatedUsedToday: number;
  softLimitReached: boolean;
  hardLimitReached: boolean;
  maxDailyLimit: number;
}

export type MarketDataSource = "twelve_data" | "twelvedata" | "tradingview" | "cache" | "none";

export interface MarketDataApiResponse {
  ok?: boolean;
  success: boolean;
  source: MarketDataSource;
  symbol: string;
  hasApiKey: boolean;
  status: "ok" | "missing_api_key" | "rate_limited" | "error" | "cached" | "market_closed" | "quota_exceeded";
  message?: string;
  error?: string;
  lastUpdated: string;
  activeSession: TradingDeskSession;
  lastPrice: number | null;
  snapshots: {
    H1: MarketSnapshot | null;
    M15: MarketSnapshot | null;
    M5: MarketSnapshot | null;
  };
  candles: {
    H1: CandleItem[];
    M15: CandleItem[];
    M5: CandleItem[];
  };
  cacheInfo?: {
    h1AgeSeconds: number | null;
    m15AgeSeconds: number | null;
    m5AgeSeconds: number | null;
  };
  upstreamRequestsMade?: number;
  timeframes?: Record<SupportedDeskTimeframe, TimeframeFeedStatus>;
  quota?: QuotaStatus;
  marketStatus?: {
    isOpen: boolean;
    reason?: string;
  };
}

export enum SetupDecisionType {
  BUY_SETUP_VALID = "BUY_SETUP_VALID",
  SELL_SETUP_VALID = "SELL_SETUP_VALID",
  WAIT_BUY = "WAIT_BUY",
  WAIT_SELL = "WAIT_SELL",
  NO_TRADE = "NO_TRADE",
  SETUP_EXPIRED = "SETUP_EXPIRED",
  SETUP_FORMING = "SETUP_FORMING",
  /** @deprecated backward compatibility with historical records */
  VALID_SETUP = "VALID_SETUP",
  /** @deprecated backward compatibility with historical records */
  WAIT = "WAIT",
}

export type DecisionLabelIndo =
  | "SETUP BUY VALID"
  | "SETUP SELL VALID"
  | "TUNGGU BUY"
  | "TUNGGU SELL"
  | "TIDAK ADA TRADE"
  | "SETUP KEDALUWARSA"
  | "SETUP TERBENTUK"
  | "SETUP VALID"
  | "TUNGGU";

export type ConfidenceLabel = "Kuat" | "Sedang" | "Lemah" | "Tinggi" | "Rendah";
export type ChecklistItemStatus = "passed" | "waiting" | "failed";
export type RiskFilterStatus = "AMAN" | "PERINGATAN" | "DIBLOKIR";

export interface ConfluenceChecklistItem {
  id: string;
  label: string;
  status: ChecklistItemStatus;
  detail: string;
}

export interface H1AnalysisResult {
  bias: "Bullish" | "Bearish" | "Netral";
  structure: "HH / HL" | "LH / LL" | "Range / tidak jelas";
  momentum: "Kelanjutan kuat" | "Melemah" | "Bercampur";
  reason: string;
  recentHigh: number | null;
  recentLow: number | null;
  candleCount: number;
}

export interface M15AnalysisResult {
  location: "Diskon (Area Beli)" | "Premium (Area Jual)" | "Equilibrium / Tengah" | "Area Belum Jelas";
  zoneType: string;
  pullbackStatus: "Pullback Valid" | "Sedang Berjalan" | "Tidak Ada Pullback" | "Overextended";
  matchesH1Bias: boolean;
  isFirstTouch: boolean;
  rangeHigh: number | null;
  rangeLow: number | null;
  equilibrium: number | null;
  reason: string;
  candleCount: number;
}

export interface LiquidityAnalysisResult {
  status: "Likuiditas atas tersapu" | "Likuiditas bawah tersapu" | "Likuiditas belum tersapu" | "Tidak ada sweep yang jelas";
  bslLevel: number | null;
  sslLevel: number | null;
  sweptPrice: number | null;
  sweepDetected: boolean;
  reason: string;
}

export interface M5ConfirmationResult {
  status: "Bullish terkonfirmasi" | "Bearish terkonfirmasi" | "Menunggu retest" | "Belum ada CHoCH/MSS" | "Konfirmasi tidak valid";
  chochDetected: boolean;
  displacementDetected: boolean;
  retestStatus: "Menunggu" | "Valid" | "Gagal" | "Belum ada";
  breakLevel: number | null;
  reason: string;
  candleCount: number;
}

export interface RiskAnalysisResult {
  status: "Aman" | "Waspada" | "Terlalu Berisiko";
  riskFilter: RiskFilterStatus;
  reasons: string[];
  isBreached: boolean;
  dailyLossSoFar: number;
  consecutiveLossesSoFar: number;
  tradesToday: number;
}

export interface ExecutionPlan {
  direction: "BUY" | "SELL";
  entryLow: number;
  entryHigh: number;
  referenceEntry: number;
  stopLoss: number;
  tp1: number;
  tp2: number | null;
  rrToTp1: number;
  rrToTp2: number | null;
  invalidationLevel: number;
  invalidationReason: string;
  setupCreatedAt: number;
  setupExpiresAt: number;
  marketPriceAtSignal: number;
  // Compatibility references
  entryArea: string;
  entryZone?: string;
  stopLossRef?: number;
  takeProfitRef?: number;
  estimatedRR?: number;
  rr: number;
  invalidation: string;
  timestamp: number;
  dataFreshness: string;
  htfBias?: string;
  m15Area?: string;
  liquidityEvent?: string;
  m5Confirmation?: string;
  sessionNote?: string;
  riskStatus?: string;
}

export interface DataQualityStatus {
  isFresh: boolean;
  isMarketClosed: boolean;
  analysisAllowed: boolean;
  candleCounts: Record<SupportedDeskTimeframe, number>;
  latestTimestamp: number | null;
  freshnessStatus: string;
  reason: string | null;
}

export interface SetupDecision {
  decision: SetupDecisionType;
  decisionLabelIndo: DecisionLabelIndo;
  marketRegime: string;
  confidence: ConfidenceLabel;
  reasons: string[];
  invalidationText: string;
}

export interface AiDeskAnalysisRecord {
  id?: string;
  setupAnalysisId: string;
  symbol: string;
  direction: "BUY" | "SELL" | "NONE";
  state: SetupDecisionType;
  decisionLabelIndo: DecisionLabelIndo;
  confidence: "Kuat" | "Sedang" | "Lemah";
  h1Bias: string;
  m15Pullback: string;
  liquiditySweep: string;
  m5StructureShift: string;
  displacement: string;
  retest: string;
  riskStatus: RiskFilterStatus;
  entryZone?: string;
  entryLow?: number;
  entryHigh?: number;
  referenceEntry?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  rr?: number;
  rrToTp1?: number;
  rrToTp2?: number;
  invalidationLevel?: number;
  invalidationReason?: string;
  invalidation?: string;
  setupCreatedAt?: number;
  setupExpiresAt?: number;
  marketPriceAtSignal?: number;
  reasons: string[];
  marketDataTimestamp: number;
  createdAt: string;
  updatedAt: string;
  notificationSent: boolean;
  preAlertSent?: boolean;
  validAlertSent?: boolean;
  pushSentAt?: string;
  invalidated?: boolean;
}

export interface DeskNotificationSettings {
  notifyForming: boolean;
  notifyValid: boolean;
  soundEnabled: boolean;
  pushEnabled: boolean;
}

export interface MonitorState {
  setupAnalysisId: string | null;
  previousState: SetupDecisionType;
  currentState: SetupDecisionType;
  direction: "BUY" | "SELL" | null;
  lastEvaluationAt: string;
  lastMarketTimestamp: number;
  preAlertSent: boolean;
  validAlertSent: boolean;
  expiredAlertSent: boolean;
}

export interface MonitorExecutionResult {
  ok: boolean;
  symbol: string;
  marketStatus: "open" | "closed";
  setupAnalysisId: string | null;
  previousState: SetupDecisionType;
  currentState: SetupDecisionType;
  direction: "BUY" | "SELL" | null;
  pushSent: boolean;
  preAlertSent: boolean;
  validAlertSent?: boolean;
  upstreamRequestsMade: number;
  evaluatedAt: string;
  message?: string;
  skipped?: boolean;
  reason?: string;
}

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
