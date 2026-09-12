import { GoogleGenAI } from "@google/genai";

// Configure Vercel serverless function max execution time
export const maxDuration = 60;

/**
 * Safely retrieve Gemini API key from environment variables.
 * Checks GEMINI_API_KEY as primary, with fallbacks for common alternative variable names.
 */
function getSanitizedApiKey(): string {
  const rawKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY ||
    "";

  // Remove surrounding quotes and trim whitespace if present
  return rawKey.replace(/^["']|["']$/g, "").trim();
}

/**
 * Sanitize error message to prevent leaking any sensitive tokens or internal URLs.
 */
function sanitizeErrorMessage(error: any): string {
  const raw = String(error?.message || error || "Unknown error");
  return raw
    .replace(/AIza[a-zA-Z0-9_\-]{10,}/g, "[REDACTED_API_KEY]")
    .replace(/key=[^&\s]+/gi, "key=[REDACTED]")
    .slice(0, 300);
}

/**
 * Robust request body extractor compatible with Vercel Serverless Function runtimes,
 * Express, and raw Node HTTP IncomingMessage streams.
 */
async function extractRequestBody(req: any): Promise<any> {
  try {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
        return req.body;
      }
      if (typeof req.body === "string") {
        return JSON.parse(req.body);
      }
      if (Buffer.isBuffer(req.body)) {
        return JSON.parse(req.body.toString("utf-8"));
      }
    }

    // Stream fallback if req.body was not parsed by Vercel middleware
    if (typeof req.on === "function" && !req.readableEnded) {
      return await new Promise((resolve) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: any) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on("end", () => {
          try {
            const raw = Buffer.concat(chunks).toString("utf-8");
            resolve(raw ? JSON.parse(raw) : null);
          } catch {
            resolve(null);
          }
        });
        req.on("error", () => resolve(null));
      });
    }
  } catch (err: any) {
    console.error("[OCR Diagnostic] extractRequestBody exception:", sanitizeErrorMessage(err));
    return null;
  }

  return null;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Content-Type", "application/json");

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      code: "METHOD_NOT_ALLOWED",
      error: "Method not allowed. Only POST requests are supported.",
    });
  }

  // Diagnostic Log 1: Content-Type
  const contentType = req.headers?.["content-type"] || "unknown";
  console.log("[OCR Diagnostic] request content-type:", contentType);

  // Diagnostic Log 2: GEMINI_API_KEY existence (boolean only, never print key value)
  const apiKey = getSanitizedApiKey();
  const hasApiKey = Boolean(apiKey);
  console.log("[OCR Diagnostic] GEMINI_API_KEY exists (boolean):", hasApiKey);

  // Pre-Gemini Validation: API Key
  if (!hasApiKey) {
    console.warn("[OCR Diagnostic] Validation branch failed: MISSING_GEMINI_API_KEY");
    return res.status(500).json({
      success: false,
      code: "MISSING_GEMINI_API_KEY",
      error: "GEMINI_API_KEY is not configured on the server.",
    });
  }

  // Parse and validate request body
  let parsedBody: any = null;
  try {
    parsedBody = await extractRequestBody(req);
  } catch (parseErr: any) {
    const sanitized = sanitizeErrorMessage(parseErr);
    console.error("[OCR Diagnostic] Pre-Gemini error in body extraction:", {
      name: parseErr?.name || "ParseError",
      message: sanitized,
    });
    return res.status(400).json({
      success: false,
      code: "INVALID_BODY",
      error: `Gagal membaca request body: ${sanitized}`,
    });
  }

  // Diagnostic Log 3: whether req.body exists
  const hasReqBody = Boolean(parsedBody && typeof parsedBody === "object");
  console.log("[OCR Diagnostic] req.body exists:", hasReqBody);

  if (!hasReqBody) {
    console.warn("[OCR Diagnostic] Validation branch failed: INVALID_BODY");
    return res.status(400).json({
      success: false,
      code: "INVALID_BODY",
      error: "Request body kosong atau bukan JSON yang valid.",
    });
  }

  const { imageBase64, mimeType = "image/png" } = parsedBody;

  // Diagnostic Log 4: typeof imageBase64
  console.log("[OCR Diagnostic] typeof imageBase64:", typeof imageBase64);

  // Diagnostic Log 5: imageBase64 length only
  const imageBase64Length = typeof imageBase64 === "string" ? imageBase64.length : 0;
  console.log("[OCR Diagnostic] imageBase64 length only:", imageBase64Length);

  // Diagnostic Log 6: MIME type
  const safeMimeType = typeof mimeType === "string" && mimeType.startsWith("image/") ? mimeType : "image/png";
  console.log("[OCR Diagnostic] MIME type:", safeMimeType);

  if (!imageBase64 || typeof imageBase64 !== "string") {
    console.warn("[OCR Diagnostic] Validation branch failed: INVALID_IMAGE (missing or not string)");
    return res.status(400).json({
      success: false,
      code: "INVALID_IMAGE",
      error: "Gambar tidak ditemukan (imageBase64 required).",
    });
  }

  // Guard against oversized payloads (Vercel payload hard ceiling is 4.5MB)
  if (imageBase64Length > 5 * 1024 * 1024) {
    console.warn("[OCR Diagnostic] Validation branch failed: PAYLOAD_TOO_LARGE (exceeds 5MB)");
    return res.status(413).json({
      success: false,
      code: "PAYLOAD_TOO_LARGE",
      error: "Ukuran gambar terlalu besar. Maksimum ukuran gambar adalah 4MB.",
    });
  }

  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z0-9-+.]+;base64,/, "");
  if (!cleanBase64) {
    console.warn("[OCR Diagnostic] Validation branch failed: INVALID_IMAGE (empty clean base64)");
    return res.status(400).json({
      success: false,
      code: "INVALID_IMAGE",
      error: "Format base64 gambar tidak valid.",
    });
  }

  // Initialize GoogleGenAI SDK safely
  let ai: GoogleGenAI;
  try {
    ai = new GoogleGenAI({ apiKey });
  } catch (initErr: any) {
    const sanitizedMsg = sanitizeErrorMessage(initErr);
    console.error("[OCR Diagnostic] Validation branch failed: GEMINI_INIT_FAILED", {
      name: initErr?.name || "InitError",
      message: sanitizedMsg,
    });
    return res.status(500).json({
      success: false,
      code: "GEMINI_INIT_FAILED",
      error: `Inisialisasi Gemini SDK gagal: ${sanitizedMsg}`,
    });
  }

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

  // Valid Gemini model candidates from @google/genai SDK specification
  const CANDIDATE_MODELS = [
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-3.1-flash-lite",
  ];

  let lastError: any = null;
  let responseText = "";

  console.log("[OCR Diagnostic] Gemini reached. Beginning model invocation loop...");

  for (const modelName of CANDIDATE_MODELS) {
    try {
      console.log(`[OCR Diagnostic] Invoking model: ${modelName}`);
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
        console.log(`[OCR Diagnostic] Model ${modelName} succeeded.`);
        break;
      }
    } catch (err: any) {
      const sanitized = sanitizeErrorMessage(err);
      console.warn(`[OCR Diagnostic] Model ${modelName} error: ${sanitized}. Trying next candidate...`);
      lastError = err;
    }
  }

  if (!responseText) {
    const sanitizedError = sanitizeErrorMessage(lastError);
    console.error("[OCR Diagnostic] All Gemini candidate models failed:", sanitizedError);
    return res.status(502).json({
      success: false,
      code: "GEMINI_REQUEST_FAILED",
      error: `Gagal memproses gambar dengan model AI: ${sanitizedError}`,
    });
  }

  let parsedData = {};
  try {
    parsedData = JSON.parse(responseText);
  } catch {
    const match = responseText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsedData = JSON.parse(match[0]);
      } catch (nestedErr: any) {
        console.error("[OCR Diagnostic] Response parsing failed: RESPONSE_PARSE_FAILED");
        return res.status(502).json({
          success: false,
          code: "RESPONSE_PARSE_FAILED",
          error: "Gagal membaca struktur JSON yang dihasilkan oleh AI.",
        });
      }
    } else {
      console.error("[OCR Diagnostic] Response parsing failed: RESPONSE_PARSE_FAILED (no JSON block found)");
      return res.status(502).json({
        success: false,
        code: "RESPONSE_PARSE_FAILED",
        error: "Respons AI tidak mengandung format JSON yang dapat dibaca.",
      });
    }
  }

  return res.status(200).json({
    success: true,
    data: parsedData,
  });
}

