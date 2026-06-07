import { useParams, useNavigate } from "react-router-dom";
import { useAppStore } from "../store/AppContext";
import { formatCurrency } from "../lib/utils";
import { Badge } from "../components/ui/Globals";
import { ArrowLeft, Trash2, Edit, Copy } from "lucide-react";
import { format, parseISO } from "date-fns";
import { TradingViewChart } from "../components/ui/TradingViewWidget";

export function TradeDetail() {
  const { tradeId } = useParams<{ tradeId: string }>();
  const navigate = useNavigate();
  const { trades, settings, deleteTrade } = useAppStore();

  const trade = trades.find(t => t.id === tradeId);

  if (!trade) {
    return (
      <div className="p-8 flex flex-col items-center justify-center h-full">
        <h2 className="text-2xl text-white font-bold mb-4">Trade Not Found</h2>
        <button onClick={() => navigate("/journal")} className="px-4 py-2 bg-primary/20 text-primary rounded-lg">Back to Journal</button>
      </div>
    );
  }

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this trade?")) {
      deleteTrade(trade.id);
      navigate("/journal");
    }
  };

  const inst = settings.instruments[trade.asset];

  return (
    <div className="px-4 md:px-8 max-w-7xl mx-auto w-full pb-16 pt-4">
      {/* Top Navigation */}
      <div className="flex items-center justify-between mb-6 sticky top-16 md:top-0 z-30 bg-[#0e1510] py-4 border-b border-white/5">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-on-surface-variant hover:text-white transition-colors cursor-pointer">
          <ArrowLeft className="w-5 h-5" /> Back
        </button>
        <div className="flex items-center gap-3">
           <button className="p-2 text-on-surface-variant hover:text-white bg-white/5 rounded-lg border border-white/10 hover:border-white/20 transition-all cursor-pointer">
              <Copy className="w-4 h-4" />
           </button>
           <button onClick={() => navigate(`/add?edit=${trade.id}`)} className="p-2 text-on-surface-variant hover:text-white bg-white/5 rounded-lg border border-white/10 hover:border-primary/50 transition-all cursor-pointer">
              <Edit className="w-4 h-4" />
           </button>
           <button onClick={handleDelete} className="p-2 text-error hover:text-white bg-error/10 rounded-lg border border-error/20 hover:border-error/50 transition-all cursor-pointer">
              <Trash2 className="w-4 h-4" />
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Header Identity */}
          <div className="glass-panel p-6 rounded-xl flex flex-col gap-4">
             <div className="flex items-start justify-between">
                <div>
                   <div className="flex items-center gap-3 mb-2">
                     <span className="font-mono text-3xl font-bold text-white">{trade.asset}</span>
                     <Badge variant={trade.direction === 'buy' ? 'primary' : 'error'}>{trade.direction}</Badge>
                     <Badge variant={trade.result === 'win' ? 'primary' : trade.result === 'loss' ? 'error' : trade.result === 'open' ? 'warning' : 'surface'}>
                        {trade.result === 'open' ? 'OPEN' : trade.result}
                     </Badge>
                     <Badge variant="surface" size="sm">{trade.accountMode}</Badge>
                   </div>
                   <div className="text-on-surface-variant font-sans text-sm">
                      {format(parseISO(trade.date), 'PPPP, HH:mm')} • {trade.setupType || 'No Setup'} • {trade.timeframe}
                   </div>
                </div>
                <div className="text-right">
                   <span className={`block font-mono text-3xl font-bold ${trade.result === 'win' ? 'text-primary' : trade.result === 'loss' ? 'text-error' : 'text-white'}`}>
                      {trade.pnlIdr ? (trade.pnlIdr > 0 ? '+' : '') + formatCurrency(trade.pnlIdr, 'IDR') : '-'}
                   </span>
                   {trade.result !== 'open' && trade.rrRealized > 0 && (
                      <span className="font-mono text-sm text-on-surface-variant">Realized 1:{trade.rrRealized.toFixed(2)} R</span>
                   )}
                </div>
             </div>
          </div>

          <div className="glass-panel p-6 rounded-xl relative min-h-[400px]">
             <TradingViewChart symbol={inst.tradingViewSymbol} />
          </div>

          {/* Thesis & Remarks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="glass-panel p-6 rounded-xl">
                <h3 className="font-display text-sm font-bold text-on-surface-variant mb-3 uppercase tracking-widest border-b border-white/5 pb-2">Entry Thesis</h3>
                <p className="font-sans text-sm text-white leading-relaxed">{trade.entryReason || "No thesis documented."}</p>
             </div>
             {trade.status === 'closed' && (
                <div className="glass-panel p-6 rounded-xl">
                   <h3 className="font-display text-sm font-bold text-on-surface-variant mb-3 uppercase tracking-widest border-b border-white/5 pb-2">Lessons Learned</h3>
                   <p className="font-sans text-sm text-white leading-relaxed">{trade.lessonLearned || "No lessons documented."}</p>
                </div>
             )}
          </div>
        </div>

        {/* Right Column Data */}
        <div className="lg:col-span-4 flex flex-col gap-6">
           
           <div className="glass-panel p-6 rounded-xl flex flex-col gap-5">
              <h3 className="font-display text-sm font-bold text-on-surface-variant mb-1 uppercase tracking-widest border-b border-white/5 pb-2">Execution Metrics</h3>
              
              <div className="grid grid-cols-2 gap-4 gap-y-6">
                 <div>
                    <div className="font-display text-[10px] uppercase text-on-surface-variant mb-1">Lot Size</div>
                    <div className="font-mono text-lg text-white">{trade.lot}</div>
                 </div>
                 <div>
                    <div className="font-display text-[10px] uppercase text-on-surface-variant mb-1">Risk Assumed</div>
                    <div className="font-mono text-lg text-error">{trade.riskIdr ? formatCurrency(trade.riskIdr, 'IDR') : '-'} ({trade.riskPercent?.toFixed(2)}%)</div>
                 </div>
                 
                 <div>
                    <div className="font-display text-[10px] uppercase text-on-surface-variant mb-1">Actual Entry</div>
                    <div className="font-mono text-lg text-white">{trade.actualEntry || trade.entryPlan}</div>
                 </div>
                 <div>
                    <div className="font-display text-[10px] uppercase text-on-surface-variant mb-1">Actual Exit</div>
                    <div className="font-mono text-lg text-white">{trade.actualExit || '-'}</div>
                 </div>

                 <div>
                    <div className="font-display text-[10px] uppercase text-on-surface-variant mb-1">Stop Loss</div>
                    <div className="font-mono text-lg text-error">{trade.actualSL || trade.slPlan || '-'}</div>
                 </div>
                 <div>
                    <div className="font-display text-[10px] uppercase text-on-surface-variant mb-1">Take Profit</div>
                    <div className="font-mono text-lg text-primary">{trade.actualTP || trade.tp1Plan || '-'}</div>
                 </div>
              </div>
           </div>

           <div className="glass-panel p-6 rounded-xl flex flex-col gap-4">
              <h3 className="font-display text-sm font-bold text-on-surface-variant mb-1 uppercase tracking-widest border-b border-white/5 pb-2">Psychology</h3>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                 <span className="font-sans text-sm text-on-surface-variant">Emotion Before</span>
                 <span className="font-sans text-sm text-white font-medium">{trade.emotionBefore || 'Neutral'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                 <span className="font-sans text-sm text-on-surface-variant">Emotion After</span>
                 <span className="font-sans text-sm text-white font-medium">{trade.emotionAfter || 'Neutral'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                 <span className="font-sans text-sm text-on-surface-variant">Mistakes Made</span>
                 <div className="flex flex-wrap gap-1 justify-end">
                    {trade.mistakes && trade.mistakes.length > 0 ? (
                       trade.mistakes.map(m => (
                          <span key={m} className="bg-error/10 text-error text-[10px] uppercase px-2 py-1 rounded border border-error/20">{m}</span>
                       ))
                    ) : (
                       <span className="font-sans text-sm text-white">None</span>
                    )}
                 </div>
              </div>
              <div className="flex justify-between items-center py-2">
                 <span className="font-sans text-sm text-on-surface-variant">Followed Plan?</span>
                 <span className={`font-sans text-sm font-medium ${trade.followedPlan ? 'text-primary' : 'text-error'}`}>{trade.followedPlan ? 'Yes' : 'No'}</span>
              </div>
           </div>

           <div className="glass-panel p-6 rounded-xl flex flex-col gap-4">
              <h3 className="font-display text-sm font-bold text-on-surface-variant mb-1 uppercase tracking-widest border-b border-white/5 pb-2">Checklist Confidence</h3>
              <div className="w-full bg-[#161d18] rounded-full h-2 mt-1 mb-2 overflow-hidden border border-white/5 relative">
                <div 
                  className="bg-[#adc6ff] h-full rounded-full" 
                  style={{ width: `${(Object.values(trade.checklist).filter(Boolean).length / 10) * 100}%` }} 
                />
              </div>
              <div className="font-sans text-xs text-on-surface-variant flex justify-between">
                 <span>{Object.values(trade.checklist).filter(Boolean).length} of 10 factors met</span>
              </div>
           </div>

        </div>
      </div>
    </div>
  );
}
