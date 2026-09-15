import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../lib/firebase";
import {
  collection,
  onSnapshot,
  doc,
  query,
  orderBy,
  limit,
  setDoc,
} from "firebase/firestore";
import { useAppStore } from "../store/AppContext";
import {
  MarketSnapshot,
  CandleItem,
  SupportedDeskTimeframe,
  SetupDecisionType,
  DeskAnalysisRecord,
  AiDeskAnalysisRecord,
  MarketDataSource,
  MarketDataApiResponse,
  QuotaStatus,
  TimeframeFeedStatus,
  DeskNotificationSettings,
} from "../types";
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToWebPush,
  unsubscribeFromWebPush,
  triggerTestPushNotification,
  dispatchPushAlert,
  playAlertChime,
  getExistingPushSubscription,
  ensurePushSubscriptionSynced,
} from "../lib/pushNotifications";
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
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Shield,
  ArrowRight,
  Database,
  Zap,
  BookmarkPlus,
  RefreshCw,
  Bell,
  BellRing,
  X,
  Settings,
  Volume2,
  VolumeX,
  Send,
  Smartphone,
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

// Web Audio synthesizer tone for confirmed setup notifications
function playNotificationTone() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(784, ctx.currentTime); // G5
    osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.15); // C6

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    // Audio autoplay restrictions fallback
  }
}

