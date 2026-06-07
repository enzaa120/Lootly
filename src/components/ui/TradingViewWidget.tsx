import { useEffect, useMemo, useState } from "react";

type TradingViewChartProps = {
  symbol?: string;
  height?: number | string;
  className?: string;
};

const normalizeSymbol = (symbol: string) => {
  if (symbol === "XAU/USD") return "OANDA:XAUUSD";
  if (symbol === "BTC/USD") return "BINANCE:BTCUSDT";
  return symbol || "OANDA:XAUUSD";
};

export function TradingViewChart({
  symbol = "OANDA:XAUUSD",
  height, // Make optional without default, use className for responsive sizing
  className = "",
}: TradingViewChartProps) {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const tvSymbol = normalizeSymbol(symbol);

  useEffect(() => {
    setIframeLoaded(false);
  }, [tvSymbol]);

  const iframeSrc = useMemo(() => {
    const config = {
      autosize: true,
      symbol: tvSymbol,
      interval: "15",
      timezone: "Asia/Jakarta",
      theme: "dark",
      style: "1",
      locale: "en",
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: true,
      calendar: false,
      support_host: "https://www.tradingview.com",
    };

    return `https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(
      JSON.stringify(config)
    )}`;
  }, [tvSymbol]);

  const openUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-[#0b0f0d] ${className.includes('h-') ? className : `h-[360px] md:h-[380px] xl:h-[420px] ${className}`}`}
      style={height ? { height: height === "100%" ? "100%" : height } : undefined}
    >
      {!iframeLoaded && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0b0f0d]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-primary" />
          <p className="mt-4 text-sm text-white/60">Loading TradingView chart...</p>
        </div>
      )}

      <iframe
        key={tvSymbol}
        title={`TradingView ${tvSymbol}`}
        src={iframeSrc}
        className="h-full w-full border-0"
        allowFullScreen
        loading="lazy"
        onLoad={() => setIframeLoaded(true)}
      />

      <div className="absolute right-3 top-3 z-30 pointer-events-auto">
        <a
          href={openUrl}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="rounded-full border border-primary/30 bg-primary/15 px-3 py-1.5 md:px-4 md:py-2 text-[10px] md:text-xs font-semibold text-primary backdrop-blur-md transition hover:bg-primary/25 block text-center flex items-center justify-center pointer-events-auto cursor-pointer"
        >
          Open in TS
        </a>
      </div>
    </div>
  );
}

export default TradingViewChart;
