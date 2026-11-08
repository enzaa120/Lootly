import { useState } from "react";
import { usePWAInstall } from "../../hooks/usePWAInstall";
import { Download, Smartphone, Monitor, CheckCircle2, X, Share, PlusSquare } from "lucide-react";
import { cn } from "../../lib/utils";

interface PWAInstallButtonProps {
  variant?: "sidebar" | "header" | "floating" | "banner";
  className?: string;
}

export function PWAInstallButton({ variant = "sidebar", className }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isMobileOrTablet, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [installing, setInstalling] = useState(false);

  // If already running inside standalone app, show clean subtle status or nothing
  if (isInstalled) {
    if (variant === "sidebar") {
      return (
        <div className={cn("px-3 py-2 rounded-xl bg-emerald-50/80 border border-emerald-200/60 flex items-center gap-2 text-xs text-emerald-800", className)}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="font-semibold text-[11px] truncate">Aplikasi Terpasang (Offline Siap)</span>
        </div>
      );
    }
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSModal(true);
      return;
    }

    if (isInstallable) {
      setInstalling(true);
      try {
        await install();
      } finally {
        setInstalling(false);
      }
    } else {
      // In case beforeinstallprompt hasn't fired or on desktop browser, show guidance modal
      setShowIOSModal(true);
    }
  };

  return (
    <>
      {variant === "header" && (
        <button
          onClick={handleInstallClick}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-xs cursor-pointer",
            className
          )}
          title="Pasang Lootly di HP atau Komputer"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Pasang App</span>
          <span className="sm:hidden">App</span>
        </button>
      )}

      {variant === "sidebar" && (
        <div className={cn("p-3 rounded-xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-white shadow-sm border border-zinc-700/50", className)}>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Download className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold font-display tracking-tight text-white">Pasang Aplikasi</span>
          </div>
          <p className="text-[11px] text-zinc-300 mb-2.5 leading-snug">
            {isMobileOrTablet ? "Gunakan di HP Android / iPhone layaknya aplikasi asli." : "Pasang di Windows / Mac / Tablet untuk akses instan tanpa browser."}
          </p>
          <button
            onClick={handleInstallClick}
            disabled={installing}
            className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-zinc-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            {isIOS ? (
              <>
                <Smartphone className="w-3.5 h-3.5" />
                <span>Pasang di iPhone / iPad</span>
              </>
            ) : isMobileOrTablet ? (
              <>
                <Smartphone className="w-3.5 h-3.5" />
                <span>{installing ? "Memasang..." : "Pasang di Android"}</span>
              </>
            ) : (
              <>
                <Monitor className="w-3.5 h-3.5" />
                <span>{installing ? "Memasang..." : "Pasang di PC Desktop"}</span>
              </>
            )}
          </button>
        </div>
      )}

      {variant === "banner" && (
        <div className={cn("flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200/80 text-emerald-950", className)}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">Pasang Lootly di Perangkat Anda</p>
              <p className="text-[11px] text-emerald-800 truncate">Akses cepat, responsif, dan siap offline di Android, iPhone, & PC.</p>
            </div>
          </div>
          <button
            onClick={handleInstallClick}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 transition-colors cursor-pointer"
          >
            Pasang
          </button>
        </div>
      )}

      {/* iOS & Manual Installation Guidance Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-zinc-200 relative text-zinc-900">
            <button
              onClick={() => setShowIOSModal(false)}
              className="absolute top-3.5 right-3.5 p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                L
              </div>
              <div>
                <h3 className="font-bold text-sm text-zinc-900 font-display">
                  {isIOS ? "Pasang di iPhone / iPad" : "Panduan Pasang Aplikasi"}
                </h3>
                <p className="text-[11px] text-zinc-500">PWA Mandiri tanpa App Store</p>
              </div>
            </div>

            {isIOS ? (
              <div className="space-y-3 my-4 text-xs text-zinc-600">
                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-50 border border-zinc-100">
                  <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 font-bold">
                    1
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-800">Buka di Safari</span>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Pastikan Anda membuka website ini melalui browser Safari bawaan iPhone/iPad.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-50 border border-zinc-100">
                  <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <Share className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-800">Ketuk Tombol Share (Bagikan)</span>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Ketuk ikon kotak berpanah ke atas di bilah menu bawah Safari.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-2.5 rounded-xl bg-zinc-50 border border-zinc-100">
                  <div className="w-6 h-6 rounded-md bg-zinc-200 text-zinc-800 flex items-center justify-center shrink-0">
                    <PlusSquare className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-800">Pilih "Add to Home Screen"</span>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Gulir daftar opsi dan pilih "Tambah ke Layar Utama", lalu ketuk "Tambah".
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5 my-4 text-xs text-zinc-600">
                <p className="leading-relaxed">
                  Untuk memasang Lootly di Chrome / Edge (Desktop atau Android):
                </p>
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1.5 font-sans">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Klik ikon <strong>Instal (Download)</strong> di bilah alamat browser atas.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Atau buka menu browser (titik 3 ⋮) &gt; pilih <strong>"Pasang / Install Lootly"</strong>.</span>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowIOSModal(false)}
              className="w-full py-2.5 rounded-xl bg-zinc-900 text-white font-semibold text-xs hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Mengerti & Tutup
            </button>
          </div>
        </div>
      )}
    </>
  );
}
