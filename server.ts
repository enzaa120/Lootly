import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { processTradingViewWebhook } from "./api/_lib/tradingviewWebhook.js";
import { getXauusdMarketData, getTwelveDataDiagnosticStatus } from "./api/_lib/twelveData.js";
import {
  getPublicVapidKey,
  registerSubscription,
  unregisterSubscription,
  sendPushNotification,
  getSubscriptionsForUser,
} from "./api/_lib/pushService.js";

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with size allowance for screenshot base64
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Lazy Gemini client initialization
let aiClient: GoogleGenAI | null = null;
function getAIClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// API Health
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", app: "Lootly Cloud API" });
});

// Market Data Endpoint for AI Trading Desk (Twelve Data Integration with Caching & Firestore Sync)
app.get("/api/market-data/xauusd", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const force = req.query?.force === "true" || req.query?.refresh === "true";
    const result = await getXauusdMarketData({ force });
    const statusCode = result.success ? 200 : result.status === "missing_api_key" ? 200 : 502;
    return res.status(statusCode).json(result);
  } catch (err: any) {
    console.error("[Market Data API Express] Unhandled error:", err);
    return res.status(500).json({
      success: false,
      source: "none",
      status: "error",
      error: err?.message || "Internal server error fetching market data.",
    });
  }
});

// Market Data Diagnostic / Status Endpoint
app.get("/api/market-data/status", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const diag = await getTwelveDataDiagnosticStatus();
    return res.json({ success: true, diagnostic: diag });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// TradingView Webhook Endpoint for AI Trading Desk
app.post("/api/tradingview-webhook", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const headerSecret = (req.headers["x-webhook-secret"] || req.headers["x-tradingview-secret"]) as string | undefined;
    const result = await processTradingViewWebhook(req.body, headerSecret);
    return res.status(result.statusCode).json(result.response);
  } catch (err: any) {
    console.error("[TradingView Webhook Express] Unhandled error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error processing TradingView webhook.",
    });
  }
});

// ==============================================================================
// WEB PUSH NOTIFICATION ENDPOINTS
// ==============================================================================

// 1. Get Public VAPID Key for client push registration
app.get("/api/push/public-key", (_req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  const publicKey = process.env.VAPID_PUBLIC_KEY || getPublicVapidKey();
  if (!publicKey) {
    return res.status(500).json({
      ok: false,
      code: "VAPID_PUBLIC_KEY_MISSING",
    });
  }
  return res.json({
    ok: true,
    publicKey,
  });
});

