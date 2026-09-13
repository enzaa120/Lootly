export interface TradeSettings {
  startingBalanceDemo: number;
  startingBalanceReal: number;
  targetBalanceDemo: number;
  targetBalanceReal: number;
  
  // Trading Plan Harian
  dailyProfitTargetDemoIdr: number;
  dailyProfitTargetDemoPercent: number;
  dailyProfitTargetRealIdr: number;
  dailyProfitTargetRealPercent: number;

  // Manajemen Batas Kerugian Harian (IDR) & Disiplin
  maxDailyLossIdrDemo: number;
  maxDailyLossIdrReal: number;
  maxDailyLossPercent?: number;
  maxTradesPerDay: number;
  stopAfterLosses: number;
  usdToIdr?: number;
  instruments?: {
    "XAU/USD": InstrumentConfig;
    "BTC/USD": InstrumentConfig;
  };
}

export interface InstrumentConfig {
  tradingViewSymbol: string;
  pipSize: number;
  contractSize: number;
}

export type AccountMode = "demo" | "real";
export type MarketType = "forex" | "crypto";
export type TradeStatus = "open" | "closed" | "planned";
export type TradeResult = "win" | "loss" | "breakeven" | "open";
export type AssetType = "XAU/USD" | "BTC/USD" | "EUR/USD" | "GBP/USD" | "USD/JPY" | "ETH/USD" | "SOL/USD" | string;
export type TradeDirection = "buy" | "sell";
export type EmotionType = "Calm" | "Confident" | "Doubtful" | "FOMO" | "Revenge" | "Greedy" | "Afraid" | "Tired" | "Forced Entry" | "Satisfied" | "Regret" | "Angry" | "Relieved" | "Disappointed";
export type MistakeType = "FOMO" | "Revenge Trade" | "Early Entry" | "Late Entry" | "Oversized Lot" | "No SL" | "SL Too Tight" | "Against Trend" | "News Spike" | "Overtrade" | "Chasing Candle" | "Closed Too Early" | "Held Too Long";

export interface Trade {
  id: string;
  userId?: string;
  accountMode: AccountMode;
  marketType: MarketType;
  status: TradeStatus;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  asset: AssetType;
  tradingViewSymbol?: string;
  direction: TradeDirection;
  timeframe?: string;
  
  // Execution & Pricing
  entryPlan?: number;
  slPlan?: number;
  tp1Plan?: number;
  actualEntry?: number;
  actualExit?: number;
  actualSL?: number;
  actualTP?: number;
  lot: number;
  riskPercent: number;
  riskIdr: number;
  pnlIdr: number;
  pnlPercent: number;
  pnlPoints?: number;
  pnlPips?: number;
  rrPlanned: number;
  rrRealized: number;
  result: TradeResult;

  // Unified Section: "Setup, Psikologi & Bukti Chart"
  // A. Setup
  setupType: string; // strategy / setup tag
  entryReason: string; // trade rationale
  session?: string; // Asia, London, New York, Overlap, 24/7
  marketCondition?: string; // Trending, Ranging, Breakout, Reversal, Volatile

  // B. Psychology
  emotionBefore?: EmotionType | string;
  emotionAfter?: EmotionType | string;
  mentalStateNotes?: string;
  confidenceLevel?: "Low" | "Medium" | "High";
  disciplineStatus?: "Disciplined" | "Minor Slip" | "Violated Rules";
  mistakes: MistakeType[];
  lessonLearned?: string;

  // C. Chart Proof & OCR
  screenshotProof?: string; // Cloud Storage URL or data URL
  screenshotProofNotes?: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
  
  // OCR metadata if prefilled from screenshot
  ocrDetected?: boolean;
  ocrExtractedData?: {
    sourcePlatform?: string;
    confidence?: "high" | "medium" | "low";
    detectedSymbol?: string;
    detectedDirection?: string;
    detectedEntry?: number;
    detectedSL?: number;
    detectedTP?: number;
    detectedExit?: number;
    detectedLot?: number;
    rawNotes?: string;
  };

