import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppContext";
import { formatIDR, formatPercent, formatProfitDual } from "../lib/utils";
import { 
  ArrowLeft, 
  Trash2, 
  Pencil, 
  Copy, 
  TrendingUp, 
  TrendingDown, 
  AlertCircle,
  Calendar,
  Clock,
  Camera,
  Layers,
  Sparkles,
  Brain,
  ShieldCheck,
  CheckCircle2,
  FileText,
  AlertTriangle
} from "lucide-react";

export function TradeDetail() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const navigate = useNavigate();
  const { trades, deleteTrade, addTrade } = useAppStore();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const trade = trades.find((t) => t.id === tradeId);

  if (!trade) {
    return (
      <div className="p-12 max-w-lg mx-auto text-center clean-card bg-white">
        <h2 className="text-xl font-bold text-zinc-900 font-display mb-2">Trade Tidak Ditemukan</h2>
        <p className="text-xs text-zinc-500 mb-6">Data trade mungkin telah dihapus atau ID tidak valid.</p>
        <button onClick={() => navigate("/journal")} className="clean-button-primary px-4 py-2 text-xs">
          Kembali ke Jurnal
        </button>
      </div>
    );
  }

  const handleDuplicate = async () => {
    const { id, createdAt, updatedAt, ...rest } = trade;
    const newId = await addTrade({
      ...rest,
      date: new Date().toISOString().split("T")[0],
      entryReason: trade.entryReason ? `${trade.entryReason} (Salinan)` : "Salinan trade",
    });
    navigate(`/journal/${newId}`);
  };

  const isWin = trade.result === "win";
  const isLoss = trade.result === "loss";
  const isBE = trade.result === "breakeven";

  return (
    <div className="w-full max-w-5xl mx-auto py-6 space-y-6">
      
      {/* Top Navigation & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200/80">
        <button
          onClick={() => navigate("/journal")}
          className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 flex items-center gap-1.5 transition-colors cursor-pointer w-fit"
        >
          <ArrowLeft className="w-4 h-4" /> Kembali ke Jurnal
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDuplicate}
            className="clean-button-secondary px-3.5 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
            title="Duplikat Trade"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplikat</span>
          </button>
          <button
            onClick={() => navigate(`/add?edit=${trade.id}`)}
            className="clean-button-secondary px-3.5 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
            title="Edit Trade"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Hapus Trade"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Hapus</span>
          </button>
        </div>
      </div>

      {/* OCR EXTRACTION BADGE / BANNER (If trade was created or prefilled via AI OCR) */}
      {trade.ocrDetected && (
        <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-xs flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-emerald-950 block">
                Trade diekstraksi dari Screenshot AI OCR
              </span>
              <span className="text-emerald-800 text-[11px]">
                {trade.ocrExtractedData?.sourcePlatform || "Platform Trading"} 
                {trade.ocrExtractedData?.confidence ? ` • Confidence: ${trade.ocrExtractedData.confidence}` : ""}
                {trade.ocrExtractedData?.rawNotes ? ` — ${trade.ocrExtractedData.rawNotes}` : ""}
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-white border border-emerald-300 text-emerald-800 text-[10px] font-mono font-semibold">
            AI Verified Draft
          </span>
        </div>
      )}

      {/* Main Trade Identity Card */}
      <div className="clean-card p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`w-3 h-3 rounded-full ${
              isWin ? "bg-emerald-500" : isLoss ? "bg-rose-500" : isBE ? "bg-zinc-400" : "bg-blue-500"
            }`} />
            <h1 className="text-3xl font-bold font-display text-zinc-900 tracking-tight">
              {trade.asset}
            </h1>
            <span className={`text-xs font-bold uppercase px-2.5 py-0.5 rounded-md flex items-center gap-1 ${
              trade.direction === "buy" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
            }`}>
              {trade.direction === "buy" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {trade.direction.toUpperCase()}
            </span>
            <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 border border-zinc-200">
              {trade.accountMode}
            </span>
            {trade.marketType && (
              <span className="text-xs font-medium uppercase px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200">
                {trade.marketType}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 mt-2.5">
            <span className="flex items-center gap-1 font-mono">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              {trade.date ? trade.date.split("T")[0] : "-"}
            </span>
            {trade.time && (
              <span className="flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5 text-zinc-400" /> {trade.time}
              </span>
            )}
            <span>•</span>
            <span>Setup: <strong className="text-zinc-700 font-semibold">{trade.setupType || "General"}</strong></span>
            {trade.session && (
              <>
                <span>•</span>
                <span>Sesi: <strong className="text-zinc-700 font-semibold">{trade.session}</strong></span>
              </>
            )}
          </div>
        </div>

        {/* P/L Result Card (Dual: IDR + %) */}
        <div className="text-left md:text-right bg-zinc-50 md:bg-transparent p-4 md:p-0 rounded-xl border border-zinc-200 md:border-0">
          <span className="text-[11px] uppercase tracking-wider text-zinc-400 font-bold block">
            Net Profit / Loss
          </span>
          <div className="flex items-baseline md:justify-end gap-2 mt-1">
            <span className={`text-3xl font-bold font-mono ${
              isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-800"
            }`}>
              {formatIDR(trade.pnlIdr || 0, true)}
            </span>
          </div>
          <div className="flex items-center md:justify-end gap-2 text-xs font-mono font-semibold mt-0.5">
            <span className={isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-500"}>
              ({formatPercent(trade.pnlPercent || 0, true)})
            </span>
            <span>•</span>
            <span className="text-zinc-600 font-sans">
              RR 1:{trade.rrRealized || trade.rrPlanned || "0.0"}
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Execution Levels & Metrics */}
      <div className="clean-card p-6 space-y-4">
        <h3 className="text-sm font-bold text-zinc-900 font-display flex items-center gap-2 border-b border-zinc-100 pb-3">
          <span className="w-2 h-2 rounded-full bg-zinc-900" />
          Eksekusi & Level Harga
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80">
            <span className="text-zinc-500 block mb-1">Entry Price</span>
            <span className="font-mono text-sm font-bold text-zinc-900">
              {trade.actualEntry || trade.entryPlan || "-"}
            </span>
          </div>

          <div className="p-3 bg-rose-50/70 rounded-xl border border-rose-200/70">
            <span className="text-rose-700 block mb-1 font-medium">Stop Loss (SL)</span>
            <span className="font-mono text-sm font-bold text-rose-800">
              {trade.actualSL || trade.slPlan || "-"}
            </span>
          </div>

          <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/70">
            <span className="text-emerald-700 block mb-1 font-medium">Take Profit (TP)</span>
            <span className="font-mono text-sm font-bold text-emerald-800">
              {trade.actualTP || trade.tp1Plan || "-"}
            </span>
          </div>

          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80">
            <span className="text-zinc-500 block mb-1">Exit Price</span>
            <span className="font-mono text-sm font-bold text-zinc-900">
              {trade.actualExit || "-"}
            </span>
          </div>

          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80">
            <span className="text-zinc-500 block mb-1">Ukuran Lot</span>
            <span className="font-mono text-sm font-bold text-zinc-900">
              {trade.lot || 0.1}
            </span>
          </div>

          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80">
            <span className="text-zinc-500 block mb-1">Risiko Terencana</span>
            <span className="font-mono text-sm font-bold text-zinc-900">
              {formatIDR(trade.riskIdr || 0)}
            </span>
            <span className="text-[10px] text-zinc-400 font-mono block mt-0.5">
              {trade.riskPercent?.toFixed(1) || "0.0"}% saldo
            </span>
          </div>
        </div>
      </div>

      {/* MERGED SECTION: "Setup, Psikologi & Bukti Chart" */}
      <div className="clean-card p-6 space-y-6">
        <div className="border-b border-zinc-100 pb-3">
          <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-zinc-700" />
            <span>Setup, Psikologi & Bukti Chart</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Evaluasi terpadu teknikal, psikologi emosional, dan arsip bukti visual eksekusi.
          </p>
        </div>

        {/* Part A: Setup */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            A. Rencana Setup & Kondisi Pasar
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80">
              <span className="text-zinc-400 block mb-1 uppercase text-[10px] font-semibold">Strategi / Setup</span>
              <span className="font-semibold text-zinc-900 text-sm">{trade.setupType || "General"}</span>
            </div>
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80">
              <span className="text-zinc-400 block mb-1 uppercase text-[10px] font-semibold">Sesi Eksekusi</span>
              <span className="font-semibold text-zinc-900 text-sm">{trade.session || "-"}</span>
            </div>
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80">
              <span className="text-zinc-400 block mb-1 uppercase text-[10px] font-semibold">Kondisi Pasar</span>
              <span className="font-semibold text-zinc-900 text-sm">{trade.marketCondition || "Trending"}</span>
            </div>
          </div>
          {trade.entryReason && (
            <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200/80 text-xs">
              <span className="text-zinc-400 text-[10px] font-semibold uppercase tracking-wider block mb-1">
                Alasan Masuk Posisi (Trade Reason)
              </span>
              <p className="text-zinc-800 leading-relaxed font-sans">
                {trade.entryReason}
              </p>
            </div>
          )}
        </div>

        {/* Part B: Psychology */}
        <div className="space-y-3 pt-3 border-t border-zinc-100">
          <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            B. Psikologi & Status Disiplin
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80">
              <span className="text-zinc-400 block mb-1 uppercase text-[10px] font-semibold">Emosi Saat Entry</span>
              <span className="font-semibold text-zinc-900 text-sm">{trade.emotionBefore || "Calm"}</span>
            </div>
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80">
              <span className="text-zinc-400 block mb-1 uppercase text-[10px] font-semibold">Tingkat Keyakinan</span>
              <span className="font-semibold text-zinc-900 text-sm">{trade.confidenceLevel || "Medium"}</span>
            </div>
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80">
              <span className="text-zinc-400 block mb-1 uppercase text-[10px] font-semibold">Kedisiplinan Rule</span>
              <span className={`font-semibold text-sm ${
                trade.disciplineStatus === "Violated Rules" ? "text-rose-600" : "text-emerald-700"
              }`}>
                {trade.disciplineStatus || "Disciplined"}
              </span>
            </div>
          </div>

          {/* Mistakes Tag */}
          {trade.mistakes && trade.mistakes.length > 0 && (
            <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-200 text-xs">
              <span className="text-rose-700 text-[10px] font-bold uppercase tracking-wider block mb-1.5">
                Kesalahan Eksekusi Terdeteksi:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {trade.mistakes.map((m, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-md bg-white border border-rose-300 text-rose-700 font-semibold text-xs">
                    ✕ {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Lessons Learned */}
          {trade.lessonLearned && (
            <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 text-xs">
              <span className="text-amber-800 text-[10px] font-bold uppercase tracking-wider block mb-1">
                Pelajaran yang Didapat (Lesson Learned)
              </span>
              <p className="text-zinc-800 leading-relaxed font-sans">
                {trade.lessonLearned}
              </p>
            </div>
          )}
        </div>

        {/* Part C: Bukti Chart */}
        <div className="space-y-3 pt-3 border-t border-zinc-100">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              C. Bukti Chart & Visual Proof
            </h3>
          </div>

          {/* Screenshot Image Preview */}
          {(trade.screenshotProof || trade.screenshotAfter || trade.screenshotBefore) ? (
            <div className="space-y-2">
              <div className="rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 max-h-[460px] flex items-center justify-center p-1">
                <img
                  src={trade.screenshotProof || trade.screenshotAfter || trade.screenshotBefore}
                  alt="Bukti Chart Setup"
                  className="max-h-[450px] object-contain w-full rounded-lg"
                />
              </div>
              {trade.screenshotProofNotes && (
                <p className="text-xs text-zinc-500 italic px-1">
                  Catatan: {trade.screenshotProofNotes}
                </p>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-zinc-400 border border-dashed border-zinc-200 rounded-xl">
              Tidak ada foto screenshot yang diunggah untuk trade ini.
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-3">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 font-display">
              Hapus Trade Ini?
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Catatan trade <strong>{trade.asset} ({trade.direction.toUpperCase()})</strong> akan dihapus permanen dari jurnal trading Anda.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="clean-button-secondary px-4 py-2 text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={async () => {
                  await deleteTrade(trade.id);
                  setShowDeleteModal(false);
                  navigate("/journal");
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium px-4 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-all"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
