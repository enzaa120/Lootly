import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  Firestore,
} from "firebase/firestore";
import { serverFirebaseConfig } from "./firebaseConfig";
import {
  SupportedDeskTimeframe,
  MarketSnapshot,
  CandleItem,
  MarketDataApiResponse,
  TwelveDataProviderStatus,
  TwelveDataDailyUsage,
  TimeframeFeedStatus,
  QuotaStatus,
  TradingDeskSession,
} from "./types";

// Named Firestore database ID
const FIRESTORE_DATABASE_ID =
  serverFirebaseConfig.firestoreDatabaseId || "ai-studio-lootly-57005d49-edb2-43f4-9ea3-f71b1b106f8e";

let backendDbInstance: Firestore | null = null;

export function getBackendFirestore(): Firestore {
  if (!backendDbInstance) {
    const app =
      getApps().length === 0
        ? initializeApp({
            apiKey: serverFirebaseConfig.apiKey,
            authDomain: serverFirebaseConfig.authDomain,
            projectId: serverFirebaseConfig.projectId,
            storageBucket: serverFirebaseConfig.storageBucket,
            messagingSenderId: serverFirebaseConfig.messagingSenderId,
            appId: serverFirebaseConfig.appId,
          })
        : getApp();

    backendDbInstance = getFirestore(app, FIRESTORE_DATABASE_ID);
  }
  return backendDbInstance;
}

// ============================================================================
// CONSTANTS & RULES (TWELVE DATA HARDENING)
// ============================================================================

export const UPSTREAM_INTERVAL_MS: Record<SupportedDeskTimeframe, number> = {
  M5: 5 * 60 * 1000, // 5 minutes
  M15: 15 * 60 * 1000, // 15 minutes
  H1: 60 * 60 * 1000, // 60 minutes
};

// Force refresh safety throttle: minimum 60 seconds per timeframe
export const FORCE_MIN_INTERVAL_MS = 60 * 1000;

// Daily quota limits for Twelve Data Basic plan (800 requests/day)
export const DAILY_QUOTA_SOFT_LIMIT = 650;
export const DAILY_QUOTA_HARD_LIMIT = 750;
export const DAILY_QUOTA_MAX = 800;

// Data freshness thresholds
export const FRESHNESS_LIMITS_MS: Record<SupportedDeskTimeframe, number> = {
  M5: 10 * 60 * 1000,
  M15: 30 * 60 * 1000,
  H1: 90 * 60 * 1000,
};

// Map Twelve Data interval & output size to internal timeframe
export const TIMEFRAME_CONFIG: Record<
  SupportedDeskTimeframe,
  { interval: string; outputsize: number }
> = {
  H1: { interval: "1h", outputsize: 30 },
  M15: { interval: "15min", outputsize: 30 },
  M5: { interval: "5min", outputsize: 30 },
};

/**
 * Infer trading session from UTC hour
 */
export function inferSession(timestampMs: number): TradingDeskSession {
  const date = new Date(timestampMs);
  const hourUtc = date.getUTCHours();
  if (hourUtc >= 0 && hourUtc < 8) return "asia";
  if (hourUtc >= 8 && hourUtc < 13) return "london";
  if (hourUtc >= 13 && hourUtc < 17) return "overlap";
  if (hourUtc >= 17 && hourUtc < 22) return "newyork";
  return "asia";
}

/**
 * Evaluates whether the XAU/USD gold market is currently active.
 * Hours: Sunday 22:00 UTC to Friday 21:00 UTC (with daily rollover 21:00-22:00 UTC).
 */
