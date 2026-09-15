import {
  SupportedDeskTimeframe,
  MarketSnapshot,
  CandleItem,
  SetupDecisionType,
  DecisionLabelIndo,
  ConfidenceLabel,
  ConfluenceChecklistItem,
  H1AnalysisResult,
  M15AnalysisResult,
  LiquidityAnalysisResult,
  M5ConfirmationResult,
  RiskAnalysisResult,
  ExecutionPlan,
  DataQualityStatus,
  SetupDecision,
  DeskAnalysisRecord,
} from "../types";

// Minimum candles required for reliable multi-timeframe analysis
export const MIN_CANDLES_H1 = 3;
export const MIN_CANDLES_M15 = 4;
export const MIN_CANDLES_M5 = 5;

// Data freshness threshold (in milliseconds):
// M5: <= 10 minutes during active market periods, M15: <= 30 minutes, H1: <= 90 minutes
export const FRESHNESS_LIMITS_MS: Record<SupportedDeskTimeframe, number> = {
  M5: 10 * 60 * 1000,
  M15: 30 * 60 * 1000,
  H1: 90 * 60 * 1000,
};

// Legacy fallback threshold
export const STALE_THRESHOLD_MS = 45 * 60 * 1000;

/**
 * Checks if XAU/USD gold spot market is currently open.
 * Sunday ~22:00 UTC to Friday ~21:00 UTC, with daily rollover break at 21:00-22:00 UTC.
 */
