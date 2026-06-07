import { useState } from "react";
import { useAppStore } from "../store/AppContext";
import { useNavigate } from "react-router-dom";
import { formatCurrency } from "../lib/utils";
import { Search, Plus, Filter, Calendar as CalendarIcon, MoreVertical, BookOpen } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Badge } from "../components/ui/Globals";

export function Journal() {
  const { trades, accountMode } = useAppStore();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [filterResult, setFilterResult] = useState<string>("all");
  const [filterSetup, setFilterSetup] = useState<string>("all");
  const [filterAsset, setFilterAsset] = useState<string>("all");

  const modeTrades = trades.filter(t => t.accountMode === accountMode);

  const filteredTrades = modeTrades.filter(trade => {
    if (search && !trade.asset.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterResult !== "all" && trade.result !== filterResult) return false;
    if (filterSetup !== "all" && trade.setupType !== filterSetup) return false;
    if (filterAsset !== "all" && trade.asset !== filterAsset) return false;
    return true;
  }).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="px-4 md:px-8 max-w-7xl mx-auto w-full pb-8 pt-4 flex flex-col h-[calc(100vh-64px)]">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4 mt-6">
        <div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-on-surface mb-2 tracking-tighter">Trade Journal</h1>
          <p className="font-sans text-sm text-on-surface-variant">Log, review, and optimize your edge.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate("/add")} className="flex items-center gap-2 px-6 py-2.5 bg-primary/10 text-primary rounded-lg border border-primary/20 hover:bg-primary/20 transition-colors font-display text-xs font-bold tracking-widest uppercase cursor-pointer">
            <Plus className="w-4 h-4" /> Log Trade
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-xl p-3 flex flex-col xl:flex-row gap-3 items-stretch mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-4 h-4" />
          <input 
            type="text" 
            placeholder="Search details..."
            className="w-full h-10 pl-10 pr-4 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-sm focus:border-primary focus:ring-1 focus:ring-primary/50 transition-colors outline-none"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
           <select 
             className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-sm outline-none appearance-none cursor-pointer hover:border-white/20 transition-colors"
             value={filterAsset} onChange={e => setFilterAsset(e.target.value)}
           >
             <option value="all">All Assets</option>
             {Array.from(new Set(modeTrades.map(t => t.asset))).map(a => (
               <option key={a} value={a} className="bg-surface">{a}</option>
             ))}
           </select>

           <select 
             className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-sm outline-none appearance-none cursor-pointer hover:border-white/20 transition-colors"
             value={filterSetup} onChange={e => setFilterSetup(e.target.value)}
           >
             <option value="all">All Setups</option>
             {Array.from(new Set(modeTrades.map(t => t.setupType))).filter(Boolean).map(s => (
               <option key={s} value={s} className="bg-surface">{s}</option>
             ))}
           </select>

           <select 
             className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-sm outline-none appearance-none cursor-pointer hover:border-white/20 transition-colors"
             value={filterResult} onChange={e => setFilterResult(e.target.value)}
           >
             <option value="all">All Results</option>
             <option value="win" className="bg-surface text-primary">Win</option>
             <option value="loss" className="bg-surface text-error">Loss</option>
             <option value="breakeven" className="bg-surface">Break Even</option>
             <option value="open" className="bg-surface text-warning">Open</option>
           </select>
           
           <button className="h-10 flex items-center justify-between px-3 rounded-lg bg-white/5 border border-white/10 text-white font-sans text-sm hover:border-white/20 transition-colors cursor-pointer" onClick={() => {
              setSearch("");
              setFilterAsset("all");
              setFilterSetup("all");
              setFilterResult("all");
           }}>
              <span>Reset</span>
              <Filter className="w-4 h-4 text-on-surface-variant" />
           </button>
        </div>
      </div>

      {/* Trade List Desktop */}
      <div className="hidden md:block glass-panel rounded-xl overflow-hidden flex-1 overflow-y-auto custom-scrollbar">
        {filteredTrades.length === 0 ? (
           <div className="p-12 text-center flex flex-col items-center justify-center text-on-surface-variant h-full">
              <BookOpen className="w-12 h-12 mb-4 opacity-50" />
              <p>No trades logged yet.</p>
           </div>
        ) : (
          <table className="w-full text-left border-collapse relative">
            <thead className="sticky top-0 z-20 bg-[#161d18]">
              <tr className="border-b border-white/5 bg-white/[0.02] shadow-sm">
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant">Date</th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant">Asset</th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant">Setup</th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant text-right">Entry</th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant text-right">Exit</th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant text-right">P/L (IDR)</th>
                <th className="py-4 px-6 font-display text-[10px] tracking-wider uppercase text-on-surface-variant text-center">Result</th>
                <th className="py-4 px-6 w-10"></th>
              </tr>
            </thead>
            <tbody className="font-mono text-sm text-white">
              {filteredTrades.map(trade => (
                <tr 
                  key={trade.id} 
                  onClick={() => navigate(`/journal/${trade.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      navigate(`/journal/${trade.id}`);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  className="border-b border-white/5 hover:bg-white/[0.04] active:bg-white/[0.08] transition-colors group cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <td className="py-5 px-6 text-on-surface-variant font-sans text-sm">
                     {format(parseISO(trade.date), 'MMM dd, HH:mm')}
                  </td>
                  <td className="py-5 px-6">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${trade.result === 'win' ? 'bg-primary' : trade.result === 'loss' ? 'bg-error' : 'bg-surface-variant'}`}></span>
                      <span>{trade.asset}</span>
                      <Badge variant={trade.direction === 'buy' ? 'primary' : 'error'} size="sm">
                        {trade.direction}
                      </Badge>
                    </div>
                  </td>
                  <td className="py-5 px-6 font-sans text-sm text-on-surface-variant max-w-[150px] truncate">{trade.setupType || '-'}</td>
                  <td className="py-5 px-6 text-right text-on-surface-variant">{trade.actualEntry || trade.entryPlan}</td>
                  <td className="py-5 px-6 text-right text-on-surface-variant">{trade.actualExit || '-'}</td>
                  
                  <td className={`py-5 px-6 text-right font-bold ${trade.result === 'win' ? 'text-primary' : trade.result === 'loss' ? 'text-error' : 'text-on-surface-variant'}`}>
                    {trade.pnlIdr ? (trade.result === 'win' ? '+' : '') + formatCurrency(trade.pnlIdr, 'IDR') : '-'}
                  </td>
                  <td className="py-5 px-6 text-center">
                    {trade.result === 'open' ? (
                       <Badge variant="warning" size="sm">OPEN</Badge>
                    ) : (
                       <Badge variant={trade.result === 'win' ? 'primary' : trade.result === 'loss' ? 'error' : 'surface'} size="sm">
                         {trade.result}
                       </Badge>
                    )}
                  </td>
                  <td className="py-5 px-6 text-right">
                    <button 
                      className="text-on-surface-variant opacity-0 group-hover:opacity-100 hover:text-white transition-all cursor-pointer"
                      onClick={(e) => {
                         e.stopPropagation();
                         navigate(`/journal/${trade.id}`);
                      }}
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Mobile Card View (Hidden on Desktop) */}
      <div className="flex flex-col gap-4 md:hidden overflow-y-auto custom-scrollbar">
         {filteredTrades.map(trade => (
            <div 
              key={trade.id} 
              onClick={() => navigate(`/journal/${trade.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  navigate(`/journal/${trade.id}`);
                }
              }}
              tabIndex={0}
              role="button"
              className="glass-panel rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden cursor-pointer hover:border-primary/30 active:scale-[0.99] transition-all focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
               <div className={`absolute top-0 left-0 w-1 h-full ${trade.result === 'win' ? 'bg-primary' : trade.result === 'loss' ? 'bg-error' : 'bg-surface-variant'}`}></div>
               <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-lg text-white font-bold">{trade.asset}</span>
                      <Badge variant={trade.direction === 'buy' ? 'primary' : 'error'} size="sm">
                        {trade.direction}
                      </Badge>
                    </div>
                    <span className="font-sans text-xs text-on-surface-variant">{trade.setupType || '-'} • {format(parseISO(trade.date), 'MMM dd, HH:mm')}</span>
                  </div>
                  <div className="text-right">
                    <span className={`block font-mono text-lg font-bold ${trade.result === 'win' ? 'text-primary' : trade.result === 'loss' ? 'text-error' : 'text-on-surface-variant'}`}>
                      {trade.pnlIdr ? (trade.result === 'win' ? '+' : '') + formatCurrency(trade.pnlIdr, 'IDR') : '-'}
                    </span>
                    <Badge variant={trade.result === 'win' ? 'primary' : trade.result === 'loss' ? 'error' : 'surface'} size="sm" className="mt-1">
                      {trade.result === 'open' ? 'OPEN' : trade.result}
                    </Badge>
                  </div>
               </div>
               
               <div className="h-px w-full bg-white/5 my-1"></div>
               
               <div className="flex justify-between items-center font-mono text-sm">
                 <div className="flex gap-6">
                    <div className="flex flex-col">
                      <span className="text-on-surface-variant text-[10px] uppercase font-display tracking-wider">Entry</span>
                      <span className="text-white">{trade.actualEntry || trade.entryPlan}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-on-surface-variant text-[10px] uppercase font-display tracking-wider">Exit</span>
                      <span className="text-white">{trade.actualExit || '-'}</span>
                    </div>
                 </div>
               </div>
            </div>
         ))}
      </div>
    </div>
  );
}
