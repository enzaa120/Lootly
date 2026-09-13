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
      `Batas kerugian harian terlampaui (-$${todayStats.dailyLossSoFar.toFixed(2)} / limit $${dailyLimit.toFixed(2)}).`
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
  if (isBreached) {
    status = "Terlalu Berisiko";
  } else if (
    (dailyLimit > 0 && todayStats.dailyLossSoFar >= dailyLimit * 0.7) ||
    (maxLosses > 0 && todayStats.consecutiveLossesSoFar >= maxLosses - 1)
  ) {
    status = "Waspada";
    reasons.push("Mendekati ambang batas toleransi risiko harian.");
  } else {
    reasons.push("Parameter risiko portofolio dalam batas aman.");
  }

  return {
    status,
    reasons,
    isBreached,
    dailyLossSoFar: todayStats.dailyLossSoFar,
    consecutiveLossesSoFar: todayStats.consecutiveLossesSoFar,
    tradesToday: todayStats.tradesToday,
  };
}

/**
 * 13. Risk / Reward & Execution Plan Calculation
 * Strictly derived only when a setup reaches VALID_SETUP.
 */
export function calculateExecutionPlan(
  h1: H1AnalysisResult,
  m15: M15AnalysisResult,
  liq: LiquidityAnalysisResult,
  m5: M5ConfirmationResult,
  currentPrice: number,
  sessionInfo: ReturnType<typeof evaluateSession>,
  targetRR: number = 2.0
): ExecutionPlan | null {
  if (h1.bias === "Netral" || !m5.breakLevel) return null;

  const direction: "BUY" | "SELL" = h1.bias === "Bullish" ? "BUY" : "SELL";

  if (direction === "BUY") {
    // Buy entry near the retested broken microHigh
    const entryLow = Number((m5.breakLevel - 0.2).toFixed(2));
    const entryHigh = Number((m5.breakLevel + 0.6).toFixed(2));
    const entryZone = `$${entryLow} - $${entryHigh}`;

    // Stop loss placed below the swept SSL or swing low with buffer
    const refLow = liq.sweptPrice || (m15.rangeLow ? m15.rangeLow : m5.breakLevel - 3.0);
    const stopLossRef = Number((refLow - 1.5).toFixed(2));
    const riskDistance = Math.max(1.0, m5.breakLevel - stopLossRef);

    // Take profit based on planned RR targeting opposing BSL
    const tpFromRR = Number((m5.breakLevel + riskDistance * targetRR).toFixed(2));
    const takeProfitRef = liq.bslLevel && liq.bslLevel > m5.breakLevel ? Math.max(tpFromRR, liq.bslLevel) : tpFromRR;
    const actualRR = Number(((takeProfitRef - m5.breakLevel) / riskDistance).toFixed(2));

    return {
      direction: "BUY",
      htfBias: "Bullish (H1 Higher Highs & Higher Lows)",
      m15Area: `${m15.zoneType} ($${m15.rangeLow?.toFixed(2)} - $${m15.equilibrium?.toFixed(2)})`,
      liquidityEvent: liq.status,
      m5Confirmation: m5.status,
      entryZone,
      stopLossRef,
      takeProfitRef,
      estimatedRR: actualRR,
      invalidationLevel: stopLossRef,
      sessionNote: sessionInfo.sessionLabel,
      riskStatus: "Sesuai parameter portofolio",
    };
  } else {
    // Sell entry near the retested broken microLow
    const entryLow = Number((m5.breakLevel - 0.6).toFixed(2));
    const entryHigh = Number((m5.breakLevel + 0.2).toFixed(2));
    const entryZone = `$${entryLow} - $${entryHigh}`;

    const refHigh = liq.sweptPrice || (m15.rangeHigh ? m15.rangeHigh : m5.breakLevel + 3.0);
    const stopLossRef = Number((refHigh + 1.5).toFixed(2));
    const riskDistance = Math.max(1.0, stopLossRef - m5.breakLevel);

    const tpFromRR = Number((m5.breakLevel - riskDistance * targetRR).toFixed(2));
    const takeProfitRef = liq.sslLevel && liq.sslLevel < m5.breakLevel ? Math.min(tpFromRR, liq.sslLevel) : tpFromRR;
    const actualRR = Number(((m5.breakLevel - takeProfitRef) / riskDistance).toFixed(2));

    return {
      direction: "SELL",
      htfBias: "Bearish (H1 Lower Highs & Lower Lows)",
      m15Area: `${m15.zoneType} ($${m15.equilibrium?.toFixed(2)} - $${m15.rangeHigh?.toFixed(2)})`,
      liquidityEvent: liq.status,
      m5Confirmation: m5.status,
      entryZone,
      stopLossRef,
      takeProfitRef,
      estimatedRR: actualRR,
      invalidationLevel: stopLossRef,
      sessionNote: sessionInfo.sessionLabel,
      riskStatus: "Sesuai parameter portofolio",
    };
  }
}

