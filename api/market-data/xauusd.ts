import { getXauusdMarketData, getTwelveDataDiagnosticStatus } from "../_lib/twelveData";

export const maxDuration = 30;

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  // Support GET and HEAD
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({
      success: false,
      error: `Method '${req.method}' not allowed. Use GET to retrieve market data.`,
    });
  }

  // Diagnostic mode if query contains ?diagnostic=true
  if (req.query?.diagnostic === "true" || req.query?.status === "true") {
    const status = await getTwelveDataDiagnosticStatus();
    return res.status(200).json({
      success: true,
      diagnostic: status,
    });
  }

  try {
    const force = req.query?.force === "true" || req.query?.refresh === "true";
    const result = await getXauusdMarketData({ force });

    const statusCode = result.success ? 200 : result.status === "missing_api_key" ? 200 : 502;
    return res.status(statusCode).json(result);
  } catch (err: any) {
    console.error("[API market-data/xauusd] Uncaught handler error:", err);
    return res.status(500).json({
      success: false,
      source: "none",
      status: "error",
      error: err?.message || "Internal server error fetching market data.",
    });
  }
}
