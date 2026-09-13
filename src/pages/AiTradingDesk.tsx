import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../lib/firebase";
import {
  collection,
  onSnapshot,
  doc,
  query,
  orderBy,
  limit,
  addDoc,
} from "firebase/firestore";
import { useAppStore } from "../store/AppContext";
import {
  MarketSnapshot,
  CandleItem,
  SupportedDeskTimeframe,
  SetupDecisionType,
  DeskAnalysisRecord,
  MarketDataSource,
  MarketDataApiResponse,
  QuotaStatus,
  TimeframeFeedStatus,
} from "../types";
import {
  evaluateDataQuality,
  normalizeCandleSequence,
  analyzeH1Context,
  analyzeM15Location,
  analyzeLiquidity,
  analyzeM5Confirmation,
  evaluateSession,
  evaluateRisk,
  evaluateInstitutionalConfluence,
  MIN_CANDLES_H1,
  MIN_CANDLES_M15,
  MIN_CANDLES_M5,
} from "../lib/institutionalDecisionEngine";
import {
  Cpu,
  Activity,
  Radio,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Shield,
  Layers,
  ArrowRight,
  Database,
  Info,
  Calendar,
  Zap,
  BookmarkPlus,
  RefreshCw,
} from "lucide-react";
import { cn } from "../lib/utils";

