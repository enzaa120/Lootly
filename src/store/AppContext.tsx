import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { Trade, Transaction, Review, TradeSettings, AccountMode, AssetType, InstrumentConfig } from "../types";
import { generateId } from "../lib/utils";

const defaultSettings: TradeSettings = {
  startingBalanceDemo: 1200000,
  startingBalanceReal: 2000000,
  targetBalanceDemo: 10000000,
  targetBalanceReal: 15000000,
  maxDailyLossPercent: 2.5,
  maxTradesPerDay: 5,
  stopAfterLosses: 2,
  usdToIdr: 15500,
  instruments: {
    "XAU/USD": {
      tradingViewSymbol: "OANDA:XAUUSD",
      pipSize: 0.01,
      contractSize: 100,
    },
    "BTC/USD": {
      tradingViewSymbol: "COINBASE:BTCUSD",
      pipSize: 1,
      contractSize: 1,
    },
  },
};

interface AppState {
  settings: TradeSettings;
  trades: Trade[];
  transactions: Transaction[];
  reviews: Review[];
  accountMode: AccountMode;
  selectedAsset: AssetType;
}

interface AppContextType extends AppState {
  setAccountMode: (mode: AccountMode) => void;
  setSelectedAsset: (asset: AssetType) => void;
  updateSettings: (newSettings: Partial<TradeSettings>) => void;
  addTrade: (trade: Omit<Trade, "id" | "createdAt" | "updatedAt">) => string;
  updateTrade: (id: string, trade: Partial<Trade>) => void;
  deleteTrade: (id: string) => void;
  addTransaction: (transaction: Omit<Transaction, "id">) => void;
  resetAllData: () => void;
  importData: (data: string) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [accountMode, setAccountModeState] = useState<AccountMode>("demo");
  const [selectedAsset, setSelectedAssetState] = useState<AssetType>("XAU/USD");
  
  const [settings, setSettings] = useState<TradeSettings>(defaultSettings);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  // Load from local storage
  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem("Lootly.settings");
      if (storedSettings) setSettings({ ...defaultSettings, ...JSON.parse(storedSettings) });

      const storedTrades = localStorage.getItem("Lootly.trades");
      if (storedTrades) setTrades(JSON.parse(storedTrades));

      const storedTransactions = localStorage.getItem("Lootly.transactions");
      if (storedTransactions) setTransactions(JSON.parse(storedTransactions));

      const storedReviews = localStorage.getItem("Lootly.reviews");
      if (storedReviews) setReviews(JSON.parse(storedReviews));

      const storedMode = localStorage.getItem("Lootly.accountMode");
      if (storedMode === "demo" || storedMode === "real") setAccountModeState(storedMode);
    } catch (e) {
      console.error("Error loading data from local storage", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save to local storage when state changes
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem("Lootly.settings", JSON.stringify(settings));
    localStorage.setItem("Lootly.trades", JSON.stringify(trades));
    localStorage.setItem("Lootly.transactions", JSON.stringify(transactions));
    localStorage.setItem("Lootly.reviews", JSON.stringify(reviews));
    localStorage.setItem("Lootly.accountMode", accountMode);
  }, [settings, trades, transactions, reviews, accountMode, isLoaded]);

  const setAccountMode = (mode: AccountMode) => setAccountModeState(mode);
  const setSelectedAsset = (asset: AssetType) => setSelectedAssetState(asset);

  const updateSettings = (newSettings: Partial<TradeSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const addTrade = (tradeData: Omit<Trade, "id" | "createdAt" | "updatedAt">) => {
    const newId = generateId();
    const newTrade: Trade = {
      ...tradeData,
      id: newId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    setTrades((prev) => [newTrade, ...prev]);

    // Auto-create transaction if trade is closed and has PnL
    if (newTrade.status === "closed" && newTrade.pnlIdr !== undefined && newTrade.pnlIdr !== 0) {
       addTransaction({
         accountMode: newTrade.accountMode,
         amount: newTrade.pnlIdr, // Track balance in IDR
         date: newTrade.date,
         type: "trade_pnl",
         note: `Trade ${newTrade.asset} - ${newTrade.result}`,
         relatedTradeId: newTrade.id
       });
    }
    
    return newId;
  };

  const updateTrade = (id: string, tradeUpdate: Partial<Trade>) => {
    setTrades((prev) =>
      prev.map((trade) =>
        trade.id === id
          ? { ...trade, ...tradeUpdate, updatedAt: new Date().toISOString() }
          : trade
      )
    );
  };

  const deleteTrade = (id: string) => {
    setTrades((prev) => prev.filter((trade) => trade.id !== id));
    setTransactions((prev) => prev.filter((t) => t.relatedTradeId !== id));
  };

  const addTransaction = (t: Omit<Transaction, "id">) => {
    setTransactions((prev) => [{ ...t, id: generateId() }, ...prev]);
  };

  const resetAllData = () => {
    setSettings(defaultSettings);
    setTrades([]);
    setTransactions([]);
    setReviews([]);
    setAccountModeState("demo");
    localStorage.clear();
  };

  const importData = (jsonData: string) => {
    try {
      const data = JSON.parse(jsonData);
      if (data.settings) setSettings({ ...defaultSettings, ...data.settings });
      if (data.trades) setTrades(data.trades);
      if (data.transactions) setTransactions(data.transactions);
      if (data.reviews) setReviews(data.reviews);
      return true;
    } catch (e) {
      console.error("Failed to import data", e);
      return false;
    }
  };

  if (!isLoaded) return null; // Avoid rendering until state is loaded

  return (
    <AppContext.Provider
      value={{
        settings,
        trades,
        transactions,
        reviews,
        accountMode,
        selectedAsset,
        setAccountMode,
        setSelectedAsset,
        updateSettings,
        addTrade,
        updateTrade,
        deleteTrade,
        addTransaction,
        resetAllData,
        importData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useAppStore must be used within an AppProvider");
  }
  return context;
}
