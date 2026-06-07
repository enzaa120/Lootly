import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: 'USD' | 'IDR' = 'USD'): string {
  if (currency === 'IDR') {
    const formatted = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
    return formatted.replace(/^Rp\s*/, 'Rp');
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export const generateId = () => crypto.randomUUID();

export function calculateDisciplineScore(trade: any, maxDailyLossPercent: number = 0): number {
  let score = 10;
  
  if (trade.actualSL === undefined || isNaN(trade.actualSL)) score -= 3;
  
  let checkedCount = 0;
  if (trade.checklist) {
    checkedCount = Object.values(trade.checklist).filter(v => v === true).length;
    if (checkedCount < 7) score -= 2;
    if (trade.checklist.notRevenge === false) score -= 1.5;
    if (trade.checklist.notChasingCandle === false) score -= 1.5;
    if (trade.checklist.riskAcceptable === false) score -= 2;
  }
  
  if (trade.riskPercent > maxDailyLossPercent && maxDailyLossPercent > 0) score -= 2;
  if (trade.followedPlan === false) score -= 2;
  if (trade.slFollowed === false) score -= 1;
  if (trade.tpRealistic === false) score -= 1;
  
  if (trade.mistakes) {
    if (trade.mistakes.includes("Oversized Lot")) score -= 2;
    if (trade.mistakes.includes("No SL")) score -= 3;
    if (trade.mistakes.includes("Revenge Trade")) score -= 2;
    if (trade.mistakes.includes("Chasing Candle")) score -= 2;
    if (trade.mistakes.includes("Overtrade")) score -= 1.5;
    if (trade.mistakes.includes("Against Trend")) score -= 1;
  }
  
  score = Math.max(1, Math.min(10, Math.round(score * 10) / 10));
  return score;
}

export function getDisciplineInterpretation(score: number): { text: string, colorClass: string } {
  if (score >= 8.5) return { text: "Disiplin", colorClass: "text-[#32c882]" };
  if (score >= 7.0) return { text: "Cukup disiplin", colorClass: "text-[#4b8eff]" };
  if (score >= 4.0) return { text: "Kurang disiplin", colorClass: "text-yellow-500" };
  return { text: "Tidak disiplin", colorClass: "text-error" };
}
