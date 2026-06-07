export interface TradeSettings {
  startingBalanceDemo: number;
  startingBalanceReal: number;
  targetBalanceDemo: number;
  targetBalanceReal: number;
  maxDailyLossPercent: number;
  maxTradesPerDay: number;
  stopAfterLosses: number;
  usdToIdr: number;
  instruments: {
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
export type TradeStatus = "planned" | "closed";
export type TradeResult = "win" | "loss" | "breakeven" | "open";
export type AssetType = "XAU/USD" | "BTC/USD";
export type TradeDirection = "buy" | "sell";
export type EmotionType = "Calm" | "Confident" | "Doubtful" | "FOMO" | "Revenge" | "Greedy" | "Afraid" | "Tired" | "Forced Entry" | "Satisfied" | "Regret" | "Angry" | "Relieved" | "Disappointed";
export type MistakeType = "FOMO" | "Revenge Trade" | "Early Entry" | "Late Entry" | "Oversized Lot" | "No SL" | "SL Too Tight" | "Against Trend" | "News Spike" | "Overtrade" | "Chasing Candle" | "Closed Too Early" | "Held Too Long";

export interface Trade {
  id: string;
  accountMode: AccountMode;
  status: TradeStatus;
  date: string;
  asset: AssetType;
  tradingViewSymbol: string;
  direction: TradeDirection;
  timeframe: string;
  session: string;
  bias: string;
  setupType: string;
  entryReason: string;
  entryPlan: number;
  slPlan?: number;
  tp1Plan?: number;
  tp2Plan?: number;
  tp3Plan?: number;
  actualEntry?: number;
  actualExit?: number;
  actualSL?: number;
  actualTP?: number;
  lot: number;
  riskPercent: number;
  riskIdr: number;
  pnlIdr: number;
  pnlPoints: number;
  pnlPips: number;
  rrPlanned: number;
  rrRealized: number;
  result: TradeResult;
  duration?: string; // in minutes/hours
  emotionBefore?: EmotionType;
  emotionAfter?: EmotionType;
  mentalStateNotes?: string;
  checklist: {
    m30Checked: boolean;
    m15Checked: boolean;
    nearSnr: boolean;
    nearVwap: boolean;
    emaSupports: boolean;
    atrAcceptable: boolean;
    slClear: boolean;
    riskAcceptable: boolean;
    notRevenge: boolean;
    notChasingCandle: boolean;
  };
  mistakes: MistakeType[];
  disciplineScore?: number;
  followedPlan?: boolean;
  slFollowed?: boolean;
  tpRealistic?: boolean;
  lessonLearned?: string;
  screenshotBefore?: string;
  screenshotAfter?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  accountMode: AccountMode;
  type: "deposit" | "withdrawal" | "trade_pnl" | "adjustment";
  amount: number;
  note: string;
  date: string;
  relatedTradeId?: string;
}

export interface Review {
  id: string;
  accountMode: AccountMode;
  period: "daily" | "weekly" | "monthly" | "yearly";
  date: string;
  totalTrades: number;
  totalPnl: number;
  winrate: number;
  avgRr: number;
  bestTradeId?: string;
  worstTradeId?: string;
  biggestMistake?: MistakeType;
  bestSetup?: string;
  worstSetup?: string;
  avgDisciplineScore: number;
  notes: string;
  lessonsLearned: string;
  rulesForNext: string;
}
