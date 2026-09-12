import React, { useState, useEffect } from "react";
import { useAppStore } from "../store/AppContext";
import { formatNumberWithDots, parseNumberWithDots, formatIDR } from "../lib/utils";
import { 
  Wallet, 
  Sliders, 
  Database, 
  Download, 
  Upload, 
  Trash2, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Target
} from "lucide-react";

export function Settings() {
  const { settings, updateSettings, resetAllData, importData, trades, transactions, accountMode } = useAppStore();
  const [localSettings, setLocalSettings] = useState(settings);
  const [selectedPlanAccount, setSelectedPlanAccount] = useState<"demo" | "real">(accountMode || "demo");
  const [showResetModal, setShowResetModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  // Controlled input states for discipline fields allowing free typing & erasing
  const [stopAfterLossesInput, setStopAfterLossesInput] = useState<string>(() =>
    settings.stopAfterLosses !== undefined ? String(settings.stopAfterLosses) : "2"
  );
  const [maxTradesPerDayInput, setMaxTradesPerDayInput] = useState<string>(() =>
    settings.maxTradesPerDay !== undefined ? String(settings.maxTradesPerDay) : "5"
  );

  // Keep localSettings in sync with cloud settings when they load or change
  useEffect(() => {
    setLocalSettings(settings);
    setStopAfterLossesInput(settings.stopAfterLosses !== undefined ? String(settings.stopAfterLosses) : "2");
    setMaxTradesPerDayInput(settings.maxTradesPerDay !== undefined ? String(settings.maxTradesPerDay) : "5");
  }, [settings]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Discipline input handlers
  const handleStopAfterLossesChange = (val: string) => {
    if (val === "") {
      setStopAfterLossesInput("");
      return;
    }
    const digitsOnly = val.replace(/\D/g, "");
    if (digitsOnly === "") {
      setStopAfterLossesInput("");
      return;
    }
    const parsed = parseInt(digitsOnly, 10);
    const clamped = Math.min(parsed, 20);
    setStopAfterLossesInput(String(clamped));
    setLocalSettings((prev) => ({ ...prev, stopAfterLosses: clamped }));
  };

  const handleStopAfterLossesBlur = () => {
    if (stopAfterLossesInput.trim() === "") {
      const fallback = localSettings.stopAfterLosses && localSettings.stopAfterLosses >= 1 ? localSettings.stopAfterLosses : 2;
      setStopAfterLossesInput(String(fallback));
      setLocalSettings((prev) => ({ ...prev, stopAfterLosses: fallback }));
    } else {
      const num = parseInt(stopAfterLossesInput, 10);
      const finalVal = isNaN(num) || num < 1 ? 1 : Math.min(num, 20);
      setStopAfterLossesInput(String(finalVal));
      setLocalSettings((prev) => ({ ...prev, stopAfterLosses: finalVal }));
    }
  };

  const handleMaxTradesPerDayChange = (val: string) => {
    if (val === "") {
      setMaxTradesPerDayInput("");
      return;
    }
    const digitsOnly = val.replace(/\D/g, "");
    if (digitsOnly === "") {
      setMaxTradesPerDayInput("");
      return;
    }
    const parsed = parseInt(digitsOnly, 10);
    const clamped = Math.min(parsed, 100);
    setMaxTradesPerDayInput(String(clamped));
    setLocalSettings((prev) => ({ ...prev, maxTradesPerDay: clamped }));
  };

  const handleMaxTradesPerDayBlur = () => {
    if (maxTradesPerDayInput.trim() === "") {
      const fallback = localSettings.maxTradesPerDay && localSettings.maxTradesPerDay >= 1 ? localSettings.maxTradesPerDay : 5;
      setMaxTradesPerDayInput(String(fallback));
      setLocalSettings((prev) => ({ ...prev, maxTradesPerDay: fallback }));
    } else {
      const num = parseInt(maxTradesPerDayInput, 10);
      const finalVal = isNaN(num) || num < 1 ? 1 : Math.min(num, 100);
      setMaxTradesPerDayInput(String(finalVal));
      setLocalSettings((prev) => ({ ...prev, maxTradesPerDay: finalVal }));
    }
  };

  // Current capital base for selected plan account
  const currentCapital = selectedPlanAccount === "demo"
    ? (localSettings.startingBalanceDemo || 10000000)
    : (localSettings.startingBalanceReal || 5000000);

  // Handlers for Trading Plan Harian inputs with bi-directional calculation
  const handleDailyTargetIdrChange = (nominalVal: number) => {
    const calculatedPercent = currentCapital > 0 
      ? Math.round((nominalVal / currentCapital) * 1000) / 10 
      : 0;

    if (selectedPlanAccount === "demo") {
      setLocalSettings((prev) => ({
        ...prev,
        dailyProfitTargetDemoIdr: nominalVal,
        dailyProfitTargetDemoPercent: calculatedPercent,
      }));
    } else {
      setLocalSettings((prev) => ({
        ...prev,
        dailyProfitTargetRealIdr: nominalVal,
        dailyProfitTargetRealPercent: calculatedPercent,
      }));
    }
  };

  const handleDailyTargetPercentChange = (percentVal: number) => {
    const calculatedNominal = currentCapital > 0 
      ? Math.round((currentCapital * percentVal) / 100) 
      : 0;

    if (selectedPlanAccount === "demo") {
      setLocalSettings((prev) => ({
        ...prev,
        dailyProfitTargetDemoPercent: percentVal,
        dailyProfitTargetDemoIdr: calculatedNominal,
      }));
    } else {
      setLocalSettings((prev) => ({
        ...prev,
        dailyProfitTargetRealPercent: percentVal,
        dailyProfitTargetRealIdr: calculatedNominal,
      }));
    }
  };

  const handleDailyLossIdrChange = (nominalVal: number) => {
    if (selectedPlanAccount === "demo") {
      setLocalSettings((prev) => ({
        ...prev,
        maxDailyLossIdrDemo: nominalVal,
      }));
    } else {
      setLocalSettings((prev) => ({
        ...prev,
        maxDailyLossIdrReal: nominalVal,
      }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const stopParsed = parseInt(stopAfterLossesInput, 10);
      const validatedStopLosses = isNaN(stopParsed) || stopParsed < 1 
        ? (localSettings.stopAfterLosses && localSettings.stopAfterLosses >= 1 ? localSettings.stopAfterLosses : 2)
        : Math.min(stopParsed, 20);

      const maxParsed = parseInt(maxTradesPerDayInput, 10);
      const validatedMaxTrades = isNaN(maxParsed) || maxParsed < 1 
        ? (localSettings.maxTradesPerDay && localSettings.maxTradesPerDay >= 1 ? localSettings.maxTradesPerDay : 5)
        : Math.min(maxParsed, 100);

      const payloadToSave = {
        ...localSettings,
        stopAfterLosses: validatedStopLosses,
        maxTradesPerDay: validatedMaxTrades,
      };

      setLocalSettings(payloadToSave);
      setStopAfterLossesInput(String(validatedStopLosses));
      setMaxTradesPerDayInput(String(validatedMaxTrades));

      await updateSettings(payloadToSave);
      showToast("Pengaturan berhasil disimpan & disinkronkan ke cloud.");
    } catch (err) {
      console.error("Save settings error:", err);
      showToast("Gagal menyimpan ke cloud, tersimpan di lokal.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportJSON = () => {
    const data = JSON.stringify({ settings: localSettings, trades, transactions }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lootly_backup_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("File backup JSON berhasil diunduh.");
  };

  const handleExportCSV = () => {
    if (trades.length === 0) {
      showToast("Tidak ada data trade untuk diekspor.");
      return;
    }
    const header = ["id", "asset", "direction", "date", "accountMode", "entryPrice", "exitPrice", "sl", "tp", "lot", "pnlIdr", "pnlPercent", "rrRealized", "setupType", "result"].join(",");
    const rows = trades.map((t) => [
      t.id,
      t.asset,
      t.direction,
      t.date ? t.date.split("T")[0] : "",
      t.accountMode,
      t.actualEntry || t.entryPlan || "",
      t.actualExit || "",
      t.actualSL || t.slPlan || "",
      t.actualTP || t.tp1Plan || "",
      t.lot || "",
      t.pnlIdr || 0,
      t.pnlPercent || 0,
      t.rrRealized || t.rrPlanned || "",
      `"${t.setupType || ""}"`,
      t.result || ""
    ].join(",")).join("\n");

    const blob = new Blob([header + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lootly_trades_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("File CSV jurnal berhasil diekspor.");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const success = await importData(content);
      if (success) {
        showToast("Data backup berhasil diimpor.");
      } else {
        showToast("Gagal mengimpor data: format file tidak valid.");
      }
    };
    reader.readAsText(file);
    if (importInputRef.current) importInputRef.current.value = "";
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 md:px-8 py-6 space-y-6">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 text-white text-xs px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold font-display text-zinc-900 tracking-tight">
          Pengaturan Akun & Workspace
        </h1>
        <p className="text-xs md:text-sm text-zinc-500 mt-1">
          Atur modal akun, target trading plan harian, manajemen risiko, dan kelola cadangan data.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* Block 1: Saldo & Target Akun (IDR) */}
        <div className="clean-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900 font-display flex items-center gap-2">
              <Wallet className="w-4 h-4 text-zinc-500" />
              1. Saldo & Target Akun (IDR)
            </h2>
            <span className="text-[11px] text-zinc-400 font-mono">Format: Rp X.XXX.XXX</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Saldo Awal Demo */}
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">
                Saldo Awal Akun Demo
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs">Rp</span>
                <input
                  type="text"
                  value={formatNumberWithDots(localSettings.startingBalanceDemo)}
                  onChange={(e) => {
                    const newBalance = parseNumberWithDots(e.target.value);
                    const currentTargetIdr = localSettings.dailyProfitTargetDemoIdr || 0;
                    const newPercent = newBalance > 0 ? Math.round((currentTargetIdr / newBalance) * 1000) / 10 : 0;
                    setLocalSettings({ 
                      ...localSettings, 
                      startingBalanceDemo: newBalance,
                      dailyProfitTargetDemoPercent: newPercent
                    });
                  }}
                  className="clean-input w-full pl-9 pr-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            {/* Target Saldo Demo */}
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">
                Target Saldo Akun Demo
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs">Rp</span>
                <input
                  type="text"
                  value={formatNumberWithDots(localSettings.targetBalanceDemo)}
                  onChange={(e) => setLocalSettings({ ...localSettings, targetBalanceDemo: parseNumberWithDots(e.target.value) })}
                  className="clean-input w-full pl-9 pr-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            {/* Saldo Awal Real */}
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">
                Saldo Awal Akun Real
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs">Rp</span>
                <input
                  type="text"
                  value={formatNumberWithDots(localSettings.startingBalanceReal)}
                  onChange={(e) => {
                    const newBalance = parseNumberWithDots(e.target.value);
                    const currentTargetIdr = localSettings.dailyProfitTargetRealIdr || 0;
                    const newPercent = newBalance > 0 ? Math.round((currentTargetIdr / newBalance) * 1000) / 10 : 0;
                    setLocalSettings({ 
                      ...localSettings, 
                      startingBalanceReal: newBalance,
                      dailyProfitTargetRealPercent: newPercent
                    });
                  }}
                  className="clean-input w-full pl-9 pr-3 py-2 font-mono text-xs"
                />
              </div>
            </div>

            {/* Target Saldo Real */}
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">
                Target Saldo Akun Real
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs">Rp</span>
                <input
                  type="text"
                  value={formatNumberWithDots(localSettings.targetBalanceReal)}
                  onChange={(e) => setLocalSettings({ ...localSettings, targetBalanceReal: parseNumberWithDots(e.target.value) })}
                  className="clean-input w-full pl-9 pr-3 py-2 font-mono text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Block 2: Trading Plan Harian */}
        <div className="clean-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 font-display flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-600" />
                2. Trading Plan Harian
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Target profit yang ingin dicapai setiap hari. Nilai IDR dan persentase (%) saling terhubung dengan modal akun.
              </p>
            </div>

            {/* Account Switcher for Plan */}
            <div className="bg-zinc-100 p-1 rounded-xl flex items-center border border-zinc-200/80 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setSelectedPlanAccount("demo")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                  selectedPlanAccount === "demo"
                    ? "bg-white text-blue-700 shadow-xs border border-zinc-200/60 font-bold"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Akun Demo
              </button>
              <button
                type="button"
                onClick={() => setSelectedPlanAccount("real")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                  selectedPlanAccount === "real"
                    ? "bg-zinc-900 text-white shadow-xs font-bold"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Akun Real
              </button>
            </div>
          </div>

          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex items-center justify-between text-xs">
            <span className="text-zinc-500">
              Basis Modal ({selectedPlanAccount === "demo" ? "Akun Demo" : "Akun Real"}):
            </span>
            <span className="font-mono font-bold text-zinc-900">
              {formatIDR(currentCapital)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Target Profit Harian (IDR) */}
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">
                Target Profit Harian (IDR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs">Rp</span>
                <input
                  type="text"
                  value={formatNumberWithDots(
                    selectedPlanAccount === "demo"
                      ? (localSettings.dailyProfitTargetDemoIdr ?? 500000)
                      : (localSettings.dailyProfitTargetRealIdr ?? 250000)
                  )}
                  onChange={(e) => handleDailyTargetIdrChange(parseNumberWithDots(e.target.value))}
                  className="clean-input w-full pl-9 pr-3 py-2 font-mono text-xs font-semibold text-zinc-900"
                />
              </div>
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Target nominal keuntungan per hari
              </span>
            </div>

            {/* Target Profit Harian (%) */}
            <div>
              <label className="font-semibold text-zinc-700 block mb-1">
                Target Profit Harian (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={
                    selectedPlanAccount === "demo"
                      ? (localSettings.dailyProfitTargetDemoPercent ?? 5.0)
                      : (localSettings.dailyProfitTargetRealPercent ?? 5.0)
                  }
                  onChange={(e) => handleDailyTargetPercentChange(parseFloat(e.target.value) || 0)}
                  className="clean-input w-full pl-3 pr-8 py-2 font-mono text-xs font-semibold text-zinc-900"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs font-bold">%</span>
              </div>
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Persentase target terhadap modal akun ({formatIDR(currentCapital)})
              </span>
            </div>
          </div>
        </div>

        {/* Block 3: Manajemen Batas Risiko & Disiplin */}
        <div className="clean-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 font-display flex items-center gap-2">
                <Sliders className="w-4 h-4 text-rose-600" />
                3. Manajemen Batas Kerugian Harian & Disiplin
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Konfigurasi batas kerugian harian nominal (IDR) untuk akun {selectedPlanAccount.toUpperCase()}.
              </p>
            </div>
            <span className="text-[11px] font-mono font-medium px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60 self-start sm:self-auto">
              Batas Maksimal: {formatIDR(selectedPlanAccount === "demo" ? (localSettings.maxDailyLossIdrDemo ?? 200000) : (localSettings.maxDailyLossIdrReal ?? 100000))}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Batas Kerugian Harian (IDR) */}
            <div className="sm:col-span-1">
              <label className="font-semibold text-zinc-700 block mb-1">
                Batas Kerugian Harian (IDR)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs">Rp</span>
                <input
                  type="text"
                  value={formatNumberWithDots(
                    selectedPlanAccount === "demo"
                      ? (localSettings.maxDailyLossIdrDemo ?? 200000)
                      : (localSettings.maxDailyLossIdrReal ?? 100000)
                  )}
                  onChange={(e) => handleDailyLossIdrChange(parseNumberWithDots(e.target.value))}
                  className="clean-input w-full pl-9 pr-3 py-2 font-mono text-xs font-semibold text-rose-600"
                />
              </div>
              <span className="text-[10px] text-zinc-500 mt-1 block">
                {(() => {
                  const lossVal = selectedPlanAccount === "demo" 
                    ? (localSettings.maxDailyLossIdrDemo ?? 200000)
                    : (localSettings.maxDailyLossIdrReal ?? 100000);
                  const pct = currentCapital > 0 ? ((lossVal / currentCapital) * 100).toFixed(1) : "0";
                  return `Setara dengan ${pct}% dari modal (${formatIDR(currentCapital)})`;
                })()}
              </span>
            </div>

            {/* Stop Jika Loss Beruntun */}
            <div>
              <label htmlFor="settings-stop-after-losses" className="font-semibold text-zinc-700 block mb-1">
                Stop Jika Loss Beruntun
              </label>
              <input
                id="settings-stop-after-losses"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={stopAfterLossesInput}
                onChange={(e) => handleStopAfterLossesChange(e.target.value)}
                onBlur={handleStopAfterLossesBlur}
                placeholder="2"
                className="clean-input w-full px-3 py-2 font-mono text-xs"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Peringatan disiplin jika berturut-turut loss (min 1, maks 20)
              </span>
            </div>

            {/* Max Trades Per Day */}
            <div>
              <label htmlFor="settings-max-trades-per-day" className="font-semibold text-zinc-700 block mb-1">
                Maksimum Trade per Hari
              </label>
              <input
                id="settings-max-trades-per-day"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={maxTradesPerDayInput}
                onChange={(e) => handleMaxTradesPerDayChange(e.target.value)}
                onBlur={handleMaxTradesPerDayBlur}
                placeholder="5"
                className="clean-input w-full px-3 py-2 font-mono text-xs"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block">
                Mencegah overtrading harian (min 1, maks 100)
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="clean-button-primary px-5 py-2 text-xs flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? "Menyimpan..." : "Simpan Pengaturan"}</span>
            </button>
          </div>
        </div>

      </form>

      {/* Block 4: Manajemen Data & Backup */}
      <div className="clean-card p-5 space-y-4">
        <h2 className="text-sm font-bold text-zinc-900 font-display flex items-center gap-2">
          <Database className="w-4 h-4 text-zinc-500" />
          4. Manajemen Data & Backup
        </h2>
        <p className="text-xs text-zinc-500">
          Kelola cadangan data jurnal trading Anda. Ekspor secara berkala untuk menjaga riwayat trading Anda tetap aman.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleExportJSON}
            className="clean-button-secondary px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor Backup JSON</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="clean-button-secondary px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Ekspor CSV</span>
          </button>

          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="clean-button-secondary px-4 py-2 text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Impor Backup JSON</span>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="px-4 py-2 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-medium flex items-center gap-1.5 ml-auto transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset Semua Data</span>
          </button>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-zinc-200 rounded-2xl w-full max-w-md shadow-2xl p-6 relative">
            <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-3">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 font-display">
              Hapus Seluruh Data Lootly?
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Semua trade, transaksi, dan pengaturan akan dihapus dan dikembalikan ke awal.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="clean-button-secondary px-4 py-2 text-xs cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  await resetAllData();
                  setShowResetModal(false);
                  showToast("Semua data telah direset.");
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium px-4 py-2 rounded-xl text-xs shadow-xs cursor-pointer transition-all"
              >
                Ya, Reset Semuanya
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
