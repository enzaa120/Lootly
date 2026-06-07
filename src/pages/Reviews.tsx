import { useState } from "react";
import { useAppStore } from "../store/AppContext";
import { Trophy, Target, AlertTriangle } from "lucide-react";

export function Reviews() {
  const { trades, accountMode } = useAppStore();
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("daily");

  return (
    <div className="px-4 md:px-8 max-w-5xl mx-auto w-full pb-8 pt-4">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-4xl font-bold text-white tracking-tighter mb-2">Performance Reviews</h1>
          <p className="font-sans text-sm text-on-surface-variant">Analyze your discipline and learn from history.</p>
        </div>

        <div className="flex gap-2 p-1 bg-[#161d18] rounded-lg border border-white/5 w-fit">
          {["daily", "weekly", "monthly", "yearly"].map(p => (
            <button 
               key={p} 
               onClick={() => setPeriod(p as any)}
               className={`px-4 py-2 font-display text-xs font-bold tracking-wider rounded-md capitalize transition-all ${period === p ? 'bg-white/10 text-white' : 'text-on-surface-variant hover:text-white'}`}
            >
               {p}
            </button>
          ))}
        </div>

        <div className="glass-panel p-12 flex flex-col items-center justify-center rounded-xl border border-white/5 text-center min-h-[400px]">
           <Trophy className="w-16 h-16 text-[#3c4a40] mb-4" />
           <h3 className="font-display text-lg text-white mb-2">No {period} Reviews Yet</h3>
           <p className="font-sans text-sm text-on-surface-variant max-w-md">Reviews help you identify psychological leaks and solidify what is working. Create your first review to build the habit.</p>
           <button className="mt-6 bg-primary/10 text-primary px-6 py-2 rounded-lg font-display text-xs font-bold uppercase tracking-widest hover:bg-primary/20 transition-colors border border-primary/20">
              Create Review
           </button>
        </div>

      </div>
    </div>
  );
}