export function checkXauusdMarketSchedule(date = new Date()): {
  isOpen: boolean;
  reason: string;
} {
  const day = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const timeMinutes = hour * 60 + minute;

  // Saturday: Always closed
  if (day === 6) {
    return {
      isOpen: false,
      reason: "Pasar XAU/USD sedang tutup untuk akhir pekan (Sabtu).",
    };
  }

  // Sunday: Closed until 22:00 UTC
  if (day === 0) {
    if (timeMinutes < 22 * 60) {
      return {
        isOpen: false,
        reason:
          "Pasar XAU/USD sedang tutup untuk akhir pekan (Minggu) hingga sesi Sydney/Tokyo buka pukul 22:00 UTC.",
      };
    }
  }

  // Friday: Closes at 21:00 UTC
  if (day === 5) {
    if (timeMinutes >= 21 * 60) {
      return {
        isOpen: false,
        reason: "Pasar XAU/USD telah tutup untuk akhir pekan (Jumat 21:00 UTC).",
      };
    }
  }

  // Monday - Thursday: Daily market rollover break 21:00 - 22:00 UTC
  if (day >= 1 && day <= 4) {
    if (timeMinutes >= 21 * 60 && timeMinutes < 22 * 60) {
      return {
        isOpen: false,
        reason: "Jeda rollover pasar harian (21:00 - 22:00 UTC).",
      };
    }
  }

  return {
    isOpen: true,
    reason: "Pasar XAU/USD sedang aktif diperdagangkan.",
  };
}

// ============================================================================
// IN-MEMORY SECONDARY CACHE (Performance only; Firestore is source of truth)
// ============================================================================

interface CachedTimeframeData {
  timestamp: number;
  candles: CandleItem[];
  snapshot: MarketSnapshot | null;
}

const memoryCache: Record<SupportedDeskTimeframe, CachedTimeframeData | null> = {
  H1: null,
  M15: null,
  M5: null,
};

let lastFetchAttemptTimestamp = 0;
let lastSourceUsed: "twelve_data" | "twelvedata" | "tradingview" | "cache" | "none" = "none";
let lastKnownError: string | null = null;

// ============================================================================
// TIME & DATE HELPERS
// ============================================================================

export function getUtcDateKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseTwelveDataDatetime(dtStr: string): number {
  if (!dtStr) return Date.now();
  try {
    const clean = dtStr.includes("T") ? dtStr : dtStr.replace(" ", "T") + "Z";
    const ts = new Date(clean).getTime();
    return Number.isFinite(ts) ? ts : Date.now();
  } catch {
    return Date.now();
  }
}

export function normalizeTwelveDataCandles(
  rawValues: any[],
  timeframe: SupportedDeskTimeframe,
  symbol = "XAUUSD"
): CandleItem[] {
  if (!Array.isArray(rawValues) || rawValues.length === 0) {
    return [];
  }

  const items: CandleItem[] = [];

  for (const item of rawValues) {
    const open = parseFloat(item.open);
    const high = parseFloat(item.high);
    const low = parseFloat(item.low);
    const close = parseFloat(item.close);
    const volume = parseFloat(item.volume) || 0;
    const timestamp = parseTwelveDataDatetime(item.datetime);

    if (
      Number.isFinite(open) &&
      Number.isFinite(high) &&
      Number.isFinite(low) &&
      Number.isFinite(close)
    ) {
      items.push({
        symbol,
        timeframe,
        open,
        high: Math.max(high, low),
        low: Math.min(high, low),
        close,
        volume,
        timestamp,
        session: inferSession(timestamp),
        receivedAt: new Date().toISOString(),
      });
    }
  }

  items.sort((a, b) => a.timestamp - b.timestamp);

  const deduped: CandleItem[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    if (!seen.has(item.timestamp)) {
      seen.add(item.timestamp);
      deduped.push(item);
    }
  }

  return deduped;
}

// ============================================================================
// DURABLE FIRESTORE PROVIDER METADATA & USAGE TRACKING
// ============================================================================

export async function getProviderStatus(
  db: Firestore,
  symbol = "XAUUSD"
): Promise<TwelveDataProviderStatus> {
  const defaultStatus: TwelveDataProviderStatus = {
    source: "twelve_data",
    lastFetchM5: 0,
    lastFetchM15: 0,
    lastFetchH1: 0,
    lastSuccessfulSync: 0,
    lastError: null,
    updatedAt: 0,
  };

  try {
    const ref = doc(db, "marketData", symbol, "providerStatus", "twelveData");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { ...defaultStatus, ...(snap.data() as Partial<TwelveDataProviderStatus>) };
    }
  } catch (err: any) {
    console.warn("[TwelveData] Error reading providerStatus doc:", err?.message || err);
  }

  return defaultStatus;
}

