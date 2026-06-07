import React, { useState } from "react";
import { useAppStore } from "../store/AppContext";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../lib/utils";
import {
  Search,
  Plus,
  Calendar as CalendarIcon,
  MoreVertical,
  BookOpen,
  Eye,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Badge } from "../components/ui/Globals";

export function Journal() {
  const { trades, accountMode, deleteTrade, addTrade } = useAppStore();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [filterResult, setFilterResult] = useState<string>("all");
  const [filterSetup, setFilterSetup] = useState<string>("all");
  const [filterAsset, setFilterAsset] = useState<string>("all");

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [tradeToDelete, setTradeToDelete] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const modeTrades = trades.filter((t) => t.accountMode === accountMode);

  const filteredTrades = modeTrades.filter((trade) => {
    const query = search.toLowerCase();

    if (
      search &&
      !trade.asset.toLowerCase().includes(query) &&
      !trade.setupType.toLowerCase().includes(query) &&
      !(trade.entryReason || "").toLowerCase().includes(query)
    ) {
      return false;
    }

    if (filterAsset !== "all" && trade.asset !== filterAsset) return false;
    if (filterResult !== "all" && trade.result !== filterResult) return false;
    if (filterSetup !== "all" && trade.setupType !== filterSetup) return false;

    return true;
  }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const closeMenu = () => setOpenMenuId(null);

  const handleOpenDeleteModal = (
    e: React.MouseEvent<HTMLButtonElement>,
    tradeId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setTradeToDelete(tradeId);
    setShowDeleteModal(true);
    closeMenu();
  };

  const handleConfirmDelete = () => {
    if (!tradeToDelete) return;

    deleteTrade(tradeToDelete);

    setTradeToDelete(null);
    setShowDeleteModal(false);

    window.alert("Trade berhasil dihapus.");
  };

  const handleCancelDelete = () => {
    setTradeToDelete(null);
    setShowDeleteModal(false);
  };

  const handleDuplicateTrade = (
    e: React.MouseEvent<HTMLButtonElement>,
    trade: any
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const {
      id,
      createdAt,
      updatedAt,
      ...tradeWithoutSystemFields
    } = trade;

    addTrade({
      ...tradeWithoutSystemFields,
      status: "planned",
      result: "open",
      date: new Date().toISOString(),
      actualEntry: undefined,
      actualExit: undefined,
      actualSL: undefined,
      actualTP: undefined,
      pnlIdr: 0,
      pnlPoints: 0,
      pnlPips: 0,
      rrRealized: 0,
      mistakes: trade.mistakes || [],
      lessonLearned: trade.lessonLearned
        ? `${trade.lessonLearned} (Duplikat)`
        : "Duplikat trade.",
    });

    closeMenu();
    window.alert("Trade berhasil diduplikat.");
  };

  const handleRowOpen = (tradeId: string) => {
    navigate(`/journal/${tradeId}`);
  };

  return (
    <div className="px-4 md:px-8 max-w-7xl mx-auto w-full pb-8 pt-4 flex flex-col h-[calc(100vh-64px)]">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4 mt-6">
        <div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-on-surface mb-2 tracking-tighter">
            Jurnal Trading
          </h1>
          <p className="font-sans text-sm text-on-surface-variant">
            Catat, evaluasi, dan tingkatkan kualitas entry kamu.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate("/add")}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary/10 text-primary rounded-lg border border-primary/20 hover:bg-primary/20 transition-colors font-display text-xs font-bold tracking-widest uppercase cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Tambah Trade
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-xl p-3 flex flex-col xl:flex-row gap-3 items-stretch mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
          <input
            type="text"
            placeholder="Cari aset, setup, atau catatan..."
            className="w-full h-10 pl-10 pr-4 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-sm focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="h-10 px-3 rounded-lg bg-surface flex items-center border border-white/5 text-on-surface-variant text-sm capitalize">
            {accountMode === "demo" ? "Demo Mode" : "Real Mode"}
          </div>

          <select
            className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-sm outline-none appearance-none cursor-pointer hover:border-white/20 transition-colors"
            value={filterAsset}
            onChange={(e) => setFilterAsset(e.target.value)}
          >
            <option value="all" className="bg-surface">
              Semua Aset
            </option>
            {Array.from(new Set(modeTrades.map(t => t.asset))).map(a => (
               <option key={a} value={a} className="bg-surface">{a}</option>
            ))}
          </select>

          <select
            className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-sm outline-none appearance-none cursor-pointer hover:border-white/20 transition-colors"
            value={filterSetup}
            onChange={(e) => setFilterSetup(e.target.value)}
          >
            <option value="all" className="bg-surface">
              Semua Setup
            </option>
            {Array.from(new Set(modeTrades.map((t) => t.setupType))).filter(Boolean).map((s) => (
              <option key={s} value={s} className="bg-surface">
                {s}
              </option>
            ))}
          </select>

          <select
            className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-sm outline-none appearance-none cursor-pointer hover:border-white/20 transition-colors"
            value={filterResult}
            onChange={(e) => setFilterResult(e.target.value)}
          >
            <option value="all" className="bg-surface">
              Semua Hasil
            </option>
            <option value="win" className="bg-surface text-primary">
              Win
            </option>
            <option value="loss" className="bg-surface text-error">
              Loss
            </option>
            <option value="breakeven" className="bg-surface">
              Break Even
            </option>
            <option value="open" className="bg-surface text-warning">
              Open
            </option>
          </select>

          <button
            onClick={() => {
              setSearch("");
              setFilterAsset("all");
              setFilterSetup("all");
              setFilterResult("all");
            }}
            className="h-10 flex items-center justify-between px-3 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-sm hover:border-white/20 transition-colors cursor-pointer"
          >
            <span>Reset</span>
            <CalendarIcon className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>
      </div>

      <div className="hidden md:block glass-panel rounded-xl overflow-visible flex-1 overflow-y-auto custom-scrollbar">
        {filteredTrades.length === 0 ? (
          <div
            onClick={() => navigate("/add")}
            className="p-12 text-center flex flex-col items-center justify-center text-on-surface-variant h-full cursor-pointer hover:text-primary transition-colors"
          >
            <BookOpen className="w-12 h-12 mb-4 opacity-50" />
            <p>Belum ada trade. Mulai dari satu plan yang disiplin.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse relative">
            <thead className="sticky top-0 z-20 bg-[#161d18]">
              <tr className="border-b border-white/5 bg-white/[0.02] shadow-sm">
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant">
                  Tanggal
                </th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant">
                  Aset
                </th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant">
                  Setup
                </th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant text-right">
                  Entry
                </th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant text-right">
                  Exit
                </th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant text-right">
                  P/L (IDR)
                </th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant text-center">
                  Hasil
                </th>
                <th className="py-4 px-6 w-10"></th>
              </tr>
            </thead>

            <tbody className="font-mono text-sm text-white">
              {filteredTrades.map((trade) => (
                <tr
                  key={trade.id}
                  onClick={() => handleRowOpen(trade.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleRowOpen(trade.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className="border-b border-white/5 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors group cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <td className="py-5 px-6 text-on-surface-variant font-sans text-sm">
                    {format(parseISO(trade.date), "MMM dd, HH:mm")}
                  </td>

                  <td className="py-5 px-6">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          trade.result === "win"
                            ? "bg-primary"
                            : trade.result === "loss"
                            ? "bg-error"
                            : "bg-surface-variant"
                        }`}
                      ></span>
                      <span>{trade.asset}</span>
                      <Badge
                        variant={trade.direction === "buy" ? "primary" : "error"}
                        size="sm"
                      >
                        {trade.direction}
                      </Badge>
                    </div>
                  </td>

                  <td className="py-5 px-6 font-sans text-sm text-on-surface-variant max-w-[150px] truncate">
                    {trade.setupType || '-'}
                  </td>

                  <td className="py-5 px-6 text-right text-on-surface-variant">
                    {trade.actualEntry || trade.entryPlan || "-"}
                  </td>

                  <td className="py-5 px-6 text-right text-on-surface-variant">
                    {trade.actualExit || "-"}
                  </td>

                  <td
                    className={`py-5 px-6 text-right font-bold ${
                      trade.pnlIdr && trade.pnlIdr > 0
                        ? "text-primary"
                        : trade.pnlIdr && trade.pnlIdr < 0
                        ? "text-error"
                        : "text-on-surface-variant"
                    }`}
                  >
                    {trade.pnlIdr
                      ? `${trade.pnlIdr > 0 ? "+" : ""}${formatCurrency(
                          trade.pnlIdr,
                          "IDR"
                        )}`
                      : "-"}
                  </td>

                  <td className="py-5 px-6 text-center">
                    <Badge
                      variant={
                        trade.result === "win"
                          ? "primary"
                          : trade.result === "loss"
                          ? "error"
                          : trade.result === "open"
                          ? "warning"
                          : "surface"
                      }
                      size="sm"
                    >
                      {trade.result === "open" ? "OPEN" : trade.result}
                    </Badge>
                  </td>

                  <td className="py-5 px-6 text-right relative">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === trade.id ? null : trade.id);
                      }}
                      className="text-on-surface-variant hover:text-white transition-all p-2 rounded-lg hover:bg-white/10"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>

                    {openMenuId === trade.id && (
                      <div
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        className="absolute right-6 top-14 z-[999] w-52 rounded-xl border border-white/10 bg-[#1a211c] shadow-2xl overflow-hidden"
                      >
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/journal/${trade.id}`);
                            closeMenu();
                          }}
                          className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <Eye className="w-4 h-4" /> Lihat Detail
                        </button>

                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/add?edit=${trade.id}`);
                            closeMenu();
                          }}
                          className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" /> Edit Trade
                        </button>

                        <button
                          onClick={(e) => handleDuplicateTrade(e, trade)}
                          className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <Copy className="w-4 h-4" /> Duplikat
                        </button>

                        <button
                          onClick={(e) => handleOpenDeleteModal(e, trade.id)}
                          className="w-full px-4 py-3 text-left text-sm text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-2 border-t border-white/10 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" /> Hapus
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-col gap-4 md:hidden overflow-y-auto custom-scrollbar">
        {filteredTrades.length === 0 ? (
          <div
            onClick={() => navigate("/add")}
            className="glass-panel rounded-xl p-8 text-center text-on-surface-variant cursor-pointer hover:text-primary transition-colors"
          >
            Belum ada trade. Mulai dari satu plan yang disiplin.
          </div>
        ) : (
          filteredTrades.map((trade) => (
            <div
              key={trade.id}
              onClick={() => handleRowOpen(trade.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleRowOpen(trade.id);
                }
              }}
              tabIndex={0}
              role="button"
              className="glass-panel rounded-xl p-4 flex flex-col gap-3 relative cursor-pointer hover:border-primary/30 active:scale-[0.99] transition-all focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              <div
                className={`absolute top-0 left-0 w-1 h-full rounded-l-xl ${
                  trade.result === "win"
                    ? "bg-primary"
                    : trade.result === "loss"
                    ? "bg-error"
                    : "bg-surface-variant"
                }`}
              ></div>

              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-lg text-white font-bold">
                      {trade.asset}
                    </span>
                    <Badge
                      variant={trade.direction === "buy" ? "primary" : "error"}
                      size="sm"
                    >
                      {trade.direction}
                    </Badge>
                  </div>

                  <span className="font-sans text-xs text-on-surface-variant">
                    {trade.setupType || '-'} • {format(parseISO(trade.date), "MMM dd, HH:mm")}
                  </span>
                </div>

                <div className="text-right flex items-start gap-2 relative">
                  <div className="text-right">
                    <span
                      className={`block font-mono text-lg font-bold ${
                        trade.pnlIdr && trade.pnlIdr > 0
                          ? "text-primary"
                          : trade.pnlIdr && trade.pnlIdr < 0
                          ? "text-error"
                          : "text-on-surface-variant"
                      }`}
                    >
                      {trade.pnlIdr
                        ? `${trade.pnlIdr > 0 ? "+" : ""}${formatCurrency(
                            trade.pnlIdr,
                            "IDR"
                          )}`
                        : "-"}
                    </span>

                    <Badge
                      variant={
                        trade.result === "win"
                          ? "primary"
                          : trade.result === "loss"
                          ? "error"
                          : trade.result === "open"
                          ? "warning"
                          : "surface"
                      }
                      size="sm"
                      className="mt-1"
                    >
                      {trade.result === "open" ? "OPEN" : trade.result}
                    </Badge>
                  </div>
                  
                  <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenMenuId(openMenuId === trade.id ? null : trade.id);
                      }}
                      className="text-on-surface-variant hover:text-white transition-all p-1 rounded-lg hover:bg-white/10"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>

                    {openMenuId === trade.id && (
                      <div
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        className="absolute right-0 top-8 z-[999] w-48 rounded-xl border border-white/10 bg-[#1a211c] shadow-2xl overflow-hidden"
                      >
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/journal/${trade.id}`);
                            closeMenu();
                          }}
                          className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <Eye className="w-4 h-4" /> Lihat Detail
                        </button>

                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/add?edit=${trade.id}`);
                            closeMenu();
                          }}
                          className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" /> Edit Trade
                        </button>

                        <button
                          onClick={(e) => handleDuplicateTrade(e, trade)}
                          className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                          <Copy className="w-4 h-4" /> Duplikat
                        </button>

                        <button
                          onClick={(e) => handleOpenDeleteModal(e, trade.id)}
                          className="w-full px-4 py-3 text-left text-sm text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-2 border-t border-white/10 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" /> Hapus
                        </button>
                      </div>
                    )}
                </div>
              </div>

              <div className="h-px w-full bg-white/5 my-1"></div>

              <div className="flex justify-between items-center font-mono text-sm">
                <div className="flex gap-6">
                  <div className="flex flex-col">
                    <span className="text-on-surface-variant text-[10px] uppercase font-display tracking-wider">
                      Entry
                    </span>
                    <span className="text-white">
                      {trade.actualEntry || trade.entryPlan || "-"}
                    </span>
                  </div>

                  <div className="flex flex-col">
                    <span className="text-on-surface-variant text-[10px] uppercase font-display tracking-wider">
                      Exit
                    </span>
                    <span className="text-white">{trade.actualExit || "-"}</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161d18] p-6 shadow-2xl">
            <h2 className="font-display text-2xl font-bold text-white mb-2">
              Hapus trade ini?
            </h2>

            <p className="text-sm text-on-surface-variant mb-6 leading-relaxed">
              Trade yang dihapus tidak bisa dikembalikan. Transaksi P/L yang
              terkait juga akan ikut dihapus.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancelDelete}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                Batal
              </button>

              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-lg bg-red-500/20 border border-red-400/30 text-red-300 hover:bg-red-500/30 transition-colors font-semibold cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Click outside menu overlay */}
      {openMenuId && (
         <div className="fixed inset-0 z-[990]" onClick={closeMenu}></div>
      )}
    </div>
  );
}
