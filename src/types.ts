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
