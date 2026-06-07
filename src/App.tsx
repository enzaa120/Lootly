import { AppLayout } from "./components/layout/AppLayout";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "./store/AppContext";
import { Dashboard } from "./pages/Dashboard";
import { Journal } from "./pages/Journal";
import { AddTrade } from "./pages/AddTrade";
import { Analytics } from "./pages/Analytics";
import { Settings } from "./pages/Settings";
import { TradeDetail } from "./pages/TradeDetail";
import { Reviews } from "./pages/Reviews";

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
            <Route path="reviews" element={<Reviews />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}

export default App;
