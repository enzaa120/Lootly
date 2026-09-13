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
