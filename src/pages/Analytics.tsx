import { useAppStore } from "../store/AppContext";
import { formatCurrency } from "../lib/utils";
import { TrendingUp, TrendingDown, Star, BrainCircuit } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';

export function Analytics() {
  const { trades, accountMode, settings } = useAppStore();
  const modeTrades = trades.filter(t => t.accountMode === accountMode);
  const closedTrades = modeTrades.filter(t => t.status === "closed");
  
  const balance = accountMode === "demo" ? settings.startingBalanceDemo : settings.startingBalanceReal;
  
  let currentBalance = balance;
  const equityData = closedTrades.slice().reverse().map(trade => {
    currentBalance += (trade.pnlIdr || 0);
    return {
      name: trade.date.split("T")[0],
      value: currentBalance,
      pnl: trade.pnlIdr || 0
    };
  });

  const hasTrades = closedTrades.length > 0;

  // Real Calculations
  let bestDay = { date: '', pnl: -Infinity, asset: '' };
  let worstDay = { date: '', pnl: Infinity, asset: '' };
  let totalDisciplineScore = 0;
  let totalWithScore = 0;
  const setupStats: Record<string, { wins: number, total: number }> = {};
  const assetStats: Record<string, { wins: number, total: number }> = {};

  let totalWinRate = 0;

  if (hasTrades) {
    let totalWins = 0;
    closedTrades.forEach(t => {
       const pnl = t.pnlIdr || 0;
       if (pnl > bestDay.pnl) bestDay = { date: t.date.split("T")[0], pnl, asset: t.asset };
       if (pnl < worstDay.pnl) worstDay = { date: t.date.split("T")[0], pnl, asset: t.asset };
       
       if (t.disciplineScore !== undefined) {
           totalDisciplineScore += t.disciplineScore;
           totalWithScore++;
       }
       
       if (t.setupType) {
           if (!setupStats[t.setupType]) setupStats[t.setupType] = { wins: 0, total: 0 };
           setupStats[t.setupType].total++;
           if (t.result === 'win') setupStats[t.setupType].wins++;
       }

       if (t.asset) {
           if (!assetStats[t.asset]) assetStats[t.asset] = { wins: 0, total: 0 };
           assetStats[t.asset].total++;
           if (t.result === 'win') assetStats[t.asset].wins++;
       }
       
       if (t.result === 'win') totalWins++;
    });
    
    totalWinRate = (totalWins / closedTrades.length) * 100;
  }

  const avgDiscipline = totalWithScore > 0 ? (totalDisciplineScore / totalWithScore).toFixed(1) : "0";
  
  let bestSetup = "Belum ada data";
  let bestSetupWinrate = 0;
  Object.entries(setupStats).forEach(([setup, stats]) => {
     const winrate = (stats.wins / stats.total) * 100;
     if (winrate >= bestSetupWinrate && stats.total > 0) {
         bestSetupWinrate = winrate;
         bestSetup = setup;
     }
  });

  return (
    <div className="px-4 md:px-8 max-w-7xl mx-auto w-full pb-8 pt-4">
      
      <div className="md:hidden flex items-center justify-between mb-2">
        <h1 className="font-display text-4xl font-bold text-white tracking-tighter">Analytics</h1>
      </div>

      <div className="hidden md:flex items-center justify-between mb-8 pb-4 border-b border-white/5">
        <h1 className="font-display text-4xl font-bold text-white tracking-tighter">Analytics Dashboard</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-8">
        
        {/* Stat Cards */}
        <div className="glass-panel rounded-xl p-5 flex flex-col gap-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
            <TrendingUp className="w-12 h-12 text-primary" />
          </div>
          <span className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant z-10 font-bold">Best Day</span>
          <div className="flex items-baseline gap-2 z-10">
            <span className="font-mono text-2xl md:text-xl lg:text-2xl text-primary font-bold">
               {hasTrades && bestDay.pnl !== -Infinity ? `+${formatCurrency(bestDay.pnl, 'IDR')}` : 'Belum ada data'}
            </span>
          </div>
          <span className="font-sans text-xs text-on-surface-variant opacity-70 z-10">
             {hasTrades && bestDay.pnl !== -Infinity ? `${bestDay.date} (${bestDay.asset})` : '-'}
          </span>
        </div>

        <div className="glass-panel rounded-xl p-5 flex flex-col gap-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
            <TrendingDown className="w-12 h-12 text-error" />
          </div>
          <span className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant z-10 font-bold">Worst Day</span>
          <div className="flex items-baseline gap-2 z-10">
            <span className="font-mono text-2xl md:text-xl lg:text-2xl text-error font-bold">
               {hasTrades && worstDay.pnl !== Infinity ? formatCurrency(worstDay.pnl, 'IDR') : 'Belum ada data'}
            </span>
          </div>
          <span className="font-sans text-xs text-on-surface-variant opacity-70 z-10">
             {hasTrades && worstDay.pnl !== Infinity ? `${worstDay.date} (${worstDay.asset})` : '-'}
          </span>
        </div>

        <div className="glass-panel rounded-xl p-5 flex flex-col gap-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
            <Star className="w-12 h-12 text-[#adc6ff]" />
          </div>
          <span className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant z-10 font-bold">Best Setup</span>
          <div className="flex items-baseline gap-2 z-10 mt-auto">
             <span className="font-sans text-lg md:text-lg text-white font-bold">{bestSetup}</span>
          </div>
          <span className="font-mono text-xs text-primary z-10 font-medium">
             {hasTrades && bestSetupWinrate > 0 ? `${bestSetupWinrate.toFixed(1)}% Winrate` : '-'}
          </span>
        </div>

        <div className="glass-panel rounded-xl p-5 flex flex-col gap-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
            <BrainCircuit className="w-12 h-12 text-[#4b8eff]" />
          </div>
          <span className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant z-10 font-bold">Avg Discipline Score</span>
           <div className="flex items-baseline gap-2 z-10 mt-auto">
             <span className="font-mono text-2xl md:text-3xl text-[#adc6ff] font-bold">{avgDiscipline}/10</span>
          </div>
          <div className="w-full bg-[#161d18] h-1 rounded-full overflow-hidden z-10">
            <div className="bg-[#adc6ff] h-full transition-all" style={{width: `${(Number(avgDiscipline) / 10) * 100}%`}}></div>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Equity Curve */}
        <div className="glass-panel rounded-xl p-6 lg:col-span-8 flex flex-col h-[400px]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-display text-lg text-white font-semibold flex items-center gap-2">Equity Curve</h2>
            <div className="flex gap-1 bg-[#161d18] rounded-lg p-1">
              <button className="px-3 py-1 font-mono text-xs text-on-surface-variant hover:text-white rounded">1M</button>
              <button className="px-3 py-1 font-mono text-xs text-on-surface-variant hover:text-white rounded">3M</button>
              <button className="px-3 py-1 font-mono text-xs bg-[#2f3731] text-white rounded shadow">ALL</button>
            </div>
          </div>

          <div className="flex-1 w-full h-full relative -ml-4">
             {!hasTrades ? (
                <div className="w-full h-full flex items-center justify-center text-on-surface-variant font-sans text-sm italic ml-4">
                   Belum ada data analytics. Catat trade dulu agar Lootly bisa membaca pola trading kamu.
                </div>
             ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#44e092" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#44e092" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} dy={10} minTickGap={30} />
                    <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `Rp ${Math.abs(v/1000000).toFixed(0)}M`} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#1a211c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontFamily: 'Geist' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(value: number) => [formatCurrency(value, 'IDR'), 'Balance']}
                    />
                    <Area type="monotone" dataKey="value" stroke="#44e092" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                  </AreaChart>
                </ResponsiveContainer>
             )}
          </div>
        </div>

        {/* Winrate Donut */}
        <div className="glass-panel rounded-xl p-6 lg:col-span-4 flex flex-col h-[400px]">
           <h2 className="font-display text-lg text-white font-semibold mb-6">Winrate by Asset</h2>
           {!hasTrades ? (
               <div className="flex-1 flex items-center justify-center text-on-surface-variant font-sans text-sm italic">
                  Belum ada data
               </div>
           ) : (
             <>
               <div className="flex-1 flex flex-col items-center justify-center relative">
                  {/* Simplistic CSS Conic Gradient based on two main assets */}
                  <div 
                    className="relative w-48 h-48 rounded-full flex items-center justify-center" 
                    style={{ background: Object.keys(assetStats).length > 0 ? `conic-gradient(#44e092 0% ${totalWinRate}%, #adc6ff ${totalWinRate}% 100%)` : '#161d18' }}
                  >
                    <div className="w-36 h-36 bg-[#0e1510] rounded-full flex flex-col items-center justify-center absolute shadow-inner border border-white/5">
                       <span className="font-mono text-3xl text-white font-bold">{totalWinRate.toFixed(0)}%</span>
                       <span className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant mt-1">Overall Win</span>
                    </div>
                  </div>
               </div>

               <div className="flex flex-col gap-2 mt-6 overflow-y-auto">
                  {Object.entries(assetStats).map(([asset, stats], idx) => {
                     const wr = (stats.wins / stats.total) * 100;
                     return (
                        <div key={asset} className="flex items-center justify-between p-2 rounded hover:bg-white/5 transition-colors cursor-pointer">
                           <div className="flex items-center gap-3">
                             <div className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-primary' : 'bg-[#adc6ff]'}`}></div>
                             <span className="font-sans text-sm text-white">{asset}</span>
                           </div>
                           <span className="font-mono text-sm text-on-surface-variant">{wr.toFixed(0)}% Win ({stats.total} trades)</span>
                        </div>
                     )
                  })}
               </div>
             </>
           )}
        </div>
      </div>

    </div>
  );
}
