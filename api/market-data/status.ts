import { getTwelveDataDiagnosticStatus } from "../_lib/twelveData";

export const maxDuration = 30;

export default async function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const diag = await getTwelveDataDiagnosticStatus();
    return res.status(200).json({
      success: true,
      diagnostic: diag,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || String(err),
    });
  }
}
