import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { Trade, Transaction, TradeSettings, AccountMode, AssetType, UserProfile } from "../types";
import { generateId } from "../lib/utils";
import { 
  auth, 
  db, 
  signInWithGoogle as fbSignInGoogle, 
  signInAsGuest as fbSignInGuest, 
  signOutUser as fbSignOutUser 
} from "../lib/firebase";
import { 
  onAuthStateChanged, 
  User 
} from "firebase/auth";
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  getDoc 
} from "firebase/firestore";

// Helper to sanitize data for Firestore (prevents undefined, NaN, oversized base64, and invalid objects)
function cleanFirestoreObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (typeof obj === "number") {
    return (isNaN(obj) ? null : obj) as any;
  }
  if (typeof obj !== "object") {
    // Avoid storing large base64 data URLs in Firestore documents
    if (typeof obj === "string" && obj.startsWith("data:image/") && obj.length > 2000) {
      return null as any;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanFirestoreObject) as any;
  }
  const cleaned: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) {
      continue; // omit undefined
    }
    if (typeof val === "number" && isNaN(val)) {
      cleaned[key] = null;
      continue;
    }
    // Omit oversized base64 data URLs
    if (typeof val === "string" && val.startsWith("data:image/") && val.length > 2000) {
      cleaned[key] = null;
      continue;
    }
    if (val !== null && typeof val === "object") {
      cleaned[key] = cleanFirestoreObject(val);
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned as T;
}

// Canonical helper to deduplicate trades by stable ID
export function dedupeTrades(list: Trade[]): Trade[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: Trade[] = [];
  for (const t of list) {
    if (t && t.id) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        result.push(t);
      }
    }
  }
  return result;
}

const defaultSettings: TradeSettings = {
  startingBalanceDemo: 10000000, // Rp 10.000.000
  startingBalanceReal: 5000000,  // Rp 5.000.000
  targetBalanceDemo: 25000000,   // Rp 25.000.000
  targetBalanceReal: 15000000,   // Rp 15.000.000
  dailyProfitTargetDemoIdr: 500000, // Rp 500.000
  dailyProfitTargetDemoPercent: 5.0,
  dailyProfitTargetRealIdr: 250000, // Rp 250.000
  dailyProfitTargetRealPercent: 5.0,
  maxDailyLossIdrDemo: 200000, // Rp 200.000
  maxDailyLossIdrReal: 100000, // Rp 100.000
  maxDailyLossPercent: 2.0,
  maxTradesPerDay: 5,
  stopAfterLosses: 2,
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
  accountMode: AccountMode;
  selectedAsset: AssetType;
  user: User | null;
  userProfile: UserProfile | null;
  isCloudSynced: boolean;
  isAuthLoading: boolean;
}

interface AppContextType extends AppState {
  setAccountMode: (mode: AccountMode) => void;
  setSelectedAsset: (asset: AssetType) => void;
  updateSettings: (newSettings: Partial<TradeSettings>) => Promise<void>;
  addTrade: (trade: Omit<Trade, "id" | "createdAt" | "updatedAt"> & { id?: string }) => Promise<string>;
  updateTrade: (id: string, trade: Partial<Trade>) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
  addTransaction: (transaction: Omit<Transaction, "id">) => Promise<void>;
  resetAllData: () => Promise<void>;
  importData: (data: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<void>;
  loginAsGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isCloudSynced, setIsCloudSynced] = useState(false);
  
  const [accountMode, setAccountModeState] = useState<AccountMode>("demo");
  const [selectedAsset, setSelectedAssetState] = useState<AssetType>("XAU/USD");
  const [settings, setSettings] = useState<TradeSettings>(defaultSettings);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // 1. Initial Local Fallback Hydration
  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem("lootly.settings");
      if (storedSettings) setSettings({ ...defaultSettings, ...JSON.parse(storedSettings) });

      const storedTrades = localStorage.getItem("lootly.trades");
      if (storedTrades) {
        const parsed = JSON.parse(storedTrades);
        if (Array.isArray(parsed)) {
          setTrades(dedupeTrades(parsed));
        }
      }

      const storedTransactions = localStorage.getItem("lootly.transactions");
      if (storedTransactions) setTransactions(JSON.parse(storedTransactions));