// 2. Subscribe a browser client device for Web Push notifications
app.post("/api/push/subscribe", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const { subscription, userId, deviceLabel } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, error: "PushSubscription endpoint required." });
    }
    const result = await registerSubscription({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userId,
      deviceLabel,
    });
    return res.json({
      success: true,
      uid: result.uid,
      subscriptionId: result.subscriptionId,
      stored: result.stored,
      totalActive: result.totalActive,
    });
  } catch (err: any) {
    console.error("[Push Subscribe Express] Error:", err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// 3. Unsubscribe a browser client device
app.post("/api/push/unsubscribe", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const { endpoint, userId } = req.body || {};
    if (!endpoint) {
      return res.status(400).json({ success: false, error: "Subscription endpoint required." });
    }
    const result = await unregisterSubscription(endpoint, userId);
    return res.json({ success: true, totalActive: result.totalActive });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// 4. Send a Web Push notification to registered clients
app.post("/api/push/send-alert", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const { payload, targetUserId } = req.body || {};
    if (!payload || !payload.title || !payload.body) {
      return res.status(400).json({ success: false, error: "Payload with title and body is required." });
    }
    const result = await sendPushNotification(payload, targetUserId);
    return res.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      removed: result.removed,
      skippedDuplicate: result.skippedDuplicate || false,
    });
  } catch (err: any) {
    console.error("[Push Send Alert Express] Error:", err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// 5. Test push notification for user verification
app.post("/api/push/test", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const { targetUserId } = req.body || {};
    const uid = targetUserId && targetUserId !== "guest_trader" ? targetUserId : "user_trader";
    const subs = await getSubscriptionsForUser(uid);

    // Requirement 10: safe production log
    console.log(`[Push] test uid=${uid} subscriptions=${subs.length}`);

    if (subs.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Tidak ada perangkat yang terdaftar untuk push notifikasi pada akun ini. Silakan aktifkan push notifikasi terlebih dahulu.",
      });
    }
    const result = await sendPushNotification(
      {
        title: "Lootly — Uji Coba Push Notifikasi",
        body: "Push notifikasi latar belakang berhasil terhubung! Anda akan menerima alert saat setup XAU/USD valid terbentuk.",
        tag: `lootly-test-${Date.now()}`,
        data: { url: "/ai-desk", type: "TEST" },
      },
      uid
    );
    return res.json({
      success: true,
      message: "Tes notifikasi berhasil dikirim.",
      sent: result.sent,
      failed: result.failed,
    });
  } catch (err: any) {
    console.error("[Push Test Express] Error:", err);
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// OCR Endpoint for Trading Screenshot
app.post("/api/ocr-trade", async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const { imageBase64, mimeType = "image/png" } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ success: false, error: "Gambar tidak ditemukan (imageBase64 required)." });
    }

    // Guard against oversized payloads
    if (imageBase64.length > 7 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        error: "Ukuran gambar terlalu besar. Maksimum ukuran gambar adalah 5MB.",
      });
    }

    // Strip data URL prefix if present
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z0-9-+.]+;base64,/, "");
    if (!cleanBase64) {
      return res.status(400).json({ success: false, error: "Format base64 gambar tidak valid." });
    }

    const safeMimeType = typeof mimeType === "string" && mimeType.startsWith("image/") ? mimeType : "image/png";
    const ai = getAIClient();

    const prompt = `You are an expert financial trading screenshot analyzer and contextual OCR parser.
Analyze this trading screenshot carefully. It may come from TradingView, MetaTrader 4 (MT4), MetaTrader 5 (MT5), Binance, Bybit, cTrader, Exness, or a broker mobile app.

CONTEXTUAL ANALYSIS RULES:
1. PLATFORM & INTERFACE IDENTIFICATION:
   - If TradingView: Look for chart candles, right price axis, order execution markers, position lines, or "Long Position" / "Short Position" measurement tool rectangles (green target zone on top/bottom, red risk zone, entry center line).
   - IMPORTANT FOR TRADINGVIEW: Do NOT confuse the current active market price (the pulsating price label or latest candle price on the right axis) with the trade Entry Price! The Entry Price is specified on the order horizontal line or the center divider of the Long/Short position tool.
   - If MT4 / MT5: Look for trade tickets (e.g. #1234567), Buy/Sell badges, green/red text, S/L, T/P columns, Volume/Lots (e.g. 0.01, 0.05, 0.10, 1.00), and Open/Close prices.
   - If Binance/Crypto: Look for pair name (e.g. BTCUSDT, ETHUSDT), Buy/Sell or Long/Short tags, Entry Price, Mark Price, Liq. Price.

2. OPEN VS CLOSED POSITION:
   - Check if this is an active/open position or a closed historical trade.
   - If the position is STILL OPEN or ACTIVE:
     * set "isPositionOpen": true
     * set "exitPrice": null (NEVER invent or guess an Exit Price if position is not closed!)
   - Only populate "exitPrice" if there is clear, explicit visual proof that the trade was closed (e.g. Closed PnL history, Close Price column, or closed order ticket).

3. FIELD EXTRACTION & STANDARDIZATION:
   - "asset": Standardize pair format (e.g. "XAUUSD" -> "XAU/USD", "BTCUSDT" -> "BTC/USDT", "EURUSD" -> "EUR/USD", "US30" -> "US30", "NAS100" -> "NAS100").
   - "marketType": "forex" or "crypto".
   - "direction": Lowercase "buy" or "sell".
   - "entryPrice": Floating point number of the executed or planned entry price.
   - "stopLoss": Floating point number of the Stop Loss price (null if not set or not visible).
   - "takeProfit": Floating point number of the Take Profit price (null if not set or not visible).
   - "exitPrice": Floating point number ONLY if closed; null if open or not visible.
   - "lot": Floating point number of lot or contract size (e.g. 0.03, 0.1, 1.0). Null if not visible.
   - "visiblePnl": Numerical profit or loss amount if explicitly displayed in currency/points (optional, or null).
   - "date": YYYY-MM-DD format if visible, otherwise null.
   - "time": HH:mm format if visible, otherwise null.
   - "sourcePlatform": e.g. "TradingView", "MetaTrader 5", "MetaTrader 4", "Binance", "cTrader".

4. CONFIDENCE GRADING:
   - For each field, specify one of three states:
     * "detected": Value is clearly visible and read with high certainty.
     * "confirm": Value is inferred or partially visible, user should confirm.
     * "unreadable": Value is not present, blurred, or cut off.
   - "overallConfidence": "high" (if pair, direction, and entry are crystal clear), "medium" (if some fields need confirmation), or "low" (if image is blurry, cropped, or not a trading screenshot).
   - If image quality is insufficient or blurry, set confidence to "low", do NOT fabricate numbers, and set rawNotes to "Data belum terbaca dengan yakin. Silakan periksa atau lengkapi nilai secara manual."

Return a STRICT JSON object with this exact structure:
{
  "asset": string or null,
  "marketType": "forex" | "crypto" | null,
  "direction": "buy" | "sell" | null,
  "entryPrice": number or null,
  "stopLoss": number or null,
  "takeProfit": number or null,
  "exitPrice": number or null,
  "lot": number or null,
  "isPositionOpen": boolean,
  "visiblePnl": number or null,
  "date": string or null,
  "time": string or null,
  "sourcePlatform": string or null,
  "overallConfidence": "high" | "medium" | "low",
  "fieldConfidence": {
    "asset": "detected" | "confirm" | "unreadable",
    "direction": "detected" | "confirm" | "unreadable",
    "entryPrice": "detected" | "confirm" | "unreadable",
    "stopLoss": "detected" | "confirm" | "unreadable",
    "takeProfit": "detected" | "confirm" | "unreadable",
    "exitPrice": "detected" | "confirm" | "unreadable",
    "lot": "detected" | "confirm" | "unreadable"
  },
  "rawNotes": string
}`;

    // Resilient model cascade: try preferred gemini-3.8-flash, fallback to gemini-flash-latest, then gemini-3.1-flash-lite
    const CANDIDATE_MODELS = [
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite",
    ];

    let lastError: any = null;
    let responseText = "";

    for (const modelName of CANDIDATE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
              ],
            },
          ],
          config: {
            responseMimeType: "application/json",
          },
        });

        if (response && response.text) {
          responseText = response.text;
          break; // Success!
        }
      } catch (err: any) {
        console.warn(`Model ${modelName} failed or unavailable: ${err?.message}. Trying next candidate...`);
        lastError = err;
      }
    }

    if (!responseText) {
      throw lastError || new Error("All Gemini candidate models failed to process image.");
    }
    let parsedData = {};
    try {
      parsedData = JSON.parse(responseText);
    } catch (parseErr) {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedData = JSON.parse(match[0]);
      } else {
        throw new Error("Could not parse JSON response from Gemini");
      }
    }

    res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    const rawMsg = String(error?.message || "");
    const safeErrorMsg = rawMsg.includes("API_KEY") || rawMsg.includes("key=")
      ? "Gagal menghubungi layanan OCR AI. Silakan periksa konfigurasi API."
      : rawMsg || "Gagal memproses screenshot OCR.";

    res.status(500).json({
      success: false,
      error: safeErrorMsg,
    });
  }
});

// Vite middleware & Production static serving
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