export function checkXauusdMarketSchedule(date = new Date()): {
  isOpen: boolean;
  reason: string;
} {
  const day = date.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
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

/**
 * Evaluates the freshness and completeness of incoming market feed data.
 */
export function evaluateDataQuality(
  snapshots: Record<SupportedDeskTimeframe, MarketSnapshot | null>,
  h1History: CandleItem[],
  m15History: CandleItem[],
  m5History: CandleItem[],
  nowMs: number = Date.now()
): DataQualityStatus {
  const h1Connected = snapshots.H1 !== null;
  const m15Connected = snapshots.M15 !== null;
  const m5Connected = snapshots.M5 !== null;

  const h1Count = Math.max(h1Connected ? 1 : 0, h1History.length);
  const m15Count = Math.max(m15Connected ? 1 : 0, m15History.length);
  const m5Count = Math.max(m5Connected ? 1 : 0, m5History.length);

  // Helper to find latest timestamp for a specific timeframe
  const getLatestTfTimestamp = (
    snapshot: MarketSnapshot | null,
    history: CandleItem[]
  ): number | null => {
    const list = [snapshot?.timestamp, ...history.map((c) => c.timestamp)].filter(
      (t): t is number => typeof t === "number" && t > 0
    );
    return list.length > 0 ? Math.max(...list) : null;
  };

  const h1Latest = getLatestTfTimestamp(snapshots.H1, h1History);
  const m15Latest = getLatestTfTimestamp(snapshots.M15, m15History);
  const m5Latest = getLatestTfTimestamp(snapshots.M5, m5History);

  const allTimestamps = [h1Latest, m15Latest, m5Latest].filter(
    (t): t is number => typeof t === "number" && t > 0
  );
  const latestTimestamp = allTimestamps.length > 0 ? Math.max(...allTimestamps) : null;

  const marketSchedule = checkXauusdMarketSchedule(new Date(nowMs));
  const isMarketClosed = !marketSchedule.isOpen;

  if (!latestTimestamp) {
    return {
      h1Connected: false,
      m15Connected: false,
      m5Connected: false,
      h1Count: 0,
      m15Count: 0,
      m5Count: 0,
      latestTimestamp: null,
      freshnessStatus: "Belum ada data",
      isFresh: false,
      analysisAllowed: false,
      reason: "Belum ada data candle yang diterima dari data provider.",
      isMarketClosed,
      marketClosedReason: marketSchedule.reason,
      staleReason: "provider_unavailable",
    };
  }

  const hasMinCandles =
    h1Count >= MIN_CANDLES_H1 &&
    m15Count >= MIN_CANDLES_M15 &&
    m5Count >= MIN_CANDLES_M5;

  const m5AgeMs = m5Latest ? Math.max(0, nowMs - m5Latest) : Infinity;
  const m15AgeMs = m15Latest ? Math.max(0, nowMs - m15Latest) : Infinity;
  const h1AgeMs = h1Latest ? Math.max(0, nowMs - h1Latest) : Infinity;

  const m5IsFresh = m5AgeMs <= FRESHNESS_LIMITS_MS.M5;
  const m15IsFresh = m15AgeMs <= FRESHNESS_LIMITS_MS.M15;
  const h1IsFresh = h1AgeMs <= FRESHNESS_LIMITS_MS.H1;

  const timeframeFreshness = {
    M5: { ageMs: m5AgeMs, isFresh: m5IsFresh, limitMs: FRESHNESS_LIMITS_MS.M5 },
    M15: { ageMs: m15AgeMs, isFresh: m15IsFresh, limitMs: FRESHNESS_LIMITS_MS.M15 },
    H1: { ageMs: h1AgeMs, isFresh: h1IsFresh, limitMs: FRESHNESS_LIMITS_MS.H1 },
  };

  // Case 1: Market is closed (weekend / scheduled rollover)
  // Legitimate market halt -> unchanged data is not an API failure
  if (isMarketClosed) {
    return {
      h1Connected,
      m15Connected,
      m5Connected,
      h1Count,
      m15Count,
      m5Count,
      latestTimestamp,
      freshnessStatus: "Pasar Tutup (Valid)",
      isFresh: true,
      analysisAllowed: false, // Cannot execute live setups while market is closed
      reason: `Pasar XAU/USD sedang tutup (${marketSchedule.reason}). Harga penutupan terakhir tetap valid.`,
      isMarketClosed: true,
      marketClosedReason: marketSchedule.reason,
      staleReason: "market_closed",
      timeframeFreshness,
    };
  }

  // Case 2: Market is open, but data exceeds freshness limit (M5 > 10m, M15 > 30m, H1 > 90m)
  const isDataFresh = m5IsFresh && m15IsFresh && h1IsFresh;

  if (!isDataFresh) {
    return {
      h1Connected,
      m15Connected,
      m5Connected,
      h1Count,
      m15Count,
      m5Count,
      latestTimestamp,
      freshnessStatus: "Terlambat",
      isFresh: false,
      analysisAllowed: false,
      reason: "Data pasar belum cukup segar untuk validasi setup.",
      isMarketClosed: false,
      staleReason: "fetch_failed",
      timeframeFreshness,
    };
  }

  // Case 3: Data is fresh, but candle sequence length is still insufficient for institutional math
  if (!hasMinCandles) {
    return {
      h1Connected,
      m15Connected,
      m5Connected,
      h1Count,
      m15Count,
      m5Count,
      latestTimestamp,
      freshnessStatus: "Segar (Realtime)",
      isFresh: true,
      analysisAllowed: false,
      reason: "Riwayat candle belum cukup untuk analisis institusional lengkap.",
      isMarketClosed: false,
      staleReason: "insufficient_history",
      timeframeFreshness,
    };
  }

  // Case 4: Complete, fresh, and ready
  return {
    h1Connected,
    m15Connected,
    m5Connected,
    h1Count,
    m15Count,
    m5Count,
    latestTimestamp,
    freshnessStatus: "Segar (Realtime)",
    isFresh: true,
    analysisAllowed: true,
    reason: "Aliran data lengkap, segar, dan siap dianalisis.",
    isMarketClosed: false,
    staleReason: "live",
    timeframeFreshness,
  };
}

/**
 * Merge snapshot with historical candles, sort ascending by timestamp, and deduplicate.
 */
export function normalizeCandleSequence(
  snapshot: MarketSnapshot | null,
  history: CandleItem[]
): CandleItem[] {
  const map = new Map<number, CandleItem>();

  for (const c of history) {
    map.set(c.timestamp, c);
  }

  if (snapshot) {
    map.set(snapshot.timestamp, {
      symbol: snapshot.symbol,
      timeframe: snapshot.timeframe,
      open: snapshot.open,
      high: snapshot.high,
      low: snapshot.low,
      close: snapshot.close,
      volume: snapshot.volume,
      timestamp: snapshot.timestamp,
      session: snapshot.session,
      receivedAt: snapshot.receivedAt,
    });
  }

  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * 5. H1 Context Engine
 * Analyzes higher timeframe trend, market structure (HH/HL vs LH/LL), and directional momentum.
 */
export function analyzeH1Context(candles: CandleItem[]): H1AnalysisResult {
  if (candles.length < 2) {
    return {
      bias: "Netral",
      structure: "Range / tidak jelas",
      momentum: "Bercampur",
      reason: "Data H1 belum mencukupi untuk menentukan bias tren makro.",
      recentHigh: null,
      recentLow: null,
      candleCount: candles.length,
    };
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const recentHigh = Math.max(...highs);
  const recentLow = Math.min(...lows);

  // Divide recent candles into older half and newer half to detect higher highs / lower lows
  const mid = Math.floor(candles.length / 2);
  const olderHalf = candles.slice(0, mid);
  const newerHalf = candles.slice(mid);

  const olderHigh = Math.max(...olderHalf.map((c) => c.high));
  const olderLow = Math.min(...olderHalf.map((c) => c.low));
  const newerHigh = Math.max(...newerHalf.map((c) => c.high));
  const newerLow = Math.min(...newerHalf.map((c) => c.low));

  const isHigherHigh = newerHigh > olderHigh;
  const isHigherLow = newerLow > olderLow;
  const isLowerHigh = newerHigh < olderHigh;
  const isLowerLow = newerLow < olderLow;

  let bias: H1AnalysisResult["bias"] = "Netral";
  let structure: H1AnalysisResult["structure"] = "Range / tidak jelas";

  if (isHigherHigh && isHigherLow) {
    bias = "Bullish";
    structure = "HH / HL";
  } else if (isLowerHigh && isLowerLow) {
    bias = "Bearish";
    structure = "LH / LL";
  } else {
    // Check if the latest candle closed strongly above or below the midpoint
    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (latest.close > prev.high && latest.close > (recentHigh + recentLow) / 2) {
      bias = "Bullish";
      structure = "HH / HL";
    } else if (latest.close < prev.low && latest.close < (recentHigh + recentLow) / 2) {
      bias = "Bearish";
      structure = "LH / LL";
    } else {
      bias = "Netral";
      structure = "Range / tidak jelas";
    }
  }

  // Momentum determination based on recent candle bodies and closes
  const lastThree = candles.slice(-3);
  let bullishCloses = 0;
  let bearishCloses = 0;
  let totalBody = 0;
  let totalRange = 0;

  for (const c of lastThree) {
    const range = Math.max(0.01, c.high - c.low);
    const body = Math.abs(c.close - c.open);
    totalBody += body;
    totalRange += range;
    if (c.close > c.open) bullishCloses++;
    else if (c.close < c.open) bearishCloses++;
  }

  const bodyRatio = totalRange > 0 ? totalBody / totalRange : 0;
  let momentum: H1AnalysisResult["momentum"] = "Bercampur";

  if (bias === "Bullish") {
    if (bullishCloses >= 2 && bodyRatio > 0.55) {
      momentum = "Kelanjutan kuat";
    } else if (bearishCloses >= 2 || bodyRatio < 0.35) {
      momentum = "Melemah";
    }
  } else if (bias === "Bearish") {
    if (bearishCloses >= 2 && bodyRatio > 0.55) {
      momentum = "Kelanjutan kuat";
    } else if (bullishCloses >= 2 || bodyRatio < 0.35) {
      momentum = "Melemah";
    }
  }

  let reason = "";
  if (bias === "Bullish") {
    reason = `Struktur H1 membentuk pola Higher High & Higher Low di kisaran $${recentLow.toFixed(2)} - $${recentHigh.toFixed(2)}. Momentum ${momentum.toLowerCase()}.`;
  } else if (bias === "Bearish") {
    reason = `Struktur H1 membentuk pola Lower High & Lower Low di kisaran $${recentLow.toFixed(2)} - $${recentHigh.toFixed(2)}. Momentum ${momentum.toLowerCase()}.`;
  } else {
    reason = `Struktur H1 sedang bergerak sideways di kisaran $${recentLow.toFixed(2)} - $${recentHigh.toFixed(2)}. Bias tren makro belum terarah.`;
  }

  return {
    bias,
    structure,
    momentum,
    reason,
    recentHigh,
    recentLow,
    candleCount: candles.length,
  };
}

/**
 * 6. M15 Location Engine
 * Analyzes pullback, discount/premium relative to recent range, and key zones.
 * Crucial Rule: FIRST TOUCH ALONE IS NOT AN ENTRY SIGNAL.
 */
export function analyzeM15Location(
  candles: CandleItem[],
  h1Bias: "Bullish" | "Bearish" | "Netral"
): M15AnalysisResult {
  if (candles.length < 2) {
    return {
      location: "Area Belum Jelas",
      zoneType: "Menunggu data M15",
      pullbackStatus: "Sedang Berjalan",
      matchesH1Bias: false,
      isFirstTouch: false,
      rangeHigh: null,
      rangeLow: null,
      equilibrium: null,
      reason: "Data candle M15 belum cukup untuk memetakan zona harga.",
      candleCount: candles.length,
    };
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeSpan = Math.max(0.01, rangeHigh - rangeLow);
  const equilibrium = Number((rangeLow + rangeSpan * 0.5).toFixed(2));

  const latestCandle = candles[candles.length - 1];
  const currentPrice = latestCandle.close;

  // Relative location in range
  const pricePct = (currentPrice - rangeLow) / rangeSpan;
  let location: M15AnalysisResult["location"] = "Equilibrium / Tengah";
  let zoneType = "Equilibrium (Fair Value)";

  if (pricePct <= 0.382) {
    location = "Diskon (Area Beli)";
    zoneType = "Zona Diskon / Demand";
  } else if (pricePct >= 0.618) {
    location = "Premium (Area Jual)";
    zoneType = "Zona Premium / Supply";
  }

  // Pullback detection
  let pullbackStatus: M15AnalysisResult["pullbackStatus"] = "Sedang Berjalan";
  let isFirstTouch = false;

  if (h1Bias === "Bullish") {
    // Bullish wants pullback into discount
    if (pricePct <= 0.45) {
      pullbackStatus = "Pullback Valid";
      // First touch if the candle just recently touched the zone low
      const touches = candles.filter((c) => c.low <= rangeLow + rangeSpan * 0.25).length;
      isFirstTouch = touches <= 1;
    } else if (pricePct > 0.85) {
      pullbackStatus = "Overextended";
    } else {
      pullbackStatus = "Sedang Berjalan";
    }
  } else if (h1Bias === "Bearish") {
    // Bearish wants pullback into premium
    if (pricePct >= 0.55) {
      pullbackStatus = "Pullback Valid";
      const touches = candles.filter((c) => c.high >= rangeHigh - rangeSpan * 0.25).length;
      isFirstTouch = touches <= 1;
    } else if (pricePct < 0.15) {
      pullbackStatus = "Overextended";
    } else {
      pullbackStatus = "Sedang Berjalan";
    }
  }

  // Check if location aligns with H1 Bias
  const matchesH1Bias =
    (h1Bias === "Bullish" && location === "Diskon (Area Beli)") ||
    (h1Bias === "Bearish" && location === "Premium (Area Jual)");

  let reason = "";
  if (matchesH1Bias) {
    reason = `Harga berada di ${location} ($${currentPrice.toFixed(2)} vs EQ $${equilibrium.toFixed(2)}), mendukung rencana bias ${h1Bias}. ${isFirstTouch ? "Perhatian: Ini sentuhan pertama zona (first touch), konfirmasi M5 wajib ditunggu." : "Zona telah teruji."}`;
  } else if (h1Bias === "Bullish" && location === "Premium (Area Jual)") {
    reason = `Harga berada di area Premium ($${currentPrice.toFixed(2)}). Hindari mengejar harga atas (chasing price) sebelum terjadi pullback ke area diskon.`;
  } else if (h1Bias === "Bearish" && location === "Diskon (Area Beli)") {
    reason = `Harga berada di area Diskon ($${currentPrice.toFixed(2)}). Hindari sell di dasar harga sebelum terjadi pullback ke area premium.`;
  } else {
    reason = `Harga berada di kisaran netral/equilibrium ($${currentPrice.toFixed(2)}). Menunggu harga bergerak ke zona batas yang valid.`;
  }

  return {
    location,
    zoneType,
    pullbackStatus,
    matchesH1Bias,
    isFirstTouch,
    rangeHigh,
    rangeLow,
    equilibrium,
    reason,
    candleCount: candles.length,
  };
}

/**
 * 7. Liquidity Engine
 * Identifies observable price sweeps of buy-side (BSL) or sell-side (SSL) liquidity pools.
 */
export function analyzeLiquidity(
  m15Candles: CandleItem[],
  m5Candles: CandleItem[],
  h1Bias: "Bullish" | "Bearish" | "Netral"
): LiquidityAnalysisResult {
  const combined = [...m15Candles.slice(-6), ...m5Candles.slice(-8)];
  if (combined.length < 3) {
    return {
      status: "Tidak ada sweep yang jelas",
      bslLevel: null,
      sslLevel: null,
      sweptPrice: null,
      sweepDetected: false,
      reason: "Data candle belum cukup untuk mendeteksi pool likuiditas.",
    };
  }

  // Calculate recent swing highs and swing lows (excluding current forming candle)
  const pastCandles = combined.slice(0, -1);
  const current = combined[combined.length - 1];

  const bslLevel = Math.max(...pastCandles.map((c) => c.high));
  const sslLevel = Math.min(...pastCandles.map((c) => c.low));

  // Check for Sell-Side Liquidity (SSL) sweep:
  // A candle pierced below sslLevel, but closed back above sslLevel or reacted upward
  const sslSwept = combined.some(
    (c) => c.low < sslLevel && c.close > c.low && (c.close >= sslLevel - 0.5 || c.close > c.open)
  );

  // Check for Buy-Side Liquidity (BSL) sweep:
  // A candle pierced above bslLevel, but closed back below bslLevel or reacted downward
  const bslSwept = combined.some(
    (c) => c.high > bslLevel && c.close < c.high && (c.close <= bslLevel + 0.5 || c.close < c.open)
  );

  if (sslSwept && (!bslSwept || h1Bias === "Bullish")) {
    return {
      status: "Likuiditas bawah tersapu",
      bslLevel,
      sslLevel,
      sweptPrice: sslLevel,
      sweepDetected: true,
      reason: `Wick menembus ke bawah swing low $${sslLevel.toFixed(2)} dan langsung ditolak kembali ke atas (Sell-Side Liquidity sweep teramati).`,
    };
  }

  if (bslSwept && (!sslSwept || h1Bias === "Bearish")) {
    return {
      status: "Likuiditas atas tersapu",
      bslLevel,
      sslLevel,
      sweptPrice: bslLevel,
      sweepDetected: true,
      reason: `Wick menembus ke atas swing high $${bslLevel.toFixed(2)} dan langsung ditolak ke bawah (Buy-Side Liquidity sweep teramati).`,
    };
  }

  // If price is approaching but hasn't pierced yet
  if (current.low - sslLevel < 1.0 || bslLevel - current.high < 1.0) {
    return {
      status: "Likuiditas belum tersapu",
      bslLevel,
      sslLevel,
      sweptPrice: null,
      sweepDetected: false,
      reason: `Harga sedang mendekati pool likuiditas (BSL: $${bslLevel.toFixed(2)} | SSL: $${sslLevel.toFixed(2)}), namun belum terjadi penetrasi sweep yang jelas.`,
    };
  }

  return {
    status: "Tidak ada sweep yang jelas",
    bslLevel,
    sslLevel,
    sweptPrice: null,
    sweepDetected: false,
    reason: `Belum teramati sweep likuiditas mayor pada swing terkini (BSL: $${bslLevel.toFixed(2)}, SSL: $${sslLevel.toFixed(2)}).`,
  };
}

/**
 * 8 & 9. M5 Confirmation & Retest Engine
 * Enforces: CHoCH/MSS -> Displacement -> Retest -> Entry consideration.
 * Mandatory Rule: If CHoCH/MSS exists without a valid retest, status is "Menunggu retest" and decision is WAIT.
 */
export function analyzeM5Confirmation(
  candles: CandleItem[],
  h1Bias: "Bullish" | "Bearish" | "Netral",
  liquiditySwept: boolean
): M5ConfirmationResult {
  if (candles.length < MIN_CANDLES_M5) {
    return {
      status: "Belum ada CHoCH/MSS",
      chochDetected: false,
      displacementDetected: false,
      retestStatus: "Belum ada",
      breakLevel: null,
      reason: "Data candle M5 belum mencukupi untuk validasi struktur mikro.",
      candleCount: candles.length,
    };
  }

  let chochDetected = false;
  let displacementDetected = false;
  let breakLevel: number | null = null;
  let retestStatus: M5ConfirmationResult["retestStatus"] = "Belum ada";

  if (h1Bias === "Bullish") {
    // Bullish CHoCH: candle closes above prior micro high with displacement
    for (let i = 1; i < candles.length; i++) {
      const priorCandles = candles.slice(0, i);
      const priorHigh = Math.max(...priorCandles.map((c) => c.high));
      const curr = candles[i];

      if (curr.close > priorHigh) {
        chochDetected = true;
        breakLevel = priorHigh;
        const candleRange = Math.max(0.01, curr.high - curr.low);
        const candleBody = curr.close - curr.open;
        displacementDetected = candleBody > 0 && candleBody / candleRange >= 0.45;

        // Retest: subsequent candles after the break candle
        const postBreakCandles = candles.slice(i + 1);
        if (postBreakCandles.length === 0) {
          retestStatus = "Menunggu";
        } else {
          const didTouchLevel = postBreakCandles.some((c) => c.low <= priorHigh + 0.8);
          const didHold = postBreakCandles.every((c) => c.close >= priorHigh - 0.5);

          if (didTouchLevel && didHold) {
            retestStatus = "Valid";
          } else if (!didHold) {
            retestStatus = "Gagal";
          } else {
            retestStatus = "Menunggu";
          }
        }
      }
    }
  } else if (h1Bias === "Bearish") {
    // Bearish CHoCH: candle closes below prior micro low with displacement
    for (let i = 1; i < candles.length; i++) {
      const priorCandles = candles.slice(0, i);
      const priorLow = Math.min(...priorCandles.map((c) => c.low));
      const curr = candles[i];

      if (curr.close < priorLow) {
        chochDetected = true;
        breakLevel = priorLow;
        const candleRange = Math.max(0.01, curr.high - curr.low);
        const candleBody = curr.open - curr.close;
        displacementDetected = candleBody > 0 && candleBody / candleRange >= 0.45;

        const postBreakCandles = candles.slice(i + 1);
        if (postBreakCandles.length === 0) {
          retestStatus = "Menunggu";
        } else {
          const didTouchLevel = postBreakCandles.some((c) => c.high >= priorLow - 0.8);
          const didHold = postBreakCandles.every((c) => c.close <= priorLow + 0.5);

          if (didTouchLevel && didHold) {
            retestStatus = "Valid";
          } else if (!didHold) {
            retestStatus = "Gagal";
          } else {
            retestStatus = "Menunggu";
          }
        }
      }
    }
  }

  // Determine final M5 status string
  let status: M5ConfirmationResult["status"] = "Belum ada CHoCH/MSS";
  let reason = "";

  if (!chochDetected) {
    status = "Belum ada CHoCH/MSS";
    reason = `Belum terbentuk pergeseran struktur mikro (CHoCH) pada M5. Breakout level ${breakLevel ? "$" + breakLevel.toFixed(2) : "kunci"} belum terjadi.`;
  } else if (!displacementDetected) {
    status = "Konfirmasi tidak valid";
    reason = `Terjadi penembusan level $${breakLevel?.toFixed(2)}, namun tidak disertai displacement (kekuatan candle) yang valid.`;
  } else if (retestStatus === "Menunggu") {
    status = "Menunggu retest";
    reason = `CHoCH & displacement terdeteksi di $${breakLevel?.toFixed(2)}. Sesuai aturan: Wajib menunggu retest area sebelum eksekusi diperbolehkan.`;
  } else if (retestStatus === "Gagal") {
    status = "Konfirmasi tidak valid";
    reason = `Retest pada level $${breakLevel?.toFixed(2)} gagal bertahan. Struktur mikro dibatalkan.`;
  } else if (retestStatus === "Valid") {
    if (h1Bias === "Bullish") {
      status = "Bullish terkonfirmasi";
      reason = `Konfirmasi M5 lengkap: Bullish CHoCH + displacement + retest sukses bertahan di atas $${breakLevel?.toFixed(2)}.`;
    } else {
      status = "Bearish terkonfirmasi";
      reason = `Konfirmasi M5 lengkap: Bearish CHoCH + displacement + retest sukses bertahan di bawah $${breakLevel?.toFixed(2)}.`;
    }
  }

  return {
    status,
    chochDetected,
    displacementDetected,
    retestStatus,
    breakLevel,
    reason,
    candleCount: candles.length,
  };
}

/**
 * 11. Session Filter
 * Asia session is preferred (normal operating mode).
 * London / New York: caution banner.
 * High-impact macro news: triggers special news caution state.
 */
export function evaluateSession(
  sessionName: string | undefined,
  highImpactNewsActive: boolean = false
): {
  sessionLabel: string;
  isPreferred: boolean;
  isCaution: boolean;
  isNewsMode: boolean;
  badgeColor: string;
  message: string;
} {
  const s = (sessionName || "").toLowerCase();

  if (highImpactNewsActive) {
    return {
      sessionLabel: "Mode Berita Berdampak Tinggi",
      isPreferred: false,
      isCaution: true,
      isNewsMode: true,
      badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
      message: "Mode Berita Berdampak Tinggi aktif. Seluruh setup valid ditangguhkan demi perlindungan modal.",
    };
  }

  switch (s) {
    case "asia":
      return {
        sessionLabel: "Sesi Asia (Utama)",
        isPreferred: true,
        isCaution: false,
        isNewsMode: false,
        badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
        message: "Sesi preferensi trading plan aktif. Evaluasi operasional normal.",
      };
    case "london":
      return {
        sessionLabel: "Sesi London (Waspada)",
        isPreferred: false,
        isCaution: true,
        isNewsMode: false,
        badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
        message: "Perhatian: sesi bukan sesi utama. Perhatikan potensi volatilitas tambahan.",
      };
    case "newyork":
      return {
        sessionLabel: "Sesi New York (Waspada)",
        isPreferred: false,
        isCaution: true,
        isNewsMode: false,
        badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
        message: "Perhatian: sesi bukan sesi utama. Waspadai rilis data ekonomi US.",
      };
    case "overlap":
      return {
        sessionLabel: "Overlap London / NY",
        isPreferred: false,
        isCaution: true,
        isNewsMode: false,
        badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
        message: "Perhatian: sesi bukan sesi utama. Likuiditas dan spread tinggi.",
      };
    default:
      return {
        sessionLabel: sessionName ? sessionName.toUpperCase() : "Sesi Aktif",
        isPreferred: false,
        isCaution: false,
        isNewsMode: false,
        badgeColor: "bg-zinc-100 text-zinc-700 border-zinc-200",
        message: "Sesi pasar sedang berjalan.",
      };
  }
}

/**
 * 12. Risk Engine
 * Checks user-configured Lootly account risk parameters:
 * - Daily loss limit
 * - Consecutive loss limit
 * - Max trades per day
 * Returns riskFilter: "AMAN" | "PERINGATAN" | "DIBLOKIR"
 */
export function evaluateRisk(
  settings: {
    dailyLossLimit?: number;
    stopAfterLosses?: number;
    maxTradePerDay?: number;
  },
  todayStats: {
    dailyLossSoFar: number;
    consecutiveLossesSoFar: number;
    tradesToday: number;
  }
): RiskAnalysisResult {
  const reasons: string[] = [];
  let isBreached = false;

  const dailyLimit = settings.dailyLossLimit || 0;
  const maxLosses = settings.stopAfterLosses || 0;
  const maxTrades = settings.maxTradePerDay || 0;

  // Check Daily Loss Limit
  if (dailyLimit > 0 && todayStats.dailyLossSoFar >= dailyLimit) {
    isBreached = true;
    reasons.push(
      `Batas kerugian harian terlampaui (-Rp ${todayStats.dailyLossSoFar.toLocaleString("id-ID")} / limit Rp ${dailyLimit.toLocaleString("id-ID")}).`
    );
  }

  // Check Consecutive Losses
  if (maxLosses > 0 && todayStats.consecutiveLossesSoFar >= maxLosses) {
    isBreached = true;
    reasons.push(
      `Batas kekalahan beruntun tercapai (${todayStats.consecutiveLossesSoFar}x loss beruntun). Istirahat wajib diaktifkan.`
    );
  }

  // Check Max Trades Per Day
  if (maxTrades > 0 && todayStats.tradesToday >= maxTrades) {
    isBreached = true;
    reasons.push(
      `Batas kuota trade harian (${todayStats.tradesToday}/${maxTrades}) telah terpenuhi.`
    );
  }

  let status: RiskAnalysisResult["status"] = "Aman";
  let riskFilter: "AMAN" | "PERINGATAN" | "DIBLOKIR" = "AMAN";

  if (isBreached) {
    status = "Terlalu Berisiko";
    riskFilter = "DIBLOKIR";
  } else if (
    (dailyLimit > 0 && todayStats.dailyLossSoFar >= dailyLimit * 0.7) ||
    (maxLosses > 0 && todayStats.consecutiveLossesSoFar >= maxLosses - 1)
  ) {
    status = "Waspada";
    riskFilter = "PERINGATAN";
    reasons.push("Mendekati ambang batas toleransi risiko harian.");
  } else {
    riskFilter = "AMAN";
    reasons.push("Parameter risiko portofolio dalam batas aman.");
  }

  return {
    status,
    riskFilter,
    reasons,
    isBreached,
    dailyLossSoFar: todayStats.dailyLossSoFar,
    consecutiveLossesSoFar: todayStats.consecutiveLossesSoFar,
    tradesToday: todayStats.tradesToday,
  };
}

export interface ExecutionPlanCalculationResult {
  plan: ExecutionPlan | null;
  isValid: boolean;
  isExpired: boolean;
  failureReason: string | null;
}

/**
 * 13. Risk / Reward & Execution Plan Calculation
 * Mandatory HARD GATES:
 * - Valid entry zone (entryLow, entryHigh, referenceEntry) from real M5 retest
 * - Valid structural Stop Loss (below/above liquidity sweep or swing extreme + noise buffer)
 * - Valid Take Profit (TP1 mandatory from opposing liquidity/structure, TP2 optional)
 * - Strict Minimum Risk/Reward (MIN_RR >= 2.0 to TP1)
 * - Valid Invalidation level and reason
 * - Setup expiry detection (overextended, partially played out, or invalidated)
 */
export function calculateExecutionPlan(
  h1: H1AnalysisResult,
  m15: M15AnalysisResult,
  liq: LiquidityAnalysisResult,
  m5: M5ConfirmationResult,
  currentPrice: number,
  sessionInfo: ReturnType<typeof evaluateSession>,
  targetRR: number = 2.0,
  dataFreshnessText: string = "Realtime"
): ExecutionPlanCalculationResult {
  if (h1.bias === "Netral" || !m5.breakLevel) {
    return {
      plan: null,
      isValid: false,
      isExpired: false,
      failureReason: "Level konfirmasi M5 (breakLevel) atau bias H1 belum valid.",
    };
  }

  const direction: "BUY" | "SELL" = h1.bias === "Bullish" ? "BUY" : "SELL";
  const minRR = Math.max(2.0, targetRR);
  const now = Date.now();
  const setupCreatedAt = now;
  const setupExpiresAt = now + 45 * 60 * 1000; // 45-minute validity window (approx. 9 M5 candles)
  const noiseBuffer = 1.20; // Structural volatility noise buffer for XAU/USD

  if (direction === "BUY") {
    // 1. Entry zone from confirmed M5 level
    const entryLow = Number((m5.breakLevel - 0.25).toFixed(2));
    const entryHigh = Number((m5.breakLevel + 0.65).toFixed(2));
    const referenceEntry = Number(((entryLow + entryHigh) / 2).toFixed(2));
    const entryArea = `${entryLow.toFixed(2)} – ${entryHigh.toFixed(2)}`;

    // 2. Structural Stop Loss: below swept liquidity low or M15 range low
    const structuralLow = liq.sweptPrice || m15.rangeLow || (h1.recentLow ? h1.recentLow : null);
    if (!structuralLow || structuralLow >= entryLow) {
      return {
        plan: null,
        isValid: false,
        isExpired: false,
        failureReason: "Stop Loss struktural tidak valid (tidak ada swing low / swept liquidity di bawah entry).",
      };
    }

    const stopLoss = Number((structuralLow - noiseBuffer).toFixed(2));
    const riskDistance = Number((referenceEntry - stopLoss).toFixed(2));

    if (riskDistance < 1.0) {
      return {
        plan: null,
        isValid: false,
        isExpired: false,
        failureReason: "Jarak Stop Loss terlalu dekat dengan noise pasar (< 1.0 poin).",
      };
    }

    // 3. Take Profit Targets (Opposing BSL or swing high)
    const rawTargets = [liq.bslLevel, m15.rangeHigh, h1.recentHigh].filter(
      (lvl): lvl is number => typeof lvl === "number" && lvl > referenceEntry + 1.0
    );
    const uniqueSortedTargets = Array.from(new Set(rawTargets)).sort((a, b) => a - b);

    if (uniqueSortedTargets.length === 0) {
      return {
        plan: null,
        isValid: false,
        isExpired: false,
        failureReason: "Tidak ada target struktural (opposing liquidity / swing high) di atas entry.",
      };
    }

    // TP1 is the primary structural objective
    const tp1 = Number(uniqueSortedTargets[0].toFixed(2));
    const tp2 = uniqueSortedTargets.length > 1 ? Number(uniqueSortedTargets[uniqueSortedTargets.length - 1].toFixed(2)) : null;

    const rewardDistance = Number((tp1 - referenceEntry).toFixed(2));
    const rrToTp1 = Number((rewardDistance / riskDistance).toFixed(2));
    const rrToTp2 = tp2 ? Number(((tp2 - referenceEntry) / riskDistance).toFixed(2)) : null;

    const invalidationLevel = stopLoss;
    const invalidationReason = `Close candle di bawah $${stopLoss.toFixed(2)}`;

    const plan: ExecutionPlan = {
      direction: "BUY",
      entryLow,
      entryHigh,
      referenceEntry,
      stopLoss,
      tp1,
      tp2,
      rrToTp1,
      rrToTp2,
      invalidationLevel,
      invalidationReason,
      setupCreatedAt,
      setupExpiresAt,
      marketPriceAtSignal: currentPrice,
      // Compatibility references
      entryArea,
      entryZone: `$${entryArea}`,
      stopLossRef: stopLoss,
      takeProfitRef: tp1,
      estimatedRR: rrToTp1,
      rr: rrToTp1,
      invalidation: invalidationReason,
      timestamp: now,
      dataFreshness: dataFreshnessText,
      htfBias: "Bullish (H1 Higher Highs & Higher Lows)",
      m15Area: `${m15.zoneType} ($${m15.rangeLow?.toFixed(2)} - $${m15.equilibrium?.toFixed(2)})`,
      liquidityEvent: liq.status,
      m5Confirmation: m5.status,
      sessionNote: sessionInfo.sessionLabel,
      riskStatus: "Sesuai parameter portofolio",
    };

    // 4. Expiry Checks
    if (currentPrice > 0) {
      // Invalidation occurred: price traded below Stop Loss
      if (currentPrice < stopLoss) {
        return {
          plan,
          isValid: false,
          isExpired: true,
          failureReason: `Setup gugur. Harga ($${currentPrice.toFixed(2)}) menembus level invalidasi $${stopLoss.toFixed(2)}.`,
        };
      }
      // Target partially played out before entry (reached 45%+ of TP1 distance)
      if (currentPrice >= referenceEntry + rewardDistance * 0.45) {
        return {
          plan,
          isValid: false,
          isExpired: true,
          failureReason: "Setup sudah terlewat. Target sudah berjalan sebagian sebelum entry tercapai. Jangan kejar harga.",
        };
      }
      // Price moved materially away from entry zone
      if (currentPrice > entryHigh + 2.0) {
        return {
          plan,
          isValid: false,
          isExpired: true,
          failureReason: "Setup sudah terlewat. Harga telah bergerak menjauhi area entry. Jangan kejar harga.",
        };
      }
    }

    // 5. Minimum Risk/Reward Hard Gate
    if (rrToTp1 < minRR) {
      return {
        plan,
        isValid: false,
        isExpired: false,
        failureReason: `Ruang menuju target belum cukup untuk memenuhi Risk/Reward minimum (RR 1:${rrToTp1.toFixed(1)} < min 1:${minRR.toFixed(1)}).`,
      };
    }

    return {
      plan,
      isValid: true,
      isExpired: false,
      failureReason: null,
    };
  } else {
    // SELL DIRECTION
    // 1. Entry zone from confirmed M5 level
    const entryLow = Number((m5.breakLevel - 0.65).toFixed(2));
    const entryHigh = Number((m5.breakLevel + 0.25).toFixed(2));
    const referenceEntry = Number(((entryLow + entryHigh) / 2).toFixed(2));
    const entryArea = `${entryLow.toFixed(2)} – ${entryHigh.toFixed(2)}`;

    // 2. Structural Stop Loss: above swept liquidity high or M15 range high
    const structuralHigh = liq.sweptPrice || m15.rangeHigh || (h1.recentHigh ? h1.recentHigh : null);
    if (!structuralHigh || structuralHigh <= entryHigh) {
      return {
        plan: null,
        isValid: false,
        isExpired: false,
        failureReason: "Stop Loss struktural tidak valid (tidak ada swing high / swept liquidity di atas entry).",
      };
    }

    const stopLoss = Number((structuralHigh + noiseBuffer).toFixed(2));
    const riskDistance = Number((stopLoss - referenceEntry).toFixed(2));

    if (riskDistance < 1.0) {
      return {
        plan: null,
        isValid: false,
        isExpired: false,
        failureReason: "Jarak Stop Loss terlalu dekat dengan noise pasar (< 1.0 poin).",
      };
    }

    // 3. Take Profit Targets (Opposing SSL or swing low)
    const rawTargets = [liq.sslLevel, m15.rangeLow, h1.recentLow].filter(
      (lvl): lvl is number => typeof lvl === "number" && lvl < referenceEntry - 1.0
    );
    const uniqueSortedTargets = Array.from(new Set(rawTargets)).sort((a, b) => b - a); // descending for sell

    if (uniqueSortedTargets.length === 0) {
      return {
        plan: null,
        isValid: false,
        isExpired: false,
        failureReason: "Tidak ada target struktural (opposing liquidity / swing low) di bawah entry.",
      };
    }

    const tp1 = Number(uniqueSortedTargets[0].toFixed(2));
    const tp2 = uniqueSortedTargets.length > 1 ? Number(uniqueSortedTargets[uniqueSortedTargets.length - 1].toFixed(2)) : null;

    const rewardDistance = Number((referenceEntry - tp1).toFixed(2));
    const rrToTp1 = Number((rewardDistance / riskDistance).toFixed(2));
    const rrToTp2 = tp2 ? Number(((referenceEntry - tp2) / riskDistance).toFixed(2)) : null;

    const invalidationLevel = stopLoss;
    const invalidationReason = `Close candle di atas $${stopLoss.toFixed(2)}`;

    const plan: ExecutionPlan = {
      direction: "SELL",
      entryLow,
      entryHigh,
      referenceEntry,
      stopLoss,
      tp1,
      tp2,
      rrToTp1,
      rrToTp2,
      invalidationLevel,
      invalidationReason,
      setupCreatedAt,
      setupExpiresAt,
      marketPriceAtSignal: currentPrice,
      // Compatibility references
      entryArea,
      entryZone: `$${entryArea}`,
      stopLossRef: stopLoss,
      takeProfitRef: tp1,
      estimatedRR: rrToTp1,
      rr: rrToTp1,
      invalidation: invalidationReason,
      timestamp: now,
      dataFreshness: dataFreshnessText,
      htfBias: "Bearish (H1 Lower Highs & Lower Lows)",
      m15Area: `${m15.zoneType} ($${m15.equilibrium?.toFixed(2)} - $${m15.rangeHigh?.toFixed(2)})`,
      liquidityEvent: liq.status,
      m5Confirmation: m5.status,
      sessionNote: sessionInfo.sessionLabel,
      riskStatus: "Sesuai parameter portofolio",
    };

    // 4. Expiry Checks
    if (currentPrice > 0) {
      // Invalidation occurred: price traded above Stop Loss
      if (currentPrice > stopLoss) {
        return {
          plan,
          isValid: false,
          isExpired: true,
          failureReason: `Setup gugur. Harga ($${currentPrice.toFixed(2)}) menembus level invalidasi $${stopLoss.toFixed(2)}.`,
        };
      }
      // Target partially played out before entry (reached 45%+ of TP1 distance)
      if (currentPrice <= referenceEntry - rewardDistance * 0.45) {
        return {
          plan,
          isValid: false,
          isExpired: true,
          failureReason: "Setup sudah terlewat. Target sudah berjalan sebagian sebelum entry tercapai. Jangan kejar harga.",
        };
      }
      // Price moved materially away from entry zone
      if (currentPrice < entryLow - 2.0) {
        return {
          plan,
          isValid: false,
          isExpired: true,
          failureReason: "Setup sudah terlewat. Harga telah bergerak menjauhi area entry. Jangan kejar harga.",
        };
      }
    }

    // 5. Minimum Risk/Reward Hard Gate
    if (rrToTp1 < minRR) {
      return {
        plan,
        isValid: false,
        isExpired: false,
        failureReason: `Ruang menuju target belum cukup untuk memenuhi Risk/Reward minimum (RR 1:${rrToTp1.toFixed(1)} < min 1:${minRR.toFixed(1)}).`,
      };
    }

    return {
      plan,
      isValid: true,
      isExpired: false,
      failureReason: null,
    };
  }
}

/**
 * 14. Setup Checklist & Final Decision Engine
 * Deterministic rule engine for Lootly setup validation:
 * H1 -> M15 -> Liquidity -> M5 CHoCH/MSS -> Displacement -> Retest -> Risk -> Hard Gates (SL, TP, RR, Expiry)
 *
 * Decisions:
 * BUY_SETUP_VALID  -> SETUP BUY VALID
 * SELL_SETUP_VALID -> SETUP SELL VALID
 * WAIT_BUY         -> TUNGGU BUY
 * WAIT_SELL        -> TUNGGU SELL
 * NO_TRADE         -> TIDAK ADA TRADE
 * SETUP_EXPIRED    -> SETUP KEDALUWARSA
 * SETUP_FORMING    -> SETUP TERBENTUK (Pre-alert)
 */
export function evaluateInstitutionalConfluence(
  dataQuality: DataQualityStatus,
  h1: H1AnalysisResult,
  m15: M15AnalysisResult,
  liq: LiquidityAnalysisResult,
  m5: M5ConfirmationResult,
  risk: RiskAnalysisResult,
  sessionInfo: ReturnType<typeof evaluateSession>,
  currentPrice: number,
  targetRR: number = 2.0
): {
  decision: SetupDecision;
  checklist: ConfluenceChecklistItem[];
  executionPlan: ExecutionPlan | null;
} {
  const isBullishDirection = h1.bias === "Bullish";
  const isBearishDirection = h1.bias === "Bearish";

  // Build 7-point Compact Checklist adapted dynamically to direction
  const checklist: ConfluenceChecklistItem[] = [
    // 1. H1 Bias
    {
      id: "h1_bias",
      label: "H1 Bias",
      status:
        !dataQuality.analysisAllowed || h1.candleCount < MIN_CANDLES_H1
          ? "waiting"
          : h1.bias !== "Netral"
          ? "passed"
          : "failed",
      detail:
        h1.bias === "Bullish"
          ? "Bullish (struktur HH/HL)"
          : h1.bias === "Bearish"
          ? "Bearish (struktur LH/LL)"
          : "Netral / Ranging (tanpa arah dominan)",
    },
    // 2. M15 Pullback
    {
      id: "m15_pullback",
      label: "M15 Pullback",
      status:
        !dataQuality.analysisAllowed || m15.candleCount < MIN_CANDLES_M15
          ? "waiting"
          : m15.matchesH1Bias && m15.pullbackStatus === "Pullback Valid"
          ? "passed"
          : m15.pullbackStatus === "Overextended"
          ? "failed"
          : "waiting",
      detail:
        isBullishDirection
          ? m15.matchesH1Bias
            ? "Valid di area Diskon"
            : `Belum di area diskon (${m15.location})`
          : isBearishDirection
          ? m15.matchesH1Bias
            ? "Valid di area Premium"
            : `Belum di area premium (${m15.location})`
          : "Menunggu pembentukan pullback di zona kunci",
    },
    // 3. Liquidity Sweep (BSL / SSL)
    {
      id: "liquidity_sweep",
      label: isBullishDirection
        ? "Sellside Liquidity (SSL)"
        : isBearishDirection
        ? "Buyside Liquidity (BSL)"
        : "Liquidity Sweep",
      status:
        isBullishDirection && liq.status === "Likuiditas bawah tersapu"
          ? "passed"
          : isBearishDirection && liq.status === "Likuiditas atas tersapu"
          ? "passed"
          : liq.status === "Likuiditas belum tersapu"
          ? "waiting"
          : "failed",
      detail:
        isBullishDirection
          ? liq.status === "Likuiditas bawah tersapu"
            ? "Tersapu (SSL swept & ditolak ke atas)"
            : "Belum tersapu"
          : isBearishDirection
          ? liq.status === "Likuiditas atas tersapu"
            ? "Tersapu (BSL swept & ditolak ke bawah)"
            : "Belum tersapu"
          : liq.status,
    },
    // 4. M5 CHoCH/MSS
    {
      id: "m5_choch",
      label: "M5 CHoCH/MSS",
      status:
        isBullishDirection
          ? m5.chochDetected && m5.breakLevel !== null
            ? "passed"
            : "waiting"
          : isBearishDirection
          ? m5.chochDetected && m5.breakLevel !== null
            ? "passed"
            : "waiting"
          : "waiting",
      detail: m5.chochDetected
        ? `Terkonfirmasi di $${m5.breakLevel?.toFixed(2)}`
        : "Belum ada pergeseran struktur mikro",
    },
    // 5. Displacement
    {
      id: "displacement",
      label: "Displacement",
      status: m5.displacementDetected ? "passed" : "waiting",
      detail: m5.displacementDetected
        ? "Terkonfirmasi (candle momentum solid)"
        : "Belum terkonfirmasi",
    },
    // 6. Retest
    {
      id: "retest",
      label: "Retest",
      status:
        m5.retestStatus === "Valid"
          ? "passed"
          : m5.retestStatus === "Gagal"
          ? "failed"
          : "waiting",
      detail:
        m5.retestStatus === "Valid"
          ? "Valid (level retest bertahan)"
          : m5.retestStatus === "Menunggu"
          ? "Menunggu retest level breakdown/out"
          : m5.retestStatus === "Gagal"
          ? "Retest gagal menahan harga"
          : "Belum ada retest",
    },
    // 7. Risk
    {
      id: "risk",
      label: "Risk",
      status:
        risk.riskFilter === "DIBLOKIR"
          ? "failed"
          : risk.riskFilter === "PERINGATAN"
          ? "waiting"
          : "passed",
      detail:
        risk.riskFilter === "AMAN"
          ? "Aman (parameter risiko portofolio normal)"
          : risk.riskFilter === "PERINGATAN"
          ? "Peringatan (mendekati batas toleransi)"
          : "Diblokir (batas kerugian harian / loss stop tercapai)",
    },
  ];

  // Count checklist pass/fail
  const passedCount = checklist.filter((item) => item.status === "passed").length;
  const failedCount = checklist.filter((item) => item.status === "failed").length;

  // Confidence label: Kuat | Sedang | Lemah
  let confidence: "Kuat" | "Sedang" | "Lemah" = "Lemah";
  if (passedCount >= 6 && failedCount === 0) {
    confidence = "Kuat";
  } else if (passedCount >= 4 && failedCount <= 1) {
    confidence = "Sedang";
  } else {
    confidence = "Lemah";
  }

  // Final Decision Determination
  let decisionType: SetupDecisionType = SetupDecisionType.NO_TRADE;
  let decisionLabelIndo: DecisionLabelIndo = "TIDAK ADA TRADE";
  const reasons: string[] = [];

  const h1Pass = checklist.find((c) => c.id === "h1_bias")?.status === "passed";
  const m15Pass = checklist.find((c) => c.id === "m15_pullback")?.status === "passed";
  const liqPass = checklist.find((c) => c.id === "liquidity_sweep")?.status === "passed";
  const chochPass = checklist.find((c) => c.id === "m5_choch")?.status === "passed";
  const dispPass = checklist.find((c) => c.id === "displacement")?.status === "passed";
  const retestPass = checklist.find((c) => c.id === "retest")?.status === "passed";
  const riskBlocked = risk.riskFilter === "DIBLOKIR";

  // Pre-calculate execution plan whenever structural level is available
  const planResult = calculateExecutionPlan(
    h1,
    m15,
    liq,
    m5,
    currentPrice,
    sessionInfo,
    targetRR,
    dataQuality.freshnessStatus
  );

  // Case 1: Market Closed
  if (!dataQuality.analysisAllowed && dataQuality.isMarketClosed) {
    decisionType = SetupDecisionType.NO_TRADE;
    decisionLabelIndo = "TIDAK ADA TRADE";
    reasons.push(dataQuality.reason || "Pasar XAU/USD sedang tutup (akhir pekan/rollover).");
  }
  // Case 2: Data Stale
  else if (!dataQuality.analysisAllowed && !dataQuality.isFresh) {
    decisionType = SetupDecisionType.NO_TRADE;
    decisionLabelIndo = "TIDAK ADA TRADE";
    reasons.push("Data pasar belum cukup segar untuk validasi setup.");
  }
  // Case 3: Risk Breached (DIBLOKIR)
  else if (riskBlocked) {
    decisionType = SetupDecisionType.NO_TRADE;
    decisionLabelIndo = "TIDAK ADA TRADE";
    reasons.push(`Filter risiko Lootly aktif (DIBLOKIR): ${risk.reasons.join(" ")}`);
  }
  // Case 4: News Mode
  else if (sessionInfo.isNewsMode) {
    decisionType = SetupDecisionType.NO_TRADE;
    decisionLabelIndo = "TIDAK ADA TRADE";
    reasons.push("Mode Berita Berdampak Tinggi aktif. Seluruh setup valid ditangguhkan demi perlindungan modal.");
  }
  // Case 5: H1 Neutral / Unclear
  else if (h1.bias === "Netral") {
    decisionType = SetupDecisionType.NO_TRADE;
    decisionLabelIndo = "TIDAK ADA TRADE";
    reasons.push("Struktur tren makro H1 tidak jelas / sideways. Tidak ada trade saat tren tidak terarah.");
  }
  // Case 6: BUY Setup Evaluation
  else if (isBullishDirection) {
    const allPreRetestConditionsMet =
      h1Pass && m15Pass && liqPass && chochPass && dispPass && !riskBlocked && dataQuality.analysisAllowed;

    // Check if expired
    if (planResult.isExpired) {
      decisionType = SetupDecisionType.SETUP_EXPIRED;
      decisionLabelIndo = "SETUP KEDALUWARSA";
      reasons.push(planResult.failureReason || "Setup sudah kedaluwarsa. Jangan mengejar harga.");
    }
    // Check if all confluence + retest met
    else if (allPreRetestConditionsMet && retestPass) {
      // HARD GATE: Execution Plan MUST be complete and valid
      if (!planResult.isValid || !planResult.plan) {
        if (planResult.failureReason?.includes("Risk/Reward")) {
          decisionType = SetupDecisionType.NO_TRADE;
          decisionLabelIndo = "TIDAK ADA TRADE";
          reasons.push("Ruang menuju target belum cukup untuk memenuhi Risk/Reward minimum (min 1:2.0).");
        } else {
          decisionType = SetupDecisionType.WAIT_BUY;
          decisionLabelIndo = "TUNGGU BUY";
          reasons.push(planResult.failureReason || "Parameter eksekusi (SL/TP struktural) belum memenuhi syarat valid.");
        }
      } else {
        decisionType = SetupDecisionType.BUY_SETUP_VALID;
        decisionLabelIndo = "SETUP BUY VALID";
        reasons.push(
          `Seluruh kondisi setup BUY terkonfirmasi: H1 bias bullish, pullback M15 di diskon, SSL tersapu, M5 CHoCH + displacement, retest bertahan, RR 1:${planResult.plan.rrToTp1.toFixed(1)} (>= 1:2.0), dan risiko akun aman.`
        );
      }
    }
    // Check if SETUP_FORMING (Pre-alert condition: everything met except retest)
    else if (allPreRetestConditionsMet && !retestPass && m5.retestStatus !== "Gagal") {
      decisionType = SetupDecisionType.SETUP_FORMING;
      decisionLabelIndo = "SETUP TERBENTUK";
      reasons.push("Setup BUY sedang terbentuk. Struktur mikro M5 telah bergeser (CHoCH + displacement). Menunggu retest M5 sebelum validasi akhir.");
    } else {
      decisionType = SetupDecisionType.WAIT_BUY;
      decisionLabelIndo = "TUNGGU BUY";

      if (!m15Pass) {
        reasons.push("Menunggu pullback M15 masuk ke area Diskon.");
      } else if (!liqPass) {
        reasons.push("Menunggu penyapuan Sellside Liquidity (SSL) sebelum konfirmasi.");
      } else if (!chochPass) {
        reasons.push("Menunggu terbentuknya pergeseran struktur mikro (CHoCH/MSS) pada M5.");
      } else if (!dispPass) {
        reasons.push("Menunggu candle penembusan bertenaga (displacement) pada M5.");
      } else if (m5.retestStatus === "Gagal") {
        reasons.push("Retest level breakdown/out gagal menahan harga. Tunggu pembentukan struktur baru.");
      } else {
        reasons.push("Menunggu konfirmasi akhir sebelum mempertimbangkan entry BUY.");
      }
    }
  }
  // Case 7: SELL Setup Evaluation
  else if (isBearishDirection) {
    const allPreRetestConditionsMet =
      h1Pass && m15Pass && liqPass && chochPass && dispPass && !riskBlocked && dataQuality.analysisAllowed;

    // Check if expired
    if (planResult.isExpired) {
      decisionType = SetupDecisionType.SETUP_EXPIRED;
      decisionLabelIndo = "SETUP KEDALUWARSA";
      reasons.push(planResult.failureReason || "Setup sudah kedaluwarsa. Jangan mengejar harga.");
    }
    // Check if all confluence + retest met
    else if (allPreRetestConditionsMet && retestPass) {
      // HARD GATE: Execution Plan MUST be complete and valid
      if (!planResult.isValid || !planResult.plan) {
        if (planResult.failureReason?.includes("Risk/Reward")) {
          decisionType = SetupDecisionType.NO_TRADE;
          decisionLabelIndo = "TIDAK ADA TRADE";
          reasons.push("Ruang menuju target belum cukup untuk memenuhi Risk/Reward minimum (min 1:2.0).");
        } else {
          decisionType = SetupDecisionType.WAIT_SELL;
          decisionLabelIndo = "TUNGGU SELL";
          reasons.push(planResult.failureReason || "Parameter eksekusi (SL/TP struktural) belum memenuhi syarat valid.");
        }
      } else {
        decisionType = SetupDecisionType.SELL_SETUP_VALID;
        decisionLabelIndo = "SETUP SELL VALID";
        reasons.push(
          `Seluruh kondisi setup SELL terkonfirmasi: H1 bias bearish, pullback M15 di premium, BSL tersapu, M5 CHoCH + displacement, retest bertahan, RR 1:${planResult.plan.rrToTp1.toFixed(1)} (>= 1:2.0), dan risiko akun aman.`
        );
      }
    }
    // Check if SETUP_FORMING (Pre-alert condition: everything met except retest)
    else if (allPreRetestConditionsMet && !retestPass && m5.retestStatus !== "Gagal") {
      decisionType = SetupDecisionType.SETUP_FORMING;
      decisionLabelIndo = "SETUP TERBENTUK";
      reasons.push("Setup SELL sedang terbentuk. Struktur mikro M5 telah bergeser (CHoCH + displacement). Menunggu retest M5 sebelum validasi akhir.");
    } else {
      decisionType = SetupDecisionType.WAIT_SELL;
      decisionLabelIndo = "TUNGGU SELL";

      if (!m15Pass) {
        reasons.push("Menunggu pullback M15 masuk ke area Premium.");
      } else if (!liqPass) {
        reasons.push("Menunggu penyapuan Buyside Liquidity (BSL) sebelum konfirmasi.");
      } else if (!chochPass) {
        reasons.push("Menunggu terbentuknya pergeseran struktur mikro (CHoCH/MSS) pada M5.");
      } else if (!dispPass) {
        reasons.push("Menunggu candle penembusan bertenaga (displacement) pada M5.");
      } else if (m5.retestStatus === "Gagal") {
        reasons.push("Retest level breakdown/out gagal menahan harga. Tunggu pembentukan struktur baru.");
      } else {
        reasons.push("Menunggu konfirmasi akhir sebelum mempertimbangkan entry SELL.");
      }
    }
  }

  // Invalidation text
  let invalidationText = "";
  if (isBullishDirection) {
    invalidationText = `Bias bullish dibatalkan jika candle H1 ditutup di bawah swing low $${h1.recentLow?.toFixed(2) || "kunci"}. Kondisi entry gugur jika level retest $${m5.breakLevel?.toFixed(2) || "break"} gagal menahan harga.`;
  } else if (isBearishDirection) {
    invalidationText = `Bias bearish dibatalkan jika candle H1 ditutup di atas swing high $${h1.recentHigh?.toFixed(2) || "kunci"}. Kondisi entry gugur jika level retest $${m5.breakLevel?.toFixed(2) || "break"} gagal menahan harga.`;
  } else {
    invalidationText =
      "Tren belum terarah. Bias baru akan terkonfirmasi setelah penutupan candle H1 menembus konsolidasi saat ini.";
  }

  const isValidSetup =
    decisionType === SetupDecisionType.BUY_SETUP_VALID ||
    decisionType === SetupDecisionType.SELL_SETUP_VALID;

  // Only attach execution plan if valid or forming
  const executionPlan = isValidSetup || decisionType === SetupDecisionType.SETUP_FORMING ? planResult.plan : null;

  const decision: SetupDecision = {
    decision: decisionType,
    decisionLabelIndo,
    marketRegime:
      h1.structure === "HH / HL" || h1.structure === "LH / LL"
        ? "Trending Terarah"
        : "Konsolidasi / Range",
    htfBias: `${h1.bias} (${h1.structure})`,
    liquidity: liq.status,
    m15Location: `${m15.location} • ${m15.pullbackStatus}`,
    m5Confirmation: m5.status,
    riskStatus: risk.status,
    confidence,
    isReadyForEntry: isValidSetup,
    reasons,
    invalidationText,
    timestamp: Date.now(),
  };

  return {
    decision,
    checklist,
    executionPlan,
  };
}

