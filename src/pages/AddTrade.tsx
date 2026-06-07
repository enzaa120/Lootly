import { useState, useEffect } from "react";
import { useAppStore } from "../store/AppContext";
import { useNavigate } from "react-router-dom";
import { AssetType, TradeDirection, TradeResult, EmotionType, MistakeType } from "../types";
import { WarningPanel } from "../components/ui/Globals";
import { formatCurrency } from "../lib/utils";
import { TrendingUp, TrendingDown, Target, Save, X, Calendar as CalendarIcon, Check } from "lucide-react";

export function AddTrade() {
  const { accountMode, settings, addTrade } = useAppStore();
  const navigate = useNavigate();

  // Primary State
  const [asset, setAsset] = useState<AssetType>("XAU/USD");
  const [direction, setDirection] = useState<TradeDirection>("buy");
  const [status, setStatus] = useState<"planned" | "closed">("closed");
  const [lot, setLot] = useState<number>(0.1);
  const [entryPrice, setEntryPrice] = useState<string>("");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");
  
  // Details State
  const [timeframe, setTimeframe] = useState<string>("M15");
  const [setupType, setSetupType] = useState<string>("Pullback EMA");
  const [entryReason, setEntryReason] = useState<string>("");
  const [bias, setBias] = useState<string>("Bullish");
  
  // Checklist State
  const [checklist, setChecklist] = useState({
    m30Checked: false,
    m15Checked: false,
    nearSnr: false,
    nearVwap: false,
    emaSupports: false,
    atrAcceptable: false,
    slClear: false,
    riskAcceptable: false,
    notRevenge: false,
    notChasingCandle: false,
  });

  const checkedCount = Object.values(checklist).filter(Boolean).length;

  // Post-trade State (if closed)
  const [result, setResult] = useState<TradeResult>("win");
  const [emotionBefore, setEmotionBefore] = useState<EmotionType>("Calm");
  const [emotionAfter, setEmotionAfter] = useState<EmotionType>("Calm");
  const [mentalStateNotes, setMentalStateNotes] = useState<string>("");
  const [mistakes, setMistakes] = useState<MistakeType[]>([]);
  const [disciplineScore, setDisciplineScore] = useState<number>(10);
  const [lessonLearned, setLessonLearned] = useState<string>("");
  
  // Calculations
  const inst = settings.instruments[asset];
  const ent = parseFloat(entryPrice);
  const sl = parseFloat(stopLoss);
  const tp = parseFloat(takeProfit);

  let pnlPoints = 0;
  let pnlIdr = 0;
  let riskPoints = 0;
  let riskUsd = 0;
  let rrRatio = 0;

  if (!isNaN(ent) && !isNaN(tp)) {
     if (direction === 'buy') pnlPoints = tp - ent;
     else pnlPoints = ent - tp;
     pnlIdr = pnlPoints * lot * inst.contractSize * settings.usdToIdr;
  }

  if (!isNaN(ent) && !isNaN(sl)) {
     if (direction === 'buy') riskPoints = ent - sl;
     else riskPoints = sl - ent;
     
     if (riskPoints > 0) {
        riskUsd = riskPoints * lot * inst.contractSize;
        if (pnlPoints > 0) {
           rrRatio = pnlPoints / riskPoints;
        }
     }
  }

  const balance = accountMode === "demo" ? settings.startingBalanceDemo : settings.startingBalanceReal;
  const riskPercent = balance > 0 && riskUsd > 0 ? (riskUsd / balance) * 100 : 0;
  
  const riskExceeded = riskPercent > settings.maxDailyLossPercent;

  const handleSave = () => {
    // Show warnings as prompts or alert if critical
    if (isNaN(sl)) {
      alert("Warning: SL wajib. Tanpa SL, ini bukan trading plan.");
      return;
    }
    if (checkedCount < 7) {
      alert("Warning: Setup belum cukup kuat. Jangan entry cuma karena emosi.");
    }
    if (isNaN(ent) || isNaN(lot) || lot <= 0) {
      alert("Pastikan Entry Price dan Lot valid.");
      return;
    }

    const newId = addTrade({
      accountMode: accountMode,
      status: status,
      date: new Date().toISOString(),
      asset: asset,
      tradingViewSymbol: inst.tradingViewSymbol,
      direction: direction,
      timeframe: timeframe,
      session: "Asia", // Simplified
      bias: bias,
      setupType: setupType,
      entryReason: entryReason,
      entryPlan: ent,
      slPlan: sl,
      tp1Plan: isNaN(tp) ? undefined : tp,
      actualEntry: ent,
      actualExit: status === 'closed' && !isNaN(tp) ? tp : undefined,
      actualSL: sl,
      actualTP: isNaN(tp) ? undefined : tp,
      lot: lot,
      riskPercent: riskPercent || 0,
      riskIdr: riskUsd * settings.usdToIdr || 0,
      pnlIdr: status === 'closed' ? pnlIdr : 0,
      pnlPoints: status === 'closed' ? pnlPoints : 0,
      pnlPips: status === 'closed' ? pnlPoints / inst.pipSize : 0,
      rrPlanned: rrRatio,
      rrRealized: status === 'closed' ? rrRatio : 0,
      result: status === 'closed' ? result : 'open',
      emotionBefore: emotionBefore,
      emotionAfter: emotionAfter,
      mentalStateNotes: mentalStateNotes,
      checklist: checklist,
      mistakes: mistakes,
      disciplineScore: disciplineScore,
      lessonLearned: lessonLearned
    });
    
    // Simulate toast
    alert("Trade berhasil disimpan.");
    navigate(`/journal/${newId}`);
  };

  const toggleChecklist = (key: keyof typeof checklist) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleMistake = (tag: MistakeType) => {
     if (mistakes.includes(tag)) {
        setMistakes(mistakes.filter(m => m !== tag));
     } else {
        setMistakes([...mistakes, tag]);
     }
  };

  return (
    <div className="px-4 md:px-8 max-w-5xl mx-auto w-full pb-8 pt-4">
      <div className="flex items-center justify-between mb-8 sticky top-16 md:top-0 z-30 bg-[#0e1510] py-4 border-b border-white/5">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-on-surface-variant hover:text-white transition-colors cursor-pointer">
            <X className="w-6 h-6" />
          </button>
          <h1 className="font-display text-2xl font-bold text-on-surface">New Trade Entry</h1>
        </div>
        <button 
          onClick={handleSave}
          className="bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-[#00391f] transition-all px-6 py-2.5 rounded-lg flex items-center gap-2 font-display text-xs font-bold tracking-widest uppercase cursor-pointer"
        >
          <Save className="w-4 h-4" /> Save
        </button>
      </div>

      <div className="flex flex-col gap-6">

        {/* Warnings */}
        {accountMode === 'real' && riskExceeded && (
          <WarningPanel 
            title="Max Risk Exceeded" 
            message="Hati-hati Bos, ini akun real. Jangan biarkan emosi mengatur lot. Risk is above your daily threshold." 
            type="error" 
          />
        )}
        
        {checkedCount < 7 && (
           <WarningPanel 
            title="Weak Setup" 
            message="Setup belum cukup kuat. Jangan entry cuma karena emosi." 
            type="warning" 
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column (Identity & Plan) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* 1. Trade Identity */}
            <section className="glass-panel rounded-xl p-6">
              <h2 className="font-display text-lg text-white mb-4 border-b border-white/5 pb-2">Trade Identity</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Status</label>
                  <div className="flex bg-[#161d18] p-1 rounded-lg border border-white/5">
                    <button 
                      onClick={() => setStatus('planned')}
                      className={`flex-1 py-2 rounded-md font-display text-xs font-semibold cursor-pointer ${status === 'planned' ? 'bg-primary/20 text-primary' : 'text-on-surface-variant hover:text-white'}`}
                    >
                      Planned
                    </button>
                    <button 
                       onClick={() => setStatus('closed')}
                       className={`flex-1 py-2 rounded-md font-display text-xs font-semibold cursor-pointer ${status === 'closed' ? 'bg-surface-variant text-white border border-white/10' : 'text-on-surface-variant hover:text-white'}`}
                    >
                      Closed
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Asset</label>
                  <select 
                    className="glass-input w-full rounded-lg px-4 py-2.5 text-white font-mono appearance-none outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
                    value={asset} onChange={e => setAsset(e.target.value as AssetType)}
                  >
                    <option value="XAU/USD">XAU/USD</option>
                    <option value="BTC/USD">BTC/USD</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Direction</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setDirection('buy')}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-display text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${direction === 'buy' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-[#161d18] text-on-surface-variant border border-white/5 hover:bg-white/5'}`}
                    >
                      <TrendingUp className="w-5 h-5"/> Buy / Long
                    </button>
                    <button 
                       onClick={() => setDirection('sell')}
                       className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-display text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${direction === 'sell' ? 'bg-error/20 text-error border border-error/30' : 'bg-[#161d18] text-on-surface-variant border border-white/5 hover:bg-white/5'}`}
                    >
                      <TrendingDown className="w-5 h-5"/> Sell / Short
                    </button>
                  </div>
                </div>
              </div>
            </section>

             {/* 2. Pre-Trade Plan */}
            <section className="glass-panel rounded-xl p-6">
              <h2 className="font-display text-lg text-white mb-4 border-b border-white/5 pb-2">Pre-Trade Plan</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="flex flex-col gap-1.5">
                  <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Market Bias</label>
                  <select className="glass-input w-full rounded-lg px-4 py-2.5 text-white font-sans appearance-none outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer" value={bias} onChange={e => setBias(e.target.value)}>
                    <option>Bullish</option>
                    <option>Bearish</option>
                    <option>Sideways</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Setup Type</label>
                  <select className="glass-input w-full rounded-lg px-4 py-2.5 text-white font-sans appearance-none outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer" value={setupType} onChange={e => setSetupType(e.target.value)}>
                    <option>Pullback EMA</option>
                    <option>Retest VWAP</option>
                    <option>SNR Rejection</option>
                    <option>Breakout Retest</option>
                    <option>Trendline Bounce</option>
                  </select>
                </div>
              </div>
              
              <div className="flex flex-col gap-1.5 mb-6">
                 <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Entry Reason & Thesis</label>
                 <textarea 
                   className="glass-input w-full rounded-lg px-4 py-3 text-white font-sans min-h-[100px] resize-none outline-none focus:ring-1 focus:ring-primary/40"
                   placeholder="Review your trading plan. Why are you entering here?"
                   value={entryReason} onChange={e => setEntryReason(e.target.value)}
                 />
              </div>

               <div className="bg-[#161d18] border border-white/5 rounded-lg p-4">
                  <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant block mb-3">Confluence Checklist</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     {[
                       { key: 'm30Checked', label: "M30 Direction Aligned" },
                       { key: 'm15Checked', label: "M15 Confirmation" },
                       { key: 'nearSnr', label: "Price near S/R" },
                       { key: 'nearVwap', label: "Price near VWAP" },
                       { key: 'emaSupports', label: "EMA 50/200 Supports" },
                       { key: 'atrAcceptable', label: "ATR Acceptable" },
                       { key: 'slClear', label: "Stop Loss is Clear" },
                       { key: 'riskAcceptable', label: "Risk is Acceptable" },
                       { key: 'notRevenge', label: "Not Revenge Trading" },
                       { key: 'notChasingCandle', label: "Not Chasing Candle" },
                     ].map(item => (
                        <label 
                           key={item.key} 
                           className="flex items-center gap-3 cursor-pointer group select-none"
                           onClick={(e) => { e.preventDefault(); toggleChecklist(item.key as keyof typeof checklist); }}
                        >
                          <input type="checkbox" className="hidden" checked={checklist[item.key as keyof typeof checklist]} readOnly />
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${checklist[item.key as keyof typeof checklist] ? 'bg-primary border-primary text-[#0e1510]' : 'border-white/20 bg-surface group-hover:border-primary'}`}>
                             {checklist[item.key as keyof typeof checklist] && <Check className="w-3.5 h-3.5" />}
                          </div>
                          <span className="font-sans text-sm text-on-surface group-hover:text-white transition-colors">{item.label}</span>
                        </label>
                     ))}
                  </div>
               </div>
            </section>

            {/* 3. Psychology Section */}
            <section className="glass-panel rounded-xl p-6">
               <h2 className="font-display text-lg text-white mb-4 border-b border-white/5 pb-2">Psychology</h2>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Emotion Before Trade</label>
                    <select className="glass-input w-full rounded-lg px-4 py-2.5 text-white font-sans appearance-none cursor-pointer" value={emotionBefore} onChange={e => setEmotionBefore(e.target.value as EmotionType)}>
                      <option value="Calm">Calm</option>
                      <option value="Confident">Confident</option>
                      <option value="Doubtful">Doubtful</option>
                      <option value="FOMO">FOMO</option>
                      <option value="Revenge">Revenge</option>
                      <option value="Greedy">Greedy</option>
                      <option value="Afraid">Afraid</option>
                      <option value="Tired">Tired</option>
                      <option value="Forced Entry">Forced Entry</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Emotion After Trade</label>
                    <select className="glass-input w-full rounded-lg px-4 py-2.5 text-white font-sans appearance-none cursor-pointer" value={emotionAfter} onChange={e => setEmotionAfter(e.target.value as EmotionType)}>
                      <option value="Calm">Calm</option>
                      <option value="Satisfied">Satisfied</option>
                      <option value="Regret">Regret</option>
                      <option value="Angry">Angry</option>
                      <option value="Greedy">Greedy</option>
                      <option value="Afraid">Afraid</option>
                      <option value="Relieved">Relieved</option>
                      <option value="Disappointed">Disappointed</option>
                    </select>
                  </div>
               </div>

               <div className="flex flex-col gap-1.5 mb-6">
                  <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Mental State Notes</label>
                  <textarea 
                    className="glass-input w-full rounded-lg px-4 py-3 text-white font-sans min-h-[80px] resize-none outline-none focus:ring-1 focus:ring-primary/40"
                    placeholder="Apa kondisi pikiran kamu sebelum/sesudah entry?"
                    value={mentalStateNotes} onChange={e => setMentalStateNotes(e.target.value)}
                  />
               </div>

               <div className="flex flex-col gap-1.5 mb-6">
                  <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant flex justify-between">
                     Discipline Score 
                     <span className={disciplineScore >= 7 ? 'text-primary' : disciplineScore >= 4 ? 'text-yellow-500' : 'text-error'}>{disciplineScore}/10</span>
                  </label>
                  <input type="range" min="1" max="10" value={disciplineScore} onChange={e => setDisciplineScore(Number(e.target.value))} className="w-full accent-primary cursor-pointer"/>
               </div>

               <div className="flex flex-col gap-1.5 mb-6">
                  <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Mistake Tags (If any)</label>
                  <div className="flex flex-wrap gap-2">
                     {["FOMO", "Revenge Trade", "Early Entry", "Late Entry", "Oversized Lot", "No SL", "SL Too Tight", "Against Trend", "News Spike", "Overtrade", "Chasing Candle", "Closed Too Early", "Held Too Long"].map(tag => (
                        <button
                           key={tag}
                           onClick={() => toggleMistake(tag as MistakeType)}
                           className={`px-3 py-1.5 rounded-full font-sans text-xs transition-colors cursor-pointer border ${mistakes.includes(tag as MistakeType) ? 'bg-[#ff3b30]/20 text-[#ff3b30] border-[#ff3b30]/30' : 'bg-[#161d18] text-on-surface-variant border-white/5 hover:border-white/20'}`}
                        >
                           {tag}
                        </button>
                     ))}
                  </div>
               </div>

               <div className="flex flex-col gap-1.5">
                  <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Lesson Learned</label>
                  <textarea 
                    className="glass-input w-full rounded-lg px-4 py-3 text-white font-sans min-h-[80px] resize-none outline-none focus:ring-1 focus:ring-primary/40"
                    placeholder="Apa pelajaran dari trade ini?"
                    value={lessonLearned} onChange={e => setLessonLearned(e.target.value)}
                  />
               </div>
            </section>
          </div>

          {/* Right Column (Execution) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
             <section className="glass-panel rounded-xl p-6 shadow-xl flex flex-col sticky top-24">
                <div className="flex items-center gap-2 border-b border-white/5 pb-2 mb-4">
                  <Target className="text-[#4b8eff] w-5 h-5" />
                  <h2 className="font-display text-lg text-white">Execution</h2>
                </div>

                <div className="space-y-4 flex-1">
                   {/* Risk Slider visual purely informational here since risk is derived from lot & SL */}
                   <div className="flex flex-col gap-1.5">
                      <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant flex justify-between">
                         Derived Risk %
                         <span className={riskExceeded ? 'text-error' : 'text-primary'}>{riskPercent.toFixed(2)}%</span>
                      </label>
                      <div className="h-1 bg-[#242c26] rounded-full overflow-hidden mt-1">
                         <div className={`h-full ${riskExceeded ? 'bg-error' : 'bg-primary'}`} style={{width: `${Math.min(100, riskPercent * 10)}%`}} />
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-3 mt-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Lot Size</label>
                        <input type="number" step="0.01" className="glass-input w-full rounded-lg px-3 py-2 text-right text-white font-mono outline-none focus:ring-1 focus:ring-primary/40" value={lot} onChange={e => setLot(Number(e.target.value))}/>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Entry Price</label>
                        <input type="number" className="glass-input w-full rounded-lg px-3 py-2 text-right text-white font-mono outline-none focus:ring-1 focus:ring-primary/40" value={entryPrice} onChange={e => setEntryPrice(e.target.value)}/>
                      </div>
                   </div>

                   <div className="flex gap-3 items-center mt-2">
                       <div className="flex-1 flex flex-col gap-1.5">
                          <label className="font-display text-[10px] uppercase tracking-wider text-error">Stop Loss</label>
                          <input type="number" className="w-full bg-error/5 border border-error/30 rounded-lg px-3 py-2 text-right text-error font-mono focus:border-error focus:ring-1 focus:ring-error/50 outline-none placeholder:text-error/30" placeholder="Required" value={stopLoss} onChange={e => setStopLoss(e.target.value)}/>
                       </div>
                       <div className="w-px h-8 bg-white/10 mt-5"></div>
                       <div className="flex-1 flex flex-col gap-1.5">
                          <label className="font-display text-[10px] uppercase tracking-wider text-primary">Take Profit</label>
                          <input type="number" className="w-full bg-primary/5 border border-primary/30 rounded-lg px-3 py-2 text-right text-primary font-mono focus:border-primary focus:ring-1 focus:ring-primary/50 outline-none placeholder:text-primary/30" placeholder="Optional" value={takeProfit} onChange={e => setTakeProfit(e.target.value)}/>
                       </div>
                   </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 grid grid-cols-2 gap-3">
                   <div className="bg-[#161d18] rounded-lg p-3 flex flex-col items-center justify-center border border-white/5">
                      <span className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Risk:Reward</span>
                      <span className="font-mono text-lg text-white">{rrRatio > 0 ? `1:${rrRatio.toFixed(2)}` : '--'}</span>
                   </div>
                   <div className="bg-[#161d18] rounded-lg p-3 flex flex-col items-center justify-center border border-white/5">
                      <span className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant mb-1">Proj. P/L</span>
                      <span className={`font-mono text-lg ${pnlIdr >= 0 ? 'text-primary' : 'text-error'}`}>{pnlIdr ? formatCurrency(Math.abs(pnlIdr), 'IDR') : '--'}{(pnlIdr < 0) ? '-' : (pnlIdr > 0 ? '+' : '')}</span>
                   </div>
                </div>

                {/* Simulated Post Trade Review inline if "Closed" */}
                {status === "closed" && (
                   <div className="mt-4 pt-4 border-t border-white/5">
                       <div className="flex flex-col gap-1.5">
                        <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Final Result</label>
                        <select className="glass-input w-full rounded-lg px-4 py-2.5 text-white font-sans appearance-none cursor-pointer" value={result} onChange={e => setResult(e.target.value as TradeResult)}>
                          <option value="win">Win</option>
                          <option value="loss">Loss</option>
                          <option value="breakeven">Break Even</option>
                        </select>
                      </div>
                   </div>
                )}
             </section>
          </div>
        </div>
      </div>
    </div>
  );
}