  // Safe schema aliases for cross-compatibility
  pair?: string;
  accountType?: AccountMode | string;
  entry?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  exitPrice?: number | null;
  lotSize?: number;
  notes?: string;
  setup?: string;
  psychology?: any;
  screenshotUrl?: string | null;
  storagePath?: string | null;

  // Reference to AI Trading Desk Analysis (Phase 2 decision support linkage)
  setupAnalysisId?: string;

  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  userId?: string;
  accountMode: AccountMode;
  type: "deposit" | "withdrawal" | "trade_pnl" | "adjustment";
  amount: number;
  note: string;
  date: string;
  relatedTradeId?: string;
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAnonymous: boolean;
}

// ==============================================================================
// MEJA TRADING AI TYPES & INTERFACES (PHASE 2 INSTITUTIONAL DECISION SUPPORT)
// ==============================================================================

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

export enum SetupDecisionType {
  VALID_SETUP = "VALID_SETUP",
  WAIT = "WAIT",
  NO_TRADE = "NO_TRADE",
}

export type DecisionLabelIndo = "SETUP VALID" | "TUNGGU" | "TIDAK ADA TRADE";
export type ConfidenceLabel = "Tinggi" | "Sedang" | "Rendah";
export type ChecklistItemStatus = "passed" | "waiting" | "failed";

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
  reasons: string[];
  isBreached: boolean;
  dailyLossSoFar: number;
  consecutiveLossesSoFar: number;
  tradesToday: number;
}

export interface ExecutionPlan {
  direction: "BUY" | "SELL";
  htfBias: string;
  m15Area: string;
  liquidityEvent: string;
  m5Confirmation: string;
  entryZone: string;
  stopLossRef: number;
  takeProfitRef: number;
  estimatedRR: number;
  invalidationLevel: number;
  sessionNote: string;
  riskStatus: string;
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

export interface DataQualityStatus {
  h1Connected: boolean;
  m15Connected: boolean;
  m5Connected: boolean;
  h1Count: number;
  m15Count: number;
  m5Count: number;
  latestTimestamp: number | null;
  freshnessStatus:
    | "Segar (Realtime)"
    | "Terlambat"
    | "Pembaruan terlalu lama"
    | "Belum ada data"
    | "Pasar Tutup (Valid)"
    | "Kuota Harian Terbatas";
  isFresh: boolean;
  analysisAllowed: boolean;
  reason: string;
  isMarketClosed?: boolean;
  marketClosedReason?: string;
  staleReason?: "live" | "market_closed" | "fetch_failed" | "provider_unavailable" | "insufficient_history";
  timeframeFreshness?: {
    M5: { ageMs: number; isFresh: boolean; limitMs: number };
    M15: { ageMs: number; isFresh: boolean; limitMs: number };
    H1: { ageMs: number; isFresh: boolean; limitMs: number };
  };
}

export interface SetupDecision {
  decision: SetupDecisionType;
  decisionLabelIndo: DecisionLabelIndo;
  marketRegime: string;
  htfBias: string;
  liquidity: string;
  m15Location: string;
  m5Confirmation: string;
  riskStatus: string;
  confidence: ConfidenceLabel;
  isReadyForEntry: boolean;
  reasons: string[];
  invalidationText: string;
  timestamp: number;
}

export interface DeskAnalysisRecord {
  id?: string;
  symbol: string;
  timestamp: number;
  session: string;
  h1Context: H1AnalysisResult;
  m15Context: M15AnalysisResult;
  liquidityState: LiquidityAnalysisResult;
  m5Confirmation: M5ConfirmationResult;
  retestStatus: string;
  riskStatus: string;
  decision: SetupDecisionType;
  decisionLabelIndo: DecisionLabelIndo;
  confidenceLabel: ConfidenceLabel;
  reasons: string[];
  invalidation: string;
  executionPlan: ExecutionPlan | null;
  ruleVersion: "lootly-xauusd-v1";
  createdAt: string;
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

