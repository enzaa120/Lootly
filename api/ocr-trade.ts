import { GoogleGenAI } from "@google/genai";

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

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed. Only POST requests are supported." });
  }

  try {
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ success: false, error: "Invalid JSON request body." });
    }

    const { imageBase64, mimeType = "image/png" } = req.body;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({ success: false, error: "Gambar tidak ditemukan (imageBase64 required)." });
    }

    // Guard against oversized payloads (Vercel maximum body size is 4.5MB)
    if (imageBase64.length > 7 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        error: "Ukuran gambar terlalu besar. Maksimum ukuran gambar adalah 5MB.",
      });
    }

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

    const CANDIDATE_MODELS = [
      "gemini-3.6-flash",
      "gemini-3.8-flash",
      "gemini-flash-latest"
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
                    mimeType: safeMimeType,
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
          break;
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!responseText) {
      throw lastError || new Error("Semua model AI gagal memproses screenshot ini.");
    }

    let parsedData = {};
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedData = JSON.parse(match[0]);
      } else {
        throw new Error("Could not parse JSON response from Gemini");
      }
    }

    return res.status(200).json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    // Sanitize error message to prevent secret or raw URL exposure
    const rawMsg = String(error?.message || "");
    const safeErrorMsg = rawMsg.includes("API_KEY") || rawMsg.includes("key=")
      ? "Gagal menghubungi layanan OCR AI. Silakan periksa konfigurasi API."
      : rawMsg || "Gagal memproses screenshot OCR.";

    return res.status(500).json({
      success: false,
      error: safeErrorMsg,
    });
  }
}