      const storedMode = localStorage.getItem("lootly.accountMode");
      if (storedMode === "demo" || storedMode === "real") setAccountModeState(storedMode);
    } catch (e) {
      console.error("Local storage load error", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // 2. Firebase Auth Listener & Firestore Sync
  useEffect(() => {
    let unsubscribeTrades: (() => void) | null = null;
    let unsubscribeSettings: (() => void) | null = null;
    let unsubscribeTransactions: (() => void) | null = null;

    const cleanupSubscribers = () => {
      if (unsubscribeTrades) { unsubscribeTrades(); unsubscribeTrades = null; }
      if (unsubscribeSettings) { unsubscribeSettings(); unsubscribeSettings = null; }
      if (unsubscribeTransactions) { unsubscribeTransactions(); unsubscribeTransactions = null; }
    };

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      cleanupSubscribers();
      setUser(currentUser);
      setIsAuthLoading(false);

      if (currentUser) {
        setIsCloudSynced(true);
        const uid = currentUser.uid;

        // Sync Settings from Firestore
        const settingsDocRef = doc(db, "users", uid, "settings", "current");
        unsubscribeSettings = onSnapshot(settingsDocRef, (snap) => {
          if (snap.exists()) {
            setSettings({ ...defaultSettings, ...snap.data() as TradeSettings });
          } else {
            // Save initial defaults to Firestore for new users
            setDoc(settingsDocRef, defaultSettings).catch(console.error);
          }
        }, (err) => console.warn("Firestore settings error:", err));

        // Sync Trades Real-Time
        const tradesColRef = collection(db, "users", uid, "trades");
        unsubscribeTrades = onSnapshot(tradesColRef, (snapshot) => {
          const list: Trade[] = [];
          snapshot.forEach((d) => {
            const data = d.data() as Trade;
            list.push({ ...data, id: data.id || d.id });
          });
          // Sort newest first
          list.sort((a, b) => new Date(b.date + "T" + (b.time || "00:00")).getTime() - new Date(a.date + "T" + (a.time || "00:00")).getTime());
          const deduped = dedupeTrades(list);
          setTrades(deduped);
          localStorage.setItem("lootly.trades", JSON.stringify(deduped));
        }, (err) => console.warn("Firestore trades error:", err));

        // Sync Transactions Real-Time
        const txColRef = collection(db, "users", uid, "transactions");
        unsubscribeTransactions = onSnapshot(txColRef, (snapshot) => {
          const list: Transaction[] = [];
          snapshot.forEach((d) => {
            list.push(d.data() as Transaction);
          });
          list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setTransactions(list);
          localStorage.setItem("lootly.transactions", JSON.stringify(list));
        }, (err) => console.warn("Firestore transactions error:", err));

      } else {
        setIsCloudSynced(false);
      }
    });

    return () => {
      unsubscribeAuth();
      cleanupSubscribers();
    };
  }, []);

  // Save to local storage for offline resiliency
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem("lootly.settings", JSON.stringify(settings));
    localStorage.setItem("lootly.trades", JSON.stringify(dedupeTrades(trades)));
    localStorage.setItem("lootly.transactions", JSON.stringify(transactions));
    localStorage.setItem("lootly.accountMode", accountMode);
  }, [settings, trades, transactions, accountMode, isLoaded]);

  const setAccountMode = (mode: AccountMode) => setAccountModeState(mode);
  const setSelectedAsset = (asset: AssetType) => setSelectedAssetState(asset);

  const updateSettings = async (newSettings: Partial<TradeSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    if (user) {
      try {
        const settingsDocRef = doc(db, "users", user.uid, "settings", "current");
        await setDoc(settingsDocRef, cleanFirestoreObject(updated), { merge: true });
      } catch (err) {
        console.error("Error updating settings to cloud:", err);
      }
    }
  };

  const addTrade = async (tradeData: Omit<Trade, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<string> => {
    const stableTradeId = tradeData.id || generateId();
    const now = new Date().toISOString();
    const newTrade: Trade = {
      ...tradeData,
      id: stableTradeId,
      userId: user?.uid,
      createdAt: (tradeData as any).createdAt || now,
      updatedAt: now,
    };

    // 1. Sanitize payload for Firestore
    const cleanedPayload = cleanFirestoreObject(newTrade);

    // 2. Save to Firestore using setDoc with stable tradeId
    if (user) {
      try {
        const tradeDocRef = doc(db, "users", user.uid, "trades", stableTradeId);
        await setDoc(tradeDocRef, cleanedPayload, { merge: true });
      } catch (err) {
        console.error("Error saving trade to cloud Firestore:", err);
      }
    }

    // 3. Update local state immediately with upsert / replacement logic
    setTrades((prev) => {
      const exists = prev.some((t) => t.id === stableTradeId);
      if (exists) {
        return prev.map((t) => (t.id === stableTradeId ? { ...t, ...newTrade } : t));
      }
      return [newTrade, ...prev];
    });

    // 4. Auto record transaction if closed trade with PnL (idempotent)
    if (newTrade.status === "closed" && newTrade.pnlIdr !== undefined && newTrade.pnlIdr !== 0) {
      await addTransaction({
        accountMode: newTrade.accountMode,
        amount: newTrade.pnlIdr,
        date: newTrade.date,
        type: "trade_pnl",
        note: `${newTrade.asset} (${newTrade.direction.toUpperCase()}) - ${newTrade.result}`,
        relatedTradeId: newTrade.id,
      });
    }

    return stableTradeId;
  };

  const updateTrade = async (id: string, tradeUpdate: Partial<Trade>) => {
    const now = new Date().toISOString();
    setTrades((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...tradeUpdate, updatedAt: now } : t))
    );

    if (user) {
      try {
        const tradeDocRef = doc(db, "users", user.uid, "trades", id);
        await setDoc(tradeDocRef, cleanFirestoreObject({ ...tradeUpdate, updatedAt: now }), { merge: true });
      } catch (err) {
        console.error("Error updating trade to cloud:", err);
      }
    }
  };

  const deleteTrade = async (id: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== id));
    if (user) {
      try {
        const tradeDocRef = doc(db, "users", user.uid, "trades", id);
        await deleteDoc(tradeDocRef);
      } catch (err) {
        console.error("Error deleting trade from cloud:", err);
      }
    }
  };

  const addTransaction = async (txData: Omit<Transaction, "id">) => {
    // Idempotent: avoid duplicate transaction for the same trade
    if (txData.relatedTradeId) {
      const exists = transactions.some((t) => t.relatedTradeId === txData.relatedTradeId);
      if (exists) return;
    }

    const newId = generateId();
    const newTx: Transaction = {
      ...txData,
      id: newId,
      userId: user?.uid,
    };
    setTransactions((prev) => [newTx, ...prev]);

    if (user) {
      try {
        const txDocRef = doc(db, "users", user.uid, "transactions", newId);
        await setDoc(txDocRef, newTx);
      } catch (err) {
        console.error("Error saving transaction to cloud:", err);
      }
    }
  };

  const resetAllData = async () => {
    setSettings(defaultSettings);
    setTrades([]);
    setTransactions([]);
    localStorage.removeItem("lootly.trades");
    localStorage.removeItem("lootly.transactions");
    localStorage.removeItem("lootly.settings");

    if (user) {
      try {
        // Reset in cloud
        const settingsDocRef = doc(db, "users", user.uid, "settings", "current");
        await setDoc(settingsDocRef, defaultSettings);
        // Clean trades in cloud
        for (const t of trades) {
          await deleteDoc(doc(db, "users", user.uid, "trades", t.id));
        }
      } catch (err) {
        console.error("Error resetting cloud data:", err);
      }
    }
  };

  const importData = async (jsonString: string): Promise<boolean> => {
    try {
      const data = JSON.parse(jsonString);
      if (data.settings) {
        await updateSettings(data.settings);
      }
      if (Array.isArray(data.trades)) {
        for (const t of data.trades) {
          await addTrade(t);
        }
      }
      return true;
    } catch (e) {
      console.error("Failed to import data", e);
      return false;
    }
  };

  const loginWithGoogle = async () => {
    try {
      await fbSignInGoogle();
    } catch (err) {
      console.error("Login failed:", err);
      throw err;
    }
  };

  const loginAsGuest = async () => {
    try {
      await fbSignInGuest();
    } catch (err) {
      console.error("Guest login failed:", err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await fbSignOutUser();
      setUser(null);
      setTrades([]);
      setTransactions([]);
      setSettings(defaultSettings);
      localStorage.removeItem("lootly.trades");
      localStorage.removeItem("lootly.transactions");
      localStorage.removeItem("lootly.settings");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const userProfile: UserProfile | null = user ? {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName || (user.isAnonymous ? "Guest Trader" : "Trader"),
    photoURL: user.photoURL,
    isAnonymous: user.isAnonymous,
  } : null;

  return (
    <AppContext.Provider
      value={{
        settings,
        trades,
        transactions,
        accountMode,
        selectedAsset,
        user,
        userProfile,
        isCloudSynced,
        isAuthLoading,
        setAccountMode,
        setSelectedAsset,
        updateSettings,
        addTrade,
        updateTrade,
        deleteTrade,
        addTransaction,
        resetAllData,
        importData,
        loginWithGoogle,
        loginAsGuest,
        logout,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppStore() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppStore must be used within an AppProvider");
  }
  return context;
}
