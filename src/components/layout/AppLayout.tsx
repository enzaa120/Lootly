import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { 
  LayoutDashboard, 
  PlusCircle, 
  BookOpen, 
  BarChart2, 
  Settings, 
  Menu,
  Wallet,
  LogOut,
  LogIn,
  X,
  User as UserIcon,
  ShieldCheck,
  Cpu
} from "lucide-react";
import { useAppStore } from "../../store/AppContext";
import { useState, useEffect } from "react";
import { LootlyLogo } from "../ui/LootlyLogo";

export function AppLayout() {
  const { 
    accountMode, 
    setAccountMode, 
    user, 
    userProfile, 
    loginWithGoogle, 
    loginAsGuest, 
    logout 
  } = useAppStore();

  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const navItems = [
    { name: "Beranda", path: "/", icon: LayoutDashboard },
    { name: "Journal", path: "/journal", icon: BookOpen },
    { name: "Tambah Trade", path: "/add", icon: PlusCircle, highlight: true },
    { name: "Meja Trading AI", path: "/ai-desk", icon: Cpu },
    { name: "Analitik", path: "/analytics", icon: BarChart2 },
    { name: "Pengaturan", path: "/settings", icon: Settings },
  ];

  const bottomNavItems = [
    { name: "Beranda", path: "/", icon: LayoutDashboard },
    { name: "Journal", path: "/journal", icon: BookOpen },
    { name: "Tambah", path: "/add", icon: PlusCircle, highlight: true },
    { name: "Meja AI", path: "/ai-desk", icon: Cpu },
    { name: "Analitik", path: "/analytics", icon: BarChart2 },
    { name: "Pengaturan", path: "/settings", icon: Settings },
  ];

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await loginWithGoogle();
      setAuthModalOpen(false);
    } catch (err: any) {
      setAuthError(err?.message || "Gagal masuk dengan Google");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await loginAsGuest();
      setAuthModalOpen(false);
    } catch (err: any) {
      setAuthError(err?.message || "Gagal masuk mode tamu");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-zinc-900 flex flex-col md:flex-row antialiased selection:bg-zinc-900 selection:text-white">
      
      {/* Mobile Top Bar */}
      <header className="md:hidden fixed top-0 w-full z-40 flex justify-between items-center px-4 h-16 bg-white/95 backdrop-blur-md border-b border-zinc-200/80 shadow-xs">
        <button 
          id="btn-mobile-menu"
          onClick={() => setMobileDrawerOpen(true)}
          className="text-zinc-700 hover:bg-zinc-100 transition-colors p-2 rounded-xl cursor-pointer"
          aria-label="Menu Navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>
        
        <div 
          className="cursor-pointer select-none" 
          onClick={() => navigate("/")} 
          role="button"
        >
          <LootlyLogo variant="full" size="sm" showSubtitle={false} />
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <button
              onClick={() => navigate("/settings")}
              className="w-9 h-9 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center overflow-hidden cursor-pointer shadow-2xs"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-4 h-4 text-zinc-600" />
              )}
            </button>
          ) : (
            <button 
              id="btn-mobile-login"
              onClick={() => setAuthModalOpen(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Masuk
            </button>
          )}
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-zinc-900/40 backdrop-blur-xs z-50 transition-opacity"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <nav 
        className={cn(
          "md:hidden fixed top-0 left-0 h-full w-72 bg-white border-r border-zinc-200 shadow-2xl z-50 flex flex-col pt-6 px-4 transition-transform duration-300 ease-in-out",
          mobileDrawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between mb-6 px-1">
          <div className="cursor-pointer" onClick={() => { navigate("/"); setMobileDrawerOpen(false); }}>
            <LootlyLogo variant="full" size="sm" showSubtitle={true} />
          </div>
          <button 
            onClick={() => setMobileDrawerOpen(false)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Account Mode Segmented Control (Mobile Drawer) */}
        <div className="mb-5 p-1 rounded-xl bg-zinc-100 border border-zinc-200/80 grid grid-cols-2 gap-1 select-none">
          <button
            type="button"
            onClick={() => { setAccountMode("demo"); setMobileDrawerOpen(false); }}
            className={cn(
              "py-2 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
              accountMode === "demo"
                ? "bg-white text-blue-700 shadow-2xs border border-zinc-200/60"
                : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", accountMode === "demo" ? "bg-blue-500" : "bg-zinc-300")} />
            <span>Demo</span>
          </button>
          <button
            type="button"
            onClick={() => { setAccountMode("real"); setMobileDrawerOpen(false); }}
            className={cn(
              "py-2 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
              accountMode === "real"
                ? "bg-white text-emerald-700 shadow-2xs border border-zinc-200/60"
                : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            <span className={cn("w-2 h-2 rounded-full", accountMode === "real" ? "bg-emerald-500" : "bg-zinc-300")} />
            <span>Real</span>
          </button>
        </div>

        {/* Navigation list */}
        <ul className="flex flex-col gap-1 overflow-y-auto pb-4 flex-1">
          {navItems.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.path}
                onClick={() => setMobileDrawerOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-zinc-900 text-white shadow-xs"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                    item.highlight && !isActive && "text-emerald-700 font-semibold bg-emerald-50/70 border border-emerald-200/60"
                  )
                }
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        {/* User Profile / Auth Footer (Mobile Drawer) */}
        <div className="pt-4 border-t border-zinc-200/80 mb-6">
          {user ? (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/80">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center shrink-0 overflow-hidden border border-zinc-300/60">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-4 h-4 text-zinc-600" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-zinc-900 truncate">
                      {userProfile?.displayName || "Trader"}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Terhubung" />
                  </div>
                  <span className="text-[11px] text-zinc-400 truncate">
                    {user.email}
                  </span>
                </div>
              </div>
              <button
                onClick={() => logout()}
                className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setAuthModalOpen(true); setMobileDrawerOpen(false); }}
              className="w-full py-2.5 px-3 rounded-xl bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              <LogIn className="w-4 h-4" /> Masuk Akun
            </button>
          )}
        </div>
      </nav>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col p-5 bg-white border-r border-zinc-200/80 h-screen w-72 fixed z-40 left-0 top-0 overflow-y-auto">
        {/* Brand Header */}
        <div className="mb-6 px-1 pt-1">
          <div 
            className="cursor-pointer select-none group inline-block" 
            onClick={() => navigate("/")} 
            role="button"
          >
            <LootlyLogo variant="full" size="md" showSubtitle={true} />
          </div>
          
          {/* Account Mode Segmented Control (Desktop Sidebar) */}
          <div className="mt-5 p-1 rounded-xl bg-zinc-100/90 border border-zinc-200/80 grid grid-cols-2 gap-1 select-none">
            <button
              type="button"
              onClick={() => setAccountMode("demo")}
              className={cn(
                "py-2 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                accountMode === "demo"
                  ? "bg-white text-blue-700 shadow-2xs border border-zinc-200/60"
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full", accountMode === "demo" ? "bg-blue-500" : "bg-zinc-300")} />
              <span>Demo</span>
            </button>
            <button
              type="button"
              onClick={() => setAccountMode("real")}
              className={cn(
                "py-2 px-2.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                accountMode === "real"
                  ? "bg-white text-emerald-700 shadow-2xs border border-zinc-200/60"
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full", accountMode === "real" ? "bg-emerald-500" : "bg-zinc-300")} />
              <span>Real</span>
            </button>
          </div>
        </div>

        {/* Navigation items */}
        <ul className="flex flex-col gap-1.5 flex-1">
          {navItems.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer",
                    isActive
                      ? "bg-zinc-900 text-white shadow-xs"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                    item.highlight && !isActive && "text-emerald-700 font-semibold bg-emerald-50/80 border border-emerald-200/60 hover:bg-emerald-100/60"
                  )
                }
              >
                <item.icon className={cn("w-4 h-4 shrink-0", item.highlight && "text-emerald-600")} />
                <span>{item.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        {/* User Account Footer (Desktop Sidebar) - Cleaned of "Cloud Firestore" label */}
        <div className="pt-4 border-t border-zinc-200/80 mt-auto">
          {user ? (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 border border-zinc-200">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center shrink-0 overflow-hidden border border-zinc-300/60">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <UserIcon className="w-4 h-4 text-zinc-600" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-zinc-900 truncate">
                      {userProfile?.displayName || "Trader"}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" title="Terhubung" />
                  </div>
                  <span className="text-[11px] text-zinc-400 truncate">
                    {user.email}
                  </span>
                </div>
              </div>
              <button
                id="btn-logout-sidebar"
                onClick={() => logout()}
                className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                title="Keluar"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200">
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-semibold text-zinc-800">Sinkronisasi Jurnal</span>
              </div>
              <p className="text-[11px] text-zinc-500 mb-3 leading-relaxed">
                Sinkronkan jurnal Anda agar aman dan dapat diakses dari perangkat mana pun.
              </p>
              <button
                id="btn-login-sidebar"
                onClick={() => setAuthModalOpen(true)}
                className="w-full py-2 px-3 rounded-lg bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <LogIn className="w-3.5 h-3.5" /> Masuk Akun
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 w-full min-w-0 md:ml-72 pt-20 pb-24 md:pt-6 md:pb-12 min-h-screen px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav 
        className="md:hidden fixed bottom-0 left-0 w-full z-40 flex justify-around items-center py-2 px-1 bg-white/95 backdrop-blur-md border-t border-zinc-200 shadow-lg"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)' }}
      >
        {bottomNavItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center transition-all active:scale-95 duration-150 p-1 cursor-pointer flex-1 min-w-0 max-w-[72px]",
                isActive ? "text-zinc-900 font-semibold" : "text-zinc-400 hover:text-zinc-700",
                item.highlight && "bg-zinc-900 text-white rounded-xl py-2 shadow-md -mt-5 border border-zinc-800 text-center"
              )
            }
          >
            <item.icon className={cn("w-5 h-5 mb-1", item.highlight && "text-white")} />
            <span className={cn("text-[10px] font-medium tracking-tight truncate", item.highlight && "text-white font-semibold")}>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      {/* Firebase Authentication Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-2xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <LootlyLogo variant="icon" size="md" />
              <div>
                <h3 className="font-display text-lg font-bold text-zinc-900">Hubungkan Akun Lootly</h3>
                <p className="text-xs text-zinc-500">Jurnal trading & manajemen risiko modern</p>
              </div>
            </div>

            {authError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {authError}
              </div>
            )}

            <p className="text-xs text-zinc-600 leading-relaxed mb-6">
              Dengan masuk, catatan trade, upload screenshot chart, analisis OCR, dan evaluasi psikologi Anda akan tersimpan otomatis dan dapat diakses dari perangkat mana pun.
            </p>

            <div className="flex flex-col gap-3">
              <button
                id="btn-modal-google"
                onClick={handleGoogleLogin}
                disabled={authLoading}
                className="w-full py-3 px-4 rounded-xl border border-zinc-300 hover:bg-zinc-50 text-zinc-800 text-sm font-semibold flex items-center justify-center gap-3 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                {authLoading ? "Menghubungkan..." : "Masuk dengan Akun Google"}
              </button>

              <button
                id="btn-modal-guest"
                onClick={handleGuestLogin}
                disabled={authLoading}
                className="w-full py-3 px-4 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
              >
                <UserIcon className="w-4 h-4" />
                Lanjutkan sebagai Mode Tamu
              </button>
            </div>

            <div className="mt-5 text-center">
              <span className="text-[11px] text-zinc-400">Data tersimpan aman & terisolasi per akun</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
