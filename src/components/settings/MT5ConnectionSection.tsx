import React, { useState, useEffect } from "react";
import { useAppStore } from "../../store/AppContext";
import {
  Server,
  Zap,
  Key,
  Copy,
  Check,
  Download,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Shield,
  Smartphone,
  Laptop,
  CheckCircle2,
  Clock,
  Activity,
} from "lucide-react";
import type { MT5ConnectorInfo } from "../../types";

export function MT5ConnectionSection() {
  const { user } = useAppStore();
  const [connectors, setConnectors] = useState<MT5ConnectorInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [connectorName, setConnectorName] = useState("Valetax MT5 VPS");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Fetch user's MT5 connectors
  const fetchConnectors = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/mt5/connectors", {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.connectors)) {
        setConnectors(data.connectors);
      }
    } catch (err) {
      console.warn("[MT5 UI] Error fetching connectors:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConnectors();
    // Auto-refresh connector status every 30 seconds
    const interval = setInterval(fetchConnectors, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // Handle Token Generation
  const handleCreateConnector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast("Silakan login terlebih dahulu untuk membuat konektor MT5.");
      return;
    }

    setIsCreating(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/mt5/connectors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ name: connectorName }),
      });

      const data = await res.json();
      if (data.success && data.rawToken) {
        setGeneratedToken(data.rawToken);
        setConnectors((prev) => [data.connector, ...prev]);
        showToast("Token konektor berhasil dibuat!");
      } else {
        showToast(data.error || "Gagal membuat token konektor.");
      }
    } catch (err: any) {
      showToast(err?.message || "Terjadi kesalahan saat membuat token.");
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Copy Token
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  // Handle Revoke Connector
  const handleRevoke = async (connectorId: string) => {
    if (!user) return;
    if (!window.confirm("Apakah Anda yakin ingin mencabut akses konektor ini? EA di VPS Anda tidak akan dapat mengirim data lagi.")) {
      return;
    }

    setRevokingId(connectorId);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/mt5/connectors?id=${encodeURIComponent(connectorId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const data = await res.json();
      if (data.success) {
        setConnectors((prev) =>
          prev.map((c) => (c.id === connectorId ? { ...c, status: "revoked", revoked: true } : c))
        );
        showToast("Konektor berhasil dicabut.");
      } else {
        showToast(data.error || "Gagal mencabut konektor.");
      }
    } catch (err: any) {
      showToast(err?.message || "Terjadi kesalahan.");
    } finally {
      setRevokingId(null);
    }
  };

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return "Belum pernah sinkron";
    const date = new Date(isoString);
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 60) return "Baru saja (< 1 menit lalu)";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} menit lalu`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} jam lalu`;
    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="clean-card p-5 space-y-5 border border-zinc-200">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 text-white text-xs px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
              <Server className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-zinc-900 font-display">
              Koneksi MetaTrader 5 (Valetax & Windows VPS)
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-zinc-100 text-zinc-700 rounded-full border border-zinc-200">
              Read-Only
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 max-w-2xl leading-relaxed">
            Trading tetap dari HP (iPhone/Android). Terminal MT5 Desktop di Windows VPS Anda akan secara otomatis
            menyinkronkan posisi buka, modifikasi SL/TP, dan deal yang ditutup ke jurnal Lootly.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchConnectors}
            disabled={isLoading}
            className="p-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
            title="Refresh Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              setConnectorName("Valetax MT5 VPS");
              setGeneratedToken(null);
              setShowCreateModal(true);
            }}
            className="clean-btn-primary px-3.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Buat Token Konektor</span>
          </button>
        </div>
      </div>

      {/* Architecture Visual Explainer */}
      <div className="bg-zinc-50/80 rounded-xl p-3.5 border border-zinc-200/80 text-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-white border border-zinc-200 text-zinc-700">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-zinc-800">1. HP Anda (iPhone/Android)</div>
            <div className="text-[11px] text-zinc-500">Eksekusi order di Valetax MT5</div>
          </div>
        </div>

        <div className="hidden md:block text-zinc-300 font-bold">→</div>

        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-white border border-zinc-200 text-zinc-700">
            <Laptop className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-zinc-800">2. Windows VPS (MT5 Desktop)</div>
            <div className="text-[11px] text-zinc-500">Menjalankan Lootly_MT5_Connector.mq5</div>
          </div>
        </div>

        <div className="hidden md:block text-zinc-300 font-bold">→</div>

        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-zinc-800">3. Lootly Cloud (Jurnal Otomatis)</div>
            <div className="text-[11px] text-zinc-500">Dashboard, Win Rate & Kurva Ekuitas</div>
          </div>
        </div>
      </div>

      {/* Connectors List */}
      <div className="space-y-3">
        {connectors.length === 0 ? (
          <div className="text-center py-8 px-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50">
            <Server className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
            <h3 className="text-xs font-bold text-zinc-700">Belum Ada Konektor MT5 Terpasang</h3>
            <p className="text-[11px] text-zinc-500 max-w-md mx-auto mt-1 mb-4">
              Buat token konektor, unduh file EA, lalu pasang di MetaTrader 5 desktop pada Windows VPS Anda untuk memulai sinkronisasi real-time.
            </p>
            <div className="flex items-center justify-center gap-2">
              <a
                href="/Lootly_MT5_Connector.mq5"
                download="Lootly_MT5_Connector.mq5"
                className="clean-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh EA (.mq5)</span>
              </a>
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="clean-btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>Lihat Panduan Setup</span>
                {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {connectors.map((connector) => {
              const isConnected = connector.status === "connected";
              const isRevoked = connector.status === "revoked" || connector.revoked;

              return (
                <div
                  key={connector.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isRevoked
                      ? "bg-zinc-50/50 border-zinc-200 opacity-60"
                      : isConnected
                      ? "bg-white border-emerald-200 shadow-xs"
                      : "bg-white border-zinc-200"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-100">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-2.5 h-2.5 rounded-full ${
                          isRevoked
                            ? "bg-rose-400"
                            : isConnected
                            ? "bg-emerald-500 animate-pulse"
                            : "bg-amber-400"
                        }`}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-zinc-900">{connector.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                              isRevoked
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : isConnected
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {isRevoked ? "Dicabut" : isConnected ? "Terhubung • Aktif" : "Terputus • Offline"}
                          </span>
                          {connector.accountMode && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                connector.accountMode === "real"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {connector.accountMode}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-zinc-400 font-mono">
                          ID: {connector.tokenPrefix}
                        </span>
                      </div>
                    </div>

                    {!isRevoked && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(connector.id)}
                        disabled={revokingId === connector.id}
                        className="px-2.5 py-1 text-xs text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors self-start sm:self-auto cursor-pointer"
                        title="Cabut Akses Konektor"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                        <span>Cabut</span>
                      </button>
                    )}
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-xs">
                    <div>
                      <span className="text-zinc-400 block text-[11px]">Broker & Server</span>
                      <span className="font-semibold text-zinc-800">
                        {connector.broker || "Valetax"}
                      </span>
                      <span className="block text-[10px] text-zinc-400 truncate">
                        {connector.server || "Valetax-Live"}
                      </span>
                    </div>

                    <div>
                      <span className="text-zinc-400 block text-[11px]">Nomor Akun MT5</span>
                      <span className="font-semibold text-zinc-800 font-mono">
                        {connector.accountNumber || "—"}
                      </span>
                    </div>

                    <div>
                      <span className="text-zinc-400 block text-[11px]">Saldo & Ekuitas</span>
                      <span className="font-semibold text-zinc-800 font-mono">
                        {connector.balance !== undefined
                          ? `$${connector.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                          : "—"}
                      </span>
                      {connector.openPositionsCount !== undefined && (
                        <span className="block text-[10px] text-zinc-500">
                          {connector.openPositionsCount} posisi aktif
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-zinc-400 block text-[11px]">Terakhir Sinkron</span>
                      <span className="font-semibold text-zinc-700 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-zinc-400" />
                        {formatRelativeTime(connector.lastSyncAt)}
                      </span>
                    </div>
                  </div>

                  {!isConnected && !isRevoked && (
                    <div className="mt-3 p-2 rounded-lg bg-amber-50/70 border border-amber-200/60 text-[11px] text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>
                        Terminal MT5 di Windows VPS belum mengirim heartbeat dalam 2 menit terakhir. Pastikan aplikasi MT5 tetap terbuka dan tombol Algo Trading aktif.
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Action Footer: Download EA & Open Guide */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <a
            href="/Lootly_MT5_Connector.mq5"
            download="Lootly_MT5_Connector.mq5"
            className="clean-btn-secondary px-3.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer font-medium"
          >
            <Download className="w-3.5 h-3.5 text-zinc-600" />
            <span>Unduh EA (Lootly_MT5_Connector.mq5)</span>
          </a>
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="clean-btn-secondary px-3.5 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer text-zinc-700"
          >
            <span>{showGuide ? "Tutup Panduan" : "Buka Panduan Setup VPS"}</span>
            {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        <span className="text-[11px] text-zinc-400 flex items-center gap-1">
          <Shield className="w-3 h-3 text-emerald-500" />
          Koneksi terenkripsi HTTPS & SHA-256
        </span>
      </div>

      {/* Expandable Indonesian Step-by-Step Guide */}
      {showGuide && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-4 text-xs animate-in fade-in">
          <div className="font-bold text-zinc-900 text-sm flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-emerald-600" />
            <span>Panduan Cepat Pemasangan di Windows VPS (Valetax MT5)</span>
          </div>

          <div className="space-y-3 text-zinc-600 leading-relaxed">
            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0 text-[11px]">
                1
              </span>
              <div>
                <strong className="text-zinc-800">Pasang MT5 Desktop di Windows VPS:</strong> Login ke akun Valetax Anda di MT5 desktop yang berjalan di VPS.
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0 text-[11px]">
                2
              </span>
              <div>
                <strong className="text-zinc-800">Salin File EA:</strong> Unduh <code className="bg-zinc-200 px-1 py-0.5 rounded text-zinc-800">Lootly_MT5_Connector.mq5</code>, buka MT5 di VPS, klik menu <em>File &gt; Open Data Folder</em>, lalu salin file ke dalam folder <code className="bg-zinc-200 px-1 py-0.5 rounded text-zinc-800">MQL5\Experts</code>.
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0 text-[11px]">
                3
              </span>
              <div>
                <strong className="text-zinc-800">Kompilasi di MetaEditor:</strong> Tekan <kbd className="px-1.5 py-0.5 bg-zinc-200 rounded font-mono">F4</kbd> di MT5 untuk membuka MetaEditor, buka file EA, lalu tekan <kbd className="px-1.5 py-0.5 bg-zinc-200 rounded font-mono">F7</kbd> untuk Compile. Pastikan hasil <em>0 errors</em>.
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0 text-[11px]">
                4
              </span>
              <div>
                <strong className="text-zinc-800">Izinkan WebRequest HTTPS:</strong> Di MT5, klik <em>Tools &gt; Options &gt; Expert Advisors</em>. Centang <em>Allow Algo Trading</em> dan <em>Allow WebRequest for listed URL</em>. Tambahkan URL:
                <div className="mt-1 font-mono text-[11px] bg-white p-2 rounded border border-zinc-200 text-zinc-800 select-all">
                  https://lootly-mu.vercel.app
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center shrink-0 text-[11px]">
                5
              </span>
              <div>
                <strong className="text-zinc-800">Tempelkan Token & Pasang ke Chart:</strong> Tarik EA dari panel Navigator ke sembarang chart (misal XAUUSD). Pada tab <em>Inputs</em>, tempelkan token rahasia yang Anda buat di atas ke kolom <code className="bg-zinc-200 px-1 py-0.5 rounded text-zinc-800">InpConnectorToken</code>. Klik OK.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Connector & Reveal Token */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 border border-zinc-200 animate-in zoom-in-95">
            {!generatedToken ? (
              <form onSubmit={handleCreateConnector} className="space-y-4">
                <div className="flex items-center gap-2 text-zinc-900 font-bold font-display text-sm">
                  <Key className="w-4 h-4 text-emerald-600" />
                  <span>Buat Token Konektor MT5 Baru</span>
                </div>
                <p className="text-xs text-zinc-500">
                  Beri label identitas untuk konektor MT5 ini (misal nama broker atau nama VPS).
                </p>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Nama Label Konektor
                  </label>
                  <input
                    type="text"
                    value={connectorName}
                    onChange={(e) => setConnectorName(e.target.value)}
                    required
                    className="clean-input w-full text-xs py-2 px-3"
                    placeholder="Valetax MT5 VPS"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="clean-btn-secondary px-3.5 py-1.5 text-xs cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="clean-btn-primary px-4 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    {isCreating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                    <span>{isCreating ? "Membuat..." : "Buat Token"}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-700 font-bold font-display text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>Token Konektor Berhasil Dibuat!</span>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block mb-0.5">Penting: Salin Token Sekarang!</strong>
                    Demi keamanan akun Anda, token rahasia ini <strong>hanya ditampilkan satu kali</strong> dan tidak dapat dilihat lagi setelah Anda menutup jendela ini.
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Token Rahasia (InpConnectorToken)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={generatedToken}
                      className="clean-input w-full pr-12 font-mono text-xs py-2.5 px-3 bg-zinc-50 border-emerald-300 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(generatedToken)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-zinc-900 bg-white rounded-lg border border-zinc-200 transition-colors cursor-pointer"
                      title="Salin Token"
                    >
                      {copiedToken ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-zinc-500 bg-zinc-50 p-3 rounded-lg border border-zinc-200 space-y-1">
                  <div className="font-semibold text-zinc-700">Langkah berikutnya:</div>
                  <div>1. Salin token di atas.</div>
                  <div>2. Di terminal MT5 desktop pada VPS Anda, buka input EA <code className="text-zinc-800 font-mono">InpConnectorToken</code>.</div>
                  <div>3. Tempelkan token ini dan klik OK. Terminal MT5 akan langsung terhubung.</div>
                </div>

                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setGeneratedToken(null);
                      fetchConnectors();
                    }}
                    className="clean-btn-primary px-4 py-2 text-xs cursor-pointer"
                  >
                    Saya Sudah Menyalin Token
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
