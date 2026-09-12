import React from "react";
import { cn } from "../../lib/utils";

interface LootlyLogoProps {
  variant?: "full" | "icon";
  size?: "sm" | "md" | "lg";
  className?: string;
  showSubtitle?: boolean;
}

export function LootlyLogo({
  variant = "full",
  size = "md",
  className,
  showSubtitle = true,
}: LootlyLogoProps) {
  const iconDimensions = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-11 h-11",
  }[size];

  const titleSizes = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  }[size];

  const subtitleSizes = {
    sm: "text-[10px]",
    md: "text-[11px]",
    lg: "text-xs",
  }[size];

  return (
    <div className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      {/* Icon Badge: Modern Geometric 'L' with Candlestick & Upward Performance Step */}
      <div
        className={cn(
          iconDimensions,
          "rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-center p-1.5 shadow-xs shrink-0 transition-transform group-hover:scale-[1.03]"
        )}
      >
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          {/* Upper & Lower Candlestick Wicks */}
          <line
            x1="10.5"
            y1="5.5"
            x2="10.5"
            y2="8"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="10.5"
            y1="20"
            x2="10.5"
            y2="23"
            stroke="#10b981"
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Candlestick Spine Body / Letter 'L' vertical stroke */}
          <rect
            x="9"
            y="8"
            width="3.2"
            height="12"
            rx="1"
            fill="#ffffff"
          />

          {/* Letter 'L' horizontal baseline connecting to an upward trend tick */}
          <path
            d="M12.2 18.5H19.5C20.6 18.5 21.5 17.6 21.5 16.5V12"
            stroke="#10b981"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Alpha spark dot */}
          <circle cx="21.5" cy="10" r="1.6" fill="#34d399" />
        </svg>
      </div>

      {variant === "full" && (
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 leading-none">
            <span
              className={cn(
                titleSizes,
                "font-display font-black tracking-tight text-zinc-950 uppercase"
              )}
            >
              Lootly
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          </div>
          {showSubtitle && (
            <span
              className={cn(
                subtitleSizes,
                "text-zinc-400 font-medium tracking-wide mt-1 truncate"
              )}
            >
              Trading Journal & Risk
            </span>
          )}
        </div>
      )}
    </div>
  );
}
