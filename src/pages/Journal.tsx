import React, { useState, useMemo } from "react";
import { useAppStore, dedupeTrades } from "../store/AppContext";
import { useNavigate } from "react-router-dom";
import { formatIDR, formatPercent } from "../lib/utils";
import {
  Search,
  Plus,
  ArrowUpRight,
  Filter,
  ArrowUpDown,
  MoreVertical,
  Pencil,
  Copy,
  Trash2,
  Calendar,
  Layers,
  ChevronDown,
  X,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Trade, AccountMode, TradeResult } from "../types";

export function Journal() {
  const { trades, accountMode, setAccountMode, deleteTrade, addTrade } = useAppStore();
  const navigate = useNavigate();

  // Search & Filter States
  const [search, setSearch] = useState("");
  const [filterAccount, setFilterAccount] = useState<"all" | "demo" | "real">(accountMode);
  const [filterMarket, setFilterMarket] = useState<"all" | "forex" | "crypto">("all");
  const [filterResult, setFilterResult] = useState<"all" | "win" | "loss" | "breakeven" | "open">("all");
  const [filterAsset, setFilterAsset] = useState<string>("all");
  const [filterDateRange, setFilterDateRange] = useState<"all" | "this_month" | "last_30_days" | "this_week">("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "pnl_desc" | "pnl_asc" | "rr_desc">("date_desc");

  // State for actions
  const [actionMenuTradeId, setActionMenuTradeId] = useState<string | null>(null);
  const [tradeToDelete, setTradeToDelete] = useState<Trade | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Extract unique assets present in trades
  const uniqueAssets = useMemo(() => {
    const set = new Set<string>();
    trades.forEach((t) => {
      if (t.asset) set.add(t.asset);
    });
    return Array.from(set);
  }, [trades]);

  // Filter & Sort Trades (deduplicated)
  const filteredTrades = useMemo(() => {
    return dedupeTrades(trades).filter((trade) => {
      // Account filter
      if (filterAccount !== "all" && trade.accountMode !== filterAccount) {
        return false;
      }

      // Market filter (forex vs crypto)
      if (filterMarket !== "all") {
        const isCrypto = trade.marketType === "crypto" || 
          trade.asset.toUpperCase().includes("BTC") || 
          trade.asset.toUpperCase().includes("ETH") || 
          trade.asset.toUpperCase().includes("SOL");
        
        if (filterMarket === "crypto" && !isCrypto) return false;
        if (filterMarket === "forex" && isCrypto) return false;
      }

      // Result filter
      if (filterResult !== "all" && trade.result !== filterResult) {
        return false;
      }

      // Asset filter
      if (filterAsset !== "all" && trade.asset !== filterAsset) {
        return false;
      }

      // Date Range filter
      if (filterDateRange !== "all") {
        const tradeDate = new Date(trade.date || trade.createdAt).getTime();
        const now = new Date();

        if (filterDateRange === "this_month") {
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
          if (tradeDate < startOfMonth) return false;
        } else if (filterDateRange === "last_30_days") {
          const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
          if (tradeDate < thirtyDaysAgo) return false;
        } else if (filterDateRange === "this_week") {
          const startOfWeek = now.getTime() - (7 * 24 * 60 * 60 * 1000);
          if (tradeDate < startOfWeek) return false;
        }
      }

      // Search query (pair, setup, notes, emotions, mistakes)
      if (search.trim()) {
        const query = search.toLowerCase();
        const assetMatch = (trade.asset || "").toLowerCase().includes(query);
        const setupMatch = (trade.setupType || "").toLowerCase().includes(query);
        const noteMatch = (trade.entryReason || "").toLowerCase().includes(query) || (trade.mentalStateNotes || "").toLowerCase().includes(query);
        const emotionMatch = (trade.emotionBefore || "").toLowerCase().includes(query) || (trade.emotionAfter || "").toLowerCase().includes(query);
        if (!assetMatch && !setupMatch && !noteMatch && !emotionMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === "date_desc") {
        return new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime();
      }
      if (sortBy === "date_asc") {
        return new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime();
      }
      if (sortBy === "pnl_desc") {
        return (b.pnlIdr || 0) - (a.pnlIdr || 0);
      }
      if (sortBy === "pnl_asc") {
        return (a.pnlIdr || 0) - (b.pnlIdr || 0);
      }
      if (sortBy === "rr_desc") {
        return (b.rrRealized || b.rrPlanned || 0) - (a.rrRealized || a.rrPlanned || 0);
      }
      return 0;
    });
  }, [trades, filterAccount, filterMarket, filterResult, filterAsset, filterDateRange, search, sortBy]);

  // Summary of filtered trades
  const filteredSummary = useMemo(() => {
    const total = filteredTrades.length;
    const wins = filteredTrades.filter((t) => t.result === "win").length;
    const losses = filteredTrades.filter((t) => t.result === "loss").length;
    const netPnl = filteredTrades.reduce((acc, t) => acc + (t.pnlIdr || 0), 0);
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    return { total, wins, losses, netPnl, winRate };
  }, [filteredTrades]);

  // Duplicate handler
  const handleDuplicate = (e: React.MouseEvent, trade: Trade) => {
    e.stopPropagation();
    const { id, createdAt, updatedAt, ...rest } = trade;
    addTrade({
      ...rest,
      status: "closed",
      date: new Date().toISOString(),
      entryReason: trade.entryReason ? `${trade.entryReason} (Salinan)` : "Salinan trade",
    });
    setActionMenuTradeId(null);
    showToast(`Trade ${trade.asset} berhasil diduplikat.`);
  };

  // Delete handler
  const handleConfirmDelete = () => {
    if (!tradeToDelete) return;
    deleteTrade(tradeToDelete.id);
    setTradeToDelete(null);
    showToast("Trade berhasil dihapus.");
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-6">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 text-white text-xs px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-display text-zinc-900 tracking-tight">
            Jurnal Trade
          </h1>
          <p className="text-xs md:text-sm text-zinc-500 mt-1">
            Daftar lengkap seluruh posisi, hasil nominal IDR, persentase, dan catatan setup.
          </p>
        </div>

        <button
          onClick={() => navigate("/add")}
          className="clean-button-primary px-4 py-2 text-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Trade</span>
        </button>
      </div>

      {/* 2. Filter Bar & Search */}
      <div className="clean-card p-4 space-y-3">
        {/* Top Filter Controls: Search & Primary Filters */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pair, setup tag, catatan..."
              className="clean-input w-full pl-9 pr-4 py-2 text-xs"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Account Mode Filter */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200 shrink-0">
            {(["all", "demo", "real"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterAccount(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                  filterAccount === mode
                    ? "bg-white text-zinc-900 shadow-xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {mode === "all" ? "Semua Akun" : mode}
              </button>
            ))}
          </div>

          {/* Market Filter (Forex / Crypto) */}
          <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl border border-zinc-200 shrink-0">
            {(["all", "forex", "crypto"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setFilterMarket(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                  filterMarket === m
                    ? "bg-white text-zinc-900 shadow-xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {m === "all" ? "Semua Pasar" : m}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Filter Controls: Result, Asset, Date Range, Sort */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-zinc-100 text-xs">
          {/* Result Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 text-[11px] font-medium">Hasil:</span>
            <select
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value as any)}
              className="clean-input py-1.5 px-2.5 text-xs bg-white text-zinc-700 font-medium cursor-pointer"
            >
              <option value="all">Semua Hasil</option>
              <option value="win">Win (Menang)</option>
              <option value="loss">Loss (Kalah)</option>
              <option value="breakeven">Break Even</option>
              <option value="open">Open (Terbuka)</option>
            </select>
          </div>

          {/* Pair / Asset Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 text-[11px] font-medium">Aset:</span>
            <select
              value={filterAsset}
              onChange={(e) => setFilterAsset(e.target.value)}
              className="clean-input py-1.5 px-2.5 text-xs bg-white text-zinc-700 font-medium cursor-pointer"
            >
              <option value="all">Semua Pair</option>
              <option value="XAU/USD">XAU/USD (Gold)</option>
              <option value="BTC/USD">BTC/USD (Bitcoin)</option>
              <option value="EUR/USD">EUR/USD</option>
              <option value="GBP/USD">GBP/USD</option>
              <option value="USD/JPY">USD/JPY</option>
              {uniqueAssets
                .filter((a) => !["XAU/USD", "BTC/USD", "EUR/USD", "GBP/USD", "USD/JPY"].includes(a))
                .map((asset) => (
                  <option key={asset} value={asset}>{asset}</option>
                ))}
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 text-[11px] font-medium">Periode:</span>
            <select
              value={filterDateRange}
              onChange={(e) => setFilterDateRange(e.target.value as any)}
              className="clean-input py-1.5 px-2.5 text-xs bg-white text-zinc-700 font-medium cursor-pointer"
            >
              <option value="all">Semua Waktu</option>
              <option value="this_month">Bulan Ini</option>
              <option value="last_30_days">30 Hari Terakhir</option>
              <option value="this_week">7 Hari Terakhir</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5 sm:ml-auto w-full sm:w-auto justify-between sm:justify-end">
            <span className="text-zinc-400 text-[11px] font-medium flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> Urutan:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="clean-input py-1.5 px-2.5 text-xs bg-white text-zinc-700 font-medium cursor-pointer"
            >
              <option value="date_desc">Tanggal (Terbaru)</option>
              <option value="date_asc">Tanggal (Terlama)</option>
              <option value="pnl_desc">Profit Tertinggi</option>
              <option value="pnl_asc">Loss Terbesar</option>
              <option value="rr_desc">RR Tertinggi</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Summary Pill Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-zinc-500 pt-2 border-t border-zinc-100">
          <div>
            Menampilkan <span className="font-bold text-zinc-800">{filteredTrades.length}</span> trade
            {search && <span> dengan kata kunci "{search}"</span>}
          </div>
          <div className="flex items-center gap-3 font-mono">
            <span>Win Rate: <strong className="text-zinc-800">{filteredSummary.winRate.toFixed(1)}%</strong></span>
            <span>•</span>
            <span>
              Net P/L:{" "}
              <strong className={filteredSummary.netPnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {formatIDR(filteredSummary.netPnl, true)}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Trade Entries List / Table */}
      {filteredTrades.length === 0 ? (
        <div className="clean-card p-12 text-center flex flex-col items-center justify-center">
          <Layers className="w-10 h-10 text-zinc-300 mb-3" />
          <h3 className="text-base font-bold text-zinc-900 font-display">
            Tidak ada trade yang sesuai
          </h3>
          <p className="text-xs text-zinc-500 max-w-sm mt-1 mb-5">
            {trades.length === 0
              ? "Kamu belum memiliki catatan trade di jurnal. Klik tombol di bawah untuk menambah trade pertama."
              : "Coba ubah kata kunci pencarian atau sesuaikan filter di atas."}
          </p>
          {trades.length === 0 ? (
            <button
              onClick={() => navigate("/add")}
              className="clean-button-primary px-4 py-2 text-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Tambah Trade Pertama
            </button>
          ) : (
            <button
              onClick={() => {
                setSearch("");
                setFilterAccount("all");
                setFilterMarket("all");
                setFilterResult("all");
                setFilterAsset("all");
                setFilterDateRange("all");
              }}
              className="clean-button-secondary px-3 py-1.5 text-xs"
            >
              Reset Semua Filter
            </button>
          )}
        </div>
      ) : (
        <div className="clean-card overflow-hidden">
          {/* Mobile Card List (< 768px) */}
          <div className="md:hidden divide-y divide-zinc-100">
            {filteredTrades.map((trade) => {
              const isWin = trade.result === "win";
              const isLoss = trade.result === "loss";
              const isBE = trade.result === "breakeven";

              return (
                <div
                  key={`card-${trade.id}`}
                  onClick={() => navigate(`/journal/${trade.id}`)}
                  className="p-4 hover:bg-zinc-50/80 transition-colors cursor-pointer space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isWin ? "bg-emerald-500" : isLoss ? "bg-rose-500" : isBE ? "bg-zinc-400" : "bg-blue-400"
                        }`}
                      />
                      <span className="font-bold text-sm text-zinc-900 font-display">
                        {trade.asset}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          trade.direction === "buy"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {trade.direction}
                      </span>
                      {trade.timeframe && (
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {trade.timeframe}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                        trade.accountMode === "real"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}
                    >
                      {trade.accountMode}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="text-zinc-500 font-mono text-[11px]">
                      {trade.date ? trade.date.split("T")[0] : "-"}
                      {trade.session && <span className="ml-1 text-zinc-400">({trade.session})</span>}
                    </div>
                    <div className="text-right font-mono">
                      <div className={`font-bold text-sm ${isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-800"}`}>
                        {formatIDR(trade.pnlIdr || 0, true)}
                      </div>
                      <div className={`text-[11px] font-medium ${isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-500"}`}>
                        {formatPercent(trade.pnlPercent || 0, true)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-zinc-100 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      {trade.riskRewardRatio && (
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 font-mono text-[10px] text-zinc-600 font-medium">
                          1:{trade.riskRewardRatio}
                        </span>
                      )}
                      {trade.entryReason && (
                        <span className="text-[11px] text-zinc-400 truncate max-w-[140px]">
                          {trade.entryReason}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/add?edit=${trade.id}`)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
                        title="Edit Trade"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDuplicate(e, trade)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
                        title="Duplikat Trade"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setTradeToDelete(trade)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Hapus Trade"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (>= 768px) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/70 text-zinc-500 font-medium">
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider">Pair & Arah</th>
                  <th className="py-3 px-3 font-semibold uppercase tracking-wider">Tanggal & Sesi</th>
                  <th className="py-3 px-3 font-semibold uppercase tracking-wider">Akun</th>
                  <th className="py-3 px-3 font-semibold uppercase tracking-wider">Setup & Catatan</th>
                  <th className="py-3 px-3 font-semibold uppercase tracking-wider text-center">RR</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-right">Hasil (IDR & %)</th>
                  <th className="py-3 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-sans">
                {filteredTrades.map((trade) => {
                  const isWin = trade.result === "win";
                  const isLoss = trade.result === "loss";
                  const isBE = trade.result === "breakeven";

                  return (
                    <tr
                      key={trade.id}
                      onClick={() => navigate(`/journal/${trade.id}`)}
                      className="hover:bg-zinc-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Pair & Direction */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              isWin ? "bg-emerald-500" : isLoss ? "bg-rose-500" : isBE ? "bg-zinc-400" : "bg-blue-400"
                            }`}
                          />
                          <div>
                            <div className="font-bold text-sm text-zinc-900 font-display">
                              {trade.asset}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded ${
                                  trade.direction === "buy"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}
                              >
                                {trade.direction}
                              </span>
                              {trade.timeframe && (
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  {trade.timeframe}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Date & Session */}
                      <td className="py-3.5 px-3">
                        <div className="font-mono text-zinc-800 font-medium">
                          {trade.date ? trade.date.split("T")[0] : "-"}
                        </div>
                        <div className="text-zinc-400 text-[11px]">
                          {trade.session ? `Sesi ${trade.session}` : trade.time || ""}
                        </div>
                      </td>

                      {/* Account Type */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            trade.accountMode === "real"
                              ? "bg-rose-50 text-rose-700 border border-rose-200"
                              : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                          }`}
                        >
                          {trade.accountMode}
                        </span>
                      </td>

                      {/* Setup & Notes */}
                      <td className="py-3.5 px-3 max-w-[220px]">
                        <div className="font-medium text-zinc-800 truncate">
                          {trade.setupType || "Setup Konfirmasi"}
                        </div>
                        <div className="text-zinc-400 text-[11px] truncate">
                          {trade.entryReason || trade.mentalStateNotes || "Tidak ada catatan"}
                        </div>
                      </td>

                      {/* RR */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="font-mono font-bold text-zinc-800">
                          1:{trade.rrRealized || trade.rrPlanned || "0.0"}
                        </span>
                      </td>

                      {/* P/L Result (Nominal IDR & %) */}
                      <td className="py-3.5 px-4 text-right">
                        <div
                          className={`font-mono font-bold text-sm ${
                            isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-700"
                          }`}
                        >
                          {formatIDR(trade.pnlIdr || 0, true)}
                        </div>
                        <div
                          className={`font-mono text-xs font-semibold ${
                            isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-500"
                          }`}
                        >
                          {formatPercent(trade.pnlPercent || 0, true)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => navigate(`/add?edit=${trade.id}`)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
                            title="Edit Trade"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDuplicate(e, trade)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
                            title="Duplikat Trade"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setTradeToDelete(trade)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Hapus Trade"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {tradeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
            <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-3">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 font-display">
              Hapus Catatan Trade?
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Trade <strong className="text-zinc-800">{tradeToDelete.asset} ({tradeToDelete.direction.toUpperCase()})</strong> pada tanggal {tradeToDelete.date?.split("T")[0]} akan dihapus permanen dari jurnal dan kalkulasi performa.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setTradeToDelete(null)}
                className="clean-button-secondary px-4 py-2 text-xs"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmDelete}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium px-4 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-all"
              >
                Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
