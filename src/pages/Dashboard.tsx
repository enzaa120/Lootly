import { useState, useMemo } from "react";
import { useAppStore, dedupeTrades } from "../store/AppContext";
import { formatIDR, formatPercent, formatProfitDual, cn } from "../lib/utils";
import { TradingCalendar } from "../components/ui/TradingCalendar";
import { 
  Plus, 
  ArrowUpRight, 
  Wallet, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  Activity, 
  ArrowRight,
  ShieldAlert,
  Calendar,
  Layers,
  ChevronRight,
  LineChart as LineChartIcon,
  Sparkles,
  BookOpen,
  CheckCircle2,
  AlertTriangle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

export function Dashboard() {
  const { accountMode, setAccountMode, settings, trades, transactions } = useAppStore();
  const navigate = useNavigate();

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filter for active account mode (Demo / Real)
  const modeTrades = useMemo(() => {
    return trades.filter((t) => t.accountMode === accountMode);
  }, [trades, accountMode]);

  const modeTransactions = useMemo(() => {
    return transactions.filter((t) => t.accountMode === accountMode);
  }, [transactions, accountMode]);

  const startingBalance = accountMode === "demo" 
    ? settings.startingBalanceDemo 
    : settings.startingBalanceReal;
  
  const targetBalance = accountMode === "demo" 
    ? settings.targetBalanceDemo 
    : settings.targetBalanceReal;

  // Realized Net PnL from trades
  const closedTrades = useMemo(() => {
    return modeTrades.filter((t) => t.result !== "open");
  }, [modeTrades]);

  const totalPnlIdr = useMemo(() => {
    return closedTrades.reduce((acc, t) => acc + (t.pnlIdr || 0), 0);
  }, [closedTrades]);

  const currentBalance = startingBalance + totalPnlIdr;

  const growthPercentage = startingBalance > 0 
    ? (totalPnlIdr / startingBalance) * 100 
    : 0;

  // Win Rate & Trade Counts
  const winTrades = useMemo(() => closedTrades.filter((t) => t.result === "win"), [closedTrades]);
  const lossTrades = useMemo(() => closedTrades.filter((t) => t.result === "loss"), [closedTrades]);
  const beTrades = useMemo(() => closedTrades.filter((t) => t.result === "breakeven"), [closedTrades]);

  const winRate = closedTrades.length > 0 
    ? (winTrades.length / closedTrades.length) * 100 
    : 0;

  // Average RR
  const avgRR = useMemo(() => {
    if (closedTrades.length === 0) return "0.0";
    const sum = closedTrades.reduce((acc, t) => acc + (t.rrRealized || t.rrPlanned || 0), 0);
    return (sum / closedTrades.length).toFixed(1);
  }, [closedTrades]);

  // Profit Factor = Total Win IDR / Total Loss IDR (absolute)
  const profitFactor = useMemo(() => {
    const totalWin = winTrades.reduce((acc, t) => acc + Math.max(0, t.pnlIdr || 0), 0);
    const totalLoss = lossTrades.reduce((acc, t) => acc + Math.abs(Math.min(0, t.pnlIdr || 0)), 0);
    if (totalLoss === 0) return totalWin > 0 ? "MAX" : "0.0";
    return (totalWin / totalLoss).toFixed(2);
  }, [winTrades, lossTrades]);

  // Target progress percentage
  const targetGain = targetBalance - startingBalance;
  const targetProgress = targetGain > 0 
    ? Math.max(0, (totalPnlIdr / targetGain) * 100) 
    : targetBalance > 0 
      ? Math.max(0, (currentBalance / targetBalance) * 100) 
      : 0;
  const remainingToTarget = Math.max(0, targetBalance - currentBalance);

  // Consecutive Loss Check (Connected to settings.stopAfterLosses)
  const consecutiveLossCount = useMemo(() => {
    const sorted = [...closedTrades].sort(
      (a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime()
    );
    let count = 0;
    for (const t of sorted) {
      if (t.result === "loss") {
        count++;
      } else {
        break;
      }
    }
    return count;
  }, [closedTrades]);

  const isConsecutiveLossLimitExceeded = consecutiveLossCount >= (settings.stopAfterLosses || 2);

  // Daily Loss Check (Connected to settings.maxDailyLossIdrDemo / maxDailyLossIdrReal)
  const today = new Date().toISOString().split("T")[0];
  const todayTrades = useMemo(() => {
    return closedTrades.filter((t) => (t.date ? t.date.split("T")[0] : t.createdAt?.split("T")[0]) === today);
  }, [closedTrades, today]);

  const todayNetPnl = useMemo(() => {
    return todayTrades.reduce((acc, t) => acc + (t.pnlIdr || 0), 0);
  }, [todayTrades]);

  // Nominal Batas Kerugian Harian (IDR)
  const maxDailyLossIdr = accountMode === "demo"
    ? (settings.maxDailyLossIdrDemo ?? 200000)
    : (settings.maxDailyLossIdrReal ?? 100000);

  const todayRealizedLoss = todayNetPnl < 0 ? Math.abs(todayNetPnl) : 0;
  const isDailyLossLimitExceeded = maxDailyLossIdr > 0 && todayRealizedLoss >= maxDailyLossIdr;

  // Daily Trading Plan targets & progress (from Settings)
  const dailyTargetIdr = accountMode === "demo"
    ? (settings.dailyProfitTargetDemoIdr ?? 300000)
    : (settings.dailyProfitTargetRealIdr ?? 500000);

  const dailyTargetPercent = accountMode === "demo"
    ? (settings.dailyProfitTargetDemoPercent ?? 10)
    : (settings.dailyProfitTargetRealPercent ?? 10);

  const dailyProgressPercent = dailyTargetIdr > 0 
    ? (todayNetPnl / dailyTargetIdr) * 100 
    : 0;

  const dailyPlanStatus = useMemo(() => {
    if (dailyTargetIdr <= 0) {
      return {
        label: "Belum Ditetapkan",
        badgeClass: "bg-zinc-100 text-zinc-600 border-zinc-200",
      };
    }
    if (todayNetPnl >= dailyTargetIdr * 1.05) {
      return {
        label: "Melebihi Target",
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold",
      };
    }
    if (todayNetPnl >= dailyTargetIdr) {
      return {
        label: "Target Tercapai",
        badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold",
      };
    }
    if (todayNetPnl > 0) {
      return {
        label: "On Track",
        badgeClass: "bg-blue-50 text-blue-700 border-blue-200 font-semibold",
      };
    }
    if (todayNetPnl < 0) {
      return {
        label: "Belum Tercapai (Drawdown)",
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200 font-semibold",
      };
    }
    return {
      label: "Belum Tercapai",
      badgeClass: "bg-zinc-100 text-zinc-600 border-zinc-200 font-medium",
    };
  }, [todayNetPnl, dailyTargetIdr]);

  // Cumulative Equity series for Small Performance Chart
  const equityData = useMemo(() => {
    if (closedTrades.length === 0) {
      return [
        { date: "Mulai", balance: startingBalance, pnl: 0 },
        { date: "Sekarang", balance: startingBalance, pnl: 0 },
      ];
    }

    // Sort chronologically ascending
    const sorted = [...closedTrades].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let runningBalance = startingBalance;
    const points = [{ date: "Awal", balance: startingBalance, pnl: 0 }];

    sorted.forEach((t, i) => {
      runningBalance += (t.pnlIdr || 0);
      const label = t.date ? t.date.split("T")[0].substring(5) : `T${i + 1}`;
      points.push({
        date: label,
        balance: runningBalance,
        pnl: t.pnlIdr || 0,
      });
    });

    return points;
  }, [closedTrades, startingBalance]);

  // Monthly summary metrics (current calendar month)
  const currentMonthSummary = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    const thisMonthTrades = closedTrades.filter((t) => {
      const d = new Date(t.date || t.createdAt);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });

    const netPnl = thisMonthTrades.reduce((acc, t) => acc + (t.pnlIdr || 0), 0);
    const growth = startingBalance > 0 ? (netPnl / startingBalance) * 100 : 0;
    const wins = thisMonthTrades.filter((t) => t.result === "win").length;
    const losses = thisMonthTrades.filter((t) => t.result === "loss").length;

    return {
      tradesCount: thisMonthTrades.length,
      netPnl,
      growth,
      wins,
      losses,
    };
  }, [closedTrades, startingBalance]);

  // Recent 5 trades (deduplicated)
  const recentTrades = useMemo(() => {
    return dedupeTrades(modeTrades)
      .sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime())
      .slice(0, 5);
  }, [modeTrades]);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-8">
      
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 text-white text-xs px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header & Account Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold font-display text-zinc-950 tracking-tight">
              Dashboard Trading
            </h1>
            <span className={cn(
              "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border shadow-2xs",
              accountMode === "real" 
                ? "bg-emerald-50 text-emerald-800 border-emerald-200/80" 
                : "bg-blue-50 text-blue-800 border-blue-200/80"
            )}>
              <span className={cn(
                "w-1.5 h-1.5 rounded-full",
                accountMode === "real" ? "bg-emerald-500" : "bg-blue-500"
              )} />
              <span className="capitalize">{accountMode} Mode</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-zinc-500 mt-1">
            Ringkasan modal, performa profit/loss, dan riwayat jurnal terkini.
          </p>
        </div>

        {/* Top Controls: Account Switcher & Primary Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Demo / Real Switcher */}
          <div 
            id="dashboard-account-switcher"
            className="bg-zinc-100/90 p-1 rounded-xl flex items-center border border-zinc-200/80 shadow-2xs select-none"
          >
            <button
              type="button"
              onClick={() => setAccountMode("demo")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                accountMode === "demo"
                  ? "bg-white text-zinc-900 shadow-2xs border border-zinc-200/60"
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full transition-colors", accountMode === "demo" ? "bg-blue-500" : "bg-zinc-300")} />
              <span>Demo</span>
            </button>
            <button
              type="button"
              onClick={() => setAccountMode("real")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer",
                accountMode === "real"
                  ? "bg-white text-zinc-900 shadow-2xs border border-zinc-200/60"
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full transition-colors", accountMode === "real" ? "bg-emerald-500" : "bg-zinc-300")} />
              <span>Real</span>
            </button>
          </div>

          {/* + Tambah Trade */}
          <button
            id="btn-dashboard-add-trade"
            onClick={() => navigate("/add")}
            className="clean-button-primary px-3.5 py-2 text-xs flex items-center gap-1.5 shadow-xs whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Trade</span>
          </button>

          {/* Upload Screenshot Trade */}
          <button
            id="btn-dashboard-upload-screenshot"
            onClick={() => navigate("/add?mode=screenshot")}
            className="px-3.5 py-2 rounded-xl bg-white border border-zinc-200/90 hover:border-zinc-300 hover:bg-zinc-50 text-xs font-semibold text-zinc-800 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden xs:inline">Upload Screenshot</span>
            <span className="xs:hidden">Upload</span>
          </button>

          {/* Lihat Journal */}
          <button
            id="btn-dashboard-view-journal"
            onClick={() => navigate("/journal")}
            className="px-3 py-2 rounded-xl text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lihat Journal</span>
          </button>
        </div>
      </div>

      {/* Discipline & Risk Warning Banners (Driven by Settings) */}
      {isDailyLossLimitExceeded && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-3 animate-in fade-in">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-bold text-rose-950">
              Batas Kerugian Harian Terlampaui (-{formatIDR(todayRealizedLoss)} / Batas {formatIDR(maxDailyLossIdr)})
            </h4>
            <p className="text-rose-800">
              Kerugian bersih akun {accountMode.toUpperCase()} hari ini telah mencapai -{formatIDR(todayRealizedLoss)}, melewati batas toleransi kerugian harian Anda ({formatIDR(maxDailyLossIdr)}). Disarankan tidak membuka posisi baru hari ini demi melindungi modal Anda dan mencegah revenge trading.
            </p>
          </div>
        </div>
      )}

      {isConsecutiveLossLimitExceeded && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-bold text-amber-950">
              Peringatan Disiplin & Psikologi: {consecutiveLossCount} Loss Berturut-turut
            </h4>
            <p className="text-amber-800">
              Anda telah mengalami {consecutiveLossCount} loss berturut-turut pada akun {accountMode} (batas aturan di Pengaturan: {settings.stopAfterLosses}). Istirahat sejenak dan evaluasi jurnal sebelum melakukan trade berikutnya untuk menghindari revenge trading.
            </p>
          </div>
        </div>
      )}

      {/* 2. Account Summary & Trading Plan Harian */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Main Account Balance Card (Col 1-6) */}
        <div className="lg:col-span-6 clean-card p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-zinc-500 text-xs font-medium">
              <span className="flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-zinc-400" /> Saldo Akun Saat Ini
              </span>
              <span className="text-[11px] font-mono text-zinc-400">Modal: {formatIDR(startingBalance)}</span>
            </div>
            
            <div className="text-3xl md:text-4xl font-bold font-mono text-zinc-900 mt-3 tracking-tight">
              {formatIDR(currentBalance)}
            </div>

            {/* Total Profit/Loss Dual Display (IDR + %) */}
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1 font-mono text-sm font-bold ${
                totalPnlIdr > 0 ? "text-emerald-600" : totalPnlIdr < 0 ? "text-rose-600" : "text-zinc-600"
              }`}>
                {totalPnlIdr > 0 ? <TrendingUp className="w-4 h-4" /> : totalPnlIdr < 0 ? <TrendingDown className="w-4 h-4" /> : null}
                {formatProfitDual(totalPnlIdr, growthPercentage)}
              </span>
              <span className="text-xs text-zinc-400 font-sans">sepanjang waktu</span>
            </div>
          </div>

          {/* Target Balance Progress Bar (Connected to Settings Target) */}
          <div className="mt-6 pt-4 border-t border-zinc-100">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-zinc-500 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-zinc-400" /> Target Saldo: {formatIDR(targetBalance)}
              </span>
              <span className="font-mono font-semibold text-zinc-700">
                {targetProgress.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-700" 
                style={{ width: `${Math.min(100, Math.max(0, targetProgress))}%` }} 
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-1.5">
              <span>Sisa untuk target saldo:</span>
              <span className="font-mono font-semibold text-zinc-600">
                {remainingToTarget > 0 ? formatIDR(remainingToTarget) : "Target Tercapai! 🎉"}
              </span>
            </div>
          </div>
        </div>

        {/* Trading Plan Harian Progress Card (Col 7-12) */}
        <div className="lg:col-span-6 clean-card p-6 flex flex-col justify-between bg-white relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
                <Target className="w-4 h-4 text-emerald-600" /> Trading Plan Hari Ini
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs border ${dailyPlanStatus.badgeClass}`}>
                {dailyPlanStatus.label}
              </span>
            </div>

            {/* Realized today vs Target Info */}
            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-[11px] text-zinc-400 font-medium block">Realisasi P/L Hari Ini</span>
                <div className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight mt-0.5 ${
                  todayNetPnl > 0 ? "text-emerald-600" : todayNetPnl < 0 ? "text-rose-600" : "text-zinc-700"
                }`}>
                  {formatIDR(todayNetPnl, true)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-zinc-400 font-medium block">Target Profit Harian</span>
                <span className="text-sm sm:text-base font-bold font-mono text-zinc-800">
                  {formatIDR(dailyTargetIdr)}
                </span>
                <span className="text-xs font-semibold text-emerald-600 font-mono block">
                  ({dailyTargetPercent}%)
                </span>
              </div>
            </div>
          </div>

          {/* Progress toward daily target */}
          <div className="mt-6 pt-4 border-t border-zinc-100">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-zinc-500 font-medium">
                Pencapaian Target Hari Ini
              </span>
              <span className="font-mono font-bold text-zinc-800">
                {dailyProgressPercent.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-700 ${
                  todayNetPnl >= dailyTargetIdr 
                    ? "bg-emerald-500" 
                    : todayNetPnl > 0 
                    ? "bg-blue-500" 
                    : "bg-zinc-300"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, dailyProgressPercent))}%` }} 
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2">
              <span>
                {todayNetPnl >= dailyTargetIdr ? (
                  <span className="text-emerald-700 font-medium">
                    Surplus: +{formatIDR(todayNetPnl - dailyTargetIdr)}
                  </span>
                ) : (
                  <span>
                    Sisa target: <strong className="font-mono text-zinc-700">{formatIDR(Math.max(0, dailyTargetIdr - todayNetPnl))}</strong>
                  </span>
                )}
              </span>
              <button
                onClick={() => navigate("/settings")}
                className="text-zinc-600 hover:text-zinc-900 font-medium hover:underline cursor-pointer"
              >
                Sesuaikan Plan →
              </button>
            </div>
          </div>
        </div>

        {/* Quick Performance Stats Grid (Col 1-12) */}
        <div className="lg:col-span-12 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Win Rate */}
          <div className="clean-card p-4 flex flex-col justify-between">
            <span className="text-xs text-zinc-500 font-medium">Win Rate</span>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-zinc-900">
                {winRate.toFixed(1)}%
              </div>
              <span className="text-[11px] text-zinc-400 font-mono">
                {winTrades.length}W - {lossTrades.length}L
              </span>
            </div>
            <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full" style={{ width: `${winRate}%` }} />
            </div>
          </div>

          {/* Total Trades */}
          <div className="clean-card p-4 flex flex-col justify-between">
            <span className="text-xs text-zinc-500 font-medium">Total Trade</span>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-zinc-900">
                {closedTrades.length}
              </div>
              <span className="text-[11px] text-zinc-400">
                {modeTrades.filter((t) => t.result === "open").length} posisi terbuka
              </span>
            </div>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Tercatat</span>
          </div>

          {/* Average RR */}
          <div className="clean-card p-4 flex flex-col justify-between">
            <span className="text-xs text-zinc-500 font-medium">Rata-rata RR</span>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-zinc-900">
                1:{avgRR}
              </div>
              <span className="text-[11px] text-zinc-400 font-sans">Risk / Reward</span>
            </div>
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">Realized</span>
          </div>

          {/* Profit Factor */}
          <div className="clean-card p-4 flex flex-col justify-between">
            <span className="text-xs text-zinc-500 font-medium">Profit Factor</span>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-zinc-900">
                {profitFactor}
              </div>
              <span className="text-[11px] text-zinc-400">Gross Win / Loss</span>
            </div>
            <span className={`text-[10px] font-semibold uppercase ${
              Number(profitFactor) >= 1.5 ? "text-emerald-600" : "text-zinc-500"
            }`}>
              {Number(profitFactor) >= 1.5 ? "Sehat" : "Perlu Evaluasi"}
            </span>
          </div>

          {/* Monthly Profit Overview Banner (spans all 4 cols) */}
          <div className="col-span-2 sm:col-span-4 clean-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/70">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-700 shrink-0">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs text-zinc-500 font-medium block">
                  Ringkasan Bulan Ini ({currentMonthSummary.tradesCount} Trade)
                </span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className={`text-base font-bold font-mono ${
                    currentMonthSummary.netPnl > 0 ? "text-emerald-600" : currentMonthSummary.netPnl < 0 ? "text-rose-600" : "text-zinc-700"
                  }`}>
                    {formatIDR(currentMonthSummary.netPnl, true)}
                  </span>
                  <span className={`text-xs font-semibold font-mono ${
                    currentMonthSummary.growth > 0 ? "text-emerald-600" : currentMonthSummary.growth < 0 ? "text-rose-600" : "text-zinc-500"
                  }`}>
                    ({formatPercent(currentMonthSummary.growth, true)})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono text-zinc-500">
              <span className="text-emerald-700 font-semibold">{currentMonthSummary.wins} Menang</span>
              <span>•</span>
              <span className="text-rose-700 font-semibold">{currentMonthSummary.losses} Kalah</span>
              <button
                onClick={() => navigate("/analytics")}
                className="text-xs font-medium text-zinc-900 hover:underline flex items-center gap-0.5 ml-2 cursor-pointer"
              >
                Analitik Detail <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* 2. Kalender Performa Trading (Moved to higher position as requested) */}
      <TradingCalendar 
        trades={modeTrades} 
        startingBalance={startingBalance} 
        dailyTargetIdr={dailyTargetIdr} 
        dailyLossLimitIdr={maxDailyLossIdr}
      />

      {/* 3. Kurva Pertumbuhan Akun (Equity Curve) (Placed below calendar) */}
      <div className="clean-card p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-zinc-900 font-display flex items-center gap-2">
              <LineChartIcon className="w-4 h-4 text-zinc-500" />
              Kurva Pertumbuhan Akun (Equity Curve)
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Perkembangan saldo akun kumulatif dari setiap trade yang ditutup.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-zinc-400 block font-mono">Net Profit</span>
            <span className={`text-sm font-bold font-mono ${
              totalPnlIdr > 0 ? "text-emerald-600" : totalPnlIdr < 0 ? "text-rose-600" : "text-zinc-700"
            }`}>
              {formatIDR(totalPnlIdr, true)}
            </span>
          </div>
        </div>

        <div className="h-[220px] min-h-[220px] w-full min-w-0 mt-2">
          <ResponsiveContainer width="100%" height={220} minWidth={0} minHeight={220}>
            <AreaChart data={equityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={totalPnlIdr >= 0 ? "#16a34a" : "#dc2626"} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={totalPnlIdr >= 0 ? "#16a34a" : "#dc2626"} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
              <XAxis 
                dataKey="date" 
                stroke="#a1a1aa" 
                fontSize={11} 
                tickLine={false}
                axisLine={{ stroke: '#e4e4e7' }}
              />
              <YAxis 
                stroke="#a1a1aa" 
                fontSize={11} 
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `Rp ${(val / 1000000).toFixed(1)}jt`}
                domain={['auto', 'auto']}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white border border-zinc-200 rounded-xl shadow-lg p-3 text-xs">
                        <span className="font-semibold text-zinc-900 block mb-1">{data.date}</span>
                        <div className="font-mono text-zinc-600">
                          Saldo: <span className="font-bold text-zinc-900">{formatIDR(data.balance)}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="balance" 
                stroke={totalPnlIdr >= 0 ? "#16a34a" : "#dc2626"} 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#equityGrad)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 5. Recent Trades Table */}
      <div className="clean-card p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-zinc-900 font-display">
              Riwayat Trade Terbaru
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              5 eksekusi terakhir di akun {accountMode}.
            </p>
          </div>
          <button
            onClick={() => navigate("/journal")}
            className="text-xs font-semibold text-zinc-900 hover:text-zinc-600 flex items-center gap-1 cursor-pointer transition-colors"
          >
            Lihat Semua di Jurnal <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentTrades.length === 0 ? (
          <div className="py-12 text-center flex flex-col items-center justify-center border border-dashed border-zinc-200 rounded-xl bg-zinc-50/50">
            <Layers className="w-8 h-8 text-zinc-300 mb-2" />
            <p className="text-sm font-semibold text-zinc-700">Belum ada trade yang dicatat</p>
            <p className="text-xs text-zinc-400 mt-0.5 mb-4">
              Mulai catat trade pertamamu untuk melacak performa & pertumbuhan modal.
            </p>
            <button
              onClick={() => navigate("/add")}
              className="clean-button-primary px-4 py-2 text-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Catat Trade Pertama
            </button>
          </div>
        ) : (
          <div>
            {/* Mobile Cards (< 768px) */}
            <div className="md:hidden divide-y divide-zinc-100">
              {recentTrades.map((t) => {
                const isWin = t.result === "win";
                const isLoss = t.result === "loss";
                return (
                  <div
                    key={`dash-mob-${t.id}`}
                    onClick={() => navigate(`/journal/${t.id}`)}
                    className="py-3.5 hover:bg-zinc-50/80 transition-colors cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          isWin ? "bg-emerald-500" : isLoss ? "bg-rose-500" : "bg-zinc-300"
                        }`} />
                        <span className="font-bold text-sm text-zinc-900 font-display">{t.asset}</span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          t.direction === "buy" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}>
                          {t.direction}
                        </span>
                      </div>
                      <div className="text-right font-mono">
                        <span className={`font-bold text-sm ${isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-700"}`}>
                          {formatIDR(t.pnlIdr || 0, true)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
                      <div>
                        {t.date ? t.date.split("T")[0] : "-"}
                        {t.session && <span className="text-zinc-400 ml-1">({t.session})</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-400"}`}>
                          {formatPercent(t.pnlPercent || 0, true)}
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
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
                  <tr className="border-b border-zinc-100 text-zinc-400 font-medium">
                    <th className="pb-3 pl-1 font-semibold uppercase tracking-wider">Aset & Arah</th>
                    <th className="pb-3 font-semibold uppercase tracking-wider">Tanggal & Sesi</th>
                    <th className="pb-3 font-semibold uppercase tracking-wider">Setup</th>
                    <th className="pb-3 font-semibold uppercase tracking-wider text-center">RR</th>
                    <th className="pb-3 font-semibold uppercase tracking-wider text-right">Hasil (Nominal & %)</th>
                    <th className="pb-3 pr-1 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 font-sans">
                  {recentTrades.map((t) => {
                    const isWin = t.result === "win";
                    const isLoss = t.result === "loss";
                    return (
                      <tr 
                        key={t.id}
                        onClick={() => navigate(`/journal/${t.id}`)}
                        className="hover:bg-zinc-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 pl-1">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${
                              isWin ? "bg-emerald-500" : isLoss ? "bg-rose-500" : "bg-zinc-300"
                            }`} />
                            <span className="font-bold text-zinc-900">{t.asset}</span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.2 rounded ${
                              t.direction === "buy" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                            }`}>
                              {t.direction}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 text-zinc-600 font-mono">
                          {t.date ? t.date.split("T")[0] : "-"}
                          {t.session && <span className="text-zinc-400 ml-1.5 font-sans">({t.session})</span>}
                        </td>
                        <td className="py-3 text-zinc-600">
                          {t.setupType || "-"}
                        </td>
                        <td className="py-3 text-center font-mono font-semibold text-zinc-700">
                          1:{t.rrRealized || t.rrPlanned || "0.0"}
                        </td>
                        <td className="py-3 text-right">
                          <div className={`font-mono font-bold text-xs ${
                            isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-600"
                          }`}>
                            {formatIDR(t.pnlIdr || 0, true)}
                          </div>
                          <div className={`font-mono text-[11px] ${
                            isWin ? "text-emerald-600" : isLoss ? "text-rose-600" : "text-zinc-400"
                          }`}>
                            {formatPercent(t.pnlPercent || 0, true)}
                          </div>
                        </td>
                        <td className="py-3 pr-1 text-right">
                          <span className="text-zinc-400 group-hover:text-zinc-900 inline-flex items-center gap-1 font-medium transition-colors">
                            Detail <ArrowUpRight className="w-3.5 h-3.5" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
