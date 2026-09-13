import { processTradingViewWebhook } from "../src/lib/tradingviewWebhook";

// Vercel serverless function max execution time
export const maxDuration = 30;

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

    if (typeof req.on === "function" && !req.readableEnded) {
      return await new Promise((resolve) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: any) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on("end", () => {
          try {
            const raw = Buffer.concat(chunks).toString("utf-8");
            resolve(raw ? JSON.parse(raw) : {});
          } catch {
            resolve({});
          }
        });
        req.on("error", () => resolve({}));
      });
    }

    return req.body || {};
  } catch {
    return {};
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  // Only POST is accepted
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: `Method '${req.method}' not allowed. Use POST for TradingView webhook alerts.`,
    });
  }

  try {
    const body = await extractRequestBody(req);
    const headerSecret = (req.headers["x-webhook-secret"] || req.headers["x-tradingview-secret"]) as string | undefined;

    const result = await processTradingViewWebhook(body, headerSecret);
    return res.status(result.statusCode).json(result.response);
  } catch (err: any) {
    console.error("[TradingView Webhook Handler] Unhandled error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal server error processing TradingView webhook.",
    });
  }
}
