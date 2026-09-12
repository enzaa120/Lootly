import { useState, useMemo } from "react";
import { Trade } from "../../types";
import { formatIDR, formatPercent } from "../../lib/utils";
import { dedupeTrades } from "../../store/AppContext";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  TrendingUp, 
  TrendingDown, 
  X, 
  ArrowUpRight, 
  Layers,
  Target,
  AlertTriangle
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TradingCalendarProps {
  trades: Trade[];
  startingBalance?: number;
  compact?: boolean;
  dailyTargetIdr?: number;
  dailyLossLimitIdr?: number;
}

export function TradingCalendar({ 
  trades, 
  startingBalance = 2000000, 
  compact = false,
  dailyTargetIdr = 500000,
  dailyLossLimitIdr = 100000
}: TradingCalendarProps) {
  const navigate = useNavigate();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDayTrades, setSelectedDayTrades] = useState<{ dateStr: string; trades: Trade[]; netPnl: number; netPercent: number } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };
  const resetToToday = () => {
    setCurrentDate(new Date());
  };

  // Group trades by date (YYYY-MM-DD)
  const tradesByDate = useMemo(() => {
    const map = new Map<string, Trade[]>();
    dedupeTrades(trades).forEach((t) => {
      // Normalize trade date
      const dateStr = t.date ? t.date.split("T")[0] : t.createdAt?.split("T")[0];
      if (!dateStr) return;
      if (!map.has(dateStr)) {
        map.set(dateStr, []);
      }
      map.get(dateStr)!.push(t);
    });
    return map;
  }, [trades]);

  // Calendar matrix calculation
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
    // We adjust so Monday is first: 0 = Mon, 6 = Sun
    const adjustedFirstDay = (firstDayIndex + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days: {
      dayNumber: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      trades: Trade[];
      netPnl: number;
      netPercent: number;
      winCount: number;
      lossCount: number;
    }[] = [];

    const todayStr = new Date().toISOString().split("T")[0];

    // Previous month padding days
    for (let i = adjustedFirstDay - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevMonthDate = new Date(year, month - 1, dayNum);
      const m = String(prevMonthDate.getMonth() + 1).padStart(2, "0");
      const d = String(dayNum).padStart(2, "0");
      const dateStr = `${prevMonthDate.getFullYear()}-${m}-${d}`;
      const dayTrades = tradesByDate.get(dateStr) || [];
      const netPnl = dayTrades.reduce((acc, t) => acc + (t.pnlIdr || 0), 0);
      const netPercent = dayTrades.reduce((acc, t) => acc + (t.pnlPercent || (t.pnlIdr ? (t.pnlIdr / startingBalance) * 100 : 0)), 0);

      days.push({
        dayNumber: dayNum,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        trades: dayTrades,
        netPnl,
        netPercent,
        winCount: dayTrades.filter((t) => t.result === "win").length,
        lossCount: dayTrades.filter((t) => t.result === "loss").length,
      });
    }

    // Current month days
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const m = String(month + 1).padStart(2, "0");
      const d = String(dayNum).padStart(2, "0");
      const dateStr = `${year}-${m}-${d}`;
      const dayTrades = tradesByDate.get(dateStr) || [];
      const netPnl = dayTrades.reduce((acc, t) => acc + (t.pnlIdr || 0), 0);
      const netPercent = dayTrades.reduce((acc, t) => acc + (t.pnlPercent || (t.pnlIdr ? (t.pnlIdr / startingBalance) * 100 : 0)), 0);

      days.push({
        dayNumber: dayNum,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        trades: dayTrades,
        netPnl,
        netPercent,
        winCount: dayTrades.filter((t) => t.result === "win").length,
        lossCount: dayTrades.filter((t) => t.result === "loss").length,
      });
    }

    // Next month padding days to complete grid (multiples of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const nextMonthDate = new Date(year, month + 1, dayNum);
      const m = String(nextMonthDate.getMonth() + 1).padStart(2, "0");
      const d = String(dayNum).padStart(2, "0");
      const dateStr = `${nextMonthDate.getFullYear()}-${m}-${d}`;
      const dayTrades = tradesByDate.get(dateStr) || [];
      const netPnl = dayTrades.reduce((acc, t) => acc + (t.pnlIdr || 0), 0);
      const netPercent = dayTrades.reduce((acc, t) => acc + (t.pnlPercent || (t.pnlIdr ? (t.pnlIdr / startingBalance) * 100 : 0)), 0);

      days.push({
        dayNumber: dayNum,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        trades: dayTrades,
        netPnl,
        netPercent,
        winCount: dayTrades.filter((t) => t.result === "win").length,
        lossCount: dayTrades.filter((t) => t.result === "loss").length,
      });
    }

    return days;
  }, [year, month, tradesByDate, startingBalance]);

  // Monthly summary metrics for the currently viewed month
  const monthlyMetrics = useMemo(() => {
    const currentMonthDays = calendarDays.filter((d) => d.isCurrentMonth);
    let winDays = 0;
    let lossDays = 0;
    let beDays = 0;
    let totalTrades = 0;
    let netPnl = 0;
    let netPercent = 0;
    let targetHitDays = 0;
    let targetMissedDays = 0;

    currentMonthDays.forEach((d) => {
      if (d.trades.length > 0) {
        totalTrades += d.trades.length;
        netPnl += d.netPnl;
        netPercent += d.netPercent;
        if (d.netPnl > 0) winDays++;
        else if (d.netPnl < 0) lossDays++;
        else beDays++;

        if (dailyTargetIdr && dailyTargetIdr > 0) {
          if (d.netPnl >= dailyTargetIdr) {
            targetHitDays++;
          } else {
            targetMissedDays++;
          }
        }
      }
    });

    const growthPercent = startingBalance > 0 ? (netPnl / startingBalance) * 100 : netPercent;

    return {
      winDays,
      lossDays,
      beDays,
      totalTrades,
      netPnl,
      growthPercent,
      targetHitDays,
      targetMissedDays,
    };
  }, [calendarDays, startingBalance, dailyTargetIdr]);

  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const dayHeaders = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

  return (
    <div className="clean-card p-5 md:p-6 w-full">
      {/* Top Header & Month Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-100">
        <div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-zinc-500" />
            <h2 className="text-lg font-bold text-zinc-900 font-display">
              Kalender Performa Trading
            </h2>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            Pantau hasil harian, profit/loss nominal, dan pertumbuhan persentase per sesi.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center bg-zinc-100/80 rounded-xl p-1 border border-zinc-200/60">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-white transition-all cursor-pointer"
              title="Bulan Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-semibold text-sm text-zinc-800 px-3 min-w-[140px] text-center select-none">
              {monthNames[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-white transition-all cursor-pointer"
              title="Bulan Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={resetToToday}
            className="px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-all cursor-pointer"
          >
            Bulan Ini
          </button>
        </div>
      </div>

      {/* Monthly Summary Cards (User requirement: Hari Profit, Hari Loss, Net P/L, Pertumbuhan, Total Trade, Hari Mencapai Target, Hari Gagal Mencapai Target) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 py-4">
        {/* Win Days */}
        <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl flex flex-col">
          <span className="text-[11px] font-medium text-emerald-700 flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" /> Hari Profit
          </span>
          <span className="text-lg font-bold text-emerald-800 font-mono mt-1">
            {monthlyMetrics.winDays} <span className="text-xs font-normal text-emerald-600">hari</span>
          </span>
        </div>

        {/* Loss Days */}
        <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl flex flex-col">
          <span className="text-[11px] font-medium text-rose-700 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5" /> Hari Loss
          </span>
          <span className="text-lg font-bold text-rose-800 font-mono mt-1">
            {monthlyMetrics.lossDays} <span className="text-xs font-normal text-rose-600">hari</span>
          </span>
        </div>

        {/* Net PnL (IDR) */}
        <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl flex flex-col col-span-2 sm:col-span-1">
          <span className="text-[11px] font-medium text-zinc-600">Net P/L Bulan Ini</span>
          <span className={`text-base font-bold font-mono mt-1 truncate ${
            monthlyMetrics.netPnl > 0 ? "text-emerald-600" : monthlyMetrics.netPnl < 0 ? "text-rose-600" : "text-zinc-700"
          }`}>
            {formatIDR(monthlyMetrics.netPnl, true)}
          </span>
        </div>

        {/* Growth % */}
        <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl flex flex-col">
          <span className="text-[11px] font-medium text-zinc-600">Pertumbuhan</span>
          <span className={`text-lg font-bold font-mono mt-1 ${
            monthlyMetrics.growthPercent > 0 ? "text-emerald-600" : monthlyMetrics.growthPercent < 0 ? "text-rose-600" : "text-zinc-700"
          }`}>
            {formatPercent(monthlyMetrics.growthPercent, true)}
          </span>
        </div>

        {/* Total Trades */}
        <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl flex flex-col">
          <span className="text-[11px] font-medium text-zinc-600 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5" /> Total Trade
          </span>
          <span className="text-lg font-bold text-zinc-900 font-mono mt-1">
            {monthlyMetrics.totalTrades}
          </span>
        </div>

        {/* Hari Mencapai Target */}
        <div className="p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-xl flex flex-col">
          <span className="text-[11px] font-medium text-emerald-800 flex items-center gap-1">
            <Target className="w-3.5 h-3.5" /> Capai Target
          </span>
          <span className="text-lg font-bold text-emerald-700 font-mono mt-1">
            {monthlyMetrics.targetHitDays} <span className="text-xs font-normal text-emerald-600">hari</span>
          </span>
        </div>

        {/* Hari Gagal Mencapai Target */}
        <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl flex flex-col">
          <span className="text-[11px] font-medium text-zinc-500 flex items-center gap-1">
            <X className="w-3.5 h-3.5 text-zinc-400" /> Belum Capai
          </span>
          <span className="text-lg font-bold text-zinc-700 font-mono mt-1">
            {monthlyMetrics.targetMissedDays} <span className="text-xs font-normal text-zinc-400">hari</span>
          </span>
        </div>
      </div>

      {/* Calendar Grid Header (Sen - Min) */}
      <div className="grid grid-cols-7 gap-1.5 md:gap-2 mb-2 pt-2 text-center">
        {dayHeaders.map((head, idx) => (
          <div key={head} className={`text-xs font-semibold py-1 uppercase tracking-wider ${
            idx >= 5 ? "text-zinc-400" : "text-zinc-500"
          }`}>
            {head}
          </div>
        ))}
      </div>

      {/* Calendar Matrix */}
      <div className="grid grid-cols-7 gap-1.5 md:gap-2">
        {calendarDays.map((item, index) => {
          const hasTrades = item.trades.length > 0;
          const isPositive = item.netPnl > 0;
          const isNegative = item.netPnl < 0;
          const hitTarget = hasTrades && dailyTargetIdr > 0 && item.netPnl >= dailyTargetIdr;

          return (
            <div
              key={`${item.dateStr}-${index}`}
              onClick={() => {
                if (hasTrades) {
                  setSelectedDayTrades({
                    dateStr: item.dateStr,
                    trades: item.trades,
                    netPnl: item.netPnl,
                    netPercent: item.netPercent,
                  });
                }
              }}
              className={`min-h-[76px] md:min-h-[92px] rounded-xl p-1.5 md:p-2.5 flex flex-col justify-between transition-all select-none relative ${
                !item.isCurrentMonth
                  ? "bg-zinc-50/40 border border-zinc-100 text-zinc-300 opacity-60"
                  : hasTrades
                  ? isPositive
                    ? "bg-emerald-50/90 border border-emerald-200/90 text-emerald-950 hover:border-emerald-400 hover:shadow-sm cursor-pointer"
                    : isNegative
                    ? "bg-rose-50/90 border border-rose-200/90 text-rose-950 hover:border-rose-400 hover:shadow-sm cursor-pointer"
                    : "bg-zinc-100/70 border border-zinc-200 text-zinc-800 hover:border-zinc-300 hover:shadow-sm cursor-pointer"
                  : "bg-white border border-zinc-200/60 text-zinc-700 hover:border-zinc-300"
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between">
                <span className={`text-xs font-mono font-medium ${
                  item.isToday 
                    ? "w-5 h-5 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold"
                    : !item.isCurrentMonth
                    ? "text-zinc-400"
                    : "text-zinc-600"
                }`}>
                  {item.dayNumber}
                </span>

                <div className="flex items-center gap-1">
                  {hitTarget && (
                    <span 
                      className="text-[9px] px-1 py-0.2 rounded font-bold bg-emerald-600 text-white tracking-tight"
                      title={`Mencapai target harian (${formatIDR(dailyTargetIdr)})`}
                    >
                      🎯 Target
                    </span>
                  )}
                  {dailyLossLimitIdr !== undefined && dailyLossLimitIdr > 0 && item.netPnl < 0 && Math.abs(item.netPnl) >= dailyLossLimitIdr && (
                    <span 
                      className="text-[9px] px-1 py-0.2 rounded font-bold bg-rose-600 text-white tracking-tight"
                      title={`Melebihi batas kerugian harian (${formatIDR(dailyLossLimitIdr)})`}
                    >
                      ⚠️ Limit
                    </span>
                  )}
                  {hasTrades && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                      isPositive 
                        ? "bg-emerald-100/80 text-emerald-800" 
                        : isNegative 
                        ? "bg-rose-100/80 text-rose-800" 
                        : "bg-zinc-200 text-zinc-700"
                    }`}>
                      {item.trades.length}T
                    </span>
                  )}
                </div>
              </div>

              {/* Day Performance Info */}
              {hasTrades ? (
                <div className="mt-1 flex flex-col text-right">
                  <span className={`text-[11px] md:text-xs font-bold font-mono leading-tight ${
                    isPositive ? "text-emerald-700" : isNegative ? "text-rose-700" : "text-zinc-700"
                  }`}>
                    {formatIDR(item.netPnl, true)}
                  </span>
                  <span className={`text-[10px] md:text-[11px] font-mono font-semibold ${
                    isPositive ? "text-emerald-600" : isNegative ? "text-rose-600" : "text-zinc-500"
                  }`}>
                    {formatPercent(item.netPercent, true)}
                  </span>
                </div>
              ) : (
                <div className="h-4" />
              )}
            </div>
          );
        })}
      </div>

      {/* Day Details Modal */}
      {selectedDayTrades && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-lg shadow-2xl p-6 relative overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-zinc-100">
              <div>
                <div className="text-xs text-zinc-500 font-medium">Detail Performa Harian</div>
                <h3 className="text-lg font-bold text-zinc-900 font-display mt-0.5">
                  {new Date(selectedDayTrades.dateStr + "T00:00:00").toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDayTrades(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Daily Net Summary */}
            <div className="grid grid-cols-3 gap-3 py-4 my-2">
              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl">
                <span className="text-[11px] text-zinc-500 block">Total Trade</span>
                <span className="text-lg font-bold text-zinc-900 font-mono">
                  {selectedDayTrades.trades.length}
                </span>
              </div>
              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl col-span-2">
                <span className="text-[11px] text-zinc-500 block">Net P/L Hari Ini</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className={`text-lg font-bold font-mono ${
                    selectedDayTrades.netPnl > 0 ? "text-emerald-600" : selectedDayTrades.netPnl < 0 ? "text-rose-600" : "text-zinc-700"
                  }`}>
                    {formatIDR(selectedDayTrades.netPnl, true)}
                  </span>
                  <span className={`text-xs font-semibold font-mono ${
                    selectedDayTrades.netPercent > 0 ? "text-emerald-600" : selectedDayTrades.netPercent < 0 ? "text-rose-600" : "text-zinc-500"
                  }`}>
                    ({formatPercent(selectedDayTrades.netPercent, true)})
                  </span>
                </div>
              </div>
            </div>

            {/* Target Harian Comparison */}
            {dailyTargetIdr > 0 && (
              <div className="p-3 mb-3 bg-zinc-50/70 border border-zinc-200/80 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-600" />
                  <div>
                    <span className="text-zinc-500 text-[11px] block">Target Profit Harian</span>
                    <span className="font-mono font-bold text-zinc-900">{formatIDR(dailyTargetIdr)}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-zinc-500 block">Status Target</span>
                  {selectedDayTrades.netPnl >= dailyTargetIdr ? (
                    <span className="font-bold text-emerald-700 inline-flex items-center gap-1 font-mono">
                      ✓ Target Tercapai (+{formatIDR(selectedDayTrades.netPnl - dailyTargetIdr)})
                    </span>
                  ) : (
                    <span className="font-semibold text-zinc-600 font-mono">
                      Kurang {formatIDR(Math.max(0, dailyTargetIdr - selectedDayTrades.netPnl))}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Batas Kerugian Harian Comparison */}
            {dailyLossLimitIdr !== undefined && dailyLossLimitIdr > 0 && (
              <div className={`p-3 mb-3 rounded-xl flex items-center justify-between text-xs border ${
                selectedDayTrades.netPnl < 0 && Math.abs(selectedDayTrades.netPnl) >= dailyLossLimitIdr
                  ? "bg-rose-50/90 border-rose-200 text-rose-900"
                  : "bg-zinc-50/70 border-zinc-200/80 text-zinc-700"
              }`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${
                    selectedDayTrades.netPnl < 0 && Math.abs(selectedDayTrades.netPnl) >= dailyLossLimitIdr ? "text-rose-600" : "text-zinc-400"
                  }`} />
                  <div>
                    <span className="text-zinc-500 text-[11px] block">Batas Kerugian Harian</span>
                    <span className="font-mono font-bold text-zinc-900">{formatIDR(dailyLossLimitIdr)}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-zinc-500 text-[11px] block">Status Risiko</span>
                  {selectedDayTrades.netPnl < 0 && Math.abs(selectedDayTrades.netPnl) >= dailyLossLimitIdr ? (
                    <span className="font-bold text-rose-700 inline-flex items-center gap-1 font-mono">
                      ⚠️ Melebihi Batas (-{formatIDR(Math.abs(selectedDayTrades.netPnl))})
                    </span>
                  ) : (
                    <span className="font-semibold text-emerald-700 font-mono">
                      ✓ Dalam Batas Toleransi
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* List of Trades on this date */}
            <div className="mt-2 flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                Daftar Eksekusi ({selectedDayTrades.trades.length})
              </div>

              {selectedDayTrades.trades.map((trade) => {
                const isWin = trade.result === "win";
                const isLoss = trade.result === "loss";
                return (
                  <div
                    key={trade.id}
                    onClick={() => {
                      setSelectedDayTrades(null);
                      navigate(`/journal/${trade.id}`);
                    }}
                    className="p-3 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/70 transition-all flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-8 rounded-full ${
                        isWin ? "bg-emerald-500" : isLoss ? "bg-rose-500" : "bg-zinc-300"
                      }`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-zinc-900 font-display">
                            {trade.asset}
                          </span>
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            trade.direction === "buy" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}>
                            {trade.direction}
                          </span>
                          <span className="text-[10px] text-zinc-400 uppercase font-mono">
                            {trade.accountMode}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {trade.setupType || "Setup Bias"} • RR 1:{trade.rrRealized || trade.rrPlanned || "0.0"}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-3">
                      <div>
                        <div className={`font-mono text-sm font-bold ${
                          isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-600"
                        }`}>
                          {formatIDR(trade.pnlIdr || 0, true)}
                        </div>
                        <div className={`font-mono text-xs ${
                          isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-500"
                        }`}>
                          {formatPercent(trade.pnlPercent || 0, true)}
                        </div>
                      </div>
                      <ArrowUpRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-800 transition-colors" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Actions */}
            <div className="mt-5 pt-4 border-t border-zinc-100 flex justify-end">
              <button
                onClick={() => setSelectedDayTrades(null)}
                className="clean-button-secondary px-4 py-2 text-xs"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
