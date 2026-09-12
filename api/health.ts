export default function handler(req: any, res: any) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  return res.status(200).json({
    status: "ok",
    app: "Lootly Trading Journal",
    timestamp: new Date().toISOString()
  });
}

