import React, { useState, useEffect } from "react";
import { useAppStore } from "../store/AppContext";
import { Wallet, Palette, Sliders, Database, Download, Upload, Trash2, Save } from "lucide-react";

function FormattedMoneyInput({ 
  value, 
  onChange, 
  className 
}: { 
  value: number; 
  onChange: (v: number) => void; 
  className?: string; 
}) {
  const [displayValue, setDisplayValue] = useState(value.toLocaleString("id-ID"));

  useEffect(() => {
    setDisplayValue(value.toLocaleString("id-ID"));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value.replace(/\./g, "").replace(/\D/g, "");
    const numValue = rawValue ? parseInt(rawValue, 10) : 0;
    setDisplayValue(numValue.toLocaleString("id-ID"));
    onChange(numValue);
  };

  return (
    <input 
      type="text" 
      className={className} 
      value={displayValue} 
      onChange={handleChange} 
    />
  );
}

export function Settings() {
  const { settings, updateSettings, resetAllData, importData, trades, transactions, reviews } = useAppStore();
  const [localSettings, setLocalSettings] = useState(settings);

  const handleSave = () => {
    updateSettings(localSettings);
    alert("Settings berhasil disimpan.");
  };

  const handleExportJSON = () => {
    const data = JSON.stringify({ settings, trades, transactions, reviews }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lootly_backup_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    alert("Backup JSON berhasil dibuat.");
  };

  const handleExportCSV = () => {
    if (trades.length === 0) {
       alert("Tidak ada trade untuk diexport.");
       return;
    }
    const header = Object.keys(trades[0]).join(",");
    const rows = trades.map(t => Object.values(t).map(v => typeof v === 'object' ? JSON.stringify(v) : v).join(",")).join("\n");
    const blob = new Blob([header + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lootly_trades_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    alert("CSV berhasil diexport.");
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (!window.confirm("Import akan menimpa data yang ada. Lanjutkan?")) return;
      
      const reader = new FileReader();
      reader.onload = e => {
        const content = e.target?.result as string;
        if (importData(content)) {
           alert("Data berhasil diimport.");
           window.location.reload();
        } else {
           alert("Invalid backup file.");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="px-4 md:px-8 max-w-7xl mx-auto w-full pb-8 pt-4">
      <div className="mb-8">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-on-surface mb-2">Pengaturan</h1>
        <p className="font-sans text-on-surface-variant">Atur parameter trading, kelola data, dan sesuaikan workspace.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-min">
        
        {/* Account Config */}
        <section className="glass-panel rounded-xl p-6 md:col-span-12 flex flex-col gap-6">
          <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <Wallet className="text-primary w-5 h-5" />
            <h2 className="font-display text-lg text-white">Konfigurasi Akun</h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Saldo Awal Demo (IDR)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-mono">Rp</span>
                <FormattedMoneyInput 
                  className="glass-input w-full rounded-lg py-2 pl-9 pr-3 text-white font-mono"
                  value={localSettings.startingBalanceDemo}
                  onChange={(v) => setLocalSettings({...localSettings, startingBalanceDemo: v})}
                />
              </div>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Saldo Awal Real (IDR)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-mono">Rp</span>
                <FormattedMoneyInput 
                  className="glass-input w-full rounded-lg py-2 pl-9 pr-3 text-white font-mono"
                  value={localSettings.startingBalanceReal}
                  onChange={(v) => setLocalSettings({...localSettings, startingBalanceReal: v})}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Target Saldo Demo (IDR)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-mono">Rp</span>
                <FormattedMoneyInput 
                  className="glass-input w-full rounded-lg py-2 pl-9 pr-3 text-white font-mono"
                  value={localSettings.targetBalanceDemo}
                  onChange={(v) => setLocalSettings({...localSettings, targetBalanceDemo: v})}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Target Saldo Real (IDR)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-mono">Rp</span>
                <FormattedMoneyInput 
                  className="glass-input w-full rounded-lg py-2 pl-9 pr-3 text-white font-mono"
                  value={localSettings.targetBalanceReal}
                  onChange={(v) => setLocalSettings({...localSettings, targetBalanceReal: v})}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Maks Risiko Harian (%)</label>
              <div className="relative">
                <input 
                  type="number" step="0.1"
                  className="glass-input w-full rounded-lg py-2 pl-3 pr-8 text-white font-mono"
                  value={localSettings.maxDailyLossPercent}
                  onChange={(e) => setLocalSettings({...localSettings, maxDailyLossPercent: Number(e.target.value)})}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant font-mono">%</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
               <label className="font-display text-[10px] uppercase tracking-wider text-on-surface-variant">Stop Jika Kalah Berturut-turut</label>
               <input 
                  type="number" 
                  className="glass-input w-full rounded-lg py-2 px-3 text-white font-mono"
                  value={localSettings.stopAfterLosses}
                  onChange={(e) => setLocalSettings({...localSettings, stopAfterLosses: Number(e.target.value)})}
                />
            </div>
          </div>
        </section>

        {/* Instrument Specs */}
        <section className="glass-panel rounded-xl p-6 md:col-span-6 flex flex-col gap-6">
           <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <Sliders className="text-blue-400 w-5 h-5" />
            <h2 className="font-display text-lg text-white">Spesifikasi Instrumen</h2>
          </div>

          <div className="space-y-4">
             {/* XAU */}
             <div className="flex flex-col gap-2 group hover:bg-white/5 p-2 -mx-2 rounded-lg transition-colors border-b border-white/5 pb-4">
                <div className="flex items-center gap-3 mb-2">
                   <div className="w-8 h-8 rounded bg-surface border border-white/10 flex items-center justify-center font-mono text-yellow-500 font-bold">Au</div>
                   <span className="font-sans text-white font-medium">XAU/USD</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col">
                       <span className="font-sans text-xs text-on-surface-variant mb-1">TradingView Symbol</span>
                       <input type="text" 
                         className="glass-input rounded py-1 px-2 text-white font-mono text-sm" 
                         value={localSettings.instruments["XAU/USD"].tradingViewSymbol}
                         onChange={e => setLocalSettings(prev => ({
                           ...prev, instruments: { ...prev.instruments, "XAU/USD": { ...prev.instruments["XAU/USD"], tradingViewSymbol: e.target.value } }
                         }))}
                       />
                    </div>
                    <div className="flex flex-col">
                       <span className="font-sans text-xs text-on-surface-variant mb-1">Pip Size</span>
                       <input type="number" 
                         className="glass-input rounded py-1 px-2 text-white font-mono text-sm" 
                         value={localSettings.instruments["XAU/USD"].pipSize}
                         onChange={e => setLocalSettings(prev => ({
                           ...prev, instruments: { ...prev.instruments, "XAU/USD": { ...prev.instruments["XAU/USD"], pipSize: Number(e.target.value) } }
                         }))}
                       />
                    </div>
                     <div className="flex flex-col">
                       <span className="font-sans text-xs text-on-surface-variant mb-1">Contract Size</span>
                       <input type="number" 
                         className="glass-input rounded py-1 px-2 text-white font-mono text-sm" 
                         value={localSettings.instruments["XAU/USD"].contractSize}
                         onChange={e => setLocalSettings(prev => ({
                           ...prev, instruments: { ...prev.instruments, "XAU/USD": { ...prev.instruments["XAU/USD"], contractSize: Number(e.target.value) } }
                         }))}
                       />
                    </div>
                </div>
             </div>
             
             {/* BTC */}
             <div className="flex flex-col gap-2 group hover:bg-white/5 p-2 -mx-2 rounded-lg transition-colors border-b border-white/5 pb-4">
                <div className="flex items-center gap-3 mb-2">
                   <div className="w-8 h-8 rounded bg-surface border border-white/10 flex items-center justify-center font-mono text-orange-400 font-bold">₿</div>
                   <span className="font-sans text-white font-medium">BTC/USD</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col">
                       <span className="font-sans text-xs text-on-surface-variant mb-1">TradingView Symbol</span>
                       <input type="text" 
                         className="glass-input rounded py-1 px-2 text-white font-mono text-sm" 
                         value={localSettings.instruments["BTC/USD"].tradingViewSymbol}
                         onChange={e => setLocalSettings(prev => ({
                           ...prev, instruments: { ...prev.instruments, "BTC/USD": { ...prev.instruments["BTC/USD"], tradingViewSymbol: e.target.value } }
                         }))}
                       />
                    </div>
                    <div className="flex flex-col">
                       <span className="font-sans text-xs text-on-surface-variant mb-1">Pip Size</span>
                       <input type="number" 
                         className="glass-input rounded py-1 px-2 text-white font-mono text-sm" 
                         value={localSettings.instruments["BTC/USD"].pipSize}
                         onChange={e => setLocalSettings(prev => ({
                           ...prev, instruments: { ...prev.instruments, "BTC/USD": { ...prev.instruments["BTC/USD"], pipSize: Number(e.target.value) } }
                         }))}
                       />
                    </div>
                     <div className="flex flex-col">
                       <span className="font-sans text-xs text-on-surface-variant mb-1">Contract Size</span>
                       <input type="number" 
                         className="glass-input rounded py-1 px-2 text-white font-mono text-sm" 
                         value={localSettings.instruments["BTC/USD"].contractSize}
                         onChange={e => setLocalSettings(prev => ({
                           ...prev, instruments: { ...prev.instruments, "BTC/USD": { ...prev.instruments["BTC/USD"], contractSize: Number(e.target.value) } }
                         }))}
                       />
                    </div>
                </div>
             </div>

             {/* USD IDR */}
             <div className="flex items-center justify-between group hover:bg-white/5 p-2 -mx-2 rounded-lg transition-colors">
                <div className="flex items-center gap-3">
                   <div className="w-8 h-8 rounded bg-surface border border-white/10 flex items-center justify-center font-mono text-white font-bold">Rp</div>
                   <div className="flex flex-col">
                      <span className="font-sans text-white font-medium">USD to IDR</span>
                      <span className="font-sans text-xs text-on-surface-variant">Custom Rate</span>
                   </div>
                </div>
                <input type="number" 
                  className="glass-input w-32 rounded py-1 px-2 text-right text-white font-mono text-sm" 
                  value={localSettings.usdToIdr}
                  onChange={e => setLocalSettings(prev => ({...prev, usdToIdr: Number(e.target.value)}))}
                />
             </div>
          </div>
        </section>

        {/* Data Management */}
        <section className="glass-panel rounded-xl p-6 md:col-span-6 flex flex-col gap-6">
           <div className="flex items-center gap-2 border-b border-white/5 pb-2">
            <Database className="text-white w-5 h-5" />
            <h2 className="font-display text-lg text-white">Backup & Export Data</h2>
          </div>
          <p className="font-sans text-xs text-on-surface-variant -mt-3">Simpan cadangan jurnal trading kamu atau export ke Excel/Google Sheets.</p>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                 <button onClick={handleExportJSON} className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-white/10 hover:border-blue-400 bg-white/5 hover:bg-white/10 transition-all font-sans text-sm text-white cursor-pointer hover:shadow-lg">
                   <Download className="w-4 h-4" /> Export JSON
                 </button>
                 <span className="font-sans text-[10px] text-on-surface-variant text-center px-1">Backup lengkap semua data Lootly.</span>
              </div>
              <div className="flex flex-col gap-1">
                 <button onClick={handleExportCSV} className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-white/10 hover:border-blue-400 bg-white/5 hover:bg-white/10 transition-all font-sans text-sm text-white cursor-pointer hover:shadow-lg">
                   <Download className="w-4 h-4" /> Export CSV
                 </button>
                 <span className="font-sans text-[10px] text-on-surface-variant text-center px-1">Export riwayat trade ke Excel/Google Sheets.</span>
              </div>
            </div>
            
            <div className="w-full h-px bg-white/5 my-1" />
            
            <div className="flex flex-col gap-1">
               <button onClick={handleImport} className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg border border-white/10 hover:border-primary bg-white/5 hover:bg-white/10 transition-all font-sans text-sm text-white w-full cursor-pointer hover:shadow-lg">
                  <Upload className="w-4 h-4" /> Import Data
               </button>
               <span className="font-sans text-[10px] text-on-surface-variant text-center">Pulihkan data dari file backup JSON.</span>
            </div>

            <div className="mt-auto pt-4 border-t border-error/20 flex flex-col gap-1">
               <button 
                  onClick={() => {
                     if(window.confirm("Hapus semua data Lootly? Akses ke data sebelumnya akan hilang secara permanen.")) {
                         resetAllData();
                         alert("Semua data berhasil direset.");
                     }
                  }}
                  className="flex items-center justify-center gap-2 py-2 px-4 border border-error/30 bg-error/10 hover:bg-error/20 text-error rounded-lg transition-all font-display text-xs uppercase tracking-wider w-full cursor-pointer hover:shadow-lg"
               >
                 <Trash2 className="w-4 h-4" /> Reset Data
               </button>
               <span className="font-sans text-[10px] text-on-surface-variant text-center">Hapus semua data Lootly.</span>
            </div>
          </div>
        </section>

        {/* Save Button Banner */}
        <div className="md:col-span-12 flex justify-end mt-2">
            <button 
               onClick={handleSave}
               className="bg-primary cursor-pointer hover:bg-primary-container text-[#00391f] font-display text-xs font-bold uppercase tracking-widest py-3 px-8 rounded-lg shadow-[0_0_15px_rgba(68,224,146,0.2)] hover:shadow-[0_0_20px_rgba(68,224,146,0.4)] transition-all transform active:scale-95 flex items-center gap-2"
            >
               <Save className="w-4 h-4" /> Simpan Pengaturan
            </button>
        </div>

      </div>
    </div>
  );
}
