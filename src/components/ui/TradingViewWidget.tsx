import { useEffect, useState, memo } from 'react';

interface TradingViewChartProps {
  symbol: string;
  theme?: 'dark' | 'light';
  interval?: string;
  height?: number | string;
}

export const TradingViewChart = memo(function TradingViewChart({
  symbol,
  theme = 'dark',
  interval = '15',
  height = '100%',
}: TradingViewChartProps) {
  const [loadError, setLoadError] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    setLoadError(false);
    setIframeLoaded(false);
    
    // Set fallback timeout for iframe loading
    const timeoutId = setTimeout(() => {
       if (!iframeLoaded) {
          setLoadError(true);
       }
    }, 8000);

    return () => clearTimeout(timeoutId);
  }, [symbol, theme, interval, iframeLoaded]);

  if (loadError) {
    return (
       <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center border border-white/10 bg-[#161d18] rounded-xl" style={{ height }}>
          <p className="text-on-surface-variant mb-4 font-sans text-sm">
            Chart belum bisa dimuat di preview ini. Buka langsung di TradingView.
          </p>
          <a 
            href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`}
            target="_blank" 
            rel="noopener noreferrer"
            className="px-6 py-2 bg-primary text-[#00391f] font-display text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-[#32c882] transition-colors cursor-pointer"
          >
            Open in TradingView
          </a>
       </div>
    );
  }

  // Use TradingView's official embed URL format
  const iframeSrc = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_76d87&symbol=${encodeURIComponent(symbol)}&interval=${interval}&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=2b3139&studies=%5B%5D&theme=${theme.charAt(0).toUpperCase() + theme.slice(1)}&style=1&timezone=Asia%2FJakarta&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=en&utm_source=localhost&utm_medium=widget&utm_campaign=chart&utm_term=${encodeURIComponent(symbol)}`;

  return (
    <div className="w-full h-full relative border border-white/5 bg-[#0e1510] rounded-xl overflow-hidden" style={{ height }}>
      <iframe
        src={iframeSrc}
        title={`TradingView Chart ${symbol}`}
        className="w-full h-full border-none"
        allowTransparency={true}
        scrolling="no"
        allowFullScreen={true}
        onLoad={() => setIframeLoaded(true)}
      />
      {!iframeLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0e1510] z-10">
          <div className="animate-pulse flex flex-col items-center">
            <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin mb-4" />
            <span className="font-mono text-xs text-on-surface-variant">Memuat Chart...</span>
          </div>
        </div>
      )}
    </div>
  );
});


