import { useState, useEffect } from "react";
import { useAppStore } from "../store/AppContext";
import { useRandomQuote } from "../hooks/useQuotes";
import { TradingViewChart } from "../components/ui/TradingViewWidget";
import { Badge, WarningPanel } from "../components/ui/Globals";
import { formatCurrency } from "../lib/utils";
import { ArrowUpRight, Target, PieChart, Scale, Wallet, AlertTriangle } from "lucide-react";
import { startOfDay, isToday } from "date-fns";
import { AssetType, NewsEvent } from "../types";
import { useNavigate } from "react-router-dom";

export function Dashboard() {
  const { accountMode, setAccountMode, selectedAsset, setSelectedAsset, settings, trades, transactions } = useAppStore();
  const quote = useRandomQuote();
  const navigate = useNavigate();
  const [todayHighImpactNews, setTodayHighImpactNews] = useState(false);

  useEffect(() => {
    const savedNews = localStorage.getItem("Lootly.newsEvents");
    if (savedNews) {
      try {
        const events: NewsEvent[] = JSON.parse(savedNews);
        const todaysDate = new Date().toISOString().split("T")[0];
        const hasHighImpactToday = events.some(n => n.date === todaysDate && n.impact === "High" && !n.isDone);
        setTodayHighImpactNews(hasHighImpactToday);
      } catch (e) {
        // ignore
      }
    }
  }, []);

  const modeTrades = trades.filter((t) => t.accountMode === accountMode);
  const modeTransactions = transactions.filter((t) => t.accountMode === accountMode);
  
  // Basic calculations
  const startingBalance = accountMode === "demo" ? settings.startingBalanceDemo : settings.startingBalanceReal;
  const targetBalance = accountMode === "demo" ? settings.targetBalanceDemo : settings.targetBalanceReal;
  
  const transactionsSum = modeTransactions.reduce((acc, t) => {
    if (t.type === 'withdrawal') return acc - t.amount;
    return acc + t.amount;
  }, 0);

  const currentBalance = startingBalance + transactionsSum;
  
  // Progress against starting balance
  const targetProgress = Math.min(100, Math.max(0, ((currentBalance - startingBalance) / (targetBalance - startingBalance)) * 100)) || 0;

  // Realized PNL for this mode 
  // (We use transactions for calculating the total offset to not double count)
  const totalPnlIdr = transactionsSum; // In this system, this represents all changes from starting balance

  // Realized stats only
  const closedTrades = modeTrades.filter(t => t.result !== "open");
  const winTrades = closedTrades.filter(t => t.result === "win");
  const lossTrades = closedTrades.filter(t => t.result === "loss");
  const todayTrades = closedTrades.filter(t => isToday(new Date(t.createdAt)));
  const todayLosses = todayTrades.filter(t => t.result === "loss").length;

  const winrate = closedTrades.length > 0 ? (winTrades.length / closedTrades.length) * 100 : 0;
  
  // Average RR calculation
  const avgRR = closedTrades.length === 0 ? "0.0" : (closedTrades.reduce((acc, t) => acc + (t.rrRealized || 0), 0) / closedTrades.length).toFixed(1);

  return (
    <div className="px-4 md:px-8 max-w-7xl mx-auto w-full pb-8 pt-4">
      
      {/* Header & Account Mode Switch */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-10">
        <div>
          <h1 className="font-display text-2xl md:text-5xl font-bold text-on-surface tracking-tighter mb-2" onClick={() => navigate("/")} role="button">
            Halo, siap naik level hari ini?
          </h1>
          <p className="font-sans text-base text-on-surface-variant max-w-2xl italic opacity-80 border-l-2 border-primary/50 pl-3">
            "{quote}"
          </p>
        </div>
        
        {/* Toggle Account Mode */}
        <div className="flex items-center bg-surface-container-high rounded-full p-1 border border-white/5 shrink-0 z-10 w-full md:w-auto">
          <button 
            onClick={() => setAccountMode('demo')}
            className={`flex-1 md:flex-none uppercase px-6 py-2 rounded-full font-display text-xs tracking-widest font-bold transition-all ${accountMode === 'demo' ? 'bg-[#00c076] text-white shadow-[0_0_15px_rgba(0,192,118,0.3)]' : 'text-on-surface-variant hover:text-white'}`}
          >
            Demo
          </button>
          <button 
            onClick={() => setAccountMode('real')}
            className={`flex-1 md:flex-none uppercase px-6 py-2 rounded-full font-display text-xs tracking-widest font-bold transition-all ${accountMode === 'real' ? 'bg-[#ff3b30] text-white shadow-[0_0_15px_rgba(255,59,48,0.3)]' : 'text-on-surface-variant hover:text-white'}`}
          >
            Real
          </button>
        </div>
      </div>

      {/* Warnings */}
      {todayHighImpactNews && (
        <div className="mb-8 cursor-pointer" onClick={() => navigate('/news')} role="button" tabIndex={0}>
           <WarningPanel title="News Hari Ini" message="High impact news hari ini. Jangan entry tanpa cek kalender." type="error" />
        </div>
      )}
      {todayLosses >= settings.stopAfterLosses && (
        <div className="mb-8 cursor-pointer" onClick={() => navigate('/reviews')} role="button" tabIndex={0}>
           <WarningPanel title="Trading Limit Reached" message="Dua kali loss cukup. Besok masih ada market. Review Hari Ini." type="warning" />
        </div>
      )}
      {modeTrades.length === 0 && (
         <div className="mb-8 cursor-pointer" onClick={() => navigate('/add')} role="button" tabIndex={0}>
           <WarningPanel title="Belum Ada Trade" message="Buat Plan Pertama." type="warning" />
        </div>
      )}

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
        
        {/* Total Balance Card */}
        <div className="glass-panel rounded-xl p-5 col-span-2 flex flex-col justify-between min-h-[140px] cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/settings')} role="button" tabIndex={0}>
          <div className="flex items-center gap-2 text-on-surface-variant font-display text-xs uppercase tracking-wider font-semibold">
            <Wallet className="w-4 h-4" /> SALDO TOTAL (IDR)
          </div>
          <div>
            <div className="font-mono text-3xl md:text-4xl text-white mt-3 font-bold">
              {formatCurrency(currentBalance, 'IDR')}
            </div>
            <div className={`font-mono text-sm mt-1 flex items-center gap-1 ${totalPnlIdr >= 0 ? 'text-primary' : 'text-error'}`}>
              <ArrowUpRight className="w-4 h-4" /> 
              {totalPnlIdr >= 0 ? '+' : ''}{formatCurrency(totalPnlIdr, 'IDR')} Sepanjang Waktu
            </div>
          </div>
        </div>

        {/* Target Progress */}
        <div className="glass-panel rounded-xl p-5 col-span-2 flex flex-col justify-between min-h-[140px] cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/settings')} role="button" tabIndex={0}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-on-surface-variant font-display text-xs uppercase tracking-wider font-semibold">
              <Target className="w-4 h-4" /> PROGRESS TARGET
            </div>
            <span className="font-mono text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
              {targetProgress.toFixed(1)}%
            </span>
          </div>
          <div className="w-full bg-[#161d18] rounded-full h-2.5 mt-auto mb-2 overflow-hidden border border-white/5 relative">
            <div className="bg-primary h-full rounded-full transition-all duration-1000 ease-in-out shadow-[0_0_10px_#44e092]" style={{ width: `${targetProgress}%` }} />
          </div>
          <div className="flex justify-between font-mono text-xs text-on-surface-variant">
            <span>{formatCurrency(currentBalance, 'IDR')}</span>
            <span>{formatCurrency(targetBalance, 'IDR')}</span>
          </div>
        </div>

        {/* Winrate */}
        <div className="glass-panel rounded-xl p-5 col-span-1 flex flex-col justify-between min-h-[140px] cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/analytics')} role="button" tabIndex={0}>
          <div className="text-on-surface-variant font-display text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
            <PieChart className="w-4 h-4" /> WINRATE
          </div>
          <div className="font-mono text-3xl text-white font-bold">{winrate.toFixed(0)}%</div>
        </div>

        {/* Avg RR */}
        <div className="glass-panel rounded-xl p-5 col-span-1 flex flex-col justify-between min-h-[140px] cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/analytics')} role="button" tabIndex={0}>
          <div className="text-on-surface-variant font-display text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
            <Scale className="w-4 h-4" /> RATA-RATA RR
          </div>
          <div className="font-mono text-3xl text-white font-bold">1:{avgRR}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Recent Executions Widget */}
        <div className="lg:col-span-8 glass-panel rounded-xl p-5 flex flex-col overflow-hidden relative">
           <div className="flex justify-between items-center mb-6">
              <h3 className="font-display text-lg text-white font-semibold flex items-center gap-2 cursor-pointer hover:text-primary transition-colors" onClick={() => navigate('/journal')} role="button" tabIndex={0}>
                Riwayat Terbaru <ArrowUpRight className="w-4 h-4" />
              </h3>
          </div>
          {closedTrades.length === 0 ? (
             <div className="flex-1 flex items-center justify-center text-on-surface-variant opacity-70 italic font-sans text-sm cursor-pointer" onClick={() => navigate('/add')} role="button">
                Belum ada trade yang dicatat di akun {accountMode}. Klik di sini untuk tambah trade pertama.
             </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 font-display text-xs tracking-wider uppercase text-on-surface-variant">
                    <th className="pb-3 font-semibold">Asset</th>
                    <th className="pb-3 font-semibold">Type</th>
                    <th className="pb-3 font-semibold text-right">Entry</th>
                    <th className="pb-3 font-semibold text-right">Result (IDR)</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-sm">
                  {closedTrades.slice(0, 5).map(trade => (
                    <tr 
                      key={trade.id} 
                      className="border-b border-white/5 hover:bg-white/10 active:bg-white/20 cursor-pointer transition-colors group focus:outline-none focus:ring-1 focus:ring-primary/40"
                      onClick={() => navigate(`/journal/${trade.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/journal/${trade.id}`); }}
                      role="button"
                      tabIndex={0}
                    >
                      <td className="py-3 flex items-center gap-2 text-[#dce5dc]">
                        <div className={`w-2 h-2 rounded-full ${trade.result === 'win' ? 'bg-primary' : trade.result === 'loss' ? 'bg-error' : 'bg-yellow-500'}`} />
                        {trade.asset}
                      </td>
                      <td className="py-3">
                        <span className={trade.direction === 'buy' ? 'text-primary' : 'text-error uppercase'}>{trade.direction.toUpperCase()}</span>
                      </td>
                      <td className="py-3 text-right text-on-surface-variant">{trade.actualEntry || trade.entryPlan}</td>
                      <td className={`py-3 text-right font-bold ${trade.result === 'win' ? 'text-primary' : trade.result === 'loss' ? 'text-error' : 'text-on-surface-variant'}`}>
                        {trade.result === 'win' ? '+' : ''}{formatCurrency(trade.pnlIdr || 0, 'IDR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* TradingView Widget Focus Area */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          
          <div className="glass-panel p-1 rounded-full flex mx-auto mb-2 relative overflow-hidden">
             {/* Asset tabs */}
             {['XAU/USD', 'BTC/USD'].map(asset => (
                <button
                  key={asset}
                  onClick={() => setSelectedAsset(asset as AssetType)}
                  className={`px-6 py-2 font-display text-xs font-bold tracking-wider rounded-full transition-all relative z-10 cursor-pointer ${selectedAsset === asset ? 'text-white' : 'text-on-surface-variant hover:text-white'}`}
                >
                  {asset}
                  {selectedAsset === asset && (
                    <div className="absolute inset-0 bg-[#3c4a40] rounded-full -z-10 shadow-inner border border-white/10" />
                  )}
                </button>
             ))}
          </div>

          <div className="glass-panel rounded-xl flex-1 relative overflow-hidden flex flex-col min-w-0">
             {/* The Chart */}
             <TradingViewChart 
                symbol={settings.instruments[selectedAsset as AssetType].tradingViewSymbol} 
                className="w-full flex-1 min-h-[360px] md:min-h-[380px] lg:min-h-[420px]"
             />
          </div>

        </div>

      </div>

    </div>
  );
}
