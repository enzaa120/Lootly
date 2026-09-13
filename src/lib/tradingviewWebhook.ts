import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, Firestore } from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import { SupportedDeskTimeframe, TradingDeskSession, MarketSnapshot } from "../types";

// Database ID: strictly connect to the configured named database
const FIRESTORE_DATABASE_ID =
  firebaseConfig.firestoreDatabaseId || "ai-studio-lootly-57005d49-edb2-43f4-9ea3-f71b1b106f8e";

// Lazy Firestore client for server / backend runtime
let backendDbInstance: Firestore | null = null;

function getBackendFirestore(): Firestore {
  if (!backendDbInstance) {
    const app =
      getApps().length === 0
        ? initializeApp({
            apiKey: firebaseConfig.apiKey,
            authDomain: firebaseConfig.authDomain,
            projectId: firebaseConfig.projectId,
            storageBucket: firebaseConfig.storageBucket,
            messagingSenderId: firebaseConfig.messagingSenderId,
            appId: firebaseConfig.appId,
          })
        : getApp();

    backendDbInstance = getFirestore(app, FIRESTORE_DATABASE_ID);
  }
  return backendDbInstance;
}

/**
 * Normalize and validate supported timeframes.
 * Supports: H1 (or 60), M15 (or 15), M5 (or 5)
 */
export function normalizeTimeframe(tf: any): SupportedDeskTimeframe | null {
  if (tf === undefined || tf === null) return null;
  const str = String(tf).trim().toUpperCase();
  if (str === "H1" || str === "60" || str === "1H") return "H1";
  if (str === "M15" || str === "15" || str === "15M") return "M15";
  if (str === "M5" || str === "5" || str === "5M") return "M5";
  return null;
}

/**
 * Infer trading session from UTC hour if not explicitly provided
 */
export function inferSession(timestampMs: number): TradingDeskSession {
  const date = new Date(timestampMs);
  const hourUtc = date.getUTCHours();
  if (hourUtc >= 0 && hourUtc < 8) return "asia";
  if (hourUtc >= 8 && hourUtc < 13) return "london";
  if (hourUtc >= 13 && hourUtc < 17) return "overlap";
  if (hourUtc >= 17 && hourUtc < 22) return "newyork";
  return "asia";
}

export interface WebhookProcessResult {
  statusCode: number;
  response: {
    success: boolean;
    error?: string;
    message?: string;
    data?: {
      symbol: string;
      timeframe: SupportedDeskTimeframe;
      close: number;
      timestamp: number;
      receivedAt: string;
    };
  };
}

/**
 * Process incoming TradingView webhook payload.
 * Pure logic shared between Express server (dev/container) and Vercel serverless function.
 */
