import React from "react";
import { AlertCircle, CheckCircle2, ChevronRight, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "error" | "warning" | "surface";
  className?: string;
  size?: "sm" | "md";
}

export function Badge({ children, variant = "surface", className, size = "md" }: BadgeProps) {
  const variants = {
    primary: "bg-primary/10 text-primary border-primary/20",
    secondary: "bg-secondary/10 text-secondary border-secondary/20",
    error: "bg-error/10 text-error border-error/20",
    warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", // Hardcode warning as requested yellow
    surface: "bg-surface-variant text-on-surface-variant border-white/5",
  };

  const sizes = {
    sm: "px-1.5 py-0.5 text-[10px]",
    md: "px-2 py-1 text-xs",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-display font-semibold uppercase tracking-wider rounded border",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}

interface ToastWarningProps {
  title: string;
  message: string;
  type?: "error" | "warning";
}

export function WarningPanel({ title, message, type = "warning" }: ToastWarningProps) {
  return (
    <div className={cn(
      "border rounded-xl p-4 flex items-start gap-4 shadow-lg",
      type === 'error' ? "bg-error-container/10 border-error/30 shadow-error/5" : "bg-yellow-500/10 border-yellow-500/30 shadow-yellow-500/5"
    )}>
      <AlertCircle className={cn("w-6 h-6 mt-0.5 shrink-0", type === 'error' ? 'text-error' : 'text-yellow-500')} />
      <div className="flex-1">
        <h3 className={cn("font-display font-medium text-lg mb-1", type === 'error' ? 'text-error' : 'text-yellow-500')}>
          {title}
        </h3>
        <p className={cn("font-sans text-sm", type === 'error' ? 'text-error/80' : 'text-yellow-500/80')}>
          {message}
        </p>
      </div>
    </div>
  );
}
