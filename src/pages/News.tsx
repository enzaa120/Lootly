import React, { useState, useEffect } from "react";
import { generateId } from "../lib/utils";
import { NewsEvent } from "../types";
import { Plus, Trash2, Edit, Check, Calendar as CalendarIcon, ExternalLink, RefreshCw, AlertTriangle, Globe } from "lucide-react";
import { Badge } from "../components/ui/Globals";
import { format, parseISO } from "date-fns";

export function News() {
  const [newsList, setNewsList] = useState<NewsEvent[]>([]);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const todaysDate = new Date().toISOString().split("T")[0];
  const [formDate, setFormDate] = useState(todaysDate);
  const [formTime, setFormTime] = useState("08:30");
  const [formCurrency, setFormCurrency] = useState<NewsEvent["currency"]>("USD");
  const [formImpact, setFormImpact] = useState<NewsEvent["impact"]>("High");
  const [formEventName, setFormEventName] = useState("");
  const [formForecast, setFormForecast] = useState("");
  const [formPrevious, setFormPrevious] = useState("");
  const [formActual, setFormActual] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formAsset, setFormAsset] = useState<NewsEvent["relevantAsset"]>("Both");
  const [formRule, setFormRule] = useState("No trade 30 menit sebelum news");

  const [autoNews, setAutoNews] = useState<any[]>([]);
  const [loadingAutoNews, setLoadingAutoNews] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("Lootly.newsEvents");
    if (saved) {
      try {
        setNewsList(JSON.parse(saved));
      } catch (e) {
        // ignore
      }
    }

    const fetchAutoNews = async () => {
      try {
        setLoadingAutoNews(true);
        // Try direct fetch first, fallback to proxy if needed
        let res;
        try {
          res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
          if (!res.ok) throw new Error("Direct fetch failed");
        } catch {
          const url = encodeURIComponent('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
          res = await fetch(`https://api.allorigins.win/raw?url=${url}`);
        }
        
        if (!res.ok) return;
        const parsed = await res.json();
        
        // Filter only medium/high impact news for USD, EUR, GBP, JPY, AUD
        const relevant = parsed.filter((n: any) => 
           (n.impact === 'High' || n.impact === 'Medium') && 
           ['USD','EUR','GBP','JPY','AUD'].includes(n.country) &&
           new Date(n.date).getTime() >= new Date().setHours(0,0,0,0) // from today onwards
        ).slice(0, 5); // take top 5
        
        setAutoNews(relevant);
      } catch (e) {
        // fail silently to avoid alerting the user in preview
      } finally {
         setLoadingAutoNews(false);
      }
    };
    fetchAutoNews();
  }, []);

  const saveNewsList = (list: NewsEvent[]) => {
    setNewsList(list);
    localStorage.setItem("Lootly.newsEvents", JSON.stringify(list));
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEventName.trim()) return;

    const newEvent: NewsEvent = {
       id: editingId || generateId(),
       date: formDate,
       time: formTime,
       currency: formCurrency,
       impact: formImpact,
       eventName: formEventName,
       forecast: formForecast,
       previous: formPrevious,
       actual: formActual,
       notes: formNotes,
       relevantAsset: formAsset,
       tradingRule: formRule,
       isDone: false
    };

    if (editingId) {
       saveNewsList(newsList.map(n => n.id === editingId ? { ...newEvent, isDone: n.isDone } : n));
       setEditingId(null);
    } else {
       saveNewsList([...newsList, newEvent].sort((a,b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime()));
    }
    
    // Reset Form
    setFormEventName("");
    setFormForecast("");
    setFormPrevious("");
    setFormActual("");
    setFormNotes("");
    alert("News berhasil dicatat.");
  };

  const handleEdit = (n: NewsEvent) => {
     setEditingId(n.id);
     setFormDate(n.date);
     setFormTime(n.time);
     setFormCurrency(n.currency);
     setFormImpact(n.impact);
     setFormEventName(n.eventName);
     setFormForecast(n.forecast || "");
     setFormPrevious(n.previous || "");
     setFormActual(n.actual || "");
     setFormNotes(n.notes || "");
     setFormAsset(n.relevantAsset);
     setFormRule(n.tradingRule || "");
  };

  const handleDelete = (id: string) => {
     if (window.confirm("Hapus news ini?")) {
        saveNewsList(newsList.filter(n => n.id !== id));
     }
  };

  const toggleDone = (id: string) => {
     saveNewsList(newsList.map(n => n.id === id ? { ...n, isDone: !n.isDone } : n));
  };

  return (
    <div className="px-4 md:px-8 max-w-7xl mx-auto w-full pb-16 pt-4 flex flex-col h-auto">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 mt-6">
        <div>
          <h1 className="font-display text-4xl md:text-5xl font-bold text-on-surface mb-2 tracking-tighter">News & Kalender Market</h1>
          <p className="font-sans text-sm text-on-surface-variant">Pantau event penting sebelum entry agar tidak masuk saat market terlalu liar.</p>
        </div>
      </div>

      <p className="font-sans text-xs text-[#4b8eff] bg-[#4b8eff]/10 px-4 py-2 border border-[#4b8eff]/20 rounded-lg mb-8 inline-block max-w-fit">
        Versi awal Lootly belum menarik data otomatis dari Forex Factory. Gunakan tombol cepat untuk cek kalender, lalu catat news penting di sini.
      </p>

      {/* Quick Links Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
         {/* Forex Factory Calendar */}
         <div className="glass-panel p-6 rounded-xl flex flex-col gap-4 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#4b8eff]/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="flex items-center gap-3 mb-2">
               <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <CalendarIcon className="w-6 h-6 text-[#4b8eff]" />
               </div>
               <h3 className="font-display text-lg text-white font-bold tracking-tight">Forex Factory Calendar</h3>
            </div>
            <p className="font-sans text-sm text-on-surface-variant flex-1">Lihat jadwal news high impact seperti CPI, NFP, FOMC, Fed Speech, dan data USD lain.</p>
            <a href="https://www.forexfactory.com/calendar" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3 bg-[#4b8eff]/20 hover:bg-[#4b8eff]/30 text-[#adc6ff] rounded-lg border border-[#4b8eff]/30 transition-colors font-display text-xs font-bold tracking-widest uppercase">
               Buka Forex Factory <ExternalLink className="w-4 h-4" />
            </a>
         </div>

         {/* Forex Factory News */}
         <div className="glass-panel p-6 rounded-xl flex flex-col gap-4 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#4b8eff]/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="flex items-center gap-3 mb-2">
               <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <Globe className="w-6 h-6 text-[#4b8eff]" />
               </div>
               <h3 className="font-display text-lg text-white font-bold tracking-tight">Forex Factory News</h3>
            </div>
            <p className="font-sans text-sm text-on-surface-variant flex-1">Pantau headline market dan sentimen global sebelum trading.</p>
            <a href="https://www.forexfactory.com/news" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 transition-colors font-display text-xs font-bold tracking-widest uppercase">
               Buka News <ExternalLink className="w-4 h-4" />
            </a>
         </div>

         {/* Auto News Sync */}
         <div className="glass-panel p-6 rounded-xl flex flex-col gap-4 relative overflow-hidden">
            <div className="absolute top-4 right-4">
               <Badge variant="primary" size="sm">LIVE DATA</Badge>
            </div>
            <div className="flex items-center gap-3 mb-2">
               <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                  <RefreshCw className={`w-6 h-6 text-primary ${loadingAutoNews ? 'animate-spin' : ''}`} />
               </div>
               <h3 className="font-display text-lg text-white font-bold tracking-tight">Upcoming High Impact News</h3>
            </div>
            {loadingAutoNews ? (
               <p className="font-sans text-sm text-on-surface-variant flex-1">Fetching live data from Forex Factory...</p>
            ) : autoNews.length > 0 ? (
               <div className="flex-1 flex flex-col gap-2">
                 {autoNews.map((n, i) => (
                    <div key={i} className="flex items-center justify-between font-sans text-xs pb-2 border-b border-white/5 last:border-0 last:pb-0">
                       <div className="flex gap-2 items-center">
                          <span className={`px-1.5 py-0.5 rounded font-display text-[9px] uppercase font-bold border ${n.impact === 'High' ? 'text-error bg-error/10 border-error/20' : 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'}`}>
                             {n.country}
                          </span>
                          <span className="text-white truncate max-w-[150px]">{n.title}</span>
                       </div>
                       <span className="text-on-surface-variant font-mono">{format(new Date(n.date), "EEE, HH:mm")}</span>
                    </div>
                 ))}
               </div>
            ) : (
               <p className="font-sans text-sm text-on-surface-variant flex-1">Tidak ada live news minggu ini atau API gagal ditarik.</p>
            )}
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
         {/* Planner Form */}
         <div className="lg:col-span-1">
            <section className="glass-panel rounded-xl p-6 sticky top-24">
               <h2 className="font-display text-lg text-white mb-6 border-b border-white/5 pb-2">Catat News Penting</h2>
               <form onSubmit={handleSaveForm} className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="flex flex-col gap-1.5">
                        <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Date</label>
                        <input type="date" required className="glass-input w-full rounded-lg px-4 py-2 text-white font-sans text-sm outline-none" value={formDate} onChange={e => setFormDate(e.target.value)} />
                     </div>
                     <div className="flex flex-col gap-1.5">
                        <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Time</label>
                        <input type="time" required className="glass-input w-full rounded-lg px-4 py-2 text-white font-sans text-sm outline-none" value={formTime} onChange={e => setFormTime(e.target.value)} />
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="flex flex-col gap-1.5">
                        <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Currency</label>
                        <select className="glass-input w-full rounded-lg px-4 py-2 text-white font-sans text-sm outline-none appearance-none" value={formCurrency} onChange={e => setFormCurrency(e.target.value as any)}>
                           {["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                     </div>
                     <div className="flex flex-col gap-1.5">
                        <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Impact</label>
                         <select className="glass-input w-full rounded-lg px-4 py-2 text-white font-sans text-sm outline-none appearance-none" value={formImpact} onChange={e => setFormImpact(e.target.value as any)}>
                           <option value="High">High 🔴</option>
                           <option value="Medium">Medium 🟠</option>
                           <option value="Low">Low 🟡</option>
                        </select>
                     </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                     <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Event Name</label>
                     <input type="text" placeholder="e.g. CPI, NFP, Jerome Powell Speaks" required className="glass-input w-full rounded-lg px-4 py-2 text-white font-sans text-sm outline-none" value={formEventName} onChange={e => setFormEventName(e.target.value)} />
                  </div>

                   <div className="grid grid-cols-3 gap-2">
                     <div className="flex flex-col gap-1.5">
                        <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Previous</label>
                        <input type="text" className="glass-input w-full rounded-lg px-3 py-2 text-white font-sans text-sm outline-none" placeholder="e.g. 0.2%" value={formPrevious} onChange={e => setFormPrevious(e.target.value)} />
                     </div>
                     <div className="flex flex-col gap-1.5">
                        <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Forecast</label>
                        <input type="text" className="glass-input w-full rounded-lg px-3 py-2 text-white font-sans text-sm outline-none" placeholder="e.g. 0.3%" value={formForecast} onChange={e => setFormForecast(e.target.value)} />
                     </div>
                     <div className="flex flex-col gap-1.5">
                        <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Actual</label>
                        <input type="text" className="glass-input w-full rounded-lg px-3 py-2 text-white font-sans text-sm outline-none" value={formActual} onChange={e => setFormActual(e.target.value)} />
                     </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                     <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Relevant Asset</label>
                     <select className="glass-input w-full rounded-lg px-4 py-2 text-white font-sans text-sm outline-none appearance-none" value={formAsset} onChange={e => setFormAsset(e.target.value as any)}>
                        <option value="Both">Both XAU & BTC</option>
                        <option value="XAU/USD">XAU/USD</option>
                        <option value="BTC/USD">BTC/USD</option>
                     </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                     <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Trading Rule</label>
                     <select className="glass-input w-full rounded-lg px-4 py-2 text-white font-sans text-sm outline-none appearance-none" value={formRule} onChange={e => setFormRule(e.target.value)}>
                        <option value="No trade 30 menit sebelum news">No trade 30 menit sebelum news</option>
                        <option value="No trade 15 menit sebelum news">No trade 15 menit sebelum news</option>
                        <option value="Only trade after news settles">Only trade after news settles</option>
                        <option value="Trade only if setup A+">Trade only if setup A+</option>
                        <option value="Take partials before news">Take partials before news</option>
                        <option value="Move SL to BE before news">Move SL to BE before news</option>
                     </select>
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                     <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Notes</label>
                     <textarea className="glass-input w-full rounded-lg px-4 py-2 text-white font-sans text-sm outline-none resize-none min-h-[60px]" placeholder="Catatan efek pada price action" value={formNotes} onChange={e => setFormNotes(e.target.value)} />
                  </div>

                  <button type="submit" className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-display text-xs font-bold uppercase tracking-widest py-3 mt-4 rounded-lg flex justify-center items-center gap-2 transition-all cursor-pointer">
                     <Plus className="w-4 h-4" /> {editingId ? "Update News" : "Simpan News"}
                  </button>
                  {editingId && (
                     <button type="button" onClick={() => { setEditingId(null); setFormEventName(""); }} className="w-full bg-white/5 hover:bg-white/10 text-white font-sans text-xs py-2 rounded-lg cursor-pointer">
                        Batal Edit
                     </button>
                  )}
               </form>
            </section>
         </div>

         {/* Saved/List */}
         <div className="lg:col-span-2">
            {newsList.length === 0 ? (
               <div className="glass-panel rounded-xl p-12 flex flex-col items-center justify-center text-center opacity-70">
                  <CalendarIcon className="w-12 h-12 text-on-surface-variant mb-4" />
                  <h3 className="font-display text-lg text-white mb-2">Belum Ada Catatan News</h3>
                  <p className="font-sans text-sm text-on-surface-variant">Catat berita ekonomi hari ini agar kamu bisa prepare trading plan dengan aman.</p>
               </div>
            ) : (
               <div className="flex flex-col gap-4">
                  {newsList.map(n => {
                     const impactColor = n.impact === 'High' ? 'text-error bg-error/10 border-error/20' : 
                                         n.impact === 'Medium' ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' : 
                                         'text-[#4b8eff] bg-[#4b8eff]/10 border-[#4b8eff]/20';
                     return (
                        <div key={n.id} className={`glass-panel rounded-xl p-5 flex flex-col md:flex-row gap-4 border ${n.isDone ? 'opacity-50 border-white/5' : 'border-white/10'} hover:border-white/30 transition-all`}>
                           <div className="flex flex-col items-center justify-center min-w-[70px] border-r border-white/5 pr-4 py-2">
                              <span className="font-display font-medium text-on-surface-variant text-[10px] uppercase tracking-widest">{format(parseISO(n.date), 'MMM dd')}</span>
                              <span className="font-mono text-lg text-white font-bold">{n.time}</span>
                           </div>
                           
                           <div className="flex-1 flex flex-col items-start gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                 <span className={`px-2 py-0.5 rounded font-display text-[10px] uppercase font-bold border ${impactColor}`}>
                                    {n.currency}
                                 </span>
                                 {n.impact === 'High' && <span className="text-error font-sans text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> High Impact</span>}
                                 <h3 className="font-display text-lg text-white font-bold ml-1">{n.eventName}</h3>
                              </div>
                              <div className="font-sans text-xs text-on-surface-variant flex flex-wrap gap-x-4 gap-y-1">
                                 <span>P: <strong className="text-white">{n.previous || '-'}</strong></span>
                                 <span>F: <strong className="text-white">{n.forecast || '-'}</strong></span>
                                 <span>A: <strong className="text-white">{n.actual || '-'}</strong></span>
                              </div>
                              <p className="font-sans text-sm text-white/90 bg-[#161d18] border border-white/5 rounded-lg px-3 py-2 w-full mt-1">Rule: <strong>{n.tradingRule} ({n.relevantAsset})</strong></p>
                              {n.notes && (
                                 <p className="font-sans text-xs text-on-surface-variant italic mt-1">{n.notes}</p>
                              )}
                           </div>
                           
                           <div className="flex md:flex-col gap-2 items-center justify-start border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-4 mt-2 md:mt-0">
                              <button onClick={() => toggleDone(n.id)} className={`p-2 rounded-lg border transition-all cursor-pointer ${n.isDone ? 'bg-primary/20 text-primary border-primary/30' : 'bg-white/5 text-on-surface-variant border-white/10 hover:text-white'}`} title={n.isDone ? "Mark as Undone" : "Mark as Done"}>
                                 <Check className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleEdit(n)} className="p-2 bg-white/5 text-on-surface-variant hover:text-white rounded-lg border border-white/10 hover:border-white/30 transition-all cursor-pointer" title="Edit">
                                 <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(n.id)} className="p-2 bg-error/10 text-error hover:text-white rounded-lg border border-error/20 hover:bg-error transition-all cursor-pointer" title="Hapus">
                                 <Trash2 className="w-4 h-4" />
                              </button>
                           </div>
                        </div>
                     );
                  })}
               </div>
            )}
         </div>

      </div>
    </div>
  );
}