export async function processTradingViewWebhook(
  body: any,
  headerSecret?: string
): Promise<WebhookProcessResult> {
  // 1. Security Check: verify TRADINGVIEW_WEBHOOK_SECRET
  const serverSecret = (process.env.TRADINGVIEW_WEBHOOK_SECRET || "").trim();

  // Guard against missing server configuration
  if (!serverSecret) {
    console.error("[TradingView Webhook] TRADINGVIEW_WEBHOOK_SECRET is not configured on server.");
    return {
      statusCode: 401,
      response: {
        success: false,
        error: "Unauthorized: Webhook secret is not configured on the server.",
      },
    };
  }

  const incomingSecret =
    typeof body?.secret === "string"
      ? body.secret.trim()
      : typeof headerSecret === "string"
      ? headerSecret.trim()
      : "";

  // Safe constant-time or direct equality check without logging the actual secret
  if (!incomingSecret || incomingSecret !== serverSecret) {
    console.warn("[TradingView Webhook] Invalid or missing secret attempt rejected.");
    return {
      statusCode: 401,
      response: {
        success: false,
        error: "Unauthorized: Invalid or missing webhook secret.",
      },
    };
  }

  // 2. Validate payload presence
  if (!body || typeof body !== "object") {
    return {
      statusCode: 400,
      response: {
        success: false,
        error: "Malformed request: Body must be a valid JSON object.",
      },
    };
  }

  // 3. Validate Symbol
  if (!body.symbol || typeof body.symbol !== "string" || !body.symbol.trim()) {
    return {
      statusCode: 400,
      response: {
        success: false,
        error: "Validation failed: 'symbol' is required (e.g. 'XAUUSD').",
      },
    };
  }
  // Sanitize symbol (strip slashes/spaces, uppercase)
  const symbol = body.symbol.replace(/[\s/]/g, "").toUpperCase();

  // 4. Validate Timeframe
  const timeframe = normalizeTimeframe(body.timeframe);
  if (!timeframe) {
    return {
      statusCode: 400,
      response: {
        success: false,
        error: `Validation failed: Unsupported timeframe '${body.timeframe}'. Must be H1 (60), M15 (15), or M5 (5).`,
      },
    };
  }

  // 5. Validate OHLC numbers
  const open = Number(body.open);
  const high = Number(body.high);
  const low = Number(body.low);
  const close = Number(body.close);

  if (
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return {
      statusCode: 400,
      response: {
        success: false,
        error: "Validation failed: OHLC values (open, high, low, close) must be valid finite numbers.",
      },
    };
  }

  if (high < low) {
    return {
      statusCode: 400,
      response: {
        success: false,
        error: `Validation failed: High (${high}) cannot be less than low (${low}).`,
      },
    };
  }

  // Volume: default to 0 if not provided or NaN
  const volume = Number.isFinite(Number(body.volume)) ? Number(body.volume) : 0;

  // 6. Validate & Normalize Timestamp
  let rawTs = Number(body.timestamp);
  let timestampMs = Date.now();
  if (Number.isFinite(rawTs) && rawTs > 0) {
    // If sent in seconds (e.g. 10 digits < 1e11), convert to milliseconds
    timestampMs = rawTs < 100000000000 ? Math.round(rawTs * 1000) : Math.round(rawTs);
  }

  // 7. Session
  const session: TradingDeskSession =
    typeof body.session === "string" && body.session.trim()
      ? (body.session.trim().toLowerCase() as TradingDeskSession)
      : inferSession(timestampMs);

  const receivedAt = new Date().toISOString();

  // Construct structured market snapshot
  const snapshot: MarketSnapshot = {
    symbol,
    timeframe,
    open,
    high,
    low,
    close,
    volume,
    timestamp: timestampMs,
    session,
    receivedAt,
  };

  // 8. Persist to Firestore
  try {
    const db = getBackendFirestore();

    // A. Latest snapshot for symbol/timeframe
    const timeframeDocRef = doc(db, "marketData", symbol, "timeframes", timeframe);
    await setDoc(timeframeDocRef, snapshot, { merge: true });

    // B. Root metadata document for symbol
    const symbolDocRef = doc(db, "marketData", symbol);
    await setDoc(
      symbolDocRef,
      {
        symbol,
        lastUpdated: receivedAt,
        lastTimeframe: timeframe,
        lastPrice: close,
        activeSession: session,
      },
      { merge: true }
    );

    // C. Rolling candle history item
    const candleItemRef = doc(
      db,
      "marketData",
      symbol,
      "candles",
      timeframe,
      "items",
      String(timestampMs)
    );
    await setDoc(candleItemRef, snapshot, { merge: true });

    console.info(
      `[TradingView Webhook] Successfully stored snapshot for ${symbol} [${timeframe}] Close=${close} at ${receivedAt}`
    );

    return {
      statusCode: 200,
      response: {
        success: true,
        message: `Market data snapshot for ${symbol} [${timeframe}] stored successfully.`,
        data: {
          symbol,
          timeframe,
          close,
          timestamp: timestampMs,
          receivedAt,
        },
      },
    };
  } catch (err: any) {
    console.error("[TradingView Webhook] Firestore error while saving snapshot:", err);
    return {
      statusCode: 500,
      response: {
        success: false,
        error: "Failed to persist market snapshot to database.",
      },
    };
  }
}
