import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAppStore } from "../store/AppContext";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { 
  AssetType, 
  TradeDirection, 
  TradeResult, 
  EmotionType, 
  MistakeType, 
  MarketType, 
  Trade 
} from "../types";
import { 
  formatIDR, 
  formatPercent, 
  formatProfitDual,
  formatNumberWithDots, 
  parseNumberWithDots,
  generateId
} from "../lib/utils";
import { uploadScreenshotImage } from "../lib/firebase";
import { analyzeScreenshot } from "../lib/ocrService";
import { 
  Check, 
  Upload, 
  X, 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  Camera, 
  ShieldAlert, 
  ArrowLeft,
  Calendar,
  Clock,
  Sparkles,
  Info,
  Brain,
  FileImage,
  Layers,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  HelpCircle,
  PenTool
} from "lucide-react";

export function AddTrade() {
  const { accountMode, settings, trades, updateTrade, addTrade, user } = useAppStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const editId = searchParams.get("edit");
  const initialMode = searchParams.get("mode");

  // Start Options: Isi Manual vs Upload Screenshot
  const [startOption, setStartOption] = useState<"manual" | "screenshot">(
    initialMode === "screenshot" ? "screenshot" : "manual"
  );
  const isSubmittingRef = useRef<boolean>(false);

  // Linkage to AI Trading Desk Analysis (Phase 2 decision support linkage)
  const [setupAnalysisId, setSetupAnalysisId] = useState<string | undefined>(undefined);

  // Core Form States
  const [selectedAccount, setSelectedAccount] = useState<"demo" | "real">(accountMode);
  const [marketType, setMarketType] = useState<MarketType>("forex");
  const [asset, setAsset] = useState<string>("XAU/USD");
  const [direction, setDirection] = useState<TradeDirection>("buy");
  
  // Date & Time
  const [tradeDate, setTradeDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [tradeTime, setTradeTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  // Price & Sizing Levels
  const [entryPrice, setEntryPrice] = useState<string>("");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");
  const [exitPrice, setExitPrice] = useState<string>("");
  const [lotSize, setLotSize] = useState<string>("0.1");

  // Nominal & Overrides
  const [customRiskIdr, setCustomRiskIdr] = useState<string>("");
  const [customPnlIdr, setCustomPnlIdr] = useState<string>("");
  const [manualOverridePnl, setManualOverridePnl] = useState<boolean>(false);

  // SECTION: "Setup, Psikologi & Bukti Chart"
  // A. Setup
  const [setupTag, setSetupTag] = useState<string>("Breakout & Retest");
  const [strategyName, setStrategyName] = useState<string>("");
  const [tradeReason, setTradeReason] = useState<string>("");
  const [session, setSession] = useState<string>("London");
  const [marketCondition, setMarketCondition] = useState<string>("Trending");

  // B. Psychology
  const [emotionBefore, setEmotionBefore] = useState<string>("Calm");
  const [confidenceLevel, setConfidenceLevel] = useState<"Low" | "Medium" | "High">("Medium");
  const [disciplineStatus, setDisciplineStatus] = useState<"Disciplined" | "Minor Slip" | "Violated Rules">("Disciplined");
  const [selectedMistakes, setSelectedMistakes] = useState<MistakeType[]>([]);
  const [lessonLearned, setLessonLearned] = useState<string>("");

  // C. Chart Proof & OCR
  const [screenshotBase64, setScreenshotBase64] = useState<string>("");
  const [screenshotNotes, setScreenshotNotes] = useState<string>("");
  const [isOcrScanning, setIsOcrScanning] = useState<boolean>(false);
  const [ocrResultMeta, setOcrResultMeta] = useState<{
    success: boolean;
    confidence?: "high" | "medium" | "low";
    platform?: string;
    rawNotes?: string;
    detectedFields?: string[];
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active account starting balance for risk & profit % calculation
  const activeBalance = selectedAccount === "demo" 
    ? settings.startingBalanceDemo 
    : settings.startingBalanceReal;

  // Preset quick pairs
  const forexPairs = ["XAU/USD", "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CHF"];
  const cryptoPairs = ["BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "BTC/USD"];

  const commonMistakes: MistakeType[] = [
    "FOMO", 
    "Revenge Trade", 
    "Early Entry", 
    "Late Entry", 
    "Oversized Lot", 
    "No SL", 
    "SL Too Tight", 
    "Against Trend", 
    "News Spike", 
    "Overtrade", 
    "Chasing Candle", 
    "Closed Too Early", 
    "Held Too Long"
  ];

  // Populate data if editing an existing trade
  useEffect(() => {
    if (editId) {
      const existing = trades.find((t) => t.id === editId);
      if (existing) {
        setSelectedAccount(existing.accountMode);
        setMarketType(existing.marketType || (existing.asset.includes("BTC") || existing.asset.includes("ETH") ? "crypto" : "forex"));
        setAsset(existing.asset);
        setDirection(existing.direction);
        setTradeDate(existing.date ? existing.date.split("T")[0] : new Date().toISOString().split("T")[0]);
        setTradeTime(existing.time || "12:00");
        setEntryPrice(existing.actualEntry?.toString() || existing.entryPlan?.toString() || "");
        setStopLoss(existing.actualSL?.toString() || existing.slPlan?.toString() || "");
        setTakeProfit(existing.actualTP?.toString() || existing.tp1Plan?.toString() || "");
        setExitPrice(existing.actualExit?.toString() || "");
        setLotSize(existing.lot?.toString() || "0.1");

        // Unified Section
        setSetupTag(existing.setupType || "Breakout & Retest");
        setTradeReason(existing.entryReason || "");
        setSession(existing.session || "London");
        setMarketCondition(existing.marketCondition || "Trending");
        setEmotionBefore(existing.emotionBefore || "Calm");
        setConfidenceLevel(existing.confidenceLevel || "Medium");
        setDisciplineStatus(existing.disciplineStatus || "Disciplined");
        setSelectedMistakes(existing.mistakes || []);
        setLessonLearned(existing.lessonLearned || "");
        setScreenshotBase64(existing.screenshotProof || existing.screenshotAfter || existing.screenshotBefore || "");
        setScreenshotNotes(existing.screenshotProofNotes || "");

        if (existing.ocrExtractedData) {
          setOcrResultMeta({
            success: true,
            confidence: existing.ocrExtractedData.confidence,
            platform: existing.ocrExtractedData.sourcePlatform,
            rawNotes: existing.ocrExtractedData.rawNotes,
          });
        }
        
        if (existing.pnlIdr !== undefined) {
          setCustomPnlIdr(formatNumberWithDots(Math.abs(existing.pnlIdr)));
          setManualOverridePnl(true);
        }
        if (existing.riskIdr !== undefined) {
          setCustomRiskIdr(formatNumberWithDots(existing.riskIdr));
        }
        if (existing.setupAnalysisId) {
          setSetupAnalysisId(existing.setupAnalysisId);
        }
      }
    } else if (location.state && (location.state as any).prefillPlan) {
      // Prefill from AI Trading Desk Institutional Setup Plan
      const plan = (location.state as any).prefillPlan;
      if (plan.asset) setAsset(plan.asset);
      if (plan.direction) setDirection(plan.direction);
      if (plan.entryPrice) setEntryPrice(String(plan.entryPrice));
      if (plan.stopLoss) setStopLoss(String(plan.stopLoss));
      if (plan.takeProfit) setTakeProfit(String(plan.takeProfit));
      if (plan.tradeReason) setTradeReason(plan.tradeReason);
      if (plan.setupTag) setSetupTag(plan.setupTag);
      if (plan.setupAnalysisId) setSetupAnalysisId(plan.setupAnalysisId);
    }
  }, [editId, trades, location.state]);

  // Auto Calculations (Entry, SL, TP, Exit, Lot)
  const calculations = useMemo(() => {
    const ent = parseFloat(entryPrice);
    const sl = parseFloat(stopLoss);
    const tp = parseFloat(takeProfit);
    const exit = parseFloat(exitPrice);
    const lot = parseFloat(lotSize) || 0.1;

    let multiplier = 100;
    if (asset.includes("BTC") || asset.includes("ETH") || asset.includes("SOL") || marketType === "crypto") {
      multiplier = 1;
    } else if (asset.includes("EUR") || asset.includes("GBP") || asset.includes("AUD") || asset.includes("JPY")) {
      multiplier = 100000;
    }

    const usdToIdr = settings.usdToIdr || 15500;

    // 1. Risk calculation
    let calculatedRiskIdr = 0;
    let riskPoints = 0;
    if (!isNaN(ent) && !isNaN(sl)) {
      riskPoints = direction === "buy" ? Math.max(0, ent - sl) : Math.max(0, sl - ent);
      calculatedRiskIdr = riskPoints * lot * multiplier * usdToIdr;
    }

    const finalRiskIdr = customRiskIdr ? parseNumberWithDots(customRiskIdr) : calculatedRiskIdr;
    const riskPercent = activeBalance > 0 ? (finalRiskIdr / activeBalance) * 100 : 0;

    // 2. Profit / Loss calculation (Only compute realized PnL if exit price is filled)
    let calculatedPnlIdr = 0;
    let autoResult: TradeResult = "open";

    if (!isNaN(ent) && !isNaN(exit)) {
      const priceDiff = direction === "buy" ? exit - ent : ent - exit;
      calculatedPnlIdr = priceDiff * lot * multiplier * usdToIdr;

      if (calculatedPnlIdr > 1000) {
        autoResult = "win";
      } else if (calculatedPnlIdr < -1000) {
        autoResult = "loss";
      } else {
        autoResult = "breakeven";
      }
    }

    let finalPnlIdr = calculatedPnlIdr;
    if (manualOverridePnl && customPnlIdr) {
      const num = parseNumberWithDots(customPnlIdr);
      finalPnlIdr = autoResult === "loss" ? -num : num;
    }

    const profitPercent = (activeBalance > 0 && !isNaN(exit)) ? (finalPnlIdr / activeBalance) * 100 : 0;

    // 3. RR Ratio
    let rr = 0;
    const targetPrice = !isNaN(exit) ? exit : !isNaN(tp) ? tp : NaN;
    if (!isNaN(ent) && !isNaN(sl) && riskPoints > 0) {
      const rewardPoints = !isNaN(targetPrice) 
        ? (direction === "buy" ? targetPrice - ent : ent - targetPrice)
        : 0;
      rr = rewardPoints / riskPoints;
    }

    return {
      riskIdr: Math.round(finalRiskIdr),
      riskPercent,
      pnlIdr: Math.round(finalPnlIdr),
      profitPercent,
      rr: isNaN(rr) ? 0 : Math.round(rr * 10) / 10,
      result: autoResult,
    };
  }, [
    entryPrice, 
    stopLoss, 
    takeProfit, 
    exitPrice, 
    lotSize, 
    direction, 
    asset, 
    marketType,
    customRiskIdr, 
    customPnlIdr, 
    manualOverridePnl, 
    settings.usdToIdr, 
    activeBalance
  ]);

  // Batas Kerugian Harian (Nominal IDR) berdasarkan akun yang dipilih
  const maxDailyLossIdr = selectedAccount === "demo"
    ? (settings.maxDailyLossIdrDemo ?? 200000)
    : (settings.maxDailyLossIdrReal ?? 100000);

  // Risk Limit Warning check (Nominal IDR)
  const isRiskExceeded = useMemo(() => {
    if (maxDailyLossIdr <= 0) return false;
    return calculations.riskIdr > maxDailyLossIdr;
  }, [calculations.riskIdr, maxDailyLossIdr]);

  // Consecutive Loss count for active account
  const consecutiveLossCount = useMemo(() => {
    const closed = trades
      .filter((t) => t.accountMode === selectedAccount && t.result !== "open")
      .sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());

    let count = 0;
    for (const t of closed) {
      if (t.result === "loss") {
        count++;
      } else {
        break;
      }
    }
    return count;
  }, [trades, selectedAccount]);

  const isConsecutiveLossExceeded = consecutiveLossCount >= (settings.stopAfterLosses || 2);

  // OCR Processing Function
  const processImageOcr = async (base64Data: string, mimeType = "image/png") => {
    setIsOcrScanning(true);
    setOcrResultMeta(null);
    setErrorMessage(null);

    try {
      const d = await analyzeScreenshot(base64Data, mimeType);
      const detected: string[] = [];

      // Auto-fill draft fields from OCR
      if (d.asset) {
        setAsset(d.asset);
        detected.push(`Pair: ${d.asset}`);
      }
      if (d.marketType) {
        setMarketType(d.marketType);
      } else if (d.asset && (d.asset.includes("BTC") || d.asset.includes("ETH") || d.asset.includes("USDT"))) {
        setMarketType("crypto");
      }
      if (d.direction && (d.direction === "buy" || d.direction === "sell")) {
        setDirection(d.direction);
        detected.push(`Arah: ${d.direction.toUpperCase()}`);
      }
      if (d.entryPrice !== null && d.entryPrice !== undefined) {
        setEntryPrice(d.entryPrice.toString());
        detected.push(`Entry: ${d.entryPrice}`);
      }
      if (d.stopLoss !== null && d.stopLoss !== undefined) {
        setStopLoss(d.stopLoss.toString());
        detected.push(`SL: ${d.stopLoss}`);
      }
      if (d.takeProfit !== null && d.takeProfit !== undefined) {
        setTakeProfit(d.takeProfit.toString());
        detected.push(`TP: ${d.takeProfit}`);
      }
      if (d.exitPrice !== null && d.exitPrice !== undefined) {
        setExitPrice(d.exitPrice.toString());
        detected.push(`Exit: ${d.exitPrice}`);
      }
      if (d.lot !== null && d.lot !== undefined) {
        setLotSize(d.lot.toString());
        detected.push(`Lot: ${d.lot}`);
      }
      if (d.date) {
        setTradeDate(d.date);
      }
      if (d.time) {
        setTradeTime(d.time);
      }

      setOcrResultMeta({
        success: true,
        confidence: d.confidence || "medium",
        platform: d.sourcePlatform || "Platform Trading",
        rawNotes: d.rawNotes || (detected.length > 0 ? "Parameter terdeteksi dan diisi ke formulir draf." : "Data angka belum terbaca lengkap. Silakan lengkapi manual."),
        detectedFields: detected,
      });

    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.error("[OCR Client] OCR request failed:", errMsg);
      setOcrResultMeta({
        success: false,
        rawNotes: errMsg.includes("Koneksi") || errMsg.includes("Server OCR") || errMsg.includes("413")
          ? `Gagal membaca screenshot (${errMsg}). Gambar tetap disimpan sebagai bukti; silakan lengkapi form manual.`
          : "Data trade belum terbaca otomatis dari gambar ini. Gambar tetap disimpan sebagai bukti chart; silakan lengkapi form manual.",
      });
    } finally {
      setIsOcrScanning(false);
    }
  };

  // Handle image upload from file picker or drop
  const handleImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMessage("File harus berupa gambar (PNG, JPG, WebP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      if (base64) {
        setScreenshotBase64(base64);
        await processImageOcr(base64, file.type);
      }
    };
    reader.onerror = () => {
      console.error("[OCR Client] OCR request failed: FileReader unable to read file");
      setErrorMessage("Gagal membaca file gambar.");
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  const toggleMistake = (m: MistakeType) => {
    if (selectedMistakes.includes(m)) {
      setSelectedMistakes(selectedMistakes.filter((item) => item !== m));
    } else {
      setSelectedMistakes([...selectedMistakes, m]);
    }
  };

  // Submit Trade with in-flight guard and non-blocking Storage upload
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // In-flight guard to prevent duplicate submission
    if (isSubmittingRef.current || isSubmitting) {
      return;
    }

    const entNum = parseFloat(entryPrice);
    if (isNaN(entNum)) {
      setErrorMessage("Harga Entry wajib diisi.");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const isClosed = !isNaN(parseFloat(exitPrice));
      const status = isClosed ? "closed" : "open";
      const stableTradeId = editId || generateId();

      const tradePayload = {
        id: stableTradeId,
        accountMode: selectedAccount,
        marketType,
        status,
        date: tradeDate,
        time: tradeTime,
        asset: asset as AssetType,
        tradingViewSymbol: asset.includes("BTC") ? "COINBASE:BTCUSD" : "OANDA:XAUUSD",
        direction,
        timeframe: "M15",

        // Sizing & Pricing
        entryPlan: entNum,
        slPlan: parseFloat(stopLoss) || undefined,
        tp1Plan: parseFloat(takeProfit) || undefined,
        actualEntry: entNum,
        actualExit: isClosed ? parseFloat(exitPrice) : undefined,
        actualSL: parseFloat(stopLoss) || undefined,
        actualTP: parseFloat(takeProfit) || undefined,
        lot: parseFloat(lotSize) || 0.1,
        riskIdr: calculations.riskIdr,
        riskPercent: calculations.riskPercent,
        pnlIdr: isClosed ? calculations.pnlIdr : 0,
        pnlPercent: isClosed ? calculations.profitPercent : 0,
        rrPlanned: calculations.rr,
        rrRealized: isClosed ? calculations.rr : undefined,
        result: isClosed ? calculations.result : "open",

        // Unified Section: "Setup, Psikologi & Bukti Chart"
        setupType: setupTag,
        entryReason: tradeReason || strategyName,
        session,
        marketCondition,
        emotionBefore,
        confidenceLevel,
        disciplineStatus,
        mistakes: selectedMistakes,
        lessonLearned,
        screenshotProof: screenshotBase64 && !screenshotBase64.startsWith("data:") ? screenshotBase64 : undefined,
        screenshotProofNotes: screenshotNotes,
        ocrDetected: Boolean(ocrResultMeta?.success),
        ocrExtractedData: ocrResultMeta ? {
          confidence: ocrResultMeta.confidence,
          sourcePlatform: ocrResultMeta.platform,
          rawNotes: ocrResultMeta.rawNotes,
        } : undefined,

        // Linkage to AI Trading Desk Analysis (Phase 2 decision support linkage)
        setupAnalysisId: setupAnalysisId || undefined,
      };

      // 1. Persist core trade to Firestore & local state immediately
      if (editId) {
        await updateTrade(editId, tradePayload);
      } else {
        await addTrade(tradePayload);
      }

      // 2. Non-blocking Firebase Storage upload if screenshot provided
      if (screenshotBase64 && user && screenshotBase64.startsWith("data:")) {
        uploadScreenshotImage(user.uid, screenshotBase64)
          .then((downloadUrl) => {
            if (downloadUrl) {
              updateTrade(stableTradeId, {
                screenshotProof: downloadUrl,
                screenshotUrl: downloadUrl,
              }).catch(console.warn);
            }
          })
          .catch((uploadErr) => {
            console.warn("Storage upload skipped or timed out:", uploadErr);
          });
      }

      navigate("/journal");
    } catch (err: any) {
      console.error("Save trade error:", err);
      setErrorMessage(err?.message || "Gagal menyimpan trade.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors shadow-2xs cursor-pointer"
            aria-label="Kembali"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold font-display text-zinc-900 tracking-tight">
              {editId ? "Edit Trade" : "Tambah Trade Baru"}
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Catat eksekusi, kelola risiko, dan evaluasi psikologi trading secara presisi.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Start Option: Manual vs Screenshot */}
          <div className="flex items-center p-1 bg-zinc-100 border border-zinc-200 rounded-xl">
            <button
              type="button"
              onClick={() => setStartOption("manual")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                startOption === "manual"
                  ? "bg-white text-zinc-900 shadow-2xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <PenTool className="w-3.5 h-3.5 text-zinc-600" />
              <span>Isi Manual</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStartOption("screenshot");
                fileInputRef.current?.click();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                startOption === "screenshot"
                  ? "bg-white text-amber-700 shadow-2xs"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Upload Screenshot</span>
            </button>
          </div>

          {/* Demo / Real Switch */}
          <div className="flex items-center p-1 bg-zinc-100 border border-zinc-200 rounded-xl select-none">
            <button
              type="button"
              onClick={() => setSelectedAccount("demo")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedAccount === "demo"
                  ? "bg-white text-zinc-900 shadow-2xs border border-zinc-200/60"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${selectedAccount === "demo" ? "bg-blue-500" : "bg-zinc-300"}`} />
              <span className="hidden xs:inline">Demo Account</span>
              <span className="xs:hidden">Demo</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedAccount("real")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedAccount === "real"
                  ? "bg-white text-zinc-900 shadow-2xs border border-zinc-200/60"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${selectedAccount === "real" ? "bg-emerald-500" : "bg-zinc-300"}`} />
              <span className="hidden xs:inline">Real Account</span>
              <span className="xs:hidden">Real</span>
            </button>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Warnings (Discipline & Risk - Driven by Settings) */}
      {isRiskExceeded && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-3 animate-in fade-in">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-bold text-rose-950">
              Peringatan Risiko: Potensi Risiko Melebihi Batas Harian ({formatIDR(maxDailyLossIdr)})
            </h4>
            <p className="text-rose-800">
              Risiko trade ini dihitung sebesar {formatIDR(calculations.riskIdr)} ({calculations.riskPercent.toFixed(1)}%), melewati batas toleransi kerugian harian Anda untuk akun {selectedAccount.toUpperCase()} ({formatIDR(maxDailyLossIdr)}). Pertimbangkan memperkecil lot atau mempersempit jarak Stop Loss.
            </p>
          </div>
        </div>
      )}

      {isConsecutiveLossExceeded && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-bold text-amber-950">
              Peringatan Disiplin & Psikologi: {consecutiveLossCount} Loss Berturut-turut
            </h4>
            <p className="text-amber-800">
              Anda telah mengalami {consecutiveLossCount} loss berturut-turut pada akun {selectedAccount} (batas aturan: {settings.stopAfterLosses}). Disarankan untuk tidak memaksakan trade (hindari revenge trading).
            </p>
          </div>
        </div>
      )}

      {/* AUTO OCR SCANNER BANNER / DROPZONE */}
      <div 
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="clean-card p-5 border-dashed border-2 border-zinc-300 hover:border-zinc-400 transition-all bg-linear-to-b from-zinc-50/70 to-white"
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-900">Auto-Read Screenshot Trade (AI OCR)</h3>
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Smart Draft
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5 max-w-xl leading-relaxed">
                Tarik & lepas screenshot chart atau order ticket (MT4/5, TradingView, Binance). AI akan membaca pair, arah, entry, SL, TP, dan mengisi draf formulir untuk Anda periksa.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleImageFile(e.target.files[0]);
                }
                e.target.value = "";
              }}
            />
            <button
              type="button"
              id="btn-upload-ocr"
              onClick={() => fileInputRef.current?.click()}
              disabled={isOcrScanning}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isOcrScanning ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Membaca Gambar...</span>
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Screenshot</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* OCR Feedback Badge */}
        {ocrResultMeta && (
          <div className={`mt-4 p-3.5 rounded-xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            ocrResultMeta.success 
              ? "bg-emerald-50/70 border-emerald-200 text-emerald-900" 
              : "bg-amber-50/70 border-amber-200 text-amber-900"
          }`}>
            <div className="flex items-start gap-2.5">
              {ocrResultMeta.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold flex items-center gap-2">
                  <span>{ocrResultMeta.success ? "Hasil Pembacaan Screenshot:" : "Informasi Pembacaan:"}</span>
                  {ocrResultMeta.platform && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white border border-emerald-200 text-emerald-700 font-mono">
                      {ocrResultMeta.platform}
                    </span>
                  )}
                  {ocrResultMeta.confidence && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white border border-emerald-200 text-zinc-600">
                      Keyakinan: {ocrResultMeta.confidence === "high" ? "Tinggi" : ocrResultMeta.confidence === "medium" ? "Sedang" : "Perlu Koreksi"}
                    </span>
                  )}
                </div>
                <p className="text-[11px] opacity-90 mt-0.5">{ocrResultMeta.rawNotes}</p>
              </div>
            </div>
            {ocrResultMeta.detectedFields && ocrResultMeta.detectedFields.length > 0 && (
              <div className="flex flex-wrap gap-1 text-[10px] font-mono">
                {ocrResultMeta.detectedFields.map((f, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-md bg-white/80 border border-emerald-300 text-emerald-800">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: CORE TRADE PARAMETERS */}
        <div className="clean-card p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <span>Parameter Utama Eksekusi</span>
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMarketType("forex")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  marketType === "forex" 
                    ? "bg-zinc-900 text-white" 
                    : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Forex / Gold
              </button>
              <button
                type="button"
                onClick={() => setMarketType("crypto")}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  marketType === "crypto" 
                    ? "bg-zinc-900 text-white" 
                    : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Crypto
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Asset / Pair */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">Pair / Asset</label>
              <input
                type="text"
                id="input-trade-asset"
                value={asset}
                onChange={(e) => setAsset(e.target.value.toUpperCase())}
                placeholder="XAU/USD, BTC/USDT..."
                className="clean-input w-full px-3.5 py-2.5 text-sm font-semibold uppercase"
                required
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {(marketType === "forex" ? forexPairs : cryptoPairs).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAsset(p)}
                    className={`text-[10px] px-2 py-0.5 rounded-md border font-medium cursor-pointer transition-colors ${
                      asset === p 
                        ? "bg-zinc-900 text-white border-zinc-900" 
                        : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Direction */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">Posisi / Arah</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  id="btn-direction-buy"
                  onClick={() => setDirection("buy")}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                    direction === "buy"
                      ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                      : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  <TrendingUp className="w-4 h-4" /> BUY
                </button>
                <button
                  type="button"
                  id="btn-direction-sell"
                  onClick={() => setDirection("sell")}
                  className={`py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                    direction === "sell"
                      ? "bg-rose-600 border-rose-600 text-white shadow-xs"
                      : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  <TrendingDown className="w-4 h-4" /> SELL
                </button>
              </div>
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-zinc-400" /> Tanggal Eksekusi
              </label>
              <input
                type="date"
                id="input-trade-date"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
                className="clean-input w-full px-3.5 py-2.5 text-sm"
                required
              />
            </div>

            {/* Time */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-zinc-400" /> Waktu (Jam:Menit)
              </label>
              <input
                type="time"
                id="input-trade-time"
                value={tradeTime}
                onChange={(e) => setTradeTime(e.target.value)}
                className="clean-input w-full px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">Entry Price *</label>
              <input
                type="number"
                step="any"
                id="input-entry-price"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="cth: 2650.50"
                className="clean-input w-full px-3 py-2 text-sm font-mono"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-rose-600">Stop Loss (SL)</label>
              <input
                type="number"
                step="any"
                id="input-stop-loss"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="cth: 2642.00"
                className="clean-input w-full px-3 py-2 text-sm font-mono border-rose-200 focus:border-rose-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-emerald-600">Take Profit (TP)</label>
              <input
                type="number"
                step="any"
                id="input-take-profit"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="cth: 2670.00"
                className="clean-input w-full px-3 py-2 text-sm font-mono border-emerald-200 focus:border-emerald-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">Exit Price (Close)</label>
              <input
                type="number"
                step="any"
                id="input-exit-price"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                placeholder="Kosong = Open"
                className="clean-input w-full px-3 py-2 text-sm font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-600">Lot / Sizing</label>
              <input
                type="number"
                step="any"
                id="input-lot-size"
                value={lotSize}
                onChange={(e) => setLotSize(e.target.value)}
                placeholder="0.10"
                className="clean-input w-full px-3 py-2 text-sm font-mono font-semibold"
                required
              />
            </div>
          </div>

          {/* Real-time Math Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 bg-zinc-50/80 p-3.5 rounded-xl border border-zinc-200/70">
            {/* Risk Box */}
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                Risiko Terkalkulasi (SL)
              </span>
              <div className="text-sm font-bold font-mono text-rose-600">
                {formatIDR(calculations.riskIdr)}
                <span className="text-xs text-zinc-500 font-normal ml-1">
                  ({formatPercent(calculations.riskPercent, false)})
                </span>
              </div>
            </div>

            {/* Profit/Loss Box */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Hasil P/L Terhitung
                </span>
                <button
                  type="button"
                  onClick={() => setManualOverridePnl(!manualOverridePnl)}
                  className="text-[10px] text-zinc-500 underline hover:text-zinc-800"
                >
                  {manualOverridePnl ? "Gunakan Auto" : "Manual Input"}
                </button>
              </div>

              {manualOverridePnl ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-mono font-bold text-zinc-500">Rp</span>
                  <input
                    type="text"
                    value={customPnlIdr}
                    onChange={(e) => setCustomPnlIdr(formatNumberWithDots(e.target.value))}
                    placeholder="100.000"
                    className="clean-input py-1 px-2 text-xs font-mono w-full"
                  />
                </div>
              ) : (
                <div className={`text-sm font-bold font-mono ${
                  calculations.pnlIdr > 0 ? "text-emerald-600" : calculations.pnlIdr < 0 ? "text-rose-600" : "text-zinc-600"
                }`}>
                  {formatProfitDual(calculations.pnlIdr, calculations.profitPercent)}
                </div>
              )}
            </div>

            {/* RR Box */}
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                Risk-to-Reward (R:R)
              </span>
              <div className="text-sm font-bold font-mono text-zinc-800">
                1 : {calculations.rr > 0 ? calculations.rr : "-"}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: UNIFIED "SETUP, PSIKOLOGI & BUKTI CHART" */}
        <div className="clean-card p-6 space-y-6">
          <div className="border-b border-zinc-100 pb-3">
            <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-zinc-700" />
              <span>Setup, Psikologi & Bukti Chart</span>
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Evaluasi setup teknikal, kejernihan psikologis, serta arsipkan bukti chart trading dalam satu tempat.
            </p>
          </div>

          {/* PART A: SETUP TEKNIKAL */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              A. Setup & Rencana Teknikal
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Setup Tag */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700">Setup Tag / Konfirmasi</label>
                <select
                  value={setupTag}
                  onChange={(e) => setSetupTag(e.target.value)}
                  className="clean-input w-full px-3 py-2 text-xs"
                >
                  <option value="Breakout & Retest">Breakout & Retest</option>
                  <option value="Order Block / Supply-Demand">Order Block / Supply-Demand</option>
                  <option value="Liquidity Sweep / Fakeout">Liquidity Sweep / Fakeout</option>
                  <option value="Trend Continuation">Trend Continuation</option>
                  <option value="Double Top/Bottom Reversal">Double Top/Bottom Reversal</option>
                  <option value="EMA Pullback / Confluence">EMA Pullback / Confluence</option>
                  <option value="News Momentum">News Momentum</option>
                  <option value="Support & Resistance Bounce">Support & Resistance Bounce</option>
                  <option value="Lainnya">Lainnya</option>
                </select>
              </div>

              {/* Trading Session */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700">Sesi Pasar</label>
                <select
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                  className="clean-input w-full px-3 py-2 text-xs"
                >
                  <option value="Asia">Asia (Tokyo / Sydney)</option>
                  <option value="London">London (Eropa)</option>
                  <option value="New York">New York (Amerika)</option>
                  <option value="Overlap London-NY">Overlap London - NY</option>
                  <option value="24/7 Crypto">24/7 Crypto Session</option>
                </select>
              </div>

              {/* Market Condition */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700">Kondisi Pasar</label>
                <select
                  value={marketCondition}
                  onChange={(e) => setMarketCondition(e.target.value)}
                  className="clean-input w-full px-3 py-2 text-xs"
                >
                  <option value="Trending">Trending Kuat</option>
                  <option value="Ranging">Ranging / Sideways</option>
                  <option value="Breakout">Breakout Konsolidasi</option>
                  <option value="Reversal">Reversal di Area Kunci</option>
                  <option value="High Volatility">Volatilitas Tinggi (News/Spike)</option>
                </select>
              </div>
            </div>

            {/* Trade Reason */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-700">Alasan Masuk Posisi (Trade Reason)</label>
              <textarea
                value={tradeReason}
                onChange={(e) => setTradeReason(e.target.value)}
                placeholder="Mengapa Anda mengambil posisi ini? (cth: Rejection di H4 Order Block setelah liquidity grab, RSI divergence di M15...)"
                rows={2}
                className="clean-input w-full p-3 text-xs leading-relaxed"
              />
            </div>
          </div>

          {/* PART B: PSIKOLOGI & KEDISIPLINAN */}
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              B. Psikologi & Status Disiplin
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Emosi */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700">Kondisi Emosi Saat Entry</label>
                <select
                  value={emotionBefore}
                  onChange={(e) => setEmotionBefore(e.target.value)}
                  className="clean-input w-full px-3 py-2 text-xs"
                >
                  <option value="Calm">Tenang & Fokus (Calm)</option>
                  <option value="Confident">Percaya Diri (Confident)</option>
                  <option value="Doubtful">Ragu-ragu (Doubtful)</option>
                  <option value="FOMO">FOMO / Takut Ketinggalan</option>
                  <option value="Revenge">Balas Dendam (Revenge)</option>
                  <option value="Afraid">Takut Rugi (Afraid)</option>
                  <option value="Tired">Lelah / Tidak Fokus</option>
                  <option value="Forced Entry">Memaksakan Entry</option>
                </select>
              </div>

              {/* Keyakinan */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700">Tingkat Keyakinan (Confidence)</label>
                <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                  {(["Low", "Medium", "High"] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setConfidenceLevel(lvl)}
                      className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                        confidenceLevel === lvl 
                          ? "bg-zinc-900 text-white border-zinc-900 shadow-2xs" 
                          : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Disiplin */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-700">Status Disiplin Eksekusi</label>
                <select
                  value={disciplineStatus}
                  onChange={(e) => setDisciplineStatus(e.target.value as any)}
                  className="clean-input w-full px-3 py-2 text-xs"
                >
                  <option value="Disciplined">Disiplin Penuh Sesuai Plan</option>
                  <option value="Minor Slip">Sedikit Melanggar / Kurang Sabar</option>
                  <option value="Violated Rules">Melanggar Rule Berat</option>
                </select>
              </div>
            </div>

            {/* Checklist Kesalahan */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-medium text-zinc-700">
                Catatan Kesalahan yang Terjadi (Klik jika ada):
              </label>
              <div className="flex flex-wrap gap-1.5">
                {commonMistakes.map((m) => {
                  const isSelected = selectedMistakes.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMistake(m)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-rose-50 border-rose-300 text-rose-700 font-semibold shadow-2xs"
                          : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-300"
                      }`}
                    >
                      {isSelected ? `✕ ${m}` : `+ ${m}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pelajaran yang dipetik */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-700">Pelajaran yang Didapat (Lesson Learned)</label>
              <textarea
                value={lessonLearned}
                onChange={(e) => setLessonLearned(e.target.value)}
                placeholder="Apa yang bisa diperbaiki dari trade ini ke depannya? (cth: Tunggu candle closed di M15, jangan geser SL sembarangan...)"
                rows={2}
                className="clean-input w-full p-3 text-xs leading-relaxed"
              />
            </div>
          </div>

          {/* PART C: BUKTI CHART & SCREENSHOT */}
          <div className="space-y-3 pt-2 border-t border-zinc-100">
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              C. Bukti Chart & Screenshot
            </h3>

            {screenshotBase64 ? (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden border border-zinc-200 max-h-80 bg-zinc-900/5 flex items-center justify-center">
                  <img
                    src={screenshotBase64}
                    alt="Screenshot Proof"
                    className="w-full object-contain max-h-80"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setScreenshotBase64("");
                      setOcrResultMeta(null);
                    }}
                    className="absolute top-3 right-3 p-1.5 rounded-lg bg-zinc-900/80 text-white hover:bg-zinc-900 transition-colors shadow-sm cursor-pointer"
                    title="Hapus Screenshot"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-700">Catatan Bukti Chart (Opsional)</label>
                  <input
                    type="text"
                    value={screenshotNotes}
                    onChange={(e) => setScreenshotNotes(e.target.value)}
                    placeholder="cth: Gambar chart timeframe H1 saat entry trigger terbentuk"
                    className="clean-input w-full px-3 py-2 text-xs"
                  />
                </div>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="p-6 rounded-xl border border-dashed border-zinc-300 hover:border-zinc-400 bg-zinc-50/50 hover:bg-zinc-50 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <FileImage className="w-8 h-8 text-zinc-400" />
                <span className="text-xs font-semibold text-zinc-700">Upload Screenshot Chart</span>
                <span className="text-[11px] text-zinc-500">Klik untuk memilih file atau paste gambar</span>
              </div>
            )}
          </div>
        </div>

        {/* SUBMIT BUTTON */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-5 py-2.5 rounded-xl border border-zinc-200 text-zinc-700 text-sm font-semibold hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            id="btn-submit-trade"
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Menyimpan...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{editId ? "Perbarui Trade" : "Simpan Trade ke Jurnal"}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
