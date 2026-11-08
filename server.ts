import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import mt5ConnectorsHandler from "./api/mt5/connectors.js";
import mt5WebhookHandler from "./api/mt5/webhook.js";
import ocrTradeHandler from "./api/ocr-trade.js";

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with size allowance for screenshot base64
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// 1. API Health Check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "Lootly Cloud API" });
});

// 2. MT5 Direct Connector Management (GET, POST, PATCH, DELETE)
app.all("/api/mt5/connectors", async (req, res) => {
  return mt5ConnectorsHandler(req as any, res as any);
});

// 3. MT5 Direct Synchronization Webhook (POST from Lootly_MT5_Connector.mq5)
app.post("/api/mt5/webhook", async (req, res) => {
  return mt5WebhookHandler(req as any, res as any);
});

// 4. Gemini AI OCR Trade Screenshot Reader
app.post("/api/ocr-trade", async (req, res) => {
  return ocrTradeHandler(req as any, res as any);
});

// 5. Vite Middleware (Dev) & Static Serving (Production)
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Lootly Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