export async function saveProviderStatus(
  db: Firestore,
  updates: Partial<TwelveDataProviderStatus>,
  symbol = "XAUUSD"
): Promise<void> {
  try {
    const ref = doc(db, "marketData", symbol, "providerStatus", "twelveData");
    await setDoc(
      ref,
      {
        source: "twelve_data",
        ...updates,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  } catch (err: any) {
    console.warn("[TwelveData] Error saving providerStatus doc:", err?.message || err);
  }
}

export async function getDailyUsage(
  db: Firestore,
  dateStr: string,
  symbol = "XAUUSD"
): Promise<TwelveDataDailyUsage> {
  const defaultUsage: TwelveDataDailyUsage = {
    requestsM5: 0,
    requestsM15: 0,
    requestsH1: 0,
    totalRequests: 0,
    updatedAt: 0,
  };

  try {
    const ref = doc(db, "marketData", symbol, "providerUsage", dateStr);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return { ...defaultUsage, ...(snap.data() as Partial<TwelveDataDailyUsage>) };
    }
  } catch (err: any) {
    console.warn("[TwelveData] Error reading providerUsage doc:", err?.message || err);
  }

  return defaultUsage;
}

export async function recordDailyUsage(
  db: Firestore,
  dateStr: string,
  counts: { M5: number; M15: number; H1: number },
  symbol = "XAUUSD"
): Promise<TwelveDataDailyUsage> {
  const current = await getDailyUsage(db, dateStr, symbol);
  const updated: TwelveDataDailyUsage = {
    requestsM5: (current.requestsM5 || 0) + counts.M5,
    requestsM15: (current.requestsM15 || 0) + counts.M15,
    requestsH1: (current.requestsH1 || 0) + counts.H1,
    totalRequests:
      (current.totalRequests || 0) + counts.M5 + counts.M15 + counts.H1,
    updatedAt: Date.now(),
  };

  try {
    const ref = doc(db, "marketData", symbol, "providerUsage", dateStr);
    await setDoc(ref, updated, { merge: true });
  } catch (err: any) {
    console.warn("[TwelveData] Error saving providerUsage doc:", err?.message || err);
  }

  return updated;
}

// ============================================================================
// FIRESTORE MARKET DATA STORAGE & FALLBACK RETRIEVAL
// ============================================================================

export async function syncToFirestore(
  timeframe: SupportedDeskTimeframe,
  candles: CandleItem[],
  symbol = "XAUUSD"
): Promise<void> {
  if (candles.length === 0) return;

  try {
    const db = getBackendFirestore();
    const latest = candles[candles.length - 1];

    const snapshot: MarketSnapshot = {
      symbol,
      timeframe,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      close: latest.close,
      volume: latest.volume,
      timestamp: latest.timestamp,
      session: latest.session || inferSession(latest.timestamp),
      receivedAt: latest.receivedAt || new Date().toISOString(),
    };

    // 1. Latest snapshot doc
    const tfDocRef = doc(db, "marketData", symbol, "timeframes", timeframe);
    await setDoc(tfDocRef, snapshot, { merge: true });

    // 2. Root metadata doc
    const symbolDocRef = doc(db, "marketData", symbol);
    await setDoc(
      symbolDocRef,
      {
        symbol,
        lastUpdated: snapshot.receivedAt,
        lastTimeframe: timeframe,
        lastPrice: latest.close,
        activeSession: snapshot.session,
        dataSource: "twelvedata",
      },
      { merge: true }
    );

    // 3. Rolling candles with timestamp as ID
    const recentCandles = candles.slice(-30);
    const savePromises = recentCandles.map((c) => {
      const candleRef = doc(
        db,
        "marketData",
        symbol,
        "candles",
        timeframe,
        "items",
        String(c.timestamp)
      );
      return setDoc(
        candleRef,
        {
          symbol,
          timeframe,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          timestamp: c.timestamp,
          session: c.session,
          receivedAt: c.receivedAt,
        },
        { merge: true }
      );
    });

    await Promise.allSettled(savePromises);
  } catch (err: any) {
    console.warn(`[TwelveData] Firestore sync warning for ${timeframe}:`, err?.message || err);
  }
}

export async function loadFromFirestore(symbol = "XAUUSD"): Promise<{
  snapshots: Record<SupportedDeskTimeframe, MarketSnapshot | null>;
  candles: Record<SupportedDeskTimeframe, CandleItem[]>;
  lastPrice: number | null;
}> {
  const snapshots: Record<SupportedDeskTimeframe, MarketSnapshot | null> = {
    H1: null,
    M15: null,
    M5: null,
  };
  const candles: Record<SupportedDeskTimeframe, CandleItem[]> = {
    H1: [],
    M15: [],
    M5: [],
  };
  let lastPrice: number | null = null;

  try {
    const db = getBackendFirestore();
    const timeframes: SupportedDeskTimeframe[] = ["H1", "M15", "M5"];

    for (const tf of timeframes) {
      try {
        const snapDoc = await getDoc(doc(db, "marketData", symbol, "timeframes", tf));
        if (snapDoc.exists()) {
          snapshots[tf] = snapDoc.data() as MarketSnapshot;
          if (tf === "M5" && snapshots[tf]?.close) {
            lastPrice = snapshots[tf]!.close;
          }
        }

        const candleCol = collection(db, "marketData", symbol, "candles", tf, "items");
        const q = query(candleCol, orderBy("timestamp", "desc"), limit(30));
        const cSnap = await getDocs(q);
        const tfCandles: CandleItem[] = [];
        cSnap.forEach((d) => tfCandles.push(d.data() as CandleItem));
        tfCandles.sort((a, b) => a.timestamp - b.timestamp);
        candles[tf] = tfCandles;
      } catch (innerErr) {
        console.warn(`[TwelveData] Firestore read warning for ${tf}:`, innerErr);
      }
    }

    if (!lastPrice) {
      lastPrice =
        candles.M5[candles.M5.length - 1]?.close ??
        candles.M15[candles.M15.length - 1]?.close ??
        candles.H1[candles.H1.length - 1]?.close ??
        snapshots.M5?.close ??
        null;
    }
  } catch (err) {
    console.warn("[TwelveData] Firestore read error:", err);
  }

  return { snapshots, candles, lastPrice };
}

// ============================================================================
// PRIMARY SERVER FETCH FUNCTION
// ============================================================================

export async function getXauusdMarketData(options?: {
  force?: boolean;
}): Promise<MarketDataApiResponse> {
  const force = !!options?.force;
  const now = Date.now();
  const apiKey = (process.env.TWELVE_DATA_API_KEY || "").trim();
  const symbol = "XAUUSD";
  const twSymbol = "XAU/USD";

  const db = getBackendFirestore();
  const todayKey = getUtcDateKey(new Date(now));
  const marketStatus = checkXauusdMarketSchedule(new Date(now));

  // 1. Check API Key presence
  if (!apiKey) {
    lastKnownError = "TWELVE_DATA_API_KEY is not configured on server.";
    const firestoreData = await loadFromFirestore(symbol);
    const hasAnyData =
      firestoreData.candles.H1.length > 0 ||
      firestoreData.candles.M15.length > 0 ||
      firestoreData.candles.M5.length > 0;

    return {
      ok: hasAnyData,
      success: hasAnyData,
      source: hasAnyData ? "tradingview" : "none",
      symbol,
      hasApiKey: false,
      status: "missing_api_key",
      message:
        "Kunci API Twelve Data belum disetel di server (TWELVE_DATA_API_KEY). " +
        (hasAnyData
          ? "Menampilkan data dari riwayat tersimpan / TradingView webhook fallback."
          : "Silakan konfigurasikan TWELVE_DATA_API_KEY di environment untuk mengaktifkan data otomatis."),
      lastUpdated: new Date().toISOString(),
      activeSession: inferSession(now),
      lastPrice: firestoreData.lastPrice,
      snapshots: firestoreData.snapshots,
      candles: firestoreData.candles,
      upstreamRequestsMade: 0,
      marketStatus,
    };
  }

  // 2. Read durable Firestore state: provider status & daily usage
  const [providerStatus, dailyUsage] = await Promise.all([
    getProviderStatus(db, symbol),
    getDailyUsage(db, todayKey, symbol),
  ]);

  const usedToday = dailyUsage.totalRequests || 0;
  const softLimitReached = usedToday >= DAILY_QUOTA_SOFT_LIMIT;
  const hardLimitReached = usedToday >= DAILY_QUOTA_HARD_LIMIT;

  const quotaInfo: QuotaStatus = {
    estimatedUsedToday: usedToday,
    softLimitReached,
    hardLimitReached,
    maxDailyLimit: DAILY_QUOTA_MAX,
  };

  // 3. HARD DAILY QUOTA PROTECTION
  if (hardLimitReached) {
    console.warn(
      `[TwelveData] Daily hard quota limit reached (${usedToday}/${DAILY_QUOTA_HARD_LIMIT}). Serving Firestore cache.`
    );
    const firestoreData = await loadFromFirestore(symbol);
    lastSourceUsed = "cache";

    const timeframesStatus: Record<SupportedDeskTimeframe, TimeframeFeedStatus> = {
      M5: {
        source: "firestore_cache",
        count: firestoreData.candles.M5.length,
        latestTimestamp: firestoreData.candles.M5.slice(-1)[0]?.timestamp ?? null,
        ageSeconds: firestoreData.candles.M5.slice(-1)[0]?.timestamp
          ? Math.round((now - firestoreData.candles.M5.slice(-1)[0].timestamp) / 1000)
          : null,
        fresh: false,
      },
      M15: {
        source: "firestore_cache",
        count: firestoreData.candles.M15.length,
        latestTimestamp: firestoreData.candles.M15.slice(-1)[0]?.timestamp ?? null,
        ageSeconds: firestoreData.candles.M15.slice(-1)[0]?.timestamp
          ? Math.round((now - firestoreData.candles.M15.slice(-1)[0].timestamp) / 1000)
          : null,
        fresh: false,
      },
      H1: {
        source: "firestore_cache",
        count: firestoreData.candles.H1.length,
        latestTimestamp: firestoreData.candles.H1.slice(-1)[0]?.timestamp ?? null,
        ageSeconds: firestoreData.candles.H1.slice(-1)[0]?.timestamp
          ? Math.round((now - firestoreData.candles.H1.slice(-1)[0].timestamp) / 1000)
          : null,
        fresh: false,
      },
    };

    return {
      ok: true,
      success: true,
      source: "cache",
      symbol,
      hasApiKey: true,
      status: "quota_exceeded",
      message: "Kuota data pasar mendekati batas harian (proteksi kuota aktif). Data disajikan dari cache tersimpan.",
      lastUpdated: new Date().toISOString(),
      activeSession: inferSession(now),
      lastPrice: firestoreData.lastPrice,
      snapshots: firestoreData.snapshots,
      candles: firestoreData.candles,
      upstreamRequestsMade: 0,
      timeframes: timeframesStatus,
      quota: quotaInfo,
      marketStatus,
    };
  }

  // 4. DETERMINE WHICH TIMEFRAMES ARE ACTUALLY DUE
  const checkDue = (
    tf: SupportedDeskTimeframe,
    lastFetch: number
  ): { isDue: boolean; reason: string } => {
    const elapsed = now - (lastFetch || 0);

    if (force) {
      if (elapsed < FORCE_MIN_INTERVAL_MS) {
        return {
          isDue: false,
          reason: `Throttle perlindungan aktif (${Math.round((FORCE_MIN_INTERVAL_MS - elapsed) / 1000)}s tersisa sebelum refresh diizinkan).`,
        };
      }
      return { isDue: true, reason: "Force refresh diminta dan melewati throttle 60s." };
    }

    const requiredInterval = UPSTREAM_INTERVAL_MS[tf];
    if (elapsed >= requiredInterval) {
      return { isDue: true, reason: `Interval ${tf} telah jatuh tempo (${Math.round(elapsed / 1000)}s >= ${requiredInterval / 1000}s).` };
    }

    return {
      isDue: false,
      reason: `Interval ${tf} masih segar (${Math.round(elapsed / 1000)}s < ${requiredInterval / 1000}s).`,
    };
  };

  const dueStatus: Record<SupportedDeskTimeframe, { isDue: boolean; reason: string }> = {
    M5: checkDue("M5", providerStatus.lastFetchM5),
    M15: checkDue("M15", providerStatus.lastFetchM15),
    H1: checkDue("H1", providerStatus.lastFetchH1),
  };

  const timeframesToFetch: SupportedDeskTimeframe[] = (
    ["H1", "M15", "M5"] as SupportedDeskTimeframe[]
  ).filter((tf) => dueStatus[tf].isDue);

  // 5. IF NO TIMEFRAME IS DUE -> Return Firestore cache without calling Twelve Data
  if (timeframesToFetch.length === 0) {
    lastSourceUsed = "cache";
    const firestoreData = await loadFromFirestore(symbol);

    const checkFreshness = (tf: SupportedDeskTimeframe, ts: number | null) => {
      if (!ts) return false;
      if (!marketStatus.isOpen) return true;
      return now - ts <= FRESHNESS_LIMITS_MS[tf];
    };

    const timeframesStatus: Record<SupportedDeskTimeframe, TimeframeFeedStatus> = {
      M5: {
        source: "firestore_cache",
        count: firestoreData.candles.M5.length,
        latestTimestamp: firestoreData.candles.M5.slice(-1)[0]?.timestamp ?? null,
        ageSeconds: firestoreData.candles.M5.slice(-1)[0]?.timestamp
          ? Math.round((now - firestoreData.candles.M5.slice(-1)[0].timestamp) / 1000)
          : null,
        fresh: checkFreshness("M5", firestoreData.candles.M5.slice(-1)[0]?.timestamp ?? null),
      },
      M15: {
        source: "firestore_cache",
        count: firestoreData.candles.M15.length,
        latestTimestamp: firestoreData.candles.M15.slice(-1)[0]?.timestamp ?? null,
        ageSeconds: firestoreData.candles.M15.slice(-1)[0]?.timestamp
          ? Math.round((now - firestoreData.candles.M15.slice(-1)[0].timestamp) / 1000)
          : null,
        fresh: checkFreshness("M15", firestoreData.candles.M15.slice(-1)[0]?.timestamp ?? null),
      },
      H1: {
        source: "firestore_cache",
        count: firestoreData.candles.H1.length,
        latestTimestamp: firestoreData.candles.H1.slice(-1)[0]?.timestamp ?? null,
        ageSeconds: firestoreData.candles.H1.slice(-1)[0]?.timestamp
          ? Math.round((now - firestoreData.candles.H1.slice(-1)[0].timestamp) / 1000)
          : null,
        fresh: checkFreshness("H1", firestoreData.candles.H1.slice(-1)[0]?.timestamp ?? null),
      },
    };

    return {
      ok: true,
      success: true,
      source: "twelve_data",
      symbol,
      hasApiKey: true,
      status: "ok",
      message: force
        ? "Permintaan refresh dibatasi oleh throttle keselamatan (minimum 60s per timeframe). Menampilkan data tersimpan."
        : "Data pasar masih dalam interval segar (M5: 5m, M15: 15m, H1: 60m). Disajikan dari database tanpa request upstream.",
      lastUpdated: new Date().toISOString(),
      activeSession: inferSession(now),
      lastPrice: firestoreData.lastPrice,
      snapshots: firestoreData.snapshots,
      candles: firestoreData.candles,
      upstreamRequestsMade: 0,
      timeframes: timeframesStatus,
      quota: quotaInfo,
      marketStatus,
    };
  }

  // 6. EXECUTE UPSTREAM CALLS ONLY FOR DUE TIMEFRAMES
  lastFetchAttemptTimestamp = now;

  const existingData = await loadFromFirestore(symbol);

  const finalSnapshots: Record<SupportedDeskTimeframe, MarketSnapshot | null> = {
    ...existingData.snapshots,
  };
  const finalCandles: Record<SupportedDeskTimeframe, CandleItem[]> = {
    ...existingData.candles,
  };

  const timeframeSources: Record<SupportedDeskTimeframe, "twelve_data" | "firestore_cache"> = {
    M5: "firestore_cache",
    M15: "firestore_cache",
    H1: "firestore_cache",
  };

  let upstreamRequestsCount = 0;
  const errorsList: string[] = [];
  const statusUpdates: Partial<TwelveDataProviderStatus> = {};
  const usageIncrements = { M5: 0, M15: 0, H1: 0 };

  for (const tf of timeframesToFetch) {
    const { interval, outputsize } = TIMEFRAME_CONFIG[tf];
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      twSymbol
    )}&interval=${interval}&outputsize=${outputsize}&timezone=UTC&apikey=${encodeURIComponent(
      apiKey
    )}`;

    try {
      upstreamRequestsCount++;
      usageIncrements[tf]++;

      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "LootlyTradingJournal/1.0",
        },
      });

      const json = await res.json();

      if (!res.ok || json.status === "error" || json.code) {
        const errorMsg = json.message || `HTTP ${res.status} from Twelve Data`;
        console.warn(`[TwelveData] Upstream error for ${tf}: ${errorMsg}`);
        errorsList.push(`${tf}: ${errorMsg}`);
        continue;
      }

      const normalized = normalizeTwelveDataCandles(json.values, tf, symbol);
      if (normalized.length === 0) {
        errorsList.push(`${tf}: empty candle array returned`);
        continue;
      }

      const latest = normalized[normalized.length - 1];
      const snapshot: MarketSnapshot = {
        symbol,
        timeframe: tf,
        open: latest.open,
        high: latest.high,
        low: latest.low,
        close: latest.close,
        volume: latest.volume,
        timestamp: latest.timestamp,
        session: latest.session || inferSession(latest.timestamp),
        receivedAt: latest.receivedAt || new Date().toISOString(),
      };

      finalSnapshots[tf] = snapshot;
      finalCandles[tf] = normalized;
      timeframeSources[tf] = "twelve_data";

      if (tf === "M5") statusUpdates.lastFetchM5 = now;
      if (tf === "M15") statusUpdates.lastFetchM15 = now;
      if (tf === "H1") statusUpdates.lastFetchH1 = now;

      memoryCache[tf] = {
        timestamp: now,
        candles: normalized,
        snapshot,
      };

      syncToFirestore(tf, normalized, symbol).catch((e) => {
        console.warn(`[TwelveData] Firestore sync background error for ${tf}:`, e);
      });
    } catch (fetchErr: any) {
      const msg = fetchErr?.message || String(fetchErr);
      console.error(`[TwelveData] Fetch exception for ${tf}:`, msg);
      errorsList.push(`${tf}: ${msg}`);
    }
  }

  // 7. Update provider status and daily usage in Firestore
  if (upstreamRequestsCount > 0) {
    if (errorsList.length === 0) {
      statusUpdates.lastSuccessfulSync = now;
      statusUpdates.lastError = null;
    } else {
      statusUpdates.lastError = errorsList.join(" | ");
    }

    await Promise.all([
      saveProviderStatus(db, statusUpdates, symbol),
      recordDailyUsage(db, todayKey, usageIncrements, symbol),
    ]);
  }

  const updatedTotalRequests = usedToday + upstreamRequestsCount;
  quotaInfo.estimatedUsedToday = updatedTotalRequests;
  quotaInfo.softLimitReached = updatedTotalRequests >= DAILY_QUOTA_SOFT_LIMIT;
  quotaInfo.hardLimitReached = updatedTotalRequests >= DAILY_QUOTA_HARD_LIMIT;

  const checkFreshness = (tf: SupportedDeskTimeframe, ts: number | null) => {
    if (!ts) return false;
    if (!marketStatus.isOpen) return true;
    return now - ts <= FRESHNESS_LIMITS_MS[tf];
  };

  const timeframesStatus: Record<SupportedDeskTimeframe, TimeframeFeedStatus> = {
    M5: {
      source: timeframeSources.M5,
      count: finalCandles.M5.length,
      latestTimestamp: finalCandles.M5.slice(-1)[0]?.timestamp ?? null,
      ageSeconds: finalCandles.M5.slice(-1)[0]?.timestamp
        ? Math.round((now - finalCandles.M5.slice(-1)[0].timestamp) / 1000)
        : null,
      fresh: checkFreshness("M5", finalCandles.M5.slice(-1)[0]?.timestamp ?? null),
    },
    M15: {
      source: timeframeSources.M15,
      count: finalCandles.M15.length,
      latestTimestamp: finalCandles.M15.slice(-1)[0]?.timestamp ?? null,
      ageSeconds: finalCandles.M15.slice(-1)[0]?.timestamp
        ? Math.round((now - finalCandles.M15.slice(-1)[0].timestamp) / 1000)
        : null,
      fresh: checkFreshness("M15", finalCandles.M15.slice(-1)[0]?.timestamp ?? null),
    },
    H1: {
      source: timeframeSources.H1,
      count: finalCandles.H1.length,
      latestTimestamp: finalCandles.H1.slice(-1)[0]?.timestamp ?? null,
      ageSeconds: finalCandles.H1.slice(-1)[0]?.timestamp
        ? Math.round((now - finalCandles.H1.slice(-1)[0].timestamp) / 1000)
        : null,
      fresh: checkFreshness("H1", finalCandles.H1.slice(-1)[0]?.timestamp ?? null),
    },
  };

  const latestM5 = finalCandles.M5[finalCandles.M5.length - 1];
  const lastPrice =
    latestM5?.close ??
    finalCandles.M15[finalCandles.M15.length - 1]?.close ??
    finalCandles.H1[finalCandles.H1.length - 1]?.close ??
    null;

  lastSourceUsed = upstreamRequestsCount > 0 ? "twelve_data" : "cache";

  let responseMessage = "Sinkronisasi pasar selesai.";
  if (upstreamRequestsCount > 0) {
    const fetchedNames = timeframesToFetch.join(", ");
    responseMessage = `Berhasil mengambil data upstream untuk ${fetchedNames} (${upstreamRequestsCount} request API).`;
  } else {
    responseMessage = "Data disajikan dari cache Firestore tanpa pemanggilan API upstream.";
  }

  if (errorsList.length > 0) {
    responseMessage += ` (Peringatan: ${errorsList.join("; ")})`;
  }

  return {
    ok: true,
    success: true,
    source: "twelve_data",
    symbol,
    hasApiKey: true,
    status: errorsList.length > 0 ? "error" : "ok",
    error: errorsList.length > 0 ? errorsList.join(" | ") : undefined,
    message: responseMessage,
    lastUpdated: new Date().toISOString(),
    activeSession: inferSession(now),
    lastPrice,
    snapshots: finalSnapshots,
    candles: finalCandles,
    upstreamRequestsMade: upstreamRequestsCount,
    timeframes: timeframesStatus,
    quota: quotaInfo,
    marketStatus,
  };
}

// ============================================================================
// DIAGNOSTIC STATUS FUNCTION
// ============================================================================

export async function getTwelveDataDiagnosticStatus() {
  const now = Date.now();
  const apiKey = (process.env.TWELVE_DATA_API_KEY || "").trim();
  const symbol = "XAUUSD";
  const db = getBackendFirestore();
  const todayKey = getUtcDateKey(new Date(now));
  const marketStatus = checkXauusdMarketSchedule(new Date(now));

  const [providerStatus, dailyUsage] = await Promise.all([
    getProviderStatus(db, symbol),
    getDailyUsage(db, todayKey, symbol),
  ]);

  return {
    hasApiKey: !!apiKey,
    lastFetchAttempt: lastFetchAttemptTimestamp
      ? new Date(lastFetchAttemptTimestamp).toISOString()
      : null,
    lastSourceUsed,
    lastKnownError: providerStatus.lastError || lastKnownError,
    marketStatus,
    providerStatus: {
      lastFetchM5: providerStatus.lastFetchM5
        ? new Date(providerStatus.lastFetchM5).toISOString()
        : null,
      lastFetchM15: providerStatus.lastFetchM15
        ? new Date(providerStatus.lastFetchM15).toISOString()
        : null,
      lastFetchH1: providerStatus.lastFetchH1
        ? new Date(providerStatus.lastFetchH1).toISOString()
        : null,
      lastSuccessfulSync: providerStatus.lastSuccessfulSync
        ? new Date(providerStatus.lastSuccessfulSync).toISOString()
        : null,
    },
    quota: {
      estimatedUsedToday: dailyUsage.totalRequests,
      softLimitReached: dailyUsage.totalRequests >= DAILY_QUOTA_SOFT_LIMIT,
      hardLimitReached: dailyUsage.totalRequests >= DAILY_QUOTA_HARD_LIMIT,
      maxDailyLimit: DAILY_QUOTA_MAX,
    },
  };
}
