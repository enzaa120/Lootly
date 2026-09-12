import { AppLayout } from "./components/layout/AppLayout";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./store/AppContext";
import { Dashboard } from "./pages/Dashboard";
import { Journal } from "./pages/Journal";
import { AddTrade } from "./pages/AddTrade";
import { Analytics } from "./pages/Analytics";
import { Settings } from "./pages/Settings";
import { TradeDetail } from "./pages/TradeDetail";

function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="journal" element={<Journal />} />
            <Route path="journal/:tradeId" element={<TradeDetail />} />
            <Route path="add" element={<AddTrade />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