/**
 * 14 & 16. Institutional Confluence Checklist & Decision Matrix
 * Pure deterministic rule engine that evaluates strictly without shortcuts.
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
  // Build 10-point Confluence Checklist
  const checklist: ConfluenceChecklistItem[] = [
    {
      id: "h1_bias",
      label: "H1 bias jelas",
      status:
        !dataQuality.analysisAllowed || h1.candleCount < MIN_CANDLES_H1
          ? "waiting"
          : h1.bias !== "Netral"
          ? "passed"
          : "failed",
      detail: h1.bias !== "Netral" ? `${h1.bias} (${h1.structure})` : "Struktur H1 masih netral / ranging",
    },
    {
      id: "m15_zone",
      label: "M15 berada di area valid",
      status:
        !dataQuality.analysisAllowed || m15.candleCount < MIN_CANDLES_M15
          ? "waiting"
          : m15.matchesH1Bias
          ? "passed"
          : "waiting",
      detail: m15.matchesH1Bias ? `${m15.location}` : `Belum di area ideal (${m15.location})`,
    },
    {
      id: "m15_pullback",
      label: "Pullback valid",
      status:
        m15.pullbackStatus === "Pullback Valid"
          ? "passed"
          : m15.pullbackStatus === "Overextended"
          ? "failed"
          : "waiting",
      detail:
        m15.pullbackStatus === "Pullback Valid"
          ? m15.isFirstTouch
            ? "Pullback teramati (sentuhan pertama / first-touch)"
            : "Pullback terkonfirmasi di zona"
          : m15.pullbackStatus === "Overextended"
          ? "Harga overextended (jangan kejar harga)"
          : "Menunggu pembentukan pullback",
    },
    {
      id: "liquidity_sweep",
      label: "Liquidity sweep terkonfirmasi",
      status:
        (h1.bias === "Bullish" && liq.status === "Likuiditas bawah tersapu") ||
        (h1.bias === "Bearish" && liq.status === "Likuiditas atas tersapu")
          ? "passed"
          : liq.status === "Likuiditas belum tersapu"
          ? "waiting"
          : "failed",
      detail: liq.status,
    },
    {
      id: "m5_choch",
      label: "M5 CHoCH/MSS valid",
      status: m5.chochDetected ? "passed" : "waiting",
      detail: m5.chochDetected
        ? `CHoCH di level $${m5.breakLevel?.toFixed(2)}`
        : "Belum terbentuk pergeseran struktur mikro",
    },
    {
      id: "m5_displacement",
      label: "Displacement valid",
      status: m5.displacementDetected ? "passed" : "waiting",
      detail: m5.displacementDetected
        ? "Candle momentum solid terdeteksi"
        : "Belum ada candle penembusan bertenaga",
    },
    {
      id: "retest_valid",
      label: "Retest valid",
      status:
        m5.retestStatus === "Valid"
          ? "passed"
          : m5.retestStatus === "Gagal"
          ? "failed"
          : "waiting",
      detail:
        m5.retestStatus === "Valid"
          ? "Retest struktur bertahan valid"
          : m5.retestStatus === "Menunggu"
          ? "Menunggu retest level breakdown/out"
          : m5.retestStatus === "Gagal"
          ? "Retest gagal menahan harga"
          : "Menunggu pembentukan retest",
    },
    {
      id: "risk_limit",
      label: "Risk limit aman",
      status: risk.isBreached ? "failed" : risk.status === "Waspada" ? "waiting" : "passed",
      detail: risk.isBreached
        ? "Batas risiko portofolio terlampaui"
        : `${risk.status} (${risk.reasons[0] || "Parameter aman"})`,
    },
    {
      id: "session_acceptable",
      label: "Session acceptable",
      status: sessionInfo.isNewsMode ? "failed" : sessionInfo.isPreferred ? "passed" : "waiting",
      detail: sessionInfo.message,
    },
    {
      id: "data_fresh",
      label: "Data fresh",
      status: dataQuality.analysisAllowed
        ? "passed"
        : dataQuality.isMarketClosed
        ? "waiting"
        : dataQuality.isFresh
        ? "passed"
        : "failed",
      detail: dataQuality.reason,
    },
  ];

  // Count checklist results
  const passedCount = checklist.filter((item) => item.status === "passed").length;
  const failedCount = checklist.filter((item) => item.status === "failed").length;

  // Determine Confidence Label
  let confidence: ConfidenceLabel = "Rendah";
  if (passedCount >= 9 && failedCount === 0) {
    confidence = "Tinggi";
  } else if (passedCount >= 6 && failedCount <= 1) {
    confidence = "Sedang";
  } else {
    confidence = "Rendah";
  }

  // Determine Decision
  const criticalItemsPassed =
    checklist.find((c) => c.id === "h1_bias")?.status === "passed" &&
    checklist.find((c) => c.id === "m15_zone")?.status === "passed" &&
    checklist.find((c) => c.id === "liquidity_sweep")?.status === "passed" &&
    checklist.find((c) => c.id === "m5_choch")?.status === "passed" &&
    checklist.find((c) => c.id === "m5_displacement")?.status === "passed" &&
    checklist.find((c) => c.id === "retest_valid")?.status === "passed" &&
    checklist.find((c) => c.id === "risk_limit")?.status === "passed" &&
    checklist.find((c) => c.id === "data_fresh")?.status === "passed" &&
    !sessionInfo.isNewsMode;

  let decisionType: SetupDecisionType = SetupDecisionType.NO_TRADE;
  let decisionLabelIndo: DecisionLabelIndo = "TIDAK ADA TRADE";
  const reasons: string[] = [];

  // NO_TRADE conditions:
  // 1. Stale or insufficient data / Market closed
  // 2. Risk limit breached
  // 3. High impact news mode
  // 4. H1 context is neutral / ranging
  // 5. Structure failure (retest failed)
  if (!dataQuality.analysisAllowed) {
    if (dataQuality.isMarketClosed) {
      decisionType = SetupDecisionType.NO_TRADE;
      decisionLabelIndo = "TIDAK ADA TRADE";
      reasons.push(dataQuality.reason || "Pasar XAU/USD sedang tutup (akhir pekan).");
    } else if (!dataQuality.isFresh) {
      decisionType = SetupDecisionType.WAIT;
      decisionLabelIndo = "TUNGGU";
      reasons.push("Data pasar belum cukup segar untuk validasi setup.");
    } else {
      decisionType = SetupDecisionType.NO_TRADE;
      decisionLabelIndo = "TIDAK ADA TRADE";
      reasons.push(dataQuality.reason);
    }
  } else if (risk.isBreached) {
    decisionType = SetupDecisionType.NO_TRADE;
    decisionLabelIndo = "TIDAK ADA TRADE";
    reasons.push(`Aturan proteksi modal aktif: ${risk.reasons.join(" ")}`);
  } else if (sessionInfo.isNewsMode) {
    decisionType = SetupDecisionType.NO_TRADE;
    decisionLabelIndo = "TIDAK ADA TRADE";
    reasons.push("Mode Berita Berdampak Tinggi aktif. Trading ditunda demi keamanan modal.");
  } else if (h1.bias === "Netral") {
    decisionType = SetupDecisionType.NO_TRADE;
    decisionLabelIndo = "TIDAK ADA TRADE";
    reasons.push("Tren makro H1 netral/ranging tanpa arah dominan. Sesuai trading plan: NO ENTRY saat tren tidak jelas.");
  } else if (criticalItemsPassed) {
    decisionType = SetupDecisionType.VALID_SETUP;
    decisionLabelIndo = "SETUP VALID";
    reasons.push(
      `Seluruh matriks konfluensi institusional terpenuhi: Tren H1 (${h1.bias}), pullback M15 valid, likuiditas tersapu, M5 CHoCH + displacement terverifikasi, dan retest bertahan.`
    );
  } else {
    // If context is promising (H1 clear, data fresh, risk intact) but waiting on M15/sweep/M5/retest
    decisionType = SetupDecisionType.WAIT;
    decisionLabelIndo = "TUNGGU";

    if (m15.isFirstTouch && m5.retestStatus !== "Valid") {
      reasons.push("Harga berada pada sentuhan pertama (first touch). Menunggu konfirmasi sweep dan retest M5.");
    }
    if (!m15.matchesH1Bias) {
      reasons.push(`Menunggu harga melakukan pullback ke area ${h1.bias === "Bullish" ? "Diskon (Area Beli)" : "Premium (Area Jual)"}.`);
    }
    if (liq.status !== (h1.bias === "Bullish" ? "Likuiditas bawah tersapu" : "Likuiditas atas tersapu")) {
      reasons.push("Menunggu penyapuan likuiditas (liquidity sweep) sebelum memicu konfirmasi entry.");
    }
    if (m5.retestStatus === "Menunggu") {
      reasons.push("CHoCH terbentuk, namun retest belum terjadi. Sesuai aturan retest: Wajib TUNGGU.");
    }
    if (!m5.chochDetected) {
      reasons.push("Belum ada konfirmasi pergeseran struktur mikro (CHoCH) pada M5.");
    }
  }

  // 17. Invalidation & What Changes the Bias
  let invalidationText = "";
  if (h1.bias === "Bullish") {
    invalidationText = `Bias bullish dibatalkan jika harga menembus dan candle H1 ditutup di bawah swing low $${h1.recentLow?.toFixed(2) || "kunci"}. Kondisi entry gugur jika M5 retest gagal menahan level $${m5.breakLevel?.toFixed(2) || "break"}.`;
  } else if (h1.bias === "Bearish") {
    invalidationText = `Bias bearish dibatalkan jika harga menembus dan candle H1 ditutup di atas swing high $${h1.recentHigh?.toFixed(2) || "kunci"}. Kondisi entry gugur jika M5 retest gagal menahan level $${m5.breakLevel?.toFixed(2) || "break"}.`;
  } else {
    invalidationText =
      "Tren belum terbentuk. Bias baru akan terkonfirmasi setelah terjadi penutupan candle H1 di luar rentang konsolidasi saat ini.";
  }

  // Calculate execution plan only if SETUP VALID
  let executionPlan: ExecutionPlan | null = null;
  if (decisionType === SetupDecisionType.VALID_SETUP) {
    executionPlan = calculateExecutionPlan(
      h1,
      m15,
      liq,
      m5,
      currentPrice,
      sessionInfo,
      targetRR
    );
  }

  const decision: SetupDecision = {
    decision: decisionType,
    decisionLabelIndo,
    marketRegime: h1.structure === "HH / HL" || h1.structure === "LH / LL" ? "Trending Terarah" : "Konsolidasi / Range",
    htfBias: `${h1.bias} (${h1.structure})`,
    liquidity: liq.status,
    m15Location: `${m15.location} • ${m15.pullbackStatus}`,
    m5Confirmation: m5.status,
    riskStatus: risk.status,
    confidence,
    isReadyForEntry: decisionType === SetupDecisionType.VALID_SETUP,
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