export function AiTradingDesk() {
  const navigate = useNavigate();
  const { accountMode, settings, trades, user } = useAppStore();

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

  // Local Controls & Notification States
  const [isLoading, setIsLoading] = useState(true);
  const [highImpactNewsActive, setHighImpactNewsActive] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Notification Banner State
  const [activeNotification, setActiveNotification] = useState<{
    title: string;
    message: string;
    direction: "BUY" | "SELL";
    timestamp: number;
    setupAnalysisId: string;
    isForming?: boolean;
  } | null>(null);

  // Notification Preferences
  const [notificationSettings, setNotificationSettings] = useState<DeskNotificationSettings>(() => {
    try {
      const saved = localStorage.getItem("lootly_desk_notif_settings");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      notifyForming: true,
      notifyValid: true,
      soundEnabled: true,
      pushEnabled: false,
    };
  });

  const [desktopNotifAllowed, setDesktopNotifAllowed] = useState<boolean>(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      return Notification.permission === "granted";
    }
    return false;
  });

  // Web Push Infrastructure State
  const [isPushActive, setIsPushActive] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(getNotificationPermission());
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);
  const [showNotifSettings, setShowNotifSettings] = useState(false);

  // Persist notification preferences
  useEffect(() => {
    try {
      localStorage.setItem("lootly_desk_notif_settings", JSON.stringify(notificationSettings));
    } catch {}
  }, [notificationSettings]);

  // Check existing push subscription on mount and auto-sync to Firestore (Requirement 11)
  useEffect(() => {
    getExistingPushSubscription().then((sub) => {
      if (sub) {
        setIsPushActive(true);
        setDesktopNotifAllowed(true);
        const effectiveUid = user?.uid || settings?.userId || "user_trader";
        ensurePushSubscriptionSynced(effectiveUid);
      }
    });
  }, [user?.uid, settings?.userId]);

  // When notification settings dialog opens, re-sync existing subscription to Firestore (Requirement 11)
  useEffect(() => {
    if (showNotifSettings) {
      getExistingPushSubscription().then((sub) => {
        if (sub) {
          const effectiveUid = user?.uid || settings?.userId || "user_trader";
          ensurePushSubscriptionSynced(effectiveUid);
        }
      });
    }
  }, [showNotifSettings, user?.uid, settings?.userId]);

  // Web Push Handlers
  const handleEnableWebPush = async () => {
    setIsSubscribingPush(true);
    setPushStatusMessage(null);
    try {
      const res = await subscribeToWebPush(user?.uid || settings?.userId || "user_trader");
      setPushPermission(getNotificationPermission());
      if (res.success) {
        setIsPushActive(true);
        setDesktopNotifAllowed(true);
        setNotificationSettings((prev) => ({ ...prev, pushEnabled: true }));
        setPushStatusMessage("Web Push aktif! Notifikasi latar belakang tersambung.");
      } else {
        setPushStatusMessage(res.error || "Gagal mengaktifkan push notifikasi.");
      }
    } catch (err: any) {
      setPushStatusMessage(err?.message || "Terjadi kesalahan saat mendaftar push notifikasi.");
    } finally {
      setIsSubscribingPush(false);
    }
  };

  const handleDisableWebPush = async () => {
    try {
      await unsubscribeFromWebPush();
      setIsPushActive(false);
      setNotificationSettings((prev) => ({ ...prev, pushEnabled: false }));
      setPushStatusMessage("Push notifikasi latar belakang telah dinonaktifkan.");
    } catch (err: any) {
      setPushStatusMessage("Gagal menonaktifkan push notifikasi.");
    }
  };

  const handleTestPush = async () => {
    setPushStatusMessage("Mengirim tes push notifikasi ke perangkat Anda...");
    const res = await triggerTestPushNotification(user?.uid || settings?.userId || "user_trader");
    setPushStatusMessage(res.message);
  };

  // Track notified setup IDs and previous state to prevent duplicate alerts
  const notifiedSetupsRef = useRef<Set<string>>(new Set());
  const previousStateRef = useRef<SetupDecisionType | null>(null);
  const lastActiveSetupIdRef = useRef<string | null>(null);

  // Primary Function: Fetch Multi-Timeframe Data from Server
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
        setH1History(list.reverse());
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

    const qAnalyses = query(
      collection(db, "aiDeskAnalyses"),
      orderBy("updatedAt", "desc"),
      limit(6)
    );
    const unsubscribeAnalyses = onSnapshot(
      qAnalyses,
      (snap) => {
        const list: DeskAnalysisRecord[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
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

  // 9. Automated Setup State Transitions & Notification Event System
  useEffect(() => {
    const currentState = decision.decision;
    const prevState = previousStateRef.current;

    // Stable anchor identifier for the current liquidity & structure level
    const isBullish = h1Analysis.bias === "Bullish";
    const prospectiveDirection: "BUY" | "SELL" = isBullish ? "BUY" : "SELL";
    const sweepAnchor = (liquidityAnalysis.sweptPrice || 0).toFixed(2);
    const breakAnchor = (m5Analysis.breakLevel || 0).toFixed(2);
    const setupId = `xauusd_${prospectiveDirection.toLowerCase()}_${breakAnchor}_${sweepAnchor}`;

    // CASE A: SETUP FORMING PRE-ALERT (Menunggu retest M5)
    if (currentState === SetupDecisionType.SETUP_FORMING) {
      const formingKey = `${setupId}_forming`;

      if (!notifiedSetupsRef.current.has(formingKey)) {
        notifiedSetupsRef.current.add(formingKey);

        const formingTitle = "XAUUSD — SETUP FORMING";
        const formingBody = `XAUUSD — Setup ${prospectiveDirection} sedang terbentuk. Menunggu retest M5.`;

        // 1. Audio chime if enabled
        if (notificationSettings.soundEnabled) {
          playAlertChime("forming");
        }

        // 2. In-app banner
        setActiveNotification({
          title: formingTitle,
          message: formingBody,
          direction: prospectiveDirection,
          timestamp: Date.now(),
          setupAnalysisId: setupId,
          isForming: true,
        });

        // 3. Desktop browser notification
        if (notificationSettings.notifyForming && desktopNotifAllowed && "Notification" in window) {
          try {
            new Notification(formingTitle, {
              body: formingBody,
              icon: "/icon.svg",
              badge: "/favicon.svg",
              tag: formingKey,
            });
          } catch {}
        }

        // 4. Background Web Push notification
        if (notificationSettings.pushEnabled && isPushActive) {
          dispatchPushAlert(
            {
              title: formingTitle,
              body: formingBody,
              setupAnalysisId: setupId,
              direction: prospectiveDirection,
              type: "FORMING",
            },
            settings?.userId
          );
        }

        // 5. Persist forming stage to Firestore
        setDoc(
          doc(db, "aiDeskAnalyses", setupId),
          {
            setupAnalysisId: setupId,
            symbol: "XAUUSD",
            direction: prospectiveDirection,
            state: currentState,
            decisionLabelIndo: decision.decisionLabelIndo,
            preAlertSent: true,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ).catch(() => {});
      }
    }

    // CASE B: CONFIRMED VALID SETUP (BUY_SETUP_VALID or SELL_SETUP_VALID)
    if (
      (currentState === SetupDecisionType.BUY_SETUP_VALID ||
        currentState === SetupDecisionType.SELL_SETUP_VALID) &&
      executionPlan
    ) {
      const direction = currentState === SetupDecisionType.BUY_SETUP_VALID ? "BUY" : "SELL";
      const validKey = `${setupId}_valid`;

      lastActiveSetupIdRef.current = setupId;

      // Prevent duplicate notifications for the same confirmed setup
      if (!notifiedSetupsRef.current.has(validKey)) {
        notifiedSetupsRef.current.add(validKey);

        const validTitle = `XAUUSD — SETUP ${direction} VALID`;
        const validBody = `Entry ${formatPrice(executionPlan.entryLow)}–${formatPrice(executionPlan.entryHigh)} | SL ${formatPrice(executionPlan.stopLoss)} | TP1 ${formatPrice(executionPlan.tp1)} | RR 1:${executionPlan.rrToTp1}\nCek chart sebelum eksekusi.`;

        // 1. Audio chime if enabled
        if (notificationSettings.soundEnabled) {
          playAlertChime("valid");
        }

        // 2. In-app banner
        setActiveNotification({
          title: validTitle,
          message: validBody,
          direction,
          timestamp: Date.now(),
          setupAnalysisId: setupId,
          isForming: false,
        });

        // 3. Desktop browser notification
        if (notificationSettings.notifyValid && desktopNotifAllowed && "Notification" in window) {
          try {
            new Notification(validTitle, {
              body: validBody,
              icon: "/icon.svg",
              badge: "/favicon.svg",
              tag: validKey,
            });
          } catch {}
        }

        // 4. Background Web Push notification
        if (notificationSettings.pushEnabled && isPushActive) {
          dispatchPushAlert(
            {
              title: validTitle,
              body: validBody,
              setupAnalysisId: setupId,
              direction,
              type: "VALID",
            },
            settings?.userId
          );
        }

        // 5. Persist comprehensive setup record to Firestore
        const recordData: AiDeskAnalysisRecord = {
          setupAnalysisId: setupId,
          symbol: "XAUUSD",
          direction,
          state: currentState,
          decisionLabelIndo: decision.decisionLabelIndo,
          confidence: decision.confidence as any,
          h1Bias: h1Analysis.bias,
          m15Pullback: m15Analysis.pullbackStatus,
          liquiditySweep: liquidityAnalysis.status,
          m5StructureShift: m5Analysis.status,
          displacement: m5Analysis.displacementDetected ? "Terkonfirmasi" : "Belum",
          retest: m5Analysis.retestStatus,
          riskStatus: riskAnalysis.riskFilter,
          entryZone: `${formatPrice(executionPlan.entryLow)} – ${formatPrice(executionPlan.entryHigh)}`,
          entryLow: executionPlan.entryLow,
          entryHigh: executionPlan.entryHigh,
          referenceEntry: executionPlan.referenceEntry,
          stopLoss: executionPlan.stopLoss,
          tp1: executionPlan.tp1,
          tp2: executionPlan.tp2 ?? undefined,
          rr: executionPlan.rrToTp1,
          rrToTp1: executionPlan.rrToTp1,
          rrToTp2: executionPlan.rrToTp2 ?? undefined,
          invalidationLevel: executionPlan.invalidationLevel,
          invalidationReason: executionPlan.invalidationReason,
          invalidation: executionPlan.invalidation,
          setupCreatedAt: executionPlan.setupCreatedAt,
          setupExpiresAt: executionPlan.setupExpiresAt,
          marketPriceAtSignal: executionPlan.marketPriceAtSignal,
          reasons: decision.reasons,
          marketDataTimestamp: dataQuality.latestTimestamp || Date.now(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          notificationSent: true,
          validAlertSent: true,
        };

        setDoc(doc(db, "aiDeskAnalyses", setupId), recordData, { merge: true }).catch((err) => {
          console.warn("[Meja AI] Gagal menyimpan aiDeskAnalyses record:", err);
        });
      }
    } else if (
      prevState === SetupDecisionType.BUY_SETUP_VALID ||
      prevState === SetupDecisionType.SELL_SETUP_VALID
    ) {
      // Transitioned away from valid setup -> mark previous setup as invalidated
      if (lastActiveSetupIdRef.current) {
        setDoc(
          doc(db, "aiDeskAnalyses", lastActiveSetupIdRef.current),
          {
            state: currentState,
            invalidated: true,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ).catch(() => {});
      }
    }

    previousStateRef.current = currentState;
  }, [
    decision.decision,
    decision.decisionLabelIndo,
    decision.confidence,
    decision.reasons,
    decision.invalidationText,
    m5Analysis.breakLevel,
    m5Analysis.status,
    m5Analysis.retestStatus,
    m5Analysis.displacementDetected,
    liquidityAnalysis.sweptPrice,
    liquidityAnalysis.status,
    h1Analysis.bias,
    m15Analysis.pullbackStatus,
    riskAnalysis.riskFilter,
    executionPlan,
    dataQuality.latestTimestamp,
    desktopNotifAllowed,
    isPushActive,
    notificationSettings,
    settings?.userId,
  ]);

  // Copy helper
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2500);
  };

  // 10. Record Evaluation as Trade Plan
  const handleRecordAsTradePlan = async () => {
    if (!executionPlan) return;
    setIsSavingPlan(true);
    setSaveSuccessMsg(null);

    try {
      const direction = executionPlan.direction;
      const sweepAnchor = (liquidityAnalysis.sweptPrice || 0).toFixed(2);
      const breakAnchor = (m5Analysis.breakLevel || 0).toFixed(2);
      const setupAnalysisId = `xauusd_${direction.toLowerCase()}_${breakAnchor}_${sweepAnchor}`;

      const recordData: AiDeskAnalysisRecord = {
        setupAnalysisId,
        symbol: "XAUUSD",
        direction,
        state: decision.decision,
        decisionLabelIndo: decision.decisionLabelIndo,
        confidence: decision.confidence as any,
        h1Bias: h1Analysis.bias,
        m15Pullback: m15Analysis.pullbackStatus,
        liquiditySweep: liquidityAnalysis.status,
        m5StructureShift: m5Analysis.status,
        displacement: m5Analysis.displacementDetected ? "Terkonfirmasi" : "Belum",
        retest: m5Analysis.retestStatus,
        riskStatus: riskAnalysis.riskFilter,
        entryZone: `${formatPrice(executionPlan.entryLow)} – ${formatPrice(executionPlan.entryHigh)}`,
        entryLow: executionPlan.entryLow,
        entryHigh: executionPlan.entryHigh,
        referenceEntry: executionPlan.referenceEntry,
        stopLoss: executionPlan.stopLoss,
        tp1: executionPlan.tp1,
        tp2: executionPlan.tp2 ?? undefined,
        rr: executionPlan.rrToTp1,
        rrToTp1: executionPlan.rrToTp1,
        rrToTp2: executionPlan.rrToTp2 ?? undefined,
        invalidationLevel: executionPlan.invalidationLevel,
        invalidationReason: executionPlan.invalidationReason,
        invalidation: executionPlan.invalidation,
        setupCreatedAt: executionPlan.setupCreatedAt,
        setupExpiresAt: executionPlan.setupExpiresAt,
        marketPriceAtSignal: executionPlan.marketPriceAtSignal,
        reasons: decision.reasons,
        marketDataTimestamp: dataQuality.latestTimestamp || Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notificationSent: true,
      };

      await setDoc(doc(db, "aiDeskAnalyses", setupAnalysisId), recordData, { merge: true });

      setSaveSuccessMsg("Rencana trade tersimpan. Mengalihkan ke formulir eksekusi...");

      setTimeout(() => {
        navigate("/add", {
          state: {
            prefillPlan: {
              asset: "XAU/USD",
              direction: executionPlan.direction.toLowerCase(),
              entryPrice: executionPlan.referenceEntry || m5Analysis.breakLevel || latestPrice,
              stopLoss: executionPlan.stopLoss,
              takeProfit: executionPlan.tp1,
              tradeReason: `[Lootly Setup ${executionPlan.direction}] Area: ${formatPrice(executionPlan.entryLow)}–${formatPrice(executionPlan.entryHigh)} | SL: $${formatPrice(executionPlan.stopLoss)} | TP1: $${formatPrice(executionPlan.tp1)} | RR 1:${executionPlan.rrToTp1}`,
              setupTag: "Lootly AI Desk - Setup Valid",
              setupAnalysisId,
            },
          },
        });
      }, 600);
    } catch (err: any) {
      console.error("Gagal menyimpan rencana trade:", err);
      setSaveSuccessMsg(`Error: ${err.message || String(err)}`);
    } finally {
      setIsSavingPlan(false);
    }
  };

  const webhookUrl = `${window.location.origin}/api/tradingview-webhook`;

  const isBuySetupValid = decision.decision === SetupDecisionType.BUY_SETUP_VALID;
  const isSellSetupValid = decision.decision === SetupDecisionType.SELL_SETUP_VALID;
  const isSetupForming = decision.decision === SetupDecisionType.SETUP_FORMING;
  const isSetupExpired = decision.decision === SetupDecisionType.SETUP_EXPIRED;
  const isWaitBuy = decision.decision === SetupDecisionType.WAIT_BUY;
  const isWaitSell = decision.decision === SetupDecisionType.WAIT_SELL;
  const isNoTrade = decision.decision === SetupDecisionType.NO_TRADE;

  return (
    <div id="ai-trading-desk-page" className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* 1. TOP HEADER & MARKET CONTEXT */}
      <div id="desk-header" className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-bold shadow-xs">
                <Cpu className="w-4 h-4 text-emerald-400" />
              </div>
              <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
                Meja Trading AI
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200">
                XAUUSD
              </span>

              {/* Live Market Data Source Indicator */}
              {(dataSource === "twelvedata" || dataSource === "twelve_data") && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Twelve Data (Live)
                </span>
              )}
              {dataSource === "cache" && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                  Twelve Data (Cache)
                </span>
              )}
              {dataSource === "tradingview" && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  TradingView Fallback
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              Lapisan validasi setup & filter risiko terstruktur sebelum eksekusi di Exness.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Notification Control & Settings Popover Opener */}
            <button
              id="desk-notification-settings-btn"
              onClick={() => setShowNotifSettings(true)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 shadow-2xs",
                isPushActive
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                  : desktopNotifAllowed
                  ? "bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100"
                  : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              )}
              title="Konfigurasi Web Push, Desktop Alert & Suara"
            >
              {isPushActive ? (
                <BellRing className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
              ) : (
                <Bell className="w-3.5 h-3.5 text-zinc-500" />
              )}
              <span>
                {isPushActive ? "Push Aktif" : desktopNotifAllowed ? "Notif Aktif" : "Set Notifikasi"}
              </span>
              <Settings className="w-3 h-3 opacity-60 ml-0.5" />
            </button>

            {/* Market Data Refresh Button */}
            <button
              id="refresh-market-data-btn"
              onClick={() => fetchMarketData(true)}
              disabled={isFetchingMarketData}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              title="Perbarui feed candle multi-timeframe XAU/USD"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-emerald-600", isFetchingMarketData && "animate-spin")} />
              {isFetchingMarketData ? "Memperbarui..." : "Perbarui Feed"}
            </button>

            {/* High Impact News caution button */}
            <button
              id="toggle-news-mode-btn"
              onClick={() => setHighImpactNewsActive(!highImpactNewsActive)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5",
                highImpactNewsActive
                  ? "bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100"
                  : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              )}
              title="Aktifkan saat ada rilis berita berdampak tinggi"
            >
              <AlertTriangle className={cn("w-3.5 h-3.5", highImpactNewsActive ? "text-rose-600" : "text-zinc-400")} />
              {highImpactNewsActive ? "Berita Aktif" : "Mode Normal"}
            </button>
          </div>
        </div>

        {/* Realtime Snapshot Ribbon */}
        <div className="mt-4 pt-3.5 border-t border-zinc-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-zinc-400 block font-medium text-[11px]">Harga Live XAUUSD</span>
            <span className="text-base font-bold text-zinc-900">
              {latestPrice !== null ? `$${formatPrice(latestPrice)}` : "Menunggu data"}
            </span>
          </div>

          <div>
            <span className="text-zinc-400 block font-medium text-[11px]">Sesi Pasar</span>
            <span className={cn("inline-flex items-center px-2 py-0.5 mt-0.5 rounded text-[11px] font-semibold border", sessionInfo.badgeColor)}>
              {sessionInfo.sessionLabel}
            </span>
          </div>

          <div>
            <span className="text-zinc-400 block font-medium text-[11px]">Pembaruan Terakhir</span>
            <span className="text-zinc-700 font-medium block mt-0.5">
              {formatRelativeTime(dataQuality.latestTimestamp)}
            </span>
          </div>

          <div>
            <span className="text-zinc-400 block font-medium text-[11px]">Filter Risiko Akun</span>
            <span className={cn(
              "font-bold block mt-0.5 text-xs",
              riskAnalysis.riskFilter === "AMAN"
                ? "text-emerald-700"
                : riskAnalysis.riskFilter === "PERINGATAN"
                ? "text-amber-700"
                : "text-rose-700"
            )}>
              {riskAnalysis.riskFilter} ({accountMode.toUpperCase()})
            </span>
          </div>
        </div>
      </div>

      {/* NOTIFICATION SETTINGS MODAL */}
      {showNotifSettings && (
        <div
          id="desk-notif-settings-modal"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white border border-zinc-200 rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-zinc-900 text-sm">Pengaturan Notifikasi Setup AI</h3>
              </div>
              <button
                onClick={() => setShowNotifSettings(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Notification Toggles */}
            <div className="space-y-3 text-xs">
              {/* Toggle 1: Setup Forming Alert */}
              <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 hover:bg-zinc-50 cursor-pointer">
                <div>
                  <span className="font-bold text-zinc-800 block">Pre-Alert: Setup Terbentuk</span>
                  <span className="text-zinc-500 text-[11px] block mt-0.5">
                    Notifikasi awal saat M5 MSS terbentuk sebelum konfirmasi retest.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notificationSettings.notifyForming}
                  onChange={(e) =>
                    setNotificationSettings((prev) => ({ ...prev, notifyForming: e.target.checked }))
                  }
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300"
                />
              </label>

              {/* Toggle 2: Setup Valid Confirmed Alert */}
              <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 hover:bg-zinc-50 cursor-pointer">
                <div>
                  <span className="font-bold text-zinc-800 block">Alert Setup Valid Terkonfirmasi</span>
                  <span className="text-zinc-500 text-[11px] block mt-0.5">
                    Notifikasi lengkap saat seluruh konfluensi & RR &ge; 2.0 terpenuhi.
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={notificationSettings.notifyValid}
                  onChange={(e) =>
                    setNotificationSettings((prev) => ({ ...prev, notifyValid: e.target.checked }))
                  }
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300"
                />
              </label>

              {/* Toggle 3: Audio Tone Chime */}
              <label className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 hover:bg-zinc-50 cursor-pointer">
                <div className="flex items-center gap-2">
                  {notificationSettings.soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-zinc-400" />
                  )}
                  <div>
                    <span className="font-bold text-zinc-800 block">Suara Audio Chime</span>
                    <span className="text-zinc-500 text-[11px] block mt-0.5">
                      Bunyikan nada instan di tab browser saat ada sinyal.
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={notificationSettings.soundEnabled}
                  onChange={(e) =>
                    setNotificationSettings((prev) => ({ ...prev, soundEnabled: e.target.checked }))
                  }
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-zinc-300"
                />
              </label>
            </div>

            {/* Web Push Infrastructure Panel */}
            <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-zinc-600" />
                  <span className="font-bold text-zinc-900">Web Push Latar Belakang (PWA)</span>
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-bold border",
                    isPushActive
                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                      : pushPermission === "denied"
                      ? "bg-rose-100 text-rose-800 border-rose-200"
                      : "bg-zinc-200 text-zinc-700 border-zinc-300"
                  )}
                >
                  {isPushActive ? "Aktif & Tersambung" : pushPermission === "denied" ? "Izin Ditolak" : "Belum Aktif"}
                </span>
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Menerima notifikasi setup valid XAU/USD bahkan saat tab browser ditutup atau diminimalkan.
              </p>

              {pushStatusMessage && (
                <div className="p-2 bg-white rounded border border-zinc-200 text-[11px] text-zinc-700 font-medium">
                  {pushStatusMessage}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                {!isPushActive ? (
                  <button
                    id="enable-web-push-btn"
                    onClick={handleEnableWebPush}
                    disabled={isSubscribingPush || !isPushSupported()}
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    {isSubscribingPush ? "Menyambungkan Push..." : "Aktifkan Web Push Sekarang"}
                  </button>
                ) : (
                  <>
                    <button
                      id="test-web-push-btn"
                      onClick={handleTestPush}
                      className="flex-1 py-1.5 bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-100 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                    >
                      <Send className="w-3 h-3 text-emerald-600" />
                      Kirim Tes Push
                    </button>
                    <button
                      id="disable-web-push-btn"
                      onClick={handleDisableWebPush}
                      className="px-3 py-1.5 text-zinc-500 hover:text-rose-600 text-xs font-medium transition-colors"
                    >
                      Nonaktifkan
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowNotifSettings(false)}
                className="px-4 py-2 bg-zinc-900 text-white rounded-lg font-bold text-xs hover:bg-zinc-800 transition-colors"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. ACTIVE SETUP NOTIFICATION BANNER (FORMING OR CONFIRMED) */}
      {activeNotification && (
        <div
          id="active-setup-notification"
          className={cn(
            "p-4 rounded-xl border flex items-center justify-between gap-3 shadow-sm transition-all",
            activeNotification.isForming
              ? "bg-amber-50/90 border-amber-300 text-amber-950"
              : "bg-emerald-50 border-emerald-300 text-emerald-950"
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-8 h-8 rounded-full text-white flex items-center justify-center shrink-0 shadow-xs",
                activeNotification.isForming ? "bg-amber-600" : "bg-emerald-600"
              )}
            >
              <BellRing className="w-4 h-4 animate-bounce" />
            </div>
            <div>
              <span
                className={cn(
                  "font-bold text-xs uppercase tracking-wider block",
                  activeNotification.isForming ? "text-amber-800" : "text-emerald-800"
                )}
              >
                {activeNotification.title}
              </span>
              <p className="text-sm font-semibold mt-0.5">
                {activeNotification.message}
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveNotification(null)}
            className="p-1 rounded-lg text-zinc-500 hover:bg-zinc-200/50 transition-colors"
            title="Tutup notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3. MAIN DECISION CARD (PRIMARY FOCAL POINT) */}
      <div
        id="main-decision-card"
        className={cn(
          "border-2 rounded-xl p-6 shadow-xs transition-all",
          isBuySetupValid || isSellSetupValid
            ? "bg-emerald-50/70 border-emerald-400"
            : isSetupForming
            ? "bg-amber-50/70 border-amber-400"
            : isSetupExpired
            ? "bg-rose-50/70 border-rose-400"
            : isWaitBuy || isWaitSell
            ? "bg-amber-50/60 border-amber-300"
            : "bg-zinc-50/90 border-zinc-300"
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200/80">
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block">
              Keputusan Setup XAUUSD
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              <h2
                className={cn(
                  "text-2xl sm:text-3xl font-black tracking-tight",
                  isBuySetupValid || isSellSetupValid
                    ? "text-emerald-800"
                    : isSetupForming
                    ? "text-amber-800"
                    : isSetupExpired
                    ? "text-rose-800"
                    : isWaitBuy || isWaitSell
                    ? "text-amber-800"
                    : "text-zinc-800"
                )}
              >
                {decision.decisionLabelIndo}
              </h2>

              {/* Direction Badge */}
              <span
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold border uppercase tracking-wider",
                  isBuySetupValid || isWaitBuy
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : isSellSetupValid || isWaitSell
                    ? "bg-rose-100 text-rose-800 border-rose-300"
                    : isSetupExpired
                    ? "bg-rose-100 text-rose-700 border-rose-200"
                    : "bg-zinc-200 text-zinc-700 border-zinc-300"
                )}
              >
                Arah: {h1Analysis.bias === "Bullish" ? "BUY" : h1Analysis.bias === "Bearish" ? "SELL" : "NETRAL"}
              </span>

              {/* Confluence Quality */}
              <span
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-semibold border",
                  decision.confidence === "Kuat"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : decision.confidence === "Sedang"
                    ? "bg-amber-100 text-amber-800 border-amber-200"
                    : "bg-zinc-200 text-zinc-700 border-zinc-300"
                )}
              >
                Kualitas Konfluensi: {decision.confidence}
              </span>
            </div>
          </div>

          <div className="sm:text-right">
            <span className="text-[11px] text-zinc-500 block font-medium">Kelayakan Eksekusi</span>
            <span
              className={cn(
                "text-sm font-bold block mt-0.5",
                isBuySetupValid || isSellSetupValid
                  ? "text-emerald-700"
                  : isSetupForming
                  ? "text-amber-700"
                  : isSetupExpired
                  ? "text-rose-700"
                  : isWaitBuy || isWaitSell
                  ? "text-amber-700"
                  : "text-zinc-600"
              )}
            >
              {isBuySetupValid || isSellSetupValid
                ? "Layak Eksekusi Sesuai Plan"
                : isSetupForming
                ? "Pre-Alert: Menunggu Retest M5"
                : isSetupExpired
                ? "Setup Kedaluwarsa (Batal)"
                : isWaitBuy || isWaitSell
                ? "Tunggu Konfirmasi Lengkap"
                : "Tidak Ada Trade (Disiplin)"}
            </span>
          </div>
        </div>

        {/* Narrative reason */}
        <div className="pt-4">
          <p className="text-xs text-zinc-700 font-medium leading-relaxed">
            {decision.reasons[0] || "Menunggu pemenuhan seluruh tahapan aturan struktur harga."}
          </p>
        </div>
      </div>

      {/* 4. COMPACT CHECKLIST UI */}
      <div id="setup-checklist-panel" className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-zinc-900 text-sm">Checklist Validasi Setup XAUUSD</h3>
          </div>
          <span className="text-xs font-semibold text-zinc-500">
            {checklist.filter((c) => c.status === "passed").length} dari 7 Terpenuhi
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
          {checklist.map((item) => {
            const isPassed = item.status === "passed";
            const isWaiting = item.status === "waiting";
            const isFailed = item.status === "failed";

            return (
              <div
                key={item.id}
                className={cn(
                  "p-3 rounded-lg border flex items-start gap-2.5 transition-colors",
                  isPassed
                    ? "bg-emerald-50/40 border-emerald-200 text-zinc-900"
                    : isWaiting
                    ? "bg-amber-50/30 border-amber-200 text-zinc-800"
                    : "bg-rose-50/30 border-rose-200 text-zinc-800"
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {isPassed ? (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-600 text-white font-bold text-[10px]">
                      ✓
                    </span>
                  ) : isWaiting ? (
                    <Clock className="w-4 h-4 text-amber-500" />
                  ) : (
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-500 text-white font-bold text-[10px]">
                      ✕
                    </span>
                  )}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 font-semibold text-zinc-900">
                    <span>{item.label}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 truncate" title={item.detail}>
                    {item.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Highlighted Conclusion Box */}
        <div className="mt-2 p-3 bg-zinc-50 rounded-lg border border-zinc-200 text-xs text-zinc-700 flex items-start gap-2">
          <Zap className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-zinc-900 mr-1.5">Kesimpulan:</span>
            <span>
              {isBuySetupValid || isSellSetupValid
                ? `Setup ${executionPlan?.direction} valid terkonfirmasi. Struktur M5 telah retest level kunci. Cek chart TradingView sebelum eksekusi.`
                : isWaitBuy || isWaitSell
                ? decision.reasons[0] || "Tunggu retest sebelum mempertimbangkan entry."
                : decision.reasons[0] || "Kondisi pasar saat ini tidak memenuhi standar setup institusional. Disiplin menunggu."}
            </span>
          </div>
        </div>
      </div>

      {/* 5. EXECUTION PLAN (SHOWN ONLY WHEN SETUP IS VALID) */}
      {(isBuySetupValid || isSellSetupValid) && executionPlan && (
        <div id="execution-plan-panel" className="bg-emerald-50/50 border-2 border-emerald-400 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-emerald-200">
            <div>
              <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
                Setup Terkonfirmasi Valid
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
              {isSavingPlan ? "Menyimpan..." : "Catat sebagai Rencana Trade"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {saveSuccessMsg && (
            <div className="p-3 bg-emerald-100/70 border border-emerald-300 rounded-lg text-xs font-semibold text-emerald-900">
              {saveSuccessMsg}
            </div>
          )}

          {/* Key Trade Parameters - Mandatory Hard Gates */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-white rounded-lg border border-emerald-200 shadow-2xs">
              <span className="text-zinc-500 block text-[11px]">Area Entry Valid (Disarankan)</span>
              <span className="text-sm font-bold text-emerald-900 block mt-0.5 font-mono">
                ${formatPrice(executionPlan.entryLow)} – ${formatPrice(executionPlan.entryHigh)}
              </span>
              <span className="text-[10px] text-zinc-400 block mt-0.5 font-mono">
                Ref: ${formatPrice(executionPlan.referenceEntry)}
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-emerald-200 shadow-2xs">
              <span className="text-zinc-500 block text-[11px]">Stop Loss Struktural (SL)</span>
              <span className="text-sm font-bold text-rose-700 block mt-0.5 font-mono">
                ${formatPrice(executionPlan.stopLoss)}
              </span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">
                Swing {executionPlan.direction === "BUY" ? "Low" : "High"} M5
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-emerald-200 shadow-2xs">
              <span className="text-zinc-500 block text-[11px]">Target TP1 / TP2</span>
              <span className="text-sm font-bold text-emerald-700 block mt-0.5 font-mono">
                ${formatPrice(executionPlan.tp1)} {executionPlan.tp2 ? `/ $${formatPrice(executionPlan.tp2)}` : ""}
              </span>
              <span className="text-[10px] text-zinc-400 block mt-0.5">
                Likuiditas Terdekat
              </span>
            </div>

            <div className="p-3 bg-white rounded-lg border border-emerald-200 shadow-2xs">
              <span className="text-zinc-500 block text-[11px]">Risk / Reward Minimum (RR)</span>
              <span className="text-sm font-bold text-zinc-900 block mt-0.5 font-mono">
                1 : {executionPlan.rrToTp1}
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold block mt-0.5">
                {executionPlan.rrToTp2 ? `TP2: 1:${executionPlan.rrToTp2} • ` : ""}Lolos Hard Gate (&ge; 2.0)
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-white rounded-lg border border-emerald-200 text-xs space-y-2">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-zinc-600">
              <span className="font-semibold text-zinc-800">Invalidasi Setup:</span>
              <span className="font-medium text-rose-700">
                ${formatPrice(executionPlan.invalidationLevel)} — {executionPlan.invalidationReason || executionPlan.invalidation}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-zinc-500 text-[11px] pt-1 border-t border-zinc-100">
              <span>Waktu Setup: {formatTimestamp(executionPlan.setupCreatedAt)}</span>
              <span className="font-semibold text-amber-800">
                Kedaluwarsa Setup: {formatTimestamp(executionPlan.setupExpiresAt)} (3 candle M5 / 15 menit)
              </span>
            </div>
          </div>

          <p className="text-[11px] text-emerald-800 font-medium italic">
            * Catatan Disiplin: Pastikan memeriksa visual chart di TradingView/LuxAlgo Anda sebelum melakukan klik eksekusi di akun Exness.
          </p>
        </div>
      )}

      {/* 6. COLLAPSIBLE TECHNICAL DETAILS & FEED INSPECTOR */}
      <div id="technical-details-section" className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs text-xs">
        <button
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-zinc-500" />
            <span className="font-bold text-zinc-800 text-xs sm:text-sm">
              Detail Teknis, Status Feed & Riwayat Evaluasi
            </span>
          </div>
          <div className="flex items-center gap-2 text-zinc-400 text-xs">
            <span>{showTechnicalDetails ? "Sembunyikan" : "Tampilkan"}</span>
            {showTechnicalDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showTechnicalDetails && (
          <div className="p-5 pt-0 border-t border-zinc-100 space-y-5">
            {/* Multi-Timeframe Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                <span className="font-bold text-zinc-900 block">Konteks H1</span>
                <span className="text-[11px] text-zinc-500 block mt-0.5">
                  Bias: {h1Analysis.bias} ({h1Analysis.structure})
                </span>
                <span className="text-[11px] text-zinc-400 block mt-1">
                  Candle H1: {h1Candles.length} • Tutup: {snapshots.H1 ? `$${formatPrice(snapshots.H1.close)}` : "-"}
                </span>
              </div>

              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                <span className="font-bold text-zinc-900 block">Lokasi M15</span>
                <span className="text-[11px] text-zinc-500 block mt-0.5">
                  Area: {m15Analysis.location} ({m15Analysis.pullbackStatus})
                </span>
                <span className="text-[11px] text-zinc-400 block mt-1">
                  Candle M15: {m15Candles.length} • Tutup: {snapshots.M15 ? `$${formatPrice(snapshots.M15.close)}` : "-"}
                </span>
              </div>

              <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                <span className="font-bold text-zinc-900 block">Konfirmasi M5</span>
                <span className="text-[11px] text-zinc-500 block mt-0.5">
                  CHoCH: {m5Analysis.chochDetected ? "Ya" : "Belum"} • Retest: {m5Analysis.retestStatus}
                </span>
                <span className="text-[11px] text-zinc-400 block mt-1">
                  Candle M5: {m5Candles.length} • Tutup: {snapshots.M5 ? `$${formatPrice(snapshots.M5.close)}` : "-"}
                </span>
              </div>
            </div>

            {/* Quota & Market Status */}
            <div className="p-3 bg-zinc-50 rounded-lg border border-zinc-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-zinc-600">
              <div>
                <span className="text-zinc-400 block">Status Pasar XAUUSD:</span>
                <span className="font-semibold text-zinc-800">
                  {marketStatus?.isOpen ? "Buka (Aktif)" : "Tutup (Akhir Pekan/Rollover)"}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block">Penggunaan Kuota Twelve Data:</span>
                <span className="font-semibold text-zinc-800 font-mono">
                  {quotaStatus ? `${quotaStatus.estimatedUsedToday} / ${quotaStatus.maxDailyLimit || 800} req` : "-"}
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block">Sumber Feed:</span>
                <span className="font-semibold text-zinc-800">
                  {dataSource === "twelvedata"
                    ? "Twelve Data API (Live)"
                    : dataSource === "cache"
                    ? "Cache Firestore Server"
                    : dataSource === "tradingview"
                    ? "TradingView Webhook Fallback"
                    : "Belum Ada"}
                </span>
              </div>
            </div>

            {/* TradingView Webhook Fallback Guide Toggle */}
            <div className="pt-2">
              <button
                onClick={() => setShowGuide(!showGuide)}
                className="text-xs font-semibold text-zinc-700 hover:text-zinc-900 flex items-center gap-1.5"
              >
                <Radio className="w-3.5 h-3.5 text-emerald-600" />
                {showGuide ? "Sembunyikan Panduan Webhook Fallback" : "Buka Panduan Webhook Fallback TradingView"}
              </button>

              {showGuide && (
                <div className="mt-3 p-4 bg-zinc-900 text-zinc-100 rounded-lg space-y-3 font-mono text-[11px]">
                  <div>
                    <label className="text-zinc-400 block mb-1">Endpoint Webhook:</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={webhookUrl}
                        className="bg-zinc-950 border border-zinc-800 text-emerald-400 px-3 py-1.5 rounded w-full select-all text-xs"
                      />
                      <button
                        onClick={() => copyToClipboard(webhookUrl, "url")}
                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-sans text-xs shrink-0"
                      >
                        {copiedField === "url" ? "Disalin" : "Salin"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Audit Trail: Recent Analyses */}
            {recentAnalyses.length > 0 && (
              <div className="pt-2 border-t border-zinc-100 space-y-2">
                <span className="font-bold text-zinc-800 block text-xs">Arsip Evaluasi Mesin AI</span>
                <div className="divide-y divide-zinc-100">
                  {recentAnalyses.map((rec) => (
                    <div key={rec.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-zinc-100 text-zinc-700">
                            {rec.decisionLabelIndo || rec.decision}
                          </span>
                          <span className="font-semibold text-zinc-800">{rec.symbol}</span>
                          <span className="text-zinc-400 text-[10px]">• Arah: {(rec as any).direction || rec.h1Context?.bias || "-"}</span>
                        </div>
                        <p className="text-zinc-500 text-[11px] line-clamp-1">
                          {rec.reasons?.[0] || "Evaluasi konfluensi institusional"}
                        </p>
                      </div>
                      <span className="text-[11px] text-zinc-400 shrink-0">
                        {formatTimestamp(rec.timestamp || (rec as any).updatedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
