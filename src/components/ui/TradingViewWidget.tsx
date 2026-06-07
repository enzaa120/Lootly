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
  height = 360,
  className = "",
}: TradingViewChartProps) {
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const tvSymbol = normalizeSymbol(symbol);

  useEffect(() => {
    setIframeLoaded(false);
    setShowHelp(false);

    const timer = window.setTimeout(() => {
      setShowHelp(true);
    }, 8000);

    return () => window.clearTimeout(timer);
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
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-[#0b0f0d] ${className}`}
      style={{ height: height === "100%" ? "100%" : height }}
    >
      {!iframeLoaded && !showHelp && (
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

      <div className="absolute right-3 top-3 z-30">
        <a
          href={openUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-primary/30 bg-primary/15 px-4 py-2 text-xs font-semibold text-primary backdrop-blur-md transition hover:bg-primary/25 cursor-pointer"
        >
          Open in TradingView
        </a>
      </div>

      {showHelp && (
        <div className="absolute inset-x-4 bottom-4 z-30 rounded-xl border border-yellow-400/20 bg-[#111812]/90 p-4 text-sm shadow-xl backdrop-blur-md">
          <p className="font-semibold text-yellow-300">
            Chart masih loading?
          </p>
          <p className="mt-1 text-white/60">
            Preview Google AI Studio atau browser kadang memblokir embed eksternal.
            Kamu tetap bisa buka chart langsung lewat tombol di kanan atas.
          </p>
        </div>
      )}
    </div>
  );
}

export default TradingViewChart;
