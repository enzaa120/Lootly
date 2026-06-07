import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "../../lib/utils";
import { 
  LayoutDashboard, 
  PlusCircle, 
  BookOpen, 
  BarChart2, 
  Settings, 
  Bell, 
  Menu,
  Wallet,
  CalendarCheck,
  ChevronDown,
  Newspaper
} from "lucide-react";
import { useAppStore } from "../../store/AppContext";
import { useState, useRef, useEffect } from "react";

export function AppLayout() {
  const { accountMode, setAccountMode } = useAppStore();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const navItems = [
    { name: "Beranda", path: "/", icon: LayoutDashboard },
    { name: "News", path: "/news", icon: Newspaper },
    { name: "Jurnal", path: "/journal", icon: BookOpen },
    { name: "Tambah Trade", path: "/add", icon: PlusCircle, highlight: true },
    { name: "Evaluasi", path: "/reviews", icon: CalendarCheck },
    { name: "Analitik", path: "/analytics", icon: BarChart2 },
    { name: "Pengaturan", path: "/settings", icon: Settings },
  ];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-[#0e1510] text-[#dce5dc] flex flex-col md:flex-row antialiased selection:bg-primary-container selection:text-on-primary-container overflow-x-hidden pb-20 md:pb-0">
      
      {/* Mobile Top Bar */}
      <header className="md:hidden fixed top-0 w-full z-50 flex justify-between items-center px-4 h-16 bg-[#0e1510]/80 backdrop-blur-xl border-b border-white/10">
        <button className="text-primary hover:bg-white/5 transition-colors active:scale-95 duration-200 p-2 rounded-full cursor-pointer">
          <Menu className="w-6 h-6" />
        </button>
        <div className="font-display text-2xl font-bold text-primary tracking-tighter" onClick={() => navigate("/")} role="button">LOOTLY</div>
        <button className="text-primary hover:bg-white/5 transition-colors active:scale-95 duration-200 p-2 rounded-full cursor-pointer">
          <Bell className="w-6 h-6" />
        </button>
      </header>

      {/* Desktop Sidebar */}
      <nav className="hidden md:flex flex-col p-4 gap-2 bg-[#242c26]/80 backdrop-blur-2xl h-screen w-80 rounded-r-xl border-r border-white/10 shadow-2xl fixed z-40 left-0 top-0 overflow-y-auto">
        <div className="mb-8 px-2 pt-6">
          <div className="font-display text-3xl font-bold text-primary tracking-tighter mb-8 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => navigate("/")} role="button">LOOTLY</div>
          
          <div className="relative" ref={dropdownRef}>
            <div 
               className="flex justify-between items-center mt-6 p-2 rounded-lg bg-white/5 border border-white/10 cursor-pointer hover:bg-white/10 active:bg-white/5 transition-colors select-none"
               onClick={() => setDropdownOpen(!dropdownOpen)}
               role="button"
               tabIndex={0}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border shrink-0 text-white shadow-inner ${accountMode === 'real' ? 'bg-[#183a28] border-primary/40' : 'bg-[#1a2b3c] border-blue-400/40'}`}>
                  <Wallet className="w-5 h-5"/>
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="font-sans text-base text-white truncate font-semibold capitalize flex items-center gap-2">
                    {accountMode} Account
                    <span className={`w-2 h-2 rounded-full inline-block ${accountMode === 'real' ? 'bg-primary' : 'bg-blue-400'}`}></span>
                  </span>
                  <span className="font-sans text-xs text-on-surface-variant truncate">v1.0.0 Local</span>
                </div>
              </div>
              <ChevronDown className={`w-5 h-5 text-on-surface-variant transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {dropdownOpen && (
               <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a211c] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
                  <button
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors ${accountMode === 'demo' ? 'bg-white/5' : ''}`}
                    onClick={() => { setAccountMode('demo'); setDropdownOpen(false); }}
                  >
                     <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                     <span className="font-sans text-sm font-semibold text-white">Demo Account</span>
                  </button>
                  <button
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors ${accountMode === 'real' ? 'bg-white/5' : ''}`}
                    onClick={() => { setAccountMode('real'); setDropdownOpen(false); }}
                  >
                     <span className="w-2 h-2 rounded-full bg-primary"></span>
                     <span className="font-sans text-sm font-semibold text-white">Real Account</span>
                  </button>
               </div>
            )}
          </div>
        </div>

        <ul className="flex flex-col gap-2 flex-1">
          {navItems.map((item) => (
            <li key={item.name}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg font-sans transition-all duration-200 cursor-pointer",
                    isActive
                      ? "bg-primary/20 text-primary font-semibold"
                      : "text-on-surface-variant hover:bg-white/5 hover:translate-x-1"
                  )
                }
              >
                <item.icon className={cn("w-5 h-5", item.highlight && "text-primary")} />
                <span className="text-base">{item.name}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 w-full md:ml-80 pt-20 md:pt-8 min-h-screen relative z-10 flex flex-col">
        {/* Background glow effects */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#00c076]/5 rounded-full blur-[120px] pointer-events-none z-[-1]" />
        <div className="absolute top-[40%] right-[-10%] w-[30%] h-[30%] bg-blue-500/5 rounded-full blur-[100px] pointer-events-none z-[-1]" />
        
        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 flex justify-around items-center py-2 px-4 pb-safe bg-[#1a211c]/95 backdrop-blur-xl border-t border-white/5 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center transition-all active:scale-90 duration-150 p-2 cursor-pointer",
                isActive ? "text-primary scale-110" : "text-on-surface-variant hover:text-primary",
                item.highlight && "bg-primary/10 rounded-full px-5 py-2 border border-primary/20"
              )
            }
          >
            <item.icon className={cn("w-6 h-6 mb-1", item.highlight && "w-7 h-7")} />
            <span className="font-display text-[10px] font-semibold tracking-wider uppercase">{item.name}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
