import type { IncomingMessage, ServerResponse } from "http";
import { executeMarketMonitor } from "../_lib/marketMonitor.js";

// Vercel Serverless Function Handler
export default async function handler(
  req: IncomingMessage & { body?: any; query?: any; method?: string; headers: Record<string, string | string[] | undefined> },
  res: ServerResponse & {
    status: (code: number) => any;
    json: (body: any) => void;
    setHeader: (name: string, value: string) => void;
  }
) {
  // Enforce POST method only
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use POST.",
    });
  }

  // Enforce Authorization: Bearer <MARKET_MONITOR_SECRET>
  const configuredSecret = process.env.MARKET_MONITOR_SECRET;
  if (!configuredSecret) {
    console.error("[Monitor] Server configuration error: MARKET_MONITOR_SECRET is not configured");
    return res.status(500).json({
      ok: false,
      error: "Server configuration error: Monitor secret is missing in environment",
    });
  }

  const rawAuthHeader = req.headers["authorization"] || req.headers["Authorization"];
  const authHeader = Array.isArray(rawAuthHeader) ? rawAuthHeader[0] : rawAuthHeader;

  // Header must strictly be: "Bearer <MARKET_MONITOR_SECRET>"
  // Query parameter secrets are explicitly forbidden
  if (!authHeader || authHeader !== `Bearer ${configuredSecret}`) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
  }

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  try {
    const result = await executeMarketMonitor();
    return res.status(200).json(result);
  } catch (err: any) {
    console.error("[Monitor] Unhandled execution error:", err);
    return res.status(500).json({
      ok: false,
      error: "Internal server error during market monitoring execution",
      evaluatedAt: new Date().toISOString(),
    });
  }
}