// Format financial price
function formatPrice(val: number | undefined | null): string {
  if (val === undefined || val === null || !Number.isFinite(val)) return "-";
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Format timestamp
function formatTimestamp(ts: number | undefined | null): string {
  if (!ts) return "Belum ada data";
  const d = new Date(ts);
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Relative time formatting
function formatRelativeTime(ts: number | undefined | null): string {
  if (!ts) return "Belum ada data";
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 5) return "Baru saja";
  if (diffSec < 60) return `${diffSec} detik lalu`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  return `${Math.floor(diffHour / 24)} hari lalu`;
}

export function AiTradingDesk() {
  const navigate = useNavigate();
  const { accountMode, settings, trades } = useAppStore();

  // Firestore Subscriptions State
  const [snapshots, setSnapshots] = useState<Record<SupportedDeskTimeframe, MarketSnapshot | null>>({
    H1: null,
    M15: null,
    M5: null,
  });
  const [h1History, setH1History] = useState<CandleItem[]>([]);
  const [m15History, setM15History] = useState<CandleItem[]>([]);
  const [m5History, setM5History] = useState<CandleItem[]>([]);
  const [rootMeta, setRootMeta] = useState<{
    symbol?: string;
    lastUpdated?: string;
    lastTimeframe?: string;
    lastPrice?: number;
    activeSession?: string;
  } | null>(null);

  // Firestore Analysis History
  const [recentAnalyses, setRecentAnalyses] = useState<DeskAnalysisRecord[]>([]);

  // Twelve Data & API State
  const [dataSource, setDataSource] = useState<MarketDataSource>("none");
  const [apiStatus, setApiStatus] = useState<"ok" | "missing_api_key" | "rate_limited" | "error" | "cached" | "idle">("idle");
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const [isFetchingMarketData, setIsFetchingMarketData] = useState(false);
  const [lastApiFetchTimestamp, setLastApiFetchTimestamp] = useState<number | null>(null);
  const [cacheInfo, setCacheInfo] = useState<{
    h1AgeSeconds: number | null;
    m15AgeSeconds: number | null;
    m5AgeSeconds: number | null;
  } | null>(null);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [marketStatus, setMarketStatus] = useState<{ isOpen: boolean; reason: string } | null>(null);
  const [timeframesFeed, setTimeframesFeed] = useState<Record<SupportedDeskTimeframe, TimeframeFeedStatus> | null>(null);
  const [upstreamRequestsMade, setUpstreamRequestsMade] = useState<number>(0);

  // Local Controls & UI States
  const [isLoading, setIsLoading] = useState(true);
  const [highImpactNewsActive, setHighImpactNewsActive] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Primary Function: Fetch Multi-Timeframe Data from Server (Twelve Data API + Cache + Firestore sync)
  const fetchMarketData = async (force = false) => {
    setIsFetchingMarketData(true);
    try {
      const res = await fetch(`/api/market-data/xauusd?force=${force}`);
      const json: MarketDataApiResponse = await res.json();

      setDataSource(json.source || "none");
      setApiStatus(json.status || (json.success ? "ok" : "error"));
      if (json.message) setApiMessage(json.message);
      if (json.cacheInfo) setCacheInfo(json.cacheInfo);
      if (json.quota) setQuotaStatus(json.quota);
      if (json.marketStatus) setMarketStatus(json.marketStatus);
      if (json.timeframes) setTimeframesFeed(json.timeframes);
      if (typeof json.upstreamRequestsMade === "number") {
        setUpstreamRequestsMade(json.upstreamRequestsMade);
      }
      setLastApiFetchTimestamp(Date.now());

      // Direct state injection for instant UI reaction
      if (json.candles) {
        if (Array.isArray(json.candles.H1) && json.candles.H1.length > 0) {
          setH1History(json.candles.H1);
        }
        if (Array.isArray(json.candles.M15) && json.candles.M15.length > 0) {
          setM15History(json.candles.M15);
        }
        if (Array.isArray(json.candles.M5) && json.candles.M5.length > 0) {
          setM5History(json.candles.M5);
        }
      }

      if (json.snapshots) {
        setSnapshots((prev) => ({
          H1: json.snapshots.H1 || prev.H1,
          M15: json.snapshots.M15 || prev.M15,
          M5: json.snapshots.M5 || prev.M5,
        }));
      }

      if (json.lastPrice) {
        setRootMeta((prev) => ({
          ...prev,
          symbol: "XAUUSD",
          lastPrice: json.lastPrice ?? prev?.lastPrice,
          lastUpdated: json.lastUpdated,
          activeSession: json.activeSession,
        }));
      }
    } catch (err: any) {
      console.warn("[Meja Trading AI] Gagal mengambil data market dari API:", err);
      setApiStatus("error");
      setApiMessage(err?.message || "Gagal menghubungi endpoint market data.");
    } finally {
      setIsFetchingMarketData(false);
      setIsLoading(false);
    }
  };

  // Initial Fetch on component mount
  useEffect(() => {
    fetchMarketData(false);
  }, []);

  // 1. Subscribe to Firestore Realtime Market Data
  useEffect(() => {
    setIsLoading(true);

    // A. Timeframes latest snapshots
    const timeframesCol = collection(db, "marketData", "XAUUSD", "timeframes");
    const unsubscribeTimeframes = onSnapshot(
      timeframesCol,
      (snap) => {
        const next: Record<SupportedDeskTimeframe, MarketSnapshot | null> = {
          H1: null,
          M15: null,
          M5: null,
        };
        snap.forEach((docSnap) => {
          const data = docSnap.data() as MarketSnapshot;
          const tf = data.timeframe;
          if (tf === "H1" || tf === "M15" || tf === "M5") {
            next[tf] = data;
          }
        });
        setSnapshots(next);
        setIsLoading(false);
      },
      (err) => {
        console.warn("[Meja Trading AI] Subscription notice (timeframes):", err);
        setIsLoading(false);
      }
    );

    // B. Root Metadata
    const rootDocRef = doc(db, "marketData", "XAUUSD");
    const unsubscribeRoot = onSnapshot(
      rootDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setRootMeta(docSnap.data() as any);
        }
      },
      (err) => {
        console.warn("[Meja Trading AI] Subscription notice (root):", err);
      }
    );

    // C. Rolling Candles History (H1, M15, M5)
    const qH1 = query(
      collection(db, "marketData", "XAUUSD", "candles", "H1", "items"),
      orderBy("timestamp", "desc"),
      limit(25)
    );
    const unsubscribeH1 = onSnapshot(
      qH1,
      (snap) => {
        const list: CandleItem[] = [];
        snap.forEach((d) => list.push(d.data() as CandleItem));
        setH1History(list.reverse()); // chronological: oldest to newest
      },
      (err) => console.warn("[Meja Trading AI] H1 candles notice:", err)
    );

    const qM15 = query(
      collection(db, "marketData", "XAUUSD", "candles", "M15", "items"),
      orderBy("timestamp", "desc"),
      limit(25)
    );
    const unsubscribeM15 = onSnapshot(
      qM15,
      (snap) => {
        const list: CandleItem[] = [];
        snap.forEach((d) => list.push(d.data() as CandleItem));
        setM15History(list.reverse());
      },
      (err) => console.warn("[Meja Trading AI] M15 candles notice:", err)
    );

    const qM5 = query(
      collection(db, "marketData", "XAUUSD", "candles", "M5", "items"),
      orderBy("timestamp", "desc"),
      limit(25)
    );
    const unsubscribeM5 = onSnapshot(
      qM5,
      (snap) => {
        const list: CandleItem[] = [];
        snap.forEach((d) => list.push(d.data() as CandleItem));
        setM5History(list.reverse());
      },
      (err) => console.warn("[Meja Trading AI] M5 candles notice:", err)
    );

    // D. Recent Analysis History
    const qAnalyses = query(
      collection(db, "aiDeskAnalyses"),
      orderBy("timestamp", "desc"),
      limit(5)
    );
    const unsubscribeAnalyses = onSnapshot(
      qAnalyses,
      (snap) => {
        const list: DeskAnalysisRecord[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as DeskAnalysisRecord) }));
        setRecentAnalyses(list);
      },
      (err) => console.warn("[Meja Trading AI] Analyses notice:", err)
    );

    return () => {
      unsubscribeTimeframes();
      unsubscribeRoot();
      unsubscribeH1();
      unsubscribeM15();
      unsubscribeM5();
      unsubscribeAnalyses();
    };
  }, []);

  // 2. Normalize and Deduplicate Candle Sequences
  const h1Candles = useMemo(
    () => normalizeCandleSequence(snapshots.H1, h1History),
    [snapshots.H1, h1History]
  );
  const m15Candles = useMemo(
    () => normalizeCandleSequence(snapshots.M15, m15History),
    [snapshots.M15, m15History]
  );
  const m5Candles = useMemo(
    () => normalizeCandleSequence(snapshots.M5, m5History),
    [snapshots.M5, m5History]
  );

  // 3. Current Live Price & Session
  const latestPrice = useMemo(() => {
    if (rootMeta?.lastPrice) return rootMeta.lastPrice;
    if (snapshots.M5?.close) return snapshots.M5.close;
    if (snapshots.M15?.close) return snapshots.M15.close;
    if (snapshots.H1?.close) return snapshots.H1.close;
    return null;
  }, [rootMeta, snapshots]);

  const rawSession = useMemo(() => {
    return rootMeta?.activeSession || snapshots.M5?.session || snapshots.M15?.session || snapshots.H1?.session || "asia";
  }, [rootMeta, snapshots]);

  // 4. Evaluate Session Filter
  const sessionInfo = useMemo(
    () => evaluateSession(rawSession, highImpactNewsActive),
    [rawSession, highImpactNewsActive]
  );

  // 5. Evaluate Data Quality
  const dataQuality = useMemo(
    () => evaluateDataQuality(snapshots, h1History, m15History, m5History),
    [snapshots, h1History, m15History, m5History]
  );

  // 6. Evaluate Account Risk Settings against Today's Trades
  const todayRiskStats = useMemo(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const todaysTrades = trades.filter(
      (t) => t.accountMode === accountMode && t.date?.startsWith(todayStr)
    );

    let dailyLossSoFar = 0;
    let consecutiveLossesSoFar = 0;

    // Sort today's trades chronological to compute consecutive loss
    const sortedToday = [...todaysTrades].sort(
      (a, b) => new Date(a.createdAt || a.date).getTime() - new Date(b.createdAt || b.date).getTime()
    );

    for (const t of sortedToday) {
      if (t.status === "closed" && typeof t.pnlIdr === "number") {
        if (t.pnlIdr < 0) {
          dailyLossSoFar += Math.abs(t.pnlIdr);
          consecutiveLossesSoFar += 1;
        } else if (t.pnlIdr > 0) {
          consecutiveLossesSoFar = 0;
        }
      }
    }

    const dailyLimit =
      accountMode === "real"
        ? settings.maxDailyLossIdrReal || 100000
        : settings.maxDailyLossIdrDemo || 200000;

    return {
      dailyLossSoFar,
      consecutiveLossesSoFar,
      tradesToday: todaysTrades.length,
      dailyLossLimit: dailyLimit,
      stopAfterLosses: settings.stopAfterLosses || 2,
      maxTradesPerDay: settings.maxTradesPerDay || 5,
    };
  }, [trades, accountMode, settings]);

  const riskAnalysis = useMemo(() => {
    return evaluateRisk(
      {
        dailyLossLimit: todayRiskStats.dailyLossLimit,
        stopAfterLosses: todayRiskStats.stopAfterLosses,
        maxTradePerDay: todayRiskStats.maxTradesPerDay,
      },
      todayRiskStats
    );
  }, [todayRiskStats]);

  // 7. Multi-Timeframe Institutional Engine
  const h1Analysis = useMemo(() => analyzeH1Context(h1Candles), [h1Candles]);
  const m15Analysis = useMemo(
    () => analyzeM15Location(m15Candles, h1Analysis.bias),
    [m15Candles, h1Analysis.bias]
  );
  const liquidityAnalysis = useMemo(
    () => analyzeLiquidity(m15Candles, m5Candles, h1Analysis.bias),
    [m15Candles, m5Candles, h1Analysis.bias]
  );
  const m5Analysis = useMemo(
    () => analyzeM5Confirmation(m5Candles, h1Analysis.bias, liquidityAnalysis.sweepDetected),
    [m5Candles, h1Analysis.bias, liquidityAnalysis.sweepDetected]
  );

  // 8. Confluence Checklist & Final Decision
  const confluenceResult = useMemo(() => {
    return evaluateInstitutionalConfluence(
      dataQuality,
      h1Analysis,
      m15Analysis,
      liquidityAnalysis,
      m5Analysis,
      riskAnalysis,
      sessionInfo,
      latestPrice || 0,
      settings.plannedRR || 2.0
    );
  }, [
    dataQuality,
    h1Analysis,
    m15Analysis,
    liquidityAnalysis,
    m5Analysis,
    riskAnalysis,
    sessionInfo,
    latestPrice,
    settings.plannedRR,
  ]);

  const { decision, checklist, executionPlan } = confluenceResult;

  // Copy helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2500);
  };

  // 9. Save Evaluation Record / Link to Trade Plan
  const handleRecordAsTradePlan = async () => {
    if (!executionPlan) return;
    setIsSavingPlan(true);
    setSaveSuccessMsg(null);

    try {
      // 1. Create Firestore decision history record
      const record: DeskAnalysisRecord = {
        symbol: "XAUUSD",
        timestamp: Date.now(),
        session: rawSession,
        h1Context: h1Analysis,
        m15Context: m15Analysis,
        liquidityState: liquidityAnalysis,
        m5Confirmation: m5Analysis,
        retestStatus: m5Analysis.retestStatus,
        riskStatus: riskAnalysis.status,
        decision: decision.decision,
        decisionLabelIndo: decision.decisionLabelIndo,
        confidenceLabel: decision.confidence,
        reasons: decision.reasons,
        invalidation: decision.invalidationText,
        executionPlan,
        ruleVersion: "lootly-xauusd-v1",
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, "aiDeskAnalyses"), record);
      const setupAnalysisId = docRef.id;

      setSaveSuccessMsg("Evaluasi tersimpan di riwayat. Mengalihkan ke formulir rencana...");

      // 2. Navigate to Add Trade with prefillPlan
      setTimeout(() => {
        navigate("/add", {
          state: {
            prefillPlan: {
              asset: "XAU/USD",
              direction: executionPlan.direction.toLowerCase(),
              entryPrice: m5Analysis.breakLevel || latestPrice,
              stopLoss: executionPlan.stopLossRef,
              takeProfit: executionPlan.takeProfitRef,
              tradeReason: `[Meja AI - ${executionPlan.htfBias}] Area: ${executionPlan.m15Area} | Likuiditas: ${executionPlan.liquidityEvent} | Konfirmasi: ${executionPlan.m5Confirmation}`,
              setupTag: "AI Trading Desk - Institutional Plan",
              setupAnalysisId,
            },
          },
        });
      }, 750);
    } catch (err: any) {
      console.error("Gagal menyimpan analisis:", err);
      setSaveSuccessMsg(`Error: ${err.message || String(err)}`);
    } finally {
      setIsSavingPlan(false);
    }
  };

  const webhookUrl = `${window.location.origin}/api/tradingview-webhook`;

  return (
    <div id="ai-trading-desk-page" className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* 1. TOP HEADER & INSTITUTIONAL BRANDING */}
      <div id="desk-header" className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-bold shadow-xs">
                <Cpu className="w-4 h-4 text-emerald-400" />
              </div>
              <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
                Meja Trading AI
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
                Fase 2 • Mesin Keputusan
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                Instrumen: XAUUSD (Gold)
              </span>

              {/* Dynamic Market Data Source Indicator */}
              {(dataSource === "twelvedata" || dataSource === "twelve_data") && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Sumber: Twelve Data API
                </span>
              )}
              {dataSource === "cache" && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  Sumber: Twelve Data (Cache Server)
                </span>
              )}
              {dataSource === "tradingview" && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Sumber: TradingView Webhook (Fallback)
                </span>
              )}
              {apiStatus === "missing_api_key" && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 border border-zinc-300 flex items-center gap-1.5" title="TWELVE_DATA_API_KEY belum dikonfigurasi di environment server">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                  Twelve Data: Menunggu API Key
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-500">
              Konteks pasar multi-timeframe dan dukungan keputusan terstruktur berbasis aturan institusional pribadi.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Twelve Data API Refresh Button */}
            <button
              id="refresh-market-data-btn"
              onClick={() => fetchMarketData(true)}
              disabled={isFetchingMarketData}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              title="Perbarui data candle multi-timeframe XAU/USD dari Twelve Data API"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-emerald-600", isFetchingMarketData && "animate-spin")} />
              {isFetchingMarketData ? "Memperbarui..." : "Perbarui Data Market"}
            </button>

            {/* Macro News Caution Toggle */}
            <button
              id="toggle-news-mode-btn"
              onClick={() => setHighImpactNewsActive(!highImpactNewsActive)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5",
                highImpactNewsActive
                  ? "bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100"
                  : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              )}
              title="Aktifkan saat rilis berita ekonomi berdampak tinggi (FOMC, CPI, NFP)"
            >
              <AlertTriangle className={cn("w-3.5 h-3.5", highImpactNewsActive ? "text-rose-600" : "text-zinc-400")} />
              {highImpactNewsActive ? "Mode Berita: AKTIF" : "Mode Berita: Standar"}
            </button>

            {/* Webhook Guide Modal Trigger (Fallback / Debug) */}
            <button
              id="open-webhook-guide-btn"
              onClick={() => setShowGuide(!showGuide)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 shadow-xs"
              title="Konfigurasi webhook TradingView sebagai jalur cadangan (fallback/debug)"
            >
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              Jalur Cadangan Webhook
              {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* 2. REALTIME FEED CONTEXT BAR */}
        <div className="mt-5 pt-4 border-t border-zinc-100 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-zinc-400 block font-medium">Harga XAUUSD Terkini</span>
            <span className="text-base font-bold text-zinc-900">
              {latestPrice !== null ? `$${formatPrice(latestPrice)}` : "Menunggu data"}
            </span>
          </div>

          <div>
            <span className="text-zinc-400 block font-medium">Sesi Pasar</span>
            <span className={cn("inline-flex items-center px-2 py-0.5 mt-0.5 rounded text-xs font-semibold border", sessionInfo.badgeColor)}>
              {sessionInfo.sessionLabel}
            </span>
          </div>

          <div>
            <span className="text-zinc-400 block font-medium">Pembaruan Terakhir</span>
            <span className="text-zinc-800 font-medium block mt-0.5">
              {formatRelativeTime(dataQuality.latestTimestamp)}
            </span>
          </div>

          <div>
            <span className="text-zinc-400 block font-medium">Akun Lootly Terhubung</span>
            <span className="text-zinc-800 font-semibold uppercase block mt-0.5">
              Mode {accountMode} • Limit Loss: Rp {todayRiskStats.dailyLossLimit.toLocaleString("id-ID")}
            </span>
          </div>
        </div>
      </div>

      {/* WEBHOOK GUIDE ACCORDION */}
      {showGuide && (
        <div id="webhook-guide-panel" className="bg-zinc-900 text-zinc-100 border border-zinc-800 rounded-xl p-5 space-y-4 shadow-sm text-xs">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-sm text-white">Panduan Integrasi TradingView Webhook</span>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="text-zinc-400 hover:text-white"
            >
              Tutup
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-zinc-300">
              Buat 3 Alert di TradingView untuk instrumen <strong>XAUUSD</strong> pada timeframe <strong>H1</strong>, <strong>M15</strong>, dan <strong>M5</strong> dengan kondisi: <em>"Once Per Bar Close"</em>.
            </p>

            <div className="space-y-1">
              <label className="text-zinc-400 font-mono">Webhook URL Endpoint:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="bg-zinc-950 border border-zinc-800 text-emerald-400 font-mono text-xs px-3 py-1.5 rounded w-full select-all"
                />
                <button
                  onClick={() => copyToClipboard(webhookUrl, "url")}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-medium flex items-center gap-1 shrink-0"
                >
                  {copiedField === "url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  Salin URL
                </button>
              </div>
            </div>

            <div className="space-y-1 pt-2">
              <label className="text-zinc-400 font-mono">Format Pesan Alert TradingView (JSON):</label>
              <pre className="bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono text-xs p-3 rounded overflow-x-auto">
{`{
  "secret": "TRADINGVIEW_SECRET_ANDA",
  "symbol": "XAUUSD",
  "timeframe": "{{interval}}",
  "open": {{open}},
  "high": {{high}},
  "low": {{low}},
  "close": {{close}},
  "volume": {{volume}},
  "timestamp": {{time}}
}`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Informative Data Status Banner */}
      {apiStatus === "missing_api_key" && !snapshots.H1 && !snapshots.M5 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-0.5">
              <span className="font-bold block">Konfigurasi Sumber Data Otomatis Twelve Data</span>
              <p className="text-amber-800 leading-relaxed">
                Tambahkan kunci <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-[11px]">TWELVE_DATA_API_KEY</code> pada environment server untuk sinkronisasi pasar real-time tanpa perlu alert eksternal. Anda juga tetap dapat mengalirkan candle melalui tombol <strong>Jalur Cadangan Webhook</strong> di atas.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowGuide(true)}
            className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded font-semibold text-xs transition-colors shrink-0"
          >
            Buka Jalur Webhook
          </button>
        </div>
      )}

      {/* Quota Hard Protection Banner */}
      {quotaStatus?.hardLimitReached && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-center gap-3 text-xs text-rose-900">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <div className="space-y-0.5">
            <span className="font-bold block">
              Proteksi Kuota Harian Aktif ({quotaStatus.estimatedUsedToday}/{quotaStatus.maxDailyLimit || 800} Request)
            </span>
            <p className="text-rose-700">
              Batas aman kuota Twelve Data telah tercapai. Permintaan upstream baru dihentikan sementara dan data pasar disajikan aman dari cache Firestore tanpa pemanggilan API berlebih.
            </p>
          </div>
        </div>
      )}

      {/* Market Closed Notice Banner */}
      {marketStatus && !marketStatus.isOpen && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 flex items-center gap-3 text-xs text-amber-900">
          <Clock className="w-5 h-5 text-amber-600 shrink-0" />
          <div className="space-y-0.5">
            <span className="font-bold block">Pasar XAU/USD Sedang Tutup</span>
            <p className="text-amber-800">
              {marketStatus.reason} Harga penutupan terakhir tetap valid. Validasi setup baru ditunda hingga sesi pasar dibuka kembali.
            </p>
          </div>
        </div>
      )}

      {/* 3. CORE INSTITUTIONAL DECISION BANNER */}
      <div
        id="institutional-decision-card"
        className={cn(
          "border rounded-xl p-5 shadow-xs transition-all",
          decision.decision === SetupDecisionType.VALID_SETUP
            ? "bg-emerald-50/70 border-emerald-300"
            : decision.decision === SetupDecisionType.WAIT
            ? "bg-amber-50/70 border-amber-300"
            : "bg-zinc-50 border-zinc-200"
        )}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 border-b border-zinc-200/80">
          <div>
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
              Keputusan Akhir Mesin Institusional
            </span>
            <div className="flex items-center gap-3 mt-1">
              <h2
                className={cn(
                  "text-2xl font-black tracking-tight",
                  decision.decision === SetupDecisionType.VALID_SETUP
                    ? "text-emerald-800"
                    : decision.decision === SetupDecisionType.WAIT
                    ? "text-amber-800"
                    : "text-zinc-800"
                )}
              >
                {decision.decisionLabelIndo}
              </h2>
              <span
                className={cn(
                  "px-2.5 py-0.5 rounded-full text-xs font-bold border uppercase tracking-wider",
                  decision.confidence === "Tinggi"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : decision.confidence === "Sedang"
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : "bg-zinc-200 text-zinc-700 border-zinc-300"
                )}
              >
                Konfluensi: {decision.confidence}
              </span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs text-zinc-500 block">Status Kelayakan Entry</span>
            <span
              className={cn(
                "text-sm font-bold block mt-0.5",
                decision.isReadyForEntry ? "text-emerald-700" : "text-zinc-600"
              )}
            >
              {decision.isReadyForEntry
                ? "Layak Dipertimbangkan Sesuai Plan"
                : "Belum Layak Entry (Konfluensi Belum Lengkap)"}
            </span>
          </div>
        </div>

        {/* Narrative reasons */}
        <div className="pt-4 space-y-2">
          <span className="text-xs font-semibold text-zinc-700 block">Dasar Pertimbangan Mesin Aturan:</span>
          <ul className="space-y-1.5 text-xs text-zinc-700">
            {decision.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-zinc-400 mt-0.5">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 4. THREE TIMEFRAME ARCHITECTURE CARDS */}
      <div id="timeframe-cards-grid" className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* CARD 1: H1 CONTEXT */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs">
                  H1
                </span>
                <span className="font-bold text-zinc-900 text-sm">Tren & Konteks Makro</span>
              </div>
              <span className="text-xs text-zinc-400">
                {h1Candles.length} candle
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {snapshots.H1 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Bias Tren H1:</span>
                    <span
                      className={cn(
                        "text-xs font-bold px-2 py-0.5 rounded border",
                        h1Analysis.bias === "Bullish"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : h1Analysis.bias === "Bearish"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-zinc-100 text-zinc-700 border-zinc-200"
                      )}
                    >
                      {h1Analysis.bias}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Struktur Pasar:</span>
                    <span className="font-semibold text-zinc-800">{h1Analysis.structure}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Momentum:</span>
                    <span className="font-medium text-zinc-700">{h1Analysis.momentum}</span>
                  </div>

                  <div className="p-2.5 bg-zinc-50 rounded-lg text-xs text-zinc-600 border border-zinc-100 leading-relaxed">
                    {h1Analysis.reason}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-zinc-400 space-y-1">
                  <Database className="w-6 h-6 text-zinc-300 mx-auto mb-2" />
                  <p className="font-semibold text-zinc-600">Belum ada data H1</p>
                  <p>Menunggu data candle dari Twelve Data API atau TradingView webhook</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] text-zinc-400 flex justify-between">
            <span>Tutup H1: {snapshots.H1 ? `$${formatPrice(snapshots.H1.close)}` : "-"}</span>
            <span>{snapshots.H1 ? formatRelativeTime(snapshots.H1.timestamp) : "-"}</span>
          </div>
        </div>

        {/* CARD 2: M15 LOCATION & PULLBACK */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs">
                  M15
                </span>
                <span className="font-bold text-zinc-900 text-sm">Lokasi & Area Penting</span>
              </div>
              <span className="text-xs text-zinc-400">
                {m15Candles.length} candle
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {snapshots.M15 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Lokasi Relatif:</span>
                    <span className="text-xs font-bold text-zinc-800">
                      {m15Analysis.location}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Status Pullback:</span>
                    <span
                      className={cn(
                        "font-semibold px-2 py-0.5 rounded text-[11px] border",
                        m15Analysis.pullbackStatus === "Pullback Valid"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : m15Analysis.pullbackStatus === "Overextended"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      )}
                    >
                      {m15Analysis.pullbackStatus}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">First Touch:</span>
                    <span className="font-medium text-zinc-700">
                      {m15Analysis.isFirstTouch ? "Ya (Sentuhan Awal)" : "Tidak (Sudah Teruji)"}
                    </span>
                  </div>

                  <div className="p-2.5 bg-zinc-50 rounded-lg text-xs text-zinc-600 border border-zinc-100 leading-relaxed">
                    {m15Analysis.reason}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-zinc-400 space-y-1">
                  <Database className="w-6 h-6 text-zinc-300 mx-auto mb-2" />
                  <p className="font-semibold text-zinc-600">Belum ada data M15</p>
                  <p>Menunggu data candle dari Twelve Data API atau TradingView webhook</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] text-zinc-400 flex justify-between">
            <span>Tutup M15: {snapshots.M15 ? `$${formatPrice(snapshots.M15.close)}` : "-"}</span>
            <span>{snapshots.M15 ? formatRelativeTime(snapshots.M15.timestamp) : "-"}</span>
          </div>
        </div>

        {/* CARD 3: M5 CONFIRMATION & RETEST */}
        <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-xs">
                  M5
                </span>
                <span className="font-bold text-zinc-900 text-sm">Konfirmasi & Retest</span>
              </div>
              <span className="text-xs text-zinc-400">
                {m5Candles.length} candle
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {snapshots.M5 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Pergeseran CHoCH/MSS:</span>
                    <span
                      className={cn(
                        "text-xs font-semibold px-2 py-0.5 rounded border",
                        m5Analysis.chochDetected
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-zinc-100 text-zinc-600 border-zinc-200"
                      )}
                    >
                      {m5Analysis.chochDetected ? "Terdeteksi" : "Belum Ada"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Displacement:</span>
                    <span className="font-medium text-zinc-800">
                      {m5Analysis.displacementDetected ? "Solid & Valid" : "Belum Tampak"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Status Retest:</span>
                    <span
                      className={cn(
                        "font-bold px-2 py-0.5 rounded border text-[11px]",
                        m5Analysis.retestStatus === "Valid"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : m5Analysis.retestStatus === "Menunggu"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : m5Analysis.retestStatus === "Gagal"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-zinc-100 text-zinc-600 border-zinc-200"
                      )}
                    >
                      {m5Analysis.retestStatus}
                    </span>
                  </div>

                  <div className="p-2.5 bg-zinc-50 rounded-lg text-xs text-zinc-600 border border-zinc-100 leading-relaxed">
                    {m5Analysis.reason}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-xs text-zinc-400 space-y-1">
                  <Database className="w-6 h-6 text-zinc-300 mx-auto mb-2" />
                  <p className="font-semibold text-zinc-600">Belum ada data M5</p>
                  <p>Menunggu data candle dari Twelve Data API atau TradingView webhook</p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] text-zinc-400 flex justify-between">
            <span>Tutup M5: {snapshots.M5 ? `$${formatPrice(snapshots.M5.close)}` : "-"}</span>
            <span>{snapshots.M5 ? formatRelativeTime(snapshots.M5.timestamp) : "-"}</span>
          </div>
        </div>
      </div>

      {/* 5. LIQUIDITY ENGINE & DATA QUALITY ROW */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* LIQUIDITY ENGINE CARD */}
        <div id="liquidity-panel" className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-zinc-900 text-sm">Status Likuiditas Teramati</h3>
            </div>
            <span
              className={cn(
                "px-2.5 py-0.5 rounded text-xs font-semibold border",
                liquidityAnalysis.sweepDetected
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-zinc-100 text-zinc-600 border-zinc-200"
              )}
            >
              {liquidityAnalysis.status}
            </span>
          </div>

          <div className="mt-4 space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                <span className="text-zinc-500 block">Buy-Side Liquidity (BSL)</span>
                <span className="text-sm font-bold text-zinc-900 block mt-0.5">
                  {liquidityAnalysis.bslLevel ? `$${formatPrice(liquidityAnalysis.bslLevel)}` : "-"}
                </span>
                <span className="text-[10px] text-zinc-400">Pool di atas swing high</span>
              </div>

              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100">
                <span className="text-zinc-500 block">Sell-Side Liquidity (SSL)</span>
                <span className="text-sm font-bold text-zinc-900 block mt-0.5">
                  {liquidityAnalysis.sslLevel ? `$${formatPrice(liquidityAnalysis.sslLevel)}` : "-"}
                </span>
                <span className="text-[10px] text-zinc-400">Pool di bawah swing low</span>
              </div>
            </div>

            <p className="text-zinc-600 leading-relaxed bg-zinc-50 p-3 rounded-lg border border-zinc-100">
              {liquidityAnalysis.reason}
            </p>
          </div>
        </div>

        {/* DATA QUALITY & FEED STATUS */}
        <div id="data-quality-panel" className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              <h3 className="font-bold text-zinc-900 text-sm">Kualitas Data & Aliran Feed</h3>
            </div>
            <span
              className={cn(
                "px-2.5 py-0.5 rounded text-xs font-semibold border",
                dataQuality.isFresh
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              )}
            >
              {dataQuality.freshnessStatus}
            </span>
          </div>

          <div className="mt-4 space-y-3 text-xs">
            {/* Feed source and status info */}
            <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-100 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500">Jalur Feed Utama:</span>
                <span className="font-bold text-zinc-900">
                  {dataSource === "twelvedata"
                    ? "Twelve Data API (Live)"
                    : dataSource === "cache"
                    ? "Twelve Data (Cache Firestore)"
                    : dataSource === "tradingview"
                    ? "TradingView Webhook (Fallback)"
                    : "Belum Terhubung"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Status Pasar:</span>
                <span
                  className={cn(
                    "font-semibold",
                    marketStatus?.isOpen ? "text-emerald-700" : "text-amber-700"
                  )}
                >
                  {marketStatus?.isOpen ? "Buka (Aktif)" : "Tutup (Akhir Pekan/Rollover)"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Penggunaan Kuota API:</span>
                <span className="font-mono text-zinc-700">
                  {quotaStatus ? `${quotaStatus.estimatedUsedToday} / ${quotaStatus.maxDailyLimit || 800} req/hari` : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">Sinkronisasi Terakhir:</span>
                <span className="text-zinc-600 font-mono">
                  {lastApiFetchTimestamp ? new Date(lastApiFetchTimestamp).toLocaleTimeString("id-ID") : "-"}
                </span>
              </div>
              {apiMessage && (
                <div className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-200/50 leading-relaxed">
                  {apiMessage}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-100">
                <span className="text-zinc-400 block text-[11px]">Feed H1</span>
                <span className={cn("font-bold block mt-0.5", snapshots.H1 ? "text-emerald-600" : "text-zinc-400")}>
                  {snapshots.H1 ? (timeframesFeed?.H1?.source === "twelve_data" ? "API Live" : "Cache") : "Belum Ada"}
                </span>
                <span className="text-[10px] text-zinc-400">{h1Candles.length} candle</span>
              </div>

              <div className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-100">
                <span className="text-zinc-400 block text-[11px]">Feed M15</span>
                <span className={cn("font-bold block mt-0.5", snapshots.M15 ? "text-emerald-600" : "text-zinc-400")}>
                  {snapshots.M15 ? (timeframesFeed?.M15?.source === "twelve_data" ? "API Live" : "Cache") : "Belum Ada"}
                </span>
                <span className="text-[10px] text-zinc-400">{m15Candles.length} candle</span>
              </div>

              <div className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-100">
                <span className="text-zinc-400 block text-[11px]">Feed M5</span>
                <span className={cn("font-bold block mt-0.5", snapshots.M5 ? "text-emerald-600" : "text-zinc-400")}>
                  {snapshots.M5 ? (timeframesFeed?.M5?.source === "twelve_data" ? "API Live" : "Cache") : "Belum Ada"}
                </span>
                <span className="text-[10px] text-zinc-400">{m5Candles.length} candle</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-zinc-600 pt-1">
              <span>Status Izin Analisis:</span>
              <span className={cn("font-bold", dataQuality.analysisAllowed ? "text-emerald-600" : "text-rose-600")}>
                {dataQuality.analysisAllowed ? "Diizinkan (Data Valid)" : "Ditangguhkan"}
              </span>
            </div>

            <p className="text-zinc-500 text-[11px] leading-relaxed">
              {dataQuality.reason}
            </p>
          </div>
        </div>
      </div>

      {/* 6. CONFLUENCE CHECKLIST (10 POINTS) & RISK ENGINE ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* CHECKLIST (2 COLS) */}
        <div id="confluence-checklist-panel" className="lg:col-span-2 bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-zinc-900 text-sm">Matriks Konfluensi 10 Poin</h3>
            </div>
            <span className="text-xs text-zinc-500">
              {checklist.filter((c) => c.status === "passed").length} dari 10 Terpenuhi
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {checklist.map((item) => {
              return (
                <div
                  key={item.id}
                  className={cn(
                    "p-3 rounded-lg border flex items-start gap-2.5 transition-colors",
                    item.status === "passed"
                      ? "bg-emerald-50/50 border-emerald-200 text-zinc-900"
                      : item.status === "waiting"
                      ? "bg-amber-50/30 border-amber-200 text-zinc-800"
                      : "bg-rose-50/30 border-rose-200 text-zinc-800"
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {item.status === "passed" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : item.status === "waiting" ? (
                      <Clock className="w-4 h-4 text-amber-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-500" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 font-semibold text-zinc-900">
                      <span>{item.label}</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-snug">
                      {item.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RISK ENGINE STATUS (1 COL) */}
        <div id="risk-engine-panel" className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-zinc-900 text-sm">Status Risiko Portofolio</h3>
              </div>
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-bold border",
                  riskAnalysis.status === "Aman"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : riskAnalysis.status === "Waspada"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
                )}
              >
                {riskAnalysis.status}
              </span>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-zinc-50">
                <span className="text-zinc-500">Kerugian Hari Ini:</span>
                <span className="font-semibold text-zinc-900">
                  Rp {todayRiskStats.dailyLossSoFar.toLocaleString("id-ID")}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-zinc-50">
                <span className="text-zinc-500">Batas Kerugian Harian:</span>
                <span className="font-semibold text-zinc-900">
                  Rp {todayRiskStats.dailyLossLimit.toLocaleString("id-ID")}
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-zinc-50">
                <span className="text-zinc-500">Loss Beruntun Terkini:</span>
                <span className="font-semibold text-zinc-900">
                  {todayRiskStats.consecutiveLossesSoFar} dari maks {todayRiskStats.stopAfterLosses}x
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-zinc-50">
                <span className="text-zinc-500">Jumlah Trade Hari Ini:</span>
                <span className="font-semibold text-zinc-900">
                  {todayRiskStats.tradesToday} dari kuota {todayRiskStats.maxTradesPerDay}
                </span>
              </div>

              <div className="p-2.5 bg-zinc-50 rounded-lg text-zinc-600 border border-zinc-100 text-[11px] leading-relaxed">
                {riskAnalysis.reasons.join(" ")}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] text-zinc-400">
            Terhubung otomatis dengan profil pengaturan akun <strong>{accountMode}</strong>.
          </div>
        </div>
      </div>

      {/* 7. INVALIDATION / WHAT CHANGES THE BIAS */}
      <div id="invalidation-section" className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-2 pb-3 border-b border-zinc-100">
          <AlertCircle className="w-4 h-4 text-zinc-600" />
          <h3 className="font-bold text-zinc-900 text-sm">Invalidasi & Batas Perubahan Bias</h3>
        </div>

        <div className="mt-3 text-xs text-zinc-700 leading-relaxed space-y-2">
          <p>{decision.invalidationText}</p>
          <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200/80 font-mono text-[11px] text-zinc-600">
            Aturan Disiplin: Jangan pernah memaksakan eksekusi sebelum candle M5 ditutup dan mengonfirmasi retest level struktur.
          </div>
        </div>
      </div>

      {/* 8. INSTITUTIONAL EXECUTION PLAN (SHOWN ONLY WHEN VALID_SETUP) */}
      {executionPlan && (
        <div id="execution-plan-panel" className="bg-emerald-50/40 border-2 border-emerald-300 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-emerald-200">
            <div>
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                Konfluensi Lengkap Terverifikasi
              </span>
              <h3 className="text-xl font-black text-emerald-950 mt-0.5">
                Rencana Eksekusi: {executionPlan.direction} XAUUSD
              </h3>
            </div>

            <button
              id="record-trade-plan-btn"
              onClick={handleRecordAsTradePlan}
              disabled={isSavingPlan}
              className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-all shadow-xs shrink-0 disabled:opacity-50"
            >
              <BookmarkPlus className="w-4 h-4" />
              {isSavingPlan ? "Menyimpan Rencana..." : "Catat sebagai Rencana Trade"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {saveSuccessMsg && (
            <div className="p-3 bg-emerald-100/70 border border-emerald-300 rounded-lg text-xs font-semibold text-emerald-900">
              {saveSuccessMsg}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-3 bg-white rounded-lg border border-emerald-200">
              <span className="text-zinc-500 block">Zona Entry Disarankan</span>
              <span className="text-sm font-bold text-emerald-900 block mt-0.5">
                {executionPlan.entryZone}
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-emerald-200">
              <span className="text-zinc-500 block">Stop Loss (SL Ref)</span>
              <span className="text-sm font-bold text-rose-700 block mt-0.5">
                ${formatPrice(executionPlan.stopLossRef)}
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-emerald-200">
              <span className="text-zinc-500 block">Take Profit (TP Ref)</span>
              <span className="text-sm font-bold text-emerald-700 block mt-0.5">
                ${formatPrice(executionPlan.takeProfitRef)}
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-emerald-200">
              <span className="text-zinc-500 block">Estimasi Risk/Reward</span>
              <span className="text-sm font-bold text-zinc-900 block mt-0.5">
                1 : {executionPlan.estimatedRR}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-zinc-700 bg-white/70 p-4 rounded-lg border border-emerald-200/80">
            <div>
              <span className="font-semibold text-zinc-900 block">Konteks & Lokasi:</span>
              <span>{executionPlan.htfBias} • {executionPlan.m15Area}</span>
            </div>
            <div>
              <span className="font-semibold text-zinc-900 block">Likuiditas & Retest:</span>
              <span>{executionPlan.liquidityEvent} • {executionPlan.m5Confirmation}</span>
            </div>
          </div>
        </div>
      )}

      {/* 9. RECENT EVALUATION HISTORY (FIRESTORE AUDIT TRAIL) */}
      {recentAnalyses.length > 0 && (
        <div id="recent-analyses-history" className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
            <h3 className="font-bold text-zinc-900 text-sm">Arsip Riwayat Evaluasi Mesin</h3>
            <span className="text-xs text-zinc-400">Aturan: lootly-xauusd-v1</span>
          </div>

          <div className="divide-y divide-zinc-100 text-xs">
            {recentAnalyses.map((rec) => (
              <div key={rec.id} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded text-[11px] font-bold border uppercase",
                        rec.decision === SetupDecisionType.VALID_SETUP
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : rec.decision === SetupDecisionType.WAIT
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-zinc-100 text-zinc-700 border-zinc-200"
                      )}
                    >
                      {rec.decisionLabelIndo || rec.decision}
                    </span>
                    <span className="font-semibold text-zinc-800">{rec.symbol}</span>
                    <span className="text-zinc-400">• Sesi {rec.session}</span>
                  </div>
                  <p className="text-zinc-500 text-[11px] line-clamp-1">
                    {rec.reasons?.[0] || "Evaluasi konfluensi institusional"}
                  </p>
                </div>

                <span className="text-[11px] text-zinc-400 whitespace-nowrap">
                  {formatTimestamp(rec.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
