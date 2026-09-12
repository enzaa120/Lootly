import React, { useState, useRef, useMemo } from "react";
import { useAppStore } from "../../store/AppContext";
import { analyzeScreenshot, ExtractedTradeData } from "../../lib/ocrService";
import { formatIDR, formatPercent, formatProfitDual, formatNumberWithDots } from "../../lib/utils";
import { uploadScreenshotImage } from "../../lib/firebase";
import { Trade, AssetType, TradeDirection, TradeResult, MarketType } from "../../types";
import { 
  X, 
  Upload, 
  Sparkles, 
  Check, 
  AlertTriangle, 
  HelpCircle, 
  CheckCircle2, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Clock, 
  Scale, 
  Layers, 
  ShieldAlert,
  ArrowRight
} from "lucide-react";

interface ScreenshotOcrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (tradeId: string) => void;
}

export function ScreenshotOcrModal({ isOpen, onClose, onSaved }: ScreenshotOcrModalProps) {
  const { accountMode, settings, trades, addTrade, updateTrade, user } = useAppStore();

  // Step in modal: 'upload' | 'scanning' | 'review' | 'success'
  const [step, setStep] = useState<"upload" | "scanning" | "review">("upload");
  const [imagePreview, setImagePreview] = useState<string>("");
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extracted metadata
  const [ocrMeta, setOcrMeta] = useState<ExtractedTradeData | null>(null);

  // Draft form states
  const [selectedAccount, setSelectedAccount] = useState<"demo" | "real">(accountMode);
  const [marketType, setMarketType] = useState<MarketType>("forex");
  const [asset, setAsset] = useState<string>("XAU/USD");
  const [direction, setDirection] = useState<TradeDirection>("buy");
  const [tradeDate, setTradeDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [tradeTime, setTradeTime] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  const [entryPrice, setEntryPrice] = useState<string>("");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");
  const [exitPrice, setExitPrice] = useState<string>("");
  const [lotSize, setLotSize] = useState<string>("0.1");
  const [setupTag, setSetupTag] = useState<string>("Breakout & Retest");
  const [tradeReason, setTradeReason] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active balance for risk & profit calculations
  const activeBalance = selectedAccount === "demo" 
    ? settings.startingBalanceDemo 
    : settings.startingBalanceReal;

  // Real-time calculations
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

    const riskPercent = activeBalance > 0 ? (calculatedRiskIdr / activeBalance) * 100 : 0;

    // 2. Profit / Loss calculation
    let calculatedPnlIdr = 0;
    let autoResult: TradeResult = "open";
    const targetPrice = !isNaN(exit) ? exit : !isNaN(tp) ? tp : NaN;

    if (!isNaN(ent) && !isNaN(targetPrice)) {
      const priceDiff = direction === "buy" ? targetPrice - ent : ent - targetPrice;
      calculatedPnlIdr = priceDiff * lot * multiplier * usdToIdr;

      if (calculatedPnlIdr > 1000) {
        autoResult = "win";
      } else if (calculatedPnlIdr < -1000) {
        autoResult = "loss";
      } else {
        autoResult = "breakeven";
      }
    }

    const profitPercent = activeBalance > 0 ? (calculatedPnlIdr / activeBalance) * 100 : 0;

    // 3. RR Ratio
    let rr = 0;
    if (!isNaN(ent) && !isNaN(sl) && riskPoints > 0) {
      const rewardPoints = !isNaN(targetPrice) 
        ? (direction === "buy" ? targetPrice - ent : ent - targetPrice)
        : 0;
      rr = rewardPoints / riskPoints;
    }

    return {
      riskIdr: Math.round(calculatedRiskIdr),
      riskPercent,
      pnlIdr: Math.round(calculatedPnlIdr),
      profitPercent,
      rr: isNaN(rr) ? 0 : Math.round(rr * 10) / 10,
      result: autoResult,
    };
  }, [entryPrice, stopLoss, takeProfit, exitPrice, lotSize, direction, asset, marketType, settings.usdToIdr, activeBalance]);

  // Daily loss limit for active account (IDR)
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

  if (!isOpen) return null;

  // Process image with OCR
  const handleProcessFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setErrorMessage("File harus berupa gambar (PNG, JPG, WebP).");
      return;
    }

    setErrorMessage(null);
    setIsScanning(true);
    setStep("scanning");

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setImagePreview(base64);

      try {
        const extracted = await analyzeScreenshot(base64, file.type);
        setOcrMeta(extracted);

        // Auto-fill draft fields from OCR
        if (extracted.asset) setAsset(extracted.asset);
        if (extracted.marketType) {
          setMarketType(extracted.marketType);
        } else if (extracted.asset && (extracted.asset.includes("BTC") || extracted.asset.includes("ETH") || extracted.asset.includes("USDT"))) {
          setMarketType("crypto");
        }
        if (extracted.direction && (extracted.direction === "buy" || extracted.direction === "sell")) {
          setDirection(extracted.direction);
        }
        if (extracted.entryPrice !== undefined && extracted.entryPrice !== null) {
          setEntryPrice(extracted.entryPrice.toString());
        }
        if (extracted.stopLoss !== undefined && extracted.stopLoss !== null) {
          setStopLoss(extracted.stopLoss.toString());
        }
        if (extracted.takeProfit !== undefined && extracted.takeProfit !== null) {
          setTakeProfit(extracted.takeProfit.toString());
        }
        if (extracted.exitPrice !== undefined && extracted.exitPrice !== null) {
          setExitPrice(extracted.exitPrice.toString());
        }
        if (extracted.lot !== undefined && extracted.lot !== null) {
          setLotSize(extracted.lot.toString());
        }
        if (extracted.date) setTradeDate(extracted.date);
        if (extracted.time) setTradeTime(extracted.time);

        setStep("review");
      } catch (err: any) {
        console.warn("OCR Error in modal:", err);
        setOcrMeta({
          confidence: "low",
          rawNotes: "Data angka belum terbaca otomatis. Gambar tetap disimpan sebagai bukti chart; silakan lengkapi manual.",
        });
        setStep("review");
      } finally {
        setIsScanning(false);
      }
    };
    reader.onerror = () => {
      setIsScanning(false);
      setErrorMessage("Gagal membaca berkas gambar.");
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleSaveDraft = async () => {
    const entNum = parseFloat(entryPrice);
    if (isNaN(entNum)) {
      setErrorMessage("Harga Entry wajib diisi sebelum menyimpan.");
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      // Check if position is active (open) or closed
      const isPositionOpen = Boolean(ocrMeta?.isPositionOpen) || !exitPrice || exitPrice.trim() === "";
      const exitNum = (!exitPrice || exitPrice.trim() === "") ? null : (parseFloat(exitPrice) || null);
      const slNum = (!stopLoss || stopLoss.trim() === "") ? null : (parseFloat(stopLoss) || null);
      const tpNum = (!takeProfit || takeProfit.trim() === "") ? null : (parseFloat(takeProfit) || null);
      const lotNum = parseFloat(lotSize) || 0.1;

      // STEP 1: Sanitize and construct trade payload
      // Strictly isolate to the account selected in "Simpan ke Akun" (Demo vs Real)
      const tradePayload: Omit<Trade, "id" | "createdAt" | "updatedAt"> = {
        accountMode: selectedAccount,
        marketType,
        status: isPositionOpen ? "open" : "closed",
        date: tradeDate,
        time: tradeTime,
        asset: asset as AssetType,
        tradingViewSymbol: asset.includes("BTC") ? "COINBASE:BTCUSD" : "OANDA:XAUUSD",
        direction,
        timeframe: "M15",

        // Sizing & Pricing
        entryPlan: entNum,
        slPlan: slNum ?? undefined,
        tp1Plan: tpNum ?? undefined,
        actualEntry: entNum,
        actualExit: exitNum ?? undefined,
        actualSL: slNum ?? undefined,
        actualTP: tpNum ?? undefined,
        lot: lotNum,
        riskIdr: calculations.riskIdr || 0,
        riskPercent: calculations.riskPercent || 0,
        // Open trade handling: Realized PnL must not be invented for open trades
        pnlIdr: isPositionOpen ? 0 : (calculations.pnlIdr || 0),
        pnlPercent: isPositionOpen ? 0 : (calculations.profitPercent || 0),
        rrPlanned: calculations.rr || 0,
        rrRealized: isPositionOpen ? undefined : (calculations.rr || 0),
        result: isPositionOpen ? "open" : calculations.result,

        // Schema aliases ensuring all fields are Firestore-safe
        pair: asset,
        accountType: selectedAccount,
        entry: entNum,
        stopLoss: slNum,
        takeProfit: tpNum,
        exitPrice: exitNum,
        lotSize: lotNum,
        notes: tradeReason || (ocrMeta?.sourcePlatform ? `Auto OCR dari ${ocrMeta.sourcePlatform}` : "Auto OCR Screenshot"),

        // Context & Psychology
        setupType: setupTag || "Price Action",
        setup: setupTag || "Price Action",
        entryReason: tradeReason || (ocrMeta?.sourcePlatform ? `Auto OCR dari ${ocrMeta.sourcePlatform}` : "Auto OCR Screenshot"),
        session: "London",
        marketCondition: "Trending",
        emotionBefore: "Calm",
        confidenceLevel: "Medium",
        disciplineStatus: isRiskExceeded ? "Minor Slip" : "Disciplined",
        mistakes: isRiskExceeded ? ["Oversized Lot"] : [],
        lessonLearned: "",

        // Screenshot kept in local state; Firestore layer safely strips oversized raw base64
        screenshotProof: imagePreview || "",
        screenshotUrl: null,
        storagePath: null,
        screenshotProofNotes: `Diekstraksi dari screenshot ${ocrMeta?.sourcePlatform || "platform"}`,
        ocrDetected: true,
        ocrExtractedData: {
          confidence: ocrMeta?.confidence || "medium",
          sourcePlatform: ocrMeta?.sourcePlatform || "Trading Platform",
          rawNotes: ocrMeta?.rawNotes || "",
        },
      };

      // STEP 2 & 3: Write trade to Firestore and update local state FIRST
      const newId = await addTrade(tradePayload);
      if (onSaved) onSaved(newId);

      // STEP 4 & 5: Attempt screenshot upload as non-blocking enhancement in background
      if (imagePreview && user && imagePreview.startsWith("data:")) {
        uploadScreenshotImage(user.uid, imagePreview)
          .then((downloadUrl) => {
            if (downloadUrl && downloadUrl.startsWith("http")) {
              updateTrade(newId, {
                screenshotProof: downloadUrl,
                screenshotUrl: downloadUrl,
              });
            }
          })
          .catch((uploadErr) => {
            console.warn("Optional screenshot upload skipped/failed:", uploadErr);
          });
      }

      // STEP 6: Close modal on successful save
      handleClose();
    } catch (err: any) {
      console.error("Save trade error:", err);
      // Keep draft data in form, display helpful message
      setErrorMessage(err?.message || "Gagal menyimpan trade. Silakan coba lagi.");
    } finally {
      // STEP 7: Reset isSaving in finally - NEVER leave UI stuck
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setStep("upload");
    setImagePreview("");
    setOcrMeta(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white border border-zinc-200 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-zinc-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-zinc-900 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900 font-display">
                {step === "review" ? "Periksa Draf Trade (AI OCR)" : "Upload Screenshot Trade"}
              </h2>
              <p className="text-[11px] text-zinc-500">
                {step === "review" 
                  ? "Verifikasi data hasil pembacaan sebelum disimpan ke jurnal & cloud." 
                  : "Membaca order tiket atau chart dari MT4/5, TradingView, Binance secara otomatis."}
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: UPLOAD / DRAG & DROP */}
          {step === "upload" && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-300 hover:border-zinc-400 rounded-2xl p-8 text-center cursor-pointer transition-all bg-zinc-50/50 hover:bg-zinc-50 flex flex-col items-center justify-center gap-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleProcessFile(e.target.files[0]);
                  }
                }}
              />
              <div className="w-14 h-14 rounded-2xl bg-white border border-zinc-200 shadow-xs flex items-center justify-center text-zinc-700">
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <span className="text-sm font-bold text-zinc-900 block">
                  Tarik & lepas screenshot trade di sini
                </span>
                <span className="text-xs text-zinc-500 mt-0.5 block">
                  atau klik untuk memilih file gambar (PNG, JPG, WebP)
                </span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200">
                  MetaTrader 4/5
                </span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200">
                  TradingView
                </span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200">
                  Crypto Exchanges
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: SCANNING ANIMATION */}
          {step === "scanning" && (
            <div className="py-12 text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="w-16 h-16 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-lg animate-pulse">
                  <Sparkles className="w-8 h-8 text-amber-300 animate-spin" />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Menganalisis Screenshot dengan AI OCR...</h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                  Mendeteksi pair, arah posisi (Buy/Sell), level entry, stop loss, take profit, dan lot size.
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW TRADE DRAFT */}
          {step === "review" && (
            <div className="space-y-5">
              {/* Account Mode Switcher for this Draft */}
              <div className="flex items-center justify-between bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/80">
                <span className="text-xs font-semibold text-zinc-700">Simpan ke Akun:</span>
                <div className="flex items-center p-0.5 bg-zinc-200/60 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setSelectedAccount("demo")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      selectedAccount === "demo"
                        ? "bg-white text-blue-700 shadow-2xs"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    Demo (Rp {formatNumberWithDots(settings.startingBalanceDemo)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedAccount("real")}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      selectedAccount === "real"
                        ? "bg-white text-emerald-700 shadow-2xs"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    Real (Rp {formatNumberWithDots(settings.startingBalanceReal)})
                  </button>
                </div>
              </div>

              {/* Confidence & Detection Banner */}
              <div className={`p-3.5 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                ocrMeta?.confidence === "high" || ocrMeta?.confidence === "medium"
                  ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                  : "bg-amber-50/70 border-amber-200 text-amber-950"
              }`}>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold flex items-center gap-2">
                      <span>Draf Terbaca ({ocrMeta?.sourcePlatform || "Trading Platform"})</span>
                      {ocrMeta?.confidence && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-white border border-emerald-300 text-emerald-800 font-mono">
                          Keyakinan: {ocrMeta.confidence === "high" ? "Tinggi" : ocrMeta.confidence === "medium" ? "Sedang" : "Perlu Konfirmasi"}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] opacity-90 mt-0.5">
                      {ocrMeta?.rawNotes || "Silakan tinjau dan sesuaikan nilai sebelum menyimpan ke jurnal."}
                    </p>
                  </div>
                </div>
                {imagePreview && (
                  <div className="w-12 h-12 rounded-lg border border-zinc-200 overflow-hidden shrink-0 bg-zinc-100">
                    <img src={imagePreview} alt="Thumb" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* Warnings (Discipline & Risk) */}
              {isRiskExceeded && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>
                    <strong>Peringatan Risiko:</strong> Potensi risiko trade ini ({formatIDR(calculations.riskIdr)} / {calculations.riskPercent.toFixed(1)}%) melebihi batas kerugian harian Anda ({formatIDR(maxDailyLossIdr)}).
                  </span>
                </div>
              )}

              {isConsecutiveLossExceeded && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                  <span>
                    <strong>Peringatan Disiplin:</strong> Anda telah mengalami {consecutiveLossCount} loss berturut-turut (batas disiplin: {settings.stopAfterLosses}). Pertimbangkan berhenti trading sejenak.
                  </span>
                </div>
              )}

              {/* Open vs Closed Position Notification */}
              <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                !exitPrice || exitPrice.trim() === ""
                  ? "bg-blue-50/70 border-blue-200 text-blue-900"
                  : "bg-zinc-50 border-zinc-200 text-zinc-800"
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${!exitPrice || exitPrice.trim() === "" ? "bg-blue-600 animate-pulse" : "bg-zinc-400"}`} />
                  <span className="font-medium">
                    Status Trade: <strong>{!exitPrice || exitPrice.trim() === "" ? "Posisi Aktif (Open)" : "Posisi Selesai (Closed)"}</strong>
                  </span>
                </div>
                <span className="text-[11px] text-zinc-500">
                  {!exitPrice || exitPrice.trim() === "" ? "Exit price kosong = posisi dicatat sebagai running trade" : "Exit price terisi = PnL dihitung"}
                </span>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Pair */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-700">Pair / Asset</label>
                    {ocrMeta?.fieldConfidence?.asset === "detected" || (asset && ocrMeta?.detectedFields?.includes("Pair / Aset")) ? (
                      <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> Terdeteksi
                      </span>
                    ) : ocrMeta?.fieldConfidence?.asset === "confirm" ? (
                      <span className="text-[10px] text-amber-600 font-medium">Perlu Dikonfirmasi</span>
                    ) : (
                      <span className="text-[10px] text-zinc-400 font-medium">Manual</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={asset}
                    onChange={(e) => setAsset(e.target.value.toUpperCase())}
                    className="clean-input w-full px-3 py-2 text-xs font-bold uppercase font-mono"
                    required
                  />
                </div>

                {/* Direction */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-700">Arah Posisi</label>
                    {ocrMeta?.fieldConfidence?.direction === "detected" || ocrMeta?.direction ? (
                      <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> Terdeteksi ({direction.toUpperCase()})
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-medium">Perlu Dikonfirmasi</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDirection("buy")}
                      className={`py-1.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer border ${
                        direction === "buy"
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-2xs"
                          : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                      }`}
                    >
                      <TrendingUp className="w-3.5 h-3.5" /> BUY
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirection("sell")}
                      className={`py-1.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1 transition-all cursor-pointer border ${
                        direction === "sell"
                          ? "bg-rose-600 border-rose-600 text-white shadow-2xs"
                          : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
                      }`}
                    >
                      <TrendingDown className="w-3.5 h-3.5" /> SELL
                    </button>
                  </div>
                </div>

                {/* Entry Price */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-700">Entry Price *</label>
                    {ocrMeta?.fieldConfidence?.entryPrice === "detected" ? (
                      <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> Terdeteksi
                      </span>
                    ) : entryPrice ? (
                      <span className="text-[10px] text-amber-600 font-medium">Perlu Dikonfirmasi</span>
                    ) : (
                      <span className="text-[10px] text-rose-500 font-medium">Wajib Diisi</span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    placeholder="cth: 2650.50"
                    className="clean-input w-full px-3 py-2 text-xs font-mono font-bold"
                    required
                  />
                </div>

                {/* Lot Size */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-700">Ukuran Lot / Sizing</label>
                    {ocrMeta?.fieldConfidence?.lot === "detected" ? (
                      <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> Terdeteksi
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-400 font-mono">Forex / Coin</span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={lotSize}
                    onChange={(e) => setLotSize(e.target.value)}
                    placeholder="0.10"
                    className="clean-input w-full px-3 py-2 text-xs font-mono font-bold"
                    required
                  />
                </div>

                {/* Stop Loss */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-rose-600">Stop Loss (SL)</label>
                    {ocrMeta?.fieldConfidence?.stopLoss === "detected" ? (
                      <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> Terdeteksi
                      </span>
                    ) : stopLoss ? (
                      <span className="text-[10px] text-amber-600 font-medium">Perlu Dikonfirmasi</span>
                    ) : (
                      <span className="text-[10px] text-zinc-400">Tidak Terbaca / Belum Ada</span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    placeholder="cth: 2642.00"
                    className="clean-input w-full px-3 py-2 text-xs font-mono border-rose-200"
                  />
                </div>

                {/* Take Profit */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-emerald-600">Take Profit (TP)</label>
                    {ocrMeta?.fieldConfidence?.takeProfit === "detected" ? (
                      <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> Terdeteksi
                      </span>
                    ) : takeProfit ? (
                      <span className="text-[10px] text-amber-600 font-medium">Perlu Dikonfirmasi</span>
                    ) : (
                      <span className="text-[10px] text-zinc-400">Tidak Terbaca / Belum Ada</span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                    placeholder="cth: 2670.00"
                    className="clean-input w-full px-3 py-2 text-xs font-mono border-emerald-200"
                  />
                </div>

                {/* Exit Price */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-700">Exit / Close Price</label>
                    {ocrMeta?.fieldConfidence?.exitPrice === "detected" && exitPrice ? (
                      <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> Closed ({exitPrice})
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-400">Kosongkan jika posisi masih open</span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    placeholder="Kosongkan jika posisi masih berjalan"
                    className="clean-input w-full px-3 py-2 text-xs font-mono"
                  />
                </div>

                {/* Date & Time */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-700">Tanggal</label>
                    <input
                      type="date"
                      value={tradeDate}
                      onChange={(e) => setTradeDate(e.target.value)}
                      className="clean-input w-full px-2 py-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-700">Waktu</label>
                    <input
                      type="time"
                      value={tradeTime}
                      onChange={(e) => setTradeTime(e.target.value)}
                      className="clean-input w-full px-2 py-2 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Real-time Math Summary Cards */}
              <div className="grid grid-cols-3 gap-2.5 bg-zinc-50 p-3 rounded-xl border border-zinc-200/80 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-zinc-500 font-sans uppercase font-semibold block">Risiko (SL)</span>
                  <span className="font-bold text-rose-600">{formatIDR(calculations.riskIdr)}</span>
                  <span className="text-[10px] text-zinc-400 block">({calculations.riskPercent.toFixed(1)}%)</span>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 font-sans uppercase font-semibold block">Hasil P/L</span>
                  {!exitPrice || exitPrice.trim() === "" ? (
                    <span className="font-bold text-blue-600">Posisi Berjalan</span>
                  ) : (
                    <span className={`font-bold ${calculations.pnlIdr > 0 ? "text-emerald-600" : calculations.pnlIdr < 0 ? "text-rose-600" : "text-zinc-600"}`}>
                      {formatProfitDual(calculations.pnlIdr, calculations.profitPercent)}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-zinc-500 font-sans uppercase font-semibold block">Risk/Reward</span>
                  <span className="font-bold text-zinc-800">
                    {!exitPrice || exitPrice.trim() === "" ? (
                      calculations.rr > 0 ? `1:${calculations.rr} (Plan)` : "-"
                    ) : (
                      `1:${calculations.rr > 0 ? calculations.rr : "-"}`
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-between shrink-0 bg-zinc-50/50">
          {step === "review" ? (
            <>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="text-xs font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer"
              >
                Ganti Screenshot
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Simpan Trade ke Jurnal</span>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
