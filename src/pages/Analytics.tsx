import { useState, useMemo } from "react";
import { useAppStore, dedupeTrades } from "../store/AppContext";
import { formatIDR, formatPercent, formatProfitDual } from "../lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Award,
  Calendar,
  Layers,
  BarChart3,
  PieChart as PieChartIcon,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  CheckCircle2
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from "recharts";

export function Analytics() {
  const { trades, accountMode, setAccountMode, settings } = useAppStore();

  const [selectedMode, setSelectedMode] = useState<"demo" | "real">(accountMode);

  const startingBalance = selectedMode === "demo" 
    ? settings.startingBalanceDemo 
    : settings.startingBalanceReal;

  const modeTrades = useMemo(() => {
    return dedupeTrades(trades).filter((t) => t.accountMode === selectedMode);
  }, [trades, selectedMode]);

  const closedTrades = useMemo(() => {
    return modeTrades.filter((t) => t.result !== "open");
  }, [modeTrades]);

  // Overall Metrics
  const winTrades = useMemo(() => closedTrades.filter((t) => t.result === "win"), [closedTrades]);
  const lossTrades = useMemo(() => closedTrades.filter((t) => t.result === "loss"), [closedTrades]);
  const beTrades = useMemo(() => closedTrades.filter((t) => t.result === "breakeven"), [closedTrades]);

  const totalTradesCount = closedTrades.length;
  const winRate = totalTradesCount > 0 ? (winTrades.length / totalTradesCount) * 100 : 0;

  const totalPnlIdr = useMemo(() => {
    return closedTrades.reduce((acc, t) => acc + (t.pnlIdr || 0), 0);
  }, [closedTrades]);

  const totalGrowthPercent = startingBalance > 0 ? (totalPnlIdr / startingBalance) * 100 : 0;

  // Average Win & Average Loss
  const grossWin = useMemo(() => {
    return winTrades.reduce((acc, t) => acc + Math.max(0, t.pnlIdr || 0), 0);
  }, [winTrades]);

  const grossLoss = useMemo(() => {
    return lossTrades.reduce((acc, t) => acc + Math.abs(Math.min(0, t.pnlIdr || 0)), 0);
  }, [lossTrades]);

  const avgWin = winTrades.length > 0 ? grossWin / winTrades.length : 0;
  const avgLoss = lossTrades.length > 0 ? grossLoss / lossTrades.length : 0;

  // Profit Factor
  const profitFactor = useMemo(() => {
    if (grossLoss === 0) return grossWin > 0 ? "MAX" : "0.0";
    return (grossWin / grossLoss).toFixed(2);
  }, [grossWin, grossLoss]);

  // Best Trade & Worst Trade
  const bestTrade = useMemo(() => {
    if (closedTrades.length === 0) return null;
    return [...closedTrades].sort((a, b) => (b.pnlIdr || 0) - (a.pnlIdr || 0))[0];
  }, [closedTrades]);

  const worstTrade = useMemo(() => {
    if (closedTrades.length === 0) return null;
    return [...closedTrades].sort((a, b) => (a.pnlIdr || 0) - (b.pnlIdr || 0))[0];
  }, [closedTrades]);

  // Performance by Pair / Asset
  const assetPerformance = useMemo(() => {
    const map = new Map<string, { total: number; wins: number; pnl: number }>();
    closedTrades.forEach((t) => {
      const pair = t.asset || "Lainnya";
      if (!map.has(pair)) {
        map.set(pair, { total: 0, wins: 0, pnl: 0 });
      }
      const item = map.get(pair)!;
      item.total++;
      if (t.result === "win") item.wins++;
      item.pnl += (t.pnlIdr || 0);
    });

    return Array.from(map.entries()).map(([asset, val]) => ({
      asset,
      total: val.total,
      winRate: (val.wins / val.total) * 100,
      pnl: val.pnl,
      growth: startingBalance > 0 ? (val.pnl / startingBalance) * 100 : 0,
    })).sort((a, b) => b.pnl - a.pnl);
  }, [closedTrades, startingBalance]);

  // Performance by Market (Forex vs Crypto)
  const marketPerformance = useMemo(() => {
    let forexCount = 0;
    let forexWins = 0;
    let forexPnl = 0;

    let cryptoCount = 0;
    let cryptoWins = 0;
    let cryptoPnl = 0;

    closedTrades.forEach((t) => {
      const isCrypto = t.marketType === "crypto" || 
        (t.asset && (t.asset.includes("BTC") || t.asset.includes("ETH") || t.asset.includes("SOL")));
      
      if (isCrypto) {
        cryptoCount++;
        if (t.result === "win") cryptoWins++;
        cryptoPnl += (t.pnlIdr || 0);
      } else {
        forexCount++;
        if (t.result === "win") forexWins++;
        forexPnl += (t.pnlIdr || 0);
      }
    });

    return {
      forex: {
        total: forexCount,
        winRate: forexCount > 0 ? (forexWins / forexCount) * 100 : 0,
        pnl: forexPnl,
        growth: startingBalance > 0 ? (forexPnl / startingBalance) * 100 : 0,
      },
      crypto: {
        total: cryptoCount,
        winRate: cryptoCount > 0 ? (cryptoWins / cryptoCount) * 100 : 0,
        pnl: cryptoPnl,
        growth: startingBalance > 0 ? (cryptoPnl / startingBalance) * 100 : 0,
      },
    };
  }, [closedTrades, startingBalance]);

  // Performance by Direction (Buy / Long vs Sell / Short)
  const directionPerformance = useMemo(() => {
    let buyCount = 0;
    let buyWins = 0;
    let buyPnl = 0;

    let sellCount = 0;
    let sellWins = 0;
    let sellPnl = 0;

    closedTrades.forEach((t) => {
      if (t.direction === "buy") {
        buyCount++;
        if (t.result === "win") buyWins++;
        buyPnl += (t.pnlIdr || 0);
      } else {
        sellCount++;
        if (t.result === "win") sellWins++;
        sellPnl += (t.pnlIdr || 0);
      }
    });

    return {
      buy: {
        total: buyCount,
        winRate: buyCount > 0 ? (buyWins / buyCount) * 100 : 0,
        pnl: buyPnl,
        growth: startingBalance > 0 ? (buyPnl / startingBalance) * 100 : 0,
      },
      sell: {
        total: sellCount,
        winRate: sellCount > 0 ? (sellWins / sellCount) * 100 : 0,
        pnl: sellPnl,
        growth: startingBalance > 0 ? (sellPnl / startingBalance) * 100 : 0,
      },
    };
  }, [closedTrades, startingBalance]);

  // Performance by Day of Week (Senin - Minggu)
  const dayOfWeekPerformance = useMemo(() => {
    const days = [
      { name: "Senin", dayIdx: 1, total: 0, wins: 0, pnl: 0 },
      { name: "Selasa", dayIdx: 2, total: 0, wins: 0, pnl: 0 },
      { name: "Rabu", dayIdx: 3, total: 0, wins: 0, pnl: 0 },
      { name: "Kamis", dayIdx: 4, total: 0, wins: 0, pnl: 0 },
      { name: "Jumat", dayIdx: 5, total: 0, wins: 0, pnl: 0 },
      { name: "Sabtu", dayIdx: 6, total: 0, wins: 0, pnl: 0 },
      { name: "Minggu", dayIdx: 0, total: 0, wins: 0, pnl: 0 },
    ];

    closedTrades.forEach((t) => {
      const d = new Date(t.date || t.createdAt);
      const dayIdx = d.getDay();
      const target = days.find((item) => item.dayIdx === dayIdx);
      if (target) {
        target.total++;
        if (t.result === "win") target.wins++;
        target.pnl += (t.pnlIdr || 0);
      }
    });

    return days.map((d) => ({
      ...d,
      winRate: d.total > 0 ? (d.wins / d.total) * 100 : 0,
    }));
  }, [closedTrades]);

  // Monthly Breakdown
  const monthlyBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; wins: number; losses: number; pnl: number }>();
    
    closedTrades.forEach((t) => {
      const d = new Date(t.date || t.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, { total: 0, wins: 0, losses: 0, pnl: 0 });
      }
      const item = map.get(key)!;
      item.total++;
      if (t.result === "win") item.wins++;
      if (t.result === "loss") item.losses++;
      item.pnl += (t.pnlIdr || 0);
    });

    const monthLabels: Record<string, string> = {
      "01": "Januari", "02": "Februari", "03": "Maret", "04": "April",
      "05": "Mei", "06": "Juni", "07": "Juli", "08": "Agustus",
      "09": "September", "10": "Oktober", "11": "November", "12": "Desember"
    };

    return Array.from(map.entries()).map(([key, data]) => {
      const [y, m] = key.split("-");
      const label = `${monthLabels[m] || m} ${y}`;
      return {
        key,
        label,
        ...data,
        winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
        growth: startingBalance > 0 ? (data.pnl / startingBalance) * 100 : 0,
      };
    }).sort((a, b) => b.key.localeCompare(a.key));
  }, [closedTrades, startingBalance]);

  // Daily Trading Plan Target Analytics
  const dailyTargetIdr = selectedMode === "demo"
    ? (settings.dailyProfitTargetDemoIdr ?? 300000)
    : (settings.dailyProfitTargetRealIdr ?? 500000);

  const dailyTargetPercent = selectedMode === "demo"
    ? (settings.dailyProfitTargetDemoPercent ?? 10)
    : (settings.dailyProfitTargetRealPercent ?? 10);

  // Group trades by day to evaluate daily target hit consistency
  const dailyAnalytics = useMemo(() => {
    const map = new Map<string, { dateStr: string; tradesCount: number; netPnl: number; wins: number; losses: number }>();

    closedTrades.forEach((t) => {
      const dStr = (t.date ? t.date.split("T")[0] : t.createdAt?.split("T")[0]) || "Unknown";
      if (!map.has(dStr)) {
        map.set(dStr, { dateStr: dStr, tradesCount: 0, netPnl: 0, wins: 0, losses: 0 });
      }
      const item = map.get(dStr)!;
      item.tradesCount++;
      item.netPnl += (t.pnlIdr || 0);
      if (t.result === "win") item.wins++;
      if (t.result === "loss") item.losses++;
    });

    const daysList = Array.from(map.values()).map((d) => ({
      ...d,
      netPercent: startingBalance > 0 ? (d.netPnl / startingBalance) * 100 : 0,
      hitTarget: dailyTargetIdr > 0 ? d.netPnl >= dailyTargetIdr : false,
    }));

    const totalActiveDays = daysList.length;
    const targetHitDays = daysList.filter((d) => d.hitTarget).length;
    const hitRate = totalActiveDays > 0 ? (targetHitDays / totalActiveDays) * 100 : 0;
    const avgDailyPnl = totalActiveDays > 0 ? (totalPnlIdr / totalActiveDays) : 0;
    const avgDailyGainPercent = totalActiveDays > 0 
      ? (daysList.reduce((acc, d) => acc + d.netPercent, 0) / totalActiveDays) 
      : 0;

    const sortedByPnl = [...daysList].sort((a, b) => b.netPnl - a.netPnl);
    const bestDay = sortedByPnl.length > 0 && sortedByPnl[0].netPnl > 0 ? sortedByPnl[0] : null;
    const worstDay = sortedByPnl.length > 0 && sortedByPnl[sortedByPnl.length - 1].netPnl < 0 ? sortedByPnl[sortedByPnl.length - 1] : null;

    // Monthly Target Progress (Target 20 hari aktif trading per bulan)
    const monthlyTargetNominal = dailyTargetIdr * 20;
    const currentMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const currentMonthRecord = monthlyBreakdown.find((m) => m.key === currentMonthKey);
    const currentMonthPnl = currentMonthRecord ? currentMonthRecord.pnl : 0;
    const monthlyHitRate = monthlyTargetNominal > 0 ? (currentMonthPnl / monthlyTargetNominal) * 100 : 0;

    return {
      totalActiveDays,
      targetHitDays,
      hitRate,
      avgDailyPnl,
      avgDailyGainPercent,
      bestDay,
      worstDay,
      monthlyTargetNominal,
      currentMonthPnl,
      monthlyHitRate
    };
  }, [closedTrades, startingBalance, dailyTargetIdr, totalPnlIdr, monthlyBreakdown]);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 md:px-8 py-6 space-y-8">
      
      {/* 1. Header & Account Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-bold font-display text-zinc-950 tracking-tight">
              Analitik Performa
            </h1>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border shadow-2xs ${
              selectedMode === "real" 
                ? "bg-emerald-50 text-emerald-800 border-emerald-200/80" 
                : "bg-blue-50 text-blue-800 border-blue-200/80"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${selectedMode === "real" ? "bg-emerald-500" : "bg-blue-500"}`} />
              <span className="capitalize">{selectedMode} Mode</span>
            </span>
          </div>
          <p className="text-xs md:text-sm text-zinc-500 mt-1">
            Statistik objektif untuk mengukur konsistensi, rasio keuntungan, dan kebiasaan trading.
          </p>
        </div>

        {/* Account Mode Switcher */}
        <div 
          id="analytics-account-switcher"
          className="flex items-center bg-zinc-100/90 p-1 rounded-xl border border-zinc-200/80 shadow-2xs select-none self-start sm:self-auto"
        >
          <button
            type="button"
            onClick={() => setSelectedMode("demo")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedMode === "demo"
                ? "bg-white text-zinc-900 shadow-2xs border border-zinc-200/60"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${selectedMode === "demo" ? "bg-blue-500" : "bg-zinc-300"}`} />
            <span>Demo</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedMode("real")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              selectedMode === "real"
                ? "bg-white text-zinc-900 shadow-2xs border border-zinc-200/60"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${selectedMode === "real" ? "bg-emerald-500" : "bg-zinc-300"}`} />
            <span>Real</span>
          </button>
        </div>
      </div>

      {/* 2. Top Key Performance Indicators (IDR & %) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Trades & Win Rate */}
        <div className="clean-card p-5 flex flex-col justify-between">
          <span className="text-xs text-zinc-500 font-medium">Total Trade & Win Rate</span>
          <div className="my-2">
            <div className="text-2xl md:text-3xl font-bold font-mono text-zinc-900">
              {winRate.toFixed(1)}%
            </div>
            <span className="text-xs text-zinc-500 font-mono">
              {totalTradesCount} trade ({winTrades.length}W - {lossTrades.length}L)
            </span>
          </div>
          <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full" style={{ width: `${winRate}%` }} />
          </div>
        </div>

        {/* Total Profit / Loss (Dual) */}
        <div className="clean-card p-5 flex flex-col justify-between">
          <span className="text-xs text-zinc-500 font-medium">Total Net Profit / Loss</span>
          <div className="my-2">
            <div className={`text-xl md:text-2xl font-bold font-mono truncate ${
              totalPnlIdr > 0 ? "text-emerald-600" : totalPnlIdr < 0 ? "text-rose-600" : "text-zinc-700"
            }`}>
              {formatIDR(totalPnlIdr, true)}
            </div>
            <span className={`text-xs font-mono font-semibold ${
              totalGrowthPercent > 0 ? "text-emerald-600" : totalGrowthPercent < 0 ? "text-rose-600" : "text-zinc-500"
            }`}>
              {formatPercent(totalGrowthPercent, true)} pertumbuhan
            </span>
          </div>
          <span className="text-[10px] text-zinc-400">Modal Awal: {formatIDR(startingBalance)}</span>
        </div>

        {/* Profit Factor */}
        <div className="clean-card p-5 flex flex-col justify-between">
          <span className="text-xs text-zinc-500 font-medium">Profit Factor</span>
          <div className="my-2">
            <div className="text-2xl md:text-3xl font-bold font-mono text-zinc-900">
              {profitFactor}
            </div>
            <span className="text-xs text-zinc-400">
              Gross Win / Gross Loss
            </span>
          </div>
          <span className={`text-[10px] font-semibold uppercase ${
            Number(profitFactor) >= 1.5 ? "text-emerald-600" : "text-zinc-500"
          }`}>
            {Number(profitFactor) >= 2.0 ? "Sangat Kuat" : Number(profitFactor) >= 1.5 ? "Bagus" : "Perlu Perbaikan"}
          </span>
        </div>

        {/* Average Win vs Loss */}
        <div className="clean-card p-5 flex flex-col justify-between">
          <span className="text-xs text-zinc-500 font-medium">Avg Win vs Avg Loss</span>
          <div className="my-1.5 space-y-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-500">Avg Win:</span>
              <span className="text-emerald-600 font-bold">{formatIDR(avgWin)}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-500">Avg Loss:</span>
              <span className="text-rose-600 font-bold">{formatIDR(avgLoss)}</span>
            </div>
          </div>
          <span className="text-[10px] text-zinc-400">
            Rasio: {avgLoss > 0 ? (avgWin / avgLoss).toFixed(1) : "MAX"}:1
          </span>
        </div>
      </div>

      {/* 2b. Evaluasi Trading Plan & Konsistensi Harian */}
      <div className="clean-card p-5 md:p-6 bg-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-zinc-900 font-display flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-600" />
              Evaluasi Trading Plan & Performa Harian
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Target Profit Harian: <strong className="font-mono text-zinc-700">{formatIDR(dailyTargetIdr)}</strong> ({dailyTargetPercent}% dari modal)
            </p>
          </div>
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200 self-start sm:self-auto">
            {dailyAnalytics.targetHitDays} / {dailyAnalytics.totalActiveDays} Hari Capai Target ({dailyAnalytics.hitRate.toFixed(1)}%)
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. Hari Mencapai Target */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/60 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-500">Hari Capai Target</span>
            <div className="my-1">
              <div className="text-lg md:text-xl font-bold font-mono text-emerald-600">
                {dailyAnalytics.targetHitDays} Hari
              </div>
              <span className="text-[10px] text-zinc-400 font-mono">
                {dailyAnalytics.hitRate.toFixed(1)}% konsistensi
              </span>
            </div>
            <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full" style={{ width: `${dailyAnalytics.hitRate}%` }} />
            </div>
          </div>

          {/* 2. Rata-rata Performa Harian */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/60 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-500">Rata-rata Performa</span>
            <div className="my-1">
              <div className={`text-lg md:text-xl font-bold font-mono ${
                dailyAnalytics.avgDailyPnl >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}>
                {formatIDR(dailyAnalytics.avgDailyPnl, true)}
              </div>
              <span className="text-[10px] text-zinc-400">per hari trading aktif</span>
            </div>
            <span className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wider">Avg Daily P/L</span>
          </div>

          {/* 3. Rata-rata % Gain / Hari */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/60 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-500">Avg Gain / Hari</span>
            <div className="my-1">
              <div className={`text-lg md:text-xl font-bold font-mono ${
                dailyAnalytics.avgDailyGainPercent >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}>
                {formatPercent(dailyAnalytics.avgDailyGainPercent, true)}
              </div>
              <span className="text-[10px] text-zinc-400">terhadap modal</span>
            </div>
            <span className="text-[10px] text-zinc-400 uppercase font-semibold tracking-wider">Target: {dailyTargetPercent}%</span>
          </div>

          {/* 4. Hari Terbaik */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/60 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-500">Hari Terbaik</span>
            <div className="my-1">
              {dailyAnalytics.bestDay ? (
                <>
                  <div className="text-lg md:text-xl font-bold font-mono text-emerald-600">
                    {formatIDR(dailyAnalytics.bestDay.netPnl, true)}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block truncate">
                    {dailyAnalytics.bestDay.dateStr}
                  </span>
                </>
              ) : (
                <div className="text-sm font-semibold text-zinc-400">-</div>
              )}
            </div>
            <span className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider">Best Day</span>
          </div>

          {/* 5. Hari Terburuk */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/60 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-500">Hari Terburuk</span>
            <div className="my-1">
              {dailyAnalytics.worstDay ? (
                <>
                  <div className="text-lg md:text-xl font-bold font-mono text-rose-600">
                    {formatIDR(dailyAnalytics.worstDay.netPnl, true)}
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono block truncate">
                    {dailyAnalytics.worstDay.dateStr}
                  </span>
                </>
              ) : (
                <div className="text-sm font-semibold text-zinc-400">-</div>
              )}
            </div>
            <span className="text-[10px] text-rose-600 font-semibold uppercase tracking-wider">Worst Day</span>
          </div>

          {/* 6. Pencapaian Target Bulanan */}
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/60 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-zinc-500">Target Bulan Ini</span>
            <div className="my-1">
              <div className="text-lg md:text-xl font-bold font-mono text-zinc-900">
                {dailyAnalytics.monthlyHitRate.toFixed(1)}%
              </div>
              <span className="text-[10px] text-zinc-500 font-mono block truncate">
                {formatIDR(dailyAnalytics.currentMonthPnl, true)}
              </span>
            </div>
            <div className="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-500 h-full" 
                style={{ width: `${Math.min(100, Math.max(0, dailyAnalytics.monthlyHitRate))}%` }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Best Trade & Worst Trade Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Best Trade */}
        <div className="clean-card p-5 bg-emerald-50/40 border-emerald-100 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-800 shrink-0">
            <ArrowUpRight className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800 block">
              Trade Terbaik (Best Trade)
            </span>
            {bestTrade ? (
              <div className="mt-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold font-mono text-emerald-700">
                    {formatIDR(bestTrade.pnlIdr || 0, true)}
                  </span>
                  <span className="text-xs font-semibold font-mono text-emerald-600">
                    ({formatPercent(bestTrade.pnlPercent || 0, true)})
                  </span>
                </div>
                <div className="text-xs text-zinc-600 mt-1 flex items-center gap-2">
                  <span className="font-bold text-zinc-800">{bestTrade.asset}</span>
                  <span>•</span>
                  <span>{bestTrade.direction.toUpperCase()}</span>
                  <span>•</span>
                  <span className="font-mono">{bestTrade.date?.split("T")[0]}</span>
                </div>
              </div>
            ) : (
              <span className="text-xs text-zinc-400 mt-1 block">Belum ada data trade</span>
            )}
          </div>
        </div>

        {/* Worst Trade */}
        <div className="clean-card p-5 bg-rose-50/40 border-rose-100 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-800 shrink-0">
            <ArrowDownRight className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-800 block">
              Trade Terburuk (Worst Trade)
            </span>
            {worstTrade ? (
              <div className="mt-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold font-mono text-rose-700">
                    {formatIDR(worstTrade.pnlIdr || 0, true)}
                  </span>
                  <span className="text-xs font-semibold font-mono text-rose-600">
                    ({formatPercent(worstTrade.pnlPercent || 0, true)})
                  </span>
                </div>
                <div className="text-xs text-zinc-600 mt-1 flex items-center gap-2">
                  <span className="font-bold text-zinc-800">{worstTrade.asset}</span>
                  <span>•</span>
                  <span>{worstTrade.direction.toUpperCase()}</span>
                  <span>•</span>
                  <span className="font-mono">{worstTrade.date?.split("T")[0]}</span>
                </div>
              </div>
            ) : (
              <span className="text-xs text-zinc-400 mt-1 block">Belum ada data trade</span>
            )}
          </div>
        </div>
      </div>

      {/* 4. Comparative Grids: Market (Forex vs Crypto) & Direction (Buy vs Sell) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Performa Pasar (Forex vs Crypto) */}
        <div className="clean-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-zinc-900 font-display">
              Performa Berdasarkan Pasar
            </h3>
            <span className="text-xs text-zinc-400">Forex vs Crypto</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Forex */}
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200/70">
              <span className="text-xs font-semibold text-zinc-700 block mb-1">
                Forex / Komoditas
              </span>
              <div className="font-mono text-base font-bold text-zinc-900">
                {marketPerformance.forex.winRate.toFixed(1)}% WR
              </div>
              <div className={`text-xs font-mono font-semibold mt-1 ${
                marketPerformance.forex.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}>
                {formatIDR(marketPerformance.forex.pnl, true)}
              </div>
              <span className="text-[11px] text-zinc-400 block mt-2">
                {marketPerformance.forex.total} total trade
              </span>
            </div>

            {/* Crypto */}
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200/70">
              <span className="text-xs font-semibold text-zinc-700 block mb-1">
                Crypto
              </span>
              <div className="font-mono text-base font-bold text-zinc-900">
                {marketPerformance.crypto.winRate.toFixed(1)}% WR
              </div>
              <div className={`text-xs font-mono font-semibold mt-1 ${
                marketPerformance.crypto.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}>
                {formatIDR(marketPerformance.crypto.pnl, true)}
              </div>
              <span className="text-[11px] text-zinc-400 block mt-2">
                {marketPerformance.crypto.total} total trade
              </span>
            </div>
          </div>
        </div>

        {/* Performa Arah (Buy / Long vs Sell / Short) */}
        <div className="clean-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-zinc-900 font-display">
              Performa Berdasarkan Arah Posisi
            </h3>
            <span className="text-xs text-zinc-400">Long vs Short</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Buy / Long */}
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200/70">
              <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> BUY (Long)
              </span>
              <div className="font-mono text-base font-bold text-zinc-900">
                {directionPerformance.buy.winRate.toFixed(1)}% WR
              </div>
              <div className={`text-xs font-mono font-semibold mt-1 ${
                directionPerformance.buy.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}>
                {formatIDR(directionPerformance.buy.pnl, true)}
              </div>
              <span className="text-[11px] text-zinc-400 block mt-2">
                {directionPerformance.buy.total} total trade
              </span>
            </div>

            {/* Sell / Short */}
            <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200/70">
              <span className="text-xs font-semibold text-zinc-700 flex items-center gap-1 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-rose-600" /> SELL (Short)
              </span>
              <div className="font-mono text-base font-bold text-zinc-900">
                {directionPerformance.sell.winRate.toFixed(1)}% WR
              </div>
              <div className={`text-xs font-mono font-semibold mt-1 ${
                directionPerformance.sell.pnl >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}>
                {formatIDR(directionPerformance.sell.pnl, true)}
              </div>
              <span className="text-[11px] text-zinc-400 block mt-2">
                {directionPerformance.sell.total} total trade
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* 5. Performance by Pair / Asset Table */}
      <div className="clean-card p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-zinc-900 font-display">
              Performa Berdasarkan Pair / Aset
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Rincian hasil nominal IDR, persentase pertumbuhan, dan win rate per instrumen.
            </p>
          </div>
        </div>

        {assetPerformance.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-400">
            Belum ada trade yang ditutup untuk dianalisis.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 text-zinc-400 font-medium">
                  <th className="pb-3 pl-1 font-semibold uppercase tracking-wider">Aset / Pair</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider text-center">Total Trade</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider text-center">Win Rate</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider text-right">Net Profit / Loss</th>
                  <th className="pb-3 pr-1 font-semibold uppercase tracking-wider text-right">Pertumbuhan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-sans">
                {assetPerformance.map((item) => (
                  <tr key={item.asset} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="py-3 pl-1 font-bold text-zinc-900 font-display">
                      {item.asset}
                    </td>
                    <td className="py-3 text-center font-mono text-zinc-700">
                      {item.total}
                    </td>
                    <td className="py-3 text-center font-mono font-semibold text-zinc-800">
                      {item.winRate.toFixed(1)}%
                    </td>
                    <td className="py-3 text-right font-mono font-bold">
                      <span className={item.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {formatIDR(item.pnl, true)}
                      </span>
                    </td>
                    <td className="py-3 pr-1 text-right font-mono font-semibold">
                      <span className={item.growth >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {formatPercent(item.growth, true)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Performance by Day of Week Bar Chart */}
      <div className="clean-card p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-zinc-900 font-display">
              Performa Berdasarkan Hari dalam Seminggu
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Identifikasi hari trading dengan win rate atau profitabilitas terbaik.
            </p>
          </div>
        </div>

        <div className="h-[220px] min-h-[220px] w-full min-w-0 mt-2">
          <ResponsiveContainer width="100%" height={220} minWidth={0} minHeight={220}>
            <BarChart data={dayOfWeekPerformance} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
              <XAxis dataKey="name" stroke="#a1a1aa" fontSize={11} tickLine={false} />
              <YAxis 
                stroke="#a1a1aa" 
                fontSize={11} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(val) => `Rp ${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white border border-zinc-200 rounded-xl shadow-lg p-3 text-xs">
                        <span className="font-bold text-zinc-900 block mb-1">{data.name}</span>
                        <div className="font-mono text-zinc-600 space-y-0.5">
                          <div>Net P/L: <strong className={data.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}>{formatIDR(data.pnl, true)}</strong></div>
                          <div>Win Rate: <strong>{data.winRate.toFixed(1)}%</strong> ({data.wins}W / {data.total}T)</div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {dayOfWeekPerformance.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.pnl >= 0 ? "#16a34a" : "#dc2626"} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 7. Monthly Performance Breakdown Table */}
      <div className="clean-card p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-zinc-900 font-display">
              Rekap Performa Bulanan (Monthly Breakdown)
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Historis performa profit, persentase pertumbuhan, dan win rate setiap bulan.
            </p>
          </div>
        </div>

        {monthlyBreakdown.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-400">
            Belum ada rekap bulanan yang tercatat.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 text-zinc-400 font-medium">
                  <th className="pb-3 pl-1 font-semibold uppercase tracking-wider">Bulan & Tahun</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider text-center">Trade (W/L)</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider text-center">Win Rate</th>
                  <th className="pb-3 font-semibold uppercase tracking-wider text-right">Net P/L (IDR)</th>
                  <th className="pb-3 pr-1 font-semibold uppercase tracking-wider text-right">Pertumbuhan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 font-sans">
                {monthlyBreakdown.map((m) => (
                  <tr key={m.key} className="hover:bg-zinc-50/80 transition-colors">
                    <td className="py-3 pl-1 font-bold text-zinc-900">
                      {m.label}
                    </td>
                    <td className="py-3 text-center font-mono text-zinc-700">
                      {m.total} ({m.wins}W / {m.losses}L)
                    </td>
                    <td className="py-3 text-center font-mono font-semibold text-zinc-800">
                      {m.winRate.toFixed(1)}%
                    </td>
                    <td className="py-3 text-right font-mono font-bold">
                      <span className={m.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {formatIDR(m.pnl, true)}
                      </span>
                    </td>
                    <td className="py-3 pr-1 text-right font-mono font-semibold">
                      <span className={m.growth >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {formatPercent(m.growth, true)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
